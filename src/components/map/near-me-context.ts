'use client';

/**
 * How far each saved place is from the user, as a context.
 *
 * A context rather than a prop for the reason `TagFilterContext` and `CollectionsContext` already
 * exist: `PlaceRow` is rendered by three hosts (the mobile sheet, the desktop panel and any future
 * list), and threading one more prop through all of them to reach a leaf would put a near-me
 * concern into files that have nothing else to do with it. Adding the map's own popover later costs
 * nothing.
 *
 * **`null` is the normal state and not a misconfiguration.** No provider, no fix, a refused or
 * revoked permission, or a fix too rough to measure from all arrive here as the same thing — a row
 * with no distance — because `distanceOrigin` is the only writer and it returns `null` for every
 * one of them. A row therefore cannot render a distance unless one was measured from a real
 * position, which is `L1-F11-T2` expressed as the shape of the data rather than as a check
 * somewhere.
 */

import { createContext, use } from 'react';

/** Kilometres from the user to each place near enough to be worth saying, keyed by place id.
 *  A place that is absent is one we do not measure, not one at distance zero. */
export type NearMeDistances = ReadonlyMap<string, number>;

export const NearMeDistancesContext = createContext<NearMeDistances | null>(null);

/** This place's distance from the user in km, or `null` — which is most of the time. */
export function useNearMeDistance(placeId: string): number | null {
  return use(NearMeDistancesContext)?.get(placeId) ?? null;
}
