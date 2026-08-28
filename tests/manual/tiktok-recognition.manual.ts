/**
 * TLV-CORPUS-1 — real TikToks through the **real** flow: oEmbed → caption → extraction → resolve.
 *
 * NOT part of CI (`vitest.config.ts` includes only `tests/unit/**` and `src/**`). Run it with:
 *
 *   set -a; source .env.local; set +a          # SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, ...
 *   npx vitest run tests/manual/tiktok-recognition.manual.ts \
 *     --config tests/manual/vitest.manual.config.ts
 *
 * The corpus is `tests/manual/tiktok-recognition-corpus.json` — data, not code. Adding a URL never
 * requires touching this file; read that file's `_readme` before adding one.
 *
 * ## Why this exists next to `tlv-resolve-benchmark.manual.ts`
 *
 * That harness runs 15 hand-written queries and reports 7/14 top-1 correct. Those queries are
 * **script-matched to the index by construction** — a Latin query for a Latin-named row — and real
 * captions are not. 64% of the loaded index is Hebrew-named with zero aliases, so the synthetic
 * benchmark systematically understates the dominant failure mode: every number we have today is
 * measured on the easy case. This harness measures the hard one, and it measures it through the
 * shipped adapters rather than through a query string somebody typed.
 *
 * What runs is the product's own code, in the product's own order:
 * `canonicaliseTikTokUrl` → `oembedSourceAdapter.fetch` → `captionContentExtractor.extract` →
 * `createPlaceExtractor(process.env).extract` → `filterPlausible` → `resolveCandidates(
 * overturePlaceResolver(supabasePoiIndexGateway(client)), …)`. Nothing here re-implements
 * canonicalisation, oEmbed parsing, prompting, the plausibility gate, region routing, the
 * prefilter, the scorer or the bands. If a number moves, this file is not where it came from.
 *
 * ## The headline metric: the auto-match rate
 *
 * **The share of adjudicated candidates that land in the `preselect` band AND are the right
 * venue.** That is the number the owner asked to move (`docs/handoff-2026-08-27-place-recognition.md`
 * §1: "ideally we should rarely need [the picker]"). Everything else printed here exists to explain
 * that one number, or to keep it honest.
 *
 * ## Adjudication, and its limits
 *
 * A verdict needs a rule. A corpus case with no `expected` block is reported **`unadjudicated`**:
 * it prints its caption, its extracted candidates, the band, the score, the margin, the prefiltered
 * count, the top-1 name/address/coordinates and the top-3, so a human can rule from the run record
 * without re-running anything — and it counts toward the auto-match rate in **neither** direction.
 * Unadjudicated cases are reported as their own number. A harness that guessed a pass here would be
 * inventing the only number anybody is going to read.
 *
 * Where `expected` exists, the pairing rule is explicit and re-checkable:
 *
 *  1. Each expectation is attached to at most one extracted candidate, by matching its
 *     `candidatePattern` against `normalise(candidate.rawName)`.
 *  2. An expectation that matches **no** candidate is an EXTRACTION failure
 *     (`extraction_miss`) — the model never produced a string for a venue the caption names. It is
 *     counted in the denominator, because "the extractor did not name it" is a recognition failure
 *     the user experiences as one.
 *  3. A candidate that matches **no** expectation is `unadjudicated`. It may be a genuine second
 *     venue the corpus author did not list, or a hallucination; this harness will not guess which.
 *  4. A paired candidate passes when `namePattern` matches `normalise(top1.name)` and, where
 *     given, `addressPattern` matches the raw `address_line + ' ' + locality`.
 *
 * ## Failure classification
 *
 * A count is not a diagnosis. Every miss is bucketed by cause, in the vocabulary
 * `handoff-2026-08-27-place-recognition.md` §3 already uses, and each bucket has a different fix:
 *
 *  - `no_region_searched`     — `regionsSearched` is empty. The database was never queried at all.
 *  - `absent_from_index`      — the venue is not reachable by the prefilter AND an independent
 *                               ILIKE probe of `poi_index.name_norm` finds no row for it either.
 *  - `unreachable_in_index`   — the probe finds the row, but the resolver's own prefilter never
 *                               returned it. This is the Hebrew/Latin alias gap (TLV-13), and it is
 *                               the bucket this whole harness was built to make visible.
 *  - `ranking`                — the right row IS in the prefilter output, ranked below something
 *                               else.
 *  - `not_auto_accepted`      — top-1 IS the right venue, but the band is not `preselect`, so the
 *                               user had to use the picker. Sub-reported by whether `margin` was
 *                               `null` (the lone-candidate policy question, §3.1).
 *  - `extraction_miss`        — no candidate string for an expected venue.
 *  - `resolver_failed` / `capped` — the lookup errored, or the candidate was past `MAX_CANDIDATES`.
 *
 * `absent_from_index` vs `unreachable_in_index` cannot be told apart from the resolver's output
 * alone, which is why the probe exists: it is a second, independent query, and it is the same
 * method that produced the TLV-13 finding by hand.
 *
 * ## Cost
 *
 * Extraction calls a quota'd hosted model (500 Gemini calls/day, `docs/` project constraints).
 * Every oEmbed response and every extraction is written to
 * `docs/evidence/.local/tiktok-recognition-cache/` on first sight and reused afterwards, so a
 * re-run of a 30-URL corpus costs **zero** LLM calls and zero network. The directory is gitignored
 * (`docs/evidence/.local/`) because it holds third-party caption text, which is working material
 * rather than a project artefact. The extraction cache was documented as storing the model's raw output **before**
 * `filterPlausible` — **this is wrong, and it cost real time.** The Gemini adapter calls
 * `postProcessCandidates` *inside* `extract()`, so what lands in this cache is already
 * post-filter. The plausibility gate cannot be re-measured from it, and "did the model decline,
 * or did our own filter drop it?" is unanswerable from a cache entry — you have to spend a live
 * call to find out, which is exactly what happened on 2026-08-28.
 *
 * Set `RECOGNITION_REFRESH=1` to bypass the cache. **That spends one LLM call per corpus case** —
 * do it deliberately, after a prompt or model change, never as a habit.
 *
 * ## Skipping, and what this harness refuses to do
 *
 * Skips loudly — never fails, never silently — when the service key is unset, the container is
 * down, or `poi_index` holds no `tlv` rows. It refuses outright to run against a non-local Supabase
 * URL: it reads with the service role, and pointing it at staging or production would be a silent
 * privilege escalation of a "test". Same rules, same reasons, as
 * `tests/manual/tlv-resolve-benchmark.manual.ts`.
 *
 * It also **does not write to the database**. The real `oembedSourceAdapter` is cache-through
 * against `public.sources`; here it is handed a minimal in-memory stand-in for that table (the same
 * pattern `tests/manual/tiktok-oembed-live.manual.ts` uses) so the adapter's real fetch, parse and
 * error mapping run while no row is inserted into a database whose state this harness does not own.
 * Caching is the disk cache's job instead. The only database traffic is the resolver's reads.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// `place-resolver.ts` opens with `import 'server-only'`, which throws outside a server bundle.
// Same mock, same reason, as `tests/unit/integrations/supabase/place-resolver.test.ts`.
vi.mock('server-only', () => ({}));

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { MAX_PREFILTER_ROWS } from '@/integrations/supabase/place-resolver';
import { oembedSourceAdapter } from '@/integrations/tiktok/oembed-source-adapter';
import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { canonicaliseTikTokUrl } from '@/domain/source/canonicalise-tiktok-url';
import { filterPlausible } from '@/domain/extraction/plausibility';
import { buildResolveQuery, MAX_CANDIDATES } from '@/domain/import/pipeline';
import { resolveCandidates } from '@/domain/import/resolve-candidates';
import {
  createPlaceResolver,
  placeResolverEnv,
  resolverProviderFor,
} from '@/integrations/places/place-resolver-factory';
import {
  googlePlaceResolver,
  googlePlacesGateway,
  type GooglePlacesGateway,
  type GooglePlaceRow,
  type GoogleTextSearchParams,
} from '@/integrations/google/place-resolver';
import { normalise } from '@/domain/places/normalise';
import { DomainError } from '@/domain/errors';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { PlaceCandidate, RawSource, ResolveResult } from '@/domain/types';

import ingestConfig from '../../scripts/poi-ingest.config.json' with { type: 'json' };

/* ------------------------------------------------------------------------------------------- *
 * The corpus. Parsed with zod rather than imported as a typed literal: a corpus typo must be a
 * loud, located error, not a `undefined is not a function` two hundred lines later.
 * ------------------------------------------------------------------------------------------- */

