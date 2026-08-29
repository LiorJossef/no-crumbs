import 'server-only';

/**
 * The import rate limiter, over migration `0027`'s two entry points.
 *
 * ## Why this is a database call and not a Map
 *
 * Vercel gives each request a lambda that shares no memory with its siblings, so an in-process
 * counter counts one instance and reports success for every other. Postgres is already on the
 * critical path of every import (`sources`, `extractions`), and the volumes here are tens of rows
 * per user per day. The full argument, the numbers and where each one comes from are in
 * `supabase/migrations/0027_import_rate_limit.sql`'s header; this module deliberately repeats none
 * of them. **No limit lives in TypeScript.** A limit in this file would be a second source of truth
 * that a deploy can change without a migration and without a review, which is the opposite of what
 * a spend control is for.
 *
 * ## Service role, and the review rule it comes with
 *
 * `rate_limit_events` has ENABLE + FORCE RLS, **no policy** and **no grant to any role** — not even
 * `service_role`, which holds `rolbypassrls` and is still refused a direct `select` (measured). The
 * two functions are `SECURITY DEFINER` with EXECUTE granted to `service_role` alone, so a browser
 * role cannot reset, inflate or read a counter, and a leaked service key can call these two
 * entry points and nothing else.
 *
 * `docs/security.md` §4's rule for the service-role client — *a service-role query never filters by
 * `user_id`* — has a NAMED EXCEPTION here, and it is the one thing a reviewer must check. Both calls
 * take a user id, and it must be **the id from `supabase.auth.getUser()` on the server, never a
 * value from the request body, a header, a cookie or a client-supplied field.** A caller-supplied id
 * would let one user spend another user's budget, or reset their own by sending a fresh uuid. This
 * is the identical rule `apply_saved_place_extraction` already carries (`0019`, restated in
 * `/api/imports/confirm`), and it is why the id is a required first field rather than something
 * with a default.
 *
 * ## The two failure contracts are OPPOSITE, on purpose
 *
 * `PlaceLookupStore` never throws: a broken cache costs latency, so a shrug is right. A limiter is
 * the other way round — a broken limiter costs money, and it costs it against a hard external quota
 * that is already exhausted once per night of benchmarking. So:
 *
 *   - {@link checkImportRateLimit} **fails closed.** A transport error, an unparsable payload or a
 *     database error is returned as a refusal with `rule: 'limiter_unavailable'`, not as an
 *     allowance. The import path already requires Postgres, so "the limiter is unreachable but the
 *     import would have worked" is a narrow case, and admitting spend we cannot count is worse than
 *     refusing it for a minute.
 *   - {@link recordImportUsage} **never throws.** By the time it runs the money is spent and the
 *     user's places are real; failing their import over a bookkeeping write would destroy work to
 *     protect a counter. It logs loudly instead, because unrecorded spend means the global ceiling
 *     under-counts until the row ages out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { OpCtx } from '@/domain/ports';

/** Named once so a rename shows up as one broken constant, not as a limiter that never limits. */
const CHECK_RPC = 'import_rate_limit_check';
const RECORD_RPC = 'import_usage_record';

/**
 * The rule name reported when the limiter itself could not be consulted. Not one of `0027`'s rule
 * names — deliberately, so a reader of a log line can tell "you hit the ceiling" apart from "we
 * could not find out whether you hit the ceiling".
 */
export const LIMITER_UNAVAILABLE_RULE = 'limiter_unavailable';

/** How long to tell a caller to wait when the limiter itself is the thing that failed. */
const LIMITER_UNAVAILABLE_RETRY_SECONDS = 60;

/**
 * Which entry point is asking. They have different rules: a probe is gated on the model and
 * geocoder budgets it is about to spend, a confirm only on its own loose ceilings plus the hard
 * shared Google quota — because refusing to SAVE work the user has already paid for would be the
 * limiter causing the damage it exists to prevent.
 */
export type RateLimitAction = 'probe' | 'confirm';

/**
 * Whose ceiling was hit. This distinction is a product decision, not a diagnostic: `'user'` means
 * "you have done this a lot" and `RATE_LIMITED_LOCAL`'s existing copy ("give it a few minutes")
 * fits. `'global'` means the product is out of shared quota for the day, the caller did nothing
 * wrong, and `retryAfterSeconds` can be many hours — for which "a few minutes" is a lie.
 */
export type RateLimitSubjectKind = 'user' | 'global';

export interface RateLimitDecision {
  /** The only field a caller is required to branch on. */
  readonly allowed: boolean;
  readonly action: RateLimitAction;
  /** `0027`'s rule name, or {@link LIMITER_UNAVAILABLE_RULE}. `null` when allowed. */
  readonly rule: string | null;
  readonly subjectKind: RateLimitSubjectKind | null;
  /** Seconds until this call would be admitted. Exact, never optimistic. `null` when allowed. */
  readonly retryAfterSeconds: number | null;
  /** The ceiling that was hit, and how much of it is spent. Both `null` when allowed. */
  readonly limit: number | null;
  readonly used: number | null;
}

/**
 * The database's decision object. Parsed rather than cast: this is a `jsonb` coming back through
 * PostgREST, i.e. an `unknown` at the process boundary, and a limiter that trusted a malformed
 * payload would be a limiter that could be turned off by breaking one function.
 */
