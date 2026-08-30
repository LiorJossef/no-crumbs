import { BottomNav } from '@/components/nav/bottom-nav';
import { BOTTOM_NAV_HEIGHT_PX } from '@/components/nav/bottom-nav-metrics';
import { Skeleton } from '@/components/ui/skeleton';
import { HALF_FRACTION } from '@/components/shell/sheet-geometry';

/**
 * The shell, without the map — what both collections routes look like while their queries run.
 *
 * ## Why the map is not here
 *
 * A loading state that mounted MapLibre would pay the map's whole mount cost — a GL context, a
 * style fetch, the pin bitmaps — for a surface that is about to be replaced by one that mounts it
 * again. So the map's area is left as the page background and the *sheet* is what this reproduces,
 * because the sheet is where the content the user asked for appears and the sheet is what has to
 * not move when it does.
 *
 * ## Why the geometry is copied rather than imported
 *
 * `map-shell.tsx` builds this shape out of `Drawer.Content` and a `pointer-events` island, both of
 * which need the client hooks and the vaul root that this file exists to avoid. So the sheet's
 * chrome — `rounded-t-2xl`, the top hairline, the card surface, the handle's `h-1 w-9` — is
 * restated here to match it.
 *
 * Two numbers are **imported** rather than restated, because they are the two that move: the sheet's
 * resting height comes from `HALF_FRACTION` in `sheet-geometry.ts`, and the bar's height from
 * `bottom-nav-metrics.ts`. The desktop panel's width is the one thing still copied
 * (`map-shell.tsx:256`), and it is a bracket in a codebase that bans them: there is no token for it,
 * `query-rect.ts:29` already carries a second copy in a comment because the camera has to know it,
 * and adding a third is worse than the bracket. It should become a token in a file this package
 * does not own.
 */
export function CollectionsShellSkeleton({
  /** Which stop the real route's sheet rests at. `/collections` opens at `full`, `/collections/[id]`
   *  at `half` — so the skeleton comes to rest exactly where the sheet will. */
  restingStop,
  children,
}: {
  restingStop: 'full' | 'half';
  children: React.ReactNode;
}) {
  // `Math.round(x * 1000) / 10` for the same reason `sheet-geometry.ts` does it: `0.55 * 100` is
  // `55.00000000000001` in IEEE 754, and that string would reach the browser verbatim.
  const sheetHeight =
    restingStop === 'full' ? '100dvh' : `${Math.round(HALF_FRACTION * 1000) / 10}dvh`;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      {/* Rendered with no `places`, which keeps the tabs live through the load. See
          `app/profile/loading.tsx` for what that costs and why it is still the right trade. */}
      <BottomNav />

      {/* The mobile sheet. `fixed`, so it sits over the empty map area exactly as the real one sits
          over the map. */}
      <div
        aria-hidden
        style={{ height: sheetHeight }}
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-dvh flex-col rounded-t-2xl border-t border-border/70 bg-card shadow-sheet lg:hidden"
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-border" />
        <div
          className="min-h-0 flex-1 overflow-hidden px-4"
          style={{ paddingBottom: `${BOTTOM_NAV_HEIGHT_PX}px` }}
        >
          {children}
        </div>
      </div>

      {/* The `lg+` panel. Same width, same hairline, same material as the shell's. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 z-20 hidden w-[clamp(320px,26vw,392px)] flex-col border-r border-border/70 bg-card/85 px-4 pt-4 backdrop-blur-md lg:flex"
      >
        {children}
      </div>
    </main>
  );
}

/**
 * One collection row's placeholder.
 *
 * `min-h-19` is 76px — the real row's `min-h-[76px]`, written as a spacing utility rather than a
 * bracket. The three lines are the row's own: the name at `text-base`, the count line at 13px and
 * the description this run gave it, plus the category strip under them.
 */
export function CollectionRowSkeleton() {
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <div className="flex min-h-19 items-center gap-3 px-1 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-52" />
          <Skeleton className="mt-0.5 h-1.5 w-24 rounded-full" />
        </div>
        <Skeleton className="size-4 shrink-0" />
      </div>
    </li>
  );
}

/**
 * One place row's placeholder, for the collection detail.
 *
 * Matches `PlaceRow` in `components/sheet/place-sheet.tsx`: `min-h-16`, `items-start`, `gap-3`,
 * `py-3.5`, an `size-11 rounded-lg` media block and a two-line column. **That row is owned by
 * another lane and changed during this run** (W5-1 added the media block and the elapsed line), so
 * this is the shape to re-check first if the two ever stop lining up.
 */
export function PlaceRowSkeleton() {
  return (
    <li className="flex min-h-16 items-start gap-3 border-b border-border/70 py-3.5 last:border-b-0">
      <Skeleton className="mt-0.5 size-11 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
    </li>
  );
}
