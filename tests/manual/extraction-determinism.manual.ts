/**
 * TRACK1-STABLE — **how stable is extraction output at all**, measured on the 13-URL recognition
 * corpus by calling the real extractor N times per caption.
 *
 * NOT part of CI (`vitest.config.ts` includes only `tests/unit/**` and `src/**`), and additionally
 * gated on an explicit env flag so it cannot run by accident even under the manual config:
 *
 *   set -a; source .env.local; set +a
 *   EXTRACTION_DETERMINISM=1 npx vitest run tests/manual/extraction-determinism.manual.ts \
 *     --config tests/manual/vitest.manual.config.ts
 *
 * ## Why this exists
 *
 * `tiktok-recognition.manual.ts` reports exactly one `extraction_miss` — a caption naming
 * בראסרי 18 that returned zero candidates. Extracting from that *same* caption three times gave
 * `[]` once and the correct candidate twice, with `temperature: 0` already set. So the miss is not
 * a prompt defect and not a settings defect; it is a sample from a distribution nobody in this
 * repo has ever measured. This harness measures the distribution instead of the specimen.
 *
 * ## What it spends, and what it replays
 *
 * One LLM call per (caption × run). 13 × 5 = 65 against a **500 calls/day shared** budget. Every
 * run's output is written to `docs/evidence/.local/extraction-determinism/` keyed by extractor
 * version, prompt version, caption hash and run index, so re-running the *analysis* costs zero
 * calls. `DETERMINISM_REFRESH=1` re-spends the whole grid — do it deliberately.
 *
 * No oEmbed traffic at all: captions come from `docs/evidence/.local/tiktok-recognition-cache/`,
 * falling back to the committed run record. A caption available in neither is skipped loudly
 * rather than re-fetched from TikTok.
 *
 * ## What it can and cannot see
 *
 * `PlaceExtractor.extract` returns candidates that have already been through
 * `postProcessCandidates` (`filterPlausible` then `applyGrounding`) inside the adapter, so a
 * returned `[]` is ambiguous between "the model produced nothing" and "our own gate dropped
 * everything". That ambiguity is resolved here without touching adapter code, by capturing the
 * `extraction.plausibility_dropped` and `extraction.grounding` log events the adapter already
 * emits: raw candidate count = kept + dropped. `extraction.cost` gives the billed token counts.
 *
 * It goes one step further than the log events and records the **raw model response body**, by
 * wrapping `globalThis.fetch` before the factory builds the adapter (the adapter binds `fetch` at
 * construction). Nothing in `src/` changes, and the ambiguity `tiktok-recognition.manual.ts`'s
 * header calls unanswerable — "did the model decline, or did our own filter drop it?" — becomes a
 * lookup in the run cache rather than another live call. Those bodies stay in
 * `docs/evidence/.local/` (gitignored) because they are caption-derived third-party text.
 *
 * What it **cannot** measure is the false-positive side of a retry-on-empty policy: all 13 corpus
 * captions name at least one real venue, so there is no caption here for which `[]` is the correct
 * answer. That gap is reported rather than estimated.
 *
 * `DETERMINISM_ONLY=<externalId>` and `DETERMINISM_RUN_OFFSET=<n>` add fresh cells for one caption
 * without disturbing (or replaying over) an already-measured grid.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { captionContentExtractor } from '@/integrations/tiktok/caption-content-extractor';
import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { normalise } from '@/domain/places/normalise';
import { DomainError } from '@/domain/errors';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { PlaceCandidate, RawSource } from '@/domain/types';

/* ------------------------------------------------------------------------------------------- *
 * Inputs — all on disk. Nothing here touches TikTok.
 * ------------------------------------------------------------------------------------------- */

const RECOGNITION_CACHE = fileURLToPath(
  new URL('../../docs/evidence/.local/tiktok-recognition-cache/', import.meta.url),
);
const RUN_RECORD = fileURLToPath(
  new URL('../../docs/evidence/places/tiktok-recognition-run.google.json', import.meta.url),
);
const CACHE_DIR = fileURLToPath(
  new URL('../../docs/evidence/.local/extraction-determinism/', import.meta.url),
);
const OUT_JSON = fileURLToPath(
  new URL('../../docs/evidence/.local/extraction-determinism-run.json', import.meta.url),
);

