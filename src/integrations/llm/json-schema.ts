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
        required: [
          'rawName',
          'cityHint',
          'countryHint',
          'areaHint',
          'categoryHint',
          'addressHint',
          'evidence',
          'modelConfidence',
          'identifiedName',
          'nameVariants',
          'tags',
          'dishes',
          'whyGo',
          'coordinates',
        ],
        properties: {
          rawName: { type: 'string', minLength: 2, maxLength: 120 },
          cityHint: { type: ['string', 'null'], maxLength: 80 },
          countryHint: { type: ['string', 'null'], maxLength: 80 },
          /** v2: the neighbourhood/market/building, so it stops being written into the name. */
          areaHint: { type: ['string', 'null'], maxLength: 80 },
          categoryHint: {
            type: ['string', 'null'],
            enum: ['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other', null],
          },
          /** A verbatim street address near a "📍" marker (or elsewhere in the caption), separate
           *  from `cityHint`/`countryHint`/`rawName` — load-bearing for the Google Maps link. */
          addressHint: { type: ['string', 'null'], maxLength: 160 },
          evidence: { type: ['string', 'null'], maxLength: 240 },
          modelConfidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          /** `06` §3.4: the model's own best real-world identification, inference allowed. */
          identifiedName: { type: ['string', 'null'], minLength: 2, maxLength: 120 },
          /**
           * v3 (TLV-BILING-A): the same venue's name in the other script, as a **query** hint.
           * `maxItems: 3` matches the Zod cap and sits under the measured `maxItems: 5` ceiling
           * documented on `tags` below — a nested array above that is rejected outright by the
           * Gemini `responseSchema` validator, so this cap is a hard constraint as well as a
           * product one. Never nullable: an empty array is the answer when there is no variant,
           * and one empty state is better than two.
           */
          nameVariants: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string', minLength: 2, maxLength: 120 },
          },
          /**
           * v2: free-form library labels. Open vocabulary by design — canonicalised, capped and
           * de-duplicated in `domain/extraction/tags.ts`, not constrained to a list here.
           *
           * `maxItems: 5` is a **measured Gemini limit, not a product choice.** Bisected against
           * the live `gemini-3.5-flash-lite` `responseSchema` validator on 2026-08-27: this exact
           * schema with `tags.maxItems` at 5 is accepted (HTTP 200) and at 8 or 10 is rejected
           * (HTTP 400 `INVALID_ARGUMENT`, with no field named in the response body). Renaming the
           * property changed nothing, and removing `minLength`/`maxLength` changed nothing, so it
           * is the nested array's own item cap. The root `candidates` array's `maxItems: 12` is
           * unaffected — the limit only bites on arrays nested inside it. `dishes` sits at 5 for
           * the same reason. Re-measure before raising either.
           */
          tags: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 2, maxLength: 28 } },
          /** v2: named dishes/drinks the caption itself names. Verbatim-class — `grounding.ts`
           *  drops any item that is not findable in the caption. */
          dishes: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 2, maxLength: 60 } },
          /** v2: the model's own sentence, plus the verbatim caption fragment licensing it. Null
           *  whenever the caption says nothing beyond the name — see `schema.ts`'s `WhyGoSchema`. */
          whyGo: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['text', 'groundedIn'],
            properties: {
              text: { type: 'string', minLength: 8, maxLength: 200 },
              groundedIn: { type: 'string', minLength: 3, maxLength: 240 },
            },
          },
          /** The model's own best-guess coordinates, inference allowed, null when no real basis. */
          coordinates: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['lat', 'lng'],
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lng: { type: 'number', minimum: -180, maximum: 180 },
            },
          },
        },
      },
    },
    cityHint: { type: ['string', 'null'], maxLength: 80 },
  },
} as const;
