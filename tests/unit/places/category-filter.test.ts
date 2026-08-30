import { describe, expect, it } from 'vitest';

import {
  categoryFacets,
  filterByCategory,
  isCategoryFilterActive,
  matchesCategory,
  toProductCategory,
  toggleCategory,
} from '@/domain/places/category-filter';
import { PRODUCT_CATEGORY_ORDER } from '@/domain/places/product-category';

interface Row {
  readonly id: string;
  readonly category: string | null;
}

const row = (id: string, category: string | null): Row => ({ id, category });
const categoryOf = (place: Row) => place.category;
const shape = (places: readonly Row[], keep: Parameters<typeof categoryFacets>[2] = null) =>
  categoryFacets(places, categoryOf, keep).map((facet) => [facet.category, facet.count]);

describe('toProductCategory', () => {
  it('passes the eight vocabulary values through unchanged', () => {
    for (const category of PRODUCT_CATEGORY_ORDER) {
      expect(toProductCategory(category)).toBe(category);
    }
  });

  it('answers null for anything that is not one of the three', () => {
    // It used to answer `other`, so the chip that said "Place" could count these. There is no such
    // chip: `categoryDisplay` prints no word for any of them, and a bar that summarises the list
    // has nothing to say about a place the list itself says nothing about.
    for (const value of [null, undefined, '', 'ice_cream_shop', 'RESTAURANT', 'nightclub']) {
      expect(toProductCategory(value)).toBeNull();
    }
    // Including the five values the eight-value vocabulary used to produce, which are still stored
    // on rows written before 2026-08-29.
    for (const retired of ['bakery', 'dessert', 'attraction', 'shop', 'other']) {
      expect(toProductCategory(retired)).toBeNull();
    }
  });
});

describe('categoryFacets', () => {
  it('offers only categories the library actually contains', () => {
    const facets = shape([row('1', 'cafe'), row('2', 'cafe'), row('3', 'bar')]);
    expect(facets).toEqual([
      ['cafe', 2],
      ['bar', 1],
    ]);
  });

  it('never offers a chip for a category no place has, however wide the vocabulary gets', () => {
    // The guard against `ExtractedCategoryHint`'s seven values versus `ProductCategory`'s eight
    // (product-backlog-2026-08-29 §1.1): the bar is built by counting, not by enumerating.
    const present = new Set(
      categoryFacets([row('1', 'restaurant')], categoryOf).map((facet) => facet.category),
    );
    for (const category of PRODUCT_CATEGORY_ORDER) {
      if (category !== 'restaurant') expect(present.has(category)).toBe(false);
    }
  });

  it('is empty for an empty library', () => {
    expect(shape([])).toEqual([]);
  });

  it('orders by count descending', () => {
    expect(
      shape([
        row('1', 'bar'),
        row('2', 'restaurant'),
        row('3', 'restaurant'),
        row('4', 'cafe'),
        row('5', 'cafe'),
        row('6', 'cafe'),
      ]),
    ).toEqual([
      ['cafe', 3],
      ['restaurant', 2],
      ['bar', 1],
    ]);
  });

  it('breaks count ties by the product render order, not by insertion order', () => {
    // `bar` is seen first and `restaurant` last; the bar must still read restaurant, cafe, bar.
    expect(shape([row('1', 'bar'), row('2', 'cafe'), row('3', 'restaurant')])).toEqual([
      ['restaurant', 1],
      ['cafe', 1],
      ['bar', 1],
    ]);
  });

  it('renders the same bar for the same library whatever order the rows arrive in', () => {
    const places = [
      row('1', 'cafe'),
      row('2', 'bar'),
      row('3', 'restaurant'),
      row('4', 'bakery'),
      row('5', 'cafe'),
      row('6', 'attraction'),
    ];
    const reversed = [...places].reverse();
    expect(shape(reversed)).toEqual(shape(places));
  });

  it('counts an uncategorised place under nothing, rather than under a catch-all chip', () => {
    // Two of these three places have no category the product can name. They are still in the
    // library and still on the map; the bar simply has no chip that would be true of them, and
    // offering one ("Place, 2") would be a filter for the absence of a fact.
    expect(shape([row('1', null), row('2', 'not a category'), row('3', 'cafe')])).toEqual([
      ['cafe', 1],
    ]);
  });

  it('keeps the pressed chip at a count of zero when the narrowed set no longer holds it', () => {
    // The escape from a filter must not vanish underneath the finger that set it.
    expect(shape([row('1', 'cafe')], 'bar')).toEqual([
      ['cafe', 1],
      ['bar', 0],
    ]);
  });

  it('does not double-count the pressed chip when the set still holds it', () => {
    expect(shape([row('1', 'cafe'), row('2', 'cafe')], 'cafe')).toEqual([['cafe', 2]]);
  });
});

describe('filterByCategory', () => {
  const places = [row('1', 'cafe'), row('2', 'bar'), row('3', null), row('4', 'cafe')];

  it('returns the input array itself when nothing is selected', () => {
    expect(filterByCategory(places, null, categoryOf)).toBe(places);
  });

  it('narrows to the chosen category', () => {
    expect(filterByCategory(places, 'cafe', categoryOf).map((place) => place.id)).toEqual([
      '1',
      '4',
    ]);
  });

  it('leaves an uncategorised place out of every chip, rather than inventing one for it', () => {
    // There is no `Place` chip any more. Place `3` carries a category outside the three, so no
    // chip counts it and no chip returns it — it is still in the library and still on the map.
    for (const category of ['restaurant', 'cafe', 'bar'] as const) {
      expect(filterByCategory(places, category, categoryOf).map((p) => p.id)).not.toContain('3');
    }
    expect(categoryFacets(places, categoryOf).map((f) => f.category)).not.toContain('other');
  });

  it('agrees with the facet count for every chip it offers', () => {
    // The property that makes each chip a true promise: press it, get exactly what it printed.
    for (const facet of categoryFacets(places, categoryOf)) {
      expect(filterByCategory(places, facet.category, categoryOf)).toHaveLength(facet.count);
    }
  });
});

describe('matchesCategory', () => {
  it('means the category printed on the chip, never a substring of it', () => {
    expect(matchesCategory('cafe', 'cafe')).toBe(true);
    expect(matchesCategory('cafe', 'bar')).toBe(false);
    // A provider string is not a product category; it must not half-match one.
    expect(matchesCategory('coffee_shop', 'cafe')).toBe(false);
    // And a value from the retired eight-value vocabulary matches nothing at all, rather than
    // landing on a catch-all chip: `null` is not a category to be counted under.
    expect(matchesCategory('dessert', 'cafe')).toBe(false);
    expect(matchesCategory(null, 'cafe')).toBe(false);
  });
});

describe('toggleCategory and isCategoryFilterActive', () => {
  it('clears on the pressed chip and replaces on any other', () => {
    expect(toggleCategory(null, 'cafe')).toBe('cafe');
    expect(toggleCategory('cafe', 'cafe')).toBe(null);
    expect(toggleCategory('cafe', 'bar')).toBe('bar');
  });

  it('treats no selection as no filter — there is no `All` value to special-case', () => {
    expect(isCategoryFilterActive(null)).toBe(false);
    expect(isCategoryFilterActive('cafe')).toBe(true);
  });
});
