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
  /** Sentence case, the way it is written in a sentence. From the domain — the import review
   *  screen reads the same table, so a café is a "Café" on every surface. */
  readonly label: string;
  /**
   * The pin colour. Dark enough to carry a white glyph, and far enough apart in hue from its
   * neighbours to stay distinguishable at pin size on a near-white map.
   */
  readonly color: string;
}

/**
 * `other` keeps the house mint deliberately: a place whose category we could not read is still one
 * of the user's places, and painting it grey would make "we do not know" look like "this one is
 * lesser".
 */
const CATEGORY_COLOR: Record<ProductCategory, string> = {
  restaurant: '#C2452F',
  cafe: '#8A5A3B',
  bakery: '#C68A17',
  bar: '#6D4FA8',
  // Pink, and specifically *not* the magenta `shop` already holds: a gelateria used to render as
  // a shop, so the two categories most likely to be confused for one another must not also be the
  // two colours most likely to be confused for one another at pin size.
  dessert: '#D4577A',
  attraction: '#2F7FA8',
  shop: '#8E4585',
  other: '#2E7A70',
};

export const CATEGORY_DISPLAY = Object.fromEntries(
  Object.entries(PRODUCT_CATEGORY_LABEL).map(([category, label]) => [
    category,
    { label, color: CATEGORY_COLOR[category as ProductCategory] },
  ])
) as Record<ProductCategory, CategoryDisplay>;

export const DEFAULT_CATEGORY: ProductCategory = 'other';

export function isKnownCategory(category: unknown): category is ProductCategory {
  return typeof category === 'string' && category in CATEGORY_DISPLAY;
}

export function categoryDisplay(category: string | null | undefined): CategoryDisplay {
  return CATEGORY_DISPLAY[isKnownCategory(category) ? category : DEFAULT_CATEGORY];
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
