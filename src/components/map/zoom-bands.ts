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

/**
 * Where the **home** framing is allowed to come to rest — the whole scale, because the band a
 * library lands in is a fact about the library and not a constant.
 *
 * ## The two reversals this constant has been through, in order
 *
 * **It was a floor first (`HOME_LANDING_MIN_ZOOM = PIN_BAND_MIN + 0.15`), and the owner reversed it
 * on 2026-08-30 after using the shipped behaviour in production.** The floor existed to satisfy
 * §9.3's *"a view of nothing but cluster bubbles is a fail"*: it guaranteed at least one individual
 * pin on the home view. What that guarantee cost, once the home box was the anchor cluster, was
 * that signing back in opened on whatever you saved last — *"I added this Jerusalem Hotel, and
 * after that, when I signed in again, it opened on the Jerusalem Hotel, but I'm not interested in
 * that"*. The home view became the whole library seen from far enough out to read as geography:
 * *"open the map when you see the countries, not last added place."*
 *
 * **That reversal made two changes and only one of them answered the complaint.** Widening the box
 * from the anchor cluster to the whole library is what fixed *"it opened on the Jerusalem Hotel"* —
 * a union is order-independent, which `camera-library-shapes.test.ts` asserts directly, and **that
 * half stays exactly as it is**. Clamping the resting zoom to a *ceiling* inside the area band was
 * a second, separate change, and it is the sole cause of `current-state.md` defect 0a: pins draw at
 * `z >= PIN_BAND_MIN` (8.5), the ceiling was 8.0, so **the home screen of a map product drew zero
 * of the user's places, for every library, at every size.**
 *
 * So the ceiling is gone as of 2026-08-31 (`W2-1`, `ux-overnight-specs.md` Spec 1, recommended by
 * `ux-interaction` as `OQ-1` and accepted by the lead; the owner is being told, because the ruling
 * it partly reverses was one day old). **Removing the ceiling is not restoring the floor**, and the
 * difference is the whole design: a floor forces a minimum zoom and therefore throws the box away,
 * which for a library holding Tel Aviv and Tokyo means `Math.max(2, 8.65)` over the centroid of
 * both — open sea, and worse than either defect. Removing the ceiling lets the box decide and
 * clamps nothing. A one-city library then fits in the pin band and opens on named pins; a
 * three-continent library still fits in the country band and still opens on flag discs. Both are
 * *"the whole library seen from far enough out to read as geography"*, because far enough out is a
 * property of the library.
 *
 * The pin-on-screen guarantee still applies to every mover that is *about* a place — selecting one,
 * a finished import, near-me — none of which read this constant: they frame through
 * `fitTo`/`frameBounds` with their own ranges, and `L1-F5`'s camera tests keep asserting the pin
 * band for them. What is new is that the first load is no longer *excluded* from it.
 *
 * `max` is 15, which is `map-surface.mapcn.tsx`'s own `FIT_BOUNDS_MAX_ZOOM` — the ceiling that stops
 * a one-place box zooming to the rooftops, and the same one every other mover fits under. It is a
 * literal here rather than an import because that constant is private to a module which transitively
 * imports `server-only` and cannot be read from this file or from a test; `zoom-bands.test.ts` pins
 * the two together against the surface's source instead.
 *
 * `min` is 0 rather than a band edge: an overview must be allowed to be a world view. It is a
 * floor only in the arithmetic sense — `settleZoom` applies it with `Math.max`, and no honest fit
 * of real saved places is below it.
 *
 * **The band edge is no longer defended by this constant** — it is defended by `settleZoom`, which
 * is the only thing a camera may consult about a boundary. See its docblock for the rounding hazard
 * the old ceiling was half a band clear of, and how a 0.15 guard window replaces half a band.
 */
export const HOME_LANDING_ZOOM = {
  min: 0,
  max: 15,
} as const;

/**
 * How far a resting camera must stay clear of the pin/area boundary. See `settleZoom`.
 *
 * The same 0.15 `COUNTRY_LANDING_ZOOM` uses against `AREA_BAND_MIN`, and for the same reason: it is
 * a float cushion, wide enough to survive MapLibre's own rounding and narrow enough that resolving
 * a fit into it costs nothing visible.
 */
export const BAND_EDGE_GUARD = 0.15;

/**
 * The zero-places camera: a real neighbourhood, in the pin band, with no pins to draw.
 *
 * A fixed zoom rather than a range, because there is no library to fit and therefore nothing to fit
 * it to. 11 is a metro-scale view — streets, parks and place names on the basemap — which is what
 * *"zero places shows no bare world map: a plausible regional view"* (`current-state.md` §9.3) asks
 * for. The region it is centred on is `zeroStateBounds` in `ui/place/viewport.ts`; nothing about
 * either is ever named on screen.
 */
export const ZERO_STATE_ZOOM = 11;

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

/**
 * **Where a home fit is allowed to settle**, and the only place a camera may consult a band
 * boundary. The same rule `bandForZoom` states for the bands themselves: no caller re-derives this.
 *
 * One rule — anywhere except inside a `BAND_EDGE_GUARD`-wide window around the pin/area boundary,
 * where MapLibre's own rounding decides which of two layers draws. A fit landing in `[8.35, 8.65)`
 * is resolved **outward**, to `8.35`.
 *
 * ## Why outward, and not inward
 *
 * 1. **Zooming out never crops.** `camera-library-shapes.test.ts` asserts that every saved place is
 *    on the visible map at rest, and that is the strongest property the home view has. Resolving
 *    inward zooms in ~11% linearly from a fit that has already spent its 48 px of cosmetic margin,
 *    and on a 390×844 phone that can push the outermost place past the edge. Trading *every place
 *    on screen* for 0.15 of zoom is a bad trade.
 * 2. **It degrades in the direction the old ceiling cared about.** The hazard `COUNTRY_LANDING_ZOOM`
 *    names is a camera landing *accidentally* in the pin band — *"a landing exactly on
 *    `AREA_BAND_MAX` is one rounding away from drawing pins"*. 8.35 is a float cushion below 8.5 and
 *    `easeTo` sets zoom exactly, so that ambiguity is gone in the direction that was dangerous,
 *    without costing the whole band the ceiling used to cost.
 * 3. **A library that only just fits at 8.5 is genuinely better summarised.** 8.5 is defined above
 *    as *"the point a 50 km cluster stops being a useful summary of itself"*; a library needing 8.4
 *    spans more than that, and capsules are the honest answer for it.
 *
 * The residual cost, stated rather than hidden: a library whose natural fit is inside a 0.3-wide
 * window still opens without pins. That is a narrow, nameable window instead of the whole band,
 * which is what defect 0a was.
 *
 * Pure, with no MapLibre dependency, so the rule is testable without a WebGL context.
 */
export function settleZoom(fitZoom: number): number {
  const clamped = Math.min(Math.max(fitZoom, HOME_LANDING_ZOOM.min), HOME_LANDING_ZOOM.max);
  if (clamped >= PIN_BAND_MIN + BAND_EDGE_GUARD) return clamped; // pins, unambiguously
  if (clamped > PIN_BAND_MIN - BAND_EDGE_GUARD) return PIN_BAND_MIN - BAND_EDGE_GUARD; // 8.35
  return clamped; // area or country, unambiguously
}
