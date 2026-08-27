# Handoff — place recognition, 2026-08-27

> Written at the end of the session that gave this project its first working place resolver.
> Read this with `CLAUDE.md` and `working-agreement.md`. **Nothing in this session is committed** —
> the working tree carries all of it, and per `git-workflow.md` uncommitted changes are owner-owned.

---

## 1. The priority for the next session — owner, 2026-08-27

**Improve place recognition in Tel Aviv + Hasharon.** The shortlist picker built this session is
useful, but **ideally we should rarely need it**. The goal is to match the venue *automatically*
whenever possible, with manual selection only as a fallback.

Evaluate with **~20–30 real TikToks representative of our target users** — people in their 20s
looking for trendy places: cafés, brunch spots, bars and wine bars, bakeries, desserts, and popular
or talked-about restaurants. Run them through the **real flow**, then identify why recognition
fails: POI coverage, Hebrew/English aliases, region inference, retrieval, ranking, categories,
multi-branch ambiguity. **Fix the highest-impact systemic problems first.**

The LLM may help with extraction, messy text, normalisation and context. **Our place data and
resolver should usually identify the correct real venue, with stable provenance.**

This does not mean stopping feature or UI work — just **don't over-invest in fallback UX while core
recognition still needs improvement**.

> This is a university MVP, not Google Maps. A convincing, reliable core for our actual audience in
> Tel Aviv + Hasharon first; deepen and expand after.

---

## 2. Verified state

### 2.1 The index exists now — it never did before

`poi_index` was **empty in every environment** until this session. The 4,997-row figure in the docs
came from an MS5 ingest that wrote a CSV to a temp directory and was never loaded. The whole scoring
stack — `normalise`, `jaro-winkler`, `score.ts`, the 44-case golden file — had never seen data.

| | |
|---|---|
| Region | `tlv`, display name **Tel Aviv & Hasharon** |
| Bounds | **lat 31.95 → 32.40, lng 34.70 → 35.00** |
| Rows | **10,462** Overture food-and-drink, `is_loaded = true` |
| Release | `2026-07-22.0` (pinned), `norm_version = 1` |
| Applied | **Local only.** Both hosted projects are still at `0009` |

Covers Tel Aviv, Herzliya, Ramat HaSharon, Ra'anana, Kfar Saba, Hod HaSharon, Netanya, Petah Tikva,
Givatayim, and south to Holon / Bat Yam / Rishon LeZion.

**One region, not two, and the reason is geometric:** Petah Tikva sits in a notch *east* of Tel
Aviv, not north of it, and Rishon LeZion / Bat Yam / Holon sit *south*. No non-overlapping pair of
boxes covers the area, and `10` §2 rejects overlapping bboxes as a configuration error.

### 2.2 Verified by running the product, not by reading tests

- **48 files / 823 tests passing**, `tsc --noEmit` clean, `lint` clean (2 pre-existing `<img>` warnings).
- The adapter was run **live against the real database** and reproduced an independent in-memory
  harness **bit for bit** on all 15 benchmark cases — two different code paths, same answers.
- A **real TikTok** (`.../video/7259010845558983978`, caption `Resturants in Tel Aviv 📍Ha Kosem`)
  was imported by hand in a browser at 1280×720 and 375×812, and the saved rows were read back in
  `psql`.

**The measured win:**

| | lat / lng | source_dataset | score |
|---|---|---|---|
| Resolver | 32.076416, 34.776737 | `overture-places` | 0.968 |
| Model guess (run 1) | 32.0736, 34.7816 | `llm-guess` | — |
| Model guess (run 2) | 32.0722, 34.7758 | `llm-guess` | — |

**11 m from truth, against 555 m and 483 m — and the two model guesses were 541 m from each other.**

**An unplanned second win: stable identity.** The save deduped on the Overture GERS id and created
no new row. The two `llm_guess` imports of this same caption had previously created **two separate
`places` rows**, because their guessed coordinates differed. Resolving fixes dedup as a side effect.

---

## 3. Benchmark — 7 of 14 correct top-1

The 15 adjudicated Tel Aviv cases in `benchmark-spec.json`, through the real adapter against the
real index. Reproduced independently by `qa-reliability`.

**Bands: 5 `preselect` / 5 `confirm` / 5 `no_match`. Zero false auto-accepts** — every `preselect`
was the right venue. That property is the harness's hard assertion and it must never regress.

