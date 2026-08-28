'use client';

/**
 * Client seam between the map (`MapSurface`, an uncontrolled imperative surface) and the surfaces
 * that present saved places around it: `PlaceSheet` (mobile, a three-stop drag sheet,
 * `src/components/sheet/place-sheet.tsx`), `PlaceDesktopPanel` (`lg+`, the persistent left list,
 * always showing the list — `src/components/sheet/place-desktop-panel.tsx`), and now the map
 * surface itself, which renders a pin-anchored popover with the selected place's detail at `lg+`
 * (`MapSurfaceMapcn`'s `MapPopup`). `selected` is lifted here rather than into `map/page.tsx` (a
 * server component) or down into the map, because it is the one piece of state the map's pin-tap
 * callback and every presentation surface needs — per `docs/ux-architecture.md` §1.5, this state
 * is client-only and never a URL in this slice.
 *
 * All three surfaces render unconditionally and switch on Tailwind breakpoints alone (`lg:hidden` /
 * `hidden lg:block`) rather than a JS media-query hook, so there is no hydration-mismatch risk and
 * no behavioural branching here — below `lg` only `PlaceSheet` shows detail; at `lg+` only the
 * map's own popover does, and `PlaceDesktopPanel` never reacts to `selected` at all.
 *
 * `query` (L1-F6-T2) is lifted here for the same reason and a sharper one: it filters the **pins**
 * as well as the list. A search that narrowed the sheet while the map went on showing all twenty
 * pins would be worse than no search at all — the two surfaces would be answering different
 * questions about the same library. So the filter is applied exactly once, here.
 * `domain/places/search.ts` owns what matches.
 *
 * `activeTag` is lifted here for exactly that reason and no other. It is a **second filter
 * dimension**, not text written into `query`; `src/ui/place/tag-filter.ts` carries the argument,
 * and the short version is that a tag is a second dimension, not text. Composition is AND: tag
 * first, then search, then the active area for the list only. Tapping a chip is not a camera
 * mover.
 *
 * ## The list is an area, not a rectangle (`docs/ux-stable-area-list.md`)
 *
 * This file owns a second, prior narrowing, and 2026-08-28 changed what it narrows *by*. The list
 * used to be "every saved place whose pin is inside the map's query rect". The owner used that and
 * rejected it: `21 places in this area` became `9 places in this area` with nobody touching the
 * map, because the camera moves for reasons the user never asked for — inertia, a `ResizeObserver`
 * re-fit, a `fitBounds` once the container finally measures, a flight to a pin. A row that left was
 * gone, and the only way back was to reproduce a camera position by hand.
 *
 * The coupling was right; the granularity was wrong. **The unit of scope is now a place, not a
 * rectangle**: an *area* is a ~50 km coordinate cluster of the user's own saves, and the map says
 * which of your areas you are in. Pan and zoom freely inside one and nothing changes at all. Cross
 * into another of your areas with a real gesture and the list switches, which is the only moment it
 * may. `ui/place/active-area.ts` owns every rule; this file owns the state and the wiring.
 *
 * **The one rule: narrowing never navigates.** The search box and the tag chip narrow what is
 * listed and can never move the camera or change the active area. That is why the settled-search
 * camera flight is gone from this file: searching `tel aviv` from London now reads
 * `No matches in London` with `Tel Aviv-Yafo · 8 matches ›` directly beneath it, one tap away,
 * instead of throwing the camera across the Mediterranean on a 450 ms timer.
 *
 * There are therefore three derived lists here and they are deliberately not the same one:
 *
 *  - **`matches`** — the library narrowed by the filters the user set (the tag chip, then the
 *    search box). This is what the **pins** show, everywhere, so a pin never disappears for being
 *    off screen when being off screen is exactly what panning back would fix.
 *  - **`inArea`** — `matches` that belong to the active area, in library order (most recently saved
 *    first). This is what the **list** shows, and its order never changes on pan, zoom or resize.
 *  - **`places`** — the whole library, used to build the areas and for the initial camera anchor.
 *    Its count is displayed nowhere.
 *
 * **The initial camera anchors on one area, never all of them.** Fitting every saved place put 12
 * London and 9 Tel Aviv places into one box, which is a continental view of Europe and North
 * Africa: two cluster bubbles, no individual pins, no readable name. `domain/places/clusters.ts`
 * groups on coordinates (never on the `locality` string — the library holds four spellings for two
 * cities) and picks the anchor: the cluster holding the most recently saved place, else the largest.
 * `getSpots` already returns `created_at desc`, so `places[0]` is that most recent save.
 *
 * `showImport` is the same pattern one level up: "Add a TikTok" (in both `PlaceSheet` and
 * `PlaceDesktopPanel`) used to be a `router.push('/import')` — a real route change that unmounts
 * the map entirely, which is glaring at desktop widths where `/import` has no map behind it to
 * float over. `ImportPageClient` now renders as an overlay sibling here instead, so the map stays
 * mounted (and its camera untouched, L1-F1-T4) exactly like place detail already does. The real
 * `/import` route (`src/app/import/page.tsx`) is untouched and still renders the same component
 * directly for a mid-import refresh or direct navigation (L1-F2-T3's resume requirement) — this is
 * a second entry point onto the same client component, not a replacement for the route.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapSurface, type MapPlace } from '@/components/map/map-surface';
import type { LatLngBoundsHint, ViewportChangeMeta } from '@/components/map/types';
import { ImportConfirmation } from '@/components/map/import-confirmation';
import { PlaceSheet } from '@/components/sheet/place-sheet';
import { PlaceDesktopPanel } from '@/components/sheet/place-desktop-panel';
import { filterByTag, filterPlaces } from '@/components/map/filter-places';
import { isSearchActive } from '@/domain/places/search';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import { TagFilterContext, isSameTag, type TagFilter } from '@/ui/place/tag-filter';
import { clusterByProximity, pickAnchorCluster } from '@/domain/places/clusters';
import {
  anchorFor,
  areaAfterCameraSettled,
  areaHeading,
  buildAreas,
  elsewhereRows,
  resolveArea,
  type Area,
  type AreaRow,
} from '@/ui/place/active-area';
import { ImportPageClient, type SaveOutcomeDetail } from '@/app/import/import-page-client';

/** How long the typing has to settle before the result count is announced to a screen reader.
 *  Without it a `polite` live region reads a new count on every keystroke, which is worse than
 *  silence — the user cannot hear the field they are typing into. */
