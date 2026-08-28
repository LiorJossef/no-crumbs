# RESOLVE-CONF-1 — what the score is made of, re-measured

**2026-08-28.** Shipped: `SCORING.total` goes from `{ name: 0.80, category: 0.10, datasetConfidence: 0.10 }`
to `{ name: 1, category: 0, datasetConfidence: 0 }`. The score is now the name score, corroborated or
contradicted by the address term when — and only when — both sides have an address.

This supersedes [`band-policy.md`](band-policy.md)'s §3 refutation, which was based on a stale
adjudication label; see §5. It agrees with
[`dataset-confidence-weighting-2026-08-28.md`](dataset-confidence-weighting-2026-08-28.md)'s closing
section on where the real problem is, and takes its `TYO-10` finding seriously; see §6.

---

## 1. Why, in one paragraph

The owner ruled on 2026-08-28 that Google Places is the resolver the product is built on and Overture
is legacy infrastructure to phase out, and specifically: *"Where old Overture assumptions are leaking
into the Google path — like `dataset_confidence` affecting whether we show the picker — remove or
redesign those assumptions based on the actual evidence we have."*

Both non-name terms turned out to be that. One is an Overture column with no meaning on Google. The
other is a three-valued hint judged against a provider's hundred-valued taxonomy, and it was the
single largest reason the candidate picker appeared for venues we had already identified exactly.

## 2. Method

Both benchmarks replayed through the **real** scoring primitives — `bestNameScoreAcrossForms`,
`categoryScore`, `addressScore`, `confidenceOf` — with alternative blends applied on top. Nothing in
`score.ts` or `scoring-constants.ts` was modified during measurement, so the numbers are the
production scorer's, not a re-implementation's.

- **44 golden cases**: `raw-overture-scored.json` + `benchmark-spec.json`, each row's unrecorded
  Overture confidence recovered exactly by algebra from the recorded `score`, `name_score` and
  `cat_match` — the same inversion `benchmark-golden.test.ts`'s `resimulated()` uses.
- **16 real Google candidates**: the top-1 rows recorded in `tiktok-recognition-run.google.json`,
  re-scored from their stored `providerCategory`, `addressLine` and the run's own `addressHint`.

**A stated limitation.** 14 of those 16 have `candidatesPrefiltered: 1`, so their band is fully
reconstructible; the two multi-row cases (`טרטוריה אונה`, `WOW`) keep their recorded runner-up gap
as a floor rather than a re-derived margin. And the replay passes no `textVariants`, so a handful of
name scores here are lower than the live run's — `קוהי` replays at 0.718 where the live run, with
the variant `Kohi`, scored 0.919. Directions hold; individual absolute scores in §4 do not all match
the run record.

## 3. The 44 golden cases

| weighting | preselect | confirm | no_match | false auto-accepts |
|---|---|---|---|---|
| **today** — 0.80 / 0.10 / 0.10 | 29 | 11 | 4 | 0 |
| drop confidence only, renormalised | 30 | 10 | 4 | 0 |
| category as a capped bonus | 16 | 26 | 2 | 0 |
| **shipped** — name only | **31** | **10** | **3** | **0** |

The capped-bonus row is the instructive failure. `min(1, name + 0.1·category)` looks like the
obvious way to make a mismatch cost nothing, and it *lowers* the auto-accept count by thirteen —
because saturating at 1.0 collapses the margin between the top row and its rival, and the margin
gate then refuses them all. A bonus that cannot exceed the ceiling destroys the very separation the
band policy reads.

## 4. The 16 real Google candidates

| weighting | preselect | confirm | no_match |
|---|---|---|---|
| **today** | 6 | 6 | 4 |
| drop confidence only | **6** | 6 | 4 |
| **shipped** — name only | **11** | 1 | 4 |

**Dropping dataset confidence alone changes nothing on Google.** That is the measurement that
settles what the term was doing there: the adapter supplies a constant 0.5, a constant cannot rank
anything, and renormalising the remaining two puts every row back in the same place relative to the
gate. It was costing a flat 0.05 and buying nothing.

The five candidates that move are all the same shape — an **exact** name match held at `confirm`
because our three category words do not cover Google's type for the venue:

| candidate | Google's answer | our hint | its `primaryType` | before | after |
|---|---|---|---|---|---|
| קפה אירופה | קפה אירופה | cafe | `restaurant` | 0.850 confirm | 1.000 preselect |
| Palette Bistro | Palette Bistro | bar | `restaurant` | 0.850 confirm | 1.000 preselect |
| Gelalucci | Gelalucci @ שדרות מסריק 1 | cafe | `ice_cream_shop` | 0.880 confirm | 1.000 preselect |
| דיזנגוף 99 | דיזנגוף 99 @ דיזנגוף 99 | cafe | `bar` | 0.880 confirm | 1.000 preselect |
| WOW | wow london @ בית אשל 15 | cafe | `store` | 0.833 confirm | 0.941 preselect |

