/**
 * RECOG-METRICS-1 — replay the recorded corpus runs through the **shipped** scorer, at zero
 * provider quota, and classify every outcome.
 *
 * ## Why a replay and not a re-run
 *
 * The real harness (`tiktok-recognition.manual.ts`) is the right thing to run when *retrieval*
 * changes. It is also the thing we cannot currently afford: the Cloud project caps Text Search at
 * **100 requests/day**, one corpus run spends 16 of them, and as of 2026-08-28 there is **no
 * recorded Google gateway cache on disk** (`docs/evidence/.local/tiktok-recognition-cache/` holds
 * captions and extractions only) and **no rows in local `place_lookups`**. A Google re-run today is
 * a live spend, not a replay.
 *
 * Meanwhile both committed run records are stale **in their bands**, for two different reasons:
 *
 *  - `tiktok-recognition-run.google.json` (07:52) predates RESOLVE-CONF-1. Every score in it is
 *    `0.8·name + 0.1·category + 0.05`, which is why its perfect matches read 0.950 rather than
 *    1.000.
 *  - `tiktok-recognition-run.json` (11:29, Overture) is already name-only, but predates the branch
 *    guard and the contradicted-address band floor.
 *
 * So neither file's `band` / `verdict` / `summary` may be quoted as the current state. What both
 * hold — and what does not go stale — is **the provider's answer**. This module re-scores those
 * answers with today's `scoreCandidates`.
 *
 * Nothing here re-implements scoring. `scoreCandidates`, `rankPlaces`, `scorePlace`, `confidenceOf`,
 * `branchRival`, `nameDifference`, `addressScore` and `queryForms` are imported and called.
 *
 * ## Fidelity, stated rather than assumed
 *
 * - **The query** is rebuilt to `buildResolveQuery`'s contract *including* `textVariants`, read from
 *   `docs/evidence/places/recognition-query-variants.json`. That closes the limitation
 *   `resolution-confidence-2026-08-28.md` §2 states about itself (`קוהי` replayed at 0.718 against a
 *   live 0.919 because the replay dropped the variant `Kohi`).
 * - **Overture rows** come from `ranking.rows` — HARNESS-RIVAL-1 records name, address, locality,
 *   coordinates, provider category and dataset confidence for up to `RANKED_ROWS_RECORDED` rows.
 *   Two limits are carried per candidate rather than hidden: `altNames` are not recorded, and a
 *   prefilter deeper than 10 rows is a window. `nameScoreDrift` compares the recomputed name score
 *   against the recorded one, so an alias the replay cannot see shows up as a number instead of
 *   silently lowering a score. **Measured: zero drift on all 16 candidates**, i.e. no row in this
 *   corpus matched through an alias and the primitives reproduce the 11:29 run exactly.
 * - **Google rows**: rank 1 is recorded in full and replays exactly. Ranks 2+ exist for only two of
 *   sixteen candidates and only as `"name (score)"` strings, so they are reconstructed name-only —
 *   exact name, no address (which is what `scorePlace` already does with an uncomparable address),
 *   unknown geometry. `synthesisedRivalsCannotReachTheGuard()` asserts the one thing that makes the
 *   missing geometry harmless.
 *
 * ## The definitions
 *
 * Denominator throughout: the **adjudicated candidate** — an extracted candidate paired to a corpus
 * expectation, plus every expectation no candidate matched. An `extraction_miss` is a recognition
 * failure the user experiences as one, so it is counted, never dropped.
 *
 *  - **correct top-1** — the adjudicated-correct venue is rank 1.
 *  - **auto-resolution** — `preselect` **and** correct: saved without a question, rightly.
 *  - **wrong auto-match** — `preselect` and **not** correct. The stop-the-line number.
 *  - **genuine ambiguity** — we asked, and no evidence we already held answered the question. See
 *    `ambiguityIsGenuine` for the exact rule; the short version is that a rival only makes a
 *    question genuine when the **name does not separate it** from the top-1 and the **caption's
 *    address does not separate it either**. A question whose answer was already rank 1, or already
 *    written in the caption, is a `needless_question` — a product defect, not ambiguity.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  addressScore,
  branchRival,
  nameDifference,
  queryForms,
  scoreCandidates,
  type SoleCandidateMeaning,
} from '@/domain/places/score';
import { SCORING } from '@/domain/places/scoring-constants';
import { normalise } from '@/domain/places/normalise';
import { categoryHintFor, type ExtractedCategoryHint } from '@/domain/places/category-hint';
import type { CategoryHint, RankedPlace, ResolveQuery, ResolvedPlace } from '@/domain/types';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const readJson = <T>(p: string): T => JSON.parse(readFileSync(REPO + p, 'utf8')) as T;

/* ------------------------------------------------------------------------------------------- *
 * The recorded shapes, narrowed to the fields the replay reads.
 *
 * Declared rather than `any`-cast because they are the contract between the recording harness and
 * this one: if HARNESS-RIVAL-1's `RankedRow` loses a field, this stops compiling instead of
 * silently replaying `undefined` as a coordinate.
 * ------------------------------------------------------------------------------------------- */

