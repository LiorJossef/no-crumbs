/**
 * **Which pins are named, and when** — `W2-3`, `facelift-plan.md` stage 2's *"labels tiered by
 * zoom, not gated at 14"*.
 *
 * The flat `LABEL_MIN_ZOOM = 14` was correct while the home camera rested far out and there was
 * nothing to name. Since `W2-1` a settled home view sits at z8.8–13 on the libraries this product
 * is used with, so the gate meant an overview with the user's pins on it and not one of their names.
 *
 * The replacement is geometric rather than a lower number: a pin's name appears at the first tier by
 * which its **nearest neighbour** is a label's width away on screen. `marker-style.ts` owns the
 * ladder and the arithmetic (tested beside the rest of the layer spec); this file tests the part
 * that reads the library — the grid in `place-marker-layer.tsx` — and the property that keeps the
 * frame budget.
 */
import { describe, expect, it } from 'vitest';

// Renamed from `withLabelZooms` when `W6-6` added `landOrder` beside `labelZoom`: the function
// stamps every per-feature property the pin layer needs, not just the label tier, and the old name
// had stopped describing it. This file still tests only the label half — `landOrder` has its own.
import { withPinFeatureProps } from '@/components/map/place-marker-layer';
import {
  LABEL_ALL_ZOOM,
  LABEL_CLEARANCE_PX,
  LABEL_TIER_ZOOMS,
  metresPerPixel,
} from '@/components/map/marker-style';
import { toPlaceFeatures } from '@/components/map/place-features';
import type { MapPlace } from '@/components/map/types';

const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };

function place(id: string, lat: number, lng: number): MapPlace {
  return { id, name: `place ${id}`, lat, lng, category: 'cafe', visited: false } as MapPlace;
}

/** `metres` north of Tel Aviv, so a fixture reads in the units the rule is stated in. */
function northOf(id: string, metres: number): MapPlace {
  return place(id, TEL_AVIV.lat + metres / 111_320, TEL_AVIV.lng);
}

function tiersOf(places: readonly MapPlace[]): number[] {
  return withPinFeatureProps(toPlaceFeatures(places)).features.map(
    (feature) => feature.properties?.labelZoom as number,
  );
}

describe('a pin is named once it has room', () => {
  /** Two places in different cities are named on the overview: at the floor tier they are already
   *  further apart than a label is wide. */
  it('names a place that is alone in its city at the lowest tier', () => {
    const tiers = tiersOf([northOf('a', 0), northOf('b', 45_000)]);
    expect(tiers).toEqual([LABEL_TIER_ZOOMS[0], LABEL_TIER_ZOOMS[0]]);
  });

  /** A single saved place has no neighbour at all, which is the same answer for the same reason. */
  it('names a library of one at the lowest tier', () => {
    expect(tiersOf([northOf('only', 0)])).toEqual([LABEL_TIER_ZOOMS[0]]);
  });

  /** Two saves on one street wait for the top of the ladder — the case the original gate was set
   *  at 14 for, and it still resolves there. */
  it('makes two places on one street wait until every name is drawn', () => {
    expect(tiersOf([northOf('a', 0), northOf('b', 30)])).toEqual([LABEL_ALL_ZOOM, LABEL_ALL_ZOOM]);
  });

  /** The middle of the ladder exists and is reached: a few hundred metres apart is a tier of its
   *  own, which is what "tiered" means as against "gated". */
  it('puts a few hundred metres in the middle of the ladder', () => {
    const [tier] = tiersOf([northOf('a', 0), northOf('b', 900)]);
    expect(tier).toBeGreaterThan(LABEL_TIER_ZOOMS[0] as number);
    expect(tier).toBeLessThan(LABEL_ALL_ZOOM);
  });

  /** Each pin answers for **itself**, not for the library: an outlier beside a dense clump is named
   *  early while the clump waits. A library-wide rule could not express this, and it is the whole
   *  reason the tier is a feature property rather than a constant. */
  it('answers per pin, so an outlier is named while its neighbours wait', () => {
    const tiers = tiersOf([
      northOf('clump-1', 0),
      northOf('clump-2', 25),
      northOf('clump-3', 50),
      northOf('outlier', 60_000),
    ]);
    expect(tiers.slice(0, 3)).toEqual([LABEL_ALL_ZOOM, LABEL_ALL_ZOOM, LABEL_ALL_ZOOM]);
    expect(tiers[3]).toBe(LABEL_TIER_ZOOMS[0]);
  });

  /** Every feature carries a tier, and every tier is on the ladder — a `text-field` is a layout
   *  property, so a value off it would be a symbol relayout at a zoom nobody budgeted for. */
  it('stamps every feature with a tier from the ladder', () => {
    const places = Array.from({ length: 50 }, (_, index) => northOf(`p${index}`, index * 340));
    for (const tier of tiersOf(places)) expect(LABEL_TIER_ZOOMS).toContain(tier);
  });

  it('leaves an empty library alone', () => {
    expect(withPinFeatureProps(toPlaceFeatures([])).features).toHaveLength(0);
  });

  /** The properties the pins are actually drawn from have to survive the stamping, or the tiering
   *  would silently delete the category and every pin would fall back to the house icon. */
  it('adds the tier without losing anything the layer draws from', () => {
    const [feature] = withPinFeatureProps(toPlaceFeatures([northOf('a', 0)])).features;
    expect(feature?.properties).toMatchObject({
      id: 'a',
      name: 'place a',
      category: 'cafe',
      visited: false,
    });
    expect(feature?.geometry).toEqual(toPlaceFeatures([northOf('a', 0)]).features[0]?.geometry);
  });
});

