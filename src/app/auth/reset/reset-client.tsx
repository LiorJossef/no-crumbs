'use client';

/**
 * **`/auth/reset` — ask for a recovery link.**
 *
 * `resetPasswordForEmail` appeared nowhere in `src/` before this file. A forgotten password was
 * permanent, total loss of the map — the one artefact this product asks people to build over months
 * — against a six-character minimum with no composition rule
 * (`product-review-2026-08-31-r1.md` finding 3).
 *
 * ## It is the sign-in screen's composition, deliberately
 *
 * `ChromeStage` is the same object `/` and `/sign-in` are drawn as, for the reason
 * `join-client.tsx` gives about its own shell: a visitor bounces between these screens inside one
 * task, and two arrangements of the same parts read as two products. Nothing new is invented here.
 *
 * ## What it does not say
 *
 * **It never confirms whether an address has an account.** Supabase's own call succeeds either way
 * and this screen must not be more informative than that, or it becomes a way to test whether a
 * given person uses this product. The settled state is hedged in the copy — `RESET_SENT_COPY` — and
 * there is deliberately nothing in the code to branch on.
 *
 * **And it does not carry the email in a URL.** The sign-in screen links here without the address
 * the visitor had already typed, which is a real cost in keystrokes and the right call: a query
 * string is written to history and to whatever logs sit downstream, and `security.md` §6 already
 * refuses a full address on a shared surface.
 *
 * ## The one behaviour worth knowing
 *
 * `@supabase/ssr` forces PKCE, so asking for a link writes a code verifier into **this browser's**
 * cookie jar and the link only completes here. `RESET_SENT_COPY.browser` says so before the visitor
 * leaves the screen rather than after they have opened it on a phone. The client is constructed
 * with the default persistent cookie lifetime and not with `rememberMe: false`, and that is
 * load-bearing: people close the browser between asking for a link and clicking it, and a
 * session-lifetime verifier would make that the normal way this flow fails.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { ChromeGround } from '@/components/brand/chrome-ground';
import { ChromeItem, ChromeKicker, ChromeStage } from '@/components/brand/chrome-stage';
import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { AUTH_CALLBACK_PATH, SIGN_IN_PATH } from '../_lib/routes';
import { RECOVERY_TYPE } from '../_lib/callback-destination';
import { LINK_EXPIRED_NOTICE, RESET_REQUEST_COPY, RESET_SENT_COPY } from '../_lib/copy';

/**
 * The absolute URL the recovery link comes back to.
 *
 * `window.location.origin`, so a preview deployment recovers against itself rather than bouncing
 * everybody to production. Supabase validates the whole thing against the project's redirect
 * allow-list before it is put in an email, which is what makes reading an origin from the browser
 * safe — a host that is not ours is refused there.
 *
 * `type=recovery` is our own marker, and the callback reads it to choose between two paths written
 * in its own source. It is not a destination. See `callback-destination.ts`.
 */
function recoveryRedirect(): string {
  const url = new URL(AUTH_CALLBACK_PATH, window.location.origin);
  url.searchParams.set('type', RECOVERY_TYPE);
  return url.toString();
}

export function ResetPasswordScreen({
  /** True when `/auth/callback` sent a dead recovery link here. Parsed on the server, in `page.tsx`,
   *  for the same reason `/sign-in` reads its mode there: it is on screen at first paint, and a
   *  client-side read of `location` is either a Suspense boundary or a hydration mismatch. */
  expired,
}: {
  expired: boolean;
}) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirect(),
    });

    setPending(false);

    if (error) {
      /*
       * The only failure a person can act on is being asked to wait. Everything else — including a
       * provider outage — resolves to the settled state, because the alternative is a screen that
       * distinguishes *this address has no account* from *the send failed*, and the first of those
       * is the enumeration this flow refuses to offer. `error.message` never reaches the user.
       */
      const rateLimited =
        error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit';
      if (rateLimited) {
        setMessage("You've tried this a few times. Give it a few minutes.");
        return;
      }
      console.error('resetPasswordForEmail failed', { code: error.code });
    }

    setSent(true);
  }

  const copy = sent ? RESET_SENT_COPY : RESET_REQUEST_COPY;

  return (
    <main className="relative isolate min-h-dvh">
      <ChromeGround />

      <ChromeStage
        editorial={
          <>
            <ChromeItem step={1}>
              <ChromeKicker>{copy.kicker}</ChromeKicker>
            </ChromeItem>

            <ChromeItem step={2}>
              <h1
                className="font-display text-display font-bold tracking-tight text-foreground lg:text-display-lg"
                style={DISPLAY_HEADING_AXES}
              >
                {copy.headline[0]}
                <br />
                {copy.headline[1]}
              </h1>
            </ChromeItem>

            <ChromeItem step={3}>
              <p className="max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-sm lg:text-base">
                {copy.subhead}
              </p>
            </ChromeItem>
          </>
        }
        form={
          sent ? (
            <div className="flex flex-col gap-4 lg:gap-5">
              <ChromeItem step={4}>
                <p className="text-sm font-medium leading-snug text-foreground lg:text-reading">
                  {RESET_SENT_COPY.browser}
                </p>
              </ChromeItem>

              <ChromeItem step={5} className="flex flex-col">
                <Link
                  href={SIGN_IN_PATH}
                  className="group/switch flex min-h-11 items-center justify-center gap-1 rounded-lg text-center text-sm font-medium text-muted-foreground outline-none motion-safe:transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="font-bold text-brand underline-offset-4 group-hover/switch:underline group-focus-visible/switch:underline">
                    {RESET_SENT_COPY.back}
                  </span>
                </Link>
              </ChromeItem>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 lg:gap-5">
              {expired && (
                <p role="status" className="text-sm text-destructive">
                  {LINK_EXPIRED_NOTICE}
                </p>
              )}

              {/* The email field is `/sign-in`'s field, class for class: the same label treatment,
                  the same `focus-within` brightening and the same inset well. That file's comments
                  carry the contrast measurements behind every one of those choices. */}
              <ChromeItem step={4} className="group/field flex flex-col gap-1.5">
                <Label
                  htmlFor="email"
                  className="text-micro font-bold tracking-[0.1em] text-muted-foreground uppercase motion-safe:transition-colors group-focus-within/field:text-foreground"
                >
                  {RESET_REQUEST_COPY.emailLabel}
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={RESET_REQUEST_COPY.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                      {/* `hidden motion-safe:block`, not a guarded `animate-spin`: a stationary
                          three-quarter arc reads as a rendering artefact rather than as a paused
                          spinner. `/sign-in`'s button carries the full argument. */}
                      <Loader2
                        className="hidden size-4 motion-safe:block motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                      {RESET_REQUEST_COPY.pending}
                    </>
                  ) : (
                    RESET_REQUEST_COPY.submit
                  )}
                </Button>

                <Link
                  href={SIGN_IN_PATH}
                  className="group/switch mt-3 flex min-h-11 items-center justify-center gap-1 rounded-lg text-center text-sm font-medium text-muted-foreground outline-none motion-safe:transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="font-bold text-brand underline-offset-4 group-hover/switch:underline group-focus-visible/switch:underline">
                    {RESET_REQUEST_COPY.back}
                  </span>
                </Link>
              </ChromeItem>
            </form>
          )
        }
      />
    </main>
  );
}
