import {
  CollectionRowSkeleton,
  CollectionsShellSkeleton,
} from '@/components/collections/collections-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/collections` while `getCollections()` and the library read are in flight.
 *
 * The index rests at `full`, so the sheet covers the viewport and the skeleton does too — the list
 * appears exactly where the rows land, with no sheet animation between the two states.
 *
 * **Three rows, and the number is a judgement.** A skeleton that draws more rows than the user has
 * makes the list appear to shrink; one that draws fewer makes it jump. Three is the median a real
 * account has at this stage of the product and it is short enough that either correction is small.
 * `growth-plan.md` has no distribution to read, so this is a guess and is labelled one.
 */
export default function CollectionsLoading() {
  return (
    <CollectionsShellSkeleton restingStop="full">
      {/* The `YOURS` section heading's slot — `text-micro` uppercase, so 12px of ink. */}
      <Skeleton className="mx-1 mt-4 mb-1 h-3 w-14" />
      <ul>
        <CollectionRowSkeleton />
        <CollectionRowSkeleton />
        <CollectionRowSkeleton />
      </ul>
      {/* The dashed `New collection` row, which is always last and always present. Drawn as its
          real outline rather than as a filled block: it is chrome, not content, and its shape is
          known. */}
      <div className="mt-2 h-14 w-full rounded-full border border-dashed border-border" />
    </CollectionsShellSkeleton>
  );
}
