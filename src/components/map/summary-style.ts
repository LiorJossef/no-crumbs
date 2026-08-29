/**
 * The country and area bands' layer specifications (`docs/ux-library-at-scale.md` §2.2, §2.3).
 *
 * Extracted from the component for the reason `marker-style.ts` was: **the layer spec is the thing
 * the spec is about.** "Three zoom bands, swapped by MapLibre and not by React" is a claim about
 * `minzoom`/`maxzoom`, and while those numbers live inside a `useEffect` the only way to assert
 * them is to read the source file as text.
 *
 * Nothing here draws a density bubble. The circles below are one area's marker, and an area is a
 * named 50 km cluster that the list already uses as its active scope — not a count of whatever
 * happened to fall within a radius of the screen (`06` §9.1, `L1-F5-T5`).
 */

import { COUNTRY_DISC, type DiscTokens } from './country-flag-image';
import { AREA_BAND_MAX, AREA_BAND_MIN, COUNTRY_BAND_MAX } from './zoom-bands';

/** Half the disc image, in CSS pixels: the distance from the marker's anchor to the disc's edge. */
const COUNTRY_DISC_RADIUS = COUNTRY_DISC.diameter / 2;

/** The count's own size, shared by both bands so one number is not two. */
export const SUMMARY_COUNT_TEXT_PX = COUNTRY_DISC.codeFontPx;

/**
 * How far the country's count sits from the disc's centre, in ems of its own text size — which is
 * what `text-offset` speaks. The gap is measured from the disc's edge rather than from the image's,
 * because the image reserves room for a ring and a shadow that are not always drawn and the count
 * must not jump when the mint ring appears.
 */
const COUNTRY_COUNT_OFFSET_EM = (COUNTRY_DISC_RADIUS + 6) / SUMMARY_COUNT_TEXT_PX;

/** Label size and how far below the disc it sits, in ems of its own size. Measured from the disc's
 *  drawn edge, not the bitmap's, so the label does not move when the mint ring appears. */
const AREA_LABEL_TEXT_PX = 12;
const AREA_LABEL_OFFSET_EM = (COUNTRY_DISC_RADIUS + 7) / AREA_LABEL_TEXT_PX;

export const COUNTRY_LAYER_ID = 'country-discs';
export const AREA_DISC_LAYER_ID = 'area-discs';
export const AREA_LABEL_LAYER_ID = 'area-labels';

/** The plain disc, with no flag in it, that an area marker is drawn on. Its id is resolved once by
 *  the layer component, which is the only place that knows the theme. */
export const AREA_DISC_SPEC = { countryCode: null } as const;

/**
 * The country band: `z < COUNTRY_BAND_MAX`.
 *
 * One symbol layer, not two, and that is the decision worth stating. §2.2 requires the count to be
 * a text layer rather than baked into the bitmap — so it can be a number rather than a picture of
 * one — but *separating the layers* would let MapLibre place them independently, and a count that
 * drifts from its own disc is worse than no count. One symbol carrying both an `icon-image` and a
 * `text-field` is laid out as a unit, which satisfies the rule and cannot come apart.
 */
export function countryLayerLayout(textFont: readonly string[]): Record<string, unknown> {
  return {
    'icon-image': ['get', 'icon'],
    'icon-anchor': 'center',
    // The disc must never be dropped for colliding with another country's, and never with the
    // basemap's own labels either: a country that vanishes at world zoom is a country's worth of
    // saved places the user cannot see. Two countries close enough to overlap is the accepted
    // imperfection §2.3 names for areas, and it applies here for the same reason.
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    // The country's name and then its count, trailing the disc. The name is here because a flag on
    // its own asks the reader to recognise one of 250 — and where the platform ships no flag glyph
    // the disc draws a two-letter code, which asks something harder. Only the flag needs to be a
    // bitmap; a name is just text, so this costs nothing but the space it takes.
    //
    // One `text-field`, not two layers, for the same reason the count is not its own layer: two
    // symbol layers are placed independently and a name that drifts from its own disc is worse than
    // no name. The count keeps the emphasis at a slightly larger scale — a country's weight is its
    // number, and nothing here scales the disc (§6).
    'text-field': [
      'format',
      ['get', 'label'],
      {},
      '  ',
      {},
      ['to-string', ['get', 'count']],
      { 'font-scale': 1.05 },
    ],
    'text-font': [...textFont],
    'text-size': SUMMARY_COUNT_TEXT_PX,
    // Trailing the disc rather than under it: a name and a number beside a flag read as a label,
    // stacked under one they read as a caption. `left` anchors the text's own left edge at the
    // offset.
    'text-anchor': 'left',
    'text-offset': [COUNTRY_COUNT_OFFSET_EM, 0],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    // Where two countries' discs overlap, the one holding more places is drawn on top.
    // `symbol_bucket.ts` sorts **ascending** and buffers in that order, so a *higher* key is drawn
    // later and therefore above — the count goes in as-is. (This is the opposite of what reads
    // naturally, which is why it is written down: an inverted key here would bury the biggest
    // country under the smallest.) The count is still the only thing that says how much is in a
    // country; nothing here scales the disc (§6).
    'symbol-sort-key': ['get', 'count'],
  };
}

