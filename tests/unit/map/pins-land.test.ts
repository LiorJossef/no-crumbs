/**
 * **`pins.land`** — `W6-6`, `facelift-plan.md` §3a: *"camera flight, then staggered drop.
 * Paint-only. 900ms + 60ms"*.
 *
 * Measured before this existed, at 30 places on both gate viewports: the map and every one of its
 * markers arrived together in **one whole-surface fade with zero visible change events after it**.
 * There was no per-marker entrance at all.
 *
 * The two halves of the exit criterion are measured elsewhere and neither is asserted here:
 * `tests/harness/measure-motion.mjs` answers *do pins arrive in sequence* and *what does the frame
 * budget cost* against a real browser. What this file pins is the **rule** — the ordering, the
 * composition, and the two properties the mechanism is allowed to touch.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  LAND_STAGGER_MS,
  LAND_WAVES,
  landOrderFor,
  pinLayerPaint,
  pinOpacityExpression,
  VISITED_LABEL_OPACITY,
  VISITED_PIN_OPACITY,
} from '@/components/map/marker-style';
import { withPinFeatureProps } from '@/components/map/place-marker-layer';
import { toPlaceFeatures } from '@/components/map/place-features';
import type { MapPlace } from '@/components/map/types';

const LAYER = readFileSync('src/components/map/place-marker-layer.tsx', 'utf8');

function ring(count: number, radius: number) {
  return Array.from({ length: count }, (_, index) => ({
    lat: 32.08 + radius * Math.cos((index / count) * 2 * Math.PI),
    lng: 34.78 + radius * Math.sin((index / count) * 2 * Math.PI),
  }));
}

describe('which wave a pin lands in', () => {
  /** Nearest the centroid first: the camera has just come to rest framing this box, so the middle
   *  is where the user is already looking and an arrival that starts there reads as filling in. */
  it('lands the middle first and the edge last', () => {
    const points = [
      { lat: 32.08, lng: 34.78 },
      ...ring(7, 0.01),
      ...ring(8, 0.05),
    ];
    const order = landOrderFor(points);
    expect(order[0]).toBe(0);
    expect(Math.max(...order.slice(8))).toBe(LAND_WAVES - 1);
    expect(order[0] as number).toBeLessThan(order[8] as number);
  });

  /**
   * **Equal-sized buckets, not equal-distance ones**, and this is the case that forces it: a
   * library with one outlier would otherwise put every pin in wave 0 and the outlier in wave 7 —
   * no stagger, then a straggler. Rank buckets keep the *number* per wave constant, which is what
   * makes the cadence even whatever shape the library is.
   */
  it('keeps the cadence even when one place is far away', () => {
    const order = landOrderFor([...ring(24, 0.004), { lat: 35.7, lng: 139.7 }]);
    const perWave = new Map<number, number>();
    for (const wave of order) perWave.set(wave, (perWave.get(wave) ?? 0) + 1);
    expect(perWave.size).toBe(LAND_WAVES);
    expect(Math.max(...perWave.values()) - Math.min(...perWave.values())).toBeLessThanOrEqual(1);
  });

  /** Deterministic: two places at one address must not swap waves between renders, or the landing
   *  flickers on a re-mount. */
  it('is stable for ties', () => {
    const same = Array.from({ length: 12 }, () => ({ lat: 32.08, lng: 34.78 }));
    expect(landOrderFor(same)).toEqual(landOrderFor(same));
  });

  /** Every answer is a real wave, at every library size — including the ones smaller than the
   *  wave count, where a naive `rank / count * WAVES` overflows on the last element. */
  it('answers within the wave range at every size', () => {
    for (const size of [1, 2, 7, 8, 9, 30, 300, 2000]) {
      const order = landOrderFor(ring(size, 0.01));
      expect(order).toHaveLength(size);
      expect(Math.min(...order)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...order)).toBeLessThanOrEqual(LAND_WAVES - 1);
    }
    expect(landOrderFor([])).toEqual([]);
  });

  /** The whole landing takes the same time for any library — a wave per pin would make the
   *  arrival slower exactly as the map got busier. */
  it('takes the same time whatever the library size', () => {
    expect(LAND_WAVES * LAND_STAGGER_MS).toBeLessThanOrEqual(500);
    expect(LAND_STAGGER_MS).toBe(60);
  });

  it('rides on the feature, so the layer needs no second source', () => {
    const place = (id: string, lat: number): MapPlace =>
      ({ id, name: id, lat, lng: 34.78, category: 'cafe', visited: false }) as MapPlace;
    const features = withPinFeatureProps(
      toPlaceFeatures([place('a', 32.08), place('b', 32.12), place('c', 32.2)]),
    ).features;
    for (const feature of features) {
      expect(typeof feature.properties?.landOrder).toBe('number');
      expect(typeof feature.properties?.labelZoom).toBe('number');
    }
  });
});

