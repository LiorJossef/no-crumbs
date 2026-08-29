import 'server-only';

/**
 * The two reads the collections surfaces need: the index (every collection I am in) and one
 * collection with its places, its members and — for its owner — its invite link.
 *
 * Colocated with the route for the reason `map/_lib/get-spots.ts` gives: these are two pages' data
 * fetches, not shared infrastructure.
 *
 * ## What is deliberately absent from every select below
 *
 * Nothing from `saved_places`. A collection item points at a `places` row, and migration `0024`
 * opens exactly one new read path (`places_select_if_in_shared_collection`) — so a collaborator
 * gets the shared identity of a place and none of the adder's overlay: not their note, not their
 * tags, not their TikTok, and above all not their `visit_state`. Adding any of those to a select
 * here would fail at the database rather than leak, because no policy grants them; the point of
 * saying it is that nobody should try.
 *
 * The one query below that *does* touch the caller's own library is `savedPlaceIdsFor`, which
 * exists so a collection can say "you have already saved this" about the caller's own rows — the
 * caller's, under `saved_places_select_own`, and nobody else's.
 */

import { createClient } from '@/app/_lib/supabase/server';
import { productCategoryFor, type ProductCategory } from '@/domain/places/product-category';
import type { CollectionRole } from '@/domain/collections/collection';

export interface CollectionSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly role: CollectionRole;
  /** The owner's `profiles.display_name`, for the "From Maya" line on a collection shared with
   *  you. Null when they have not set one — `memberLabel` decides what that reads as. */
  readonly ownerName: string | null;
  readonly placeCount: number;
  readonly memberCount: number;
  /** The **distinct** categories present, most common first, capped at five — the raw material for
   *  the index row's stand-in for a cover image. Distinct rather than one per place: three
   *  restaurants drawn as three identical red bars reads as a rendering bug, while one bar says
   *  the true thing, which is that this collection is restaurants. We store no images and upload
   *  none, so a collection's own contents are the only honest thing to draw it from. */
  readonly categories: readonly ProductCategory[];
  readonly updatedAt: string;
}

export interface CollectionMember {
  readonly userId: string;
  readonly displayName: string | null;
  readonly role: CollectionRole;
  readonly joinedAt: string;
}

export interface CollectionPlace {
  readonly itemId: string;
  readonly placeId: string;
  readonly name: string;
  /** `null` where none of the three claims resolved — the row prints its locality alone and the
   *  pin keeps the house mint. See `productCategoryFor`. */
  readonly category: ProductCategory | null;
  readonly lat: number;
  readonly lng: number;
  readonly addressLine: string | null;
  readonly locality: string | null;
  /** The shared note, written by whoever added the place and editable by any editor. Distinct from
   *  the private note on the adder's own saved place, which never reaches this surface. */
  readonly note: string | null;
  readonly position: number;
  /** Null once the adder has deleted their account (`added_by` is `on delete set null`). */
  readonly addedBy: string | null;
  readonly addedByName: string | null;
  readonly addedAt: string;
  /** Whether the *caller* already has this place in their own library — the only fact about a
   *  private library that appears here, and it is the caller's own. */
  readonly savedByMe: boolean;
}

export interface CollectionInvite {
  readonly token: string;
  readonly role: Exclude<CollectionRole, 'owner'>;
  readonly createdAt: string;
}

export interface CollectionDetail {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly ownerId: string;
  readonly role: CollectionRole;
  readonly members: readonly CollectionMember[];
  readonly places: readonly CollectionPlace[];
  /** Present only for the owner: no other role has a policy that can read a token. */
  readonly invite: CollectionInvite | null;
}

const SUMMARY_SELECT = `
  role,
  collection:collections!collection_members_collection_id_fkey (
    id,
    name,
    description,
    updated_at,
    owner:profiles!collections_owner_id_fkey ( display_name ),
    items:collection_items ( position, place:places ( category, provider_category ) ),
    members:collection_members ( user_id )
  )
`;

