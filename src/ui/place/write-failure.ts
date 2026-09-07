/**
 * **What a saved-place write does when the server never answers.**
 *
 * `app/actions/saved-places.ts` is careful in exactly one direction: every action returns
 * `Promise<SavedPlaceResult>`, every Postgres error becomes `{ ok: false, message }`, and zero
 * matched rows becomes `GONE`. That is failures-as-values, chosen on purpose, and it is right.
 *
 * **A `Result` covers everything the server can *say*. It cannot cover the server not answering.**
 * A Server Action is a `fetch`; when the transport fails there is no result at all — the promise
 * rejects, and a rejection inside `startTransition` is escalated by React to the nearest error
 * boundary. On `/map` that boundary is `app/error.tsx`, which replaces the whole segment: the map,
 * every pin, the place you were looking at, and — on the note path — the sentence you had just
 * typed and not yet saved. Measured 2026-09-01 with `context.setOffline(true)` at 390×844 and
 * 1440×900: three of the five controls in `components/sheet/saved-place-edits.tsx` took the screen
 * from seven pins to zero (`docs/archive/product-review-2026-09-01-r5.md` §2 finding 1).
 *
 * This is a map people use outdoors, on a phone, on cellular. A dead zone, a lift, a tunnel or a
 * handover is not an edge case here; it is the ordinary way a request fails. So silence is not a
 * variant of refusal that deserves a generic message — it is the failure this product has to be
 * good at.
 *
 * ## Why a module and not a `try/catch` at each call site
 *
 * Five call sites got this wrong identically, which makes it a missing rule rather than five
 * oversights. Three things have to travel together for the rule to hold, and only a shared module
 * makes them travel together: the pre-flight reading of `navigator.onLine`, the `catch`, and the
 * distinction between *refused* and *unreachable* that decides what each control does next.
 *
 * `src/app/import/screens/add-by-name.tsx` already had the posture — *"Offline is checked before
 * the request, not after it (§6.7), so an offline submit costs nothing and says the true thing
 * immediately"* — and this is that posture written down once. Its `OFFLINE` string is repeated
 * verbatim below rather than reworded, and `tests/unit/ui/write-failure.test.ts` asserts the two
 * files still agree, because two wordings for one event is how a third gets written
 * (`voice-and-vocabulary.md` §6).
 *
 * ## Why the outcome has three arms and not two
 *
 * A control can revert a state flip it made optimistically, but it cannot un-lose a paragraph. The
 * two failures therefore mean different things to the user and to the component:
 *
 *  - **`refused`** — the server answered, and its answer was no. The news is specific (`GONE`,
 *    `NOT_SIGNED_IN`, a validation message) and the state of the world is settled. A control may
 *    act on it: collapse a confirm step, close an editor, tell the user the row is gone.
 *  - **`unreachable`** — nothing was sent, or nothing came back. **Nothing was written**, the
 *    user's intent is untouched, and the only correct move is to keep everything exactly as it was
 *    so one more press retries it. A control must not tidy up after this.
 *
 * ## Nothing here is optimistic, and that is not what broke
 *
 * It is worth stating because it is the obvious wrong lesson to draw. The five controls are all
 * non-optimistic already — they wait for `revalidatePath('/map')` so the screen can never disagree
 * with the database — and the screen died anyway, because the rejection escaped rather than
 * because a state flip had to be undone. Optimism would not have caused this and removing the
 * `catch` in favour of optimism would not fix it. The rule stays: no optimistic write on this
 * surface, and no unhandled rejection either.
 */

/**
 * The shape every action in `app/actions/saved-places.ts` returns. Restated structurally rather
 * than imported, so this module depends on nothing in `app/` — `SavedPlaceResult` satisfies it by
 * construction, and a second family of actions can adopt the helper without a type import
 * crossing a layer for no reason.
 */
