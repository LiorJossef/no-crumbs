/**
 * **Whether this browser has agreed to load TikTok's player, and how that answer is kept.**
 *
 * ## Why there is a stored answer at all
 *
 * `security-ruling-embed-playback-2026-08-31.md` §2 is the specification and §6 items 2–4 are the
 * gate. The short version, because the shape of this module falls straight out of it: the press
 * that mounts the player is also the press that hands TikTok a `ttwid` at **1 year** and a
 * `tt_chain_token` at **180 days**, both `SameSite=None`, plus a ~224 KB device-fingerprint SDK —
 * measured in `docs/evidence/tiktok/10-embed-playback-2026-08-31.md` §4.1–§4.2, on a bare `GET`,
 * before anything plays.
 *
 * **So the cost is front-loaded onto the first press, and that is why this is a stored answer
 * rather than a per-press prompt.** After the first press the identifier already exists and is
 * already TikTok's; a dialog on the tenth press asks for a decision that is no longer being made.
 * The reverse follows too, and it is the half that is easy to soft-pedal: pressing *play here* once
 * is a **standing grant good for up to a year**, not a cost that resets. `playback-copy.ts` says so
 * in the copy, and the honesty of that sentence is a condition of this feature shipping.
 *
 * ## Client-side only, and never a TikTok-set value
 *
 * `localStorage` on **this** origin. §2 names the persistence granularity as client-side per-browser
 * and calls a server-side per-account preference a nicety rather than a condition — and there is a
 * sharper reason not to reach for one: a consent record that needs a migration and a table is a
 * consent record that ships later than the thing it gates. Reading TikTok's own cookie to decide
 * this would be circular, and we could not read it anyway.
 *
 * ## The store shape is `place-order.ts`'s, on purpose
 *
 * Three functions plus a subscribe, for `useSyncExternalStore`, rather than a `useState` seeded in
 * an effect. Same reasoning as `components/sheet/place-order.ts`, and one addition that matters
 * here and not there: **`getServerChoice` returns `null`, so a server render and the hydration pass
 * both see "not asked".** A wrong guess in the other direction would server-render an `<iframe>` —
 * that is, it would make the disclosure before the user had made the choice. The failure direction
 * of this module is *ask again*, never *load anyway*.
 */

/** The two answers. There is no third: "not asked" is `null`, which is deliberately not a member of
 *  this union so that a stored value can never mean *asked and declined to answer*. */
export type PlaybackChoice = 'play-here' | 'open-on-tiktok';

/** What the panel does on a press. `ask` is the first press in a browser; the other two are the
 *  stored answers acted on. Kept as its own type because the panel, the tests and any future caller
 *  should reason about the *behaviour*, not re-derive it from the stored string each time. */
export type PlaybackMode = 'ask' | 'play-here' | 'link-only';

/** Namespaced the way `place-order.ts` namespaces its key: `localStorage` is one flat map shared
 *  with everything else this origin will ever store. */
export const PLAYBACK_CHOICE_STORAGE_KEY = 'no-crumbs.tiktok-playback';

const CHOICES: readonly PlaybackChoice[] = ['play-here', 'open-on-tiktok'];

/** Whether a value off the wire — storage, a future URL param, another tab — is one of the two. */
export function isPlaybackChoice(value: unknown): value is PlaybackChoice {
  return typeof value === 'string' && (CHOICES as readonly string[]).includes(value);
}

/**
 * **What a press does, given what is stored.** The whole decision, in one pure function, so that
 * the gate can be asserted as behaviour rather than read out of a component's JSX.
 *
 * Note what `link-only` is not: it is not a disabled feature. The panel still renders `Play here
 * instead`, because a choice that cannot be revisited is not a preference, it is a trap — in this
 * direction it locks a user out of a feature, and in the other it makes a year-long grant with no
 * way back. Both directions are reachable from the panel and neither needs a settings screen.
 */
export function playbackMode(choice: PlaybackChoice | null): PlaybackMode {
  if (choice === 'play-here') return 'play-here';
  if (choice === 'open-on-tiktok') return 'link-only';
  return 'ask';
}

/**
 * Read a choice out of any `getItem`-shaped thing. Separated from the module store so it is
 * testable without a DOM, and so the `try` has one obvious place to live.
 *
 * Storage throwing is not an error path with a message: private mode, a full quota, storage
 * disabled by policy and a partitioned iframe all surface as a throw, and the right answer to every
 * one of them is **ask**. That is the safe direction — it costs a user one extra tap and it cannot
 * mount a player nobody agreed to.
 */
export function readChoiceFrom(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): PlaybackChoice | null {
  if (storage == null) return null;
  try {
    const stored = storage.getItem(PLAYBACK_CHOICE_STORAGE_KEY);
    return isPlaybackChoice(stored) ? stored : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * The module store. One value, one `Set` of listeners, no React.
 * ------------------------------------------------------------------------ */

let cached: PlaybackChoice | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Cached because `getSnapshot` runs on every render and an uncached `getItem` is a synchronous
 *  read per render. The cache is only ever invalidated by this module's own writers — a second tab
 *  changing its own answer is not news this one has to act on mid-render, and the next full load
 *  picks it up. */
function read(): PlaybackChoice | null {
  if (loaded) return cached;
  loaded = true;
  cached = readChoiceFrom(globalThis.localStorage);
  return cached;
}

/** `useSyncExternalStore`'s subscribe. */
export function subscribeStoredChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoredChoice(): PlaybackChoice | null {
  return read();
}

/** **The server must not guess this.** See the header: a guess in the permissive direction
 *  server-renders the disclosure rather than asking for it. */
export function getServerChoice(): PlaybackChoice | null {
  return null;
}

/** Record an answer. Storage failing does not fail the answer — it applies for this session and
 *  only its memory is lost, which for a *play here* grant is the conservative direction: the next
 *  visit asks again rather than assuming. */
export function setStoredChoice(choice: PlaybackChoice): void {
  cached = choice;
  loaded = true;
  try {
    globalThis.localStorage?.setItem(PLAYBACK_CHOICE_STORAGE_KEY, choice);
  } catch {
    // Applied for this session; not remembered for the next one.
  }
  notify();
}

/**
 * Forget the answer, so the next press asks again.
 *
 * **This revokes our side and nothing else, and the copy must never imply otherwise.** Clearing
 * this key stops future loads of TikTok's player from this product. It does not delete `ttwid`, it
 * does not delete `tt_chain_token`, and it does not unsend a fingerprint that has already run —
 * those are TikTok's, on TikTok's domain, for up to a year. `PLAYBACK_COPY.stopPlayingHere` is
 * worded as *stop* rather than as *undo* for exactly this reason.
 */
export function clearStoredChoice(): void {
  cached = null;
  loaded = true;
  try {
    globalThis.localStorage?.removeItem(PLAYBACK_CHOICE_STORAGE_KEY);
  } catch {
    // Nothing to recover from: the in-memory answer is already cleared.
  }
  notify();
}

/** Test seam. The module-level cache is what makes `getSnapshot` cheap, and it is also what makes
 *  two tests in one process share state; this is the smallest honest way to let a test start from
 *  "nothing read yet". Not called from `src/`. */
export function __resetPlaybackChoiceCacheForTests(): void {
  cached = null;
  loaded = false;
}
