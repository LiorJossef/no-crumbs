/**
 * **What a resize reproduces, and what retires it** — `W2-2`, `current-state.md` items 4 and 5.
 *
 * The `{ kind: 'user' }` arm of `Framing` shipped to production as a minimal fix and was never
 * exercised anywhere: produced in one place (`noteUserGesture`), consumed in one place
 * (`refitFramed`), covered by no test. It is load-bearing — it is the *only* thing that retires a
 * recorded framing, and `refitFramed` runs on every `ResizeObserver` hit and every `window` resize.
 * On mobile Safari the URL bar collapsing on the first scroll is a resize, so without it a
 * programmatic framing is replayed over the user's own camera for the life of the page.
 *
 * ## What this file is evidence of, and what it is not
 *
 * `map-surface.mapcn.tsx` transitively imports `server-only` and **cannot be imported here at all**
 * — measured, not assumed: the import throws *"This module cannot be imported from a Client
 * Component module"*. So this file does what `camera-model.ts` does for the padding, and carries
 * the same disclaimer: the state machine below is a **mirror**, and the assertions that pin it to
 * the source are what stop the mirror becoming fiction. It is evidence about the *rule*. It is not
 * evidence that a browser reproduced anything, and it never becomes that.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
const MAPLIBRE_KEYBOARD = 'node_modules/maplibre-gl/src/ui/handler/keyboard.ts';

/* ---------------------------------------------------------------------------
 * The mirror. `Framing`, `noteUserGesture` and `refitFramed`, as a state machine.
 * ------------------------------------------------------------------------ */

type Framing =
  | { readonly kind: 'fit'; readonly target: string }
  | { readonly kind: 'bounds'; readonly request: string }
  | { readonly kind: 'home' }
  | { readonly kind: 'user' };

/** What `refitFramed` does, named rather than performed. `none` is the arm that leaves the camera
 *  alone; `home` re-derives instead of replaying, which is `W2-1`'s `{ kind: 'home' }`. */
type RefitAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'home' }
  | { readonly kind: 'replay-bounds'; readonly request: string }
  | { readonly kind: 'replay-fit'; readonly target: string };

function refitActionFor(framing: Framing | null): RefitAction {
  if (framing === null || framing.kind === 'home') return { kind: 'home' };
  if (framing.kind === 'user') return { kind: 'none' };
  if (framing.kind === 'bounds') return { kind: 'replay-bounds', request: framing.request };
  return { kind: 'replay-fit', target: framing.target };
}

/** The surface's three gesture handlers, as the one predicate they share: a camera event carrying
 *  an `originalEvent` was caused by a person, and a zoom button is a person with no event to
 *  carry. Returns the framing after the event. */
function afterEvent(
  framing: Framing | null,
  event:
    | { readonly type: 'dragend' }
    | { readonly type: 'zoomend' | 'moveend'; readonly originalEvent: boolean }
    | { readonly type: 'control-zoom' }
    | { readonly type: 'programmatic-moveend' },
): Framing | null {
  switch (event.type) {
    case 'dragend':
    case 'control-zoom':
      return { kind: 'user' };
    case 'zoomend':
    case 'moveend':
      return event.originalEvent ? { kind: 'user' } : framing;
    case 'programmatic-moveend':
      return framing;
  }
}

describe('a resize reproduces the framing, not the camera', () => {
  it('replays a place flight and a country tap, which is what the arms are for', () => {
    expect(refitActionFor({ kind: 'fit', target: 'the places an import saved' })).toEqual({
      kind: 'replay-fit',
      target: 'the places an import saved',
    });
    expect(refitActionFor({ kind: 'bounds', request: 'a country tap' })).toEqual({
      kind: 'replay-bounds',
      request: 'a country tap',
    });
  });

  /**
   * **The home arm re-decides rather than replays** (`W2-1`). Its resting zoom is a function of the
   * container, so replaying the zoom it chose against the old container would reproduce the answer
   * to a question that has changed — the overview of whichever size the map was first measured at.
   */
  it('re-derives the overview instead of replaying it', () => {
    expect(refitActionFor({ kind: 'home' })).toEqual({ kind: 'home' });
    expect(refitActionFor(null)).toEqual({ kind: 'home' });
  });

  /** **The arm this package exists for.** The right answer to a resize after a gesture is to do
   *  nothing at all: MapLibre's own `resize()` preserves centre and zoom, so what the user was
   *  looking at survives on its own. */
  it('does nothing at all after the user has taken the camera', () => {
    expect(refitActionFor({ kind: 'user' })).toEqual({ kind: 'none' });
  });
});

