/**
 * `POST /api/imports/probe` — a throwaway demo route, **not** the real `POST /api/imports`
 * (L0-F6-T1). It exists only to prove the real oEmbed `SourceAdapter` + caption
 * `ContentExtractor` (L0-F4-T1), the real `PlaceExtractor` + plausibility gate (L0-F4-T2)
 * **and now the real `PlaceResolver`** (TLV-RESOLVE-T3) reach the `/import` UI: still no
 * `runImport`, no `ImportStore`, no NDJSON stream, no idempotency, no retries. It is a
 * request/response JSON endpoint, never a stream.
 *
 * **Resolution is the current change, and it is the difference between a product and a demo.**
 * Until now every coordinate this route led to was the model's own guess — measured 65–470 m out,
 * and 541 m apart between two runs of the same caption. Each in-budget candidate is now put to
 * the `PlaceResolver` that `place-resolver-factory.ts` selects for this environment, and the
 * shortlist is written into the same `extractions.candidates` array the confirm step already
 * reads. Measured for the mention "HaKosem": 11 m from the real venue.
 *
 * **Which provider answers is config, not code** (owner ruling, 2026-08-28): Google Places where
 * we develop and measure, the Overture `poi_index` in production until the map renderer moves.
 * The factory's header carries the terms-of-service reason that gate exists.
 *
 * The shortlist is stored rather than returned-and-resent for the reason
 * `domain/import/candidate-place.ts`'s header gives at length: the browser may say *which*
 * candidate and *which* option, never *what* they are. `authenticated` holds `SELECT` and nothing
 * else on `extractions`, so a resolution record in that column can only have been written here.
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
 * dev-local-model / prod-hosted-model split) is called only when some `ContentPart` carried text —
 * no LLM call on nothing. Its raw candidates are run straight through `filterPlausible` (the same
 * gate `runImport` will apply, `09` §5.2/D4) before this route ever hands them to the client; the
 * ordering is a single straight-line `await` chain here, not the full event-sequence machinery
 * `runImport` owns.
 *
 * **Content is an array of extractors now** (L0-TRANSCRIPT-T6), which is the difference between a
 * built feature and a running one. Media acquisition, the MP4 demuxer, the Gemini transcriber and
 * the transcript `ContentExtractor` were all written, tested and unreachable: `RawSource.media` was
 * always `[]`, so `supports` was always false. This route attaches the acquired ref between the
 * source fetch and the extractors, and runs caption-then-transcript in that order because the
 * extraction cache is keyed on it. Both halves are off by default — `TIKTOK_MEDIA_ACQUISITION=on`
 * gates the page fetch, `IMPORT_TRANSCRIPTION=on` gates paying a model for the audio — and with
 * either one off this route behaves exactly as it did before. A transcript is **additive**: no
 * media, a failed download, an unparseable file, a rate-limited model and an open circuit breaker
 * all leave the import running on the caption, because it must never cost a user the places their
 * caption would have found.
 *
 * One cost this buys and does not yet solve: the extraction cache is keyed on the parts, so the key
 * cannot be computed until the transcript exists — a re-paste of the same post pays a fresh
 * transcription call and then reads the cached extraction. Caching the transcript itself needs
 * somewhere to put it (a `sources` column, or a `content_parts` row), which is a migration, and
 * this task owns none.
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
 *
 * Failure handling (`current-state.md` §3.5, fixed here). What the payload carries is unchanged —
 * a code and two booleans — but three things around it were dishonest and are not any more:
 *
 *  - **The code.** A malformed body and a missing `url` were reported as `INTERNAL,
 *    retryable: true`: our bug, and a promise that retrying the identical bad request might work.
 *    They are `MALFORMED_URL` now, which is not retryable, because they are not retryable.
 *  - **The status.** Every failure was HTTP 502 — "the upstream is broken" — including a
 *    `NO_CAPTION`, which means we read the post perfectly and it has no caption.
 *    `_lib/error-reporting.ts` maps each of the 14 codes to a status that says whose fault it was,
 *    and a 500 is now reachable only through `INTERNAL`.
 *  - **The cause.** `internal(String(e), e)` built a message and a `cause` that `toView()`
 *    correctly strips and that nothing ever logged, so the one thing that could answer "why?" was
 *    discarded on every failure. There is one structured `console.error` line per failure now
 *    (`07` §7.1's shape), carrying the code, our own message and a sanitised cause — and never a
 *    caption or a coordinate (charter R9).
 *
 * The `imports` row is also stamped `status='failed'` with its `error_code` when the request had
 * opened one, which is what `imports_failed_implies_code` (0003) was written for and what nothing
 * had ever written. Best-effort: a failed bookkeeping write never changes the response.
 */
