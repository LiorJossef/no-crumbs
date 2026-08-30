'use client';

// Sign-in/sign-up for the pre-L1 vertical slice. Recomposed (design exploration locked
// 2026-08-21) onto a full-bleed, card-free layout: an "atmosphere" gradient background, a
// left-aligned editorial hero (mark + kicker + headline + subhead) and a thumb-zone form on
// mobile; a genuine two-panel editorial/form split on desktop (lg+), not the mobile layout
// stretched. Same auth behaviour as before (email + password, sign-up/sign-in toggle, Supabase
// calls, redirect to /map) — visual only. Tokens from globals.css (L1-F1-T2): mint-400 primary
// with dark-ink-on-mint foreground, warm near-white surface, hairline borders, 16px field/button
// radius via --radius.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import type { AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { safeReturnPath } from '@/domain/auth/return-path';
import { PinMark } from '@/components/brand/pin-mark';
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
    // The wash is `--brand-wash` (globals.css) rather than a gradient literal, so the landing
    // page one step earlier in the flow paints the identical atmosphere.
    <main className="relative min-h-dvh overflow-hidden" style={{ background: 'var(--brand-wash)' }}>
      <div className="relative flex min-h-dvh flex-col lg:flex-row">
        {/* Editorial / hero column — top-aligned + pinned by the form's mt-auto on mobile,
            vertically centered in a flex-1 left panel on desktop. */}
        <div className="relative flex flex-1 flex-col px-6 pt-14 lg:justify-center lg:px-[clamp(48px,7vw,110px)] lg:pt-0">
          <PinMark className="relative z-10 h-[30px] w-[30px] lg:h-9 lg:w-9" />

          <p className="relative z-10 mt-4 text-[11px] font-bold tracking-[0.14em] text-brand uppercase lg:mt-6 lg:text-[13px]">
            {kicker}
          </p>

          <h1 className="relative z-10 mt-2 font-heading text-[34px] leading-[1.05] font-extrabold tracking-tight text-foreground lg:text-[clamp(40px,5.5vw,64px)]">
            {headline[0]}
            <br />
            {headline[1]}
          </h1>

          <p className="relative z-10 mt-3 max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-sm lg:text-base">
            {subhead}
          </p>
        </div>

        {/* Form — thumb-zone bottom sheet on mobile (pushed down by the hero's flex-1), a
            full-height frosted panel with a single hairline edge on desktop. */}
        <div
          className="relative mt-auto flex w-full flex-col gap-4 px-6 pb-8 pt-6 lg:mt-0 lg:h-auto lg:w-[clamp(360px,32vw,460px)] lg:flex-none lg:justify-center lg:border-l lg:border-[rgba(231,227,220,0.7)] lg:bg-white/55 lg:px-10 lg:py-0 lg:backdrop-blur-[10px]"
        >
          <div className="w-full lg:mx-auto lg:max-w-[320px]">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 lg:gap-5">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-lg border-border bg-card px-4 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/55 lg:h-13 lg:px-4.5 lg:text-[15px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="password"
                  className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"
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
                  className="h-12 rounded-lg border-border bg-card px-4 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/55 lg:h-13 lg:px-4.5 lg:text-[15px]"
                />
              </div>

              {!isSignUp && (
                <label className="flex items-start gap-2 text-sm font-medium text-muted-foreground">
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

              <Button
                type="submit"
                disabled={pending}
                className="h-12 w-full rounded-lg text-base font-bold lg:h-[52px] lg:text-[15.5px]"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
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
                className="mt-1 text-center text-sm font-medium text-muted-foreground"
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
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
