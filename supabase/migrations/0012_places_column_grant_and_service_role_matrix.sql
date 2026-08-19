-- 0012_places_column_grant_and_service_role_matrix.sql — two authorisation facts, both of which
-- were true only by inheritance until now: what a co-saver may read on `places`, and what the
-- trusted server role holds on anything.
--
-- WHY, PART 1 — `places` was granted table-wide to `authenticated`.
-- `08` §10 Q1 asked security-privacy to rule on one column (`created_at` as an inference channel).
-- Reviewing the delivered table rather than the question, the ruling (docs/security.md §2.6) is that
-- the inference channel is acceptable, and that the table-wide grant is not — for a different and
-- larger reason: `provider_payload jsonb` is the **raw third-party provider response**, stored
-- verbatim (`0005:24`, `08` §1.5), and a table-level SELECT ships it to the browser of every user who
-- saved that place. Nothing in the product reads it: `08` §7 C15–C18 (map, near-me, list, detail) need
-- our own normalised columns only. The exposure is therefore free to remove, and what it removes is
-- (a) an unbounded, unvalidated third-party blob crossing the trust boundary into the client, (b) the
-- provider-licensing surface R3 / `06` §11 are still open on, and (c) three internals with no client
-- meaning at all (`name_key`, `provider_fetched_at`, `merged_into_place_id` — the last of which is a
-- uuid of a row the reader never saved).
-- This is the same control `sources` already carries for `content_text` (R8, `0003:114`), applied to
-- the same class of data. Forward-only per `08` §9: it supersedes `0005:99` and `0008` §3's
-- `grant select on public.places`, which are left in place unedited.
--
-- A later migration that adds a column to `places` grants nothing by adding it, so a new column is
-- withheld from the client until someone names it here. That is the intended direction, and
-- inventory.sql check 5 is what makes the decision explicit rather than accidental.
--
-- WHY, PART 2 — nothing in this repo has ever granted `service_role` a table privilege.
-- Every trusted-server read and write (`08` §5: `sources`, `extractions`, `places`,
-- `place_provider_refs`, `place_lookups`, and the pipeline's own writes to `imports`) has been
-- running on Supabase's ALTER DEFAULT PRIVILEGES — `service_role=arwdDxtm` on new tables in `public`,
-- owned by `postgres` and `supabase_admin`. Measured 2026-08-19 in a throwaway
-- supabase/postgres:17.6.1.064 container: all eight privileges on all nine tables, no grant option,
-- no column grant. It is not an exposure — `service_role` is reachable only with the service key, and
-- it bypasses RLS regardless (`rolbypassrls`) — but it is inherited, not stated, and if Supabase ever
-- stops seeding those defaults the server path breaks at runtime rather than in CI.
-- So: state it. After this migration the matrix is repo-owned and identical in every environment, and
-- inventory.sql check 9 asserts it in both directions. Re-granting a privilege that is already held is
-- a no-op, so applying this to an existing project changes no behaviour there.
--
-- Deliberately NOT narrowed: `service_role` keeps ALL on the four user-owned tables. Its boundary is
-- **key placement** (server-only modules, never a client bundle) plus the review rule "a service-role
-- query never filters by `user_id`" (`08` §5, docs/security.md §4) — not privilege, because a role
-- that bypasses RLS on the global tables it must write cannot be fenced off the user tables by
-- grants alone in any way an attacker holding the key would notice. Narrowing it to the global cache
-- would also decide, now, questions MS6 owns (which role advances an `imports` row). Recorded as a
-- reviewable option in docs/security.md §2.6 rather than taken here.

-- 1. `places`: the client-readable column list. Everything else is server-side.
revoke all on public.places from anon, authenticated;
grant select (id, name, category, provider_category,
              address_line, locality, region, country_code,
              lat, lng)
  on public.places to authenticated;
-- Withheld, each for a stated reason:
--   name_key             derived dedup key; only resolve_place reads it (08 §1.2)
--   provider_payload     raw provider response — never crosses to the client (this file's header)
--   provider_fetched_at  cache freshness for the 30-day staleness gate (0011); server-side concern
--   merged_into_place_id a place uuid the reader has not saved; resolution follows chains server-side
--   created_at           row age. The disclosed inference channel of 08 §2.2, ruled acceptable in
--                        security.md §2.6 and dropped anyway because no product surface reads it.
--                        Note it is NOT closed by dropping it: place_provider_refs.first_seen_at
--                        carries the same signal and is still granted — see security.md §2.6.
--   updated_at           same, for provider refreshes
-- `select count(*)` still works for a co-saver: Postgres accepts a column-less count when the caller
-- holds SELECT on at least one column, which is why `sources` has read this way since 0003.

-- 2. The trusted server path, stated. One line per relation, grouped by why service_role has it.
--    ALL rather than a hand-picked verb list, on purpose: it is exactly what the hosted defaults
--    already grant, so this migration is provably a no-op on a live project, and a diff between the
--    two would be a silent behaviour change on staging and production instead of a documentation fix.

-- the global cache — the only class of write `08` §5 says needs elevation
grant all privileges on public.sources             to service_role;
grant all privileges on public.extractions         to service_role;
grant all privileges on public.places              to service_role;
grant all privileges on public.place_provider_refs to service_role;
-- the server-side provider cache: no user grant exists at all (R11, 0007:29)
grant all privileges on public.place_lookups       to service_role;
-- user-owned tables. Held today by hosted default, kept by decision (header, part 2)
grant all privileges on public.profiles            to service_role;
grant all privileges on public.imports             to service_role;
grant all privileges on public.saved_places        to service_role;
grant all privileges on public.saved_place_sources to service_role;

-- Not granted here, and asserted absent by inventory.sql check 9: WITH GRANT OPTION (service_role
-- must not be able to hand `authenticated` a privilege the design withholds) and any column-level
-- grant (its grants are table-level ALL; a column grant would mean someone narrowed it by hand and
-- the design no longer describes the database).
--
-- Nothing is granted to `anon` anywhere, by this or any other migration (`08` §5.1).
