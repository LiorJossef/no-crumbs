/**
 * The map surface's port: the shape product logic (places to show, click handling) depends on,
 * with no vendor map-library type crossing this seam (Architect rule — domain/UI code never
 * imports a vendor SDK). `src/components/map/map-surface.tsx` is the swap point that implements
 * this interface; today it re-exports the MapLibre implementation
 * (`map-surface.live.tsx`), and a later task can point it at a mock or a different provider's
 * implementation without any caller of `MapSurface` changing.
 *
 * Deliberately not abstracted here: camera control (`fitBounds`, programmatic pan/zoom beyond the
 * initial view) or a "loading/error" state for the map itself. `L1-F5` owns camera-mover
 * discipline; until then the surface owns its own camera.
 *
 * There is no clustering contract, and there is no longer anything for one to describe: density
 * clustering of saved places was removed by owner ruling in `L1-F5-T5`
 * (`docs/06-map-and-places-decision.md` §9.1). Every saved place is its own pin at every zoom, so a
 * surface implementing this port renders `places.length` pins — no merging, no counts.
 */

import type { ProductCategory } from '@/domain/places/product-category';
import type { Spot } from '@/domain/places/spot';
import type { ZoomBand } from './zoom-bands';

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
  /** `null` where none of the three claims resolved. `toPlaceFeatures` turns that into the
   *  `uncategorised` pin key; nothing downstream has to invent a category to draw one. */
  readonly category: ProductCategory | null;
  readonly lat: number;
  readonly lng: number;
  readonly note: string;
  readonly sourceUrl: string | undefined;
  /**
   * Whether the user has said they have been here — `saved_places.visit_state = 'visited'`,
   * flattened to a boolean at the route boundary.
   *
   * On the port rather than read off `detail` (the way `locality` is) because the **pin renderer
   * genuinely needs it**: a place you have been to is drawn at reduced emphasis, which is a
   * decision the symbol layer's paint expression makes per feature. `locality` stays on `detail`
   * precisely because no map implementation has any use for it. Required rather than optional so a
   * surface constructing a `MapPlace` has to answer the question rather than inherit `undefined`
   * as a third state the schema does not have — the column is NOT NULL with a default, so there is
   * always a true answer.
   */
  readonly visited: boolean;
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
 * One area of the library, as the map draws it (`docs/ux-library-at-scale.md` §2.3).
 *
 * Provider-agnostic and flat, like `MapPlace`, so no renderer's coordinate-order convention crosses
 * this seam. Built from the *same* `Area` objects the list renders as `Elsewhere` rows — the map
 * and the list must never derive their geography separately, because the list is the accessible
 * rendering of a canvas a screen reader cannot reach at all (§6).
 */
export interface MapAreaSummary {
  readonly id: string;
  /** The area's own name, or `null` where its members do not agree on one — the marker then shows
   *  the count alone rather than a name we cannot stand behind. */
  readonly label: string | null;
  readonly count: number;
  readonly lat: number;
  readonly lng: number;
}

/** One country of the library, as the map draws it (§2.2). */
export interface MapCountrySummary {
  /** Stable address for the marker and its tap. Not the code: the areas with no country at all are
   *  a real, tappable group, and `null` is not a key. */
  readonly key: string;
  /** ISO 3166-1 alpha-2, or `null` for that group — which renders unflagged rather than absent. */
  readonly countryCode: string | null;
  /**
   * What the marker calls the country, in English.
   *
   * A flag alone is an identification puzzle: it asks the reader to know 250 flags, and where the
   * platform has no flag glyph the disc falls back to a two-letter code, which is worse. The name
   * costs one `text-field` — only the flag itself has to be a bitmap — and it makes the marker say
   * what it is rather than testing whether you can tell.
   */
  readonly label: string;
  readonly count: number;
  /** The mean of the user's own saved places in the country, never a country centroid: the marker
   *  sits where *your* places are, and there is no gazetteer to license. */
  readonly lat: number;
  readonly lng: number;
  /** The extent of the country's areas, which is what a tap on it frames. */
  readonly bounds: LatLngBoundsHint;
}

/**
 * The library summarised, for the two zoom bands above the pins.
 *
 * Optional on the port: a surface given none simply draws pins at every zoom, which is what every
 * surface did before the bands existed and what the mock still does.
 */
export interface MapSummaries {
  readonly countries: readonly MapCountrySummary[];
  readonly areas: readonly MapAreaSummary[];
  /** The country the list is currently showing, which carries the mint ring — at world zoom the map
   *  still says *you are here* while showing everything. The only state colour on a marker. */
  readonly activeCountryKey: string | null;
}

/**
 * The public contract for a map surface component. Kept minimal on purpose: no camera-mover
 * discipline (`L1-F5`), no per-marker styling hook, no imperative ref/handle — those are all
 * additions a real requirement can motivate later, not scaffolding to pre-build now.
 */
