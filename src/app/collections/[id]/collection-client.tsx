'use client';

/**
 * A collection, on the map.
 *
 * The composition is `/map`'s, deliberately: the same MapLibre surface, the same three-stop sheet
 * on a phone, the same left panel at `lg+`. A shared list of seven Jaffa restaurants you cannot see
 * spatially is a note in a chat app; the same seven as pins is a plan, and that is the whole reason
 * a collection is a route rather than a filter chip.
 *
 * What is *not* shared with `/map` is its state: no active area (a collection is not geography, so
 * panning must never change what is listed), no tag chip, no been filter, no import overlay. The
 * only narrowing is the search box, and it never moves the camera.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';

import { MapSurface, type MapPlace } from '@/components/map/map-surface';
import type { LatLngBoundsHint } from '@/components/map/types';
import { useNonModalBackground } from '@/components/sheet/use-non-modal-background';
import { CollectionContent, type CollectionView } from '@/components/collections/collection-content';
import type { CollectionDetail } from '@/app/collections/_lib/get-collections';
import { PEEK_PX, RESTING_SHEET_FRACTION } from './sheet-geometry';

/**
 * The sheet's stops and the camera's resting fraction, **imported rather than redeclared**.
 *
 * They were declared in both places until now: `sheet-geometry.ts` held the copy
 * `tests/unit/collections/collection-map-geometry.test.ts` asserts on, and this file held the copy
 * that actually ran. Change the fraction here and the test went on passing against the stale one —
 * the exact trapdoor the comment on `RESTING_SHEET_FRACTION` describes having already fallen
 * through once, left open one level up. A camera constant with two sources of truth and a test
 * pointed at the wrong one is worse than no test.
 */
const PEEK_STOP = `${PEEK_PX}px` as const;

const RESTING_SNAP: number = RESTING_SHEET_FRACTION;

const SNAP_POINTS: Array<`${number}px` | number> = [PEEK_STOP, RESTING_SHEET_FRACTION, 1];

/** This surface puts **nothing** over the top edge of its map: no account chip, no post-import
 *  strip, no floating filter row — its whole UI is the sheet below `lg` and the left panel at
 *  `lg+`, and MapLibre's own controls sit bottom-right. Declaring that is not cosmetic. The camera
 *  used to be charged `/map`'s 100 px allowance anyway, and on a short container that phantom band
 *  was the whole overflow: at 640×360 (a landscape Pixel/Galaxy) the padding came to 394 px of a
 *  360 px container, `clampFitPadding` scaled the box down, and the lowest pin landed under this
 *  sheet — measured in a browser, its tip at 163 px against a sheet top of 162 px, and 10 px under
 *  at 568×320. At zero the same fit is 294 px of 360, never reaches the clamp, and every pin clears
 *  the sheet by the full 48 px. If this surface ever grows floating top chrome, this is the number
 *  that has to grow with it. */
const FLOATING_TOP_CHROME_PX = 0;