Every one of them is adjudicated correct. A café that Google files as `restaurant` is a taxonomy
disagreement between two vocabularies, not evidence that we have the wrong venue — and it was
deciding whether the user had to answer a question.

## 5. Correction — `band-policy.md` §3 read a stale verdict

`band-policy.md` refutes a `score ≥ 0.85 && margin ≥ 0.05` second preselect path on the grounds that
it produces a false auto-accept on **TLV-14** (`Bar 51`), reporting the top-1 as `Hostel 51`.

**Under the shipped weights TLV-14's top-1 is `Bar 51` — the venue the case asks for — and it was
already `Bar 51` before this change.** That was TLV-RANK-1's fix, and
`benchmark-golden.test.ts`'s own `REFIT_CASE_MOVES` recorded it at the time
(`top1Was: 'Hostel 51', top1Now: 'Bar 51'`).

What band-policy read was `adjudication.json`'s `MISS_RANK` for TLV-14, which is a **2026-07 label
made against a two-re-fits-ago ranking**. The test file warns about exactly this in the comment above
`REFIT_CASE_MOVES` — *"where the re-fit changes the top-1 the verdict is therefore stale and
pessimistic (TLV-10 and TLV-14 are filed MISS_RANK and are now ranking the right venue first)"* — and
the refutation used it as ground truth anyway.

This does not resurrect that proposal, which is superseded by removing the terms rather than adding
a second gate around them. It is recorded because the same stale labels will be read again.
`benchmark-golden.test.ts` now carries a `STALE_VERDICTS` register so a disagreement between the
recorded adjudication and the current ranking has to be written down, one case at a time, instead of
being absorbed.

**A second, symmetrical trap, and it caught me.** A mechanical re-adjudication on `expected_name`
alone marks `TYO-10`'s new top-1 correct, because every branch of a chain shares the name. It is
`expected_area` that says which one. A benchmark whose cases are branches cannot be adjudicated on
names.

## 6. The one thing this measurement does not settle

`dataset-confidence-weighting-2026-08-28.md` found that removing the confidence term makes **TYO-10**
a false auto-accept, and that is true of this change too. Query `むぎとオリーブ`, and the five
prefiltered rows are four branches of one ramen chain plus one unrelated venue:

| row | coordinates | nameScore |
|---|---|---|
| むぎとオリーブ 銀座本店 | 35.669, 139.764 — Ginza, the venue the case asks for | 0.926 |
| むぎとオリーブ 銀座店 | 35.635, 139.614 | 0.931 |
| むぎとオリーブ 日本橋店 | 35.687, 139.775 | 0.926 |
| **むぎとオリーブ** | 35.697, 139.770 — ~3 km from Ginza | **1.000** |
| むろと | 35.606, 139.732 | 0.863 |

The bare-named row wins on an exact match and clears the margin gate at 0.074, and it is the wrong
branch.

**The honest reading is not that the terms should stay.** Under today's weights the same case
auto-accepts nothing only because the confidence term happens to compress a gap it knows nothing
about — a right answer for no reason. The failure is that **nothing in the scorer distinguishes "same
venue, different branch" from "different venue, similar name"**, and four branches of one chain with
a caption that names none of them is a genuine question, which is what `confirm` is for. That is the
branch guard, measured separately in `branch-guard-2026-08-28.md`, and this change does not ship
without it.

## 7. What now protects the auto-accept gate

`scoring-constants.ts` used to state the property as *"a candidate cannot reach `preselect` without a
category match, because 0.80 + 0.10 < 0.92"*. That dies with the term, so the replacement is named
rather than assumed — and it turns out to have been doing the work all along.

`06` §6.3 credits the **0.92 score gate** with catching all three no-name captions. Re-measured with
the category term as a bonus, NEG-01 scores **0.958** and NEG-02 **0.944**, both *over* that gate.
What keeps them out of `preselect` is their margins: **0.005** and **0.008**, against a 0.05 gate. A
caption that names no venue matches a hundred rows equally badly, and that is what it looks like.

Under the shipped weights all three land under both gates (0.858 / 0.844 / 0.744), so the belt and
the braces are both there — but the margin is the one that holds structurally, and
`benchmark-golden.test.ts` now asserts it directly.

## 8. How to re-run

```bash
# the 44 golden cases, under the shipped weights, no network
npx vitest run tests/unit/places/benchmark-golden.test.ts

# the real corpus. Google Text Search answers replay from docs/evidence/.local/ after the
# first run, so this costs no quota once the cache is warm.
set -a; source .env.local; set +a
PLACE_RESOLVER=google npx vitest run tests/manual/tiktok-recognition.manual.ts \
  --config tests/manual/vitest.manual.config.ts --reporter=verbose --disable-console-intercept
```

Both assert zero false auto-accepts. Neither may regress on it.
