import { describe, expect, it } from 'vitest';

import { categoryHintFor, type ExtractedCategoryHint } from '@/domain/places/category-hint';

const ALL: readonly (ExtractedCategoryHint | null)[] = [
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'attraction',
  'shop',
  'other',
  null,
];

describe('categoryHintFor', () => {
  it('is total over `09` §4.2s enum — no input reaches the scorer unmapped', () => {
    // The whole point: `CAT_TOKENS[hint]` is a KeyError for four of these eight inputs.
    for (const input of ALL) {
      const out = categoryHintFor(input);
      expect(out === null || out === 'cafe' || out === 'bar' || out === 'restaurant').toBe(true);
    }
  });

  it('passes the three scorable hints through unchanged', () => {
    expect(categoryHintFor('cafe')).toBe('cafe');
    expect(categoryHintFor('bar')).toBe('bar');
    expect(categoryHintFor('restaurant')).toBe('restaurant');
  });

  it('folds bakery into cafe, because CAT_TOKENS.cafe already contains "bakery"', () => {
    expect(categoryHintFor('bakery')).toBe('cafe');
  });

  it('drops the hints the index cannot agree with rather than scoring them arbitrarily', () => {
    expect(categoryHintFor('attraction')).toBeNull();
    expect(categoryHintFor('shop')).toBeNull();
    expect(categoryHintFor('other')).toBeNull();
    expect(categoryHintFor(null)).toBeNull();
  });
});
