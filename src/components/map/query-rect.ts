/**
 * The **query rect** — what "in the viewport" means, as pure geometry
 * (`docs/ux-map-is-the-query.md` §1, `L1-F5-T2c`).
 *
 * Extracted out of `map-surface.mapcn.tsx` so it can be tested without a canvas or a browser: that
 * file transitively imports `server-only` (through `PlaceDetail` → the saved-place server actions),
 * so nothing in it can be imported from a unit test at all. The geometry here is the part most
 * worth testing — an off-by-one edge or a silently inverted rect empties the list, and the list
 * being empty is indistinguishable from the whole feature being broken.
 *
 * Deliberately dependency-free: no React, no `maplibre-gl` (not even a type — `queryRectFrom` takes
 * the caller's `unproject` as a function), only the `LatLngBoundsHint` shape the map port already
 * speaks. Camera *policy* — how much cosmetic breathing room a `fitBounds` gets, the zoom ceiling,
 * the flight duration — stays in the surface; this module only answers where the map's chrome is
 * and what rectangle of the world is left over. `clampFitPadding` is here for the same reason the
 * rest of it is: it decides no policy, it only refuses to hand the camera a box with nothing in it,
 * and that refusal has boundaries no one can eyeball from the surface.
 */

import type { LatLngBoundsHint } from './types';

// Tailwind's default `lg` breakpoint (unmodified in this project — no `tailwind.config`/`@theme`
// override), the same one `PlaceDesktopPanel` switches on (`hidden lg:block`). Below this width
// there is no persistent left/right panel at all — the sheet (`PlaceSheet`) owns mobile instead —
// so `fitBounds` padding stays the old uniform value there.
export const LG_BREAKPOINT_PX = 1024;

// Mirrors `PlaceDesktopPanel`'s panel width (`src/components/sheet/place-desktop-panel.tsx`):
// the persistent left list panel is `clamp(320px, 26vw, 392px)`. `fitBounds`'s `padding` option
// takes plain pixels, not CSS, so there is no way to hand it a `clamp()` — this function
// recomputes the same clamp in JS against the current viewport width instead. If the panel's
// Tailwind class ever changes, this must change with it; that coupling is the price of a DOM
// overlay sharing the camera-fit budget, and is called out again in `PlaceDesktopPanel`'s own
// comment. There used to be a matching `rightPanelWidthPx` for a right-hand detail panel — that
// panel is gone (detail now lives in a pin-anchored map popover, not a second panel), so the
// padding this function returns is never widened on selection anymore.
export function leftPanelWidthPx(viewportWidth: number): number {
  return Math.min(392, Math.max(320, viewportWidth * 0.26));
}

// The sheet's peek height, mirrored from `PEEK_PX` in `src/components/sheet/place-sheet.tsx`.
// That module does not export it and this task does not own that file, so the value is duplicated
// here with the coupling named rather than reached for: if the sheet's peek stop changes, this
// must change with it, exactly as `leftPanelWidthPx` above documents its coupling to
// `PlaceDesktopPanel`. The sheet adds `env(safe-area-inset-bottom)` on top of this number in CSS,
// so the occluded strip is this plus the inset — see `safeAreaInsetBottomPx`.
export const SHEET_PEEK_PX = 128;

/**
 * `env(safe-area-inset-bottom)` in pixels, which JavaScript cannot read directly — the only way to
 * get at a CSS environment variable is to let the engine resolve it on a real element and measure
 * the result. Zero everywhere without a notch/home indicator, and zero during SSR.
 *
 * Measured on demand rather than cached, because it changes with orientation and there is no event
 * for it; the cost is one detached-then-removed element per report, and reports happen at most a
 * few times per gesture (`moveend` + 120 ms), never per frame.
 */
export function safeAreaInsetBottomPx(): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const measured = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(measured) ? measured : 0;
}

/**
 * **The one constant with two consumers** (`docs/ux-map-is-the-query.md` §1 rule 3): the chrome that
 * permanently covers the map at rest, in canvas pixels. `fitBoundsPadding` frames *around* it and
 * the query rect is inset *by* it; if those two ever disagree, a camera move lands places on screen
 * that the list does not contain, or lists places the camera pushed under the sheet.
 *
 * Below `lg`: the sheet's peek strip along the bottom (plus the safe-area inset it sits on).
 * At `lg+`: the list panel down the left edge. Nothing else, per the spec's table.
 *
 * **What is deliberately NOT here, and why.** The query rect is inset only by chrome that genuinely
 * *occludes* the map:
 *  - `FIT_BOUNDS_PADDING` (48 px) is cosmetic breathing room so a fitted pin is not flush against
 *    an edge. Nothing covers those 48 px. Insetting the query rect by them would drop places the
 *    user can plainly see out of the list, which §1 names as the error that destroys trust —
 *    whereas the opposite error (a listed place hidden behind the sheet at `half`) is the forgiving
 *    direction. So it stays camera-only.
 *  - `FLOATING_TOP_CHROME_PX` — the account chip and the post-import strip — occludes real map, but
 *    it is a floating pill over a band that is otherwise fully visible map, and the spec's table
 *    says "no other inset" in both columns. A top inset would delete visible pins from the list for
 *    the width of the whole viewport to clear a chip a few hundred pixels wide. Camera-only too:
 *    the camera has to clear it, because a pin *underneath* the chip is unclickable, which is a
 *    different problem from a pin the list forgot.
 *
 * `bottomOcclusionPx` overrides the sub-`lg` sheet height for a surface whose sheet **rests**
 * somewhere other than the peek stop: `/collections/[id]` opens at the half stop and stays there, so
 * the chrome permanently over its map is ~55% of the viewport rather than 128 px. It replaces
 * `SHEET_PEEK_PX` only — `safe-area-inset-bottom` is still added on top of it, because the sheet
 * sits on that inset whatever stop it is at — and the `lg+` branch has no sheet to override.
 */
