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

export function CollectionsNavRow() {
  const collections = useCollections();
  if (!collections) return null;

  const count = collections.collections.length;

  return (
    <Link
      href="/collections"
      data-vaul-no-drag
      className="flex min-h-11 items-center gap-2.5 border-t border-border/70 px-1 py-3 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Library className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1">Collections</span>
      {count > 0 ? <span className="text-xs text-muted-foreground">{count}</span> : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * The same destination, as the leading slot of the sheet's peek row
 * (`docs/ux-navigation-structure-2026-08-29.md` §1).
 *
 * **Why a second affordance for one destination.** `CollectionsNavRow` above made Collections
 * reachable once you had opened the list; it does nothing for the state the app is actually in when
 * it opens. The sheet rests at `peek`, where the entire scroll container — the pinned row included
 * — is off screen, so the cold-open cost of reaching Collections was still two gestures: drag the
 * sheet up, then find the row. This is the same destination at the one stop the other affordance
 * cannot reach, and the two never render at the same time.
 *
 * Not a tab bar: a persistent bottom bar and a three-stop drag sheet are two answers to the same
 * question about the bottom of a phone screen, and §1.2 works through why both ways of resolving
 * that collide. Three slots is also all we have destinations for.
 *
 * `data-vaul-no-drag` is explicit here and is not decoration. The peek row's children sit on the
 * sheet's drag surface; `Add a TikTok` gets away without it because vaul only starts a drag from
 * content scrolled to its own top and a `<button>` press resolves first, but a `<Link>` is less
 * forgiving. A downward drag begun on the row must still move the sheet — this swallows the tap,
 * not the gesture.
 */
export function CollectionsPeekSlot() {
  const collections = useCollections();
  if (!collections) return null;

  const count = collections.collections.length;

  return (
    <Link
      href="/collections"
      data-vaul-no-drag
      className="flex h-12 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Library className="size-4 shrink-0" aria-hidden />
      {/* Visually hidden rather than removed below 360 px, so the control never becomes an
          unlabelled glyph in the accessibility tree. A CSS breakpoint and not a media query in
          JavaScript — `map-page-client.tsx` forbids the latter outright. */}
      <span className="max-[359px]:sr-only">Collections</span>
      {count > 0 ? <span className="text-xs tabular-nums">{count}</span> : null}
    </Link>
  );
}
