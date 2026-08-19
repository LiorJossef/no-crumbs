/**
 * Every weight, threshold and word list the scorer has, in **one** exported object.
 *
 * That is a requirement, not tidiness. `06` §6.3's closing paragraph: *"These weights and
 * thresholds are calibrated on 44 cases and will be re-fit once the AI Engineer's 50-post golden
 * set (A5) exists, and again if a credentialed provider is benchmarked. They live in one exported
 * constant object with the benchmark as their regression test."* A re-fit must be a diff to this
 * file and nothing else, and it must be obvious from this file alone what the free parameters are.
 *
 * Values are the prototype's, unchanged: `docs/evidence/places/resolve-overture-scored.py`, which
 * produced `raw-overture-scored.json` and therefore `06` §6.3's 29/12/3 band table. Nothing here
 * was re-derived, re-tuned or rounded in the port. Two constants that look like parameters are
 * deliberately **not** here:
 *
 *  - Jaro-Winkler's prefix scale, prefix cap and 0.7 boost gate (`jaro-winkler.ts`). They are not
 *    calibration; they are what makes our similarity function equal to the DuckDB one the benchmark
 *    was measured with. Tuning them does not adjust the resolver, it invalidates the evidence.
 *  - `NORM_VERSION` (`normalise.ts`), which is a data-migration fact — it is written into
 *    `poi_regions.norm_version` and a change to it forces a reload.
 *
 * `Object.freeze` is applied because a mutable global weights table is a test-order bug waiting to
 * happen: one test that pokes a threshold to check a band would silently re-band every later test.
 * The type is `readonly` throughout, but `readonly` is compile-time only and the sets are not.
 */

import type { CategoryHint } from '../types';

/** Shape stated explicitly so a re-fit cannot quietly add a knob nothing reads. */
export interface ScoringConstants {
  /**
   * `nameScore = 0.45·whole + 0.55·tokenCoverage − extraTokenPenalty`, then floored at 0
   * (`06` §6.1 step 4). Coverage outweighs whole-string similarity because a caption writes a
   * fragment of the sign — *"Onibus"* for *"Onibus Coffee Nakameguro"* — far more often than it
   * writes the sign.
   */
  readonly name: {
    readonly whole: number;
    readonly tokenCoverage: number;
  };
  /**
   * `score = 0.72·nameScore + 0.18·categoryScore + 0.10·datasetConfidence`. The three sum to 1.00,
   * which is what keeps `score` inside `places.resolution_score`'s `check (… between 0 and 1)`
   * (migration 0005) without a clamp. A re-fit that breaks that sum needs to re-check the CHECK.
   */
  readonly total: {
    readonly name: number;
    readonly category: number;
    readonly datasetConfidence: number;
  };
  /**
   * Per surplus distinctive token in the candidate, and its cap. This is what stops *"The
   * Fishmongers Kitchen"* from claiming *"this hidden gem in Shoreditch"* (`06` §6.1 step 4).
   */
  readonly extraTokenPenalty: {
    readonly perToken: number;
    readonly max: number;
  };
  /**
   * Credit for a distinctive query token appearing as a **substring** of the normalised candidate
   * name. Handles agglutinated and prefixed names — `CafeXoho`, `פלאפל הקוסם` — which tokenise
   * apart and would otherwise score on Jaro-Winkler alone. Below 1.0 on purpose: a substring hit is
   * strong evidence, not a token match.
   */
  readonly substringCredit: number;
  /**
   * A token is "distinctive" if it is not in `generic` **and** is longer than this many characters
   * (the prototype's `len(t) > 1`). Counted in code points, not UTF-16 units, so an astral-plane
   * letter counts as one character exactly as it does in Python.
   */
  readonly minDistinctiveTokenLength: number;
  /**
   * `06` §6.2's bands. `preselect` needs `score ≥ preselectScore` **and**
   * `margin ≥ preselectMargin`; `confirm` is `score ≥ confirmScore` with either gate failing;
   * below `confirmScore` is `no_match`.
   *
   * The margin gate is the one doing the important work: a high score with a low margin almost
   * never means "unsure which business", it means "sure of the business, unsure **which branch**",
   * and that is exactly the question a human must settle. Measured at these values: 29 preselect
   * with **zero** false auto-accepts, and all three no-name captions (0.813–0.894) caught by the
   * 0.92 gate (`06` §6.3).
   */
  readonly bands: {
    readonly preselectScore: number;
    readonly preselectMargin: number;
    readonly confirmScore: number;
  };
  /** `ResolveQuery.maxResults === null` → this. `06` §6.1 step 5's top 5. */
  readonly defaultMaxResults: number;
  /**
   * Words that carry no identity in a place name, so they are excluded from token coverage: a query
   * of *"best coffee ever"* has no distinctive token at all, which is how it ends up in `confirm`
   * rather than confidently matching some café.
   *
   * Verbatim from the prototype, including two entries that can never fire and are kept anyway so
   * the list stays diffable against the source of the measured numbers: `'café'` (normalisation
   * strips the accent before this set is consulted, so the reachable spelling is `'cafe'`) and
   * `'a'`, which `minDistinctiveTokenLength` has already removed. City words are in here
   * (`tokyo`, `london`, `tel`, `aviv`) because *"café in Tokyo"* must not match *"Tokyo Coffee"* on
   * the city name.
   */
  readonly generic: ReadonlySet<string>;
  /**
   * Per `CategoryHint`, the tokens a candidate's provider category may contain to count as a
   * category match. Indexed **only** by a `CategoryHint` — never by a raw string. `11` §2 ruling 9:
   * the prototype's `CAT_TOKENS[hint]` is a `KeyError` for four of the seven values `09` §4.2's
   * schema can emit, and `categoryHintFor()` (`category-hint.ts`) is the total conversion that
   * makes this table safe to index.
   */
  readonly categoryTokens: Readonly<Record<CategoryHint, ReadonlySet<string>>>;
}

