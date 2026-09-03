import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Settings, UserRound } from 'lucide-react';

import { createClient } from '@/app/_lib/supabase/server';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/nav/bottom-nav';
// From the metrics module, never from `bottom-nav` itself: this is a Server Component, and a
// non-component export of a `'use client'` module arrives here as a client reference rather than
// the number 68. See `bottom-nav-metrics.ts` — it silently produced `padding-bottom: 0`.
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';
import { HEADER_BACK_CONTROL, PageHeader } from '@/components/nav/page-header';
import { flagEmoji, normaliseCountryCode } from '@/components/map/country-flag-image';
import { categoryColorVar, categoryDisplay } from '@/ui/place/category-display';
import { getSpots } from '@/app/map/_lib/get-spots';
import { toMapPlace } from '@/app/map/_lib/to-map-place';
import { PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';
import { getProfilePlaces } from './_lib/get-profile-places';
import { accountIdentity, deriveProfileBreakdown, joinedLabel } from './_lib/profile-stats';

export const metadata = { title: 'Profile' };

/**
 * The profile page: who you are signed in as, what your library adds up to, and the way through to
 * everything you can change.
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
 * **It reads; it does not change.** Owner, 2026-09-03: the line between this page and `/account`
 * is read versus change. Your names, the theme, sign out and delete-my-data are all things you
 * *do*, and they live on `Account settings`. What is left here is what your library adds up to,
 * which is the rewarding thing to land on from a bottom-bar tab.
 *
 * So the only control is the row that goes to `/account`, and it has to stay: the account menu is a
 * popover and cannot open with scripting off, which makes this row the only door to that page
 * without JavaScript.
 *
 * **A server component with no client islands at all.** The page reads four queries and renders
 * text; `ThemeChoice`, `AccountActions` and the two name forms were the only things on it a server
 * could not answer, and all four are on `/account`. The theme itself still applies here — the head
 * script writes the class before first paint; it is the *control* that moved.
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
  // `profile_names` is its own query rather than an embedded join, and that is not a style choice:
  // it has no foreign key *from* `profiles`, so PostgREST has no relationship to embed through —
  // the key points the other way, `profile_names.profile_id → profiles.id`.
  //
  // **It fails soft, on purpose.** `0035` is the migration that creates this table and it is not
  // applied everywhere yet; where it is missing the query returns `42P01` rather than throwing, and
  // `names?.first_name` is then `undefined`, which `accountIdentity` reads as "no name" — the same
  // state the eight pre-`0035` accounts are in permanently. A missing name costs a line on this
  // page, never the page, which is the rule the `profiles` read above already follows.
  //
  // No row filter beyond `profile_id`: `profile_names_select_own` is the authority and it is keyed
  // on `auth.uid()`, so this can only ever return the caller's own name. The `eq` is there so the
  // planner has an index condition, not as the access control.
  const [{ data: profile }, { data: names }, places, library] = await Promise.all([
    supabase.from('profiles').select('display_name, created_at').eq('id', user.id).maybeSingle(),
    supabase.from('profile_names').select('first_name').eq('profile_id', user.id).maybeSingle(),
    getProfilePlaces(),
    getSpots().then((spots) => spots.map(toMapPlace)),
  ]);

  const identity = accountIdentity({
    firstName: (names as { first_name: string | null } | null)?.first_name ?? null,
    displayName: profile?.display_name ?? null,
    email: user.email ?? null,
  });
  const joined = joinedLabel(profile?.created_at ? new Date(profile.created_at) : null);
  const { stats, countries, categories } = deriveProfileBreakdown(places);

  return (
    // `flex flex-col` so the block below can take `my-auto`. At zero places this page is a third
    // of a phone screen with two thirds of nothing under it — the pattern the Q1 sweep found on six
    // mobile screens and ruled on. A column that genuinely *ends* is centred in what is left rather
    // than anchored to the top with a long tail; when the library fills the lists back in, the
    // content exceeds the space and `my-auto` collapses to nothing, so nothing moves at scale.
    <main className="flex min-h-dvh w-full flex-col bg-background">
      <BottomNav places={library} />

      {/* The shared header — `PageHeader` carries the column geometry and the argument for it.
          What is local here is the control. It is `lg`-only, unlike `/account`'s: this page is a
          bottom-bar tab, so below `lg` the bar is already the way back and a second one would be
          noise. It points at the map, which genuinely is the level above a tab.

          It uses the shared `HEADER_BACK_CONTROL` geometry — it was hand-rolled here and drifted,
          landing on its own row *above* the title and indented to the right of the column the title
          starts on, which read as a mistake rather than a choice. */}
      <PageHeader
        title="Profile"
        back={
          <Button
            render={<Link href="/map" />}
            nativeButton={false}
            variant="ghost"
            size="icon-lg"
            aria-label="Back to the map"
            className={cn(HEADER_BACK_CONTROL, 'hidden lg:inline-flex')}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        }
      />

      <div
        className="mx-auto my-auto w-full max-w-140 px-4"
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
            {/* **The name line renders only when there is a name**, and this is the fix to the
                owner's long-standing "the profile screen shows a demo email" report. It used to
                render `identity.title`, which fell through to the email address when
                `display_name` was null — which it is for every account that predates `0035`. The
                email is still here, one line down, styled as what it is. `accountIdentity`'s
                header carries the whole root cause. */}
            {identity.name !== null ? (
              <p className="truncate font-heading text-lg font-bold tracking-tight">
                <span dir="auto">{identity.name}</span>
              </p>
            ) : null}
            {identity.account !== null ? (
              /* Two weights for one slot: muted underneath a name, ink when it is carrying the
                 block alone. An account with no name is not a broken row — it is the honest
                 answer to *which account is this*, at the size an address deserves rather than at
                 the size a name does. */
              <p
                className={
                  identity.name !== null
                    ? 'truncate text-sm text-muted-foreground'
                    : 'truncate text-sm font-medium text-foreground'
                }
              >
                {identity.account}
              </p>
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
                        draws its pins from, so a café is one brown word-and-colour everywhere.

                        `categoryColorVar`, not `display.color`: the literal is the *light* value
                        and `category-display.ts` says so at the field — it stays a literal because
                        MapLibre and the OpenGraph image genuinely cannot resolve a custom property,
                        and this is neither. The `--category-*` tokens already carried both themes
                        and already switched under `.dark`; they were read by nothing here, so this
                        swatch would have stayed a light-theme brown on the night map's own page.
                        A `var()` follows the theme with no hook, no context and no re-render. */}
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColorVar(facet.category) }}
                    />
                  </Row>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* The way through to everything you can change, and the only one that works without
            JavaScript: the account menu is a popover, so with scripting off this row is the sole
            door to `/account`. A row rather than the full-width button it used to be — it is no
            longer one of three exits stacked at the bottom, it is a destination, so it takes the
            card-and-chevron shape the menu already uses for `Your library`. */}
        <section className="mt-8">
          <Link
            href="/account"
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              PRESS_ROW,
            )}
          >
            <Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-bold">Account settings</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
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
