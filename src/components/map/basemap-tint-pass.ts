/**
 * One tint pass over a loaded style, and the snapshot that makes it invertible.
 *
 * **The defect this file exists for.** The pass used to read each layer's paint straight off
 * `map.getStyle()`, which serialises the *live* style — so on the second pass it was re-tinting
 * colours the first pass had already written. `tintColor` keeps each colour's own lightness and
 * only clamps it (`Tint.maxLightness` / `Tint.minLightness`), so that composition is only
 * invertible when both tables clamp in both directions. They do not: the night table is nearly all
 * caps, and the light table (`BASEMAP_TINTS`) states **no floor at all**. Light → dark therefore
 * pulled every value down and looked right, and dark → light could only cap — land pinned at
 * L 0.135 stayed 0.135 under the light theme's 0.97 ceiling, and labels floored at 0.86 stayed
 * near-white. The map never came back.
 *
 * The theme toggle does not reload the style (`map-surface.mapcn.tsx` passes the same CARTO URL for
 * `styles.light` and `styles.dark`, so `components/ui/map.tsx` never calls `setStyle`), which is
 * what makes the second pass see the first one's output at all.
 *
 * **The fix is to tint from CARTO's own paint every time.** Each (layer, property) pair is recorded
 * the first time it is seen — which is before anything here has written to it — and every pass,
 * including the very first, tints that recorded value. The transform stops being composed with
 * itself, so it no longer has to be invertible: dark → light is not "undo the night", it is "apply
 * the day table to Positron", exactly as a fresh load would.
 *
 * Kept out of `basemap-tint-layer.tsx` so the pass can be run against a fake style in a unit test.
 * The component owns the effect and the snapshot's lifetime; this owns the loop.
 */

import type { Theme } from '@/lib/theme';

import {
  POI_LABEL_LAYER_ID,
  TINTED_PAINT_PROPERTIES,
  roleFor,
  tintFor,
  tintPaintValue,
} from './basemap-tint';

/** The paint bag a serialised layer carries. Unknown values: Positron writes strings, legacy
 *  `{ stops }` functions and expression arrays, and `tintPaintValue` walks all three. */
type Paint = Record<string, unknown>;

/**
 * The least of MapLibre's `Map` this pass needs — so a test can hand it a style it wrote by hand,
 * including one that mirrors the real defect by serialising back whatever was last set.
 */
export interface TintTarget {
  getStyle(): { layers?: readonly { id: string; paint?: Paint }[] } | undefined;
  setPaintProperty(layerId: string, property: string, value: never): unknown;
}

/**
 * CARTO's original paint, per layer and property, captured the first time each pair is seen.
 *
 * Capture is lazy and per property rather than a single sweep at style load, because layers arrive
 * over time and a sweep would have to guess when the style is complete. "The first time we are
 * about to tint it" is exactly the moment the value is still CARTO's own.
 *
 * Nothing clears it, on purpose: the only style this map ever loads is the one CARTO URL, so a
 * reload restores the same originals this already holds. A snapshot is scoped to a map instance
 * (`paintSnapshotFor`), and a new map gets a new one.
 */
export class BasemapPaintSnapshot {
  private readonly layers = new Map<string, Map<string, unknown>>();

  /** Records `live` if this pair is new, and returns whatever was recorded — never a tinted value. */
  original(layerId: string, property: string, live: unknown): unknown {
    let paint = this.layers.get(layerId);
    if (!paint) {
      paint = new Map<string, unknown>();
      this.layers.set(layerId, paint);
    }
    if (!paint.has(property)) paint.set(property, live);
    return paint.get(property);
  }

  has(layerId: string, property: string): boolean {
    return this.layers.get(layerId)?.has(property) ?? false;
  }

  /** How many (layer, property) pairs are held. For tests and for reasoning about a style reload. */
  get size(): number {
    let total = 0;
    for (const paint of this.layers.values()) total += paint.size;
    return total;
  }
}

const SNAPSHOTS = new WeakMap<object, BasemapPaintSnapshot>();

/** The snapshot belonging to one map instance, created on first use. */
export function paintSnapshotFor(map: object): BasemapPaintSnapshot {
  let snapshot = SNAPSHOTS.get(map);
  if (!snapshot) {
    snapshot = new BasemapPaintSnapshot();
    SNAPSHOTS.set(map, snapshot);
  }
  return snapshot;
}

/**
 * Re-tint every CARTO layer for `theme`, always from the snapshot rather than from live paint.
 *
 * Safe to run any number of times and in any theme order: the result depends only on the theme
 * asked for, which is the property the toggle needs and the one the old pass did not have.
 */
export function applyBasemapTint(
  map: TintTarget,
  theme: Theme,
  snapshot: BasemapPaintSnapshot,
): void {
  for (const layer of map.getStyle()?.layers ?? []) {
    // Our own POI layer is exempt. It carries a `match` on `class` rather than a flat colour
    // (`poi-style.ts`), and the tint's job is to push a colour to one hue — run over this layer it
    // would collapse six families back to one.
    if (layer.id.startsWith(POI_LABEL_LAYER_ID)) continue;
    const role = roleFor(layer.id);
    if (!role) continue;
    const paint = layer.paint;
    if (!paint) continue;

    for (const property of TINTED_PAINT_PROPERTIES) {
      // A property the *live* style does not carry. Once a pair is in the snapshot it stays
      // tintable even if a later serialisation drops it, which is what keeps a theme toggle from
      // depending on the order the passes ran in.
      if (!(property in paint) && !snapshot.has(layer.id, property)) continue;
      const original = snapshot.original(layer.id, property, paint[property]);
      const tinted = tintPaintValue(original, tintFor(role, property, theme));
      try {
        map.setPaintProperty(layer.id, property, tinted as never);
      } catch {
        // A property this layer type does not accept, or a style mid-reload. The layer keeps
        // CARTO's own colour, which is the right thing to fall back to.
      }
    }
  }
}
