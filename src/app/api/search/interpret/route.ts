/**
 * `POST /api/search/interpret` — a sentence in, a clamped `SearchIntent` out.
 * `docs/nls-plan.md` §2.2, Stage 1.
 *
 * The model proposes; only the user changes the result set. This route makes **one** provider call
 * per explicit submit — there is no debounce, no cache and no call gate in V1 (owner ruling,
 * 2026-09-04) — and it returns filter *values*, never places. The filtering itself happens in the
 * browser, in the four pure passes `map-page-client.tsx` already runs.
 *
 * ## What the browser is told, and what it is trusted for
 *
 * It sends the sentence it typed and **the vocabulary of its own library** — which categories,
 * tags, visit states and origins actually have rows behind them. That vocabulary is untrusted like
 * anything else from a browser, so `sanitiseVocabulary` intersects it with the closed taxonomy
 * before the clamp reads it: a caller cannot widen its own vocabulary into accepting a value this
 * product does not have. Sending it, rather than re-deriving it server-side, is what keeps this
 * route free of a database read on the hot path — and the client clamps a second time against its
 * live facets before it renders anything, which closes the window where the library changed in
 * between (`intent.ts`'s header).
 *
 * Nothing is written. No migration, no row, no `imports` bookkeeping: a search is a read of the
 * user's own state and leaves no trace.
 *
 * ## Four guards, and each is here because the extraction path taught us it was missing
 *
 *  - **Auth.** No session, no call. The provider budget is shared and daily; an unauthenticated
 *    endpoint that spends it is the whole budget gone in an afternoon.
 *  - **Rate limit.** Per user, in memory. Deliberately modest and deliberately honest about what
 *    it is: one process's memory, so it is a brake on a stuck client rather than a security
 *    control. It resets on deploy and does not span instances.
 *  - **Abort signal.** The caller's own signal is composed with the adapter's 6 s cap, so a user
 *    who closes the panel stops the call rather than paying for an answer nobody reads.
 *  - **Budget.** The 6 s cap lives in the adapter (`query-intent.ts`) precisely so a route cannot
 *    inherit the extraction path's "no timeout, no retry" defect by forgetting it.
 *
 * ## The failure contract
 *
 * Every failure is `{ ok: false, reason }` with a code, never a message: the copy is
 * `nls-plan.md` §3.4's and belongs to the panel, which must keep the sentence on screen so the
 * user edits rather than retypes. `quota` is reported as its own reason and the panel is expected
 * to render it identically to any other failure — quota exhaustion is never mentioned to a user
 * (§6.2).
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/app/_lib/supabase/server';
import { DomainError } from '@/domain/errors';
import { clampIntent, sanitiseVocabulary, SEARCH_INTENT_SCHEMA_VERSION } from '@/domain/search/intent';
import {
  INTENT_SCHEMA_VARIANTS,
  queryIntentReader,
  type IntentSchemaVariant,
} from '@/integrations/llm/query-intent';

/** Long enough for a sentence, short enough that nobody pastes a caption into it. A query over
 *  this is rejected rather than truncated — a half-sentence means something else. */
const MAX_QUERY_LENGTH = 200;

/** Per user, per window. A person submits a sentence a handful of times in a sitting; twenty in
 *  ten minutes is generous for that and still a brake on a client stuck in a loop. */
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * The rate-limiter's whole state: user id → the timestamps of their recent submits.
 *
 * In-process and unshared, which is stated rather than papered over. On Vercel each instance keeps
 * its own copy, so the effective limit is `RATE_LIMIT_MAX × instances`. A real limiter belongs in
 * Postgres or a KV store and is a decision with a cost attached; this is the honest version of
 * what one file can enforce, and it is the difference between a stuck client costing twenty calls
 * and costing the day's budget.
 */
const submits = new Map<string, number[]>();

function rateLimited(userId: string, now: number): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (submits.get(userId) ?? []).filter((at) => at > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    submits.set(userId, recent);
    return true;
  }
  recent.push(now);
  submits.set(userId, recent);
  // Bounded cleanup: without it a long-lived instance keeps one array per user who ever searched.
  if (submits.size > 500) {
    for (const [key, times] of submits) {
      if (times.every((at) => at <= cutoff)) submits.delete(key);
    }
  }
  return false;
}

interface InterpretBody {
  readonly query?: unknown;
  readonly vocabulary?: unknown;
  readonly schemaVariant?: unknown;
  readonly model?: unknown;
}

