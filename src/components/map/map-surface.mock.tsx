'use client';

/**
 * Temporary static/mock implementation of the `MapSurfaceProps` port (`./types.ts`), swapped in
 * at `./map-surface.tsx` while no Protomaps tile-provider key exists. No vendor map SDK here —
 * this is a plain CSS/DOM visual, not MapLibre — so it stays completely disposable: delete this
 * file and flip the export in `map-surface.tsx` back to `MapSurfaceLive` once a key exists.
 *
 * Projection is a linear lat/lng → percentage scale against `initialBounds` (or bounds computed
 * from `places`), not real Mercator math — good enough for a mock that isn't going to ship.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { LatLngBoundsHint, MapPlace, MapSurfaceProps } from './types';
import { PRODUCT_CATEGORY_LABEL } from '@/domain/places/product-category';

const FALLBACK_SPAN = 0.05; // degrees, for a single-place or zero-span bounding box

function boundsFor(
  places: readonly MapPlace[],
  hint: LatLngBoundsHint | undefined
): LatLngBoundsHint {
  if (hint) return hint;
  if (places.length === 0) {
    return { north: 1, south: -1, east: 1, west: -1 };
  }
  const first = places[0]!;
  let north = first.lat;
  let south = first.lat;
  let east = first.lng;
  let west = first.lng;
  for (const place of places) {
    north = Math.max(north, place.lat);
    south = Math.min(south, place.lat);
    east = Math.max(east, place.lng);
    west = Math.min(west, place.lng);
  }
  if (north === south) {
    north += FALLBACK_SPAN;
    south -= FALLBACK_SPAN;
  }
  if (east === west) {
    east += FALLBACK_SPAN;
    west -= FALLBACK_SPAN;
  }
  return { north, south, east, west };
}

/** Linear lat/lng -> (leftPercent, topPercent) within the bounding box, with a margin so pins
 *  near an edge don't clip against the container. */
function project(place: MapPlace, bounds: LatLngBoundsHint): { left: number; top: number } {
  const margin = 10; // percent
  const usable = 100 - margin * 2;
  const lngSpan = bounds.east - bounds.west || 1;
  const latSpan = bounds.north - bounds.south || 1;
  const xFraction = (place.lng - bounds.west) / lngSpan;
  const yFraction = (bounds.north - place.lat) / latSpan; // north is up, i.e. smaller top%
  return {
    left: margin + xFraction * usable,
    top: margin + yFraction * usable,
  };
}

/** Fixtures that span multiple cities/continents share one linear projection, so a same-city
 *  cluster (a few hundredths of a degree apart) can land on the same handful of pixels once the
 *  bounding box spans thousands of kilometres — pins would silently stack and only the topmost one
 *  would be visible/clickable. This spreads any pins that end up within `clusterThreshold` percent
 *  of each other into a small deterministic ring around their shared point, so every fixture stays
 *  visible and independently clickable. Not real map clustering (no zoom-dependent regrouping) —
 *  just enough for a disposable mock to show all of its data. */
function declutter(
  points: readonly { left: number; top: number }[]
): readonly { left: number; top: number }[] {
  const clusterThreshold = 4; // percent; pins closer than this in both axes are treated as coincident
  const ringRadius = 3.5; // percent
  const groups: number[][] = [];
  const assigned = new Array<number>(points.length).fill(-1);

  points.forEach((point, index) => {
    if (assigned[index] !== -1) return;
    const group = [index];
    assigned[index] = groups.length;
    for (let other = index + 1; other < points.length; other += 1) {
      if (assigned[other] !== -1) continue;
      const dx = Math.abs(points[other]!.left - point.left);
      const dy = Math.abs(points[other]!.top - point.top);
      if (dx <= clusterThreshold && dy <= clusterThreshold) {
        assigned[other] = groups.length;
        group.push(other);
      }
    }
    groups.push(group);
  });

  const result = points.map((point) => ({ ...point }));
  for (const group of groups) {
    if (group.length <= 1) continue;
    const centerLeft = group.reduce((sum, i) => sum + points[i]!.left, 0) / group.length;
    const centerTop = group.reduce((sum, i) => sum + points[i]!.top, 0) / group.length;
    group.forEach((pointIndex, positionInGroup) => {
      const angle = (2 * Math.PI * positionInGroup) / group.length;
      result[pointIndex] = {
        left: centerLeft + ringRadius * Math.cos(angle),
        top: centerTop + ringRadius * Math.sin(angle),
      };
    });
  }
  return result;
}

