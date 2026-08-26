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
 *  - `peek`: a fixed px height (120px + safe-area-bottom) — count + Add action.
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
import { useState } from 'react';
import { Plus, MapPin, ExternalLink, X, ChevronLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isSearchActive } from '@/domain/places/search';
import { NoteEditor, RemoveSavedPlace } from './saved-place-edits';
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
  /** Already filtered by `query` — this list and the map's pins are the same set, by construction
   *  (`map-page-client.tsx` filters once and hands the result to both). */
  readonly places: readonly MapPlace[];
  /** How many the user has saved in total, so a filtered list can say `3 of 20` rather than
   *  claiming they have three places. */
  readonly totalCount: number;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
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
  totalCount,
  query,
  onQueryChange,
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
                totalCount={totalCount}
                query={query}
                onQueryChange={onQueryChange}
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
  totalCount,
  query,
  onQueryChange,
  stop,
  onExpand,
  onAddTikTok,
  onSelect,
}: {
  places: readonly MapPlace[];
  totalCount: number;
  query: string;
  onQueryChange: (query: string) => void;
  stop: SheetStop;
  onExpand: () => void;
  onAddTikTok: () => void;
  onSelect?: (place: MapPlace) => void;
}) {
  const filtering = isSearchActive(query);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-5 pt-3.5">
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
            {filtering ? (
              <>
                <span className="font-heading font-extrabold text-foreground">{places.length}</span>{' '}
                of {totalCount} places
              </>
            ) : (
              <>
                <span className="font-heading font-extrabold text-foreground">{totalCount}</span>{' '}
                places saved
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-xl font-extrabold tracking-tight text-foreground">
              {stop === 'full' ? 'Your places' : `${totalCount} places saved`}
            </h2>
            {filtering && (
              <p className="shrink-0 text-sm font-medium text-muted-foreground">
                {places.length} of {totalCount}
              </p>
            )}
          </div>

          <PlaceSearchField value={query} onChange={onQueryChange} />

          {places.length === 0 ? (
            filtering ? (
              <NoSearchMatches query={query} onClear={() => onQueryChange('')} />
            ) : (
              <NoPlacesYet />
            )
          ) : (
            <ul
              data-vaul-no-drag
              className="min-h-0 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            >
              {places.map((place) => (
                <PlaceRow key={place.id} place={place} {...(onSelect ? { onSelect } : {})} />
              ))}
            </ul>
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
}: {
  place: MapPlace;
  onSelect?: (place: MapPlace) => void;
}) {
  const locality = place.detail?.locality;

  const body = (
    <>
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <MapPin className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5 text-left">
        <p className="truncate font-heading text-sm font-bold text-foreground">{place.name}</p>
        {/* The city sits next to the category rather than being left off: it is the second thing
            you know about a saved place ("the London one"), and it is searchable — showing it keeps
            the rule that every match is explainable from the row you can see. */}
        <p className="truncate text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
          {place.category}
          {locality && <span className="text-muted-foreground/70"> · {locality}</span>}
        </p>
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
        aria-label={`Open ${place.name}`}
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
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
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
        aria-label="Search your places"
        placeholder="Search your places"
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

/**
 * `ux-architecture.md` §9.3, verbatim: name the query back to the user (so a typo is obvious
 * without looking up at the field) and give them the one-tap way out. Shared by both surfaces.
 */
export function NoSearchMatches({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-start gap-3 py-6">
      <p className="text-sm font-medium text-muted-foreground">
        Nothing matches <span className="font-bold text-foreground">“{query.trim()}”</span>.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onClear}
        className="h-10 rounded-lg px-4 text-sm font-bold"
      >
        Clear search
      </Button>
    </div>
  );
}

/** A library with nothing in it. `L1-F8-T1` owns the real first-run experience (§9.2's coach line);
 *  this is only here so a brand-new account sees a sentence rather than a blank panel. */
export function NoPlacesYet() {
  return (
    <p className="py-6 text-sm font-medium text-muted-foreground">
      Nothing saved yet. Add a TikTok and the places it names land here.
    </p>
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
  const queryParts = addressLine
    ? [place.name, addressLine, locality].filter((part): part is string => Boolean(part))
    : [place.name, `${place.lat},${place.lng}`];
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    queryParts.join(', '),
  )}`;

  const isPopover = variant === 'popover';

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
          <h2
            className={cn(
              'font-heading text-2xl font-extrabold tracking-tight text-foreground',
              isPopover && 'text-lg'
            )}
          >
            {place.name}
          </h2>
          <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            {place.category}
          </p>
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
        {reason && (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              From the post
            </p>
            <p className="text-sm leading-relaxed text-foreground">{reason}</p>
          </div>
        )}

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
          {authorLabel && (
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

        {provenance && (
          <p className="text-[11px] font-medium text-muted-foreground/70">
            Matched via {provenance.sourceDataset}
            {typeof provenance.resolutionScore === 'number' &&
              ` · ${Math.round(provenance.resolutionScore * 100)}% confidence`}
          </p>
        )}

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
