# Bilingual query expansion — the measured case for it

> Run 2026-08-28 by the lead session, against the real local `poi_index`
> (region `tlv`, 10 462 rows, Overture release `2026-07-22.0`) and the **shipped** domain scorer
> (`src/domain/places/score.ts`) at the weights on `main`.
> The probe is reproduced at the end of this file. It is quoted rather than committed as a
> `.ts` file on purpose: `tsc` and `next build` cover the whole repo, so a throwaway script under
> `docs/` breaks CI (it did — that is why this note exists).

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


---

## Reproducing it

Rows first — the prefilter, at the signature `0022` ships:

```sql
select coalesce(json_agg(row_to_json(t)),'[]') from (
  select v.q as query, v.addr as addr, p.name, p.address_line, p.locality, p.lat, p.lng,
         p.provider_category, p.dataset_confidence
  from (values
   ('Kohi','בן יהודה 155'),('Trattoria Una','איינשטיין 69'),('Cafe Europa',null),
   ('Under the Tree',null),('Rustico','רוטשילד 15'),('Gelalucci','מסריק 1')
  ) v(q, addr)
  join lateral (
    select * from public.poi_prefilter(
      array['tlv'], string_to_array(lower(v.q),' '), lower(v.q), v.addr, 200)
  ) p on true
) t;
```

Then score them with the shipped scorer. Save as a `.ts` file **outside the repo** (a scratch
directory), and run it with `npx tsx <path> <rows.json>`:

```ts
import { readFileSync } from 'node:fs';
import { rankPlaces } from '<repo>/src/domain/places/score.ts';

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8')) as any[];
const CAT: Record<string, 'cafe' | 'bar' | 'restaurant' | null> = {
  Kohi: 'cafe', 'Trattoria Una': 'restaurant', 'Cafe Europa': 'cafe',
  'Under the Tree': 'cafe', Rustico: 'restaurant', Gelalucci: 'cafe',
};

const byQuery = new Map<string, any[]>();
for (const r of rows) {
  if (!byQuery.has(r.query)) byQuery.set(r.query, []);
  byQuery.get(r.query)!.push(r);
}

for (const [q, rs] of byQuery) {
  const places = rs.map((r) => ({
    provider: 'overture' as const, providerPlaceId: 'x',
    sourceDataset: 'overture-places' as const, regionId: 'tlv',
    name: r.name, altNames: [], addressLine: r.address_line, locality: r.locality,
    countryCode: 'IL', lat: r.lat, lng: r.lng,
    providerCategory: r.provider_category, datasetConfidence: r.dataset_confidence,
  }));
  const ranked = rankPlaces(
    { text: q, cityHint: 'תל אביב', countryHint: 'IL', categoryHint: CAT[q] ?? null,
      addressHint: rs[0].addr, near: null, maxResults: 5 },
    places,
  );
  const t = ranked[0];
  console.log(`${q}  rows=${rs.length}  score=${(t?.score ?? 0).toFixed(3)}  ` +
              `top1=${t?.place.name ?? '—'} @ ${t?.place.addressLine ?? '—'}`);
}
```

`rankPlaces` returns the ranked array directly; `confidenceOf` is what turns it into a band, and
this probe deliberately does not call it — see the limits above.
