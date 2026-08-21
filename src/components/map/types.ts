/**
 * The map surface's port: the shape product logic (places to show, click handling) depends on,
 * with no vendor map-library type crossing this seam (Architect rule — domain/UI code never
 * imports a vendor SDK). `src/components/map/map-surface.tsx` is the swap point that implements
 * this interface; today it re-exports the MapLibre implementation
 * (`map-surface.live.tsx`), and a later task can point it at a mock or a different provider's
 * implementation without any caller of `MapSurface` changing.
 *
 * Deliberately not abstracted here: camera control (`fitBounds`, programmatic pan/zoom beyond the
 * initial view), a marker-clustering contract, or a "loading/error" state for the map itself.
 * `L1-F5` owns camera-mover discipline; until then the surface owns its own camera.
 */

import type { ExtractedCategoryHint } from '@/domain/places/category-hint';
import type { Spot } from '@/domain/places/spot';

/**
 * One pin's worth of data, provider-agnostic. Deliberately flat (`lat`/`lng` rather than a nested
 * point) so this type never has to agree with a vendor's coordinate-order convention — `06` §8's
 * `LngLat` and the domain's `LatLng` each have one, and this type is neither.
 *
 * Field-for-field what the vertical slice's `MockSavedPlace` (`domain/places/fixtures.ts`)
 * already carries; that fixture type is not re-declared here, it is mapped into this shape at the
 * call site, because `MockSavedPlace` is scaffolding for one slice and this is the port every map
 * implementation depends on.
 */
export interface MapPlace {
  readonly id: string;
  readonly name: string;
  readonly category: ExtractedCategoryHint;
  readonly lat: number;
  readonly lng: number;
  readonly note: string;
  readonly sourceUrl: string;
  /**
   * The full `Spot` this pin was built from, for the sheet/panel detail view
   * (`components/sheet/place-sheet.tsx`, `place-desktop-panel.tsx`). Optional and carried
   * end-to-end without being read: neither `MapSurface` (this port's real consumer) nor its three
   * implementations reference it, so the map-surface layer never has to know `Spot` exists — this
   * field only rides along on the same object so the sheet/panel's *next* edit (reading
   * `place.detail?.reason`, `.source?.media`, `.provenance`, etc.) is a one-line addition rather
   * than a rewire of `map-page-client.tsx`'s prop plumbing. Absent for any `MapPlace` not built
   * from a real `Spot` (tests, a future mock surface).
   */
  readonly detail?: Spot;
}

/** Lng-first is deliberately not used anywhere in this file; a bounding box is two `MapPlace`-style
 *  points instead, so a caller never has to know a renderer's axis order to construct one. */
export interface LatLngBoundsHint {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

/**
 * The public contract for a map surface component. Kept minimal on purpose: no camera-mover
 * discipline (`L1-F5`), no per-marker styling hook, no imperative ref/handle — those are all
 * additions a real requirement can motivate later, not scaffolding to pre-build now.
 */
export interface MapSurfaceProps {
  readonly places: readonly MapPlace[];
  /** Called when the user activates a single (non-cluster) pin. Optional: a surface with no
   *  handler still renders and still shows its own default popup/detail, if it has one. */
  readonly onPlaceClick?: (place: MapPlace) => void;
  /** Initial camera hint only — computed once, not kept in sync with `places` after mount. A
   *  surface with no `places` and no hint is free to pick its own default view. */
  readonly initialBounds?: LatLngBoundsHint;
  /**
   * Whether the caller's `lg+` right detail panel (`PlaceDesktopPanel`'s `selected` branch) is
   * currently showing. The map surface owns fitting its camera around its own visible area, but it
   * has no way to know the right panel exists — the persistent left list panel is always present
   * at `lg+` and needs no signal, this one is conditional on selection state the surface doesn't
   * hold. Optional and defaults to "closed" so callers with no desktop panel at all (tests, other
   * surfaces) never have to pass it.
   */
  readonly rightPanelOpen?: boolean;
}