describe('the gate composes rather than replaces', () => {
  /** A visited pin lands **as a visited pin**: the gate multiplies onto the resting opacity rather
   *  than replacing it, so nothing about the arrival changes what a mark means. */
  it('multiplies onto the resting opacity', () => {
    const gated = pinOpacityExpression(VISITED_PIN_OPACITY, null, 3);
    expect(gated[0]).toBe('*');
    expect(gated[1]).toEqual(['case', ['to-boolean', ['get', 'visited']], VISITED_PIN_OPACITY, 1]);
    expect(gated[2]).toEqual(['case', ['<=', ['coalesce', ['get', 'landOrder'], 0], 3], 1, 0]);
  });

  /** And it composes with the row↔pin dim, which is the other thing writing these two properties.
   *  A hover during the landing must not pop every pin in. */
  it('composes with the hover dim', () => {
    const both = pinOpacityExpression(VISITED_LABEL_OPACITY, 'p2', 2);
    expect(both[0]).toBe('*');
    expect(JSON.stringify(both)).toContain('"p2"');
    expect(JSON.stringify(both)).toContain('landOrder');
  });

  /** `null` is "no gate at all" rather than "the last wave": once the landing is over the
   *  expression returns to the exact shape it has for the rest of the session, so a landed map and
   *  a reduced-motion map are not two code paths that could drift. */
  it('retires the gate entirely when the landing is done', () => {
    expect(pinOpacityExpression(VISITED_PIN_OPACITY, null, null)).toEqual([
      'case',
      ['to-boolean', ['get', 'visited']],
      VISITED_PIN_OPACITY,
      1,
    ]);
  });
});

describe('what the landing is allowed to cost', () => {
  /**
   * **Paint-only, and this is the assertion that keeps it so.** `facelift-plan.md` §2 lists the
   * staggered landing as VERIFIED *"paint-only over a per-feature order — no relayout, no
   * re-collision"*. A layout property here would re-lay-out and re-collide every symbol in the
   * layer, eight times, during the one second the user is watching.
   */
  it('never writes a layout property while landing', () => {
    const landing = LAYER.slice(LAYER.indexOf('const applyOpacity'), LAYER.indexOf('hasLanded.current = true') + 2000);
    expect(landing).toContain("setPaintProperty(pinLayerId, 'icon-opacity'");
    expect(landing).toContain("setPaintProperty(pinLayerId, 'text-opacity'");
    expect(landing).not.toContain('setLayoutProperty');
    expect(landing).not.toContain('setData');
  });

  /** Sixteen `setPaintProperty` calls for the whole arrival, whatever the library size, and
   *  nothing per frame. A `requestAnimationFrame` loop here would be the thing that costs. */
  it('drives the waves from timers, not from a frame loop', () => {
    const code = LAYER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('requestAnimationFrame');
    expect(code).toContain('setTimeout(() => paint(wave), wave * LAND_STAGGER_MS)');
    expect(code).toContain('clearTimeout');
  });

  /**
   * **Once, on arrival.** `data` changes on every keystroke in the search box, so a landing keyed
   * on it would replay on each one — the animated list `facelift-plan.md` §3a bans by name.
   */
  it('runs once for the life of the mount, not on every filter', () => {
    expect(LAYER).toContain('const hasLanded = useRef(false);');
    expect(LAYER).toContain('if (hasLanded.current || labelled.features.length === 0) return;');
  });

  /** Reduced motion loses the **sequencing**, not the fade: a cascade spreading across the screen
   *  is motion however each step is drawn. §3a's rule is that the nine collapse to the opacity
   *  change alone — here that change *is* the animation, so what goes is the stagger. */
  it('drops the sequence under reduced motion, and keeps the pins', () => {
    const code = LAYER.slice(LAYER.indexOf('const reduced ='), LAYER.indexOf('paint(0);'));
    expect(code).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(code).toContain('paint(null)');
  });

  /** The fade each wave rides on is the layer's own transition, declared once — so a wave is a
   *  value change and MapLibre does the interpolating. */
  it('fades each wave in with the layer transition', () => {
    const paint = pinLayerPaint();
    expect(paint['icon-opacity-transition']).toBeDefined();
    expect(paint['text-opacity-transition']).toBeDefined();
  });
});
