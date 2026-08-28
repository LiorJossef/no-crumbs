'use client';

/**
 * The caller's collections, made available to any place-detail surface without threading props
 * through the map.
 *
 * Same argument `TagFilterContext` records: `PlaceDetail` renders in three trees — the mobile
 * sheet, the desktop panel, and the map's own pin-anchored popover — and the third is inside
 * `components/map/**`, a surface whose job is cameras and pins. Threading a collections prop
 * through it would make the map know what a collection is. A context does not.
 *
 * `null` is a real value here, not "not loaded": a surface rendered outside a provider (a test, a
 * future host) simply shows no collections control, rather than crashing or showing an empty one.
 */

import { createContext, use } from 'react';
import type { EditableCollection } from '@/app/collections/_lib/get-collections';

export interface CollectionsForPlace {
  readonly collections: readonly EditableCollection[];
  /** place id → the collection ids it is already in. Read-only snapshot from the server; the
   *  picker writes optimistically over it and revalidation replaces it. */
  readonly byPlaceId: Readonly<Record<string, readonly string[]>>;
}

export const CollectionsContext = createContext<CollectionsForPlace | null>(null);

export function useCollections(): CollectionsForPlace | null {
  return use(CollectionsContext);
}

/**
 * What the control that opens the picker says. Names the collection when there is exactly one,
 * because at one the name *is* the information; beyond that a name plus "+2" is a truncation
 * problem for no gain.
 *
 * Returned in two parts rather than as one string. The name is user-authored and often Hebrew, and
 * `In מסעדות טובות` built by interpolation puts the word and the name in a single bidi run — the
 * renderer isolates the name in its own `<bdi>` instead, which it can only do if the two arrive
 * separately.
 */
export function addToCollectionLabel(
  names: readonly string[],
): { readonly text: string; readonly name?: string } {
  if (names.length === 0) return { text: 'Add to a collection' };
  if (names.length === 1) return { text: 'In', ...(names[0] ? { name: names[0] } : {}) };
  return { text: `In ${names.length} collections` };
}
