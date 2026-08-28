# The branch guard — measured, and the address conflict measured with it

**TRACK2-BRANCH, 2026-08-28.** Two changes shipped in `src/domain/places/score.ts` and
`src/domain/places/scoring-constants.ts`, both measured here.

1. **The branch guard.** `preselect` is withheld when the top-1 and a close rival are plausibly two
   branches of one venue. It removes the one false auto-accept
   [`dataset-confidence-weighting-2026-08-28.md`](dataset-confidence-weighting-2026-08-28.md) found
   (`TYO-10`), and it costs **seven** correct auto-accepts on the 44-case corpus: 31/10/3 → **24/17/3**.
2. **A contradicted address asks instead of discarding.** `addressScore === 0` currently drops any
   row without a *mathematically perfect* name below the `confirm` gate, where the shortlist is
   never offered. The band — not the score — is floored at `confirm`.

Everything below was produced by importing the real primitives (`rankPlaces`, `confidenceOf`,
`scorePlace`, `addressScore`, `normalise`) and re-simulating exactly the way
`benchmark-golden.test.ts`'s `resimulated()` does. No arithmetic was re-implemented. The scratch
harnesses are gone with the session; these numbers are the record, and every one of them is now
also pinned by a test.

---

## 1. The problem, restated as arithmetic

With `SCORING.total` at name-only (RESOLVE-CONF-1), a branch row loses to the bare venue name by
exactly

```
Δ = 0.45·(1 − jaroWinkler(bare, bare+suffix)) + 0.04·(surplus distinctive tokens)
```

Measured across the six branch families in the 44 cases:

| family | Δ |
|---|---|
| `Monmouth Coffee` / `… Company` | 0.031 |
| `むぎとオリーブ` / `… 銀座店` | 0.069 |
| `Onibus Coffee` / `… Yakumo` | 0.072 |
| `Koffee Mameya` / `KOFFEE MAMEYA Kakeru` | 0.072 |
| `Bar Termini` / `… Centrale` | 0.081 |
| `Padella` / `Padella Shoreditch` | 0.095 |

**Every one of those numbers measures how long the branch suffix is.** None of them measures which
branch the caption meant. So the margin gate at 0.05 reads a name-length artefact as confidence and
waves most of the family through — which is exactly what TYO-10 does: the bare row auto-accepts at
margin 0.069, pinning a point **3.2 km** from `むぎとオリーブ 銀座本店`, and `benchmark-spec.json`
gives that case `expected_area: "Ginza"`.

---

## 2. What shipped

```ts
// scoring-constants.ts
branchGuard: { rivalScoreBand: 0.12 },
samePlaceMetres: 75,
```

`branchRival(ranked, forms)` returns the rival that makes the top-1 a branch question, or `null`.
Three conditions, all required:

1. **`top.score − rival.score ≤ 0.12`.** A row further down is not competing for the pin.
2. **One name's normalised tokens contain the other's** (`nameDifference`), **and the caption did
   not settle it** — if every token the longer name adds is already in `queryForms()`'s output
   (`Dishoom Shoreditch` against `Dishoom`), the caption said which branch and asking would be the
   picker's other failure. An *empty* difference (two rows under one name) can never be settled
   this way, so the check requires at least one differentiator.
3. **Further apart than `SCORING.samePlaceMetres`** (75 m), via `placeProximity`.

`confidenceOf` gained a third parameter, `forms`. **Passing none turns the guard off**, which is
deliberate: condition 2 needs to know what was asked, and a caller with no query is banding a list
of numbers rather than answering a question. `scoreCandidates` — the one production entry point —
always passes `queryForms(query.text, query.textVariants)`, and `score.test.ts` pins that wiring.
The one caller that deliberately passes nothing is `benchmark-golden.test.ts`'s **replay** of the
2026-07 recorded scores, so a policy invented in 2026-08 does not re-band a historical run.

### Token containment, not substring containment

