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
import { useLayoutEffect, useRef, useState } from 'react';
import { Plus, MapPin, ExternalLink, X, ChevronLeft, Search } from 'lucide-react';
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
import { BeenBadge, NotBeenFilterChip } from './visit-state';
import { enrichmentOf, rowAccessibleName, whyGoEarnsItsPlace } from '@/ui/place/enrichment';
import { categoryDisplay, categoryLocalityLine } from '@/ui/place/category-display';
import { savedPlaceMapsUrl } from '@/ui/place/maps-link';
import { locationCertainty, savedOnLine } from '@/ui/place/location-certainty';
import { AddToCollection } from '@/components/collections/add-to-collection';
import { CollectionsNavRow } from '@/components/collections/collections-nav-row';
import { formatCaptionQuote, quoteAddsSomething } from '@/ui/place/caption-quote';
import type { AreaHeading } from '@/ui/place/active-area';
import type { ElsewhereEntry } from '@/ui/place/elsewhere-groups';
import { ElsewhereSection } from './elsewhere-section';
import type { MapPlace } from '@/components/map/types';

/** Fixed peek height. `env(safe-area-inset-bottom)` is added via CSS `calc()` inside the snap
 *  point's own element (vaul only takes a bare px number for the snap point itself), so the sheet's
 *  *drag* stop stays a stable number while the visual bottom padding still respects the inset. */
const PEEK_PX = 128;

type SheetStop = 'peek' | 'half' | 'full';

