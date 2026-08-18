-- 0005_places.sql — the global POI table and provider identity as aliases.
-- Design: docs/08-place-identity.md §3.5. Unchanged by §14.

-- A real-world POI. Identity is `id` (ours). Provider identity lives in place_provider_refs.
create table public.places (
  id                   uuid primary key default gen_random_uuid(),

  name                 text not null check (length(btrim(name)) between 1 and 200),
  name_key             text generated always as (public.place_name_key(name)) stored,
  category             text,          -- our normalised taxonomy
  provider_category    text,          -- provider's own value, kept verbatim

  address_line         text,
  locality             text,
  region               text,
  country_code         char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),

  -- WGS84 / EPSG:4326 decimal degrees. The single canonical representation (see 0001 header).
  lat                  double precision not null check (lat between -90  and 90),
  lng                  double precision not null check (lng between -180 and 180),

  provider_payload     jsonb,         -- raw provider response, namespaced under its provider slug
  provider_fetched_at  timestamptz,

  -- Tombstone: set when this row loses a merge. Reads follow the chain; nothing is deleted.
  merged_into_place_id uuid references public.places (id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint places_no_self_merge check (merged_into_place_id is null or merged_into_place_id <> id)
);

create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();

-- step 2 of resolution: the near-duplicate guard probe
create index places_name_key_idx on public.places (name_key, country_code);
-- whole-table geographic maintenance only; no per-user query needs it (08 §6.2)
create index places_lat_lng_idx  on public.places (lat, lng);

-- Provider identity as ALIASES. Many per place; unique per provider pair globally.
create table public.place_provider_refs (
  id                uuid primary key default gen_random_uuid(),
  place_id          uuid not null references public.places (id) on delete cascade,
  provider          text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_place_id text not null check (length(btrim(provider_place_id)) between 1 and 200),
  is_primary        boolean not null default false,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  retired_at        timestamptz,      -- provider no longer serves this id; row kept as history

  constraint ppr_provider_identity unique (provider, provider_place_id)
);
create index ppr_place_idx on public.place_provider_refs (place_id);
-- At most one primary alias per place.
create unique index ppr_one_primary_idx on public.place_provider_refs (place_id) where is_primary;

-- Every place has at least one alias (deferred: the alias is inserted after the place).
create or replace function public.assert_place_has_alias() returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
-- `new.id`, not coalesce(new.id, old.id): this trigger is AFTER INSERT only, so OLD is unassigned,
-- and plpgsql raises `record "old" has no field "id"` when an unassigned record is referenced —
-- COALESCE does not save it, because the record still has to be materialised as a parameter.
declare v_place_id uuid := new.id;
begin
  if not exists (select 1 from public.places where id = v_place_id) then
    return null;                                    -- place is gone; nothing to assert
  end if;
  if not exists (select 1 from public.place_provider_refs where place_id = v_place_id) then
    raise exception 'place % has no provider ref (identity invariant, 08 §1.6)', v_place_id
      using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create constraint trigger places_alias_required
  after insert on public.places
  deferrable initially deferred
  for each row execute function public.assert_place_has_alias();

alter table public.places              enable row level security;
alter table public.places              force  row level security;
alter table public.place_provider_refs enable row level security;
alter table public.place_provider_refs force  row level security;

revoke all on public.places              from anon, authenticated;
revoke all on public.place_provider_refs from anon, authenticated;
grant select on public.places              to authenticated;
grant select on public.place_provider_refs to authenticated;
-- Read-only for users. No INSERT/UPDATE/DELETE grant and no such policy: global rows are written
-- only by the trusted server, so no user can mutate a place another user's map depends on.

-- The membership gate ("a place is visible only to a user who saved it") must name
-- `saved_places`, which does not exist until 0006, and CREATE POLICY resolves table references at
-- creation time. It is therefore created at the end of 0006. RLS is already enabled and forced
-- here, so between the two migrations these tables are deny-all for every role: the intermediate
-- state errs closed, which is the only acceptable direction for an intermediate state.
