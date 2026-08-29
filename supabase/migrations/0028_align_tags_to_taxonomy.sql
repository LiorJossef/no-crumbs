-- 0028_align_tags_to_taxonomy.sql — bring `saved_places.tags` onto the 2026-08-29 whitelist.
--
-- A one-off data alignment, on the owner's instruction: map the obvious equivalents, strip
-- everything else, so the library speaks one vocabulary rather than two.
--
-- WHY THIS IS NEEDED AT ALL. `domain/places/taxonomy.ts` closed the tag vocabulary at the
-- extraction seam, which stops the problem growing and does nothing about what is already stored.
-- Measured on the local database before this ran: **35 distinct tags across 22 tagged places, of
-- which 4 were on the whitelist** — `italian` (3 places), `japanese` (2), `specialty coffee` (2),
-- `bakery` (1). The other 31 included `hidden gem` (5), `market stall` (5), `hotel restaurant` (4),
-- `pan asian` (4), a neighbourhood (`marylebone`), a dish (`בורקס`) and a typo that reads as a
-- different word (`בקר`, "beef", for "morning"). Left alone, those stay in the filter row and
-- nothing imported after today can ever share one of them: a split vocabulary that gets worse with
-- every import.
--
-- WHAT IT DOES NOT DO, and each omission is deliberate:
--
--  * **It does not cap a place at two tags.** `MAX_SUB_TAGS_PER_PLACE` governs what the *extractor*
--    asks a model for, and its stated reason is the chip row at 375 px; the column's own bound is
--    8 (`saved_places_tags_bounded`). Two real places here end up with three genuinely true,
--    genuinely whitelisted tags, and dropping one of them would be loss with nothing bought. The
--    instruction was about the vocabulary, not about cardinality.
--  * **It does not touch `places.category` or `saved_places.category_override`.** Those are the
--    other half of the taxonomy and re-categorising a user's own places is a separate decision.
--  * **It does not touch `dishes`.** A dish is not a tag and never was.
--
-- REVERSIBILITY, stated plainly: there is none in this file. The pre-state is recorded outside it,
-- in `docs/evidence/places/tag-alignment-2026-08-29.md`, which lists every affected row with its
-- tags before and after. That is the restore path. It is a deliberate choice over a backup table:
-- a new table in `public` arrives wide open (see `scripts/check-migration-grants.sh`) and would
-- need RLS, three revokes and a policy to hold data nobody is going to query.
--
-- IDEMPOTENT. Every whitelisted value maps to itself and every alias' target is whitelisted, so a
-- second run is a no-op. Safe to re-apply, and safe on a fresh `db reset` where the table is empty.

begin;

-- The whole alignment is one statement, and the CTEs below are the reason: an earlier draft held
-- the vocabulary in `create temporary table`, which `scripts/check-migration-grants.sh` cannot
-- parse and therefore cannot prove closed. The guard is right to refuse what it cannot read — it
-- is the only thing standing between a new `public` table and the hosted default privileges that
-- arrive granting ALL to `anon` — so the migration changed, not the guard.
with
-- The whitelist, restated here because SQL cannot import TypeScript.
-- `tests/unit/places/taxonomy-migration.test.ts` parses this file and fails if either list drifts
-- from `domain/places/taxonomy.ts`. Silent one-directional drift between a copy and its original
-- is a trapdoor this repo has already fallen through twice.
whitelist(k) as (values
  ('italian'), ('japanese'), ('asian'), ('middle eastern'), ('mexican'), ('american'),
  ('mediterranean'), ('bakery'), ('desserts'), ('specialty coffee'), ('brunch'),
  ('cocktails'), ('wine bar'), ('beer pub'), ('speakeasy')
),
-- The durable alias table from `taxonomy.ts`. Every entry is admitted under the rule stated there:
-- the specification's own coverage text already says the target covers the source.
alias(src, dst) as (values
  ('bakeries', 'bakery'),
  ('dessert', 'desserts'),
  ('cocktail', 'cocktails'),
  ('beer and pub', 'beer pub'),
  ('speciality coffee', 'specialty coffee'),
  ('pizza', 'italian'),
  ('pasta', 'italian'),
  ('sushi', 'japanese'),
  ('ramen', 'japanese'),
  ('izakaya', 'japanese'),
  ('thai', 'asian'),
  ('vietnamese', 'asian'),
  ('chinese', 'asian'),
  ('pan asian', 'asian'),
  ('levantine', 'middle eastern'),
  ('skewers', 'middle eastern'),
  ('tacos', 'mexican'),
  ('burgers', 'american'),
  ('bbq', 'american'),
  ('diner', 'american'),
  ('diners', 'american'),
  ('greek', 'mediterranean'),
  ('seafood', 'mediterranean'),
  ('patisserie', 'bakery'),
  ('patisseries', 'bakery'),
  ('pastries', 'bakery'),
  ('ice cream', 'desserts'),
  ('gelato', 'desserts'),
  ('nepalese', 'asian'),
  ('מאפייה', 'bakery'),
  ('מאפים', 'bakery')
),
-- Phrases the *open* vocabulary produced, which the closed one cannot produce again. Separate from
-- the list above on purpose: those are vocabulary rules and belong in the application, whereas
-- these are two specific historical strings from two specific rows, and putting `modern italian
-- small plates` in a permanent alias map would be pretending it is a concept. Both are the model
-- describing an Italian restaurant at length — the behaviour the prompt's "prefer the plain,
-- reusable word a person would filter by" line asked against and did not get.
legacy_phrase(src, dst) as (values
  ('seasonal italian', 'italian'),
  ('modern italian small plates', 'italian')
),
mapping(src, dst) as (select src, dst from alias union all select src, dst from legacy_phrase),
-- `with ordinality` + `min(o)` reproduces `normalize_tag_list`'s own ordering rule exactly — first
-- appearance wins — so an aligned row is ordered the way the database would have ordered it on any
-- ordinary write, rather than alphabetically by accident.
aligned as (
  select sp.id,
         (select array_agg(d.t order by d.ord)
            from (select coalesce(m.dst, u.t) as t, min(u.o) as ord
                    from unnest(sp.tags) with ordinality as u(t, o)
                    left join mapping m on m.src = u.t
                   where coalesce(m.dst, u.t) in (select k from whitelist)
                   group by 1) d) as tags
    from saved_places sp
   where sp.tags is not null
)
update saved_places sp
   set tags = aligned.tags
  from aligned
 where aligned.id = sp.id
   -- Only rows that actually change. Without this every tagged row takes a write, its
   -- `saved_places_touch` trigger moves `updated_at`, and the library reorders itself for nothing.
   and sp.tags is distinct from aligned.tags;

-- `normalize_tag_list` (via the `saved_places_normalize_enrichment` trigger) turns an empty array
-- into NULL, so a row whose tags were all stripped lands on "no tags" rather than on "an empty list
-- of tags" — one empty state, which is what every read path already expects.

commit;
