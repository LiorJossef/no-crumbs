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
import type { Spot, SpotProvenance, SpotSource } from '@/domain/places/spot';
import type { SourceDataset } from '@/domain/types';

const SAVED_PLACES_SELECT = `
  id,
  note,
  visit_state,
  visited_at,
  extracted_reason,
  display_name,
  category_override,
  place:places (
    name,
    category,
    lat,
    lng,
    address_line,
    locality,
    source_dataset,
    resolution_score
  ),
  saved_place_sources (
    added_at,
    source:sources (
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
  readonly note: string | null;
  readonly visit_state: 'want_to_go' | 'visited';
  readonly visited_at: string | null;
  readonly extracted_reason: string | null;
  readonly display_name: string | null;
  readonly category_override: string | null;
  readonly place: {
    readonly name: string;
    readonly category: string | null;
    readonly lat: number;
    readonly lng: number;
    readonly address_line: string | null;
    readonly locality: string | null;
    readonly source_dataset: string | null;
    readonly resolution_score: number | null;
  } | null;
  readonly saved_place_sources: readonly {
    readonly added_at: string;
    readonly source: {
      readonly platform: 'tiktok';
      readonly canonical_url: string;
      readonly author_handle: string | null;
      readonly author_name: string | null;
      readonly thumbnail_url: string | null;
    } | null;
  }[];
}

/**
 * Picks the source to show. `saved_place_sources` is many-to-many (`08 §3.6`); this slice renders
 * one, so it takes the earliest-linked one — the post that first justified the save — rather than
 * an arbitrary array order the join happens to return.
 */
function earliestSource(row: SavedPlaceRow): SpotSource | undefined {
  const linked = row.saved_place_sources
    .filter((link) => link.source !== null)
    .slice()
    .sort((a, b) => a.added_at.localeCompare(b.added_at));
  const source = linked[0]?.source;
  if (!source) return undefined;

  return {
    platform: source.platform,
    canonicalUrl: source.canonical_url,
    ...(source.author_handle !== null ? { authorHandle: source.author_handle } : {}),
    ...(source.author_name !== null ? { authorName: source.author_name } : {}),
    ...(source.thumbnail_url !== null
      ? { media: { kind: 'image' as const, url: source.thumbnail_url, expiresAt: null } }
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

function toSpot(row: SavedPlaceRow): Spot {
  // The provenance invariant (`0006`) guarantees a place row exists for every saved place; `place`
  // is typed nullable above only because the join itself can't express that at the type level, not
  // because a null is expected here. Falling back to the row's own id keeps a broken row visible
  // (a blank pin) instead of throwing and blanking the whole map.
  const place = row.place;
  const source = earliestSource(row);
  const provenance = provenanceFor(row);

  return {
    id: row.id,
    name: row.display_name ?? place?.name ?? row.id,
    category: row.category_override ?? place?.category ?? null,
    lat: place?.lat ?? 0,
    lng: place?.lng ?? 0,
    ...(place?.address_line ? { addressLine: place.address_line } : {}),
    ...(place?.locality ? { locality: place.locality } : {}),
    ...(provenance ? { provenance } : {}),
    ...(source ? { source } : {}),
    ...(row.extracted_reason ? { reason: row.extracted_reason } : {}),
    ...(row.note ? { note: row.note } : {}),
    visitState: row.visit_state,
    ...(row.visited_at ? { visitedAt: new Date(row.visited_at) } : {}),
  };
}

/** The current user's saved places, per `saved_places.created_at desc` (most recently saved
 *  first — the map's own camera-fit doesn't care about order, but the sheet/panel list does). */
export async function getSpots(): Promise<readonly Spot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_places')
    .select(SAVED_PLACES_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data as unknown as SavedPlaceRow[]).map(toSpot);
}
