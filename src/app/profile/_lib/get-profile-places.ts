import 'server-only';

import { createClient } from '@/app/_lib/supabase/server';
import { productCategoryFor } from '@/domain/places/product-category';
import type { ProfileCreator, ProfilePlace } from './profile-stats';

/**
 * The facts `/profile` counts, and nothing else.
 *
 * Deliberately **not** `getSpots()`. That query exists to render the map and the list, so it pulls
 * tags, dishes, `why_go`, the note, both thumbnail columns and the provenance fields; this page
 * needs a coordinate, a city string to label a cluster with, a country, a category, a visit state
 * and a creator handle. `/collections` already sets the precedent of a page owning its own narrow
 * read (`select('id', { count: 'exact', head: true })`) rather than borrowing another route's read
 * model, and borrowing it here would quietly make `/map`'s query shared infrastructure that two
 * pages must agree on.
 *
 * No `user_id` filter: RLS scopes `saved_places`, `places` and `sources` to the caller already
 * (`0006`, `0005`), and no query in this codebase filters defensively on top of it.
 */
const SELECT = `
  id,
  visit_state,
  category_override,
  place:places (
    lat,
    lng,
    locality,
    country_code,
    category,
    provider_category
  ),
  saved_place_sources (
    added_at,
    source:sources (
      author_handle,
      author_name
    )
  )
`;

interface Row {
  readonly id: string;
  readonly visit_state: 'want_to_go' | 'visited';
  readonly category_override: string | null;
  readonly place: {
    readonly lat: number;
    readonly lng: number;
    readonly locality: string | null;
    readonly country_code: string | null;
    readonly category: string | null;
    readonly provider_category: string | null;
  } | null;
  readonly saved_place_sources: readonly {
    readonly added_at: string;
    readonly source: {
      readonly author_handle: string | null;
      readonly author_name: string | null;
    } | null;
  }[];
}

/**
 * The same rule `getSpots` applies: `saved_place_sources` is many-to-many, and the source that
 * counts is the earliest-linked one — the post that first justified the save — not whichever order
 * the join returned. A place counted once for two creators would make the creator counts sum to
 * more than the library.
 */
function earliestCreator(row: Row): ProfileCreator | null {
  const linked = row.saved_place_sources
    .filter((link) => link.source !== null)
    .slice()
    .sort((a, b) => a.added_at.localeCompare(b.added_at));
  const source = linked[0]?.source;
  if (!source) return null;
  return { handle: source.author_handle, name: source.author_name };
}

export async function getProfilePlaces(): Promise<readonly ProfilePlace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('saved_places').select(SELECT);

  if (error) throw error;

  const rows = data as unknown as readonly Row[];

  // `place` is typed nullable because the join cannot express the provenance invariant (`0006`
  // guarantees a place row for every saved place), not because a null is expected. A row that
  // somehow has none still counts as saved; `NaN` keeps it out of the clustering by way of
  // `isValidPoint`, which is the honest answer for a place with no coordinate.
  return rows.map((row) => ({
    id: row.id,
    lat: row.place?.lat ?? Number.NaN,
    lng: row.place?.lng ?? Number.NaN,
    locality: row.place?.locality ?? null,
    countryCode: row.place?.country_code ?? null,
    // Resolved here, at the one boundary that knows the three stored claims exist, exactly as
    // `getSpots` does — so `/profile`'s categories are the same categories the filter bar counts.
    category: productCategoryFor({
      override: row.category_override,
      providerCategory: row.place?.provider_category,
      extractedHint: row.place?.category,
    }),
    visitState: row.visit_state,
    creator: earliestCreator(row),
  }));
}
