"use client";

/**
 * The mobile sheet system for `/map` (S3/S4/S5, `docs/ux-architecture.md` §6.5, §7). Built on
 * `vaul` (https://github.com/emilkowalski/vaul, MIT, react-19-compatible peer range) rather than a
 * hand-rolled drag layer — §6.5 explicitly rules out "an original sheet" as unaffordable, and vaul
 * is the maintained primitive it names. Vaul's own `Drawer.Root` already implements the gesture
 * arbitration rule this doc asks for: dragging is allowed from the handle always, and from the
 * content only when that content is scrolled to its own top and the drag is downward — this file
 * does not reimplement that logic, it only supplies snap points and content.
 *
 * Three stops per §6.5/§1.3, as pixel/fraction snap points vaul understands directly:
 *  - `peek`: a fixed px height (`PEEK_PX`, 156) — one line: the viewport heading, which opens the
 *    sheet. The bar floats over its lower 68 px and the row is padded clear of it.
 *  - `half`: 55% of the viewport — the saved-places list, or (S5) a selected place's detail.
 *  - `full`: 100% — search field + full list.
 *
 * This component is mobile-only (`lg:hidden` below) — `PlaceDesktopPanel` is the `lg+`
 * presentation of the same `selected`/`places` state, per §1.4. `PlaceRow` and `PlaceDetail` are
 * exported so the desktop panel renders the identical row/detail visual language rather than a
 * second, drifting implementation.
 *
 * Selecting a place (`selected` prop, lifted in `map-page-client.tsx` from the map's
 * `onPlaceClick`) rises the sheet to `half` to show its detail per §7, and remembers the stop it
 * came from so deselecting (sheet's own close, drag-down-to-dismiss-the-detail, or a tap on the
 * map) restores it rather than always falling back to peek.
 *
 * Search (`L1-F6-T2`) is **not** owned here. `query` is lifted to `map-page-client.tsx` because it
 * filters the pins as well as this list, and a filter that narrowed the list while the map kept
 * showing every pin would be worse than no filter at all. This file renders the field and the
 * result states; `domain/places/search.ts` decides what matches.
 *
 * One deliberate deviation from `ux-architecture.md` §1.3, which puts the field at `full` only and
 * a `Search` shortcut elsewhere: the field renders at **both** `half` and `full`. The `Search`
 * text-link that used to sit at `half` did nothing but expand the sheet — an indirection to reach a
 * text field, where the text field itself fits. It also means an active query can never be
 * invisible while it is filtering the map. The spec's actual shortcut (top-left of the map) is a
 * separate control that does not exist yet.
 *
 * Still not built here: the map-background-tap-collapses-sheet rule at `full` is approximated with
 * a transparent tap-catcher rather than wiring into the map's own gesture surface.
 */

import {
  HALF_FRACTION,
  PEEK_ROW_PADDING_BOTTOM,
  STOP_TO_CONTENT_HEIGHT,
  floatingBarClearancePx,
  type SheetStop,
} from "@/components/shell/sheet-geometry";
import { savedPlaceRef } from "@/components/map/saved-place-ref";
import { DetailPanelOpenContext } from "@/ui/place/detail-panel-open";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  MapPin,
  X,
  ChevronLeft,
  ChevronUp,
  Play,
  Search,
} from "lucide-react";
import { CrumbMascot } from "@/components/brand/crumb-mascot";
import { PlatformMark } from "@/components/brand/platform-mark";
import { Button } from "@/components/ui/button";
import { PRESS_BEAT, PRESS_ROW } from "@/lib/interaction";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isSearchActive } from "@/domain/places/search";
import { tagKey } from "@/domain/extraction/tags";
import { tagFacets, type TagFacet } from "@/ui/place/tag-filter";
import {
  BeenToggle,
  CategoryEditor,
  DETAIL_OUT_LINK,
  NoteEditor,
  RemoveSavedPlace,
} from "./saved-place-edits";
import {
  ActiveTagFilter,
  DishLine,
  TagChipList,
  TagChipRow,
  WhyGoLine,
} from "./place-enrichment";
import { BeenBadge } from "./visit-state";
import { NO_BEEN_PLACES_LINE, type VisitFilter } from "@/ui/place/visit-state";
import { BOTTOM_NAV_HEIGHT_PX } from "@/components/nav/bottom-nav";
import {
  AxisRows,
  LibraryFilterBar,
  MenuAxis,
  type FilterSurface,
} from "./library-filter-bar";
import { DEFAULT_PLACE_ORDER, type PlaceOrder } from "./place-order";
import {
  extraSources,
  moreSourcesLine,
  openSourceLabel,
  sourceCreatorLabel,
} from "./place-sources";
import {
  BulkDeleteControl,
  BulkDeleteNotice,
  EnterSelectionButton,
  LeaveSelectionButton,
  SelectablePlaceRow,
  SelectionToolbar,
  useLibrarySelection,
  type LibrarySelection,
} from "./library-selection";
import type { CategoryFacet } from "@/domain/places/category-filter";
import type { ProductCategory } from "@/domain/places/product-category";
import {
  thumbnailOf,
  type PlaceDetailFacts,
  type ThumbnailRef,
} from "@/domain/places/spot";
import {
  enrichmentOf,
  rowAccessibleName,
  whyGoEarnsItsPlace,
} from "@/ui/place/enrichment";
import {
  categoryColorVar,
  categoryLocalityLine,
  categoryTintVar,
} from "@/ui/place/category-display";
import { savedPlaceMapsUrl } from "@/ui/place/maps-link";
import {
  nearbyDistanceLabel,
  nearbyPlaces,
  type NearbyPlace,
} from "@/ui/place/nearby";
import {
  APPROXIMATE_ROW_ANNOTATION,
  locationCertainty,
  savedElapsedLine,
  savedOnLine,
  visitedOnLine,
} from "@/ui/place/location-certainty";
import { AddToCollection } from "@/components/collections/add-to-collection";

import {
  formatCaptionQuote,
  quoteAddsSomething,
} from "@/ui/place/caption-quote";
import { SECTION_LABEL } from "@/ui/place/section-label";
import {
  CLEAR_FILTERS_LABEL,
  NO_FILTER_MATCHES_HINT,
  NO_FILTER_MATCHES_LINE,
  isolate,
  type AreaHeading,
} from "@/ui/place/active-area";
import type { MapPlace } from "@/components/map/types";
import { useNearMeDistance } from "@/components/map/near-me-context";

/**
 * The stops, the snap points and the content heights now live in
 * `src/components/shell/sheet-geometry.ts` — one declaration for the whole product, because
 * `/collections/[id]` had grown a second copy of every one of them
 * (`ux-collections-as-scope.md` §5 item 8).
 */
export const SHEET_HALF_FRACTION = HALF_FRACTION;

export interface PlaceSheetProps {
  /** **What is inside the map's current viewport**, already narrowed by `query` and already sorted
   *  ordered by `map-page-client.tsx`. Render it in the order given — re-sorting here would put
   *  the instability the area binding exists to remove back into the list. */
  readonly places: readonly MapPlace[];
  /** What this list says about itself — `12 places in London`. Rendered verbatim; no surface
   *  re-derives a string from counts. */
  readonly heading: AreaHeading;
  /**
   * Every match the scope above leaves out, in the same library order as `places` — the rest of
   * your library, rendered as ordinary rows under the ones the header is about.
   *
   * This replaces the `Elsewhere` section: a country → city tree the user had to navigate to reach
   * a place, over a library that is five Israeli cities. `docs/ux-stable-area-list.md`:114 named
   * this as the fallback and the owner has taken it (2026-08-30). Empty renders nothing at all,
   * which is every library that fits in one area and every global scope by construction.
   */
  readonly otherPlaces: readonly MapPlace[];
  /** The area the list is showing. Not rendered — it is what the scroll reset and the heading's
   *  crossfade key on, both of which mark the one legitimate change of scope. */
  readonly activeAreaId: string | null;
  /** **The whole library, unfiltered**, so the tag list's rows and their order cannot move while
   *  you filter. Only the counts beside them are live. See `useLibraryTagFacets`. */
  readonly libraryPlaces?: readonly MapPlace[];
  /** Nothing saved, ever — a different screen, not a different string. */
  readonly libraryIsEmpty: boolean;
  /** Anything in the **whole library** is marked been. The `Not been yet` chip's precondition, and
   *  library-wide rather than list-wide on purpose: the chip filters the map too, and the map draws
   *  every match rather than this area's, so a been place in the next city is one this chip hides
   *  and a list-scoped test would refuse to draw the control that un-hides it. */
  readonly libraryHasVisited: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tags currently narrowing the library, as stored — empty when nothing is selected. Several
   *  at once since 2026-09-02, composing as AND. A filter dimension of its own rather than text
   *  written into `query`; `src/ui/place/tag-filter.ts` says why. Rendered here as the dismissible
   *  pills above the list, and applied upstream so the pins are narrowed by the same predicate in
   *  the same frame. */
  readonly activeTags: readonly string[];
  /** One tap to clear one tag, from its pill. The list inside the filter panel toggles them. */
  readonly onClearTag: (tag: string) => void;
  /** Toggle one tag from the filter panel's list. */
  readonly onToggleTag: (tag: string) => void;
  /** Every tag off at once — `Clear all` inside the panel. */
  readonly onClearTags: () => void;
  /** How the library is narrowed by the user's own visits — `all`, `not-been` or `been`. A third
   *  filter dimension beside the tag and the search box, applied upstream so the pins and the rows
   *  are narrowed by the same predicate in the same frame. */
  readonly visitFilter: VisitFilter;
  readonly onChangeVisitFilter: (filter: VisitFilter) => void;
  /** The categories the library actually holds, with counts, already narrowed by every other
   *  filter. Computed on the page rather than here because the same filter narrows the pins. */
  readonly categoryFacets: readonly CategoryFacet[];
  readonly activeCategory: ProductCategory | null;
  readonly onToggleCategory: (category: ProductCategory) => void;
  readonly selected: MapPlace | null;
  readonly onDeselect: () => void;
  /** Opens the import overlay in `map-page-client.tsx` (client state) rather than navigating to
   *  the standalone `/import` route, so the map underneath this sheet stays mounted. */
  readonly onAddTikTok: () => void;
  /** Selecting from the list, which the map's canvas-drawn pins cannot offer to a keyboard user —
   *  see `PlaceRow`'s header for why this stopped being optional at `L1-F7-T2`. */
  readonly onSelect: (place: MapPlace) => void;
  /**
   * **The pointer moved onto or off a row** — the DOM half of the row↔pin coupling (`W3-2`).
   * Lifted to the page, which hands it to the map so the pointed-at pin lifts and its neighbours
   * quieten. Attention, not intent: it never selects and never moves the camera.
   */
  readonly onHover?: (placeId: string | null) => void;
  /** The open place's id, so the row for it can draw the selected state and say `aria-current`. */
  readonly selectedId?: string | null;
  /** `W5-2`. The order in force, the orders that may be offered, and the writer. Held by the page
   *  because it is remembered across reloads and the sheet is not the only surface that lists. */
  readonly sortOrder?: PlaceOrder;
  readonly sortOrders?: readonly PlaceOrder[];
  readonly onChangeSort?: (order: PlaceOrder) => void;
  /** Which stop the shell's sheet is at. Supplied rather than owned: the drawer, its snap points
   *  and the rise-to-half-on-select rule all moved to `components/shell` when `/collections/[id]`
   *  stopped keeping a second copy of them (`ux-collections-as-scope.md` §5 item 9). */
  readonly stop: SheetStop;
  /** Pull the sheet open from the peek row. */
  readonly onExpand: (stop: SheetStop) => void;
}

export function PlaceSheet({
  places,
  heading,
  otherPlaces,
  activeAreaId,
  libraryPlaces,
  libraryIsEmpty,
  libraryHasVisited,
  query,
  onQueryChange,
  activeTags,
  onClearTag,
  onToggleTag,
  onClearTags,
  visitFilter,
  onChangeVisitFilter,
  categoryFacets,
  activeCategory,
  onToggleCategory,
  selected,
  onDeselect,
  onAddTikTok,
  onSelect,
  onHover,
  selectedId,
  // Optional, and defaulted rather than required, so a host that lists places without offering a
  // sort — a collection, a test — mounts this component unchanged. `/map` always passes all three.
  sortOrder = DEFAULT_PLACE_ORDER,
  sortOrders = [],
  onChangeSort,
  stop,
  onExpand,
}: PlaceSheetProps) {
  /** Your other places within a walk of the open one. Memoised on the pair rather than computed
   *  in the detail: `places` is the whole library and the sheet re-renders on every drag frame. */
  const nearbyToSelected = useMemo(
    () => (selected === null ? [] : nearbyPlaces(selected, places)),
    [selected, places],
  );

  if (selected) {
    return (
      /*
       * **The same sized box `PlaceList` below already gets, and it is a bug fix rather than
       * symmetry.**
       *
       * `PlaceDetail`'s root is `min-h-0 flex-1 overflow-y-auto` — a scroll column that only
       * scrolls if something above it bounds its height. Rendered bare it had nothing to bound it:
       * vaul's `Drawer.Content` is `h-full` and positions the sheet by *translating* it, so at
       * `half` this column measured 772 px tall inside an 844 px viewport whose top 452 px the map
       * still occupies. `scrollHeight === clientHeight`, `overflow-y-auto` inert, and 380 px of the
       * card — `Add to a collection`, `Open on TikTok`, `Remove from your places` — laid out,
       * painted, reported visible and reachable only by first dragging the sheet to `full`. That is
       * the failure `STOP_TO_CONTENT_HEIGHT` was written to fix, fixed for the list and never
       * applied to the detail beside it.
       *
       * `map-shell.tsx` deliberately declines to impose the height on `sheetContent`, so the stop
       * has to be spent by whoever renders into it. Both arms of this branch now spend it.
       */
      <div
        style={{ height: STOP_TO_CONTENT_HEIGHT[stop] }}
        className="flex min-h-0 flex-col"
      >
        <PlaceDetail
          place={selected}
          /* What `BottomNav` costs the bottom of this column. Passed rather than assumed inside
             `PlaceDetail`, because that card has four hosts and only the ones the shell puts in a
             sheet have a bar floating over their last 68 px — the `lg+` map popover does not.
             Without it `Been here` rests underneath the nav pill and a real touch at its visual
             centre navigates to `/profile`, which was measured rather than imagined. */
          floatingBarPx={floatingBarClearancePx(stop)}
          /* The same number the box above is sized with, handed on so anything *inside* the card
             can cap itself against this column rather than against the viewport — the identical
             mechanism `PlaceList` already spends below (l. 548–553), and the same reason: `dvh` is
             a lie in here, so a child reading the `100dvh` fallback claims more than the column
             has. Only the sheet hosts pass it; the `lg+` popover and `hosted` do not, and there
             the property is simply not written. */
          sheetContentHeight={STOP_TO_CONTENT_HEIGHT[stop]}
          /* Opening a field row's panel at `peek` or `half` would divide a column that is already
             short between the panel and the card it belongs to. The sheet goes to `full` first,
             and only from a stop that is not already there — the rule `LibraryFilterBar` states at
             l. 773–775, spread the same way so a host that passes nothing keeps today's behaviour
             exactly. `onExpand` takes the stop to go to on this host — `full`, per that rule. */
          {...(stop === "full" ? {} : { onPanelOpen: () => onExpand("full") })}
          /* The write target comes from `selected.savedPlaceId`, never from `selected.id` — the two
             differ on any surface whose pins are not saved rows, and `savedPlaceRef` is the one
             place that answers it. Every pin on this route carries one (`map/page.tsx`'s
             `toMapPlace`), so the detail keeps all six of its mutations. */
          savedPlace={savedPlaceRef(selected)}
          nearby={nearbyToSelected}
          onSelectNearby={(id) => {
            const neighbour = places.find((candidate) => candidate.id === id);
            if (neighbour) onSelect(neighbour);
          }}
          onClose={onDeselect}
        />
      </div>
    );
  }

  return (
    <PlaceList
      places={places}
      heading={heading}
      otherPlaces={otherPlaces}
      activeAreaId={activeAreaId}
      {...(libraryPlaces === undefined ? {} : { libraryPlaces })}
      libraryIsEmpty={libraryIsEmpty}
      libraryHasVisited={libraryHasVisited}
      query={query}
      onQueryChange={onQueryChange}
      activeTags={activeTags}
      onClearTag={onClearTag}
      onToggleTag={onToggleTag}
      onClearTags={onClearTags}
      visitFilter={visitFilter}
      onChangeVisitFilter={onChangeVisitFilter}
      categoryFacets={categoryFacets}
      activeCategory={activeCategory}
      onToggleCategory={onToggleCategory}
      stop={stop}
      // `half` for an empty library, `full` once there is a list. The empty state is a heading, a
      // line and one button — about 380 px — so opening it full gave a new user their first screen
      // as that button above roughly 1 100 px of white, with the map they came for hidden behind
      // it. Half fits the content and leaves the map visible; a list is the only thing worth the
      // whole screen.
      onExpand={() => onExpand(libraryIsEmpty ? "half" : "full")}
      onAddTikTok={onAddTikTok}
      onSelect={onSelect}
      {...(onHover ? { onHover } : {})}
      {...(selectedId === undefined ? {} : { selectedId })}
      sortOrder={sortOrder}
      sortOrders={sortOrders}
      {...(onChangeSort ? { onChangeSort } : {})}
    />
  );
}

