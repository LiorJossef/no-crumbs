\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
drop index if exists places_geog_gix;
analyze places;
\set ITERS 200
drop table if exists params;
create temporary table params as
with pick as (select sp.user_id, p.lat, p.lng, row_number() over (order by random()) rn
                from saved_places sp join places p on p.id=sp.place_id)
select * from pick where rn <= :ITERS;
analyze params;

select * from bench('Q-VIEWPORT postgis, NO gist', array(
  select format($f$
    select sp.id, coalesce(sp.display_name,p.name), p.lat, p.lng, sp.visit_state
      from saved_places sp join places p on p.id=sp.place_id
     where sp.user_id=%L and p.geog && ST_MakeEnvelope(%s,%s,%s,%s,4326)::geography $f$,
    user_id, lng-0.025, lat-0.015, lng+0.025, lat+0.015) from params));

select * from bench('Q-NEAR postgis, NO gist', array(
  select format($f$
    select sp.id, p.lat, p.lng, ST_Distance(p.geog, ST_MakePoint(%s,%s)::geography)/1000 km
      from saved_places sp join places p on p.id=sp.place_id
     where sp.user_id=%L and ST_DWithin(p.geog, ST_MakePoint(%s,%s)::geography, 2000)
     order by 4 limit 50 $f$, lng, lat, user_id, lng, lat) from params));

select * from bench('Q-VIEWPORT bbox (same run)', array(
  select format($f$
    select sp.id, coalesce(sp.display_name,p.name), p.lat, p.lng, sp.visit_state
      from saved_places sp join places p on p.id=sp.place_id
     where sp.user_id=%L and p.lat between %s and %s and p.lng between %s and %s $f$,
    user_id, lat-0.015, lat+0.015, lng-0.025, lng+0.025) from params));

select * from bench('Q-NEAR bbox+haversine (same run)', array(
  select format($f$
    with box as (select 2.0/111.045 dlat, 2.0/(111.045*greatest(cos(radians(%s)),0.01)) dlng)
    select sp.id, p.lat, p.lng, public.km_between(p.lat,p.lng,%s,%s) km
      from saved_places sp join places p on p.id=sp.place_id cross join box b
     where sp.user_id=%L and p.lat between %s - b.dlat and %s + b.dlat
       and p.lng between %s - b.dlng and %s + b.dlng
       and public.km_between(p.lat,p.lng,%s,%s) <= 2.0
     order by km limit 50 $f$, lat, lat, lng, user_id, lat, lat, lng, lng, lat, lng) from params));
