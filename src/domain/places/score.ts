/**
 * The scoring core: candidate string + hints + prefiltered POIs → ranked shortlist + a band that
 * decides whether the user must confirm. `06` §6.1 steps 4–5 and `06` §6.2, ported from
 * `docs/evidence/places/resolve-overture-scored.py` — the script that produced the 44-case
 * benchmark and therefore every number in `06` §6.3.
 *
 * **This is the milestone's functional core, and it is pure.** No database, no network, no clock,
 * no React. The prefilter that produces `candidates`, the region mapping that produces
 * `regionsSearched`, the `limit 500` cap and the cache all live behind `PlaceResolver` in
 * `integrations/` (task 7 / MS7). The seam is deliberate: this file can be re-fit and re-tested
 * against a golden file with no I/O in sight, which is what makes `06` §6.3's "the benchmark is
 * their regression test" a real claim rather than an aspiration.
 *
 * Fidelity to the prototype is the whole point, so the port's divergences are enumerated here and
 * nowhere else. There are five, all of them deliberate:
 *
 *  1. **`margin` is `null` when there is no second candidate**, never 1.0. The prototype writes
 *     `margin = 1.0` for a single-row prefilter, which sails through the `margin ≥ 0.05` gate on
 *     score alone and makes the margin gate — the idea `06` §12 defends to an examiner — inert in
 *     exactly the case it was invented for. `10` §8 recorded it as an inherited defect to fix;
 *     `11` §2 ruling 7 made `Confidence.margin` `number | null` so it cannot be reproduced; `10`
 *     §12 Q3 rules the band for it: `confirm`. Unmeasured margin is not perfect margin.
 *  2. **`margin` and `band` are computed from the full ranked list, before `maxResults` truncates
 *     it.** The prototype computes the margin from its top-5 slice, so with a cap of 1 it would
 *     again report an unmeasured margin over hundreds of real candidates — defect 1 wearing a
 *     different hat. `null` here means *there was no second candidate*, full stop; at the default
 *     cap of 5 the two readings are identical, which is why the benchmark is unaffected.
 *     `ResolveResult.candidatesPrefiltered` remains the audit trail either way.
 *  3. **No `conf or 0.5` coalesce.** `poi_index.dataset_confidence` is `not null default 0.5`
 *     (migration 0010), so `ResolvedPlace.datasetConfidence` is `number` and there is nothing to
 *     coalesce (`11` §2). A row with a genuinely unknown confidence carries 0.5 from the column
 *     default, decided at load time where the fact belongs.
 *  4. **The category token table is indexed by `CategoryHint` only.** `CAT_TOKENS[hint]` is a
 *     `KeyError` for four of the seven values `09` §4.2's schema can emit; `categoryHintFor()`
 *     is the total conversion (`11` §2 ruling 9).
 *  5. **`altNames` is not scored** — only `name`, exactly as the prototype did. Overture gave us no
 *     alternate names, the column is empty until the OSM alias join (`06` §7.1 mitigation 1a,
 *     `10` §11), and scoring an always-empty array would let a future load silently change every
 *     benchmark number. When aliases land, this becomes "the best score over `name` and
 *     `altNames`" — one change, here, with the golden file to catch what it moves.
 *
 * Everything else is the prototype byte for byte, including the tie-break order and the odd
 * corners of `GENERIC` (`scoring-constants.ts`).
 */

import type {
  CategoryHint,
  Confidence,
  ConfidenceBand,
  RankedPlace,
  ResolveQuery,
  ResolveResult,
  ResolvedPlace,
  RegionId,
} from '../types';
import { jaroWinklerSimilarity } from './jaro-winkler';
import { normalise, tokenise } from './normalise';
import { SCORING } from './scoring-constants';

/**
 * Tokens that carry identity: not in `SCORING.generic`, and longer than one character.
 *
 * `Array.from(token).length`, not `token.length`, because the prototype's `len(t) > 1` counts code
 * points and `String.prototype.length` counts UTF-16 units — an astral-plane letter would be
 * "2 characters" in a literal port and would sneak past a filter meant to drop single letters.
 */
export function distinctiveTokens(text: string): readonly string[] {
  return tokenise(text).filter(
    (token) =>
      !SCORING.generic.has(token) &&
      Array.from(token).length >= SCORING.minDistinctiveTokenLength,
  );
}

/**
 * The tokens a query is actually scored on: its distinctive tokens, falling back to **all** of them
 * when it has none (the prototype's `strong(toks(q)) or toks(q)`).
 *
 * The fallback is what keeps a query that is nothing but generic words — *"best coffee ever"* — from
 * dividing by zero and scoring every café 1.0. It scores such a query against the generic words
 * themselves, which is why those three captions land at 0.813–0.894 and are caught by the 0.92 gate
 * rather than matching nothing at all.
 *
 * Exported because the prefilter builds its `name ILIKE '%token%'` disjunction from exactly this
 * list (`06` §6.1 step 3, `10` §5). Two different token sets on the two sides of the prefilter would
 * mean the resolver scores rows the prefilter could not have returned — the recall gate in `10` §5
 * only means something if both sides ask the same question.
 */
