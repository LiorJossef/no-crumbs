-- 0017_search_poi_index.sql — the pg_trgm prefilter (docs/10-poi-index.md §5) as a callable RPC,
-- so the DB-first `PlaceResolver` (L0-F2b, 2026-08-24: "check the real Tel Aviv database first,
-- fall back to the LLM-guess + Google Maps link only when there's no confident match") can run it
-- over `supabase-js` instead of a raw libpq connection this project does not otherwise need.
--
-- WHY A FUNCTION, NOT A DIRECT SELECT. `10` §5's proposed shape needs the schema-qualified trigram
-- operator `operator(extensions.%)` — the unqualified `%` errors under `search_path = public,
-- pg_temp` (measured, recorded in `10` §5), and PostgREST/supabase-js's filter syntax has no way to
-- express a custom operator at all. A thin SQL function is the only way the integration adapter
-- (`src/integrations/places/poi-index-resolver.ts`, running as `service_role`) can issue this exact
-- query without a new database dependency.
--
-- SECURITY INVOKER (the default — stated explicitly rather than relied on): `service_role` already
-- holds SELECT on `poi_index` (migration 0010 §5), so no elevation is needed or wanted. Only
-- `service_role` may execute this function — matching 0010 §5's "manual search goes through a
-- server route" ruling (10 §12 Q2): a client holding EXECUTE here would have no rate limiter in
-- front of it, exactly the reason `poi_index` itself grants nothing to `anon`/`authenticated`.
--
-- SCOPE: region-scoped by `p_region_ids` (`10` §5 step 2, non-negotiable) and capped by `p_limit`
-- (`10` §5's "limit 500 is new" — the unbounded prototype query returned 2 904 rows once). The
-- caller supplies both the trigram query string and the LIKE-any token patterns already normalised
-- and lower-cased — this function does no normalisation of its own, matching `10` §4's rule that
-- there is exactly one normaliser (`domain/places/normalise.ts`) and it runs in TypeScript.
create or replace function public.search_poi_index(
  p_region_ids     text[],
  p_query_norm     text,
  p_like_patterns  text[],
  p_limit          integer default 500
) returns table (
  dataset_place_id  text,
  region_id         text,
  name              text,
  alt_names         text[],
  provider_category text,
  address_line      text,
  locality          text,
  lat               double precision,
  lng               double precision,
  dataset_confidence real
)
language sql
security invoker
stable
set search_path = public, extensions, pg_temp
as $fn$
  select p.dataset_place_id, p.region_id, p.name, p.alt_names, p.provider_category,
         p.address_line, p.locality, p.lat, p.lng, p.dataset_confidence
    from public.poi_index p
   where p.region_id = any(p_region_ids)
     and (
       p.name_norm operator(extensions.%) p_query_norm
       or p.name_norm like any(p_like_patterns)
     )
   order by extensions.similarity(p.name_norm, p_query_norm) desc
   limit greatest(coalesce(p_limit, 500), 0);
$fn$;

comment on function public.search_poi_index(text[], text, text[], integer) is
  'The pg_trgm prefilter over poi_index (10 §5): region-scoped, trigram-or-substring matched,
   ranked by trigram similarity, capped. Returns prefiltered rows only — scoring/ranking/bands are
   domain/places/score.ts''s job entirely; this function never ranks by anything but similarity.';

revoke all on function public.search_poi_index(text[], text, text[], integer)
  from public, anon, authenticated;
grant execute on function public.search_poi_index(text[], text, text[], integer) to service_role;
