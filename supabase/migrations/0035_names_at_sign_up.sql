-- 0035_names_at_sign_up.sql — a first and last name, collected at sign-up, stored where nobody but
-- their owner can read them.
--
-- Task `r2-names-db`. The ruling that governs this file is
-- `docs/db-ruling-profile-names-2026-08-31.md`; where the two differ, the ruling wins.
--
-- ═══ WHAT THE OWNER ASKED FOR ═════════════════════════════════════════════════════════════════
--
-- "Collect a first and last name at sign-up, so the product can address people by name."
--
-- That is PERSONALISATION: the product addressing *you*. It is not a request for a name to show to
-- other people. This file keeps those two things apart, because the schema is the only place they
-- can be kept apart — once a name reaches a column that a peer policy can see, no amount of
-- application care puts it back.
--
-- ═══ WHY NOT TWO COLUMNS ON `profiles` ════════════════════════════════════════════════════════
--
-- The obvious build is `alter table public.profiles add column first_name text, add column
-- last_name text`. MEASURED on the local container at base commit `f07d1b6`, that is wrong, and the
-- reason is two lines of existing schema that have nothing to do with names:
--
--     grant select on public.profiles to authenticated;            -- 0002:24, re-issued 0008:57
--     create policy profiles_select_collection_peers on public.profiles
--       for select to authenticated using (public.shares_a_collection_with(profiles.id));
--                                                                  -- 0024:589
--
-- The grant is TABLE-level, so it covers every column the table will ever have. The policy is
-- ROW-level, because RLS has no column dimension. Compose them and the rule is: **anyone who shares
-- a collection with you can read every column of your `profiles` row, including any column added
-- later.** A name column on that table is disclosed to every collection peer BY INHERITANCE, with
-- no decision taken by anybody.
--
-- That is not a reading of the policy, it is a reproduced control: `P7` in
-- `supabase/tests/0035_profile_names_policy_tests.sql` adds a probe column to `profiles` inside the
-- test transaction and the peer reads it back.
--
-- Postgres cannot express "the owner reads all columns of this row, a peer reads one of them" with
-- grants and RLS on a single table: privileges are per-column and row-blind, policies are per-row
-- and column-blind. The only representation of the actual access rule is a second relation.
--
-- ═══ TWO NAMES, TWO AUDIENCES, AND NEITHER DERIVES FROM THE OTHER ═════════════════════════════
--
--   public.profile_names   first_name, last_name   THE PRIVATE NAME. What the product calls you
--                                                  when it is talking to you. Readable by its
--                                                  owner and by nothing and nobody else.
--   public.profiles        display_name            THE PUBLIC LABEL. What other people see beside
--                                                  your name in a shared collection. UNCHANGED by
--                                                  this file — same column, same grant, same
--                                                  policies, same single writer: the user, through
--                                                  the "what should people call you" prompt.
--
-- AN EARLIER DRAFT OF THIS MIGRATION DERIVED `display_name` FROM `first_name` WITH A TRIGGER. That
-- was wrong and the reason is written into this repo already, in a doc comment on a function that
-- solves the identical problem for a different field. `emailLocalPart`
-- (`src/domain/collections/collection.ts:159-168`):
--
--     "Prefill, never fallback. The suggestion is shown to the person it is about, in a field they
--      have to confirm, which makes it consent; deriving a visible name from someone's address
--      *without* that confirmation would put a fragment of their email in front of collaborators
--      who were never given it. That is why `memberLabel` above falls back to `A collaborator` and
--      not to this."
--
-- Swap "address" for "given name" and the sentence is about this migration. A name typed into a
-- sign-up form to personalise the product is not consent to show that name to strangers in a shared
-- collection, and a trigger that copies one into the other launders the first into the second
-- silently. So there is NO trigger on `profiles`, this file issues no DDL against `profiles` at all,
-- and `display_name` keeps exactly the one writer it has today.
--
-- WHAT A COLLECTION PEER SEES INSTEAD, and it already ships: `memberLabel`
-- (`collection.ts:129-136`) returns `'You'` for yourself, the display name when there is one, and
-- **`'A collaborator'`** when there is not — never the email, for the reason quoted above.
-- `FORMER_MEMBER_LABEL` covers the deleted-account case. So withholding the private name from peers
-- costs the sharing surface nothing it is not already handling deliberately: the fallback is
-- designed, shipped, and is what every peer sees today, because `display_name` is null for all 8
-- accounts (MEASURED).
--
-- THIS IS NOT A THIRD NAME FIELD. It is two fields with two audiences and one writer each:
--   * `first_name`/`last_name` — the user (and sign-up on their behalf). Never rendered to anyone
--     else. Never copied anywhere.
--   * `display_name` — the user, through the prompt that asks them to confirm it.
-- The recommended `src/` follow-up is the pattern the codebase already uses: have that prompt
-- PREFILL from `first_name`. Prefill, never fallback — the peer-visible label still requires a
-- confirmation, and the user is not asked to type their name twice.
--
-- ═══ THE THREE REMAINING RULINGS ══════════════════════════════════════════════════════════════
--
-- R2. NULLABILITY — both columns are NULLABLE, and a user who supplied no name has NO ROW here at
--     all, so "absent" is one state rather than two ("no row" and "a row full of nulls").
--     "Required" is enforced at sign-up in the application, not here.
--
--     MEASURED: 8 profiles exist locally, every one with `display_name` null, none of which can be
--     back-filled — there is no name for them anywhere in the database, and `auth.users` holds an
--     email address, not a person's name. A `not null` column with no default is therefore
--     unwritable for those rows without inventing data, which guardrail 25 forbids.
--
--     The second reason is the sharper one and it is about the sign-up path specifically.
--     `handle_new_user()` runs inside the INSERT on `auth.users`. A hard constraint there does not
--     produce "please enter your name"; it produces a failed account creation with a Postgres
--     error surfaced through GoTrue, on a path where the product cannot render anything useful,
--     for every caller that does not send the metadata — the password-recovery flow, an
--     admin-created user, a future OAuth provider that returns only an email, and today's own
--     sign-up form, which sends no metadata at all.
--
--     THE CONSEQUENCE, STATED SO IT IS NOT DISCOVERED IN THE UI: absence is permanent and every
--     rendering site must handle it forever. That is not a new burden — it is the status quo, and
--     both fallbacks already exist and are deliberate (`memberLabel` -> 'A collaborator',
--     `accountIdentity` -> the email). What IS new is that the `src/` lane owns required-ness: the
--     sign-up form must validate the two fields and refuse to submit without them, or names will
--     be as absent tomorrow as they are today. The database will not catch that for you.
--
-- R3. WHO MAY WRITE — the posture `display_name` already has, tightened where it can be.
--
--     Closed column grants to `authenticated` only, own-row RLS, nothing to `anon`, nothing to
--     `service_role`, and no DELETE. Column lists rather than table-level grants, following
--     `place_mentions` (0031:394) and `places` (0012) rather than `profiles`' own table-level
--     grant — because a column-list grant means a column added later arrives UNGRANTED and the
--     next author has to decide, which is precisely the discipline whose absence made this file
--     necessary. `created_at`/`updated_at` are readable but not writable: they are the row's own
--     record, and a client that could write them could backdate it.
--
--     A user editing their own name is ordinary and is the INSERT/UPDATE grant plus
--     `profile_names_*_own`. A user editing someone else's is not expressible: `profile_id` is not
--     in the UPDATE column list, so a row cannot be given away, and the policies key on
--     `(select auth.uid())` so a cross-user UPDATE matches zero rows rather than raising.
--
-- R4. DOES SIGN-UP REACH THIS TABLE? The mechanism exists and is not fed.
--
--     MEASURED on the local container: `on_auth_user_created AFTER INSERT ON auth.users` exists,
--     `tgenabled = 'O'`, calling `public.handle_new_user()` (SECURITY DEFINER, owner `postgres`,
--     no EXECUTE grant to any role). So the profile row IS created by the database, and `0002`'s
--     fallback note about the trigger being rejected does not apply here.
--
--     What does not happen is the name arriving. `src/app/sign-in/sign-in-client.tsx:156-180` calls
--     `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })` and passes no
--     `data`, so `raw_user_meta_data` is `{}` on every account this product has ever created.
--     `src/app/actions/collections.ts:522` records the symptom in a comment; all 8 local rows
--     confirm it. THE CLIENT CHANGE IS STILL REQUIRED and is not this lane's: without
--     `options: { data: { first_name, last_name } }` on the `signUp` call, this migration stores
--     nothing new, correctly and silently.
--
-- ═══ SAFETY ═══════════════════════════════════════════════════════════════════════════════════
--
-- `profiles` is not touched at all: no DDL, no new trigger, no grant change, no policy change, and
-- `handle_new_user`'s `display_name` expression is byte-identical to `0002`'s. Nothing this file
-- does can make any existing surface render a name it does not render today. The one existing
-- object modified is `handle_new_user()`, by `create or replace` on an unchanged signature, so its
-- ACL is preserved; the revoke is re-issued anyway for the reason `0034`'s header gives. The new
-- function is revoked from `public` first — EXECUTE defaults to PUBLIC and a privilege held through
-- PUBLIC survives `revoke ... from anon`, which is the `0009`-then-`0018` bug, twice.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE TABLE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `profile_id` is both primary key and foreign key: one row per profile at most, and it dies with
-- the profile, which dies with the `auth.users` row (0002). That is the whole retention bound for
-- this data and it is structural — there is no scheduled job to forget and no soft-delete column
-- to get wrong. `deletion-block.ts` / `blocking-collections.ts` reason about exactly this cascade.
--
-- 1..80 rather than something tighter, and the number is not arbitrary: it is
-- `profiles_display_name_check`'s bound (0002:9). Nothing in this file copies one column into the
-- other, but the `src/` follow-up prefills the prompt from `first_name`, and a first name that
-- passes here and then fails there would be an unexplained 23514 from a table the user was not
-- writing to.
create table public.profile_names (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  first_name text check (first_name is null or length(btrim(first_name)) between 1 and 80),
  last_name  text check (last_name  is null or length(btrim(last_name))  between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profile_names is
  'A user''s given and family name, for the product to address them by. Kept off `profiles` on '
  'purpose: `profiles` carries a table-level SELECT grant to `authenticated` AND a collection-peer '
  'row policy (profiles_select_collection_peers, 0024), so any column added to it is readable by '
  'every collection peer; RLS has no column dimension and grants have no row dimension, so the '
  'only way to express "the owner reads this, a peer does not" is a second relation. Nothing but '
  'its owner can read this table: no peer policy, no anon grant, no service_role grant, and no '
  'SECURITY DEFINER function in `public` reads it. It is NOT the name other people see — that is '
  'profiles.display_name, which the user confirms in a prompt and which nothing here writes.';
comment on column public.profile_names.first_name is
  'The given name. Collected at sign-up (handle_new_user, from raw_user_meta_data) and editable by '
  'its owner. PRIVATE: never rendered to another user and never copied into display_name. '
  'Nullable, permanently — the 8 profiles that predate 0035 have no name anywhere to back-fill '
  'from, and a hard constraint here would turn a missing metadata field into a failed account '
  'creation inside the auth.users trigger. Required-ness is the sign-up form''s job.';
comment on column public.profile_names.last_name is
  'The family name. Stored, and read by nothing today: the product addresses people by given name '
  'and shows peers a separately-confirmed label. Collected because the owner asked for it, which '
  'makes it an identifying field with no current consumer — recorded here rather than left to be '
  'noticed.';

alter table public.profile_names enable row level security;
alter table public.profile_names force row level security;

-- A new table in `public` arrives with ALL granted to `anon` and `authenticated` from Supabase's
-- ALTER DEFAULT PRIVILEGES, and `Dxtm` to `service_role` from a second, `postgres`-owned entry
-- (0024's header, measured; 0031:377-382 restates it). Only an explicit revoke closes any of them,
-- and `scripts/check-migration-grants.sh` greps for exactly this shape. service_role is named for
-- 0031's reason: nothing on the trusted server path has any business reading a person's name, so a
-- leaked service key gets nothing here.
revoke all on public.profile_names from anon, authenticated, service_role;

-- Closed column lists, never table-level. `profile_id` is insertable (a user creates their own
-- row) but NOT updatable (a row cannot be re-parented). `created_at`/`updated_at` are readable but
-- not writable — the row's own record of itself. A column added by a later migration arrives
-- ungranted, which is the point.
grant select (profile_id, first_name, last_name, created_at, updated_at)
  on public.profile_names to authenticated;
grant insert (profile_id, first_name, last_name) on public.profile_names to authenticated;
grant update (first_name, last_name)             on public.profile_names to authenticated;
-- No DELETE grant and no DELETE policy: clearing a name is `set first_name = null`, and the row
-- itself dies with the profile. The pair is deliberate — `0031`'s header explains why a policy
-- without a matching grant is the dangerous half (it sits inert, reads as a control, and becomes
-- permission the moment someone adds the grant), so neither exists here.

-- `(select auth.uid())` rather than bare `auth.uid()`: evaluated once per statement as an InitPlan
-- instead of once per row. Same semantics, and it is the form the rest of this schema uses (0002).
--
-- THREE POLICIES, AND THE ABSENCE OF A FOURTH IS THE DESIGN. There is no peer policy here and
-- there must never be one: this table is the half of a person's identity that other users do not
-- get. A policy on `profile_names` whose qual is anything other than `= (select auth.uid())` means
-- somebody's legal name has been opened up.
create policy profile_names_select_own on public.profile_names
  for select to authenticated using (profile_id = (select auth.uid()));
create policy profile_names_insert_own on public.profile_names
  for insert to authenticated with check (profile_id = (select auth.uid()));
create policy profile_names_update_own on public.profile_names
  for update to authenticated using (profile_id = (select auth.uid()))
                                with check (profile_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. NORMALISATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Trim on write, and treat an empty string as absence. Without this the product has two distinct
-- "no first name" values (null and '') and every consumer has to know about both — and the CHECK
-- above would reject '' anyway, so a form that submits an untouched field would 23514 instead of
-- storing nothing. SECURITY INVOKER, and it writes only the row already being written: it touches
-- no other table, and in particular it does not touch `profiles`.
create or replace function public.normalise_profile_names() returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name  := nullif(btrim(new.last_name),  '');
  return new;
end;
$fn$;

revoke all on function public.normalise_profile_names() from public, anon, authenticated;

create trigger profile_names_normalise before insert or update on public.profile_names
  for each row execute function public.normalise_profile_names();

-- Fires after `profile_names_normalise` (triggers on the same event fire in name order, and
-- `_normalise` sorts before `_touch`), so `updated_at` moves for a real change only.
create trigger profile_names_touch before update on public.profile_names
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE SIGN-UP PATH
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `0002`'s body, extended by one INSERT. The `profiles` insert is UNCHANGED, expression for
-- expression, including which metadata keys can reach `display_name` — this file adds no new way
-- for anything to land in the column other users can read.
--
-- New: the private name. Three shapes are read, most specific first, because the key that carries
-- a name depends on who is calling:
--   * `first_name` / `last_name`     — what this product's own sign-up form will send.
--   * `given_name` / `family_name`   — the OIDC claim names, which is what a future Google or
--                                      Apple provider hands GoTrue verbatim.
--   * `display_name` / `full_name`   — a single string, and only when there is nothing better.
--                                      Split on the FIRST space: everything before it is the given
--                                      name, everything after it is the family name. That is wrong
--                                      for some names and right for most, so guardrail 25 applies:
--                                      it is a guess, it is the last resort, it never overrides an
--                                      explicit `first_name`, and it never invents a family name
--                                      that was not in the string.
--
-- `profiles` is inserted before `profile_names` because of the foreign key.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_first text;
  v_last  text;
  v_label text;
  v_space integer;
begin
  -- 0002's expression, unchanged. This is the ONLY thing that can write the peer-visible column,
  -- and 0035 does not widen it: same two keys, same trim, same 80-character clamp.
  v_label := left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name',
                                        new.raw_user_meta_data ->> 'full_name', '')), ''), 80);

  insert into public.profiles (id, display_name)
  values (new.id, v_label)
  on conflict (id) do nothing;

  v_first := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name',
                                   new.raw_user_meta_data ->> 'given_name',  '')), '');
  v_last  := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name',
                                   new.raw_user_meta_data ->> 'family_name', '')), '');

  if v_first is null and v_label is not null then
    v_space := position(' ' in v_label);
    if v_space > 0 then
      v_first := nullif(btrim(substr(v_label, 1, v_space - 1)), '');
      v_last  := coalesce(v_last, nullif(btrim(substr(v_label, v_space + 1)), ''));
    else
      v_first := v_label;
    end if;
  end if;

  -- Only when there is something to store. A user who supplies no name gets no row here at all,
  -- which is what makes "absent" a single state rather than "absent, or present and empty".
  if v_first is not null or v_last is not null then
    insert into public.profile_names (profile_id, first_name, last_name)
    values (new.id, left(v_first, 80), left(v_last, 80))
    on conflict (profile_id) do nothing;
  end if;

  return new;
end;
$fn$;

comment on function public.handle_new_user() is
  'Creates the profile row that every per-user table''s foreign key requires (R9), and, since '
  '0035, the profile_names row when sign-up supplied a name. The profiles insert is 0002''s, '
  'unchanged: display_name still comes only from a display_name/full_name key and 0035 adds no new '
  'route into the column collection peers can read. The private name is read in three tiers: '
  'first_name/last_name (our own form), given_name/family_name (the OIDC claims a future social '
  'provider would send), then a single display_name/full_name split on the first space as a last '
  'resort. Sends nothing of its own: if the client calls auth.signUp without options.data — which '
  'is what src/app/sign-in/sign-in-client.tsx did until 0035 — this function correctly stores no '
  'name at all.';

-- CREATE OR REPLACE preserves the ACL, so this is a no-op today. Re-issued because a future
-- signature change would DROP and CREATE and silently inherit PUBLIC EXECUTE again (0009, 0018).
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
