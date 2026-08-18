-- 0009_function_grants.sql — take EXECUTE away from PUBLIC and hand it back deliberately.
--
-- WHY. Postgres grants EXECUTE on every newly created function to the pseudo-role PUBLIC. `revoke
-- all on function ... from anon` (0007) does not remove a privilege held through PUBLIC, so `anon`
-- could still call `save_place`. Measured by inventory.sql check 6 against p-002-staging
-- 2026-08-18. The three SECURITY DEFINER functions were unaffected because 0007 revoked them
-- `from public, anon, authenticated` explicitly — which is exactly the difference, and the reason
-- this file exists rather than an edit to 0007 (forward-only, 08 §9).
--
-- Impact was limited: save_place is SECURITY INVOKER and starts with `if auth.uid() is null then
-- raise`, so an anon caller got an exception rather than a write. But `08` §5.1 says anon holds
-- nothing, and a callable entry point on the product's most important write is not a thing to leave
-- lying around on the strength of an internal guard clause.

-- 1. Nothing in public is executable by PUBLIC, anon or authenticated any more. service_role's
--    explicit grants from 0007 (resolve_place, merge_places, start_import) are untouched by this.
revoke all on all functions in schema public from public, anon, authenticated;

-- 2. Hand back exactly what a browser-reachable role needs.
--    save_place: the product's user-facing write, SECURITY INVOKER so RLS still applies (08 §3.7).
grant execute on function public.save_place(uuid, uuid, text) to authenticated;

--    km_between: called by the user's own "what did I save near me" query (D6 / 08 §6.1), which runs
--    as `authenticated` under RLS. service_role too, for the server-side callers.
grant execute on function public.km_between(double precision, double precision,
                                           double precision, double precision)
  to authenticated, service_role;

--    place_name_key: only ever needed by the resolver path, which runs as the definer, and by the
--    generated column on places, which is computed by the table owner. Server role only.
grant execute on function public.place_name_key(text) to service_role;

-- Deliberately granted to nobody: touch_updated_at, assert_place_has_alias,
-- assert_saved_place_provenance, handle_new_user. Trigger functions are invoked by the trigger
-- mechanism, and CREATE TRIGGER already checked EXECUTE at creation time; no caller needs a grant.
-- If that assumption is wrong, the policy tests fail on P4b (a user updating their own overlay,
-- which fires touch_updated_at) rather than the assumption living undisturbed in a comment.
