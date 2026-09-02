'use client';

/**
 * **Multi-select and bulk delete in the library** — `deleteSavedPlaces`' render half.
 *
 * The action shipped written, tested and with **zero callers** (round 3 §8.2, and the census in
 * `tests/unit/orphans-have-consumers.test.ts` is about exactly this failure mode). Everything the
 * user can reach of it is here, and it is one module rather than two because the sheet and the
 * desktop panel are two presentations of one library: a selection that behaved differently at
 * 1440 than at 390 would be a second product.
 *
 * ## The one hard constraint
 *
 * `docs/ux-two-removals-one-screen.md`: the library's bulk removal is the **irreversible delete**
 * and the collection's is the **reversible unlink**, and one control may never be both. Every
 * divergence from `components/collections/collection-content.tsx`'s selection mode is deliberate
 * and is tabulated in `bulk-delete.ts`'s header. The structural ones live here:
 *
 *  - **The action band is at the top of the list, not in a pinned footer.** The collection's bulk
 *    unlink is a full-width `h-12` button at the bottom of the sheet; this is a compact control in
 *    the band the search field vacated. Two bulk removals that look alike is the confusability
 *    §2.3 exists to remove, and *where the button is* is the first thing a thumb learns.
 *  - **Cancel comes first and is autofocused.** §2.4 requires the irreversible confirm to be the
 *    deeper of the two: it names the count, enumerates what is lost, says it cannot be undone, and
 *    focus lands on Cancel. `InlineConfirm` — the collection's — puts the destructive button first
 *    and autofocuses nothing, which is correct for an unlink and wrong here. That is why this does
 *    not reuse it.
 *
 * ## It must not fight the sheet or the row
 *
 * Every pressable in this file carries `data-vaul-no-drag`: inside the mobile sheet a press that
 * begins on a control is otherwise read as the start of a sheet drag and the tap is swallowed.
 * Tap-to-open is not fought either — it is *replaced*: while selecting, the list renders
 * `SelectablePlaceRow` instead of `PlaceRow`, so there is no row that is both "open me" and
 * "pick me", and no long-press gesture to discover.
 *
 * ## Partial success is reported, not smoothed
 *
 * `saved_places_delete_own` (`0006`) is evaluated per row, so `.in('id', ids)` matches zero rows
 * for anything the caller does not own and the action answers `{ deleted, requested }` with
 * `deleted < requested` and no error. `bulkDeleteOutcomeMessage` is what that becomes on screen.
 */

