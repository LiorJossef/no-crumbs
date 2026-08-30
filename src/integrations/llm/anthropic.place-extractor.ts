/**
 * The hosted-production `PlaceExtractor` (`09` §2, `domain/ports.ts`; L0-F4-T2). Anthropic's
 * Messages API over plain `fetch` — no `@anthropic-ai/sdk` dependency, so the vendor surface this
 * file owns is exactly one HTTP call and one response shape, both private to this file (`07` §10:
 * "the vendor SDK is imported in that file and nowhere else" — here, no SDK at all).
 *
 * Structured output is enforced with tool-use forced to one tool
 * (`integrations/llm/json-schema.ts`'s `EXTRACTION_JSON_SCHEMA`), and the response is re-parsed
 * with `domain/extraction/schema.ts`'s `parseExtractionResultPartial` regardless — schema-shaping
 * the request narrows what the model *can* say; the Zod parse is what we actually trust (`07` §10's
 * Zod-at-every-boundary rule). That parse is per candidate: one malformed candidate no longer
 * discards the other four, and the count it did discard is logged rather than swallowed.
 *
 * No tools with side effects, no function calling beyond the one forced structured-output tool, no
 * network access initiated by the model — the caption can at worst produce a response that fails
 * `ExtractionResultSchema` (charter R10, `09` §6).
 */
import { extractorInvalidOutput, extractorUnavailable } from '@/domain/errors';
import { CANDIDATE_CAP, parseExtractionResultPartial, toPlaceCandidate } from '@/domain/extraction/schema';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { ContentPart } from '@/domain/types';

