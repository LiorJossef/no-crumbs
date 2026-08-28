import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_FIELD_PROVENANCE,
  EXTRACTION_SCHEMA_VERSION,
  ExtractionResultSchema,
  RawPlaceCandidateSchema,
  toPlaceCandidate,
} from '@/domain/extraction/schema';
import { PROMPT_VERSION } from '@/integrations/llm/prompt';

describe('ExtractionResultSchema', () => {
  it('accepts a well-formed multi-candidate response', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: 'Tel Aviv',
          countryHint: null,
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
      categoryHint: 'cafe',
          evidence: "haven't stopped thinking about Cafe Fiori",
          modelConfidence: 0.9,
          addressHint: null,
          identifiedName: null,
          nameVariants: [],
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
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
      categoryHint: null,
      evidence: null,
      modelConfidence: null,
      addressHint: null,
      identifiedName: null,
      nameVariants: [],
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
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
      categoryHint: 'nightclub',
          evidence: null,
          modelConfidence: null,
          addressHint: null,
          identifiedName: null,
          nameVariants: [],
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
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
      categoryHint: 'cafe',
          evidence: 'Paradiso was so cute',
          modelConfidence: 0.8,
          addressHint: null,
          identifiedName: 'Paradiso Matcha Bar',
          nameVariants: [],
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
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
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
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          addressHint: null,
          identifiedName: null,
          nameVariants: [],
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
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          addressHint: null,
          identifiedName: null,
          nameVariants: [],
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
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          addressHint: null,
          identifiedName: null,
          nameVariants: [],
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
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
          categoryHint: null,
          evidence: null,
          modelConfidence: null,
          addressHint: null,
          identifiedName: null,
          nameVariants: [],
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
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
      categoryHint: 'cafe',
      evidence: 'evidence text',
      modelConfidence: 0.7,
      addressHint: null,
      identifiedName: null,
      nameVariants: [],
      coordinates: null,
    });
    expect(candidate).toEqual({
      rawName: 'Cafe Fiori',
      cityHint: 'Tel Aviv',
      countryHint: null,
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
      categoryHint: 'cafe',
      evidence: 'evidence text',
      modelConfidence: 0.7,
      addressHint: null,
      identifiedName: null,
      nameVariants: [],
      coordinates: null,
    });
  });

  it('passes identifiedName through unchanged, distinct from rawName', () => {
    const candidate = toPlaceCandidate({
      rawName: 'Paradiso',
      cityHint: 'Prague',
      countryHint: null,
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
      categoryHint: 'cafe',
      evidence: 'Paradiso was so cute',
      modelConfidence: 0.8,
      addressHint: null,
      identifiedName: 'Paradiso Matcha Bar',
      nameVariants: [],
      coordinates: null,
    });
    expect(candidate.identifiedName).toBe('Paradiso Matcha Bar');
    expect(candidate.rawName).toBe('Paradiso');
  });

  it('keeps "bakery" as "bakery" rather than collapsing it onto "cafe"', () => {
    const candidate = toPlaceCandidate({
      rawName: 'Lehamim Bakery',
      cityHint: null,
      countryHint: null,
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
      categoryHint: 'bakery',
      evidence: null,
      modelConfidence: null,
      addressHint: null,
      identifiedName: null,
      nameVariants: [],
      coordinates: null,
    });
    expect(candidate.categoryHint).toBe('bakery');
  });

  it('keeps a category the scorer cannot score, rather than dropping it to null', () => {
    const candidate = toPlaceCandidate({
      rawName: 'The Grand Museum',
      cityHint: null,
      countryHint: null,
      areaHint: null,
      tags: [],
      dishes: [],
      whyGo: null,
      categoryHint: 'attraction',
      evidence: null,
      modelConfidence: null,
      addressHint: null,
      identifiedName: null,
      nameVariants: [],
      coordinates: null,
    });
    // `attraction` has no scoreable equivalent, but the candidate is not the seam that decides
    // that — `categoryHintFor` is, at the `ResolveQuery` boundary. Storage and the review screen
    // both keep the real value.
    expect(candidate.categoryHint).toBe('attraction');
  });
});

