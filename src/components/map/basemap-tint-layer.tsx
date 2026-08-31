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
import type { Theme } from '@/lib/theme';
import { useMap } from '@/components/ui/map';
import { useResolvedTheme } from '@/components/theme/theme-provider';

import {
  BASEMAP_LABEL_FONT,
  LABEL_ZOOM_RANGES,
  POI_LABEL_LAYER_ID,
  TINTED_PAINT_PROPERTIES,
  roleFor,
  tintColor,
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
  /**
   * **The opt-in that makes the night basemap reachable (W7-3).**
   *
   * Everything in `basemap-tint.ts` and `poi-style.ts` takes an optional theme defaulting to light,
   * so until this line existed the night tables were built, measured and applied to nothing — and
   * with the provider mounted a user on a dark device was getting a *light basemap under dark
   * chrome*, which is the one combination that reads as a bug rather than as an unfinished feature.
   *
   * `theme` is in the effect's dependencies, so a change re-runs the whole body: CARTO's own layers
   * are re-tinted from the style's current paint, and the POI layers are repainted below. It is not
   * enough to colour them once — the toggle has to move a map that is already on screen.
   */
  const theme = useResolvedTheme();

  useEffect(() => {
    if (!map || !styleReady) return;

    addPoiLabels(map, theme);
    repaintPoiLabels(map, theme);
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
        const tintedValue = tintPaintValue(paint[property], tintFor(role, property, theme));
        try {
          map.setPaintProperty(layer.id, property, tintedValue as never);
        } catch {
          // A property this layer type does not accept, or a style mid-reload. The layer keeps
          // CARTO's own colour, which is the right thing to fall back to.
        }
      }
    }
  }, [map, styleReady, theme]);

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
function addPoiLabels(map: MapLibreMap, theme: Theme): void {
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
          'text-color': poiColorExpression(theme) as never,
          'text-halo-color': poiHaloColor(theme),
          'text-halo-width': 1.25,
        },
      },
      beforeId,
    );
  }
}

/**
 * The POI halo, through the basemap's own halo tint rather than as a second literal.
 *
 * This layer is exempt from the tint *loop* — a `match` on `class` would collapse six families to
 * one hue — but its halo is not a family colour, it is the ground showing through, and it has to be
 * the same ground every other label sits on. Running white through `labelHalo`'s tint is what
 * guarantees that: in light the halo tint is uncapped, and any hue at L = 1 is white, so this is
 * `#ffffff` exactly as it was before. At night `labelHalo` caps near black and this follows it.
 */
function poiHaloColor(theme: Theme): string {
  return tintColor('#ffffff', tintFor('label', 'text-halo-color', theme));
}

/**
 * Repaint the POI tiers for the current theme.
 *
 * `addPoiLabels` returns early once its layers exist, which is correct — they are added once per
 * style load. But a theme change does not reload the style, so without this the names would keep
 * whichever palette they were born with and a toggle would move every layer on the map except the
 * one this file added.
 */
function repaintPoiLabels(map: MapLibreMap, theme: Theme): void {
  for (const tier of POI_TIERS) {
    const id = poiTierLayerId(tier);
    if (!map.getLayer(id)) continue;
    try {
      map.setPaintProperty(id, 'text-color', poiColorExpression(theme) as never);
      map.setPaintProperty(id, 'text-halo-color', poiHaloColor(theme));
    } catch {
      // A style mid-reload. The next style-ready pass re-runs this whole effect.
    }
  }
}

/** The layer id for a tier. Prefixed so the tint's exemption can match them all at once. */
export function poiTierLayerId(tier: PoiTier): string {
  return `${POI_LABEL_LAYER_ID}_${tier.id}`;
}
