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
 * ## Why coordinates and never the `locality` string
 *
 * This is called out explicitly in §9.1 and it is not hypothetical: the live library holds
 * `London`, `Tel Aviv-Yafo`, `Tel Aviv` and `Tel Aviv` — **three spellings for two cities** —
 * because the rows came from different resolutions of the same place. Grouping on the string ships
 * that defect straight to the user as duplicate city rows. Coordinates cannot disagree with
 * themselves, so grouping is geometric and the string is used for one thing only: choosing a label
 * *after* the group exists (`clusterLabel`), where being wrong costs a word rather than a group.
 *
 * ## Why single-link at ~50 km, and why O(n²)
 *
 * Single-link (two places are in the same cluster if they are within the radius of *each other*,
 * transitively) is the rule that matches how people think about "places in a city": a chain of
 * neighbourhoods across greater London stays one London, while Tel Aviv is 3,500 km away and can
 * never join. 50 km is a metropolitan area, comfortably larger than any city's spread and far
 * smaller than the gap between two cities anyone saves places in. It is a default, not a law —
 * `options.radiusKm` overrides it — but it is not a knob the UI should be turning per render.
 *
 * The library is at most a few hundred rows, so the naive all-pairs flood fill is microseconds and
 * is readable at a glance. A spatial index here would be speculative machinery defending against a
 * library size this product does not have; when it does, this function's signature does not change.
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

/** ~50 km: a metropolitan area. See the file header for why this number and not a tuned one. */
export const DEFAULT_CLUSTER_RADIUS_KM = 50;

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

export interface ClusterOptions {
  /** Single-link radius in kilometres. Defaults to `DEFAULT_CLUSTER_RADIUS_KM`. */
  readonly radiusKm?: number;
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
  options: ClusterOptions = {},
): readonly GeoCluster<T>[] {
  const radiusKm = options.radiusKm ?? DEFAULT_CLUSTER_RADIUS_KM;

  const located: { item: T; point: GeoPoint }[] = [];
  for (const item of items) {
    const point = toPoint(item);
    if (isValidPoint(point)) located.push({ item, point });
  }

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
        if (haversineKm(from.point, candidate.point) <= radiusKm) {
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
