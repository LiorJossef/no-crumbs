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
 * Deliberately not built here (lean pre-L1 slice, see the task brief): real text search filtering
 * (the field renders at `full` but is decorative) and the map-background-tap-collapses-sheet rule
 * at `full` is approximated with a transparent tap-catcher rather than wiring into the map's own
 * gesture surface.
 */

import { Drawer } from 'vaul';
import { useState } from 'react';
import { Plus, MapPin, ExternalLink, X, ChevronLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { MapPlace } from '@/components/map/types';
import type { MediaRef } from '@/domain/types';

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
  readonly places: readonly MapPlace[];
  readonly selected: MapPlace | null;
  readonly onDeselect: () => void;
  /** Opens the import overlay in `map-page-client.tsx` (client state) rather than navigating to
   *  the standalone `/import` route, so the map underneath this sheet stays mounted. */
  readonly onAddTikTok: () => void;
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

export function PlaceSheet({ places, selected, onDeselect, onAddTikTok }: PlaceSheetProps) {
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
                stop={currentStop}
                onExpand={() => setActiveSnap(STOP_TO_SNAP.full)}
                onAddTikTok={onAddTikTok}
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
  stop,
  onExpand,
  onAddTikTok,
}: {
  places: readonly MapPlace[];
  stop: SheetStop;
  onExpand: () => void;
  onAddTikTok: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-5 pt-3.5">
      {stop === 'peek' ? (
        <div className="flex items-center justify-between gap-3 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]">
          <p className="text-sm font-medium text-muted-foreground">
            <span className="font-heading font-extrabold text-foreground">{places.length}</span>{' '}
            places saved
          </p>
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
              {stop === 'full' ? 'Your places' : `${places.length} places saved`}
            </h2>
            {stop === 'half' && (
              <button
                type="button"
                onClick={onExpand}
                className="text-sm font-bold text-[var(--mint-700)] underline-offset-4 hover:underline"
              >
                Search
              </button>
            )}
          </div>

          {stop === 'full' && <PlaceSearchField />}

          <ul data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {places.map((place) => (
              <PlaceRow key={place.id} place={place} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Shared with `PlaceDesktopPanel` so the two presentations of "a saved place, in a list" never
 *  drift into two visual languages. Deliberately not a `<button>`/`onClick` in this slice: the
 *  list has never been an entry point to selection (only the map pin is), and this redesign keeps
 *  that interaction model exactly as it was. */
export function PlaceRow({ place }: { place: MapPlace }) {
  return (
    <li className="flex min-h-16 items-start gap-3 border-b border-border/70 py-3.5 last:border-b-0">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <MapPin className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
        <p className="truncate font-heading text-sm font-bold text-foreground">{place.name}</p>
        <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
          {place.category}
        </p>
        {place.note && (
          <p className="line-clamp-1 text-sm font-medium text-muted-foreground">{place.note}</p>
        )}
      </div>
    </li>
  );
}

/** Visual-only in this slice — real filtering is a stretch goal, not required. Shared markup so
 *  the mobile `full` stop and the desktop list panel present the identical field. */
export function PlaceSearchField({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input placeholder="Search your places" className="h-12 rounded-lg pl-10 text-sm font-medium" />
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
  const authorLabel = source?.authorHandle
    ? `@${source.authorHandle}`
    : source?.authorName ?? null;
  // Name + coordinates, not coordinates alone: a bare lat/lng drops a pin with no label, but
  // Google's search endpoint treats the whole `query` as free text, so leading with the name
  // gives a labelled result while the trailing coordinates still anchor it to the right spot
  // (disambiguating venues that share a name). No API key, no new dependency: `/maps/search/?api=1`
  // is a documented URL, not an API call, and every `MapPlace` always carries `lat`/`lng`.
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.name}, ${place.lat},${place.lng}`,
  )}`;

  const isPopover = variant === 'popover';

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3.5',
        isPopover && 'max-h-[min(70vh,26rem)] w-72 gap-4 px-0 pb-0 pt-0'
      )}
    >
      {source?.media && <SourceMediaThumbnail media={source.media} />}

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

        {note && (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              Your note
            </p>
            <p className="text-sm leading-relaxed text-foreground">{note}</p>
          </div>
        )}

        {/* Two external actions, presented as plain text links — same weight as `reason`/`note`
            above, no border/fill box. The panel (or sheet) is already the container; a bordered
            chip pair inside it was a box nested inside a box. `authorLabel` (if any) is a caption
            above the pair, not squeezed into either action itself. */}
        <div className="flex flex-col gap-2">
          {authorLabel && (
            <p className="text-xs font-medium text-muted-foreground">Saved from {authorLabel}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={source?.canonicalUrl ?? place.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-bold text-[var(--mint-700)] underline-offset-4 hover:underline"
            >
              Open TikTok
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
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
 * comment, ~6 months out) — `onError` swaps to an empty state permanently for this mount (`failed`
 * state, not retried) rather than leaving a broken-image icon on screen.
 */
function SourceMediaThumbnail({ media }: { media: MediaRef }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className="overflow-hidden rounded-[var(--radius)] bg-muted">
      <img
        src={media.url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-40 w-full object-cover"
      />
    </div>
  );
}
