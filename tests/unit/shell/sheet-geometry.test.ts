/**
 * The sheet's geometry, and the four mirrors of `PEEK_PX` that cannot import each other.
 *
 * `ux-collections-as-scope.md` §5 item 8 deleted one of those mirrors (`/collections/[id]`'s
 * private copy) and was explicit that the *value* must not move: `globals.css` uses it to keep
 * CARTO's and OpenStreetMap's attribution clear of the sheet on a phone, which is a licence
 * condition rather than a layout preference. The three surviving copies live in a `.ts` module, a
 * different `.ts` module that may not import it, and a stylesheet — so the only thing that can hold
 * them together is a test that reads all three.
 *
 * No DOM here (`vitest.config.ts` sets `environment: 'node'`); none is needed, because every claim
 * below is arithmetic or source text.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  HALF_FRACTION,
  PEEK_PX,
  PEEK_ROW_PADDING_BOTTOM,
  SNAP_POINTS,
  STOP_TO_CONTENT_HEIGHT,
  STOP_TO_SNAP,
  VIEW_SWITCH_HEIGHT_PX,
  floatingBarClearancePx,
  restingSheetFractionFor,
  snapToStop,
} from '@/components/shell/sheet-geometry';
import { SHEET_PEEK_PX } from '@/components/map/query-rect';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';

const repoFile = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

describe('PEEK_PX and its mirrors', () => {
  it('is 156 — the sum of what the band actually holds', () => {
    // Spelled out rather than compared to itself: the ruling names the number, so the test does.
    // 128 until 2026-09-02 (W2-E), when the band was measured against its own contents and did not
    // fit: the 44 px button came to rest at y 746-790 with `BottomNav` occupying 776-844, so its
    // lower 14 px were behind an opaque fixed bar. The assertion below is the arithmetic rather
    // than a second hand-typed number, and 158 is the ceiling the camera puts on it.
    expect(PEEK_PX).toBe(156);
  });

  it('holds the handle, a 44px target with air on both sides, and the whole floating bar', () => {
    const HANDLE_AND_BORDER_PX = 16; // measured: 1 border + 10 `mt-2.5` + a 4-5 px `h-1` handle
    const TOUCH_FLOOR_PX = 44; // `min-h-11` on the peek row's button, and not negotiable
    const AIR_PX = 14; // above the button, and again below it
    expect(PEEK_PX).toBe(
      HANDLE_AND_BORDER_PX + AIR_PX + TOUCH_FLOOR_PX + AIR_PX + BOTTOM_NAV_HEIGHT_PX,
    );
    // And the ceiling, which is the camera's: `clampFitPadding` scales `/map`'s padding box down on
    // a viewport too short for it, and `query-rect.test.ts` requires the scaled bottom padding to
    // stay deeper than this strip. At 568x320 that holds only up to 158.
    expect(PEEK_PX).toBeLessThanOrEqual(158);
    // The half of it the row itself spends, and the reason a flat `68px` was not enough: the bar's
    // own height is `calc(68px + env(safe-area-inset-bottom))`, so a row padded by the bare number
    // sits under a home indicator by the whole inset.
    // `+ 2` because the content column overhangs the bottom of the viewport by exactly that:
    // `HANDLE_PX` (14) undercounts the sheet's real chrome (16). So 84 px of padding buys 14 px of
    // air, which is what the browser measures.
    expect(PEEK_ROW_PADDING_BOTTOM).toBe(
      `calc(${BOTTOM_NAV_HEIGHT_PX + AIR_PX + 2}px + env(safe-area-inset-bottom))`,
    );
    expect(PEEK_ROW_PADDING_BOTTOM).toContain('env(safe-area-inset-bottom)');
  });

  /**
   * The padding only does anything because the row it is on fills the column and hangs off its
   * bottom edge. Top-anchored — which is what it was — a `padding-bottom` positions nothing at all,
   * which is why the old flat 68 px left the button 14 px behind the bar while looking correct in
   * the source. Read out of `place-sheet.tsx` for the same reason every other assertion in this
   * file does: it pulls `server-only` in through its Server Actions and cannot be imported here.
   */
  it('is spent by a row that is bottom-aligned, or the padding positions nothing', () => {
    const sheet = repoFile('src/components/sheet/place-sheet.tsx');
    expect(sheet).toContain('className="flex min-h-0 flex-1 items-end"');
    expect(sheet).toContain('style={{ paddingBottom: PEEK_ROW_PADDING_BOTTOM }}');
  });

  it('is the same number the camera spends on its bottom budget', () => {
    expect(SHEET_PEEK_PX).toBe(PEEK_PX);
  });

  it('is the same number the attribution is lifted clear by', () => {
    // The licence mirror. Read as source text because CSS cannot import a constant, and asserted
    // as the whole declaration so a change to the *shape* of the calc() fails here too.
    const css = repoFile('src/app/globals.css');
    expect(css).toContain(
      `padding-bottom: calc(${PEEK_PX}px + env(safe-area-inset-bottom) + 0.25rem);`,
    );
  });

  // The "no second declaration" half of §5 item 8 used to live here, scoped to
  // `src/app/collections/`. It now lives in `one-shell.test.ts` and covers the whole of `src/`,
  // because a second shell is no likelier on that route than anywhere else.
});

