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
 */

import type { ReactNode } from 'react';
import { Drawer } from 'vaul';

import { MapSurface, type MapPlace } from '@/components/map/map-surface';
import { ENTRANCE_BEATS, useEntranceBeat } from '@/components/map/entrance';
import type { LatLngBoundsHint, MapSummaries, ViewportChangeMeta } from '@/components/map/types';
import { BottomNav } from '@/components/nav/bottom-nav';
import { useNonModalBackground } from '@/components/sheet/use-non-modal-background';
import {
  SNAP_POINTS,
  STOP_TO_SNAP,
  restingSheetFractionFor,
  type SheetStop,
} from './sheet-geometry';
import { focusProps, type MapShellState } from './use-map-shell';
import { cn } from '@/lib/utils';

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
   * snap point and rises over vaul's 0.5 s transition. So the list is in the document, and in the
   * accessibility tree, the whole time; what the beat withholds is a position on screen.
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
  onAdd,
  createMenuPlaces,
  floatingSlot,
  overlay,
  modalSlot,
  announcement,
  entrance = false,
}: MapShellProps) {
  // `modal={false}` does not reach Radix through vaul 1.1.2, so without this the drawer marks
  // `<main>` `aria-hidden` and hides the whole application from assistive technology. Called here,
  // once, rather than in each sheet — see `use-non-modal-background.ts` for the measurement.
  useNonModalBackground(true);

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

  return (
    <div className="relative h-full w-full">
      <MapSurface
        places={places}
        selected={selectedPlace}
        {...(onPlaceClick ? { onPlaceClick } : {})}
        {...(onDeselect ? { onDeselect } : {})}
        {...(selectedOcclusionFraction === undefined ? {} : { selectedOcclusionFraction })}
        {...(onViewportChange ? { onViewportChange } : {})}
        {...(initialBounds ? { initialBounds } : {})}
        {...focusProps(shell.focus)}
        {...(summaries ? { summaries } : {})}
        {...(onAreaClick ? { onAreaClick } : {})}
        {...(onCountryClick ? { onCountryClick } : {})}
        {...(restingFraction === undefined ? {} : { restingSheetFraction: restingFraction })}
        {...(floatingTopChromePx === undefined ? {} : { floatingTopChromePx })}
        {...(accessibleName ? { accessibleName } : {})}
        {...(hoveredPlaceId === undefined ? {} : { hoveredPlaceId })}
        {...(controlSlot ? { controlSlot } : {})}
        {...(entrance ? { entrance } : {})}
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
              *point* therefore buys the same rise the mount used to, with the sheet's whole content
              already in the document.

              `useControllableState` reads `prop !== undefined` (`vaul/dist/index.mjs:485`), so
              `null` is a controlled null rather than a fallback to `snapPoints[0]`; the effect at
              `:608` is guarded on `activeSnapPoint || activeSnapPointProp` and does not fire until
              the real point arrives, at which point `snapToPoint` sets the inline transform and the
              0.5 s transition runs. No second animation, and nothing for the entrance and the drag
              gesture to disagree about. `sheetArrived` is unconditionally `true` for a scope with no
              entrance. */}
          <Drawer.Root
            open
            modal={false}
            dismissible={false}
            snapPoints={SNAP_POINTS}
            activeSnapPoint={sheetArrived ? shell.sheet.snap : null}
            setActiveSnapPoint={shell.sheet.setSnap}
            snapToSequentialPoint
          >
            <Drawer.Portal>
              {/* `lg:hidden` — the panel below replaces this surface entirely above the
                  breakpoint; there is no drag, no snap points, no sheet chrome. */}
              <Drawer.Content
                data-testid="place-sheet"
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
                {sheetContent(shell.sheet.stop)}
              </Drawer.Content>
            </Drawer.Portal>
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

          What it keeps is the `enter` rule, which is what it had before the entrance existed:
          `animate-in fade-in-0 duration-enter` with the 4 px displacement behind `motion-safe:`,
          exactly as `place-desktop-panel.tsx` and `place-sheet.tsx` already write it.
          `slide-in-from-left-2` and not `-bottom-1` because this panel's own edge is the left one —
          the displacement is along the axis the surface arrives on. */}
      <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
        <div className="pointer-events-auto animate-in fade-in-0 duration-enter motion-safe:slide-in-from-left-2 absolute inset-y-0 left-0 flex w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 backdrop-blur-md">
          {panelContent}
        </div>
      </div>

      {overlay}
    </div>
  );
}
