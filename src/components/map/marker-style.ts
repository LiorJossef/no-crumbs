/**
 * What a saved place looks like on the map: one colour and one glyph per category, plus the
 * MapLibre expressions the layer is built from.
 *
 * Kept free of React, MapLibre runtime and `<canvas>` so the palette and the expressions can be
 * unit-tested in a node environment. The drawing lives in `./marker-images.ts`, the wiring in
 * `./place-marker-layer.tsx`.
 *
 * ## There is no density clustering here, and that is a ruling rather than an omission
 *
 * This file used to own five cluster expressions — a strict-majority colour, per-category
 * accumulators, a stepped radius and a text size — and `place-marker-layer.tsx` drew a circle and a
 * count layer from them. All of it is deleted by owner ruling, 2026-08-28
 * (`docs/06-map-and-places-decision.md` §9.1, `L1-F5-T5`). Collapsing nearby saved places into a
 * numbered bubble is wrong for a *retrieval* product: at city and local browsing zoom the user has
 * to see the actual pins, not a summary hiding them.
 *
 * The ruling names, and overrules, the comment that used to sit on `clusterRadiusExpression`:
 * *"a cluster of two is a slightly bigger sibling of a pin, not a different species."* That was a
 * considered choice and it is now the wrong one. It is written down here as well as in `06` so the
 * behaviour cannot be re-derived from a comment and quietly put back. **A pair of saved places is
 * two pins.**
 *
 * Two things this does not license. `src/domain/places/clusters.ts` is a different idea entirely —
 * it groups the library at ~50 km to anchor the camera and name the active area, and never drew
 * anything; it stays. And the world-zoom **country summary** (flag emoji + count) is a summary of
 * the *library*, not of *density* — a separate L2 item, not a door back to clustering.
 */

import { PRODUCT_CATEGORY_ORDER } from '@/domain/places/product-category';
import type { ProductCategory } from '@/domain/places/product-category';
import { CATEGORY_DISPLAY, DEFAULT_CATEGORY } from '@/ui/place/category-display';

export { DEFAULT_CATEGORY };

export const CATEGORY_ORDER = PRODUCT_CATEGORY_ORDER;

/** The glyph drawn inside a pin. `./marker-images.ts` has one draw routine per value. */
export type GlyphName = 'fork' | 'cup' | 'croissant' | 'glass' | 'cone' | 'star' | 'bag' | 'dot';

/** The pin's colour and label come from `ui/place/category-display.ts`, which the list and the
 *  detail view read too — a café is the same brown word-and-colour wherever it appears. Only the
 *  glyph is the map's own. */
export type CategoryStyle = (typeof CATEGORY_DISPLAY)[ProductCategory] & {
  readonly glyph: GlyphName;
};

const GLYPH_BY_CATEGORY: Record<ProductCategory, GlyphName> = {
  restaurant: 'fork',
  cafe: 'cup',
  bakery: 'croissant',
  bar: 'glass',
  dessert: 'cone',
  attraction: 'star',
  shop: 'bag',
  other: 'dot',
};

export const CATEGORY_STYLES = Object.fromEntries(
  CATEGORY_ORDER.map((category) => [
    category,
    { ...CATEGORY_DISPLAY[category], glyph: GLYPH_BY_CATEGORY[category] },
  ])
) as Record<ProductCategory, CategoryStyle>;

export function categoryStyle(category: string | undefined | null): CategoryStyle {
  if (category && category in CATEGORY_STYLES) {
    return CATEGORY_STYLES[category as ProductCategory];
  }
  return CATEGORY_STYLES[DEFAULT_CATEGORY];
}

/** Pin geometry in CSS pixels, before `devicePixelRatio`. */
export const PIN = {
  /** Radius of the round head; the tail is drawn from its lower tangents. */
  headRadius: 13,
  /** Head centre to tip. Must exceed `headRadius`, or the tangents have no solution. */
  bodyHeight: 40,
  ringWidth: 2.5,
  glyphBox: 14,
  /** Selected pins are drawn into their own, larger image rather than scaled at render time —
   *  MapLibre's `icon-size` resamples one bitmap and the ring goes soft. */
  selectedScale: 1.28,
  /** Room for the drop shadow, which is why the tip is not at the bottom edge of the bitmap. */
  shadowPad: 3,
  shadowBlur: 4,
  shadowOffsetY: 1.5,
} as const;

