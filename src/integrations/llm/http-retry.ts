/**
 * A bounded, deadline-aware retry around one HTTP attempt, shared by the LLM adapters that want it.
 *
 * **Why this exists.** On 2026-09-04 every production TikTok import failed at the extract stage
 * with `Gemini returned HTTP 503` — the provider overloaded, which Google's own guidance calls
 * transient and says to retry with backoff. `gemini.place-extractor.ts` threw on the first non-OK
 * response, so one overloaded moment killed the import. Two `imports` rows failed and no
 * `extractions` row was written at all, because no model response ever arrived.
 *
 * **Why it takes a predicate instead of owning a status list.** The two adapters disagree about
 * what a status *means*. Gemini's 429 is the shared daily budget gone — a retry cannot clear it,
 * and it has its own error code and its own screen. Anthropic's 429 is a short per-minute limit a
 * retry genuinely clears. Same number, opposite semantics. So this file has **no default set of
 * retryable statuses**: `isRetryableStatus` is a required argument, decided at the call site next
 * to the error mapping it belongs with. Nothing here can quietly impose one adapter's reading of a
 * status on the other.
 *
 * **Why it is deadline-aware rather than just attempt-capped.** The failing production call took
 * 14.2s to come back and the function returned at 14.22s. Retries that only count attempts turn a
 * clean error card into a gateway timeout, which is worse than the bug. So the caller carries a
 * total wall-clock budget, every attempt is capped by `perAttemptMs` *and* by whatever is left of
 * that budget, and an attempt that cannot plausibly finish (`minAttemptMs`) is never started.
 *
 * **Why it maps nothing.** The result is the final `Response` or the final thrown transport error,
 * plus the number of attempts actually made. Every translation into a `DomainError` stays with the
 * adapter, and `attempts` exists so the adapter can report how many calls a "single" extraction
 * really cost — under-reporting that is the specific thing this lane was warned about.
 */

export interface HttpRetryPolicy {
  /** Total calls, including the first. `1` disables retrying without a branch at the call site. */
  readonly maxAttempts: number;
  /** Wall-clock ceiling for the whole sequence: all attempts plus all backoff sleeps. */
  readonly totalBudgetMs: number;
  /** Ceiling for any one attempt, so a single hung call cannot eat the whole budget. */
  readonly perAttemptMs: number;
  /** Never start an attempt with less than this left — a doomed attempt only delays the error. */
  readonly minAttemptMs: number;
  /** First backoff delay; doubles per retry, capped at `maxDelayMs`, then jittered. */
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export type HttpRetryResult =
  | { readonly kind: 'response'; readonly response: Response; readonly attempts: number; readonly elapsedMs: number }
  | { readonly kind: 'transport-error'; readonly error: unknown; readonly attempts: number; readonly elapsedMs: number };

export interface HttpRetryOptions {
  readonly policy: HttpRetryPolicy;
  /** The caller's own cancellation (`OpCtx.signal`). Its abort ends the sequence immediately: a
   *  cancelled request is not a transient fault and must never be retried. */
  readonly signal?: AbortSignal;
  /** Required on purpose — see the file comment. */
  readonly isRetryableStatus: (status: number) => boolean;
  /** Retry a thrown `fetch` error (socket reset, DNS blip, our own per-attempt timeout). Aborts
   *  originating from `signal` are never retried regardless. */
  readonly retryTransportErrors?: boolean;
  /** Called before each backoff sleep, so the adapter can log what it is about to repeat. */
  readonly onRetry?: (info: {
    readonly attempt: number;
    readonly status: number | null;
    readonly delayMs: number;
    readonly remainingMs: number;
  }) => void;
  /** Injected in tests so the retry policy can be asserted without real waiting. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Equal jitter: half the capped exponential delay, plus a random half. Full jitter can return a
 *  near-zero delay, which is exactly what an overloaded backend should not receive. */
export function backoffDelayMs(attempt: number, policy: HttpRetryPolicy, random: () => number): number {
  const capped = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(capped / 2 + random() * (capped / 2));
}

export async function fetchWithRetry(
  attemptFn: (signal: AbortSignal) => Promise<Response>,
  options: HttpRetryOptions,
): Promise<HttpRetryResult> {
  const { policy } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const startedAt = now();
  const deadline = startedAt + policy.totalBudgetMs;
  const remaining = (): number => deadline - now();

  let attempts = 0;
  for (;;) {
    attempts += 1;
    const attemptBudget = Math.min(policy.perAttemptMs, remaining());
    const timeout = AbortSignal.timeout(Math.max(attemptBudget, 1));
    const signal = options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);

    let response: Response;
    try {
      response = await attemptFn(signal);
    } catch (error) {
      // A caller-side cancellation is not a fault to retry — the request it belonged to is gone.
      // Everything else (socket reset, DNS blip, our own per-attempt timeout) is transport noise.
      const cancelled = options.signal?.aborted === true;
      const retryable = options.retryTransportErrors === true && !cancelled;
      if (!retryable || !canRetry(attempts, policy, remaining())) {
        return { kind: 'transport-error', error, attempts, elapsedMs: now() - startedAt };
      }
      const delayMs = boundedDelay(attempts, policy, remaining(), random);
      options.onRetry?.({ attempt: attempts, status: null, delayMs, remainingMs: remaining() });
      await sleep(delayMs);
      continue;
    }

    if (response.ok || !options.isRetryableStatus(response.status) || !canRetry(attempts, policy, remaining())) {
      return { kind: 'response', response, attempts, elapsedMs: now() - startedAt };
    }

    const delayMs = boundedDelay(attempts, policy, remaining(), random);
    options.onRetry?.({ attempt: attempts, status: response.status, delayMs, remainingMs: remaining() });
    // The body of a discarded error response is never read; dropping the reference is enough for
    // `undici`, which pools the connection when the response is garbage collected.
    await sleep(delayMs);
  }
}

/** A retry is worth starting only if the attempt cap allows it *and* enough of the budget survives
 *  the backoff for an attempt that could actually complete. */
function canRetry(attempts: number, policy: HttpRetryPolicy, remainingMs: number): boolean {
  if (attempts >= policy.maxAttempts) return false;
  const delayMs = policy.baseDelayMs / 2;
  return remainingMs - delayMs >= policy.minAttemptMs;
}

function boundedDelay(attempts: number, policy: HttpRetryPolicy, remainingMs: number, random: () => number): number {
  const wanted = backoffDelayMs(attempts, policy, random);
  return Math.max(0, Math.min(wanted, remainingMs - policy.minAttemptMs));
}
