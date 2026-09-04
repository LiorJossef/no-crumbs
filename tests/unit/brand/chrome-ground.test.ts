/**
 * **The ground behind the sign-in card, held to the four properties that make it a map.**
 *
 * `iteration-6-plan.md` §5.2 asked for city blocks and named the failure mode in the same sentence:
 * *"not a uniform lattice, which reads as graph paper rather than cartography"*. That is a claim
 * about geometry, and geometry is testable without a browser — which matters here more than usual,
 * because the alternative check is *looking at it*, and a ground this faint drifts from correct to
 * wrong by a degree at a time with nobody noticing.
 *
 * So this file asserts the four signals `chrome-motion.ts` says the fabric is made of, plus the
 * three things that would break the tiling silently. **It deliberately does not assert that the
 * canvas is non-blank** — that is what the screenshots in the report are for, and a test that draws
 * would only prove `node-canvas` works.
 *
 * The whole generator is deterministic in a seed, so every assertion below is about *the* city
 * rather than about a city, and a change to a specification number fails here rather than in a
 * screenshot nobody takes.
 */
import { describe, expect, it } from 'vitest';

import {
  groundCellHash,
  groundCuts,
  groundPoint,
  planGround,
  type GroundSegment,
} from '@/components/brand/chrome-ground';
import { GROUND_LAYERS, GROUND_POINT_DENSITY } from '@/components/brand/chrome-motion';

const NEAR = GROUND_LAYERS.find((layer) => layer.id === 'near');
const FAR = GROUND_LAYERS.find((layer) => layer.id === 'far');
if (NEAR === undefined || FAR === undefined) throw new Error('both ground layers must exist');

/** A run's length, which is the quantity every "does it stop" assertion is really about. */
const length = (run: GroundSegment): number => Math.hypot(run.x2 - run.x1, run.y2 - run.y1);

describe('the cuts tile, and they are not evenly spaced', () => {
  it('places every cut inside the tile and never twice in the same place', () => {
    const cuts = groundCuts(7, 512, 0.5, seeded(1));
    expect(cuts).toHaveLength(7);
    for (const cut of cuts) {
      expect(cut).toBeGreaterThanOrEqual(0);
      expect(cut).toBeLessThan(512);
    }
    expect(new Set(cuts.map((cut) => cut.toFixed(4))).size).toBe(7);
  });

  it('closes on the tile, so the wrap-around block is a block like any other', () => {
    /*
     * The one that cannot be seen in a screenshot and is the whole reason the gaps are renormalised.
     * Jittered gaps that are *not* scaled back to the period leave the last block of one tile
     * meeting the first block of the next at whatever width the random walk ended on — a seam every
     * 512 px, drifting across the screen forever.
     *
     * Asserted as "the wrap gap is inside the same range as every other gap" rather than as a sum,
     * because the sum can be right while the *distribution* is not: a generator that made the last
     * gap absorb the error would pass a sum check and still show the seam.
     */
    const size = 512;
    const jitter = 0.5;
    const cuts = groundCuts(7, size, jitter, seeded(2));
    const gaps = cuts.map((cut, index) =>
      index === cuts.length - 1 ? size - cut + (cuts[0] ?? 0) : (cuts[index + 1] ?? 0) - cut,
    );
    const mean = size / cuts.length;
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(mean * (1 - jitter) * 0.9);
      expect(gap).toBeLessThan(mean * (1 + jitter) * 1.1);
    }
    expect(gaps.reduce((total, gap) => total + gap, 0)).toBeCloseTo(size, 6);
  });

  it('is not graph paper: the widest block is meaningfully wider than the narrowest', () => {
    const cuts = groundCuts(8, 384, 0.42, seeded(3));
    const gaps = cuts.map((cut, index) => (index === cuts.length - 1 ? 384 : (cuts[index + 1] ?? 0)) - cut);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.4);
  });
});

