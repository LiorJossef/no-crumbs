'use client';

/**
 * **The collections side of the drawer, as props for the shell `/map` already owns.**
 *
 * This was `app/collections/collections-drawer-client.tsx`, a route client that mounted its own
 * `MapShell`. That is exactly what made switching between places and collections a remount: two
 * components on two segments, each with a drawer inside it. `_lib/drawer-view.ts` has the
 * measurement and the reasoning; the consequence for this file is that it no longer renders the
 * shell — it **describes** it, and `map-page-client.tsx` spreads what it returns over its own.
 *
 * ## What that buys, and the one rule it imposes
 *
 * The drawer, the vaul root, the sheet's stop and the live MapLibre instance all belong to the
 * mount, and the mount now spans every view. Switching is a `searchParams` navigation: the router
 * re-renders one page in place and nothing here is torn down.
 *
 * The rule is that **the hook below runs on every render of `/map`, including the places view**,
 * because hooks cannot be conditional. It returns `null` there and does almost nothing — the pins
 * memo short-circuits and the two effects are guarded — but anything expensive added here is paid
 * for on the product's main screen.
 *
 * ## What survives a view change, and what deliberately does not
 *
 * **Survives:** the sheet's stop, the camera, the `＋` menu, the shell's state cell.
 *
 * **Does not, on purpose:** the open place, the pushed pane, and the list's scroll position. Those
 * are facts about the collection you were in, and carrying them into a different collection would
 * be worse than losing them — see `scope` below, which is one render-phase reset rather than three
 * effects.
 *
 * ## Where the sheet rests, and the 63 %
 *
 * The collections views no longer choose a stop at all: `restingStop` belongs to the mount, so the
 * drawer stays wherever the user left it and a view change never resizes the sheet. What a *cold*
 * entry on a collections URL gets is `half`, chosen in `map-page-client.tsx`, and that is the fix
 * for `ui-review-2026-08-31.md` §1 finding 1. Measured at `c585ce7`, 390×844, with the fixture's
 * one collection: the sheet covered the whole screen, the map behind it was **0 %** visible, and
 * **534 px — 63.2 % of the viewport — was empty**. At `half` the map is 45 % of the screen, which
 * is the product and is content, and the band that remains is measured against 464 px rather than
 * 830. **Nothing was added to fill space** (`iteration-2-plan.md`): the `New collection` row was
 * already the last thing in the list and still is.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { type MapPlace } from '@/components/map/map-surface';
import { boundsOfPoints } from '@/components/map/bounds';
import type { LatLngBoundsHint } from '@/components/map/types';
import type { MapShellState } from '@/components/shell/use-map-shell';
import type { SheetStop } from '@/components/shell/sheet-geometry';
import {
  CollectionContent,
  type CollectionView,
} from '@/components/collections/collection-content';
import type { CollectionDetail, CollectionSummary } from '@/app/collections/_lib/get-collections';
import { CollectionsIndexList } from './collections-index-list';
import { ViewSwap } from '@/components/ui/view-swap';
import { collectionCanvasName, swapDirection, type DrawerView } from './_lib/drawer-view';

/** Exactly the `MapShell` props a collections view overrides. Nothing else about the shell changes
 *  between the three views, which is the claim this narrow type makes checkable. */
export interface CollectionsScope {
  readonly places: readonly MapPlace[];
  readonly initialBounds: LatLngBoundsHint | undefined;
  readonly accessibleName: string;
  readonly onPlaceClick: (place: MapPlace) => void;
  readonly sheetContent: (stop: SheetStop) => ReactNode;
  readonly panelContent: ReactNode;
}

