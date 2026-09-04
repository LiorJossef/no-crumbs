'use client';

/**
 * **Two views in one slot, swapped along a shared axis, with the outgoing one held long enough to
 * be seen leaving.**
 *
 * React's answer to "this subtree is a different subtree now" is a `key`, and a `key` change
 * unmounts the old tree and mounts the new one **in the same commit**. Every CSS entrance in this
 * product is built on that — `ENTER_SCREEN`, `ENTER_SURFACE`, `ENTER_MODAL` all animate a thing
 * arriving into an empty space, because by the time they run the previous thing is already gone.
 * That is the correct shape for a modal, a popover and an import screen. It is the wrong shape for
 * a **view switch**, where the two things are peers and the whole point is that one becomes the
 * other.
 *
 * Measured on the drawer at `/map` before this component existed, at `d93e666`: tapping
 * `Collections` replaced the saved-places list with an empty `bg-card` panel for the length of the
 * fade, and then the collections list faded up into it out of nothing. The sheet, the map and the
 * camera all survived the switch — that architecture is `app/map/_lib/drawer-view.ts` and it is
 * sound — but the *contents* still hard-cut, on the product's most-used control.
 *
 * This component is the missing half: it keeps the outgoing subtree mounted for exactly one exit
 * beat, absolutely positioned over the same box, while the incoming subtree enters in flow. Both
 * are on screen together, moving the same way along one axis, so there is never a frame with
 * nothing in the slot.
 *
 * ## What came from SmoothUI, and what did not
 *
 * The owner asked for SmoothUI (`docs/overnight-run-plan.md` §7c) and this is where its
 * **`shared-axis-x`** landed. What transferred is the whole of that component's design:
 *
 *  - one axis, **signed by direction** — the outgoing slides one way, the incoming comes from the
 *    other, so the pair reads as a single plane moving rather than as two animations;
 *  - a **decelerating** entrance against an **accelerating** exit (its `ENTER_EASE`/`EXIT_EASE`
 *    pair, which is exactly this product's `--ease-standard` / `--ease-exit` split);
 *  - the exit **shorter than** the entrance, and the two **overlapping** rather than sequenced.
 *
 * What did not transfer is its implementation, and rejecting it was the substantive call here
 * rather than a formality. `shared-axis-x` is a Motion phrase-cycler: it takes `phrases: string[]`,
 * flips between them on a `setInterval`, hard-codes two cubic-béziers and two durations, branches
 * on `useReducedMotion()` during render, and drives the whole thing through
 * `AnimatePresence mode="wait"`. Every one of those is a defect **in this repository specifically**:
 *
 *  1. **`motion/react` on `/map`.** `lib/interaction.ts`'s `ENTER_SURFACE` records taking Motion out
 *     of this route's bundle, and `motion-scale.test.ts` guards it. `/map` is the product's main
 *     screen and it runs a live WebGL canvas; a CSS animation on `opacity` and `transform` is
 *     composited with no main-thread work per frame, and an `AnimatePresence` is not.
 *  2. **`useReducedMotion()` during render.** `components/brand/chrome-motion.ts`'s header records
 *     this shipping a hydration mismatch on the product's front door, for reduced-motion users
 *     only. This component never branches on the preference at all: `motion-safe:` does it in CSS,
 *     which is the same for both renders.
 *  3. **`mode="wait"`** sequences the exit and the entrance, which re-creates the empty frame this
 *     component exists to remove.
 *  4. **Its own durations and easings**, which §7c's *"adapt, don't adopt"* forbids on sight. Every
 *     beat here is a named constant from `lib/interaction.ts`.
 *
 * So: the specification is SmoothUI's, the implementation is `animate-in`/`animate-out` and about
 * thirty lines of state, and the cost on `/map` is **zero new bytes**.
 *
 * ## The one thing this component owns that a class string cannot
 *
 * Holding the outgoing subtree. `LEAVE_SURFACE` has been in the vocabulary since the scale was
 * written, with a docblock saying it is *"only usable where the leaving element stays mounted long
 * enough to run it"* — and nothing in the product made that true. This is the mechanism that does.
 *
 * ## Where it has to be mounted, which is the whole of what went wrong the first time
 *
 * **Above every view it is meant to cover, and it is the one thing about this component that can be
 * got wrong without the component being wrong.** Its first host was `app/map/collections-scope.tsx`,
 * whose hook returns `null` on the places view — so on `places ↔ collections`, the switch a person
 * presses every session, there was no host in the document at the moment the places list left, and
 * nothing to hold it. Measured at `a468fb1`, per frame at 1440×900: `hosts 0` at +210 ms, then
 * `hosts 2` at +291 ms with the incoming layer at `opacity 0.000` and **no leaving layer in any
 * frame of either direction**. The transition was correct and it was mounted below the boundary it
 * was written to cross.
 *
 * It now sits in `app/map/map-page-client.tsx`, which is the one file that renders all three views,
 * and it wraps the drawer's **slot** rather than one branch of it. The rule that generalises:
 * a swap host has to be an ancestor of every view it swaps, which means it cannot live in code that
 * only runs for some of them.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import {
  ENTER_VIEW_BACK,
  ENTER_VIEW_FORWARD,
  LEAVE_VIEW_BACK,
  LEAVE_VIEW_FORWARD,
} from '@/lib/interaction';
import { cn } from '@/lib/utils';

/**
 * Which way the swap is going, in the caller's own terms rather than in pixels.
 *
 * Two arms and deliberately not three. A `lateral` arm for two views at the same depth was drafted
 * and cut: its constants would have been byte-identical to `ENTER_SCRIM` and an exit nothing calls,
 * and `lib/interaction.ts`'s header states the rule it would have broken — *"an unused constant is
 * not a spare part, it is a claim the codebase does not support"*. Peers at one depth take
 * `forward`, which is what a fresh arrival looks like.
 *
 * Declared here, in the component that consumes it, and imported as a **type** by
 * `app/map/_lib/drawer-view.ts` — which computes the direction and is deliberately React-free. A
 * type import is erased at compile time, so that file still loads in a `node` test environment with
 * no DOM and no React.
 */
