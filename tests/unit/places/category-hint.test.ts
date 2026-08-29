import { describe, expect, it } from 'vitest';

import {
  categoryHintFor,
  narrowLegacyCategoryHint,
  EXTRACTED_CATEGORY_HINTS,
  LEGACY_EXTRACTED_CATEGORY_HINTS,
  type ExtractedCategoryHint,
  type LegacyExtractedCategoryHint,
} from '@/domain/places/category-hint';
import { PRIMARY_CATEGORIES } from '@/domain/places/taxonomy';

const ALL: readonly (ExtractedCategoryHint | null)[] = [...EXTRACTED_CATEGORY_HINTS, null];
const ALL_LEGACY: readonly (LegacyExtractedCategoryHint | null)[] = [
  ...LEGACY_EXTRACTED_CATEGORY_HINTS,
  null,
];

describe('categoryHintFor', () => {
  it('is total over the extraction vocabulary — no input reaches the scorer unmapped', () => {
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

  it('carries null through as null — no hint rather than a wrong one', () => {
    expect(categoryHintFor(null)).toBeNull();
  });

  // The reason the conversion still exists now that it is the identity: the two vocabularies are
  // *declared* equal here, so widening one without the other is a failure with a name.
  it('emits exactly the primary categories the taxonomy defines', () => {
    expect([...EXTRACTED_CATEGORY_HINTS]).toEqual([...PRIMARY_CATEGORIES]);
  });
});

describe('narrowLegacyCategoryHint', () => {
  it('is total over the seven values rows were written under', () => {
    for (const input of ALL_LEGACY) {
      const out = narrowLegacyCategoryHint(input);
      expect(out === null || (EXTRACTED_CATEGORY_HINTS as readonly string[]).includes(out)).toBe(
        true
      );
    }
  });

  it('keeps the three that survived the narrowing', () => {
    expect(narrowLegacyCategoryHint('restaurant')).toBe('restaurant');
    expect(narrowLegacyCategoryHint('cafe')).toBe('cafe');
    expect(narrowLegacyCategoryHint('bar')).toBe('bar');
  });

  it('folds bakery into cafe, which is where the taxonomy puts bakeries', () => {
    expect(narrowLegacyCategoryHint('bakery')).toBe('cafe');
  });

  it('drops the three with no home in a vocabulary of three, rather than inventing one', () => {
    expect(narrowLegacyCategoryHint('attraction')).toBeNull();
    expect(narrowLegacyCategoryHint('shop')).toBeNull();
    expect(narrowLegacyCategoryHint('other')).toBeNull();
    expect(narrowLegacyCategoryHint(null)).toBeNull();
  });
});
