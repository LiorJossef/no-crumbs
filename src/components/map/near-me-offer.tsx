'use client';

/**
 * The offer to turn on location, shortly after arriving on the map (feedback 7.3).
 *
 * The feedback was that the permission is only ever discovered by finding `Find my location`. The
 * obvious reading — fire the browser prompt after login — is the wrong build twice over: it is the
 * exact behaviour `use-near-me.ts` exists to make impossible, and an unexplained native prompt gets
 * denied, which is permanent. A browser gives one prompt per origin and there is no way to ask
 * again.
 *
 * So the product asks first, in its own words, and **the browser is asked only if the user says
 * yes**. Pressing `Use my location` calls the same `request` the locate button calls, from a click
 * handler, one component away. This adds a second control on the existing path and no new path:
 * there is still no effect anywhere that reads a position, no `watchPosition`, and no warm-up.
 *
 * ## Why it is anchored to the top band and not to the control it is teaching
 *
 * It used to render inside the map's control column, directly above the locate button, so that
 * accepting and discovering the button for next time were one glance. That anchor put a 272×104
 * card in the bottom-right corner — and the camera reserves exactly 48 px there, the width of one
 * zoom button (`fitBoundsPadding`'s `markerAllowance` comment). So the fit is free to park a
 * country summary pill under it, and it did: at 1280×900 the card covered the whole width of the
 * `Israel 35` pill and the top 16 px of its height, and at 390×844 the top 8 px. Those pills are
 * tappable camera controls, so the card was eating taps aimed at one.
 *
 * The top band is the one strip of map the camera is *told* about — `FLOATING_TOP_CHROME_PX` /
 * `_MOBILE_PX`, 56 and 100 px — and `ImportConfirmation` already lives there. So this takes that
 * component's anchor verbatim rather than inventing a placement, and `map-page-client.tsx` renders
 * the two through one `floatingSlot` expression, which is what stops them stacking.
 *
 * What is lost is the pointing: the card no longer sits above the button it teaches. It still names
 * the action on its own primary control, which is the part that has to work.
 *
 * ## It is an offer, not a nag
 *
 * One appearance, ever. `localStorage` remembers the answer — accept and dismiss write the same
 * token, because an offer that comes back after it worked is still a nag — and every read and write
 * is wrapped: `localStorage` throws outright in a partitioned third-party context and in Safari's
 * private mode, and a map that fails to load because a preference could not be read would be a far
 * worse bug than the one this fixes. A throw degrades to "show it once, forget the answer at the
 * end of the session", which is the failure direction that costs the user nothing.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRESS_CHIP } from '@/lib/interaction';
import {
  NEAR_ME_OFFER_ACCEPT,
  NEAR_ME_OFFER_DELAY_MS,
  NEAR_ME_OFFER_KEY,
  NEAR_ME_OFFER_LINE,
  NEAR_ME_OFFER_SETTLED,
  nearMeOfferSettled,
  shouldOfferNearMe,
  type GeolocationPermission,
  type NearMeStatus,
} from './near-me';

export interface NearMeOfferProps {
  /** Near-me's own state. Anything but `idle` means the user found the control first. */
  readonly status: NearMeStatus;
  /** `useNearMe`'s `request`, unchanged and uncopied. This is the whole point of the component. */
  readonly onAccept: () => void;
}

/** Reads the stored answer. Never throws: a browser that refuses storage is treated as a browser
 *  that has not been asked, which shows the offer once rather than never. */
function readSettled(): boolean {
  try {
    return nearMeOfferSettled(window.localStorage.getItem(NEAR_ME_OFFER_KEY));
  } catch {
    return false;
  }
}

/** Records the answer. A failure here costs the user one extra offer on their next visit and
 *  nothing else, so it is swallowed rather than surfaced. */
