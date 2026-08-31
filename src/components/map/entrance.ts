'use client';

/**
 * **The post-login entrance: one clock, five beats, four surfaces** (`I2-7`,
 * `iteration-2-plan.md` §2.2 ruling 2).
 *
 * `pins.land` (`W6-6`) and the reveal-into-flight (`W6-7`) were both built for the *import*, and
 * they were wired to it alone: a fresh sign-in simply arrived on a map that was already settled.
 * The owner's ruling is that the arrival is the same choreography, so this module is the clock the
 * four halves of it read — nothing here draws anything.
 *
 * | | |
 * |---|---|
 * | 0 ms | the ground is framed, under whatever is still covering it |
 * | 200 ms | the camera begins its descent from altitude |
 * | 600 ms | the ground settles at the library's own box |
 * | 700 ms | pins land — `LAND_WAVES` waves, `LAND_STAGGER_MS` apart |
 * | 900 ms | the sheet rises to its stop |
 * | 1100 ms | the header wordmark fades in |
 *
 * ## Why the clock is a module singleton and not a prop
 *
 * The four beats are read in four different places — `map-surface.mapcn.tsx` (the camera),
 * `place-marker-layer.tsx` (the pins), `map-shell.tsx` (the sheet and the desktop panel) and
 * `/map`'s own header (the wordmark) — and three of them are not on a path from the fourth.
 * Threading a timestamp through `MapShell` to the two that are, and through nothing to the two
 * that are not, would give the entrance two clocks; two clocks are two answers to *when did this
 * start*, and the whole value of a choreography is that its beats agree.
 *
 * One document is exactly the scope of one entrance, which is what a module singleton is.
 *
 * ## Where the zero is, and why it is not React's mount
 *
 * **The clock starts when the camera frames the library's box**, not when this page mounts. Those
 * are far apart and not by a fixed amount: measured against `18ac2052` with
 * `tests/harness/measure-motion.mjs`, the map's first paint is 1942 ms after navigation at 390×844
 * and 2655 ms at 1440×900 — style fetch, WebGL context, tiles. Anchoring on mount would run the
 * whole sequence out while the screen was still blank, and the sheet would rise over a map that had
 * not appeared.
 *
 * `startEntranceClock()` is therefore called by the home framing, and everything else waits for it.
 */

import { useEffect, useState } from 'react';

/**
 * The beats, in milliseconds from the clock's zero. The owner's table, verbatim.
 *
 * `ground` is not read by anything: it is the *end* of the camera beat, and it is here because
 * `ENTRANCE_DESCENT_MS` is derived from it rather than written as a second number that could
 * disagree with the table.
 */
export const ENTRANCE_BEATS = {
  camera: 200,
  ground: 600,
  pins: 700,
  sheet: 900,
  wordmark: 1100,
} as const;

/** How long the descent itself takes — the gap between the camera starting and the ground
 *  settling. Derived, so the table above stays the only place the timing is stated. */
export const ENTRANCE_DESCENT_MS = ENTRANCE_BEATS.ground - ENTRANCE_BEATS.camera;

/**
 * How far above the resting camera the descent starts, in zoom levels.
 *
 * It is a *lift off the answer*, never a zoom of its own: the honest fit runs first, the camera is
 * read back off it, and the descent's destination is that reading. So whatever `settleZoom`
 * resolved is where this stops, and the constraint that the entrance may not land somewhere
 * prettier than the library deserves is structural rather than a promise.
 *
 * 2.6 is a little over one zoom band (`zoom-bands.ts`: 4.0 wide for `area`, and the descent has to
 * read as travel rather than as a nudge) and short of the two that would put a one-city library out
 * over open sea on the way in. A library resting in the pin band therefore starts in the area band
 * and crosses one boundary on the way down, which is `band.cross` — an existing, closed-list
 * animation — rather than a new one.
 */
export const ENTRANCE_ZOOM_LIFT = 2.6;

/**
 * How long the page will wait for the map to frame the library before starting the clock anyway.
 *
 * The sheet and the wordmark are *withheld* until their beats, so a clock that never starts is a
 * map with no list and no brand on it for the life of the page. The camera can fail to frame —
 * `fitTo`'s docblock records an impossible fit that silently does nothing, and a WebGL context can
 * fail to come up at all — and none of those failures says anything on screen.
 *
 * The same 4 s as `LAND_SETTLE_FALLBACK_MS`, for the same reason and against the same measurement:
 * well clear of the settle times this map actually shows, so it is a floor and not a second
 * schedule.
 */
export const ENTRANCE_CLOCK_FLOOR_MS = 4000;

