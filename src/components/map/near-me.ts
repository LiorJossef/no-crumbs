/**
 * "Near me" as a state machine and a camera request — everything about `L1-F11` that can be decided
 * without a browser.
 *
 * The React glue (`use-near-me.ts`) is deliberately thin and this file holds the decisions, because
 * the decisions are the part that can be wrong: which `GeolocationPositionError` means what, when a
 * fix is too rough to measure from, what the user is told when the answer is no, and where the
 * camera comes to rest. `navigator.geolocation` cannot be exercised in the unit environment; all of
 * the above can.
 *
 * ## The two rules the feature exists to keep
 *
 * 1. **The prompt appears only on a tap.** Nothing here reads a position; `use-near-me.ts` calls
 *    `getCurrentPosition` from an event handler and from nowhere else.
 * 2. **A distance is only ever a fact about the world.** `distanceOrigin` is the single gate every
 *    distance on screen passes through, and it returns `null` for every state that is not a fresh,
 *    accurate-enough fix — including a permission revoked after it was granted. There is no path
 *    from a map centre to a distance label, which is what the map-centre sort used to be.
 */

import type { FocusBoundsRequest } from './types';
import { PIN_BAND_MIN } from './zoom-bands';
import type { GeoPoint } from '@/domain/places/clusters';

/**
 * Where a near-me flight comes to rest: a neighbourhood you could walk across.
 *
 * It must stay at or above `PIN_BAND_MIN`, and that is not a preference — below it the map draws
 * area markers, so "here is where you are" would land the user on a disc summarising the very pins
 * they asked to see. A test asserts the relationship rather than the number, so tuning the bands
 * moves this with them.
 */
export const NEAR_ME_ZOOM = Math.max(14, PIN_BAND_MIN);

/**
 * How rough a fix may be and still support a distance label.
 *
 * A phone indoors routinely reports a Wi-Fi or cell fix accurate to one or two kilometres, and
 * `nearbyDistanceLabel` rounds to 50 m — so a 3 km fix renders `250 m` under a saved place that
 * could be anywhere in the district. The camera still flies on a rough fix (seeing roughly where
 * you are is useful and claims nothing), but the numbers come off. 500 m is the point at which a
 * label rounded to 50 m stops being a description of the world.
 */
export const NEAR_ME_MAX_ACCURACY_M = 500;

/** A fix, as the browser reported it. `accuracyM` is the 68% confidence radius per the spec. */
export interface UserFix {
  readonly point: GeoPoint;
  readonly accuracyM: number;
}

/**
 * What near-me currently knows.
 *
 * A union rather than `position | error | loading` flags because the four failures are four
 * different sentences with different ways out: a denial is settled until the user changes a browser
 * setting, a timeout is worth retrying immediately, and an unsupported browser is neither.
 */
export type NearMeState =
  | { readonly status: 'idle' }
  | { readonly status: 'locating' }
  | { readonly status: 'located'; readonly fix: UserFix }
  /** The permission was refused — on the prompt, or revoked after a fix we had already used. */
  | { readonly status: 'denied' }
  /** No geolocation at all: an old browser, or an insecure context where the API is not exposed. */
  | { readonly status: 'unavailable' }
  /** Asked, allowed, and no position came back — a timeout, or no fix available where they are. */
  | { readonly status: 'failed' };

export type NearMeStatus = NearMeState['status'];

export const NEAR_ME_IDLE: NearMeState = Object.freeze({ status: 'idle' as const });
export const NEAR_ME_DENIED: NearMeState = Object.freeze({ status: 'denied' as const });

/**
 * A `GeolocationPositionError` as one of our states.
 *
 * Typed on the code alone so a test can pass `{ code: 1 }` without constructing a DOM error, and so
 * a browser that omits the class constants (they are only guaranteed on the instance) cannot make
 * this throw. Anything unrecognised degrades to `failed`, the state whose way out is "try again" —
 * never to `denied`, which would tell the user their permission is off when it may not be.
 */
export function nearMeStateForError(error: { readonly code: number }): NearMeState {
  switch (error.code) {
    case 1:
      return NEAR_ME_DENIED;
    case 2:
    case 3:
      return { status: 'failed' };
    default:
      return { status: 'failed' };
  }
}

/**
 * **The one gate every distance on screen passes through.**
 *
 * `null` unless we are holding a fix the user asked for and it is accurate enough to subtract from.
 * Refusing the permission, revoking it later, a timeout and a 3 km indoor fix all return `null`, so
 * the distances disappear rather than being recomputed against something that is not the user.
 */
export function distanceOrigin(state: NearMeState): GeoPoint | null {
  if (state.status !== 'located') return null;
  return state.fix.accuracyM <= NEAR_ME_MAX_ACCURACY_M ? state.fix.point : null;
}

/**
 * The camera request for a fix — camera mover 8, expressed in the port's existing vocabulary.
 *
 * A zero-extent box at the user's point with a single allowed zoom, which is `focusBounds`'
 * `cameraForBounds` → clamp → `easeTo` path saying "centre here, rest at exactly this zoom". No new
 * mover was added to the surface for this: the country tap already needed a resting zoom *floor*,
 * and a floor equal to the ceiling is a fixed landing. The surface's resize path reproduces it for
 * free, because it re-frames by the kind of request rather than by re-fitting a stored box.
 */
export function nearMeCamera(fix: UserFix): FocusBoundsRequest {
  return {
    bounds: {
      north: fix.point.lat,
      south: fix.point.lat,
      east: fix.point.lng,
      west: fix.point.lng,
    },
    minZoom: NEAR_ME_ZOOM,
    maxZoom: NEAR_ME_ZOOM,
  };
}

/**
 * What the control says when near-me cannot do what it looks like it does.
 *
 * Every failure names the alternative that is already on screen — the area list — because that is
 * the exit criterion: a denial is a designed state with a working alternative, not an error. The
 * list, the `Elsewhere` rows and the map are all untouched by any of these states, so the sentence
 * is true rather than consoling.
 *
 * `null` while nothing needs saying, which is idle, locating, and a good fix over places we can
 * measure.
 *
 * `hasPlacesNearby` is the library's answer and is ignored unless we are located: "nothing saved
 * near you" outranks the rough-fix note, because 50 km of emptiness is not a rounding problem and
 * telling someone their fix is imprecise when the real answer is that they have saved nothing here
 * sends them to fix the wrong thing.
 */
export function nearMeNotice(state: NearMeState, hasPlacesNearby: boolean): string | null {
  switch (state.status) {
    case 'idle':
    case 'locating':
      return null;
    case 'denied':
      return 'Location is off for this site. Pick an area from your list instead.';
    case 'unavailable':
      return "This browser can't share your location. Pick an area from your list instead.";
    case 'failed':
      return "Couldn't find your location. Try again, or pick an area from your list.";
    case 'located':
      if (!hasPlacesNearby) return 'Nothing saved near you yet.';
      return distanceOrigin(state) === null
        ? 'Your location is only rough here, so distances are hidden.'
        : null;
  }
}
