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

import { haversineKm, type GeoPoint } from '@/domain/places/clusters';
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