import { createHash } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { oembedSourceAdapter, canonicalUrlFor } from '@/integrations/tiktok/oembed-source-adapter';
import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { createPlaceResolver, placeResolverEnv } from '@/integrations/places/place-resolver-factory';
import { createTranscriptionStep, transcriptionEnv } from '@/integrations/import/transcription';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { contentHashInput, contentPartsText, withContent } from '@/domain/import/content-parts';
import { resolveCandidates } from '@/domain/import/resolve-candidates';
import type { StoredResolution } from '@/domain/import/resolution-record';
import { EXTRACTION_SCHEMA_VERSION } from '@/domain/extraction/schema';
import { parseStoredCandidates } from '@/domain/import/stored-candidates';
import { filterPlausible } from '@/domain/extraction/plausibility';
import {
  DomainError,
  internal,
  malformedUrl,
  noCaption,
  notAuthenticated,
  type DomainErrorCode,
} from '@/domain/errors';
import {
  describeCause,
  httpStatusFor,
  importFailureLogLine,
  importRowStage,
  logSeverityFor,
  type ImportFailureStage,
} from '@/app/api/imports/_lib/error-reporting';
import type { ContentExtractor, OpCtx } from '@/domain/ports';
import type { ContentPart, PlaceCandidate } from '@/domain/types';

/** `start_import`'s row shape (`supabase/migrations/0007_functions.sql`), which this route needs
 *  the id from so it can advance the row it opened. */
interface StartImportRow {
  readonly import_id: string;
  readonly import_source_id: string;
  readonly import_status: string;
  readonly is_idempotent: boolean;
}

/** The one place a hash is computed on this route, so the read side and the write side cannot drift
 *  into disagreeing about what a cache hit means. *What* gets hashed is
 *  `contentHashInput`'s decision, in `domain/`, where the backward-compatibility rule that keeps
 *  today's rows valid is written down and unit-tested. */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The request's `OpCtx`. No longer a no-op logger: the resolver emits one `poi.resolve` line per
 * candidate — hint kind, scope reason, regions searched, prefiltered row count, band, shortlist
 * size — and that line is the only way to tell "we have no data for that city" apart from "we
 * searched and found nothing", which are the same blank screen to a user. Codes and counts only;
 * `place-resolver.ts` puts no caption, name or coordinate in these fields (charter R9).
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

/**
 * Reads back an extraction this source already has under the same model and prompt version.
 *
 * The write side of this cache shipped without a read side, so the key existed, the row was
 * written, and every re-paste still paid the model again. That is not a theoretical cost: at
 * `06`'s LEVEL B hit rate "no places found" is the *modal* outcome and re-pasting is the natural
 * retry, so the retry path was the expensive one. Measured on the local database, the same
 * eight-place London caption cost a fresh 3.8s model call on every single run — and, because the
 * model is not deterministic, returned a slightly different answer each time.
 *
 * That second part matters as much as the money. A cache hit means re-opening the same TikTok
 * shows you the same places, which is the only reason a user would trust the screen twice.
 *
 * `input_hash` is what makes the hit safe: the row is only reused when the content the model would
 * be given still hashes to what produced it. An edited caption (TikTok allows it) misses the cache
 * and re-extracts, rather than silently showing places the current caption no longer names — and so
 * does a source that has gained a second `ContentPart`, which is the whole reason the hash covers
 * the parts array rather than the caption string (`domain/import/content-parts.ts`).
 *
 * Returns null on any miss, any mismatch, and any read error — a cache is never allowed to fail an
 * import, only to fail to help.
 */
