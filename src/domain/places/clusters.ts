/**
 * Geographic clustering of saved places, and the choice of *which* cluster the camera opens on —
 * `L1-F5-T2a`, the pure half of "the map is the query" (`current-state.md` §9.1 step 1).
 *
 * ## Why this exists
 *
 * The map currently fits its camera to the bounding box of **every** saved place. With 12 places in
 * London and 8 in Tel Aviv that is a continental view of Europe and North Africa: two cluster
 * bubbles, no individual pins, no readable place name, and a sheet that says `20 places saved` —
 * a number, about nowhere. The fix is not a better `fitBounds` call; it is deciding that the camera
 * belongs to *one* group of places at a time. That decision is a data question, not a map question,
 * so it lives here where it can be tested without a renderer.
 *
 * ## Why proximity alone was wrong, and what replaced it
 *
 * Until 2026-08-29 the rule was pure single-link proximity at 50 km, on the argument that the
 * `locality` string is too dirty to group on — the live library holds `Tel Aviv-Yafo`,
 * `תל אביב-יפו`, `תל אביב - יפו`, `Tel Aviv` and `ת״א`, five spellings of one city, because rows
 * came from `google-places`, `overture-places` and `llm-guess`. That half is still true and is why
 * the string cannot be the *only* input.
 *
 * The other half was false. 50 km is not "far smaller than the gap between two cities anyone saves
 * places in": measured against the real library plus real Israeli coordinates, central Tel Aviv to
 * Rishon LeZion is **11.2 km** and to Ra'anana **14.9 km**, while the user's own 18 London pins span
 * **11.0 km**. So a user with four saved places in three cities was shown one area headed
 * `4 places in תל אביב-יפו`. Geometry cannot fix that on its own: the separation margin between
 * "another city" and "the far side of London" is 0.2 km, and one saved place in Croydon inverts it.
 *
 * ## The rule now: proximity joins, a different named city vetoes
 *
 * Two places are linked when **either**
 *
 *  1. they are within `nearKm` (2 km) of each other — this close, they are one neighbourhood
 *     whatever the strings say, which is what collapses the five Tel Aviv spellings without an
 *     alias table (measured: 0.3 km is enough to bridge every variant in the real library, so 2 km
 *     carries a 6× margin); **or**
 *  2. they are within `radiusKm` (50 km) **and** both carry a `locality` that normalises to the
 *     same string. `London` reaches across greater London at any spread; `ראשון לציון` never
 *     reaches `תל אביב-יפו`.
 *
 * Still single-link, still one flood fill, still O(n²) over a few hundred rows — only the edge
 * predicate changed. A spatial index here would be speculative machinery defending against a
 * library size this product does not have.
 *
 * Two things this deliberately does **not** do, each measured rather than assumed:
 *
 *  - **An unknown locality does not link beyond `nearKm`.** Letting unknown match everything reads
 *    generous and is a hole: one unlabelled row halfway between two cities re-merges them
 *    transitively, which reproduces the exact bug. The cost is that a lone unnamed place more than
 *    2 km from anything becomes its own one-place area, which is at least honest.
 *  - **It does not gate the veto on `source_dataset`.** Letting a resolved row's locality overrule
 *    an `llm-guess` one was measured on the owner's four rows and made it *worse*: the untrusted
 *    row becomes the free bridge and Rishon LeZion merges back into Tel Aviv. What *is* gated, from
 *    2026-08-30, is the **join** — see below.
 *
 * ## A guessed city name may not merge across the metro radius — but only where we know better
 *
 * `candidate-place.ts` writes an `llm_guess` row's `locality` from the same model guess as its
 * coordinates, so a Ra'anana café pulled out of a "best cafés in Tel Aviv" post arrives with the
 * right pin and the city name of the post. Rule 2 then merges it into Tel Aviv 14.9 km away.
 *
 * Refusing every guessed name the 50 km reach is the obvious fix and it is wrong: measured on the
 * real 32-row library it shatters **London from one area into seven**, because all 18 London rows
 * are guesses spread over 11 km and the name is the only thing holding them together.
 *
 * So the gate is conditional on having a better answer. A guessed locality keeps its reach unless
 * some row *elsewhere in the library* carries the same normalised name from a real map listing —
 * in which case the verified spelling wins and the guess is proximity-only. Measured: the real
 * library is untouched at two areas, and the adversarial Ra'anana row leaves the Tel Aviv cluster.
 *
 * It still does **not** try to rescue a wrong coordinate: a place the model puts in the wrong city
 * arrives with a matching wrong city name and nothing here can separate that. That belongs to
 * resolution.
 *
 * `clusterLabel` still picks the display name after the group exists, where being wrong costs a
 * word rather than a group.
 *
 * ## The antimeridian — what this does and does not handle
 *
 * Distance is honest across ±180°: the haversine below works on the sine/cosine of the longitude
 * *difference*, so Suva and Apia cluster correctly. The **bounding box does not**: `west`/`east` are
 * a plain min/max, so a cluster straddling the antimeridian reports a box spanning almost the whole
 * globe, and the box-containment part of `pickAnchorCluster` inherits that. This is deliberately
 * unfixed and untested rather than half-fixed: no saved place is anywhere near ±180°, a correct fix
 * changes the shape of `GeoBounds` (an east < west convention the renderer must also honour), and
 * an untested wrap-handling branch would be worse than a documented absence. If places near the
 * antimeridian ever appear, this comment is the ticket.
 */

