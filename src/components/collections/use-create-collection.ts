'use client';

/**
 * Creating a collection, as one hook with one caller of the server action.
 *
 * It exists because the gesture now has two entry points and they must not become two behaviours.
 * `/collections` has always had an inline compose row at the bottom of its own list — the "and one
 * more, which you make yourself" shape — and the owner's 2026-08-29 ruling adds a second: the `＋`
 * in `BottomNav` opens a menu whose second option is `Create a collection`, from *any* tab.
 *
 * Two copies of `createCollection(name, '')` would drift on the parts that are easy to forget and
 * invisible when wrong: that the field is trimmed before it is judged empty, that a failure keeps
 * the name so the user does not retype it, and above all that success **navigates into the new
 * collection**. A new empty collection you cannot see is a dead end, and that push is the only
 * thing standing between the user and one.
 *
 * The hook owns the call, the pending flag and the error. It does not own a field, a form or a
 * submit button — those differ between a row in a list and a pane in a sheet, and unifying them
 * would be unifying the wrong layer.
 */

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { createCollection } from '@/app/actions/collections';
import { collectionsHref } from '@/app/collections/_lib/drawer-view';

export interface CreateCollectionState {
  /** In flight. Both callers disable their submit on it. */
  readonly pending: boolean;
  /** The server's message, verbatim, or `null`. Never a message this hook invented. */
  readonly error: string | null;
  /**
   * Create it and, on success, navigate into it.
   *
   * Resolves `true` when the collection was created, so a caller that has its own surface to close
   * — the sheet — can close it, while the caller that is already on the destination page does not
   * have to care. A rejected name resolves `false` with `error` set.
   */
  readonly create: (name: string) => Promise<boolean>;
  /** Drop a stale message, e.g. when the user edits the field again or reopens the surface. */
  readonly clearError: () => void;
}

export function useCreateCollection(): CreateCollectionState {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = useCallback(
    (name: string) =>
      new Promise<boolean>((resolve) => {
        setError(null);
        startTransition(async () => {
          // Trimmed here rather than in each caller: `'  '` is an empty name, and a control that
          // judged emptiness on the raw string would enable itself on whitespace.
          const result = await createCollection(name.trim(), '');
          if (!result.ok) {
            setError(result.message);
            resolve(false);
            return;
          }
          // **The canonical URL, not the `/collections/<id>` shim.** The path form still resolves —
          // it is a permanent redirect — but each leg of that round trip is a *segment* change, and
          // a segment change unmounts the drawer: the sheet is destroyed and rebuilt twice on the
          // way into a collection you just made. `collectionsHref` owns the URL shape
          // (`app/collections/_lib/drawer-view.ts`), so this cannot drift from the row that links
          // to the same place.
          router.push(collectionsHref({ kind: 'collection', id: result.id }) as '/collections');
          resolve(true);
        });
      }),
    [router],
  );

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, create, clearError };
}
