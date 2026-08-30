# Category alignment to the primary categories — 2026-08-29

Evidence for `supabase/migrations/0030_align_categories_to_taxonomy.sql` and
`0029_breakfast_is_brunch.sql`. **This file is the restore path** for both: neither has a `down`.

Applied to the **local** container only. Nothing hosted was touched — staging and production are at
migration `0023`.

## 1. `places.category`, before and after

| | Before | After |
|---|---|---|
| `restaurant` | 23 | 23 |
| `cafe` | 6 | **7** |
| `bar` | 1 | 1 |
| `bakery` | 1 | **0** |
| `shop` | 1 | **0** |
| *no category* | 0 | **1** |

The two rows that moved:

| Place | Before | After | Provider category |
|---|---|---|---|
| Anat Bakery | `bakery` | `cafe` | `bakery` |
| Gelalucci | `shop` | **(none)** | `ice_cream_shop` |

`saved_places.category_override` was entirely `NULL` before and after — the column has never been
written by a user. The migration covers it anyway, because `updateSavedPlaceCategory` wrote the
eight-value vocabulary into it until this branch, and a stored `dessert` there would outrank a
correct provider category forever.

## 2. What a null category does and does not mean

It is not "unknown", and it does not blank the row. `productCategoryFor` reads three claims in
order — the user's override, the provider's category, the model's hint — and a `NULL` in one of
them is not the end of the question.

**Gelalucci is the case worth looking at.** Its stored hint was `shop` (the caption is about ice
cream, so the model read the *subject* of the post as the venue's business), and that is what became
`NULL` here. What it actually renders from is `provider_category = ice_cream_shop`, which the
narrowed table now resolves to `cafe`. It read "Shop" two days ago, "Dessert" yesterday, and reads
**"Café"** today — from the same stored row, with the wrong claim removed rather than replaced.

**Anat Bakery** is the simpler half: `bakery` was a category and is now one of the things `cafe`
covers, so the stored value moves and the rendering does not change in kind.

The one row that ends with no category at all is a place whose model hint was outside the three and
whose provider category is absent: nothing left names something this product has a word for, so it
shows its locality alone and draws the house-mint pin.

## 3. `breakfast` -> `Brunch`, and one thing to know before this reaches a hosted database

The owner overruled `0028`'s decision to strip `breakfast` rather than map it. The alias is now in
`domain/places/taxonomy.ts`, so every future import lands it as `Brunch`.

**`0028` and `0029` in sequence do not recover a tag `0028` has already stripped.** On this local
database `0028` had already run when the ruling came, so `0029` found no `breakfast` to map and
reported `UPDATE 0`. The one affected row (`Kohi בית קפה יפני`) was restored by hand and its tags
are now `japanese, specialty coffee, bakery, brunch`.

The same ordering applies to any database where `0028` has not yet run: it will strip `breakfast`
before `0029` maps it, and the tag is gone. Neither migration has been applied to staging or
production, so this is still fixable. **The clean fix is to squash the two before any hosted push** —
that is the owner's call rather than something to do quietly, because it means rewriting a migration
that has already run somewhere.

## 4. Scope

- **Local only.** Nothing hosted was touched.
- `places.provider_category` is untouched — it is Google's string, not ours, and
  `productCategoryFromProvider` is what translates it.
- No table, column, constraint or policy changed. Both migrations are data-only.
