/**
 * **The `userInitiated` guard, as a property of the surface's source.**
 *
 * `ViewportChangeMeta.userInitiated` is the only thing standing between a programmatic camera move
 * and the sidebar's scope — the `21 places` -> `9 places` failure `ui/place/active-area.ts`
 * documents. It cannot be unit-tested through the component: `map-surface.mapcn.tsx` transitively
 * imports `server-only` and needs a WebGL context. So it is tested the way
 * `camera-library-shapes.test.ts` tests the framing ranges, over the file's own text.
 *
 * Two halves, and they fail in opposite directions:
 *
 *  - **Nothing this file issues may carry an `originalEvent`.** That is what makes the guard
 *    structural rather than a rule someone has to remember, and it is the property `617af6e`
 *    reversed a change to preserve. A camera command with `eventData` attached would make a
 *    programmatic landing indistinguishable from a gesture, and movers 4 and 5 land on pins.
 *  - **Every user zoom has to reach the flag.** Three of them produce camera events with no
 *    `originalEvent` at all — the `+`/`-` controls, a discrete mouse-wheel notch (MapLibre 6.4.1's
 *    `ScrollZoomHandler._onTimeout` never assigns `_lastWheelEvent`) and a shift-drag box zoom
 *    (`fitScreenCoordinates` is called with no `eventData`). They are covered by listening to
 *    `wheel` and `boxzoomend` directly, and a regression here is silent: the map keeps working and
 *    the list simply stops following it.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
/** The file with its docblocks and line comments removed — they quote `originalEvent` at length,
 *  and those sentences are the explanation that has to survive. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('a programmatic camera move cannot be mistaken for a gesture', () => {
  it('never attaches an `originalEvent` to anything it issues', () => {
    // `camera.ts` passes the caller's `eventData` straight through to `moveend`, so one of these
    // anywhere in this file would make a flight indistinguishable from a hand on the glass.
    expect(CODE).not.toContain('originalEvent:');
  });

  it('reads `originalEvent` only as a guard, and rejects the event when it is absent', () => {
    const guards = CODE.match(/if \(!event\.originalEvent\) return;/g) ?? [];
    // `zoomend` and `moveend`. Both must refuse rather than assume.
    expect(guards).toHaveLength(2);
  });
});

describe('every user zoom reaches the flag', () => {
  it('wires the three gestures whose camera events carry no `originalEvent`', () => {
    expect(CODE).toContain("instance.on('wheel', noteUserZoom)");
    expect(CODE).toContain("instance.on('boxzoomend', noteUserZoom)");
    expect(CODE).toContain('onUserZoom={noteUserZoom}');
  });

  it('detaches everything it attaches, so a swapped map instance leaks no listener', () => {
    for (const event of ['dragend', 'zoomend', 'wheel', 'boxzoomend', 'moveend']) {
      expect(CODE).toContain(`previous.off('${event}'`);
    }
  });

  it('sets the flag from one place, so the three gestures cannot drift apart', () => {
    expect(CODE).toContain('const noteUserZoom = useCallback(');
    // `pannedSinceReport` is written by the four handlers and consumed by the report. Five writes
    // total: three handlers plus the report's own reset.
    const writes = CODE.match(/pannedSinceReport\.current = /g) ?? [];
    expect(writes).toHaveLength(5);
  });
});

describe('the report says which band the camera came from', () => {
  it('carries `previousBand` and advances it on every report, programmatic ones included', () => {
    // The band a flight *landed* in is what the user's next gesture is measured against, so this
    // must be written before the handler is called and outside any `userInitiated` branch.
    expect(CODE).toContain('const previousBand = lastReportedBand.current;');
    expect(CODE).toContain('lastReportedBand.current = band;');
    expect(CODE).toContain('handler(rect, { userInitiated, zoom, band, previousBand });');
  });
});
