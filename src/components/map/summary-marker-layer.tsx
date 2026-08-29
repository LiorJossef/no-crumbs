'use client';

/**
 * The country and area bands, on the map (`docs/ux-library-at-scale.md` §2.1–§2.4).
 *
 * Two sources and four layers, following `place-marker-layer.tsx`'s shape exactly: `useMap()`,
 * `useStyleReady()`, teardown-before-setup so a failed cleanup costs a repaint instead of the
 * feature, and one effect that owns the data.
 *
 * **In its own file, not added to `place-marker-layer.tsx`, for two reasons.** The pin layer's
 * "there is exactly one `addLayer` here and it has no cluster filter" is asserted against that
 * file's *source text* (`tests/unit/map/no-density-clustering.test.ts`) — a guard that has to stay
 * readable as what it is. And these layers answer a different question: the pins are your places,
 * these are a summary of them, and the two have separate lifetimes because the summary's images
 * depend on the set of countries in the library while the pins' do not.
 *
 * ## What MapLibre owns and what we own
 *
 * The **swap between the three bands is entirely MapLibre's**: `minzoom`/`maxzoom` on the layers,
 * so there is no zoom listener, no React state that changes on zoom, and no re-render as the user
 * pinches. That is the whole design of §2.1 and it is why the transition costs nothing.
 *
 * **Every layer here is a symbol layer, including the area band, and that is load-bearing rather
 * than incidental.** A symbol layer is hit-tested through the collision index, which placement
 * fills only inside the layer's zoom band, so a marker can never answer a tap while it is
 * invisible. The area band was first written as a `circle` layer — the obvious choice, since there
 * is no flag to draw one zoom in — and it was wrong three ways at once: invisible against our own
 * basemap, tappable outside its band, and a 32 px target. `summary-style.ts`'s
 * `areaDiscLayerLayout` records all three. Do not turn it back into a circle to save a bitmap.
 */

import { useEffect, useId, useRef } from 'react';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';

import {
  buildCountryDiscImages,
  countryDiscImageId,
  resolveDiscTokens,
  type CountryDiscSpec,
  type DiscTheme,
} from './country-flag-image';
import { styleTextFont } from './style-text-font';
import {
  AREA_BAND_ZOOM,
  AREA_DISC_LAYER_ID,
  AREA_DISC_SPEC,
  AREA_LABEL_LAYER_ID,
  areaDiscLayerLayout,
  areaDiscLayerPaint,
  areaLabelLayerLayout,
  areaLabelLayerPaint,
  COUNTRY_BAND_ZOOM,
  COUNTRY_LAYER_ID,
  countryLayerLayout,
  countryLayerPaint,
} from './summary-style';
import type { AreaFeatureCollection, CountryFeatureCollection } from './summary-features';
import { useStyleReady } from './use-style-ready';

interface SummaryMarkerLayerProps {
  readonly countries: CountryFeatureCollection;
  readonly areas: AreaFeatureCollection;
  /** Every disc the country layer's features reference, ready for `addImage`. Built by the caller
   *  so this component never has to know what a country *is*. */
  readonly discs: readonly CountryDiscSpec[];
  readonly theme: DiscTheme;
  readonly onCountryClick?: (key: string) => void;
  readonly onAreaClick?: (areaId: string) => void;
}

