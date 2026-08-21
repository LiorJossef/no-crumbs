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
        selected={selected}
        onDeselect={() => setSelected(null)}
      />
      <PlaceSheet places={places} selected={selected} onDeselect={() => setSelected(null)} />
      <PlaceDesktopPanel places={places} />
    </div>
  );
}