| Cause | Cases | What is actually wrong |
|---|---|---|
| Absent from index | TLV-02, TLV-08 | Genuinely not in the data. Verified in `psql` |
| **Present but unreachable** | TLV-13 | `הסביח של עובד` **is** in the index at Sirkin 7, Givatayim. Latin query, Hebrew row, per-token substring prefilter — it can never be returned. **This is the alias gap, and it is a real observed failure** |
| Ranking | TLV-07, TLV-10, TLV-14 | See below |
| Region never searched | TLV-12 | `city_hint` was null, the city was inside the query text, so `regionsSearched = []` and **the database was never queried at all** |

**The two ranking bugs are different defects, not one:**

- **TLV-10** — `gelato` is not in `SCORING.generic`, so it is treated as identity-bearing and
  `Zucca Cafe & Gelato` beats every plain `Anita`. Correct row at rank 4.
- **TLV-14** — the generic list *works* here (`bar` is generic). The loss is category weight:
  `Hostel 51` (Overture category `bar`) scores 0.822 with the +0.18 category bonus; the real
  `Bar 51` (filed as `restaurant`) scores 0.820 **with a 1.000 name match**. The 0.18 bonus
  outweighs the entire gap between an exact and a 0.785 name match.

### 3.1 Why the picker is needed more often than it should be

Two cases — **TLV-03 and TLV-06** — are **correct but cannot auto-accept**, because the prefilter
returned exactly one row, so `margin` is `null`, and `preselect` requires a *measured* margin
(`10` §12 Q3: "unmeasured margin is not perfect margin").

**This is the single most direct cause of picker dependence, and it is a one-line policy question:
should a lone high-scoring candidate with no competitor auto-accept?** It was ruled `confirm` before
any data existed. Now there is data. Do not change it on argument — change it, or not, on the
20–30 real TikToks, watching the zero-false-auto-accept property.

---

## 4. Measured facts about the data (do not re-derive these)

- **Overture carries no aliases here.** `names.common` is null in **all 35,430** rows of the Tel
  Aviv bbox; only **150** rows have any `names.rules` language entry.
- **64% of the loaded index is Hebrew-named** — 6,699 of 10,462 rows — and **0 rows have any
  `alt_names`**. A Latin caption cannot reach any of those 6,699.
- **OSM has the bilingual data.** Same bbox: 2,742 named food/drink POIs, **1,831 with `name:en`**,
  **1,359 with both `name:he` and `name:en`**. Latin-reachable **81% vs Overture's 38%**.
- **The documented OSM alias-join fix is weak.** `06` §7.1 calls it "the fix for our weakest city";
  measured, it joins at **43%**, and only **423** Hebrew-only rows gain a Latin alias — because the
  join itself matches on names, so it fails across scripts for the same reason resolution does.
- **Transliteration is not the answer either.** A deterministic Hebrew→Latin transliterator scored
  **47% recall** at 0.80 similarity against OSM's 1,359 he/en pairs. Many misses are *translations*
  (`קפה בכיכר` → "Cafe Sqare"), which transliteration can never reach.
