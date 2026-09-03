'use client';

/*
 * Sign-in/sign-up, and **the product's first impression** — the owner's words, after a smoke test
 * whose verdict was that the colours do not look good and the brand is missing.
 *
 * ## What this replaced, and why the previous version was not wrong so much as half-finished
 *
 * A full-bleed, card-free split: an editorial band floating in the middle of the left half, a
 * full-height panel on the right painted with a white-at-55% Tailwind literal, and void above and
 * below both. P0 retired that literal for `--panel` and carried the labels from **1.18:1 to
 * 6.6:1** — a real fix, and the point
 * at which the panel stopped failing AA and started reading as *nothing*: the same near-black as
 * the half beside it behind one hairline. Two columns of emptiness with an invisible seam.
 *
 * The composition now lives in `components/brand/chrome-stage.tsx`, which `/` renders too, so the
 * two screens either side of the sign-in step are one object rather than two arrangements of the
 * same parts. What is left in this file is the thing this file is for: the auth behaviour, which is
 * unchanged — email + password, the sign-up/sign-in toggle, `rememberMe`, the Supabase calls, the
 * `?next=` return path — and the copy, which is unchanged string for string.
 *
 * ## Three changes here that are not composition
 *
 *  - **The headline takes the display face.** `brand-and-product-foundation.md` §3.1 puts the
 *    wordmark and the large editorial headings in Fraunces and everything functional in Manrope.
 *    `/` had already moved; this had not, so the product's two adjacent screens set the same size
 *    of headline in two different families.
 *  - **The kicker is a pill.** It was `text-brand` at 11px and measured **4.77:1** in light, which
 *    clears AA by 0.27 and leaves nothing for a tinted ground. See `ChromeKicker`.
 *  - **The placeholder is no longer `--muted-foreground` at 55%.** Measured on painted pixels,
 *    2.14:1 in light and 2.89:1 in dark, on both fields, at both viewports — eight AA failures on
 *    the front door. They survived P0's sweep because the tool that reported "0 failures" resolves
 *    a background by walking ancestors, and every text node on this page sits under a gradient, so
 *    it returned `indeterminate` for all of them; and because placeholder ink is authored in
 *    `oklab`, which its `rgba(...)` regex did not match. A dropped `/55` is the whole fix.
 *
 * ## Why this is no longer the route file
 *
 * It was `page.tsx` and is now the client island underneath one. The screen has to know **which
 * audience arrived** before it renders a word (`mode.ts` carries the argument), and the value comes
 * from the URL — so it has to be read on the server and handed down, or the first paint is the
 * wrong headline and the second one is a hydration mismatch. The file header's existing note about
 * `useSearchParams` says why the hook is not the answer here; a server page reading `searchParams`
 * and passing two props is. Everything below is unchanged behaviour and unchanged copy, except the
 * three things this file's own sections name: the initial mode, the recovery link, and `signUp`
 * gaining the `emailRedirectTo` it never had.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type { AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_AFTER_SIGN_IN, safeReturnPath } from '@/domain/auth/return-path';
import { AUTH_CALLBACK_PATH, RESET_REQUEST_PATH } from '@/app/auth/_lib/routes';
import { PASSWORD_MIN_HINT, PASSWORD_PLACEHOLDER } from '@/app/auth/_lib/copy';
import type { Mode } from './mode';
import { NAME_MAX_LENGTH, signUpNames } from './name-fields';
import { ChromeGround } from '@/components/brand/chrome-ground';
import { ChromeItem, ChromeKicker, ChromeStage } from '@/components/brand/chrome-stage';
import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The answer to a password the server refused as too short — named, because the field's own hint
 * says the same rule and the two must never be on screen together saying it twice.
 */
const WEAK_PASSWORD_MESSAGE = 'Choose a password with at least 6 characters.';

