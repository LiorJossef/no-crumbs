import { BottomNav } from '@/components/nav/bottom-nav';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * What `/profile` looks like while its three queries are in flight.
 *
 * The app directory had **no `loading.tsx` and no `<Suspense>` anywhere** before W5-4, so every tab
 * change waited on the server with the previous screen frozen under it — the phone-app failure
 * mode, where a tap appears not to have registered and gets repeated.
 *
 * ## What is drawn, and what is not
 *
 * The static chrome is real: the header, the heading, the bar. It is route identity rather than
 * data, it is known before the queries return, and drawing a grey box where the word `Profile` goes
 * would be pretending not to know something we do know.
 *
 * The skeleton covers **only what this page always renders** — the account line, the three-figure
 * card and the sign-out button. `Where you save` and `What you save` are omitted rather than
 * mocked: both are conditional on the library being non-empty (`countries.length > 0`), and a
 * skeleton for a section that then does not exist is a promise the data cannot keep. That is the
 * same rule the page itself follows for those two sections and the same one the category filter bar
 * follows.
 *
 * ## `BottomNav` with no props, and the one thing that costs
 *
 * The bar is rendered by each page rather than by a layout, so a loading state without one makes it
 * blink out on every tab change — the single most persistent piece of chrome in the product,
 * disappearing exactly when the user is looking at it. Rendering it here keeps the tabs live, so a
 * slow query can still be navigated away from.
 *
 * Its `places` default to `[]` for the duration, which means the `＋` menu's search would find
 * nothing for the few hundred milliseconds this is on screen. That is a real, if small, wrongness
 * and it is written down rather than hidden: the alternative — a second, static copy of the bar —
 * is a drift risk that outlives the load.
 */
export default function ProfileLoading() {
  return (
    <main className="min-h-dvh w-full bg-background">
      <BottomNav />

      <header
        className="flex items-center gap-1 px-2 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        {/* The `lg`-only back arrow's slot, so the heading does not shift left when the real
            header replaces this one. */}
        <div className="hidden size-11 lg:block" />
        <h1 className="px-2 font-heading text-lg font-bold tracking-tight lg:px-0">Profile</h1>
      </header>

      <div
        aria-hidden
        className="mx-auto w-full max-w-[560px] px-4"
        style={{
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom) + 1.5rem)`,
        }}
      >
        {/* The account line: avatar, name, email, joined date. `size-12` and the three heights are
            the real element's, not approximations of it. */}
        <section className="flex items-center gap-3 py-2">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-1.5 h-4 w-56" />
            <Skeleton className="mt-1.5 h-3 w-28" />
          </div>
        </section>

        <section className="mt-4">
          <Skeleton className="h-3 w-24" />
          {/* The card is drawn for real — border, radius, dividers — because its geometry is fixed
              and only the three numbers are unknown. A grey rectangle the size of the card would
              collapse into it visibly when the figures land. */}
          <div className="mt-2 rounded-xl border border-border bg-card">
            <dl className="grid grid-cols-3 divide-x divide-border">
              {['places', 'cities', 'countries'].map((figure) => (
                <div key={figure} className="flex flex-col-reverse items-center px-2 py-3">
                  <Skeleton className="mt-1 h-3 w-12" />
                  <Skeleton className="h-7 w-10" />
                </div>
              ))}
            </dl>
            <div className="border-t border-border px-3 py-2">
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
        </section>

        {/* `h-12`, the sign-out button's own height. */}
        <Skeleton className="mt-8 h-12 w-full rounded-lg" />
      </div>
    </main>
  );
}
