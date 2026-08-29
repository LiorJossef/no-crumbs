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

import { MAX_TAGS_PER_CANDIDATE } from '@/domain/extraction/tags';
import { PRIMARY_CATEGORIES } from '@/domain/places/taxonomy';

/**
 * The output-token ceiling both hosted adapters send, and the arithmetic behind it.
 *
 * ## What it replaces
 *
 * The Anthropic adapter sent `max_tokens: 1024` against this fourteen-field candidate. Measured on
 * the 65 recorded extraction responses in `docs/evidence/.local/tiktok-recognition-cache` (13
 * captions x 5 prompt versions, 79 candidate objects, no network — these are replayed, not
 * re-fetched):
 *
 * | Measure | Value |
 * |---|---|
 * | Serialised candidate object, median | 598 characters |
 * | Serialised candidate object, p95 / max | 783 / 819 characters |
 * | Worst whole response (5 candidates, Hebrew) | 3,162 characters |
 *
 * Characters are not tokens, and the mix matters: ASCII runs about 4 characters per token, Hebrew
 * between roughly 1.2 and 0.8 — Hebrew code points are two UTF-8 bytes each, so a byte-level BPE
 * spends far more of the budget on the same visible text. Applying those two rates to that worst
 * real response gives **1,177 to 1,453 output tokens for five candidates**. Both numbers are above
 * 1,024. So this was not a hypothetical ceiling waiting for a seven-place caption: a five-place
 * Hebrew caption of a kind already in the corpus overruns it, and until `stop-reason.ts` existed
 * the overrun arrived as an indistinguishable `EXTRACTOR_INVALID_OUTPUT`.
 *
 * ## The number
 *
 * Per candidate, at the pessimistic Hebrew rate: 819 characters ≈ **490 tokens**.
 * `candidates.maxItems` above lets the model emit **12**, and the ceiling has to cover what the
 * model is *allowed* to say, not what the pipeline later keeps (`MAX_CANDIDATES = 7`) — a
 * candidate truncated away is still a broken response.
 *
 *     12 x 490  = 5,880   twelve worst-case candidates
 *         + 40  =    40   envelope: `cityHint`, brackets, tool-call framing
 *     -----------------
 *              ≈ 5,920 → 8,192 (the next power of two, ~28% headroom)
 *
 * ## Why raising it is close to free
 *
 * `max_tokens` is a ceiling, not a purchase: output is billed per token generated, and a normal
 * response generates ~300–1,500. The exposure is a runaway generation, which is bounded — 8,192
 * output tokens on `claude-haiku-4-5` at $5/1M is **$0.041**, once, and `stop_reason` now says so
 * in the log when it happens instead of leaving it to be inferred.
 *
 * Re-derive this whenever the candidate shape or `candidates.maxItems` changes; both are inputs.
 */
export const MAX_OUTPUT_TOKENS = 8192;

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
          /**
           * v4 (2026-08-29): the owner's three primary categories, down from seven. `null` stays a
           * member — the prompt is explicit that a caption giving no category signal produces
           * `null` and never a fallback guess, and an enum that cannot say so would force the
           * model to invent one.
           */
          categoryHint: {
            type: ['string', 'null'],
            enum: [...PRIMARY_CATEGORIES, null],
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
           * v4 (2026-08-29): at most two library labels, drawn from `taxonomy.ts`'s closed
           * whitelist. Was five and free-form.
           *
           * **The whitelist is stated in the prompt and enforced in the domain, not declared as an
           * `enum` here, and that is a deliberate omission.** An `enum` would be the strongest
           * expression of a closed vocabulary and it is where this should end up — but the one
           * thing measured about this schema is that Gemini's `responseSchema` validator is
           * particular about *nested* arrays: `tags.maxItems` at 5 is accepted (HTTP 200) and at 8
           * or 10 is rejected outright (HTTP 400 `INVALID_ARGUMENT`, no field named in the body),
           * bisected against the live `gemini-3.5-flash-lite` on 2026-08-27. Whether it accepts a
           * 15-value `enum` on a nested array's `items` is unmeasured, and the failure mode if it
           * does not is every import returning 400. That measurement costs live quota, which is not
           * spent on curiosity (`p002-cost-constraints`), so the enum waits for a run that is
           * happening anyway. Until then `domain/extraction/tags.ts` is the control and a
           * non-whitelisted tag is dropped rather than stored.
           *
           * The old `maxItems: 5` ceiling no longer binds here — 2 is well under it — but it still
           * binds on `dishes`, which is why that field did not move. Re-measure before raising it.
           */
          tags: {
            type: 'array',
            maxItems: MAX_TAGS_PER_CANDIDATE,
            items: { type: 'string', minLength: 2, maxLength: 28 },
          },
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
