/**
 * The two summary bands **narrowed to what the filters left** — the projection that stands between
 * the library's geography and what the map actually draws.
 *
 * ## Why this exists
 *
 * `summary-features.ts` opens by claiming that `map-page-client.tsx` maps the bands "once, from the
 * same objects the list renders — which is what stops the map and the list deriving their geography
 * separately and quietly disagreeing." That claim was false wherever a filter was on. The bands were
 * mapped from `areas` / `countries`, which are built from the **whole library**, while the pins and
 * the list are built from `matches`. Reported by the owner on 2026-09-04, reproduced at 1280x900:
 * two tag filters that match nothing left the list saying `No places match these filters.` while the
 * map went on drawing `תל אביב-יפו 33`, `תל יצחק 2` and `חיפה 1` — counts of a library the map was
 * drawing none of.
 *
 * The dead tap the owner also reported is downstream of exactly that. `map-page-client.tsx`'s mover
 * 4 falls back to the area's whole membership when the filter has left nothing in it, and hands
 * those ids to the surface; the surface resolves them against its own `places` prop, which **is**
 * the filtered set, finds none of them, and declines. Measured: `selectArea` fires with
 * `members 20, matching 0`, then the surface's focus effect logs `wanted 20, places 0, target
 * false` and returns. A pill that only exists because the band ignored the filter cannot be flown
 * to by a camera that does not.
 *
 * ## Narrowing here and nowhere else
 *
 * The narrowing is applied **to the drawn summary only**, never to `areas` / `countries`
 * themselves, and that boundary is the whole design. Those two resolve the list's scope, the
 * page's default area and the opening camera; making them filter-dependent would mean a keystroke
 * could invalidate the scope and move the camera, which is the one thing `ux-map-is-the-query.md`
 * and the camera-mover list both forbid — **narrowing must never navigate**. Here, narrowing only
 * changes what is *drawn*: no scope, no camera, no navigation.
 *
 * With no filter on, `matchIds` holds every saved place and every value below is identical to the
 * library's own — so the unfiltered map is unchanged by construction rather than by a flag.
 */

import type { GeoBounds, GeoPoint } from '@/domain/places/clusters';
import { meanCentroid } from '@/domain/places/country-bucket';
import type { Area } from '@/ui/place/active-area';
import type { CountrySummary } from '@/ui/place/library-summary';
import type { MapAreaSummary, MapCountrySummary, MapPlace, MapSummaries } from './types';

/** `meanCentroid` under a shorter name, and it is deliberately the domain's own rather than a
 *  local average: it means a filtered pill lands on exactly the point an unfiltered one does when
 *  the filter matches everything, and it is the function that already handles the antimeridian.
 *  `null` for an empty set is the signal that removes the marker. */
const meanOf = (points: readonly GeoPoint[]): GeoPoint | null => meanCentroid(points);

/** The box around a set of points, or `null` for an empty one — what a country tap frames. */
function boundsOf(points: readonly GeoPoint[]): GeoBounds | null {
  const first = points[0];
  if (!first) return null;
  let south = first.lat;
  let north = first.lat;
  let west = first.lng;
  let east = first.lng;
  for (const point of points) {
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
  }
  return { south, west, north, east };
}

function matchingMembers(
  area: Area<MapPlace>,
  matchIds: ReadonlySet<string>,
): readonly MapPlace[] {
  return area.members.filter((place) => matchIds.has(place.id));
}

/**
 * One area's marker, over the places the filters left — or `null` where they left none, which is
 * what removes the pill entirely.
 *
 * The marker sits at the mean of the **matching** places rather than of the area's whole
 * membership, for the same reason §2.2 puts a country's marker at the mean of your own saved places
 * rather than at a country centroid: the pill is a claim about a set, and it should sit on that
 * set. A 50 km area whose one match is at its edge would otherwise draw a pill reading `1` up to
 * 25 km from the only place it is counting.
 */
function narrowArea(
  area: Area<MapPlace>,
  matchIds: ReadonlySet<string>,
): MapAreaSummary | null {
  const members = matchingMembers(area, matchIds);
  const centroid = meanOf(members);
  if (centroid === null) return null;
  return { id: area.id, label: area.label, count: members.length, ...centroid };
}

function narrowCountry(
  country: CountrySummary<MapPlace>,
  matchIds: ReadonlySet<string>,
): MapCountrySummary | null {
  const members = country.areas.flatMap((area) => matchingMembers(area, matchIds));
  const centroid = meanOf(members);
  const bounds = boundsOf(members);
  if (centroid === null || bounds === null) return null;
  return {
    key: country.key,
    countryCode: country.countryCode,
    label: country.label,
    count: members.length,
    ...centroid,
    bounds,
  };
}

/**
 * The bands the map draws: every country and every area that still has something in it after the
 * filters, counted and positioned over what is left.
 *
 * An area or a country with no matches is **absent**, not drawn at zero. A pill reading `0` is a
 * tap target that can only disappoint, and `docs/ux-library-at-scale.md` §2.5's *no place ever
 * disappears* is a rule about the library, not about a view the user has explicitly narrowed —
 * the filter chips are on screen saying so, and `Clear` is next to them.
 *
 * `activeCountryKey` is passed through untouched. It is resolved from the list's scope, which is a
 * fact about the library; if the country it names has no matches it is simply not in `countries`
 * and no marker wears the ring, which is the honest rendering rather than a special case.
 */
export function summariesForMatches(input: {
  readonly countries: readonly CountrySummary<MapPlace>[];
  readonly areas: readonly Area<MapPlace>[];
  readonly matchIds: ReadonlySet<string>;
  readonly activeCountryKey: string | null;
}): MapSummaries {
  const countries: MapCountrySummary[] = [];
  for (const country of input.countries) {
    const narrowed = narrowCountry(country, input.matchIds);
    if (narrowed) countries.push(narrowed);
  }
  const areas: MapAreaSummary[] = [];
  for (const area of input.areas) {
    const narrowed = narrowArea(area, input.matchIds);
    if (narrowed) areas.push(narrowed);
  }
  return { countries, areas, activeCountryKey: input.activeCountryKey };
}

/**
 * The box around the places of one country that the filters left — what camera mover 5 frames —
 * or `null` where they left none.
 *
 * Exported for `map-page-client.tsx`'s `focusCountry`, so a country tap frames the same set its
 * pill counted. Mover 4 has framed "the places the filter left" since it was written; this is the
 * same rule for the band above it, and without it a country tap under a filter would fly to a box
 * around places the map is not drawing. `null` cannot be reached from a tap — a country with no
 * matches draws no marker — and the caller keeps the library's own bounds for it rather than
 * inventing a camera.
 */
export function matchingBoundsInCountry(
  country: CountrySummary<MapPlace>,
  matchIds: ReadonlySet<string>,
): GeoBounds | null {
  return boundsOf(country.areas.flatMap((area) => matchingMembers(area, matchIds)));
}
