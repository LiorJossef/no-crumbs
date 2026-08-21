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
 * 2. Pins/clusters. `MapClusterLayer` (`src/components/ui/map.tsx`, read before deciding) renders
 *    three GL `circle`/`symbol` layers with paint-property props (`clusterColors`,
 *    `clusterThresholds`, `pointColor`) — VERIFIED from source that it does not accept a custom
 *    marker/icon element or a slot for one (unlike `MapMarker`, which does but isn't clustering-
 *    aware), so "custom marker icons" isn't available here without forking the component; styling
 *    is done through its existing paint props instead. Colors below are the hex values behind this
 *    project's `--pin` / `--pin-selected` / `--pin-halo` tokens (`src/app/globals.css`) — hardcoded
 *    because MapLibre paint properties are canvas fill values, not CSS, so a `var(--token)`
 *    reference can't be handed to them directly. The default mapcn blue (`#3b82f6` family) is gone;
 *    the cluster ramp reuses `--pin`/`--pin-selected` plus the darkest mint step (`ink-on-mint`) so
 *    every cluster tier stays legible under the white count label, and unclustered points use
 *    `--pin`; the component's fixed (non-prop) `#fff` stroke already equals `--pin-halo`, so no
 *    override was needed there. Radius/stroke-width and true icon markers aren't exposed as props
 *    either — a fork of `MapClusterLayer` would be needed for those, out of scope for this pass.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Map as MapcnMap, MapControls, MapClusterLayer, MapPopup } from '@/components/ui/map';
import { PlaceDetail } from '@/components/sheet/place-sheet';
import type { LatLngBoundsHint, MapPlace, MapSurfaceProps } from './types';

type PlaceProperties = {
  id: string;
  name: string;
  category: string;
  note: string;
};

function toFeatureCollection(places: readonly MapPlace[]) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map((place) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        name: place.name,
        category: place.category,
        note: place.note,
      } satisfies PlaceProperties,
    })),
  };
}

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

// Cluster/pin palette — the hex values behind this project's `--pin` / `--pin-selected` tokens
// (`src/app/globals.css`), hardcoded because MapLibre paint properties take canvas fill values,
// not CSS custom properties.
const PIN_MINT_700 = '#2E7A70'; // --pin
const PIN_MINT_900 = '#215F56'; // --pin-selected
const PIN_INK_ON_MINT = '#123B35'; // --ink-on-mint, darkest cluster tier
// `MapClusterLayer` hardcodes its stroke color to `#fff` (not a prop) for both the cluster and
// unclustered-point layers — this happens to already equal `--pin-halo` (`#FFFFFF`), so no
// override was needed there.

// CARTO's style JSON carries no `attribution` field on its source (verified by inspecting the
// fetched style.json), so MapLibre's built-in AttributionControl has nothing to render unless we
// supply it explicitly. Required per the evidence note: CARTO + OpenStreetMap credited on every map.
const CARTO_ATTRIBUTION =
  '© <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a> ' +
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

// Padding (px) and zoom ceiling for the initial fit-to-bounds fly-in. A ceiling stops a
// single-place import (a zero-area bounding box) from zooming in absurdly tight.
const FIT_BOUNDS_PADDING = 48;
const FIT_BOUNDS_MAX_ZOOM = 15;

// Tailwind's default `lg` breakpoint (unmodified in this project — no `tailwind.config`/`@theme`
// override), the same one `PlaceDesktopPanel` switches on (`hidden lg:block`). Below this width
// there is no persistent left/right panel at all — the sheet (`PlaceSheet`) owns mobile instead —
// so `fitBounds` padding stays the old uniform value there.
const LG_BREAKPOINT_PX = 1024;

// Mirrors `PlaceDesktopPanel`'s panel width (`src/components/sheet/place-desktop-panel.tsx`):
// the persistent left list panel is `clamp(320px, 26vw, 392px)`. `fitBounds`'s `padding` option
// takes plain pixels, not CSS, so there is no way to hand it a `clamp()` — this function
// recomputes the same clamp in JS against the current viewport width instead. If the panel's
// Tailwind class ever changes, this must change with it; that coupling is the price of a DOM
// overlay sharing the camera-fit budget, and is called out again in `PlaceDesktopPanel`'s own
// comment. There used to be a matching `rightPanelWidthPx` for a right-hand detail panel — that
// panel is gone (detail now lives in a pin-anchored map popover, not a second panel), so the
// padding this function returns is never widened on selection anymore.
function leftPanelWidthPx(viewportWidth: number): number {
  return Math.min(392, Math.max(320, viewportWidth * 0.26));
}

