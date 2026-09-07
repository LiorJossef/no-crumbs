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
 * `docs/archive/ux-two-removals-one-screen.md`: the library's bulk removal is the **irreversible delete**
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

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
        // **`-me-2`, and `ms-auto` is gone** (`ux-select-control-2026-09-03.md` §7). A trailing
        // control cancels its trailing padding, so what you see is where the layout ends: the word
        // now lands on the column's content edge instead of floating 8 px inside it — under the
        // search field's border box in the library, and 8 px closer to the `⋯` in a collection.
        // Logical, not `-mr-2`: half this library is Hebrew. The *leading* `px-2` deliberately
        // stays — that side faces a truncating heading and the 8 px is room from an ellipsis.
        // `ms-auto` was a no-op (`min-w-0 flex-1` on the heading already decides the position) and
        // a hazard: it would silently become the positioning rule for a host that forgot `flex-1`.
        '-me-2 flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        PRESS_ROW,
      )}
    >
      {ENTER_SELECTION_LABEL}
    </button>
  );
}

/**
 * The control that *ends* the selection, in the exact slot `Select` just vacated.
 *
 * **This is the answer to "when you click to get to the select mode, it's weird"**
 * (`ux-select-control-2026-09-03.md` §3.1 and §5). The exit used to live at the far end of the
 * screen, in a row below, two weights heavier than the control that opened the mode. Now the same
 * position, the same box, the same size and the same weight come back with one ink step changed —
 * so nothing jumps, the finger is already there, and the mode change is legible as a change of
 * register rather than as a new screen.
 *
 * A second small component rather than a `variant` prop on `EnterSelectionButton`: the two are
 * rendered into one slot by one conditional and must be trivially diffable. Everything below is
 * identical to that component except `text-foreground` and the label — **keep it that way**, and
 * `library-selection.test`'s C3 assertion is what notices if it drifts.
 *
 * `label` exists for exactly one caller. `bulk-delete.ts` rules that the library says `Done`
 * (nothing is pending, so there is nothing to cancel) and the collection says `Cancel`; the
 * divergence is thin — one word — and `ux-select-control-2026-09-03.md` §6 says so out loud, but it
 * is carried by the four axes in that file's table rather than by this string, and unifying it is
 * the owner's call and not this task's.
 */
