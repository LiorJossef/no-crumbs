'use client';

/**
 * `mapcn`-based implementation of the `MapSurfaceProps` port (`./types.ts`). `mapcn`
 * (https://mapcn.dev, MIT, github.com/AnmolSaini16/mapcn) is a shadcn-registry component: not an
 * npm package, its source lives at `src/components/ui/map.tsx` (installed verbatim via
 * `npx shadcn add https://www.mapcn.dev/r/map.json`, per `docs/06-map-and-places-decision.md`'s
 * house rule that third-party claims are VERIFIED before use — VERIFIED here from the GitHub API
 * (MIT license, 11.5k stars, pushed 2026-08-16) and from reading the installed source). It wraps
 * MapLibre GL (bumped to v6 by this install; the type-only surface `map-surface.live.tsx` depends
 * on is unaffected) and needs no API key of its own — its zero-config default is CARTO's free
 * Positron/Dark-Matter basemap styles.
 *
 * D2 (`06` §2) originally chose Protomaps tiles for their CC0 style licence and
 * non-commercial-free cap. Protomaps has since been ruled out by the product owner (2026-08-21)
 * and `NEXT_PUBLIC_PROTOMAPS_API_KEY` was never populated, leaving both MapLibre implementations
 * unwired. CARTO's basemap terms were evaluated in `docs/evidence/licensing/
 * carto-basemap-terms-2026-08-21.md` and found suitable at this project's scale: the vector
 * Positron/Dark-Matter styles served from `basemaps.cartocdn.com` need **no API key** today, carry
 * a 5M-tile/month free-tier ceiling far above a course MVP's traffic, and require only a
 * dischargeable one-line attribution. This file therefore uses mapcn's own default CARTO style
 * URLs directly (no env var, no key) and is now the active `MapSurface` implementation — see
 * `map-surface.tsx`. Unlike Protomaps' style JSON, CARTO's style carries no baked-in `attribution`
 * field on its source, so `customAttribution` is set explicitly below rather than relying on
 * MapLibre's `AttributionControl` to find one.
 *
 * What mapcn buys over the hand-rolled `.live` implementation: declarative `<MapClusterLayer>` /
 * `<MapPopup>` / `<MapControls>` components (zoom, locate, fullscreen controls; cluster
 * color/threshold styling) instead of raw MapLibre layer/paint objects, and theme-aware
 * (light/dark) style switching for free. It does not replace the resolver, the camera
 * choreography (`06` §9.2), or the marker-count/perf ceilings (`06` §9.1) — those still apply
 * unchanged to whichever surface is wired in.
 *
 * Visual pass (2026-08-21, owner: "I hate the map design"). Two changes, both cosmetic only —
 * `onPointClick`/`onPlaceClick` wiring, camera-fit and bounds logic are untouched:
 *
 * 1. Basemap. `brand-and-product-foundation.md` §5 fixes the product as "warm minimal, light
 *    only... no dark map", so this surface now always requests CARTO's light (Positron) style
 *    regardless of OS/theme preference — `mapcn`'s own dark/light auto-switch is bypassed by
 *    passing the same URL for both `styles.light` and `styles.dark`. CARTO also publishes a
 *    `voyager-gl-style` (VERIFIED via `docs.carto.com/faqs/carto-basemaps`, same free/keyless tier
 *    as Positron/Dark Matter already covered by the licensing evidence note) with warmer paper
 *    tones and colored roads/POI icons; it was tried and rejected here because its saturated
 *    yellow/orange roads and cartoon POI glyphs read as a generic consumer maps app, working
 *    against the brand's restrained, editorial "warm minimal" direction. Positron's near-monochrome
 *    grays keep the map itself quiet so the mint pins are the only color on the surface — closer to
 *    the sign-in screen's "soft mint-tinted wash over a calm surface" composition. A hue-rotate/
 *    saturate/brightness CSS filter was tried on the MapLibre canvas to nudge Positron's cold
 *    blue water/green parks toward the brand's mint family, but the owner rejected the result
 *    (2026-08-21) as reading mauve/dusty-purple rather than mint. The basemap now renders
 *    Positron's natural colors unmodified — blue water, green parks, neutral grey/white land and
 *    roads; the mint accent stays confined to pins/clusters and product UI, never the map tiles.
 * 2. Pins and clusters are this file's own, not mapcn's. `MapClusterLayer` paints every place as
 *    the same circle and exposes only colours, so the category already sitting on every feature
 *    had nowhere to go. `./place-marker-layer.tsx` owns the source and the layers instead — see
 *    it for what that buys and what it cost.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Map as MapcnMap, MapControls, MapPopup } from '@/components/ui/map';
import { PlaceDetail } from '@/components/sheet/place-sheet';
import type { LatLngBoundsHint, MapPlace, MapSurfaceProps } from './types';
import { LG_BREAKPOINT_PX, mapOcclusionInsets, queryRectFrom } from './query-rect';
import { BasemapTint } from './basemap-tint-layer';
import { toPlaceFeatures } from './place-features';
import { PlaceMarkerLayer } from './place-marker-layer';

/**
 * The initial camera must *frame* every fixture place, not center on the average of their
 * coordinates: averaging lng/lat across, say, Tel Aviv + London + NYC lands the "center" in the
 * middle of the Atlantic, and any fixed zoom around that point shows nothing but ocean tiles.
 * `boundsFor` instead returns a bounding box (`initialBounds` when given, else the min/max of
 * `places`) that gets passed to MapLibre's `fitBounds`, which computes both center *and* zoom so
 * the whole box is visible. Returns `null` when there is nothing to fit (empty `places`, no
 * hint) so the caller can fall back to a static world view.
 */
