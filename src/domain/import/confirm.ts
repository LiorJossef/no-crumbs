/**
 * `POST /api/imports/confirm`'s request body — the boundary Zod schema ("Zod at every boundary",
 * `07` §10 rule 2). Untrusted JSON from the browser in, a typed, validated shape out; the route
 * never hands the raw body to `PlaceStore.confirmPlace` (`domain/ports.ts`).
 *
 * One `sourceId` for the whole batch, not one per item: every candidate in a single confirm
 * request came from the same import (the same post), so `save_place`'s per-user
 * `saved_place_sources` link is the same source row for every item. A future flow that lets one
 * place absorb more than one source's evidence (constraint 3 of this task's scope ruling,
 * `docs/execution-plan.md` L0-F4-T3) is a second confirm request, not a second field here.
 *
 * `zod` is not a vendor SDK (`eslint.config.mjs`'s domain zone only forbids `@supabase/*`,
 * `@anthropic-ai/*` and the map/HTTP libraries) — `domain/extraction/schema.ts` already parses
 * untrusted LLM output the same way, so this file is not a new pattern.
 */
import { z } from 'zod';

/** One candidate the review screen confirmed, already carrying a `ResolvedPlace`'s identity —
 *  the shape `Candidate.resolution` produces for `status: 'resolved'` (`domain/types.ts`),
 *  flattened for the wire rather than round-tripped through the full `CandidateResolution` union:
 *  an `ambiguous` or `unresolved` candidate has no single place to confirm, so it never reaches
 *  this endpoint at all — the client filters before it ever serialises a request body. */
const ConfirmItemSchema = z.object({
  provider: z.enum(['overture', 'nominatim']),
  providerPlaceId: z.string().min(1).max(200),
  sourceDataset: z.enum(['overture-places', 'osm-nominatim']),
  name: z.string().min(1).max(200),
  /** The seven-value extraction vocabulary (`places/category-hint.ts`'s `ExtractedCategoryHint`)
   *  — this task's scope ruling, constraint 2. `null` when extraction carried no category hint. */
  category: z.enum(['restaurant', 'cafe', 'bar', 'bakery', 'attraction', 'shop', 'other']).nullable(),
  providerCategory: z.string().max(200).nullable(),
  addressLine: z.string().max(500).nullable(),
  locality: z.string().max(200).nullable(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, 'countryCode must be ISO-3166-1 alpha-2')
    .nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  resolutionScore: z.number().min(0).max(1).nullable(),
  note: z.string().max(2000).nullable(),
});

export const ConfirmImportRequestSchema = z.object({
  /** `null` = manual add; a uuid = the `sources.id` row this candidate came from. */
  sourceId: z.string().uuid().nullable(),
  items: z.array(ConfirmItemSchema).min(1).max(20),
});

export type ConfirmImportRequest = z.infer<typeof ConfirmImportRequestSchema>;
export type ConfirmItem = z.infer<typeof ConfirmItemSchema>;
