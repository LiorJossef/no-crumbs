-- 0008_revoke_hosted_defaults.sql — close the gap between a local database and a hosted project.
--
-- WHY THIS EXISTS. `08` §3 wrote `revoke all ... from anon` on profiles, saved_places and
-- saved_place_sources, and `revoke all ... from anon, authenticated` on sources and imports. That
-- asymmetry is harmless locally, where the CLI's `auto_expose_new_tables` default is off and a new
-- table starts with no grants at all. It is not harmless on a hosted project created before the
-- always-revoked default: those carry ALTER DEFAULT PRIVILEGES granting ALL on new tables in
-- `public` to anon, authenticated and service_role, so `authenticated` came out of 0001–0007 holding
-- UPDATE (every column), DELETE, TRUNCATE, REFERENCES and TRIGGER on those three tables.
--
-- Measured on p-002-staging 2026-08-18 by supabase/tests/inventory.sql check 4, which is the only
-- reason this was found: the local CI run was clean and would have stayed clean forever.
--
-- The severe part is TRUNCATE. RLS is not consulted for TRUNCATE, so a table-level grant of it to
-- `authenticated` is a path for any logged-in user to delete every user's rows — no policy, no row
-- scoping, no recovery on a free-tier project with no PITR. The wide UPDATE is the other half: it
-- defeats the column-level grants that were supposed to make user_id, place_id and origin
-- unexpressible rather than merely policy-checked (08 §2.2 rule 3, technical-design §4.3).
--
-- Forward-only per 08 §9: this is a new migration, not an edit to 0002/0006.

-- 1. Stop new entities inheriting the wide grant. ALTER DEFAULT PRIVILEGES only touches defaults
--    owned by the role that runs it, and on a hosted project the relevant defaults may belong to
--    supabase_admin, which the migration role cannot always alter. Best-effort per role, and loud
--    about what it could not do — check 0 of inventory.sql is the assertion that this worked.
do $$
declare
  r text;
  obj text;
begin
  foreach r in array array['postgres', 'supabase_admin']
  loop
    foreach obj in array array['tables', 'sequences', 'functions']
    loop
      begin
        execute format(
          'alter default privileges for role %I in schema public revoke all on %s from anon, authenticated',
          r, obj);
      exception
        when insufficient_privilege or undefined_object then
          raise notice '0008: could not alter default privileges for role % on % (%)', r, obj, sqlerrm;
      end;
    end loop;
  end loop;
end $$;

-- 2. Revoke everything the defaults handed out, from both browser-reachable roles, on every table.
--    service_role keeps its grants: it is the trusted server path (08 §5) and bypasses RLS anyway.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 3. Re-grant exactly the designed matrix, and nothing else. This is a verbatim restatement of the
--    grants in 0002, 0003 and 0006 — kept here in one block deliberately, because after this
--    migration THIS is the authorisation surface, and a reviewer should be able to read it whole.

-- profiles: read and create own; edit the display name only
grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- sources: display columns only. content_text, created_at, updated_at withheld (R8)
grant select (id, platform, platform_source_id, canonical_url, author_handle, author_name,
              thumbnail_url, fetch_status, fetch_error_code, fetched_at)
  on public.sources to authenticated;

-- imports: read own; cancel and complete only (R7). No INSERT, no DELETE (R10)
grant select on public.imports to authenticated;
grant update (status, completed_at) on public.imports to authenticated;

-- global, read-only, membership-gated by policy
grant select on public.extractions         to authenticated;
grant select on public.places              to authenticated;
grant select on public.place_provider_refs to authenticated;

-- the library: create, read, delete; edit the per-user overlay only
grant select, insert, delete on public.saved_places to authenticated;
grant update (display_name, category_override, note, visit_state, visited_at)
  on public.saved_places to authenticated;

-- provenance: created or removed, never edited
grant select, insert, delete on public.saved_place_sources to authenticated;

-- place_lookups: nothing. It is a server-side provider cache (R11).

-- 4. anon holds nothing anywhere, restated after the blanket revoke above (08 §5.1).
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
