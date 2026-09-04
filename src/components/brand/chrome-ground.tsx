'use client';

import { useEffect, useRef } from 'react';

import {
  EASE_STANDARD,
  GROUND_ARRIVAL_SECONDS,
  GROUND_BUDGET_MIN_SAMPLES,
  GROUND_BUDGET_MS,
  GROUND_BUDGET_SETTLE_MS,
  GROUND_BUDGET_WINDOW_MS,
  GROUND_COMPACT_MAX_WIDTH,
  GROUND_COMPACT_SCALE,
  GROUND_DRIFT_DEGREES,
  GROUND_LAYERS,
  GROUND_POINT_BREATH_FLOOR,
  GROUND_POINT_BREATH_SECONDS,
  GROUND_POINT_BREATH_SWELL,
  GROUND_POINT_CORE_RADIUS,
  GROUND_POINT_DENSITY,
  GROUND_POINT_HALO_INK,
  GROUND_POINT_HALO_RADIUS,
  GROUND_POINT_INK,
  GROUND_STILL_PHASE_SECONDS,
  type GroundLayerSpec,
} from './chrome-motion';

/**
 * **The atmosphere the two chrome surfaces stand on** — `/sign-in` and `/`, which are one step
 * apart in the demo path and have to read as one product.
 *
 * It replaces `--brand-wash`'s three mint radials on those two screens with the indigo-biased mesh
 * ruled in `iteration-2-plan.md` §2.2. `--brand-wash` itself is untouched and still paints
 * `error.tsx`, `not-found.tsx` and the collection-join screen: those are not surfaces anybody is
 * asked to admire, and giving a failure screen a gradient mesh and a drifting light field would be
 * the mascot-grinning-at-a-crash defect in a different medium.
 *
 * ## Four layers, and each of them is a token
 *
 * 1. **The mesh** — four corner radials over `--background`, themed. Static: it is the room, and a
 *    room does not move.
 * 2. **The city** — `CityGround` below: two parallax layers of blocks drifting on a diagonal, in
 *    `--chrome-accent` at alphas between 0.03 and 0.13, with one or two `--brand` points sitting on
 *    the grid and breathing. Specified in `chrome-motion.ts`; read that first.
 * 3. **Two blooms** — the same pigments as free-floating discs, drifting on a 24 s mirror. It is
 *    `transform` on two elements whose paint is one radial gradient each, so a frame costs a
 *    composite and no repaint. Off entirely under `prefers-reduced-motion`.
 * 4. **Grain** — one 160×160 `feTurbulence` tile at `mix-blend-mode: overlay`. It is what stops a
 *    four-radial gradient reading as a banded backdrop on an 8-bit panel, and it is 1.2 kB in a
 *    custom property rather than an image request.
 *
 * **The city sits under the blooms and over the mesh, and that order is the whole of "blended".**
 * The streets are etched into the paper and the light blooms *over* them, so the fabric is veiled
 * wherever a bloom passes and never sits on top of the room's own light. Above the blooms it read
 * as a graphic laid on the page; below them it reads as something the page is made of.
 *
 * `aria-hidden` and `pointer-events-none` throughout: none of it is content and none of it may
 * ever intercept a tap meant for the form behind it. `pointer-events` inherits, so the canvas is
 * covered by the wrapper's declaration rather than needing its own.
 *
 * **The `overflow-hidden` on the wrapper is load-bearing and is not a tidy-up.** The blooms are
 * 78vmax discs hung 26vmax off the left edge, and the canvas is `inset-0`; without the clip the
 * blooms alone put a horizontal scrollbar on every one of these screens. Anything added inside here
 * inherits that discipline.
 *
 * Measured at 390×844 against commit `f07d1b6` rather than asserted, and the honest number is not
 * zero: `/sign-in` **already** overflows by 28 px there, in both themes, with this ground and
 * without it. That belongs to something outside this wrapper and another lane is fixing it. What is
 * checked here is the delta — `scrollWidth` is 418 before and 418 after, so the ground contributes
 * none of it and adds no second source.
 *
 * **Nothing about the *entrance* needs JavaScript.** The arrival and the drift of the mesh, the
 * blooms and the card are CSS animations declared in `globals.css`, and `prefers-reduced-motion` is
 * a media query rather than a hook — so they cannot be left invisible by a hydration that never
 * happens, which is the defect this whole entrance was rebuilt around. The city is the one part
 * that is script-driven, and it is safe to be: a canvas with no script is an empty transparent
 * element, so a failed hydration costs the page its ground and hides nothing.
 *
 * **Geometry is inline `style` rather than `w-[70vmax]`.** These four numbers are viewport-relative
 * sizes on a decorative element, not design tokens, and writing them as arbitrary Tailwind values
 * would put four brackets on the ledger `token-call-sites.test.ts` keeps for the opposite kind of
 * bracket — the ones that bypass the token layer to say a *colour*. Every colour here is a `var()`.
 */
