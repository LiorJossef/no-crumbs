/**
 * The **query rect** — what "in the viewport" means, as pure geometry
 * (`docs/archive/ux-map-is-the-query.md` §1, `L1-F5-T2c`).
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

// The sheet's peek height, mirrored from `PEEK_PX` in `src/components/shell/sheet-geometry.ts`.
// That module does not export it and this task does not own that file, so the value is duplicated
// here with the coupling named rather than reached for: if the sheet's peek stop changes, this
// must change with it, exactly as `leftPanelWidthPx` above documents its coupling to
// `PlaceDesktopPanel`. The sheet adds `env(safe-area-inset-bottom)` on top of this number in CSS,
// so the occluded strip is this plus the inset — see `safeAreaInsetBottomPx`.
// **128 until 2026-09-02.** It grew to 156 because the peek row's 44 px button was sitting 14 px
// behind the floating `BottomNav`; the band, not the row, was what had to give. That is a camera
// change as much as a spacing one — this is the bottom of the query rect, so 28 px more of the
// container is now counted as covered and the pins in it drop out of the visible list. Which is
// correct: they are behind the sheet. The upper bound on this number comes from the other
// consumer: `clampFitPadding` must still leave a bottom padding deeper than this strip on a
// 320 px-tall landscape phone, which caps it at 158.
export const SHEET_PEEK_PX = 156;

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
 * **The one constant with two consumers** (`docs/archive/ux-map-is-the-query.md` §1 rule 3): the chrome that
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
 * the chrome permanently over its map is ~55% of the viewport rather than 156 px. It replaces
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
 * Why a floor at all: MapLibre's `cameraForBoxAndBearing` subtracts the padding from the transform's
 * size and divides the bounding box by what is left. A *negative* remainder makes `fitBounds` warn
 * and silently do nothing — the camera stays wherever it was, which this surface has already shipped
 * once as a world view at zoom 0 — and a remainder of exactly *zero* is worse, giving a scale of 0,
 * a zoom of -Infinity and a centre that unprojects to NaN.
 *
 * Why *this* floor: a bigger one makes the clamp eat the occlusion it exists to respect. The clamp
 * scales the whole padding box down, so a floor that engages before the box is genuinely impossible
 * starts shaving pixels off the sheet's own allowance — at 812×375 (a phone in landscape with a
 * half-resting sheet) a 96 px floor leaves 176 px of bottom padding against 206 px of sheet and puts
 * the lowest pin back underneath it, which is the bug this whole path exists to fix. 48 is the
 * largest floor that never does that, and it is not a coincidence that it equals the cosmetic
 * breathing room a fit already reserves: a band narrower than that is not a frame either way.
 */
export const MIN_FIT_BAND_PX = 48;

/**
 * The largest share of one axis a **marker allowance** may spend on itself.
 *
 * The allowance is half a marker's width (or height), reserved on *both* sides of the fitted box,
 * so a marker costs `2 × allowance` of the axis. That is cheap for a 206 px country pill on a
 * 1440 px desktop — 14% — and ruinous for the same pill on a 390 px phone, where it is 53%.
 *
 * Measured on the owner's 58-place library at 390×844: the home fit is z2.556 without the
 * allowance and z0.806 with it — the whole Earth, four country pills stacked on each other.
 *
 * So an allowance is **all or nothing per axis**. A partial one is the option that buys nothing:
 * the marker is clipped either way and the fit has paid for it. Where the axis cannot afford the
 * marker the honest frame is the box, and the pill gives way — the rule `LABEL_FIT_ALLOWANCE`
 * already applies to a pin's label, stated for the axis instead of the band.
 *
 * A third is a judgement: loose enough that no desktop fit changes (206 px of pill against a
 * 480 px budget at 1440 wide), tight enough that a phone never spends more.
 */
export const MAX_MARKER_ALLOWANCE_SHARE = 1 / 3;

/**
 * The part of a marker allowance the container can actually afford, per axis.
 *
 * `0` on an axis whose marker does not fit the share above — see `MAX_MARKER_ALLOWANCE_SHARE` for
 * why dropping it entirely beats scaling it down. Non-finite and negative inputs collapse to zero
 * here rather than travelling on into the camera.
 */
export function affordableMarkerAllowance(
  allowance: { readonly x: number; readonly y: number },
  containerWidth: number,
  containerHeight: number
): { readonly x: number; readonly y: number } {
  const afford = (value: number, extent: number): number => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (!Number.isFinite(extent) || extent <= 0) return 0;
    return 2 * value <= extent * MAX_MARKER_ALLOWANCE_SHARE ? value : 0;
  };
  return {
    x: afford(allowance.x, containerWidth),
    y: afford(allowance.y, containerHeight),
  };
}

/**
 * Shrink a `fitBounds` padding box until `MIN_FIT_BAND_PX` of map survives on both axes.
 *
 * The padding is the sum of three independent things — cosmetic breathing room, the floating top
 * chrome, and a bottom sheet that may rest at over half the viewport — and nothing stops their sum
 * from exceeding the container. A phone in landscape with a half-height sheet does it.
 *
 * **What this guarantees is a strictly positive band, and nothing more.** Both sides of an
 * over-budget axis are scaled by the same factor rather than one being sacrificed, which preserves
 * the *ratio* between them and so keeps the surviving band roughly where it was between the chrome
 * above and the sheet below. It does not preserve either side's absolute clearance and it cannot:
 * once the scale factor drops below `sheet / (MIN_FIT_BAND_PX + sheet)` the scaled bottom padding is
 * smaller than the sheet it was supposed to clear, and the lowest pin slides back underneath it.
 * That is measured, not hypothetical — at 640×360 with a 0.55 resting sheet and `/map`'s 100 px
 * top-chrome allowance the clamp returns 194.8 px of bottom padding against a 198.0 px sheet.
 *
 * So **clearing the sheet is the caller's job, done by passing padding that fits** — never the
 * clamp's. The clamp is the last resort that stops `fitBounds` being handed a box with nothing in
 * it: a negative remainder makes it warn and silently not move, a zero remainder gives a NaN
 * centre. A surface that needs its pins above its own sheet must not spend padding it has not got,
 * which is why the floating-chrome allowance is a prop (`MapSurfaceProps.floatingTopChromePx`)
 * rather than a constant — `/collections/[id]` has no floating top chrome, so it declares zero
 * instead of paying `/map`'s 100 px and pushing the clamp down into its own sheet.
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
  // Never spend more than half the axis on the band itself. The rule engages below 2 ×
  // MIN_FIT_BAND_PX — 96 px of extent — where reserving the whole floor would be most of the
  // container and would clamp the padding away to nothing, leaving pins flush against (and under)
  // the chrome. Below that the floor becomes `extent / 2` instead.
  const budget = extent - Math.min(MIN_FIT_BAND_PX, extent / 2);
  if (a + b <= budget) return [a, b];
  return [(a * budget) / (a + b), (b * budget) / (a + b)];
}

/**
 * The query rect as a `LatLngBoundsHint`, built by asking MapLibre to unproject the four corners of
 * the inset rectangle.
 *
 * **Not** `getBounds()` plus arithmetic on the returned lat/lngs. Degrees are not linear in screen
 * pixels: subtracting a "156 px worth of latitude" is wrong at every zoom, wrong near the poles
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