export interface RecordedRow {
  readonly name: string;
  readonly address: string | null;
  readonly locality: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly providerPlaceId: string;
  readonly providerCategory: string | null;
  readonly datasetConfidence: number;
  readonly nameScore?: number;
}

export interface RecordedTop1 {
  readonly name: string;
  readonly address: string | null;
  readonly locality: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly providerCategory: string | null;
  readonly datasetConfidence: number;
}

export interface RecordedCandidate {
  readonly rawName: string;
  readonly queryText: string;
  readonly queryCityHint: string | null;
  readonly countryHint: string | null;
  readonly categoryHint: ExtractedCategoryHint | null;
  readonly addressHint: string | null;
  readonly expectedName?: string | null;
  readonly resolutionKind: string;
  readonly candidatesPrefiltered?: number;
  readonly top1: RecordedTop1 | null;
  readonly top3?: readonly string[];
  readonly ranking?: {
    readonly rows: readonly RecordedRow[];
    readonly complete: boolean;
    readonly rankedLength: number;
  } | null;
}

export interface RecordedCase {
  readonly url: string;
  readonly caption?: string;
  readonly candidates?: readonly RecordedCandidate[];
  readonly extractionMisses?: readonly string[];
}

export interface RecordedRun {
  readonly extractor?: { readonly version: string; readonly promptVersion: string };
  readonly cases?: readonly RecordedCase[];
}

/** One corpus expectation. Only the fields the adjudication rules read. */
export interface Expectation {
  readonly name: string;
  readonly candidatePattern?: string;
  readonly namePattern?: string;
  readonly addressPattern?: string;
}

interface Corpus {
  readonly cases: readonly { readonly url: string; readonly expected?: readonly Expectation[] }[];
}

interface VariantsFile {
  readonly urls?: Readonly<Record<string, { readonly candidates?: Readonly<Record<string, readonly string[]>> }>>;
}

const CORPUS = readJson<Corpus>('tests/manual/tiktok-recognition-corpus.json');
const VARIANTS: VariantsFile = existsSync(REPO + 'docs/evidence/places/recognition-query-variants.json')
  ? readJson<VariantsFile>('docs/evidence/places/recognition-query-variants.json')
  : { urls: {} };

export interface RunSource {
  readonly provider: 'google' | 'overture';
  readonly file: string;
  /** What the shipped adapter passes to `scoreCandidates`. */
  readonly sole: SoleCandidateMeaning;
}

export const RUNS: readonly RunSource[] = [
  { provider: 'google', file: 'docs/evidence/places/tiktok-recognition-run.google.json', sole: 'exhaustive-search' },
  { provider: 'overture', file: 'docs/evidence/places/tiktok-recognition-run.json', sole: 'narrow-filter' },
];

/* ------------------------------------------------------------------------------------------- *
 * Adjudication — the corpus's own rules, as `tiktok-recognition.manual.ts` applies them
 * ------------------------------------------------------------------------------------------- */

const literalPattern = (s: string): string => normalise(s).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const nameRegex = (e: Expectation): RegExp =>
  new RegExp(e.namePattern ?? e.candidatePattern ?? literalPattern(e.name), 'iu');

