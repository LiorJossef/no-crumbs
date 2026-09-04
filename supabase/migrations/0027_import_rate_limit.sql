-- 0027_import_rate_limit.sql — the per-user and global spend limiter for `/api/imports/*`.
--
-- WHY THIS EXISTS. `domain/errors.ts` has carried `RATE_LIMITED_LOCAL` since MS6, with a comment
-- claiming it is "checked in the route handler before getOrCreateImport" (`07` §7, §5). It is not:
-- there are zero call sites, and neither `/api/imports/probe` nor `/api/imports/confirm` counts
-- anything. One unconfirmed signup plus a loop over distinct TikTok URLs currently drains a day of
-- model budget and a day of Google Places quota in minutes. The taxonomy and the user-facing copy
-- already existed; this file is the mechanism they name.
--
-- ═══ 1. WHY POSTGRES AND NOT MEMORY ═══════════════════════════════════════════════════════════
-- Vercel runs each request in a lambda that may be cold, may be one of many, and shares no memory
-- with its siblings. An in-process Map counts one instance's requests, so under any concurrency it
-- is not a limit, it is a decoration that reports success. Every candidate shared store here is
-- already in the stack or is not: Postgres is (it is the same connection the route already opens
-- for `sources`/`extractions`), Redis/Upstash is not (a new vendor, a new key, a new failure mode,
-- and guardrail 21 forbids me creating the account). Volume settles it: the ceilings below are tens
-- of rows per user per day, which is nothing for a table with two indexes, and the check is one
-- indexed aggregate. Postgres is not a compromise here, it is the correct store.
--
-- ═══ 2. SHAPE: A SLIDING-WINDOW LOG, COUNTED IN UNITS ═════════════════════════════════════════
-- One row per chargeable event, and every rule is `sum(units) over the last N seconds`. Chosen over
-- the two alternatives for reasons that are specific to this product, not aesthetic:
--
--   * a FIXED WINDOW (a counter per calendar day) lets a user spend the whole limit at 23:59 and
--     the whole limit again at 00:01. Against a hard shared quota of 100 Google calls a day, a
--     limiter with a 2x boundary burst is a limiter that does not hold;
--   * a TOKEN BUCKET is the right answer at high volume, and its state (level + last-refill) is
--     cheaper than a log. At 30 events per user per day the log is cheaper to *reason about*: it
--     answers "how much has this user actually spent today" and "who burned the shared quota"
--     directly, from rows, which a bucket cannot. It also lets several windows (10 minutes AND
--     24 hours) be evaluated over the same rows with no extra state.
--
-- UNITS, NOT REQUESTS, and this is the load-bearing decision. Two of the four scopes count external
-- calls, not user actions, because the budgets they protect are denominated in calls:
--
--   import.probe    1 per allowed probe          — a user-action ceiling
--   import.confirm  1 per allowed confirm        — a user-action ceiling
--   import.llm      the LLM calls actually made  — Gemini's 500/day, Anthropic's per-call price
--   import.places   the Google Places calls actually made — Google's 100/day HARD quota
--
-- A probe served entirely from the `sources` + `extractions` caches makes zero external calls and
-- therefore records ZERO units against the money scopes. That is the point: charging a cache hit
-- against the money budget would make the cache — the only thing standing between this project and
-- its 500/day ceiling — look expensive.
--
-- ═══ 3. THE NUMBERS, AND WHERE EACH ONE COMES FROM ════════════════════════════════════════════
-- `public.rate_limit_rules()` below is the single source of truth; this is the argument for it.
--
--   probe_burst        8 / 10 min / user   The copy is "give it a few minutes" (`RATE_LIMITED_LOCAL`,
--                                          UX §5.1), so the short window must be minutes. A person
--                                          pasting links does 2-3 in ten minutes; a loop does 8 and
--                                          stops. Worst case cost of the burst: 8 x $0.0075 = $0.06.
--   probe_daily       30 / 24 h  / user    `06` §6.4 R7 and D11 already propose 30 imports/user/day;
--                                          this adopts that number rather than inventing one. Worst
--                                          case for one compromised account: 30 x $0.0075 = $0.23/day.
--   llm_daily_user    60 / 24 h  / user    = probe_daily x MAX_LLM_CALLS_PER_IMPORT (2, `07` §5).
--   llm_daily_global 400 / 24 h  / all     Gemini is 500 calls/day SHARED with the owner and every
--                                          agent in this repo (`current-state.md` §7). 100 calls are
--                                          left for them; the product may spend 400.
--   places_daily_user 40 / 24 h  / user
--   places_daily_global 80 / 24 h / all    Google Places is **100 calls/day in total, across all
--                                          users** — a hard quota already exhausted once in a single
--                                          night of benchmarking. 20 calls of headroom are reserved
--                                          for the overshoot described in §5.
--   confirm_burst     20 / 10 min / user   Confirm saves work the user has already paid for, so its
--   confirm_daily     60 / 24 h  / user    ceilings are deliberately loose. They exist to bound a
--                                          loop, not to shape behaviour.
--
-- A GLOBAL CEILING IS NOT OPTIONAL, and the task asked whether it is needed: it is the only ceiling
-- that matters. A per-user limit of 30 imports/day permits ONE user to consume every Google call
-- available that day; with the 7-searches-per-import cap in `07` §5 a single user reaches Google's
-- 100 at their fourth import. Any limiter that lets one account exhaust a shared quota has not
-- limited anything, so `places_daily_global` and `llm_daily_global` count across all subjects.
--
-- READ THIS BEFORE DEPLOYING. `places_daily_global = 80` with a 7-call reservation per probe means
-- the product supports roughly **eleven fresh (uncached) imports per day in total, for everybody**
-- while Google Places is capped at 100/day. That is not a limiter bug, it is the quota; the limiter
-- only makes it visible before the money runs out instead of after. Raising the Google quota, or
-- routing production at a resolver that is not quota-capped, is the OWNER's decision — and the
-- follow-up is a three-line migration replacing one row of `rate_limit_rules()`.
--
-- ═══ 4. WHAT COUNTS, WHICH IS THE QUESTION THIS DESIGN ANSWERS ════════════════════════════════
--   a cache-served probe    1 probe unit, 0 llm, 0 places. Bounded by the cheap ceiling, invisible
--                           to the money ceilings. Correct: it cost nothing.
--   a probe that fails      1 probe unit, plus whatever it actually spent before failing. A URL
--   upstream                that always fails at oEmbed costs no money and still stops after 8 in
--                           ten minutes / 30 in a day, because the probe unit is charged for the
--                           ATTEMPT and not for the outcome. This is the "a failing URL is free to
--                           loop" hole, closed without charging money that was never spent.
--   a refused probe         NOTHING. No row is written. A rejection must not extend its own window,
--                           or "give it a few minutes" becomes a permanent lockout for anyone who
--                           retries; and an audit trail of rejections belongs in the app log, not
--                           in the table that decides them.
--   a confirm               1 confirm unit, plus the Place Details calls it actually made. Confirm
--                           is gated ONLY by its own loose ceilings and by the GLOBAL Google
--                           ceiling — never by the caller's own places budget. The user has already
--                           done the work; losing it to a limiter would be the limiter causing the
--                           damage. The global arm stays because a hard external quota does not
--                           care whose work it was.
--
-- ═══ 5. ATOMICITY, AND THE ONE HONEST OVERSHOOT ═══════════════════════════════════════════════
-- Check-then-act across two lambdas is a race: two concurrent probes both read 7 of 8 and both
-- proceed. `import_rate_limit_check` therefore takes `pg_advisory_xact_lock` on the subject before
-- it reads, and a SECOND lock on a fixed key for the global rules, always in that order (global
-- first) so two callers can never deadlock against each other. The global lock serialises import
-- admission across the whole product; at eleven imports a day that is free, and it is what makes a
-- hard shared quota actually hard. The two-argument `(int, int)` lock form is used deliberately: it
-- is a different lock space from the one-argument `bigint` form `resolve_place` uses (0014), so the
-- two can never collide.
--
-- THE OVERSHOOT: admission RESERVES a projected spend (`reserve_units` per rule) but the true spend
-- is recorded afterwards by `import_usage_record`. One import already admitted can therefore push
-- the global counter past the ceiling by at most one import's worth. That is why the global Google
-- ceiling is 80 of 100 and not 100 of 100 — the headroom absorbs exactly this. A design with no
-- overshoot would have to hold a transaction open across the external calls, which is far worse.
--
-- ═══ 6. SECURITY POSTURE — SERVER-ONLY, AND NOT MERELY BY CONVENTION ══════════════════════════
-- A counter a client can read is an oracle; a counter a client can write is not a counter. So:
--
--   * `rate_limit_events` has ENABLE + FORCE ROW LEVEL SECURITY and **no policy at all** — the
--     `place_lookups` posture (0007/0023), which denies every role that does not bypass RLS;
--   * ALL privileges are revoked from `anon`, `authenticated` AND `service_role`. The third one is
--     not a flourish: a `postgres`-owned ALTER DEFAULT PRIVILEGES entry (`service_role=Dxtm`) hands
--     TRUNCATE on every new table in `public` to `service_role`, 0008 revokes only for the two
--     browser roles, and TRUNCATE ignores RLS. 0024 hit this; 0025 fixed 0010's version of it;
--     inventory.sql check 9d is the runtime proof. Without this line the limiter would arrive with
--     a one-statement reset button on it;
--   * consequently NO role holds any privilege on the table. The three functions are therefore
--     SECURITY DEFINER, owned by `postgres`, and EXECUTE is granted to `service_role` alone.
--
-- SECURITY DEFINER, ARGUED AGAINST `security.md` §1 invariant 1 AND `agent-guardrails.md` §5.18
-- RATHER THAN ASSERTED. The guardrail's three disqualifiers are about a definer granted to `anon`
-- or `authenticated`. None of the three applies and neither does the premise:
--   - the grant is to `service_role` only, never to a browser role. `anon` and `authenticated`
--     cannot call these functions at all (asserted in supabase/tests/0027_*, R1);
--   - `service_role` already carries `rolbypassrls` (inventory check 9b), so the definer adds that
--     role no privilege it did not have. What it buys is the ability to keep the TABLE grant at
--     ZERO, which is strictly tighter than 0023's invoker-rights functions: a leaked service key
--     can call these two entry points and cannot SELECT, UPDATE, DELETE or TRUNCATE the counters;
--   - `p_user_id` IS caller-supplied, which is the third disqualifier — but only for a browser
--     caller. The only caller is the trusted server, which reads it from `supabase.auth.getUser()`;
--     this is the identical review rule `apply_saved_place_extraction` already carries (0019), and
--     the route module states it at the parameter.
-- This is NOT a request to widen the one reviewed `authenticated` definer exception (0016).
--
-- FAIL-CLOSED, deliberately. `import_rate_limit_check` INSERTS its attempt row before it reads any
-- counter, and raises if it cannot then see that row. If the grants or RLS on this table were ever
-- broken, the check errors — it does not quietly read zero rows and allow everything. A limiter
-- whose failure mode is "no limit" is the worst possible limiter, and counting first would have had
-- exactly that failure mode.
--
-- ═══ 7. CLEANUP, WITHOUT pg_cron ══════════════════════════════════════════════════════════════
-- MEASURED on the local container: `select name, installed_version from pg_available_extensions
-- where name = 'pg_cron'` -> available 1.6.4, **installed NULL**. It is not enabled here, enabling
-- it on a hosted Supabase project is a dashboard/superuser action rather than a migration, and
-- inventory.sql check 8 is an extension allow-list that would (correctly) fail on a new one. So
-- there is no scheduler and none is taken as a dependency. Old rows are pruned opportunistically
-- inside both functions, bounded to `c_prune_batch` rows per call, riding the `occurred_at` index —
-- the same pattern `place_lookup_put` (0023) uses. Retention is 3 days: one day longer than the
-- longest window (24 h) plus slack, so "who spent the quota yesterday" is still answerable.
--
-- Forward-only (`08` §9). Nothing at or below 0026 is edited.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE TABLE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- One row per chargeable event. Deliberately NOT one row per (user, window): a log answers every
-- window length from the same rows, and answers "who" as well as "how many".
create table public.rate_limit_events (
  id bigint generated always as identity primary key,

  -- The budget this event spends. A closed list, checked in the database rather than in TypeScript,
  -- because a typo in a scope name would otherwise create a brand-new budget with no rules attached
  -- to it — i.e. it would silently disable the limit it was supposed to charge.
  scope text not null check (scope in (
    'import.probe',     -- one allowed probe (a user action; says nothing about money spent)
    'import.confirm',   -- one allowed confirm
    'import.llm',       -- N LLM calls actually issued
    'import.places'     -- N Google Places API calls actually issued
  )),

  -- Nullable, ON DELETE SET NULL, and both halves are deliberate. Erasing an account (GDPR Art. 17)
  -- must remove the identity from these rows but must NOT remove the fact that the shared quota was
  -- spent — a cascade delete would hand a deleted account's share of Google's 100/day back to
  -- everybody else, which is a way to reset the global ceiling. A de-identified row still counts
  -- against every global rule and matches no per-user rule, which is exactly right.
  subject_id uuid references public.profiles (id) on delete set null,

  -- How much of the budget. 1 for a user action; the real call count for a money scope. `> 0`
  -- because a zero-unit row is a row that costs a read and decides nothing.
  units integer not null check (units > 0),

  -- Server clock only. There is no client-supplied timestamp anywhere in this design; a limiter
  -- whose window is measured by the caller is not a limiter.
  occurred_at timestamptz not null default now()
);