export function queryTokens(text: string): readonly string[] {
  const distinctive = distinctiveTokens(text);
  return distinctive.length > 0 ? distinctive : tokenise(text);
}

/** `nameScore` and the token coverage it was built from — `06` §6.1 step 4's two reported numbers. */
export interface NameScore {
  readonly nameScore: number;
  readonly tokenCoverage: number;
}

/**
 * `0.45·whole + 0.55·coverage − extraPenalty`, floored at 0.
 *
 *  - `whole` is Jaro-Winkler over the two **normalised** strings. This is why `ResolveQuery.text`
 *    must arrive verbatim: normalising twice is harmless, but pre-normalising elsewhere and
 *    normalising differently is the silent-drift failure `10` §4 is about.
 *  - `coverage` is the mean over the query's scored tokens of the best similarity against any
 *    candidate token, with a flat `substringCredit` if the token appears anywhere inside the
 *    normalised candidate name. The substring rule is what makes `CafeXoho` reachable from `xoho`
 *    and `פלאפל הקוסם` from `פלאפל` — names that tokenise apart and score poorly token-to-token.
 *  - the penalty is `perToken` per surplus distinctive token in the candidate, capped. It is
 *    asymmetric on purpose: a candidate with more distinctive words than the query is a longer,
 *    more specific business name, and unbounded punishment would bury legitimate branch names.
 *
 * Either side normalising to the empty string scores 0/0 — the prototype's early return, kept
 * because DuckDB's Jaro-Winkler scores `('','')` as 0 anyway and an empty query has no distinctive
 * tokens to average.
 */
export function nameScore(queryText: string, candidateName: string): NameScore {
  const normalisedQuery = normalise(queryText);
  const normalisedCandidate = normalise(candidateName);
  if (normalisedQuery === '' || normalisedCandidate === '') {
    return { nameScore: 0, tokenCoverage: 0 };
  }

  const whole = jaroWinklerSimilarity(normalisedQuery, normalisedCandidate);

  const scoredTokens = queryTokens(queryText);
  const candidateTokens = tokenise(candidateName);
  let coverageSum = 0;
  for (const token of scoredTokens) {
    let best = 0;
    for (const candidateToken of candidateTokens) {
      const similarity = jaroWinklerSimilarity(token, candidateToken);
      if (similarity > best) best = similarity;
    }
    if (normalisedCandidate.includes(token) && SCORING.substringCredit > best) {
      best = SCORING.substringCredit;
    }
    coverageSum += best;
  }
  const tokenCoverage = coverageSum / scoredTokens.length;

  const surplus = Math.max(0, distinctiveTokens(candidateName).length - scoredTokens.length);
  const penalty = Math.min(
    SCORING.extraTokenPenalty.max,
    SCORING.extraTokenPenalty.perToken * surplus,
  );

  const blended =
    SCORING.name.whole * whole + SCORING.name.tokenCoverage * tokenCoverage - penalty;
  return { nameScore: Math.max(0, blended), tokenCoverage };
}

/**
 * 1 if the candidate's provider category agrees with the hint, else 0. No hint, or no category on
 * the row, is 0 — never a fraction and never a penalty.
 *
 * The candidate category is split on `_` and whitespace *and* kept whole, so Overture's
 * `coffee_shop` matches both the `coffee_shop` entry and the `coffee` one. Lower-cased but **not**
 * normalised: these are provider taxonomy slugs, not names, and running them through the
 * place-name normalisation would be borrowing a decision made for a different kind of string.
 */
export function categoryScore(
  hint: CategoryHint | null,
  providerCategory: string | null,
): 0 | 1 {
  if (hint === null || providerCategory === null || providerCategory === '') return 0;
  const wanted = SCORING.categoryTokens[hint];
  const lowered = providerCategory.toLowerCase();
  if (wanted.has(lowered)) return 1;
  return lowered.split(/[_\s]+/u).some((part) => wanted.has(part)) ? 1 : 0;
}

/**
 * One candidate's four score components: `0.72·nameScore + 0.18·categoryScore +
 * 0.10·datasetConfidence`. The three weights sum to 1.00, which is what keeps `score` in `[0,1]`
 * — `places.resolution_score`'s CHECK — without a clamp.
 */