export function mapOcclusionInsets(
  viewportWidth: number,
  bottomOcclusionPx: number = SHEET_PEEK_PX
): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  if (viewportWidth < LG_BREAKPOINT_PX) {
    return { top: 0, bottom: bottomOcclusionPx + safeAreaInsetBottomPx(), left: 0, right: 0 };
  }
  return { top: 0, bottom: 0, left: leftPanelWidthPx(viewportWidth), right: 0 };
}

/**
 * The narrowest strip of map a `fitBounds` is allowed to frame into, on either axis.
 *
 * Not a taste number. MapLibre's `cameraForBoxAndBearing` subtracts the padding from the transform's
 * size and divides the bounding box by what is left: a *negative* remainder makes `fitBounds` warn
 * and silently do nothing — the camera stays wherever it was, which this surface has already shipped
 * once as a world view at zoom 0 — and a remainder of exactly *zero* is worse, giving a scale of 0,
 * a zoom of -Infinity and a centre that unprojects to NaN. So the surviving band has to be strictly
 * positive, and 96 px is the smallest strip in which a framed pin still reads as being somewhere.
 */
export const MIN_FIT_BAND_PX = 96;

/**
 * Shrink a `fitBounds` padding box until `MIN_FIT_BAND_PX` of map survives on both axes.
 *
 * The padding is the sum of three independent things — cosmetic breathing room, the floating top
 * chrome, and a bottom sheet that may rest at over half the viewport — and nothing stops their sum
 * from exceeding the container. A phone in landscape with a half-height sheet does it.
 *
 * Both sides of an over-budget axis are scaled by the same factor rather than one being sacrificed,
 * so the surviving band keeps its position between the chrome above and the sheet below: every pin
 * loses clearance evenly instead of some of them sliding back under the sheet. The result is honest
 * degradation — visibly cramped, but framed, finite and on screen.
 */
export function clampFitPadding(
  padding: { top: number; bottom: number; left: number; right: number },
  canvasWidth: number,
  canvasHeight: number
): { top: number; bottom: number; left: number; right: number } {
  const [top, bottom] = clampPaddingAxis(padding.top, padding.bottom, canvasHeight);
  const [left, right] = clampPaddingAxis(padding.left, padding.right, canvasWidth);
  return { top, bottom, left, right };
}

/** One axis of `clampFitPadding`. Non-finite and negative inputs collapse to zero here rather than
 *  travelling on into the camera, where they become a NaN centre nothing downstream can explain. */
function clampPaddingAxis(start: number, end: number, extent: number): [number, number] {
  if (!Number.isFinite(extent) || extent <= 0) return [0, 0];
  const a = Number.isFinite(start) && start > 0 ? start : 0;
  const b = Number.isFinite(end) && end > 0 ? end : 0;
  // Never spend more than half the axis on the band itself, so a viewport shorter than 192 px still
  // gets padding rather than having all of it clamped away.
  const budget = extent - Math.min(MIN_FIT_BAND_PX, extent / 2);
  if (a + b <= budget) return [a, b];
  return [(a * budget) / (a + b), (b * budget) / (a + b)];
}

/**
 * The query rect as a `LatLngBoundsHint`, built by asking MapLibre to unproject the four corners of
 * the inset rectangle.
 *
 * **Not** `getBounds()` plus arithmetic on the returned lat/lngs. Degrees are not linear in screen
 * pixels: subtracting a "128 px worth of latitude" is wrong at every zoom, wrong near the poles
 * where Mercator stretches, and meaningless under a rotated or pitched camera, where the visible
 * region is a trapezoid rather than an axis-aligned box. Unprojecting the corners asks the camera
 * itself, so it stays correct under all three.
 *
 * Under rotation the four corners no longer form an axis-aligned box, so this returns the box that
 * *contains* them — a superset of what is on screen. That is the forgiving direction (§1): a few
 * extra rows, never a visible pin missing from the list.
 *
 * `unproject` is passed in rather than the map, so the geometry is testable without a canvas.
 *
 * Returns `null` when the insets leave no rect at all (a viewport shorter than the sheet's peek):
 * there is no honest answer, and reporting a degenerate rect would empty the list.
 */
export function queryRectFrom(
  unproject: (point: [number, number]) => { lat: number; lng: number },
  canvasWidth: number,
  canvasHeight: number,
  insets: { top: number; bottom: number; left: number; right: number }
): LatLngBoundsHint | null {
  const left = insets.left;
  const right = canvasWidth - insets.right;
  const top = insets.top;
  const bottom = canvasHeight - insets.bottom;
  if (right <= left || bottom <= top) return null;

  const corners: [number, number][] = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
  const points = corners.map(unproject);
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}
