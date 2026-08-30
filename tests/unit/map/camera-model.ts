/**
 * **Where the camera comes to rest, as arithmetic** — the smallest thing that can answer "is a pin
 * on screen, and is it above the sheet?" without a WebGL context.
 *
 * ## Why this is modelled rather than imported
 *
 * The two functions that decide it — `fitBoundsPadding` and the `fitTo` /
 * `cameraForBounds(target, { padding, maxZoom })` pair — live in
 * `src/components/map/map-surface.mapcn.tsx`, which transitively imports `server-only` and cannot
 * be imported from a unit test at all (that is why `query-rect.ts` exists in the first place).
 * Neither is exported, and the zoom the camera settles at is MapLibre's answer, not ours.
 *
 * So this file mirrors them, and the mirroring is bounded on both sides:
 *
 *  - **The padding is not re-derived.** `mapOcclusionInsets` and `clampFitPadding` are the real
 *    exported functions; only the three private numeric constants are copied, and
 *    `camera-library-shapes.test.ts` asserts the source still holds those literals, so a change to
 *    either side fails a test rather than drifting.
 *  - **The fit is Web Mercator at bearing 0 and pitch 0**, which is what this app's camera is
 *    (`bearing` never leaves 0 — see `map-surface.mapcn.tsx`'s controls comment). Under those
 *    conditions MapLibre's `cameraForBoxAndBearing` reduces to exactly the expressions below:
 *    `zoom = min(maxZoom, log2(min(availW/dx, availH/dy)))`, and the box's midpoint lands at the
 *    viewport centre shifted by half the padding asymmetry.
 *
 * **What this is therefore evidence of, and what it is not.** It is evidence about the *rule* — the
 * geometry the product has committed to. It is not evidence that a browser rendered anything; that
 * takes a device at 390×844, and it belongs with whoever ships the fix.
 */

import { clampFitPadding, mapOcclusionInsets } from '@/components/map/query-rect';
import type { GeoBounds, GeoPoint } from '@/domain/places/clusters';

/* ---------------------------------------------------------------------------
 * Mirrored from `map-surface.mapcn.tsx`. Asserted against its source in the test.
 * ------------------------------------------------------------------------ */

/** `FIT_BOUNDS_PADDING` — cosmetic breathing room on all four sides. */
export const FIT_BOUNDS_PADDING = 48;
/** `FIT_BOUNDS_MAX_ZOOM` — the ceiling that stops a one-place box zooming to the rooftops. */
export const FIT_BOUNDS_MAX_ZOOM = 15;
/** `FLOATING_TOP_CHROME_PX` — the account chip band at `lg+`. */
export const FLOATING_TOP_CHROME_PX = 56;
/** `FLOATING_TOP_CHROME_MOBILE_PX` — chip plus the post-import strip, below `lg`. */
export const FLOATING_TOP_CHROME_MOBILE_PX = 100;
/** `LG_BREAKPOINT_PX`, re-stated only so this file reads without a second import. */
const LG = 1024;

/**
 * `SHEET_HALF_FRACTION` — the stop the sheet rises to when a place is selected.
 *
 * **Mirrored, and it should not have to be.** `src/components/sheet/place-sheet.tsx` exports it,
 * with a header saying it is exported *because the camera needs it* — but that module transitively
 * imports `server-only` (through `saved-place-edits` / `add-to-collection`), so importing it from a
 * unit test fails at load with *"This module cannot be imported from a Client Component module"*.
 * Until the constant lives somewhere importable, the copy is checked against the source text in
 * `camera-library-shapes.test.ts`.
 */
export const SHEET_HALF_FRACTION = 0.55;

/** The two breakpoints `current-state.md` §9.3 names. The map fills the viewport on both, so the
 *  container and the viewport are the same rectangle. */
