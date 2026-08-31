import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/app/_lib/supabase/server';
import type { MapPlace } from '@/components/map/map-surface';
import { getCollectionMemberships } from '@/app/collections/_lib/get-collections';
import { getSpots } from './_lib/get-spots';
import { toMapPlace } from './_lib/to-map-place';
import { MapPageClient } from './map-page-client';
import { ShellWordmark } from './shell-wordmark';

// Placeholder for the real map (a separate task). Belt-and-suspenders auth check: the middleware
// already redirects an unauthenticated visitor server-side, but every doc under docs/ that
// mentions Supabase Auth repeats the same rule — a page that renders user data must call
// getUser() itself rather than trust a layer above it.
export default async function MapPage({
  searchParams,
}: {
  /** `?place=<saved place id>` — a handoff from the create menu on a tab with no map of its own
   *  (`components/nav/bottom-nav.tsx`). Read here rather than with `useSearchParams` because this
   *  page is already a Server Component with the value in hand, which is what the App Router docs
   *  recommend and what keeps the client tree out of a Suspense boundary it does not otherwise
   *  need. The client consumes it once and strips it from the URL. */
  searchParams: Promise<{ place?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Read alongside the library rather than lazily on first open: the "Add to a collection" row has
  // to say which collections a place is already in *before* it is tapped, so the answer has to be
  // in hand when the detail renders.
  const [{ place: revealPlaceId }, [spots, collections]] = await Promise.all([
    searchParams,
    Promise.all([getSpots(), getCollectionMemberships()]),
  ]);
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
        places={mapPlaces}
        collections={collections}
        {...(revealPlaceId ? { revealPlaceId } : {})}
      />
    </main>
  );
}
