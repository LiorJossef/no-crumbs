/**
 * The hosted-Gemma `PlaceExtractor` (`09` §2, `domain/ports.ts`) — Google's Gemini API
 * `generateContent` endpoint over plain `fetch`, no `@google/genai` SDK dependency, mirroring
 * `anthropic.place-extractor.ts`'s "vendor surface is one HTTP call and one response shape, both
 * private to this file" shape (`07` §10). This is the dev-facing hosted adapter, config-selected
 * alongside `anthropic.place-extractor.ts`: no local daemon, no dev-machine dependency.
 *
 * Structured output is enforced via `generationConfig.responseSchema`
 * (`integrations/llm/json-schema.ts`'s `EXTRACTION_JSON_SCHEMA`), and the response is re-parsed
 * with `domain/extraction/schema.ts`'s `ExtractionResultSchema` regardless — schema-shaping the
 * request narrows what the model *can* say; the Zod parse is what we actually trust (`07` §10's
 * Zod-at-every-boundary rule).
 *
 * No tools, no function calling, no network access initiated by the model — the caption can at
 * worst produce a response that fails `ExtractionResultSchema` (charter R10, `09` §6).
 */
import { extractorInvalidOutput, extractorUnavailable } from '@/domain/errors';
import { filterPlausible } from '@/domain/extraction/plausibility';
import { ExtractionResultSchema, toPlaceCandidate } from '@/domain/extraction/schema';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { ContentPart } from '@/domain/types';

import { costUsd, logExtractionCost } from './cost';
import { EXTRACTION_JSON_SCHEMA } from './json-schema';
import { buildUserPrompt, generateDelimiter, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * `EXTRACTION_JSON_SCHEMA` is standard JSON Schema, shared with the Anthropic adapter
 * (`json-schema.ts`'s doc comment). Gemini's `generationConfig.responseSchema` only accepts a
 * restricted OpenAPI 3.0 subset: no `additionalProperties`, and `type` is a single enum value, not
 * an array — `type: ['string', 'null']` must become `type: 'string', nullable: true`. This is a
 * pure structural conversion applied at call time so the shared schema stays untouched for the
 * adapters that already work against it.
 *
 * Also caps `candidates`'s `maxItems`: live-tested against `gemma-4-26b-a4b-it`, a
 * `responseSchema` with this item shape (7 properties) starts returning HTTP 400
 * ("Request contains an invalid argument") once `maxItems` reaches 8 — a schema-complexity
 * ceiling on this hosted model, not anything wrong with the shape itself (7 items with the same
 * schema, or 12 items with fewer properties, both succeed). `GEMINI_MAX_CANDIDATES` below caps at
 * 7, the top of the "3–7 places in one post" range this product already designs for (`01`), so the
 * cap costs nothing in practice while keeping the request inside what this model accepts.
 */
const GEMINI_MAX_CANDIDATES = 7;

function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(toGeminiSchema);
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  const record = node as Record<string, unknown>;
  const { type, enum: enumValues, maxItems, ...rest } = record;
  delete rest.additionalProperties;
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    converted[key] = toGeminiSchema(value);
  }
  if (Array.isArray(type)) {
    const nonNullTypes = type.filter((t) => t !== 'null');
    if (nonNullTypes.length !== 1) {
      throw new Error(`toGeminiSchema: expected exactly one non-null type, got ${JSON.stringify(type)}`);
    }
    converted.type = nonNullTypes[0];
    if (type.includes('null')) {
      converted.nullable = true;
    }
  } else if (type !== undefined) {
    converted.type = type;
  }
  if (Array.isArray(enumValues)) {
    converted.enum = enumValues.filter((v) => v !== null);
  }
  if (typeof maxItems === 'number') {
    converted.maxItems = Math.min(maxItems, GEMINI_MAX_CANDIDATES);
  }
  return converted;
}

/** Google has not published per-token pricing for hosted Gemma models as of this writing — unlike
 *  `ANTHROPIC_HAIKU_4_5_PRICE_PER_1M`, this is `undefined` until a real price sheet is found, so
 *  cost is logged as `costModel: 'unmeasured'` rather than a guessed number (charter: "report
 *  actual cost, not an assumption"). */
const GEMINI_GEMMA_PRICE_PER_1M: { input: number; output: number } | undefined = undefined;

/** `09` §2.4: `version` names the model, `promptVersion` names the prompt — both are cache keys
 *  on `extractions` (`08` §3.4). Bump either when the model or the prompt text changes. */
export function geminiExtractorVersion(model: string): string {
  return `2026-08-gemini-${model}`;
}

interface GeminiGenerateContentResponse {
  readonly candidates?: readonly {
    readonly content?: { readonly parts?: readonly { readonly text?: string }[] };
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
  };
}

function joinCaption(parts: readonly ContentPart[]): string {
  return parts.map((p) => p.text).join('\n\n');
}

/**
 * `apiKey` and `model` are passed in, not read from `process.env` here — same composition-root
 * separation as the other adapters.
 */
export function geminiPlaceExtractor(config: {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
}): PlaceExtractor {
  const model = config.model ?? 'gemini-2.5-flash';
  const doFetch = config.fetchImpl ?? fetch;
  const version = geminiExtractorVersion(model);
  const geminiSchema = toGeminiSchema(EXTRACTION_JSON_SCHEMA);

  return {
    version,
    promptVersion: PROMPT_VERSION,

    async extract(parts: readonly ContentPart[], ctx: OpCtx) {
      const caption = joinCaption(parts);
      const delimiter = generateDelimiter();
      const startedAt = Date.now();

      let response: Response;
      try {
        response = await doFetch(`${GEMINI_ENDPOINT_BASE}/${model}:generateContent`, {
          method: 'POST',
          signal: ctx.signal,
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': config.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: buildUserPrompt(caption, delimiter) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: geminiSchema,
            },
          }),
        });
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      if (!response.ok) {
        throw extractorUnavailable(`Gemini returned HTTP ${response.status}`);
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      const parsedResponse = json as GeminiGenerateContentResponse;
      const text = parsedResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text === undefined) {
        throw extractorInvalidOutput('Gemini response contained no text part.');
      }

      let candidateJson: unknown;
      try {
        candidateJson = JSON.parse(text);
      } catch (e) {
        throw extractorInvalidOutput('Gemini response content was not valid JSON.', e);
      }

      const parsed = ExtractionResultSchema.safeParse(candidateJson);
      if (!parsed.success) {
        throw extractorInvalidOutput(undefined, parsed.error);
      }

      const elapsedMs = Date.now() - startedAt;
      const usage = {
        inputTokens: parsedResponse.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: parsedResponse.usageMetadata?.candidatesTokenCount ?? 0,
      };
      logExtractionCost(ctx.log, {
        extractorVersion: version,
        promptVersion: PROMPT_VERSION,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: GEMINI_GEMMA_PRICE_PER_1M === undefined ? 0 : costUsd(usage, GEMINI_GEMMA_PRICE_PER_1M),
        costModel: GEMINI_GEMMA_PRICE_PER_1M === undefined ? 'unmeasured' : 'measured',
        elapsedMs,
      });

      const candidates = parsed.data.candidates.map(toPlaceCandidate);
      const { kept, dropped } = filterPlausible(candidates, caption);
      const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
      if (droppedTotal > 0) {
        ctx.log.event('extraction.plausibility_dropped', { ...dropped, total: droppedTotal });
      }

      return { candidates: kept, cityHint: parsed.data.cityHint };
    },
  };
}
