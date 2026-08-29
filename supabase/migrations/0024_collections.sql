-- 0024_collections.sql — shared collections: the first row in this schema that one user may read
-- because *another* user put it there.
--
-- PROBLEM. Every read path built so far is a single sentence: "your row, keyed on your uid". 0002
-- (profiles), 0006 (saved_places, saved_place_sources) and the two membership gates 0006 added to
-- `places` / `place_provider_refs` are all `user_id = (select auth.uid())`, directly or through one
-- EXISTS. That model has exactly one user in it, and sharing does not fit inside it: the predicate
-- for "may I see this collection" is no longer a column comparison on the row, it is a lookup in a
-- membership table — and that membership table's own policy needs the same lookup, which is a
-- policy that recurses into itself. Postgres does not detect this as recursion at CREATE POLICY
-- time; it detects it at query time, as `infinite recursion detected in policy for relation
-- "collection_members"`, i.e. the feature compiles and then fails in production.
--
-- SCOPE, and it is deliberately narrow.
--   * Four tables: `collections`, `collection_members`, `collection_items`, `collection_invites`.
--   * Two new read paths, and only two: a collaborator may read the `places` row for a place in a
--     shared collection, and may read the `profiles` row of a collection peer. Nothing else opens.
--     In particular `saved_places` does NOT open — see the comment on places_select_if_in_shared_
--     collection, which is the security argument of this whole migration.
--   * Seven functions. Four are membership predicates the policies call; two are the invite
--     entry points (`join_collection_via_token`, `preview_collection_invite`); one is the trigger
--     that seats a collection's owner and is granted to nobody at all.
--   * One correctness fix that is not about sharing at all: `save_place` lost its
--     `apply_saved_place_source_link` call in 0017 and has been writing a NULL
--     `saved_places.source_url` on every import ever since. Measured, then fixed, at the end of
--     this file.
--
-- HOW THE RECURSION IS BROKEN. `postgres` carries BYPASSRLS (verified on the local container:
-- `select rolbypassrls from pg_roles where rolname = 'postgres'` → t). Migrations run as `postgres`
-- and therefore own these tables and these functions, so a SECURITY DEFINER function defined here
-- executes with BYPASSRLS and is not subject to FORCE ROW LEVEL SECURITY on the tables it reads.
-- Every membership question below is answered by such a function, so no policy ever reads
-- `collection_members` under RLS and nothing recurses. That is the mechanism; it is not an
-- optimisation and removing `security definer` from any of the four helpers breaks the feature at
-- runtime rather than at deploy time.
--
-- WHY THE HELPERS TAKE NO USER ARGUMENT. `collection_role(p_collection)` answers only about
-- `(select auth.uid())`. A two-argument `collection_role(p_collection, p_user)` would be more
-- general and would be a membership oracle the moment EXECUTE is granted to `authenticated`:
-- PostgREST exposes every executable function as `/rpc/<name>`, so any logged-in user could probe
-- "is user X in collection Y" for arbitrary X and Y. Single-argument by construction is the
-- control, not a convention — a definer function's argument list *is* its attack surface.
--
-- GRANT POSTURE, the two mistakes this repo has already made and must not make a third time.
--   1. A new table in `public` arrives with ALL granted to `anon` and `authenticated`, because the
--      hosted projects (and the local container) carry ALTER DEFAULT PRIVILEGES that the migration
--      role cannot remove — 0008's header, and check 0 of inventory.sql, which still reports the
--      defaults as live. So each table below is revoked from BOTH browser roles in one statement
--      before anything is granted back. `scripts/check-migration-grants.sh` greps for exactly that
--      shape.
--   2. A new function arrives with EXECUTE granted to PUBLIC. `revoke ... from anon` does not
--      remove a privilege held through PUBLIC — that is 0009's bug, reintroduced by 0017 and closed
--      again by 0018. Every function below is revoked `from public, anon, authenticated` and then
--      granted back to `authenticated` alone.
--
-- NO service_role GRANTS, on purpose. These four tables have no server-side read path at all: the
-- entire feature is anon-key + RLS from the browser. `service_role` holds BYPASSRLS but no grant
-- here, so a leaked service key still cannot enumerate other people's collections through these
-- tables. If a server-side need appears later it should be argued for in its own migration, not
-- inherited quietly from a matrix.
--
-- `service_role` is therefore NAMED IN THE REVOKE, which 0008's equivalent block does not do, and
-- that is a measured correction rather than a flourish. Running this migration against the local
-- container and then reading the ACLs back showed all four tables carrying
-- `service_role=MAINTAIN,REFERENCES,TRIGGER,TRUNCATE` that nothing here granted:
--
--   select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl;
--     -> postgres | r | {postgres=arwdDxtm/postgres, service_role=Dxtm/postgres}
--
-- i.e. a second ALTER DEFAULT PRIVILEGES entry, owned by `postgres` and separate from the
-- anon/authenticated ones 0008 documents, hands every new table in `public` TRUNCATE to
-- `service_role`. TRUNCATE is not subject to RLS — that is the exact severity 0008's header
-- records for `authenticated` — so a table designed to have no service-role path would have
-- arrived with a service-role path to empty it. Revoked here, and inventory.sql check 9 (whose
-- expected set does not contain these tables) is the runtime proof that it stayed revoked.
--
-- Forward-only (`08` §9). Nothing above 0023 is edited.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. TABLES
--    Created first, RLS enabled/forced and revoked immediately, policies added in section 3 once
--    the membership helpers exist. CREATE POLICY resolves both table and function references at
--    creation time, so the order is forced. Everything here is one transaction, so there is no
--    window in which a table exists without its policies.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- A named list of places, owned by exactly one user and shared with others by invitation.
create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();