export function acceptsRow(e: Expectation, name: string, address: string | null, locality: string | null): boolean {
  if (!nameRegex(e).test(normalise(name))) return false;
  if (e.addressPattern !== undefined) {
    return new RegExp(e.addressPattern, 'iu').test(`${address ?? ''} ${locality ?? ''}`);
  }
  return true;
}

/** The expectation the *run* paired to this candidate. Re-derived pairing would let the replay
 *  adjudicate a different question than the run it replays. */
function expectationFor(url: string, cand: RecordedCandidate): Expectation | null {
  const kase = CORPUS.cases.find((c) => c.url === url);
  if (kase?.expected === undefined) return null;
  if (cand.expectedName === null || cand.expectedName === undefined) return null;
  const wanted = cand.expectedName;
  return kase.expected.find((e) => e.name === wanted) ?? null;
}

/* ------------------------------------------------------------------------------------------- *
 * Rebuilding the resolver's input from the record
 * ------------------------------------------------------------------------------------------- */

function queryOf(url: string, cand: RecordedCandidate): ResolveQuery {
  const variants: readonly string[] = VARIANTS.urls?.[url]?.candidates?.[cand.rawName] ?? [];
  return {
    text: cand.queryText,
    cityHint: cand.queryCityHint,
    countryHint: cand.countryHint,
    categoryHint: categoryHintFor(cand.categoryHint) as CategoryHint | null,
    addressHint: cand.addressHint,
    textVariants: variants,
    near: null,
    maxResults: null,
  };
}

interface Rebuilt {
  readonly rows: readonly ResolvedPlace[];
  readonly synthesised: number;
  readonly complete: boolean;
  readonly rankedLength: number;
  readonly recordedNameScores: readonly (number | null)[];
}

/** The name inside a recorded `"name (0.833)"` top-3 entry. */
export const nameOfTop3Entry = (s: string): string => s.replace(/\s*\([0-9.]+\)\s*$/u, '');

function rebuildRows(provider: 'google' | 'overture', cand: RecordedCandidate): Rebuilt {
  if (provider === 'overture') {
    const rows: readonly RecordedRow[] = cand.ranking?.rows ?? [];
    return {
      rows: rows.map((r) => ({
        provider: 'overture' as const,
        providerPlaceId: r.providerPlaceId,
        sourceDataset: 'overture-places',
        regionId: 'tlv',
        name: r.name,
        altNames: [],
        providerCategory: r.providerCategory,
        addressLine: r.address,
        locality: r.locality,
        lat: r.lat,
        lng: r.lng,
        datasetConfidence: r.datasetConfidence,
      })),
      synthesised: 0,
      complete: cand.ranking?.complete === true,
      rankedLength: cand.ranking?.rankedLength ?? rows.length,
      recordedNameScores: rows.map((r) => r.nameScore ?? null),
    };
  }

  const rows: ResolvedPlace[] = [];
  const t = cand.top1;
  if (t !== null && t !== undefined) {
    rows.push({
      provider: 'google',
      providerPlaceId: `recorded-top1:${String(cand.queryText)}`,
      sourceDataset: 'google-places',
      regionId: null,
      name: t.name,
      altNames: [],
      providerCategory: t.providerCategory,
      addressLine: t.address,
      locality: t.locality,
      lat: t.lat,
      lng: t.lng,
      datasetConfidence: t.datasetConfidence,
    });
  }
  let synthesised = 0;
  for (const [i, entry] of (cand.top3 ?? []).entries()) {
    if (i === 0) continue;
    synthesised += 1;
    rows.push({
      provider: 'google',
      providerPlaceId: `synthesised-rank${String(i + 1)}:${String(cand.queryText)}`,
      sourceDataset: 'google-places',
      regionId: null,
      name: nameOfTop3Entry(entry),
      altNames: [],
      providerCategory: null,
      addressLine: null,
      locality: null,
      // Unknown. Harmless only because no synthesised rival can reach the guard's distance test;
      // `synthesisedRivalsCannotReachTheGuard()` asserts exactly that.
      lat: 0,
      lng: 0,
      // Google publishes no confidence; the adapter's neutral constant. Weight 0 since RESOLVE-CONF-1.
      datasetConfidence: 0.5,
    });
  }
  return {
    rows,
    synthesised,
    complete: rows.length >= (cand.candidatesPrefiltered ?? rows.length),
    rankedLength: cand.candidatesPrefiltered ?? rows.length,
    recordedNameScores: rows.map(() => null),
  };
}