`normalise('Bar B')` **is** a substring of `normalise('Bar Benfiddich')`. Measured: a substring rule
fires on TYO-05 and TYO-13 for exactly that pair, which is not a branch of anything. Token
multiset containment does not. Token containment also makes the *differentiator* readable, which is
what condition 2 needs.

---

## 3. The 44 golden cases

### 3.1 Band table, per configuration

Rows are `preselect / confirm / no_match`. All measured with the query supplied, i.e. with the
caption rule active. `RESOLVE-CONF-1` is the working tree before this task.

| configuration | table | blocked cases | false auto-accepts |
|---|---|---|---|
| recorded 2026-07 run | 29 / 12 / 3 | — | 0 |
| RESOLVE-CONF-1, no guard | 31 / 10 / 3 | — | **1 — TYO-10** |
| guard, band ≤ 0.05 or 0.06 | 31 / 10 / 3 | none | 1 — TYO-10 |
| guard, band ≤ 0.07 | 30 / 11 / 3 | TYO-10 | 0 |
| guard, band ≤ 0.08 | 27 / 14 / 3 | + TYO-02, TYO-04, TYO-14 | 0 |
| guard, band ≤ 0.09 | 26 / 15 / 3 | + LDN-02 | 0 |
| **guard, band ≤ 0.10–0.15 (shipped at 0.12)** | **24 / 17 / 3** | **+ LDN-07, LDN-12** | **0** |
| guard, band ≤ 0.18 and up | 23 / 18 / 3 | + TYO-11 | 0 |

The distance threshold is **inert across this whole table**: identical results at 75 m, 150 m,
250 m, 500 m and 1 200 m. The corpus's closest branch pair is 497 m
(`Onibus Coffee 中目黒三丁目店`) and every pair that actually decides a band is ≥ 1 192 m apart.

### 3.2 Every case that moves, with old and new numbers

The six the guard moves (all `preselect → confirm`, top-1 **unchanged** — the guard never reorders
a shortlist):

| case | query | top-1 | score | margin | fired on | Δ | distance |
|---|---|---|---|---|---|---|---|
| TYO-02 | `Onibus Coffee` | Onibus Coffee | 1.0000 | 0.0715 | Onibus Coffee Yakumo | 0.0715 | 3 096 m |
| TYO-04 | `Koffee Mameya` | Koffee Mameya | 1.0000 | 0.0715 | KOFFEE MAMEYA Kakeru | 0.0715 | 8 479 m |
| TYO-14 | `Koffee Mameya` | Koffee Mameya | 1.0000 | 0.0715 | KOFFEE MAMEYA Kakeru | 0.0715 | 8 479 m |
| LDN-02 | `Bar Termini` | Bar Termini | 1.0000 | 0.0805 | Bar Termini Centrale | 0.0805 | 1 514 m |
| LDN-07 | `Padella` | Padella | 1.0000 | 0.0762 | Padella Shoreditch | 0.0950 | 2 102 m |
| LDN-12 | `Padella` | Padella | 1.0000 | 0.0762 | Padella Shoreditch | 0.0950 | 2 102 m |

And the case the guard exists for:

| case | before the guard | after |
|---|---|---|
| TYO-10 | `preselect`, score 1.0000, margin 0.0690, top-1 the bare `むぎとオリーブ` at 35.697,139.770 | `confirm`, same ranking, same score, same margin |

TYO-10's fired-on rivals: `むぎとオリーブ 銀座店` (Δ 0.0690, 15 743 m), `… 銀座本店` (Δ 0.0744,
3 180 m), `… 日本橋店` (Δ 0.0744, 1 192 m).

The nine RESOLVE-CONF-1 moves that were already enumerated in `REFIT_CASE_MOVES` are unchanged
except TYO-10, whose direction becomes `confirm → confirm`.

### 3.3 False auto-accepts — adjudicated on name **and** area

24 cases auto-accept. Each top-1 was checked against the spec's `expected_name` *and*
`expected_area`, because TYO-10 is proof that name alone is not enough — every branch shares the
name.

