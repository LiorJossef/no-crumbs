/**
 * What the rail's `extract` step says once the probe has answered — C13/C14/C15, in one place.
 *
 * The strings are unchanged and predate this module; what is new (W6-3) is that the sentence and
 * the number it contains come from the **same** function, because the number is now rendered
 * separately so it can count up.
 *
 * ## Why the whole sentence is derived from the parts, rather than written twice
 *
 * The rail renders `3` through a counting component and ` places found` as text beside it, while a
 * screen reader is given the whole sentence at once — a ticking digit is noise in the a11y tree.
 * Two renderings of one fact is exactly where a plural drifts: `1 places found` is the classic, and
 * it is invisible to anyone testing with three candidates. So `railExtractFact` is *composed from*
 * `railExtractFactParts` and cannot say a different number or a different noun than the tick does.
 *
 * ## Zero is not a count, and that is a ruling rather than an optimisation
 *
 * `railExtractFactParts(0)` is `null`, so the rail renders the plain sentence and **no counting
 * component mounts at all** (`overnight-copy-deck.md` §9.2, binding). A tick from 0 to 0 is the
 * product animating nothing, and `No places named` staged as a payoff presents a non-event in the
 * register of an event — which is the run's §8a Q3 in one line.
 *
 * What zero does get is the *same hold*: `PAYOFF_HOLD_MS` applies whatever the count, so the modal
 * outcome of an import arrives on the same beat, at the same pace, as a success. Only the true
 * sentence differs. That is what keeps "no places found" a destination rather than a failure, and
 * rushing to it is how the most common outcome starts reading as the failure mode.
 */

/** C15. The settled fact when the caption named nothing we can put on a map. */
const NO_PLACES_NAMED = 'No places named';

/**
 * The number and the words after it, or `null` at zero — where there is no number to count.
 *
 * `count` is what the tick animates to; `rest` is the text beside it. Split here and nowhere else.
 */
export function railExtractFactParts(
  candidateCount: number,
): { readonly count: number; readonly rest: string } | null {
  if (candidateCount <= 0) return null;
  // C14 / C13. The plural is decided once, here, for both renderings.
  return { count: candidateCount, rest: candidateCount === 1 ? 'place found' : 'places found' };
}

/** The whole sentence — for the accessible name, and for the zero case that has no parts. */
export function railExtractFact(candidateCount: number): string {
  const parts = railExtractFactParts(candidateCount);
  return parts === null ? NO_PLACES_NAMED : `${String(parts.count)} ${parts.rest}`;
}
