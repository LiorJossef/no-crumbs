/**
 * `components/map/query-rect.ts` — the query rect (`L1-F5-T2c`, `docs/ux-map-is-the-query.md` §1).
 *
 * The point of these tests is that the geometry is the part nobody can eyeball. A camera bug is
 * visible the moment you open the map; an inset applied to the wrong edge, or a rect that comes
 * back inverted, shows up as *an empty list* — which is indistinguishable from the feature not
 * being wired up at all, and which is exactly the failure §9.3 forbids ("no empty view, ever").
 *
 * `unproject` is faked rather than mocked: a plain linear projection, so an inset of N pixels has
 * an exactly predictable answer in degrees and the assertions can be equalities instead of
 * approximations. Real Mercator is not linear, but this module never assumes it is — it only asks
 * the camera and takes the box of the four answers, which is the property being tested.
 */

import { describe, expect, it } from 'vitest';

import {
  clampFitPadding,
  LG_BREAKPOINT_PX,
  leftPanelWidthPx,
  mapOcclusionInsets,
  MIN_FIT_BAND_PX,
  queryRectFrom,
  safeAreaInsetBottomPx,
  SHEET_PEEK_PX,
} from '@/components/map/query-rect';

/** A fake camera: the canvas maps linearly onto a 10°×10° window with its north-west corner at
 *  (lat 10, lng 0), i.e. 0.01° per pixel over a 1000×1000 canvas. North is up, east is right. */
const DEG_PER_PX = 0.01;
const linearUnproject = ([x, y]: [number, number]): { lat: number; lng: number } => ({
  lng: 0 + x * DEG_PER_PX,
  lat: 10 - y * DEG_PER_PX,
});

/** The same camera rotated by `angle` about the canvas centre — what a two-finger twist does. The
 *  visible region is then a rotated square, and its four corners are no longer axis-aligned. */
const rotatedUnproject =
  (angleDegrees: number, size = 1000) =>
  ([x, y]: [number, number]): { lat: number; lng: number } => {
    const radians = (angleDegrees * Math.PI) / 180;
    const centre = size / 2;
    const dx = x - centre;
    const dy = y - centre;
    const rx = dx * Math.cos(radians) - dy * Math.sin(radians);
    const ry = dx * Math.sin(radians) + dy * Math.cos(radians);
    return linearUnproject([centre + rx, centre + ry]);
  };

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

describe('queryRectFrom — an uninset rect is the whole canvas', () => {
  it('returns the full geographic extent when nothing covers the map', () => {
    expect(queryRectFrom(linearUnproject, 1000, 1000, NO_INSETS)).toEqual({
      north: 10,
      south: 0,
      west: 0,
      east: 10,
    });
  });
});

describe('queryRectFrom — insets come off the correct edge, exactly', () => {
  it('takes a bottom inset off the south edge and nothing else (the mobile case)', () => {
    // 128 px of sheet peek = 1.28° at this fake zoom, off the *south* edge because y grows
    // downward and this module must not confuse the two.
    const rect = queryRectFrom(linearUnproject, 1000, 1000, {
      ...NO_INSETS,
      bottom: SHEET_PEEK_PX,
    });
    // `toBeCloseTo` on the moved edge only: 1000 - 128 pixels through a float multiply lands on
    // 1.2799999999999994, which is floating point, not a geometry bug. The unmoved edges are exact.
    expect(rect).not.toBeNull();
    expect(rect!.south).toBeCloseTo(1.28, 10);
    expect(rect!.north).toBe(10);
    expect(rect!.west).toBe(0);
    expect(rect!.east).toBe(10);
  });

  it('takes a left inset off the west edge and nothing else (the desktop case)', () => {
    const rect = queryRectFrom(linearUnproject, 1000, 1000, { ...NO_INSETS, left: 392 });
    expect(rect).toEqual({ north: 10, south: 0, west: 3.92, east: 10 });
  });

  it('applies all four insets independently', () => {
    const rect = queryRectFrom(linearUnproject, 1000, 1000, {
      top: 100,
      bottom: 200,
      left: 300,
      right: 400,
    });
    expect(rect).toEqual({ north: 9, south: 2, west: 3, east: 6 });
  });

  it('never returns an inverted rect', () => {
    const rect = queryRectFrom(linearUnproject, 1000, 1000, {
      top: 10,
      bottom: 20,
      left: 30,
      right: 40,
    });
    expect(rect).not.toBeNull();
    expect(rect!.north).toBeGreaterThan(rect!.south);
    expect(rect!.east).toBeGreaterThan(rect!.west);
  });
});

