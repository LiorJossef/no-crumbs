'use server';

/**
 * The account menu's data, and the one write that changes a person's name.
 *
 * ## Why the menu loads through an action instead of props
 *
 * `ProfileMenu` is opened from `BottomNav`, and `BottomNav` renders on every route in the product
 * — `/map`, the two collections views, `/profile`, `/account`, and inside the import overlay's
 * host. Threading identity, a library count and a deletion pre-check through five call sites would
 * make every one of those routes pay four queries on paint for a menu most visits never open, and
 * would give each of them its own chance to pass a slightly different shape.
 *
 * So the menu asks for its own data, once, the first time it is opened, and keeps it. That is one
 * round trip on a deliberate press rather than four on every paint, and there is exactly one
 * definition of what the menu shows.
 *
 * ## The signature is the authorisation boundary, as it is in `actions/account.ts`
 *
 * Neither function here takes a user id, and neither may ever grow one. A Server Action is a POST
 * endpoint anyone who can guess its id may call; `getUser()` inside the function is what makes
 * "the caller's own account" a guarantee of this module rather than a promise of its callers.
 * Everything below it is additionally scoped by RLS — `profile_names_select_own` and
 * `profile_names_update_own` are both keyed on `auth.uid()`, so the `eq` filters here exist to give
 * the planner an index condition, not as the access control.
 *
 * ## What this module deliberately does not do
 *
 * **It never writes `profiles.display_name`.** `0035_names_at_sign_up.sql` refuses to derive the
 * peer-visible label from the private name, in terms, and deleted a trigger that did. The account
 * settings page offers `display_name` as a *separate* field with a *separate* submit, through
 * `updateDisplayName` in `actions/collections.ts` — the writer that already exists — so that
 * pressing save on your first name cannot put that name in front of a stranger.
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/app/_lib/supabase/server';
import { getProfilePlaces } from '@/app/profile/_lib/get-profile-places';
import {
  accountIdentity,
  deriveProfileStats,
  joinedLabel,
  type ProfileStats,
} from '@/app/profile/_lib/profile-stats';
import { NAME_MAX_LENGTH, tidyName } from '@/app/account/_lib/account-name';

/** Everything the account menu renders, from one call. */
export interface ProfileMenuData {
  /** The first name, or the confirmed display name, or `null`. Never the email — see
   *  `accountIdentity`, which owns that precedence and the bug that made it necessary. */
  readonly name: string | null;
  /** The email address, or `Your account` for a session with none. Never `null` in practice; the
   *  type keeps the renderer honest about a shape `accountIdentity` can return. */
  readonly account: string | null;
  /** `Joined August 2026`, or `null` where the profile row is missing. */
  readonly joined: string | null;
  /** The three headline figures plus the two visit counts. The breakdown lists stay on `/profile`;
   *  see `profile-menu.tsx` for where that line is drawn and why. */
  readonly stats: ProfileStats;
}

export async function loadProfileMenu(): Promise<ProfileMenuData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // `null` rather than a thrown error or a friendly message: an unauthenticated caller here is a
  // POST to an action id, not a person having a bad time. `proxy.ts` already sends a signed-out
  // visitor to `/sign-in`, and the menu renders its own quiet failure line.
  if (!user) return null;

  // Three independent reads in one `Promise.all`. The deletion pre-check used to ride along too;
  // it went when the owner ruled delete-my-data off this surface (2026-09-03) — `/account` runs it
  // for the disclosure that actually renders it.
  //
  // `profile_names` is its own query rather than an embedded join — there is no foreign key *from*
  // `profiles` to embed through, the key points the other way. It fails soft on `42P01` where
  // `0035` is not applied, which reads as "no name", the same state the pre-`0035` accounts are in
  // permanently.
  const [{ data: profile }, { data: names }, places] = await Promise.all([
    supabase.from('profiles').select('display_name, created_at').eq('id', user.id).maybeSingle(),
    supabase.from('profile_names').select('first_name').eq('profile_id', user.id).maybeSingle(),
    getProfilePlaces(),
  ]);

  const identity = accountIdentity({
    firstName: (names as { first_name: string | null } | null)?.first_name ?? null,
    displayName: profile?.display_name ?? null,
    email: user.email ?? null,
  });

  return {
    name: identity.name,
    account: identity.account,
    joined: joinedLabel(profile?.created_at ? new Date(profile.created_at) : null),
    stats: deriveProfileStats(places),
  };
}

/** What `/account` reads to fill its form. Both fields are `null` for the accounts that predate
 *  `0035` and for anyone who signed up through a path that collects no name. */