const decisionSchema = z.object({
  allowed: z.boolean(),
  action: z.enum(['probe', 'confirm']),
  rule: z.string().nullable(),
  subject_kind: z.enum(['user', 'global']).nullable(),
  retry_after_seconds: z.number().int().nonnegative().nullable(),
  limit: z.number().int().nonnegative().nullable(),
  used: z.number().int().nonnegative().nullable(),
});

function refuseUnavailable(action: RateLimitAction): RateLimitDecision {
  return {
    allowed: false,
    action,
    rule: LIMITER_UNAVAILABLE_RULE,
    subjectKind: 'global',
    retryAfterSeconds: LIMITER_UNAVAILABLE_RETRY_SECONDS,
    limit: null,
    used: null,
  };
}

/**
 * Ask whether this user may start an import, and record the attempt if so.
 *
 * Call it **before any external work** — before `getOrCreateImport`, before the oEmbed fetch, before
 * the model. `07` §5 puts the limiter exactly there, and it is the only position that saves
 * anything: a check after the model call has already spent the thing it protects.
 *
 * A refusal writes nothing, so retrying does not extend the block — the wait really is the
 * `retryAfterSeconds` returned.
 *
 * @param service   a service-role client ({@link import('./service-role-client').serviceRoleClient}).
 * @param input.userId **the authenticated session's user id and nothing else** — see the module
 *   header. Anything derived from the request body is a way to spend someone else's budget.
 */
export async function checkImportRateLimit(
  service: SupabaseClient,
  input: { readonly userId: string; readonly action: RateLimitAction },
  ctx: OpCtx,
): Promise<RateLimitDecision> {
  let payload: unknown;
  try {
    const { data, error } = await service
      .rpc(CHECK_RPC, { p_user_id: input.userId, p_action: input.action })
      .abortSignal(ctx.signal);
    if (error) {
      // Only the vendor error's `code` is logged. PostgREST codes are SQLSTATEs and short strings —
      // never a row, a query, a caption or a user id.
      ctx.log.event('imports.rate_limit_error', {
        op: 'check',
        action: input.action,
        code: error.code ?? 'unknown',
        outcome: 'fail_closed',
      });
      return refuseUnavailable(input.action);
    }
    payload = data;
  } catch {
    // An aborted request lands here. Fail closed here too: the caller is going away, and a
    // cancelled check must never read as an allowance.
    ctx.log.event('imports.rate_limit_error', {
      op: 'check',
      action: input.action,
      code: 'throw',
      outcome: 'fail_closed',
    });
    return refuseUnavailable(input.action);
  }

  const parsed = decisionSchema.safeParse(payload);
  if (!parsed.success) {
    ctx.log.event('imports.rate_limit_error', {
      op: 'check',
      action: input.action,
      code: 'unparsable',
      outcome: 'fail_closed',
    });
    return refuseUnavailable(input.action);
  }

  const d = parsed.data;
  if (!d.allowed) {
    ctx.log.event('imports.rate_limited', {
      action: input.action,
      rule: d.rule ?? 'unknown',
      subjectKind: d.subject_kind ?? 'unknown',
      retryAfterSeconds: d.retry_after_seconds ?? -1,
      limit: d.limit ?? -1,
      used: d.used ?? -1,
    });
  }

  return {
    allowed: d.allowed,
    action: d.action,
    rule: d.rule,
    subjectKind: d.subject_kind,
    retryAfterSeconds: d.retry_after_seconds,
    limit: d.limit,
    used: d.used,
  };
}

/**
 * Record what an import actually spent. Not a gate — it is what the *next*
 * {@link checkImportRateLimit} reads.
 *
 * Counts are **calls made**, not candidates seen and not places saved. A probe answered from the
 * `sources` + `extractions` caches passes `0, 0` and writes no row at all, which is the point: the
 * cache is the only thing standing between this project and its daily model ceiling, and charging a
 * cache hit against the money budget would make it look expensive.
 *
 * Call it whether the import succeeded or failed. A run that called the model and then fell over
 * spent the same money as one that finished.
 *
 * @param input.llmCalls   LLM requests issued (`0` if the extraction cache answered).
 * @param input.placeCalls Google Places API requests issued (`0` if the lookup cache answered).
 */
export async function recordImportUsage(
  service: SupabaseClient,
  input: {
    readonly userId: string;
    readonly llmCalls: number;
    readonly placeCalls: number;
  },
  ctx: OpCtx,
): Promise<void> {
  // Nothing to say, and saying it costs a round trip on the common cached path.
  if (input.llmCalls <= 0 && input.placeCalls <= 0) {
    return;
  }
  try {
    const { error } = await service
      .rpc(RECORD_RPC, {
        p_user_id: input.userId,
        p_llm_calls: Math.max(0, Math.trunc(input.llmCalls)),
        p_place_calls: Math.max(0, Math.trunc(input.placeCalls)),
      })
      .abortSignal(ctx.signal);
    if (error) {
      // Logged at the same level as any other adapter failure because the product outcome is
      // unaffected — but this one is worth reading: unrecorded spend means the global ceiling is
      // under-counting real calls against a hard external quota until the window rolls.
      ctx.log.event('imports.usage_record_error', {
        code: error.code ?? 'unknown',
        llmCalls: input.llmCalls,
        placeCalls: input.placeCalls,
      });
    }
  } catch {
    ctx.log.event('imports.usage_record_error', {
      code: 'throw',
      llmCalls: input.llmCalls,
      placeCalls: input.placeCalls,
    });
  }
}
