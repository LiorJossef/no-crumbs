/**
 * `domain/places/clusters.ts` — geographic clustering and camera-anchor selection (`L1-F5-T2a`).
 *
 * The fixtures are the **real library shape** that motivated the work: 12 London places and 8 Tel
 * Aviv places, whose localities are spelled three different ways for two cities (`London`,
 * `Tel Aviv-Yafo`, `Tel Aviv`). That is not a contrived edge case — it is what is in the database
 * right now, because the rows came from different resolutions, and it is exactly why the grouping
 * is geometric and only the *label* looks at the string.
 *
 * Coordinates are real to about a neighbourhood: they need to be far enough apart to prove a
 * single-link chain holds a city together, and 3,500 km apart between the two cities.
 */

import { describe, expect, it } from 'vitest';

import {
  clusterByProximity,
  clusterLabel,
  DEFAULT_CLUSTER_RADIUS_KM,
  haversineKm,
  isValidPoint,
  pickAnchorCluster,
  type GeoCluster,
  type GeoPoint,
} from '@/domain/places/clusters';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly locality: string | null;
}

const toPoint = (row: Row): GeoPoint => ({ lat: row.lat, lng: row.lng });
/** Index access with `noUncheckedIndexedAccess` on: a missing fixture is a broken test, not a
 *  `possibly undefined` to be silenced at every call site. */
const at = <T,>(list: readonly T[], index: number): T => {
  const found = list[index];
  if (found === undefined) throw new Error(`no element at ${index}`);
  return found;
};
const toId = (row: Row): string => row.id;
const toLocality = (row: Row): string | null => row.locality;
const names = (cluster: GeoCluster<Row>): readonly string[] =>
  cluster.members.map((row) => row.name);

const LONDON: readonly Row[] = [
  { id: 'l1', name: 'La Nonna Brixton', lat: 51.4613, lng: -0.1156, locality: 'London' },
  { id: 'l2', name: 'Sycamore Vino Cucina', lat: 51.5416, lng: -0.1425, locality: 'London' },
  { id: 'l3', name: 'The Laughing Yak', lat: 51.5245, lng: -0.0785, locality: 'London' },
  { id: 'l4', name: 'MBER London', lat: 51.5155, lng: -0.1416, locality: 'London' },
  { id: 'l5', name: 'Brat', lat: 51.5241, lng: -0.0757, locality: 'London' },
  { id: 'l6', name: 'St. John', lat: 51.5205, lng: -0.1015, locality: 'London' },
  { id: 'l7', name: 'Kiln', lat: 51.5117, lng: -0.1338, locality: 'London' },
  { id: 'l8', name: 'Bao Soho', lat: 51.5137, lng: -0.1345, locality: 'London' },
  { id: 'l9', name: 'Padella', lat: 51.5053, lng: -0.0912, locality: 'London' },
  { id: 'l10', name: 'Lyle’s', lat: 51.5241, lng: -0.0776, locality: 'London' },
  // Richmond and Croydon: real greater-London saves, ~20 km out, which is what the single-link
  // chain has to hold together without a second cluster appearing.
  { id: 'l11', name: 'Petersham Nurseries', lat: 51.4479, lng: -0.3021, locality: 'London' },
  { id: 'l12', name: 'Fanoos', lat: 51.3762, lng: -0.0982, locality: 'London' },
];

const TEL_AVIV: readonly Row[] = [
  { id: 't1', name: 'Café Florentin', lat: 32.0562, lng: 34.7702, locality: 'Tel Aviv-Yafo' },
  { id: 't2', name: 'Nordoy Café', lat: 32.0632, lng: 34.7699, locality: 'Tel Aviv-Yafo' },
  { id: 't3', name: 'HaKosem', lat: 32.0704, lng: 34.7716, locality: 'Tel Aviv' },
  { id: 't4', name: 'Anat Bakery', lat: 32.0576, lng: 34.7688, locality: 'Tel Aviv' },
  { id: 't5', name: 'Container', lat: 32.0505, lng: 34.7524, locality: 'Tel Aviv' },
  { id: 't6', name: 'Port Said', lat: 32.0640, lng: 34.7745, locality: 'Tel Aviv' },
  { id: 't7', name: 'Miznon', lat: 32.0724, lng: 34.7735, locality: 'Tel Aviv' },
  { id: 't8', name: 'Shlomo & Doron', lat: 32.0679, lng: 34.7690, locality: 'Tel Aviv' },
];

const LIBRARY: readonly Row[] = [...LONDON, ...TEL_AVIV];

