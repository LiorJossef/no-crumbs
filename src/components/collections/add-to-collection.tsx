'use client';

/**
 * "Add to a collection", from a place you have saved.
 *
 * Two states in one component: a row that reports which collections this place is in, and — when
 * opened — the picker, in an `InlinePanel` **directly under that row**. It is not a dialog stacked
 * over the sheet, for the reason `shell/non-modal-drawer.tsx` records: a second overlay over the
 * vaul drawer is how `<main>` gets marked `aria-hidden` and the map page disappears from the
 * accessibility tree.
 *
 * ## It stopped replacing the detail pane on 2026-09-03
 *
 * Until then, pressing this row swapped the whole card for a picker with its own `ArrowLeft`, its
 * own `Add to…` heading and its own row vocabulary — bordered-bottom rows with a 20 px tick disc.
 * That was the card's third answer to "what does editing look like here": the category row
 * committed with a mint word, the note with a button pair, and this one did not commit at all
 * because it left the card. It is now the same panel and the same `MENU_ROW` material as the other
 * two rows, the library's filter bar and the share panel's role control.
 *
 * Deleting the navigation deletes the collision the back control existed to solve: nothing
 * navigates, so there is never a second back-shaped control on screen.
 *
 * Toggling writes immediately and optimistically. There is no Save button — this is multi-select,
 * so the panel stays open on a toggle and closes on Escape or a press outside it.
 *
 * ## No write here `await`s an action directly
 *
 * Until 2026-09-01 all four did, bare, inside `startTransition`. A Server Action is a `fetch`, so
 * an offline toggle produced a rejection rather than a result, React escalated it to
 * `app/error.tsx`, and the segment went with it — the map, the pins, and this picker with the place
 * it was opened from (`ui/place/write-failure.ts` holds the rule and the measurement). Both writes
 * on this surface now go through a helper that cannot throw: `attemptWrite` for the toggles,
 * `attemptCreateCollection` for the compose row, which is the same rule with the new collection's
 * id on the success arm.
 *
 * The optimism is not the defect and is not being removed. `useOptimistic` drops back to `serverIn`
 * when the transition ends, so a toggle that was refused *or* never sent un-ticks itself with no
 * code to write — which is the correct end state on both, because in neither case was a row
 * written. What was missing was only the `catch`.
 */

import {
  createContext,
  useCallback,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlinePanel, MENU_ROW, MENU_ROW_PAINT } from '@/components/ui/inline-menu';
