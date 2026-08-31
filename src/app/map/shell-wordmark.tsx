'use client';

/**
 * **The shell header wordmark — surface 1 of the six** (`I2-8`, `iteration-2-plan.md` §1.2).
 *
 * `voice-and-vocabulary.md` §2 lists six surfaces the product's name may appear on and puts *the
 * shell header wordmark* first. It was specified before iteration 1 started and never built:
 * `PinMark` is imported by `/`, `/sign-in`, `error.tsx`, `not-found.tsx`, `global-error.tsx` and the
 * collection-join screen — every surface **except the product itself**. Sign in and No Crumbs
 * disappeared.
 *
 * This is that surface, and it does not add a seventh: it is the same list entry, finally rendered.
 *
 * ## Three things it deliberately is not
 *
 * - **Not a link.** `/map` is the shell; a wordmark that navigated would be a second door to
 *   somewhere, and the account chip beside it already had to be argued down to one (`page.tsx`).
 *   It states where you are and stops.
 * - **No mark — the type is the whole lockup here**, and this replaces an argument about the
 *   mark's *face* with a measurement about the mark itself. See below.
 * - **Not a second copy of the landing lockup**, and since the mark went it is not a copy at all.
 *   The type is `/` and `/sign-in`'s — Fraunces through `DISPLAY_WORDMARK_AXES`, so the one thing
 *   still drawn here is drawn identically, because two surfaces setting one name differently is how
 *   a brand drifts. What differs is the *chip* around it, which is this map's own floating-control
 *   material: the same hairline, translucent card and blur the account chip opposite it uses.
 *
 * ## Why there is no mark, and it is a measurement rather than a preference
 *
 * This carried `PinMark` at 24px until 2026-08-31. The mascot lane rasterised the real `CRUMB_PATH`
 * at 16× and measured its radius at 720 angles, against four known-answer cases that abort the run
 * if any fails — a true circle at 0.094px (the instrument's zero), a square at 31.3px (its full
 * scale), the crumb at 168px reproducing the 4.6% already recorded in `pin-mark.tsx`, and
 * scale-invariance.
 *
 * | CSS box | ink radius | peak-to-peak irregularity |
 * |---|---|---|
 * | 16px | 7.11 | 0.375px |
 * | **24px — what was here** | 10.67 | **0.547px** |
 * | 48px | | crosses 1px here |
 * | 168px | 74.71 | 3.313px |
 *
 * **At 24px the entire crumb-ness of the crumb is 0.547 of a pixel**, spread around the whole
 * circumference, s.d. 0.123px. Beside a true circle of the same mean radius, pixel-zoomed, the two
 * are indistinguishable up to and including 64px. `pin-mark.tsx` already records the same property
 * from the other direction — *"this mark is not a crumb that is hard to make out; it is a disc"* —
 * and §3.1 rule 1 forbids changing the outline to fix it.
 *
 * So the disc carried no brand. **The product should not draw a mark that means nothing**, and both
 * ways of making it mean something were checked and ruled out: legibility needs ~150px, which is
 * absurd in a map header, and the face is barred by §3.1 rule 5 rather than by size — this chip sits
 * over the live map, the face is gold, and gold stays off the map. A mint-faced disc is what
 * iteration 1 shipped and what the owner called *"the brand is totally missing"*.
 *
 * **This is the record of why the mark went, and it supersedes the paragraph that used to explain
 * why it had no face.** That argument was correct and is now moot: there is nothing here to give a
 * face to. Owner's ruling stands on the type — it is legible at any size and it is what answers the
 * original complaint. Whether the name belongs over the live map at all is a `working-agreement.md`
 * §7 product judgement and is with the owner; **do not restructure this component around its
 * possible removal.**
 *
 * ## Why it is a client component when `page.tsx` is not
 *
 * It is the last beat of the post-login entrance (`I2-7`): 1100 ms, a fade rather than an
 * appearance. That is a subscription to a clock, so it cannot be rendered by a Server Component —
 * and `map-page-client.tsx` cannot hand it the boolean either, because this sits beside that
 * component rather than inside it.
 *
 * So it claims the entrance itself, and the two answers agree by construction: `claimEntrance()`
 * only *reads* the flag, and the one `spendEntrance()` runs in an effect after both have rendered.
 * Anything on this page that asks during the same render gets the same answer.
 */

import { useState } from 'react';

import { DISPLAY_WORDMARK_AXES } from '@/components/brand/display-type';
import { claimEntrance, ENTRANCE_BEATS, useEntranceBeat } from '@/components/map/entrance';

export function ShellWordmark() {
  const [entrance] = useState(claimEntrance);
  const arrived = useEntranceBeat(ENTRANCE_BEATS.wordmark, entrance);
  if (!arrived) return null;

  return (
    // `animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1` — the `enter` rule
    // from `facelift-plan.md` §3a, written exactly as `place-sheet.tsx` and
    // `place-desktop-panel.tsx` already write it, so there is one enter animation in this product
    // and not a second one invented for the brand. The 4 px rise is behind `motion-safe:` and the
    // opacity change is not, which is §3a's "collapse to the opacity change, not to nothing".
    //
    // `pointer-events-none`: it is not a control, and the map underneath must stay draggable
    // through the corner it occupies.
    //
    // It costs no new camera budget. `FLOATING_TOP_CHROME_MOBILE_PX` already reserves 100 px below
    // `lg` for the account chip plus the post-import strip, and the chip has been `hidden lg:flex`
    // since 2026-08-29 — so this occupies room the fit was already conceding. See `page.tsx`, which
    // records that over-reservation and why it is not being retuned here.
    //
    // **The `lg:left-*` offset is a fix for a collision this was photographed making.** At
    // 1440×900 a `left-4` chip sat directly on top of the desktop panel's `3 in Israel` heading —
    // the panel occupies the left column at `lg+`, so "top left" is two different places above and
    // below the breakpoint. `DESKTOP_PANEL_WIDTH` is `map-shell.tsx`'s own clamp, mirrored here
    // because Tailwind scans class strings and cannot read a constant, and
    // `post-login-entrance.test.ts` asserts the two still say the same thing. Clear of the panel,
    // the chip is the map's own floating chrome — the mirror of the account chip in the opposite
    // corner, in the same material.
    //
    // `px-4` where the mark's removal left an asymmetric `pl-2.5 pr-4`: that 2.5 was the optical
    // inset a round mark wants against a pill's own curve, and with nothing round in the chip it
    // was just a lighter left edge. `gap-2` goes with it — there is one child.
    <div
      className="animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1 pointer-events-none absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-11 items-center rounded-full border border-border/70 bg-card/85 px-4 shadow-sheet backdrop-blur-md lg:left-[calc(clamp(320px,26vw,392px)_+_1rem)] lg:top-4"
    >
      <span
        className="font-display text-base font-black tracking-tight text-foreground"
        style={DISPLAY_WORDMARK_AXES}
      >
        No Crumbs
      </span>
    </div>
  );
}
