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
 *  5. **`altNames` IS scored — `nameScore` is the best over `name` and every alias.** The prototype
 *     scored `name` alone, and this file said so until TLV-RESOLVE-T1: Overture gave us no
 *     alternate names, `poi_index.alt_names` is `not null default '{}'` (migration 0010), and
 *     scoring an always-empty array would have let a future load silently move every benchmark
 *     number. That is now the change this note always said it would be — "the best score over
 *     `name` and `altNames`", one change, here — made ahead of the OSM alias join (`06` §7.1
 *     mitigation 1a, `10` §11) because the aliases about to land are the **Hebrew and English
 *     forms of the same venue**, and this is the single line that makes a caption's `פלאפל הקוסם`
 *     reachable from a row named `Falafel HaKosem`.
 *
 *     Three properties keep it honest. `bestNameScore` takes the *strictly* greater alias, so the
 *     primary `name` wins every tie and a row with no aliases scores byte-identically to before.
 *     `tokenCoverage` travels with the winning string rather than being recomputed against `name`,
 *     so the two reported numbers always describe the same comparison. And `alt_names` is empty in
 *     every row of the 44-case golden data, so `tests/unit/places/benchmark-golden.test.ts` is
 *     unchanged and still passes — verified, and it is the regression test for the day the column
 *     stops being empty.
 *
 * Everything else in this file is the prototype byte for byte, including the tie-break order. The
 * *constants* are no longer: TLV-RANK-1 re-fit `SCORING.total` and extended `SCORING.generic`
 * against the first evidence from a loaded index. This file's arithmetic did not change and its
 * divergence list did not grow — a re-fit is a diff to `scoring-constants.ts`, which is the whole
 * reason the free parameters live there.
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
 * The best `nameScore` over the candidate's primary name and each of its aliases — divergence 5.
 *
 * **Strictly greater**, so `name` wins a tie and an alias can only ever *raise* a row's score. That
 * matters twice: a row with an empty `altNames` (every row in the golden file, and every row in
 * `poi_index` until the alias join lands) is bit-for-bit what it was before this function existed;
 * and an alias that merely equals the primary name — a duplicated Hebrew form, say — cannot reorder
 * the tie-break by swapping in a different `tokenCoverage`.
 *
 * The whole `NameScore` is carried over, not just the number, because `tokenCoverage` is the
 * *explanation* of `nameScore` (`06` §6.1 step 4 reports both). Recomputing coverage against
 * `name` while the score came from an alias would put two numbers in `RankedPlace` that describe
 * different comparisons — the kind of quietly incoherent diagnostic that sends a future
 * investigation the wrong way.
 *
 * No cap on alias count: `alt_names` is written wholesale by the loader from our own join, not by
 * a user, and the loader is where a bound belongs if one is ever needed.
 */
export function bestNameScore(
  queryText: string,
  name: string,
  altNames: readonly string[],
): NameScore {
  let best = nameScore(queryText, name);
  for (const alt of altNames) {
    const candidate = nameScore(queryText, alt);
    if (candidate.nameScore > best.nameScore) best = candidate;
  }
  return best;
}

/* ------------------------------------------------------------------------------------------- *
 * The address term (TLV-ADDR-1)
 * ------------------------------------------------------------------------------------------- */

/** A street address split into the two parts that carry different amounts of evidence. */
interface ParsedAddress {
  /** The house number, as written. `null` when the address has none — 9% of the index. */
  readonly houseNumber: string | null;
  /** Street words, noise-stripped and normalised. Empty means there is nothing to compare. */
  readonly streetTokens: readonly string[];
}

/** A token of 1–4 digits. Five or more is a postal code (`מורשת ישראל 15, 7575603 ראשון לציון`). */
const HOUSE_NUMBER = /^\d{1,4}$/u;
const ALL_DIGITS = /^\d+$/u;

/**
 * `'בזל 42, תל אביב'` → `{ houseNumber: '42', streetTokens: ['בזל'] }`.
 *
 * The **first** 1–4 digit token is the house number, because Israeli addresses put it last but a
 * caption may write anything; taking the first and ignoring later ones is what makes
 * `'דיזנגוף סנטר, מאיר דיזנגוף 50'` parse the same as `'דיזנגוף 50'`. Longer digit runs are
 * dropped outright rather than treated as a number: a postal code that matched would be a
 * spectacular false positive, and one that mismatched would veto a true match.
 *
 * Returns `null` when there is nothing usable — no street words at all — which the caller turns
 * into "no comparison possible", never into "does not match".
 */