export type SwapDirection = 'forward' | 'back';

const ENTER: Record<SwapDirection, string> = {
  forward: ENTER_VIEW_FORWARD,
  back: ENTER_VIEW_BACK,
};

const LEAVE: Record<SwapDirection, string> = {
  forward: LEAVE_VIEW_FORWARD,
  back: LEAVE_VIEW_BACK,
};

/**
 * **How long a held layer may live if its `animationend` never arrives**, and it is a leak-stop
 * rather than a beat.
 *
 * Deliberately far longer than any exit in the vocabulary (140 ms), so it can never be what ends a
 * transition — if this number ever decides the timing, the animation did not run at all and the
 * layer is being swept up rather than played out.
 *
 * It is not hypothetical. Both hosts of this component are in the document at once: the sheet is
 * `lg:hidden` and the desktop panel is `hidden lg:block` (`components/shell/map-shell.tsx`), so on
 * every switch **one of the two instances is inside a `display: none` subtree**. A CSS animation
 * does not run on an element that is not rendered, so no `animationend` is ever dispatched there
 * and without this the hidden instance would hold its outgoing view forever — invisible on the
 * breakpoint you are testing, and on screen the moment the window is resized across `lg`.
 *
 * A number rather than a token because `lib/interaction.ts` holds class strings only, and putting a
 * millisecond count in it would break the reflective assertions in `tests/unit/ui/motion-scale.test.ts`
 * that read every export as a class string.
 */
const HELD_LAYER_MAX_MS = 800;

interface HeldView {
  readonly key: string;
  readonly node: ReactNode;
}

