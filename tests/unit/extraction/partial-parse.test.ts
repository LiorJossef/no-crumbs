import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_CAP,
  FLOOD_GUARD_CANDIDATES,
  parseExtractionResultPartial,
} from '@/domain/extraction/schema';
import { MAX_CANDIDATES } from '@/domain/import/pipeline';

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

/** `n` valid candidates with distinguishable names, so which ones survived is checkable. */
const manyValid = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...RECORDED[0], rawName: `Place ${i}` }));

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
    // Nothing to salvage from a shape we cannot read. The flood guard is the separate limit, and
    // it is exercised below.
    expect(parseExtractionResultPartial(null).ok).toBe(false);
    expect(parseExtractionResultPartial('a string').ok).toBe(false);
    expect(parseExtractionResultPartial({ cityHint: null }).ok).toBe(false);
    expect(parseExtractionResultPartial({ candidates: 'not an array', cityHint: null }).ok).toBe(false);
    expect(parseExtractionResultPartial({ candidates: [] }).ok).toBe(false);
    expect(parseExtractionResultPartial({ candidates: [], cityHint: 'x'.repeat(81) }).ok).toBe(false);
  });

  it('yields places from a thirteen-place post instead of losing all thirteen', () => {
    // `growth-plan.md` G2, and the reason this file changed. The envelope bound was the keep-cap,
    // the envelope is parsed before the salvage loop, and a failed envelope returns `{ ok: false }`
    // — so one candidate over the line cost the caption every place it named.
    const parsed = parseExtractionResultPartial({ candidates: manyValid(13), cityHint: null });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.candidates).toHaveLength(CANDIDATE_CAP);
    // The model's own ordering, cut from the end: the caption's first twelve venues survive.
    expect(parsed.value.candidates.map((c) => c.rawName)).toEqual(
      Array.from({ length: CANDIDATE_CAP }, (_, i) => `Place ${i}`),
    );
    // The pipeline's budget is what turns these into places, so the parse has to hand it a full
    // one. Asserted against the constant rather than a literal: `MAX_CANDIDATES` moves.
    expect(parsed.value.candidates.slice(0, MAX_CANDIDATES)).toHaveLength(MAX_CANDIDATES);
  });

  it('reports the thirteenth candidate as truncated, never as dropped', () => {
    // Two different facts. `dropped` means the model sent something malformed; `truncated` means it
    // sent something fine that we do not carry. Folding one into the other would read an
    // over-productive listicle as a partly broken reply.
    const withOneBad = [...manyValid(13).slice(0, 1), MALFORMED, ...manyValid(13).slice(1)];
    const parsed = parseExtractionResultPartial({ candidates: withOneBad, cityHint: null });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.total).toBe(14);
    expect(parsed.value.dropped).toBe(1);
    expect(parsed.value.truncated).toBe(1);
    expect(parsed.value.candidates).toHaveLength(CANDIDATE_CAP);
    // The malformed element does not eat a slot in the cap: twelve real venues, not eleven.
    expect(parsed.value.candidates.map((c) => c.rawName)).not.toContain('x');
  });

  it('reports nothing truncated when the reply fits the cap', () => {
    const parsed = parseExtractionResultPartial({ candidates: [...RECORDED], cityHint: null });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.truncated).toBe(0);
  });

  it('still refuses a flood, which is what stops the fix being a hole', () => {
    // `09` §3.3: a model emitting 40 hashtag "places" has stopped answering the question, and no
    // prefix of that reply is worth keeping. The guard moved; it did not go away.
    const flood = manyValid(FLOOD_GUARD_CANDIDATES + 1);

    expect(parseExtractionResultPartial({ candidates: flood, cityHint: null }).ok).toBe(false);
    expect(parseExtractionResultPartial({ candidates: manyValid(40), cityHint: null }).ok).toBe(false);
  });

  it('truncates a reply that sits exactly on the flood guard', () => {
    const parsed = parseExtractionResultPartial({
      candidates: manyValid(FLOOD_GUARD_CANDIDATES),
      cityHint: null,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.candidates).toHaveLength(CANDIDATE_CAP);
    expect(parsed.value.truncated).toBe(FLOOD_GUARD_CANDIDATES - CANDIDATE_CAP);
    expect(parsed.value.dropped).toBe(0);
  });

  it('still fails hard when an over-cap reply is entirely invalid', () => {
    // The new band must not become a way for an unreadable reply to arrive as `[]`. Thirteen
    // elements, none of them a candidate: past the old cliff, and still an error rather than
    // "this caption names no place".
    const parsed = parseExtractionResultPartial({
      candidates: Array.from({ length: 13 }, () => MALFORMED),
      cityHint: null,
    });

    expect(parsed.ok).toBe(false);
  });
});