const ENABLED = process.env.EXTRACTION_DETERMINISM === '1';
const REFRESH = process.env.DETERMINISM_REFRESH === '1';
const RUNS = Number.parseInt(process.env.DETERMINISM_RUNS ?? '5', 10);
const ONLY = process.env.DETERMINISM_ONLY ?? null;
const RUN_OFFSET = Number.parseInt(process.env.DETERMINISM_RUN_OFFSET ?? '0', 10);

/**
 * Between calls. Measured on 2026-08-28: a 1.2 s gap put 52 calls through in 166 s (~19/min) and
 * **11 of them came back `EXTRACTOR_UNAVAILABLE`** — the endpoint's per-minute cap, not a model
 * failure. 4.5 s holds the grid under ~13/min, which completed clean.
 */
const CALL_SPACING_MS = 4_500;

/**
 * Attempts per (caption, run) on a **transport** failure only, with backoff. This is emphatically
 * not the retry-on-empty policy under evaluation: a rate-limited call produced no sample at all,
 * so retrying it repairs the measurement, whereas retrying an empty *answer* would change the
 * distribution being measured. Transport attempts are counted separately and reported.
 */
const TRANSPORT_ATTEMPTS = 3;
const TRANSPORT_BACKOFF_MS = 20_000;

function sha(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

interface CachedSource {
  readonly externalId: string;
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly canonicalUrl: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string;
}

interface RunRecordCase {
  readonly url: string;
  readonly externalId: string | null;
  readonly caption: string | null;
}

interface Corpus {
  readonly url: string;
  readonly externalId: string;
  readonly caption: string;
  readonly captionFrom: 'oembed-cache' | 'run-record';
}

function loadCorpus(): { cases: readonly Corpus[]; skipped: readonly string[] } {
  if (!existsSync(RUN_RECORD)) return { cases: [], skipped: ['run record missing'] };
  const record = JSON.parse(readFileSync(RUN_RECORD, 'utf8')) as { cases: readonly RunRecordCase[] };
  const cases: Corpus[] = [];
  const skipped: string[] = [];
  for (const c of record.cases) {
    if (c.externalId === null) {
      skipped.push(`${c.url}: no externalId in the run record`);
      continue;
    }
    const file = `${RECOGNITION_CACHE}oembed-${c.externalId}.json`;
    let caption: string | null = null;
    let from: Corpus['captionFrom'] = 'oembed-cache';
    if (existsSync(file)) {
      caption = (JSON.parse(readFileSync(file, 'utf8')) as CachedSource).caption;
    } else if (c.caption !== null) {
      caption = c.caption;
      from = 'run-record';
    }
    if (caption === null || caption.trim() === '') {
      skipped.push(`${c.url}: no caption on disk (would need a TikTok fetch — refused)`);
      continue;
    }
    cases.push({ url: c.url, externalId: c.externalId, caption, captionFrom: from });
  }
  return { cases, skipped };
}

const { cases: ALL_CASES, skipped: CORPUS_SKIPPED } = loadCorpus();
const CORPUS = ONLY === null ? ALL_CASES : ALL_CASES.filter((c) => c.externalId === ONLY);

/* ------------------------------------------------------------------------------------------- *
 * Raw-response capture. Installed **before** `createPlaceExtractor`, because the Gemini adapter
 * binds `config.fetchImpl ?? fetch` once at construction — wrapping afterwards would capture
 * nothing. Read-only: the body is taken from a `clone()`, so the adapter's own `json()` is
 * untouched, and a capture failure is swallowed rather than turned into a fake extraction failure.
 * ------------------------------------------------------------------------------------------- */

let lastRawBody: string | null = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await realFetch(input, init);
  try {
    lastRawBody = await response.clone().text();
  } catch {
    lastRawBody = null;
  }
  return response;
}) as typeof fetch;

/* ------------------------------------------------------------------------------------------- *
 * The extractor, built exactly the way the product builds it.
 * ------------------------------------------------------------------------------------------- */

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
}

const SKIP_REASON: string | null = !ENABLED
  ? 'EXTRACTION_DETERMINISM is not 1. This harness spends real Gemini calls against a shared ' +
    '500/day budget, so it never runs unless asked by name.'
  : CORPUS.length === 0
    ? `no captions on disk (${CORPUS_SKIPPED.join('; ')})`
    : extractor === null
      ? `no LLM extractor configured (${extractorError ?? 'unknown'}). Cached runs alone cannot ` +
        'be replayed without one, because the cache key is the extractor version.'
      : null;

