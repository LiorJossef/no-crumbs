-- Before/after capture for the local catch-up to 0037 (docs/db-local-catchup-plan.md §5a).
-- Run it immediately before the backup and again after `migration up --include-all`, and diff the
-- two outputs. Every count and both checksums must be identical.
--
-- WHY THE TRANSACTION. This file was written without one and gave an inconsistent answer on the
-- first real run: `saved_places` read 60 in one statement and 58 in the next, because another lane
-- was deleting rows between them. Every number below now comes from ONE repeatable-read snapshot,
-- so the capture describes a single instant rather than a smear across several.
\pset footer off
begin transaction isolation level repeatable read;

select 'auth.users' as t, count(*) as n from auth.users
union all select 'profiles',            count(*) from public.profiles
union all select 'saved_places',        count(*) from public.saved_places
union all select 'places',              count(*) from public.places
union all select 'sources',             count(*) from public.sources
union all select 'saved_place_sources', count(*) from public.saved_place_sources
union all select 'extractions',         count(*) from public.extractions
union all select 'imports',             count(*) from public.imports
union all select 'collections',         count(*) from public.collections
union all select 'collection_items',    count(*) from public.collection_items
union all select 'collection_members',  count(*) from public.collection_members
union all select 'collection_invites',  count(*) from public.collection_invites
union all select 'place_provider_refs', count(*) from public.place_provider_refs
union all select 'place_lookups',       count(*) from public.place_lookups
union all select 'poi_index',           count(*) from public.poi_index
union all select 'poi_regions',         count(*) from public.poi_regions
union all select 'sp_with_tags',    count(*) from public.saved_places where tags   is not null
union all select 'sp_with_dishes',  count(*) from public.saved_places where dishes is not null
union all select 'sp_with_why_go',  count(*) from public.saved_places where why_go is not null
union all select 'sp_with_note',    count(*) from public.saved_places where note   is not null
-- Referential health, counted per SAVE and not per join row. `saved_place_sources` is many-to-one
-- (one local row already carries two source posts), so a join count is not the number of saves that
-- still reach a source -- it over-counts. And an `origin = 'manual'` save is ENTITLED to no source
-- row at all, so the assertion is "no IMPORT save has lost its provenance", not "every save has a
-- source". `sp_orphan_place` must be 0 in both captures: the FK makes it impossible, and a non-zero
-- reading means something is wrong with the capture, not with the data.
union all select 'sp_reaching_a_place',       count(*) from public.saved_places sp
  where exists (select 1 from public.places p where p.id = sp.place_id)
union all select 'sp_orphan_place',           count(*) from public.saved_places sp
  where not exists (select 1 from public.places p where p.id = sp.place_id)
union all select 'sp_import_reaching_source', count(*) from public.saved_places sp
  where sp.origin = 'import'
    and exists (select 1 from public.saved_place_sources s where s.saved_place_id = sp.id)
union all select 'sp_import_without_source',  count(*) from public.saved_places sp
  where sp.origin = 'import'
    and not exists (select 1 from public.saved_place_sources s where s.saved_place_id = sp.id)
union all select 'sp_manual',                 count(*) from public.saved_places where origin = 'manual'
order by 1;

-- Content, not just cardinality. These two are the actual "nothing was lost" proof.
select 'CHECKSUM saved_places' as k,
       md5(string_agg(id::text||'|'||user_id::text||'|'||place_id::text||'|'||coalesce(note,'')||'|'
           ||coalesce(array_to_string(tags,','),'')||'|'||coalesce(array_to_string(dishes,','),'')
           ||'|'||coalesce(why_go,'')||'|'||visit_state||'|'||origin, E'\n' order by id)) as v
  from public.saved_places
union all
select 'CHECKSUM places',
       md5(string_agg(id::text||'|'||name||'|'||coalesce(category,'')||'|'||lat||'|'||lng,
           E'\n' order by id))
  from public.places
union all
select 'CHECKSUM saved_place_sources',
       md5(string_agg(saved_place_id::text||'|'||source_id::text||'|'||user_id::text, E'\n'
           order by saved_place_id, source_id))
  from public.saved_place_sources;

commit;
