/**
 * The hosted-production `PlaceExtractor` (`09` §2, `domain/ports.ts`; L0-F4-T2). Anthropic's
 * Messages API over plain `fetch` — no `@anthropic-ai/sdk` dependency, so the vendor surface this
 * file owns is exactly one HTTP call and one response shape, both private to this file (`07` §10:
 * "the vendor SDK is imported in that file and nowhere else" — here, no SDK at all).
 *
 * Structured output is enforced with tool-use forced to one tool
 * (`integrations/llm/json-schema.ts`'s `EXTRACTION_JSON_SCHEMA`), and the response is re-parsed
 * with `domain/extraction/schema.ts`'s `ExtractionResultSchema` regardless — schema-shaping the
 * request narrows what the model *can* say; the Zod parse is what we actually trust (`07` §10's
 * Zod-at-every-boundary rule).
 *
 * No tools with side effects, no function calling beyond the one forced structured-output tool, no
 * network access initiated by the model — the caption can at worst produce a response that fails
 * `ExtractionResultSchema` (charter R10, `09` §6).
 */
import { extractorInvalidOutput, extractorUnavailable } from '@/domain/errors';
import { ExtractionResultSchema, toPlaceCandidate } from '@/domain/extraction/schema';
import { contentPartsText } from '@/domain/import/content-parts';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { ContentPart } from '@/domain/types';

import { ANTHROPIC_HAIKU_4_5_PRICE_PER_1M, costUsd, logExtractionCost } from './cost';
import { EXTRACTION_JSON_SCHEMA } from './json-schema';
import { postProcessCandidates } from './post-process';
import { buildUserPrompt, generateDelimiter, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';

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
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

function isToolUseBlock(block: Record<string, unknown>): block is AnthropicToolUseBlock {
  return block['type'] === 'tool_use' && block['name'] === TOOL_NAME;
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
      // The exact string the model is shown, joined the one way `content-parts.ts` joins it — the
      // plausibility and grounding gates test `evidence`/`groundedIn` against this, so a quote
      // taken from the transcript has to be findable here too (`domain/import/content-parts.ts`).
      const sourceText = contentPartsText(parts);
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
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildUserPrompt(parts, delimiter) }],
            tools: [
              {
                name: TOOL_NAME,
                description: "Record the place candidates found in the post's source text.",
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
      const toolUse = parsedResponse.content?.find(isToolUseBlock);
      if (toolUse === undefined) {
        throw extractorInvalidOutput('Anthropic did not return the forced tool call.');
      }

      const parsed = ExtractionResultSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        throw extractorInvalidOutput(undefined, parsed.error);
      }

      const elapsedMs = Date.now() - startedAt;
      const usage = {
        inputTokens: parsedResponse.usage?.input_tokens ?? 0,
        outputTokens: parsedResponse.usage?.output_tokens ?? 0,
      };
      logExtractionCost(ctx.log, {
        extractorVersion: ANTHROPIC_EXTRACTOR_VERSION,
        promptVersion: PROMPT_VERSION,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: costUsd(usage, ANTHROPIC_HAIKU_4_5_PRICE_PER_1M),
        costModel: 'measured',
        elapsedMs,
      });

      const candidates = postProcessCandidates(parsed.data.candidates.map(toPlaceCandidate), sourceText, ctx);

      return { candidates, cityHint: parsed.data.cityHint };
    },
  };
}
