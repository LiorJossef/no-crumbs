'use client';

/**
 * Applies `./basemap-tint.ts` to the live style, once per style load.
 *
 * A component rather than a call inside the map surface so it hangs off the same `useMap()` gate
 * every other layer does: a style swap discards the paint along with the style, so the tint has
 * to be re-applied to each freshly loaded Positron.
 */

import { useEffect } from 'react';
import { useMap } from '@/components/ui/map';

import { TINTED_PAINT_PROPERTIES, roleFor, tintFor, tintPaintValue } from './basemap-tint';
import { useStyleReady } from './use-style-ready';

export function BasemapTint() {
  const { map } = useMap();
  const styleReady = useStyleReady(map);

  useEffect(() => {
    if (!map || !styleReady) return;

    for (const layer of map.getStyle().layers ?? []) {
      const role = roleFor(layer.id);
      if (!role) continue;
      const paint = (layer as { paint?: Record<string, unknown> }).paint;
      if (!paint) continue;

      for (const property of TINTED_PAINT_PROPERTIES) {
        if (!(property in paint)) continue;
        const tintedValue = tintPaintValue(paint[property], tintFor(role, property));
        try {
          map.setPaintProperty(layer.id, property, tintedValue as never);
        } catch {
          // A property this layer type does not accept, or a style mid-reload. The layer keeps
          // CARTO's own colour, which is the right thing to fall back to.
        }
      }
    }
  }, [map, styleReady]);

  return null;
}
