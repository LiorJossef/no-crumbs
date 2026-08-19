\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
\pset pager off
select sp.user_id, p.lat, p.lng, p.name_key, p.country_code
  from saved_places sp join places p on p.id = sp.place_id
 where p.locality = 'Tel Aviv' limit 1
\gset
\set north :lat
\set nn 0.015

select :lat - 0.015 as south, :lat + 0.015 as north,
       :lng - 0.025 as west,  :lng + 0.025 as east,
       :lat - 0.075/111.045 as dsouth, :lat + 0.075/111.045 as dnorth,
       :lng - 0.075/(111.045*cos(radians(:lat))) as dwest,
       :lng + 0.075/(111.045*cos(radians(:lat))) as deast
\gset

\echo '=== Q-VIEWPORT bbox'
explain (analyze, buffers, costs off, timing off, summary on)
select sp.id, coalesce(sp.display_name, p.name) as name,
       coalesce(sp.category_override, p.category) as category, p.lat, p.lng, sp.visit_state
  from saved_places sp join places p on p.id = sp.place_id
 where sp.user_id = :'user_id'
   and p.lat between :south and :north and p.lng between :west and :east;

\echo '=== Q-VIEWPORT postgis'
explain (analyze, buffers, costs off, timing off, summary on)
select sp.id, coalesce(sp.display_name, p.name) as name,
       coalesce(sp.category_override, p.category) as category, p.lat, p.lng, sp.visit_state
  from saved_places sp join places p on p.id = sp.place_id
 where sp.user_id = :'user_id'
   and p.geog && ST_MakeEnvelope(:west, :south, :east, :north, 4326)::geography;

\echo '=== Q-NEAR bbox+haversine (2 km)'
explain (analyze, buffers, costs off, timing off, summary on)
with box as (select 2.0/111.045 as dlat, 2.0/(111.045*greatest(cos(radians(:lat)),0.01)) as dlng)
select sp.id, coalesce(sp.display_name, p.name) as name, p.lat, p.lng,
       public.km_between(p.lat, p.lng, :lat, :lng) as km
  from saved_places sp join places p on p.id = sp.place_id cross join box b
 where sp.user_id = :'user_id'
   and p.lat between :lat - b.dlat and :lat + b.dlat
   and p.lng between :lng - b.dlng and :lng + b.dlng
   and public.km_between(p.lat, p.lng, :lat, :lng) <= 2.0
 order by km limit 50;

\echo '=== Q-NEAR postgis (2 km)'
explain (analyze, buffers, costs off, timing off, summary on)
select sp.id, coalesce(sp.display_name, p.name) as name, p.lat, p.lng,
       ST_Distance(p.geog, ST_MakePoint(:lng,:lat)::geography)/1000 as km
  from saved_places sp join places p on p.id = sp.place_id
 where sp.user_id = :'user_id'
   and ST_DWithin(p.geog, ST_MakePoint(:lng,:lat)::geography, 2000)
 order by 5 limit 50;

\echo '=== Q-DEDUP bbox+haversine (75 m, resolve_place step 2)'
explain (analyze, buffers, costs off, timing off, summary on)
select pl.id from places pl
 where pl.merged_into_place_id is null
   and pl.name_key = :'name_key'
   and pl.country_code is not distinct from :'country_code'
   and pl.lat between :dsouth and :dnorth
   and pl.lng between :dwest and :deast
   and public.km_between(pl.lat, pl.lng, :lat, :lng) <= 0.075
 order by public.km_between(pl.lat, pl.lng, :lat, :lng) limit 1;

\echo '=== Q-DEDUP postgis (75 m)'
explain (analyze, buffers, costs off, timing off, summary on)
select pl.id from places pl
 where pl.merged_into_place_id is null
   and pl.name_key = :'name_key'
   and pl.country_code is not distinct from :'country_code'
   and ST_DWithin(pl.geog, ST_MakePoint(:lng,:lat)::geography, 75)
 order by ST_Distance(pl.geog, ST_MakePoint(:lng,:lat)::geography) limit 1;

\echo '=== Q-GLOBAL-VIEWPORT bbox (no user filter)'
explain (analyze, buffers, costs off, timing off, summary on)
select p.id, p.name, p.lat, p.lng from places p
 where p.merged_into_place_id is null
   and p.lat between :south and :north and p.lng between :west and :east
 limit 500;

\echo '=== Q-GLOBAL-VIEWPORT postgis (no user filter)'
explain (analyze, buffers, costs off, timing off, summary on)
select p.id, p.name, p.lat, p.lng from places p
 where p.merged_into_place_id is null
   and p.geog && ST_MakeEnvelope(:west,:south,:east,:north,4326)::geography
 limit 500;
