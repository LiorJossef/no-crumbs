/**
 * The words the collection's bulk take-out uses, and the one rule they exist to hold.
 *
 * `docs/archive/ux-two-removals-one-screen.md` defines **two distinct removals** on this product and they
 * must never be reachable from one control:
 *
 * | control | writes | reversible |
 * |---|---|---|
 * | `Delete from your places` | deletes the viewer's `saved_places` row — note, tags, Been mark | **no** |
 * | `Take out of this collection` | unlinks `collection_items` | yes |
 *
 * Everything here belongs to the **second** one. It is the reversible unlink, so it is not red at
 * rest, its verb is `Take out` rather than `Delete`, and its confirm is deliberately the shallower
 * of the two: one line, two buttons, no autofocus. The bulk shape changes the count in the
 * sentence and nothing else about that ranking — a selection of six is still six unlinks, and
 * making it *feel* like the irreversible one would teach exactly the confusion the ruling exists to
 * remove.
 *
 * The verbs diverge at the first character on purpose. `Remove … / Remove …` is the original
 * defect.
 *
 * Vocabulary is `docs/voice-and-vocabulary.md`: **place**, **collection**, and the product name
 * appears nowhere.
 */

/** The trigger's visible label, singular and plural, verbatim from the ruling's §3. */
export const TAKE_OUT_LABEL = 'Take out of this collection';

/** The confirm button. Never `Delete`, never `Remove`. */
export const TAKE_OUT_CONFIRM_LABEL = 'Take out';

function placesPhrase(count: number): string {
  return count === 1 ? '1 place' : `${count} places`;
}

/**
 * `Take 3 places out of this collection?`
 *
 * A count and not the names: at six selected, naming them is a paragraph, and the names are on
 * screen directly above the confirm with their selection marks still drawn. The single-item
 * control keeps naming its place — that one has room, and this does not replace it.
 */
export function takeOutPrompt(count: number): string {
  return `Take ${placesPhrase(count)} out of this collection?`;
}

/**
 * The consequence line.
 *
 * `Nobody here will see them any more.` always, because that is what the unlink does. The second
 * sentence — that the places stay in the viewer's own library — is the whole distinction between
 * the two removals **and must not be shown when it is false**, so it appears only when every
 * selected place is one the viewer has saved. A mixed selection gets the first sentence alone
 * rather than a hedge: a sentence that is true of four of six places is a false sentence.
 */
export function takeOutBody(args: {
  readonly count: number;
  readonly allSavedByViewer: boolean;
}): string {
  const seen = args.count === 1 ? 'it' : 'them';
  const stay =
    args.count === 1 ? ' It stays in your places.' : ' They stay in your places.';
  return `Nobody here will see ${seen} any more.${args.allSavedByViewer ? stay : ''}`;
}

/**
 * What to say once the delete has run.
 *
 * A bulk unlink under RLS has a real middle: `.in()` matches the rows the policy allows and
 * silently matches zero of the rest, so six ids can come back as four. That is not an error and it
 * is not a clean success either — it is what happens when somebody else took a place out while
 * this screen was open. The number is reported rather than smoothed, and the reason is named,
 * because "it worked" over a screen that still shows six is how a user learns not to trust the
 * count.
 *
 * `null` when nothing went missing: the list itself is the confirmation, and a toast that says
 * what the screen already shows is noise.
 */
export function takeOutOutcomeMessage(args: {
  readonly removed: number;
  readonly requested: number;
}): string | null {
  if (args.removed >= args.requested) return null;
  const missing = args.requested - args.removed;
  if (args.removed === 0) {
    return missing === 1
      ? 'That place was already out of this collection.'
      : 'Those places were already out of this collection.';
  }
  return `Took ${placesPhrase(args.removed)} out. ${
    missing === 1 ? 'The other one was' : `The other ${missing} were`
  } already gone.`;
}

/** `3 selected`. The count is the whole label — a selection toolbar that says
 *  `3 places selected` repeats a noun the list below it is made of. */
export function selectionCountLabel(count: number): string {
  return count === 0 ? 'None selected' : `${count} selected`;
}
