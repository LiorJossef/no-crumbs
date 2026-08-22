import { describe, expect, it } from 'vitest';

import { filterPlausible } from '@/domain/extraction/plausibility';
import type { PlaceCandidate } from '@/domain/types';

function candidate(overrides: Partial<PlaceCandidate>): PlaceCandidate {
  return {
    rawName: 'Cafe Fiori',
    cityHint: null,
    countryHint: null,
    categoryHint: null,
    evidence: null,
    modelConfidence: null,
    ...overrides,
  };
}

describe('filterPlausible', () => {
  it('returns the empty candidate list unchanged — the modal zero-place case', () => {
    const result = filterPlausible([], 'a caption naming no place at all, just vibes');
    expect(result.kept).toEqual([]);
    expect(Object.values(result.dropped).every((n) => n === 0)).toBe(true);
  });

  it('keeps a plausible, verbatim-evidenced candidate', () => {
    const caption = "haven't stopped thinking about Cafe Fiori since we went";
    const result = filterPlausible([candidate({ evidence: 'Cafe Fiori' })], caption);
    expect(result.kept).toHaveLength(1);
  });

  it('drops a handle', () => {
    const result = filterPlausible([candidate({ rawName: '@someuser' })], 'anything');
    expect(result.dropped.hashtag_or_handle).toBe(1);
  });

  it('drops a URL', () => {
    const result = filterPlausible([candidate({ rawName: 'https://example.com/x' })], 'anything');
    expect(result.dropped.hashtag_or_handle).toBe(1);
  });

  it('drops a hashtag-shaped bare city/country against a spaced cityHint (#telaviv vs "Tel Aviv")', () => {
    const result = filterPlausible([candidate({ rawName: '#telaviv', cityHint: 'Tel Aviv' })], 'anything');
    expect(result.kept).toHaveLength(0);
    expect(result.dropped.city_or_country_only).toBe(1);
  });

  it('drops a hashtag-shaped generic word', () => {
    const result = filterPlausible([candidate({ rawName: '#coffee' })], 'anything');
    expect(result.dropped.generic_words_only).toBe(1);
  });

  it('keeps a hashtag-shaped plausible venue name, capping confidence even when the model reported higher', () => {
    const result = filterPlausible([candidate({ rawName: '#aroma', modelConfidence: 0.9 })], 'anything');
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]?.modelConfidence).toBe(0.5);
  });

  it('leaves a non-hashtag candidate confidence unchanged', () => {
    const result = filterPlausible(
      [candidate({ rawName: 'Cafe Fiori', evidence: 'Cafe Fiori', modelConfidence: 0.9 })],
      'Cafe Fiori was great',
    );
    expect(result.kept[0]?.modelConfidence).toBe(0.9);
  });

  it('drops a bare city name equal to its own cityHint', () => {
    const result = filterPlausible([candidate({ rawName: 'Tokyo', cityHint: 'Tokyo' })], 'anything');
    expect(result.dropped.city_or_country_only).toBe(1);
  });

  it('drops a candidate made only of generic words ("this hidden gem")', () => {
    const result = filterPlausible([candidate({ rawName: 'this hidden gem' })], 'anything');
    expect(result.dropped.generic_words_only).toBe(1);
  });

  it('drops a candidate whose evidence does not occur verbatim in the caption', () => {
    const result = filterPlausible(
      [candidate({ evidence: 'a fabricated quote never in the source' })],
      'the real caption text, unrelated',
    );
    expect(result.dropped.evidence_not_in_caption).toBe(1);
  });

  it('drops a duplicate after normalisation, keeping the first occurrence', () => {
    const result = filterPlausible(
      [candidate({ rawName: 'Cafe Fiori' }), candidate({ rawName: 'CAFE   fiori' })],
      'anything',
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped.duplicate).toBe(1);
  });

  it('keeps multiple distinct plausible candidates from a list-style post', () => {
    const caption = 'Three spots: Cafe Fiori, Bar Kaymak, and Anzu Bakery were all incredible';
    const result = filterPlausible(
      [
        candidate({ rawName: 'Cafe Fiori', evidence: 'Cafe Fiori' }),
        candidate({ rawName: 'Bar Kaymak', evidence: 'Bar Kaymak' }),
        candidate({ rawName: 'Anzu Bakery', evidence: 'Anzu Bakery' }),
      ],
      caption,
    );
    expect(result.kept.map((c) => c.rawName)).toEqual(['Cafe Fiori', 'Bar Kaymak', 'Anzu Bakery']);
  });
});
