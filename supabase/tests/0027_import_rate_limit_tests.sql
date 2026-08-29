-- 0027_import_rate_limit_tests.sql — the authorisation and behaviour proof for the import limiter.
--
-- Same posture as 0008_policy_tests.sql and 0024_collections_policy_tests.sql: this file creates
-- fixture users in auth.users, so it is a TEST and never a migration. Everything happens inside one
-- transaction that is rolled back at the end; nothing survives and production never sees it.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0027_import_rate_limit_tests.sql
-- or:   npm run db:test:0027
-- It must be run by a role that can insert into auth.users (postgres locally / in CI).
--
-- COUNTS NOTHING GLOBAL THAT IT DID NOT MEASURE FIRST. Two of `0027`'s rules aggregate across every
-- user by design, so a naive "insert 74 units and expect a refusal" would pass on an empty database
-- and fail on the container the app is actually developed on. R9/R10 read the live global total
-- first and top it up to the number they need. Everything else is scoped to fixture users by id.
-- That is not tidiness: the point of these tests is to run against the working local container
-- without a `supabase db reset`, because a reset throws away cached `extractions` rows that cost
-- real model calls against a daily ceiling.
--
-- SHAPE OF THE FILE
--   R0   fixtures.
--   R1   the grant posture: no browser role can execute any of the three functions, and the rules
--        function is executable by NOBODY. 0009's/0018's PUBLIC-EXECUTE bug, asked again.
--   R2   no role holds any privilege on the table itself — including the TRUNCATE that the
--        postgres-owned ALTER DEFAULT PRIVILEGES entry hands to service_role (0024/0025, check 9d).
--   R3   RLS enabled AND forced, with zero policies: the deny-all posture.
--   R4   THE CROSS-USER READ ATTEMPT. anon and authenticated try to read, write and reset another
--        user's counter, four ways, and are refused by the database.
--   R5   the configured limits are exactly the designed numbers. A silent widening is a failing
--        test, not a bigger bill.
--   R6   the burst rule admits 8 and refuses the 9th.
--   R7   a refusal writes NOTHING, so hammering does not extend the block.
--   R8   a cache hit records nothing against the money scopes.
--   R9   THE GLOBAL CEILING. A user who has spent nothing is refused because somebody else
--        exhausted the shared Google quota. This is the assertion that separates a real limit from
--        a per-user limit that lets one account drain the day's budget.
--   R10  confirm is NOT gated by the caller's own places budget, and IS gated by the global one.
--   R11  retry_after_seconds is exact, computed from when units actually age out of the window.
--        Ordered BEFORE R9 in the file, deliberately: R9 pushes the shared Google total to 79/80,
--        after which every probe is refused by the global rule and R11 would be measuring that
--        rule's 24-hour wait rather than the burst rule's arithmetic.
--   R12  erasing an account de-identifies its rows without refunding the shared quota.
--   R13  FAIL-CLOSED: if the limiter cannot write its counter it raises. It never reads zero and
--        allows everything. Last, because it installs a trigger that breaks every later assertion.
--
-- FAILURE-FIRST. The sabotage runs are recorded in the task report; the controls that were removed
-- one at a time and seen to make a named assertion FAIL are R1, R2, R4, R5, R6 and R9.

begin;

-- ══ R0: fixtures ═════════════════════════════════════════════════════════════════════════════
-- Three users. C is the one that matters in R9: it spends nothing and is refused anyway.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000027', 'rl-a@example.test'),
  ('b0000000-0000-4000-8000-000000000027', 'rl-b@example.test'),
  ('c0000000-0000-4000-8000-000000000027', 'rl-c@example.test');

do $$
begin
  if (select count(*) from public.profiles
       where id in ('a0000000-0000-4000-8000-000000000027',
                    'b0000000-0000-4000-8000-000000000027',
                    'c0000000-0000-4000-8000-000000000027')) <> 3 then
    raise exception 'FAIL R0: handle_new_user did not create a profile per fixture user';
  end if;
  raise notice 'PASS R0  three fixture users with profiles';
end $$;

