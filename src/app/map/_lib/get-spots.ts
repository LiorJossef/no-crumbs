import 'server-only';

/**
 * The `/map` route's one read query: the current user's `saved_places`, joined to `places` and
 * (for provenance) `sources`, mapped into `Spot[]` (`domain/places/spot.ts`). Colocated with the
 * route rather than under `app/_lib` — that folder is the shared composition root (the Supabase
 * server client, secrets, the rate limiter); this is a single page's data fetch, not shared
 * infrastructure, and inventing a shared "data layer" for the one query this slice needs would be
 * exactly the speculative abstraction the brief asks not to build.
 *
 * No `user_id = auth.uid()` filter here: RLS already scopes every one of `saved_places`,
 * `places` and `sources` to the caller (`0006`'s `_select_own` policies, `0005`'s
 * `places_select_if_saved`), so a client-side filter would be redundant, not a second safety net —
 * there is no existing query in this codebase that filters defensively on top of RLS, so this one
 * doesn't invent that pattern either.
 *
 * No Zod parsing at this boundary, unlike the import pipeline's rule for untrusted input (social
 * metadata, LLM output, provider responses): a row read back from our own Postgres, through RLS,
 * shaped by our own migrations, is not that class of input. What *is* validated is structural: the
 * column list below is exactly what `0006`/`0010`/`0015` grant `authenticated`, so a typo here
 * fails loudly (PostgREST 42501/42703) rather than silently.
 */

import { createClient } from '@/app/_lib/supabase/server';
import { productCategoryFor } from '@/domain/places/product-category';
import { signedUrlExpiry } from '@/domain/places/spot';
import type { SpotProvenance, SpotSource } from '@/domain/places/spot';
import type { EnrichedSpot } from '@/ui/place/enrichment';
import type { SourceDataset } from '@/domain/types';

const SAVED_PLACES_SELECT = `
  id,
  place_id,
  created_at,
  note,
  visit_state,
  visited_at,
  extracted_reason,
  display_name,
  category_override,
  source_url,
  source_thumbnail_url,
  tags,
  why_go,
  dishes,
  place:places (
    name,
    category,
    provider_category,
    lat,
    lng,
    address_line,
    locality,
    country_code,
    source_dataset,
    resolution_score
  ),
  saved_place_sources (
    added_at,
    source:sources (
      id,
      platform,
      canonical_url,
      author_handle,
      author_name,
      thumbnail_url
    )
  )
`;

/**
 * The raw shape of one row from `SAVED_PLACES_SELECT`. Hand-written rather than generated
 * (`supabase gen types` output does not exist in this repo yet) — a direct mirror of the select
 * above, which is the only thing that may drift it out of sync, and does so loudly (a missing
 * field is a TypeScript error at the mapping below, not a silent `any`).
 */
interface SavedPlaceRow {
  readonly id: string;
  /** `saved_places.place_id` — the shared identity row this save points at. Needed by anything
   *  that talks about the *place* rather than about this user's save of it; a collection stores
   *  place ids, so adding a saved place to one has to know this. */
  readonly place_id: string;
  /** Was in `.order()` and nowhere else, so "most recently saved first" was a claim no surface
   *  could show or check. */
  readonly created_at: string;
  readonly note: string | null;
  readonly visit_state: 'want_to_go' | 'visited';
  readonly visited_at: string | null;
  readonly extracted_reason: string | null;
  readonly display_name: string | null;
  readonly category_override: string | null;
  /** `saved_places.source_url` (migration `0016`) — the denormalized copy of the first linked
   *  source's `canonical_url`, so the common "TikTok link" read never needs the
   *  `saved_place_sources` → `sources` join below. Null for `origin = 'manual'` saves. */
  readonly source_url: string | null;
  /** `saved_places.source_thumbnail_url` (migration `0016`) — same first-source-only semantics as
   *  `source_url`. A signed, expiring TikTok CDN URL; this read path does not refresh it, it only
   *  passes through whatever was captured at save time, and `thumbnailOf` prefers the joined
   *  `sources.thumbnail_url` above precisely because that one *can* be refreshed. */
  readonly source_thumbnail_url: string | null;
  /** `saved_places.tags` (migration `0019`) — short free-form labels derived from the source post,
   *  stored already-normalised and lowercase. NULL is the only empty representation the column
   *  allows (`normalize_tag_list` collapses `'{}'` to NULL), which is why the mapping below turns
   *  it into `[]` once, here, rather than leaving every renderer to handle two empties. */
  readonly tags: readonly string[] | null;
  /** `saved_places.why_go` (migration `0019`) — the model's own one-sentence summary. Distinct
   *  from `extracted_reason` above, which is a verbatim caption substring: prose versus quote, and
   *  the UI keeps them apart. NULL whenever the caption said nothing worth paraphrasing, which is
   *  a normal outcome and the majority state today (nothing was backfilled). */
  readonly why_go: string | null;
  /** `saved_places.dishes` (migration `0019`) — items the post named, normalised for storage the
   *  same way tags are. */
  readonly dishes: readonly string[] | null;
  readonly place: {
    readonly name: string;
    /** The model's coarse guess from the caption. One of three claims about what this place is —
     *  see `domain/places/product-category.ts` for how they are ranked. */
    readonly category: string | null;
    /** Overture's or Google's own category string, in their snake_case (`ice_cream_shop`). Granted
     *  to `authenticated` by `0015`. The stronger of the two system claims, because it is the
     *  venue's own registration rather than an inference from a caption. */
    readonly provider_category: string | null;
    readonly lat: number;
    readonly lng: number;
    readonly address_line: string | null;
    readonly locality: string | null;
    readonly country_code: string | null;
    readonly source_dataset: string | null;
    readonly resolution_score: number | null;
  } | null;
  readonly saved_place_sources: readonly {
    readonly added_at: string;
    readonly source: {
      /** `sources.id`. In `0003`'s grant to `authenticated`, and the handle the thumbnail-refresh
       *  route takes — see `SpotSource.id`. */
      readonly id: string;
      readonly platform: 'tiktok';
      readonly canonical_url: string;
      readonly author_handle: string | null;
      readonly author_name: string | null;
      readonly thumbnail_url: string | null;
    } | null;
  }[];
}