describe('the fabric carries the four signals it claims to', () => {
  const plan = planGround(NEAR);

  it('1. has a road hierarchy: arterials, streets and lanes, in that order of scarcity', () => {
    const count = (weight: GroundSegment['weight']) =>
      plan.segments.filter((run) => run.weight === weight).length;
    expect(count('arterial')).toBe(4);
    expect(count('street')).toBe(NEAR.avenues + NEAR.streets - 4);
    expect(count('lane')).toBeGreaterThan(0);
    expect(count('lane')).toBeLessThan(NEAR.avenues * NEAR.streets * NEAR.laneChance * 2);
  });

  it('2. the arterials, and only the arterials, span the whole tile', () => {
    for (const run of plan.segments) {
      if (run.weight !== 'arterial') continue;
      expect(length(run)).toBeCloseTo(NEAR.tile, 6);
    }
    const spanning = plan.segments.filter(
      (run) => run.weight !== 'arterial' && length(run) >= NEAR.tile,
    );
    expect(spanning).toEqual([]);
  });

  it('3. ordinary streets stop, which is what puts junctions and dead ends in the fabric', () => {
    /*
     * The strongest of the four signals and the cheapest to lose: a lattice where every line spans
     * the frame cannot look like anywhere. Two to n−1 blocks is the range the generator draws from,
     * so the assertion is that the *shortest* ordinary run is genuinely short — a floor of "at least
     * two blocks" would pass on a generator that had quietly started emitting full-length runs.
     */
    const streets = plan.segments.filter((run) => run.weight === 'street');
    expect(streets.length).toBeGreaterThan(4);
    const longest = Math.max(...streets.map(length));
    const shortest = Math.min(...streets.map(length));
    expect(shortest).toBeLessThan(NEAR.tile * 0.5);
    expect(longest).toBeLessThan(NEAR.tile);
    expect(longest / shortest).toBeGreaterThan(1.5);
  });

  it('4. every lane sits inside one block, on one axis', () => {
    const block = NEAR.tile / NEAR.avenues;
    for (const run of plan.segments) {
      if (run.weight !== 'lane') continue;
      expect(run.x1 === run.x2 || run.y1 === run.y2).toBe(true);
      expect(length(run)).toBeGreaterThan(0);
      expect(length(run)).toBeLessThan(block * (1 + NEAR.jitter) * 1.2);
    }
  });

  it('draws nothing of zero length, which a pattern would repeat forever as a dot', () => {
    for (const run of plan.segments) expect(length(run)).toBeGreaterThan(0);
  });

  it('is the same city every time, so a screenshot describes the shipped one', () => {
    expect(planGround(NEAR)).toEqual(planGround(NEAR));
    expect(planGround(FAR)).not.toEqual(planGround(NEAR));
  });
});

describe('a mint point only ever sits on a junction that exists', () => {
  const plan = planGround(NEAR);

  it('puts every candidate on an arterial and on a run that actually reaches it', () => {
    /*
     * The first build used the four arterial-on-arterial crossings, which are always real and only
     * four — two x values and two y — so several points on a screen lined up in rows. Widening the
     * candidates to *every* arterial-on-run crossing is only safe if the containment is checked:
     * an ordinary street stops after a few blocks, and a point at a junction that does not exist is
     * a dot in the middle of a field.
     */
    const arterials = plan.segments.filter((run) => run.weight === 'arterial');
    const arterialX = new Set(arterials.filter((run) => run.x1 === run.x2).map((run) => round(run.x1)));
    const arterialY = new Set(arterials.filter((run) => run.y1 === run.y2).map((run) => round(run.y1)));
    expect(arterialX.size).toBe(2);
    expect(arterialY.size).toBe(2);

    expect(plan.crossings.length).toBeGreaterThan(8);
    for (const crossing of plan.crossings) {
      const onArterial = arterialX.has(round(crossing.x)) || arterialY.has(round(crossing.y));
      expect(onArterial, `crossing ${round(crossing.x)},${round(crossing.y)} is on no arterial`).toBe(
        true,
      );
      const onRun = plan.segments.some((run) => touches(run, crossing.x, crossing.y, NEAR.tile));
      expect(onRun, `crossing ${round(crossing.x)},${round(crossing.y)} is on no run`).toBe(true);
    }
  });

  it('answers the same thing for a cell every time that cell drifts back into view', () => {
    // Not a PRNG: the ground runs forever and a cell leaves and re-enters the frame. A point that
    // moved, or appeared, on its second visit would be the one thing an ambient layer may not do.
    for (const [i, j] of [
      [0, 0],
      [3, -2],
      [-7, 11],
    ] as const) {
      expect(groundPoint(plan, i, j)).toEqual(groundPoint(plan, i, j));
      expect(groundCellHash(i, j, 1)).toBe(groundCellHash(i, j, 1));
    }
  });

  it('lands within a point of GROUND_POINT_DENSITY over a large lattice', () => {
    let hits = 0;
    const cells = 120 * 120;
    for (let i = -60; i < 60; i += 1) {
      for (let j = -60; j < 60; j += 1) if (groundPoint(plan, i, j) !== null) hits += 1;
    }
    expect(hits / cells).toBeGreaterThan(GROUND_POINT_DENSITY - 0.03);
    expect(hits / cells).toBeLessThan(GROUND_POINT_DENSITY + 0.03);
  });

  it('almost never leaves a 1440x900 screen with nothing on it, which is what 0.3 did', () => {
    /*
     * **The regression this density was changed for, asserted as the property rather than as the
     * number.** At 0.3 a desktop screen holds about eight cells of the near tile and the mean is
     * 2.4 — and the shipped build rendered *no point at all*, because the eight cells in view were
     * eight of the seven-in-ten that carry none.
     *
     * "Never" is not available and the test says so rather than pretending: cells decide
     * independently, so an empty window always has *some* probability, and the only way to drive it
     * to zero is a mean high enough to be a constellation. What is asserted is the rate — under one
     * eight-cell window in two hundred, against one in seven at 0.3, which is the difference between
     * a rarity and a thing the next person to open the page will see.
     */
    let windows = 0;
    let empty = 0;
    for (let i = -40; i < 40; i += 1) {
      for (let j = -40; j < 40; j += 1) {
        windows += 1;
        let inWindow = 0;
        for (let di = 0; di < 4; di += 1) {
          for (let dj = 0; dj < 2; dj += 1) {
            if (groundPoint(plan, i + di, j + dj) !== null) inWindow += 1;
          }
        }
        if (inWindow === 0) empty += 1;
      }
    }
    expect(empty / windows).toBeLessThan(0.005);
  });
});