export interface MapSurfaceProps {
  readonly places: readonly MapPlace[];
  /** Called when the user activates a pin. Every pin is a single saved place — there is nothing
   *  else on the map to activate. Optional: a surface with no handler still renders and still shows
   *  its own default popup/detail, if it has one. */
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
   * The country and area bands (§2.1). Omitted, a surface draws pins at every zoom.
   */
  readonly summaries?: MapSummaries;
  /**
   * A tap on an area marker. **The same gesture as an `Elsewhere` row tap** and deliberately routed
   * to the same writer in the caller — §2.4 makes it writer 2 and camera mover 4, not a new one, so
   * that "which gestures may change the active area" stays a list of four in one file.
   */
  readonly onAreaClick?: (areaId: string) => void;
  /**
   * A tap on a country marker.
   *
   * Reported rather than acted on here, even though the surface owns the camera, because it *is* a
   * camera move and the enumeration of who may move the camera lives with the caller. It changes no
   * list state: you have chosen a country, not a place, so the sheet keeps saying what it said.
   */
  readonly onCountryClick?: (countryKey: string) => void;
  /**
   * "Frame this box, and come to rest inside this zoom range" — the country tap's camera.
   *
   * A separate mover from `focusPlaceIds` because it needs something that prop cannot express: a
   * zoom **floor** as well as a ceiling. Fitting a country's areas honestly can land anywhere —
   * a country with one saved place is a zero-extent box that fits at the ceiling and drops the user
   * onto a single pin, and a country spanning a continent fits *below* the country band and leaves
   * them looking at the marker they just tapped, apparently unresponsive. §2.4 requires the landing
   * to be inside the area band either way, so that you always arrive on labelled area markers.
   *
   * Passing a **new object identity** requests one flight, exactly as `focusPlaceIds` does.
   */
  readonly focusBounds?: FocusBoundsRequest;
  /**
   * What the map is showing, as a sentence, for the canvas's accessible name.
   *
   * MapLibre labels its own canvas `Map` and marks it `role="region"`, focusable — so a screen
   * reader user tabs into it and is told nothing at all. The canvas contents are unreachable to
   * them either way, so the useful thing it can say is what is on it and that the list beside it
   * is complete; `mapAccessibleName` in `ui/place/active-area.ts` composes that sentence.
   *
   * Omitted leaves MapLibre's own label alone, which is what a surface with no list beside it
   * should do.
   */
  readonly accessibleName?: string;
  /**
   * How much of the surface's own container its bottom sheet covers **at rest**, below `lg`, as a
   * fraction of container height.
   *
   * A fraction and not pixels, because the number has to survive a resize and an orientation
   * change: the surface re-resolves it against the container it actually has at the moment it
   * frames the camera, so the existing re-fit path carries it with no extra wiring.
   *
   * Omitted means `/map`'s sheet, which rests at a fixed peek strip. Pass it when the resting stop
   * is something else — `/collections/[id]` opens at the half stop and stays there, and framing its
   * pins as though 128 px were covered put two of three of them underneath its own sheet.
   *
   * Camera-only, deliberately: it widens the `fitBounds` padding and never the query rect. A place
   * hidden behind a raised sheet is still "in view" for listing purposes
   * (`docs/ux-map-is-the-query.md` §1) — that is the forgiving direction, and `mapOcclusionInsets`
   * spells out why the two consumers part company here.
   */
  readonly restingSheetFraction?: number;
  /**
   * How much of the container this surface's sheet covers **once a place is selected**, as a
   * fraction — the band the camera must keep the selected pin out of.
   *
   * Separate from `restingSheetFraction` because they are different moments. The resting fraction
   * is what the sheet covers all the time and is what a `fitBounds` frames around; this one is what
   * it covers only while a detail is open, which on `/map` is the `half` stop and is four times
   * deeper than the peek strip that surface rests at.
   *
   * **Omitted means no reveal**, which is the right default: a surface that raises nothing when a
   * place is selected has nothing to be revealed from, and a camera that pans on selection anyway
   * would be exactly the unrequested move the pin handler refuses.
   *
   * Camera-only, like the two above, and for the same reason — a pin behind a raised sheet is still
   * in view for listing purposes.
   */
  readonly selectedOcclusionFraction?: number;
  /**
   * How deep a band of floating chrome sits over the **top** of this surface's map, in pixels —
   * the allowance a `fitBounds` has to leave so a fitted pin does not land underneath it.
   *
   * Pixels rather than a fraction (the mirror image of `restingSheetFraction`) because floating
   * chrome is a fixed-height pill: `/map`'s account chip is 44 px and its post-import strip is one
   * row under it, at every viewport height. A sheet is a fraction of the viewport; a chip is not.
   *
   * Omitted means `/map`'s chrome, which is what the surface has always assumed: ~56 px at `lg+`
   * and ~100 px below it, where the post-import confirmation drops to a second row. **Pass `0` when
   * the surface has none.** `/collections/[id]` renders nothing over the top of its map — its list
   * lives entirely in the bottom sheet below `lg` and the left panel at `lg+` — and paying `/map`'s
   * 100 px anyway is what pushed the fit past what a short container can afford: at 640×360 the
   * padding came to 394 px of a 360 px container, the clamp scaled the whole box down, and the
   * lowest pin came to rest under the sheet — measured in a browser, its tip at 163 px against a
   * sheet top of 162 px, and 10 px under at 568×320. A number given here replaces the default at
   * every width, so a surface whose chrome differs by breakpoint should pass the deeper of the two.
   *
   * Camera-only, exactly like the default it replaces: `mapOcclusionInsets` never insets the query
   * rect by top chrome, because deleting a whole viewport-wide band of pins from the list to clear
   * a chip a few hundred pixels wide is the unforgiving direction
   * (`docs/ux-map-is-the-query.md` §1).
   */
  readonly floatingTopChromePx?: number;
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
  readonly onViewportChange?: (bounds: LatLngBoundsHint, meta: ViewportChangeMeta) => void;
}

