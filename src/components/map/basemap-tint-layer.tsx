'use client';

/**
 * Applies `./basemap-tint.ts` to the live style, once per style load.
 *
 * A component rather than a call inside the map surface so it hangs off the same `useMap()` gate
 * every other layer does: a style swap discards the paint along with the style, so the tint has
 * to be re-applied to each freshly loaded Positron.
 */

import { useEffect } from 'react';
import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';

import {
  BASEMAP_LABEL_FONT,
  LABEL_ZOOM_RANGES,
  POI_LABEL_LAYER_ID,
  POI_LABEL_CLASSES,
  POI_LABEL_MIN_ZOOM,
  TINTED_PAINT_PROPERTIES,
  roleFor,
  tintFor,
  tintPaintValue,
} from './basemap-tint';
import { useStyleReady } from './use-style-ready';

export function BasemapTint() {
  const { map } = useMap();
  const styleReady = useStyleReady(map);

  useEffect(() => {
    if (!map || !styleReady) return;

    // Before the tint, so the POI layer it adds is coloured by the same pass below.
    addPoiLabels(map);
    for (const [id, [minzoom, maxzoom]] of Object.entries(LABEL_ZOOM_RANGES)) {
      if (!map.getLayer(id)) continue;
      map.setLayerZoomRange(id, minzoom, maxzoom);
    }

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

/**
 * Adds the POI names layer Positron withholds, on the `poi` source-layer already present in every
 * tile the basemap loads. See `POI_LABEL_LAYER_ID` for why this is text with no icon.
 *
 * Inserted beneath `roadname_minor` so basemap text never paints over the product's own pins, and
 * `text-optional` lets MapLibre's collision index drop a name rather than push a road label off the
 * map. Both are what keep the saved places the subject of the surface.
 */
function addPoiLabels(map: MapLibreMap): void {
  if (map.getLayer(POI_LABEL_LAYER_ID)) return;

  const source = map.getStyle().layers?.find(
    (layer: LayerSpecification) => 'source-layer' in layer && layer['source-layer'] === 'poi',
  );
  // No `poi` layer means CARTO reshaped the style. The basemap is simply left as it ships.
  if (!source || !('source' in source) || typeof source.source !== 'string') return;

  map.addLayer(
    {
      id: POI_LABEL_LAYER_ID,
      type: 'symbol',
      source: source.source,
      'source-layer': 'poi',
      minzoom: POI_LABEL_MIN_ZOOM,
      // Legacy filter syntax, matching every other layer in the style. Density is held down by
      // `text-padding` and `text-optional` against MapLibre's collision index rather than by a
      // rank cut: `rank` is not carried on this source-layer's features, so filtering on it
      // silently matched nothing.
      filter: ['all', ['has', 'name'], ['in', 'class', ...POI_LABEL_CLASSES]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': [...BASEMAP_LABEL_FONT],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 9, 18, 11],
        'text-max-width': 8,
        'text-padding': 6,
        'text-optional': true,
      },
      paint: { 'text-color': '#8a8a8a', 'text-halo-color': '#ffffff', 'text-halo-width': 1 },
    },
    map.getLayer('roadname_minor') ? 'roadname_minor' : undefined,
  );
}
