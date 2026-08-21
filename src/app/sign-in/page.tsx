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
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'sign-in' | 'sign-up';

function PinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 22s-8-7.4-8-12.5A8 8 0 1 1 20 9.5C20 14.6 12 22 12 22Z"
        fill="var(--mint-700)"
      />
      <circle cx="12" cy="9.5" r="3" fill="var(--mint-100)" />
    </svg>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setPending(false);

    if (error) {
      setMessage(error.message);
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

    router.push('/map');
    router.refresh();
  }

  const kicker = isSignUp ? 'Get started' : 'Welcome back';
  const headline = isSignUp ? ['Save your first', 'place.'] : ['Your places', 'are waiting.'];
  const subhead = isSignUp
    ? 'Create an account to start building your map.'
    : 'Sign in to pick up your saved map right where you left it.';

  return (
    <main
      className="relative min-h-dvh overflow-hidden"
      style={{
        background:
          'radial-gradient(130% 110% at 115% -15%, rgba(192,239,229,0.42) 0%, rgba(192,239,229,0) 58%),' +
          'radial-gradient(120% 130% at -15% 118%, rgba(218,245,239,0.28) 0%, rgba(218,245,239,0) 62%),' +
          'radial-gradient(90% 90% at 45% 40%, rgba(241,251,249,0.5) 0%, rgba(241,251,249,0) 70%),' +
          'var(--background)',
      }}
    >
      <div className="relative flex min-h-dvh flex-col lg:flex-row">
        {/* Editorial / hero column — top-aligned + pinned by the form's mt-auto on mobile,
            vertically centered in a flex-1 left panel on desktop. */}
        <div className="relative flex flex-1 flex-col px-6 pt-14 lg:justify-center lg:px-[clamp(48px,7vw,110px)] lg:pt-0">
          <PinMark className="relative z-10 h-[30px] w-[30px] lg:h-9 lg:w-9" />

          <p className="relative z-10 mt-4 text-[11px] font-bold tracking-[0.14em] text-[var(--mint-700)] uppercase lg:mt-6 lg:text-[13px]">
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
                    <span className="font-bold text-[var(--mint-700)]">Sign in</span>
                  </>
                ) : (
                  <>
                    New here? <span className="font-bold text-[var(--mint-700)]">Create an account</span>
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
