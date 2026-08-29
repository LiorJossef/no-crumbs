/**
 * Countries, as the top level of the library's geography (`docs/ux-library-at-scale.md` §2).
 *
 * The model is country → area → place, and this module owns the first arrow. It answers the two
 * questions the map's world-zoom band and the list's `Elsewhere` section both need: which country
 * an area belongs to, and where a country's marker should sit.
 *
 * **Areas are bucketed by the area's country, not the place's** (§2.5). An area is one city by
 * construction and so one country, and it can answer for members whose own `country_code` is NULL —
 * two of the 31 places in the library today, and dropping them would make real saved places
 * invisible at world zoom.
 */

import type { GeoBounds, GeoCluster, GeoPoint } from './clusters';
import { isValidPoint } from './clusters';

/**
 * One country's worth of the library: its areas, where its marker goes, and how much is in it.
 *
 * Generic over the *cluster* type as well as the member type so a caller that passes richer areas
 * — `ui/place/active-area.ts`'s `Area<T>`, which carries the stable id and the display label the
 * list and the map both key on — gets those same objects back rather than a bare `GeoCluster` it
 * would then have to match up again by identity.
 */
export interface CountryBucket<T, C extends GeoCluster<T> = GeoCluster<T>> {
  /** ISO 3166-1 alpha-2, or `null` for areas whose members carry no usable country at all. A
   *  `null` bucket renders unflagged and sorts last; it is never merged into a real country. */
  readonly countryCode: string | null;
  readonly areas: readonly C[];
  /** Where the country's marker sits — the mean of your own saved places, not a country centroid. */
  readonly centroid: GeoPoint;
  /** Extent of the country's areas, for the camera to fit when the marker is tapped (§2.4). */
  readonly bounds: GeoBounds;
  /** Saved places in the country, across all its areas. */
  readonly count: number;
}

/**
 * The country of an area, by plurality of its members.
 *
 * `null` on a tie as well as on an empty area, following `clusterLabel`: a coin flip between two
 * countries would move a marker across the world between renders, and an unflagged marker is
 * already the specified rendering of "we do not know".
 */
export function areaCountry<T>(
  cluster: GeoCluster<T>,
  toCountryCode: (item: T) => string | null | undefined,
): string | null {
  const counts = new Map<string, number>();

  for (const member of cluster.members) {
    const raw = toCountryCode(member);
    if (raw == null) continue;
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }

  return tied ? null : best;
}

/**
 * Mean position of points, averaged as 3-D unit vectors rather than as lat/lng pairs.
 *
 * Averaging degrees puts the mean of two places either side of the antimeridian in the middle of
 * the wrong ocean, and misbehaves near the poles. Averaging direction vectors is correct wherever
 * the answer is defined at all.
 *
 * Where it is *not* defined — points whose vectors cancel, which needs a country spanning
 * antipodes — this returns the first valid point rather than `null`. A marker sitting on one of
 * your own places is never absurd; no marker at all would make every place in that country vanish
 * from world zoom, which §2.5 forbids outright.
 */
export function meanCentroid(points: readonly GeoPoint[]): GeoPoint | null {
  const valid = points.filter((point) => isValidPoint(point));
  const first = valid[0];
  if (first === undefined) return null;

  let x = 0;
  let y = 0;
  let z = 0;
  for (const { lat, lng } of valid) {
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    x += cosLat * Math.cos(lngRad);
    y += cosLat * Math.sin(lngRad);
    z += Math.sin(latRad);
  }

  const n = valid.length;
  x /= n;
  y /= n;
  z /= n;

  // Below this the mean direction is numerically meaningless, not merely imprecise.
  if (Math.hypot(x, y, z) < 1e-9) return first;

  return {
    lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    lng: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

/**
 * Group areas into countries, ready for the world-zoom band and the `Elsewhere` list.
 *
 * Ordered by count descending, then by country code, so the order is stable across renders; the
 * `null` bucket always sorts last however big it is, because it is a gap rather than a place.
 */
export function bucketAreasByCountry<T, C extends GeoCluster<T>>(
  areas: readonly C[],
  toCountryCode: (item: T) => string | null | undefined,
  toPoint: (item: T) => GeoPoint,
): readonly CountryBucket<T, C>[] {
  // A space can never collide with a country code, which the `areaCountry` regex guarantees.
  const NULL_KEY = ' ';
  const buckets = new Map<string, C[]>();

  for (const area of areas) {
    const key = areaCountry(area, toCountryCode) ?? NULL_KEY;
    const existing = buckets.get(key);
    if (existing) existing.push(area);
    else buckets.set(key, [area]);
  }

  const result: CountryBucket<T, C>[] = [];
  for (const [key, grouped] of buckets) {
    const members = grouped.flatMap((area) => area.members);
    const centroid = meanCentroid(members.map(toPoint));
    // A country whose every member is unplottable cannot carry a marker. Its areas still reach the
    // user through their own list rows, so this drops a marker rather than a place.
    if (centroid === null) continue;

    result.push({
      countryCode: key === NULL_KEY ? null : key,
      areas: grouped,
      centroid,
      bounds: unionBounds(grouped.map((area) => area.bounds)),
      count: members.length,
    });
  }

  return result.sort(compareBuckets);
}

function compareBuckets<T, C extends GeoCluster<T>>(
  a: CountryBucket<T, C>,
  b: CountryBucket<T, C>,
): number {
  if (a.countryCode === null) return b.countryCode === null ? 0 : 1;
  if (b.countryCode === null) return -1;
  if (a.count !== b.count) return b.count - a.count;
  return a.countryCode.localeCompare(b.countryCode);
}

/** Smallest box containing every input box. Shares `clusterByProximity`'s antimeridian limitation,
 *  named in that file's header; a library straddling it would need both to change together. */
function unionBounds(all: readonly GeoBounds[]): GeoBounds {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const bounds of all) {
    if (bounds.north > north) north = bounds.north;
    if (bounds.south < south) south = bounds.south;
    if (bounds.east > east) east = bounds.east;
    if (bounds.west < west) west = bounds.west;
  }
  return { north, south, east, west };
}
