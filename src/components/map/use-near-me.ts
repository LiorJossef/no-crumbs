'use client';

/**
 * The browser half of near-me (`L1-F11`): the only place in the codebase that touches
 * `navigator.geolocation`, kept as thin as it can be because none of it can be unit-tested in the
 * node environment. Every decision it makes is imported from `./near-me.ts`, which can.
 *
 * ## The permission is requested on a tap and nowhere else
 *
 * There is no effect here that reads a position, no `watchPosition`, and no "warm it up on mount".
 * `request` is called from a click handler; that is the entire trigger surface. A map that asks for
 * your location the moment it loads is the behaviour the exit criterion names, and the way to not
 * have it is to have no code path that could.
 *
 * ## Nothing leaves the browser
 *
 * The fix lives in this component's state and in the camera request it produces. It is not written
 * to the database, not sent to a server action, not put in a URL and not persisted — so closing the
 * tab is a complete deletion, and the out-of-scope list in `L1-F11` holds by construction rather
 * than by discipline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NEAR_ME_DENIED,
  NEAR_ME_IDLE,
  nearMeStateForError,
  type NearMeState,
  type UserFix,
} from './near-me';

/**
 * `timeout` is the load-bearing one: the spec's default is `Infinity`, so a prompt the user walks
 * away from leaves the control spinning for the rest of the session with no way back. Ten seconds
 * is long enough for a cold GPS fix on a phone and short enough that "it is stuck" is never the
 * answer on screen.
 *
 * `maximumAge` accepts a fix the browser took in the last minute, which is what makes a second tap
 * instant; anything older is re-acquired, because near-me is a question about now.
 */
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
};

export interface NearMe {
  readonly state: NearMeState;
  /** Whether the user has dismissed the current notice. Reset by every fresh request, so a denial
   *  dismissed once still explains itself the next time the button is pressed. */
  readonly noticeDismissed: boolean;
  readonly request: () => void;
  readonly dismissNotice: () => void;
}

/**
 * @param onLocated called once per successful fix, from inside the geolocation callback.
 *
 * A callback rather than an effect on the state, deliberately. The camera flight belongs to the
 * page (mover 8) and depends on the library, so an effect keyed on the state would re-fly every
 * time the library changed underneath a held fix. Calling it on the causal edge — tap, fix, fly —
 * makes "one tap, one flight" a property of the code rather than of a dependency array.
 */
export function useNearMe(onLocated: (fix: UserFix) => void): NearMe {
  const [state, setState] = useState<NearMeState>(NEAR_ME_IDLE);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  /** True once the user has pressed the control. Gates the revocation watcher below so that a page
   *  nobody has asked anything of subscribes to nothing. */
  const [asked, setAsked] = useState(false);

  const onLocatedRef = useRef(onLocated);
  useEffect(() => {
    onLocatedRef.current = onLocated;
  }, [onLocated]);

  const request = useCallback(() => {
    setNoticeDismissed(false);
    setAsked(true);
    // An old browser, or any insecure context — the API is simply not exposed off `https`/
    // `localhost`, so this is a real state on a real deployment rather than a theoretical one.
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ status: 'unavailable' });
      return;
    }
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const fix: UserFix = {
          point: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracyM: position.coords.accuracy,
        };
        setState({ status: 'located', fix });
        onLocatedRef.current(fix);
      },
      (error) => setState(nearMeStateForError(error)),
      GEOLOCATION_OPTIONS,
    );
  }, []);

  /**
   * Permission revoked while we were holding a fix.
   *
   * Without this, a user who grants the permission, sees distances, then turns it off in the site
   * settings goes on seeing distances measured from wherever they last were — the exact "wrong
   * distances" `T2` forbids, arriving through the one door that is not a refusal. `permissions`
   * neither prompts nor reads a position, and this only subscribes after the first tap, so it
   * cannot become the thing that asks on load.
   *
   * Best-effort by design: Firefox and older Safari reject or omit the `geolocation` descriptor
   * entirely, and there is no other way to observe a revocation. Where it is missing the next tap
   * is what discovers the change, which is the failure direction that costs the user nothing.
   */
  useEffect(() => {
    if (!asked) return;
    if (typeof navigator === 'undefined' || navigator.permissions === undefined) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status?.state === 'denied') setState(NEAR_ME_DENIED);
    };
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener('change', onChange);
      })
      .catch(() => {
        // Descriptor unsupported. See the docblock: the next tap discovers it instead.
      });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [asked]);

  const dismissNotice = useCallback(() => setNoticeDismissed(true), []);

  return { state, noticeDismissed, request, dismissNotice };
}