/**
 * The schema-variant override, and why it exists at all.
 *
 * `json-schema.ts` records that this endpoint rejects a schema it considers too complex with a
 * bare `400 INVALID_ARGUMENT` naming no field, so the usable shape has to be found by bisection
 * against the live model — and the API key is only present in a running server's environment. This
 * lets `scripts/nls-benchmark.mjs` do that bisection through a signed-in session.
 *
 * **Development only, and it selects from a closed list.** It cannot carry a schema; it names one
 * of four variants defined in the adapter. In production the field is ignored entirely, so the
 * shipped shape is always the measured constant.
 */
function requestedVariant(value: unknown): IntentSchemaVariant | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return typeof value === 'string' && (INTENT_SCHEMA_VARIANTS as readonly string[]).includes(value)
    ? (value as IntentSchemaVariant)
    : undefined;
}

/**
 * The model override, and it exists for the same reason `requestedVariant` does.
 *
 * `nls-plan.md` §6.1 makes `gemini-3.5-flash-lite` *"one environment variable away"* from being the
 * default, and the gate is what decides between the two. The variable is read at request time from
 * the server's own environment, which a benchmark driving a **running** dev server cannot set — so
 * without this, "report the fallback's number too" is not a thing that can be done at all.
 *
 * **Development only, and it selects from a closed list of two.** In production the field is
 * ignored and `SEARCH_INTENT_MODEL` (or the adapter's default) is the only way the model changes.
 */
const SELECTABLE_MODELS: readonly string[] = ['gemma-4-26b-a4b-it', 'gemini-3.5-flash-lite'];

function requestedModel(value: unknown): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  return typeof value === 'string' && SELECTABLE_MODELS.includes(value) ? value : undefined;
}

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 401);

  let body: InterpretBody;
  try {
    body = (await req.json()) as InterpretBody;
  } catch {
    return fail('malformed', 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  // Submit is disabled until there is text (§6.2), so an empty query here is a client bug rather
  // than a user action. It is still never a provider call.
  if (query === '' || query.length > MAX_QUERY_LENGTH) return fail('malformed', 400);

  if (rateLimited(user.id, Date.now())) return fail('rate-limited', 429);

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey === undefined || apiKey === '') return fail('unavailable', 503);

  const vocabulary = sanitiseVocabulary(body.vocabulary);
  const model = requestedModel(body.model) ?? process.env.SEARCH_INTENT_MODEL;
  const variant = requestedVariant(body.schemaVariant);
  const reader = queryIntentReader({
    apiKey,
    ...(model !== undefined && model !== '' ? { model } : {}),
    ...(variant !== undefined ? { schemaVariant: variant } : {}),
  });

  try {
    const reading = await reader.read(query, req.signal);
    const clamped = clampIntent(reading.raw, vocabulary, query);

    // Codes and counts only — never the query, never a model sentence (charter R9, `ports.ts`'s
    // `Logger`). `dropped` is counted, not listed, for the same reason.
    console.info(
      JSON.stringify({
        event: 'search.interpret',
        outcome: 'ok',
        model: reader.version,
        promptVersion: reader.promptVersion,
        schemaVersion: SEARCH_INTENT_SCHEMA_VERSION,
        schemaVariant: reader.schemaVariant,
        elapsedMs: reading.elapsedMs,
        inputTokens: reading.inputTokens,
        outputTokens: reading.outputTokens,
        dropped: clamped.dropped.length,
      }),
    );

    return NextResponse.json({
      ok: true,
      intent: clamped.intent,
      /** What the clamp removed. The panel shows none of it; it exists so a benchmark can score
       *  "caught a false filter" apart from "the model emitted none", which are the same clean
       *  screen to a user and completely different facts about the model. */
      dropped: clamped.dropped,
      meta: {
        model: reader.version,
        promptVersion: reader.promptVersion,
        schemaVersion: SEARCH_INTENT_SCHEMA_VERSION,
        schemaVariant: reader.schemaVariant,
        elapsedMs: reading.elapsedMs,
        inputTokens: reading.inputTokens,
        outputTokens: reading.outputTokens,
        finishReason: reading.finishReason,
      },
    });
  } catch (e) {
    const domain = e instanceof DomainError ? e.code : 'unknown';
    console.error(JSON.stringify({ event: 'search.interpret', outcome: 'failed', domain }));
    // Quota is its own reason so it can be counted in the logs. It is **not** its own screen:
    // "quota exhausted" is indistinguishable from any other failure to the user (§6.2).
    return domain === 'EXTRACTOR_QUOTA_EXHAUSTED' ? fail('quota', 429) : fail('unavailable', 502);
  }
}
