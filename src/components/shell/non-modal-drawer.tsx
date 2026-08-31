'use client';

/**
 * **Makes vaul's `modal={false}` real, and it takes two pieces because the bug has two halves.**
 *
 * This replaces `sheet/use-non-modal-background.ts`, which fixed one consequence of the same root
 * cause by hand. The enumeration below is what that file was missing; keeping it here, beside the
 * fix, is the point of the file.
 *
 * ## The root cause, re-measured 2026-09-01
 *
 * `vaul@1.1.2`'s `Drawer.Root` destructures `modal` for its own use and renders
 * `DialogPrimitive.Root` with **only** `defaultOpen`, `onOpenChange` and `open`
 * (`node_modules/vaul/dist/index.mjs:1341-1350`). Radix's `modal` therefore keeps its default of
 * `true`, and `PlaceSheet` — a permanently-open drawer whose whole design is that the map behind it
 * stays live — runs Radix's **modal** dialog.
 *
 * ## What `modal` actually gates in `@radix-ui/react-dialog@1.1.23`, and where each one landed
 *
 * `DialogContent` picks `DialogContentModal` or `DialogContentNonModal` on `context.modal`
 * (`node_modules/@radix-ui/react-dialog/dist/index.mjs:134`). Exactly four behaviours differ, plus
 * one on `DialogOverlay`:
 *
 * 1. **`hideOthers(content)`** — marks every sibling of the drawer's portal `aria-hidden="true"`,
 *    which is `<main>`, the whole application. **Found in 2026-08-31's a11y sweep and fixed by
 *    symptom**: a `MutationObserver` stripped the attribute back off. `tests/e2e/map-accessibility.spec.ts`
 *    guards the outcome.
 * 2. **`trapFocus: context.open`** → `FocusScope trapped`, which installs document-level `focusin`
 *    and `focusout` handlers that yank focus back to the last element focused inside the drawer
 *    (`react-focus-scope/dist/index.mjs:36-73`). **Never enumerated. This is the keyboard trap** —
 *    round 3 finding 3, measured 0/12 Tab and 0/4 Shift+Tab at 390, 768 and 1023.
 * 3. **`disableOutsidePointerEvents: context.open`** → `DismissableLayer` puts the drawer in
 *    Radix's `layersWithOutsidePointerEventsDisabled` set for the life of the page. Since it is
 *    permanently open it permanently holds slot zero, so when `AddSheet` — a **genuine** modal —
 *    opens, `size !== 0` and the branch that sets `document.body.style.pointerEvents = 'none'`
 *    never runs (`react-dismissable-layer/dist/index.mjs:110-114`). **The create sheet's backdrop
 *    did not block the map underneath it.** Also never enumerated; measured, and fixed by this file
 *    as a side effect of fixing 2.
 * 4. **`onCloseAutoFocus` / `onFocusOutside`** — modal returns focus to the trigger and refuses to
 *    dismiss on focus leaving. Moot here: the drawer has no trigger and never closes.
 * 5. **`DialogOverlay` renders `null` when non-modal**, which is where Radix's `RemoveScroll`
 *    lives. **Already correct**: vaul's own `Overlay` short-circuits on its own `modal` value
 *    (`vaul/dist/index.mjs:1392`) before reaching Radix, so no scroll lock was ever installed.
 *    Measured: `document.body.style.overflow` and `.position` are both unset at all five widths.
 *    `inert` is not used by this version of Radix at all — the mechanism is `hideOthers`.
 *
 * So of the five, one was fixed, one is this file's subject, one was silently damaging a different
 * screen, and two were already fine. **The prop is the mechanism; the symptoms are downstream.**
 *
 * ## Half one — `NonModalDrawerScope`
 *
 * `DialogContent` reads `modal` from the **nearest** `DialogProvider`, so supplying our own
 * `DialogPrimitive.Root` inside vaul's gives Radix the value vaul refused to forward. It renders no
 * DOM. `open` is hard `true` because the drawer's is (`map-shell.tsx` passes `open` with no state),
 * and `onOpenChange` is a no-op for the same reason vaul's is: `dismissible={false}`.
 *
 * This is the whole of 1, 2, 3 and 4 at once. Verified by `document.querySelectorAll('[data-aria-hidden]').length`
 * going 2 → **0**: `hideOthers` no longer runs at all, rather than running and being undone.
 *
 * ## Half two — `useNonModalDrawerTabRelease`, and why the scope alone is not enough
 *
 * **`modal` does not gate the focus *loop*.** `DialogContentImpl` renders `<FocusScope asChild loop
 * trapped={trapFocus}>` with `loop` hardcoded `true` (`react-dialog/dist/index.mjs:216`), and
 * `FocusScope`'s Tab handler runs on `loop || trapped`: at the last tabbable it calls
 * `preventDefault()` and focuses the first, and mirror-image on Shift+Tab
 * (`react-focus-scope/dist/index.mjs:107-129`). At the `peek` stop this drawer has **exactly one**
 * visible tabbable, so first and last are the same button and both directions re-focus it. Measured
 * against the scope alone: still 0/12 and 0/4 at 390, 768 and 1023. **Patching vaul to forward
 * `modal`, which is what the previous file's header proposed as the clean fix, would not have
 * closed this.**
 *
 * `FocusScope`'s handler is a React `onKeyDown` on the content element, and React 19 dispatches it
 * from a listener on the root container. A **native bubble-phase** listener on the content node
 * therefore runs first — after every descendant's own native handler, before React's delegated
 * pass — and `stopPropagation()` there means Radix never sees the Tab and never calls
 * `preventDefault()`. The browser's own sequential focus navigation then does the work: no focus
 * order is reimplemented here, which is the point. `document.body` and `document` carry no keydown
 * listeners of ours, so nothing else is cut off.
 *
 * **The cost, stated so the next person does not find it by surprise: a React `onKeyDown` inside
 * this drawer will not see `Tab`.** Today none wants it — the four handlers under
 * `components/sheet/` and `components/collections/` all test for `Escape` only. Anything that needs
 * Tab inside the sheet must use `onKeyDownCapture`, or a native listener on its own node.
 *
 * It is deliberately *all* Tab presses rather than only the ones at a tabbable edge. Mirroring
 * `getTabbableEdges` would narrow the blast radius and would also make a residual, invisible trap
 * possible the moment our copy of the edge rule and Radix's disagreed. A swallowed Tab handler is
 * noticed by whoever writes it; a trap is only noticed by the person it happens to.
 *
 * ## What this does *not* do, on purpose
 *
 * It installs no trap of its own and no bumper elements. The drawer stays genuinely non-modal: the
 * map behind it remains focusable, clickable and in the accessibility tree, which is the product's
 * design (`docs/ux-architecture.md`). Nothing here is animated, so `prefers-reduced-motion` has
 * nothing to say about it.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

const NOOP_OPEN_CHANGE = () => {};

/**
 * Supplies the `modal={false}` Dialog context vaul drops. Wrap `Drawer.Portal` in it.
 */
