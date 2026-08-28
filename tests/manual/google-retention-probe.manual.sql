-- TOS-DISPLAY-1 / security-privacy, 2026-08-28.
-- Attacks the 30-day retention boundary on the RECORD tables (places, extractions) and on the
-- CACHE table (place_lookups). Everything runs inside a transaction that is rolled back; nothing
-- here mutates the database. Run:
--   docker exec -i supabase_db_P-002 psql -U postgres -d postgres -v ON_ERROR_STOP=0 \
--     < tests/manual/google-retention-probe.manual.sql
\set ON_ERROR_STOP 0
begin;

\echo '--- A1: can a Google place row be written with an ancient provider_fetched_at? ---'
select public.resolve_place(
  p_provider => 'google', p_provider_place_id => 'ChIJ_TOSDISPLAY1_probe',
  p_name => 'Probe Cafe TOS-DISPLAY-1', p_lat => 32.0668, p_lng => 34.7749,
  p_category => 'cafe', p_provider_category => 'cafe',
  p_address_line => '1 Probe St', p_locality => 'Tel Aviv-Yafo', p_region => null,
  p_country_code => 'IL', p_provider_payload => null,
  p_source_dataset => 'google-places', p_source_dataset_id => 'ChIJ_TOSDISPLAY1_probe',
  p_resolution_score => 0.9) is not null as "resolve_place accepted a google row";
select name, source_dataset, lat, lng, address_line, provider_fetched_at
  from public.places where source_dataset_id = 'ChIJ_TOSDISPLAY1_probe';

\echo '--- A2: back-date it 400 days. Does any CHECK, trigger or rule object? ---'
update public.places
   set provider_fetched_at = now() - interval '400 days',
       created_at          = now() - interval '400 days'
 where source_dataset_id = 'ChIJ_TOSDISPLAY1_probe';
select count(*) as "google rows older than 30 days, after back-dating"
  from public.places
 where source_dataset = 'google-places'
   and provider_fetched_at < now() - interval '30 days';

\echo '--- A3: is there anything at all that would delete it? ---'
select count(*) as "scheduled jobs (pg_cron)"
  from pg_extension where extname = 'pg_cron';
select count(*) as "CHECK constraints on places mentioning source_dataset"
  from pg_constraint
 where conrelid = 'public.places'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%source_dataset%';
select count(*) as "columns on places or extractions named like an expiry"
  from information_schema.columns
 where table_schema = 'public' and table_name in ('places','extractions')
   and column_name ~ 'expir|ttl|delete_after|purge';

\echo '--- A4: place_lookups. Does an expired Google row survive with no further write? ---'
insert into public.place_lookups (lookup_hash, provider, region_id, response, expires_at)
values (repeat('a',64), 'google', null, '{"probe":true}'::jsonb, now() - interval '1 day');
select count(*) as "expired google cache rows present, no write since" from public.place_lookups
 where expires_at < now();
select public.place_lookup_get(repeat('a',64)) as "get on an expired row (expect null)";
select count(*) as "still present after a GET" from public.place_lookups where expires_at < now();

\echo '--- A5: ... and is it deleted by the NEXT put? ---'
select public.place_lookup_put(repeat('b',64), 'google', null, '{"probe":2}'::jsonb, 60);
select count(*) as "expired rows after an unrelated put (expect 0)" from public.place_lookups
 where expires_at < now();

rollback;
\echo '--- rolled back. Nothing above was persisted. ---'
