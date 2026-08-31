import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, UserRound } from 'lucide-react';

import { createClient } from '@/app/_lib/supabase/server';
import { signOut } from '@/app/actions/sign-out';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/nav/bottom-nav';
// From the metrics module, never from `bottom-nav` itself: this is a Server Component, and a
// non-component export of a `'use client'` module arrives here as a client reference rather than
// the number 68. See `bottom-nav-metrics.ts` — it silently produced `padding-bottom: 0`.
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';
import { flagEmoji, normaliseCountryCode } from '@/components/map/country-flag-image';
import { categoryDisplay } from '@/ui/place/category-display';
import { getSpots } from '@/app/map/_lib/get-spots';
import { toMapPlace } from '@/app/map/_lib/to-map-place';
import { AccountActions } from './account-actions';
import { checkDeletionBlocked } from './_lib/deletion-block';
import { getProfilePlaces } from './_lib/get-profile-places';
import { accountIdentity, deriveProfileBreakdown, joinedLabel } from './_lib/profile-stats';

export const metadata = { title: 'Profile' };

/**
 * The account page: who you are signed in as, what your library adds up to, and the way out.
 *
 * **Its job is "what have I built here".** The map answers *where is that place*; nothing in the
 * product could answer *how much have I collected* — and a library that can say `32 places · 2
 * countries` is one that visibly accumulated, which is the honest answer to this product's
 * delayed-value problem (`product-inspiration-plotline-2026-08-29.md` §1 item 21a). So the numbers
 * lead and the account details sit above them quietly.
 *
 * **What it refuses.** No persona, no completion ring, no streak, no badge — §4 refusals 5, 6 and 8
 * of that same document, and `mvp-plan.md` §8. Every figure here is a count of the user's own rows.
 * `Been` sits beside `Not been yet` rather than as `1 of 32`, because a fraction of a library that
 * is not meant to be completed frames it as a failure state.
 *
 * The `Who you save from` section was removed on 2026-08-30 (owner). `creatorBreakdown` still
 * exists and is still tested; nothing renders it.
 *
 * **Still not a settings screen.** There are no settings to keep — no theme, no units, no
 * notifications, no export yet — so this must not grow into the front door of a settings section
 * before there is something to settle.
 *
 * A server component all the way down: nothing is interactive except a form posting to the existing
 * `signOut` server action, so there is no state and no client island.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The same belt-and-braces check every page that renders user data makes.
  if (!user) redirect('/sign-in');

  // `maybeSingle`, not `single`: the signup trigger creates the profile row (`0002`), and its own
  // header says the app must survive that trigger not existing on a hosted project. A missing row
  // costs a display name and a join date, not the page.
  // `getSpots` alongside `getProfilePlaces`, and the second query is not redundant: the profile
  // read is deliberately narrow (its own header says so) while the bar's `＋` menu searches the
  // same library array `/map` draws, so a match in that menu is a pin on the map. Without it the
  // menu answers "nothing you've saved matches that" for places the user has, and offers to write
  // a duplicate.
  // `checkDeletionBlocked` rides along with the other three rather than running when the control is
  // tapped, so the delete flow opens the correct branch with no round trip. It is a courtesy, not
  // the authority: `deleteAccount` re-runs the same check twice regardless
  // (`overnight-deletion-review.md` §3.3), because between this render and that action a stranger
  // holding an invite token can join a collection this answer just cleared.
  const [{ data: profile }, places, library, deletionBlock] = await Promise.all([
    supabase.from('profiles').select('display_name, created_at').eq('id', user.id).maybeSingle(),
    getProfilePlaces(),
    getSpots().then((spots) => spots.map(toMapPlace)),
    checkDeletionBlocked(),
  ]);
  // A check that could not run yields no blocking collections *here* and a refusal *there*: the
  // action fails closed and says so. Offering the control and failing honestly beats hiding the
  // one control on this page a user has a right to.
  const blocking = deletionBlock.ok ? deletionBlock.blocking : [];

  const identity = accountIdentity({
    displayName: profile?.display_name ?? null,
    email: user.email ?? null,
  });
  const joined = joinedLabel(profile?.created_at ? new Date(profile.created_at) : null);
  const { stats, countries, categories } = deriveProfileBreakdown(places);

  return (
    <main className="min-h-dvh w-full bg-background">
      <BottomNav places={library} />

      {/* The same header as `/collections`: the back arrow exists only at `lg`, where the bar does
          not render and there is otherwise no way back to the map. */}
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
        <h1 className="px-2 font-heading text-lg font-bold tracking-tight lg:px-0">Profile</h1>
      </header>

      <div
        className="mx-auto w-full max-w-[560px] px-4"
        style={{
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom) + 1.5rem)`,
        }}
      >
        <section className="flex items-center gap-3 py-2">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <UserRound className="size-5" />
          </span>
          <div className="min-w-0">
            {/* `dir="auto"` on the text and never on the block, which is the pattern the rest of
                the app already follows (`place-enrichment.tsx`, `add-to-collection.tsx`): the
                isolate has to wrap the name so a Hebrew display name — the local database's is
                `מאיה` — shapes right-to-left, while the column it sits in stays left-aligned like
                the email under it. On the `<p>` it also flipped the paragraph's alignment, which
                left the name floating away from the avatar. */}
            <p className="truncate font-heading text-lg font-bold tracking-tight">
              <span dir="auto">{identity.title}</span>
            </p>
            {identity.subtitle ? (
              <p className="truncate text-sm text-muted-foreground">{identity.subtitle}</p>
            ) : null}
            {joined ? <p className="text-xs text-muted-foreground">{joined}</p> : null}
          </div>
        </section>

        {/* The headline. One card with three numbers rather than four boxes: `ux-collections.md`
            §1.1's objection to a card each is the same objection here, and three figures divided by
            hairlines read as one summary instead of a dashboard. */}
        <section aria-labelledby="library-total" className="mt-4">
          <SectionHeading id="library-total">Your library</SectionHeading>
          <div className="mt-2 rounded-xl border border-border bg-card">
            <dl className="grid grid-cols-3 divide-x divide-border">
              <Figure label={stats.saved === 1 ? 'Place' : 'Places'} value={stats.saved} />
              <Figure label={stats.cities === 1 ? 'City' : 'Cities'} value={stats.cities} />
              <Figure
                label={stats.countries === 1 ? 'Country' : 'Countries'}
                value={stats.countries}
              />
            </dl>
            {stats.saved > 0 ? (
              /* Two counts, never a fraction and never a ring — see the header. `Not been yet` is
                 the phrase the library's own visit filter already uses, so the page and the filter
                 say the same thing about the same rows. */
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground tabular-nums">{stats.been}</span> been
                <span aria-hidden> · </span>
                <span className="font-bold text-foreground tabular-nums">{stats.notBeenYet}</span>{' '}
                not been yet
              </p>
            ) : null}
          </div>
          {stats.saved === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing saved yet. Paste a TikTok link and your map starts here.
            </p>
          ) : null}
        </section>

        {/* Each list is omitted rather than shown empty. A heading over nothing is a promise the
            data cannot keep, which is the same rule the category filter bar follows. */}
        {countries.length > 0 ? (
          <section aria-labelledby="countries" className="mt-6">
            <SectionHeading id="countries">Where you save</SectionHeading>
            <ul className="mt-1">
              {countries.map((country) => {
                const code = normaliseCountryCode(country.countryCode);
                return (
                  <Row key={country.countryCode ?? 'unknown'} label={country.label} count={country.count}>
                    {/* The emoji directly, as `ElsewhereSection` does — in the DOM the browser
                        shapes and colours a regional-indicator pair, and a platform with no flag
                        glyphs simply draws nothing beside a row that already names the country. */}
                    {code ? (
                      <span aria-hidden className="text-lg leading-none">
                        {flagEmoji(code)}
                      </span>
                    ) : null}
                  </Row>
                );
              })}
            </ul>
          </section>
        ) : null}

        {categories.length > 0 ? (
          <section aria-labelledby="categories" className="mt-6">
            <SectionHeading id="categories">What you save</SectionHeading>
            <ul className="mt-1">
              {categories.map((facet) => {
                const display = categoryDisplay(facet.category);
                return (
                  <Row
                    key={facet.category}
                    label={display.label ?? facet.category}
                    count={facet.count}
                  >
                    {/* The same dot the list and the detail print, from the same table the map
                        draws its pins from, so a café is one brown word-and-colour everywhere. */}
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: display.color }}
                    />
                  </Row>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* The account block. Sign out is not `destructive` — it destroys nothing, and the
            palette's destructive role is reserved for the things that do. Neither is the delete
            *entry point*, which opens a confirmation; the confirm button inside it gets the
            destructive variant, and it is the only thing on this page that does. */}
        <section aria-labelledby="your-account" className="mt-8">
          <SectionHeading id="your-account">Your account</SectionHeading>
          <form action={signOut} className="mt-2">
            <Button type="submit" variant="outline" size="lg" className="h-12 w-full text-base">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </form>
          <div className="mt-2">
            <AccountActions blocking={blocking} />
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

/**
 * One headline number. `dt`/`dd` inside the card's `dl` so the label and the figure are associated
 * for a screen reader rather than being two unrelated lines that happen to sit in one box.
 *
 * `flex-col-reverse`: `dt` has to precede its `dd` in the DOM to be a valid description list, and
 * the number has to sit above its label to read as a summary. The order a screen reader gets
 * ("Places, 32") is the right one either way.
 */
function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse items-center px-2 py-3">
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-bold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One breakdown row: an optional mark, what it is, and how many. Hairline dividers rather than a
 * card each — `ux-collections.md` §1.1 rules a bordered box per row out as card soup, and this page
 * has three such lists.
 */
function Row({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-border/60 py-2 last:border-b-0">
      {children}
      <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
        {label}
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">{count}</span>
    </li>
  );
}
