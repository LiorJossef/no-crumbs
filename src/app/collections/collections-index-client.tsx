'use client';

/**
 * The collections index — **the sheet's list, not a page.**
 *
 * It used to be a standalone document: a `flex min-h-dvh flex-col` wrapper, its own `<header>`, an
 * `<h1>Collections</h1>`, a `max-w-[560px]` column and a `lg`-only back arrow to the map, with no
 * map anywhere on it. `ux-collections-as-scope.md` §5 items 1, 2 and 4 delete all of that: this is
 * S4 with collections in it, rendered through the same shell `/map` and `/collections/[id]` render,
 * so dragging the sheet down leaves you looking at your own places rather than at nothing.
 *
 * The sheet rests at `full`, which means the initial fit happens entirely behind it. That is on
 * purpose — the framing is correct the moment the sheet is dragged down, and the alternative is
 * opening a list surface half-covered by a map nobody asked to look at yet.
 *
 * Rows with hairline dividers rather than a card each — a bordered box per collection is card soup
 * at four collections, and `docs/ux-collections.md` §1.1 rules it out for that reason. The create
 * control is a full-width row in the list rather than a button under it, and it opens a one-field
 * composer in place rather than navigating or opening a dialog: a dialog for a single text input
 * costs a focus trap, an escape handler and a backdrop in exchange for nothing.
 */

import { isolate } from '@/ui/place/active-area';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ChevronUp, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PRESS_CHIP, PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { CollectionCover } from '@/components/collections/collection-cover';
import { KICKER } from '@/components/collections/collection-content';
import { boundsOfPoints } from '@/components/map/bounds';
import type { MapPlace } from '@/components/map/types';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav';
import { MapShell } from '@/components/shell/map-shell';
import { STOP_TO_CONTENT_HEIGHT, type SheetStop } from '@/components/shell/sheet-geometry';
import { useMapShell } from '@/components/shell/use-map-shell';
import { memberLabel } from '@/domain/collections/collection';
import { useCreateCollection } from '@/components/collections/use-create-collection';
import type { CollectionSummary } from './_lib/get-collections';

export function CollectionsIndexClient({
  collections,
  libraryIsEmpty,
  places,
}: {
  collections: readonly CollectionSummary[];
  libraryIsEmpty: boolean;
  /** The caller's saved places. The pins on the map behind this list, and the array the bar's `＋`
   *  menu searches — that menu's search is a filter over exactly this array. */
  places: readonly MapPlace[];
}) {
  const shell = useMapShell({ restingStop: 'full' });
  const initialBounds = useMemo(() => boundsOfPoints(places), [places]);

  const list = (stop?: SheetStop) => (
    <CollectionsList
      collections={collections}
      libraryIsEmpty={libraryIsEmpty}
      {...(stop ? { stop } : {})}
      onExpand={() => shell.sheet.goTo('full')}
      idPrefix={stop ? 'sheet' : 'panel'}
    />
  );

  return (
    <MapShell
      shell={shell}
      places={places}
      {...(initialBounds ? { initialBounds } : {})}
      restingStop="full"
      /* Nothing floats over this map's top edge, and §3 of the ruling forbids it ever doing so —
         the account chip is `/map`'s and is `hidden lg:flex`, so neither collections route has ever
         had top chrome. Charging the camera `/map`'s 100 px allowance for chrome that is not there
         is what `L2-COLL-CAM-2` measured on the sibling route. */
      floatingTopChromePx={0}
      /* No map-drawn detail: these pins are the user's library shown as context behind a list of
         collections, and tapping one here would open a place detail this surface has no room for.
         The map is reachable in one drag, and the place is one tap from there. */
      selectedPlace={null}
      accessibleName="Your places"
      createMenuPlaces={places}
      sheetContent={(stop) => list(stop)}
      panelContent={
        <div className="flex min-h-0 flex-1 flex-col pt-4">
          {/* The one exit to the map that exists at `lg+`, and it is not the arrow §5 item 2
              deleted. Below `lg` the map is one drag down and `BottomNav`'s Map tab goes there,
              which is why the ruling removed the arrow — but the bar does not render at `lg+` and
              the panel is opaque over the map's left edge, so without this the desktop index is a
              dead end. Shaped as the `[id]` route's up-link rather than as a second back arrow, so
              the two collections routes carry the same control in the same place. */}
          <Link
            href="/map"
            className={cn(
              KICKER,
              'mx-4 -ms-2 inline-flex min-h-11 w-fit shrink-0 items-center gap-1 rounded-full px-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              PRESS_CHIP,
            )}
          >
            <ChevronLeft className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />
            Map
          </Link>
          {list()}
        </div>
      }
    />
  );
}

