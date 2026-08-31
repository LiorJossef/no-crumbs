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

import { placePalette } from '@/ui/place/palette';
import {
  POI_GROUP_COLORS,
  POI_GROUP_COLORS_NIGHT,
  poiColorExpression,
  poiGroupColors,
} from '@/components/map/poi-style';
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

function lab(value: string): [number, number, number] {
  const [r, g, bl] = rgb(value)
    .map((c) => c / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))) as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * **CIEDE2000, the same metric `palette-tokens.test.ts` uses — and the choice is load-bearing here
 * rather than pedantic.**
 *
 * I wrote this with the simple CIE76 distance first, and it ranked the two POI palettes *the other
 * way round*: CIE76 says the night set's worst pair is 28.2 against the light set's 31.1 (night
 * slightly worse), CIEDE2000 says 11.7 against 10.7 (night slightly better). The assertion below
 * flipped depending on which one I used, which is precisely the situation where picking the
 * convenient answer would be the wrong kind of easy.
 *
 * CIEDE2000 is the one to trust: it exists because CIE76 systematically mis-ranks exactly this kind
 * of comparison — differences that are mostly lightness, and anything in the blues, both of which
 * describe `transit`/`civic`. It is also already this repository's metric for the category palette,
 * so using anything else here would mean two palettes judged by two standards.
 */
function deltaE(a: string, b: string): number {
  const [L1, a1, b1] = lab(a);
  const [L2, a2, b2] = lab(b);
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const A1 = a1 * (1 + G);
  const A2 = a2 * (1 + G);
  const Cp1 = Math.hypot(A1, b1);
  const Cp2 = Math.hypot(A2, b2);
  const hue = (x: number, y: number) => {
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return deg < 0 ? deg + 360 : deg;
  };
  const h1 = Cp1 === 0 ? 0 : hue(A1, b1);
  const h2 = Cp2 === 0 ? 0 : hue(A2, b2);
  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * Math.PI) / 360);
  const Lb = (L1 + L2) / 2;
  const Cbp = (Cp1 + Cp2) / 2;
  let hb = h1 + h2;
  if (Cp1 * Cp2 !== 0) hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2;
  const T =
    1 -
    0.17 * Math.cos(((hb - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hb * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hb + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hb - 63) * Math.PI) / 180);
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT =
    -2 *
    Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) *
    Math.sin((60 * Math.exp(-(((hb - 275) / 25) ** 2)) * Math.PI) / 180);
  return Math.sqrt(
    (dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH),
  );
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

describe('the POI groups at night', () => {
  const NIGHT_LAND = 'rgb(32, 34, 37)'; // `#202225`, what `land` tints to.
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };
  const asRgb = (h: string) =>
    `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;

  it('covers every group the light set does', () => {
    expect(Object.keys(POI_GROUP_COLORS_NIGHT).sort()).toEqual(Object.keys(POI_GROUP_COLORS).sort());
  });

  it('reads at AA on the night ground, which the light six do not', () => {
    // The light six measure 2.91–3.69:1 there — every one below AA, on small text. That is the
    // defect this set exists to fix, so both halves are asserted: the old values fail, the new
    // ones pass. Without the first half this is a test that would pass on the wrong palette.
    for (const [group, color] of Object.entries(POI_GROUP_COLORS)) {
      expect(contrast(asRgb(color), NIGHT_LAND), `light ${group} on night ground`).toBeLessThan(4.5);
    }
    for (const [group, color] of Object.entries(POI_GROUP_COLORS_NIGHT)) {
      expect(contrast(asRgb(color), NIGHT_LAND), `night ${group}`).toBeGreaterThan(4.5);
    }
  });

  it('stays at least as distinguishable as the light set it mirrors', () => {
    // The bar is the light set's own worst pair rather than a number invented here: those six ship
    // with `transit`/`civic` at ΔE 10.7, so a night set is honest if it is no worse.
    const worst = (set: Readonly<Record<string, string>>) => {
      const values = Object.values(set);
      let lowest = Infinity;
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          lowest = Math.min(lowest, deltaE(asRgb(values[i]!), asRgb(values[j]!)));
        }
      }
      return lowest;
    };
    expect(worst(POI_GROUP_COLORS_NIGHT)).toBeGreaterThanOrEqual(worst(POI_GROUP_COLORS));
  });

  it('builds the match expression from whichever set the theme asks for', () => {
    expect(poiGroupColors()).toBe(POI_GROUP_COLORS);
    expect(poiColorExpression()).toContain(POI_GROUP_COLORS.food);
    expect(poiColorExpression('dark')).toContain(POI_GROUP_COLORS_NIGHT.food);
    // The fallthrough is `civic` in both, and it is the last element.
    expect(poiColorExpression('dark').at(-1)).toBe(POI_GROUP_COLORS_NIGHT.civic);
  });
});

/**
 * The one measurement that couples the two halves of W7-3, and the reason `roadFill` is `0.29`.
 *
 * A night pin body is a *light* colour and a major road is the lightest thing on the basemap, so
 * the worst case on this map is a pin sitting on a motorway. Neither the palette nor the basemap can
 * see that on its own — the palette is measured against the land, the basemap against itself — so
 * without this assertion the number nobody owns is the number that fails.
 */
describe('a pin on a major road, which is the worst case on the night map', () => {
  it('clears the 3:1 a graphical boundary needs', () => {
    const road = tintColor(POSITRON.roadFill, BASEMAP_TINTS_NIGHT.roadFill);
    const contrast = (a: string, b: string) => {
      const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const asRgb = (h: string) =>
      `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
    const palette = placePalette('dark');
    for (const [category, body] of Object.entries(palette.category)) {
      expect(contrast(asRgb(body), road), `${category} pin on a major road`).toBeGreaterThan(3);
    }
  });

  it('and the light bodies would not, which is why the palette had to move too', () => {
    // 1.03:1 for café. A light-theme pin on a night motorway is not a dim pin, it is an absent one.
    const road = tintColor(POSITRON.roadFill, BASEMAP_TINTS_NIGHT.roadFill);
    const contrast = (a: string, b: string) => {
      const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const asRgb = (h: string) =>
      `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
    expect(contrast(asRgb(placePalette('light').category.cafe), road)).toBeLessThan(1.5);
  });
});