export function ChromeGround() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ background: 'var(--chrome-mesh)' }}
      >
        <CityGround />
        <div
          data-entrance="bloom-a"
          className="absolute rounded-full"
          style={{
            background: 'var(--chrome-bloom-a)',
            width: '78vmax',
            height: '78vmax',
            left: '-26vmax',
            top: '-30vmax',
          }}
        />
        <div
          data-entrance="bloom-b"
          className="absolute rounded-full"
          style={{
            background: 'var(--chrome-bloom-b)',
            width: '68vmax',
            height: '68vmax',
            right: '-22vmax',
            bottom: '-26vmax',
          }}
        />
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{
            backgroundImage: 'var(--chrome-grain)',
            opacity: 'var(--chrome-grain-strength)',
          }}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The plan: a city as data, generated once, testable without a browser
 * ---------------------------------------------------------------------------------------------- */

export type GroundWeight = 'lane' | 'street' | 'arterial';

export interface GroundSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly weight: GroundWeight;
}

export interface GroundPlan {
  /** Every run in the tile, in tile coordinates. A coordinate may exceed the tile: the tile is a
   *  torus and the renderer draws nine copies, so a run that leaves the top re-enters the bottom. */
  readonly segments: readonly GroundSegment[];
  /** Junctions on an arterial that a run actually reaches — the only places a mint point may sit. */
  readonly crossings: readonly { readonly x: number; readonly y: number }[];
}

/** `a[i]`, with `noUncheckedIndexedAccess` satisfied at the one place it would otherwise cost a
 *  cast on every line. Every caller indexes inside a length it just computed. */
function at(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

/** mulberry32. Thirty-two bits of state, uniform enough for street positions, and — the property
 *  that matters — identical in a browser and in vitest, so the city in a screenshot is the city in
 *  a test. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` positions across `size`, with gaps that differ by up to `jitter` and still sum to exactly
 * `size`.
 *
 * The normalisation is the point. Jittered gaps that are *not* renormalised do not tile — the last
 * block of one tile meets the first block of the next at whatever width the random walk happened to
 * end on, and the seam is the one thing an infinite ground may not have. Scaling the gaps to the
 * period puts the wrap-around gap on the same distribution as every other gap.
 */
export function groundCuts(
  count: number,
  size: number,
  jitter: number,
  rand: () => number,
): number[] {
  const gaps: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const gap = 1 + (rand() * 2 - 1) * jitter;
    gaps.push(gap);
    total += gap;
  }
  const scale = size / total;
  const positions: number[] = [];
  let cursor = rand() * size;
  for (const gap of gaps) {
    positions.push(((cursor % size) + size) % size);
    cursor += gap * scale;
  }
  return positions.sort((a, b) => a - b);
}

/** Two arterial indices that are never adjacent, so the fabric has two quarters rather than one
 *  double-width road. */
function arterialPair(count: number, rand: () => number): [number, number] {
  const first = Math.floor(rand() * count);
  const span = 2 + Math.floor(rand() * Math.max(1, count - 4));
  return [first, (first + span) % count];
}

/** Does `value`, or any of its copies one tile away, fall inside `[from, to]`? A run may be stated
 *  past the end of the tile, so containment is a question about the torus and not about the line. */
function spans(value: number, from: number, to: number, size: number): boolean {
  for (let k = -1; k <= 1; k += 1) {
    const v = value + k * size;
    if (v >= Math.min(from, to) && v <= Math.max(from, to)) return true;
  }
  return false;
}

/**
 * **Where a mint point is allowed to sit: on a crossing that actually exists.**
 *
 * The first version used the four arterial-on-arterial crossings, which are always real and are
 * only four — two distinct x values and two distinct y. With more than one point on screen they
 * lined up in rows, which is the graph-paper failure arriving through the back door.
 *
 * So every arterial is intersected against every ordinary run and the containment is *checked*:
 * an ordinary street stops after a few blocks, so it crosses an arterial avenue only if its span
 * reaches it. That is the difference between a point on a junction and a point in the middle of a
 * field, and at this size it is the difference between the ground reading as a map and reading as
 * a texture with dots on it.
 */
