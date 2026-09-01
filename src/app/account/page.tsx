import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { createClient } from '@/app/_lib/supabase/server';
import { loadAccountName } from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/nav/bottom-nav';
// From the metrics module, never from `bottom-nav` itself: this is a Server Component, and a
// non-component export of a `'use client'` module arrives here as a client reference rather than
// the number 68. `/profile` records the same trap; it silently produced `padding-bottom: 0`.
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';
import { getSpots } from '@/app/map/_lib/get-spots';
import { toMapPlace } from '@/app/map/_lib/to-map-place';
import { AccountNameForm } from './name-form';
import { PeerLabelForm } from './peer-label-form';

export const metadata = { title: 'Account settings' };

/**
 * **Account settings — where you change your name.** Reached from the account menu, and from
 * nowhere else.
 *
 * ## Two names, two audiences, two forms, two submit buttons
 *
 * This is the whole design and it is not a layout preference. `0035_names_at_sign_up.sql` keeps a
 * person's given name (`profile_names`, private to its owner) apart from the label their collection
 * peers see (`profiles.display_name`), and **deleted a trigger that derived the second from the
 * first** under a security veto. The rule survives only if the *interface* keeps them apart too: a
 * single form with one `Save` would make correcting a typo in your first name a silent write of
 * that name into a column strangers read.
 *
 * So the page is two independent forms. Pressing save under `Your name` cannot touch
 * `display_name`; pressing save under `What people call you` is the confirmation that makes a
 * suggestion into a choice. `PeerLabelForm` carries the prefill-never-fallback argument in full;
 * it is not mine — `src/domain/collections/collection.ts:159-168` wrote it about the email address
 * and `0035` quotes it back about the given name.
 *
 * ## What is deliberately not here
 *
 * **Not a settings section.** `/profile` has said for a while that one setting is not a settings
 * section, and that still holds: this page exists because a *name* is a thing a person changes and
 * there was nowhere to change it. No units, no notifications, no export. `Appearance` stays in the
 * account menu beside the identity block, where a person looking for "how this looks to me" already
 * is.
 *
 * **No email change and no password change.** Both are Supabase Auth flows with a confirmation
 * round trip each, neither is built, and a settings page that renders a field it cannot save is
 * worse than one that does not offer it.
 *
 * **No avatar.** There is no storage bucket, no upload path and no moderation answer, and an
 * account menu that shows a generic mark is honest. `brand-and-product-foundation.md` does not ask
 * for one.
 */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The same belt-and-braces check every page that renders user data makes; `proxy.ts` has already
  // redirected a signed-out visitor before this runs.
  if (!user) redirect('/sign-in');

  // `getSpots` is the `＋` menu's library, not this page's own content: the bar's create menu
  // searches the array `/map` draws, so a match in that menu is a pin on the map. Without it the
  // menu answers "nothing you've saved matches that" for places the user has, and offers to write
  // a duplicate. `/profile` and `/collections` load it for exactly the same reason.
  const [name, library] = await Promise.all([
    loadAccountName(),
    getSpots().then((spots) => spots.map(toMapPlace)),
  ]);

  return (
    <main className="flex min-h-dvh w-full flex-col bg-background">
      <BottomNav places={library} />

      {/* The same header as `/profile` and `/collections`. The back arrow exists only at `lg`,
          where the bar does not render and there is otherwise no way back to the map. */}
      <header className="flex items-center gap-1 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <Button
          render={<Link href="/map" />}
          nativeButton={false}
          variant="ghost"
          size="icon-lg"
          aria-label="Back to the map"
          className="hidden size-11 rounded-full text-muted-foreground lg:flex"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <h1 className="px-2 font-heading text-lg font-bold tracking-tight lg:px-0">
          Account settings
        </h1>
      </header>

      <div
        className="mx-auto w-full max-w-140 px-4"
        style={{
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom) + 1.5rem)`,
        }}
      >
        <AccountNameForm
          firstName={name?.firstName ?? null}
          lastName={name?.lastName ?? null}
        />

        <PeerLabelForm
          displayName={name?.displayName ?? null}
          // The suggestion, and only where there is nothing stored. Never the email: this page has
          // the address in `user.email` and deliberately does not pass it — see `PeerLabelForm`.
          suggestion={name?.firstName ?? null}
        />
      </div>
    </main>
  );
}
