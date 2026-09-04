'use client';

/**
 * The near-me button, and the sentence it shows when the answer is no (`L1-F11-T1`).
 *
 * It draws itself in the map's own control column because that is where a locate control is looked
 * for, but it owns nothing: the permission, the fix and the camera flight all live with the caller
 * (`map-page-client.tsx`, camera mover 8). This file turns a `NearMeControlModel` into a button and
 * a notice.
 *
 * ## Why it replaced `MapControls`' own locate button
 *
 * `components/ui/map.tsx` ships one (`showLocate`) and it was switched on. Two things made it
 * unusable for this feature and neither is fixable from outside that registry file: a denial is
 * `console.error` and a stopped spinner, which is a silent no-op on screen — precisely what the
 * exit criterion forbids — and it flies the camera itself at a hard-coded zoom, from inside the
 * surface, making it a seventh camera mover that no enumeration knew about. The position also never
 * reaches the page, so `T2` could not be built on it at all.
 *
 * ## The failure states are the feature
 *
 * A refusal is the common case for a control like this, so it gets a designed answer rather than an
 * error: the button stays pressable (the way back, once the browser setting changes, is one tap),
 * and a dismissible line says what happened and points at the alternative that is already on
 * screen — the area list, which every one of these states leaves working.
 */

import { Locate, LocateFixed, LocateOff, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PRESS_CHIP } from '@/lib/interaction';
import type { NearMeStatus } from './near-me';

export interface NearMeControlModel {
  readonly status: NearMeStatus;
  /** The line to show under the button, or `null` for none. Composed by the caller because the
   *  useful version of it ("Nothing saved near you yet") is a fact about the library, which this
   *  component has no business knowing. */
  readonly notice: string | null;
  readonly onRequest: () => void;
  readonly onDismissNotice: () => void;
}

/** Says what the button will do, never what it looks like. `Find my location` while it is the
 *  offer; the failure wording would otherwise leave a screen reader user with a button whose name
 *  is a complaint. */
const BUTTON_LABEL = 'Find my location';