describe('haversineKm', () => {
  it('is zero for a point against itself', () => {
    expect(haversineKm({ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.1 })).toBe(0);
  });

  it('measures London → Tel Aviv at roughly 3,570 km', () => {
    const distance = haversineKm({ lat: 51.5074, lng: -0.1278 }, { lat: 32.0853, lng: 34.7818 });
    expect(distance).toBeGreaterThan(3500);
    expect(distance).toBeLessThan(3650);
  });

  it('measures a within-city hop in single-digit kilometres', () => {
    // Soho → Shoreditch, about 4 km.
    const distance = haversineKm({ lat: 51.5137, lng: -0.1345 }, { lat: 51.5241, lng: -0.0776 });
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(5);
  });

  it('is symmetric', () => {
    const a = { lat: 32.0853, lng: 34.7818 };
    const b = { lat: 51.5074, lng: -0.1278 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it('measures across the antimeridian as a short hop, not a trip round the world', () => {
    // Documented in the module header: *distance* wraps correctly even though the bounding box
    // does not. This asserts the half that works so a future wrap fix cannot silently break it.
    const distance = haversineKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 });
    expect(distance).toBeLessThan(120);
  });
});

describe('isValidPoint', () => {
  it('accepts a real coordinate and rejects the ways one goes missing', () => {
    expect(isValidPoint({ lat: 32.06, lng: 34.77 })).toBe(true);
    expect(isValidPoint(null)).toBe(false);
    expect(isValidPoint(undefined)).toBe(false);
    expect(isValidPoint({ lat: Number.NaN, lng: 34.77 })).toBe(false);
    // The swapped-axis mistake, which is only catchable when one value is out of latitude range.
    expect(isValidPoint({ lat: 174.76, lng: -36.85 })).toBe(false);
  });
});

describe('clusterByProximity', () => {
  it('returns nothing for an empty library', () => {
    expect(clusterByProximity([], toPoint)).toEqual([]);
  });

  it('puts a single place in one cluster with a zero-area bounding box', () => {
    // Zero area is correct and is *not* this module's problem to soften: capping the zoom so the
    // user does not land on a blank tile is the caller's job (§9.3, "one place is shown with
    // surrounding context"). Inventing padding here would silently pick a zoom level.
    const clusters = clusterByProximity([at(TEL_AVIV, 0)], toPoint);
    expect(clusters).toHaveLength(1);
    expect(at(clusters, 0).count).toBe(1);
    expect(at(clusters, 0).bounds).toEqual({
      north: 32.0562,
      south: 32.0562,
      east: 34.7702,
      west: 34.7702,
    });
  });

  it('keeps one city together', () => {
    const clusters = clusterByProximity(TEL_AVIV, toPoint);
    expect(clusters).toHaveLength(1);
    expect(at(clusters, 0).count).toBe(8);
  });

  it('splits two cities that are far apart', () => {
    const clusters = clusterByProximity([at(TEL_AVIV, 0), at(LONDON, 0)], toPoint);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((cluster) => cluster.count)).toEqual([1, 1]);
  });

  it('produces exactly two clusters for the real 12-London + 8-Tel-Aviv library', () => {
    const clusters = clusterByProximity(LIBRARY, toPoint);
    expect(clusters).toHaveLength(2);
    // Cluster order follows input order, so London (the first row) comes first.
    expect(at(clusters, 0).count).toBe(12);
    expect(at(clusters, 1).count).toBe(8);
    expect(clusterLabel(at(clusters, 0), toLocality)).toBe('London');
    expect(clusterLabel(at(clusters, 1), toLocality)).toBe('Tel Aviv');
  });

  it('holds a chain together transitively even where the ends are further apart than the radius', () => {
    // Three points 40 km apart in a line: the ends are 80 km apart, which is over the radius, but
    // single-link means they are one cluster. This is the property that keeps greater London whole.
    const chain: Row[] = [
      { id: 'a', name: 'A', lat: 0, lng: 0, locality: null },
      { id: 'b', name: 'B', lat: 0, lng: 0.36, locality: null },
      { id: 'c', name: 'C', lat: 0, lng: 0.72, locality: null },
    ];
    expect(haversineKm(toPoint(at(chain, 0)), toPoint(at(chain, 2)))).toBeGreaterThan(
      DEFAULT_CLUSTER_RADIUS_KM,
    );
    const clusters = clusterByProximity(chain, toPoint);
    expect(clusters).toHaveLength(1);
    expect(names(at(clusters, 0))).toEqual(['A', 'B', 'C']);
  });

  it('honours a caller-supplied radius', () => {
    const tight = clusterByProximity(LIBRARY, toPoint, { radiusKm: 1 });
    expect(tight.length).toBeGreaterThan(2);

    const loose = clusterByProximity(LIBRARY, toPoint, { radiusKm: 5000 });
    expect(loose).toHaveLength(1);
    expect(at(loose, 0).count).toBe(20);
  });

  it('drops places with no usable coordinate rather than inventing a Null Island cluster', () => {
    const withBroken: Row[] = [
      ...TEL_AVIV,
      { id: 'x', name: 'Unresolved', lat: Number.NaN, lng: Number.NaN, locality: 'Tel Aviv' },
    ];
    const clusters = clusterByProximity(withBroken, toPoint);
    expect(clusters).toHaveLength(1);
    expect(at(clusters, 0).count).toBe(8);
    expect(names(at(clusters, 0))).not.toContain('Unresolved');
  });

  it('computes a bounding box that contains every member', () => {
    const london = at(clusterByProximity(LONDON, toPoint), 0);
    expect(london.bounds.north).toBeCloseTo(51.5416, 4);
    expect(london.bounds.south).toBeCloseTo(51.3762, 4);
    expect(london.bounds.east).toBeCloseTo(-0.0757, 4);
    expect(london.bounds.west).toBeCloseTo(-0.3021, 4);
    for (const row of LONDON) {
      expect(row.lat).toBeLessThanOrEqual(london.bounds.north);
      expect(row.lat).toBeGreaterThanOrEqual(london.bounds.south);
      expect(row.lng).toBeLessThanOrEqual(london.bounds.east);
      expect(row.lng).toBeGreaterThanOrEqual(london.bounds.west);
    }
  });

  it('is deterministic — the same library always produces the same clusters', () => {
    const once = clusterByProximity(LIBRARY, toPoint);
    const twice = clusterByProximity(LIBRARY, toPoint);
    expect(twice.map(names)).toEqual(once.map(names));
  });
});

