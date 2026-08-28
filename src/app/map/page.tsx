import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/app/_lib/supabase/server';
import { signOut } from '@/app/actions/sign-out';
import { Button } from '@/components/ui/button';
import type { MapPlace } from '@/components/map/map-surface';
import type { Spot } from '@/domain/places/spot';
import { getSpots } from './_lib/get-spots';
import { MapPageClient } from './map-page-client';

// `Spot` (the real, richer read model, `domain/places/spot.ts`) adapted to the map surface's
// port. `MapPlace` is the shared port every map implementation depends on, so — same as the
// fixture mapping this replaces — the mapping lives here rather than inside either type. Each
// mapped object also carries the full `Spot` under `detail`, so the sheet/panel's own upcoming
// edit can read the richer fields (`reason`, `source.media`, `provenance`, ...) without this file
// or `map-page-client.tsx` changing again.
function toMapPlace(spot: Spot): MapPlace {
  return {
    id: spot.id,
    name: spot.name,
    category: spot.category,
    lat: spot.lat,
    lng: spot.lng,
    note: spot.note ?? '',
    sourceUrl: spot.sourceUrl ?? spot.source?.canonicalUrl,
    detail: spot,
  };
}

// Placeholder for the real map (a separate task). Belt-and-suspenders auth check: the middleware
// already redirects an unauthenticated visitor server-side, but every doc under docs/ that
// mentions Supabase Auth repeats the same rule — a page that renders user data must call
// getUser() itself rather than trust a layer above it.
export default async function MapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const spots = await getSpots();
  const mapPlaces: readonly MapPlace[] = spots.map(toMapPlace);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* The map is the shell (ux-architecture §1.1) — no solid app-bar sits above it. Account
          state floats as a single quiet, translucent chip in the safe-area-aware corner, matching
          the "floating controls, 44px, translucent scrim" language in §1.3 and sign-in's own
          restraint (hairline border, no fill block, no shadow-heavy card). */}
      <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-11 items-center gap-1 rounded-full border border-border/70 bg-card/85 pl-3.5 pr-1.5 shadow-[var(--shadow-elevated)] backdrop-blur-md lg:right-4 lg:top-4">
        <p className="max-w-[9rem] truncate text-xs font-medium text-muted-foreground sm:max-w-[14rem]">
          <span className="font-bold text-foreground">{user.email}</span>
        </p>
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            className="rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-3.5" aria-hidden />
          </Button>
        </form>
      </div>

      {/* Selection state (map pin → sheet detail, S5) is client-only per `docs/ux-architecture.md`
       *  §1.5 — it is never a URL in this slice — so it is lifted into a client component rather
       *  than living in this server component. */}
      <MapPageClient places={mapPlaces} />
    </main>
  );
}
