import { describe, expect, it } from 'vitest';

import {
  BASEMAP_TINTS,
  TINTED_PAINT_PROPERTIES,
  roleFor,
  tintColor,
  tintFor,
  tintPaintValue,
} from '@/components/map/basemap-tint';

/** HSL lightness, the definition `basemap-tint` preserves. */
function lightness(rgb: string): number {
  const parts = /rgba?\(([^)]+)\)/.exec(rgb)?.[1]?.split(',').map(Number) ?? [];
  const [r = 0, g = 0, b = 0] = parts.map((v) => v / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('layer roles', () => {
  it('reads Positron layer ids the way the style means them', () => {
    expect(roleFor('background')).toBe('land');
    expect(roleFor('water')).toBe('water');
    expect(roleFor('landcover')).toBe('green');
    expect(roleFor('road_minor_fill')).toBe('roadFill');
    expect(roleFor('road_minor_case')).toBe('roadCase');
    expect(roleFor('building-top')).toBe('building');
  });

  it('sends every label to the label role, whatever it labels', () => {
    for (const id of ['waterway_label', 'watername_lake', 'place_town', 'roadname_pri', 'poi_park']) {
      expect(roleFor(id)).toBe('label');
    }
  });

  it('leaves a layer it does not recognise alone', () => {
    expect(roleFor('some_future_carto_layer')).toBeNull();
  });
});

describe('tinting one colour', () => {
  it('keeps the lightness it was given when nothing caps it', () => {
    const tinted = tintColor('#808080', { hue: 40, saturation: 0.5 });
    expect(lightness(tinted)).toBeCloseTo(0.5, 2);
  });

  it('caps lightness where a role asks it to, so near-white can hold colour', () => {
    // Uncapped, `#fafaf8` comes back all but unchanged: HSL chroma is bounded by
    // `(1 - |2L - 1|) x S`, which at L = 0.98 is ~4% of the saturation asked for.
    //
    // Asserted through `water` rather than `land` since `exp/richer-basemap`. The mechanism being
    // pinned is "the cap lets a near-white input actually take colour", and it needs a role that
    // *asks* for colour to demonstrate it. `land` is no longer one: the Mapbox-Standard palette
    // deliberately makes it near-neutral paper, so the old `r - b > 10` was asserting the beige
    // direction itself, which the owner reversed on 2026-08-30.
    const capped = tintColor('#fafaf8', BASEMAP_TINTS.water);
    expect(lightness(capped)).toBeCloseTo(BASEMAP_TINTS.water.maxLightness ?? 1, 2);
    const [r, , b] = /rgb\((\d+), (\d+), (\d+)\)/.exec(capped)!.slice(1).map(Number) as number[];
    expect(b! - r!).toBeGreaterThan(10); // visibly blue, not grey
  });

  it('keeps land near-neutral so it reads as paper rather than beige', () => {
    const tinted = tintColor('#fafaf8', BASEMAP_TINTS.land);
    const [r, , b] = /rgb\((\d+), (\d+), (\d+)\)/.exec(tinted)!.slice(1).map(Number) as number[];
    expect(Math.abs(r! - b!)).toBeLessThan(10);
  });

  it('leaves roads at their own near-white so they read against the land', () => {
    expect(BASEMAP_TINTS.roadFill.maxLightness).toBeUndefined();
    expect(lightness(tintColor('#ffffff', BASEMAP_TINTS.roadFill))).toBeCloseTo(1, 2);
  });

  it('keeps alpha', () => {
    expect(tintColor('rgba(234, 241, 233, 0.5)', BASEMAP_TINTS.green)).toContain('0.5');
  });

  it('passes through anything it cannot parse rather than inventing a colour', () => {
    expect(tintColor('transparent', BASEMAP_TINTS.land)).toBe('transparent');
    expect(tintColor('not-a-colour', BASEMAP_TINTS.land)).toBe('not-a-colour');
  });

  it('reads the shorthand hex Positron writes', () => {
    expect(tintColor('#ddd', BASEMAP_TINTS.roadCase)).toMatch(/^rgb\(/);
  });
});

describe('tinting a paint value of any shape', () => {
  it('reaches inside a legacy stops function', () => {
    const tinted = tintPaintValue(
      { stops: [[8, '#e6e6e6'], [12, '#dddddd']] },
      BASEMAP_TINTS.roadCase
    ) as { stops: [number, string][] };
    expect(tinted.stops[0]![0]).toBe(8);
    expect(tinted.stops[0]![1]).toMatch(/^rgb\(/);
    expect(tinted.stops[1]![1]).toMatch(/^rgb\(/);
  });

  it('leaves an expression operator alone — it is not a colour', () => {
    const tinted = tintPaintValue(
      ['interpolate', ['linear'], ['zoom'], 8, '#eeeeee'],
      BASEMAP_TINTS.land
    ) as unknown[];
    expect(tinted[0]).toBe('interpolate');
    expect(tinted[1]).toEqual(['linear']);
    expect(tinted[4]).toMatch(/^rgb\(/);
  });
});

describe('halos', () => {
  it('are paper showing through, so they never take the ink colour', () => {
    expect(tintFor('label', 'text-halo-color')).toBe(BASEMAP_TINTS.labelHalo);
    expect(tintFor('label', 'text-color')).toBe(BASEMAP_TINTS.label);
  });

  it('is the same rule for every role', () => {
    for (const property of TINTED_PAINT_PROPERTIES) {
      const tint = tintFor('water', property);
      expect(tint).toBe(property === 'text-halo-color' ? BASEMAP_TINTS.labelHalo : BASEMAP_TINTS.water);
    }
  });
});
