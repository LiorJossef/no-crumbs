/**
 * The local-development `PlaceExtractor` (owner constraint added 2026-08-22, this session —
 * `docs/execution-plan.md`'s 2026-08-22 change-log entry; not yet reconciled into `09` §2.3, which
 * still lists "local / self-hosted model" as rejected for a different reason, cost of *deployment*
 * integration on Vercel. That reasoning does not apply here: this adapter is dev-only, selected by
 * config, never composed into a production `Ports` object).
 *
 * ## Capability call — read before trusting this file
 *
 * **UNAVAILABLE to verify in this session.** Ollama is not installed in this sandbox (`which
 * ollama` → not found; no `brew` formula installed; `curl localhost:11434` unreachable), and
 * installing it plus pulling an instruct model (hundreds of MB to a few GB) is outside this task's
 * time/network budget. No real local run was made against this prompt and schema.
 *
 * **ASSUMED, from Ollama's own published docs (not independently measured here):** Ollama's
 * `/api/chat` endpoint accepts a `format` field that is either the literal string `"json"` or a
 * full JSON Schema object, and constrains decoding to match it — this is the mechanism this file
 * uses. Whether a *small* instruct model (the class of model that makes "free to iterate" true —
 * e.g. a 1–3B model) reliably produces schema-valid, non-hallucinated output for *this* task's
 * prompt is unmeasured. Larger local models (7B+) are more likely to comply but erode the "costs
 * nothing to iterate" premise on a laptop without a GPU.
 *
 * **Consequence, stated rather than hidden:** this adapter is real, typed, and wired behind the
 * same `PlaceExtractor` port as the hosted one, so switching `LLM_PROVIDER=ollama` in `.env.local`
 * costs zero code changes elsewhere — but its practical usefulness is an open item, not a shipped
 * fact. **Flagged decision, not silently made:** until someone runs it against a real Ollama
 * install and checks it against the golden set (`09` §8), the pragmatic dev-tier stand-in is the
 * hosted adapter itself, pointed at the cheapest available hosted model with a low personal rate
 * limit — not a code fork, the same `anthropicPlaceExtractor` with a different `model` string. That
 * substitution, if the owner wants it, is a one-line default in whatever composes `Ports`
 * (L0-F6, not yet built), not a change to this file.
 *
 * The Zod parse below is not weakened for this adapter: a local model that returns a shape Zod
 * rejects is `EXTRACTOR_INVALID_OUTPUT`, exactly like the hosted adapter — "no tools, no side
 * effects, schema-constrained-or-it-fails" (charter R10) does not get a local exception.
 */
import { extractorInvalidOutput, extractorUnavailable } from '@/domain/errors';
import { filterPlausible } from '@/domain/extraction/plausibility';
import { ExtractionResultSchema, toPlaceCandidate } from '@/domain/extraction/schema';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { ContentPart } from '@/domain/types';

import { logExtractionCost } from './cost';
import { EXTRACTION_JSON_SCHEMA } from './json-schema';
import { buildUserPrompt, generateDelimiter, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';

const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';

/** `09` §2.4's `version` field, for this adapter: names the local model, not "ollama" generically,
 *  because two different local models are two different cache keys (`08` §3.4). */
export function ollamaExtractorVersion(model: string): string {
  return `2026-08-ollama-${model}`;
}

interface OllamaChatResponse {
  readonly message: { readonly role: string; readonly content: string };
  /** Tokens in the prompt / the completion — Ollama's own naming, kept as-is at this boundary and
   *  translated to the shared `TokenUsage` shape before logging. */
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
}

function joinCaption(parts: readonly ContentPart[]): string {
  return parts.map((p) => p.text).join('\n\n');
}

/**
 * `host` defaults to a local Ollama daemon; `model` must already be pulled (`ollama pull <model>`)
 * — this adapter never pulls a model itself, matching `PlaceExtractor`'s "no side effects" contract
 * as far as this process's own actions go.
 */
export function ollamaPlaceExtractor(config: {
  readonly model: string;
  readonly host?: string;
  readonly fetchImpl?: typeof fetch;
}): PlaceExtractor {
  const host = config.host ?? DEFAULT_OLLAMA_HOST;
  const doFetch = config.fetchImpl ?? fetch;
  const version = ollamaExtractorVersion(config.model);

  return {
    version,
    promptVersion: PROMPT_VERSION,

    async extract(parts: readonly ContentPart[], ctx: OpCtx) {
      const caption = joinCaption(parts);
      const delimiter = generateDelimiter();
      const startedAt = Date.now();

      let response: Response;
      try {
        response = await doFetch(`${host}/api/chat`, {
          method: 'POST',
          signal: ctx.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: config.model,
            stream: false,
            format: EXTRACTION_JSON_SCHEMA,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildUserPrompt(caption, delimiter) },
            ],
          }),
        });
      } catch (e) {
        // Includes "daemon not running" — the honest, expected failure on a machine that has not
        // installed Ollama, mapped to the same retryable code the hosted adapter uses on a
        // transport failure (`07` §9).
        throw extractorUnavailable(undefined, e);
      }

      if (!response.ok) {
        throw extractorUnavailable(`Ollama returned HTTP ${response.status}`);
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      const parsedResponse = json as OllamaChatResponse;
      let candidateJson: unknown;
      try {
        candidateJson = JSON.parse(parsedResponse.message.content);
      } catch (e) {
        throw extractorInvalidOutput('Ollama response content was not valid JSON.', e);
      }

      const parsed = ExtractionResultSchema.safeParse(candidateJson);
      if (!parsed.success) {
        throw extractorInvalidOutput(undefined, parsed.error);
      }

      const elapsedMs = Date.now() - startedAt;
      logExtractionCost(ctx.log, {
        extractorVersion: version,
        promptVersion: PROMPT_VERSION,
        inputTokens: parsedResponse.prompt_eval_count ?? 0,
        outputTokens: parsedResponse.eval_count ?? 0,
        // A local model has no per-token price: $0 is the real cost, logged explicitly (see
        // `cost.ts`) rather than omitted, which would read as "not measured" instead of "free".
        costUsd: 0,
        costModel: 'zero-cost-local',
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