- **Google Places (checked against the live terms, not the repo's ASSUMED claim):** Place IDs may be
  stored **indefinitely**; coordinates **30 days**; names not cacheable; Places results on a map
  "must be shown on a Google Map". `location` is in Place Details **Essentials** (10,000 free/month);
  `displayName` is **Pro**. Text Search Pro: 5,000 free/month, then ~$32/1,000.
  **There is no billing-enabled key** — only a Maps demo key. Owner ruled: do not add Google yet.

---

## 5. Uncommitted work

Nothing committed, no branch cut. `tsc` clean, 823 tests green.

**New**
```
supabase/migrations/0020_poi_region_tlv_launch_area.sql
src/integrations/supabase/place-resolver.ts
src/domain/places/region-hint.ts
src/domain/import/resolution-record.ts
src/domain/import/resolve-candidates.ts
src/ui/import/candidate-resolution-view.ts
tests/manual/tlv-resolve-benchmark.manual.ts
tests/manual/vitest.manual.config.ts
tests/unit/integrations/supabase/place-resolver.test.ts
tests/unit/places/region-hint.test.ts
tests/unit/import/resolution-record.test.ts
tests/unit/import/candidate-resolution-view.test.ts
docs/evidence/places/tlv-resolve-benchmark.md
docs/evidence/places/tlv-resolve-benchmark-run.json
```

**Modified**
```
src/domain/places/score.ts              alt_names are now scored (golden file unchanged, still green)
src/app/api/imports/probe/route.ts      resolves candidates, stage 'resolve', stores shortlists
src/app/api/imports/confirm/route.ts    reads the stored shortlist, accepts optionIndex
src/domain/import/candidate-place.ts    Overture provenance + a real resolution_score
src/domain/import/confirm.ts, pipeline.ts, stored-candidates.ts
src/app/import/import-page-client.tsx   the shortlist picker; saveability bug fixed
scripts/poi-ingest.config.json          bbox synced to migration 0020
docs/evidence/places/README.md
+ 4 test files
```

**The security property to preserve.** The resolved shortlist is stored **server-side** in
`extractions.candidates` and read back at confirm; the browser sends only `optionIndex`, a position
in that stored list. `authenticated` holds no `INSERT`/`UPDATE` grant on that column — checked, not
assumed. Read `candidate-place.ts`'s header before touching this: a POST once renamed and relocated
another user's saved place, and that is what the authority boundary prevents.

---

## 6. The exact recommended next step

**Step 0, and it blocks the useful part of everything below: get the 20–30 real TikToks.**
No corpus exists in the repo; the only real Tel Aviv extraction cached locally is HaKosem. Every
number in §3 comes from hand-written benchmark queries that are **script-matched to the index by
construction**, which is precisely why the Hebrew gap barely shows there and will dominate on real
captions. Ask the owner for links across the six target categories (cafés, brunch, bars/wine bars,
bakeries, desserts, talked-about restaurants).

**Then build the corpus harness** — extend `tests/manual/tlv-resolve-benchmark.manual.ts` to take
real URLs through the real flow (oEmbed → caption → extraction → resolve) and report, per candidate:
band, score, margin, prefiltered count, top-1, and a hand-adjudicated verdict. **The headline metric
is the auto-match rate: the share of candidates that land in `preselect` AND are correct.** That
number is what the owner is asking to move, and today it is 5/14 on synthetic queries.

Then, in this order — the first three are cheap and evidenced:

1. **Region inference** (TLV-12). A null `cityHint` means the database is never queried. Fall back to
   the country hint, to the query text, or to a default region for a single-region MVP. A whole class
   of silent failure for one small change.
2. **`alt_names` from OSM** — now evidenced by TLV-13, not just theory. `score.ts` already scores
   aliases; the column already exists; 1,831 OSM rows carry `name:en`. Prefer the **union** over the
   43% fuzzy join. **This re-opens the ODbL sign-off that `mvp-plan.md` says is owed *before* an OSM
   path merges — route it to `security-privacy` first.**
3. **Ranking:** add `gelato`/`pizza`/`sushi`/`bakery` to `SCORING.generic` (TLV-10), and reconsider
   the 0.18 category weight that beats a 1.000 name match (TLV-14). Both re-fit the benchmark, so
   re-run the golden file.
4. **Trigram similarity arm.** `10` §5's SQL has two OR-ed arms; only the token-substring one ships,
   because the `%` operator is not expressible through PostgREST. It needs a `SECURITY DEFINER` RPC —
   a migration. This is what recovers misspelled queries.
5. **Re-cut the food category filter.** It drops `sandwich_shop`, `delicatessen`, `butcher_shop`,
   `lounge` and admits barbers via `%bar%`. Needs a ruling: it moves `06` §3.1's storage model.

---

## 7. Known gaps — do not report these as done

- **No genuinely `ambiguous` candidate has been driven end to end in a browser.** The real caption
  tested resolved to `preselect`, so the *override* path is proven and the "nothing is matched until
  you pick" path is only covered by unit tests and a stubbed fixture.
- **Mobile was driven with JavaScript clicks**, not synthetic pointer events — the browser pane went
  hidden and every click timed out while screenshots and DOM reads kept working. Desktop pointer
  input worked. Rendering and state changes at 375×812 were seen; touch-target behaviour was not.
- **`0020` is applied locally only.** Hosted projects are at `0009`.
- **A pre-existing e2e failure, not from this session:** `tests/e2e/import-happy-path.spec.ts:79`
  asserts `/\d+ places saved/i`, but the control now reads "N places in this area" — changed by
  commit `ec06aab` without updating the spec. Both files are untouched in the tree.
- **Environment trap:** the dev preview on `127.0.0.1:3000` returns 403 for
  `/_next/static/chunks/node_modules_*` to a browser (curl gets 200), so nothing hydrates and forms
  fall back to native GET. **Use `localhost:3000`.** This looks exactly like an auth bug and is not one.

---

## 8. Specialists used

`supabase-database` (migration 0020) · `maps-geospatial` (resolver adapter, `alt_names` scoring) ·
`nextjs-architect` (probe/confirm wiring, the stored-resolution seam) · `design-system-frontend`
(shortlist picker) · `qa-reliability` (benchmark harness, independent verification — it corrected
three of my failure classifications, including TLV-13, which changed the recommendation).

The ingest, the live adapter verification, the coordinate and dataset measurements, and the hand-run
browser import were done by the lead session.