TYO-01, TYO-03, TYO-05, TYO-06, TYO-08, TYO-11, TYO-12, TYO-13, TLV-01, TLV-03, TLV-04, TLV-05,
TLV-06, TLV-09, TLV-11, TLV-14, LDN-01, LDN-04, LDN-05, LDN-06, LDN-08, LDN-09, LDN-10, LDN-11.

**Zero false auto-accepts.** Every one matches its expected venue and its expected area (e.g.
LDN-01 `Kiln` at 51.5113,−0.1361 = Soho/Brewer St; TYO-11 `Sarutahiko Coffee` at 35.6477,139.7109 =
Ebisu; TLV-09 `CafeXoho` at 32.0809,34.7703 = Gordon St).

**Stale recorded verdict, named not re-labelled:** `TLV-14` is filed `MISS_RANK` in
`adjudication.json`, a 2026-07 label made against a ranking whose top-1 was `Hostel 51`. Its
current top-1 is **`Bar 51`** on a 1.000 name score with a 0.215 margin, and the spec asks for "any
real Tel Aviv venue named Bar 51". It still auto-accepts and it is still correct. That is the only
entry in `STALE_VERDICTS`, unchanged by this task.

`TYO-10`'s recorded verdict is `OK`, which was true of the 2026-07 top-1 (`むぎとオリーブ 銀座本店`,
the Ginza branch). It is **not** true of the current top-1. That is the false auto-accept, and it
is why the adjudication had to be read against `expected_area` rather than the recorded label.

---

## 4. The 16 recorded Google candidates

`tiktok-recognition-run.google.json`. **The guard fires on nothing here, and the corpus cannot say
whether that is right.** Stated precisely rather than as coverage:

- **14 of the 16 have `candidatesPrefiltered: 1`.** With no rival the guard is structurally
  incapable of firing. That is not evidence it behaves well.
- The two multi-candidate cases are `טרטוריה אונה` (8 prefiltered, `no_match`) and `WOW`
  (2 prefiltered, `confirm`). Neither reaches `preselect`, so the guard — which only blocks
  `preselect` — cannot change either.
- Checked anyway on the names the record does carry: `Trattoria Una` against
  `איטלקיה בפשפשים` / `טונינו`, and `wow london` against `Wow Cosmetics`. Neither pair is in a
  containment relation, so condition 2 fails before distance is consulted.
- **The record does not store the runner-ups' coordinates**, only `name (score)` in `top3`. So even
  for those two, condition 3 is unreplayable. Any future Google-side evidence for this guard needs
  the run to record rival lat/lng.

---

## 5. The address conflict (folded in, second measurement)

### 5.1 The finding is arithmetic, not a corpus fact

`addressScore === 0` means the streets or the house numbers disagree, and `scorePlace` prices that
at `score = (1 − 0.2)·base`. Therefore:

- `preselect` needs `base ≥ 0.92 / 0.8 = 1.15` → **impossible**. A contradicted address can never
  auto-accept, today or after this change. Pinned as an inequality over the constants.
- `confirm` needs `base ≥ 0.80 / 0.8 = **1.0000**` → **only a mathematically perfect name survives.**

That threshold was never chosen. It is two constants fitted for other reasons colliding, and its
effect is that we discard a provider row we found and let `derivePlaceSave` fall back to the
model's coordinate, measured 65–470 m out.

### 5.2 The two contradicted candidates, replayed

Nine of the 16 recorded Google candidates carry an `addressHint`; exactly **two** are contradicted.
`textVariants` is not in the record, so both readings are given — the caption's text alone, and the
caption plus the provider row's own name as a Latin variant. (The recorded scores imply
`טרטוריה אונה` ran *with* a variant and `רוסטיקו` without.)

