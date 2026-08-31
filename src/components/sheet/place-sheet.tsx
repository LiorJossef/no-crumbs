'use client';

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
 *  - `peek`: a fixed px height (120px + safe-area-bottom) — the viewport heading + Add action.
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
  STOP_TO_CONTENT_HEIGHT,
  type SheetStop,
} from '@/components/shell/sheet-geometry';
import { savedPlaceRef } from '@/components/map/saved-place-ref';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, MapPin, ExternalLink, X, ChevronLeft, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PRESS_ROW } from '@/lib/interaction';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isSearchActive } from '@/domain/places/search';
import { tagFacets, type TagFacet } from '@/ui/place/tag-filter';
import {
  BeenToggle,
  CategoryEditor,
  NameEditor,
  NoteEditor,
  RemoveSavedPlace,
  RenameTrigger,
} from './saved-place-edits';
import {
  ActiveTagFilter,
  DishLine,
  TagChipList,
  TagChipRow,
  TagFacetBar,
  WhyGoLine,
} from './place-enrichment';
import { BeenBadge } from './visit-state';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav';
import { CategoryFilterBar } from './category-filter-bar';
import { CHIP_PRESSABLE } from './place-enrichment';
import { DEFAULT_PLACE_ORDER, type PlaceOrder } from './place-order';
import type { CategoryFacet } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import type { PlaceDetailFacts } from '@/domain/places/spot';
import { enrichmentOf, rowAccessibleName, whyGoEarnsItsPlace } from '@/ui/place/enrichment';
import {
  categoryColorVar,
  categoryLocalityLine,
  categoryTintVar,
} from '@/ui/place/category-display';
import { savedPlaceMapsUrl } from '@/ui/place/maps-link';
import { nearbyDistanceLabel, nearbyPlaces, type NearbyPlace } from '@/ui/place/nearby';
import {
  APPROXIMATE_ROW_ANNOTATION,
  locationCertainty,
  savedElapsedLine,
  savedOnLine,
  visitedOnLine,
} from '@/ui/place/location-certainty';
import { AddToCollection } from '@/components/collections/add-to-collection';

