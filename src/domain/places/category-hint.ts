/**
 * The join between the seven category values the LLM may emit (`09` §4.2's
 * `PlaceCandidateSchema.categoryHint`) and the three the scorer can score (`06` §6.1 step 4's
 * `CAT_TOKENS`).
 *
 * This exists because the two lists were never reconciled, and the failure mode is not a wrong
 * score: the prototype does `CAT_TOKENS[hint]`, which for `'bakery'` is a `KeyError` in Python and
 * would be `undefined` — then a crash or a silent 0 — in a literal TypeScript port. Making the
 * conversion explicit and total is the only way the scorer can keep a closed `CategoryHint`
 * without a cast.
 *
 * What each value is *called* is not here: labels live in `product-category.ts`, whose vocabulary
 * is a superset of this one. Two label tables that have to agree, with nothing making them agree,
 * is what that move removed.
 */

import type { CategoryHint } from '../types';

/**
 * Exactly `09` §4.2's enum. Declared here rather than invented in the adapter so there is one
 * spelling of it; MS6 re-uses this type in `PlaceCandidate` when the extraction vocabulary lands.
 */
export type ExtractedCategoryHint =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'bakery'
  | 'attraction'
  | 'shop'
  | 'other';

/**
 * Total, and deliberately lossy in one direction only.
 *
 * `'bakery' → 'cafe'` is not a guess: `CAT_TOKENS.cafe` already contains the token `bakery`, so a
 * bakery POI scores a category match under a `cafe` hint. Mapping the *hint* the same way keeps
 * the relation symmetric.
 *
 * `'attraction'`, `'shop'` and `'other'` become `null` — no hint rather than a wrong one. The
 * category term is 0.18 of the score, so a hint we cannot score must contribute nothing rather
 * than something arbitrary. That is also correct product behaviour: our index is filtered to
 * food-and-drink at ingest (`06` §7.4), so a shop or an attraction has nothing to agree with.
 */
export function categoryHintFor(extracted: ExtractedCategoryHint | null): CategoryHint | null {
  switch (extracted) {
    case 'restaurant':
    case 'cafe':
    case 'bar':
      return extracted;
    case 'bakery':
      return 'cafe';
    case 'attraction':
    case 'shop':
    case 'other':
    case null:
      return null;
  }
}
