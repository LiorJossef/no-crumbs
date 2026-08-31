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
 * - **Not a logo bar**, which is the thing `#wordmark` actually forbids on this surface. It is a
 *   44px chip in a corner, the mirror of the account chip opposite, and the map stays draggable
 *   through it.
 * - **Not a second copy of the landing lockup.** The type is `/` and `/sign-in`'s — Fraunces
 *   through `DISPLAY_WORDMARK_AXES` — and the mark is the same `CrumbMascot` the app icon and the
 *   link preview draw, from one geometry module, because two surfaces setting one name or drawing
 *   one character differently is how a brand drifts. What differs is the *chip* around them, which
 *   is this map's own floating-control material: the same hairline, translucent card and blur the
 *   account chip opposite it uses.
 *
 * ## The mark is back, on the owner's ruling — and the size is a measurement, not a preference
 *
 * **Owner, 2026-08-31: *"the branding mascot should be part of the platform, main page."*** That
 * settles an argument the design system had with itself. `no-crumbs-design-system.html`
 * §`wordmark` forbids the lockup over the live map in terms — *"the map already carries pins in
 * four colours and a wordmark on top of it is noise"* — and in the same sentence names the
 * alternative: *"if the map needs the brand, it gets **the mascot** in the corner of the empty
 * state, **not a logo bar**."* The document objects to a logo bar and offers the mascot. So this
 * is not an override of `#wordmark` so much as the branch it recommended, taken.
 *
 * ### What was here before, and why it went
 *
 * This carried `PinMark` at 24px until 2026-08-31. The mascot lane rasterised the real `CRUMB_PATH`
 * at 16× and measured its radius at 720 angles, against four known-answer cases that abort the run
 * if any fails. **At a 24px box the entire crumb-ness of the crumb is 0.547 of a pixel** on a
 * 10.67px ink radius, s.d. 0.123px; beside a true circle of the same mean radius it is
 * indistinguishable up to and including 64px. The disc carried no brand and was removed. That
 * finding is unchanged and this does not reverse it — **it is the argument for the face.**
 *
 * ### The face reads, and the threshold is far lower than an eye estimate said
 *
 * **This paragraph previously carried an eyeballed table and the table was wrong.** It claimed the
 * face was *"a smudge to 24px, eyes separate at 26-28 with the mouth still closed up, reads at
 * 32"*. Measured, the mouth is present and above bar from **22px** and the eyes resolve as two
 * objects from **20px**, the smallest size tested. Corrected here because the wrong version would
 * have been read as a reason not to go below 32.
 *
 * The instrument (`i3brand-face-legibility.mjs`, against `9a95444`) rasterises the **real**
 * `crumbMascotMarkup` output - the modules loaded unmodified, nothing re-transcribed - and applies
 * two conditions fixed before anything was rendered:
 *
 *  1. **Feature contrast >= 3:1**, the WCAG 2.2 SC 1.4.11 bar for a graphical object that must be
 *     perceived to understand the content. Measured locally: darkest pixel in the feature against
 *     the brightest in a 2px ring, so the shine, the blush and the crust are handled by geometry
 *     rather than by a hand-picked reference point.
 *  2. **The eyes stay two objects** - ink fraction along the row through the eye centres peaks
 *     >= 0.5 inside each eye and falls < 0.5 between them.
 *
 * Six known-answer cases gate the run: `mono` (no face at all) must measure 1.00:1 on all three
 * regions; 400px must clear 6:1; 4px must fail; eye separation must track 22/116 of the box; a
 * *merged* verdict must have sampled at least one pixel between the eyes; and the verdict must
 * depend on device pixels alone, so 40px at 1x and 20px at 2x agree.
 *
 * | CSS box, **1x** | left eye | right eye | mouth | two eyes? |
 * |---|---|---|---|---|
 * | 20 px | 5.75:1 | 5.64:1 | 4.07:1 | yes |
 * | 22 px | 6.10:1 | 7.14:1 | 3.57:1 | yes |
 * | 26 px | 9.68:1 | 8.47:1 | **4.67:1** | yes |
 * | **32 px - shipped** | 9.68:1 | 8.47:1 | **7.26:1** | yes |
 * | 40 px | 9.68:1 | 8.47:1 | 8.35:1 | yes |
 *
 * At 2x and 3x every row sits at the 8.47:1 ceiling from 20px up. The ink profile at 26px/1x is
 * `[0 0.63 1 1 0.22 0 0.46 1 0.94 0.04 0]` - two peaks, a clean trough, two eyes.
 *
 * **So 26px passes, and the size is a judgement inside a passing range rather than a measurement.**
 * 32px ships because the *mouth* is the weakest feature and 26px leaves it at 4.67:1 against a 3:1
 * floor where 32px has 7.26:1, and because `CRUMB_FACE_MIN_PX` is 32, so shipping it re-argues no
 * constant this repository already holds. That constant is now known to be **conservative** for
 * `outlined` on a card ground - it is the app-icon row's number, and a corner mask is a harder case
 * than a chip.
 *
 * ### What `mono` cannot do, which is the part that did not change
 *
 * The silhouette is a filled disc at 20, 22, 24, 26, 28, 32 **and 36 px**, photographed at 1:1 CSS
 * pixels in both themes. That is the 0.547px finding arriving from the other side, and it is why
 * there is no non-gold version of this: every value `currentColor` could take is ink (a grey disc -
 * the mark removed this morning, rebuilt in a different shade) or a brand/category hue, and mint is
 * out on its own terms because the uncategorised pin is mint-family.
 *
 * **`#wordmark`'s "at the shell header the mark sits at 22px" is not where this number came from.**
 * It is the same paragraph family as `#mark`'s *"legible blob at 16px"*, which
 * `iteration-2-record.md` §5 records as measurably false. It happens to be survivable for a *faced*
 * mark, per the table above - but that is two different questions landing near each other, not the
 * document being right. Re-run the ladder before taking a size from it.
 *
 * ### Gold on this surface, and the fence it is inside
 *
 * §3.1 rule 5 keeps gold off the map, re-recorded by ruling 3 as **"gold and category colour never
 * share a surface"** with an enumerated fence: no pin, no category surface, no basemap layer, no
 * filter chip. This chip is none of the four — it has its own ground (`bg-card/85`, hairline, blur),
 * which is the same card material `/sign-in` carries gold on already.
 *
 * **The reason recorded here was overstated for one commit, and this is the narrower one the
 * photograph supports.** `42221cd` said the face does the disambiguation — that a faceless gold
 * disc would be ambiguous with a café pin and a faced one cannot be. Measured against a real café
 * pin in the same frame on the night map, that claims more than it can carry, and it claims the
 * wrong mechanism.
 *
 * **Measured off the photograph, not off the tokens** (`i3brand-outlined32-m-dark.png`, 390×844,
 * dark): this mascot's modal body is `#F2C46B`, the café pin's is `#C99A55`, rendered ΔE00 **11.7**
 * — the paint matches the token arithmetic exactly, no drift. **26** of the mascot's ~1100 body
 * pixels fall within 18 RGB units of the café token, against **1903** of the pin's; those 26 are
 * crust shading. Near-neighbours, **not the same colour**, and the two objects do not merge.
 *
 * **What actually separates them is the tail and the card ground, not the face.** A *faceless* gold
 * disc in this chip would also not be mistaken for a pin — pins have points, and this sits in a
 * pill beside a wordmark. It would simply be **meaningless**, which is the `mono` argument above
 * and **not** a disambiguation argument. Keeping the two apart is the point of this paragraph: the
 * next reader should not come away thinking the face is a safety measure when it is a legibility
 * one.
 *
 * **The narrow claim the face does earn is about the aperture.** The category pin carries a
 * ground-coloured aperture — a single dark mark, sitting almost exactly where a face would be — so
 * the pin is itself faintly face-like. *Two warm circles each carrying one dark mark* is the
 * genuinely ambiguous pair, and it is the pair that would exist if this mark were faceless. Two
 * eyes and a mouth are what make the mascot unmistakably a **character** rather than a pin drawn
 * differently. That is a claim about shape, which the colour merely sets up, and it survives the
 * night-café proposal closing `MASCOT_GOLD` to ΔE 6.3 of `#FEB843` — the colour gap narrowing does
 * not touch it.
 *
 * For the record, the token distances the ruling was granted against, measured at `9a95444`:
 * `MASCOT_GOLD` sits ΔE00 **11.5** from the light café, **11.7** from the night café, and
 * 29.7–61.0 from every other category colour.
 *
 * **The fence's scope was read before the ruling and it excludes this file deliberately.**
 * `chrome-tokens.test.ts:285` and `:339` scope it to `components/map/`, `ui/place/` and anything
 * containing `basemap` - the pins, the category palette, the tiles. That is **the data layer**,
 * which is exactly what ruling 3 fenced. `src/app/map/` is route composition and sits outside it by
 * design rather than by oversight. Written down in terms, because the next reader finding an
 * unfenced directory should find the reasoning instead of inferring a hole - this project's
 * most-repeated failure, and it costs one sentence. `crumb-mascot.test.ts`'s own rule-5 check names
 * two files and covers neither. **The permission here is the ruling; a guard's silence is not
 * evidence either way.**
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