import { useMemo, useState, useTransition } from 'react';
import { Check, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';
import { categoryLocalityLine } from '@/ui/place/category-display';
import { attemptWrite } from '@/ui/place/write-failure';
import { deleteSavedPlaces, type BulkDeleteResult } from '@/app/actions/saved-places';
import type { MapPlace } from '@/components/map/types';
import {
  BULK_DELETE_CONFIRM_LABEL,
  BULK_DELETE_LABEL,
  BULK_DELETE_PENDING_LABEL,
  bulkDeleteBody,
  bulkDeleteOutcomeMessage,
  bulkDeletePrompt,
  ENTER_SELECTION_LABEL,
  LEAVE_SELECTION_LABEL,
  selectAllLabel,
  selectionCountLabel,
} from './bulk-delete';

/** Everything a host needs to draw selection mode. Returned by `useLibrarySelection`. */
export interface LibrarySelection {
  readonly selecting: boolean;
  readonly picked: ReadonlySet<string>;
  readonly count: number;
  readonly allPicked: boolean;
  readonly confirming: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  readonly enter: () => void;
  readonly leave: () => void;
  readonly toggle: (id: string) => void;
  readonly toggleAll: () => void;
  readonly openConfirm: () => void;
  readonly closeConfirm: () => void;
  readonly run: () => void;
}

/**
 * The selection, over exactly the rows currently on screen.
 *
 * `visibleIds` is what `Select all` picks and what `allPicked` is measured against — the rows the
 * list is drawing, not the whole library, because a control that says `Select all` and picks
 * places the user cannot see is a count they cannot check.
 *
 * **`picked` is never allowed to outlive a row.** The set is intersected with `visibleIds` on every
 * read, so a place that leaves the list — deleted in another tab, filtered out, scoped away — stops
 * being counted without an effect having to notice. Deleting six things while the screen says
 * seven is the failure that makes a bulk control untrustworthy.
 */
export function useLibrarySelection(visibleIds: readonly string[]): LibrarySelection {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const live = useMemo(
    () => visibleIds.filter((id) => picked.has(id)),
    [visibleIds, picked],
  );

  function leave() {
    setSelecting(false);
    setPicked(new Set());
    setConfirming(false);
    setError(null);
  }

  function run() {
    const ids = live;
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      // `attemptWrite` and not a bare await: an offline delete rejects inside the transition and
      // React replaces the whole segment with `app/error.tsx`, taking the list and the selection
      // with it. Every other write in this product already goes through it.
      //
      // The counts are caught on the way past rather than returned by `attemptWrite`, whose `ok`
      // arm is deliberately payload-free — `ui/place/write-failure.ts` is shared by every write in
      // the product and widening its type for one caller would be the wrong trade. `.then` rather
      // than `await` inside the callback for the same reason `collection-content.tsx` gives: the
      // write-safety guards scan for `await <action>(`, and the rejection path is identical because
      // the promise is still returned into `attemptWrite`'s `try`.
      const answer: { value: BulkDeleteResult | null } = { value: null };
      const outcome = await attemptWrite(() =>
        deleteSavedPlaces(ids).then((result) => {
          answer.value = result;
          return result;
        }),
      );
      if (outcome.kind !== 'ok') {
        // A **refusal** is settled news — signed out, or nothing to delete — so the confirm
        // collapses and the message stands on its own. **Silence** settles nothing: the places are
        // still there and still the ones they meant, so the confirm stays open and `Delete` is one
        // press away rather than the whole gesture again.
        if (outcome.kind === 'refused') setConfirming(false);
        setError(outcome.message);
        return;
      }
      setNotice(answer.value?.ok === true ? bulkDeleteOutcomeMessage(answer.value) : null);
      leave();
    });
  }

  return {
    selecting,
    picked,
    count: live.length,
    allPicked: visibleIds.length > 0 && live.length === visibleIds.length,
    confirming,
    pending,
    error,
    notice,
    enter: () => {
      setNotice(null);
      setError(null);
      setSelecting(true);
    },
    leave,
    toggle: (id) => {
      setNotice(null);
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    toggleAll: () => {
      setNotice(null);
      setPicked(live.length === visible.size ? new Set() : new Set(visibleIds));
    },
    openConfirm: () => {
      setError(null);
      setConfirming(true);
    },
    closeConfirm: () => {
      setConfirming(false);
      setError(null);
    },
    run,
  };
}

/**
 * The control that starts a selection, sitting on the heading's own line.
 *
 * On the heading row and not in the filter bar, for two reasons. It costs **zero vertical pixels**
 * — the `h2` is already a full-width line with slack to its trailing edge — which matters on a
 * header the owner measured at 46% of a 375x812 viewport; and the filter bar is what narrows the
 * library, while this changes what a row *does*. `min-h-11` is the 44 px touch floor, painted small.
 */
export function EnterSelectionButton({ onEnter }: { onEnter: () => void }) {
  return (
    <button
      type="button"
      onClick={onEnter}
      data-vaul-no-drag
      className={cn(
        'ms-auto flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        PRESS_ROW,
      )}
    >
      {ENTER_SELECTION_LABEL}
    </button>
  );
}

/**
 * `Done · 3 selected · Select all`, in the band the search field and the filter bar vacate.
 *
 * They vacate it on purpose: two ways of narrowing a list you are picking from is a way to lose
 * track of what is picked, which is the argument `collection-content.tsx` makes for the same swap.
 * `aria-live="polite"` on the count so a screen-reader user hears the selection grow without
 * having to leave the row they are on.
 */
export function SelectionToolbar({ selection }: { selection: LibrarySelection }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        className="h-11 px-3 text-sm font-semibold"
        onClick={selection.leave}
        data-vaul-no-drag
      >
        {LEAVE_SELECTION_LABEL}
      </Button>
      <p aria-live="polite" className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">
        {selectionCountLabel(selection.count)}
      </p>
      <Button
        type="button"
        variant="ghost"
        className="h-11 px-3 text-sm font-semibold"
        onClick={selection.toggleAll}
        data-vaul-no-drag
      >
        {selectAllLabel(selection.allPicked)}
      </Button>
    </div>
  );
}