if (SKIP_REASON !== null) {
  console.warn(`\n[extraction-determinism] SKIPPED — ${SKIP_REASON}\n`);
}

/* ------------------------------------------------------------------------------------------- *
 * One run
 * ------------------------------------------------------------------------------------------- */

interface RunRecord {
  readonly runIndex: number;
  readonly candidates: readonly PlaceCandidate[];
  readonly cityHint: string | null;
  /** Candidates the model returned before `filterPlausible`/`applyGrounding`, derived from the
   *  adapter's own drop counters. Distinguishes a model `[]` from a gated-to-empty `[]`. */
  readonly rawCandidateCount: number;
  readonly plausibilityDropped: Record<string, number>;
  readonly groundingCounters: Record<string, number>;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly elapsedMs: number;
  readonly error: string | null;
  /** The adapter's own message, kept because `EXTRACTOR_UNAVAILABLE` alone cannot tell a 429 from
   *  a 500, and the two mean opposite things about whether the grid is trustworthy. */
  readonly errorDetail: string | null;
  /** The model's response body verbatim, before `ExtractionResultSchema` and before
   *  `postProcessCandidates`. The only way to tell a model `[]` from a gated-to-`[]`. */
  readonly rawBody: string | null;
  readonly from: 'cache' | 'live';
}

let liveCalls = 0;
let cacheHits = 0;
let transportRetries = 0;

function capturingCtx(): { ctx: OpCtx; events: { name: string; fields: Record<string, unknown> }[] } {
  const events: { name: string; fields: Record<string, unknown> }[] = [];
  return {
    events,
    ctx: {
      signal: new AbortController().signal,
      importId: null,
      log: { event: (name: string, fields: Record<string, unknown>) => events.push({ name, fields }) },
    } as unknown as OpCtx,
  };
}

function numbersOf(fields: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(fields ?? {})) if (typeof v === 'number') out[k] = v;
  return out;
}

async function runOnce(c: Corpus, runIndex: number): Promise<RunRecord> {
  const ex = extractor as PlaceExtractor;
  lastRawBody = null;
  const key = `${ex.version}-${ex.promptVersion}-${sha(c.caption).slice(0, 16)}-r${runIndex}.json`;
  const path = `${CACHE_DIR}${key.replace(/[^a-zA-Z0-9._-]/gu, '_')}`;

  if (!REFRESH && existsSync(path)) {
    cacheHits += 1;
    return { ...(JSON.parse(readFileSync(path, 'utf8')) as RunRecord), from: 'cache' };
  }

  const raw: RawSource = {
    id: c.externalId,
    externalId: c.externalId,
    authorHandle: null,
    authorName: null,
    canonicalUrl: c.url,
    thumbnailUrl: null,
    texts: [{ kind: 'caption', text: c.caption }],
    media: [],
  };
  const { ctx, events } = capturingCtx();
  const parts = await captionContentExtractor.extract(raw, ctx);

  const startedAt = Date.now();
  let record: RunRecord | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < TRANSPORT_ATTEMPTS && record === null; attempt++) {
    if (attempt > 0) {
      transportRetries += 1;
      await new Promise((r) => setTimeout(r, TRANSPORT_BACKOFF_MS * attempt));
    }
    try {
      liveCalls += 1;
      const out = await ex.extract(parts, ctx);
      const dropped = numbersOf(events.find((e) => e.name === 'extraction.plausibility_dropped')?.fields);
      const grounding = numbersOf(events.find((e) => e.name === 'extraction.grounding')?.fields);
      const cost = numbersOf(events.find((e) => e.name === 'extraction.cost')?.fields);
      record = {
        runIndex,
        candidates: out.candidates,
        cityHint: out.cityHint,
        rawCandidateCount: out.candidates.length + (dropped.total ?? 0),
        plausibilityDropped: dropped,
        groundingCounters: grounding,
        inputTokens: cost.inputTokens ?? 0,
        outputTokens: cost.outputTokens ?? 0,
        elapsedMs: cost.elapsedMs ?? Date.now() - startedAt,
        error: null,
        errorDetail: null,
        rawBody: lastRawBody,
        from: 'live',
      };
    } catch (e) {
      lastError = e;
    }
  }

  if (record === null) {
    // A transport failure is recorded, never cached: caching it would freeze one bad minute into
    // the measurement for every future replay.
    return {
      runIndex,
      candidates: [],
      cityHint: null,
      rawCandidateCount: 0,
      plausibilityDropped: {},
      groundingCounters: {},
      inputTokens: 0,
      outputTokens: 0,
      elapsedMs: Date.now() - startedAt,
      error: lastError instanceof DomainError ? lastError.code : lastError instanceof Error ? lastError.message : String(lastError),
      errorDetail: lastError instanceof Error ? lastError.message : String(lastError),
      rawBody: lastRawBody,
      from: 'live',
    };
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await new Promise((r) => setTimeout(r, CALL_SPACING_MS));
  return record;
}

