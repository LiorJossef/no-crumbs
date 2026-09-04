/**
 * **Camera mover 9: tapping a pin flies to it** — owner ruling, 2026-09-02, reversing the rule
 * `map-page-client.tsx` had stated at `onPlaceClick` since the surface grew mover 6.
 *
 * What the reversal does *not* buy is a re-frame. The rule it replaces was guarding a real failure —
 * the map lurching out from under the thumb that tapped it — and mover 3's `fitBounds` under a
 * ceiling of 15 is exactly that lurch: it changes the zoom and discards the scale the user chose. A
 * pin can only be tapped when it is already drawn, and pins are only drawn in the pin band, so the
 * place is on screen already and the honest move is to **recentre and hold the zoom**.
 *
 * That is expressible with no new mechanism: a zero-extent box with `minZoom === maxZoom`, which is
 * the `focusBounds` shape near me (mover 8) already uses — `cameraForBounds` → clamp → `easeTo`,
 * saying *"centre here, rest at exactly this zoom"*. `near-me.test.ts` covers that shape's
 * behaviour; this file covers the pin-tap handler that now produces it.
 *
 * Source assertions, for the reason `reveal-into-flight.test.ts` and `selection-clears-hover.test.ts`
 * both state: this suite runs in node with no renderer and `map-page-client.tsx` cannot be imported
 * at all. The claim each one makes is about the *page*, not about a function it could have called.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');

describe('a pin tap moves the camera', () => {
  it('routes the map surface s pin tap through mover 9', () => {
    expect(PAGE).toContain('onPlaceClick={collectionsScope?.onPlaceClick ?? focusPin}');
    // The rule that was reversed, stated verbatim, so this test fails if it is ever restored
    // without the ruling being revisited.
    expect(PAGE).not.toContain('tapping a pin must not move the camera under the finger');
  });

  it('holds the zoom exactly rather than re-framing', () => {
    const body = PAGE.slice(PAGE.indexOf('const focusPin = useCallback('));
    const call = body.slice(body.indexOf('camera.frameBounds({'), body.indexOf('[camera, selectId],'));
    // A zero-extent box at the place: north === south === lat, east === west === lng. Anything
    // wider is a fit, and a fit is what mover 3 is for.
    expect(call).toContain('north: place.lat, south: place.lat, east: place.lng, west: place.lng');
    // Floor equal to ceiling equal to the zoom already on screen. If these ever differ the camera
    // is allowed to change scale under the tap, which is the failure the old rule named.
    expect(call).toContain('minZoom: zoom');
    expect(call).toContain('maxZoom: zoom');
  });

  it('reads that zoom from the viewport report the page already receives', () => {
    expect(PAGE).toContain('lastZoomRef.current = meta.zoom;');
    expect(PAGE).toContain('const zoom = lastZoomRef.current;');
  });

  it('degrades to mover 3 only when no viewport has been reported', () => {
    const body = PAGE.slice(PAGE.indexOf('const focusPin = useCallback('));
    const fallback = body.slice(0, body.indexOf('camera.frameBounds({'));
    expect(fallback).toContain('if (zoom === null) {');
    expect(fallback).toContain('camera.framePlaces([place.id]);');
  });

  it('still clears the highlight channel, because it selects through selectId', () => {
    const body = PAGE.slice(PAGE.indexOf('const focusPin = useCallback('));
    expect(body.slice(0, body.indexOf('const zoom'))).toContain('selectId(place.id);');
    // The invariant `selection-clears-hover.test.ts` owns: exactly one place clears the hover, and
    // mover 9 must not have become a second one.
    expect((PAGE.match(/setHoveredId\(null\)/g) ?? [])).toHaveLength(1);
  });

  it('leaves the list its own mover, which does need a fit', () => {
    // A row may name a place that is off-screen or in another zoom band, so mover 3 stays a fit.
    expect(PAGE).toContain('camera.framePlaces([place.id]);\n  }');
    expect(PAGE).toContain('onSelect={selectPlace}');
  });

  it('leaves a collections view moving no camera at all', () => {
    // `collectionsScope.onPlaceClick` still wins the `??`, so a collection pin is unaffected and
    // mover 6 is still the only thing that answers it.
    expect(PAGE).toContain('collectionsScope?.onPlaceClick ??');
  });
});

describe('the mover list stays complete', () => {
  it('counts nine', () => {
    expect(PAGE).toContain('**The authorised camera movers, and there are exactly nine.**');
    expect(PAGE).toContain('9. **Tapping a pin flies to it**');
  });
});
