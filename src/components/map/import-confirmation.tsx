'use client';

/**
 * The one line of feedback a finished import owes the user.
 *
 * Before this, pressing "Done" on eight extracted London places closed the overlay and left the
 * map exactly where it was, framed on Tel Aviv, with no message and no camera move. The eight rows
 * were written correctly and were, from the user's side, indistinguishable from nothing happening.
 *
 * Deliberately small: a single dismissible strip anchored under the safe area, not a modal and not
 * a toast library. It carries three facts and no actions —
 *
 *  - how many places this import added;
 *  - how many were **already in the library**, said plainly rather than folded into the total
 *    (a re-import used to report every place as a fresh save);
 *  - how many the model named but could not place, because "we found it but could not pin it" is
 *    the honest outcome and silently dropping those candidates is the failure mode this product
 *    cannot afford (`docs/working-agreement.md` §4).
 *
 * It auto-dismisses, because the camera flight it accompanies is the real answer and a permanent
 * banner over a map is clutter. `role="status"` so a screen reader hears it without the focus
 * being stolen mid-flight.
 *
 * ## The one celebration the product has, and this is where it goes
 *
 * A TikTok became a pin. That is the entire proposition, and until 2026-08-31 the thing that
 * announced it was a lucide `Check` in a 24px disc — the same check mark in every product ever
 * made — while `CRUMB_MOODS.found`, `.crumb-anim-land` and the spark pair sat drawn, styled, tested
 * and reachable from nowhere (`docs/archive/product-review-2026-08-31-r2.md` finding 5; `mood="found"`
 * appeared in no file in `src/`).
 *
 * The restraint everywhere else is what earns this. The no-places screen — the *modal* outcome at
 * LEVEL B's hit rate — renders `nothingFound` with no animation at all, the failure copy refuses to
 * apologise, and the review screen refuses to celebrate. One beat, at the one moment that pays for
 * all of them.
 */

import { useEffect } from 'react';
import { Check, X } from 'lucide-react';

import { CrumbMascot } from '@/components/brand/crumb-mascot';
import { Button } from '@/components/ui/button';

const AUTO_DISMISS_MS = 9000;

export interface ImportConfirmationProps {
  readonly saved: number;
  readonly alreadySaved: number;
  readonly skipped: number;
  readonly onDismiss: () => void;
}

