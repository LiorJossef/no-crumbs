/**
 * The two questions the UI asks a `ResolveResult`, as functions rather than fields.
 *
 * `06` §6 lists `region_loaded: boolean` in the resolver's output type. It is not a field here: it
 * is `regionsSearched.length === 0`, and a boolean stored beside the array it summarises is one
 * more invariant with two writers and no enforcement. One source of truth, one place to test.
 */

import type { RankedPlace, ResolveResult } from '../types';

/**
 * `06` §7.3's `region_loaded`. False means we searched nothing: the city hint mapped to no loaded
 * region, or nothing is loaded. This is the difference between the UI saying *"we don't have
 * Lisbon yet"* and *"not found"* — an honest failure versus a broken one, and the reason `10` §2's
 * `poi_regions` table exists.
 */
export function regionLoaded(result: ResolveResult): boolean {
  return result.regionsSearched.length > 0;
}

/**
 * The best match, or `null` for an empty shortlist. A named accessor because `shortlist[0]` is
 * `RankedPlace | undefined` under `noUncheckedIndexedAccess` and every call site would otherwise
 * re-decide what an empty shortlist means.
 */
export function topMatch(result: ResolveResult): RankedPlace | null {
  return result.shortlist[0] ?? null;
}
