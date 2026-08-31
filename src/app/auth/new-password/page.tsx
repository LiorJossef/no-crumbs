/**
 * **`/auth/new-password` — and the check is on the server, before the form exists.**
 *
 * `src/proxy.ts` protects `/map` and nothing else, so this route is not behind the middleware and
 * must decide for itself. It uses `getUser()` rather than `getSession()`, which is the distinction
 * Supabase's own server docs require and this repository already follows in `proxy.ts`: `getSession`
 * trusts the cookie payload, `getUser` validates the token against the auth server. On a screen
 * whose whole purpose is to change a credential, trusting a cookie is not a shortcut worth having.
 *
 * A visitor with no session is not an error and not a 404 — it is the ordinary case of an expired
 * link, of a link opened in the wrong browser (PKCE binds it to the one that asked), or of a
 * bookmark. All three get the same screen and the same next move, because the person's next action
 * is identical in all three and a taxonomy nobody acts on is our machinery on their screen.
 */
import Link from 'next/link';

import { createClient } from '@/app/_lib/supabase/server';
import { ChromeGround } from '@/components/brand/chrome-ground';
import { ChromeItem, ChromeKicker, ChromeStage } from '@/components/brand/chrome-stage';
import { DISPLAY_HEADING_AXES } from '@/components/brand/display-type';
import { Button } from '@/components/ui/button';

import { RESET_REQUEST_PATH } from '../_lib/routes';
import { NEW_PASSWORD_EXPIRED_COPY } from '../_lib/copy';
import { NewPasswordScreen } from './new-password-client';

export default async function NewPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return <NewPasswordScreen />;

  return (
    <main className="relative isolate min-h-dvh">
      <ChromeGround />

      <ChromeStage
        editorial={
          <>
            <ChromeItem step={1}>
              <ChromeKicker>{NEW_PASSWORD_EXPIRED_COPY.kicker}</ChromeKicker>
            </ChromeItem>

            <ChromeItem step={2}>
              <h1
                className="font-display text-display font-bold tracking-tight text-foreground lg:text-display-lg"
                style={DISPLAY_HEADING_AXES}
              >
                {NEW_PASSWORD_EXPIRED_COPY.headline[0]}
                <br />
                {NEW_PASSWORD_EXPIRED_COPY.headline[1]}
              </h1>
            </ChromeItem>

            <ChromeItem step={3}>
              <p className="max-w-xs text-sm font-medium leading-snug text-muted-foreground lg:max-w-sm lg:text-base">
                {NEW_PASSWORD_EXPIRED_COPY.subhead}
              </p>
            </ChromeItem>
          </>
        }
        form={
          <ChromeItem step={4} className="flex flex-col">
            <Button
              render={<Link href={RESET_REQUEST_PATH} />}
              nativeButton={false}
              className="h-12 w-full rounded-lg text-base font-bold hover:shadow-cta-halo lg:h-13 lg:text-reading"
            >
              {NEW_PASSWORD_EXPIRED_COPY.action}
            </Button>
          </ChromeItem>
        }
      />
    </main>
  );
}
