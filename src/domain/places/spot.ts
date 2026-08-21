/**
 * `Spot` — one saved place as the `/map` route's read path needs it: `saved_places` joined to
 * `places` and (optionally) `sources`, migration `0015`. This is deliberately not
 * `SavedRecommendation` (`types.ts`'s header still reserves that name for the save/import path,
 * which this slice does not build) and it does not live in `types.ts` itself: it is not vocabulary
 * every layer shares, only what one read query and its two renderers (the map pin, the sheet/panel
 * detail) need, which is exactly why `MockSavedPlace` before it lived here too.
 *
 * Field presence follows the schema, not a house style: `addressLine`/`locality`/`provenance`/
 * `source`/`reason`/`note`/`visitedAt` are `?` (may be genuinely absent from the row) rather than
 * `| null` (the `types.ts` convention for a shared, required-but-nullable column) — this type is
 * scaffolding for one query, not the closed vocabulary that convention protects.
 *
 * `source` is optional even though `08 §3.6`'s provenance invariant makes an import-origin save
 * without a linked `sources` row effectively impossible today: a manual save
 * (`saved_places.origin = 'manual'`) is not required to have one, and this type does not assume the
 * invariant on the query's behalf. `getSpots` (`app/map/_lib/get-spots.ts`) is the one place that
 * reads the join; nothing here re-derives what it already decided.
 */

import type { MediaRef, SourceDataset } from '../types';

/** `saved_places.visit_state`'s two values, verbatim (migration `0006`'s CHECK). */
export type VisitState = 'want_to_go' | 'visited';

/**
 * Attribution/quality signal from `places`, granted to `authenticated` by migration `0015`.
 * Present only when `places.source_dataset` is set — `06 §11 Q2`'s provenance mark is written at
 * resolve time, and a place resolved before that write path existed (none should exist, but this
 * type does not assume it) would have neither.
 */
export interface SpotProvenance {
  readonly sourceDataset: SourceDataset;
  /** `places.resolution_score` — diagnostic in `0010`'s own words, shown here rather than acted on. */
  readonly resolutionScore: number | null;
}

/**
 * The one `sources` row this slice renders per `Spot` — "which TikTok made me save this?"
 * (charter invariant 3). A saved place may have more than one linked source
 * (`saved_place_sources` is many-to-many, `08 §3.6`); this slice picks the earliest-added one
 * (`getSpots`'s job) rather than modelling a list, because nothing in this read-only slice
 * renders more than one. A future multi-source surface widens this field to an array — not a
 * reason to model it today.
 */
export interface SpotSource {
  /** The only value `sources.platform`'s CHECK allows today (migration `0003`). */
  readonly platform: 'tiktok';
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly authorName?: string;
  /** `sources.thumbnail_url`, reshaped into the existing `MediaRef` port rather than a new one —
   *  `kind: 'image'` (it is a thumbnail, never the source video itself) and `expiresAt: null`:
   *  the column is a signed URL with a known *expiry window* (`~6 months`, `03` §comment) but no
   *  expiry *timestamp* is stored, so there is nothing truthful to put there yet. */
  readonly media?: MediaRef;
}

/** One saved place, read-side. See this file's header for what each optional field means. */
export interface Spot {
  readonly id: string;
  /** `saved_places.display_name`, falling back to `places.name` — the per-user overlay `08 §2.2`
   *  rule 3 describes. */
  readonly name: string;
  /** `saved_places.category_override`, falling back to `places.category`. Both are free `text` in
   *  the database (no CHECK ties either to a closed taxonomy today, `0005`/`0011`'s comments), so
   *  this is `string | null`, not the closed `ExtractedCategoryHint` the map's pin glyph uses —
   *  reconciling the two is the map-pin renderer's job, not this type's. */
  readonly category: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly addressLine?: string;
  readonly locality?: string;
  readonly provenance?: SpotProvenance;
  readonly source?: SpotSource;
  /** `saved_places.extracted_reason` — system-derived, never user-writable (`0015`). */
  readonly reason?: string;
  /** `saved_places.note` — the user's own words. Deliberately never merged with `reason`: `0015`'s
   *  column comment is explicit that the two answer different questions. */
  readonly note?: string;
  readonly visitState: VisitState;
  readonly visitedAt?: Date;
}
