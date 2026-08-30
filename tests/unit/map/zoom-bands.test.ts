/**
 * `bandForZoom` — the one definition of where a band starts (`docs/ux-library-at-scale.md` §2.1).
 *
 * This exists so that "which band is the camera in" has exactly one answer in the codebase. The
 * page needs it to swap the sidebar to a country/city view when the country band is showing, and
 * the alternative — the page comparing `zoom < 4.5` itself — is a second definition that silently
 * stops agreeing with the layers the first time the constants are tuned on a device.
 *
 * So the assertions below are mostly about the **boundaries**, and they are deliberately written
 * against `COUNTRY_BAND_MAX` / `PIN_BAND_MIN` rather than against 4.5 and 8.5: tuning the numbers
 * must move this file's meaning with them, not break it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  AREA_BAND_MAX,
  AREA_BAND_MIN,
  BAND_EDGE_GUARD,
  bandForZoom,
  COUNTRY_BAND_MAX,
  COUNTRY_LANDING_ZOOM,
  HOME_LANDING_ZOOM,
  PIN_BAND_MIN,
  settleZoom,
  ZERO_STATE_ZOOM,
  type ZoomBand,
} from '@/components/map/zoom-bands';

describe('bandForZoom', () => {
  it('calls the world and the continents the country band', () => {
    expect(bandForZoom(0)).toBe('country');
    expect(bandForZoom(3)).toBe('country');
  });

  it('calls a metro-scale view the area band', () => {
    expect(bandForZoom(5)).toBe('area');
    expect(bandForZoom(8)).toBe('area');
  });

  it('calls a street-scale view the pin band', () => {
    expect(bandForZoom(9)).toBe('pin');
    expect(bandForZoom(18)).toBe('pin');
  });

  /**
   * MapLibre draws a layer when `minzoom <= z < maxzoom`, so a zoom sitting exactly on a shared
   * boundary belongs to the *upper* band in the style — and must belong to it here too. Getting
   * this backwards would report `area` at the exact zoom the pins are drawn at, which is the one
   * way this helper could lie about what is on screen.
   */
  it('gives a boundary zoom to the upper band, exactly as the layers do', () => {
    expect(bandForZoom(COUNTRY_BAND_MAX)).toBe('area');
    expect(bandForZoom(AREA_BAND_MIN)).toBe('area');
    expect(bandForZoom(AREA_BAND_MAX)).toBe('pin');
    expect(bandForZoom(PIN_BAND_MIN)).toBe('pin');
  });

  it('puts the zoom just below a boundary in the lower band', () => {
    expect(bandForZoom(COUNTRY_BAND_MAX - 0.0001)).toBe('country');
    expect(bandForZoom(PIN_BAND_MIN - 0.0001)).toBe('area');
  });

  /** The bands are exhaustive and mutually exclusive: every zoom MapLibre can be at has exactly
   *  one answer, and no zoom has none. That is the property the shared constants exist to give. */
  it('answers every zoom on the scale with exactly one band', () => {
    const seen = new Set<ZoomBand>();
    for (let zoom = 0; zoom <= 24; zoom += 0.25) {
      const band = bandForZoom(zoom);
      expect(['country', 'area', 'pin']).toContain(band);
      seen.add(band);
    }
    expect(seen.size).toBe(3);
  });

  /**
   * §2.4: a country tap must land on labelled *area* markers — never on pins, never back on the
   * country marker it came from. `COUNTRY_LANDING_ZOOM` encodes that with margins; this checks the
   * helper and the clamp still agree about which band those margins are inside.
   */
  it('agrees with the country tap that its landing zoom is in the area band', () => {
    expect(bandForZoom(COUNTRY_LANDING_ZOOM.min)).toBe('area');
    expect(bandForZoom(COUNTRY_LANDING_ZOOM.max)).toBe('area');
  });

  /**
   * **The home framing's range, and the second inversion of this test.**
   *
   * It used to check that the home view rested in the **pin** band — §9.3's *"a non-empty library
   * never settles on a view with no individual pin in it"*. The owner reversed that on 2026-08-30
   * and it became a *ceiling*, asserted to keep the camera **out** of the pin band. That ceiling
   * was `current-state.md` defect 0a, and it is gone as of 2026-08-31 (`W2-1`).
   *
   * What replaces both is neither a floor nor a ceiling: the range spans the whole scale, and the
   * band a library lands in is a fact about the library. So the property left to pin here is that
   * the range *permits* every band, and everything about where a camera actually comes to rest is
   * `settleZoom`'s, below.
   */
  it('lets the home framing reach every band, including the pins', () => {
    expect(HOME_LANDING_ZOOM.max).toBeGreaterThan(PIN_BAND_MIN);
    expect(bandForZoom(HOME_LANDING_ZOOM.max)).toBe('pin');
  });

  /** An overview must be allowed to be a world view: the range reaches the country band and below
   *  it, so a library spread across continents is never clamped back up into one country. */
  it('lets the home framing reach the country band and the world', () => {
    expect(HOME_LANDING_ZOOM.min).toBeLessThan(COUNTRY_BAND_MAX);
    expect(bandForZoom(HOME_LANDING_ZOOM.min)).toBe('country');
  });

  /**
   * `HOME_LANDING_ZOOM.max` is `map-surface.mapcn.tsx`'s private `FIT_BOUNDS_MAX_ZOOM`, written as
   * a literal because that module transitively imports `server-only` and cannot be read from here.
   * The duplication is checked rather than trusted — the same device `camera-model.ts` already uses
   * for the four padding constants — because a ceiling that drifts from the one every other camera
   * mover fits under is invisible until two movers disagree about where a one-place box rests.
   *
   * The country tap is the reason this is now a *seam* test rather than a `<=` between the two
   * landings. Those were one band apart while home had a ceiling; home now rests wherever the
   * library fits, so a country tap zooming *in* from a pin-band home view is correct behaviour and
   * asserting the old ordering would forbid the fix.
   */
  it('holds the same ceiling the place framings fit under', () => {
    const SURFACE = readFileSync('src/components/map/map-surface.mapcn.tsx', 'utf8');
    expect(SURFACE).toContain(`const FIT_BOUNDS_MAX_ZOOM = ${HOME_LANDING_ZOOM.max};`);
    // And the country tap is still clamped strictly inside the area band, which `W2-1` did not
    // touch: §2.4 forbids a country tap landing on pins, whatever the home view does.
    expect(COUNTRY_LANDING_ZOOM.max).toBeLessThan(PIN_BAND_MIN);
  });
});