/**
 * The base 48 px `fitBounds` padding treats the whole viewport as available map space. At `lg+`
 * that's wrong: `PlaceDesktopPanel`'s left list panel is a permanent opaque overlay, so any
 * bounding box that would otherwise fit *underneath* it needs to be pushed clear of it instead —
 * otherwise a fitted pin renders in the DOM/GL layer but sits under an opaque panel, unclickable.
 * Below `lg` (no panel, only the bottom sheet, which is `PlaceSheet`'s own concern) this collapses
 * back to the old uniform value.
 */
function fitBoundsPadding(
  viewportWidth: number
): number | { top: number; bottom: number; left: number; right: number } {
  if (viewportWidth < LG_BREAKPOINT_PX) return FIT_BOUNDS_PADDING;
  return {
    top: FIT_BOUNDS_PADDING,
    bottom: FIT_BOUNDS_PADDING,
    left: FIT_BOUNDS_PADDING + leftPanelWidthPx(viewportWidth),
    right: FIT_BOUNDS_PADDING,
  };
}

export function MapSurfaceMapcn({
  places,
  onPlaceClick,
  initialBounds,
  selected = null,
  onDeselect,
}: MapSurfaceProps) {
  const data = useMemo(() => toFeatureCollection(places), [places]);
  const bounds = useMemo(() => boundsFor(places, initialBounds), [places, initialBounds]);

  const mapRef = useRef<MapLibreMap | null>(null);
  // Read inside the `load`-time callback below, which is created once (on mount) and must see
  // whatever bounds are current at the moment the map finishes loading, not the bounds that were
  // current when the callback closure was created. Updated in an effect, never during render.
  const latestBounds = useRef(bounds);
  useEffect(() => {
    latestBounds.current = bounds;
  }, [bounds]);

  const fitToBounds = useCallback((map: MapLibreMap) => {
    const target = latestBounds.current;
    if (!target) return;
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const padding = fitBoundsPadding(viewportWidth);
    map.fitBounds(target, { padding, maxZoom: FIT_BOUNDS_MAX_ZOOM, duration: 0 });
  }, []);

  const attachMapRef = useCallback(
    (instance: MapLibreMap | null) => {
      mapRef.current = instance;
      if (!instance) return;
      if (instance.loaded()) fitToBounds(instance);
      else instance.once('load', () => fitToBounds(instance));
    },
    [fitToBounds]
  );

  // Re-fit whenever `places`/`initialBounds` change (e.g. a fresh import lands more pins, or the
  // fixture/initial data simply arrives after the map's own `load` event already fired and found
  // `bounds` still null) so every pin stays in view. This intentionally is not skipped on mount:
  // `attachMapRef`'s `once('load', ...)` races against `places` arriving, and when the map loads
  // before the first non-null `bounds` is computed, this effect is the only thing that ever frames
  // the camera. Calling `fitToBounds` twice for the same bounds (once from `load`, once from here)
  // is harmless — `fitBounds` is idempotent for an unchanged target.
  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !bounds) return;
    if (!instance.loaded()) return; // `attachMapRef`'s `once('load', ...)` will pick this up.
    fitToBounds(instance);
  }, [bounds, fitToBounds]);

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
      if (!instance || !bounds || !instance.loaded()) return;
      fitToBounds(instance);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bounds, fitToBounds]);

  return (
    <MapcnMap
      ref={attachMapRef}
      className="h-full w-full"
      styles={{ light: CARTO_LIGHT_STYLE, dark: CARTO_LIGHT_STYLE }}
      attributionControl={{ compact: true, customAttribution: CARTO_ATTRIBUTION }}
    >
      <MapControls showZoom showCompass showLocate showFullscreen />
      <MapClusterLayer<PlaceProperties>
        data={data}
        clusterRadius={50}
        clusterMaxZoom={13}
        clusterColors={[PIN_MINT_700, PIN_MINT_900, PIN_INK_ON_MINT]}
        pointColor={PIN_MINT_700}
        onPointClick={(feature) => {
          const id = feature.properties?.id;
          const place = places.find((candidate) => candidate.id === id) ?? null;
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
