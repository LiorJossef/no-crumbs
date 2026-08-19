-- 0011_merge_chains_and_invariant_scope.sql — merge tombstones must resolve to a LIVE row, one
-- physical place must be one row even under concurrency, the ">= 1 alias" invariant must survive
-- alias deletion, and two policies/algorithms must match the design documents they were written
-- from.
--
-- WHY THIS EXISTS. Five separate defects found by reading 0004–0007 during the MS1–MS4
-- retrospective audit. Forward-only per `08` §9: 0001–0009 are applied to staging and production,
-- so the schema moves by a new migration and never by an edit to an applied one.
--
-- 1. MERGE CHAINS RESOLVED TO A DEAD ROW (the serious one).
--    `merge_places(A, B)` set A.merged_into_place_id = B. A later `merge_places(B, C)` set
--    B.merged_into_place_id = C but left A pointing at B, and both read paths in `resolve_place`
--    followed exactly one hop (`coalesce(pl.merged_into_place_id, pl.id)`). So resolving A's alias
--    returned B — a row that has itself been merged away — and `save_place` would then attach a
--    live library row to a tombstone: a saved place that renders the wrong name and coordinates,
--    and a silent violation of charter §3 invariant 4. `08` §1.2 says "follow
--    `places.merged_into_place_id` **to the surviving row**", and §1.4 says "old references still
--    resolve". Neither was true. Fixed in three places: merge re-points the tombstones that
--    already point at the loser, merge refuses a winner that is itself a tombstone, and resolution
--    walks the chain to its terminal row with cycle protection.
--
-- 2. `places_alias_required` (0005) fires only AFTER INSERT, so deleting or re-pointing every alias
--    of a live place left it with no provider identity at all — the invariant `08` §1.6 calls
--    "total". Scope ruled by the project owner: **tombstones are exempt**, because `08` §1.4
--    deliberately moves *all* of the loser's aliases to the winner, so a tombstone is expected to
--    have none. The invariant is therefore a statement about LIVE rows and is now enforced as one
--    on the ALIAS side (`assert_place_alias_retained`, below). The INSERT-side twin from 0005,
--    `assert_place_has_alias`, did not get the tombstone branch here and was left claiming more
--    than it did until 0013 gave it the same three branches. Corrected in place, comment only:
--    this file has never been applied anywhere, so `08` §9 has no applied artefact to protect --
--    the ruling 0013's header already recorded for its two other in-place edits.
--
-- 3. `extractions_select_via_source_membership` (0004) gated on `imports` alone, while `08` §2.2
--    rule 1 and `technical-design.md` §4.3 both say `imports` OR `saved_place_sources` — which is
--    what `sources` actually got in 0006. A user who saved a place from an import, then cancelled
--    or aged out that import row, could read the source but not the extraction derived from it.
--
-- 4. Step 1 of `resolve_place` overwrote name/lat/lng on every single hit. `08` §1.2 says refresh
--    "if our copy is older". Unconditional overwrite means every repeat import rewrites the shared
--    row (and bumps `updated_at`) for no new information, and lets a stale cache entry — the
--    resolution cache keeps Nominatim responses for 90 days, `06` §6.4 — overwrite a newer copy.
--
-- 5. TWO ROWS FOR ONE PHYSICAL PLACE, UNDER CONCURRENCY. Step 2 of `resolve_place` — the 75 m
--    near-duplicate guard — was never serialised. Two transactions resolving the SAME venue under
--    two DIFFERENT provider ids both miss step 1 (their alias keys differ), and both miss the guard
--    because under READ COMMITTED neither can see the other's uncommitted `places` row. Both then
--    insert, and the `ON CONFLICT` in step 3 does not catch it: that conflict target is
--    `(provider, provider_place_id)`, which by construction differs between the two callers — it
--    was the B3 fix for the identical-alias race and covers only that. The result is two rows for
--    one physical place, which contradicts `08` §0, `08` §4's row "Two rows for one physical place
--    — prevented by unique (provider, provider_place_id) + the 75 m/name guard, both inside
--    resolve_place", `technical-design.md` §4.1 invariant 1, and charter §3 invariant 4. It is the
--    exact failure mode our own concurrency story claimed was impossible, and it needs no unusual
--    timing: one venue in a list-style TikTok, resolved by two users at once, one hit from an
--    Overture extract and one from the Nominatim fallback, is enough.

