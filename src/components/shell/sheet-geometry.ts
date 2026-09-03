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

import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';

/** The three stops, everywhere. A shell that grew a fourth would be a different component. */
export type SheetStop = 'peek' | 'half' | 'full';

/**
 * Fixed peek height. `env(safe-area-inset-bottom)` is added via CSS `calc()` inside the snap
 * point's own element (vaul only takes a bare px number for the snap point itself), so the sheet's
 * *drag* stop stays a stable number while the visual bottom padding still respects the inset.
 *
 * **128 until 2026-09-02, and it did not fit.** Measured in the running app at 390×844: the band's
 * lower 68 px belong to the floating `BottomNav`, which is `position: fixed` and opaque across the
 * full width, so the usable strip was 60 px. The one control in it — the row that opens the library,
 * held at the 44 px touch floor — came to rest at y 746–790 against a bar occupying 776–844, so its
 * **last 14 px were behind the bar** and a touch there hit the nav. There was nothing to rebalance
 * inside 128: the button is already at the floor and the chrome above it is a drag handle.
 *
 * So the band is now written as the sum of what is actually in it, and it is bounded from **both**
 * sides — which is the part worth reading before changing it again:
 *
 * | 16 px | sheet border + drag handle (`mt-2.5 h-1`: 1 px border, 10 px margin, a 4–5 px bar) |
 * | 14 px | air |
 * | 44 px | the peek row's button — the touch floor, and not negotiable |
 * | 14 px | air |
 * | 68 px | `BOTTOM_NAV_HEIGHT_PX`, painted over the bottom of the band |
 *
 * **And an upper bound of 158, from the camera.** `clampFitPadding` scales `/map`'s whole padding
 * box down when it does not fit, and `query-rect.test.ts` asserts the scaled bottom padding is
 * still deeper than this strip so no fitted pin lands under the sheet. On the shortest viewport
 * that suite tests — 568×320, a phone in landscape — that holds only while `PEEK_PX ≤ 158`. 156 is
 * the largest 4 px-grid value inside [152, 158], and 152 is where the air drops to 12.
 *
 * Measured after the change at 390×844: handle bottom 704, button 718–762, bar top 776 — 14 px of
 * air above and 14 px below.
 *
 * **It is mirrored in three other places**, and one of them is a licence condition: `globals.css`'s
 * `.maplibregl-ctrl-attrib` padding keeps CARTO's and OSM's attribution clear of the sheet at
 * `peek`, and `query-rect.ts`'s `SHEET_PEEK_PX` is the camera's bottom budget — so moving this
 * number changes which pins the list counts as visible, not only the spacing. Neither can import
 * this module — CSS cannot, and `components/map` importing `components/sheet` would invert the
 * direction those two already depend in — so they stay mirrored, and
 * `tests/unit/shell/sheet-geometry.test.ts` is what stops the four drifting apart.
 */
export const PEEK_PX = 156;

/**
 * The air the peek row keeps between its button and the floating bar below it.
 *
 * Exported as the whole `padding-bottom` rather than as a number, because the other half of the
 * same defect was that the row spent `BOTTOM_NAV_HEIGHT_PX` flat while the bar's own height is
 * `calc(68px + env(safe-area-inset-bottom))` — so on a device with a home indicator the row sat
 * under the bar by the whole inset. JavaScript cannot read `env()`, so the inset has to travel in
 * the CSS string; the bar's height and this padding are now the same expression plus the air.
 *
 * The row that spends it is `flex-1` and **bottom-aligned**, which is what makes the inset actually
 * move the button: a top-anchored row ignores its own `padding-bottom` entirely, which is why the
 * old flat 68 px was doing nothing at all. Bottom-aligned, the gap to the bar is constant at any
 * inset, and it is the air *above* the button that the inset eats — the safe direction to degrade.
 *
 * **Inert today, and worth saying so:** `app/layout.tsx` sets no `viewportFit: 'cover'`, so every
 * `env(safe-area-inset-bottom)` in this product currently resolves to 0. This makes the row correct
 * for the day that changes; it is not evidence that anything was observed to move.
 */
const PEEK_ROW_AIR_PX = 16;
// 16 rather than the 14 the table above measures, and the 2 px are not a fudge: `HANDLE_PX`
// undercounts the sheet's chrome by exactly that (it counts the handle and not the 1 px border or
// the 1 px the 4 px bar rounds up to at DPR 2), so the content column overhangs the bottom of the
// viewport by 2 px. Padding from the column's own edge therefore costs 2 px more than it buys.

export const PEEK_ROW_PADDING_BOTTOM =
  `calc(${BOTTOM_NAV_HEIGHT_PX + PEEK_ROW_AIR_PX}px + env(safe-area-inset-bottom))` as const;

/** The drag handle above the sheet's content column (`mt-2.5 h-1`). Subtracted from every content
 *  height below. */
const HANDLE_PX = 14;