/* ------------------------------------------------------------------------------------------- *
 * Metrics. Pure functions over the recorded runs — every number below is recomputable from the
 * run cache with zero further calls.
 * ------------------------------------------------------------------------------------------- */

const EARTH_RADIUS_M = 6_371_008.8;

export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** The identity key the product uses: `rawName`, not the model's inference (`current-state` §7). */
function identityKey(c: PlaceCandidate): string {
  return normalise(c.rawName);
}

function setSignature(run: RunRecord): string {
  return [...new Set(run.candidates.map(identityKey))].sort().join(' | ') || '∅';
}

interface FieldStability {
  readonly field: string;
  readonly distinct: number;
  readonly values: readonly string[];
}

interface CandidateStability {
  readonly key: string;
  readonly appearedIn: number;
  readonly fields: readonly FieldStability[];
  /** Largest pairwise distance between the model's guessed coordinates across runs, in metres.
   *  `null` when fewer than two runs produced a coordinate. */
  readonly coordinateSpreadM: number | null;
  readonly coordinateNulls: number;
}

function fieldValue(c: PlaceCandidate, field: string): string {
  switch (field) {
    case 'identifiedName':
      return c.identifiedName ?? '∅';
    case 'nameVariants':
      return [...c.nameVariants].sort().join(', ') || '∅';
    case 'addressHint':
      return c.addressHint ?? '∅';
    case 'categoryHint':
      return c.categoryHint ?? '∅';
    case 'cityHint':
      return c.cityHint ?? '∅';
    case 'areaHint':
      return c.areaHint ?? '∅';
    case 'evidence':
      return c.evidence ?? '∅';
    case 'tags':
      return [...c.tags].sort().join(', ') || '∅';
    case 'dishes':
      return [...c.dishes].sort().join(', ') || '∅';
    case 'modelConfidence':
      return c.modelConfidence === null ? '∅' : c.modelConfidence.toFixed(2);
    default:
      return '?';
  }
}

const TRACKED_FIELDS = [
  'identifiedName',
  'nameVariants',
  'addressHint',
  'categoryHint',
  'cityHint',
  'areaHint',
  'evidence',
  'tags',
  'dishes',
  'modelConfidence',
] as const;

function stabilityFor(runs: readonly RunRecord[]): readonly CandidateStability[] {
  const byKey = new Map<string, PlaceCandidate[]>();
  for (const run of runs) {
    // One appearance per run: a caption that names the same venue twice must not double-count.
    const seen = new Set<string>();
    for (const cand of run.candidates) {
      const k = identityKey(cand);
      if (seen.has(k)) continue;
      seen.add(k);
      const bucket = byKey.get(k) ?? [];
      bucket.push(cand);
      byKey.set(k, bucket);
    }
  }
  const out: CandidateStability[] = [];
  for (const [key, cands] of byKey) {
    const fields = TRACKED_FIELDS.map((field) => {
      const values = [...new Set(cands.map((c) => fieldValue(c, field)))];
      return { field, distinct: values.length, values };
    });
    const coords = cands.map((c) => c.coordinates).filter((c): c is { lat: number; lng: number } => c !== null);
    let spread: number | null = null;
    if (coords.length >= 2) {
      spread = 0;
      for (let i = 0; i < coords.length; i++) {
        for (let j = i + 1; j < coords.length; j++) {
          const d = metresBetween(coords[i] as { lat: number; lng: number }, coords[j] as { lat: number; lng: number });
          if (d > (spread as number)) spread = d;
        }
      }
    }
    out.push({
      key,
      appearedIn: cands.length,
      fields,
      coordinateSpreadM: spread,
      coordinateNulls: cands.length - coords.length,
    });
  }
  return out.sort((a, b) => b.appearedIn - a.appearedIn);
}