describe('the two layers are two layers, and both are gentle', () => {
  it('differ in every property parallax is made of', () => {
    expect(NEAR.tile).not.toBe(FAR.tile);
    expect(NEAR.speed).toBeGreaterThan(FAR.speed);
    expect(NEAR.angle).not.toBe(FAR.angle);
    expect(NEAR.ink.arterial).toBeGreaterThan(FAR.ink.arterial);
  });

  it('do not share a period, so the combined fabric repeats far less often than either', () => {
    // 384 and 512 beat at 1536, which is longer than any viewport this ships to. Two tiles where
    // one divided the other would repeat at the smaller one and read as wallpaper.
    const bigger = Math.max(NEAR.tile, FAR.tile);
    const smaller = Math.min(NEAR.tile, FAR.tile);
    expect(bigger % smaller).not.toBe(0);
  });

  it('keeps every ink under the contrast ceiling the brief set', () => {
    // "Very low contrast against the sign-in ground" is the constraint, and an alpha is the only
    // place it can be checked. 0.2 is far above anything here and is a ceiling rather than a target:
    // it catches a future tuning pass that reaches for visibility one layer at a time.
    for (const layer of GROUND_LAYERS) {
      for (const alpha of Object.values(layer.ink)) {
        expect(alpha).toBeGreaterThan(0);
        expect(alpha).toBeLessThan(0.2);
      }
    }
  });

  it('drifts slowly enough that nobody watches it', () => {
    // 6 px/s crosses a 1440 px screen in four minutes. Anything an order faster stops being
    // atmosphere and starts being something the eye follows while trying to read a form.
    for (const layer of GROUND_LAYERS) {
      expect(layer.speed).toBeGreaterThan(0);
      expect(layer.speed).toBeLessThan(6);
    }
  });
});

/* -------------------------------------------------------------------------------------------- */

function seeded(offset: number): () => number {
  let state = (0x1234_5678 + offset * 0x9e37_79b1) >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number): string => value.toFixed(3);

/** Is `(x, y)` on `run`, allowing for the run being stated past the end of the tile? */
function touches(run: GroundSegment, x: number, y: number, size: number): boolean {
  for (let k = -1; k <= 1; k += 1) {
    const oy = y + k * size;
    const ox = x + k * size;
    if (
      run.x1 === run.x2 &&
      Math.abs(run.x1 - x) < 1e-6 &&
      oy >= Math.min(run.y1, run.y2) - 1e-6 &&
      oy <= Math.max(run.y1, run.y2) + 1e-6
    ) {
      return true;
    }
    if (
      run.y1 === run.y2 &&
      Math.abs(run.y1 - y) < 1e-6 &&
      ox >= Math.min(run.x1, run.x2) - 1e-6 &&
      ox <= Math.max(run.x1, run.x2) + 1e-6
    ) {
      return true;
    }
  }
  return false;
}