interface CachedExtraction {
  readonly id: string;
  readonly candidates: readonly PlaceCandidate[];
  /**
   * Index-aligned with `candidates`. `null` for a row written before the resolver was wired in —
   * six such rows exist on the local database — which the caller re-resolves and writes back rather
   * than serving a cached answer that predates the feature.
   */
  readonly resolutions: readonly (StoredResolution | null)[];
}

async function readCachedExtraction(
  db: SupabaseClient,
  input: {
    readonly sourceId: string;
    readonly model: string;
    readonly promptVersion: string;
    readonly contentHash: string;
  },
): Promise<CachedExtraction | null> {
  const { data, error } = await db
    .from('extractions')
    .select('id, candidates, input_hash, status')
    .eq('source_id', input.sourceId)
    .eq('model', input.model)
    .eq('prompt_version', input.promptVersion)
    .maybeSingle();

  if (error !== null || data === null) return null;
  if (data.status !== 'ok') return null;
  if (data.input_hash !== input.contentHash) return null;

  // Stored `jsonb` is untrusted input like any other — re-parsed, never assumed to still match the
  // current shape. Through `parseStoredCandidates`, the same reader `/api/imports/confirm` uses, so
  // the two sides of the cache cannot disagree about what a stored row means; it is also what reads
  // the resolution sibling back. A row written by an older prompt version that no longer parses is
  // simply a miss.
  const parsed = parseStoredCandidates(data.candidates ?? []);
  if (parsed.kind === 'invalid') return null;
  // The cache key pins `prompt_version`, so an older row can never be served under the current
  // key. Asserted rather than trusted: an older candidate reaching this path would silently lose
  // whatever the newer schema added.
  //
  // Compared against `EXTRACTION_SCHEMA_VERSION` rather than a literal, because a literal here
  // rots on every schema bump and does so *silently in the direction of a 500*. This read `!== 2`
  // when v3 landed: every cached row then parsed as v3, failed this gate, and took the caller
  // down a path that threw — a 500 on the cache-hit path, which is the common path, in production.
  if (parsed.candidates.some((c) => c.schemaVersion !== EXTRACTION_SCHEMA_VERSION)) return null;

  return {
    id: data.id as string,
    candidates: parsed.candidates.map((c) => c.candidate),
    resolutions: parsed.candidates.map((c) => c.resolution),
  };
}

/**
 * A candidate as it is stored and returned: the extracted `PlaceCandidate` plus the resolver's
 * answer for it, as one object.
 *
 * One array rather than two parallel ones, deliberately. `ConfirmItem.candidateIndex` addresses
 * this array, and a separate `resolutions` column would be a single off-by-one away from saving a
 * different place than the user picked. It is also additive on the wire: `import-page-client.tsx`
 * types the response's candidates as `PlaceCandidate[]` and ignores the extra key, so no UI change
 * is needed for this to land — and `z.object`'s key-stripping means both stored candidate schemas
 * still parse these rows unchanged (`domain/import/stored-candidates.ts`).
 */
type StoredCandidateRow = PlaceCandidate & { readonly resolution: StoredResolution | null };

/**
 * Writes resolutions onto an extraction row that already existed without them.
 *
 * Only reachable on a cache hit against a row written before the resolver was wired in. It updates
 * `candidates` **and nothing else** — a full upsert would overwrite the original `latency_ms` with
 * a null and rewrite `created_at`'s neighbours for a row whose extraction did not re-run.
 *
 * Best-effort: the resolutions are already in the response and in the `imports` row, so a failed
 * backfill costs the next re-paste a second resolve, not the user anything.
 */
