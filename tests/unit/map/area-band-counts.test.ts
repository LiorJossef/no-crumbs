/**
 * **What an area pill's number means, and what the map does not say when two cities collide**
 * (`src/components/map/area-band-layout.ts`, owner ruling 2026-09-04).
 *
 * The rule is one sentence: **a pill counts exactly what its tap opens.** It was not true for a
 * day. `617af6e` gave the absorbing pill the whole group's count and then had to invent a second
 * kind of tap for it, because the number it was showing was not a number it could open —
 * `תל אביב-יפו 13` opened `6 matches in תל אביב-יפו`. The owner rejected the second gesture on the
 * arrival it produced (*"the reposition of the map isn't good... like when you click on ראשון — the
 * zoom is good"*, `ראשון לציון` being an ungrouped pill), and the ruling put the fix on the pill:
 * own count, one gesture, mover 4 for everybody.
 *
 * **This file is here to keep the cost of that visible rather than implicit.** The counts no longer
 * sum to the library at any step, and these numbers are the measurement — asserted, so the day
 * somebody changes the collision rule the change shows up as a diff in this file rather than as a
 * number nobody notices on a phone.
 *
 * The fixture is the same real local library `area-band-layout.test.ts` uses, for the same reason:
 * the behaviour is geometric, and Tel Aviv, Herzliya, Ra'anana, Hod Hasharon and Kfar Saba being a
 * handful of pixels apart under pills five times that wide is a property of those coordinates.
 */

import { describe, expect, it } from 'vitest';

import { AREA_BAND_STEPS, layoutAreaBand } from '@/components/map/area-band-layout';
import type { AreaFeatureCollection } from '@/components/map/summary-features';

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

const out = layoutAreaBand(areas());
const step = (index: number) => out.features.filter((f) => f.properties.step === index);
const counted = (index: number) => step(index).reduce((sum, f) => sum + f.properties.count, 0);

describe('a pill counts exactly what its tap opens', () => {
  it('never shows a number belonging to an area it does not name', () => {
    for (const feature of out.features) {
      const own = LIBRARY.find(([label]) => label === feature.properties.label);
      expect(own).toBeDefined();
      expect(feature.properties.count).toBe(own?.[1]);
    }
  });

  it('says so even where it stands in front of four other cities', () => {
    // Tel Aviv at the coarsest step is the pill the owner reported. `groupSize` records that four
    // others are behind it; the count does not borrow from them.
    const telAviv = step(0).find((f) => f.properties.label === 'תל אביב-יפו');
    expect(telAviv?.properties.count).toBe(20);
    expect(telAviv?.properties.groupSize).toBeGreaterThan(1);
  });

  it('leaves an uncrowded pill identical in both readings', () => {
    // London is 3 000 km from anything else here, so "its own count" and "the group's count" are
    // the same number — which is why the ruling changes nothing for most of the library.
    for (let index = 0; index < AREA_BAND_STEPS.length; index += 1) {
      const london = step(index).find((f) => f.properties.label === 'London');
      expect(london?.properties.count).toBe(18);
      expect(london?.properties.groupSize).toBe(1);
    }
  });
});

describe('the arithmetic gap the ruling accepts, in numbers', () => {
  it('is 42 of 58 at the coarsest step and 52 of 58 at the finest', () => {
    // The whole cost of the ruling, stated. Sixteen of the user's places are behind a pill that
    // does not count them at z4.5. The country pill above still counts every one of them, the list
    // beside the map still lists them, and a tap on the pill that *is* drawn lands in the pin band
    // where they are drawn individually.
    expect(counted(0)).toBe(42);
    expect(counted(AREA_BAND_STEPS.length - 1)).toBe(52);
    for (let index = 0; index < AREA_BAND_STEPS.length; index += 1) {
      expect(counted(index)).toBeLessThanOrEqual(TOTAL);
    }
  });

  it('closes as the user zooms in — the gap is a function of the collision, not of the data', () => {
    for (let index = 1; index < AREA_BAND_STEPS.length; index += 1) {
      expect(counted(index)).toBeGreaterThanOrEqual(counted(index - 1));
    }
  });

  it('names the five areas this library never draws a pill for, at any zoom in the band', () => {
    // **Not a regression introduced by the ruling**: absorption has never drawn these, it moved
    // their number onto a neighbour. What changed is that they are now uncounted as well as
    // undrawn. They are reachable — every one of them is a pin at `z >= PIN_BAND_MIN`, which is
    // where a tap on the pill in front of them lands, and every one of them is a row in the list.
    // If this set ever grows to include an area with no pin route, that is a real defect.
    const drawn = new Set(out.features.map((f) => f.properties.label));
    const never = LIBRARY.filter(([label]) => !drawn.has(label)).map(([label]) => label);
    expect(never).toEqual(['פתח תקווה', 'הוד השרון', 'תל יצחק', 'רעננה', 'כפר סבא']);
    // Six places between the five of them, out of 58.
    expect(
      LIBRARY.filter(([label]) => never.includes(label)).reduce((sum, [, count]) => sum + count, 0),
    ).toBe(6);
  });

  it('draws every area that is not in that set at least once', () => {
    // The property that makes the set above the whole story: nothing else silently vanishes.
    const drawn = new Set(out.features.map((f) => f.properties.label));
    for (const [label] of LIBRARY) {
      if (['פתח תקווה', 'הוד השרון', 'תל יצחק', 'רעננה', 'כפר סבא'].includes(label)) continue;
      expect(drawn.has(label)).toBe(true);
    }
  });
});