-- ══ R1: the grant posture ════════════════════════════════════════════════════════════════════
-- Postgres grants EXECUTE on every NEWLY CREATED function to PUBLIC, and a later
-- `revoke ... from anon` does NOT remove a privilege held through PUBLIC. That is 0009's bug,
-- reintroduced by 0017 and closed again by 0018 — it has regressed twice, so it is asked a fourth
-- time here. A reachable entry point would be a live path to the table that decides whether anyone
-- may spend money.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig, g.rolname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated'), ('public')) as g(rolname)
     where n.nspname = 'public'
       and p.proname in ('import_rate_limit_check', 'import_usage_record', 'rate_limit_rules')
       and has_function_privilege(g.rolname, p.oid, 'execute')
  loop
    raise exception 'FAIL R1: % holds EXECUTE on % (0009/0018''s PUBLIC-EXECUTE bug, again)',
      r.rolname, r.sig;
  end loop;

  -- The rules function is granted to NOBODY, service_role included: it is the schedule of exactly
  -- how much abuse is possible before the door shuts, and nothing outside the definer reads it.
  if has_function_privilege('service_role', 'public.rate_limit_rules()', 'execute') then
    raise exception 'FAIL R1: service_role can execute rate_limit_rules(); it is granted to nobody';
  end if;

  -- The positive half. Without it this section passes just as well against a migration that granted
  -- EXECUTE to no one at all, i.e. against a limiter the server cannot call.
  if not has_function_privilege('service_role', 'public.import_rate_limit_check(uuid, text)', 'execute')
     or not has_function_privilege('service_role',
            'public.import_usage_record(uuid, integer, integer)', 'execute') then
    raise exception 'FAIL R1: service_role cannot execute the limiter entry points';
  end if;
  raise notice 'PASS R1  only service_role can execute the two entry points; rate_limit_rules is executable by nobody';
end $$;

-- ══ R2: the table itself is granted to no one ════════════════════════════════════════════════
-- service_role is included deliberately. A postgres-owned ALTER DEFAULT PRIVILEGES entry
-- (`service_role=Dxtm`) hands TRUNCATE on every new table in `public` to service_role, 0008 revokes
-- only for the two browser roles, and TRUNCATE ignores RLS entirely — so without 0027's explicit
-- revoke this table would have arrived with a one-statement reset button on it. 0024 hit exactly
-- this; inventory.sql check 9d is the schema-wide version of the same assertion.
do $$
declare r record;
begin
  for r in
    select g.rolname, p.priv
      from (values ('anon'), ('authenticated'), ('service_role')) as g(rolname)
      cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) as p(priv)
     where has_table_privilege(g.rolname, 'public.rate_limit_events', p.priv)
  loop
    raise exception
      'FAIL R2: % holds % on rate_limit_events. The counters are reachable only through the two '
      'SECURITY DEFINER entry points; a direct grant is a way to read, inflate or reset them.',
      r.rolname, r.priv;
  end loop;
  raise notice 'PASS R2  no role holds any privilege on rate_limit_events, service_role and TRUNCATE included';
end $$;

-- ══ R3: deny-all RLS ═════════════════════════════════════════════════════════════════════════
do $$
declare v_enabled boolean; v_forced boolean; v_policies integer;
begin
  select c.relrowsecurity, c.relforcerowsecurity into v_enabled, v_forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'rate_limit_events';
  if not coalesce(v_enabled, false) or not coalesce(v_forced, false) then
    raise exception 'FAIL R3: rate_limit_events RLS enabled=% forced=%', v_enabled, v_forced;
  end if;
  select count(*) into v_policies from pg_policies
   where schemaname = 'public' and tablename = 'rate_limit_events';
  if v_policies <> 0 then
    raise exception
      'FAIL R3: rate_limit_events has % polic(ies). It is designed to have none — a policy here '
      'would be a row a client can see, and a counter a client can see is an oracle.', v_policies;
  end if;
  raise notice 'PASS R3  rate_limit_events: RLS enabled and forced, zero policies (the place_lookups posture)';
end $$;

