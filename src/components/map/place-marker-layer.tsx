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
 * ## The floor is conditional, because it is only ever paid for by a replacement
 *
 * `replacedBelowZoom` is required rather than defaulted, and it is the whole of the fix for the
 * blank collection map (`docs/handoff-2026-08-29-navigation-pages.md` §5.1). This layer used to
 * apply `minzoom: PIN_BAND_MIN` unconditionally, to every `MapSurface`. On `/map` that is correct
 * — the bands take over. On `/collections/[id]`, which mounts the same surface and passes no
 * `summaries`, it deleted the pins at z<8.5 and put **nothing** in their place: the owner zoomed
 * out and the map was empty.
 *
 * So the caller states the replacement rather than this file assuming one. `null` means "nothing
 * replaces these pins", and a layer with no replacement keeps its pins at every zoom, because for
 * that surface the floor is pure loss and never the trade §9.1 accepted. Do not reintroduce a
 * default here: a default is exactly how the assumption became invisible the first time.
 *
 * Everything visual is in `./marker-style.ts` and `./marker-images.ts`.
 */

import { useEffect, useId, useMemo, useRef } from 'react';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';

import { buildPinImages } from './marker-images';
import {
  LABEL_TIER_ZOOMS,
  labelTierFor,
  metresPerPixel,
  LABEL_CLEARANCE_PX,
  pinIconImageExpression,
  pinLayerLayout,
  pinLayerPaint,
  pinSortKeyExpression,
} from './marker-style';
import type { PlaceFeatureCollection } from './place-features';
import { styleTextFont } from './style-text-font';
import { useStyleReady } from './use-style-ready';

/** Metres per degree of latitude. Constant enough at this scale; longitude is scaled by `cos φ`. */
const METRES_PER_DEGREE = 111320;

/**
 * **Which zoom each pin's name is allowed to appear at** — the per-feature half of `W2-3`'s label
 * tiering (`marker-style.ts`, `LABEL_TIER_ZOOMS`).
 *
 * A pin's name is drawn at the first tier by which its **nearest neighbour** is
 * `LABEL_CLEARANCE_PX` away on screen, so the thing that decides is the library's own geometry: a
 * place alone in its city is named on the overview, and nine places on one street are named once
 * the user has zoomed in far enough to tell them apart. Labels are drawn with collision off (see
 * this file's layer spec) and nothing else thins them, which is what makes the separation the
 * honest test rather than a count or a zoom guess.
 *
 * ## The grid, and why it is not `O(n²)`
 *
 * The design ceiling is 2 000 places (`06` §9.1) and this runs on every change to the source —
 * which includes every keystroke in the search box, because filtering rebuilds the collection. A
 * pairwise scan is four million distance tests per keystroke.
 *
 * So points are bucketed into a grid whose cell is the coarsest tier's own clearance, each point is
 * compared only against its own cell and the eight around it, and the scan **stops early** the
 * moment it finds a neighbour closer than the finest tier's clearance — because everything below
 * that resolves to the same answer (`LABEL_ALL_ZOOM`) and no closer neighbour can change it. The
 * dense case, which is the expensive one and the one this product actually has, therefore exits on
 * its first or second candidate.
 *
 * A pin with no neighbour inside the 3×3 window gets `Infinity`, which `labelTierFor` reads as *no
 * zoom is needed* and answers with the lowest tier. That is correct rather than approximate: a
 * neighbour outside the window is by construction further than the coarsest tier's clearance.
 */
export function withLabelZooms(data: PlaceFeatureCollection): GeoJSON.FeatureCollection {
  const features = data.features;
  if (features.length === 0) return data as GeoJSON.FeatureCollection;

  const lats = features.map((feature) => feature.geometry.coordinates[1] ?? 0);
  const lngs = features.map((feature) => feature.geometry.coordinates[0] ?? 0);
  const meanLat = lats.reduce((sum, lat) => sum + lat, 0) / lats.length;
  const cosLat = Math.max(Math.cos((meanLat * Math.PI) / 180), 1e-6);

  const coarsest = LABEL_TIER_ZOOMS[0] ?? 0;
  const finest = LABEL_TIER_ZOOMS[LABEL_TIER_ZOOMS.length - 1] ?? 0;
  /** The separation the lowest tier is about — one grid cell, so a closer neighbour is always in
   *  the 3×3 window and a further one never changes the answer. */
  const cellMetres = LABEL_CLEARANCE_PX * metresPerPixel(coarsest, meanLat);
  /** Below this every pin resolves to the same tier, so the scan may stop. */
  const settledMetres = LABEL_CLEARANCE_PX * metresPerPixel(finest, meanLat);
  const cellLat = cellMetres / METRES_PER_DEGREE;
  const cellLng = cellMetres / (METRES_PER_DEGREE * cosLat);

  const cells = new Map<string, number[]>();
  const keyOf = (index: number) =>
    `${Math.floor((lats[index] ?? 0) / cellLat)}:${Math.floor((lngs[index] ?? 0) / cellLng)}`;
  for (let index = 0; index < features.length; index += 1) {
    const key = keyOf(index);
    const bucket = cells.get(key);
    if (bucket) bucket.push(index);
    else cells.set(key, [index]);
  }

  const nearestMetres = (index: number): number => {
    const row = Math.floor((lats[index] ?? 0) / cellLat);
    const column = Math.floor((lngs[index] ?? 0) / cellLng);
    let best = Number.POSITIVE_INFINITY;
    for (let dRow = -1; dRow <= 1; dRow += 1) {
      for (let dColumn = -1; dColumn <= 1; dColumn += 1) {
        for (const other of cells.get(`${row + dRow}:${column + dColumn}`) ?? []) {
          if (other === index) continue;
          const dLat = ((lats[other] ?? 0) - (lats[index] ?? 0)) * METRES_PER_DEGREE;
          const dLng = ((lngs[other] ?? 0) - (lngs[index] ?? 0)) * METRES_PER_DEGREE * cosLat;
          const distance = Math.hypot(dLat, dLng);
          if (distance < best) best = distance;
          if (best <= settledMetres) return best;
        }
      }
    }
    return best;
  };

  return {
    type: 'FeatureCollection',
    features: features.map((feature, index) => ({
      ...feature,
      properties: {
        ...feature.properties,
        labelZoom: labelTierFor(nearestMetres(index), lats[index] ?? 0),
      },
    })),
  };
}

