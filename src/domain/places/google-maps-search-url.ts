/**
 * A plain hyperlink builder for a Google Maps *search* — no API call, no API key, no Place data
 * fetched or cached by us. `06` §3.4: this is deliberately the entire "resolution" step for the
 * current build increment — the LLM identifies a likely venue (`PlaceCandidate.identifiedName`),
 * and this link is what a human clicks to verify it. Fetching Google Place data server-side, by
 * contrast, would trigger the non-Google-map ToS prohibition already analysed in `06` §3.3 — this
 * file must never grow a network call.
 */

import type { PlaceCandidate } from '../types';

const GOOGLE_MAPS_SEARCH_BASE = 'https://www.google.com/maps/search/?api=1&query=';

/**
 * Builds the query text: prefers the model's real-world identification over the raw caption
 * fragment (`identifiedName` is expected to be the more specific, more findable string), falls
 * back to `rawName` when the model had no identification. `categoryHint` is included right after
 * the name so Maps favors the right kind of venue rather than an unrelated same-name business —
 * e.g. `"Paradiso, cafe, Prague"` rather than `"Paradiso, Prague"`, which can surface an unrelated
 * venue that happens to share the name. Only the fields present are joined, so a candidate with no
 * category/city/country still gets a sane query rather than a trailing/doubled ", , ".
 */
function buildQueryText(candidate: PlaceCandidate): string {
  const name = candidate.identifiedName ?? candidate.rawName;
  const parts = [name, candidate.categoryHint, candidate.cityHint, candidate.countryHint].filter(
    (part): part is string => part !== null && part.trim().length > 0,
  );
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
