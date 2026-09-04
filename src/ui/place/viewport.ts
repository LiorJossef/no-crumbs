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
 * IANA time zone → the centre of a metro area, for the zero-places camera and for nothing else.
 *
 * **It is a display default, never a claim about where the user is.** Nothing in the product ever
 * names this city, nothing stores it, nothing sends it anywhere, and one saved place retires it
 * forever. `ux-map-is-the-query.md` §5 fixed the mechanism and it is the whole reason this table
 * exists rather than a lookup: a regional map framed **from the browser's own time zone**, with no
 * permission prompt, no IP geolocation and no `navigator.geolocation` call. The geolocation prompt
 * is a deliberate tap in `L1-F11` and must never become a page load.
 *
 * Thirteen zones, chosen for coverage rather than completeness — an unknown zone is not a failure,
 * it is `EMPTY_LIBRARY_BOUNDS`. Adding a row is a one-line change with no other consequence.
 */
export const ZERO_STATE_REGIONS: Readonly<Record<string, GeoPoint>> = Object.freeze({
  // Tel Aviv rather than Jerusalem, though the zone is named for the latter: it is the metro the
  // corpus is in and the one the product has been used in. Nothing on screen ever says either.
  'Asia/Jerusalem': { lat: 32.0853, lng: 34.7818 },
  /** A legacy alias some browsers still report for the same zone. */
  'Asia/Tel_Aviv': { lat: 32.0853, lng: 34.7818 },
  'Europe/London': { lat: 51.5074, lng: -0.1278 },
  'Europe/Paris': { lat: 48.8566, lng: 2.3522 },
  'Europe/Berlin': { lat: 52.52, lng: 13.405 },
  'Europe/Madrid': { lat: 40.4168, lng: -3.7038 },
  'Europe/Rome': { lat: 41.9028, lng: 12.4964 },
  'Europe/Lisbon': { lat: 38.7223, lng: -9.1393 },
  'America/New_York': { lat: 40.7128, lng: -74.006 },
  'America/Los_Angeles': { lat: 34.0522, lng: -118.2437 },
  'Asia/Tokyo': { lat: 35.6762, lng: 139.6503 },
  'Asia/Bangkok': { lat: 13.7563, lng: 100.5018 },
  'Australia/Sydney': { lat: -33.8688, lng: 151.2093 },
});

/** Half the zero-state box, in degrees. The extent is irrelevant to the camera — the zero-places
 *  view rests at `ZERO_STATE_ZOOM`, a fixed zoom, and never fits this box — so it exists only so
 *  the value is a well-formed, non-degenerate rectangle like every other bounds in the app. */
const ZERO_STATE_HALF_SPAN = { lat: 0.02, lng: 0.024 } as const;

function boxAround(centre: GeoPoint): ViewportBounds {
  return Object.freeze({
    north: centre.lat + ZERO_STATE_HALF_SPAN.lat,
    south: centre.lat - ZERO_STATE_HALF_SPAN.lat,
    east: centre.lng + ZERO_STATE_HALF_SPAN.lng,
    west: centre.lng - ZERO_STATE_HALF_SPAN.lng,
  });
}

/**
 * **Where the camera opens when there is nothing to open on, and no zone is recognised**
 * (`current-state.md` §9.3: *"Zero places shows no bare world map: a plausible regional view"*).
 *
 * Before this existed, the empty library had no camera at all: the page handed the surface
 * `anchorCluster?.bounds`, an empty library has no anchor cluster, `boundsFor` returned `null` and
 * `MapcnMap` was constructed with no `center` and no `zoom` — so a brand-new account's first screen
 * was MapLibre's own default, the whole globe at zoom 0 centred on the Atlantic. That is the
 * backdrop to the paste field, which makes it the first thing the product ever says about itself.
 *
 * **It was one guessed metro area until 2026-08-31 and is now the fallback for a table**
 * (`zeroStateBounds`). London rather than Tel Aviv, and that is the point of it being a *fallback*:
 * the recognised case answers with the user's own metro, and this is the answer for a zone nobody
 * has written a row for. It is the one region that is never a guess about a particular user.
 *
 * **The docblock here used to make two false claims, both recorded as `current-state.md` item 8.**
 * It said the box was *"sized so an honest fit of it already rests inside the pin band"* because
 * *"the home framing applies `HOME_LANDING_MIN_ZOOM`"*. That constant had not existed since
 * 2026-08-30, and the fit it described could not happen: the box is fitted like any other, and the
 * ceiling then in force clamped it to the area band, so the zero-place first screen was a region
 * drawn as two grey capsules with nothing in them. Neither sentence is true and neither is here.
 * **What is true now:** the zero-state does not fit anything at all. The surface recognises
 * `places.length === 0` and rests at `ZERO_STATE_ZOOM` over this box's centre, so the extent below
 * decides nothing.
 */
export const EMPTY_LIBRARY_BOUNDS: ViewportBounds = boxAround(
  ZERO_STATE_REGIONS['Europe/London'] as GeoPoint,
);

/**
 * The region a brand-new account's map opens on, from the browser's own time zone.
 *
 * `null` — or any zone with no row — answers `EMPTY_LIBRARY_BOUNDS`. That is deliberate rather than
 * defensive: on the server the zone is not knowable, and it does not need to be, because this value
 * never reaches the DOM as text. It is a prop to a canvas. **If any future change renders the
 * region, or its name, as markup, this becomes a hydration bug and a privacy question in the same
 * commit.** Do not render it.
 */
export function zeroStateBounds(timeZone: string | null): ViewportBounds {
  const region = timeZone === null ? undefined : ZERO_STATE_REGIONS[timeZone];
  return region === undefined ? EMPTY_LIBRARY_BOUNDS : boxAround(region);
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
