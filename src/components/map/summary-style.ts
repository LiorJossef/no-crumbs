/**
 * The country and area bands' layer specifications (`docs/ux-library-at-scale.md` §2.2, §2.3).
 *
 * Extracted from the component for the reason `marker-style.ts` was: **the layer spec is the thing
 * the spec is about.** "Three zoom bands, swapped by MapLibre and not by React" is a claim about
 * `minzoom`/`maxzoom`, and while those numbers live inside a `useEffect` the only way to assert
 * them is to read the source file as text.
 *
 * Nothing here draws a density bubble. The pills below are one area's marker, and an area is a
 * named 50 km cluster that the list already uses as its active scope — not a count of whatever
 * happened to fall within a radius of the screen (`06` §9.1, `L1-F5-T5`).
 *
 * ## One pill, two bands, and why the text is not on the basemap
 *
 * Both bands are **one symbol layer** carrying a stretchable `icon-image` and a `text-field`, fitted
 * to each other with `icon-text-fit: 'width'`. The first version had the label and the count falling
 * on the basemap as haloed text beside a disc, and on the running map that reads as unfinished map
 * furniture: it collided with CARTO's own labels, and the area band drew the area's name directly
 * over the basemap's own label for the same city. A pill is a surface, and a surface is what makes
 * the marker read as something you can tap.
 *
 * The count and the label stay **live text in a symbol layer** — §2.2's rule, and the reason the
 * pill is a stretchable image rather than a bitmap with the number drawn into it. It is also what
 * lets `תל אביב-יפו` shape through the RTL plugin.
 */

import {
  SUMMARY_PILL,
  summaryPillFitAllowance,
  type DiscTokens,
  type SummaryPillLabel,
} from './country-flag-image';
import { MAX_MARKER_ALLOWANCE_SHARE } from './query-rect';
import { AREA_BAND_MAX, AREA_BAND_MIN, COUNTRY_BAND_MAX } from './zoom-bands';

/**
 * The label's size, shared by both bands so one number is not two.
 *
 * No layer reads it any more — both bands bake their text into a bitmap, so the number that is
 * actually drawn at is `country-flag-image.ts`'s `SUMMARY_LABEL_FONT_PX`, which that file already
 * documents as being this one restated rather than imported. Kept as the band's published size:
 * the two are coupled by name and must move together.
 */
export const SUMMARY_TEXT_PX = 14;

export const COUNTRY_LAYER_ID = 'country-pills';
export const AREA_LAYER_ID = 'area-pills';

/**
 * The parts that are identical in both bands, which is now **all** of them but the icon.
 *
 * Written once because "an area marker and a country marker are the same object one zoom apart" is
 * a claim the code should make rather than a comment repeated twice — and since 2026-09-02 it is
 * literally true: both bands draw one bitmap per marker and neither carries a `text-field`.
 */
function pillLayout(iconImage: unknown): Record<string, unknown> {
  return {
    // **The whole pill is one bitmap** — flag, name and count drawn into it by
    // `country-flag-image.ts` — so there is no `text-field`, no `icon-text-fit` and no
    // `text-offset` anywhere in either band.
    //
    // Two independent reasons, one per band. MapLibre paints a symbol layer's icons in one pass
    // and its glyphs in another, so while a label was live text a *lower* pill's name floated
    // above an *upper* pill's background and two markers sharing an anchor smeared together
    // instead of stacking. And a `text-field` cannot put a Latin count on the same side of a
    // Hebrew name as it puts it on a Latin one: the field shapes as one bidi paragraph, whose
    // direction comes from its first strong character, so `תל אביב-יפו  33` placed its digits at
    // the paragraph's end — on the left — while `London  18` placed them on the right. Neither
    // `U+2068`/`U+2069` nor a leading `U+200E` moves them, measured on the running map on
    // 2026-09-02: the shaping goes through `@mapbox/mapbox-gl-rtl-text@0.4.0` in MapLibre's
    // worker, which resolves direction from the label's own script and ignores the controls
    // around it. `drawPillText` draws the name and the count as two runs at coordinates we choose,
    // which is the only place that question can be answered.
    'icon-image': iconImage,
    'icon-anchor': 'center',
    // **Never dropped, for anything.** A country that vanishes at world zoom is a country's worth
    // of saved places the user cannot see, and since 2026-09-02 the same is true of an area — see
    // `areaLayerLayout` and `area-band-layout.ts`.
    //
    // `allow-overlap` alone is what carries that guarantee, and `ignore-placement` is **not** part
    // of it. Read in the installed 6.4.1 rather than assumed
    // (`maplibre-gl/dist/maplibre-gl-dev.mjs`): `placeCollisionBox` at :6976 skips the hit test
    // entirely when `overlapMode === 'always'`, so an allow-overlap symbol is `placeable` whatever
    // else is on screen; `insertCollisionBox` at :7131-7132 then files its box in `ignoredGrid`
    // instead of `grid` **iff `ignore-placement` is true**, and `ignoredGrid` is only ever read by
    // `queryRenderedSymbols` (:7111), never by `hitTest` during placement.
    //
    // So `ignore-placement: true` bought these layers nothing and cost every *other* label — the
    // basemap's own city names included — the ability to see our pill and step aside from it.
    'icon-allow-overlap': true,
    'icon-ignore-placement': false,
    // Where two markers overlap, the one holding more places is drawn on top. `symbol_bucket.ts`
    // sorts **ascending** and buffers in that order, so a *higher* key is drawn later and therefore
    // above — the count goes in as-is. (This is the opposite of what reads naturally, which is why
    // it is written down: an inverted key here would bury the biggest country under the smallest.)
    // The count is still the only thing that says how much is in a country; nothing scales the pill
    // (§6).
    'symbol-sort-key': ['get', 'count'],
  };
}