async function backfillResolutions(
  db: SupabaseClient,
  extractionId: string,
  candidates: readonly StoredCandidateRow[],
): Promise<void> {
  const { error } = await db.from('extractions').update({ candidates }).eq('id', extractionId);
  if (error !== null) {
    console.warn(
      JSON.stringify({ event: 'import.bookkeeping', outcome: 'resolution_backfill_failed', cause: describeCause(error) }),
    );
  }
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
    readonly contentHash: string | null;
    /** Candidate objects with their `resolution` sibling already attached — see `StoredCandidateRow`. */
    readonly candidates: readonly StoredCandidateRow[];
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
        // Lets a later read tell "same post, same prompt, different content" — an edited caption,
        // or a part the source did not have last time — from a genuine cache hit, without storing
        // the text twice; `sources.content_text` already holds the caption.
        input_hash: input.contentHash,
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
    readonly msResolve: number | null;
    readonly degraded: 'PLACE_PROVIDER_UNAVAILABLE' | null;
    readonly candidates: readonly StoredCandidateRow[];
  },
): Promise<void> {
  await db
    .from('imports')
    .update({
      status: input.candidateCount > 0 ? 'review' : 'no_places',
      // Cleared, not left alone. `start_import` counts `failed` as an *open* import (0007's
      // `c_open`), so a re-paste after a failure adopts the very row the failure handler stamped —
      // and a row reading `status='review'` beside a stale `error_code` would misreport a
      // succeeded import as a failed one in every audit query.
      error_code: null,
      // `imports_stage_check` allows source/extract/resolve/done. This path used to stop after
      // extraction and said so; it now runs the real `PlaceResolver`, so `resolve` is the truthful
      // stage. `done` would still be a lie — the user has not confirmed yet, and
      // `/api/imports/confirm` is what writes it.
      stage: 'resolve',
      // Null when nothing was resolved (an extraction with no candidates, or a cache hit whose
      // stored resolutions were reused): the column stays honest about what this request measured.
      degraded_code: input.degraded,
      extractor_version: input.extractorVersion,
      prompt_version: input.promptVersion,
      ms_source: input.msSource,
      ms_extract: input.msExtract,
      ms_resolve: input.msResolve,
      candidates: input.candidates,
    })
    .eq('id', importId);
}

/**
 * Moves the `imports` row this request opened to its terminal failure state.
 *
 * `imports_failed_implies_code` (migration `0003`) has required `error_code` on a `failed` row
 * since the schema was written, and until now nothing on this route ever wrote one: a failed
 * import was left sitting at `status='processing'` until `expires_at` swept it, so the audit
 * record `07` §7.1 calls for was missing exactly the rows it was designed for.
 *
 * Best-effort in the strong sense — wrapped in its own `try`, because this runs *inside* the
 * route's catch block and a throw here would replace an honest error response with an unhandled
 * exception. A failed bookkeeping write is logged and otherwise invisible to the caller.
 */
async function failImport(
  db: SupabaseClient,
  importId: string,
  input: { readonly code: DomainErrorCode; readonly stage: ImportFailureStage },
): Promise<void> {
  try {
    const { error } = await db
      .from('imports')
      .update({ status: 'failed', error_code: input.code, stage: importRowStage(input.stage) })
      .eq('id', importId);
    if (error !== null) {
      console.error(
        JSON.stringify({
          event: 'import.bookkeeping',
          outcome: 'failed',
          importId,
          cause: describeCause(error),
        }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'import.bookkeeping',
        outcome: 'failed',
        importId,
        cause: describeCause(e),
      }),
    );
  }
}

/**
 * The one place this route turns a failure into a response, and the fix for
 * `current-state.md` §3.5.
 *
 * Three things happen here and they are deliberately separate:
 *
 *  1. **The client gets a code and two booleans** (`toView()`), never a message, a cause, a vendor
 *     string or a stack. That invariant (`07` §9) is unchanged — making an error honest means
 *     choosing the right *code*, never widening the payload.
 *  2. **The server log gets everything else**, in `07` §7.1's shape. `internal(String(e), e)` used
 *     to build a message and a `cause` that `toView()` then correctly discarded and nobody ever
 *     read; on 2026-08-26 that turned a service-role misconfiguration into an on-screen
 *     "COULDN'T READ THAT TIKTOK / INTERNAL" pointing at TikTok, the model and the network, none of
 *     which were the cause.
 *  3. **The status stops lying.** Every failure used to be HTTP 502 — "the upstream is broken" —
 *     including a malformed request body and a post that simply has no caption.
 */