import { normalise } from './normalise';

/** A point on the globe, degrees. The domain's own; no vendor coordinate type crosses into here. */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/**
 * A cluster's extent. Field-for-field the `LatLngBoundsHint` the map surface already speaks
 * (`src/components/map/types.ts`) so the integration layer can pass one straight through — but
 * declared here rather than imported, because `domain/` may not depend on the UI layer and this
 * type is meaningful without a map at all.
 */
export interface GeoBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

/**
 * One group of places. `count` is `members.length`, carried explicitly because the sheet header
 * (`12 places in London`) reads a count and should not have to know the members are all in memory.
 */
export interface GeoCluster<T> {
  readonly members: readonly T[];
  readonly bounds: GeoBounds;
  readonly count: number;
}

/** ~50 km: a metropolitan area, and the reach of a *matching* city name. See the file header. */
export const DEFAULT_CLUSTER_RADIUS_KM = 50;

/**
 * ~2 km: close enough that two places are one neighbourhood whatever their `locality` strings say,
 * so a differing name cannot split them.
 *
 * Bounded from both sides by measurement, not taste. Below: 0.3 km already bridges every spelling
 * variant in the real 32-row library, so 2 km is 6× the observed need. Above: the closest pair of
 * genuinely distinct city centres in the Israeli test set (Ra'anana and Herzliya) are 3.4 km apart,
 * and this must stay under that or it merges them.
 */
export const DEFAULT_NEAR_RADIUS_KM = 2;

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres. Implemented here because the app has no distance helper at
 * all today — the only one in the project is `km_between` in SQL, which is the wrong side of the
 * network for a decision made while the camera is settling.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a point is usable at all. Guards against `NaN` from a missing coordinate and against
 *  the swapped-axis mistake showing up as a silently plausible cluster. */