interface SummaryRow {
  readonly role: CollectionRole;
  readonly collection: {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly updated_at: string;
    readonly owner: { readonly display_name: string | null } | null;
    readonly items: readonly {
      readonly position: number;
      readonly place: { readonly category: string | null; readonly provider_category: string | null } | null;
    }[];
    readonly members: readonly { readonly user_id: string }[];
  } | null;
}

/**
 * Every collection the caller is a member of — the ones they own and the ones they were invited
 * to, in one list, most recently joined first. Read from `collection_members` rather than from
 * `collections` because membership is the thing that varies per user: a collection's own row says
 * nothing about *my* role in it.
 *
 * The `user_id` filter is a real narrowing, not a redundant guard on top of RLS: the select policy
 * on `collection_members` shows a member every *other* member of the same collection, which is
 * what makes the collaborator list renderable — so without this filter the index would list a
 * collection once per person in it.
 */
export async function getCollections(): Promise<readonly CollectionSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('collection_members')
    .select(SUMMARY_SELECT)
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });

  if (error) throw error;

  return (data as unknown as SummaryRow[])
    .filter((row): row is SummaryRow & { collection: NonNullable<SummaryRow['collection']> } =>
      row.collection !== null,
    )
    .map((row) => {
      const items = row.collection.items.slice().sort((a, b) => a.position - b.position);
      return {
        id: row.collection.id,
        name: row.collection.name,
        description: row.collection.description,
        role: row.role,
        ownerName: row.collection.owner?.display_name ?? null,
        placeCount: items.length,
        memberCount: row.collection.members.length,
        categories: distinctCategoriesByCount(
          items.map((item) =>
            productCategoryFor({
              override: null,
              providerCategory: item.place?.provider_category,
              extractedHint: item.place?.category,
            }),
          ),
        ),
        updatedAt: row.collection.updated_at,
      };
    });
}

/** The collection's category mix: each category once, most common first, at most five. No `+n`
 *  beyond that — the strip is a texture, not a count, and the row's accessible name carries every
 *  fact it cannot. */
function distinctCategoriesByCount(
  all: readonly (ProductCategory | null)[],
): readonly ProductCategory[] {
  const counts = new Map<ProductCategory, number>();
  // An uncategorised place contributes no colour to the strip. The strip is a texture made of
  // facts; the absence of a fact is not one of them.
  for (const category of all) {
    if (category === null) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category]) => category);
}

const DETAIL_SELECT = `
  id,
  name,
  description,
  owner_id,
  members:collection_members ( user_id, role, joined_at, profile:profiles!collection_members_user_id_fkey ( display_name ) ),
  items:collection_items (
    id, place_id, note, position, added_by, created_at,
    place:places ( name, category, provider_category, lat, lng, address_line, locality ),
    adder:profiles!collection_items_added_by_fkey ( display_name )
  )
`;

interface DetailRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly owner_id: string;
  readonly members: readonly {
    readonly user_id: string;
    readonly role: CollectionRole;
    readonly joined_at: string;
    readonly profile: { readonly display_name: string | null } | null;
  }[];
  readonly items: readonly {
    readonly id: string;
    readonly place_id: string;
    readonly note: string | null;
    readonly position: number;
    readonly added_by: string | null;
    readonly created_at: string;
    readonly place: {
      readonly name: string;
      readonly category: string | null;
      readonly provider_category: string | null;
      readonly lat: number;
      readonly lng: number;
      readonly address_line: string | null;
      readonly locality: string | null;
    } | null;
    readonly adder: { readonly display_name: string | null } | null;
  }[];
}

/**
 * One collection, or `null` when the caller is not a member — which is the same answer RLS gives
 * for a collection that does not exist, and deliberately so: an id that returns "not found" for a
 * stranger and "forbidden" for a member is an existence oracle.
 */
