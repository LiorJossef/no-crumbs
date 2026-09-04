'use client';

/**
 * **The one menu material, shared by every surface that opens a list of rows.**
 *
 * Moved here verbatim from `sheet/library-filter-bar.tsx` on 2026-09-03, unchanged, because the
 * collection screen needed the same panel and the same rows. It had its own bespoke container —
 * `rounded-lg border bg-muted/40` with full-width 44 px rows — which is exactly the third copy of
 * this material that `ux-collection-actions-2026-09-03.md` §7.4 says is how we got here. Two
 * importers of one file cannot drift; two hand-written copies always do.
 *
 * Nothing in here knows what a filter is. It is a surface, a popup, an inline panel, a row and the
 * word `Clear`.
 */

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/utils';
import { FILTER_KICKER } from '@/components/sheet/place-enrichment';
import { MENU_ROW, MENU_ROW_PAINT, PANEL_SURFACE } from '@/ui/menu-material';

/**
 * **The three pure class strings live in `@/ui/menu-material`, which is not a client module.**
 *
 * They are re-exported here so every existing call site — all of them client components —
 * imports them from where it always did. A **Server Component must import from
 * `@/ui/menu-material` directly**: a non-component export of a `'use client'` module arrives
 * there as a client reference rather than a string, and `cn()` drops it with no error. That is
 * exactly how `/profile`'s `Account settings` row shipped unstyled on 2026-09-03; the new
 * module's header carries the full account.
 */
export { MENU_ROW, MENU_ROW_PAINT, PANEL_SURFACE };

/**
 * The floating half, on desktop. `w-max` — **the width is the content's**, not the row's and not
 * the panel's: a two-row menu stretched to a 500 px panel reads as a dialog that lost its content.
 *
 * `--available-height` and `--transform-origin` come from the positioner, so a menu near the bottom
 * of the viewport flips above its trigger and scrolls inside what is left. One scroll container,
 * always: nothing inside a popup carries its own `overflow-y`, because two stacked tracks means the
 * user cannot tell which one their thumb will grab.
 *
 * 16 px of radius, not 24: with 4 px of padding around 12 px rows the corners nest exactly
 * (16 − 4 = 12 = `--radius-sm`), where 24 around 16 did not. Motion is a fade and a 4 px rise over
 * `duration-enter` — no scale, because an overshoot on a menu is the single most goofy-reading
 * thing available.
 */
export const MENU_POPUP =
  cn(
    PANEL_SURFACE,
    'z-50 max-h-[min(20rem,var(--available-height))] w-max min-w-40 max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-y-auto overscroll-contain ' +
      'data-open:animate-in data-open:fade-in-0 data-open:motion-safe:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 duration-enter',
  );

/**
 * **The inline half, on the phone.** Normal flow, full content width, no portal, no scrim, no fixed
 * positioning — it pushes the list down rather than covering it, which is the whole point of the
 * split.
 *
 * `order-last` with `w-full` is what puts it under **its own row** rather than under the whole
 * header: flex lays wrapped items out by `order` first, so the panel takes the line below the
 * triggers while `Clear` and the triggers after it stay where they were.
 *
 * **The cap is measured against the sheet's column, not the viewport.** `dvh` in here is a lie:
 * the column is `55dvh - 70px` at `half`, so the old `45dvh` cap claimed 96 % of it and the list's
 * scroll box measured 0 px. A flex line never shrinks, so nothing downstream could take it back.
 * The cap is now the smaller of two claims on the `--sheet-content-height` that `place-sheet.tsx`
 * publishes: two fifths of the column, or all of it bar 21rem. `dvh` survives as the fallback.
 *
 * No height animation, ever: layout thrash inside a scrolling sheet for no information.
 */
export const INLINE_PANEL =
  cn(
    PANEL_SURFACE,
    'order-last mt-1.5 w-full overflow-y-auto overscroll-contain ' +
      'max-h-[min(calc(var(--sheet-content-height,100dvh)*0.4),calc(var(--sheet-content-height,100dvh)-21rem))] ' +
      'animate-in fade-in-0 motion-safe:slide-in-from-top-1 duration-enter',
  );

/** The word, never an `x` — defect D3's fix. A real control with a real accessible name rather than
 *  a decorative glyph carrying a dismissal's affordance with no dismissal behind it. */
export const CLEAR_LABEL = 'Clear';