/**
 * The two guards that stop schema v2 rotting quietly. Neither is about model behaviour; both are
 * about a future change to this file that forgets something invisible.
 */
describe('schema versioning', () => {
  it('welds the schema version into the extraction cache key', () => {
    // `extractions` is unique on `(source_id, model, prompt_version)`. If the candidate shape
    // changes and `prompt_version` does not, a row written by the old shape is read back and
    // treated as the new one. `PROMPT_VERSION` therefore has to carry `EXTRACTION_SCHEMA_VERSION`,
    // and this assertion is what makes forgetting that loud instead of silent.
    expect(PROMPT_VERSION).toContain(`s${EXTRACTION_SCHEMA_VERSION}`);
  });

  it('is on v3, under the prompt that tightened tags, dishes and whyGo', () => {
    // Spelled out rather than derived, so moving the schema or the prompt is a deliberate edit
    // here too. `p9` tightened four rules against measured p8 output; `s3` is the candidate shape
    // that carries `nameVariants`, unchanged by that. Only the half that moved, moved.
    expect(EXTRACTION_SCHEMA_VERSION).toBe(3);
    expect(PROMPT_VERSION).toBe('p9-s3');
  });

  it('keeps PROMPT_VERSION storable in the extractions column', () => {
    // `extractions_prompt_version_check`, migration 0003.
    expect(PROMPT_VERSION).toMatch(/^[a-z0-9][a-z0-9._-]{0,31}$/);
  });
});

describe('CANDIDATE_FIELD_PROVENANCE', () => {
  it('classifies every field the model can emit', () => {
    // Adding a field without deciding whether it is quoted, inferred from the caption, or recalled
    // from the model's own world knowledge is exactly how the extracted-vs-inferred distinction
    // erodes — one field at a time, each individually defensible. This makes that omission a
    // failing test rather than a judgement call in review.
    const schemaKeys = Object.keys(RawPlaceCandidateSchema.shape).sort();
    expect(Object.keys(CANDIDATE_FIELD_PROVENANCE).sort()).toEqual(schemaKeys);
  });

  it('keeps the model\'s own recall separable from what the caption said', () => {
    expect(CANDIDATE_FIELD_PROVENANCE.rawName).toBe('caption_verbatim');
    expect(CANDIDATE_FIELD_PROVENANCE.evidence).toBe('caption_verbatim');
    expect(CANDIDATE_FIELD_PROVENANCE.dishes).toBe('caption_verbatim');
    expect(CANDIDATE_FIELD_PROVENANCE.tags).toBe('caption_inference');
    expect(CANDIDATE_FIELD_PROVENANCE.whyGo).toBe('caption_inference');
    expect(CANDIDATE_FIELD_PROVENANCE.identifiedName).toBe('world_knowledge');
    expect(CANDIDATE_FIELD_PROVENANCE.coordinates).toBe('world_knowledge');
    // A variant is a translation or a transliteration, so it can never be a caption substring and
    // no grounding gate can check it. Labelling it `caption_verbatim` or `caption_inference` would
    // be the exact erosion this map exists to prevent — it is recall, and it is confined to the
    // query side because of that.
    expect(CANDIDATE_FIELD_PROVENANCE.nameVariants).toBe('world_knowledge');
    // `02` §D3: kept so it can be measured, never so it can be trusted.
    expect(CANDIDATE_FIELD_PROVENANCE.modelConfidence).toBe('model_self_report');
  });
});

