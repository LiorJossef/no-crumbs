'use client';

/**
 * The saved places, on the map: a clustered GeoJSON source and the three layers that draw it.
 *
 * This replaces mapcn's `MapClusterLayer`, which paints every place as the same coloured circle
 * and exposes only `clusterColors` / `clusterThresholds` / `pointColor` — no icon, no label, no
 * cluster-click behaviour. The category was already on every feature and simply had nowhere to go.
 * Owning the source and the layers is about 150 lines against `useMap()`, an API mapcn exports,
 * and it buys per-category pins, names at close zoom, and clusters that open when you tap them.
 *
 * Everything visual is in `./marker-style.ts` and `./marker-images.ts`.
 */

import { useEffect, useId, useRef } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';

import { buildPinImages } from './marker-images';
import {
  CLUSTER,
  LABEL_MAX_WIDTH_EM,
  LABEL_MIN_ZOOM,
  clusterRadiusExpression,
  clusterTextSizeExpression,
  pinGeometry,
  pinIconImageExpression,
  pinSortKeyExpression,
} from './marker-style';
import type { PlaceFeatureCollection } from './place-features';

interface PlaceMarkerLayerProps {
  readonly data: PlaceFeatureCollection;
  readonly selectedId: string | null;
  readonly onPlaceClick?: (placeId: string) => void;
}

/** Places stop clustering here, so a neighbourhood always shows its individual pins. */
const CLUSTER_MAX_ZOOM = 13;
const CLUSTER_RADIUS_PX = 46;

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
  const { map, isLoaded } = useMap();
  const instanceId = useId().replace(/:/g, '');
  const sourceId = `places-${instanceId}`;
  const clusterLayerId = `places-clusters-${instanceId}`;
  const clusterCountLayerId = `places-cluster-count-${instanceId}`;
  const pinLayerId = `places-pins-${instanceId}`;

  // Held in a ref so the click listener, which is attached once, always calls the current handler
  // rather than the one that existed at mount.
  const onPlaceClickRef = useRef(onPlaceClick);
  useEffect(() => {
    onPlaceClickRef.current = onPlaceClick;
  }, [onPlaceClick]);

  useEffect(() => {
    if (!map || !isLoaded) return;

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
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS_PX,
    });

    map.addLayer({
      id: clusterLayerId,
      type: 'circle',
      source: sourceId,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': CLUSTER.color,
        'circle-radius': clusterRadiusExpression() as never,
        'circle-stroke-color': CLUSTER.ringColor,
        'circle-stroke-width': CLUSTER.ringWidth,
      },
    });

    const textFont = styleTextFont(map);

    map.addLayer({
      id: clusterCountLayerId,
      type: 'symbol',
      source: sourceId,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': textFont,
        'text-size': clusterTextSizeExpression() as never,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': CLUSTER.textColor },
    });

    const geometry = pinGeometry(false);

    map.addLayer({
      id: pinLayerId,
      type: 'symbol',
      source: sourceId,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': pinIconImageExpression(null) as never,
        'icon-anchor': 'bottom',
        // Push the bitmap down by the gap its shadow leaves under the tip, so the point of the
        // teardrop — not the bottom edge of the image — sits on the coordinate.
        'icon-offset': [0, geometry.tipToBottom],
        // Pins must never be dropped for colliding with each other: two saves on one street is
        // normal, and a place that vanishes is worse than two that overlap. Their *labels* still
        // collide, which is the collision that should happen.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': pinSortKeyExpression(null) as never,
        'text-field': ['step', ['zoom'], '', LABEL_MIN_ZOOM, ['get', 'name']] as never,
        'text-font': textFont,
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 0.4],
        'text-max-width': LABEL_MAX_WIDTH_EM,
        // Your own places outrank the basemap. With collision on, MapLibre places symbols in
        // layer order and ours is the last layer, so every name lost to a street label that was
        // already there — measured at zoom 14 with six pins on screen and not one name drawn.
        // `ignore-placement` too, so winning does not cost the basemap its own labels.
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#1B1B1A',
        'text-halo-color': '#FAF9F6',
        'text-halo-width': 1.6,
      },
    });

    const openCluster = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [clusterLayerId] })[0];
      const clusterId = feature?.properties?.cluster_id;
      if (!feature || typeof clusterId !== 'number') return;
      const source = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (!source) return;
      const centre = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      void source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => map.easeTo({ center: centre, zoom, duration: 400 }))
        // A cluster that cannot expand still deserves a response: step in one level.
        .catch(() => map.easeTo({ center: centre, zoom: map.getZoom() + 1.5, duration: 400 }));
    };

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

    map.on('click', clusterLayerId, openCluster);
    map.on('click', pinLayerId, openPlace);
    for (const layerId of [clusterLayerId, pinLayerId]) {
      map.on('mouseenter', layerId, pointer);
      map.on('mouseleave', layerId, resetPointer);
    }

    return () => {
      map.off('click', clusterLayerId, openCluster);
      map.off('click', pinLayerId, openPlace);
      for (const layerId of [clusterLayerId, pinLayerId]) {
        map.off('mouseenter', layerId, pointer);
        map.off('mouseleave', layerId, resetPointer);
      }
      try {
        for (const layerId of [pinLayerId, clusterCountLayerId, clusterLayerId]) {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // The style can be mid-reload during teardown; the layers go with it either way.
      }
    };
  }, [map, isLoaded, sourceId, clusterLayerId, clusterCountLayerId, pinLayerId]);

  // The source's only writer, and the selection effect below is the layer's. Both run after the
  // creation effect in the same commit, so the layers are never rendered from stale state.
  useEffect(() => {
    if (!map || !isLoaded) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [map, isLoaded, sourceId, data]);

  useEffect(() => {
    if (!map || !isLoaded || !map.getLayer(pinLayerId)) return;
    map.setLayoutProperty(pinLayerId, 'icon-image', pinIconImageExpression(selectedId) as never);
    map.setLayoutProperty(pinLayerId, 'symbol-sort-key', pinSortKeyExpression(selectedId) as never);
  }, [map, isLoaded, pinLayerId, selectedId]);

  return null;
}
