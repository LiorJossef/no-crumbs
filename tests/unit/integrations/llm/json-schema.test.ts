import { describe, expect, it } from 'vitest';
import { MAX_TAGS_PER_CANDIDATE } from '@/domain/extraction/tags';
import { POST_INTENTS } from '@/domain/extraction/schema';
import { PRIMARY_CATEGORIES } from '@/domain/places/taxonomy';

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
        'addressHint',
        'evidence',
        'modelConfidence',
        'identifiedName',
        'nameVariants',
        'coordinates',
        'areaHint',
        'tags',
        'dishes',
        'whyGo',
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
          addressHint: null,
          evidence: 'evidence text',
          modelConfidence: 0.5,
          identifiedName: null,
          nameVariants: ['Kohi', 'Kohi Coffee Shop'],
          areaHint: 'Florentin',
          tags: ['Italian', 'Hidden Gem'],
          dishes: ['sabich'],
          whyGo: { text: 'A small place worth queueing for.', groundedIn: 'worth the queue' },
          coordinates: { lat: 32.0596, lng: 34.7654 },
        },
      ],
      cityHint: 'Tel Aviv',
      postIntent: 'place_recommendation',
    };
    expect(ExtractionResultSchema.safeParse(sample).success).toBe(true);
    expect(ExtractionResultSchema.parse(sample).postIntent).toBe('place_recommendation');
  });

  it('asks for postIntent at the response level, and requires it', () => {
    // v5 (E2-T3). Response-level rather than per candidate, because the case the field exists for
    // — a recommendation whose venue is only spoken — has no candidate to hang it on. `required`
    // matters: an optional key is one a model quietly stops emitting.
    expect(EXTRACTION_JSON_SCHEMA.required).toContain('postIntent');
    expect(Object.keys(EXTRACTION_JSON_SCHEMA.properties)).toContain('postIntent');
    expect(
      Object.keys(EXTRACTION_JSON_SCHEMA.properties.candidates.items.properties),
    ).not.toContain('postIntent');
  });

  it('the postIntent enum is exactly the three values, plus null', () => {
    const rawEnum: readonly (string | null)[] = EXTRACTION_JSON_SCHEMA.properties.postIntent.enum;
    const enumValues = rawEnum.filter((v): v is string => v !== null);
    expect([...enumValues].sort()).toEqual([...POST_INTENTS].sort());
    // `null` stays a member for the same reason it does on `categoryHint`: the model must be able
    // to decline, and an enum that cannot say so makes it pick one anyway.
    expect(rawEnum).toContain(null);
  });

  it('accepts every enum member the model is offered, including null', () => {
    // The drift this catches is the one that costs a whole extraction: a value the JSON Schema
    // permits and the Zod schema refuses is EXTRACTOR_INVALID_OUTPUT on a compliant reply.
    for (const value of EXTRACTION_JSON_SCHEMA.properties.postIntent.enum) {
      const parsed = ExtractionResultSchema.safeParse({
        candidates: [],
        cityHint: null,
        postIntent: value,
      });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.postIntent).toBe(value);
    }
  });

  it('caps nameVariants at the same 3 the Zod schema does', () => {
    // The two schemas are hand-kept in step, and this is the pair most likely to drift: the JSON
    // Schema cap is what the model is told, the Zod cap is what we will actually accept. A JSON
    // Schema cap above the Zod one turns a compliant model response into EXTRACTOR_INVALID_OUTPUT
    // — the whole extraction lost over a fourth spelling of one name.
    const jsonCap = EXTRACTION_JSON_SCHEMA.properties.candidates.items.properties.nameVariants.maxItems;
    expect(jsonCap).toBe(3);

    const overCap = {
      candidates: [
        {
          rawName: 'קוהי',
          cityHint: 'תל אביב',
          countryHint: null,
          categoryHint: 'cafe',
          addressHint: null,
          evidence: 'קוהי',
          modelConfidence: 0.5,
          identifiedName: null,
          nameVariants: Array.from({ length: jsonCap + 1 }, (_, i) => `Kohi ${i}`),
          areaHint: null,
          tags: [],
          dishes: [],
          whyGo: null,
          coordinates: null,
        },
      ],
      cityHint: 'תל אביב',
    };
    expect(ExtractionResultSchema.safeParse(overCap).success).toBe(false);
  });

  it('the category enum is exactly the taxonomy, plus null', () => {
    const rawEnum: readonly (string | null)[] = EXTRACTION_JSON_SCHEMA.properties.candidates.items.properties
      .categoryHint.enum;
    const enumValues = rawEnum.filter((v): v is string => v !== null);
    expect([...enumValues].sort()).toEqual([...PRIMARY_CATEGORIES].sort());
    // `null` has to stay a member: the prompt says a caption with no category signal produces
    // null, and an enum that cannot express that would make the model pick one anyway.
    expect(rawEnum).toContain(null);
  });

  it('asks for no more tags than the domain will keep', () => {
    // The two caps have drifted once already, in the direction that wastes model output: the
    // schema offered five and `canonicaliseTags` kept whatever `MAX_TAGS_PER_CANDIDATE` was.
    expect(EXTRACTION_JSON_SCHEMA.properties.candidates.items.properties.tags.maxItems).toBe(
      MAX_TAGS_PER_CANDIDATE,
    );
  });
});