| candidate | hint | provider row | name score | score | band before | band after |
|---|---|---|---|---|---|---|
| `טרטוריה אונה` | `איינשטיין 69` | `Trattoria Una` @ `בארט 2` | 1.0000 (variant) | 0.8000 | `confirm`¹ | `confirm` |
| `טרטוריה אונה` | | | 0.1681 (text only) | 0.1344 | `no_match` | `no_match`² |
| `רוסטיקו` | `בזל 42` | `רוסטיקו רוטשילד` @ `שדרות רוטשילד 15` | 0.9134 (text only) | 0.7308 | `no_match` | **`confirm`** |
| `רוסטיקו` | | | 1.0000 (variant) | 0.8000 | `confirm`¹ | `confirm` |

¹ Under the *current* weights, not the recorded run's — the coordinator's table quoted 0.760 and
0.7046, which are pre-RESOLVE-CONF-1 numbers. `טרטוריה אונה` already clears the gate today, but
only because `0.8 × 1.0000 = 0.8000` lands **exactly** on it. A name score of 0.9999 would be
discarded.
² Correctly: with no Latin variant the Hebrew caption does not match the Latin row at all, and that
is a bilingual-expansion problem, not an address one.

Both venues are adjudicated **correct**. Google returned a different branch than the caption's
street in one case and a different address in the other.

### 5.3 The two forms measured

**Form A — an asymmetric weight** (`contradictedWeight` < `weight`), so a contradiction costs less
than corroboration pays.

| `contradictedWeight` | max reachable score | `confirm` needs base ≥ | `רוסטיקו` (0.9134 base) |
|---|---|---|---|
| 0.20 (today) | 0.800 | 1.0000 | 0.7308 `no_match` |
| 0.15 | 0.850 | 0.9412 | 0.7764 `no_match` |
| 0.10 | 0.900 | 0.8889 | 0.8221 `confirm` |
| 0.05 | 0.950 | 0.8421 | — **breaks the "never auto-accepts" guarantee** |

**Form B — floor the band, not the score.** When `addressScore === 0` and the pre-address base is
`≥ confirmScore`, the band is `confirm`. The score is untouched.

| | `טרטוריה אונה` | `רוסטיקו` (text only) | new constant | ranking |
|---|---|---|---|---|
| Form A @ 0.10 | 0.900 `confirm` | 0.822 `confirm` | yes, with 0.02 of headroom to the 0.92 gate | changed |
| **Form B (shipped)** | 0.8000 `confirm` | 0.7308 **`confirm`** | none | unchanged |

**Form B shipped.** Form A needs a new free parameter whose safety margin is 0.02, and it moves the
*ranking* to buy a *band*. The ranking is already right — a row we can place elsewhere should fall
below a row we cannot place at all — and what is wrong is only the destination. `ux-when-we-ask.md`
§3.1 makes `address_conflict` the highest-precedence reason to ask, and it could never fire while
such a row never reached `confirm`.

`ScoredPlace` gained `addressScore: number | null` so `confidenceOf` can tell *"somewhere else"* (0)
from *"could not compare"* (`null`) after the hint is out of reach. Like `matchedText`, it is
**in-memory provenance only** — it is not in `StoredRankedPlaceSchema`, so zod strips it on the way
back out of `jsonb`. A consumer reading a *stored* resolution therefore sees the stored band and
cannot re-derive the reason; deriving `address_conflict` has to happen in the same pass as the band,
which is what `ux-when-we-ask.md` §3 already specifies.

### 5.4 Where the two rules meet

They cannot conflict, and `רוסטיקו` shows why: it has **one** prefiltered candidate, so there is no
rival and the branch guard has nothing to compare. The conflict there is between the caption and
the row, not between two rows.

In general the two act on different transitions — the guard blocks `preselect → confirm`, the
address floor lifts `no_match → confirm` — and a contradicted address can never reach `preselect`
(§5.1). So no case can be subject to both, whatever order they are written in.

### 5.5 What the golden 44 says about the address

**Nothing.** `benchmark-spec.json` has no address field and `resimulated()` builds every row with
`addressLine: null`, so `addressScore` is `null` for all 220 rows and the term never fires. The band
table in §3 is unchanged by §5's change — asserted, not assumed.

---

## 6. Tried, and refused by the data