export function LeaveSelectionButton({
  onLeave,
  label = LEAVE_SELECTION_LABEL,
}: {
  onLeave: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  /**
   * **Focus lands here when the mode opens** (§5.5). The pressed `Select` node is unmounted by the
   * state change that mounts this one, so without this focus falls to `<body>` and a keyboard user
   * restarts from the top of the document. It is continuity rather than a jump: this button is
   * standing where the one they just pressed was.
   *
   * On mount, because this component exists for exactly as long as `selecting` is true.
   * `checkVisibility` because both libraries are in the document twice at once — the sheet
   * (`lg:hidden`) and the desktop panel (`hidden lg:block`) — and `focus()` on the hidden copy is a
   * silent no-op that would consume the move and leave nothing focused at all. `preventScroll`
   * because the sheet may still be animating into its stop and a scroll-into-view here fights it.
   */
  useEffect(() => {
    const exit = ref.current;
    if (!exit?.checkVisibility()) return;
    exit.focus({ preventScroll: true });
  }, []);

  return (
    <button
      type="button"
      ref={ref}
      onClick={onLeave}
      data-vaul-no-drag
      className={cn(
        '-me-2 flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        PRESS_ROW,
      )}
    >
      {label}
    </button>
  );
}

/**
 * `3 selected · Select all`, in the band the search field and the filter bar vacate.
 *
 * They vacate it on purpose: two ways of narrowing a list you are picking from is a way to lose
 * track of what is picked, which is the argument `collection-content.tsx` makes for the same swap.
 * `aria-live="polite"` on the count so a screen-reader user hears the selection grow without
 * having to leave the row they are on.
 *
 * **`Done` is not in here.** It went to the heading row's trailing slot — see
 * `LeaveSelectionButton` — which is why `flex-1` on the count is now doing real work (status
 * leading, one control trailing) instead of padding the gap between two buttons.
 */
export function SelectionToolbar({ selection }: { selection: LibrarySelection }) {
  return (
    /*
     * **The weight ladder, and it used to be upside down**
     * (`ux-select-control-2026-09-03.md` §2). `Done` and `Select all` were both `font-semibold`
     * and near-black while the one irreversible thing on the screen was grey text — the two
     * lowest-stakes controls in the band were the loudest elements on it. The band now has exactly
     * one loud element and it is the action:
     *
     *  1. the bulk action — the only container, the only `font-semibold`, the only colour
     *  2. the count — status, which gains weight from its *content* and never from chrome
     *  3. the exit (`Done`) — `font-medium text-foreground`
     *  4. the convenience (`Select all`) — `font-medium text-muted-foreground`
     *
     * `Done` at `font-medium` — up in the heading slot — is what keeps the *transition* honest:
     * `Select` before and `Done` after are one step apart (muted → foreground, same size, same
     * weight) rather than three. The same class of control must not change register across the
     * mode change.
     *
     * **The row is new on screen, so it gets the product's `enter` beat and nothing else** (§5.3).
     * Under `prefers-reduced-motion` this collapses to the opacity change alone rather than to
     * nothing — `facelift-plan.md` §3a: the thing that just arrived still has to be findable, so
     * opacity is everyone's and the 4 px rise is the pointer user's bonus.
     */
    <div className="flex animate-in items-center gap-2 fade-in-0 duration-enter motion-safe:slide-in-from-top-1">
      {/* Never bold, never contained: at zero it is muted, and the moment something is picked it
          goes `text-foreground` on its own. That is the whole of its emphasis. */}
      <p
        aria-live="polite"
        className={cn(
          'min-w-0 flex-1 text-sm font-medium',
          selection.count === 0 ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {selectionCountLabel(selection.count)}
      </p>
      <Button
        type="button"
        variant="ghost"
        // **`-me-3`, and the spec's `-me-2` was arithmetic against the wrong padding.** This is a
        // ghost `Button` at `px-3`, so `-me-2` left its label 4 px inside the column edge while
        // `Select`/`Done` (`px-2`, `-me-2`) landed flush — two controls in one corner missing each
        // other by 4 px, which is the class of defect this whole change exists to remove.
        className="-me-3 h-11 px-3 text-sm font-medium text-muted-foreground"
        onClick={selection.toggleAll}
        data-vaul-no-drag
      >
        {selectAllLabel(selection.allPicked)}
      </Button>
    </div>
  );
}

/**
 * The delete itself: a contained, destructive-inked trigger that opens the product's **deeper**
 * confirm.
 *
 * **Red at rest, and that reverses what this comment used to say.** It read §2.3 as *"red appears
 * on this screen only inside an open confirm"*; `ux-collection-actions-2026-09-03.md` §6
 * generalised the same ruling as *"red at rest is reserved for the irreversible; every other
 * removal is neutral at rest"*, and this is the product's one irreversible removal. It qualifies —
 * and the collection's `Take out` stays neutral under the same sentence. One reading in the tree,
 * not two.
 *
 * **`outline`, not `destructive`.** `variant="destructive"` is the *confirm* button. Rendering the
 * trigger and the confirm identically would flatten the escalation the confirm exists to provide,
 * so the trigger is an outlined box with destructive ink and the confirm is the tinted fill.
 *
 * **The outline variant's mint hover is overridden — in both themes.** Its light arm is
 * `hover:border-brand hover:bg-primary/5`, which is house mint on a delete button; its dark arm is
 * a *separately modified* `dark:border-input dark:bg-input/30 dark:hover:bg-input/50`, and
 * tailwind-merge does not treat `dark:hover:bg-*` and `hover:bg-*` as the same key, so a light-only
 * override would leave dark hovering grey. Every one of the three has a `dark:` twin below.
 *
 * **The container is the fix for "it looks broken", not an opacity number.** `disabled:opacity-45`
 * is the matrix's step and `button.tsx` fixes it deliberately; one call site is not the place to
 * fork it. A *shape* at 45 % reads as a control waiting for a pick, where naked grey text at 45 %
 * read as nothing at all.
 *
 * **Compact, auto width, `self-start` — not full width.** `bulk-delete.ts`'s divergence table
 * needs this and the collection's bulk unlink not to look alike, and names *where the button is*
 * as the first thing a thumb learns. Position already differs (band-top vs pinned-footer); keeping
 * this compact and the collection's a full-width `h-12` slab keeps three axes of difference.
 */
export function BulkDeleteControl({ selection }: { selection: LibrarySelection }) {
  if (!selection.confirming) {
    return (
      <div className="flex animate-in flex-col gap-1.5 fade-in-0 duration-enter motion-safe:slide-in-from-top-1">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={selection.openConfirm}
          disabled={selection.count === 0}
          data-vaul-no-drag
          className={cn(
            'h-11 gap-1.5 self-start px-3 text-sm font-semibold',
            'border-destructive/30 text-destructive dark:border-destructive/40 dark:bg-transparent',
            'hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive',
            'dark:hover:border-destructive/60 dark:hover:bg-destructive/20',
            PRESS_ROW,
          )}
        >
          <Trash2 className="size-4 shrink-0" aria-hidden />
          {BULK_DELETE_LABEL}
        </Button>
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