-- ══ R4: the cross-user read, write and reset, attempted for real ═════════════════════════════
-- Not a grant inspection — an actual attempt, as the roles a browser can reach, against a counter
-- belonging to somebody else. Each of the four must be refused BY THE DATABASE (42501), not by any
-- decision made in TypeScript.
do $$
declare v_state text;
begin
  -- Seed one row to read, so a refusal cannot be mistaken for an empty table.
  insert into public.rate_limit_events (scope, subject_id, units)
  values ('import.probe', 'a0000000-0000-4000-8000-000000000027', 1);

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-000000000027","role":"authenticated"}';

  begin
    perform 1 from public.rate_limit_events;
    raise exception 'FAIL R4a: authenticated could SELECT another user''s counters';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.rate_limit_events (scope, subject_id, units)
    values ('import.probe', 'b0000000-0000-4000-8000-000000000027', -1);
    raise exception 'FAIL R4b: authenticated could INSERT a counter row (deflating its own usage)';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.rate_limit_events
     where subject_id = 'b0000000-0000-4000-8000-000000000027';
    raise exception 'FAIL R4c: authenticated could DELETE counter rows (resetting its own limit)';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.import_rate_limit_check('a0000000-0000-4000-8000-000000000027', 'probe');
    raise exception 'FAIL R4d: authenticated could call import_rate_limit_check for another user';
  exception when insufficient_privilege then null;
  end;

  reset role;

  set local role anon;
  begin
    perform 1 from public.rate_limit_events;
    raise exception 'FAIL R4e: anon could SELECT the counters';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.import_usage_record('a0000000-0000-4000-8000-000000000027', 99, 99);
    raise exception 'FAIL R4f: anon could call import_usage_record';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- The positive half, and it is not decoration: without it every refusal above is also satisfied
  -- by a schema in which the limiter does not work for anyone either.
  set local role service_role;
  v_state := public.import_rate_limit_check('a0000000-0000-4000-8000-000000000027', 'probe')
               ->> 'allowed';
  reset role;
  if v_state is distinct from 'true' then
    raise exception 'FAIL R4: service_role could not obtain a decision (got %)', v_state;
  end if;

  raise notice 'PASS R4  anon and authenticated cannot read, write, delete or reset a counter, or call either entry point; service_role can';
end $$;

-- ══ R5: the limits are the designed ones ═════════════════════════════════════════════════════
-- The one assertion here that is about money rather than about authorisation. `places_daily_global`
-- is 80 because Google Places is a HARD 100 calls/day shared by every user, with 20 reserved for
-- the admission overshoot 0027 §5 describes. Raising any of these is a decision somebody should
-- have to make in a migration, on purpose, and defend — not something that drifts.
do $$
declare v text;
begin
  with expected(action, rule, scope, subject_kind, window_secs, max_units, reserve_units) as (values
    ('probe',   'probe_burst',         'import.probe',   'user',      600,   8, 0),
    ('probe',   'probe_daily',         'import.probe',   'user',    86400,  30, 0),
    ('probe',   'llm_daily_user',      'import.llm',     'user',    86400,  60, 2),
    ('probe',   'llm_daily_global',    'import.llm',     'global',  86400, 400, 2),
    ('probe',   'places_daily_user',   'import.places',  'user',    86400,  40, 7),
    ('probe',   'places_daily_global', 'import.places',  'global',  86400,  80, 7),
    ('confirm', 'confirm_burst',       'import.confirm', 'user',      600,  20, 0),
    ('confirm', 'confirm_daily',       'import.confirm', 'user',    86400,  60, 0),
    ('confirm', 'places_daily_global', 'import.places',  'global',  86400,  80, 2)
  ), actual as (select * from public.rate_limit_rules())
  select string_agg(msg, '; ' order by msg) into v from (
    select format('UNEXPECTED %s/%s (%s %s %ss max %s reserve %s)',
                  a.action, a.rule, a.scope, a.subject_kind, a.window_secs, a.max_units,
                  a.reserve_units) msg
      from actual a left join expected e
        on e.action = a.action and e.rule = a.rule
       and e.scope = a.scope and e.subject_kind = a.subject_kind
       and e.window_secs = a.window_secs and e.max_units = a.max_units
       and e.reserve_units = a.reserve_units
     where e.rule is null
    union all
    select format('MISSING %s/%s (%s %s %ss max %s reserve %s)',
                  e.action, e.rule, e.scope, e.subject_kind, e.window_secs, e.max_units,
                  e.reserve_units)
      from expected e left join actual a
        on a.action = e.action and a.rule = e.rule
       and a.scope = e.scope and a.subject_kind = e.subject_kind
       and a.window_secs = e.window_secs and a.max_units = e.max_units
       and a.reserve_units = e.reserve_units
     where a.rule is null
  ) d;
  if v is not null then
    raise exception
      'FAIL R5: the limiter''s rules are not the designed ones: %. Every number is argued in '
      '0027''s header against a real budget; a change here is a change to how much one account '
      'can spend in a day.', v;
  end if;
  raise notice 'PASS R5  all nine rules match the designed windows, ceilings and reservations exactly';
