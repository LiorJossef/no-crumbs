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
 *
 * ## The create is the one write that cannot go through `attemptWrite`
 *
 * `ui/place/write-failure.ts` holds the product's rule for a write whose server never answers, and
 * every reason in its header applies here unchanged: a Server Action is a `fetch`, an offline press
 * rejects rather than resolving, and a rejection inside `startTransition` is escalated to
 * `app/error.tsx` — which on `/map` takes the map, the pins and the sheet with it.
 *
 * What does not apply is its *return* type. `attemptWrite` answers `ok | refused | unreachable` and
 * nothing more, because the five saved-place controls it was written for need nothing more. This
 * one does: `createCollection` resolves `{ ok: true, id }`, and the id is not a detail — it is the
 * push into the new collection, which this module exists to guarantee. Threading it out through a
 * mutable closure so the call could keep the `attemptWrite` shape would be a wrapper whose type
 * lies about what it knows, and would leave an `ok`-with-no-id branch that cannot happen but must
 * still be written. So `attemptCreateCollection` below states the same three arms with a payload on
 * the success one, and reuses the parts that must not fork — the pre-flight and all four strings.
 * `tests/unit/components/create-collection-failure.test.ts` pins the two helpers to the same
 * answers, which is the drift guard the copy would otherwise need.
 */

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { createCollection } from '@/app/actions/collections';
import { collectionHref } from '@/app/map/_lib/drawer-view';
import { WRITE_FAILURE_COPY, isOnline } from '@/ui/place/write-failure';

/** `WriteOutcome` with the new collection's id on the arm that has one. Same three arms, same
 *  meanings — see `write-failure.ts` for why *refused* and *unreachable* are not one thing. */
export type CreateCollectionOutcome =
  | { readonly kind: 'ok'; readonly id: string }
  /** The server answered no: a name it would not take, a signed-out caller. Its own words. */
  | { readonly kind: 'refused'; readonly message: string }
  /** Nothing was sent or nothing came back. **No collection was created**, and the name the user
   *  typed is still in whichever field they typed it into. */
  | { readonly kind: 'unreachable'; readonly message: string };

/**
 * Creates a collection and never throws.
 *
 * There is no `keepsDraft` option because there is no call site that would pass `false`: creating a
 * collection *is* a form holding a name somebody typed, in both entry points and in the picker's
 * compose row, so the reassurance is always the true thing to say and the plain pair would be
 * withholding it. That is the note case from the saved-place pass in another flow — the failure a
 * user reads as "my words are gone" is the one worth spending a sentence on.
 *
 * Exported alongside the hook rather than living inside it: the picker in `add-to-collection.tsx`
 * creates a collection *and adds a place to it*, so it cannot use the hook (which navigates), but
 * it must not fork the trimming or the failure handling either.
 */
export async function attemptCreateCollection(
  rawName: string,
  /** `online` is injected by the test; production reads `navigator`. */
  options: { readonly online?: boolean } = {},
): Promise<CreateCollectionOutcome> {
  // Before the request, so an offline press costs nothing and says the true thing immediately.
  // `navigator.onLine === false` is the only reading worth acting on; the `catch` is the check.
  if (!(options.online ?? isOnline())) {
    return { kind: 'unreachable', message: WRITE_FAILURE_COPY.offlineKeepsDraft };
  }

  try {
    // Trimmed here rather than in each caller: `'  '` is an empty name, and a control that judged
    // emptiness on the raw string would enable itself on whitespace.
    const result = await createCollection(rawName.trim(), '');
    return result.ok ? { kind: 'ok', id: result.id } : { kind: 'refused', message: result.message };
  } catch (cause) {
    // `warn`, not `error`, and one line — same reasoning as `attemptWrite`: a request that did not
    // arrive is news about the network, and the browser has already logged the failed fetch.
    console.warn('[collection] a create never reached the server', cause);
    return { kind: 'unreachable', message: WRITE_FAILURE_COPY.unreachableKeepsDraft };
  }
}

export interface CreateCollectionState {
  /** In flight. Both callers disable their submit on it. */
  readonly pending: boolean;
  /** What went wrong, or `null`: the server's own words when it refused, and the shared offline
   *  wording from `write-failure.ts` when it never answered. Never a message invented here. */
  readonly error: string | null;
  /**
   * Create it and, on success, navigate into it.
   *
   * Resolves `true` when the collection was created, so a caller that has its own surface to close
   * — the sheet — can close it, while the caller that is already on the destination page does not
   * have to care. A rejected name resolves `false` with `error` set, and so does a create that
   * never reached the server — the caller keeps its field either way, because in neither case does
   * a collection exist to navigate into.
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
          const outcome = await attemptCreateCollection(name);
          if (outcome.kind !== 'ok') {
            // Both failures land here identically, and that is the right amount of difference for
            // this hook: it owns no field, so there is nothing for it to tidy away or keep. What
            // keeps the name is `resolve(false)` — both callers hold their own `name` state and
            // neither clears it on a `false` — plus the fact that this can no longer reject, so the
            // segment carrying the field is not torn down around it.
            setError(outcome.message);
            resolve(false);
            return;
          }
          // **The canonical URL, not the `/collections/<id>` shim.** The path form still resolves —
          // it is a permanent redirect — but each leg of that round trip is a *segment* change, and
          // a segment change unmounts the drawer: the sheet is destroyed and rebuilt twice on the
          // way into a collection you just made. `collectionsHref` owns the URL shape
          // (`app/collections/_lib/drawer-view.ts`), so this cannot drift from the row that links
          // to the same place.
          router.push(collectionHref(outcome.id) as '/map');
          resolve(true);
        });
      }),
    [router],
  );

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, create, clearError };
}
