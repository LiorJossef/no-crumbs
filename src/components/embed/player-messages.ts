/**
 * **Everything the framed player is allowed to tell us, and the closed set of states it can put the
 * panel into.**
 *
 * ## The trust boundary is here
 *
 * A `message` event is the one input on this surface that arrives from code we do not control,
 * running in a document we did not write. Two things follow and both are enforced below:
 *
 *  1. **The origin is checked first and it is an equality**, not a `startsWith`, not an
 *     `includes`, not a regular expression. `https://www.tiktok.com.evil.example` passes every
 *     loose form of that check and fails this one. Any page that ever frames or is framed by this
 *     one can post to `window`, so an unchecked handler is a way for an unrelated frame to drive
 *     this component's state.
 *  2. **The payload is narrowed to primitives before anything reads it.** Nothing here is
 *     rendered — the codes below select one of our own strings from `playback-copy.ts` — so a
 *     hostile message's worst outcome is putting the panel into a state the user could have
 *     reached anyway. That is a property worth keeping rather than one to rely on, which is why
 *     `errorType` (a free string from TikTok) is deliberately **not** part of any state and never
 *     reaches the DOM.
 *
 * **Hand-written rather than a Zod schema, deliberately.** The house rule is that untrusted input
 * is parsed at the boundary, and it is the right rule; this is the case where a schema would be the
 * weaker instrument. The part of this boundary that actually decides safety is `event.origin`,
 * which no payload schema can see, and the payload itself is three fields of primitive type. A
 * schema here would add a library to a leaf client bundle and move the origin check further from
 * the parse it protects.
 *
 * ## The states are ours, not TikTok's
 *
 * TikTok's error table (`docs/evidence/tiktok/raw/10-embed-player-doc-verbatim-2026-08-31.txt`) has
 * four codes across three categories. They collapse into four states because that is how many
 * *different things a user can do about it* — which is the same rule `ui/import/import-error-copy.ts`
 * applies to import failures. `errorType` strings and raw numeric codes stay on this side of the
 * boundary.
 */

import { EMBED_PLAYER_ORIGIN } from './embed-player-url';

/**
 * What the panel is showing. A closed union, exhaustively handled.
 *
 * `blocked` earns its own member rather than folding into `failed` because it is the one failure
 * that is not a failure: the video is fine, the browser declined to start it without a gesture, and
 * the next move is a control already on screen. TikTok shipped a dedicated code for it (3002), so
 * it is a state they expect hosts to have, not an edge case.
 */
export type PlayerState = 'loading' | 'ready' | 'playing' | 'blocked' | 'unavailable' | 'failed';

/** Every message we act on. `onStateChange` values are TikTok's own: `-1` init, `0` ended,
 *  `1` playing, `2` paused, `3` buffering. */
export type PlayerEvent =
  | { kind: 'ready' }
  | { kind: 'state'; state: number }
  | { kind: 'error'; code: number };

/**
 * TikTok's envelope, per the doc: `{ 'x-tiktok-player': boolean, type: string, value: T }`.
 *
 * The `x-tiktok-player` flag is a disambiguator between co-existing embed SDKs on one page, not a
 * security control — anyone can set it. It is checked because a message without it is not for us,
 * and it is not counted as evidence of anything.
 */
function isEnvelope(data: unknown): data is { type: unknown; value: unknown } {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return record['x-tiktok-player'] === true && typeof record['type'] === 'string';
}

/**
 * A `message` event to one of our events, or `null` for *not for us* — which is the overwhelmingly
 * common case on a page that also runs a map, a Supabase client and Next's own dev channel.
 *
 * Takes the two fields it needs rather than a `MessageEvent`, so it is testable in a `node`
 * environment where that class is not constructible with an arbitrary origin.
 */
export function parsePlayerMessage(origin: string, data: unknown): PlayerEvent | null {
  if (origin !== EMBED_PLAYER_ORIGIN) return null;
  if (!isEnvelope(data)) return null;

  const record = data as Record<string, unknown>;
  const type = record['type'] as string;
  const value = record['value'];

  if (type === 'onPlayerReady') return { kind: 'ready' };

  if (type === 'onStateChange' && typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'state', state: value };
  }

  // `onPlayerError` carries `{ errorCode, errorType }`. Only the code is read: `errorType` is a
  // free string chosen by the other side and there is nothing here it could correctly influence.
  if (type === 'onPlayerError' && typeof value === 'object' && value !== null) {
    const code = (value as Record<string, unknown>)['errorCode'];
    if (typeof code === 'number' && Number.isFinite(code)) return { kind: 'error', code };
  }

  return null;
}

/**
 * TikTok's error code to one of ours.
 *
 *  - `1001 INVALID_VIDEO` — the post is gone or the id is wrong. `unavailable`: the one failure
 *    where retrying is pointless and the honest next move is the link to TikTok, which may still
 *    say something useful about why.
 *  - `3002 AUTOPLAY_ERROR` — `blocked`. Not broken; press play.
 *  - `2001 SERVER_ERROR`, `3001 PLAYBACK_ERROR`, and anything TikTok adds later — `failed`.
 *    An unknown code lands here rather than being ignored, because a code we do not recognise is
 *    still a report that something went wrong, and silently staying on `loading` forever is the one
 *    outcome that does look like a broken product.
 */
export function stateForErrorCode(code: number): PlayerState {
  if (code === 1001) return 'unavailable';
  if (code === 3002) return 'blocked';
  return 'failed';
}

/**
 * The state machine, as a reducer over the current state and one event.
 *
 * The rule that is not obvious: **an error is sticky against `onStateChange`, and `blocked` is
 * sticky against everything except playing.** TikTok emits `onStateChange(2)` (paused) alongside a
 * blocked autoplay, and letting that overwrite `blocked` would replace *"press play"* with a paused
 * player and no explanation — the exact "looks broken" outcome. Actual playback clears it, because
 * a video that is playing is not blocked whatever was true a moment ago.
 */
export function nextPlayerState(current: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.kind) {
    case 'error':
      return stateForErrorCode(event.code);
    case 'ready':
      return current === 'loading' ? 'ready' : current;
    case 'state':
      if (event.state === 1) return 'playing';
      if (current === 'unavailable' || current === 'failed' || current === 'blocked') return current;
      // `0` ended, `2` paused, `3` buffering, `-1` init: all of them mean the player is alive and
      // in charge of itself. The panel has nothing to say about any of them, so they all land on
      // the same state and the panel renders no overlay.
      return 'ready';
  }
}

/**
 * How long to wait for `onPlayerReady` before saying so.
 *
 * TikTok's shell declares 22 further scripts (`10` §4.3), so this is not a network round trip's
 * worth of time — it is a full third-party React application's worth. Twelve seconds is long
 * enough that a slow connection is not called a failure and short enough that a request blocked by
 * an extension or a corporate proxy resolves into a sentence rather than a spinner nobody ever
 * comes back to. There is no retry: reloading the frame would repeat the disclosure, and doing that
 * on a timer is the one thing this whole feature is gated to prevent.
 */
export const PLAYER_READY_TIMEOUT_MS = 12_000;
