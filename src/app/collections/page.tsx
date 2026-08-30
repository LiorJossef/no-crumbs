import { redirect } from 'next/navigation';

import { createClient } from '@/app/_lib/supabase/server';
import { getSpots } from '@/app/map/_lib/get-spots';
import { toMapPlace } from '@/app/map/_lib/to-map-place';
import { getCollections } from './_lib/get-collections';
import { CollectionsIndexClient } from './collections-index-client';

export const metadata = { title: 'Collections' };

export default async function CollectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Same belt-and-braces check every page that renders user data makes: the middleware redirects
  // an unauthenticated visitor, and the page does not trust it.
  if (!user) redirect('/sign-in');

  // The library, alongside the collections, for two readers. It answers "no places to put in a
  // collection" — one of the two states behind this screen's one empty view, which needs a
  // different sentence from "no collections" — and it is the array the bar's `＋` menu searches.
  // Without it that menu answers "nothing you've saved matches that" for places the user does have,
  // and the only action left offers to write a duplicate row and spend a Google Places lookup on
  // it. It replaces a `head: true` count query, so this page makes the same number of round trips
  // it made before; the extra weight is rows, and it is the same payload `/map` and
  // `/collections/[id]` already ship on every paint.
  const [collections, library] = await Promise.all([
    getCollections(),
    getSpots().then((spots) => spots.map(toMapPlace)),
  ]);

  // The shell's box, exactly as `/map` and `/collections/[id]` declare it: this route is the same
  // shell with collections in its sheet, so it gets the same viewport-height, non-scrolling frame
  // rather than a document that scrolls.
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <CollectionsIndexClient
        collections={collections}
        libraryIsEmpty={library.length === 0}
        places={library}
      />
    </main>
  );
}