create index collections_owner_idx on public.collections (owner_id);

alter table public.collections enable row level security;
alter table public.collections force  row level security;
revoke all on public.collections from anon, authenticated, service_role;

-- Who may do what in a collection. The join table that every policy in this file consults.
--
-- `authenticated` gets NO INSERT GRANT ON THIS TABLE AT ALL, and that is the load-bearing decision
-- of the whole design. A membership row is created by exactly two SECURITY DEFINER paths — the
-- AFTER INSERT trigger on `collections` (which seats the owner) and `join_collection_via_token`
-- (which redeems an invite) — both of which run as `postgres` and are the only writers. There is
-- no client-reachable statement that produces a membership row, so membership cannot be forged
-- from the browser even if a policy on this table were mistakenly widened later: with no INSERT
-- privilege the statement is refused before RLS is ever consulted. Column grants and RLS are two
-- independent controls and this table deliberately uses both.
create table public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id       uuid not null references public.profiles (id)    on delete cascade,
  role          text not null check (role in ('owner', 'editor', 'viewer')),
  -- Nullable and ON DELETE SET NULL: the inviter deleting their account must not delete the
  -- membership of the people they invited.
  invited_by    uuid references public.profiles (id) on delete set null,
  joined_at     timestamptz not null default now(),

  primary key (collection_id, user_id)
);

-- Exactly one owner per collection, enforced by the database rather than by policy arithmetic.
-- The membership UPDATE policy also refuses to write a second 'owner', but a partial unique index
-- is the control that survives a future policy edit.
create unique index collection_members_one_owner_idx
  on public.collection_members (collection_id) where role = 'owner';
-- "collections shared with me", newest first.
create index collection_members_user_idx
  on public.collection_members (user_id, joined_at desc);

alter table public.collection_members enable row level security;
alter table public.collection_members force  row level security;
revoke all on public.collection_members from anon, authenticated, service_role;

