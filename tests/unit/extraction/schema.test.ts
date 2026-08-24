import { describe, expect, it } from 'vitest';

import { ExtractionResultSchema, toPlaceCandidate } from '@/domain/extraction/schema';

describe('ExtractionResultSchema', () => {
  it('accepts a well-formed multi-candidate response', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: 'Tel Aviv',
          countryHint: null,
          categoryHint: 'cafe',
          evidence: "haven't stopped thinking about Cafe Fiori",
          modelConfidence: 0.9,
          identifiedName: null,
          coordinates: null,
        },
      ],
      cityHint: 'Tel Aviv',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts the zero-candidate response — the modal case', () => {
    const parsed = ExtractionResultSchema.safeParse({ candidates: [], cityHint: null });
    expect(parsed.success).toBe(true);
  });

  it('rejects a candidate list beyond the 12-cap', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      rawName: `Place ${i}`,
      cityHint: null,
      countryHint: null,
      categoryHint: null,
      evidence: null,
      modelConfidence: null,
      identifiedName: null,
    }));
    const parsed = ExtractionResultSchema.safeParse({ candidates: many, cityHint: null });
    expect(parsed.success).toBe(false);
  });

  it('rejects an open-vocabulary category hint', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: null,
          countryHint: null,
          categoryHint: 'nightclub',
          evidence: null,
          modelConfidence: null,
          identifiedName: null,
        },
      ],
      cityHint: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a candidate whose identifiedName differs from rawName (`06` §3.4)', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Paradiso',
          cityHint: 'Prague',
          countryHint: null,
          categoryHint: 'cafe',
          evidence: 'Paradiso was so cute',
          modelConfidence: 0.8,
          identifiedName: 'Paradiso Matcha Bar',
          coordinates: { lat: 50.0755, lng: 14.4378 },
        },
      ],
      cityHint: 'Prague',
    });
    expect(parsed.success).toBe(true);
  });

  it('requires identifiedName to be present, even when null — no optional properties', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: null,
          countryHint: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
        },
      ],
      cityHint: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts null coordinates — the honest "no basis for a guess" case', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: null,
          countryHint: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          identifiedName: null,
          coordinates: null,
        },
      ],
      cityHint: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an out-of-range latitude', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: null,
          countryHint: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          identifiedName: null,
          coordinates: { lat: 132, lng: 34.7654 },
        },
      ],
      cityHint: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('requires coordinates to be present, even when null — no optional properties', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: null,
          countryHint: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          identifiedName: null,
        },
      ],
      cityHint: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a rawName below the minimum length', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'A',
          cityHint: null,
          countryHint: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          identifiedName: null,
        },
      ],
      cityHint: null,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('toPlaceCandidate', () => {
  it('narrows a scoreable category hint unchanged', () => {
    const candidate = toPlaceCandidate({
      rawName: 'Cafe Fiori',
      cityHint: 'Tel Aviv',
      countryHint: null,
      categoryHint: 'cafe',
      evidence: 'evidence text',
      modelConfidence: 0.7,
      identifiedName: null,
      coordinates: null,
    });
    expect(candidate).toEqual({
      rawName: 'Cafe Fiori',
      cityHint: 'Tel Aviv',
      countryHint: null,
      categoryHint: 'cafe',
      evidence: 'evidence text',
      modelConfidence: 0.7,
      identifiedName: null,
      coordinates: null,
    });
  });

  it('passes identifiedName through unchanged, distinct from rawName', () => {
    const candidate = toPlaceCandidate({
      rawName: 'Paradiso',
      cityHint: 'Prague',
      countryHint: null,
      categoryHint: 'cafe',
      evidence: 'Paradiso was so cute',
      modelConfidence: 0.8,
      identifiedName: 'Paradiso Matcha Bar',
      coordinates: null,
    });
    expect(candidate.identifiedName).toBe('Paradiso Matcha Bar');
    expect(candidate.rawName).toBe('Paradiso');
  });

  it('maps "bakery" onto the scoreable "cafe" hint (09 §4.2)', () => {
    const candidate = toPlaceCandidate({
      rawName: 'Lehamim Bakery',
      cityHint: null,
      countryHint: null,
      categoryHint: 'bakery',
      evidence: null,
      modelConfidence: null,
      identifiedName: null,
      coordinates: null,
    });
    expect(candidate.categoryHint).toBe('cafe');
  });

  it('drops an unscoreable category hint to null', () => {
    const candidate = toPlaceCandidate({
      rawName: 'The Grand Museum',
      cityHint: null,
      countryHint: null,
      categoryHint: 'attraction',
      evidence: null,
      modelConfidence: null,
      identifiedName: null,
      coordinates: null,
    });
    expect(candidate.categoryHint).toBeNull();
  });
});
