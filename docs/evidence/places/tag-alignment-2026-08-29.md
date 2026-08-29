# Tag alignment to the taxonomy whitelist — 2026-08-29

Evidence for `supabase/migrations/0028_align_tags_to_taxonomy.sql`. **This file is the restore
path**: the migration is a one-way data change with no `down`, and the "before" column below is the
only record of what `saved_places.tags` held on the local database before it ran.

Applied to the **local** container only (`postgresql://postgres@127.0.0.1:54322`). Nothing hosted
was touched — see §5.

## 1. What ran

Owner instruction, 2026-08-29: align existing places with the new whitelist, map the obvious
equivalents, strip the rest, "so the library stays 100% unified with the new standard".

The mapping is `domain/places/taxonomy.ts`'s `SUB_TAG_ALIASES` plus two phrases the *open*
vocabulary produced and the closed one cannot produce again (`seasonal italian`, `modern italian
small plates`). `tests/unit/places/taxonomy-migration.test.ts` parses the migration and fails if
either list drifts from the TypeScript.

## 2. The vocabulary, before and after

| | Before | After |
|---|---|---|
| Distinct tags in the library | **34** | **7** |
| Tags on the whitelist | 4 | 7 (all of them) |
| Places carrying at least one tag | 22 | 17 |
| Places carrying none | 10 | 15 |
| Rows written | — | 22 |

After: `asian` (6 places), `bakery` (4), `italian` (4), `japanese` (2), `mediterranean` (2),
`specialty coffee` (2), `desserts` (1).

Before, the 34: `hidden gem` (5), `market stall` (5), `hotel restaurant` (4), `pan asian` (4),
`italian` (3), `greek` (2), `japanese` (2), `late night` (2), `nepalese` (2), `pasta` (2),
`sharing plates` (2), `specialty coffee` (2), and one each of `artisan`, `bakery`, `bar`,
`breakfast`, `covent garden`, `fusion`, `gelato`, `ice cream`, `marylebone`, `matcha`,
`modern italian small plates`, `natural wine`, `pastries`, `schnitzel`, `seasonal italian`,
`street food`, `underground`, `בורקס`, `בקר`, `חצר`, `מאפייה`, `מאפים`.

## 3. Every affected row

| Place | Tags before | Tags after |
|---|---|---|
| Anat Bakery | `בורקס, מאפייה, hidden gem` | `bakery` |
| Container | `natural wine, late night` | **(none)** |
| Gelalucci | `gelato, ice cream` | `desserts` |
| Jones Family Kitchen | `hidden gem` | **(none)** |
| Kiaans | `pan asian, market stall` | `asian` |
| Kiaans Tooting | `pan asian, market stall, hidden gem, street food, late night` | `asian` |
| Kohi Coffee Shop | `japanese, specialty coffee, bakery, matcha` | `japanese, specialty coffee, bakery` |
| Kohi בית קפה יפני | `japanese, specialty coffee, pastries, breakfast` | `japanese, specialty coffee, bakery` |
| La Nonna | `italian, pasta, market stall` | `italian` |
| La Nonna Brixton | `italian, pasta, artisan` | `italian` |
| MBER | `pan asian, sharing plates, hidden gem` | `asian` |
| MBER London | `pan asian, sharing plates, underground` | `asian` |
| Oscar's | `schnitzel, bar` | **(none)** |
| Sycamore Restaurant | `italian, hotel restaurant, covent garden` | `italian` |
| Sycamore Vino Cucina | `seasonal italian, hotel restaurant, modern italian small plates` | `italian` |
| The Laughing Yak | `nepalese, market stall, hidden gem` | `asian` |
| The Laughing Yak | `nepalese, market stall` | `asian` |
| The Life Goddess | `greek` | `mediterranean` |
| The Life Goddess | `greek` | `mediterranean` |
| Tokii | `hotel restaurant, marylebone` | **(none)** |
| Tokii | `fusion, hotel restaurant` | **(none)** |
| האחים | `בקר, מאפים, חצר` | `bakery` |

## 4. The five places that lost every tag, and why

Each is a case where the caption said something real that the whitelist has no word for. They now
carry no tag, which is the honest outcome — the alternative was rounding, and rounding puts a claim
in the library that no caption made.

| Place | What it said | Why nothing was mapped |
|---|---|---|
| Container | `natural wine`, `late night` | A wine *style* is not `Wine Bar`, which is a venue type; the specification says nothing about opening hours. |
| Jones Family Kitchen | `hidden gem` | A vibe. No facet on the list holds vibes. |
| Oscar's | `schnitzel`, `bar` | `schnitzel` is a dish and belongs in `dishes`; `bar` is a *primary category*, not a sub-tag. |
| Tokii (×2) | `hotel restaurant`, `marylebone`, `fusion` | A venue type, a neighbourhood `locality` already holds, and a term that names no cuisine on the list. |

## 5. Scope, and what was deliberately not done

- **Local only.** Staging and production were not touched. Both are at migration `0023` and
  production is currently returning 500 on `/map` and `/import` (empty Vercel env store — see
  `docs/product-backlog-2026-08-29.md` §0), so pushing a data migration there is a separate,
  separately-instructed action.
- **No cap at two tags.** Two places (the Kohi pair) end with three genuinely true, genuinely
  whitelisted tags. `MAX_SUB_TAGS_PER_PLACE` governs what the extractor *asks a model for* and its
  stated reason is the chip row at 375 px; the column's own bound is 8. The instruction was about
  the vocabulary, not about cardinality.
- **`places.category` and `saved_places.category_override` untouched.** Those are the taxonomy's
  other half. Five candidate objects across two `extractions` rows still carry `shop`, and saved
  rows still display `Dessert`, `Shop` and `Place`. Re-categorising a user's own places is a
  separate decision.
- **`dishes` untouched.** A dish is not a tag.

## 6. Two things this surfaced

**The duplicate-place problem is now visible in the tags.** Eight pairs in this table are the same
venue saved twice — `Kiaans`/`Kiaans Tooting`, `La Nonna`/`La Nonna Brixton`, `MBER`/`MBER London`,
`Sycamore Restaurant`/`Sycamore Vino Cucina`, `The Laughing Yak` ×2, `The Life Goddess` ×2,
`Kohi Coffee Shop`/`Kohi בית קפה יפני`, `Tokii` ×2 — which is the `places` identity gap recorded in
the 2026-08-29 handoff §3. After the alignment **every one of those pairs carries identical tags**,
because the differences between them were all in the free-form half. That is a stronger dedup
signal than existed yesterday, and it is free.

**`breakfast` was stripped and is the one near-miss worth a second look.** `Kohi בית קפה יפני` was
tagged `breakfast`; the whitelist has `Brunch` and no `Breakfast`. Breakfast and brunch are not the
same meal, so mapping one to the other is a round rather than an equivalence, and it was dropped
under the same rule that dropped `natural wine`. If the owner considers them one facet, the fix is
an alias in `taxonomy.ts` and a second small migration — not a change to this one, which has run.
