-- 0023_place_lookup_cache_rpcs.sql — the two entry points that make `place_lookups` usable, and
-- the caching ceiling that Google's terms impose, enforced in the database.
--
-- WHY THIS FILE EXISTS AT ALL. `place_lookups` has existed since 0007 (R6: the `PlaceResolver`'s
-- provider-response cache) and has never held a row — nothing in `src/` references it. The table
-- is right; what was missing is a way to use it that a client library can express:
--
--   * a read must bump `hit_count` and `last_hit_at` in the same statement that returns the
--     response. PostgREST cannot write `hit_count = hit_count + 1`, so without a function every
--     hit is a read-modify-write over two round trips — which spends the latency the cache exists
--     to save, and loses counts under concurrency;
--   * expiry must be decided by the **server's** clock. `expires_at` is a compliance boundary here
--     (below), and a boundary evaluated against a caller's clock is not a boundary;
--   * expired rows must actually leave the table, not merely stop being served.
--
-- THE COMPLIANCE BOUNDARY, and why it is a CHECK rather than a constant in TypeScript.
-- `docs/06-map-and-places-decision.md` §3.1 is VERIFIED: Google's Service Specific Terms §5.4
-- permit temporary caching of Places content for at most **30 consecutive calendar days**, and
-- only the place id is exempt. A cached Text Search response holds `location.latitude/longitude`,
-- so the whole entry is inside that cap.
--
-- `place_lookup_put` therefore REFUSES a `google` row with a null or over-30-day TTL. The reason it
-- is here and not only in the adapter is the same reason `place-resolver-factory.ts` puts the
-- non-Google-map gate in code rather than in prose: this is a terms-of-service limit, not a tuning
-- knob, and a limit that lives only in the caller is one refactor from gone. The caller's own
-- number is 28 days (`integrations/places/lookup-cache.ts`) — under the cap with slack, because the
-- prune below is opportunistic rather than scheduled.
--
-- SECURITY POSTURE. Neither function is SECURITY DEFINER. `place_lookups` carries ENABLE + FORCE
-- ROW LEVEL SECURITY and **no policy at all** (0007), and `service_role` — the only role granted
-- EXECUTE here — has `rolbypassrls` plus the explicit table grant from 0012. So invoker rights are
-- sufficient, and adding a definer function would widen the privileged surface for nothing.
--
-- The explicit `revoke ... from public` is 0009's and 0018's lesson applied in advance: Postgres
-- grants EXECUTE on every newly created function to PUBLIC, and `revoke ... from anon` does not
-- remove a privilege held through PUBLIC. Asserted by `supabase/tests/0008_policy_tests.sql` P26.
--
-- No tables and no views are created, so `scripts/check-migration-grants.sh` has nothing to assert.

begin;

-- ---------------------------------------------------------------------------------------------
-- Read. One statement: serve, count, and enforce expiry against the server clock.
-- ---------------------------------------------------------------------------------------------
-- A miss and an expired entry are the same answer (NULL) on purpose — the caller's only correct
-- behaviour for either is "ask the provider", and giving it two ways to spell that would invite a
-- branch that treats a stale entry as usable.
create or replace function public.place_lookup_get(p_lookup_hash text)
returns jsonb
language sql
volatile
set search_path = public, pg_temp
as $$
  update public.place_lookups
     set hit_count   = hit_count + 1,
         last_hit_at = now()
   where lookup_hash = p_lookup_hash
     and (expires_at is null or expires_at > now())
  returning response;
$$;

comment on function public.place_lookup_get(text) is
  'Provider-response cache read (R6). Returns the stored response and bumps hit_count, or NULL when '
  'the key is absent or expired. Server clock decides expiry. service_role only.';

-- ---------------------------------------------------------------------------------------------
-- Write. Upsert, refuse an over-long Google TTL, and take a bounded bite out of the expired rows.
-- ---------------------------------------------------------------------------------------------
create or replace function public.place_lookup_put(
  p_lookup_hash text,
  p_provider    text,
  p_region_id   text,
  p_response    jsonb,
  p_ttl_seconds integer
) returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  -- Google Service Specific Terms §5.4, in seconds. The cap, not our TTL: the caller sits below it.
  c_google_max_ttl_seconds constant integer := 30 * 24 * 60 * 60;
  -- One prune is bounded so that a cache write can never become a long transaction on a table that
  -- has been left alone for a month. It rides `place_lookups_expiry_idx` (0007), the partial index
  -- on `expires_at where expires_at is not null`, which exists for exactly this sweep.
  c_prune_batch            constant integer := 200;
begin
  if p_ttl_seconds is not null and p_ttl_seconds <= 0 then
    raise exception 'place_lookup_put: p_ttl_seconds must be positive or null (got %)', p_ttl_seconds
      using errcode = 'check_violation';
  end if;

  -- The one rule this function exists to make unbreakable. `null` means "cache forever", which is
  -- correct for open data and is precisely what §5.4 forbids for Google content.
  if p_provider = 'google'
     and (p_ttl_seconds is null or p_ttl_seconds > c_google_max_ttl_seconds) then
    raise exception
      'place_lookup_put: google responses may be cached for at most 30 days (Google Service '
      'Specific Terms §5.4); got %', coalesce(p_ttl_seconds::text, 'null (forever)')
      using errcode = 'check_violation';
  end if;

  insert into public.place_lookups (lookup_hash, provider, region_id, response, expires_at)
  values (
    p_lookup_hash, p_provider, p_region_id, p_response,
    case when p_ttl_seconds is null then null else now() + make_interval(secs => p_ttl_seconds) end
  )
  on conflict (lookup_hash) do update set
    provider    = excluded.provider,
    region_id   = excluded.region_id,
    response    = excluded.response,
    expires_at  = excluded.expires_at,
    -- A refresh replaces the *content*, so the clock that §5.4 measures restarts and the counters
    -- start again with it. `created_at` therefore reads as "when this response was stored", not
    -- "when this key was first seen" — the former is the compliance-relevant fact, the latter is
    -- not a fact anything needs.
    created_at  = now(),
    hit_count   = 0,
    last_hit_at = null;

  delete from public.place_lookups
   where lookup_hash in (
     select lookup_hash
       from public.place_lookups
      where expires_at is not null
        and expires_at < now()
      limit c_prune_batch
   );
end $$;

comment on function public.place_lookup_put(text, text, text, jsonb, integer) is
  'Provider-response cache write (R6). Upserts one entry, refuses a google entry with no TTL or a '
  'TTL over 30 days (Google SST §5.4), and prunes up to 200 expired rows. service_role only.';

-- ---------------------------------------------------------------------------------------------
-- Grants. Total revoke, then hand back exactly one role — the 0007/0009/0018 shape.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.place_lookup_get(text)
  from public, anon, authenticated;
revoke all on function public.place_lookup_put(text, text, text, jsonb, integer)
  from public, anon, authenticated;

grant execute on function public.place_lookup_get(text)                            to service_role;
grant execute on function public.place_lookup_put(text, text, text, jsonb, integer) to service_role;

-- Restated rather than assumed. 0007 revoked these and nothing since has re-granted them, but the
-- table is now reachable through two named entry points, and the review question a reader will ask
-- at this file is "so what can a browser role do to it" — the answer should be in this file.
revoke all on public.place_lookups from anon, authenticated;

commit;
