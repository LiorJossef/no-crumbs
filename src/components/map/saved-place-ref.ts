/**
 * Which `saved_places` row — if any — a pin gives a detail view permission to write to.
 *
 * A pin's `id` is whatever its host needs the click to hand back, and on `/collections/[id]` that
 * is a **collection item** id (`collection-client.tsx`'s `toMapPlace`). Deriving a saved-place id
 * from it aims `PlaceDetail`'s six mutations at a row the viewer does not own, so the identity is
 * carried explicitly on the port (`MapPlace.savedPlaceId`) and absent means `null` — the same
 * "no row" answer `collection-place-detail.tsx` already gives.
 *
 * Its own module rather than a closure in the surface so the rule is assertable without a WebGL
 * context, and so the other call sites that still build this object by hand can adopt it.
 */

import type { MapPlace } from './types';

/** Structurally the object `PlaceDetail`'s `savedPlace` prop takes. */
export interface SavedPlaceRef {
  readonly id: string;
  readonly visited: boolean;
  readonly visitedAt?: Date;
}

export function savedPlaceRef(
  place: Pick<MapPlace, 'savedPlaceId' | 'visited' | 'detail'>,
): SavedPlaceRef | null {
  if (!place.savedPlaceId) return null;

  return {
    id: place.savedPlaceId,
    visited: place.visited,
    // `visitedAt` rides on the joined `Spot`, not on the pin. Spread rather than an explicit
    // `undefined` under `exactOptionalPropertyTypes`: `0006`'s CHECK allows a marked row with no
    // timestamp, and absent is what that is.
    ...(place.detail?.visitedAt ? { visitedAt: place.detail.visitedAt } : {}),
  };
}
