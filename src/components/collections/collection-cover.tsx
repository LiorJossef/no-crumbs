'use client';

import { categoryDisplay } from '@/ui/place/category-display';
import type { ProductCategory } from '@/domain/places/product-category';
import { cn } from '@/lib/utils';

/**
 * A collection's stand-in for a cover image.
 *
 * We store no images and upload none, and every available substitute — a gradient tile, a static
 * map thumbnail, a letter avatar in a coloured square — says nothing true about the collection. So
 * what is drawn is what is actually in it: one bar per *distinct* category present, in the same
 * palette every pin and every row already uses. Two coffee collections look alike because they
 * *are* alike, which is a property a real cover image would have to be chosen carefully to achieve.
 *
 * Purely decorative — the name and the count carry every fact — so it is `aria-hidden` rather than
 * given a label describing a colour bar. Never let a colour carry meaning alone.
 */
export function CollectionCover({
  categories,
  className,
}: {
  categories: readonly ProductCategory[];
  className?: string;
}) {
  // Nothing at all for an empty collection — no placeholder, no grey ghost strip. A collection
  // with nothing in it should look empty, not look like it failed to load.
  if (categories.length === 0) return null;

  return (
    <div aria-hidden className={cn('flex h-1.5 gap-1', className)}>
      {categories.map((category) => (
        <span
          key={category}
          className="h-full w-5 rounded-full"
          style={{ backgroundColor: categoryDisplay(category).color }}
        />
      ))}
    </div>
  );
}
