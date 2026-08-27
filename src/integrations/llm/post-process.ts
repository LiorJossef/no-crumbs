/**
 * The two domain gates every adapter must run on a model response, in the one order they are
 * allowed to run in, plus the logging that goes with them.
 *
 * Both adapters used to inline `filterPlausible` and its logging, character for character. Schema
 * v2 adds a second gate (`domain/extraction/grounding.ts`), and two copies of a two-step sequence
 * is how one adapter quietly stops applying a rule. The sequence lives here instead; the adapters
 * call one function.
 *
 * Order is not arbitrary. `filterPlausible` decides which candidates exist — it drops hashtags,
 * bare cities and names with no verbatim evidence — and `applyGrounding` then cleans the
 * enrichment fields of the survivors. Running grounding first would spend work on candidates about
 * to be discarded and would inflate every counter with junk.
 *
 * All logging here is scalar counts only, never caption text and never a candidate name (`07`
 * §7.1).
 */
import { applyGrounding } from '@/domain/extraction/grounding';
import { filterPlausible } from '@/domain/extraction/plausibility';
import type { PlaceCandidate } from '@/domain/types';
import type { OpCtx } from '@/domain/ports';

export function postProcessCandidates(
  candidates: readonly PlaceCandidate[],
  caption: string,
  ctx: OpCtx,
): readonly PlaceCandidate[] {
  const { kept, dropped } = filterPlausible(candidates, caption);
  const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
  if (droppedTotal > 0) {
    ctx.log.event('extraction.plausibility_dropped', { ...dropped, total: droppedTotal });
  }

  const grounded = applyGrounding(kept, caption);
  const groundingTotal = Object.values(grounded.counters).reduce((a, b) => a + b, 0);
  if (groundingTotal > 0) {
    // Not an error line. `why_go_verbatim_copy` in particular is a *quality* signal, not a fault:
    // it says the model quoted the caption instead of writing its own sentence, which is the v1
    // behaviour v2 exists to move past. A rising `why_go_ungrounded` is the one to watch — it means
    // the model is citing fragments that are not in the caption.
    ctx.log.event('extraction.grounding', { ...grounded.counters, total: groundingTotal });
  }

  return grounded.candidates;
}
