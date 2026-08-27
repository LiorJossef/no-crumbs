import { describe, expect, it } from 'vitest';

import {
  CATEGORY_ORDER,
  CATEGORY_STYLES,
  LABEL_MIN_ZOOM,
  PIN,
  allPinImageIds,
  categoryStyle,
  clusterRadiusExpression,
  pinGeometry,
  pinIconImageExpression,
  pinImageId,
  pinSortKeyExpression,
} from '@/components/map/marker-style';
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
    for (let i = 0; i + 3 < stops.length; i += 2) {
      expect(stops[i + 2]).toBeGreaterThan(stops[i]);
      expect(stops[i + 3]).toBeGreaterThan(stops[i + 1]);
    }
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
    const [lng, lat] = toPlaceFeatures([place()]).features[0].geometry.coordinates;
    expect(lng).toBeCloseTo(34.7654);
    expect(lat).toBeCloseTo(32.0596);
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