/**
 * The drawer's **Places / Collections** switch, which sits between the handle and the content
 * (`map-shell.tsx`, `DrawerViewSwitch`): `mt-1` + an `h-11` track + `mb-2` = 4 + 44 + 8.
 *
 * **It is subtracted at `half` and `full` and not at `peek`, because it does not render at
 * `peek`.** The peek band is 156 px with a 68 px `BottomNav` floating over its lower half, so
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
 *
 * **`BottomNav` is deliberately not subtracted here, and that is the half of this that keeps
 * catching people.** Each of these numbers puts the *bottom* of the content box exactly on the
 * bottom of the viewport — at `half` the drawer's top is at 45dvh and 14 + 56 + (55dvh − 70) lands
 * on 100dvh — and the floating bar is painted over that box's last 68 px rather than above it.
 * Taking it out of the height as well as out of the scroll column's padding, which is where every
 * consumer already pays it, would subtract it twice and end every list 68 px short. So the rule is
 * split: **this map owns the box, `floatingBarClearancePx` owns what the bar costs inside it**, and
 * a column that scrolls has to spend the second one or its last control ends up under the bar. See
 * that function for the defect that came of a column spending neither.
 */
export const STOP_TO_CONTENT_HEIGHT: Record<SheetStop, string> = {
  peek: contentHeightFor('peek'),
  half: contentHeightFor('half'),
  full: contentHeightFor('full'),
};

/**
 * The same map as a function, for the one surface whose sheet does **not** draw the view switch
 * above it: the place detail.
 *
 * **Measured, 2026-09-03, 390×844, a place opened from the list at `half`.** The switch rendered
 * inside the detail — 396–452 — and the card's scroll column got what was left, 452–778, 326 px of
 * a 699 px card. `Been here` came to rest at 798–842 with the column clipping at 778: **not one
 * pixel of the card's only act was on screen at rest**, and neither were `Add to a collection`,
 * `Category`, `Add a note`, the nearby row or `Remove from your places`. The switch is 56 px — 12%
 * of the sheet — spent asking *Places or Collections?* of somebody who is looking at one place.
 *
 * So `viewSwitch: false` says the caller's host is not drawing it, and the 56 px go back to the
 * column. Verified in the running app with the switch removed and this height applied: the column
 * became 396–778 (382 px) and `Been here` moved to 742–786.
 *
 * **It is a claim about the host, not about the content**, which is why it is an option a caller
 * passes rather than something this module infers — exactly the reasoning `floatingBarClearancePx`
 * already carries for the `BottomNav`. A component cannot see what is drawn above it, and a
 * component that guesses wrong here overhangs the bottom of the screen by 56 px.
 */
export function contentHeightFor(
  stop: SheetStop,
  options?: { readonly viewSwitch?: boolean },
): string {
  // At `peek` the switch is not drawn at any stop, so the option has nothing to say there.
  if (stop === 'peek') return `calc(${PEEK_PX}px - ${HANDLE_PX}px)`;
  const chrome = HANDLE_PX + (options?.viewSwitch === false ? 0 : VIEW_SWITCH_PX);
  const height = stop === 'half' ? `${Math.round(HALF_FRACTION * 1000) / 10}dvh` : '100dvh';
  return `calc(${height} - ${chrome}px)`;
}

/**
 * What the floating `BottomNav` costs the bottom of a scrolling column inside the sheet, in pixels.
 *
 * **The generalisation of a measured defect** (product review 2026-08-31 round 3, finding 1): the
 * place detail's column was the one column in the product that spent neither this nor
 * `STOP_TO_CONTENT_HEIGHT`, and the two failures compounded. Un-capped, it was `flex-1` inside an
 * `h-full` `Drawer.Content` translated down the screen, so `scrollHeight === clientHeight`
 * (measured 772 = 772 at 390×844) and its own `overflow-y-auto` was inert — 380 px of the card sat
 * below the viewport with no way to scroll to it. Un-padded, `Been here` came to rest at y 790–834
 * with the bar occupying 776–844, and a real touch at its centre navigated to `/profile`. Five of
 * five hit-test points across the button's width returned an element it did not contain.
 *
 * So the rule the sheet's geometry now states out loud: **a floating overlay is part of the layout
 * budget of every surface it floats over, not of the surface that declares it.** The number is
 * `BottomNav`'s own, imported rather than re-typed — a hand-written `68` beside a constant five
 * other surfaces read is the next defect, not a simplification.
 *
 * `undefined` is the `lg+` panel rather than a missing stop, and it is worth 0: `stop` is what the
 * shell passes to content it puts in *the sheet*, and `BottomNav` is `lg:hidden`, so the absence of
 * a stop is exactly the absence of the bar. `collection-content.tsx` already open-codes this
 * conditional; this is where it belongs, and asking a media query in JavaScript instead would be a
 * second, weaker way of asking the same question.
 */
export function floatingBarClearancePx(stop: SheetStop | undefined): number {
  return stop === undefined ? 0 : BOTTOM_NAV_HEIGHT_PX;
}

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
 * `undefined` for `peek`, which is not an omission: the surface's own default is the 156 px peek
 * strip (`query-rect.ts`'s `SHEET_PEEK_PX`), and a fraction is the wrong shape for a fixed strip —
 * `156 / containerHeight` differs on every phone, and the surface already resolves the pixel form
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
 * dropped the prop, the camera silently reverted to the peek pixel budget, and no test failed.
 */
export function restingSheetFractionFor(stop: SheetStop): number | undefined {
  return stop === 'peek' ? undefined : HALF_FRACTION;
}