/**
 * **Whether the country band can afford to print country names in a container this wide.**
 *
 * The same test the camera applies to the same pill, deliberately: `affordableMarkerAllowance`
 * refuses to pad a `fitBounds` for a marker costing more than `MAX_MARKER_ALLOWANCE_SHARE` of an
 * axis, and this refuses to *draw* one. So the two flip together — **when the camera stops paying
 * for the pill, the pill stops charging** — and a pill can never be both unpadded and too wide to
 * survive the padding that is left. Before `fa96c1a` the camera paid whatever was asked and the map
 * opened on a globe; after it the camera paid nothing and the pill hung off both edges. This is the
 * third state, and it is the one where the numbers agree.
 *
 * Measured over the **capped** pills only, which are the ones this can shrink. The unflagged
 * bucket's width is not this predicate's business: nothing here can make it narrower, so letting it
 * force every flagged pill to drop its name would spend the names and buy nothing.
 */
export function countryPillsAffordLabels(
  labels: readonly SummaryPillLabel[],
  containerWidth: number,
): boolean {
  const capped = labels.filter((label) => label.capped);
  if (capped.length === 0) return true;
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return true;
  const widest = 2 * summaryPillFitAllowance(capped).x;
  return widest <= containerWidth * MAX_MARKER_ALLOWANCE_SHARE;
}

/**
 * The country band: `z < COUNTRY_BAND_MAX`.
 *
 * One symbol layer, not two, and that is the decision worth stating. Separating the count into its
 * own layer would let MapLibre place the two independently, and a count that drifts off its own
 * pill is worse than no count. One symbol carrying the whole marker cannot come apart.
 *
 * The country's **name** is drawn beside its flag because a flag on its own asks the reader to
 * recognise one of 250 — and where the platform ships no flag glyph the cap draws a two-letter
 * code, which asks something harder. `labelled: false` is the phone's pill: flag and count alone
 * (`countryPillsAffordLabels`).
 *
 * The countryless bucket sits at the mean of places we could not name a country for, which are
 * inside the countries you already have — measured 2026-09-02, `Other  1` and `Israel  35` are
 * 1.5 px apart in x and 7.2 px in y, and they do not separate at any zoom this band draws. One
 * icon per pill occludes as one opaque card, which is what the owner asked for.
 */
export function countryLayerLayout(labelled = true): Record<string, unknown> {
  return pillLayout(labelled ? ['get', 'icon'] : ['get', 'iconShort']);
}

