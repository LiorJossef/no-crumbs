import { describe, expect, it } from 'vitest';

import { parseExtractionResultPartial } from '@/domain/extraction/schema';

/**
 * Real recorded model output, not a hand-written shape: the first three candidates of the
 * five-candidate Hebrew response in
 * `docs/evidence/.local/tiktok-recognition-cache/extract-…-p11-s3-13e7a676991761e3.json`
 * (caption sha `13e7a676…`), copied verbatim. That response is also the one whose size motivated
 * `MAX_OUTPUT_TOKENS` — it is the largest in the recorded corpus.
 *
 * The cache directory is gitignored (provider data must not enter the repository), so the rows are
 * inlined here rather than read from disk, which also keeps the test runnable on a clean clone.
 */
const RECORDED = [
  {
    rawName: 'קפה אירופה',
    cityHint: 'תל אביב',
    countryHint: 'ישראל',
    areaHint: null,
    categoryHint: 'cafe',
    addressHint: null,
    evidence: 'קפה אירופה',
    modelConfidence: 0.99,
    identifiedName: 'קפה אירופה',
    nameVariants: ['Cafe Europa'],
    tags: ['brunch', 'pastries'],
    dishes: [],
    whyGo: {
      text: 'The continental brunch features a display of desserts and pastries, available Friday and Saturday.',
      groundedIn: 'הבראנץ׳ קונטיננטל של קפה אירופה עם הדיספליי המרהיב',
    },
    coordinates: { lat: 32.0687, lng: 34.7735 },
  },
  {
    rawName: 'eats בית חנה',
    cityHint: 'תל אביב',
    countryHint: 'ישראל',
    areaHint: 'בית חנה',
    categoryHint: 'cafe',
    addressHint: null,
    evidence: 'eats בית חנה',
    modelConfidence: 0.98,
    identifiedName: 'Eats',
    nameVariants: ['איטס', 'Eats Beit Hanna'],
    tags: ['brunch'],
    dishes: ['אגז בנדיקט', 'פרנץ’ טוסט'],
    whyGo: {
      text: 'Serves scones, eggs benedict and caramelized french toast on Friday and Saturday.',
      groundedIn: 'הסקונס הפנומנליים שלה אגז בנדיקט',
    },
    coordinates: { lat: 32.0903, lng: 34.7801 },
  },
  {
    rawName: 'האחים',
    cityHint: 'תל אביב',
    countryHint: 'ישראל',
    areaHint: null,
    categoryHint: 'restaurant',
    addressHint: null,
    evidence: 'האחים',
    modelConfidence: 0.98,
    identifiedName: 'האחים',
    nameVariants: ['HaAchim'],
    tags: ['brunch', 'pastries'],
    dishes: [],
    whyGo: {
      text: 'Features a pastry buffet in a greenhouse setting, Sunday through Friday.',
      groundedIn: 'שמים על המגש ומתיישבים בחממה של האחים',
    },
    coordinates: { lat: 32.0741, lng: 34.7788 },
  },
] as const;

/** The failure mode this whole function exists for: one element that is not a candidate. */
const MALFORMED = { rawName: 'x' };

describe('parseExtractionResultPartial', () => {
  it('keeps the valid candidates when one element of a real response is malformed', () => {
    // Before this, a single bad element cost the other three. On this recorded response that is
    // three real Tel Aviv venues thrown away over a fourth object.
    const parsed = parseExtractionResultPartial({
      candidates: [RECORDED[0], MALFORMED, RECORDED[1], RECORDED[2]],
      cityHint: 'תל אביב',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.candidates.map((c) => c.rawName)).toEqual([
      'קפה אירופה',
      'eats בית חנה',
      'האחים',
    ]);
    expect(parsed.value.cityHint).toBe('תל אביב');
  });

  it('counts what it dropped, so a partial answer cannot pass as a complete one', () => {
    // The count is the whole safeguard. Three candidates out of a four-candidate reply look
    // exactly like a complete answer of three at every later stage.
    const parsed = parseExtractionResultPartial({
      candidates: [RECORDED[0], MALFORMED, RECORDED[1], RECORDED[2]],
      cityHint: 'תל אביב',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.dropped).toBe(1);
    expect(parsed.value.total).toBe(4);
    expect(parsed.value.candidates).toHaveLength(3);
  });

  it('reports zero dropped for a clean response', () => {
    const parsed = parseExtractionResultPartial({ candidates: [...RECORDED], cityHint: 'תל אביב' });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.dropped).toBe(0);
    expect(parsed.value.total).toBe(3);
  });

  it('treats an empty candidate list as a complete, valid answer', () => {
    // `[]` is the modal outcome (~73%) and has its own screen. It must stay distinguishable from
    // a failure, which is exactly why an all-invalid list is a hard error below.
    const parsed = parseExtractionResultPartial({ candidates: [], cityHint: null });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.candidates).toEqual([]);
    expect(parsed.value.dropped).toBe(0);
    expect(parsed.value.total).toBe(0);
  });

  it('fails hard when the model sent candidates and not one of them parsed', () => {
    // Returning `[]` here would say "this caption names no place" about a reply we could not read.
    const parsed = parseExtractionResultPartial({
      candidates: [MALFORMED, { rawName: 'y' }],
      cityHint: null,
    });

    expect(parsed.ok).toBe(false);
  });

  it('names the offending index in the error, so an all-invalid reply is diagnosable', () => {
    const parsed = parseExtractionResultPartial({ candidates: [MALFORMED], cityHint: null });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.issues.every((issue) => issue.path[0] === 'candidates')).toBe(true);
    expect(parsed.error.issues.some((issue) => issue.path[1] === 0)).toBe(true);
  });

  it('fails hard on an unreadable envelope rather than salvaging anything', () => {
    // Nothing to salvage from a shape we cannot read, and the 12-item cap is a flood guard
    // (`09` §3.3) that a per-item parse must not quietly turn into a trim.
    expect(parseExtractionResultPartial(null).ok).toBe(false);
    expect(parseExtractionResultPartial('a string').ok).toBe(false);
    expect(parseExtractionResultPartial({ cityHint: null }).ok).toBe(false);
    expect(parseExtractionResultPartial({ candidates: 'not an array', cityHint: null }).ok).toBe(false);
    expect(parseExtractionResultPartial({ candidates: [] }).ok).toBe(false);
    expect(parseExtractionResultPartial({ candidates: [], cityHint: 'x'.repeat(81) }).ok).toBe(false);
  });

  it('still refuses a response above the 12-candidate cap instead of keeping the first 12', () => {
    const flood = Array.from({ length: 13 }, () => RECORDED[0]);

    expect(parseExtractionResultPartial({ candidates: flood, cityHint: null }).ok).toBe(false);
  });
});
