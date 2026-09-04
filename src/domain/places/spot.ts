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
  /** `sources.id`. Granted to `authenticated` by `0003`'s column grant, and read here for exactly
   *  one reason: it is the handle `POST /api/sources/thumbnail` takes when a thumbnail fails to
   *  load. Without it the client can see a dead picture and has no way to name what died — which
   *  is why "nothing in `src/` ever re-calls oEmbed for an existing source" was structurally true
   *  rather than merely unbuilt. Never rendered. */
  readonly id: string;
  /** The only value `sources.platform`'s CHECK allows today (migration `0003`). */
  readonly platform: 'tiktok';
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly authorName?: string;
  /** `sources.thumbnail_url`, reshaped into the existing `MediaRef` port rather than a new one —
   *  `kind: 'image'` (it is a thumbnail, never the source video itself).
   *
   *  **`expiresAt` is a real timestamp now, and it is read out of the URL itself.** It used to be
   *  a hard-coded `null` with a comment saying no expiry was stored, which made a typed field
   *  structurally incapable of ever being anything but null. It was never true that nothing was
   *  stored: TikTok signs this CDN URL and puts the signature's own deadline in its query string
   *  as `x-expires`, a Unix timestamp in seconds. `signedUrlExpiry` parses it. Nothing is
   *  inferred, nothing is derived from a window, and no column was added.
   *
   *  The window that comes out of it is **~47 hours, not ~6 months**. Measured 2026-08-31 against
   *  all three real TikTok rows in the local database: fetched 16:48 → expires 2026-09-02 16:00;
   *  fetched 18:31 and 18:40 → both expire 2026-09-02 18:00. `0003`'s column comment ("Signed,
   *  ~6-month-expiring CDN URL (VERIFIED)") and `0016`'s restatement of it are wrong by roughly
   *  90×, and every comment in this repo that repeats the six-month figure inherits the error.
   *  Those two are migration files and not this lane's to edit; this is the correction, and it is
   *  measured rather than assumed.
   *
   *  `null` where the URL carries no `x-expires` — a manual save, a non-TikTok URL, or a signing
   *  scheme that changes. `null` means "unknown", never "does not expire". */
  readonly media?: MediaRef;
}

/**
 * The deadline a signed CDN URL carries in its own query string, or `null` when it carries none.
 *
 * TikTok's thumbnail URLs look like
 * `https://p16-common-sign.tiktokcdn.com/...~tplv-tiktokx-origin.image?dr=…&x-expires=1788364800&x-signature=…`,
 * and `x-expires` is seconds since the epoch. This is the one expiry TikTok actually *tells* us,
 * as opposed to `cache-control: max-age=31536000`, which the CDN also sends and which is a caching
 * instruction about an asset rather than a deadline on a signature — reading the second as the
 * first is how a URL that dies in two days looks like one that lives for a year.
 *
 * Total and non-throwing by construction: this is fed a `text` column that nothing constrains, so
 * a malformed URL, an absent parameter, a non-numeric value and an implausible one all return
 * `null` rather than a `Date` nobody can trust. The plausibility window is deliberately wide (the
 * year 2000 to the year 2100) — it is there to reject `0`, `NaN`-adjacent junk and millisecond
 * values pasted into a seconds field, not to second-guess a real timestamp.
 *
 * It does not, and must not, decide whether to *render* the image. See `RowMedia` in
 * `components/sheet/place-sheet.tsx`: a past `expiresAt` is not permission to hide a picture that
 * might still load, because if this parse is ever wrong the cost of being reactive is one failed
 * request and the cost of being proactive is a blank library.
 */
export function signedUrlExpiry(url: string): Date | null {
  let seconds: string | null;
  try {
    seconds = new URL(url).searchParams.get('x-expires');
  } catch {
    // `text` column, third-party value: not a URL is an ordinary answer, not an exception.
    return null;
  }
  if (seconds === null || !/^[0-9]{1,12}$/.test(seconds)) return null;

  const ms = Number(seconds) * 1000;
  if (ms < PLAUSIBLE_EPOCH_MS_MIN || ms > PLAUSIBLE_EPOCH_MS_MAX) return null;
  return new Date(ms);
}

