/**
 * **A grouped area pill's tap, and the zoom it goes to** (`area-band-layout.ts`, 2026-09-04).
 *
 * The defect, reported by the owner and reproduced against the local library under the `brunch`
 * chip: the pill read `תל אביב-יפו 13` and opening it gave `6 matches in תל אביב-יפו`. Absorption
 * makes the pill's *count* a claim about a group while its *id* is the absorber's alone, so the
 * count and the tap target described different sets. The repair is that a pill standing for several
 * areas no longer opens one of them — it expands, to the first zoom at which it stands for itself.
 *
 * These assert the layout half of that, which is `expandZoom`. The camera half is one `easeTo` in
 * `summary-marker-layer.tsx`, guarded by the same `groupSize` these tests pin.
 *
 * Fixture: the same real local library `area-band-layout.test.ts` uses, for the same reason — the
 * defect is geometric, and Tel Aviv, Herzliya, Ra'anana, Hod Hasharon and Kfar Saba being a few
 * pixels apart under pills five times that wide is a property of those coordinates.
 */

import { describe, expect, it } from 'vitest';

import {
  AREA_BAND_STEPS,
  layoutAreaBand,
  type AreaBandFeatureCollection,
} from '@/components/map/area-band-layout';
import type { AreaFeatureCollection } from '@/components/map/summary-features';
import { AREA_BAND_MAX, BAND_EDGE_GUARD, PIN_BAND_MIN, bandForZoom } from '@/components/map/zoom-bands';

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

describe('a pill that stands for several areas carries the zoom that separates it', () => {
  const out = layoutAreaBand(areas());

  it('gives every grouped pill an expand zoom, and no ungrouped one', () => {
    // The two are exclusive on purpose: `groupSize > 1` is what makes the tap an expand, and a pill
    // that stands for itself must go on opening its own area.
    for (const feature of out.features) {
      const { groupSize, expandZoom } = feature.properties;
      if (groupSize > 1) expect(typeof expandZoom).toBe('number');
      else expect(expandZoom).toBeNull();
    }
  });

  it('is the owner`s pill: Tel Aviv at world-ish zoom stands for the Sharon and can expand', () => {
    const telAviv = step(out, 0).find((f) => f.properties.label === 'תל אביב-יפו');
    expect(telAviv?.properties.groupSize).toBeGreaterThan(1);
    // It counts more than its own twenty, which is exactly the mismatch a tap has to answer for.
    expect(telAviv!.properties.count).toBeGreaterThan(20);
    expect(telAviv!.properties.expandZoom).toBeGreaterThan(AREA_BAND_STEPS[0]!.minzoom);
  });

  it('always zooms in, never out — an expand that moved the camera backwards is not one', () => {
    AREA_BAND_STEPS.forEach((bandStep, index) => {
      for (const feature of step(out, index)) {
        if (feature.properties.groupSize === 1) continue;
        expect(feature.properties.expandZoom).toBeGreaterThan(bandStep.minzoom);
      }
    });
  });

  it('lands on a zoom where the pill really does stand for itself', () => {
    // The property that makes the gesture honest: arrive, and the pill you tapped is now a pill
    // about one area — or the band is over and every place is its own pin.
    AREA_BAND_STEPS.forEach((_, index) => {
      for (const feature of step(out, index)) {
        const target = feature.properties.expandZoom;
        if (target === null) continue;
        if (target >= AREA_BAND_MAX) {
          expect(bandForZoom(target)).toBe('pin');
          continue;
        }
        const arrivedStep = AREA_BAND_STEPS.findIndex(
          (s) => target >= s.minzoom && target < s.maxzoom,
        );
        const drawn = step(out, arrivedStep).find(
          (f) => f.properties.id === feature.properties.id,
        );
        expect(drawn?.properties.groupSize).toBe(1);
      }
    });
  });

  it('escapes into the pin band, clear of the rounding window, when the band never separates it', () => {
    const finest = step(out, AREA_BAND_STEPS.length - 1).filter(
      (f) => f.properties.groupSize > 1,
    );
    // The finest step has nowhere finer to go, so whatever is still grouped there must expand out
    // of the band entirely. Pins are the ultimate separation, which is what makes the gesture
    // terminate rather than dead-end.
    for (const feature of finest) {
      expect(feature.properties.expandZoom).toBe(PIN_BAND_MIN + BAND_EDGE_GUARD);
      expect(bandForZoom(feature.properties.expandZoom!)).toBe('pin');
    }
  });

  it('leaves the counts summing to the library — the expand buys nothing at the invariant`s cost', () => {
    const total = LIBRARY.reduce((sum, [, count]) => sum + count, 0);
    AREA_BAND_STEPS.forEach((_, index) => {
      expect(step(out, index).reduce((sum, f) => sum + f.properties.count, 0)).toBe(total);
    });
  });

  it('is deterministic — the zoom a tap goes to may not depend on input order', () => {
    const reversed = layoutAreaBand({
      type: 'FeatureCollection',
      features: [...areas().features].reverse(),
    });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(out));
  });
});