/* ------------------------------------------------------------------------------------------- *
 * Classification
 * ------------------------------------------------------------------------------------------- */

export type Outcome =
  | 'auto_correct'
  | 'auto_wrong'
  | 'needless_question'
  | 'genuine_ambiguity'
  | 'ranking_failure'
  | 'not_found'
  | 'extraction_miss';

export type AskReason = 'address_conflict' | 'branch' | 'rival' | 'weak_name';

/** `ux-when-we-ask.md` §3's precedence, over the same values the band was decided on. */
export function askReason(
  top: RankedPlace | undefined,
  ranked: readonly RankedPlace[],
  q: ResolveQuery,
  forms: readonly string[],
): AskReason | null {
  if (top === undefined) return null;
  if ((q.addressHint ?? null) !== null && addressScore(q.addressHint, top.place.addressLine) === 0) return 'address_conflict';
  if (branchRival(ranked, forms) !== null) return 'branch';
  const second = ranked[1];
  const margin = second === undefined ? null : top.score - second.score;
  if (top.score >= SCORING.bands.preselectScore && margin !== null && margin < SCORING.bands.preselectMargin) {
    return 'rival';
  }
  return 'weak_name';
}

/**
 * Was the question we asked *unanswerable from evidence we already held*?
 *
 * A rival only makes a question genuine when **both** separators fail:
 *
 *  1. **The name does not separate them.** A top-1 whose name score beats the rival's by more than
 *     `NAME_SEPARATES` is a row our own evidence already prefers; asking is asking the user to
 *     confirm our arithmetic. The branch case is the exception and it is why this is not just a
 *     score comparison: two branches of one chain differ only by suffix length
 *     (`scoring-constants.ts`, `branchGuard`), so a name gap there measures nothing and the pair
 *     counts as unseparated however large it is.
 *  2. **The caption's address does not separate them.** If `addressHint` scores differently against
 *     the two rows, the caption already answered the question. `רוסטיקו` on Overture is exactly
 *     this: the guard asks "בזל 42 or רוטשילד 15?" about a caption that says `בזל 42`.
 *
 * Deliberately conservative in the direction that makes the product look *worse*: anything this
 * cannot prove was answerable is left as genuine ambiguity.
 */
const NAME_SEPARATES = 0.02;

export function ambiguityIsGenuine(
  ranked: readonly RankedPlace[],
  q: ResolveQuery,
  forms: readonly string[],
): { readonly genuine: boolean; readonly why: string } {
  const top = ranked[0];
  if (top === undefined) return { genuine: false, why: 'no rows' };
  const hint = q.addressHint ?? null;
  const guardRival = branchRival(ranked, forms);

  const contenders = ranked
    .slice(1)
    .filter((r) => top.score - r.score <= SCORING.branchGuard.rivalScoreBand);
  if (contenders.length === 0 && guardRival === null) {
    return { genuine: false, why: 'nothing else was in contention — there was no question to ask' };
  }

  for (const rival of [...(guardRival === null ? [] : [guardRival]), ...contenders]) {
    const isBranch = nameDifference(top.place.name, rival.place.name) !== null;
    const nameSeparates = !isBranch && top.nameScore - rival.nameScore > NAME_SEPARATES;
    if (nameSeparates) continue;
    const a = addressScore(hint, top.place.addressLine);
    const b = addressScore(hint, rival.place.addressLine);
    if (hint !== null && a !== b) continue;
    return {
      genuine: true,
      why: `${rival.place.name} is ${isBranch ? 'branch-shaped' : 'name-equivalent'} and no address evidence separates it`,
    };
  }
  return { genuine: false, why: 'every contender is separated by evidence we already hold' };
}