/**
 * The layer's zoom range, as a value.
 *
 * Extracted from the `useEffect` for the same reason `pinLayerLayout` and `pinLayerPaint` were
 * (`tests/unit/map/no-density-clustering.test.ts`'s header): "the pins keep their floor only when
 * something replaces them" is the rule that broke the collection map, and a rule a test can call is
 * a rule that stays fixed. `map.addLayer` is a statement and cannot be asserted on directly.
 *
 * Returns an **empty object** rather than `{ minzoom: 0 }` when there is no replacement — see the
 * call site.
 */
export function pinLayerZoomRange(replacedBelowZoom: number | null): { readonly minzoom?: number } {
  return replacedBelowZoom === null ? {} : { minzoom: replacedBelowZoom };
}

interface PlaceMarkerLayerProps {
  readonly data: PlaceFeatureCollection;
  readonly selectedId: string | null;
  /**
   * The zoom below which a **summary layer draws in this layer's place**, or `null` when nothing
   * does.
   *
   * Not optional, and not defaulted to `PIN_BAND_MIN`. The floor and the replacement are one
   * decision, and this prop is where the two are tied together in the type system rather than in a
   * paragraph somebody has to find: a surface may only hide its pins if it can say what the user
   * sees instead. `PIN_BAND_MIN` when `summaries` are mounted, `null` when they are not — see the
   * header, and `map-surface.mapcn.tsx`, where both are decided by the same expression.
   */
  readonly replacedBelowZoom: number | null;
  readonly onPlaceClick?: (placeId: string) => void;
}

export function PlaceMarkerLayer({
  data,
  selectedId,
  replacedBelowZoom,
  onPlaceClick,
}: PlaceMarkerLayerProps) {
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

  // The current selection, for the *creation* path only. `replacedBelowZoom` is in the setup
  // effect's dependencies, so the layer can now be rebuilt at a moment when a pin is selected; the
  // selection effect below would not re-run for that rebuild and the chosen pin would silently
  // revert to its unselected icon. Seeding the layout from a ref costs nothing and removes the
  // whole class. `selectedId` itself must never enter those dependencies — that would tear down
  // and rebuild the source on every tap.
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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
      // The pin band's floor (`zoom-bands.ts`, `ux-library-at-scale.md` §2.1), and only when this
      // surface has a summary layer to hand the band to. Above it every saved place is its own pin
      // exactly as before; below it the area and country summaries take over. With
      // `replacedBelowZoom === null` there is no floor at all and the pins draw everywhere — see
      // the header on why that is the honest default for a surface with no bands.
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
      // Omitted entirely when nothing replaces these pins, rather than set to 0: a layer with no
      // `minzoom` is MapLibre's own way of saying "every zoom", and writing a number there would
      // read as a tuned floor that happens to be the bottom of the scale.
      ...pinLayerZoomRange(replacedBelowZoom),
      layout: pinLayerLayout(styleTextFont(map), selectedIdRef.current) as never,
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
  }, [map, styleReady, sourceId, pinLayerId, replacedBelowZoom]);

  /** The features with their label tier stamped on. Memoised on `data`, so the grid scan costs
   *  nothing on a selection, a re-render or a camera move — only on a library or filter change,
   *  which is the same key the source is written on. */
  const labelled = useMemo(() => withLabelZooms(data), [data]);

  // The source's only writer, and the selection effect below is the layer's. Both run after the
  // creation effect in the same commit, so the layers are never rendered from stale state.
  useEffect(() => {
    if (!map || !styleReady) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(labelled);
  }, [map, styleReady, sourceId, labelled]);

  useEffect(() => {
    if (!map || !styleReady || !map.getLayer(pinLayerId)) return;
    map.setLayoutProperty(pinLayerId, 'icon-image', pinIconImageExpression(selectedId) as never);
    map.setLayoutProperty(pinLayerId, 'symbol-sort-key', pinSortKeyExpression(selectedId) as never);
  }, [map, styleReady, pinLayerId, selectedId]);

  return null;
}
