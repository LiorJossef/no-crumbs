'use server';

/**
 * Every write a collection needs. Same posture as `actions/saved-places.ts`: the caller's own
 * Supabase client, no `user_id` filter anywhere, and authorisation left entirely to the policies in
 * migration `0024`.
 *
 * That posture matters more here than it did there, because these are the first writes in the
 * product that a *second person* can make to an object a *first person* owns. The rule the policies
 * encode, restated so a reader of this file does not have to reconstruct it:
 *
 *  - `owner` — renames, deletes, shares, and changes who else is in.
 *  - `editor` — adds and removes places, and writes the shared note on any of them.
 *  - `viewer` — reads.
 *
 * None of that is re-checked here. A viewer calling `addPlaceToCollection` matches zero rows at the
 * database, whatever this file believes, and the policy test file is where that is asserted. What
 * *is* here is the copy a person sees when it happens, because a client component has to put
 * something on screen — and, following the same reasoning `saved-places.ts` records, the Postgres
 * error text is never part of it.
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/app/_lib/supabase/server';
import {
  isInviteRole,
  validateCollectionDescription,
  validateCollectionName,
  validateItemNote,
  type InviteRole,
} from '@/domain/collections/collection';

export type CollectionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export type CreateCollectionResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly message: string };

const NOT_SIGNED_IN = 'You are signed out. Sign in and try again.';
const NO_ACCESS = "You can't change this collection.";
const GONE = 'That collection is no longer there.';

/** Postgres's unique-violation code. On `collection_items_unique` it means the place is already in
 *  the collection, which is a no-op the user should be told about plainly rather than an error. */
