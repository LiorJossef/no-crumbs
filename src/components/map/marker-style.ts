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
import { CATEGORY_DISPLAY } from '@/ui/place/category-display';
import { PIN_LABEL_HALO, PIN_LABEL_INK, UNCATEGORISED_COLOR } from '@/ui/place/palette';
import { PIN_BAND_MIN } from './zoom-bands';

/**
 * The pin drawn for a place we have no category for.
 *
 * A **pin key, not a category** — that distinction is the whole of the 2026-08-29 narrowing. It is
 * a thing the map has to draw, because every place gets a pin; it is not a thing the filter bar
 * offers, because "we have no fact here" is not something to filter a library by. The old `other`
 * was both at once, which is how it became a category in everything but name.
 */
export const UNCATEGORISED_PIN = 'uncategorised';

/** Everything the map may draw a pin for: the three categories, plus the absence of one. */
export type PinKey = ProductCategory | typeof UNCATEGORISED_PIN;

/** Draw order, and the order images are registered in. */
export const CATEGORY_ORDER: readonly PinKey[] = [...PRODUCT_CATEGORY_ORDER, UNCATEGORISED_PIN];

/** The glyph drawn inside a pin. `./marker-images.ts` has one draw routine per value.
 *
 *  `croissant`, `cone`, `star` and `bag` went with the categories they belonged to — a bakery and
 *  a gelateria are `cafe` now and draw a cup, and there is no `shop` or `attraction` to draw. Their
 *  draw routines went with them rather than being left in place "in case", which is how a palette
 *  ends up with glyphs nothing references. */
export type GlyphName = 'fork' | 'cup' | 'glass' | 'dot';

/** The pin's colour and label come from `ui/place/category-display.ts`, which the list and the
 *  detail view read too — a café is the same brown word-and-colour wherever it appears. Only the
 *  glyph is the map's own. The colours themselves are `ui/place/palette.ts`, by name: a MapLibre
 *  expression is evaluated by the GL renderer and cannot resolve a CSS custom property, so the map
 *  takes the literal while the DOM takes the `--category-*` token. */
export type CategoryStyle = (typeof CATEGORY_DISPLAY)[ProductCategory] & {
  readonly glyph: GlyphName;
};

const GLYPH_BY_PIN: Record<PinKey, GlyphName> = {
  restaurant: 'fork',
  cafe: 'cup',
  bar: 'glass',
  [UNCATEGORISED_PIN]: 'dot',
};

const UNCATEGORISED_STYLE: CategoryStyle = {
  label: null,
  color: UNCATEGORISED_COLOR,
  glyph: GLYPH_BY_PIN[UNCATEGORISED_PIN],
};

export const CATEGORY_STYLES = Object.fromEntries(
  CATEGORY_ORDER.map((key) => [
    key,
    key === UNCATEGORISED_PIN
      ? UNCATEGORISED_STYLE
      : { ...CATEGORY_DISPLAY[key], glyph: GLYPH_BY_PIN[key] },
  ])
) as Record<PinKey, CategoryStyle>;

