/**
 * The extractor's output contract (`09` §3, L0-F4-T2). One Zod object, used three ways: to derive
 * the JSON Schema sent to the model (`integrations/llm/json-schema.ts`), to parse the response
 * inside each adapter, and to parse a cached `extractions.candidates` `jsonb` column back out on
 * read (`07` §"Validation", boundary 3) — never trusted twice, parsed twice.
 *
 * `categoryHint` is the **raw**, seven-value vocabulary the model may emit
 * (`places/category-hint.ts`'s `ExtractedCategoryHint`), and it stays that way all the way to
 * storage and to the review screen. `toPlaceCandidate` used to narrow it here with
 * `categoryHintFor`, which was the wrong seam: the scorer is the only consumer that needs three
 * values, so narrowing before storage silently saved every bakery as a cafe and threw
 * `attraction`/`shop`/`other` away entirely. The narrowing now happens where `ResolveQuery` is
 * built (`domain/import/pipeline.ts`), which is the only place it is actually required.
 */

import { z } from 'zod';

import type { PlaceCandidate } from '../types';

const EXTRACTED_CATEGORY_HINTS = ['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other'] as const;

/** `places/category-hint.ts`'s `ExtractedCategoryHint`, restated as a Zod enum so this file is the
 *  one place the model-facing vocabulary is spelled out for schema generation. */
export const ExtractedCategoryHintSchema = z.enum(EXTRACTED_CATEGORY_HINTS);

/** One candidate as the model must emit it — verbatim `rawName`, no confidence trusted (`02` §D3),
 *  `evidence` a caption fragment so a fabrication is a substring check, not a judgement call.
 *  `identifiedName` is the one exception to the verbatim discipline (`06` §3.4): the model's own
 *  real-world guess at the full venue, nullable when it has none beyond the raw fragment. */
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const RawPlaceCandidateSchema = z.object({
  rawName: z.string().min(2).max(120),
  cityHint: z.string().max(80).nullable(),
  countryHint: z.string().max(80).nullable(),
  categoryHint: ExtractedCategoryHintSchema.nullable(),
  /** A street address given verbatim in the caption — a number plus a street name, commonly (but
   *  not always) sitting near a "📍" marker, and separate from `cityHint`/`countryHint` and from
   *  `rawName`. `null` when the caption gives no address. Load-bearing for the Google Maps link:
   *  captured explicitly so it generalizes across caption formats instead of riding along inside
   *  `evidence` by incidental luck. */
  addressHint: z.string().max(160).nullable(),
  evidence: z.string().max(240).nullable(),
  modelConfidence: z.number().min(0).max(1).nullable(),
  identifiedName: z.string().min(2).max(120).nullable(),
  /** The model's own best-guess coordinates for `identifiedName`/`rawName`, inferred from
   *  whatever context the caption gives (name, address, city/neighbourhood, business type) — not
   *  a database lookup. `null` when the model has no real basis for a guess; never a fabrication
   *  forced just to fill the field. Unresolved, unvalidated pending human confirmation, exactly
   *  like `identifiedName` (`06` §3.4). */
  coordinates: CoordinatesSchema.nullable(),
});

export type RawPlaceCandidate = z.infer<typeof RawPlaceCandidateSchema>;

/**
 * The whole response. The 12-cap is at the schema level, below the API's own limits and above our
 * own `MAX_CANDIDATES = 7` (`07` §7) — a model that tries to emit 40 hashtag-derived "places" fails
 * schema validation rather than flooding the pipeline (`09` §3.3).
 */
export const ExtractionResultSchema = z.object({
  candidates: z.array(RawPlaceCandidateSchema).max(12),
  cityHint: z.string().max(80).nullable(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** Narrows one raw, model-vocabulary candidate to the domain's `PlaceCandidate` (`domain/types.ts`),
 *  the shape every adapter must hand back to `PlaceExtractor.extract`'s caller. */
export function toPlaceCandidate(raw: RawPlaceCandidate): PlaceCandidate {
  return {
    rawName: raw.rawName,
    cityHint: raw.cityHint,
    countryHint: raw.countryHint,
    categoryHint: raw.categoryHint,
    addressHint: raw.addressHint,
    evidence: raw.evidence,
    modelConfidence: raw.modelConfidence,
    identifiedName: raw.identifiedName,
    coordinates: raw.coordinates,
  };
}