function writeSettled(): void {
  try {
    window.localStorage.setItem(NEAR_ME_OFFER_KEY, NEAR_ME_OFFER_SETTLED);
  } catch {
    // Storage disabled, full, or partitioned. The in-memory `settled` below still ends the offer
    // for this session, which is the part the user can perceive.
  }
}

export function NearMeOffer({ status, onAccept }: NearMeOfferProps) {
  /** Starts settled so nothing can flash before the stored answer has been read. */
  const [settled, setSettled] = useState(true);
  /**
   * `null` until the permission has been read — a third value distinct from `'unknown'`, which is a
   * real reading meaning *this browser will not say*. Rendering is gated on it, so the offer cannot
   * appear in front of a permission that turns out to be granted.
   */
  const [permission, setPermission] = useState<GeolocationPermission | null>(null);

  /**
   * One effect, one timer, and every browser read inside it.
   *
   * The delay and the two readings are deliberately the same beat rather than three: nothing is
   * decided until the offer is due, so a permission granted during those 2.6 s — by the user
   * finding the locate button first, which is the behaviour this card exists to teach — is read
   * after the fact rather than before it. It is armed once on mount and never re-armed; there is no
   * path here that shows the card a second time.
   *
   * `permissions.query` by specification neither prompts nor reads a position. It is feature
   * detected in three steps because all three absences are real: no `navigator` (this file is
   * typechecked against a server build), no geolocation at all (an insecure context, where the
   * offer would be offering nothing and the card never appears), and no `permissions` object or no
   * `geolocation` descriptor (Firefox, older Safari) — which is `unknown`, and showing the offer
   * once under uncertainty is right, because the cost of being wrong is one dismissible card.
   */
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSettled(readSettled());
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
      if (navigator.permissions === undefined) {
        setPermission('unknown');
        return;
      }
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          if (!cancelled) setPermission(result.state as GeolocationPermission);
        })
        .catch(() => {
          if (!cancelled) setPermission('unknown');
        });
    }, NEAR_ME_OFFER_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const end = () => {
    setSettled(true);
    writeSettled();
  };

  if (permission === null) return null;
  if (!shouldOfferNearMe({ permission, settled, status })) return null;

  return (
    <div
      // `role="status"` and not a dialog: it takes no focus when it appears, traps none, and the
      // map behind it stays entirely usable. Same card as the control's own notice, so the two
      // things that can appear in this slot read as one voice.
      role="status"
      // The top band, anchored exactly where `ImportConfirmation` anchors — same slot, same offset,
      // and the two are mutually exclusive at the call site so they can never stack. `top-4` is
      // deliberately *not* restored at `lg`: at 1024 a centred strip on that line lands on the
      // shell wordmark, and one line at both breakpoints is one thing to keep clear.
      className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-40 flex justify-center px-3"
    >
      <div
        className={cn(
          'pointer-events-auto flex max-w-[min(17rem,calc(100vw-2rem))] items-start gap-1.5',
          'rounded-lg border border-border/70 bg-card/95 py-2 pl-2.5 pr-1.5 shadow-sheet backdrop-blur-md',
          // The house entrance pair: the fade always runs, the 4 px drop only when motion is
          // welcome — from the top now, because that is the edge it arrives from.
          'animate-in fade-in-0 duration-enter motion-safe:slide-in-from-top-1',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <p className="text-xs font-medium text-muted-foreground">{NEAR_ME_OFFER_LINE}</p>
          <Button
            type="button"
            size="lg"
            onClick={() => {
              // Ends the offer first, then asks. The native prompt is modal on a phone and the card
              // behind it must already be gone when it closes, whatever the answer was.
              end();
              onAccept();
            }}
            // 44 px, the same floor the locate button was raised to. This is the primary action on
            // a card that exists to be tapped once.
            className="h-11 w-full"
          >
            {NEAR_ME_OFFER_ACCEPT}
          </Button>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={end}
          className={cn(
            // The notice's own dismiss, unchanged: 44 px of target around a 14 px glyph.
            'flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none',
            'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            PRESS_CHIP,
          )}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
