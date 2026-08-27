/**
 * Pin paint for the mapcn map surface — the *look* of a saved place on the map, kept apart from
 * `map-surface.mapcn.tsx` so it can be tested without standing up React, mapcn and a WebGL
 * context. The only import is a MapLibre **type**, which is erased at build time, so this module
 * has no runtime dependency at all.
 *
 * Written 2026-08-28 for the legibility pass described on `applyPinPaint` below.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';

// Cluster/pin palette — the hex values behind this project's `--pin` / `--pin-selected` tokens
// (`src/app/globals.css`), hardcoded because MapLibre paint properties take canvas fill values,
// not CSS custom properties.
export const PIN_MINT_700 = '#2E7A70'; // --pin
export const PIN_MINT_900 = '#215F56'; // --pin-selected
export const PIN_INK_ON_MINT = '#123B35'; // --ink-on-mint, darkest cluster tier
export const PIN_HALO = '#FFFFFF'; // --pin-halo
// `MapClusterLayer` hardcodes its stroke color to `#fff` (not a prop) for both the cluster and
// unclustered-point layers — this happens to already equal `--pin-halo` (`#FFFFFF`), so no
// override was needed there. The *widths* and *radii* are re-set below (`applyPinPaint`).

// Stable identities, deliberately module-level rather than inline array literals in the JSX.
//
// `MapClusterLayer`'s style-update effect re-sets `circle-color` **and** `circle-radius` on the
// cluster layer whenever `prev.clusterColors !== clusterColors` — a reference comparison. Inline
// `[...]` literals in the JSX produce a fresh array on every render, so that branch ran on every
// render and would have stamped mapcn's own default radius ramp back over the one `applyPinPaint`
// sets. Hoisting them makes the comparison false after mount, which is both the correct behaviour
// (the colours never change) and what makes the override below stick.
export const CLUSTER_COLORS: [string, string, string] = [PIN_MINT_700, PIN_MINT_900, PIN_INK_ON_MINT];
export const CLUSTER_THRESHOLDS: [number, number] = [100, 750];

/**
 * Pin legibility (owner, 2026-08-28: "at a glance the map reads as empty").
 *
 * `MapClusterLayer` renders unclustered saves as a `circle` at a fixed `circle-radius: 5` with a
 * 2px white stroke, and exposes neither as a prop — only the colours. Over CARTO Positron's
 * near-white land fill a 10px dot with a white ring has almost nothing to separate it from the
 * basemap: measured on this app's own seeded library at 1440×900, the single Tel Aviv saves read
 * as specks while the clusters read fine. On a product whose whole proposition is "your places on
 * a map", the places have to be the most legible thing on the surface.
 *
 * What this does instead, and it is a legibility pass rather than a token redesign — the colours
 * are exactly `--pin` / `--pin-selected` / `--pin-halo` as before:
 *
 * - **Size, and it now responds to zoom.** A single save goes from a flat r5 to r7 at z≤10 (where
 *   pins are context) up to r11 by z17 (where a pin is the thing you are looking at). A dot that
 *   grows as you close in reads as a place; one that stays 10px across reads as map furniture.
 *   The bigger hit area is a usability win on a phone as well as a legibility one — the click
 *   target for a pin is the circle itself.
 * - **A halo that actually haloes.** The white ring goes from a flat 2px to 2.5–3.5px, widening
 *   with zoom. Positron's land is near-white, so the ring earns its keep over roads, parks and
 *   water rather than over the land fill — but it is what stops a pin merging into a road casing.
 * - **Selection is visible on the map, not only in the sheet.** The selected pin switches to
 *   `--pin-selected` and gains 3px of radius and 1px of halo. Previously tapping a pin changed
 *   nothing on the map surface at all: the popover/sheet opened and the pin you tapped was
 *   indistinguishable from its neighbours, so "which one did I just open" had no answer.
 * - **Clusters get quieter, not louder.** They were r20 flat with a 0.75px stroke at 85% opacity —
 *   four times a single pin's area regardless of whether they held 2 saves or 20. They now scale
 *   with `point_count` from r15 (2 saves) to r26 (50+), take the same 2px halo as the pins, and
 *   sit at 0.94 opacity so the white count reads. The point is the *hierarchy*: a cluster should
 *   be a slightly bigger sibling of a pin, not a different species.
 *
 * Deliberately not done: no second GL layer for a drop shadow or an outer glow, and no fork of
 * `MapClusterLayer`. A shadow layer would have to be added against a source mapcn owns and
 * removes in its own cleanup, which trades a real teardown hazard for a cosmetic gain; the brand
 * bar here is "premium and quiet" and paint properties on the existing layers reach it.
 *
 * Everything below is paint-only. Camera choreography, `fitBounds` padding, the query rect and
 * the click wiring are untouched.
 */