import { ANTHROPIC_HAIKU_4_5_PRICE_PER_1M, costUsd, logExtractionCost } from './cost';
import { EXTRACTION_JSON_SCHEMA, MAX_OUTPUT_TOKENS } from './json-schema';
import { postProcessCandidates } from './post-process';
import { buildUserPrompt, generateDelimiter, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';
import { applyStopDiagnosis, classifyAnthropicStop } from './stop-reason';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TOOL_NAME = 'record_place_candidates';

/** `09` §2.4: `version` names the model, `promptVersion` names the prompt — both are cache keys
 *  on `extractions` (`08` §3.4). Bump either when the model or the prompt text changes. */
export const ANTHROPIC_EXTRACTOR_VERSION = '2026-08-anthropic-haiku-4-5';

interface AnthropicToolUseBlock {
  readonly [key: string]: unknown;
  readonly type: 'tool_use';
  readonly name: string;
  readonly input: unknown;
}

interface AnthropicMessagesResponse {
  readonly content: readonly Record<string, unknown>[];
  /** Why generation ended. Read, not ignored — `stop-reason.ts` explains what it separates. */
  readonly stop_reason?: unknown;
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

function isToolUseBlock(block: Record<string, unknown>): block is AnthropicToolUseBlock {
  return block['type'] === 'tool_use' && block['name'] === TOOL_NAME;
}

function joinCaption(parts: readonly ContentPart[]): string {
  return parts.map((p) => p.text).join('\n\n');
}

/**
 * `apiKey` and `model` are passed in, not read from `process.env` here — this file has no I/O
 * dependency on how the composition root (L0-F6) sources config, and a test supplies a fake key
 * with a stubbed `fetch` (`ctx`-independent; the vendor SDK boundary is `fetch` itself here).
 */
export function anthropicPlaceExtractor(config: {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}): PlaceExtractor {
  const model = config.model ?? 'claude-haiku-4-5';
  const doFetch = config.fetchImpl ?? fetch;

  return {
    version: ANTHROPIC_EXTRACTOR_VERSION,
    promptVersion: PROMPT_VERSION,

    async extract(parts: readonly ContentPart[], ctx: OpCtx) {
      const caption = joinCaption(parts);
      const delimiter = generateDelimiter();
      const startedAt = Date.now();

      let response: Response;
      try {
        response = await doFetch(ANTHROPIC_ENDPOINT, {
          method: 'POST',
          signal: ctx.signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            // Was 1024, which a real five-candidate Hebrew caption already overruns. The
            // arithmetic is on `MAX_OUTPUT_TOKENS` in `json-schema.ts`, derived from the schema's
            // own 12-candidate cap and the measured size of a candidate object.
            max_tokens: MAX_OUTPUT_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildUserPrompt(caption, delimiter) }],
            tools: [
              {
                name: TOOL_NAME,
                description: 'Record the place candidates found in the caption.',
                input_schema: EXTRACTION_JSON_SCHEMA,
              },
            ],
            tool_choice: { type: 'tool', name: TOOL_NAME },
          }),
        });
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      if (!response.ok) {
        throw extractorUnavailable(`Anthropic returned HTTP ${response.status}`);
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      const parsedResponse = json as AnthropicMessagesResponse;
      const elapsedMs = Date.now() - startedAt;
      const usage = {
        inputTokens: parsedResponse.usage?.input_tokens ?? 0,
        outputTokens: parsedResponse.usage?.output_tokens ?? 0,
      };

      // Logged before anything can throw: a truncated or refused call is still a billed call, and
      // a cost line that only appears on success under-reports what extraction actually costs.
      logExtractionCost(ctx.log, {
        extractorVersion: ANTHROPIC_EXTRACTOR_VERSION,
        promptVersion: PROMPT_VERSION,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: costUsd(usage, ANTHROPIC_HAIKU_4_5_PRICE_PER_1M),
        costModel: 'measured',
        elapsedMs,
      });

      // Before anything is read out of the body: a truncated or refused response must not be
      // salvaged into something that looks like a complete answer (`stop-reason.ts`).
      applyStopDiagnosis(classifyAnthropicStop(parsedResponse.stop_reason), 'Anthropic', ctx, {
        extractorVersion: ANTHROPIC_EXTRACTOR_VERSION,
        outputTokens: usage.outputTokens,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });

      const toolUse = parsedResponse.content?.find(isToolUseBlock);
      if (toolUse === undefined) {
        throw extractorInvalidOutput('Anthropic did not return the forced tool call.');
      }

      const parsed = parseExtractionResultPartial(toolUse.input);
      if (!parsed.ok) {
        throw extractorInvalidOutput(undefined, parsed.error);
      }
      if (parsed.value.dropped > 0) {
        // A fault, not a note: the list handed back is not the list the model sent, and no field
        // of `PlaceExtractor`'s return type can say so. See `parseExtractionResultPartial`.
        ctx.log.event('extraction.candidates_dropped', {
          extractorVersion: ANTHROPIC_EXTRACTOR_VERSION,
          promptVersion: PROMPT_VERSION,
          reason: 'schema_invalid',
          dropped: parsed.value.dropped,
          kept: parsed.value.candidates.length,
          total: parsed.value.total,
        });
      }
      if (parsed.value.truncated > 0) {
        // The other half of the same silence. Not a fault — the model read the caption well and
        // named more places than we carry — but the return type has no more room for this fact
        // than it has for `dropped`, so this line is the only place it exists.
        //
        // Its own event rather than a second `reason` on `candidates_dropped`: anything counting
        // that event is counting replies we could not read, and a caption naming fourteen real
        // venues is not one of those. Two facts, two names.
        ctx.log.event('extraction.candidates_truncated', {
          extractorVersion: ANTHROPIC_EXTRACTOR_VERSION,
          promptVersion: PROMPT_VERSION,
          cap: CANDIDATE_CAP,
          truncated: parsed.value.truncated,
          kept: parsed.value.candidates.length,
          total: parsed.value.total,
        });
      }

      const candidates = postProcessCandidates(parsed.value.candidates.map(toPlaceCandidate), caption, ctx);

      return { candidates, cityHint: parsed.value.cityHint };
    },
  };
}
