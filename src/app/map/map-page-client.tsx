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
 * **The initial camera anchors on one area, never all of them.** Fitting every saved place put 12
 * London and 9 Tel Aviv places into one box, which is a continental view of Europe and North
 * Africa: two cluster bubbles, no individual pins, no readable name. `domain/places/clusters.ts`
 * groups on coordinates (never on the `locality` string — the library holds four spellings for two
 * cities) and picks the anchor: the cluster holding the most recently saved place, else the largest.
 * `getSpots` already returns `created_at desc`, so `places[0]` is that most recent save.
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
import { MapSurface, type MapPlace } from '@/components/map/map-surface';
import type { FocusBoundsRequest, MapSummaries } from '@/components/map/types';
import { COUNTRY_LANDING_ZOOM } from '@/components/map/zoom-bands';
import type { LatLngBoundsHint, ViewportChangeMeta } from '@/components/map/types';
import { ImportConfirmation } from '@/components/map/import-confirmation';
import { PlaceSheet, SHEET_HALF_FRACTION } from '@/components/sheet/place-sheet';
import { BottomNav } from '@/components/nav/bottom-nav';
import { PlaceDesktopPanel } from '@/components/sheet/place-desktop-panel';
import { filterByTag, filterByVisit, filterPlaces } from '@/components/map/filter-places';
import {
  categoryFacets,
  filterByCategory,
  toggleCategory,
} from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import { isSearchActive } from '@/domain/places/search';
import { tagDisplayLabel } from '@/domain/extraction/tags';
import { TagFilterContext, isSameTag, type TagFilter } from '@/ui/place/tag-filter';
import { AnnounceContext, SILENT, latestSpoken, type Announcer } from '@/ui/place/announce';
import { clusterByProximity, pickAnchorCluster } from '@/domain/places/clusters';
import { buildAreas, mapAccessibleName } from '@/ui/place/active-area';
import { locationCertainty } from '@/ui/place/location-certainty';
import {
  activeCountryKey as ringedCountryKeyFor,
  fallbackScope,
  resolveScopeOrFallback,
  sameScope,
  scopeAfterCameraSettled,
  scopeAreaId,
  scopeForAreaTap,
  scopeForCountryTap,
  scopeHeading,
  scopeLabel,
  type ListScope,
} from '@/ui/place/list-scope';
import { elsewhereGroups } from '@/ui/place/elsewhere-groups';
import { meanCentroid } from '@/domain/places/country-bucket';
import { summariseByCountry } from '@/ui/place/library-summary';
import { ImportPageClient, type SaveOutcomeDetail } from '@/app/import/import-page-client';
import { AddSheetHost } from '@/components/add/add-sheet-host';
import { CollectionsContext, type CollectionsForPlace } from '@/ui/place/collections-context';

/** How long the typing has to settle before the result count is announced to a screen reader.
 *  Without it a `polite` live region reads a new count on every keystroke, which is worse than
 *  silence — the user cannot hear the field they are typing into. */
const ANNOUNCE_AFTER_MS = 500;

/** One frozen empty map, so clearing the country-group overrides is not a fresh identity each
 *  time — the surfaces re-render on it. */
const EMPTY_EXPANSION: ReadonlyMap<string, boolean> = new Map();

