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
 *    roads; the mint accent stays confined to pins and product UI, never the map tiles.
 * 2. Pins are this file's own, not mapcn's — and there are no clusters at all since `L1-F5-T5`.
 *    `MapClusterLayer` paints every place as
 *    the same circle and exposes only colours, so the category already sitting on every feature
 *    had nowhere to go. `./place-marker-layer.tsx` owns the source and the layers instead — see
 *    it for what that buys and what it cost.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Map as MapcnMap, MapControls, MapPopup } from '@/components/ui/map';
import { PlaceDetail } from '@/components/sheet/place-sheet';
import type { FocusBoundsRequest, LatLngBoundsHint, MapPlace, MapSurfaceProps } from './types';
import { SummaryMarkerLayer } from './summary-marker-layer';
import { toAreaFeatures, toCountryFeatures } from './summary-features';
import { AREA_DISC_SPEC } from './summary-style';
import { useDiscTheme } from './use-disc-theme';
import { clampFitPadding, LG_BREAKPOINT_PX, mapOcclusionInsets, queryRectFrom } from './query-rect';
import { pinGeometry } from './marker-style';
import { nearbyPlaces } from '@/ui/place/nearby';
import { BasemapTint } from './basemap-tint-layer';
import { toPlaceFeatures } from './place-features';
import { PlaceMarkerLayer } from './place-marker-layer';
import { ensureRtlTextPlugin } from './rtl-text';
import { bandForZoom, HOME_LANDING_MIN_ZOOM, PIN_BAND_MIN } from './zoom-bands';

// Called at module scope, not in an effect. MapLibre applies the plugin when a tile's glyphs are
// first shaped, so it has to be in place before any `Map` is constructed — an effect in this
// component runs after `MapcnMap` has already created one.
ensureRtlTextPlugin();

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

/** Air between a revealed pin and the edge of the band it is revealed into. Smaller than
 *  `FIT_BOUNDS_PADDING` on purpose: this is a corrective nudge, and every pixel of margin here is a
 *  pixel the map moves that the user did not ask it to. */
const REVEAL_MARGIN_PX = 24;
/** Shorter than `FOCUS_FLIGHT_MS`: a nudge that takes as long as a journey reads as a journey.
 *  `easeTo` sets its own duration to 0 under `prefers-reduced-motion`, so there is no branch. */
const REVEAL_PAN_MS = 320;

// Extra top padding for the floating chrome that overlays the map's top edge — the **default**,
// used by any surface that does not declare its own (`MapSurfaceProps.floatingTopChromePx`).
// These two numbers describe `/map` specifically: the account chip (`map/page.tsx`, a 44px pill at
// `top: safe-area + 0.75rem`) and the post-import confirmation (`import-confirmation.tsx`, same
// band). Without them a fitted pin lands *underneath* — visible in the first working version of the
// post-import flight, where the northernmost London pin sat half-hidden behind the "8 already
// saved" strip. Below `lg` the confirmation drops to a second row under the account chip, so the
// band it has to clear is that much deeper.
//
// They were applied to every surface until `L2-COLL-CAM-2`. `/collections/[id]` has neither of
// these overlays — grep it: nothing in `collection-client.tsx` or `components/collections/**` is
// `absolute` or `fixed` over the map, and `<MapControls>` defaults to bottom-right — so it was
// paying 100 px for chrome that is not there, out of a container that on a landscape phone has no
// 100 px to spare.
const FLOATING_TOP_CHROME_PX = 56;
const FLOATING_TOP_CHROME_MOBILE_PX = 100;

// The post-import flight is animated rather than instantaneous, because its job is to *tell the
// user something moved*: an instant jump to a different city reads as a bug, a flight reads as an
// answer to "where did my eight places go". MapLibre honours `prefers-reduced-motion` for
// `fitBounds` internally (it drops the animation), so no separate branch is needed here.
const FOCUS_FLIGHT_MS = 1200;

// Shorter than the post-import flight, because it is answering a tap rather than reporting that
// something happened while the user was not looking (`ux-library-at-scale.md` §7).
const COUNTRY_FLIGHT_MS = 600;

