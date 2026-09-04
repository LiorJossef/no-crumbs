/**
 * E2-T0 — the grader. Runs the labelled owner corpus through the **real shipped path** —
 * `canonicaliseTikTokUrl` → oEmbed → `captionContentExtractor` → `PlaceExtractor` →
 * `filterPlausible` → `resolveCandidates` → `deriveResolution` — and reports, per class, what the
 * engine actually did.
 *
 *   npx vitest run tests/manual/owner-corpus.manual.ts \
 *     --config tests/manual/vitest.manual.config.ts
 *
 * That command, exactly as written, spends **nothing**: no network, no model call, no provider
 * lookup. Everything replays from the fixtures the seeder wrote. Adding provider lookups is a
 * deliberate act:
 *
 *   set -a && . ./.env.local && set +a
 *   PLACE_RESOLVER=google OWNER_CORPUS_LIVE=1 OWNER_CORPUS_MAX_LOOKUPS=10 npx vitest run ...
 *
 * ## What it measures, and against what
 *
 * The corpus is `tests/manual/owner-corpus.json`; its `_readme` is the format. Only rows the owner
 * has ruled on count. A `classSource: "draft"` row is **unadjudicated** — printed, named, and
 * excluded from both sides of every rate. Nothing here ever invents a label to fill a gap.
 *
 * Four numbers, all of them per class:
 *
 *  1. **posts yielding at least one correct place** — the product's own headline;
 *  2. **wrong places offered, pre-selected and shortlisted counted separately.** A wrong
 *     pre-select is shown to the user as settled fact and is the failure this product least
 *     tolerates; a wrong option in a picker is a ranking annoyance. Merging them into one "wrong"
 *     number is how a serious defect hides inside an acceptable one;
 *  3. **`postIntent` accuracy** — `extraction/schema.ts` says in terms that this is unmeasured and
 *     must not be shown to a user as a fact about the post until it is measured. This is the
 *     measurement;
 *  4. **the escalation gate's precision and recall** — does "we should look past the caption" fire
 *     on the posts a transcript could rescue (`recoverable`) and stay silent on the rest? Two
 *     gates are scored: the candidate-count gate we have today, and the same gate with `postIntent`
 *     added, which is the whole reason that field was introduced.
 *
 * ## The one assertion
 *
 * Zero wrong pre-selects. Everything else is reported, never asserted: a harness that goes red for
 * a known, accepted ranking miss is a harness nobody runs. An unlabelled corpus does **not** fail
 * either — it warns, loudly, with the exact next action. Red-by-default trains people to ignore
 * red.
 *
 * ## The provider fixture, and why the resolve half cannot go into CI
 *
 * Google Text Search answers are cached to `docs/evidence/.local/`, which is gitignored, because
 * Google's Service Specific Terms §5.4 cap lat/lng caching at 30 days (`06` §3.1, VERIFIED). So a
 * checkout that has never run this harness live can replay the extraction and intent half of the
 * measurement with no spend, and cannot replay the resolution half at all. That is a property of
 * the provider's terms, not of this design, and it is reported rather than papered over.
 */

import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

vi.mock('server-only', () => ({}));

import { createPlaceExtractor } from '@/integrations/llm/place-extractor-factory';
import { filterPlausible } from '@/domain/extraction/plausibility';
import { deriveResolution, MAX_CANDIDATES } from '@/domain/import/pipeline';
import { resolveCandidates } from '@/domain/import/resolve-candidates';
import {
  googlePlaceResolver,
  googlePlacesGateway,
  type GooglePlacesGateway,
  type GooglePlaceRow,
  type GoogleTextSearchParams,
} from '@/integrations/google/place-resolver';
import { placeResolverEnv, resolverProviderFor } from '@/integrations/places/place-resolver-factory';
import { POST_INTENTS, type PostIntent } from '@/domain/extraction/schema';
import type { PlaceExtractor } from '@/domain/ports';
import type { PlaceCandidate, ResolvedPlace } from '@/domain/types';

import {
  CORPUS_PATH,
  ESCALATION_POSITIVE,
  GOOGLE_TEXT_SEARCH_FREE_PER_MONTH,
  GOOGLE_TEXT_SEARCH_USD_PER_LOOKUP,
  INTENT_FOR_CLASS,
  OWNER_CLASSES,
  PROVIDER_DIR,
  RECORD_DIR,
  classAdjudicated,
  ctxOf,
  getCaption,
  getExtraction,
  placeMatches,
  rawSourceOf,
  readCorpus,
  readFixture,
  sampleOf,
  safeKey,
  sha,
  truePlacesOf,
  writeFixture,
  type OwnerCase,
  type OwnerClass,
  type TruePlace,
} from './owner-corpus-lib';

