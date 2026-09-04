/**
 * **The map's summary bands say what the map is drawing** — the owner's 2026-09-04 report, as an
 * assertion (`src/components/map/summary-matches.ts`).
 *
 * The defect, reproduced at 1280x900 before this file existed: two tag chips that together match
 * nothing left the sidebar saying `No places match these filters.` while the map went on drawing
 * `תל אביב-יפו 33`, `הרצליה 6`, `ראשון לציון 5`, `תל יצחק 2` and `חיפה 1` — every one of them a
 * count of the unfiltered library, over a map showing no pins at all. Tapping one did nothing,
 * because the surface resolves a framing request against the *filtered* pin set and declined ids
 * that were not in it.
 *
 * So the rule these tests hold is one sentence: **a summary marker counts, and is positioned on,
 * exactly the places the map is drawing beneath it — and where it would draw none, there is no
 * marker.** The dead tap is not tested here because it is not a behaviour: it is what a pill that
 * should not have existed produced, and the fix is the pill's absence.
 *
 * The complementary rule is in the same file's docblock and is asserted at the bottom: the
 * narrowing touches what is *drawn* and nothing else, so it can never move the camera or the scope.
 */

import { describe, expect, it } from 'vitest';

import { buildAreas, type Area } from '@/ui/place/active-area';
import { clusterByProximity } from '@/domain/places/clusters';
import { summariseByCountry, type CountrySummary } from '@/ui/place/library-summary';
import {
  matchingBoundsInCountry,
  summariesForMatches,
} from '@/components/map/summary-matches';
import type { MapPlace } from '@/components/map/types';

/** A `MapPlace` with only the fields the bands read. `detail` carries the locality and the country
 *  code because that is where the page reads them from — the same projection `map-page-client.tsx`
 *  hands `buildAreas`. */
function place(
  id: string,
  lat: number,
  lng: number,
  locality: string,
  countryCode: string,
): MapPlace {
  return {
    id,
    name: id,
    category: 'restaurant',
    lat,
    lng,
    note: '',
    sourceUrl: undefined,
    visited: false,
    detail: { locality, countryCode } as NonNullable<MapPlace['detail']>,
  };
}

/** Tel Aviv (3), Haifa (1) — ~85 km apart, so they never join — and London (2) in another country. */
const TLV_A = place('tlv-a', 32.0684, 34.7745, 'תל אביב-יפו', 'IL');
const TLV_B = place('tlv-b', 32.0759, 34.7751, 'תל אביב-יפו', 'IL');
const TLV_C = place('tlv-c', 32.0625, 34.7712, 'תל אביב-יפו', 'IL');
const HAIFA = place('haifa', 32.8156, 34.9892, 'חיפה', 'IL');
const LONDON_A = place('ldn-a', 51.5142, -0.0931, 'London', 'GB');
const LONDON_B = place('ldn-b', 51.5033, -0.1195, 'London', 'GB');

const LIBRARY = [TLV_A, TLV_B, TLV_C, HAIFA, LONDON_A, LONDON_B];

function libraryGeography(): {
  readonly areas: readonly Area<MapPlace>[];
  readonly countries: readonly CountrySummary<MapPlace>[];
} {
  const projections = {
    toId: (p: MapPlace) => p.id,
    toPoint: (p: MapPlace) => p,
    toLocality: (p: MapPlace) => p.detail?.locality ?? null,
    toCountryCode: (p: MapPlace) => p.detail?.countryCode ?? null,
  };
  const clusters = clusterByProximity(LIBRARY, (p: MapPlace) => p, {
    toLocality: (p: MapPlace) => p.detail?.locality ?? null,
  });
  const areas = buildAreas(clusters, projections);
  return {
    areas,
    countries: summariseByCountry(
      areas,
      (p: MapPlace) => p.detail?.countryCode ?? null,
      (p: MapPlace) => p,
    ),
  };
}

const { areas, countries } = libraryGeography();

const idsOf = (places: readonly MapPlace[]) => new Set(places.map((p) => p.id));
const ALL = idsOf(LIBRARY);
const NOTHING = new Set<string>();

const bands = (matchIds: ReadonlySet<string>) =>
  summariesForMatches({ countries, areas, matchIds, activeCountryKey: null });

describe('the fixture is the shape the bug needs', () => {
  it('has three areas in two countries', () => {
    expect(areas.map((a) => a.count).sort()).toEqual([1, 2, 3]);
    expect(countries.map((c) => c.countryCode).sort()).toEqual(['GB', 'IL']);
  });
});

