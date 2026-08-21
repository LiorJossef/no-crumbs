'use client';

/**
 * The `lg+` presentation of saved-places state (`docs/ux-architecture.md` §1.4): a persistent
 * left list panel and, when a place is selected, a right detail panel — the map narrows rather
 * than being covered, and there is no drag/gesture surface at all (only the map region itself is
 * interactive). This is a genuine desktop composition, not the mobile sheet stretched: it borrows
 * its *materials* from the sign-in screen's desktop split (a fixed-width frosted panel behind a
 * single hairline border, `docs/brand-and-product-foundation.md` §5) rather than its literal
 * two-column proportions, and its *rows/detail* from `place-sheet.tsx`'s exports so the two
 * presentations of "a saved place" never drift into two visual languages.
 *
 * Hidden below `lg` (`hidden lg:flex`) — `PlaceSheet` owns mobile. Both panels are
 * `pointer-events-auto` islands inside a `pointer-events-none` full-bleed wrapper, so the map
 * underneath (and the floating account chip above it) stay reachable everywhere else.
 */

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlaceDetail, PlaceRow, PlaceSearchField } from './place-sheet';
import type { MapPlace } from '@/components/map/types';

export interface PlaceDesktopPanelProps {
  readonly places: readonly MapPlace[];
  readonly selected: MapPlace | null;
  readonly onDeselect: () => void;
}

export function PlaceDesktopPanel({ places, selected, onDeselect }: PlaceDesktopPanelProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden lg:block">
      <div className="pointer-events-auto absolute inset-y-0 left-0 flex w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 backdrop-blur-md">
        <div className="flex flex-col gap-4 px-6 pt-7">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
              Your places
            </h1>
            <span className="text-sm font-medium text-muted-foreground">{places.length} saved</span>
          </div>
          <Button
            type="button"
            className="h-12 w-full gap-1.5 rounded-lg text-sm font-bold"
            onClick={() => {
              // Real add flow is later work (S6/L1) — this slice only proves the panel system.
              console.log('add a tiktok: not yet implemented');
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a TikTok
          </Button>
          <PlaceSearchField />
        </div>

        <ul className="mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {places.map((place) => (
            <PlaceRow key={place.id} place={place} />
          ))}
        </ul>
      </div>

      {selected && (
        <div className="pointer-events-auto absolute inset-y-0 right-0 flex w-[clamp(340px,28vw,428px)] flex-col border-l border-border/70 bg-card shadow-[var(--shadow-elevated)]">
          <PlaceDetail place={selected} onClose={onDeselect} />
        </div>
      )}
    </div>
  );
}
