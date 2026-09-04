/**
 * The area band's hierarchy (`W2B-OVERLAP`, `src/components/map/area-band-layout.ts`).
 *
 * The fixture is the owner's **real local library** as it stood on 2026-09-02 — twelve areas over
 * 58 saved places, read out of `places` × `saved_places` and clustered by the same
 * `clusterByProximity` the page uses. It is here as literals rather than as a query because the
 * defect is geometric: what matters is that Tel Aviv, Herzliya, Ra'anana, Hod Hasharon and Kfar
 * Saba are a handful of pixels apart under pills five times that wide, and that is a property of
 * those coordinates, not of a database that will keep changing.
 *
 * The invariant these all serve is one sentence: **a place you saved may be summarised, but it may
 * never be both invisible and uncounted.**
 */

import { describe, expect, it } from 'vitest';

import {
  AREA_BAND_STEPS,
  layoutAreaBand,
  type AreaBandFeatureCollection,
} from '@/components/map/area-band-layout';
import { SUMMARY_PILL, summaryPillFitAllowance } from '@/components/map/country-flag-image';
import type { AreaFeatureCollection } from '@/components/map/summary-features';
import { AREA_BAND_MAX, AREA_BAND_MIN } from '@/components/map/zoom-bands';

/** label, count, lat, lng — measured 2026-09-02 against the local database. */
const LIBRARY: readonly [string, number, number, number][] = [
  ['תל אביב-יפו', 20, 32.0723347, 34.7712273],
  ['London', 18, 51.4850777, -0.1238777],
  ['ראשון לציון', 5, 31.972088, 34.7929982],
  ['Czechia', 4, 50.0739824, 14.4439752],
  ['הרצליה', 3, 32.1601077, 34.8207703],
  ['פתח תקווה', 2, 32.0858655, 34.8730716],
  ['חיפה', 1, 32.8165506, 34.9798923],
  ['הוד השרון', 1, 32.1607172, 34.8939328],
  ['קדימה צורן', 1, 32.2762509, 34.9192936],
  ['תל יצחק', 1, 32.254465, 34.8724344],
  ['רעננה', 1, 32.1731989, 34.8718212],
  ['כפר סבא', 1, 32.1784137, 34.9058618],
];

const TOTAL = LIBRARY.reduce((sum, [, count]) => sum + count, 0);

function areas(): AreaFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: LIBRARY.map(([label, count, lat, lng]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { id: `${label}-id`, label, count },
    })),
  };
}

const step = (out: AreaBandFeatureCollection, index: number) =>
  out.features.filter((feature) => feature.properties.step === index);

function projectX(lng: number, zoom: number) {
  return ((lng + 180) / 360) * 512 * Math.pow(2, zoom);
}
function projectY(lat: number, zoom: number) {
  const sin = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 512 * Math.pow(2, zoom);
}