export type ServerAnswer = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** What actually happened, from the caller's point of view. See the header for why three arms. */
export type WriteOutcome =
  | { readonly kind: 'ok' }
  /** The server answered no. `message` is its own words. */
  | { readonly kind: 'refused'; readonly message: string }
  /** The server never answered. Nothing was written and nothing should be tidied away. */
  | { readonly kind: 'unreachable'; readonly message: string };

/**
 * The four strings, and there are four rather than one because *what you typed is still here* is
 * only true where something was typed — promising it on a toggle would be noise, and withholding
 * it on the note is the difference between an error and apparent data loss.
 *
 * Voice (`voice-and-vocabulary.md` §7): each states a fact and stops, none apologises, none blames
 * the user, none names our machinery, and each leaves a next move on screen — literally, since the
 * control that failed is still there and still pressable.
 */
export const WRITE_FAILURE_COPY = {
  /** Read before the request. Verbatim from `add-by-name.tsx`; the test pins them together. */
  offline: 'You’re offline. Check your connection and try again.',
  /** Offline, on a control holding text. The reassurance replaces the instruction: the user can
   *  see their own words in the field, and this says they are safe rather than asking for a retry
   *  that cannot succeed yet. */
  offlineKeepsDraft: 'You’re offline. What you typed is still here.',
  /** The browser believed it was online and the request still did not arrive. */
  unreachable: 'That didn’t reach us. Try again.',
  /** The same, on a control holding text. */
  unreachableKeepsDraft: 'That didn’t reach us. What you typed is still here.',
} as const;

/**
 * `navigator.onLine === false` is the one reading worth acting on. `true` means only that the
 * device has a network interface, never that it can reach us — which is why this is a cheap
 * pre-flight and not the check. The `catch` in `attemptWrite` is the check.
 *
 * Defaults to online when `navigator` is absent (a server render, the test runner's `node`
 * environment): refusing to write because a global is missing would be a worse failure than the
 * one being prevented.
 */
export function isOnline(navigatorLike: { onLine?: boolean } | undefined = globalThis.navigator): boolean {
  return navigatorLike?.onLine !== false;
}

export interface AttemptOptions {
  /**
   * Whether the control holds text the user typed and has not saved. Chooses between the two
   * message pairs above; it does not change behaviour, because *keeping* the draft is the calling
   * component's job — a draft in `useState` survives this function either way, and survives the
   * failure entirely as long as the rejection does not reach the boundary.
   */
  readonly keepsDraft?: boolean;
  /** Injected by the test. Production reads `navigator`. */
  readonly online?: boolean;
}

/**
 * Runs one saved-place write and returns what happened, never throwing.
 *
 * Call it inside `startTransition` in place of a bare `await`. The contract is the whole point: it
 * has no `throw` path, so a rejection cannot escape a transition and reach `app/error.tsx`.
 */
export async function attemptWrite(
  write: () => Promise<ServerAnswer>,
  options: AttemptOptions = {},
): Promise<WriteOutcome> {
  const keepsDraft = options.keepsDraft ?? false;
  const online = options.online ?? isOnline();

  // Before the request, so an offline press costs nothing and says the true thing immediately
  // rather than after a timeout the user spends wondering.
  if (!online) {
    return {
      kind: 'unreachable',
      message: keepsDraft ? WRITE_FAILURE_COPY.offlineKeepsDraft : WRITE_FAILURE_COPY.offline,
    };
  }

  try {
    const answer = await write();
    return answer.ok ? { kind: 'ok' } : { kind: 'refused', message: answer.message };
  } catch (cause) {
    // `warn`, not `error`: a request that did not arrive is news about the network, not a fault in
    // the product, and the browser has already logged the failed fetch itself. One line, so a
    // report of "it said that didn't reach us" is greppable.
    console.warn('[saved place] a write never reached the server', cause);
    return {
      kind: 'unreachable',
      message: keepsDraft
        ? WRITE_FAILURE_COPY.unreachableKeepsDraft
        : WRITE_FAILURE_COPY.unreachable,
    };
  }
}
