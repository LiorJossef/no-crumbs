'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ChromeMark } from './chrome-mark';
import { CRUMB_ARTBOARD, CRUMB_BOUNDS } from './crumb-path';
import { CRUMB_CONSTRUCTIONS } from './mascot-colors';
import { DISPLAY_WORDMARK_AXES } from './display-type';

/**
 * **How far the faced mark's ink sits inside its own box, as a fraction of that box.**
 *
 * Measured on painted pixels at 1440x900 light: every element in `/sign-in`'s editorial column has
 * its box at `x = 253` — the mark, the kicker pill, the headline, the subhead — and the headline's
 * ink starts at 253 too, because a Fraunces cap reaches its box edge. **The mark's ink started at
 * 258.** Five pixels right of a rail four things are on.
 *
 * It is not a rendering accident, which is what makes it correctable rather than a hunch. The faced
 * mark is drawn into `CRUMB_ARTBOARD` (`-8 -8 116 116`) rather than the authoring square, because
 * the keyline is a stroke and a stroke straddles its path. So the leftmost ink is the outline's
 * measured `CRUMB_BOUNDS.minX`, less half the keyline, expressed from the artboard's own origin:
 *
 *     (5.2 − 4.5/2 − (−8)) / 116 = 9.44% of the box
 *
 * which is **5.29px at the 56px desktop mark and 4.15px at the 44px phone one**. Measured: 5 and 4.
 *
 * **Derived from the constants rather than typed as a number**, exactly as `CRUMB_HEAD_CENTRE` is,
 * so it cannot drift from the shape it is correcting. Retune the keyline or move the outline and
 * this follows; paste `0.0944` here and the next person to touch `crumb-path.ts` silently
 * un-aligns the product's mark.
 *
 * This is the classic optical-alignment case — a shape whose bounding box is not its silhouette,
 * box-aligned against type — and the correction is a negative inline start on the lockup rather
 * than a transform on the mark, so the mark and the wordmark keep the gap the halo comment below
 * spends four paragraphs defending.
 */
