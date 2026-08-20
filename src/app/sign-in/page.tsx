'use client';

// Sign-in/sign-up for the pre-L1 vertical slice, restyled onto the shadcn/ui + Tailwind + Lucide +
// Manrope stack fixed in docs/brand-and-product-foundation.md §5. Same auth behaviour as before
// (email + password, sign-up/sign-in toggle, Supabase calls, redirect to /map) — visual only.
// Real design tokens (accent colour, spacing/type scale) are still owed at L1-F1-T2, so this uses
// shadcn's own neutral default theme rather than inventing brand values.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Mode = 'sign-in' | 'sign-up';

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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-xl">
              {isSignUp ? 'Create your account' : 'Sign in'}
            </CardTitle>
            <CardDescription>
              {isSignUp
                ? 'Save your first place in a minute.'
                : 'Welcome back — your places are waiting.'}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit} noValidate>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Working…
                  </>
                ) : isSignUp ? (
                  'Create account'
                ) : (
                  'Sign in'
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setMode((m) => (m === 'sign-up' ? 'sign-in' : 'sign-up'));
                  setMessage(null);
                }}
              >
                {isSignUp ? 'Have an account? Sign in' : 'New here? Sign up'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </main>
  );
}