describe('what retires a framing', () => {
  const framed: Framing = { kind: 'bounds', request: 'a country tap' };

  it('a drag, a wheel or pinch zoom, and the zoom buttons', () => {
    expect(afterEvent(framed, { type: 'dragend' })).toEqual({ kind: 'user' });
    expect(afterEvent(framed, { type: 'zoomend', originalEvent: true })).toEqual({ kind: 'user' });
    expect(afterEvent(framed, { type: 'control-zoom' })).toEqual({ kind: 'user' });
  });

  /**
   * **The keyboard, which nothing retired until 2026-08-31.** MapLibre's arrow-key pan is a bare
   * `easeTo(…, {originalEvent})`: it records no `drag` event-in-progress, so no `dragend` is fired,
   * and it leaves the zoom alone, so no `zoomend` is fired either. The only event it does emit is
   * `moveend` — carrying the `originalEvent` the guard keys on. See the MapLibre assertions below,
   * which are what make this a checked claim rather than a remembered one.
   */
  it('and the keyboard, through the one event every camera move ends with', () => {
    expect(afterEvent(framed, { type: 'moveend', originalEvent: true })).toEqual({ kind: 'user' });
  });

  /**
   * **And nothing else may.** Every camera mover in the surface ends in a `moveend` too; if that
   * retired the framing, a resize would stop reproducing a country tap and the fix would have
   * traded one defect for the other. The guard is structural rather than remembered: this file
   * issues every `easeTo` / `fitBounds` with options only and no `eventData`, so a programmatic
   * move carries no `originalEvent` — asserted against the source below.
   */
  it('a programmatic framing does not, however many events it emits', () => {
    expect(afterEvent(framed, { type: 'programmatic-moveend' })).toBe(framed);
    expect(afterEvent(framed, { type: 'moveend', originalEvent: false })).toBe(framed);
    expect(afterEvent(framed, { type: 'zoomend', originalEvent: false })).toBe(framed);
  });

  /** The whole point, as the sequence that produced the bug: a country tap is framed, the user
   *  pans away from it with the keyboard, mobile Safari collapses its URL bar. */
  it('survives the sequence the defect was reported as', () => {
    let framing: Framing | null = null;
    framing = { kind: 'bounds', request: 'a country tap' };
    expect(refitActionFor(framing)).toEqual({ kind: 'replay-bounds', request: 'a country tap' });
    framing = afterEvent(framing, { type: 'moveend', originalEvent: true });
    expect(refitActionFor(framing)).toEqual({ kind: 'none' });
    // And it stays retired: a second resize is not a second chance to replay.
    framing = afterEvent(framing, { type: 'programmatic-moveend' });
    expect(refitActionFor(framing)).toEqual({ kind: 'none' });
  });
});

/* ---------------------------------------------------------------------------
 * Pinning the mirror to the source. Without these the tests above describe a
 * program that exists only in this file.
 * ------------------------------------------------------------------------ */

