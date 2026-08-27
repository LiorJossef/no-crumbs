-- 0020_poi_region_tlv_launch_area.sql — widen the `tlv` POI region to the MVP launch area
-- (Tel Aviv + the Hasharon), so that the places the launch actually has to resolve are inside a
-- loaded region rather than outside every region.
--
-- WHY NOW. The owner narrowed the launch area to Tel Aviv **and the Hasharon**. `0010`'s `tlv`
-- seed is the Tel Aviv municipal bbox and nothing more — 32.03/32.12 lat, 34.74/34.86 lng. Every
-- Hasharon town in the launch area sits outside it, in both axes:
--
--     Herzliya        32.166, 34.843   -- north of max_lat
--     Ramat HaSharon  32.146, 34.839   -- north of max_lat
--     Ra'anana        32.184, 34.871   -- north of max_lat AND east of max_lng
--     Kfar Saba       32.175, 34.907   -- north and east
--     Hod HaSharon    32.150, 34.888   -- north and east
--     Netanya         32.328, 34.857   -- north
--     Petah Tikva     32.087, 34.887   -- INSIDE the latitude band, east of max_lng
--
-- Region assignment is by bbox containment at ingest (`10` §2), so a POI outside the bbox is not
-- merely unranked, it is never loaded: `load-poi-region.ts` hard-fails on a row outside the bbox
-- and `ingest-poi-region.sh` refuses a bbox that disagrees with this table. Today that means a
-- Herzliya candidate can only ever come back as "not found" from the Overture path.
--
-- =============================================================================================
-- ONE WIDENED REGION, NOT A SECOND REGION. This is the decision in this file.
-- =============================================================================================
--
-- The obvious alternative is to leave `tlv` alone and seed a second `hasharon` region north of it.
-- Four reasons it is the worse shape here, in the order they matter:
--
--   1. **The overlap ban makes a second region a tiling problem, not an addition.** `10` §2:
--      "Overlapping bboxes are a configuration error and the loader rejects them rather than
--      silently double-counting." A rectangle that contains the Hasharon towns above without
--      overlapping `tlv` (max_lat 32.12, max_lng 34.86) cannot be one rectangle: Petah Tikva at
--      (32.087, 34.887) is INSIDE `tlv`'s latitude band and outside its longitude band, so it
--      falls in the notch to `tlv`'s east. Covering the launch area with non-overlapping boxes
--      takes three of them (north strip, east strip, and the south strip down to 31.95 that picks
--      up Jaffa/Bat Yam/Holon), and every seam between them is a place that silently belongs to
--      neither. Seams are exactly the failure this table exists to make impossible.
--   2. **`region_id` is the resolver's scoping unit and the `cityHint` routing target** (`10` §8
--      step 2, D2b). More regions means the hint → region map has to be many-to-many and correct
--      for "Tel Aviv", "TLV", "Herzliya", "הרצליה", "Ramat Aviv" and every neighbourhood name a
--      caption uses. One region for one contiguous metro is one row to route to and one honest
--      `region_loaded` answer for the whole launch area.
--   3. **Nothing is bought by splitting.** Regions exist because a global extract is ~20M rows and
--      does not fit (`10` §9). The widened bbox is 10 462 rows after the food-and-drink filter
--      (measured on the pinned release `2026-07-22.0`, versus 4 997 for the current bbox) — a
--      ~5 500-row increase against a 500 MB budget. Two regions would not make the prefilter
--      faster; `region_id` is applied as a post-Filter above the BitmapOr anyway (`10` §5).
--   4. **`tlv` already exists everywhere.** Widening is one UPDATE; a second region is a new
--      `region_id` that every consumer, config file and hint map has to learn.
--
-- The cost, stated rather than hidden: the region is no longer "Tel Aviv". `display_name` changes
-- accordingly. The `id` stays `tlv` — it is referenced by `poi_index.region_id`, by
-- `scripts/poi-ingest.config.json` and by the ingest CLI, and renaming an identifier to improve a
-- label is churn, not clarity.
--
-- =============================================================================================
-- NO RELOAD IS IMPLIED, AND THAT IS A MEASURED FACT, NOT AN ASSUMPTION.
-- =============================================================================================
--
-- `poi_index` holds ZERO rows and all three regions are `is_loaded = false, row_count = 0` — on
-- the local container (verified 2026-08-27) and on both hosted projects, which are at `0009` and
-- have never had these tables at all. The POI index has never been loaded in any environment. So
-- widening the declared extent cannot make the declared extent disagree with loaded data: there is
-- no loaded data. No DELETE, no re-COPY, no data migration.
--
-- That is true TODAY. It will not be true after the first ingest, so the guard below makes the
-- assumption enforce itself rather than rot: if this migration is ever applied to an environment
-- where `tlv` has actually been loaded, it aborts with an instruction instead of quietly
-- advertising a coverage area whose northern half is not in the index. A silently over-declared
-- bbox reads to the resolver as "we searched the Hasharon and found nothing", which is precisely
-- the confidently-wrong answer `region_loaded` exists to prevent.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  r public.poi_regions%rowtype;
begin
  select * into r from public.poi_regions where id = 'tlv';

  if not found then
    raise exception '0020: poi_regions has no row `tlv`; 0010''s seed is missing';
  end if;

  if r.is_loaded or r.row_count > 0
     or exists (select 1 from public.poi_index where region_id = 'tlv') then
    raise exception
      '0020: region tlv is already loaded (is_loaded=%, row_count=%) at bbox (% % .. % %). '
      'Widening its bbox here would declare coverage the index does not have. '
      'Re-run `scripts/ingest-poi-region.sh tlv` against the widened bbox instead, '
      'then re-apply this migration.',
      r.is_loaded, r.row_count, r.min_lat, r.min_lng, r.max_lat, r.max_lng;
  end if;