export async function getCollection(collectionId: string): Promise<CollectionDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('collections')
    .select(DETAIL_SELECT)
    .eq('id', collectionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as DetailRow;
  const role = row.members.find((member) => member.user_id === user.id)?.role ?? null;
  if (role === null) return null;

  const items = row.items.slice().sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const saved = await savedPlaceIdsFor(items.map((item) => item.place_id));

  const invite = role === 'owner' ? await getActiveInvite(collectionId) : null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    role,
    members: row.members
      .slice()
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((member) => ({
        userId: member.user_id,
        displayName: member.profile?.display_name ?? null,
        role: member.role,
        joinedAt: member.joined_at,
      })),
    places: items.map((item) => ({
      itemId: item.id,
      placeId: item.place_id,
      name: item.place?.name ?? 'A place',
      category: productCategoryFor({
        override: null,
        providerCategory: item.place?.provider_category,
        extractedHint: item.place?.category,
      }),
      lat: item.place?.lat ?? 0,
      lng: item.place?.lng ?? 0,
      addressLine: item.place?.address_line ?? null,
      locality: item.place?.locality ?? null,
      note: item.note,
      position: item.position,
      addedBy: item.added_by,
      addedByName: item.adder?.display_name ?? null,
      addedAt: item.created_at,
      savedByMe: saved.has(item.place_id),
    })),
    invite,
  };
}

/** Which of these places the caller already has in their own library. Their own rows only —
 *  `saved_places_select_own` makes any other answer unreachable. */
async function savedPlaceIdsFor(placeIds: readonly string[]): Promise<ReadonlySet<string>> {
  if (placeIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_places')
    .select('place_id')
    .in('place_id', placeIds as string[]);

  if (error) throw error;
  return new Set((data ?? []).map((row) => (row as { place_id: string }).place_id));
}

/** The newest live invite link, or null. Owner-only by policy, so a non-owner calling this gets an
 *  empty result rather than a token. */
async function getActiveInvite(collectionId: string): Promise<CollectionInvite | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('collection_invites')
    .select('token, role, created_at, expires_at')
    .eq('collection_id', collectionId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = data?.[0] as
    | { token: string; role: 'editor' | 'viewer'; created_at: string; expires_at: string | null }
    | undefined;
  if (!row) return null;
  if (row.expires_at !== null && new Date(row.expires_at) <= new Date()) return null;

  return { token: row.token, role: row.role, createdAt: row.created_at };
}

/** One collection as the "add this place to…" picker needs it: enough to name it, count it, and
 *  write to it. Only collections the caller may actually add to — a viewer-role collection is
 *  absent from the picker rather than present and disabled. */
export interface EditableCollection {
  readonly id: string;
  readonly name: string;
  readonly placeCount: number;
}

export interface CollectionMemberships {
  readonly collections: readonly EditableCollection[];
  /** place id → the ids of the caller's editable collections it is already in. */
  readonly byPlaceId: Readonly<Record<string, readonly string[]>>;
}

/**
 * Everything `/map` needs to answer "which of my collections is this place in?" without a round
 * trip per place: the caller's editable collections, and the full place↔collection map across them.
 *
 * One query, because the whole set is small by construction — a collection is hand-made, and the
 * caller is a member of a handful. If that ever stops being true the fix is a per-place query on
 * open, not a cache; it is not true yet.
 */
export async function getCollectionMemberships(): Promise<CollectionMemberships> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { collections: [], byPlaceId: {} };

  const { data, error } = await supabase
    .from('collection_members')
    .select(
      'role, collection:collections!collection_members_collection_id_fkey ( id, name, items:collection_items ( place_id ) )',
    )
    .eq('user_id', user.id)
    .in('role', ['owner', 'editor'])
    .order('joined_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    collection: { id: string; name: string; items: { place_id: string }[] } | null;
  }[];

  const collections: EditableCollection[] = [];
  const byPlaceId: Record<string, string[]> = {};

  for (const row of rows) {
    if (!row.collection) continue;
    collections.push({
      id: row.collection.id,
      name: row.collection.name,
      placeCount: row.collection.items.length,
    });
    for (const item of row.collection.items) {
      (byPlaceId[item.place_id] ??= []).push(row.collection.id);
    }
  }

  return { collections, byPlaceId };
}
