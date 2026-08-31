'use client';

/**
 * Client seam between the map (`MapSurface`, an uncontrolled imperative surface) and the surfaces
 * that present saved places around it: `PlaceSheet` (mobile, a three-stop drag sheet,
 * `src/components/sheet/place-sheet.tsx`), `PlaceDesktopPanel` (`lg+`, the persistent left list,
 * always showing the list — `src/components/sheet/place-desktop-panel.tsx`), and now the map
 * surface itself, which renders a pin-anchored popover with the selected place's detail at `lg+`
 * (`MapSurfaceMapcn`'s `MapPopup`). `selected` is lifted here rather than into `map/page.tsx` (a
 * server component) or down into the map, because it is the one piece of state the map's pin-tap
 * callback and every presentation surface needs — per `docs/ux-architecture.md` §1.5, this state
 * is client-only and never a URL in this slice.
 *
 * All three surfaces render unconditionally and switch on Tailwind breakpoints alone (`lg:hidden` /
 * `hidden lg:block`) rather than a JS media-query hook, so there is no hydration-mismatch risk and
 * no behavioural branching here — below `lg` only `PlaceSheet` shows detail; at `lg+` only the
 * map's own popover does, and `PlaceDesktopPanel` never reacts to `selected` at all.
 *
 * `query` (L1-F6-T2) is lifted here for the same reason and a sharper one: it filters the **pins**
 * as well as the list. A search that narrowed the sheet while the map went on showing all twenty
 * pins would be worse than no search at all — the two surfaces would be answering different
 * questions about the same library. So the filter is applied exactly once, here.
 * `domain/places/search.ts` owns what matches.
 *
 * `activeTag` is lifted here for exactly that reason and no other. It is a **second filter
 * dimension**, not text written into `query`; `src/ui/place/tag-filter.ts` carries the argument,
 * and the short version is that a tag is a second dimension, not text.
 *
 * `notBeenOnly` (`L1-F12`) is the **third**, on the same argument: "been" is a fact about the
 * user's own saved row, not a word that might appear in a note, and it is dismissed on its own.
 * Composition is AND — tag, then visit state, then search, then the active area for the list only —
 * and the order between the first three cannot change the result. None of the three is a camera
 * mover.
 *
 * ## The list is a scope, not a rectangle (`docs/ux-stable-area-list.md`, `ux-library-at-scale.md`)
 *
 * This file owns a second, prior narrowing, and 2026-08-28 changed what it narrows *by*. The list
 * used to be "every saved place whose pin is inside the map's query rect". The owner used that and
 * rejected it: `21 places in this area` became `9 places in this area` with nobody touching the
 * map, because the camera moves for reasons the user never asked for — inertia, a `ResizeObserver`
 * re-fit, a `fitBounds` once the container finally measures, a flight to a pin. A row that left was
 * gone, and the only way back was to reproduce a camera position by hand.
 *
 * The coupling was right; the granularity was wrong. **The unit of scope is a place, not a
 * rectangle**: an *area* is a ~50 km coordinate cluster of the user's own saves. Pan and zoom
 * freely inside one and nothing changes at all. Cross into another of your areas with a real
 * gesture and the list switches, which is the only moment it may.
 *
 * **2026-08-29 added the level above it.** One anchor was the right answer while the map only drew
 * pins; it became the wrong answer the day the map grew a country band. At world zoom the screen
 * says `United Kingdom 18` and `Israel 14`, no single city is on it, and the list underneath went
 * on saying `18 places in London` — describing a place the map had stopped showing. So the scope is
 * now three states rather than one anchor (`global` | `country` | `area`), the country band writes
 * it, and the only camera-driven transition is the **discrete** one: `scopeAfterCameraSettled`
 * switches on the zoom *band*, which is the same thing MapLibre swaps layers on, so a pan of any
 * size inside one band is still a no-op down to object identity. `ui/place/list-scope.ts` owns
 * every rule; this file owns the state and the wiring.
 *
 * **The one rule: narrowing never navigates.** The search box and the tag chip narrow what is
 * listed and can never move the camera or change the active area. That is why the settled-search
 * camera flight is gone from this file: searching `tel aviv` from London now reads
 * `No matches in London` with `Tel Aviv-Yafo · 8 matches ›` directly beneath it, one tap away,
 * instead of throwing the camera across the Mediterranean on a 450 ms timer.
 *
 * There are therefore three derived lists here and they are deliberately not the same one:
 *
 *  - **`matches`** — the library narrowed by the filters the user set (the tag chip, the
 *    `Not been yet` chip, then the search box). This is what the **pins** show, everywhere, so a
 *    pin never disappears for being off screen when being off screen is exactly what panning back
 *    would fix.
 *  - **`inScope`** — `matches` that belong to the current scope, in library order (most recently
 *    saved first). This is what the **list** shows, and its order never changes on pan, zoom or
 *    resize. Under a global scope it is every match, which is the point: the list and the country
 *    band are then two renderings of one library.
 *  - **`places`** — the whole library, used to build the areas and for the initial camera anchor.
 *    Its count is displayed nowhere.
 *
 * **The initial camera frames the whole library**, and this paragraph used to say the opposite.
 * Anchoring on one area was the answer to a real defect — fitting every saved place put 12 London
 * and 9 Tel Aviv places into one box, i.e. a continental view of Europe and North Africa with no
 * individual pins and no readable name — and the owner rejected it in production on 2026-08-30,
 * because the anchor is the cluster holding the *most recent save*: signing back in opened on
 * whatever you had added last. The box is now the union of the areas' boxes, which is
 * order-independent, and the resting zoom is whatever that box honestly fits at
 * (`components/map/zoom-bands.ts`, `HOME_LANDING_ZOOM` and `settleZoom`, where both reversals are
 * written down). `domain/places/clusters.ts` still groups on coordinates (never on the `locality`
 * string — the library holds four spellings for two cities), and `anchorCluster` survives as
 * `preferredAreaId`'s fallback for the *list*, never as a camera.
 *
 * `showImport` is the same pattern one level up: "Add a TikTok" (in both `PlaceSheet` and
 * `PlaceDesktopPanel`) used to be a `router.push('/import')` — a real route change that unmounts
 * the map entirely, which is glaring at desktop widths where `/import` has no map behind it to
 * float over. `ImportPageClient` now renders as an overlay sibling here instead, so the map stays
 * mounted (and its camera untouched, L1-F1-T4) exactly like place detail already does. The real
 * `/import` route (`src/app/import/page.tsx`) is untouched and still renders the same component
 * directly for a mid-import refresh or direct navigation (L1-F2-T3's resume requirement) — this is
 * a second entry point onto the same client component, not a replacement for the route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapPlace } from '@/components/map/map-surface';
import { MapShell } from '@/components/shell/map-shell';
import { useMapShell } from '@/components/shell/use-map-shell';
import type { SheetStop } from '@/components/shell/sheet-geometry';
import type { MapSummaries } from '@/components/map/types';
import { COUNTRY_LANDING_ZOOM } from '@/components/map/zoom-bands';
import type { LatLngBoundsHint, ViewportChangeMeta } from '@/components/map/types';
import { ImportConfirmation } from '@/components/map/import-confirmation';
import { NearMeControl } from '@/components/map/near-me-control';
import { NearMeDistancesContext } from '@/components/map/near-me-context';
import { distanceOrigin, nearMeCamera, nearMeNotice, type UserFix } from '@/components/map/near-me';
import { useNearMe } from '@/components/map/use-near-me';
import { PlaceSheet, SHEET_HALF_FRACTION } from '@/components/sheet/place-sheet';
import { PlaceDesktopPanel } from '@/components/sheet/place-desktop-panel';
import { filterByTag, filterByVisit, filterPlaces } from '@/components/map/filter-places';
import { categoryFacets, filterByCategory, toggleCategory } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import { TagFilterContext, isSameTag, type TagFilter } from '@/ui/place/tag-filter';
import { AnnounceContext, SILENT, latestSpoken, type Announcer } from '@/ui/place/announce';
import { clusterByProximity, pickAnchorCluster } from '@/domain/places/clusters';
import { buildAreas, mapAccessibleName } from '@/ui/place/active-area';
import {
  activeCountryKey as ringedCountryKeyFor,
  GLOBAL_SCOPE,
  resolveScopeOrFallback,
  scopeAfterCameraSettled,
  scopeAreaId,
  scopeForAreaTap,
  scopeForCountryTap,
  scopeHeading,
  scopeLabel,
  type ListScope,
} from '@/ui/place/list-scope';
import { distancesFromUser, nearestArea, nearestFirst } from '@/ui/place/nearby';
import { meanCentroid, unionBounds } from '@/domain/places/country-bucket';
import { summariseByCountry } from '@/ui/place/library-summary';
import { zeroStateBounds } from '@/ui/place/viewport';
import { ImportPageClient, type SaveOutcomeDetail } from '@/app/import/import-page-client';
import { AddSheetHost } from '@/components/add/add-sheet-host';
import { CollectionsContext, type CollectionsForPlace } from '@/ui/place/collections-context';

/** How long the typing has to settle before the result count is announced to a screen reader.
 *  Without it a `polite` live region reads a new count on every keystroke, which is worse than
 *  silence — the user cannot hear the field they are typing into. */