interface CaseMetrics {
  readonly url: string;
  readonly externalId: string;
  readonly captionChars: number;
  readonly captionFrom: string;
  readonly runs: number;
  readonly errors: number;
  readonly emptyRuns: number;
  /** Of the empty runs, how many were empty *before* our own gates ran. */
  readonly emptyFromModel: number;
  readonly candidateCounts: readonly number[];
  readonly setSignatures: Record<string, number>;
  readonly distinctSets: number;
  readonly modalSetShare: number;
  readonly stability: readonly CandidateStability[];
  readonly meanInputTokens: number;
  readonly meanOutputTokens: number;
  readonly meanElapsedMs: number;
}

function metricsFor(c: Corpus, runs: readonly RunRecord[]): CaseMetrics {
  const ok = runs.filter((r) => r.error === null);
  const sigs: Record<string, number> = {};
  for (const r of ok) sigs[setSignature(r)] = (sigs[setSignature(r)] ?? 0) + 1;
  const counts = Object.values(sigs);
  const modal = counts.length === 0 ? 0 : Math.max(...counts);
  const empties = ok.filter((r) => r.candidates.length === 0);
  const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    url: c.url,
    externalId: c.externalId,
    captionChars: c.caption.length,
    captionFrom: c.captionFrom,
    runs: runs.length,
    errors: runs.length - ok.length,
    emptyRuns: empties.length,
    emptyFromModel: empties.filter((r) => r.rawCandidateCount === 0).length,
    candidateCounts: ok.map((r) => r.candidates.length),
    setSignatures: sigs,
    distinctSets: Object.keys(sigs).length,
    modalSetShare: ok.length === 0 ? 0 : modal / ok.length,
    stability: stabilityFor(ok),
    meanInputTokens: mean(ok.map((r) => r.inputTokens)),
    meanOutputTokens: mean(ok.map((r) => r.outputTokens)),
    meanElapsedMs: mean(ok.map((r) => r.elapsedMs)),
  };
}

/**
 * Retry-on-empty, estimated from the grid without spending a call.
 *
 * Over all ordered pairs of distinct runs (i, j) of the same caption, `i` stands for the first
 * call and `j` for the retry. This is sampling without replacement from N draws of the same
 * distribution, which is exactly what "call it again" is.
 */
function retrySimulation(all: readonly { readonly metrics: CaseMetrics; readonly runs: readonly RunRecord[] }[]) {
  let firstEmpty = 0;
  let pairs = 0;
  let rescued = 0;
  let stillEmpty = 0;
  // Two retries: (i empty, j empty, k non-empty).
  let triplesFirstEmpty = 0;
  let rescuedByTwo = 0;

  for (const { runs } of all) {
    const ok = runs.filter((r) => r.error === null);
    for (let i = 0; i < ok.length; i++) {
      for (let j = 0; j < ok.length; j++) {
        if (i === j) continue;
        pairs += 1;
        const a = ok[i] as RunRecord;
        const b = ok[j] as RunRecord;
        if (a.candidates.length > 0) continue;
        firstEmpty += 1;
        if (b.candidates.length > 0) rescued += 1;
        else stillEmpty += 1;
        for (let k = 0; k < ok.length; k++) {
          if (k === i || k === j) continue;
          if (b.candidates.length > 0) continue;
          triplesFirstEmpty += 1;
          if ((ok[k] as RunRecord).candidates.length > 0) rescuedByTwo += 1;
        }
      }
    }
  }
  return { pairs, firstEmpty, rescued, stillEmpty, triplesFirstEmpty, rescuedByTwo };
}

/**
 * The cheap deterministic pre-check the retry ruling has to be measured against: does the caption
 * carry a location marker, an address-shaped fragment, or an explicit address label? Read-only
 * over the caption; no model, no network.
 *
 * `parseAddress` in `places/score.ts` is the repo's address parser and is deliberately NOT called
 * here — it answers "are these two address strings the same street", over an already-isolated
 * address field, and it accepts any token run with a digit-free word in it. Asked "does this
 * caption contain an address" it says yes for almost every caption in the corpus, which would make
 * the gate a constant. What is measured instead is the three signals a human would actually use.
 */
