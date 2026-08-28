'use client';

/**
 * The saved places, on the map: one GeoJSON source and the single symbol layer that draws it.
 *
 * This replaces mapcn's `MapClusterLayer`, which paints every place as the same coloured circle and
 * exposes only `clusterColors` / `clusterThresholds` / `pointColor` — no icon, no label. The
 * category was already on every feature and simply had nowhere to go. Owning the source and the
 * layer is about 100 lines against `useMap()`, an API mapcn exports, and it buys per-category pins
 * and names at close zoom.
 *
 * ## One layer, not three — every saved place is its own pin at every zoom
 *
 * This used to be a *clustered* source with three layers: a circle for the bubble, a symbol for its
 * count, and the pins filtered to `['!', ['has', 'point_count']]`. Owner ruling, 2026-08-28
 * (`docs/06-map-and-places-decision.md` §9.1, `L1-F5-T5`): density clustering of saved places is
 * removed, not tuned. A retrieval product whose whole job is "show me what I saved" must not hide
 * two of them behind a bubble reading `2`. The pin filter went with the cluster layers — with no
 * clustering, no feature ever carries `point_count`, so the filter could only ever have been a
 * no-op pretending to be a safeguard.
 *
 * What that costs, honestly: zoom far enough out and a large library is a mat of overlapping
 * teardrops, because `icon-allow-overlap` is on (and has to be — two saves on one street is normal
 * and a pin that vanishes is worse than two that touch). Measured at the 2 000-place design
 * ceiling, that is a *legibility* problem and not a performance one; `06` §9.1 records the numbers
 * and names the world-zoom country summary as the repair. Do not repair it here by reintroducing
 * density clustering under another name.
 *
 * Everything visual is in `./marker-style.ts` and `./marker-images.ts`.
 */

import { useEffect, useId, useRef } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';

import { buildPinImages } from './marker-images';
import {
  pinIconImageExpression,
  pinLayerLayout,
  pinLayerPaint,
  pinSortKeyExpression,
} from './marker-style';
import type { PlaceFeatureCollection } from './place-features';
import { useStyleReady } from './use-style-ready';

interface PlaceMarkerLayerProps {
  readonly data: PlaceFeatureCollection;
  readonly selectedId: string | null;
  readonly onPlaceClick?: (placeId: string) => void;
}

/**
 * A text font the loaded style already ships glyphs for.
 *
 * Hardcoding a stack is the usual advice and it is a guess about someone else's style: if CARTO's
 * glyph endpoint has no such stack the labels render nothing, silently. Borrowing a stack the
 * style is already drawing with cannot be wrong about the style it came from — but it has to be
 * the right *kind* of stack. Positron's first symbol layer is a water label in Montserrat Italic,
 * so "first one found" put every place name on the map in italics.
 */
function styleTextFont(map: MapLibreMap): string[] {
  let fallback: string[] | null = null;
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const font = layer.layout?.['text-font'];
    if (!Array.isArray(font) || !font.every((f) => typeof f === 'string')) continue;
    const stack = font as string[];
    if (stack.every((f) => !/italic|bold/i.test(f))) return stack;
    fallback ??= stack;
  }
  return fallback ?? ['Open Sans Regular'];
}

export function PlaceMarkerLayer({ data, selectedId, onPlaceClick }: PlaceMarkerLayerProps) {
  const { map } = useMap();
  const styleReady = useStyleReady(map);
  const instanceId = useId().replace(/:/g, '');
  const sourceId = `places-${instanceId}`;
  const pinLayerId = `places-pins-${instanceId}`;

  // Held in a ref so the click listener, which is attached once, always calls the current handler
  // rather than the one that existed at mount.
  const onPlaceClickRef = useRef(onPlaceClick);
  useEffect(() => {
    onPlaceClickRef.current = onPlaceClick;
  }, [onPlaceClick]);

  useEffect(() => {
    if (!map || !styleReady) return;

    /**
     * Teardown, used by the cleanup below **and** before every setup.
     *
     * Doing it on the way in as well is not belt-and-braces. The cleanup runs inside a `try`
     * because the style can be mid-reload, and if `removeLayer` throws, the source is never
     * removed — after which the next setup's `addSource` throws "there is already a source with
     * this ID", aborts the whole effect body, and the map is left with no layer at all and no
     * cleanup registered to recover from. Removing first makes setup idempotent, so a failed
     * teardown costs a repaint instead of the feature.
     */
    const removeOurs = () => {
      try {
        if (map.getLayer(pinLayerId)) map.removeLayer(pinLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // Style mid-reload; whatever is left goes with it.
      }
    };

    removeOurs();

    for (const image of buildPinImages(window.devicePixelRatio || 1)) {
      if (!map.hasImage(image.id)) {
        map.addImage(image.id, image.data, { pixelRatio: image.pixelRatio });
      }
    }

    // Created empty on purpose. Seeding it from a ref written during render is the obvious
    // shape and it is the one that failed here: the source came up with no features and the map
    // stayed blank. The data-sync effect below runs in the same commit, immediately after this
    // one, so "empty then filled" is a single frame rather than a visible gap — and it is the
    // only place `data` is read, which is what makes it correct on every later change too.
    // No `cluster` options. Every saved place is its own feature at every zoom — see the header.
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
      id: pinLayerId,
      type: 'symbol',
      source: sourceId,
      // No `filter`. The old `['!', ['has', 'point_count']]` existed only to keep cluster features
      // out of the pin layer; with nothing clustering, it could only ever be a no-op dressed up as
      // a safeguard, and the next reader would have assumed bubbles still existed somewhere.
      layout: pinLayerLayout(styleTextFont(map)) as never,
      paint: pinLayerPaint() as never,
    });

    const openPlace = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [pinLayerId] })[0];
      const id = feature?.properties?.id;
      if (typeof id === 'string') onPlaceClickRef.current?.(id);
    };

    const pointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const resetPointer = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', pinLayerId, openPlace);
    map.on('mouseenter', pinLayerId, pointer);
    map.on('mouseleave', pinLayerId, resetPointer);

    return () => {
      map.off('click', pinLayerId, openPlace);
      map.off('mouseenter', pinLayerId, pointer);
      map.off('mouseleave', pinLayerId, resetPointer);
      removeOurs();
    };
  }, [map, styleReady, sourceId, pinLayerId]);

  // The source's only writer, and the selection effect below is the layer's. Both run after the
  // creation effect in the same commit, so the layers are never rendered from stale state.
  useEffect(() => {
    if (!map || !styleReady) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [map, styleReady, sourceId, data]);

  useEffect(() => {
    if (!map || !styleReady || !map.getLayer(pinLayerId)) return;
    map.setLayoutProperty(pinLayerId, 'icon-image', pinIconImageExpression(selectedId) as never);
    map.setLayoutProperty(pinLayerId, 'symbol-sort-key', pinSortKeyExpression(selectedId) as never);
  }, [map, styleReady, pinLayerId, selectedId]);

  return null;
}