describe('ExtractionResultSchema — v2 fields', () => {
  const base = {
    rawName: 'La Nonna',
    cityHint: 'London',
    countryHint: null,
    areaHint: 'Market Row, Brixton',
    categoryHint: 'restaurant' as const,
    addressHint: null,
    evidence: 'La Nonna in Market Row, Brixton',
    modelConfidence: 0.9,
    identifiedName: 'La Nonna',
    nameVariants: [],
    tags: ['Italian'],
    dishes: ['artisan pasta'],
    whyGo: { text: 'Artisan pasta in a Brixton market hall.', groundedIn: 'delicious artisan pasta' },
    coordinates: null,
  };

  it('accepts a full v2 candidate', () => {
    expect(ExtractionResultSchema.safeParse({ candidates: [base], cityHint: 'London' }).success).toBe(true);
  });

  it('rejects a whyGo with no citation', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [{ ...base, whyGo: { text: 'Worth going to.' } }],
      cityHint: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a v1-shaped candidate outright rather than defaulting the new fields', () => {
    // No `.default([])` anywhere in the candidate: a stored row missing these fields must fail to
    // parse, so a cache miss is what happens if the version key is ever wrong.
    const v1Shaped: Record<string, unknown> = { ...base };
    for (const field of ['tags', 'dishes', 'whyGo', 'areaHint']) delete v1Shaped[field];
    expect(ExtractionResultSchema.safeParse({ candidates: [v1Shaped], cityHint: null }).success).toBe(false);
  });

  it('rejects a tag list beyond the Zod cap', () => {
    const parsed = ExtractionResultSchema.safeParse({
      candidates: [{ ...base, tags: Array.from({ length: 12 }, (_, i) => `tag${i}`) }],
      cityHint: null,
    });
    expect(parsed.success).toBe(false);
  });
});

/**
 * `nameVariants` (v3, TLV-BILING-A). The measured problem it exists for: for every Hebrew caption
 * in the live extraction cache, both `rawName` and `identifiedName` come back Hebrew (`קוהי`,
 * `מתחת לעץ`) while the `poi_index` row holds the venue under its Latin name (`Kohi Coffee Shop`,
 * `Under the Tree`), so the lookup never had a term that could match.
 */
describe('ExtractionResultSchema — nameVariants', () => {
  const base = {
    rawName: 'קוהי',
    cityHint: 'תל אביב',
    countryHint: 'ישראל',
    areaHint: null,
    categoryHint: 'cafe' as const,
    addressHint: 'בן יהודה 155',
    evidence: 'קוהי',
    modelConfidence: 0.8,
    identifiedName: 'קוהי',
    nameVariants: ['Kohi', 'Kohi Coffee Shop'],
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: null,
  };
  const parse = (overrides: Record<string, unknown>) =>
    ExtractionResultSchema.safeParse({ candidates: [{ ...base, ...overrides }], cityHint: 'תל אביב' });

  it('accepts the Latin forms of a Hebrew-captioned venue', () => {
    expect(parse({}).success).toBe(true);
  });

  it('accepts an empty list — the correct answer for a Latin-only venue', () => {
    expect(parse({ nameVariants: [] }).success).toBe(true);
  });

  it('requires the field to be present, even when empty — no optional properties', () => {
    const withoutField: Record<string, unknown> = { ...base };
    delete withoutField.nameVariants;
    expect(ExtractionResultSchema.safeParse({ candidates: [withoutField], cityHint: null }).success).toBe(false);
  });

  it('rejects a fourth variant rather than accepting a list of spellings', () => {
    // The cap is a product decision as well as a Gemini `responseSchema` constraint: a model
    // listing eight renderings of one name is producing noise, and every extra entry is another
    // chance one of them names a different venue.
    expect(parse({ nameVariants: ['Kohi', 'Kohi Coffee Shop', 'Cohi'] }).success).toBe(true);
    expect(parse({ nameVariants: ['Kohi', 'Kohi Coffee Shop', 'Cohi', 'Koffee'] }).success).toBe(false);
  });

  it('rejects a one-character variant', () => {
    expect(parse({ nameVariants: ['K'] }).success).toBe(false);
  });

  it('refuses a variant that fits raw but not once NFKC-normalised', () => {
    // Same hazard as every other bounded string here: NFKC expands, and the two sides of a write
    // measure different strings. 41 characters raw, 123 normalised, against a 120 bound.
    const variant = 'ﬄ'.repeat(41);
    expect(variant.length).toBeLessThanOrEqual(120);
    expect(variant.normalize('NFKC').length).toBeGreaterThan(120);
    expect(parse({ nameVariants: [variant] }).success).toBe(false);
  });

  it('carries the variants through toPlaceCandidate untouched', () => {
    const candidate = toPlaceCandidate({ ...base });
    expect(candidate.nameVariants).toEqual(['Kohi', 'Kohi Coffee Shop']);
    // The caption's own wording is not disturbed by the variant existing — the whole point is that
    // the Hebrew original survives alongside the Latin search term.
    expect(candidate.rawName).toBe('קוהי');
    expect(candidate.identifiedName).toBe('קוהי');
  });
});