export function categoryStyle(category: string | undefined | null): CategoryStyle {
  if (category && category in CATEGORY_STYLES) {
    return CATEGORY_STYLES[category as PinKey];
  }
  return UNCATEGORISED_STYLE;
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

export function pinImageId(category: PinKey, selected: boolean): string {
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
  const name: unknown[] = ['coalesce', ['get', 'category'], UNCATEGORISED_PIN];
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
export function pinOpacityExpression(
  visitedOpacity = VISITED_PIN_OPACITY,
  hoveredId: string | null = null,
  landedThrough: number | null = null,
): unknown[] {
  const own: unknown[] = ['case', ['to-boolean', ['get', 'visited']], visitedOpacity, 1];
  if (landedThrough !== null) {
    // **`pins.land`'s gate** (`W6-6`). Multiplied onto whatever the pin's resting opacity would
    // otherwise be, rather than replacing it, so a visited pin lands *as a visited pin* and the
    // hover dim below still composes on top. A pin whose wave has not arrived is at 0 and is not
    // yet drawn; `icon-opacity-transition` turns each wave's flip into a fade rather than a pop.
    return ['*', hoveredId === null ? own : linkedOpacity(own, hoveredId, visitedOpacity), [
      'case',
      ['<=', ['coalesce', ['get', 'landOrder'], 0], landedThrough],
      1,
      0,
    ]];
  }
  if (hoveredId === null) return own;
  // **The row↔pin coupling's dim half** (`W3-2`, `ux-overnight-specs.md` §2.2). Pointing at a row
  // in the list quietens every pin except its own, so the two surfaces read as one thing.
  //
  // `0` for the hovered pin, because `pin-highlight-layer.tsx` draws it instead: drawing both
  // would double the ring and the shadow, and the highlight is a different bitmap at a different
  // offset. Everything else drops to `visitedOpacity`, which is the level a *visited* mark already
  // sits at on this property — so a neighbour you have already been to does not move at all, and
  // the dim reads as "the others got quieter" rather than as a global flicker.
  //
  // Still a `case` on a **paint** property and still per-feature, so this re-evaluates on the
  // compositor and never re-lays-out or re-collides a symbol. That is the whole reason hover can
  // afford to change at pointer rate; see `pin-highlight-layer.tsx` for the alternative that
  // cannot.
  return linkedOpacity(own, hoveredId, visitedOpacity);
}

/** The hover arm, factored out so the landing gate can multiply onto it rather than choosing
 *  between the two. `own` is unused in the result today and is taken anyway: it is what the arm
 *  replaces, and a future dim that wants to preserve the visited distinction needs it in scope. */
function linkedOpacity(own: unknown[], hoveredId: string, visitedOpacity: number): unknown[] {
  void own;
  return ['case', ['==', ['get', 'id'], hoveredId], 0, visitedOpacity];
}

/**
 * How quiet a pin goes while a *different* one is pointed at, on whichever property is asking.
 *
 * A named alias rather than a number, because the value is deliberately not a new one: the dim
 * level **is** the visited level, per property (0.45 for an icon, 0.55 for a label). One number
 * with two meanings is intentional — it is what makes "a visited neighbour does not move" true,
 * and it keeps the map from acquiring a second, competing idea of *quiet*.
 *
 * `ux-overnight-specs.md` §2.2 specifies a single `LINKED_DIM_OPACITY = VISITED_PIN_OPACITY` used
 * for both properties. That is right for icons and wrong for labels: a visited label rests at 0.55,
 * so dimming it to 0.45 would make the one mark the spec says must not move the only one that does.
 * The deviation is per-property rather than per-value, and it is why `pinOpacityExpression` reuses
 * its own `visitedOpacity` argument instead of reading a constant.
 */
export const LINKED_DIM_OPACITY = VISITED_PIN_OPACITY;

/** How long the dim and the lift take, in milliseconds — `--duration-link`, expressed here because
 *  a MapLibre transition is read by the GL renderer and cannot resolve a CSS custom property. */
export const LINK_TRANSITION_MS = 160;

/**
 * **`pins.land`: how many waves the pins arrive in** (`facelift-plan.md` §3a, 900 ms + 60 ms).
 *
 * A fixed count rather than one wave per pin, and that is the whole sizing decision. One wave per
 * pin makes the landing a function of library size — thirty places would take 1.8 s and two
 * thousand would take two minutes — so the arrival would get slower exactly as the map got busier.
 * Eight waves at `LAND_STAGGER_MS` is **480 ms for any library**, which is inside the 500 ms a
 * page-load animation may take before it stops reading as arrival and starts reading as lag.
 */
export const LAND_WAVES = 8;

/** `--duration-stagger-pin`. The gap between waves, written here because a MapLibre paint
 *  transition is read by the GL renderer and cannot resolve a CSS custom property. */
export const LAND_STAGGER_MS = 60;

/**
 * **Which wave each pin lands in: nearest the middle first, radiating outward.**
 *
 * The order is a rank by distance from the library's own centroid, bucketed into `LAND_WAVES`
 * equal-sized groups. Radiating outward rather than by save date or by array index, because the
 * camera has just come to rest framing this box — so the middle is where the user is already
 * looking, and an arrival that starts there and spreads reads as the map filling in. A landing
 * ordered by `created_at` would start at an arbitrary corner and look like a list loading.
 *
 * **Equal-sized buckets, not equal-distance ones.** A library with one outlier would otherwise put
 * 29 pins in wave 0 and one in wave 7, i.e. no stagger and then a straggler. Rank buckets make the
 * *number* of pins per wave constant, which is what makes the cadence even whatever the shape.
 *
 * Pure, and takes points rather than features, so the rule is testable without GeoJSON.
 */
export function landOrderFor(points: readonly { lat: number; lng: number }[]): number[] {
  const count = points.length;
  if (count === 0) return [];
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / count;
  const meanLng = points.reduce((sum, p) => sum + p.lng, 0) / count;
  const cos = Math.max(Math.cos((meanLat * Math.PI) / 180), 1e-6);
  const ranked = points
    .map((point, index) => {
      const dLat = point.lat - meanLat;
      const dLng = (point.lng - meanLng) * cos;
      return { index, distance: dLat * dLat + dLng * dLng };
    })
    // Ties broken by index so the order is deterministic: two places at one address must not swap
    // waves between renders, or the landing flickers on a re-mount.
    .sort((a, b) => a.distance - b.distance || a.index - b.index);

  const order = new Array<number>(count).fill(0);
  ranked.forEach((entry, rank) => {
    order[entry.index] = Math.min(LAND_WAVES - 1, Math.floor((rank * LAND_WAVES) / count));
  });
  return order;
}

/** The id of the one-feature layer that draws the pointed-at pin. */
export const PIN_HIGHLIGHT_LAYER_SUFFIX = 'pin-highlight';

/**
 * **The lifted pin, as a layer spec** — the other half of the coupling.
 *
 * It is its own single-feature layer and that is forced twice over.
 *
 * `icon-translate` is what lifts it, and in MapLibre that is a **paint property that is not
 * data-driven**: it takes one value for the whole layer, so it cannot be expressed as a `case` over
 * the hovered feature on the main pin layer. A layer holding exactly one feature is the only way to
 * translate exactly one symbol.
 *
 * And the obvious alternative — swapping the hovered pin's `icon-image` on the main layer, which is
 * how *selection* works — is a **layout** property change: it re-lays-out and re-collides every
 * symbol in the layer. Selection pays that once per tap. Hover would pay it per pointer move across
 * a list, and at the 2 000-pin ceiling that is the frame budget gone (`06` §9.1: 2 000 symbols
 * relaying out is the expensive case, not drawing them). One extra symbol costs one quad.
 *
 * `text-field` carries **no zoom gate at all** — not the `W2-3` ladder, not a `step`. The pointed-at
 * pin is named at every zoom, which is the entire point of the coupling: the row says a name and
 * the map has to say the same name back. It is one glyph run, so the ladder's budget argument does
 * not apply to it.
 */
export function pinHighlightLayerLayout(textFont: readonly string[]): Record<string, unknown> {
  const geometry = pinGeometry(false);
  return {
    'icon-image': ['concat', PIN_IMAGE_PREFIX, ['coalesce', ['get', 'category'], UNCATEGORISED_PIN]],
    'icon-anchor': 'bottom',
    'icon-offset': [0, geometry.tipToBottom],
    // 1.1×, resampled from the unselected bitmap rather than drawn at size. `PIN.selectedScale` is
    // 1.28 and has its own bitmap precisely because resampling softened the ring at that size; 1.1
    // is a much smaller step and is deliberately provisional. **If it reads soft on a retina
    // display the repair is a dedicated hover bitmap in `marker-images.ts`, which belongs to the
    // crumb-silhouette work — report it, do not open that file.**
    'icon-size': 1.1,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'text-field': ['get', 'name'],
    'text-font': [...textFont],
    'text-size': LABEL_TEXT_SIZE,
    'text-anchor': 'top',
    'text-offset': [0, LABEL_OFFSET_EM],
    'text-max-width': LABEL_MAX_WIDTH_EM,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  };
}

/**
 * Paint for the highlight layer. `icon-translate` is the lift; its transition is what makes the
 * lift a movement rather than a jump, and it is the only thing `prefers-reduced-motion` removes
 * here — §3a's rule is that the nine animations collapse **to the opacity change**, not to nothing,
 * so the dim stays in both arms and the pin still has to be findable.
 */
export function pinHighlightLayerPaint(reducedMotion: boolean): Record<string, unknown> {
  return {
    'icon-translate': [0, -3],
    'icon-translate-transition': { duration: reducedMotion ? 0 : LINK_TRANSITION_MS, delay: 0 },
    'text-color': PIN_LABEL_INK,
    'text-halo-color': PIN_LABEL_HALO,
    'text-halo-width': 1.6,
  };
}

/** Draw the selected pin last, so its larger body is never covered by a neighbour. Same `null`
 *  caveat as `pinIconImageExpression`. */
export function pinSortKeyExpression(selectedId: string | null): unknown[] | number {
  if (selectedId === null) return 1;
  return ['case', ['==', ['get', 'id'], selectedId], 0, 1];
}

/**
 * **The zoom by which every saved place is named**, and the top of the tier ladder below.
 *
 * This was `LABEL_MIN_ZOOM` — one flat gate, the only thing thinning the labels, and the reason it
 * was 14 rather than 13.5 was legibility rather than cost: *"at 13.5 a dense neighbourhood stacked
 * two or three names on top of each other; by 14 the pins have separated."* That sentence is still
 * true and it is why 14 is still where the ladder ends. What changed is that 14 is no longer where
 * it *starts*: since the home camera came to rest on the user's own pins (`W2-1`), a settled home
 * view sits at z8.8–13 and a flat gate at 14 meant the overview had pins and not one name on it.
 */
export const LABEL_ALL_ZOOM = 14;

/**
 * **The zooms a name may appear at**, low to high — `W2-3`, `facelift-plan.md` stage 2's *"labels
 * tiered by zoom, not gated at 14"*.
 *
 * A pin's name appears at the first tier by which that pin has `LABEL_CLEARANCE_PX` of room to its
 * nearest neighbour, so a place alone in its city is named on the overview and nine places on one
 * street are named when the user has zoomed in far enough to tell them apart. The tier is a
 * per-feature property (`labelZoom`, stamped in `place-marker-layer.tsx`) and the zoom test is the
 * `step` in `pinTextFieldExpression`, because MapLibre only allows `['zoom']` at the top level of a
 * `step` or `interpolate` in a layout property.
 *
 * The floor is `PIN_BAND_MIN` rather than a number of its own: below it this layer does not draw at
 * all on a surface with summary bands, so a lower tier could only ever apply to
 * `/collections/[id]`, where a name over a two-place collection at world zoom is noise.
 *
 * Five tiers rather than a continuous ramp: `text-field` is a *layout* property, so every distinct
 * value it can take is a distinct symbol layout, and a continuous per-feature threshold would
 * relayout on every fractional zoom change. Five steps relayout five times, which is what the
 * bands already cost.
 */
export const LABEL_TIER_ZOOMS: readonly number[] = [PIN_BAND_MIN, 10, 11.5, 13, LABEL_ALL_ZOOM];

/**
 * How far a pin's nearest neighbour has to be, on screen, before its name is worth drawing.
 *
 * The labels are drawn with collision **off** — `text-allow-overlap` is on and has to be, because
 * these are the user's own places and a name that loses a fight with a street label is a name that
 * silently is not there (measured: at z14 with six pins on screen, with collision on, not one name
 * drew). So nothing thins them but this number, and it is the label's own width rather than a
 * guess: `text-max-width` is 9 em at `text-size` 12, i.e. ~108 px for a wrapped name, and 96 px is
 * that minus the slack a short name leaves.
 *
 * **This is also what keeps the frame budget.** `06` §9.1 measured 2 000 pins at 19.0 ms median
 * with labels gated and 34.0 ms / ~29 fps with labels forced on, and the flat gate was the whole
 * of the defence. A separation rule is a strictly stronger one: the number of labels that can be
 * shaped at any zoom is bounded by the number of `LABEL_CLEARANCE_PX` cells on the screen, which is
 * a function of the *viewport* and not of the library. A 2 000-place library clumped in six cities
 * shapes a handful of glyphs at z9, where the flat gate shaped none and a naive tiering would shape
 * two thousand.
 */
export const LABEL_CLEARANCE_PX = 96;

/** Names longer than this wrap; `text-max-width` is in ems, which is what the layer wants. */
export const LABEL_MAX_WIDTH_EM = 9;

/** The label's own type size, in CSS pixels. Declared rather than inlined in the layer spec
 *  because `LABEL_FIT_ALLOWANCE` is derived from it and the two must not drift. */
export const LABEL_TEXT_SIZE = 12;

/** `text-offset`, in ems, from the icon's anchor. A name sits *below* its pin. */
export const LABEL_OFFSET_EM = 0.4;

/** How many lines a wrapped name is allowed to be before the fit stops paying for it. Two, which
 *  is what `LABEL_MAX_WIDTH_EM` produces for the long end of real place names. */
const LABEL_MAX_LINES = 2;

/**
 * **Room for the name drawn beside a pin at the edge of the fitted box**, per axis, in CSS pixels —
 * the same shape as `summaryPillFitAllowance`'s answer for a summary pill, and needed for the same
 * reason now that names are drawn at rest (`W2-3`).
 *
 * The fit frames **pin anchors**. Until the label ladder landed, that was enough: `FIT_BOUNDS_PADDING`
 * is 48 px and the map's zoom-control column is a 40 px button at `right-2`, i.e. exactly 48 px
 * wide, so a pin came to rest precisely at the column's leading edge. A *name* is wider than its
 * pin, so it went under the controls — photographed at 390×844 with three places, where the
 * right-hand pin's name rendered as `Filter C…` / `Bar N…` beneath the geolocate and zoom buttons,
 * and at 1440×900 where the lowest pin's name ran off the bottom edge. Neither is truncation: the
 * label is drawn and the chrome sits on top of it.
 *
 * Half a label's width, because a name is centred on its pin and only half of it hangs off either
 * side. The height is the offset plus the lines, measured below the anchor, and is applied to both
 * edges the way the pill allowance is — the fit takes one number per axis.
 *
 * **It is not free and it is not always paid.** Adding it widens the padding, which lowers the
 * fitted zoom, and the home camera may only spend that where doing so does not push the library
 * out of the pin band — see `fitToBounds`, which is where that decision lives, because only the
 * camera knows what the alternative costs.
 */
export const LABEL_FIT_ALLOWANCE = {
  x: (LABEL_MAX_WIDTH_EM * LABEL_TEXT_SIZE) / 2,
  y: (LABEL_OFFSET_EM + LABEL_MAX_LINES * 1.2) * LABEL_TEXT_SIZE,
} as const;

/** Web Mercator, the way `camera-model.ts` and MapLibre both compute it: a 512 px tile world. */
const EQUATOR_METRES = 40075016.686;
const TILE_PX = 512;

/** Ground resolution in metres per CSS pixel at a zoom and a latitude. */
export function metresPerPixel(zoom: number, lat: number): number {
  return (EQUATOR_METRES * Math.cos((lat * Math.PI) / 180)) / (TILE_PX * 2 ** zoom);
}

/**
 * The zoom at which two points `metres` apart are `LABEL_CLEARANCE_PX` apart on screen — i.e. the
 * zoom at which a name beside one of them stops touching the other.
 *
 * `Infinity` in, `-Infinity` out: a pin with no neighbour at all needs no zoom to have room, and
 * `labelTierFor` turns that into the lowest tier.
 */
export function separationZoom(metres: number, lat: number): number {
  if (metres <= 0) return Number.POSITIVE_INFINITY;
  return Math.log2((LABEL_CLEARANCE_PX * metresPerPixel(0, lat)) / metres);
}

/**
 * Which tier a pin whose nearest neighbour is `metres` away belongs to: the first tier at or above
 * the zoom where it has room, and the last tier for anything that never does.
 *
 * The last tier is `LABEL_ALL_ZOOM`, so a pin that is genuinely on top of its neighbour is named at
 * 14 exactly as it is today. **Nothing is hidden by this change that is visible without it** — the
 * ladder only ever moves a name *earlier*.
 */
export function labelTierFor(metres: number, lat: number): number {
  const needed = separationZoom(metres, lat);
  for (const tier of LABEL_TIER_ZOOMS) {
    if (needed <= tier) return tier;
  }
  return LABEL_ALL_ZOOM;
}

/**
 * `text-field` for the pin layer: nothing, then progressively the pins that have room, then all of
 * them.
 *
 * One `step` on `['zoom']` with a per-feature `case` in each branch, and that shape is forced:
 * MapLibre rejects a zoom expression anywhere but the top level of a `step` or `interpolate` in a
 * layout property, so `['case', ['>=', ['zoom'], ['get', 'labelZoom']], …]` — the obvious way to
 * write this — does not compile.
 *
 * The first branch is the literal empty string, which is what makes a zoom-out cost nothing:
 * symbol layout runs per tile at the tile's own zoom, so below the floor MapLibre shapes zero
 * glyphs. That property is the one `06` §9.1's measurement depends on and it is unchanged.
 */
export function pinTextFieldExpression(): unknown[] {
  const expression: unknown[] = ['step', ['zoom'], ''];
  for (const tier of LABEL_TIER_ZOOMS) {
    expression.push(tier, [
      'case',
      ['<=', ['coalesce', ['get', 'labelZoom'], LABEL_ALL_ZOOM], tier],
      ['get', 'name'],
      '',
    ]);
  }
  return expression;
}

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
    // The label ladder, and the reason a "show everything" zoom-out is still an icons-only case:
    // symbol layout runs per tile at the tile's own zoom, so below the lowest tier this `step`
    // yields the empty string and MapLibre shapes zero glyphs. Measured — see `06` §9.1 — and see
    // `pinTextFieldExpression` for why the per-pin test lives inside the branches.
    'text-field': pinTextFieldExpression(),
    'text-font': [...textFont],
    'text-size': LABEL_TEXT_SIZE,
    'text-anchor': 'top',
    'text-offset': [0, LABEL_OFFSET_EM],
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
    // `--foreground` and `--background`, by name from the palette module — a `text-color` is a
    // MapLibre paint value and `var(--foreground)` would not parse. See `palette.ts`'s header for
    // why the duplication is deliberate.
    'text-color': PIN_LABEL_INK,
    'text-halo-color': PIN_LABEL_HALO,
    'text-halo-width': 1.6,
    // A place you have been to is the same pin, quieter — see `pinOpacityExpression`. Both are
    // per-feature paint properties, so a mark re-evaluates them on the next `setData` without
    // touching placement or collision; nothing here re-lays-out the map.
    'icon-opacity': pinOpacityExpression(),
    'text-opacity': pinOpacityExpression(VISITED_LABEL_OPACITY),
    // …and the same two properties carry the row↔pin dim (`W3-2`), so the ramp between the two
    // states is declared once, here, rather than per update. `--duration-link`, written as a number
    // because a MapLibre transition is read by the GL renderer and cannot resolve a CSS custom
    // property (see `ui/place/palette.ts`'s header for the same reason applied to colour).
    //
    // **No reduced-motion arm, and that is `facelift-plan.md` §3a's own rule rather than an
    // omission:** the nine animations collapse *to the opacity change*, not to nothing. An opacity
    // ramp is already the reduced form. What reduced motion removes is the highlight's translate —
    // see `pinHighlightLayerPaint`.
    'icon-opacity-transition': { duration: LINK_TRANSITION_MS, delay: 0 },
    'text-opacity-transition': { duration: LINK_TRANSITION_MS, delay: 0 },
  };
}
