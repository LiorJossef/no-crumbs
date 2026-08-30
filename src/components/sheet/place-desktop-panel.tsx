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
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ClearSearchEscape,
  EMPTY_LIBRARY_HEADING,
  EmptyLibraryLine,
  EverywhereElse,
  PlaceRow,
  PlaceSearchField,
  useLibraryTagFacets,
} from './place-sheet';
import { ActiveTagFilter, TagFacetBar } from './place-enrichment';
import { CategoryFilterBar } from './category-filter-bar';
import type { CategoryFacet } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import { CollectionsNavRow } from '@/components/collections/collections-nav-row';
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
  /** Opens the import overlay in `map-page-client.tsx` (client state) rather than navigating to
   *  the standalone `/import` route, so the map underneath this panel stays mounted. */
  readonly onAddTikTok: () => void;
  /** Selecting from the list. On desktop the detail then opens in the map's own pin-anchored
   *  popover — this panel is not a detail surface (§1.4) and does not become one. */
  readonly onSelect: (place: MapPlace) => void;
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
  onAddTikTok,
  onSelect,
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
          className="h-12 w-full gap-1.5 rounded-lg text-sm font-bold"
          onClick={() => onAddTikTok()}
        >
          <Plus className="size-4" aria-hidden />
          Add a TikTok
        </Button>
        {/* Hidden while the library is empty: there is nothing to search, and an inert field is a
              false affordance. The heading and the one line above it are the whole screen. */}
        {!libraryIsEmpty && <PlaceSearchField value={query} onChange={onQueryChange} />}
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
          <div ref={scrollRef} className="mt-4 min-h-0 flex-1 overflow-y-auto px-6">
            {heading.escape === 'clear-search' && (
              <ClearSearchEscape onClearSearch={() => onQueryChange('')} />
            )}
            {!heading.empty && (
              <ul>
                {places.map((place) => (
                  <PlaceRow key={place.id} place={place} onSelect={onSelect} />
                ))}
              </ul>
            )}
            {/* The same continuation the sheet renders, from the same array. The panel used to
                  differ here — it opened every country group where the sheet opened two — and with
                  the groups gone there is nothing left for the two surfaces to disagree about. */}
            <EverywhereElse places={otherPlaces} flush={heading.empty} onSelect={onSelect} />
          </div>
          {/* Pinned to the bottom of the panel, out of the scroll — see `PlaceList`. */}
          <div className="shrink-0 px-6 pb-6">
            <CollectionsNavRow />
          </div>
        </>
      )}
    </>
  );
}