export function NonModalDrawerScope({ children }: { children: ReactNode }) {
  return (
    <DialogPrimitive.Root open modal={false} onOpenChange={NOOP_OPEN_CHANGE}>
      {children}
    </DialogPrimitive.Root>
  );
}

/**
 * Stops Radix's unconditional focus loop from holding Tab inside a non-modal drawer.
 *
 * Returns a ref callback for `Drawer.Content`. It returns a cleanup function, which is what
 * `@radix-ui/react-compose-refs` looks for when vaul composes it with its own `drawerRef`.
 */
export function useNonModalDrawerTabRelease(): (node: HTMLElement | null) => (() => void) | void {
  const attached = useRef<HTMLElement | null>(null);

  return useCallback((node: HTMLElement | null) => {
    if (attached.current) {
      attached.current.removeEventListener('keydown', releaseTab);
      attached.current = null;
    }
    if (!node) return;
    node.addEventListener('keydown', releaseTab);
    attached.current = node;
    return () => {
      node.removeEventListener('keydown', releaseTab);
      if (attached.current === node) attached.current = null;
    };
  }, []);
}

/**
 * Exported for the unit test, which asserts the condition rather than the effect: a jsdom test
 * cannot observe sequential focus navigation, so what it can check is that this stops exactly the
 * Tab presses and nothing else.
 */
export function releaseTab(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  // A modified Tab is the browser's, not a focus move Radix would intercept — `FocusScope` skips
  // those too (`react-focus-scope/dist/index.mjs:111`), so leaving them alone keeps the two in step.
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  event.stopPropagation();
}
