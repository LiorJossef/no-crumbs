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

import { Drawer } from 'vaul';

import { useNonModalBackground } from './use-non-modal-background';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, MapPin, ExternalLink, X, ChevronLeft, ChevronUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isSearchActive } from '@/domain/places/search';
import {
  BeenToggle,
  CategoryEditor,
  NameEditor,
  NoteEditor,
  RemoveSavedPlace,
  RenameTrigger,
} from './saved-place-edits';
import { ActiveTagFilter, DishLine, TagChipList, TagChipRow, WhyGoLine } from './place-enrichment';
import { BeenBadge } from './visit-state';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav';
import { CategoryFilterBar } from './category-filter-bar';
import type { CategoryFacet } from '@/domain/places/category-filter';
import type { ProductCategory } from '@/domain/places/product-category';
import type { PlaceDetailFacts } from '@/domain/places/spot';
import { enrichmentOf, rowAccessibleName, whyGoEarnsItsPlace } from '@/ui/place/enrichment';
import { categoryDisplay, categoryLocalityLine } from '@/ui/place/category-display';
import { savedPlaceMapsUrl } from '@/ui/place/maps-link';
import { nearbyDistanceLabel, nearbyPlaces, type NearbyPlace } from '@/ui/place/nearby';
import {
  APPROXIMATE_ROW_ANNOTATION,
  locationCertainty,
  savedOnLine,
  visitedOnLine,
} from '@/ui/place/location-certainty';
import { AddToCollection } from '@/components/collections/add-to-collection';

import { formatCaptionQuote, quoteAddsSomething } from '@/ui/place/caption-quote';
import { isolate, type AreaHeading } from '@/ui/place/active-area';
import type { MapPlace } from '@/components/map/types';
import { useNearMeDistance } from '@/components/map/near-me-context';

/** Fixed peek height. `env(safe-area-inset-bottom)` is added via CSS `calc()` inside the snap
 *  point's own element (vaul only takes a bare px number for the snap point itself), so the sheet's
 *  *drag* stop stays a stable number while the visual bottom padding still respects the inset. */
const PEEK_PX = 128;

type SheetStop = 'peek' | 'half' | 'full';

const SNAP_PEEK = `${PEEK_PX}px` as const;
/**
 * The stop the sheet rises to when a place is selected.
 *
 * Exported because the **camera** needs it: selecting a pin raises the sheet over 55% of the
 * viewport, and a pin that was in the lower half is then behind it. `map-surface`'s reveal pan is
 * what stops that, and it can only be right if it is reading the same number this sheet moves to.
 * Two independent readings of one stop is how a "reveal" comes to reveal into the wrong band.
 */
export const SHEET_HALF_FRACTION = 0.55 as const;

const SNAP_HALF = SHEET_HALF_FRACTION;
const SNAP_FULL = 1 as const;

const SNAP_POINTS: Array<`${number}px` | number> = [SNAP_PEEK, SNAP_HALF, SNAP_FULL];

/**
 * How tall the sheet's content column is at each stop, as CSS.
 *
 * **This is a bug fix, not a layout preference.** `Drawer.Content` is `h-full` and vaul positions
 * the sheet by translating it, so at `half` the bottom 45% of a full-height flex column sits below
 * the bottom of the screen. Everything down there is laid out, painted, hit-testable and reported
 * `visible` by a testing library — and completely unreachable, because the scroll container's own
 * bottom is off screen so scrolling to its end still does not bring it into view. Measured at 844:
 * the boundary heading below the last row came to rest 242 px below the viewport at maximum scroll.
 *
 * That was survivable while the only thing down there was a section most sessions never opened. It
 * is not survivable now: everything below that heading is the rest of the library, and the list is
 * the only rendering of it a screen reader can reach — the map's markers are painted into a canvas
 * (§6).
 *
 * `dvh` rather than a measured pixel value, so it survives a rotation and the mobile URL bar with no
 * JavaScript and no resize listener. The subtraction is the drag handle above this column
 * (`mt-2.5 h-1`), which is the only other thing inside `Drawer.Content`.
 */
const STOP_TO_CONTENT_HEIGHT: Record<SheetStop, string> = {
  peek: `calc(${PEEK_PX}px - 14px)`,
  half: 'calc(55dvh - 14px)',
  full: 'calc(100dvh - 14px)',
};