export function useCollectionsScope({
  view,
  shell,
  collections,
  library,
  detail,
  currentUserId,
}: {
  readonly view: DrawerView;
  readonly shell: MapShellState;
  /** Every collection the caller is in. Read only on a collections view, so `/map` pays nothing. */
  readonly collections: readonly CollectionSummary[];
  /** The caller's saved places — the pins behind the index, and the picker's rows inside one. */
  readonly library: readonly MapPlace[];
  /** The open collection, or `null`. `/map`'s page 404s an id the caller cannot read, so `null`
   *  here means "not a collection view", never "not allowed". */
  readonly detail: CollectionDetail | null;
  readonly currentUserId: string;
}): CollectionsScope | null {
  const { camera, selectedId, setSelectedId } = shell;
  const router = useRouter();
  const active = view.kind !== 'places';

  /**
   * The per-collection state, reset **during render** when the drawer changes scope.
   *
   * React's own "adjust state when a prop changes" pattern, the same shape `useMapShell` uses
   * internally, and it is why there is no effect here. An effect would paint one frame of the new
   * collection wearing the old collection's open pane — a share panel over somebody else's list —
   * before correcting itself.
   *
   * Keyed on the whole view, not on the collection id, so leaving for the index or for the places
   * view resets it too.
   */
  const key = viewKey(view);
  /**
   * `from` is the view this one replaced, and it is here rather than in a ref for the reason the
   * reset below is here: **this cell is the only thing in the product that sees both sides of a
   * swap.** By the time anything renders, `view` is the new view and the old one is gone from every
   * prop on the page — but this state was written under the old one, so `scope.key` *is* the
   * previous view for exactly one render, which is the render that starts the animation.
   *
   * It survives every later render of the same view unchanged, which is what lets it be handed
   * down as a plain prop: `ViewSwap` reads the direction only at the swap.
   *
   * `null` on the first render of the page — a cold entry on a collections URL is an arrival, not
   * a swap. Note that the places view writes this cell too: the hook runs on every render of
   * `/map`, so entering collections from the places list is a swap this can see, even though the
   * places list itself is rendered by `map-page-client.tsx` and is not ours to animate out.
   *
   * **`view` is held beside `key` rather than parsed back out of it.** A first draft stored only
   * the string and recovered the view with a `viewKey` inverse; that is one fact in two encodings
   * with nothing keeping them in step, and the failure would have been a silently wrong *direction*
   * — the least likely thing anyone would look at. The object is already in hand at the moment the
   * cell is written, so keeping it costs a field and removes a function.
   */
  const [scope, setScope] = useState({
    key,
    view,
    from: null as DrawerView | null,
    pane: 'list' as CollectionView,
  });
  const swapping = scope.key !== key;
  if (swapping) {
    setScope({ key, view, from: scope.view, pane: 'list' });
    // The open place belongs to the view that was open. Clearing it also lets the shell put the
    // sheet back at its resting stop, which is where a newly entered scope should start.
    setSelectedId(null);
  }
  const pane = swapping ? 'list' : scope.pane;
  const direction = swapDirection(swapping ? scope.view : scope.from, view);

  /**
   * The pins. The library on the index — the user's own places as context behind a list of
   * collections — and the collection's items inside one.
   *
   * `itemId` is the pin id inside a collection, not the place id: it is what a pin click hands
   * back so the right row opens, and it is unique within a collection by construction.
   */
  const pins = useMemo(
    () => (!active ? null : detail === null ? library : detail.places.map(toMapPlace)),
    [active, detail, library],
  );
  const initialBounds = useMemo(() => (pins === null ? undefined : boundsOfPoints(pins)), [pins]);

  useRefitOnChange(pins, camera.framePlaces);

  /**
   * Entering a collection moves focus to the sheet's `<h2>` — `ux-collections-as-scope.md` §6,
   * because the list beneath it changed completely.
   *
   * Keyed on the collection's id rather than on a mount, and held in a ref rather than in state so
   * claiming it is not a render. The heading re-mounts every time a pushed pane closes, and that is
   * not a scope change; and the heading exists twice at once, in the sheet and in the `lg+` panel,
   * so the claim is what stops the hidden one taking the move and dropping it.
   */
  const focusedCollection = useRef<string | null>(null);
  const collectionId = detail?.id ?? null;
  const claimHeadingFocus = useCallback(() => {
    if (collectionId === null || focusedCollection.current === collectionId) return false;
    focusedCollection.current = collectionId;
    return true;
  }, [collectionId]);
  /**
   * **Leaving a collection releases the claim**, and this is the whole of what merging the routes
   * cost the focus move.
   *
   * The ref used to be reset for free: `/collections/[id]` was its own segment, so leaving
   * unmounted the component that held it. Nothing unmounts now, so *collection A → index →
   * collection A* would find the claim still held, refuse it, and leave focus wherever the tapped
   * row put it — silently, and only on the second visit, which is the shape of bug that survives a
   * demo.
   *
   * In an effect rather than in the render-phase reset above, because a ref written during render
   * is what React forbids. There is no ordering hazard: no other view has a claimer, so this runs
   * on the way *out* and the next entry's claim is a separate commit. Going straight from A to B
   * needs no reset — the ids already differ.
   */
  useEffect(() => {
    if (collectionId === null) focusedCollection.current = null;
  }, [collectionId]);

  /**
   * Tapping a place — from a row or from its pin.
   *
   * Framing a single place is a zero-area box, which `fitBounds` answers by zooming to its ceiling:
   * street level, which is what one place deserves. **A fresh array every time**, which
   * `camera.framePlaces` guarantees, so re-tapping the row you are already on flies again rather
   * than sitting there. Deselecting moves nothing: going back to the list is not a request to go
   * anywhere.
   */
  const selectItem = useCallback(
    (itemId: string | null) => {
      setSelectedId(itemId);
      if (itemId !== null) camera.framePlaces([itemId]);
    },
    [camera, setSelectedId],
  );

  const setPane = useCallback(
    (next: CollectionView) => setScope((current) => ({ ...current, pane: next })),
    [],
  );

  if (!active || pins === null) return null;

  const content = (stop?: SheetStop) =>
    detail === null ? (
      <CollectionsIndexList
        collections={collections}
        libraryIsEmpty={library.length === 0}
        {...(stop ? { stop } : {})}
        onExpand={() => shell.sheet.goTo('half')}
        idPrefix={stop ? 'sheet' : 'panel'}
      />
    ) : (
      <CollectionContent
        collection={detail}
        currentUserId={currentUserId}
        library={library}
        pins={pins}
        view={pane}
        {...(stop ? { stop } : {})}
        claimHeadingFocus={claimHeadingFocus}
        onExpand={() => shell.sheet.goTo('half')}
        onViewChange={(next) => {
          setPane(next);
          // Pushing a panel raises the sheet to full, from wherever it was. Measured at `half`: the
          // share panel is 862px against an 828px viewport, so the member list and `Replace link`
          // sit below the fold with nothing on screen suggesting there is more. A place's detail is
          // different and stays at `half` — the shell puts it there — because it is short, and
          // burying the map to read one card is the wrong trade.
          if (next === 'share' || next === 'add') {
            // Cleared so the shell is not holding a raise for a place nobody can see any more; the
            // pane replaces the detail rather than sitting on top of it (R32, and the two-layer
            // model in `ux-collections-as-scope.md` §2.1).
            setSelectedId(null);
            shell.sheet.goTo('full');
          }
        }}
        selectedItemId={selectedId}
        onSelectItem={selectItem}
      />
    );

  /**
   * The view change, at the motion scale's **view** tier — a shared axis, signed by direction.
   *
   * This was a `key` on a plain `<div>` wearing `ENTER_SCREEN`: correct in that the views share no
   * state worth carrying, and incomplete in that a `key` change drops the outgoing subtree **in the
   * same commit**. So the incoming list faded up over the sheet's own empty card, `index →
   * collection` and `collection → index` were the same 440 ms rise, and the one thing the eye
   * needed — the list it was already reading — was not on screen for any of it.
   *
   * `ViewSwap` holds it: for one 140 ms exit beat the outgoing view is still there, absolutely
   * positioned over the same box so nothing about the column's height depends on which of the two
   * is taller, sliding out the way the incoming one is sliding in. Read `components/ui/view-swap.tsx`
   * for the mechanism, what it took from SmoothUI's `shared-axis-x` and what it rejected.
   *
   * **What the direction actually says.** Going *further in* — places → the index, the index → a
   * collection — arrives from the right, which is where the switch's `Collections` tab and every
   * row's chevron already point. Coming *back out* arrives from the left. Two moves that mean
   * opposite things now look opposite, which is the whole of what a direction buys.
   *
   * **Scroll position is not carried across, and that is now a rule rather than a side effect.**
   * A `key` change used to lose it by construction; `ViewSwap` could preserve it and deliberately
   * does not. The list you are arriving at is a different list — a different collection's places,
   * or the index instead of a collection — so there is no offset in it that means anything about
   * where you were. What the swap *does* keep is the outgoing view's own offset for the length of
   * its exit: it is the same DOM, not a re-render, so it slides out exactly where you left it
   * rather than snapping to the top first. The one case worth naming is `collection → index`,
   * where the index's old offset is genuinely lost; at the sheet's `half` stop the index is one
   * screen of rows, so there is nothing there to restore yet, and a restore built now would be a
   * mechanism nobody can see working.
   *
   * Reduced motion is satisfied the way the whole scale satisfies it: the two fades carry no
   * prefix and both slides do, so `prefers-reduced-motion` gets a 300 ms cross-fade between two
   * still compositions — an opacity change, not nothing, and never a pulse.
   */
  const framed = (stop?: SheetStop) => (
    <ViewSwap viewKey={key} direction={direction} className="flex min-h-0 flex-1 flex-col">
      {content(stop)}
    </ViewSwap>
  );

  return {
    places: pins,
    initialBounds,
    /* **The canvas says what is on it.** The index shows the library; a collection shows the
       collection, by name and by count. */
    accessibleName:
      detail === null ? 'Your places' : collectionCanvasName(detail.name, detail.places.length),
    onPlaceClick:
      detail === null
        ? /* **On the index, a pin is a way to the place it draws.** It was inert, and that was
             defensible while the sheet rested at `full` and the map behind it was 0 % visible —
             nobody could reach a pin to be disappointed by. A visible pin that answers a tap with
             nothing is worse than no pin.

             It reveals the place on the places view rather than opening a detail here: that is the
             only view that draws a saved place's full detail, and every pin here is one of the
             caller's own saved rows carrying `savedPlaceId` (`_lib/to-map-place.ts`). A
             `searchParams` navigation, so it does not unmount anything either. */
          (place: MapPlace) => {
            const savedPlaceId = place.savedPlaceId ?? place.id;
            router.push(`/map?place=${encodeURIComponent(savedPlaceId)}` as '/map');
          }
        : (place: MapPlace) => {
            selectItem(place.id);
            setPane('place');
          },
    sheetContent: (stop: SheetStop) => framed(stop),
    panelContent: <div className="flex min-h-0 flex-1 flex-col">{framed()}</div>,
  };
}