-- The per-user rules: one subject, one scope, a time range. Leads on subject_id because every
-- per-user rule filters it to a single value.
create index rate_limit_events_subject_idx
  on public.rate_limit_events (subject_id, scope, occurred_at desc);
-- The global rules: one scope, a time range, every subject. The per-user index cannot serve this —
-- its leading column is unconstrained — and these are the rules protecting the hard quota.
create index rate_limit_events_scope_idx
  on public.rate_limit_events (scope, occurred_at desc);
-- The retention sweep, which is a range scan on occurred_at alone and nothing else.
create index rate_limit_events_prune_idx on public.rate_limit_events (occurred_at);

alter table public.rate_limit_events enable row level security;
alter table public.rate_limit_events force  row level security;
-- No policy is created, on purpose (the place_lookups posture, 0007). ENABLE+FORCE with zero
-- policies denies every role that does not carry rolbypassrls, which is every role except
-- `postgres` and `service_role`.
--
-- `service_role` IS named in the revoke, and that is the 0024/0025 lesson: the postgres-owned
-- ALTER DEFAULT PRIVILEGES entry `service_role=Dxtm` would otherwise leave TRUNCATE — which ignores
-- RLS — on the table that decides whether anyone may spend money.
revoke all on public.rate_limit_events from anon, authenticated, service_role;

