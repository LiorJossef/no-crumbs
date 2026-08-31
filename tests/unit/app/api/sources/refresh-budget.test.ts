/**
 * The spending limit on `POST /api/sources/thumbnail`
 * (`app/api/sources/thumbnail/_lib/refresh-budget.ts`).
 *
 * Worth its own file because the thing it protects is not this feature's own correctness: oEmbed is
 * a hard **500 calls/day shared** with the import path, every agent and the owner, and this route
 * is triggered by an `<img>` `onError` that fires once per row on screen. A limiter that is off by
 * one, or that resets on a boundary, spends somebody else's quota. The clock is injected so every
 * window is asserted at its exact edge rather than by sleeping.
 */
import { describe, expect, it } from 'vitest';

import {
  createRefreshBudget,
  DAY_MS,
  HOUR_MS,
  REFRESH_BUDGET,
} from '@/app/api/sources/thumbnail/_lib/refresh-budget';

const T0 = Date.parse('2026-08-31T12:00:00Z');

describe('the numbers in force', () => {
  it('leaves most of the shared 500/day to imports', () => {
    // The one assertion here that is a product decision rather than an implementation detail: a
    // thumbnail is a recognition cue and must never be the reason an import cannot run.
    expect(REFRESH_BUDGET.globalPerDay).toBe(200);
    expect(REFRESH_BUDGET.globalPerDay).toBeLessThan(500 / 2);
    expect(REFRESH_BUDGET.globalPerHour).toBeLessThan(REFRESH_BUDGET.globalPerDay);
    expect(REFRESH_BUDGET.perUserPerHour).toBeLessThan(REFRESH_BUDGET.globalPerHour);
  });
});

describe('createRefreshBudget', () => {
  it('grants up to the per-user hourly limit and then refuses', () => {
    const budget = createRefreshBudget({ perUserPerHour: 3, globalPerHour: 99, globalPerDay: 99 });
    for (let i = 0; i < 3; i += 1) expect(budget.claim('u1', T0 + i)).toBe('allowed');
    expect(budget.claim('u1', T0 + 3)).toBe('user-hour');
  });

  it('does not charge a refusal, so being refused cannot exhaust anything', () => {
    // A client that keeps asking after a 429 must not push the global counter along; otherwise a
    // single misbehaving tab could spend the day's allowance without ever making a call.
    const budget = createRefreshBudget({ perUserPerHour: 1, globalPerHour: 99, globalPerDay: 99 });
    expect(budget.claim('u1', T0)).toBe('allowed');
    for (let i = 0; i < 50; i += 1) expect(budget.claim('u1', T0 + i)).toBe('user-hour');
    expect(budget.spentInDay(T0)).toBe(1);
  });

  it('one user cannot spend another user hourly share', () => {
    const budget = createRefreshBudget({ perUserPerHour: 2, globalPerHour: 99, globalPerDay: 99 });
    expect(budget.claim('u1', T0)).toBe('allowed');
    expect(budget.claim('u1', T0)).toBe('allowed');
    expect(budget.claim('u1', T0)).toBe('user-hour');
    expect(budget.claim('u2', T0)).toBe('allowed');
  });

  it('rolls, so an hour-boundary burst cannot get 2x through', () => {
    // The reason this is a timestamp list and not a bucket-per-hour counter. With calendar buckets
    // the two claims below would both be granted, which is exactly the shape a reload storm has.
    const budget = createRefreshBudget({ perUserPerHour: 1, globalPerHour: 99, globalPerDay: 99 });
    expect(budget.claim('u1', T0)).toBe('allowed');
    expect(budget.claim('u1', T0 + HOUR_MS - 1)).toBe('user-hour');
    expect(budget.claim('u1', T0 + HOUR_MS + 1)).toBe('allowed');
  });

  it('reports the widest exhausted window, so a log line blames the feature not the caller', () => {
    const budget = createRefreshBudget({ perUserPerHour: 5, globalPerHour: 5, globalPerDay: 2 });
    expect(budget.claim('u1', T0)).toBe('allowed');
    expect(budget.claim('u2', T0)).toBe('allowed');
    expect(budget.claim('u3', T0)).toBe('global-day');
  });

  it('holds the global hourly ceiling across users, then releases it an hour later', () => {
    const budget = createRefreshBudget({ perUserPerHour: 5, globalPerHour: 2, globalPerDay: 99 });
    expect(budget.claim('u1', T0)).toBe('allowed');
    expect(budget.claim('u2', T0)).toBe('allowed');
    // A third caller who spent nothing is still refused: this ceiling is about the shared quota,
    // not about anyone's own pace, which is why the response status it maps to is imprecise and
    // the route says so out loud.
    expect(budget.claim('u3', T0)).toBe('global-hour');
    expect(budget.claim('u3', T0 + HOUR_MS - 1)).toBe('global-hour');
    // An hour after u1's and u2's spends, the *hour* window is clear again while the day window
    // still remembers them — the two windows are independent, which is the point of having both.
    expect(budget.claim('u3', T0 + HOUR_MS + 1)).toBe('allowed');
    expect(budget.spentInDay(T0 + HOUR_MS + 1)).toBe(3);
  });

  it('releases the daily ceiling a day later, not an hour later', () => {
    const budget = createRefreshBudget({ perUserPerHour: 9, globalPerHour: 9, globalPerDay: 1 });
    expect(budget.claim('u1', T0)).toBe('allowed');
    expect(budget.claim('u1', T0 + HOUR_MS * 2)).toBe('global-day');
    expect(budget.claim('u1', T0 + DAY_MS + 1)).toBe('allowed');
  });

  it('bounds its own memory: the global list never outgrows the daily cap', () => {
    // Not decoration. This object lives for the lifetime of a warm lambda instance, and an
    // unbounded list behind an `onError`-triggered route is a slow leak in production.
    const budget = createRefreshBudget({ perUserPerHour: 1e6, globalPerHour: 1e6, globalPerDay: 5 });
    for (let i = 0; i < 1000; i += 1) budget.claim(`u${i}`, T0 + i);
    expect(budget.spentInDay(T0 + 1000)).toBe(5);
  });
});

describe('the bound this does NOT provide', () => {
  it('is per-instance: two budgets do not see each other', () => {
    // Stated as a test rather than only in a comment, because it is the honest limit of the
    // in-memory design. On Vercel, `n` warm instances means `n x globalPerDay`. The
    // instance-independent half of the bound is the route's per-source cooldown, read out of
    // `sources.updated_at` in Postgres. A durable aggregate limiter needs a counter table, and a
    // migration is outside this lane's write scope.
    const a = createRefreshBudget({ perUserPerHour: 1, globalPerHour: 1, globalPerDay: 1 });
    const b = createRefreshBudget({ perUserPerHour: 1, globalPerHour: 1, globalPerDay: 1 });
    expect(a.claim('u1', T0)).toBe('allowed');
    expect(a.claim('u1', T0)).toBe('global-day');
    expect(b.claim('u1', T0)).toBe('allowed');
  });
});
