/**
 * What the import rail says about how long this is taking.
 *
 * The rail used to say "This usually takes a few seconds" and then hold that sentence for the whole
 * wait. Extraction is measured at **7–34s** (`docs/evidence/extraction/`), so for most of a typical
 * import the screen was telling the user something that had stopped being true, which reads as the
 * product having hung rather than as it working.
 *
 * The line changes with elapsed time and nothing else. It is deliberately **not** progress: no
 * percentage, no estimate, no step marked done on a timer — the rail's own docblock explains why
 * inventing progress is the one thing this screen must not do. All this says is "still going, and
 * here is why that can be normal", which is a fact about the pipeline rather than a claim about
 * this request.
 *
 * Thresholds come from the measurement: 10s is roughly where "a few seconds" stops being honest,
 * and 25s is inside the measured range but far enough out that a user is entitled to wonder.
 */

const SETTLING_MS = 10_000;
const LONG_MS = 25_000;

export function railWaitLine(elapsedMs: number): string {
  if (elapsedMs < SETTLING_MS) return 'This usually takes a few seconds.';
  if (elapsedMs < LONG_MS) return 'Still reading. A longer caption takes longer.';
  // The ceiling is the measured one, said plainly. A user who has waited this long is deciding
  // whether to cancel, and the useful thing to give them is the number rather than reassurance.
  return 'Still going. A long caption can take up to half a minute.';
}
