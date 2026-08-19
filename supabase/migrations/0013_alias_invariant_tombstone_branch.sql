-- 0013_alias_invariant_tombstone_branch.sql — finish the job 0011 started: the "every place has an
-- alias" invariant is about LIVE rows, and that has to be true of BOTH triggers that enforce it.
--
-- WHY THIS EXISTS. 0011 scoped the invariant to live rows (owner ruling: `08` §1.4 moves *all* of a
-- merge loser's aliases to the winner, so a tombstone with zero aliases is the intended end state,
-- not a violation) — but the exemption reached only the trigger 0011 itself created,
-- `assert_place_alias_retained` on `place_provider_refs`. Its INSERT-side twin from 0005,
-- `assert_place_has_alias` behind the constraint trigger `places_alias_required` on `places`, never
-- got the branch. Because that trigger is DEFERRABLE INITIALLY DEFERRED, its check is queued by the
-- place's INSERT and evaluated at COMMIT, on the state as it is *then*. So:
--
--   begin;
--     select resolve_place(...);            -- creates place L with one alias; check queued for L
--     select merge_places(L, W);            -- moves L's alias to W, sets L.merged_into_place_id = W
--   commit;                                 -- ERROR: place L has no provider ref (23514)
--
-- The transaction aborts and the whole repair is lost. Low severity — `merge_places` is an
-- operator-invoked repair path (`08` §1.4) and normally runs in its own transaction, after the loser
-- was created and committed by some earlier import — but it is reachable, the failure is at COMMIT
-- (so the caller sees it after every statement appeared to succeed), and it made 0011's own header
-- claim ("the invariant … is now enforced as [a statement about LIVE rows]") untrue of half the
-- enforcement. Found by the policy-test work for tasks 4+5, which had to split P16/P19 into two
-- deferred windows to work around exactly this; those splits stay, because they also stop the
-- INSERT-side check masking the trigger actually under test.
--
-- Forward-only per `08` §9: recreated here rather than edited into 0005, which is applied to staging
-- and production.
--
-- SCOPE. One function body. No table, column, policy, grant or trigger is created or changed, so the
-- authorisation surface of 0008/0009/0012 is untouched. `create or replace` keeps the function's oid,
-- so `places_alias_required` (0005) picks the new body up without being recreated and stays the
-- DEFERRABLE INITIALLY DEFERRED constraint trigger inventory.sql check 7b asserts.
--
-- Deliberately NOT in this migration, both still open and both recorded in the audit plan:
--   * `save_place` accepts a tombstone if a caller passes `p_place_id` directly instead of going
--     through `resolve_place`;
--   * the table-wide grants on `place_provider_refs` (0005) and `extractions` (0004).

-- ---------------------------------------------------------------------------------------------
-- assert_place_has_alias: identical to 0005 except for the tombstone branch, and identical in
-- posture — SECURITY INVOKER (the default; it is fired by the trigger mechanism as whoever wrote
-- the row, and it only ever reads two tables the writer can already read), `search_path` pinned to
-- `public, pg_temp` so an unqualified name cannot be captured by a caller's search_path, and
-- granted to nobody (0009's rationale: CREATE TRIGGER already checked EXECUTE at creation time).
--
-- The three branches, in the order they can be reached:
--   1. the place no longer exists — nothing to assert (ON DELETE CASCADE / resolve_place step 3
--      deleting its own aliasless orphan);
--   2. the place is a tombstone — exempt by the owner's ruling, its aliases live on the winner now;
--   3. otherwise it is a LIVE place and it must hold at least one provider ref.
-- Branch 2 is the only change. Branch 3 keeps the original message and errcode 23514 verbatim, so
-- the P17/P18 assertions that match on 'no provider ref' still discriminate between this trigger
-- ('place % has no provider ref') and 0011's ('live place % would be left with no provider ref').
--
-- Read with a single SELECT rather than two EXISTS probes so "gone" and "tombstone" come from one
-- snapshot of one row and cannot disagree.
-- ---------------------------------------------------------------------------------------------
create or replace function public.assert_place_has_alias() returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
-- `new.id`, not coalesce(new.id, old.id): this trigger is AFTER INSERT only, so OLD is unassigned,
-- and plpgsql raises `record "old" has no field "id"` when an unassigned record is referenced —
-- COALESCE does not save it, because the record still has to be materialised as a parameter.
declare
  v_place_id     uuid := new.id;
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
    raise exception 'place % has no provider ref (identity invariant, 08 §1.6)', v_place_id
      using errcode = '23514';
  end if;
  return null;
end;
$fn$;

comment on function public.assert_place_has_alias() is
  'Every LIVE place holds >= 1 provider ref (08 §1.6). Tombstones and deleted rows are exempt (08 §1.4).';

-- `create or replace` does not reset a function's ACL, so this is a no-op restatement of the posture
-- 0009 established — kept explicit because the cost of being wrong about that is EXECUTE to PUBLIC on
-- a function that reads `places`, and because inventory.sql check 6 would then fail for a reason
-- nobody reading this file would expect.
revoke all on function public.assert_place_has_alias() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Two comment defects in 0011, also logged by tasks 4+5, are fixed IN PLACE in
-- 0011_merge_chains_and_invariant_scope.sql rather than restated here. 0011 has never been applied
-- to staging or production (both are at 0001–0009), so there is no applied artefact for the
-- forward-only rule to protect; and one of the two comments lives inside `resolve_place`'s body,
-- where a correction in a later file could not reach it at all without recreating the function,
-- which is out of this migration's scope. A comment that is wrong where the reader is standing is
-- worse than a comment that is missing. What changed, for the record:
--   * the advisory-lock key comment now states that the one-argument `pg_advisory_xact_lock` has
--     only the `bigint` overload — so `integer` widens unambiguously and no `::bigint` cast is
--     needed, rather than leaving that as an inference (proven at runtime by P22);
--   * `place_survivor_id`'s cycle-protection comment no longer claims the alias invariant trigger
--     "will complain" about a tombstone returned from a cyclic chain. It will not:
--     `assert_place_alias_retained` fires only on alias DELETE / UPDATE OF place_id, and neither
--     happens on a read. The walk is bounded; it is not loud.
-- Neither edit changes any behaviour of 0011.