describe('queryRectFrom — a rotated camera', () => {
  // The documented behaviour: under rotation the four corners are not an axis-aligned box, so the
  // returned rect is the box that *contains* them — a superset of what is on screen. §1 depends on
  // the direction of that error: extra rows are forgiving, a visible pin missing from the list is
  // the failure that destroys trust. So this asserts the superset property, not a number.
  const size = 1000;
  const rotated = rotatedUnproject(30, size);

  it('contains every unprojected corner of the rotated viewport', () => {
    const rect = queryRectFrom(rotated, size, size, NO_INSETS);
    expect(rect).not.toBeNull();
    const corners: [number, number][] = [
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
    ];
    for (const corner of corners) {
      const point = rotated(corner);
      expect(point.lat).toBeLessThanOrEqual(rect!.north);
      expect(point.lat).toBeGreaterThanOrEqual(rect!.south);
      expect(point.lng).toBeLessThanOrEqual(rect!.east);
      expect(point.lng).toBeGreaterThanOrEqual(rect!.west);
    }
  });

  it('is strictly larger than the unrotated rect, i.e. a superset and not an approximation', () => {
    const rect = queryRectFrom(rotated, size, size, NO_INSETS)!;
    const unrotated = queryRectFrom(linearUnproject, size, size, NO_INSETS)!;
    expect(rect.north - rect.south).toBeGreaterThan(unrotated.north - unrotated.south);
    expect(rect.east - rect.west).toBeGreaterThan(unrotated.east - unrotated.west);
  });

  it('still respects the insets under rotation', () => {
    const withInset = queryRectFrom(rotated, size, size, { ...NO_INSETS, bottom: SHEET_PEEK_PX })!;
    const without = queryRectFrom(rotated, size, size, NO_INSETS)!;
    // The inset shrinks the rect. Which edge it shrinks depends on the rotation — that is the whole
    // reason this module unprojects corners instead of doing arithmetic on `getBounds()` — so the
    // assertion is on area, which is the claim that survives any rotation.
    const area = (r: typeof without) => (r.north - r.south) * (r.east - r.west);
    expect(area(withInset)).toBeLessThan(area(without));
  });
});

describe('queryRectFrom — the degenerate cases', () => {
  it('returns null when the sheet peek is taller than the viewport', () => {
    // A viewport shorter than the chrome that covers it has no honest answer. Returning a
    // zero-area or inverted rect here would empty the list *silently*, which is the one outcome
    // that looks identical to the feature being broken.
    expect(
      queryRectFrom(linearUnproject, 390, 100, { ...NO_INSETS, bottom: SHEET_PEEK_PX })
    ).toBeNull();
  });

  it('returns null when the insets exactly consume the canvas, not a zero-area rect', () => {
    expect(queryRectFrom(linearUnproject, 1000, 1000, { ...NO_INSETS, bottom: 1000 })).toBeNull();
    expect(queryRectFrom(linearUnproject, 1000, 1000, { ...NO_INSETS, left: 1000 })).toBeNull();
  });

  it('returns null for a canvas with no size at all', () => {
    expect(queryRectFrom(linearUnproject, 0, 0, NO_INSETS)).toBeNull();
  });

  it('survives a left inset wider than the canvas without inverting', () => {
    expect(queryRectFrom(linearUnproject, 320, 800, { ...NO_INSETS, left: 392 })).toBeNull();
  });
});

