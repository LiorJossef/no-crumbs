CREATE OR REPLACE FUNCTION public.search_poi_index(p_region_ids text[], p_query_norm text, p_like_patterns text[], p_limit integer DEFAULT 500)
 RETURNS TABLE(dataset_place_id text, region_id text, name text, alt_names text[], provider_category text, address_line text, locality text, lat double precision, lng double precision, dataset_confidence real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$
;
