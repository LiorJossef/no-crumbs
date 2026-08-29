/**
 * What a category is called and what colour it is, in one place.
 *
 * The map draws a pin from this and the list and detail views print a label and a dot from it, so
 * a café is the same brown word-and-colour wherever it appears. Before this existed the map had a
 * palette of its own and every text surface printed the raw enum in capitals (`RESTAURANT`), which
 * both looked like a database view and told the user nothing the map was telling them.
 *
 * Presentation only. Nothing here decides what a place *is* — `domain/places/product-category.ts`
 * owns the vocabulary and the reconciliation of the model's, the provider's and the user's
 * claims about it.
 */

import { PRODUCT_CATEGORY_LABEL } from '@/domain/places/product-category';
import type { ProductCategory } from '@/domain/places/product-category';

export interface CategoryDisplay {
  /** Sentence case, the way it is written in a sentence — or `null` for a place we have no
   *  category for, which prints nothing rather than a word meaning "we would rather not say". */
  readonly label: string | null;
  /**
   * The pin colour. Dark enough to carry a white glyph, and far enough apart in hue from its
   * neighbours to stay distinguishable at pin size on a near-white map. Never null: every pin has
   * to be drawn in something.
   */
  readonly color: string;
}

/**
 * Three colours and a fallback, matching the three categories the taxonomy defines.
 *
 * The palette used to carry eight. Five of them are gone with the values they coloured — and the
 * one worth recording is `dessert`'s pink, added so that "a gelateria used to render as a shop"
 * could never mean two confusable colours as well as two confusable words. A gelateria is a `cafe`
 * now, so the confusion it guarded against cannot arise: there is no `shop`.
 */
const CATEGORY_COLOR: Record<ProductCategory, string> = {
  restaurant: '#C2452F',
  cafe: '#8A5A3B',
  bar: '#6D4FA8',
};

/**
 * What an uncategorised place is drawn in — the house mint, deliberately, and this reasoning
 * survives the narrowing unchanged: a place whose category we could not read is still one of the
 * user's places, and painting it grey would make "we do not know" look like "this one is lesser".
 *
 * It is a colour and **not** a category. It has no label and the filter bar offers no chip for it,
 * because "we have no fact here" is not a thing to filter a library by.
 */
export const UNCATEGORISED_COLOR = '#2E7A70';

const UNCATEGORISED_DISPLAY: CategoryDisplay = { label: null, color: UNCATEGORISED_COLOR };

export const CATEGORY_DISPLAY = Object.fromEntries(
  Object.entries(PRODUCT_CATEGORY_LABEL).map(([category, label]) => [
    category,
    { label, color: CATEGORY_COLOR[category as ProductCategory] },
  ])
) as Record<ProductCategory, CategoryDisplay>;

export function isKnownCategory(category: unknown): category is ProductCategory {
  return typeof category === 'string' && category in CATEGORY_DISPLAY;
}

/** Total: every value, including `null` and anything left over from the eight-value vocabulary,
 *  gets something to draw. Only the three named categories get a word. */
export function categoryDisplay(category: string | null | undefined): CategoryDisplay {
  return isKnownCategory(category) ? CATEGORY_DISPLAY[category] : UNCATEGORISED_DISPLAY;
}

/**
 * The line under a place's name: what it is, and where.
 *
 * Either half can be missing — a manual add with no category, an unresolved place with no
 * locality — and the separator goes with it rather than leaving a dangling `Café ·`.
 */
export function categoryLocalityLine(
  category: string | null | undefined,
  locality: string | null | undefined
): string {
  const parts = [categoryDisplay(category).label, locality?.trim()].filter(
    (part): part is string => Boolean(part)
  );
  return parts.join(' · ');
}
