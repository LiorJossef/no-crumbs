/**
 * `components/map/pin-paint.ts` — the paint override that makes a saved place legible on the map.
 *
 * These assertions exist because every failure mode here is silent. `applyPinPaint` runs against
 * layers a third-party component (`mapcn`'s `MapClusterLayer`) creates with ids derived from a
 * `useId()` we cannot see, off a `styledata` event that its own `setPaintProperty` calls provoke.
 * Get the prefix wrong and nothing happens; drop the idempotence guard and the map repaints
 * forever; put the selection branch outside the zoom ramp and MapLibre throws at runtime with the
 * paint silently unchanged (which is how it was written first — see the comment on the ramp).
 * None of that shows up as a broken render, only as a map that looks the way it always did.
 *
 * The map is faked rather than mocked: `applyPinPaint` touches exactly two MapLibre methods, so a
 * three-line object records what it was asked to set and the assertions read the recording.
 */
import { describe, expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { applyPinPaint, findLayerId, PIN_MINT_700, PIN_MINT_900 } from '@/components/map/pin-paint';

/** The real ids `MapClusterLayer` produces, `useId()` suffix and all. */
const POINT_LAYER = 'unclustered-point-_r_4_';
const CLUSTER_LAYER = 'clusters-_r_4_';
const COUNT_LAYER = 'cluster-count-_r_4_';

type Recorded = { layer: string; property: string; value: unknown };

function fakeMap(layers: readonly string[] = [CLUSTER_LAYER, COUNT_LAYER, POINT_LAYER]) {
  const calls: Recorded[] = [];
  const map = {
    getLayersOrder: () => [...layers],
    setPaintProperty: (layer: string, property: string, value: unknown) => {
      calls.push({ layer, property, value });
    },
  };
  return { map: map as unknown as MapLibreMap, calls };
}

function valueOf(calls: readonly Recorded[], layer: string, property: string): unknown {
  const found = calls.filter((c) => c.layer === layer && c.property === property);
  expect(found, `${layer}.${property} was never set`).toHaveLength(1);
  return found[0]!.value;
}

describe('findLayerId', () => {
  it('finds mapcn layers by prefix, ignoring the useId suffix', () => {
    const { map } = fakeMap();
    expect(findLayerId(map, 'unclustered-point-')).toBe(POINT_LAYER);
    expect(findLayerId(map, 'clusters-')).toBe(CLUSTER_LAYER);
  });

  it('does not confuse the cluster circle layer with the cluster count layer', () => {
    // `clusters-` and `cluster-count-` share the first seven characters; a `startsWith('cluster')`
    // would match the symbol layer, and setting `circle-radius` on a symbol layer is a no-op.
    const { map } = fakeMap();
    expect(findLayerId(map, 'clusters-')).not.toBe(COUNT_LAYER);
  });

  it('returns null rather than throwing when the layer is absent', () => {
    const { map } = fakeMap([]);
    expect(findLayerId(map, 'unclustered-point-')).toBeNull();
  });
});

describe('applyPinPaint', () => {
  it('does nothing at all until mapcn has added its layers', () => {
    // mapcn adds the layers from its own effect, which can commit after the surface's ref callback
    // runs. Touching a layer that does not exist throws inside MapLibre, so this must be a no-op —
    // and it must not record a signature, or the later real attempt would be skipped.
    const { map, calls } = fakeMap([]);
    applyPinPaint(map, null);
    expect(calls).toEqual([]);

    const late = fakeMap();
    applyPinPaint(late.map, null);
    expect(late.calls.length).toBeGreaterThan(0);
  });

  it('paints an unselected pin in --pin, above mapcn’s fixed radius 5', () => {
    const { map, calls } = fakeMap();
    applyPinPaint(map, null);

    const color = valueOf(calls, POINT_LAYER, 'circle-color') as unknown[];
    expect(color[0]).toBe('case');
    expect(color[3]).toBe(PIN_MINT_700);

    // Every zoom stop's unselected output must clear mapcn's own hardcoded 5.
    const radius = valueOf(calls, POINT_LAYER, 'circle-radius') as unknown[];
    const unselectedRadii = radius
      .filter((part): part is unknown[] => Array.isArray(part) && part[0] === 'case')
      .map((part) => part[3] as number);
    expect(unselectedRadii.length).toBe(3);
    for (const r of unselectedRadii) expect(r).toBeGreaterThan(5);
    // And the ramp must grow with zoom, not wander.
    expect(unselectedRadii).toEqual([...unselectedRadii].sort((a, b) => a - b));
  });

  it('keeps the zoom expression at the top level of the interpolate', () => {
    // MapLibre rejects `['+', ['interpolate', ['zoom'], ...], ...]` at runtime: "zoom expression
    // may only be used as input to a top-level step or interpolate expression". The first version
    // of this file did exactly that, and the only symptom was that the pins never changed.
    const { map, calls } = fakeMap();
    applyPinPaint(map, null);
    for (const property of ['circle-radius', 'circle-stroke-width']) {
      const value = valueOf(calls, POINT_LAYER, property) as unknown[];
      expect(value[0]).toBe('interpolate');
      expect(value[2]).toEqual(['zoom']);
    }
  });

  it('switches the selected pin to --pin-selected and makes it bigger', () => {
    const { map, calls } = fakeMap();
    applyPinPaint(map, 'place-7');

    const color = valueOf(calls, POINT_LAYER, 'circle-color') as unknown[];
    expect(color[1]).toEqual(['==', ['get', 'id'], 'place-7']);
    expect(color[2]).toBe(PIN_MINT_900);
    expect(color[3]).toBe(PIN_MINT_700);

    const radius = valueOf(calls, POINT_LAYER, 'circle-radius') as unknown[];
    for (const part of radius) {
      if (!Array.isArray(part) || part[0] !== 'case') continue;
      expect(part[2] as number).toBeGreaterThan(part[3] as number);
    }
  });

  it('scales clusters with their point count instead of a flat radius', () => {
    const { map, calls } = fakeMap();
    applyPinPaint(map, null);
    const radius = valueOf(calls, CLUSTER_LAYER, 'circle-radius') as unknown[];
    expect(radius[0]).toBe('interpolate');
    expect(radius[2]).toEqual(['get', 'point_count']);
    const outputs = radius.slice(3).filter((_, i) => i % 2 === 1) as number[];
    expect(outputs).toEqual([...outputs].sort((a, b) => a - b));
    // A two-place cluster should not dwarf a single pin the way mapcn's flat r20 did.
    expect(outputs[0]!).toBeLessThan(20);
  });

  it('is idempotent for the same map and selection, so the styledata listener cannot loop', () => {
    // `setPaintProperty` dirties the style, which fires `styledata`, which is what calls this.
    // Without the signature guard the two feed each other for the life of the page.
    const { map, calls } = fakeMap();
    applyPinPaint(map, null);
    const first = calls.length;
    applyPinPaint(map, null);
    applyPinPaint(map, null);
    expect(calls.length).toBe(first);
  });

  it('re-paints when the selection changes', () => {
    const { map, calls } = fakeMap();
    applyPinPaint(map, null);
    const first = calls.length;
    applyPinPaint(map, 'place-7');
    expect(calls.length).toBeGreaterThan(first);
    applyPinPaint(map, null);
    expect(calls.length).toBeGreaterThan(first * 2 - 1);
  });
});