/**
 * Whether the entrance has already been spent in this document.
 *
 * **Module scope, deliberately not state and deliberately not `sessionStorage`** — the shape
 * `ux-overnight-specs.md` Spec 3 §3.4 chose for the zero-state overlay, for the reasons it gives
 * there. Once per page *load*, not once per mount: `/map` → `/collections` → `/map` remounts the
 * page, and a choreographed entrance every time someone comes back to a surface they were already
 * on is a nag that also delays them.
 *
 * A client-side navigation from `/sign-in` keeps this module instance, so the first arrival at
 * `/map` in a document plays and every later one does not — which is exactly the rule.
 */
let entranceSpent = false;

/**
 * Claim the entrance for this mount: `true` for the first arrival at `/map` in this document.
 *
 * **The claim is read during render and recorded in an effect**, and the split is what makes it
 * safe in both places it runs. Recording it during render would consume it on the *server*, where
 * module scope is per-process and shared across every request — the first visitor would arm the
 * entrance and everyone after them would be served HTML that says it is already spent, while their
 * browser's own fresh module says it is not. That is a hydration mismatch on the product's main
 * surface, caused by another user's request. Effects do not run on the server, so `entranceSpent`
 * stays false there and SSR answers `true` deterministically — which is correct on its own terms,
 * because an SSR of `/map` only happens on a document load, and a document load is the arrival.
 *
 * It also survives React's development double-render: both invocations see the same unspent flag
 * and return the same answer.
 *
 * ```ts
 * const [entrance] = useState(claimEntrance);
 * useEffect(spendEntrance, []);
 * ```
 */
export function claimEntrance(): boolean {
  return !entranceSpent;
}

/** Record that this document's entrance has been claimed. Call from an effect — see
 *  `claimEntrance` for why it may not happen during render. */
export function spendEntrance(): void {
  entranceSpent = true;
}

/** When the clock started, on `performance.now()`'s timeline, or `null` before it has. */
let entranceStartedAt: number | null = null;
/** Everything waiting for the zero. Cleared when it arrives; a listener added afterwards is called
 *  immediately instead, so nothing can miss the start by mounting late. */
const clockListeners = new Set<() => void>();

/**
 * Start the clock. Idempotent, so the floor below and the camera above can both call it and
 * whichever is first wins.
 */
export function startEntranceClock(): void {
  if (entranceStartedAt !== null) return;
  entranceStartedAt = now();
  const listeners = [...clockListeners];
  clockListeners.clear();
  for (const listener of listeners) listener();
}

/** Run `listener` when the clock starts, or now if it already has. Returns an unsubscribe. */
export function whenEntranceStarts(listener: () => void): () => void {
  if (entranceStartedAt !== null) {
    listener();
    return () => {};
  }
  clockListeners.add(listener);
  return () => clockListeners.delete(listener);
}

/**
 * How long from *now* until `beat`, in milliseconds. Never negative: a beat already passed is due
 * immediately, which is what keeps a surface that mounted late from replaying the sequence.
 *
 * **Under `prefers-reduced-motion` every beat is due at once**, and that is the collapse
 * `facelift-plan.md` §3a specifies — the nine collapse *to the opacity change, not to nothing*.
 * What a reduced-motion user loses is the sequencing; the sheet, the panel and the wordmark still
 * fade in over `--duration-enter`, together, and the camera does not fly at all.
 */
export function entranceDelayMs(beat: number): number {
  if (entranceStartedAt === null || prefersReducedMotion()) return 0;
  return Math.max(0, beat - (now() - entranceStartedAt));
}

/** `performance.now()` where it exists, `Date.now()` where it does not. Both are monotonic enough
 *  for a sequence measured in hundreds of milliseconds. */
function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Whether this browser has asked for less motion. `false` on the server and in a browser with no
 * `matchMedia`, which is the same answer the pin landing's own read gives.
 *
 * Read at the moment a beat is scheduled rather than subscribed to: the setting is not something a
 * user changes during a one-second arrival.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * **Has this beat arrived?** `true` immediately when `enabled` is false, so a surface that is not
 * part of an entrance renders exactly as it always did and the caller needs no branch.
 *
 * The initial value is `false` for an armed entrance on both the server and the hydrating client,
 * which is what keeps the two renders agreeing. The cost is stated rather than hidden: a document
 * whose JavaScript never runs would show `/map` with no sheet and no wordmark — but `/map` is a
 * WebGL canvas fed by a client component, so that document has no map either.
 */
export function useEntranceBeat(beat: number, enabled: boolean): boolean {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = whenEntranceStarts(() => {
      timer = setTimeout(() => setArrived(true), entranceDelayMs(beat));
    });
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [beat, enabled]);

  return !enabled || arrived;
}
