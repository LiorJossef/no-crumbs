\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
drop index if exists places_geog_gix;
truncate public.profiles cascade;
delete from auth.users;
truncate public.sources cascade;
truncate public.places cascade;
