\set ON_ERROR_STOP on
set search_path = public, extensions, pg_temp;
drop table if exists params;
create temporary table params as
select 32.0853 + (random()-0.5)*3.0 as lat, 34.7818 + (random()-0.5)*3.0 as lng,
       generate_series(1,50) as k;
do $$
declare n bigint;
begin
  foreach n in array array[50000, 370000, 500000, 1000000] loop
    execute format('drop table if exists sub');
    execute format('create table sub as select id, name, lat, lng from places limit %s', n);
    execute 'analyze sub';
    raise notice 'rows=% : %', n, (
      select (select p95_ms from bench('x', array(
        select format('select id, name from sub order by public.km_between(lat, lng, %s, %s) limit 20', lat, lng)
          from params))));
  end loop;
end $$;
drop table if exists sub;
