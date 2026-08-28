# Band policy — what a decisive margin is worth, measured

**2026-08-28.** Written after trying the obvious fix for the largest remaining recognition bucket
and finding that the data refutes it. Nothing in this file shipped; `SCORING.bands` is unchanged at
`preselectScore 0.92 / preselectMargin 0.05 / confirmScore 0.80`.

---

## 1. The bucket this was trying to move

On the 13-URL real-caption corpus under prompt `p11`, the auto-match rate is **7/16 (44%)** with
zero false auto-accepts. The largest failure bucket is `not_auto_accepted` at **5** — every one of
them the **right venue at rank 1**, held in the `confirm` band, so the user has to open the picker
and tap a row that is already selected-in-all-but-name.

| candidate | score | margin | top-1 (Overture confidence) | why the score is short of 0.92 |
|---|---|---|---|---|
| קוהי | 0.9004 | 0.3127 | Kohi Coffee Shop (0.30) | Overture's own confidence in a **correct** row is 0.30 |
| קפה אירופה | 0.8997 | 0.1247 | Cafe Europa (1.00) | Overture files a café as `restaurant`, so the category term pays 0 |
| Palette Bistro | 0.8914 | 0.0888 | Palette Bistro (0.91) | — |
| Gelalucci | 0.8668 | 0.1968 | Gelalucci (0.34) | dataset confidence again |
| WOW | 0.8208 | *null* | wow london (0.35) | lone prefiltered row, so no margin exists |

Two of the five are held back by **`datasetConfidence`**, which `scoring-constants.ts` already
describes as *"a data-quality number about a row, not evidence about this query"* — and which is
nonetheless 10% of the score. One is held back by a **taxonomy disagreement** between our 3-value
hint and Overture's ~200-value `providerCategory`. Neither is evidence that we have the wrong venue.

## 2. The idea, and why it looked right

`scoring-constants.ts` argues that the margin gate is the one doing the important work: *"a high
score with a low margin almost never means 'unsure which business', it means 'sure of the business,
unsure which branch'."*

The proposal was the converse. If a thin margin means we cannot tell two rows apart, a **decisive**
margin means we can — and once we can, the score only has to establish that the top row matched at
all. So: a second path into `preselect` at `score ≥ 0.85` **and** `margin ≥ 0.05` (the existing
margin constant, unchanged).

On the corpus alone it is compelling. Four of the five above cross; **7/16 → 11/16 (69%)**, zero
false auto-accepts. The separation looked clean: every *correct* confirm case had margin ≥ 0.089,
every *wrong* case margin ≤ 0.022.

> **CORRECTION, 2026-08-28.** §3 below is wrong about which venue TLV-14 ranks first, and the
> refutation rests on that. Its top-1 under the shipped weights is **`Bar 51`** — the venue the case
> asks for — and it already was before that section was written; `benchmark-golden.test.ts`'s
> `REFIT_CASE_MOVES` recorded the change (`top1Was: 'Hostel 51'`, `top1Now: 'Bar 51'`) at the time.
> What §3 read was `adjudication.json`'s `MISS_RANK`, a 2026-07 label made against a two-re-fits-ago
> ranking. §4's diagnosis — that the category term is the damage, in both directions — survives and
> is the section worth keeping. See
> [`resolution-confidence-2026-08-28.md`](resolution-confidence-2026-08-28.md) §5, and §§1-2 of that
> file for what shipped instead.

## 3. What refuted it

Replayed against the **44-case golden benchmark under today's shipped weights** —
`resimulated()` in `benchmark-golden.test.ts`, not the recorded 2026 scores — the rule produces a
false auto-accept:

```
TLV-14   score 0.9000   margin 0.0952   verdict MISS_RANK   -> would PRESELECT
```

`TLV-14` is the query **`Bar 51`**. Its top-1 under today's weights is **`Hostel 51`**, which
Overture files as category `bar` and which therefore *earns* the 0.10 category term. The venue the
case is actually asking for, `Bar 51`, is filed as `restaurant` and *loses* it. The wrong venue wins
by a confident 0.095.

**No threshold in (score, margin) separates that from the cases we wanted to admit.** TLV-14 at
0.9000 sits between קפה אירופה (0.8997) and קוהי (0.9004) — seven ten-thousandths apart — so no
score floor works. Palette Bistro is *correct* at margin 0.0888, **below** TLV-14's 0.0952, so no
margin floor works either.

The first pass at this measured only against `raw-overture-scored.json`'s **recorded** scores, where
TLV-14 is 0.822 with margin 0.002 and comfortably excluded. That is a different scoring era. Any
band work has to be judged on `resimulated()`.

## 4. What the refutation points at

The same term is doing the damage in both directions:

- קפה אירופה: **correct** row, category *mismatch* → −0.10 relative to a matching competitor.
- TLV-14: **wrong** row, category *match* → +0.10 over the correct one.

That is the category term, and it is already a known open problem rather than a new one:
`scoring-constants.ts` records that the weight went 0.18 → 0.10 in TLV-RANK-1 *because* a category
bonus was measured outranking a 1.000 name match — **on TLV-14** — and it is still outranking it at
0.10.

So the honest reading is that `not_auto_accepted` is not a band-policy bucket at all. It is the
category and dataset-confidence terms contributing noise in both directions, and the band gate is
just where the noise becomes visible. Candidates, in rough order of how well-evidenced they are:

1. **Make a category *mismatch* cost nothing rather than 0.10 less than a match.** Renormalise so
   the term is a bonus over a baseline instead of a swing. This addresses both failures at once and
   is the one the data most directly supports.
2. **Stop `datasetConfidence` from deciding a band.** It moves קוהי (0.30) and Gelalucci (0.34)
   below a gate they otherwise clear on name alone. It is a property of the row, not of the query.
3. **Rule on the lone candidate.** `WOW` has one prefiltered row and therefore no margin, so it can
   never reach `preselect` by construction. Whether "the only row we found, and it matches" should
   auto-accept is a policy question nobody has answered.

All three change what the product presents as settled, and (1) and (2) re-measure every number in
both harnesses. They are worth a session with the owner awake, not a constant nudged overnight.

## 5. How to re-run this

```
# corpus (13 URLs, costs LLM calls only when the prompt version moves)
set -a; source .env.local; set +a
npx vitest run tests/manual/tiktok-recognition.manual.ts \
  --config tests/manual/vitest.manual.config.ts --reporter=verbose --disable-console-intercept

# the 44 golden cases, under the shipped weights, no network
npx vitest run tests/unit/places/benchmark-golden.test.ts
```

Both assert zero false auto-accepts. Neither may regress on it.