export interface AccountName {
  readonly firstName: string | null;
  readonly lastName: string | null;
  /** The peer-visible label. Read here so the settings page can show what strangers actually see;
   *  **nothing on this path derives it from the two fields above.** */
  readonly displayName: string | null;
}

export async function loadAccountName(): Promise<AccountName | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: names }, { data: profile }] = await Promise.all([
    supabase
      .from('profile_names')
      .select('first_name, last_name')
      .eq('profile_id', user.id)
      .maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);

  const row = names as { first_name: string | null; last_name: string | null } | null;
  return {
    firstName: row?.first_name ?? null,
    lastName: row?.last_name ?? null,
    displayName: profile?.display_name ?? null,
  };
}

export type UpdateNameResult =
  | { readonly ok: true; readonly firstName: string | null; readonly lastName: string | null }
  | { readonly ok: false; readonly message: string };

const NOT_SIGNED_IN = 'You are signed out. Sign in and try again.';
const FAILED = "Couldn’t save that. Try again in a moment.";

/**
 * Write this account's private name.
 *
 * ## Clearing is allowed, and that is the schema author's decision rather than mine
 *
 * `0035` grants no DELETE and says why in the same breath: *"clearing a name is
 * `set first_name = null`, and the row itself dies with the profile."* So an empty field is a
 * legitimate submission, not a validation failure. The sign-up form requires a first name because
 * a sign-up that lets it through produces an account with no name forever
 * (`sign-in/name-fields.ts`); a settings screen refusing to let you take back a name you gave would
 * be a different rule wearing the same clothes.
 *
 * The trigger `profile_names_normalise` turns `''` into `null` on the way in, so absence has one
 * representation in the column whatever this function sends. It is sent as `null` anyway — a
 * client that relies on a trigger to mean what it says is one migration away from storing `''`.
 *
 * ## Why this is not an upsert
 *
 * `0035` grants `insert (profile_id, first_name, last_name)` and `update (first_name, last_name)`
 * — **`profile_id` is deliberately absent from the update list.** PostgREST's upsert is
 * `INSERT … ON CONFLICT DO UPDATE SET` over every column it was handed, which puts `profile_id` in
 * the `SET` list and needs an UPDATE privilege on it that this role does not hold. So the write is
 * an explicit update, and an insert only where that touched no row. `23505` on the insert is the
 * two-tabs race and is retried as an update rather than surfaced.
 */
export async function updateAccountName(input: {
  readonly firstName: string;
  readonly lastName: string;
}): Promise<UpdateNameResult> {
  const first = tidyName(input.firstName);
  const last = tidyName(input.lastName);
  if (first.length > NAME_MAX_LENGTH || last.length > NAME_MAX_LENGTH) {
    // Caught here rather than by `profile_names_first_name_check`, which would arrive as a bare
    // `23514` from a table the user has no idea they are writing to.
    return { ok: false, message: `Keep names to ${NAME_MAX_LENGTH} characters or fewer.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };

  const row = { first_name: first === '' ? null : first, last_name: last === '' ? null : last };

  const updated = await supabase
    .from('profile_names')
    .update(row)
    .eq('profile_id', user.id)
    .select('profile_id');
  if (updated.error) {
    console.error('updateAccountName update failed', { code: updated.error.code });
    return { ok: false, message: FAILED };
  }

  if ((updated.data ?? []).length === 0) {
    const inserted = await supabase
      .from('profile_names')
      .insert({ profile_id: user.id, ...row })
      .select('profile_id');
    // `23505` means a concurrent writer created the row between the update above and this insert.
    // The user's intent is unchanged, so the second attempt is the update that would have worked.
    if (inserted.error?.code === '23505') {
      const retry = await supabase.from('profile_names').update(row).eq('profile_id', user.id);
      if (retry.error) {
        console.error('updateAccountName retry failed', { code: retry.error.code });
        return { ok: false, message: FAILED };
      }
    } else if (inserted.error) {
      console.error('updateAccountName insert failed', { code: inserted.error.code });
      return { ok: false, message: FAILED };
    }
  }

  // Both pages, because both render what this just wrote: `/account` seeds the two forms from the
  // stored values, and `/profile`'s identity block is built from `first_name` and `display_name`.
  // The menu is read through `loadProfileMenu` on every open, so it needs no invalidation.
  revalidatePath('/account');
  revalidatePath('/profile');
  return { ok: true, firstName: row.first_name, lastName: row.last_name };
}
