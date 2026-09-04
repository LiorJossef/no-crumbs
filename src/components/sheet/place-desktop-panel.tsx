'use client';

/**
 * The `lg+` presentation of the saved-places list (`docs/ux-architecture.md` §1.4, revised in a
 * later round of feedback): a single persistent left panel that **always** shows the list, full
 * stop. Selecting a pin no longer swaps this panel's content — detail moved entirely onto the map
 * itself as a pin-anchored popover (`MapSurfaceMapcn`'s `MapPopup`, driven by `selected` lifted in
 * `map-page-client.tsx`). This panel is now selection-agnostic: it renders `places` and nothing
 * else, so it never needs to know a place is selected at all.
 *
 * This is a genuine desktop composition, not the mobile sheet stretched: it borrows its
 * *materials* from the sign-in screen's desktop split (a fixed-width frosted panel behind a
 * single hairline border, `docs/brand-and-product-foundation.md` §5) rather than a two-column
 * layout, and its *rows* from `place-sheet.tsx`'s exports so the two presentations of "a saved
 * place, in a list" never drift into two visual languages.
 *
 * Hidden below `lg` (`hidden lg:flex`) — `PlaceSheet` owns mobile, including its own detail view.
 * The panel is a `pointer-events-auto` island inside a `pointer-events-none` full-bleed wrapper,
 * so the map underneath (and the floating account chip above it) stay reachable everywhere else.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { PlatformMark } from '@/components/brand/platform-mark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  NothingHereEscape,
  EMPTY_LIBRARY_HEADING,
  EmptyLibraryLine,
  EverywhereElse,
  PlaceRow,
  PlaceSearchField,
  SortControl,
  useLibraryTagFacets,
} from './place-sheet';
import { DEFAULT_PLACE_ORDER, type PlaceOrder } from './place-order';
import {
  BulkDeleteControl,
  BulkDeleteNotice,
  EnterSelectionButton,
  LeaveSelectionButton,
  SelectablePlaceRow,
  SelectionToolbar,
  useLibrarySelection,
} from './library-selection';
import { ActiveTagFilter } from './place-enrichment';
import { LibraryFilterBar } from './library-filter-bar';
import { NO_BEEN_PLACES_LINE, type VisitFilter } from '@/ui/place/visit-state';
import type { CategoryFacet } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import type { AreaHeading } from '@/ui/place/active-area';
import type { MapPlace } from '@/components/map/types';

export interface PlaceDesktopPanelProps {
  /** The active area's places, already narrowed and ordered by `map-page-client.tsx`. */
  readonly places: readonly MapPlace[];
  /** The same object the mobile sheet gets, so the two presentations cannot disagree. */
  readonly heading: AreaHeading;
  /** The rest of the library — the same continuation the sheet renders, built once upstream so the
   *  two surfaces cannot disagree about what is outside the scope. */
  readonly otherPlaces: readonly MapPlace[];
  readonly activeAreaId: string | null;
  /** **The whole library, unfiltered**, so the tag list's rows and their order cannot move while
   *  you filter. Only the counts beside them are live. See `useLibraryTagFacets`. */
  readonly libraryPlaces?: readonly MapPlace[];
  readonly libraryIsEmpty: boolean;
  /** See `PlaceSheetProps` — library-wide, because the chip filters the map as well as this list. */
  readonly libraryHasVisited: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** See `PlaceSheetProps.searchAside` — the same slot, in the same place, on the desktop panel,
   *  so one library never offers two different sets of controls. */
  readonly searchAside?: ReactNode;
  /** The tags currently narrowing the library, composing as AND. Same props, same pills and same
   *  behaviour as the mobile sheet — the two surfaces present one filter, not two. */
  readonly activeTags: readonly string[];
  readonly onClearTag: (tag: string) => void;
  readonly onToggleTag: (tag: string) => void;
  readonly onClearTags: () => void;
  /** How the library is narrowed by the user's own visits. Same prop, same control and same
   *  behaviour as the mobile sheet — the two surfaces present one filter, not two. */
  readonly visitFilter: VisitFilter;
  readonly onChangeVisitFilter: (filter: VisitFilter) => void;
  readonly categoryFacets: readonly CategoryFacet[];
  readonly activeCategory: ProductCategory | null;
  readonly onToggleCategory: (category: ProductCategory) => void;
  /** Opens the import overlay in `map-page-client.tsx` (client state) rather than navigating to
   *  the standalone `/import` route, so the map underneath this panel stays mounted. */
  readonly onAddTikTok: () => void;
  /** Selecting from the list. On desktop the detail then opens in the map's own pin-anchored
   *  popover — this panel is not a detail surface (§1.4) and does not become one. */
  readonly onSelect: (place: MapPlace) => void;
  /**
   * **The row↔pin coupling** (`W3-2`), and this is the surface it was designed for: at `lg+` the
   * list and the map are side by side, so pointing at a row and watching its pin lift is the whole
   * argument that they are one object rather than two lists of the same places. Below `lg` the
   * sheet covers the map and the same callback is mostly a keyboard affordance.
   *
   * Optional, like the sheet's, so a host that lists places without a map mounts this unchanged.
   */
  readonly onHover?: (placeId: string | null) => void;
  /** The open place's id, so its row draws the selected state and says `aria-current`. */
  readonly selectedId?: string | null;
  /**
   * `W5-2`, the sort control. It shipped into `PlaceSheet` alone, which meant it was **invisible at
   * 1440×900** — the gate viewport renders this component, not the sheet. Same three props, same
   * shape, and `sortOrders` shorter than two renders nothing.
   */
  readonly sortOrder?: PlaceOrder;
  readonly sortOrders?: readonly PlaceOrder[];
  readonly onChangeSort?: (order: PlaceOrder) => void;
}

