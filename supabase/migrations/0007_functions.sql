-- 0007_functions.sql — the provider-lookup cache and the four functions that own every write
-- the domain cannot do with a plain statement.
-- Design: docs/08-place-identity.md §3.7, with:
--   B1/R6 place_lookups created here, next to the resolver it serves (08 §3 gave it no home)
--   B3    resolve_place's concurrent-insert path no longer leaves an aliasless place behind
--   B7    start_import added: the only way an imports row is created

-- ---------------------------------------------------------------------------------------------
-- place_lookups (R6): the PlaceResolver's provider-response cache. Lives behind the port; the
-- domain does not know it exists. Key: sha256(normalised_candidate + region_id + category_hint).
-- TTL per 06 §6.4 — open-data hits may be cached permanently (expires_at null), Nominatim hits
-- for 90 days. The caller sets expires_at; the schema does not assume a provider mix.
-- ---------------------------------------------------------------------------------------------
create table public.place_lookups (
  lookup_hash text primary key check (lookup_hash ~ '^[0-9a-f]{64}$'),
  provider    text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  region_id   text,
  response    jsonb not null,
  hit_count   integer not null default 0 check (hit_count >= 0),
  created_at  timestamptz not null default now(),
  last_hit_at timestamptz,
  expires_at  timestamptz            -- null = cache permanently (open data, 06 §6.4)
);
create index place_lookups_expiry_idx on public.place_lookups (expires_at)
  where expires_at is not null;

alter table public.place_lookups enable row level security;
alter table public.place_lookups force  row level security;
revoke all on public.place_lookups from anon, authenticated;
-- No grant and no policy: deny-all for every non-bypassing role. This is a server-side cache of
-- provider responses; nothing in a browser reads it.

-- ---------------------------------------------------------------------------------------------
-- start_import (B7): the ONLY way an imports row is created. Trusted-server only.
-- Inserts the pending source (R4) and the import in one transaction, and returns the existing
-- open import instead of a duplicate (R5 / 07's idempotency rules). Because no role holds INSERT
-- on imports, a user cannot forge an import row naming a source they never pasted.
-- ---------------------------------------------------------------------------------------------
create or replace function public.start_import(
  p_user_id            uuid,
  p_platform           text,
  p_platform_source_id text,
  p_canonical_url      text
) returns table (import_id uuid, import_source_id uuid, import_status text, is_idempotent boolean)
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_source_id uuid;
  v_import    public.imports%rowtype;
  c_open      constant text[] := array['processing', 'review', 'no_places', 'failed'];
begin
  if p_user_id is null then
    raise exception 'start_import requires a user id' using errcode = '22004';
  end if;

  -- R4: the source row exists before stage A runs — the video id is known at canonicalisation,
  -- before any network call — which is what lets imports.source_id be NOT NULL.
  insert into sources (platform, platform_source_id, canonical_url)
  values (p_platform, p_platform_source_id, p_canonical_url)
  on conflict (platform, platform_source_id) do update set updated_at = now()
  returning id into v_source_id;

  -- R5: at most one open import per (user, source), guaranteed by imports_open_one_per_source.
  select * into v_import from imports i
   where i.user_id = p_user_id and i.source_id = v_source_id and i.status = any (c_open);

  if found then
    return query select v_import.id, v_source_id, v_import.status, true;
    return;
  end if;

  begin
    insert into imports (user_id, source_id)
    values (p_user_id, v_source_id)
    returning * into v_import;
  exception when unique_violation then
    -- A concurrent paste (second tab) won the race. Adopt its row rather than failing the request.
    select * into v_import from imports i
     where i.user_id = p_user_id and i.source_id = v_source_id and i.status = any (c_open);
    return query select v_import.id, v_source_id, v_import.status, true;
    return;
  end;

  return query select v_import.id, v_source_id, v_import.status, false;
end;
$fn$;

revoke all on function public.start_import(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.start_import(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- resolve_place: the ONLY way a places row is created. Trusted-server only.
-- SECURITY DEFINER + granted exclusively to service_role: the data it writes is provider output,
-- not user input, and must not be user-forgeable (08 §2.2 rule 2).
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
  v_place_id     uuid;
  v_new_place_id uuid;
  v_dlat double precision;
  v_dlng double precision;
begin
  -- 1. exact alias match, following any merge tombstone
  select coalesce(pl.merged_into_place_id, pl.id)
    into v_place_id
    from place_provider_refs r
    join places pl on pl.id = r.place_id
   where r.provider = p_provider and r.provider_place_id = p_provider_place_id;

  if v_place_id is not null then
    update place_provider_refs
       set last_seen_at = now(), retired_at = null
     where provider = p_provider and provider_place_id = p_provider_place_id;
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
    return v_place_id;
  end if;

  -- 2. near-duplicate guard: same normalised name, same country, within c_merge_radius_km
  v_dlat := c_merge_radius_km / 111.045;
  v_dlng := c_merge_radius_km / (111.045 * greatest(cos(radians(p_lat)), 0.01));

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
    return v_place_id;
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
    select coalesce(pl.merged_into_place_id, pl.id) into v_place_id
      from places pl where pl.id = v_place_id;      -- follow a tombstone if the winner lost a merge
  end if;

  return v_place_id;
end;
$fn$;

revoke all on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------
-- save_place: the user-facing write. SECURITY INVOKER on purpose — RLS still applies, so this
-- gives atomicity WITHOUT elevation. It cannot write anyone else's rows.
-- Implements acceptance I3 / I4 / A2: second import of a known place adds a source, not a row.
-- ---------------------------------------------------------------------------------------------
create or replace function public.save_place(
  p_place_id  uuid,
  p_source_id uuid default null,          -- null => manual addition (acceptance A1)
  p_note      text default null
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

  insert into saved_places (user_id, place_id, origin, note)
  values (v_uid, p_place_id,
          case when p_source_id is null then 'manual' else 'import' end,
          p_note)
  -- Only granted columns may appear here: `authenticated` holds UPDATE on the overlay columns
  -- only, and the touch trigger maintains updated_at.
  on conflict (user_id, place_id)
    do update set note = coalesce(excluded.note, saved_places.note)
  returning id into v_id;

  if p_source_id is not null then
    insert into saved_place_sources (saved_place_id, user_id, source_id)
    values (v_id, v_uid, p_source_id)
    on conflict do nothing;               -- re-importing the same post twice: idempotent
  end if;

  return v_id;
end;
$fn$;

grant execute on function public.save_place(uuid, uuid, text) to authenticated;
revoke all on function public.save_place(uuid, uuid, text) from anon;

-- ---------------------------------------------------------------------------------------------
-- merge_places: repair path for provider migration collisions (08 §1.4). Trusted-server only.
-- Nothing is deleted; the loser becomes a permanent tombstone so old references still resolve.
-- ---------------------------------------------------------------------------------------------
create or replace function public.merge_places(p_loser uuid, p_winner uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if p_loser = p_winner then
    raise exception 'cannot merge a place into itself';
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
  update places set merged_into_place_id = p_winner, updated_at = now() where id = p_loser;
end;
$fn$;

revoke all on function public.merge_places(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_places(uuid, uuid) to service_role;
