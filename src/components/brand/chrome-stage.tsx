'use client';

import type { ReactNode } from 'react';
import { MotionConfig, motion } from 'motion/react';

import {
  CARD_VARIANTS,
  ITEM_VARIANTS,
  MARK_VARIANTS,
  STAGE_VARIANTS,
} from './chrome-motion';
import { DISPLAY_WORDMARK_AXES } from './display-type';
import { PinMark } from './pin-mark';

/**
 * **The first impression, as one object.**
 *
 * `/sign-in` and `/` were two columns of emptiness: an editorial band floating in the vertical
 * middle of a void, a near-invisible full-height panel beside it, and — measured across six screens
 * in Q1 finding S3 — **45–60% of the mobile viewport empty**. The panel was painted with a
 * white-at-55% Tailwind literal, and when P0 correctly retired it for `--panel` the panel stopped
 * failing AA and started reading as nothing at all: the same near-black as the half beside it,
 * separated by a hairline.
 *
 * (Neither of those sentences may quote the class it is about. `token-call-sites.test.ts` matches
 * the literal with a regex over the source and cannot tell a comment from a call site — the same
 * rule `page.tsx` already records for the arbitrary-value brackets it names in prose.)
 *
 * The answer is the one already in this codebase rather than an invented section: **the desktop
 * no-places screen is a centred card sized to its content.** So is this. There is one object on
 * the screen, it is the size of what is in it, and the slack is the room around it rather than a
 * stretched gap above a pinned action. Nothing was added to fill space — no illustration, no
 * testimonial, no count.
 *
 * ## Why the card is a material and the ground is not
 *
 * `iteration-2-plan.md` §2 splits the system: on the map colour is data and motion misleads, and
 * everywhere else is chrome. This is chrome, and it spends the whole allowance — a gradient mesh, a
 * drifting light field, grain, an indigo glow under the card, a lit edge along its top, and a
 * genuine elevation between the card and what is behind it.
 *
 * **All of it is behind or around the reading surface, none of it under the ink.** That is not
 * restraint for its own sake; it is a measurement. On painted pixels at commit 3954793 the light
 * theme's `--muted-foreground` clears AA by **0.01** (4.51:1) and `--brand` as the kicker by 0.27,
 * so any tint at all beneath either of them fails. Putting the text on `--panel-raised` — which
 * composites to within a point or two of `--card` in both themes — is what buys the mesh the room
 * to be bold.
 *
 * ## The one lockup
 *
 * The mark and the name are rendered *here* rather than by each page, because they were the same
 * eight lines in two files and `pin-mark.tsx`'s own header says why that is how a brand drifts.
 * `face` is on: `brand-and-product-foundation.md` §3.1 rule 2 puts the face on chrome, and
 * `voice-and-vocabulary.md` §2 treats *the landing and sign-in mark* as one surface — so the name
 * appears on both sides of a single step, or on neither.
 */