describe('the area band no longer loses an area to a collision', () => {
  it('the steps tile the band exactly, with no zoom drawing two of them and none drawing none', () => {
    expect(AREA_BAND_STEPS[0]?.minzoom).toBe(AREA_BAND_MIN);
    expect(AREA_BAND_STEPS[AREA_BAND_STEPS.length - 1]?.maxzoom).toBe(AREA_BAND_MAX);
    for (let i = 1; i < AREA_BAND_STEPS.length; i += 1) {
      expect(AREA_BAND_STEPS[i]?.minzoom).toBe(AREA_BAND_STEPS[i - 1]?.maxzoom);
    }
  });

  it('draws something at every step, and a pill only ever counts its own area', () => {
    // **This assertion was `=== TOTAL` until 2026-09-04**, and its own name was "counts every saved
    // place at every step — the whole point of the change". The owner's ruling that day reversed
    // it: a pill that carries a group's number is a pill that will not open that number, which is
    // the defect he reported. The counts therefore no longer sum, and `area-band-counts.test.ts`
    // measures exactly how far short they fall rather than leaving the gap unstated.
    const out = layoutAreaBand(areas());
    AREA_BAND_STEPS.forEach((_, index) => {
      const drawn = step(out, index);
      expect(drawn.length).toBeGreaterThan(0);
      expect(drawn.reduce((sum, f) => sum + f.properties.count, 0)).toBeLessThanOrEqual(TOTAL);
      for (const feature of drawn) {
        const own = LIBRARY.find(([label]) => label === feature.properties.label);
        expect(feature.properties.count).toBe(own?.[1]);
      }
    });
  });

  it('leaves no two pills overlapping, so MapLibre has nothing to drop', () => {
    // The regression guard for the whole design: the layout is computed at each step's floor, which
    // is its worst case, so a step that clears here cannot collide anywhere inside it.
    const out = layoutAreaBand(areas());
    AREA_BAND_STEPS.forEach((band, index) => {
      const drawn = step(out, index);
      for (let i = 0; i < drawn.length; i += 1) {
        for (let j = i + 1; j < drawn.length; j += 1) {
          const a = drawn[i]!;
          const b = drawn[j]!;
          const half = (f: (typeof drawn)[number]) =>
            summaryPillFitAllowance([
              { text: `${f.properties.label}  ${f.properties.count}`, capped: false },
            ]).x;
          const dx = Math.abs(
            projectX(a.geometry.coordinates[0]!, band.minzoom) -
              projectX(b.geometry.coordinates[0]!, band.minzoom),
          );
          const dy = Math.abs(
            projectY(a.geometry.coordinates[1]!, band.minzoom) -
              projectY(b.geometry.coordinates[1]!, band.minzoom),
          );
          expect(dx >= half(a) + half(b) || dy >= SUMMARY_PILL.height).toBe(true);
        }
      }
    });
  });

  it('puts Tel Aviv in front of Herzliya, and records it without borrowing its number', () => {
    // The layout still knows Herzliya was displaced — `groupSize` is what a `+N` affordance would
    // read — and Tel Aviv's pill still says twenty, which is what a tap on it opens. Between
    // 617af6e and this ruling the count was the group's, and it was the shape of the owner's
    // report: the pill said 13 and opened 6.
    const out = layoutAreaBand(areas());
    const telAviv = step(out, 0).find((f) => f.properties.label === 'תל אביב-יפו');
    expect(telAviv).toBeDefined();
    expect(telAviv?.properties.count).toBe(20);
    expect(telAviv?.properties.groupSize).toBeGreaterThan(1);
    expect(step(out, 0).some((f) => f.properties.label === 'הרצליה')).toBe(false);
  });

  it('draws Herzliya as itself in the finest step, which is why that step is a quarter wide', () => {
    // The other half of the original report: this is what puts the name back on the map before the
    // band hands over to pins.
    const out = layoutAreaBand(areas());
    const finest = step(out, AREA_BAND_STEPS.length - 1);
    expect(finest.map((f) => f.properties.label)).toContain('הרצליה');
    // **3, its own** — it stands in front of Ra'anana, Hod Hasharon and Kfar Saba at this zoom, and
    // says so through `groupSize` rather than through a number it will not open. It read `6` until
    // the 2026-09-04 ruling.
    const herzliya = finest.find((f) => f.properties.label === 'הרצליה');
    expect(herzliya?.properties.count).toBe(3);
    expect(herzliya?.properties.groupSize).toBeGreaterThan(1);
  });

  it('keeps an area that has room entirely to itself', () => {
    // London is 3 000 km from anything else in this library, so it must never be absorbed and its
    // count must never move.
    const out = layoutAreaBand(areas());
    AREA_BAND_STEPS.forEach((_, index) => {
      const london = step(out, index).find((f) => f.properties.label === 'London');
      expect(london?.properties.count).toBe(18);
      expect(london?.properties.groupSize).toBe(1);
    });
  });

  it('separates more of the library the further in you go', () => {
    const out = layoutAreaBand(areas());
    const drawn = AREA_BAND_STEPS.map((_, index) => step(out, index).length);
    expect(drawn[drawn.length - 1]!).toBeGreaterThan(drawn[0]!);
    for (let i = 1; i < drawn.length; i += 1) expect(drawn[i]!).toBeGreaterThanOrEqual(drawn[i - 1]!);
  });

  it('keeps a group over the area it names, and keeps that area tappable', () => {
    // The absorbing pill never drifts toward what it absorbed: the displacement design was rejected
    // for moving a marker up to 16 km from the place written on it.
    const out = layoutAreaBand(areas());
    const telAviv = step(out, 0).find((f) => f.properties.label === 'תל אביב-יפו');
    expect(telAviv?.geometry.coordinates).toEqual([34.7712273, 32.0723347]);
    expect(telAviv?.properties.id).toBe('תל אביב-יפו-id');
  });

  it('is deterministic, and independent of the order the areas arrive in', () => {
    const forward = layoutAreaBand(areas());
    const reversed = layoutAreaBand({
      type: 'FeatureCollection',
      features: [...areas().features].reverse(),
    });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it('is empty for an empty library and trivial for a single area', () => {
    expect(layoutAreaBand({ type: 'FeatureCollection', features: [] }).features).toEqual([]);
    const one = layoutAreaBand({
      type: 'FeatureCollection',
      features: [areas().features[0]!],
    });
    expect(one.features).toHaveLength(AREA_BAND_STEPS.length);
    expect(one.features.every((f) => f.properties.groupSize === 1)).toBe(true);
  });
});
