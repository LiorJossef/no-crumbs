/**
 * **Supabase's failures → this product's sentences, as a closed set.**
 *
 * ## The defect this file exists to close
 *
 * The mapping used to live inline in `sign-in-client.tsx` and ended with `default: error.message` —
 * guarded by a `/phone/i` test on the way past. That guard is the tell: the product already knew
 * about **one** leak, because a real Supabase failure said *phone* on a product that has never
 * offered phone auth, and somebody patched that single case. A filter on one known string is not a
 * boundary. Everything else in the provider's error catalogue still had a straight line to the
 * screen, and nobody has enumerated that catalogue — nobody can.
 *
 * A provider's error text is written for whoever integrated the SDK, not for the person at the
 * door. Left to pass through, it can name authentication mechanisms this product does not offer,
 * say which half of an email-or-password pair was wrong, imply whether an account exists, or carry
 * an internal identifier, a status line or a rate-limit detail. So the default is inverted here:
 * **an unrecognised failure lands on a sentence written in this file, and `error.message` has no
 * path to the UI at all.**
 *
 * ## Two properties, and the second is the one people get wrong
 *
 * **Every string is written here.** `authErrorMessage` returns a member of `SIGN_IN_ERROR_COPY` for
 * every input, including inputs nobody has seen. `tests/unit/auth/sign-in-error-message.test.ts`
 * asserts exactly that against invented codes and hostile messages.
 *
 * **The mapped cases keep their meaning.** Collapsing every failure into one line trades a leak for
 * a dead end: a wrong password must still read as a wrong password, and a rate limit must still say
 * *wait*. §7 rule 4 of `voice-and-vocabulary.md` — a failure offers the next move — is the reason
 * the set has eleven entries rather than one.
 *
 * ## What the copy deliberately does not say
 *
 * `invalid_credentials` answers **"That email or password doesn't match an account."** and names
 * neither half. That is an account-enumeration decision, not a phrasing accident: a screen that
 * distinguishes *no such account* from *wrong password* is a way to test whether a given person
 * uses this product. `/auth/reset` refuses the same disclosure in `copy.ts`'s `RESET_SENT_COPY`,
 * and `user_not_found` is folded into the same sentence on the sign-in side for that reason.
 *
 * The strings carry no provider vocabulary — no *session*, *credentials*, *token* or *auth* — and
 * the product's name appears nowhere: `voice-and-vocabulary.md` §2 lists the six surfaces that may
 * carry it and a failure string is explicitly not one of them.
 *
 * ## Why it is a module rather than a function in the client
 *
 * `vitest.config.ts` sets `environment: 'node'`, so nothing that imports `motion/react` can be
 * unit-tested. `mode.ts` was split out of the same file for the same reason, and its header states
 * the rule: a pure parse is testable, a component is not. The closed set is only worth having if it
 * is asserted, and it can only be asserted from here.
 */
import type { AuthError } from '@supabase/supabase-js';

import type { Mode } from './mode';

/**
 * Every sentence this screen can show for a failure. Each is a different next move — see the
 * header for why this is not one string.
 */
export const SIGN_IN_ERROR_COPY = {
  /** Wrong password, unknown address, or a deleted account. One sentence for all three on purpose. */
  noMatch: "That email or password doesn't match an account.",
  accountExists: 'An account with this email already exists — try signing in instead.',
  confirmEmail: 'Check your email to confirm your account, then sign in.',
  invalidEmail: 'Enter a valid email address.',
  weakPassword: 'Choose a password with at least 6 characters.',
  rateLimited: "You've tried this a few times. Give it a few minutes.",
  /** `noValidate` on the form means an empty field reaches the server, which answers
   *  `validation_failed` with the word *phone* in it. This is the sentence that replaced it. */
  missingFields: 'Enter your email and password.',
  /** Production keeps sign-up closed (`p002-production-is-live`), so this is a live case there and
   *  unreachable locally. Without it, Supabase's own line reaches the screen. */
  signUpClosed: 'New accounts are closed right now. Sign in if you already have one.',
  /**
   * The request never completed — offline, a blocked request, or a 5xx. Measured against the
   * running app: the SDK wraps **both** of those as `AuthRetryableFetchError` with no code at all,
   * so one sentence has to be true of both. It names the one thing the reader can act on and then
   * covers the case where the fault was never theirs.
   */
  unreachable: "That didn't get through. Check your connection, then try again.",
  /**
   * The fallback, and the whole point of the file: a written sentence for a failure nobody has
   * enumerated. It points at the two fields rather than claiming which one is wrong — the same
   * refusal `noMatch` makes — so it stays true whatever the unseen cause was.
   */
  unknown: "That didn't work. Check your email and password, then try again.",
  /**
   * The sign-up side's fallback. Separate because *check your email and password* is advice about
   * getting back in, and the person reading this has no account yet.
   */
  unknownSignUp: "That didn't work. Check your details, then try again.",
} as const;

/** The set, for the tests that assert nothing outside it can be returned. */
export const SIGN_IN_ERROR_STRINGS: readonly string[] = Object.values(SIGN_IN_ERROR_COPY);

/**
 * The codes this product can actually produce, mapped. Anything not listed falls through — and
 * falling through is the correct outcome, not a gap: Supabase's catalogue is open-ended and a
 * mapping that pretended otherwise would be the same open channel wearing a switch statement.
 */
function mappedMessage(code: string | undefined, mode: Mode): string | null {
  switch (code) {
    case 'invalid_credentials':
    case 'user_not_found':
      // `user_not_found` is deliberately the same answer on sign-in — see the header on enumeration.
      // On sign-up it means something else entirely and is handled by the caller below.
      return mode === 'sign-up' ? null : SIGN_IN_ERROR_COPY.noMatch;
    case 'user_already_exists':
    case 'email_exists':
    case 'identity_already_exists':
      return SIGN_IN_ERROR_COPY.accountExists;
    case 'email_not_confirmed':
      return SIGN_IN_ERROR_COPY.confirmEmail;
    case 'email_address_invalid':
      return SIGN_IN_ERROR_COPY.invalidEmail;
    case 'weak_password':
      return SIGN_IN_ERROR_COPY.weakPassword;
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return SIGN_IN_ERROR_COPY.rateLimited;
    case 'signup_disabled':
    case 'email_provider_disabled':
    case 'provider_disabled':
      return SIGN_IN_ERROR_COPY.signUpClosed;
    case 'validation_failed':
    case 'bad_json':
      return SIGN_IN_ERROR_COPY.missingFields;
    default:
      return null;
  }
}

/**
 * True when the failure matched a case written here — the signal the caller logs, so an unknown
 * auth failure is still findable by whoever has to debug it.
 *
 * A network failure counts as recognised: it has no code, but `AuthRetryableFetchError` is the
 * SDK's own class for *the request never completed* and the screen has a real answer for it.
 */
export function isRecognisedAuthError(error: AuthError, mode: Mode): boolean {
  return error.name === 'AuthRetryableFetchError' || mappedMessage(error.code, mode) !== null;
}

/**
 * The sentence to show. Total: every `AuthError`, every mode, every unseen code returns a member of
 * `SIGN_IN_ERROR_COPY`. `error.message` is never read.
 */
export function authErrorMessage(error: AuthError, mode: Mode): string {
  if (error.name === 'AuthRetryableFetchError') return SIGN_IN_ERROR_COPY.unreachable;

  const mapped = mappedMessage(error.code, mode);
  if (mapped !== null) return mapped;

  return mode === 'sign-up' ? SIGN_IN_ERROR_COPY.unknownSignUp : SIGN_IN_ERROR_COPY.unknown;
}
