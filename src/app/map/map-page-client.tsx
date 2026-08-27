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
 * and the short version is that setting the query would fire `useSearchFlight` and move a camera
 * the owner has asked nobody to touch (`current-state.md` §0.1b). Composition is AND, applied in
 * one expression: tag first, then search, then the viewport for the list only. **Tapping a chip is
 * not a camera mover** — the enumerated list below stays at seven.
 *
 * ## The map is the query (L1-F5-T2, `docs/ux-map-is-the-query.md`)
 *
 * This file now owns a second, prior narrowing: **the list is exactly what is inside the map's
 * viewport.** Before, the sheet listed the whole library however the camera was pointed and its
 * header read `20 places saved` — a number, about nowhere, that did not move when the map did.
 * That is what made the map read as decoration: it was a scoping control wired to nothing.
 *
 * There are therefore three derived lists here and they are deliberately not the same one:
 *
 *  - **`matches`** — the library narrowed by the filters the user set (the tag chip, then the
 *    search box). This is what the **pins** show. Narrowing the pins by the viewport would be
 *    circular: the viewport is *defined* by where the pins are, and a pin cannot disappear for
 *    being off screen when being off screen is exactly what panning back would fix.
 *  - **`inView`** — `matches` whose pin anchor is inside the query rect the surface reports.
 *    This is what the **list** shows, sorted nearest-to-centre first so the top of the list is the
 *    pins the eye is already on.
 *  - **`places`** — the whole library, used for the initial camera anchor, for the escapes
 *    (`Show my places`), and for nothing else. Its count is displayed nowhere.
 *
 * **The initial camera anchors on one cluster, never all of them.** Fitting every saved place put
 * 12 London and 8 Tel Aviv places into one box, which is a continental view of Europe and North
 * Africa: two cluster bubbles, no individual pins, no readable name. `domain/places/clusters.ts`
 * groups on coordinates (never on the `locality` string — the library holds three spellings for two
 * cities) and picks the anchor: the cluster holding the most recently saved place, else the largest.
 * `getSpots` already returns `created_at desc`, so `places[0]` is that most recent save and no new
 * query was needed for it.
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
import type { LatLngBoundsHint } from '@/components/map/types';
import { ImportConfirmation } from '@/components/map/import-confirmation';
import { PlaceSheet } from '@/components/sheet/place-sheet';
import { PlaceDesktopPanel } from '@/components/sheet/place-desktop-panel';
import { filterByTag, filterPlaces } from '@/components/map/filter-places';
import { isSearchActive } from '@/domain/places/search';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import { TagFilterContext, isSameTag, type TagFilter } from '@/ui/place/tag-filter';
import {
  clusterByProximity,
  haversineKm,
  pickAnchorCluster,
  type GeoCluster,
} from '@/domain/places/clusters';
import {
  areaLabel,
  boundsCentre,
  sortByDistanceFromCentre,
  viewportHeading,
  withinBounds,
} from '@/ui/place/viewport';
import { ImportPageClient, type SaveOutcomeDetail } from '@/app/import/import-page-client';

/** How long the typing has to settle before the result count is announced to a screen reader.
 *  Without it a `polite` live region reads a new count on every keystroke, which is worse than
 *  silence — the user cannot hear the field they are typing into. */
const ANNOUNCE_AFTER_MS = 500;

/** How long the typing has to settle before the camera flies to the results. Long enough that
 *  every keystroke of `restaurant` is not a separate flight; short enough that the move still
 *  reads as the answer to what was typed. */
const FLY_AFTER_MS = 450;

