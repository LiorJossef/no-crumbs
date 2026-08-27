/**
 * The one place that says how a **map pin** projects onto the domain's searchable shape
 * (`domain/places/search.ts`), so the mobile sheet and the desktop panel filter identically by
 * construction rather than by two developers remembering to.
 *
 * `locality` comes off `detail` (the full `Spot` a `MapPlace` carries for the detail view) because
 * `MapPlace` itself is the map surface's port and deliberately flat — the pin renderer has no use
 * for a city name. A `MapPlace` built without a `Spot` (tests, a mock surface) simply has no
 * locality to search, which is the right answer rather than a reason to widen the port.
 */

import { filterBySearch, type SearchablePlace } from '@/domain/places/search';
import { enrichmentOf } from '@/ui/place/enrichment';
import type { MapPlace } from './types';

export function toSearchablePlace(place: MapPlace): SearchablePlace {
  // `tags` and `dishes` come off `detail` for the same reason `locality` does, and are read through
  // `enrichmentOf` rather than off the spot directly: that function is the single place that knows
  // `getSpots` populates three columns `Spot` does not yet declare, and it collapses a missing
  // field to `[]` so nothing downstream has to know there were two ways to say "nothing here".
  const enrichment = enrichmentOf(place.detail);
  return {
    name: place.name,
    category: place.category,
    locality: place.detail?.locality ?? null,
    note: place.note,
    tags: enrichment.tags,
    dishes: enrichment.dishes,
  };
}

/** The user's saved pins narrowed by what they typed. Returns the input array itself when the
 *  query is blank, so an untouched search field costs nothing downstream. */
export function filterPlaces(
  places: readonly MapPlace[],
  query: string,
): readonly MapPlace[] {
  return filterBySearch(places, query, toSearchablePlace);
}
