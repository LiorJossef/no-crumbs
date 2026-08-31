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

import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { useMap } from '@/components/ui/map';
import { useResolvedTheme } from '@/components/theme/theme-provider';

import { buildPinImages } from './marker-images';
import {
  LABEL_TIER_ZOOMS,
  labelTierFor,
  LAND_SETTLE_FALLBACK_MS,
  LAND_STAGGER_MS,
  LAND_WAVES,
  landOrderFor,
  metresPerPixel,
  LABEL_CLEARANCE_PX,
  pinIconImageExpression,
  pinLayerLayout,
  pinLayerPaint,
  pinOpacityExpression,
  pinSortKeyExpression,
  VISITED_LABEL_OPACITY,
  VISITED_PIN_OPACITY,
} from './marker-style';
import type { PlaceFeatureCollection } from './place-features';
import { styleTextFont } from './style-text-font';
import { useStyleReady } from './use-style-ready';
import {
  ENTRANCE_BEATS,
  entranceDelayMs,
  prefersReducedMotion,
  whenEntranceStarts,
} from './entrance';

/** Metres per degree of latitude. Constant enough at this scale; longitude is scaled by `cos φ`. */
const METRES_PER_DEGREE = 111320;

/**
 * **The two per-feature numbers the pin layer draws from**, stamped in one pass over the library:
 * `labelZoom` (`W2-3`) and `landOrder` (`W6-6`).
 *
 * They share a pass because they share the arithmetic — both need every pin's coordinates in
 * metres against the others — and because both change on exactly the same key: the library, or a
 * filter over it. Neither is recomputed on a selection, a hover, a camera move or a re-render.
 *
 * ## `labelZoom` — the per-feature half of `W2-3`'s label tiering (`LABEL_TIER_ZOOMS`)
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
 *
 * ## `landOrder` — which wave the pin arrives in (`landOrderFor`)
 *
 * Nearest the library's centroid first, radiating outward, in `LAND_WAVES` equal-sized rank
 * buckets. The reasoning is on `landOrderFor`; what belongs here is that it is a **feature**
 * property, which is what lets the whole landing be a paint expression and cost no relayout.
 */