describe('mapOcclusionInsets', () => {
  it('insets the bottom and only the bottom below lg — the sheet peek', () => {
    // `safeAreaInsetBottomPx()` is 0 under Node (no `document`), asserted in its own test below, so
    // the expected value here is the bare peek height.
    expect(mapOcclusionInsets(390)).toEqual({ top: 0, bottom: SHEET_PEEK_PX, left: 0, right: 0 });
    expect(mapOcclusionInsets(LG_BREAKPOINT_PX - 1).left).toBe(0);
  });

  it('insets the left and only the left at lg+ — the list panel', () => {
    const insets = mapOcclusionInsets(1440);
    expect(insets.bottom).toBe(0);
    expect(insets.top).toBe(0);
    expect(insets.right).toBe(0);
    expect(insets.left).toBeGreaterThan(0);
  });

  it('switches at exactly the lg breakpoint, the same width the panel does', () => {
    expect(mapOcclusionInsets(LG_BREAKPOINT_PX - 1).bottom).toBe(SHEET_PEEK_PX);
    expect(mapOcclusionInsets(LG_BREAKPOINT_PX).bottom).toBe(0);
    expect(mapOcclusionInsets(LG_BREAKPOINT_PX).left).toBe(leftPanelWidthPx(LG_BREAKPOINT_PX));
  });

  it('never insets the top — the floating chrome is camera-only', () => {
    expect(mapOcclusionInsets(390).top).toBe(0);
    expect(mapOcclusionInsets(1440).top).toBe(0);
  });
});

describe('mapOcclusionInsets — a sheet that rests somewhere other than the peek stop', () => {
  // `/collections/[id]` opens its sheet at the 0.55 snap point and stays there, so ~447 px of an
  // 812 px phone is permanently covered. Framing it as 128 px put 2 of its 3 pins underneath.
  const HALF_SHEET_AT_812 = 0.55 * 812;

  it('replaces the peek height with the override, below lg', () => {
    expect(mapOcclusionInsets(375, HALF_SHEET_AT_812)).toEqual({
      top: 0,
      bottom: HALF_SHEET_AT_812,
      left: 0,
      right: 0,
    });
  });

  it('defaults to the peek height when no override is given — /map is untouched', () => {
    expect(mapOcclusionInsets(375)).toEqual(mapOcclusionInsets(375, SHEET_PEEK_PX));
    expect(mapOcclusionInsets(375).bottom).toBe(SHEET_PEEK_PX);
  });

  it('treats an explicit undefined as no override, so an optional prop can be forwarded as-is', () => {
    expect(mapOcclusionInsets(375, undefined).bottom).toBe(SHEET_PEEK_PX);
  });

  it('ignores the override at lg+, where the chrome is a left panel and there is no sheet', () => {
    const withOverride = mapOcclusionInsets(1440, HALF_SHEET_AT_812);
    expect(withOverride).toEqual(mapOcclusionInsets(1440));
    expect(withOverride.bottom).toBe(0);
    expect(withOverride.left).toBe(leftPanelWidthPx(1440));
  });

  it('overrides only the sheet, never the safe-area inset', () => {
    // `safeAreaInsetBottomPx()` is 0 in this process (no `document`), so the assertion that the
    // inset is still *added* is the one below in spirit and this one in fact: the bottom is the
    // override plus that zero, and never the override in place of the pair.
    expect(typeof document).toBe('undefined');
    expect(mapOcclusionInsets(375, 0).bottom).toBe(0);
  });
});