export interface CandidateRow {
  readonly url: string;
  readonly provider: string;
  readonly rawName: string;
  readonly expected: string;
  readonly band: string;
  readonly score: number | null;
  readonly nameScore: number | null;
  readonly tokenCoverage: number | null;
  readonly margin: number | null;
  readonly top1: string | null;
  readonly top1Address: string | null;
  readonly correctRank: number | null;
  readonly outcome: Outcome;
  readonly reason: AskReason | null;
  readonly failureClass: string;
  readonly addressHint: string | null;
  readonly addressScoreTop1: number | null;
  readonly guard: string;
  readonly ambiguity: string;
  readonly rankedLength: number;
  readonly complete: boolean;
  readonly synthesisedRivals: number;
  readonly nameScoreDrift: number | null;
  readonly note: string | null;
}

/** What the outcome is called when we asked a question we could have answered. */
function needlessClassOf(reason: AskReason | null, top: RankedPlace, forms: readonly string[]): string {
  if (reason === 'address_conflict') return 'address_contradicts_a_correct_venue';
  if (reason === 'branch') return 'branch_guard_ignores_the_captions_address';
  if (reason === 'rival') return 'exact_name_blocked_by_a_fuzzy_rivals_margin';
  // weak_name. Split by *why* the name fell short, because the fixes differ.
  const asked = new Set(forms.flatMap((f) => f.split(/\s+/u).map((w) => normalise(w)).filter((w) => w !== '')));
  const residual = forms
    .map((f) => nameDifference(f, top.place.name))
    .find((d) => d !== null && d.length > 0);
  if (top.tokenCoverage >= 0.999 && residual !== undefined && residual !== null) {
    return residual.every((t) => asked.has(t))
      ? 'suffix_already_named_in_the_caption'
      : 'provider_name_carries_a_suffix_the_caption_omits';
  }
  return 'name_matched_only_partially';
}

export function classify(
  provider: string,
  url: string,
  cand: RecordedCandidate,
  sole: SoleCandidateMeaning,
): CandidateRow {
  const q = queryOf(url, cand);
  const built = rebuildRows(provider as 'google' | 'overture', cand);
  const forms = queryForms(q.text, q.textVariants ?? null);
  const result = scoreCandidates(q, built.rows, provider === 'google' ? ['global'] : ['tlv'], sole);
  const ranked = result.shortlist;
  const top = ranked[0];

  const expectation = expectationFor(url, cand);
  const correctIdx =
    expectation === null
      ? -1
      : ranked.findIndex((r) => acceptsRow(expectation, r.place.name, r.place.addressLine, r.place.locality));
  const correct = correctIdx === 0;
  const band = result.confidence.band;
  const rival = branchRival(ranked, forms);
  const reason = band === 'preselect' ? null : askReason(top, ranked, q, forms);
  const ambiguity = ambiguityIsGenuine(ranked, q, forms);

  let outcome: Outcome;
  let failureClass: string;
  if (band === 'preselect' && correct) {
    outcome = 'auto_correct';
    failureClass = '—';
  } else if (band === 'preselect') {
    outcome = 'auto_wrong';
    failureClass = 'wrong_auto_match';
  } else if (correct && top !== undefined) {
    outcome = ambiguity.genuine ? 'genuine_ambiguity' : 'needless_question';
    failureClass = ambiguity.genuine ? `genuine_${reason ?? 'unknown'}` : needlessClassOf(reason, top, forms);
  } else if (correctIdx > 0) {
    outcome = 'ranking_failure';
    failureClass = 'right_row_ranked_below_something_else';
  } else {
    outcome = 'not_found';
    failureClass =
      provider === 'google'
        ? 'provider_returned_a_different_venue'
        : 'absent_or_unreachable_in_index';
  }

  const drift = built.recordedNameScores
    .map((rec, i) => (rec === null ? null : Math.abs(rec - (ranked[i]?.nameScore ?? rec))))
    .filter((d): d is number => d !== null);

  return {
    url,
    provider,
    rawName: cand.rawName,
    expected: cand.expectedName ?? '(unadjudicated)',
    band,
    score: result.confidence.score,
    nameScore: top?.nameScore ?? null,
    tokenCoverage: top?.tokenCoverage ?? null,
    margin: result.confidence.margin,
    top1: top?.place.name ?? null,
    top1Address: top?.place.addressLine ?? null,
    correctRank: correctIdx >= 0 ? correctIdx + 1 : null,
    outcome,
    reason,
    failureClass,
    addressHint: q.addressHint ?? null,
    addressScoreTop1: top === undefined ? null : addressScore(q.addressHint, top.place.addressLine),
    guard: rival === null ? 'none' : `fired:${rival.place.name}`,
    ambiguity: ambiguity.why,
    rankedLength: built.rankedLength,
    complete: built.complete,
    synthesisedRivals: built.synthesised,
    nameScoreDrift: drift.length === 0 ? null : Math.max(...drift),
    note: null,
  };
}

