'use client';

/**
 * **The last step of a recovery: set the password, then leave.**
 *
 * The session this form runs against was created by `/auth/callback` exchanging the code out of the
 * email link, so by the time this renders the person is signed in. That is how Supabase recovery
 * works and it is worth stating plainly rather than leaving implicit: **a recovery link is a login**.
 * It is also why the screen above it is a Server Component that checks for a session first — a form
 * that cannot succeed should not be drawn.
 *
 * ## Two things it does that a bare `updateUser` would not
 *
 * **It ends the other sessions.** A password reset is very often a reset *because* somebody else
 * has the old one, and leaving their session alive is the failure the reset was supposed to
 * prevent. `signOut({ scope: 'others' })` is best-effort and deliberately non-blocking: the
 * password is already changed by then, and turning a cleanup failure into a red line on this screen
 * would tell the user their reset did not work when it did.
 *
 * **No provider string reaches the screen.** `NEW_PASSWORD_ERROR_COPY` is a closed set, the same
 * discipline `authErrorMessage` applies on `/sign-in`, and the default is a sentence of our own
 * rather than `error.message` — Supabase's copy assumes a product with phone auth.
 *
 * ## What is deliberately not built
 *
 * **No "confirm password" second field.** The value is typed once, into a field the browser's
 * password manager can see and fill, and the recovery flow is repeatable at no cost if it goes
 * wrong — a mistyped password is one more email, not a lockout. A confirm field is insurance
 * against a failure mode this flow already has a cheap answer to.
 *
 * **No current-password check.** It would be theatre here: the caller already holds a session, and
 * a session can call `updateUser` against the anon key directly with no screen involved. The real
 * control for that is Supabase's own `secure_password_change`, which is a project setting and not
 * code — flagged for the owner rather than faked here.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { AuthError } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import { DEFAULT_AFTER_SIGN_IN } from '@/domain/auth/return-path';
import { ChromeGround } from '@/components/brand/chrome-ground';
import { ChromeItem, ChromeKicker, ChromeStage } from '@/components/brand/chrome-stage';
import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { NEW_PASSWORD_COPY, NEW_PASSWORD_ERROR_COPY } from '../_lib/copy';

/** Supabase's codes → our sentences. Unknown codes get our own line, never the provider's. */
export function newPasswordErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'weak_password':
      return NEW_PASSWORD_ERROR_COPY.weak;
    case 'same_password':
      return NEW_PASSWORD_ERROR_COPY.same;
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'session_expired':
      return NEW_PASSWORD_ERROR_COPY.expired;
    case 'over_request_rate_limit':
      return NEW_PASSWORD_ERROR_COPY.rateLimited;
    default:
      return NEW_PASSWORD_ERROR_COPY.unknown;
  }
}

export function NewPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPending(false);
      setMessage(newPasswordErrorMessage(error));
      return;
    }

    // Best-effort, and after the change rather than before it: whoever prompted the reset loses
    // their session, and a failure here is not something to report on a screen whose work is done.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
    if (signOutError) console.error('post-reset signOut(others) failed', { code: signOutError.code });

    router.push(DEFAULT_AFTER_SIGN_IN as '/map');
    router.refresh();
  }

  return (
    <main className="relative isolate min-h-dvh">
      <ChromeGround />

      <ChromeStage
        editorial={
          <>
            <ChromeItem step={1}>
              <ChromeKicker>{NEW_PASSWORD_COPY.kicker}</ChromeKicker>
            </ChromeItem>

            <ChromeItem step={2}>
              <h1
                className="font-display text-display font-bold tracking-tight text-foreground lg:text-display-lg"
                style={DISPLAY_HEADING_AXES}
              >
                {NEW_PASSWORD_COPY.headline[0]}
                <br />
                {NEW_PASSWORD_COPY.headline[1]}
              </h1>
            </ChromeItem>

            <ChromeItem step={3}>
              <p className="max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-sm lg:text-base">
                {NEW_PASSWORD_COPY.subhead}
              </p>
            </ChromeItem>
          </>
        }
        form={
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 lg:gap-5">
            {/* `/sign-in`'s password field, class for class, including the `focus-within` label
                brightening its comments there measure and justify. */}
            <ChromeItem step={4} className="group/field flex flex-col gap-1.5">
              <Label
                htmlFor="password"
                className="text-micro font-bold tracking-[0.1em] text-muted-foreground uppercase motion-safe:transition-colors group-focus-within/field:text-foreground"
              >
                {NEW_PASSWORD_COPY.passwordLabel}
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder={NEW_PASSWORD_COPY.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-lg border-border bg-background px-4 text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground lg:h-13 lg:px-4.5 lg:text-reading"
              />
            </ChromeItem>

            {message && (
              <p role="status" className="text-sm text-destructive">
                {message}
              </p>
            )}

            <ChromeItem step={5} className="flex flex-col">
              <Button
                type="submit"
                disabled={pending}
                className="h-12 w-full rounded-lg text-base font-bold hover:shadow-cta-halo lg:h-13 lg:text-reading"
              >
                {pending ? (
                  <>
                    <Loader2
                      className="hidden size-4 motion-safe:block motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                    {NEW_PASSWORD_COPY.pending}
                  </>
                ) : (
                  NEW_PASSWORD_COPY.submit
                )}
              </Button>
            </ChromeItem>
          </form>
        }
      />
    </main>
  );
}