const UNIQUE_VIOLATION = '23505';

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createCollection(
  rawName: string,
  rawDescription: string,
): Promise<CreateCollectionResult> {
  const name = validateCollectionName(rawName);
  if (!name.ok) return { ok: false, message: name.message };
  const description = validateCollectionDescription(rawDescription);
  if (!description.ok) return { ok: false, message: description.message };

  const userId = await currentUserId();
  if (!userId) return { ok: false, message: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('collections')
    .insert({ owner_id: userId, name: name.value, description: description.value })
    .select('id')
    .single();

  if (error || !data) {
    console.error('createCollection failed', { code: error?.code });
    return { ok: false, message: "Couldn't create that collection. Try again." };
  }

  // The owner's membership row is created by a trigger, not here — see 0024. Nothing to do.
  revalidatePath('/collections');
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateCollection(
  collectionId: string,
  rawName: string,
  rawDescription: string,
): Promise<CollectionResult> {
  const name = validateCollectionName(rawName);
  if (!name.ok) return { ok: false, message: name.message };
  const description = validateCollectionDescription(rawDescription);
  if (!description.ok) return { ok: false, message: description.message };

  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('collections')
    .update({ name: name.value, description: description.value }, { count: 'exact' })
    .eq('id', collectionId);

  if (error) {
    console.error('updateCollection failed', { collectionId, code: error.code });
    return { ok: false, message: "Couldn't save those changes. Try again." };
  }
  if (count === 0) return { ok: false, message: NO_ACCESS };

  revalidatePath('/collections');
  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

export async function deleteCollection(collectionId: string): Promise<CollectionResult> {
  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('collections')
    .delete({ count: 'exact' })
    .eq('id', collectionId);

  if (error) {
    console.error('deleteCollection failed', { collectionId, code: error.code });
    return { ok: false, message: "Couldn't delete that collection. Try again." };
  }
  if (count === 0) return { ok: false, message: NO_ACCESS };

  revalidatePath('/collections');
  return { ok: true };
}

export type AddToCollectionResult =
  | { readonly ok: true; readonly added: number; readonly alreadyThere: number }
  | { readonly ok: false; readonly message: string };

/**
 * Adds places to a collection, appending them after whatever is already in it.
 *
 * A place that is already in the collection is **not** an error. `collection_items_unique` makes
 * the second insert a `23505`, and the honest reading of that is "it's already on the list" — so
 * the rows are inserted one statement per place and the duplicates are counted rather than
 * aborting the batch. Adding five places of which two were already there adds three and says so.
 *
 * `added_by` is set to the caller because the insert policy requires it: an item's attribution is
 * not something a client may choose.
 */
export async function addPlacesToCollection(
  collectionId: string,
  placeIds: readonly string[],
): Promise<AddToCollectionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: NOT_SIGNED_IN };
  if (placeIds.length === 0) return { ok: true, added: 0, alreadyThere: 0 };

  const supabase = await createClient();

  const { data: last } = await supabase
    .from('collection_items')
    .select('position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: false })
    .limit(1);
  let position = ((last?.[0] as { position: number } | undefined)?.position ?? -1) + 1;

  let added = 0;
  let alreadyThere = 0;

  for (const placeId of placeIds) {
    const { error } = await supabase
      .from('collection_items')
      .insert({ collection_id: collectionId, place_id: placeId, added_by: userId, position });

    if (!error) {
      added += 1;
      position += 1;
      continue;
    }
    if (error.code === UNIQUE_VIOLATION) {
      alreadyThere += 1;
      continue;
    }
    console.error('addPlacesToCollection failed', { collectionId, code: error.code });
    // A policy refusal (no membership, viewer, or a place not in the caller's own library) arrives
    // here as 42501, and there is one honest sentence for all of them.
    return added === 0
      ? { ok: false, message: NO_ACCESS }
      : { ok: true, added, alreadyThere };
  }

  revalidatePath('/map');
  revalidatePath('/collections');
  revalidatePath(`/collections/${collectionId}`);
  return { ok: true, added, alreadyThere };
}

/**
 * Removes a place from a collection by *place* id rather than item id.
 *
 * The picker on `/map` is toggling "is this place in that collection", and it never has an item id
 * in hand — it knows a place and a collection. Matching on the pair is exactly the same delete the
 * item-id version performs; which column identifies the row is not a security boundary here,
 * because `collection_items_delete` is a membership test either way.
 */
export async function removePlaceFromCollection(
  collectionId: string,
  placeId: string,
): Promise<CollectionResult> {
  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('collection_items')
    .delete({ count: 'exact' })
    .eq('collection_id', collectionId)
    .eq('place_id', placeId);

  if (error) {
    console.error('removePlaceFromCollection failed', { collectionId, code: error.code });
    return { ok: false, message: "Couldn't remove that place. Try again." };
  }
  if (count === 0) return { ok: false, message: NO_ACCESS };

  revalidatePath('/map');
  revalidatePath('/collections');
  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

export async function removeCollectionItem(
  collectionId: string,
  itemId: string,
): Promise<CollectionResult> {
  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('collection_items')
    .delete({ count: 'exact' })
    .eq('id', itemId);

  if (error) {
    console.error('removeCollectionItem failed', { itemId, code: error.code });
    return { ok: false, message: "Couldn't remove that place. Try again." };
  }
  if (count === 0) return { ok: false, message: GONE };

  revalidatePath('/collections');
  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/** The shared note on one place in one collection — everybody in the collection sees it, and any
 *  editor may change it. Not to be confused with `saved_places.note`, which is private and stays
 *  that way. */
export async function updateCollectionItemNote(
  collectionId: string,
  itemId: string,
  rawNote: string,
): Promise<CollectionResult> {
  const note = validateItemNote(rawNote);
  if (!note.ok) return { ok: false, message: note.message };

  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('collection_items')
    .update({ note: note.value }, { count: 'exact' })
    .eq('id', itemId);

  if (error) {
    console.error('updateCollectionItemNote failed', { itemId, code: error.code });
    return { ok: false, message: "Couldn't save that note. Try again." };
  }
  if (count === 0) return { ok: false, message: NO_ACCESS };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/**
 * Rewrites the whole order in one pass.
 *
 * A gap-based scheme (insert at the midpoint, renumber only on collision) buys nothing at the size
 * a hand-curated collection actually reaches, and costs a second failure mode. `position` is
 * therefore dense and every move rewrites every row after it — at twenty places that is twenty
 * tiny updates and a list that is always exactly `0..n-1`.
 *
 * Ids the caller does not have access to simply match no row, so a forged list reorders nothing.
 */
export async function reorderCollection(
  collectionId: string,
  itemIdsInOrder: readonly string[],
): Promise<CollectionResult> {
  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  for (const [index, itemId] of itemIdsInOrder.entries()) {
    const { error } = await supabase
      .from('collection_items')
      .update({ position: index })
      .eq('id', itemId)
      .eq('collection_id', collectionId);

    if (error) {
      console.error('reorderCollection failed', { collectionId, itemId, code: error.code });
      return { ok: false, message: "Couldn't save the new order. Try again." };
    }
  }

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

// ── sharing ───────────────────────────────────────────────────────────────────────────────────

export type InviteResult =
  | { readonly ok: true; readonly token: string; readonly role: InviteRole }
  | { readonly ok: false; readonly message: string };

/**
 * Creates a fresh invite link, replacing any previous one for this collection.
 *
 * Replacing rather than accumulating is the product decision: a collection has *one* live link at a
 * time, so "regenerate" and "revoke the old one" are the same gesture and a link the owner has
 * forgotten about cannot still be live. The revoke is a soft one (`revoked_at`), so the row stays
 * as a record that a link existed.
 */
export async function createInvite(
  collectionId: string,
  role: InviteRole,
): Promise<InviteResult> {
  if (!isInviteRole(role)) return { ok: false, message: 'That is not a role we know.' };

  const userId = await currentUserId();
  if (!userId) return { ok: false, message: NOT_SIGNED_IN };

  const supabase = await createClient();

  const revoked = await revokeInvite(collectionId);
  if (!revoked.ok) return revoked;

  const { data, error } = await supabase
    .from('collection_invites')
    .insert({ collection_id: collectionId, role, created_by: userId })
    .select('token, role')
    .single();

  if (error || !data) {
    console.error('createInvite failed', { collectionId, code: error?.code });
    return { ok: false, message: NO_ACCESS };
  }

  revalidatePath(`/collections/${collectionId}`);
  const row = data as { token: string; role: InviteRole };
  return { ok: true, token: row.token, role: row.role };
}

/** Turns off every live link for this collection. Anyone who has already joined stays a member —
 *  removing a person is a separate, deliberate act. */
export async function revokeInvite(collectionId: string): Promise<CollectionResult> {
  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error } = await supabase
    .from('collection_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('collection_id', collectionId)
    .is('revoked_at', null);

  if (error) {
    console.error('revokeInvite failed', { collectionId, code: error.code });
    return { ok: false, message: NO_ACCESS };
  }

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

export type JoinResult =
  | { readonly ok: true; readonly collectionId: string }
  | { readonly ok: false; readonly message: string };

/**
 * Joins the caller to a collection by invite token.
 *
 * The whole check lives in `join_collection_via_token` (SECURITY DEFINER, `0024`) rather than here,
 * because the caller has no read access to `collection_invites` — that is the point. The function
 * fails identically for a token that never existed, one that was revoked and one that expired, so
 * this file must not try to be more helpful than that: a message that told the three apart would
 * turn the endpoint into an oracle for guessed tokens.
 */
export async function joinCollection(token: string): Promise<JoinResult> {
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_collection_via_token', { p_token: token });

  if (error || typeof data !== 'string') {
    console.error('joinCollection failed', { code: error?.code });
    return { ok: false, message: 'That invite link is no longer valid. Ask for a new one.' };
  }

  revalidatePath('/collections');
  return { ok: true, collectionId: data };
}

export async function updateMemberRole(
  collectionId: string,
  userId: string,
  role: InviteRole,
): Promise<CollectionResult> {
  if (!isInviteRole(role)) return { ok: false, message: 'That is not a role we know.' };

  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('collection_members')
    .update({ role }, { count: 'exact' })
    .eq('collection_id', collectionId)
    .eq('user_id', userId);

  if (error) {
    console.error('updateMemberRole failed', { collectionId, code: error.code });
    return { ok: false, message: NO_ACCESS };
  }
  if (count === 0) return { ok: false, message: NO_ACCESS };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/**
 * Removes a member, or — when `userId` is the caller — leaves the collection.
 *
 * One function for both because it is one policy: `role <> 'owner' and (it's you, or you own the
 * collection)`. The owner cannot be removed and cannot leave; their exit is deleting the
 * collection, which is a different and louder act.
 */
export async function removeMember(
  collectionId: string,
  userId: string,
): Promise<CollectionResult> {
  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error, count } = await supabase
    .from('collection_members')
    .delete({ count: 'exact' })
    .eq('collection_id', collectionId)
    .eq('user_id', userId);

  if (error) {
    console.error('removeMember failed', { collectionId, code: error.code });
    return { ok: false, message: NO_ACCESS };
  }
  if (count === 0) return { ok: false, message: NO_ACCESS };

  revalidatePath('/collections');
  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/**
 * Saves a place a collaborator added into the caller's own library.
 *
 * This is the loop that makes a shared collection worth something: someone adds a place, everyone
 * else can take it. It goes through `save_place` with no source id, so the row lands as
 * `origin = 'manual'` — which is true. The place came from a person, not from a TikTok this user
 * imported, and claiming their provenance would be a lie about where the recommendation came from.
 */
export async function saveCollectionPlace(placeId: string): Promise<CollectionResult> {
  const supabase = await createClient();
  if (!(await currentUserId())) return { ok: false, message: NOT_SIGNED_IN };

  const { error } = await supabase.rpc('save_place', { p_place_id: placeId });

  if (error) {
    console.error('saveCollectionPlace failed', { placeId, code: error.code });
    return { ok: false, message: "Couldn't add that to your places. Try again." };
  }

  revalidatePath('/map');
  revalidatePath('/collections');
  return { ok: true };
}

/**
 * Sets the caller's own display name.
 *
 * It lives in this file rather than a new `actions/profile.ts` because collections are the only
 * reason it exists: `profiles.display_name` is null for anyone who signed up through our form, and
 * "added by A collaborator" on every row is the reason to offer the field at all. The UPDATE grant
 * on that one column has been in `0002` since the day it shipped.
 */
export async function updateDisplayName(rawName: string): Promise<CollectionResult> {
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (trimmed.length > 80) return { ok: false, message: 'That name is too long.' };

  const userId = await currentUserId();
  if (!userId) return { ok: false, message: NOT_SIGNED_IN };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed.length === 0 ? null : trimmed })
    .eq('id', userId);

  if (error) {
    console.error('updateDisplayName failed', { code: error.code });
    return { ok: false, message: "Couldn't save that name. Try again." };
  }

  revalidatePath('/collections');
  return { ok: true };
}