export function MapSurfaceMock({ places, onPlaceClick, initialBounds }: MapSurfaceProps) {
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const bounds = useMemo(() => boundsFor(places, initialBounds), [places, initialBounds]);
  const positions = useMemo(
    () => declutter(places.map((place) => project(place, bounds))),
    [places, bounds]
  );

  function handlePinClick(place: MapPlace) {
    setSelected(place);
    onPlaceClick?.(place);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--background)]">
      {/* Static "map" surface: soft muted land/water wash plus a faint grid to read as streets
          without any real tile data. Deliberately just gradients/lines — no layout thrash, no
          animation on this layer. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 20% 10%, rgba(192,239,229,0.55) 0%, rgba(192,239,229,0) 55%),' +
            'radial-gradient(100% 100% at 85% 85%, rgba(218,245,239,0.45) 0%, rgba(218,245,239,0) 60%),' +
            'linear-gradient(180deg, #F6F8F6 0%, #EFF4F0 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(27,27,26,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(27,27,26,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden="true"
      />
      {/* A couple of soft "water" blobs, purely decorative. The two mint steps that read as
          atmosphere rather than as ink: `--brand-tint` is `--mint-300` and `--secondary` is
          `--mint-200`, so this is the same pair it always was, named instead of reached for. */}
      <div
        className="absolute -left-16 -top-24 h-72 w-72 rounded-full bg-brand-tint opacity-40 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-20 right-[-10%] h-80 w-80 rounded-full bg-secondary opacity-30 blur-3xl"
        aria-hidden="true"
      />

      {/* Pins. */}
      {places.map((place, index) => {
        const { left, top } = positions[index]!;
        const isSelected = selected?.id === place.id;
        return (
          <button
            key={place.id}
            type="button"
            aria-label={
              place.category
                ? `${place.name} (${PRODUCT_CATEGORY_LABEL[place.category]})`
                : place.name
            }
            onClick={() => handlePinClick(place)}
            className="absolute -translate-x-1/2 -translate-y-full cursor-pointer touch-manipulation transition-transform duration-150 will-change-transform hover:scale-110"
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 drop-shadow-sm"
              style={{ color: isSelected ? 'var(--pin-selected)' : 'var(--pin)' }}
            >
              <path
                d="M12 22s-8-7.4-8-12.5A8 8 0 1 1 20 9.5C20 14.6 12 22 12 22Z"
                fill="currentColor"
              />
              <circle cx="12" cy="9.5" r="3" fill="var(--pin-halo)" />
            </svg>
          </button>
        );
      })}

      {/* Selected-place card: no imperative map popup API exists here, so this is a plain
          absolutely-positioned card reusing the shared primitives. */}
      {selected && (
        <div className="absolute bottom-4 left-1/2 w-[min(360px,calc(100%-2rem))] -translate-x-1/2 sm:bottom-6 sm:left-6 sm:translate-x-0">
          <Card className="shadow-[var(--shadow-elevated)]">
            <CardHeader>
              <CardTitle>{selected.name}</CardTitle>
              <CardDescription>
                {selected.category ? PRODUCT_CATEGORY_LABEL[selected.category] : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {selected.note && <p className="text-sm text-foreground">{selected.note}</p>}
              <div className="flex items-center justify-between gap-2">
                <a
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-brand underline-offset-4 hover:underline"
                >
                  View source
                </a>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
