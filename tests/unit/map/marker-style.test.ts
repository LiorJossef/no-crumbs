import { describe, expect, it } from 'vitest';

import { PIN_BAND_MIN } from '@/components/map/zoom-bands';

import {
  CATEGORY_ORDER,
  CATEGORY_STYLES,
  LABEL_ALL_ZOOM,
  LABEL_CLEARANCE_PX,
  LABEL_TIER_ZOOMS,
  labelTierFor,
  metresPerPixel,
  separationZoom,
  PIN,
  allPinImageIds,
  categoryStyle,
  pinGeometry,
  pinIconImageExpression,
  pinImageId,
  pinOpacityExpression,
  pinSortKeyExpression,
  UNCATEGORISED_PIN,
  VISITED_LABEL_OPACITY,
  VISITED_PIN_OPACITY,
} from '@/components/map/marker-style';
import { UNCATEGORISED_COLOR } from '@/ui/place/category-display';
import { normaliseCategory, toPlaceFeatures } from '@/components/map/place-features';
import type { MapPlace } from '@/components/map/types';

function place(overrides: Partial<MapPlace> = {}): MapPlace {
  return {
    id: 'a',
    name: 'Anat Bakery',
    category: 'cafe',
    lat: 32.0596,
    lng: 34.7654,
    note: '',
    sourceUrl: undefined,
    visited: false,
    ...overrides,
  };
}

describe('category palette', () => {
  it('covers the three categories and the uncategorised pin, exactly once each', () => {
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
    expect(categoryStyle('nightclub')).toBe(CATEGORY_STYLES[UNCATEGORISED_PIN]);
    expect(categoryStyle(null)).toBe(CATEGORY_STYLES[UNCATEGORISED_PIN]);
    // Including every value the eight-value vocabulary used to produce. Rows written under it are
    // still in the database, and a pin id that was never registered is a place that vanishes.
    expect(categoryStyle('bakery')).toBe(CATEGORY_STYLES[UNCATEGORISED_PIN]);
    expect(categoryStyle('dessert')).toBe(CATEGORY_STYLES[UNCATEGORISED_PIN]);
    expect(categoryStyle('shop')).toBe(CATEGORY_STYLES[UNCATEGORISED_PIN]);
    expect(categoryStyle('other')).toBe(CATEGORY_STYLES[UNCATEGORISED_PIN]);
    expect(categoryStyle('cafe')).toBe(CATEGORY_STYLES.cafe);
  });

  it('gives the uncategorised pin a colour but no word', () => {
    // The distinction the narrowing turns on: it is something to draw, not something to say.
    expect(CATEGORY_STYLES[UNCATEGORISED_PIN].color).toBe(UNCATEGORISED_COLOR);
    expect(CATEGORY_STYLES[UNCATEGORISED_PIN].label).toBeNull();
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

describe('features', () => {
  it('never emits a category the palette has no pin for', () => {
    const features = toPlaceFeatures([
      place({ id: '1', category: 'cafe' }),
      place({ id: '2', category: 'nightclub' as never }),
    ]).features;
    expect(features.map((f) => f.properties.category)).toEqual(['cafe', UNCATEGORISED_PIN]);
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
    expect(normaliseCategory(undefined)).toBe(UNCATEGORISED_PIN);
    expect(normaliseCategory('')).toBe(UNCATEGORISED_PIN);
    expect(normaliseCategory('bar')).toBe('bar');
  });
});

describe('labels', () => {
  /**
   * **The rule that replaced the flat gate** (`W2-3`). It used to be one number, asserted `>= 14`,
   * on the grounds that *"at 13.5 a dense neighbourhood stacked two or three names on top of each
   * other; by 14 the pins have separated"*. That sentence is about **separation**, not about zoom —
   * zoom was only ever a proxy for it — and once the home camera came to rest on the user's own
   * pins at z8.8–13 (`W2-1`), the proxy stopped working: the overview had pins and no names.
   *
   * So the test is now on the thing the number was standing in for. A name appears at the zoom
   * where its pin has a label's width of room, and 14 is where the ladder *ends* rather than where
   * it starts — every place is still named by 14, so nothing that is visible today is hidden.
   */
  it('still names everything by the zoom the flat gate used to sit at', () => {
    expect(LABEL_ALL_ZOOM).toBe(14);
    expect(LABEL_TIER_ZOOMS[LABEL_TIER_ZOOMS.length - 1]).toBe(LABEL_ALL_ZOOM);
  });

  it('rises, and never starts below the zoom the pins are drawn at', () => {
    expect(LABEL_TIER_ZOOMS[0]).toBe(PIN_BAND_MIN);
    for (let index = 1; index < LABEL_TIER_ZOOMS.length; index += 1) {
      expect(LABEL_TIER_ZOOMS[index] as number).toBeGreaterThan(
        LABEL_TIER_ZOOMS[index - 1] as number,
      );
    }
  });

  /** The derivation, checked as arithmetic rather than as a table: at the zoom `separationZoom`
   *  returns, two points that far apart are exactly a label's width apart on screen. */
  it('computes the zoom at which a name stops touching the next pin', () => {
    for (const [metres, lat] of [
      [500, 32.08],
      [12_000, 51.5],
      [80, 0],
    ] as const) {
      const zoom = separationZoom(metres, lat);
      expect(metres / metresPerPixel(zoom, lat)).toBeCloseTo(LABEL_CLEARANCE_PX, 6);
    }
  });

  /** A place alone in its city is named on the overview; nine on one street wait for the top of
   *  the ladder. Both stated in metres, which is what the library actually varies in. */
  it('names an isolated pin early and a crowded one late', () => {
    expect(labelTierFor(Number.POSITIVE_INFINITY, 32)).toBe(LABEL_TIER_ZOOMS[0]);
    expect(labelTierFor(45_000, 32)).toBe(LABEL_TIER_ZOOMS[0]);
    expect(labelTierFor(30, 32)).toBe(LABEL_ALL_ZOOM);
    expect(labelTierFor(0, 32)).toBe(LABEL_ALL_ZOOM);
  });

  /** Every answer is one of the tiers, at every separation and every latitude — a `text-field` is
   *  a *layout* property, so a value off the ladder would be a symbol relayout nobody budgeted. */
  it('answers only ever with a tier', () => {
    for (const lat of [0, 32, 51.5, 60]) {
      for (let metres = 1; metres < 200_000; metres *= 1.3) {
        expect(LABEL_TIER_ZOOMS).toContain(labelTierFor(metres, lat));
      }
    }
  });

  /**
   * **The budget, as the property that keeps it.** `06` §9.1 measured 2 000 pins at 19.0 ms median
   * with labels gated and 34.0 ms / ~29 fps forced on. The flat gate defended that by zoom; the
   * ladder defends it by geometry, and this is why that is stronger: the pins that are labelled at
   * a given tier are at least `LABEL_CLEARANCE_PX` apart on screen, so their number is bounded by
   * the **viewport**, not by the library. A thousand places in one city label none of themselves at
   * the floor.
   */
  it('bounds what a dense library can shape at the bottom of the ladder', () => {
    const oneCity = Array.from({ length: 1000 }, (_, index) => 40 + index * 7); // metres apart
    const labelledAtFloor = oneCity.filter(
      (metres) => labelTierFor(metres, 32) === LABEL_TIER_ZOOMS[0],
    );
    expect(labelledAtFloor).toHaveLength(0);
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
    for (const key of CATEGORY_ORDER) {
      expect(serialised).not.toContain(CATEGORY_STYLES[key].color);
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