describe('the frame budget the ladder has to keep', () => {
  /**
   * **`06` §9.1's measurement, as the property that protects it.** 2 000 pins cost 19.0 ms median
   * with labels gated and 34.0 ms / ~29 fps with them forced on. The flat gate defended that by
   * zoom. The ladder defends it by geometry, and this is the assertion that says so: at the floor
   * tier, the pins that are named are at least `LABEL_CLEARANCE_PX` apart **on screen**, so their
   * number is bounded by the viewport rather than by the library.
   *
   * The fixture is the shape the harness used — 2 000 saves clumped around a handful of city
   * centres, which is harder for symbol placement than a uniform spread.
   */
  it('shapes almost no glyphs at the floor for a 2,000-place library in six cities', () => {
    const cities = [0, 60_000, 120_000, 190_000, 260_000, 340_000];
    const places = Array.from({ length: 2000 }, (_, index) =>
      northOf(`p${index}`, (cities[index % cities.length] as number) + Math.floor(index / 6) * 12),
    );
    const tiers = tiersOf(places);
    const atFloor = tiers.filter((tier) => tier === LABEL_TIER_ZOOMS[0]).length;
    // Six clumps, so at most one pin per clump can be the one with room — and in practice none is,
    // because each has a neighbour twelve metres away.
    expect(atFloor).toBeLessThanOrEqual(cities.length);
    expect(tiers.filter((tier) => tier === LABEL_ALL_ZOOM).length).toBeGreaterThan(1990);
  });

  /**
   * And the cost of computing it. This runs on every change to the source, which includes every
   * keystroke in the search box, so the grid's early exit is the thing that makes the feature
   * affordable at all. Measured here rather than asserted — the bound is deliberately loose,
   * because this is a regression guard against an accidental `O(n²)` and not a benchmark.
   */
  it('computes 2,000 tiers well inside a frame', () => {
    const places = Array.from({ length: 2000 }, (_, index) =>
      northOf(`p${index}`, (index % 6) * 60_000 + Math.floor(index / 6) * 12),
    );
    const features = toPlaceFeatures(places);
    const started = performance.now();
    withPinFeatureProps(features);
    expect(performance.now() - started).toBeLessThan(120);
  });

  /** The unit the whole rule is stated in, checked once so the fixtures above mean what they say. */
  it('agrees that a label is about a hundred pixels wide', () => {
    expect(LABEL_CLEARANCE_PX).toBeGreaterThan(60);
    expect(metresPerPixel(LABEL_TIER_ZOOMS[0] as number, 32) * LABEL_CLEARANCE_PX).toBeGreaterThan(
      10_000,
    );
  });
});
