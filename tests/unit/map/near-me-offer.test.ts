/**
 * The offer's decision layer (feedback 7.3).
 *
 * The feature is almost entirely the cases where nothing is shown, so that is what this file is
 * about. The browser half — `permissions.query`, `localStorage`, the delay — lives in
 * `near-me-offer.tsx` and is driven end to end in a real browser instead.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  NEAR_ME_OFFER_ACCEPT,
  NEAR_ME_OFFER_DELAY_MS,
  NEAR_ME_OFFER_LINE,
  NEAR_ME_OFFER_SETTLED,
  nearMeOfferSettled,
  shouldOfferNearMe,
  type GeolocationPermission,
  type NearMeStatus,
} from '@/components/map/near-me';
import { ENTRANCE_BEATS } from '@/components/map/entrance';

describe('nearMeOfferSettled', () => {
  it('reads our own token as answered', () => {
    expect(nearMeOfferSettled(NEAR_ME_OFFER_SETTLED)).toBe(true);
  });

  it.each([null, '', 'true', '1', 'dismissed'])(
    'treats %o as not answered rather than guessing',
    (stored) => {
      // A value we did not write could come from anywhere. Showing the offer one extra time is a
      // smaller failure than an unrecognised string silencing it forever.
      expect(nearMeOfferSettled(stored)).toBe(false);
    },
  );
});

describe('shouldOfferNearMe — the feature is when it says no', () => {
  const fresh = { permission: 'prompt' as GeolocationPermission, settled: false, status: 'idle' as NearMeStatus };

  it('offers on a first arrival with the prompt still available', () => {
    expect(shouldOfferNearMe(fresh)).toBe(true);
  });

  it('offers when the browser will not say what the permission is', () => {
    // Firefox and older Safari reject the descriptor. The prompt is still there; showing the card
    // once is the right answer under uncertainty.
    expect(shouldOfferNearMe({ ...fresh, permission: 'unknown' })).toBe(true);
  });

  it('never offers once the permission is granted', () => {
    // There is nothing to ask for, and the locate button already reads as located.
    expect(shouldOfferNearMe({ ...fresh, permission: 'granted' })).toBe(false);
  });

  it('never offers once the permission is denied, and renders nothing at all', () => {
    // A browser gives one prompt per origin and it has been spent, so accepting could not work.
    // A card explaining that would be a dead end; the locate control says it on a tap instead.
    expect(shouldOfferNearMe({ ...fresh, permission: 'denied' })).toBe(false);
  });

  it.each<GeolocationPermission>(['prompt', 'unknown'])(
    'never offers again after it has been answered, on %s',
    (permission) => {
      // Accept and dismiss write the same token: an offer that reappears after it worked is still
      // a nag.
      expect(shouldOfferNearMe({ ...fresh, permission, settled: true })).toBe(false);
    },
  );

  it.each<NearMeStatus>(['locating', 'located', 'denied', 'unavailable', 'failed'])(
    'never offers when near-me is already %s',
    (status) => {
      // The user found the control on their own. Teaching it now would be describing something
      // that just happened.
      expect(shouldOfferNearMe({ ...fresh, status })).toBe(false);
    },
  );
});

describe('the offer’s copy and timing', () => {
  it('arrives after the entrance has finished, not inside it', () => {
    expect(NEAR_ME_OFFER_DELAY_MS).toBeGreaterThan(ENTRANCE_BEATS.wordmark);
  });

  it.each([NEAR_ME_OFFER_LINE, NEAR_ME_OFFER_ACCEPT])('keeps %o inside the voice rules', (line) => {
    // `voice-and-vocabulary.md` §5: sentence case, no exclamation, one clause. §2: the product name
    // may appear on six surfaces and a map control is not one of them.
    expect(line).not.toMatch(/[!]/);
    expect(line).not.toMatch(/crumb/i);
    expect(line).not.toMatch(/[;]/);
    expect(line[0]).toBe(line[0]?.toUpperCase());
  });

  it('says what the user gets in the product’s own second person', () => {
    // §3: `near you`, never `nearby` or `proximity`. `place` is the product's noun.
    expect(NEAR_ME_OFFER_LINE).toContain('near you');
    expect(NEAR_ME_OFFER_LINE).toContain('places');
    expect(NEAR_ME_OFFER_LINE).not.toMatch(/nearby|proximity|spot|venue/i);
  });
});

/**
 * Where the card sits, checked in the source because there is no DOM here (`vitest.config.ts` runs
 * `node`) and because the thing that broke is a class string, not a decision.
 *
 * The first anchor put the card in the map's bottom-right control column, where the camera reserves
 * 48 px — one zoom button — and the fit duly parked a tappable country summary pill underneath it:
 * at 1280×900 the card covered the whole width of `Israel 36` and the top 16 px of its height, at
 * 390×844 the top 8 px. The top band is the strip the camera *is* told about
 * (`FLOATING_TOP_CHROME_PX` / `_MOBILE_PX`), and `ImportConfirmation` already holds it.
 */
describe('where the offer anchors', () => {
  const OFFER = readFileSync('src/components/map/near-me-offer.tsx', 'utf8');
  const CONFIRMATION = readFileSync('src/components/map/import-confirmation.tsx', 'utf8');
  const PAGE = readFileSync('src/app/map/map-page-client.tsx', 'utf8');

  const TOP_BAND = 'top-[calc(env(safe-area-inset-top)+4rem)]';

  it('takes the confirmation’s line rather than inventing a placement', () => {
    expect(CONFIRMATION).toContain(TOP_BAND);
    expect(OFFER).toContain(TOP_BAND);
  });

  it('does not restore `lg:top-4`, which at 1024 lands on the shell wordmark', () => {
    // The confirmation moves up at `lg`; this card deliberately does not. One line at both
    // breakpoints is one line to keep clear.
    expect(OFFER).not.toContain('lg:top-4');
  });

  it('lets every pixel that is not the card through to the map', () => {
    // A country pill under a transparent gap is still a tappable camera control.
    expect(OFFER).toContain('pointer-events-none absolute inset-x-0');
    expect(OFFER).toContain('pointer-events-auto');
  });

  it('arrives from the edge it is anchored to', () => {
    expect(OFFER).toContain('motion-safe:slide-in-from-top-1');
    expect(OFFER).not.toContain('slide-in-from-bottom');
  });

  it('is no longer in the map’s control column', () => {
    const controlSlot = PAGE.slice(PAGE.indexOf('controlSlot={'), PAGE.indexOf('floatingSlot={'));
    expect(controlSlot).not.toContain('NearMeOffer');
  });

  it('shares the band with the confirmation as one expression, so the two cannot stack', () => {
    // Both anchor to the same line. Rendered as siblings they would sit on top of each other, so
    // the call site makes them the two arms of one ternary — the confirmation wins while it is up,
    // and it auto-dismisses.
    const floatingSlot = PAGE.slice(PAGE.indexOf('floatingSlot={'));
    const slot = floatingSlot.slice(0, floatingSlot.indexOf('onAdd='));
    expect(slot).toContain('<ImportConfirmation');
    expect(slot).toContain('<NearMeOffer');
    expect(slot.indexOf('<ImportConfirmation')).toBeLessThan(slot.indexOf('<NearMeOffer'));
    expect(PAGE.match(/<NearMeOffer/g)).toHaveLength(1);
  });
});