export function scorePlace(
  place: ResolvedPlace,
  categoryHint: CategoryHint | null,
  queryText: string,
): RankedPlace {
  const name = nameScore(queryText, place.name);
  const category = categoryScore(categoryHint, place.providerCategory);
  const score =
    SCORING.total.name * name.nameScore +
    SCORING.total.category * category +
    SCORING.total.datasetConfidence * place.datasetConfidence;
  return {
    place,
    score,
    nameScore: name.nameScore,
    tokenCoverage: name.tokenCoverage,
    categoryScore: category,
  };
}

/**
 * Best first. The prototype sorted a tuple with `sort(reverse=True)`, so ties fall through in tuple
 * order: total, then `nameScore`, then `tokenCoverage`, then `categoryScore`, then the raw name
 * descending. That order is reproduced rather than replaced, because at the benchmark's 0.000-margin
 * cases (The Dove) the tie-break *is* which row the user sees first, and task 4's golden file
 * compares against a file the Python's ordering produced.
 *
 * Two deliberate deviations at the very end of the comparison. The prototype's tuple continues into
 * `category`, `lat`, `lon`, `id`, where comparing a `None` category against a string raises in
 * Python — an ordering that cannot be relied on is not an ordering. This stops at the name and adds
 * `providerPlaceId` descending, which is unique per row, so the sort is total and deterministic.
 * Name comparison is JavaScript's UTF-16 code-unit order rather than Python's code-point order;
 * the two differ only when one name contains an astral-plane character and the other a code point
 * in U+E000–U+FFFF, which no row in the three extracts does.
 */
function byRank(a: RankedPlace, b: RankedPlace): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.nameScore !== b.nameScore) return b.nameScore - a.nameScore;
  if (a.tokenCoverage !== b.tokenCoverage) return b.tokenCoverage - a.tokenCoverage;
  if (a.categoryScore !== b.categoryScore) return b.categoryScore - a.categoryScore;
  if (a.place.name !== b.place.name) return a.place.name < b.place.name ? 1 : -1;
  if (a.place.providerPlaceId === b.place.providerPlaceId) return 0;
  return a.place.providerPlaceId < b.place.providerPlaceId ? 1 : -1;
}

/**
 * Score every prefiltered candidate and rank it. **Not truncated** — `maxResults` applies to the
 * shortlist, and the band is decided on the full ranking (divergence 2 in the file header).
 */
export function rankPlaces(
  query: ResolveQuery,
  candidates: readonly ResolvedPlace[],
): readonly RankedPlace[] {
  return candidates
    .map((place) => scorePlace(place, query.categoryHint, query.text))
    .sort(byRank);
}

/**
 * `06` §6.2's three bands, over the full ranking.
 *
 * `preselect` requires both gates; a null margin therefore cannot reach it, which is `10` §12 Q3's
 * ruling expressed as arithmetic rather than as a special case — there is no `if (margin === null)`
 * branch to forget. Nothing here rounds: the prototype rounds the margin to three decimals only
 * when writing its JSON, and rounding before a `≥ 0.05` comparison would move a 0.0496 case across
 * the gate for the sake of a display convention.
 */
export function confidenceOf(ranked: readonly RankedPlace[]): Confidence {
  const top = ranked[0];
  if (top === undefined) {
    return { band: 'no_match', score: 0, margin: null };
  }
  const second = ranked[1];
  const margin = second === undefined ? null : top.score - second.score;

  let band: ConfidenceBand;
  if (top.score >= SCORING.bands.preselectScore && margin !== null &&
      margin >= SCORING.bands.preselectMargin) {
    band = 'preselect';
  } else if (top.score >= SCORING.bands.confirmScore) {
    band = 'confirm';
  } else {
    band = 'no_match';
  }
  return { band, score: top.score, margin };
}

/**
 * The whole scoring step in one call: prefiltered rows in, `ResolveResult` out. This is what the
 * MS7 adapter's `PlaceResolver.resolve` reduces to once it has run its query — everything between
 * the SQL and the return value.
 *
 * `candidates` **is** the prefilter's output, so `candidatesPrefiltered` is its length: the adapter
 * cannot report a number that disagrees with what it passed in. `regionsSearched` is the adapter's
 * to supply — the domain has no way to know which regions are loaded, and an empty array is the
 * honest "we don't have Lisbon yet" (`regionLoaded()`, `resolve-result.ts`).
 */
export function scoreCandidates(
  query: ResolveQuery,
  candidates: readonly ResolvedPlace[],
  regionsSearched: readonly RegionId[],
): ResolveResult {
  const ranked = rankPlaces(query, candidates);
  const cap = query.maxResults ?? SCORING.defaultMaxResults;
  return {
    shortlist: ranked.slice(0, Math.max(0, cap)),
    confidence: confidenceOf(ranked),
    regionsSearched,
    candidatesPrefiltered: candidates.length,
  };
}
