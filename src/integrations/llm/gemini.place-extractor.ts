/**
 * The hosted-Gemini `PlaceExtractor` (`09` §2, `domain/ports.ts`) — Google's Gemini API
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
 *
 * Model default is `gemini-3.5-flash-lite`, not a Gemma variant. `gemma-4-26b-a4b-it` was tried
 * first (free/unmeasured tier) but live-tested against real venues (Pate & Puff/Herzliya,
 * Container/Jaffa, the Western Wall) it produced a specific, repeatable failure on the
 * `coordinates` field: latitude consistently correct, longitude wrong by 15-40°, landing in Iran,
 * India or Egypt instead of Israel — reproduced with the full extraction prompt, an
 * instructions-hardened version of it (explicit "verify against cityHint/countryHint before
 * returning, else return null"), and even a bare single-fact prompt asking only for that one
 * venue's coordinates. Same failure every form, never a `null`, so it is a genuine gap in the
 * small model's geographic recall, not something prompt wording can fix. `gemini-3.5-flash-lite`
 * on the exact same prompt/schema got every one of those venues right, repeatably.
 */
import { extractorInvalidOutput, extractorUnavailable } from '@/domain/errors';
import { ExtractionResultSchema, toPlaceCandidate } from '@/domain/extraction/schema';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { ContentPart } from '@/domain/types';

import { costUsd, logExtractionCost } from './cost';
import { EXTRACTION_JSON_SCHEMA } from './json-schema';
import { postProcessCandidates } from './post-process';
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
 * Also caps `candidates`'s `maxItems`, and that cap is a **measured model limit, not a product
 * choice** — the endpoint rejects a schema it considers too large with a bare
 * `400 INVALID_ARGUMENT` and no indication of which part it disliked, so the number has to be
 * found by bisection and re-found whenever the item shape or the model changes.
 *
 * History, because the shape of the limit is what makes it predictable: `gemma-4-26b-a4b-it` (the
 * previous default) needed `maxItems <= 5` against the v1 nine-property item. `gemini-3.5-flash-lite`
 * then took the same item at `maxItems = 12`. Schema v2 grew the item to thirteen properties
 * including two nested arrays, and 12 started failing again. Bisected live on 2026-08-27 with the
 * v2 item: **12, 11, 10 and 9 all return 400; 8 returns 200.** Nothing else moved it — removing
 * the nested arrays' `maxItems`, flattening `whyGo` into two sibling strings, and stripping every
 * `minLength`/`maxLength`/`minimum`/`maximum` in the schema each still 400'd at 12. So the limit
 * behaves like a budget over (root array length x item complexity), and the root cap is the only
 * lever that moves it.
 *
 * Dropping 12 -> 8 costs nothing real: `domain/import/pipeline.ts` enforces `MAX_CANDIDATES = 7`
 * (`07` §7) before any of these candidates is resolved, so a ninth candidate would have been
 * discarded a step later anyway. The shared `EXTRACTION_JSON_SCHEMA` keeps its own 12 for the
 * Anthropic adapter, which has no such limit.
 */
const GEMINI_MAX_CANDIDATES = 8;

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

/** No verified per-token price for `gemini-3.5-flash-lite` is on record in this codebase yet —
 *  unlike `ANTHROPIC_HAIKU_4_5_PRICE_PER_1M`, this is `undefined` until one is found and confirmed
 *  against Google's published pricing, so cost is logged as `costModel: 'unmeasured'` rather than
 *  a guessed number (charter: "report actual cost, not an assumption"). */
const GEMINI_FLASH_LITE_PRICE_PER_1M: { input: number; output: number } | undefined = undefined;

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
  const model = config.model ?? 'gemini-3.5-flash-lite';
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
        costUsd: GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 0 : costUsd(usage, GEMINI_FLASH_LITE_PRICE_PER_1M),
        costModel: GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 'unmeasured' : 'measured',
        elapsedMs,
      });

      const candidates = postProcessCandidates(parsed.data.candidates.map(toPlaceCandidate), caption, ctx);

      return { candidates, cityHint: parsed.data.cityHint };
    },
  };
}
