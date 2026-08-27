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
  readonly sourceUrl: string | undefined;
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
   * The currently-selected place, lifted by the caller (`map-page-client.tsx`). At `lg+` the map
   * surface uses this to anchor a pin-attached popup with the place's detail directly on the map
   * (Google Maps-style info card) — the desktop composition no longer has a right-hand detail
   * panel for the surface to avoid, see the retired `rightPanelOpen` prop this replaced. Below
   * `lg`, the mobile `PlaceSheet` is the only detail surface; a surface may still receive this
   * prop there but must not render its own popup under the `lg` breakpoint.
   */
  readonly selected?: MapPlace | null;
  /** Called when the surface's own popup close affordance is used. Optional: a surface with no
   *  popup (or no handler) simply never calls it. */
  readonly onDeselect?: () => void;
  /**
   * "Frame exactly these places, now" — the one *explicit* camera mover this port exposes.
   *
   * It exists because of what an import used to look like: you paste a London TikTok, eight
   * places save correctly, and the map stays exactly where it was (Tel Aviv), with nothing on
   * screen saying anything happened. The saved rows were real and completely invisible.
   *
   * Passing a **new array identity** requests one camera flight to the bounding box of the
   * matching places. Ids that are not (yet) in `places` are ignored, so a caller may set this in
   * the same tick as a data refresh — the flight happens once the places actually arrive.
   *
   * Deliberately not "fit whatever `places` currently is": that is what the surface used to do on
   * every data change, and after an import it framed Tel Aviv *and* London together, which is a
   * view of the Mediterranean. The initial framing is still automatic; every later camera move is
   * requested through this prop.
   */
  readonly focusPlaceIds?: readonly string[];
  /**
   * "This is what is on screen now" — the surface reporting its **query rect** so the caller can
   * make the map the query (`docs/ux-map-is-the-query.md` §1). Optional: a surface with no handler
   * simply never calls it, and a surface that cannot compute one (the mock) never implements it.
   *
   * What is reported is the *query rect*, not the raw canvas bounds: the visible map inset by the
   * chrome that permanently covers it at rest — the sheet's peek height below `lg`, the list
   * panel's width at `lg+`. A place whose pin sits under the sheet is not "in view", and reporting
   * the whole canvas would put rows in the list that the user cannot see.
   *
   * **When it fires:** once when the map first settles (so the caller has a rect before the user
   * touches anything — a list that starts empty reads as a broken feature), on every `moveend`
   * with a 120 ms trailing debounce (§4: the list settles, it never tracks a moving thumb), and on
   * resize, because the insets are viewport-dependent. Deliberately **not** on `move`, on `render`,
   * or per frame. Dragging the sheet emits no camera event and therefore reports nothing, which is
   * §1 rule 2: looking at the list must never change the list.
   *
   * The reported longitudes are whatever the camera unprojects to and are **not wrapped** into
   * [-180, 180]. Callers should test containment with MapLibre's `LngLatBounds.contains()` rather
   * than comparing raw numbers, per §1's antimeridian note.
   */
  readonly onViewportChange?: (bounds: LatLngBoundsHint) => void;
}
