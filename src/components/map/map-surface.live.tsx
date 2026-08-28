'use client';

/**
 * Pre-L1 vertical slice map (`docs/execution-plan.md`'s deviation note): MapLibre GL + Protomaps
 * rendering the `places` prop as a clustered GeoJSON source. Not `L1-F5` — no camera-mover
 * discipline, no design tokens, no persistence.
 *
 * This is one implementation of the `MapSurfaceProps` port (`./types.ts`); it is not the public
 * `MapSurface` component — see `./map-surface.tsx`, the swap point — because no MapLibre type may
 * cross the port seam.
 *
 * ## Its clustering is superseded and must not be copied forward
 *
 * The `cluster: true` source below, its two cluster layers and its expansion-zoom tap handler are
 * **the behaviour the owner ruled out on 2026-08-28** (`06-map-and-places-decision.md` §9.1):
 * collapsing nearby saved places into a numbered bubble — a pair especially — is wrong for a
 * retrieval product, because at city and local browsing zoom the user must see the actual pins.
 * `map-surface.mapcn.tsx`, the wired implementation, has had all of it removed.
 *
 * It survives here only because this file is a **deliberately unwired raw-MapLibre reference**
 * (`map-surface.tsx` line 20 keeps its import commented out and says "Do not wire it in"), and
 * gutting a reference reduces the only value it has. **Wiring this file in as-is would reinstate
 * the ruled-out behaviour.** That is the whole reason this paragraph exists: the ruling asks for
 * the reasoning to travel with the code so nobody re-derives the bubble from an implementation
 * that still shows one.
 */

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapGeoJSONFeature, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapPlace, MapSurfaceProps } from './types';

const SOURCE_ID = 'saved-places';
const CLUSTER_LAYER_ID = 'saved-places-clusters';
const CLUSTER_COUNT_LAYER_ID = 'saved-places-cluster-count';
const UNCLUSTERED_LAYER_ID = 'saved-places-unclustered';

function toFeatureCollection(places: readonly MapPlace[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.map((place) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [place.lng, place.lat],
      },
      properties: {
        id: place.id,
        name: place.name,
        category: place.category,
        note: place.note,
      },
    })),
  };
}

function boundsFor(places: readonly MapPlace[]): maplibregl.LngLatBounds | null {
  if (places.length === 0) return null;
  const bounds = new maplibregl.LngLatBounds();
  for (const place of places) {
    bounds.extend([place.lng, place.lat]);
  }
  return bounds;
}

export function MapSurfaceLive({ places, onPlaceClick }: MapSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_PROTOMAPS_API_KEY;
    const bounds = boundsFor(places);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.protomaps.com/styles/v5/light/en.json?key=${apiKey}`,
      ...(bounds ? { bounds, fitBoundsOptions: { padding: 60 } } : { center: [0, 20], zoom: 1 }),
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(places),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#4f46e5',
          'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 10, 26],
          'circle-opacity': 0.85,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#dc2626',
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', CLUSTER_LAYER_ID, (event: MapLayerMouseEvent) => {
        const [feature] = map.queryRenderedFeatures(event.point, {
          layers: [CLUSTER_LAYER_ID],
        }) as MapGeoJSONFeature[];
        const clusterId = feature?.properties?.cluster_id;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        if (!feature || clusterId === undefined) return;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = feature.geometry as Point;
          map.easeTo({ center: geometry.coordinates as [number, number], zoom });
        });
      });

      map.on('click', UNCLUSTERED_LAYER_ID, (event: MapLayerMouseEvent) => {
        const [feature] = event.features ?? [];
        if (!feature) return;
        const geometry = feature.geometry as Point;
        const { id, name, category, note } = feature.properties as {
          id: string;
          name: string;
          category: MapPlace['category'];
          note: string;
        };

        new maplibregl.Popup({ offset: 12 })
          .setLngLat(geometry.coordinates as [number, number])
          .setHTML(
            `<strong>${name}</strong><br/><em>${category}</em><br/>${note}`,
          )
          .addTo(map);

        if (onPlaceClick) {
          const place = places.find((candidate) => candidate.id === id);
          if (place) onPlaceClick(place);
        }
      });

      map.on('mouseenter', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', UNCLUSTERED_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', UNCLUSTERED_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once map, matching the prior implementation
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
