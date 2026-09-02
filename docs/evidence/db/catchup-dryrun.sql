-- Read-only pre-flight for the local catch-up to 0037 (docs/db-local-catchup-plan.md §4 step 0).
-- Every row must read 0. A non-zero number is not a blocker, it is a signal that the local rows have
-- drifted since 2026-09-02 and that the transform migrations will now genuinely rewrite data --
-- re-read §2 before continuing.
with whitelist(k) as (values
  ('italian'),('japanese'),('asian'),('middle eastern'),('mexican'),('american'),('mediterranean'),
  ('bakery'),('desserts'),('specialty coffee'),('brunch'),('cocktails'),('wine bar'),('beer pub'),
  ('speakeasy'))
select '0028 rows that would change' as check, count(*) as n from public.saved_places sp
 where sp.tags is not null
   and exists (select 1 from unnest(sp.tags) t where t not in (select k from whitelist))
union all
select '0029 rows that would change', count(*) from public.saved_places where 'breakfast' = any(tags)
union all
select '0030 places that would change', count(*) from public.places
 where category in ('dessert','bakery','shop','attraction','other')
union all
select '0030 saved_places that would change', count(*) from public.saved_places
 where category_override in ('dessert','bakery','shop','attraction','other')
union all
select '0036 tags_extracted backfill would violate its CHECK', count(*) from public.saved_places
 where tags is not null and not public.tag_list_within(tags, 8, 32)
union all
select '0037 dishes_extracted backfill would violate its CHECK', count(*) from public.saved_places
 where dishes is not null and not public.tag_list_within(dishes, 8, 64);
