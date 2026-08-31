'use client';

/**
 * The collections index — **a view of the drawer, not a page and no longer a route of its own.**
 *
 * It has been demoted twice. First from a standalone document (its own `<header>`, an
 * `<h1>Collections</h1>`, a `max-w-[560px]` column and no map anywhere) to the sheet's list, by
 * `ux-collections-as-scope.md` §5 items 1, 2 and 4. Now from *the* thing `/collections` renders to
 * one of two things `CollectionsDrawerClient` can put in the sheet — see `_lib/drawer-view.ts` for
 * why the index and a collection are one route segment with a search param between them.
 *
 * Rows with hairline dividers rather than a card each — a bordered box per collection is card soup
 * at four collections, and `docs/ux-collections.md` §1.1 rules it out for that reason. The create
 * control is a full-width row in the list rather than a button under it, and it opens a one-field
 * composer in place rather than navigating or opening a dialog: a dialog for a single text input
 * costs a focus trap, an escape handler and a backdrop in exchange for nothing.
 */

import { isolate } from '@/ui/place/active-area';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronUp, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { CollectionCover } from '@/components/collections/collection-cover';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav';
import { STOP_TO_CONTENT_HEIGHT, type SheetStop } from '@/components/shell/sheet-geometry';
import { memberLabel } from '@/domain/collections/collection';
import { useCreateCollection } from '@/components/collections/use-create-collection';
import { collectionHref } from './_lib/drawer-view';
import type { CollectionSummary } from '@/app/collections/_lib/get-collections';

export function CollectionsIndexList({
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
    // Focus returns to the field only on failure — on success the drawer changes view and there is
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

  /*
   * **The page's title, restored rather than reinvented.** `ui-review-2026-08-31.md` finding 14:
   * this view rendered `<h2>Yours</h2>` — a section heading — with nothing above it, on every
   * library size and both viewports. That is the first demotion's other cost: `<h1>Collections</h1>`
   * did not survive the move from a standalone document into the drawer (see this file's own
   * header), and nothing replaced it. `EmptyIndex` has the same gap — no heading at all, in any
   * state, is worse than the section case the review measured.
   *
   * `PlaceDesktopPanel`/`PlaceSheet` are the parity to match, not a new decision: that pair already
   * carries the identical view's title as `<h1>` in the `lg+` panel (`stop === undefined`) and
   * `<h2>` in the sheet, at `text-2xl` against `text-xl` — the size step is the only difference, and
   * a screen reader user gets the correct document outline at either breakpoint from source alone,
   * with no media query. Two instances render at once here too (this file's own note above), so the
   * same split is what keeps the sheet's `<h2>` from creating a second `<h1>` next to the panel's.
   */
  const IndexHeading = stop === undefined ? 'h1' : 'h2';

  return (
    <div
      {...(stop ? { style: { height: STOP_TO_CONTENT_HEIGHT[stop] } } : {})}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="shrink-0 px-4 pb-1 pt-3.5">
        <IndexHeading
          className={cn(
            'font-heading font-extrabold tracking-tight text-foreground',
            stop === undefined ? 'text-2xl' : 'text-xl',
          )}
        >
          Collections
        </IndexHeading>
      </div>
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
  // (§5 item 4): the map is behind this list rather than a screen away, and the `New collection`
  // row directly below is the action this state is missing.
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
      <h2 className="px-1 pb-1 pt-4 text-micro font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul>
        {collections.map((collection) => (
          <li key={collection.id} className="border-b border-border/70 last:border-b-0">
            <Link
              /* **A search param, not a segment** — `_lib/drawer-view.ts` has the measurement.
                 `/collections?collection=<id>` is the same route file this row is rendered by, so
                 the router re-renders the page in place and the drawer, the vaul root inside it
                 and the live MapLibre instance behind it are all untouched. The old
                 `/collections/<id>` was a sibling segment, and every tap on this row destroyed the
                 sheet and let a new one animate up from the bottom of the screen.

                 The cast is the one `bottom-nav.tsx` already makes for `/map?place=`: `typedRoutes`
                 types the route literal and has nothing to say about a query string on it. */
              href={collectionHref(collection.id) as '/map'}
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
                <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
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
