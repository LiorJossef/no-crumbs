'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/app/_lib/supabase/server';
import type { BlockingCollection } from '@/app/profile/_lib/blocking-collections';
import { checkDeletionBlocked } from '@/app/profile/_lib/deletion-block';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';

/**
 * Delete this account and everything the schema says belongs to it (`L1-F8-T1`).
 *
 * Built to `docs/overnight-deletion-review.md`, a binding ruling from `security-privacy` written
 * before this file existed. Read §2 and §3 before changing anything here; the design is theirs and
 * the parts that look like belt-and-braces are not.
 *
 * ## The signature is the authorisation boundary
 *
 * **This action takes no user-identifying parameter, and the review vetoes any version that does.**
 * `serviceRoleClient()` is a cached module-level singleton whose `auth.admin.deleteUser(id)` will
 * delete *any account in the project*, and a Next.js Server Action is a POST endpoint reachable by
 * anyone who can guess its id. The `getUser()` call below is the entire thing standing between
 * those two facts. An action shaped `deleteAccount(userId)` would make that boundary a caller's
 * promise instead of this function's own guarantee.
 *
 * ## Why steps 3 and 4 exist
 *
 * Between a single pre-check and the delete there is a real race: a stranger holding an outstanding
 * invite token can call `join_collection_via_token` and become a live member of a collection the
 * check just cleared — turning a legitimate solo deletion into the destruction of somebody else's
 * data, milliseconds after we verified it would not be. Revoking every outstanding invite first and
 * re-checking afterwards closes that window using grants the user already holds
 * (`grant update (revoked_at)`, `0024:429`; `collection_invites_update_owner`, `0024:442`).
 *
 * It narrows the race rather than eliminating it. The database-level version is a `BEFORE DELETE`
 * trigger on `profiles`, which needs a migration; the review sizes it as M2 and the run forbids it.
 *
 * ## What is not here, deliberately
 *
 * **No cleanup statements.** Everything goes by foreign-key cascade from `auth.users` — the
 * library, every import including its `candidates` jsonb, provenance links, owned collections and
 * their children, memberships, invites. An application-level pre-delete sweep would be a second,
 * drifting definition of "the user's data" alongside the FK graph, and the FK graph is the one
 * Postgres actually obeys.
 *
 * **One thing survives and the copy must never claim otherwise** (review §4.2): a note the user
 * wrote on an item in *somebody else's* shared collection. `collection_items.added_by` is
 * `on delete set null`, so the item stays on that person's list with the attribution stripped. That
 * is the GDPR Art. 17 balance `0024` wrote into the DDL, and it is why no string in this flow says
 * everything you wrote is gone.
 */

export type DeleteAccountResult =
  /** The refusal. Never partial: nothing has been deleted and nothing has been revoked. */
  | { readonly ok: false; readonly reason: 'blocked'; readonly collections: readonly BlockingCollection[] }
  | { readonly ok: false; readonly reason: 'failed'; readonly message: string };

/** The one failure string a user sees, from `overnight-copy-deck.md` §5.2 C149. */
const FAILED = "Couldn’t delete your account. Try again in a moment.";

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Not a friendly message: an unauthenticated caller is not a user having a bad time, it is a POST
  // to an action id. `proxy.ts` already sends a signed-out visitor to `/sign-in`.
  if (!user) return { ok: false, reason: 'failed', message: FAILED };

  const before = await checkDeletionBlocked();
  // `ok: false` is "we could not tell", and it fails closed. A read that failed is never permission
  // to delete.
  if (!before.ok) return { ok: false, reason: 'failed', message: FAILED };
  if (before.blocking.length > 0) {
    return { ok: false, reason: 'blocked', collections: before.blocking };
  }

  // Every collection the user owns — solo, by definition of the check above. Revoking their
  // outstanding invites is what stops a stranger joining one between here and the delete.
  const owned = await supabase.from('collections').select('id').eq('owner_id', user.id);
  if (owned.error) return { ok: false, reason: 'failed', message: FAILED };
  const ownedIds = ((owned.data ?? []) as { id: string }[]).map((row) => row.id);

  if (ownedIds.length > 0) {
    const revoked = await supabase
      .from('collection_invites')
      .update({ revoked_at: new Date().toISOString() })
      .in('collection_id', ownedIds)
      .is('revoked_at', null);
    if (revoked.error) return { ok: false, reason: 'failed', message: FAILED };
  }

  // The same check again, after the door is shut. If somebody got in during the window above, this
  // is where it is caught and the deletion does not happen.
  const after = await checkDeletionBlocked();
  if (!after.ok) return { ok: false, reason: 'failed', message: FAILED };
  if (after.blocking.length > 0) {
    return { ok: false, reason: 'blocked', collections: after.blocking };
  }

  const deleted = await serviceRoleClient().auth.admin.deleteUser(user.id);
  if (deleted.error) {
    // The Postgres or GoTrue text is never part of what a person reads — the same rule
    // `actions/saved-places.ts` records. It is logged so a report can be matched to it.
    console.error('[account] deleteUser failed', { code: deleted.error.status });
    return { ok: false, reason: 'failed', message: FAILED };
  }

  try {
    // `scope: 'local'`, because the account no longer exists and a network logout would fail
    // against it. Wrapped anyway: a failure here must not leave the account deleted and the user
    // looking at an error about it.
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* the cookies are stale either way; the redirect below lands on a signed-out surface */
  }

  // Outside every `try`: `redirect` signals by throwing, and catching it would swallow the
  // navigation and leave a deleted user on the profile page.
  redirect('/');
}
