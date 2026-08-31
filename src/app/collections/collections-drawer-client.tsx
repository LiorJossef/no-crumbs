'use client';

/**
 * **Collections, as two views of one drawer** — the index and one collection, on the same map, in
 * the same sheet, with the same camera.
 *
 * This replaces `collections-index-client.tsx` and `[id]/collection-client.tsx`, which were two
 * components on two route segments each mounting its own `MapShell`. `_lib/drawer-view.ts` has the
 * measurement that forced the merge; the short version is that a segment change unmounts the
 * drawer, and no amount of speed makes a new sheet animating up from the bottom of the screen look
 * like the same sheet.
 *
 * ## What survives a view change now, and what deliberately does not
 *
 * **Survives:** the vaul `Drawer.Root` and its `Drawer.Content`, the stop the user dragged the
 * sheet to, the live MapLibre instance (which already survived, via `persistent-map.tsx`), the
 * `＋` menu, and the shell's own state cell. Nothing is torn down, so nothing has to be rebuilt.
 *
 * **Does not, on purpose:** the open place, the pushed pane, and the list's scroll position. Those
 * are facts about the collection you were in, and carrying them into a different collection would
 * be worse than losing them — see `scope` below, which is one render-phase reset rather than three
 * effects.
 *
 * ## Where the sheet rests, and the 63 %
 *
 * `half`, in **both** views. The index rested at `full` until 2026-08-31, which is what
 * `ui-review-2026-08-31.md` §1 finding 1 measured: at 390x844 with the fixture's one collection,
 * the sheet covered the whole screen, the map behind it was **0 %** visible, and **534 px — 63.2 %
 * of the viewport — was empty** (re-measured here against `c585ce7`; the review said ≈536 px).
 *
 * Two things fix that and neither is an invented empty state. Resting at `half` puts 45 % of the
 * screen back on the map, which is the product and is content; and the band that remains is
 * whatever the list does not fill, against 464 px rather than 830. **`iteration-2-plan.md`'s rule
 * holds: nothing is added to fill space.** The `New collection` row was already the last thing in
 * the list and is still the last thing in the list.
 *
 * It is also the same stop the detail rests at, which means opening a collection does not resize
 * the sheet. A view change that moved the sheet would be a second animation to explain.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type MapPlace } from '@/components/map/map-surface';
import { boundsOfPoints } from '@/components/map/bounds';
import { MapShell } from '@/components/shell/map-shell';
import { useMapShell } from '@/components/shell/use-map-shell';
import {
  CollectionContent,
  type CollectionView,
} from '@/components/collections/collection-content';
import { CollectionsContext, type CollectionsForPlace } from '@/ui/place/collections-context';
import type { SheetStop } from '@/components/shell/sheet-geometry';
import { CollectionsIndexList } from './collections-index-list';
import {
  collectionCanvasName,
  collectionsHref,
  INDEX_VIEW,
  type DrawerView,
} from './_lib/drawer-view';
import type { CollectionDetail, CollectionSummary } from './_lib/get-collections';

export function CollectionsDrawerClient({
  view,
  collections,
  library,
  detail,
  memberships,
  currentUserId,
}: {
  /** Which view the URL asks for. Resolved on the server from `searchParams`, so the first paint
   *  is already the right view with no JavaScript involved. */
  readonly view: DrawerView;
  readonly collections: readonly CollectionSummary[];
  /**
   * The caller's own saved places. Three readers: the pins behind the index, the array the bar's
   * `＋` menu searches, and the picker inside a collection. Without it that menu answers "nothing
   * you've saved matches that" for places the user does have, and the only action left offers to
   * write a duplicate row and spend a Google Places lookup on it.
   */
  readonly library: readonly MapPlace[];
  /** The open collection, or `null` on the index. The route resolves `?collection=` and 404s an id
   *  the caller cannot read, so `null` here means "the index", never "not allowed". */
  readonly detail: CollectionDetail | null;
  /**
   * The caller's own editable collections, for a place detail's `Add to a collection` row —
   * `null` on the index, where no place detail is reachable and there is therefore nothing to say.
   * `AddToCollection` renders nothing for `null`, which is the honest answer; an empty object would
   * assert that the caller is in no collections.
   */
  readonly memberships: CollectionsForPlace | null;
  readonly currentUserId: string;
}) {
  const shell = useMapShell({ restingStop: 'half' });
  const { camera, selectedId, setSelectedId } = shell;

  /**
   * The per-collection state, reset **during render** when the drawer changes scope.
   *
   * React's own "adjust state when a prop changes" pattern, the same shape `useMapShell` uses
   * internally, and it is why there is no effect here. An effect would paint one frame of the new
   * collection wearing the old collection's open pane — a share panel over somebody else's list —
   * before correcting itself.
   *
   * `key` is the view, not the collection id, so leaving a collection for the index resets it too.
   */
  const key = viewKey(view);
  const [scope, setScope] = useState({ key, pane: 'list' as CollectionView });
  if (scope.key !== key) {
    setScope({ key, pane: 'list' });
    // The open place belongs to the collection that was open. Clearing it also lets the shell put
    // the sheet back at its resting stop, which is where a newly entered scope should start.
    setSelectedId(null);
  }
  const pane = scope.key === key ? scope.pane : 'list';

  /**
   * The pins. The library on the index — the user's own places as context behind a list of
   * collections — and the collection's items inside one.
   *
   * `itemId` is the pin id inside a collection, not the place id: it is what a pin click hands
   * back so the right row opens, and it is unique within a collection by construction.
   */
  const pins = useMemo(
    () => (detail === null ? library : detail.places.map(toMapPlace)),
    [detail, library],
  );
  const initialBounds = useMemo(() => boundsOfPoints(pins), [pins]);

  useRefitOnChange(pins, camera.framePlaces);

  /**
   * Entering a collection moves focus to the sheet's `<h2>` — `ux-collections-as-scope.md` §6,
   * because the list beneath it changed completely.
   *
   * Keyed on the collection's id rather than on a mount, and held in a ref rather than in state so
   * claiming it is not a render. The heading re-mounts every time a pushed pane closes, and that
   * is not a scope change; and the heading exists twice at once, in the sheet and in the `lg+`
   * panel, so the claim is what stops the hidden one taking the move and dropping it.
   */
  const focusedCollection = useRef<string | null>(null);
  const collectionId = detail?.id ?? null;
  const claimHeadingFocus = useCallback(() => {
    if (collectionId === null || focusedCollection.current === collectionId) return false;
    focusedCollection.current = collectionId;
    return true;
  }, [collectionId]);

  /**
   * Tapping a place — from a row or from its pin.
   *
   * Framing a single place is a zero-area box, which `fitBounds` answers by zooming to its
   * ceiling: street level, which is what one place deserves. **A fresh array every time**, which
   * `camera.framePlaces` guarantees, so re-tapping the row you are already on flies again rather
   * than sitting there.
   *
   * Deselecting moves nothing. Going back to the list is not a request to go anywhere.
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
   * The view change, as one opacity ramp.
   *
   * `key` remounts the subtree, which is correct — the two views share no state worth carrying —
   * and `animate-in fade-in-0` is what makes the swap read as a transition rather than as a
   * repaint. **Opacity only, and no `motion-safe:` displacement**, which satisfies the dispatch's
   * rule 3 at both motion settings rather than by branching: a single 0→1 ramp is the opacity
   * change reduced motion is supposed to collapse *to*, it is not a pulse, and there is no
   * translation to clip against a height-capped column.
   */
  const view0 = (stop?: SheetStop) => (
    <div key={key} className="animate-in fade-in-0 duration-enter flex min-h-0 flex-1 flex-col">
      {content(stop)}
    </div>
  );

  return (
    // The same provider `/map` mounts. Without it `AddToCollection` renders `null`, so a place
    // opened from a collection silently loses a control it has on the map — see R1.
    <CollectionsContext value={memberships}>
      <MapShell
        shell={shell}
        places={pins}
        {...(initialBounds ? { initialBounds } : {})}
        restingStop="half"
        /* Neither view puts **anything** over the top edge of this map, and §3 of the ruling forbids
           it ever doing so — the scope is stated in the sheet's header, never as a floating chip.
           The camera used to be charged `/map`'s 100 px allowance anyway, and on a short container
           that phantom band was the whole overflow: at 640×360 the padding came to 394 px of a
           360 px container, `clampFitPadding` scaled the box down, and the lowest pin landed under
           the sheet. If this scope ever grows floating top chrome, this is the number that grows. */
        floatingTopChromePx={0}
        /* No map-drawn detail in either view. A collection's pins are collection items and carry no
           `savedPlaceId`, so the surface's `lg+` popover would render `PlaceDetail` with
           `savedPlace={null}` — losing the shared note, `Added by` and `Remove from this
           collection`, which is exactly what §4 says a collection must add. On the index the pins
           are context behind a list of collections and a place detail has nowhere to go. Both
           details stay in the sheet and the panel, where they are complete. */
        selectedPlace={null}
        {...(detail === null
          ? {}
          : {
              onPlaceClick: (place: MapPlace) => {
                selectItem(place.id);
                setPane('place');
              },
            })}
        /* **The canvas says what is on it.** `ui-review-2026-08-31.md` §1 finding 3 measured this
           surface announcing itself as the bare word `Map` — the surface's own default, because
           neither collections route passed a name at all. The index shows the library; a collection
           shows the collection, by name and by count. */
        accessibleName={
          detail === null
            ? 'Your places'
            : collectionCanvasName(detail.name, detail.places.length)
        }
        createMenuPlaces={library}
        views={{
          current: 'collections',
          placesHref: '/map',
          /* Inside a collection this is also the way up: the tab is `current` and its href is the
             index, so pressing the segment you are already on goes one level out. */
          collectionsHref: collectionsHref(INDEX_VIEW),
        }}
        sheetContent={(stop) => view0(stop)}
        panelContent={<div className="flex min-h-0 flex-1 flex-col">{view0()}</div>}
      />
    </CollectionsContext>
  );
}