export function parseAddress(input: string | null | undefined): ParsedAddress | null {
  if (input === null || input === undefined) return null;
  let houseNumber: string | null = null;
  const streetTokens: string[] = [];
  for (const token of tokenise(input)) {
    if (ALL_DIGITS.test(token)) {
      if (houseNumber === null && HOUSE_NUMBER.test(token)) houseNumber = token;
      continue;
    }
    if (SCORING.addressNoise.has(token)) continue;
    streetTokens.push(token);
  }
  return streetTokens.length === 0 ? null : { houseNumber, streetTokens };
}

/**
 * Which writing systems a set of tokens is in, by first letter. Coarse on purpose: the question is
 * only ever "could these two strings be compared at all", and three ranges answer it for this
 * index (83% Hebrew `address_line`, 10% Latin, 5% Cyrillic).
 */
function scriptsOf(tokens: readonly string[]): ReadonlySet<string> {
  const scripts = new Set<string>();
  for (const token of tokens) {
    const first = Array.from(token)[0];
    if (first === undefined) continue;
    if (/\p{Script=Hebrew}/u.test(first)) scripts.add('hebrew');
    else if (/\p{Script=Cyrillic}/u.test(first)) scripts.add('cyrillic');
    else if (/\p{Script=Latin}/u.test(first)) scripts.add('latin');
    else scripts.add('other');
  }
  return scripts;
}

/**
 * How well the query's street words are found in the candidate's.
 *
 * **A minimum, not a mean**, and that is the whole design. A mean lets one matching word carry a
 * wrong street: `שלמה המלך 1` against `המלך ג'ורג' 1` — two real Tel Aviv streets — averages to
 * 0.90 because `המלך` matches itself. Requiring *every* substantial query word to be found drops
 * that pair to 0.80, under the gate, while leaving genuine variants (`איינשטיין`/`אינשטיין`,
 * 0.953) above it.
 *
 * Only the query's words must be found, not the candidate's, so `address_line` is free to be more
 * verbose than the caption — `'דיזנגוף סנטר, מאיר דיזנגוף 50'` still matches `'דיזנגוף 50'` at
 * 1.000. The asymmetry is deliberate and it is the direction the data actually varies in.
 *
 * Tokens shorter than `minStreetTokenLength` are not *required* to match (they can still satisfy
 * another token's search), because two-letter Hebrew particles are mutually similar enough to
 * carry a wrong street. If every token is short, they are all required — a two-letter street name
 * is still a street name, and dropping the requirement entirely would compare nothing.
 */
function streetSimilarity(
  queryStreet: readonly string[],
  candidateStreet: readonly string[],
): number {
  if (queryStreet.length === 0 || candidateStreet.length === 0) return 0;
  const substantial = queryStreet.filter(
    (token) => Array.from(token).length >= SCORING.address.minStreetTokenLength,
  );
  const required = substantial.length > 0 ? substantial : queryStreet;

  let worst = 1;
  for (const token of required) {
    let best = 0;
    for (const candidateToken of candidateStreet) {
      const similarity = jaroWinklerSimilarity(token, candidateToken);
      if (similarity > best) best = similarity;
    }
    if (best < worst) worst = best;
  }
  return worst;
}

/**
 * How much a candidate's `address_line` corroborates the caption's `addressHint`.
 *
 * **Three-valued, and the third value is the point.** `null` is *"no comparison was possible"* and
 * is not the same as 0, *"this is somewhere else"*. Eight of the seventeen real candidates carry no
 * `addressHint` at all, 7% of index rows carry no address, and 5% carry one in a script the caption
 * cannot be compared against; if any of those were scored 0 the term would quietly become a penalty
 * on the majority of the corpus in order to reward a minority. `scorePlace` gives a `null` row its
 * unmodified score, so a missing address costs exactly nothing.
 *
 * The comparison itself, in order:
 *
 *  1. Either side unparseable → `null`.
 *  2. No writing system in common → `null`. `'רוטשילד 15'` against `'Rothschild Boulevard 15'` is
 *     the same address and we cannot tell; reporting 0 would demote a row for being transliterated.
 *     Transliterating street names is a different project (`06` §7.1) and this is the honest
 *     placeholder for it.
 *  3. Street below `streetMatch` → **0**. Different street, whatever the numbers say.
 *  4. Both house numbers present → equal gives the street score, different gives **0**. A different
 *     house number is not weak evidence, it is conclusive: `דיזנגוף 99` is not `דיזנגוף 163`.
 *  5. A number missing on either side → the street score, halved.
 */