export function MapPageClient({
  places,
  collections,
}: {
  places: readonly MapPlace[];
  /** The caller's editable collections and what is already in them. Passed to a context rather
   *  than down through props for the same reason `TagFilterContext` exists: one of the three hosts
   *  of `PlaceDetail` lives inside the map surface, which must not learn what a collection is. */
  collections: CollectionsForPlace;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
   * the camera on the places that were just added (`focusPlaceIds`), and it is the only thing on
   * screen that says the import worked. Cleared on dismissal, and also when a new import starts,
   * so a stale "8 places added" can never sit over a fresh run.
   */
  const [lastImport, setLastImport] = useState<SaveOutcomeDetail | null>(null);
  /**
   * The one thing that moves the camera after the initial framing: "frame exactly these places".
   * A single piece of state rather than one per caller, because the map keys the flight on the
   * array's *identity* — so whoever wrote last wins, and a re-render that changes nothing cannot
   * re-fly. It is deliberately never cleared: dismissing the post-import confirmation used to
   * switch this prop back to something else, which the map reads as a brand-new request and
   * answers by throwing the camera across the world.
   *
   * **The authorised camera movers, and there are exactly six.** `06` §9.2 listed four, this file
   * grew to seven, and `docs/ux-stable-area-list.md` cut it back — the reconciliation `06` §9.2 was
   * owed is this comment. It said *five* until 2026-08-29 while a sixth was already running and
   * documented in `map-surface.mapcn.tsx`, which is exactly the drift a list like this exists to
   * stop: a list of who may move the camera is only worth having if it is complete, wherever the
   * mover happens to live. In the order they run:
   *
   *  1. The initial framing — the *anchor area*, not the whole library (see the header).
   *  2. A finished import flies to the places it saved.
   *  3. Selecting a place from the list flies to that place, and **holds** the scope.
   *  4. Tapping an `Elsewhere` row — or the map's own area marker, which is the same gesture — flies
   *     to that area, and sets an **area** scope by hand.
   *  5. Tapping a country marker frames that country's areas, clamped inside the area band, and
   *     sets a **country** scope. See `focusCountry`.
   *  6. Selecting a place raises the sheet to `half`, so the camera offsets itself by the fraction
   *     of the viewport the sheet is about to cover — otherwise the pin just tapped comes to rest
   *     behind it. It lives in the surface (`map-surface.mapcn.tsx`, `selectedOcclusionFraction`)
   *     because only the surface knows the projection, but it is a mover and belongs on this list.
   *
   * Three are gone, all of them for the same reason — narrowing must never navigate. A settled
   * search no longer flies to its matches, clearing the search no longer returns to a cluster, and
   * `Show my places` / `Show all matches` no longer exist: the state they escaped (a viewport with
   * nothing in it) cannot occur when the list is an area rather than a rectangle. What is *not* a
   * camera mover, and must never become one: panning, zooming, typing, and tapping a tag chip.
   */
  const [focusPlaceIds, setFocusPlaceIds] = useState<readonly string[] | null>(null);
  /** Mover 5's request, held separately from `focusPlaceIds` because it frames a box rather than a
   *  set of places and comes to rest inside a zoom range rather than under a ceiling. Keyed on
   *  object identity by the surface, exactly as `focusPlaceIds` is. */
  const [focusBounds, setFocusBounds] = useState<FocusBoundsRequest | null>(null);
  /**
   * **What the list is a list of** — the whole library, one country of it, or one ~50 km area
   * (`ui/place/list-scope.ts`, which owns every rule below and is where the argument lives).
   *
   * `null` means "nothing chosen yet" and is not a fourth state: it selects the page's own default
   * (the anchor area) through `fallbackScope`, and it exists only so that default can stay a
   * *derivation* rather than an effect that paints one frame of the wrong list first.
   *
   * An `area` scope still holds the id of a place inside the area rather than a cluster index —
   * clusters are rebuilt on every library change and carry no id of their own, so an anchor place
   * survives an import landing in the area and a deletion from it. A `country` scope holds a
   * `CountrySummary.key`, stable in the same way.
   *
   * **Five writers**, and they are the movers enumerated on `focusPlaceIds` plus the camera: the
   * default resolution, an `Elsewhere`/area-marker tap (4), a country-marker tap (5), a finished
   * import (2), and a settled *user gesture that crossed a zoom band or an area boundary*. It is
   * never re-derived from settled bounds alone, which is what stops the camera rewriting the list
   * on its own.
   */
  const [scope, setScope] = useState<ListScope | null>(null);
  /** The category chip, if one is pressed. A fourth filter dimension, lifted here for the same
   *  reason the other three are: it narrows the **pins** as well as the rows, and a list of four
   *  cafés over a map of thirty-one everything is worse than no filter at all. */
  const [activeCategory, setActiveCategory] = useState<ProductCategory | null>(null);

  /**
   * The area an explicit tap moved *away* from, so the way back is one tap.
   *
   * `Elsewhere` expands the country you are in and the country you came from
   * (`elsewhere-groups.ts`), which is what makes an area switch reversible without a back chevron,
   * a navigation stack or a second screen. Before this the switch was one-way: tap `Tokyo` from
   * London and the route home was to find United Kingdom in the new section, open it, and tap
   * London — three taps, two of them below the fold.
   *
   * **Written only by writer 2**, the explicit area tap. A pan that crosses a boundary (writer 4)
   * does not write it, because a pan is not a navigation anyone is trying to undo; nor do the
   * initial resolution or a finished import, which are arrivals rather than departures.
   */
  const [previousAreaId, setPreviousAreaId] = useState<string | null>(null);

  /**
   * Which country groups the user has explicitly opened or closed in `Elsewhere`.
   *
   * Only explicit toggles: the defaults live in `isCountryExpanded`, so this map is empty until
   * someone presses something, and an empty map still renders the right thing. It is held here
   * rather than in either surface because both render unconditionally — there is no JS media query
   * anywhere on this page — and the sheet and the panel must not disagree about which group is open.
   */
  const [countryExpansion, setCountryExpansion] =
    useState<ReadonlyMap<string, boolean>>(EMPTY_EXPANSION);

  /** Every cluster in the library. Keyed on `places`, so an import re-clusters once rather than on
   *  every render. */
  const clusters = useMemo(
    () =>
      clusterByProximity(places, (place) => place, {
        // The same projection `buildAreas` takes three lines below. Without it the grouping is
        // geometry alone, which merges every city inside 50 km: the owner's library reported
        // `4 places in תל אביב-יפו` over a set holding Rishon LeZion and Ra'anana.
        toLocality: (place: MapPlace) => place.detail?.locality ?? null,
        // An `llm_guess` row's locality is the model's, from the same guess as its coordinates, so
        // a Ra'anana café in a "best of Tel Aviv" post arrives with the wrong city and joins the
        // wrong area. `locationCertainty` is the project's one answer to "was this matched or
        // guessed" — reused here rather than re-testing the dataset slug.
        isLocalityTrusted: (place: MapPlace) =>
          locationCertainty(place.detail?.provenance?.sourceDataset)?.isApproximate !== true,
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

  const initialBounds = anchorCluster?.bounds;

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

  /** The scope as stored, with the page's default filled in while nothing has been chosen. */
  const storedScope = useMemo(
    () => scope ?? fallbackScope(areas, preferredAreaId),
    [scope, areas, preferredAreaId],
  );

  /**
   * **The scope resolved against the library as it is right now** — the areas, the places and the
   * country it names, or the fallback when it names something that has just been deleted.
   *
   * Derived during render rather than in an effect: a stored scope going stale is exactly React's
   * "a prop invalidated some state" case, and the correction below converges immediately because
   * `resolveScope` is idempotent on its own canonical output. Doing it in an effect would paint one
   * frame of the wrong list.
   */
  const listScope = useMemo(
    () => resolveScopeOrFallback(areas, countries, storedScope, preferredAreaId),
    [areas, countries, storedScope, preferredAreaId],
  );
  if (!sameScope(storedScope, listScope.scope)) setScope(listScope.scope);

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
  const matches = useMemo(
    () => filterPlaces(categoryMatches, query),
    [categoryMatches, query],
  );

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
      categoryFacets(
        filterPlaces(visitMatches, query),
        (place) => place.category,
        activeCategory,
      ),
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

  /** The `Elsewhere` section: the other areas grouped by country, with what the current filters
   *  left in each. Empty when the user has one area, which renders no section at all. */
  const elsewhere = useMemo(
    () =>
      elsewhereGroups(countries, { activeAreaId, previousAreaId }, matchIds),
    [countries, activeAreaId, previousAreaId, matchIds],
  );

  // Both narrowings feed the header's noun, so a tag-filtered list reads `3 matches in London`
  // rather than `3 places in London`. `ux-map-is-the-query.md` §2.2's string matrix says the noun
  // changes "exactly when a second filter is applied"; a chip is a second filter, and no new string
  // is invented for it.
  /** Library-wide, not list-wide: the `Not been yet` chip narrows the map as well as the list, and
   *  the map draws every match. */
  const libraryHasVisited = useMemo(() => places.some((place) => place.visited), [places]);

  const filtering =
    isSearchActive(query) || activeTag !== null || notBeenOnly || activeCategory !== null;
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
  const canvasName = useMemo(
    () => mapAccessibleName(heading, scopeLabel(listScope)),
    [heading, listScope],
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
    setFocusPlaceIds([place.id]);
  }

  /**
   * Writer 2 and camera mover 4: the only gesture that picks an area by hand, from an `Elsewhere`
   * row or from the map's own area marker (§2.4 — the marker is this writer, not a new one).
   *
   * Three things it does that it did not:
   *
   * 1. **It records where you came from**, so the country you just left opens in the new
   *    `Elsewhere` and the way back is one tap. Only this writer does — see `previousAreaId`.
   * 2. **It frames the places the filter left**, not the area's whole membership. Tapping
   *    `London · 1 match` under a search used to fly the camera to a box around all eighteen London
   *    places while the list showed one row; the camera and the list were answering different
   *    questions. Falls back to the whole area when the filter has left nothing there, which the
   *    row itself cannot express — `elsewhereGroups` drops an area with no matches — but a caller
   *    can, and an empty box frames nothing at all.
   * 3. **It clears the country-group overrides.** Both defaults have just moved (the active country
   *    and the previous one), so a surviving toggle means the country you left stays open while the
   *    one you arrived in is closed — stale state below the fold that nobody asked for and nobody
   *    can see. Clearing also makes the list's shape after a switch a pure function of the new
   *    area, which is the same property the scroll reset buys.
   */
  const selectArea = useCallback(
    (areaId: string) => {
      const area = areas.find((candidate) => candidate.id === areaId);
      if (!area) return;
      const matching = area.members.filter((place) => matchIds.has(place.id));
      // `null` under a country or global scope, which is right: you did not come from an area, so
      // there is no area for `Elsewhere` to keep open as the way back.
      setPreviousAreaId((current) => (activeAreaId === area.id ? current : activeAreaId));
      setScope(scopeForAreaTap(area.id));
      setSelectedId(null);
      setCountryExpansion(EMPTY_EXPANSION);
      setFocusPlaceIds((matching.length > 0 ? matching : area.members).map((place) => place.id));
    },
    [areas, activeAreaId, matchIds],
  );

  /**
   * **Camera mover 5, and a writer of the scope** — tapping a country marker frames that country's
   * areas *and* makes the list a list of that country.
   *
   * It is its own mover rather than a reuse of `focusPlaceIds` because it needs a zoom **floor** as
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
   * It clears the selection and the country-group overrides for the same reasons writer 2 does: the
   * open place may be in another country entirely, and both `Elsewhere` defaults have just moved.
   * `previousAreaId` is deliberately not written — a country tap is not a departure from an area,
   * and there is nothing for the one-tap way back to point at.
   */
  const focusCountry = useCallback(
    (key: string) => {
      const country = countries.find((candidate) => candidate.key === key);
      if (!country) return;
      setScope(scopeForCountryTap(country.key));
      setSelectedId(null);
      setCountryExpansion(EMPTY_EXPANSION);
      setFocusBounds({
        bounds: country.bounds,
        minZoom: COUNTRY_LANDING_ZOOM.min,
        maxZoom: COUNTRY_LANDING_ZOOM.max,
      });
    },
    [countries],
  );

  /**
   * A country group opened or closed.
   *
   * The **resolved** next state comes from the surface rather than being flipped from the map here,
   * and that is not ceremony: the default a group falls back to differs by surface (the panel opens
   * everything, the sheet opens two) and rises to `true` under any filter, so `!(overrides.get(key)
   * ?? false)` would make the first press on an already-open group a silent no-op.
   */
  const toggleCountry = useCallback((key: string, expanded: boolean) => {
    setCountryExpansion((current) => new Map(current).set(key, expanded));
  }, []);

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
  const handleViewportChange = useCallback(
    (bounds: LatLngBoundsHint, meta: ViewportChangeMeta) => {
      setScope((current) =>
        scopeAfterCameraSettled({
          scope: current ?? fallbackScope(areas, preferredAreaId),
          zoom: meta.zoom,
          userInitiated: meta.userInitiated,
          areas,
          countries,
          rect: bounds,
        }),
      );
    },
    [areas, countries, preferredAreaId],
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
  const toggleTag = useCallback((tag: string) => {
    setActiveTag((current) => (current !== null && isSameTag(current, tag) ? null : tag));
    setSelectedId(null);
  }, []);

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
    setImportSeedUrl(seedUrl);
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
    setFocusPlaceIds([savedPlaceId]);
    setSelectedId(savedPlaceId);
  }

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
        <div className="relative h-full w-full">
          <MapSurface
            places={matches}
            // Selection only — tapping a pin must not move the camera under the finger that tapped
            // it. `selectPlace` (camera mover 3) is for the list, where the pin may be off-screen.
            onPlaceClick={(place) => {
              setSelectedId(place.id);
            }}
            selected={selected}
            onDeselect={() => {
              setSelectedId(null);
            }}
            // Selecting a place raises the sheet to `half`; without this the camera does not know
            // that and the pin the user just tapped can sit behind it. See camera mover 6.
            selectedOcclusionFraction={SHEET_HALF_FRACTION}
            onViewportChange={handleViewportChange}
            {...(initialBounds ? { initialBounds } : {})}
            {...(focusPlaceIds ? { focusPlaceIds } : {})}
            summaries={summaries}
            onAreaClick={selectArea}
            onCountryClick={focusCountry}
            {...(focusBounds ? { focusBounds } : {})}
            accessibleName={canvasName}
          />

          {/* The list and the pins both change silently as the user types, so the one thing a screen
              reader user has no way to perceive is how many places are left. Rendered here, once, rather
              than inside each surface: only one of the two is ever in the accessibility tree (the other
              is `display: none` behind a breakpoint), but a single region cannot double-announce. */}
          <p role="status" aria-live="polite" className="sr-only">
            {spoken.message}
          </p>
          {lastImport && (
            <ImportConfirmation
              saved={lastImport.saved}
              alreadySaved={lastImport.alreadySaved}
              skipped={lastImport.skipped}
              onDismiss={() => setLastImport(null)}
            />
          )}
          {/* `PlaceSheet` is mobile-only (its content is `lg:hidden`) and rendered through a vaul
              portal, which appends to `document.body` *after* this component's own subtree — so at
              matched z-indices it paints on top of anything rendered here, regardless of DOM/JSX
              order. That's invisible normally (the sheet coexists with the map fine), but it means
              the sheet cannot simply share a z-index with the import overlay below: unmounting it
              while the overlay is open is the only way to guarantee mobile gets the same opaque,
              edge-to-edge takeover the standalone `/import` route always had, with no "Your places"
              list bleeding through behind/around it. Desktop is unaffected — `PlaceDesktopPanel`
              below is a plain (non-portaled) sibling that the overlay's higher z-index already
              paints over correctly. */}
          {/* The bar sits outside the `!showImport` guard's subtree for the same reason the sheet
              sits inside it: the import overlay is a full takeover, and navigating away from a
              half-finished import by tapping a tab is not a thing to offer. It renders only below
              `lg` (its own class), where `PlaceDesktopPanel`'s always-visible column already gives
              desktop everything the bar is for. */}
          {/* `＋` opens the create menu, never the TikTok overlay directly — the 2026-08-29 ruling.
              The TikTok arm inside the sheet still lands in that same overlay (`onSubmitTikTok`
              below), so nothing about the import path changed; what changed is that it is now one
              of two things the button can start rather than the only one. */}
          {!showImport && <BottomNav onAdd={() => setAddOpen(true)} />}
          {!showImport && (
            <PlaceSheet
              places={inScope}
              heading={heading}
              elsewhere={elsewhere}
              countryExpansion={countryExpansion}
              onToggleCountry={toggleCountry}
              onSelectArea={selectArea}
              activeAreaId={activeAreaId}
              libraryIsEmpty={places.length === 0}
              libraryHasVisited={libraryHasVisited}
              filtering={filtering}
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
            />
          )}
          {/* Rendered after `PlaceSheet` on purpose. Both are vaul drawers in body-level portals, so
              paint order is mount order at equal z-index; this one is modal, sits a layer above
              (`z-50` content over the sheet's `z-40`), and must be the thing the backdrop covers
              rather than the thing covered by it.

              **Not** under `!showImport`, unlike the sheet above it, and the difference is that
              `PlaceSheet` is always open while this one renders nothing at all when `addOpen` is
              false. Guarding it would mean unmounting a *modal* drawer mid-open on the one path
              that raises the import overlay from inside it — and a modal drawer that never runs its
              close effect is how `document.body` keeps a scroll lock and a `pointer-events: none`
              nobody can see. Closing it normally and letting the overlay mount on top costs one
              140 ms crossfade behind an opaque takeover. */}
          <AddSheetHost
            open={addOpen}
            onOpenChange={setAddOpen}
            places={places}
            // The same reveal a manual save gets, and for the same reason: the user named a place,
            // so a filter they set earlier must not be what decides whether they see it.
            onSelectPlace={revealSavedPlace}
            // The link is carried across and **submitted**: `initialUrl` runs the import on mount,
            // so the sheet's `Add this TikTok` is the only Add between the ＋ and the save. This
            // callback fires only on that press, which is the prop's stated contract.
            onSubmitTikTok={(url) => openImport(url)}
            onManualSaved={(saved) => revealSavedPlace(saved.savedPlaceId)}
          />
          <PlaceDesktopPanel
            places={inScope}
            heading={heading}
            elsewhere={elsewhere}
            countryExpansion={countryExpansion}
            onToggleCountry={toggleCountry}
            onSelectArea={selectArea}
            activeAreaId={activeAreaId}
            libraryIsEmpty={places.length === 0}
              libraryHasVisited={libraryHasVisited}
            filtering={filtering}
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
          {showImport && (
            <ImportPageClient
              {...(importSeedUrl === null ? {} : { initialUrl: importSeedUrl })}
              onClose={() => setShowImport(false)}
              onSaved={(outcome) => {
                setLastImport(outcome);
                setFocusPlaceIds(outcome.savedPlaceIds);
                // Writer 3. Resolves itself once the refreshed rows arrive, so this does not wait
                // on the data.
                const first = outcome.savedPlaceIds[0];
                if (first) setScope(scopeForAreaTap(first));
              }}
            />
          )}
        </div>
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
    return count === 0
      ? "You've been to all of them."
      : `${count} ${noun} still to go.`;
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