export interface Scoreboard {
  readonly provider: string;
  readonly sole: SoleCandidateMeaning;
  readonly adjudicated: number;
  readonly correctTop1: number;
  readonly preselect: number;
  readonly autoCorrect: number;
  readonly autoWrong: number;
  readonly needless: number;
  readonly genuine: number;
  readonly rankingFailure: number;
  readonly notFound: number;
  readonly extractionMiss: number;
  readonly rows: readonly CandidateRow[];
}

export function scoreboardFor(src: RunSource, sole: SoleCandidateMeaning = src.sole): Scoreboard {
  const run = readJson<RecordedRun>(src.file);
  const rows: CandidateRow[] = [];
  let extractionMiss = 0;
  for (const kase of run.cases ?? []) {
    for (const cand of kase.candidates ?? []) {
      if (cand.expectedName === null || cand.expectedName === undefined) continue;
      if (cand.resolutionKind !== 'answered') continue;
      rows.push(classify(src.provider, kase.url, cand, sole));
    }
    for (const miss of kase.extractionMisses ?? []) {
      extractionMiss += 1;
      rows.push({
        url: kase.url, provider: src.provider, rawName: '(none)', expected: miss,
        band: 'n/a', score: null, nameScore: null, tokenCoverage: null, margin: null,
        top1: null, top1Address: null, correctRank: null, outcome: 'extraction_miss', reason: null,
        failureClass: 'extraction_never_named_the_venue', addressHint: null, addressScoreTop1: null,
        guard: 'n/a', ambiguity: 'n/a', rankedLength: 0, complete: true, synthesisedRivals: 0,
        nameScoreDrift: null,
        note: 'the caption names the venue; the model produced no candidate string for it',
      });
    }
  }
  const n = (o: Outcome): number => rows.filter((r) => r.outcome === o).length;
  return {
    provider: src.provider,
    sole,
    adjudicated: rows.length,
    correctTop1: rows.filter((r) => r.correctRank === 1).length,
    preselect: rows.filter((r) => r.band === 'preselect').length,
    autoCorrect: n('auto_correct'),
    autoWrong: n('auto_wrong'),
    needless: n('needless_question'),
    genuine: n('genuine_ambiguity'),
    rankingFailure: n('ranking_failure'),
    notFound: n('not_found'),
    extractionMiss,
    rows,
  };
}

/**
 * The one place the Google name-only rival reconstruction could change a verdict.
 *
 * `branchRival` tests `nameDifference` **before** it tests distance, so a `null` difference makes
 * the missing geometry irrelevant. Returns the offenders; an empty list is the licence to trust the
 * reconstruction, and a non-empty one means that case needs a real answer, not this file.
 */
export function synthesisedRivalsCannotReachTheGuard(): readonly string[] {
  const run = readJson<RecordedRun>('docs/evidence/places/tiktok-recognition-run.google.json');
  const offenders: string[] = [];
  for (const kase of run.cases ?? []) {
    for (const cand of kase.candidates ?? []) {
      const names = (cand.top3 ?? []).map(nameOfTop3Entry);
      for (const rival of names.slice(1)) {
        if (nameDifference(names[0] ?? '', rival) !== null) {
          offenders.push(`${cand.rawName}: ${String(names[0])} vs ${rival}`);
        }
      }
    }
  }
  return offenders;
}

export const pct = (a: number, b: number): string => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(0)}%`);
