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
 * nowhere else. There are seven, all of them deliberate:
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
 *  6. **The name term is the best over every QUERY FORM, not just the query** (TLV-BILING-B).
 *     `ResolveQuery.textVariants` carries alternate-script forms of the same venue name — a
 *     Hebrew caption's `קוהי` alongside the Latin `Kohi` — and `nameScore` is the best match over
 *     `text` and each of them, crossed with divergence 5's aliases. It is the mirror image of
 *     divergence 5: 5 widens the *candidate* side, 6 widens the *query* side, and the index turned
 *     out to need the second one, because `alt_names` is empty in every loaded row while the
 *     venues we cannot find sit there under their Latin names
 *     (`docs/evidence/places/bilingual-expansion.md`).
 *
 *     It has the same three honesty properties. The winning form is taken **strictly** greater, so
 *     `text` wins every tie and a query with no variants scores byte-identically to before;
 *     `tokenCoverage` travels with the winning form so the two reported numbers describe one
 *     comparison; and `ScoredPlace.matchedText` records which form won, because a resolution whose
 *     provenance cannot be read back is not evidence.
 *
 *     **The gates did not move and must not.** Widening the query can only raise a row's score
 *     (`max` over more forms), never lower it, so more rows can reach `preselectScore` —
 *     `queryForms`'s admission rule is the only thing narrowing that, and the margin gate is the
 *     only thing standing between a lucky variant and a false auto-accept. Read `queryForms` before
 *     changing anything here.
 *
 *  7. **`preselect` has a third gate: no branch rival** (TRACK2-BRANCH). The prototype bands on
 *     score and margin alone, and with the score reduced to the name term that lets a bare venue
 *     name auto-accept over its own branches — measured, TYO-10 pins a row 3 km from the Ginza
 *     branch the case asks for, at margin 0.069. The gap between a bare name and `bare + suffix`
 *     is `0.45·(1 − jaroWinkler) + 0.04·surplusTokens`, i.e. a measure of suffix length rather
 *     than of confidence, so no value of `preselectMargin` separates the two. `branchRival` below
 *     is the separator, and `scoring-constants.ts`'s `branchGuard` carries the measurement.
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
import { haversineKm, type GeoPoint } from './clusters';
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

/* ------------------------------------------------------------------------------------------- *
 * Query forms — `text` plus its alternate-script variants (TLV-BILING-B)
 * ------------------------------------------------------------------------------------------- */

/**
 * How many alternate forms of `ResolveQuery.text` are ever considered, beyond `text` itself.
 *
 * A ceiling rather than a courtesy. Every extra form is another chance for *some* row in the index
 * to score highly, and the auto-accept gates are unchanged — so an unbounded variant list is a
 * quiet widening of what the product will accept without a human. It is also the prefilter's token
 * budget: `MAX_PREFILTER_TOKENS` is 12 and it is shared round-robin across the forms, so four forms
 * is three tokens each, which is more than the modal business name has.
 *
 * Three, because the extraction schema offers at most the Latin form, the Hebrew form and
 * `identifiedName`. A fourth would be the model inventing one.
 */
export const MAX_QUERY_VARIANTS = 3;

/**
 * The query forms actually used for retrieval and scoring: `text` first, then its admitted
 * variants. **One answer, used by both sides** — `rankPlaces` scores over exactly this list and
 * `prefilterTokens` selects rows over exactly this list, for the same reason `queryTokens` is
 * shared with the prefilter (`10` §5's recall gate is meaningless if the two ask different
 * questions).
 *
 * `text` is always first and always present, verbatim, even when it normalises to nothing. That is
 * what makes the no-variant case bit-for-bit what it was before this function existed: the
 * name-score search below takes a **strictly** greater variant, so `text` wins every tie.
 *
 * ## The admission rule, and why a variant is held to a higher bar than `text`
 *
 * A variant is admitted only if it (a) normalises to something, (b) is not already in the list
 * under `normalise()`, and (c) has **at least one distinctive token**.
 *
 * (c) is the safety rule and it is deliberately asymmetric with `text`. `queryTokens` has an
 * all-generic fallback — *"best coffee ever"* scores against its own generic words rather than
 * dividing by zero — and that fallback exists so a caption the model could not read still produces
 * an honest `confirm` instead of nothing. A **variant** is not a caption; it is the model's claim
 * that this is the same venue under another name. A claim consisting only of words like `coffee`,
 * `shop`, `restaurant`, `בר` is not a name, and admitting it can only add rows and raise scores —
 * on a path whose gates did not move. `Kohi Coffee Shop` would be reachable from a bare
 * `Coffee Shop`, and so would every other coffee shop in the index.
 *
 * This is an admission rule in the sense `scoring-constants.ts` uses the term, not a weight: it
 * changes which strings count as a name, and nothing about how a name is scored.
 */
