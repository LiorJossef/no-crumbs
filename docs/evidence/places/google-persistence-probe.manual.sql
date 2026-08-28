-- TOS-GATE-1 probe. Does anything in the schema stop a Google-derived coordinate from being
-- persisted permanently in `places`? Run inside a rolled-back transaction; writes nothing.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f <this file>
\set ON_ERROR_STOP 0
begin;

select '--- A. constraints on places.source_dataset (expect: none) ---' as probe;
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.places'::regclass and contype = 'c';

select '--- B. does places carry any TTL/expiry column? (expect: none) ---' as probe;
select column_name from information_schema.columns
 where table_name = 'places'
   and (column_name ilike '%expire%' or column_name ilike '%ttl%');

select '--- C. write a google-derived place through the real RPC ---' as probe;
select public.resolve_place(
  p_name => 'Probe Cafe TOS-GATE-1', p_lat => 32.0668, p_lng => 34.7749,
  p_country_code => 'IL', p_provider => 'google',
  p_provider_place_id => 'ChIJ_TOS_GATE_1_PROBE',
  p_category => 'cafe', p_address_line => null, p_locality => 'Tel Aviv',
  p_source_dataset => 'google-places', p_source_dataset_id => 'ChIJ_TOS_GATE_1_PROBE',
  p_resolution_score => 0.9
) as place_id \gset

select id, name, lat, lng, source_dataset, source_dataset_id, last_verified_at
  from public.places where id = :'place_id';

select '--- D. place_lookup_put: null TTL for google (expect: check_violation) ---' as probe;
select public.place_lookup_put('tos-gate-1-null', 'google', 'global', '{"x":1}'::jsonb, null);

select '--- E. place_lookup_put: 31-day TTL for google (expect: check_violation) ---' as probe;
select public.place_lookup_put('tos-gate-1-31d', 'google', 'global', '{"x":1}'::jsonb, 31*24*3600);

select '--- F. place_lookup_put: null TTL for overture (expect: succeeds) ---' as probe;
select public.place_lookup_put('tos-gate-1-ovt', 'overture', 'tlv', '{"x":1}'::jsonb, null);
select lookup_hash, provider, expires_at from public.place_lookups where lookup_hash like 'tos-gate-1%';

rollback;