import { useDetailPanelOpen } from '@/ui/place/detail-panel-open';
import { addToCollectionLabel, useCollections } from '@/ui/place/collections-context';
import { addPlacesToCollection, removePlaceFromCollection } from '@/app/actions/collections';
import { attemptCreateCollection } from '@/components/collections/use-create-collection';
import { attemptWrite } from '@/ui/place/write-failure';
import {
  DETAIL_FIELD_ROW,
  DETAIL_FIELD_VALUE,
  DisclosureChevron,
} from '@/components/sheet/saved-place-edits';
import { PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';

/** One pane's back control, drawn by whoever hosts the pane. */
export interface HostedPaneBackControl {
  readonly label: string;
  readonly onBack: () => void;
}

/**
 * A host that already draws a back-shaped control in its own header, and will draw this pane's
 * instead of letting it draw a second one.
 *
 * `/collections/[id]` is the case: the place detail there is hosted under a `Back to the
 * collection` arrow, so a picker with its own arrow puts two of them on screen at once — which
 * `docs/ux-collections-as-scope.md` §2.2 forbids outright. `/map` provides nothing, its host
 * affordance is an `×`, and the picker keeps its own arrow there.
 */
export const HostedPaneBackContext = createContext<{
  readonly setBack: (back: HostedPaneBackControl | null) => void;
} | null>(null);

export function AddToCollection({ placeId }: { placeId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const collections = useCollections();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const raiseSheet = useDetailPanelOpen();

  const close = useCallback(() => {
    setOpen(false);
    // Focus goes back to what opened it; a dismissal that drops focus at the top of the document
    // strands a keyboard user mid-task.
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, []);

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    // The sheet goes to `full` before the panel takes room in the column. `undefined` on every
    // host that provides no channel — the desktop popover, the panel, and `/collections/[id]` —
    // where this is exactly today's behaviour.
    raiseSheet?.();
    setOpen(true);
  }

  function dismissOnEscape(event: KeyboardEvent<HTMLButtonElement>) {
    // Opening by pointer leaves focus on the trigger, so a handler only on the panel never fires —
    // the defect `library-filter-bar.tsx` measured on its own inline triggers.
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    setOpen(false);
  }

  // No provider, or a place we cannot identify (a row not built from a real saved place): show
  // nothing rather than a control that cannot work.
  if (!collections || placeId === undefined) return null;

  const inIds = collections.byPlaceId[placeId] ?? [];
  const names = collections.collections
    .filter((collection) => inIds.includes(collection.id))
    .map((collection) => collection.name);
  const { text, name } = addToCollectionLabel(names);

  return (
    <div className="flex flex-col">
      {/* The same field row as `Category` and `Your note`, and now the same *opening* as both:
          the row stays where it is, the chevron rotates, and the picker appears in a panel
          underneath. The leading folder glyph went with the boxed row — a decoration on one of
          three otherwise identical rows is what made them read as three different kinds of
          thing. */}
      <button
        ref={triggerRef}
        type="button"
        data-vaul-no-drag
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggleOpen}
        onKeyDown={dismissOnEscape}
        className={cn(DETAIL_FIELD_ROW, PRESS_ROW)}
      >
        {/* **The `Collections` label is deleted, not moved** (spec §A2, 2026-09-03). `In tel aviv
            food` already names what it is; the label above it was an 11 px line spent restating the
            preposition underneath. What is left is one line, which is what stops three of these rows
            reading as a form. */}
        <span
          className={cn(
            DETAIL_FIELD_VALUE,
            'flex min-w-0 flex-1 items-baseline gap-1',
            names.length > 0 ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span className="shrink-0">{text}</span>
          {name ? <bdi className="min-w-0 truncate">{name}</bdi> : null}
        </span>
        <DisclosureChevron open={open} />
      </button>

      {open && (
        <InlinePanel
          id={panelId}
          // No kicker: an action list has no axis, and the row above the panel is already naming
          // the thing. This is what the `Add to…` heading used to do, and the heading was a second
          // title on a surface that already had one.
          axisClear={null}
          triggerRef={triggerRef}
          onEscape={close}
          onOutsidePress={() => setOpen(false)}
        >
          <CollectionPicker placeId={placeId} />
        </InlinePanel>
      )}
    </div>
  );
}

/** Exported for the test that holds this surface's markup rules: the panel opens on a press, and
 *  there is no DOM in that suite to press with. */
export function CollectionPicker({ placeId }: { placeId: string }) {
  const router = useRouter();
  const collections = useCollections();
  const serverIn = useMemo(
    () => collections?.byPlaceId[placeId] ?? [],
    [collections, placeId],
  );

  const [optimisticIn, toggleOptimistic] = useOptimistic(
    serverIn,
    (current: readonly string[], collectionId: string) =>
      current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [...current, collectionId],
  );

  /** Which row's write failed, and what to say under it. A message rather than a bare id since
   *  2026-09-01: *the server said no* and *the server never answered* are different news, and one
   *  hard-coded line for both was how the second one went unnoticed. */
  const [failed, setFailed] = useState<{ collectionId: string; message: string } | null>(null);
  const [composing, setComposing] = useState(false);
  /** The compose row's own failure. Rendered whether the form is open or closed, because the one
   *  case that closes it — a collection created whose place did not go in — still has something to
   *  report. */
  const [composeError, setComposeError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [, startTransition] = useTransition();

  function toggle(collectionId: string) {
    const wasIn = optimisticIn.includes(collectionId);
    startTransition(async () => {
      toggleOptimistic(collectionId);
      setFailed(null);
      // One `attemptWrite` around the choice rather than one around each arm: both branches are the
      // same gesture with the same two failure modes, and the ternary inside the callback keeps
      // that visible.
      const outcome = await attemptWrite(() =>
        wasIn
          ? removePlaceFromCollection(collectionId, placeId)
          : addPlacesToCollection(collectionId, [placeId]),
      );
      if (outcome.kind !== 'ok') {
        // Nothing to undo by hand on either arm — the optimistic tick reverts with the transition
        // (see the header) — so the two failures differ only in what they say. `refused` carries
        // the server's own words, which are more specific than anything written here: *You can't
        // change this collection*, *That collection is no longer there*.
        setFailed({ collectionId, message: outcome.message });
        return;
      }
      router.refresh();
    });
  }

  return (
    // The panel's own list: no `<ul>` chrome, no bordered-bottom rows and no 20 px tick disc. The
    // tick lives in the indicator column every menu row in this product already has, so the
    // collection names sit at the same inline offset as the category choices one row below.
    <div className="flex flex-col">
      {collections && collections.collections.length > 0
        ? collections.collections.map((collection) => {
            const isIn = optimisticIn.includes(collection.id);
            return (
              <div key={collection.id} className="flex flex-col">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isIn}
                  onClick={() => toggle(collection.id)}
                  data-vaul-no-drag
                  className={cn(MENU_ROW, PRESS_ROW, 'w-full')}
                >
                  <span className={cn(MENU_ROW_PAINT, 'text-sm')}>
                    {/* `invisible`, not absent: the column is in every row, so one unticked
                        collection does not shift its neighbours' names. */}
                    <Check
                      aria-hidden
                      className={cn('size-3.5 shrink-0 text-brand', !isIn && 'invisible')}
                    />
                    <span dir="auto" className="min-w-0 flex-1 truncate text-start">
                      {collection.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {collection.placeCount}
                    </span>
                  </span>
                </button>
                {failed?.collectionId === collection.id ? (
                  <p role="alert" className="px-2 pb-1.5 text-xs text-destructive">
                    {failed.message}
                  </p>
                ) : null}
              </div>
            );
          })
        : null}

      {composing ? (
        <form
          className="flex flex-col gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setComposeError(null);
              const created = await attemptCreateCollection(name);
              if (created.kind !== 'ok') {
                // Both failures keep the form, the name and the focus. This was worse than the
                // toggles before today: a refusal was discarded silently (`if (!created.ok)
                // return`), so a name the server would not take looked like a button that did
                // nothing at all.
                setComposeError(created.message);
                return;
              }
              // **The collection exists from here on, whatever the second write does.** So the form
              // closes and the field clears on the *create*, not on the pair: leaving the name in
              // an open form after a failed add invites a second collection with the same name,
              // which is a worse outcome than the place not being in the first one. The retry for
              // the add is the new collection's own row in the list above.
              setName('');
              setComposing(false);
              const added = await attemptWrite(() =>
                addPlacesToCollection(created.id, [placeId]),
              );
              if (added.kind !== 'ok') {
                setComposeError(added.message);
                return;
              }
              router.refresh();
            });
          }}
        >
          <Input
            autoFocus
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Tel Aviv food"
            maxLength={80}
            className="h-11 text-base"
            data-vaul-no-drag
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="lg"
              className="h-11 flex-1"
              disabled={name.trim().length === 0}
              data-vaul-no-drag
            >
              Create and add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11"
              onClick={() => setComposing(false)}
              data-vaul-no-drag
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        // **Last, not first.** It is the least-used row of the list and it makes something rather
        // than choosing something; above the collections it was the first thing a returning user
        // had to read past every time.
        <button
          type="button"
          onClick={() => setComposing(true)}
          data-vaul-no-drag
          className={cn(MENU_ROW, PRESS_ROW, 'w-full')}
        >
          <span className={cn(MENU_ROW_PAINT, 'text-sm')}>
            <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            New collection
          </span>
        </button>
      )}

      {/* One slot for both states of the compose row. Open, it sits under the buttons where the
          name being kept is visible; closed, it is what reports a collection that was made without
          the place going into it. */}
      {composeError ? (
        <p role="alert" className="px-2 py-1.5 text-xs text-destructive">
          {composeError}
        </p>
      ) : null}

      {collections && collections.collections.length === 0 ? (
        <p className="px-2 py-2 text-sm text-muted-foreground">
          You don&apos;t have any collections yet.
        </p>
      ) : null}
    </div>
  );
}