export function emptyIsSuspicious(caption: string): {
  readonly suspicious: boolean;
  readonly signals: readonly string[];
} {
  const signals: string[] = [];
  if (/📍|🍽️|🏠/u.test(caption)) signals.push('pin_marker');
  // A house number attached to a word: "לבונטין 19", "12 Main St", "Dizengoff 99".
  if (/(\p{L}{2,}[\p{L}'’-]*)\s+\d{1,4}\b|\b\d{1,4}\s+(\p{L}{2,}[\p{L}'’-]*)/u.test(caption)) {
    signals.push('house_number');
  }
  if (/כתובת\s*:|address\s*:/iu.test(caption)) signals.push('address_label');
  if (/@[\p{L}\p{N}._]{2,}/u.test(caption)) signals.push('handle_mention');
  return { suspicious: signals.length > 0, signals };
}

/* ------------------------------------------------------------------------------------------- *
 * The run
 * ------------------------------------------------------------------------------------------- */

const collected: { metrics: CaseMetrics; runs: readonly RunRecord[]; caption: string }[] = [];

describe.skipIf(SKIP_REASON !== null)('extraction determinism over the recognition corpus', () => {
  for (const [i, c] of CORPUS.entries()) {
    it(`case ${i + 1}/${CORPUS.length} × ${RUNS} runs — ${c.url}`, async () => {
      const runs: RunRecord[] = [];
      for (let r = 0; r < RUNS; r++) runs.push(await runOnce(c, RUN_OFFSET + r));
      const metrics = metricsFor(c, runs);
      collected.push({ metrics, runs, caption: c.caption });
      console.log(renderCase(metrics));

      // The only per-case assertion: a transport failure invalidates that case's numbers, and a
      // silently short grid would be reported as stability.
      expect(metrics.errors, `runs that failed in transport for ${c.url}`).toBe(0);
    }, 60_000 * Math.max(1, RUNS));
  }

  it('summary', () => {
    expect(collected.length, 'every corpus caption ran').toBe(CORPUS.length);
    console.log(renderSummary());
  });
});

/* ------------------------------------------------------------------------------------------- *
 * Reporting
 * ------------------------------------------------------------------------------------------- */

function renderCase(m: CaseMetrics): string {
  const L: string[] = [''];
  L.push(`── ${m.url}  (${m.captionChars} chars, ${m.captionFrom})`);
  L.push(
    `   runs=${m.runs} errors=${m.errors} empty=${m.emptyRuns}/${m.runs} (model-empty ${m.emptyFromModel})  ` +
      `counts=[${m.candidateCounts.join(',')}]  distinct sets=${m.distinctSets} modal share=${(m.modalSetShare * 100).toFixed(0)}%`,
  );
  for (const [sig, n] of Object.entries(m.setSignatures).sort((a, b) => b[1] - a[1])) {
    L.push(`     ${String(n).padStart(2)}× {${sig}}`);
  }
  for (const s of m.stability) {
    const unstable = s.fields.filter((f) => f.distinct > 1);
    L.push(
      `   • "${s.key}" in ${s.appearedIn}/${m.runs - m.errors} runs  coordSpread=${
        s.coordinateSpreadM === null ? 'n/a' : `${s.coordinateSpreadM.toFixed(0)} m`
      }${s.coordinateNulls > 0 ? ` (${s.coordinateNulls} null)` : ''}`,
    );
    if (unstable.length === 0) {
      L.push('       every tracked field identical across runs');
    } else {
      for (const f of unstable) L.push(`       ${f.field}: ${f.distinct} values → ${f.values.map((v) => `"${v}"`).join(' / ')}`);
    }
  }
  L.push(`   tokens: in≈${m.meanInputTokens.toFixed(0)} out≈${m.meanOutputTokens.toFixed(0)}  latency≈${m.meanElapsedMs.toFixed(0)} ms`);
  return L.join('\n');
}

