/**
 * **The region a map with nothing on it opens over** — `W2-5`, `current-state.md` item 8,
 * `ux-map-is-the-query.md` §5, ruled on in `ux-overnight-specs.md` Spec 1 §1.7.
 *
 * `EMPTY_LIBRARY_BOUNDS` was one guessed metro area and its docblock made two claims that were both
 * false: it cited `HOME_LANDING_MIN_ZOOM`, a constant deleted on 2026-08-30, and said an honest fit
 * of the box *"already rests inside the pin band"*, which the zoom ceiling then in force made
 * impossible — the zero-place first screen was a region drawn as two grey capsules with nothing in
 * them.
 *
 * Lives beside the camera tests rather than in `tests/unit/ui/viewport.test.ts` because what is
 * being asserted is the **camera's** contract with that module, and because that file was outside
 * this change's write scope. `viewport.test.ts` still owns the box's own shape, and its
 * `EMPTY_LIBRARY_BOUNDS` docblock still repeats the two false sentences — reported, not edited.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  boundsCentre,
  EMPTY_LIBRARY_BOUNDS,
  withinBounds,
  ZERO_STATE_REGIONS,
  zeroStateBounds,
} from '@/ui/place/viewport';
import { bandForZoom, ZERO_STATE_ZOOM } from '@/components/map/zoom-bands';

describe('the zero-places camera is framed from the browser time zone', () => {
  /** The mechanism §5 chose, and the whole reason it chose it: a zone is a formatting preference
   *  the browser already volunteers, so nothing here costs a permission prompt. */
  it('answers a known zone with its own metro', () => {
    const telAviv = zeroStateBounds('Asia/Jerusalem');
    const centre = boundsCentre(telAviv);
    expect(centre.lat).toBeCloseTo(32.0853, 3);
    expect(centre.lng).toBeCloseTo(34.7818, 3);
    // The legacy alias some browsers still report is the same place, not a miss.
    expect(zeroStateBounds('Asia/Tel_Aviv')).toEqual(telAviv);
  });

  it('answers Tokyo, New York and Sydney with theirs', () => {
    for (const zone of ['Asia/Tokyo', 'America/New_York', 'Australia/Sydney']) {
      const centre = boundsCentre(zeroStateBounds(zone));
      expect(centre).toEqual(ZERO_STATE_REGIONS[zone]);
    }
  });

  /** An unrecognised zone is not a failure and must not be one: it is the fallback, which is the
   *  one region in the table that is never a guess about a particular user. */
  it('falls back for an unknown zone and for no zone at all', () => {
    expect(zeroStateBounds('Antarctica/Troll')).toEqual(EMPTY_LIBRARY_BOUNDS);
    expect(zeroStateBounds('')).toEqual(EMPTY_LIBRARY_BOUNDS);
    expect(zeroStateBounds(null)).toEqual(EMPTY_LIBRARY_BOUNDS);
  });

  /** `null` is what the **server** answers, so the fallback is also the server-rendered value. It
   *  never reaches the DOM as text — it is a prop to a canvas — which is what keeps this a display
   *  default rather than a hydration mismatch and a privacy question at once. */
  it('is the London fallback that a server render produces', () => {
    expect(boundsCentre(EMPTY_LIBRARY_BOUNDS)).toEqual(ZERO_STATE_REGIONS['Europe/London']);
  });

  /** Every region in the table produces the same well-formed, non-degenerate, metro-sized box the
   *  fallback does. A degenerate one would fit at the zoom ceiling on a blank tile, and the rest of
   *  the app treats this value as an ordinary bounds. */
  it('produces a real box for every region it knows', () => {
    for (const zone of Object.keys(ZERO_STATE_REGIONS)) {
      const box = zeroStateBounds(zone);
      expect(box.north).toBeGreaterThan(box.south);
      expect(box.east).toBeGreaterThan(box.west);
      expect(box.north - box.south).toBeLessThan(1);
      expect(box.east - box.west).toBeLessThan(1);
      expect(withinBounds(boundsCentre(box), box)).toBe(true);
    }
  });

  /**
   * **The claim the old docblock got wrong, stated as the thing that is now true.** The zero-state
   * does not fit this box at all: the surface recognises an empty library and rests at
   * `ZERO_STATE_ZOOM`, a fixed metro-scale zoom, over the box's centre. So the extent decides
   * nothing, which is exactly why it is allowed to be an arbitrary ±0.02°.
   */
  it('rests at a fixed metro zoom rather than fitting the box', () => {
    expect(bandForZoom(ZERO_STATE_ZOOM)).toBe('pin');
    const SURFACE = new URL('../../../src/components/map/map-surface.mapcn.tsx', import.meta.url);
    const source = readFileSync(SURFACE, 'utf8');
    expect(source).toContain('latestPlaceCount.current === 0');
    expect(source).toContain('minZoom: ZERO_STATE_ZOOM, maxZoom: ZERO_STATE_ZOOM');
  });

  /** And the page reads the zone rather than the constant — the wiring, without which the table is
   *  a module nothing calls. No permission prompt anywhere on this path. */
  it('is wired through the page with no permission prompt on it', () => {
    const page = readFileSync('src/app/map/map-page-client.tsx', 'utf8');
    expect(page).toContain('zeroStateBounds(browserTimeZone())');
    expect(page).toContain('Intl.DateTimeFormat().resolvedOptions().timeZone');
    // Over the code with the comments stripped: the docblocks here say *"no `navigator.geolocation`"*
    // in as many words, and that sentence is the reason the rule exists rather than a violation of it.
    const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('navigator.geolocation');
  });
});
