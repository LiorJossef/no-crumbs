'use client';

import type { ReactNode } from 'react';
import { MotionConfig, motion } from 'motion/react';

import { ChromeMark } from './chrome-mark';
import {
  CARD_VARIANTS,
  ITEM_VARIANTS,
  MARK_VARIANTS,
  STAGE_VARIANTS,
} from './chrome-motion';
import { DISPLAY_WORDMARK_AXES } from './display-type';

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
 * ## The one lockup, and it is the specified one
 *
 * The mark and the name are rendered *here* rather than by each page, because they were the same
 * eight lines in two files and `pin-mark.tsx`'s own header says why that is how a brand drifts.
 * `ChromeMark` carries the face: §3.1 rule 2 puts the face on chrome, and `voice-and-vocabulary.md`
 * §2 treats *the landing and sign-in mark* as one surface — so the name appears on both sides of a
 * single step, or on neither. That file is also the seam the gold mascot arrives through; read it
 * before changing anything about how the mark is drawn here.
 *
 * **The name is set stacked, and that is `no-crumbs-design-system.html` §Wordmark rather than a
 * preference.** It names three constructions and the *primary* one is the mark beside `No` over
 * `Crumbs` — *"stacked is the primary: it makes a solid rectangle that sits beside the mascot
 * without either fighting the other, and it puts No and Crumbs on separate lines so the phrase
 * reads as a phrase."* What shipped here first was the document's **third** variant, the wordmark
 * alone on one line, with a mark put next to it. Fraunces at 900 with `SOFT` 60 and `WONK` on
 * (`DISPLAY_WORDMARK_AXES`), `leading-none` so the two lines make the rectangle the document is
 * describing, and no gradient, no outline and no drop shadow — §Wordmark forbids all three.
 *
 * Sizes clear the one stated minimum with room: *"at the shell header the mark sits at 22px with
 * the wordmark at 15px, which is the smallest the pair may ever be set together."* Here it is
 * 44/20 on a phone and 56/24 on a desktop.
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
      {/* `px-5` at the base breakpoint, not `px-4`. At 390 the card was 358 wide and the ground
          survived as a 16px frame, which reads as a white card with a tinted border rather than as
          an object on a ground. The horizontal margin is the cheap half of the fix; the expensive
          half is that light's ground now has range at all, which is what makes 20px of it register.
          Not taken further: every extra pixel here comes off a 390px form, and the vertical bands
          above and below the card are 75px and 74px, which is where the ground actually reads on a
          phone. */}
      <motion.div
        variants={STAGE_VARIANTS}
        initial="hidden"
        animate="shown"
        className="relative z-10 flex min-h-dvh w-full items-center justify-center px-5 py-8 sm:px-6 lg:px-10 lg:py-12"
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
              {/* No wash on this half. There was one, and §The system bans decorative gradients on
                content whatever hue they are — the mesh, the glow and the lit edge are all *around*
                the reading surface; a sweep behind the headline is *on* it. The divider tells the
                two halves apart, which is what a divider is for. */}
              <section className="relative flex flex-col justify-center gap-5 px-6 pb-8 pt-9 lg:gap-6 lg:px-11 lg:py-14">
                <motion.div
                  data-entrance
                  variants={ITEM_VARIANTS}
                  className="relative flex items-center gap-3 lg:gap-4"
                >
                  <motion.span
                    data-entrance
                    variants={MARK_VARIANTS}
                    className="relative flex shrink-0 items-center justify-center"
                  >
                    {/*
                     * **The halo's box may not reach the wordmark, and the number that guarantees
                     * that is the gap beside it.**
                     *
                     * This was `-inset-7` — 28px of glow around a 44px mark — against a `gap-3`,
                     * so the box overran the wordmark's leading edge by exactly 28 − 12 = 16px on a
                     * phone and 28 − 16 = 12px on a desktop. `closest-side` reaches zero alpha at
                     * the *box* edge, and the text starts *inside* the box, so it was painting
                     * there: measured on painted pixels under the first characters of `No`, with
                     * all ink turned transparent, **18 units per channel in light and 33 in dark**
                     * against the same row clear of the mark. Not nil, which is what it was
                     * assumed to be before it was measured.
                     *
                     * That is a decorative gradient under ink — the same thing that removed
                     * `--chrome-panel-wash` from the section around this one, smaller and harder to
                     * see. It never cost a contrast ratio, because the wordmark is `--foreground`
                     * at 14.7:1 on this material, and that is exactly why it survived a sweep that
                     * found 0 failures across 120 strings. The rule is about where a gradient is,
                     * not about whether it currently happens to be affordable.
                     *
                     * So the inset now matches the gap at each breakpoint and the box stops where
                     * the text begins. Keep them equal: raising one without the other puts this
                     * back.
                     */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-3 lg:-inset-4"
                      style={{ background: 'var(--chrome-mark-glow)' }}
                    />
                    <ChromeMark className="relative size-11 lg:size-14" />
                  </motion.span>
                  {/*
                   * Two flex items rather than one text node with a `<br>`, and the words do not
                   * run together — worth checking rather than assuming, because the *opposite* case
                   * is a bug this page has already shipped once, in the account-switch button's
                   * `gap-1`: whitespace **between** flex items was discarded and "New here? Create
                   * an account" lost its space on the product's front door.
                   *
                   * **What was measured, stated as narrowly as it was taken.** In Chromium's
                   * accessibility tree (`Accessibility.getFullAXTree` over CDP) at both gate
                   * viewports, this is **two separate `StaticText` nodes, `No` and `Crumbs`** —
                   * there is no `NoCrumbs` node anywhere in the tree — and `innerText` reads
                   * `"No\nCrumbs"`, a line break rather than a join. That is the whole claim.
                   * What an actual screen reader *utters* is not tested here and is not asserted:
                   * a comment that says "announces as one phrase" would be stating an unmeasured
                   * fact, which is the same defect class as the eight AA failures this file's
                   * placeholder fix removed — something that reads as verified and is not.
                   */}
                  <span
                    className="flex flex-col font-display text-xl leading-none font-black tracking-tight text-foreground lg:text-2xl"
                    style={DISPLAY_WORDMARK_AXES}
                  >
                    <span>No</span>
                    <span>Crumbs</span>
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
