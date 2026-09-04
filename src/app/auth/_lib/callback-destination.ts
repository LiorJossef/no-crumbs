/**
 * **Where `/auth/callback` sends the browser, and the one rule it may never break.**
 *
 * A callback is a redirector, and a redirector that takes its destination from the URL it was
 * called with is an open redirect — a phishing primitive, on the page in this product that is worst
 * to be sent away from, reached through a link the visitor was *told to trust* because it arrived
 * in an email from us. So this function never returns anything it was handed. It returns one of a
 * closed set of paths this product has decided are destinations:
 *
 *  - `safeReturnPath`'s allow-list, for a confirmation link that was following an invite. That
 *    function is the shared decision (`domain/auth/return-path.ts`) and it is deliberately *not*
 *    a same-origin check — a wildcard over our own origin would make every route added later a
 *    post-sign-in destination without anyone choosing it.
 *  - `/auth/new-password`, a constant, for a recovery link.
 *  - `/auth/reset?state=expired` and `/sign-in?state=expired` when the link did not work.
 *
 * `type` is caller-controlled and it is fine that it is: its entire effect is to pick between two
 * literals written in this file. It is not a destination, it is a two-valued switch, and the
 * difference is the whole security property. **Do not "generalise" it into a path.**
 *
 * ## Why the failure paths are different from each other
 *
 * A recovery link that has expired goes to the screen that can issue a new one, so the failure and
 * the fix are the same screen. A confirmation link that has expired goes to the door, because this
 * product has no resend control — sending someone to a screen that cannot help them is worse than
 * sending them to the one they were trying to get through.
 *
 * ## What is deliberately not modelled here
 *
 * Nothing distinguishes *why* the link failed. GoTrue can say `otp_expired`, `access_denied` or
 * nothing at all, and `exchangeCodeForSession` fails for a used code and for a missing verifier
 * alike. The user's next move is identical in every case and a taxonomy nobody acts on is a leak of
 * our machinery into their screen (`voice-and-vocabulary.md` §7 rule 3).
 */
import { safeReturnPath } from '@/domain/auth/return-path';

import { NEW_PASSWORD_PATH, RESET_REQUEST_PATH, SIGN_IN_PATH } from './routes';

/** The marker this product puts on its own recovery links. Read, never echoed. */
export const RECOVERY_TYPE = 'recovery';

/** The one `?state=` either screen knows how to render. */
export const EXPIRED_STATE = 'expired';

export type CallbackOutcome = 'exchanged' | 'failed';

/** True when the link we issued said it was a password recovery. Any other value is a confirmation,
 *  including a missing one — a link with no marker is the older shape and confirming is what it
 *  was for. */
function isRecovery(params: URLSearchParams): boolean {
  return params.get('type') === RECOVERY_TYPE;
}

/**
 * The path to redirect to. **Always relative, always from this file** — a caller that resolves it
 * against the request's own origin cannot be talked into a different one.
 */
export function callbackDestination(params: URLSearchParams, outcome: CallbackOutcome): string {
  const recovery = isRecovery(params);

  if (outcome === 'failed') {
    return recovery
      ? `${RESET_REQUEST_PATH}?state=${EXPIRED_STATE}`
      : `${SIGN_IN_PATH}?state=${EXPIRED_STATE}`;
  }

  return recovery ? NEW_PASSWORD_PATH : safeReturnPath(params.get('next'));
}

/**
 * Whether this callback carries an error instead of a code.
 *
 * GoTrue puts `error` / `error_code` / `error_description` on the redirect when it rejects the
 * token itself — an expired recovery link never gets as far as an exchange. The description is a
 * provider string and is neither read nor forwarded; its presence is the entire signal.
 */
export function callbackCarriesError(params: URLSearchParams): boolean {
  return params.has('error') || params.has('error_code');
}