const ExpectationSchema = z.object({
  name: z.string().min(1),
  area: z.string().min(1),
  candidatePattern: z.string().min(1).optional(),
  namePattern: z.string().min(1).optional(),
  addressPattern: z.string().min(1).optional(),
  indexProbe: z.array(z.string().min(1)).optional(),
});

const CorpusCaseSchema = z.object({
  url: z.string().min(1),
  category: z.string().min(1).optional(),
  notes: z.string().optional(),
  expected: z.array(ExpectationSchema).optional(),
});

const CorpusSchema = z.object({
  _readme: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  cases: z.array(CorpusCaseSchema),
});

type Expectation = z.infer<typeof ExpectationSchema>;
type CorpusCase = z.infer<typeof CorpusCaseSchema>;

const CORPUS_PATH = fileURLToPath(new URL('./tiktok-recognition-corpus.json', import.meta.url));
const CORPUS = CorpusSchema.parse(JSON.parse(readFileSync(CORPUS_PATH, 'utf8')));

/** Escapes a literal so a corpus entry with no explicit pattern still gets an exact-match rule. */
function literalPattern(text: string): string {
  return `^${normalise(text).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`;
}

function candidateRegex(e: Expectation): RegExp {
  return new RegExp(e.candidatePattern ?? literalPattern(e.name), 'iu');
}

function nameRegex(e: Expectation): RegExp {
  return new RegExp(e.namePattern ?? e.candidatePattern ?? literalPattern(e.name), 'iu');
}

/* ------------------------------------------------------------------------------------------- *
 * Disk cache. Keyed by what actually determines the answer, never by array position.
 * ------------------------------------------------------------------------------------------- */

const CACHE_DIR = fileURLToPath(
  new URL('../../docs/evidence/.local/tiktok-recognition-cache/', import.meta.url),
);
const REFRESH = process.env.RECOGNITION_REFRESH === '1';

function sha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function safeKey(text: string): string {
  return text.replace(/[^a-zA-Z0-9._-]/gu, '_').slice(0, 120);
}

function cacheRead<T>(file: string): T | null {
  if (REFRESH) return null;
  const path = `${CACHE_DIR}${file}`;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    // A corrupt cache entry is a miss, not a crash — but it is never silently rewritten as a pass.
    console.warn(`[tiktok-recognition] unreadable cache entry ${file}; treating as a miss`);
    return null;
  }
}

function cacheWrite(file: string, payload: unknown): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(`${CACHE_DIR}${file}`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/* ------------------------------------------------------------------------------------------- *
 * Environment probe. Everything here decides skip-or-run; nothing here asserts.
 * ------------------------------------------------------------------------------------------- */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

interface Probe {
  readonly ok: boolean;
  readonly reason: string;
  readonly client: SupabaseClient | null;
  readonly rows: number;
  readonly region: Record<string, unknown> | null;
}

async function probeEnv(): Promise<Probe> {
  const none = { ok: false, client: null, rows: 0, region: null } as const;
  if (KEY === '') {
    return {
      ...none,
      reason:
        'SUPABASE_SERVICE_ROLE_KEY is not set. Get the local one from `npx supabase status`; this ' +
        'harness never reads .env files itself (`set -a; source .env.local; set +a` first).',
    };
  }
  if (!isLocal(URL_)) {
    return {
      ...none,
      reason: `refusing to run against a non-local Supabase URL (${URL_}). Local only, by design.`,
    };
  }

  const client = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data: region, error: regionError } = await client
    .from('poi_regions')
    .select('id, is_loaded, norm_version, dataset_release, min_lat, max_lat, min_lng, max_lng, row_count')
    .eq('id', 'tlv')
    .maybeSingle();

  if (regionError !== null) {
    return { ...none, reason: `local Supabase not reachable or poi_regions unreadable: ${regionError.message}` };
  }
  if (region === null || region.is_loaded !== true) {
    return { ...none, reason: 'region `tlv` is not loaded (`poi_regions.is_loaded` is not true). Run the ingest first.' };
  }

  const { count, error: countError } = await client
    .from('poi_index')
    .select('dataset_place_id', { count: 'exact', head: true })
    .eq('region_id', 'tlv');

  if (countError !== null) return { ...none, reason: `poi_index unreadable: ${countError.message}` };
  if ((count ?? 0) === 0) return { ...none, reason: 'poi_index holds no rows for region `tlv`.' };

  return { ok: true, reason: 'ready', client, rows: count ?? 0, region: region as Record<string, unknown> };
}

/**
 * Which provider this run measures (owner ruling, 2026-08-28). Selected by the *same* factory the
 * import route uses, so the harness cannot measure a composition the product never builds. Set
 * `PLACE_RESOLVER=overture` to re-measure the baseline.
 *
 * The local `poi_index` stays a precondition even on the Google path: the per-miss index probe is
 * what tells "Google found it and we never had it" apart from "we had it and could not reach it",
 * and that comparison is the whole reason to run both.
 */
const RESOLVER = resolverProviderFor(placeResolverEnv());

/* ------------------------------------------------------------------------------------------- *
 * Google Text Search, on disk
 * ------------------------------------------------------------------------------------------- */

