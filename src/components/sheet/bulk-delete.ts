/**
 * The words the library's bulk delete uses, and the one rule they exist to hold.
 *
 * `docs/archive/ux-two-removals-one-screen.md` defines **two distinct removals** and they must never be
 * reachable from one control:
 *
 * | control | writes | reversible |
 * |---|---|---|
 * | `Delete from your places` | deletes the viewer's `saved_places` row — note, tags, Been mark | **no** |
 * | `Take out of this collection` | unlinks `collection_items` | yes |
 *
 * Everything here belongs to the **first** one, and it is the exact mirror of
 * `components/collections/bulk-removal.ts`, which carries the second. Read the two side by side:
 * every divergence below is deliberate, and the pair is the safety mechanism.
 *
 * | | collection bulk | library bulk (here) |
 * |---|---|---|
 * | verb | `Take out` | `Delete` |
 * | prompt | `Take 3 places out of this collection?` | `Delete 3 places?` |
 * | consequence | one line about who stops seeing them | what is lost, **and that it cannot be undone** |
 * | confirm depth | shallow — two buttons, no autofocus, destructive button first | deeper — **Cancel first and autofocused** |
 * | where it sits | pinned footer, full-width button | the toolbar band at the top of the list |
 *
 * §2.4 states that inequality as a requirement rather than a preference: *"same idiom, deliberately
 * unequal depth. That inequality is the safety mechanism."* A bulk unlink may not borrow the
 * heavier confirm, and a bulk delete may not borrow the lighter one.
 *
 * **`Delete`, not `Remove`.** §3 ratifies `Delete from your places` verbatim, and
 * `bulk-removal.ts`'s own table already writes it that way. The single-place control in
 * `saved-place-edits.tsx` still ships `Remove from your places` — §5 item 1 flags changing it as
 * the owner's call, and this module deliberately does not change it. That leaves one product with
 * two words for one operation until the owner rules; the two verbs that must not collide are
 * `Delete`/`Remove` against `Take out`, and both of ours do.
 *
 * Vocabulary is `docs/voice-and-vocabulary.md`: **place**, digits always, no exclamation marks, no
 * `place(s)`, and the product name appears nowhere.
 */

/** The control that starts a selection. Not `Delete places` — what it starts is a selection, and
 *  what the selection can do is one of its outcomes. The same argument `collection-content.tsx`
 *  makes for `Select places`. */
export const ENTER_SELECTION_LABEL = 'Select';

/** Leaving selection mode. `Done`, where the collection says `Cancel`: nothing is pending until
 *  the confirm is open, so there is nothing to cancel, and two identical escapes on two multi-select
 *  surfaces is the confusability this pair exists to avoid. */
export const LEAVE_SELECTION_LABEL = 'Done';

/** The trigger's visible label, verbatim from the ruling's §3. */
export const BULK_DELETE_LABEL = 'Delete from your places';

/** The confirm button. Never `Remove`, never `Take out`. */
export const BULK_DELETE_CONFIRM_LABEL = 'Delete';

/** While the action is in flight. A real ellipsis, per the voice doc's mechanics. */
export const BULK_DELETE_PENDING_LABEL = 'Deleting…';

function placesPhrase(count: number): string {
  return count === 1 ? '1 place' : `${count} places`;
}

/**
 * `Delete 3 places?`
 *
 * A count and not the names, for the same reason the collection's bulk prompt gives: at six
 * selected, naming them is a paragraph, and they are on screen directly above the confirm with
 * their marks still drawn. `RemoveSavedPlace`'s single-place confirm keeps naming its place.
 *
 * Deliberately not `Delete 3 places from your places?` — the possessive is in the trigger's label
 * one line above and saying *places* twice in six words reads as a bug rather than as emphasis.
 */
export function bulkDeletePrompt(count: number): string {
  return `Delete ${placesPhrase(count)}?`;
}

/**
 * The consequence line, and the sentence that makes this the heavier of the two confirms.
 *
 * Every clause is required by §2.4: it enumerates what is lost and it says the action cannot be
 * undone. The three losses are the ones `deleteSavedPlaces` actually causes — the `saved_places`
 * row carries the note, the tags and the visit state, and `saved_place_sources` cascades. `places`
 * is shared and is never touched, which is why the sentence is about *your* note rather than about
 * the place.
 */
export function bulkDeleteBody(count: number): string {
  return count === 1
    ? "Your note, your tags and your Been mark go with it, and this can't be undone."
    : "Your notes, your tags and your Been marks go with them, and this can't be undone.";
}

/**
 * What to say once the delete has run.
 *
 * A bulk delete under RLS has a real middle: `saved_places_delete_own` (`0006`) is evaluated per
 * row, so an id the caller does not own contributes zero rows to the count and no error. Six ids
 * can come back as four — another tab, another device, or a row already deleted while this screen
 * was open. The number is reported rather than smoothed, because "deleted" over a screen that
 * still shows six is how a user learns not to trust the count.
 *
 * `null` when nothing went missing: the rows leaving the list is the confirmation, and a toast
 * that says what the screen already shows is noise. Same rule, same shape and deliberately not the
 * same words as `takeOutOutcomeMessage` — `already gone` is the honest reading of a row that is
 * deleted, where the collection's is `already out of this collection`.
 */
export function bulkDeleteOutcomeMessage(args: {
  readonly deleted: number;
  readonly requested: number;
}): string | null {
  if (args.deleted >= args.requested) return null;
  const missing = args.requested - args.deleted;
  if (args.deleted === 0) {
    return missing === 1 ? 'That place was already gone.' : 'Those places were already gone.';
  }
  return `Deleted ${placesPhrase(args.deleted)}. ${
    missing === 1 ? 'The other one was' : `The other ${missing} were`
  } already gone.`;
}

/** `3 selected`. The count is the whole label — a toolbar that says `3 places selected` repeats a
 *  noun the list below it is made of. Shared shape with the collection's toolbar on purpose: the
 *  *counting* is the same act on both screens; only what the selection can do differs. */
export function selectionCountLabel(count: number): string {
  return count === 0 ? 'None selected' : `${count} selected`;
}

/** `Select all` until everything on screen is picked, then `Clear`. */
export function selectAllLabel(allPicked: boolean): string {
  return allPicked ? 'Clear' : 'Select all';
}