/** One string per distinct drawer scope, for the state reset and the transition key. */
function viewKey(view: DrawerView): string {
  return view.kind === 'collection' ? `collection:${view.id}` : view.kind;
}

/**
 * Re-frames the map when the set of pins changes, and only then.
 *
 * `initialBounds` is a mount-time hint the surface deliberately does not keep in sync, so without
 * this, adding four places to an empty collection left the camera on the world view with the new
 * pins somewhere off in the Atlantic — the rows appeared and the map said nothing had happened. The
 * signature is the id set, not the array: `router.refresh()` hands back a fresh array of fresh
 * objects on every write, and framing on identity would fly the camera every time a shared note was
 * edited.
 *
 * **It is also what puts a collection's pins on the map now that opening one is not a mount.** The
 * route change used to re-frame for free, twice over — a new `MapSurface` on every hop until
 * `persistent-map.tsx`, then `useAdoptionRefit` on every scope adoption. Neither fires for a
 * search-param change inside one mount, and the id set is exactly what changed, so this is the one
 * that has to answer.
 *
 * `null` pins mean the places view, which owns its own camera and must not be touched from here.
 * The first non-null signature writes nothing, because `initialBounds` has already framed those.
 *
 * It reports into the shell's single focus slot rather than owning one of its own: a place tap
 * writes the same slot, and two slots would mean two flights racing on one camera.
 */
