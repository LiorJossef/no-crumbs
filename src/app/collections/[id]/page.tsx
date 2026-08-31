import { redirect } from 'next/navigation';

import { collectionsHref } from '../_lib/drawer-view';

/**
 * **A collection's old URL, kept working forever.**
 *
 * `/collections/<id>` was a route segment of its own until 2026-08-31, and that is exactly what
 * made opening a collection destroy the drawer — a sibling segment change unmounts the whole
 * subtree, sheet included (`_lib/drawer-view.ts` has the measurement). The view moved onto
 * `/collections?collection=<id>`, which is the same segment and therefore not a mount at all.
 *
 * The path stays because it is in shared links, in the join flow's landing, in browser history and
 * in anyone's bookmarks, and the one thing a URL may not do is stop working. A redirect rather than
 * a `rewrite` in `next.config.ts`, so there is exactly one canonical URL for a collection and a
 * reader of the address bar is never looking at the losing one.
 *
 * **No auth check and no existence check here**, deliberately: both belong to the page this hands
 * off to, and duplicating the membership read would make *this* route an existence oracle for
 * other people's collections — a 404 for a stranger and a redirect for a member is the difference
 * `getCollection` exists to hide.
 *
 * `307`, which is what `redirect()` issues, rather than a permanent one: this is our routing, it
 * may change again, and a `308` cached in somebody's browser forever is not a thing to hand out
 * for an internal reshuffle.
 */
export default async function CollectionByPathPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The cast is the one `bottom-nav.tsx` already makes for `/map?place=`: `typedRoutes` types the
  // route literal and has nothing to say about a query string on it.
  redirect(collectionsHref({ kind: 'collection', id }) as '/collections');
}
