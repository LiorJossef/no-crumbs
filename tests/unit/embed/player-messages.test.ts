/**
 * **The trust boundary, and the state machine that keeps a refused autoplay from looking like a
 * bug.**
 *
 * A `message` event is the one input on this surface that arrives from code we do not control. The
 * check that decides safety is the origin equality, and the tests that matter here are the ones
 * that try to get past it.
 */
import { describe, expect, it } from 'vitest';

import { EMBED_PLAYER_ORIGIN } from '@/components/embed/embed-player-url';
import {
  PLAYER_READY_TIMEOUT_MS,
  nextPlayerState,
  parsePlayerMessage,
  stateForErrorCode,
} from '@/components/embed/player-messages';

const ready = { 'x-tiktok-player': true, type: 'onPlayerReady', value: undefined };

describe('the origin check', () => {
  it('accepts the player origin', () => {
    expect(parsePlayerMessage(EMBED_PLAYER_ORIGIN, ready)).toEqual({ kind: 'ready' });
  });

  /**
   * **The reason it is an equality and not a `startsWith`, an `includes` or a regular expression.**
   * Every string below passes at least one of those looser forms and none of them is TikTok. Any
   * page that frames or is framed by this one can post to `window`, so a loose check is a way for
   * an unrelated frame to drive this component's state.
   */
  it.each([
    'https://www.tiktok.com.evil.example',
    'https://www.tiktok.com.evil.example:443',
    'https://evil.example/https://www.tiktok.com',
    'https://wwwXtiktokXcom',
    'http://www.tiktok.com',
    'https://tiktok.com',
    'https://m.tiktok.com',
    'null',
    '',
  ])('refuses %s', (origin) => {
    expect(parsePlayerMessage(origin, ready)).toBeNull();
  });
});

describe('the envelope', () => {
  it('ignores anything without the embed flag', () => {
    expect(parsePlayerMessage(EMBED_PLAYER_ORIGIN, { type: 'onPlayerReady' })).toBeNull();
    expect(
      parsePlayerMessage(EMBED_PLAYER_ORIGIN, { 'x-tiktok-player': 'true', type: 'onPlayerReady' }),
    ).toBeNull();
  });

  /** A page running a map, a Supabase client and Next's own dev channel posts a lot of messages.
   *  Not-for-us is the common case and it has to be silent. */
  it.each([
    ['a string', 'hello'],
    ['null', null],
    ['a number', 7],
    ['an array', [1, 2, 3]],
    ['an unknown type', { 'x-tiktok-player': true, type: 'onSomethingNew', value: 1 }],
  ])('returns null for %s', (_label, data) => {
    expect(parsePlayerMessage(EMBED_PLAYER_ORIGIN, data)).toBeNull();
  });

  it('reads a state change and an error code', () => {
    expect(
      parsePlayerMessage(EMBED_PLAYER_ORIGIN, {
        'x-tiktok-player': true,
        type: 'onStateChange',
        value: 1,
      }),
    ).toEqual({ kind: 'state', state: 1 });

    expect(
      parsePlayerMessage(EMBED_PLAYER_ORIGIN, {
        'x-tiktok-player': true,
        type: 'onPlayerError',
        value: { errorCode: 3002, errorType: 'AUTOPLAY_ERROR' },
      }),
    ).toEqual({ kind: 'error', code: 3002 });
  });

  /**
   * `errorType` is a free string chosen by the other side and there is nothing on this surface it
   * could correctly influence. It is dropped at the parse rather than carried and then not
   * rendered — a value that never enters cannot later be printed by someone who assumed it was
   * safe.
   */
  it('drops the free-text error type entirely', () => {
    const parsed = parsePlayerMessage(EMBED_PLAYER_ORIGIN, {
      'x-tiktok-player': true,
      type: 'onPlayerError',
      value: { errorCode: 3001, errorType: '<img src=x onerror=alert(1)>' },
    });
    expect(parsed).toEqual({ kind: 'error', code: 3001 });
    expect(JSON.stringify(parsed)).not.toContain('img');
  });

  it('refuses a non-finite code or state', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '3002', null]) {
      expect(
        parsePlayerMessage(EMBED_PLAYER_ORIGIN, {
          'x-tiktok-player': true,
          type: 'onPlayerError',
          value: { errorCode: bad },
        }),
      ).toBeNull();
    }
  });
});