function boundsFor(
  places: readonly MapPlace[],
  hint: LatLngBoundsHint | undefined
): [[number, number], [number, number]] | null {
  if (hint) return [[hint.west, hint.south], [hint.east, hint.north]];
  if (places.length === 0) return null;
  const lngs = places.map((p) => p.lng);
  const lats = places.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// mapcn's own keyless default: CARTO's free vector basemap styles, no `NEXT_PUBLIC_*` key needed.
// Evaluated in `docs/evidence/licensing/carto-basemap-terms-2026-08-21.md`. Passed for both
// `styles.light` and `styles.dark` — the brand direction is "light only... no dark map"
// (`brand-and-product-foundation.md` §5), so this surface deliberately never requests
// `dark-matter-gl-style` regardless of the visitor's OS theme preference.
const CARTO_LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

// Attribution is **not** set explicitly here, and that is a correction rather than an omission.
//
// This file used to pass a hand-written `customAttribution`, on the stated grounds that "CARTO's
// style JSON carries no attribution field on its source". That was checked against `style.json`,
// which is the wrong file: the style's source is a TileJSON URL, and *that* document carries the
// attribution. Verified 2026-08-26 —
// `GET https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json` returns
// `"attribution": "© CARTO, © OpenStreetMap contributors"` with both links.
//
// MapLibre's AttributionControl dedups only on exact string equality, so our near-identical line
// rendered *next to* CARTO's rather than instead of it, and every map carried
// "© CARTO, © OpenStreetMap contributors | © CARTO © OpenStreetMap contributors".
//
// The licence obligation from `docs/evidence/licensing/carto-basemap-terms-2026-08-21.md` (CARTO
// + OpenStreetMap credited on every map) is therefore already discharged by the tiles we load. If
// CARTO ever stops shipping it, this is where the explicit line goes back.

// Padding (px) and zoom ceiling for the initial fit-to-bounds fly-in. A ceiling stops a
// single-place import (a zero-area bounding box) from zooming in absurdly tight.
const FIT_BOUNDS_PADDING = 48;
const FIT_BOUNDS_MAX_ZOOM = 15;

// Extra top padding for the floating chrome that overlays the map's top edge on every breakpoint:
// the account chip (`map/page.tsx`, a 44px pill at `top: safe-area + 0.75rem`) and the post-import
// confirmation (`import-confirmation.tsx`, same band). Without it a fitted pin lands *underneath*
// them — visible in the first working version of the post-import flight, where the northernmost
// London cluster sat half-hidden behind the "8 already saved" strip.
// Below `lg` the confirmation drops to a second row under the account chip (see
// `import-confirmation.tsx`), so the band it has to clear is that much deeper.
const FLOATING_TOP_CHROME_PX = 56;
const FLOATING_TOP_CHROME_MOBILE_PX = 100;

// The post-import flight is animated rather than instantaneous, because its job is to *tell the
// user something moved*: an instant jump to a different city reads as a bug, a flight reads as an
// answer to "where did my eight places go". MapLibre honours `prefers-reduced-motion` for
// `fitBounds` internally (it drops the animation), so no separate branch is needed here.
const FOCUS_FLIGHT_MS = 1200;

/**
 * The base 48 px `fitBounds` padding treats the whole viewport as available map space. That is
 * wrong wherever chrome is sitting on top of the map: at `lg+` `PlaceDesktopPanel`'s left list
 * panel is a permanent opaque overlay, and below `lg` the sheet's peek strip is, so a bounding box
 * that would otherwise fit *underneath* either of them has to be pushed clear instead — a fitted
 * pin that renders in the GL layer under an opaque panel is invisible and unclickable.
 *
 * So the padding is the occlusion above **plus** the cosmetic 48 px **plus** the floating top
 * chrome (present at every width; below `lg` the post-import confirmation drops to a second row, so
 * the band is deeper). Only the first of those three is shared with the query rect — see
 * `mapOcclusionInsets` for why the other two are camera-only.
 */
function fitBoundsPadding(
  viewportWidth: number
): { top: number; bottom: number; left: number; right: number } {
  const occlusion = mapOcclusionInsets(viewportWidth);
  const topChrome =
    viewportWidth < LG_BREAKPOINT_PX ? FLOATING_TOP_CHROME_MOBILE_PX : FLOATING_TOP_CHROME_PX;
  return {
    top: FIT_BOUNDS_PADDING + topChrome + occlusion.top,
    bottom: FIT_BOUNDS_PADDING + occlusion.bottom,
    left: FIT_BOUNDS_PADDING + occlusion.left,
    right: FIT_BOUNDS_PADDING + occlusion.right,
  };
}

/**
 * Container-size observers, keyed by map instance. A module-level `WeakMap` rather than a `useRef`
 * because the React Compiler forbids assigning to a ref that an effect also reads, and the observer
 * has to be created where the instance first arrives (the ref callback), not at mount — the instance
 * does not exist yet at mount. Weak, so an unmounted map's observer is collectable even if the
 * unmount path is ever missed.
 */
const observers = new WeakMap<MapLibreMap, ResizeObserver>();

/** How long after the camera stops before the list is allowed to change (`§4`). Long enough to
 *  coalesce the several `moveend` events one pinch or inertial flick emits, short enough that the
 *  list is correct before the thumb is off the glass. */
const VIEWPORT_DEBOUNCE_MS = 120;

/**
 * Run `action` as soon as the map can accept a camera command, and never later than that.
 *
 * `map.loaded()` is the wrong test for this and cost us a working feature once already: it reports
 * false while *tiles* are in flight, which is most of the second after any camera move, so a
 * camera command guarded on it is routinely dropped and — because the effect that issued it has no
 * reason to re-run — never retried. `isStyleLoaded()` is the actual precondition for `fitBounds`;
 * before that, MapLibre's own `load` event is the earliest safe moment.
 */
function whenReady(map: MapLibreMap, action: () => void): void {
  if (map.isStyleLoaded()) {
    action();
    return;
  }
  // `load` alone is not enough, and this was measured rather than reasoned. `load` fires after the
  // style *and* a first complete render; if the map was created before its container had a size
  // (see `useContainerSize` below) it can finish its style, fetch tiles, and still never fire
  // `load`. Observed live: `isStyleLoaded() === true`, `areTilesLoaded() === true`, `loaded() ===
  // false`, camera stranded at zoom 0 over (0, 0) — so the initial `fitBounds` never ran and the map
  // sat on a world view with two cluster bubbles and no pins.
  //
  // `styledata` fires whenever the style finishes loading, which is the actual precondition for a
  // camera command. Both are registered and whichever arrives first wins; `done` makes the action
  // idempotent so the camera cannot be framed twice.
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    map.off('load', run);
    map.off('styledata', run);
    action();
  };
  map.once('load', run);
  map.on('styledata', run);
}

