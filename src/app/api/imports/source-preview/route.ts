/**
 * `POST /api/imports/source-preview` — the first of the import's two round trips.
 *
 * ## Why it exists
 *
 * oEmbed returns in under a second; the model call behind `/api/imports/probe` measured **7–34s**.
 * Those two facts were inside one request, so for the whole of that wait the screen could say
 * nothing true about the post the user had just pasted — it had it, and could not show it. This
 * route is the sub-second half, split out so the rail can put the thumbnail, the `@handle` and the
 * caption on screen while extraction runs underneath.
 *
 * **It is still request/response. There is no stream here and this route is not `L0-F6`.**
 * `overnight-run-plan.md` §9 leaves the streaming route explicitly unfunded and it stays a real
 * feature on the plan of record; `facelift-plan.md` §4 decision 4 is the rule this obeys — *the
 * facelift may not ship a more convincing fake*. Two honest round trips is the entire design, and
 * the thing it buys is that `source: done` is now reported when the fetch **resolves** rather than
 * when it is issued. The rail's old "honest approximation" is deleted with this, not kept
 * alongside it.
 *
 * ## What it deliberately does not do
 *
 * No `start_import`, no `extractions` row, no `PlaceExtractor`, no `PlaceResolver`. `/api/imports/
 * probe` remains the single writer of the import's bookkeeping and the sole authority on whether an
 * import succeeded. This route reads a post and says what is in it.
 *
 * **A failure here is silent by design.** The client fires this, then the probe, and shows the
 * probe's verdict whatever this one said — so there is exactly one path to a failure screen and no
 * way for the two responses to disagree on screen about what went wrong. The cost of a definitive
 * failure is not a 30-second wait either: the probe fails at its own source stage, before any model
 * call, with the same code.
 *
 * ## One oEmbed call, not two — measured, not assumed
 *
 * `oembedSourceAdapter.fetch` is cache-through against `public.sources`, keyed on
 * `platform_source_id` (its own header, and `readCachedRow` returns any `fetch_status = 'ok'` row
 * with **zero** network calls). So the probe's own `source.fetch` for the same video is a database
 * read. That is only true because the client issues the two requests **in sequence** — the preview
 * first, the probe once it answers. Issued in parallel they would both miss the cold cache and both
 * hit TikTok, doubling the per-import upstream cost for no latency gain, because the total is
 * bounded by the model call either way.
 *
 * ## The rest is the probe route's shape, on purpose
 *
 * Same auth (the belt-and-suspenders `getUser()`, required because this holds a service-role client
 * that bypasses RLS), the same server-side `canonicaliseTikTokUrl` re-check (the SSRF-relevant
 * allow-list only means anything on the server about to make the call), the same
 * `{ error: { code, retryable } }` envelope, the same fourteen `DomainErrorCode`s and the same
 * status map. **No new error code**, so `domain/errors.ts` and `ui/import/import-error-copy.ts` are
 * untouched and no UI contract changes.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { oembedSourceAdapter } from '@/integrations/tiktok/oembed-source-adapter';
import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { DomainError, internal, malformedUrl, notAuthenticated } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import {
  httpStatusFor,
  importFailureLogLine,
  logSeverityFor,
  type ImportFailureStage,
} from '@/app/api/imports/_lib/error-reporting';

/**
 * Codes and counts only, never a caption or a coordinate (charter R9). Same shape as the probe
 * route's, minus the resolver lines it has no resolver to emit.
 */
function routeCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: {
      event: (name, fields) => {
        console.info(JSON.stringify({ event: name, ...fields }));
      },
    },
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let videoId: string | null = null;
  let stage: ImportFailureStage = 'request';

  const fail = (error: DomainError, aborted = false): NextResponse => {
    const line = JSON.stringify(
      importFailureLogLine({ error, importId: null, videoId, stage, ms: Date.now() - startedAt, aborted }),
    );
    // Same severity split as the probe route: 5xx pages a human, 4xx does not, and an abort is
    // never an alarm whatever the aborted work raised on its way out.
    if (!aborted && logSeverityFor(error.code) === 'error') console.error(line);
    else console.warn(line);
    return NextResponse.json({ error: error.toView() }, { status: httpStatusFor(error.code) });
  };

  if (!user) return fail(notAuthenticated());

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    return fail(malformedUrl('request body was not valid JSON', e));
  }

  const url =
    typeof body === 'object' && body !== null && 'url' in body && typeof (body as { url: unknown }).url === 'string'
      ? (body as { url: string }).url
      : null;
  if (url === null) return fail(malformedUrl('request body had no "url" string'));

  const canonicalised = canonicaliseTikTokUrl(url);
  if (!canonicalised.ok) return fail(canonicalised.error);

  const ctx = routeCtx(req.signal);
  const db = serviceRoleClient();
  const source = oembedSourceAdapter(db);

  try {
    stage = 'source';
    const externalId =
      canonicalised.value.kind === 'video'
        ? canonicalised.value.externalId
        : (await source.resolveShortLink(canonicalised.value, ctx)).externalId;
    videoId = externalId;

    const raw = await source.fetch(externalId, ctx);
    const parts = await captionContentExtractor.extract(raw, ctx);
    const caption = parts.find((p) => p.kind === 'caption')?.text ?? null;

    // Exactly `SourcePreview` (`app/import/_lib/probe-contract.ts`), which `ProbeSuccess` extends —
    // so the two responses are provably the same fields and the rail cannot be handed a shape the
    // review screen would not recognise.
    return NextResponse.json({
      sourceId: raw.id,
      authorHandle: raw.authorHandle,
      authorName: raw.authorName,
      canonicalUrl: raw.canonicalUrl,
      thumbnailUrl: raw.thumbnailUrl,
      caption,
    });
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal('unhandled exception in source-preview route', e);
    return fail(domainError, req.signal.aborted);
  }
}