end
$$;

-- The launch-area bbox. Measured against the pinned Overture release `2026-07-22.0`: 79 996 raw
-- rows in this box, 10 462 surviving the food-and-drink filter in scripts/poi-ingest.config.json
-- (versus 35 430 / 4 997 for the 0010 bbox). Duplicated, deliberately, into that config file,
-- which `ingest-poi-region.sh` asserts equal to this row before it writes anything.
update public.poi_regions
   set min_lat      = 31.95,   -- south to Rishon LeZion / Bat Yam / Holon, below Jaffa
       max_lat      = 32.40,   -- north past Netanya
       min_lng      = 34.70,   -- the coastline, with margin for Herzliya Pituach's marina
       max_lng      = 35.00,   -- east past Kfar Saba and Petah Tikva
       display_name = 'Tel Aviv & Hasharon'
 where id = 'tlv';

comment on table public.poi_regions is
  'Which POI regions are loaded, at which dataset release and normaliser version. 3 rows at V1; '
  '`tlv` is the Tel Aviv + Hasharon launch area (0020), not the Tel Aviv municipality.';

-- ---------------------------------------------------------------------------------------------
-- Post-conditions, asserted rather than eyeballed. Three separate things can be wrong here and
-- only the first of them would have raised on its own.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  n        integer;
  a        public.poi_regions%rowtype;
  overlapping_pairs text;
begin
  -- 1. The row landed. (poi_regions_bbox_ordered already guarantees min < max.)
  select count(*) into n
    from public.poi_regions
   where id = 'tlv'
     and min_lat = 31.95 and max_lat = 32.40
     and min_lng = 34.70 and max_lng = 35.00;
  if n <> 1 then
    raise exception '0020: tlv did not take the launch-area bbox (matched % rows)', n;
  end if;

  -- 2. Every town the launch area is FOR is now inside the box. Not decoration: the whole point
  --    of this migration is these coordinates, and a typo in one degree of one bound is invisible
  --    in a diff and expensive at resolve time.
  select * into a from public.poi_regions where id = 'tlv';
  if not (32.166 between a.min_lat and a.max_lat and 34.843 between a.min_lng and a.max_lng)  -- Herzliya
  or not (32.146 between a.min_lat and a.max_lat and 34.839 between a.min_lng and a.max_lng)  -- Ramat HaSharon
  or not (32.184 between a.min_lat and a.max_lat and 34.871 between a.min_lng and a.max_lng)  -- Ra'anana
  or not (32.175 between a.min_lat and a.max_lat and 34.907 between a.min_lng and a.max_lng)  -- Kfar Saba
  or not (32.150 between a.min_lat and a.max_lat and 34.888 between a.min_lng and a.max_lng)  -- Hod HaSharon
  or not (32.328 between a.min_lat and a.max_lat and 34.857 between a.min_lng and a.max_lng)  -- Netanya
  or not (32.087 between a.min_lat and a.max_lat and 34.887 between a.min_lng and a.max_lng)  -- Petah Tikva
  or not (32.077 between a.min_lat and a.max_lat and 34.774 between a.min_lng and a.max_lng)  -- Tel Aviv centre
  then
    raise exception '0020: the launch-area bbox does not contain every launch-area town';
  end if;

  -- 3. NO TWO REGIONS OVERLAP. `10` s2 makes overlap a configuration error the loader rejects,
  --    but nothing in the schema enforced it — an exclusion constraint would need btree_gist, a
  --    second extension, which inventory.sql check 8's allow-list forbids. So it is asserted at
  --    migration time, which is when a bbox actually changes. Widening one box is exactly the
  --    edit that can create an overlap.
  select string_agg(x.id || '/' || y.id, ', ') into overlapping_pairs
    from public.poi_regions x
    join public.poi_regions y on y.id > x.id
   where x.min_lat < y.max_lat and y.min_lat < x.max_lat
     and x.min_lng < y.max_lng and y.min_lng < x.max_lng;
  if overlapping_pairs is not null then
    raise exception '0020: region bboxes overlap (%); region assignment is by bbox containment '
                    '(10 s2) and overlapping boxes double-count at ingest', overlapping_pairs;
  end if;
end
$$;