const SNAP_PEEK = `${PEEK_PX}px` as const;
const SNAP_HALF = 0.55 as const;
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
 * the `Elsewhere` heading came to rest 242 px below the viewport at maximum scroll.
 *
 * That was survivable while the only thing down there was a section most sessions never opened. It
 * is not survivable now: `Elsewhere` is the country band's whole list rendering, and it is the
 * accessible equivalent of markers a screen reader cannot reach at all (§6).
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
  /** The user's other areas, grouped by country (`ui/place/elsewhere-groups.ts`). Empty renders no
   *  section. Built upstream so this surface and the desktop panel cannot disagree about it. */
  readonly elsewhere: readonly ElsewhereEntry[];
  /** Which country groups the user has explicitly opened or closed. Defaults are not in here —
   *  `isCountryExpanded` owns those, and this surface passes its own (`active-and-previous`). */
  readonly countryExpansion: ReadonlyMap<string, boolean>;
  readonly onToggleCountry: (key: string, expanded: boolean) => void;
  readonly onSelectArea: (areaId: string) => void;
  /** The area the list is showing. Not rendered — it is what the scroll reset and the heading's
   *  crossfade key on, both of which mark the one legitimate change of scope. */
  readonly activeAreaId: string | null;
  /** Nothing saved, ever — a different screen, not a different string. */
  readonly libraryIsEmpty: boolean;
  /** Whether the search box or a tag chip is narrowing the library, which decides the noun on the
   *  area rows so they never disagree with the header above them. */
  readonly filtering: boolean;
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
  elsewhere,
  countryExpansion,
  onToggleCountry,
  onSelectArea,
  activeAreaId,
  libraryIsEmpty,
  filtering,
  query,
  onQueryChange,
  activeTag,
  onClearTag,
  notBeenOnly,
  onToggleNotBeen,
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
              <PlaceDetail place={selected} onClose={onDeselect} />
            ) : (
              <PlaceList
                places={places}
                heading={heading}
                elsewhere={elsewhere}
                countryExpansion={countryExpansion}
                onToggleCountry={onToggleCountry}
                onSelectArea={onSelectArea}
                activeAreaId={activeAreaId}
                libraryIsEmpty={libraryIsEmpty}
                filtering={filtering}
                query={query}
                onQueryChange={onQueryChange}
                activeTag={activeTag}
                onClearTag={onClearTag}
                notBeenOnly={notBeenOnly}
                onToggleNotBeen={onToggleNotBeen}
                stop={currentStop}
                onExpand={() => setActiveSnap(STOP_TO_SNAP.full)}
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
  elsewhere,
  countryExpansion,
  onToggleCountry,
  onSelectArea,
  activeAreaId,
  libraryIsEmpty,
  filtering,
  query,
  onQueryChange,
  activeTag,
  onClearTag,
  notBeenOnly,
  onToggleNotBeen,
  stop,
  onExpand,
  onAddTikTok,
  onSelect,
}: {
  places: readonly MapPlace[];
  heading: AreaHeading;
  elsewhere: readonly ElsewhereEntry[];
  countryExpansion: ReadonlyMap<string, boolean>;
  onToggleCountry: (key: string, expanded: boolean) => void;
  onSelectArea: (areaId: string) => void;
  activeAreaId: string | null;
  libraryIsEmpty: boolean;
  filtering: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  activeTag: string | null;
  onClearTag: () => void;
  notBeenOnly: boolean;
  onToggleNotBeen: () => void;
  stop: SheetStop;
  onExpand: () => void;
  onAddTikTok: () => void;
  onSelect?: (place: MapPlace) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * **The scroll goes back to the top when the area changes, and it never did before.**
   *
   * This was specified when the area model shipped (`ux-stable-area-list.md`) and was not built.
   * The cost is at its worst exactly where the country band puts the user: you scroll two thousand
   * pixels to reach `Elsewhere`, tap a city, and the browser clamps `scrollTop` to the new content
   * — so you arrive at the *bottom* of the new area, looking at `Elsewhere` again, with no visible
   * evidence that anything happened but a heading you cannot see.
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

  /** Switching area replaces every row and unmounts the button that was pressed, so focus lands on
   *  the heading — the one thing that describes the new answer. */
  const selectArea = (areaId: string) => {
    onSelectArea(areaId);
    headingRef.current?.focus({ preventScroll: true });
  };

  // An empty library is a different screen, not a different count.
  const headingText = libraryIsEmpty ? EMPTY_LIBRARY_HEADING : heading.text;

  return (
    <div
      style={{ height: STOP_TO_CONTENT_HEIGHT[stop] }}
      className="flex min-h-0 flex-col gap-3.5 px-5 pt-3.5"
    >
      {stop === 'peek' ? (
        <div className="flex items-center justify-between gap-3 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]">
          {/* At `peek` the list and the field are both off screen, so this line is the tap target
              that brings them back. It used to be a button only while filtering — the argument
              being that a filtered count needs a way to reach the field that set it, and an
              unfiltered one is just a sentence.

              That stopped holding at `L1-F7-T2`. The list is now the entry point to place detail,
              and therefore the only route to editing a note or removing a place; the map's pins
              are canvas-painted and cannot be tapped by anything but a pointer landing exactly on
              them. Leaving the unfiltered case inert put the whole feature behind a drag gesture
              with no affordance saying it was there. Making it always a button also deletes a
              special case rather than adding one. */}
          <button
            type="button"
            onClick={onExpand}
            aria-label="Show your places"
            className="-mx-1 rounded-lg px-1 text-left text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
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
                {heading.rest}
              </>
            )}
          </button>
          <Button
            type="button"
            className="h-12 gap-1.5 rounded-lg px-4 text-sm font-bold"
            onClick={onAddTikTok}
          >
            <Plus className="size-4" aria-hidden />
            Add a TikTok
          </Button>
        </div>
      ) : (
        <>
          {/* The same string at `half` and at `full`. `Your places` used to sit here at `full`, and
              deleting it is the point: at `full` the map is covered, so this line is the only thing
              on screen explaining why the list is twelve rows and not twenty. Removing the
              explanation exactly when the evidence is hidden is the wrong trade.
              `tabIndex={-1}` makes it a focus target for the escapes below without putting it in
              the tab order. */}
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
            ref={headingRef}
            tabIndex={-1}
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
          {!libraryIsEmpty && (
            <NotBeenFilterChip active={notBeenOnly} onToggle={onToggleNotBeen} />
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
                <ElsewhereSection
                  entries={elsewhere}
                  filtering={filtering}
                  expansion={countryExpansion}
                  expansionDefault="active-and-previous"
                  onToggleCountry={onToggleCountry}
                  onSelectArea={selectArea}
                />
              </div>
              {/* **Outside the scroll container**, and that is the fix rather than the layout.
                  `collections-nav-row.tsx` argues its placement well — no tab bar, no permanent
                  chrome, and a collection is a subset of your places so it belongs under them — and
                  the argument survives; only the position did not. Inside the scroll it sat behind
                  every row and every country group, which at 100 places is some three thousand
                  pixels down, and it is the **only** route to `/collections` in the product. A
                  feature reachable only by exhausting a scroll is a feature nobody finds.

                  Here it costs a permanent 44 px at `half` and `full`, still reads as "under your
                  places", and stops competing with `Elsewhere` for the bottom of the same scroll. */}
              <div className="shrink-0 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
                <CollectionsNavRow />
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

  const body = (
    <>
      {/* The row's own pin, in the category's colour — the same colour the map draws it. Two
          surfaces showing one place used to agree on nothing but its name; now a brown cup on the
          map and a brown row are visibly the same café. */}
      <span
        aria-hidden
        style={{ backgroundColor: `${category.color}1F`, color: category.color }}
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
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
        aria-label={rowAccessibleName(place.name, tags, place.visited)}
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

export function PlaceDetail({
  place,
  onClose,
  variant = 'sheet',
}: {
  place: MapPlace;
  onClose: () => void;
  /** `'sheet'` (default, mobile): an X that fully deselects. `'panel'` (desktop, retired — no
   *  caller renders this anymore now that detail lives entirely in the map popover, kept only so
   *  the variant union documents where it used to apply): the same `onClose` call instead read as
   *  "back to the list" — there was no second panel to close into, so a back chevron was the
   *  honest affordance for what actually happened. `'popover'` (desktop, `lg+`): a compact shell
   *  for `MapSurfaceMapcn`'s pin-anchored `MapPopup` — narrower than `panel`, a plain "×" close
   *  button (there is no list to return to, the left list panel is untouched by selection), and
   *  its own scroll/max-height so a long detail can't blow off the edge of the map. */
  variant?: 'sheet' | 'panel' | 'popover';
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
        isPopover && 'max-h-[min(70vh,26rem)] w-72 gap-4 px-0 pb-0 pt-0'
      )}
    >
      {thumbnailUrl && <SourceMediaThumbnail url={thumbnailUrl} />}

      <div className={cn('flex items-start justify-between gap-3', isPopover && 'px-4 pt-3.5')}>
        <div className="flex min-w-0 flex-col gap-1">
          {renaming ? (
            <NameEditor
              key={`name-${place.id}`}
              savedPlaceId={place.id}
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
              {detail && <RenameTrigger onStart={() => setRenaming(true)} />}
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
        <BeenToggle
          key={`been-${place.id}`}
          savedPlaceId={place.id}
          placeName={place.name}
          visited={place.visited}
        />

        {/* Directly under `BeenToggle` and above `CategoryEditor`: been/not-been and "which list is
            this in" are both statements about the user's *intent* with the place, while category
            and note are corrections to what we got wrong. Grouping the two intent controls keeps
            the correction block intact underneath. Renders nothing outside a `CollectionsContext`
            provider, so the desktop popover and any test host are unaffected. */}
        <AddToCollection key={`collections-${place.id}`} placeId={detail?.placeId} />

        {/* The user's own word for what this place is. Below the prose blocks rather than beside
            the category line above, because that line is the most-read thing on the card and this
            is a control most people touch once — `saved-place-edits.tsx` has the argument. */}
        <CategoryEditor
          key={`category-${place.id}`}
          savedPlaceId={place.id}
          category={place.category}
          isOverridden={detail?.categoryIsOverridden ?? false}
        />

        {/* `L1-F7-T2`. The note used to render read-only, and a place you saved was a place you
            were stuck with. `key` on the saved place's id is what resets a half-typed draft when
            the selection changes — the editor deliberately does not sync from props in an effect,
            which would discard typing every time the server revalidated. */}
        <NoteEditor key={place.id} savedPlaceId={place.id} note={note} />

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
              className="flex items-center gap-1.5 text-sm font-bold text-[var(--mint-700)] underline-offset-4 hover:underline"
            >
              Google Maps
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>

        {/* Where this pin came from, and when you saved it. Both were facts the database held and
            no screen said: the first was a dataset slug at 11px (`Matched via llm-guess`) that
            twenty-one of thirty-one places carried and nobody could read, and the second was in the
            ORDER BY and nowhere else. `location-certainty.ts` has the argument for why the
            confidence percentage that used to sit here is gone. */}
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

        {/* Last, and quiet. The destructive action belongs below everything the user might have
            opened this detail to read, not competing with it. `onClose` is the deselect the
            caller already passes — the map page's own render-time guard would drop the selection
            once the revalidated list arrives, but that would leave the detail open over a place
            that is already gone for the length of the round trip. */}
        <RemoveSavedPlace savedPlaceId={place.id} placeName={place.name} onRemoved={onClose} />
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