comment on table public.rate_limit_events is
  'Sliding-window usage log behind the import rate limiter (0027). Server-only: no grants, no '
  'policies, reachable exclusively through import_rate_limit_check / import_usage_record.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. THE RULES
--    A function rather than a table, on purpose. A rules TABLE is state that drifts between local,
--    staging and production and can be edited from a dashboard with no diff and no review; these
--    numbers protect a money budget, so changing one should be a migration somebody reads. As a
--    set-returning function it is also readable by the test suite, which asserts the exact numbers —
--    a silent widening of a limit is then a failing test rather than a bigger bill.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.rate_limit_rules()
returns table (
  action        text,     -- 'probe' | 'confirm': which entry point this rule guards
  rule          text,     -- the name reported to the caller when this rule is the binding one
  scope         text,     -- which budget it counts
  subject_kind  text,     -- 'user' (this caller's rows) | 'global' (everyone's rows)
  window_secs   integer,  -- the sliding window
  max_units     integer,  -- the ceiling
  reserve_units integer   -- units this action is PROJECTED to add to `scope` (see the header, §5)
)
language sql
immutable
set search_path = public, pg_temp
as $fn$
  -- reserve_units is 0 where the action's own event row is already counted in `scope`, and the
  -- worst-case projected spend where it is not: MAX_LLM_CALLS_PER_IMPORT = 2 and
  -- MAX_PROVIDER_REQUESTS_PER_IMPORT = 7 for a probe (`07` §5), and the Place Details lookups a
  -- confirm makes for the candidates the user actually selected.
  values
    -- ── probe ────────────────────────────────────────────────────────────────────────────────
    ('probe',   'probe_burst',         'import.probe',   'user',      600,   8, 0),
    ('probe',   'probe_daily',         'import.probe',   'user',    86400,  30, 0),
    ('probe',   'llm_daily_user',      'import.llm',     'user',    86400,  60, 2),
    ('probe',   'llm_daily_global',    'import.llm',     'global',  86400, 400, 2),
    ('probe',   'places_daily_user',   'import.places',  'user',    86400,  40, 7),
    ('probe',   'places_daily_global', 'import.places',  'global',  86400,  80, 7),
    -- ── confirm ──────────────────────────────────────────────────────────────────────────────
    -- No per-user places arm: the caller already paid for those searches at probe time, and
    -- refusing to SAVE work that has already been done is the limiter causing the damage it exists
    -- to prevent. The global arm stays, because Google's quota does not care whose work it was.
    ('confirm', 'confirm_burst',       'import.confirm', 'user',      600,  20, 0),
    ('confirm', 'confirm_daily',       'import.confirm', 'user',    86400,  60, 0),
    ('confirm', 'places_daily_global', 'import.places',  'global',  86400,  80, 2)
