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

/**
 * Whether a locality token is already present in a string we are about to join alongside it.
 * Case- and whitespace-insensitive, the same test `addressAlreadyHasCity` applies to the address.
 */
function alreadyContains(haystack: string, needle: string): boolean {
  return haystack.trim().toLowerCase().includes(needle.trim().toLowerCase());
}

function buildQueryText(candidate: PlaceCandidate): string {
  const name = candidate.identifiedName ?? candidate.rawName;
  const hasAddress = candidate.addressHint !== null && candidate.addressHint.trim().length > 0;
  const cityAlreadyInAddress =
    hasAddress &&
    candidate.cityHint !== null &&
    candidate.cityHint.trim().length > 0 &&
    addressAlreadyHasCity(candidate.addressHint as string, candidate.cityHint);

  // `areaHint` (extraction schema v2) is the neighbourhood / market / building the caption named —
  // "Market Row, Brixton", "Tooting Market", "Pudding Lane". It is included here because v2
  // **moved this information out of the venue name on purpose**: v1 emitted
  // `identifiedName: "La Nonna Brixton"` and this query inherited the area for free, whereas v2
  // correctly emits `"La Nonna"` + `areaHint: "Market Row, Brixton"`. Measured on the real stored
  // v2 extraction: `addressHint` is null on all eight London candidates and every locational
  // detail lives in `areaHint`, so without this line the field-discipline fix would have made this
  // link strictly worse than before — and this link is currently the product's only mitigation for
  // a model-guessed coordinate (`06` §3.4). A street address is still preferred when present; the
  // area is the weaker signal and sits after it.
  const areaHint = candidate.areaHint;
  const hasArea =
    areaHint !== null &&
    areaHint.trim().length > 0 &&
    // Skip it when the name already carries it (a v1-shaped `identifiedName`, or a caption whose
    // venue name genuinely contains the area) — "Kiaans Tooting, Tooting Market" helps nobody.
    !alreadyContains(name, areaHint) &&
    // ...or when the address already says it, since the address is the stronger of the two.
    !(hasAddress && alreadyContains(candidate.addressHint as string, areaHint));

  const cityAlreadyInArea =
    hasArea &&
    candidate.cityHint !== null &&
    candidate.cityHint.trim().length > 0 &&
    alreadyContains(areaHint as string, candidate.cityHint);

  const parts = [
    name,
    hasAddress ? candidate.addressHint : candidate.categoryHint,
    hasArea ? areaHint : null,
    cityAlreadyInAddress || cityAlreadyInArea ? null : candidate.cityHint,
    candidate.countryHint,
  ].filter((part): part is string => part !== null && part.trim().length > 0);
  return parts.join(', ');
}

/**
 * The shortlist row the review screen is showing as chosen — the user's pick, or the top entry a
 * `matched` candidate auto-accepts. Structural rather than the screen's own `ResolutionOption`,
 * which lives in the UI layer and may not be imported from here.
 */
export interface PickedPlace {
  readonly name: string;
  /** The row's address/locality line as the card shows it, or `null` when it has none. */
  readonly detail: string | null;
}

/**
 * The query for a candidate the user has settled: the picked row's own name and address, and
 * nothing from the caption beyond a fallback city.
 *
 * The caption's `addressHint`/`areaHint`/`countryHint` are dropped rather than mixed in, because a
 * pick is the user disagreeing with the caption's reading: choosing the Basel branch of a chain
 * the caption placed in Tel Aviv and then searching Google for the Tel Aviv address would send
 * them to the branch they just rejected. `cityHint` survives only when the map data gave the
 * picked row no detail at all, where the choice is between a weak query and a bare name.
 */
function pickedQueryText(pick: PickedPlace, candidate: PlaceCandidate): string {
  const fallbackCity =
    pick.detail === null && candidate.cityHint !== null && !alreadyContains(pick.name, candidate.cityHint)
      ? candidate.cityHint
      : null;
  return [pick.name, pick.detail, fallbackCity]
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(', ');
}

/**
 * A `https://www.google.com/maps/search/?api=1&query=...` URL for the given candidate — the
 * documented "Search" URL form (`https://developers.google.com/maps/documentation/urls/get-started#search-action`),
 * never a place-details or embed URL, since this candidate has no place ID and none is ever
 * fetched (`06` §3.4). Percent-encoding is `encodeURIComponent`'s job; this function does no
 * manual escaping.
 *
 * `pick` is the review screen's chosen shortlist row, when it has one. It exists because the card
 * titled itself with the picked place while this link kept searching the caption's raw string, so
 * the two named different venues the moment a user picked — on the one card whose whole purpose is
 * telling two same-named branches apart. With no pick the caption-reconciling behaviour above is
 * unchanged, and that is still the common case.
 */
export function googleMapsSearchUrl(candidate: PlaceCandidate, pick: PickedPlace | null = null): string {
  const query = pick === null ? buildQueryText(candidate) : pickedQueryText(pick, candidate);
  return `${GOOGLE_MAPS_SEARCH_BASE}${encodeURIComponent(query)}`;
}
