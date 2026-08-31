/**
 * The map shell's sheet: its three stops, and the numbers that describe them.
 *
 * React-free, and — deliberately — free of any transitive `server-only` import, which is the whole
 * reason `/collections/[id]` grew a private copy of this file in the first place: `MapSurface` and
 * `place-sheet.tsx` both pull `server-only` in through their own dependencies, so nothing declared
 * inside them can be read from a unit test, and these numbers are the part most worth testing. Two
 * of them have already produced a measured camera defect between them (`L2-COLL-CAM-2`).
 *
 * This module replaces that copy. There is now one declaration of each number for the whole
 * product, and `ux-collections-as-scope.md` §5 item 8 is what asked for it.
 */

/** The three stops, everywhere. A shell that grew a fourth would be a different component. */
export type SheetStop = 'peek' | 'half' | 'full';

/**
 * Fixed peek height. `env(safe-area-inset-bottom)` is added via CSS `calc()` inside the snap
 * point's own element (vaul only takes a bare px number for the snap point itself), so the sheet's
 * *drag* stop stays a stable number while the visual bottom padding still respects the inset.
 *
 * **This number may not move.** It is mirrored in three other places, and one of them is a licence
 * condition: `globals.css`'s `.maplibregl-ctrl-attrib` padding keeps CARTO's and OSM's attribution
 * clear of the sheet at `peek`, and `query-rect.ts`'s `SHEET_PEEK_PX` is the camera's bottom budget.
 * Neither can import this module — CSS cannot, and `components/map` importing `components/sheet`
 * would invert the direction those two already depend in — so they stay mirrored, and
 * `tests/unit/shell/sheet-geometry.test.ts` is what stops the four drifting apart.
 */
export const PEEK_PX = 128;

/** The drag handle above the sheet's content column (`mt-2.5 h-1`). Subtracted from every content
 *  height below. */
const HANDLE_PX = 14;

/**
 * The drawer's **Places / Collections** switch, which sits between the handle and the content
 * (`map-shell.tsx`, `DrawerViewSwitch`): `mt-1` + an `h-11` track + `mb-2` = 4 + 44 + 8.
 *
 * **It is subtracted at `half` and `full` and not at `peek`, because it does not render at
 * `peek`.** The peek band is 128 px with a 68 px `BottomNav` floating over its lower half, so
 * there is one line of usable strip there and the switch would take all of it. Every stop's number
 * has to describe what is actually in the sheet at that stop: a constant subtracted where nothing
 * is drawn would push the last row of every list 56 px below the bottom of the screen, which is
 * the exact failure `STOP_TO_CONTENT_HEIGHT` was written to fix, arriving from the other side.
 */
const VIEW_SWITCH_PX = 56;

/** Exported so `map-shell.tsx` renders the switch at exactly the height reserved for it here, and
 *  `tests/unit/shell/sheet-geometry.test.ts` can hold the two together. One number, two readers. */
export const VIEW_SWITCH_HEIGHT_PX = VIEW_SWITCH_PX;

/**
 * The stop a sheet rises to when something opens in it, as a fraction of the viewport.
 *
 * One number for two jobs that were declared separately until now: `place-sheet.tsx`'s
 * `SHEET_HALF_FRACTION` (where `/map`'s sheet goes when a place is selected, which the **camera**
 * reads so the pin just tapped is not left behind it) and `/collections/[id]`'s
 * `RESTING_SHEET_FRACTION` (where that route's sheet rests). They were both `0.55` and neither knew
 * about the other.
 */
export const HALF_FRACTION = 0.55;

const SNAP_PEEK = `${PEEK_PX}px` as const;
const SNAP_FULL = 1 as const;

export const STOP_TO_SNAP: Record<SheetStop, `${number}px` | number> = {
  peek: SNAP_PEEK,
  half: HALF_FRACTION,
  full: SNAP_FULL,
};

export const SNAP_POINTS: Array<`${number}px` | number> = [SNAP_PEEK, HALF_FRACTION, SNAP_FULL];

/**
 * How tall the sheet's content column is at each stop, as CSS.
 *
 * **This is a bug fix, not a layout preference.** `Drawer.Content` is `h-full` and vaul positions
 * the sheet by translating it, so at `half` the bottom 45% of a full-height flex column sits below
 * the bottom of the screen. Everything down there is laid out, painted, hit-testable and reported
 * `visible` by a testing library — and completely unreachable, because the scroll container's own
 * bottom is off screen so scrolling to its end still does not bring it into view. Measured at 844:
 * the boundary heading below the last row came to rest 242 px below the viewport at maximum scroll.
 *
 * `dvh` rather than a measured pixel value, so it survives a rotation and the mobile URL bar with
 * no JavaScript and no resize listener.
 *
 * The `half` entry is **derived** from `HALF_FRACTION` rather than written as `55dvh`, because a
 * hand-written copy of a fraction that lives three lines away is the drift this module exists to
 * end. `Math.round` because `0.55 * 100` is `55.00000000000001` in IEEE 754 and that string would
 * reach the browser verbatim.
 *
 * `VIEW_SWITCH_PX` joins the handle at `half` and `full` and is absent at `peek` — see its own
 * comment for why that asymmetry is the honest description rather than an oversight.
 */
export const STOP_TO_CONTENT_HEIGHT: Record<SheetStop, string> = {
  peek: `calc(${PEEK_PX}px - ${HANDLE_PX}px)`,
  half: `calc(${Math.round(HALF_FRACTION * 1000) / 10}dvh - ${HANDLE_PX + VIEW_SWITCH_PX}px)`,
  full: `calc(100dvh - ${HANDLE_PX + VIEW_SWITCH_PX}px)`,
};

/** Which stop a vaul snap value is. Anything unrecognised is `peek`, which is where the sheet
 *  starts and the only stop that is safe to be wrong about. */
export function snapToStop(snap: number | string | null): SheetStop {
  if (snap === SNAP_FULL) return 'full';
  if (snap === HALF_FRACTION) return 'half';
  return 'peek';
}

/**
 * What a scope resting at `stop` costs the camera, as `MapSurfaceProps.restingSheetFraction`.
 *
 * `undefined` for `peek`, which is not an omission: the surface's own default is the 128 px peek
 * strip (`query-rect.ts`'s `SHEET_PEEK_PX`), and a fraction is the wrong shape for a fixed strip —
 * `128 / containerHeight` differs on every phone, and the surface already resolves the pixel form
 * against the container it actually has.
 *
 * `full` returns the **half** fraction rather than `1`. A sheet covering the whole container has no
 * honest framing at all: conceding the full height would push `clampFitPadding` into scaling the
 * box, which is the mechanism behind `L2-COLL-CAM-2`. The useful framing for a full-height sheet is
 * the one the user sees the moment they drag it down.
 *
 * Deriving this here rather than letting each route pass a number is the fix for the failure
 * `/collections/[id]`'s old copy recorded: the camera used to read the fraction back out of
 * `SNAP_POINTS` by index, so reordering the stops made it `undefined`, the conditional spread
 * dropped the prop, the camera silently reverted to a 128 px budget, and no test failed.
 */
export function restingSheetFractionFor(stop: SheetStop): number | undefined {
  return stop === 'peek' ? undefined : HALF_FRACTION;
}
