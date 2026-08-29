-- 0030_align_categories_to_taxonomy.sql — bring the stored categories onto the three.
--
-- Owner ruling, 2026-08-29, the second half of the taxonomy: `dessert` -> `cafe`, `shop` and
-- `other` -> NULL. `bakery` and `attraction` are not named in the ruling and are here anyway,
-- because they are the same two rules — a bakery is a cafe for exactly the reason a gelateria is
-- (`cafe` covers "bakeries, patisseries, ice cream and desserts"), and an attraction has no home in
-- a vocabulary of three for exactly the reason a shop has none. Leaving either behind would leave
-- the library speaking two vocabularies, which is the thing being fixed.
--
-- WHAT NULL MEANS HERE, and it is not "unknown". `productCategoryFor` reads three claims in order —
-- the user's override, the provider's category, the model's hint — and NULL in one of them is not
-- the end of the question. A row whose `places.category` becomes NULL here still renders as a cafe
-- if Google calls it `ice_cream_shop`. What NULL removes is a *wrong* claim, not a right one: it
-- says the model's guess from the caption named something this product has no word for.
--
-- MEASURED BEFORE, on the local database:
--
--   places.category               restaurant 23, cafe 6, shop 1, bakery 1, bar 1   (32 rows)
--   saved_places.category_override  all NULL                                       (32 rows)
--
-- So two rows move: one `shop` -> NULL and one `bakery` -> `cafe`. The `dessert`, `other` and
-- `attraction` arms fire on nothing locally and are here because staging, production and any
-- future import under an older prompt version can carry them — `places.category` has no CHECK
-- constraint and never has.
--
-- `saved_places.category_override` gets the same treatment, and the reason it is worth doing on a
-- column that is entirely NULL today: it is free text the user writes, `updateSavedPlaceCategory`
-- wrote the eight-value vocabulary into it until this branch, and a stored `dessert` there would
-- outrank a correct provider category forever. The rule is the same, and applying it to only one
-- of the two columns would be the drift this migration exists to end.
--
-- REVERSIBILITY: none in this file. The pre-state is in
-- `docs/evidence/places/category-alignment-2026-08-29.md`, row by row, which is the restore path.
--
-- IDEMPOTENT: every target of the mapping is one of the three or NULL, and none of those is a
-- source, so a second run finds nothing to change.

begin;

-- One statement, CTEs rather than temp tables, for the reason `0028` gives: the grant guard cannot
-- parse `create temporary table` and is right to refuse what it cannot prove closed.
with retired(src, dst) as (values
  -- Folded into `cafe`. The specification's own line: `cafe` is "cafés, specialty coffee,
  -- bakeries, patisseries, ice cream and desserts".
  ('dessert', 'cafe'),
  ('bakery', 'cafe'),
  -- No home in a vocabulary of three. `other` is the sharpest of the three: it was never a
  -- category, it was a refusal to say one wearing a category's clothes.
  ('shop', null),
  ('attraction', null),
  ('other', null)
)
update places p
   set category = r.dst
  from retired r
 where r.src = p.category;

with retired(src, dst) as (values
  ('dessert', 'cafe'),
  ('bakery', 'cafe'),
  ('shop', null),
  ('attraction', null),
  ('other', null)
)
update saved_places sp
   set category_override = r.dst
  from retired r
 where r.src = sp.category_override;

commit;
