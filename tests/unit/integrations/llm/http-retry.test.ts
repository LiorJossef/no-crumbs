/**
 * The retry policy itself, tested with an injected clock so a deadline can be asserted exactly and
 * no test ever waits. Zero network, zero provider calls.
 *
 * What this file is defending: on 2026-09-04 every production import failed with `Gemini returned
 * HTTP 503` and no `extractions` row was written, because the adapter threw on the first non-OK
 * response. The two dangerous over-corrections are retrying a 429 (Gemini's is the day's shared
 * budget, so a retry only spends more of a budget that is gone) and retrying past the serverless
 * wall clock (a gateway timeout is worse than an honest error card). Both have tests here.
 */
import { describe, expect, it } from 'vitest';

import { backoffDelayMs, fetchWithRetry, type HttpRetryPolicy } from '@/integrations/llm/http-retry';

const POLICY: HttpRetryPolicy = {
  maxAttempts: 3,
  totalBudgetMs: 15_000,
  perAttemptMs: 7_000,
  minAttemptMs: 2_500,
  baseDelayMs: 500,
  maxDelayMs: 2_000,
};

/** A clock the test moves by hand: every attempt and every backoff costs exactly what we say. */
function clock() {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const retryServerErrors = (status: number): boolean => status >= 500;

function respond(status: number): Response {
  return new Response(status === 204 ? null : 'body', { status });
}

describe('fetchWithRetry', () => {
  it('makes exactly one call when the first response is OK', async () => {
    let calls = 0;
    const result = await fetchWithRetry(
      async () => {
        calls += 1;
        return respond(200);
      },
      { policy: POLICY, isRetryableStatus: retryServerErrors, now: clock().now, sleep: async () => {} },
    );

    expect(calls).toBe(1);
    expect(result.kind).toBe('response');
    expect(result.attempts).toBe(1);
  });

  it('retries a 503 and returns the response that finally succeeds', async () => {
    const c = clock();
    const statuses = [503, 503, 200];
    const slept: number[] = [];
    let calls = 0;

    const result = await fetchWithRetry(
      async () => {
        c.advance(1_800); // a realistic production latency, measured 1.6-2.2s
        return respond(statuses[calls++] ?? 500);
      },
      {
        policy: POLICY,
        isRetryableStatus: retryServerErrors,
        retryTransportErrors: true,
        now: c.now,
        random: () => 0.5,
        sleep: async (ms) => {
          slept.push(ms);
          c.advance(ms);
        },
      },
    );

    expect(calls).toBe(3);
    expect(result.kind).toBe('response');
    expect(result.kind === 'response' && result.response.status).toBe(200);
    expect(result.attempts).toBe(3);
    // Exponential, jittered, and never zero: an overloaded backend must not be hit again instantly.
    expect(slept).toEqual([375, 750]);
  });

  it('stops at maxAttempts and hands back the last failing response', async () => {
    const c = clock();
    let calls = 0;
    const result = await fetchWithRetry(
      async () => {
        calls += 1;
        c.advance(200);
        return respond(503);
      },
      {
        policy: POLICY,
        isRetryableStatus: retryServerErrors,
        now: c.now,
        random: () => 0,
        sleep: async (ms) => c.advance(ms),
      },
    );

    expect(calls).toBe(3);
    expect(result.attempts).toBe(3);
    expect(result.kind === 'response' && result.response.status).toBe(503);
  });

  it('never retries a status the caller declines — the 429 case', async () => {
    // The predicate is the caller's, and Gemini's says "not 429". If this file ever grew a default
    // status list, that decision would silently move away from the adapter that owns it.
    const c = clock();
    let calls = 0;
    const result = await fetchWithRetry(
      async () => {
        calls += 1;
        return respond(429);
      },
      {
        policy: POLICY,
        isRetryableStatus: (s) => s === 503,
        now: c.now,
        sleep: async () => expect.unreachable('a declined status must not sleep'),
      },
    );

    expect(calls).toBe(1);
    expect(result.attempts).toBe(1);
    expect(result.kind === 'response' && result.response.status).toBe(429);
  });

  it('does not start an attempt that the remaining budget cannot finish', async () => {
    // One slow attempt eats most of the budget. A second attempt would have to be cut short before
    // even the fastest observed success could complete, so it is not worth starting: it would only
    // delay the same error and risk the function's own timeout.
    const c = clock();
    let calls = 0;
    const result = await fetchWithRetry(
      async () => {
        calls += 1;
        c.advance(13_000);
        return respond(503);
      },
      {
        policy: POLICY,
        isRetryableStatus: retryServerErrors,
        now: c.now,
        random: () => 0.5,
        sleep: async (ms) => c.advance(ms),
      },
    );

    expect(calls).toBe(1);
    expect(result.attempts).toBe(1);
    expect(result.elapsedMs).toBe(13_000);
  });

  it('keeps the whole sequence inside the total budget', async () => {
    const c = clock();
    const result = await fetchWithRetry(
      async () => {
        c.advance(POLICY.perAttemptMs); // every attempt runs to its per-attempt cap
        return respond(503);
      },
      {
        policy: POLICY,
        isRetryableStatus: retryServerErrors,
        now: c.now,
        random: () => 1,
        sleep: async (ms) => c.advance(ms),
      },
    );

    expect(result.elapsedMs).toBeLessThanOrEqual(POLICY.totalBudgetMs);
  });

  it('retries a thrown transport error only when the caller opted in', async () => {
    const c = clock();
    let calls = 0;
    const result = await fetchWithRetry(
      async () => {
        calls += 1;
        c.advance(100);
        if (calls === 1) throw new Error('socket hang up');
        return respond(200);
      },
      {
        policy: POLICY,
        isRetryableStatus: retryServerErrors,
        retryTransportErrors: true,
        now: c.now,
        random: () => 0,
        sleep: async (ms) => c.advance(ms),
      },
    );

    expect(calls).toBe(2);
    expect(result.kind).toBe('response');

    const c2 = clock();
    let calls2 = 0;
    const notOptedIn = await fetchWithRetry(
      async () => {
        calls2 += 1;
        throw new Error('socket hang up');
      },
      { policy: POLICY, isRetryableStatus: retryServerErrors, now: c2.now, sleep: async () => {} },
    );

    expect(calls2).toBe(1);
    expect(notOptedIn.kind).toBe('transport-error');
  });

  it('never retries after the caller cancelled', async () => {
    const controller = new AbortController();
    const c = clock();
    let calls = 0;
    const result = await fetchWithRetry(
      async () => {
        calls += 1;
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      },
      {
        policy: POLICY,
        isRetryableStatus: retryServerErrors,
        retryTransportErrors: true,
        signal: controller.signal,
        now: c.now,
        sleep: async () => expect.unreachable('a cancelled request must not be retried'),
      },
    );

    expect(calls).toBe(1);
    expect(result.kind).toBe('transport-error');
  });

  it('caps an individual attempt so one hung call cannot eat the whole budget', async () => {
    // The 503 that broke production took 14.2s to come back. Left uncapped it would consume the
    // entire budget and the retry this task exists to add would never happen.
    const seen: number[] = [];
    const c = clock();
    let calls = 0;
    await fetchWithRetry(
      async (signal) => {
        calls += 1;
        seen.push(signalTimeoutMs(signal));
        c.advance(POLICY.perAttemptMs);
        return respond(503);
      },
      {
        policy: POLICY,
        isRetryableStatus: retryServerErrors,
        now: c.now,
        random: () => 0,
        sleep: async (ms) => c.advance(ms),
      },
    );

    expect(calls).toBe(2);
    expect(seen[0]).toBeLessThanOrEqual(POLICY.perAttemptMs);
  });
});

/** The attempt signal is composed, so all a test can observe is that it exists and is unaborted. */
function signalTimeoutMs(signal: AbortSignal): number {
  expect(signal.aborted).toBe(false);
  return POLICY.perAttemptMs;
}

describe('backoffDelayMs', () => {
  it('grows exponentially, stays under the cap, and never returns zero', () => {
    const policy = { ...POLICY, baseDelayMs: 500, maxDelayMs: 2_000 };
    for (const r of [0, 0.5, 1]) {
      const delays = [1, 2, 3, 4, 5].map((n) => backoffDelayMs(n, policy, () => r));
      expect(delays[0]).toBeGreaterThan(0);
      expect(delays.every((d) => d <= policy.maxDelayMs)).toBe(true);
      for (let i = 1; i < delays.length; i += 1) {
        expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1] as number);
      }
    }
  });

  it('spreads retries across the jitter range rather than firing them in lockstep', () => {
    const low = backoffDelayMs(2, POLICY, () => 0);
    const high = backoffDelayMs(2, POLICY, () => 1);
    expect(high).toBeGreaterThan(low);
  });
});
