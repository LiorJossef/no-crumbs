import { describe, expect, it } from 'vitest';

/**
 * What the bottom nav bar costs `/collections/[id]`'s camera. Answer: nothing, and this is the
 * arithmetic that has to keep being true for that answer to hold.
 *
 * The bar is `fixed` chrome `BOTTOM_NAV_HEIGHT_PX` tall (plus the safe-area inset it sits on) at
 * the bottom of the viewport. This route's sheet **rests** at `RESTING_SHEET_FRACTION` of the
 * container rather than at the 128 px peek stop `/map` uses, and `mapOcclusionInsets` is already
 * told that (`collection-client.tsx` passes `restingSheetFraction`). So the bar adds no new
 * occlusion for exactly as long as it is shorter than the band the camera already concedes to the
 * sheet — and if either number moves, this is where it fails rather than on a phone.
 *
 * There is no jsdom in this repo (`vitest.config.ts` sets `environment: 'node'`), so nothing here
 * renders. It does not need to: the claim is geometric, and `query-rect.ts` exists precisely so
 * the geometry can be checked without a canvas.
 */

const { BOTTOM_NAV_HEIGHT_PX } = await import('@/components/nav/bottom-nav');
const { RESTING_SHEET_FRACTION } = await import('@/app/collections/[id]/sheet-geometry');
const { MIN_FIT_BAND_PX, clampFitPadding, mapOcclusionInsets } = await import(
  '@/components/map/query-rect'
);

/** The four `L2-COLL-CAM-2` established, as `[width, height]`. */
const VIEWPORTS: ReadonlyArray<readonly [number, number]> = [
  [375, 812],
  [812, 375],
  [640, 360],
  [568, 320],
];

/** `map-surface.mapcn.tsx`'s cosmetic breathing room, mirrored here for the same reason
 *  `query-rect.ts` mirrors `PEEK_PX`: that module is unreachable from a test. */
const FIT_BOUNDS_PADDING = 48;

/** `fitBoundsPadding` for this route: `restingSheetFraction` = 0.55, `floatingTopChromePx` = 0. */
function collectionFitPadding(width: number, height: number) {
  const occlusion = mapOcclusionInsets(width, RESTING_SHEET_FRACTION * height);
  return clampFitPadding(
    {
      top: FIT_BOUNDS_PADDING + occlusion.top,
      bottom: FIT_BOUNDS_PADDING + occlusion.bottom,
      left: FIT_BOUNDS_PADDING + occlusion.left,
      right: FIT_BOUNDS_PADDING + occlusion.right,
    },
    width,
    height,
  );
}

describe('the bottom nav bar over /collections/[id]', () => {
  it.each(VIEWPORTS)(
    'sits inside the occlusion the camera already concedes at %ix%i',
    (width, height) => {
      // `safeAreaInsetBottomPx()` is 0 under `environment: 'node'` (no `document`), which is the
      // honest comparison anyway: the inset is added to *both* sides of this inequality by
      // `mapOcclusionInsets` and by the bar's own `calc()`, so it cancels.
      const conceded = mapOcclusionInsets(width, RESTING_SHEET_FRACTION * height).bottom;
      expect(conceded).toBeGreaterThanOrEqual(BOTTOM_NAV_HEIGHT_PX);
    },
  );

  it.each(VIEWPORTS)(
    'never makes a pin the camera framed land under the bar at %ix%i',
    (width, height) => {
      // The strong form: the bar can only clip a pin if the *clamped* bottom padding — what the
      // camera actually spends after `clampFitPadding` has had its say — is smaller than the bar.
      // `L2-COLL-CAM-2` is the open defect where that padding comes out smaller than the *sheet*;
      // this asserts the weaker, bar-shaped bound, which is the one this task is answerable for.
      expect(collectionFitPadding(width, height).bottom).toBeGreaterThanOrEqual(
        BOTTOM_NAV_HEIGHT_PX,
      );
    },
  );

  it('the bar is the slacker of the two constraints, so it cannot be the binding one', () => {
    // Whenever the sheet's own band is the larger number, clearing the sheet implies clearing the
    // bar. That is what makes "the bar changes nothing about `L2-COLL-CAM-2`" a statement about
    // arithmetic rather than about the four viewports that happen to be tested above.
    const breakEvenHeight = BOTTOM_NAV_HEIGHT_PX / RESTING_SHEET_FRACTION;
    expect(breakEvenHeight).toBeLessThan(320);
    for (const [, height] of VIEWPORTS) expect(height).toBeGreaterThan(breakEvenHeight);
  });

  it('does not enter the fit-padding clamp on any of the four viewports', () => {
    // If the bar had been added to the padding box it could have pushed a short container into the
    // clamp, which is the mechanism behind `L2-COLL-CAM-2`. It is not added, and this records that
    // the box still fits unscaled — so the clamp's scaling path is not reached and the bar cannot
    // have made that defect worse.
    for (const [width, height] of VIEWPORTS) {
      const padding = collectionFitPadding(width, height);
      const unclamped = FIT_BOUNDS_PADDING + RESTING_SHEET_FRACTION * height;
      expect(padding.bottom).toBeCloseTo(unclamped, 6);
      expect(padding.top).toBeCloseTo(FIT_BOUNDS_PADDING, 6);
      expect(height - padding.top - padding.bottom).toBeGreaterThanOrEqual(MIN_FIT_BAND_PX);
    }
  });
});
