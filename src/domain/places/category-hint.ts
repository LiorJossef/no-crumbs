/**
 * The category vocabulary the extractor may emit, and its conversion to the one the scorer scores.
 *
 * ## What this file used to be, and why the conversion is now trivial
 *
 * It existed because two lists were never reconciled: `09` §4.2 offered the model **seven**
 * categories (`restaurant`, `cafe`, `bar`, `bakery`, `attraction`, `shop`, `other`) and `06` §6.1
 * step 4's `CAT_TOKENS` could score **three**. The failure was not a wrong score — the prototype
 * does `CAT_TOKENS[hint]`, which for `'bakery'` is a `KeyError` in Python and would be `undefined`,
 * then a crash or a silent 0, in a literal TypeScript port. A total, explicit conversion was the
 * only way the scorer could keep a closed `CategoryHint` without a cast.
 *
 * **The owner's taxonomy of 2026-08-29 closed the gap from the other end.** The extraction
 * vocabulary is now `places/taxonomy.ts`'s three `PRIMARY_CATEGORIES`, which are the same three
 * the scorer scores, so the conversion is the identity on every value it can be handed. The
 * function stays, and it is not ceremony: it is the seam where the two vocabularies are *declared*
 * to be the same, so the day a fourth primary category lands — hotels and nightlife events are
 * already named as likely — the compiler stops here and asks what it scores as, instead of the
 * scorer silently taking `undefined` for it.
 *
 * What each value is *called* is not here: labels live in `product-category.ts`, whose vocabulary
 * is a superset of this one, and which still carries the five values this file has stopped
 * emitting because rows saved under them are still in the database.
 */

import type { CategoryHint } from '../types';
import { PRIMARY_CATEGORIES, type PrimaryCategory } from './taxonomy';

/**
 * What the model may emit for a candidate's category — the owner's three primary categories, and
 * nothing else.
 *
 * An alias rather than a second spelling of the same three strings, so the extraction schema, the
 * prompt and the map legend cannot drift apart the way the seven and the three did.
 */
export type ExtractedCategoryHint = PrimaryCategory;

/** The vocabulary as an array, for the Zod enum and the JSON schema. */
export const EXTRACTED_CATEGORY_HINTS = PRIMARY_CATEGORIES;

/**
 * Total, and now lossless.
 *
 * Every value the extractor can emit is a value the scorer can score, so this only has to carry
 * `null` through: no hint rather than a wrong one, which is what a caption that gives no category
 * signal honestly produces. The category term is 0.18 of the score, so an absent hint contributes
 * nothing rather than something arbitrary.
 *
 * The `switch` is exhaustive on purpose. Adding a primary category without deciding how it scores
 * is a compile error here — which is the entire reason this function still exists now that the two
 * vocabularies agree.
 */
export function categoryHintFor(extracted: ExtractedCategoryHint | null): CategoryHint | null {
  switch (extracted) {
    case 'restaurant':
    case 'cafe':
    case 'bar':
      return extracted;
    case null:
      return null;
  }
}

/* ------------------------------------------------------------------------------------------- *
 * The vocabulary as it was, for rows written under it
 * ------------------------------------------------------------------------------------------- */

/**
 * The seven values the extractor emitted before the 2026-08-29 taxonomy, kept because the rows are
 * still there.
 *
 * `extractions.candidates` is a `jsonb` cache that is re-parsed on every read
 * (`import/stored-candidates.ts`), and the parse ladder tries the current shape first. Narrowing
 * the enum without this made a cached row carrying `bakery` fail *every* rung — not a cache miss,
 * which is harmless, but `kind: 'invalid'`, which the confirm route answers with a 500. Measured on
 * the local database: 2 of 23 `extractions` rows carry a value outside the new vocabulary, across
 * 5 candidate objects, all of them `shop`.
 */
export const LEGACY_EXTRACTED_CATEGORY_HINTS = [
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'attraction',
  'shop',
  'other',
] as const;

export type LegacyExtractedCategoryHint = (typeof LEGACY_EXTRACTED_CATEGORY_HINTS)[number];

/**
 * A stored seven-value hint, read as the three-value vocabulary — lossily, and in the honest
 * direction.
 *
 * `bakery` becomes `cafe` because that is where the taxonomy puts bakeries; the other three become
 * `null`, because `attraction`, `shop` and `other` have no home in a vocabulary of three and
 * inventing one would put a claim in the library that nothing supports. `null` costs the row its
 * category chip and nothing else: `productCategoryFor` still reads the resolver's own provider
 * category first, so a row saved as `shop` that Google calls `ice_cream_shop` still displays as
 * `Dessert`.
 *
 * This narrows what is *read back into the pipeline*. It does not rewrite `places.category`, and
 * nothing here touches a stored row — deciding whether the existing rows are re-categorised is the
 * owner's, and it is recorded as an open question rather than taken quietly.
 */
export function narrowLegacyCategoryHint(
  legacy: LegacyExtractedCategoryHint | null
): ExtractedCategoryHint | null {
  switch (legacy) {
    case 'restaurant':
    case 'cafe':
    case 'bar':
      return legacy;
    case 'bakery':
      return 'cafe';
    case 'attraction':
    case 'shop':
    case 'other':
    case null:
      return null;
  }
}
