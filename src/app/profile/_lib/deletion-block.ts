import 'server-only';

import { createClient } from '@/app/_lib/supabase/server';
import { blockingCollections, type BlockingCollection } from './blocking-collections';

/**
 * Whether this account can be deleted, and what is standing in the way if it cannot.
 *
 * ## The rule, and it is not mine
 *
 * `docs/archive/overnight-deletion-review.md` §2, a binding ruling from `security-privacy` written before
 * this was built:
 *
 * > **Refuse deletion while the user is the live owner of a collection that has at least one other
 * > live member. Delete unconditionally in every other case.**
 *
 * The reason is a single line of DDL. `collections.owner_id` is
 * `references public.profiles (id) on delete cascade` (`0024:92`), and a foreign-key referential
 * action is executed by the system — RLS, `FORCE ROW LEVEL SECURITY` and column grants do not
 * constrain it. So deleting the account destroys every collection the user owns **for everyone in
 * it**, including the membership tombstones `0026` added. Erasing one person's data must not be a
 * deletion of somebody else's, which is the reasoning `0024`'s own author wrote into rows 7, 8 and
 * 9 of that graph and did not apply to row 5.
 *
 * **Transferring the collection instead is not available, and not because nobody wrote it.** No
 * role reachable from this application can write `collections.owner_id` at all, on three
 * independent and deliberate controls: `authenticated` is granted `update (name, description)`
 * only; `service_role` holds *no* grant on these tables and BYPASSRLS does not bypass a table
 * privilege; and the membership row cannot be promoted to owner by policy, by
 * `end_collection_membership` or past the one-owner unique index. Transfer needs a new
 * `SECURITY DEFINER` function, which needs a migration. Review §6 sizes it; the run forbids it.
 *
 * ## The query, and the one client it must not use
 *
 * It runs as the **user**, through `createClient()` and RLS — never `serviceRoleClient()`, which
 * would fail `42501` because `service_role` has no privilege on the collections tables at all
 * (review §3.1). `collection_members_select_member` (`0026:210`) already carries
 * `removed_at is null`, so the second query returns live memberships only and an application-level
 * `removed_at` filter would be redundant rather than wrong.
 *
 * The owner is always a member of their own collection — the `collections_owner_membership` AFTER
 * INSERT trigger (`0024:290`) — so their own row is always present and is what `user_id !== uid`
 * excludes.
 */

export type { BlockingCollection };

/**
 * `ok: false` means *we could not tell*, and it is deliberately not the same value as "nothing is
 * blocking". A read that failed must never be read as permission to delete, so the action treats it
 * as a refusal and the page treats it as a reason not to offer the control.
 */
export type DeletionBlockCheck =
  | { readonly ok: true; readonly blocking: readonly BlockingCollection[] }
  | { readonly ok: false };

export async function checkDeletionBlocked(): Promise<DeletionBlockCheck> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const owned = await supabase.from('collections').select('id, name').eq('owner_id', user.id);
  if (owned.error) return { ok: false };
  const rows = (owned.data ?? []) as { id: string; name: string }[];
  if (rows.length === 0) return { ok: true, blocking: [] };

  const members = await supabase
    .from('collection_members')
    .select('collection_id, user_id')
    .in(
      'collection_id',
      rows.map((row) => row.id),
    );
  if (members.error) return { ok: false };

  return {
    ok: true,
    blocking: blockingCollections(
      user.id,
      rows,
      (members.data ?? []) as { collection_id: string; user_id: string }[],
    ),
  };
}
