/**
 * Unit tests for the import limiter's data-access module.
 *
 * These are NOT the authorisation proof — that is `supabase/tests/0027_import_rate_limit_tests.sql`,
 * which runs against a real database, because a grant and a policy cannot be tested with a mock.
 * What this file asserts is the half a mocked client CAN prove and the SQL suite cannot: that the
 * module fails **closed** on every path where something goes wrong, that it maps the database's
 * snake_case decision onto the exported shape without inventing anything, and that a cache hit
 * costs no round trip.
 */

import { describe, expect, it, vi } from 'vitest';

// The module under test imports `server-only`, whose non-`react-server` entry point throws on
// import. That guard is doing its job — it is what makes a service-role module fail the *build* if
// it is ever pulled into a client bundle (`07` §11) — so it is stubbed here rather than removed
// there. Local to this file on purpose: nothing in the shared vitest config is weakened.
vi.mock('server-only', () => ({}));

import {
  LIMITER_UNAVAILABLE_RULE,
  checkImportRateLimit,
  recordImportUsage,
} from '@/integrations/supabase/import-rate-limit-store';
import type { OpCtx } from '@/domain/ports';

const USER = '00000000-0000-4000-8000-000000000027';

function ctx(): OpCtx & { readonly events: { name: string }[] } {
  const events: { name: string }[] = [];
  return {
    signal: new AbortController().signal,
    importId: null,
    log: { event: (name: string) => void events.push({ name }) },
    events,
  };
}

/** The two chained calls `supabase-js` makes: `.rpc(...).abortSignal(...)`, then await. */
function clientReturning(result: unknown) {
  const rpc = vi.fn(() => ({ abortSignal: () => Promise.resolve(result) }));
  // Only `.rpc` is exercised; the rest of SupabaseClient is irrelevant to this module.
  return { client: { rpc } as never, rpc };
}

function clientThrowing() {
  const rpc = vi.fn(() => ({
    abortSignal: () => Promise.reject(new Error('socket hang up')),
  }));
  return { client: { rpc } as never, rpc };
}

describe('checkImportRateLimit', () => {
  it('passes the decision through unchanged when the database allows', async () => {
    const { client, rpc } = clientReturning({
      data: {
        allowed: true,
        action: 'probe',
        rule: null,
        subject_kind: null,
        retry_after_seconds: null,
        limit: null,
        used: null,
      },
      error: null,
    });

    const d = await checkImportRateLimit(client, { userId: USER, action: 'probe' }, ctx());

    expect(d.allowed).toBe(true);
    expect(d.rule).toBeNull();
    expect(rpc).toHaveBeenCalledWith('import_rate_limit_check', {
      p_user_id: USER,
      p_action: 'probe',
    });
  });

  it('carries the rule, the subject kind and the retry-after of a refusal', async () => {
    const { client } = clientReturning({
      data: {
        allowed: false,
        action: 'probe',
        rule: 'places_daily_global',
        subject_kind: 'global',
        retry_after_seconds: 41230,
        limit: 80,
        used: 80,
      },
      error: null,
    });

    const d = await checkImportRateLimit(client, { userId: USER, action: 'probe' }, ctx());

    expect(d).toEqual({
      allowed: false,
      action: 'probe',
      rule: 'places_daily_global',
      // The field that decides the copy: this refusal is not the caller's fault and "give it a few
      // minutes" would be wrong for an eleven-hour wait.
      subjectKind: 'global',
      retryAfterSeconds: 41230,
      limit: 80,
      used: 80,
    });
  });

  // The three fail-closed paths. Each one is a way a limiter silently becomes no limiter, which is
  // the failure this module exists to not have.
  it('fails CLOSED when the RPC returns an error', async () => {
    const { client } = clientReturning({ data: null, error: { code: '42501' } });
    const c = ctx();

    const d = await checkImportRateLimit(client, { userId: USER, action: 'probe' }, c);

    expect(d.allowed).toBe(false);
    expect(d.rule).toBe(LIMITER_UNAVAILABLE_RULE);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
    expect(c.events.map((e) => e.name)).toContain('imports.rate_limit_error');
  });

  it('fails CLOSED when the call throws (transport, abort)', async () => {
    const { client } = clientThrowing();

    const d = await checkImportRateLimit(client, { userId: USER, action: 'confirm' }, ctx());

    expect(d.allowed).toBe(false);
    expect(d.rule).toBe(LIMITER_UNAVAILABLE_RULE);
    expect(d.action).toBe('confirm');
  });

  it('fails CLOSED on a payload that is not the decision shape', async () => {
    // The shape that matters: a truthy object with no `allowed` field must not read as permission.
    const { client } = clientReturning({ data: { ok: 'sure' }, error: null });

    const d = await checkImportRateLimit(client, { userId: USER, action: 'probe' }, ctx());

    expect(d.allowed).toBe(false);
    expect(d.rule).toBe(LIMITER_UNAVAILABLE_RULE);
  });

  it('fails CLOSED on null, which is what a dropped function returns', async () => {
    const { client } = clientReturning({ data: null, error: null });

    const d = await checkImportRateLimit(client, { userId: USER, action: 'probe' }, ctx());

    expect(d.allowed).toBe(false);
  });
});

describe('recordImportUsage', () => {
  it('writes nothing at all for a cache hit', async () => {
    const { client, rpc } = clientReturning({ error: null });

    await recordImportUsage(client, { userId: USER, llmCalls: 0, placeCalls: 0 }, ctx());

    // Not merely "records zero units" — it does not make the round trip. A cached import must cost
    // nothing, including nothing in latency.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('records the calls that were actually made', async () => {
    const { client, rpc } = clientReturning({ error: null });

    await recordImportUsage(client, { userId: USER, llmCalls: 1, placeCalls: 3 }, ctx());

    expect(rpc).toHaveBeenCalledWith('import_usage_record', {
      p_user_id: USER,
      p_llm_calls: 1,
      p_place_calls: 3,
    });
  });

  it('never throws when the write fails — the money is already spent and the places are real', async () => {
    const { client } = clientThrowing();
    const c = ctx();

    await expect(
      recordImportUsage(client, { userId: USER, llmCalls: 2, placeCalls: 7 }, c),
    ).resolves.toBeUndefined();
    expect(c.events.map((e) => e.name)).toContain('imports.usage_record_error');
  });
});
