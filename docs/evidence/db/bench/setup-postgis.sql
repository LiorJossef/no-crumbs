\set ON_ERROR_STOP on
create index if not exists places_geog_gix on public.places using gist (geog);
vacuum (analyze) public.places;
vacuum (analyze) public.saved_places;
select (select count(*) from places) places, (select count(*) from saved_places) saved,
       pg_size_pretty(pg_table_size('public.places')) heap,
       pg_size_pretty(pg_relation_size('places_lat_lng_idx')) btree_latlng,
       pg_size_pretty(pg_relation_size('places_geog_gix')) gist_geog;
