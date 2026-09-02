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

import { useLayoutEffect, useRef } from 'react';
import { PlatformMark } from '@/components/brand/platform-mark';
import { Button } from '@/components/ui/button';
import {
  ClearSearchEscape,
  EMPTY_LIBRARY_HEADING,
  EmptyLibraryLine,
  EverywhereElse,
  PlaceRow,
  PlaceSearchField,
  ResultCount,
  SortControl,
  useLibraryTagFacets,
} from './place-sheet';
import { DEFAULT_PLACE_ORDER, type PlaceOrder } from './place-order';
import { ActiveTagFilter, TagFacetBar } from './place-enrichment';
import { CategoryFilterBar } from './category-filter-bar';
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
  readonly libraryIsEmpty: boolean;
  /** See `PlaceSheetProps` — library-wide, because the chip filters the map as well as this list. */
  readonly libraryHasVisited: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tag currently narrowing the library, or `null`. Same prop, same pill and same behaviour as
   *  the mobile sheet — the two surfaces present one filter, not two. */
  readonly activeTag: string | null;
  readonly onClearTag: () => void;
  /** Whether the library is narrowed to places the user has not been to yet. Same prop, same chip
   *  and same behaviour as the mobile sheet — the two surfaces present one filter, not two. */
  readonly notBeenOnly: boolean;
  readonly onToggleNotBeen: () => void;
  readonly categoryFacets: readonly CategoryFacet[];
  readonly activeCategory: ProductCategory | null;
  readonly onToggleCategory: (category: ProductCategory) => void;
  /** How many places this list would show with the search and every filter cleared — the
   *  denominator in `12 of 32`. Same prop, same meaning and same optionality as
   *  `PlaceSheetProps.unfilteredCount`, which carries the reasoning: absent renders no count at
   *  all, because a denominator derived from the already-narrowed props would be a confident wrong
   *  answer about a number the user can check against the list in front of them. */
  readonly unfilteredCount?: number;
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
  libraryIsEmpty,
  libraryHasVisited,
  query,
  onQueryChange,
  activeTag,
  onClearTag,
  notBeenOnly,
  onToggleNotBeen,
  categoryFacets,
  activeCategory,
  onToggleCategory,
  unfilteredCount,
  onAddTikTok,
  onSelect,
  onHover,
  selectedId,
  sortOrder = DEFAULT_PLACE_ORDER,
  sortOrders = [],
  onChangeSort,
}: PlaceDesktopPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /** The identical computation the sheet does, through the identical hook — see
   *  `useLibraryTagFacets` for why it is a hook rather than four lines in each host. */
  const tagFacets = useLibraryTagFacets(places, otherPlaces, activeTag);

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
        <h1
          key={activeAreaId ?? 'no-area'}
          className="animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1 font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none"
        >
          {libraryIsEmpty ? EMPTY_LIBRARY_HEADING : heading.text}
        </h1>
        {libraryIsEmpty && <EmptyLibraryLine />}
        <Button
          type="button"
          className="h-12 w-full gap-2 rounded-lg text-sm font-bold"
          onClick={() => onAddTikTok()}
        >
          {/* The sheet's copy of this button carries the argument for the solid weight, the 20px
              size and the centred composition; the two must not drift. */}
          <PlatformMark variant="solid" className="size-5" />
          Add a TikTok link
        </Button>
        {/* Hidden while the library is empty: there is nothing to search, and an inert field is a
              false affordance. The heading and the one line above it are the whole screen. */}
        {!libraryIsEmpty && (
          <div className="flex flex-col gap-1.5">
            <PlaceSearchField value={query} onChange={onQueryChange} />
            {/* The same count the sheet shows, from the same component. It is the one fact this
                surface has only ever said out loud — `map-shell.tsx`'s live region — and a
                sighted desktop user watching rows disappear had no number anywhere on screen. */}
            <ResultCount
              shown={places.length + otherPlaces.length}
              {...(unfilteredCount === undefined ? {} : { of: unfilteredCount })}
              narrowing={
                query.trim() !== '' ||
                activeTag !== null ||
                notBeenOnly ||
                activeCategory !== null
              }
            />
          </div>
        )}
        {/* Inside the header block, under the field and above whatever the list turns out to be,
              so the controls that undo a filter are present in the empty state too. */}
        {/* The same bar the sheet renders. Two surfaces offering different filter controls over
              one library is how the phone and the desktop come to disagree about what the product
              can do — `PlaceRow` is shared for exactly this reason. */}
        {!libraryIsEmpty && (
          <CategoryFilterBar
            facets={categoryFacets}
            activeCategory={activeCategory}
            onToggleCategory={onToggleCategory}
            notBeenOnly={notBeenOnly}
            onToggleNotBeen={onToggleNotBeen}
            anyVisited={libraryHasVisited}
          />
        )}
        {/* Under the category bar, exactly as on the phone. 1440x900 is one of the two gate
              viewports and a facet that exists on one of them is a half-finished surface — the
              same argument that makes `PlaceRow` shared. Renders nothing when the library carries
              no tags, which is most libraries. */}
        {/* `W5-2`, and the same component the sheet renders rather than a second one. It shipped
              into `PlaceSheet` alone and was therefore **invisible at 1440×900**, which is a gate
              viewport — a control that exists on one of the two is a half-finished surface, the
              same argument that makes `PlaceRow` and the filter bar shared. */}
        {!libraryIsEmpty && onChangeSort !== undefined && sortOrders.length > 1 && (
          <SortControl order={sortOrder} orders={sortOrders} onChange={onChangeSort} />
        )}
        {!libraryIsEmpty && <TagFacetBar facets={tagFacets} />}
        {activeTag !== null && <ActiveTagFilter tag={activeTag} onClear={onClearTag} />}
        {/* See `AreaHeading.note`: the one line an achievement heading needs and a failed query
              does not. */}
        {!libraryIsEmpty && heading.note !== null && (
          <p className="text-sm font-medium text-muted-foreground">{heading.note}</p>
        )}
      </div>

      {libraryIsEmpty ? null : (
        <>
          {/* `px-4`, not the header's `px-6`: `PlaceRow` now carries `ps-2.5` of its own, so a row's
                name still lands ~26 px from the panel edge — level with the heading above it — while
                the selected rule and the hover ground sit *outside* the text rather than under it.
                The list is the one child of this column whose content has its own inset. */}
          <div ref={scrollRef} className="mt-4 min-h-0 flex-1 overflow-y-auto px-4">
            {heading.escape === 'clear-search' && (
              <ClearSearchEscape onClearSearch={() => onQueryChange('')} />
            )}
            {!heading.empty && (
              <ul>
                {places.map((place) => (
                  <PlaceRow
                    key={place.id}
                    place={place}
                    onSelect={onSelect}
                    {...(onHover ? { onHover } : {})}
                    selected={selectedId === place.id}
                  />
                ))}
              </ul>
            )}
            {/* The same continuation the sheet renders, from the same array. The panel used to
                  differ here — it opened every country group where the sheet opened two — and with
                  the groups gone there is nothing left for the two surfaces to disagree about. */}
            <EverywhereElse
              places={otherPlaces}
              flush={heading.empty}
              onSelect={onSelect}
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