export const SCORING: ScoringConstants = Object.freeze({
  name: Object.freeze({ whole: 0.45, tokenCoverage: 0.55 }),
  total: Object.freeze({ name: 0.72, category: 0.18, datasetConfidence: 0.1 }),
  extraTokenPenalty: Object.freeze({ perToken: 0.04, max: 0.15 }),
  substringCredit: 0.97,
  minDistinctiveTokenLength: 2,
  bands: Object.freeze({ preselectScore: 0.92, preselectMargin: 0.05, confirmScore: 0.8 }),
  defaultMaxResults: 5,
  generic: Object.freeze(
    new Set([
      'cafe', 'café', 'coffee', 'bar', 'restaurant', 'kitchen', 'the', 'and', 'a', 'of', 'de', 'co',
      'company', 'roasters', 'roastery', 'house', 'shop', 'tokyo', 'london', 'tel', 'aviv', 'hidden',
      'gem', 'best', 'ever', 'this', 'that', 'little', 'near', 'in', 'at',
    ]),
  ),
  categoryTokens: Object.freeze({
    cafe: Object.freeze(
      new Set(['cafe', 'coffee', 'coffee_shop', 'cafeteria', 'bakery', 'tea', 'dessert',
        'ice_cream', 'juice']),
    ),
    bar: Object.freeze(
      new Set(['bar', 'pub', 'cocktail', 'wine', 'beer', 'brewery', 'nightlife', 'lounge',
        'speakeasy']),
    ),
    restaurant: Object.freeze(
      new Set(['restaurant', 'food', 'dining', 'diner', 'ramen', 'sushi', 'noodle', 'pizza',
        'bistro', 'steak', 'izakaya', 'fast_food', 'buffet', 'deli', 'eatery']),
    ),
  }),
});
