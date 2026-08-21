'use client';

/**
 * Client seam between the map (`MapSurface`, an uncontrolled imperative surface) and the two
 * surfaces that present saved places around it: `PlaceSheet` (mobile, a three-stop drag sheet,
 * `src/components/sheet/place-sheet.tsx`) and `PlaceDesktopPanel` (`lg+`, a persistent two-panel
 * composition, `src/components/sheet/place-desktop-panel.tsx`). `selected` is lifted here rather
 * than into `map/page.tsx` (a server component) or down into the map, because it is the one piece
 * of state the map's pin-tap callback and *both* presentation surfaces need — per
 * `docs/ux-architecture.md` §1.5, this state is client-only and never a URL in this slice.
 *
 * Both surfaces render unconditionally and switch on Tailwind breakpoints alone (`lg:hidden` /
 * `hidden lg:block`) rather than a JS media-query hook, so there is no hydration-mismatch risk and
 * no behavioural branching here — only one of the two is ever visible or hit-testable at a time.
 */

import { useState } from 'react';
import { MapSurface, type MapPlace } from '@/components/map/map-surface';
import { PlaceSheet } from '@/components/sheet/place-sheet';
import { PlaceDesktopPanel } from '@/components/sheet/place-desktop-panel';

export function MapPageClient({ places }: { places: readonly MapPlace[] }) {
  const [selected, setSelected] = useState<MapPlace | null>(null);

  return (
    <div className="relative h-full w-full">
      <MapSurface
        places={places}
        onPlaceClick={setSelected}
        rightPanelOpen={selected !== null}
      />
      <PlaceSheet places={places} selected={selected} onDeselect={() => setSelected(null)} />
      <PlaceDesktopPanel places={places} selected={selected} onDeselect={() => setSelected(null)} />
    </div>
  );
}
