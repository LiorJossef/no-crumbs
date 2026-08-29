/**
 * The three zoom bands the library is drawn in — country, area, place
 * (`docs/ux-library-at-scale.md` §2.1).
 *
 * | Zoom | On the map |
 * |---|---|
 * | `z < COUNTRY_BAND_MAX` | country markers: flag disc + saved-place count |
 * | `AREA_BAND_MIN ≤ z < AREA_BAND_MAX` | area markers: the area's own name + count |
 * | `z ≥ PIN_BAND_MIN` | individual pins, as they have always been |
 *
 * **MapLibre owns the swap.** These are `minzoom`/`maxzoom` on the layers, so no zoom listener
 * exists, no React state changes on zoom, and nothing re-renders as the user pinches. A layer is
 * drawn when `minzoom <= z < maxzoom`, so sharing one number between a band's ceiling and the next
 * band's floor is what makes the three bands exhaustive and mutually exclusive at once — there is
 * no zoom at which two of them draw, and none at which none of them does.
 *
 * The numbers are here rather than inline in a layer definition because they are the one thing in
 * §2.1 expected to be tuned on a device. 4.5 and 8.5 are the spec's starting values: at z8.5 a
 * phone viewport is roughly one metro area, which is the point a 50 km cluster stops being a useful
 * summary of itself.
 */

/** Above this the country band gives way to the area band. */
export const COUNTRY_BAND_MAX = 4.5;

export const AREA_BAND_MIN = COUNTRY_BAND_MAX;
export const AREA_BAND_MAX = 8.5;

export const PIN_BAND_MIN = AREA_BAND_MAX;

/**
 * Where a country tap is allowed to leave the camera (§2.4).
 *
 * Tapping a country must land on **labelled area markers** — never on an empty map, and never on
 * pins. Fitting a country's areas without a clamp does both: one area of one place is a zero-extent
 * box, which `fitBounds` answers by zooming to its ceiling, and the user arrives at a single pin
 * having been promised a country. A tall country fitted honestly lands below the area band and
 * shows the country marker they just tapped, unchanged.
 *
 * So the landing zoom is clamped strictly *inside* the area band rather than to its edges. The
 * margins are what keep it inside after MapLibre's own rounding: a fit that came to rest exactly on
 * `AREA_BAND_MAX` would draw pins, which is the one outcome §2.4 forbids by name.
 */
export const COUNTRY_LANDING_ZOOM = {
  min: AREA_BAND_MIN + 0.15,
  max: AREA_BAND_MAX - 0.5,
} as const;

/** Which of the three bands a zoom falls in. */
export type ZoomBand = 'country' | 'area' | 'pin';

/**
 * The band a resting camera is in — the one definition of where a band starts.
 *
 * Callers outside this file must never re-derive this from the constants: a page that compares
 * `zoom < 4.5` itself is a second definition, and the numbers above are the ones §2.1 expects to be
 * tuned on a device. Tuning them must move every consumer at once.
 *
 * The comparisons mirror MapLibre's own `minzoom <= z < maxzoom`, so this returns exactly the band
 * whose layer is drawn at that zoom — including on the shared boundaries, where the higher band
 * wins in both places.
 */
export function bandForZoom(zoom: number): ZoomBand {
  if (zoom >= PIN_BAND_MIN) return 'pin';
  if (zoom >= AREA_BAND_MIN) return 'area';
  return 'country';
}
