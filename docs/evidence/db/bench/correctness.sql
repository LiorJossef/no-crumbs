\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
\pset pager off

\echo '=== C1: km_between (sphere) vs ST_Distance (WGS84 ellipsoid), 20k random pairs 0-200 m apart'
with pairs as (
  select (random()*160 - 80)            as lat0,
         (random()*360 - 180)           as lng0,
         random()*2*pi()                as brg,
         random()*0.002                 as ddeg
    from generate_series(1,20000)
), pts as (
  select lat0, lng0,
         lat0 + ddeg*cos(brg)                                        as lat1,
         lng0 + ddeg*sin(brg)/greatest(cos(radians(lat0)),0.0001)    as lng1
    from pairs
   where abs(lat0) < 85
), d as (
  select public.km_between(lat0,lng0,lat1,lng1)*1000                              as hav_m,
         ST_Distance(ST_MakePoint(lng0,lat0)::geography,
                     ST_MakePoint(lng1,lat1)::geography)                          as geo_m
    from pts
)
select count(*) as pairs,
       round(min(hav_m/nullif(geo_m,0))::numeric,5) as min_ratio,
       round(max(hav_m/nullif(geo_m,0))::numeric,5) as max_ratio,
       round(max(abs(hav_m-geo_m))::numeric,3)      as max_abs_diff_m
  from d where geo_m between 1 and 200;

\echo '=== C1b: how many of those pairs does the 75 m guard classify differently from ST_DWithin(75)?'
with pairs as (
  select (random()*160 - 80) as lat0, (random()*360 - 180) as lng0,
         random()*2*pi() as brg, 0.00066 + random()*0.00002 as ddeg
    from generate_series(1,50000)
), pts as (
  select lat0, lng0, lat0 + ddeg*cos(brg) as lat1,
         lng0 + ddeg*sin(brg)/greatest(cos(radians(lat0)),0.0001) as lng1
    from pairs where abs(lat0) < 85
), d as (
  select public.km_between(lat0,lng0,lat1,lng1) <= 0.075                              as hav_in,
         ST_DWithin(ST_MakePoint(lng0,lat0)::geography,
                    ST_MakePoint(lng1,lat1)::geography, 75)                           as geo_in,
         ST_Distance(ST_MakePoint(lng0,lat0)::geography,
                     ST_MakePoint(lng1,lat1)::geography)                              as geo_m
    from pts
)
select count(*) as probes,
       count(*) filter (where hav_in <> geo_in)                              as disagreements,
       round((100.0*count(*) filter (where hav_in <> geo_in)/count(*))::numeric,3) as pct,
       round(min(geo_m) filter (where hav_in <> geo_in)::numeric,3)          as band_lo_m,
       round(max(geo_m) filter (where hav_in <> geo_in)::numeric,3)          as band_hi_m
  from d;

\echo '=== C2: does the bbox pre-filter ever exclude a pair that km_between accepts? (latitude sweep)'
-- east-west pair at exactly 74.0 m, at latitudes 0..89.9; does the delivered dlng window contain it?
with lats as (select unnest(array[0,15,30,45,51.5,60,70,80,85,89,89.4,89.43,89.5,89.9]) as lat)
select lat,
       round((0.075/(111.045*greatest(cos(radians(lat)),0.01)))::numeric, 8) as dlng_deg,
       round((0.075/(111.045*greatest(cos(radians(lat)),0.01))
              * 111.32 * cos(radians(lat)) * 1000)::numeric, 1)              as dlng_metres_ew,
       (0.074/(111.32*cos(radians(lat)))) <= (0.075/(111.045*greatest(cos(radians(lat)),0.01)))
                                                                             as box_contains_74m_pair
  from lats;

\echo '=== C2b: north-south pair at 74.99 m, does the dlat window contain it? (dlat is latitude-independent)'
select round((0.075/111.045)::numeric,8) as dlat_deg,
       round((0.075/111.045*110.574*1000)::numeric,2) as metres_at_equator_wgs84,
       round((0.075/111.045*111.694*1000)::numeric,2) as metres_at_pole_wgs84,
       round((0.075/111.045*111.195*1000)::numeric,2) as metres_on_km_between_sphere;

\echo '=== C3: antimeridian, real rows. Two places 22 m apart across lng=180'
begin;
insert into places (id, name, country_code, lat, lng) values
  ('11111111-1111-1111-1111-111111111111','Antimeridian Cafe','FJ', -17.5,  179.9999),
  ('22222222-2222-2222-2222-222222222222','Antimeridian Cafe','FJ', -17.5, -179.9999);
insert into place_provider_refs (place_id, provider, provider_place_id, is_primary) values
  ('11111111-1111-1111-1111-111111111111','osm','node/am1',true),
  ('22222222-2222-2222-2222-222222222222','osm','node/am2',true);
select round((public.km_between(-17.5,179.9999,-17.5,-179.9999)*1000)::numeric,2) as haversine_m,
       round(ST_Distance(ST_MakePoint(179.9999,-17.5)::geography,
                         ST_MakePoint(-179.9999,-17.5)::geography)::numeric,2)    as postgis_m;
-- the delivered guard (bbox pre-filter) run for the second point:
select 'bbox+haversine guard' as variant, count(*) as found from places pl
 where pl.id = '11111111-1111-1111-1111-111111111111'
   and pl.name_key = public.place_name_key('Antimeridian Cafe')
   and pl.lat between -17.5 - 0.075/111.045 and -17.5 + 0.075/111.045
   and pl.lng between -179.9999 - 0.075/(111.045*cos(radians(-17.5)))
                  and -179.9999 + 0.075/(111.045*cos(radians(-17.5)))
   and public.km_between(pl.lat, pl.lng, -17.5, -179.9999) <= 0.075
union all
select 'postgis ST_DWithin', count(*) from places pl
 where pl.id = '11111111-1111-1111-1111-111111111111'
   and pl.name_key = public.place_name_key('Antimeridian Cafe')
   and ST_DWithin(pl.geog, ST_MakePoint(-179.9999,-17.5)::geography, 75);
rollback;

\echo '=== C4: viewport rectangle semantics -- lat/lng BETWEEN vs three PostGIS spellings'
with v as (select 32.0 as south, 32.03 as north, 34.75 as west, 34.80 as east)
select 'lat/lng BETWEEN'                    as variant, count(*) from places p, v
        where p.lat between v.south and v.north and p.lng between v.west and v.east
union all
select 'geog && envelope::geography',        count(*) from places p, v
        where p.geog && ST_MakeEnvelope(v.west,v.south,v.east,v.north,4326)::geography
union all
select 'ST_Intersects(geog, envelope)',      count(*) from places p, v
        where ST_Intersects(p.geog, ST_MakeEnvelope(v.west,v.south,v.east,v.north,4326)::geography)
union all
select 'geog::geometry && envelope',         count(*) from places p, v
        where p.geog::geometry && ST_MakeEnvelope(v.west,v.south,v.east,v.north,4326);

\echo '=== C4b: the rows geog && envelope adds that are OUTSIDE the requested rectangle'
with v as (select 32.0 as south, 32.03 as north, 34.75 as west, 34.80 as east)
select count(*) as extra_rows,
       round(min(p.lat)::numeric,6) as min_lat, round(max(p.lat)::numeric,6) as max_lat,
       round((max(p.lat) - 32.03)::numeric*111000, 1) as max_metres_north_of_edge
  from places p, v
 where p.geog && ST_MakeEnvelope(v.west,v.south,v.east,v.north,4326)::geography
   and not (p.lat between v.south and v.north and p.lng between v.west and v.east);
