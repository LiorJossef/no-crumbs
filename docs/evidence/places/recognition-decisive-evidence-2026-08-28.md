# RECOG-METRICS-2 — the two evidence overrides, landed and measured

**2026-08-28.** Follows [`recognition-scoreboard-2026-08-28.md`](recognition-scoreboard-2026-08-28.md),
which measured the failure classes and proposed three fixes. **F2 and F3 have landed. F1 is held on
an owner ruling** and the measurement below is why it should stay held.

Measured entirely by **replay from disk**: zero Google Text Search requests, zero network, zero
database. Regenerate:

```bash
npx vitest run tests/manual/recognition-scoreboard.manual.ts \
  --config tests/manual/vitest.manual.config.ts --reporter=verbose --disable-console-intercept

npx vitest run tests/manual/recognition-failure-classes.manual.ts \
  --config tests/manual/vitest.manual.config.ts --reporter=verbose --disable-console-intercept

npx vitest run tests/unit/places/benchmark-golden.test.ts tests/unit/places/score.test.ts
```

---

## 1. What landed

Three files, and nothing outside `src/domain/places/`.

| file | change |
|---|---|
| `src/domain/places/score.ts` | two new private predicates, `addressIsDecisive` and `exactNameBeatsFuzzyRival`, and one rewired `if` chain in `confidenceOf`. **No new state, no new score, no signature change.** |
| `src/domain/places/scoring-constants.ts` | one new group, `decisive.rivalNameSeparation = 0.02` — the only free parameter either rule introduces |
| `tests/unit/places/score.test.ts` | twelve cases: six per rule, and eight of the twelve assert a shape the rule must **refuse** |

`confidenceOf`'s decision, in full:

```
if      addressIsDecisive(ranked, forms)                      -> preselect        (F2)
else if score >= preselectScore
        && (marginOk || exactNameBeatsFuzzyRival(ranked, forms))   (F3)
        && branchRival(ranked, forms) === null                -> preselect
else if score >= confirmScore || contradictedAddressOnly(top) -> confirm
else                                                          -> no_match
```

**Neither rule invents a number.** `top.score` is returned unchanged in every branch, so
`places.resolution_score` still stores what the scorer measured and only the band moves — the same
discipline `contradictedAddressOnly` follows in the opposite direction.

**F2** — the caption wrote a street address; the top row carries the same street **and the same
house number**; every distinctive word the caption used is in that row's name; and no row still in
contention corroborates that same address. Then the venue is identified, and F2 waives the score
gate, the null-margin block and the branch guard. Held by four conditions: `addressScore === 1` is a
strict test (a missing house number halves it, a different one is 0, a cross-script pair is `null`),
token coverage must be 1.000 because an address is not unique, the score floor is still
`confirmScore`, and a same-address contender vetoes it outright.

**F3** — the top row's name matched the query exactly and wholly, the runner-up is not branch-shaped
(`nameDifference === null`), and its **name** score is more than 0.02 lower. Then the margin gate —
and only the margin gate — is waived. The score gate and the branch guard still have to pass.

---

## 2. The three-corpus table, before and after

| | Google before | **Google after** | Overture before | **Overture after** |
|---|---|---|---|---|
| correct top-1 | 15/16 · 94% | 15/16 · 94% | 12/16 · 75% | 12/16 · 75% |
| **auto-resolution** | 11/16 · 69% | **12/16 · 75%** | 9/16 · 56% | **12/16 · 75%** |
| genuine ambiguity | 0 | **0** | 0 | **0** |
| **wrong auto-match** | 0 | **0** | 0 | **0** |
| needless questions | 4 · 25% | **3 · 19%** | 3 · 19% | **0 · 0%** |

**Overture now asks no needless questions at all**, and its auto-resolution rate equals its correct
top-1 rate: every venue it ranks first, it now auto-accepts. What is left on that provider is three
coverage misses and one extraction miss, neither of which is a band problem.

Golden 44, under `resimulated` — **unchanged, and asserted**:

| | preselect | confirm | no_match | false auto-accepts |
|---|---|---|---|---|
| before | 24 | 17 | 3 | 0 |
| **after** | **24** | **17** | **3** | **0** |

`benchmark-golden.test.ts` asserts `{ preselect: 24, confirm: 17, no_match: 3 }` and
`autoAccepted.length === 24` with no non-`OK` verdict outside the stale register. Neither moved.

