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
 * `showImport` is the same pattern one level up: "Add a TikTok" (in both `PlaceSheet` and
 * `PlaceDesktopPanel`) used to be a `router.push('/import')` — a real route change that unmounts
 * the map entirely, which is glaring at desktop widths where `/import` has no map behind it to
 * float over. `ImportPageClient` now renders as an overlay sibling here instead, so the map stays
 * mounted (and its camera untouched, L1-F1-T4) exactly like place detail already does. The real
 * `/import` route (`src/app/import/page.tsx`) is untouched and still renders the same component
 * directly for a mid-import refresh or direct navigation (L1-F2-T3's resume requirement) — this is
 * a second entry point onto the same client component, not a replacement for the route.
 */

import { useState } from 'react';
import { MapSurface, type MapPlace } from '@/components/map/map-surface';
import { ImportConfirmation } from '@/components/map/import-confirmation';
import { PlaceSheet } from '@/components/sheet/place-sheet';
import { PlaceDesktopPanel } from '@/components/sheet/place-desktop-panel';
import { ImportPageClient, type SaveOutcomeDetail } from '@/app/import/import-page-client';

export function MapPageClient({ places }: { places: readonly MapPlace[] }) {
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [showImport, setShowImport] = useState(false);
  /**
   * What the last import saved. Two jobs, both of which the flow was missing entirely: it frames
   * the camera on the places that were just added (`focusPlaceIds`), and it is the only thing on
   * screen that says the import worked. Cleared on dismissal, and also when a new import starts,
   * so a stale "8 places added" can never sit over a fresh run.
   */
  const [lastImport, setLastImport] = useState<SaveOutcomeDetail | null>(null);

  function openImport() {
    setLastImport(null);
    setShowImport(true);
  }

  return (
    <div className="relative h-full w-full">
      <MapSurface
        places={places}
        onPlaceClick={setSelected}
        selected={selected}
        onDeselect={() => setSelected(null)}
        {...(lastImport ? { focusPlaceIds: lastImport.savedPlaceIds } : {})}
      />
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
          places={places}
          selected={selected}
          onDeselect={() => setSelected(null)}
          onAddTikTok={openImport}
        />
      )}
      <PlaceDesktopPanel places={places} onAddTikTok={openImport} />
      {showImport && (
        <ImportPageClient onClose={() => setShowImport(false)} onSaved={setLastImport} />
      )}
    </div>
  );
}
