import { describe, expect, it } from 'vitest';

import {
  NEAR_ME_MAX_ACCURACY_M,
  NEAR_ME_ZOOM,
  distanceOrigin,
  nearMeCamera,
  nearMeNotice,
  nearMeStateForError,
  type NearMeState,
} from '@/components/map/near-me';
import { bandForZoom } from '@/components/map/zoom-bands';

/** A good fix on Dizengoff Square: 20 m, which is what a phone outdoors with GPS reports. */
const GOOD: NearMeState = {
  status: 'located',
  fix: { point: { lat: 32.0787, lng: 34.7743 }, accuracyM: 20 },
};

/** The same place as a Wi-Fi fix taken indoors — a real reading, and far too rough to subtract
 *  50 m-rounded distances from. */
const ROUGH: NearMeState = {
  status: 'located',
  fix: { point: { lat: 32.0787, lng: 34.7743 }, accuracyM: 2400 },
};

describe('nearMeStateForError', () => {
  it('reads a refused permission as a denial', () => {
    expect(nearMeStateForError({ code: 1 }).status).toBe('denied');
  });

  it('reads no-position and a timeout as retryable failures, not as a denial', () => {
    // The distinction is the whole point of the union: "turn the permission back on" is the wrong
    // instruction for someone in a basement whose phone simply could not get a fix.
    expect(nearMeStateForError({ code: 2 }).status).toBe('failed');
    expect(nearMeStateForError({ code: 3 }).status).toBe('failed');
  });

  it('degrades an unknown code to a retry rather than to a denial', () => {
    // Telling a user their permission is off when it may not be sends them to change a setting
    // that was never the problem.
    expect(nearMeStateForError({ code: 99 }).status).toBe('failed');
  });
});

describe('distanceOrigin — the single gate every distance on screen passes through', () => {
  it('gives the user’s point for a fix we can measure from', () => {
    expect(distanceOrigin(GOOD)).toEqual({ lat: 32.0787, lng: 34.7743 });
  });

  it.each([
    ['never asked', { status: 'idle' } as NearMeState],
    ['still asking', { status: 'locating' } as NearMeState],
    ['refused, or revoked after a fix', { status: 'denied' } as NearMeState],
    ['no geolocation in this browser', { status: 'unavailable' } as NearMeState],
    ['asked, allowed, no position', { status: 'failed' } as NearMeState],
  ])('has no origin when %s', (_case, state) => {
    expect(distanceOrigin(state)).toBeNull();
  });

  it('has no origin for a fix too rough to subtract from', () => {
    // `L1-F11-T2`: distance is shown only where it is a fact about the world. A 2.4 km fix under a
    // label rounded to 50 m is not one.
    expect(distanceOrigin(ROUGH)).toBeNull();
    expect(NEAR_ME_MAX_ACCURACY_M).toBeLessThan(2400);
  });

  it('takes a fix exactly at the accuracy limit', () => {
    const edge: NearMeState = {
      status: 'located',
      fix: { point: { lat: 32.0787, lng: 34.7743 }, accuracyM: NEAR_ME_MAX_ACCURACY_M },
    };
    expect(distanceOrigin(edge)).not.toBeNull();
  });
});

describe('nearMeCamera — camera mover 8', () => {
  it('centres on the user and comes to rest at exactly one zoom', () => {
    const request = nearMeCamera({ point: { lat: 32.0787, lng: 34.7743 }, accuracyM: 20 });
    expect(request.bounds).toEqual({
      north: 32.0787,
      south: 32.0787,
      east: 34.7743,
      west: 34.7743,
    });
    // Floor equal to ceiling is what turns `focusBounds`' clamped landing into a fixed one, which
    // is why near-me needed no new mover in the surface.
    expect(request.minZoom).toBe(request.maxZoom);
  });

  it('lands on your own pins, never on the disc that summarises them', () => {
    // Asserted as a relationship rather than as the number 14: `zoom-bands.ts` is the one place the
    // band edges are tuned, and tuning them must move this with them.
    expect(bandForZoom(NEAR_ME_ZOOM)).toBe('pin');
  });
});

describe('nearMeNotice — a denial is a designed state, not an error', () => {
  it('says nothing while the control has not been used, or is working', () => {
    expect(nearMeNotice({ status: 'idle' }, false)).toBeNull();
    expect(nearMeNotice({ status: 'locating' }, false)).toBeNull();
  });

  it('says nothing when it worked and there is something to show', () => {
    expect(nearMeNotice(GOOD, true)).toBeNull();
  });

  it.each([
    ['denied', { status: 'denied' } as NearMeState],
    ['unavailable', { status: 'unavailable' } as NearMeState],
    ['failed', { status: 'failed' } as NearMeState],
  ])('points a %s state at the alternative that is already on screen', (_case, state) => {
    const notice = nearMeNotice(state, false);
    expect(notice).not.toBeNull();
    expect(notice).toContain('list');
  });

  it('offers a retry for a failure and not for a refusal', () => {
    expect(nearMeNotice({ status: 'failed' }, false)).toContain('Try again');
    expect(nearMeNotice({ status: 'denied' }, false)).not.toContain('Try again');
  });

  it('explains the missing distances when the fix is too rough', () => {
    expect(nearMeNotice(ROUGH, true)).toContain('distances are hidden');
  });

  it('says you have saved nothing here in preference to complaining about the fix', () => {
    // 50 km of emptiness is not a rounding problem, and telling someone their location is
    // imprecise would send them to fix the wrong thing.
    expect(nearMeNotice(ROUGH, false)).toBe('Nothing saved near you yet.');
    expect(nearMeNotice(GOOD, false)).toBe('Nothing saved near you yet.');
  });
});
