'use client';

/**
 * **The one shell: a map, a drag sheet over it below `lg`, a persistent panel beside it at `lg+`.**
 *
 * `/map` and `/collections/[id]` were two hand-built copies of this composition — two
 * `Drawer.Root`s, two desktop panels, two `MapSurface` call sites and two declarations of every
 * geometry constant. `ux-collections-as-scope.md` ruled that a collection is a **scope** on this
 * shell rather than a second app, and §5 items 8–11 are the deletions that make it true.
 *
 * ## What is parameterised, and what a parameter is allowed to be
 *
 * Everything the two routes differ on arrives as **data**: the pins, the initial box, where the
 * sheet rests, how much floating chrome sits over the map, and two content slots. Nothing arrives
 * as a `variant` or a `readOnly` flag — that is the difference between one parameterised shell and
 * one shell with a mode in it, and it is why `collection-content.tsx`'s objection to threading a
 * flag through eleven props does not apply.
 *
 * The state lives in `useMapShell` rather than here, because the writers are above this component
 * in the tree: `/map`'s eight camera movers are handlers on `map-page-client.tsx` and a
 * collection's re-fit fires from an effect in `collection-client.tsx`.
 *
 * ## Two orderings in the tree below that are load-bearing
 *
 * 1. **The sheet and the bar unmount while `overlay` is set.** Both vaul drawers portal to
 *    `document.body` *after* this subtree, so at matched z-indices the sheet paints on top of
 *    anything rendered here regardless of DOM or JSX order. Leaving it mounted is how the import
 *    overlay stops being an opaque takeover on a phone and the places list bleeds through around
 *    it. The bar goes with it for a different reason: navigating away from a half-finished import
 *    by tapping a tab is not a thing to offer.
 * 2. **`modalSlot` is *not* guarded**, and it renders after the sheet. It holds a *modal* drawer,
 *    and unmounting one of those mid-open means its close effect never runs — which leaves
 *    `document.body` holding a scroll lock and a `pointer-events: none` nobody can see. It also has
 *    to be the thing the backdrop covers rather than the thing covered by it, and at equal
 *    z-indices paint order is mount order.
 *
 * ## Mount versus reveal — the rule the entrance may not break
 *
 * **The post-login entrance (`I2-7`) governs where these surfaces *are*. It may never govern
 * whether they exist.** Content that is mounted can be translated off screen, faded, occluded or
 * slid, and it is still in the accessibility tree, still found by find-in-page, still readable by
 * anything that is not a pair of eyes. Content that is not mounted is none of those things, and
 * withholding *it* is not choreography — it is an outage with a timer on it.
 *
 * That distinction was missed until 2026-08-31: both the sheet and the `lg+` panel were behind
 * `{listArrived && …}`, so the desktop place list did not exist in the document for **2467 / 2613 /
 * 2509 ms** at 1440×900 (measured against `5c3d3a9`; `docs/evidence/i2/screens/map-arrival--1440x900--t1500ms.png`
 * is the picture of it). The entrance's own beat is 900 ms, and the other 1.5 s is that the clock's
 * zero is the camera framing rather than the mount — so the beat, faithfully implemented, landed at
 * two and a half seconds.
 *
 * The sheet now mounts on the first render and is held at vaul's own off-screen resting transform
 * until its beat; the panel takes no beat at all. Both reasons are at their call sites below.
 *
 * **What each viewport actually gains, measured rather than asserted.** Read out of Chromium's own
 * accessibility tree at t=1200 ms, at `a72e9cd`, 390×844:
 *
 * - **At `lg+` the panel is the whole win.** It is mounted *and* painted from the first render, so
 *   the thirty rows are in the document and in the accessibility tree throughout — measured 137 /
 *   138 / 141 ms against 4445 / 3016 / 3072 ms at `5c3d3a9`, alternating runs.
 * - **Below `lg` the win is the sheet, not the rows.** The held sheet is in the accessibility tree
 *   — `aria-hidden` unset, `inert` false, exposed as a dialog whose control reads *"Show your
 *   places · 30 in Israel"* — from ~274 ms rather than ~3.7 s. Its **rows** are still not there,
 *   and that is `place-sheet.tsx`'s own design rather than anything the entrance does: at `peek` it
 *   renders one line and no list, before this change and after it. The row text a DOM probe finds
 *   at ~28 ms on a phone is the `lg+` panel's, inside a `display:none` container, and it is not in
 *   the accessibility tree there. Do not restate that as "the list is always available on mobile".
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Drawer } from 'vaul';

import type { MapPlace } from '@/components/map/map-surface';
import { PersistentMapSlot, useAdoptionRefit } from './persistent-map';
import { ENTRANCE_BEATS, useEntranceBeat } from '@/components/map/entrance';
import type { LatLngBoundsHint, MapSummaries, ViewportChangeMeta } from '@/components/map/types';
import { BottomNav } from '@/components/nav/bottom-nav';
import {
  SNAP_POINTS,
  STOP_TO_SNAP,
  VIEW_SWITCH_HEIGHT_PX,
  restingSheetFractionFor,
  type SheetStop,
} from './sheet-geometry';
import { NonModalDrawerScope, useNonModalDrawerTabRelease } from './non-modal-drawer';
import { focusProps, type MapShellState } from './use-map-shell';
import { PRESS_CHIP } from '@/lib/interaction';
import { cn } from '@/lib/utils';

/**
 * **Where a mounted-but-unarrived sheet sits, and why it has to be said out loud.**
 *
 * One animation frame after mount vaul flips `data-vaul-delayed-snap-points` to `true`
 * (`vaul/dist/index.mjs:1443`), and from then on `Drawer.Content`'s transform is
 * `translate3d(0, var(--snap-point-height, 0), 0)` — a variable vaul writes itself, as
 * `snapPointsOffset[activeSnapPointIndex ?? 0]` (`:1462`).
 *
 * **With no active snap point that variable is invalid, and the fallback is `0` — which is the
 * *top* of the screen.** `activeSnapPointIndex` is `snapPoints.findIndex(…)`, so a `null` active
 * point makes it `-1`, and `-1 ?? 0` is `-1`, not `0`: vaul writes `undefinedpx`, CSS discards it,
 * and `var(…, 0)` supplies the fallback. The sheet lands at `full`, covering the entire phone.
 *
 * That is not a deduction after the fact — it was photographed at 390×844, t=1500 ms, on the first
 * attempt at this fix, which put the whole list over the map instead of under it.
 *
 * vaul spreads the caller's `style` **after** its own key (`:1461`), so this wins, and `100%` is the
 * same value `--initial-transform` defaults to one frame earlier — so the two rules agree and the
 * held sheet does not move at all until its beat.
 */