end $$;

-- ══ R6: the burst rule ═══════════════════════════════════════════════════════════════════════
do $$
declare v_allowed integer := 0; v_d jsonb; i integer;
begin
  -- User B is untouched so far, so its probe window starts empty.
  for i in 1..8 loop
    if (public.import_rate_limit_check('b0000000-0000-4000-8000-000000000027', 'probe')
          ->> 'allowed')::boolean then
      v_allowed := v_allowed + 1;
    end if;
  end loop;
  if v_allowed <> 8 then
    raise exception 'FAIL R6: only % of the first 8 probes were admitted', v_allowed;
  end if;

  v_d := public.import_rate_limit_check('b0000000-0000-4000-8000-000000000027', 'probe');
  if (v_d ->> 'allowed')::boolean then
    raise exception 'FAIL R6: the 9th probe in ten minutes was admitted (probe_burst is 8)';
  end if;
  if v_d ->> 'rule' <> 'probe_burst' or (v_d ->> 'limit')::integer <> 8
     or (v_d ->> 'used')::integer <> 8 or v_d ->> 'subject_kind' <> 'user' then
    raise exception 'FAIL R6: the refusal does not name probe_burst correctly: %', v_d;
  end if;
  raise notice 'PASS R6  eight probes admitted in ten minutes, the ninth refused by probe_burst';
end $$;

-- ══ R7: a refusal writes nothing ═════════════════════════════════════════════════════════════
-- The property that keeps "give it a few minutes" honest. With a sliding window, charging a
-- rejected request would push the window forward on every retry, so a user who retries — which is
-- what a person does when told to wait — would be locked out indefinitely.
do $$
declare v_before integer; v_after integer;
begin
  select count(*) into v_before from public.rate_limit_events
   where subject_id = 'b0000000-0000-4000-8000-000000000027' and scope = 'import.probe';
  perform public.import_rate_limit_check('b0000000-0000-4000-8000-000000000027', 'probe')
     from generate_series(1, 5);
  select count(*) into v_after from public.rate_limit_events
   where subject_id = 'b0000000-0000-4000-8000-000000000027' and scope = 'import.probe';
  if v_after <> v_before then
    raise exception
      'FAIL R7: five refused probes added % row(s). A refusal that extends its own window turns a '
      'ten-minute wait into a permanent lockout for anyone who retries.', v_after - v_before;
  end if;
  raise notice 'PASS R7  five refused probes wrote nothing; hammering does not extend the block';
end $$;

-- ══ R8: a cache hit is free ══════════════════════════════════════════════════════════════════
do $$
declare v_before integer; v_after integer;
begin
  select count(*) into v_before from public.rate_limit_events
   where scope in ('import.llm', 'import.places');
  perform public.import_usage_record('b0000000-0000-4000-8000-000000000027', 0, 0);
  select count(*) into v_after from public.rate_limit_events
   where scope in ('import.llm', 'import.places');
  if v_after <> v_before then
    raise exception 'FAIL R8: a zero-call import wrote % money row(s)', v_after - v_before;
  end if;

  -- The positive half: a real spend IS recorded, or R8 is satisfied by a function that records
  -- nothing ever.
  perform public.import_usage_record('b0000000-0000-4000-8000-000000000027', 1, 3);
  if (select coalesce(sum(units), 0) from public.rate_limit_events
       where subject_id = 'b0000000-0000-4000-8000-000000000027' and scope = 'import.places') <> 3 then
    raise exception 'FAIL R8: a real spend of 3 Google calls was not recorded';
  end if;
  raise notice 'PASS R8  a cache hit records nothing against the money scopes; a real spend records exactly what it spent';
end $$;

