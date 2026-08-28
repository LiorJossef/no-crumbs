/**
 * Why the model stopped, read from the field each vendor already sends and both adapters used to
 * ignore.
 *
 * ## The failure this ends
 *
 * Until now a truncated response, a safety refusal and genuinely malformed output were **one
 * error**: `EXTRACTOR_INVALID_OUTPUT`, same message, same log line. They have nothing in common
 * operationally — the first is our output budget (fix a constant), the second is the provider
 * declining this caption (no retry will help), the third is a model or schema problem (worth
 * looking at). `docs/current-state.md` §3.5 records this exact collapse costing real diagnosis
 * time on the import path, and both vendors were sending the answer in the response body the whole
 * time: Anthropic in `stop_reason`, Gemini in `candidates[0].finishReason` and
 * `promptFeedback.blockReason`.
 *
 * ## What this file is, and is not
 *
 * It is **not a second error taxonomy.** `domain/errors.ts` is a closed set of 13 codes and
 * changing it is a decision for `07` §9, not for an adapter. Nothing here invents a code: every
 * fatal stop still becomes `EXTRACTOR_INVALID_OUTPUT`, because in every one of them the extractor
 * produced no usable structured output. What this file adds is (a) a distinct, honest *message* on
 * the thrown error, which reaches the server log and never the client (`DomainError.toView` drops
 * `message`), and (b) a distinct `extraction.stopped` log event carrying the vendor's own token, so
 * the three causes are separable in the logs where the diagnosis actually happens.
 *
 * The honest gap, recorded rather than papered over: there is no code for "the provider refused",
 * so a refusal and a malformed reply still share `EXTRACTOR_INVALID_OUTPUT` and therefore share the
 * user-facing copy. Adding `EXTRACTOR_REFUSED` would be the right fix and is a `07` §9 change.
 *
 * ## Truncation is fatal on purpose
 *
 * A truncated response is checked **before** any per-candidate salvage
 * (`domain/extraction/schema.ts`'s `parseExtractionResultPartial`). Salvaging four candidates out
 * of a reply that was cut off mid-fifth would hand the pipeline a list that looks complete and is
 * not — the working agreement's "never convert uncertainty into certainty", in the one place where
 * the missing information is invisible by construction. So a truncation fails the whole extraction
 * and says why.
 */

import { extractorInvalidOutput } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';

/**
 * Four outcomes, because they are four different things to do about it.
 *
 *  - `complete` — the model finished on its own terms. The only non-fatal-and-uninteresting case.
 *  - `truncated` — the model hit the output-token ceiling. Ours to fix (`json-schema.ts`'s
 *    `MAX_OUTPUT_TOKENS`); the response is incomplete and must not be used.
 *  - `refused` — the provider's safety, recitation or blocklist machinery stopped it, on the
 *    prompt or on the output. Not retryable in any useful sense, and not our bug.
 *  - `unknown` — a stop token this file has never seen. **Not fatal**: if the body still parses,
 *    a vendor adding a new enum value must not break extraction. It is logged so it surfaces.
 */
export type ExtractionStopCause = 'complete' | 'truncated' | 'refused' | 'unknown';

export interface StopDiagnosis {
  readonly cause: ExtractionStopCause;
  /** The vendor's own token, clamped to a safe shape for a log field. `'absent'` when the vendor
   *  sent no stop field at all, which several of our recorded fixtures do. */
  readonly reason: string;
}

/**
 * A vendor enum value is data from a network response, and this project's rule is that fetched
 * content is never trusted. Clamped to a short `[A-Za-z0-9_]` token so nothing arbitrary can reach
 * a log line or an error message: an unrecognised or hostile value logs as `unparseable` and
 * classifies as `unknown`, which is exactly what it is.
 */
function safeToken(value: unknown): string {
  if (value === null || value === undefined) return 'absent';
  if (typeof value !== 'string') return 'unparseable';
  const trimmed = value.trim().slice(0, 40);
  return /^[A-Za-z0-9_]+$/.test(trimmed) ? trimmed : 'unparseable';
}

/**
 * Anthropic Messages API `stop_reason`. With `tool_choice` forcing one tool, the healthy value is
 * `tool_use`; `end_turn`/`stop_sequence`/`pause_turn` are the other non-failures.
 */
export function classifyAnthropicStop(stopReason: unknown): StopDiagnosis {
  const reason = safeToken(stopReason);
  switch (reason) {
    case 'max_tokens':
      return { cause: 'truncated', reason };
    case 'refusal':
      return { cause: 'refused', reason };
    // `'absent'` is in this group deliberately: a response with no `stop_reason` at all is not
    // evidence of a problem — it is what several of our own recorded fixtures look like — so it is
    // treated as complete and the body is still Zod-parsed, which is what we actually trust.
    case 'tool_use':
    case 'end_turn':
    case 'stop_sequence':
    case 'pause_turn':
    case 'absent':
      return { cause: 'complete', reason };
    default:
      return { cause: 'unknown', reason };
  }
}

/**
 * Gemini `generateContent`. Two fields, and the order matters: `promptFeedback.blockReason` means
 * the **input** was blocked, in which case there is no candidate and therefore no `finishReason`
 * to read. That case used to surface as "response contained no text part", which reads like a
 * malformed reply and is not one.
 */
export function classifyGeminiStop(finishReason: unknown, blockReason?: unknown): StopDiagnosis {
  const blocked = safeToken(blockReason);
  if (blocked !== 'absent') return { cause: 'refused', reason: `prompt_${blocked}` };

  const reason = safeToken(finishReason);
  switch (reason) {
    case 'MAX_TOKENS':
      return { cause: 'truncated', reason };
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
    case 'IMAGE_SAFETY':
    case 'LANGUAGE':
      return { cause: 'refused', reason };
    case 'STOP':
    case 'absent':
      return { cause: 'complete', reason };
    default:
      return { cause: 'unknown', reason };
  }
}

/**
 * Log any stop worth knowing about, then throw for the two that are fatal.
 *
 * `outputTokens`/`maxOutputTokens` are logged on a truncation because they are the two numbers that
 * turn "it failed" into "raise the ceiling", and having to go and find them is the cost §3.5
 * describes. Scalars only — no caption, no candidate name (`07` §7.1).
 */
export function applyStopDiagnosis(
  diagnosis: StopDiagnosis,
  provider: string,
  ctx: OpCtx,
  fields: { readonly extractorVersion: string; readonly outputTokens: number; readonly maxOutputTokens: number },
): void {
  if (diagnosis.cause === 'complete') return;

  ctx.log.event('extraction.stopped', {
    extractorVersion: fields.extractorVersion,
    cause: diagnosis.cause,
    reason: diagnosis.reason,
    outputTokens: fields.outputTokens,
    maxOutputTokens: fields.maxOutputTokens,
  });

  if (diagnosis.cause === 'truncated') {
    throw extractorInvalidOutput(
      `${provider} stopped at the output-token ceiling (${diagnosis.reason}): the structured output is truncated at ` +
        `${fields.outputTokens} of ${fields.maxOutputTokens} tokens, so any candidates in it are an incomplete list.`,
    );
  }
  if (diagnosis.cause === 'refused') {
    throw extractorInvalidOutput(
      `${provider} declined to answer this caption (${diagnosis.reason}): no structured output was produced. ` +
        'This is the provider refusing, not malformed output, and a retry of the same caption will refuse again.',
    );
  }
  // `unknown` is logged and allowed through; the Zod parse is still the gate.
}
