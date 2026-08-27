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

import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ClearSearchEscape,
  ElsewhereSection,
  EMPTY_LIBRARY_HEADING,
  EmptyLibraryLine,
  PlaceRow,
  PlaceSearchField,
} from './place-sheet';
import { ActiveTagFilter } from './place-enrichment';
import type { AreaHeading, AreaRow } from '@/ui/place/active-area';
import type { MapPlace } from '@/components/map/types';

export interface PlaceDesktopPanelProps {
  /** The active area's places, already narrowed and ordered by `map-page-client.tsx`. */
  readonly places: readonly MapPlace[];
  /** The same object the mobile sheet gets, so the two presentations cannot disagree. */
  readonly heading: AreaHeading;
  readonly otherAreas: readonly AreaRow[];
  readonly onSelectArea: (areaId: string) => void;
  readonly libraryIsEmpty: boolean;
  readonly filtering: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tag currently narrowing the library, or `null`. Same prop, same pill and same behaviour as
   *  the mobile sheet — the two surfaces present one filter, not two. */
  readonly activeTag: string | null;
  readonly onClearTag: () => void;
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
  otherAreas,
  onSelectArea,
  libraryIsEmpty,
  filtering,
  query,
  onQueryChange,
  activeTag,
  onClearTag,
  onAddTikTok,
  onSelect,
}: PlaceDesktopPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  /** Switching area replaces every row and unmounts the button that was pressed. */
  const selectArea = (areaId: string) => {
    onSelectArea(areaId);
    headingRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
      <div className="pointer-events-auto absolute inset-y-0 left-0 flex w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 backdrop-blur-md">
        <div className="flex flex-col gap-4 px-6 pt-7">
          {/* The page's real subject, and it is an area rather than a collection: `Your places` and
              the `3 of 20` counter beside it are both gone. The library total is not displayed
              anywhere on `/map` — it answers a question about owning things, and this screen is for
              finding one. `tabIndex={-1}` only so the escapes below have somewhere to send focus. */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-2xl font-extrabold tracking-tight text-foreground outline-none"
          >
            {libraryIsEmpty ? EMPTY_LIBRARY_HEADING : heading.text}
          </h1>
          {libraryIsEmpty && <EmptyLibraryLine />}
          <Button
            type="button"
            className="h-12 w-full gap-1.5 rounded-lg text-sm font-bold"
            onClick={onAddTikTok}
          >
            <Plus className="size-4" aria-hidden />
            Add a TikTok
          </Button>
          {/* Hidden while the library is empty: there is nothing to search, and an inert field is a
              false affordance. The heading and the one line above it are the whole screen. */}
          {!libraryIsEmpty && <PlaceSearchField value={query} onChange={onQueryChange} />}
          {/* Inside the header block, under the field and above whatever the list turns out to be,
              so the control that undoes the filter is present in the empty state too. */}
          {activeTag !== null && <ActiveTagFilter tag={activeTag} onClear={onClearTag} />}
        </div>

        {libraryIsEmpty ? null : (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
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
            <ElsewhereSection rows={otherAreas} filtering={filtering} onSelectArea={selectArea} />
          </div>
        )}
      </div>
    </div>
  );
}
