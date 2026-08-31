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
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type { AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { safeReturnPath } from '@/domain/auth/return-path';
import { ChromeGround } from '@/components/brand/chrome-ground';
import { ChromeItem, ChromeKicker, ChromeStage } from '@/components/brand/chrome-stage';
import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'sign-in' | 'sign-up';

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
      return 'Choose a password with at least 6 characters.';
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

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);

    // "Remember me" only makes sense for sign-in (a fresh signUp always starts a new session);
    // the browser client's cookie lifetime is fixed at construction time, hence passing it here.
    const supabase = createClient({ rememberMe: isSignUp ? true : rememberMe });
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
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
    // submit time, on the client — and the hook would force this statically-rendered route into a
    // Suspense boundary (or fail the production build) for a string we can already see.
    router.push(
      safeReturnPath(new URLSearchParams(window.location.search).get('next')) as '/map',
    );
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
            <ChromeItem step={4} className="flex flex-col gap-1.5">
              <Label
                htmlFor="email"
                className="text-micro font-bold tracking-[0.1em] text-muted-foreground uppercase"
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
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="password"
                  className="text-micro font-bold tracking-[0.1em] text-muted-foreground uppercase"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-lg border-border bg-background px-4 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground lg:h-13 lg:px-4.5 lg:text-reading"
                />
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
                <label className="flex min-h-11 items-start gap-2 py-2 text-sm font-medium text-muted-foreground">
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
                        <span className="text-xs font-normal text-muted-foreground/80">
                          (signed out when you close your browser — unless it restores your last
                          session)
                        </span>
                      </>
                    )}
                  </span>
                </label>
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
              <Button
                type="submit"
                disabled={pending}
                className="h-12 w-full rounded-lg text-base font-bold lg:h-13 lg:text-reading"
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
                className="mt-3 flex min-h-11 items-center justify-center gap-1 text-center text-sm font-medium text-muted-foreground"
              >
                {isSignUp ? (
                  <>
                    Have an account?{' '}
                    <span className="font-bold text-brand">Sign in</span>
                  </>
                ) : (
                  <>
                    New here? <span className="font-bold text-brand">Create an account</span>
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
