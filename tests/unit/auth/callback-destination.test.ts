/**
 * **The open-redirect refusal, and the two-valued switch that is not a destination.**
 *
 * `/auth/callback` is a redirector reached through a link the visitor was told to trust because it
 * arrived in an email from us. A redirector that takes its destination from its own query string is
 * a phishing primitive, and the page it would send someone away from is the sign-in screen — the
 * worst page in any product to be sent away from.
 *
 * So the property under test is not "hostile input is sanitised". It is stronger and simpler:
 * **every value this function can return is written in this repository.** The tests below feed it
 * the hostile shapes anyway, because a property that is true by construction is worth pinning
 * against the refactor that quietly makes it false.
 */
import { describe, expect, it } from 'vitest';

import {
  callbackCarriesError,
  callbackDestination,
  EXPIRED_STATE,
  RECOVERY_TYPE,
} from '@/app/auth/_lib/callback-destination';
import { NEW_PASSWORD_PATH, RESET_REQUEST_PATH, SIGN_IN_PATH } from '@/app/auth/_lib/routes';
import { DEFAULT_AFTER_SIGN_IN } from '@/domain/auth/return-path';

const params = (query: string) => new URLSearchParams(query);
const INVITE = '/collections/join/0c96cfdb-1111-4222-8333-444455556666';

describe('a recovery link', () => {
  it('lands on the set-a-new-password screen', () => {
    expect(callbackDestination(params(`type=${RECOVERY_TYPE}`), 'exchanged')).toBe(
      NEW_PASSWORD_PATH,
    );
  });

  it('ignores a `next` entirely, even a legitimate one', () => {
    // The recovery destination is a constant, not a choice. A recovery link that could be pointed
    // at an arbitrary allowed path would be a way to spend somebody's one-time code somewhere
    // other than the screen that consumes it.
    expect(callbackDestination(params(`type=recovery&next=${INVITE}`), 'exchanged')).toBe(
      NEW_PASSWORD_PATH,
    );
  });

  it('goes back to the screen that can issue a new one when it has expired', () => {
    expect(callbackDestination(params('type=recovery'), 'failed')).toBe(
      `${RESET_REQUEST_PATH}?state=${EXPIRED_STATE}`,
    );
  });
});

describe('a confirmation link', () => {
  it('returns to the invite the visitor was following', () => {
    expect(callbackDestination(params(`next=${INVITE}`), 'exchanged')).toBe(INVITE);
  });

  it('lands on the map when it was following nothing', () => {
    expect(callbackDestination(params(''), 'exchanged')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('goes to the door when it has expired, because there is no resend to offer', () => {
    expect(callbackDestination(params(''), 'failed')).toBe(
      `${SIGN_IN_PATH}?state=${EXPIRED_STATE}`,
    );
  });
});

describe('it refuses every shape of open redirect', () => {
  it('sends an off-origin `next` to the map instead', () => {
    for (const hostile of [
      'https://evil.io',
      'http://evil.io/collections/join/0c96cfdb-1111-4222-8333-444455556666',
      '//evil.io',
      '//evil.io/collections/join/0c96cfdb-1111-4222-8333-444455556666',
      '/\\evil.io',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'https://p-002-zeta.vercel.app.evil.io/map',
      `https://evil.io${INVITE}`,
    ]) {
      const to = callbackDestination(new URLSearchParams([['next', hostile]]), 'exchanged');
      expect(to).toBe(DEFAULT_AFTER_SIGN_IN);
      // The stronger statement, and the one that survives a change to the allow-list: whatever it
      // returned, it is a path on this origin and it is not the thing it was handed.
      expect(to.startsWith('/')).toBe(true);
      expect(to.startsWith('//')).toBe(false);
      expect(to).not.toContain('evil.io');
    }
  });

  it('refuses a same-origin path nobody chose as a destination', () => {
    // `return-path.ts` is an allow-list of destinations, not a same-origin check. A callback that
    // could land on any route in the product would make that decision for every route added later.
    for (const path of ['/profile', '/collections', '/auth/new-password', '/map/x']) {
      expect(callbackDestination(new URLSearchParams([['next', path]]), 'exchanged'), path).toBe(
        DEFAULT_AFTER_SIGN_IN,
      );
    }
  });

  it('returns to the share seam with its link, which the allow-list gained on 2026-08-31', () => {
    // `/import` was in the list above until the share seam's payload was made to survive sign-in.
    // It matters most *here*: in production, signing up needs an email confirmation, so a
    // first-time user arriving from a share leaves the product entirely and comes back through
    // this route — the longest gap in the flow and the one where the link is most surely gone.
    //
    // The `url` value is attacker-influenced by construction, exactly as it is at `/import?url=`
    // itself, and it is carried rather than judged: `canonicaliseTikTokUrl` is the boundary and it
    // runs on arrival. What this route may never do is leave the origin, which the case above
    // covers for every hostile spelling.
    const REAL = 'https://www.tiktok.com/@joelleuzyel/video/7259010845558983978';
    const to = callbackDestination(
      new URLSearchParams([['next', `/import?url=${encodeURIComponent(REAL)}`]]),
      'exchanged',
    );
    expect(to.startsWith('/import?')).toBe(true);
    expect(new URLSearchParams(to.split('?')[1]).get('url')).toBe(REAL);
  });

  it('cannot be talked into a destination through `type` either', () => {
    // `type` picks between two literals in the module. Anything that is not the marker is a
    // confirmation, including a path-shaped value.
    for (const raw of ['/import', '//evil.io', 'RECOVERY', 'recovery ', '']) {
      expect(callbackDestination(new URLSearchParams([['type', raw]]), 'exchanged')).toBe(
        DEFAULT_AFTER_SIGN_IN,
      );
    }
  });
});

describe('an error handed back by the provider', () => {
  it('is recognised from either field GoTrue uses', () => {
    expect(callbackCarriesError(params('error=access_denied'))).toBe(true);
    expect(callbackCarriesError(params('error_code=otp_expired'))).toBe(true);
    expect(callbackCarriesError(params('error=access_denied&error_code=otp_expired'))).toBe(true);
  });

  it('is not confused with an ordinary callback', () => {
    expect(callbackCarriesError(params('code=abc'))).toBe(false);
    expect(callbackCarriesError(params(`type=${RECOVERY_TYPE}&code=abc`))).toBe(false);
  });
});
