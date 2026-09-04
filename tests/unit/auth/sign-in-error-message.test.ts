/**
 * **The sign-in screen's error mapping is a closed set, and this file is what makes that a fact.**
 *
 * The mapping used to end with `default: error.message`, filtered by a `/phone/i` test — a patch on
 * the one leak somebody had seen rather than a boundary. `auth-error-message.ts`'s header carries
 * the argument; what is asserted here is the property that argument claims:
 *
 *   1. **Nothing outside `SIGN_IN_ERROR_COPY` can be returned**, for any input, in either mode.
 *   2. **The provider's own text never survives** — including when it is a phone mention, a
 *      database error, an internal identifier or an outright injection attempt.
 *   3. **The mapped cases keep their distinct meanings**, so the leak was not traded for a screen
 *      that says one useless thing about every failure.
 *   4. **The strings obey `voice-and-vocabulary.md`** — no exclamation, no banned word, no provider
 *      vocabulary, no brand name, and every one of them offers a next move.
 *
 * `AuthError`'s constructor is not part of the SDK's public surface, so the fixtures are plain
 * objects shaped like one. That is what the runtime actually receives after a JSON error response
 * is deserialised, and the mapper reads exactly three fields off it — `name`, `code`, `message` is
 * never read at all, which is the whole point.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AuthError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  authErrorMessage,
  isRecognisedAuthError,
  SIGN_IN_ERROR_COPY,
  SIGN_IN_ERROR_STRINGS,
} from '@/app/sign-in/auth-error-message';
import type { Mode } from '@/app/sign-in/mode';

const MODES: Mode[] = ['sign-in', 'sign-up'];

/** What the SDK hands the screen: a name, a status, an optional code, and a message we never read. */
const authError = (
  code: string | undefined,
  message = 'a provider string that must never be shown',
  name = 'AuthApiError',
): AuthError => ({ name, message, status: 400, code }) as unknown as AuthError;

describe('every failure resolves to a sentence written in this repository', () => {
  const HOSTILE: ReadonlyArray<[string, AuthError]> = [
    ['an unknown code', authError('mfa_challenge_expired')],
    ['no code at all', authError(undefined)],
    ['an empty code', authError('')],
    ['a code that is not a string', authError(42 as unknown as string)],
    [
      'a message naming an auth mechanism this product does not offer',
      authError('phone_exists', 'A user with this phone number has already been registered'),
    ],
    [
      'a message disclosing which half was wrong',
      authError('unexpected_failure', 'Password for user 8f3c-… did not match the stored hash'),
    ],
    [
      'a message carrying an internal identifier',
      authError('unexpected_failure', 'Database error querying schema: relation auth.users'),
    ],
    ['a message that is markup', authError('unexpected_failure', '<img src=x onerror=alert(1)>')],
    ['a request that never completed', authError(undefined, 'Failed to fetch', 'AuthRetryableFetchError')],
  ];

  for (const [label, error] of HOSTILE) {
    for (const mode of MODES) {
      it(`${label}, on ${mode}, lands on a written string`, () => {
        const shown = authErrorMessage(error, mode);
        expect(SIGN_IN_ERROR_STRINGS).toContain(shown);
        expect(shown).not.toContain(error.message);
      });
    }
  }

  it('the unknown-code fallback is the written fallback, not the provider string', () => {
    expect(authErrorMessage(authError('some_future_code'), 'sign-in')).toBe(
      SIGN_IN_ERROR_COPY.unknown,
    );
    expect(authErrorMessage(authError('some_future_code'), 'sign-up')).toBe(
      SIGN_IN_ERROR_COPY.unknownSignUp,
    );
  });

  it('never mentions a mechanism this product does not offer', () => {
    // The original defect, stated as a test: one real Supabase failure said `phone` on a product
    // with no phone auth, and the patch was a regex on that one word.
    for (const string of SIGN_IN_ERROR_STRINGS) {
      expect(string).not.toMatch(/phone|magic link|one-time|sso|provider/i);
    }
  });
});

