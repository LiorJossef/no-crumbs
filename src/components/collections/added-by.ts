/**
 * "Who put this here" — the pure half of the collection's added-by filter (round 3 §8.1).
 *
 * No React, no DOM, no query. Everything below reads `CollectionDetail` as it already arrives from
 * `app/collections/_lib/get-collections.ts`: `collection_items.added_by` is pinned to `auth.uid()`
 * by `0024`'s insert policy and is already joined to `profiles.display_name`, so this is a filter
 * over data the screen has in hand rather than a second read. **No migration, no policy, no
 * index** — a collection is tens of items, and an index on `added_by` would be a cost paid against
 * a scan that never appears in a plan.
 *
 * It is a file of its own so the grouping and the ordering have a test rather than a code review;
 * `collection-content.tsx` renders what comes out and decides nothing about it.
 */

import { memberLabel } from '@/domain/collections/collection';
import type { CollectionDetail } from '@/app/collections/_lib/get-collections';

/** One person who has put at least one place in this collection. */
export interface Adder {
  /**
   * `collection_items.added_by`, or `null` for an item whose adder is not recorded — `0024` makes
   * the column nullable and a row predating the pin, or one whose member row was hard-deleted,
   * lands here. Kept as its own bucket rather than folded into somebody else's: an unknown adder
   * is a fact, and attributing those places to a named person would be inventing one.
   */
  readonly userId: string | null;
  /** What the chip says. `You` for the viewer, the display name for anybody else. */
  readonly label: string;
  /** How many places in this collection they put here. */
  readonly count: number;
}

/** The label for the bucket of items with no recorded adder. Not "Unknown" as a person's name —
 *  it describes the places, not the absent person. */
export const NO_ADDER_LABEL = 'Added before we tracked this';

/**
 * Everyone who has added a place, most places first, with the viewer always first among equals.
 *
 * Most-first rather than alphabetical because the filter is a way of narrowing a list you are
 * looking at: the person with eleven places is the one worth a tap. The viewer leads on a tie for
 * the same reason `membersLine` puts them first — a collection you are in that starts with someone
 * else reads like someone else's.
 */
export function addersIn(collection: CollectionDetail, currentUserId: string): readonly Adder[] {
  const counts = new Map<string | null, number>();
  const names = new Map<string | null, string>();

  for (const place of collection.places) {
    const key = place.addedBy;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!names.has(key)) {
      names.set(
        key,
        key === null
          ? NO_ADDER_LABEL
          : memberLabel({ displayName: place.addedByName, isYou: key === currentUserId }),
      );
    }
  }

  return [...counts.entries()]
    .map(([userId, count]) => ({ userId, label: names.get(userId) ?? NO_ADDER_LABEL, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
      return a.label.localeCompare(b.label);
    });
}

/**
 * Whether the filter is worth drawing at all.
 *
 * One adder means every chip says the same thing and the control can only ever be a no-op, so a
 * solo collection — which is most of them — gains no chrome. Two is the first count where the
 * question "who put this here" has an answer that narrows anything.
 */
export function adderFilterIsUseful(adders: readonly Adder[]): boolean {
  return adders.length >= 2;
}
