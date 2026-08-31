/**
 * The two name fields on the sign-up form, and the one decision the database deliberately did not
 * make.
 *
 * `0035_names_at_sign_up.sql` puts `first_name` and `last_name` on `public.profile_names`, both
 * **nullable, permanently**, and its R2 says why in two parts: the eight accounts that predate it
 * have no name anywhere to back-fill from, and a `not null` there would fire inside the
 * `auth.users` INSERT — turning a missing metadata key into a failed account creation on a path
 * where the product cannot render anything useful. So the column will accept nothing, forever, and
 * the ruling hands required-ness to this file in as many words: *"the sign-up form must validate
 * the two fields and refuse to submit without them, or names will be as absent tomorrow as they
 * are today."*
 *
 * ## The ruling, and it is not "both, because the database said validate both"
 *
 * **First name: required. Last name: optional, and the form says so.**
 *
 * The first name is the entire feature. The product asked for a name so it can address you, it
 * addresses you by given name, and a sign-up that lets the field through empty produces exactly
 * today's state — a column nothing writes — with two more inputs on the front door to show for it.
 * One word, on the one screen whose job is to get an account made, is a price worth paying for the
 * thing being paid for.
 *
 * The family name is not, and the reason is in `0035`'s own column comment: *"stored, and read by
 * nothing today"*. There is no surface that renders it and none is planned. Requiring a field with
 * no consumer spends the user's patience on our filing, and it does worse than that — a required
 * surname is wrong for everyone with one name, and the failure it produces is *"you cannot have an
 * account"* rather than *"we could not address you"*.
 *
 * So the field is offered, because the owner asked for it and someone who wants to give it should
 * be able to, and it is marked `Optional` rather than being silently skippable. A form that accepts
 * an empty field without saying so teaches people to distrust the ones it does enforce.
 *
 * ## Why this is validation and not a schema
 *
 * Two fields, one required, one length bound that is already in the database. A Zod object here
 * would be a second declaration of `profile_names`' own CHECK constraint, in a different file, that
 * nothing keeps in step with it. The length is restated once, below, with the constraint it
 * mirrors named.
 */

/**
 * `profile_names_first_name_check` / `_last_name_check` (`0035`), which are themselves
 * `profiles_display_name_check`'s bound (`0002:9`). Restated rather than imported because there is
 * nothing to import it from: the database is the only other place it exists.
 *
 * It is enforced here as a `maxLength` on the inputs *and* as a truncation in the metadata, because
 * `raw_user_meta_data` is a client-supplied JSON blob — `handle_new_user` clamps it with `left(…,
 * 80)` for the same reason, and neither of us is relying on the other.
 */
export const NAME_MAX_LENGTH = 80;

/**
 * What rides on `signUp`'s `options.data`, and therefore what lands in `auth.users.raw_user_meta_data`
 * for `handle_new_user()` to read. Snake case because these are the keys that function looks up by
 * name (`m ->> 'first_name'`), not because it is a row.
 *
 * `last_name` is omitted rather than sent empty. The two are equivalent to the trigger — it
 * `nullif(btrim(…), '')`s both — but an absent key says "not given" where an empty string says
 * "given, and empty", and only one of those is true.
 */
export interface SignUpNameMetadata {
  readonly first_name: string;
  readonly last_name?: string;
}

export type SignUpNames =
  | { readonly ok: true; readonly data: SignUpNameMetadata }
  | { readonly ok: false; readonly message: string };

/**
 * Collapses inner whitespace the way `updateDisplayName` already does (`actions/collections.ts`),
 * so `Maya  Levi` and `Maya Levi` are one name rather than two. The database trims the ends; it
 * does not touch the middle.
 */
function tidy(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX_LENGTH);
}

/**
 * The submit-time check. The form is `noValidate` — see `sign-in-client.tsx`, where that is what
 * lets the product write its own error copy instead of the browser's — so `required` on the input
 * is a hint to autofill and to assistive technology, and this is the thing that actually refuses.
 *
 * One message, in the same slot the auth errors use, in the same register as
 * `Enter your email and password.`: it states what is missing and stops.
 */
export function signUpNames(input: {
  readonly firstName: string;
  readonly lastName: string;
}): SignUpNames {
  const first = tidy(input.firstName);
  if (first === '') return { ok: false, message: 'Enter your first name.' };

  const last = tidy(input.lastName);
  return {
    ok: true,
    data: last === '' ? { first_name: first } : { first_name: first, last_name: last },
  };
}
