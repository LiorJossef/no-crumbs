/**
 * The "open this in Google Maps" URL for a place we have already saved.
 *
 * Distinct from `domain/places/google-maps-search-url.ts`, and the difference is what is known.
 * That one builds a query for a place the resolver has *not* pinned down — a candidate mid-import,
 * where the name may be a raw caption string and the address a hint — so it reconciles the model's
 * name variants and drops a city that is already inside the address. This one is for a row that is
 * already in the database: one name, one address, one coordinate pair, nothing to reconcile.
 *
 * It exists as a module because two surfaces now need it — the saved-place detail on `/map` and a
 * place inside a collection — and the second was about to be the second hand-rolled copy of the
 * same template literal.
 *
 * The address is preferred over the coordinates on purpose. A saved coordinate can be the model's
 * own guess (65–470 m out, `docs/current-state.md`), so linking by point would drop the user on a
 * pin next door with no name; a name-and-address query lets Google do the matching and lands on the
 * venue's own card. Coordinates are the fallback for a row with no address at all.
 */

export interface MapsLinkPlace {
  readonly name: string;
  readonly addressLine?: string | null | undefined;
  readonly locality?: string | null | undefined;
  readonly lat: number;
  readonly lng: number;
}

const GOOGLE_MAPS_SEARCH_BASE = 'https://www.google.com/maps/search/?api=1&query=';

export function savedPlaceMapsUrl(place: MapsLinkPlace): string {
  const parts = place.addressLine
    ? [place.name, place.addressLine, place.locality]
    : [place.name, `${place.lat},${place.lng}`];

  const query = parts.filter((part): part is string => Boolean(part)).join(', ');
  return `${GOOGLE_MAPS_SEARCH_BASE}${encodeURIComponent(query)}`;
}
