import { notFound, redirect } from 'next/navigation';

import { createClient } from '@/app/_lib/supabase/server';
import { getSpots } from '@/app/map/_lib/get-spots';
import { toMapPlace } from '@/app/map/_lib/to-map-place';
import { getCollection, getCollectionMemberships, getCollections } from './_lib/get-collections';
import { viewFromSearchParams } from './_lib/drawer-view';
import { CollectionsDrawerClient } from './collections-drawer-client';

export const metadata = { title: 'Collections' };

/**
 * **The whole collections surface, on one route segment.**
 *
 * `/collections` is the index and `/collections?collection=<id>` is one collection. They were two
 * sibling segments until 2026-08-31, and the App Router's answer to a segment change is to unmount
 * the outgoing subtree — which took the drawer, the vaul root inside it and every piece of state
 * either held. `_lib/drawer-view.ts` has the measurement. `[id]/page.tsx` still exists and is now a
 * redirect, because that path is in shared links and in people's history.
 */
export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Same belt-and-braces check every page that renders user data makes: the middleware redirects
  // an unauthenticated visitor, and the page does not trust it.
  if (!user) redirect('/sign-in');

  const view = viewFromSearchParams(await searchParams);

  /**
   * Both views' data, in parallel.
   *
   * The library is read on **both**, for three readers: it is the pins behind the index, the array
   * the bar's `＋` menu searches, and the picker inside a collection. Reading it on the index
   * replaced a `head: true` count query when the index moved onto this shell, so that surface makes
   * the same number of round trips it made before; the extra weight is rows, and it is the same
   * payload `/map` already ships on every paint.
   *
   * The memberships are read **only inside a collection**, where a place detail's `Add to a
   * collection` row needs to know which collections a place is already in before it is tapped.
   * On the index no place detail is reachable, so the context value is `null` there rather than an
   * empty object — which is the difference between "there is nothing to say" and "you are in no
   * collections", and `AddToCollection` already renders nothing for the former.
   */
  const [collections, spots, detail, memberships] = await Promise.all([
    getCollections(),
    getSpots(),
    view.kind === 'collection' ? getCollection(view.id) : Promise.resolve(null),
    view.kind === 'collection' ? getCollectionMemberships() : Promise.resolve(null),
  ]);

  // `getCollection` returns null both for a collection that does not exist and for one the caller
  // is not a member of. Rendering the same 404 for both is deliberate: telling them apart would
  // make this route an existence oracle for other people's collections. An id that resolves to
  // nothing is a 404 rather than a silent fall back to the index, for the same reason —
  // `/collections?collection=<someone else's>` quietly showing you your own index would be a
  // surface that answers a question it was not asked.
  if (view.kind === 'collection' && detail === null) notFound();

  // The shell's box, exactly as `/map` declares it: this route is the same shell with collections
  // in its drawer, so it gets the same viewport-height, non-scrolling frame rather than a document
  // that scrolls.
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CollectionsDrawerClient
        view={view}
        collections={collections}
        library={spots.map(toMapPlace)}
        detail={detail}
        memberships={memberships}
        currentUserId={user.id}
      />
    </main>
  );
}