function crossingsOf(
  segments: readonly GroundSegment[],
  avenues: readonly number[],
  streets: readonly number[],
  arterialAvenues: readonly number[],
  arterialStreets: readonly number[],
  size: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const horizontal = segments.filter((run) => run.y1 === run.y2);
  const vertical = segments.filter((run) => run.x1 === run.x2);

  for (const index of arterialAvenues) {
    const x = at(avenues, index);
    for (const run of horizontal) {
      if (spans(x, run.x1, run.x2, size)) out.push({ x, y: ((run.y1 % size) + size) % size });
    }
  }
  for (const index of arterialStreets) {
    const y = at(streets, index);
    for (const run of vertical) {
      if (spans(y, run.y1, run.y2, size)) out.push({ x: ((run.x1 % size) + size) % size, y });
    }
  }
  return out;
}

/**
 * The city, as segments.
 *
 * Deterministic in `spec.seed`: the same specification always produces the same city, which is what
 * lets a unit test assert the four properties `chrome-motion.ts` claims make it read as a map
 * rather than checking that a canvas is non-blank.
 */
export function planGround(spec: GroundLayerSpec): GroundPlan {
  const rand = mulberry32(spec.seed);
  const size = spec.tile;

  const avenues = groundCuts(spec.avenues, size, spec.jitter, rand);
  const streets = groundCuts(spec.streets, size, spec.jitter, rand);
  const [avA, avB] = arterialPair(avenues.length, rand);
  const [stA, stB] = arterialPair(streets.length, rand);

  /** `cuts[k]` continued past the end of the tile, so a run may cross the wrap and stay one run. */
  const extend = (cuts: readonly number[], index: number): number =>
    at(cuts, ((index % cuts.length) + cuts.length) % cuts.length) +
    size * Math.floor(index / cuts.length);

  const segments: GroundSegment[] = [];

  for (let i = 0; i < avenues.length; i += 1) {
    const x = at(avenues, i);
    if (i === avA || i === avB) {
      segments.push({ x1: x, y1: 0, x2: x, y2: size, weight: 'arterial' });
      continue;
    }
    // An ordinary avenue runs between two streets and then stops. Two to (n-1) blocks: shorter than
    // two is a tick rather than a road, and n or more is the full-length run this exists to avoid.
    const from = Math.floor(rand() * streets.length);
    const run = 2 + Math.floor(rand() * Math.max(1, streets.length - 3));
    segments.push({
      x1: x,
      y1: extend(streets, from),
      x2: x,
      y2: extend(streets, from + run),
      weight: 'street',
    });
  }

  for (let j = 0; j < streets.length; j += 1) {
    const y = at(streets, j);
    if (j === stA || j === stB) {
      segments.push({ x1: 0, y1: y, x2: size, y2: y, weight: 'arterial' });
      continue;
    }
    const from = Math.floor(rand() * avenues.length);
    const run = 2 + Math.floor(rand() * Math.max(1, avenues.length - 3));
    segments.push({
      x1: extend(avenues, from),
      y1: y,
      x2: extend(avenues, from + run),
      y2: y,
      weight: 'street',
    });
  }

  // Service lanes: a third of the blocks get halved, on whichever axis the coin lands. This is the
  // grain between "street network" and "city fabric", and it is the cheapest of the four signals.
  for (let i = 0; i < avenues.length; i += 1) {
    for (let j = 0; j < streets.length; j += 1) {
      if (rand() >= spec.laneChance) continue;
      const x1 = extend(avenues, i);
      const x2 = extend(avenues, i + 1);
      const y1 = extend(streets, j);
      const y2 = extend(streets, j + 1);
      if (rand() < 0.5) {
        const x = (x1 + x2) / 2;
        segments.push({ x1: x, y1, x2: x, y2, weight: 'lane' });
      } else {
        const y = (y1 + y2) / 2;
        segments.push({ x1, y1: y, x2, y2: y, weight: 'lane' });
      }
    }
  }

  return { segments, crossings: crossingsOf(segments, avenues, streets, [avA, avB], [stA, stB], size) };
}

