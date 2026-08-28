import { describe, expect, it } from 'vitest';

import {
  CATEGORY_ORDER,
  CLUSTER,
  clusterCategoryCounts,
  clusterColorExpression,
  CATEGORY_STYLES,
  LABEL_MIN_ZOOM,
  PIN,
  allPinImageIds,
  categoryStyle,
  clusterRadiusExpression,
  pinGeometry,
  pinIconImageExpression,
  pinImageId,
  pinOpacityExpression,
  pinSortKeyExpression,
  VISITED_LABEL_OPACITY,
  VISITED_PIN_OPACITY,
} from '@/components/map/marker-style';
import { CATEGORY_DISPLAY } from '@/ui/place/category-display';
import { normaliseCategory, toPlaceFeatures } from '@/components/map/place-features';
import type { MapPlace } from '@/components/map/types';

function place(overrides: Partial<MapPlace> = {}): MapPlace {
  return {
    id: 'a',
    name: 'Anat Bakery',
    category: 'bakery',
    lat: 32.0596,
    lng: 34.7654,
    note: '',
    sourceUrl: undefined,
    visited: false,
    ...overrides,
  };
}

describe('category palette', () => {
  it('covers every extracted category exactly once', () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
    expect(Object.keys(CATEGORY_STYLES).sort()).toEqual([...CATEGORY_ORDER].sort());
  });

  it('gives every category its own colour and glyph', () => {
    const colours = CATEGORY_ORDER.map((c) => CATEGORY_STYLES[c].color);
    const glyphs = CATEGORY_ORDER.map((c) => CATEGORY_STYLES[c].glyph);
    expect(new Set(colours).size).toBe(colours.length);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('falls back to the house pin for anything it does not recognise', () => {
    expect(categoryStyle('nightclub')).toBe(CATEGORY_STYLES.other);
    expect(categoryStyle(null)).toBe(CATEGORY_STYLES.other);
    expect(categoryStyle('cafe')).toBe(CATEGORY_STYLES.cafe);
  });
});

describe('pin geometry', () => {
  it('keeps the head inside the bitmap and the tip above its bottom edge', () => {
    for (const selected of [false, true]) {
      const g = pinGeometry(selected);
      expect(g.centreX - g.headRadius - g.ringWidth).toBeGreaterThanOrEqual(0);
      expect(g.centreX + g.headRadius + g.ringWidth).toBeLessThanOrEqual(g.width);
      expect(g.tipY).toBeLessThan(g.height);
      expect(g.height - g.tipY).toBeCloseTo(g.tipToBottom);
    }
  });

  it('leaves the tangent construction solvable — the tip is below the head', () => {
    for (const selected of [false, true]) {
      const g = pinGeometry(selected);
      expect(g.headRadius / (g.tipY - g.centreY)).toBeLessThan(1);
    }
  });

  it('draws the selected pin larger', () => {
    expect(pinGeometry(true).headRadius).toBeGreaterThan(pinGeometry(false).headRadius);
    expect(PIN.selectedScale).toBeGreaterThan(1);
  });
});

describe('icon-image expression', () => {
  it('omits the selection branch when nothing is selected', () => {
    // `['==', ['get', 'id'], null]` fails at evaluation rather than reading false, and an
    // `icon-image` that fails produces no icon at all — every pin disappears.
    expect(JSON.stringify(pinIconImageExpression(null))).not.toContain('null');
    expect(pinSortKeyExpression(null)).toBe(1);
  });

  it('names the selected variant only for the selected id', () => {
    const expression = pinIconImageExpression('abc');
    expect(JSON.stringify(expression)).toContain('-selected');
    expect(JSON.stringify(expression)).toContain('abc');
  });

  it('can only build ids that were registered', () => {
    const registered = new Set(allPinImageIds());
    for (const category of CATEGORY_ORDER) {
      expect(registered.has(pinImageId(category, false))).toBe(true);
      expect(registered.has(pinImageId(category, true))).toBe(true);
    }
    expect(registered.size).toBe(CATEGORY_ORDER.length * 2);
  });
});

describe('clusters', () => {
  it('grows with the count and never shrinks', () => {
    const stops = clusterRadiusExpression().slice(3) as number[];
    const counts = stops.filter((_, i) => i % 2 === 0);
    const radii = stops.filter((_, i) => i % 2 === 1);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
    expect(new Set(radii).size).toBe(radii.length);
  });
});

describe('features', () => {
  it('never emits a category the palette has no pin for', () => {
    const features = toPlaceFeatures([
      place({ id: '1', category: 'cafe' }),
      place({ id: '2', category: 'nightclub' as never }),
    ]).features;
    expect(features.map((f) => f.properties.category)).toEqual(['cafe', 'other']);
    for (const feature of features) {
      expect(CATEGORY_ORDER).toContain(feature.properties.category);
    }
  });

  it('writes lng before lat, which is what MapLibre reads', () => {
    const coordinates = toPlaceFeatures([place()]).features[0]?.geometry.coordinates ?? [];
    expect(coordinates[0]).toBeCloseTo(34.7654);
    expect(coordinates[1]).toBeCloseTo(32.0596);
  });

  it('normalises a missing category rather than dropping the place', () => {
    expect(normaliseCategory(undefined)).toBe('other');
    expect(normaliseCategory('')).toBe('other');
    expect(normaliseCategory('bar')).toBe('bar');
  });
});

describe('labels', () => {
  it('waits until the pins have separated', () => {
    expect(LABEL_MIN_ZOOM).toBeGreaterThanOrEqual(14);
  });
});

describe('cluster composition', () => {
  it('accumulates one counter per category, and only those', () => {
    expect(Object.keys(clusterCategoryCounts()).sort()).toEqual([...CATEGORY_ORDER].sort());
  });

  /** Evaluate the colour expression against one cluster's counts, the way MapLibre would. */
  function colorFor(counts: Partial<Record<string, number>>, pointCount: number): string {
    const get = (key: string) => (key === 'point_count' ? pointCount : (counts[key] ?? 0));
    const expr = clusterColorExpression();
    const evaluate = (node: unknown): unknown => {
      if (!Array.isArray(node)) return node;
      const [op, ...args] = node as [string, ...unknown[]];
      if (op === 'get') return get(args[0] as string);
      if (op === 'max') return Math.max(...args.map((a) => evaluate(a) as number));
      if (op === '*') return (evaluate(args[0]) as number) * (evaluate(args[1]) as number);
      if (op === '<=') return (evaluate(args[0]) as number) <= (evaluate(args[1]) as number);
      if (op === '==') return evaluate(args[0]) === evaluate(args[1]);
      if (op === 'case') {
        for (let i = 0; i + 1 < args.length; i += 2) {
          if (evaluate(args[i])) return evaluate(args[i + 1]);
        }
        return evaluate(args[args.length - 1]);
      }
      return node;
    };
    return evaluate(expr) as string;
  }

  it('takes the colour of a category that holds a strict majority', () => {
    expect(colorFor({ cafe: 4, bar: 1 }, 5)).toBe(CATEGORY_STYLES.cafe.color);
    expect(colorFor({ restaurant: 3 }, 3)).toBe(CATEGORY_STYLES.restaurant.color);
  });

  it('stays mint when no category holds one — a plurality is not a majority', () => {
    // 3 cafés and 2 bars is 40% something else. Colouring it brown would be a claim about the
    // group that is not true of it.
    expect(colorFor({ cafe: 3, bar: 2, bakery: 1 }, 6)).toBe(CLUSTER.mixedColor);
    expect(colorFor({ cafe: 1, bar: 1 }, 2)).toBe(CLUSTER.mixedColor);
  });

  it('treats exactly half as not a majority', () => {
    expect(colorFor({ cafe: 2, bar: 2 }, 4)).toBe(CLUSTER.mixedColor);
    expect(colorFor({ cafe: 3, bar: 2 }, 5)).toBe(CATEGORY_STYLES.cafe.color);
  });

  it('covers every category, so adding one to the palette cannot leave it out here', () => {
    for (const category of CATEGORY_ORDER) {
      expect(colorFor({ [category]: 3 }, 3)).toBe(CATEGORY_STYLES[category].color);
    }
  });
});

/**
 * A place you have been to is the *same pin*, quieter. Criterion 9 of
 * `docs/product-ruling-after-the-save.md` §6.2 makes that a rule rather than a preference: seven
 * category colours already carry meaning on this map, so "been" may not be an eighth hue.
 */
describe('the been state on a pin', () => {
  it('rides on the feature, so a mark needs no new source and no new image', () => {
    const [togo, been] = toPlaceFeatures([
      place({ id: 'togo', visited: false }),
      place({ id: 'been', visited: true }),
    ]).features;

    expect(togo?.properties.visited).toBe(false);
    expect(been?.properties.visited).toBe(true);
    // Same category, same glyph, same colour lookup — only the flag differs.
    expect(been?.properties.category).toBe(togo?.properties.category);
  });

  it('reduces opacity and introduces no colour of its own', () => {
    const expression = pinOpacityExpression();
    const serialised = JSON.stringify(expression);

    expect(expression[0]).toBe('case');
    expect(serialised).toContain('visited');
    expect(serialised).toContain(String(VISITED_PIN_OPACITY));
    // Not a hue, not a hex, not one of the seven.
    expect(serialised).not.toMatch(/#[0-9a-f]{3,8}/i);
    for (const category of CATEGORY_ORDER) {
      expect(serialised).not.toContain(CATEGORY_DISPLAY[category].color);
    }
  });

  it('leaves a place still to go at full strength', () => {
    // The fallback branch of the `case` is the last element and it is 1: nothing is faded by
    // default, so an unmarked library looks exactly as it did.
    const expression = pinOpacityExpression();
    expect(expression[expression.length - 1]).toBe(1);
  });

  it('coerces a missing property to false rather than dropping the whole paint value', () => {
    // A `case` whose condition is not a boolean fails to evaluate, and MapLibre drops the property
    // — which would fade every pin on the map. `to-boolean` makes an absent flag mean "not been".
    expect(JSON.stringify(pinOpacityExpression())).toContain('to-boolean');
  });

  it('fades the name label less than the pin, so a visited place keeps a readable name', () => {
    expect(VISITED_LABEL_OPACITY).toBeGreaterThan(VISITED_PIN_OPACITY);
    expect(JSON.stringify(pinOpacityExpression(VISITED_LABEL_OPACITY))).toContain(
      String(VISITED_LABEL_OPACITY),
    );
  });

  it('stays visible: reduced emphasis is not hiding', () => {
    // Criterion 10 — marking is not archiving. The pin is quieter, never absent and never
    // transparent.
    expect(VISITED_PIN_OPACITY).toBeGreaterThan(0.3);
    expect(VISITED_PIN_OPACITY).toBeLessThan(1);
    expect(toPlaceFeatures([place({ visited: true })]).features).toHaveLength(1);
  });
});
