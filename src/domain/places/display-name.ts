/**
 * The rule for what a user may rename a saved place to.
 *
 * `saved_places.display_name` has been selected, rendered, and inside the UPDATE column grant since
 * `0006` — and written by nothing. The place a resolver got slightly wrong, or the one whose real
 * name is a transliteration nobody would search for, was a place you were stuck with.
 *
 * Two halves, and the second is the point of the control:
 *
 *  - **A name.** Trimmed, interior whitespace collapsed (it is a label on one line, so two
 *    spellings of one label is how a list starts looking broken), 200 characters, which is the same
 *    number `saved_places_display_name_check` uses. The duplication is deliberate for the reason
 *    `note.ts` gives: the column constraint stays the authority, this exists so the user is told
 *    before the round trip.
 *  - **Empty means "use the real name again", not the empty string.** Clearing writes SQL NULL, so
 *    the read path falls back to `places.name` — and keeps falling back to it if that name later
 *    improves. Freezing today's canonical name into the column would silently opt the place out of
 *    every future correction, which is the same mistake `updateSavedPlaceCategory` documents for
 *    `category_override`.
 */

/** The database's own limit (`saved_places_display_name_check`, migration `0006`), restated. */
export const DISPLAY_NAME_MAX_LENGTH = 200;

export type DisplayNameValidation =
  /** `value` is what to write: the cleaned name, or `null` for "go back to the real name". */
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly message: string };

export function validateDisplayName(raw: string): DisplayNameValidation {
  const name = raw.trim().replace(/\s+/g, ' ');

  if (name.length === 0) return { ok: true, value: null };

  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    const over = name.length - DISPLAY_NAME_MAX_LENGTH;
    return {
      ok: false,
      message: `That name is ${over} character${over === 1 ? '' : 's'} too long. The limit is ${DISPLAY_NAME_MAX_LENGTH}.`,
    };
  }

  return { ok: true, value: name };
}

/** Whether saving would change anything, so an untouched field cannot cost a round trip or bump
 *  `updated_at` — the touch trigger fires on any UPDATE, including one that writes the same value
 *  back. `current` is the stored override, which is `null` when the place shows its real name. */
export function isDisplayNameUnchanged(raw: string, current: string | null): boolean {
  const validated = validateDisplayName(raw);
  if (!validated.ok) return false;
  return validated.value === current;
}