function renderSummary(): string {
  const L: string[] = ['', '='.repeat(96)];
  L.push(`Extraction determinism — ${extractor?.version} / prompt ${extractor?.promptVersion}, N=${RUNS}`);
  L.push('='.repeat(96));
  const totalRuns = collected.reduce((a, c) => a + c.metrics.runs, 0);
  const emptyRuns = collected.reduce((a, c) => a + c.metrics.emptyRuns, 0);
  const capsWithEmpty = collected.filter((c) => c.metrics.emptyRuns > 0).length;
  const capsAllEmpty = collected.filter((c) => c.metrics.emptyRuns === c.metrics.runs).length;
  const stableSet = collected.filter((c) => c.metrics.distinctSets === 1).length;

  L.push(
    `   captions: ${collected.length}   runs: ${totalRuns}   live calls this run: ${liveCalls} ` +
      `(${transportRetries} were transport retries)   replayed: ${cacheHits}`,
  );
  L.push(`   EMPTY RESULT RATE:        ${emptyRuns}/${totalRuns} runs`);
  L.push(`   captions with ≥1 empty run: ${capsWithEmpty}/${collected.length}   always empty: ${capsAllEmpty}`);
  L.push(`   captions whose candidate SET was identical across all runs: ${stableSet}/${collected.length}`);
  L.push('');

  const fieldRows: Record<string, { groups: number; unstable: number }> = {};
  const spreads: number[] = [];
  for (const c of collected) {
    for (const s of c.metrics.stability) {
      if (s.appearedIn < 2) continue;
      for (const f of s.fields) {
        const row = (fieldRows[f.field] ??= { groups: 0, unstable: 0 });
        row.groups += 1;
        if (f.distinct > 1) row.unstable += 1;
      }
      if (s.coordinateSpreadM !== null) spreads.push(s.coordinateSpreadM);
    }
  }
  L.push('   field instability on candidates seen in ≥2 runs (unstable / groups):');
  for (const [field, row] of Object.entries(fieldRows)) {
    L.push(`     ${field.padEnd(18)} ${String(row.unstable).padStart(3)} / ${String(row.groups).padStart(3)}`);
  }
  spreads.sort((a, b) => a - b);
  const q = (p: number) => (spreads.length === 0 ? 0 : (spreads[Math.min(spreads.length - 1, Math.floor(p * spreads.length))] as number));
  L.push(
    `     coordinate spread (m):  n=${spreads.length}  median=${q(0.5).toFixed(0)}  p90=${q(0.9).toFixed(0)}  max=${(spreads[spreads.length - 1] ?? 0).toFixed(0)}  zero=${spreads.filter((s) => s === 0).length}`,
  );
  L.push('');

  const sim = retrySimulation(collected);
  L.push('   retry-on-empty, simulated over ordered pairs of runs:');
  L.push(`     first call empty:      ${sim.firstEmpty} / ${sim.pairs} ordered pairs`);
  L.push(`     one retry rescues:     ${sim.rescued} / ${sim.firstEmpty}`);
  L.push(`     still empty after 1:   ${sim.stillEmpty}`);
  L.push(`     second retry rescues:  ${sim.rescuedByTwo} / ${sim.triplesFirstEmpty}`);
  L.push('');

  L.push('   pre-check (emptyIsSuspicious) against the empty runs it would have gated:');
  for (const c of collected) {
    const g = emptyIsSuspicious(c.caption);
    L.push(
      `     ${c.metrics.externalId}  empty=${c.metrics.emptyRuns}/${c.metrics.runs}  suspicious=${g.suspicious}  [${g.signals.join(',')}]`,
    );
  }
  L.push('');
  const inTok = collected.reduce((a, c) => a + c.metrics.meanInputTokens, 0) / Math.max(1, collected.length);
  const outTok = collected.reduce((a, c) => a + c.metrics.meanOutputTokens, 0) / Math.max(1, collected.length);
  L.push(`   cost per import: 1 call, ≈${inTok.toFixed(0)} input + ≈${outTok.toFixed(0)} output tokens.`);
  L.push('   No verified per-token price for this model is on record (gemini.place-extractor.ts),');
  L.push('   and the binding constraint is calls/day, not tokens.');
  L.push('='.repeat(96));
  return L.join('\n');
}

afterAll(() => {
  if (SKIP_REASON !== null || collected.length === 0) return;
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    OUT_JSON,
    `${JSON.stringify(
      {
        _comment:
          'Machine record of tests/manual/extraction-determinism.manual.ts. Gitignored: it holds ' +
          'third-party caption-derived output per run. The reviewed reading is ' +
          'docs/evidence/extraction/determinism-2026-08-28.md.',
        run_at: new Date().toISOString(),
        extractor: extractor === null ? null : { version: extractor.version, promptVersion: extractor.promptVersion },
        runs_per_caption: RUNS,
        live_calls: liveCalls,
        transport_retries: transportRetries,
        replayed: cacheHits,
        retry_simulation: retrySimulation(collected),
        cases: collected.map((c) => ({
          ...c.metrics,
          preCheck: emptyIsSuspicious(c.caption),
          rawRuns: c.runs,
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`[extraction-determinism] wrote ${OUT_JSON}`);
});
