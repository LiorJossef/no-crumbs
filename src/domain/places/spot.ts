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
import type { ProductCategory } from './product-category';

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

/**
 * What a `places` row says: the facts about a place that everyone who can see it shares.
 *
 * It is split out because two surfaces render the same place from different rows. `/map` reads a
 * `Spot` — the caller's own `saved_places` row joined to the place. A collection item points at the
 * `places` row **and nothing else**: a collaborator is granted the shared identity and none of the
 * adder's overlay. Handing the detail view a `Spot` on that path would mean inventing a
 * `saved_places` id for a row that does not exist, which is the "convert uncertainty into
 * certainty" failure `working-agreement.md` §4 forbids.
 *
 * `addressLine`/`locality` take `null` as well as absent here, unlike on `Spot`: a `places` read
 * that selects the columns and finds them NULL says `null`, and making every such caller launder
 * that into `undefined` buys nothing.
 */
export interface PlaceSharedFacts {
  /** `places.id`. On a `Spot` this is `saved_places.place_id`; in a collection it is
   *  `collection_items.place_id`. It is never a saved-place id and never a collection-item id. */
  readonly placeId: string;
  readonly addressLine?: string | null;
  readonly locality?: string | null;
}

/**
 * The shared facts, plus everything the **caller's own save** of the place can add — each field
 * optional, because a viewer who owns no `saved_places` row for it has none of them.
 *
 * This is the type a detail view reads. Optionality is doing real work: every block that renders
 * one of these fields already renders only when the field is present, so a caller that passes
 * shared facts alone gets a screen with no private field on it **by construction**, rather than by
 * a `readOnly` flag somebody has to remember to pass. `SharedOnlyPlaceFacts` is how a caller says
 * it is on that path and has the compiler hold it to it.
 */
export interface PlaceDetailFacts extends PlaceSharedFacts {
  readonly displayNameOverride?: string | null;
  readonly canonicalName?: string;
  readonly categoryIsOverridden?: boolean;
  readonly provenance?: SpotProvenance;
  readonly source?: SpotSource;
  readonly reason?: string;
  readonly note?: string;
  readonly sourceUrl?: string;
  readonly sourceThumbnailUrl?: string;
  readonly savedAt?: Date;
}

/**
 * A place as seen by somebody who owns no save of it — structurally `PlaceSharedFacts`, with every
 * overlay key pinned to `never` so that adding one is a type error rather than a privacy incident.
 *
 * Assignable to `PlaceDetailFacts` (`never` is assignable to everything), so the same detail view
 * takes either.
 */
export type SharedOnlyPlaceFacts = PlaceSharedFacts & {
  readonly [K in Exclude<keyof PlaceDetailFacts, keyof PlaceSharedFacts>]?: never;
};

/** One saved place, read-side. See this file's header for what each optional field means. */
export interface Spot extends PlaceDetailFacts {
  readonly id: string;
  /** `saved_places.place_id` — the shared `places` row behind this save. Distinct from `id`, which
   *  is *this user's* save of it, and the one a collection stores: a collection is a set of places,
   *  not a set of somebody's library rows. */
  readonly placeId: string;
  /** `saved_places.display_name`, falling back to `places.name` — the per-user overlay `08 §2.2`
   *  rule 3 describes. */
  readonly name: string;
  /** The stored override itself, or `null` when this place shows its real name. Exposed — unlike
   *  `category_override`, which deliberately is not — because renaming is a *text* edit: the field
   *  has to prefill with what the user typed last time, and "clear this" has to be distinguishable
   *  from "type the canonical name in by hand". */
  readonly displayNameOverride: string | null;
  /** `places.name`, so the rename control can offer to go back to it by name rather than by an
   *  unlabelled "reset". */
  readonly canonicalName: string;
  /** The product's own category, already reconciled from the user's override, the provider's
   *  category and the model's hint by `productCategoryFor` — see `product-category.ts` for the
   *  ranking and why it is not simply `category_override ?? places.category`.
   *
   *  Closed, and **nullable since the 2026-08-29 taxonomy**. It was non-nullable, on the argument
   *  that every renderer downstream needs a total answer — which is true and is now the renderers'
   *  job rather than a reason to invent a category. The old totality was bought with `other`, a
   *  value that rendered as "Place" and meant only that we had declined to say; a museum, a butcher
   *  and a caption too vague to read are not one category. `null` says so, and each renderer has a
   *  correct answer for it: no word in the line under the name, the house mint on the pin, no chip
   *  in the filter row. The read path is still the one place that has all three claims in hand, so
   *  no renderer re-derives it differently. */
  readonly category: ProductCategory | null;
  /** Whether `category` came from `saved_places.category_override` rather than from the provider or
   *  the model. The raw override string is deliberately **not** exposed: the only thing a surface
   *  needs from it is whether the user has spoken, which is what tells an editor to offer "back to
   *  automatic" rather than a control that cannot be undone. */
  readonly categoryIsOverridden: boolean;
  readonly lat: number;
  readonly lng: number;
  readonly addressLine?: string;
  readonly locality?: string;
  /**
   * ISO 3166-1 alpha-2, as stored. Absent where the column is NULL, which is real and common —
   * every row imported before `toCountryCode` landed carries one.
   *
   * Read by the library's country level (`ui/place/library-summary.ts`), and only ever through
   * `areaCountry`'s plurality rule: a place with no country of its own still lands in the country
   * of the 50 km area it sits in, so a NULL here loses nobody from the world-zoom band
   * (`docs/ux-library-at-scale.md` §2.5).
   */
  readonly countryCode?: string;
  readonly provenance?: SpotProvenance;
  readonly source?: SpotSource;
  /** `saved_places.extracted_reason` — system-derived, never user-writable (`0015`). */
  readonly reason?: string;
  /** `saved_places.note` — the user's own words. Deliberately never merged with `reason`: `0015`'s
   *  column comment is explicit that the two answer different questions. */
  readonly note?: string;
  /** `saved_places.source_url` (migration `0016`) — the denormalized copy of the first linked
   *  source's `canonical_url`, cheap to read without the `sources` join `source.canonicalUrl`
   *  requires. Prefer this for "open the TikTok" links; `source?.canonicalUrl` remains the
   *  fallback for a save made before `0016` shipped (never backfilled) or a `sources` row without
   *  this cache populated for any other reason. Absent for a manual save, same as `source` itself. */
  readonly sourceUrl?: string;
  /** `saved_places.source_thumbnail_url` (migration `0016`), same first-source-only/denormalized
   *  relationship to `source?.media` that `sourceUrl` has to `source?.canonicalUrl` — a signed,
   *  expiring TikTok CDN URL (`0016`'s column comment on `sources.thumbnail_url`) captured once at
   *  save time and never refreshed here. */
  readonly sourceThumbnailUrl?: string;
  readonly visitState: VisitState;
  readonly visitedAt?: Date;
  /** `saved_places.created_at`. The library is ordered most-recently-saved-first and said so
   *  nowhere, which made the order both invisible and unverifiable; the detail view now says it. */
  readonly savedAt: Date;
}
