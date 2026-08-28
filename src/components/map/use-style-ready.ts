'use client';

/**
 * Whether the map has a style whose layers exist yet — the actual precondition for adding a source,
 * adding a layer, or reading a font stack off one.
 *
 * Two nearby signals are both wrong for this, and each cost a debugging round:
 *
 * - **mapcn's `isLoaded`** is `map.on('load')` and `style.load` together, and `load` is the wrong
 *   half. MapLibre fires it only after a visually complete frame, so a map whose render loop has
 *   not run — a container with no size at construction, a tab whose `requestAnimationFrame` is
 *   throttled — sits at `loaded() === false` forever with a perfectly good style underneath.
 *   Gating layer creation on it means the layers are never added at all.
 * - **`map.isStyleLoaded()`** reads like the right question and is not: it also requires the
 *   style's source caches to be loaded, which is tile work, which is again the render loop.
 *   Measured here at `isStyleLoaded() === false` with all 93 Positron layers present and queryable.
 *
 * What both consumers actually need is that the layers are there, so that is what this asks.
 * `map-surface.mapcn.tsx`'s `whenReady` learned the same lesson about camera commands.
 *
 * `useSyncExternalStore` rather than state plus an effect, because the interesting case is the one
 * where the style finished loading *before* anything subscribed: a snapshot read at render time is
 * correct then, where an effect that has to call `setState` to catch up both lags a frame and
 * cascades a render.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

/** Every event that can change the answer. A swap fires `styledataloading` on the way down and
 *  `style.load` on the way back up; `styledata` covers everything in between. */
const STYLE_EVENTS = ['style.load', 'styledata', 'styledataloading'] as const;

export function useStyleReady(map: MapLibreMap | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!map) return () => {};
      for (const event of STYLE_EVENTS) map.on(event, onChange);
      return () => {
        for (const event of STYLE_EVENTS) map.off(event, onChange);
      };
    },
    [map]
  );

  const snapshot = useCallback(() => {
    try {
      return (map?.getStyle()?.layers?.length ?? 0) > 0;
    } catch {
      // `getStyle` serialises, and serialising a style that is still arriving can throw.
      return false;
    }
  }, [map]);

  return useSyncExternalStore(subscribe, snapshot, () => false);
}
