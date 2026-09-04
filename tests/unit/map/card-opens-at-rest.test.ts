/**
 * **The desktop place card must not open while the map is still moving** — MAP-02.
 *
 * The defect, as the owner saw it: the card appears below the pin and then jumps above it, on a
 * list-row click *and* on a pin tap. Cause, established before this test was written:
 * `MapPopup` passes no `anchor`, MapLibre therefore derives one from the pin's current screen
 * position, and it re-derives on `move` — every animation frame. The card was mounting in the same
 * commit as the selection, i.e. while camera mover 6's reveal `panBy` was still running.
 *
 * The fix gates the *opening* on the map being at rest. This file tests the gate
 * (`src/components/map/at-rest.ts`) directly, because the unit suite runs in node with no renderer
 * and `map-surface.mapcn.tsx` cannot be imported here; the surface's use of it is asserted from
 * source at the bottom.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { whenAtRest } from '@/components/map/at-rest';

/** A map whose motion we drive by hand. `defer` is passed explicitly in these tests so the
 *  microtask re-check is synchronous and observable. */
function fakeMap(moving = false) {
  const listeners = new Set<() => void>();
  const map = {
    moving,
    isMoving: () => map.moving,
    on: (_type: 'moveend', listener: () => void) => listeners.add(listener),
    off: (_type: 'moveend', listener: () => void) => listeners.delete(listener),
    /** MapLibre fires `moveend` with `_moving` already false; a chained command sets it true again
     *  synchronously, which is exactly what the microtask re-check is there to catch. */
    endMove: (stillMoving = false) => {
      map.moving = stillMoving;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
  return map;
}

const now = (fn: () => void) => fn();

describe('whenAtRest', () => {
  /** The trap that matters most: with no camera move there is no `moveend` coming, so waiting for
   *  one would replace a cosmetic flicker with a card that never appears. Mover 6 declines to move
   *  in several ordinary cases, so this is the common path, not an edge case. */
  it('runs immediately, synchronously, when the map is already at rest', () => {
    const map = fakeMap(false);
    let opened = 0;
    whenAtRest(map, () => (opened += 1), now);
    expect(opened).toBe(1);
    expect(map.listenerCount()).toBe(0); // nothing attached, so nothing to leak
  });

  it('waits for the move to end when the map is moving', () => {
    const map = fakeMap(true);
    let opened = 0;
    whenAtRest(map, () => (opened += 1), now);
    expect(opened).toBe(0);

    map.endMove();
    expect(opened).toBe(1);
    expect(map.listenerCount()).toBe(0);
  });

  /**
   * `moveend` fires per camera command, and one commit can issue more than one — `easeTo`/`flyTo`
   * call `stop()`, which ends the command they are cancelling before their own starts. So the
   * first `moveend` is not proof of rest; the listener stays attached and asks again.
   */
  it('keeps waiting when a second camera command starts as the first ends', () => {
    const map = fakeMap(true);
    let opened = 0;
    whenAtRest(map, () => (opened += 1), now);

    map.endMove(true); // a chained command re-armed the camera
    expect(opened).toBe(0);
    expect(map.listenerCount()).toBe(1);

    map.endMove(false);
    expect(opened).toBe(1);
    expect(map.listenerCount()).toBe(0);
  });

  it('opens exactly once however many move commands run', () => {
    const map = fakeMap(true);
    let opened = 0;
    whenAtRest(map, () => (opened += 1), now);
    map.endMove();
    map.moving = true;
    map.endMove();
    expect(opened).toBe(1);
  });

  /** Deselect, or re-selection, during a move: the previous wait must leave nothing behind and
   *  must never open late. */
  it('cancels cleanly, detaching the listener and never running afterwards', () => {
    const map = fakeMap(true);
    let opened = 0;
    const cancel = whenAtRest(map, () => (opened += 1), now);

    cancel();
    expect(map.listenerCount()).toBe(0);
    map.endMove();
    expect(opened).toBe(0);
  });

  it('is a no-op to cancel after it has already run', () => {
    const map = fakeMap(true);
    let opened = 0;
    const cancel = whenAtRest(map, () => (opened += 1), now);
    map.endMove();
    cancel();
    expect(opened).toBe(1);
    expect(map.listenerCount()).toBe(0);
  });

  /** Re-selection while A's move is in flight: B is shown, once, at rest — never A late, and
   *  never both. Modelled the way the effect does it: cancel A's wait, start B's. */
  it('shows only the later selection when one interrupts another', () => {
    const map = fakeMap(true);
    const opened: string[] = [];
    const cancelA = whenAtRest(map, () => opened.push('A'), now);
    cancelA();
    whenAtRest(map, () => opened.push('B'), now);

    map.endMove();
    expect(opened).toEqual(['B']);
  });

  /** The default `defer` is a microtask, so a `moveend` fired synchronously from `stop()` is not
   *  answered until the surrounding synchronous work — including the command that caused it — has
   *  finished. */
  it('defers the re-check to a microtask by default', async () => {
    const map = fakeMap(true);
    let opened = 0;
    whenAtRest(map, () => (opened += 1));

    map.endMove();
    expect(opened).toBe(0); // not yet — the microtask has not run
    await Promise.resolve();
    expect(opened).toBe(1);
  });
});

describe('the surface opens the card through the gate', () => {
  const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');

  it('renders the gated selection, not the raw one', () => {
    expect(SURFACE).toContain(
      'const card = selected !== null && openedId === selected.id ? selected : null;'
    );
    expect(SURFACE).toContain('{card && (');
    expect(SURFACE).toContain('key={card.id}');
    expect(SURFACE).not.toContain('{selected && (');
  });

  it('gates on the map being at rest and cleans up after itself', () => {
    expect(SURFACE).toContain("import { whenAtRest, type AtRestMap } from './at-rest';");
    expect(SURFACE).toContain('return whenAtRest(gate, () => setOpenedId(id));');
    // Already open means open: movement must not re-gate a card that is up.
    expect(SURFACE).toContain('if (openedId === id) return;');
    // Deselection and a not-yet-attached map are trivially at rest, so they open/close at once.
    expect(SURFACE).toContain('const gate = (id === null ? null : mapRef.current) ?? AT_REST;');
  });

  /**
   * The gate is declared *after* every camera mover, because `easeTo`/`panBy`/`flyTo` set the map
   * moving synchronously and an effect that ran first would ask `isMoving()` before the command
   * existed. It must stay last.
   */
  it('is declared after the last camera mover', () => {
    const lastMover = SURFACE.lastIndexOf('frameBounds(instance, focusBounds, true)');
    const gate = SURFACE.indexOf('const [openedId, setOpenedId]');
    expect(lastMover).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(lastMover);
  });
});