export interface PinGeometry {
  /** Bitmap size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Centre of the round head, in the bitmap's own CSS pixels. */
  readonly centreX: number;
  readonly centreY: number;
  /** Where the point of the teardrop lands. */
  readonly tipY: number;
  readonly headRadius: number;
  readonly ringWidth: number;
  readonly glyphBox: number;
  /**
   * CSS pixels between the tip and the bottom edge of the bitmap. The layer anchors icons at
   * `bottom` and pushes them down by this much, so the tip — not the shadow — sits on the
   * coordinate.
   */
  readonly tipToBottom: number;
}

export function pinGeometry(selected: boolean): PinGeometry {
  const scale = selected ? PIN.selectedScale : 1;
  const headRadius = PIN.headRadius * scale;
  const ringWidth = PIN.ringWidth * scale;
  const inset = PIN.shadowPad + ringWidth;
  const centreX = inset + headRadius;
  const tipY = inset + PIN.bodyHeight * scale;
  const tipToBottom = PIN.shadowPad + PIN.shadowBlur;

  return {
    width: centreX * 2,
    height: tipY + tipToBottom,
    centreX,
    centreY: inset + headRadius,
    tipY,
    headRadius,
    ringWidth,
    glyphBox: PIN.glyphBox * scale,
    tipToBottom,
  };
}

/** Image ids registered with `map.addImage`. Stable strings so the layer's `icon-image`
 *  expression can build them with `concat`. */
export const PIN_IMAGE_PREFIX = 'p002-pin-';

export function pinImageId(category: ProductCategory, selected: boolean): string {
  return `${PIN_IMAGE_PREFIX}${category}${selected ? '-selected' : ''}`;
}

/** Every image the layer's `icon-image` expression can resolve to. */
export function allPinImageIds(): string[] {
  return CATEGORY_ORDER.flatMap((c) => [pinImageId(c, false), pinImageId(c, true)]);
}

/**
 * `icon-image` for the pin layer: the feature's own category, in its selected variant when
 * its id matches `selectedId`.
 *
 * The `case` is omitted entirely when nothing is selected rather than compared against `null`.
 * `['==', ['get', 'id'], null]` reads as an always-false test and is not one: MapLibre's `==`
 * wants two values of the same type, so with a string `id` it fails at evaluation — and an
 * `icon-image` that fails to evaluate produces no icon at all. Measured: every pin vanished from
 * the map while the source still held all ten features.
 *
 * `coalesce` on the category guards the other way a name can miss. A category the palette has no
 * entry for would build an image id that was never registered, and MapLibre drops the symbol
 * rather than falling back. `toPlaceFeatures` already normalises it, so this is belt-and-braces.
 */
export function pinIconImageExpression(selectedId: string | null): unknown[] {
  const name: unknown[] = ['coalesce', ['get', 'category'], DEFAULT_CATEGORY];
  if (selectedId === null) return ['concat', PIN_IMAGE_PREFIX, name];
  return [
    'concat',
    PIN_IMAGE_PREFIX,
    name,
    ['case', ['==', ['get', 'id'], selectedId], '-selected', ''],
  ];
}

/**
 * How much of a pin is left once you have been there.
 *
 * The constraint is that a place you have been to must stay a *normal pin* — same category colour,
 * same glyph, same tap target — so the only lever is emphasis
 * (`product-ruling-after-the-save.md` §6.2 criterion 9). Seven category colours already carry
 * meaning on this map and an eighth hue for "been" would compete with all of them; opacity does
 * not, because it reads as *quieter*, not as *different*.
 *
 * 0.45 rather than something gentler: measured against CARTO Positron, a mint or brown pin at 0.7
 * is indistinguishable from a full-strength one at arm's length on a phone, and the whole point is
 * that a glance at the map should separate what is left to do from what is done. 0.45 is still
 * comfortably above the basemap's own label ink, so the pin never reads as disabled or as a
 * rendering artefact — it is quiet, not gone.
 *
 * `icon-opacity` and `text-opacity` are compositor-side, per-feature paint properties: the layer
 * re-evaluates them when the source data changes and never re-lays-out or re-collides the symbols,
 * so a mark costs no relayout of the map.
 */
export const VISITED_PIN_OPACITY = 0.45;

/** The name label under a visited pin, one notch less faded than the pin — at 0.45 an 12 px label
 *  with a halo starts to disappear into the basemap, and a nameless pin is a worse answer than a
 *  quiet one. */
export const VISITED_LABEL_OPACITY = 0.55;

/**
 * Paint opacity for the pin layer: full strength, reduced for a place you have been to.
 *
 * A plain data-driven `case` on the feature's own property, so nothing needs to be re-pushed when a
 * mark changes — `revalidatePath('/map')` refreshes `places`, `toPlaceFeatures` rebuilds the
 * collection, `setData` lands it, and the expression re-evaluates on the new property.
 *
 * `to-boolean` rather than a bare `['get', 'visited']`: an older feature written before this
 * property existed would `get` `null`, and MapLibre's `case` requires a boolean condition — a
 * failed condition drops the whole paint property, which would fade *every* pin. `to-boolean`
 * makes `null` false, which is also the honest default.
 */
