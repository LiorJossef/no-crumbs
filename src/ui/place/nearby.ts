/**
 * The other places of yours within a short walk of the one you are looking at.
 *
 * This is the product's own retrieval promise applied to a single screen. The library answers
 * *"what do I already have in this city"* through the map and the list; a place's own detail is
 * where the smaller version of that question gets asked — you are standing at this café, what else
 * did you save around here — and until now the answer lived only in the map behind the sheet, at
 * whatever zoom the camera happened to be at.
 *
 * ## Why 1 km and three
 *
 * 1 km is a walk of about twelve minutes, which is the honest reading of "nearby" for a place you
 * are already at. It is deliberately not a radius that finds *something* for every place: a saved
 * place with nothing else around it should say nothing rather than offer a neighbour a bus ride
 * away, because a section that is always full stops carrying information.
 *
 * Three, because this sits inside a detail view that already has a name, a category, an address,
 * tags, dishes, a note and five controls. It is a hint, not a second list.
 *
 * ## What it does not do
 *
 * No provider call and no new data: every coordinate here is one the library already holds. It
 * therefore inherits their accuracy honestly — an `llm_guess` pin is 65–470 m out, so a place can
 * be listed at "300 m" on a coordinate that is itself approximate. That is the same uncertainty the
 * map draws and the row now marks with a dashed ring; this module does not restate it, and it does
 * not exclude approximate rows either, because "we are unsure where this is" is not a reason to
 * hide a place the user saved.
 */

import {
  DEFAULT_CLUSTER_RADIUS_KM,
  haversineKm,
  type GeoPoint,
} from '@/domain/places/clusters';
import { placeNameKey } from '@/domain/places/name-key';

/** A short walk. See the module docblock. */
const DEFAULT_MAX_KM = 1;
const DEFAULT_LIMIT = 3;

export interface NearbyCandidate extends GeoPoint {
  readonly id: string;
  readonly name: string;
}

export interface NearbyPlace {
  readonly id: string;
  readonly name: string;
  readonly km: number;
}

export function nearbyPlaces(
  target: { readonly id: string; readonly name?: string } & GeoPoint,
  all: readonly NearbyCandidate[],
  options: { readonly maxKm?: number; readonly limit?: number } = {},
): readonly NearbyPlace[] {
  const maxKm = options.maxKm ?? DEFAULT_MAX_KM;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const targetKey = placeNameKey(target.name);

  const withinWalk = all
    // By id, and by name where we have one. `HaKosem` is in the library three times across 568 m,
    // so opening one of them listed the others back as neighbours — "HaKosem is 500 m from
    // HaKosem", which is the dedup gap wearing this feature as a costume.
    //
    // The trade, stated: a chain with two genuine branches inside a kilometre is now hidden from
    // this list. That is rarer than a duplicate and much cheaper to be wrong about — a real branch
    // is still a pin, a row and a search result, whereas a phantom one here reads as a bug.
    .filter((candidate) => candidate.id !== target.id)
    .filter((candidate) => targetKey === '' || placeNameKey(candidate.name) !== targetKey)
    .map((candidate) => ({ id: candidate.id, name: candidate.name, km: haversineKm(target, candidate) }))
    .filter((candidate) => candidate.km <= maxKm)
    // Distance, then id. The tiebreak matters: two saves at one coordinate (the library has real
    // duplicate pairs 1.11 m apart) would otherwise order by input position, so the section could
    // reorder itself between two renders of the same place.
    .sort((left, right) => left.km - right.km || left.id.localeCompare(right.id));

  // One row per venue, keeping the nearest.
  //
  // `resolve_place` mints a second `places` row for one venue in cases it cannot yet tell apart —
  // the live library has `HaKosem` three times across 568 m — and this list showed the first real
  // consequence on screen: `HaKosem 500 m · HaKosem 550 m` inside a three-item hint. That is not
  // information, it is the dedup gap rendered twice, and a user reads it as the product being
  // broken rather than as two rows.
  //
  // Collapsing here is a display choice and deliberately not a fix: the rows are untouched, both
  // still have their own pin and their own detail, and the map still draws what the database
  // holds. The real repair is at `places` identity.
  const seen = new Set<string>();
  const deduped: NearbyPlace[] = [];
  for (const candidate of withinWalk) {
    const key = placeNameKey(candidate.name);
    // A blank key means the name normalised away to nothing; that cannot stand in for identity,
    // so those rows are always kept rather than all collapsing onto each other.
    if (key !== '' && seen.has(key)) continue;
    if (key !== '') seen.add(key);
    deduped.push(candidate);
    if (deduped.length === limit) break;
  }
  return deduped;
}

