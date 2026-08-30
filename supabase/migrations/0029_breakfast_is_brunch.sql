-- 0029_breakfast_is_brunch.sql — one tag, one owner ruling.
--
-- `0028` dropped `breakfast` rather than mapping it, and said so in its evidence file: the
-- whitelist has `Brunch` and no `Breakfast`, they are not the same meal, and mapping one to the
-- other is a *round* rather than an equivalence — the same rule that dropped `natural wine`. The
-- owner overruled it on 2026-08-29, which is the right call for a list carrying one morning label
-- and no second one: with no `Breakfast` to be confused with, `Brunch` is simply what this
-- vocabulary calls the morning.
--
-- The alias is in `domain/places/taxonomy.ts` as well, so an import tomorrow lands the same way as
-- the row this fixes. `tests/unit/places/taxonomy-migration.test.ts` holds the two in step: it
-- unions the alias tables across every alignment migration and fails if the result differs from
-- the TypeScript, which is what stops a future alias being added to the code and never applied to
-- the library.
--
-- One row on the local database: `Kohi בית קפה יפני`, tagged `japanese, specialty coffee, bakery`
-- after `0028` and `japanese, specialty coffee, bakery, brunch` after this.
--
-- IDEMPOTENT: `brunch` is already whitelisted, so a second run finds no `breakfast` to map.

begin;

with alias(src, dst) as (values ('breakfast', 'brunch')),
aligned as (
  select sp.id,
         (select array_agg(d.t order by d.ord)
            from (select coalesce(a.dst, u.t) as t, min(u.o) as ord
                    from unnest(sp.tags) with ordinality as u(t, o)
                    left join alias a on a.src = u.t
                   group by 1) d) as tags
    from saved_places sp
   where sp.tags is not null
)
update saved_places sp
   set tags = aligned.tags
  from aligned
 where aligned.id = sp.id
   and sp.tags is distinct from aligned.tags;

commit;
