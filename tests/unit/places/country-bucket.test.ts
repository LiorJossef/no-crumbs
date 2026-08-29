/**
 * Countries as the top level of the library (`docs/ux-library-at-scale.md` §2).
 *
 * The cases that matter are the ones where a naive implementation is silently wrong rather than
 * obviously broken: averaging coordinates across the antimeridian, and a place with no country
 * quietly vanishing from world zoom.
 */

import { describe, expect, it } from 'vitest';

import type { GeoBounds, GeoCluster, GeoPoint } from '@/domain/places/clusters';
import {
  areaCountry,
  bucketAreasByCountry,
  meanCentroid,
} from '@/domain/places/country-bucket';

interface Place {
  readonly lat: number;
  readonly lng: number;
  readonly country: string | null;
}

const place = (lat: number, lng: number, country: string | null): Place => ({ lat, lng, country });

function area(members: readonly Place[]): GeoCluster<Place> {
  const lats = members.map((m) => m.lat);
  const lngs = members.map((m) => m.lng);
  const bounds: GeoBounds = {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
  return { members, bounds, count: members.length };
}

const toCountry = (p: Place): string | null => p.country;
const toPoint = (p: Place): GeoPoint => ({ lat: p.lat, lng: p.lng });

describe('areaCountry', () => {
  it('takes the plurality, so a NULL member does not decide the area', () => {
    const cluster = area([place(51.5, -0.1, 'GB'), place(51.6, -0.2, 'GB'), place(51.4, -0.1, null)]);
    expect(areaCountry(cluster, toCountry)).toBe('GB');
  });

  it('returns null on a tie rather than flipping a coin', () => {
    // A coin flip here moves a country marker across the world between two renders of the same data.
    const cluster = area([place(51.5, -0.1, 'GB'), place(32.1, 34.8, 'IL')]);
    expect(areaCountry(cluster, toCountry)).toBeNull();
  });

  it('returns null when no member carries a country', () => {
    expect(areaCountry(area([place(1, 1, null), place(2, 2, null)]), toCountry)).toBeNull();
  });

  it('normalises case and whitespace, and ignores anything that is not two letters', () => {
    const cluster = area([place(1, 1, ' gb '), place(2, 2, 'GB'), place(3, 3, 'GBR')]);
    expect(areaCountry(cluster, toCountry)).toBe('GB');
  });
});

describe('meanCentroid', () => {
  it('averages nearby points where the naive answer is also correct', () => {
    const mean = meanCentroid([
      { lat: 51.5, lng: -0.1 },
      { lat: 51.7, lng: -0.3 },
    ]);
    expect(mean?.lat).toBeCloseTo(51.6, 3);
    expect(mean?.lng).toBeCloseTo(-0.2, 3);
  });

  it('crosses the antimeridian instead of landing in the wrong ocean', () => {
    // Averaging degrees gives lng 0 — the Gulf of Guinea, a quarter of the planet away.
    const mean = meanCentroid([
      { lat: 0, lng: 179 },
      { lat: 0, lng: -179 },
    ]);
    expect(Math.abs(mean?.lng ?? 0)).toBeCloseTo(180, 3);
    expect(mean?.lat).toBeCloseTo(0, 6);
  });

  it('returns null for no valid points at all', () => {
    expect(meanCentroid([])).toBeNull();
    expect(meanCentroid([{ lat: Number.NaN, lng: 0 }])).toBeNull();
  });

  it('falls back to a real place rather than nothing when the mean direction cancels', () => {
    // Antipodes: the mean direction is undefined. A marker on one of your own places beats no
    // marker, which would delete every place in that country from world zoom.
    const first = { lat: 0, lng: 0 };
    expect(meanCentroid([first, { lat: 0, lng: 180 }])).toEqual(first);
  });
});

describe('bucketAreasByCountry', () => {
  const london = area([place(51.5, -0.1, 'GB'), place(51.6, -0.2, 'GB')]);
  const manchester = area([place(53.5, -2.2, 'GB')]);
  const telAviv = area([place(32.1, 34.8, 'IL'), place(32.0, 34.8, 'IL'), place(32.2, 34.9, 'IL')]);
  const unknown = area([place(10, 10, null)]);

  it('groups areas under their country and totals the places', () => {
    const buckets = bucketAreasByCountry([london, manchester, telAviv], toCountry, toPoint);
    expect(buckets.map((b) => [b.countryCode, b.count])).toEqual([
      ['GB', 3],
      ['IL', 3],
    ]);
  });

  it('orders by count, then by code, so the order does not move between renders', () => {
    const buckets = bucketAreasByCountry([london, manchester, telAviv], toCountry, toPoint);
    // GB and IL tie at 3 here, so the code decides — and it decides the same way every time.
    expect(buckets.map((b) => b.countryCode)).toEqual(['GB', 'IL']);
  });

  it('keeps countryless areas as their own bucket, last, never merged into a real country', () => {
    const buckets = bucketAreasByCountry([unknown, london], toCountry, toPoint);
    expect(buckets.map((b) => b.countryCode)).toEqual(['GB', null]);
    expect(buckets.at(-1)?.count).toBe(1);
  });

  it('loses no place: every member reaches exactly one bucket', () => {
    const areas = [london, manchester, telAviv, unknown];
    const buckets = bucketAreasByCountry(areas, toCountry, toPoint);
    const total = areas.reduce((sum, a) => sum + a.count, 0);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(total);
  });

  it('fits a country to all of its areas, not just the first', () => {
    const [gb] = bucketAreasByCountry([london, manchester], toCountry, toPoint);
    expect(gb?.bounds.north).toBeCloseTo(53.5, 6);
    expect(gb?.bounds.south).toBeCloseTo(51.5, 6);
  });

  it('puts the marker among the places, not at a country centroid', () => {
    // Both UK areas are in England, so the marker must be too — a GB country centroid would sit
    // further north and west than anywhere the user has actually saved.
    const [gb] = bucketAreasByCountry([london, manchester], toCountry, toPoint);
    expect(gb?.centroid.lat).toBeGreaterThan(51.5);
    expect(gb?.centroid.lat).toBeLessThan(53.5);
  });

  it('matches the real library: GB 18, IL 11, 2 unknown across three buckets', () => {
    const gb = area(Array.from({ length: 18 }, (_, i) => place(51.5 + i * 0.01, -0.1, 'GB')));
    const il = area(Array.from({ length: 11 }, (_, i) => place(32.0 + i * 0.01, 34.8, 'IL')));
    const none = area([place(10, 10, null), place(10.1, 10.1, null)]);
    const buckets = bucketAreasByCountry([gb, il, none], toCountry, toPoint);
    expect(buckets.map((b) => [b.countryCode, b.count])).toEqual([
      ['GB', 18],
      ['IL', 11],
      [null, 2],
    ]);
  });
});
