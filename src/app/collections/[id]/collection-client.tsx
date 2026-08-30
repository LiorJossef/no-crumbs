'use client';

/**
 * A collection, on the map — **the same shell `/map` renders, in a different scope.**
 *
 * It used to be a hand-built copy of that composition: its own `Drawer.Root`, its own desktop
 * panel, its own `MapSurface` call and its own declaration of every geometry constant.
 * `ux-collections-as-scope.md` ruled that a collection is a scope rather than a second app, and §5
 * items 8–11 are the deletions. What is left here is only what makes this scope different from
 * `/map`: which pins, which box to open on, where the sheet rests, and what goes in it.
 *
 * What is *not* shared with `/map` is its state: no active area (a collection is not geography, so
 * panning must never change what is listed), no tag chip, no been filter, no import overlay. The
 * only narrowing is the search box inside `CollectionContent`, and it never moves the camera.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { type MapPlace } from '@/components/map/map-surface';
import type { LatLngBoundsHint } from '@/components/map/types';
import { MapShell } from '@/components/shell/map-shell';
import { useMapShell } from '@/components/shell/use-map-shell';
import {
  CollectionContent,
  type CollectionView,
} from '@/components/collections/collection-content';
import type { CollectionDetail } from '@/app/collections/_lib/get-collections';
import { CollectionsContext, type CollectionsForPlace } from '@/ui/place/collections-context';

export function CollectionClient({
  collection,
  library,
  collections,
  currentUserId,
}: {
  collection: CollectionDetail;
  library: readonly MapPlace[];
  /** The caller's own editable collections, for the detail's `Add to a collection` row. Mounted
   *  here for the same reason `/map` mounts it: `PlaceDetail` reads it from a context rather than a
   *  prop, so the map surface never has to know what a collection is. */
  collections: CollectionsForPlace;
  currentUserId: string;
}) {
  const [view, setView] = useState<CollectionView>('list');
  /**
   * The sheet rests at `half` here, not on the peek strip, and that is the one thing the camera
   * has to know: more than half the map is permanently covered, so a fit that framed for a 128 px
   * strip puts the lowest pins under this sheet (`L2-COLL-CAM-2`). `restingStop` is the single
   * declaration of that fact — `restingSheetFractionFor` turns it into the camera's budget and
   * `STOP_TO_SNAP` into the drawer's opening position, so the two cannot disagree.
   */
  const shell = useMapShell({ restingStop: 'half' });
  const { camera, selectedId, setSelectedId } = shell;

  const pins = useMemo(() => collection.places.map(toMapPlace), [collection.places]);
  const initialBounds = useMemo(() => boundsOf(collection.places), [collection.places]);

  useRefitOnChange(pins, camera.framePlaces);

  /**
   * Tapping a place — from a row or from its pin.
   *
   * `/map` has always flown on this gesture (camera mover 3); this surface never wired it until
   * the owner reported it, and on a collection spanning more than one city the stranded macro view
   * made the tap appear to do nothing. Framing a single place is a zero-area box, which `fitBounds`
   * answers by zooming to its ceiling — street level, which is what one place deserves.
   *
   * **A fresh array every time**, which `camera.framePlaces` guarantees: the flight is keyed on
   * identity, so re-tapping the row you are already on flies again rather than sitting there.
   *
   * Deselecting moves nothing. Going back to the list is not a request to go anywhere. Raising the
   * sheet is the shell's job now — it rises to `half` when something opens and restores the stop it
   * came from when it closes, which is the same rule `/map` has always had.
   */
  function selectItem(itemId: string | null) {
    setSelectedId(itemId);
    if (itemId !== null) camera.framePlaces([itemId]);
  }

  const content = (stop?: Parameters<typeof CollectionContent>[0]['stop']) => (
    <CollectionContent
      collection={collection}
      currentUserId={currentUserId}
      library={library}
      pins={pins}
      view={view}
      {...(stop ? { stop } : {})}
      onViewChange={(next) => {
        setView(next);
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

  return (
    // The same provider `/map` mounts. Without it `AddToCollection` renders `null`, so a place
    // opened from a collection silently loses a control it has on the map — see R1.
    <CollectionsContext value={collections}>
      <MapShell
        shell={shell}
        places={pins}
        {...(initialBounds ? { initialBounds } : {})}
        restingStop="half"
        /* This scope puts **nothing** over the top edge of its map, and §3 of the ruling forbids it
           ever doing so — the scope is stated in the sheet's header, never as a floating chip. The
           camera used to be charged `/map`'s 100 px allowance anyway, and on a short container that
           phantom band was the whole overflow: at 640×360 the padding came to 394 px of a 360 px
           container, `clampFitPadding` scaled the box down, and the lowest pin landed under this
           sheet. If this scope ever grows floating top chrome, this is the number that grows. */
        floatingTopChromePx={0}
        /* No map-drawn detail here. These pins are collection items and carry no `savedPlaceId`, so
           the surface's `lg+` popover would render `PlaceDetail` with `savedPlace={null}` — losing
           the shared note, `Added by` and `Remove from this collection`, which is exactly what §4
           says a collection must add. The detail stays in the sheet and the panel, where it is
           complete. */
        selectedPlace={null}
        onPlaceClick={(place) => {
          selectItem(place.id);
          setView('place');
        }}
        /* The bar's own create menu, with this route's library in it. `/collections/[id]` already
           loads the caller's saved places for the picker, and an empty search there would deny
           places the user genuinely has and offer to save a duplicate. */
        createMenuPlaces={library}
        sheetContent={(stop) => content(stop)}
        panelContent={<div className="flex min-h-0 flex-1 flex-col pt-4">{content()}</div>}
      />
    </CollectionsContext>
  );
}

/**
 * Re-frames the map when the collection's set of places changes, and only then.
 *
 * `initialBounds` is a mount-time hint the surface deliberately does not keep in sync, so without
 * this, adding four places to an empty collection left the camera on the world view with the new
 * pins somewhere off in the Atlantic — the rows appeared and the map said nothing had happened. The
 * signature is the id set, not the array: `router.refresh()` hands back a fresh array of fresh
 * objects on every write, and framing on identity would fly the camera every time a shared note
 * was edited.
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

/** Frame all of the collection's places. Unlike `/map`, there is no anchor-area choice to make:
 *  a collection is small and hand-made, and seeing all of it is the point. */
function boundsOf(places: CollectionDetail['places']): LatLngBoundsHint | undefined {
  if (places.length === 0) return undefined;

  const lats = places.map((place) => place.lat);
  const lngs = places.map((place) => place.lng);

  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}
