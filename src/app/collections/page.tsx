import { redirect } from 'next/navigation';

import { createClient } from '@/app/_lib/supabase/server';
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

  // Two states behind one empty screen: "no collections" and "no places to put in one". The second
  // needs a different sentence and a different button, so the count is read here rather than
  // inferred from an empty collections list.
  const [collections, { count: savedCount }] = await Promise.all([
    getCollections(),
    supabase.from('saved_places').select('id', { count: 'exact', head: true }),
  ]);

  return (
    <main className="min-h-dvh w-full bg-background">
      <CollectionsIndexClient collections={collections} libraryIsEmpty={(savedCount ?? 0) === 0} />
    </main>
  );
}