-- ══ R11: retry_after_seconds is exact ════════════════════════════════════════════════════════
-- Computed from when units actually age out of the window, not "wait one window". Over-punishing
-- and under-promising are both wrong: the first makes the copy a lie in one direction, the second
-- sends the caller straight back to another refusal.
do $$
declare v_d jsonb; v_retry integer;
begin
  -- Eight probes for user A, all backdated 400 seconds. The window is 600, so the oldest leaves in
  -- 200 seconds and the ninth probe is admissible then — not in 600.
  insert into public.rate_limit_events (scope, subject_id, units, occurred_at)
  select 'import.probe', 'a0000000-0000-4000-8000-000000000027', 1, now() - interval '400 seconds'
    from generate_series(1, 8);

  v_d := public.import_rate_limit_check('a0000000-0000-4000-8000-000000000027', 'probe');
  if (v_d ->> 'allowed')::boolean then
    raise exception 'FAIL R11: the ninth probe was admitted';
  end if;
  -- Named, because the binding rule is the one that frees up LAST and a globally-blocked database
  -- would put a 24-hour wait here that has nothing to do with the arithmetic under test.
  if v_d ->> 'rule' <> 'probe_burst' then
    raise exception
      'FAIL R11: the refusal names % rather than probe_burst, so the retry-after below would be '
      'measuring the wrong rule. Is this database already at its global ceiling?', v_d ->> 'rule';
  end if;
  v_retry := (v_d ->> 'retry_after_seconds')::integer;
  -- Allow one second of clock slack; anything near 600 means the arithmetic degenerated to
  -- "wait a whole window".
  if v_retry < 199 or v_retry > 201 then
    raise exception
      'FAIL R11: retry_after_seconds is %, expected ~200 (the oldest of eight events is 400s into a '
      '600s window). A limiter that always answers "one window" over-punishes every caller.', v_retry;
  end if;
  raise notice 'PASS R11 retry_after_seconds is % — measured from when units actually age out, not rounded up to the window', v_retry;
end $$;

-- ══ R9: THE GLOBAL CEILING ═══════════════════════════════════════════════════════════════════
-- The assertion this whole design turns on. User B burns the shared Google quota; user C, who has
-- spent nothing at all, must be refused — by `places_daily_global` specifically, not by one of its
-- own per-user rules. A limiter that permits one account to exhaust a quota shared by everybody has
-- not limited anything.
--
-- Reads the LIVE global total first and tops it up, so this runs correctly on a container that
-- already has real usage in it.
do $$
declare v_base integer; v_top_up integer; v_d jsonb;
begin
  select coalesce(sum(units), 0) into v_base from public.rate_limit_events
   where scope = 'import.places' and occurred_at > now() - interval '1 day';
  -- 74 is the smallest total at which a probe (which reserves 7) breaches the ceiling of 80.
  v_top_up := 74 - v_base;
  if v_top_up > 0 then
    perform public.import_usage_record('b0000000-0000-4000-8000-000000000027', 0, v_top_up);
  end if;

  v_d := public.import_rate_limit_check('c0000000-0000-4000-8000-000000000027', 'probe');
  if (v_d ->> 'allowed')::boolean then
    raise exception
      'FAIL R9: a user who has spent NOTHING was admitted while the shared Google quota was at 74 '
      'of 80. One account can exhaust the day''s quota for everybody: %', v_d;
  end if;
  if v_d ->> 'rule' <> 'places_daily_global' or v_d ->> 'subject_kind' <> 'global' then
    raise exception
      'FAIL R9: refused, but by % (%) rather than by the global ceiling — so this test would still '
      'pass with the global rule deleted', v_d ->> 'rule', v_d ->> 'subject_kind';
  end if;
  raise notice 'PASS R9  the global Google ceiling refuses a user who spent nothing; one account cannot drain the shared quota';
end $$;

-- ══ R10: confirm is gated differently, on purpose ════════════════════════════════════════════
-- A confirm saves work the user has already paid for. Refusing it because THEY have searched a lot
-- today would be the limiter destroying the thing it exists to protect, so `confirm` has no
-- per-user places arm. It keeps the global arm, because a hard external quota does not care whose
-- work it was.
do $$
declare v_d jsonb;
begin
  -- B is well past places_daily_user (40) at this point, and a probe would be refused for that
  -- reason alone. A confirm must not be.
  v_d := public.import_rate_limit_check('b0000000-0000-4000-8000-000000000027', 'confirm');
  if not (v_d ->> 'allowed')::boolean then
    raise exception
      'FAIL R10a: a confirm was refused at a global total of 74/80 (reserve 2). The user would lose '
      'work they have already paid for: %', v_d;
  end if;

  -- Push the shared quota to 79: now even a confirm's 2-call reservation does not fit.
  perform public.import_usage_record('b0000000-0000-4000-8000-000000000027', 0, 5);
  v_d := public.import_rate_limit_check('b0000000-0000-4000-8000-000000000027', 'confirm');
  if (v_d ->> 'allowed')::boolean then
    raise exception 'FAIL R10b: a confirm was admitted with 79 of 80 Google calls spent: %', v_d;
  end if;
  if v_d ->> 'rule' <> 'places_daily_global' then
    raise exception 'FAIL R10b: the confirm refusal names % rather than the global ceiling',
      v_d ->> 'rule';
  end if;
  raise notice 'PASS R10 confirm ignores the caller''s own places budget and still respects the hard global one';