-- A place in a collection. The shared object; the per-user overlay stays in `saved_places`.
create table public.collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  place_id      uuid not null references public.places (id)      on delete restrict,
  -- Nullable, ON DELETE SET NULL, deliberately. A shared collection must survive a collaborator
  -- erasing their account (GDPR Art. 17): the item is de-identified — "added by" stops rendering a
  -- name — rather than vanishing out of other people's lists. Erasure of the departing user's data
  -- must not be a deletion of someone else's. Note this column is not in any client grant, so
  -- nulling it is a cascade of the account deletion and never a client edit.
  added_by      uuid references public.profiles (id) on delete set null,
  note          text check (note is null or length(note) <= 500),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A place appears at most once in a collection. The app treats a re-add as an idempotent no-op
  -- rather than surfacing a unique-violation as an error.
  constraint collection_items_unique unique (collection_id, place_id)
);

create trigger collection_items_touch before update on public.collection_items
  for each row execute function public.touch_updated_at();

-- The list read: one collection, in display order.
create index collection_items_order_idx
  on public.collection_items (collection_id, position, created_at);
-- Leads on place_id, which the (collection_id, place_id) unique index cannot serve. This is the
-- index `place_is_in_my_collection` runs on, and that function is called once per candidate row of
-- the `places` SELECT policy, so it is not optional.
create index collection_items_place_idx on public.collection_items (place_id);

alter table public.collection_items enable row level security;
alter table public.collection_items force  row level security;
revoke all on public.collection_items from anon, authenticated, service_role;

-- An invitation link. The token is the credential, so only the collection owner may read this row.
create table public.collection_invites (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  token         uuid not null unique default gen_random_uuid(),
  role          text not null default 'editor' check (role in ('editor', 'viewer')),
  created_by    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz
);
-- No index on collection_id: the only query that leads on it is the owner listing their own
-- invites, over a table with a handful of rows per collection. The unique index on `token` is the
-- one that matters, and it serves the redemption lookup.

