'use client';

/**
 * Keeps the page behind a **non-modal** drawer reachable by assistive technology.
 *
 * ## The bug this exists for
 *
 * `PlaceSheet` is a permanently-open, explicitly non-modal drawer: the map behind it is meant to
 * stay visible and usable, and on desktop the sheet's own content is `lg:hidden` and renders
 * nothing at all. It passes `modal={false}` to `Drawer.Root` accordingly.
 *
 * `vaul@1.1.2` does not forward that prop. Its `Drawer.Root` renders
 * `DialogPrimitive.Root` with `defaultOpen`, `onOpenChange` and `open` — and no `modal` — so Radix
 * always runs the **modal** dialog, which calls `hideOthers()` from the `aria-hidden` package and
 * marks every sibling of the drawer's portal `aria-hidden="true"`. The portal is appended to
 * `document.body`, so the sibling it hides is `<main>` — the entire application.
 *
 * Measured on `/map` at 1440×900: `document.querySelector('main').getAttribute('aria-hidden')`
 * returned `"true"`, `getByRole('button', { name: /add a tiktok/i })` matched **zero** elements,
 * and so did sign-out, the search field and every place in the list. A screen-reader user on the
 * map page could reach nothing. It disappeared the moment the sheet unmounted (opening the import
 * overlay), which is what identified vaul as the cause.
 *
 * ## Why this shape of fix
 *
 * The clean fix is upstream — `modal` should reach Radix. Until it does, the options were: stop
 * mounting the sheet above `lg` (fixes desktop, leaves mobile screen readers with a hidden map),
 * portal the drawer inside `<main>` (moves the problem to `<main>`'s children rather than solving
 * it), or replace vaul (loses the drag/snap gesture this component exists for). Undoing the one
 * incorrect attribute is the smallest change that is actually correct on both breakpoints.
 *
 * `data-aria-hidden` — the `aria-hidden` package's own bookkeeping marker — is deliberately left
 * in place. It is what the library's teardown uses to decrement its counters and clean up; removing
 * it would break the undo. Only the `aria-hidden` attribute, which is the part that is wrong for a
 * non-modal surface, is cleared.
 *
 * The observer is what makes it stick: Radix re-runs `hideOthers` whenever the portal remounts, so
 * a one-shot removal would silently regress on the next re-render.
 */

import { useEffect } from 'react';

export function useNonModalBackground(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const unhide = () => {
      for (const element of document.querySelectorAll('[data-aria-hidden][aria-hidden="true"]')) {
        element.removeAttribute('aria-hidden');
      }
    };

    unhide();

    const observer = new MutationObserver(unhide);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-hidden'],
      subtree: true,
    });

    return () => observer.disconnect();
  }, [active]);
}