// Supabase's own error copy assumes a product that offers phone auth too (e.g. "Missing email
// or phone", `email_exists`/`phone_exists` split) — this product never does, so raw
// `error.message` must never reach the UI verbatim. Known codes get product-accurate copy; the
// `/phone/i` fallback is a backstop for whichever future code still slips a phone mention through.
function authErrorMessage(error: AuthError, mode: Mode): string {
  switch (error.code) {
    case 'invalid_credentials':
      return "That email or password doesn't match an account.";
    case 'user_already_exists':
    case 'email_exists':
    case 'identity_already_exists':
      return 'An account with this email already exists — try signing in instead.';
    case 'email_not_confirmed':
      return 'Check your email to confirm your account, then sign in.';
    case 'email_address_invalid':
      return 'Enter a valid email address.';
    case 'weak_password':
      return WEAK_PASSWORD_MESSAGE;
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return "You've tried this a few times. Give it a few minutes.";
    case 'user_not_found':
      return mode === 'sign-up'
        ? 'Something went wrong creating your account. Try again.'
        : "That email or password doesn't match an account.";
    case 'validation_failed':
      // Supabase's message here is "Missing email or phone" (submitting with an empty field
      // bypasses HTML5 validation because the form uses `noValidate`) — never surface that verbatim.
      return 'Enter your email and password.';
    default:
      return /phone/i.test(error.message) ? 'Enter your email and password.' : error.message;
  }
}

/**
 * **The field label, defined once because there are now four of them.**
 *
 * It was written inline on `Email` and `Password`, which was fine at two. The name fields make it
 * four, and `token-call-sites.test.ts` counts `tracking-[0.1em]` as an arbitrary value against a
 * whole-repo budget — so four copies of one treatment spend four slots on one decision. One
 * constant spends one, and it is the same rule `MEMBER_NAME_MAX_LENGTH`'s docblock states about
 * numbers: a value with two definitions has none.
 *
 * The `group-focus-within/field:text-foreground` half is the label brightening when its field is
 * focused; the measurement behind the colour, and why it is `--foreground` rather than indigo, is
 * on the email field below and has not moved.
 */
const FIELD_LABEL =
  'text-micro font-bold tracking-[0.1em] text-muted-foreground uppercase motion-safe:transition-colors group-focus-within/field:text-foreground';

/** The `?next=` this visitor arrived with, already reduced to a path we have agreed to return to.
 *  Read off `location` for the reason the submit handler's comment gives at length. */
function currentReturnPath(): string {
  return safeReturnPath(new URLSearchParams(window.location.search).get('next'));
}

/**
 * Where a confirmation email should send the browser back to.
 *
 * Absolute, because it travels out of the app and into an email — and built from
 * `window.location.origin` rather than from a configured base, so a preview deployment confirms
 * against itself instead of bouncing everyone to production. Supabase validates it against the
 * project's own redirect allow-list before it is ever put in an email, which is the backstop that
 * makes reading the origin from the browser safe: a poisoned origin is refused there, not here.
 *
 * `next` is only appended when there is somewhere to return to. `safeReturnPath` has already
 * reduced it to a path from a closed list, and it is checked again on arrival.
 */
function confirmationRedirect(): string {
  const url = new URL(AUTH_CALLBACK_PATH, window.location.origin);
  const next = currentReturnPath();
  if (next !== DEFAULT_AFTER_SIGN_IN) url.searchParams.set('next', next);
  return url.toString();
}

