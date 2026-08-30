/**
 * The free-text half of the `＋` sheet's one field: **what you have already saved**.
 *
 * This is the reason typing costs nothing. Google Places is 100 lookups/day, so a keystroke may
 * never reach a provider — and it does not have to, because the far more common question at that
 * field is "where did I put that place I saved", which is answerable from the array `/map` already
 * holds. The provider is asked exactly once, on the explicit manual-add submit, by
 * `app/actions/manual-add.ts`.
 *
 * It adds no matching rule of its own. `filterPlaces` is the same projection and the same
 * token-AND substring match the map's search box uses (`domain/places/search.ts`), so a query that
 * finds a place in the list finds it here, and `categoryLocalityLine` is the same second line the
 * list rows print. Two surfaces answering one question two ways is how a search box starts looking
 * broken.
 */

import { filterPlaces } from '@/components/map/filter-places';
import type { MapPlace } from '@/components/map/types';
import { categoryLocalityLine } from '@/ui/place/category-display';
import type { AddSheetResult } from './add-sheet';

/**
 * How many matches the sheet offers. The pane is `max-h-[85dvh]` and scrolls, so this is not a
 * layout limit — it is that a field you are still typing into should show a shortlist, not your
 * whole library, and the manual-add row underneath has to stay reachable.
 */
export const LIBRARY_RESULT_LIMIT = 8;

/**
 * Saved places matching what is typed, best-effort ordered by whatever order the caller holds
 * (`getSpots` gives `created_at desc`, so ties break toward what you saved most recently).
 *
 * **A blank query matches nothing here**, which is the opposite of `filterBySearch`'s own rule and
 * is deliberate: that function returns everything for a blank query because it narrows a list that
 * is already on screen. This one *builds* a list, and `AddPlacePane` renders whatever it is given
 * — so returning the whole library would drop every saved place under an empty field.
 */
export function libraryResults(
  places: readonly MapPlace[],
  query: string,
  limit: number = LIBRARY_RESULT_LIMIT,
): readonly AddSheetResult[] {
  if (query.trim() === '') return [];

  return filterPlaces(places, query)
    .slice(0, Math.max(0, limit))
    .map((place) => ({
      id: place.id,
      name: place.name,
      secondary: secondaryLine(place),
    }));
}

/** `Category · City`, or `null` when we know neither — an uncategorised place with no locality
 *  gets a single-line row rather than an empty second line holding space open. */
function secondaryLine(place: MapPlace): string | null {
  const line = categoryLocalityLine(place.category, place.detail?.locality ?? null);
  return line === '' ? null : line;
}