The candidates the two rules carry, asserted as a regression in
`recognition-failure-classes.manual.ts` rather than left as prose:

| provider | candidate | band | score | margin | note |
|---|---|---|---|---|---|
| google | `קוהי` → `Kohi בית קפה יפני` | preselect | 0.9067 | `null` | F2: under the score gate **and** no margin; `בן יהודה 155` answers both |
| overture | `רוסטיקו` → `Rustico @ בזל 42` | preselect | 1.0000 | 0.0950 | F2: the branch guard fires and is overridden — the caption named the street |
| overture | `WOW` → `wow london @ בית אשל 15` | preselect | 0.9412 | `null` | F2: one prefiltered row, so `'narrow-filter'` could never auto-accept it |
| overture | `Palette Bistro` | preselect | 1.0000 | 0.0333 | F3: 1.000 against `Paulette` at 0.967, 1.5 km away |

---

## 3. The regression the golden replay caught, and what it changed

**`exactNameBeatsFuzzyRival` was written without a `forms` gate and silently re-banded a 2026-07
measurement.** `benchmark-golden.test.ts`'s replay section bands the **recorded** scores with
`confidenceOf(ranked)` — no query — and F3 reads `nameScore` and `tokenCoverage`, both of which the
recorded rows supply. LDN-01 (`Kiln`, recorded score 0.999, recorded margin 0.048) moved from
`confirm` to `preselect` and four assertions failed: the band-for-band fidelity check, the 29/12/3
tally, the 29-preselect verdict check, and the fifteen-case re-fit enumeration.

That is exactly the trap `confidenceOf`'s own header already names about the branch guard — *"a
guard invented in 2026-08 re-banding that run would turn a fidelity check into a moving target"* —
and the fix is the rule that was already there: **both overrides are off when `forms` is empty.**
It is not a workaround. Both are claims about *this query against this row*, so with no query there
is nothing for either to be true of. `score.test.ts` pins it for each rule, with the LDN-01 numbers
in the comment so the next person does not have to rediscover them.

Worth stating plainly: the golden file cannot test what either rule *does*, and it caught a real
defect anyway — because its job there is not to grade the rule, it is to notice that a rule exists
at all.

---

## 4. One test outside `places` changed, and how

`tests/unit/integrations/supabase/place-resolver.test.ts` — *"retrieves a Latin-named row from a
Hebrew caption and scores it through the variant"* — asserted `confirm` on the grounds that *"a lone
candidate still has an unmeasured margin, so it is `confirm`, not an auto-accept"*. Its fixture is
`קוהי` with `addressHint: 'בן יהודה 155'` against `Kohi Coffee Shop @ בן יהודה 155`: it **is** the F2
case, and that rule now has one documented exception.

The assertion was **not** relaxed to make the change pass. It was replaced by three assertions where
there was one — `addressScoreOf === 1`, `margin === null`, `band === 'preselect'` — so that a future
change reaching `preselect` by some *other* route fails there instead of passing quietly. The test's
own purpose (TLV-BILING-B: the Latin row is retrieved and scored through the variant) is untouched.

---

## 5. F1, held — and the measurement that says keep holding it

Owner ruling, 2026-08-28: F1 would auto-accept a row whose name wholly contains the query, and on
`מתחת לעץ` that means silently picking one of **three branches the caption explicitly listed**
(`נתן אלתרמן 13`, `לבונטין 13`, `בן יהודה 202`). The corpus scores that correct only because its
expectation accepts any branch; in the user's terms it is a wrong auto-match.

**Re-measured against the post-landing baseline, F1 would now add exactly one candidate across both
providers — and it is that one.**

```
google   מתחת לעץ → מתחת לעץ בן יהודה   addressHint=NONE   correctRank=1
total across both real providers: 1        golden-44: 0
```

The `addressHint=NONE` column is the general argument, not a coincidence of one case. **A caption
that wrote a street address is already decided**: corroborated, F2 takes it; contradicted, it is an
`address_conflict` and a question. So F1's entire remaining territory is candidates with **no**
address hint — which is precisely the population where a trailing token cannot be told apart from a
branch name, because nothing else in the query says where the venue is. F1 is not a rule with an
unlucky exception; it is a rule that only ever fires where its own evidence is absent.