import { CrumbMascot } from '@/components/brand/crumb-mascot';
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
    // `pl-1.5 pr-4` rather than `px-4`: the asymmetry is the optical inset a round mark wants
    // against a pill's own curve. 6px on a 32px circle in a 44px pill leaves the same visual gap
    // the type's 16px right inset does; a symmetric `px-4` puts the circle visibly too far in.
    <div
      className="animate-in fade-in-0 duration-enter motion-safe:slide-in-from-bottom-1 pointer-events-none absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-11 items-center gap-2 rounded-full border border-border/70 bg-card/85 pl-1.5 pr-4 shadow-sheet backdrop-blur-md lg:left-[calc(clamp(320px,26vw,392px)_+_1rem)] lg:top-4"
    >
      {/*
       * `size-8` is 32px. Measured, the floor is **26px** — the table in the header — so this is a
       * judgement inside a passing range and not a measurement: the mouth is the weakest feature,
       * and 32px gives it 7.26:1 where 26px leaves it at 4.67:1 against a 3:1 bar. It is also
       * `CRUMB_FACE_MIN_PX`, so nothing already written down has to be re-argued to ship it.
       * `outlined` rather than `flat` for this surface specifically: the chip is translucent over a
       * live basemap, so the mark needs an edge of its own, and the keyline reads `--mascot-keyline`
       * so it deepens at night instead of glowing. `flat` is the right pick inside an icon mask,
       * which this is not.
       *
       * `mood="idle"` is a claim, not a default — `#moods` binds it to *"header, app icon,
       * resting"*, and this is the header. `animation` is deliberately absent: the chip already
       * fades in on the entrance's fifth beat, and `#motion` is explicit that a loop in a corner
       * *"stops being an event and becomes wallpaper"*. A bobbing mascot over a map the user is
       * reading is the wallpaper case exactly.
       *
       * No `label`, so it stays `aria-hidden`: the name is spelled out beside it, and a screen
       * reader announcing a mascot and then the word it stands for reads the brand twice.
       */}
      <CrumbMascot mood="idle" construction="outlined" className="size-8 shrink-0" />
      <span
        className="font-display text-base font-black tracking-tight text-foreground"
        style={DISPLAY_WORDMARK_AXES}
      >
        No Crumbs
      </span>
    </div>
  );
}
