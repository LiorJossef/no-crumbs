/**
 * The extractor's output contract (`09` §3, L0-F4-T2). One Zod object, used three ways: to derive
 * the JSON Schema sent to the model (`integrations/llm/json-schema.ts`), to parse the response
 * inside each adapter, and to parse a cached `extractions.candidates` `jsonb` column back out on
 * read (`07` §"Validation", boundary 3) — never trusted twice, parsed twice.
 *
 * `categoryHint` here is the **raw**, seven-value vocabulary the model may emit
 * (`places/category-hint.ts`'s `ExtractedCategoryHint`), not the three-value `CategoryHint` the
 * resolver scores against. `toPlaceCandidate` below is the one place that narrows it, via
 * `categoryHintFor` — reusing that existing, already-tested mapping rather than inventing a second
 * one at this seam.
 */

import { z } from 'zod';

import { categoryHintFor, type ExtractedCategoryHint } from '../places/category-hint';
import type { PlaceCandidate } from '../types';

const EXTRACTED_CATEGORY_HINTS = ['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other'] as const;

/** `places/category-hint.ts`'s `ExtractedCategoryHint`, restated as a Zod enum so this file is the
 *  one place the model-facing vocabulary is spelled out for schema generation. */
export const ExtractedCategoryHintSchema = z.enum(EXTRACTED_CATEGORY_HINTS);

/** One candidate as the model must emit it — verbatim `rawName`, no confidence trusted (`02` §D3),
 *  `evidence` a caption fragment so a fabrication is a substring check, not a judgement call.
 *  `identifiedName` is the one exception to the verbatim discipline (`06` §3.4): the model's own
 *  real-world guess at the full venue, nullable when it has none beyond the raw fragment. */
export const RawPlaceCandidateSchema = z.object({
  rawName: z.string().min(2).max(120),
  cityHint: z.string().max(80).nullable(),
  countryHint: z.string().max(80).nullable(),
  categoryHint: ExtractedCategoryHintSchema.nullable(),
  evidence: z.string().max(240).nullable(),
  modelConfidence: z.number().min(0).max(1).nullable(),
  identifiedName: z.string().min(2).max(120).nullable(),
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
    categoryHint: categoryHintFor(raw.categoryHint as ExtractedCategoryHint | null),
    evidence: raw.evidence,
    modelConfidence: raw.modelConfidence,
    identifiedName: raw.identifiedName,
  };
}