/**
 * How far, said the way a person would.
 *
 * Metres below a kilometre and rounded to 50, because the underlying coordinate can be the model's
 * own guess and "312 m" claims a precision no row here has. One decimal above it, so 1.2 km reads
 * as a walk and 1 km does not have to stand for everything between 1 and 2.
 */
export function nearbyDistanceLabel(km: number): string {
  if (km < 1) {
    const metres = Math.max(50, Math.round((km * 1000) / 50) * 50);
    return `${metres} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * ## Near me (`L1-F11`)
 *
 * The three functions below are the same distance work applied to a different origin: not the place
 * you have open, but **you**. They exist here rather than in a module of their own so the product
 * has exactly one answer to "how far apart are these two saves", one rounding rule for saying it,
 * and one place where a distance can start being wrong.
 *
 * They take a plain `GeoPoint` and never a state, a permission or a map. Whether there is a real
 * user location to pass is `components/map/near-me.ts`'s `distanceOrigin`, and it is the only
 * caller allowed to answer it — a map centre is not an origin, which is the whole of `T2`.
 */

/**
 * How far away a saved place has to be before "near you" stops being a claim about anywhere.
 *
 * The same ~50 km that defines an *area*, and deliberately the same constant rather than a second
 * number: an area is already the product's unit of "the places around here", so near-me measures
 * exactly as far as the thing the list is grouped into. Beyond it a distance is arithmetic rather
 * than information — `3,600 km` under a London row while you stand in Tel Aviv tells you nothing
 * you did not know and buries the rows that do.
 */
export const NEAR_ME_MAX_KM = DEFAULT_CLUSTER_RADIUS_KM;

/**
 * Distance from the user to each place that is genuinely near them, by place id.
 *
 * Places beyond the reach are **absent from the map**, not present with a large number: a caller
 * renders what is here and nothing where there is nothing, so there is no threshold logic at the
 * call site to get wrong.
 */
export function distancesFromUser(
  origin: GeoPoint,
  places: readonly ({ readonly id: string } & GeoPoint)[],
  maxKm: number = NEAR_ME_MAX_KM,
): ReadonlyMap<string, number> {
  const distances = new Map<string, number>();
  for (const place of places) {
    const km = haversineKm(origin, place);
    if (km <= maxKm) distances.set(place.id, km);
  }
  return distances;
}

/**
 * The list with the places near you lifted to the top, nearest first, and everything else left
 * exactly as it arrived.
 *
 * The library's own order (most recently saved first) is the default and stays the default — this
 * only reorders while a real fix is being held, and it degrades to the identity when the user has
 * nothing within reach. Returned **by identity** in that case so a `useMemo` downstream of it does
 * not re-render every row for a fix taken 400 km from anything.
 *
 * The two groups keep their relative order (`sort` is stable), so two places at the same distance,
 * and every place beyond the reach, are still in the order the list would otherwise have shown.
 */
export function nearestFirst<T extends { readonly id: string }>(
  places: readonly T[],
  distances: ReadonlyMap<string, number>,
): readonly T[] {
  if (distances.size === 0) return places;
  return [...places].sort((left, right) => {
    const a = distances.get(left.id);
    const b = distances.get(right.id);
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return a - b;
  });
}

/**
 * Which of the user's own areas they are standing in: the one with a saved place nearest to them,
 * within reach.
 *
 * `null` when nothing they have saved is within `maxKm`, and that is a real answer rather than a
 * gap — near-me still moves the camera to them, and the list keeps saying what it said, because
 * inventing an area they are not in would be the map answering a different question.
 *
 * Nearest **member**, not nearest centroid: an area is a ~50 km cluster and its mean can sit several
 * kilometres from every place in it, so a user standing outside one café would otherwise be told
 * they are somewhere else. Ties break on the area's own id so two equidistant areas cannot swap
 * between two taps.
 */
export function nearestArea<A extends { readonly id: string; readonly points: readonly GeoPoint[] }>(
  areas: readonly A[],
  origin: GeoPoint,
  maxKm: number = NEAR_ME_MAX_KM,
): A | null {
  let best: A | null = null;
  let bestKm = Infinity;
  for (const area of areas) {
    let km = Infinity;
    for (const point of area.points) km = Math.min(km, haversineKm(origin, point));
    if (km > maxKm) continue;
    if (km < bestKm || (km === bestKm && best !== null && area.id.localeCompare(best.id) < 0)) {
      best = area;
      bestKm = km;
    }
  }
  return best;
}