/**
 * The delete itself: a quiet trigger that opens the product's **deeper** confirm.
 *
 * At rest it is `text-muted-foreground` with a `Trash2` glyph and goes `text-destructive` only on
 * hover — the same weight `RemoveSavedPlace` carries, and §2.3's rule that red appears on this
 * screen only inside an open confirm, on its confirm button. Disabled until something is picked,
 * because a delete control that is pressable over an empty selection promises an action it will
 * refuse.
 */
export function BulkDeleteControl({ selection }: { selection: LibrarySelection }) {
  if (!selection.confirming) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={selection.openConfirm}
          disabled={selection.count === 0}
          data-vaul-no-drag
          className={cn(
            'flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2 text-sm font-bold text-muted-foreground underline-offset-4 outline-none hover:text-destructive hover:underline focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:opacity-50',
            PRESS_ROW,
          )}
        >
          <Trash2 className="size-3.5 shrink-0" aria-hidden />
          {BULK_DELETE_LABEL}
        </button>
        {selection.error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {selection.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3" role="group">
      {/* The count, then what it costs, then that it is final. All three are required of this
          confirm and none of them is required of the collection's — see `bulk-delete.ts`. */}
      <p className="text-sm font-medium text-foreground">{bulkDeletePrompt(selection.count)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{bulkDeleteBody(selection.count)}</p>
      {selection.error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {selection.error}
        </p>
      )}
      {/* **Cancel first, and autofocused.** The confirm exists to make the product's one
          irreversible action deliberate, and putting the destructive button under the returning
          finger — or under a keyboard user's habitual Space — undoes exactly that. This is the
          half of §2.4's "deliberately unequal depth" that a reader can see. */}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="h-11"
          disabled={selection.pending}
          onClick={selection.closeConfirm}
          data-vaul-no-drag
          autoFocus
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="h-11 flex-1"
          disabled={selection.pending}
          onClick={selection.run}
          data-vaul-no-drag
        >
          {selection.pending ? BULK_DELETE_PENDING_LABEL : BULK_DELETE_CONFIRM_LABEL}
        </Button>
      </div>
    </div>
  );
}

/**
 * What the delete actually did, when it is not what was asked.
 *
 * `null` — and therefore nothing at all — on a clean run: the rows leaving the list is the
 * confirmation. `role="status"` rather than `alert`, because a partial delete is news rather than
 * a fault.
 */
export function BulkDeleteNotice({ notice }: { notice: string | null }) {
  if (notice === null) return null;
  return (
    <p role="status" className="text-sm font-medium text-muted-foreground">
      {notice}
    </p>
  );
}

/**
 * One row while picking.
 *
 * **Its own row and not `PlaceRow` with a checkbox bolted on**, for the reason
 * `collection-content.tsx` gives about meaning rather than layout: `PlaceRow`'s `selected` prop
 * renders `aria-current="true"`, which says *this is the row you have open*. In a multi-select that
 * is a different claim, and reusing it would announce six open rows. `role="checkbox"` says the
 * true thing, and the whole row is the hit area rather than a 24 px box beside it.
 *
 * It shows the name and the `Category · Locality` line and stops. Thumbnails, tags and the been
 * badge are what you read a list for; while you are counting, they are what makes six rows hard to
 * count.
 */
export function SelectablePlaceRow({
  place,
  checked,
  onToggle,
}: {
  place: MapPlace;
  checked: boolean;
  onToggle: () => void;
}) {
  const secondLine = categoryLocalityLine(place.category, place.detail?.locality);
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        data-vaul-no-drag
        className={cn(
          'flex min-h-16 w-full items-center gap-3 py-3.5 ps-2.5 pe-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          PRESS_ROW,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
            checked ? 'border-transparent bg-primary text-primary-foreground' : 'border-border',
          )}
        >
          {checked ? <Check className="size-3.5" /> : null}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          {/* `<bdi>` and `line-clamp-1 break-words`, exactly as `PlaceRow` carries them: half this
              library is Hebrew, and an ellipsis on an RTL string in an LTR box clips the *start* of
              the name — the half that identifies it. */}
          <span className="line-clamp-1 break-words font-heading text-sm font-bold text-foreground">
            <bdi>{place.name}</bdi>
          </span>
          {secondLine ? (
            <span className="line-clamp-1 break-words text-xs font-medium text-muted-foreground">
              <bdi>{secondLine}</bdi>
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