export function ChromeStage({
  editorial,
  form,
}: {
  /** The kicker, headline and subhead. The lockup above them is this component's, not the page's. */
  editorial: ReactNode;
  form: ReactNode;
}) {
  return (
    /* `reducedMotion="user"` rather than a render-time `useReducedMotion()` branch: it collapses
     * the entrance to its opacity ramp — §3a's rule exactly — without the two renders disagreeing.
     * `chrome-motion.ts` records what the branch cost, including a hydration mismatch that only
     * appeared for reduced-motion users. */
    <MotionConfig reducedMotion="user">
      <motion.div
        variants={STAGE_VARIANTS}
        initial="hidden"
        animate="shown"
        className="relative z-10 flex min-h-dvh w-full items-center justify-center px-4 py-8 sm:px-6 lg:px-10 lg:py-12"
      >
        {/*
         * **The entrance's resting state, for a browser that will never run it.**
         *
         * Motion renders the `hidden` variant into the server HTML — `opacity: 0` on the card and on
         * every item — which is correct and is what stops a flash of finished layout before the
         * animation starts. With scripting off it is also the *final* state: `page.tsx`'s own header
         * argues that the landing screen is the one screen that must render when everything else is
         * broken, and an invisible one does not clear that bar. Four lines of `<noscript>` put every
         * animated element back at rest.
         */}
        <noscript>
          <style>
            {'[data-entrance]{opacity:1!important;transform:none!important}'}
          </style>
        </noscript>

        <motion.div
          data-entrance
          variants={CARD_VARIANTS}
          className="relative w-full max-w-md lg:max-w-5xl"
        >
          {/* The glow the card sits in. Sized past the card on every side so what shows is the
            falloff rather than an edge, and painted before the card in source order so it is
            behind it without either of them needing a z-index. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-12 -bottom-16 -top-12"
            style={{ background: 'var(--chrome-glow)' }}
          />

          <div className="relative overflow-hidden rounded-xl border border-border bg-panel-raised shadow-overlay backdrop-blur-panel-raised">
            {/* The lit edge: the two brand colours as a single hairline along the top of the card.
              Colour that costs no contrast, because nothing is read on it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: 'var(--chrome-edge)' }}
            />

            <div className="grid lg:grid-cols-2">
              <section className="relative flex flex-col justify-center gap-5 px-6 pb-8 pt-9 lg:gap-6 lg:px-11 lg:py-14">
                {/* The editorial half's own tint, fading out by 45% — the strong end is behind the
                  mark and the headline, which are `--foreground` at 10:1 or better; the weak end is
                  behind the subhead, which is the ink with no headroom. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'var(--chrome-panel-wash)' }}
                />

                <motion.div
                  data-entrance
                  variants={ITEM_VARIANTS}
                  className="relative flex items-center gap-3"
                >
                  <motion.span
                    data-entrance
                    variants={MARK_VARIANTS}
                    className="relative flex shrink-0 items-center justify-center"
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-7"
                      style={{ background: 'var(--chrome-mark-glow)' }}
                    />
                    <PinMark face className="relative size-11 lg:size-14" />
                  </motion.span>
                  <span
                    className="font-display text-xl font-black tracking-tight text-foreground lg:text-2xl"
                    style={DISPLAY_WORDMARK_AXES}
                  >
                    No Crumbs
                  </span>
                </motion.div>

                <div className="relative flex flex-col gap-3 lg:gap-4">
                  {editorial}
                </div>
              </section>

              {/* `justify-center` on both halves, so whichever column is shorter is centred against
                the taller one rather than pinned to its top. `/sign-in`'s form is the taller half
                and `/`'s action block is the shorter one, and without this the landing card carried
                80px of dead space under its CTA — the same defect as the old full-screen layout,
                shrunk into a card. */}
              <section className="relative flex flex-col justify-center border-t border-border px-6 pb-8 pt-7 lg:border-l lg:border-t-0 lg:px-11 lg:py-14">
                {form}
              </section>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}

/**
 * One step of the entrance. Wrap anything that should arrive in its own beat.
 *
 * A plain `motion.div` with no `initial`/`animate` of its own, so it inherits `hidden`/`shown` from
 * whichever `ChromeStage` is above it in the React tree — that is how the stagger reaches through
 * the ordinary `<div>`s a page composes with.
 */
export function ChromeItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div data-entrance variants={ITEM_VARIANTS} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * The kicker, as a pill rather than as tracked mint text.
 *
 * It was `text-brand` at 11px, which measured **4.77:1** in light — clearing AA by 0.27 and leaving
 * no room for the mesh behind it. `--tag`/`--tag-foreground` is a pair chosen together in both
 * themes (10.9:1 at night, 7.4:1 on paper), so the label gets its contrast from its own ground
 * instead of from the page's, and the screen gains a designed object where it had a small coloured
 * label sitting under a much larger one.
 */
export function ChromeKicker({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-tag px-3 py-1.5 text-micro font-bold tracking-[0.14em] text-tag-foreground uppercase">
      <span aria-hidden className="size-1.5 rounded-full bg-chrome-accent" />
      {children}
    </span>
  );
}
