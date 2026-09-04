/**
 * **The consent gate's behaviour**, which is acceptance items 2 and 4 of
 * `docs/security-ruling-embed-playback-2026-08-31.md` §6 — the two that are about *when the
 * question is asked*, as opposed to what it says.
 *
 * The reason this is a module with a pure decision function rather than a `useState` inside the
 * panel: a gate you can only verify by rendering a component is a gate a reviewer reads rather than
 * runs. `playbackMode` is the whole rule, and it is three lines.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  PLAYBACK_CHOICE_STORAGE_KEY,
  __resetPlaybackChoiceCacheForTests,
  clearStoredChoice,
  getServerChoice,
  getStoredChoice,
  isPlaybackChoice,
  playbackMode,
  readChoiceFrom,
  setStoredChoice,
  subscribeStoredChoice,
  type PlaybackChoice,
} from '@/components/embed/playback-consent';

/** A `localStorage` stand-in. The `node` test environment has none, which is itself the reason the
 *  module reads through `globalThis.localStorage?` rather than assuming one. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  __resetPlaybackChoiceCacheForTests();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('what a press does', () => {
  /**
   * **Item 2: the first press in a browser asks.** Nothing stored means nothing mounted — the
   * panel's `ask` branch has no iframe in it at all, which `panel-source.test.ts` asserts
   * structurally and the browser trace confirms by counting requests.
   */
  it('asks when nothing is stored', () => {
    expect(playbackMode(null)).toBe('ask');
  });

  /** **Item 4: it is asked at most once per browser.** A stored answer is acted on, not
   *  re-litigated — after the first press the identifier already exists and is already TikTok's, so
   *  a dialog on the tenth press asks for a decision that is no longer being made. */
  it('acts on a stored answer rather than asking again', () => {
    expect(playbackMode('play-here')).toBe('play-here');
    expect(playbackMode('open-on-tiktok')).toBe('link-only');
  });

  /** The failure direction of the whole module. Every unreadable, corrupt or hostile stored value
   *  has to land on `ask`, because the alternative is mounting a player nobody agreed to. */
  it.each([
    ['a value from a newer version', 'play-everywhere'],
    ['an empty string', ''],
    ['a number', 42],
    ['an object', { choice: 'play-here' }],
    ['null', null],
  ])('falls back to asking for %s', (_label, stored) => {
    expect(isPlaybackChoice(stored)).toBe(false);
    expect(playbackMode(isPlaybackChoice(stored) ? stored : null)).toBe('ask');
  });
});

describe('reading the stored answer', () => {
  it('reads either answer back', () => {
    for (const choice of ['play-here', 'open-on-tiktok'] as PlaybackChoice[]) {
      expect(readChoiceFrom(fakeStorage({ [PLAYBACK_CHOICE_STORAGE_KEY]: choice }))).toBe(choice);
    }
  });

  it('ignores a value under any other key', () => {
    expect(readChoiceFrom(fakeStorage({ 'no-crumbs.place-order': 'play-here' }))).toBeNull();
  });

  /**
   * Private mode, a full quota, storage disabled by policy and a partitioned iframe all surface as
   * a throw. The right answer to every one of them is **ask** — one extra tap for the user, and it
   * cannot mount a player nobody agreed to.
   */
  it('asks rather than throwing when storage is unavailable', () => {
    const hostile = {
      getItem() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    };
    expect(readChoiceFrom(hostile)).toBeNull();
    expect(readChoiceFrom(null)).toBeNull();
    expect(readChoiceFrom(undefined)).toBeNull();
  });

  /**
   * **The server must not guess.** A guess in the permissive direction would put an
   * `<iframe src="https://www.tiktok.com/…">` into server-rendered markup — the disclosure made
   * before the user was asked for it. `null` is the only safe server snapshot and it is asserted
   * rather than assumed.
   */
  it('gives the server no answer at all', () => {
    expect(getServerChoice()).toBeNull();
  });
});

describe('the key it is kept under', () => {
  /** §2: client-side, this origin's storage, never a TikTok-set value. Namespaced because
   *  `localStorage` is one flat map shared with everything else this origin stores. */
  it('is namespaced to this product and names no third party', () => {
    expect(PLAYBACK_CHOICE_STORAGE_KEY).toBe('no-crumbs.tiktok-playback');
    expect(PLAYBACK_CHOICE_STORAGE_KEY.startsWith('no-crumbs.')).toBe(true);
  });
});

describe('the store', () => {
  it('writes, reads back and tells its listeners', () => {
    const storage = fakeStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;

    let notified = 0;
    const unsubscribe = subscribeStoredChoice(() => (notified += 1));

    expect(getStoredChoice()).toBeNull();
    setStoredChoice('play-here');
    expect(getStoredChoice()).toBe('play-here');
    expect(storage.map.get(PLAYBACK_CHOICE_STORAGE_KEY)).toBe('play-here');
    expect(notified).toBe(1);

    unsubscribe();
  });

  /**
   * Both directions of the way back. A year-long grant with no revocation and a refusal with no way
   * to change your mind are the same bug seen from two sides, and the panel puts each one press
   * away.
   */
  it('lets either answer be changed to the other, and cleared', () => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage();

    setStoredChoice('open-on-tiktok');
    expect(playbackMode(getStoredChoice())).toBe('link-only');

    setStoredChoice('play-here');
    expect(playbackMode(getStoredChoice())).toBe('play-here');

    clearStoredChoice();
    expect(getStoredChoice()).toBeNull();
    expect(playbackMode(getStoredChoice())).toBe('ask');
  });

  /** A grant that could not be written is not remembered, and the next visit asks again. That is
   *  the conservative direction, and it is what makes a storage failure a non-event rather than an
   *  error to report. */
  it('applies an answer for the session even when storage refuses the write', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem() {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
      removeItem() {},
    };
    expect(() => setStoredChoice('play-here')).not.toThrow();
    expect(getStoredChoice()).toBe('play-here');
  });
});