export function CollectionClient({
  collection,
  library,
  currentUserId,
}: {
  collection: CollectionDetail;
  library: readonly MapPlace[];
  currentUserId: string;
}) {
  const [view, setView] = useState<CollectionView>('list');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [snap, setSnap] = useState<number | string | null>(RESTING_SNAP);

  const pins = useMemo(() => collection.places.map(toMapPlace), [collection.places]);
  const initialBounds = useMemo(() => boundsOf(collection.places), [collection.places]);
  /**
   * **The one thing that moves the camera after the initial framing**, and it now has two writers
   * rather than one — the same single-slot design `/map` uses, for the same reason: the surface
   * keys the flight on the array's *identity*, so whoever writes last wins and a re-render that
   * changes nothing cannot re-fly.
   *
   * Writer 1 is `useRefitOnChange` — the collection's membership changed.
   * Writer 2 is `selectItem` — somebody tapped a place, and see below.
   */
  const [focusPlaceIds, setFocusPlaceIds] = useState<readonly string[] | null>(null);
  useRefitOnChange(pins, setFocusPlaceIds);

  // Same reason `PlaceSheet` calls it: `modal={false}` does not reach Radix through vaul 1.1.2, so
  // without this the drawer hides the entire page from assistive technology.
  useNonModalBackground(true);

  /**
   * **Writer 2, and the fix for the bug the owner reported**: tapping a row in a collection left the
   * camera exactly where it was. On a collection spanning more than one city that is a stranded
   * macro view — you tap a restaurant in London and the map goes on showing the whole United
   * Kingdom, so the pin you asked for is a dot among dots and the tap appears to have done nothing.
   *
   * `/map` has always flown on this gesture (`selectPlace`, camera mover 3); this surface simply
   * never wired it. Framing a single place is a zero-area box, which `fitBounds` answers by zooming
   * to its `FIT_BOUNDS_MAX_ZOOM` ceiling — street level, which is what a single place deserves.
   *
   * A **fresh array every time**, deliberately: the flight is keyed on identity, so re-tapping the
   * row you are already on flies again rather than sitting there doing nothing. Tapping a pin also
   * routes through here, and flying to a pin the user can already see is not wasted — it is what
   * lifts it clear of the sheet and out of the macro view.
   *
   * Deselecting (`null`) moves nothing. Going back to the list is not a request to go anywhere.
   */
  function selectItem(itemId: string | null) {
    setSelectedItemId(itemId);
    if (itemId === null) return;
    setFocusPlaceIds([itemId]);
    // A place is worth reading at half, not through the peek slot.
    if (snap === PEEK_STOP) setSnap(RESTING_SNAP);
  }

  const content = (
    <CollectionContent
      collection={collection}
      currentUserId={currentUserId}
      library={library}
      pins={pins}
      view={view}
      onViewChange={(next) => {
        setView(next);
        // Pushing a panel raises the sheet to full, from wherever it was. Measured at `half`: the
        // share panel is 862px against an 828px viewport, so the member list and `Replace link`
        // sit below the fold with nothing on screen suggesting there is more — the panel barely
        // scrolls, so it does not even look scrollable. A place's detail is different and stays at
        // `half`: it is short, and burying the map to read one card is the wrong trade.
        if (next === 'share' || next === 'add') setSnap(1);
        else if (next === 'place' && snap === PEEK_STOP) setSnap(RESTING_SNAP);
      }}
      selectedItemId={selectedItemId}
      onSelectItem={selectItem}
    />
  );

  return (
    <div className="relative h-full w-full">
      <MapSurface
        places={pins}
        onPlaceClick={(place) => {
          selectItem(place.id);
          setView('place');
        }}
        {...(initialBounds ? { initialBounds } : {})}
        {...(focusPlaceIds ? { focusPlaceIds } : {})}
        restingSheetFraction={RESTING_SHEET_FRACTION}
        floatingTopChromePx={FLOATING_TOP_CHROME_PX}
      />

      {/* Mobile: the same drag sheet `/map` uses. */}
      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        snapPoints={SNAP_POINTS}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        snapToSequentialPoint
      >
        <Drawer.Portal>
          <Drawer.Content
            data-testid="collection-sheet"
            className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[100dvh] flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-[var(--shadow-elevated)] outline-none lg:hidden"
          >
            <Drawer.Handle className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border" />
            {content}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Desktop: the same left panel, same width, same treatment. */}
      <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
        <div className="pointer-events-auto absolute inset-y-0 left-0 flex w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 pt-4 backdrop-blur-md">
          {content}
        </div>
      </div>
    </div>
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
 * It reports into the caller's single focus slot rather than owning one of its own: a place tap
 * writes the same slot, and two slots would mean two flights racing on one camera.
 */
function useRefitOnChange(
  pins: readonly MapPlace[],
  onRefit: (ids: readonly string[]) => void,
): void {
  const signature = pins.map((pin) => pin.id).sort().join(',');
  const previous = useRef<string | null>(null);

  // `onRefit` is in the deps rather than stashed in a ref, and that is safe rather than sloppy: the
  // signature guard below is what decides whether anything happens, so a caller that re-creates the
  // callback every render re-runs this effect and it does nothing. (Stashing it in a ref meant
  // writing that ref during render, which React forbids — it is exactly the read-your-own-write
  // hazard that makes a concurrent re-render see a callback from a tree that was thrown away.)
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
 * a collection by construction.
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
