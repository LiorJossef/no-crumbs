'use client';

/**
 * The one way into Collections from the map, and it costs zero permanent chrome.
 *
 * A bottom tab bar would have to be worth a 56px strip removed from the map on every screen, a
 * second navigation concept in a product whose whole IA is "the map is the shell", and a collision
 * with the sheet's own peek stop. Collections is one destination most sessions will not visit, so
 * it is a row at the end of the list instead — which is also correct by meaning: a collection is a
 * subset of your places, so it belongs under your places.
 *
 * It renders at a count of zero as well. Hiding it there would make the feature invisible to
 * everyone who has never used it, which is everyone.
 */

import Link from 'next/link';
import { ChevronRight, Library } from 'lucide-react';

import { useCollections } from '@/ui/place/collections-context';
import { PRESS_ROW } from '@/lib/interaction';
import { cn } from '@/lib/utils';

export function CollectionsNavRow() {
  const collections = useCollections();
  if (!collections) return null;

  const count = collections.collections.length;

  return (
    <Link
      href="/collections"
      data-vaul-no-drag
      className={cn(
        'flex min-h-11 items-center gap-2.5 border-t border-border/70 px-1 py-3 text-sm font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        PRESS_ROW,
      )}
    >
      <Library className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1">Collections</span>
      {count > 0 ? <span className="text-xs text-muted-foreground">{count}</span> : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