alter table public.collection_invites enable row level security;
alter table public.collection_invites force  row level security;
revoke all on public.collection_invites from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. MEMBERSHIP HELPERS — SECURITY DEFINER, and the reason the policies terminate
--    All four are STABLE (they read tables; IMMUTABLE would be a lie and would let the planner
--    fold them), all four pin `search_path`, and all four are granted to `authenticated` because a
--    policy expression is evaluated as the *calling* role: without the grant every read on these
--    tables fails 42501 rather than returning zero rows.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- The CALLER's role in a collection, or null if they are not a member. Never answers about anyone
-- else — see the migration header on why the single argument is the security control.
create or replace function public.collection_role(p_collection uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select cm.role
    from public.collection_members cm
   where cm.collection_id = p_collection
     and cm.user_id = (select auth.uid())
$fn$;

comment on function public.collection_role(uuid) is
  'The calling user''s role in p_collection (owner/editor/viewer) or null. SECURITY DEFINER so it '
  'bypasses RLS on collection_members: without that, the SELECT policy on collection_members would '
  'call this function, which would read collection_members, which would evaluate the policy again.';

-- coalesce, not a bare IN: `null in ('owner','editor')` is NULL, and a function that returns NULL
-- where a boolean was promised is a trap for any later caller that is not a policy.
create or replace function public.can_edit_collection(p_collection uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(public.collection_role(p_collection) in ('owner', 'editor'), false)
$fn$;

-- Does the caller share a collection with this place in it? This is the predicate behind the new
-- read path on `places`. Definer for the same anti-recursion reason: it reads collection_items and
-- collection_members, both of whose policies consult collection_role.
create or replace function public.place_is_in_my_collection(p_place uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.collection_items ci
      join public.collection_members cm on cm.collection_id = ci.collection_id
     where ci.place_id = p_place
       and cm.user_id = (select auth.uid())
  )
$fn$;

-- Are the caller and p_user members of at least one collection in common? The predicate behind the
-- new read path on `profiles`. Callable directly over PostgREST by any logged-in user, which is
-- acceptable precisely because it discloses nothing the caller could not already learn by reading
-- the member lists of their own collections.
create or replace function public.shares_a_collection_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
      from public.collection_members mine
      join public.collection_members theirs on theirs.collection_id = mine.collection_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = p_user
  )
$fn$;

revoke all on function public.collection_role(uuid)             from public, anon, authenticated;
revoke all on function public.can_edit_collection(uuid)         from public, anon, authenticated;
revoke all on function public.place_is_in_my_collection(uuid)   from public, anon, authenticated;
revoke all on function public.shares_a_collection_with(uuid)    from public, anon, authenticated;

grant execute on function public.collection_role(uuid)           to authenticated;
grant execute on function public.can_edit_collection(uuid)       to authenticated;
grant execute on function public.place_is_in_my_collection(uuid) to authenticated;
grant execute on function public.shares_a_collection_with(uuid)  to authenticated;

-- ── the owner's membership row ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER because `authenticated` holds no INSERT on collection_members and no INSERT
-- policy exists there; an invoker-mode trigger would be refused. No EXECUTE grant is issued: a
-- trigger function is invoked by the executor, not by the calling role, so it needs none (asserted
-- by P4b in supabase/tests/0008_policy_tests.sql). Leaving it ungranted keeps it off the
-- browser-reachable RPC surface entirely.
create or replace function public.add_collection_owner_membership() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  insert into public.collection_members (collection_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (collection_id, user_id) do nothing;
  return null;
end;
$fn$;

revoke all on function public.add_collection_owner_membership() from public, anon, authenticated;

create trigger collections_owner_membership after insert on public.collections
  for each row execute function public.add_collection_owner_membership();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. GRANTS AND POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── collections ───────────────────────────────────────────────────────────────────────────────
grant select, delete on public.collections to authenticated;
-- SECOND DEVIATION FROM THE TASK SPEC, and the same one on all three writable tables: INSERT is
-- column-level, not table-level. The spec said `grant select, insert, delete`. Measured on the
-- local container, a table-level INSERT here also hands `authenticated` INSERT on `id`,
-- `created_at` and `updated_at` — a client can choose its own primary key and backdate its own
-- rows — and, worse, on `collection_invites.token`, which is a BEARER CREDENTIAL: a table-level
-- INSERT lets the creator pick the token instead of taking gen_random_uuid()'s, so a guessable or
-- deliberately-shared value becomes possible. This is 0017's own lesson applied before rather than
-- after the fact ("a table-wide grant on a link table is a standing licence over whatever columns
-- it grows next"), and it is why inventory.sql check 4 no longer expects table-level INSERT on
-- saved_places or saved_place_sources either.
grant insert (owner_id, name, description) on public.collections to authenticated;
-- Column-level UPDATE, same reasoning as 0006's grant on saved_places: `owner_id` is not
-- grantable, so "give my collection away" / "take someone's collection" is not expressible in SQL
-- at all, independently of whether the RLS policy is right. id/created_at/updated_at are likewise
-- withheld; updated_at is maintained by the touch trigger.
grant update (name, description) on public.collections to authenticated;

-- DEVIATION FROM THE TASK SPEC, and it is a bug fix rather than a widening. The specified predicate
-- was `collection_role(id) is not null` alone. Measured on the local container: with that predicate
-- `insert into collections (...) returning id` fails 42501
-- `new row violates row-level security policy for table "collections"`, because Postgres applies
-- the SELECT policy to a RETURNING tuple during the insert, while the AFTER ROW trigger that seats
-- the owner's membership row does not fire until the end of the statement. PostgREST — and
-- therefore `supabase-js` `.insert().select()` — always uses RETURNING, so the specified policy
-- makes creating a collection impossible from the client. The `owner_id` disjunct closes that
-- window and grants nothing new in the steady state: the trigger guarantees the owner always has
-- an 'owner' membership row, so the second disjunct is already true for exactly the same rows.
create policy collections_select_member on public.collections
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.collection_role(id) is not null);

create policy collections_insert_own on public.collections
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy collections_update_owner on public.collections
  for update to authenticated
  using       (public.collection_role(id) = 'owner')
  with check  (public.collection_role(id) = 'owner');

create policy collections_delete_owner on public.collections
  for delete to authenticated
  using (public.collection_role(id) = 'owner');

-- ── collection_members ────────────────────────────────────────────────────────────────────────
-- No INSERT grant. See the comment on the table.
grant select, delete on public.collection_members to authenticated;
grant update (role)  on public.collection_members to authenticated;

-- A member sees the whole member list: that is the "who else is in this collection" feature, and
-- it is the only reason profiles_select_collection_peers below has anything to resolve.
create policy collection_members_select_member on public.collection_members
  for select to authenticated
  using (public.collection_role(collection_id) is not null);

-- Two motions, one policy: a member leaves, or the owner removes someone. Neither can touch the
-- owner's own row — which is what stops the collection being orphaned and what keeps the partial
-- unique index from pointing at nothing. Consequence, intended: an owner cannot leave their own
-- collection; they delete it. Ownership transfer is not a feature of this migration.
create policy collection_members_delete_self_or_by_owner on public.collection_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or public.collection_role(collection_id) = 'owner')
  );

