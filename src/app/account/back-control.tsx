'use client';

/**
 * The back control in `/account`'s header. **It returns you where you came from**, with `/profile`
 * as the fallback (owner, 2026-09-03).
 *
 * ## Why it cannot be a `<Link>` to a fixed path
 *
 * `/account` is reached from the account menu, and that menu is in the bar on *every* tab. So there
 * is no single page above this one: a fixed `href` sends somebody who opened settings from the map
 * to a page they were never on. It was `/map` before that, which skipped past `/profile` entirely.
 *
 * The glyph is `ArrowLeft`, the same one `/profile` draws at the same size. Every back control in
 * this product is an arrow, and making this page the exception would make an ordinary page read as
 * a modal. `aria-label` is plain `Back`, which is what `share-panel.tsx` and `add-sheet.tsx`
 * already say for a control whose destination is not fixed — naming a destination this component
 * cannot know until it is pressed would be worse than not naming one.
 *
 * ## How it decides
 *
 * The Navigation Timing entry is the document the browser actually loaded. If its path is not this
 * one, we arrived here by a client navigation and there is an in-app entry behind us, so `back()`
 * is the right move and cannot leave the product. If it *is* this one — a direct load, a refresh,
 * or a link somebody was sent — there may be nothing behind us but another site, so we push
 * `/profile` instead.
 *
 * The one case it gets approximately right rather than exactly right: a direct load of `/account`
 * that then navigates away and comes back lands on `/profile` rather than on the previous tab.
 * That is a sane destination rather than a wrong one, and reading Next's own history state to do
 * better means depending on `__PRIVATE_NEXTJS_INTERNALS_TREE`, which is private and says so.
 *
 * **It never no-ops.** Both branches leave the page.
 */

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function BackControl({ className }: { readonly className?: string }) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label="Back"
      className={className}
      onClick={() => {
        // `name` on a navigation entry is the URL of the document the browser loaded, and it is
        // on `PerformanceEntry` itself — no cast to `PerformanceNavigationTiming` needed.
        const [entry] = performance.getEntriesByType('navigation');
        if (entry !== undefined && new URL(entry.name).pathname !== window.location.pathname) {
          router.back();
          return;
        }
        router.push('/profile');
      }}
    >
      <ArrowLeft className="size-4" aria-hidden />
    </Button>
  );
}
