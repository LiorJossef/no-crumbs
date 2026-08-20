-- 0014_resolve_place_provenance.sql — resolve_place gains the three provenance parameters
-- (p_source_dataset, p_source_dataset_id, p_resolution_score) that 0010's `places` columns exist
-- for, WITHOUT losing anything the MS1-MS4 audit put into its body.
--
-- WHY THIS FILE EXISTS, and why the change is not in 0010 where it was first written.
--
-- 0010 originally dropped the twelve-argument resolve_place and recreated it with these three
-- parameters. It was authored before the audit branch and reached `ms5-design` only on 2026-08-19,
-- and in the merged migration set it was broken in both directions -- both MEASURED on
-- public.ecr.aws/supabase/postgres:17.6.1.064, the image the hosted projects are built from:
--
--   * NUMERIC ORDER (0010 then 0011). 0011 does `create or replace` on the twelve-argument
--     signature, so it re-created the function 0010 had just dropped. Two rows in pg_proc, and
--     `select public.resolve_place('overture','x1','Cafe Levinsky',32.06,34.77)` raised
--     `function public.resolve_place(...) is not unique` (42725) -- at run time, in the import path.
--     That is the exact failure 0010's own comment said the drop existed to prevent; what the
--     comment did not anticipate was a LATER file putting the old signature back.
--   * OUT-OF-ORDER ARRIVAL (0011-0013 applied, 0010 pending -- the state the MS5 ledger row
--     believes staging is in; the runbook s6 and 0013's header say staging is at 0001-0009, and
--     that contradiction belongs to MS5 task 8, not here). Applying 0010's original next left one
--     resolve_place whose body contained zero occurrences of `place_survivor_id` and zero of
--     `pg_advisory_xact_lock`: merge-chain resolution back to a single `coalesce` hop (0011 defect
--     1, which walks a two-hop chain to a TOMBSTONE and hands it to save_place) and the step-2
--     near-duplicate guard unserialised again (0011 defect 5, two rows for one physical place).
--     Silent, both of them. The audit's 53 policy assertions rest on the 0011 body.
--
-- So 0010 keeps only its non-function work (pg_trgm, poi_regions, poi_index, the four `places`
-- columns and their grants/RLS) -- edited in place, which `08` s9 permits because that file has
-- never been applied to any environment and the rule protects APPLIED artefacts; see 0010's
-- section 7 for the full reasoning and 0013's header for the same ruling applied to 0011.
--
-- WHAT THIS BODY IS. 0011's resolve_place, verbatim, plus provenance. Every audited behaviour is
-- carried forward unchanged and is load-bearing:
--   * step 1 and step 3 return `public.place_survivor_id(...)`, the TERMINAL survivor of a merge
--     chain, never the first hop (0011 defect 1);
--   * step 1 refreshes provider-owned columns only when `provider_fetched_at` is older than 30 days
--     and otherwise ENRICHES -- fills what is null, overwrites nothing, and does not write the row
--     at all when there is nothing to fill (0011 defect 4);
--   * step 2 takes `pg_advisory_xact_lock(hashtext(name_key || country_code))` BEFORE its probe
--     reads, which is the only thing that makes the 75 m guard more than advisory (0011 defect 5);
--   * step 2's ON CONFLICT return is passed through place_survivor_id too;
--   * step 3 keeps the B3 fix: ON CONFLICT DO UPDATE (not DO NOTHING) and the deletion of our own
--     aliasless orphan when we lose the alias race.
-- Provenance is added at three points and nowhere else; each is commented where it appears.
--
-- DROP, NOT CREATE OR REPLACE, and this is the part that is easy to get wrong twice. Adding
-- parameters with defaults creates an OVERLOAD rather than replacing the function, and every
-- existing twelve-argument call would then match both candidates and fail with "function is not
-- unique". Dropping the old signature explicitly is what makes the change total. Grants do NOT
-- survive a drop, so the revoke/grant pair at the foot of this file is restated in full
-- (security.md s1: that list is load-bearing, and EXECUTE defaults to PUBLIC on every new
-- function -- the defect 0009 exists to fix).
--
-- SCOPE. One function. No table, column, policy, trigger or table grant is created or changed, so
-- the authorisation surface of 0008/0009/0012 is untouched, `places_alias_required` keeps its oid
-- and stays the DEFERRABLE INITIALLY DEFERRED constraint trigger inventory.sql check 7b asserts,
-- and the browser-reachable function set stays exactly {save_place, km_between} (check 6) with
-- resolve_place server-only.

drop function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb);