export function SummaryMarkerLayer({
  countries,
  areas,
  discs,
  theme,
  onCountryClick,
  onAreaClick,
}: SummaryMarkerLayerProps) {
  const { map } = useMap();
  const styleReady = useStyleReady(map);
  const instanceId = useId().replace(/:/g, '');
  const countrySourceId = `country-summary-${instanceId}`;
  const areaSourceId = `area-summary-${instanceId}`;
  const countryLayerId = `${COUNTRY_LAYER_ID}-${instanceId}`;
  const areaDiscLayerId = `${AREA_DISC_LAYER_ID}-${instanceId}`;
  const areaLabelLayerId = `${AREA_LABEL_LAYER_ID}-${instanceId}`;

  // Held in refs so the listeners, attached once with the layers, always call the current handlers
  // rather than the ones that existed at mount.
  const onCountryClickRef = useRef(onCountryClick);
  const onAreaClickRef = useRef(onAreaClick);
  useEffect(() => {
    onCountryClickRef.current = onCountryClick;
    onAreaClickRef.current = onAreaClick;
  }, [onCountryClick, onAreaClick]);

  useEffect(() => {
    if (!map || !styleReady) return;

    const removeOurs = () => {
      try {
        for (const id of [areaLabelLayerId, areaDiscLayerId, countryLayerId]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of [areaSourceId, countrySourceId]) {
          if (map.getSource(id)) map.removeSource(id);
        }
      } catch {
        // Style mid-reload; whatever is left goes with it.
      }
    };

    removeOurs();

    const tokens = resolveDiscTokens(theme);
    const font = styleTextFont(map);

    map.addSource(countrySourceId, { type: 'geojson', data: emptyCollection() });
    map.addSource(areaSourceId, { type: 'geojson', data: emptyCollection() });

    // The area band goes in first so the country discs, which are bigger and never share a zoom
    // with it, sit above it in the layer order — and so a future band never has to be re-ordered.
    map.addLayer({
      id: areaDiscLayerId,
      type: 'symbol',
      source: areaSourceId,
      ...AREA_BAND_ZOOM,
      layout: areaDiscLayerLayout(font, countryDiscImageId(AREA_DISC_SPEC, theme)) as never,
      paint: areaDiscLayerPaint(tokens) as never,
    });
    map.addLayer({
      id: areaLabelLayerId,
      type: 'symbol',
      source: areaSourceId,
      ...AREA_BAND_ZOOM,
      layout: areaLabelLayerLayout(font) as never,
      paint: areaLabelLayerPaint(tokens) as never,
    });
    map.addLayer({
      id: countryLayerId,
      type: 'symbol',
      source: countrySourceId,
      ...COUNTRY_BAND_ZOOM,
      layout: countryLayerLayout(font) as never,
      paint: countryLayerPaint(tokens) as never,
    });

    // Delegated on both layers now, and that is the payoff of drawing the area band as a symbol
    // rather than a circle: a symbol layer is hit-tested through the collision index, which
    // placement fills only inside the band, so neither marker can answer a tap while it is
    // invisible. A circle layer had no such protection and needed a hand-written zoom guard.
    //
    // A point query is also enough now. The disc is a 59 px bitmap, so its icon hit box clears
    // §6's 44 px floor on its own — where a 15 px circle was a 32 px target and would have needed
    // the query padded out to compensate.
    const openArea = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [areaDiscLayerId] })[0];
      const id = feature?.properties?.id;
      if (typeof id === 'string') onAreaClickRef.current?.(id);
    };

    const openCountry = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [countryLayerId] })[0];
      const key = feature?.properties?.key;
      if (typeof key === 'string') onCountryClickRef.current?.(key);
    };

    const pointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const resetPointer = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', areaDiscLayerId, openArea);
    map.on('click', countryLayerId, openCountry);
    map.on('mouseenter', countryLayerId, pointer);
    map.on('mouseleave', countryLayerId, resetPointer);
    map.on('mouseenter', areaDiscLayerId, pointer);
    map.on('mouseleave', areaDiscLayerId, resetPointer);

    return () => {
      map.off('click', areaDiscLayerId, openArea);
      map.off('click', countryLayerId, openCountry);
      map.off('mouseenter', countryLayerId, pointer);
      map.off('mouseleave', countryLayerId, resetPointer);
      map.off('mouseenter', areaDiscLayerId, pointer);
      map.off('mouseleave', areaDiscLayerId, resetPointer);
      removeOurs();
    };
  }, [
    map,
    styleReady,
    theme,
    countrySourceId,
    areaSourceId,
    countryLayerId,
    areaDiscLayerId,
    areaLabelLayerId,
  ]);

  /**
   * The images and the data, in one effect and in this order.
   *
   * They cannot be separated. A feature whose `icon-image` names an image that has not been added
   * draws no icon, so `setData` before `addImage` is a frame of countless discs; and the set of
   * images is data-dependent — a country arrives when an import lands in a new one — so they cannot
   * be added once at mount the way the pins' are.
   *
   * Nothing is ever removed. `removeImage` on an id nothing references costs an `ErrorEvent`, and on
   * one something does it forces a reload of every tile that used it; the images are a handful of
   * small bitmaps and a session has one theme, so keeping them is the cheap side of the trade.
   * `styleReady` is in the deps because `setStyle` constructs a fresh `ImageManager` — a style swap
   * destroys every added image, and this effect re-adding them is what recovers from that.
   */
  useEffect(() => {
    if (!map || !styleReady) return;
    for (const image of buildCountryDiscImages(discs, {
      pixelRatio: window.devicePixelRatio || 1,
      theme,
    })) {
      if (!map.hasImage(image.id)) {
        map.addImage(image.id, image.data, { pixelRatio: image.pixelRatio });
      }
    }
    (map.getSource(countrySourceId) as GeoJSONSource | undefined)?.setData(countries);
    (map.getSource(areaSourceId) as GeoJSONSource | undefined)?.setData(areas);
  }, [map, styleReady, discs, theme, countries, areas, countrySourceId, areaSourceId]);

  return null;
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
