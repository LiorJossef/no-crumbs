/**
 * What a saved place looks like on the map: one colour and one glyph per category, plus the
 * MapLibre expressions the layers are built from.
 *
 * Kept free of React, MapLibre runtime and `<canvas>` so the palette and the expressions can be
 * unit-tested in a node environment. The drawing lives in `./marker-images.ts`, the wiring in
 * `./place-marker-layer.tsx`.
 */

import type { ExtractedCategoryHint } from '@/domain/places/category-hint';
import { CATEGORY_DISPLAY, DEFAULT_CATEGORY } from '@/ui/place/category-display';

export { DEFAULT_CATEGORY };

export const CATEGORY_ORDER = [
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'attraction',
  'shop',
  'other',
] as const satisfies readonly ExtractedCategoryHint[];

/** The glyph drawn inside a pin. `./marker-images.ts` has one draw routine per value. */
export type GlyphName = 'fork' | 'cup' | 'croissant' | 'glass' | 'star' | 'bag' | 'dot';

/** The pin's colour and label come from `ui/place/category-display.ts`, which the list and the
 *  detail view read too — a café is the same brown word-and-colour wherever it appears. Only the
 *  glyph is the map's own. */
export type CategoryStyle = (typeof CATEGORY_DISPLAY)[ExtractedCategoryHint] & {
  readonly glyph: GlyphName;
};

const GLYPH_BY_CATEGORY: Record<ExtractedCategoryHint, GlyphName> = {
  restaurant: 'fork',
  cafe: 'cup',
  bakery: 'croissant',
  bar: 'glass',
  attraction: 'star',
  shop: 'bag',
  other: 'dot',
};

export const CATEGORY_STYLES = Object.fromEntries(
  CATEGORY_ORDER.map((category) => [
    category,
    { ...CATEGORY_DISPLAY[category], glyph: GLYPH_BY_CATEGORY[category] },
  ])
) as Record<ExtractedCategoryHint, CategoryStyle>;

export function categoryStyle(category: string | undefined | null): CategoryStyle {
  if (category && category in CATEGORY_STYLES) {
    return CATEGORY_STYLES[category as ExtractedCategoryHint];
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

export const CLUSTER = {
  color: '#2E7A70',
  ringColor: '#FFFFFF',
  ringWidth: 2.5,
  textColor: '#FFFFFF',
} as const;

/** Image ids registered with `map.addImage`. Stable strings so the layer's `icon-image`
 *  expression can build them with `concat`. */
export const PIN_IMAGE_PREFIX = 'p002-pin-';

export function pinImageId(category: ExtractedCategoryHint, selected: boolean): string {
  return `${PIN_IMAGE_PREFIX}${category}${selected ? '-selected' : ''}`;
}

/** Every image the layer's `icon-image` expression can resolve to. */
export function allPinImageIds(): string[] {
  return CATEGORY_ORDER.flatMap((c) => [pinImageId(c, false), pinImageId(c, true)]);
}

/**
 * `icon-image` for the unclustered layer: the feature's own category, in its selected variant when
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

/** Draw the selected pin last, so its larger body is never covered by a neighbour. Same `null`
 *  caveat as `pinIconImageExpression`. */
export function pinSortKeyExpression(selectedId: string | null): unknown[] | number {
  if (selectedId === null) return 1;
  return ['case', ['==', ['get', 'id'], selectedId], 0, 1];
}

/** Cluster radius by member count. Deliberately close to a pin's own head at the low end: a
 *  cluster of two is a slightly bigger sibling of a pin, not a different species. */
export function clusterRadiusExpression(): unknown[] {
  return ['interpolate', ['linear'], ['get', 'point_count'], 2, 16, 5, 19, 15, 23, 50, 28];
}

export function clusterTextSizeExpression(): unknown[] {
  return ['interpolate', ['linear'], ['get', 'point_count'], 2, 12, 15, 14, 50, 16];
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