export interface Viewport {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const PHONE: Viewport = { label: '390×844', width: 390, height: 844 };
export const DESKTOP: Viewport = { label: '1440×900', width: 1440, height: 900 };
export const BREAKPOINTS: readonly Viewport[] = [PHONE, DESKTOP];

export interface Insets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * `fitBoundsPadding`, mirrored. `/map` passes no `restingSheetFraction` and no
 * `floatingTopChromePx`, so the defaults below are the ones that actually run there.
 */
export function framePadding(viewport: Viewport, restingSheetFraction?: number): Insets {
  const occlusion = mapOcclusionInsets(
    viewport.width,
    restingSheetFraction === undefined ? undefined : restingSheetFraction * viewport.height,
  );
  const topChrome = viewport.width < LG ? FLOATING_TOP_CHROME_MOBILE_PX : FLOATING_TOP_CHROME_PX;
  return clampFitPadding(
    {
      top: FIT_BOUNDS_PADDING + topChrome + occlusion.top,
      bottom: FIT_BOUNDS_PADDING + occlusion.bottom,
      left: FIT_BOUNDS_PADDING + occlusion.left,
      right: FIT_BOUNDS_PADDING + occlusion.right,
    },
    viewport.width,
    viewport.height,
  );
}

const TILE_PX = 512;

/** Web Mercator, in pixels of a `TILE_PX`-wide world at zoom 0. */
function worldX(lng: number): number {
  return ((lng + 180) / 360) * TILE_PX;
}

function worldY(lat: number): number {
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return TILE_PX * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI));
}

/** A point in container pixels, origin top-left — what `map.project()` returns. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface SettledCamera {
  readonly zoom: number;
  readonly padding: Insets;
  /** Where a coordinate lands on the canvas once the camera has settled. */
  readonly screenOf: (point: GeoPoint) => ScreenPoint;
}

/**
 * Fit a box the way `fitTo` does. `null` is MapLibre's "impossible fit" — padding wider or taller
 * than the transform, which `cameraForBounds` answers with `undefined` and `fitBounds` answers by
 * not moving at all. Modelling it rather than clamping it is deliberate: a silently-not-moved
 * camera is a documented production failure in this file's real counterpart.
 */
export function fitCamera(
  bounds: GeoBounds,
  viewport: Viewport,
  options: { readonly restingSheetFraction?: number; readonly maxZoom?: number } = {},
): SettledCamera | null {
  const padding = framePadding(viewport, options.restingSheetFraction);
  const maxZoom = options.maxZoom ?? FIT_BOUNDS_MAX_ZOOM;

  const availableWidth = viewport.width - padding.left - padding.right;
  const availableHeight = viewport.height - padding.top - padding.bottom;
  if (availableWidth <= 0 || availableHeight <= 0) return null;

  const spanX = worldX(bounds.east) - worldX(bounds.west);
  const spanY = worldY(bounds.south) - worldY(bounds.north);
  const scaleX = spanX > 0 ? availableWidth / spanX : Number.POSITIVE_INFINITY;
  const scaleY = spanY > 0 ? availableHeight / spanY : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  const zoom = Number.isFinite(scale) ? Math.min(maxZoom, Math.log2(scale)) : maxZoom;

  // The box's midpoint does not land at the viewport centre: MapLibre offsets the camera by half
  // the padding asymmetry, which is what pushes a fit clear of the left panel and of the sheet.
  const anchorX = viewport.width / 2 + (padding.left - padding.right) / 2;
  const anchorY = viewport.height / 2 + (padding.top - padding.bottom) / 2;
  const worldSize = TILE_PX * 2 ** zoom;
  const perZoom = worldSize / TILE_PX;
  const midX = ((worldX(bounds.west) + worldX(bounds.east)) / 2) * perZoom;
  const midY = ((worldY(bounds.north) + worldY(bounds.south)) / 2) * perZoom;

  return {
    zoom,
    padding,
    screenOf: (point: GeoPoint) => ({
      x: anchorX + worldX(point.lng) * perZoom - midX,
      y: anchorY + worldY(point.lat) * perZoom - midY,
    }),
  };
}

/** The rectangle of canvas that is actually map — the viewport minus whatever chrome sits on it.
 *  Built from `mapOcclusionInsets`, so it is the product's own definition and not a second one. */
export interface VisibleBand {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function visibleBand(viewport: Viewport, bottomOcclusionPx?: number): VisibleBand {
  const occlusion = mapOcclusionInsets(viewport.width, bottomOcclusionPx);
  return {
    minX: occlusion.left,
    maxX: viewport.width - occlusion.right,
    minY: occlusion.top,
    maxY: viewport.height - occlusion.bottom,
  };
}

export function inBand(point: ScreenPoint, band: VisibleBand): boolean {
  return point.x >= band.minX && point.x <= band.maxX && point.y >= band.minY && point.y <= band.maxY;
}

/** The union box of a set of points — what a naive `fitBounds` over the whole library frames, and
 *  what `boundsFor` falls back to when it is handed no `initialBounds` hint. */
export function unionBounds(points: readonly GeoPoint[]): GeoBounds {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}