function CollectionsList({
  collections,
  libraryIsEmpty,
  stop,
  onExpand,
  idPrefix,
}: {
  collections: readonly CollectionSummary[];
  libraryIsEmpty: boolean;
  /** Which stop the shell's sheet is at, when this renders *in* the sheet. Absent in the `lg+`
   *  panel, which has no stops. It caps the content column: `Drawer.Content` is `h-full` and vaul
   *  translates it, so an uncapped column's lower half is laid out below the bottom of the screen
   *  and unreachable by scrolling. */
  stop?: SheetStop;
  onExpand: () => void;
  /** The two instances of this list — one in the sheet, one in the `lg+` panel — are both in the
   *  document at once, and only one is displayed. The composer's field needs a unique id in each. */
  idPrefix: string;
}) {
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  // One caller of `createCollection` for the whole product — the same hook the `＋` menu's
  // `Create a collection` pane uses, so the two entry points cannot drift on trimming, on keeping
  // the name after a failure, or on navigating into what was just made.
  const { pending, error, create, clearError } = useCreateCollection();

  const mine = collections.filter((collection) => collection.role === 'owner');
  const shared = collections.filter((collection) => collection.role !== 'owner');
  const fieldId = `${idPrefix}-new-collection-name`;

  function submit() {
    // Focus returns to the field only on failure — on success the route changes and there is
    // nothing here to focus. `create` resolving `false` is that signal.
    void create(name).then((created) => {
      if (!created) fieldRef.current?.focus();
    });
  }

  if (stop === 'peek') {
    /* One line, the same shape the saved list's peek row has: what the list below is, and that it
       can be pulled up. Everything else in the band belongs to `BottomNav`, which floats over it. */
    return (
      <div
        style={{ height: STOP_TO_CONTENT_HEIGHT.peek }}
        className="flex min-h-0 flex-col px-5 pt-3.5"
      >
        <div className="flex items-center" style={{ paddingBottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}>
          <button
            type="button"
            onClick={onExpand}
            aria-label="Show your collections"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 text-left text-sm font-medium text-muted-foreground',
              PRESS_ROW,
            )}
          >
            <span className="min-w-0 truncate">
              {collections.length === 0 ? (
                'Nothing collected yet'
              ) : (
                <>
                  {/* The number carries the emphasis and the rest of the line stays quiet, exactly
                      as the saved list's peek row does it. */}
                  <span className="font-heading font-extrabold text-foreground">
                    {collections.length}
                  </span>{' '}
                  {collections.length === 1 ? 'collection' : 'collections'}
                </>
              )}
            </span>
            <ChevronUp className="size-4 shrink-0 opacity-60" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...(stop ? { style: { height: STOP_TO_CONTENT_HEIGHT[stop] } } : {})}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        data-vaul-no-drag
        className="min-h-0 flex-1 overflow-y-auto px-4"
        // Exactly the bar's height, so the last row clears it instead of ending underneath it —
        // the same price every list inside this shell pays for `BottomNav` floating over it. The
        // panel at `lg+` renders no bar, so it pays nothing.
        style={{
          scrollPaddingBottom: stop === undefined ? 0 : BOTTOM_NAV_HEIGHT_PX,
          paddingBottom: stop === undefined ? 0 : BOTTOM_NAV_HEIGHT_PX,
        }}
      >
        {collections.length === 0 ? (
          <EmptyIndex libraryIsEmpty={libraryIsEmpty} />
        ) : (
          <>
            {mine.length > 0 ? <Section title="Yours" collections={mine} /> : null}
            {shared.length > 0 ? <Section title="Shared with you" collections={shared} /> : null}
          </>
        )}

        {composing ? (
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor={fieldId} className="text-sm font-medium">
              Name this collection
            </label>
            <Input
              id={fieldId}
              ref={fieldRef}
              autoFocus
              dir="auto"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Tel Aviv food"
              enterKeyHint="done"
              autoCapitalize="sentences"
              maxLength={80}
              aria-invalid={error !== null}
              aria-describedby={error ? `${fieldId}-error` : undefined}
              className="h-12 text-base"
            />
            {error ? (
              <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="submit"
                size="lg"
                className="h-12 flex-1 text-base"
                disabled={pending || name.trim().length === 0}
              >
                {pending ? 'Creating…' : 'Create'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-12 px-4 text-muted-foreground"
                onClick={() => {
                  setComposing(false);
                  clearError();
                  setName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          /* A row in the list rather than a button under it. It reads as "and one more, which you
             make yourself" — the same shape as the collections above it, so it is found by the eye
             already scanning them rather than by a separate sweep to the bottom of the screen.

             The bar's ＋ is not this control and must never become it: a button in persistent
             chrome has to mean one thing on every screen it appears on. */
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-vaul-no-drag
            className={cn(
              // No un-prefixed `transition-colors` beside a `motion-safe:` press: `PRESS_BEAT`'s
              // `motion-safe:transition` carries colour *and* transform for everyone else, so an
              // un-prefixed one here would be reachable only by the users who asked for less
              // motion — a hover fade that exists for exactly the audience that did not want it.
              'mt-2 flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-border px-3 text-left text-sm font-medium text-muted-foreground hover:border-border/70 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              PRESS_ROW,
            )}
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
            >
              <Plus className="size-4" />
            </span>
            New collection
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyIndex({ libraryIsEmpty }: { libraryIsEmpty: boolean }) {
  // Two lines of copy and nothing else. The `Go to your map` button that used to sit here is gone
  // (§5 item 4): the Map tab is on screen, and the map itself is now one drag behind this list.
  return (
    <div className="py-10 text-center">
      <p className="font-heading text-base font-bold">Nothing collected yet.</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
        {libraryIsEmpty
          ? 'Save some places first, then group them here.'
          : 'A collection is a set of places you can share with one other person.'}
      </p>
    </div>
  );
}

function Section({
  title,
  collections,
}: {
  title: string;
  collections: readonly CollectionSummary[];
}) {
  return (
    <section className="mb-6">
      <h2 className="px-1 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul>
        {collections.map((collection) => (
          <li key={collection.id} className="border-b border-border/70 last:border-b-0">
            <Link
              href={`/collections/${collection.id}` as `/collections/${string}`}
              // The accessible name carries every fact the colour strip cannot (§8.4).
              aria-label={rowAccessibleName(collection)}
              data-vaul-no-drag
              className={cn(
                // Same reasoning as the composer row above: the bare `transition-colors` goes
                // rather than gaining a prefix, because `PRESS_BEAT` supersedes it.
                'flex min-h-19 items-center gap-3 rounded-lg px-1 py-3.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                PRESS_ROW,
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {/* Two bidi rules, and they are separable. `<bdi>` isolates the name's own
                    direction *without* flipping the row: `dir="auto"` on the paragraph would make
                    an all-Hebrew name right-align while the count line beside it stayed left, so a
                    mixed list would have a ragged left edge. And `line-clamp-2` rather than
                    `truncate`, because an ellipsis on an RTL string inside an LTR box clips the
                    *beginning* — the identifying half. */}
                <p className="line-clamp-2 font-heading text-base font-bold">
                  <bdi>{collection.name}</bdi>
                </p>
                {/* Never one interpolated string: a count and an RTL name on one line reorder. */}
                <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <span>{placeCountLabel(collection.placeCount)}</span>
                  {secondFact(collection) ? (
                    <>
                      <span aria-hidden>·</span>
                      <bdi>{secondFact(collection)}</bdi>
                    </>
                  ) : null}
                </p>
                {/* The collection's own description. It has been selected, mapped and carried on
                    `CollectionSummary` since collections shipped and drawn nowhere
                    (`growth-plan.md` §4) — a row of one line, which is what a description is worth
                    against a name and a count. `line-clamp-1`, not `truncate`, for the same reason
                    the name above uses `line-clamp-2`: an ellipsis on an RTL string inside an LTR
                    box clips the beginning.

                    `<bdi>` rather than `dir="auto"`, matching the name: `dir="auto"` would
                    right-align an all-Hebrew description while the count line beside it stayed
                    left, and a mixed list would have a ragged edge. */}
                {collection.description ? (
                  <p className="line-clamp-1 text-caption text-muted-foreground">
                    <bdi>{collection.description}</bdi>
                  </p>
                ) : null}
                <CollectionCover categories={collection.categories} className="mt-0.5" />
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The second half of the count line. On your own collection it is how many people are in it (and
 *  nothing at all when it is only you); on a shared one it is who it came from. */
function secondFact(collection: CollectionSummary): string | null {
  if (collection.role !== 'owner') {
    // "From Maya", never "Maya's collection": a possessive apostrophe on a Hebrew name renders on
    // the wrong side and reads as a typo.
    return `From ${memberLabel({ displayName: collection.ownerName, isYou: false })}`;
  }
  if (collection.memberCount > 1) return `${collection.memberCount} people`;
  return null;
}

function placeCountLabel(count: number): string {
  if (count === 0) return 'No places yet';
  return `${count} place${count === 1 ? '' : 's'}`;
}

function rowAccessibleName(collection: CollectionSummary): string {
  // The name is isolated: it is user-typed and everything after it is a count, which a Hebrew
  // name otherwise drags into its own run — `⁨שבת בתל אביב⁩, 3 places` vs `3 ,שבת בתל אביב places`.
  const parts = [isolate(collection.name), placeCountLabel(collection.placeCount).toLowerCase()];
  const second = secondFact(collection);
  if (second) parts.push(second);
  if (collection.role === 'viewer') parts.push('view only');
  // The description joins the label because the label *replaces* the row's visible text: an
  // `aria-label` on a link overrides everything inside it, so a description rendered above and
  // left out here would be text a sighted user reads and a screen-reader user never hears.
  // Isolated for the same reason the name is — it is user-typed and a count follows nothing here,
  // but it can carry its own direction next to the English facts before it.
  if (collection.description) parts.push(isolate(collection.description));
  return parts.join(', ');
}
