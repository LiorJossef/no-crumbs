/**
 * `POST /api/imports/probe` — a throwaway demo route, **not** the real `POST /api/imports`
 * (L0-F6-T1). It exists only to prove the real oEmbed `SourceAdapter` + caption
 * `ContentExtractor` (L0-F4-T1) **and now the real `PlaceExtractor` + plausibility gate**
 * (L0-F4-T2) reach the `/import` UI: still no `runImport`, no `PlaceResolver`, no `ImportStore`,
 * no NDJSON stream, no idempotency, no retries, no writes. It is a request/response JSON
 * endpoint, never a stream.
 *
 * Auth: same belt-and-suspenders `getUser()` check as `src/app/import/page.tsx` — required here
 * because this route holds a service-role Supabase client (`serviceRoleClient()`), which bypasses
 * RLS. No session, no service-role client touched, full stop.
 *
 * Input handling: `canonicaliseTikTokUrl` is re-run **server-side** even though the client
 * already validated the pasted string — defence in depth, and the actual SSRF-relevant
 * allow-list re-check (`04` §2/§7) only means anything if it happens on the server that is about
 * to make the network call, not in the browser that could be tampered with.
 *
 * Extraction: `createPlaceExtractor(process.env)` (the composition-root factory, `02`'s
 * dev-local-model / prod-hosted-model split) is called only when a non-null caption exists — no
 * LLM call on nothing. Its raw candidates are run straight through `filterPlausible` (the same
 * gate `runImport` will apply, `09` §5.2/D4) before this route ever hands them to the client; the
 * ordering is a single straight-line `await` chain here, not the full event-sequence machinery
 * `runImport` owns.
 *
 * Latency: a real local Ollama call measured 7–34s on CPU in prior testing. This is a dev-only
 * route with no `maxDuration` export — Vercel's serverless function timeout is a *deploy*
 * concern, and this route is never meant to reach a deployed environment; `next dev` itself has
 * no request timeout, so no config change is needed to let a slow local call simply take as long
 * as it takes.
 *
 * Output: either the caption/author/canonical-url/thumbnail/candidates this task needs, or a
 * `DomainErrorView` (`domain/errors.ts`'s `toView()`) — never a raw exception, stack trace or
 * vendor error string. `INTERNAL` is the floor for anything unmapped. A thrown `DomainError` from
 * the extractor itself (`EXTRACTOR_UNAVAILABLE`, `EXTRACTOR_INVALID_OUTPUT`) is handled by the
 * exact same catch block as a source-adapter failure — one error shape, one honest path, whatever
 * stage threw it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { oembedSourceAdapter, canonicalUrlFor } from '@/integrations/tiktok/oembed-source-adapter';
import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { filterPlausible } from '@/domain/extraction/plausibility';
import { DomainError, internal, notAuthenticated } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import type { PlaceCandidate } from '@/domain/types';

function noopCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: { event: () => {} },
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: notAuthenticated().toView() }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: internal('Invalid JSON body', e).toView() }, { status: 400 });
  }

  const url =
    typeof body === 'object' && body !== null && 'url' in body && typeof (body as { url: unknown }).url === 'string'
      ? (body as { url: string }).url
      : null;

  if (url === null) {
    return NextResponse.json({ error: internal('Missing url').toView() }, { status: 400 });
  }

  // Server-side re-validation — the SSRF-relevant allow-list check (04 §2/§7). Never trust the
  // client's own canonicalisation for the network hop this route is about to make.
  const canonicalised = canonicaliseTikTokUrl(url);
  if (!canonicalised.ok) {
    return NextResponse.json(
      { error: canonicalised.error.toView() },
      { status: 422 },
    );
  }

  const ctx = noopCtx(req.signal);
  const db = serviceRoleClient();
  const source = oembedSourceAdapter(db);

  try {
    const externalId =
      canonicalised.value.kind === 'video'
        ? canonicalised.value.externalId
        : (await source.resolveShortLink(canonicalised.value, ctx)).externalId;

    // `save_place`'s own RLS boundary (`sps_insert_own`, 0006) requires a matching `imports` row
    // before it will let this user's session attach a source to a saved place — "the source must
    // be one this user actually imported: no borrowing provenance". `start_import` (0007, B7) is
    // the only way such a row is created. The real streaming route (L0-F6-T1) will call it as
    // stage A; this throwaway probe route stops after extraction and never did, so every real
    // save through `/api/imports/confirm` with a non-null `sourceId` unconditionally failed
    // `sps_insert_own`'s WITH CHECK with a masked `INTERNAL` — this call is what makes the probe
    // path's provenance real instead of borrowed, matching what the finished pipeline will do.
    const { error: startImportError } = await db.rpc('start_import', {
      p_user_id: user.id,
      p_platform: 'tiktok',
      p_platform_source_id: externalId,
      p_canonical_url: canonicalUrlFor(externalId),
    });
    if (startImportError) {
      throw internal('start_import failed', startImportError);
    }

    const raw = await source.fetch(externalId, ctx);
    const parts = await captionContentExtractor.extract(raw, ctx);
    const caption = parts.find((p) => p.kind === 'caption')?.text ?? null;

    // No caption at all: never call the LLM on nothing (07 §5.2's "no caption" pre-check).
    let candidates: readonly PlaceCandidate[] = [];
    if (caption !== null) {
      const extractor = createPlaceExtractor({
        ...(process.env.LLM_PROVIDER !== undefined ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {}),
        ...(process.env.ANTHROPIC_API_KEY !== undefined ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
        ...(process.env.ANTHROPIC_MODEL !== undefined ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
        ...(process.env.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
        ...(process.env.GEMINI_MODEL !== undefined ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {}),
      });
      const extracted = await extractor.extract(parts, ctx);
      candidates = filterPlausible(extracted.candidates, caption).kept;
    }

    return NextResponse.json({
      sourceId: raw.id,
      authorHandle: raw.authorHandle,
      authorName: raw.authorName,
      canonicalUrl: raw.canonicalUrl,
      thumbnailUrl: raw.thumbnailUrl,
      caption,
      candidates,
    });
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal(String(e), e);
    return NextResponse.json({ error: domainError.toView() }, { status: 502 });
  }
}
