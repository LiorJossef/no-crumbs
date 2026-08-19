-- P-002 bbox-vs-PostGIS benchmark seed.
-- :n_users users x :per_user places each (no place sharing = worst case for places size).
\set ON_ERROR_STOP on

alter table public.saved_places        disable trigger user;
alter table public.saved_place_sources disable trigger user;
alter table public.places              disable trigger user;
alter table public.place_provider_refs disable trigger user;

begin;

insert into auth.users (id, email)
select gen_random_uuid(), 'u' || g || '@example.test'
  from generate_series(1, :n_users) g;

insert into public.profiles (id, display_name)
select id, 'user' from auth.users on conflict (id) do nothing;   -- 0002's signup trigger may have made these

-- deterministic user ordering
create temporary table u as
  select id, row_number() over (order by id) - 1 as ix from auth.users;

-- one source per 5 saved places
insert into public.sources (id, platform, platform_source_id, canonical_url, fetch_status, fetched_at)
select gen_random_uuid(), 'tiktok',
       lpad((700000000000000000 + g)::text, 18, '0'),
       'https://www.tiktok.com/@x/video/' || g,
       'ok', now()
  from generate_series(1, (:n_users * :per_user) / 5) g;

create temporary table s as
  select id, row_number() over (order by platform_source_id) - 1 as ix from public.sources;

-- places: user ix mod 3 picks a city; scatter ~ +-0.12 deg lat / +-0.16 deg lng around it
create temporary table gen as
select u.ix as uix, k,
       (array[32.0853, 35.6762, 51.5074])[(u.ix % 3) + 1]
         + (random() - 0.5) * 0.24                              as lat,
       (array[34.7818, 139.6503, -0.1278])[(u.ix % 3) + 1]
         + (random() - 0.5) * 0.32                              as lng,
       (array['IL','JP','GB'])[(u.ix % 3) + 1]                  as cc,
       u.id as user_id
  from u cross join generate_series(1, :per_user) k;

insert into public.places (id, name, category, country_code, lat, lng, locality)
select gen_random_uuid(),
       -- 1 in 40 rows is a chain name shared globally; the rest are near-unique
       case when (uix * :per_user + k) % 40 = 0
            then (array['Starbucks','Pret A Manger','McDonalds','Costa'])[((uix + k) % 4) + 1]
            else 'Place ' || (uix * :per_user + k) end,
       (array['restaurant','cafe','bar','bakery'])[((uix + k) % 4) + 1],
       cc, lat, lng,
       (array['Tel Aviv','Tokyo','London'])[(uix % 3) + 1]
  from gen;

create temporary table p as
  select id, row_number() over (order by id) - 1 as ix, lat, lng from public.places;

insert into public.place_provider_refs (place_id, provider, provider_place_id, is_primary)
select id, 'osm', 'node/' || ix, true from p;

-- assign places to users: place ix / per_user  ->  user ix  (each user owns a contiguous block)
insert into public.saved_places (id, user_id, place_id, origin, visit_state)
select gen_random_uuid(), u.id, p.id, 'import', 'want_to_go'
  from p join u on u.ix = p.ix / :per_user;

insert into public.saved_place_sources (saved_place_id, source_id, user_id)
select sp.id, s.id, sp.user_id
  from (select id, user_id, row_number() over (order by id) - 1 as ix from public.saved_places) sp
  join s on s.ix = sp.ix / 5;

commit;

alter table public.saved_places        enable trigger user;
alter table public.saved_place_sources enable trigger user;
alter table public.places              enable trigger user;
alter table public.place_provider_refs enable trigger user;

vacuum (analyze) public.places;
vacuum (analyze) public.saved_places;
vacuum (analyze) public.saved_place_sources;
vacuum (analyze) public.place_provider_refs;

select (select count(*) from public.places) as places,
       (select count(*) from public.saved_places) as saved_places,
       (select count(*) from public.profiles) as users;
