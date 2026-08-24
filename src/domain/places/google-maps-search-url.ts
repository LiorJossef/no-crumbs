/**
 * A plain hyperlink builder for a Google Maps *search* — no API call, no API key, no Place data
 * fetched or cached by us. `06` §3.4: this is deliberately the entire "resolution" step for the
 * current build increment — the LLM identifies a likely venue (`PlaceCandidate.identifiedName`),
 * and this link is what a human clicks to verify it. The query text prefers a caption-given street
 * address (`addressHint`) over `categoryHint` when both exist, since name+address text-search
 * resolves more reliably in Google's own search than name+category+city and does not depend on any
 * coordinates the model guessed. Fetching Google Place data server-side, by
 * contrast, would trigger the non-Google-map ToS prohibition already analysed in `06` §3.3 — this
 * file must never grow a network call.
 */

import type { PlaceCandidate } from '../types';

const GOOGLE_MAPS_SEARCH_BASE = 'https://www.google.com/maps/search/?api=1&query=';

/**
 * Builds the query text: prefers the model's real-world identification over the raw caption
 * fragment (`identifiedName` is expected to be the more specific, more findable string), falls
 * back to `rawName` when the model had no identification.
 *
 * When the caption gave an explicit street address (`addressHint`), that address is a stronger
 * disambiguator than a category hint — "Ragazzi, 12 Rothschild Blvd, Tel Aviv" pins the exact
 * street-level location, where "Ragazzi, restaurant, Tel Aviv" can still collide with an unrelated
 * same-named venue in the same city (the case that motivated this: an unrelated "Ragazzi" pizzeria
 * also in Tel Aviv). `categoryHint` is dropped once an address is present — the address is already
 * the stronger signal, and stacking both risks an overlong query with the address itself, which
 * only marginally more specifies the venue.
 *
 * When there is no address, behavior is unchanged from before: `categoryHint` right after the
 * name so Maps favors the right kind of venue rather than an unrelated same-name business, e.g.
 * `"Paradiso, cafe, Prague"` rather than `"Paradiso, Prague"`.
 *
 * Only the fields present are joined, so a candidate with no address/category/city/country still
 * gets a sane query rather than a trailing/doubled ", , ".
 *
 * A caption-given `addressHint` sometimes already ends with the city itself (e.g. a Hebrew caption
 * "חצר השוק 6, רעננה" yields `addressHint: "חצר השוק 6, רעננה"` with `cityHint: "רעננה"`) — in that
 * case appending `cityHint` again would duplicate the city token ("..., רעננה, רעננה, ..."). When
 * the address already contains the city (case/whitespace-insensitive), `cityHint` is dropped from
 * the joined parts; `countryHint` is unaffected.
 */
function addressAlreadyHasCity(addressHint: string, cityHint: string): boolean {
  return addressHint.trim().toLowerCase().includes(cityHint.trim().toLowerCase());
}

function buildQueryText(candidate: PlaceCandidate): string {
  const name = candidate.identifiedName ?? candidate.rawName;
  const hasAddress = candidate.addressHint !== null && candidate.addressHint.trim().length > 0;
  const cityAlreadyInAddress =
    hasAddress &&
    candidate.cityHint !== null &&
    candidate.cityHint.trim().length > 0 &&
    addressAlreadyHasCity(candidate.addressHint as string, candidate.cityHint);
  const parts = [
    name,
    hasAddress ? candidate.addressHint : candidate.categoryHint,
    cityAlreadyInAddress ? null : candidate.cityHint,
    candidate.countryHint,
  ].filter((part): part is string => part !== null && part.trim().length > 0);
  return parts.join(', ');
}

/**
 * A `https://www.google.com/maps/search/?api=1&query=...` URL for the given candidate — the
 * documented "Search" URL form (`https://developers.google.com/maps/documentation/urls/get-started#search-action`),
 * never a place-details or embed URL, since this candidate has no place ID and none is ever
 * fetched (`06` §3.4). Percent-encoding is `encodeURIComponent`'s job; this function does no
 * manual escaping.
 */
export function googleMapsSearchUrl(candidate: PlaceCandidate): string {
  return `${GOOGLE_MAPS_SEARCH_BASE}${encodeURIComponent(buildQueryText(candidate))}`;
}