describe('clusterLabel', () => {
  const clusterOf = (rows: readonly Row[]): GeoCluster<Row> =>
    at(clusterByProximity(rows, toPoint), 0);

  it('labels the three-spellings-for-two-cities case with the most common spelling', () => {
    // The case §9.1 names explicitly: one coordinate cluster whose members say `Tel Aviv-Yafo`,
    // `Tel Aviv`, `Tel Aviv`. `Tel Aviv` wins 2–1, and `Tel Aviv-Yafo` is a *different* spelling
    // for counting purposes even though it is the same city — which is the whole point of counting.
    const cluster = clusterOf([at(TEL_AVIV, 0), at(TEL_AVIV, 2), at(TEL_AVIV, 3)]);
    expect(cluster.count).toBe(3);
    expect(clusterLabel(cluster, toLocality)).toBe('Tel Aviv');
  });

  it('returns the raw spelling, not the normalised one', () => {
    const cluster = clusterOf([at(TEL_AVIV, 0), at(TEL_AVIV, 1)]);
    expect(clusterLabel(cluster, toLocality)).toBe('Tel Aviv-Yafo');
  });

  it('treats casing and accent differences as the same spelling', () => {
    const rows: Row[] = [
      { id: 'a', name: 'A', lat: 32.06, lng: 34.77, locality: 'Tel Aviv' },
      { id: 'b', name: 'B', lat: 32.07, lng: 34.78, locality: 'tel aviv' },
      { id: 'c', name: 'C', lat: 32.08, lng: 34.76, locality: 'Tel Aviv-Yafo' },
    ];
    // `Tel Aviv` + `tel aviv` is one spelling with two members, so it beats `Tel Aviv-Yafo` and
    // the display form is the more frequent raw string — here a tie inside the winning group,
    // resolved to the first seen rather than to `null`: it is a casing choice, not a city choice.
    expect(clusterLabel(clusterOf(rows), toLocality)).toBe('Tel Aviv');
  });

  it('returns null on a tie between two spellings', () => {
    const cluster = clusterOf([at(TEL_AVIV, 0), at(TEL_AVIV, 2)]);
    expect(cluster.count).toBe(2);
    expect(clusterLabel(cluster, toLocality)).toBeNull();
  });

  it('returns null when no member has a locality at all', () => {
    const rows: Row[] = [
      { id: 'a', name: 'A', lat: 32.06, lng: 34.77, locality: null },
      { id: 'b', name: 'B', lat: 32.07, lng: 34.78, locality: '  ' },
    ];
    expect(clusterLabel(clusterOf(rows), toLocality)).toBeNull();
  });

  it('ignores members with no locality when counting the ones that have it', () => {
    const rows: Row[] = [
      { id: 'a', name: 'A', lat: 32.06, lng: 34.77, locality: null },
      { id: 'b', name: 'B', lat: 32.07, lng: 34.78, locality: 'Tel Aviv' },
    ];
    expect(clusterLabel(clusterOf(rows), toLocality)).toBe('Tel Aviv');
  });
});

