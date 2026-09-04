/**
 * **The category panel always ticks exactly one row.**
 *
 * The defect this pins (MORN-2, 2026-09-04): the tick was `choice === category && isOverridden`
 * and `Automatic` was rendered only when `isOverridden`, so **every place whose category came
 * from the provider or the model drew a `radiogroup` with nothing checked at all** — three rows,
 * `aria-checked="false"` on all of them, while the row above read `Café`. Reproduced on local
 * against `Gelalucci` (Google `ice_cream_shop`, no override).
 *
 * The fix is not "tick the derived category". This control edits `saved_places.category_override`,
 * whose value is one of the three or SQL `NULL`, and `Automatic` *is* `NULL` — so the missing
 * option was the one the control was set to. Ticking `Café` would claim the user chose it and
 * would erase the difference `collection-place-detail.tsx` goes out of its way to preserve.
 *
 * Asserted through `selectedCategoryChoice` rather than through markup because vitest runs in a
 * `node` environment here with no jsdom, and the panel only exists once a click has opened it.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/_lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/actions/saved-places', () => ({
  deleteSavedPlace: vi.fn(),
  setSavedPlaceVisited: vi.fn(),
  updateSavedPlaceCategory: vi.fn(),
  updateSavedPlaceNote: vi.fn(),
}));

const { selectedCategoryChoice } = await import('@/components/sheet/saved-place-edits');
const { PRODUCT_CATEGORY_ORDER } = await import('@/domain/places/product-category');

import type { ProductCategory } from '@/domain/places/product-category';

/** The rows the panel renders, in order. `Automatic` is permanent — it used to appear only for an
 *  overridden place, which is the whole of the defect. */
const ROWS = [...PRODUCT_CATEGORY_ORDER, 'automatic'] as const;

const ticks = (category: ProductCategory | null, isOverridden: boolean) =>
  ROWS.filter((row) => row === selectedCategoryChoice(category, isOverridden));

describe('the category panel’s tick', () => {
  it('lands on Automatic for a category we derived rather than one the user chose', () => {
    // Gelalucci: `provider_category = 'ice_cream_shop'`, no override, so the row reads `Café`.
    expect(ticks('cafe', false)).toEqual(['automatic']);
    // …and it is not the category row, which would claim the user had said so.
    expect(selectedCategoryChoice('cafe', false)).not.toBe('cafe');
  });

  it('lands on the category the user chose', () => {
    for (const category of PRODUCT_CATEGORY_ORDER) {
      expect(ticks(category, true)).toEqual([category]);
    }
  });

  it('ticks Automatic for a place with no category at all', () => {
    // A manual add nothing resolved. The trigger reads `Not set`; the panel still has an answer.
    expect(ticks(null, false)).toEqual(['automatic']);
  });

  it('ticks exactly one row in every state this UI can reach', () => {
    for (const category of [...PRODUCT_CATEGORY_ORDER, null]) {
      for (const isOverridden of [true, false]) {
        // The one exception, and it is unreachable from this UI: a free-text override
        // `productCategoryFor` cannot parse is overridden with no category to point at.
        if (category === null && isOverridden) continue;
        expect(ticks(category, isOverridden)).toHaveLength(1);
      }
    }
  });

  it('ticks nothing for an unparseable override rather than inventing a value', () => {
    expect(ticks(null, true)).toEqual([]);
  });
});
