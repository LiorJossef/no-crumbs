'use client';

/**
 * The country and area bands, on the map (`docs/ux-library-at-scale.md` §2.1–§2.4).
 *
 * Two sources and two layers, following `place-marker-layer.tsx`'s shape exactly: `useMap()`,
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
 * **Both layers here are symbol layers, and that is load-bearing rather than incidental.** A symbol
 * layer is hit-tested through the collision index, which placement fills only inside the layer's
 * zoom band, so a marker can never answer a tap while it is invisible. The area band was first
 * written as a `circle` layer — the obvious choice, since there is no flag to draw one zoom in —
 * and it was wrong three ways at once: invisible against our own basemap, tappable outside its
 * band, and a 32 px target. `summary-style.ts`'s `areaLayerLayout` records all three. Do not turn
 * it back into a circle to save a bitmap.
 *
 * **One layer per band, not two.** The area band used to carry a second symbol layer for the area's
 * name, drawn beneath the disc, where it landed on the basemap's own label for the same city. The
 * name now lives inside the pill's text field, which is the same field the country band uses.
 */

import { useEffect, useId, useMemo, useRef } from 'react';
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
import { AREA_BAND_STEPS, layoutAreaBand } from './area-band-layout';
import {
  AREA_DISC_SPEC,
  AREA_LAYER_ID,
  areaLayerLayout,
  areaStepFilter,
  COUNTRY_BAND_ZOOM,
  COUNTRY_LAYER_ID,
  countryLayerLayout,
  countryPillsAffordLabels,
  summaryLayerPaint,
} from './summary-style';
import type { AreaFeatureCollection, CountryFeatureCollection } from './summary-features';
import type { SummaryPillLabel } from './country-flag-image';
import { useStyleReady } from './use-style-ready';