describe('clampFitPadding — the padding box can exceed the container, and must not', () => {
  it('leaves a padding box that fits exactly as it was', () => {
    // The real 375x812 case after the fix: top 48 + 100 chrome, bottom 48 + 446.6 of sheet. 643 of
    // 812 px, leaving a 169 px band — tight, valid, and not the clamp's business.
    const padding = { top: 148, bottom: 48 + 0.55 * 812, left: 48, right: 48 };
    expect(clampFitPadding(padding, 375, 812)).toEqual(padding);
  });

  it('scales an over-budget axis down until MIN_FIT_BAND_PX survives', () => {
    // The same sheet in landscape: 812x375, so the bottom alone is 48 + 206 against 375 px of
    // height. Unclamped this is 402 px of padding in a 375 px container.
    const padding = { top: 148, bottom: 48 + 0.55 * 375, left: 48, right: 48 };
    const clamped = clampFitPadding(padding, 812, 375);
    expect(clamped.top + clamped.bottom).toBeCloseTo(375 - MIN_FIT_BAND_PX, 6);
    expect(clamped.left).toBe(48);
    expect(clamped.right).toBe(48);
  });

  it('scales both sides of an over-budget axis by the same factor', () => {
    // Position, not just size: the surviving band has to stay between the chrome above and the
    // sheet below, or the clamp fixes the camera by sliding pins under the sheet instead.
    const padding = { top: 100, bottom: 300, left: 0, right: 0 };
    const clamped = clampFitPadding(padding, 1000, 300);
    expect(clamped.bottom / clamped.top).toBeCloseTo(3, 6);
  });

  it('never lets the surviving band reach zero, which is where MapLibre returns a NaN centre', () => {
    // `cameraForBoxAndBearing` divides by `size - padding`: zero gives a zoom of -Infinity and a
    // centre that unprojects to NaN, negative makes `fitBounds` warn and silently not move.
    for (const [w, h] of [[375, 812], [812, 375], [320, 200], [200, 120], [100, 100]] as const) {
      const clamped = clampFitPadding({ top: 148, bottom: 500, left: 48, right: 48 }, w, h);
      expect(h - clamped.top - clamped.bottom).toBeGreaterThan(0);
      expect(w - clamped.left - clamped.right).toBeGreaterThan(0);
    }
  });

  it('spends at most half an axis on the band, so a very short viewport keeps some padding', () => {
    // A 120 px axis cannot afford a 96 px band without clamping the padding to nothing, which
    // would put pins flush against — and under — the chrome. Half is the floor.
    const clamped = clampFitPadding({ top: 148, bottom: 500, left: 0, right: 0 }, 1000, 120);
    expect(clamped.top + clamped.bottom).toBeCloseTo(60, 6);
    expect(120 - clamped.top - clamped.bottom).toBeCloseTo(60, 6);
  });

  it('sits exactly on the boundary without scaling, and scales one pixel past it', () => {
    const exact = { top: 100, bottom: 812 - MIN_FIT_BAND_PX - 100, left: 0, right: 0 };
    expect(clampFitPadding(exact, 375, 812)).toEqual(exact);
    const over = { ...exact, bottom: exact.bottom + 1 };
    const clamped = clampFitPadding(over, 375, 812);
    expect(clamped.top + clamped.bottom).toBeCloseTo(812 - MIN_FIT_BAND_PX, 6);
    expect(clamped.bottom).toBeLessThan(over.bottom);
  });

  it('collapses a non-finite or negative padding to zero rather than passing NaN to the camera', () => {
    expect(clampFitPadding({ top: NaN, bottom: Infinity, left: -50, right: 48 }, 375, 812)).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 48,
    });
  });

  it('returns no padding at all for a container with no size — nothing to frame into', () => {
    expect(clampFitPadding({ top: 148, bottom: 176, left: 48, right: 48 }, 0, 0)).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });
});

describe('leftPanelWidthPx — the clamp(320px, 26vw, 392px) the panel actually renders', () => {
  it('floors at 320 on a narrow desktop window', () => {
    expect(leftPanelWidthPx(LG_BREAKPOINT_PX)).toBe(320); // 26vw = 266.24, below the floor
  });

  it('tracks 26vw in the middle of the range', () => {
    expect(leftPanelWidthPx(1440)).toBeCloseTo(374.4, 5);
  });

  it('ceils at 392 on a wide monitor', () => {
    expect(leftPanelWidthPx(2560)).toBe(392); // 26vw = 665.6, above the ceiling
  });
});

describe('safeAreaInsetBottomPx', () => {
  it('is zero with no document — SSR, and this test process', () => {
    // Guarding the assertion on the precondition rather than assuming it: if the suite ever moves
    // to a DOM environment this fails loudly instead of quietly asserting nothing.
    expect(typeof document).toBe('undefined');
    expect(safeAreaInsetBottomPx()).toBe(0);
  });
});
