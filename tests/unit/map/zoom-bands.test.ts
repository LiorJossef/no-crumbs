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
import { describe, expect, it } from 'vitest';

import {
  AREA_BAND_MAX,
  AREA_BAND_MIN,
  bandForZoom,
  COUNTRY_BAND_MAX,
  COUNTRY_LANDING_ZOOM,
  HOME_LANDING_ZOOM,
  PIN_BAND_MIN,
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
   * The home framing's ceiling, and the inversion of what this test asserted until 2026-08-30.
   *
   * It used to check that the home view rested in the **pin** band — §9.3's *"a non-empty library
   * never settles on a view with no individual pin in it"*. The owner used that in production and
   * reversed it: the first load is now the overview, so the constant is a ceiling and the property
   * worth pinning is that the ceiling keeps the camera **out** of the pin band. Stated against
   * `bandForZoom` rather than against 8.5, so tuning the bands moves it.
   */
  it('keeps the home framing out of the pin band', () => {
    expect(bandForZoom(HOME_LANDING_ZOOM.max)).toBe('area');
    expect(HOME_LANDING_ZOOM.max).toBeLessThan(PIN_BAND_MIN);
  });

  /** An overview must be allowed to be a world view: the range reaches the country band and below
   *  it, so a library spread across continents is never clamped back up into one country. */
  it('lets the home framing reach the country band and the world', () => {
    expect(HOME_LANDING_ZOOM.min).toBeLessThan(COUNTRY_BAND_MAX);
    expect(bandForZoom(HOME_LANDING_ZOOM.min)).toBe('country');
  });

  /** The two landings are one band apart by construction — a country tap zooms *in* from the home
   *  view, never out of it. */
  it('rests no further in than a country tap does', () => {
    expect(HOME_LANDING_ZOOM.max).toBeLessThanOrEqual(COUNTRY_LANDING_ZOOM.max);
  });
});
