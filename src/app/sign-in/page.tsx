'use client';

// Minimal sign-up/sign-in page for the pre-L1 vertical slice (docs/execution-plan.md's deviation
// note). Deliberately one screen, unstyled, no S1/S2 split, no design tokens — this is throwaway
// and gets rebuilt/absorbed into L1-F1.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'sign-in' | 'sign-up';

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);

    const supabase = createClient();
    const { error } =
      mode === 'sign-up'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    setPending(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === 'sign-up') {
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
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 320 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{mode === 'sign-up' ? 'Sign up' : 'Sign in'}</h1>

        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%' }}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%' }}
          />
        </label>

        <button type="submit" disabled={pending}>
          {pending ? 'Working…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'sign-up' ? 'sign-in' : 'sign-up'));
            setMessage(null);
          }}
        >
          {mode === 'sign-up' ? 'Have an account? Sign in' : 'New here? Sign up'}
        </button>

        {message && <p role="status">{message}</p>}
      </form>
    </main>
  );
}