function PlaceList({
  places,
  heading,
  otherPlaces,
  activeAreaId,
  libraryPlaces,
  libraryIsEmpty,
  libraryHasVisited,
  query,
  onQueryChange,
  activeTags,
  onClearTag,
  onToggleTag,
  onClearTags,
  visitFilter,
  onChangeVisitFilter,
  categoryFacets,
  activeCategory,
  onToggleCategory,
  stop,
  onExpand,
  onAddTikTok,
  onSelect,
  onHover,
  selectedId,
  sortOrder,
  sortOrders,
  onChangeSort,
}: {
  places: readonly MapPlace[];
  heading: AreaHeading;
  otherPlaces: readonly MapPlace[];
  activeAreaId: string | null;
  libraryPlaces?: readonly MapPlace[];
  libraryIsEmpty: boolean;
  libraryHasVisited: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  activeTags: readonly string[];
  onClearTag: (tag: string) => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  visitFilter: VisitFilter;
  onChangeVisitFilter: (filter: VisitFilter) => void;
  categoryFacets: readonly CategoryFacet[];
  activeCategory: ProductCategory | null;
  onToggleCategory: (category: ProductCategory) => void;
  stop: SheetStop;
  onExpand: () => void;
  onAddTikTok: () => void;
  onSelect?: (place: MapPlace) => void;
  /** See `PlaceSheetProps.onHover` — threaded rather than contextual because it is one callback to
   *  one owner, and a context would make the coupling look like something any subtree may join. */
  onHover?: (placeId: string | null) => void;
  selectedId?: string | null;
  sortOrder: PlaceOrder;
  /** Which orders the control may offer — `nearest` is in it only while a fix is held. Empty means
   *  this host offers no sort at all, and `SortControl` then renders nothing. */
  sortOrders: readonly PlaceOrder[];
  onChangeSort?: (order: PlaceOrder) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * **The scroll goes back to the top when the area changes, and it never did before.**
   *
   * This was specified when the area model shipped (`ux-stable-area-list.md`) and was not built.
   * Without it, an area switch arriving from the map's own area marker clamps `scrollTop` to the
   * new content — so you land somewhere in the middle of a city you did not scroll to, with no
   * visible evidence that anything happened but a heading you cannot see.
   *
   * In a layout effect rather than an event handler, because the rows have to be replaced before
   * there is a new scroll height to be at the top of; and keyed on the area rather than fired from
   * the tap, so a switch that arrives any other way — the map's own area marker, an import landing
   * elsewhere — is reset by the same line.
   *
   * `instant`, not smooth: this is not a journey through 2 000 px of someone else's city, and a
   * long animated scroll would also fight the camera flight happening at the same moment.
   */
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [activeAreaId]);

  // An empty library is a different screen, not a different count.
  const headingText = libraryIsEmpty ? EMPTY_LIBRARY_HEADING : heading.text;

  const facets = useLibraryTagFacets(
    places,
    otherPlaces,
    activeTags,
    libraryPlaces,
  );

  /** Nothing at all to show — the scope's places *and* the continuation under `Everywhere else`
   *  are both empty, which is the only state in which a filter's own empty line is the truth. */
  const listIsEmpty = places.length + otherPlaces.length === 0;
  /** Whether any of the three narrowing axes is on — the same three `Clear` resets, and
   *  deliberately not the sort or the search, neither of which can empty the list in a way
   *  `Clear filters` would undo. Search has its own escape one line above. */
  const filtersAreOn =
    activeCategory !== null || visitFilter !== "all" || activeTags.length > 0;

  /**
   * What the peek row promises above the count in the header: how many more rows are down there.
   *
   * It counted *areas* until they were deleted (2026-08-30), and that needed a guard against the
   * global scope: nothing was subtracted there, so the row read `32 in 2 countries · +2 more areas`
   * over a list already holding all 32. Counting the rows themselves needs no guard — `otherPlaces`
   * is exactly what is rendered below the scope's own places, so a global scope leaves it empty by
   * construction and the promise disappears on its own.
   */
  const moreElsewhere = otherPlaces.length;

  /**
   * **Multi-select and bulk delete** (`deleteSavedPlaces`' render half, round 3 §8.2).
   *
   * Keyed on `savedPlaceId` and not on `place.id`, because the action deletes `saved_places` rows:
   * the two are the same value on `/map` — every pin here *is* one of the caller's saves — and a
   * host whose pins are not saved rows contributes nothing to this array and gets no `Select`
   * control at all. That is the same rule `savedPlaceRef` holds for the detail's six mutations, and
   * it is stated rather than inferred for the same reason.
   *
   * Over `places` **and** `otherPlaces`, which together are exactly what the scroll renders — see
   * `useLibraryTagFacets` for the same argument about the same pair. `Select all` over one of them
   * would pick a subset of what is on screen.
   */
  const selectableIds = useMemo(
    () =>
      [...places, ...otherPlaces].flatMap((place) =>
        place.savedPlaceId === undefined ? [] : [place.savedPlaceId],
      ),
    [places, otherPlaces],
  );
  const selection = useLibrarySelection(selectableIds);
  const selecting = selection.selecting;

  /**
   * **Focus comes back to `Select` when the mode ends** — the other half of the move
   * `SelectionToolbar` makes on the way in (`ux-select-control-2026-09-03.md` §5). Without it,
   * pressing `Done` unmounts the focused node and focus falls to `<body>`, so a keyboard user
   * restarts from the top of the sheet after every selection.
   *
   * Keyed on the *transition* rather than on a mount, because `Select` is also on screen before
   * anyone has entered the mode and stealing focus on first paint would be a different bug. The
   * slot is a `display: contents` span so the button is still the flex item this row lays out;
   * `querySelector` rather than a ref on the button keeps `EnterSelectionButton` ref-free, exactly
   * as `collection-content.tsx` does with the same control.
   *
   * `preventScroll` because the sheet may be mid-animation between stops.
   */
  const selectSlotRef = useRef<HTMLSpanElement>(null);
  const wasSelecting = useRef(false);
  useEffect(() => {
    const leftSelection = wasSelecting.current && !selecting;
    wasSelecting.current = selecting;
    if (!leftSelection) return;
    const enter = selectSlotRef.current?.querySelector("button");
    if (!enter?.checkVisibility()) return;
    enter.focus({ preventScroll: true });
  }, [selecting]);

  return (
    <div
      style={
        {
          height: STOP_TO_CONTENT_HEIGHT[stop],
          // The same number, published so anything inside the sheet can size itself against *this
          // column* instead of against the viewport. `dvh` is a lie in here: at `half` the column
          // is `55dvh - 70px`, so a child capped at `45dvh` claims 96 % of it and leaves the list
          // nothing. The inline filter panel in `library-filter-bar.tsx` is the reader.
          "--sheet-content-height": STOP_TO_CONTENT_HEIGHT[stop],
        } as CSSProperties
      }
      className="flex min-h-0 flex-col gap-3.5 px-5 pt-3.5"
    >
      {stop === "peek" ? (
        /*
         * One line, and the bar underneath it carries everything else.
         *
         * This row used to hold the heading and a 48 px `Add a TikTok link`, and briefly a third
         * Collections slot as well. Both of those are now in `BottomNav`, which is the owner's
         * 2026-08-29 ruling: destinations and the primary action live in persistent chrome, not in
         * the sheet. What is left here is the one thing that is genuinely about *this* sheet —
         * what the list below is, and that it can be pulled up.
         *
         * That is also what pays for the bar. `PEEK_PX` is mirrored in four places, one of them a
         * licence condition, and it sets the camera's bottom budget — so it moves through
         * `sheet-geometry.ts` and all four together, never here.
         *
         * **`min-h-0 flex-1 items-end`, and all three words are the fix** (W2-E). This row spent a flat
         * `BOTTOM_NAV_HEIGHT_PX` of `padding-bottom` while sitting at its own content height at
         * the *top* of the column — so the padding positioned nothing at all, the button came to
         * rest at y 746–790 under a bar occupying 776–844, and its lower 14 px were unpressable.
         * Filling the column and aligning to its bottom edge is what makes the padding load-bearing:
         * the button now hangs off the bottom of the strip at a fixed distance from the bar, and
         * `PEEK_ROW_PADDING_BOTTOM` carries the `env(safe-area-inset-bottom)` the bar's own height
         * has always carried, so a home indicator moves the two together instead of sliding the bar
         * up over the line.
         *
         * **`min-h-0` is what makes that second half true, and it is not decoration.** A flex item's
         * automatic minimum size is its content, so without it the row simply grew past the column
         * — measured with a 34 px inset emulated over CDP: the row became 162 px tall inside a
         * 128 px box, went back to being top-anchored, and the button ended 20 px *under* the bar,
         * which is the defect this row started with. With it the row shrinks, the button stays
         * glued 14 px above the bar at any inset, and what the inset eats is the air above — the
         * safe direction. Past ~30 px of inset the button's box starts above the sheet's top edge;
         * its background is transparent and its text is centred, so nothing paints on the map, and
         * no device can reach that state today anyway (see `PEEK_ROW_PADDING_BOTTOM`).
         */
        <div
          className="flex min-h-0 flex-1 items-end"
          style={{ paddingBottom: PEEK_ROW_PADDING_BOTTOM }}
        >
          <button
            type="button"
            onClick={onExpand}
            aria-label={
              moreElsewhere > 0
                ? `Show your places, and ${moreElsewhere} more from everywhere else`
                : "Show your places"
            }
            className={cn(
              // **`min-h-11`, and it is the 44px floor rather than a layout tweak.** W7-6 measured
              // this at 350 × 20: wide enough, and less than half the height it needs. It is the
              // control that opens the library on a phone, so it is on the path of every session,
              // and 20px of it is one line of `text-sm` with nothing around it.
              //
              // It is the floor the whole band is now sized around: `PEEK_PX` grew 128 → 156 on
              // 2026-09-02 precisely because 44 px plus the bar plus a drag handle does not fit in
              // 128, and the button is the one term in that sum that may not shrink.
              "flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left text-sm font-medium text-muted-foreground",
              // The only control on the peek strip, and the one whose result — the sheet rising —
              // takes a spring to arrive. Without a press this row looked inert for that whole
              // beat.
              PRESS_ROW,
            )}
          >
            <span className="min-w-0 truncate">
              {/* The number carries the emphasis and the rest of the line stays quiet, exactly as it
                did when this read `20 places saved`. `heading.count`/`heading.rest` are given to us
                pre-split precisely so this stays a render and never a parse. When there is no count
                — `Nothing saved in this area`, or the empty library — the emphasised span is not
                rendered empty; the line is simply the sentence. */}
              {libraryIsEmpty || heading.count === null ? (
                headingText
              ) : (
                <>
                  <span className="font-heading font-extrabold text-foreground">
                    {heading.count}
                  </span>{" "}
                  {/* The short form — `18 in London`, not `18 places in London`. Given to us by
                    `areaHeading` rather than sliced off `text` here, because a surface that parses
                    a string it was handed pre-split is a surface that will eventually disagree
                    with the one that built it. The noun is one drag up, and the fact that this is
                    a map is doing the rest of the work. */}
                  {heading.shortRest}
                </>
              )}
            </span>
            {/* The line used to name one city while the map drew pins in three, which reads as the
                list having lost places rather than as it being scoped. This says the others are
                there and that the same tap reaches them. `shrink-0` so the city name is what gives
                way when the row runs out of room — the promise must not be the half that truncates. */}
            {moreElsewhere > 0 ? (
              <span className="shrink-0 whitespace-nowrap">
                · +{moreElsewhere} more
              </span>
            ) : null}
            {/* The one thing the row was missing: at rest the middle slot read as a caption, so
                nothing on screen said the list was there to be pulled up. The underline it used to
                carry only appeared on hover, which a phone does not have. */}
            <ChevronUp className="size-4 shrink-0 opacity-60" aria-hidden />
          </button>
        </div>
      ) : (
        <>
          {/* The same string at `half` and at `full`. `Your places` used to sit here at `full`, and
              deleting it is the point: at `full` the map is covered, so this line is the only thing
              on screen explaining why the list is twelve rows and not twenty. Removing the
              explanation exactly when the evidence is hidden is the wrong trade. */}
          {/* `key` on the area, so React remounts the heading and `tw-animate-css`'s entrance runs:
              `duration-enter` (140 ms), the one piece of motion that marks the one legitimate
              change of scope (§7). It is deliberately not applied when only the *count* changes —
              filtering re-renders this element without remounting it, and a heading that flashes on
              every keystroke is the animation §7 forbids by name.

              **The reduced-motion arm was an instant swap and is now the fade alone** (W3-3, and
              `ux-overnight-specs.md` OQ-9, ruled by the orchestrator). The argument that used to
              sit here was that this fires alongside a scroll reset and a focus move, so three
              simultaneous changes with reduced motion on should be one frame. `facelift-plan.md`
              §3a overrides it with a rule that applies to all nine animations rather than to this
              one: under `prefers-reduced-motion` they collapse **to the opacity change alone, not
              to nothing**, because the thing that just changed still has to be findable — and a
              heading that swaps with no transition at all during a scroll reset is exactly the
              change a reduced-motion user is most likely to miss. So the fade is unconditional and
              only the 4 px rise is `motion-safe:`. That is the whole of the inversion: opacity is
              everyone's, transform is the pointer user's bonus. */}
          {/* The heading and the control that turns the rows into checkboxes share one line, so
              selection costs **zero vertical pixels** on a header the owner measured at 46% of a
              375x812 viewport. Absent while selecting — the toolbar below replaces it — and absent
              when there is nothing whose `saved_places` row this list could delete. */}
          <div className="flex items-center gap-2">
            {/* **It stays while selecting, demoted** (`ux-select-control-2026-09-03.md` §4). Not
                deleted: it is the only thing on screen naming *what set `Select all` acts on*, and
                in Places that set is area-scoped (`18 in London`, plus `+3 more`) — removing the
                scope statement at the exact moment a bulk control appears is the wrong trade, and
                `useLibrarySelection`'s own comment makes the argument.

                Not left alone either: at `text-xl font-extrabold` it is the heaviest element on
                the surface, and while selecting it sits 8 px above a band stating a **different**
                count. Two counts, the loud one irrelevant — which is exactly what the owner
                noticed. Demoting pays twice: the register change *is* the mode change, visible
                without motion, and it gives the header back ~10 px.

                One-off height snap accepted, with no height transition: layout thrash inside a
                scrolling sheet for no information (same rule as
                `ux-collection-actions-2026-09-03.md` §8). The collection's heading does **not**
                demote — it is an identity rather than a status, and nothing competes with it. */}
            <h2
              key={activeAreaId ?? "no-area"}
              className={cn(
                "min-w-0 flex-1 animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1 outline-none",
                selecting
                  ? "text-caption font-medium text-muted-foreground"
                  : "font-heading text-xl font-extrabold tracking-tight text-foreground",
              )}
            >
              {headingText}
            </h2>
            {/* One slot, two controls, one conditional. `Select` presses and `Done` is standing in
                the same place at the same size — the transition the owner called weird was the
                exit appearing at the other end of the screen two weights heavier. */}
            {selecting ? (
              <LeaveSelectionButton onLeave={selection.leave} />
            ) : (
              !libraryIsEmpty &&
              selectableIds.length > 0 && (
                <span ref={selectSlotRef} className="contents">
                  <EnterSelectionButton onEnter={selection.enter} />
                </span>
              )
            )}
          </div>

          {/* Hidden while the library is empty: there is nothing to search, and an inert field is a
              false affordance offering work that cannot produce a result. */}
          {/* **The `12 of 32` counter is gone** (`ux-overwhelm-audit-2026-09-02.md` §7). It was
              `aria-hidden`, so it existed for sighted users only, in exactly the band the owner
              asked us to empty — and it restated what the heading above it (`58 places in 3
              countries`) and the list under it already say. The live region that announces the
              same fact to a screen reader is a different mechanism in a different file
              (`map-shell.tsx`) and is untouched. */}
          {/* **The search field and the filter bar are replaced while picking, not hidden beside
              the toolbar.** Two ways of narrowing a list you are counting is a way to lose track of
              what is counted — the same swap `collection-content.tsx` makes, and the one thing the
              two multi-selects deliberately share. Everything else about them diverges; see
              `bulk-delete.ts`. */}
          {selecting ? (
            <>
              <SelectionToolbar selection={selection} />
              {/* At the top of the list rather than in a pinned footer, which is where the
                  collection's bulk *unlink* lives. Two bulk removals that look alike is the
                  confusability `ux-two-removals-one-screen.md` §2.3 exists to remove, and where the
                  button is, is the first thing a thumb learns. */}
              <BulkDeleteControl selection={selection} />
            </>
          ) : (
            <BulkDeleteNotice notice={selection.notice} />
          )}

          {!libraryIsEmpty && !selecting && (
            <PlaceSearchField value={query} onChange={onQueryChange} />
          )}

          {/* **Two rows, not three.** Measured at 375x812 on the owner's own library, the header
              drew the visit chip and three category chips at y190, two sort chips at y248 and ten
              tag chips at y306, with the first place at y370 — 46 % of the viewport spent on
              controls. Each axis now lives behind its own named trigger on row 1, and the order
              behind one ghost trigger on row 2; `library-filter-bar.tsx` carries the argument.

              Above the list *and* above the empty state, so the control that undoes a filter is on
              screen in the state where the filter has left nothing to look at. */}
          {!libraryIsEmpty && !selecting && (
            <LibraryFilterBar
              // **The phone gets inline disclosure, not a floating popup** — owner, 2026-09-02:
              // *"i think that on mobile the pop up doesnt feel good."* This host is inside a vaul
              // drawer, where a floating layer is a popup inside a popup and fights the drag
              // listener. A constant, never a `matchMedia` read: both hosts render on the server.
              surface="inline"
              // Opening a panel at `half` would be dividing 83 px between a menu and the list it
              // narrows. The sheet goes to `full` first, and only from a stop that is not already
              // there — see `onPanelOpen`.
              {...(stop === "full" ? {} : { onPanelOpen: onExpand })}
              facets={categoryFacets}
              activeCategory={activeCategory}
              onToggleCategory={onToggleCategory}
              visitFilter={visitFilter}
              onChangeVisitFilter={onChangeVisitFilter}
              anyVisited={libraryHasVisited}
              tagFacets={facets}
              activeTags={activeTags}
              onToggleTag={onToggleTag}
              onClearTags={onClearTags}
              belowRow={
                onChangeSort !== undefined ? (
                  <SortControl
                    surface="inline"
                    order={sortOrder}
                    orders={sortOrders}
                    onChange={onChangeSort}
                    listLength={places.length + otherPlaces.length}
                  />
                ) : undefined
              }
            />
          )}
          {activeTags.length > 0 && !selecting && (
            <ActiveTagFilter tags={activeTags} onClear={onClearTag} />
          )}

          {/* The one line some empty headings need — see `AreaHeading.note`. Above the scroll area
              rather than inside it, so it sits with the heading it explains rather than where the
              first row would have been.

              **`Been` with nothing to show gets its own line**, because that empty result only
              became reachable when the visit filter grew a third state: the area heading is built
              from `notBeenOnly`, which `been` is not, so without this the screen would go quiet
              about the one filter that emptied it. The control that undoes it is above this line,
              which is the rule the whole header already holds itself to. */}
          {!libraryIsEmpty && listIsEmpty && visitFilter === "been" ? (
            <p className="text-sm font-medium text-muted-foreground">
              {NO_BEEN_PLACES_LINE}
            </p>
          ) : (
            /* **The heading does not explain an empty list.** Owner, 2026-09-02. `heading.note`
               still carries the notes that are *about the scope* rather than about a filter having
               emptied it, so it is kept — but when filters are on and nothing matched, the
               sentence belongs in the list, where `ClearFiltersEscape` puts it with the button
               that undoes it. Rendering both would say it twice, a control row apart. */
            !libraryIsEmpty &&
            heading.note !== null &&
            !(filtersAreOn && places.length === 0) && (
              <p className="text-sm font-medium text-muted-foreground">
                {heading.note}
              </p>
            )
          )}

          {libraryIsEmpty ? (
            <NoPlacesYet onAddTikTok={onAddTikTok} />
          ) : (
            <>
              <div
                ref={scrollRef}
                data-vaul-no-drag
                // Exactly the bar's height **and the inset under it**, as a margin rather than as
                // padding — the same correction round-3 §7.1 forced on the place card below, for
                // the same reason. Padding only moves the *last* row clear once you have scrolled
                // to the end; the column's box still ran to the bottom of the screen, so every row
                // in between slid under a `bg-card/90 backdrop-blur-md` pill and was rendered
                // blurred rather than clipped. A margin ends the box where the bar begins and the
                // overflow clip does the work at every scroll position. It costs nothing: the
                // 68 px comes off the box and stops being spent on padding, so the last row rests
                // at the same y it always did.
                //
                // `env(safe-area-inset-bottom)` is new here and is a defect fix of its own. The
                // bar's own height is `calc(68px + env(safe-area-inset-bottom))`; this column
                // paid the 68 and not the inset, so on a notched phone the last row sat under the
                // bar by the whole inset. Simulated at 34 px: the row's title was behind the pill.
                className="mb-[calc(env(safe-area-inset-bottom)+var(--floating-bar,0px))] min-h-0 flex-1 overflow-y-auto"
                style={
                  {
                    "--floating-bar": `${BOTTOM_NAV_HEIGHT_PX}px`,
                  } as CSSProperties
                }
              >
                {heading.escape === "clear-search" && (
                  <ClearSearchEscape onClearSearch={() => onQueryChange("")} />
                )}
                {/* **The filters emptied the list, so the list says so** — owner, 2026-09-02. This
                    sits where the first row would have been, not in the heading: the reader is
                    looking at the space that has nothing in it, and an explanation a control row
                    above it is an explanation somewhere else. Search already worked this way one
                    line up; the two empty results now behave alike. */}
                {filtersAreOn &&
                  heading.escape !== "clear-search" &&
                  places.length === 0 && (
                    <ClearFiltersEscape
                      onClearFilters={() => {
                        if (activeCategory !== null)
                          onToggleCategory(activeCategory);
                        if (visitFilter !== "all") onChangeVisitFilter("all");
                        if (activeTags.length > 0) onClearTags();
                      }}
                    />
                  )}
                {!heading.empty && (
                  <ul>
                    {places.map((place) =>
                      /* Tap-to-open is **replaced**, never fought: while picking there is no row
                         that is both "open me" and "pick me", and no long-press to discover. */
                      selecting && place.savedPlaceId !== undefined ? (
                        <SelectablePlaceRow
                          key={place.id}
                          place={place}
                          checked={selection.picked.has(place.savedPlaceId)}
                          onToggle={() =>
                            selection.toggle(place.savedPlaceId as string)
                          }
                        />
                      ) : (
                        <PlaceRow
                          key={place.id}
                          place={place}
                          {...(onSelect && !selecting ? { onSelect } : {})}
                          {...(onHover ? { onHover } : {})}
                          selected={selectedId === place.id}
                        />
                      ),
                    )}
                  </ul>
                )}
                <EverywhereElse
                  places={otherPlaces}
                  {...(onHover ? { onHover } : {})}
                  {...(selectedId === undefined ? {} : { selectedId })}
                  flush={heading.empty}
                  {...(onSelect && !selecting ? { onSelect } : {})}
                  {...(selecting ? { selection } : {})}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The tag vocabulary of everything currently matching, with counts — `growth-plan.md` §4's
 * "there is no tag facet with counts, though categories have one".
 *
 * A hook rather than four lines in each of the two hosts, for the reason `PlaceRow` is shared:
 * the sheet and the desktop panel are two presentations of one library, and a facet computed from
 * a slightly different set on each is how the phone and the desktop come to disagree about what
 * the product holds.
 *
 * Counted over `places` **and** `otherPlaces` together, because that pair is exactly the library
 * narrowed by every other filter: `otherPlaces` is documented as "every match the scope above
 * leaves out". Counting only the in-scope rows would make each chip a claim about the area heading
 * rather than about the library, and tapping it would then reveal places the count did not
 * include — the same disagreement `categoryFacets` records against scoping its own counts to the
 * active area.
 *
 * **Every tag, with no cap and no floor, and the counts are co-occurrence counts on purpose.**
 * This used to return `[]` the moment a tag was filtering, because the list it counts over is
 * already narrowed by that tag and every other tag's number would then be its co-occurrence with
 * the active one rather than its own. With a *single* tag chip row that was the honest arrangement.
 * With a **multi-select** list it is exactly the number the user needs: `Wine 3` beside a selected
 * `Brunch` says "three of your brunch places are also wine", which is precisely what ticking it
 * produces. So the list stays on screen and the counts stay true — of the set in front of you.
 *
 * The cap and the floor are both opted out of (`Number.POSITIVE_INFINITY`, `1`). A capped
 * *searchable* list would hide tags the user can no longer reach by searching for them, which is
 * the one thing the list exists to allow; and a singleton tag in a searchable list is findable
 * rather than noisy. `MAX_TAG_FACETS` and `MIN_TAG_FACET_COUNT` survive for any caller that is
 * still a row.
 */
export function useLibraryTagFacets(
  places: readonly MapPlace[],
  otherPlaces: readonly MapPlace[],
  activeTags: readonly string[],
  /**
   * The **whole** library, unfiltered. What it buys is the one thing the owner asked for:
   * *"we should not remove the tags from the list, its weird behavior that it changes places
   * everytime."*
   *
   * Which rows exist and what order they are in is computed from this and nothing else, so it
   * cannot move while you filter; only the numbers beside them are live. Absent, the list falls
   * back to the filtered set, which is the old behaviour and the reason it moved.
   */
  libraryPlaces?: readonly MapPlace[],
): readonly TagFacet[] {
  const tagsOf = (place: MapPlace) => enrichmentOf(place.detail).tags;
  const matching = useMemo(
    () => [...places, ...otherPlaces],
    [places, otherPlaces],
  );

  // The vocabulary and its order: every tag in the library, most-used-in-the-library first.
  //
  // **Why the library's counts and not the alphabet.** Both are stable under filtering, which is
  // the whole requirement; most-used-first is the more useful of the two for aiming at a list you
  // scan rather than read, and it is the order this list has always had. Alphabetical would also
  // have to answer which alphabet — half these tags are Hebrew, and `tag-filter.ts` records why a
  // locale-aware comparison is a non-deterministic bar. This order changes only when the library
  // itself changes, which is a thing the user did.
  const vocabulary = useMemo(
    () =>
      libraryPlaces === undefined
        ? null
        : tagFacets(
            libraryPlaces,
            tagsOf,
            activeTags,
            Number.POSITIVE_INFINITY,
            1,
          ),
    [libraryPlaces, activeTags],
  );

  const live = useMemo(
    () => tagFacets(matching, tagsOf, activeTags, Number.POSITIVE_INFINITY, 1),
    [matching, activeTags],
  );

  return useMemo(() => {
    if (vocabulary === null) return live;
    const counts = new Map(
      live.map((facet) => [tagKey(facet.tag), facet.count]),
    );
    // **A tag that currently matches nothing keeps its row and reads `0`.** Dropping it is the
    // behaviour being complained about: a row that vanishes as you narrow is a row you cannot aim
    // at, and the tag is still in the library — the filter is what is hiding it, and the way back
    // is `Clear`, one row up.
    return vocabulary.map((facet) => ({
      ...facet,
      count: counts.get(tagKey(facet.tag)) ?? 0,
    }));
  }, [vocabulary, live]);
}

/**
 * Shared with `PlaceDesktopPanel` so the two presentations of "a saved place, in a list" never
 * drift into two visual languages.
 *
 * **The row is now the list's entry point to selection**, which it deliberately was not before.
 * That earlier choice ("only the map pin selects") stopped being tenable the moment `L1-F7-T2` put
 * delete and note-editing inside `PlaceDetail`, because the pins are drawn by MapLibre into a
 * `<canvas>`. Three consequences, and the third is the one that settles it:
 *
 *  1. **Keyboard users could not reach place detail at all.** A canvas-painted pin has no DOM node
 *     to tab to, so every action inside the detail view — now including deleting a place — was
 *     mouse-only. That is an accessibility defect, not a preference.
 *  2. **The duplicates are the hard case.** `current-state.md` §3.6 lists four duplicate places
 *     sitting in the library precisely because nothing could remove them; a duplicate is by
 *     definition a second pin at almost the same coordinates, i.e. inside a cluster, i.e. the
 *     single hardest thing to hit on a map and the easiest to pick out of a list.
 *  3. **A canvas pin cannot be driven by Playwright** without hard-coding pixel coordinates that
 *     any camera change invalidates. `L1-F9-T4` has to exercise the golden path against a
 *     deployment; a flow whose only entry point is a canvas click is a flow that cannot be tested.
 *
 * `onSelect` is optional so the row stays a pure presentational element for any caller that wants
 * one; without it the row renders exactly as it did before, as a non-interactive `<li>`.
 */
/**
 * **The sort control** — `W5-2`, rebuilt twice on 2026-09-02 and the second time for a reason worth
 * writing down.
 *
 * It began as a row of `CHIP_PRESSABLE` chips at `min-h-11`, byte-identical to the category chips —
 * and **one of them was always pressed**, because a sort always has a current value. So the header
 * showed two filled pills meaning two unrelated things, while a pressed chip in this product means
 * *this is narrowing your library*. It then became a native `<select>`, which fixed the shape and
 * introduced three new defects the owner caught immediately: `appearance-none` does not stop a
 * native select taking the platform's own focus chrome, it opens the **operating system's** menu
 * rather than the app's, and — the regression — `h-8` on the select itself made it the smallest
 * touch target in the product, 32 px flat, while every control beside it painted 32 inside a 44 px
 * band.
 *
 * So it is now the **same component as the filter triggers** (`Dropdown`, `tone="sort"`): one
 * `<button>` opening the app's own menu, the same 32-in-44 target, the same pill radius, the same
 * surface hover — never a text-colour flick, which is what made the old one read as broken. The two
 * meanings are told apart by the label and the fill, not by the mechanism: `Sort:` is printed on
 * screen, and the trigger is a ghost where a filter trigger is a bordered pill.
 *
 * **The axis word is visible at rest**, which it never was before today. Two bare values named
 * nothing, and `A–Z` reads as a filter for names beginning with A as easily as it reads as an
 * ordering.
 *
 * **Gated on the list being long enough to need it.** Sorting five rows you can see at once is a
 * control that costs a permanent 44 px to answer a question nobody has.
 *
 * **`Nearest` is absent, not disabled, without a fix.** `availableOrders` decides; a greyed-out
 * `Nearest` invites the question the screen has no answer to. Every string is
 * `overnight-copy-deck.md` §4.2 and none is written here.
 */
export function SortControl({
  order,
  orders,
  onChange,
  listLength,
  surface = "popover",
}: {
  order: PlaceOrder;
  orders: readonly PlaceOrder[];
  onChange: (order: PlaceOrder) => void;
  /** How many rows the list is actually rendering. Below `SORT_MIN_PLACES` the control is absent:
   *  a list you can read in one screen is already in an order you can see. */
  listLength: number;
  /** The same split every other axis takes: inline on the phone, anchored on the desktop. A sort
   *  that floated while the filters beside it disclosed inline would be a fifth mechanism. */
  surface?: FilterSurface;
}) {
  // One option is not a choice. A library with no fix still has two, so this only fires if the
  // list of orders is ever narrowed further.
  if (orders.length < 2) return null;
  if (listLength < SORT_MIN_PLACES) return null;

  const current = orders.includes(order) ? order : (orders[0] as PlaceOrder);

  return (
    <MenuAxis
      tone="sort"
      axis={SORT_LABEL}
      accessibleAxis={SORT_BY_LABEL}
      value={SORT_OPTION_LABEL[current]}
      surface={surface}
    >
      <SortOptions
        surface={surface}
        current={current}
        orders={orders}
        onChange={onChange}
      />
    </MenuAxis>
  );
}

/**
 * **The orders, as menu rows — not as a second set of buttons.** Owner, 2026-09-02: *"I don't like
 * the interaction pattern of opening a dropdown and then showing another group of large buttons
 * inside it."* These are the same rows the three filter axes offer, from the same component, so a
 * reorder and a narrowing cannot end up looking like two different products.
 *
 * `Nearest` is absent rather than greyed when there is no fix — `availableOrders` decides, upstream
 * of here — so this never draws a row it cannot honour.
 */
function SortOptions({
  surface,
  current,
  orders,
  onChange,
}: {
  surface: FilterSurface;
  current: PlaceOrder;
  orders: readonly PlaceOrder[];
  onChange: (order: PlaceOrder) => void;
}) {
  return (
    <AxisRows
      surface={surface}
      groupLabel={SORT_BY_LABEL}
      value={current}
      options={orders.map((candidate) => ({
        value: candidate,
        label: SORT_OPTION_LABEL[candidate],
      }))}
      onChange={(next) => onChange(next as PlaceOrder)}
    />
  );
}

/** How long the list has to be before an order control earns its 44 px. Five rows fit on a phone
 *  at `full`; eight is the first length where the thing you are looking for is plausibly below the
 *  fold, which is the only state where re-ordering is faster than reading. */
export const SORT_MIN_PLACES = 8;

export function PlaceRow({
  place,
  onSelect,
  onHover,
  selected = false,
  secondLine,
}: {
  place: MapPlace;
  onSelect?: (place: MapPlace) => void;
  /**
   * **The pointer is on this row, or has left it** — the DOM half of the row↔pin coupling
   * (`W3-2`, `facelift-plan.md` §3a: *"pins and rows are the same object"*). The page lifts it to
   * the map, which quietens every other pin and draws this one lifted and named.
   *
   * Fired from `pointerenter`/`pointerleave` **and** from `focus`/`blur`, because a keyboard user
   * arrowing down the list is pointing at a row just as much as a mouse is, and the coupling is
   * exactly as useful to them.
   *
   * It reports attention, never intent: it does not select, does not persist, and **must never
   * move the camera** — see `map-page-client.tsx`, where the eight authorised movers are
   * enumerated and this is deliberately not one of them.
   */
  onHover?: (placeId: string | null) => void;
  /**
   * Whether this row is the open place. Draws the mint rule on the inline-start edge and a tinted
   * ground, and carries `aria-current="true"` — which is both the accessible fact and the hook the
   * styling reads, so the state is announced and drawn from one source rather than two.
   */
  selected?: boolean;
  /** Overrides the `Category · Locality` line. A collection's rows are built from a `places` row
   *  rather than from the caller's own `Spot`, so they have a locality to show and no `detail` to
   *  read it from; the alternative was putting `locality` on the map port, which exists precisely
   *  so no renderer detail leaks into it. */
  secondLine?: string;
}) {
  const locality = place.detail?.locality;
  const { tags } = enrichmentOf(place.detail);
  /**
   * Whether this row's pin is the model's own guess — 65–470 m out, median 327 m. The detail view
   * has said so since `location-certainty.ts` shipped and the row said nothing, so twenty-one of
   * thirty-one places looked exactly as placed as the matched ones until you opened them.
   *
   * A glyph and not a word, which is a real trade rather than a preference. The line it sits on is
   * `Category · Locality`, it is `line-clamp-1`, and the locality is what tells a Tel Aviv row from
   * a London one; on a 390 px phone `Approximate` would take about half of it, so the honest mark
   * would be paid for by hiding the city. The glyph is a dashed circle — the map convention for a
   * boundary that is not exact — at the muted weight of the line it annotates, so it registers as a
   * qualifier rather than a warning, and its meaning is carried by shape, never by colour alone.
   *
   * Its cost, stated: a glyph is not self-describing. What makes it decodable is one tap away —
   * the detail view's `~ Approximate location` mark beside the address, which carries
   * `Could be a street or two off.` on its own `title` — plus the tooltip on a pointer device here
   * and `APPROXIMATE_ROW_ANNOTATION` in the row's accessible name. (This paragraph named the
   * retired sentence `Approximate location — worked out from the video…` until 2026-09-02; B-T2
   * replaced the wording on the detail view without updating the comment that pointed at it.)
   */
  const certainty = locationCertainty(place.detail?.provenance?.sourceDataset);
  const approximateLabel =
    certainty?.isApproximate === true ? certainty.label : null;
  const rowName = rowAccessibleName(place.name, tags, place.visited);
  /**
   * `Saved 3 days ago`, against the reader's own clock. `new Date()` at render rather than a
   * prop: this is a phrase about *now*, so a value threaded down from the page would be the moment
   * the page rendered, which on a sheet that stays open is a different moment.
   */
  const savedElapsed = place.detail?.savedAt
    ? savedElapsedLine(place.detail.savedAt, new Date())
    : null;
  /**
   * How far this place is from **the user** (`L1-F11-T2`), or `null`, which is the normal case.
   *
   * Read from a context rather than taken as a prop so the three hosts of this row do not each have
   * to learn about geolocation. `null` covers every state but a held, accurate-enough fix — no
   * provider, never asked, refused, revoked, timed out, or a fix too rough to subtract from — so
   * there is no arrangement of props that renders a distance measured from anything but a real
   * position. The map's centre is not, and can never become, one of the inputs here.
   */
  const distanceKm = useNearMeDistance(place.id);
  const distanceLabel =
    distanceKm === null ? null : nearbyDistanceLabel(distanceKm);
  // `aria-label` replaces the button's content in the accessibility tree, so anything rendered
  // inside it that is not in the name is announced nowhere at all. Both annotations qualify the pin
  // rather than the place, so both come last; the distance first, because it is the one the user
  // asked for by pressing a control.
  // **`savedElapsed` is deliberately not here**, and the rule it follows is the one this name
  // already had rather than a new one. `rowAccessibleName` carries the name, the tags and the been
  // mark; the visible `Category · Locality` line and the note are *not* announced, because
  // `aria-label` replaces the content and this name is "which row do I want open", not "read me
  // the row". The tags are in it because without them twenty rows differ only by name. Elapsed
  // time is the opposite case: it is identical or near-identical across every row saved in one
  // afternoon, which is precisely the objection `savedOnLine`'s docblock raised against putting a
  // date on a row at all — visually it is answered by being quiet, and a screen reader has no
  // quiet. It becomes worth announcing when W5-2's sort control can order by it; that package owns
  // the decision and this comment is the handoff.
  const annotations = [
    ...(distanceLabel === null ? [] : [`${distanceLabel} away`]),
    ...(approximateLabel === null ? [] : [APPROXIMATE_ROW_ANNOTATION]),
  ];

  const body = (
    <>
      <RowMedia
        thumb={thumbnailOf(place.detail)}
        color={categoryColorVar(place.category)}
        tint={categoryTintVar(place.category)}
        approximateLabel={approximateLabel}
      />
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5 text-left">
        {/* `<bdi>` isolates a Hebrew or Arabic name inside this LTR row without right-aligning the
            row itself, and `line-clamp-1` replaces `truncate` because an ellipsis on an RTL string
            in an LTR box clips the *start* of the name — the half that identifies it
            (`docs/ux-library-at-scale.md` §4.2).

            **`break-words` is what makes the clamp's ellipsis reachable, and its absence was a
            silent cut.** `line-clamp-1` compiles to `-webkit-line-clamp`, whose ellipsis is drawn
            where the text *wraps* to the line that is being clamped away. A name with no break
            opportunity in it never wraps, so there is no second line, no ellipsis, and the glyph
            at the edge is simply sliced in half. Measured at 390x844 with a 56-character
            unbroken name: 159 px of ink outside a 294 px box, cut mid-letter, while the note line
            directly underneath ellipsed correctly because it happened to contain spaces — two
            truncation behaviours on one row, one of them saying nothing. `break-words` breaks only
            a word that cannot fit a line on its own, so every name that already wrapped is
            untouched, and none of this changes the `line-clamp`-over-`truncate` rule above. */}
        <p className="line-clamp-1 break-words font-heading text-sm font-bold text-foreground">
          <bdi>{place.name}</bdi>
        </p>
        {/* The city sits next to the category rather than being left off: it is the second thing
            you know about a saved place ("the London one"), and it is searchable — showing it keeps
            the rule that every match is explainable from the row you can see.

            Sentence case, not the raw enum in capitals. `RESTAURANT · TEL AVIV-YAFO` read as a
            database column, and shouting it made the least informative line on the row the loudest
            thing after the name. */}
        {/* The category line and the been badge share one row so the badge is beside the fact it
            qualifies rather than under the name competing with it. The line truncates; the badge
            does not shrink, because a half-drawn state marker is worse than a shorter city name. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {/* The muted line is the one that lifts, not the name: the name is already
              `text-foreground`, so brightening it would be a change with nowhere to go. */}
          <p className="line-clamp-1 break-words text-xs font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-couple motion-safe:ease-standard group-hover/row:text-foreground/80">
            <bdi>
              {secondLine ?? categoryLocalityLine(place.category, locality)}
            </bdi>
          </p>
          {place.visited && <BeenBadge />}
        </div>
        {/* Above the note, below the category, and rendered only when there are any — a row with no
            tags is the normal case (nothing was backfilled, so it is every row saved before
            extraction v2) and must look like a finished row, not a row missing a line. There is
            deliberately no placeholder, no skeleton and no "no tags yet". */}
        {tags.length > 0 && <TagChipRow tags={tags} />}
        {place.note && (
          <p className="line-clamp-1 break-words text-sm font-medium text-muted-foreground">
            {place.note}
          </p>
        )}
        {/* When you saved it, as elapsed time — the fact the library was ordered by and never
            showed (`growth-plan.md` §4: `created_at` was rendered as an absolute date, on the
            detail only). Last and quietest on the row: it is what makes the most-recently-saved
            order legible, not a reason to open one row rather than another.

            Absent rather than empty where there is no `savedAt`, which is every row rendered from
            a collection's shared place: those carry the place's facts and none of the viewer's own,
            so a saved time there would be a fact about somebody else. */}
        {/* **No `/70`, and it was the whole of a measured AA failure.** `--muted-foreground` is
            already the quiet step in the ramp; dimming it again spends the contrast budget twice
            and lands under the bar in *both* themes — measured on painted pixels, 2.68:1 light and
            4.03:1 dark at 11px. Undimmed it is 4.61–4.85 light and 5.81–7.35 dark on every ground
            this row sits on. Quiet comes from the token and from `text-micro`; alpha is the one
            hierarchy device that costs legibility, so it is not the one to reach for. */}
        {place.detail?.savedAt && (
          <p className="text-micro font-medium text-muted-foreground">
            {savedElapsed}
          </p>
        )}
      </div>
      {/* Trailing, aligned with the name, and only ever present while a real fix is held. `ms-auto`
          rather than `ml-auto` so it lands on the correct edge of an RTL list. `aria-hidden`
          because the row's own `aria-label` already carries it — announcing it twice is what the
          name's other annotations avoid. */}
      {distanceLabel !== null && (
        <span
          // Hidden from the tree only where the row's own `aria-label` already carries it, which is
          // the selectable row. A plain `<li>` has no label to be announced instead of, so hiding
          // the distance there would delete it rather than de-duplicate it.
          aria-hidden={onSelect !== undefined}
          className="ms-auto shrink-0 pt-1 text-xs font-medium tabular-nums text-muted-foreground motion-safe:transition-colors motion-safe:duration-couple motion-safe:ease-standard group-hover/row:text-foreground"
        >
          {distanceLabel}
        </span>
      )}
    </>
  );

  if (!onSelect) {
    return (
      <li className="flex min-h-16 items-start gap-3 border-b border-border/70 py-3.5 last:border-b-0">
        {body}
      </li>
    );
  }

  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(place)}
        // **The pointer half of the coupling, and the `mouse` guard is the whole of what makes it
        // safe on a phone.** A touch tap emits `pointerenter` before it emits `click`, so without
        // the check every tap would dim the entire map for the frame between the finger landing and
        // the camera starting to fly — a defect that is invisible on a desktop and ruins the
        // product on the device it was designed for first. `pointerType` is `'mouse'`, `'touch'` or
        // `'pen'`; only the first has a pointer that can rest somewhere without committing to it.
        //
        // `pointerleave` is *not* guarded, and that asymmetry is deliberate: it clears state, so
        // running it for a touch that never set anything costs nothing, while skipping it after a
        // pointer type changes mid-session would strand a highlight on the map.
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onHover?.(place.id);
        }}
        onPointerLeave={() => onHover?.(null)}
        // Focus is the keyboard's pointer. A user arrowing down this list gets the same coupling a
        // mouse user gets, which is the difference between the map being a picture beside the list
        // and the map being the other half of it.
        onFocus={() => onHover?.(place.id)}
        onBlur={() => onHover?.(null)}
        // The open place, said once. `aria-current` is the accessible fact *and* the hook the
        // selected styling reads (`aria-[current=true]:` below), so there is no second source of
        // truth to fall out of step with it. `"true"` rather than `"location"`: the list is not a
        // navigation, and a row is not a page.
        {...(selected ? { "aria-current": "true" as const } : {})}
        // The accessible name says what happens, not what the row contains — a screen reader user
        // hears the name twice otherwise (once as the button label, once as its content).
        //
        // The tags are the one exception, and they have to be: `aria-label` *replaces* the button's
        // content in the accessibility tree, so chips rendered inside it are announced nowhere at
        // all. A sighted user scanning the list gets "Nepalese, Market Stall" as the reason to open
        // this row rather than the one below it; without this, a screen reader user gets twenty
        // rows that differ only by name. Only the chips actually on screen are named, and the
        // overflow is a count, so the label stays a phrase rather than becoming a paragraph.
        // Last, after the tags: it qualifies the pin rather than the place, and it is the least
        // decisive of the row's facts for "is this the row I want open". `rowAccessibleName` still
        // builds the name; this appends the one thing it has no argument for.
        aria-label={
          annotations.length === 0
            ? rowName
            : `${isolate(rowName)}, ${annotations.join(", ")}`
        }
        // `data-vaul-no-drag`: inside the mobile sheet, a press that begins on this row would
        // otherwise be read as the start of a sheet drag, and the tap would be swallowed.
        data-vaul-no-drag
        // `PRESS_ROW` is the matrix's press column for a list row: a 1% squeeze at 90ms, which is
        // the only confirmation a phone can give that the tap landed on *this* row before the
        // camera starts flying. Shallower than a button's on purpose — see its docblock.
        className={cn(
          // No `motion-safe:transition-colors` here: `PRESS_ROW` carries `PRESS_BEAT`'s
          // `motion-safe:transition`, whose property list already contains colour, so a second
          // declaration only meant a second duration for the same fade. Deleted rather than
          // prefixed — the move `button.tsx`, `bottom-nav.tsx`, `share-panel.tsx` and
          // `add-to-collection.tsx` all made, and the two places in this file that had not.
          // **`ps-2.5` is what puts the selected rule beside the row rather than on top of it.**
          // The rule below is `before:start-0` on a row that had no inline padding at all, so at
          // 2 px wide it was painted *over* the first column of the thumbnail — measured on the
          // desktop panel, where the list content sat flush against it. 10 px of inline-start
          // padding is the gap; `pe-1` keeps the trailing distance off the panel's own edge.
          "relative flex min-h-16 w-full items-start gap-3 rounded-lg py-3.5 ps-2.5 pe-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
          // **A named group, never a bare `group`.** These rows nest inside other grouped
          // containers on `/collections`, and an unnamed group would let a parent's hover light up
          // every row inside it.
          "group/row",
          // The open place: a tinted ground and a 2px rule on the inline-start edge. `start-0`
          // rather than `left-0` because this list renders Hebrew names and the rule belongs on the
          // edge the text starts at — the same reason the distance uses `ms-auto`.
          "aria-[current=true]:bg-primary/8",
          "aria-[current=true]:before:absolute aria-[current=true]:before:inset-y-2 aria-[current=true]:before:start-0 aria-[current=true]:before:w-0.5 aria-[current=true]:before:rounded-full aria-[current=true]:before:bg-primary",
          PRESS_ROW,
        )}
      >
        {body}
      </button>
    </li>
  );
}

/**
 * **Going and getting the picture back — the client half of `POST /api/sources/thumbnail`.**
 *
 * A TikTok thumbnail is a signed CDN URL whose signature dies **~47 hours** after it was fetched
 * (measured 2026-08-31 off the `x-expires` parameter of all three real rows in the local database;
 * `0003`'s "~6-month-expiring" comment is wrong by roughly 90×). Until this, the entire response
 * was `onError` → hide, permanently for that mount, and nothing anywhere re-called oEmbed for an
 * existing source. So a library goes blank two days after it was built, all of it at once, and it
 * does not look like an expiring link — it looks like the app lost the user's stuff.
 *
 * ## Why this is a coordinator and not four lines in an `onError`
 *
 * `onError` does not fire once. It fires for **every row on screen**, during parse, before
 * hydration, and the failures are perfectly correlated because the URLs all expired on the same
 * afternoon. The naive version turns one scroll into one upstream call per row against a **500 a
 * day shared with the import path, every agent and the owner**. Four rules, in this object:
 *
 *  1. **One request per `sourceId`, ever, per page load.** The outcome is memoised, so twenty rows
 *     that share a source cost one request and nineteen map reads — and the nineteen get the
 *     refreshed URL for free rather than each discovering it.
 *  2. **Coalesced while in flight**, so rows that fail in the same tick join one request instead
 *     of racing to make several.
 *  3. **Serialised, concurrency 1.** Eight refreshes are eight sequential ~600 ms calls, not a
 *     burst. A burst is what a shared quota notices.
 *  4. **Hard-capped at `MAX_THUMBNAIL_REFRESHES_PER_PAGE` per page load.** Past it every caller is
 *     answered `gone` without a request, and the row draws its category pin. So the client's own
 *     worst case is a fixed 8 upstream calls per page load, whatever the library size.
 *
 * None of this is the real limit — a client is untrusted and can be made to say anything. The
 * ceiling that binds is the route's, in `_lib/refresh-budget.ts` and in the durable per-source
 * cooldown it reads out of Postgres. This exists so the *honest* client is not the thing that
 * spends the budget.
 *
 * ## `gone` is one word for several endings, deliberately
 *
 * A refused budget, a 429, a network error, a post TikTok will not return, and a post with no
 * thumbnail all come back as `gone`, because the row does the same thing for all of them: draw the
 * category pin and stop asking. The distinction that matters is recorded where it can be acted on
 * — on the `sources` row and in the route's log line — not carried into a component that has one
 * fallback. What the user sees when a post is genuinely deleted is that same pin, and nothing
 * else: no badge, no "this video was removed". oEmbed's 400 is opaque across deleted, private and
 * region-locked (VERIFIED `04` §5), so a badge would assert a cause we cannot know; and everything
 * that made the save worth having — name, address, note, category, the caption quote, the
 * coordinates, the TikTok link — is ours and survives. The link is the honest artefact: pressing
 * it shows TikTok's own message about its own post, which is TikTok's to give.
 */
export type ThumbnailRefreshOutcome =
  { readonly kind: "url"; readonly url: string } | { readonly kind: "gone" };

/** See rule 4 above. Roughly a screenful of rows plus the open detail view. */
export const MAX_THUMBNAIL_REFRESHES_PER_PAGE = 8;

const GONE: ThumbnailRefreshOutcome = { kind: "gone" };

/** What the coordinator needs from the network, narrowed to the three things it reads so a test
 *  can supply it without a `Response`, a `fetch` polyfill or a jsdom this repo does not have. */
export interface ThumbnailRefreshTransport {
  (body: { readonly sourceId: string; readonly failedUrl: string }): Promise<{
    readonly ok: boolean;
    readonly status: number;
    readonly body: unknown;
  }>;
}

export interface ThumbnailRefresher {
  /** Ask for a live URL to replace the one in `thumb`. Never rejects. */
  refresh(thumb: ThumbnailRef): Promise<ThumbnailRefreshOutcome>;
  /** Granted requests so far this page load. Diagnostics for tests; never read for a decision. */
  spent(): number;
}

export function createThumbnailRefresher(options: {
  readonly post: ThumbnailRefreshTransport;
  readonly maxRequestsPerPage?: number;
}): ThumbnailRefresher {
  const max = options.maxRequestsPerPage ?? MAX_THUMBNAIL_REFRESHES_PER_PAGE;
  const settled = new Map<string, ThumbnailRefreshOutcome>();
  const inFlight = new Map<string, Promise<ThumbnailRefreshOutcome>>();
  let spent = 0;
  /** The serialisation chain (rule 3). Every link is made non-rejecting before it is chained on,
   *  so one failure cannot poison the queue for every request behind it. */
  let tail: Promise<void> = Promise.resolve();

  async function ask(
    sourceId: string,
    failedUrl: string,
  ): Promise<ThumbnailRefreshOutcome> {
    let response;
    try {
      response = await options.post({ sourceId, failedUrl });
    } catch {
      // Offline, aborted, CORS, anything. Not worth a second attempt this page load.
      return GONE;
    }
    if (!response.ok) return GONE;

    const body = (
      typeof response.body === "object" && response.body !== null
        ? response.body
        : {}
    ) as { status?: unknown; url?: unknown };
    // `url !== failedUrl` is the guard that keeps a refresh from handing back the corpse: if the
    // route answered with the same string the browser just failed on, retrying it is a second
    // failed image request for a certain outcome.
    if (
      body.status === "ok" &&
      typeof body.url === "string" &&
      body.url !== failedUrl
    ) {
      return { kind: "url", url: body.url };
    }
    return GONE;
  }

  return {
    refresh(thumb) {
      // No `sources` row behind this URL — it came from `0016`'s frozen denormalized copy, and the
      // route takes a source id, never a URL. Genuinely unrefreshable, and cheap to say so.
      if (thumb.sourceId === null) return Promise.resolve(GONE);
      const sourceId = thumb.sourceId;

      const already = settled.get(sourceId);
      if (already !== undefined) return Promise.resolve(already);

      const running = inFlight.get(sourceId);
      if (running !== undefined) return running;

      if (spent >= max) return Promise.resolve(GONE);
      spent += 1;

      const failedUrl = thumb.url;
      const run = tail.then(
        () => ask(sourceId, failedUrl),
        () => ask(sourceId, failedUrl),
      );
      tail = run.then(
        () => undefined,
        () => undefined,
      );

      const settling = run.then((outcome) => {
        settled.set(sourceId, outcome);
        inFlight.delete(sourceId);
        return outcome;
      });
      inFlight.set(sourceId, settling);
      return settling;
    },

    spent: () => spent,
  };
}

/** The one per-tab instance. Module scope is the point: the caps in `createThumbnailRefresher` are
 *  per page load, and a per-component instance would multiply them by the number of rows. */
const thumbnailRefresher = createThumbnailRefresher({
  post: async (body) => {
    // Same-origin, so the session cookie rides along and no `Referer` reaches TikTok — the refresh
    // never talks to the CDN, only to us. The `no-referrer` policy on the `<img>` elements below
    // is untouched and stays the only thing that speaks to TikTok's servers.
    const response = await fetch("/api/sources/thumbnail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { ok: response.ok, status: response.status, body: parsed };
  },
});

/**
 * The URL to draw and the handler to call when it fails — shared by the row's 44 px square and the
 * detail view's banner, so the two cannot drift into different expiry behaviour.
 *
 * **Hiding first, then asking**, rather than leaving the dead image up during the round trip:
 * the browser has already given up on it, so what is on screen is a broken-image glyph, and the
 * fallback exists precisely to not show one. The picture returns if the answer brings one.
 *
 * The `state.base !== base` reset is React's documented adjust-state-during-render pattern, not a
 * missing effect. It matters here because both hosts are recycled across places — the sheet's list
 * re-renders rows with new props rather than remounting them, so state keyed to the previous
 * place's URL would show one place's still on another place's row.
 */
function useRefreshableThumbnail(thumb: ThumbnailRef | null): {
  url: string | null;
  onFailure: () => void;
} {
  const base = thumb?.url ?? null;
  const [state, setState] = useState<{
    base: string | null;
    url: string | null;
  }>(() => ({
    base,
    url: base,
  }));
  if (state.base !== base) setState({ base, url: base });
  const url = state.base === base ? state.url : base;

  return {
    url,
    onFailure: () => {
      if (thumb === null || url === null) return;
      const dead = url;
      setState({ base, url: null });
      void thumbnailRefresher
        .refresh({ ...thumb, url: dead })
        .then((outcome) => {
          // `outcome.url !== dead` is checked again here and not only in `ask`: a memoised outcome
          // from a *different* row can carry a URL that has since died for this one.
          if (outcome.kind === "url" && outcome.url !== dead)
            setState({ base, url: outcome.url });
        });
    },
  };
}

/**
 * **The row's leading square: the post's own still, or the category pin when there is not one.**
 *
 * `source_thumbnail_url` has been on `Spot` since `0016` and reached the detail view only
 * (`growth-plan.md` §4 lists it as "detail only — **not on any list row**"). Twenty rows that
 * differ by name and a coloured disc are twenty rows a person reads; twenty rows that carry the
 * frame they saved are twenty things a person recognises. That is the whole of W5-1's first half.
 *
 * **The fallback is part of the feature, not a nicety.** These are signed TikTok CDN URLs with an
 * expiry we do not store (`SpotSource.media`, `Spot.sourceThumbnailUrl` — roughly six months), and
 * the majority of the library predates the column entirely. So there are three states and all three
 * are ordinary: an image, no image, and an image that 404s halfway down a scroll. **The last one
 * is now the majority state of any library older than two days** (the signed URLs live ~47 hours),
 * so it is no longer "hide it and never retry": `useRefreshableThumbnail` asks the server to
 * re-run oEmbed for this source and swaps the fresh URL in if one comes back. The pin disc is
 * still where it lands when nothing does — a refused budget, a deleted post, or a save with no
 * `sources` row behind it — rather than a broken-image glyph or a hole where a row's identity
 * should be.
 *
 * **One box size for both**, 44 px, so the text column starts at the same x on every row. A list
 * whose leading element is 32 px on some rows and 48 px on others has a ragged left edge, which is
 * the most visible kind of misalignment in a vertical list. The shapes differ inside it — a
 * `rounded-lg` still, a `rounded-full` pin — because they are different kinds of thing and the
 * shape is what says so.
 *
 * `referrerPolicy="no-referrer"` is load-bearing and the reason is privacy rather than politeness:
 * without it every row on screen sends a `Referer` to TikTok's CDN, which would let TikTok
 * correlate its own signed URLs with the device asking for them — "which posts this person saved".
 * The detail view's own thumbnail carries the same attribute for the same reason; on a list it is
 * twenty requests instead of one.
 *
 * `loading="lazy"` and `decoding="async"`: a 30-row library is 30 network images, and the ones
 * below the fold must not compete with the map's own tiles for the first paint.
 */
function RowMedia({
  thumb,
  color,
  tint,
  approximateLabel,
}: {
  /** The URL to draw plus what is needed to ask for a live one — `thumbnailOf`'s output, which
   *  prefers the joined `sources.thumbnail_url` (refreshable) over `0016`'s frozen copy (not). */
  thumb: ThumbnailRef | null;
  /**
   * The category's colour as a **CSS variable reference** — `var(--category-cafe)` — not a literal.
   *
   * `categoryColorVar` rather than `categoryDisplay(...).color`, and the difference is the whole of
   * how this disc follows the theme. Those tokens have always carried both themes and have always
   * switched under `.dark`; they were simply read by nothing, so a literal hex here painted a
   * daylight brown on a night surface. A `var()` follows the theme with no hook, no context, no
   * prop and no re-render.
   *
   * The map's pin keeps the literal, and that is not an inconsistency: a MapLibre paint expression
   * is evaluated by the GL renderer and cannot resolve a custom property, so the GL side takes
   * `placePalette` and every DOM side takes the `var()`. `ui/place/palette.ts`'s header states the
   * split; this is the DOM half of it.
   */
  color: string;
  /**
   * The same colour as a **ground** rather than as ink — `categoryTintVar`, which wraps the token
   * above in a `color-mix()` whose strength is `--tint-strength`.
   *
   * A second prop rather than a strength passed down, because the composition rule belongs in the
   * presentation layer with the palette it composes: `category-display.ts` decides what a tinted
   * category looks like, and this component only paints what it is handed.
   */
  tint: string;
  /** Non-null when the coordinate is the model's own guess, and then also the tooltip. */
  approximateLabel: string | null;
}) {
  const { url, onFailure } = useRefreshableThumbnail(thumb);

  /* The dashed ring when the coordinate is the model's own guess. The mark belongs on this box and
     not beside the text: it is drawn on the thing the uncertainty is about, it costs the city name
     no width on a 375 px row, and running down a list the dashed ring reads against the solid ones
     above and below it. Tried trailing the category line first — a lone dashed circle after
     `Restaurant · ת״א` attaches to nothing and reads as a smudge. */
  const approximate = approximateLabel !== null;

  if (url !== null) {
    return (
      <span
        aria-hidden
        title={approximateLabel ?? undefined}
        style={approximate ? { borderColor: color } : undefined}
        className={cn(
          // **The box never changes size, in any state.** The hover growth lives on the picture
          // inside it (below), not here. Measured at 1440x900 with the scale on this element: on
          // hover it went 44 px at x=24 to 48.4 px at x=21.8, so the still poked **2.2 px out of
          // the row's own hover ground and out of the panel's 24 px gutter** on the leading edge,
          // and 2.2 px past the row band above and below. One row out of alignment with every
          // other row is the most visible kind of defect in a vertical list, and it is what the
          // owner saw as the thumbnail "leaking out".
          //
          // Zooming the contents under a fixed mask is also the better shape mechanically: the
          // `overflow-hidden` here starts doing real work, the transform lands on a leaf `<img>`
          // rather than on a box that clips, and nothing the list measures ever moves.
          "mt-0.5 block size-11 shrink-0 overflow-hidden rounded-lg bg-muted",
          approximate && "border border-dashed",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary, expiring, signed
            third-party CDN URL: `next/image` would proxy every one of them through our own
            optimizer, which is a cost and a second place the referrer question would have to be
            answered. The detail view's `SourceMediaThumbnail` is a plain `<img>` for the same
            reason. */}
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={onFailure}
          /* **`onError` alone is not enough on a server-rendered list, and this was measured
             rather than reasoned.** The markup ships from the server with the `src` already on it,
             so the browser starts the request during parse — before React has hydrated and before
             any handler is attached. An image that fails in that window never calls `onError` at
             all, and the row keeps the browser's own broken-image glyph forever: exactly the hole
             the fallback exists to prevent. Caught by looking at a 1440x900 screenshot of the
             desktop panel, where the list is server-rendered; the mobile sheet mounts its list
             after a drag, i.e. after hydration, so there it worked and looked fine.

             A ref callback runs at attach, which is the first moment we can ask. `complete` with a
             zero `naturalWidth` is the DOM's way of saying "finished, and there is no image" — the
             only reliable read of a failure that already happened. */
          ref={(node) => {
            if (node?.complete === true && node.naturalWidth === 0) onFailure();
          }}
          className={cn(
            "size-full object-cover",
            // The picture pushes in a little while the pointer is on the row — the same 160 ms the
            // pin on the map lifts in, so the two halves of the coupling read as one gesture
            // rather than two effects that happen to fire together. `group-hover/row:` reaches in
            // from `PlaceRow`'s button; a plain `group` would also catch the grouped containers
            // this row nests inside on `/collections`.
            //
            // On the picture and not on its box, so the row's leading square keeps its 44 px
            // footprint in every state — see the box's own class list for the measurement that
            // moved it here. `transition-transform` in Tailwind v4 declares
            // `transform, translate, scale, rotate`, so it does animate the `scale` property
            // `scale-110` sets; measured on the running app, `transition-duration: 0.16s`.
            "motion-safe:transition-transform motion-safe:duration-couple motion-safe:ease-standard group-hover/row:scale-110",
          )}
        />
      </span>
    );
  }

  /* The row's own pin, in the category's colour — the same colour the map draws it. Two surfaces
     showing one place used to agree on nothing but its name; a brown cup on the map and a brown
     row are visibly the same café. */
  return (
    <span
      aria-hidden
      title={approximateLabel ?? undefined}
      style={{
        // `categoryTintVar` rather than a `color-mix()` written here, and rather than the
        // `${color}1F` hex-alpha suffix that preceded it: a `var(--category-cafe)` is a reference,
        // not eight characters of hex, so a suffix would produce `var(--category-cafe)1F` and no
        // colour at all. The `12%` that replaced `1F` (31/255) was the second half of the same
        // mistake — a percentage inside a colour function is an alpha, and an alpha composites
        // against whatever is behind it. `--tint-strength` is that number, per theme.
        backgroundColor: tint,
        color,
        ...(approximate ? { borderColor: color } : {}),
      }}
      className={cn(
        "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full",
        approximate && "border border-dashed",
      )}
    >
      {/* Same lift as the thumbnail arm above, on the same element type — the *contents* of the
          leading square, never the square. A row has one leading square and it behaves the same
          way whichever of the two it is drawing, and neither of them ever changes the 44 px the
          text column starts after. */}
      <MapPin className="size-5 motion-safe:transition-transform motion-safe:duration-couple motion-safe:ease-standard group-hover/row:scale-110" />
    </span>
  );
}

/**
 * The one search field, shared by the mobile sheet and the desktop panel so both present (and
 * write to) the identical control. Controlled by the caller — the query lives in
 * `map-page-client.tsx` because it filters the map's pins too, not only this list.
 *
 * `data-vaul-no-drag` matters here: without it a drag that starts on the field is a sheet drag, so
 * selecting text inside the input would haul the whole sheet up and down.
 *
 * `type="search"` for the mobile keyboard's search affordance, but the browser's own clear "×" is
 * suppressed (`[&::-webkit-search-cancel-button]:hidden`) in favour of the button below: the native
 * one is a 12px grey glyph that fails a touch target on every phone, and it is invisible in dark
 * mode on WebKit. `Escape` clears too, which is what a keyboard user reaches for first.
 */
export function PlaceSearchField({
  value,
  onChange,
  className,
  // What this field searches, used as both the visible placeholder and the accessible name so the
  // two can never disagree. A collection's own list passes its own wording; everywhere else the
  // library is what is being searched.
  label = "Search your places",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
}) {
  const filtering = isSearchActive(value);

  return (
    <div data-vaul-no-drag className={cn("relative", className)}>
      <Search
        className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            // Stop it here: at `full` the sheet is a dialog, and Escape would otherwise be read as
            // "close", throwing the user out of the list they are searching.
            event.preventDefault();
            event.stopPropagation();
            onChange("");
          }
        }}
        aria-label={label}
        placeholder={label}
        className={cn(
          "h-12 rounded-lg pl-10 text-sm font-medium [&::-webkit-search-cancel-button]:hidden",
          filtering && "pr-12",
        )}
      />
      {filtering && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          // **Two controls carried the identical accessible name.** This icon × clears the
          // *field*; `ClearSearchEscape` further down clears the search **and** the scope, and its
          // visible text is `Clear search`. Both can be on screen at once, so a screen-reader user
          // tabbing heard "Clear search, button" twice with nothing to tell them apart — and the
          // two do different things. It also cost another agent two build cycles when its own
          // Playwright locator silently resolved to the wrong one.
          //
          // Only the `aria-label` is changed here. The visible string is `product-lead`'s call and
          // is not in `overnight-copy-deck.md` yet, so inventing one would be putting words in the
          // product's mouth to fix an accessibility bug that the label alone fixes.
          aria-label="Clear the search field"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 size-9 -translate-y-1/2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}

/** The one control that undoes a search matching nothing anywhere. A tag filter is undone by its
 *  own pill above the list, so it gets no second control here. */
/**
 * **What a filter combination that matches nothing says, and where it says it.**
 *
 * Owner ruling, 2026-09-02: the message belongs *where the places are*, not in the header, and it
 * is one generic sentence with a way out — not a line naming the axes that emptied it. The header
 * already carries a count and a scope; making it also carry the failure put the explanation a
 * whole control row away from the space it was explaining, and the reader's eye is on the empty
 * list, not on the heading.
 *
 * Generic on purpose. `Nothing tagged "Brunch + Desserts"` reads as a report about tags, so a
 * category or a visit filter doing the same thing produced a different sentence — three ways to
 * say one thing, and each one a string to keep true. One sentence covers every combination and
 * cannot go stale when an axis is added.
 *
 * The button is the whole point: `active-area.ts:79` records that an empty state without the
 * clearing affordance *in it* is a dead end, and the filter row's own `Clear` is above the fold
 * only sometimes. This is the same escape hatch `ClearSearchEscape` gives the search case, in the
 * same place, so the two empty results behave alike.
 */
export function ClearFiltersEscape({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      {/* **A composed empty state, not a sentence with a face next to it** — owner, 2026-09-02:
          *"do something like the 'page not working' but for filter."* So it takes the shape that
          pattern has everywhere: mark, then what happened, then what to do, stacked and centred in
          the space that has nothing in it.

          `nothingFound` is flat-eyed and flat-mouthed — neutral, not sad. That matters more here
          than on the import screen `no-places-screen.tsx` borrows it from: this state is common
          and self-inflicted (you ticked two tags), so the mascot must not read as the product
          being disappointed *at* you. It is `size-16` rather than that screen's `size-12` because
          here it is the composition's anchor rather than a kicker beside a caption, and §11.21
          bans bare margin utilities on it, so the column's `gap` does every bit of the spacing. */}
      <CrumbMascot mood="nothingFound" className="size-16 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-heading text-base font-extrabold text-foreground">
          {NO_FILTER_MATCHES_LINE}
        </p>
        <p className="text-sm font-medium text-muted-foreground">
          {NO_FILTER_MATCHES_HINT}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onClearFilters}
        className="h-11 rounded-lg px-4 text-sm font-bold"
      >
        {CLEAR_FILTERS_LABEL}
      </Button>
    </div>
  );
}

export function ClearSearchEscape({
  onClearSearch,
}: {
  onClearSearch: () => void;
}) {
  return (
    <div className="flex flex-col items-start py-6">
      <Button
        type="button"
        variant="outline"
        onClick={onClearSearch}
        className="h-11 rounded-lg px-4 text-sm font-bold"
      >
        Clear search
      </Button>
    </div>
  );
}

/**
 * The rest of your library, under the places the header is about.
 *
 * **This is what replaced `Elsewhere`** (owner ruling, 2026-08-30; the fallback written into
 * `docs/ux-stable-area-list.md`:114). That section listed the user's other *areas* — a country row
 * you expanded to reach a city row you tapped to change the whole list — and on a real library it
 * rendered as five Israeli cities filed under `Israel 4 places`. The plan had already refused a
 * city switcher twice (`current-state.md` §9.3, `ux-map-is-the-query.md` §8); the section overturned
 * that refusal and the owner has put it back. So the places outside the scope are simply the next
 * rows: no tree, no expansion state, no tap that means something different from every other tap in
 * the scroll.
 *
 * The rule and the heading stay, and they are not decoration. `3 places in תל אביב-יפו` above eight
 * rows would be a count that describes neither the list nor anything else, and this is still the one
 * place in the scroll where the rows stop being about the header. What it is *not* any more is a
 * control: nothing here is focusable, and the rows below it are ordinary `PlaceRow`s that open a
 * place, which is what every other row in the list already does.
 *
 * `flush` drops the rule for the states that render no rows above it (`No matches in London`,
 * `You've been to all of them in London`) — a divider between a heading and the first thing under it
 * separates nothing. Those states are also the reason this section is rendered outside
 * `heading.empty`: it is what they escape to, and the spec granted them no button precisely because
 * the matches were listed underneath.
 */
export function EverywhereElse({
  places,
  flush = false,
  onSelect,
  onHover,
  selectedId,
  selection,
}: {
  places: readonly MapPlace[];
  flush?: boolean;
  onSelect?: (place: MapPlace) => void;
  /** The coupling reaches these rows too: they are ordinary `PlaceRow`s and a place outside the
   *  current area is exactly the one whose pin the user most needs pointing out. */
  onHover?: (placeId: string | null) => void;
  selectedId?: string | null;
  /** Present only while the library is being picked over. These rows are in the same scroll and in
   *  the same `Select all`, so leaving them as ordinary rows would make the toolbar's count a claim
   *  about half the list. Absent — the normal case — nothing here changes. */
  selection?: LibrarySelection;
}) {
  if (places.length === 0) return null;

  return (
    <section className={flush ? "" : "mt-5 border-t border-border/70 pt-4"}>
      {/* `px-2.5` follows `PlaceRow`'s own inline padding, so the heading still lines up
          with the names under it now that the rows are inset off the selected rule. */}
      <h3 className="px-2.5 pb-1.5 font-heading text-sm font-extrabold tracking-tight text-foreground">
        Everywhere else
      </h3>
      <ul>
        {places.map((place) =>
          selection !== undefined && place.savedPlaceId !== undefined ? (
            <SelectablePlaceRow
              key={place.id}
              place={place}
              checked={selection.picked.has(place.savedPlaceId)}
              onToggle={() => selection.toggle(place.savedPlaceId as string)}
            />
          ) : (
            <PlaceRow
              key={place.id}
              place={place}
              {...(onSelect ? { onSelect } : {})}
              {...(onHover ? { onHover } : {})}
              selected={selectedId === place.id}
            />
          ),
        )}
      </ul>
    </section>
  );
}

/**
 * The heading for a library with nothing in it (`ux-map-is-the-query.md` §5). It replaces the
 * viewport heading outright rather than sitting beside it: `Nothing saved in this area` would blame
 * the camera for a state no amount of panning can fix, and a first-run screen that reports on an
 * area is answering a question nobody has asked yet.
 */
/**
 * The play glyph's accessible name — the button's only visible-to-assistive-tech text, since the
 * control is a glyph on a photograph and has no label beside it.
 *
 * **`TikTok video`, the adjective form, not the bare noun.** `voice-and-vocabulary.md` §3.1 rules
 * that the name is an adjective and never a noun, and §3's bare-*video* anaphor clause is not
 * available here: it may only refer back to a TikTok video the same screen has already named, and
 * an `aria-label` is read on its own with nothing before it.
 *
 * **Not in `overnight-copy-deck.md`, and this is flagged rather than quietly settled.** It has no
 * `C` id because the copy for this control is decided with the first-press disclosure the security
 * ruling requires, which is another lane's, and inventing a phrase for a gate that does not exist
 * yet would put words in the product's mouth. This is the plainest compliant sentence for what the
 * press expresses, held here as a default the host may override through `playSourceLabel` — see
 * `PlaceDetail`'s prop.
 */
export const PLAY_SOURCE_LABEL = "Play this TikTok video";

/** `C131`. **The visible axis word**, printed before the current value: `Sort: Recently saved`.
 *  It used to be an `aria-label` on a group of chips and nothing else — so the word existed only
 *  in the accessibility tree, and on screen the control was two unexplained values. */
export const SORT_LABEL = "Sort";

/** The control's accessible name, and the visible `Sort` is contained in it — the axis stated as a
 *  verb phrase, because "Sort" alone read out before a value announces as a command. */
export const SORT_BY_LABEL = "Sort by";

/** `C132`–`C134`, `overnight-copy-deck.md` §4.2. `A–Z` takes an **en dash**, matching the
 *  product's typography elsewhere; it is not a hyphen and must not be normalised into one. */
export const SORT_OPTION_LABEL: Record<PlaceOrder, string> = {
  recent: "Recently saved",
  nearest: "Nearest",
  alpha: "A\u2013Z",
};

export const EMPTY_LIBRARY_HEADING = "Your map starts here.";

/**
 * The one line under that heading. It states what the product does in the product's own voice — it
 * names the artefact (a map) rather than the mechanism, and it uses no implementation vocabulary.
 * Shared so the sheet and the panel cannot drift into two first sentences.
 */
export function EmptyLibraryLine() {
  return (
    <p className="text-sm font-medium text-muted-foreground">
      Paste a TikTok link and the places it talks about land on your map.
    </p>
  );
}

/**
 * The sheet's empty-library body: the line, then the product's primary action full-width in the
 * thumb zone. The desktop panel does not use this — it already carries `Add a TikTok link` in its header
 * block, and a second copy of the same button would be the only thing on that screen twice.
 *
 * Nothing else appears here on purpose: no carousel, no checklist, no progress meter, no `0 places`,
 * no empty-box illustration, and no permission prompt of any kind.
 */
export function NoPlacesYet({ onAddTikTok }: { onAddTikTok: () => void }) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <EmptyLibraryLine />
      <Button
        type="button"
        className="h-12 w-full gap-2 rounded-lg text-sm font-bold"
        onClick={() => onAddTikTok()}
      >
        {/* **The primary call to action, and the one place the solid weight is used.** The
            outline weight disappears into 14px bold text at button scale; measured against it on a
            real mint button at 16/20/24px, 20 at `gap-2` is what holds its own without outweighing
            the label. `size-4`/`gap-1.5` was the first pass and reads as a toolbar icon.

            **Centred with the label, not pinned left.** Left-glyph/centred-label is the
            social-sign-in shape and is the shape of `Continue with TikTok`, the one button TikTok
            actually licenses — borrowing it to evoke a platform whose mark we may not use is trade
            dress with deniability. The composition is ours; the word is the permitted use. */}
        <PlatformMark variant="solid" className="size-5" />
        Add a TikTok link
      </Button>
    </div>
  );
}