/**
 * How the camera came to be where it is, reported alongside the rect.
 *
 * This exists because the caller must be able to tell a camera the *user* moved from one that moved
 * itself, and there is no way to recover that after the fact. A `ResizeObserver` re-fit, the initial
 * `fitBounds`, a flight to a selected pin and the post-import flight all emit exactly the same
 * `moveend` as a drag does. Binding anything destructive to the undifferentiated event is what let
 * `21 places in this area` become `9 places in this area` with nobody touching the map
 * (`ui/place/active-area.ts`).
 */
export interface ViewportChangeMeta {
  /**
   * True when the settled camera was **moved by the user** — a drag or a zoom, pointer, touch or
   * keyboard, inertia included. False for every programmatic move: a `ResizeObserver` re-fit, the
   * initial `fitBounds`, a flight to a selected pin, the post-import flight, and the flight a
   * country tap starts.
   *
   * **A user's own zoom counted as `false` until 2026-08-29, and that was right until it was not.**
   * The old rule said zooming out until a second city was on screen must not hand the list to that
   * city — true while the list could only ever be one city, and the flag was the only thing
   * standing between the user and a silent re-scope. The country band changed what a zoom *means*:
   * `ui/place/list-scope.ts` makes the discrete zoom **band** the trigger, so crossing into the
   * country band is the user asking for the whole library and crossing back out is them asking for
   * a place again. A zoom is the only gesture that can cross a band, so reporting it as `false`
   * leaves every transition in that module dead code.
   *
   * What has not changed, and is the whole guard: **it must stay false for every programmatic
   * move.** That is what stops a re-fit or a post-import flight rewriting the list, and it is why a
   * surface cannot answer this from `zoomend` alone — MapLibre fires `zoomend` for `flyTo` and
   * `fitBounds` too, so the user's zoom is the one carrying an `originalEvent`.
   */
  readonly userInitiated: boolean;
  /**
   * The zoom the camera came to rest at, exactly as the surface reports it — not rounded, not
   * clamped to a band edge.
   *
   * Reported alongside `band` rather than instead of it because the two answer different questions:
   * `band` is what is *drawn*, and a caller that wants "how close are we" (a label threshold, a
   * telemetry line) needs the number and must not recover it from the band.
   */
  readonly zoom: number;
  /**
   * Which of the three bands (`zoom-bands.ts`, `docs/ux-library-at-scale.md` §2.1) that zoom lands
   * in — and therefore which layer the user is actually looking at: country pills, area pills, or
   * pins.
   *
   * Here because a caller has to be able to answer the map with something other than a map. When
   * the country band is showing there is nothing on screen a list of *places* corresponds to, so
   * the sidebar has to switch to a country/city view; without this, the page's only options are to
   * re-derive the thresholds itself (a second definition of where a band starts) or to add its own
   * zoom listener (a second camera subscription, on a surface that deliberately has exactly one).
   *
   * Derived with `bandForZoom`, so it moves whenever the constants are tuned.
   *
   * **Independent of `userInitiated`.** A programmatic flight crosses bands just as a pinch does,
   * and the band it lands in is a fact about the map either way. Callers that only want to react to
   * gestures apply their own guard; this field never lies about what is drawn to express one.
   */
  readonly band: ZoomBand;
}

/** A framing request with a zoom range, for `MapSurfaceProps.focusBounds`. */
export interface FocusBoundsRequest {
  readonly bounds: LatLngBoundsHint;
  /** Inclusive floor and ceiling for the resting zoom. Both are required: a range with one open end
   *  is exactly the case that produced the two failures documented on the prop. */
  readonly minZoom: number;
  readonly maxZoom: number;
}