/**
 * NFKC expansion. Every one of these strings is short enough to pass a naive `.length` check and
 * long enough to be refused by a database that normalises before it checks — which is exactly the
 * shape of bug that never shows up in testing, because nobody writes a test with a ligature in it.
 *
 * The characters are chosen for their real expansion factors, not for length: `ﬄ` (U+FB04) becomes
 * three characters, `½` becomes three, and `ﷺ` (U+FDFA) becomes eighteen. An all-ASCII version of
 * this suite cannot fail and would be false confidence.
 */
describe('NFKC-aware length bounds', () => {
  const base = {
    rawName: 'Ha Kosem',
    cityHint: null,
    countryHint: null,
    areaHint: null,
    categoryHint: null,
    addressHint: null,
    evidence: null,
    modelConfidence: null,
    identifiedName: null,
    nameVariants: [],
    tags: [],
    dishes: [],
    whyGo: null,
    coordinates: null,
  };
  const parse = (overrides: Record<string, unknown>) =>
    ExtractionResultSchema.safeParse({ candidates: [{ ...base, ...overrides }], cityHint: null });

  it('refuses a tag that fits raw but not once normalised', () => {
    // 21 characters raw, 63 once NFKC-normalised, against a 28 bound.
    const tag = 'ﬄ'.repeat(21);
    expect(tag.length).toBeLessThanOrEqual(28);
    expect(tag.normalize('NFKC').length).toBeGreaterThan(28);
    expect(parse({ tags: [tag] }).success).toBe(false);
  });

  it('refuses a dish that fits raw but not once normalised', () => {
    // The thinnest margin in the schema: 60 raw against 64 normalised in the column, so a single
    // ligature is enough. 59 characters raw, 67 normalised.
    const dish = 'a'.repeat(55) + 'ﬄ'.repeat(4);
    expect(dish.length).toBeLessThanOrEqual(60);
    expect(dish.normalize('NFKC').length).toBeGreaterThan(60);
    expect(parse({ dishes: [dish] }).success).toBe(false);
  });

  it('refuses a whyGo sentence that fits raw but not once normalised', () => {
    // 186 characters raw, 288 normalised, against a 200 bound.
    const text = 'a'.repeat(135) + 'ﬄ'.repeat(51);
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text.normalize('NFKC').length).toBeGreaterThan(200);
    expect(parse({ whyGo: { text, groundedIn: 'Ha Kosem is great' } }).success).toBe(false);
  });

  it('refuses a name blown past the bound by one 18x code point', () => {
    // U+FDFA is the worst single-code-point expansion in Unicode: 1 character becomes 18.
    const name = 'a'.repeat(110) + 'ﷺ';
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name.normalize('NFKC').length).toBeGreaterThan(120);
    expect(parse({ rawName: name }).success).toBe(false);
  });

  it('refuses an address pushed over by vulgar fractions', () => {
    const addressHint = 'a'.repeat(155) + '½'.repeat(5);
    expect(addressHint.length).toBeLessThanOrEqual(160);
    expect(parse({ addressHint }).success).toBe(false);
  });

  it('still accepts a value that is at the bound in both forms', () => {
    // The guard must not reject ordinary text, including accented text, which NFKC leaves the same
    // length or shorter.
    expect(parse({ tags: ['Café'], dishes: ['crème brûlée'], areaHint: 'Florentin' }).success).toBe(true);
  });
});