const ANNOUNCE_AFTER_MS = 500;

export function MapPageClient({ places }: { places: readonly MapPlace[] }) {
  /**
   * The **id** of the open place, never the object.
   *
   * Holding the `MapPlace` itself made the detail view a snapshot: a Server Action calls
   * `revalidatePath('/map')`, `places` arrives as a fresh array of fresh objects, the list re-renders
   * — and the popover keeps rendering the copy it captured when the pin was tapped. Measured
   * 2026-08-28: changing a place's category updated its row to `Bar` while the open panel went on
   * saying `Dessert` until the user reselected it. The same staleness was there for the note and for
   * anything else a Server Action writes; the category editor is only what made it visible.
   *
   * Deriving from `matches` rather than from `places` also retires a render-phase `setSelected(null)`
   * that existed to close the detail when a filter removed its place: a place that is not in
   * `matches` now simply has no `selected` to render.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState('');
  /** The one tag narrowing the library, as stored (lowercase, normalised), or `null`. Set by a chip
   *  in any place's detail view through `TagFilterContext`, cleared by the pill above the list, by
   *  tapping the same chip again, or by starting an import. */
  const [activeTag, setActiveTag] = useState<string | null>(null);
  /**
   * What the last import saved. Two jobs, both of which the flow was missing entirely: it frames
   * the camera on the places that were just added (`focusPlaceIds`), and it is the only thing on
   * screen that says the import worked. Cleared on dismissal, and also when a new import starts,
   * so a stale "8 places added" can never sit over a fresh run.
   */
  const [lastImport, setLastImport] = useState<SaveOutcomeDetail | null>(null);
  /**
   * The one thing that moves the camera after the initial framing: "frame exactly these places".
   * A single piece of state rather than one per caller, because the map keys the flight on the
   * array's *identity* — so whoever wrote last wins, and a re-render that changes nothing cannot
   * re-fly. It is deliberately never cleared: dismissing the post-import confirmation used to
   * switch this prop back to something else, which the map reads as a brand-new request and
   * answers by throwing the camera across the world.
   *
   * **The authorised camera movers, and there are now exactly four.** `06` §9.2 listed four, this
   * file grew to seven, and `docs/ux-stable-area-list.md` cut it back — the reconciliation `06`
   * §9.2 was owed is this comment. In the order they run:
   *
   *  1. The initial framing — the *anchor area*, not the whole library (see the header).
   *  2. A finished import flies to the places it saved.
   *  3. Selecting a place from the list flies to that place, and **holds** the active area.
   *  4. Tapping an `Elsewhere` row flies to that area, and is the one gesture that sets it by hand.
   *
   * Three are gone, all of them for the same reason — narrowing must never navigate. A settled
   * search no longer flies to its matches, clearing the search no longer returns to a cluster, and
   * `Show my places` / `Show all matches` no longer exist: the state they escaped (a viewport with
   * nothing in it) cannot occur when the list is an area rather than a rectangle. What is *not* a
   * camera mover, and must never become one: panning, zooming, typing, and tapping a tag chip.
   */
  const [focusPlaceIds, setFocusPlaceIds] = useState<readonly string[] | null>(null);
  /**
   * **Which of the user's areas the list is showing**, held as the id of a place inside it rather
   * than a cluster index — clusters are rebuilt on every library change and carry no id of their
   * own, so an anchor place survives an import landing in the area and a deletion from it.
   *
   * `null` means "not chosen yet", and the anchor area below fills in. It has exactly four writers,
   * enumerated on `focusPlaceIds` above: the initial resolution, an `Elsewhere` row tap, a finished
   * import, and a settled *user pan* that crossed a boundary. It is never re-derived from settled
   * bounds, which is what stops the camera rewriting the list on its own.
   */
  const [activeAreaAnchor, setActiveAreaAnchor] = useState<string | null>(null);

  /** Every cluster in the library. Keyed on `places`, so an import re-clusters once rather than on
   *  every render. */
  const clusters = useMemo(() => clusterByProximity(places, (place) => place), [places]);

  /** The clusters as *areas* — labelled, indexed by member id, memoised once per library so the
   *  header's city name is stable for the session rather than recomputed per render. */
  const areas = useMemo(
    () =>
      buildAreas(clusters, {
        toId: (place: MapPlace) => place.id,
        toPoint: (place: MapPlace) => place,
        toLocality: (place: MapPlace) => place.detail?.locality ?? null,
      }),
    [clusters],
  );

  /**
   * Where the camera opens. The cluster holding the most recently saved place, else the largest —
   * never the box around all of them. `places` arrives `created_at desc` from `getSpots`, so
   * `places[0]` is the most recent save.
   *
   * There is no persisted last-camera hint yet; `pickAnchorCluster` accepts one and the resolution
   * order in `ux-map-is-the-query.md` starts with it, but persisting a camera across sessions is a
   * separate decision about storing a user's location in their browser, and it is not this task's
   * to take quietly.
   */
  const anchorCluster = useMemo(() => {
    const recentId = places[0]?.id;
    return pickAnchorCluster(clusters, {
      ...(recentId ? { recentItemId: recentId } : {}),
      toId: (place: MapPlace) => place.id,
    });
  }, [clusters, places]);

  const initialBounds = anchorCluster?.bounds;

  /**
   * **Writer 1 of `activeAreaAnchor`**: the area the camera opened on, resolved once the library
   * arrives, and again if the anchored place is ever deleted out from under it.
   *
   * Derived during render rather than in an effect — `resolveArea` returning `null` is exactly
   * React's "a prop invalidated some state" case, and it converges immediately because after the
   * write the lookup succeeds. Doing it in an effect would paint one frame of the wrong list.
   */
  const resolved = resolveArea(areas, activeAreaAnchor);
  const activeArea: Area<MapPlace> | null =
    resolved ??
    (anchorCluster ? (areas.find((area) => area.memberIds.has(anchorCluster.members[0]?.id ?? '')) ?? null) : null);
  if (resolved === null && activeArea !== null && activeAreaAnchor !== activeArea.id) {
    setActiveAreaAnchor(anchorFor(activeArea));
  }

  /** The library narrowed by the active tag chip, before the search box sees it. Its own `useMemo`
   *  rather than one fused expression so that typing does not re-run the tag pass and tapping a
   *  chip does not re-run it per keystroke. */
  const tagMatches = useMemo(() => filterByTag(places, activeTag), [places, activeTag]);

  /** The library narrowed by **both** filters. This is what the **pins** show — never narrowed by
   *  the viewport, which would be circular. The list is this same array narrowed again by the
   *  viewport below, so the pins and the rows can never disagree about what the filters did. */
  const matches = useMemo(() => filterPlaces(tagMatches, query), [tagMatches, query]);

  /**
   * What the **list** shows: the matches that belong to the active area, in library order — most
   * recently saved first.
   *
   * The order is the library's and never the camera's. The nearest-the-centre sort this replaced
   * was a child of the viewport binding: distance from a map centre is not a fact about the world,
   * and re-ordering rows under a pan is the same instability as removing them, one row at a time.
   * Distance belongs to near-me (`L1-F11`), where it is distance from *you*.
   *
   * Falls back to every match while there is no area yet — the single frame before the library
   * resolves, and the empty-library case.
   */
  const inArea = useMemo(
    () => (activeArea ? matches.filter((place) => activeArea.memberIds.has(place.id)) : matches),
    [matches, activeArea],
  );

  /** The other areas, with what the current filters left in each. Empty when the user has one area,
   *  which is the common case and renders no section at all. */
  const otherAreas: readonly AreaRow[] = useMemo(
    () => elsewhereRows(areas, activeArea?.id ?? null, new Set(matches.map((place) => place.id))),
    [areas, activeArea, matches],
  );

  // Both narrowings feed the header's noun, so a tag-filtered list reads `3 matches in London`
  // rather than `3 places in London`. `ux-map-is-the-query.md` §2.2's string matrix says the noun
  // changes "exactly when a second filter is applied"; a chip is a second filter, and no new string
  // is invented for it.
  const filtering = isSearchActive(query) || activeTag !== null;
  const heading = useMemo(
    () =>
      areaHeading({
        countInArea: inArea.length,
        area: activeArea?.label ?? null,
        searchQuery: query.trim(),
        tagLabel: activeTag === null ? null : tagDisplayLabel(activeTag),
        matchesAnywhere: matches.length,
      }),
    [inArea, activeArea, query, activeTag, matches],
  );

  // The open place, resolved against the *current* server data on every render — which is what makes
  // an edit visible in the panel the user made it in. See `selectedId`.
  //
  // Resolved against `matches`, not `places`, and that carries a behaviour that used to be a
  // render-phase `setSelected(null)`: a place filtered out by a **filter** must not stay open, since
  // its pin is gone from the map and the detail would be showing something the user can no longer
  // see or dismiss by tapping. Now it simply does not resolve.
  //
  // Deliberately `matches` and NOT `inArea`: crossing into another area would otherwise slam the
  // open detail shut mid-gesture, which is the map taking something away from the user for looking
  // somewhere else.
  const selected: MapPlace | null =
    selectedId === null ? null : (matches.find((place) => place.id === selectedId) ?? null);

  const announcement = useResultAnnouncement(query, activeTag, matches.length);

  /** Camera mover 3. A fresh array each time, because the flight is keyed on array identity — so
   *  re-selecting the same place does fly again. The active area is deliberately not touched. */
  function selectPlace(place: MapPlace) {
    setSelectedId(place.id);
    setFocusPlaceIds([place.id]);
  }

  /** Writer 2 and camera mover 4: the only gesture that picks an area by hand. */
  const selectArea = useCallback(
    (areaId: string) => {
      const area = areas.find((candidate) => candidate.id === areaId);
      if (!area) return;
      setActiveAreaAnchor(area.id);
      setSelectedId(null);
      setFocusPlaceIds(area.members.map((place) => place.id));
    },
    [areas],
  );

  /**
   * Writer 4. `userInitiated` is the whole guard: every programmatic camera move reports `false`,
   * so a re-fit, the initial framing or a flight to a pin structurally cannot rewrite the list.
   */
  const handleViewportChange = useCallback(
    (bounds: LatLngBoundsHint, meta: ViewportChangeMeta) => {
      setActiveAreaAnchor((current) =>
        areaAfterCameraSettled({
          areas,
          currentId: resolveArea(areas, current)?.id ?? current,
          rect: bounds,
          userInitiated: meta.userInitiated,
        }),
      );
    },
    [areas],
  );

  /**
   * A chip tap. The active tag turns the filter off, any other tag replaces it — one tap either
   * way, which is the whole interaction.
   *
   * **It deselects, and that is the point.** The chip lives in a place's detail view, so without
   * this the user taps `Hidden Gem` and keeps looking at the one place they already had open while
   * the answer to what they just asked sits behind it. Deselecting drops them onto the filtered
   * list on mobile and closes the map popover on desktop. It is a state change, not a camera
   * change: `setSelected(null)` touches no camera mover, and neither does `setActiveTag`.
   */
  const toggleTag = useCallback((tag: string) => {
    setActiveTag((current) => (current !== null && isSameTag(current, tag) ? null : tag));
    setSelectedId(null);
  }, []);

  const clearTag = useCallback(() => setActiveTag(null), []);

  /** Memoised so every chip in the tree does not re-render on an unrelated state change — the
   *  context value is the only thing standing between this page's state and a leaf in the map's
   *  own popover. */
  const tagFilter = useMemo<TagFilter>(
    () => ({ activeTag, onToggleTag: toggleTag }),
    [activeTag, toggleTag],
  );

  function openImport() {
    setLastImport(null);
    // An import that lands places the current filters exclude would save them into an invisible
    // list and fly the camera at pins that are filtered out. Starting an import is the user leaving
    // the current narrowing behind, so both dimensions go with it.
    setQuery('');
    setActiveTag(null);
    setShowImport(true);
  }

  return (
    // Every chip in every tree below reads its state from here — the sheet's detail, and the map's
    // own pin-anchored popover, which is rendered inside `components/map/**` and would otherwise
    // need a filter prop threaded through a surface whose job is cameras and pins.
    <TagFilterContext value={tagFilter}>
      <div className="relative h-full w-full">
        <MapSurface
          places={matches}
          // Selection only — tapping a pin must not move the camera under the finger that tapped
          // it. `selectPlace` (camera mover 3) is for the list, where the pin may be off-screen.
          onPlaceClick={(place) => {
            setSelectedId(place.id);
          }}
          selected={selected}
          onDeselect={() => {
            setSelectedId(null);
          }}
          onViewportChange={handleViewportChange}
          {...(initialBounds ? { initialBounds } : {})}
          {...(focusPlaceIds ? { focusPlaceIds } : {})}
        />

        {/* The list and the pins both change silently as the user types, so the one thing a screen
            reader user has no way to perceive is how many places are left. Rendered here, once, rather
            than inside each surface: only one of the two is ever in the accessibility tree (the other
            is `display: none` behind a breakpoint), but a single region cannot double-announce. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {lastImport && (
          <ImportConfirmation
            saved={lastImport.saved}
            alreadySaved={lastImport.alreadySaved}
            skipped={lastImport.skipped}
            onDismiss={() => setLastImport(null)}
          />
        )}
        {/* `PlaceSheet` is mobile-only (its content is `lg:hidden`) and rendered through a vaul
            portal, which appends to `document.body` *after* this component's own subtree — so at
            matched z-indices it paints on top of anything rendered here, regardless of DOM/JSX
            order. That's invisible normally (the sheet coexists with the map fine), but it means
            the sheet cannot simply share a z-index with the import overlay below: unmounting it
            while the overlay is open is the only way to guarantee mobile gets the same opaque,
            edge-to-edge takeover the standalone `/import` route always had, with no "Your places"
            list bleeding through behind/around it. Desktop is unaffected — `PlaceDesktopPanel`
            below is a plain (non-portaled) sibling that the overlay's higher z-index already
            paints over correctly. */}
        {!showImport && (
          <PlaceSheet
            places={inArea}
            heading={heading}
            otherAreas={otherAreas}
            onSelectArea={selectArea}
            libraryIsEmpty={places.length === 0}
            filtering={filtering}
            query={query}
            onQueryChange={setQuery}
            activeTag={activeTag}
            onClearTag={clearTag}
            selected={selected}
            onDeselect={() => {
            setSelectedId(null);
          }}
            onAddTikTok={openImport}
            onSelect={selectPlace}
          />
        )}
        <PlaceDesktopPanel
          places={inArea}
          heading={heading}
          otherAreas={otherAreas}
          onSelectArea={selectArea}
          libraryIsEmpty={places.length === 0}
          filtering={filtering}
          query={query}
          onQueryChange={setQuery}
          activeTag={activeTag}
          onClearTag={clearTag}
          onAddTikTok={openImport}
          onSelect={selectPlace}
        />
        {showImport && (
          <ImportPageClient
            onClose={() => setShowImport(false)}
            onSaved={(outcome) => {
              setLastImport(outcome);
              setFocusPlaceIds(outcome.savedPlaceIds);
              // Writer 3. Resolves itself once the refreshed rows arrive, so this does not wait
              // on the data.
              const first = outcome.savedPlaceIds[0];
              if (first) setActiveAreaAnchor(first);
            }}
          />
        )}
      </div>
    </TagFilterContext>
  );
}

