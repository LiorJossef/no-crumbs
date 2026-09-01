/**
 * Tidying a name on the way into `profile_names`, shared by the settings form and the action
 * behind it.
 *
 * **There is no Zod object here and there should not be.** Two optional strings and one length
 * bound that the database already holds as a CHECK constraint is not a schema; a Zod copy of
 * `profile_names_first_name_check` would be a second declaration of it in a file nothing keeps in
 * step. `sign-in/name-fields.ts` reaches the same conclusion for the same two fields and this
 * imports its constant rather than restating it — the repo has been bitten twice by one bound
 * living in two places (`share-panel.test.ts` against `MEMBER_NAME_MAX_LENGTH`).
 */

// The one length bound, from the module that already owns it for the sign-up form. It is
// `profile_names_first_name_check` / `_last_name_check` (`0035`), which are themselves
// `profiles_display_name_check`'s bound (`0002:9`).
export { NAME_MAX_LENGTH } from '@/app/sign-in/name-fields';

/**
 * Collapse inner whitespace and trim the ends, so `Maya  Levi` and `Maya Levi` are one name.
 *
 * The same shape as `signUpNames`' private `tidy` and `updateDisplayName`'s first line, and
 * deliberately **without** its `.slice(NAME_MAX_LENGTH)`: a form that silently truncates an
 * over-long name stores something the user did not type and reports success. The caller refuses
 * instead, and says by how much it is over.
 *
 * The database's `profile_names_normalise` trigger trims too and turns `''` into `null`. This is
 * not relying on that — it collapses the *middle*, which the trigger does not touch — and the
 * caller sends an explicit `null` rather than leaning on it either.
 */
export function tidyName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
