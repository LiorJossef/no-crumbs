/**
 * The map's query rect as pure geometry, and nothing else.
 *
 * ## What this file used to be, and why it is now three functions
 *
 * It held the rule "the list is exactly what is inside the viewport" — the header string, the
 * `areaLabel` confidence rule, and a nearest-the-centre sort. The owner used that interaction and
 * rejected it (`docs/current-state.md` §0.1b, and again on 2026-08-28): the list changed
 * continuously as the map moved, including when nobody had moved it, so browsing the map destroyed
 * the list you were browsing.
 *
 * Scope is now a **place cluster**, not a rectangle — `ui/place/active-area.ts` owns that, including
 * the header copy and the area label. What survives here is the geometry that decision still needs:
 * whether a pin is inside a rect, and where the middle of a rect is. Both are consulted **only** on
 * a settled user gesture, to answer "which of your areas is this camera over"; neither is allowed to
 * decide list membership any more.
 *
 * Pure: no React, no DOM, no MapLibre.
 */

import type { GeoPoint } from '@/domain/places/clusters';

/**
 * The rectangle the map reports as "what is on screen" — field-for-field the `LatLngBoundsHint` the
 * map surface speaks, redeclared here so this file never imports from `components/`.
 */
export interface ViewportBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

/**
 * Whether a place's pin anchor is inside the query rect.
 *
 * The **anchor point**, not the icon's bounding box and not its label: the anchor is the only thing
 * stable across zoom levels, so it is the only rule that gives the same answer twice.
 *
 * Longitude is compared with a wrap branch rather than a plain `>=`/`<=` pair. The surface reports
 * unwrapped longitudes, so a viewport straddling the antimeridian arrives with `east < west`; the
 * plain comparison would then match nothing. Crossing 180° is not a supported *feature* — no saved
 * place is anywhere near it — but it must not silently answer "no pins anywhere", which is the
 * difference between an unsupported case and a bug.
 *
 * This lives here rather than using MapLibre's own `LngLatBounds.contains()` because the page client
 * is on the product side of the map port and must not import a vendor SDK.
 */
export function withinBounds(point: GeoPoint, bounds: ViewportBounds): boolean {
  if (point.lat < bounds.south || point.lat > bounds.north) return false;
  return bounds.west <= bounds.east
    ? point.lng >= bounds.west && point.lng <= bounds.east
    : point.lng >= bounds.west || point.lng <= bounds.east;
}

/** The centre of a rect. Longitude is averaged through the same wrap branch as `withinBounds`, so a
 *  straddling viewport does not put its centre on the far side of the globe. */
export function boundsCentre(bounds: ViewportBounds): GeoPoint {
  const lat = (bounds.north + bounds.south) / 2;
  if (bounds.west <= bounds.east) return { lat, lng: (bounds.west + bounds.east) / 2 };
  const lng = (bounds.west + bounds.east + 360) / 2;
  return { lat, lng: lng > 180 ? lng - 360 : lng };
}