end $$;

-- ══ R12: erasure de-identifies, it does not refund ═══════════════════════════════════════════
-- GDPR Art. 17 removes the identity. It must not remove the FACT that Google's quota was spent —
-- otherwise deleting an account is a way to hand its share of the shared daily budget back to
-- everybody else, which is a reset button with a signup form in front of it.
do $$
declare v_global_before integer; v_global_after integer; v_orphans integer;
begin
  select coalesce(sum(units), 0) into v_global_before from public.rate_limit_events
   where scope = 'import.places' and occurred_at > now() - interval '1 day';

  delete from auth.users where id = 'b0000000-0000-4000-8000-000000000027';

  select coalesce(sum(units), 0) into v_global_after from public.rate_limit_events
   where scope = 'import.places' and occurred_at > now() - interval '1 day';
  if v_global_after <> v_global_before then
    raise exception
      'FAIL R12: erasing an account moved the global places total from % to %. Account deletion '
      'must not refund the shared quota.', v_global_before, v_global_after;
  end if;

  select count(*) into v_orphans from public.rate_limit_events
   where subject_id = 'b0000000-0000-4000-8000-000000000027';
  if v_orphans <> 0 then
    raise exception 'FAIL R12: % row(s) still carry the erased user''s id', v_orphans;
  end if;
  raise notice 'PASS R12 erasure nulls the subject and keeps the units: identity gone, shared quota not refunded';
end $$;

-- ══ R13: FAIL-CLOSED ═════════════════════════════════════════════════════════════════════════
-- The failure mode that matters. `import_rate_limit_check` writes its attempt row BEFORE it counts
-- anything, precisely so that a broken authorisation surface on the counter table surfaces as an
-- error rather than as "0 units used, go ahead" — a limiter whose failure mode is "no limit" is the
-- worst possible limiter, and counting first would have had exactly that failure mode.
--
-- Simulated by making the write fail. LAST in the file, because the trigger it installs breaks
-- every assertion after it; the surrounding transaction rolls back, so nothing survives.
create or replace function public.rl_test_break_writes() returns trigger
language plpgsql as $fn$
begin
  raise exception 'simulated storage failure' using errcode = 'io_error';
end $fn$;

create trigger rl_test_break_writes before insert on public.rate_limit_events
  for each row execute function public.rl_test_break_writes();

-- NOTE THE SHAPE, which is the result of this assertion failing its own sabotage run. The obvious
-- form — `raise exception 'FAIL'` inside the block, caught by `exception when others` — is
-- ALWAYS GREEN: the handler catches the FAIL raise itself and reports a pass. Measured, with the
-- limiter deliberately rewritten to swallow the write error and admit the call: the broken version
-- printed `PASS R13 ... (P0001)`. So the outcome is recorded in a flag and the verdict is reached
-- outside any handler.
do $$
declare v_d jsonb; v_returned boolean := false; v_state text;
begin
  begin
    v_d := public.import_rate_limit_check('c0000000-0000-4000-8000-000000000027', 'probe');
    v_returned := true;
  exception when others then
    -- Any error is fail-closed; only a RETURNED decision is a failure of this assertion.
    v_state := sqlstate;
  end;

  if v_returned then
    raise exception
      'FAIL R13: with the counter unwritable the limiter returned % instead of raising. It is '
      'failing OPEN, which means an unavailable limiter is the same as no limiter at all.', v_d;
  end if;
  raise notice 'PASS R13 an unwritable counter makes the limiter raise (%); it never reads zero and admits everything', v_state;
end $$;

rollback;