/**
 * The base 48 px `fitBounds` padding treats the whole viewport as available map space. That is
 * wrong wherever chrome is sitting on top of the map: at `lg+` `PlaceDesktopPanel`'s left list
 * panel is a permanent opaque overlay, and below `lg` the sheet's peek strip is, so a bounding box
 * that would otherwise fit *underneath* either of them has to be pushed clear instead — a fitted
 * pin that renders in the GL layer under an opaque panel is invisible and unclickable.
 *
 * So the padding is the occlusion above **plus** the cosmetic 48 px **plus** the floating top
 * chrome. Only the first of those three is shared with the query rect — see `mapOcclusionInsets`
 * for why the other two are camera-only.
 *
 * Both of the last two are **the caller's to declare**, because both are properties of the
 * composition around the map rather than of the map:
 *  - `restingSheetFraction` — its sheet rests somewhere other than the peek stop.
 *  - `floatingTopChromePx` — how deep a band of floating chrome it puts over the map's top edge,
 *    `0` for a surface with none. Omitted keeps `/map`'s constants, which is what this function
 *    used to apply to every surface unconditionally. That default was the bug behind
 *    `L2-COLL-CAM-2`: `/collections/[id]` renders nothing over its map, so charging it 100 px was
 *    100 px of a short container spent on chrome that does not exist, and on a landscape phone it
 *    pushed the total past the container and into the clamp — which then scaled the *sheet's*
 *    allowance down too and put the lowest pin back underneath it. Measured at 640×360: 394 px of
 *    padding in a 360 px container, clamped to a 194.8 px bottom against a 198.0 px sheet.
 *
 * The sheet fraction is resolved against the **container** height passed in, not
 * `window.innerHeight`, for the same reason `reportViewport` reads the container: the container is
 * what `unproject` and the camera both speak, and a stale size has already cost this file a real
 * bug. Resolving it here rather than at the call site is also what keeps a re-fit cheap — the
 * re-fit path re-enters this function with whatever container it has now and gets the new pixel
 * value for nothing. (Whether an *orientation change* re-fits against the new container is a
 * separate, known defect in the resize path below, tracked outside this task.)
 *
 * Clamped on the way out, because these three summands are independent and their sum can exceed
 * the container: at 375×812 a half-resting sheet already spends 543 of 812 px, and on a landscape
 * phone the margin is thin enough that a phantom 100 px is the difference. See `clampFitPadding`,
 * which is explicit that surviving the clamp is not the same as clearing the sheet.
 */
function fitBoundsPadding(
  viewportWidth: number,
  containerWidth: number,
  containerHeight: number,
  restingSheetFraction: number | undefined,
  floatingTopChromePx: number | undefined
): { top: number; bottom: number; left: number; right: number } {
  const occlusion = mapOcclusionInsets(
    viewportWidth,
    restingSheetFraction === undefined ? undefined : restingSheetFraction * containerHeight
  );
  const topChrome =
    floatingTopChromePx ??
    (viewportWidth < LG_BREAKPOINT_PX ? FLOATING_TOP_CHROME_MOBILE_PX : FLOATING_TOP_CHROME_PX);
  return clampFitPadding(
    {
      top: FIT_BOUNDS_PADDING + topChrome + occlusion.top,
      bottom: FIT_BOUNDS_PADDING + occlusion.bottom,
      left: FIT_BOUNDS_PADDING + occlusion.left,
      right: FIT_BOUNDS_PADDING + occlusion.right,
    },
    containerWidth,
    containerHeight
  );
}

/**
 * **What the camera is currently holding, in the terms it was asked for.**
 *
 * A resize changes what "there" means in pixels, so it has to reproduce the *request*, not the
 * numbers the request produced. Keeping only a bounding box was enough while every mover framed a
 * box the same way; camera mover 5 does not — it clamps the resting zoom into the area band, which
 * a plain `fitBounds` cannot express — so a resize after a country tap re-fitted the box with the
 * wrong ceiling, or, before this, threw the camera back to the whole library.
 */
type Framing =
  | { readonly kind: 'fit'; readonly target: [[number, number], [number, number]] }
  | { readonly kind: 'bounds'; readonly request: FocusBoundsRequest }
  /**
   * **The user moved the camera themselves, so there is nothing for a resize to reproduce.**
   *
   * Without this arm a recorded framing outlives the gesture that replaced it, and a resize replays
   * it — for the life of the page. On mobile Safari the URL bar collapsing on the first scroll is a
   * resize, so a country tap (mover 5, which by construction rests at `COUNTRY_LANDING_ZOOM`,
   * 4.65–8.0) could be re-applied minutes later, throwing the camera back into the area band while
   * the list header still named the area a settled gesture had since scoped it to. That is
   * "country-band camera, area header" with nobody touching a country marker twice, and it is a
   * candidate explanation for the map that opened on five area pills and no pins.
   *
   * The right answer to a resize after a gesture is to do nothing at all: MapLibre's own `resize()`
   * preserves centre and zoom, so what the user was looking at survives on its own.
   */
  | { readonly kind: 'user' };

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
 * ## What "ready" means, and the two wrong answers this has already had
 *
 * `map.loaded()` was the first, and it cost us a working feature: it reports false while *tiles*
 * are in flight, which is most of the second after any camera move, so a command guarded on it is
 * routinely dropped and — because the effect that issued it has no reason to re-run — never
 * retried.
 *
 * `map.isStyleLoaded()` was the second, on the stated grounds that it is "the actual precondition
 * for `fitBounds`". **It is not, and that was measured on 2026-08-29.** `cameraForBounds`,
 * `fitBounds` and `easeTo` read `map.transform` and nothing else; the style is irrelevant to all
 * three. Worse, `Style.loaded()` returns false while any *source* is loading, which includes the
 * ordinary `setData` that `PlaceMarkerLayer` and `SummaryMarkerLayer` issue whenever the library
 * they draw changes — and a source finishing emits **`sourcedata`**, not `styledata`, while `load`
 * has long since fired and cannot fire twice. So the deferred action waited for two events that
 * were never coming and was dropped silently, for good.
 *
 * That is the whole of the country-tap bug in the 2026-08-29 handoff §2, and it is why it looked
 * intermittent. Tapping a country from the *global* scope changes the list from 32 rows to 14,
 * which changes the pin source, which makes `isStyleLoaded()` false in the same commit the flight
 * is requested — so the flight is deferred and lost. Tapping the same country twice, or tapping
 * one whose places were already the whole list, changes no data, leaves the style loaded, and
 * flies correctly. Observed live, both ways, with `[PROBE whenReady] deferred` never followed by
 * the action running.
 *
 * ## The answer
 *
 * The precondition for a camera command is a **sized container**, because that is what the
 * transform is built from and what the padding is measured against. Everything else is a fallback
 * for the case where the map is constructed before layout: `load`, `styledata`, `sourcedata` and
 * `idle` are all registered, whichever arrives first wins, and `done` keeps the action idempotent
 * so the camera cannot be framed twice.
 *
 * A fit that is still impossible when it runs is not this function's problem: `fitTo` asks
 * `cameraForBounds` first and declines to record a framing it could not perform, so the
 * `ResizeObserver` retries it.
 */