function useRefitOnChange(
  pins: readonly MapPlace[] | null,
  onRefit: (ids: readonly string[]) => void,
): void {
  const signature =
    pins === null
      ? null
      : pins
          .map((pin) => pin.id)
          .sort()
          .join(',');
  const previous = useRef<string | null>(null);

  // `onRefit` is in the deps rather than stashed in a ref, and that is safe rather than sloppy: the
  // signature guard below is what decides whether anything happens, so a caller that re-creates the
  // callback every render re-runs this effect and it does nothing. (Stashing it in a ref meant
  // writing that ref during render, which React forbids.)
  useEffect(() => {
    if (signature === null) return;
    const isFirst = previous.current === null;
    if (previous.current !== signature) {
      previous.current = signature;
      if (!isFirst && signature !== '') onRefit(signature.split(','));
    }
  }, [signature, onRefit]);
}

/**
 * A collection place as the map port wants it. `id` is the **collection item** id, not the place
 * id: it is what the pin's click has to hand back so the right row opens, and it is unique within a
 * collection by construction. `savedPlaceId` is deliberately absent — a collection's pins are not
 * the caller's saved rows, so a detail opened from one is read-only.
 *
 * `visited` is hard-coded false, and that is the privacy rule rather than a missing feature — a
 * collection never learns anybody's visit state, so no pin here can be drawn at the reduced
 * emphasis a visited one gets on the places view.
 */
function toMapPlace(place: CollectionDetail['places'][number]): MapPlace {
  return {
    id: place.itemId,
    name: place.name,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    note: place.note ?? '',
    sourceUrl: undefined,
    visited: false,
  };
}
