\set ON_ERROR_STOP on
begin read only;

\echo '--- library size ---'
select (select count(*) from public.saved_places) as saved_places,
       (select count(*) from public.places)       as places,
       (select count(*) from auth.users)          as users;

\echo '--- 0028/0029/0036: rows whose tags would be rewritten ---'
select count(*) as rows_with_any_tag from public.saved_places where tags is not null and cardinality(tags) > 0;
select unnest(tags) as tag, count(*) from public.saved_places group by 1 order by 2 desc, 1 limit 25;

\echo '--- 0030: category values that the taxonomy rewrites ---'
select coalesce(category,'(null)') as places_category, count(*) from public.places group by 1 order by 2 desc;
select coalesce(category_override,'(null)') as saved_override, count(*) from public.saved_places group by 1 order by 2 desc;

\echo '--- 0037: model prose columns present today ---'
select count(*) filter (where why_go is not null)  as with_why_go,
       count(*) filter (where dishes is not null and cardinality(dishes) > 0) as with_dishes,
       count(*) filter (where note is not null)    as with_note
  from public.saved_places;

rollback;