describe('TikTok’s four error codes', () => {
  /** From the error table in `raw/10-embed-player-doc-verbatim-2026-08-31.txt`. */
  it('maps each to what the user can do about it', () => {
    expect(stateForErrorCode(1001)).toBe('unavailable'); // INVALID_VIDEO
    expect(stateForErrorCode(2001)).toBe('failed'); // SERVER_ERROR
    expect(stateForErrorCode(3001)).toBe('failed'); // PLAYBACK_ERROR
    expect(stateForErrorCode(3002)).toBe('blocked'); // AUTOPLAY_ERROR
  });

  /** A code we do not recognise is still a report that something went wrong. Ignoring it would
   *  leave the panel on `loading` forever, which is the one outcome that does look broken. */
  it('treats a code it has never seen as a failure rather than as silence', () => {
    expect(stateForErrorCode(4242)).toBe('failed');
    expect(stateForErrorCode(0)).toBe('failed');
  });
});

describe('the state machine', () => {
  it('goes loading → ready → playing', () => {
    expect(nextPlayerState('loading', { kind: 'ready' })).toBe('ready');
    expect(nextPlayerState('ready', { kind: 'state', state: 1 })).toBe('playing');
  });

  /**
   * **The rule that keeps a blocked autoplay legible.** TikTok emits `onStateChange(2)` — paused —
   * alongside a blocked autoplay. Letting that overwrite `blocked` would replace *"press play"*
   * with a paused player and no explanation, which is exactly the "looks broken" outcome the state
   * exists to prevent.
   */
  it('keeps blocked when a paused state arrives after it', () => {
    const blocked = nextPlayerState('ready', { kind: 'error', code: 3002 });
    expect(blocked).toBe('blocked');
    expect(nextPlayerState(blocked, { kind: 'state', state: 2 })).toBe('blocked');
    expect(nextPlayerState(blocked, { kind: 'state', state: 3 })).toBe('blocked');
  });

  /** Actual playback clears it: a video that is playing is not blocked, whatever was true a moment
   *  ago. Without this, pressing TikTok's own play button would leave our instruction on screen. */
  it('clears blocked the moment the video actually plays', () => {
    expect(nextPlayerState('blocked', { kind: 'state', state: 1 })).toBe('playing');
  });

  it('does not let a state change paper over a real failure', () => {
    expect(nextPlayerState('unavailable', { kind: 'state', state: 2 })).toBe('unavailable');
    expect(nextPlayerState('failed', { kind: 'state', state: 0 })).toBe('failed');
  });

  it('lets an error land from any state', () => {
    for (const from of ['loading', 'ready', 'playing'] as const) {
      expect(nextPlayerState(from, { kind: 'error', code: 1001 })).toBe('unavailable');
    }
  });

  /** `onPlayerReady` after the player is already running is a repeat, not a rewind. */
  it('does not rewind a playing player to ready', () => {
    expect(nextPlayerState('playing', { kind: 'ready' })).toBe('playing');
    expect(nextPlayerState('blocked', { kind: 'ready' })).toBe('blocked');
  });
});

describe('the ready timeout', () => {
  /** Long enough that a slow connection is not called a failure — TikTok's shell declares 22
   *  further scripts — and short enough that a blocked request resolves into a sentence rather than
   *  a spinner nobody comes back to. */
  it('is measured in seconds, not milliseconds or minutes', () => {
    expect(PLAYER_READY_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
    expect(PLAYER_READY_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
  });
});
