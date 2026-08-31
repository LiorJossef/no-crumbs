import { redirect } from 'next/navigation';

import { drawerHref, viewFromSearchParams } from '@/app/map/_lib/drawer-view';


/**
 * **The collections index's old URL, kept working forever.**
 *
 * `/collections` was a route segment of its own until 2026-08-31, and that is exactly what made
 * switching between places and collections destroy the drawer — a sibling segment change unmounts
 * the whole subtree, sheet included (`app/map/_lib/drawer-view.ts` has the measurement). All three
 * views live on `/map` now, addressed by search params, which is not a mount at all.
 *
 * The path stays because it is in browser history, in bookmarks, in the bar people learned, and in
 * anything anyone has shared. The one thing a URL may not do is stop working.
 *
 * It also forwards `?collection=<id>`, which was this route's canonical shape for part of the same
 * day, so links written during that window resolve too. `viewFromSearchParams` and `drawerHref` are
 * the same pair `/map` uses, so this shim cannot drift from the thing it redirects to.
 *
 * **No auth check and no existence check here**, deliberately: both belong to the page this hands
 * off to, and a membership read here would make *this* route an existence oracle for other
 * people's collections — a 404 for a stranger and a redirect for a member is the difference
 * `getCollection` exists to hide.
 *
 * `307`, which is what `redirect()` issues, rather than a permanent one: this is our routing, it
 * may change again, and a `308` cached in somebody's browser forever is not a thing to hand out for
 * an internal reshuffle.
 */
export default async function CollectionsIndexRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view = viewFromSearchParams(await searchParams);
  // The cast is the one `bottom-nav.tsx` already makes for `/map?place=`: `typedRoutes` types the
  // route literal and has nothing to say about a query string on it.
  redirect(drawerHref(view.kind === 'places' ? { kind: 'index' } : view) as '/map');
}
