/**
 * **Camera mover 6's nudge takes as long as it is far** — `MAP-03`.
 *
 * The owner, with `MAP-02`'s opening gate running: *"When you click on the list it's okay, but on
 * the map it takes too much time, because the map is barely moving."* The gate waits for `moveend`,
 * and `moveend` was 320 ms away whatever the distance, because the duration was a flat constant.
 * A list click flies across the map and genuinely takes that long; a pin tap corrects by ten pixels
 * and does not.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isRevealPanWorthMaking,
  revealPanDuration,
  REVEAL_MIN_PAN_PX,
  REVEAL_PAN_FULL_PX,
  REVEAL_PAN_MAX_MS,
  REVEAL_PAN_MIN_MS,
} from '@/components/map/reveal-pan';

describe('revealPanDuration', () => {
  /** The complaint, in one assertion: a correction nobody can see must not cost a third of a
   *  second, and the coordinator's brief put "a few pixels" in the 100–150 ms region. */
  it('finishes a barely-visible correction inside 150ms', () => {
    expect(revealPanDuration(0, 6)).toBeLessThanOrEqual(150);
    expect(revealPanDuration(10, 0)).toBeLessThanOrEqual(150);
    expect(revealPanDuration(0, 20)).toBeLessThanOrEqual(150);
  });

  /** Nothing may get slower than the flat 320 ms it replaces — that is the ceiling, not a target
   *  the ramp is allowed to overshoot. */
  it('never exceeds the constant it replaces', () => {
    for (const distance of [0, 1, 40, 239, 240, 900, 100_000]) {
      expect(revealPanDuration(0, distance)).toBeLessThanOrEqual(REVEAL_PAN_MAX_MS);
    }
    expect(revealPanDuration(0, Number.POSITIVE_INFINITY)).toBe(REVEAL_PAN_MAX_MS);
  });

  /** A large correction still reads as a deliberate nudge rather than a jump: the measured worst
   *  case — a pin 225 px under the sheet at 375×812 — stays close to the old duration. */
  it('keeps a deep correction close to the old 320ms', () => {
    expect(revealPanDuration(0, 225)).toBeGreaterThan(300);
    expect(revealPanDuration(0, REVEAL_PAN_FULL_PX)).toBe(REVEAL_PAN_MAX_MS);
  });

  it('never drops below the floor, so the shortest pan still reads as motion', () => {
    expect(revealPanDuration(0, 0)).toBe(REVEAL_PAN_MIN_MS);
    expect(revealPanDuration(0, 0.5)).toBeGreaterThanOrEqual(REVEAL_PAN_MIN_MS);
  });

  it('is monotonic in the distance', () => {
    let previous = 0;
    for (let distance = 0; distance <= 400; distance += 7) {
      const duration = revealPanDuration(0, distance);
      expect(duration).toBeGreaterThanOrEqual(previous);
      previous = duration;
    }
  });

  /** Both axes count, so a diagonal correction is not read as two short ones. */
  it('measures the diagonal, not one axis', () => {
    expect(revealPanDuration(180, 240)).toBe(REVEAL_PAN_MAX_MS); // hypot 300
    expect(revealPanDuration(120, 0)).toBe(revealPanDuration(0, 120));
  });
});

describe('isRevealPanWorthMaking', () => {
  it('still declines the no-op the mover always declined', () => {
    expect(isRevealPanWorthMaking(0, 0)).toBe(false);
  });

  it('declines a correction beneath noticing', () => {
    expect(isRevealPanWorthMaking(0, 3)).toBe(false);
    expect(isRevealPanWorthMaking(2, 2)).toBe(false); // hypot ~2.8
  });

  it('makes any correction that is actually visible', () => {
    expect(isRevealPanWorthMaking(0, REVEAL_MIN_PAN_PX)).toBe(true);
    expect(isRevealPanWorthMaking(0, 10)).toBe(true);
    expect(isRevealPanWorthMaking(0, 225)).toBe(true);
  });

  /**
   * **The threshold is not allowed to grow into a tolerance.** The band already carries
   * `REVEAL_MARGIN_PX` = 24 px of air, and declining a pan spends that margin; a threshold near it
   * would start leaving pins against the chrome, which is the defect mover 6 exists to fix.
   */
  it('spends only a small fraction of the reveal margin', () => {
    const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
    const margin = Number(/const REVEAL_MARGIN_PX = (\d+);/.exec(SURFACE)?.[1]);
    expect(margin).toBeGreaterThan(0);
    expect(REVEAL_MIN_PAN_PX).toBeLessThanOrEqual(margin / 4);
  });
});

describe('the mover uses them', () => {
  const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');

  it('passes the computed duration rather than a constant', () => {
    expect(SURFACE).toContain('instance.panBy([dx, dy], { duration: revealPanDuration(dx, dy) });');
    expect(SURFACE).not.toContain('REVEAL_PAN_MS');
  });

  it('gates the pan on the same overshoot it animates', () => {
    expect(SURFACE).toContain('if (!isRevealPanWorthMaking(dx, dy)) return;');
  });
});
