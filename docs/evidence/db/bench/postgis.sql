\set ON_ERROR_STOP on
create extension if not exists postgis with schema extensions;
alter table public.places
  add column if not exists geog geography(Point,4326)
  generated always as (extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::geography) stored;
create index if not exists places_geog_gix on public.places using gist (geog);
vacuum (analyze) public.places;
select pg_size_pretty(pg_relation_size('places_geog_gix'))   as gist_idx,
       pg_size_pretty(pg_relation_size('places_lat_lng_idx')) as btree_idx,
       pg_size_pretty(pg_table_size('public.places'))         as places_heap;