/**
 * Every source linked to this save, earliest-linked first.
 *
 * **This function used to return one and drop the rest.** `saved_place_sources` is many-to-many
 * (`08 §3.6`) and `save_place` (migration `0034`) inserts a second link with
 * `on conflict do nothing`, so saving the same place from a second TikTok link keeps *both* rows —
 * nothing is ever lost in the database. What was lost was in this file: it took `linked[0]` and
 * mapped it into `Spot.source`, so the card showed the post that *first* justified the save and
 * every later one was invisible. Reported as "saving the same place from two TikToks keeps only
 * the latest" (round 3 §5.1); the direction in that sentence is the opposite of the mechanism,
 * which is why it is worth stating here.
 *
 * Earliest-first rather than newest-first because that order is a fact about the rows
 * (`added_at`), and the first entry stays exactly what `Spot.source` has always been — so nothing
 * that reads `source` changes meaning while `sources` grows a second reader.
 *
 * **The caller's own library only.** Showing this list to a collection peer would need a new
 * `saved_place_sources` read policy, which migration `0024` refused on purpose; `getSpots` reads
 * under `sps_select_own` and no other surface gets the array.
 */
function linkedSources(row: SavedPlaceRow): readonly SpotSource[] {
  return row.saved_place_sources
    .slice()
    .sort((a, b) => a.added_at.localeCompare(b.added_at))
    // `flatMap` rather than `filter().map()` so the null-source case narrows instead of needing a
    // cast. A link whose `sources` row did not resolve is dropped, not rendered as a hole.
    .flatMap((link) => (link.source === null ? [] : [toSpotSource(link.source)]));
}

function toSpotSource(source: {
  readonly id: string;
  readonly platform: 'tiktok';
  readonly canonical_url: string;
  readonly author_handle: string | null;
  readonly author_name: string | null;
  readonly thumbnail_url: string | null;
}): SpotSource {
  return {
    id: source.id,
    platform: source.platform,
    canonicalUrl: source.canonical_url,
    ...(source.author_handle !== null ? { authorHandle: source.author_handle } : {}),
    ...(source.author_name !== null ? { authorName: source.author_name } : {}),
    // `expiresAt` was a hard-coded `null` here — the single line that made `SpotSource.media`'s
    // typed expiry structurally unable to hold a value. It is parsed out of the URL's own
    // `x-expires` parameter now (`signedUrlExpiry`), so it is measured rather than derived and
    // needs no column. Still `null` for any URL that carries no such parameter, which means
    // "unknown", not "permanent".
    ...(source.thumbnail_url !== null
      ? {
          media: {
            kind: 'image' as const,
            url: source.thumbnail_url,
            expiresAt: signedUrlExpiry(source.thumbnail_url),
          },
        }
      : {}),
  };
}

function provenanceFor(row: SavedPlaceRow): SpotProvenance | undefined {
  const sourceDataset = row.place?.source_dataset ?? null;
  if (sourceDataset === null) return undefined;

  return {
    sourceDataset: sourceDataset as SourceDataset,
    resolutionScore: row.place?.resolution_score ?? null,
  };
}