/**
 * A `GooglePlacesGateway` that answers from the disk cache before it answers from the network.
 *
 * The reason is a hard operational limit rather than speed: the Cloud project behind this key is
 * capped at **100 Text Search requests per day** (`integrations/google/place-resolver.ts`), and one
 * corpus run spends 16 of them. Scoring and band work needs to replay the *same* provider answers
 * against a changed policy, over and over — which without this costs a day's quota per experiment
 * and, worse, compares two policies against two different sets of provider answers.
 *
 * Cached at the gateway, not at the resolver, on purpose: everything we might want to change —
 * mapping, scoring, weights, band gates — stays live, and only the network call is replayed. So a
 * cached run measures the current code against fixed provider input, which is what a re-fit needs.
 *
 * `RECOGNITION_REFRESH=1` bypasses it, exactly as it does for captions and extractions.
 *
 * **Where these files live matters legally.** Google's Service Specific Terms §5.4 caps caching of
 * lat/lng at 30 days, so provider rows must not enter the repository. `docs/evidence/.local/` is
 * gitignored; this writes there and nowhere else, and a stale entry is a re-run, not a migration.
 */
function cachingGooglePlacesGateway(inner: GooglePlacesGateway): GooglePlacesGateway {
  return {
    async searchText(params: GoogleTextSearchParams, signal: AbortSignal) {
      // Every field that changes Google's answer, and nothing that does not. Order is fixed by the
      // literal below rather than by `JSON.stringify` over a built object, so a future field cannot
      // silently re-key the whole cache.
      const key = JSON.stringify([
        params.textQuery,
        params.regionCode,
        params.languageCode,
        params.maxResultCount,
      ]);
      const file = `google-${safeKey(params.textQuery)}-${sha(key).slice(0, 16)}.json`;

      const hit = cacheRead<{ readonly rows: readonly GooglePlaceRow[] }>(file);
      if (hit !== null) {
        googleCacheHits += 1;
        return hit.rows;
      }

      const rows = await inner.searchText(params, signal);
      googleCalls += 1;
      cacheWrite(file, { key, rows });
      return rows;
    },
  };
}

let googleCalls = 0;
let googleCacheHits = 0;

/**
 * The resolver this run measures. Identical to `createPlaceResolver` except that the Google
 * gateway is wrapped in the disk cache above — the factory composes the production adapter, and
 * this only replaces the one seam that spends quota.
 */
function createMeasuredResolver(client: SupabaseClient) {
  const env_ = placeResolverEnv();
  if (resolverProviderFor(env_).provider !== 'google') return createPlaceResolver(env_, client);
  const apiKey = env_.GOOGLE_PLACES_API_KEY ?? env_.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  return googlePlaceResolver(cachingGooglePlacesGateway(googlePlacesGateway(apiKey)));
}

const env = await probeEnv();
if (!env.ok) {
  // Printed once, loudly, because a silently skipped benchmark is worse than no benchmark.
  console.warn(`\n[tiktok-recognition] SKIPPED — ${env.reason}\n`);
}

/** The extractor is built once, and its absence is a per-case skip rather than a run failure: a
 *  fully cached corpus needs no key at all, and refusing to run without one would make the cheap,
 *  repeatable path depend on a credential it does not use. */
