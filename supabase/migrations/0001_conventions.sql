-- 0001_conventions.sql — coordinate convention and the immutable helpers everything else builds on.
-- Design: docs/08-place-identity.md §3.1. No table is created here.
--
-- Coordinates: WGS84 / EPSG:4326, decimal degrees, double precision, lat then lng.
-- This is the ONLY coordinate representation in the system. No PostGIS, no geohash, no
-- string-packed pairs, no per-table variation (D6, docs/08-place-identity.md §6).
-- No extensions are created. gen_random_uuid() is built into Postgres 13+.

-- Distance in kilometres between two WGS84 points. Immutable so it can be used in indexes,
-- generated columns and CHECKs. Great-circle (Haversine), mean earth radius 6371.0088 km.
create or replace function public.km_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe
as $fn$
  select 2 * 6371.0088 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$fn$;

comment on function public.km_between(double precision, double precision, double precision, double precision) is
  'Haversine km between two WGS84 points. IMMUTABLE: usable in indexes, generated columns and CHECKs.';

-- Name key for the near-duplicate guard: lowercase, strip everything that is not alphanumeric.
-- Deliberately does NOT fold diacritics (unaccent() is not IMMUTABLE; see 08 §1.2).
create or replace function public.place_name_key(p text) returns text
language sql immutable parallel safe
as $fn$
  select nullif(regexp_replace(lower(coalesce(p, '')), '[^[:alnum:]]+', '', 'g'), '');
$fn$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;