export function MapSurfaceMapcn({
  places,
  onPlaceClick,
  initialBounds,
  selected = null,
  onDeselect,
  focusPlaceIds,
  onViewportChange,
}: MapSurfaceProps) {
  const data = useMemo(() => toPlaceFeatures(places), [places]);
  const bounds = useMemo(() => boundsFor(places, initialBounds), [places, initialBounds]);

  const mapRef = useRef<MapLibreMap | null>(null);
  // Read inside the `load`-time callback below, which is created once (on mount) and must see
  // whatever bounds are current at the moment the map finishes loading, not the bounds that were
  // current when the callback closure was created. Updated in an effect, never during render.
  const latestBounds = useRef(bounds);
  useEffect(() => {
    latestBounds.current = bounds;
  }, [bounds]);

  /** The last box the camera was actually framed to. A resize re-fits *this*, not whatever the
   *  full `places` bounding box happens to be now — otherwise a resize silently undoes a focus
   *  flight and throws the camera back across the world. */
  const framedTo = useRef<[[number, number], [number, number]] | null>(null);
  /** Set by the first real fit, wherever it comes from. Guards the automatic whole-library
   *  framing so it happens once, on arrival, and never again as a side effect of data changing. */
  const hasFramedOnce = useRef(false);

  const fitTo = useCallback(
    (map: MapLibreMap, target: [[number, number], [number, number]], animate: boolean) => {
      const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
      const padding = fitBoundsPadding(viewportWidth);
      framedTo.current = target;
      hasFramedOnce.current = true;
      map.fitBounds(target, {
        padding,
        maxZoom: FIT_BOUNDS_MAX_ZOOM,
        duration: animate ? FOCUS_FLIGHT_MS : 0,
      });
    },
    []
  );

  const fitToBounds = useCallback(
    (map: MapLibreMap) => {
      const target = latestBounds.current;
      if (!target) return;
      fitTo(map, target, false);
    },
    [fitTo]
  );

  // The viewport reporter, held in a ref so attaching the MapLibre listeners does not depend on the
  // caller's handler identity — a caller that re-creates its callback every render must not cause a
  // detach/attach cycle on the map.
  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Whether a **user pan** has happened since the last report — the whole of `ViewportChangeMeta`.
   *
   * Set by `dragend`, which MapLibre fires only from its drag handlers and therefore only from a
   * pointer, a touch or the keyboard's pan keys; no programmatic camera command produces one. That
   * is what makes the guard structural rather than a rule someone has to remember: a
   * `ResizeObserver` re-fit, the initial `fitBounds`, a flight to a pin and the post-import flight
   * all emit `moveend`, and none of them emits `dragend`.
   *
   * Sticky across the debounce window on purpose: one flick emits `dragend` and then several
   * `moveend`s as the inertia decays, and the single coalesced report has to still know a hand was
   * on the glass.
   */
  const pannedSinceReport = useRef(false);

  /** Report the current query rect, now. Reads the breakpoint from `window.innerWidth` (the same
   *  width `PlaceDesktopPanel` switches on) but measures the rect in *canvas* pixels, which is what
   *  `unproject` speaks. */
  const reportViewport = useCallback(() => {
    const instance = mapRef.current;
    const handler = onViewportChangeRef.current;
    if (!instance || !handler) return;
    // The **container**, not `getCanvas()`. `unproject` takes container-relative CSS pixels, and the
    // canvas's own CSS size can be stale — MapLibre only updates it on `resize()`, so a map built
    // before layout settled reports 400×300 while the container is 1280×720. Measured: that stale
    // size put the query rect over a 400 px sliver of a 1280 px map and the list showed 1 place
    // where 12 were plainly on screen. `observeContainerSize` keeps the two in step; reading the
    // container here means a missed frame reports a correct rect rather than a confident wrong one.
    const container = instance.getContainer();
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return; // Not laid out yet; a later event will report.
    const viewportWidth = typeof window === 'undefined' ? width : window.innerWidth;
    const rect = queryRectFrom(
      (point) => instance.unproject(point),
      width,
      height,
      mapOcclusionInsets(viewportWidth)
    );
    // Consumed, not merely read: the flag describes the move being reported, and leaving it set
    // would let the next programmatic re-fit inherit a gesture that already had its answer.
    const userInitiated = pannedSinceReport.current;
    pannedSinceReport.current = false;
    if (rect) handler(rect, { userInitiated });
  }, []);

  /**
   * A pan by the user, and the only thing in this file that may say so.
   *
   * `dragend` covers pointer drags, touch drags and their inertia; MapLibre's keyboard handler pans
   * through the same drag machinery, so arrow keys arrive here too. A wheel or pinch **zoom** does
   * not, which is deliberate — see `ViewportChangeMeta`.
   */
  const handleDragEnd = useCallback(() => {
    pannedSinceReport.current = true;
  }, []);

  /** Trailing debounce (§4). One pinch or inertial flick emits several `moveend`s; the list must
   *  settle once, after the camera has, and never reflow under a moving thumb. */
  const scheduleViewportReport = useCallback(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      reportViewport();
    }, VIEWPORT_DEBOUNCE_MS);
  }, [reportViewport]);

  // Cleared on unmount below; a debounce that fires into an unmounted tree is a `setState` on a
  // dead component, and the map instance it would read is already destroyed.
  useEffect(
    () => () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    },
    []
  );

  /**
   * Keep the map's canvas the size of its container.
   *
   * MapLibre measures its container once, at construction, and falls back to 400×300 if that
   * measurement comes back empty — then never measures again unless something calls `resize()`.
   * A React tree that mounts the map before layout settles therefore gets a 400×300 map painted in
   * the corner of a full-bleed container, with no error anywhere. Measured on this app at
   * 1280×720: container 1280×720, canvas stuck at 400×300, no vector tiles requested, `loaded()`
   * false. One `resize()` call fixed all three at once.
   *
   * That bug is invisible until something depends on the canvas's real size — which "the map is the
   * query" now does, twice over: `unproject` takes container-relative CSS pixels, so a stale canvas
   * size silently reports the wrong query rect and the list quietly lists the wrong places.
   *
   * A `ResizeObserver` rather than the `window` resize listener further down: the container is
   * `h-full w-full` inside a flex layout, so it changes size in cases the window never fires for —
   * including the first layout pass, which is the one that matters here.
   */
  const attachMapRef = useCallback(
    (instance: MapLibreMap | null) => {
      const previous = mapRef.current;
      if (previous && previous !== instance) {
        previous.off('dragend', handleDragEnd);
        previous.off('moveend', scheduleViewportReport);
        previous.off('resize', scheduleViewportReport);
        observers.get(previous)?.disconnect();
        observers.delete(previous);
      }
      mapRef.current = instance;
      if (!instance) return;
      // Measure the container *now*, before anything reads the canvas.
      //
      // MapLibre sizes its canvas once, at construction, and falls back to 400×300 when that
      // measurement comes back empty — then never measures again unless something calls `resize()`.
      // A tree that mounts the map before layout settles therefore gets a 400×300 map painted in
      // the corner of a full-bleed container, with no error anywhere. Measured on this app at
      // 1280×720: container 1280×720, canvas stuck at 400×300, zero vector tiles requested and
      // `loaded()` permanently false, so the initial `fitBounds` never ran either and the map sat on
      // a world view at zoom 0. One `resize()` call fixed all three.
      //
      // It stayed invisible until something depended on the canvas's real size, which "the map is
      // the query" does: `unproject` takes container-relative CSS pixels, so a stale size reports a
      // query rect over a 400 px sliver of a 1280 px map — the list showed 1 place with 12 plainly
      // on screen.
      //
      // A single `resize()` here is not enough and that was measured too: the instance arrives via
      // mapcn's `useImperativeHandle`, which can commit before the flex layout has given the
      // container its height, so an immediate measurement reads zero and MapLibre keeps the
      // fallback. A `ResizeObserver` fires once on `observe()` with the current size and again on
      // every later change, so it catches both the settled-late case and a genuine resize.
      const container = instance.getContainer();
      const observer = new ResizeObserver(() => {
        const canvas = instance.getCanvas();
        if (
          canvas.clientWidth === container.clientWidth &&
          canvas.clientHeight === container.clientHeight
        ) {
          return;
        }
        instance.resize();
        // Re-frame, and this is the half that actually makes the map usable rather than merely
        // correctly sized. The observer fires *after* the first paint, so `whenReady` has already
        // run the initial `fitBounds` against the 400×300 fallback — where the desktop padding
        // (48 + a ~374 px panel on the left alone) exceeds the canvas width, so the fit is
        // impossible, silently does nothing, and leaves `hasFramedOnce` set. The camera then sits at
        // zoom 0 over (0, 0) for the life of the page: a world map with two cluster bubbles and no
        // pins, which is exactly the symptom `current-state.md` §9.1 attributed to fitting all
        // places at once.
        //
        // Re-fit whatever was last framed, so a resize never undoes a focus flight; fall back to the
        // initial bounds when nothing has been framed yet.
        const framed = framedTo.current;
        if (framed) fitTo(instance, framed, false);
        else fitToBounds(instance);
        // The rect moved with the canvas, and neither `resize()` nor an instant `fitBounds` is
        // guaranteed to leave a `moveend` behind.
        scheduleViewportReport();
      });
      observer.observe(container);
      observers.set(instance, observer);
      whenReady(instance, () => fitToBounds(instance));
      // `moveend` only — no `move`, no `render`, no rAF. `resize` too, because the insets are
      // viewport-dependent: crossing `lg` changes which edge the chrome covers. `dragend` carries
      // no rect of its own; it only records that the move about to be reported was the user's.
      instance.on('dragend', handleDragEnd);
      instance.on('moveend', scheduleViewportReport);
      instance.on('resize', scheduleViewportReport);
      // The first settle. Without this the caller holds no rect until the user touches the map,
      // and an empty list on arrival reads as the whole feature being broken. Scheduled through the
      // same debounce so the initial `fitBounds` issued just above coalesces into one report
      // instead of producing a pre-fit rect and then a post-fit one.
      whenReady(instance, scheduleViewportReport);
    },
    [fitToBounds, fitTo, scheduleViewportReport, handleDragEnd]
  );

  // The **initial** framing, and only that. `attachMapRef`'s `once('load', ...)` races against
  // `places` arriving; when the map loads before the first non-null `bounds` exists, this effect
  // is the only thing that ever frames the camera, so it cannot simply be skipped on mount.
  //
  // What it deliberately no longer does is re-fit on every later `places` change. That behaviour
  // was actively wrong once imports started landing places in a second city: saving eight London
  // venues into a Tel Aviv library re-fitted the camera to a box containing both, i.e. a view of
  // the Mediterranean with no visible pins. Post-import framing is now an explicit request
  // (`focusPlaceIds`), which is also the only honest reading of "the four authorised camera
  // movers" in `06` §9.2 — data arriving is not a camera mover.
  useEffect(() => {
    if (hasFramedOnce.current) return;
    const instance = mapRef.current;
    if (!instance || !bounds) return;
    whenReady(instance, () => fitToBounds(instance));
  }, [bounds, fitToBounds]);

  // The explicit post-import camera mover. Keyed on the `focusPlaceIds` array identity so the same
  // import cannot re-trigger a flight on an unrelated re-render, and guarded on the ids actually
  // being present in `places` — the caller sets them in the same tick as the data refresh that
  // brings the new places in, so the first pass through here usually finds nothing to fit and the
  // second one does.
  const flownFor = useRef<readonly string[] | null>(null);
  useEffect(() => {
    if (!focusPlaceIds || focusPlaceIds.length === 0) return;
    if (flownFor.current === focusPlaceIds) return;
    const instance = mapRef.current;
    if (!instance) return;
    const wanted = new Set(focusPlaceIds);
    const target = boundsFor(places.filter((p) => wanted.has(p.id)), undefined);
    if (!target) return; // The refreshed places have not arrived yet; a later render will fit.
    flownFor.current = focusPlaceIds;
    // Not gated on `loaded()`. That gate is what made this silently do nothing the first time it
    // shipped: the automatic framing immediately before it kicks off a round of tile requests, so
    // `loaded()` is false for a second or two afterwards — and since neither `focusPlaceIds` nor
    // `places` changes again, the effect never got a second chance and the camera stayed put.
    whenReady(instance, () => fitTo(instance, target, true));
  }, [focusPlaceIds, places, fitTo]);

  // Re-fit when the viewport crosses the `lg` breakpoint or is resized while at `lg+` (the panel
  // width is a viewport-relative `clamp()`, not a fixed pixel value) — otherwise a fit computed at
  // one width goes stale after a resize/orientation change and pins can drift back under the
  // panel. Deliberately not fired by `selected` changing at all: re-centering the whole camera
  // every time a place is selected/deselected would be a jarring, unrequested camera move on every
  // tap (`06-map-and-places-decision.md` §9.2 scopes camera-mover choreography to later work) —
  // selection only opens a popover now, which needs no padding/camera change of its own.
  useEffect(() => {
    const handleResize = () => {
      const instance = mapRef.current;
      const target = framedTo.current;
      if (!instance || !target) return;
      fitTo(instance, target, false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitTo]);

  return (
    <MapcnMap
      ref={attachMapRef}
      className="h-full w-full"
      styles={{ light: CARTO_LIGHT_STYLE, dark: CARTO_LIGHT_STYLE }}
      attributionControl={{ compact: true }}
    >
      <MapControls showZoom showCompass showLocate showFullscreen />
      <BasemapTint />
      <PlaceMarkerLayer
        data={data}
        selectedId={selected?.id ?? null}
        onPlaceClick={(id) => {
          const place = places.find((candidate) => candidate.id === id);
          // Selection lives with the caller (`map-page-client.tsx`'s `selected` state) — this
          // surface only reports the click; the `MapPopup` below reacts to `selected` the same way
          // any other consumer of it does.
          if (place && onPlaceClick) onPlaceClick(place);
        }}
      />
      {selected && (
        // Anchored at the selected place's own lng/lat — mapcn's `MapPopup` keeps a MapLibre
        // `Popup` instance pinned to that point and repositions it on every pan/zoom, so this
        // reads as a Google Maps-style info card stuck to the pin rather than a fixed-position
        // overlay. `lg+`-only via a Tailwind class on `MapPopup`'s own `className` (its *shell*,
        // not just its content) — matching `PlaceSheet`/`PlaceDesktopPanel`'s own `hidden lg:block`
        // convention — so below `lg` no popup DOM (not even an empty padded shell) mounts over the
        // map; the mobile `PlaceSheet` remains the only detail surface there. Keyed on
        // `selected.id` so switching between two pins remounts the popup at the new anchor instead
        // of animating the old DOM node across the map.
        <MapPopup
          key={selected.id}
          longitude={selected.lng}
          latitude={selected.lat}
          onClose={() => onDeselect?.()}
          className="hidden max-w-none p-0 lg:block"
        >
          <PlaceDetail place={selected} onClose={() => onDeselect?.()} variant="popover" />
        </MapPopup>
      )}
    </MapcnMap>
  );
}
