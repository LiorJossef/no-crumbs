/**
 * **The night basemap, measured rather than eyeballed.**
 *
 * `basemap-tint.ts` assigns each CARTO layer a role and pushes its colours to that role's hue and
 * saturation. In daylight it *keeps each colour's own lightness*, which is what makes the re-tint
 * safe: Positron's contrast between a road and its casing, and every zoom-stop ramp it uses,
 * survive untouched and only the temperature moves.
 *
 * Night cannot keep lightness. Paper has to become ground and roads have to become the light thing,
 * so the night table is a different *kind* of transform and it needs its own assertions. The ones
 * below are the properties a night map fails at, not a restatement of the values — a table of
 * numbers asserted against itself would pass forever and catch nothing.
 *
 * **The measure is perceptual distance, not contrast ratio, and that is the lesson this file
 * exists to keep.** The first draft of the water role produced `#0f1924` against a `#202225` land:
 * a coastline you cannot see. WCAG contrast reported **1.11:1** and would report roughly that for
 * *any* two near-blacks, so it could not tell a good sea from an invisible one. ΔE said 8.2 and was
 * right. This product's very first screen is a coastline.
 */
import { describe, expect, it } from 'vitest';

import {
  BASEMAP_TINTS,
  BASEMAP_TINTS_NIGHT,
  basemapTints,
  tintColor,
  tintFor,
  type BasemapRole,
} from '@/components/map/basemap-tint';

/** Positron's own colours for each role, so the assertions run through the real transform rather
 *  than over the table. A tint is a function; testing it needs an input. */
const POSITRON: Readonly<Record<BasemapRole, string>> = {
  land: '#fafaf8',
  water: '#d4dadc',
  green: '#e6e4e0',
  roadFill: '#ffffff',
  roadCase: '#e0dfdf',
  building: '#f2f2f0',
  label: '#3d3d3d',
  labelHalo: '#ffffff',
};

function rgb(value: string): [number, number, number] {
  const match = /rgba?\((\d+), (\d+), (\d+)/.exec(value);
  if (!match) throw new Error(`not an rgb() string: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Relative luminance, for "is this lighter than that". */
function luminance(value: string): number {
  const channels = rgb(value)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** CIE76 ΔE — enough to separate "two different colours" from "two near-blacks", which is the only
 *  question asked here. `palette-tokens.test.ts` uses the full CIEDE2000 where the threshold is
 *  fine-grained; these are large adjacent fills and the distinction does not need it. */
function deltaE(a: string, b: string): number {
  const lab = (value: string): [number, number, number] => {
    const [r, g, bl] = rgb(value)
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [number, number, number];
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** One role, run through its own night tint from Positron's own colour. */
function night(role: BasemapRole): string {
  return tintColor(POSITRON[role], BASEMAP_TINTS_NIGHT[role]);
}

describe('the night table covers exactly what the light one does', () => {
  it('has a tint for every role', () => {
    // A role missing from the night table is a layer painted in daylight colours on a dark map —
    // the loudest possible bug and the easiest to introduce by adding a role to one table only.
    expect(Object.keys(BASEMAP_TINTS_NIGHT).sort()).toEqual(Object.keys(BASEMAP_TINTS).sort());
  });
});

describe('the ground inverts', () => {
  it('turns paper into a dark ground', () => {
    expect(luminance(night('land'))).toBeLessThan(0.05);
  });

  it('puts the roads ABOVE the land, which is the inversion the whole table turns on', () => {
    // In daylight the land is paper and roads are near-white lines on it. At night the land is
    // nearly black and the roads have to be the light thing, or the street grid — the part of a
    // basemap a person navigates by — disappears into the ground.
    expect(luminance(night('roadFill'))).toBeGreaterThan(luminance(night('land')));
    expect(luminance(night('roadFill'))).toBeGreaterThan(luminance(night('roadCase')));
  });

  it('keeps the sea visibly a different thing from the land', () => {
    // The assertion the first draft failed. Contrast ratio cannot see this: it reports ~1.1:1 for
    // any two near-blacks, good or bad. 12 is comfortably above "these are the same colour" and
    // comfortably below a vivid daytime blue.
    expect(deltaE(night('water'), night('land'))).toBeGreaterThan(12);
  });

  it('keeps parks readable as parks', () => {
    expect(deltaE(night('green'), night('land'))).toBeGreaterThan(12);
  });
});

describe('labels survive the ground moving', () => {
  it('lifts dark ink to near-white, which no cap could do', () => {
    // Positron's place labels are dark slate. `minLightness` is in `Tint` for exactly this row.
    expect(luminance(night('label'))).toBeGreaterThan(0.6);
  });

  it('darkens the halo, because at night the paper showing through IS the ground', () => {
    expect(luminance(night('labelHalo'))).toBeLessThan(0.02);
  });

  it('reads at AA against both the ground and its own halo', () => {
    const contrast = (a: string, b: string) => {
      const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    expect(contrast(night('label'), night('land'))).toBeGreaterThan(4.5);
    expect(contrast(night('label'), night('labelHalo'))).toBeGreaterThan(4.5);
  });
});

describe('the light behaviour is untouched', () => {
  it('defaults to the light table, so a caller that has not opted in cannot change', () => {
    // `basemap-tint-layer.tsx` is another lane's file and still calls `tintFor(role, property)`.
    // The day it passes a theme is the day the map goes dark, and not before.
    expect(basemapTints()).toBe(BASEMAP_TINTS);
    expect(tintFor('land', 'fill-color')).toBe(BASEMAP_TINTS.land);
    expect(tintFor('land', 'fill-color', 'light')).toBe(BASEMAP_TINTS.land);
    expect(tintFor('land', 'fill-color', 'dark')).toBe(BASEMAP_TINTS_NIGHT.land);
  });

  it('still sends every halo to the halo tint, in both themes', () => {
    expect(tintFor('water', 'text-halo-color', 'light')).toBe(BASEMAP_TINTS.labelHalo);
    expect(tintFor('water', 'text-halo-color', 'dark')).toBe(BASEMAP_TINTS_NIGHT.labelHalo);
  });

  it('leaves the light transform alone: a floor is only set by the night table', () => {
    // `minLightness` was added for night. If it ever appears in the light table it changes colours
    // that have been signed off, so this is the guard on that.
    for (const tint of Object.values(BASEMAP_TINTS)) {
      expect(tint.minLightness).toBeUndefined();
    }
  });
});
