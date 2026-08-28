/**
 * What a category is called and what colour it is, in one place.
 *
 * The map draws a pin from this and the list and detail views print a label and a dot from it, so
 * a café is the same brown word-and-colour wherever it appears. Before this existed the map had a
 * palette of its own and every text surface printed the raw enum in capitals (`RESTAURANT`), which
 * both looked like a database view and told the user nothing the map was telling them.
 *
 * Presentation only. Nothing here decides what a place *is* — `domain/places/category-hint.ts`
 * owns the vocabulary and the scorer's mapping of it.
 */

import type { ExtractedCategoryHint } from '@/domain/places/category-hint';

export interface CategoryDisplay {
  /** Sentence case, the way it is written in a sentence. */
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
export const CATEGORY_DISPLAY: Record<ExtractedCategoryHint, CategoryDisplay> = {
  restaurant: { label: 'Restaurant', color: '#C2452F' },
  cafe: { label: 'Café', color: '#8A5A3B' },
  bakery: { label: 'Bakery', color: '#C68A17' },
  bar: { label: 'Bar', color: '#6D4FA8' },
  attraction: { label: 'Attraction', color: '#2F7FA8' },
  shop: { label: 'Shop', color: '#B94B77' },
  other: { label: 'Place', color: '#2E7A70' },
};

export const DEFAULT_CATEGORY: ExtractedCategoryHint = 'other';

export function isKnownCategory(category: unknown): category is ExtractedCategoryHint {
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
