'use client';

/**
 * `count.tick` — a number that counts up, for the one moment in this flow where the number *is* the
 * news (`facelift-plan.md`'s closed micro-animation list: *"A changed count counts up, only where
 * the number is the news"*, 400ms).
 *
 * ## Where this came from, and why it is not SmoothUI's component
 *
 * `overnight-run-plan.md` §7c names SmoothUI's *Number Flow* for exactly this beat, so it was
 * fetched and read before anything was written here. It does not do this job, for two reasons that
 * are facts about the published registry item rather than opinions:
 *
 *  1. **It is a stepper, not a readout.** `smoothui.dev/r/number-flow.json` ships a `+`/`−` counter
 *     widget with `min`/`max` and an `onChange` — a demo control. Vendoring it into a progress rail
 *     would mean bringing two buttons and a clamped internal value in order to render one settled
 *     number, which is §7c's own trap: *taking a decorative component because it is available is a
 *     failed package*.
 *  2. **Its animation is not in the payload.** The item's `css` block is `{}` and it contains no
 *     `@keyframes`, while its `animateDigit` toggles `slide-out-up` / `slide-in-up` /
 *     `slide-out-down` / `slide-in-down` — four classes nothing in the item defines. Vendored as
 *     published, it renders a **static** number.
 *
 * So what is here is the beat the list actually specifies, and it is deliberately the literal
 * reading of it: the number climbs through the integers to its value. No new dependency —
 * **`gsap` is not in `package.json` and may not be added** (§7c gate 1) — and no `motion` either,
 * because a count-up is a sequence of values rather than a transition between two.
 *
 * ## Reduced motion
 *
 * The number is at its final value in the first frame. Not a shorter climb: the closed list's rule
 * is that all nine animations collapse to the opacity change alone, and for a number the honest
 * reduced form is simply the number.
 *
 * ## It is `aria-hidden`
 *
 * A digit stepping through 0, 1, 2, 3 is four announcements of a number changing for decorative
 * reasons. The caller gives the accessibility tree the whole settled sentence instead — see
 * `rail-screen.tsx` — and this renders for the eye only.
 *
 * Colocated under `src/app/import/screens/` rather than `src/components/ui/` because the import
 * flow is its only caller today; it moves the day a second surface needs it.
 */

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * The whole climb, in milliseconds.
 *
 * **This is `--duration-tick` in `globals.css`, and the two are asserted equal** by
 * `tests/unit/import/payoff-hold.test.ts`. It is a JS constant rather than the `duration-tick`
 * Tailwind utility because a count-up is a sequence of rendered values, not a CSS transition
 * between two — there is nothing for a `transition-*` class to interpolate. Registering it once and
 * pinning the agreement is the nearest honest equivalent of using the token.
 */
export const COUNT_TICK_MS = 400;

export function CountTick({ value, className }: { value: number; className?: string }) {
  /**
   * Starts at zero and climbs.
   *
   * The counts this renders are 1 to 8 (`MAX_CANDIDATES`), so the whole climb is at most eight
   * steps spread over `COUNT_TICK_MS` — fast enough to read as one movement, slow enough that the
   * eye registers "it was nothing, now it is three", which is the entire content of the moment.
   * At N = 1 there is one step, which is correct: the number still arrives rather than being there
   * all along.
   */
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (value <= 0) return;
    // The accessible path is the default, and the check is a media query rather than a Tailwind
    // variant because what changes here is a value over time, not a class.
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // Deferred a microtask rather than set straight, the same way `use-import-run.ts` defers its
      // seed submit: setting state synchronously in an effect body cascades a render, and the lint
      // rule that says so is right. Nothing observable moves — this is still the first paint the
      // user sees.
      queueMicrotask(() => setShown(value));
      return;
    }
    // No reset to 0 here: `useState(0)` is the initial value and `value` does not change for the
    // life of this mount — the rail's count is settled before this component exists.
    const stepMs = Math.max(1, Math.round(COUNT_TICK_MS / value));
    const id = setInterval(() => {
      setShown((current) => {
        const next = current + 1;
        if (next >= value) clearInterval(id);
        return Math.min(next, value);
      });
    }, stepMs);
    // Cleared on unmount as well as on arrival: this component is on screen for the ~700ms payoff
    // hold and is then replaced, and a live interval ticking into an unmounted tree is the same
    // defect one layer down from the hold's own abort handling.
    return () => clearInterval(id);
  }, [value]);

  // `tabular-nums` so 1 → 2 → 3 does not shuffle the sentence beside it sideways on every step.
  return (
    <span aria-hidden className={cn('tabular-nums', className)}>
      {shown}
    </span>
  );
}