export interface SwapState {
  readonly key: string;
  readonly node: ReactNode;
  /** The direction the current view arrived in, captured at the swap and not read again after it. */
  readonly direction: SwapDirection;
  /**
   * **How the current view got here, and it decides whether it plays an entrance at all.**
   *
   * `mount` is the first view this host ever showed — a cold load of `/map`, or of
   * `/map?view=collections` from a shared link. There is nothing to hand off *from*, so the
   * view-tier slide has no subject: the page's own entrance is what an arrival gets
   * (`components/shell/map-shell.tsx`'s five beats), and stacking a 300 ms slide-from-the-right on
   * top of it would animate the product's main screen for a transition that did not happen.
   * `app/map/_lib/drawer-view.ts`'s `swapDirection` already called that case *"an arrival rather
   * than a swap"*; this is the field that makes the component agree.
   *
   * It flips to `swap` at the first key change and never flips back, and it can only change on the
   * same render that re-keys the current layer — so a class string never changes underneath a
   * running animation.
   */
  readonly arrival: 'mount' | 'swap';
  /** The view on its way out, or `null` when nothing is leaving. */
  readonly leaving: (HeldView & { readonly direction: SwapDirection }) | null;
}

/**
 * **The whole of the swap's logic, as a function of the old state and the new props.**
 *
 * Pulled out of the component and exported for one reason: it is the part that can be wrong, and
 * `vitest.config.ts` runs this repository's unit tests in a `node` environment with **no DOM**, so
 * a test cannot mount this component, click the switch and look. `renderToStaticMarkup` renders
 * once and a swap is by definition two renders.
 *
 * The alternative was a source-text guard grepping this file for class names, which is the
 * *"asserting a proxy instead of an invariant"* species `iteration-2-record.md` §8.1 names — it
 * would pass on a version of this component that captured the wrong layer, and fail on a rename
 * that changed nothing. `view-swap.test.ts` drives this function through every transition the
 * drawer can make instead.
 *
 * Returns the **same object** when nothing changed, so the caller's render-phase `setState` is
 * skipped rather than merely idempotent.
 */
export function nextSwapState(
  state: SwapState,
  next: { readonly key: string; readonly node: ReactNode; readonly direction: SwapDirection },
): SwapState {
  const swapping = state.key !== next.key;
  if (!swapping && state.node === next.node) return state;
  return {
    key: next.key,
    node: next.node,
    // The direction is read **at the swap**, so a caller may go on handing down the direction of
    // the last swap for as long as that view is on screen without re-triggering anything.
    direction: swapping ? next.direction : state.direction,
    arrival: swapping ? 'swap' : state.arrival,
    leaving: swapping
      ? { key: state.key, node: state.node, direction: next.direction }
      : // Same view, fresh children — a `router.refresh()` after an edit. Nothing enters and
        // nothing leaves; whatever was already leaving goes on leaving.
        state.leaving,
  };
}

/** Dropping a held layer, once its exit has run. Keyed, so a second swap arriving mid-exit cannot
 *  have its own outgoing view removed by the first one's `animationend`. */
export function withoutLeaving(state: SwapState, key: string): SwapState {
  return state.leaving?.key === key ? { ...state, leaving: null } : state;
}