function failureResponse(input: {
  readonly error: DomainError;
  readonly importId: string | null;
  readonly videoId: string | null;
  readonly stage: ImportFailureStage;
  readonly ms: number;
  readonly aborted?: boolean;
}): NextResponse {
  // One line, `JSON.stringify`d rather than passed as an object, so a log drain sees a single
  // parseable record and groups it by `importId` (`07` §7.1) instead of a multi-line dump.
  //
  // Severity is the code's own, not a blanket `error`: `07` §7.1 reserves "page a human" for
  // `INTERNAL`, and that reservation is worthless if a mistyped link and a logged-out request land
  // in the same Vercel bucket as a service-role misconfiguration. 5xx (ours, or a dependency's) is
  // an error; 4xx (the caller's request) is a warning. Neither is silenced.
  const line = JSON.stringify(importFailureLogLine(input));
  // An abort is never an alarm, whatever code the aborted work happened to raise on its way out.
  if (input.aborted !== true && logSeverityFor(input.error.code) === 'error') console.error(line);
  else console.warn(line);
  // `toView()` with no argument. `DomainErrorView` does have an optional `importId`, but its type
  // is the branded `ImportId` and what this route holds is a raw PostgREST uuid string — casting
  // one into the other would defeat the brand for a field the current UI does not read. The
  // correlation id lives in the log line above, which is where `07` §7.1 puts it.
  return NextResponse.json({ error: input.error.toView() }, { status: httpStatusFor(input.error.code) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /** Everything a failure needs to describe itself, filled in as the request learns it. Declared
   *  here so the catch block below can report *where* it got to rather than guessing. */
  let importId: string | null = null;
  let videoId: string | null = null;
  let stage: ImportFailureStage = 'request';

  const fail = (error: DomainError, aborted = false): NextResponse =>
    failureResponse({ error, importId, videoId, stage, ms: Date.now() - startedAt, aborted });

  if (!user) {
    return fail(notAuthenticated());
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    // Not `INTERNAL`: a body we cannot parse is the caller's mistake, not our bug, and re-sending
    // the identical bytes fails identically — so `retryable: true` was a straight lie. The closed
    // 14-code set (`07` §9) has no "bad request envelope" member; `MALFORMED_URL` is the honest
    // one, because from the caller's side what happened is that no usable link arrived.
    return fail(malformedUrl('request body was not valid JSON', e));
  }

  const url =
    typeof body === 'object' && body !== null && 'url' in body && typeof (body as { url: unknown }).url === 'string'
      ? (body as { url: string }).url
      : null;

  if (url === null) {
    return fail(malformedUrl('request body had no "url" string'));
  }

  // Server-side re-validation — the SSRF-relevant allow-list check (04 §2/§7). Never trust the
  // client's own canonicalisation for the network hop this route is about to make.
  const canonicalised = canonicaliseTikTokUrl(url);
  if (!canonicalised.ok) {
    // Was a blanket 422 for all four canonicaliser codes; now each gets its own status from the
    // one map, so `MALFORMED_URL` is a 400 and the rest stay 422.
    return fail(canonicalised.error);
  }

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
    // From here on a failure has a row to stamp. Before it, there is genuinely nothing to write —
    // `failImport` is skipped rather than fabricating an import that never opened.
    importId = startRow.import_id;

    const sourceStartedAt = Date.now();
    const fetched = await source.fetch(externalId, ctx);

    // Transcription (L0-TRANSCRIPT-T6), off unless *both* `TIKTOK_MEDIA_ACQUISITION=on` and
    // `IMPORT_TRANSCRIPTION=on` — `integrations/import/transcription.ts` says why that is two
    // switches rather than one. `null` means this route composes exactly what it composed before.
    const transcription = createTranscriptionStep(transcriptionEnv());
    // Nothing populates `RawSource.media`: `oembed-source-adapter.ts` returns `media: []`, so the
    // post's audio ref has to be attached between the source fetch and the extractors. A new
    // object, never the adapter's own mutated in place.
    //
    // Unconditional, once enabled. `media-acquisition.ts` asks callers not to acquire when the
    // caption already resolves the post, and honouring that means extracting, judging the result
    // and only then acquiring — a second model call and a re-entrant stage, which is a pipeline
    // change and not this task's. Recorded here rather than silently ignored.
    const raw = transcription === null ? fetched : await transcription.attachMedia(fetched, ctx);

    // Every `ContentExtractor`'s output, **caption first, transcript second**. That order is not
    // cosmetic: the parts are concatenated in it to build the prompt, and `contentHashInput` keys
    // the extraction cache on it, so reversing it is a different prompt, a different answer and a
    // different cache row.
    //
    // The `supports`-and-append loop `runImport` already runs (`domain/import/pipeline.ts`), not an
    // `if` per extractor: `ContentExtractor` was declared as an array seam so that a second
    // implementation costs a push here and nothing else downstream.
    const extractors: readonly ContentExtractor[] =
      transcription === null
        ? [captionContentExtractor]
        : [captionContentExtractor, transcription.extractor];
    const collected: ContentPart[] = [];
    for (const extractor of extractors) {
      if (!extractor.supports(raw)) continue;
      collected.push(...(await extractor.extract(raw, ctx)));
    }
    // No extractor claimed this source. `NO_CAPTION` is what that has always meant on this route —
    // the code the caption extractor itself raises on an empty caption, and the one `runImport`
    // raises for the same empty array — so gating that extractor on `supports` must not quietly
    // turn it into a 200. "The post says nothing" and "the post named no places" are different
    // screens.
    if (collected.length === 0) throw noCaption();
    // ...with the parts that carry no text dropped.
    const parts = withContent(collected);
    // Still `ms_source`, and it now covers acquisition, the audio download and the transcription
    // call when they run. The per-phase numbers are in the `tiktok.media_acquisition.*`,
    // `transcription.audio_acquired` and `transcription.cost` log lines rather than in a column
    // this task has no migration to add.
    const msSource = Date.now() - sourceStartedAt;

    /** The response's `caption` field and nothing else: the review screen prints the caption
     *  verbatim under the thumbnail. No stage keys off it any more. */
    const caption = parts.find((p) => p.kind === 'caption')?.text ?? null;

    let candidates: readonly PlaceCandidate[] = [];
    let resolutions: readonly (StoredResolution | null)[] = [];
    let extractorVersion: string | null = null;
    let promptVersion: string | null = null;
    let msExtract: number | null = null;
    let cached: CachedExtraction | null = null;
    /**
     * The extraction-level city hint, used as the fallback when a candidate carries none of its own
     * (`buildResolveQuery`). It is `null` on a cache-hit re-resolve because the column does not
     * store it — only the candidates are persisted. That is a real, small loss of recall on exactly
     * one path (an old row, re-pasted, whose candidates have no `cityHint`), recorded rather than
     * papered over; persisting it is a schema change and this task owns no migration.
     */
    let extractionCityHint: string | null = null;
    /** Null exactly when no part carried text — `07` §5.2's "no caption" pre-check, generalised to
     *  the array: no content, no model call, and nothing to key a cache row on. */
    const contentHash = parts.length === 0 ? null : sha256(contentHashInput(parts));

    if (contentHash !== null) {
      stage = 'extract';
      const extractor = createPlaceExtractor({
        ...(process.env.LLM_PROVIDER !== undefined ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {}),
        ...(process.env.ANTHROPIC_API_KEY !== undefined ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
        ...(process.env.ANTHROPIC_MODEL !== undefined ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
        ...(process.env.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
        ...(process.env.GEMINI_MODEL !== undefined ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {}),
      });
      extractorVersion = extractor.version;
      promptVersion = extractor.promptVersion;

      // The cache is consulted *before* the model, which is the whole point and is what the write
      // side shipped without. Same source, same model, same prompt version, same content ⇒ the
      // answer we already have, at no cost and with no re-roll of a nondeterministic result.
      cached = await readCachedExtraction(db, {
        sourceId: raw.id,
        model: extractor.version,
        promptVersion: extractor.promptVersion,
        contentHash,
      });

      if (cached !== null) {
        candidates = cached.candidates;
        resolutions = cached.resolutions;
      } else {
        const extractStartedAt = Date.now();
        const extracted = await extractor.extract(parts, ctx);
        msExtract = Date.now() - extractStartedAt;
        // Checked against every part joined, not the caption alone: the gate asks whether the
        // model's evidence really appears in what the model was given, so it has to be given the
        // same string the extractor built its prompt from.
        candidates = filterPlausible(extracted.candidates, contentPartsText(parts)).kept;
        extractionCityHint = extracted.cityHint;
      }
    }

    // Stage C — resolve. The change this task is for: until now the only coordinate downstream of
    // this route was the model's own guess.
    //
    // Two properties carried over from `runImport`'s stage C rather than reinvented, both inside
    // `resolveCandidates`: resolution never fails the import (a dead lookup degrades one candidate),
    // and candidates past `MAX_CANDIDATES` are kept and marked `capped` rather than dropped.
    //
    // Skipped entirely when the cache already holds a complete set of resolutions — that is the
    // whole point of the cache, and re-resolving would re-roll an answer the user has already seen.
    // A *partial* set re-resolves everything: the only way to get one is a row from before this
    // change, and mixing a fresh answer with a stale one in a single shortlist would leave no way
    // to say which is which.
    const cachedResolutionsComplete =
      resolutions.length === candidates.length && resolutions.every((r) => r !== null);
    let msResolve: number | null = null;
    let degraded: 'PLACE_PROVIDER_UNAVAILABLE' | null = null;
    let resolutionsAreNew = false;

    if (candidates.length > 0 && !cachedResolutionsComplete) {
      const resolveStartedAt = Date.now();
      const outcome = await resolveCandidates(
        createPlaceResolver(placeResolverEnv(), db),
        candidates,
        extractionCityHint,
        ctx,
      );
      msResolve = Date.now() - resolveStartedAt;
      resolutions = outcome.resolutions;
      degraded = outcome.degraded;
      resolutionsAreNew = true;
    }

    const storedCandidates: readonly StoredCandidateRow[] = candidates.map((candidate, i) => ({
      ...candidate,
      resolution: resolutions[i] ?? null,
    }));

    // Persist the extraction, then advance the import row. Both are `await`ed rather than
    // fire-and-forget: `extractionId` is load-bearing for the confirm step, so the response must
    // reflect whether the write actually happened. A cache hit skips the write entirely — there is
    // nothing new to record, and rewriting the row would overwrite the original `latency_ms` with
    // a null.
    let extractionId: string | null;
    if (cached !== null) {
      extractionId = cached.id;
      // A pre-resolver row that we have just resolved: write the shortlists back so the confirm
      // step — which reads this row, not this response — can derive an Overture save from them.
      // Without this the resolution would exist only in the response, and the browser is exactly
      // the place it must not have to come back from.
      if (resolutionsAreNew) await backfillResolutions(db, cached.id, storedCandidates);
    } else {
      extractionId = await persistExtraction(db, {
        sourceId: raw.id,
        extractorVersion,
        promptVersion,
        contentHash,
        candidates: storedCandidates,
        latencyMs: msExtract,
      });
    }

    await advanceImport(db, startRow.import_id, {
      candidateCount: candidates.length,
      extractorVersion,
      promptVersion,
      msSource,
      msExtract,
      msResolve,
      degraded,
      candidates: storedCandidates,
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
      /**
       * Each candidate with its `resolution` attached. Additive: the client types these as
       * `PlaceCandidate[]` and ignores the extra key, so this response stays backwards compatible
       * while carrying everything a review screen needs to show what was matched and what was not.
       */
      candidates: storedCandidates,
    });
  } catch (e) {
    // `String(e)` as the message was the old shape; the cause is kept as a real `cause` now and
    // sanitised on the way into the log rather than flattened at the throw site.
    const domainError = e instanceof DomainError ? e : internal('unhandled exception in probe route', e);

    // The caller went away. Whatever the aborted work threw on its way out describes the abort's
    // side effect, not a fault: an aborted `fetch` surfaces as `UPSTREAM_TIMEOUT`, so stamping the
    // row with it would file every user `Cancel` as a TikTok outage — a lie of exactly the kind
    // this route was just fixed to stop telling, written into the audit record rather than the
    // response. The closed 14-code set (`07` §9) has no member for "the caller left", and a call
    // site does not get to invent one, so the honest move is to record nothing: the row stays
    // `processing` and `expires_at` sweeps it, which is already what an abandoned tab does. Tidier
    // would be to write *a* code; none of them would be true.
    const aborted = req.signal.aborted;
    if (importId !== null && !aborted) {
      await failImport(db, importId, { code: domainError.code, stage });
    }
    return fail(domainError, aborted);
  }
}
