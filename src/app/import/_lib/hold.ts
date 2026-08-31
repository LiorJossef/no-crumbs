/**
 * Wait, unless the run has been cancelled.
 *
 * **A client module, despite the `_lib` folder** — see `probe-contract.ts`'s header.
 *
 * The one timer in the import flow, and it exists to *delay a transition*, never to advance a
 * stage. That distinction is the run's rule 3 and `facelift-plan.md` §4 decision 4: holding a fact
 * the server already sent so it is legible costs the product nothing in honesty; marking a step
 * done because a timer fired would be inventing the news. `tests/unit/import/payoff-hold.test.ts`
 * asserts that nothing between this hold and the end of `submit` touches a stage.
 *
 * ## It resolves on abort rather than rejecting
 *
 * Two reasons, and the second is the one that matters. A rejection here would land in `submit`'s
 * `catch`, which is the branch that renders the `INTERNAL` failure screen — so a user pressing
 * Cancel during the hold would be shown an error about our servers. Resolving early and letting
 * the caller's `stillCurrent()` re-check decide is the same shape every other response in that
 * function already uses.
 *
 * ## The timer is cleared either way
 *
 * On abort the timeout is cancelled and the listener removed, so nothing is left pending to resolve
 * into a component that is no longer on screen. A dangling 700ms timer is the same defect one layer
 * down from the one the `stillCurrent()` re-check closes.
 */
export function hold(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}