/**
 * The area band: `AREA_BAND_MIN ≤ z < AREA_BAND_MAX`.
 *
 * **A symbol layer over a bitmap, not a `circle` layer**, and that is a correction made against a
 * running map rather than a preference. A circle was the obvious choice — there is no flag to draw
 * at this zoom, so nothing needs a canvas — and it was wrong three times over:
 *
 *  1. **It was invisible.** `--card` is `#fff` and `--border` is `#e7e3dc`, against a basemap whose
 *     land we tint to warm near-white paper. A white disc with a near-white hairline on near-white
 *     paper is not a quiet marker, it is no marker: measured on the live map at z7.9 with London's
 *     disc rendering and `queryRenderedFeatures` returning it, and nothing on screen. What makes
 *     the marker read is the drop shadow baked into its bitmap, and a `circle` layer has no shadow
 *     to give.
 *  2. **It answered taps while invisible.** A symbol layer is hit-tested through the collision
 *     index, which placement fills only inside the layer's zoom band; a circle layer is hit-tested
 *     through the feature index, which carries no zoom check at all — and the bucket is built for
 *     the tile one integer zoom *below* a fractional `minzoom`. So the circle was tappable at
 *     roughly `[4.0, 4.5)` and `[8.5, 9.0)` while drawing nothing, which reads as the map moving on
 *     its own. Verified against the installed 6.4.1 in `docs/evidence/map-zoom-bands-2026-08-29.md`.
 *  3. **Its tap target was 32 px**, under §6's 44 px floor, because the hit test is the radius plus
 *     the stroke and nothing else. The pill is 50 px tall, and `collision_feature.ts:76-81` expands
 *     the icon's box back out to the whole image, so that is the target.
 *
 * **One layer, not two, and now one bitmap.** The area's name used to be its own symbol layer,
 * drawn under the disc, where it landed on the basemap's own label for the same city; then it was
 * a `text-field` inside a stretchable pill. It is baked into the pill's image from 2026-09-02,
 * because that is the only way a Hebrew city's count sits where a Latin one's does — see
 * `pillLayout` and `country-flag-image.ts`'s `drawPillText`. `summary-features.ts`'s `areaPillSpec`
 * builds the spec and `summary-marker-layer.tsx` resolves the id into each feature's `icon`, from
 * the **laid-out** count rather than the area's own.
 *
 * **Neither band collides any more, and for the area band that is a reversal.** It ran with
 * MapLibre's placement on from 2026-08-30, because neighbouring cities are a few pixels apart
 * across this whole band — Ra'anana and Herzliya are 4.9 px apart at z7 under a pill ~125 px wide
 * — and overlap-always drew them as one unreadable stack. The comment here said the loser was
 * "hidden until zooming in makes room, which it always does, because z8.5 ends the band". Measured
 * on 2026-09-02 against the owner's own library: it does not. Tel Aviv and Herzliya first have
 * room at z8.4, inside the window `settleZoom` keeps a camera out of, so seven of twelve areas
 * were drawn at **no** zoom in the band and 18 saved places were neither visible nor counted.
 * `area-band-layout.ts` answers it instead, by absorbing an area that does not fit into the
 * neighbour that displaced it — so the pills handed to this layer do not overlap by construction
 * and there is nothing left for the collision index to drop.
 */
export function areaLayerLayout(): Record<string, unknown> {
  return pillLayout(['get', 'icon']);
}

/**
 * Both bands' paint, and it is the same in both.
 *
 * **No halo.** The label sits on its own opaque surface now, and a halo there would only smudge it
 * — the halo existed because the text was on the basemap, which is the defect the pill removes.
 */
export function summaryLayerPaint(tokens: DiscTokens): Record<string, unknown> {
  return { 'text-color': tokens.ink };
}

/**
 * The zoom range each layer is drawn in.
 *
 * A layer draws when `minzoom <= z < maxzoom`, so the country band's ceiling and the area band's
 * floor are deliberately the *same number* — that is what makes the three bands exhaustive with no
 * zoom at which two draw and none at which none does. Returned as objects rather than written into
 * each layer definition so `zoom-bands.ts` stays the only place the thresholds exist.
 */
export const COUNTRY_BAND_ZOOM = { maxzoom: COUNTRY_BAND_MAX } as const;
export const AREA_BAND_ZOOM = { minzoom: AREA_BAND_MIN, maxzoom: AREA_BAND_MAX } as const;

/**
 * Which of `area-band-layout.ts`'s pre-computed layouts a layer draws.
 *
 * A **static** filter on a feature property, not a `['zoom']` comparison: the zoom stays where §2.1
 * put it, in `minzoom`/`maxzoom`, where MapLibre owns the swap and no React state changes on a
 * pinch. The area band is now four layers over one source instead of one, which is the same
 * mechanism the three bands already use, one level down.
 */
export function areaStepFilter(step: number): unknown[] {
  return ['==', ['get', 'step'], step];
}

/** The marker's tap target, in CSS pixels — the whole pill, height included. §6 floors it at 44. */
export const SUMMARY_TAP_TARGET_PX = SUMMARY_PILL.height + 2 * SUMMARY_PILL.shadowPad;