export function MapPageClient({ places }: { places: readonly MapPlace[] }) {
  const [selected, setSelected] = useState<MapPlace | null>(null);
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
   * **The authorised camera movers, enumerated here because `06` §9.2 lists four and there are
   * now seven.** `L1-F5-T2` owed this reconciliation and this comment is it. In the order they were
   * added:
   *
   *  1. The initial framing — now the *anchor cluster*, not the whole library (see the header).
   *  2. A finished import flies to the places it saved.
   *  3. A settled search flies to its matches.
   *  4. Selecting a place from the list flies to that place.
   *  5. Clearing the search returns to the nearest cluster (not the whole library — that is the
   *     continental view this feature exists to kill).
   *  6. `Show my places`, from an empty viewport, fits the cluster nearest the current centre.
   *  7. `Show all matches`, from an empty viewport during a search, fits the library-wide matches.
   *
   * Movers 5–7 are new here. All of them go through this one piece of state rather than growing a
   * mechanism each, so the existing guards apply unchanged. What is *not* a camera mover, and must
   * never become one: panning (the user is already moving it), and the list changing under a pan.
   */
  const [focusPlaceIds, setFocusPlaceIds] = useState<readonly string[] | null>(null);
  /**
   * The map's query rect — what is on screen, inset by the chrome that permanently covers it. The
   * surface reports this on a debounced `moveend` (`ux-map-is-the-query.md` §4: the list settles,
   * it never tracks a moving thumb), and `null` until the map has settled once.
   *
   * `null` deliberately means "show everything" rather than "show nothing". A list that starts
   * empty for the few hundred milliseconds before the map loads reads exactly like a broken
   * feature, and on a slow connection it reads like one for a lot longer.
   */
  const [viewport, setViewport] = useState<LatLngBoundsHint | null>(null);

  /** Every cluster in the library, for the initial camera anchor and for the escapes. Keyed on
   *  `places`, so an import re-clusters once rather than on every render. */
  const clusters = useMemo(() => clusterByProximity(places, (place) => place), [places]);

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
  const initialBounds = useMemo(() => {
    const recentId = places[0]?.id;
    const anchor = pickAnchorCluster(clusters, {
      ...(recentId ? { recentItemId: recentId } : {}),
      toId: (place) => place.id,
    });
    return anchor?.bounds;
  }, [clusters, places]);

  /** The library narrowed by the active tag chip, before the search box sees it. Its own `useMemo`
   *  rather than one fused expression so that typing does not re-run the tag pass and tapping a
   *  chip does not re-run it per keystroke. */
  const tagMatches = useMemo(() => filterByTag(places, activeTag), [places, activeTag]);

  /** The library narrowed by **both** filters. This is what the **pins** show — never narrowed by
   *  the viewport, which would be circular. The list is this same array narrowed again by the
   *  viewport below, so the pins and the rows can never disagree about what the filters did. */
  const matches = useMemo(() => filterPlaces(tagMatches, query), [tagMatches, query]);

  /** What the **list** shows: the matches inside the query rect, nearest the centre of the map
   *  first. Falls back to every match while the map has not reported a rect yet. */
  const inView = useMemo(() => {
    if (!viewport) return matches;
    const inside = matches.filter((place) => withinBounds(place, viewport));
    return sortByDistanceFromCentre(inside, boundsCentre(viewport), (place) => place);
  }, [matches, viewport]);

  // Both narrowings feed the header's noun, so a tag-filtered list reads `3 matches in London`
  // rather than `3 places in London`. `ux-map-is-the-query.md` §2.2's string matrix says the noun
  // changes "exactly when a second filter is applied"; a chip is a second filter, and no new string
  // is invented for it.
  const filtering = isSearchActive(query) || activeTag !== null;
  const heading = useMemo(
    () => viewportHeading(inView.length, areaLabel(inView.map(toViewportPlace)), filtering),
    [inView, filtering],
  );

  // A place filtered out by a **filter** must not stay open in the detail view: its pin is gone
  // from the map, so the sheet (or the map's popover) would be showing detail for something the user
  // can no longer see or dismiss by tapping. Adjusted during render rather than in an effect —
  // React's own pattern for "a prop/derived value invalidated some state" — and it converges
  // immediately, because after the reset the guard is false.
  //
  // Deliberately guarded on `matches` and NOT on `inView`: panning a selected place off the
  // edge of the screen would otherwise slam its detail shut mid-gesture, which is the map taking
  // something away from the user for looking somewhere else.
  //
  // A tag chip never reaches this guard, because `toggleTag` deselects first and the place the chip
  // came from carries the tag anyway. It stays written against the general case rather than the
  // search case: two filters feed `matches` now, and a guard that only names one of them is a
  // guard someone will later assume does not apply.
  if (selected && !matches.some((place) => place.id === selected.id)) {
    setSelected(null);
  }

  const announcement = useResultAnnouncement(query, activeTag, matches.length);
  useSearchFlight(query, matches, clusters, viewport, setFocusPlaceIds);

  /**
   * Fit the cluster nearest the centre of the current viewport — the escape from an empty viewport
   * (`Show my places`), and where clearing a search lands.
   *
   * Nearest cluster rather than the whole library, and that is the whole point: fitting every
   * cluster reproduces the continental two-bubbles-no-pins view this feature exists to remove. A
   * button labelled `Show my places` that produced it would undo the feature it ships beside.
   */
  const showNearestCluster = useCallback(() => {
    if (clusters.length === 0) return;
    const from = viewport ? boundsCentre(viewport) : null;
    const nearest = from
      ? clusters.reduce((best, cluster) =>
          haversineKm(boundsCentre(cluster.bounds), from) <
          haversineKm(boundsCentre(best.bounds), from)
            ? cluster
            : best,
        )
      : clusters[0];
    if (nearest) setFocusPlaceIds(nearest.members.map((place) => place.id));
  }, [clusters, viewport]);

  /** The escape from `No matches in this area`: go to the matches wherever they are. */
  const showAllMatches = useCallback(() => {
    if (matches.length > 0) setFocusPlaceIds(matches.map((place) => place.id));
  }, [matches]);

  /**
   * Selecting a place from the list — the entry point `PlaceRow` gained at `L1-F7-T2`, because the
   * map's pins are painted into a canvas and were therefore unreachable by keyboard.
   *
   * It moves the camera, and that is not incidental. On desktop the detail opens in the map's own
   * pin-anchored popover, so selecting a place outside the current viewport produced a popover
   * clamped to the edge of the map pointing at nothing — observed at 1440×900 with the camera over
   * Europe and the selected place in Tel Aviv. The list is the only way to reach a place you cannot
   * currently see, so it has to bring that place into view.
   *
   * **This is a sixth camera mover, and `06` §9.2 lists four.** The fifth (a settled search) is
   * already recorded as a loose end in `current-state.md` §3.9 for `L1-F5-T2` to adopt or replace;
   * this one goes in the same list rather than being slipped in quietly. It is also the most
   * defensible of the three additions: the user asked to look at exactly this place.
   *
   * It reuses `focusPlaceIds` rather than growing a second mechanism, so the existing guards apply
   * unchanged — the flight is keyed on array identity (a fresh array per selection, so re-selecting
   * the same place does fly again), it is capped by `FIT_BOUNDS_MAX_ZOOM` so a single point cannot
   * zoom to the rooftops, and a resize re-fits what was framed rather than the whole library.
   */
  function selectPlace(place: MapPlace) {
    setSelected(place);
    setFocusPlaceIds([place.id]);
  }

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
    setSelected(null);
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
          onPlaceClick={setSelected}
          selected={selected}
          onDeselect={() => setSelected(null)}
          onViewportChange={setViewport}
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
            places={inView}
            heading={heading}
            libraryIsEmpty={places.length === 0}
            hasMatchesElsewhere={matches.length > 0}
            onShowNearest={showNearestCluster}
            onShowAllMatches={showAllMatches}
            query={query}
            onQueryChange={setQuery}
            activeTag={activeTag}
            onClearTag={clearTag}
            selected={selected}
            onDeselect={() => setSelected(null)}
            onAddTikTok={openImport}
            onSelect={selectPlace}
          />
        )}
        <PlaceDesktopPanel
          places={inView}
          heading={heading}
          libraryIsEmpty={places.length === 0}
          hasMatchesElsewhere={matches.length > 0}
          onShowNearest={showNearestCluster}
          onShowAllMatches={showAllMatches}
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

