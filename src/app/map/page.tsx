import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/app/_lib/supabase/server';
import type { MapPlace } from '@/components/map/map-surface';
import {
  getCollection,
  getCollectionMemberships,
  getCollections,
} from '@/app/collections/_lib/get-collections';
import { getSpots } from './_lib/get-spots';
import { toMapPlace } from './_lib/to-map-place';
import { viewFromSearchParams } from './_lib/drawer-view';
import { MapPageClient } from './map-page-client';
import { ShellWordmark } from './shell-wordmark';

// Placeholder for the real map (a separate task). Belt-and-suspenders auth check: the middleware
// already redirects an unauthenticated visitor server-side, but every doc under docs/ that
// mentions Supabase Auth repeats the same rule — a page that renders user data must call
// getUser() itself rather than trust a layer above it.
/**
 * The tab, the bookmark and the link preview.
 *
 * `/collections` carried `title: 'Collections'` before the merge, and losing it would have left
 * every collections URL wearing the root default — *"No Crumbs — your saved places, on one map"* —
 * which is a sentence about the places view. The two collections views share one title rather than
 * naming the open collection: doing that needs a second `getCollection` for `generateMetadata`,
 * because Supabase queries are not deduped across the two calls, and a tab title is not worth a
 * round trip. `%s · No Crumbs` is the root template.
 *
 * The places view returns nothing, so it keeps the root default, which is written for it.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = viewFromSearchParams(await searchParams);
  return view.kind === 'places' ? {} : { title: 'Collections' };
}

/**
 * **The whole app shell, on one route segment.**
 *
 * `/map` is the places view, `/map?view=collections` the collections index and
 * `/map?view=collections&collection=<id>` one collection. They were three sibling segments until
 * 2026-08-31, and the App Router's answer to a segment change is to unmount the outgoing subtree —
 * which took the drawer, the vaul root inside it and every piece of state either held.
 * `_lib/drawer-view.ts` has the measurement, the URL vocabulary and why the two alternatives are
 * worse. `app/collections/page.tsx` and `app/collections/[id]/page.tsx` are redirects, kept
 * forever.
 */
export default async function MapPage({
  searchParams,
}: {
  /**
   * Three params, and only one of them is state.
   *
   * `?view=` and `?collection=` **address the view** — back, forward and a deep link all have to
   * work, which is the whole point of putting them in the URL rather than in a client state cell.
   *
   * `?place=<saved place id>` is a **handoff**, not state: the create menu on a view with no map
   * detail of its own writes it (`components/nav/bottom-nav.tsx`), and the client consumes it once
   * and strips it from the URL. Selection stays client state (`ux-architecture.md` §1.5).
   *
   * All three are read here rather than with `useSearchParams`, because this page is already a
   * Server Component with the values in hand — what the App Router docs recommend, and what keeps
   * the client tree out of a Suspense boundary it does not otherwise need.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const params = await searchParams;
  const view = viewFromSearchParams(params);
  const revealPlaceId = typeof params.place === 'string' ? params.place : undefined;

  /**
   * Every view's data, in parallel, and **the collections reads are skipped on the places view**.
   *
   * So `/map` makes exactly the two round trips it made before this segment absorbed collections;
   * the extra ones are paid on the view that needs them, one RSC request after the switch is
   * pressed. The library and the memberships are read on all three: the memberships answer "which
   * collections is this place already in" before the `Add to a collection` row is tapped, and the
   * library is the places view's pins, the index's pins, the `＋` menu's search and a collection's
   * picker.
   */
  const [spots, memberships, collections, collection] = await Promise.all([
    getSpots(),
    getCollectionMemberships(),
    view.kind === 'places' ? Promise.resolve([]) : getCollections(),
    view.kind === 'collection' ? getCollection(view.id) : Promise.resolve(null),
  ]);

  // `getCollection` returns null both for a collection that does not exist and for one the caller
  // is not a member of. Rendering the same 404 for both is deliberate: telling them apart would
  // make this route an existence oracle for other people's collections. An id that resolves to
  // nothing is a 404 rather than a silent fall back to the map, for the same reason — a URL
  // quietly showing you something it was not asked for is a surface answering a different question.
  if (view.kind === 'collection' && collection === null) notFound();

  const mapPlaces: readonly MapPlace[] = spots.map(toMapPlace);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* **The brand, on the one surface it was missing from** (`I2-8`). `voice-and-vocabulary.md`
          §2's surface 1 is *the shell header wordmark*, specified before iteration 1 and never
          built — so the name lived on `/`, `/sign-in`, the three error screens and the join page,
          and vanished the moment anyone signed in. It is the opposite corner from the account chip
          below, which is the only other thing floating over this map's top band. */}
      <ShellWordmark />

      {/* The map is the shell (ux-architecture §1.1) — no solid app-bar sits above it. Account
          state floats as a single quiet, translucent chip in the safe-area-aware corner, matching
          the "floating controls, 44px, translucent scrim" language in §1.3 and sign-in's own
          restraint (hairline border, no fill block, no shadow-heavy card).

          **This chip is the *desktop* way into `/profile`, and it used to hold sign-out itself.**
          The owner ruled on 2026-08-29 that logging out is not a primary navigation action, and
          then that the chip must not be a second door to the same page on a phone: below `lg` the
          way in is `BottomNav`'s Profile tab, and `hidden lg:flex` here is what stops the map's
          main surface carrying both. Above `lg` the bar does not render at all, so the chip — the
          only account-shaped thing on the desktop map — is the entry point there rather than a new
          piece of chrome being invented for one.

          **`FLOATING_TOP_CHROME_MOBILE_PX` is deliberately not touched.** That 100 px of camera fit
          budget was sized for this chip plus the post-import confirmation strip that stacks under
          it, and with the chip gone below `lg` it now over-reserves by roughly the chip's height.
          The effect is a slightly low fit, not a hidden pin; changing it is a camera change with
          `L2-COLL-CAM-2` already open against the same function, and the owner is taking it
          separately. */}
      <Link
        href="/profile"
        aria-label={`Your profile, signed in as ${user.email ?? 'this account'}`}
        className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 hidden h-11 items-center gap-1.5 rounded-full border border-border/70 bg-card/85 pl-3.5 pr-3 shadow-[var(--shadow-elevated)] backdrop-blur-md transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:right-4 lg:top-4 lg:flex"
      >
        {/* `leading-5`: `truncate` clips to the line-height, `text-xs` sets it to 16px, and this
            font's inline box at 12px is 17px. Same one-pixel shave `place-enrichment.tsx` records,
            and an account identifier is the last string in the product that should be guessing
            which alphabet it will be handed. */}
        <span className="max-w-[9rem] truncate text-xs font-bold leading-5 text-foreground sm:max-w-[14rem]">
          {user.email}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      {/* Selection state (map pin → sheet detail, S5) is client-only per `docs/ux-architecture.md`
       *  §1.5 — it is never a URL in this slice — so it is lifted into a client component rather
       *  than living in this server component. */}
      <MapPageClient
        view={view}
        places={mapPlaces}
        collections={memberships}
        collectionSummaries={collections}
        collection={collection}
        currentUserId={user.id}
        {...(revealPlaceId ? { revealPlaceId } : {})}
      />
    </main>
  );
}
