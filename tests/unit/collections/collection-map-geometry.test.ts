import { describe, expect, it } from 'vitest';

/**
 * What the bottom nav bar costs each of the shell's two scopes. Answer: nothing, and this is the
 * arithmetic that has to keep being true for that answer to hold.
 *
 * **This test was about a bar that was not on screen.** `/collections/[id]` rendered no `BottomNav`
 * at all until `NAV2` mounted the shell's — which is what makes `ux-collections-as-scope.md` §2.3's
 * exits ("the Map tab, on screen at every stop") real rather than aspirational. So the claim below
 * is now load-bearing where before it was green and about nothing, and it covers **both** scopes:
 * `/map`, whose sheet rests on the 128 px peek strip, and a collection, whose sheet rests at
 * `HALF_FRACTION`.
 *
 * The bar is `fixed` chrome `BOTTOM_NAV_HEIGHT_PX` tall (plus the safe-area inset it sits on) at
 * the bottom of the viewport. `mapOcclusionInsets` is already told what each scope's sheet covers
 * (`MapShell` derives it from `restingStop`). So the bar adds no new occlusion for exactly as long
 * as it is shorter than the band the camera already concedes to the sheet — and if either number
 * moves, this is where it fails rather than on a phone.
 *
 * There is no jsdom in this repo (`vitest.config.ts` sets `environment: 'node'`), so nothing here
 * renders. It does not need to: the claim is geometric, and `query-rect.ts` exists precisely so
 * the geometry can be checked without a canvas.
 */

const { BOTTOM_NAV_HEIGHT_PX } = await import('@/components/nav/bottom-nav-metrics');
const { HALF_FRACTION: RESTING_SHEET_FRACTION, PEEK_PX } =
  await import('@/components/shell/sheet-geometry');
const { MIN_FIT_BAND_PX, clampFitPadding, mapOcclusionInsets } =
  await import('@/components/map/query-rect');

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

describe('the bottom nav bar over a collection scope', () => {
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

/**
 * The same question for `/map`, which the shell now draws the identical bar over and whose sheet
 * rests on the peek strip rather than at `half`. This is the *tighter* of the two constraints —
 * 128 px against 68 px, where a collection concedes 176 px at the shortest viewport tested — so it
 * is the one that fails first if either number moves.
 */
describe('the bottom nav bar over /map', () => {
  it.each(VIEWPORTS)('sits inside the peek strip the camera already concedes at %ix%i', (width) => {
    // `restingSheetFraction` is undefined for a peek-resting scope, which is what makes
    // `mapOcclusionInsets` fall back to its own `SHEET_PEEK_PX`. Passing undefined here is the
    // honest reproduction of what `MapShell` passes.
    const conceded = mapOcclusionInsets(width, undefined).bottom;
    expect(conceded).toBeGreaterThanOrEqual(BOTTOM_NAV_HEIGHT_PX);
    expect(PEEK_PX).toBeGreaterThan(BOTTOM_NAV_HEIGHT_PX);
  });

  it('leaves the peek row enough room above the bar to be read', () => {
    // `PlaceList`'s peek row pads itself by exactly the bar's height. What is left is the line
    // itself, and a line of text that has been squeezed to nothing is a control nobody can use.
    expect(PEEK_PX - BOTTOM_NAV_HEIGHT_PX).toBeGreaterThanOrEqual(44);
  });
});
