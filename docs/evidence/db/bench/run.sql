\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
\set ITERS 200

-- ---------------------------------------------------------------- parameter sets
drop table if exists params;
create temporary table params as
with pick as (
  select sp.user_id, p.lat, p.lng, p.name_key, p.country_code,
         row_number() over (order by random()) as rn
    from saved_places sp join places p on p.id = sp.place_id
)
select * from pick where rn <= :ITERS;
analyze params;

-- ---------------------------------------------------------------- Q-VIEWPORT  (08 §6.3)
select * from bench('Q-VIEWPORT bbox', array(
  select format($f$
    select sp.id, coalesce(sp.display_name, p.name) as name,
           coalesce(sp.category_override, p.category) as category,
           p.lat, p.lng, sp.visit_state
      from saved_places sp join places p on p.id = sp.place_id
     where sp.user_id = %L
       and p.lat between %s and %s
       and p.lng between %s and %s $f$,
    user_id, lat - 0.015, lat + 0.015, lng - 0.025, lng + 0.025)
  from params));

select * from bench('Q-VIEWPORT postgis', array(
  select format($f$
    select sp.id, coalesce(sp.display_name, p.name) as name,
           coalesce(sp.category_override, p.category) as category,
           p.lat, p.lng, sp.visit_state
      from saved_places sp join places p on p.id = sp.place_id
     where sp.user_id = %L
       and p.geog && ST_MakeEnvelope(%s, %s, %s, %s, 4326)::geography $f$,
    user_id, lng - 0.025, lat - 0.015, lng + 0.025, lat + 0.015)
  from params));

-- ---------------------------------------------------------------- Q-NEAR, 2 km  (08 §6.3)
select * from bench('Q-NEAR bbox+haversine', array(
  select format($f$
    with box as (select 2.0/111.045 as dlat, 2.0/(111.045*greatest(cos(radians(%s)),0.01)) as dlng)
    select sp.id, coalesce(sp.display_name, p.name) as name, p.lat, p.lng,
           public.km_between(p.lat, p.lng, %s, %s) as km
      from saved_places sp join places p on p.id = sp.place_id cross join box b
     where sp.user_id = %L
       and p.lat between %s - b.dlat and %s + b.dlat
       and p.lng between %s - b.dlng and %s + b.dlng
       and public.km_between(p.lat, p.lng, %s, %s) <= 2.0
     order by km limit 50 $f$,
    lat, lat, lng, user_id, lat, lat, lng, lng, lat, lng)
  from params));

select * from bench('Q-NEAR postgis', array(
  select format($f$
    select sp.id, coalesce(sp.display_name, p.name) as name, p.lat, p.lng,
           ST_Distance(p.geog, ST_MakePoint(%s,%s)::geography)/1000 as km
      from saved_places sp join places p on p.id = sp.place_id
     where sp.user_id = %L
       and ST_DWithin(p.geog, ST_MakePoint(%s,%s)::geography, 2000)
     order by 5 limit 50 $f$,
    lng, lat, user_id, lng, lat)
  from params));

-- ---------------------------------------------------------------- 75 m dedup guard (08 §1.2 / 0007 resolve_place step 2)
select * from bench('Q-DEDUP bbox+haversine', array(
  select format($f$
    select pl.id from places pl
     where pl.merged_into_place_id is null
       and pl.name_key = %L
       and pl.country_code is not distinct from %L
       and pl.lat between %s and %s
       and pl.lng between %s and %s
       and public.km_between(pl.lat, pl.lng, %s, %s) <= 0.075
     order by public.km_between(pl.lat, pl.lng, %s, %s) limit 1 $f$,
    name_key, country_code,
    lat - 0.075/111.045, lat + 0.075/111.045,
    lng - 0.075/(111.045*greatest(cos(radians(lat)),0.01)),
    lng + 0.075/(111.045*greatest(cos(radians(lat)),0.01)),
    lat, lng, lat, lng)
  from params));

select * from bench('Q-DEDUP postgis', array(
  select format($f$
    select pl.id from places pl
     where pl.merged_into_place_id is null
       and pl.name_key = %L
       and pl.country_code is not distinct from %L
       and ST_DWithin(pl.geog, ST_MakePoint(%s,%s)::geography, 75)
     order by ST_Distance(pl.geog, ST_MakePoint(%s,%s)::geography) limit 1 $f$,
    name_key, country_code, lng, lat, lng, lat)
  from params));

-- 75 m guard on a CHAIN name (many rows share name_key) -- the guard's worst case
select * from bench('Q-DEDUP-CHAIN bbox+haversine', array(
  select format($f$
    select pl.id from places pl
     where pl.merged_into_place_id is null
       and pl.name_key = 'starbucks'
       and pl.country_code is not distinct from %L
       and pl.lat between %s and %s
       and pl.lng between %s and %s
       and public.km_between(pl.lat, pl.lng, %s, %s) <= 0.075
     order by public.km_between(pl.lat, pl.lng, %s, %s) limit 1 $f$,
    country_code,
    lat - 0.075/111.045, lat + 0.075/111.045,
    lng - 0.075/(111.045*greatest(cos(radians(lat)),0.01)),
    lng + 0.075/(111.045*greatest(cos(radians(lat)),0.01)),
    lat, lng, lat, lng)
  from params));

select * from bench('Q-DEDUP-CHAIN postgis', array(
  select format($f$
    select pl.id from places pl
     where pl.merged_into_place_id is null
       and pl.name_key = 'starbucks'
       and pl.country_code is not distinct from %L
       and ST_DWithin(pl.geog, ST_MakePoint(%s,%s)::geography, 75)
     order by ST_Distance(pl.geog, ST_MakePoint(%s,%s)::geography) limit 1 $f$,
    country_code, lng, lat, lng, lat)
  from params));

-- ---------------------------------------------------------------- out-of-scope shape: global viewport, NO user filter (08 §6.4 trigger 2)
select * from bench('Q-GLOBAL-VIEWPORT bbox', array(
  select format($f$
    select p.id, p.name, p.lat, p.lng from places p
     where p.merged_into_place_id is null
       and p.lat between %s and %s and p.lng between %s and %s
     limit 500 $f$,
    lat - 0.015, lat + 0.015, lng - 0.025, lng + 0.025)
  from params));

select * from bench('Q-GLOBAL-VIEWPORT postgis', array(
  select format($f$
    select p.id, p.name, p.lat, p.lng from places p
     where p.merged_into_place_id is null
       and p.geog && ST_MakeEnvelope(%s,%s,%s,%s,4326)::geography
     limit 500 $f$,
    lng - 0.025, lat - 0.015, lng + 0.025, lat + 0.015)
  from params));
