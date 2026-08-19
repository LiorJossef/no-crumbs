\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
drop table if exists params;
create temporary table params as
select 32.0853 + (random()-0.5)*3.0 as lat, 34.7818 + (random()-0.5)*3.0 as lng,
       generate_series(1,50) as k;   -- points up to ~1.5 deg OUTSIDE the seeded cluster
analyze params;

-- trigger 4: true nearest-neighbour, no user filter, no radius. The shape PostGIS exists for.
select * from bench('KNN-20 global, gist <-> operator', array(
  select format($f$
    select id, name from places
     order by geog <-> ST_MakePoint(%s,%s)::geography limit 20 $f$, lng, lat) from params));

select * from bench('KNN-20 global, haversine sort (no usable index)', array(
  select format($f$
    select id, name from places
     order by public.km_between(lat, lng, %s, %s) limit 20 $f$, lat, lng) from params));
