-- 0018_save_place_revoke_public_execute.sql — close the PUBLIC EXECUTE grant that 0017 reopened
-- on `save_place`.
--
-- WHY. This is 0009's bug, exactly, reintroduced. Postgres grants EXECUTE on every newly created
-- function to the pseudo-role PUBLIC, and `revoke all on function ... from anon` does **not** remove
-- a privilege held through PUBLIC — that is the whole reason 0009 exists, and 0009's own header
-- says so in the first paragraph.
--
-- 0017 needed a new signature for `save_place` (it gained `p_reason`), so it dropped the 3-argument
-- form and created a 4-argument one. A newly created function starts again from the Postgres
-- default, so 0009's `revoke ... from public` no longer covered it, and 0017's replacement line
-- named only `anon`:
--
--     revoke all on function public.save_place(uuid, uuid, text, text) from anon;
--
-- `anon` therefore holds EXECUTE on the product's most important write again, through PUBLIC.
-- Caught by `supabase/tests/inventory.sql` check 6 ("UNEXPECTED anon→save_place"), which is the
-- check 0009 was written against and which carries this failure mode in its own comment.
--
-- IMPACT, and it is the same bounded impact 0009 recorded. `save_place` is SECURITY INVOKER, so an
-- `anon` caller runs it with `anon`'s privileges — and `anon` holds no privilege on `saved_places`
-- at all (inventory check 3), so the INSERT is refused regardless. The function also opens with an
-- `auth.uid() is null` guard. So this is a reachable entry point, not a live write path. `08` §5.1
-- still says anon holds nothing, and a callable entry point on the product's most important write
-- is not something to leave lying around on the strength of an internal guard clause — 0009's
-- words, and they apply unchanged.
--
-- Forward-only (`08` §9): 0017 is not edited, because it has already been applied to local
-- containers and editing it would leave them silently divergent from a fresh `db reset`.
--
-- No new tables or views, so `scripts/check-migration-grants.sh` has nothing to assert here.

begin;

-- `from public` is the load-bearing word. `anon` and `authenticated` are named too so this is the
-- same total-revoke-then-grant-back shape as 0007/0009 rather than a narrower patch that the next
-- signature change could slip past again.
revoke all on function public.save_place(uuid, uuid, text, text)
  from public, anon, authenticated;

-- Hand back exactly the one role that needs it. SECURITY INVOKER, so RLS still applies (`08` §3.7).
grant execute on function public.save_place(uuid, uuid, text, text) to authenticated;

commit;