/** A stable [0,1) from a pair of lattice indices. Not a PRNG: it has to answer the same thing for
 *  cell (3,−2) every time that cell drifts back into view. */
export function groundCellHash(i: number, j: number, salt: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export interface GroundPoint {
  readonly x: number;
  readonly y: number;
  /** 0..1, where in its own breath this point starts. Points do not breathe in unison. */
  readonly phase: number;
}

/** The point in lattice cell `(i, j)`, or `null` for the roughly seven cells in ten that have none. */
export function groundPoint(plan: GroundPlan, i: number, j: number): GroundPoint | null {
  if (groundCellHash(i, j, 1) >= GROUND_POINT_DENSITY) return null;
  if (plan.crossings.length === 0) return null;
  const pick = Math.floor(groundCellHash(i, j, 2) * plan.crossings.length);
  const crossing = plan.crossings[Math.min(pick, plan.crossings.length - 1)];
  if (crossing === undefined) return null;
  return { x: crossing.x, y: crossing.y, phase: groundCellHash(i, j, 3) };
}

/* ------------------------------------------------------------------------------------------------
 * The renderer: one canvas, one rAF, two fills and a handful of sprites per frame
 * ---------------------------------------------------------------------------------------------- */

/** The backing store is capped at 2× regardless of the device. This is out-of-focus atmosphere at
 *  an alpha of 0.05, and on a 3× phone the last device pixel of crispness is not worth 2.25× the
 *  fill rate on the one screen that has to be instant. */
const MAX_RENDER_SCALE = 2;

/**
 * Resolve a custom property to a colour string **the canvas can already parse**, by asking the
 * browser to compute it as a real `color` rather than by reading the custom property and parsing it
 * here.
 *
 * `getComputedStyle(el).getPropertyValue('--brand')` returns the token stream — `var(--mint-700)` —
 * and every hand-rolled resolver for that ends up as a regex over colour syntax. This repository has
 * already paid for one of those: `contrast-render.mjs`'s header records a DOM walker whose
 * `/rgba?\(([^)]+)\)/` silently returned `null` for every `oklch()` and `color-mix()` in this
 * stylesheet and then reported a confident wrong number. Setting `color` on a throwaway element
 * makes the browser do the substitution and hands back something `fillStyle` accepts in any colour
 * space, with no parsing anywhere.
 */
function resolveColour(token: string, host: Element): string | null {
  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.color = `var(${token})`;
  host.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value === '' ? null : value;
}

interface LayerTile {
  readonly spec: GroundLayerSpec;
  readonly plan: GroundPlan;
  readonly pattern: CanvasPattern;
  /** The tile's own size in image pixels — the period the drift offset wraps on. */
  readonly period: number;
  /** Pattern-space drift per second, already rotated out of the shared screen heading. */
  readonly step: { readonly x: number; readonly y: number };
}

/**
 * One tile, drawn nine times so that everything crossing an edge re-enters the opposite one.
 *
 * **Every run in a plan is axis-aligned, and the nine copies are only correct because of that.** A
 * diagonal run does not survive this treatment: shifting `y = -x + c` by one tile in *x* produces
 * `y = -x + c + tile`, which is a second, parallel road rather than the continuation of the first.
 * A 45° boulevard was built, and one per tile rendered as three — nine long diagonals across a
 * 1440 px screen, cutting the city into shards. It was removed rather than special-cased: the road
 * hierarchy and the two layer angles already give the fabric its directions, and §5.2 asks for
 * arterials rather than for a diagonal. Anything added here that is not parallel to an axis needs
 * its own wrap and this comment is the warning.
 */
function renderTile(spec: GroundLayerSpec, plan: GroundPlan, ink: string, scale: number) {
  const period = Math.round(spec.tile * scale);
  const canvas = document.createElement('canvas');
  canvas.width = period;
  canvas.height = period;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;

  for (const weight of ['lane', 'street', 'arterial'] as const) {
    const runs = plan.segments.filter((segment) => segment.weight === weight);
    if (runs.length === 0) continue;
    ctx.globalAlpha = spec.ink[weight];
    ctx.lineWidth = spec.width[weight];
    ctx.beginPath();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const ox = dx * spec.tile;
        const oy = dy * spec.tile;
        for (const run of runs) {
          ctx.moveTo(run.x1 + ox, run.y1 + oy);
          ctx.lineTo(run.x2 + ox, run.y2 + oy);
        }
      }
    }
    ctx.stroke();
  }

  return { canvas, period };
}