-- No table and no column is created here, so the authorisation surface restated in 0008 is
-- unchanged. Two functions are created, and both are revoked from PUBLIC explicitly: Postgres
-- grants EXECUTE on a new function to PUBLIC, and 0009's blanket revoke already ran (the exact
-- trap 0009 exists to document).

-- ---------------------------------------------------------------------------------------------
-- place_survivor_id: follow a merge chain to its terminal row. THE definition of "which place is
-- this really", used by every read path in resolve_place.
--
-- Recursive rather than one hop because `merge_places` can be called twice in sequence by an
-- operator repairing provider churn, and because the re-pointing added below cannot fix a chain
-- that already exists on staging or production.
--
-- Cycle protection is two independent belts. `places_no_self_merge` forbids a 1-cycle and the
-- guard in merge_places forbids creating a longer one, but this function is a read path over data
-- that may predate both, and a recursive CTE over a cyclic graph does not terminate:
--   * `seen` array: never re-visit an id already on this path;
--   * depth < 32: bounded work even if a future writer finds a way around the array.
-- On a cyclic chain it returns the deepest row reached rather than looping forever — wrong, and
-- BOUNDED BUT SILENT. It is worth being exact about that, because an earlier version of this
-- comment claimed the alias invariant trigger below would "complain" about the tombstone handed
-- back: it will not. `assert_place_alias_retained` fires only on alias DELETE and UPDATE OF
-- place_id, and resolution performs neither, so nothing raises on a read. What does stop a cyclic
-- chain reaching a user's library is `merge_places` refusing an already-merged winner or loser
-- (below), which makes a cycle uncreatable from here on, plus the `is not null` checks in the
-- caller. A cycle that predates this migration would resolve to a tombstone and be saved as one,
-- with no error: the two staging audit queries in the MS1–MS4 handoff exist to find out whether any
-- such chain is actually there.
--
-- Returns null for an unknown id (the caller's `is not null` checks already treat that as a miss),
-- and p_place_id itself for a live row.
-- ---------------------------------------------------------------------------------------------
create or replace function public.place_survivor_id(p_place_id uuid) returns uuid
language sql stable parallel safe
set search_path = public, pg_temp
as $fn$
  with recursive chain as (
    select pl.id, pl.merged_into_place_id, 1 as depth, array[pl.id] as seen
      from public.places pl
     where pl.id = p_place_id
    union all
    select nxt.id, nxt.merged_into_place_id, c.depth + 1, c.seen || nxt.id
      from chain c
      join public.places nxt on nxt.id = c.merged_into_place_id
     where c.merged_into_place_id is not null
       and not (nxt.id = any (c.seen))
       and c.depth < 32
  )
  select id from chain order by depth desc limit 1;
$fn$;

comment on function public.place_survivor_id(uuid) is
  'Terminal row of a places merge chain (08 §1.2/§1.4). Cycle-safe; null for an unknown id.';

-- Server-only, like the resolver it serves. Postgres grants EXECUTE to PUBLIC on creation; take it
-- away or inventory.sql check 6 (function grant drift) fails, correctly.
revoke all on function public.place_survivor_id(uuid) from public, anon, authenticated;
grant execute on function public.place_survivor_id(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- merge_places: unchanged in what it moves; guarded in what it accepts, and now maintains the
-- invariant that a tombstone points at a LIVE row.
--
-- REJECT, not follow, for an already-merged winner. `merge_places` is an operator-invoked repair
-- path (08 §1.4), not a hot path: a caller naming a tombstone as the winner is working from a
-- stale picture of the data, and the only safe thing to do with a stale picture is to show it the
-- error. Following silently would perform a merge into a row the operator never named — exactly
-- the kind of quiet, unrecorded data movement that produced defect 1 in the first place — and
-- `08` §1.4 already states the house preference for this class of event: "a *loud* failure, which
-- is the correct outcome". The error message names the survivor so the retry is one edit away.
-- An already-merged LOSER is rejected for the mirror reason: its aliases and saves have already
-- been moved, so a second merge would silently re-parent a decided tombstone and lose the record
-- of which merge actually moved the data. Together these two guards mean every tombstone written
-- from now on points directly at a live row, and the recursive walk above is defence in depth
-- rather than the only thing standing between a save and a dead place.
-- ---------------------------------------------------------------------------------------------
create or replace function public.merge_places(p_loser uuid, p_winner uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_loser_merged_into  uuid;
  v_winner_merged_into uuid;
begin
  if p_loser is null or p_winner is null then
    raise exception 'merge_places requires two place ids' using errcode = '22004';
  end if;
  if p_loser = p_winner then
    raise exception 'cannot merge a place into itself';
  end if;

  -- Existence checks are not decoration: without them an unknown loser makes every statement below
  -- a no-op and the repair reports success while having done nothing.
  select merged_into_place_id into v_loser_merged_into from places where id = p_loser;
  if not found then
    raise exception 'merge_places: loser place % does not exist', p_loser using errcode = '23503';
  end if;
  select merged_into_place_id into v_winner_merged_into from places where id = p_winner;
  if not found then
    raise exception 'merge_places: winner place % does not exist', p_winner using errcode = '23503';
  end if;

  if v_winner_merged_into is not null then
    raise exception 'merge_places: winner % is itself merged into %; merge into survivor % instead',
      p_winner, v_winner_merged_into, public.place_survivor_id(p_winner)
      using errcode = '23514';
  end if;
  if v_loser_merged_into is not null then
    raise exception 'merge_places: loser % is already merged into %; its rows have already moved',
      p_loser, v_loser_merged_into using errcode = '23514';
  end if;

  -- users who saved both keep one entry; their provenance links are moved first
  update saved_place_sources sps
     set saved_place_id = w.id
    from saved_places l
    join saved_places w on w.user_id = l.user_id and w.place_id = p_winner
   where l.place_id = p_loser and sps.saved_place_id = l.id
     and not exists (select 1 from saved_place_sources x
                      where x.saved_place_id = w.id and x.source_id = sps.source_id);
  delete from saved_places l
   where l.place_id = p_loser
     and exists (select 1 from saved_places w
                  where w.user_id = l.user_id and w.place_id = p_winner);

  update saved_places set place_id = p_winner where place_id = p_loser;
  update place_provider_refs set place_id = p_winner, is_primary = false where place_id = p_loser;

  -- Re-point tombstones that already point AT the loser, so no chain is ever longer than one hop.
  -- Safe against places_no_self_merge: a tombstone pointing at the loser cannot be the winner,
  -- because a merged winner was rejected above.
  update places set merged_into_place_id = p_winner
   where merged_into_place_id = p_loser;

  update places set merged_into_place_id = p_winner, updated_at = now() where id = p_loser;
end;
$fn$;

revoke all on function public.merge_places(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_places(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- resolve_place: same algorithm, same three steps, same 75 m + name_key + country guard, same
-- ON CONFLICT DO UPDATE and aliasless-orphan cleanup in step 3 (the MS4 fix recorded in
-- docs/ms4-database.md §2.1 — DO NOTHING would return no row under READ COMMITTED). Four changes:
--
--   a. every path that returns a place id now returns the TERMINAL survivor, via
--      place_survivor_id(), not the first hop. That includes step 2's ON CONFLICT return, which
--      under a concurrent alias insert can hand back a place that lost a merge in between.
--   b. step 1 refreshes provider-owned columns only when our copy is older than c_refresh_after
--      (08 §1.2). `provider_fetched_at` is the only column in the schema that records when our
--      copy came from a provider, so it is the staleness clock; 30 days is shorter than the 90-day
--      Nominatim entry in the resolution cache (06 §6.4), so a refresh can actually be fed by
--      fresh provider data, and longer than any plausible repeat-import interval, so the normal
--      "same venue again" path performs no write on the shared row at all.
--   c. when our copy is NOT stale we still fill columns we simply do not have (a second provider
--      supplying a country_code we lacked). That is enrichment, not refresh: it uses
--      coalesce(existing, new) and so cannot overwrite anything, and it is guarded so a row with
--      nothing missing is not written at all. country_code and locality feed the near-duplicate
--      guard, so leaving them null for 30 days would degrade dedup.
--   d. step 2 is serialised by a transaction-scoped advisory lock keyed on the same
--      (name_key, country_code) pair the guard itself decides on, taken BEFORE the probe reads.
--      Rationale at the statement.
-- ---------------------------------------------------------------------------------------------
create or replace function public.resolve_place(
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
  p_provider_payload  jsonb default null
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
             provider_payload  = coalesce(provider_payload, p_provider_payload)
       where id = v_place_id
         and (category is null          and p_category is not null
           or provider_category is null and p_provider_category is not null
           or address_line is null      and p_address_line is not null
           or locality is null          and p_locality is not null
           or region is null            and p_region is not null
           or country_code is null      and p_country_code is not null
           or provider_payload is null  and p_provider_payload is not null);
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
    -- existing physical place, new provider alias for it
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
                      country_code, lat, lng, provider_payload, provider_fetched_at)
  values (p_name, p_category, p_provider_category, p_address_line, p_locality, p_region,
          p_country_code, p_lat, p_lng, p_provider_payload, now())
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

revoke all on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------
-- The ">= 1 alias per LIVE place" invariant, from the other side.
--
-- 0005 asserts it AFTER INSERT ON places, which catches "created a place and never gave it an
-- alias" and nothing else. The missing half is the alias table: delete or re-point every alias of
-- a live place and it keeps existing with no provider identity, unresolvable and unrefreshable,
-- while `08` §1.6 claims the invariant is "total".
--
-- Scope, ruled by the project owner: LIVE rows only. A merge tombstone is exempt because `08` §1.4
-- moves *all* of the loser's aliases to the winner by design, so a tombstone with zero aliases is
-- the intended end state, not a violation. The trigger therefore exits quietly for a place that no
-- longer exists (resolve_place step 3 deletes its own orphan, and ON DELETE CASCADE from places
-- fires this trigger for every alias of a place that is going away) and for a tombstone.
--
-- Deferred, like its INSERT-side twin, so that a legitimate multi-statement move — delete the old
-- alias, insert the replacement — is judged on the state at COMMIT rather than mid-transaction.
-- ---------------------------------------------------------------------------------------------
create or replace function public.assert_place_alias_retained() returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
-- OLD only: this trigger is AFTER DELETE and AFTER UPDATE OF place_id, and on the delete path NEW
-- is unassigned — referencing it at all raises, COALESCE included (same trap as
-- assert_place_has_alias in 0005).
declare
  v_place_id     uuid := old.place_id;
  v_is_tombstone boolean;
begin
  select (p.merged_into_place_id is not null) into v_is_tombstone
    from public.places p where p.id = v_place_id;
  if not found then
    return null;                                    -- place is gone; nothing to assert
  end if;
  if v_is_tombstone then
    return null;                                    -- merged away: aliases live on the winner now
  end if;
  if not exists (select 1 from public.place_provider_refs where place_id = v_place_id) then
    raise exception 'live place % would be left with no provider ref (identity invariant, 08 §1.6)',
      v_place_id using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create constraint trigger ppr_alias_retained_on_delete
  after delete on public.place_provider_refs
  deferrable initially deferred
  for each row execute function public.assert_place_alias_retained();

-- The same hole, reached by moving rather than deleting: `update place_provider_refs set place_id`
-- is how merge_places empties the loser, and nothing stopped an operator emptying a LIVE place the
-- same way. merge_places itself is unaffected — its loser is a tombstone by COMMIT, so the check
-- above exits at the tombstone branch.
create constraint trigger ppr_alias_retained_on_move
  after update of place_id on public.place_provider_refs
  deferrable initially deferred
  for each row execute function public.assert_place_alias_retained();

-- Granted to nobody, per the 0009 rationale: a trigger function is invoked by the trigger
-- mechanism, and CREATE TRIGGER already checked EXECUTE at creation time. Revoked from PUBLIC
-- because CREATE FUNCTION grants it there.
revoke all on function public.assert_place_alias_retained() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- extractions: the membership gate gains the branch it was always specified to have (08 §2.2
-- rule 1, technical-design.md §4.3), so it agrees with sources_select_via_membership in 0006.
-- Same policy name, so inventory.sql check 2 (exact policy set) still passes.
-- Index support already exists: sps_source_idx on (source_id, user_id) from 0006.
-- ---------------------------------------------------------------------------------------------
drop policy if exists extractions_select_via_source_membership on public.extractions;
create policy extractions_select_via_source_membership on public.extractions
  for select to authenticated
  using (
    exists (select 1 from public.imports i
             where i.source_id = extractions.source_id and i.user_id = (select auth.uid()))
    or exists (select 1 from public.saved_place_sources sps
                where sps.source_id = extractions.source_id and sps.user_id = (select auth.uid()))
  );