describe('pickAnchorCluster', () => {
  const clusters = clusterByProximity(LIBRARY, toPoint);
  const london = at(clusters, 0);
  const telAviv = at(clusters, 1);

  it('returns null when there is nothing saved', () => {
    expect(pickAnchorCluster([], { lastCamera: { lat: 51.5, lng: -0.1 } })).toBeNull();
  });

  it('branch (a): a valid last camera wins, even over the larger cluster', () => {
    const anchored = pickAnchorCluster(clusters, {
      lastCamera: { lat: 32.0668, lng: 34.7647 },
      recentItemId: 'l1',
      toId,
    });
    expect(anchored).toBe(telAviv);
  });

  it('branch (a): a last camera just outside the box still belongs to the nearby cluster', () => {
    // Herzliya, ~13 km north of the Tel Aviv box — the user panned off their pins slightly and
    // should come back to Tel Aviv, not be thrown to London.
    const anchored = pickAnchorCluster(clusters, { lastCamera: { lat: 32.1624, lng: 34.8443 } });
    expect(anchored).toBe(telAviv);
  });

  it('branch (a): a last camera nowhere near anything falls through to the next rule', () => {
    // Mid-Atlantic. Nothing owns it, so the recent-place rule gets its turn.
    const anchored = pickAnchorCluster(clusters, {
      lastCamera: { lat: 30, lng: -40 },
      recentItemId: 't3',
      toId,
    });
    expect(anchored).toBe(telAviv);
  });

  it('branch (a): an invalid last camera is ignored rather than trusted', () => {
    const anchored = pickAnchorCluster(clusters, {
      lastCamera: { lat: Number.NaN, lng: Number.NaN },
      recentItemId: 't3',
      toId,
    });
    expect(anchored).toBe(telAviv);
  });

  it('branch (b): with no camera, the cluster holding the most recent save wins', () => {
    expect(pickAnchorCluster(clusters, { recentItemId: 't5', toId })).toBe(telAviv);
    expect(pickAnchorCluster(clusters, { recentItemId: 'l7', toId })).toBe(london);
  });

  it('branch (b): an id that matches nothing falls through to the largest cluster', () => {
    expect(pickAnchorCluster(clusters, { recentItemId: 'deleted-row', toId })).toBe(london);
  });

  it('branch (c): with no hints at all, the largest cluster wins', () => {
    expect(pickAnchorCluster(clusters)).toBe(london);
    expect(pickAnchorCluster(clusters)?.count).toBe(12);
  });

  it('branch (c): the largest-cluster tiebreak is deterministic and westernmost-first', () => {
    const balanced: Row[] = [
      { id: 'e1', name: 'East 1', lat: 32.06, lng: 34.77, locality: 'Tel Aviv' },
      { id: 'e2', name: 'East 2', lat: 32.07, lng: 34.78, locality: 'Tel Aviv' },
      { id: 'w1', name: 'West 1', lat: 51.51, lng: -0.13, locality: 'London' },
      { id: 'w2', name: 'West 2', lat: 51.52, lng: -0.08, locality: 'London' },
    ];
    const tied = clusterByProximity(balanced, toPoint);
    expect(tied.map((cluster) => cluster.count)).toEqual([2, 2]);
    // Tel Aviv is first in input order but London is further west, so the tiebreak — not the input
    // order — decides, and it decides the same way every time.
    const anchored = pickAnchorCluster(tied);
    expect(anchored && names(anchored)).toEqual(['West 1', 'West 2']);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(pickAnchorCluster(clusterByProximity(balanced, toPoint))?.bounds).toEqual(
        anchored?.bounds,
      );
    }
  });

  it('branch (c): reversing the input order does not change the tiebreak result', () => {
    const balanced: Row[] = [
      { id: 'w1', name: 'West 1', lat: 51.51, lng: -0.13, locality: 'London' },
      { id: 'e1', name: 'East 1', lat: 32.06, lng: 34.77, locality: 'Tel Aviv' },
    ];
    const forward = pickAnchorCluster(clusterByProximity(balanced, toPoint));
    const reverse = pickAnchorCluster(clusterByProximity([...balanced].reverse(), toPoint));
    expect(forward && names(forward)).toEqual(['West 1']);
    expect(reverse && names(reverse)).toEqual(['West 1']);
  });

  it('needs `toId` to use the recent-place rule, and degrades rather than throwing without it', () => {
    expect(pickAnchorCluster(clusters, { recentItemId: 't5' })).toBe(london);
  });
});
