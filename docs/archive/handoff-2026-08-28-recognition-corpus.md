# Handoff — recognition measured on real captions, 2026-08-28

> Supersedes the priorities in `handoff-2026-08-27-place-recognition.md`. That document's
> **facts** are still good and still worth reading (its §4 measurements, its §7 environment traps);
> its **ordered next steps** are not, and this file says why on evidence rather than argument.
>
> Everything described here is **committed and merged**. `main` is verified: `npm run verify`
> exit 0, 882 tests.

---

## 1. The one number that matters

**The auto-match rate on real TikTok captions is 4/16 (25%).**

Auto-match = an extracted candidate that lands in `preselect` **and** is the right venue. That is
the number the owner asked to move, and it is the only number anyone should quote.

The synthetic benchmark says **11/15**. Both are honest; only one is the product. The 15 queries in
`benchmark-spec.json` were written by hand and are **script-matched to the index by construction** —
a Latin query for a Latin-named row — which is precisely what a real caption is not. Roughly half
the old number was the measuring instrument.

| harness | what it measures | now |
|---|---|---|
| `tests/manual/tiktok-recognition.manual.ts` | **the product** — oEmbed → caption → extraction → resolve | **4/16** |
| `tests/manual/tlv-resolve-benchmark.manual.ts` | the scorer and prefilter against a fixed substrate | 11/15 (floor pinned at 11) |

Run the corpus (fully cached, **zero LLM calls**, adding a URL costs exactly one):

```
set -a; source .env.local; set +a
npx vitest run tests/manual/tiktok-recognition.manual.ts \
  --config tests/manual/vitest.manual.config.ts --reporter=verbose --disable-console-intercept
```

The corpus is **13 URLs against the owner's brief of 20–30**, and `bars_and_wine_bars` has none.
Add URLs to `tests/manual/tiktok-recognition-corpus.json` — data only, no code. A case with no
`expected` block runs, prints everything needed to adjudicate it, and counts toward the rate in
neither direction.

**Zero false auto-accepts, throughout, on both harnesses.** That property is asserted in both and
must never regress.

---

## 2. The single highest-value next step, and it is measured

**Have the extractor emit the venue name in both scripts, and resolve on both.**

`docs/evidence/places/bilingual-expansion.md` has the full run. The short version: every venue we
currently cannot find **is in the index, under its Latin name, while the caption gave the Hebrew
one**. Feed the resolver the Latin form and nothing else changes:

| query | score | top-1 |
|---|---|---|
| `Kohi` | 0.900 | Kohi Coffee Shop @ בן יהודה 155 |
| `Trattoria Una` | 0.934 | Trattoria Una @ אינשטיין 69 |
| `Cafe Europa` | 0.900 | Cafe Europa @ Rothschild Boulevard 9 |
| `Under the Tree` | 0.997 | Under the Tree @ בן יהודה 202 |
| `Rustico` | 0.923 | Rustico Rothschild @ Rothschild Boulevard 15 |
| `Gelalucci` | 0.867 | Gelalucci @ שדרות מסריק 1 |

All six correct at rank 1. Three clear the 0.92 auto-accept score gate.

**Why this is the LLM's job and not an algorithm's.** `מתחת לעץ` → `Under the Tree` is a
*translation*. The deterministic transliterator measured on 2026-08-27 scored 47% recall and failed
on exactly this class. A model does it trivially, and it is the same single call we already pay for.

**It also closes the OSM question for good.** We do not need OSM's aliases in our *index*; we need
the *query* in both scripts. No ODbL surface, no share-alike obligation, no 423-rows-for-a-standing-
commitment trade.

Suggested shape: extend the extraction schema with `nameLatin` / `nameHebrew` (or a `nameVariants`
array), resolve each variant, and keep the best-scoring result with its provenance. Watch the
zero-false-auto-accept property — more query forms means more chances to match the wrong row.

Cost: one prompt change, then `RECOGNITION_REFRESH=1` re-extracts the corpus at 13 Gemini calls
against a 500/day budget.

---

## 3. What an LLM should **not** do here, also measured

**Do not build an LLM re-ranker over the shortlist.** It was the obvious idea and the data kills it.

Of the 11 non-auto candidates, the right row is:

- **absent from the shortlist entirely — 8**
- at rank 1 already, band too low — 2
- at rank ≥2 where a re-ranker could help — **1**

A re-ranker fixes at most one case in eleven. The bottleneck is retrieval and query formulation,
not selection. Revisit only if the bucket shape changes.

---

## 4. Where the remaining failures are

```
unreachable_in_index  4   מתחת לעץ · קפה אירופה · טרטוריה אונה · Oscar's
absent_from_index     2   בל עמי · דיזנגוף 99
not_auto_accepted     3   קוהי · Palette Bistro · WOW
ranking               2   בראסרי 18 · מסעדת רוסטיקו
extraction_miss       1   Gelalucci
no_region_searched    0   (was 1 — fixed)
```