/**
 * The search's result count, as a sentence, delayed until the typing stops. Returns `''` while the
 * field is empty so the region says nothing at all on first load and says nothing again the moment
 * the search is cleared.
 *
 * The count announced is **library-wide**, not the number in view, and this region stays
 * search-driven only (`ux-map-is-the-query.md` §7.1). A viewport-driven count in a live region would
 * speak on every pan, pinch and camera flight, which is not an accessibility feature — it is a way
 * to make the page unusable with a screen reader on. The library-wide number is also the fact the
 * *typing* produced, and it does not churn as the camera moves afterwards.
 */
function useResultAnnouncement(
  query: string,
  activeTag: string | null,
  matchCount: number,
): string {
  // The query the stored sentence describes is kept with it, and the sentence is only returned
  // while the two still agree. That is what stops the previous search's result being read out
  // during the first half-second of the next one: clearing the field and typing again leaves a
  // perfectly formed, entirely stale sentence in state, and a live region would happily announce it.
  const [announced, setAnnounced] = useState({ filter: '', message: '' });
  const trimmed = query.trim();
  // One key for both dimensions, so a stale sentence about the previous *tag* is discarded on the
  // same rule that already discards a stale one about the previous query. `\u0000` because it is the
  // one character neither a query nor a stored tag can contain.
  const filter = `${activeTag ?? ''}\u0000${trimmed}`;

  useEffect(() => {
    if (activeTag === null && trimmed === '') return;
    const timer = setTimeout(() => {
      setAnnounced({ filter, message: filterSentence(trimmed, activeTag, matchCount) });
    }, ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [filter, trimmed, activeTag, matchCount]);

  return announced.filter === filter ? announced.message : '';
}

/**
 * The library-wide result of whatever is currently narrowing it, as one sentence.
 *
 * A chip tap changes the list and the pins silently, exactly as typing does, so it earns the same
 * announcement. The tag is named with `tagDisplayLabel` rather than its stored form: `hidden gem`
 * read aloud as the sentence's own words would be indistinguishable from the rest of it, and the
 * user tapped something that said `Hidden Gem`.
 */
function filterSentence(query: string, activeTag: string | null, count: number): string {
  const noun = count === 1 ? 'place' : 'places';
  if (activeTag === null) {
    return count === 0
      ? `No places match ${query}.`
      : `${count} ${noun} ${count === 1 ? 'matches' : 'match'} ${query}.`;
  }
  const label = tagDisplayLabel(activeTag);
  if (query === '') {
    return count === 0 ? `No places tagged ${label}.` : `${count} ${noun} tagged ${label}.`;
  }
  return count === 0
    ? `No places tagged ${label} match ${query}.`
    : `${count} ${noun} tagged ${label} ${count === 1 ? 'matches' : 'match'} ${query}.`;
}
