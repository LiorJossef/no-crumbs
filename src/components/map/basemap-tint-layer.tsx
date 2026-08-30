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
  TINTED_PAINT_PROPERTIES,
  roleFor,
  tintFor,
  tintPaintValue,
} from './basemap-tint';
import { poiColorExpression, POI_TIERS, type PoiTier } from './poi-style';
import { useStyleReady } from './use-style-ready';

const TINT_ENABLED = true;

/** CARTO's settlement-and-district label layers, smallest first. */
const DISTRICT_LABEL_LAYERS = ['place_suburbs', 'place_hamlet', 'place_villages'] as const;

export function BasemapTint() {
  const { map } = useMap();
  const styleReady = useStyleReady(map);

  useEffect(() => {
    if (!map || !styleReady) return;

    addPoiLabels(map);
    for (const [id, [minzoom, maxzoom]] of Object.entries(LABEL_ZOOM_RANGES)) {
      if (!map.getLayer(id)) continue;
      map.setLayerZoomRange(id, minzoom, maxzoom);
    }

    // EXPERIMENT (exp/richer-basemap): district names in spaced caps, the way the reference draws
    // them. This is label *hierarchy* rather than label count — a neighbourhood set in caps reads
    // as a region containing the street names beneath it, where the same word in sentence case
    // competes with them. CARTO ships the layers; only the treatment is ours.
    for (const id of DISTRICT_LABEL_LAYERS) {
      if (!map.getLayer(id)) continue;
      try {
        map.setLayoutProperty(id, 'text-transform', 'uppercase');
        map.setLayoutProperty(id, 'text-letter-spacing', 0.14);
      } catch {
        // A layer CARTO reshaped. It keeps its own treatment.
      }
    }

    // EXPERIMENT (exp/richer-basemap): the tint machinery is kept, but `BASEMAP_TINTS` is retuned
    // from warm paper to the Mapbox Standard "Day" palette. The mechanism was never the cause of
    // the washed-out look — the eight numbers were. Revert = restore that table.
    if (!TINT_ENABLED) return;

    for (const layer of map.getStyle().layers ?? []) {
      // Our own POI layer is exempt. It carries a `match` on `class` rather than a flat colour
      // (`poi-style.ts`), and the tint's job is to push a colour to one hue — run over this layer
      // it would collapse six families back to one. It used to be *deliberately* included, which
      // was right when the layer was a single grey.
      if (layer.id.startsWith(POI_LABEL_LAYER_ID)) continue;
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
 * Adds the POI names layers Positron withholds, on the `poi` source-layer already present in every
 * tile the basemap loads. See `POI_LABEL_LAYER_ID` for why these are text with no icon.
 *
 * Inserted beneath `roadname_minor` so basemap text never paints over the product's own pins, and
 * `text-optional` lets MapLibre's collision index drop a name rather than push a road label off the
 * map. Both are what keep the saved places the subject of the surface.
 *
 * **One layer per tier** (`poi-style.ts`'s `POI_TIERS`), each with its own `minzoom`, rather than
 * one layer filtered by zoom. `["zoom"]` is not legal inside `filter`, so a zoom threshold that
 * varies per class has to be a layer boundary — and making it one buys the same thing the pin
 * bands buy: MapLibre owns the swap, so nothing here listens for zoom or re-renders on a pinch.
 *
 * Added coarsest-first so the finer tiers sit above them in layer order and win a collision at the
 * zoom where both are drawn; within a tier, placement is MapLibre's own.
 */
function addPoiLabels(map: MapLibreMap): void {
  if (map.getLayer(poiTierLayerId(POI_TIERS[0]!))) return;

  const source = map.getStyle().layers?.find(
    (layer: LayerSpecification) => 'source-layer' in layer && layer['source-layer'] === 'poi',
  );
  // No `poi` layer means CARTO reshaped the style. The basemap is simply left as it ships.
  if (!source || !('source' in source) || typeof source.source !== 'string') return;

  const beforeId = map.getLayer('roadname_minor') ? 'roadname_minor' : undefined;

  for (const tier of POI_TIERS) {
    map.addLayer(
      {
        id: poiTierLayerId(tier),
        type: 'symbol',
        source: source.source,
        'source-layer': 'poi',
        // The tier's own floor. This is the whole of the density fix — see `POI_TIERS`.
        minzoom: tier.minzoom,
        // Legacy filter syntax, matching every other layer in the style. Density within a tier is
        // held down by `text-padding` and `text-optional` against MapLibre's collision index
        // rather than by a rank cut: `rank` is not carried on this source-layer's features, so
        // filtering on it silently matched nothing.
        filter: ['all', ['has', 'name'], ['in', 'class', ...tier.classes]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': [...BASEMAP_LABEL_FONT],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 12.5],
          'text-max-width': 8,
          'text-padding': 6,
          'text-optional': true,
        },
        // Coloured by family rather than one grey, so the eye can sort a field of names into kinds
        // of place before reading any of them. `poi-style.ts` owns the mapping, and it is the same
        // expression on every tier — a tier is a zoom decision, a family is a colour decision.
        paint: {
          'text-color': poiColorExpression() as never,
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.25,
        },
      },
      beforeId,
    );
  }
}

/** The layer id for a tier. Prefixed so the tint's exemption can match them all at once. */
export function poiTierLayerId(tier: PoiTier): string {
  return `${POI_LABEL_LAYER_ID}_${tier.id}`;
}