export function queryForms(
  text: string,
  textVariants?: readonly string[] | null,
): readonly string[] {
  const forms = [text];
  if (textVariants === undefined || textVariants === null || textVariants.length === 0) {
    return forms;
  }

  const seen = new Set<string>([normalise(text)]);
  for (const variant of textVariants) {
    if (forms.length > MAX_QUERY_VARIANTS) break;
    if (typeof variant !== 'string') continue;
    const key = normalise(variant);
    if (key === '' || seen.has(key)) continue;
    if (distinctiveTokens(variant).length === 0) continue;
    seen.add(key);
    forms.push(variant);
  }
  return forms;
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

/** A `NameScore` plus the query form that produced it. */
export interface FormNameScore extends NameScore {
  /**
   * Which of `queryForms()`'s strings won — `ResolveQuery.text` itself, or one of its variants.
   * Verbatim, so it can be printed next to the caption in an evidence run without a lookup.
   */
  readonly matchedText: string;
}

/**
 * The best `bestNameScore` over every query form — the retrieval-and-scoring half of the bilingual
 * change (TLV-BILING-B). `קוהי` and `Kohi` are the same venue asked about twice; the row's name
 * term is whichever question it answers best.
 *
 * **Strictly greater, again**, and for the same reason `bestNameScore` is: `queryForms` puts `text`
 * at index 0, so with no variants — or with variants that all score no higher — this is
 * `bestNameScore(text, …)` byte for byte, and `matchedText` is `text`. There is no path where
 * offering a variant *lowers* a row's score, which is the property the false-auto-accept analysis
 * turns on: variants can only push scores up, so the risk they carry is entirely in *which* row
 * they push up, never in demoting the right one.
 */
export function bestNameScoreAcrossForms(
  forms: readonly string[],
  name: string,
  altNames: readonly string[],
): FormNameScore {
  const first = forms[0] ?? '';
  let best: FormNameScore = { ...bestNameScore(first, name, altNames), matchedText: first };
  for (let i = 1; i < forms.length; i += 1) {
    const form = forms[i];
    if (form === undefined) continue;
    const candidate = bestNameScore(form, name, altNames);
    if (candidate.nameScore > best.nameScore) {
      best = { ...candidate, matchedText: form };
    }
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
 * One candidate's score: **`nameScore`**, and then the address term when — and only when — there is
 * an address on both sides to compare.
 *
 * `nameScore` is the best over every query form (`textVariants`, divergence 6) crossed with every
 * alias (divergence 5). Nothing else on this function knows about variants: the category term, the
 * address term, the weights and the bands are all exactly what they were.
 *
 * The base is still written as a weighted sum of three terms because `SCORING.total` still names
 * three free parameters — two of which are now **zero**. `category` and `datasetConfidence` were
 * both removed from the score under RESOLVE-CONF-1 (2026-08-28), on measurement, and the argument
 * for each is in `scoring-constants.ts`. The short version: one bit derived from a three-value hint
 * against a provider's hundred-value taxonomy was deciding whether the user saw the candidate
 * picker, and an Overture crawler-confidence column was vetoing matches every other term agreed on.
 * The weights still sum to 1.00, which is what keeps `score` in `[0,1]` — `resolution_score`'s
 * CHECK — without a clamp.
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
  textVariants: readonly string[] | null = null,
): ScoredPlace {
  const name = bestNameScoreAcrossForms(
    queryForms(queryText, textVariants),
    place.name,
    place.altNames,
  );
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
    matchedText: name.matchedText,
    addressScore: address,
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
/**
 * A `RankedPlace` that also says **which query form matched** — the provenance half of
 * TLV-BILING-B. Declared here rather than on `RankedPlace` in `domain/types.ts` so that adding it
 * touched no other file: it is a structural superset, so a `ScoredPlace` is a `RankedPlace`
 * everywhere one is expected, and `ResolveResult.shortlist` carries the field at run time while
 * still being typed as the narrower thing. `matchedTextOf` below is the reader for callers that
 * only hold a `RankedPlace` — chiefly the evidence harnesses, which is what this exists for.
 *
 * Promote it into `RankedPlace` proper if a product surface ever needs it. Nothing here is a
 * framework for provenance; it is one string and one accessor.
 */
export interface ScoredPlace extends RankedPlace {
  readonly matchedText: string;
  /**
   * The address term as `addressScore` returned it — three-valued, and the third value is why it
   * is carried rather than recomputed: `null` (*"no comparison was possible"*) and `0` (*"this is
   * somewhere else"*) are different facts, and by the time a row reaches `confidenceOf` or the
   * picker the `addressHint` that produced it is out of reach. `ux-when-we-ask.md` §3.1 makes
   * `addressScore === 0` the highest-precedence reason to ask the user, and a reason re-derived
   * from a hint the view has to fetch again is a reason that will eventually disagree with the
   * band it explains.
   */
  readonly addressScore: number | null;
}

/**
 * The query form that produced a ranked row's name score, or `null` for a `RankedPlace` that did
 * not come from `scorePlace` (a hand-built test fixture, a record read back from storage).
 */
export function matchedTextOf(ranked: RankedPlace): string | null {
  const withForm = ranked as Partial<ScoredPlace>;
  return typeof withForm.matchedText === 'string' ? withForm.matchedText : null;
}

/**
 * The address term recorded on a ranked row: a number, `null` for *"no comparison was possible"*,
 * and `undefined` for a row that did not come from `scorePlace`. Three return values because
 * collapsing any two of them loses the distinction the term exists to make.
 */
export function addressScoreOf(ranked: RankedPlace): number | null | undefined {
  return (ranked as Partial<ScoredPlace>).addressScore;
}

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
): readonly ScoredPlace[] {
  // `?? null` rather than a non-null default in the signature: `addressHint` is optional on
  // `ResolveQuery` so that every existing construction site — the adapter, the probe route, the
  // benchmark harnesses — keeps compiling untouched, and an absent field and an explicit `null`
  // have to mean the same thing or the two would resolve the same caption differently.
  // Same `?? null` on `textVariants`, and the same reason twice over: an absent field and an empty
  // array are one state (`ResolveQuery`'s doc comment says so), and `queryForms` is the single
  // place that decides what the list of forms is, so the adapter's prefilter and this scorer
  // cannot end up considering different ones.
  return candidates
    .map((place) =>
      scorePlace(
        place,
        query.categoryHint,
        query.text,
        query.addressHint ?? null,
        query.textVariants ?? null,
      ),
    )
    .sort(byRank);
}

/**
 * What a candidate list of length one means. It is a property of the **provider**, not of the
 * scoring, which is why it is a parameter here rather than a constant.
 *
 * `'narrow-filter'` — the Overture path, and the default. `poi_index` rows arrive from a cheap
 * token/trigram prefilter, so one row means *the filter matched one thing*, which says nothing
 * about whether the right venue exists. `10` §12 Q3 rules the band for it: `confirm`. Unmeasured
 * margin is not perfect margin.
 *
 * `'exhaustive-search'` — the Google path. Text Search consults a global index and returns the
 * matches it has; one result means *the index holds one place under that name near that city*,
 * which is real evidence rather than an artefact of how cheaply we filtered. Measured on the 13
 * real corpus TikToks, Google returns exactly one result for 14 of 16 candidates, so under
 * `'narrow-filter'` the auto-accept rate is structurally 0% no matter how right the answers are —
 * and they were right 15/15.
 *
 * The score gate is **not** relaxed by either value: a sole candidate still has to clear
 * `preselectScore`. What changes is only whether an unmeasurable margin blocks it.
 */
export type SoleCandidateMeaning = 'narrow-filter' | 'exhaustive-search';

/* ------------------------------------------------------------------------------------------- *
 * The branch guard (TRACK2-BRANCH)
 * ------------------------------------------------------------------------------------------- */

/**
 * The tokens one place name has that the other does not, or `null` when neither name's tokens
 * contain the other's — `['yakumo']` for `Onibus Coffee` against `Onibus Coffee Yakumo`, `[]` for
 * two rows named `The Dove`, `null` for `Bar 51` against `Hostel 51`.
 *
 * **Multiset containment over normalised tokens, not substring containment.** `normalise('Bar B')`
 * is a substring of `normalise('Bar Benfiddich')` and the two are not branches of anything;
 * measured, substring containment fires on TYO-05 and TYO-13 for exactly that pair. Tokens also
 * make the *differentiator* readable, which is what the caption rule below needs.
 *
 * The differentiators are deliberately **not** filtered through `SCORING.generic`. `Monmouth
 * Coffee` and `Monmouth Coffee Company` differ only by a word that set would call generic, and the
 * two rows behind those names are 705 m and 5 km apart: a suffix that looks like noise still
 * leaves two premises that need choosing between.
 */
export function nameDifference(a: string, b: string): readonly string[] | null {
  const left = tokenise(a);
  const right = tokenise(b);
  if (left.length === 0 || right.length === 0) return null;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const remaining = [...longer];
  for (const token of shorter) {
    const at = remaining.indexOf(token);
    if (at < 0) return null;
    remaining.splice(at, 1);
  }
  return remaining;
}

/** The two fields this file needs off a place to compare it with another: what it is called, and
 *  where it is. Widened from `ResolvedPlace` so a shortlist row, a stored row or a test fixture can
 *  all be compared without any of them being converted first. */
export type NamedPoint = GeoPoint & { readonly name: string };

/** `placeProximity`'s answer: how the two names relate, and how far apart the two rows are. */
export interface PlaceProximity {
  /** `nameDifference` of the two names — `null` when neither name's tokens contain the other's. */
  readonly difference: readonly string[] | null;
  /** Great-circle metres between them. */
  readonly metres: number;
  /**
   * `metres <= SCORING.samePlaceMetres`: one venue recorded twice rather than two premises.
   *
   * Carried here so that the two consumers of this predicate read the **same** number. They draw
   * opposite conclusions from it and that is the design: `difference !== null && sameSpot` is one
   * place and the shortlist collapses it (`docs/ux-when-we-ask.md` §4);
   * `difference !== null && !sameSpot` is two branches and `branchRival` asks about it.
   */
  readonly sameSpot: boolean;
}

/**
 * The one name-and-distance comparison of two candidate rows.
 *
 * Exported as a single function because the picker needs exactly this predicate with the opposite
 * verdict, and a private copy on each side is how the collapse and the guard end up disagreeing
 * about whether a row exists — `ux-when-we-ask.md` §4's table, in code:
 *
 * | | `sameSpot` | far apart |
 * |---|---|---|
 * | `difference !== null` | one place — collapse, never ask | branches — ask |
 * | `difference === null` | rivals — ask | rank decides |
 */
export function placeProximity(a: NamedPoint, b: NamedPoint): PlaceProximity {
  const metres = haversineKm(a, b) * 1000;
  return {
    difference: nameDifference(a.name, b.name),
    metres,
    sameSpot: metres <= SCORING.samePlaceMetres,
  };
}

/**
 * The rival that makes the top-1 a **branch question**, or `null` when there is none.
 *
 * The class this exists for: the top candidate and a close rival are plausibly branches of one
 * venue, and nothing in the score can say which one the caption meant — because the gap between
 * them measures how long the branch suffix is, not which branch was filmed
 * (`scoring-constants.ts`, `branchGuard`). Branch identity that the caption does not settle is
 * what `confirm` is for: the user watched the video and can answer, the scorer cannot.
 *
 * Three conditions, all required, each of which rules out a different non-question:
 *
 *  1. **Within `rivalScoreBand` of the top.** A row far below is not competing for the pin.
 *  2. **`nameDifference` is not `null`, and the caption did not settle it.** If every token the
 *     longer name adds is already in what the user asked — `Dishoom Shoreditch` against
 *     `Dishoom` — then the caption *did* say which branch, and asking would be the picker's other
 *     failure: a question whose answer is on the screen already
 *     (`handoff-2026-08-28-categories-and-the-picker.md` §3.4 item 4). An **empty** difference —
 *     two rows under the identical name — can never be settled this way, which is why the check
 *     requires at least one differentiator.
 *  3. **Further apart than `SCORING.samePlaceMetres`.** Two records of the same premises pin the
 *     same point, so choosing between them is a prefilter artefact, not a decision — and the
 *     shortlist collapse removes one of them before this ever runs. This is what keeps
 *     `Kohi Coffee Shop` and `NIKO by Sharon Cohen` — same address, metres apart — auto-accepting,
 *     although that pair also fails (2) on the names.
 *
 * `forms` is `queryForms()`'s output, so the caption rule reads the Hebrew and the Latin form of
 * the question alike. An empty `forms` means the caller is banding a bare score list rather than
 * answering a query — an evidence replay — and the guard does not run; see `confidenceOf`.
 *
 * **Known gap: two *sibling* branches never satisfy (2).** `X 銀座店` against `X 日本橋店` is the
 * same question and neither name contains the other, so this returns `null`. Catching it needs a
 * shared-prefix rule, which on this corpus also catches `Bar B`/`Bar Benfiddich`; it is not
 * attempted here.
 */
export function branchRival(
  ranked: readonly RankedPlace[],
  forms: readonly string[],
): RankedPlace | null {
  const top = ranked[0];
  if (top === undefined || forms.length === 0) return null;
  const asked = new Set(forms.flatMap((form) => tokenise(form)));

  for (let i = 1; i < ranked.length; i += 1) {
    const rival = ranked[i]!;
    // Cheapest test first: `ranked` is sorted, but this is written as a filter rather than a
    // `break` so a hand-built list cannot make the guard depend on sort order.
    if (top.score - rival.score > SCORING.branchGuard.rivalScoreBand) continue;
    const { difference, sameSpot } = placeProximity(top.place, rival.place);
    if (difference === null) continue;
    if (difference.length > 0 && difference.every((token) => asked.has(token))) continue;
    if (sameSpot) continue;
    return rival;
  }
  return null;
}

/**
 * Whether the **only** thing holding this row under the confirm gate is an address that
 * contradicts the caption (TRACK2-ADDR, folded into TRACK2-BRANCH's measurement pass).
 *
 * ## The arithmetic this exists to fix
 *
 * `addressScore === 0` means the streets or the house numbers disagree, and `scorePlace` prices
 * that at `score = (1 − 0.2)·base`. So a contradicted row reaches `confirmScore` **only if
 * `base ≥ 1.0000`** — a mathematically perfect name and nothing less. That threshold was never
 * chosen; it is `0.8 / 0.8` falling out of two constants fitted for other reasons, and its effect
 * is that we throw away a provider row we found and let `derivePlaceSave` fall back to the model's
 * coordinate, which is measured 65–470 m out.
 *
 * Measured on the two contradicted candidates in the real corpus
 * (`docs/evidence/places/tiktok-recognition-run.google.json`), replayed under the current weights:
 * `טרטוריה אונה` scores exactly 0.8000 and survives *only* because its name matches perfectly,
 * and `רוסטיקו` scores 0.7308 on a 0.9134 name and is discarded. Both are adjudicated **correct
 * venues**; Google simply returned a different branch than the caption's street.
 *
 * ## Why a band floor and not a smaller penalty
 *
 * The ranking is right as it is: a row we can place *elsewhere* should fall below a row we cannot
 * place at all, and `scorePlace`'s comment says so. What is wrong is the **destination**. A
 * contradicted address is strong evidence about *where this candidate is*, and no evidence at all
 * that the venue does not exist — so it should rank the row down and then hand it to the user with
 * the conflict on screen (`docs/ux-when-we-ask.md` §3.1's `address_conflict`, the
 * highest-precedence reason to ask, which could never fire while such a row never reached
 * `confirm`).
 *
 * So the score is left exactly as it was — it is stored in `places.resolution_score` and it is an
 * honest number — and only the band moves. `base` is recovered by division rather than carried as
 * a field: when `addressScore === 0` the address term contributes nothing, so
 * `score = (1 − weight)·base` holds exactly.
 *
 * The alternative measured and not taken was an asymmetric weight — a contradiction costing
 * `contradictedWeight` where corroboration pays `weight`. At 0.10 it rescues both corpus cases
 * (0.900 and 0.822) and keeps auto-accept unreachable, but it needs a new free parameter with only
 * 0.02 of headroom against the 0.92 gate, and it moves the *ranking* to buy a *band*.
 * `branch-guard-2026-08-28.md` §5 has both tables.
 *
 * **This cannot manufacture an auto-accept**: `preselect` is decided above and requires
 * `score ≥ 0.92`, while a contradicted row cannot exceed `1 − weight = 0.80`. `score.test.ts`
 * pins that as an inequality over the constants, not as a case.
 */
function contradictedAddressOnly(top: RankedPlace): boolean {
  if (addressScoreOf(top) !== 0) return false;
  return top.score / (1 - SCORING.address.weight) >= SCORING.bands.confirmScore;
}

/**
 * `06` §6.2's three bands, over the full ranking.
 *
 * With the default `'narrow-filter'`, `preselect` requires both gates and a null margin therefore
 * cannot reach it — `10` §12 Q3's ruling expressed as arithmetic. Nothing here rounds: the
 * prototype rounds the margin to three decimals only when writing its JSON, and rounding before a
 * `≥ 0.05` comparison would move a 0.0496 case across the gate for a display convention.
 *
 * ## `forms`, and why the branch guard is off without it (TRACK2-BRANCH)
 *
 * `preselect` now needs a third thing: no `branchRival`. That guard's second condition asks whether
 * **the caption already named the branch**, so it cannot run without knowing what was asked — and
 * a caller with no query is not answering a question, it is banding a list of numbers. Passing no
 * `forms` therefore leaves the two gates exactly as they were, which is what
 * `benchmark-golden.test.ts`'s replay of the 2026-07 recorded scores relies on: that section
 * reproduces a run, and a policy invented afterwards has no business re-banding it.
 *
 * The production path is `scoreCandidates`, which always passes `queryForms()`'s output;
 * `score.test.ts` pins that wiring, because "the guard is off unless you ask for it" is only safe
 * while something asserts the one caller does ask.
 */
export function confidenceOf(
  ranked: readonly RankedPlace[],
  soleCandidateMeaning: SoleCandidateMeaning = 'narrow-filter',
  forms: readonly string[] = [],
): Confidence {
  const top = ranked[0];
  if (top === undefined) {
    return { band: 'no_match', score: 0, margin: null };
  }
  const second = ranked[1];
  const margin = second === undefined ? null : top.score - second.score;

  // A margin that exists must always clear its gate. The provider's answer only decides what an
  // *absent* margin means, so this can never let a measured-but-poor margin through.
  const marginOk =
    margin === null
      ? soleCandidateMeaning === 'exhaustive-search'
      : margin >= SCORING.bands.preselectMargin;

  let band: ConfidenceBand;
  if (top.score >= SCORING.bands.preselectScore && marginOk && branchRival(ranked, forms) === null) {
    band = 'preselect';
  } else if (top.score >= SCORING.bands.confirmScore || contradictedAddressOnly(top)) {
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
  soleCandidateMeaning: SoleCandidateMeaning = 'narrow-filter',
): ResolveResult {
  const ranked = rankPlaces(query, candidates);
  const cap = query.maxResults ?? SCORING.defaultMaxResults;
  return {
    shortlist: ranked.slice(0, Math.max(0, cap)),
    // The same `queryForms` the ranking was scored with, so the branch guard's "did the caption
    // say which branch" test reads exactly the question the rows were matched against.
    confidence: confidenceOf(
      ranked,
      soleCandidateMeaning,
      queryForms(query.text, query.textVariants ?? null),
    ),
    regionsSearched,
    candidatesPrefiltered: candidates.length,
  };
}