export function addressScore(
  addressHint: string | null | undefined,
  candidateAddress: string | null | undefined,
): number | null {
  const query = parseAddress(addressHint);
  const candidate = parseAddress(candidateAddress);
  if (query === null || candidate === null) return null;

  const queryScripts = scriptsOf(query.streetTokens);
  const candidateScripts = scriptsOf(candidate.streetTokens);
  if (![...queryScripts].some((script) => candidateScripts.has(script))) return null;

  const street = streetSimilarity(query.streetTokens, candidate.streetTokens);
  if (street < SCORING.address.streetMatch) return 0;

  if (query.houseNumber !== null && candidate.houseNumber !== null) {
    return query.houseNumber === candidate.houseNumber ? street : 0;
  }
  return street * SCORING.address.streetOnly;
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
 * One candidate's score: `0.80·nameScore + 0.10·categoryScore + 0.10·datasetConfidence`, and then
 * the address term when — and only when — there is an address on both sides to compare.
 *
 * The three base weights sum to 1.00, which is what keeps `score` in `[0,1]` — `resolution_score`'s
 * CHECK — without a clamp. The category weight was 0.18 until TLV-RANK-1, where a category bonus
 * was measured outranking a 1.000 name match (TLV-14). Why 0.10, and why the difference went to
 * `name` rather than to `datasetConfidence`, is argued once in `scoring-constants.ts`.
 *
 * ## The address term, and the one property it has to have (TLV-ADDR-1)
 *
 * `score = (1 − w)·base + w·addressScore` **for a row where the addresses could be compared**, and
 * `score = base` for every other row. Written that way, and not as a fourth weight taken out of the
 * other three, because of a measured fact: **8 of the 17 real candidates carry no `addressHint`.**
 * A term that is always present would have quietly re-weighted every one of those downward to pay
 * for the minority that has an address — trading eight losses for four wins. Here, `addressScore`
 * returning `null` (`06`'s "no comparison possible") makes the row's arithmetic **bit-for-bit what
 * it was before this function learned about addresses**, and `tests/unit/places/score.test.ts`
 * asserts exactly that rather than describing it.
 *
 * The three outcomes, and each is the right sign:
 *
 *  - **matched** → `(1−w)·base + w·a ≥ base` whenever `a ≥ base`, so corroboration lifts a row and
 *    a perfect everything is still exactly 1.00. The weights still sum to 1.00: `(1−w)·1 + w = 1`.
 *  - **contradicted** (`a` small, or 0 from a different house number) → the row falls. That is the
 *    intended reading: we know where this venue is and this candidate is not there.
 *  - **unknown** (`null`) → nothing happens at all.
 *
 * A row we cannot place therefore outranks a row we can place *elsewhere*, which is the correct
 * ordering: the second has evidence against it and the first has none either way.
 *
 * **The safety bound, and it is arithmetic rather than hope.** The lift a perfect address can give
 * is `w·(1 − base)`, so the lowest score that can be carried to the `preselect` gate is
 * `(preselectScore − w) / (1 − w)` — 0.90 at today's constants. Nothing scoring below that today
 * can be auto-accepted by adding an address, so the address cannot manufacture an auto-accept for a
 * row whose *name* does not already almost match. That matters because an address is not unique:
 * `לבונטין 19` holds three venues and `בן יהודה 155` holds two, so the address ties them and the
 * name still has to break the tie. `score.test.ts` pins the bound to the constants.
 */
export function scorePlace(
  place: ResolvedPlace,
  categoryHint: CategoryHint | null,
  queryText: string,
  addressHint: string | null = null,
): RankedPlace {
  const name = bestNameScore(queryText, place.name, place.altNames);
  const category = categoryScore(categoryHint, place.providerCategory);
  const base =
    SCORING.total.name * name.nameScore +
    SCORING.total.category * category +
    SCORING.total.datasetConfidence * place.datasetConfidence;
  const address = addressScore(addressHint, place.addressLine);
  const score =
    address === null
      ? base
      : (1 - SCORING.address.weight) * base + SCORING.address.weight * address;
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
  // `?? null` rather than a non-null default in the signature: `addressHint` is optional on
  // `ResolveQuery` so that every existing construction site — the adapter, the probe route, the
  // benchmark harnesses — keeps compiling untouched, and an absent field and an explicit `null`
  // have to mean the same thing or the two would resolve the same caption differently.
  return candidates
    .map((place) => scorePlace(place, query.categoryHint, query.text, query.addressHint ?? null))
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
