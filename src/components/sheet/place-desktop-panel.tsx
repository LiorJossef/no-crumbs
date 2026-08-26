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

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoPlacesYet, NoSearchMatches, PlaceRow, PlaceSearchField } from './place-sheet';
import { isSearchActive } from '@/domain/places/search';
import type { MapPlace } from '@/components/map/types';

export interface PlaceDesktopPanelProps {
  /** Already filtered by `query`, exactly like the pins on the map beside it. */
  readonly places: readonly MapPlace[];
  readonly totalCount: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** Opens the import overlay in `map-page-client.tsx` (client state) rather than navigating to
   *  the standalone `/import` route, so the map underneath this panel stays mounted. */
  readonly onAddTikTok: () => void;
}

export function PlaceDesktopPanel({
  places,
  totalCount,
  query,
  onQueryChange,
  onAddTikTok,
}: PlaceDesktopPanelProps) {
  const filtering = isSearchActive(query);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
      <div className="pointer-events-auto absolute inset-y-0 left-0 flex w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 backdrop-blur-md">
        <div className="flex flex-col gap-4 px-6 pt-7">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
              Your places
            </h1>
            {/* `3 of 20` while filtering, so the count never reads as "you have three places". */}
            <span className="shrink-0 text-sm font-medium text-muted-foreground">
              {filtering ? `${places.length} of ${totalCount}` : `${totalCount} saved`}
            </span>
          </div>
          <Button
            type="button"
            className="h-12 w-full gap-1.5 rounded-lg text-sm font-bold"
            onClick={onAddTikTok}
          >
            <Plus className="size-4" aria-hidden />
            Add a TikTok
          </Button>
          <PlaceSearchField value={query} onChange={onQueryChange} />
        </div>

        {places.length === 0 ? (
          <div className="mt-4 px-6">
            {filtering ? (
              <NoSearchMatches query={query} onClear={() => onQueryChange('')} />
            ) : (
              <NoPlacesYet />
            )}
          </div>
        ) : (
          <ul className="mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {places.map((place) => (
              <PlaceRow key={place.id} place={place} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