describe('the mapped cases keep their meaning', () => {
  it('a wrong password still reads as a wrong password', () => {
    expect(authErrorMessage(authError('invalid_credentials'), 'sign-in')).toBe(
      SIGN_IN_ERROR_COPY.noMatch,
    );
  });

  it('a rate limit still tells the user to wait', () => {
    for (const code of ['over_request_rate_limit', 'over_email_send_rate_limit']) {
      expect(authErrorMessage(authError(code), 'sign-in')).toBe(SIGN_IN_ERROR_COPY.rateLimited);
    }
  });

  it('a short password still names the rule', () => {
    expect(authErrorMessage(authError('weak_password'), 'sign-up')).toBe(
      SIGN_IN_ERROR_COPY.weakPassword,
    );
    expect(SIGN_IN_ERROR_COPY.weakPassword).toContain('6');
  });

  it('an empty field asks for the fields rather than repeating the provider', () => {
    // Supabase answers `validation_failed` with "Missing email or phone" here, because the form is
    // `noValidate` and an empty field reaches the server.
    expect(authErrorMessage(authError('validation_failed', 'Missing email or phone'), 'sign-in')).toBe(
      SIGN_IN_ERROR_COPY.missingFields,
    );
  });

  it('an existing account is sent to the other side of the toggle', () => {
    for (const code of ['user_already_exists', 'email_exists', 'identity_already_exists']) {
      expect(authErrorMessage(authError(code), 'sign-up')).toBe(SIGN_IN_ERROR_COPY.accountExists);
    }
  });

  it('an unconfirmed address says what to open', () => {
    expect(authErrorMessage(authError('email_not_confirmed'), 'sign-in')).toBe(
      SIGN_IN_ERROR_COPY.confirmEmail,
    );
  });

  it('closed sign-ups say so, because production has them closed', () => {
    for (const code of ['signup_disabled', 'email_provider_disabled', 'provider_disabled']) {
      expect(authErrorMessage(authError(code), 'sign-up')).toBe(SIGN_IN_ERROR_COPY.signUpClosed);
    }
  });

  it('a request that never completed points at the connection', () => {
    // Driven against the running app: an offline browser and a provider 5xx both arrive as this
    // class with no code, which is why one sentence covers both.
    const offline = authError(undefined, 'Failed to fetch', 'AuthRetryableFetchError');
    expect(authErrorMessage(offline, 'sign-in')).toBe(SIGN_IN_ERROR_COPY.unreachable);
  });

  it('distinct failures produce distinct sentences', () => {
    // The other way to lose: one string for everything is not a leak, it is a dead end.
    const shown = [
      'invalid_credentials',
      'weak_password',
      'over_request_rate_limit',
      'validation_failed',
      'email_not_confirmed',
    ].map((code) => authErrorMessage(authError(code), 'sign-in'));
    expect(new Set(shown).size).toBe(shown.length);
  });
});

describe('account enumeration', () => {
  it('never names which of email or password was wrong', () => {
    for (const string of [SIGN_IN_ERROR_COPY.noMatch, SIGN_IN_ERROR_COPY.unknown]) {
      expect(string).toMatch(/email.+password/i);
    }
  });

  it('a missing user is the same sentence as a wrong password on sign-in', () => {
    // Otherwise this screen becomes a way to test whether a given person uses this product.
    expect(authErrorMessage(authError('user_not_found'), 'sign-in')).toBe(
      authErrorMessage(authError('invalid_credentials'), 'sign-in'),
    );
  });
});

describe('the diagnostic', () => {
  it('marks an unmapped failure so a developer can find it', () => {
    expect(isRecognisedAuthError(authError('invalid_credentials'), 'sign-in')).toBe(true);
    expect(isRecognisedAuthError(authError('a_code_nobody_wrote'), 'sign-in')).toBe(false);
    expect(isRecognisedAuthError(authError(undefined, 'Failed to fetch', 'AuthRetryableFetchError'), 'sign-in')).toBe(
      true,
    );
  });
});

