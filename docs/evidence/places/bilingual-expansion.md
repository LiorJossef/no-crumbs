# Bilingual query expansion — the measured case for it

> Run 2026-08-28 by the lead session, against the real local `poi_index`
> (region `tlv`, 10 462 rows, Overture release `2026-07-22.0`) and the **shipped** domain scorer
> (`src/domain/places/score.ts`) at the weights on `main`.
> Probe script: `bilingual-expansion-probe.ts` in this directory.

## The question

The real-caption corpus (`tiktok-recognition.md`) leaves four candidates in `unreachable_in_index`
and one in `extraction_miss`. The handoff of 2026-08-27 assumed the cross-script gap ran
**Latin caption → Hebrew row**, and proposed joining OSM `alt_names` to close it.

Both halves of that turned out to be wrong. Eleven of the owner's twelve captions are **Hebrew**,
and the venues we cannot find are in the index under **Latin** names.

## What the index actually holds

| caption gave | `poi_index` holds |
|---|---|
| `קוהי` | **Kohi Coffee Shop** @ בן יהודה 155 |
| `טרטוריה אונה` | **Trattoria Una** @ אינשטיין 69 |
| `קפה אירופה` | **Cafe Europa** @ Rothschild Boulevard 9 |
| `מתחת לעץ` | **Under the Tree** @ בן יהודה 202 |
| `רוסטיקו` | **Rustico** @ בזל 42 |
| *(extraction never named it)* | **Gelalucci** @ שדרות מסריק 1 |

`מתחת לעץ` → `Under the Tree` is a **translation**, not a transliteration. That matters: the
deterministic Hebrew→Latin transliterator measured on 2026-08-27 scored 47% recall and failed on
exactly this class. No algorithm reaches it. A language model does it without being asked twice.

## The measurement

Same prefilter, same scorer, same weights, same `addressHint`. **The only change is that the query
text is the Latin form.**

| query | rows | score | top-1 |
|---|---|---|---|
| `Kohi` | 2 | **0.900** | Kohi Coffee Shop @ בן יהודה 155 |
| `Trattoria Una` | 12 | **0.934** | Trattoria Una @ אינשטיין 69 |
| `Cafe Europa` | 200 | **0.900** | Cafe Europa @ Rothschild Boulevard 9 |
| `Under the Tree` | 139 | **0.997** | Under the Tree @ בן יהודה 202 |
| `Rustico` | 7 | **0.923** | Rustico Rothschild @ Rothschild Boulevard 15 |
| `Gelalucci` | 11 | **0.867** | Gelalucci @ שדרות מסריק 1 |

**All six return the correct venue at rank 1**, scoring 0.867–0.997, where the Hebrew form returns
either nothing or the wrong venue. Three clear the 0.92 `preselect` score gate outright.

## Limits of this measurement, stated

- The Latin forms were supplied **by hand**. This measures the ceiling — what the resolver does
  when the query is matchable — not the model's ability to produce them. That ability is the thing
  to test first, and it is one prompt change plus 13 cached-corpus re-extractions.
- Band is score **and** margin. Three candidates clear the score gate; whether they clear the
  margin gate was not measured here, because `rankPlaces` was called directly rather than through
  `confidenceOf`.
- `Rustico` resolves to the Rothschild branch because the `addressHint` on that candidate is
  `רוטשילד 15`. That is correct for that candidate, and it is a different row from the `בזל 42`
  one the sibling candidate wants — a reminder that multi-branch resolution is decided by the
  address, not the name.