/** 2000-01-01 and 2100-01-01. See `signedUrlExpiry` for why the window is this loose. */
const PLAUSIBLE_EPOCH_MS_MIN = 946_684_800_000;
const PLAUSIBLE_EPOCH_MS_MAX = 4_102_444_800_000;

/** One thumbnail to render, with everything needed to ask for a fresh one when it dies. */
export interface ThumbnailRef {
  readonly url: string;
  /** `sources.id`, or `null` when this URL came only from the frozen denormalized copy and there
   *  is therefore no source row to re-fetch. A `null` here is what makes a thumbnail
   *  unrefreshable, and it is honest: there is nothing to ask about. */
  readonly sourceId: string | null;
  /** From `signedUrlExpiry`. `null` = unknown. */
  readonly expiresAt: Date | null;
}

/**
 * Which of the two stored thumbnail URLs a surface should render — **the joined one first**.
 *
 * There are two copies of this value and they age differently. `sources.thumbnail_url` is the
 * shared cache row, and it is the one a refresh can write to. `saved_places.source_thumbnail_url`
 * is `0016`'s denormalized copy, filled once by `apply_saved_place_source_link` through a
 * `coalesce` that makes every later call a no-op — `0016`'s own column comment calls the staleness
 * a "KNOWN LIMITATION, accepted as out of scope here" and leaves refreshing it "for a future task".
 *
 * The detail view used to prefer the frozen copy, on the reasonable argument that it survives a
 * join that did not resolve. Preferring the live row instead keeps that fallback exactly — the
 * frozen copy is still what answers when there is no joined source — and buys the thing the
 * ordering was costing: a refreshed `sources.thumbnail_url` is visible on the next load. Without
 * the flip, refreshing the shared row would repair a value no screen reads, and every page load
 * would re-discover the same dead URL and spend another upstream call on it.
 *
 * This is also why `0016`'s cache is not written by the refresh path at all: with the live row
 * preferred, there is nothing to keep in sync, and refreshing a display cache would mean a
 * user-triggered write to `saved_places` that only a migration could do properly.
 */
export function thumbnailOf(facts: PlaceDetailFacts | undefined): ThumbnailRef | null {
  const source = facts?.source;
  if (source?.media?.url) {
    return { url: source.media.url, sourceId: source.id, expiresAt: source.media.expiresAt };
  }
  if (facts?.sourceThumbnailUrl) {
    // No `sourceId`: this branch is reached precisely when there is no joined `sources` row, and
    // the refresh route takes a source id, never a URL. Unrefreshable, and correctly so.
    return { url: facts.sourceThumbnailUrl, sourceId: null, expiresAt: null };
  }
  return null;
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
  /** Every linked `sources` row, earliest first. `sources[0] === source`. Own library only —
   *  a collection peer never receives this (`0024` refused the read policy). */
  readonly sources?: readonly SpotSource[];
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
   *  expiring TikTok CDN URL captured once at save time and never refreshed.
   *
   *  **Read second, not first**, and only when there is no joined source at all: see
   *  `thumbnailOf`. `0016`'s comment puts the expiry at ~6 months, inherited from `0003`; measured
   *  2026-08-31 it is **~47 hours**, which is what turns "captured once and never refreshed" from
   *  a slow decay into the normal state of every row older than two days. */
  readonly sourceThumbnailUrl?: string;
  readonly visitState: VisitState;
  readonly visitedAt?: Date;
  /** `saved_places.created_at`. The library is ordered most-recently-saved-first and said so
   *  nowhere, which made the order both invisible and unverifiable; the detail view now says it. */
  readonly savedAt: Date;
}
