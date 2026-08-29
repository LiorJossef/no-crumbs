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

import { SUMMARY_PILL, type DiscTokens } from './country-flag-image';
import { AREA_BAND_MAX, AREA_BAND_MIN, COUNTRY_BAND_MAX } from './zoom-bands';

/** The label's size, shared by both bands so one number is not two. */
export const SUMMARY_TEXT_PX = 14;

/**
 * Between the label and the count.
 *
 * Two spaces rather than a middot or a bullet: the basemap's glyph endpoint is asked for whatever
 * code points we send, and a separator that the CARTO stack has no glyph for renders as nothing at
 * all — silently, and only in production. A space is in every stack there is.
 *
 * An area with no agreed name carries `''`, so this leads the string; `tagged_string.ts`'s
 * `trim()` strips it before shaping, which is §2.3's "the marker shows the count alone" with no
 * branch to get wrong.
 */
const LABEL_COUNT_GAP = '  ';

export const COUNTRY_LAYER_ID = 'country-pills';
export const AREA_LAYER_ID = 'area-pills';

/**
 * The capless pill: no flag in it. It is the area band's marker **and** the country band's marker
 * for the countryless bucket (§2.5), which is not a coincidence — they are the same object, and
 * `country-flag-image.ts` builds one image for both.
 *
 * Its id is resolved once by the layer component, which is the only place that knows the theme.
 * The name is kept because `map-surface.mapcn.tsx` imports it.
 */
export const AREA_DISC_SPEC = { countryCode: null } as const;

/**
 * Never wrap.
 *
 * `icon-text-fit` fits the pill to the text's **width**, so a second line would overflow the pill
 * vertically rather than growing it. 24 ems at 14 px is 336 CSS px — wider than a phone — so no
 * country name and no area label reaches it. `text-max-width: 0` is not the way to say this:
 * `tagged_string.ts`'s `determineAverageLineWidth` divides by it and breaks after every glyph.
 */
const NO_WRAP_EMS = 24;

/**
 * The parts that are identical in both bands, which is most of them. Written once because "an area
 * marker and a country marker are the same object one zoom apart" is a claim the code should make
 * rather than a comment repeated twice.
 */
function pillLayout(textFont: readonly string[]): Record<string, unknown> {
  return {
    // Fits the pill's stretchable middle to the label. With this set MapLibre ignores `icon-anchor`
    // outright (`maplibre-gl/src/symbol/shaping.ts:635-637`) and centres the icon on the text, so
    // there is no anchor here to be quietly disregarded.
    'icon-text-fit': 'width',
    // A marker must never be dropped for colliding with another, and never with the basemap's own
    // labels either: a country that vanishes at world zoom is a country's worth of saved places the
    // user cannot see. Two markers close enough to overlap is the accepted imperfection §2.3 names.
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'text-font': [...textFont],
    'text-size': SUMMARY_TEXT_PX,
    'text-anchor': 'center',
    'text-max-width': NO_WRAP_EMS,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
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
 * The label and the count, as **one text section**.
 *
 * `['concat', …]`, deliberately, and not `['format', …]` with a `font-scale` on the count. A
 * `format` with more than one section leaves `logicalInput.sections.length > 1`, and
 * `shaping.ts:135-146` then only applies bidi when the loaded RTL plugin exports
 * `processStyledBidirectionalText`; without it the text is shaped with **no bidi at all**. The area
 * band's labels are the Hebrew ones, so a multi-section field is exactly where that would bite.
 * One section takes `processBidirectionalText`, which is the path that is actually installed.
 */
function labelAndCount(): unknown[] {
  return ['concat', ['get', 'label'], LABEL_COUNT_GAP, ['to-string', ['get', 'count']]];
}

/**
 * The country band: `z < COUNTRY_BAND_MAX`.
 *
 * One symbol layer, not two, and that is the decision worth stating. §2.2 requires the count to be
 * a text layer rather than baked into the bitmap — so it can be a number rather than a picture of
 * one — but *separating the layers* would let MapLibre place them independently, and a count that
 * drifts from its own pill is worse than no count. One symbol carrying both an `icon-image` and a
 * `text-field` is laid out as a unit, which satisfies the rule and cannot come apart.
 *
 * The country's **name** is in the field beside the count because a flag on its own asks the reader
 * to recognise one of 250 — and where the platform ships no flag glyph the cap draws a two-letter
 * code, which asks something harder.
 */
export function countryLayerLayout(textFont: readonly string[]): Record<string, unknown> {
  return {
    ...pillLayout(textFont),
    // Per-feature, because the flag, the theme and the mint ring are all baked into the image.
    'icon-image': ['get', 'icon'],
    'text-field': labelAndCount(),
  };
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
 *     the fitted icon's box back out to the whole image, so that is the target.
 *
 * **One layer, not two.** The area's name used to be its own symbol layer, drawn under the disc,
 * which put it straight on top of the basemap's label for the same city — `London` under a disc
 * sitting on `London`. Inside the pill it is the same text field the country band uses, and the two
 * bands are finally the same object rather than two things that were meant to match.
 */
export function areaLayerLayout(
  textFont: readonly string[],
  pillImageId: string
): Record<string, unknown> {
  return {
    ...pillLayout(textFont),
    // Constant: every area draws the capless pill. Resolved by the caller, which is the only place
    // that knows the theme.
    'icon-image': pillImageId,
    'text-field': labelAndCount(),
  };
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

/** The marker's tap target, in CSS pixels — the whole pill, height included. §6 floors it at 44. */
export const SUMMARY_TAP_TARGET_PX = SUMMARY_PILL.height + 2 * SUMMARY_PILL.shadowPad;