/**
 * `settleZoom` — the one place a camera is allowed to consult the band boundary.
 *
 * `bandForZoom` answers *which band is this zoom in*; `settleZoom` answers *may a camera come to
 * rest here*. The second question exists because MapLibre's own rounding decides which of two
 * layers draws at a zoom sitting exactly on a shared boundary, so a camera that stops there is a
 * camera whose screen is decided by a float.
 */
describe('settleZoom', () => {
  /** The property, over the whole window and then some. A resting zoom is never strictly inside
   *  `(PIN_BAND_MIN ± BAND_EDGE_GUARD)`, so `bandForZoom` of a settled camera is never ambiguous. */
  it('never comes to rest inside the guard window, at any input', () => {
    for (let zoom = 0; zoom <= 24; zoom += 0.01) {
      const settled = settleZoom(zoom);
      const inside =
        settled > PIN_BAND_MIN - BAND_EDGE_GUARD && settled < PIN_BAND_MIN + BAND_EDGE_GUARD;
      expect(inside).toBe(false);
    }
  });

  /**
   * **Outward, into the area band, and never inward.** Zooming out never crops, and
   * `camera-library-shapes.test.ts` asserts that every saved place is on the visible map at rest —
   * which is the strongest property the home view has. Resolving inward would zoom in from a fit
   * that has already spent its 48 px of cosmetic margin.
   */
  it('resolves a fit inside the window outward', () => {
    const edge = PIN_BAND_MIN - BAND_EDGE_GUARD;
    expect(settleZoom(PIN_BAND_MIN)).toBe(edge);
    expect(settleZoom(PIN_BAND_MIN - 0.01)).toBe(edge);
    expect(settleZoom(PIN_BAND_MIN + 0.1)).toBe(edge);
    expect(bandForZoom(settleZoom(PIN_BAND_MIN))).toBe('area');
  });

  /** Everything outside the window is left exactly as the box fitted it — the zoom is a consequence
   *  of the library, and `settleZoom` is not a second opinion about it. */
  it('leaves an unambiguous fit alone', () => {
    for (const zoom of [0, 2.5, COUNTRY_BAND_MAX, 6, PIN_BAND_MIN - BAND_EDGE_GUARD, 8.65, 12, 15]) {
      expect(settleZoom(zoom)).toBe(zoom);
    }
  });

  /** The range is applied here rather than by the caller, which is what lets the home framing pass
   *  the settled value straight through as a degenerate `minZoom === maxZoom` request. */
  it('clamps into the home range', () => {
    expect(settleZoom(-4)).toBe(HOME_LANDING_ZOOM.min);
    expect(settleZoom(40)).toBe(HOME_LANDING_ZOOM.max);
  });

  /**
   * The six cases of `ux-overnight-specs.md` Spec 1 §1.5, as a table, stated in bands rather than
   * in numbers: what a library of that shape fits at is `camera-library-shapes.test.ts`' business,
   * and what the settled camera then *draws* is this one's.
   */
  it('answers each library shape with the band that shape deserves', () => {
    const cases: readonly (readonly [string, number, 'country' | 'area' | 'pin'])[] = [
      ['3 places in one city', 12.4, 'pin'],
      ['30 places in one city', 10.8, 'pin'],
      ['1 place, fitted to the ceiling', HOME_LANDING_ZOOM.max, 'pin'],
      ['3 places, three cities ~200 km apart', 7.2, 'area'],
      ['3 places in three countries', 2.1, 'country'],
      ['a box that only just fits at the boundary', 8.5, 'area'],
    ];
    for (const [name, fit, band] of cases) {
      expect(`${name}: ${bandForZoom(settleZoom(fit))}`).toBe(`${name}: ${band}`);
    }
  });
});

/**
 * The zero-places camera. A fixed zoom rather than a fit, because there is no library to fit — the
 * region it sits over is `zeroStateBounds` and its extent is a placeholder, so fitting it would
 * make the zoom a function of how wide someone drew a rectangle.
 */
describe('ZERO_STATE_ZOOM', () => {
  /** A real neighbourhood: streets, parks and basemap place names, which is
   *  `current-state.md` §9.3's *"no bare world map: a plausible regional view"*. */
  it('is a metro-scale view, and one no pin layer would be empty at by accident', () => {
    expect(bandForZoom(ZERO_STATE_ZOOM)).toBe('pin');
    expect(settleZoom(ZERO_STATE_ZOOM)).toBe(ZERO_STATE_ZOOM);
    expect(ZERO_STATE_ZOOM).toBeLessThanOrEqual(HOME_LANDING_ZOOM.max);
  });
});
