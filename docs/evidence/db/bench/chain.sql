\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
alter table public.places disable trigger user;
insert into public.places (name, country_code, lat, lng, locality)
select 'Starbucks', 'IL',
       32.0853 + (random()-0.5)*0.24, 34.7818 + (random()-0.5)*0.32, 'Tel Aviv'
  from generate_series(1, :add);
alter table public.places enable trigger user;
vacuum (analyze) public.places;
select count(*) as starbucks_il from places where name_key='starbucks' and country_code='IL';

drop table if exists cparams;
create temporary table cparams as
select 32.0853 + (random()-0.5)*0.24 as lat, 34.7818 + (random()-0.5)*0.32 as lng,
       generate_series(1,200) as k;
analyze cparams;

select * from bench('DEDUP-CHAIN bbox+haversine', array(
  select format($f$
    select pl.id from places pl
     where pl.merged_into_place_id is null and pl.name_key='starbucks'
       and pl.country_code is not distinct from 'IL'
       and pl.lat between %s and %s and pl.lng between %s and %s
       and public.km_between(pl.lat, pl.lng, %s, %s) <= 0.075
     order by public.km_between(pl.lat, pl.lng, %s, %s) limit 1 $f$,
    lat - 0.075/111.045, lat + 0.075/111.045,
    lng - 0.075/(111.045*cos(radians(lat))), lng + 0.075/(111.045*cos(radians(lat))),
    lat, lng, lat, lng) from cparams));

select * from bench('DEDUP-CHAIN postgis', array(
  select format($f$
    select pl.id from places pl
     where pl.merged_into_place_id is null and pl.name_key='starbucks'
       and pl.country_code is not distinct from 'IL'
       and ST_DWithin(pl.geog, ST_MakePoint(%s,%s)::geography, 75)
     order by ST_Distance(pl.geog, ST_MakePoint(%s,%s)::geography) limit 1 $f$,
    lng, lat, lng, lat) from cparams));
