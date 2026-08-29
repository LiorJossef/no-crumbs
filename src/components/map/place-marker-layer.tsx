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
 * ## One layer, not three — every saved place is its own pin, everywhere the pins are drawn
 *
 * This used to be a *clustered* source with three layers: a circle for the bubble, a symbol for its
 * count, and the pins filtered to `['!', ['has', 'point_count']]`. Owner ruling, 2026-08-28
 * (`docs/06-map-and-places-decision.md` §9.1, `L1-F5-T5`): density clustering of saved places is
 * removed, not tuned. A retrieval product whose whole job is "show me what I saved" must not hide
 * two of them behind a bubble reading `2`. The pin filter went with the cluster layers — with no
 * clustering, no feature ever carries `point_count`, so the filter could only ever have been a
 * no-op pretending to be a safeguard.
 *
 * What that cost, honestly: zoom far enough out and a large library was a mat of overlapping
 * teardrops, because `icon-allow-overlap` is on (and has to be — two saves on one street is normal
 * and a pin that vanishes is worse than two that touch). Measured at the 2 000-place design
 * ceiling, that is a *legibility* problem and not a performance one; `06` §9.1 recorded the numbers
 * and named the world-zoom country summary as the repair.
 *
 * **That repair has landed, and it is a `minzoom` rather than a cluster.** Below `PIN_BAND_MIN`
 * this layer simply stops drawing and `summary-marker-layer.tsx` draws named areas and then
 * countries instead (`ux-library-at-scale.md` §2.1). Nothing here merges two places, counts a
 * radius, or hides anything behind a number — zoom back in and every pin returns, with no
 * expansion gesture. Do not repair anything here by reintroducing density clustering under another
 * name; the band is the sanctioned answer and a bubble is still not one.
 *
 * Everything visual is in `./marker-style.ts` and `./marker-images.ts`.
 */

import { useEffect, useId, useRef } from 'react';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';

import { buildPinImages } from './marker-images';
import {
  pinIconImageExpression,
  pinLayerLayout,
  pinLayerPaint,
  pinSortKeyExpression,
} from './marker-style';
import type { PlaceFeatureCollection } from './place-features';
import { styleTextFont } from './style-text-font';
import { useStyleReady } from './use-style-ready';
import { PIN_BAND_MIN } from './zoom-bands';

interface PlaceMarkerLayerProps {
  readonly data: PlaceFeatureCollection;
  readonly selectedId: string | null;
  readonly onPlaceClick?: (placeId: string) => void;
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
      //
      // The pin band's floor (`zoom-bands.ts`, `ux-library-at-scale.md` §2.1). Above it every saved
      // place is its own pin exactly as before; below it the area and country summaries take over.
      //
      // **This is not clustering returning under another name.** Nothing merges, nothing counts a
      // radius, and no feature in this source is ever anything but one saved place. What changes is
      // that at a zoom where the pins were an unreadable mat of overlapping teardrops — the honest
      // cost `L1-F5-T5` accepted and `06` §9.1 named the world-zoom summary as the repair for —
      // MapLibre draws a different, *named* layer instead. Zoom back in and the same pins return,
      // all of them, with no expansion gesture and nothing hidden behind a number.
      //
      // MapLibre owns the swap: `minzoom` is a property of the layer, so there is no zoom listener,
      // no React state and no re-render as the user pinches. The click handler below inherits the
      // band for free — a symbol layer is hit-tested through the collision index, which placement
      // only fills inside the band, so a pin cannot answer a tap while it is invisible. (A *circle*
      // layer would; see `inBand` and the area disc's own guard.)
      minzoom: PIN_BAND_MIN,
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
