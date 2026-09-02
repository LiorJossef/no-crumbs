-- Post-catch-up assertions (docs/db-local-catchup-plan.md §5b). Raises on the first violation and
-- changes nothing. Run only AFTER `supabase migration up --include-all` has reported 0037.
-- One repeatable-read snapshot, for the reason given in catchup-verify.sql.
begin transaction isolation level repeatable read;
do $$
declare v text; n int; total int;
begin
  select count(*) into total from public.saved_places;

  select string_agg(distinct t, ', ') into v
    from (select unnest(tags) t from public.saved_places) x
   where t not in ('italian','japanese','asian','middle eastern','mexican','american','mediterranean',
                   'bakery','desserts','specialty coffee','brunch','cocktails','wine bar','beer pub',
                   'speakeasy');
  if v is not null then raise exception 'FAIL 0028: tags outside the taxonomy survive: %', v; end if;

  select string_agg(distinct category, ', ') into v from public.places
   where category in ('dessert','bakery','shop','attraction','other');
  if v is not null then raise exception 'FAIL 0030: retired place categories survive: %', v; end if;

  select string_agg(distinct category_override, ', ') into v from public.saved_places
   where category_override in ('dessert','bakery','shop','attraction','other');
  if v is not null then raise exception 'FAIL 0030: retired category_override survives: %', v; end if;

  if exists (select 1 from public.saved_places where 'breakfast' = any(tags)) then
    raise exception 'FAIL 0029: breakfast survives as a tag';
  end if;

  -- 0036 and 0037 backfill every row: `tags_extracted` mirrors `tags`, NULL included.
  select count(*) into n from public.saved_places where tags_extracted is not distinct from tags;
  if n <> total then
    raise exception 'FAIL 0036 backfill: only % of % rows have tags_extracted = tags', n, total;
  end if;
  select count(*) into n from public.saved_places where dishes_extracted is not distinct from dishes;
  if n <> total then
    raise exception 'FAIL 0037 backfill: only % of % rows have dishes_extracted = dishes', n, total;
  end if;

  -- No migration may invent a decision the user never made. 0036 and 0037 both say these columns
  -- are never back-filled; this is the assertion that says so in SQL.
  select count(*) into n from public.saved_places
   where tags_confirmed_at is not null or why_go_reviewed_at is not null
      or dishes_confirmed_at is not null;
  if n <> 0 then raise exception 'FAIL: % rows carry a manufactured confirmation timestamp', n; end if;

  -- Referential health. Counted per save, not per join row -- see catchup-verify.sql for why.
  select count(*) into n from public.saved_places sp
   where not exists (select 1 from public.places p where p.id = sp.place_id);
  if n <> 0 then raise exception 'FAIL: % saves no longer reach a place', n; end if;

  select count(*) into n from public.saved_places sp
   where sp.origin = 'import'
     and not exists (select 1 from public.saved_place_sources s where s.saved_place_id = sp.id);
  if n <> 0 then raise exception 'FAIL: % imported saves lost their source provenance', n; end if;

  raise notice
    'PASS  % saves: taxonomy clean, both backfills complete, no invented consent, every save still reaches its place and every import still reaches its source',
    total;
end $$;
commit;