export function pinOpacityExpression(visitedOpacity = VISITED_PIN_OPACITY): unknown[] {
  return ['case', ['to-boolean', ['get', 'visited']], visitedOpacity, 1];
}

/** Draw the selected pin last, so its larger body is never covered by a neighbour. Same `null`
 *  caveat as `pinIconImageExpression`. */
export function pinSortKeyExpression(selectedId: string | null): unknown[] | number {
  if (selectedId === null) return 1;
  return ['case', ['==', ['get', 'id'], selectedId], 0, 1];
}

/**
 * The zoom at which a place's name appears next to its pin.
 *
 * Below this the map is for orientation and a field of labels is noise; above it the user is
 * reading one neighbourhood and the names are the point.
 *
 * The layer draws these labels with collision off (see `place-marker-layer.tsx`), so this zoom is
 * the only thing thinning them — which is why it is 14 and not 13.5. At 13.5 a dense
 * neighbourhood stacked two or three names on top of each other; by 14 the pins have separated.
 */
export const LABEL_MIN_ZOOM = 14;

/** Names longer than this wrap; `text-max-width` is in ems, which is what the layer wants. */
export const LABEL_MAX_WIDTH_EM = 9;

/**
 * The pin layer's `layout` and `paint`, as plain objects.
 *
 * Extracted out of `place-marker-layer.tsx` when clustering was removed (`L1-F5-T5`), for two
 * reasons that are the same reason. **The layer spec is the thing the ruling is about** — "no
 * numbered bubble" is a claim about `filter`, `icon-image` and the absence of a second layer — and
 * while it was an object literal inside a `useEffect` the only way to assert it was to read the
 * source file as text. It is also what a performance harness has to reproduce to measure anything
 * honest about 2 000 pins; a hand-transcribed copy would be measuring a different layer.
 *
 * `textFont` is passed in because it is discovered from the loaded basemap style at runtime
 * (`styleTextFont`), which is a fact about CARTO rather than about our pins.
 */
export function pinLayerLayout(
  textFont: readonly string[],
  selectedId: string | null = null,
): Record<string, unknown> {
  const geometry = pinGeometry(false);
  return {
    'icon-image': pinIconImageExpression(selectedId),
    'icon-anchor': 'bottom',
    // Push the bitmap down by the gap its shadow leaves under the tip, so the point of the
    // teardrop — not the bottom edge of the image — sits on the coordinate.
    'icon-offset': [0, geometry.tipToBottom],
    // Pins must never be dropped for colliding with each other: two saves on one street is normal,
    // and a place that vanishes is worse than two that overlap. This is also why the removal of
    // clustering shows up as a *mat* of pins at world zoom rather than as missing ones — see
    // `place-marker-layer.tsx`'s header.
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'symbol-sort-key': pinSortKeyExpression(selectedId),
    // The label gate, and the reason a "show everything" zoom-out is an icons-only case: symbol
    // layout runs per tile at the tile's own zoom, so below `LABEL_MIN_ZOOM` this `step` yields the
    // empty string and MapLibre shapes zero glyphs. Measured — see `06` §9.1.
    'text-field': ['step', ['zoom'], '', LABEL_MIN_ZOOM, ['get', 'name']],
    'text-font': [...textFont],
    'text-size': 12,
    'text-anchor': 'top',
    'text-offset': [0, 0.4],
    'text-max-width': LABEL_MAX_WIDTH_EM,
    // Your own places outrank the basemap. With collision on, MapLibre places symbols in layer
    // order and ours is the last layer, so every name lost to a street label that was already there
    // — measured at zoom 14 with six pins on screen and not one name drawn. `ignore-placement` too,
    // so winning does not cost the basemap its own labels.
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  };
}

export function pinLayerPaint(): Record<string, unknown> {
  return {
    'text-color': '#1B1B1A',
    'text-halo-color': '#FAF9F6',
    'text-halo-width': 1.6,
    // A place you have been to is the same pin, quieter — see `pinOpacityExpression`. Both are
    // per-feature paint properties, so a mark re-evaluates them on the next `setData` without
    // touching placement or collision; nothing here re-lays-out the map.
    'icon-opacity': pinOpacityExpression(),
    'text-opacity': pinOpacityExpression(VISITED_LABEL_OPACITY),
  };
}