export function PlaceDesktopPanel({
  places,
  heading,
  otherPlaces,
  activeAreaId,
  libraryPlaces,
  libraryIsEmpty,
  libraryHasVisited,
  query,
  onQueryChange,
  searchAside,
  activeTags,
  onClearTag,
  onToggleTag,
  onClearTags,
  visitFilter,
  onChangeVisitFilter,
  categoryFacets,
  activeCategory,
  onToggleCategory,
  onAddTikTok,
  onSelect,
  onHover,
  selectedId,
  sortOrder = DEFAULT_PLACE_ORDER,
  sortOrders = [],
  onChangeSort,
}: PlaceDesktopPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** The three narrowing axes, and deliberately not sort or search — see the sheet's copy of this. */
  const filtersAreOn = activeCategory !== null || visitFilter !== 'all' || activeTags.length > 0;

  /** The identical selection the sheet runs, through the identical hook and over the identical
   *  pair of arrays — see `PlaceList`. The sheet and this panel are two presentations of one
   *  library, and a bulk delete that behaved differently at 1440 than at 390 would be a second
   *  product with the same rows in it. */
  const selectableIds = useMemo(
    () =>
      [...places, ...otherPlaces].flatMap((place) =>
        place.savedPlaceId === undefined ? [] : [place.savedPlaceId],
      ),
    [places, otherPlaces],
  );
  const selection = useLibrarySelection(selectableIds);
  const selecting = selection.selecting;

  /** **Focus comes back to `Select` when the mode ends**, the same mechanism `PlaceList` runs and
   *  for the same reason: pressing `Done` unmounts the focused node, and without this focus falls
   *  to `<body>`. Measured at 1280x900 before it existed, so this is a closed gap rather than a
   *  precaution. Keyed on the transition and not on a mount, because `Select` is also on screen
   *  before anyone has entered the mode. */
  const selectSlotRef = useRef<HTMLSpanElement>(null);
  const wasSelecting = useRef(false);
  useEffect(() => {
    const leftSelection = wasSelecting.current && !selecting;
    wasSelecting.current = selecting;
    if (!leftSelection) return;
    const enter = selectSlotRef.current?.querySelector('button');
    if (!enter?.checkVisibility()) return;
    enter.focus({ preventScroll: true });
  }, [selecting]);

  /** The identical computation the sheet does, through the identical hook — see
   *  `useLibraryTagFacets` for why it is a hook rather than four lines in each host. */
  const tagFacets = useLibraryTagFacets(places, otherPlaces, activeTags, libraryPlaces);

  /** The same scroll reset the sheet does, for the same reason and with the same timing — see
   *  `PlaceList`. A panel is shorter than a sheet at `full` but the arithmetic is identical. */
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeAreaId]);

  return (
    /* The frame — the `pointer-events-none` full-bleed wrapper, the fixed width, the hairline, the
       blur and the `hidden lg:block` — belongs to `MapShell`, which draws the identical column for
       every scope. This component is only what goes inside it. */
    <>
      <div className="flex flex-col gap-4 px-6 pt-7">
        {/* The page's real subject, and it is an area rather than a collection: `Your places` and
              the `3 of 20` counter beside it are both gone. The library total is not displayed
              anywhere on `/map` — it answers a question about owning things, and this screen is for
              finding one. */}
        {/* Keyed and faded exactly as the sheet's `h2` is — one change of scope, one motion, on
              both surfaces. See `PlaceList` for why it keys on the area and not on the count, and
              for why the reduced-motion arm is now the fade rather than nothing at all: under
              `prefers-reduced-motion` the nine animations collapse to the opacity change, because
              the thing that just changed still has to be findable. Opacity is unconditional, the
              4 px rise is `motion-safe:`, and `duration-enter` is the token `duration-140` was a
              second way of saying. */}
        {/* The heading and the `Select` trigger share one line here too, so the two surfaces enter
            selection the same way. */}
        <div className="flex items-center gap-2">
          {/* Demoted while selecting, exactly as the sheet's `h2` is and for the reasons
              `PlaceList` states in full — the scope line has to survive, because it is the only
              thing naming what `Select all` acts on, but it must stop being the heaviest element
              on a screen that is now stating a different count 8 px below it. */}
          <h1
            key={activeAreaId ?? 'no-area'}
            className={cn(
              'min-w-0 flex-1 animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1 outline-none',
              selecting
                ? 'text-caption font-medium text-muted-foreground'
                : 'font-heading text-2xl font-extrabold tracking-tight text-foreground',
            )}
          >
            {libraryIsEmpty ? EMPTY_LIBRARY_HEADING : heading.text}
          </h1>
          {/* One slot, two controls — see `PlaceList`, whose copy of this row this is. */}
          {selecting ? (
            <LeaveSelectionButton onLeave={selection.leave} />
          ) : (
            !libraryIsEmpty &&
            selectableIds.length > 0 && (
              <span ref={selectSlotRef} className="contents">
                <EnterSelectionButton onEnter={selection.enter} />
              </span>
            )
          )}
        </div>
        {libraryIsEmpty && <EmptyLibraryLine />}
        {/* Replaced while picking, for the reason `PlaceList` states: two ways of narrowing a list
            you are counting is a way to lose track of what is counted. `Add a TikTok link` goes with
            them — a primary action that starts a different task has no business under a selection
            toolbar. */}
        {selecting ? (
          <>
            <SelectionToolbar selection={selection} />
            <BulkDeleteControl selection={selection} />
          </>
        ) : (
          <BulkDeleteNotice notice={selection.notice} />
        )}
        {!selecting && <Button
          type="button"
          className="h-12 w-full gap-2 rounded-lg text-sm font-bold"
          onClick={() => onAddTikTok()}
        >
          {/* The sheet's copy of this button carries the argument for the solid weight, the 20px
              size and the centred composition; the two must not drift. */}
          <PlatformMark variant="solid" className="size-5" />
          Add a TikTok link
        </Button>}
        {/* Hidden while the library is empty: there is nothing to search, and an inert field is a
              false affordance. The heading and the one line above it are the whole screen. */}
        {/* **The `12 of 32` counter is gone**, on both surfaces at once
            (`ux-overwhelm-audit-2026-09-02.md` §7) — it was `aria-hidden`, so it spoke only to
            sighted users, in the band the owner asked us to empty, restating what the heading and
            the list already say. The screen-reader announcement is a separate live region in
            `map-shell.tsx` and is untouched. */}
        {!libraryIsEmpty && !selecting && <PlaceSearchField value={query} onChange={onQueryChange} />}
        {/* The natural-language entry point sits directly under the field, on both surfaces —
            `nls-plan.md` §9 decision 1. See `PlaceSheetProps.searchAside`. */}
        {!libraryIsEmpty && !selecting && searchAside}
        {/* **Two rows, not three walls of chips**, exactly as on the phone — the same component,
            so the two surfaces cannot offer different controls over one library. Row 1 narrows,
            row 2 sorts; the sort control rides in `belowRow`. */}
        {!libraryIsEmpty && !selecting && (
          <LibraryFilterBar
            facets={categoryFacets}
            activeCategory={activeCategory}
            onToggleCategory={onToggleCategory}
            visitFilter={visitFilter}
            onChangeVisitFilter={onChangeVisitFilter}
            anyVisited={libraryHasVisited}
            tagFacets={tagFacets}
            activeTags={activeTags}
            onToggleTag={onToggleTag}
            onClearTags={onClearTags}
            belowRow={
              onChangeSort !== undefined ? (
                <SortControl
                  order={sortOrder}
                  orders={sortOrders}
                  onChange={onChangeSort}
                  listLength={places.length + otherPlaces.length}
                />
              ) : undefined
            }
          />
        )}
        {activeTags.length > 0 && !selecting && (
          <ActiveTagFilter tags={activeTags} onClear={onClearTag} />
        )}
        {/* See `AreaHeading.note`: the one line an achievement heading needs and a failed query
              does not. */}
        {/* `Been` with nothing to show gets its own line — the same rule and the same string the
            sheet uses, because that empty result only became reachable when the visit filter grew
            a third state and the area heading is built from the old boolean. */}
        {!libraryIsEmpty && places.length + otherPlaces.length === 0 && visitFilter === 'been' ? (
          <p className="text-sm font-medium text-muted-foreground">{NO_BEEN_PLACES_LINE}</p>
        ) : (
          !libraryIsEmpty &&
          heading.note !== null &&
          !(filtersAreOn && places.length === 0) && (
            <p className="text-sm font-medium text-muted-foreground">{heading.note}</p>
          )
        )}
      </div>

      {libraryIsEmpty ? null : (
        <>
          {/* `px-4`, not the header's `px-6`: `PlaceRow` now carries `ps-2.5` of its own, so a row's
                name still lands ~26 px from the panel edge — level with the heading above it — while
                the selected rule and the hover ground sit *outside* the text rather than under it.
                The list is the one child of this column whose content has its own inset. */}
          <div ref={scrollRef} className="mt-4 min-h-0 flex-1 overflow-y-auto px-4">

            {/* Same rule as the sheet, and the same single control: whatever emptied the list —
                a search or a filter — the *list* says so and offers one way out that clears every
                axis. This host is the one that gets forgotten: the Been badge and the no-matches
                line were both built in `place-sheet.tsx` alone, so it is worth saying plainly that
                these two files each render their own column and a fix to one is not a fix to the
                other. */}
            {(heading.escape === 'clear-search' || filtersAreOn) && places.length === 0 && (
              <NothingHereEscape
                searchQuery={query}
                onClear={() => {
                  if (query !== '') onQueryChange('');
                  if (activeCategory !== null) onToggleCategory(activeCategory);
                  if (visitFilter !== 'all') onChangeVisitFilter('all');
                  if (activeTags.length > 0) onClearTags();
                }}
              />
            )}
            {!heading.empty && (
              <ul>
                {places.map((place) =>
                  selecting && place.savedPlaceId !== undefined ? (
                    <SelectablePlaceRow
                      key={place.id}
                      place={place}
                      checked={selection.picked.has(place.savedPlaceId)}
                      onToggle={() => selection.toggle(place.savedPlaceId as string)}
                    />
                  ) : (
                    <PlaceRow
                      key={place.id}
                      place={place}
                      {...(selecting ? {} : { onSelect })}
                      {...(onHover ? { onHover } : {})}
                      selected={selectedId === place.id}
                    />
                  ),
                )}
              </ul>
            )}
            {/* The same continuation the sheet renders, from the same array. The panel used to
                  differ here — it opened every country group where the sheet opened two — and with
                  the groups gone there is nothing left for the two surfaces to disagree about. */}
            <EverywhereElse
              places={otherPlaces}
              flush={heading.empty}
              {...(selecting ? { selection } : { onSelect })}
              {...(onHover ? { onHover } : {})}
              {...(selectedId === undefined ? {} : { selectedId })}
            />
          </div>
          {/* **The `Collections` row that used to be pinned here is gone** (owner, 2026-08-31).
              It was the only way into collections from this panel and it earned its place; the
              drawer's `Places / Collections` switch now sits at the top of this same column and
              reaches the same view, so the row had become a second control for one destination
              ~700 px below the first.

              It was also the slower one by then: it linked to the literal `/collections`, which is
              a redirect shim, so pressing it went `/map` → `/collections` → `/map?view=collections`
              — **two segment changes, and the drawer torn down and rebuilt on each**, which is the
              flicker the route merge exists to remove. Repointing its href would have fixed that
              and left the duplication. */}
        </>
      )}
    </>
  );
}
