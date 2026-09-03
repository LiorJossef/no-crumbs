/**
 * The offer's decision layer (feedback 7.3).
 *
 * The feature is almost entirely the cases where nothing is shown, so that is what this file is
 * about. The browser half — `permissions.query`, `localStorage`, the delay — lives in
 * `near-me-offer.tsx` and is driven end to end in a real browser instead.
 */

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
