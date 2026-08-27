/**
 * `ui/place/viewport.ts` — the map's query rect as geometry. Since the list became an area rather
 * than a rectangle (`docs/ux-stable-area-list.md`), these two functions only ever answer "which of
 * the user's areas is this camera over", never "what is in the list".
 */

import { describe, expect, it } from 'vitest';

import { boundsCentre, withinBounds } from '@/ui/place/viewport';

const LONDON = { north: 51.6, south: 51.4, east: 0.1, west: -0.3 };

describe('withinBounds', () => {
  it('accepts a point inside and rejects one outside', () => {
    expect(withinBounds({ lat: 51.5119, lng: -0.1276 }, LONDON)).toBe(true);
    expect(withinBounds({ lat: 32.0704, lng: 34.7796 }, LONDON)).toBe(false);
  });

  it('includes the edges', () => {
    expect(withinBounds({ lat: 51.6, lng: 0.1 }, LONDON)).toBe(true);
    expect(withinBounds({ lat: 51.4, lng: -0.3 }, LONDON)).toBe(true);
  });

  it('handles a rect straddling the antimeridian, where east < west', () => {
    const straddling = { north: 10, south: -10, east: -170, west: 170 };
    expect(withinBounds({ lat: 0, lng: 179 }, straddling)).toBe(true);
    expect(withinBounds({ lat: 0, lng: -179 }, straddling)).toBe(true);
    expect(withinBounds({ lat: 0, lng: 0 }, straddling)).toBe(false);
  });
});

describe('boundsCentre', () => {
  it('averages a normal rect', () => {
    const centre = boundsCentre(LONDON);
    expect(centre.lat).toBeCloseTo(51.5, 10);
    expect(centre.lng).toBeCloseTo(-0.1, 10);
  });

  it("keeps a straddling rect's centre on the near side of the globe", () => {
    expect(boundsCentre({ north: 10, south: -10, east: -170, west: 170 })).toEqual({
      lat: 0,
      lng: 180,
    });
  });
});