create function public.resolve_place(
  p_provider          text,
  p_provider_place_id text,
  p_name              text,
  p_lat               double precision,
  p_lng               double precision,
  p_category          text default null,
  p_provider_category text default null,
  p_address_line      text default null,
  p_locality          text default null,
  p_region            text default null,
  p_country_code      char(2) default null,
  p_provider_payload  jsonb default null,
  -- The three provenance parameters this migration exists to add. All defaulted, so a caller that
  -- knows nothing about datasets is unchanged; see the header for why defaulting is NOT enough on
  -- its own and the old signature had to be dropped.
  p_source_dataset    text default null,
  p_source_dataset_id text default null,
  p_resolution_score  real default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  c_merge_radius_km constant double precision := 0.075;   -- 08 §1.2
  c_refresh_after   constant interval := interval '30 days';
  v_place_id     uuid;
  v_new_place_id uuid;
  v_stale        boolean;
  v_dlat double precision;
  v_dlng double precision;
begin
  -- 1. exact alias match, following any merge chain to the row that is still alive
  select public.place_survivor_id(r.place_id)
    into v_place_id
    from place_provider_refs r
   where r.provider = p_provider and r.provider_place_id = p_provider_place_id;

  if v_place_id is not null then
    update place_provider_refs
       set last_seen_at = now(), retired_at = null
     where provider = p_provider and provider_place_id = p_provider_place_id;

    select (pl.provider_fetched_at is null or pl.provider_fetched_at < now() - c_refresh_after)
      into v_stale
      from places pl where pl.id = v_place_id;

    if v_stale then
      update places
         set name = p_name, lat = p_lat, lng = p_lng,
             category          = coalesce(p_category, category),
             provider_category = coalesce(p_provider_category, provider_category),
             address_line      = coalesce(p_address_line, address_line),
             locality          = coalesce(p_locality, locality),
             region            = coalesce(p_region, region),
             country_code      = coalesce(p_country_code, country_code),
             provider_payload  = coalesce(p_provider_payload, provider_payload),
             -- Provenance, on the refresh path only: coalesce, never clobber a known dataset with a
             -- null from a caller that did not pass one. resolution_score is the one column written
             -- unconditionally-when-supplied, per its 0010 column comment ("the most recent
             -- resolution"), and it is knowingly a property of one user's candidate string.
             source_dataset    = coalesce(p_source_dataset, source_dataset),
             source_dataset_id = coalesce(p_source_dataset_id, source_dataset_id),
             resolution_score  = coalesce(p_resolution_score, resolution_score),
             provider_fetched_at = now()
       where id = v_place_id;
    else
      -- enrichment only: fill what is missing, overwrite nothing, and do not touch the row when
      -- there is nothing to fill. provider_fetched_at is deliberately NOT bumped — bumping it
      -- without taking the new name/coordinates would push the real refresh out forever.
      update places
         set category          = coalesce(category, p_category),
             provider_category = coalesce(provider_category, p_provider_category),
             address_line      = coalesce(address_line, p_address_line),
             locality          = coalesce(locality, p_locality),
             region            = coalesce(region, p_region),
             country_code      = coalesce(country_code, p_country_code),
             provider_payload  = coalesce(provider_payload, p_provider_payload),
             source_dataset    = coalesce(source_dataset, p_source_dataset),
             source_dataset_id = coalesce(source_dataset_id, p_source_dataset_id)
       where id = v_place_id
         and (category is null          and p_category is not null
           or provider_category is null and p_provider_category is not null
           or address_line is null      and p_address_line is not null
           or locality is null          and p_locality is not null
           or region is null            and p_region is not null
           or country_code is null      and p_country_code is not null
           or provider_payload is null  and p_provider_payload is not null
           or source_dataset is null    and p_source_dataset is not null
           or source_dataset_id is null and p_source_dataset_id is not null);
      -- resolution_score is deliberately absent from BOTH the SET list and the guard on this path.
      -- It is a diagnostic of one caller's candidate string, not a fact about the place (0010's
      -- column comment says so), and including it would make every repeat import write the shared
      -- row again -- which is precisely the behaviour 0011 defect 4 removed. The refresh branch
      -- above still records it, so a row that is actually being re-fetched carries a current score.
    end if;

    return v_place_id;
  end if;

  -- 2. near-duplicate guard: same normalised name, same country, within c_merge_radius_km
  v_dlat := c_merge_radius_km / 111.045;
  v_dlng := c_merge_radius_km / (111.045 * greatest(cos(radians(p_lat)), 0.01));

  -- Serialise the guard. Without this the guard is advisory only: two transactions resolving the
  -- same venue under two DIFFERENT provider ids both miss step 1, and under READ COMMITTED neither
  -- probe can see the other's uncommitted places row, so both insert and one physical place ends
  -- up as two rows (header §5). The alias unique constraint cannot catch it — the two provider
  -- pairs differ, which is precisely why they are two callers and not one.
  --
  -- Taken BEFORE the probe reads, not between probe and insert: a lock acquired after the read
  -- serialises nothing, because both readers have already decided "no duplicate exists".
  -- _xact_ scope, so it is released at COMMIT (or ROLLBACK) by the transaction that holds it and
  -- there is no unlock to forget and no path that leaks it. The whole critical section is
  -- probe + insert in this function; resolve_place performs no network or provider call — every
  -- provider byte arrives as a parameter, already fetched and cached by the caller (place_lookups)
  -- — so the lock is never held across an external wait, only across two local statements.
  --
  -- Key: hashtext of the SAME (name_key, country_code) pair the guard decides on, so callers that
  -- could possibly collide in the guard are exactly the callers that queue. No `::bigint` cast is
  -- needed and none is wanted: hashtext returns integer, the ONE-argument pg_advisory_xact_lock has
  -- exactly one overload (bigint) — the (int, int) form takes two — so there is nothing for the
  -- integer to be ambiguous against and it widens by the implicit int4→int8 cast. Confirmed at
  -- runtime by P22 in supabase/tests/0008_policy_tests.sql, which reads the held lock's key back out
  -- of pg_locks: an unresolvable call would not have parsed and resolve_place would not exist.
  -- place_name_key is IMMUTABLE (0001), so calling it here
  -- is free of side effects and returns byte-identical results to the generated places.name_key
  -- column the guard compares against — the lock key and the guard key cannot drift apart.
  -- coalesce(..., '') on both parts because pg_advisory_xact_lock is STRICT: a NULL argument would
  -- take no lock at all and do so silently, and place_name_key returns NULL for a name with no
  -- alphanumerics.
  --
  -- Hash collision between two genuinely different venues costs one of them a brief wait on the
  -- other's transaction and nothing else. The lock decides only ORDER; the guard below still
  -- decides identity, on name_key + country_code + 75 m, so a collision can never merge two places
  -- that the guard would have kept apart.
  perform pg_advisory_xact_lock(
    hashtext(coalesce(public.place_name_key(p_name), '') || coalesce(p_country_code::text, '')));

  select pl.id into v_place_id
    from places pl
   where pl.merged_into_place_id is null
     and pl.name_key = public.place_name_key(p_name)
     and pl.country_code is not distinct from p_country_code
     and pl.lat between p_lat - v_dlat and p_lat + v_dlat
     and pl.lng between p_lng - v_dlng and p_lng + v_dlng
     and public.km_between(pl.lat, pl.lng, p_lat, p_lng) <= c_merge_radius_km
   order by public.km_between(pl.lat, pl.lng, p_lat, p_lng)
   limit 1;

  if v_place_id is not null then
    -- Existing physical place, new provider alias for it. Note what is deliberately NOT done here:
    -- no column of `places` is written, including the three provenance columns. This branch copies
    -- nothing from the provider into the row, so a Nominatim candidate that lands on an existing
    -- Overture place adds an alias and leaves source_dataset = 'overture-places'. That is correct
    -- for 06 s11 Q2: the ODbL mark tracks where the row's DATA came from, and on this path none of
    -- it came from the second provider. The alias in place_provider_refs is the record that the
    -- second provider recognised this place.
    insert into place_provider_refs (place_id, provider, provider_place_id, is_primary)
    values (v_place_id, p_provider, p_provider_place_id,
            not exists (select 1 from place_provider_refs where place_id = v_place_id))
    on conflict (provider, provider_place_id)
      do update set last_seen_at = now(), retired_at = null
    returning place_id into v_place_id;         -- concurrent-insert loser re-reads the winner
    -- The winner it re-read is some other caller's place, which may have lost a merge since. Never
    -- hand a tombstone back to save_place.
    return public.place_survivor_id(v_place_id);
  end if;

  -- 3. a genuinely new place.
  --    B3: the alias insert may lose a race with a concurrent caller resolving the same provider
  --    id. DO UPDATE (not DO NOTHING) is what makes that safe: it blocks until the winner commits
  --    and then returns the winner's place_id — a DO NOTHING would return no row and the winner's
  --    row might still be invisible under READ COMMITTED. If we lost, the places row we just
  --    inserted has no alias and would abort the whole transaction at COMMIT via
  --    places_alias_required, so it is deleted here rather than left as an orphan.
  insert into places (name, category, provider_category, address_line, locality, region,
                      country_code, lat, lng, provider_payload, provider_fetched_at,
                      source_dataset, source_dataset_id, resolution_score)
  values (p_name, p_category, p_provider_category, p_address_line, p_locality, p_region,
          p_country_code, p_lat, p_lng, p_provider_payload, now(),
          p_source_dataset, p_source_dataset_id, p_resolution_score)
  returning id into v_new_place_id;

  insert into place_provider_refs (place_id, provider, provider_place_id, is_primary)
  values (v_new_place_id, p_provider, p_provider_place_id, true)
  on conflict (provider, provider_place_id)
    do update set last_seen_at = now(), retired_at = null
  returning place_id into v_place_id;

  if v_place_id is distinct from v_new_place_id then
    delete from places where id = v_new_place_id;   -- our aliasless orphan; nothing references it
    -- follow the winner's merge chain to the end, not one hop
    v_place_id := public.place_survivor_id(v_place_id);
  end if;

  return v_place_id;
end;
$fn$;

comment on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb, text, text, real) is
  'Resolve a provider candidate to exactly one places row (08 s1.2): alias hit, then the serialised 75 m/name_key/country guard, then insert. Returns the terminal merge survivor. Records dataset provenance (06 s0). service_role only.';

-- The grant list, restated in full because the drop above took the old one with it. `from public`
-- first: EXECUTE defaults to PUBLIC on every new function.
revoke all on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb, text, text, real) from public, anon, authenticated;
grant execute on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb, text, text, real) to service_role;
