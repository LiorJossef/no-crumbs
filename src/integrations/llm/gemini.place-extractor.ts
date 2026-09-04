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
import { extractorInvalidOutput, extractorQuotaExhausted, extractorUnavailable } from '@/domain/errors';
import { CANDIDATE_CAP, parseExtractionResultPartial, toPlaceCandidate } from '@/domain/extraction/schema';
import type { OpCtx, PlaceExtractor } from '@/domain/ports';
import type { ContentPart } from '@/domain/types';

import { costUsd, logExtractionCost } from './cost';
import { fetchWithRetry, type HttpRetryPolicy } from './http-retry';
import { EXTRACTION_JSON_SCHEMA, MAX_OUTPUT_TOKENS } from './json-schema';
import { postProcessCandidates } from './post-process';
import { buildUserPrompt, generateDelimiter, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt';
import { applyStopDiagnosis, classifyGeminiStop } from './stop-reason';

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Which non-OK statuses are worth repeating, and nothing wider.
 *
 *  - **503** — `UNAVAILABLE`, the service overloaded. This is the one that broke production on
 *    2026-09-04, and Google documents it as transient with "retry with exponential backoff".
 *  - **500** — `INTERNAL`, documented as an unexpected error on Google's side; the guidance is the
 *    same short wait and retry.
 *  - **504** — `DEADLINE_EXCEEDED`, the request outlived the server's own deadline. Repeating it is
 *    only safe because the deadline below refuses to start an attempt that cannot finish.
 *  - **502** — not in Google's documented list; an edge/proxy fault in front of the API, and a
 *    proxy that answers 502 has not run the model, so the repeat costs nothing but time.
 *
 * **429 is deliberately absent**, and this is the trap in this file. Gemini's 429 is the shared
 * daily budget being spent, not a per-minute limit — a retry cannot clear it, it only spends
 * attempts against a budget that is already gone, and it has its own code and its own screen.
 * Every other 4xx is a request we sent wrong; sending it again changes nothing.
 *
 * `anthropic.place-extractor.ts` is byte-similar and **must not** inherit this list, because its
 * 429 *is* a short per-minute limit that a retry clears. That is why `http-retry.ts` takes this
 * predicate as an argument instead of owning a status list.
 */
function isRetryableGeminiStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * The budget, chosen from production timings rather than from taste.
 *
 * Measured 2026-09-04: successful extractions logged **1.6–2.2s**; the 503 that killed every import
 * took **14.2s**, and the function returned at 14.22s. So the platform tolerated a 14.22s response
 * for a call that produced nothing at all.
 *
 * `GEMINI_OVERALL_BUDGET_MS` is the ceiling for *everything* this adapter does in one extraction —
 * the primary model's attempts, the backoff between them, and the fallback model's single try. At
 * 15s it is a hair above a wall clock production has already survived, so this change cannot newly
 * cause a gateway timeout. There is no `maxDuration` export anywhere in `src/app/`, so the real
 * function ceiling is a platform default nobody here has measured; sizing against an
 * observed-survivable number is the only honest option until someone does.
 *
 * The primary's share is `GEMINI_RETRY_POLICY.totalBudgetMs` = 10.5s, deliberately smaller than
 * the whole, because a primary that spends everything leaves nothing for the fallback and the
 * fallback would then be a feature that never runs. 10.5s is exactly two full-length attempts plus
 * one backoff, and the 4.5s that remains is comfortably more than one attempt needs.
 *
 *  - `perAttemptMs: 5_000` — a bit over 2x the slowest observed success, so a healthy call has room
 *    while a hang is cut early. Without a per-attempt cap the single 14.2s hang eats the whole
 *    budget and neither the retry nor the fallback ever happens. The trade is real and worth
 *    stating: a genuinely slow-but-fine call (say 6s) is now cut off — and then handed to the
 *    fallback, so the user still gets an answer rather than an error card.
 *  - `minAttemptMs: 2_500` — just above the slowest observed success. An attempt with less than
 *    this left could not finish even on the good path, so starting it only delays the error.
 *  - `maxAttempts: 3` — 5s + backoff + 5s nearly fills the primary's share, so three attempts is a
 *    ceiling only a fast-failing 503 (the common shape of an overload) reaches.
 */
export const GEMINI_OVERALL_BUDGET_MS = 15_000;

export const GEMINI_RETRY_POLICY: HttpRetryPolicy = {
  maxAttempts: 3,
  totalBudgetMs: 10_500,
  perAttemptMs: 5_000,
  minAttemptMs: 2_500,
  baseDelayMs: 500,
  maxDelayMs: 2_000,
};

/**
 * The second model, tried **once**, only after the primary's retries are spent.
 *
 * Order matters and this is why it is second, not instead: a 503 means the model we asked for is
 * overloaded, and retrying it is the cheap fix. A different model is a different capacity pool, so
 * it is the fix for an overload that does not clear — but it is also a model whose answers we have
 * not measured, so it is the second line, not the first.
 *
 * **Default `gemini-3.5-flash`.** Same family, so the same restricted OpenAPI schema dialect and
 * the same request shape apply unchanged; a different serving pool from `-lite`, which is the whole
 * point; and larger rather than smaller, so a fallback answer is not a quality downgrade in the
 * obvious direction. Overridable through `GEMINI_FALLBACK_MODEL` (the composition root), like the
 * primary's `GEMINI_MODEL`, so a bad choice is an env change and not a deploy.
 *
 * **What this costs, said plainly.** The golden-set numbers in `09` §8 were measured per adapter
 * *and per model*. A result produced by the fallback has **not** been verified to that standard —
 * neither its precision, nor its recall, nor the coordinate accuracy that disqualified
 * `gemma-4-26b-a4b-it` above. It is an acceptable trade against an import that would otherwise fail
 * outright, and it is written here so that nobody discovers it later while comparing quality
 * numbers and wondering why they moved.
 *
 * The schema cap is the sharp edge. `GEMINI_MAX_CANDIDATES = 8` was bisected live against
 * `gemini-3.5-flash-lite`; the fallback's own limit is **unmeasured**. The same request is sent
 * unchanged, on the reasoning that a larger sibling accepting a schema the smaller one accepted is
 * the likely case — but if it does not, the fallback answers `400 INVALID_ARGUMENT`, which is not
 * retryable and surfaces as a failure that names both models. That is a visible failure rather than
 * a silent one, which is the most this file can promise without a live measurement.
 */
export const GEMINI_FALLBACK_MODEL_DEFAULT = 'gemini-3.5-flash';

/** One try, and whatever is left of `GEMINI_OVERALL_BUDGET_MS` after the primary. Never more: the
 *  fallback exists to survive one overloaded pool, not to spend the request's whole wall clock. */
const FALLBACK_MAX_ATTEMPTS = 1;
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
  /** Second model, tried once when the primary's retries are spent. See
   *  `GEMINI_FALLBACK_MODEL_DEFAULT` for what it costs in verified quality. */
  readonly fallbackModel?: string;
  readonly fetchImpl?: typeof fetch;
  /** Overrides merged over `GEMINI_RETRY_POLICY`, and the ceiling for the whole extraction. A
   *  composition seam, like `fetchImpl`: a deployed route and a local dev route do not share a wall
   *  clock, and a test should not have to wait out a real backoff to assert one. The defaults are
   *  the production numbers. */
  readonly retry?: Partial<HttpRetryPolicy>;
  readonly overallBudgetMs?: number;
}): PlaceExtractor {
  const model = config.model ?? 'gemini-3.5-flash-lite';
  const fallbackModel = config.fallbackModel ?? GEMINI_FALLBACK_MODEL_DEFAULT;
  const doFetch = config.fetchImpl ?? fetch;
  const version = geminiExtractorVersion(model);
  const geminiSchema = toGeminiSchema(EXTRACTION_JSON_SCHEMA);
  const retryPolicy: HttpRetryPolicy = { ...GEMINI_RETRY_POLICY, ...config.retry };
  const overallBudgetMs = config.overallBudgetMs ?? GEMINI_OVERALL_BUDGET_MS;

  return {
    /**
     * The **primary** model, always — this is a static property of the adapter, read by callers
     * both before the call (as a cache key) and after it (as `extractions.model`), so it cannot
     * describe a decision taken mid-call.
     *
     * **The gap this used to have is closed** (2026-09-04): `extract` returns `modelUsed` when the
     * fallback answered, and `pipeline.ts` records `modelUsed ?? version`, so the column names the
     * model that replied. The paragraph below describes the state before that and is kept because
     * it is the reason the field exists.
     *
     * **Former gap:** when the fallback answered, the `extractions` row
     * still records the primary here, because `PlaceExtractor` (`domain/ports.ts`) has no per-call
     * field for the model that actually replied and that file is not this lane's to change. Until
     * it grows one, the only truthful record of a fallback answer is the
     * `extraction.fallback_used` log event below, which carries both names side by side. Anyone
     * reading model quality out of `extractions.model` alone is reading it slightly wrong on
     * exactly those rows.
     */
    version,
    promptVersion: PROMPT_VERSION,

    async extract(parts: readonly ContentPart[], ctx: OpCtx) {
      const caption = joinCaption(parts);
      const delimiter = generateDelimiter();
      const startedAt = Date.now();

      // Built once and sent byte-identically to both models: same prompt, same schema, same
      // sampling. A fallback that quietly asked a different question would make the two models'
      // answers incomparable, and comparing them is the only way the fallback ever gets measured.
      const requestBody = JSON.stringify({
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
      });

      const callModel = (modelName: string, policy: HttpRetryPolicy) =>
        fetchWithRetry(
          (signal) =>
            doFetch(`${GEMINI_ENDPOINT_BASE}/${modelName}:generateContent`, {
              method: 'POST',
              signal,
              headers: {
                'content-type': 'application/json',
                'x-goog-api-key': config.apiKey,
              },
              body: requestBody,
            }),
          {
            policy,
            signal: ctx.signal,
            isRetryableStatus: isRetryableGeminiStatus,
            // A socket reset, a DNS blip or our own per-attempt cut is the same class of fault as a
            // 503 and costs no tokens to repeat. A cancellation of `ctx.signal` is not, and
            // `fetchWithRetry` never retries that one.
            retryTransportErrors: true,
            onRetry: ({ attempt, status, delayMs, remainingMs }) =>
              // Every retry is another call against the shared daily budget, so it is logged
              // whether or not the sequence goes on to succeed. A retry nobody counted is a cost
              // nobody can see.
              ctx.log.event('extraction.retry', {
                extractorVersion: geminiExtractorVersion(modelName),
                promptVersion: PROMPT_VERSION,
                attempt,
                status: status ?? 'transport-error',
                delayMs,
                remainingMs,
              }),
          },
        );

      const primary = await callModel(model, retryPolicy);
      let outcome = primary;
      let answeredBy = model;
      let attempts = primary.attempts;
      /** Appended to the failure message so one error names both models rather than hiding one. */
      let fallbackNote = '';

      // Fall over on exactly the statuses that were worth retrying, and on a transport fault, which
      // is the same "this pool is not answering" shape. Never on a 429 — Gemini's is the day's
      // shared budget, which a second model on the same key does not escape, so a fallback there
      // would spend one more call for a guaranteed second failure. Never on any other 4xx: a
      // request we built wrong is wrong for both models. And never after a caller cancellation.
      const primaryFailedTransiently =
        ctx.signal.aborted === false &&
        (primary.kind === 'transport-error' ||
          (!primary.response.ok && isRetryableGeminiStatus(primary.response.status)));

      if (primaryFailedTransiently) {
        // The deadline governs the fallback exactly as it governs a retry: it is one more call on
        // the same wall clock, and a gateway timeout is worse than an honest error card.
        const remainingMs = overallBudgetMs - (Date.now() - startedAt);
        const primaryStatus = primary.kind === 'response' ? primary.response.status : 'transport-error';

        if (remainingMs < retryPolicy.minAttemptMs) {
          ctx.log.event('extraction.fallback_skipped', {
            extractorVersion: version,
            fallbackModel,
            reason: 'deadline',
            remainingMs,
            primaryAttempts: primary.attempts,
            primaryStatus,
          });
          fallbackNote = `; fallback ${fallbackModel} skipped, ${remainingMs}ms left`;
        } else {
          const fallback = await callModel(fallbackModel, {
            ...retryPolicy,
            maxAttempts: FALLBACK_MAX_ATTEMPTS,
            totalBudgetMs: remainingMs,
            perAttemptMs: Math.min(retryPolicy.perAttemptMs, remainingMs),
          });
          attempts += fallback.attempts;

          if (fallback.kind === 'response' && fallback.response.ok) {
            outcome = fallback;
            answeredBy = fallbackModel;
            // The only truthful record that a different model answered — see `version` above.
            ctx.log.event('extraction.fallback_used', {
              promptVersion: PROMPT_VERSION,
              primaryModel: model,
              primaryStatus,
              primaryAttempts: primary.attempts,
              answeredBy: fallbackModel,
              answeredVersion: geminiExtractorVersion(fallbackModel),
              recordedVersion: version,
              qualityMeasured: false,
            });
          } else {
            fallbackNote =
              fallback.kind === 'response'
                ? `; fallback ${fallbackModel} returned HTTP ${fallback.response.status}`
                : `; fallback ${fallbackModel} failed in transport`;
          }
        }
      }

      // From here on, the model that actually answered — not the one we asked first.
      const answeredVersion = geminiExtractorVersion(answeredBy);

      if (outcome.kind === 'transport-error') {
        throw extractorUnavailable(
          `Gemini transport failure after ${attempts} call(s) in ${Date.now() - startedAt}ms${fallbackNote}`,
          outcome.error,
        );
      }
      const response = outcome.response;

      if (!response.ok) {
        // A 429 here is the shared daily budget being spent, not a transient fault — the calls do
        // not come back within a retry's reach, so it carries its own code and its own screen
        // (`product-ruling-quota-copy-2026-08-31.md` R4/§5), and neither the retry nor the fallback
        // will spend a call on it. Every other non-OK status keeps `extractorUnavailable`, whose
        // copy correctly offers a retry.
        //
        // **`anthropic.place-extractor.ts` is byte-similar here and must NOT get this.** Anthropic's
        // 429 is a short per-minute rate limit that a retry genuinely clears; Gemini's is the day's
        // budget gone. Same status code, opposite meaning — this is the line a build lane copies
        // across without thinking.
        //
        // The call count is in the message because by this point a transient status has already
        // been retried to exhaustion and possibly sent to a second model: "503" on its own would
        // hide that three or four calls went into it.
        throw response.status === 429
          ? extractorQuotaExhausted(`Gemini returned HTTP ${response.status}`)
          : extractorUnavailable(
              `Gemini returned HTTP ${response.status} after ${attempts} call(s)${fallbackNote}`,
            );
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (e) {
        throw extractorUnavailable(undefined, e);
      }

      const parsedResponse = json as GeminiGenerateContentResponse;
      // Wall clock for the whole sequence, not for the one attempt that happened to answer — with
      // retries in play those are different numbers and only the first is what the user waited.
      const elapsedMs = Date.now() - startedAt;
      const usage = {
        inputTokens: parsedResponse.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: parsedResponse.usageMetadata?.candidatesTokenCount ?? 0,
      };

      // Logged before anything can throw: a truncated or blocked call is still a call we made, and
      // a cost line that only appears on success under-reports what extraction actually costs.
      //
      // `attempts` is on this line for the same reason. Token usage comes only from the response
      // that finally arrived, so a retried extraction bills for one call but *spends* two or three
      // against the shared daily request budget. Without this field the cost line would quietly
      // claim the cheaper of those two truths.
      logExtractionCost(ctx.log, {
        extractorVersion: answeredVersion,
        promptVersion: PROMPT_VERSION,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 0 : costUsd(usage, GEMINI_FLASH_LITE_PRICE_PER_1M),
        costModel: GEMINI_FLASH_LITE_PRICE_PER_1M === undefined ? 'unmeasured' : 'measured',
        elapsedMs,
        attempts,
      });

      // Before the body is read. A `MAX_TOKENS` finish means the JSON below is cut off, and a
      // `SAFETY`/`blockReason` stop means there is no JSON at all — both used to arrive as
      // "response contained no text part" or "not valid JSON", which name the symptom and hide the
      // cause (`stop-reason.ts`).
      applyStopDiagnosis(
        classifyGeminiStop(parsedResponse.candidates?.[0]?.finishReason, parsedResponse.promptFeedback?.blockReason),
        'Gemini',
        ctx,
        { extractorVersion: answeredVersion, outputTokens: usage.outputTokens, maxOutputTokens: MAX_OUTPUT_TOKENS },
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
          extractorVersion: answeredVersion,
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
          extractorVersion: answeredVersion,
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
      return {
        candidates,
        cityHint: parsed.value.cityHint,
        postIntent: parsed.value.postIntent,
        // **Only when the fallback answered.** `undefined` means the primary did, which is what
        // every non-falling-back adapter says by saying nothing — so `pipeline.ts` can read
        // `modelUsed ?? version` and every existing caller is unchanged. This is what closes the
        // gap the `version` docblock above describes: without it `extractions.model` records the
        // model we asked first rather than the one that replied.
        ...(answeredBy === model ? {} : { modelUsed: answeredBy }),
      };
    },
  };
}
