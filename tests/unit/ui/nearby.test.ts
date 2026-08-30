import { describe, expect, it } from 'vitest';

import {
  NEAR_ME_MAX_KM,
  distancesFromUser,
  nearbyDistanceLabel,
  nearbyPlaces,
  nearestArea,
  nearestFirst,
  type NearbyCandidate,
} from '@/ui/place/nearby';
import { DEFAULT_CLUSTER_RADIUS_KM } from '@/domain/places/clusters';

/** Real Tel Aviv coordinates from the local library, so the distances below are real distances. */
const KOHI = { id: 'kohi', name: 'Kohi', lat: 32.0883, lng: 34.7733 };
const HAKOSEM = { id: 'hakosem', name: 'HaKosem', lat: 32.0764, lng: 34.7767 };
const GELALUCCI = { id: 'gelalucci', name: 'Gelalucci', lat: 32.078, lng: 34.7779 };
const LONDON = { id: 'london', name: 'The Life Goddess', lat: 51.5141, lng: -0.1235 };

const ALL: readonly NearbyCandidate[] = [KOHI, HAKOSEM, GELALUCCI, LONDON];

describe('nearbyPlaces', () => {
  it('finds the places within a short walk, nearest first', () => {
    // Real distances from the local library: Kohi -> Gelalucci 1.225 km, Kohi -> HaKosem 1.361 km.
    // Both are outside the 1 km default, which is why this case names its own radius; measured
    // across all 32 saved places, 1 km still gives 30 of them a neighbour with a median of 2.
    const near = nearbyPlaces(KOHI, ALL, { maxKm: 2 });
    expect(near.map((p) => p.id)).toEqual(['gelalucci', 'hakosem']);
    expect(near[0]!.km).toBeLessThan(near[1]!.km);
  });

  it('never lists the place you are looking at', () => {
    expect(nearbyPlaces(KOHI, ALL, { maxKm: 2 }).map((p) => p.id)).not.toContain('kohi');
  });

  it('never lists another row of the same venue back at you', () => {
    // Opening one of the three `HaKosem` rows listed the other two as neighbours — "HaKosem is
    // 500 m from HaKosem". Same name, different row, and the user reads it as a bug.
    const twin: readonly NearbyCandidate[] = [
      { id: 'hakosem-2', name: 'Ha Kosem', lat: 32.0805, lng: 34.7767 },
      { id: 'gelalucci', name: 'Gelalucci', lat: 32.078, lng: 34.7779 },
    ];
    expect(nearbyPlaces(HAKOSEM, twin, { maxKm: 5 }).map((p) => p.id)).toEqual(['gelalucci']);
  });

  it('says nothing rather than reaching for a neighbour that is not near', () => {
    // The point of the radius. A saved place with nothing around it must render no section — a
    // section that is always full stops carrying information.
    expect(nearbyPlaces(LONDON, ALL)).toEqual([]);
  });

  it('caps the list, because this is a hint inside a detail view and not a second list', () => {
    const crowd = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      name: `Place ${i}`,
      lat: 32.0883 + i * 0.0005,
      lng: 34.7733,
    }));
    expect(nearbyPlaces(KOHI, crowd, { maxKm: 5 })).toHaveLength(3);
  });

  it('orders identically on two runs when two places share a coordinate', () => {
    // The library holds real duplicate pairs 1.11 m apart. Without the id tiebreak the section
    // would reorder itself between two renders of the same place.
    const twins: readonly NearbyCandidate[] = [
      { id: 'b', name: 'Twin B', lat: 32.0764, lng: 34.7767 },
      { id: 'a', name: 'Twin A', lat: 32.0764, lng: 34.7767 },
    ];
    expect(nearbyPlaces(KOHI, twins, { maxKm: 5 }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(nearbyPlaces(KOHI, [...twins].reverse(), { maxKm: 5 }).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('nearbyPlaces — the library has duplicate rows and this is a hint, not an inventory', () => {
  it('shows one row per venue, keeping the nearest', () => {
    // Live: `HaKosem` exists three times across 568 m. Before this, the section rendered
    // `HaKosem 500 m · HaKosem 550 m` inside a three-item hint, which reads as the product being
    // broken rather than as two rows.
    // Ids name their distance *from Kohi*, which is what the ordering is about.
    const dupes: readonly NearbyCandidate[] = [
      { id: 'hakosem-farther', name: 'HaKosem', lat: 32.0764, lng: 34.7767 },
      { id: 'hakosem-nearer', name: 'HaKosem', lat: 32.0805, lng: 34.7767 },
      { id: 'gelalucci', name: 'Gelalucci', lat: 32.078, lng: 34.7779 },
    ];
    const near = nearbyPlaces(KOHI, dupes, { maxKm: 5 });
    expect(near.map((p) => p.name)).toEqual(['HaKosem', 'Gelalucci']);
    expect(near.find((p) => p.name === 'HaKosem')?.id).toBe('hakosem-nearer');
  });

  it('does not collapse rows whose names normalise away to nothing', () => {
    const blanks: readonly NearbyCandidate[] = [
      { id: 'a', name: '???', lat: 32.0764, lng: 34.7767 },
      { id: 'b', name: '!!!', lat: 32.0765, lng: 34.7767 },
    ];
    expect(nearbyPlaces(KOHI, blanks, { maxKm: 5 })).toHaveLength(2);
  });
});

describe('nearbyDistanceLabel', () => {
  it('rounds metres to 50, because the coordinate can be the model reading a caption', () => {
    expect(nearbyDistanceLabel(0.312)).toBe('300 m');
    expect(nearbyDistanceLabel(0.33)).toBe('350 m');
  });

  it('never says 0 m for a place that is not the one you are on', () => {
    expect(nearbyDistanceLabel(0.001)).toBe('50 m');
  });

  it('switches to one decimal at a kilometre', () => {
    expect(nearbyDistanceLabel(1)).toBe('1.0 km');
    expect(nearbyDistanceLabel(1.24)).toBe('1.2 km');
  });
});

/**
 * Near me (`L1-F11`). The origin is the user, not the map, and these are the three functions the
 * list side of that is made of. Coordinates are the same real Tel Aviv and London rows as above, so
 * every distance below is a distance that exists.
 */
const DIZENGOFF_SQUARE = { lat: 32.0787, lng: 34.7743 };

describe('distancesFromUser', () => {
  it('measures the places that are actually near you', () => {
    const distances = distancesFromUser(DIZENGOFF_SQUARE, ALL);
    expect(distances.get('kohi')).toBeCloseTo(1.07, 1);
    expect(distances.get('hakosem')).toBeCloseTo(0.34, 1);
  });

  it('leaves out what is beyond reach rather than labelling it 3,600 km', () => {
    // Standing in Tel Aviv, a London row gets no distance at all. A number that large is
    // arithmetic, not information, and it would push the rows that matter down the list.
    const distances = distancesFromUser(DIZENGOFF_SQUARE, ALL);
    expect(distances.has('london')).toBe(false);
  });

  it('reaches exactly as far as an area does', () => {
    expect(NEAR_ME_MAX_KM).toBe(DEFAULT_CLUSTER_RADIUS_KM);
    const justInside = { id: 'edge', lat: 32.0787 + 0.4, lng: 34.7743 };
    const justOutside = { id: 'far', lat: 32.0787 + 0.6, lng: 34.7743 };
    const distances = distancesFromUser(DIZENGOFF_SQUARE, [justInside, justOutside]);
    expect(distances.has('edge')).toBe(true);
    expect(distances.has('far')).toBe(false);
  });
});

describe('nearestFirst', () => {
  it('lifts the places near you to the top, nearest first', () => {
    const distances = distancesFromUser(DIZENGOFF_SQUARE, ALL);
    expect(nearestFirst(ALL, distances).map((p) => p.id)).toEqual([
      'hakosem',
      'gelalucci',
      'kohi',
      'london',
    ]);
  });

  it('leaves everything beyond reach in the order the library gave it', () => {
    // Two London rows with no distance keep their library order (most recently saved first) behind
    // the measured ones, rather than being sorted by a number they do not have.
    const rows = [
      { id: 'london-new' },
      { id: 'london-old' },
      { id: 'kohi' },
    ];
    const distances = new Map([['kohi', 1.13]]);
    expect(nearestFirst(rows, distances).map((p) => p.id)).toEqual([
      'kohi',
      'london-new',
      'london-old',
    ]);
  });

  it('is the identity, by reference, when nothing is near you', () => {
    // Every render before anyone presses the control, and every fix taken far from the library.
    // Returning the same array is what stops the list re-rendering for a measurement that changed
    // nothing.
    expect(nearestFirst(ALL, new Map())).toBe(ALL);
  });
});

describe('nearestArea', () => {
  const TEL_AVIV = { id: 'kohi', points: [KOHI, HAKOSEM, GELALUCCI] };
  const LONDON_AREA = { id: 'london', points: [LONDON] };
  const AREAS = [TEL_AVIV, LONDON_AREA];

  it('picks the area you are standing in', () => {
    expect(nearestArea(AREAS, DIZENGOFF_SQUARE)?.id).toBe('kohi');
  });

  it('measures to the nearest member, never to the middle of the cluster', () => {
    // An area is a ~50 km cluster, so its mean can sit kilometres from every place in it. Measuring
    // to the mean would tell someone standing outside one of their own cafés that they are
    // somewhere else.
    const spread = { id: 'spread', points: [KOHI, { lat: 32.4, lng: 34.9 }] };
    expect(nearestArea([spread], KOHI)?.id).toBe('spread');
  });

  it('says nothing rather than handing you an area you are not in', () => {
    // Ashkelon-ish: inside Israel, 50+ km from every saved place. The camera still flies to the
    // user; the list keeps the area they were reading.
    expect(nearestArea(AREAS, { lat: 31.6, lng: 34.55 })).toBeNull();
  });

  it('answers identically for two equidistant areas, whatever order they arrive in', () => {
    const left = { id: 'aaa', points: [{ lat: 32.0787, lng: 34.7643 }] };
    const right = { id: 'zzz', points: [{ lat: 32.0787, lng: 34.7843 }] };
    expect(nearestArea([left, right], DIZENGOFF_SQUARE)?.id).toBe('aaa');
    expect(nearestArea([right, left], DIZENGOFF_SQUARE)?.id).toBe('aaa');
  });
});
