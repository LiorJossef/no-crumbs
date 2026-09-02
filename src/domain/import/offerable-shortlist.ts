/**
 * Which shortlist rows a person is actually offered (E-T1, feedback round 3 §6.4).
 *
 * The defect this fixes: the band is decided on `top.score` alone (`places/score.ts`), so once the
 * top row clears `confirmScore` (0.80) the **whole** shortlist — up to `defaultMaxResults`, five —
 * was handed to the review screen as a picker. Rows 2..5 had no score floor whatsoever. A weak
 * name plus a city hint returns five unrelated bakeries in the same city, and the screen presents
 * all five as equally likely answers to "which one is it?".
 *
 * The rule here is the one the scorer already owns: `SCORING.branchGuard.rivalScoreBand` (0.12) is
 * the measured line between "a genuine rival for this pin" and "a different row that happens to
 * share a word". It was fitted for exactly this question on the 44-case corpus — the empty
 * corridor between the highest firing pair (0.0966) and the lowest pair that must not fire
 * (0.1760) — so re-using it is deliberate: a second number for the same fact is how two sides of
 * the picker start disagreeing about whether a row exists.
 *
 * **The cut is always a prefix.** `rankPlaces` returns rows in descending score, so
 * `top.score - row.score` is non-decreasing and every kept row is contiguous from index 0. That is
 * load-bearing, not incidental: `ConfirmRequest.optionIndex` is a position in the **stored**
 * shortlist, and a non-prefix cut would renumber the options between what the screen showed and
 * what the confirm route reads back.
 *
 * The top row is always kept, even against itself, so this can never empty a shortlist that has
 * entries — a picker with no options is a dead control.
 */

import { SCORING } from '../places/scoring-constants';
import type { RankedPlace, ResolveResult } from '../types';

/**
 * The rows worth showing, best-first: the top row plus every row within
 * `branchGuard.rivalScoreBand` of it. Empty in, empty out.
 */
export function offerableShortlist(shortlist: readonly RankedPlace[]): readonly RankedPlace[] {
  const top = shortlist[0];
  if (top === undefined) return [];
  const cut = shortlist.findIndex((row) => top.score - row.score > SCORING.branchGuard.rivalScoreBand);
  return cut === -1 ? shortlist : shortlist.slice(0, cut);
}

/** The same cut, taken off a whole `ResolveResult`. */
export function offerableOf(result: ResolveResult): readonly RankedPlace[] {
  return offerableShortlist(result.shortlist);
}
