/**
 * The local-development `PlaceExtractor` (owner constraint added 2026-08-22, this session —
 * `docs/execution-plan.md`'s 2026-08-22 change-log entry; not yet reconciled into `09` §2.3, which
 * still lists "local / self-hosted model" as rejected for a different reason, cost of *deployment*
 * integration on Vercel. That reasoning does not apply here: this adapter is dev-only, selected by
 * config, never composed into a production `Ports` object).
 *
 * ## Capability call — read before trusting this file
 *
 * **VERIFIED, 2026-08-22, real run against a live daemon.** Ollama installed and running locally
 * (`brew services start ollama`, reachable at `http://127.0.0.1:11434`), model `gemma4:e4b` (8B,
 * Q4_K_M, ~9.6GB) pulled and used directly — a deliberate deviation from this file's coded
 * `OLLAMA_MODEL` default of `llama3.2:3b`, not an error. Eight real oEmbed captions run through
 * this exact adapter end to end (ad-hoc probe script, not checked in): the model's `/api/chat`
 * response, constrained by `format: EXTRACTION_JSON_SCHEMA`, parsed as valid JSON and passed
 * `ExtractionResultSchema.safeParse` on the first try every single time — zero retries, zero
 * `EXTRACTOR_INVALID_OUTPUT` throws across all eight calls. Output was well-behaved on both ends
 * of the task: five generic/no-venue captions (hashtag soup, a meme, a question with no venue)
 * correctly returned zero kept candidates; three venue-naming captions (one with an explicit "📍",
 * one plain-prose "X, placed on Y street in Z") correctly surfaced the named cafe with a sane
 * `cityHint`/`categoryHint`/verbatim `evidence`. The one open miss: on a caption with no real venue
 * but many hashtags, the model treated several hashtag fragments (`#tsukijifishmarket`,
 * `#studioghibli`) as place names — schema-valid but wrong; `filterPlausible`'s
 * `hashtag_or_handle` rule did not catch these because the model stripped the leading `#` from
 * `rawName` while still quoting `evidence` with the `#` on it, which is exactly the loophole in
 * that rule's current implementation (it checks `rawName`'s own leading character, not
 * `evidence`'s). Latency ranged ~7–34s per call on this laptop (CPU-only, no GPU) — free but slow,
 * an interactive-import-latency concern for `LLM_PROVIDER=ollama`, not a schema-compliance one.
 * Real cost, logged via `logExtractionCost`: $0 on every call, `costModel: 'zero-cost-local'`, as
 * this file's own comment below already states.
 *
 * **Still open:** this was eight hand-picked captions, not the 50-post golden set (`09` §8) — a
 * real precision/recall number against golden-set ground truth, and a check of whether the
 * hashtag-as-place leak above recurs at scale, are both still outstanding before any claim that
 * `gemma4:e4b` is *accurate*, only that it is *schema-compliant*.
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