-- The owner may move a collaborator between editor and viewer. USING reads the OLD row (never the
-- owner's), WITH CHECK reads the NEW one (never 'owner'), so neither a second owner nor a
-- self-demotion can be written — belt and braces with collection_members_one_owner_idx.
create policy collection_members_update_by_owner on public.collection_members
  for update to authenticated
  using      (public.collection_role(collection_id) = 'owner' and role <> 'owner')
  with check (public.collection_role(collection_id) = 'owner' and role in ('editor', 'viewer'));

-- ── collection_items ──────────────────────────────────────────────────────────────────────────
grant select, delete on public.collection_items to authenticated;
-- Column-level INSERT (see the note on collections above). `added_by` IS insertable — the policy
-- pins it to auth.uid() — but `id`, `created_at` and `updated_at` are not.
grant insert (collection_id, place_id, added_by, note, position)
  on public.collection_items to authenticated;
-- `collection_id`, `place_id` and `added_by` are not UPDATE-grantable: an item cannot be moved to
-- another collection, repointed at another place, or re-attributed to another user after the fact.
grant update (note, position) on public.collection_items to authenticated;

create policy collection_items_select_member on public.collection_items
  for select to authenticated
  using (public.collection_role(collection_id) is not null);

-- Three conjuncts, all necessary:
--   * can_edit_collection — a viewer may not add;
--   * added_by = auth.uid() — attribution is not client-choosable, so "added by <someone else>"
--     cannot be forged (this is why added_by has no INSERT default and no UPDATE grant);
--   * the saved_places EXISTS — you may only share a place that is already in YOUR OWN library.
--     Without it, `collection_items` would be a write-anything pointer into the global `places`
--     table, and combined with places_select_if_in_shared_collection below it would become a
--     read primitive over every place row in the database: insert an arbitrary place id into a
--     collection you own, then select it out of `places`. That subquery is the thing that keeps
--     the new read path bounded by what a real user actually saved.
create policy collection_items_insert_editor on public.collection_items
  for insert to authenticated
  with check (
    public.can_edit_collection(collection_id)
    and added_by = (select auth.uid())
    and exists (select 1 from public.saved_places sp
                 where sp.place_id = collection_items.place_id
                   and sp.user_id  = (select auth.uid()))
  );

create policy collection_items_update_editor on public.collection_items
  for update to authenticated
  using      (public.can_edit_collection(collection_id))
  with check (public.can_edit_collection(collection_id));

create policy collection_items_delete_editor on public.collection_items
  for delete to authenticated
  using (public.can_edit_collection(collection_id));

-- ── collection_invites ────────────────────────────────────────────────────────────────────────
grant select, delete on public.collection_invites to authenticated;
-- `token` is deliberately ABSENT from this list, and it is the sharpest case of the column-level
-- INSERT argument above: the token is the credential that admits a stranger to somebody's
-- collection, so it must come from gen_random_uuid() and never from the request body. `id` and
-- `created_at` are withheld for the same reason they are everywhere else; `revoked_at` is withheld
-- because an invite that arrives already revoked is not a state the product has, and revocation
-- has its own UPDATE grant below.
grant insert (collection_id, role, expires_at, created_by)
  on public.collection_invites to authenticated;
-- Only `revoked_at` is UPDATE-writable: an invite is created, revoked, or deleted. Its `role` and
-- `expires_at` are fixed at creation, so a live link cannot be silently upgraded from viewer to
-- editor after it has been sent.
grant update (revoked_at) on public.collection_invites to authenticated;

-- All four commands are owner-only. `token` is a bearer credential, so "a member may list the
-- invites" would hand every collaborator the ability to mint new members.
create policy collection_invites_select_owner on public.collection_invites
  for select to authenticated
  using (public.collection_role(collection_id) = 'owner');

create policy collection_invites_insert_owner on public.collection_invites
  for insert to authenticated
  with check (public.collection_role(collection_id) = 'owner'
              and created_by = (select auth.uid()));

create policy collection_invites_update_owner on public.collection_invites
  for update to authenticated
  using      (public.collection_role(collection_id) = 'owner')
  with check (public.collection_role(collection_id) = 'owner');

create policy collection_invites_delete_owner on public.collection_invites
  for delete to authenticated
  using (public.collection_role(collection_id) = 'owner');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. REDEEMING AN INVITE, AND PREVIEWING ONE BEFORE ACCEPTING IT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The only client-reachable writer of a membership row. SECURITY DEFINER because the invitee can
-- neither read `collection_invites` (owner-only policy) nor insert into `collection_members` (no
-- grant) — which is the design: the token, not a privilege, is what carries the authorisation.
create or replace function public.join_collection_via_token(p_token uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_invite public.collection_invites;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select ci.* into v_invite
    from public.collection_invites ci
   where ci.token = p_token
     and ci.revoked_at is null
     and (ci.expires_at is null or ci.expires_at > now());

  -- ONE message for all three failures — no such token, revoked, expired — and deliberately so.
  -- A caller who can tell "revoked" from "unknown" can enumerate which tokens ever existed, and a
  -- caller who can tell "expired" from "unknown" learns that a given collection exists and had a
  -- link. The distinction is worth nothing to a legitimate user (the link does not work either
  -- way) and is worth something to an attacker, so it is not made.
  if not found then
    raise exception 'this invite link is not usable' using errcode = '22023';
  end if;

  -- Idempotent, and non-destructive on purpose: DO NOTHING rather than DO UPDATE SET role. A
  -- DO UPDATE here would let anyone holding a viewer link *demote the owner* by redeeming it while
  -- already being the owner — the collection's own creator clicking their own share link would
  -- lock themselves out of it. Re-joining therefore never changes an existing role.
  insert into public.collection_members (collection_id, user_id, role, invited_by)
  values (v_invite.collection_id, v_uid, v_invite.role, v_invite.created_by)
  on conflict (collection_id, user_id) do nothing;

  return v_invite.collection_id;
end;
$fn$;

revoke all on function public.join_collection_via_token(uuid) from public, anon, authenticated;
grant execute on function public.join_collection_via_token(uuid) to authenticated;

-- ── what am I being invited to? ───────────────────────────────────────────────────────────────
-- The join screen (`/collections/join/[token]`) has to name the collection before the person taps
-- Join. At that moment they are not a member, so every policy in this file returns them zero rows:
-- they cannot read `collections` (not a member), cannot read `collection_invites` (owner-only) and
-- cannot read the inviter's `profiles` row (not yet a peer). This function is the only answer to
-- that question, and it is deliberately the narrowest one that still makes the screen honest.
--
-- WHAT IT WILL NOT RETURN, and this is the part to defend in review: no place count, no member
-- count, no description, no member list. A count is a fact about content the caller has no
-- permission to read — "17 places" and "6 members" are exactly the aggregates that make a leaked
-- or brute-forced token worth something on its own. Five fields, all of which the invitee is about
-- to see anyway if they accept.
--
-- NOT GRANTED TO `anon`. A signed-out visitor gets a generic screen from the application instead.
-- `docs/product-backlog-2026-08-29.md` §10 flags the first unauthenticated read over personal
-- location data as the thing to hold hardest, and an anon-callable /rpc/preview_collection_invite
-- would be precisely that: an unauthenticated, token-guessable read of a real person's collection
-- name and display name. The `auth.uid()` guard below is the second half of the same control, so
-- the function is closed both by grant and by its own first statement.
--
-- ZERO ROWS for unknown, revoked and expired alike — the same uniform-failure rule, and the same
-- reasoning, as join_collection_via_token above. An empty result set cannot distinguish the three,
-- which is why this returns a set rather than raising.
create or replace function public.preview_collection_invite(p_token uuid)
returns table (
  collection_id   uuid,
  collection_name text,
  inviter_name    text,
  role            text,
  already_member  boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select c.id,
           c.name,
           pr.display_name,
           ci.role,
           exists (select 1 from public.collection_members cm
                    where cm.collection_id = c.id and cm.user_id = v_uid)
      from public.collection_invites ci
      join public.collections c on c.id = ci.collection_id
      -- LEFT JOIN: profiles.display_name is nullable and the inviter's account may since have been
      -- deleted, in which case created_by's cascade has already taken the invite with it — but the
      -- left join keeps the shape honest rather than silently dropping the row on a null name.
      left join public.profiles pr on pr.id = ci.created_by
     where ci.token = p_token
       and ci.revoked_at is null
       and (ci.expires_at is null or ci.expires_at > now());
end;
$fn$;

revoke all on function public.preview_collection_invite(uuid) from public, anon, authenticated;
grant execute on function public.preview_collection_invite(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. THE TWO NEW CROSS-TABLE READ PATHS — the entire point, and the entire risk
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Until now `places` was readable through exactly one policy: places_select_if_saved (0006), "a
-- place is visible only to a user who saved it". This adds the second and, deliberately, the ONLY
-- other one. A collaborator gets the shared place IDENTITY — name, category, coordinates, address —
-- and nothing whatsoever from the adder's private overlay in `saved_places`: `note`,
-- `display_name`, `category_override`, `visit_state`, `visited_at`, `tags`, `why_go`,
-- `extracted_reason` and `source_url` all stay behind saved_places_select_own and do not travel
-- with a share.
--
-- `visit_state` is called out by name because it is the one that would be most tempting to include
-- and is the one that must not be: `want_to_go` is a statement about where a person INTENDS to be
-- in the future. Sharing a place is a statement about a restaurant; sharing `want_to_go` is a
-- disclosure of future location intent to everyone the collection is shared with, including
-- whoever a link was forwarded to. Those are not the same disclosure and this migration only makes
-- the first one.
--
-- No matching policy is added to `place_provider_refs`, `sources`, `extractions`,
-- `saved_place_sources` or `saved_places`. In particular the source TikTok of a shared place is
-- NOT disclosed: which post someone saved a place from is part of their import history.
create policy places_select_if_in_shared_collection on public.places
  for select to authenticated
  using (public.place_is_in_my_collection(places.id));

-- What makes "added by <name>" renderable. `profiles` holds no email address (0002: id,
-- display_name, created_at, updated_at), so the disclosure to a collection peer is a display name
-- and two timestamps. The email lives in `auth.users`, which no browser role can read at all.
create policy profiles_select_collection_peers on public.profiles
  for select to authenticated
  using (public.shares_a_collection_with(profiles.id));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. UNRELATED P0 FIX — save_place stopped writing saved_places.source_url in 0017
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MEASURED on the local container before writing this section, not assumed:
--
--   select prosrc from pg_proc where proname = 'save_place';
--     -> the live body inserts into saved_place_sources and returns. There is no
--        `perform public.apply_saved_place_source_link(v_id, p_source_id)` line in it.
--
--   select (source_url is not null) has_url, count(*), min(created_at), max(created_at)
--     from public.saved_places group by 1;
--     ->  t |  7 | 2026-08-24 13:22:51+00 | 2026-08-26 10:02:51+00
--         f | 24 | 2026-08-26 11:05:43+00 | 2026-08-28 13:18:33+00
--
-- 0017 was committed at 2026-08-26 10:24 UTC. Every save before that timestamp carries a
-- source_url; every save after it is null, with no overlap in either direction — and all 31 rows
-- are origin='import', so all 31 had a source to denormalise from. The claim is confirmed: 0016
-- added the call, 0017 recreated `save_place` for the new `p_extracted_reason` argument and
-- dropped it, and the column has been dead for two days. Nothing else writes it — grep finds no
-- caller of apply_saved_place_source_link anywhere in src/ or scripts/, which is why losing the
-- call inside save_place lost the column entirely.
--
-- The fix is 0017's body, byte for byte, with the one `perform` restored in the position 0016 put
-- it: after the saved_place_sources insert, inside the `p_source_id is not null` branch, so a
-- manual add still does nothing.
--
-- NOT DONE HERE, and it is a decision rather than an omission: the 24 existing null rows are not
-- backfilled. The value is recoverable for every one of them (the earliest saved_place_sources row
-- joins to sources.canonical_url), but a backfill is a data write against real user rows on
-- staging and production, it belongs in its own migration with its own review, and getting the
-- "first source" tie-break wrong would rewrite provenance rather than restore it.
create or replace function public.save_place(
  p_place_id         uuid,
  p_source_id        uuid default null,   -- null => manual addition (acceptance A1)
  p_note             text default null,
  -- The extractor's verbatim caption fragment for this candidate. Never model prose, never a
  -- paraphrase: `src/domain/extraction/schema.ts` requires `evidence` to be a substring of the
  -- caption, which is what makes a fabrication a substring check rather than a judgement call.
  p_extracted_reason text default null
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into saved_places (user_id, place_id, origin, note, extracted_reason)
  values (v_uid, p_place_id,
          case when p_source_id is null then 'manual' else 'import' end,
          p_note, p_extracted_reason)
  -- Only granted columns may appear here: `authenticated` holds UPDATE on the overlay columns
  -- only, and the touch trigger maintains updated_at. `extracted_reason` is INSERT-only by
  -- design, so it cannot appear in this DO UPDATE list at all — a second save of the same place
  -- keeps the reason recorded by the first one.
  on conflict (user_id, place_id)
    do update set note = coalesce(excluded.note, saved_places.note)
  returning id into v_id;

  if p_source_id is not null then
    insert into saved_place_sources (saved_place_id, user_id, source_id)
    values (v_id, v_uid, p_source_id)
    on conflict do nothing;               -- re-importing the same post twice: idempotent

    -- RESTORED (0016, dropped by 0017). First-source-only cache fill; a no-op past the first call
    -- for this saved place, because the helper coalesces on both columns. This is the only writer
    -- of saved_places.source_url / source_thumbnail_url in the system.
    perform public.apply_saved_place_source_link(v_id, p_source_id);
  end if;

  return v_id;
end;
$fn$;

-- CREATE OR REPLACE preserves the existing privileges, so this pair is strictly a no-op today and
-- is re-issued anyway. Two reasons. First, a future edit that has to change the signature will
-- DROP and CREATE (as 0017 did) and will then silently inherit PUBLIC EXECUTE again unless this
-- block travels with the definition — that is exactly the 0009/0018 bug, twice. Second, keeping
-- the revoke/grant pair adjacent to the body makes the intended posture readable at the
-- definition instead of three migrations away.
revoke all on function public.save_place(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.save_place(uuid, uuid, text, text) to authenticated;

commit;