const ENTRANCE_HOLD_STYLE = { '--snap-point-height': '100%' } as CSSProperties;

/**
 * **The drawer's two views, and the hrefs that address them.**
 *
 * Owner, 2026-08-31: *"the collection / places navigation should be inside the drawer"*. It used to
 * be the `Collections` tab in `BottomNav`, and that tab is gone — a control that means "show me the
 * other list" belongs on the surface holding the list, not in the bar that says which screen you
 * are on. See `DrawerViewSwitch` for what replaces it and `bottom-nav.tsx` for what the bar keeps.
 *
 * **Hrefs, not callbacks, and that is requirement 2 of the dispatch rather than a preference.**
 * Two real `<a href>`s make the switch work with hydration killed, which this product has shipped
 * a blank screen by forgetting twice. Where the two hrefs differ only in their search params the
 * router re-renders one page in place and nothing here unmounts; where they are different segments
 * it is an ordinary navigation. The switch does not know or care which.
 */
export interface DrawerViews {
  /** Which of the two the drawer is showing right now. */
  readonly current: 'places' | 'collections';
  readonly placesHref: string;
  readonly collectionsHref: string;
}

/**
 * The control itself — a segmented pair, rendered from two places: inside `Drawer.Content` below
 * `lg`, and at the top of the left panel above it. One component, so the phone and the desktop
 * cannot grow different navigation, which is `ui-review-2026-08-31.md` §1 finding 6's whole
 * complaint about this product.
 */
function DrawerViewSwitch({ views }: { views: DrawerViews }) {
  return (
    // `<nav>`, because it is two links to two places, and labelled because the document already
    // has one called `Main`. The label names the pair rather than the container: a screen reader
    // user hears "Places and collections, navigation", which is what it is.
    <nav
      aria-label="Places and collections"
      style={{ height: `${VIEW_SWITCH_HEIGHT_PX}px` }}
      className="shrink-0 px-4 pt-1 pb-2"
      data-vaul-no-drag
    >
      <div className="flex h-full items-center gap-1 rounded-full bg-muted/60 p-1">
        <ViewTab href={views.placesHref} label="Places" active={views.current === 'places'} />
        <ViewTab
          href={views.collectionsHref}
          label="Collections"
          active={views.current === 'collections'}
        />
      </div>
    </nav>
  );
}

function ViewTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      // `typedRoutes` types the route literal and has nothing to say about a query string on it —
      // the same cast `bottom-nav.tsx` makes for `/map?place=`.
      href={href as '/map'}
      {...(active ? { 'aria-current': 'page' as const } : {})}
      className={cn(
        'flex h-full min-w-0 flex-1 items-center justify-center rounded-full px-3 text-sm font-medium',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        // Rest and hover unconditionally; the on state as a variant over the attribute that is
        // already on the element — rule 6a, state comes from the DOM rather than from a class
        // string assembled by a ternary, so a tab cannot look selected while telling a screen
        // reader it is not.
        'text-muted-foreground hover:text-foreground',
        'aria-[current]:bg-card aria-[current]:text-foreground aria-[current]:shadow-raised',
        // The chip's press, which is what `BottomNav`'s own tabs take: a target with no fill of its
        // own, on a phone with no hover and no focus-visible to confirm the tap landed. Every part
        // of it is behind `motion-safe:` already.
        PRESS_CHIP,
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

export interface MapShellProps {
  /** The shell's state, from `useMapShell` in the route that owns the scope. */
  readonly shell: MapShellState;

  // ---- the map ----
  /** The pins. Already narrowed by whatever the scope narrows by; this component never filters. */
  readonly places: readonly MapPlace[];
  readonly initialBounds?: LatLngBoundsHint;
  /**
   * Where this scope's sheet sits when nothing is open — `peek` on `/map`, `half` in a collection.
   *
   * It drives the initial snap **and** the camera's bottom budget, in that one direction, which is
   * the fix for a defect the collection route's old copy recorded: the camera used to read the
   * fraction back out of `SNAP_POINTS` by index, so reordering the stops made it `undefined`, the
   * conditional spread dropped the prop, and the camera silently reverted to framing for a 128 px
   * peek with nothing failing anywhere. See `restingSheetFractionFor`.
   */
  readonly restingStop: SheetStop;
  /**
   * **The place the list is pointing at** (`W3-2`), passed straight through to the surface.
   *
   * The shell holds none of it: the state lives on the route, because the *list* is what produces
   * it and the list is the route's. This is the seam it crosses to reach the canvas — a DOM hover
   * on one side, a paint expression on the other. Optional, so `/collections/[id]` mounts the same
   * shell without knowing the coupling exists.
   */
  readonly hoveredPlaceId?: string | null;
  /**
   * How deep a band of floating chrome this scope puts over the map's top edge, in pixels.
   *
   * Omitted keeps `/map`'s numbers (56 at `lg+`, 100 below, for the account chip and the
   * post-import strip). **`0` for a scope with none**, which both collections routes are and must
   * stay: `ux-collections-as-scope.md` §3 forbids a scope chip over the map precisely so this
   * number can stay 0, and `L2-COLL-CAM-2` is what a phantom 100 px did at 640×360 — 394 px of
   * padding in a 360 px container, the clamp scaling the box, and the lowest pin coming to rest
   * under the sheet.
   */
  readonly floatingTopChromePx?: number;
  /**
   * The place whose detail the **map itself** should draw at `lg+`, or `null` for a scope that has
   * no map-drawn detail.
   *
   * `null` rather than a flag, and a collection passes `null`. Its pins carry no `savedPlaceId`
   * (they are collection items), so the surface's popover would render `PlaceDetail` with
   * `savedPlace={null}` — losing the shared note, `Added by` and `Remove from this collection`,
   * which is exactly the four-item list `ux-collections-as-scope.md` §4 says a collection must add.
   * Teaching the surface those two slots is a separate change; until then a collection's detail
   * stays in the sheet and the left panel, where it is complete.
   */
  readonly selectedPlace?: MapPlace | null;
  /** What the sheet covers once something is open, as a fraction — the band the camera keeps the
   *  selected pin out of. Omitted means no reveal, which is right for a scope whose sheet already
   *  rests at that stop. */
  readonly selectedOcclusionFraction?: number;
  readonly summaries?: MapSummaries;
  readonly onPlaceClick?: (place: MapPlace) => void;
  readonly onDeselect?: () => void;
  readonly onAreaClick?: (areaId: string) => void;
  readonly onCountryClick?: (key: string) => void;
  readonly onViewportChange?: (bounds: LatLngBoundsHint, meta: ViewportChangeMeta) => void;
  readonly accessibleName?: string;
  /** Goes into the surface's own control column, bottom-right, where a user looks for it. */
  readonly controlSlot?: ReactNode;

  // ---- content ----
  /**
   * The sheet's content, **as a function of the stop it has to render at**.
   *
   * A function rather than a node because a sheet at `half` is a full-height flex column translated
   * down the screen: its bottom 45% is laid out, painted, hit-testable and completely unreachable,
   * since the scroll container's own bottom is off screen. Content that takes the stop can cap
   * itself with `STOP_TO_CONTENT_HEIGHT`. That is `ux-collections-as-scope.md` §5 item 11 — the
   * collection route's `Add places` being tappable only at `full` — fixed without
   * `CollectionContent` learning what a sheet is.
   *
   * The shell deliberately does **not** impose the height itself: `/map`'s place detail is a
   * full-height pane by design and capping it here would be a behaviour change to the surface this
   * refactor promises not to touch.
   */
  readonly sheetContent: (stop: SheetStop) => ReactNode;
  /** What goes inside the `lg+` left panel. The frame — width, hairline, blur, pointer-events
   *  islanding — is the shell's; this is only what sits in it. */
  readonly panelContent: ReactNode;
  /**
   * The drawer's own Places / Collections navigation.
   *
   * **Required, not optional, because the geometry is unconditional.**
   * `STOP_TO_CONTENT_HEIGHT` subtracts `VIEW_SWITCH_HEIGHT_PX` at `half` and `full` for every
   * sheet in the product. A caller that omitted the switch would get 56 px of reserved space with
   * nothing drawn in it, and every list inside it would end 56 px short — laid out, painted and
   * below the bottom of the screen, which is the failure `STOP_TO_CONTENT_HEIGHT` exists to
   * prevent. Two components render this shell; both pass it.
   */
  readonly views: DrawerViews;
  /**
   * **The sheet is showing one place, so the switch is answering a question nobody asked.**
   *
   * `Places` / `Collections` costs 56 px — 12% of the whole sheet at `half` — and while a place
   * detail is open it is the only thing between the card's one act and the fold: measured at
   * 390x844, `Been here` rested at 798-842 in a column that clips at 778, which is not one pixel
   * of it on screen. The host owns this because only the host knows what it drew above the
   * drawer's content.
   *
   * Passed with `PlaceSheet`'s `hostShowsViewSwitch`, and the two must agree: hiding the switch
   * without telling the sheet to stop subtracting it hangs 56 px of card off the bottom.
   */
  readonly sheetHidesViewSwitch?: boolean;

  // ---- chrome ----
  /** This scope's own create menu. Omitted lets `BottomNav` open the shared one itself. */
  readonly onAdd?: () => void;
  /** The library `BottomNav`'s own create menu should search, when this scope does not host one.
   *  Without it that menu answers "no matches" for places the user genuinely has. */
  readonly createMenuPlaces?: readonly MapPlace[];
  /** Chrome floating over the map's top band — `/map`'s post-import confirmation. Whatever goes
   *  here has to be paid for in `floatingTopChromePx` or the camera fits pins underneath it. */
  readonly floatingSlot?: ReactNode;
  /** A full takeover. While set, the sheet and the bar are unmounted — see this file's header. */
  readonly overlay?: ReactNode;
  /** A modal drawer that must outlive the sheet's unmount. See this file's header. */
  readonly modalSlot?: ReactNode;
  /** The one thing this document's single live region is saying. */
  readonly announcement?: string;
  /**
   * **Play the post-login entrance on this mount** (`I2-7`, `components/map/entrance.ts`).
   *
   * The shell's own beat is the sheet, and it is beat 4 of the owner's table verbatim — *"900 ms,
   * sheet rises to its stop"*. The sheet is mounted from the first render and **held at vaul's own
   * off-screen resting transform** (`translate3d(0, 100%, 0)`) until the beat, when it is given its
   * snap point and rises over vaul's 0.5 s transition. What the beat withholds is a position on
   * screen, not a mount — see this file's header for exactly what that buys on each viewport, which
   * is not the same thing on both.
   *
   * **Two things deliberately do not take it**, and both are the same rule — an entrance may not
   * withhold the way *out* of a surface or the *content* of one:
   *
   * - **`BottomNav`.** It is navigation.
   * - **The `lg+` panel.** Beat 4 names a *sheet*, and a desktop has none; the panel is where a
   *   desktop user reads their library. See its call site for the measurement that settled this.
   *
   * Passed straight through to the surface as well, where it drives the camera and the pins. A
   * scope with no entrance — `/collections/[id]` — omits it and renders exactly as it always did.
   */
  readonly entrance?: boolean;
}

export function MapShell({
  shell,
  places,
  initialBounds,
  restingStop,
  hoveredPlaceId,
  floatingTopChromePx,
  selectedPlace = null,
  selectedOcclusionFraction,
  summaries,
  onPlaceClick,
  onDeselect,
  onAreaClick,
  onCountryClick,
  onViewportChange,
  accessibleName,
  controlSlot,
  sheetContent,
  panelContent,
  views,
  sheetHidesViewSwitch = false,
  onAdd,
  createMenuPlaces,
  floatingSlot,
  overlay,
  modalSlot,
  announcement,
  entrance = false,
}: MapShellProps) {
  // `modal={false}` does not reach Radix through vaul 1.1.2. Left alone, the drawer hides `<main>`
  // from assistive technology, traps the keyboard below `lg`, and squats on the slot that lets a
  // genuine modal disable pointer events behind it. `non-modal-drawer.tsx` enumerates all five
  // behaviours the dropped prop gates and which of them still bite; the two halves of the repair
  // are the scope below and this ref.
  const releaseTabRef = useNonModalDrawerTabRelease();

  const restingFraction = restingSheetFractionFor(restingStop);
  /**
   * **Whether the sheet's beat has arrived.** `true` immediately for every scope that is not
   * playing an entrance.
   *
   * **It governs where the sheet *is*, never whether it exists.** See this file's header, `Mount
   * versus reveal`: the two list surfaces below are mounted on the first render regardless, and the
   * only thing this decides is whether the sheet has been given its snap point yet.
   */
  const sheetArrived = useEntranceBeat(ENTRANCE_BEATS.sheet, entrance);

  /**
   * The framing a mount used to give this scope for free, now that the map does not remount at a
   * route boundary. `restingStop` and `floatingTopChromePx` are in the key beside the pins because
   * they are the surface's fit padding: `/map` and `/collections` show the same thirty places and
   * frame them completely differently, one behind a peek strip and one behind a full-height sheet.
   * `persistent-map.tsx` has the filmstrip that established that.
   */
  const framingBudget = `${restingStop}|${floatingTopChromePx ?? 'default'}`;
  useAdoptionRefit(
    useMemo(() => places.map((place) => place.id), [places]),
    framingBudget,
    shell.camera.framePlaces,
  );

  return (
    <div className="relative h-full w-full">
      {/* **The map is not this component's to mount** (`I3-NAV`). It is rendered once, from the
          root layout, and each route borrows it — see `persistent-map.tsx` for the measurement that
          forced this and for what hoisting it costs. What stays here is the box it occupies and the
          props it is showing; the surface's own API is unchanged, which is why neither collections
          route needed a line. */}
      <PersistentMapSlot
        framingBudget={framingBudget}
        surface={{
          places,
          selected: selectedPlace,
          ...(onPlaceClick ? { onPlaceClick } : {}),
          ...(onDeselect ? { onDeselect } : {}),
          ...(selectedOcclusionFraction === undefined ? {} : { selectedOcclusionFraction }),
          ...(onViewportChange ? { onViewportChange } : {}),
          ...(initialBounds ? { initialBounds } : {}),
          ...focusProps(shell.focus),
          ...(summaries ? { summaries } : {}),
          ...(onAreaClick ? { onAreaClick } : {}),
          ...(onCountryClick ? { onCountryClick } : {}),
          ...(restingFraction === undefined ? {} : { restingSheetFraction: restingFraction }),
          ...(floatingTopChromePx === undefined ? {} : { floatingTopChromePx }),
          ...(accessibleName ? { accessibleName } : {}),
          ...(hoveredPlaceId === undefined ? {} : { hoveredPlaceId }),
          ...(controlSlot ? { controlSlot } : {}),
          ...(entrance ? { entrance } : {}),
        }}
      />

      {/* The list and the pins both change silently, so the one thing a screen reader user cannot
          perceive is how many places are left. Rendered here, once: only one of the sheet and the
          panel is ever in the accessibility tree (the other is `display: none` behind a
          breakpoint), but a single region cannot double-announce. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement ?? ''}
      </p>

      {floatingSlot}

      {overlay ? null : (
        <>
          <BottomNav
            {...(onAdd ? { onAdd } : {})}
            {...(createMenuPlaces ? { places: createMenuPlaces } : {})}
          />

          {/* At `full` the map is not meaningfully visible; a tap on the remaining strip collapses
              the sheet rather than reaching the map underneath. A non-modal drawer has no vaul
              overlay to repurpose, so this is the only thing standing in for that rule. */}
          {sheetArrived && shell.sheet.stop === 'full' && (
            <button
              type="button"
              aria-label="Collapse the places sheet"
              onClick={() => shell.sheet.setSnap(STOP_TO_SNAP.peek)}
              className="fixed inset-0 z-30 bg-transparent lg:hidden"
            />
          )}

          {/* **The sheet's beat, and it is the snap point rather than the mount.** vaul puts
              `Drawer.Content` at `translate3d(0, 100%, 0)` while it has no active snap point
              (`vaul/dist/index.mjs:62`, `[data-vaul-snap-points=true][data-vaul-drawer-direction=bottom]`,
              and `data-vaul-snap-points` is `isOpen && hasSnapPoints` at `:1402` — it does not
              depend on the active point) and transitions `transform` over 0.5 s. Withholding the
              *point* therefore buys the same rise the mount used to, with the sheet — and whatever
              `sheetContent` renders at the current stop, which at `peek` is one line rather than
              the list — already in the document and in the accessibility tree.

              `useControllableState` reads `prop !== undefined` (`vaul/dist/index.mjs:485`), so
              `null` is a controlled null rather than a fallback to `snapPoints[0]`; the effect at
              `:608` is guarded on `activeSnapPoint || activeSnapPointProp` and does not fire until
              the real point arrives, at which point `snapToPoint` sets the inline transform and the
              0.5 s transition runs. No second animation, and nothing for the entrance and the drag
              gesture to disagree about. `sheetArrived` is unconditionally `true` for a scope with no
              entrance.

              **`ENTRANCE_HOLD_STYLE` is the other half of the null and it is not optional** — see
              its own comment. Without it the sheet covers the whole phone one frame after mount,
              which was photographed before it was reasoned about. */}
          <Drawer.Root
            open
            modal={false}
            dismissible={false}
            snapPoints={SNAP_POINTS}
            activeSnapPoint={sheetArrived ? shell.sheet.snap : null}
            setActiveSnapPoint={shell.sheet.setSnap}
            snapToSequentialPoint
          >
            <NonModalDrawerScope>
              <Drawer.Portal>
                {/* `lg:hidden` — the panel below replaces this surface entirely above the
                    breakpoint; there is no drag, no snap points, no sheet chrome. */}
                <Drawer.Content
                  data-testid="place-sheet"
                  // Half two of the repair: Radix loops Tab inside `Drawer.Content` whether or not
                  // the dialog is modal, so the scope above is not enough on its own.
                  ref={releaseTabRef}
                  {...(sheetArrived ? {} : { style: ENTRANCE_HOLD_STYLE })}
                  className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[100dvh] flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-[var(--shadow-elevated)] outline-none lg:hidden"
                >
                  {/* **The handle, matrix row 10.** It was inert: a 36 px bar that said "this is a
                      sheet" and never acknowledged being touched. It now widens to 44 px and darkens
                      on hover and on press — the matrix's 34→44 — so the one affordance that moves
                      the whole surface responds like the rest of the product.

                      **`active:` rather than a drag-coupled state, and that is a checked fact rather
                      than a concession.** Spec 2 §2.1 row 10 allows coupling to a dragging state *if*
                      vaul exposes one on `Drawer.Content`, and says not to assert that it does without
                      looking. It does not: vaul 1.1.2 adds a **class**, `vaul-dragging`
                      (`node_modules/vaul/dist/index.mjs:452`, applied at :1057 and removed at :1217
                      and :1224), not a data attribute — so there is no `group-data-[…]` to couple to,
                      and reaching for it through an arbitrary class variant would be a bracket for a
                      50 ms difference. `active:` covers the press, which is the beat that matters.

                      `transition-[width,background-color]` and not `transition-all`: the handle sits
                      on a surface vaul transforms on every drag frame, and animating `transform` here
                      would fight the drag it is supposed to be acknowledging. */}
                  <Drawer.Handle
                    className={cn(
                      'mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border',
                      'motion-safe:transition-[width,background-color] motion-safe:duration-press motion-safe:ease-standard',
                      'hover:w-11 hover:bg-muted-foreground/40 active:w-11 active:bg-muted-foreground/60',
                      'focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
                    )}
                  />
                  {/* **Not at `peek`**, and `sheet-geometry.ts` subtracts its height at exactly the
                      two stops it renders at. The peek band is 128 px with a 68 px `BottomNav`
                      floating over its lower half, so it holds one line; the switch there would be
                      that line, and the count the peek row exists to say would have nowhere to go. */}
                  {shell.sheet.stop === 'peek' || sheetHidesViewSwitch ? null : (
                    <DrawerViewSwitch views={views} />
                  )}
                  {sheetContent(shell.sheet.stop)}
                </Drawer.Content>
              </Drawer.Portal>
            </NonModalDrawerScope>
          </Drawer.Root>
        </>
      )}

      {modalSlot}

      {/* A `pointer-events-auto` island inside a `pointer-events-none` full-bleed wrapper, so the
          map underneath stays reachable everywhere else. Its materials are the sign-in screen's
          desktop split rather than a two-column layout.

          **It takes no beat, and that is a correction rather than a preference.** It was given the
          sheet's, on the reasoning that it is what a desktop has instead of a sheet — but
          `iteration-2-plan.md` §2.2 ruling 2's beat 4 is *"the sheet rises to its stop"*, and at
          `lg+` there is no sheet: `Drawer.Content` above is `lg:hidden`. So the beat had no subject
          here, and what it actually governed was the only surface on which a desktop user can read
          their library. Measured at 1440×900 against `5c3d3a9`, that cost **2467 / 2613 / 2509 ms**
          — the clock's zero is the camera framing (~1.5 s), so the nominal 900 ms beat landed at
          ~2.5 s, and the same ruling's last sentence is *"it may not delay the map being usable"*.

          **If you are here because a beat looks missing on desktop: it is not, and this is not a
          trim of the owner's choreography.** The ruling is the owner's and nobody here may shorten
          it. Beats 1, 2, 3 and 5 all still play at `lg+`, and beat 4 still plays everywhere it has
          a subject. What stopped is applying *a sheet's* beat to something that is not a sheet —
          the desktop behaviour was never in the owner's table at all, it was a synthesis someone
          made by analogy. Restoring it would not restore a beat; it would re-hide the library for
          two and a half seconds.

          What it keeps is the `enter` rule, which is what it had before the entrance existed:
          `animate-in fade-in-0 duration-enter` with the 4 px displacement behind `motion-safe:`,
          exactly as `place-desktop-panel.tsx` and `place-sheet.tsx` already write it.
          `slide-in-from-left-2` and not `-bottom-1` because this panel's own edge is the left one —
          the displacement is along the axis the surface arrives on. */}
      <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
        <div
          data-testid="shell-panel"
          className="pointer-events-auto animate-in fade-in-0 duration-enter motion-safe:slide-in-from-left-2 absolute inset-y-0 left-0 flex w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 backdrop-blur-md"
        >
          {/* **The desktop's answer to `ui-review-2026-08-31.md` §1 finding 6**, which measured
              that a phone has a navigation model and a 1440 screen does not: `/collections` could
              reach the map and nothing else, and a collection could reach neither the map nor the
              profile. `BottomNav` is `lg:hidden`, so the switch in this panel is the only
              persistent navigation a desktop user has — and it is the same control, in the same
              order, with the same labels as the one in the sheet. One extra `pt-2` above it,
              because there is no drag handle here to hold it off the panel's top edge. */}
          <div className="pt-2">
            <DrawerViewSwitch views={views} />
          </div>
          {panelContent}
        </div>
      </div>

      {overlay}
    </div>
  );
}