- **Band ≤ 0.07 (30/11/3, blocks TYO-10 alone).** It is the cheapest configuration that meets the
  bar and it is the tuned one: it sits **0.0025** under TYO-02's identical situation
  (`Onibus Coffee` vs `Onibus Coffee Yakumo`, 3.1 km apart, caption names no branch). That is a
  line drawn inside one population rather than between two, and every change to
  `extraTokenPenalty` or Jaro-Winkler would move it. 0.12 sits in the empty corridor between the
  highest firing pair (0.0966) and the lowest branch-shaped pair that must not fire (TYO-11's
  0.1760).
- **"The rival must itself clear `preselectScore`"** — an elegant formulation ("both rows would
  have auto-accepted alone, so the score cannot choose"). Measured: 27/14/3, blocking TYO-02,
  TYO-04, TYO-10, TYO-14. Refused because LDN-02's rival scores **0.9195** against a 0.92 gate: a
  0.0005 margin decides whether two cases move. A 0.08-wide empty corridor is better evidence than
  a 0.0005 coincidence.
- **"Require two or more branch rivals"** — 29/12/3, blocking only TYO-02 and TYO-10. Refused: one
  competing branch is exactly as ambiguous as two, and the count is an artefact of the golden file
  recording only a top-5. Over a real prefilter of 1 536 rows (TYO-10's) the count means nothing.
- **Substring containment instead of token containment** — fires on TYO-05 and TYO-13
  (`Bar B` ⊂ `Bar Benfiddich`). Rejected on that measurement.
- **Catching *sibling* branches** (`X 銀座店` against `X 日本橋店`) — neither name contains the
  other, so the shipped predicate returns `null` and the case is missed. A shared-prefix rule would
  catch it, and on this corpus it also catches `Bar B` / `Bar Benfiddich`. Not attempted;
  documented as a known gap in `branchRival`.
- **The caption rule is unexercised inside the band.** The only settled pair in the corpus is
  LDN-08 (`Dishoom Shoreditch` against `Dishoom`, differentiator `shoreditch`, which is in the
  query) and it sits at Δ 0.1715 — outside the 0.12 band, so it would not fire either way. The rule
  is asserted by unit test, not measured by the benchmark. Kept because it is a correctness rule
  about not asking a question the caption answered, and because Google returns branch-suffixed
  names as a matter of course.

---

## 7. One number that moved, and it is worth knowing

`ux-when-we-ask.md` §3.2 describes the branch predicate as *"more than 75 m apart"*, and §4 pins the
shortlist **collapse** to 75 m because that is the radius `resolve_place` already treats as one
place.

I measured 250 m as an alternative and **the 44 cases cannot discriminate between them** — identical
band tables at 75, 150, 250, 500 and 1 200 m (§3.1). Since the data is indifferent, the guard ships
at **75 m**, the same number, read from the same constant:

```ts
SCORING.samePlaceMetres = 75   // one number, two consumers, opposite verdicts
```

and the predicate is exported once, as `placeProximity(a, b) → { difference, metres, sameSpot }`,
for both sides to use. Two numbers would have left a dead zone between them where a pair is neither
collapsed nor asked about.

---

## 8. How to re-run

```
# the 44 golden cases, both jobs — replay at the recorded weights, re-fit under the current ones
npx vitest run tests/unit/places/benchmark-golden.test.ts

# the guard, the proximity predicate and the address floor, on constructed and real rows
npx vitest run tests/unit/places/score.test.ts
```

Both assert **zero false auto-accepts**. Neither may regress on it. The 24/17/3 tally and the
fifteen enumerated case moves are assertions, not documentation: a change that moves a band without
moving `REFIT_CASE_MOVES` fails.

The Google-side numbers in §4 and §5 came from re-scoring
`docs/evidence/places/tiktok-recognition-run.google.json` with the real primitives and no network.
They are **not** a full replay — the record stores the winner's raw inputs but not the runner-ups',
and not `textVariants` — so top-1 scores are exact, margins are not, and §5.2 gives both readings
rather than picking one.