export function ViewSwap({
  viewKey,
  direction,
  className,
  children,
}: {
  /**
   * One string per distinct view. A change to it is the swap; anything else is an ordinary
   * re-render of the view that is already on screen, which this component passes straight through.
   */
  readonly viewKey: string;
  /**
   * Which way this swap is going, as of the render that changes `viewKey`. Read only at that
   * moment — a later change to it while the same view is on screen does nothing, which is what lets
   * a caller keep handing down "the direction of the last swap" without re-triggering anything.
   */
  readonly direction: SwapDirection;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  /**
   * The current view and the one leaving, in **one** state cell and adjusted **during render** —
   * React's own "derive state from props" pattern, the same shape `app/map/collections-scope.tsx`
   * and `useMapShell` already use here.
   *
   * An effect would be a frame late, and a frame late is the whole defect: the incoming view would
   * paint once with no outgoing layer behind it, which is the empty frame this component exists to
   * remove, and *then* the layer would appear and start leaving.
   *
   * `node` is held as well as `key` because the outgoing view's data is already gone by the time
   * the swap renders — the router has re-rendered the page, `detail` is a different collection, and
   * the caller cannot rebuild what was on screen a moment ago. The only copy of it is the React
   * element from the previous render, so this keeps one.
   */
  const [state, setState] = useState<SwapState>(() => ({
    key: viewKey,
    node: children,
    direction,
    arrival: 'mount',
    leaving: null,
  }));

  const current = nextSwapState(state, { key: viewKey, node: children, direction });
  if (current !== state) setState(current);

  const leavingKey = current.leaving?.key ?? null;
  const drop = useCallback((key: string) => {
    setState((previous) => withoutLeaving(previous, key));
  }, []);

  useEffect(() => {
    if (leavingKey === null) return;
    const timer = setTimeout(() => drop(leavingKey), HELD_LAYER_MAX_MS);
    return () => clearTimeout(timer);
  }, [leavingKey, drop]);

  return (
    /*
     * `relative`, because the leaving layer is positioned against this box and must cover exactly
     * it — that is what makes the swap free of a height jump: the incoming view is in flow and
     * defines the height from its first frame, and the outgoing one is taken out of flow in the
     * same commit, so the column's height never depends on which of the two is taller.
     *
     * **`overflow-x-clip` and not `overflow-hidden`.** The 16 px displacement pushes each layer
     * past one edge of this box for the length of its animation, and inside the sheet that edge is
     * the drawer's rounded corner. `overflow-hidden` would clip *both* axes, which would turn this
     * element into a scroll container and clip anything a view legitimately overflows vertically —
     * a focus ring, a popover, the share pane's own overlay. `overflow-x: clip` paired with a
     * visible `overflow-y` is the one combination CSS keeps stable rather than promoting to `auto`.
     */
    <div
      /* The swap is two layers for 140 ms and one for the rest of its life, which is a shape no
         assertion can reach from the outside without a name for it. `vitest` runs with no DOM here
         (`view-swap.test.ts` drives the logic instead), so the only place the *rendered* result can
         be checked is a browser, and this is what it holds on to — the same reason
         `data-testid="place-sheet"` exists on the sheet. It carries the view's key so a measurement
         can say which view it caught, not merely that it caught one. */
      data-view-swap={current.key}
      className={cn('relative overflow-x-clip', className)}
    >
      {current.leaving === null ? null : (
        <div
          key={current.leaving.key}
          data-view-layer="leaving"
          data-view-key={current.leaving.key}
          /*
           * `aria-hidden` and `pointer-events-none`, because for 140 ms there are two lists in the
           * document saying different things. A screen reader must be told which one is the
           * product, and a finger that lands mid-swap must reach the view that is arriving rather
           * than the one that has already been navigated away from.
           */
          aria-hidden
          onAnimationEnd={(event) => {
            // Only this element's own exit. Every view here contains rows and panels with
            // animations of their own, and those bubble.
            if (event.target === event.currentTarget) drop(current.leaving?.key ?? '');
          }}
          className={cn(
            'pointer-events-none absolute inset-0 flex min-h-0 flex-col',
            LEAVE[current.leaving.direction],
          )}
        >
          {current.leaving.node}
        </div>
      )}
      <div
        key={current.key}
        data-view-layer="current"
        data-view-key={current.key}
        /* `data-view-arrival` so a per-frame probe can tell "this view chose not to animate" from
           "the animation did not run", which are the same thing to a sampler and opposite things to
           a reader. See `SwapState.arrival`. */
        data-view-arrival={current.arrival}
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          current.arrival === 'swap' && ENTER[current.direction],
        )}
      >
        {current.node}
      </div>
    </div>
  );
}