interface SummaryMarkerLayerProps {
  readonly countries: CountryFeatureCollection;
  readonly areas: AreaFeatureCollection;
  /** Every pill the country layer's features reference, ready for `addImage`. Built by the caller
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
  /** The band's hierarchy, resolved once per library rather than per frame — see
   *  `area-band-layout.ts`. Memoised on `areas` alone, which is the same key the source is
   *  written on, so a pan, a tap or a re-render never recomputes a layout. */
  const bandAreas = useMemo(() => layoutAreaBand(areas), [areas]);
  const instanceId = useId().replace(/:/g, '');
  const countrySourceId = `country-summary-${instanceId}`;
  const areaSourceId = `area-summary-${instanceId}`;
  const countryLayerId = `${COUNTRY_LAYER_ID}-${instanceId}`;
  /** One layer per pre-computed step (`area-band-layout.ts`), all over the one area source. */
  const areaLayerIds = useMemo(
    () => AREA_BAND_STEPS.map((_, index) => `${AREA_LAYER_ID}-${index}-${instanceId}`),
    [instanceId],
  );

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
        for (const id of [...areaLayerIds, countryLayerId]) {
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

    // The area band goes in first so the country pills, which are bigger and never share a zoom
    // with it, sit above it in the layer order — and so a future band never has to be re-ordered.
    AREA_BAND_STEPS.forEach((step, index) => {
      map.addLayer({
        id: areaLayerIds[index] as string,
        type: 'symbol',
        source: areaSourceId,
        minzoom: step.minzoom,
        maxzoom: step.maxzoom,
        filter: areaStepFilter(index) as never,
        layout: areaLayerLayout(font, countryDiscImageId(AREA_DISC_SPEC, theme)) as never,
        paint: summaryLayerPaint(tokens) as never,
      });
    });
    map.addLayer({
      id: countryLayerId,
      type: 'symbol',
      source: countrySourceId,
      ...COUNTRY_BAND_ZOOM,
      layout: countryLayerLayout(font) as never,
      paint: summaryLayerPaint(tokens) as never,
    });

    // Delegated on both layers, and that is the payoff of drawing the area band as a symbol rather
    // than a circle: a symbol layer is hit-tested through the collision index, which placement
    // fills only inside the band, so neither marker can answer a tap while it is invisible. A
    // circle layer had no such protection and needed a hand-written zoom guard.
    //
    // A point query is also enough. `collision_feature.ts:76-81` adds the icon's `collisionPadding`
    // back onto the fitted box, so the hit box is the whole pill — 50 px tall and at least as wide
    // as its label — where a 15 px circle was a 32 px target and would have needed the query padded
    // out to compensate.
    const openArea = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [...areaLayerIds] })[0];
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

    for (const id of areaLayerIds) map.on('click', id, openArea);
    map.on('click', countryLayerId, openCountry);
    map.on('mouseenter', countryLayerId, pointer);
    map.on('mouseleave', countryLayerId, resetPointer);
    for (const id of areaLayerIds) {
      map.on('mouseenter', id, pointer);
      map.on('mouseleave', id, resetPointer);
    }

    return () => {
      for (const id of areaLayerIds) map.off('click', id, openArea);
      map.off('click', countryLayerId, openCountry);
      map.off('mouseenter', countryLayerId, pointer);
      map.off('mouseleave', countryLayerId, resetPointer);
      for (const id of areaLayerIds) {
        map.off('mouseenter', id, pointer);
        map.off('mouseleave', id, resetPointer);
      }
      removeOurs();
    };
  }, [map, styleReady, theme, countrySourceId, areaSourceId, countryLayerId, areaLayerIds]);

  /**
   * The images and the data, in one effect and in this order.
   *
   * They cannot be separated. A feature whose `icon-image` names an image that has not been added
   * draws no icon, so `setData` before `addImage` is a frame of bare labels on the basemap — the
   * exact defect the pill exists to remove; and the set of images is data-dependent — a country
   * arrives when an import lands in a new one — so they cannot be added once at mount the way the
   * pins' are.
   *
   * `stretchX` and `content` are what make the pill a surface the label sits *inside*: they are the
   * image's half of `icon-text-fit`, and without them MapLibre draws the bitmap at its natural
   * width with the label spilling out of it.
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
        map.addImage(image.id, image.data, {
          pixelRatio: image.pixelRatio,
          stretchX: [...image.stretchX],
          content: [...image.content] as [number, number, number, number],
        });
      }
    }
    (map.getSource(countrySourceId) as GeoJSONSource | undefined)?.setData(countries);
    (map.getSource(areaSourceId) as GeoJSONSource | undefined)?.setData(bandAreas);
  }, [map, styleReady, discs, theme, countries, bandAreas, countrySourceId, areaSourceId]);

  /**
   * The pills the country band is about to draw, as widths — the same string the symbol layer
   * shapes, taken from the features rather than from a constant.
   */
  const countryPillLabels: SummaryPillLabel[] = useMemo(
    () =>
      countries.features.map((feature) => ({
        text: `${feature.properties.label}  ${feature.properties.count}`,
        capped: feature.properties.countryCode !== '',
      })),
    [countries],
  );

  /**
   * **A narrow container drops the country names**, leaving the flag and the count
   * (`countryPillsAffordLabels`).
   *
   * A `setLayoutProperty` rather than a dependency of the layer effect above, deliberately: a
   * rebuild would drop the source with it, and the source is written by a *different* effect keyed
   * on `countries` — so a rebuild triggered by a resize would empty the band until the next data
   * change. One layout property is also what actually differs.
   *
   * `resize` and not a `ResizeObserver`: MapLibre already fires it for every container size change
   * it acts on, including the orientation flip that is the only way a phone crosses this threshold.
   */
  useEffect(() => {
    if (!map || !styleReady) return;
    const apply = () => {
      if (!map.getLayer(countryLayerId)) return;
      const width = map.getContainer().clientWidth;
      const labelled = countryPillsAffordLabels(countryPillLabels, width);
      map.setLayoutProperty(
        countryLayerId,
        'text-field',
        countryLayerLayout(styleTextFont(map), labelled)['text-field'] as never,
      );
    };
    apply();
    map.on('resize', apply);
    return () => {
      map.off('resize', apply);
    };
  }, [map, styleReady, countryLayerId, countryPillLabels]);

  return null;
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
