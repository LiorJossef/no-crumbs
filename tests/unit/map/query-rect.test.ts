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
  LG_BREAKPOINT_PX,
  leftPanelWidthPx,
  mapOcclusionInsets,
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
