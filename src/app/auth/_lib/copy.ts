/**
 * Every string the recovery flow puts on screen, as data.
 *
 * Two reasons it is a module rather than JSX, and the second is the load-bearing one.
 *
 * **It is assertable.** `vitest.config.ts` sets `environment: 'node'`, so nothing in this repository
 * renders in a unit test. `not-found.tsx` already exports its copy for exactly this reason and
 * `tests/unit/app/shell.test.ts` reads it. What is worth pinning about an auth screen is what it
 * *says* — and `agent-guardrails.md` §7 rule 26 records a 17-string copy pass that was green in
 * `npm test` both before and after while breaking three e2e selectors, because the suite that reads
 * a string is not the suite anyone habitually runs.
 *
 * **It is one place to check the voice.** `voice-and-vocabulary.md` binds all of it, and three of
 * its rules bite here specifically: no exclamation marks anywhere; a failure states a fact and
 * offers the next move without apologising; and **the product's name may not appear** — §2 lists
 * the six surfaces that may carry it and an auth or failure surface is not one of them.
 *
 * The screens below carry no place, no collection and no name, so §3's vocabulary table barely
 * applies — except for *your map*, which is the product's own noun for the thing you are getting
 * back, and *link*, which is what a person clicks.
 */

/**
 * A link that no longer works, said once for both screens that can receive one.
 *
 * `/auth/callback` sends a dead recovery link to `/auth/reset` and a dead confirmation link to
 * `/sign-in`, and both render this. It states the fact and stops: this product has no resend
 * control, so a sentence promising one would be the only untrue line in the flow. Each screen
 * carries its own next move underneath — a form that issues a new link, or the door.
 */
export const LINK_EXPIRED_NOTICE = 'That link has expired.';

/**
 * What a password field shows before anything is typed, on every screen that has one.
 *
 * It used to read `At least 6 characters`, on `/sign-in` as well — where nobody is choosing a
 * password and the only thing the line could mean was a rule about one they already have. A
 * placeholder is an example of the value, the way `you@example.com` is in the field above it, and
 * the example of a password is what typing one looks like.
 *
 * **The rule is unchanged and still stated**, in `PASSWORD_MIN_HINT`, on the two screens where a
 * password is actually being chosen. `minLength={6}` and the server's own `weak_password` check are
 * untouched by this file.
 */
export const PASSWORD_PLACEHOLDER = '••••••••';

/**
 * The six-character minimum, said where a requirement belongs: under the field, on the screens that
 * ask for a new password. Sign-in does not show it — there is nothing to comply with there.
 */
export const PASSWORD_MIN_HINT = 'Use at least 6 characters.';

/** Asking for a recovery link. */
export const RESET_REQUEST_COPY = {
  kicker: 'Password reset',
  headline: ['Forgot your', 'password?'],
  subhead: "We'll email you a link to set a new one.",
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  submit: 'Email me a link →',
  pending: 'Working…',
  back: 'Back to sign in',
} as const;

/**
 * The settled state after the request.
 *
 * **`subhead` is conditional on purpose and the condition is the security property.**
 * `resetPasswordForEmail` succeeds whether or not the address has an account — Supabase will not
 * confirm that one exists, and neither may we, or this screen becomes a way to test whether a given
 * person uses this product. So the sentence is hedged, and it is hedged in the copy rather than in
 * the code, because the code has nothing to branch on.
 *
 * `browser` is the one piece of PKCE that a user can trip over. The code verifier is written into
 * the cookie jar of the browser that asked, so a link opened on a different device has nothing to
 * exchange against. Saying it before they leave the screen costs one line; discovering it is a
 * dead link and a second request.
 */
export const RESET_SENT_COPY = {
  kicker: 'Check your email',
  headline: ['A link is', 'on its way.'],
  subhead: 'If that address has an account, the link is in your inbox.',
  browser: 'The link only works in this browser.',
  back: 'Back to sign in',
} as const;

/** Setting the new password, with a recovery session in hand. */
export const NEW_PASSWORD_COPY = {
  kicker: 'New password',
  headline: ['Set a new', 'password.'],
  subhead: "You'll go straight to your map.",
  passwordLabel: 'New password',
  passwordPlaceholder: PASSWORD_PLACEHOLDER,
  passwordHint: PASSWORD_MIN_HINT,
  submit: 'Save password →',
  pending: 'Working…',
} as const;

/** The same screen reached without a session — an expired link, or a bookmark. */
export const NEW_PASSWORD_EXPIRED_COPY = {
  kicker: 'Expired link',
  headline: ['That link', 'has expired.'],
  subhead: 'Ask for a new one, and open it in this browser.',
  action: 'Get a new link →',
} as const;

/**
 * Failures while saving the new password.
 *
 * The same discipline as `authErrorMessage` on the sign-in screen: a closed set of product-accurate
 * sentences, and **no provider string ever reaches the user**. Supabase's own copy assumes a
 * product with phone auth and its `message` field is not ours to display; the default here is a
 * sentence of our own rather than `error.message`, because on this screen the honest fallback is
 * always the same next move.
 */
export const NEW_PASSWORD_ERROR_COPY = {
  weak: 'Choose a password with at least 6 characters.',
  same: "That's the password you already have. Choose a different one.",
  expired: 'That link has expired. Ask for a new one.',
  rateLimited: "You've tried this a few times. Give it a few minutes.",
  unknown: "That didn't save. Ask for a new link and try again.",
} as const;
