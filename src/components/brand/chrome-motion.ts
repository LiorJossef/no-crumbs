import type { Transition, Variants } from 'motion/react';

/**
 * **The signature entrance** — one orchestrated page-load moment for `/sign-in` and `/`
 * (`iteration-2-plan.md` §3, `I2-6`), kept in one file so the two screens cannot drift into two
 * different arrivals.
 *
 * ## Why the numbers live here and not in `globals.css`
 *
 * They live in *both*, and that is deliberate, for the same reason `src/ui/place/palette.ts`
 * duplicates the category colours: **Motion evaluates a transition in JavaScript and cannot resolve
 * a CSS custom property.** A `transition: { ease: 'var(--ease-emphasised)' }` is not a slow spring,
 * it is an unparseable string. `globals.css` needs its copy because `duration-*`/`ease-*` utilities
 * are what the CSS half of the product animates with.
 *
 * Neither copy is redundant and **neither may be deleted to "fix the duplication"**.
 * `tests/unit/design-system/chrome-tokens.test.ts` asserts the two sides agree; that test is the
 * whole of what stops them drifting, exactly as `palette-tokens.test.ts` is for the palette.
 *
 * ## The sequence, and the one hard constraint on it
 *
 * | | |
 * |---|---|
 * | 60 ms | the card rises — opacity, 18px of `y`, and 1.5% of scale |
 * | 180 ms | its children begin, 45 ms apart: the lockup, kicker, headline, subhead, then the form |
 * | ~790 ms | the last child has settled |
 *
 * **It must not delay the field being focusable**, which is `I2-6`'s exit criterion and the reason
 * every value here is `opacity`/`transform` only. Nothing is conditionally mounted, nothing is
 * `display: none`, nothing waits on an animation callback: the whole form is in the DOM and
 * hit-testable at first paint, and an entrance that gated it would be a worse screen than a still
 * one. Verified by focusing `#email` at t=0 rather than by reading this paragraph.
 *
 * ## Reduced motion, and why there is no `reduced` branch in this file
 *
 * `facelift-plan.md` §3a — the nine collapse **to the opacity change, not to nothing**. That is
 * exactly what Motion's own `<MotionConfig reducedMotion="user">` does: with the preference set it
 * drops transform and layout animations and lets opacity and colour through, and it drops them at
 * *animation* time rather than at render time. `ChromeStage` and `ChromeGround` each declare it.
 *
 * **What that measures as, stated plainly rather than as the number this file first claimed.** With
 * `prefers-reduced-motion: reduce` at 1440×900: no `y`, no `scale`, no `rotate`, and the two ambient
 * blooms snap to their end keyframe and never move again — verified by sampling their `transform`
 * 2.5 s apart, which is identical, against a normal context where it is not. What survives is the
 * opacity ramp **and its stagger**, so the sequence still takes about 700 ms rather than the 140 ms
 * an earlier draft of this comment promised. That is a deliberate acceptance and not an oversight:
 * `staggerChildren` is a transition rather than a transform, so Motion does not drop it, and a
 * sequence of 340 ms cross-fades carries none of the vestibular risk the preference exists to
 * avoid. Every field is focusable throughout, which is the property that actually matters here and
 * is measured separately.
 *
 * **The first version of this file branched on `useReducedMotion()` instead, and both ways of
 * getting that wrong are worth recording, because the second one is invisible.**
 *
 *  1. *The stuck transform.* The reduced variants named `opacity` and omitted the rest, so there
 *     was no target to animate the transforms back to. The hook cannot know the preference during
 *     the server render, so motion applied the *motion* `hidden` — `scale(0.985) translateY(18px)`
 *     on the card, `scale(0.62) rotate(-12deg)` on the mark — and then swapped to variants that
 *     never mentioned them. Measured at 1440×900 with `prefers-reduced-motion: reduce`: the card
 *     sat permanently 18px low and the mascot permanently at 61% and rotated 12°, forever. The
 *     reduced-motion user got the only broken rendering of this screen.
 *  2. *The hydration mismatch.* Naming every property fixed the rendering and left the real
 *     problem: `useReducedMotion()` reads `matchMedia` synchronously on the client and returns
 *     `false` on the server, so the two renders emitted **different `style` attributes** and React
 *     logged *"a tree hydrated but some attributes … didn't match … this won't be patched up"* on
 *     the product's front door — for reduced-motion users only, which is why nothing caught it
 *     until the console was read in that context. Any render-time branch on a device preference has
 *     this bug. `MotionConfig` does not, because both renders emit the same markup.
 */

/** `--ease-emphasised`, as the four control points Motion wants. */
export const EASE_EMPHASISED = [0.05, 0.7, 0.1, 1] as const;
/** `--ease-standard`. */
export const EASE_STANDARD = [0.2, 0, 0, 1] as const;

/** The container. It paints nothing and animates nothing; it exists to hold the stagger. */
export const STAGE_VARIANTS: Variants = {
  hidden: {},
  shown: { transition: { delayChildren: 0.06 } },
};

/** The card itself: the one object on the screen, so it arrives as one object. */
export const CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.42,
      ease: [...EASE_EMPHASISED],
      delayChildren: 0.12,
      staggerChildren: 0.045,
    },
  },
};

/** Every staggered child inside the card. */
export const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [...EASE_STANDARD] } },
};

/**
 * The mark, which is the one element that gets a spring rather than a curve.
 *
 * It is the product's face and it is the first thing on the screen, so it lands with a little
 * weight instead of sliding in with the type. `visualDuration` keeps the perceived length in step
 * with the 0.34 s curves around it — a spring's `duration` is not its settling time.
 */
export const MARK_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.62, rotate: -12 },
  shown: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { type: 'spring', visualDuration: 0.34, bounce: 0.3 },
  },
};

/**
 * The ambient field: two blooms that drift behind the card, forever, at a speed nobody watches.
 *
 * `x`/`y`/`scale` only — compositor properties on two elements that paint a radial gradient and
 * nothing else, so a frame costs a transform and no repaint. `repeatType: 'mirror'` rather than a
 * loop because a bloom that snaps back to its start is a cut, and a cut is the one thing an ambient
 * layer must never be. All three are transforms, so `reducedMotion="user"` stops the drift outright
 * and leaves the blooms where they are.
 */
export const BLOOM_DRIFT: Transition = {
  duration: 24,
  repeat: Infinity,
  repeatType: 'mirror',
  ease: 'easeInOut',
};