export function countryLayerPaint(tokens: DiscTokens): Record<string, unknown> {
  return {
    'text-color': tokens.ink,
    // The count is read against a basemap of unknown colour, so it carries the card surface as its
    // own background rather than trusting the land underneath it.
    'text-halo-color': tokens.surface,
    'text-halo-width': 1.8,
  };
}

/**
 * The area band: `AREA_BAND_MIN ≤ z < AREA_BAND_MAX`.
 *
 * **A symbol layer over the same disc bitmap the country band uses, not a `circle` layer**, and
 * that is a correction made against a running map rather than a preference. A circle was the
 * obvious choice — there is no flag to draw at this zoom, so nothing needs a canvas — and it was
 * wrong three times over:
 *
 *  1. **It was invisible.** `--card` is `#fff` and `--border` is `#e7e3dc`, against a basemap whose
 *     land we tint to warm near-white paper. A white disc with a near-white hairline on near-white
 *     paper is not a quiet marker, it is no marker: measured on the live map at z7.9 with London's
 *     disc rendering and `queryRenderedFeatures` returning it, and nothing on screen. What makes
 *     the country disc read is the drop shadow baked into its bitmap, and a `circle` layer has no
 *     shadow to give.
 *  2. **It answered taps while invisible.** A symbol layer is hit-tested through the collision
 *     index, which placement fills only inside the layer's zoom band; a circle layer is hit-tested
 *     through the feature index, which carries no zoom check at all — and the bucket is built for
 *     the tile one integer zoom *below* a fractional `minzoom`. So the circle was tappable at
 *     roughly `[4.0, 4.5)` and `[8.5, 9.0)` while drawing nothing, which reads as the map moving on
 *     its own. Verified against the installed 6.4.1 in `docs/evidence/map-zoom-bands-2026-08-29.md`.
 *  3. **Its tap target was 32 px**, under §6's 44 px floor, because the hit test is the radius plus
 *     the stroke and nothing else. The bitmap is 59 px.
 *
 * Reusing the disc is also what the design already claimed: an area marker and a country marker are
 * the same object one zoom apart, and now they are made of the same thing rather than of two things
 * that were meant to match.
 */
export function areaDiscLayerLayout(
  textFont: readonly string[],
  discImageId: string,
): Record<string, unknown> {
  return {
    // The `AREA_DISC_SPEC` disc: no flag in it, which is the same empty disc §2.5 needs for a
    // country we cannot name. Resolved by the caller, which is the only place that knows the theme.
    'icon-image': discImageId,
    'icon-anchor': 'center',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    // Two areas 60 km apart do briefly sit close together near z4.5–5. §2.3 accepts that rather
    // than building collision logic: an area that vanishes is worse than two that touch, and the
    // country band takes over immediately below it.
    'text-field': ['to-string', ['get', 'count']],
    'text-font': [...textFont],
    'text-size': SUMMARY_COUNT_TEXT_PX,
    'text-anchor': 'center',
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    // The busier area is drawn on top where two overlap. Ascending sort, so a higher key is later
    // and therefore above — see the country layer for why this is written down.
    'symbol-sort-key': ['get', 'count'],
  };
}

export function areaDiscLayerPaint(tokens: DiscTokens): Record<string, unknown> {
  // No halo: the count sits inside its own opaque disc, and a halo there would only smudge it.
  return { 'text-color': tokens.ink };
}

/**
 * The area's own name, beneath its disc.
 *
 * `text-field` is the label straight through, so `תל אביב-יפו` renders correctly — the RTL plugin
 * is installed at module scope in `map-surface.mapcn.tsx`, before any `Map` exists, which is the
 * only moment it can be. An area with no agreed name carries `''` here and MapLibre shapes nothing,
 * which is §2.3's "the marker shows the count alone" with no branch to get wrong.
 *
 * Its own layer because it is a second text element on one anchor and a symbol layer draws one.
 * It cannot drift from its disc: both are anchored to the same point with placement off.
 */
export function areaLabelLayerLayout(textFont: readonly string[]): Record<string, unknown> {
  return {
    'text-field': ['get', 'label'],
    'text-font': [...textFont],
    'text-size': AREA_LABEL_TEXT_PX,
    'text-anchor': 'top',
    'text-offset': [0, AREA_LABEL_OFFSET_EM],
    'text-max-width': 8,
    // Your own areas outrank the basemap's city labels, the same ruling `pinLayerLayout` makes
    // about place names: ours is the last layer, so with collision on it loses every contest.
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  };
}

export function areaLabelLayerPaint(tokens: DiscTokens): Record<string, unknown> {
  return {
    'text-color': tokens.ink,
    'text-halo-color': tokens.surface,
    'text-halo-width': 1.8,
  };
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