/**
 * **The phone's panel: the same list, in normal flow, under its own row.**
 *
 * Not a modal. No portal, no scrim, nothing trapped — `Tab` leaves it normally and it stays open,
 * because it makes no modal claim. Escape closes it and returns to the trigger, which is not
 * optional: `product-review-2026-09-01-r5.md` G1 found the profile popover shipped without either,
 * and this must not be the second surface to do it.
 *
 * **The kicker is what says where the panel came from.** Full width under the row means the panel
 * cannot sit beneath the exact pill that was pressed, so the axis word is printed on its first line
 * and the pressed trigger stays painted open. That, together with the panel being under *its own*
 * row rather than under the whole header, is the answer to the earlier inline attempt's measured
 * failure — press `Category` at x97, options appear at x30 under two unrelated controls.
 *
 * **`axis` is optional, and omitting it omits the kicker line entirely.** An *action* menu has no
 * axis and no value: the collection's `⋯` opens under a heading that is already naming the object,
 * so a kicker there would print a second title. Every filter axis passes one, so the library's
 * header is unchanged.
 */
export function InlinePanel({
  id,
  axis,
  axisClear,
  onEscape,
  onOutsidePress,
  triggerRef,
  children,
}: {
  id: string;
  /** The axis word, printed on the panel's first line. Omitted for a menu that has no axis. */
  axis?: string;
  axisClear: (() => void) | null;
  onEscape: () => void;
  /** Dismissal by a press elsewhere. Separate from `onEscape` because it must **not** move focus:
   *  the press has already landed on whatever the user meant to touch. */
  onOutsidePress: () => void;
  /** So a press on the trigger is not counted as outside. Without it the trigger stops closing the
   *  panel: the dismissal fires on `pointerdown` and the `click` that follows re-opens it. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // A press anywhere else closes it. The floating half gets this from Base UI's `Menu.Root`; the
  // inline half is plain DOM with nothing watching.
  //
  // **`click`, not `pointerdown`.** Closing removes up to 310 px from the middle of the column, so
  // a `pointerdown` dismissal moves the layout between finger-down and finger-up — a tap on `Sort`
  // closed the panel, slid a place row under the finger and opened that place. `click` runs after
  // the browser has decided what was pressed, and capture still beats that control's own handler.
  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) === true) return;
      if (triggerRef.current?.contains(target) === true) return;
      onOutsidePress();
    }
    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [onOutsidePress, triggerRef]);

  // **Escape closes it from anywhere, not only from the trigger and from inside the panel.**
  //
  // Every consumer handles Escape on its own trigger and this panel handles it on itself, and both
  // call `stopPropagation`, so this listener only ever sees the third case: the panel is open and
  // focus is somewhere else entirely. On the library's filter bar that case is hard to reach —
  // the panel is `order-last` in the trigger's own flex line, so `Tab` from the trigger lands
  // inside it. On the collection screen the panel is drawn under the meta line instead, so `Tab`
  // from the `⋯` lands on the members line and Escape there was a dead key: measured 2026-09-04 at
  // 390×844, `aria-expanded` still `true` and the rows still on screen.
  //
  // It dismisses through `onOutsidePress`, not `onEscape`, for the reason that prop exists: focus
  // has already left the trigger, and yanking it back to a control the user tabbed away from is a
  // jump they did not ask for.
  //
  // **Bubble phase on `document`, and the guard is `stopPropagation`, not `defaultPrevented`.**
  // React 19 dispatches its synthetic events from a listener on the root container, so a handler
  // nearer the key that stops the event — the library's search field, which clears its own query on
  // Escape — is never reached by this one. `defaultPrevented` looks like the politer test and is
  // useless here: measured 2026-09-04 on the collection sheet, Escape arrives at `document` with
  // `defaultPrevented` already `true`, because `NonModalDrawerScope`'s Radix `DismissableLayer`
  // consumes it into an `onOpenChange` that is a noop. Nothing closes, and the flag says otherwise.
  useEffect(() => {
    function onDocumentKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      onOutsidePress();
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [onOutsidePress]);

  return (
    <div
      id={id}
      ref={panelRef}
      data-vaul-no-drag
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onEscape();
      }}
      className={INLINE_PANEL}
    >
      {(axis !== undefined || axisClear !== null) && (
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1.5">
        {axis !== undefined && <span className={FILTER_KICKER}>{axis}</span>}
        {axisClear !== null && (
          <button
            type="button"
            data-vaul-no-drag
            onClick={axisClear}
            className="shrink-0 cursor-pointer rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {CLEAR_LABEL}
          </button>
        )}
      </div>
      )}
      {children}
    </div>
  );
}
