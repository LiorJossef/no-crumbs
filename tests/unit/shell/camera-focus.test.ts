/**
 * The shell's single camera focus slot, and what it becomes on the surface's props.
 *
 * `ux-collections-as-scope.md` §5 item 10 collapsed three cells into one: `/map` held two
 * (`focusPlaceIds` for the movers that frame a set of pins, `focusBounds` for the two that frame a
 * box inside a zoom range) and `/collections/[id]` held a third. The claim that makes the collapse
 * safe is that the surface's two `already flown` guards early-return on an absent prop, so a
 * `bounds` write leaving `focusPlaceIds` undefined moves nothing — and that is checkable here,
 * without a WebGL context, because `focusProps` is the one place that answers it.
 *
 * `useMapShell` itself is a hook and there is no DOM in this runner (`environment: 'node'`), so the
 * raise/restore behaviour it owns is verified by driving the app, not here. What is here is the
 * pure part.
 */
import { describe, expect, it } from 'vitest';

import { focusProps, type CameraFocus } from '@/components/shell/use-map-shell';

const BOUNDS = { north: 32.1, south: 32.0, east: 34.9, west: 34.7 } as const;
const REQUEST = { bounds: BOUNDS, minZoom: 4.65, maxZoom: 8 } as const;

describe('the focus slot as surface props', () => {
  it('is nothing at all before anyone has framed anything', () => {
    // Not `{ focusPlaceIds: undefined }`: `exactOptionalPropertyTypes` is on, and the initial
    // framing (mover 1) must reach the surface with no focus request competing with it.
    expect(focusProps(null)).toEqual({});
  });

  it('becomes focusPlaceIds for a set of pins, and nothing else', () => {
    const focus: CameraFocus = { kind: 'places', ids: ['a', 'b'] };
    const props = focusProps(focus);

    expect(props.focusPlaceIds).toEqual(['a', 'b']);
    expect('focusBounds' in props).toBe(false);
  });

  it('becomes focusBounds for a box, and clears the other prop entirely', () => {
    // The property the collapse rests on. A country tap (mover 5) or near me (mover 8) must leave
    // no `focusPlaceIds` behind for the surface's other effect to re-read; it early-returns on
    // absent, so nothing flies twice.
    const props = focusProps({ kind: 'bounds', request: REQUEST });

    expect(props.focusBounds).toBe(REQUEST);
    expect('focusPlaceIds' in props).toBe(false);
  });

  it('hands the same array object through, so the surface can key the flight on identity', () => {
    // The surface holds the last array it flew for and compares by reference. If this function
    // copied, every re-render would look like a brand-new request and the camera would re-fly on
    // its own — which is the failure the single-slot design exists to make impossible.
    const ids = ['a'];
    const focus: CameraFocus = { kind: 'places', ids };

    expect(focusProps(focus).focusPlaceIds).toBe(ids);
    expect(focusProps(focus).focusPlaceIds).toBe(focusProps(focus).focusPlaceIds);
  });
});
