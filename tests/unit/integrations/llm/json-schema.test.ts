import { describe, expect, it } from 'vitest';

import { ExtractionResultSchema } from '@/domain/extraction/schema';
import { EXTRACTION_JSON_SCHEMA } from '@/integrations/llm/json-schema';

/**
 * `json-schema.ts`'s header explains why this schema is hand-authored rather than derived from
 * the same Zod object: this test is the guard against the two drifting apart.
 */
describe('EXTRACTION_JSON_SCHEMA vs ExtractionResultSchema', () => {
  it('every field EXTRACTION_JSON_SCHEMA requires is also required by the Zod schema', () => {
    const candidateProps = Object.keys(EXTRACTION_JSON_SCHEMA.properties.candidates.items.properties);
    expect(candidateProps.sort()).toEqual(
      [
        'rawName',
        'cityHint',
        'countryHint',
        'categoryHint',
        'evidence',
        'modelConfidence',
        'identifiedName',
        'coordinates',
      ].sort(),
    );
  });

  it('a shape satisfying the hand-authored schema also parses under ExtractionResultSchema', () => {
    const sample = {
      candidates: [
        {
          rawName: 'Cafe Fiori',
          cityHint: 'Tel Aviv',
          countryHint: null,
          categoryHint: 'cafe',
          evidence: 'evidence text',
          modelConfidence: 0.5,
          identifiedName: null,
          coordinates: { lat: 32.0596, lng: 34.7654 },
        },
      ],
      cityHint: 'Tel Aviv',
    };
    expect(ExtractionResultSchema.safeParse(sample).success).toBe(true);
  });

  it('the category enum matches exactly the seven values ExtractedCategoryHintSchema declares', () => {
    const rawEnum: readonly (string | null)[] = EXTRACTION_JSON_SCHEMA.properties.candidates.items.properties
      .categoryHint.enum;
    const enumValues = rawEnum.filter((v): v is string => v !== null);
    expect(enumValues.sort()).toEqual(
      ['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other'].sort(),
    );
  });
});