describe('with no filter on, the bands are the library exactly as before', () => {
  it('draws every area, at its own count', () => {
    const drawn = bands(ALL).areas;
    expect(drawn).toHaveLength(areas.length);
    for (const area of areas) {
      expect(drawn.find((d) => d.id === area.id)?.count).toBe(area.count);
    }
  });

  it('draws every country, at its own count and its own centroid', () => {
    const drawn = bands(ALL).countries;
    expect(drawn).toHaveLength(countries.length);
    for (const country of countries) {
      const match = drawn.find((d) => d.key === country.key);
      expect(match?.count).toBe(country.count);
      expect(match?.lat).toBeCloseTo(country.centroid.lat, 9);
      expect(match?.lng).toBeCloseTo(country.centroid.lng, 9);
    }
  });
});

describe('a filter that matches nothing draws nothing — the reported bug', () => {
  it('draws no area pill at all, rather than five advertising the whole library', () => {
    expect(bands(NOTHING).areas).toEqual([]);
  });

  it('draws no country pill either', () => {
    expect(bands(NOTHING).countries).toEqual([]);
  });
});

describe('a filter that matches some places is counted over those places', () => {
  const someTlv = idsOf([TLV_A, LONDON_B]);

  it('counts an area by its matches, not by its membership', () => {
    const tlv = bands(someTlv).areas.find((a) => a.label === 'תל אביב-יפו');
    expect(tlv?.count).toBe(1);
  });

  it('drops an area the filter emptied, so nothing is left to tap', () => {
    expect(bands(someTlv).areas.map((a) => a.label)).not.toContain('חיפה');
  });

  it('sits the marker on the places it is counting, not on the ones it is not', () => {
    // The unfiltered Tel Aviv centroid is the mean of three; with one match the pill has to be on
    // that one place, or a pill reading `1` points at somewhere the user has nothing.
    const tlv = bands(someTlv).areas.find((a) => a.label === 'תל אביב-יפו');
    expect(tlv?.lat).toBeCloseTo(TLV_A.lat, 9);
    expect(tlv?.lng).toBeCloseTo(TLV_A.lng, 9);
  });

  it('counts a country by its matches across all of its areas', () => {
    const israel = bands(someTlv).countries.find((c) => c.countryCode === 'IL');
    expect(israel?.count).toBe(1);
    expect(bands(someTlv).countries.find((c) => c.countryCode === 'GB')?.count).toBe(1);
  });

  it('never draws a marker at zero — the count on a drawn pill is always at least one', () => {
    for (const set of [ALL, NOTHING, someTlv, idsOf([HAIFA])]) {
      for (const drawn of [...bands(set).areas, ...bands(set).countries]) {
        expect(drawn.count).toBeGreaterThan(0);
      }
    }
  });
});

describe('a country tap frames the places the filter left (camera mover 5)', () => {
  const israel = countries.find((c) => c.countryCode === 'IL') as CountrySummary<MapPlace>;

  it('frames only the matches, not the whole country', () => {
    // Haifa is ~85 km north of Tel Aviv. Filtered to Tel Aviv alone, the box must not reach it —
    // otherwise the tap flies to a viewport whose top half holds nothing the map is drawing.
    const box = matchingBoundsInCountry(israel, idsOf([TLV_A, TLV_B]));
    expect(box?.north).toBeLessThan(HAIFA.lat);
    expect(box?.north).toBeCloseTo(TLV_B.lat, 9);
    expect(box?.south).toBeCloseTo(TLV_A.lat, 9);
  });

  it('is the country’s own extent when nothing is filtered', () => {
    const box = matchingBoundsInCountry(israel, ALL);
    expect(box?.north).toBeCloseTo(israel.bounds.north, 9);
    expect(box?.south).toBeCloseTo(israel.bounds.south, 9);
  });

  it('is null where the filter left nothing, so the caller keeps a real box', () => {
    expect(matchingBoundsInCountry(israel, NOTHING)).toBeNull();
  });
});

describe('narrowing changes what is drawn and nothing else', () => {
  it('leaves the library’s own areas and counts untouched, whatever the filter', () => {
    // The guarantee that stops a filter invalidating the list scope or moving the camera:
    // `areas` is the input, not the output, and no call here may mutate it.
    const before = areas.map((a) => `${a.id}:${a.count}`);
    bands(NOTHING);
    bands(idsOf([HAIFA]));
    expect(areas.map((a) => `${a.id}:${a.count}`)).toEqual(before);
  });

  it('passes the active country key through untouched', () => {
    expect(
      summariesForMatches({ countries, areas, matchIds: NOTHING, activeCountryKey: 'IL' })
        .activeCountryKey,
    ).toBe('IL');
  });
});
