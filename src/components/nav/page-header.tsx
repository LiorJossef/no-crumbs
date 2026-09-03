import type { ReactNode } from 'react';

/**
 * The header `/profile` and `/account` share: a back control and the page's title, on the same
 * vertical line as the content column at every width.
 *
 * It exists because the two pages had a copy each and drifted — the owner caught `/profile`'s arrow
 * sitting on its own row *above* the title and indented ~19px to the *right* of the column the
 * title starts on, while `/account`'s hung correctly in the gutter beside it. Two copies is how
 * that happens; one component with a slot is the fix.
 *
 * ## The geometry, and each piece of it is answering a reported defect
 *
 * **`mx-auto max-w-140 px-4` — the same box as the body.** It used to be a full-width `px-2` row
 * over a centred column, so at 1440 the title sat in the far top-left corner while the column it
 * labels was in the middle of the screen, reading as chrome rather than as the page's own title.
 *
 * **`pt-[calc(env(safe-area-inset-top)+1.5rem)]` — the inset is a bonus, not the padding.** It was
 * the whole of it, and the inset is `0` on a desktop, so the title sat 8px from the top of the
 * window while the content below it started ~90px down. `1.5rem` is `import-shell.tsx`'s own
 * `lg:top-6`: what this app already puts above the first thing on a full-page surface.
 *
 * **The control hangs into the gutter at `lg` and sits inline below it** — see
 * `HEADER_BACK_CONTROL`. Either way the `h1` never carries horizontal padding of its own, which is
 * what keeps its leading edge on the column's.
 */
export function PageHeader({ title, back }: { readonly title: string; readonly back: ReactNode }) {
  return (
    <header className="mx-auto w-full max-w-140 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-2">
      {/* `relative` is what the control's `lg:absolute` hangs off, so the gutter it moves into is
          this column's and not the viewport's. */}
      <div className="relative flex items-center gap-1">
        {back}
        <h1 className="font-heading text-lg font-bold tracking-tight">{title}</h1>
      </div>
    </header>
  );
}

/**
 * The one geometry for a back control in a `PageHeader`, so the two pages cannot disagree about it
 * again. Compose it with `cn`; add only visibility.
 *
 * Two positions for one control. Below `lg` it is inline before the title — the ordinary app-bar
 * shape, and the title's indent costs nothing there because on a phone the viewport *is* the
 * column. At `lg` it is lifted out: `end-full` puts its trailing edge on the column's leading edge,
 * `me-1` opens a gap, and the `h1` falls back onto the column line with no empty 44px row above it.
 *
 * `-ms-2` below `lg` pulls the ghost button's box out so its *glyph*, not its padding, lines up
 * with the text under it; at `lg` the button is out of flow, so `ms-0` takes it back off.
 *
 * `size-11` over `icon-lg`'s 36px: this is the page's only exit on a phone and 44px is the target
 * a thumb needs.
 */
export const HEADER_BACK_CONTROL =
  '-ms-2 size-11 shrink-0 rounded-full text-muted-foreground lg:absolute lg:end-full lg:ms-0 lg:me-1';
