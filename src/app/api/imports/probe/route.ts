/**
 * `POST /api/imports/probe` — a throwaway demo route, **not** the real `POST /api/imports`
 * (L0-F6-T1). It exists only to prove the real oEmbed `SourceAdapter` + caption
 * `ContentExtractor` (L0-F4-T1) **and now the real `PlaceExtractor` + plausibility gate**
 * (L0-F4-T2) reach the `/import` UI: still no `runImport`, no `PlaceResolver`, no `ImportStore`,
 * no NDJSON stream, no idempotency, no retries. It is a request/response JSON endpoint, never a
 * stream.
 *
 * It does now **write**, and that is the point of the current change. Two rows that were being
 * left behind on every real import:
 *
 *  - `extractions`. The table, its `(source_id, model, prompt_version)` cache key and its
 *    `candidates jsonb` column all existed and had **zero writers** — verified as 0 rows on the
 *    live local database after three real imports. Persisting the extraction is what makes the
 *    confirm seam able to derive place facts server-side instead of trusting the browser
 *    (`domain/import/candidate-place.ts` has the confirmed exploit this closes), and it is also
 *    the re-paste cache: "no places found" is the modal outcome, re-pasting is the natural retry,
 *    and every retry used to pay the model again.
 *  - `imports`. `start_import` created the row and nothing ever updated it, so every real import
 *    sat at `status='processing'`, `stage='source'`, with null `prompt_version`, null `ms_*` and
 *    null `candidates`, until `expires_at` swept it. The row now advances to `review`/`no_places`
 *    with its timings and versions recorded, and `/api/imports/confirm` closes it out.
 *
 * Both writes are best-effort with respect to the response: a persistence failure is logged into
 * the response as a `degraded` marker rather than turned into a user-facing error, because the
 * caption and candidates in hand are still worth showing. What it must never do is claim
 * persistence that did not happen — a caller with no `extractionId` cannot confirm, and the UI
 * says so.
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
import { createHash } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
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

/** `start_import`'s row shape (`supabase/migrations/0007_functions.sql`), which this route needs
 *  the id from so it can advance the row it opened. */
interface StartImportRow {
  readonly import_id: string;
  readonly import_source_id: string;
  readonly import_status: string;
  readonly is_idempotent: boolean;
}

function noopCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: { event: () => {} },
  };
}

/**
 * Writes (or refreshes) the `extractions` row for this source + model + prompt version.
 *
 * `extractions_version_unique (source_id, model, prompt_version)` is the cache key `08` §3.4
 * designed, so this is an upsert on that key rather than an insert: re-pasting the same link under
 * the same prompt version updates one row instead of failing, and bumping `PROMPT_VERSION` leaves
 * the old row intact for the `09` §8 A/B comparison exactly as intended.
 *
 * Returns `null`, never throws, in two distinct cases the caller must not conflate with success:
 *  - there was no extraction to record (no caption, so no model call and no `model`/`prompt_version`
 *    to satisfy those `not null` columns); or
 *  - the write failed. A failed write must not fail the request — the caption and candidates in
 *    hand are still worth showing — but it does mean no save can be confirmed, and the caller
 *    reports `extractionId: null` so the UI stays honest about that.
 */
async function persistExtraction(
  db: SupabaseClient,
  input: {
    readonly sourceId: string;
    readonly extractorVersion: string | null;
    readonly promptVersion: string | null;
    readonly caption: string | null;
    readonly candidates: readonly PlaceCandidate[];
    readonly latencyMs: number | null;
  },
): Promise<string | null> {
  if (input.extractorVersion === null || input.promptVersion === null) return null;

  const { data, error } = await db
    .from('extractions')
    .upsert(
      {
        source_id: input.sourceId,
        model: input.extractorVersion,
        prompt_version: input.promptVersion,
        status: 'ok',
        // `extractions_ok_has_candidates` requires this to be non-null when status is 'ok'. An
        // empty array is the correct value for a caption that named no place — the modal outcome,
        // and a cache hit worth having.
        candidates: input.candidates,
        candidate_count: input.candidates.length,
        // Lets a later read tell "same post, same prompt, different caption" (an edited caption)
        // from a genuine cache hit, without storing the caption twice — `sources.content_text`
        // already holds it.
        input_hash:
          input.caption === null
            ? null
            : createHash('sha256').update(input.caption, 'utf8').digest('hex'),
        latency_ms: input.latencyMs,
      },
      { onConflict: 'source_id,model,prompt_version' },
    )
    .select('id')
    .single();

  if (error !== null || data === null) return null;
  return data.id as string;
}