/**
 * Flies the camera to the search results once the typing settles.
 *
 * It exists because of what searching actually looked like without it: with the map framed on
 * London, typing `tel aviv` filtered the list to eight places and the map to zero pins — the list
 * and the map answering the same question differently, which is the exact failure the lifted
 * `query` was meant to prevent. Even inside one city it showed: `kiaans` left its two pins clipped
 * against the bottom edge.
 *
 * Three rules, and the second and third are what stop it being annoying:
 *
 *  - **Only after the typing stops.** Every keystroke of a long word would otherwise be its own
 *    flight.
 *  - **Never on mount.** `searched === null` means the user has not typed anything yet, so the
 *    automatic whole-library framing is left entirely alone. This hook must not be the thing that
 *    frames the map on first load.
 *  - **Never for a query that matches nothing.** There is no such thing as a bounding box of no
 *    places; the camera stays where it is, and the "Nothing matches …" copy carries the message.
 *
 * Clearing the field is a real decision too, not the absence of one: it returns to the cluster
 * nearest where the camera is now. Without it, clearing a search that had zoomed into one street
 * leaves the user on that street with nineteen pins off screen. It used to frame the *whole
 * library*, which since `L1-F5-T2` is exactly the continental view the anchor-cluster camera exists
 * to remove — so clearing a search would have undone the framing rule on every use.
 */
function useSearchFlight(
  query: string,
  matches: readonly MapPlace[],
  clusters: readonly GeoCluster<MapPlace>[],
  viewport: LatLngBoundsHint | null,
  requestFlight: (ids: readonly string[]) => void,
): void {
  // The query the camera was last moved for. `null` until the user has searched at all — which is
  // not the same as `''`, and the difference is the whole "never on mount" rule.
  const [searched, setSearched] = useState<string | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (searched === null && trimmed === '') return;
    if (searched === trimmed) return;

    const timer = setTimeout(() => {
      setSearched(trimmed);
      const target = trimmed === '' ? nearestClusterMembers(clusters, viewport) : matches;
      if (target.length > 0) requestFlight(target.map((place) => place.id));
    }, FLY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [trimmed, searched, matches, clusters, viewport, requestFlight]);
}

/** The members of the cluster nearest the centre of the current viewport, or the first cluster when
 *  the map has not reported one yet. Empty when there are no places at all. */
function nearestClusterMembers(
  clusters: readonly GeoCluster<MapPlace>[],
  viewport: LatLngBoundsHint | null,
): readonly MapPlace[] {
  if (clusters.length === 0) return [];
  const from = viewport ? boundsCentre(viewport) : null;
  if (!from) return clusters[0]?.members ?? [];
  const nearest = clusters.reduce((best, cluster) =>
    haversineKm(boundsCentre(cluster.bounds), from) < haversineKm(boundsCentre(best.bounds), from)
      ? cluster
      : best,
  );
  return nearest.members;
}

/** A pin projected onto what the header needs: the city name, off the `Spot` the pin carries. */
function toViewportPlace(place: MapPlace): { locality: string | null } {
  return { locality: place.detail?.locality ?? null };
}