export function SignInScreen({
  initialMode,
  notice,
}: {
  /** Read from `?mode=` on the server. The invite route is what sets it — see `mode.ts`. */
  initialMode: Mode;
  /** A one-line fact from a link that no longer works, or null. `mode.ts` owns the parse. */
  notice: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  // Sign-up only, and kept across a toggle to sign-in and back: switching mode by accident should
  // not cost someone the name they already typed.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  // The expired-link line and the form's own errors are one slot on purpose: they are the same kind
  // of sentence in the same place, and two stacked status strips would let a stale notice sit above
  // a fresh error. Submitting clears it, which is what makes it a notice rather than a banner.
  const [message, setMessage] = useState<string | null>(notice);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    /*
     * The name check runs **before** `setPending(true)` and before any network call, because
     * nothing has been attempted yet: this is the form reading its own fields. Putting it after
     * would flash `Working…` on the button for a round trip that never happens.
     *
     * Sign-in is untouched by it. There are no name fields on that side of the toggle, and a
     * returning user who once signed up without one — every account that predates `0035` — must
     * never be stopped at the door over data we did not ask them for.
     */
    const names = isSignUp ? signUpNames({ firstName, lastName }) : null;
    if (names && !names.ok) {
      setMessage(names.message);
      return;
    }

    setPending(true);
    setMessage(null);

    // "Remember me" only makes sense for sign-in (a fresh signUp always starts a new session);
    // the browser client's cookie lifetime is fixed at construction time, hence passing it here.
    const supabase = createClient({ rememberMe: isSignUp ? true : rememberMe });
    const { error } = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          /*
           * **`emailRedirectTo`, and without it production sign-up has nowhere to land.**
           *
           * `security.md` A§2.5 has email confirmation **on in production** and off locally, so
           * this argument does nothing on the machine it is written on and is the whole flow on
           * the deployed one. `@supabase/ssr` forces `flowType: 'pkce'` — it is written after the
           * options spread in `createBrowserClient.js`, so it cannot be overridden — and a PKCE
           * confirmation link comes back carrying a `?code=` that something has to exchange.
           * Before this line the link went to `site_url`, which is `/`: a server component that
           * instantiates no Supabase client and has nothing to hand a code to. The code was
           * dropped, the session was never created, and the account existed but could not be used.
           *
           * `/auth/callback` is the route that exchanges it, and it is the same route the password
           * reset uses. That is why the two halves of `product-review-2026-08-31-r1.md` finding 3
           * are one change rather than two.
           *
           * `next` rides along so an invited stranger who has to confirm their address still lands
           * on the invite they came from. It is re-checked against `safeReturnPath` at the callback
           * — never trusted for having survived a round trip through an email.
           */
          /*
           * **`data`, and without it the whole name chain is inert.**
           *
           * `options.data` is what GoTrue writes to `auth.users.raw_user_meta_data`, and that
           * column is the only thing `public.handle_new_user()` can read: it runs inside the
           * `auth.users` INSERT, where there is no session, no request and no other source of
           * anything the user typed. Until this argument existed the call passed
           * `emailRedirectTo` alone, so `raw_user_meta_data` was `{}` on **every account this
           * product has ever created** — which is why `profiles.display_name` is null for all
           * eight local rows and why `actions/collections.ts:522` carries a comment about it.
           * `0035` can create the `profile_names` row, and correctly creates nothing, without
           * this line.
           *
           * `first_name` / `last_name` are the keys that function checks first, ahead of the OIDC
           * `given_name` / `family_name` a future social provider would send and ahead of its
           * last-resort split of a single string. It clamps both to 80 itself; `signUpNames` has
           * already done the same, and neither is relying on the other.
           *
           * **It does not send `display_name`.** That column is the label collection peers see,
           * `0035` deliberately issues no DDL against `profiles` and adds no new route into it,
           * and a name typed here to personalise the product is not consent to show it to
           * strangers in a shared collection. The peer-visible label stays the one thing the user
           * confirms for themselves, in the prompt that already exists.
           */
          /* Spread rather than `data: names?.data`, because `exactOptionalPropertyTypes` is on and
             `data?: object` will not take an explicit `undefined`. The key is absent on sign-in,
             which is the branch that never reaches here anyway. */
          options: {
            emailRedirectTo: confirmationRedirect(),
            ...(names === null ? {} : { data: names.data }),
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setPending(false);

    if (error) {
      setMessage(authErrorMessage(error, mode));
      return;
    }

    if (isSignUp) {
      // Local dev has email confirmation disabled by default (supabase/config.toml), so signUp
      // already returns an active session; if confirmation is required this message covers it.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setMessage('Check your email to confirm your account, then sign in.');
        return;
      }
    }

    // A collection invite link sends a signed-out visitor here with `?next=`, and dumping them on
    // the map afterwards loses the thing they were invited to unless the link is still in their
    // clipboard. `safeReturnPath` is an allow-list of path shapes, not a same-origin check — see
    // its header for why the sign-in page is the worst page in a product to leave open.
    // Read off `location` rather than through `useSearchParams`: this value is wanted once, at
    // submit time, on the client — and the hook would put a Suspense boundary around a screen whose
    // whole job is to render immediately, for a string we can already see. (The *mode* hint is a
    // different case and is read on the server, because it decides the first paint.)
    router.push(currentReturnPath() as '/map');
    router.refresh();
  }

  const kicker = isSignUp ? 'Get started' : 'Welcome back';
  const headline = isSignUp ? ['Save your first', 'place.'] : ['Your places', 'are waiting.'];
  const subhead = isSignUp
    ? 'Create an account to start building your map.'
    : 'Sign in to pick up your saved map right where you left it.';

  return (
    <main className="relative isolate min-h-dvh">
      <ChromeGround />

      <ChromeStage
        editorial={
          <>
            <ChromeItem step={1}>
              <ChromeKicker>{kicker}</ChromeKicker>
            </ChromeItem>

            <ChromeItem step={2}>
              {/* Fraunces, `SOFT` 44 / `WONK` on, matching `/` — see the file header.
                  `text-display lg:text-display-lg` is the design system's Display step at both ends
                  of its own range; `--text-title` was here and took the name of that document's
                  22px step while being 44px, four over Display's cap. See the token in
                  `globals.css` for why the range is two utilities rather than one clamp. */}
              <h1
                className="font-display text-display font-bold tracking-tight text-foreground lg:text-display-lg"
                style={DISPLAY_HEADING_AXES}
              >
                {headline[0]}
                <br />
                {headline[1]}
              </h1>
            </ChromeItem>

            <ChromeItem step={3}>
              <p className="max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-sm lg:text-base">
                {subhead}
              </p>
            </ChromeItem>
          </>
        }
        form={
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 lg:gap-5">
            {/*
              * `group/field`, and the label brightens when the field it names is focused.
              *
              * Measured at commit 9a95444 with a real pointer at 1440x900, both themes: these two
              * labels and the `Remember me` row were **inert** — background, colour, border,
              * opacity, shadow, transform and text-decoration all byte-identical hovered and not.
              * The `Input` primitive answered a hover on its own border and a focus with its ring;
              * nothing said which field you were *in* beyond a 1px edge.
              *
              * `text-foreground` and deliberately **not** `text-chrome-accent`. Indigo is licensed
              * on chrome and it was the first thing tried, and it fails at night. Computed — from
              * the token values against the composited card colours this file's own tokens state,
              * `rgb(250,251,251)` in light and `rgb(33,33,37)` in dark — `--chrome-accent` resolves
              * to `--indigo-600` on paper at **6.62:1** and to `--indigo-400` at night at
              * **3.85:1**, against a 4.5 bar for 11px bold ink. `--foreground` is 16.63 and 14.33.
              *
              * So indigo stays where it costs nothing — the grounds, the edges, the kicker's dot —
              * and ink that has to be read takes the ink colour. A focus state whose whole job is
              * to say *you are here* is the last place to spend a contrast ratio on a hue.
              *
              * `focus-within`, not `focus-visible`: this fires when the field is focused by any
              * means, so it works on a phone where there is no pointer at all. Nothing on this
              * screen is hover-only.
              */}
            {isSignUp && (
              /*
               * **The name fields, sign-up only.**
               *
               * `0035`'s R2 hands required-ness to this form, and `name-fields.ts` carries the
               * ruling and the argument: **first name required, last name optional.** The two
               * decisions are visible here as the two things a form can say — the first field has
               * `required`, the second is labelled `Optional`.
               *
               * Marked rather than merely permissive. A form that silently accepts an empty field
               * teaches people to distrust the ones it does enforce, and the marker sits in the
               * label row where a screen reader reaches it, not in a placeholder that vanishes the
               * moment somebody types.
               *
               * `grid-cols-2` at every width, which is the one thing here that is taste. Given and
               * family name are one question, and stacking them puts two 48px rows and two labels
               * between `Get started` and the email field on a phone — the front door's whole job
               * is to end. They are short fields; neither needs the full column.
               *
               * `step={4}`, the same beat as the email block below rather than a new one. The
               * entrance is a fixed 45ms-per-step stagger with no cap, so a new step would lengthen
               * the sign-up entrance and — because this block does not render on sign-in — leave a
               * gap in the sequence there. Name and email arriving together is also the right
               * grouping: who you are, then how you get back in.
               *
               * `dir="auto"` on both inputs. The local database's own display name is `מאיה`, and
               * a Hebrew given name typed into an LTR field puts the caret and the punctuation on
               * the wrong side. This is the same call `/profile` already makes on the rendered
               * name, made one step earlier, at the point the name is typed.
               */
              <ChromeItem step={4} className="grid grid-cols-2 gap-3">
                {/* The `group/field` label brightening is the email and password fields' — see
                    their comment for the measurement and for why it is `--foreground` and not
                    indigo. */}
                <div className="group/field flex flex-col gap-1.5">
                  <Label
                    htmlFor="first-name"
                    className={FIELD_LABEL}
                  >
                    First name
                  </Label>
                  <Input
                    id="first-name"
                    type="text"
                    required
                    dir="auto"
                    autoComplete="given-name"
                    maxLength={NAME_MAX_LENGTH}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-12 rounded-lg border-border bg-background px-4 text-sm font-medium text-foreground lg:h-13 lg:px-4.5 lg:text-reading"
                  />
                </div>

                <div className="group/field flex flex-col gap-1.5">
                  {/* `items-baseline`, so the 11px marker sits on the label's baseline rather than
                      being centred against it — both are `text-micro`, so the row is one line high
                      either way and the first field's label line still matches this one's. */}
                  <div className="flex items-baseline justify-between gap-2">
                    <Label
                      htmlFor="last-name"
                      className={FIELD_LABEL}
                    >
                      Last name
                    </Label>
                    {/*
                      * Not `uppercase`: the labels are a tracked-caps typographic device and this
                      * is a word being read. Sentence case, per `voice-and-vocabulary.md` §5.
                      *
                      * `leading-none` to match `Label`'s own, and it is load-bearing rather than
                      * tidying. `text-micro` carries `--leading-micro`, which makes an 11px span
                      * **16px tall against the label's 14** — measured at 390x844, and it put the
                      * two inputs at `y: 402` and `y: 404`. Two adjacent fields two pixels out of
                      * line is the kind of thing nobody can name and everybody sees.
                      *
                      * `aria-describedby` on the input rather than the word sitting loose beside
                      * it: `required` is absent on this field, so a screen reader announcing
                      * nothing is the only other signal, and *nothing* is not a signal.
                      */}
                    <span
                      id="last-name-optional"
                      className="text-micro font-medium leading-none text-muted-foreground"
                    >
                      Optional
                    </span>
                  </div>
                  <Input
                    id="last-name"
                    type="text"
                    dir="auto"
                    aria-describedby="last-name-optional"
                    autoComplete="family-name"
                    maxLength={NAME_MAX_LENGTH}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="h-12 rounded-lg border-border bg-background px-4 text-sm font-medium text-foreground lg:h-13 lg:px-4.5 lg:text-reading"
                  />
                </div>
              </ChromeItem>
            )}

            <ChromeItem step={4} className="group/field flex flex-col gap-1.5">
              <Label
                htmlFor="email"
                className={FIELD_LABEL}
              >
                Email
              </Label>
              {/* `bg-background`, not `bg-card`. On the raised card a `--card` field is the panel's
                  own colour in both themes and reads as a rectangle drawn in border only; the
                  page's ground is one step away from the material in *both* directions — darker
                  than near-white paper, darker than the night panel — so the field reads as an
                  inset well rather than as an outline. */}
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-lg border-border bg-background px-4 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground lg:h-13 lg:px-4.5 lg:text-reading"
              />
            </ChromeItem>

            <ChromeItem step={5} className="flex flex-col gap-4 lg:gap-5">
              {/* The same `group/field` pairing as the email field above; its comment carries the
                  measurement and the reason the colour is `--foreground` rather than indigo. */}
              <div className="group/field flex flex-col gap-1.5">
                <Label
                  htmlFor="password"
                  className={FIELD_LABEL}
                >
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder={PASSWORD_PLACEHOLDER}
                  {...(isSignUp ? { 'aria-describedby': 'password-hint' } : {})}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-lg border-border bg-background px-4 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground lg:h-13 lg:px-4.5 lg:text-reading"
                />
                {/*
                  * The six-character minimum, on the side of the toggle that is choosing a
                  * password. It was a placeholder on both sides, which put a rule about a new
                  * password in front of somebody typing the one they have had for months — and a
                  * placeholder is the one place a requirement cannot survive, because it leaves
                  * the moment the first character lands.
                  *
                  * `minLength={6}` above it, and the server's `weak_password` answer, are
                  * unchanged: this is where the rule is *said*, not where it is enforced.
                  */}
                {isSignUp && message !== WEAK_PASSWORD_MESSAGE && (
                  <p id="password-hint" className="text-micro font-medium text-muted-foreground">
                    {PASSWORD_MIN_HINT}
                  </p>
                )}
              </div>

              {!isSignUp && (
                /*
                 * `min-h-11` (44px) on the label, not on the checkbox.
                 *
                 * W7-6 measured this row at 342 x 20 and the bar is 44. The checkbox itself is
                 * 16 x 16, but a wrapping `<label>` **is** the hit area — the accessibility sweep's
                 * own tool got that wrong first and flagged the 16px box, which is the visual size
                 * and not the target. So the fix belongs on the row, and `items-start` stays so the
                 * box keeps aligning to the first line when the hint wraps to a second.
                 */
                /*
                 * The row answers a pointer and a keyboard, which it did not: measured inert at
                 * 9a95444, and the base cursor rule now gives it the hand a checkbox label earns.
                 *
                 * The keyboard arm is a `has-` variant over the checkbox's *focus-visible* state
                 * rather than `focus-within`, and the difference matters here: clicking the row
                 * focuses the checkbox, so `focus-within` would leave the row lit after a mouse
                 * click and make it look permanently active. `focus-visible` is the browser's own
                 * judgement about whether the focus came from a keyboard.
                 */
                <label className="flex min-h-11 items-start gap-2 py-2 text-sm font-medium text-muted-foreground motion-safe:transition-colors hover:text-foreground has-[:focus-visible]:text-foreground">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded border-border accent-brand"
                  />
                  <span>
                    Remember me
                    {!rememberMe && (
                      <>
                        {' '}
                        {/* Two wrapped lines of hedge, cut to one clause. The caveat it used to
                            spell out — *unless it restores your last session* — is a browser
                            behaviour nobody can act on, and `usually` carries it honestly without
                            asking the reader to hold two conditions at once. */}
                        <span className="text-xs font-normal text-muted-foreground/80">
                          (usually signs you out when you close your browser)
                        </span>
                      </>
                    )}
                  </span>
                </label>
              )}

              {!isSignUp && (
                /*
                 * **The only key to the one door this product has.**
                 *
                 * Until this link existed, `resetPasswordForEmail` appeared nowhere in `src/` and a
                 * forgotten password was permanent, total loss of the map — against a six-character
                 * minimum with no composition rule, which is exactly the password people forget
                 * (`product-review-2026-08-31-r1.md` finding 3).
                 *
                 * Sign-in only. On the sign-up side there is no password to have forgotten, and a
                 * recovery link there would be the third route out of a screen whose job is to get
                 * one account made.
                 *
                 * **It does not carry the typed email**, and that is a decision rather than an
                 * omission. Passing what the entry point knows is the rule this screen was just
                 * fixed to obey, and it stops at an address: a query string is written to browser
                 * history, to a shared-machine's autocomplete and to whatever logs the next hop
                 * keeps. `security.md` §6 already refuses a full address on a shared surface. Four
                 * keystrokes on the next screen is the right price.
                 *
                 * The 44px row, the `group/switch` underline and the focus ring are the account
                 * toggle's below — the same control shape, so it is styled once and copied rather
                 * than invented twice.
                 */
                <Link
                  href={RESET_REQUEST_PATH}
                  className="group/switch flex min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-muted-foreground outline-none motion-safe:transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Forgot your password?{' '}
                  <span className="font-bold text-brand underline-offset-4 group-hover/switch:underline group-focus-visible/switch:underline">
                    Reset it
                  </span>
                </Link>
              )}
            </ChromeItem>

            <AnimatePresence mode="wait" initial={false}>
              {message && (
                <motion.p
                  key={message}
                  role="status"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden text-sm text-destructive"
                >
                  {message}
                </motion.p>
              )}
            </AnimatePresence>

            <ChromeItem step={6} className="flex flex-col">
              {/*
                * **`hover:shadow-cta-halo` — light under the largest mint object on the page.**
                *
                * It was added as the *whole* answer to a hover nobody could see, back when
                * `Button`'s `default` variant stepped the fill to `bg-primary/80` — the same mint
                * at 80% alpha, which measured 16/3/4 per channel and moved the control *lighter*.
                * That was the wrong half to fix, and the colour is now fixed at its source:
                * `--primary-hover` darkens the fill 23/27/27 on every primary button in the
                * product (see `button.tsx`'s `default` variant).
                *
                * **The halo stays, and it is not now doubled up.** It says something the fill
                * cannot — light *under* the object rather than a change of pigment — and it is the
                * signature the three auth CTAs share (`auth/reset`, `auth/new-password`). With the
                * colour carrying the state, this is the flourish it was always meant to be rather
                * than the state itself.
                *
                * The token restates the resting `--shadow-raised` inside itself — `box-shadow` is
                * not additive, so a hover naming only the glow would flatten the control at the
                * moment it is reached for. See `--shadow-cta-halo` in `globals.css`.
                *
                * **No `hover:-translate-y-px`, and that is deliberate.** The base variant already
                * carries `active:translate-y-px` and `active:shadow-none`, so the press is a sink
                * plus the glow collapsing — a complete beat. A hover lift would put two rules on
                * one custom property whose relative order Tailwind decides, for a one-pixel gain.
                *
                * The palette is untouched: `--brand` is the mint the CTA is already made of. The
                * owner's *more alive* is answered here with responsiveness, not with a new pigment.
                */}
              <Button
                type="submit"
                disabled={pending}
                className="h-12 w-full rounded-lg text-base font-bold hover:shadow-cta-halo lg:h-13 lg:text-reading"
              >
                {pending ? (
                  <>
                    {/*
                     * `hidden motion-safe:block`, not the mechanical `motion-safe:animate-spin`.
                     *
                     * The bare `animate-spin` here really did run for people who asked for less
                     * motion — measured on a real build at 390x844 with the context set to
                     * `prefers-reduced-motion: reduce`, `animationName: spin`, and there is no
                     * global override anywhere in the stylesheet.
                     *
                     * But merely guarding it is worse than it looks: `Loader2` is a three-quarter
                     * arc, so a *stationary* one does not read as a paused spinner, it reads as a
                     * rendering artefact — and on this button, already at 45% disabled opacity, as
                     * a faint stray mark beside the word. So the glyph goes entirely and
                     * `Working…` carries the state, which it was doing anyway. §3a's "collapse to
                     * the opacity change, not to nothing" is satisfied by text that never leaves.
                     */}
                    <Loader2
                      className="hidden size-4 motion-safe:block motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                    Working…
                  </>
                ) : isSignUp ? (
                  'Create account →'
                ) : (
                  'Sign in →'
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMode((m) => (m === 'sign-up' ? 'sign-in' : 'sign-up'));
                  setMessage(null);
                }}
                /* `min-h-11` (44px): W7-6 measured this at 342 x 20. It is a real button that
                 * switches the whole form between sign-in and sign-up, not an inline link inside a
                 * sentence — WCAG 2.5.8's inline-link exemption does not reach it, and it is the
                 * only way a new user gets to the account they do not have yet. */
                /*
                 * `gap-1` is load-bearing, not spacing taste. This became a flex row to reach the
                 * 44px target (W7-6), and **whitespace between flex items is discarded** — so the
                 * literal space in `New here? <span>` stopped rendering and the line read
                 * "New here?Create an account" on the product's front door. The gap restores a
                 * word-space between the two items. Do not remove it without making the text a
                 * single text node again.
                 */
                /*
                 * **This control answered nothing at all**, which the audit at 9a95444 measured
                 * rather than inferred: hovered and unhovered were byte-identical across all nine
                 * properties, and it had no focus treatment either. It is the only route a new user
                 * has to the account they do not have yet, sitting under the CTA looking like a
                 * caption.
                 *
                 * The response is an underline on the actionable word, which is what
                 * `brand-and-product-foundation.md` already says this control *is*: *"secondary /
                 * toggle actions are plain text, muted by default, with the actionable word set in
                 * bold mint-700 inline rather than styled as a second button."* A background or a
                 * border would make it the second button that sentence forbids; an underline is the
                 * affordance the word already had and was not showing.
                 *
                 * `group/switch` so hovering anywhere on the 44px row underlines the word, not only
                 * the word itself — the row is the target, per W7-6.
                 *
                 * `focus-visible:ring-3 focus-visible:ring-ring/50` is the product's focus
                 * treatment, and this button was rendering the browser's default outline instead.
                 */
                className="group/switch mt-3 flex min-h-11 items-center justify-center gap-1 rounded-lg text-center text-sm font-medium text-muted-foreground outline-none motion-safe:transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {isSignUp ? (
                  <>
                    Have an account?{' '}
                    <span className="font-bold text-brand underline-offset-4 group-hover/switch:underline group-focus-visible/switch:underline">
                      Sign in
                    </span>
                  </>
                ) : (
                  <>
                    New here?{' '}
                    <span className="font-bold text-brand underline-offset-4 group-hover/switch:underline group-focus-visible/switch:underline">
                      Create an account
                    </span>
                  </>
                )}
              </button>
            </ChromeItem>
          </form>
        }
      />
    </main>
  );
}
