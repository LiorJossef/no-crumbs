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
 * questions about the same library. So the filter is applied exactly once, here, and the result is
 * the `places` all three surfaces receive; `totalCount` rides alongside so a filtered list can say
 * `3 of 20` instead of claiming the user has three places. `domain/places/search.ts` owns what
 * matches.
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

import { useEffect, useMemo, useState } from 'react';
import { MapSurface, type MapPlace } from '@/components/map/map-surface';
import { ImportConfirmation } from '@/components/map/import-confirmation';
import { PlaceSheet } from '@/components/sheet/place-sheet';
import { PlaceDesktopPanel } from '@/components/sheet/place-desktop-panel';
import { filterPlaces } from '@/components/map/filter-places';
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
   * Two writers today — a finished import, and a settled search (`useSearchFlight`). `L1-F5-T2`
   * owns the authorised-camera-mover list and has to reconcile the second one; the alternative
   * while it waits is a search that says "8 places" over a map showing none of them, which is the
   * list and the map disagreeing about the same library.
   */
  const [focusPlaceIds, setFocusPlaceIds] = useState<readonly string[] | null>(null);

  const visiblePlaces = useMemo(() => filterPlaces(places, query), [places, query]);

  // A place filtered out of the list must not stay open in the detail view: the pin is gone from
  // the map, so the sheet (or the map's popover) would be showing detail for something the user can
  // no longer see or dismiss by tapping. Adjusted during render rather than in an effect — React's
  // own pattern for "a prop/derived value invalidated some state" — and it converges immediately,
  // because after the reset the guard is false.
  if (selected && !visiblePlaces.some((place) => place.id === selected.id)) {
    setSelected(null);
  }

  const announcement = useResultAnnouncement(query, visiblePlaces.length, places.length);
  useSearchFlight(query, places, visiblePlaces, setFocusPlaceIds);

  function openImport() {
    setLastImport(null);
    // An import that lands places the current query excludes would save them into an invisible
    // list and fly the camera at pins that are filtered out. Starting an import is the user leaving
    // the search behind, so the search goes with it.
    setQuery('');
    setShowImport(true);
  }

  return (
    <div className="relative h-full w-full">
      <MapSurface
        places={visiblePlaces}
        onPlaceClick={setSelected}
        selected={selected}
        onDeselect={() => setSelected(null)}
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
          places={visiblePlaces}
          totalCount={places.length}
          query={query}
          onQueryChange={setQuery}
          selected={selected}
          onDeselect={() => setSelected(null)}
          onAddTikTok={openImport}
        />
      )}
      <PlaceDesktopPanel
        places={visiblePlaces}
        totalCount={places.length}
        query={query}
        onQueryChange={setQuery}
        onAddTikTok={openImport}
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
  );
}

/**
 * The filtered result count, as a sentence, delayed until the typing stops. Returns `''` while the
 * field is empty so the region says nothing at all on first load and says nothing again the moment
 * the search is cleared.
 */
function useResultAnnouncement(query: string, matchCount: number, totalCount: number): string {
  // The query the stored sentence describes is kept with it, and the sentence is only returned
  // while the two still agree. That is what stops the previous search's result being read out
  // during the first half-second of the next one: clearing the field and typing again leaves a
  // perfectly formed, entirely stale sentence in state, and a live region would happily announce it.
  const [announced, setAnnounced] = useState({ query: '', message: '' });
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed === '') return;
    const timer = setTimeout(() => {
      setAnnounced({
        query: trimmed,
        message:
          matchCount === 0
            ? `No places match ${trimmed}.`
            : `${matchCount} of ${totalCount} places match ${trimmed}.`,
      });
    }, ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [trimmed, matchCount, totalCount]);

  return announced.query === trimmed ? announced.message : '';
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
 * Clearing the field is a real decision too, not the absence of one: it frames the whole library
 * again, which is `ux-architecture.md` §9.3's `Show all places`. Without it, clearing a search that
 * had zoomed into one street leaves the user on that street with nineteen pins off screen.
 */
function useSearchFlight(
  query: string,
  places: readonly MapPlace[],
  matches: readonly MapPlace[],
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
      const target = trimmed === '' ? places : matches;
      setSearched(trimmed);
      if (target.length > 0) requestFlight(target.map((place) => place.id));
    }, FLY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [trimmed, searched, places, matches, requestFlight]);
}