export function NearMeControl({
  status,
  notice,
  onRequest,
  onDismissNotice,
}: NearMeControlModel) {
  const locating = status === 'locating';
  const refused = status === 'denied' || status === 'unavailable';

  return (
    <div className="flex flex-col items-end gap-1.5">
      {notice !== null && (
        <div
          role="status"
          className="flex max-w-[min(17rem,calc(100vw-2rem))] items-start gap-1.5 rounded-lg border border-border/70 bg-card/95 py-1.5 pl-2.5 pr-1.5 shadow-sheet backdrop-blur-md"
        >
          <p className="pt-0.5 text-xs font-medium text-muted-foreground">{notice}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismissNotice}
            className={cn(
              // 44px of target around a 14px glyph: the box is `size-11` and the mark inside it is
              // unchanged, so the notice does not grow a heavy button in its corner. Was `size-6`
              // (24px), which is a dismissal a thumb misses on the one surface that exists to be
              // dismissed.
              'flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none',
              'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              // Matrix row 3. `PRESS_CHIP`'s 5% is the icon-button value: on a 24px target the
              // gentler button scale is not visible at all. `PRESS_BEAT` carries the colour
              // transition too, so the un-prefixed `transition-colors` this replaced is not lost —
              // it moves inside the same declaration and gains a named duration.
              PRESS_CHIP,
            )}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
      {/* The same shell `MapControls` gives its own groups, so the near-me button and the zoom
          buttons read as one column of controls rather than as two unrelated widgets. */}
      <div className="flex flex-col overflow-hidden rounded-md border border-border bg-background shadow-sm">
        <button
          type="button"
          onClick={onRequest}
          aria-label={BUTTON_LABEL}
          // `pressed` and not `disabled` while locating: the button has to stay in the
          // accessibility tree and keep its focus, and a second tap during a ten-second wait is
          // harmless — `getCurrentPosition` simply answers both callers.
          aria-busy={locating}
          aria-pressed={status === 'located'}
          className={cn(
            // **44px, which is the floor and not a preference.** This was `size-10` — 40px —
            // "matching `MapControls`' own buttons", and matching a control that is itself under
            // the bar is how a whole column of them stays under it. W7-6 measured it at 40×40
            // across both gate viewports and both themes, and this control appears on every screen
            // with a map on it, which is most of the product.
            //
            // The visible consequence, stated because it will be noticed: mapcn's own zoom buttons
            // (`components/ui/map.tsx`, a 2,000-line vendored file that is out of scope) are still
            // 40px, so the two control groups in that corner differ by 4px until that file is
            // fixed. A ragged edge for one release is a smaller cost than a target a thumb misses.
            'flex size-11 items-center justify-center outline-none',
            'hover:bg-accent dark:hover:bg-accent/40',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset',
            // Matrix row 3, and the column this control has never had: a press. It is the one
            // affordance on the map that starts a ten-second wait, so the frame in which the tap
            // is acknowledged is the only feedback there is until the notice or the flight arrives.
            PRESS_CHIP,
            status === 'located' && 'text-brand',
          )}
        >
          {locating ? (
            // **`motion-safe:` on a spinner, and the state survives without it.** This was the one
            // unguarded animation left on the map: a continuous rotation, running for up to ten
            // seconds, for a user who has asked the system for less motion.
            //
            // Guarding it is only honest because the rotation is not what carries the meaning. The
            // glyph itself changes and `aria-busy` says so to a screen reader, so under reduced
            // motion the control still visibly and audibly reads as *working*; it simply does not
            // spin. That is §3a's rule that the animations collapse to the state change rather than
            // to nothing, applied to the one case where the state change is a different icon rather
            // than an opacity.
            //
            // **What the paragraph above used to claim, and why it was two-thirds right.** The
            // `motion-safe:` guard and the `aria-busy` are real and were always here. What did not
            // follow was the visual conclusion — that a still `Loader2` reads as the state. With
            // the preference set the class does not apply and the glyph is a three-quarter arc
            // stopped mid-rotation.
            //
            // **Settled by rendering it rather than by citing the precedent, because the precedent
            // is about spinners in general and this is a claim about this control.** All four of
            // its states, at 6x device scale in the real 44px button, under `reduce`:
            //
            // | state | glyph | silhouette |
            // |---|---|---|
            // | idle | `Locate` | 16px hollow ring, four ticks |
            // | busy, before | `Loader2` stopped | **16px hollow ring with a gap, no ticks** |
            // | refused | `LocateOff` | 16px ring, struck through |
            // | located | `LocateFixed` | 16px ring, four ticks, filled centre |
            //
            // Three of the four are 16px rings, and the stopped arc is a fourth 16px ring *with
            // pieces missing*. Against `Locate` — which is itself a circle — it does not read as a
            // different state; it reads as this control's own idle glyph rendered badly. That is
            // the specific confusion, and it is worse than the generic "a frozen spinner looks
            // broken" that `rail-screen.tsx`'s *"no arc frozen mid-rotation"* and `globals.css`'s
            // 28px-empty-circle note describe, because here the thing it is confusable with is one
            // tap away on the same button.
            //
            // The filled dot is the only candidate that shares no construction with any of them:
            // 6x6 measured against their 16x16, solid where all four are outlines. It is closest to
            // `LocateFixed`'s filled centre and still separated by an outer ring, four ticks and
            // 2.7x of diameter. That is what makes it a fourth state rather than a damaged first
            // one — and it is `rail-screen.tsx`'s own pair, not a second opinion about it.
            <>
              <Loader2
                className="hidden size-4 motion-safe:block motion-safe:animate-spin"
                aria-hidden
              />
              <span className="size-1.5 rounded-full bg-current motion-safe:hidden" aria-hidden />
            </>
          ) : refused ? (
            // A struck-through locator, so the state is legible without opening the notice and
            // survives the notice being dismissed. Shape, never colour alone.
            <LocateOff className="size-4" aria-hidden />
          ) : status === 'located' ? (
            <LocateFixed className="size-4" aria-hidden />
          ) : (
            <Locate className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