$fn$;

comment on function public.rate_limit_rules() is
  'The import limiter''s rule set (0027), single source of truth. Granted to no role: it is read '
  'by import_rate_limit_check, which runs as the owner. See the migration header for each number.';

-- Granted to nobody at all. It is called only from inside a definer function running as `postgres`
-- (the owner), which needs no EXECUTE grant, and it is the schedule of exactly how much abuse is
-- possible before the door shuts — not something a browser role should be able to read.
revoke all on function public.rate_limit_rules() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. ADMISSION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Returns a decision object. It does NOT raise on refusal: a refusal is a normal product outcome
-- (`RATE_LIMITED_LOCAL`) and the caller needs the retry-after and the rule name to render it, which
-- a SQLSTATE cannot carry. It DOES raise on a malformed call or on a broken authorisation surface —
-- the two cases where continuing would mean allowing everything.
--
--   { "allowed": true,  "action": "probe", "rule": null, "subject_kind": null,
--     "retry_after_seconds": null, "limit": null, "used": null }
--   { "allowed": false, "action": "probe", "rule": "places_daily_global", "subject_kind": "global",
--     "retry_after_seconds": 41230, "limit": 80, "used": 80 }
--
-- `subject_kind` is in the payload because the two refusals are different products. 'user' means
-- "you have done this a lot" and the existing copy fits. 'global' means "the product is out of
-- quota for today", the caller did nothing wrong, and `retry_after_seconds` can be many hours —
-- "give it a few minutes" would be a lie. The route layer owns that copy decision.
create or replace function public.import_rate_limit_check(p_user_id uuid, p_action text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  -- The advisory-lock class. The two-argument (int, int) form is a DIFFERENT lock space from the
  -- one-argument bigint form resolve_place uses (0014), so no key here can ever collide with one
  -- there. 27 is this migration's number: unique by construction within that space.
  c_lock_class   constant integer := 27;
  -- objid for the single global lock. Any constant works; 0 is the one that cannot be mistaken for
  -- a hashed user id.
  c_global_lock  constant integer := 0;
  c_prune_batch  constant integer := 100;
  c_retention    constant interval := interval '3 days';

  v_scope        text;
  v_event_id     bigint;
  v_own_units    integer;
  r              record;
  v_used         integer;
  v_need         integer;
  v_oldest       timestamptz;
  v_retry        integer;
  -- The binding refusal: the violated rule that frees up LAST. Reporting any other one would tell
  -- the caller to come back at a time when they would simply be refused again.
  v_worst_rule   text := null;
  v_worst_kind   text := null;
  v_worst_limit  integer := null;
  v_worst_used   integer := null;
  v_worst_retry  integer := null;
begin
  if p_user_id is null then
    raise exception 'import_rate_limit_check: p_user_id is required'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_action is null or p_action not in ('probe', 'confirm') then
    raise exception 'import_rate_limit_check: p_action must be probe or confirm (got %)',
      coalesce(p_action, 'null') using errcode = 'invalid_parameter_value';
  end if;

  v_scope := 'import.' || p_action;

  -- Serialise. Global lock FIRST and always, then the per-subject one — a fixed order is what makes
  -- deadlock between two concurrent callers impossible. Both are transaction-scoped and are
  -- released when this RPC's transaction ends, microseconds later; nothing external is awaited
  -- while they are held.
  perform pg_advisory_xact_lock(c_lock_class, c_global_lock);
  perform pg_advisory_xact_lock(c_lock_class, hashtext(p_user_id::text));

  -- Write BEFORE reading, and it is not an optimisation. This insert is the proof that the
  -- authorisation surface on this table is intact: if a future migration dropped the definer, broke
  -- the ownership or added a restrictive policy, this statement fails loudly. Counting first would
  -- instead have returned "0 units used" and admitted everything, silently, forever.
  insert into public.rate_limit_events (scope, subject_id, units)
  values (v_scope, p_user_id, 1)
  returning id into v_event_id;

  select coalesce(sum(units), 0) into v_own_units
    from public.rate_limit_events
   where id = v_event_id;
  if v_own_units <> 1 then
    raise exception
      'import_rate_limit_check: cannot read back the row it just wrote — the limiter is not '
      'enforcing anything. Refusing to fail open.'
      using errcode = 'insufficient_privilege';
  end if;

  for r in select * from public.rate_limit_rules() where action = p_action loop
    select coalesce(sum(e.units), 0) into v_used
      from public.rate_limit_events e
     where e.scope = r.scope
       and e.occurred_at > now() - make_interval(secs => r.window_secs)
       -- 'global' counts every subject, INCLUDING the rows whose subject was erased. See the
       -- comment on subject_id: erasure must not refund the shared quota.
       and (r.subject_kind = 'global' or e.subject_id = p_user_id);

    -- `used` already includes this attempt's own row where the rule counts the attempt's scope
    -- (reserve_units = 0 there); it does not where the rule counts a money scope, which is what
    -- reserve_units projects. One comparison covers both.
    v_need := v_used + r.reserve_units - r.max_units;
    if v_need > 0 then
      -- How long until enough units age out of the window for this call to fit? Walk the window
      -- oldest-first and find the event whose expiry sheds `v_need` units; when THAT row leaves the
      -- window, the rule admits the call. Exact rather than "wait one window", which would
      -- over-punish, and never optimistic, which would send the caller back to be refused again.
      select min(w.occurred_at) into v_oldest
        from (
          select e.occurred_at,
                 sum(e.units) over (order by e.occurred_at, e.id) as cum
            from public.rate_limit_events e
           where e.scope = r.scope
             and e.occurred_at > now() - make_interval(secs => r.window_secs)
             and (r.subject_kind = 'global' or e.subject_id = p_user_id)
        ) w
       where w.cum >= v_need;

      v_retry := case
                   when v_oldest is null then r.window_secs
                   else greatest(
                     1,
                     ceil(extract(epoch from
                       (v_oldest + make_interval(secs => r.window_secs)) - now()))::integer)
                 end;

      if v_worst_retry is null or v_retry > v_worst_retry then
        v_worst_rule  := r.rule;
        v_worst_kind  := r.subject_kind;
        v_worst_limit := r.max_units;
        -- Reported WITHOUT this attempt's own row, because that row is about to be deleted. The
        -- caller renders "used N of M"; `9 of 8` would be a number that is true of nothing once
        -- the refusal has been written back out.
        v_worst_used  := v_used - (case when r.reserve_units = 0 then 1 else 0 end);
        v_worst_retry := v_retry;
      end if;
    end if;
  end loop;

  if v_worst_rule is not null then
    -- A refusal writes nothing. See the header, §4: a rejection that extends its own window turns
    -- "give it a few minutes" into a permanent lockout for anyone who retries, and the audit trail
    -- for refusals belongs in the application log.
    delete from public.rate_limit_events where id = v_event_id;

    return jsonb_build_object(
      'allowed', false,
      'action', p_action,
      'rule', v_worst_rule,
      'subject_kind', v_worst_kind,
      'retry_after_seconds', v_worst_retry,
      'limit', v_worst_limit,
      'used', v_worst_used
    );
  end if;

  -- Opportunistic, bounded retention sweep. On the `occurred_at` index; finds nothing on almost
  -- every call and can never turn an admission check into a long transaction.
  delete from public.rate_limit_events
   where id in (select id from public.rate_limit_events
                 where occurred_at < now() - c_retention
                 limit c_prune_batch);

  return jsonb_build_object(
    'allowed', true,
    'action', p_action,
    'rule', null,
    'subject_kind', null,
    'retry_after_seconds', null,
    'limit', null,
    'used', null
  );
end $fn$;

comment on function public.import_rate_limit_check(uuid, text) is
  'Import limiter admission (0027). Records the attempt and returns a jsonb decision '
  '{allowed, action, rule, subject_kind, retry_after_seconds, limit, used}. A refusal records '
  'nothing. Raises rather than failing open if the counter table is unreadable. service_role only; '
  'p_user_id MUST come from a verified server-side session.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. ACCOUNTING
--    What the request ACTUALLY spent, recorded after the fact. Never a gate — the money is already
--    gone by the time this is called; it is what the NEXT admission check reads.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.import_usage_record(
  p_user_id     uuid,
  p_llm_calls   integer,
  p_place_calls integer
) returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  c_prune_batch constant integer := 100;
  c_retention   constant interval := interval '3 days';
begin
  if p_user_id is null then
    raise exception 'import_usage_record: p_user_id is required'
      using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_llm_calls, 0) < 0 or coalesce(p_place_calls, 0) < 0 then
    raise exception 'import_usage_record: call counts must not be negative (llm=%, places=%)',
      p_llm_calls, p_place_calls using errcode = 'invalid_parameter_value';
  end if;

  -- Zero is the common, correct case — a probe answered from the `sources` + `extractions` caches
  -- spends no money — and it writes no row. Recording a zero would put rows in the table that
  -- change no decision, and would make "did this import cost anything" unanswerable from the data.
  if coalesce(p_llm_calls, 0) > 0 then
    insert into public.rate_limit_events (scope, subject_id, units)
    values ('import.llm', p_user_id, p_llm_calls);
  end if;

  if coalesce(p_place_calls, 0) > 0 then
    insert into public.rate_limit_events (scope, subject_id, units)
    values ('import.places', p_user_id, p_place_calls);
  end if;

  delete from public.rate_limit_events
   where id in (select id from public.rate_limit_events
                 where occurred_at < now() - c_retention
                 limit c_prune_batch);
end $fn$;

comment on function public.import_usage_record(uuid, integer, integer) is
  'Records what an import actually spent (0027): LLM calls and Google Places calls. Zero writes no '
  'row. Not a gate — it is what the next import_rate_limit_check reads. service_role only.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. GRANTS
--    Total revoke, then hand back exactly one role — the 0007/0009/0018/0023 shape. `revoke ...
--    from public` is the load-bearing half: Postgres grants EXECUTE on every newly created function
--    to PUBLIC, and `revoke ... from anon` does NOT remove a privilege held through PUBLIC. That is
--    0009's bug, reintroduced by 0017 and closed again by 0018 — twice, which is why it is written
--    out here rather than assumed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
revoke all on function public.import_rate_limit_check(uuid, text)
  from public, anon, authenticated;
revoke all on function public.import_usage_record(uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.import_rate_limit_check(uuid, text)             to service_role;
grant execute on function public.import_usage_record(uuid, integer, integer)     to service_role;
-- rate_limit_rules() is granted to NO role, including service_role: nothing outside the definer
-- needs it, and the numbers it returns are the schedule of how much abuse is possible.

commit;