**On making it safe.** The suggested condition — *fire only when the caption names no sibling
branch* — is not implementable in the scorer. `ResolveQuery` carries `text`, the hints, `textVariants`
and `near`; nothing tells it how many venues the caption listed, and for `מתחת לעץ` the extractor
emitted one candidate with `addressHint: null` from a caption containing three addresses. The signal
would have to be a new extraction field (a branch count, or an `addressHint` list), which is
`src/domain/extraction/**` and a prompt version. **Measured payoff on this corpus: one candidate.**
That is not worth an extraction schema change, and I would not propose it on this evidence.

---

## 6. `datasetConfidence` weightings, re-run against the new baseline

Refreshes §5 of the previous file, with F2 and F3 now in. `preselect` over all resolved candidates
(16 per provider, being the 15 adjudicated plus one the corpus has never ruled on).

| weighting | golden-44 | golden false | google | google false | overture | overture false |
|---|---|---|---|---|---|---|
| BASELINE 0.80 / 0.10 / 0.10 | 23 | **0** | 11 | **0** | 10 | **0** |
| DROP (renormalised) | 23 | **0** | 11 | **0** | 10 | **0** |
| DROP-UNPUBLISHED-ONLY | 23 | **0** | 11 | **0** | 10 | **0** |
| **SHIPPED — name only** | **24** | **0** | **13** | **0** | **12** | **0** |

Name-only still wins on all three corpora and the ordering is unchanged. The three proposals now sit
level with each other on every corpus, which is what "the term was doing nothing the address and the
guard do not do better" looks like at the end.

## 7. The lone candidate, re-run

| provider | `soleCandidateMeaning` | auto-resolution | wrong auto-match |
|---|---|---|---|
| google | `narrow-filter` | 7/16 (44%) | 0 |
| google | `exhaustive-search` **(shipped)** | **12/16 (75%)** | 0 |
| overture | `narrow-filter` **(shipped)** | 12/16 (75%) | 0 |
| overture | `exhaustive-search` | 12/16 (75%) | 0 |

Two things moved. Google's `narrow-filter` figure rose from 1/16 to 7/16 — F2 waives the
null-margin block on its own evidence, so six of Google's auto-accepts no longer depend on the
provider-semantics argument at all. And **on Overture the two settings are now identical**: F2 took
`WOW` on the caption's address, which was the single candidate `'exhaustive-search'` would have
bought there. The recommendation not to extend it to Overture is now free rather than merely
principled.

---

## 8. What could not be proven

1. **Neither rule was exercised by the golden benchmark.** No golden case has a query contained in
   its top-1's name, and `raw-overture-scored.json` records no `addressLine`, so F2 is
   arithmetically a no-op there. The 44 cases **neither refute nor endorse** these rules — they
   only confirm the rules did not disturb them. Unrefuted is not proven, and both previous band
   proposals died on that file.
2. **F2's same-address veto is measured against a record that holds one row per candidate.** In
   production `confidenceOf` sees the whole ranking, so the veto is exact. Offline,
   `tiktok-recognition-run.google.json` stores only the top row for 14 of 16 Google candidates, so
   the evidence that no rival corroborates equally is evidence about rows we can see. It is a
   stronger claim on Overture, where the record keeps ten. `score.test.ts` covers the veto with a
   constructed two-row case instead, which is a unit proof and not a corpus one.
3. **Retrieval is still out of reach.** The replay fixes the provider's answer, so the remaining
   Google class — `address_contradicts_a_correct_venue`, `טרטוריה אונה` and `רוסטיקו` — cannot be
   worked on here. `רוסטיקו` needs a second Text Search carrying the address; `טרטוריה אונה` is a
   corner building addressed from two streets, 11 m apart, and needs coordinate proximity to
   override a street-name disagreement. Both are live-call work.
4. **n = 16 on 13 URLs, `bars_and_wine_bars` unrepresented.** Every rate here is a pilot. One
   candidate is six percentage points.
5. **Nothing verified in the running app.** These are offline numbers about the resolver. The review
   screen renders `preselect` differently from `confirm` (`ux-when-we-ask.md` §2), and four
   candidates changing band is a visible product change that has not been looked at.
6. **A firing branch guard no longer implies a `confirm` band.** `רוסטיקו` on Overture fires the
   guard and auto-accepts. Nothing in `src/` reads `branchRival` outside `confidenceOf` today, so
   nothing can disagree — but `ux-when-we-ask.md` §3.2 derives its `branch` reason from the guard's
   verdict, and whoever implements that taxonomy must read the band first and the guard second.
   Noted in `branchRival`'s header where it will be seen.