/* ------------------------------------------------------------------------------------------- *
 * Budget. Zero by default, and the default is the point.
 * ------------------------------------------------------------------------------------------- */

const LIVE = process.env.OWNER_CORPUS_LIVE === '1';
const MAX_LOOKUPS = LIVE ? Number.parseInt(process.env.OWNER_CORPUS_MAX_LOOKUPS ?? '0', 10) : 0;

let liveLookups = 0;
let fixtureLookups = 0;
let budgetRefusals = 0;
let missingFixtures = 0;

/** In call order, one entry per `PlaceResolver.resolve`, so a resolution can be attributed to the
 *  reason its lookup did or did not happen. `googlePlaceResolver` issues exactly one `searchText`
 *  per `resolve` when no `lookupStore` is wired, which is what makes the alignment sound. */
type LookupOutcome = 'fixture' | 'live' | 'budget' | 'no_fixture' | 'error';
const lookupLog: LookupOutcome[] = [];

/**
 * A `GooglePlacesGateway` that answers from disk first, spends only within budget, and never
 * silently substitutes one for the other. Keyed on every field of the request that can change
 * Google's answer and nothing else — the same four `place-resolver.ts` keys `place_lookups` on, so
 * a replayed run and a production run agree on what counts as the same lookup.
 */
function fixtureGateway(live: GooglePlacesGateway | null): GooglePlacesGateway {
  return {
    async searchText(params: GoogleTextSearchParams, signal: AbortSignal) {
      const key = JSON.stringify([
        params.textQuery,
        params.regionCode,
        params.languageCode,
        params.maxResultCount,
      ]);
      const file = `google-${safeKey(params.textQuery)}-${sha(key).slice(0, 16)}.json`;

      const hit = readFixture<{ readonly rows: readonly GooglePlaceRow[] }>(PROVIDER_DIR, file);
      if (hit !== null) {
        fixtureLookups += 1;
        lookupLog.push('fixture');
        return hit.rows;
      }
      if (live === null) {
        missingFixtures += 1;
        lookupLog.push('no_fixture');
        throw new Error('OWNER_CORPUS_NO_PROVIDER_FIXTURE');
      }
      if (liveLookups >= MAX_LOOKUPS) {
        budgetRefusals += 1;
        lookupLog.push('budget');
        throw new Error('OWNER_CORPUS_LOOKUP_BUDGET_EXHAUSTED');
      }
      const rows = await live.searchText(params, signal);
      liveLookups += 1;
      lookupLog.push('live');
      writeFixture(PROVIDER_DIR, file, { key, rows });
      return rows;
    },
  };
}

const RESOLVER_ENV = placeResolverEnv();

/**
 * The resolver under measurement, or `null` with a reason.
 *
 * Google only. The Overture path reads `poi_index` through a service-role client against the one
 * shared local database, and this harness has no business opening that connection to produce a
 * number — `tlv-resolve-benchmark.manual.ts` and `tiktok-recognition.manual.ts` are where the
 * Overture baseline is measured, with the region and row-count preconditions they check. Here, a
 * missing Google key is a clean "resolution not measured", not a silent switch to a different
 * provider whose numbers would be filed under the same heading.
 */