/** "3 places added · 5 already saved · 1 couldn't be pinned" — only the true clauses. */
export function importConfirmationText(
  saved: number,
  alreadySaved: number,
  skipped: number,
): string {
  const added = saved - alreadySaved;
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} ${added === 1 ? 'place' : 'places'} added`);
  if (alreadySaved > 0) parts.push(`${alreadySaved} already saved`);
  if (skipped > 0) parts.push(`${skipped} couldn’t be pinned`);
  // Every clause false means a save that added nothing new and skipped nothing — possible only
  // when `saved === alreadySaved === 0`, which the caller never renders. Kept total anyway.
  return parts.length > 0 ? parts.join(' · ') : 'Nothing new to add';
}

/**
 * **Whether this import earned the celebration**, and it is a function rather than a condition
 * inside the JSX because it is a product rule and a reader should be able to find it.
 *
 * **The rule: the character comes out when something new landed on the map, and only then.**
 * `saved` counts every candidate the save touched; `alreadySaved` is how many of those were already
 * in the library. A re-import of the same TikTok has `saved === alreadySaved`, added nothing, moved
 * no pin, and celebrating it would spend the product's one celebration on a no-op — which is
 * exactly how a beat stops meaning anything. The strip still *reports* that number, in words, in
 * the same sentence it always did. Nothing is hidden; only the party is withheld.
 *
 * **What the quiet case gets is the check mark it already had**, and that falls out of the system
 * rather than being a taste call. `CRUMB_MOODS` binds every face to a screen — *"a face may only
 * exist if there is a screen that needs it"* — and there is no mood for *you already had these*.
 * `idle` is bound to "header, app icon, resting" and this is none of them; `nothingFound` is bound
 * to "no places in this one" and the import **did** find places. So the honest options were an
 * ordinary receipt glyph or a ninth mood, and the mood table exists precisely to stop the second
 * one. `skipped` deliberately does not enter into it: a place that was found and added is not made
 * less true by a second one that could not be pinned, and the sentence reports both.
 */
export function importLandedSomething(saved: number, alreadySaved: number): boolean {
  return saved - alreadySaved > 0;
}

export function ImportConfirmation({
  saved,
  alreadySaved,
  skipped,
  onDismiss,
}: ImportConfirmationProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    /* Sits *below* the account chip on a phone rather than beside it: both live in the same top
       band, and at 390px a centred strip and a right-aligned pill overlap — verified on a
       Pixel-sized run, where the banner covered the email chip. At `lg+` the viewport is wide
       enough that a centred, max-28rem strip clears a right-aligned chip, so it moves back up. */
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-40 flex justify-center px-3 lg:top-4"
    >
      <div className="pointer-events-auto flex max-w-[min(28rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-border/70 bg-card/95 py-1.5 pl-3 pr-1.5 shadow-[var(--shadow-elevated)] backdrop-blur-md">
        {importLandedSomething(saved, alreadySaved) ? (
          /*
           * **`mood="found"` is a claim about the screen, not a decoration.** `#moods` binds it to
           * *"Places added to your map"*, which is this strip and nothing else in the product.
           * `animation="land"` is `#motion`'s *"plays once, on confirm, timed to the pins dropping
           * on the map"* — and the pins really are dropping underneath it, because the same event
           * starts `map-page-client`'s 1200 ms fit-and-fly. The spark pair rides with Land and is
           * the one celebration the system has.
           *
           * **Land on a data surface, which is a rule that had to be checked rather than assumed.**
           * `map-mascot-motion.test.ts` holds that a mascot may only move on `/map` in a gesture
           * the pins have never used, because a thing that moves is a thing that changed — that is
           * why the shell chip's stir rotates and may not bob or pulse. Land translates *and*
           * fades, which is both of the map's two gestures at once, and it is admitted anyway on a
           * ground the stir cannot stand on: **the stir is a loop and this is one shot, fired by
           * the exact event the pins are answering.** The ban is on a mascot saying *something
           * changed* sixty times a minute while nothing did. Here something did, once, and the
           * mascot and the pins are two halves of the same sentence. If Land is ever put on a
           * surface where it is not co-timed with a real landing, that argument does not travel.
           *
           * `outlined` for the same reason the shell wordmark takes it: this is a translucent card
           * over a live basemap, so the mark needs an edge of its own, and the keyline reads
           * `--mascot-keyline` so it deepens at night rather than glowing. `flat` belongs inside an
           * icon mask, which this is not.
           *
           * **`size-7` — 28px, and the pill's height is unchanged, which is the point.** The
           * measured floor for a legible face is 26px (`shell-wordmark.tsx` carries the ladder: at
           * 26px the mouth, the weakest feature, is 4.67:1 against a 3:1 bar). 32px would be the
           * safer pick and is what the chip uses — it would also make this strip 4px taller, and
           * the strip's band is what `FLOATING_TOP_CHROME_MOBILE_PX` reserves camera padding for.
           * A visual change that quietly re-sizes a camera reservation is the failure this repo has
           * already photographed once. 28px matches the dismiss button's own box, so the strip has
           * one internal metric, and the ink it draws (28 × 100/116 ≈ 24px, the artboard reserves
           * the rest for the keyline) is the same 24px the check disc occupied. Going to 32px is a
           * camera-affecting change and is announced, not taken here.
           *
           * **No `label`, so it stays `aria-hidden`.** The strip is already a `role="status"` live
           * region and the sentence beside it is the announcement; a named mascot would make a
           * screen reader read the celebration and then the fact.
           *
           * `key` binds the beat to the numbers it is celebrating: the parent swaps this strip's
           * props rather than remounting it, and a CSS one-shot only plays on mount. Two imports
           * with different outcomes therefore get two beats instead of one.
           */
          <CrumbMascot
            key={`${saved}-${alreadySaved}-${skipped}`}
            mood="found"
            construction="outlined"
            animation="land"
            className="size-7 shrink-0"
          />
        ) : (
          /* Nothing new landed. The ordinary receipt glyph, unchanged — see
             `importLandedSomething` for why this is the mood table working rather than a gap. */
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-brand">
            <Check className="size-3.5" aria-hidden />
          </span>
        )}
        <p className="truncate text-xs font-semibold text-foreground">
          {importConfirmationText(saved, alreadySaved, skipped)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