const ANNOUNCE_AFTER_MS = 500;

/**
 * What the canvas calls itself when there is nothing saved yet.
 *
 * Sentence case, one clause, no promise: it says what is there and what is not, which is all a
 * screen-reader user can act on from a surface they cannot reach. `voice-and-vocabulary.md` — no
 * exclamation mark, no banned word, and the product name is not one of this string's business.
 *
 * **Declared here rather than beside `mapAccessibleName`** (`ui/place/active-area.ts`), which is
 * where it belongs: that module composes every other sentence about the canvas, and a second
 * declaration site is how two surfaces come to describe the same map differently. It is here
 * because `active-area.ts` is outside this change's write scope tonight and a drive-by edit to a
 * file another agent may be holding is worse than a well-marked temporary home. Move it, with its
 * one call site, when `active-area.ts` is next open.
 */
const EMPTY_MAP_ACCESSIBLE_NAME = 'A map. Nothing saved yet.';

/**
 * How long the import overlay will wait for the saved places to reach `places` before uncovering
 * the map anyway — `W6-7`'s floor.
 *
 * The overlay is held so the map is revealed *into* the post-import flight rather than before it,
 * and the release condition is the refreshed rows arriving. `router.refresh()` is a server round
 * trip and can be slow, fail, or return rows that do not contain what was saved. Without this the
 * confirm screen would sit there for the life of the page and an import that had **succeeded**
 * would look hung. Two seconds is well past a warm refresh and short of reading as a stall.
 */
const REVEAL_HOLD_MAX_MS = 2000;

/**
 * The browser's own IANA time zone, or `null` where there is no browser.
 *
 * The **only** location signal this page ever reads, and it is not a location: it is a formatting
 * preference the browser already volunteers to every page, it identifies a metro at best, and it is
 * used for one thing — which region a map with nothing on it opens over (`zeroStateBounds`). No
 * permission prompt, no IP lookup, no `navigator.geolocation`; `ux-map-is-the-query.md` §5 chose
 * this mechanism over all three for exactly that reason, and `L1-F11`'s locate control stays the
 * one place the product ever asks where the user is.
 *
 * `null` on the server, which is correct rather than degraded: the value never reaches the DOM as
 * text, so the two renders agree on everything React compares. It is a prop to a canvas.
 */
function browserTimeZone(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // A browser with no ICU data at all. The fallback region is the honest answer, not a crash on
    // the first screen a new account ever sees.
    return null;
  }
}