export function isValidPoint(point: GeoPoint | null | undefined): point is GeoPoint {
  return (
    point != null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

export interface ClusterOptions<T = unknown> {
  /** How far a *matching* city name reaches, in kilometres. Defaults to
   *  `DEFAULT_CLUSTER_RADIUS_KM`. */
  readonly radiusKm?: number;
  /** How far proximity alone joins, ignoring the city name. Defaults to
   *  `DEFAULT_NEAR_RADIUS_KM`. */
  readonly nearKm?: number;
  /**
   * The item's city, if the caller has one. **Omitting it falls back to pure proximity at
   * `radiusKm`** — the pre-2026-08-29 behaviour, which groups adjacent cities together. Supply it
   * anywhere the grouping is shown to a user.
   */
  readonly toLocality?: (item: T) => string | null | undefined;
  /**
   * Whether the item's `locality` was read off a map listing rather than guessed by the model.
   * Defaults to trusting every row, which is the behaviour before 2026-08-30. See the header.
   */
  readonly isLocalityTrusted?: (item: T) => boolean;
}

/** The box around a set of points. Only ever called with a non-empty set — a cluster always has at
 *  least its seed — so the infinite starting values are never observable in a returned box. */
function boundsOf(points: readonly GeoPoint[]): GeoBounds {
  let north = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;

  for (const point of points) {
    if (point.lat > north) north = point.lat;
    if (point.lat < south) south = point.lat;
    if (point.lng > east) east = point.lng;
    if (point.lng < west) west = point.lng;
  }

  return { north, south, east, west };
}

/**
 * Group items by proximity, generic over the caller's own place type so `domain/` never learns
 * about `MapPlace` — the caller supplies the projection, exactly as `filterBySearch` does.
 *
 * Items whose projected point is invalid are **dropped**, not clustered into a phantom group at
 * (0, 0): a place with no usable coordinate is not somewhere, and putting it in Null Island would
 * both invent a cluster and drag a real cluster's bounding box across the Atlantic.
 *
 * Cluster order, and the order of members inside each cluster, follow the input order — the first
 * cluster is the one containing the first valid item. Deterministic ordering is not cosmetic here:
 * `pickAnchorCluster` breaks ties on it, and a camera that lands somewhere different between two
 * renders of the same library is a bug the user experiences as the map "jumping".
 */
export function clusterByProximity<T>(
  items: readonly T[],
  toPoint: (item: T) => GeoPoint | null | undefined,
  options: ClusterOptions<T> = {},
): readonly GeoCluster<T>[] {
  const radiusKm = options.radiusKm ?? DEFAULT_CLUSTER_RADIUS_KM;
  const nearKm = options.nearKm ?? DEFAULT_NEAR_RADIUS_KM;
  const { toLocality } = options;

  const located: { item: T; point: GeoPoint; locality: string; trusted: boolean }[] = [];
  for (const item of items) {
    const point = toPoint(item);
    // `''` is "no usable city", and with no `toLocality` at all every row gets it — which makes
    // `linked` fall through to plain proximity at `radiusKm`, the old behaviour.
    if (isValidPoint(point)) {
      located.push({
        item,
        point,
        locality: normaliseLocality((toLocality?.(item) ?? '').trim()),
        trusted: options.isLocalityTrusted?.(item) ?? true,
      });
    }
  }

  /** The edge the flood fill walks: near enough to ignore the name, or the same named city within
   *  the metropolitan radius. See the file header for why it is not one of those alone. */
  /** The locality strings a map listing actually gave us, anywhere in the library. See the header
   *  for why the gate below is conditional on this rather than on trust alone. */
  const verifiedNames = new Set<string>();
  for (const entry of located) {
    if (entry.trusted && entry.locality !== '') verifiedNames.add(entry.locality);
  }

  const linked = (
    a: { point: GeoPoint; locality: string; trusted: boolean },
    b: { point: GeoPoint; locality: string; trusted: boolean },
  ): boolean => {
    const km = haversineKm(a.point, b.point);
    if (km <= nearKm) return true;
    if (km > radiusKm) return false;
    if (toLocality === undefined) return true;
    if (a.locality === '' || a.locality !== b.locality) return false;
    // A guessed label may not reach across the metropolitan radius on a name we have a verified
    // spelling of. Where nothing is verified it keeps its reach — see the header.
    if (!verifiedNames.has(a.locality)) return true;
    return a.trusted && b.trusted;
  };

  const clusters: GeoCluster<T>[] = [];
  // Everything not yet claimed by a cluster, in input order. Claiming removes it, so the outer loop
  // terminates and no item can land in two clusters.
  const unclaimed = [...located];

  while (unclaimed.length > 0) {
    const seed = unclaimed.shift();
    if (seed === undefined) break;

    // Flood fill. `frontier` holds the members whose neighbours have not been looked for yet;
    // `members` accumulates the whole cluster.
    const members = [seed];
    const frontier = [seed];

    while (frontier.length > 0) {
      const from = frontier.pop();
      if (from === undefined) break;

      // Backwards, so splicing out a claimed neighbour does not skip the next one.
      for (let index = unclaimed.length - 1; index >= 0; index -= 1) {
        const candidate = unclaimed[index];
        if (candidate === undefined) continue;
        if (linked(from, candidate)) {
          unclaimed.splice(index, 1);
          members.push(candidate);
          frontier.push(candidate);
        }
      }
    }

    // The fill reaches members in neighbour order, not input order; sorting by the input position
    // is what makes the member list — and so `pickAnchorCluster`'s tiebreaks — reproducible.
    members.sort((left, right) => located.indexOf(left) - located.indexOf(right));

    clusters.push({
      members: members.map((entry) => entry.item),
      bounds: boundsOf(members.map((entry) => entry.point)),
      count: members.length,
    });
  }

  return clusters;
}

export interface AnchorOptions<T> {
  /**
   * Where the camera was last time, if the caller has it and considers it still fresh. **Recency is
   * the caller's judgement, not this function's** — persistence and staleness belong to the
   * integration layer; this module never reads `localStorage` or `window`.
   */
  readonly lastCamera?: GeoPoint | null;
  /** The most recently saved place's id, if known. */
  readonly recentItemId?: string | null;
  /** How to read an item's id. Required only if `recentItemId` is supplied. */
  readonly toId?: (item: T) => string;
}

/**
 * How far the camera is from a cluster, in kilometres, measured to the nearest point of the
 * cluster's bounding box — zero when the camera sits inside it.
 *
 * The box rather than the members, because a `GeoCluster` deliberately carries no points: widening
 * the type so this one internal check could measure exact member distances would add a field every
 * UI consumer has to carry and none of them reads. The box over-estimates the cluster's extent, so
 * this answers "is the camera over these pins?" generously — the right direction to be wrong in,
 * since returning the user roughly where they were beats resetting them.
 */
function cameraDistanceKm<T>(cluster: GeoCluster<T>, camera: GeoPoint): number {
  const { north, south, east, west } = cluster.bounds;
  const nearest: GeoPoint = {
    lat: Math.min(north, Math.max(south, camera.lat)),
    lng: Math.min(east, Math.max(west, camera.lng)),
  };
  return haversineKm(camera, nearest);
}

/**
 * Which cluster the camera opens on. The resolution order is `current-state.md` §9.1's, and each
 * step exists for a different reason:
 *
 *  1. **The last camera**, if the caller supplies a valid one and some cluster owns it. Returning
 *     the user where they left off is the difference between a map that remembers and a map that
 *     resets; the caller decides how old is too old.
 *  2. **The cluster holding the most recently saved place.** On a fresh session the thing the user
 *     just did is the best guess at where they are working.
 *  3. **The largest cluster** — the most of their library they can see at once.
 *
 * Ties on (3) are broken **deterministically, never randomly**: the westernmost cluster wins, then
 * the northernmost, then the earlier one in input order (which `clusterByProximity` fixes as the
 * order of each cluster's first member). The specific ordering carries no meaning — its only job is
 * that the same library always produces the same camera, so the map does not jump between renders.
 *
 * Returns `null` for an empty cluster list; there is nothing to look at and the caller owns the
 * zero-places view.
 */
export function pickAnchorCluster<T>(
  clusters: readonly GeoCluster<T>[],
  options: AnchorOptions<T> = {},
  clusterOptions: ClusterOptions = {},
): GeoCluster<T> | null {
  if (clusters.length === 0) return null;

  const radiusKm = clusterOptions.radiusKm ?? DEFAULT_CLUSTER_RADIUS_KM;

  if (isValidPoint(options.lastCamera)) {
    const camera = options.lastCamera;
    let best: GeoCluster<T> | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      const distance = cameraDistanceKm(cluster, camera);
      // Strictly closer, so a tie leaves the earlier cluster in place and the choice stays stable.
      if (distance <= radiusKm && distance < bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }

    if (best !== null) return best;
  }

  const { recentItemId, toId } = options;
  if (recentItemId != null && recentItemId !== '' && toId) {
    const holder = clusters.find((cluster) =>
      cluster.members.some((member) => toId(member) === recentItemId),
    );
    if (holder) return holder;
  }

  let largest: GeoCluster<T> | null = null;
  for (const cluster of clusters) {
    if (largest === null || outranks(cluster, largest)) largest = cluster;
  }

  return largest;
}

/** The deterministic "largest cluster" order: more members, then further west, then further north.
 *  Strictly-greater at every step, so an exact tie keeps whichever cluster came first — and cluster
 *  order is input order, which `clusterByProximity` fixes. */
function outranks<T>(candidate: GeoCluster<T>, incumbent: GeoCluster<T>): boolean {
  if (candidate.count !== incumbent.count) return candidate.count > incumbent.count;
  if (candidate.bounds.west !== incumbent.bounds.west) {
    return candidate.bounds.west < incumbent.bounds.west;
  }
  return candidate.bounds.north > incumbent.bounds.north;
}

/**
 * The cluster's display label: the **most common spelling of a locality inside it**, returned in its
 * raw form so the user reads `Tel Aviv-Yafo`, not `tel aviv yafo`.
 *
 * Counting is done on `normalise()` — the project's single answer to "are these the same text?"
 * (`current-state.md` §7) — so `Tel Aviv` and `tel aviv` are one spelling for counting purposes,
 * while `Tel Aviv` and `Tel Aviv-Yafo` remain two (they are genuinely different strings and the
 * user typed neither; picking between them is what the count is for).
 *
 * `null` in exactly two cases, and both mean the same thing to the caller — render "this area":
 *  - the cluster has no localities at all;
 *  - two or more spellings tie for most common. Guessing here would put a coin-flip city name in the
 *    sheet header, and a header that changes between renders is worse than a vaguer one.
 *
 * Within the winning spelling, the most frequent raw form wins, and a tie between raw forms of the
 * *same* spelling falls back to the first one seen — that is a display-casing choice, not a
 * which-city choice, so it does not deserve a `null`.
 */
export function clusterLabel<T>(
  cluster: GeoCluster<T>,
  toLocality: (item: T) => string | null | undefined,
): string | null {
  const groups = new Map<string, { total: number; raw: Map<string, number> }>();

  for (const member of cluster.members) {
    const raw = toLocality(member);
    if (raw == null) continue;
    const trimmed = raw.trim();
    const key = normaliseLocality(trimmed);
    if (key === '') continue;

    const group = groups.get(key) ?? { total: 0, raw: new Map<string, number>() };
    group.total += 1;
    group.raw.set(trimmed, (group.raw.get(trimmed) ?? 0) + 1);
    groups.set(key, group);
  }

  if (groups.size === 0) return null;

  let best: { total: number; raw: Map<string, number> } | null = null;
  let tied = false;
  for (const group of groups.values()) {
    if (best === null || group.total > best.total) {
      best = group;
      tied = false;
    } else if (group.total === best.total) {
      tied = true;
    }
  }

  if (best === null || tied) return null;

  let label: string | null = null;
  let labelCount = 0;
  for (const [raw, count] of best.raw) {
    if (count > labelCount) {
      label = raw;
      labelCount = count;
    }
  }

  return label;
}

/** Named so the import above reads as what it is used for, and so a future locality-specific rule
 *  (stripping a `-Yafo` style suffix, say) has one place to land rather than being sprinkled. */
function normaliseLocality(input: string): string {
  return normalise(input);
}