/** mapcn derives its layer ids from a `useId()` we cannot see, but the prefixes are stable. */
const CLUSTER_LAYER_PREFIX = 'clusters-';
const POINT_LAYER_PREFIX = 'unclustered-point-';

/** Radius/halo bumps applied to whichever pin is currently selected. */
const SELECTED_RADIUS_BUMP = 3;
const SELECTED_HALO_BUMP = 1;

/**
 * Guard against the feedback loop this override would otherwise create. `setPaintProperty` marks
 * the style dirty, and the next render then fires `styledata` — the very event that triggers the
 * re-apply. Without a signature check the pair oscillates for the life of the page. Weak, so an
 * unmounted map's entry is collectable.
 */
const appliedPinPaint = new WeakMap<MapLibreMap, string>();

export function findLayerId(map: MapLibreMap, prefix: string): string | null {
  return map.getLayersOrder().find((id) => id.startsWith(prefix)) ?? null;
}

/**
 * Re-paint mapcn's cluster and unclustered-point layers. Idempotent: a no-op unless the selected
 * place or the layer ids have changed since the last successful application.
 *
 * Every expression below is written inline rather than hoisted to a named constant on purpose —
 * MapLibre's paint-property types are recursive tuple unions that only resolve through contextual
 * typing at the call site, and `maplibre-gl` does not re-export `ExpressionSpecification` to
 * annotate them with. (Reaching into the transitive `@maplibre/maplibre-gl-style-spec` for the
 * type would be depending on a package this repo has not declared.)
 */
export function applyPinPaint(map: MapLibreMap, selectedId: string | null): void {
  const pointLayerId = findLayerId(map, POINT_LAYER_PREFIX);
  const clusterLayerId = findLayerId(map, CLUSTER_LAYER_PREFIX);
  // mapcn adds its layers in its own `isLoaded` effect, which can land after ours. Not an error —
  // the `styledata` listener that called us fires again when they arrive.
  if (!pointLayerId || !clusterLayerId) return;

  const signature = `${pointLayerId}|${clusterLayerId}|${selectedId ?? ''}`;
  if (appliedPinPaint.get(map) === signature) return;

  // `['==', ['get', 'id'], null]` is a valid, always-false expression, so "nothing selected" needs
  // no separate branch — `toFeatureCollection` always writes a string `id`.
  map.setPaintProperty(pointLayerId, 'circle-color', [
    'case',
    ['==', ['get', 'id'], selectedId],
    PIN_MINT_900,
    PIN_MINT_700,
  ]);
  // The selection bump is folded into each zoom stop rather than added around the whole ramp.
  // MapLibre rejects `['+', ['interpolate', ['zoom'], ...], ...]` outright — "`zoom` expression may
  // only be used as input to a top-level `step` or `interpolate` expression" — and does so by
  // throwing from `setPaintProperty`, i.e. at runtime with the paint silently unchanged. A
  // zoom-driven ramp whose *outputs* are feature-driven is the supported composition order.
  map.setPaintProperty(pointLayerId, 'circle-radius', [
    'interpolate',
    ['linear'],
    ['zoom'],
    10, ['case', ['==', ['get', 'id'], selectedId], 7 + SELECTED_RADIUS_BUMP, 7],
    14, ['case', ['==', ['get', 'id'], selectedId], 9 + SELECTED_RADIUS_BUMP, 9],
    17, ['case', ['==', ['get', 'id'], selectedId], 11 + SELECTED_RADIUS_BUMP, 11],
  ]);
  map.setPaintProperty(pointLayerId, 'circle-stroke-color', PIN_HALO);
  map.setPaintProperty(pointLayerId, 'circle-stroke-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    10, ['case', ['==', ['get', 'id'], selectedId], 2.5 + SELECTED_HALO_BUMP, 2.5],
    14, ['case', ['==', ['get', 'id'], selectedId], 3 + SELECTED_HALO_BUMP, 3],
    17, ['case', ['==', ['get', 'id'], selectedId], 3.5 + SELECTED_HALO_BUMP, 3.5],
  ]);

  map.setPaintProperty(clusterLayerId, 'circle-radius', [
    'interpolate',
    ['linear'],
    ['get', 'point_count'],
    2, 15,
    5, 18,
    15, 22,
    50, 26,
  ]);
  map.setPaintProperty(clusterLayerId, 'circle-stroke-color', PIN_HALO);
  map.setPaintProperty(clusterLayerId, 'circle-stroke-width', 2);
  map.setPaintProperty(clusterLayerId, 'circle-opacity', 0.94);

  appliedPinPaint.set(map, signature);
}