function buildResolver(): { resolver: ReturnType<typeof googlePlaceResolver> | null; reason: string } {
  const chosen = (() => {
    try {
      return resolverProviderFor(RESOLVER_ENV);
    } catch (e) {
      return { provider: 'overture' as const, reason: e instanceof Error ? e.message : String(e) };
    }
  })();
  if (chosen.provider !== 'google') {
    return {
      resolver: null,
      reason: `resolver selected by the shipped factory is "${chosen.provider}" (${chosen.reason}); this harness measures Google only`,
    };
  }
  const apiKey = RESOLVER_ENV.GOOGLE_PLACES_API_KEY ?? RESOLVER_ENV.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const liveGateway = LIVE && apiKey !== '' ? googlePlacesGateway(apiKey) : null;
  if (LIVE && liveGateway === null) {
    return { resolver: null, reason: 'OWNER_CORPUS_LIVE=1 but no Google Places API key is set' };
  }
  // `lookupStore: null` — the shared `place_lookups` table is another agent's state and this
  // harness does not write to it. The disk fixture plays the same role and cannot change a
  // resolution, only who pays for it.
  return {
    resolver: googlePlaceResolver(fixtureGateway(liveGateway), { lookupStore: null }),
    reason: LIVE ? `google, live up to ${MAX_LOOKUPS} lookup(s)` : 'google, replay only (no spend)',
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Per-case result
 * ------------------------------------------------------------------------------------------- */

type CaseStatus = 'ok' | 'no_caption' | 'no_extraction' | 'bad_url';

interface OfferedPlace {
  readonly tier: 'preselect' | 'shortlist';
  readonly name: string;
  readonly address: string | null;
  readonly correct: boolean;
  readonly matched: string | null;
}

interface CaseResult {
  readonly url: string;
  readonly externalId: string | null;
  readonly status: CaseStatus;
  readonly statusDetail: string | null;
  readonly caption: string | null;
  readonly ownerClass: OwnerClass | null;
  readonly classAdjudicated: boolean;
  /** `'owner'` — the sample this corpus exists to produce. `'e7'` — the borrowed 16-post
   *  web-search sample it exists to replace. `null` — nobody has ruled. Never merged. */
  readonly sample: 'owner' | 'e7' | null;
  readonly truePlaces: readonly TruePlace[] | null;
  readonly postIntent: PostIntent | null;
  readonly expectedIntent: PostIntent | null;
  readonly expectedIntentSource: 'explicit' | 'derived' | null;
  readonly rawCandidateNames: readonly string[];
  readonly keptCandidateNames: readonly string[];
  readonly droppedByPlausibility: Record<string, number> | null;
  /** `null` when resolution was not attempted for this case; `'partial'` when some lookups could
   *  not be made. Only `'complete'` cases enter the place-yield denominators. */
  readonly resolveStatus: 'complete' | 'partial' | 'not_attempted' | null;
  readonly resolveDetail: string | null;
  readonly offered: readonly OfferedPlace[];
  /** Expected venues that no extracted candidate even names — an extraction failure, distinct from
   *  a resolution one, and the two need different fixes. */
  readonly extractionMisses: readonly string[];
}

const results: CaseResult[] = [];

/* ------------------------------------------------------------------------------------------- *
 * The run
 * ------------------------------------------------------------------------------------------- */

const CORPUS = readCorpus();
const { resolver, reason: resolverReason } = buildResolver();

function buildExtractor(): PlaceExtractor | null {
  try {
    return createPlaceExtractor({
      ...(process.env.LLM_PROVIDER !== undefined ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {}),
      ...(process.env.ANTHROPIC_API_KEY !== undefined ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
      ...(process.env.ANTHROPIC_MODEL !== undefined ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
      ...(process.env.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: process.env.GEMINI_API_KEY } : {}),
      ...(process.env.GEMINI_MODEL !== undefined ? { GEMINI_MODEL: process.env.GEMINI_MODEL } : {}),
    });
  } catch {
    return null;
  }
}

const extractor = buildExtractor();

describe('E2-T0 — the owner corpus, graded', () => {
  it('grades every corpus case against the owner labels, and never against a guess', async () => {
    console.log(`\ncorpus:   ${CORPUS_PATH}  (${CORPUS.cases.length} case(s))`);
    console.log(`resolver: ${resolverReason}`);
    console.log(
      extractor === null
        ? 'extractor: none configured — cases replay from the `extractionFixture` each one names'
        : `extractor: ${extractor.version} · prompt ${extractor.promptVersion}  (replay only; the grader never calls the model)`,
    );
    console.log('');

    for (const c of CORPUS.cases) {
      const record = await runCase(c);
      results.push(record);
      console.log(renderCase(record));
    }

    console.log(renderReport());
    writeRecord();

    // THE assertion. A wrong pre-select is the one failure the user cannot see and cannot correct.
    const wrongPreselects = results
      // A row nobody has ruled on has no truth to be wrong against. Without this filter an
      // unlabelled corpus goes red for being unlabelled, which is the opposite of the point.
      .filter((r) => r.truePlaces !== null)
      .flatMap((r) =>
        r.offered
          .filter((o) => o.tier === 'preselect' && !o.correct)
          .map((o) => `${r.url}  →  ${o.name} @ ${o.address ?? '—'}`),
      );
    expect(
      wrongPreselects,
      'a wrong pre-select is shown to the user as settled fact',
    ).toEqual([]);
  }, 1_800_000);
});

async function runCase(c: OwnerCase): Promise<CaseResult> {
  const adjudicated = classAdjudicated(c);
  const ownerClass = adjudicated ? (c.class as OwnerClass) : null;
  const truePlaces = truePlacesOf(c);
  const expectedIntent = adjudicated
    ? (c.expectedIntent ?? INTENT_FOR_CLASS[ownerClass as OwnerClass])
    : null;
  const expectedIntentSource = !adjudicated
    ? null
    : c.expectedIntent !== undefined
      ? ('explicit' as const)
      : ('derived' as const);

  const base = {
    url: c.url,
    externalId: c.externalId ?? null,
    caption: c.caption ?? null,
    ownerClass,
    classAdjudicated: adjudicated,
    sample: sampleOf(c),
    truePlaces,
    postIntent: null,
    expectedIntent,
    expectedIntentSource,
    rawCandidateNames: [],
    keptCandidateNames: [],
    droppedByPlausibility: null,
    resolveStatus: null,
    resolveDetail: null,
    offered: [],
    extractionMisses: [],
  } satisfies Omit<CaseResult, 'status' | 'statusDetail'> & { status?: never; statusDetail?: never };

  // Never live: the grader replays what the seeder recorded. A prompt or model change invalidates
  // every fixture at once, which is correct — re-seed, do not silently re-measure a moving target.
  const cap = await getCaption(c.url, false);
  if (!cap.ok) {
    return { ...base, status: cap.reason.startsWith('bad_url') ? 'bad_url' : 'no_caption', statusDetail: cap.reason };
  }

  const caption = cap.fixture.caption;
  const ext = await getExtraction(
    extractor,
    caption,
    rawSourceOf(cap.fixture),
    false,
    c.extractionFixture ?? null,
  );
  if (!ext.ok) {
    return { ...base, caption, externalId: cap.fixture.externalId, status: 'no_extraction', statusDetail: ext.reason };
  }

  const plausible = filterPlausible(ext.fixture.candidates, caption);
  const kept: readonly PlaceCandidate[] = plausible.kept;

  const offered: OfferedPlace[] = [];
  let resolveStatus: CaseResult['resolveStatus'] = 'not_attempted';
  let resolveDetail: string | null = null;

  if (kept.length === 0) {
    resolveStatus = 'complete';
    resolveDetail = 'no candidate survived the plausibility gate, so nothing was looked up';
  } else if (resolver === null) {
    resolveDetail = resolverReason;
  } else {
    const before = lookupLog.length;
    const outcome = await resolveCandidates(resolver, kept, ext.fixture.cityHint, ctxOf());
    const events = lookupLog.slice(before);
    let cursor = 0;
    let unmeasured = 0;

    for (const resolution of outcome.resolutions) {
      if (resolution.kind === 'capped') continue;
      const event: LookupOutcome = events[cursor] ?? 'error';
      cursor += 1;
      if (event === 'budget' || event === 'no_fixture') {
        unmeasured += 1;
        continue;
      }
      if (resolution.kind !== 'answered') {
        unmeasured += 1;
        continue;
      }
      const derived = deriveResolution(resolution.result);
      if (derived.status === 'resolved') {
        offered.push(offeredOf('preselect', derived.place, truePlaces));
        for (const alt of derived.alternates) offered.push(offeredOf('shortlist', alt, truePlaces));
      } else if (derived.status === 'ambiguous') {
        for (const option of derived.options) offered.push(offeredOf('shortlist', option, truePlaces));
      }
    }

    const cappedCount = outcome.resolutions.filter((r) => r.kind === 'capped').length;
    resolveStatus = unmeasured === 0 && cappedCount === 0 ? 'complete' : 'partial';
    resolveDetail =
      unmeasured === 0 && cappedCount === 0
        ? null
        : `${unmeasured} lookup(s) not measured (budget or missing fixture)` +
          (cappedCount > 0 ? `, ${cappedCount} candidate(s) past MAX_CANDIDATES=${MAX_CANDIDATES}` : '');
  }

  const misses =
    truePlaces === null
      ? []
      : truePlaces
          .filter((t) => !kept.some((k) => placeMatches(t, k.rawName)))
          .map((t) => t.name);

  return {
    ...base,
    status: 'ok',
    statusDetail: null,
    externalId: cap.fixture.externalId,
    caption,
    postIntent: ext.fixture.postIntent,
    rawCandidateNames: ext.fixture.candidates.map((x) => x.rawName),
    keptCandidateNames: kept.map((x) => x.rawName),
    droppedByPlausibility: { ...plausible.dropped },
    resolveStatus,
    resolveDetail,
    offered,
    extractionMisses: misses,
  };
}

function offeredOf(
  tier: OfferedPlace['tier'],
  place: ResolvedPlace,
  truePlaces: readonly TruePlace[] | null,
): OfferedPlace {
  const match = truePlaces === null ? null : (truePlaces.find((t) => placeMatches(t, place.name)) ?? null);
  return {
    tier,
    name: place.name,
    address: place.addressLine,
    // Unadjudicated rows have no truth to be wrong against, so nothing there is ever counted as
    // correct OR as wrong. `correct: false` here would quietly become a false-preselect finding.
    correct: truePlaces !== null && match !== null,
    matched: match?.name ?? null,
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Metrics
 * ------------------------------------------------------------------------------------------- */

interface ClassStats {
  posts: number;
  graded: number;
  placeGraded: number;
  yieldedCorrect: number;
  wrongPreselect: number;
  wrongShortlist: number;
  extractionMisses: number;
  intentGraded: number;
  intentCorrect: number;
}

function emptyStats(): ClassStats {
  return {
    posts: 0,
    graded: 0,
    placeGraded: 0,
    yieldedCorrect: 0,
    wrongPreselect: 0,
    wrongShortlist: 0,
    extractionMisses: 0,
    intentGraded: 0,
    intentCorrect: 0,
  };
}

interface GateScore {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

function precision(g: GateScore): number | null {
  return g.tp + g.fp === 0 ? null : g.tp / (g.tp + g.fp);
}

function recall(g: GateScore): number | null {
  return g.tp + g.fn === 0 ? null : g.tp / (g.tp + g.fn);
}

interface Metrics {
  readonly byClass: Record<string, ClassStats>;
  readonly unadjudicated: number;
  readonly notGraded: Record<string, number>;
  readonly intentConfusion: Record<string, Record<string, number>>;
  readonly intentExplicit: { correct: number; n: number };
  readonly intentDerived: { correct: number; n: number };
  readonly gates: Record<string, GateScore>;
}

function metrics(sample: 'owner' | 'e7' | null): Metrics {
  const byClass: Record<string, ClassStats> = Object.fromEntries(
    OWNER_CLASSES.map((k) => [k, emptyStats()]),
  );
  const intentConfusion: Record<string, Record<string, number>> = {};
  const notGraded: Record<string, number> = {};
  const gates: Record<string, GateScore> = {
    'G1 zero-candidates': { tp: 0, fp: 0, fn: 0, tn: 0 },
    'G2 zero-candidates AND postIntent=place_recommendation': { tp: 0, fp: 0, fn: 0, tn: 0 },
  };
  const intentExplicit = { correct: 0, n: 0 };
  const intentDerived = { correct: 0, n: 0 };
  let unadjudicated = 0;

  for (const r of results) {
    if (!r.classAdjudicated || r.ownerClass === null) {
      unadjudicated += 1;
      continue;
    }
    if (sample !== null && r.sample !== sample) continue;
    const s = byClass[r.ownerClass] as ClassStats;
    s.posts += 1;
    if (r.status !== 'ok') {
      notGraded[r.status] = (notGraded[r.status] ?? 0) + 1;
      continue;
    }
    s.graded += 1;

    // postIntent
    if (r.expectedIntent !== null) {
      s.intentGraded += 1;
      const ok = r.postIntent === r.expectedIntent;
      if (ok) s.intentCorrect += 1;
      (intentConfusion[r.expectedIntent] ??= {})[String(r.postIntent)] =
        ((intentConfusion[r.expectedIntent] ??= {})[String(r.postIntent)] ?? 0) + 1;
      const bucket = r.expectedIntentSource === 'explicit' ? intentExplicit : intentDerived;
      bucket.n += 1;
      if (ok) bucket.correct += 1;
    }

    // The escalation gates. Positive class: escalating past the caption could recover the answer.
    const shouldFire = r.ownerClass === ESCALATION_POSITIVE;
    const g1 = r.keptCandidateNames.length === 0;
    const g2 = g1 && r.postIntent === 'place_recommendation';
    for (const [name, fired] of [
      ['G1 zero-candidates', g1],
      ['G2 zero-candidates AND postIntent=place_recommendation', g2],
    ] as const) {
      const g = gates[name] as GateScore;
      if (fired && shouldFire) g.tp += 1;
      else if (fired) g.fp += 1;
      else if (shouldFire) g.fn += 1;
      else g.tn += 1;
    }

    // Places. Only a case whose resolution stage ran to completion and whose true places have been
    // ruled on can enter these denominators.
    if (r.truePlaces !== null && r.resolveStatus === 'complete') {
      s.placeGraded += 1;
      if (r.offered.some((o) => o.correct)) s.yieldedCorrect += 1;
      s.wrongPreselect += r.offered.filter((o) => o.tier === 'preselect' && !o.correct).length;
      s.wrongShortlist += r.offered.filter((o) => o.tier === 'shortlist' && !o.correct).length;
      s.extractionMisses += r.extractionMisses.length;
    }
  }

  return { byClass, unadjudicated, notGraded, intentConfusion, intentExplicit, intentDerived, gates };
}

/* ------------------------------------------------------------------------------------------- *
 * Reporting
 * ------------------------------------------------------------------------------------------- */

function pct(n: number, d: number): string {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(0)}%`;
}

function num(v: number | null): string {
  return v === null ? ' n/a' : v.toFixed(2);
}

function renderCase(r: CaseResult): string {
  const L: string[] = [''];
  const label = r.classAdjudicated ? `class=${r.ownerClass ?? '?'}` : 'UNADJUDICATED (classSource is "draft")';
  L.push(`── ${r.url}  [${label}]`);
  if (r.status !== 'ok') {
    L.push(`   NOT GRADED — ${r.status}: ${r.statusDetail ?? ''}`);
    return L.join('\n');
  }
  L.push(`   caption: ${(r.caption ?? '').replace(/\n/gu, ' ⏎ ').slice(0, 140)}`);
  L.push(
    `   postIntent=${r.postIntent ?? 'null'}` +
      (r.expectedIntent === null
        ? '  (no expectation — row unadjudicated)'
        : `  expected=${r.expectedIntent} (${r.expectedIntentSource})  ${r.postIntent === r.expectedIntent ? 'OK' : 'WRONG'}`),
  );
  L.push(
    `   candidates raw=[${r.rawCandidateNames.join(' | ')}]  kept=[${r.keptCandidateNames.join(' | ')}]  ` +
      `dropped=${Object.entries(r.droppedByPlausibility ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(',') || 'none'}`,
  );
  L.push(`   resolve: ${r.resolveStatus ?? 'null'}${r.resolveDetail === null ? '' : ` — ${r.resolveDetail}`}`);
  for (const o of r.offered) {
    L.push(
      `     ${o.tier === 'preselect' ? 'PRE-SELECTED' : 'shortlisted  '} ${o.correct ? 'CORRECT' : r.truePlaces === null ? 'unruled' : 'WRONG  '}  ` +
        `${o.name} @ ${o.address ?? '—'}${o.matched === null ? '' : `  (matched "${o.matched}")`}`,
    );
  }
  if (r.truePlaces !== null && r.truePlaces.length > 0) {
    L.push(`   true places: ${r.truePlaces.map((t) => t.name).join(' ; ')}`);
  }
  for (const m of r.extractionMisses) {
    L.push(`     EXTRACTION MISS — the owner expects "${m}" and no kept candidate names it`);
  }
  return L.join('\n');
}

/**
 * One sample's numbers. Called once per sample present, never once over both: `owner` and `e7` are
 * two different populations, and averaging them would reproduce in a nicer font exactly the
 * mistake this corpus exists to correct.
 */
function renderSampleSummary(sample: 'owner' | 'e7'): string {
  const m = metrics(sample);
  const L: string[] = ['', '-'.repeat(100)];
  L.push(
    sample === 'owner'
      ? "SAMPLE: owner — the project owner's own saved TikToks. The distribution that matches the product."
      : 'SAMPLE: e7 — the BORROWED 16-post web-search set (docs/evidence/tiktok/07-caption-content-scoring.md).',
  );
  if (sample === 'e7') {
    L.push('        `07` documents its own bias: found via web search, skewed to indexed/high-reach');
    L.push('        posts. Every number below is a property of that sample, not of the product.');
  }
  L.push('-'.repeat(100));
  L.push('');

  const labelled = results.filter((r) => r.sample === sample).length;
  if (labelled > 0 && labelled < 20) {
    L.push(
      `   !! NOT YET A MEASUREMENT: ${labelled} adjudicated case(s) in this sample. The document this`,
    );
    L.push('      corpus replaces had n=16 and a wide confidence interval; a smaller n does not fix that.');
    L.push('');
  }

  L.push(`   cases in this sample: ${labelled}`);
  if (Object.keys(m.notGraded).length > 0) {
    L.push(`   adjudicated but not gradable: ${Object.entries(m.notGraded).map(([k, n]) => `${k}=${n}`).join(' ')}`);
  }
  L.push('');
  L.push('   PER CLASS');
  L.push('   class          posts  graded  place-graded  yielded>=1 correct   wrong preselect  wrong shortlist  extraction misses  intent');
  for (const k of OWNER_CLASSES) {
    const s = m.byClass[k] as ClassStats;
    L.push(
      `   ${k.padEnd(13)}${String(s.posts).padStart(5)}${String(s.graded).padStart(8)}` +
        `${String(s.placeGraded).padStart(14)}${`${s.yieldedCorrect}/${s.placeGraded} (${pct(s.yieldedCorrect, s.placeGraded)})`.padStart(20)}` +
        `${String(s.wrongPreselect).padStart(17)}${String(s.wrongShortlist).padStart(17)}` +
        `${String(s.extractionMisses).padStart(19)}${`${s.intentCorrect}/${s.intentGraded}`.padStart(9)}`,
    );
  }
  L.push('');
  L.push('   `place-graded` counts only cases whose true places are ruled on AND whose lookups all ran.');
  L.push('   For `futile` and `not-a-place` the true place set is empty by the definition of the class,');
  L.push('   so any place offered on one of those posts is wrong — no place names have to be typed.');
  L.push('');

  const totalWrongPre = OWNER_CLASSES.reduce((a, k) => a + (m.byClass[k] as ClassStats).wrongPreselect, 0);
  const totalWrongShort = OWNER_CLASSES.reduce((a, k) => a + (m.byClass[k] as ClassStats).wrongShortlist, 0);
  L.push(`   WRONG PLACES OFFERED:  ${totalWrongPre} pre-selected   <- must be 0`);
  L.push(`                          ${totalWrongShort} shortlisted   <- a ranking annoyance, not a lie`);
  L.push('');

  L.push(
    `   postIntent accuracy:  ${m.intentExplicit.correct + m.intentDerived.correct}/${m.intentExplicit.n + m.intentDerived.n} ` +
      `(${pct(m.intentExplicit.correct + m.intentDerived.correct, m.intentExplicit.n + m.intentDerived.n)})`,
  );
  L.push(
    `     on explicit \`expectedIntent\` labels: ${m.intentExplicit.correct}/${m.intentExplicit.n}   ` +
      `on labels DERIVED from the class: ${m.intentDerived.correct}/${m.intentDerived.n}`,
  );
  L.push('     The derived half rests on INTENT_FOR_CLASS, a documented default and not a hand label.');
  L.push('     Where it disagrees with the owner, set `expectedIntent` on that row.');
  L.push('   confusion (expected → got):');
  for (const [exp, got] of Object.entries(m.intentConfusion)) {
    L.push(`     ${exp.padEnd(22)} ${JSON.stringify(got)}`);
  }
  L.push('');

  L.push(`   ESCALATION GATE — positive class "${ESCALATION_POSITIVE}" (the only class a transcript could rescue)`);
  L.push('   gate                                                    tp  fp  fn  tn   prec  recall');
  for (const [name, g] of Object.entries(m.gates)) {
    L.push(
      `   ${name.padEnd(54)}${String(g.tp).padStart(3)} ${String(g.fp).padStart(3)} ` +
        `${String(g.fn).padStart(3)} ${String(g.tn).padStart(3)}   ${num(precision(g))}  ${num(recall(g))}`,
    );
  }
  L.push('   G2 is G1 with `postIntent` added. The difference between the two rows IS the value of');
  L.push('   that field: if G2 does not beat G1 on precision, the field is not earning its tokens.');
  L.push('');

  L.push('   SPEND THIS RUN');
  L.push(`     model calls:      0  (the grader never calls the model; the seeder does)`);
  L.push(
    `     provider lookups: ${liveLookups} live, ${fixtureLookups} replayed from disk` +
      `${budgetRefusals > 0 ? `, ${budgetRefusals} refused by the budget` : ''}` +
      `${missingFixtures > 0 ? `, ${missingFixtures} with no fixture and no live gateway` : ''}`,
  );
  L.push(
    `     estimated cost:   $${(liveLookups * GOOGLE_TEXT_SEARCH_USD_PER_LOOKUP).toFixed(3)} at the DOCUMENTED Text Search (Pro) list price of ` +
      `~$${GOOGLE_TEXT_SEARCH_USD_PER_LOOKUP * 1000}/1,000 (06 §11).`,
  );
  L.push(
    `                       The first ${GOOGLE_TEXT_SEARCH_FREE_PER_MONTH.toLocaleString('en-US')} lookups a month are free, so the real marginal cost`,
  );
  L.push('                       of this run is $0 until that tier is gone.');
  L.push('     model cost:       NOT PRICED. `integrations/llm/cost.ts` carries no verified per-token');
  L.push('                       price for the shipped Gemini model and logs `costModel: "unmeasured"`.');
  L.push('                       Token counts are in the seeded extraction fixtures.');
  return L.join('\n');
}

/**
 * The whole report: what the corpus is made of, then one block per sample present.
 *
 * The composition comes first and cannot be skipped past, because "how many of these are actually
 * the owner's posts" is the question every number underneath depends on, and it is the exact
 * question `07-caption-content-scoring.md` answered honestly about itself and then had ignored.
 */
function renderReport(): string {
  const owner = results.filter((r) => r.sample === 'owner').length;
  const e7 = results.filter((r) => r.sample === 'e7').length;
  const draft = results.filter((r) => r.sample === null).length;

  const L: string[] = ['', '='.repeat(100)];
  L.push('OWNER CORPUS — the engine, graded');
  L.push('='.repeat(100));
  L.push('');
  L.push(
    `   ${results.length} case(s): ${owner} labelled by the owner, ${e7} carrying the borrowed E7 labels, ` +
      `${draft} still draft.`,
  );
  L.push('   Draft rows are printed above by name and count toward nothing.');
  L.push('');
  if (owner === 0) {
    L.push('   ** NO OWNER-LABELLED POSTS. Every number below is from the borrowed sample this **');
    L.push('   ** corpus exists to replace, and none of it is evidence about the product.      **');
    L.push('');
    if (draft > 0) {
      L.push(`   The one remaining step: open ${CORPUS_PATH}, read each`);
      L.push('   caption next to its draft class, correct the class where it is wrong, and change');
      L.push('   `"classSource": "draft"` to `"owner"`. Then re-run this file. It costs nothing.');
    } else {
      L.push('   There is nothing to adjudicate: no draft rows either. Paste your own links into');
      L.push('   tests/manual/owner-corpus-links.txt and run the seeder — see the corpus `_readme`.');
    }
    L.push('');
  }
  if (owner > 0) L.push(renderSampleSummary('owner'));
  if (e7 > 0) L.push(renderSampleSummary('e7'));
  L.push('='.repeat(100));
  return L.join('\n');
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function writeRecord(): void {
  mkdirSync(RECORD_DIR, { recursive: true });
  writeFileSync(
    `${RECORD_DIR}run-record.json`,
    `${JSON.stringify(
      {
        _comment:
          'Machine record of a tests/manual/owner-corpus.manual.ts run. Regenerated on every run. ' +
          'Corpus: tests/manual/owner-corpus.json. Draft rows are excluded from every rate.',
        run_at: new Date().toISOString(),
        base_commit: gitSha(),
        resolver: resolverReason,
        extractor:
          extractor === null ? null : { version: extractor.version, promptVersion: extractor.promptVersion },
        intents: POST_INTENTS,
        intent_for_class: INTENT_FOR_CLASS,
        escalation_positive_class: ESCALATION_POSITIVE,
        spend: {
          model_calls: 0,
          provider_lookups_live: liveLookups,
          provider_lookups_replayed: fixtureLookups,
          provider_lookups_refused_by_budget: budgetRefusals,
          provider_lookups_missing_fixture: missingFixtures,
          provider_cost_usd_at_list_price: liveLookups * GOOGLE_TEXT_SEARCH_USD_PER_LOOKUP,
          provider_cost_note: `list price ~$${GOOGLE_TEXT_SEARCH_USD_PER_LOOKUP * 1000}/1,000, first ${GOOGLE_TEXT_SEARCH_FREE_PER_MONTH}/month free (06 §11) — DOCUMENTED, not billed`,
          model_cost_note: 'unmeasured: no verified per-token price for the shipped Gemini model (integrations/llm/cost.ts)',
        },
        sample_composition: {
          owner: results.filter((r) => r.sample === 'owner').length,
          e7: results.filter((r) => r.sample === 'e7').length,
          draft: results.filter((r) => r.sample === null).length,
        },
        metrics_owner: metrics('owner'),
        metrics_e7: metrics('e7'),
        cases: results,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  writeFileSync(`${RECORD_DIR}run-record.txt`, `${renderReport()}\n`, 'utf8');
  console.log(`\n[owner-corpus] wrote ${RECORD_DIR}run-record.json`);
  console.log(`[owner-corpus] wrote ${RECORD_DIR}run-record.txt`);
}