const STOP_TO_SNAP: Record<SheetStop, `${number}px` | number> = {
  peek: SNAP_PEEK,
  half: SNAP_HALF,
  full: SNAP_FULL,
};

function snapToStop(snap: number | string | null): SheetStop {
  if (snap === SNAP_FULL) return 'full';
  if (snap === SNAP_HALF) return 'half';
  return 'peek';
}

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
  readonly selected: MapPlace | null;
  readonly onDeselect: () => void;
  /** Opens the import overlay in `map-page-client.tsx` (client state) rather than navigating to
   *  the standalone `/import` route, so the map underneath this sheet stays mounted. */
  readonly onAddTikTok: () => void;
  /** Selecting from the list, which the map's canvas-drawn pins cannot offer to a keyboard user —
   *  see `PlaceRow`'s header for why this stopped being optional at `L1-F7-T2`. */
  readonly onSelect: (place: MapPlace) => void;
}

interface SheetState {
  readonly snap: number | string | null;
  /** The stop to restore on deselect — kept in state (not a ref) so the transition below can be
   *  computed during render, per React's own "adjust state when a prop changes" pattern
   *  (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes),
   *  without a `useEffect` and without reading/writing a ref mid-render. */
  readonly previousStop: SheetStop;
  readonly lastSelectedId: string | null;
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
  selected,
  onDeselect,
  onAddTikTok,
  onSelect,
}: PlaceSheetProps) {
  // `modal={false}` below does not reach Radix through vaul 1.1.2, so the dialog hides the whole
  // page from assistive technology. See `use-non-modal-background.ts` for the measurement.
  useNonModalBackground(true);

  const [sheet, setSheet] = useState<SheetState>({
    snap: STOP_TO_SNAP.peek,
    previousStop: 'peek',
    lastSelectedId: null,
  });

  // Rising to `half` for a newly selected place, and restoring the prior stop on deselect (§7).
  // Both sides of the guard must be normalized to the same nullable type (`string | null`) —
  // comparing `selected?.id` (which is `undefined` when nothing is selected) against
  // `sheet.lastSelectedId` (typed and stored as `null`) never closes the guard, since
  // `undefined !== null` is always `true`, causing an infinite render loop.
  const selectedId = selected?.id ?? null;
  if (selectedId !== sheet.lastSelectedId) {
    const current = snapToStop(sheet.snap);
    setSheet({
      snap: selected ? STOP_TO_SNAP.half : STOP_TO_SNAP[sheet.previousStop],
      previousStop: selected && current !== 'half' ? current : sheet.previousStop,
      lastSelectedId: selectedId,
    });
  }

  const setActiveSnap = (snap: number | string | null) =>
    setSheet((s) => ({ ...s, snap }));

  /** Your other places within a walk of the open one. Memoised on the pair rather than computed
   *  in the detail: `places` is the whole library and the sheet re-renders on every drag frame. */
  const nearbyToSelected = useMemo(
    () => (selected === null ? [] : nearbyPlaces(selected, places)),
    [selected, places],
  );

  const currentStop = snapToStop(sheet.snap);

  return (
    <>
      {/* At `full`, the map is not meaningfully visible; a tap on the remaining strip collapses
          the sheet rather than reaching the map underneath (§6.5). Non-modal drawer, so this is
          the only thing standing in for that rule — there is no vaul overlay to repurpose.
          Mobile-only: the desktop panel has no equivalent full-bleed stop. */}
      {currentStop === 'full' && (
        <button
          type="button"
          aria-label="Collapse the places sheet"
          onClick={() => setActiveSnap(STOP_TO_SNAP.peek)}
          className="fixed inset-0 z-30 bg-transparent lg:hidden"
        />
      )}

      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        snapPoints={SNAP_POINTS}
        activeSnapPoint={sheet.snap}
        setActiveSnapPoint={setActiveSnap}
        snapToSequentialPoint
      >
        <Drawer.Portal>
          {/* `lg:hidden` — the desktop composition (`PlaceDesktopPanel`) replaces this surface
              entirely above the breakpoint; there is no drag, no snap points, no sheet chrome. */}
          <Drawer.Content
            data-testid="place-sheet"
            className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[100dvh] flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-[var(--shadow-elevated)] outline-none lg:hidden"
          >
            <Drawer.Handle className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border" />

            {selected ? (
              /* `place.id` is a `saved_places` id on this route — saying so at the call site is
                 what the required prop buys. */
              <PlaceDetail
                place={selected}
                savedPlace={{
                  id: selected.id,
                  visited: selected.visited,
                  // `visitedAt` lives on the joined `Spot` rather than on the pin, so it is read
                  // off `detail` here. Spread rather than passed as `undefined` because
                  // `exactOptionalPropertyTypes` is on and "absent" is the honest shape for a
                  // marked row that never got a timestamp.
                  ...(selected.detail?.visitedAt ? { visitedAt: selected.detail.visitedAt } : {}),
                }}
                nearby={nearbyToSelected}
                onSelectNearby={(id) => {
                  const neighbour = places.find((candidate) => candidate.id === id);
                  if (neighbour) onSelect(neighbour);
                }}
                onClose={onDeselect}
              />
            ) : (
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
                stop={currentStop}
                // `half` for an empty library, `full` once there is a list. The empty state is a
                // heading, a line and one button — about 380 px — so opening it full gave a new
                // user their first screen as that button above roughly 1 100 px of white, with the
                // map they came for hidden behind it. Half fits the content and leaves the map
                // visible; a list is the only thing worth the whole screen.
                onExpand={() =>
                  setActiveSnap(libraryIsEmpty ? STOP_TO_SNAP.half : STOP_TO_SNAP.full)
                }
                onAddTikTok={onAddTikTok}
                onSelect={onSelect}
              />
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
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
  stop,
  onExpand,
  onAddTikTok,
  onSelect,
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
  stop: SheetStop;
  onExpand: () => void;
  onAddTikTok: () => void;
  onSelect?: (place: MapPlace) => void;
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
        <div
          className="flex items-center"
          style={{ paddingBottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}
        >
          <button
            type="button"
            onClick={onExpand}
            aria-label={
              moreElsewhere > 0
                ? `Show your places, and ${moreElsewhere} more from everywhere else`
                : 'Show your places'
            }
            className="flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left text-sm font-medium text-muted-foreground"
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
                <span className="font-heading font-extrabold text-foreground">{heading.count}</span>{' '}
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
              140 ms, the one piece of motion that marks the one legitimate change of scope (§7).
              It is deliberately not applied when only the *count* changes — filtering re-renders
              this element without remounting it, and a heading that flashes on every keystroke is
              the animation §7 forbids by name. `motion-reduce` makes it an instant swap, which is
              the right answer here even though a sub-150 ms opacity fade would be permitted on its
              own: this fires alongside a scroll reset and a focus move, and three simultaneous
              changes with reduced motion on should be one frame. */}
          <h2
            key={activeAreaId ?? 'no-area'}
            className="animate-in fade-in-0 duration-140 font-heading text-xl font-extrabold tracking-tight text-foreground outline-none motion-reduce:animate-none"
          >
            {headingText}
          </h2>

          {/* Hidden while the library is empty: there is nothing to search, and an inert field is a
              false affordance offering work that cannot produce a result. */}
          {!libraryIsEmpty && <PlaceSearchField value={query} onChange={onQueryChange} />}

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
                style={{ scrollPaddingBottom: BOTTOM_NAV_HEIGHT_PX, paddingBottom: BOTTOM_NAV_HEIGHT_PX }}
              >
                {heading.escape === 'clear-search' && (
                  <ClearSearchEscape onClearSearch={() => onQueryChange('')} />
                )}
                {!heading.empty && (
                  <ul>
                    {places.map((place) => (
                      <PlaceRow key={place.id} place={place} {...(onSelect ? { onSelect } : {})} />
                    ))}
                  </ul>
                )}
                <EverywhereElse
                  places={otherPlaces}
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
export function PlaceRow({
  place,
  onSelect,
  secondLine,
}: {
  place: MapPlace;
  onSelect?: (place: MapPlace) => void;
  /** Overrides the `Category · Locality` line. A collection's rows are built from a `places` row
   *  rather than from the caller's own `Spot`, so they have a locality to show and no `detail` to
   *  read it from; the alternative was putting `locality` on the map port, which exists precisely
   *  so no renderer detail leaks into it. */
  secondLine?: string;
}) {
  const locality = place.detail?.locality;
  const { tags } = enrichmentOf(place.detail);
  const category = categoryDisplay(place.category);
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
  const annotations = [
    ...(distanceLabel === null ? [] : [`${distanceLabel} away`]),
    ...(approximateLabel === null ? [] : [APPROXIMATE_ROW_ANNOTATION]),
  ];

  const body = (
    <>
      {/* The row's own pin, in the category's colour — the same colour the map draws it. Two
          surfaces showing one place used to agree on nothing but its name; now a brown cup on the
          map and a brown row are visibly the same café.

          A dashed ring when the coordinate is the model's own guess. The mark belongs here and not
          beside the text: this disc *is* the pin, so the uncertainty is drawn on the thing it is
          about, it costs the city name no width on a 375 px row, and running down a list the
          dashed ring reads against the solid ones above and below it. Tried trailing the category
          line first — a lone dashed circle after `Restaurant · ת״א` attaches to nothing and reads
          as a smudge. */}
      <span
        aria-hidden
        title={approximateLabel ?? undefined}
        style={{
          backgroundColor: `${category.color}1F`,
          color: category.color,
          ...(approximateLabel === null ? {} : { borderColor: category.color }),
        }}
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          approximateLabel !== null && 'border border-dashed',
        )}
      >
        <MapPin className="size-4" />
      </span>
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
          <p className="line-clamp-1 text-xs font-medium text-muted-foreground">
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
          className="ms-auto shrink-0 pt-1 text-xs font-medium tabular-nums text-muted-foreground"
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
        className="flex min-h-16 w-full items-start gap-3 rounded-lg py-3.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {body}
      </button>
    </li>
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
          aria-label="Clear search"
          onClick={() => onChange('')}
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
}: {
  places: readonly MapPlace[];
  flush?: boolean;
  onSelect?: (place: MapPlace) => void;
}) {
  if (places.length === 0) return null;

  return (
    <section className={flush ? '' : 'mt-5 border-t border-border/70 pt-4'}>
      <h3 className="px-1 pb-1.5 font-heading text-sm font-extrabold tracking-tight text-foreground">
        Everywhere else
      </h3>
      <ul>
        {places.map((place) => (
          <PlaceRow key={place.id} place={place} {...(onSelect ? { onSelect } : {})} />
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
        onClick={onAddTikTok}
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
    : source?.authorName ?? null;
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
    whyGoEarnsItsPlace(whyGo, { reason, tags, dishes, name: place.name, locality })
      ? whyGo
      : null;

  // The caption fragment, minus the creator's 📍/✨ formatting, and only when it says something the
  // name, address and city above it do not. Measured on this database: `📍האחים, אבן גבירול 26` is
  // the name, a comma and the address — quoting it under a heading was a labelled block that
  // repeated the two lines directly above it.
  const quote = formatCaptionQuote(reason);
  const shownQuote = quoteAddsSomething(quote, { name: place.name, addressLine, locality })
    ? quote
    : null;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3.5',
        isPopover && 'max-h-[min(70vh,26rem)] w-72 gap-4 px-0 pb-0 pt-0',
        // The host's gutter and its own top spacing — see the `variant` docblock for why 4 px
        // matters here and why the top padding belongs to the header row above this column.
        isHosted && 'px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-1'
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
                  isPopover && 'text-lg'
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
          <figure className="flex flex-col gap-1.5 border-l-2 border-[var(--mint-300)] pl-3">
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
              <p className="text-center text-[11px] font-medium text-muted-foreground/70">
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
                className="flex items-center gap-1.5 text-sm font-bold text-[var(--mint-700)] underline-offset-4 hover:underline"
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
                'flex items-center gap-1.5 text-sm font-bold text-[var(--mint-700)] underline-offset-4 hover:underline',
                mapsLinkAlone && 'min-h-11'
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
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
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
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
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
              <p className="text-[11px] font-medium text-muted-foreground/70">
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
    <div className="overflow-hidden rounded-[var(--radius)] bg-muted">
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