export function MapPageClient({
  places,
  collections,
  revealPlaceId,
}: {
  places: readonly MapPlace[];
  /** The caller's editable collections and what is already in them. Passed to a context rather
   *  than down through props for the same reason `TagFilterContext` exists: one of the three hosts
   *  of `PlaceDetail` lives inside the map surface, which must not learn what a collection is. */
  collections: CollectionsForPlace;
  /**
   * One saved place to open on arrival, handed over by the create menu on a tab that has no map of
   * its own (`components/nav/bottom-nav.tsx`). Absent on every other way in.
   *
   * It is a **handoff, not state**: consumed once, the URL is rewritten to `/map` in the same
   * breath, and a reload restores no selection — so `ux-architecture.md` §1.5's "selection is
   * client-only and never a URL in this slice" still holds for everything the user does on this
   * page. It exists because the route boundary is a document boundary: `/collections` and
   * `/profile` unmount this tree, so a picked or newly saved place has no other way to travel, and
   * arriving on the whole map with no camera move and no detail open is indistinguishable from the
   * tap having done nothing.
   */
  revealPlaceId?: string;
}) {
  /**
   * The **id** of the open place, never the object.
   *
   * Holding the `MapPlace` itself made the detail view a snapshot: a Server Action calls
   * `revalidatePath('/map')`, `places` arrives as a fresh array of fresh objects, the list re-renders
   * — and the popover keeps rendering the copy it captured when the pin was tapped. Measured
   * 2026-08-28: changing a place's category updated its row to `Bar` while the open panel went on
   * saying `Dessert` until the user reselected it. The same staleness was there for the note and for
   * anything else a Server Action writes; the category editor is only what made it visible.
   *
   * Deriving from `matches` rather than from `places` also retires a render-phase `setSelected(null)`
   * that existed to close the detail when a filter removed its place: a place that is not in
   * `matches` now simply has no `selected` to render.
   */
  /**
   * **Where the sheet rests while nothing is open, decided once on arrival** — `peek` for a
   * library with something in it, `half` for one with nothing.
   *
   * The zero-places screen is the one this page cannot afford to get wrong: photographed at
   * 390×844 with an empty library, the peek strip collapses to the single line
   * `Your map starts here. ⌃`, so the sentence explaining what to do and the `Add a TikTok` button
   * underneath it are both *inside* the sheet and invisible. The only visible way forward on a
   * phone was the `＋` in the tab bar. At `half` all three are on screen and in the thumb zone,
   * which is what `ux-map-is-the-query.md` §5 asked for and what
   * `ux-overnight-specs.md` Spec 3's layer 3 specifies.
   *
   * **A `useState` initialiser rather than a plain `places.length === 0`**, and that is the whole
   * of the care here. This value has two consumers that must never disagree: `useMapShell`
   * snapshots it at mount (it seeds `snap` and `previousStop`, and nothing re-seeds them), while
   * `MapShell` reads it on every render for the camera's bottom budget
   * (`restingSheetFractionFor`). A live expression would flip to `peek` the moment the first
   * import lands while the sheet itself was still resting at `half` — the camera would then frame
   * the places it just saved for a 128 px strip and put them behind a sheet covering 55% of the
   * viewport, which is camera mover 6's defect arriving by the back door. Snapshotting keeps the
   * two halves of one fact in agreement for the life of the page, and the sheet does not jump
   * under a user who has just imported.
   */
  const [restingStop] = useState<SheetStop>(() => (places.length === 0 ? 'half' : 'peek'));
  const shell = useMapShell({ restingStop });
  const { selectedId, setSelectedId } = shell;
  const [showImport, setShowImport] = useState(false);
  /**
   * The `＋` sheet. Owner's ruling, 2026-08-29: `＋` opens the same create menu everywhere, so this
   * page no longer sends that button straight into the TikTok overlay — the choice between a place
   * and a collection is made inside the sheet, where it can be seen.
   *
   * Held here rather than inside `BottomNav` because the sheet needs this page's library to search
   * and this page's camera to fly afterwards, and because the import overlay it can hand off to is
   * this page's state too.
   */
  const [addOpen, setAddOpen] = useState(false);
  /**
   * **Which row the pointer is on** — the row↔pin coupling (`W3-2`, `facelift-plan.md` §3a:
   * *"pins and rows are the same object"*). Lifted here because it is produced by the list and
   * consumed by the map, and this page is the only thing that holds both.
   *
   * **It is not a ninth camera mover and must never become one.** The list above enumerates the
   * eight, and the rule that keeps that list meaningful is that anything moving the camera is on
   * it. This moves no camera: pointing at a row is not asking to go there, and a map that flew
   * every time a pointer crossed a row would be unusable with a mouse. It changes two paint
   * properties and draws one extra symbol.
   *
   * No throttle. Hover changes at human rate and `setState` with an identical value bails out
   * before rendering, so the guard would cost more than it saves.
   */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** The one tag narrowing the library, as stored (lowercase, normalised), or `null`. Set by a chip
   *  in any place's detail view through `TagFilterContext`, cleared by the pill above the list, by
   *  tapping the same chip again, or by starting an import. */
  const [activeTag, setActiveTag] = useState<string | null>(null);
  /**
   * The been / not-been narrowing (`L1-F12`): show only what is still outstanding.
   *
   * A third filter dimension rather than a tag or a query, for the same reason `activeTag` is one —
   * "been" is a fact about the user's own row, not a word that might appear in a note, and it is
   * dismissed on its own. Lifted here, like the other two, because it narrows the **pins** as well
   * as the list; a filter that emptied the list while twenty-five pins stayed on the map would be
   * two surfaces answering the same question differently.
   *
   * Not a camera mover. Turning it on can leave an area with nothing in it, and the answer to that
   * is a written heading (`ALL_BEEN_HEADING`), never a flight somewhere else.
   */
  const [notBeenOnly, setNotBeenOnly] = useState(false);
  /**
   * What the last import saved. Two jobs, both of which the flow was missing entirely: it frames
   * the camera on the places that were just added (`camera.framePlaces`), and it is the only thing on
   * screen that says the import worked. Cleared on dismissal, and also when a new import starts,
   * so a stale "8 places added" can never sit over a fresh run.
   */
  const [lastImport, setLastImport] = useState<SaveOutcomeDetail | null>(null);
  /**
   * **The places an import just saved, held while the map catches up** — `W6-7`, the last beat of
   * the demo.
   *
   * The sequence without this: the user confirms, `ImportPageClient` hands the outcome up, requests
   * the flight and closes itself — all synchronously, in one commit. But the flight cannot happen
   * yet. `focusPlaceIds` is guarded on the ids actually being present in `places`
   * (`map-surface.mapcn.tsx`), and `places` only changes when `router.refresh()`'s round trip
   * lands. So the overlay unmounted, the map was revealed **sitting exactly where it had been**,
   * and a few hundred milliseconds later it set off. Confirm, then a still map, then a flight: three
   * beats where the product means one.
   *
   * Holding the ids here makes the overlay wait for the same condition the surface waits for, so
   * the map is uncovered **into** the flight rather than before it. Effects run children-first, so
   * on the commit where the refreshed rows arrive the surface's focus effect flies and this page's
   * then lets the overlay go — in that order, without either knowing about the other.
   */
  const [pendingReveal, setPendingReveal] = useState<readonly string[] | null>(null);
  /**
   * The same ids, as a ref, and both are needed rather than one.
   *
   * `onClose` fires in the *same synchronous handler* as `onSaved`, before React has re-rendered,
   * so the state above is not yet visible to it — a close that read state would always see `null`
   * and would always close. The ref is written in the handler and read in the handler. The state
   * exists because the release below has to re-run when `places` changes, which a ref cannot do.
   */
  const pendingRevealRef = useRef<readonly string[] | null>(null);
  /**
   * The one thing that moves the camera after the initial framing.
   *
   * **One slot, held by the shell** (`components/shell/use-map-shell.ts`), where it used to be two
   * on this page — `focusPlaceIds` for the movers that frame a set of pins and `focusBounds` for
   * the two that frame a box inside a zoom range. The map keys each flight on the *identity* of
   * what it is handed, so whoever writes last wins and a re-render that changes nothing cannot
   * re-fly; across two cells that was a property of the order two effects ran in rather than of the
   * state. `camera.framePlaces` and `camera.frameBounds` are the two ways to write it, and every
   * mover below goes through one of them.
   *
   * **The authorised camera movers, and there are exactly eight.** `06` §9.2 listed four, this file
   * grew to seven, and `docs/ux-stable-area-list.md` cut it back — the reconciliation `06` §9.2 was
   * owed is this comment. It said *five* until 2026-08-29 while a sixth was already running and
   * documented in `map-surface.mapcn.tsx`, and it said *six* until `L1-F11` while mover 7 was
   * already written thirty lines below it — which is exactly the drift a list like this exists to
   * stop: a list of who may move the camera is only worth having if it is complete, wherever the
   * mover happens to live. In the order they run:
   *
   *  1. The initial framing — **the whole library**, come to rest wherever that box honestly fits
   *     and never inside the guard window around the band boundary (`settleZoom`), so a one-metro
   *     library opens on its own named pins and a three-continent library opens on flag discs. It
   *     falls back to `EMPTY_LIBRARY_BOUNDS` when there is nothing saved at all. It framed the
   *     *anchor area* inside the pin band until 2026-08-30, which meant signing back in opened on
   *     whatever you saved last; the owner reversed that after using it — and that reversal also
   *     clamped the resting zoom below the pin band, which drew none of the user's places at all
   *     and was undone on 2026-08-31. See `initialBounds`, and `zoom-bands.ts` for both.
   *  2. A finished import flies to the places it saved.
   *  3. Selecting a place from the list flies to that place, and **holds** the scope. It frames
   *     into the band the *raised* sheet leaves visible, not into the whole viewport — the surface
   *     reads `selected` for that, which is why 3 and 6 are one padding rule rather than two.
   *  4. Tapping an `Elsewhere` row — or the map's own area marker, which is the same gesture — flies
   *     to that area, and sets an **area** scope by hand.
   *  5. Tapping a country marker frames that country's areas, clamped inside the area band, and
   *     sets a **country** scope. See `focusCountry`.
   *  6. Selecting a place raises the sheet to `half`, so the camera offsets itself by the fraction
   *     of the viewport the sheet is about to cover — otherwise the pin just tapped comes to rest
   *     behind it. It lives in the surface (`map-surface.mapcn.tsx`, `selectedOcclusionFraction`)
   *     because only the surface knows the projection, but it is a mover and belongs on this list.
   *     It is the *pin-tap* case: when a framing request (2, 3, 4, 7) is issued in the same commit
   *     that one wins, because the nudge can only measure where the pin is now.
   *  7. Revealing one saved place — a manual add, or a pick out of the `＋` sheet's search. See
   *     `revealSavedPlace`.
   *  8. Near me (`L1-F11`): an explicit tap on the map's locate control, once a position comes
   *     back, flies to the user's own point and sets an **area** scope. See `goToUserLocation`. A
   *     denial, a timeout or an unsupported browser moves nothing at all — there is no camera path
   *     out of this mover that does not start with a real position.
   *
   * Three are gone, all of them for the same reason — narrowing must never navigate. A settled
   * search no longer flies to its matches, clearing the search no longer returns to a cluster, and
   * `Show my places` / `Show all matches` no longer exist: the state they escaped (a viewport with
   * nothing in it) cannot occur when the list is an area rather than a rectangle. What is *not* a
   * camera mover, and must never become one: panning, zooming, typing, and tapping a tag chip.
   *
   * One mover was **removed** by `L1-F11`: `MapControls`' own `showLocate` button flew the camera
   * from inside the registry component at a hard-coded zoom, which is a mover this list could never
   * have accounted for. It is off, and mover 8 replaces it.
   */
  const { camera } = shell;

  /**
   * **What the list is a list of** — the whole library, one country of it, or one ~50 km area
   * (`ui/place/list-scope.ts`, which owns every rule below and is where the argument lives).
   *
   * `null` means "nothing chosen yet" and is not a fourth state: it selects the page's own default
   * — **global** since 2026-08-30, matching the overview the camera now opens on — and it exists
   * only so that default can stay a *derivation* rather than an effect that paints one frame of the
   * wrong list first.
   *
   * An `area` scope still holds the id of a place inside the area rather than a cluster index —
   * clusters are rebuilt on every library change and carry no id of their own, so an anchor place
   * survives an import landing in the area and a deletion from it. A `country` scope holds a
   * `CountrySummary.key`, stable in the same way.
   *
   * **Six writers**, and they are the movers enumerated on the camera slot plus the camera itself: the
   * default resolution, an `Elsewhere`/area-marker tap (4), a country-marker tap (5), a finished
   * import (2), near me (8), and a settled *user gesture that crossed a zoom band or an area
   * boundary*. It is never re-derived from settled bounds alone, which is what stops the camera
   * rewriting the list on its own.
   */
  const [scope, setScope] = useState<ListScope | null>(null);
  /** The category chip, if one is pressed. A fourth filter dimension, lifted here for the same
   *  reason the other three are: it narrows the **pins** as well as the rows, and a list of four
   *  cafés over a map of thirty-one everything is worse than no filter at all. */
  const [activeCategory, setActiveCategory] = useState<ProductCategory | null>(null);

  /** Every cluster in the library. Keyed on `places`, so an import re-clusters once rather than on
   *  every render. */
  const clusters = useMemo(
    () =>
      clusterByProximity(places, (place) => place, {
        // The same projection `buildAreas` takes three lines below. Without it the grouping is
        // geometry alone, which merges every city inside 50 km: the owner's library reported
        // `4 places in תל אביב-יפו` over a set holding Rishon LeZion and Ra'anana.
        toLocality: (place: MapPlace) => place.detail?.locality ?? null,
      }),
    [places],
  );

  /** The clusters as *areas* — labelled, indexed by member id, memoised once per library so the
   *  header's city name is stable for the session rather than recomputed per render. */
  const areas = useMemo(
    () =>
      buildAreas(clusters, {
        toId: (place: MapPlace) => place.id,
        toPoint: (place: MapPlace) => place,
        toLocality: (place: MapPlace) => place.detail?.locality ?? null,
      }),
    [clusters],
  );

  /**
   * Where the camera opens. The cluster holding the most recently saved place, else the largest —
   * never the box around all of them. `places` arrives `created_at desc` from `getSpots`, so
   * `places[0]` is the most recent save.
   *
   * There is no persisted last-camera hint yet; `pickAnchorCluster` accepts one and the resolution
   * order in `ux-map-is-the-query.md` starts with it, but persisting a camera across sessions is a
   * separate decision about storing a user's location in their browser, and it is not this task's
   * to take quietly.
   */
  const anchorCluster = useMemo(() => {
    const recentId = places[0]?.id;
    return pickAnchorCluster(clusters, {
      ...(recentId ? { recentItemId: recentId } : {}),
      toId: (place: MapPlace) => place.id,
    });
  }, [clusters, places]);

  /**
   * **What the surface opens on: the whole library**, and — for a library with nothing in it — a
   * designed regional view rather than nothing at all.
   *
   * It was `anchorCluster?.bounds` until 2026-08-30, i.e. the area holding the most recent save,
   * and the owner rejected that in production: *"I added this Jerusalem Hotel, and after that, when
   * I signed in again, it opened on the Jerusalem Hotel, but I'm not interested in that... So on
   * mobile and on desktop."* The home view is now the overview — *"open the map when you see the
   * countries, not last added place"* — which the surface lands by fitting **this box**, and the
   * band it comes to rest in is whatever the box honestly fits at. The same reversal also clamped
   * that fit below the pin band, which meant no library ever opened on a place of its own; the
   * clamp was undone on 2026-08-31 and the box was not, because the box is what answered the
   * complaint. `zoom-bands.ts` carries the argument.
   *
   * The union of the **areas'** boxes rather than of the raw places, so it is the same geometry the
   * area and country markers are drawn from and cannot disagree with them by a place the clustering
   * dropped. `unionBounds` returns an inverted box for an empty input, which is why the guard is on
   * `areas.length` and not on the result.
   *
   * `anchorCluster` outlives the change because `preferredAreaId` still needs it — it is now only
   * the list's *fallback* after a deletion, never a camera.
   *
   * Passing `undefined` here used to fall all the way through to MapLibre's constructor default,
   * which is the whole globe at zoom 0 over the Atlantic: §9.3's *"zero places shows no bare world
   * map"* criterion. `zeroStateBounds` is the designed answer to it — a regional map framed from
   * the browser's own time zone, which is the mechanism `ux-map-is-the-query.md` §5 chose precisely
   * because it costs no permission prompt, no IP lookup and no `navigator.geolocation` call.
   */
  const initialBounds = useMemo(
    () =>
      areas.length > 0
        ? unionBounds(areas.map((area) => area.bounds))
        : zeroStateBounds(browserTimeZone()),
    [areas],
  );

  /**
   * The library's areas bucketed into countries — the top level of `ux-library-at-scale.md` §2's
   * geography, and the **one** computation the map's world-zoom band and the list's `Elsewhere`
   * section both read. Two call sites deriving "the countries" separately is how they come to
   * disagree, and the list is the accessible rendering of a canvas nothing else can reach.
   *
   * Above the filters, not below them, because the scope resolves against it: a country scope has
   * to name a country of the *library*, never one of whatever the search box left.
   *
   * Keyed on `areas`, so it costs nothing on a keystroke, a pan or a chip tap.
   */
  const countries = useMemo(
    () =>
      summariseByCountry(
        areas,
        (place: MapPlace) => place.detail?.countryCode ?? null,
        (place: MapPlace) => place,
      ),
    [areas],
  );

  /** The page's default area: the one holding the most recently saved place, which is also the one
   *  the camera opens on. Where the scope falls back to when what it named has been deleted. */
  const preferredAreaId = useMemo(() => {
    const seed = anchorCluster?.members[0]?.id;
    if (seed === undefined) return null;
    return areas.find((area) => area.memberIds.has(seed))?.id ?? null;
  }, [areas, anchorCluster]);

  /**
   * The scope as stored, with the page's default filled in while nothing has been chosen.
   *
   * **The default is global**, and it is the list's half of the 2026-08-30 home-view reversal: the
   * camera now opens on the whole library, and a header reading `1 in Jerusalem` over a view of
   * countries is the same broken control the owner rejected when a country tap left the list
   * behind. `fallbackScope`'s anchor area is still the answer for a *deleted* scope — that is
   * `resolveScopeOrFallback` below, which keeps taking `preferredAreaId`.
   */
  const storedScope = useMemo(() => scope ?? GLOBAL_SCOPE, [scope]);

  /**
   * **The scope resolved against the library as it is right now** — the areas, the places and the
   * country it names, or the fallback when it names something that has just been deleted.
   *
   * Derived during render rather than in an effect: a stored scope going stale is exactly React's
   * "a prop invalidated some state" case, and deriving it costs no frame of the wrong list.
   *
   * The fallback is **derived and never written back**, and that is the fix for a real defect. An
   * anchor that does not resolve has two causes that look identical here: the place was deleted, or
   * the place was just saved and the refreshed rows have not landed yet. `onSaved` writes the new
   * place's anchor optimistically and `import-page-client` calls it *before* `router.refresh()`, so
   * there is always at least one render where the anchor names a row `areas` does not hold yet.
   * Persisting the fallback in that render replaced the import's own anchor with the previously
   * active area permanently — a correct pin under a header naming a city the place is not in. The
   * camera already handles this correctly by waiting for the data rather than guessing.
   *
   * Leaving the store alone costs nothing for the deletion case: the dead anchor keeps rendering as
   * this same fallback, and the next explicit scope change overwrites it.
   */
  const listScope = useMemo(
    () => resolveScopeOrFallback(areas, countries, storedScope, preferredAreaId),
    [areas, countries, storedScope, preferredAreaId],
  );

  /** The one area the list is about, or `null` under a country or global scope — where several are
   *  listed at once and there is no single one for `Elsewhere` to subtract. */
  const activeAreaId = scopeAreaId(listScope);

  /** The library narrowed by the active tag chip, before the search box sees it. Its own `useMemo`
   *  rather than one fused expression so that typing does not re-run the tag pass and tapping a
   *  chip does not re-run it per keystroke. */
  const tagMatches = useMemo(() => filterByTag(places, activeTag), [places, activeTag]);

  /** The tag-narrowed library, narrowed again to what is still outstanding. Before the search box
   *  and after the chip purely so each pass memoises on its own input; the three compose as AND and
   *  the order between them cannot change the result. */
  const visitMatches = useMemo(
    () => filterByVisit(tagMatches, notBeenOnly),
    [tagMatches, notBeenOnly],
  );

  /** The same library narrowed to one category. Its own pass for the same memoisation reason as
   *  the two above; the four compose as AND and their order cannot change the result. */
  const categoryMatches = useMemo(
    () => filterByCategory(visitMatches, activeCategory, (place) => place.category),
    [visitMatches, activeCategory],
  );

  /** The library narrowed by **every** filter. This is what the **pins** show — never narrowed by
   *  the scope, which would be circular. The list is this same array narrowed once more by the
   *  scope, so the pins and the rows can never disagree about what the filters did. */
  const matches = useMemo(() => filterPlaces(categoryMatches, query), [categoryMatches, query]);

  /**
   * The chips, counted over the library narrowed by **every other filter but this one**.
   *
   * That is what makes each count a true statement of what pressing the chip produces rather than
   * a fact about the whole library, and it is why the search pass has to be applied here by hand:
   * `matches` has the category filter already in it, so counting over it would show every chip but
   * the pressed one at zero.
   *
   * `activeCategory` is pinned in so a pressed chip cannot vanish underneath the user when the
   * combination it is part of empties — a filter whose only escape has scrolled out of existence
   * is a trap. At zero it says "this combination has nothing in it", which is the honest reading.
   */
  const facets = useMemo(
    () =>
      categoryFacets(filterPlaces(visitMatches, query), (place) => place.category, activeCategory),
    [visitMatches, query, activeCategory],
  );

  /** The same set, as ids — read by the `Elsewhere` counts and by the camera, which must frame what
   *  the filter left rather than what the area holds. */
  const matchIds = useMemo(() => new Set(matches.map((place) => place.id)), [matches]);

  /**
   * What the **list** shows: the matches that belong to the current scope, in library order — most
   * recently saved first.
   *
   * The order is the library's and never the camera's. The nearest-the-centre sort this replaced
   * was a child of the viewport binding: distance from a map centre is not a fact about the world,
   * and re-ordering rows under a pan is the same instability as removing them, one row at a time.
   * Distance belongs to near-me (`L1-F11`), where it is distance from *you*.
   *
   * Under a global scope `memberIds` is every saved place, so this is `matches` — no branch, and no
   * "no area yet" special case for the frame before the library resolves.
   */
  const inScope = useMemo(
    () => matches.filter((place) => listScope.memberIds.has(place.id)),
    [matches, listScope],
  );

  /**
   * Which country's marker carries the mint ring at world zoom.
   *
   * `null` under a global scope, and that is the point rather than a gap: with the whole library
   * listed, no single country is the one you are in, and ringing one would contradict the list
   * directly under it.
   */
  const activeCountryKey = useMemo(
    () => ringedCountryKeyFor(listScope, countries),
    [listScope, countries],
  );

  /**
   * The same summary, in the map port's own shape (`components/map/types.ts`).
   *
   * Mapped here rather than derived in the surface, so the map and the list are two renderings of
   * one computation — §2's opening claim, and the thing that makes the band accessible: a canvas is
   * unreachable by a screen reader and the list beside it has to carry the identical geography.
   * The port's types are flat and provider-agnostic, so no map implementation ever learns what an
   * `Area` is.
   */
  const summaries = useMemo<MapSummaries>(
    () => ({
      countries: countries.map((country) => ({
        key: country.key,
        countryCode: country.countryCode,
        label: country.label,
        count: country.count,
        lat: country.centroid.lat,
        lng: country.centroid.lng,
        bounds: country.bounds,
      })),
      areas: areas.map((area) => ({
        id: area.id,
        label: area.label,
        count: area.count,
        // The area's marker sits at the mean of its own places, the same rule the country's does —
        // never the centre of its bounding box, which for an L-shaped city is in the sea.
        ...(meanCentroid(area.points) ?? { lat: 0, lng: 0 }),
      })),
      activeCountryKey,
    }),
    [countries, areas, activeCountryKey],
  );

  /**
   * Everything the scope leaves out, in library order — the plain continuation that replaced the
   * `Elsewhere` section (owner ruling 2026-08-30, `docs/ux-stable-area-list.md`:114).
   *
   * `matches` minus `inScope`, so it is narrowed by exactly the filters the rows above it are and
   * can never name a place the map is not drawing. Empty under a global scope by construction,
   * which is what removes the guard the peek row's `+N more` used to need.
   */
  const otherPlaces = useMemo(
    () => matches.filter((place) => !listScope.memberIds.has(place.id)),
    [matches, listScope],
  );

  // Both narrowings feed the header's noun, so a tag-filtered list reads `3 matches in London`
  // rather than `3 places in London`. `ux-map-is-the-query.md` §2.2's string matrix says the noun
  // changes "exactly when a second filter is applied"; a chip is a second filter, and no new string
  // is invented for it.
  /** Library-wide, not list-wide: the `Not been yet` chip narrows the map as well as the list, and
   *  the map draws every match. */
  const libraryHasVisited = useMemo(() => places.some((place) => place.visited), [places]);

  const heading = useMemo(
    () =>
      scopeHeading({
        scope: listScope,
        countInScope: inScope.length,
        searchQuery: query.trim(),
        tagLabel: activeTag === null ? null : tagDisplayLabel(activeTag),
        notBeenOnly,
        matchesAnywhere: matches.length,
      }),
    [inScope, listScope, query, activeTag, notBeenOnly, matches],
  );

  // The canvas is unreachable to a screen reader, so the honest thing for it to say is what it is
  // showing and that the list beside it is complete. Same `where` the heading uses, so the two can
  // never describe different places.
  //
  // Except over a library with nothing in it, where that sentence is a small lie told twice.
  // `scopeLabel` answers `your library` for the empty global scope and the count is 0, so the
  // canvas announced `Map of your saved places in your library. The list below names all 0.` over
  // a map that has no saved places and a list that names nothing. `EMPTY_MAP_ACCESSIBLE_NAME` is
  // one clause, states a fact, and stops claiming a library. See
  // `ux-overnight-specs.md` Spec 3 §3.7 — it is that spec's one new string, offered because the
  // alternative is a false one.
  const canvasName = useMemo(
    () =>
      places.length === 0
        ? EMPTY_MAP_ACCESSIBLE_NAME
        : mapAccessibleName(heading, scopeLabel(listScope)),
    [heading, listScope, places],
  );

  // The open place, resolved against the *current* server data on every render — which is what makes
  // an edit visible in the panel the user made it in. See `selectedId`.
  //
  // Resolved against `matches`, not `places`, and that carries a behaviour that used to be a
  // render-phase `setSelected(null)`: a place filtered out by a **filter** must not stay open, since
  // its pin is gone from the map and the detail would be showing something the user can no longer
  // see or dismiss by tapping. Now it simply does not resolve.
  //
  // Deliberately `matches` and NOT `inScope`: crossing into another area would otherwise slam the
  // open detail shut mid-gesture, which is the map taking something away from the user for looking
  // somewhere else.
  const selected: MapPlace | null =
    selectedId === null ? null : (matches.find((place) => place.id === selectedId) ?? null);

  const filterAnnouncement = useResultAnnouncement(query, activeTag, notBeenOnly, matches.length);

  /**
   * The page's one spoken line, and the ordering rule that lets two writers share it.
   *
   * The filter sentence and a been/not-been mark both change the list silently, so both belong in
   * the single `role="status"` region below rather than in two regions that would interleave. A
   * ticket is claimed when the user acts and presented when the sentence is ready, so a slow
   * request can never overwrite a newer one — `src/ui/place/announce.ts` has the argument.
   */
  const [spoken, setSpoken] = useState(SILENT);
  const ticketRef = useRef(0);
  const announcer = useMemo<Announcer>(
    () => ({
      begin: () => ++ticketRef.current,
      say: (ticket, message) => setSpoken((current) => latestSpoken(current, ticket, message)),
    }),
    [],
  );

  // The debounced filter sentence, pushed through the same channel so there is one order between
  // the two writers rather than two independent ones. It takes its ticket at the moment it settles,
  // which is the moment the *user's* typing produced it.
  useEffect(() => {
    announcer.say(announcer.begin(), filterAnnouncement);
  }, [filterAnnouncement, announcer]);

  /** Camera mover 3. A fresh array each time, because the flight is keyed on array identity — so
   *  re-selecting the same place does fly again. The active area is deliberately not touched. */
  function selectPlace(place: MapPlace) {
    setSelectedId(place.id);
    camera.framePlaces([place.id]);
  }

  /**
   * Writer 2 and camera mover 4: the only gesture that picks an area by hand, from an `Elsewhere`
   * row or from the map's own area marker (§2.4 — the marker is this writer, not a new one).
   *
   * **It frames the places the filter left**, not the area's whole membership. Tapping an area
   * marker under a search used to fly the camera to a box around all eighteen London places while
   * the list showed one row; the camera and the list were answering different questions. It falls
   * back to the whole area when the filter has left nothing there, because an empty box frames
   * nothing at all.
   *
   * It recorded the area you came from until 2026-08-30, and cleared the country-group overrides.
   * Both existed for the `Elsewhere` section — the one to open the country you had just left, the
   * other to stop a stale toggle surviving the switch — and both went with it.
   */
  const selectArea = useCallback(
    (areaId: string) => {
      const area = areas.find((candidate) => candidate.id === areaId);
      if (!area) return;
      const matching = area.members.filter((place) => matchIds.has(place.id));
      setScope(scopeForAreaTap(area.id));
      setSelectedId(null);
      camera.framePlaces((matching.length > 0 ? matching : area.members).map((place) => place.id));
    },
    [areas, matchIds, camera, setSelectedId],
  );

  /**
   * **Camera mover 5, and a writer of the scope** — tapping a country marker frames that country's
   * areas *and* makes the list a list of that country.
   *
   * It is its own arm of the focus slot rather than a reuse of `framePlaces` because it needs a zoom **floor** as
   * well as a ceiling: §2.4 requires the camera to come to rest inside the area band, so that a
   * country tap always lands on labelled area markers and never on an empty map or on pins.
   *
   * **This comment used to argue the opposite, and the owner reversed it on 2026-08-29.** It said
   * the tap moved the camera and *nothing else* — "you have chosen a country, not a place, so the
   * sheet keeps saying exactly what it said" — and called that asymmetry the point of §2.4's
   * two-tap path. The owner used it and rejected it: tapping `United Kingdom 18` and landing on a
   * list still headed `14 places in Tel Aviv-Yafo` reads as a broken control, not as a deliberate
   * two-tap path. A country is now a scope the list can be in (`ui/place/list-scope.ts`), which is
   * what makes the tap expressible at all — the old model had one anchor and no way to say
   * "this country".
   *
   * It clears the selection for the same reason writer 2 does: the open place may be in another
   * country entirely.
   */
  const focusCountry = useCallback(
    (key: string) => {
      const country = countries.find((candidate) => candidate.key === key);
      if (!country) return;
      setScope(scopeForCountryTap(country.key));
      setSelectedId(null);
      camera.frameBounds({
        bounds: country.bounds,
        minZoom: COUNTRY_LANDING_ZOOM.min,
        maxZoom: COUNTRY_LANDING_ZOOM.max,
      });
    },
    [countries, camera, setSelectedId],
  );

  /**
   * **Camera mover 8, and a writer of the scope** — near me (`L1-F11`).
   *
   * Called once per successful fix, from inside `useNearMe`'s geolocation callback, so the only
   * thing that can reach it is a tap that produced a real position. A denial, a timeout or a
   * browser without the API never arrive here at all: those are states the control renders, not
   * cameras.
   *
   * **It writes the scope for the same reason a country tap does.** The flight is programmatic, so
   * `handleViewportChange` reports `userInitiated: false` and changes nothing — meaning without
   * this write the camera would land on your street while the list underneath went on saying
   * `18 places in London`. That is the broken control the owner rejected on 2026-08-29, and near-me
   * would be a second door into it.
   *
   * **It writes nothing when you have saved nothing near here.** `nearestArea` returns `null`
   * beyond ~50 km, and the honest answer is then the one the control says out loud (`Nothing saved
   * near you yet`): the camera still moves, so you can see for yourself that there is nothing, and
   * the list keeps the area you were looking at rather than being handed one you are not in.
   *
   * The selection is cleared like movers 4 and 5 clear it — the open place is very likely somewhere
   * else entirely. Filters are deliberately **not** cleared: this is not an import, and "not been
   * yet" plus near-me is the whole sentence the feature is for.
   */
  const goToUserLocation = useCallback(
    (fix: UserFix) => {
      const area = nearestArea(areas, fix.point);
      if (area !== null) setScope(scopeForAreaTap(area.id));
      setSelectedId(null);
      camera.frameBounds(nearMeCamera(fix));
    },
    [areas, camera, setSelectedId],
  );

  const nearMe = useNearMe(goToUserLocation);

  /** Where the user is, as far as the browser told us — `null` for every state but a held fix. */
  const userPoint = nearMe.state.status === 'located' ? nearMe.state.fix.point : null;

  /** The area they are standing in, or `null` when nothing they saved is within reach. Read by the
   *  control's notice; the camera mover above computes its own, because it must not depend on a
   *  render having happened. */
  const userArea = useMemo(
    () => (userPoint === null ? null : nearestArea(areas, userPoint)),
    [areas, userPoint],
  );

  /**
   * **The one origin any distance on screen is measured from** (`L1-F11-T2`).
   *
   * `null` unless a real, accurate-enough fix is being held, so a refusal, a revocation, a timeout
   * and a 3 km indoor fix all remove the distances rather than recomputing them against something
   * that is not the user. There is deliberately no fallback to the map centre: distance from a
   * camera is not a fact about the world, and the sort that used to do it is what
   * `docs/ux-stable-area-list.md` removed.
   */
  const distances = useMemo(() => {
    const origin = distanceOrigin(nearMe.state);
    return origin === null ? null : distancesFromUser(origin, inScope);
  }, [nearMe.state, inScope]);

  /** The list, nearest first while a fix is held — and `inScope` by identity the rest of the time,
   *  which is every render before anyone presses the control. */
  const listed = useMemo(
    () => (distances === null ? inScope : nearestFirst(inScope, distances)),
    [inScope, distances],
  );

  /** What the control says when it cannot do what it looks like it does, or when it worked and the
   *  answer is that there is nothing here. `null` while there is nothing to say. */
  const nearMeNoticeText = nearMe.noticeDismissed
    ? null
    : nearMeNotice(nearMe.state, userArea !== null);

  /**
   * The camera's own writer, and the only one.
   *
   * Two guards, both in `scopeAfterCameraSettled`. `userInitiated` is the first: every programmatic
   * camera move reports `false`, so a re-fit, the initial framing, a flight to a pin and the flight
   * a country tap just started structurally cannot rewrite what the tap wrote. The **band** is the
   * second: the only camera-driven transition switches on `bandForZoom`, the same discrete number
   * MapLibre swaps layers on, so a pan of any size that stays in one band changes the scope only by
   * the 50 km cluster rule that already existed. That is the owner's "do not refilter on every
   * small map pan" (ruling 5, reaffirmed 2026-08-29) as a property of the state machine rather than
   * a threshold someone has to tune.
   */
  /** Declared above `handleViewportChange`, which writes the first of them: the surface reports
   *  its viewport before this component's later hooks are reached. */
  const [cameraAlive, setCameraAlive] = useState(false);
  /** A ref, not state: it is spent exactly once and nothing renders from it. */
  const pendingRevealId = useRef<string | null>(revealPlaceId ?? null);

  const handleViewportChange = useCallback(
    (bounds: LatLngBoundsHint, meta: ViewportChangeMeta) => {
      // The first report is also the only signal this page gets that the map instance exists — it
      // arrives through an imperative handle, on a commit that does not re-render the surface. See
      // `revealPlaceId`'s effect, which cannot fly the camera before it.
      setCameraAlive(true);
      setScope((current) =>
        scopeAfterCameraSettled({
          scope: current ?? GLOBAL_SCOPE,
          zoom: meta.zoom,
          userInitiated: meta.userInitiated,
          areas,
          countries,
          rect: bounds,
        }),
      );
    },
    [areas, countries],
  );

  /**
   * A chip tap. The active tag turns the filter off, any other tag replaces it — one tap either
   * way, which is the whole interaction.
   *
   * **It deselects, and that is the point.** The chip lives in a place's detail view, so without
   * this the user taps `Hidden Gem` and keeps looking at the one place they already had open while
   * the answer to what they just asked sits behind it. Deselecting drops them onto the filtered
   * list on mobile and closes the map popover on desktop. It is a state change, not a camera
   * change: `setSelected(null)` touches no camera mover, and neither does `setActiveTag`.
   */
  const toggleTag = useCallback(
    (tag: string) => {
      setActiveTag((current) => (current !== null && isSameTag(current, tag) ? null : tag));
      setSelectedId(null);
    },
    [setSelectedId],
  );

  const clearTag = useCallback(() => setActiveTag(null), []);

  /** A category chip. Pressing the pressed one clears, pressing any other replaces — the same one
   *  tap either way the tag chips give, so the product does not hold two state models for one
   *  gesture. It does **not** deselect: unlike a tag chip, this control is in the list itself, so
   *  the answer to what was just asked is already the thing on screen. */
  const toggleCategoryFilter = useCallback((category: ProductCategory) => {
    setActiveCategory((current) => toggleCategory(current, category));
  }, []);

  /** The been/not-been narrowing, on or off. Unlike a tag chip this does **not** deselect: the
   *  control lives in the list's own header rather than inside a place's detail, so there is no
   *  open place standing between the user and the answer they just asked for. */
  const toggleNotBeen = useCallback(() => setNotBeenOnly((current) => !current), []);

  /** Memoised so every chip in the tree does not re-render on an unrelated state change — the
   *  context value is the only thing standing between this page's state and a leaf in the map's
   *  own popover. */
  const tagFilter = useMemo<TagFilter>(
    () => ({ activeTag, onToggleTag: toggleTag }),
    [activeTag, toggleTag],
  );

  /** A link handed over from the `＋` sheet, so the overlay opens with it already typed. `null`
   *  for every other way in, which is the standalone paste screen's own empty start. */
  const [importSeedUrl, setImportSeedUrl] = useState<string | null>(null);

  function openImport(seedUrl: string | null = null) {
    // Guarded, not just typed: the surfaces that offer this as a plain `() => void` prop can pass
    // it straight to `onClick`, which TypeScript accepts and React then calls with the mouse event.
    setImportSeedUrl(typeof seedUrl === 'string' ? seedUrl : null);
    setLastImport(null);
    // An import that lands places the current filters exclude would save them into an invisible
    // list and fly the camera at pins that are filtered out. Starting an import is the user leaving
    // the current narrowing behind, so every dimension goes with it.
    setQuery('');
    setActiveTag(null);
    // A fresh import always lands as not-been, so this one cannot hide what was just saved. It is
    // cleared anyway: starting an import is the user leaving the current narrowing behind, and
    // leaving one of three filters on after the other two go is the kind of half-state nobody can
    // explain from the screen.
    setNotBeenOnly(false);
    setShowImport(true);
  }

  /**
   * Camera mover 7, and writer 4: **show me this one place**, whether it was just written by a
   * manual add or picked out of the `＋` sheet's search.
   *
   * It clears the filters for the identical reason `openImport` clears them — a place revealed into
   * a narrowing that excludes it lands in an invisible list under a camera flying at a pin that is
   * filtered out, and `selected` is derived from `matches`, so a filtered-out place has no detail
   * to open at all. `activeCategory` goes too, which `openImport` predates: a manual add takes its
   * category from the provider, so a `Bar` chip would hide a café nobody could see they had added.
   *
   * The three writes at the end are the same three the import path already makes, in the same
   * order: the list scope, the camera, the selection. Selecting is what names a manual save back to
   * the user — the row came from a provider match they did not pick off a list, so the detail card
   * opening on it *is* the confirmation, and Remove is one tap inside it.
   */
  function revealSavedPlace(savedPlaceId: string) {
    setQuery('');
    setActiveTag(null);
    setNotBeenOnly(false);
    setActiveCategory(null);
    setScope(scopeForAreaTap(savedPlaceId));
    camera.framePlaces([savedPlaceId]);
    setSelectedId(savedPlaceId);
  }

  /**
   * The `?place=` handoff, spent (see the `revealPlaceId` prop).
   *
   * **Why it waits for `cameraAlive`.** The surface's focus effect early-returns when
   * `mapRef.current` is still null and has no reason to run again — the instance arrives through an
   * imperative handle, on a commit that re-renders nothing — so a framing requested during this
   * page's first render is dropped for good. The first viewport report is proof the instance exists.
   *
   * The URL is rewritten before the reveal, through `history.replaceState` rather than
   * `router.replace`: the App Router integrates with it (`linking-and-navigating.md`), and a real
   * navigation here would re-render the page and fight the camera it is about to move. An id that
   * is not in the library — a deleted place, a link someone kept — clears the URL and does nothing
   * else, which is the honest answer to "that place is not yours".
   */
  /**
   * **Let the overlay go the moment the flight can happen, and not before.**
   *
   * The condition is deliberately the *same* one `map-surface.mapcn.tsx`'s focus effect uses — the
   * saved ids being present in `places` — because the point is that the two happen together.
   * Effects run children-first within a commit, so the surface flies and then this uncovers it.
   *
   * **And a floor under it, for the same reason the pin landing has one.** `router.refresh()` can
   * fail, be slow, or return rows that do not include what was saved (a filter, a race, an RLS
   * result nobody predicted). Without a timeout the confirm screen would sit there for the life of
   * the page with no way out but the ✕ — the import would look hung at the exact moment it had in
   * fact succeeded. Two seconds is well past a warm refresh and short enough not to read as a
   * stall; when it fires, the map is revealed the old way, which is a worse beat and not a broken
   * one.
   */
  useEffect(() => {
    if (pendingReveal === null) return;
    const release = () => {
      pendingRevealRef.current = null;
      setPendingReveal(null);
      setShowImport(false);
    };
    if (pendingReveal.some((id) => places.some((place) => place.id === id))) {
      release();
      return;
    }
    const timer = setTimeout(release, REVEAL_HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [pendingReveal, places]);

  useEffect(() => {
    const id = pendingRevealId.current;
    if (id === null || !cameraAlive) return;
    pendingRevealId.current = null;
    window.history.replaceState(null, '', '/map');
    if (places.some((place) => place.id === id)) revealSavedPlace(id);
    // `revealSavedPlace` is re-created every render and is deliberately not a dependency: the ref
    // above makes this effect spend itself on the first run after the camera is alive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraAlive, places]);

  return (
    // Every chip in every tree below reads its state from here — the sheet's detail, and the map's
    // own pin-anchored popover, which is rendered inside `components/map/**` and would otherwise
    // need a filter prop threaded through a surface whose job is cameras and pins.
    <CollectionsContext value={collections}>
      <TagFilterContext value={tagFilter}>
        {/* The been/not-been toggle is a leaf in the same three trees the tag chips are — the sheet's
          detail, the desktop map popover, and any future `PlaceDetail` host — so what it announces
          reaches the page's one live region the same way: through a context, not through a callback
          threaded across the map surface. */}
        <AnnounceContext value={announcer}>
          {/* Every `PlaceRow` in the sheet and in the desktop panel reads its distance from here.
            `null` — no fix, a refused or revoked permission, or a fix too rough to measure from —
            is the state that makes a row render no distance at all, which is `L1-F11-T2`. */}
          <NearMeDistancesContext value={distances}>
            <MapShell
              shell={shell}
              places={matches}
              initialBounds={initialBounds}
              // The sheet rests on the peek strip here, so the camera concedes 128px rather than a
              // fraction of the viewport. A collection rests at `half` and concedes accordingly —
              // and so does this page while the library is empty, because the zero-state sheet
              // rests at `half` too. The same snapshot the shell was seeded with, deliberately:
              // see `restingStop` for what a live expression would do to the post-import flight.
              restingStop={restingStop}
              // Selection only — tapping a pin must not move the camera under the finger that
              // tapped it. `selectPlace` (camera mover 3) is for the list, where the pin may be
              // off-screen.
              onPlaceClick={(place) => {
                setSelectedId(place.id);
              }}
              selectedPlace={selected}
              onDeselect={() => {
                setSelectedId(null);
              }}
              // Selecting a place raises the sheet to `half`; without this the camera does not know
              // that and the pin the user just tapped can sit behind it. See camera mover 6.
              selectedOcclusionFraction={SHEET_HALF_FRACTION}
              onViewportChange={handleViewportChange}
              summaries={summaries}
              onAreaClick={selectArea}
              onCountryClick={focusCountry}
              accessibleName={canvasName}
              // Straight through to the surface, which quietens every other pin and draws this one
              // lifted and named. See `hoveredId` — not a camera mover.
              hoveredPlaceId={hoveredId}
              // The locate control sits in the surface's own control column because that is where a
              // user looks for it; everything it means — the permission, the fix, the flight — is
              // owned here. See camera mover 8.
              controlSlot={
                <NearMeControl
                  status={nearMe.state.status}
                  notice={nearMeNoticeText}
                  onRequest={nearMe.request}
                  onDismissNotice={nearMe.dismissNotice}
                />
              }
              announcement={spoken.message}
              floatingSlot={
                lastImport ? (
                  <ImportConfirmation
                    saved={lastImport.saved}
                    alreadySaved={lastImport.alreadySaved}
                    skipped={lastImport.skipped}
                    onDismiss={() => setLastImport(null)}
                  />
                ) : null
              }
              // `＋` opens the create menu, never the TikTok overlay directly — the 2026-08-29
              // ruling. The TikTok arm inside the sheet still lands in that same overlay
              // (`onSubmitTikTok` below), so nothing about the import path changed; what changed is
              // that it is now one of two things the button can start rather than the only one.
              onAdd={() => setAddOpen(true)}
              sheetContent={(stop) => (
                <PlaceSheet
                  places={listed}
                  heading={heading}
                  otherPlaces={otherPlaces}
                  activeAreaId={activeAreaId}
                  libraryIsEmpty={places.length === 0}
                  libraryHasVisited={libraryHasVisited}
                  query={query}
                  onQueryChange={setQuery}
                  activeTag={activeTag}
                  onClearTag={clearTag}
                  notBeenOnly={notBeenOnly}
                  onToggleNotBeen={toggleNotBeen}
                  categoryFacets={facets}
                  activeCategory={activeCategory}
                  onToggleCategory={toggleCategoryFilter}
                  selected={selected}
                  onDeselect={() => {
                    setSelectedId(null);
                  }}
                  onAddTikTok={openImport}
                  onSelect={selectPlace}
                  // The row half of the coupling. `PlaceRow` guards `pointerenter` on
                  // `pointerType === 'mouse'`, so a tap on a phone never reaches this.
                  onHover={setHoveredId}
                  selectedId={selectedId}
                  stop={stop}
                  onExpand={shell.sheet.goTo}
                />
              )}
              panelContent={
                <PlaceDesktopPanel
                  places={listed}
                  heading={heading}
                  otherPlaces={otherPlaces}
                  activeAreaId={activeAreaId}
                  libraryIsEmpty={places.length === 0}
                  libraryHasVisited={libraryHasVisited}
                  query={query}
                  onQueryChange={setQuery}
                  activeTag={activeTag}
                  onClearTag={clearTag}
                  notBeenOnly={notBeenOnly}
                  onToggleNotBeen={toggleNotBeen}
                  categoryFacets={facets}
                  activeCategory={activeCategory}
                  onToggleCategory={toggleCategoryFilter}
                  onAddTikTok={openImport}
                  onSelect={selectPlace}
                />
              }
              /* Not guarded by the overlay, unlike the sheet, and the difference is that `PlaceSheet`
               is always open while this renders nothing at all when `addOpen` is false. Guarding it
               would mean unmounting a *modal* drawer mid-open on the one path that raises the
               import overlay from inside it. See `MapShell`'s header. */
              modalSlot={
                <AddSheetHost
                  open={addOpen}
                  onOpenChange={setAddOpen}
                  places={places}
                  // The same reveal a manual save gets, and for the same reason: the user named a
                  // place, so a filter they set earlier must not be what decides whether they see it.
                  onSelectPlace={revealSavedPlace}
                  // The link is carried across and **submitted**: `initialUrl` runs the import on
                  // mount, so the sheet's `Add this TikTok` is the only Add between the ＋ and the
                  // save. This callback fires only on that press, which is the prop's contract.
                  onSubmitTikTok={(url) => openImport(url)}
                  onManualSaved={(saved) => revealSavedPlace(saved.savedPlaceId)}
                />
              }
              overlay={
                showImport ? (
                  <ImportPageClient
                    {...(importSeedUrl === null ? {} : { initialUrl: importSeedUrl })}
                    // Called synchronously after `onSaved` on the confirm path, and on its own
                    // when the user simply leaves. Only a save defers: closing by hand must always
                    // close, immediately, or the ✕ would appear broken.
                    onClose={() => {
                      if (pendingRevealRef.current === null) setShowImport(false);
                    }}
                    // The recovery on the screen most imports end on. `NoPlacesScreen` withheld it
                    // while there was no manual-add surface to send anyone to; there is one now, and
                    // without this the modal outcome of an import is a dead end.
                    onAddManually={() => {
                      setShowImport(false);
                      setAddOpen(true);
                    }}
                    onSaved={(outcome) => {
                      setLastImport(outcome);
                      camera.framePlaces(outcome.savedPlaceIds);
                      // Hold the overlay until these reach `places`. `onClose` fires synchronously
                      // straight after this, and reads the same ids to decide whether to go now.
                      if (outcome.savedPlaceIds.length > 0) {
                        pendingRevealRef.current = outcome.savedPlaceIds;
                        setPendingReveal(outcome.savedPlaceIds);
                      }
                      // Writer 3. Resolves itself once the refreshed rows arrive, so this does not
                      // wait on the data.
                      const first = outcome.savedPlaceIds[0];
                      if (first) setScope(scopeForAreaTap(first));
                    }}
                  />
                ) : null
              }
            />
          </NearMeDistancesContext>
        </AnnounceContext>
      </TagFilterContext>
    </CollectionsContext>
  );
}

/**
 * The search's result count, as a sentence, delayed until the typing stops. Returns `''` while the
 * field is empty so the region says nothing at all on first load and says nothing again the moment
 * the search is cleared.
 *
 * The count announced is **library-wide**, not the number in view, and this region stays
 * search-driven only (`ux-map-is-the-query.md` §7.1). A viewport-driven count in a live region would
 * speak on every pan, pinch and camera flight, which is not an accessibility feature — it is a way
 * to make the page unusable with a screen reader on. The library-wide number is also the fact the
 * *typing* produced, and it does not churn as the camera moves afterwards.
 */
function useResultAnnouncement(
  query: string,
  activeTag: string | null,
  notBeenOnly: boolean,
  matchCount: number,
): string {
  // The query the stored sentence describes is kept with it, and the sentence is only returned
  // while the two still agree. That is what stops the previous search's result being read out
  // during the first half-second of the next one: clearing the field and typing again leaves a
  // perfectly formed, entirely stale sentence in state, and a live region would happily announce it.
  const [announced, setAnnounced] = useState({ filter: '', message: '' });
  const trimmed = query.trim();
  // One key for all three dimensions, so a stale sentence about the previous *tag* or the previous
  // visit filter is discarded on the same rule that already discards a stale one about the previous
  // query. `\u0000` because it is the one character neither a query nor a stored tag can contain.
  const filter = `${activeTag ?? ''}\u0000${notBeenOnly ? '1' : ''}\u0000${trimmed}`;

  useEffect(() => {
    if (activeTag === null && trimmed === '' && !notBeenOnly) return;
    const timer = setTimeout(() => {
      setAnnounced({
        filter,
        message: filterSentence(trimmed, activeTag, notBeenOnly, matchCount),
      });
    }, ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [filter, trimmed, activeTag, notBeenOnly, matchCount]);

  return announced.filter === filter ? announced.message : '';
}

/**
 * The library-wide result of whatever is currently narrowing it, as one sentence.
 *
 * A chip tap changes the list and the pins silently, exactly as typing does, so it earns the same
 * announcement. The tag is named with `tagDisplayLabel` rather than its stored form: `hidden gem`
 * read aloud as the sentence's own words would be indistinguishable from the rest of it, and the
 * user tapped something that said `Hidden Gem`.
 */
function filterSentence(
  query: string,
  activeTag: string | null,
  notBeenOnly: boolean,
  count: number,
): string {
  const noun = count === 1 ? 'place' : 'places';

  // The visit filter alone gets its own sentence for the same reason the heading does: `3 places
  // match` is true and useless when the user asked "what have I still got to do", and with no
  // query and no tag there is nothing for `match` to be about.
  if (notBeenOnly && activeTag === null && query === '') {
    return count === 0 ? "You've been to all of them." : `${count} ${noun} still to go.`;
  }

  // With another filter on, the visit filter becomes a qualifier on the sentence that filter
  // produces rather than a sentence of its own — one clause, appended once.
  const still = notBeenOnly ? ' you have not been to' : '';

  if (activeTag === null) {
    return count === 0
      ? `No places${still} match ${query}.`
      : `${count} ${noun}${still} ${count === 1 ? 'matches' : 'match'} ${query}.`;
  }
  const label = tagDisplayLabel(activeTag);
  if (query === '') {
    return count === 0
      ? `No places${still} tagged ${label}.`
      : `${count} ${noun}${still} tagged ${label}.`;
  }
  return count === 0
    ? `No places${still} tagged ${label} match ${query}.`
    : `${count} ${noun}${still} tagged ${label} ${count === 1 ? 'matches' : 'match'} ${query}.`;
}