let extractor: PlaceExtractor | null = null;
let extractorError: string | null = null;
try {
  extractor = createPlaceExtractor({
    ...(process.env.LLM_PROVIDER !== undefined ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {}),
    ...(process.env.ANTHROPIC_API_KEY !== undefined ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
    ...(process.env.ANTHROPIC_MODEL !== undefined ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
    ...(process.env.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
    ...(process.env.GEMINI_MODEL !== undefined ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {}),
  });
} catch (e) {
  extractorError = e instanceof Error ? e.message : String(e);
  console.warn(
    `\n[tiktok-recognition] no LLM extractor configured (${extractorError}).\n` +
      '  Cached extractions still run; any corpus case not already cached will be SKIPPED and\n' +
      '  excluded from the auto-match rate.\n',
  );
}

/* ------------------------------------------------------------------------------------------- *
 * The in-memory stand-in for `public.sources`. See the file header: the adapter's real fetch,
 * parse and error mapping run; no row is written to a database this harness does not own.
 * ------------------------------------------------------------------------------------------- */

function inMemorySourcesDb(externalId: string) {
  const noop = { data: null, error: null };
  return {
    from(table: string) {
      if (table !== 'sources') throw new Error(`unexpected table ${table}`);
      const chain = {
        eq: () => chain,
        neq: () => Promise.resolve(noop),
        // `readCachedRow` — always a miss: this harness's cache is the disk one, and a partial
        // second cache in front of it would make "was this a live fetch?" unanswerable.
        maybeSingle: () => Promise.resolve(noop),
        // `ensurePendingRow`'s follow-up read. The id is only ever carried into `RawSource.id`.
        single: () => Promise.resolve({ data: { id: externalId }, error: null }),
        then: (onFulfilled?: ((v: typeof noop) => unknown) | null) =>
          Promise.resolve(noop).then(onFulfilled),
      };
      return {
        select: () => chain,
        upsert: () => Promise.resolve(noop),
        update: () => chain,
      };
    },
  };
}

function ctx(): OpCtx {
  return { signal: new AbortController().signal, importId: null, log: { event: () => {} } };
}

/* ------------------------------------------------------------------------------------------- *
 * Result shapes
 * ------------------------------------------------------------------------------------------- */

type Verdict = 'auto_match' | 'correct_not_auto_accepted' | 'wrong' | 'unadjudicated';

type FailureBucket =
  | 'no_region_searched'
  | 'absent_from_index'
  | 'unreachable_in_index'
  | 'ranking'
  | 'not_auto_accepted'
  | 'extraction_miss'
  | 'resolver_failed'
  | 'capped';

interface Top1 {
  readonly name: string;
  readonly address: string | null;
  readonly locality: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly providerCategory: string | null;
  readonly datasetConfidence: number;
}

interface CandidateResult {
  readonly rawName: string;
  readonly cityHint: string | null;
  readonly countryHint: string | null;
  readonly categoryHint: string | null;
  readonly addressHint: string | null;
  /** What the resolver was actually asked — the product's own `buildResolveQuery`, not a rewrite. */
  readonly queryText: string;
  readonly queryCityHint: string | null;
  readonly regionsSearched: readonly string[];
  readonly candidatesPrefiltered: number;
  readonly band: string | null;
  readonly score: number | null;
  readonly margin: number | null;
  readonly top1: Top1 | null;
  readonly top3: readonly string[];
  readonly resolutionKind: string;
  /** The corpus expectation this candidate was paired with, or null. */
  readonly expectedName: string | null;
  readonly expectedArea: string | null;
  readonly verdict: Verdict;
  readonly failure: FailureBucket | null;
  /** 1-based rank of the first acceptable row over the WHOLE prefilter output (diagnostic re-run
   *  at `maxResults = MAX_PREFILTER_ROWS`), or null when no acceptable row was prefiltered. */
  readonly acceptedRank: number | null;
  /** Independent ILIKE probe of `poi_index.name_norm`, run only for adjudicated misses. */
  readonly indexProbeHits: readonly string[] | null;
  readonly note: string | null;
}

interface CaseResult {
  readonly url: string;
  readonly category: string | null;
  readonly status:
    | 'ok'
    | 'bad_url'
    | 'oembed_failed'
    | 'no_caption'
    | 'no_extractor'
    | 'extraction_failed';
  readonly statusDetail: string | null;
  readonly externalId: string | null;
  readonly authorHandle: string | null;
  readonly caption: string | null;
  readonly captionSource: 'cache' | 'live' | null;
  readonly extractionSource: 'cache' | 'live' | null;
  readonly extractionCityHint: string | null;
  readonly rawCandidateNames: readonly string[];
  readonly droppedByPlausibility: Record<string, number> | null;
  readonly candidates: readonly CandidateResult[];
  /** Expectations with no matching extracted candidate — the extraction-miss bucket. */
  readonly extractionMisses: readonly string[];
}

const results: CaseResult[] = [];
let llmCalls = 0;
let oembedCalls = 0;

/* ------------------------------------------------------------------------------------------- *
 * Stages, each one calling the shipped code path
 * ------------------------------------------------------------------------------------------- */

interface CachedSource {
  readonly externalId: string;
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly canonicalUrl: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string;
  readonly fetchedAt: string;
}

async function getSource(
  url: string,
): Promise<
  | { ok: true; raw: RawSource; from: 'cache' | 'live' }
  | { ok: false; status: CaseResult['status']; detail: string; externalId: string | null }
> {
  const canonical = canonicaliseTikTokUrl(url);
  if (!canonical.ok) {
    return { ok: false, status: 'bad_url', detail: canonical.error.code, externalId: null };
  }

  let externalId: string;
  const db = inMemorySourcesDb('pending');
  const adapter = oembedSourceAdapter(db as never);
  try {
    externalId =
      canonical.value.kind === 'video'
        ? canonical.value.externalId
        : (await adapter.resolveShortLink(canonical.value, ctx())).externalId;
  } catch (e) {
    const code = e instanceof DomainError ? e.code : String(e);
    return { ok: false, status: 'oembed_failed', detail: `short link: ${code}`, externalId: null };
  }

  const file = `oembed-${safeKey(externalId)}.json`;
  const hit = cacheRead<CachedSource>(file);
  if (hit !== null) {
    return {
      ok: true,
      from: 'cache',
      raw: {
        id: hit.externalId,
        externalId: hit.externalId,
        authorHandle: hit.authorHandle,
        authorName: hit.authorName,
        canonicalUrl: hit.canonicalUrl,
        thumbnailUrl: hit.thumbnailUrl,
        texts: [{ kind: 'caption', text: hit.caption }],
        media: [],
      },
    };
  }

  try {
    oembedCalls += 1;
    const raw = await oembedSourceAdapter(inMemorySourcesDb(externalId) as never).fetch(externalId, ctx());
    const caption = raw.texts.find((t) => t.kind === 'caption')?.text ?? '';
    const payload: CachedSource = {
      externalId: raw.externalId,
      authorHandle: raw.authorHandle,
      authorName: raw.authorName,
      canonicalUrl: raw.canonicalUrl,
      thumbnailUrl: raw.thumbnailUrl,
      caption,
      fetchedAt: new Date().toISOString(),
    };
    // Only a real caption is cached. A 400 is transient by `postUnavailable`'s own contract, and
    // caching an empty answer would turn one bad afternoon into a permanent corpus hole.
    if (caption.trim().length > 0) cacheWrite(file, payload);
    return { ok: true, raw, from: 'live' };
  } catch (e) {
    const code = e instanceof DomainError ? e.code : String(e);
    return { ok: false, status: 'oembed_failed', detail: code, externalId };
  }
}

interface CachedExtraction {
  readonly candidates: readonly PlaceCandidate[];
  readonly cityHint: string | null;
  readonly extractorVersion: string;
  readonly promptVersion: string;
  readonly captionSha: string;
  readonly extractedAt: string;
}

async function getExtraction(
  caption: string,
  parts: Awaited<ReturnType<typeof captionContentExtractor.extract>>,
): Promise<
  | { ok: true; candidates: readonly PlaceCandidate[]; cityHint: string | null; from: 'cache' | 'live' }
  | { ok: false; status: CaseResult['status']; detail: string }
> {
  const captionSha = sha(caption);
  // The key is everything that can change the answer: the model, the prompt, and the caption.
  const versioned =
    extractor === null ? null : `extract-${safeKey(extractor.version)}-${safeKey(extractor.promptVersion)}-${captionSha.slice(0, 16)}.json`;

  // A cached extraction is usable even with no extractor configured, but only if we can name the
  // file — which needs the extractor's version. With no extractor at all we cannot know which
  // cached answer is the current one, so we say so rather than guessing.
  if (versioned !== null) {
    const hit = cacheRead<CachedExtraction>(versioned);
    if (hit !== null) {
      return { ok: true, candidates: hit.candidates, cityHint: hit.cityHint, from: 'cache' };
    }
  }

  if (extractor === null) {
    return {
      ok: false,
      status: 'no_extractor',
      detail: extractorError ?? 'no LLM extractor configured and no cached extraction for this caption',
    };
  }

  try {
    llmCalls += 1;
    const extracted = await extractor.extract(parts, ctx());
    const payload: CachedExtraction = {
      candidates: extracted.candidates,
      cityHint: extracted.cityHint,
      extractorVersion: extractor.version,
      promptVersion: extractor.promptVersion,
      captionSha,
      extractedAt: new Date().toISOString(),
    };
    cacheWrite(versioned as string, payload);
    return { ok: true, candidates: extracted.candidates, cityHint: extracted.cityHint, from: 'live' };
  } catch (e) {
    const code = e instanceof DomainError ? e.code : e instanceof Error ? e.message : String(e);
    return { ok: false, status: 'extraction_failed', detail: code };
  }
}

/** ILIKE against `poi_index.name_norm`, one query per probe string — deliberately not a PostgREST
 *  `.or()`, whose filter grammar breaks on commas and parentheses inside a value. Read-only. */
async function probeIndex(client: SupabaseClient, probes: readonly string[]): Promise<string[]> {
  const hits: string[] = [];
  for (const probe of probes) {
    const { data, error } = await client
      .from('poi_index')
      .select('name, address_line, locality')
      .eq('region_id', 'tlv')
      .ilike('name_norm', `%${normalise(probe)}%`)
      .limit(5);
    if (error !== null) {
      hits.push(`probe "${probe}" failed: ${error.message}`);
      continue;
    }
    for (const row of (data ?? []) as { name: string; address_line: string | null; locality: string | null }[]) {
      hits.push(`${row.name} @ ${row.address_line ?? '—'}, ${row.locality ?? '—'}`);
    }
  }
  return [...new Set(hits)];
}

function acceptsRow(e: Expectation, name: string, address: string | null, locality: string | null): boolean {
  if (!nameRegex(e).test(normalise(name))) return false;
  if (e.addressPattern !== undefined) {
    if (!new RegExp(e.addressPattern, 'iu').test(`${address ?? ''} ${locality ?? ''}`)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------------------------------- *
 * The run
 * ------------------------------------------------------------------------------------------- */

describe.skipIf(!env.ok)('real TikToks through the real recognition flow', () => {
  const client = env.client as SupabaseClient;
  const resolver = createMeasuredResolver(client);

  for (const [i, c] of CORPUS.cases.entries()) {
    it(`case ${i + 1}/${CORPUS.cases.length} — ${c.url}`, async () => {
      const record = await runCase(c);
      results.push(record);
      console.log(renderCase(record));

      // The one per-case assertion, and the only failure mode the product cannot survive: a
      // `preselect` that is wrong never reaches a human. A wrong `confirm` is a ranking problem the
      // user can see and correct, so it is recorded and rolled into the summary rather than failing
      // the case — otherwise this harness would be red for known, accepted misses and nobody would
      // run it.
      const falseAutoAccepts = record.candidates.filter(
        (x) => x.band === 'preselect' && x.verdict === 'wrong',
      );
      expect(
        falseAutoAccepts.map((x) => `${x.rawName} → ${x.top1?.name} @ ${x.top1?.address}`),
        'a preselect that is wrong is shown to the user as settled fact',
      ).toEqual([]);
    });
  }

  async function runCase(c: CorpusCase): Promise<CaseResult> {
    const base = {
      url: c.url,
      category: c.category ?? null,
      externalId: null,
      authorHandle: null,
      caption: null,
      captionSource: null,
      extractionSource: null,
      extractionCityHint: null,
      rawCandidateNames: [],
      droppedByPlausibility: null,
      candidates: [],
      extractionMisses: [],
    } as const;

    const src = await getSource(c.url);
    if (!src.ok) {
      return { ...base, status: src.status, statusDetail: src.detail, externalId: src.externalId };
    }
    const raw = src.raw;

    let parts: Awaited<ReturnType<typeof captionContentExtractor.extract>>;
    try {
      parts = await captionContentExtractor.extract(raw, ctx());
    } catch (e) {
      return {
        ...base,
        status: 'no_caption',
        statusDetail: e instanceof DomainError ? e.code : String(e),
        externalId: raw.externalId,
        authorHandle: raw.authorHandle,
        captionSource: src.from,
      };
    }
    const caption = parts.find((p) => p.kind === 'caption')?.text ?? '';

    const ext = await getExtraction(caption, parts);
    if (!ext.ok) {
      return {
        ...base,
        status: ext.status,
        statusDetail: ext.detail,
        externalId: raw.externalId,
        authorHandle: raw.authorHandle,
        caption,
        captionSource: src.from,
      };
    }

    // Exactly what `/api/imports/probe` does with the model's output, in the same order.
    const plausible = filterPlausible(ext.candidates, caption);
    const kept = plausible.kept;

    const outcome = await resolveCandidates(resolver, kept, ext.cityHint, ctx());

    // Pair expectations to candidates: first unclaimed candidate whose rawName matches.
    const expectations = c.expected ?? null;
    const claimed = new Map<number, Expectation>();
    const usedExpectations = new Set<Expectation>();
    if (expectations !== null) {
      for (const e of expectations) {
        const re = candidateRegex(e);
        const idx = kept.findIndex((k, ki) => !claimed.has(ki) && re.test(normalise(k.rawName)));
        if (idx >= 0) {
          claimed.set(idx, e);
          usedExpectations.add(e);
        }
      }
    }

    const candidates: CandidateResult[] = [];
    for (const [ci, cand] of kept.entries()) {
      const resolution = outcome.resolutions[ci] ?? null;
      const expectation = claimed.get(ci) ?? null;
      const query = buildResolveQuery(cand, ext.cityHint);

      const common = {
        rawName: cand.rawName,
        cityHint: cand.cityHint,
        countryHint: cand.countryHint,
        categoryHint: cand.categoryHint,
        addressHint: cand.addressHint,
        queryText: query.text,
        queryCityHint: query.cityHint,
        expectedName: expectation?.name ?? null,
        expectedArea: expectation?.area ?? null,
      } as const;

      if (resolution === null || resolution.kind !== 'answered') {
        candidates.push({
          ...common,
          regionsSearched: [],
          candidatesPrefiltered: 0,
          band: null,
          score: null,
          margin: null,
          top1: null,
          top3: [],
          resolutionKind: resolution?.kind ?? 'not_attempted',
          verdict: expectation === null ? 'unadjudicated' : 'wrong',
          failure:
            expectation === null ? null : resolution?.kind === 'capped' ? 'capped' : 'resolver_failed',
          acceptedRank: null,
          indexProbeHits: null,
          note:
            resolution?.kind === 'capped'
              ? `past MAX_CANDIDATES (${MAX_CANDIDATES}); kept and visible, never resolved`
              : resolution?.kind === 'failed'
                ? `resolver lookup ${resolution.reason}`
                : null,
        });
        continue;
      }

      const res: ResolveResult = resolution.result;
      const top = res.shortlist[0] ?? null;
      const top1: Top1 | null =
        top === null
          ? null
          : {
              name: top.place.name,
              address: top.place.addressLine,
              locality: top.place.locality,
              lat: top.place.lat,
              lng: top.place.lng,
              providerCategory: top.place.providerCategory,
              datasetConfidence: top.place.datasetConfidence,
            };
      const top3 = res.shortlist.slice(0, 3).map((r) => `${r.place.name} (${r.score.toFixed(3)})`);

      if (expectation === null) {
        candidates.push({
          ...common,
          regionsSearched: [...res.regionsSearched],
          candidatesPrefiltered: res.candidatesPrefiltered,
          band: res.confidence.band,
          score: res.confidence.score,
          margin: res.confidence.margin,
          top1,
          top3,
          resolutionKind: 'answered',
          verdict: 'unadjudicated',
          failure: null,
          acceptedRank: null,
          indexProbeHits: null,
          note: 'no corpus expectation matched this candidate — rule from the top-3 below and add one',
        });
        continue;
      }

      const correct = top1 !== null && acceptsRow(expectation, top1.name, top1.address, top1.locality);
      const autoMatched = correct && res.confidence.band === 'preselect';

      // Diagnostics, run only on a miss, and only against the database (no LLM, no network).
      let acceptedRank: number | null = null;
      let probeHits: string[] | null = null;
      let bucket: FailureBucket | null = null;
      let note: string | null = null;

      if (correct && !autoMatched) {
        bucket = 'not_auto_accepted';
        acceptedRank = 1;
        note =
          res.confidence.margin === null
            ? `top-1 is right but margin is null (${res.candidatesPrefiltered} prefiltered) — the lone-candidate policy question, handoff §3.1`
            : `top-1 is right, band ${res.confidence.band}, margin ${res.confidence.margin.toFixed(3)}`;
      } else if (!correct) {
        // The whole ranking, not the product's top 5, so the right row's real rank is visible.
        // `score.ts` computes band and margin on the full ranking before `maxResults` truncates,
        // so this re-run cannot move a band — it is strictly diagnostic.
        const wide = await resolver.resolve({ ...query, maxResults: MAX_PREFILTER_ROWS }, ctx());
        const idx = wide.shortlist.findIndex((r) =>
          acceptsRow(expectation, r.place.name, r.place.addressLine, r.place.locality),
        );
        acceptedRank = idx >= 0 ? idx + 1 : null;
        if (expectation.indexProbe !== undefined) {
          probeHits = await probeIndex(client, expectation.indexProbe);
        }

        if (res.regionsSearched.length === 0) {
          bucket = 'no_region_searched';
          note = 'cityHint resolved to no loaded region — the database was never queried at all';
        } else if (acceptedRank !== null) {
          bucket = 'ranking';
          note = `the right row IS in the prefilter output, at rank ${acceptedRank}`;
        } else if (probeHits !== null && probeHits.length > 0) {
          bucket = 'unreachable_in_index';
          note = 'the row exists in poi_index but the prefilter can never return it from these tokens';
        } else if (probeHits !== null) {
          bucket = 'absent_from_index';
          note = 'no row in poi_index matches the expected name in either script';
        } else {
          bucket = 'absent_from_index';
          note =
            'not in the prefilter output; NO indexProbe given, so absent-vs-unreachable is a GUESS — ' +
            'add indexProbe to this corpus entry to make it a measurement';
        }
      }

      candidates.push({
        ...common,
        regionsSearched: [...res.regionsSearched],
        candidatesPrefiltered: res.candidatesPrefiltered,
        band: res.confidence.band,
        score: res.confidence.score,
        margin: res.confidence.margin,
        top1,
        top3,
        resolutionKind: 'answered',
        verdict: autoMatched ? 'auto_match' : correct ? 'correct_not_auto_accepted' : 'wrong',
        failure: bucket,
        acceptedRank,
        indexProbeHits: probeHits,
        note,
      });
    }

    const misses =
      expectations === null ? [] : expectations.filter((e) => !usedExpectations.has(e)).map((e) => e.name);

    return {
      url: c.url,
      category: c.category ?? null,
      status: 'ok',
      statusDetail: null,
      externalId: raw.externalId,
      authorHandle: raw.authorHandle,
      caption,
      captionSource: src.from,
      extractionSource: ext.from,
      extractionCityHint: ext.cityHint,
      rawCandidateNames: ext.candidates.map((x) => x.rawName),
      droppedByPlausibility: { ...plausible.dropped },
      candidates,
      extractionMisses: misses,
    };
  }

  it('summary: the auto-match rate, and zero false auto-accepts', () => {
    expect(results.length, 'every corpus case ran').toBe(CORPUS.cases.length);
    console.log(renderSummary(results));

    const falseAutoAccepts = results.flatMap((r) =>
      r.candidates.filter((x) => x.band === 'preselect' && x.verdict === 'wrong').map((x) => `${r.url} ${x.rawName}→${x.top1?.name}`),
    );

    // THE assertion. Everything else in this file is diagnostics.
    expect(
      falseAutoAccepts,
      'a preselect that is wrong is shown to the user as settled fact',
    ).toEqual([]);

    // The regression floor. Armed at the count measured on 2026-08-27 against release 2026-07-22.0,
    // `tlv` at 31.95-32.40 / 34.70-35.00, 10 462 rows: 1/1 (the HaKosem case). It is a floor, not a
    // target — RAISE it whenever a change earns more, and never lower it to make a run pass. A
    // corpus can only grow, so adding URLs can never invalidate it; a case that skips (no LLM key,
    // dead oEmbed) contributes nothing to the count and will trip this, which is correct: a run
    // that could not measure the thing must not report that the thing is fine.
    const floor: number | null = BASELINE_AUTO_MATCHES;
    const stats = tally(results);
    if (floor === null) {
      console.warn(
        `[tiktok-recognition] regression floor NOT ARMED (corpus is ${CORPUS.cases.length} case(s)). ` +
          `Measured ${stats.autoMatch}/${stats.adjudicated} auto-matched.`,
      );
    } else {
      expect(stats.autoMatch, `auto-match count regressed below the recorded floor of ${floor}`).toBeGreaterThanOrEqual(floor);
    }
  });
});

/** See the summary test. Measured, never aspirational. */
const BASELINE_AUTO_MATCHES: number | null = 1;

/* ------------------------------------------------------------------------------------------- *
 * Reporting
 * ------------------------------------------------------------------------------------------- */

interface Tally {
  readonly cases: number;
  readonly casesOk: number;
  readonly adjudicated: number;
  readonly autoMatch: number;
  readonly correctNotAutoAccepted: number;
  readonly wrong: number;
  readonly unadjudicated: number;
  readonly extractionMisses: number;
  readonly falseAutoAccepts: number;
  readonly buckets: Record<string, string[]>;
  readonly caseStatuses: Record<string, number>;
}

function tally(rows: readonly CaseResult[]): Tally {
  const buckets: Record<string, string[]> = {};
  const caseStatuses: Record<string, number> = {};
  let adjudicated = 0;
  let autoMatch = 0;
  let correctNotAutoAccepted = 0;
  let wrong = 0;
  let unadjudicated = 0;
  let extractionMisses = 0;
  let falseAutoAccepts = 0;

  for (const r of rows) {
    caseStatuses[r.status] = (caseStatuses[r.status] ?? 0) + 1;
    for (const m of r.extractionMisses) {
      extractionMisses += 1;
      adjudicated += 1;
      (buckets.extraction_miss ??= []).push(`${shortId(r)}:${m}`);
    }
    for (const x of r.candidates) {
      if (x.verdict === 'unadjudicated') {
        unadjudicated += 1;
        continue;
      }
      adjudicated += 1;
      if (x.verdict === 'auto_match') autoMatch += 1;
      if (x.verdict === 'correct_not_auto_accepted') correctNotAutoAccepted += 1;
      if (x.verdict === 'wrong') wrong += 1;
      if (x.band === 'preselect' && x.verdict === 'wrong') falseAutoAccepts += 1;
      if (x.failure !== null) (buckets[x.failure] ??= []).push(`${shortId(r)}:${x.rawName}`);
    }
  }

  return {
    cases: rows.length,
    casesOk: rows.filter((r) => r.status === 'ok').length,
    adjudicated,
    autoMatch,
    correctNotAutoAccepted,
    wrong,
    unadjudicated,
    extractionMisses,
    falseAutoAccepts,
    buckets,
    caseStatuses,
  };
}

function shortId(r: CaseResult): string {
  return r.externalId ?? r.url.slice(-12);
}

/**
 * The corpus's own coverage, printed next to the rate it produces. A rate is only as good as the
 * corpus under it, and `1/1 = 100%` is a number somebody will otherwise quote. The owner's brief
 * is 20-30 URLs across six categories; anything less than that is a pilot, and says so.
 */
function coverageCaveat(rows: readonly CaseResult[]): string[] {
  const targets = CORPUS.categories ?? [];
  const seen = new Set(rows.map((r) => r.category).filter((c): c is string => c !== null));
  const missing = targets.filter((c) => !seen.has(c));
  const uncategorised = rows.filter((r) => r.category === null).length;
  const out: string[] = [];
  if (rows.length < 20) {
    out.push(
      `NOT YET A MEASUREMENT: ${rows.length} URL(s) in the corpus, against the owner's brief of 20-30. ` +
        'Treat the rate above as a pilot, not a result.',
    );
  }
  if (missing.length > 0) out.push(`categories with no URL yet: ${missing.join(', ')}`);
  if (uncategorised > 0) out.push(`${uncategorised} case(s) carry no category`);
  return out;
}

function pct(n: number, d: number): string {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(0)}%`;
}

function renderCase(r: CaseResult): string {
  const L: string[] = [''];
  L.push(`── ${r.url}${r.category === null ? '' : `  [${r.category}]`}`);
  if (r.status !== 'ok') {
    L.push(`   STATUS ${r.status.toUpperCase()} — ${r.statusDetail ?? ''}`);
    if (r.caption !== null) L.push(`   caption: ${r.caption.replace(/\n/gu, ' ⏎ ')}`);
    return L.join('\n');
  }
  L.push(`   @${r.authorHandle ?? '?'}  caption(${r.captionSource}): ${(r.caption ?? '').replace(/\n/gu, ' ⏎ ')}`);
  L.push(
    `   extraction(${r.extractionSource}): cityHint=${r.extractionCityHint ?? 'null'}  raw=[${r.rawCandidateNames.join(' | ')}]  ` +
      `dropped=${Object.entries(r.droppedByPlausibility ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(',') || 'none'}`,
  );
  for (const x of r.candidates) {
    const verdict =
      x.verdict === 'auto_match'
        ? 'AUTO-MATCH'
        : x.verdict === 'correct_not_auto_accepted'
          ? `CORRECT-BUT-NOT-AUTO (${x.failure})`
          : x.verdict === 'wrong'
            ? `MISS (${x.failure})`
            : 'UNADJUDICATED';
    L.push(`   • "${x.rawName}" → ${verdict}`);
    L.push(
      `       query: text="${x.queryText}" cityHint=${x.queryCityHint ?? 'null'} cat=${x.categoryHint ?? 'null'}` +
        `  regionsSearched=[${x.regionsSearched.join(',') || '—'}]  prefiltered=${x.candidatesPrefiltered}`,
    );
    L.push(
      `       band=${x.band ?? x.resolutionKind}  score=${x.score?.toFixed(3) ?? '—'}  margin=${x.margin === null ? 'null' : x.margin.toFixed(3)}`,
    );
    L.push(
      `       top1: ${x.top1 === null ? '—' : `${x.top1.name} @ ${x.top1.address ?? '—'}, ${x.top1.locality ?? '—'}  (${x.top1.lat.toFixed(6)}, ${x.top1.lng.toFixed(6)})  cat=${x.top1.providerCategory ?? '—'} conf=${x.top1.datasetConfidence.toFixed(2)}`}`,
    );
    L.push(`       top3: ${x.top3.join('  |  ') || '—'}`);
    if (x.expectedName !== null) L.push(`       expected: ${x.expectedName} — ${x.expectedArea ?? ''}`);
    if (x.acceptedRank !== null) L.push(`       rank of the right row in the full prefilter: ${x.acceptedRank}`);
    if (x.indexProbeHits !== null) L.push(`       poi_index probe: ${x.indexProbeHits.join(' ; ') || 'NO ROWS'}`);
    if (x.note !== null) L.push(`       note: ${x.note}`);
  }
  for (const m of r.extractionMisses) {
    L.push(`   • EXTRACTION MISS — the corpus expects "${m}" and no extracted candidate names it`);
  }
  return L.join('\n');
}

function renderSummary(rows: readonly CaseResult[]): string {
  const t = tally(rows);
  const L: string[] = ['', '='.repeat(96)];
  L.push(`TikTok recognition corpus — ${URL_}, region tlv, ${env.rows} rows, release ${ingestConfig.overtureRelease}`);
  L.push('='.repeat(96));
  L.push('');
  for (const c of coverageCaveat(rows)) L.push(`   !! ${c}`);
  if (coverageCaveat(rows).length > 0) L.push('');
  L.push(`   AUTO-MATCH RATE:  ${t.autoMatch} / ${t.adjudicated}  (${pct(t.autoMatch, t.adjudicated)})`);
  L.push('   ^ adjudicated candidates that landed in `preselect` AND are the right venue.');
  L.push('     This is the number the owner asked to move. Unadjudicated results are excluded from');
  L.push('     both sides of it and reported separately below.');
  L.push('');
  L.push(`   correct but NOT auto-accepted (the picker was needed): ${t.correctNotAutoAccepted}`);
  L.push(`   wrong:                                                 ${t.wrong}`);
  L.push(`   of which extraction never named the venue:             ${t.extractionMisses}`);
  L.push(`   FALSE AUTO-ACCEPTS (preselect AND wrong):              ${t.falseAutoAccepts}   <- must be 0`);
  L.push(`   UNADJUDICATED (no corpus expectation; ruled by nobody): ${t.unadjudicated}`);
  L.push('');
  L.push(`   cases: ${t.cases}  (${Object.entries(t.caseStatuses).map(([k, n]) => `${k}=${n}`).join(' ')})`);
  L.push(`   network this run: ${oembedCalls} oEmbed fetch(es), ${llmCalls} LLM call(s), ${googleCalls} Google Text Search (${googleCacheHits} replayed from disk)${REFRESH ? '  [RECOGNITION_REFRESH=1 — cache bypassed]' : ''}`);
  L.push('');
  L.push('   failure buckets:');
  const order: FailureBucket[] = [
    'extraction_miss',
    'no_region_searched',
    'absent_from_index',
    'unreachable_in_index',
    'ranking',
    'not_auto_accepted',
    'resolver_failed',
    'capped',
  ];
  for (const k of order) {
    const v = t.buckets[k] ?? [];
    L.push(`     ${k.padEnd(22)} ${String(v.length).padStart(3)}  ${v.slice(0, 6).join(' ')}`);
  }
  L.push('='.repeat(96));
  L.push('');
  return L.join('\n');
}

/* ------------------------------------------------------------------------------------------- *
 * Run records
 * ------------------------------------------------------------------------------------------- */

/** Provider-scoped, so measuring Google never overwrites the Overture baseline it is being
 *  compared against. `overture` keeps the original unsuffixed names: it is the record every
 *  existing document already cites, and renaming it would break those citations. */
const SUFFIX = RESOLVER.provider === 'overture' ? '' : `.${RESOLVER.provider}`;
const OUT_JSON = fileURLToPath(
  new URL(`../../docs/evidence/places/tiktok-recognition-run${SUFFIX}.json`, import.meta.url),
);
const OUT_MD = fileURLToPath(
  new URL(`../../docs/evidence/places/tiktok-recognition${SUFFIX}.md`, import.meta.url),
);

afterAll(() => {
  if (!env.ok || results.length === 0) return;
  const t = tally(results);

  writeFileSync(
    OUT_JSON,
    `${JSON.stringify(
      {
        _comment:
          'Machine record of a tests/manual/tiktok-recognition.manual.ts run — real TikTok URLs ' +
          'through the real oEmbed → caption → extraction → resolve flow. Regenerated on every ' +
          'run; see tiktok-recognition.md for the human reading. Corpus: ' +
          'tests/manual/tiktok-recognition-corpus.json.',
        run_at: new Date().toISOString(),
        supabase_url: URL_,
        overture_release: ingestConfig.overtureRelease,
        region: env.region,
        poi_index_rows_tlv: env.rows,
        resolver: { provider: RESOLVER.provider, reason: RESOLVER.reason },
        extractor: extractor === null ? null : { version: extractor.version, promptVersion: extractor.promptVersion },
        cache_bypassed: REFRESH,
        network_this_run: {
          oembed_fetches: oembedCalls,
          llm_calls: llmCalls,
          google_text_search_calls: googleCalls,
          google_text_search_replayed: googleCacheHits,
        },
        summary: {
          auto_match: t.autoMatch,
          adjudicated: t.adjudicated,
          auto_match_rate: t.adjudicated === 0 ? null : t.autoMatch / t.adjudicated,
          correct_not_auto_accepted: t.correctNotAutoAccepted,
          wrong: t.wrong,
          extraction_misses: t.extractionMisses,
          false_auto_accepts: t.falseAutoAccepts,
          unadjudicated: t.unadjudicated,
          cases: t.cases,
          case_statuses: t.caseStatuses,
          failure_buckets: Object.fromEntries(Object.entries(t.buckets).map(([k, v]) => [k, v.length])),
        },
        cases: results,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const md: string[] = [];
  md.push('# TikTok recognition corpus — run record');
  md.push('');
  md.push('> Generated by `tests/manual/tiktok-recognition.manual.ts`. **Rewritten on every run** —');
  md.push('> edit the harness or the corpus, not this file. The machine record is');
  md.push('> `tiktok-recognition-run.json`.');
  md.push('');
  md.push(`Run at **${new Date().toISOString()}** against \`${URL_}\`, region \`tlv\`, ${env.rows} rows, release \`${ingestConfig.overtureRelease}\`.`);
  md.push(extractor === null ? 'No extractor configured; cached extractions only.' : `Extractor: \`${extractor.version}\` / prompt \`${extractor.promptVersion}\`.`);
  md.push(`Resolver: **\`${RESOLVER.provider}\`** (${RESOLVER.reason}).`);
  md.push('');
  md.push(`## Auto-match rate: **${t.autoMatch} / ${t.adjudicated}** (${pct(t.autoMatch, t.adjudicated)})`);
  md.push('');
  const caveats = coverageCaveat(results);
  if (caveats.length > 0) {
    for (const c of caveats) md.push(`> **${c}**`);
    md.push('');
  }
  md.push('The share of adjudicated extracted candidates that landed in the `preselect` band **and**');
  md.push('are the right venue — i.e. the share the user never had to touch the picker for.');
  md.push('');
  md.push('| | |');
  md.push('|---|---|');
  md.push(`| Corpus cases | ${t.cases} (${Object.entries(t.caseStatuses).map(([k, n]) => `${k}: ${n}`).join(', ')}) |`);
  md.push(`| Adjudicated candidates | ${t.adjudicated} |`);
  md.push(`| Auto-matched | ${t.autoMatch} |`);
  md.push(`| Correct but not auto-accepted | ${t.correctNotAutoAccepted} |`);
  md.push(`| Wrong | ${t.wrong} |`);
  md.push(`| — of which extraction never named the venue | ${t.extractionMisses} |`);
  md.push(`| **False auto-accepts** (preselect AND wrong) | **${t.falseAutoAccepts}** |`);
  md.push(`| Unadjudicated (counted in neither direction) | ${t.unadjudicated} |`);
  md.push(
    `| Network this run | ${oembedCalls} oEmbed, ${llmCalls} LLM, ${googleCalls} Google Text Search (${googleCacheHits} replayed) |`,
  );
  md.push('');
  md.push('## Failure buckets');
  md.push('');
  md.push('| Bucket | n | What it means, and what fixes it |');
  md.push('|---|---|---|');
  const meaning: Record<string, string> = {
    extraction_miss: 'The caption names the venue; the model produced no candidate string for it. Prompt/extraction work.',
    no_region_searched: '`cityHint` mapped to no loaded region, so the database was never queried. Region inference.',
    absent_from_index: 'No row for this venue in `poi_index`, in either script. Coverage — a different dataset or a wider ingest.',
    unreachable_in_index: 'The row IS there; the prefilter cannot reach it from these tokens. The Hebrew/Latin alias gap.',
    ranking: 'The right row was prefiltered and ranked below something else. Scorer weights.',
    not_auto_accepted: 'Top-1 was right but the band was not `preselect`, so the picker was needed. Band policy.',
    resolver_failed: 'The lookup errored in transport.',
    capped: `Past MAX_CANDIDATES (${MAX_CANDIDATES}); kept and visible, never resolved.`,
  };
  for (const k of order2()) {
    const v = t.buckets[k] ?? [];
    md.push(`| \`${k}\` | ${v.length} | ${meaning[k] ?? ''} |`);
  }
  md.push('');
  md.push('## Per case');
  md.push('');
  md.push('```');
  for (const r of results) md.push(renderCase(r));
  md.push('```');
  md.push('');
  if (t.unadjudicated > 0) {
    md.push('## Owed: adjudication');
    md.push('');
    md.push(`${t.unadjudicated} candidate(s) above are marked \`UNADJUDICATED\` — the corpus carries no`);
    md.push('`expected` entry that names them, so nothing here rules them right or wrong. Each one prints');
    md.push('its name, address, coordinates and top-3, which is enough to rule from this file. Add the');
    md.push('verdict to `tests/manual/tiktok-recognition-corpus.json` and re-run; it costs no LLM calls.');
    md.push('');
  }
  writeFileSync(OUT_MD, `${md.join('\n')}\n`, 'utf8');

  console.log(`[tiktok-recognition] wrote ${OUT_JSON}`);
  console.log(`[tiktok-recognition] wrote ${OUT_MD}`);
});

function order2(): FailureBucket[] {
  return [
    'extraction_miss',
    'no_region_searched',
    'absent_from_index',
    'unreachable_in_index',
    'ranking',
    'not_auto_accepted',
    'resolver_failed',
    'capped',
  ];
}