/** The mint point, pre-rendered once. A radial gradient per point per frame would be a paint; a
 *  `drawImage` of a 30 px sprite is a blit. */
function renderPointSprite(colour: string, scale: number): HTMLCanvasElement | null {
  const radius = GROUND_POINT_HALO_RADIUS;
  const size = Math.round(radius * 2 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.scale(scale, scale);

  const halo = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  halo.addColorStop(0, colour);
  halo.addColorStop(0.18, colour);
  halo.addColorStop(1, 'transparent');
  ctx.globalAlpha = GROUND_POINT_HALO_INK;
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, radius * 2, radius * 2);

  ctx.globalAlpha = 1;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(radius, radius, GROUND_POINT_CORE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/**
 * **The city behind the card.** One canvas, one loop, and the argument for both is in
 * `chrome-motion.ts`.
 *
 * ## What a frame costs, and what happens when it costs too much
 *
 * **Measured: nothing, on a GPU.** At 1440×900 and 390×844, at 1× and 2×, the page runs at 8.3 ms
 * median with the ground drifting and 8.3 ms with it paused — no frame over 16.7 ms in 479, and the
 * ground's own on-device probe reads its cost as 0.0 ms. On a software rasteriser the same two fills
 * cost 16 to 42 ms a frame, which is why `tick` measures rather than assumes and stops the drift
 * where it is expensive. Both numbers are real and the device decides which one it is.
 *
 * Two `fillRect`s with a transformed repeating pattern and one `drawImage` per visible point —
 * **six or seven draw calls at 1440×900 and four or five at 390×844**, measured rather than
 * estimated. Nothing is generated per frame: the two tiles and the point sprite are built once at
 * mount and again only when the theme, the pixel ratio or the compact breakpoint moves. The only
 * per-frame allocation is a handful of `DOMMatrix` and `DOMPoint` objects, and there is no layout,
 * style or paint outside the canvas at all — **the element's own box never changes, and the loop
 * never reads it**. `clientWidth` inside a rAF is a forced synchronous layout on every frame, which
 * is precisely the cost a decorative ground is not allowed to have; the size is owned by a
 * `ResizeObserver` instead.
 *
 * ## Why a pattern rather than drawing the streets
 *
 * The fabric is periodic, so the browser can repeat it for free. Drawing it directly would be ~40
 * strokes per layer per frame against one textured fill, and — the part that actually matters —
 * an infinite drift would need the geometry regenerated or wrapped by hand as it moved. Here the
 * drift is `CanvasPattern.setTransform`, the offset wraps at the tile period, and the ground can run
 * for a week without accumulating a float error or showing a seam.
 *
 * The transform is `rotate · scale · translate`, so the translation is in **pattern** space and
 * wraps exactly on the tile; the shared screen heading is rotated *into* each layer's own space
 * once, at build time. Two layers at two angles therefore drift along one screen diagonal, which is
 * what makes it parallax rather than two textures sliding past each other.
 *
 * ## The four ways it stops
 *
 *  - **Its own frame budget** — `tick` below, which measures the cost of the drift against this
 *    page on this machine and stops for good if it is over. The degraded rendering is the
 *    reduced-motion one, so there is one still composition rather than two.
 *
 *  - **`prefers-reduced-motion`** — one frame at `GROUND_STILL_PHASE_SECONDS` and no loop. The
 *    composition survives; only the movement stops. Listened to live, so toggling the preference
 *    starts or stops the ground without a reload.
 *  - **A hidden tab** — the clock is an accumulator advanced only while visible, so returning to the
 *    tab resumes where it left rather than jumping forward by however long the tab was in the
 *    background.
 *  - **Unmount** — the frame, both observers and all three listeners are torn down together.
 *
 * ## Reading the theme at runtime, and why there is no render-time branch
 *
 * Everything the canvas needs — the ink, the mint, the pixel ratio, the preference — is read in an
 * effect and never during render. `chrome-motion.ts` records what the alternative costs: a
 * `useReducedMotion()` branch put *"a tree hydrated but some attributes didn't match"* on the
 * product's front door for reduced-motion users only. The server and the client emit the same empty
 * canvas here, so there is nothing to mismatch.
 */
function CityGround() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null) return;
    const context = element.getContext('2d');
    if (context === null) return;
    // Rebound with a non-nullable *declared* type: the guards above narrow, but TypeScript will not
    // carry a narrowing into the hoisted function declarations below, and there are seven of them.
    const canvas: HTMLCanvasElement = element;
    const ctx: CanvasRenderingContext2D = context;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const dark = window.matchMedia('(prefers-color-scheme: dark)');

    let tiles: LayerTile[] = [];
    let sprite: HTMLCanvasElement | null = null;
    let scale = 1;
    let compact = 1;
    /** The conditions the tiles were generated under, so a rebuild that would change nothing costs
     *  a string comparison. */
    let built = '';
    let width = 0;
    let height = 0;
    /** Seconds of *visible* time. Not `performance.now()`: a backgrounded tab must not fast-forward.
     *  It starts at the still phase, so the first frame of the animation is exactly the frame a
     *  reduced-motion user is given. */
    let clock = GROUND_STILL_PHASE_SECONDS;
    let last = 0;
    let frame = 0;
    /** Frame intervals with the ground drawing and with it paused, until there are enough of each
     *  to rule on. `null` once the ruling is made, and it is made once. */
    let probe: { moving: number[]; still: number[] } | null = { moving: [], still: [] };
    /** `performance.now()` of the first frame, so the probe can stay clear of the entrance. */
    let started = 0;
    /**
     * Set once, by the budget, and never cleared.
     *
     * Without it the ruling is not sticky and the bug is invisible: a theme class landing on
     * `<html>` a moment later calls `rebuild()`, `rebuild()` calls `start()`, and the loop this
     * probe just stopped comes back — with `probe` already spent, so it never measures again. Caught
     * at 1440×900 on the software rasteriser, where the ground reported a cost of 49 ms a frame and
     * was still running.
     */
    let degraded = false;

    const heading = (GROUND_DRIFT_DEGREES * Math.PI) / 180;
    const drift = { x: Math.cos(heading), y: Math.sin(heading) };

    /** The matrix a layer's fabric is painted through at time `t`: pattern space rotated onto the
     *  screen, scaled for the viewport, and translated by a drift that wraps on the tile. */
    function place(tile: LayerTile, time: number): DOMMatrix {
      const period = tile.period;
      return new DOMMatrix()
        .rotateSelf(tile.spec.angle)
        .scaleSelf(compact)
        .translateSelf(
          (((tile.step.x * time) % period) + period) % period,
          (((tile.step.y * time) % period) + period) % period,
        );
    }

    /**
     * (Re)generate the two tiles and the point sprite, and do nothing at all if none of the four
     * things they depend on has moved.
     *
     * The guard is not an optimisation, it is what makes the observers safe to be blunt. The theme
     * watcher fires on *any* class landing on `<html>` and the resize observer fires on every pixel
     * of a window drag; without a key both would rebuild three canvases and forty strokes for a
     * change that cannot affect them. With one, the callers can each say "conditions may have
     * changed" and be right, which is a much easier contract than each of them knowing which
     * conditions it owns.
     */
    function build() {
      const nextScale = Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE);
      const nextCompact = window.innerWidth < GROUND_COMPACT_MAX_WIDTH ? GROUND_COMPACT_SCALE : 1;

      const host = canvas.parentElement ?? canvas;
      const ink = resolveColour('--chrome-accent', host);
      const mint = resolveColour('--brand', host);
      if (ink === null || mint === null) return;

      const key = `${ink}|${mint}|${nextScale}|${nextCompact}`;
      if (key === built) return;
      built = key;
      scale = nextScale;
      compact = nextCompact;

      sprite = renderPointSprite(mint, scale);
      tiles = [];
      for (const spec of GROUND_LAYERS) {
        const plan = planGround(spec);
        const rendered = renderTile(spec, plan, ink, scale);
        if (rendered === null) continue;
        const pattern = ctx.createPattern(rendered.canvas, 'repeat');
        if (pattern === null) continue;
        // The shared screen heading, rotated into this layer's own pattern space and divided by the
        // scale the pattern is painted at. Two layers at two angles, one direction on screen.
        const local = -(spec.angle * Math.PI) / 180;
        const speed = (spec.speed * scale) / compact;
        tiles.push({
          spec,
          plan,
          pattern,
          period: rendered.period,
          step: {
            x: (drift.x * Math.cos(local) - drift.y * Math.sin(local)) * speed,
            y: (drift.x * Math.sin(local) + drift.y * Math.cos(local)) * speed,
          },
        });
      }
    }

    function draw(time: number) {
      if (width === 0 || height === 0) return;
      ctx.clearRect(0, 0, width, height);

      for (const tile of tiles) {
        tile.pattern.setTransform(place(tile, time));
        ctx.fillStyle = tile.pattern;
        ctx.fillRect(0, 0, width, height);
      }

      const near = tiles.find((tile) => tile.spec.id === 'near');
      if (near === undefined || sprite === null) return;

      // Which lattice cells are on screen: the viewport's four corners pulled back through the same
      // matrix, not a search. At 1440x900 that is a range of about three by two.
      const matrix = place(near, time);
      const inverse = matrix.inverse();
      const corners = [
        inverse.transformPoint({ x: 0, y: 0 }),
        inverse.transformPoint({ x: width, y: 0 }),
        inverse.transformPoint({ x: 0, y: height }),
        inverse.transformPoint({ x: width, y: height }),
      ];
      const xs = corners.map((corner) => corner.x);
      const ys = corners.map((corner) => corner.y);
      const minI = Math.floor(Math.min(...xs) / near.period) - 1;
      const maxI = Math.ceil(Math.max(...xs) / near.period) + 1;
      const minJ = Math.floor(Math.min(...ys) / near.period) - 1;
      const maxJ = Math.ceil(Math.max(...ys) / near.period) + 1;

      for (let i = minI; i <= maxI; i += 1) {
        for (let j = minJ; j <= maxJ; j += 1) {
          const point = groundPoint(near.plan, i, j);
          if (point === null) continue;
          const here = matrix.transformPoint({
            x: point.x * scale + i * near.period,
            y: point.y * scale + j * near.period,
          });
          const turn = (time / GROUND_POINT_BREATH_SECONDS + point.phase) * Math.PI * 2;
          const breath = (Math.sin(turn) + 1) / 2;
          const span =
            sprite.width * compact * (1 - GROUND_POINT_BREATH_SWELL / 2 + GROUND_POINT_BREATH_SWELL * breath);
          if (here.x < -span || here.y < -span || here.x > width + span || here.y > height + span) {
            continue;
          }
          ctx.globalAlpha =
            GROUND_POINT_INK * (GROUND_POINT_BREATH_FLOOR + (1 - GROUND_POINT_BREATH_FLOOR) * breath);
          ctx.drawImage(sprite, here.x - span / 2, here.y - span / 2, span, span);
        }
      }
      ctx.globalAlpha = 1;
    }

    function stop() {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }

    /**
     * **The ground measures its own cost on the device it is on, and gives up if it is expensive.**
     *
     * Measured on this change: with a GPU-backed 2D canvas the drift is *free* — 8.3 ms median
     * running and 8.3 ms frozen, at 1440×900 and 390×844 and at 1× and 2×, indistinguishable. On a
     * software rasteriser the same two fills take the same page from 8.7 ms to 24.6 ms at 390×844
     * and from 41 ms to 75 ms at 1440×900. That is not a slow ground, it is no longer sixty frames
     * a second, and a number that swings by an order of magnitude on a property of the device is
     * not a number to design around from here.
     *
     * **It is measured as an A/B against this page on this machine, not as a stopwatch around the
     * draw.** The first attempt timed `draw()` with `performance.now()` and read *under 3 ms* on the
     * software rasteriser that was taking 75 ms a frame — Chromium's 2D canvas records the calls and
     * rasterises them later, so the expensive part happens after the function returns and a timer
     * around it measures nothing. It was built, measured against both cases, and found unable to
     * tell them apart, which is the only reason this one is more complicated.
     *
     * So: fifty frames drawn, then fifty frames **not** drawn — the canvas is left exactly as it
     * was, so nothing flickers and the drift pauses for about a third of a second at 4.6 px/s — and
     * the two medians compared. A baseline taken on the same machine, on the same page, a second
     * apart also absorbs the thing an absolute threshold cannot: whatever else the device is doing.
     *
     * `GROUND_BUDGET_SETTLE_MS` keeps the whole probe clear of the entrance, which is 1.1 s of
     * staggered opacity and is not what is being measured.
     *
     * **The degraded rendering is the reduced-motion rendering** — a still frame this change already
     * had to be good at, so there is nothing extra to design and nothing to test twice. One-shot and
     * one-way: a ground that started and stopped as the machine warmed would be a flicker, and a
     * flicker is a signal.
     */
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      // One draw per animation frame, and the delta is clamped: a tab restored or a slow first paint
      // advances the ground by a frame rather than by a jump.
      const interval = last === 0 ? 0 : now - last;
      clock += last === 0 ? 0 : Math.min(interval / 1000, 1 / 30);
      last = now;
      if (started === 0) started = now;

      if (probe === null || now - started < GROUND_BUDGET_SETTLE_MS) {
        draw(clock);
        return;
      }
      // Each window is a *duration* rather than a count, with a floor on the samples. A count would
      // take fifty slow frames to notice fifty slow frames: measured, the ruling landed six to nine
      // seconds in on the software rasteriser — several seconds of the thing this exists to avoid.
      const open = (samples: number[]): boolean =>
        samples.length < GROUND_BUDGET_MIN_SAMPLES ||
        samples.reduce((total, value) => total + value, 0) < GROUND_BUDGET_WINDOW_MS;

      if (open(probe.moving)) {
        draw(clock);
        probe.moving.push(interval);
        return;
      }
      if (open(probe.still)) {
        // Deliberately no draw: the canvas keeps its last frame, so this is a pause and not a gap.
        probe.still.push(interval);
        return;
      }
      const median = (samples: number[]): number => {
        const sorted = [...samples].sort((a, b) => a - b);
        return sorted[sorted.length >> 1] ?? 0;
      };
      const cost = median(probe.moving) - median(probe.still);
      probe = null;
      if (cost > GROUND_BUDGET_MS) {
        degraded = true;
        stop();
        canvas.dataset.ground = 'still';
        canvas.dataset.groundCost = cost.toFixed(1);
        return;
      }
      canvas.dataset.groundCost = cost.toFixed(1);
      draw(clock);
    }

    function start() {
      stop();
      if (reduced.matches || degraded) {
        draw(clock);
        canvas.dataset.ground = 'still';
        return;
      }
      if (document.visibilityState === 'hidden') return;
      // `data-ground` is how the state is *observed* rather than inferred from pixels: a harness
      // asking whether this device kept the drift should not have to diff two screenshots, and
      // "still because the preference says so" and "still because the frames cost too much" are the
      // same rendering and want the same name.
      canvas.dataset.ground = 'moving';
      frame = requestAnimationFrame(tick);
    }

    function rebuild() {
      build();
      start();
    }

    build();

    // The size is owned by the observer rather than read in the loop. `clientWidth` in a rAF is a
    // forced layout on every frame, which is exactly the cost this ground is not allowed to have.
    const observer = new ResizeObserver(() => {
      // A resize can cross the compact breakpoint or move the window to a screen with a different
      // pixel ratio, and both change what the tiles must be. `build()` is a no-op when neither did.
      build();
      const nextWidth = Math.round(canvas.clientWidth * scale);
      const nextHeight = Math.round(canvas.clientHeight * scale);
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      if (frame === 0) draw(clock);
    });
    observer.observe(canvas);

    start();

    // The arrival. 600 ms is the blooms', so the whole ground appears as one thing; opacity only, so
    // a reduced-motion user gets the entrance's collapsed 140 ms fade rather than a pop.
    // `--duration-enter` is read rather than written, because it is already a token.
    const collapsed = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--duration-enter'),
    );
    const arrival = canvas.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      reduced.matches
        ? { duration: Number.isFinite(collapsed) ? collapsed : 140, easing: 'linear', fill: 'both' }
        : {
            duration: GROUND_ARRIVAL_SECONDS * 1000,
            easing: `cubic-bezier(${EASE_STANDARD.join(', ')})`,
            fill: 'both',
          },
    );

    // `next-themes` toggles the class; the media query is the system preference under it. Either one
    // moves `--chrome-accent` and `--brand`, and a canvas cannot re-resolve a custom property the way
    // every other element on this page does.
    const themeWatcher = new MutationObserver(rebuild);
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else start();
    };

    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', start);
    dark.addEventListener('change', rebuild);

    return () => {
      stop();
      arrival.cancel();
      observer.disconnect();
      themeWatcher.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', start);
      dark.removeEventListener('change', rebuild);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-chrome-ground="city"
      className="absolute inset-0 size-full"
      style={{ opacity: 0 }}
    />
  );
}