- **`unreachable` (4)** — three are §2's bilingual case. `Oscar's` is genuinely absent (a new
  opening; the index holds `פונדק השובבים` at that address).
- **`not_auto_accepted` (3)** — the right venue at rank 1, band too low. `קוהי` is here *because*
  of §5's blocker. `Palette Bistro` and `WOW` need the band policy or the lone-candidate ruling.
- **`ranking` (2)** — `מסעדת רוסטיקו` is §6's Hebrew construct-state bug.
- **`extraction_miss` (1)** — `Gelalucci` was named only in an `@handle`. The prompt should treat
  handles as name evidence; the venue is in the index.

---

## 5. The blocker that stopped the address work paying off

**Retrieval is fixed; ranking cannot exploit it.** This is the most important thing to understand
before touching the scorer.

The address arm now retrieves `Kohi Coffee Shop` for `קוהי`. It scores **0.224**:

```
קוהי / בן יהודה 155 — 2 prefiltered
  #1 NIKO by Sharon Cohen   score=0.278  name=0.000  addr=1
  #2 Kohi Coffee Shop       score=0.224  name=0.000  addr=1
```

A cross-script name scores ~0, so `0.2 + 0.8·base` lands near 0.28 — below any wrong-venue row that
merely shares a script (0.79). **The address delivers the row and the blend throws it away.**

**Do not fix this by raising `SCORING.address.weight`.** `Oscar's` is the ready-made counterexample:
the arm correctly returns `פונדק השובבים` — right address, wrong venue — and enough weight to rescue
Rustico makes that the first false auto-accept. The `רוסטיקו` case already shows the shape, its
margin falling 0.086 → 0.052.

The fix is §2: make the **name** matchable. Then the address confirms rather than carries.

---

## 6. Cheap, evidenced, not done

**Hebrew construct-state nouns are missing from `SCORING.generic`.** The set has `מסעדה`
(restaurant, absolute) but not **`מסעדת`** (construct — *restaurant-of*), which is what captions
actually write. That one word floods the prefilter with 213 rows and is why `מסעדת רוסטיקו` returns
`מסעדת קיסר`. Measured against the index, none is the whole name of a single row, so all pass the
admission rule in `scoring-constants.ts`:

| word | rows containing it | rows whose whole name it is |
|---|---|---|
| `מסעדת` | 213 | 0 |
| `מאפיית` | 82 | 0 |
| `סניף` | 42 | 0 |
| `חנות` | 20 | 0 |
| `ביסטרו` | 18 | 0 |
| `פאב` | 13 | 0 |

Read `scoring-constants.ts`'s admission rule and its recorded negative result (`wine` was tried and
**rejected on measurement** — it made a no-name caption resolve confidently 20 km away) before
adding any word. Adding to `generic` also *weakens* the candidate-side surplus penalty, which is a
real second-order effect with a worked example in that file.

**Hebrew's definite article still defeats the list** — `הבר`, `הפיצה` are single tokens the set
cannot see. Fixing that changes `normalise()`, which bumps `NORM_VERSION` and forces a full
`poi_index` reload. That is a data migration, not a word list.

---

## 7. State, and the open question that is the owner's

**On `main`:** the resolver with a loaded 10 462-row `tlv` index; `poi_prefilter` with all three
arms (substring, trigram, address); the address term in the scorer; region inference from the
candidate string and from Hebrew abbreviations; the shortlist picker.

**The lone-candidate policy (`10` §12 Q3) is still open, and the 2026-08-27 handoff's framing of it
was wrong.** It said a lone prefiltered row with an unmeasured margin was "the single most direct
cause of picker dependence", measured on the synthetic `HaKosem` case. On the **real** caption the
same venue arrives as `Ha Kosem` — with a space — prefilters 397 rows, gets a measured margin of
0.200 and auto-accepts. One space, and the diagnosis evaporates. Decide it on the corpus when it
actually occurs there, not on the benchmark.

**Two defects recorded and not fixed:**
1. The `source_dataset` CHECK that `0010` calls "the enforcement of `06` §11 Q2" **does not fire** —
   proven with a rolled-back UPDATE. An alias join adds ODbL content without adding an ODbL row.
2. `alt_names` flows from `place-resolver.ts` through the stored resolution record and out to the
   browser in `probe/route.ts`. Empty today, so harmless today.

**Traps that cost real time:**
- `npm run db:reset` **destroys the 10 462 ingested rows** — they come from
  `scripts/ingest-poi-region.sh`, not from a migration or the seed. Migrations are proven from
  scratch by CI's `migrations` job, which is the right place.
- Use `localhost:3000`, never `127.0.0.1:3000` — the latter 403s on chunk requests, nothing
  hydrates, and it looks exactly like an auth bug.
- vitest v4 swallows `console.log` under the default reporter. Both manual harnesses need
  `--reporter=verbose --disable-console-intercept` or they look like they did nothing.

---

## 8. Specialists used

`maps-geospatial` (the ranking re-fit, then the address scoring term — it also found that the
wiring point was `pipeline.ts`'s `buildResolveQuery`, not the file I scoped it to, which would have
made the streamed and probe paths resolve the same caption differently) · `supabase-database` (the
trigram arm, then the address recall arm — it declined my instruction to use `SECURITY DEFINER`
with a better argument than mine, and corrected three details of the address query shape I had
measured on hand-cleaned data) · `security-privacy` (the ODbL sign-off, and two defects found by
attacking rather than reading) · `qa-reliability` (the corpus harness, and the finding that the
synthetic benchmark reports a problem the real caption does not have).

Done by the lead: the corpus adjudication, the bilingual measurement, the threshold ruling
(chosen 0.44, reversed to 0.37 after measuring substitution recall at 100% vs 41%), the region and
Hebrew-abbreviation fixes, all integration, and every commit and merge.
