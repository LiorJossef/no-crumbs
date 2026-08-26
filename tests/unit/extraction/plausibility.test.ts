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
    addressHint: null,
    identifiedName: null,
    coordinates: null,
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
    // Per the prompt's own contract, a hashtag-sourced candidate's evidence is "the whole hashtag
    // as written" — never null — so the fixture supplies it here rather than relying on the
    // (now-rejected) default null evidence.
    const result = filterPlausible(
      [candidate({ rawName: '#aroma', evidence: '#aroma', modelConfidence: 0.9 })],
      'anything #aroma',
    );
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
      [
        candidate({ rawName: 'Cafe Fiori', evidence: 'Cafe Fiori' }),
        candidate({ rawName: 'CAFE   fiori', evidence: 'Cafe Fiori' }),
      ],
      'Cafe Fiori was great',
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped.duplicate).toBe(1);
  });

  it('drops a candidate with no evidence at all, per the prompt\'s own "do not emit" contract', () => {
    // Regression, found live 2026-08-24: a real end-to-end test produced a second candidate with
    // no basis anywhere in the caption and evidence: null, which the old `!== null` guard let
    // through unfiltered because it only checked evidence when one was actually provided.
    const result = filterPlausible(
      [candidate({ rawName: 'ביגה שרונה תל-אביב', evidence: null })],
      'CAFE\' NOIR קפה נואר ביסטרו תל אביב, לא לוותר על שניצל נואר',
    );
    expect(result.kept).toHaveLength(0);
    expect(result.dropped.evidence_not_in_caption).toBe(1);
  });

  it('keeps a non-Latin-script candidate (Hebrew) instead of dropping it as empty-after-normalisation', () => {
    // Regression: `normaliseForComparison` used to strip every non-ASCII character, so a Hebrew
    // rawName normalised to '' and was wrongly caught by `isCityOrCountryOnly`'s
    // `norm.length === 0` check, as if it were a bare city/country with nothing else to it.
    const caption = 'פתוח ראשון-שבת 8:00-15:00 #נומיכפרמונש';
    const result = filterPlausible(
      [candidate({ rawName: '#נומיכפרמונש', evidence: '#נומיכפרמונש', modelConfidence: 0.8 })],
      caption,
    );
    expect(result.kept).toHaveLength(1);
    expect(result.dropped.city_or_country_only).toBe(0);
    // still a hashtag, so still capped like any other hashtag-sourced candidate.
    expect(result.kept[0]?.modelConfidence).toBe(0.5);
  });

  it('keeps a real venue-shaped Hebrew hashtag but the plausibility gate alone cannot reject a Hebrew generic-descriptor hashtag — that discrimination is the prompt\'s job', () => {
    // `isGenericWordsOnly`'s stop-word list is English-only and a hashtag has no spaces to split
    // on, so a Hebrew "bakery in the center"-style hashtag is not caught here either; this layer
    // only guards structure (handle/URL, duplicate, verbatim evidence), not language-specific
    // genericness. Documented, not a bug to fix in this file.
    const result = filterPlausible([candidate({ rawName: '#ביקריבמרכז', evidence: '#ביקריבמרכז' })], 'anything #ביקריבמרכז');
    expect(result.dropped.generic_words_only).toBe(0);
    expect(result.kept).toHaveLength(1);
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