describe('voice and vocabulary', () => {
  it('has no exclamation marks and is sentence case', () => {
    for (const string of SIGN_IN_ERROR_STRINGS) {
      expect(string).not.toContain('!');
      expect(string[0]).toBe(string[0]?.toUpperCase());
    }
  });

  it('uses no banned or provider word', () => {
    // `voice-and-vocabulary.md` §4's list, plus the four words a provider's error catalogue reaches
    // for that mean nothing to a person at a door.
    const banned =
      /\b(metadata|LLM|AI|model|geocode|extraction|pipeline|parse|API|endpoint|payload|token|job|worker|oops|something went wrong|session|credentials|auth|instance|invalid request|unexpected)\b/i;
    for (const string of SIGN_IN_ERROR_STRINGS) {
      expect(string).not.toMatch(banned);
    }
  });

  it('never carries the product name', () => {
    // §2: six surfaces may say it, and a failure string is explicitly not one of them.
    for (const string of SIGN_IN_ERROR_STRINGS) {
      expect(string).not.toMatch(/no crumbs|crumb/i);
    }
  });

  it('offers a next move in every sentence', () => {
    /*
     * §7 rule 4. Every string names an action, names the wait that ends it, or names the field to
     * correct — and the third of those is why `email or password` is in this pattern rather than
     * being an exemption. `noMatch` ships as one clause on purpose: it is the
     * account-enumeration decision (see the module header), the form it sits under is still
     * filled in and still submittable, and the two fields it names are the correction. A
     * `Try again.` appended to it would be a second clause saying what the button already says.
     */
    const nextMove =
      /try again|sign(ing)? in|check|enter|choose|give it a few minutes|closed right now|email or password/i;
    for (const string of SIGN_IN_ERROR_STRINGS) {
      expect(string).toMatch(nextMove);
    }
  });
});

/**
 * **The source guard, which is the half a mapping test cannot cover.**
 *
 * `recovery-flow.test.ts` already reads `reset-client.tsx` and `new-password-client.tsx` and
 * refuses `error.message` in either — and that is exactly why those two screens never had this
 * defect while the sign-in screen did. The mapping above proves the function is closed; only the
 * text can prove the component still calls it, and that a future edit has not reopened the channel
 * beside it.
 *
 * Comments are blanked first, for the reason `recovery-flow.test.ts` gives at length: the clearest
 * thing a comment can say about a thing that must not be written is its name, and this file's
 * sibling module spends a paragraph on `error.message` explaining why it is never shown.
 */
const withoutComments = (source: string): string => {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (match, before: string) => before + blank(match.slice(before.length)));
};

describe('the sign-in client itself', () => {
  const source = withoutComments(
    readFileSync(
      fileURLToPath(new URL('../../../src/app/sign-in/sign-in-client.tsx', import.meta.url)),
      'utf8',
    ),
  );

  it('never puts a provider string into the message state', () => {
    expect(source).not.toMatch(/setMessage\([^)]*error\.message/);
    expect(source).not.toMatch(/\{\s*error\.message\s*\}/);
  });

  it('reads `error.message` only into the developer log', () => {
    // The one legitimate use: the record handed to `console.error` for an unmapped failure.
    const uses = source.match(/[^\n]*error\.message[^\n]*/g) ?? [];
    for (const line of uses) expect(line.trim()).toBe('message: error.message,');
  });

  it('carries no message-sniffing filter, which is what the old default arm was', () => {
    // `default: /phone/i.test(error.message) ? … : error.message` — a filter on one known leak.
    expect(source).not.toMatch(/phone/i);
    expect(source).not.toMatch(/error\.message\s*\)/);
  });

  it('shows only what the mapper returns', () => {
    expect(source).toMatch(/setMessage\(authErrorMessage\(error, mode\)\)/);
  });
});
