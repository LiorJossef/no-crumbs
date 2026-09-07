/**
 * The rule that decides whether an account can be deleted, with the database taken out of it.
 *
 * **A collection blocks deletion exactly when the user owns it and somebody else is live in it.**
 *
 * This file carries no `server-only` and imports nothing, deliberately: it is the one piece of
 * `L1-F8-T1` a unit test can drive, and it is the piece that matters most.
 * `collections.owner_id` is `references public.profiles (id) on delete cascade` (`0024:92`), and a
 * foreign-key referential action is executed by the system — RLS, `FORCE ROW LEVEL SECURITY` and
 * column grants do not constrain it. So this function is the whole of what stands between "delete
 * my account" and a cascade that takes a shared collection away from every member of it. The query
 * that feeds it is in `./deletion-block.ts`; the ruling it implements is
 * `docs/archive/overnight-deletion-review.md` §2.
 */

export interface BlockingCollection {
  readonly id: string;
  readonly name: string;
  /** Live members other than the owner. At least 1, or it would not be blocking. */
  readonly otherMemberCount: number;
}

/**
 * `members` is expected to be live rows only: `collection_members_select_member` (`0026:210`)
 * carries `removed_at is null`, so a departed member's tombstone never reaches here and does not
 * block. Filtering again in application code would be redundant rather than wrong.
 */
export function blockingCollections(
  userId: string,
  owned: readonly { readonly id: string; readonly name: string }[],
  members: readonly { readonly collection_id: string; readonly user_id: string }[],
): readonly BlockingCollection[] {
  const others = new Map<string, number>();
  for (const row of members) {
    // The owner is always a member of their own collection — the `collections_owner_membership`
    // AFTER INSERT trigger (`0024:290`) — so their own row is always present and is never what
    // makes a collection shared.
    if (row.user_id === userId) continue;
    others.set(row.collection_id, (others.get(row.collection_id) ?? 0) + 1);
  }

  return owned
    .filter((row) => (others.get(row.id) ?? 0) > 0)
    .map((row) => ({ id: row.id, name: row.name, otherMemberCount: others.get(row.id) ?? 0 }));
}