describe('the three stops', () => {
  it('are the snap points, in order, and nothing else is', () => {
    expect(SNAP_POINTS).toEqual([STOP_TO_SNAP.peek, STOP_TO_SNAP.half, STOP_TO_SNAP.full]);
    expect(SNAP_POINTS).toHaveLength(3);
  });

  it('round-trip through snapToStop', () => {
    for (const stop of ['peek', 'half', 'full'] as const) {
      expect(snapToStop(STOP_TO_SNAP[stop])).toBe(stop);
    }
  });

  it('treat anything unrecognised as peek', () => {
    // Where the sheet starts, and the only stop it is safe to be wrong about.
    expect(snapToStop(null)).toBe('peek');
    expect(snapToStop(0.42)).toBe('peek');
  });

  it('derive the half content height from the fraction, with no float noise in the CSS', () => {
    // `0.55 * 100` is 55.00000000000001 in IEEE 754, and that string would reach the browser
    // verbatim. This is the assertion that stops someone "simplifying" the rounding away.
    expect(STOP_TO_CONTENT_HEIGHT.half).toBe('calc(55dvh - 70px)');
    expect(STOP_TO_CONTENT_HEIGHT.half).not.toContain('55.0');
    expect(STOP_TO_CONTENT_HEIGHT.full).toBe('calc(100dvh - 70px)');
  });

  /**
   * **The chrome each stop actually has above its content**, which is the only thing these three
   * numbers describe.
   *
   * 14 px of drag handle everywhere, plus the drawer's Places / Collections switch at `half` and
   * `full` — and **not** at `peek`, because `map-shell.tsx` does not render it there. The peek band
   * is 156 px with a 68 px `BottomNav` floating over its lower half, so it holds one line and the
   * switch would be that line.
   *
   * Subtracting the switch at a stop that does not draw it would push the last row of every list in
   * the product 56 px below the bottom of the screen — laid out, painted, hit-testable and
   * unreachable, which is the exact failure `STOP_TO_CONTENT_HEIGHT` was written to fix, arriving
   * from the other side. So the asymmetry is the assertion.
   */
  it('reserve the view switch at half and full, and never at peek', () => {
    expect(VIEW_SWITCH_HEIGHT_PX).toBe(56);
    expect(STOP_TO_CONTENT_HEIGHT.peek).toBe(`calc(${PEEK_PX}px - 14px)`);
    // Asserted as the *subtraction* rather than as the substring `56`, which the assertion said
    // until 2026-09-02 and which stopped meaning anything the moment `PEEK_PX` became 156: a
    // digit-run match on a number that also appears in the operand is a coincidence detector, not
    // a guard. What must never happen is the switch being taken off a stop that does not draw it.
    expect(STOP_TO_CONTENT_HEIGHT.peek).not.toContain(`- ${14 + VIEW_SWITCH_HEIGHT_PX}px`);
    expect(STOP_TO_CONTENT_HEIGHT.peek).toContain('- 14px');
    for (const stop of ['half', 'full'] as const) {
      expect(STOP_TO_CONTENT_HEIGHT[stop], stop).toContain(`- ${14 + VIEW_SWITCH_HEIGHT_PX}px`);
    }
  });

  /**
   * The one number, read by two files.
   *
   * `map-shell.tsx` draws the switch and `sheet-geometry.ts` reserves its height, and nothing but
   * this holds them together: a switch that grew a row would leave every list under it 56 px short
   * with nothing failing anywhere. Read out of the source rather than rendered, because the shell
   * needs vaul, a portal and a live map to render at all.
   */
  it('is the height map-shell actually gives the switch', () => {
    const shell = readFileSync(
      fileURLToPath(new URL('../../../src/components/shell/map-shell.tsx', import.meta.url)),
      'utf8',
    );
    expect(shell).toContain('VIEW_SWITCH_HEIGHT_PX');
    expect(shell).toContain('height: `${VIEW_SWITCH_HEIGHT_PX}px`');
    // And it is withheld at `peek`, which is the other half of the asymmetry above — and now also
    // while the sheet holds a place detail, the other reader of the same 56 px. Matched as a
    // condition rather than as a line, so wrapping the JSX cannot silently unpin it.
    expect(shell).toMatch(
      /shell\.sheet\.stop === ["']peek["']\s*\|\|\s*sheetHidesViewSwitch\s*\? null : \(?\s*<DrawerViewSwitch/,
    );
  });
});

describe('what a resting stop costs the camera', () => {
  it('is undefined at peek, so the surface keeps its own pixel budget', () => {
    // Not an omission: the peek band is a fixed strip and `PEEK_PX / containerHeight` differs on
    // every phone.
    expect(restingSheetFractionFor('peek')).toBeUndefined();
  });

  it('is the half fraction at half — the value L2-COLL-CAM-2 was fixed to', () => {
    expect(restingSheetFractionFor('half')).toBe(HALF_FRACTION);
    expect(HALF_FRACTION).toBe(0.55);
  });

  it('caps a full-height sheet at the half fraction rather than conceding the container', () => {
    // Conceding 100% would push `clampFitPadding` into scaling the box, which is the mechanism
    // behind L2-COLL-CAM-2. There is no honest framing behind a full sheet; the useful one is what
    // the user sees when they drag it down.
    expect(restingSheetFractionFor('full')).toBe(HALF_FRACTION);
  });
});

/**
 * The floating bar, and the two halves of the budget it is split across.
 *
 * The defect these pin (product review 2026-08-31 round 3, finding 1): `/map`'s place detail spent
 * *neither* half. `Been here` came to rest at y 790–834 with the bar occupying 776–844, five of
 * five hit-test points across its width returned an element the button did not contain, and a real
 * touch at its visual centre navigated to `/profile` instead of marking the place been. The whole
 * `been / not been yet` feature — one of the five things the MVP boundary says this product stores
 * — was unreachable on the primary platform.
 */
describe('what the floating BottomNav costs a column inside the sheet', () => {
  it('is the bar\'s own height at every stop, not a number typed here', () => {
    // Imported rather than re-declared. A hand-written `68` beside a constant five surfaces read is
    // the next defect: `bottom-nav.tsx`'s own docblock says the labels stay stacked precisely so
    // this number does not move for a layout preference.
    for (const stop of ['peek', 'half', 'full'] as const) {
      expect(floatingBarClearancePx(stop), stop).toBe(BOTTOM_NAV_HEIGHT_PX);
    }
    expect(BOTTOM_NAV_HEIGHT_PX).toBe(68);
  });

  it('is nothing without a stop, because that is the lg+ panel and the bar is lg:hidden', () => {
    // `stop` is what the shell passes to content it puts in *the sheet*. Its absence is not a
    // missing argument; it is the desktop panel, where `BottomNav` does not render at all.
    expect(floatingBarClearancePx(undefined)).toBe(0);
  });

  /**
   * **The other half, and the reason the obvious fix is wrong.**
   *
   * Reading the defect as "`STOP_TO_CONTENT_HEIGHT` forgot the nav" invites subtracting 68 there
   * too. It must not: each of those numbers already puts the *bottom* of the content box exactly on
   * the bottom of the viewport, and every scrolling consumer — the saved list, the collections
   * index, a collection's list, its add-places panel — already pays the bar in its own
   * `padding-bottom`. Subtracting it in both places would end every list in the product 68 px
   * short, which is the failure `STOP_TO_CONTENT_HEIGHT` exists to prevent, arriving from the third
   * side.
   */
  it('is not also subtracted from the content height, which would pay for the bar twice', () => {
    for (const stop of ['peek', 'half', 'full'] as const) {
      expect(STOP_TO_CONTENT_HEIGHT[stop], stop).not.toContain(`${BOTTOM_NAV_HEIGHT_PX}px`);
    }
    // The whole subtraction at `half` and `full` is still the handle plus the view switch, and
    // `peek` is still the handle alone.
    expect(STOP_TO_CONTENT_HEIGHT.half).toBe('calc(55dvh - 70px)');
    expect(STOP_TO_CONTENT_HEIGHT.peek).toBe(`calc(${PEEK_PX}px - 14px)`);
  });

  /**
   * The place detail is inside a box again — the half of the defect that made the first half
   * unfixable on its own.
   *
   * `PlaceDetail`'s root is `min-h-0 flex-1 overflow-y-auto`, and `PlaceSheet` used to render it
   * bare into a `h-full` `Drawer.Content` that vaul *translates* down the screen. Measured at
   * 390×844: `clientHeight` 772, `scrollHeight` 772, `overflow-y-auto` inert, and 380 px of the
   * card below the viewport with no way to scroll to it. Read out of the source because
   * `place-sheet.tsx` pulls `server-only` in through its Server Actions, which is the same reason
   * the module under test here is React-free in the first place.
   */
  it('is spent by the place detail, together with the content height it sits in', () => {
    const sheet = repoFile('src/components/sheet/place-sheet.tsx');
    // The list arm still spends the stop's own height; the detail arm spends `contentHeightFor`,
    // because it is the arm that can be given back the view switch's 56 px. Both are asserted, so
    // neither can quietly stop bounding its column — which is the failure the constant exists for.
    expect(sheet).toMatch(/height: STOP_TO_CONTENT_HEIGHT\[stop\]/);
    expect(sheet).toMatch(/contentHeightFor\(stop, \{\s*viewSwitch: hostShowsViewSwitch,?\s*\}\)/);
    expect(sheet).toMatch(/height: detailHeight/);
    expect(sheet).toContain('floatingBarPx={floatingBarClearancePx(stop)}');
  });
});
