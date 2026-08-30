import {
  CollectionsShellSkeleton,
  PlaceRowSkeleton,
} from '@/components/collections/collections-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/collections/[id]` while `getCollection()`, the library and the memberships are in flight.
 *
 * This route rests at `half`, not `full` (`collection-client.tsx:52`), because a collection's
 * places are pins on the map behind it and a full sheet hides the thing the collection is *about*.
 * The skeleton rests there too, so the sheet does not resize under the user when the real content
 * arrives.
 *
 * The header block above the rows is the collection's own: the `Collection` up-link's line, the
 * name, the count-and-members line, and — since W5-6 — the description. Four lines, in the order
 * `collection-content.tsx` draws them.
 */
export default function CollectionLoading() {
  return (
    <CollectionsShellSkeleton restingStop="half">
      <div className="pt-1 pb-2">
        {/* The kicker row: the up-link on the left, the options button on the right. Both are
            `min-h-11`, and both are chrome whose position is known. */}
        <div className="flex min-h-11 items-center">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ms-auto size-11 rounded-full" />
        </div>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-1 h-4 w-40" />
        <Skeleton className="mt-1.5 h-4 w-56" />
        {/* The search field, which the real header renders only once the collection has places. */}
        <Skeleton className="mt-2 h-11 w-full rounded-lg" />
      </div>
      <ul>
        <PlaceRowSkeleton />
        <PlaceRowSkeleton />
        <PlaceRowSkeleton />
      </ul>
    </CollectionsShellSkeleton>
  );
}