describe('the mirror still matches the surface', () => {
  it('has exactly the four framing arms, and one producer of the user arm', () => {
    for (const arm of ["kind: 'fit'", "kind: 'bounds'", "kind: 'home'", "kind: 'user'"]) {
      expect(SURFACE).toContain(arm);
    }
    // One writer. A second `= { kind: 'user' }` anywhere would be a second definition of what a
    // gesture is, and the arm's whole value is that there is one.
    expect(SURFACE.match(/framing\.current = \{ kind: 'user' \}/g)).toHaveLength(1);
  });

  it('leaves the camera alone on the user arm, and re-derives on the home arm', () => {
    expect(SURFACE).toContain("if (current.kind === 'user') return;");
    expect(SURFACE).toContain("if (current === null || current.kind === 'home') {");
  });

  /** Both resize paths, and there are two: the `ResizeObserver` on the container and the `window`
   *  listener. A fix applied to one of them is not a fix. */
  it('routes both resize paths through refitFramed', () => {
    expect(SURFACE.match(/refitFramed\(instance\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(SURFACE).toContain("window.addEventListener('resize', handleResize)");
    expect(SURFACE).toContain('new ResizeObserver(');
  });

  it('wires every gesture that may retire a framing', () => {
    expect(SURFACE).toContain("instance.on('dragend', handleDragEnd)");
    expect(SURFACE).toContain("instance.on('zoomend', handleZoomEnd)");
    expect(SURFACE).toContain("instance.on('moveend', handleMoveEnd)");
    expect(SURFACE).toContain('onUserZoom={handleControlZoom}');
    // …and detaches each of them, or a remounted map accumulates handlers that outlive it.
    expect(SURFACE).toContain("previous.off('moveend', handleMoveEnd)");
  });

  /**
   * **The property that makes `originalEvent` a trustworthy guard rather than a convention.** Every
   * camera command this file issues takes options and no `eventData`, so none of them can produce a
   * `moveend` that looks like a gesture. Checked as *the absence of a second argument after the
   * options object* on the three commands that accept one.
   *
   * A shape check, not a proof: a call whose options object itself contains a `)` — `frameBounds`'
   * `Math.max(…)` is one — is outside what this pattern can see. It catches the ordinary way the
   * property would be broken, which is someone adding `, { originalEvent }` to a mover, and it is
   * stated as a heuristic rather than presented as exhaustive.
   */
  it('issues no camera command carrying an eventData object', () => {
    const CODE = SURFACE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(CODE).not.toMatch(/\.(easeTo|flyTo|jumpTo)\([^)]*\},\s*\{/);
    expect(CODE).not.toMatch(/\.fitBounds\([^;]*\},\s*\{[^;]*originalEvent/);
  });
});

/**
 * **The third-party fact the keyboard fix rests on, read rather than remembered.**
 *
 * House rule: a claim about a dependency's behaviour is VERIFIED against evidence. The evidence is
 * `maplibre-gl` 6.4.1's own source, which is in `node_modules` and is what actually runs. If an
 * upgrade changes any of this, the guard's coverage changes with it and this is where that shows
 * up — which is the point of reading the file instead of the changelog.
 */
describe('maplibre-gl 6.4.1: what the keyboard actually emits', () => {
  const KEYBOARD = readFileSync(MAPLIBRE_KEYBOARD, 'utf8');

  it('drives the camera through a bare easeTo that carries the originalEvent', () => {
    expect(KEYBOARD).toContain('cameraAnimation:');
    expect(KEYBOARD).toContain('map.easeTo({');
    expect(KEYBOARD).toContain('{originalEvent: e}');
  });

  /** No `panDelta` and no `zoomDelta` in its handler result, so `handler_manager.ts` records no
   *  `drag` event-in-progress — and `dragend` is fired from nowhere else. That is precisely why
   *  `dragend` alone never saw an arrow key. */
  it('reports no panDelta, which is why no dragend is ever fired for it', () => {
    expect(KEYBOARD).not.toContain('panDelta');
    const MANAGER = readFileSync('node_modules/maplibre-gl/src/ui/handler_manager.ts', 'utf8');
    expect(MANAGER).toContain('if (handlerResult.panDelta !== undefined) {');
    expect(MANAGER).toContain('eventsInProgress.drag = eventData;');
    // And the camera itself never fires one, so the handler manager is the only source.
    expect(readFileSync('node_modules/maplibre-gl/src/ui/camera.ts', 'utf8')).not.toContain(
      "'dragend'",
    );
  });

  /** `moveend` carries whatever `eventData` the caller passed to `easeTo`, which is the whole
   *  mechanism: the keyboard's `originalEvent` survives all the way to our listener. */
  it('passes the caller eventData through to moveend', () => {
    expect(readFileSync('node_modules/maplibre-gl/src/ui/camera.ts', 'utf8')).toContain(
      "this.fire(new MapMovementEvent('moveend', eventData))",
    );
  });
});