export const CHROME_MARK_INK_INSET =
  (CRUMB_BOUNDS.minX - CRUMB_CONSTRUCTIONS.outlined.keylineWidth / 2 - CRUMB_ARTBOARD.minX) /
  CRUMB_ARTBOARD.size;

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
    /* `overflow-x-clip`, and it is the whole of a defect that shipped on six screens.
       `document.documentElement.scrollWidth` was **418 against a 390 layout viewport** on `/`,
       `/sign-in`, `?mode=sign-up`, `/auth/reset`, `?state=expired` and `/auth/new-password` —
       every screen this component draws — and **0** on the two that do not use it. The glow below
       is `-inset-x-12` on a card that already fills the viewport minus its own padding, so its box
       measures `left = -28, right = 418`, which is the 418 exactly. Four of the six inherited it by
       being built correctly on a shared component, which is what a systemic defect does.

       Clipped here rather than on the card, because clipping at the card would clip the glow to the
       card's own edge and the glow is entirely falloff — the point of `-inset-x-12` is that what
       shows is the falloff rather than an edge. `ChromeGround` already does exactly this one
       component away: its blooms reach `x = 607` and cost no scroll, because its wrapper clips.

       **`clip` on one axis, not `hidden` on both.** `overflow-x: hidden` forces the other axis to
       `auto`, which would make this a scroll container on a screen that is legitimately taller than
       a phone; `overflow-x: clip` leaves `overflow-y: visible` alone, and clip creates no scroll
       container at all. */
    <div className="relative z-10 flex min-h-dvh w-full items-center justify-center overflow-x-clip px-5 py-8 sm:px-6 lg:px-10 lg:py-12">
      <div data-entrance="card" className="relative w-full max-w-md lg:max-w-5xl">
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
              className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden"
              style={{ background: 'var(--chrome-edge)' }}
            >
              {/*
               * **The entrance's closing beat: the edge lights up, once, left to right.**
               *
               * The owner asked for `/sign-in` to be *more alive*, and the brief's own instruction
               * is that one orchestrated moment beats scattered effects. The entrance previously
               * ended silently — the last form field settled at ~790 ms and nothing acknowledged
               * that the object had finished arriving. This is that acknowledgement, and it is
               * deliberately on the **card** rather than on any of its contents: the thing that
               * arrived is the card.
               *
               * A third of the edge's width, painting one gradient, moved with `transform`. Nothing
               * here is read, so it costs no contrast; nothing here is layout, so it costs no
               * reflow. It runs `1`, never `infinite` — `#motion`'s rule about Land applies to it
               * word for word.
               *
               * The 720 ms delay, the 880 ms duration and the reduced-motion collapse are all in
               * `globals.css`, under `data-chrome-motion` rather than `data-entrance` — that
               * attribute means *a staggered beat of the arrival that ends fully opaque*, and this
               * is neither staggered nor opaque at the end. The token file carries the argument.
               * **It is a CSS animation and not a Motion variant**, for the
               * reason that file records at length: a variant's initial state is written into the
               * server HTML and only hydration removes it, and that is how this screen once shipped
               * a blank front door.
               */}
              <div
                data-chrome-motion="edge-sweep"
                className="absolute inset-y-0 left-0 w-1/3"
                style={{ background: 'var(--chrome-edge-spark)' }}
              />
            </div>

            <div className="grid lg:grid-cols-2">
              {/* No wash on this half. There was one, and §The system bans decorative gradients on
                content whatever hue they are — the mesh, the glow and the lit edge are all *around*
                the reading surface; a sweep behind the headline is *on* it. The divider tells the
                two halves apart, which is what a divider is for.

                **`justify-center` is gone from this half and the centring moved down one level, to
                the editorial block alone.** With it here, the mark was the first item of a column
                centred against a form column of a different height, so **the product's identity
                moved whenever the subhead rewrapped**: measured at 1440, the mark sat 57px below
                the card's top on `/`, `/auth/reset` and `/auth/new-password`, 79.5px on
                `?mode=sign-up` and 132.5px on `/sign-in` — and toggling the sign-in screen between
                its two modes, which is a control on the screen itself, moved the mark 11px.

                The centring was right about the thing it was fixing (80px of dead space under the
                landing CTA) and wrong about its scope: **the space it was reclaiming is under the
                form half's action block, and it centred the column carrying the identity to get
                it.** So it stays where its reason is, on the form half below, and the lockup now
                sits on this card's top padding on every screen — 33px below the card top at 390 and
                57 at 1440, one number per breakpoint across all five siblings and unchanged by the
                sign-in↔sign-up toggle. Both properties, neither traded for the other.

                Paddings are `py-8` rather than `pb-8 pt-9`, and the form half's `pt-7` goes with
                it. The card's four vertical paddings were 36/32/28/32 on a phone and 56/56/56/56 at
                `lg`: an optical decision about text above a rule versus a label below one is
                arguable, but one that exists at one breakpoint and vanishes at the other is a
                leftover from before `lg:py-14` was written. The two moves cancel — the editorial
                half loses 4px at the top, the form half gains 4 — so the card's height is unchanged
                and only the divider sits 4px higher. */}
              <section className="relative flex flex-col gap-5 px-6 py-8 lg:gap-6 lg:px-11 lg:py-14">
                {/* `--chrome-mark-size` rather than `size-11 lg:size-14` on the mark, because two
                  things now need that number and a second copy of it is how they drift apart: the
                  mark's box, and the optical correction below, which is a fraction *of* the box.
                  Written through `--spacing()` so both still come off the spacing scale — 11 and 14
                  are the same two steps that were here. */}
                <div
                  data-entrance="item"
                  className="relative flex items-center gap-3 [--chrome-mark-size:--spacing(11)] lg:gap-4 lg:[--chrome-mark-size:--spacing(14)]"
                >
                  <span
                    data-entrance="mark"
                    className="relative flex shrink-0 items-center justify-center"
                    /* The optical correction, and it is on the lockup's first item rather than on
                       the mark itself: a negative inline start on a flex row's first child pulls
                       the wordmark along with it, so the whole lockup slides left by the mark's own
                       ink inset and the mark-to-wordmark gap is exactly what it was. A
                       `translateX` on the `<svg>` would align the ink and silently widen that gap
                       by the same 5.3px — on the one measurement the halo comment below exists to
                       protect. See `CHROME_MARK_INK_INSET`. */
                    style={{
                      marginInlineStart: `calc(var(--chrome-mark-size) * ${-CHROME_MARK_INK_INSET})`,
                    }}
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
                    {/*
                     * `data-chrome-motion="mark-breathe"` breathes the light, **opacity only and
                     * never scale** — see `globals.css`. The paragraph above is the reason: this box was
                     * cut back to match the lockup's gap exactly so it stops where the wordmark
                     * begins, and any scale animation would grow it back over the ink and rebuild
                     * the defect the measurement removed. Keeping the two facts adjacent is the
                     * point of writing it here rather than only in the stylesheet.
                     */}
                    <span
                      aria-hidden
                      data-chrome-motion="mark-breathe"
                      className="pointer-events-none absolute -inset-3 lg:-inset-4"
                      style={{ background: 'var(--chrome-mark-glow)' }}
                    />
                    <ChromeMark className="relative size-(--chrome-mark-size)" />
                  </span>
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
                </div>

                {/* **The editorial block is top-set under the lockup, and the slack goes to the
                  bottom of the column.** The first version of this fix kept the centring and moved
                  it down one level — `lg:flex-1 lg:justify-center` here, so the block centred in
                  whatever the lockup left. It pinned the mark correctly and looked worse: on
                  `/sign-in` at 1440 it opened a ~150px hole between the lockup and the kicker, and
                  a void *inside* a reading order separates the identity from the message. Trailing
                  space at the foot of a column is the quiet corner; a gap in the middle is not.
                  Photographed both ways before choosing. */}
                <div className="relative flex flex-col gap-3 lg:gap-4">
                  {editorial}
                </div>
              </section>

              {/* `justify-center`, so whichever column is shorter is centred against the taller one
                rather than pinned to its top. `/sign-in`'s form is the taller half and `/`'s action
                block is the shorter one, and without this the landing card carried 80px of dead
                space under its CTA — the same defect as the old full-screen layout, shrunk into a
                card. The editorial half above states the same intent one level down; its comment
                carries why. */}
              <section className="relative flex flex-col justify-center border-t border-border px-6 py-8 lg:border-l lg:border-t-0 lg:px-11 lg:py-14">
                {form}
              </section>
            </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One step of the entrance. Wrap anything that should arrive in its own beat.
 *
 * A plain `<div>` carrying `data-entrance="item"`; the animation is `globals.css`'s and needs no
 * JavaScript, which is the point — see that file's entrance block for the blank front door this
 * replaced.
 */
export function ChromeItem({
  children,
  className,
  step = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Which beat of the entrance this is. Set explicitly rather than derived from `nth-child`,
   *  because the beats run across two columns and `nth-child` restarts inside each one. */
  step?: number;
}) {
  return (
    <div
      data-entrance="item"
      className={className}
      style={{ '--enter-step': step } as CSSProperties}
    >
      {children}
    </div>
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
