/**
 * The JSON Schema sent to whichever model adapter is active, hand-authored to mirror
 * `domain/extraction/schema.ts`'s `ExtractionResultSchema` field-for-field.
 *
 * `09` §2.1 says the ideal is deriving this schema from the same Zod object we validate with
 * (Anthropic's `zodOutputFormat()`). This file hand-authors it instead, for one reason worth
 * recording rather than hiding: neither `@anthropic-ai/sdk` nor a Zod-to-JSON-Schema codegen
 * package is a dependency of this repo today, and adding one is a call this task does not need to
 * make to hit its exit criterion. The response is still Zod-parsed against
 * `ExtractionResultSchema` after the call (both adapters do this) — this schema only shapes the
 * model's output; `ExtractionResultSchema` is what is actually trusted. If the two ever disagree,
 * a schema-valid-but-Zod-rejected response is `EXTRACTOR_INVALID_OUTPUT`, exactly as `07` §9
 * requires either way.
 *
 * `tests/unit/extraction/json-schema.test.ts` is the guard against the two drifting apart: it
 * round-trips a candidate through this shape and asserts `ExtractionResultSchema` accepts it.
 */

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'cityHint'],
  properties: {
    candidates: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rawName', 'cityHint', 'countryHint', 'categoryHint', 'evidence', 'modelConfidence'],
        properties: {
          rawName: { type: 'string', minLength: 2, maxLength: 120 },
          cityHint: { type: ['string', 'null'], maxLength: 80 },
          countryHint: { type: ['string', 'null'], maxLength: 80 },
          categoryHint: {
            type: ['string', 'null'],
            enum: ['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other', null],
          },
          evidence: { type: ['string', 'null'], maxLength: 240 },
          modelConfidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
        },
      },
    },
    cityHint: { type: ['string', 'null'], maxLength: 80 },
  },
} as const;