import { formatCaptionQuote, quoteAddsSomething } from '@/ui/place/caption-quote';
import { isolate, type AreaHeading } from '@/ui/place/active-area';
import type { MapPlace } from '@/components/map/types';
import { useNearMeDistance } from '@/components/map/near-me-context';

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
  /** Nothing saved, ever — a different screen, not a different string. */
  readonly libraryIsEmpty: boolean;
  /** Anything in the **whole library** is marked been. The `Not been yet` chip's precondition, and
   *  library-wide rather than list-wide on purpose: the chip filters the map too, and the map draws
   *  every match rather than this area's, so a been place in the next city is one this chip hides
   *  and a list-scoped test would refuse to draw the control that un-hides it. */
  readonly libraryHasVisited: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The tag currently narrowing the library, as stored — `null` when no chip is active. A second
   *  filter dimension rather than text written into `query`; `src/ui/place/tag-filter.ts` says why.
   *  Rendered here as the dismissible pill above the list, and applied upstream so the pins are
   *  narrowed by the same predicate in the same frame. */
  readonly activeTag: string | null;
  /** One tap to clear, from the pill. Chips themselves toggle through the `TagFilterContext`. */
  readonly onClearTag: () => void;
  /** Whether the library is narrowed to places the user has not been to yet. A third filter
   *  dimension beside the tag and the search box, applied upstream so the pins and the rows are
   *  narrowed by the same predicate in the same frame. */
  readonly notBeenOnly: boolean;
  readonly onToggleNotBeen: () => void;
  /** The categories the library actually holds, with counts, already narrowed by every other
   *  filter. Computed on the page rather than here because the same filter narrows the pins. */
  readonly categoryFacets: readonly CategoryFacet[];
  readonly activeCategory: ProductCategory | null;
  readonly onToggleCategory: (category: ProductCategory) => void;
  /**
   * **How many places this list would show with the search and every filter cleared** — the
   * denominator in `12 of 32`, ruled by `overnight-copy-deck.md` §4.3 condition 2.
   *
   * Not the library, not the viewport, and deliberately not anything this component can derive:
   * `places` and `otherPlaces` both arrive already narrowed, so their sum is the *numerator*. The
   * only honest source is the page, which holds the unfiltered list — and the check the deck gives
   * a verifier is exactly that identity: clear the field, read the heading's count, it is the 32
   * you just saw.
   *
   * **Optional, and absent means the count does not render.** A number beside a search field that
   * was computed from a set this component only half has would be a confident wrong answer, which
   * is the one thing this codebase will not ship. `map-page-client.tsx` is where it comes from and
   * that file belongs to another lane tonight; until it passes this, the sighted count is not on
   * screen and `map-shell.tsx`'s live region remains the only announcement of the same fact.
   */
  readonly unfilteredCount?: number;
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
  libraryIsEmpty,
  libraryHasVisited,
  query,
  onQueryChange,
  activeTag,
  onClearTag,
  notBeenOnly,
  onToggleNotBeen,
  categoryFacets,
  activeCategory,
  onToggleCategory,
  unfilteredCount,
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
      <PlaceDetail
        place={selected}
        /* The write target comes from `selected.savedPlaceId`, never from `selected.id` — the two
           differ on any surface whose pins are not saved rows, and `savedPlaceRef` is the one place
           that answers it. Every pin on this route carries one (`map/page.tsx`'s `toMapPlace`), so
           the detail keeps all six of its mutations. */
        savedPlace={savedPlaceRef(selected)}
        nearby={nearbyToSelected}
        onSelectNearby={(id) => {
          const neighbour = places.find((candidate) => candidate.id === id);
          if (neighbour) onSelect(neighbour);
        }}
        onClose={onDeselect}
      />
    );
  }

  return (
    <PlaceList
      places={places}
      heading={heading}
      otherPlaces={otherPlaces}
      activeAreaId={activeAreaId}
      libraryIsEmpty={libraryIsEmpty}
      libraryHasVisited={libraryHasVisited}
      query={query}
      onQueryChange={onQueryChange}
      activeTag={activeTag}
      onClearTag={onClearTag}
      notBeenOnly={notBeenOnly}
      onToggleNotBeen={onToggleNotBeen}
      categoryFacets={categoryFacets}
      activeCategory={activeCategory}
      onToggleCategory={onToggleCategory}
      {...(unfilteredCount === undefined ? {} : { unfilteredCount })}
      stop={stop}
      // `half` for an empty library, `full` once there is a list. The empty state is a heading, a
      // line and one button — about 380 px — so opening it full gave a new user their first screen
      // as that button above roughly 1 100 px of white, with the map they came for hidden behind
      // it. Half fits the content and leaves the map visible; a list is the only thing worth the
      // whole screen.
      onExpand={() => onExpand(libraryIsEmpty ? 'half' : 'full')}
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
  libraryIsEmpty,
  libraryHasVisited,
  query,
  onQueryChange,
  activeTag,
  onClearTag,
  notBeenOnly,
  onToggleNotBeen,
  categoryFacets,
  activeCategory,
  onToggleCategory,
  unfilteredCount,
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
  libraryIsEmpty: boolean;
  libraryHasVisited: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  activeTag: string | null;
  onClearTag: () => void;
  notBeenOnly: boolean;
  onToggleNotBeen: () => void;
  categoryFacets: readonly CategoryFacet[];
  activeCategory: ProductCategory | null;
  onToggleCategory: (category: ProductCategory) => void;
  unfilteredCount?: number;
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
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeAreaId]);

  // An empty library is a different screen, not a different count.
  const headingText = libraryIsEmpty ? EMPTY_LIBRARY_HEADING : heading.text;

  const facets = useLibraryTagFacets(places, otherPlaces, activeTag);

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

  return (
    <div
      style={{ height: STOP_TO_CONTENT_HEIGHT[stop] }}
      className="flex min-h-0 flex-col gap-3.5 px-5 pt-3.5"
    >
      {stop === 'peek' ? (
        /*
         * One line, and the bar underneath it carries everything else.
         *
         * This row used to hold the heading and a 48 px `Add a TikTok`, and briefly a third
         * Collections slot as well. Both of those are now in `BottomNav`, which is the owner's
         * 2026-08-29 ruling: destinations and the primary action live in persistent chrome, not in
         * the sheet. What is left here is the one thing that is genuinely about *this* sheet —
         * what the list below is, and that it can be pulled up.
         *
         * That is also what pays for the bar. `PEEK_PX` is 128 and is mirrored in four places, one
         * of them a licence condition; it sets the camera's bottom budget too, so it must not move.
         * Dropping the button frees the lower half of the band for the bar to sit in, and the
         * padding below matches `BOTTOM_NAV_HEIGHT_PX` so the line never sits behind it.
         */
        <div className="flex items-center" style={{ paddingBottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}>
          <button
            type="button"
            onClick={onExpand}
            aria-label={
              moreElsewhere > 0
                ? `Show your places, and ${moreElsewhere} more from everywhere else`
                : 'Show your places'
            }
            className={cn(
              // **`min-h-11`, and it is the 44px floor rather than a layout tweak.** W7-6 measured
              // this at 350 × 20: wide enough, and less than half the height it needs. It is the
              // control that opens the library on a phone, so it is on the path of every session,
              // and 20px of it is one line of `text-sm` with nothing around it.
              //
              // It costs no vertical space that was doing anything else. `PEEK_PX` is 128 and must
              // not move — it is mirrored in four places, one of them a licence condition, and it
              // sets the camera's bottom budget — but the strip already had the room: dropping the
              // `Add a TikTok` button into `BottomNav` freed the lower half of the band, and this
              // only claims the height the row was already sitting in.
              'flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left text-sm font-medium text-muted-foreground',
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
                  </span>{' '}
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
              <span className="shrink-0 whitespace-nowrap">· +{moreElsewhere} more</span>
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
          <h2
            key={activeAreaId ?? 'no-area'}
            className="animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1 font-heading text-xl font-extrabold tracking-tight text-foreground outline-none"
          >
            {headingText}
          </h2>

          {/* Hidden while the library is empty: there is nothing to search, and an inert field is a
              false affordance offering work that cannot produce a result. */}
          {!libraryIsEmpty && (
            <div className="flex flex-col gap-1.5">
              <PlaceSearchField value={query} onChange={onQueryChange} />
              <ResultCount
                shown={places.length + otherPlaces.length}
                {...(unfilteredCount === undefined ? {} : { of: unfilteredCount })}
                narrowing={
                  isSearchActive(query) ||
                  activeTag !== null ||
                  notBeenOnly ||
                  activeCategory !== null
                }
              />
            </div>
          )}

          {/* Above the list *and* above the empty state, so the one control that undoes a tag
              filter is on screen in the state where the filter has left nothing to look at. The
              same rule is what puts the `Not been yet` chip here: it is both the way in and the way
              out of the filter, so it has to survive the state where the filter emptied the list. */}
          {/* One horizontal-scroll row, not two stacked ones: the category chips and the visit
              chip are the same kind of control asking the same kind of question, and the merge is
              also what lifts `Not been yet` from the 36 px its own file names as a compromise to
              the 44 px floor. Categories had nowhere to live before this — the only way to narrow
              by kind was to open a place and tap a tag chip inside its detail view, which is a
              retrieval control hidden inside a reading surface. */}
          {!libraryIsEmpty && (
            <CategoryFilterBar
              facets={categoryFacets}
              activeCategory={activeCategory}
              onToggleCategory={onToggleCategory}
              notBeenOnly={notBeenOnly}
              onToggleNotBeen={onToggleNotBeen}
              anyVisited={libraryHasVisited}
            />
          )}
          {/* Under the filters and above the list, because it shapes the *same* rows they narrow —
              and a control that reorders a list belongs where the list starts, not in a menu
              somewhere else. Hidden with the filters on an empty library for the same reason the
              search field is: there is nothing to order. */}
          {!libraryIsEmpty && onChangeSort !== undefined && sortOrders.length > 1 && (
            <SortControl order={sortOrder} orders={sortOrders} onChange={onChangeSort} />
          )}
          {/* Under the category bar rather than merged into it: a tag asks *what is this place
              like*, a category asks *what kind of thing is it*, and one row holding both would put
              two vocabularies in identical chips. Renders nothing at all when the library carries
              no tags, which is most libraries — see `TagFacetBar`. */}
          {!libraryIsEmpty && <TagFacetBar facets={facets} />}
          {activeTag !== null && <ActiveTagFilter tag={activeTag} onClear={onClearTag} />}

          {/* The one line some empty headings need — see `AreaHeading.note`. Above the scroll area
              rather than inside it, so it sits with the heading it explains rather than where the
              first row would have been. */}
          {!libraryIsEmpty && heading.note !== null && (
            <p className="text-sm font-medium text-muted-foreground">{heading.note}</p>
          )}

          {libraryIsEmpty ? (
            <NoPlacesYet onAddTikTok={onAddTikTok} />
          ) : (
            <>
              <div
                ref={scrollRef}
                data-vaul-no-drag
                className="min-h-0 flex-1 overflow-y-auto"
                // Exactly the bar's height, so the last row clears it instead of ending underneath
                // it. This is what pays for `BottomNav` floating over the sheet at `half` and
                // `full` — the ruling it reverses was right that a bar painted over a scrolling
                // list steals the bottom of the list, and this is the price rather than a denial.
                style={{
                  scrollPaddingBottom: BOTTOM_NAV_HEIGHT_PX,
                  paddingBottom: BOTTOM_NAV_HEIGHT_PX,
                }}
              >
                {heading.escape === 'clear-search' && (
                  <ClearSearchEscape onClearSearch={() => onQueryChange('')} />
                )}
                {!heading.empty && (
                  <ul>
                    {places.map((place) => (
                      <PlaceRow
                        key={place.id}
                        place={place}
                        {...(onSelect ? { onSelect } : {})}
                        {...(onHover ? { onHover } : {})}
                        selected={selectedId === place.id}
                      />
                    ))}
                  </ul>
                )}
                <EverywhereElse
                  places={otherPlaces}
                  {...(onHover ? { onHover } : {})}
                  {...(selectedId === undefined ? {} : { selectedId })}
                  flush={heading.empty}
                  {...(onSelect ? { onSelect } : {})}
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
 * Empty while a tag is filtering, which is what makes every count it does return true: this list
 * is already narrowed by that tag, so any other tag's number here would be its co-occurrence with
 * the active one rather than its own. `ActiveTagFilter` is the control on screen in that state.
 * **This is the half that wants the page's un-narrowed set** — the seam `categoryFacets` already
 * has at `map-page-client.tsx`'s `facets` — and until that is threaded through, stepping aside is
 * the honest arrangement rather than the complete one.
 */
export function useLibraryTagFacets(
  places: readonly MapPlace[],
  otherPlaces: readonly MapPlace[],
  activeTag: string | null,
): readonly TagFacet[] {
  return useMemo(
    () =>
      activeTag !== null
        ? []
        : tagFacets([...places, ...otherPlaces], (place) => enrichmentOf(place.detail).tags),
    [places, otherPlaces, activeTag],
  );
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
 * **The sort control** — `W5-2`. Three orders, two of which always exist.
 *
 * A row of `aria-pressed` chips rather than a `<select>`, because that is the vocabulary this list
 * already speaks: the category bar and the visit chip above it are the same shape asking the same
 * kind of question, and a native picker here would be the only dropdown in the product. The state
 * lives on `aria-pressed`, so it is announced and styled from one fact — the rule
 * `category-filter-bar.tsx` already follows.
 *
 * **`Nearest` is absent, not disabled, without a fix.** `availableOrders` decides; the reasoning is
 * there, and it is the same rule `near-me.ts` follows when it hides a distance it cannot stand
 * behind. A greyed-out `Nearest` invites the question the screen has no answer to.
 *
 * Every string is `overnight-copy-deck.md` §4.2 — `Sort`, `Recently saved`, `Nearest`, `A–Z`, the
 * last with an en dash. None is written here.
 */
export function SortControl({
  order,
  orders,
  onChange,
}: {
  order: PlaceOrder;
  orders: readonly PlaceOrder[];
  onChange: (order: PlaceOrder) => void;
}) {
  // One option is not a choice. A library with no fix and a control offering only `Recently saved`
  // and `A-Z` still has two, so this only fires if the list of orders is ever narrowed further.
  if (orders.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={SORT_LABEL}
      className="flex items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {orders.map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={candidate === order}
          onClick={() => onChange(candidate)}
          className={cn(CHIP_PRESSABLE, 'min-h-11 shrink-0')}
        >
          {SORT_OPTION_LABEL[candidate]}
        </button>
      ))}
    </div>
  );
}

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
   * the detail view's `Approximate location — worked out from the post…` — plus the tooltip on a
   * pointer device and `APPROXIMATE_ROW_ANNOTATION` in the row's accessible name.
   */
  const certainty = locationCertainty(place.detail?.provenance?.sourceDataset);
  const approximateLabel = certainty?.isApproximate === true ? certainty.label : null;
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
  const distanceLabel = distanceKm === null ? null : nearbyDistanceLabel(distanceKm);
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
        thumbnailUrl={place.detail?.sourceThumbnailUrl}
        color={categoryColorVar(place.category)}
        tint={categoryTintVar(place.category)}
        approximateLabel={approximateLabel}
      />
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5 text-left">
        {/* `<bdi>` isolates a Hebrew or Arabic name inside this LTR row without right-aligning the
            row itself, and `line-clamp-1` replaces `truncate` because an ellipsis on an RTL string
            in an LTR box clips the *start* of the name — the half that identifies it
            (`docs/ux-library-at-scale.md` §4.2). */}
        <p className="line-clamp-1 font-heading text-sm font-bold text-foreground">
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
          <p className="line-clamp-1 text-xs font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-couple group-hover/row:text-foreground/80">
            <bdi>{secondLine ?? categoryLocalityLine(place.category, locality)}</bdi>
          </p>
          {place.visited && <BeenBadge />}
        </div>
        {/* Above the note, below the category, and rendered only when there are any — a row with no
            tags is the normal case (nothing was backfilled, so it is every row saved before
            extraction v2) and must look like a finished row, not a row missing a line. There is
            deliberately no placeholder, no skeleton and no "no tags yet". */}
        {tags.length > 0 && <TagChipRow tags={tags} />}
        {place.note && (
          <p className="line-clamp-1 text-sm font-medium text-muted-foreground">{place.note}</p>
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
          <p className="text-micro font-medium text-muted-foreground">{savedElapsed}</p>
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
          className="ms-auto shrink-0 pt-1 text-xs font-medium tabular-nums text-muted-foreground motion-safe:transition-colors motion-safe:duration-couple group-hover/row:text-foreground"
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
          if (event.pointerType === 'mouse') onHover?.(place.id);
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
        {...(selected ? { 'aria-current': 'true' as const } : {})}
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
          annotations.length === 0 ? rowName : `${isolate(rowName)}, ${annotations.join(', ')}`
        }
        // `data-vaul-no-drag`: inside the mobile sheet, a press that begins on this row would
        // otherwise be read as the start of a sheet drag, and the tap would be swallowed.
        data-vaul-no-drag
        // `PRESS_ROW` is the matrix's press column for a list row: a 1% squeeze at 90ms, which is
        // the only confirmation a phone can give that the tap landed on *this* row before the
        // camera starts flying. Shallower than a button's on purpose — see its docblock.
        className={cn(
          'relative flex min-h-16 w-full items-start gap-3 rounded-lg py-3.5 text-left motion-safe:transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
          // **A named group, never a bare `group`.** These rows nest inside other grouped
          // containers on `/collections`, and an unnamed group would let a parent's hover light up
          // every row inside it.
          'group/row',
          // The open place: a tinted ground and a 2px rule on the inline-start edge. `start-0`
          // rather than `left-0` because this list renders Hebrew names and the rule belongs on the
          // edge the text starts at — the same reason the distance uses `ms-auto`.
          'aria-[current=true]:bg-primary/8',
          'aria-[current=true]:before:absolute aria-[current=true]:before:inset-y-2 aria-[current=true]:before:start-0 aria-[current=true]:before:w-0.5 aria-[current=true]:before:rounded-full aria-[current=true]:before:bg-primary',
          PRESS_ROW,
        )}
      >
        {body}
      </button>
    </li>
  );
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
 * are ordinary: an image, no image, and an image that 404s halfway down a scroll. The last one
 * falls back to the pin disc — `failed` is per mount and never retried, exactly like
 * `SourceMediaThumbnail` on the detail — rather than leaving a broken-image glyph or a hole where a
 * row's identity should be.
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
  thumbnailUrl,
  color,
  tint,
  approximateLabel,
}: {
  thumbnailUrl: string | undefined;
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
  const [failed, setFailed] = useState(false);

  /* The dashed ring when the coordinate is the model's own guess. The mark belongs on this box and
     not beside the text: it is drawn on the thing the uncertainty is about, it costs the city name
     no width on a 375 px row, and running down a list the dashed ring reads against the solid ones
     above and below it. Tried trailing the category line first — a lone dashed circle after
     `Restaurant · ת״א` attaches to nothing and reads as a smudge. */
  const approximate = approximateLabel !== null;

  if (thumbnailUrl !== undefined && !failed) {
    return (
      <span
        aria-hidden
        title={approximateLabel ?? undefined}
        style={approximate ? { borderColor: color } : undefined}
        className={cn(
          'mt-0.5 block size-11 shrink-0 overflow-hidden rounded-lg bg-muted',
          // The row's leading square grows a little while the pointer is on the row — the same
          // 160ms the pin on the map lifts in, so the two halves of the coupling read as one
          // gesture rather than two effects that happen to fire together. `group-hover/row:`
          // reaches in from `PlaceRow`'s button; a plain `group` would also catch the grouped
          // containers this row nests inside on `/collections`.
          'motion-safe:transition-transform motion-safe:duration-couple motion-safe:ease-standard group-hover/row:scale-110',
          approximate && 'border border-dashed',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary, expiring, signed
            third-party CDN URL: `next/image` would proxy every one of them through our own
            optimizer, which is a cost and a second place the referrer question would have to be
            answered. The detail view's `SourceMediaThumbnail` is a plain `<img>` for the same
            reason. */}
        <img
          src={thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
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
            if (node?.complete === true && node.naturalWidth === 0) setFailed(true);
          }}
          className="size-full object-cover"
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
        'mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full',
        // Same lift as the thumbnail arm above, for the same reason — a row has one leading square
        // and it behaves the same way whichever of the two it is drawing.
        'motion-safe:transition-transform motion-safe:duration-couple motion-safe:ease-standard group-hover/row:scale-110',
        approximate && 'border border-dashed',
      )}
    >
      <MapPin className="size-5" />
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
  label = 'Search your places',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
}) {
  const filtering = isSearchActive(value);

  return (
    <div data-vaul-no-drag className={cn('relative', className)}>
      <Search
        className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value !== '') {
            // Stop it here: at `full` the sheet is a dialog, and Escape would otherwise be read as
            // "close", throwing the user out of the list they are searching.
            event.preventDefault();
            event.stopPropagation();
            onChange('');
          }
        }}
        aria-label={label}
        placeholder={label}
        className={cn(
          'h-12 rounded-lg pl-10 text-sm font-medium [&::-webkit-search-cancel-button]:hidden',
          filtering && 'pr-12',
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
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 size-9 -translate-y-1/2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}

/**
 * **`12 of 32`, beside the search field — the same fact the live region already says, for the
 * people who cannot hear it.**
 *
 * The sheet has announced how much of the library is in play since `filterSentence` shipped, and it
 * announced it *only* to a screen reader (`map-shell.tsx`'s one live region). A sighted user typing
 * into the field watched rows disappear with no number anywhere on screen.
 *
 * `overnight-copy-deck.md` §4.3 (C135) rules the string and three conditions, and each one is a
 * line below:
 *
 *  1. **It renders only while something is narrowing.** `32 of 32` says nothing and competes with
 *     the heading, which already carries a count. It appears at the moment the number means
 *     something, which is also what makes it self-explanatory.
 *  2. **The denominator is the post-clear count of the same list**, which this component cannot
 *     derive — see `unfilteredCount`. No denominator, no count: a number that guessed would be a
 *     confident wrong answer beside a control the user is actively driving.
 *  3. **`aria-hidden`.** The sheet has exactly one live region and `filterSentence` already feeds
 *     it the same fact as a sentence. Two announcements of one change is a defect, not redundancy.
 *
 * `N of M` is this product's existing way of saying how much of a set is in play —
 * `import-page-client.tsx` renders `{selectedCount} of {saveableIndices.length} selected` — so this
 * introduces a number, not a form. `0 of 32` needs no special string: the heading beside it already
 * reads `Nothing matches "momos"` and offers `Clear search`.
 */
export function ResultCount({
  shown,
  of,
  narrowing,
}: {
  /** What the list is rendering: the scope's places plus the ones under `Everywhere else`, which
   *  together are every match in the library. */
  shown: number;
  /** The same list with nothing narrowing it. Absent renders nothing at all. */
  of?: number;
  narrowing: boolean;
}) {
  if (!narrowing || of === undefined) return null;

  return (
    <p aria-hidden className="text-micro font-medium tabular-nums text-muted-foreground">
      {shown} of {of}
    </p>
  );
}

/** The one control that undoes a search matching nothing anywhere. A tag filter is undone by its
 *  own pill above the list, so it gets no second control here. */
export function ClearSearchEscape({ onClearSearch }: { onClearSearch: () => void }) {
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
}: {
  places: readonly MapPlace[];
  flush?: boolean;
  onSelect?: (place: MapPlace) => void;
  /** The coupling reaches these rows too: they are ordinary `PlaceRow`s and a place outside the
   *  current area is exactly the one whose pin the user most needs pointing out. */
  onHover?: (placeId: string | null) => void;
  selectedId?: string | null;
}) {
  if (places.length === 0) return null;

  return (
    <section className={flush ? '' : 'mt-5 border-t border-border/70 pt-4'}>
      <h3 className="px-1 pb-1.5 font-heading text-sm font-extrabold tracking-tight text-foreground">
        Everywhere else
      </h3>
      <ul>
        {places.map((place) => (
          <PlaceRow
            key={place.id}
            place={place}
            {...(onSelect ? { onSelect } : {})}
            {...(onHover ? { onHover } : {})}
            selected={selectedId === place.id}
          />
        ))}
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
/** `C131`. The control's accessible name — it labels a group of chips, which have no visible
 *  heading of their own because a word above three short chips costs more room than it earns. */
export const SORT_LABEL = 'Sort';

/** `C132`–`C134`, `overnight-copy-deck.md` §4.2. `A–Z` takes an **en dash**, matching the
 *  product's typography elsewhere; it is not a hyphen and must not be normalised into one. */
export const SORT_OPTION_LABEL: Record<PlaceOrder, string> = {
  recent: 'Recently saved',
  nearest: 'Nearest',
  alpha: 'A\u2013Z',
};

export const EMPTY_LIBRARY_HEADING = 'Your map starts here.';

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
 * thumb zone. The desktop panel does not use this — it already carries `Add a TikTok` in its header
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
        className="h-12 w-full gap-1.5 rounded-lg text-sm font-bold"
        onClick={() => onAddTikTok()}
      >
        <Plus className="size-4" aria-hidden />
        Add a TikTok
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
  variant = 'sheet',
  primaryAction,
  footer,
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
  variant?: 'sheet' | 'panel' | 'popover' | 'hosted';
  /**
   * Rendered where `BeenToggle` sits — the "what does this do to *your* library" position.
   *
   * A slot rather than a `readOnly` boolean: a flag can be forgotten, and it would not have fixed
   * the thing that actually bites (`place.id` standing in for a saved-place id). The collection
   * route puts `Added by …` and `Save to your places` here, which is that position's question
   * asked by somebody who has no row yet.
   */
  primaryAction?: ReactNode;
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
  const tiktokUrl = detail?.sourceUrl ?? source?.canonicalUrl ?? place.sourceUrl;
  const thumbnailUrl = detail?.sourceThumbnailUrl ?? source?.media?.url;
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
  const [renaming, setRenaming] = useState(false);

  const isPopover = variant === 'popover';
  const isHosted = variant === 'hosted';

  /** Every mutation block below is gated on this, and none of them reads an id off `place` — that
   *  is the whole point of this refactor. No narrowing is needed: the prop is already the pair. */
  const savedRow = savedPlace;

  /** Gated on `visited` as well as on the date. The pair cannot disagree in the database (`0006`'s
   *  CHECK), but this prop is an object a caller assembles, and a date printed under a button
   *  reading `Been here` would be the screen contradicting itself. */
  const visitedOn = savedRow?.visited ? visitedOnLine(savedRow.visitedAt, new Date()) : null;

  /**
   * Whether the Google Maps link is the only external action on the card, which decides both its
   * wording and its target size. Beside `Open TikTok` the pair reads as a list of destinations and
   * a bare noun is enough; alone in whitespace a bare noun stops looking like something to press,
   * and it needs its own 44 px rather than borrowing the row's.
   */
  const mapsLinkAlone = !tiktokUrl;

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
  const quote = formatCaptionQuote(reason);
  const shownQuote = quoteAddsSomething(quote, {
    name: place.name,
    addressLine,
    locality,
  })
    ? quote
    : null;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3.5',
        isPopover && 'max-h-[min(70vh,26rem)] w-72 gap-4 px-0 pb-0 pt-0',
        // The host's gutter and its own top spacing — see the `variant` docblock for why 4 px
        // matters here and why the top padding belongs to the header row above this column.
        isHosted && 'px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-1',
      )}
    >
      {thumbnailUrl && <SourceMediaThumbnail url={thumbnailUrl} />}

      <div className={cn('flex items-start justify-between gap-3', isPopover && 'px-4 pt-3.5')}>
        <div className="flex min-w-0 flex-col gap-1">
          {renaming && savedRow ? (
            <NameEditor
              key={`name-${savedRow.id}`}
              savedPlaceId={savedRow.id}
              displayNameOverride={detail?.displayNameOverride ?? null}
              canonicalName={detail?.canonicalName ?? place.name}
              onDone={() => setRenaming(false)}
            />
          ) : (
            <div className="flex min-w-0 items-start gap-1">
              {/* `<bdi>` rather than `dir="auto"` on the heading: a Hebrew name would otherwise
                  right-align the whole identity block while the category line under it stayed
                  left, so a mixed library would have a ragged edge. */}
              <h2
                className={cn(
                  'min-w-0 font-heading text-2xl font-extrabold tracking-tight text-foreground',
                  isPopover && 'text-lg',
                )}
              >
                <bdi>{place.name}</bdi>
              </h2>
              {/* Beside the name, not in the controls block below: this is the one control that
                  changes the biggest word on the screen, and it belongs next to that word. */}
              {savedRow && <RenameTrigger onStart={() => setRenaming(true)} />}
            </div>
          )}
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
            aria-label={variant === 'panel' ? 'Back to your places' : 'Close place detail'}
            onClick={onClose}
            className="shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {variant === 'panel' ? (
              <ChevronLeft className="size-5" aria-hidden />
            ) : (
              <X className="size-5" aria-hidden />
            )}
          </Button>
        )}
      </div>

      <div className={cn('flex flex-col gap-5', isPopover && 'gap-4 px-4 pb-4')}>
        {/* The street address, which this view did not show at all until now. It was in the data
            the whole time — `places.address_line`, already good enough to build the Google Maps
            link out of — and it is the one fact that answers "can I actually find this place".
            Above the caption quote, because it is checkable and the quote is not. */}
        {addressLine && (
          <p dir="auto" className="flex items-start gap-2 text-sm text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{addressLine}</span>
          </p>
        )}

        {/* What the creator actually wrote, as a quotation rather than as a labelled field.
            A rule and a pair of quote marks say "someone else's words" faster than the kicker
            reading FROM THE POST did, and they leave the model's own sentence below free to be
            plain text — which is the whole extracted-versus-inferred distinction, carried by shape
            instead of by two competing labels.

            `dir="auto"` because this is a verbatim caption substring: a Hebrew quote rendered
            left-to-right puts its punctuation on the wrong end of the sentence. */}
        {shownQuote !== null && (
          <figure className="flex flex-col gap-1.5 border-l-2 border-brand-tint pl-3">
            <blockquote dir="auto" className="text-sm leading-relaxed text-foreground">
              &ldquo;{shownQuote}&rdquo;
            </blockquote>
            {authorLabel && (
              <figcaption className="text-xs font-medium text-muted-foreground">
                {authorLabel}
              </figcaption>
            )}
          </figure>
        )}

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
        {shownWhyGo !== null && <WhyGoLine whyGo={shownWhyGo} />}

        {/* The dishes the post named. Last of the three content blocks because it is a list to
            skim rather than something to read, and because it is the one most often empty. */}
        <DishLine dishes={dishes} />

        {/* The one control the product wants the user to come back and use — see
            `saved-place-edits.tsx` for why it leads the controls block rather than sitting up in
            the identity header. `key` on the saved place's id so a pending transition from the
            previously selected place can never land on this one. */}
        {savedRow && (
          /* The toggle and the date it produced, in one block rather than as two children of the
             `gap-5` column — 20 px between a control and the caption that qualifies it reads as
             two unrelated things. `gap-1.5` is the toggle's own internal rhythm (it uses the same
             for its error line). */
          <div className="flex flex-col gap-1.5">
            <BeenToggle
              key={`been-${savedRow.id}`}
              savedPlaceId={savedRow.id}
              placeName={place.name}
              visited={savedRow.visited}
            />
            {/* The one thing the database has always held about a been mark and no screen said.
                Same 11px muted weight as `Saved on …` below, because it is the same kind of fact:
                a quiet record of when, not something to act on. Absent — silently — when the row
                carries no timestamp; `visitedOnLine` says why that is a real state. */}
            {visitedOn && (
              <p className="text-center text-micro font-medium text-muted-foreground">
                {visitedOn}
              </p>
            )}
          </div>
        )}

        {/* The same position, for a host whose caller has no row to toggle: on
            `/collections/[id]` this is `Added by …` and `Save to your places`. */}
        {primaryAction}

        {/* Directly under `BeenToggle` and above `CategoryEditor`: been/not-been and "which list is
            this in" are both statements about the user's *intent* with the place, while category
            and note are corrections to what we got wrong. Grouping the two intent controls keeps
            the correction block intact underneath. Renders nothing outside a `CollectionsContext`
            provider, so the desktop popover and any test host are unaffected. */}
        {savedRow && (
          <AddToCollection key={`collections-${savedRow.id}`} placeId={detail?.placeId} />
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
            // A place with no TikTok behind it was added by hand, so nothing was "worked out from
            // the post" — there is no post. `tiktokUrl` rather than a new field: the same value
            // already decides whether this card offers `Open TikTok`, so the two cannot disagree.
            fromAPost={Boolean(tiktokUrl)}
          />
        )}

        {/* `L1-F7-T2`. The note used to render read-only, and a place you saved was a place you
            were stuck with. `key` on the saved place's id is what resets a half-typed draft when
            the selection changes — the editor deliberately does not sync from props in an effect,
            which would discard typing every time the server revalidated. */}
        {savedRow && <NoteEditor key={savedRow.id} savedPlaceId={savedRow.id} note={note} />}

        {/* Two external actions, presented as plain text links — same weight as `reason`/`note`
            above, no border/fill box. The panel (or sheet) is already the container; a bordered
            chip pair inside it was a box nested inside a box. `authorLabel` (if any) is a caption
            above the pair, not squeezed into either action itself. */}
        <div className="flex flex-col gap-2">
          {/* Only when the quote did not already carry it — the attribution belongs with the
              words it attributes, and printing it twice on one card is the kind of repetition that
              makes a detail view feel padded. */}
          {authorLabel && shownQuote === null && (
            <p className="text-xs font-medium text-muted-foreground">Saved from {authorLabel}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {tiktokUrl && (
              <a
                href={tiktokUrl}
                target="_blank"
                rel="noreferrer"
                data-vaul-no-drag
                className="flex items-center gap-1.5 text-sm font-bold text-brand underline-offset-4 hover:underline"
              >
                Open TikTok
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-vaul-no-drag
              className={cn(
                'flex items-center gap-1.5 text-sm font-bold text-brand underline-offset-4 hover:underline',
                mapsLinkAlone && 'min-h-11',
              )}
            >
              {mapsLinkAlone ? 'Open in Google Maps' : 'Google Maps'}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>

        {/* What else of yours is around here — the library's own retrieval question, asked at the
            scale of one place. Below the external links and above the provenance line: it is a
            fact about the library rather than about this place, so it belongs after everything
            this card is actually about. Renders nothing when there is nothing within a walk, which
            is the point — a section that is always full stops carrying information. */}
        {nearby !== undefined && nearby.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-micro font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {nearby.length === 1 ? 'Also nearby' : `${nearby.length} more nearby`}
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
                        'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left motion-safe:transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50',
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
        {(certainty || detail?.savedAt) && (
          <div className="flex flex-col gap-1">
            {certainty && (
              <p
                className={cn(
                  'text-xs font-medium',
                  certainty.isApproximate ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {certainty.label}
                {certainty.detail && (
                  <span className="font-normal text-muted-foreground"> — {certainty.detail}</span>
                )}
              </p>
            )}
            {detail?.savedAt && (
              <p className="text-micro font-medium text-muted-foreground">
                {savedOnLine(detail.savedAt, new Date())}
              </p>
            )}
          </div>
        )}

        {/* Last, and quiet. The destructive action belongs below everything the user might have
            opened this detail to read, not competing with it. `onClose` is the deselect the
            caller already passes — the map page's own render-time guard would drop the selection
            once the revalidated list arrives, but that would leave the detail open over a place
            that is already gone for the length of the round trip. */}
        {savedRow && (
          <RemoveSavedPlace savedPlaceId={savedRow.id} placeName={place.name} onRemoved={onClose} />
        )}

        {/* Last of all, and the host's to fill: `/collections/[id]` puts the shared note and
            `Remove from this collection` here — both statements about *this collection*, which is
            why they sit below everything this view says about the place itself. */}
        {footer}
      </div>
    </div>
  );
}

/**
 * The source post's thumbnail, at the top of the detail view. `referrerPolicy="no-referrer"` is
 * load-bearing, not decorative: without it the browser sends a `Referer` header to TikTok's CDN
 * on every image request, which would let TikTok correlate its own signed URLs with which of our
 * users' devices requested them — a privacy leak of "which posts this person saved," not just an
 * unnecessary header.
 *
 * The URL is a signed TikTok CDN link with a known-but-unstored expiry (`SpotSource.media`'s own
 * comment, and `Spot.sourceThumbnailUrl`'s — the two describe the same ~6-month expiry) —
 * `onError` swaps to an empty state permanently for this mount (`failed` state, not retried)
 * rather than leaving a broken-image icon on screen.
 */
function SourceMediaThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className="overflow-hidden rounded-lg bg-muted">
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-40 w-full object-cover"
      />
    </div>
  );
}
