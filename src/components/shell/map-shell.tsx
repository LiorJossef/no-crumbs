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
 */

import type { ReactNode } from 'react';
import { Drawer } from 'vaul';

import { MapSurface, type MapPlace } from '@/components/map/map-surface';
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
}

export function MapShell({
  shell,
  places,
  initialBounds,
  restingStop,
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
}: MapShellProps) {
  // `modal={false}` does not reach Radix through vaul 1.1.2, so without this the drawer marks
  // `<main>` `aria-hidden` and hides the whole application from assistive technology. Called here,
  // once, rather than in each sheet — see `use-non-modal-background.ts` for the measurement.
  useNonModalBackground(true);

  const restingFraction = restingSheetFractionFor(restingStop);

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
        {...(controlSlot ? { controlSlot } : {})}
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
          {shell.sheet.stop === 'full' && (
            <button
              type="button"
              aria-label="Collapse the places sheet"
              onClick={() => shell.sheet.setSnap(STOP_TO_SNAP.peek)}
              className="fixed inset-0 z-30 bg-transparent lg:hidden"
            />
          )}

          <Drawer.Root
            open
            modal={false}
            dismissible={false}
            snapPoints={SNAP_POINTS}
            activeSnapPoint={shell.sheet.snap}
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
                <Drawer.Handle className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border" />
                {sheetContent(shell.sheet.stop)}
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </>
      )}

      {modalSlot}

      {/* A `pointer-events-auto` island inside a `pointer-events-none` full-bleed wrapper, so the
          map underneath stays reachable everywhere else. Its materials are the sign-in screen's
          desktop split rather than a two-column layout. */}
      <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
        <div className="pointer-events-auto absolute inset-y-0 left-0 flex w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 backdrop-blur-md">
          {panelContent}
        </div>
      </div>

      {overlay}
    </div>
  );
}
