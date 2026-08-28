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
import { isSameTag } from '@/ui/place/tag-filter';
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

/**
 * The user's saved pins narrowed to the ones carrying one tag.
 *
 * Applied **before** `filterPlaces` by the page client, so the two compose as AND: the tag narrows
 * the library, the search box narrows within it. Returns the input array itself for a `null` tag,
 * so no filter costs nothing downstream — the same identity guarantee `filterBySearch` gives for a
 * blank query, and for the same reason (React memoisation upstream must not churn on a filter
 * nobody set).
 *
 * Tags are read through the same `toSearchablePlace` projection the search uses, so a place is
 * "tagged X" for the chip filter exactly when it is tagged X for the search — one projection, one
 * answer, no chance of a pin the list agrees with and the filter does not.
 *
 * Matching is `isSameTag` (`tagKey` equality), never substring: `wine` must not match a place
 * tagged `natural wine`. That is what makes a chip mean the label printed on it rather than
 * "places whose text contains this word", which is what the search box is for.
 */
export function filterByTag(
  places: readonly MapPlace[],
  tag: string | null,
): readonly MapPlace[] {
  if (tag === null || tag.trim() === '') return places;
  return places.filter((place) =>
    (toSearchablePlace(place).tags ?? []).some((candidate) => isSameTag(candidate, tag)),
  );
}

/**
 * The user's saved pins narrowed to the ones they have **not** been to yet.
 *
 * A third filter dimension beside the tag chip and the search box, composed as AND by the page
 * client. Returns the input array itself when the filter is off, so an untouched control costs
 * nothing downstream — the same identity guarantee `filterPlaces` and `filterByTag` give, and for
 * the same reason (React memoisation upstream must not churn on a filter nobody set).
 *
 * `visited` is read straight off the port rather than through `toSearchablePlace`, and deliberately
 * so: this is not a text match and it must never become one. "Been" is a fact about the user's own
 * row, not a word that might appear in a note — a place whose note reads "been meaning to try this"
 * is precisely the place this filter has to keep.
 *
 * There is intentionally no inverse. `Been` as a filter would be a second control answering a
 * question nobody asked ("what have I already done?"), and the ruling that motivated this feature
 * is explicit that the capability is a boolean and *one* filter.
 */
export function filterByVisit(
  places: readonly MapPlace[],
  notBeenOnly: boolean,
): readonly MapPlace[] {
  if (!notBeenOnly) return places;
  return places.filter((place) => !place.visited);
}
