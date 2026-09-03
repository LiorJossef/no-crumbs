import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { createClient } from '@/app/_lib/supabase/server';
import { signOut } from '@/app/actions/sign-out';
import { loadAccountName } from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/nav/bottom-nav';
// From the metrics module, never from `bottom-nav` itself: this is a Server Component, and a
// non-component export of a `'use client'` module arrives here as a client reference rather than
// the number 68. `/profile` records the same trap; it silently produced `padding-bottom: 0`.
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';
import { HEADER_BACK_CONTROL, PageHeader } from '@/components/nav/page-header';
import { SECTION_LABEL } from '@/ui/place/section-label';
import { getSpots } from '@/app/map/_lib/get-spots';
import { toMapPlace } from '@/app/map/_lib/to-map-place';
// Three modules that still live under `app/profile/`: `ThemeChoice` is imported by the account menu
// as well and its path is written into `globals.css`, `lib/theme.ts` and two test files, and
// `AccountActions` sits next to the `_lib` pair that computes its pre-check. Moving them would buy
// a tidier path and cost every one of those references.
import { AccountActions } from '@/app/profile/account-actions';
import { ThemeChoice } from '@/app/profile/theme-choice';
import { checkDeletionBlocked } from '@/app/profile/_lib/deletion-block';
import { BackControl } from './back-control';
import { AccountNameForm } from './name-form';
import { PeerLabelForm } from './peer-label-form';

export const metadata = { title: 'Account settings' };

/**
 * **Account settings — everything about your account that you *change*.** Owner, 2026-09-03: the
 * line between this page and `/profile` is read versus change. `/profile` is the bottom-bar tab and
 * it reports — who you are, what your library adds up to — with nothing to press on it but the way
 * through to here. Everything that writes something lives on this page: your two names, the theme,
 * sign out, and delete-my-data last.
 *
 * (An earlier pass folded this route into `/profile` and left it a redirect. That was reversed
 * before it shipped; the URL is a real page again and the account menu points at it again.)
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
  //
  // `checkDeletionBlocked` rides along rather than running when the control is opened, so the
  // delete flow shows the correct branch with no round trip. It is a courtesy, not the authority:
  // `deleteAccount` re-runs the same check twice regardless (`overnight-deletion-review.md` §3.3),
  // because between this render and that action a stranger holding an invite token can join a
  // collection this answer just cleared.
  const [name, library, deletionBlock] = await Promise.all([
    loadAccountName(),
    getSpots().then((spots) => spots.map(toMapPlace)),
    checkDeletionBlocked(),
  ]);
  // A check that could not run yields no blocking collections *here* and a refusal *there*: the
  // action fails closed and says so. Offering the control and failing honestly beats hiding the one
  // control on this page a user has a right to.
  const blocking = deletionBlock.ok ? deletionBlock.blocking : [];

  return (
    <main className="flex min-h-dvh w-full flex-col bg-background">
      <BottomNav places={library} />

      {/* The shared header — `PageHeader` carries the column geometry and the argument for it.
          What is local here is the control: it renders at **every** breakpoint, unlike
          `/profile`'s. That page is a bottom-bar tab, so the bar is its way back; this one is not
          on the bar, and a phone arriving from the account menu had no exit but the Map tab, which
          throws away where you were. */}
      <PageHeader
        title="Account settings"
        back={<BackControl className={HEADER_BACK_CONTROL} />}
      />

      <div
        className="mx-auto w-full max-w-140 px-4"
        style={{
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom) + 1.5rem)`,
        }}
      >
        <AccountNameForm firstName={name?.firstName ?? null} lastName={name?.lastName ?? null} />
        <PeerLabelForm
          displayName={name?.displayName ?? null}
          // The suggestion, and only where there is nothing stored. Never the email: this page has
          // the address in `user.email` and deliberately does not pass it — see `PeerLabelForm`.
          suggestion={name?.firstName ?? null}
        />

        {/* Its own client island — the rest of this page is a server component all the way down,
            and a `localStorage` preference is the only thing on it that cannot be.

            **The hairline stays here and only here.** Each name section is a card now, so a rule
            between them would draw the same edge twice; this one is the boundary between the
            carded region above and the un-carded controls below it. */}
        <section
          aria-labelledby="appearance"
          className="mt-6 border-t border-border/60 pt-6"
          data-theme-choice
        >
          <h2 id="appearance" className={SECTION_LABEL}>
            Appearance
          </h2>
          <ThemeChoice labelledBy="appearance" />
        </section>

        {/* The exits, last, and ordered by what they cost. Neither is `destructive` — the
            palette's destructive role is reserved for controls that destroy, and the only one on
            this page is the confirm inside the delete disclosure.

            **Both exits are now the same family** (owner, 2026-09-03: sign out *"doesn't match the
            design"*). It was a bordered `outline` button sitting directly on top of a `text-xs`
            muted disclosure row — two controls doing the same kind of job, drawn from two different
            vocabularies, and the louder of the two was the one at the very bottom of a settings
            page. `Sign out` came down to `ghost` rather than the delete row coming up: these are
            exits, not the page's work — quiet text controls, one step apart in weight, in the order
            they cost. The only bordered boxes on the page are the two name cards above, which is
            the distinction being drawn.

            **The class string is character-for-character the account menu's.** The two sign-outs
            were an `h-8` `-ms-2.5` button here and an `h-11 w-full` one there — different size,
            different padding, one full width — for the single most consequential press on either
            surface. `h-11` is the 44 px floor every target in this product is built to; `-ms-2`
            cancels the `px-2` so the label starts on the same line as everything else in the
            column, including the delete row under it, which has no padding of its own.

            Still a plain `<form>` posting to the server action: this is the one control on the page
            that has to work with JavaScript off. */}
        {/* **Labelled, not headed** — the controls name themselves, so a kicker over them would
            restate its own stack (overwhelm audit §5c). The section keeps its accessible name, so
            the landmark and the document outline are unchanged. */}
        {/* No rule of its own: `AccountActions` draws one above the delete row, and a second one
            here put three hairlines in the bottom third of the page. Two is the hierarchy — one
            under the fields, one separating the two exits. */}
        <section aria-label="Your account" className="mt-6">
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="h-11 justify-start px-2 -ms-2 text-sm">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </form>
          <AccountActions blocking={blocking} />
        </section>
      </div>
    </main>
  );
}