/**
 * Everything `getSpots` returns that `Spot` does not declare yet.
 *
 * **Separate interface rather than a field on `Spot`, and deliberately so** — the same pattern, and
 * the same reason, as `ui/place/enrichment.ts`'s `SpotEnrichment`: `domain/places/spot.ts` is held
 * by another lane in this wave, and two agents editing one type at once is how a merge conflict
 * becomes a silently dropped field. When `Spot` grows `sources`, delete this and the intersection
 * below; every call site already reads the same name.
 *
 * Exported as a **type only**. This module is `server-only`, so a client component may
 * `import type { SpotSources }` (erased at compile time) but must never import a value from here.
 */
export interface SpotSources {
  /**
   * Every `sources` row linked to this save, earliest-linked first, and `sources[0]` is exactly
   * `Spot.source`. Empty for a manual save, which has no linked source at all.
   */
  readonly sources: readonly SpotSource[];
}

/** What one row of `getSpots` actually is: an `EnrichedSpot` that also carries every linked
 *  source, not only the earliest one. */
export type SpotWithSources = EnrichedSpot & SpotSources;

function toSpot(row: SavedPlaceRow): SpotWithSources {
  // The provenance invariant (`0006`) guarantees a place row exists for every saved place; `place`
  // is typed nullable above only because the join itself can't express that at the type level, not
  // because a null is expected here. Falling back to the row's own id keeps a broken row visible
  // (a blank pin) instead of throwing and blanking the whole map.
  const place = row.place;
  const sources = linkedSources(row);
  // `Spot.source` stays the earliest-linked one, unchanged, so every existing reader keeps the
  // meaning it was written against. `sources` is the widened view beside it, not a replacement.
  const source = sources[0];
  const provenance = provenanceFor(row);

  return {
    id: row.id,
    placeId: row.place_id,
    name: row.display_name ?? place?.name ?? row.id,
    displayNameOverride: row.display_name,
    canonicalName: place?.name ?? row.id,
    // `null` where none of the three claims resolved — see `productCategoryFor`. A `Spot` with no
    // category is a normal place: it draws the house-mint pin and its row prints its locality.
    category: productCategoryFor({
      override: row.category_override,
      providerCategory: place?.provider_category,
      extractedHint: place?.category,
    }),
    // Whether the user has spoken, not what they said — see `Spot.categoryIsOverridden`. A blank
    // string is not an override: `productCategoryFor` ignores it too, so the two agree.
    categoryIsOverridden: (row.category_override ?? '').trim() !== '',
    lat: place?.lat ?? 0,
    lng: place?.lng ?? 0,
    ...(place?.address_line ? { addressLine: place.address_line } : {}),
    ...(place?.locality ? { locality: place.locality } : {}),
    ...(place?.country_code ? { countryCode: place.country_code } : {}),
    ...(provenance ? { provenance } : {}),
    ...(source ? { source } : {}),
    // Unconditional, unlike `source` above: `[]` is the honest answer for a manual save, and an
    // absent key would make "this place has no linked source" indistinguishable from "this object
    // came from somewhere that does not know about sources".
    sources,
    ...(row.extracted_reason ? { reason: row.extracted_reason } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.source_thumbnail_url ? { sourceThumbnailUrl: row.source_thumbnail_url } : {}),
    visitState: row.visit_state,
    ...(row.visited_at ? { visitedAt: new Date(row.visited_at) } : {}),
    savedAt: new Date(row.created_at),
    // Extraction v2 (`0019`). Present unconditionally rather than spread-when-truthy like the
    // fields above: `[]`/`null` are the honest, common answers here (no backfill ran, so every row
    // saved before v2 has all three empty), and an absent key would make "this place has no tags"
    // indistinguishable from "this object came from somewhere that doesn't know about tags".
    tags: row.tags ?? [],
    whyGo: row.why_go,
    dishes: row.dishes ?? [],
  };
}

/** The current user's saved places, per `saved_places.created_at desc` (most recently saved
 *  first — the map's own camera-fit doesn't care about order, but the sheet/panel list does). */
export async function getSpots(): Promise<readonly SpotWithSources[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_places')
    .select(SAVED_PLACES_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Each place carries the city the resolver actually put it in. A rule that rewrote every
  // locality in a 50 km cluster to that cluster's most common spelling used to sit here; it read
  // as "this venue is in Tel Aviv-Yafo" for venues in Rishon LeZion and Ra'anana. See the
  // `area-label.ts` removal in this commit.
  return (data as unknown as SavedPlaceRow[]).map(toSpot);
}
