import type { MapPlace } from '@/components/map/types';
import type { Spot } from '@/domain/places/spot';

/**
 * `Spot` (the richer read model, `domain/places/spot.ts`) adapted to the map surface's port.
 *
 * A library module rather than a function inside a route file, because four routes now need the
 * same array: `/map` draws it, `/collections/[id]` gives it to its picker, and `/collections` and
 * `/profile` hand it to the `＋` menu so its search can answer "you already saved this". Two of
 * those were copies of each other; a third and fourth copy is how the create menu's search comes
 * to disagree with the map's about the same place.
 *
 * The full `Spot` rides under `detail` because that is where the searchable fields live —
 * `filter-places.ts` reads `locality`, `tags` and `dishes` off it — so a leaner projection would
 * silently narrow what the search can find.
 */
export function toMapPlace(spot: Spot): MapPlace {
  return {
    id: spot.id,
    name: spot.name,
    category: spot.category,
    lat: spot.lat,
    lng: spot.lng,
    note: spot.note ?? '',
    sourceUrl: spot.sourceUrl ?? spot.source?.canonicalUrl,
    // `visit_state` flattened at the one boundary that knows the column exists. The port carries a
    // boolean, not the stored value, so the schema's `'visited'` / `'want_to_go'` strings stop here
    // and cannot reach a component that might print one.
    visited: spot.visitState === 'visited',
    // These pins *are* the viewer's own saved rows, so a detail opened from one may write to it.
    // Stated rather than inferred from `id`: a surface whose pins are not saved rows omits this and
    // gets a read-only detail (`components/map/saved-place-ref.ts`).
    savedPlaceId: spot.id,
    detail: spot,
  };
}
