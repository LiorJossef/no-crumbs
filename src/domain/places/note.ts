/**
 * The rule for what a user may put in `saved_places.note` — `L1-F7-T2`, the "U" in the CRUD the
 * course grades and the only user-writable text on a saved place.
 *
 * ## Why this is a domain module and not three lines inside the server action
 *
 * Two callers have to agree about it: the action that writes the row, and the UI that decides
 * whether the Save button is enabled and what to say when it is not. If the rule lives in the
 * action, the UI grows its own copy of `2000` and the two drift — which is the same failure the
 * project already avoided by making `normalise()` the single answer to "are these the same text?"
 * (`domain/places/search.ts`'s header). One rule, one file, tested directly.
 *
 * ## The rule, and where each half comes from
 *
 * - **Trimmed.** Leading/trailing whitespace in a note is never meaningful and always accidental.
 * - **Empty means "no note", not the empty string.** The column is nullable and `Spot.note` is
 *   `undefined` when absent, so a cleared note must become SQL `NULL`. Writing `''` would give the
 *   detail view a note section containing nothing, and `''` and `NULL` would then both mean
 *   "no note" — two representations of one state, which is how a row starts rendering wrong.
 * - **2000 characters, checked here as well as in Postgres.** `saved_places_note_check` is
 *   `length(note) <= 2000` (migration `0006`). This is deliberately the *same* number rather than a
 *   safer smaller one: a limit the UI enforces at 1000 while the database allows 2000 is a UI that
 *   lies about the product's actual capability. The check is duplicated, not moved — the database
 *   constraint stays the authority, and this one exists so the user is told before the round trip
 *   instead of after it.
 *
 * Note the asymmetry with the database check: Postgres measures the value it is given, this
 * measures the *trimmed* value, and the trimmed value is what gets written. So nothing this
 * function accepts can be rejected by the constraint.
 *
 * Newlines are preserved. A note is prose the user typed into a multi-line field, and collapsing
 * its line breaks would silently rewrite what they wrote — unlike a place *name*, where whitespace
 * is noise to be normalised away.
 */

/** The database's own limit (`saved_places_note_check`, migration `0006`), restated. */
export const NOTE_MAX_LENGTH = 2000;

export type NoteValidation =
  /** `value` is what to write: the trimmed text, or `null` for "this place has no note". */
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly message: string };

/**
 * Validates and normalises a note as typed. Total: every string has an answer, and the `ok: false`
 * branch carries copy the UI can render as-is rather than a code it would have to map.
 */
export function validateNote(raw: string): NoteValidation {
  const trimmed = raw.trim();

  if (trimmed.length > NOTE_MAX_LENGTH) {
    const over = trimmed.length - NOTE_MAX_LENGTH;
    return {
      ok: false,
      message: `That note is ${over.toLocaleString()} character${over === 1 ? '' : 's'} too long. The limit is ${NOTE_MAX_LENGTH.toLocaleString()}.`,
    };
  }

  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

/**
 * Whether saving would change anything. The UI uses it to keep the Save button inert on an
 * untouched field, so that pressing it is always a real edit — and so a no-op edit never costs a
 * round trip or bumps `updated_at` (the `touch_updated_at` trigger fires on any UPDATE, including
 * one that writes the same value back).
 *
 * `current` is `Spot.note`, which is `undefined` rather than `null` when the row has none, so both
 * absent forms are compared as "no note".
 */
export function isNoteUnchanged(raw: string, current: string | null | undefined): boolean {
  const validated = validateNote(raw);
  if (!validated.ok) return false;
  return validated.value === (current ?? null);
}