function whenReady(map: MapLibreMap, action: () => void): void {
  const container = map.getContainer();
  if (container.clientWidth > 0 && container.clientHeight > 0) {
    action();
    return;
  }
  // `load` alone was never enough, and that was measured too: if the map was created before its
  // container had a size it can finish its style, fetch tiles, and still never fire `load` —
  // observed with `isStyleLoaded() === true`, `areTilesLoaded() === true`, `loaded() === false`
  // and the camera stranded at zoom 0 over (0, 0).
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    for (const event of READY_EVENTS) map.off(event, run);
    action();
  };
  for (const event of READY_EVENTS) map.on(event, run);
}

/** Every event that can mean "the map has settled enough to move the camera". More than one,
 *  because each of them individually has a case it does not cover — see `whenReady`. */
const READY_EVENTS = ['load', 'styledata', 'sourcedata', 'idle'] as const;

export function MapSurfaceMapcn({
  places,
  onPlaceClick,
  initialBounds,
  selected = null,
  onDeselect,
  focusPlaceIds,
  summaries,
  onAreaClick,
  onCountryClick,
  focusBounds,
  accessibleName,
  restingSheetFraction,
  selectedOcclusionFraction,
  floatingTopChromePx,
  onViewportChange,
  controlSlot,
}: MapSurfaceProps) {
  const data = useMemo(() => toPlaceFeatures(places), [places]);
  /** The open pin's neighbours, for the popover's `Nearby` section. Same rule as the mobile
   *  sheet's; both read the same library, so both get the same answer. */
  const nearbyToSelected = useMemo(
    () => (selected === null ? [] : nearbyPlaces(selected, places)),
    [selected, places],
  );
  const theme = useDiscTheme();
  const countryFeatures = useMemo(
    () => toCountryFeatures(summaries?.countries ?? [], summaries?.activeCountryKey ?? null, theme),
    [summaries, theme]
  );
  const areaFeatures = useMemo(() => toAreaFeatures(summaries?.areas ?? []), [summaries]);
  /**
   * Whether this surface draws the country/area bands at all — and therefore whether the pins are
   * allowed a floor.
   *
   * One boolean rather than two `summaries &&` tests, because the two are the same decision. Not
   * every caller passes `summaries`: `/map` does, `/collections/[id]` does not, and when the pins'
   * `minzoom` was applied unconditionally that second surface simply emptied as you zoomed out.
   */
  const hasSummaryBands = summaries !== undefined;
  // Every disc either band's features can reference: one per country in the state it is drawn in,
  // plus the plain flagless disc the *area* band draws on. Derived from the same list the features
  // are, so an `icon-image` id can never be referenced without its image having been offered to
  // `addImage` in the same commit — a symbol that names a missing image draws no icon, and with a
  // count in the same layer it would degrade to a bare number floating on the map.
  const discs = useMemo(
    () => [
      AREA_DISC_SPEC,
      ...(summaries?.countries ?? []).map((country) => ({
        countryCode: country.countryCode,
        ...(country.key === summaries?.activeCountryKey ? { active: true } : {}),
      })),
    ],
    [summaries]
  );
  const bounds = useMemo(() => boundsFor(places, initialBounds), [places, initialBounds]);

  const mapRef = useRef<MapLibreMap | null>(null);
  // Read inside the `load`-time callback below, which is created once (on mount) and must see
  // whatever bounds are current at the moment the map finishes loading, not the bounds that were
  // current when the callback closure was created. Updated in an effect, never during render.
  const latestBounds = useRef(bounds);
  useEffect(() => {
    latestBounds.current = bounds;
  }, [bounds]);

  /** The last framing the camera actually took. A resize re-runs *this*, not whatever the full
   *  `places` bounding box happens to be now — otherwise a resize silently undoes a focus flight
   *  and throws the camera back across the world. */
  const framing = useRef<Framing | null>(null);
  /** Set by the first real fit, wherever it comes from. Guards the automatic whole-library
   *  framing so it happens once, on arrival, and never again as a side effect of data changing. */
  const hasFramedOnce = useRef(false);

  /**
   * **How much of the container the sheet covers at the moment a mover frames the camera.**
   *
   * `restingSheetFraction` while nothing is open, `selectedOcclusionFraction` while a place is —
   * because selecting one raises the sheet from the peek strip to `half`, and a fit computed
   * against the peek strip frames the pin into a band the sheet is about to cover. Measured at
   * 390×844: a place picked from the list came to rest at y = 408 against a sheet top of 379.8,
   * i.e. 28 px behind the sheet's own rounded corner, which is the pin half-clipped at the bottom
   * edge in the owner's screenshot. `paddingFor`'s docblock already said "right now"; this is what
   * makes that true.
   *
   * A **ref written from an effect**, not a `useCallback` dependency, and that is load-bearing.
   * `paddingFor` is a transitive dependency of `attachMapRef`; a callback ref whose identity
   * changes is detached and re-attached by React, and this one re-frames the whole library and
   * rebuilds the `ResizeObserver` when it runs. Making the padding depend on `selected` directly
   * would therefore throw the camera back to the anchor cluster on every selection. Same pattern,
   * and the same reason, as `latestBounds` and `accessibleNameRef`.
   *
   * Declared here rather than beside the movers so the effect that writes it runs **before** every
   * effect that frames the camera: within one component React runs effects in declaration order,
   * and selecting a place changes `selected` and `focusPlaceIds` in the same commit.
   */
  const sheetFractionRef = useRef(restingSheetFraction);
  useEffect(() => {
    sheetFractionRef.current =
      selected === null ? restingSheetFraction : (selectedOcclusionFraction ?? restingSheetFraction);
  }, [selected, restingSheetFraction, selectedOcclusionFraction]);

  /** The padding a fit has to leave for whatever chrome is over the map right now, measured
   *  against the container the camera is actually in. Read by every mover, so none of them can
   *  frame against a different idea of the visible band than the others. */
  const paddingFor = useCallback(
    (map: MapLibreMap) => {
      const container = map.getContainer();
      return fitBoundsPadding(
        typeof window === 'undefined' ? 0 : window.innerWidth,
        container.clientWidth,
        container.clientHeight,
        sheetFractionRef.current,
        floatingTopChromePx
      );
    },
    [floatingTopChromePx]
  );

  const fitTo = useCallback(
    (map: MapLibreMap, target: [[number, number], [number, number]], animate: boolean) => {
      // The container is the camera's own frame of reference, so a sheet expressed as a fraction of
      // it resolves correctly on every re-fit that reads a settled container — the `ResizeObserver`
      // one below does. The `window` resize listener further down does not: it runs *first* after an
      // orientation change, against a transform MapLibre has not resized yet. That is a known defect
      // in the resize path, tracked separately, and not something this function can compensate for.
      const padding = paddingFor(map);
      // **Ask before recording.** `fitBounds` answers an impossible fit — padding wider or taller
      // than the *transform* — by doing nothing whatsoever: `cameraForBounds` returns undefined and
      // `_fitInternal` returns before it moves anything, with no exception, no camera event and
      // nothing in the console. Recording the framing first therefore filed a fit that never
      // happened as one that did, and that is a bug with a long tail: `hasFramedOnce` guards the
      // whole-library framing, so one silent failure stranded the camera for the life of the page
      // at the transform's own minimum zoom — `log2(containerHeight / 512)` under
      // `renderWorldCopies: false`, with the latitude clamped to 0 — while every retry, the
      // `ResizeObserver`'s included, believed the map was framed. Measured against the probe in
      // `docs/handoff-2026-08-29-…`: a camera reported at `zoom 0.4798` in a 714 px container is
      // exactly that floor, not a coincidence.
      //
      // The impossible case is reachable and not theoretical: MapLibre falls back to a 400×300
      // transform when it is constructed before its container has a size, and `/map`'s own mobile
      // padding is 324 px of vertical, which does not fit in 300.
      if (!map.cameraForBounds(target, { padding, maxZoom: FIT_BOUNDS_MAX_ZOOM })) return;
      framing.current = { kind: 'fit', target };
      hasFramedOnce.current = true;
      map.fitBounds(target, {
        padding,
        maxZoom: FIT_BOUNDS_MAX_ZOOM,
        duration: animate ? FOCUS_FLIGHT_MS : 0,
      });
    },
    [paddingFor]
  );

  /**
   * The `focusBounds` framing itself, separated from the effect that requests it so that the resize
   * path can reproduce it. See camera mover 5 below for why it is `cameraForBounds` → clamp →
   * `easeTo` and not `fitBounds`.
   *
   * Two movers use it and the second is why it is no longer called `frameCountry`: near-me (mover
   * 8) asks for a **zero-extent** box at the user's own point with `minZoom === maxZoom`, which is
   * the same request shape saying "centre here, rest at exactly this zoom". A degenerate box is
   * handled by the code below without a branch — `cameraForBounds` either returns a finite camera
   * or nothing, and both paths already fall back to the box's own centre and `minZoom`.
   */
  const frameBounds = useCallback(
    (map: MapLibreMap, request: FocusBoundsRequest, animate: boolean) => {
      const { bounds, minZoom, maxZoom } = request;
      const padding = paddingFor(map);
      const duration = animate ? COUNTRY_FLIGHT_MS : 0;
      // A box wider than half the globe is one `unionBounds` cannot describe: it always emits
      // `west <= east`, so an antimeridian-straddling country arrives here inside out and
      // `cameraForBounds` frames the long way round. Degrade honestly to the country's own
      // centroid, which `meanCentroid` computes in 3-D and is correct there, rather than framing a
      // box that is wrong. Fixing it properly means changing `unionBounds` and `clusterByProximity`
      // together, which their own headers already say.
      const centre: [number, number] = [
        (bounds.west + bounds.east) / 2,
        (bounds.north + bounds.south) / 2,
      ];
      framing.current = { kind: 'bounds', request };
      hasFramedOnce.current = true;
      if (bounds.east - bounds.west > 180) {
        map.easeTo({ center: centre, zoom: minZoom, duration });
        return;
      }
      const camera = map.cameraForBounds(
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        { padding, maxZoom }
      );
      const zoom = camera?.zoom;
      map.easeTo({
        center: camera?.center ?? centre,
        zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? Math.max(zoom, minZoom) : minZoom,
        duration,
      });
    },
    [paddingFor]
  );

  /**
   * **Camera mover 1: the home framing.** The anchor cluster's box, come to rest inside the pin
   * band.
   *
   * It goes through `frameBounds` rather than `fitTo`, and the reason is the whole of the second
   * production defect of 2026-08-30. `fitBounds` has a zoom **ceiling** and no floor — its
   * `minZoom` is inherited from `FlyToOptions` and bounds the flight arc, not where the camera
   * stops (camera mover 5's docblock measured that) — so the home view lands wherever the box
   * happens to fit. Below `PIN_BAND_MIN` the pin layer does not draw, so a library whose anchor box
   * is a few tens of kilometres across opens on area pills and no pins at all: five bubbles over
   * Israel under a header that correctly read `3 places in תל אביב-יפו`. `cameraForBounds` → clamp
   * → `easeTo` is the only shape that can express a resting floor, and it is already written.
   *
   * The floor is not a re-centre. `frameBounds` keeps `cameraForBounds`' own centre, so a library
   * that fits comfortably (the common case — a city's worth of pins fits around z12) is untouched;
   * only a fit that would have landed outside the band moves, and it moves by zooming in on the
   * middle of the anchor rather than by choosing somewhere else.
   *
   * Recording the request rather than a box also fixes the resize path for free: `refitFramed`
   * reproduces the floor, where before it re-fitted through `fitBounds` and could demote the home
   * view out of the pin band on an orientation change.
   */
  const fitToBounds = useCallback(
    (map: MapLibreMap) => {
      const target = latestBounds.current;
      if (!target) return;
      frameBounds(
        map,
        {
          bounds: {
            west: target[0][0],
            south: target[0][1],
            east: target[1][0],
            north: target[1][1],
          },
          minZoom: HOME_LANDING_MIN_ZOOM,
          maxZoom: FIT_BOUNDS_MAX_ZOOM,
        },
        false
      );
    },
    [frameBounds]
  );

  /**
   * Put the camera back where it was after the container changed size under it.
   *
   * Dispatching on the *kind* of framing rather than re-fitting a stored box is what stops a
   * resize from quietly demoting a country tap: `fitBounds` has no resting floor, so re-fitting a
   * country's box through it lands wherever the box happens to fit — on pins for a small country,
   * on the country marker the user just tapped for a large one — which is precisely the pair of
   * failures camera mover 5 exists to prevent. Never animated: a resize is not a journey.
   *
   * A `user` framing is reproduced by leaving the camera alone — see the union's own note.
   */
  const refitFramed = useCallback(
    (map: MapLibreMap) => {
      const current = framing.current;
      if (current === null) {
        fitToBounds(map);
        return;
      }
      if (current.kind === 'user') return;
      if (current.kind === 'bounds') {
        frameBounds(map, current.request, false);
        return;
      }
      fitTo(map, current.target, false);
    },
    [fitTo, fitToBounds, frameBounds]
  );

  /**
   * **The user has taken the camera, so no mover may put it back.**
   *
   * Called from the three gestures that move the camera by hand — a drag, a wheel/pinch zoom, and
   * the zoom buttons, which are the user's hand even though they leave no `originalEvent`. It
   * retires whatever framing was recorded so a later resize reproduces *the gesture* (by doing
   * nothing) instead of replaying a programmatic framing the user has since moved away from.
   *
   * It is not a camera mover and moves nothing itself; it is the eraser that keeps the movers from
   * outliving their moment.
   */
  const noteUserGesture = useCallback(() => {
    framing.current = { kind: 'user' };
  }, []);

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
    // Read here, in the coalesced report, and nowhere else. The band is a property of where the
    // camera *came to rest*, so it belongs to the same trailing debounce as the rect: sampling it
    // on `move` or per frame would hand the caller every band the camera passed through on one
    // flick, and `ux-library-at-scale.md` §2.1's whole point is that the swap is MapLibre's, with
    // no zoom listener and nothing re-rendering under a moving thumb.
    const zoom = instance.getZoom();
    if (rect) handler(rect, { userInitiated, zoom, band: bandForZoom(zoom) });
  }, []);

  /**
   * A pan by the user. `dragend` covers pointer drags, touch drags and their inertia; MapLibre's
   * keyboard handler pans through the same drag machinery, so arrow keys arrive here too.
   */
  const handleDragEnd = useCallback(() => {
    pannedSinceReport.current = true;
    noteUserGesture();
  }, [noteUserGesture]);

  /**
   * A **zoom** by the user, which this file refused to report until now.
   *
   * Excluding zooms was right while the list was only ever one area: a zoom could hand the list to
   * another city by accident, and `ViewportChangeMeta` said so. The country band reversed it. Under
   * `list-scope.ts` a zoom is the *only* gesture that can cross a band, so with `dragend` as the
   * sole writer every transition that module defines was dead code — and the symptom was the one
   * the owner reported: zoom out until the country badges appear and the sidebar still says
   * `18 places in London`, describing something the map has stopped drawing.
   *
   * The guard is `originalEvent`, not the event name. `zoomend` fires for `flyTo`, `fitBounds` and
   * `easeTo` too, so keying on it alone would let all six camera movers rewrite the list — exactly
   * what the `userInitiated` flag exists to prevent, and worse than not reporting zooms at all.
   * MapLibre's handler manager attaches the wheel/touch/dblclick event that caused the zoom,
   * including onto the inertial `easeTo` it starts itself; a programmatic command carries none.
   *
   * **The zoom buttons are the exception, and this comment used to deny they existed.** It said
   * there is no `NavigationControl` on this map and therefore no buttons to account for — true of
   * MapLibre's own control and false of the map, which renders mapcn's `<MapControls showZoom>`.
   * Those buttons call `map.zoomTo`, a programmatic command carrying no `originalEvent`, so
   * pressing `−` until the country badges appear left the list still describing a city the map had
   * stopped drawing — the exact symptom `8a15423` was meant to end, surviving on the one zoom
   * affordance a desktop user is most likely to reach for. They report themselves instead, through
   * `onUserZoom`; the guard below stays as it is, because it is right about everything else.
   */
  const handleZoomEnd = useCallback(
    (event: { originalEvent?: unknown }) => {
      if (!event.originalEvent) return;
      pannedSinceReport.current = true;
      noteUserGesture();
    },
    [noteUserGesture]
  );

  /** A zoom the user asked for through a control rather than a gesture. Same authority as a wheel
   *  or a pinch: the button is the user's hand, it just leaves no `originalEvent` behind. */
  const handleControlZoom = useCallback(() => {
    pannedSinceReport.current = true;
    noteUserGesture();
  }, [noteUserGesture]);

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
  /**
   * The canvas's accessible name.
   *
   * MapLibre labels its own canvas `Map` and marks it `role="region"` with `tabindex="0"`, so a
   * screen reader user tabs into the map and is told the word "map" — which they could already
   * see from the page. `accessibleName` says what is on it instead.
   *
   * Written from `attachMapRef` and not from the effect alone, and the ref is what makes that
   * possible. The instance arrives through mapcn's `useImperativeHandle` on a commit of its own,
   * which does not re-render this component — so an effect keyed on `accessibleName` would run
   * once with `mapRef.current` still null and then never again on a map whose heading never
   * changes. The effect keeps it in step afterwards, when it does.
   */
  const accessibleNameRef = useRef(accessibleName);
  useEffect(() => {
    accessibleNameRef.current = accessibleName;
    if (accessibleName === undefined) return;
    mapRef.current?.getCanvas().setAttribute('aria-label', accessibleName);
  }, [accessibleName]);

  const attachMapRef = useCallback(
    (instance: MapLibreMap | null) => {
      const previous = mapRef.current;
      if (previous && previous !== instance) {
        previous.off('dragend', handleDragEnd);
        previous.off('zoomend', handleZoomEnd);
        previous.off('moveend', scheduleViewportReport);
        previous.off('resize', scheduleViewportReport);
        observers.get(previous)?.disconnect();
        observers.delete(previous);
      }
      mapRef.current = instance;
      if (!instance) return;
      const name = accessibleNameRef.current;
      if (name !== undefined) instance.getCanvas().setAttribute('aria-label', name);
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
        // pins (the symptom as it was observed; the bubbles are gone since `L1-F5-T5`), which is
        // exactly what `current-state.md` §9.1 attributed to fitting all places at once.
        //
        // Re-run whatever was last framed, so a resize never undoes a focus flight; fall back to
        // the initial bounds when nothing has been framed yet — which now includes the case where
        // an earlier fit was impossible against a smaller transform and correctly declined to
        // record itself, so this is the retry that un-strands the camera.
        refitFramed(instance);
        // The rect moved with the canvas, and neither `resize()` nor an instant `fitBounds` is
        // guaranteed to leave a `moveend` behind.
        scheduleViewportReport();
      });
      observer.observe(container);
      observers.set(instance, observer);
      whenReady(instance, () => fitToBounds(instance));
      // `moveend` only — no `move`, no `render`, no rAF. `resize` too, because the insets are
      // viewport-dependent: crossing `lg` changes which edge the chrome covers. `dragend` and
      // `zoomend` carry no rect of their own; they only record that the move about to be reported
      // was the user's.
      instance.on('dragend', handleDragEnd);
      instance.on('zoomend', handleZoomEnd);
      instance.on('moveend', scheduleViewportReport);
      instance.on('resize', scheduleViewportReport);
      // The first settle. Without this the caller holds no rect until the user touches the map,
      // and an empty list on arrival reads as the whole feature being broken. Scheduled through the
      // same debounce so the initial `fitBounds` issued just above coalesces into one report
      // instead of producing a pre-fit rect and then a post-fit one.
      whenReady(instance, scheduleViewportReport);
    },
    [fitToBounds, refitFramed, scheduleViewportReport, handleDragEnd, handleZoomEnd]
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

  /**
   * **Camera mover 6: the pin you just tapped is not allowed to vanish under the sheet.**
   *
   * Tapping a pin raises the sheet from the 128 px peek stop to `half`, which covers 55% of the
   * viewport. Measured at 375×812 on the real library: a pin at y = 590 stayed exactly where it
   * was while the sheet's top came to rest at y = 365, so the place the user had just tapped was
   * 225 px underneath it — selected, its detail open, and invisible. Every pin in the lower half
   * of the screen had that behaviour, which is most of them.
   *
   * The rule this does **not** break is the one the pin handler states: tapping a pin must not
   * move the camera under the finger that tapped it. That rule was written against a *flight* —
   * re-centring on the tapped place, which throws the rest of the map away and is disorienting on
   * every tap. This is the minimum corrective pan and nothing more: if the pin already sits in the
   * band the chrome leaves visible, **the camera does not move at all**, and where it does move it
   * moves by exactly the shortfall. A tap on a pin in the top half is still a camera no-op.
   *
   * It is `easeTo` rather than `flyTo` because the two are different gestures. A flight arcs out
   * through a lower zoom and reads as "we are going somewhere"; this is a nudge, the zoom never
   * changes, and it should read as the sheet pushing the map up rather than as travel.
   *
   * Keyed on the selected id, so re-rendering for any other reason cannot re-pan; and it reads the
   * **container**, never `window.innerHeight`, because the container is what `project` speaks and a
   * stale size has already cost this file a real bug.
   *
   * **It is declared before the three framing movers on purpose, and that ordering is behaviour.**
   * React runs a component's effects in declaration order, and `easeTo`/`flyTo` both call `stop()`
   * first — so whichever camera command runs last in a commit is the one that survives. Selecting a
   * place from the list changes `selected` and `focusPlaceIds` in the same commit, and this nudge
   * used to run *after* the flight and cancel it: the pin ended up jammed against the edge of the
   * visible band at the old zoom instead of being flown to. The nudge measures the pin where it is
   * **now**, so it cannot reason about where a flight is going; the rule is therefore that an
   * explicit framing request always outranks it, and running first is how that is expressed with no
   * extra state. A commit that only raises the sheet still reaches it, which is the pin-tap case it
   * exists for.
   */
  const revealedFor = useRef<string | null>(null);
  useEffect(() => {
    const place = selected;
    const id = place?.id ?? null;
    // Deselecting must not pan anything back. The user has moved on, and a camera that rewinds
    // itself when a sheet closes is a second unrequested move paying for the first.
    if (place === null || id === null) {
      revealedFor.current = null;
      return;
    }
    if (revealedFor.current === id) return;
    const instance = mapRef.current;
    if (!instance) return;
    revealedFor.current = id;

    const container = instance.getContainer();
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const occlusion = mapOcclusionInsets(
      typeof window === 'undefined' ? width : window.innerWidth,
      selectedOcclusionFraction === undefined ? undefined : selectedOcclusionFraction * height
    );

    const point = instance.project([place.lng, place.lat]);
    // The icon is anchored at the teardrop's tip, so its body is entirely *above* the coordinate.
    // Clearing the tip alone would leave the pin itself half under the sheet, which is the same
    // defect one marker-height further on.
    const pinHeight = pinGeometry(true).height;

    const minX = occlusion.left + REVEAL_MARGIN_PX;
    const maxX = width - occlusion.right - REVEAL_MARGIN_PX;
    const minY = occlusion.top + REVEAL_MARGIN_PX + pinHeight;
    const maxY = height - occlusion.bottom - REVEAL_MARGIN_PX;
    // An occlusion taller than the container leaves no band to reveal into. Do nothing rather than
    // pan to a nonsense target — `clampFitPadding`'s header makes the same call for the same reason.
    if (minX >= maxX || minY >= maxY) return;

    const dx = point.x < minX ? point.x - minX : point.x > maxX ? point.x - maxX : 0;
    const dy = point.y < minY ? point.y - minY : point.y > maxY ? point.y - maxY : 0;
    if (dx === 0 && dy === 0) return;

    // `panBy` negates its argument and hands it to `easeTo` as an offset, so passing the point's
    // own overshoot moves that point onto the boundary. Verified in `maplibre-gl/src/ui/camera.ts`
    // (`panBy` at :432 does `Point.convert(offset).mult(-1)`), not assumed.
    instance.panBy([dx, dy], { duration: REVEAL_PAN_MS });
  }, [selected, selectedOcclusionFraction]);

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

  /**
   * **Camera mover 5: a country tap frames that country's areas, clamped inside the area band.**
   *
   * Not `fitBounds`, and that is a measured correction rather than a preference. `fitBounds`'
   * `minZoom` is inherited from `FlyToOptions` and means "a floor on the flight *arc*" — it is read
   * inside `flyTo` and ignored under `linear: true`, so it cannot bound where the camera comes to
   * rest. `cameraForBounds` → clamp → `easeTo` is the only shape that can.
   *
   * The floor is what makes the gesture work at all, and both of its failures were measured on a
   * 390×844 transform with `/map`'s real padding. A globe-spanning country fits at zoom −0.331,
   * which is *below* the country band: you tap a country and arrive back on country markers, so
   * the tap appears to do nothing. A country holding one saved place is a zero-extent box, which
   * fits at the ceiling and drops you straight onto a pin — the one outcome §2.4 forbids by name,
   * since you can never jump from a country to pins.
   *
   * `prefers-reduced-motion` needs no branch: `easeTo` sets its own duration to 0 under it, as long
   * as nothing passes `essential: true`, and nothing here does.
   *
   * The framing itself lives in `frameBounds` above, because a resize has to be able to reproduce
   * it. It did not, until now: this flight recorded nothing, so the next container resize re-fitted
   * the *library* box and threw the camera back off the country the user had just chosen.
   */
  const flownBounds = useRef<MapSurfaceProps['focusBounds']>(undefined);
  useEffect(() => {
    if (!focusBounds) return;
    if (flownBounds.current === focusBounds) return;
    const instance = mapRef.current;
    if (!instance) return;
    flownBounds.current = focusBounds;
    whenReady(instance, () => frameBounds(instance, focusBounds, true));
  }, [focusBounds, frameBounds]);

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
      if (!instance) return;
      refitFramed(instance);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [refitFramed]);

  return (
    <MapcnMap
      ref={attachMapRef}
      className="h-full w-full"
      styles={{ light: CARTO_LIGHT_STYLE, dark: CARTO_LIGHT_STYLE }}
      attributionControl={{ compact: true }}
    >
      {/* Zoom only, plus whatever the caller puts in `controlSlot` above it. The compass steers a
          bearing the map never leaves 0 for, and "fullscreen" on a surface that already fills the
          viewport is an icon for a no-op — five stacked buttons were ~250px of an 812px phone, and
          the two lowest of them sat under the sheet.
          Dropping to three did not clear the sheet: at 375x812 the group still opened at y=667
          against a sheet top of 684, so `Zoom out` and `Find my location` were both wholly behind
          it and the locate button also sat under the create FAB. The `globals.css` rule that lifts
          the attribution cannot reach these — it selects `.maplibregl-ctrl-bottom-right`, MapLibre's
          own chrome, and the column below is a plain absolutely-positioned div beside it. The inset
          is the same one that rule uses (peek + safe area) plus room for the attribution line the
          group now stacks above. `lg` restores the library default: no sheet, nothing to clear.

          `showLocate` is deliberately **off** since `L1-F11`. The registry's own locate button
          answers a denial with a `console.error` and a stopped spinner, and flies the camera itself
          at a hard-coded zoom — a silent failure and an undocumented camera mover, neither
          fixable from outside `components/ui/map.tsx`. `NearMeControl` arrives through the slot
          instead, owned by the page.

          The column is one absolutely-positioned flex stack holding both, so the slot and the zoom
          group cannot drift apart at a breakpoint. `MapControls` is taken out of its own corner by
          `relative bottom-auto right-auto`, which `cn`'s tailwind-merge resolves against the
          `absolute bottom-* right-*` it applies itself. */}
      <div className="absolute right-2 z-10 flex flex-col items-end gap-1.5 bottom-[calc(128px+env(safe-area-inset-bottom)+3rem)] lg:bottom-10">
        {controlSlot}
        <MapControls
          showZoom
          onUserZoom={handleControlZoom}
          className="relative bottom-auto right-auto"
        />
      </div>
      <BasemapTint />
      {hasSummaryBands && (
        <SummaryMarkerLayer
          countries={countryFeatures}
          areas={areaFeatures}
          discs={discs}
          theme={theme}
          {...(onCountryClick ? { onCountryClick } : {})}
          {...(onAreaClick ? { onAreaClick } : {})}
        />
      )}
      <PlaceMarkerLayer
        data={data}
        selectedId={selected?.id ?? null}
        // The same expression that mounts the bands above decides the pins' floor, and that is the
        // point: the floor exists only because the bands replace what it hides. A surface with no
        // bands (`/collections/[id]`) gets `null` and keeps every pin at every zoom, instead of
        // going blank below z8.5 with nothing drawn in their place — see `place-marker-layer.tsx`.
        replacedBelowZoom={hasSummaryBands ? PIN_BAND_MIN : null}
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
          {/* `MapPlace.id` is a `saved_places` id for every surface that renders this map. */}
          <PlaceDetail
            place={selected}
            savedPlace={{
              id: selected.id,
              visited: selected.visited,
              // Same read as the mobile sheet's: `visitedAt` is on the joined `Spot`, not on the
              // pin. Spread rather than an explicit `undefined` under `exactOptionalPropertyTypes`
              // — a row marked been before the column was written has no timestamp, and absent is
              // what that is.
              ...(selected.detail?.visitedAt ? { visitedAt: selected.detail.visitedAt } : {}),
            }}
            nearby={nearbyToSelected}
            onSelectNearby={(id) => {
              const neighbour = places.find((candidate) => candidate.id === id);
              if (neighbour) onPlaceClick?.(neighbour);
            }}
            onClose={() => onDeselect?.()}
            variant="popover"
          />
        </MapPopup>
      )}
    </MapcnMap>
  );
}
