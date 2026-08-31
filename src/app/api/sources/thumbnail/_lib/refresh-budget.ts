/**
 * The spending limit on `POST /api/sources/thumbnail`. Pure, clock-injected, no Supabase, no
 * `NextResponse` — for the same reason `_lib/error-reporting.ts` is: every rule here has to be
 * unit-testable without a request, because the thing it protects is a budget shared with people
 * who are not in this request.
 *
 * ## What is being protected
 *
 * oEmbed is one hard **500 calls/day, shared** with the import path, every agent and the owner.
 * The route this guards is triggered by an `<img>` `onError`, and that event does not fire once —
 * it fires for **every row on screen**, at parse time, before hydration. A library whose
 * thumbnails all expired on the same afternoon (they do: the signed URLs last ~47 hours, measured
 * 2026-08-31) is a list where *every* row's image fails at once. Unbudgeted, one scroll of a
 * 200-place library is 200 upstream calls, 40% of a day's shared quota, spent by a page that was
 * only trying to draw itself.
 *
 * ## The three windows, and why three
 *
 * A single cap cannot express both "one person may not drain the day" and "everyone together may
 * not drain the day", and a per-day cap alone lets the whole allowance go in the first minute —
 * which is exactly the burst shape an `onError` storm has.
 *
 *  - **`perUserPerHour`** — one signed-in person's share. 20/hour heals a screenful and a bit per
 *    hour, which is what the reactive design actually needs; it is not enough to walk a large
 *    library back to health in one sitting, and that is deliberate.
 *  - **`globalPerHour`** — the burst ceiling. Bounds the damage when several people (or several
 *    tabs) open large libraries at once.
 *  - **`globalPerDay`** — the share of the 500 this feature may ever cost. 200 leaves 300/day for
 *    imports, which are the product's actual job; a thumbnail is a recognition cue and must never
 *    be the reason an import cannot run.
 *
 * ## The limit this is NOT
 *
 * **These counters are in-memory and therefore per-process.** On Vercel that means per lambda
 * instance: with `n` warm instances the true global ceiling is `n × globalPerDay`, not
 * `globalPerDay`. This is stated rather than papered over. The instance-independent half of the
 * bound lives in the route itself, in Postgres — `sources.updated_at` gives a durable per-source
 * cooldown that no amount of horizontal scale can bypass — and it is what actually holds the line
 * for a single hot source. A genuinely durable *aggregate* limiter needs a counter table, which
 * needs a migration, which is outside this lane's write scope; it is the named follow-up.
 */

/** Milliseconds in the two windows. Named so a test can express "just inside"/"just outside". */
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export interface RefreshBudgetLimits {
  readonly perUserPerHour: number;
  readonly globalPerHour: number;
  readonly globalPerDay: number;
}

/** The numbers in force. See this file's header for the argument behind each one. */
export const REFRESH_BUDGET: RefreshBudgetLimits = {
  perUserPerHour: 20,
  globalPerHour: 60,
  globalPerDay: 200,
};

/**
 * Why a claim was refused, or that it was granted. The three refusals are distinguished because
 * they mean different things to whoever reads the log — `user-hour` is one person's own pace,
 * `global-day` is the feature having spent its allowance — even though the route answers all
 * three with the same status.
 */
export type BudgetVerdict = 'allowed' | 'user-hour' | 'global-hour' | 'global-day';

export interface RefreshBudget {
  /**
   * Ask for one upstream call. Records the spend **only** when the answer is `'allowed'`, so a
   * refusal is free and a caller cannot exhaust the budget by being refused.
   */
  claim(userId: string, at: number): BudgetVerdict;
  /** Diagnostics for tests and for a log line; never used to make a decision. */
  spentInDay(at: number): number;
}

/**
 * A fixed-capacity budget over a rolling window, built on timestamp lists rather than on a
 * bucket-per-hour counter.
 *
 * Rolling, not calendar-aligned: a calendar-hour bucket lets 2× the limit through across a
 * boundary (all of hour N's allowance at :59 and all of hour N+1's at :01), and a boundary is
 * precisely when a burst is likeliest — everybody's tab reloads on the hour is not a real pattern,
 * but "the limiter reset" absolutely is once anything retries.
 *
 * Memory is bounded by the limits themselves: the global list never holds more than
 * `globalPerDay` entries, each per-user list never more than `perUserPerHour`, and a user whose
 * entries have all aged out is dropped from the map on the next claim. So the worst case is
 * `globalPerDay` timestamps plus one map entry per user seen in the last hour.
 */
export function createRefreshBudget(limits: RefreshBudgetLimits = REFRESH_BUDGET): RefreshBudget {
  /** Every granted claim in the last day, oldest first. */
  const global: number[] = [];
  /** Per user, every granted claim in the last hour, oldest first. */
  const byUser = new Map<string, number[]>();

  /** Drops everything older than `window` from a sorted-ascending list, in place. */
  function prune(list: number[], at: number, window: number): void {
    const cutoff = at - window;
    let drop = 0;
    while (drop < list.length && (list[drop] as number) <= cutoff) drop += 1;
    if (drop > 0) list.splice(0, drop);
  }

  function pruneAll(at: number): void {
    prune(global, at, DAY_MS);
    for (const [userId, list] of byUser) {
      prune(list, at, HOUR_MS);
      // A user with nothing left in the window is not a user we are tracking. Without this the
      // map grows once per distinct signed-in caller and never shrinks.
      if (list.length === 0) byUser.delete(userId);
    }
  }

  return {
    claim(userId, at) {
      pruneAll(at);

      // Order matters only for which reason is reported: the widest window first, so a log line
      // says "the feature is out of allowance" rather than blaming the one caller who happened to
      // arrive after it ran out.
      if (global.length >= limits.globalPerDay) return 'global-day';

      const inLastHour = global.reduce((n, t) => (t > at - HOUR_MS ? n + 1 : n), 0);
      if (inLastHour >= limits.globalPerHour) return 'global-hour';

      const mine = byUser.get(userId) ?? [];
      if (mine.length >= limits.perUserPerHour) return 'user-hour';

      // `at` is the caller's clock reading, and two claims in the same millisecond are ordinary.
      // Pushing a non-decreasing value keeps both lists sorted, which `prune` depends on.
      global.push(at);
      mine.push(at);
      byUser.set(userId, mine);
      return 'allowed';
    },

    spentInDay(at) {
      prune(global, at, DAY_MS);
      return global.length;
    },
  };
}