/**
 * Moves the `imports` row this request opened off `processing`.
 *
 * Before this, `start_import` created the row and nothing ever wrote to it again: every real
 * import sat at `status='processing'`, `stage='source'` with null timings and null versions until
 * `expires_at` swept it, which made `imports` useless for resumption, for idempotency and for any
 * "recent imports" surface. The terminal state here is deliberately **not** `completed`:
 * extraction finishing is not the import finishing — the user still has to confirm — so this
 * lands on `review` (candidates to look at) or `no_places` (none), and
 * `/api/imports/confirm` is what writes `completed`.
 *
 * Best-effort: a failed bookkeeping write must not fail an otherwise-good import.
 */
async function advanceImport(
  db: SupabaseClient,
  importId: string,
  input: {
    readonly candidateCount: number;
    readonly extractorVersion: string | null;
    readonly promptVersion: string | null;
    readonly msSource: number;
    readonly msExtract: number | null;
    readonly candidates: readonly PlaceCandidate[];
  },
): Promise<void> {
  await db
    .from('imports')
    .update({
      status: input.candidateCount > 0 ? 'review' : 'no_places',
      // `imports_stage_check` allows source/extract/resolve/done. This path genuinely stops after
      // extraction — there is no resolver on it — so `extract` is the truthful stage, and claiming
      // `done` here would misreport a pending confirmation as a finished import.
      stage: 'extract',
      extractor_version: input.extractorVersion,
      prompt_version: input.promptVersion,
      ms_source: input.msSource,
      ms_extract: input.msExtract,
      candidates: input.candidates,
    })
    .eq('id', importId);
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
    const { data: startRows, error: startImportError } = await db.rpc('start_import', {
      p_user_id: user.id,
      p_platform: 'tiktok',
      p_platform_source_id: externalId,
      p_canonical_url: canonicalUrlFor(externalId),
    });
    if (startImportError) {
      throw internal('start_import failed', startImportError);
    }
    // `start_import` is `returns table (...)`, so PostgREST hands back an array. The id is needed
    // here (it never was before, and the row was simply abandoned as a result) so this route can
    // advance the row it just opened.
    const startRow = (startRows as readonly StartImportRow[] | null)?.[0] ?? null;
    if (startRow === null) {
      throw internal('start_import returned no row');
    }

    const sourceStartedAt = Date.now();
    const raw = await source.fetch(externalId, ctx);
    const parts = await captionContentExtractor.extract(raw, ctx);
    const caption = parts.find((p) => p.kind === 'caption')?.text ?? null;
    const msSource = Date.now() - sourceStartedAt;

    // No caption at all: never call the LLM on nothing (07 §5.2's "no caption" pre-check).
    let candidates: readonly PlaceCandidate[] = [];
    let extractorVersion: string | null = null;
    let promptVersion: string | null = null;
    let msExtract: number | null = null;

    if (caption !== null) {
      const extractor = createPlaceExtractor({
        ...(process.env.LLM_PROVIDER !== undefined ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {}),
        ...(process.env.ANTHROPIC_API_KEY !== undefined ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
        ...(process.env.ANTHROPIC_MODEL !== undefined ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
        ...(process.env.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
        ...(process.env.GEMINI_MODEL !== undefined ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {}),
      });
      extractorVersion = extractor.version;
      promptVersion = extractor.promptVersion;

      const extractStartedAt = Date.now();
      const extracted = await extractor.extract(parts, ctx);
      msExtract = Date.now() - extractStartedAt;
      candidates = filterPlausible(extracted.candidates, caption).kept;
    }

    // Persist the extraction, then advance the import row. Both are `await`ed rather than
    // fire-and-forget: `extractionId` is load-bearing for the confirm step, so the response must
    // reflect whether the write actually happened.
    const extractionId = await persistExtraction(db, {
      sourceId: raw.id,
      extractorVersion,
      promptVersion,
      caption,
      candidates,
      latencyMs: msExtract,
    });

    await advanceImport(db, startRow.import_id, {
      candidateCount: candidates.length,
      extractorVersion,
      promptVersion,
      msSource,
      msExtract,
      candidates,
    });

    return NextResponse.json({
      sourceId: raw.id,
      /** Null only when persisting the extraction failed; the client must not offer a save then. */
      extractionId,
      importId: startRow.import_id,
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
