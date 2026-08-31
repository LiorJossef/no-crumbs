import {
  CollectionRowSkeleton,
  CollectionsShellSkeleton,
} from '@/components/collections/collections-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { VIEW_SWITCH_HEIGHT_PX } from '@/components/shell/sheet-geometry';

/**
 * `/collections` while its reads are in flight — **both views**, since they are one route now.
 *
 * The stop is `half`, not `full`. That is the same change `collections-drawer-client.tsx` makes to
 * the real sheet, for the reason measured there: at `full` the map behind the list is 0 % visible
 * and 63.2 % of a 390×844 screen is empty. The skeleton has to come to rest where the sheet will,
 * or the load ends with the sheet jumping.
 *
 * **The switch's band is reserved here too.** `CollectionsShellSkeleton` reproduces the sheet's
 * chrome by hand and knows nothing about `DrawerViewSwitch`, so without this the rows would sit
 * 56 px higher than they land — every row visibly stepping down at the moment the data arrives.
 * Drawn as the switch's own track rather than as a `Skeleton` block: its shape is known and it is
 * chrome, which is the same rule the dashed `New collection` row below follows.
 *
 * **Three rows, and the number is a judgement.** A skeleton that draws more rows than the user has
 * makes the list appear to shrink; one that draws fewer makes it jump. Three is the median a real
 * account has at this stage of the product and it is short enough that either correction is small.
 * `growth-plan.md` has no distribution to read, so this is a guess and is labelled one.
 *
 * It draws the index rather than a collection even when the URL carries `?collection=`, and that is
 * a deliberate floor rather than an oversight: this file cannot read search params, and the two
 * views share their frame, their stop and their row rhythm. What differs is which rows.
 */
export default function CollectionsLoading() {
  return (
    <CollectionsShellSkeleton restingStop="half">
      <div style={{ height: `${VIEW_SWITCH_HEIGHT_PX}px` }} className="shrink-0 pt-1 pb-2">
        <div className="h-full rounded-full bg-muted/60" />
      </div>
      {/* The `YOURS` section heading's slot — `text-micro` uppercase, so 11px of ink. */}
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