/** One string per distinct drawer scope, for the state reset and the transition key. */
function viewKey(view: DrawerView): string {
  return view.kind === 'index' ? 'index' : `collection:${view.id}`;
}

/**
 * Re-frames the map when the set of pins changes, and only then.
 *
 * `initialBounds` is a mount-time hint the surface deliberately does not keep in sync, so without
 * this, adding four places to an empty collection left the camera on the world view with the new
 * pins somewhere off in the Atlantic — the rows appeared and the map said nothing had happened.
 * The signature is the id set, not the array: `router.refresh()` hands back a fresh array of fresh
 * objects on every write, and framing on identity would fly the camera every time a shared note
 * was edited.
 *
 * **It is also what puts a collection's pins on the map now that opening one is not a mount.** The
 * route change used to re-frame for free, twice over — a new `MapSurface` on every hop until
 * `persistent-map.tsx`, then `useAdoptionRefit` on every scope adoption. Neither fires for a
 * search-param change inside one mount, and the id set is exactly what changed, so this is the one
 * that has to answer.
 *
 * Writes nothing on the first render, because `initialBounds` has already framed those.
 *
 * It reports into the shell's single focus slot rather than owning one of its own: a place tap
 * writes the same slot, and two slots would mean two flights racing on one camera.
 */
function useRefitOnChange(
  pins: readonly MapPlace[],
  onRefit: (ids: readonly string[]) => void,
): void {
  const signature = pins
    .map((pin) => pin.id)
    .sort()
    .join(',');
  const previous = useRef<string | null>(null);

  // `onRefit` is in the deps rather than stashed in a ref, and that is safe rather than sloppy: the
  // signature guard below is what decides whether anything happens, so a caller that re-creates the
  // callback every render re-runs this effect and it does nothing. (Stashing it in a ref meant
  // writing that ref during render, which React forbids.)
  useEffect(() => {
    const isFirst = previous.current === null;
    if (previous.current !== signature) {
      previous.current = signature;
      if (!isFirst && signature !== '') onRefit(signature.split(','));
    }
  }, [signature, onRefit]);
}

/**
 * A collection place as the map port wants it. `id` is the **collection item** id, not the place
 * id: it is what the pin's click has to hand back so the right row opens, and it is unique within
 * a collection by construction. `savedPlaceId` is deliberately absent — see `selectedPlace` above.
 *
 * `visited` is hard-coded false, and that is the privacy rule rather than a missing feature — a
 * collection never learns anybody's visit state, so no pin here can be drawn at the reduced
 * emphasis a visited one gets on `/map`.
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
