import { redirect } from 'next/navigation';

import { collectionHref } from '@/app/map/_lib/drawer-view';

/**
 * **A collection's old URL, kept working forever.** See `../page.tsx` for the whole of the
 * reasoning; this is the same shim for the path that carried the id in a segment.
 *
 * That form is what a shared link, the join flow's landing and anybody's history hold, and it is
 * the one this run replaced: a dynamic segment's value is part of the router's cache key, so
 * `/collections/<id>` remounted the drawer where `?collection=<id>` does not.
 */
export default async function CollectionByPathRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(collectionHref(id) as '/map');
}