export function withPinFeatureProps(data: PlaceFeatureCollection): GeoJSON.FeatureCollection {
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

  const landOrder = landOrderFor(features.map((feature) => ({
    lat: feature.geometry.coordinates[1] ?? 0,
    lng: feature.geometry.coordinates[0] ?? 0,
  })));

  return {
    type: 'FeatureCollection',
    features: features.map((feature, index) => ({
      ...feature,
      properties: {
        ...feature.properties,
        labelZoom: labelTierFor(nearestMetres(index), lats[index] ?? 0),
        landOrder: landOrder[index] ?? 0,
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
  /**
   * The place the user is **pointing at in the list**, or `null` — `W3-2`, the row↔pin coupling.
   *
   * Every other pin quietens to the level a visited pin already sits at, and the pointed-at one is
   * drawn by `pin-highlight-layer.tsx` instead of here. It is a **paint** change and nothing else:
   * hover changes at pointer rate, so anything that re-lays-out a symbol is unaffordable at the
   * 2 000-pin ceiling.
   *
   * Deliberately **not** a camera mover, and it must not become one: pointing at a row is not
   * asking to go there. It does not appear among the eight in `map-page-client.tsx`'s docblock.
   */
  readonly hoveredId?: string | null;
  readonly onPlaceClick?: (placeId: string) => void;
  /**
   * **The post-login entrance is playing** (`I2-7`, `./entrance.ts`).
   *
   * It changes two things about the landing and nothing else. Wave 0 is **not** painted on arrival,
   * so no eighth of the library pops in at altitude while the camera is still descending; and the
   * waves are held until the entrance's pin beat, so a warm tile cache cannot start them before the
   * ground has settled — which is W6-6's own defect arriving through a different door.
   */
  readonly entrance?: boolean;
}

export function PlaceMarkerLayer({
  data,
  selectedId,
  replacedBelowZoom,
  hoveredId = null,
  onPlaceClick,
  entrance = false,
}: PlaceMarkerLayerProps) {
  const { map } = useMap();
  const styleReady = useStyleReady(map);
  /** The one reader (W7-2). Both the bitmaps and the label paint below resolve from it, so a pin's
   *  body, its ring and its name can never be drawn for two different themes. */
  const theme = useResolvedTheme();
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

    // **Rebuilt when the theme moves, not only when the style loads.** A pin is a rasterised
    // bitmap, so unlike a CSS-token'd node it cannot follow a theme after it is drawn — the same
    // property `use-disc-theme.ts` exists for. `theme` is therefore in this effect's dependency
    // list, and the images are *replaced* rather than skipped when they already exist: `hasImage`
    // is true for last theme's bitmaps, so a plain add would keep the light pins on a dark map.
    //
    // This is reachable without an in-app toggle, which is why it is worth the two lines. No
    // toggle ships (`facelift-plan.md` §4 decision 3), but the theme follows the device, and a
    // device changes it on its own: macOS switches at sunset and iOS on a schedule, both while the
    // app is open.
    for (const image of buildPinImages(window.devicePixelRatio || 1, theme)) {
      if (map.hasImage(image.id)) map.removeImage(image.id);
      map.addImage(image.id, image.data, { pixelRatio: image.pixelRatio });
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
      paint: pinLayerPaint(theme) as never,
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
  }, [map, styleReady, sourceId, pinLayerId, replacedBelowZoom, theme]);

  /** The features with their label tier stamped on. Memoised on `data`, so the grid scan costs
   *  nothing on a selection, a re-render or a camera move — only on a library or filter change,
   *  which is the same key the source is written on. */
  const labelled = useMemo(() => withPinFeatureProps(data), [data]);

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

  /**
   * **`pins.land`: the library arrives in waves, not all at once** (`W6-6`,
   * `facelift-plan.md` §3a — 900 ms flight, then 60 ms per wave, *paint-only*).
   *
   * Measured before this existed, at 30 places: the map and every one of its markers arrived
   * together in **one whole-surface fade, with zero visible change events afterwards** — there was
   * no per-marker entrance at all.
   *
   * ## Why this shape and not the obvious one
   *
   * The obvious mechanism is a per-pin transition delay. MapLibre has none: a paint transition is
   * **one value for the whole layer**, so `icon-opacity-transition` cannot be staggered per
   * feature. And the obvious *animation* — pins physically dropping — is `icon-translate`, which is
   * a paint property MapLibre does not allow to be data-driven (the same wall
   * `pin-highlight-layer.tsx` hit, and why that is a layer of its own). A per-pin drop would need
   * one layer per pin.
   *
   * So the landing is a **staggered fade over a per-feature `landOrder`**, which is exactly what
   * `facelift-plan.md` §2 means by *"no per-feature primitive; achievable paint-only over a
   * per-feature `order`"*. Eight waves, each flipping one rank bucket's gate from 0 to 1, and the
   * layer's own `icon-opacity-transition` turning each flip into a fade rather than a pop. Sixteen
   * `setPaintProperty` calls for the whole arrival, whatever the library size — no relayout, no
   * re-collision, and nothing per frame.
   *
   * ## Once, on arrival
   *
   * Guarded by a ref rather than keyed on `data`, because `data` changes on **every keystroke in
   * the search box** — a landing that replayed on each filter would be the animated list §3a bans
   * by name. It runs when this layer first has something to draw and never again for the life of
   * the mount.
   *
   * ## Reduced motion drops the sequence, not the fade
   *
   * §3a's rule is that the nine collapse *to the opacity change alone, not to nothing*. Here the
   * opacity change **is** the animation, so what a reduced-motion user loses is the **sequencing** —
   * a cascade spreading across the screen is motion however each individual step is drawn. They get
   * every pin at once, faded in by the same transition. Read once, at landing time: the setting is
   * not something a user changes mid-arrival.
   */
  const hasLanded = useRef(false);

  /**
   * **The one writer of the two opacity properties**, because two things drive them and they
   * compose rather than take turns: the landing gate (`W6-6`) and the row↔pin dim (`W3-2`).
   *
   * Written as one function over two refs rather than as two effects each calling
   * `setPaintProperty`, and that is a fix for a real ordering bug rather than tidiness. React runs
   * effects in declaration order, so on mount the landing effect would set wave 0 and the hover
   * effect — which also runs on mount, with `hoveredId` null — would immediately overwrite it with
   * an ungated expression. Every pin would pop in and the stagger would never be seen. A later
   * hover mid-landing would do the same thing. One writer reading both refs cannot get that wrong.
   */
  const landGate = useRef<number | null>(null);
  const hoveredIdRef = useRef(hoveredId);
  const applyOpacity = useCallback(() => {
    if (!map || !map.getLayer(pinLayerId)) return;
    map.setPaintProperty(pinLayerId, 'icon-opacity', pinOpacityExpression(
      VISITED_PIN_OPACITY,
      hoveredIdRef.current,
      landGate.current,
    ) as never);
    map.setPaintProperty(pinLayerId, 'text-opacity', pinOpacityExpression(
      VISITED_LABEL_OPACITY,
      hoveredIdRef.current,
      landGate.current,
    ) as never);
  }, [map, pinLayerId]);

  useEffect(() => {
    if (!map || !styleReady || !map.getLayer(pinLayerId)) return;
    if (hasLanded.current || labelled.features.length === 0) return;
    hasLanded.current = true;

    const paint = (through: number | null) => {
      landGate.current = through;
      applyOpacity();
    };

    if (prefersReducedMotion()) {
      // `null` is "no gate at all" rather than "the last wave": it leaves the expression in the
      // exact shape it has for the rest of the session, so a reduced-motion user's map is not a
      // second code path that could drift.
      paint(null);
      return;
    }

    // Wave 0 immediately, so the innermost pins are on screen in the frame the layer first draws.
    //
    // **Except during the entrance** (`I2-7`), where `-1` means *nothing has landed yet*: the
    // camera is about to descend from altitude, and an eighth of the library appearing part-way
    // down reads as pins arriving twice. The gate expression takes it without a branch — every
    // `landOrder` is `>= 0`, so `<= -1` is false for all of them and every pin is at 0.
    paint(entrance ? -1 : 0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    let started = false;
    /**
     * **The landing waits for the map to settle, and this was measured rather than assumed.**
     *
     * The first version started the waves as soon as the layer had data, and
     * `measure-motion.mjs` reported the arrival as **zero visible change events** — identical to
     * the before. The whole 480 ms had already run while the basemap tiles were still loading, so
     * by the frame the map actually appeared every pin was at full opacity. §3a says *"camera
     * flight, **then** staggered drop"*, and the ordering is the animation: a stagger nobody can
     * see is a stagger that is not there.
     *
     * `idle` is MapLibre's own answer to "the camera has stopped and the tiles are in" — it fires
     * when no transition is running and every requested tile has loaded, which is exactly the
     * moment the landing is supposed to begin. `once`, because a later idle is a user's pan.
     */
    const run = () => {
      // From wave 0 during the entrance, because wave 0 was withheld above; from wave 1 otherwise,
      // because it is already on screen.
      for (let wave = entrance ? 0 : 1; wave < LAND_WAVES; wave += 1) {
        timers.push(setTimeout(() => paint(wave), wave * LAND_STAGGER_MS));
      }
      // …and one more to retire the gate entirely once every wave has arrived, so nothing in the
      // rest of the session evaluates a landing expression it has finished with.
      timers.push(setTimeout(() => paint(null), LAND_WAVES * LAND_STAGGER_MS));
    };
    /**
     * **The entrance's pin beat is a second floor under `idle`, in the other direction.**
     *
     * `idle` answers *"the camera has stopped and the tiles are in"*, which is the right signal
     * and stays the trigger. What it cannot answer is *"and the descent has finished"*: the
     * entrance's first `idle` is the frame the ground appears **at altitude**, with 600 ms of
     * descent still to come (`map-surface.mapcn.tsx`), and waves run under that camera are waves
     * nobody sees — W6-6's own measured defect, reached by a different route.
     *
     * So during an entrance the waves are hung off the shared clock rather than off this `idle`,
     * through `whenEntranceStarts`, and **not** off `entranceDelayMs` alone: the two `idle`
     * listeners are registered independently, so this one can win the race and read a clock that
     * has not started yet — which would answer 0 and start the landing immediately.
     */
    let unsubscribeClock: (() => void) | null = null;
    const start = () => {
      if (started) return;
      started = true;
      if (!entrance) {
        run();
        return;
      }
      unsubscribeClock = whenEntranceStarts(() => {
        timers.push(setTimeout(run, entranceDelayMs(ENTRANCE_BEATS.pins)));
      });
    };
    map.once('idle', start);

    /**
     * **And a floor under it, because the failure mode is silent and severe.** Wave 0 is already
     * painted, so seven eighths of the library is transparent until something starts the waves. If
     * `idle` never comes — a tile request that never resolves, a style reload, a backgrounded tab
     * — those pins stay invisible for the life of the page, and the user is looking at a map
     * missing most of their places with nothing on screen saying so.
     *
     * **During an entrance it is the whole library rather than seven eighths of it**, because wave
     * 0 is withheld too — so this floor matters more there, not less. It is still bounded by the
     * same number, and the entrance's own clock carries a floor of its own
     * (`ENTRANCE_CLOCK_FLOOR_MS`) so that waiting on the clock cannot wait forever either.
     *
     * So the landing is *started* by whichever arrives first. Chosen well clear of the settle times
     * this map actually shows (1.6 s at 390×844 and 2.0 s at 1440×900, measured) so it is a
     * fallback rather than a second schedule.
     */
    timers.push(setTimeout(start, LAND_SETTLE_FALLBACK_MS));

    return () => {
      map.off('idle', start);
      unsubscribeClock?.();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [map, styleReady, pinLayerId, labelled, applyOpacity, entrance]);

  /**
   * The dim half of the row↔pin coupling, and its own effect rather than part of the one above.
   *
   * The selection effect writes **layout** properties, which re-lay-out and re-collide the whole
   * layer; this one writes **paint**, which the compositor re-evaluates without touching placement.
   * Folding them together would make a hover cost what a selection costs, on every pointer move
   * across a list — and that, not the drawing, is the expensive thing at the 2 000-pin ceiling.
   *
   * The 160 ms transition is set once at layer creation (`icon-opacity-transition`), so the change
   * here is a value and MapLibre animates between the two.
   */
  useEffect(() => {
    hoveredIdRef.current = hoveredId;
    if (!styleReady) return;
    applyOpacity();
  }, [styleReady, hoveredId, applyOpacity]);

  return null;
}
