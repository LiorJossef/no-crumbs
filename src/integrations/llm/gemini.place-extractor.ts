/**
 * The hosted-Gemini `PlaceExtractor` (`09` §2, `domain/ports.ts`) — Google's Gemini API
 * `generateContent` endpoint over plain `fetch`, no `@google/genai` SDK dependency, mirroring
 * `anthropic.place-extractor.ts`'s "vendor surface is one HTTP call and one response shape, both
 * private to this file" shape (`07` §10). This is the dev-facing hosted adapter, config-selected
 * alongside `anthropic.place-extractor.ts`: no local daemon, no dev-machine dependency.
 *
 * Structured output is enforced via `generationConfig.responseSchema`
 * (`integrations/llm/json-schema.ts`'s `EXTRACTION_JSON_SCHEMA`), and the response is re-parsed
 * with `domain/extraction/schema.ts`'s `parseExtractionResultPartial` regardless — schema-shaping
 * the request narrows what the model *can* say; the Zod parse is what we actually trust (`07` §10's
 * Zod-at-every-boundary rule). That parse is per candidate: one malformed candidate no longer
 * discards the other four, and the count it did discard is logged rather than swallowed.
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
import { CANDIDATE_CAP, parseExtractionResultPartial, toPlaceCandidate } from '@/domain/extraction/schema';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { ContentPart } from '@/domain/types';

import { costUsd, logExtractionCost } from './cost';
import { EXTRACTION_JSON_SCHEMA, MAX_OUTPUT_TOKENS } from './json-schema';
import { postProcessCandidates } from './post-process';
import { buildUserPrompt, generateDelimiter, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';
import { applyStopDiagnosis, classifyGeminiStop } from './stop-reason';

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
 * Dropping 12 -> 8 used to cost nothing real, because `domain/import/pipeline.ts` enforced
 * `MAX_CANDIDATES = 7` (`07` §7) and a ninth candidate would have been discarded a step later
 * anyway. That headroom is gone: `MAX_CANDIDATES` was raised 7 -> 8 on 2026-08-31 (growth-plan
 * G3, so an eight-venue listicle survives whole), and **the two caps now meet exactly.** Every
 * candidate this schema permits is one the pipeline resolves, and nothing absorbs a change to
 * either number — lowering this one silently loses a place, and raising it is a live re-bisection
 * against the endpoint, not an edit. The shared `EXTRACTION_JSON_SCHEMA` keeps its own 12 for the
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
    /** Why generation ended: `STOP`, `MAX_TOKENS`, `SAFETY`, … See `stop-reason.ts`. */
    readonly finishReason?: unknown;
  }[];
  /** Set when the **prompt** was blocked, in which case there is no candidate at all. */
  readonly promptFeedback?: { readonly blockReason?: unknown };
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
              // Sent explicitly rather than left to the model default, which is a number we do not
              // control and cannot see in the response. Same ceiling and same arithmetic as the
              // Anthropic adapter (`json-schema.ts`'s `MAX_OUTPUT_TOKENS`) — the two adapters
              // truncating at different, unstated points would make every cross-adapter comparison
              // a comparison of two budgets. Gemini's own `maxItems` cap here is 8, so this is
              // roughly twice what the widest legal response can need.
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              // Every extraction was one sample from the model's default distribution, and it cost
              // us a false diagnosis: three corpus captions returned zero candidates under `p8-s3`
              // that had returned a candidate under `p7-s2`, which read exactly like a prompt
              // regression. It was not. Re-running the *unchanged* `p8` prompt on those captions
              // returned the candidate every time — the empty draws were dice, not the prompt.
              //
              // So this is a measurement floor before it is a quality setting. Without it we
              // cannot tell a prompt change from a sampling artefact, which makes every prompt
              // evaluation we run unreliable, and prompt evaluation is how recognition improves.
              //
              // It damps the variance rather than removing it: two runs pinned here still differed
              // from each other. Do not read `temperature: 0` as "deterministic" — read it as
              // "the same caption should usually give the same places", which is also what a user
              // re-importing a link they already tried would expect.
              temperature: 0,
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
      const elapsedMs = Date.now() - startedAt;
      const usage = {
        inputTokens: parsedResponse.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: parsedResponse.usageMetadata?.candidatesTokenCount ?? 0,
      };

      // Logged before anything can throw: a truncated or blocked call is still a call we made, and
      // a cost line that only appears on success under-reports what extraction actually costs.
      logExtractionCost(ctx.log, {
        extractorVersion: version,
        promptVersion: PROMPT_VERSION,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 0 : costUsd(usage, GEMINI_FLASH_LITE_PRICE_PER_1M),
        costModel: GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 'unmeasured' : 'measured',
        elapsedMs,
      });

      // Before the body is read. A `MAX_TOKENS` finish means the JSON below is cut off, and a
      // `SAFETY`/`blockReason` stop means there is no JSON at all — both used to arrive as
      // "response contained no text part" or "not valid JSON", which name the symptom and hide the
      // cause (`stop-reason.ts`).
      applyStopDiagnosis(
        classifyGeminiStop(parsedResponse.candidates?.[0]?.finishReason, parsedResponse.promptFeedback?.blockReason),
        'Gemini',
        ctx,
        { extractorVersion: version, outputTokens: usage.outputTokens, maxOutputTokens: MAX_OUTPUT_TOKENS },
      );

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

      const parsed = parseExtractionResultPartial(candidateJson);
      if (!parsed.ok) {
        throw extractorInvalidOutput(undefined, parsed.error);
      }
      if (parsed.value.dropped > 0) {
        // A fault, not a note: the list handed back is not the list the model sent, and no field
        // of `PlaceExtractor`'s return type can say so. See `parseExtractionResultPartial`.
        ctx.log.event('extraction.candidates_dropped', {
          extractorVersion: version,
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
          extractorVersion: version,
          promptVersion: PROMPT_VERSION,
          cap: CANDIDATE_CAP,
          truncated: parsed.value.truncated,
          kept: parsed.value.candidates.length,
          total: parsed.value.total,
        });
      }

      const candidates = postProcessCandidates(parsed.value.candidates.map(toPlaceCandidate), caption, ctx);

      // `postIntent` is passed straight through, unread. It is an explanation for the screen the
      // ~73% no-place imports land on, and by design nothing here — not the parse, not
      // `postProcessCandidates`, not this return — may let it change which candidates survive
      // (`domain/extraction/schema.ts`'s `PostIntentSchema`).
      return { candidates, cityHint: parsed.value.cityHint, postIntent: parsed.value.postIntent };
    },
  };
}
