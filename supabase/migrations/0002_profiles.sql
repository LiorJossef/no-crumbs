-- 0002_profiles.sql — the per-user root row. Design: docs/08-place-identity.md §3.2.
-- Every per-user table's user_id points here (not at auth.users), so a profile row is a hard
-- precondition of the first import. R9 (technical-design.md §14) settles that in favour of
-- profiles; the signup trigger below is what makes the precondition self-satisfying.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on public.profiles from anon;
grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- (select auth.uid()) rather than bare auth.uid(): the scalar subquery is evaluated once per
-- statement (InitPlan) instead of once per row. Same semantics, materially faster, and it is the
-- form Supabase's own RLS performance guidance recommends. Used throughout this schema.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid()))
                             with check (id = (select auth.uid()));
-- No DELETE policy and no DELETE grant: a profile dies only with its auth.users row (cascade).

-- ---------------------------------------------------------------------------------------------
-- Signup trigger (B2 / R9). Without this, nothing creates the profile row that imports and
-- saved_places require, and the app's very first write after signup fails on a foreign key.
-- The INSERT grant above stays: it is the app-level fallback if this trigger cannot be created.
-- ---------------------------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name',
                               new.raw_user_meta_data ->> 'full_name', '')), ''), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- NOTE (verify on the real project): creating a trigger on auth.users requires rights on the auth
-- schema. This is Supabase's own documented pattern and migrations run as `postgres`, but if this
-- statement is rejected, delete it and create the profile from the server on first authenticated
-- request instead — the INSERT grant and policy above already permit that. Do not work around it
-- by weakening the profiles policies.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