/**
 * The place `PlaceDetail` renders — deliberately narrower than `MapPlace`, which structurally
 * satisfies it, so `/map` passes its pin object unchanged.
 *
 * It is narrower so that a caller with **no `saved_places` row** can be honest. A collection item
 * has the shared `places` facts and nothing else; asked for a `MapPlace` it would have to invent an
 * `id`, a `note` and a `visited` for a row that does not exist. Nothing private lives here at all:
 * the caller's own save arrives as the separate `savedPlace` prop, and `detail` is optional.
 */
export interface DetailPlace {
  readonly name: string;
  readonly category: ProductCategory | null;
  readonly lat: number;
  readonly lng: number;
  /** The source post's link, where the caller's own save carries one. `undefined`, not omitted, so
   *  a caller on the collection path has to say out loud that it has no source to show. */
  readonly sourceUrl: string | undefined;
  /** The shared place facts, plus whatever the caller's own save adds. A caller passing only
   *  shared facts (`SharedOnlyPlaceFacts`) renders no private field — see `domain/places/spot.ts`
   *  for why that is a property of the data here and not of a flag. */
  readonly detail?: PlaceDetailFacts;
}

export function PlaceDetail({
  place,
  savedPlace,
  nearby,
  onSelectNearby,
  onClose,
  variant = "sheet",
  floatingBarPx = 0,
  sheetContentHeight,
  onPanelOpen,
  primaryAction,
  fields,
  footer,
  onPlaySource,
  playSourceLabel = PLAY_SOURCE_LABEL,
  sourcePlayer,
}: {
  place: DetailPlace;
  /**
   * The caller's own `saved_places` row for this place, or `null` when they have none.
   *
   * **Required, and deliberately not defaulted.** Every mutation on this screen — rename, been,
   * category, note, remove, add-to-collection — writes to that row, and this component used to
   * take the id from `place.id`. That is a saved-place id on `/map` and a *collection item* id on
   * `/collections/[id]`, so a second host silently aimed five writes at a row its caller does not
   * own. Making the caller name the row is what stops that; `null` says "no row", and every
   * mutation block below is gated on it.
   *
   * **One object rather than an id and a `visited` beside it**, because the two are facts about
   * the same row and a caller cannot have one without the other: the id says where to write and
   * `visited` says what that row currently holds. Passed separately they can disagree, and the
   * failure is silent — an id with a null `visited` would render the read-only screen, so every
   * control on `/map` would quietly vanish with nothing raised. This shape cannot express that.
   */
  savedPlace: {
    readonly id: string;
    readonly visited: boolean;
    /** `saved_places.visited_at` — when the been mark was made here. Optional and only optional:
     *  `0006`'s CHECK allows `visited` with no timestamp, so a caller that has none is telling the
     *  truth rather than forgetting a field. Same object as the other two for the reason above —
     *  it is a third fact about the one row. */
    readonly visitedAt?: Date;
  } | null;
  /**
   * Your other saved places within a short walk of this one, nearest first, already computed by
   * the caller (`ui/place/nearby.ts`).
   *
   * The caller computes it because only the caller knows what "your places" means on its surface:
   * `/map` has the whole library, and `/collections/[id]` deliberately has none of the viewer's
   * own overlay and must not grow a second library through this door. Omitted renders nothing.
   */
  nearby?: readonly NearbyPlace[];
  /** Opening one of them. Omitted, they render as plain text rather than as dead buttons. */
  onSelectNearby?: (id: string) => void;
  onClose: () => void;
  /** `'sheet'` (default, mobile): an X that fully deselects. `'panel'` (desktop, retired — no
   *  caller renders this anymore now that detail lives entirely in the map popover, kept only so
   *  the variant union documents where it used to apply): the same `onClose` call instead read as
   *  "back to the list" — there was no second panel to close into, so a back chevron was the
   *  honest affordance for what actually happened. `'popover'` (desktop, `lg+`): a compact shell
   *  for `MapSurfaceMapcn`'s pin-anchored `MapPopup` — narrower than `panel`, a plain "×" close
   *  button (there is no list to return to, the left list panel is untouched by selection), and
   *  its own scroll/max-height so a long detail can't blow off the edge of the map.
   *  `'hosted'`: **the host draws its own navigation and this renders none** — the collection route
   *  puts a back arrow in a header row of its own, aligned with the collection list's back control
   *  so the header does not jump when the view changes, and a second close affordance inside the
   *  scroll column would be two ways out of one screen. It also takes the host's `px-4` gutter
   *  rather than this view's `px-5`, because that column has to line up with the list rows behind
   *  the same arrow and a 4 px sideways shift on every open is more visible than the difference. */
  variant?: "sheet" | "panel" | "popover" | "hosted";
  /**
   * **The play affordance's press — the seam, and the whole of what this file owns about playback.**
   *
   * Omitted, no glyph is drawn at all: an affordance that expresses an intent nothing acts on is
   * worse than none. Supplied, a small button appears on the source still and this is what a press
   * calls. It mounts nothing. `docs/security-ruling-embed-playback-2026-08-31.md` §6 permits the
   * TikTok embed only behind a first-press gate offering *play here* and *open on TikTok instead*
   * as two co-equal actions persisted per browser, and that gate belongs to whoever supplies this
   * handler — not to the button that calls it. See `SourceMediaThumbnail`'s header.
   */
  onPlaySource?: () => void;
  /** The glyph's accessible name, overridable so a host with different wording is not forced to
   *  fork the component. The default is the one string this seam ships with. */
  playSourceLabel?: string;
  /** Rendered in the source still's place, in the same band, once the caller has a player to put
   *  there. A slot rather than a boolean, so nothing about the player leaks into this file. */
  sourcePlayer?: ReactNode;
  /**
   * How much of this column's bottom a **floating overlay** covers, in pixels — `BottomNav`, for
   * every host that is a sheet on a phone. Added to the column's own bottom padding and to its
   * `scroll-padding-bottom`, so the last control clears the bar instead of ending under it and a
   * scroll-into-view lands somewhere visible.
   *
   * **A prop rather than something this component works out, because it cannot.** The bar is
   * `lg:hidden` and this card has four hosts across both breakpoints: the phone sheet always has
   * one, the `lg+` map popover never does, and `hosted` is mounted twice at once — in the
   * collection sheet where the bar is there, and in the `lg+` panel where it is not. Only the host
   * knows which, and `floatingBarClearancePx(stop)` in `sheet-geometry.ts` is the one place that
   * turns that knowledge into this number.
   *
   * `0` by default, which is the honest answer for a host that has not been taught to ask — and it
   * is why `/collections/[id]`'s `hosted` column still ends `Remove from this collection` under the
   * bar today. That fix is one argument in `collection-content.tsx` and belongs to that surface's
   * own change.
   */
  floatingBarPx?: number;
  /**
   * The height of the sheet column this card is rendered into — `STOP_TO_CONTENT_HEIGHT[stop]`,
   * published unchanged as the `--sheet-content-height` custom property on the scroll column below
   * so anything inside the card can cap itself against **this column** instead of the viewport.
   *
   * Same shape and same reason as `floatingBarPx`: only the host knows. `PlaceList` already spends
   * the identical number this way for `library-filter-bar.tsx`'s inline panel, and the note there
   * is the whole argument — at `half` the column is `55dvh - 70px`, so a child that falls back to
   * `100dvh` claims far more room than exists.
   *
   * Omitted by every host that is not a sheet — the `lg+` map popover, whose height comes from the
   * pin anchor rather than a stop, and `hosted` on `/collections/[id]`. Where it is omitted the
   * property is not written at all, so those hosts are byte-for-byte what they were.
   */
  sheetContentHeight?: string;
  /**
   * **The host is told a field row's panel is about to take room in the card.** Optional, spread
   * by the caller exactly like `LibraryFilterBar`'s prop of the same name, and called *before* the
   * panel opens so the sheet can reach `full` first.
   *
   * The card only ever calls it when the host chose to pass it, and `place-sheet.tsx`'s `selected`
   * branch passes it only from a stop that is not already `full`. A host that passes nothing is
   * unaffected: the context below carries `undefined` and the rows open in place as they do today.
   */
  onPanelOpen?: () => void;
  /**
   * Rendered where `BeenToggle` sits — the "what does this do to *your* library" position.
   *
   * A slot rather than a `readOnly` boolean: a flag can be forgotten, and it would not have fixed
   * the thing that actually bites (`place.id` standing in for a saved-place id). The collection
   * route puts `Added by …` and `Save to your places` here, which is that position's question
   * asked by somebody who has no row yet.
   */
  primaryAction?: ReactNode;
  /**
   * The host's own **field rows**, rendered flush at the end of band 3's field-row list — after
   * `Your note` and before the record lines.
   *
   * A second slot rather than more `footer`, because position is what makes the field row read as
   * one list: `/collections/[id]`'s `Shared note` is the same shape as the note directly above it
   * and belongs in the same run, while `Remove from this collection` is a destructive action and
   * belongs at the very bottom beside the other one. One slot could not put them in both places.
   */
  fields?: ReactNode;
  /** Rendered last, below the provenance block and the destructive action. The collection route
   *  puts the shared note and `Remove from this collection` here. */
  footer?: ReactNode;
}) {
  const detail = place.detail;
  const note = detail?.note;
  const reason = detail?.reason;
  const source = detail?.source;
  const provenance = detail?.provenance;
  // Extraction v2 (`0019`): tags, the model's one-sentence summary, and the dishes the post named.
  // All three are empty on every place saved before v2 — no backfill ran, and re-extracting twenty
  // rows would spend model calls against a hard daily ceiling — so "absent" is the majority state
  // here and each block below simply does not render. No placeholders, no skeletons, no
  // "not available yet": a detail view with no tags is a complete detail view.
  const { tags, whyGo, dishes } = enrichmentOf(detail);
  // `sourceUrl`/`sourceThumbnailUrl` (Spot's denormalized `saved_places.source_url` /
  // `source_thumbnail_url`, migration `0016`) are preferred over the joined `source.canonicalUrl`
  // / `source.media` — same value for the common case, but present even when the
  // `saved_place_sources` → `sources` join above didn't resolve one for any reason. `source`'s
  // fields remain the fallback for a save made before 0016 shipped.
  const tiktokUrl =
    detail?.sourceUrl ?? source?.canonicalUrl ?? place.sourceUrl;
  // `thumbnailOf` reverses what this line used to do. It preferred `sourceThumbnailUrl` — `0016`'s
  // denormalized copy, filled once and never refreshed by anything, by that migration's own
  // admission — over the joined `sources.thumbnail_url`, which is the row a refresh can actually
  // write to. With the old order, repairing the shared row would have repaired a value no screen
  // reads. The frozen copy is still the fallback when no source joined; see `thumbnailOf`.
  const thumb = thumbnailOf(detail);
  /** Every linked source after the one this card is already built from. `[]` for a manual save,
   *  for a place with a single source, and for a collection peer (who never receives the array at
   *  all). See `place-sources.ts`. */
  const extra = extraSources(detail?.sources);
  const authorLabel = source?.authorHandle
    ? `@${source.authorHandle}`
    : (source?.authorName ?? null);
  // Name + address + city, not coordinates: the model's/extraction's lat/lng is only a
  // provisional pin position for our own map (never a resolution source, see
  // `domain/places/google-maps-search-url.ts`'s header), so it is not trustworthy as the basis
  // for sending a user to Google's own maps — a name+address text search resolves more reliably
  // there and avoids collisions with an unrelated same-named venue elsewhere (or, worse, wherever
  // the guessed coordinates happen to land). Falls back to name+lat/lng when this saved place has
  // no stored address (a save made before addresses were captured, or a manual add with none
  // given) — better than nothing, and the previous behavior for those rows.
  const addressLine = place.detail?.addressLine;
  const locality = place.detail?.locality;
  const googleMapsUrl = savedPlaceMapsUrl({
    name: place.name,
    addressLine,
    locality,
    lat: place.lat,
    lng: place.lng,
  });

  const certainty = locationCertainty(provenance?.sourceDataset);

  /**
   * `~ Approximate location`, the whole of what the card now says about a model-guessed pin.
   *
   * Resolved here rather than inline because it has two render sites and one meaning: beside the
   * address when there is one, on its own line when there is not. `title` carries the consequence
   * (*Could be a street or two off.*) for a pointer device — the label alone is what a phone gets,
   * and it is enough to stop somebody treating the pin as a doorway.
   */
  const approximateMark =
    certainty?.isApproximate === true ? (
      <span
        {...(certainty.detail ? { title: certainty.detail } : {})}
        className="mt-px shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        <span aria-hidden>~ </span>
        {certainty.label}
      </span>
    ) : null;

  const isPopover = variant === "popover";
  const isHosted = variant === "hosted";

  /** Every mutation block below is gated on this, and none of them reads an id off `place` — that
   *  is the whole point of this refactor. No narrowing is needed: the prop is already the pair. */
  const savedRow = savedPlace;

  /** Gated on `visited` as well as on the date. The pair cannot disagree in the database (`0006`'s
   *  CHECK), but this prop is an object a caller assembles, and a date printed under a button
   *  reading `Been here` would be the screen contradicting itself. */
  const visitedOn = savedRow?.visited
    ? visitedOnLine(savedRow.visitedAt, new Date())
    : null;

  // Resolved here rather than inline so the JSX below carries no cast: `whyGoEarnsItsPlace` already
  // rejects null/blank, but TypeScript cannot see that through a boolean.
  const shownWhyGo =
    whyGo !== null &&
    whyGoEarnsItsPlace(whyGo, {
      reason,
      tags,
      dishes,
      name: place.name,
      locality,
    })
      ? whyGo
      : null;

  // The caption fragment, minus the creator's 📍/✨ formatting, and only when it says something the
  // name, address and city above it do not. Measured on this database: `📍האחים, אבן גבירול 26` is
  // the name, a comma and the address — quoting it under a heading was a labelled block that
  // repeated the two lines directly above it.
  /**
   * Whether band 2 and band 3 have anything in them at all.
   *
   * Each band draws its own hairline as its top border, so an empty band takes its rule with it —
   * which is the point. A manual add has no post, so it shows **one** hairline and no gap where
   * band 2 would have been; a place you have not saved, seen inside a collection, shows no band 3.
   * A rule with nothing under it is exactly the floating fragment this change exists to remove.
   */
  const quote = formatCaptionQuote(reason);
  const shownQuote = quoteAddsSomething(quote, {
    name: place.name,
    addressLine,
    locality,
  })
    ? quote
    : null;

  const hasBand2 =
    shownQuote !== null ||
    shownWhyGo !== null ||
    dishes.length > 0 ||
    extra.length > 0;
  const hasBand3 =
    savedPlace !== null ||
    fields !== undefined ||
    footer !== undefined ||
    (nearby !== undefined && nearby.length > 0) ||
    (certainty !== null && !certainty.isApproximate) ||
    detail?.savedAt !== undefined;

  return (
    <div
      /*
       * The floating bar's height, handed to the **margin** below as a custom property.
       *
       * ## Padding was the wrong shape for this, and the owner is the one who caught it
       *
       * Round-3 feedback §7.1: *"text continues behind/under the navigation instead of ending
       * cleanly above it."* Until 2026-09-02 this bar was paid for with `padding-bottom`, which
       * buys exactly one thing — that the **last** control clears the bar once you have scrolled
       * all the way down. It buys nothing at all for the other 90 % of the scroll, because the
       * column's own box still ended at the bottom of the screen and `BottomNav`'s pill is
       * `bg-card/90 backdrop-blur-md`: every line between the fold and the end of the card slid
       * under a translucent bar and was rendered blurred and unreadable rather than clipped.
       * Measured at 390×844, `half`, on `Bread - Lehi 2`: `Saved from @danielle___tal` sat at
       * y 764–784 against a bar occupying 776–844.
       *
       * A margin ends the box where the bar begins, so the overflow clip does the work at every
       * scroll position instead of only the last one. **It costs no readable pixels**: the column
       * loses the 68 px it could never legibly use and stops spending them again on padding, so
       * the last line comes to rest at the same y it did before (measured: 758 both ways).
       *
       * `scroll-padding-bottom` went with the padding. It existed so a scroll-into-view did not
       * park its target under the bar; with the box ending above the bar there is no such edge
       * left to park against.
       *
       * Inline because the number is `BOTTOM_NAV_HEIGHT_PX` arriving through the host, and
       * Tailwind's arbitrary values take a literal — a hand-written `68` here is exactly the drift
       * `bottom-nav-metrics.ts` exists to prevent. A *variable* rather than the margin itself
       * because the three variant classes below each own their own bottom spacing, and the two
       * hosts with no bar (`lg+` popover, `lg+` panel) pass `0` and correctly get no margin: the
       * `env()` term is all that is left there, and it is 0 on a desktop too.
       */
      style={
        {
          "--floating-bar": `${floatingBarPx}px`,
          // Conditionally spread, not defaulted: a host that does not know its stop must leave the
          // property alone rather than assert a height, so the fallback each reader already
          // carries stays in charge. See the `sheetContentHeight` docblock.
          ...(sheetContentHeight === undefined
            ? {}
            : { "--sheet-content-height": sheetContentHeight }),
        } as CSSProperties
      }
      className={cn(
        "mb-[calc(env(safe-area-inset-bottom)+var(--floating-bar,0px))] flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 pt-3.5",
        // ## The popover's height is set by the *pin*, not by the viewport — measured, 2026-09-01
        //
        // `MapPopup` is a MapLibre `Popup` anchored to the selected place's lng/lat, and the map
        // camera parks that pin at ~53 % of the window height. Measured at 1440x900: the popup
        // resolves `maplibregl-popup-anchor-bottom` and grows **upward** from an anchor at
        // `y 478`, so its bottom edge is nailed at `y 462` and every extra pixel of height is
        // taken off the *top* of the window. Forcing the column taller, at that same camera:
        // `440px` → card top `y 20`; `470px` → `y -10`; **`630px` (which is what `70vh` resolves
        // to at 900, and what dropping the `26rem` arm would have let bind) → `y -170`** — the
        // name, the picture and 170 px of card off the top of the screen, with no page scroll to
        // reach them. The room this card actually has is ~half the window, not 70 % of it, and
        // that is what `50vh` says. `28rem` is the ceiling so a 1600 px-tall display does not
        // draw a 288 px-wide, 800 px-tall ribbon over the map; it binds above ~933 px of window.
        //
        // What this means for the height argument, and it is the part worth writing down: the
        // recoverable height here was ~30 px, never the ~210 px a viewport-based reading of the
        // cap suggests. **Height is not the lever on this surface — content and affordance are.**
        // Hence the two changes beside this one: `w-80` rather than `w-72` (measured, a 288 px
        // column wraps `Old North Espresso Bar` onto two lines and its tags onto two rows, a
        // 170 px identity header against 114 px at 320 px) and a 112 px source still rather than
        // 160 px (`compact`, below). Together those put `Been here` — the first control on the
        // card — fully above the fold on all three of the longest saved places in this database,
        // where before it was 5–85 px below it.
        //
        // `scroll-fade-b` is the sign that there is more, and it is the repo's own utility rather
        // than a gradient invented here (`library-filter-bar.tsx` uses `scroll-fade-x` for the
        // same job on the phone). Bottom-only and scroll-driven: measured, `--scroll-fade-b` is
        // `24px` at `scrollTop 0` and **`0px`** at the end, so it never dims a last line the user
        // has already reached, and it never appears on a card that does not scroll. Bottom-only
        // rather than `scroll-fade-y` for the fallback: where `animation-timeline: scroll()` is
        // unsupported the utility degrades to a *static* fade, and a permanent bottom fade reads
        // as "more below" where a permanent top one would just dim the picture.
        //
        // `scrollbar-width: thin` is deliberately **not** a claim that a scrollbar is the
        // affordance. Measured on this machine, Chromium draws overlay scrollbars: `offsetWidth`
        // and `clientWidth` are both 320, so the bar costs no layout and is absent until a
        // gesture starts — which is exactly the state the review filed, and why the fade is the
        // load-bearing half. What this property buys is the other configuration: a system set to
        // always-show scrollbars, or Windows/Linux, would otherwise put a ~15 px classic bar
        // inside a 320 px card and over the full-bleed still's edge. Forcing a bar visible with
        // `::-webkit-scrollbar` rules was rejected — it is hand-tuned geometry in a component,
        // and a permanently painted bar in a small floating card is foreign on macOS.
        //
        // `overscroll-contain` keeps a wheel that reaches the end of the card from chaining into
        // the map's own zoom.
        //
        // **What is still open, stated rather than hidden.** The fade is a mask, so it is loudest
        // when the fold falls *through* something — on `HaKosem` it leaves `Add to a collection`
        // half-drawn at the bottom edge, which is unmistakable. On `Café Florentin` the fold lands
        // on `Been here`'s own last pixel, so all the fade has to work with is that button's
        // bottom border, and the card reads more finished than it is. Making that case as loud as
        // the other two means either a permanent affordance the popover does not have today, or
        // the *preview versus detail* ruling the round-4 review names as `ux-interaction`'s call.
        // It is not more tuning of this constant, which is how the surface got here.
        isPopover &&
          "max-h-[min(50vh,28rem)] w-80 overscroll-contain px-0 pb-0 pt-0 scroll-fade-b scroll-fade-6 [scrollbar-width:thin]",
        // The host's gutter and its own top spacing — see the `variant` docblock for why 4 px
        // matters here and why the top padding belongs to the header row above this column.
        isHosted && "px-4 pb-8 pt-1",
      )}
    >
      {thumb && (
        <SourceMediaThumbnail
          thumb={thumb}
          // The been mark belongs on the frame as well as in the row: the frame is the biggest
          // thing on the card, and a state you have to read a caption line to learn is a state the
          // screen is whispering. Owner, 2026-09-02: "add the been badge on the map list an frame."
          visited={savedRow?.visited === true}
          // The popover's shell supplies the gutter and the radius; every other host gives this
          // column a 20 px gutter of its own and wants a rounded block inside it.
          fullBleed={isPopover}
          // …and the popover is also the one host whose height is decided by something other than
          // the content — see the `max-h` argument on the column above.
          compact={isPopover}
          playLabel={playSourceLabel}
          {...(onPlaySource ? { onPlay: onPlaySource } : {})}
          {...(sourcePlayer === undefined ? {} : { player: sourcePlayer })}
        />
      )}

      <div
        className={cn(
          "flex items-start justify-between gap-3",
          // 12 px under the still, which is a group-to-group step like every other one in band 1.
          // The popover's still is full-bleed against the card's top edge, so there the same 12 px
          // is the column's own top padding rather than this block's margin.
          thumb && !isPopover && "mt-3",
          isPopover && "px-4 pt-3",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-start gap-1">
            {/* `<bdi>` rather than `dir="auto"` on the heading: a Hebrew name would otherwise
                right-align the whole identity block while the category line under it stayed
                left, so a mixed library would have a ragged edge.

                **Still load-bearing with the rename pencil gone** (removed 2026-09-02,
                `saved-place-edits.tsx` carries the reasoning). The RTL audit
                (`docs/rtl-audit-2026-08-31.md` findings 2 and 4) measured this rule against the
                pencil as the fixed chrome beside the name; the close × in the same row is that
                chrome now, and `קפה קיוסק Rothschild` still has to reorder inside the heading
                without dragging the identity block's alignment with it. */}
            <h2
              className={cn(
                // `break-words` for the same reason the row's name carries it, and here the
                // consequence was louder: measured at 1440x900 with a 56-character unbroken
                // name, the heading's ink ran **291 px past the popover's right edge**, straight
                // through the close ×. `min-w-0` does not help — it lets
                // the *box* shrink, and an unbreakable word simply overflows whatever box it is
                // given. A 288 px popover is the narrowest column this heading is ever drawn in,
                // so it is where the defect surfaces first, not where it is unique.
                "min-w-0 break-words font-heading text-2xl font-extrabold tracking-tight text-foreground",
                isPopover && "text-lg",
              )}
            >
              <bdi>{place.name}</bdi>
            </h2>
          </div>
          <p dir="auto" className="text-sm font-medium text-muted-foreground">
            {categoryLocalityLine(place.category, locality)}
          </p>
          {/* Directly under the identity block, and above every prose block below — this is the
              most prominent of the three new fields, deliberately.

              `places.category` holds four distinct values across the twenty saved rows, fourteen of
              them `restaurant`: the line immediately above this one tells you almost nothing. Tags
              are what actually distinguishes one saved place from another, they are the only new
              field that is scannable rather than read, and they are the same object the list row
              shows — so putting them here makes the row and the detail agree about what a place
              *is* before either says anything about why it was saved. */}
          {tags.length > 0 && <TagChipList tags={tags} />}
        </div>
        {/* Nothing at `hosted`: the host has already drawn its own back control in a header row
            above this column, and two ways out of one screen is one too many. */}
        {!isHosted && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={
              variant === "panel" ? "Back to your places" : "Close place detail"
            }
            onClick={onClose}
            className="shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {variant === "panel" ? (
              <ChevronLeft className="size-5" aria-hidden />
            ) : (
              <X className="size-5" aria-hidden />
            )}
          </Button>
        )}
      </div>

      <div className={cn("flex flex-col", isPopover && "px-4 pb-4")}>
        {/* **Band 1 — the place.** Identity, address, the action band, the collection host's
            primary action: what this place *is*, and the one-press things you can do with it.
            12 px between its groups, which is the whole vertical vocabulary inside a band. */}
        <div className="mt-3 flex flex-col gap-3">
          {/* The street address, which this view did not show at all until now. It was in the data
              the whole time — `places.address_line`, already good enough to build the Google Maps
              link out of — and it is the one fact that answers "can I actually find this place".
              Above the caption quote, because it is checkable and the quote is not. */}
          {/* `<bdi>` around the address text, not `dir="auto"` on this row: `dir="auto"` here
              previously resolved the whole flex row's direction from the address, which for a
              Hebrew address flipped the row to `rtl` and dragged the pin icon — fixed chrome — from
              the left edge to the right. Same failure the heading's own comment above already names;
              same fix (rtl audit, `docs/rtl-audit-2026-08-31.md` finding 2). */}
          {/* **The approximate mark is a label beside the address, not a sentence under the card.**
              It used to be `Approximate location — Worked out from the video rather than matched to a
              map listing, so it can be a street or two off.`, two lines of our own machinery filed
              with the provenance at the very bottom. It is a qualifier on one fact — *this address*
              — so it belongs on that fact's line, where it is read at the moment it matters and
              costs no vertical band of its own. The plain sentence survives as the `title` for a
              pointer device; `location-certainty.ts` holds the wording.

              `flex-wrap` because the mark is the one thing on this row that may not fit beside a
              long address, and the row must wrap rather than squeeze the address it qualifies.
              The mark is **not** inside the `<bdi>`: it is our word about the address, not part of
              it, and putting it inside the isolate would let a Hebrew address reorder it. */}
          {addressLine && (
            <p className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-foreground">
              <MapPin
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <bdi>{addressLine}</bdi>
              {approximateMark}
            </p>
          )}
          {/* A guessed pin with no address at all is a real row — `llm-guess` fills a coordinate and
              often nothing else — and the mark is the *only* thing the card says about it, so it
              cannot be a child of a block that does not render. */}
          {!addressLine && approximateMark !== null && <p>{approximateMark}</p>}

          {/* **The card's primary actions, in one 44 px band, above the source quote.**

              This replaced two full-width blocks and a text-link pair spread over ~150 px and three
              positions on the card — `Been here` up here, `Open on TikTok` / `Google Maps` five
              blocks lower, past the note. Round 3 of the owner's feedback measured the result: on a
              390x844 phone the things a person opens a saved place *to do* were all below the fold,
              and the card scrolled. Round 5 had accepted that and softened it with a scroll mask on
              the popover; this reverses that decision deliberately rather than by accident.

              **Above the quote rather than below it, and that is a deviation from the suggestion in
              the owner's §2.2, taken on purpose** (2026-09-02). The requirement in that item is that
              primary actions are not buried; the suggested position was written while the complaint
              was about full-width blocks, and the two came apart once the blocks became pills. The
              quote costs 68 px plus a 20 px gap, and that is the single largest block still standing
              between the identity and the actions. Measured on `The Laughing Yak` at 390x844: the
              band's bottom edge moved from 933 to 846 against a scroll column ending at 846. At
              1440x900 the popover's slack under the band went 39 px → 122 px, still one unwrapped
              band at 288 px of column, and the quote stayed fully on screen below it.

              **It does not reach zero-scroll at the sheet's `half` stop, and nothing available here
              does.** `BottomNav` is `position: fixed`, `z-50`, and covers `y 776–844` at 390x844, so
              the honest fold at `half` is 776 and not the column's own 846 — a 324 px budget, not
              394. Across eight saved places the band clears 776 on one of them. Shrinking the still
              to 112 px, the other lever on the table, buys 48 px against a 53–92 px deficit, so it
              would spend a measured round-4 ruling and still not arrive. What is left deletes
              something — the still, the tags, or the `half` stop itself — and each of those is a
              product decision rather than a layout one.

              The quote is deliberately not the thing that moved *down and out*: it is why the place
              is in the library, it is still the first prose on the card, and it is fully visible at
              every host except the one where nothing is. Controls before the reason is a real cost;
              the reason being unreachable behind the controls was a bigger one.

              **One primary and two quieter links, not three pills** (2026-09-03,
              `docs/ux-card-and-share-2026-09-03.md` and its owner ruling). All three used to share
              `DETAIL_ACTION_PILL`: same height, border, radius and `font-bold`, so two controls
              that *leave* the product carried the weight of the one write the product wants a
              returning user to make. Three co-equal primaries is none, and that is the mechanism
              behind the card feeling overwhelming.

              `Been here` keeps the pill and is now the only thing wearing it. The two links step
              down to `DETAIL_OUT_LINK` — no border, no fill, `font-medium` — and keep their 44 px
              targets, because the paint got quieter and the finger did not.

              **Both links keep their words**, which is the owner's ruling and not the spec's: the
              spec had them dissolve into the address line and the creator credit, and he rejected
              it — *"if the creator name is clickable, it's not clear that it opens the original
              TikTok, and if the address is clickable, it's not clear that it opens Google Maps."*
              The same objection convicts the icon-only TikTok control that was already shipped, so
              it gains the word too.

              `voice-and-vocabulary.md` §3 ratifies `Been` / `Not been yet`, and `Open on TikTok`
              survives as the link's accessible name. */}
          {/* Unconditional: `Google Maps` is the one action every host of this view offers, saved or
              not — a place seen inside a collection is still a place you want directions to. */}
          <div className="flex flex-col items-start gap-2">
            {/* Only when the quote did not already carry it — the attribution belongs with the
                  words it attributes, and printing it twice on one card is the kind of repetition
                  that makes a detail view feel padded. */}
            {authorLabel && shownQuote === null && (
              <p className="text-xs font-medium text-muted-foreground">
                Saved from {authorLabel}
              </p>
            )}
            {/* **Two flex children, not three, and that is what makes the wrap deliberate.**
                  Measured 2026-09-03: the primary is 124 px, the two links 72 and 93, so with
                  `gap-x-3` the row wants 313 px. A 390 px phone gives this card 350 and it is one
                  band; the `lg+` panel is `w-80` and gives 288, so it must wrap. Left as three
                  peers it wrapped between the two links and dropped `Google Maps` alone onto a
                  second line, which reads as an accident. Grouped, the break falls in the one
                  place that means something — the primary on its own line, the two ways out
                  together underneath. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* The primary leads the row. The one control the product wants the user to come
                    back and use — see `saved-place-edits.tsx`. `key` on the saved place's id so a
                    pending transition from the previously selected place can never land on this
                    one. */}
              {savedRow && (
                <BeenToggle
                  key={`been-${savedRow.id}`}
                  savedPlaceId={savedRow.id}
                  placeName={place.name}
                  visited={savedRow.visited}
                />
              )}
              <span className="flex min-w-0 items-center gap-x-3">
                {tiktokUrl && (
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noreferrer"
                    data-vaul-no-drag
                    /* The ratified sentence stays the accessible name; the visible label is the
                       destination alone, because a row of three verbs is a row of sentences. */
                    aria-label="Open on TikTok"
                    title="Open on TikTok"
                    className={cn(DETAIL_OUT_LINK, PRESS_ROW)}
                  >
                    <PlatformMark className="size-4" />
                    TikTok
                  </a>
                )}
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-vaul-no-drag
                  aria-label="Open in Google Maps"
                  className={cn(DETAIL_OUT_LINK, PRESS_ROW)}
                >
                  {/* Named in full, never `Maps`: this is a link into Google's product, and the
                      same attribution rule that keeps `Matched on Google Maps` in the provenance
                      line applies to the control that goes there. */}
                  Google Maps
                </a>
              </span>
            </div>
            {/* The one thing the database has always held about a been mark and no screen said.
                  Same 11px muted weight as `Saved on …` below, because it is the same kind of fact:
                  a quiet record of when, not something to act on. Absent — silently — when the row
                  carries no timestamp; `visitedOnLine` says why that is a real state. Start-aligned
                  now rather than centred: it sits under a row of pills, not under a full-width
                  button, so a centred line would point at nothing. */}
            {visitedOn && (
              <p className="text-micro font-medium text-muted-foreground">
                {visitedOn}
              </p>
            )}
            {/* The same position, for a host whose caller has no row to toggle: on
                  `/collections/[id]` this is `Added by …` and `Save to your places`. It keeps its own
                  full width — it is that card's single primary action, not one of three. */}
          </div>
          {primaryAction && <div className="w-full">{primaryAction}</div>}
        </div>

        {/* **Band 2 — from the post**, and it disappears whole, hairline included, for a place
            added by hand. A rule with nothing under it is the floating fragment this change
            exists to remove. The rule is this band's own top border rather than a sibling
            element, so 20 px above and 20 px below cannot drift apart (16 at the popover). */}
        {hasBand2 && (
          <div
            className={cn(
              "mt-5 flex flex-col gap-3 border-t border-border/60 pt-5",
              isPopover && "mt-4 pt-4",
            )}
          >
            {/* What the creator actually wrote, as a quotation rather than as a labelled field.
                A rule and a pair of quote marks say "someone else's words" faster than the kicker
                reading FROM THE POST did, and they leave the model's own sentence below free to be
                plain text — which is the whole extracted-versus-inferred distinction, carried by shape
                instead of by two competing labels.

                `dir="auto"` because this is a verbatim caption substring: a Hebrew quote rendered
                left-to-right puts its punctuation on the wrong end of the sentence.

                `&ldquo;`/`&rdquo;`, not a plain `"`, and that choice is load-bearing, not decorative:
                both are Unicode `Bidi_Mirrored` characters, so inside this `dir="auto"`-resolved RTL
                run the browser swaps their *rendered shape* — the opening mark ends up looking like a
                close-quote and vice versa — which is what lands the open mark on the visual right (the
                RTL reading start) and the close mark on the visual left for a Hebrew quote. Nothing
                here reasons about direction on purpose; it falls out of picking mirrored glyphs over
                straight ones. Swap either entity for a plain `"` (not mirrored) and this silently goes
                back to wrong with no visual signal in an LTR-only review (rtl audit,
                `docs/rtl-audit-2026-08-31.md` finding 3). */}
            {/* And *then*, quieter, the model's own sentence — never above the quote, never at the same
                weight, and only when it says something the quote and the tags do not.

                This is a judgement call, and it is one `if` to remove. `why_go` is generated prose;
                `extracted_reason` is a verbatim substring of the caption. Keeping that difference
                legible is this codebase's central invariant, and printing a paraphrase directly beside
                the thing it paraphrases is the fastest way to destroy it — the two read as one claim
                made twice, and the user cannot tell which half the creator actually wrote. Measured on
                the London caption: the model's "Discover a Nepalese kitchen tucked away in the market."
                sat above tags reading `nepalese, market stall` and a quote reading "…Nepalese kitchen
                tucked away in Market Peckham". It contributes exactly one word those two do not, so it
                is not rendered. A sentence that carries something new — a dish that sells out, an
                opening time, who it is for — clears the bar and is shown. See
                `ui/place/enrichment.ts`'s `whyGoEarnsItsPlace` for the rule and the threshold. */}
            {shownQuote !== null ? (
              <figure className="flex flex-col gap-2 border-l-2 border-brand-tint pl-3">
                <blockquote
                  dir="auto"
                  className="text-sm leading-relaxed text-foreground"
                >
                  &ldquo;{shownQuote}&rdquo;
                </blockquote>
                {authorLabel && (
                  <figcaption className="text-xs font-medium text-muted-foreground">
                    {authorLabel}
                  </figcaption>
                )}
                {/* The model's sentence is the quote's *sibling*, inside the same rule and at the same
                    start inset — 8 px under the attribution rather than alone in 20 px of air. It reads
                    as "and here is what that amounts to", which is what it is. Still unlabelled: the
                    shape is the whole extracted-versus-inferred distinction, and a caption on the
                    paraphrase would invite it to be read as another extracted claim. */}
                {shownWhyGo !== null && <WhyGoLine whyGo={shownWhyGo} />}
              </figure>
            ) : (
              // No quote to sit under: band 2's first block, no rule, no indent.
              shownWhyGo !== null && <WhyGoLine whyGo={shownWhyGo} />
            )}

            {/* The dishes the post named. Last of the three content blocks because it is a list to
                skim rather than something to read, and because it is the one most often empty. */}
            <DishLine dishes={dishes} />

            {/* **Every other TikTok link behind this place**, which the card used to drop on the floor.
                `saved_place_sources` is many-to-many and `save_place` keeps both rows on a second
                paste, so nothing was ever lost in the database; what was lost was here — the still, the
                quote, the credit and the pill above are all `sources[0]`, and until now that was the
                whole card. Round 3 §5.1 reported it as "keeps only the latest", which is the opposite
                of the mechanism: it keeps the *earliest*.

                **One source draws nothing at all.** `extraSources` is `sources.slice(1)`, so the common
                case is byte-identical to the card that shipped — a single source is not turned into a
                list of one. Earliest-linked first, continuing the order the head is drawn from; see
                `place-sources.ts` for why not newest-first.

                **Attribution, not decoration.** Developer Terms III.3(n) forbids deleting author
                attributions, so every row carries the creator *and* links back to the post
                (`docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md` §5). The third part
                of TikTok's own definition, the description, is stored per *save* rather than per
                source, so it stays on the headline quote above rather than being invented here.
                `PlatformMark` is our own neutral glyph — §7.1: the word, the `@handle`, the link and a
                glyph of our own drawing are the entire permitted palette, and no TikTok mark may enter
                `src/`.

                **Own library only.** A collection peer never receives this array — `getSpots` reads it
                under `sps_select_own` and migration `0024` refused the read policy that would widen it
                — so on `/collections/[id]` `sources` is absent and this renders nothing by
                construction, not by a flag. */}
            {extra.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className={SECTION_LABEL}>{moreSourcesLine(extra.length)}</p>
                <ul className="flex flex-col">
                  {extra.map((extraSource) => (
                    <li key={extraSource.id}>
                      <a
                        href={extraSource.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                        data-vaul-no-drag
                        // The ratified sentence with the creator in it: three links all announced
                        // `Open on TikTok` name no destination between them.
                        aria-label={openSourceLabel(extraSource)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-sm font-medium text-brand outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                          PRESS_ROW,
                        )}
                      >
                        <PlatformMark className="size-4 shrink-0" />
                        {/* `<bdi>` because a handle sits inside a line this list renders in Hebrew as
                            often as in English, and `line-clamp-1 break-words` for the same reason
                            `PlaceRow`'s name carries them rather than `truncate`. */}
                        <span className="line-clamp-1 break-words">
                          <bdi>{sourceCreatorLabel(extraSource)}</bdi>
                        </span>
                        {/* `ms-auto`, never `ml-auto`: this row is rendered in an RTL column too. */}
                        <ArrowUpRight
                          className="ms-auto size-3.5 shrink-0 opacity-70"
                          aria-hidden
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* **Band 3 — yours.** The fields you can edit, what is near it in your library, the two
            record lines, and the way out. Same rule, same 20 px, same disappearing act: a place
            you have not saved, seen inside a collection, shows no band 3 at all. */}
        {hasBand3 && (
          <div
            className={cn(
              "mt-5 flex flex-col gap-3 border-t border-border/60 pt-5",
              isPopover && "mt-4 pt-4",
            )}
          >
            {/* **The field rows, flush.** `Add to a collection`, `Category`, `Your note` and the
                host's own fields are one shape (`DETAIL_FIELD_ROW`) and they stack with no gap and
                no separator: a run of 48 px rows reads as a structured list, where 20 px between
                each is what made them read as floating fragments. Nothing else in this column is
                spaced at 0. */}
            {/* The panel channel wraps exactly the rows that can open one — nothing above this
                list has a disclosure. `undefined` for every host that passed no `onPanelOpen`,
                which is the current behaviour spelled out rather than a new default. */}
            <DetailPanelOpenContext value={onPanelOpen}>
              <div className="flex flex-col">
                {/* Directly under `BeenToggle` and above `CategoryEditor`: been/not-been and "which list is
                    this in" are both statements about the user's *intent* with the place, while category
                    and note are corrections to what we got wrong. Grouping the two intent controls keeps
                    the correction block intact underneath. Renders nothing outside a `CollectionsContext`
                    provider, so the desktop popover and any test host are unaffected. */}
                {savedRow && (
                  <AddToCollection
                    key={`collections-${savedRow.id}`}
                    placeId={detail?.placeId}
                  />
                )}

                {/* The user's own word for what this place is. Below the prose blocks rather than beside
                    the category line above, because that line is the most-read thing on the card and this
                    is a control most people touch once — `saved-place-edits.tsx` has the argument. */}
                {savedRow && (
                  <CategoryEditor
                    key={`category-${savedRow.id}`}
                    savedPlaceId={savedRow.id}
                    category={place.category}
                    isOverridden={detail?.categoryIsOverridden ?? false}
                  />
                )}

                {/* `L1-F7-T2`. The note used to render read-only, and a place you saved was a place you
                    were stuck with. `key` on the saved place's id is what resets a half-typed draft when
                    the selection changes — the editor deliberately does not sync from props in an effect,
                    which would discard typing every time the server revalidated. */}
                {savedRow && (
                  <NoteEditor
                    key={savedRow.id}
                    savedPlaceId={savedRow.id}
                    note={note}
                  />
                )}

                {/* The host's own fields, in the same flush list rather than below the removal:
                    `/collections/[id]` puts `Shared note` here, which is the same field as the note
                    above it with a different audience, and it has to sit with the rest of the list
                    for that to read. */}
                {fields}
              </div>
            </DetailPanelOpenContext>

            {/* What else of yours is around here — the library's own retrieval question, asked at the
                scale of one place. Below the external links and above the provenance line: it is a
                fact about the library rather than about this place, so it belongs after everything
                this card is actually about. Renders nothing when there is nothing within a walk, which
                is the point — a section that is always full stops carrying information. */}
            {nearby !== undefined && nearby.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className={SECTION_LABEL}>
                  {nearby.length === 1
                    ? "Also nearby"
                    : `${nearby.length} more nearby`}
                </p>
                <ul className="flex flex-col">
                  {nearby.map((neighbour) => (
                    <li key={neighbour.id}>
                      {/* A button when the host can open it, plain text when it cannot — a row that
                          looks pressable and does nothing is worse than one that never offered. */}
                      {onSelectNearby ? (
                        <button
                          type="button"
                          data-vaul-no-drag
                          onClick={() => onSelectNearby(neighbour.id)}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                            // The same row shape, so the same press. It swaps the whole detail view
                            // under the finger, which is the one place a missing acknowledgement reads
                            // as the app having lost the place you were looking at.
                            PRESS_ROW,
                          )}
                        >
                          <span className="line-clamp-1 text-sm font-semibold text-foreground">
                            <bdi>{neighbour.name}</bdi>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {nearbyDistanceLabel(neighbour.km)}
                          </span>
                        </button>
                      ) : (
                        <p className="flex min-h-11 items-center justify-between gap-3 text-sm">
                          <span className="line-clamp-1 font-semibold text-foreground">
                            <bdi>{neighbour.name}</bdi>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {nearbyDistanceLabel(neighbour.km)}
                          </span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Where this pin came from, and when you saved it. Both were facts the database held and
                no screen said: the first was a dataset slug at 11px (`Matched via llm-guess`) that
                twenty-one of thirty-one places carried and nobody could read, and the second was in the
                ORDER BY and nowhere else. `location-certainty.ts` has the argument for why the
                confidence percentage that used to sit here is gone.

                The wrapper itself is conditional because an empty one is invisible but not free: it is
                a flex child in a `gap-5` column, so on a surface that has neither fact — a place seen
                from inside a collection — it opens a 20 px hole above the footer. */}
            {/* **The approximate half of this has moved up beside the address** (2026-09-02) and what
                is left here is the attribution: `Matched on Google Maps`, which Google's terms require
                and which is a claim about the pin's provenance rather than a warning about it. Printing
                both here would have said `Approximate location` twice on one card. */}
            {/* **One line rather than two stacked** (spec §A5, 2026-09-03). These are the same
                kind of fact at the same weight — a quiet record of where the pin came from and
                when you saved it — and two 11 px lines in a column read as a block of small print
                to skip, which is a shame for the only provenance the card shows. A literal
                separator element, never an interpolated string: `·` between a Latin attribution
                and a date that may render in either direction has to be its own node. Either fact
                may be absent, so the separator is conditional on both being present. */}
            {((certainty && !certainty.isApproximate) || detail?.savedAt) && (
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-micro font-medium text-muted-foreground">
                {certainty && !certainty.isApproximate && (
                  <span>{certainty.label}</span>
                )}
                {certainty && !certainty.isApproximate && detail?.savedAt && (
                  <span aria-hidden>·</span>
                )}
                {detail?.savedAt && (
                  <span>{savedOnLine(detail.savedAt, new Date())}</span>
                )}
              </p>
            )}

            {/* Last, and quiet. The destructive action belongs below everything the user might have
                opened this detail to read, not competing with it. `onClose` is the deselect the
                caller already passes — the map page's own render-time guard would drop the selection
                once the revalidated list arrives, but that would leave the detail open over a place
                that is already gone for the length of the round trip. */}
            {savedRow && (
              <RemoveSavedPlace
                savedPlaceId={savedRow.id}
                placeName={place.name}
                onRemoved={onClose}
              />
            )}

            {/* Last of all, and the host's to fill: `/collections/[id]` puts the shared note and
                `Remove from this collection` here — both statements about *this collection*, which is
                why they sit below everything this view says about the place itself. */}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * **The source post's picture, at the top of the detail view — and the slot the player lands in.**
 *
 * `referrerPolicy="no-referrer"` is load-bearing, not decorative: without it the browser sends a
 * `Referer` header to TikTok's CDN on every image request, which would let TikTok correlate its own
 * signed URLs with which of our users' devices requested them — a privacy leak of "which posts this
 * person saved," not just an unnecessary header. Every picture this product draws from that CDN
 * carries it, on a list row and here.
 *
 * The URL is a signed TikTok CDN link whose expiry **is** stored, in the URL itself: TikTok signs
 * an `x-expires` into the query string and `signedUrlExpiry` reads it. Measured 2026-08-31 the
 * window is **~47 hours**, not the ~6 months `0003`'s column comment claims, which is why a
 * failure here is a request for a fresh URL (`useRefreshableThumbnail`) rather than a permanent
 * hide. It still renders **nothing at all** when nothing comes back, and that is the majority state
 * of any library older than two days: no broken-image glyph, no grey placeholder, no badge saying
 * the post is gone, and no reserved band that would make the card jump when a refresh lands late.
 * A detail card whose first element is the name is a complete card — measured on two of this
 * database's own saves, which have never had a live still.
 *
 * ## `shrink-0`, and it is the whole of why the popover looked as though it had no picture
 *
 * Measured at 1440x900 against the running app: inside the map popover this wrapper computed
 * **`height: 0px`** while its `<img>` computed `height: 160px`, loaded, `complete`, `naturalWidth`
 * 720. The picture was in the DOM, fetched from TikTok, and painted nowhere.
 *
 * The mechanism is a flex default, not a bug in either box. `PlaceDetail`'s root is a column flex
 * container, and at `variant="popover"` it is the only host that gives that container a **definite
 * height** — today `max-h-[min(50vh,28rem)]`, 448 px at a 900 px window, against 796–940 px of
 * content on this database's own saved places. A column flex item shrinks to fit a definite
 * container before the container is allowed to scroll, and an item's automatic minimum size is
 * normally its content — which is what stops every text block below from collapsing. This wrapper
 * carries `overflow-hidden`, and `overflow` other than `visible` sets that automatic minimum to
 * **zero**. So of all the card's children exactly one could absorb the whole overflow, and it did.
 *
 * `shrink-0` is the fix and it belongs here rather than on the popover variant: any future host
 * that caps this column's height would reproduce it, and the picture is never the thing that should
 * give way.
 *
 * ## The band's height is a claim on a fixed budget, so the popover gets a smaller one
 *
 * Measured 2026-09-01 at 1440x900: this band is **160 px of a 416 px popover** — 38 % of the only
 * detail surface the desktop map has — and it sits above every control on the card. It landed two
 * days before that measurement and it is what pushed `Been here` from visible to 5–85 px below the
 * fold on the three longest cards in this database. That is the whole of the argument for
 * `compact`, and the argument was not *drop the picture*: a place saved from a video is recognised
 * by its still faster than by its name, so the still keeps its position at the top of the card and
 * gives up its size. 112 px is the largest band that leaves `Been here` above the fold on all
 * three (measured: 435 / 437 / 399 against a 448 px card). Nothing outside the popover changes —
 * a sheet and a hosted column are scrolled by a thumb that already knows there is more below.
 *
 * ## The seam for playback — a callback and a slot, and deliberately nothing else
 *
 * `docs/security-ruling-embed-playback-2026-08-31.md` §6 permits the TikTok embed **only** behind a
 * first-press gate that offers *play here* and *open on TikTok instead* as two co-equal actions,
 * persisted per browser. That gate, and the iframe behind it, are another lane's. This component
 * owns the affordance and the space the player will occupy, and nothing further: **no iframe, no
 * TikTok script, no request of any kind fires from anything below.**
 *
 *  - `onPlay` — pressed intent. The glyph renders only when a handler exists, so there is never a
 *    control on screen that does nothing, and the press mounts nothing by itself.
 *  - `player` — the slot. When the caller has something to show it replaces the still **inside the
 *    same band**, so swapping a picture for a player is not a layout change. The glyph is not drawn
 *    over a player: at that point the player owns its own transport.
 *
 * The glyph is absent when the picture is, which follows the owner's ruling literally — *a small
 * glyph button on the thumbnail, clicked*. A card with no still keeps the `Open on TikTok` link it
 * already has, which is the zero-disclosure path that already ships.
 */
function SourceMediaThumbnail({
  thumb,
  fullBleed = false,
  compact = false,
  visited = false,
  onPlay,
  playLabel,
  player,
}: {
  thumb: ThumbnailRef;
  /** Whether this place carries the been mark. Drawn over the frame, in the one free corner. */
  visited?: boolean;
  /**
   * Edge-to-edge and square-cornered, for a host that has no gutter of its own — the map popover,
   * whose shell supplies both the padding and the radius. Everywhere else the card has a 20 px
   * gutter and the picture is a rounded block inside it.
   */
  fullBleed?: boolean;
  /**
   * A 112 px band rather than 160 px, for the one host whose total height is fixed by something
   * other than its content. See the `## The band's height is a claim on a fixed budget` paragraph
   * above for why the still shrinks rather than moves or goes.
   */
  compact?: boolean;
  /** See the seam paragraph above. Undefined ⇒ no glyph at all, not a disabled one. */
  onPlay?: () => void;
  /** The glyph's accessible name. Required alongside `onPlay` so no wording is invented here. */
  playLabel?: string;
  /** Rendered in the band instead of the still. See the seam paragraph above. */
  player?: ReactNode;
}) {
  const { url, onFailure } = useRefreshableThumbnail(thumb);

  // `null` as well as `undefined`, because `player` is a `ReactNode` and a caller that computes
  // one conditionally will hand back `null` rather than omitting the prop. Without the second
  // arm, a null player on a place whose picture is also gone renders an `<img>` with no `src` —
  // the browser's broken-image glyph, which is the exact thing the absent state exists to avoid.
  if ((player === undefined || player === null) && url === null) return null;

  return (
    <div
      className={cn(
        // `relative` is what the glyph below is positioned against; `shrink-0` is what keeps this
        // band from being the one child a height-capped column collapses. Both are structural.
        "relative shrink-0 overflow-hidden bg-muted",
        fullBleed ? "rounded-none" : "rounded-lg",
      )}
    >
      {/* **The leading-top corner, because every other corner is taken.** The play control sits at
          `bottom-2 end-2` and a TikTok cover puts its subject centre-top, so this is the corner
          that collides with nothing. `BeenBadge` unchanged — no variant, no second colour, no
          scrim: `bg-accent` is a *solid* ground rather than an alpha, which is the same argument
          the play button's own comment makes about being legible over an arbitrary photograph, and
          `shadow-raised` is what lifts it off a bright frame. `start-`, not `left-`. */}
      {visited && (
        <BeenBadge className="absolute top-2 start-2 z-10 shadow-raised" />
      )}
      {player ?? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- same reason `RowMedia`'s carries
              the rule: an arbitrary, expiring, signed third-party CDN URL, which `next/image` would
              proxy through our own optimizer at a cost and open a second place the referrer
              question has to be answered. */}
          <img
            src={url ?? undefined}
            alt=""
            referrerPolicy="no-referrer"
            onError={onFailure}
            /* Same pre-hydration hole `RowMedia`'s ref closes, and for a stronger reason here: this
               banner is the first thing in a server-rendered detail panel, so its request is issued
               during parse and an expired URL fails before any handler exists. Without this the
               refresh would only ever fire for images that failed after hydration. */
            ref={(node) => {
              if (node?.complete === true && node.naturalWidth === 0)
                onFailure();
            }}
            className={cn("w-full object-cover", compact ? "h-28" : "h-40")}
          />
          {onPlay !== undefined && playLabel !== undefined && (
            <button
              type="button"
              onClick={onPlay}
              aria-label={playLabel}
              // `data-vaul-no-drag`: inside the mobile sheet a press that begins here would
              // otherwise be read as the start of a sheet drag and the tap would be swallowed —
              // the same attribute every other pressable inside the sheet carries.
              data-vaul-no-drag
              className={cn(
                // The trailing-bottom corner, not the centre. A TikTok cover is a portrait frame
                // whose subject sits centre-top, so a centred glyph lands on a face; this corner is
                // the quietest part of the still and the one nearest the thumb on a phone. `end-`
                // rather than `right-`, for the same reason the row's distance uses `ms-auto`.
                "absolute bottom-2 end-2 flex size-11 items-center justify-center rounded-full",
                // A solid ground rather than an alpha scrim: the ink behind it is an arbitrary
                // photograph, and an alpha that reads on a dark frame disappears on a bright one.
                // Both tokens carry both themes, so the pair is legible on either.
                "bg-background text-foreground shadow-md",
                "outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                PRESS_BEAT,
              )}
            >
              {/* Filled, because an outlined triangle at 20 px on a photograph is the one glyph
                  shape that reliably disappears into busy ink. */}
              <Play className="size-5 fill-current" aria-hidden />
            </button>
          )}
        </>
      )}
    </div>
  );
}
