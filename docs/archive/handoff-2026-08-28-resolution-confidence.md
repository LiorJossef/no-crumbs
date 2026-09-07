# Handoff — the score stops guessing, and the picker stops asking

Cold-start document, 2026-08-28. Written after
[`handoff-2026-08-28-categories-and-the-picker.md`](handoff-2026-08-28-categories-and-the-picker.md),
whose §3 was this session's brief. It **answers** that ruling's scoring half and specifies its
product half; §3 of that document is now history rather than a task list.

Branch **`feat/resolution-confidence`**. A second session was committing to the same branch
throughout — several docs commits interleaved with mine are theirs, not mine.

**If you read one section, read §4 — the branch guard, which is what makes §2.1 safe to ship, and
what it cost.**

---

## 1. The owner's ruling that reframed everything

> I do not want Overture to remain part of the long-term product direction. Google Places is the
> resolver I want us moving toward. Don't spend time optimizing Overture-specific confidence,
> scoring, or quirks unless it's temporarily necessary to keep the current production fallback
> working. Treat Overture as legacy/fallback infrastructure to phase out, not as something the new
> resolution logic should be designed around. Where old Overture assumptions are leaking into the
> Google path — like `dataset_confidence` affecting whether we show the picker — remove or redesign
> those assumptions based on the actual evidence we have.

That turned the previous session's open measurement from *"re-fit a weight"* into *"find the Overture
assumptions in the score and take them out"*. There were two, and neither survived contact with the
evidence.

## 2. What landed, and the measurement behind it

Full evidence: [`docs/evidence/places/resolution-confidence-2026-08-28.md`](../evidence/places/resolution-confidence-2026-08-28.md).

### 2.1 The score is now the name score

`SCORING.total` goes `{ name: 0.80, category: 0.10, datasetConfidence: 0.10 }` →
`{ name: 1, category: 0, datasetConfidence: 0 }`. The score is `nameScore`, corroborated or
contradicted by the address term when both sides have an address. The two zeros are kept as named
parameters, not deleted, so re-admitting either is a diff to one file plus a re-measurement.

**`datasetConfidence`.** On Overture it is a crawler's confidence that a POI exists at all, and it was
vetoing correct matches — `Kohi Coffee Shop` at 0.295, `Gelalucci` at 0.34, both the right venue with
an exact address. On Google the adapter supplies a constant 0.5, and the measurement that settles it
is this: **dropping the term and renormalising changes the Google auto-accept count by zero** (6/16
either way). A constant cannot rank anything; it was costing a flat 0.05 against the gate and buying
nothing.

**`categoryScore`.** This is what was putting the picker in front of the user for venues we had
already identified exactly. It is one bit from a **three-valued** hint against a provider taxonomy of
~100 (Google) or ~200 (Overture) values. Five corpus candidates match Google's answer on the *whole
name, exactly* and were held at `confirm` purely because Google files them under a type our three
words do not cover: קפה אירופה and Palette Bistro (`restaurant`), Gelalucci (`ice_cream_shop`),
דיזנגוף 99 (`bar`), WOW (`store`). It keeps the only job it was justified for — breaking a tie, via
`rankPlaces`'s comparator — and no longer prices a decision.

| | 44 golden (Overture) | 16 real candidates (Google) |
|---|---|---|
| before | 29 preselect, 0 false | 6 preselect, 0 false |
| after | **31** preselect, 0 false | **11** preselect, 0 false |

The `handoff-…-categories-and-the-picker.md` §3.1 specimen — קוהי vs NIKO at בן יהודה 155 — now
auto-accepts at 0.946 against 0.587. The test that used to pin it at `confirm` asked that any change
turning it into an auto-accept say so out loud; it now says so.

### 2.2 Two corrections to the record, both of the same shape

**`band-policy.md` §3 was refuted by a stale label.** It concluded that a decisive-margin band rule
produces a false auto-accept on TLV-14, reporting the top-1 as `Hostel 51`. Under the shipped weights
TLV-14's top-1 is `Bar 51` — the venue the case asks for — and it already was when that section was
written; `benchmark-golden.test.ts`'s own `REFIT_CASE_MOVES` recorded the change. What §3 read was
`adjudication.json`'s 2026-07 `MISS_RANK`. A correction banner is now on that file, and
`benchmark-golden.test.ts` carries a **`STALE_VERDICTS`** register so a disagreement between the
recorded adjudication and the current ranking has to be written down one case at a time.

**The symmetrical trap caught me.** A mechanical re-adjudication on `expected_name` marks TYO-10's new
top-1 correct, because every branch of a chain shares the name. It is `expected_area` that says which
one. **A benchmark whose cases are branches cannot be adjudicated on names.**

### 2.3 The gate that actually protects us is not the one the docs credit

`06` §6.3 credits the **0.92 score gate** with catching all three no-name captions. Re-measured with
the category term as a bonus, NEG-01 scores **0.958** and NEG-02 **0.944** — both over that gate. What
keeps them out of `preselect` is their **margins: 0.005 and 0.008**, against a 0.05 gate. A caption
naming no venue matches a hundred rows equally badly, and that is what it looks like. Under the
shipped weights all three are under both gates, but the margin is the one that holds structurally, and
`benchmark-golden.test.ts` now asserts it directly.

### 2.4 Everything else that shipped

| commit | what |
|---|---|
| `7d96489` | Google Text Search replays from disk. One corpus run spends 16 of a 100/day quota; band work needs to replay the *same* provider answers against a changed policy repeatedly. Cached at the gateway, so scoring stays live. |
| `9820382` | **One area, one name.** `places.locality` held six renderings of one city across twelve rows. Reuses the clustering + plurality that already names the sheet header; provider strings stay in the column. Verified in the app at both breakpoints. |
| `47b66d1` | **The card is titled with what the save writes.** It was titled `identifiedName ?? rawName` while `derivePlaceSave` writes the provider's name — the user confirmed `קוהי` and got `Kohi בית קפה יפני`. Found by `ux-interaction` while reading for its spec. |
| `c3d8e42` | **The category is user-editable.** `category_override` has been in the schema since `0019` and `productCategoryFor` has ranked it first since day one — nothing ever wrote it. `Automatic` writes SQL NULL, not a frozen derivation. |
| `1da49ed` | **The open place stays in sync with the server.** The page held the selected `MapPlace` *object*, so the detail panel was a snapshot: changing a category updated the row to `Bar` while the panel the change was made in went on saying `Dessert`. Now holds the id and resolves against `matches`. |
| `70421d0`, `66d5ec1`, `b1894df` | **`place_lookups` is finally wired up** — see §3. |
| `72d5240` | `docs/ux-when-we-ask.md` — see §5. |

## 3. The resolved-place cache — the owner's second question, answered

> Consider whether we should have a lightweight internal index/cache of places we have already
> successfully resolved… first check what persistence/indexing we already have.

**Both halves were already in the schema and one was never wired up.** `place_lookups` has existed
since `0007`, designed for exactly this, deny-all RLS, `service_role` granted in `0012` — and it held
zero rows because nothing in `src/` referenced it. `place_provider_refs (provider, provider_place_id)`
UNIQUE is already the canonical Google Place ID home.

`supabase-database` ruled: **build the provider-response cache, defer the alias index.** The count is
why — **0 of 16 corpus lookups reach a venue by a second, different candidate string**, and the one
venue repeating across three TikToks repeats as the identical string, which the cache already
collapses. And the *consistency* problem the alias index was proposed for is already enforced: the
duplicate rows in the previous handoff's §5 were all `llm_guess`, whose "provider id" differs every
run; once a real provider answers, both spellings return one place id and the UNIQUE constraint
collapses them.

Two things worth knowing:

- **It caches below the ranker**, between `gateway.searchText` and `scoreCandidates`, so what is
  stored is the provider's raw rows. Caching the ranked `ResolveResult` would mean every scoring
  change silently serves stale rankings — and the category weight going to zero this session is the
  concrete version of that.
- **The TTL is a legal boundary in the database, not a constant in TypeScript.** `place_lookup_put`
  raises `check_violation` for a `google` row with a null or over-30-day TTL (SST §5.4, VERIFIED in
  `06` §3.1). Adapter TTL is 28 days.

Hit rate, counted not estimated: **2/16 within one run, 16/16 on a second run.**

## 4. The branch guard — what made §2.1 safe, and what it cost

### 4.1 The false auto-accept the weighting change created

`dataset-confidence-weighting-2026-08-28.md` (the previous session's `maps-geospatial` output, which
landed on disk after that session ended) found — and I confirmed against the data — that removing the
terms makes **TYO-10 a false auto-accept**. Query `むぎとオリーブ`, five prefiltered rows:

| row | coordinates | nameScore |
|---|---|---|
| むぎとオリーブ 銀座本店 | 35.669, 139.764 — Ginza, the venue the case asks for | 0.926 |
| むぎとオリーブ 銀座店 | 35.635, 139.614 | 0.931 |
| むぎとオリーブ 日本橋店 | 35.687, 139.775 | 0.926 |
| **むぎとオリーブ** | 35.697, 139.770 — 3.2 km from Ginza | **1.000** |
| むろと | 35.606, 139.732 | 0.863 |

**The honest reading was never that the terms should go back.** Under the old weights the case was
safe only because the confidence term compressed a gap it knew nothing about — a right answer for no
reason. The real gap: **nothing in the scorer told "same venue, different branch" from "different
venue, similar name"**.

### 4.2 What shipped, and the number that decided the threshold

`preselect` is withheld when a rival is (1) within **0.12** of the top score, (2) in a
normalised-**token** containment relation with it whose differentiating tokens are not already in the
query, and (3) further apart than `samePlaceMetres`.

The arithmetic that motivates it: measured across the six branch families in the 44 cases, the gap
between a bare venue name and its branch row is 0.031–0.095, and **every one of those numbers measures
how long the branch suffix is.** None measures which branch the caption meant. The margin gate was
reading a name-length artefact as confidence.

| configuration | preselect / confirm / no_match | false auto-accepts |
|---|---|---|
| RESOLVE-CONF-1, no guard | 31 / 10 / 3 | **1 — TYO-10** |
| band ≤ 0.07 | 30 / 11 / 3 | 0 |
| **band ≤ 0.12 (shipped)** | **24 / 17 / 3** | **0** |
| band ≤ 0.18+ | 23 / 18 / 3 | 0 |

**0.12 rather than the cheapest passing 0.07**, and the reason is a threshold-fitting argument worth
keeping: 0.07 sits **0.0025** under TYO-02's identical situation, while 0.12 sits in an empty corridor
from 0.0966 to 0.1760. The cheap one is fitted to a single case.

**Distance is inert** across that whole table — identical at 75 m, 150 m, 250 m, 500 m and 1 200 m. So
it ships at **75 m**, the radius `resolve_place` already treats as one place, and
`placeProximity(a, b)` is exported once so the collapse rule in `ux-when-we-ask.md` §4 uses the same
geometry rather than a second copy.

### 4.3 The cost, stated plainly

**Seven correct auto-accepts to remove one false one**: TYO-02, TYO-04, TYO-14, LDN-02, LDN-07,
LDN-12 all move `preselect → confirm`, top-1 unchanged. All seven are the same class — a bare chain
name with a branch inside 0.10 of it and kilometres away — and blocking them is arguably the product
being correct rather than a regression: the user watched the video and knows which Padella.

Net on the 44 golden cases the auto-accept count goes **31 → 24**, which is below today's 29. **On
Google — the direction the product is actually going — the guard fires on nothing, and that corpus
cannot say whether that is right**: 14 of the 16 candidates have `candidatesPrefiltered: 1`, so the
guard is structurally incapable of firing, and the run record stores no coordinates for runner-ups.
**Any future Google-side evidence for this guard needs the harness to record rival lat/lng.** That is
the highest-value next measurement on this track.

### 4.4 A contradicted address now asks instead of discarding

Two of sixteen corpus candidates were correct venues thrown away:

| candidate | caption address | Google top-1 | band before |
|---|---|---|---|
| `טרטוריה אונה` | `איינשטיין 69` | `Trattoria Una @ בארט 2` | `no_match` |
| `רוסטיקו` | `בזל 42` | `רוסטיקו רוטשילד @ שדרות רוטשילד 15` | `no_match` |

`no_match` means the shortlist is never offered, so `derivePlaceSave` falls back to `llm_guess` and
pins the **model's** coordinate — measured 65–470 m out. We threw away a provider row we had and
guessed instead. Re-measured under the new weights the arithmetic is starker than my original note:
with `addressScore === 0` the score is `0.8 × base`, so `confirm` required a *mathematically perfect*
name.

Shipped as a **band floor, not a score change**: the band is floored at `confirm` when
`addressScore === 0` and `base ≥ confirmScore`. Ranking a contradicted row down is right; refusing to
offer it is not. No new constant. This also makes `ux-when-we-ask.md` §3.1's `address_conflict` — its
highest-precedence reason to ask — reachable, which it was not before.

### 4.5 Known misses, recorded rather than papered over

- **Sibling branches** (`X 銀座店` vs `X 日本橋店`) do not trigger the guard: neither name contains the
  other. Documented in `branchRival`, not attempted.
- **The caption-settles rule is unexercised** inside the band — the only settled pair in the corpus
  sits at Δ 0.1715, outside 0.12. It is asserted by a unit test, not measured.
- Four alternatives were tried and refused by the data (rival-must-clear-preselect, ≥2 rivals,
  substring rather than token containment, band 0.07); all are in
  `docs/evidence/places/branch-guard-2026-08-28.md` §6 so nobody re-proposes them.

### 4.6 Everything landed; the tree is clean

Both agents were asked to bring their work to a clean stopping point, and both did. At session close
`npx vitest run tests/unit` is **1166 passed / 63 files**, `npx tsc --noEmit` is clean, and nothing of
this session's work is uncommitted. The scratch measurement harnesses were deleted; their numbers live
in the evidence files.

**Not done, and the next things on this track, in order:**

1. **Nothing here has been through a live import.** The scoring change, the guard and the address
   floor are pure-domain work verified against evidence-file replays, and no agent ran the app. A live
   re-run of `tests/manual/tiktok-recognition.manual.ts` under the new weights costs 16 Google requests
   (then zero, thanks to the disk cache) plus LLM calls, and it is the first thing to spend quota on.
2. **Record rival lat/lng in the recognition harness.** The guard cannot be evidenced on the Google
   path at all until the run record stores coordinates for runner-ups (§4.3).
3. **Build the review screen against `ux-when-we-ask.md`** (§5). The scoring side now produces the
   states it needs, including `address_conflict`, which was unreachable before §4.4.
4. **No PR has been opened for this branch.**

## 5. The product half of the ruling — specified, not built

[`docs/ux-when-we-ask.md`](../ux-when-we-ask.md), by `ux-interaction`. Built on one rule: **ask only when
the answer changes what we save.** Three consequences, each deleting something currently on screen —
an auto-accepted candidate renders no list at all (a list *is* a question); two rows describing one
place are one row; and when we do ask, the rows must differ in the thing being asked about, which for
branches is the street, not the name they share.

Four reasons with a precedence order — `address_conflict`, `branch`, `rival`, `weak_name` — replacing
the fixed string **"The caption doesn't say which"**, which was rendered for a caption that named both
the venue and its street number.

**The coordination point that matters.** Its §4 collapse rule (within **75 m** AND one normalised name
contains the other → one place, never ask) is the *same geometry* as the branch guard, with the
opposite sign, split on distance:

| | same spot (≤75 m) | far apart |
|---|---|---|
| same name | one place — collapse, never ask | branches — ask, the address is the answer |
| different name | rivals — ask, the name is the answer | rank decides |

Both must come from **one** exported predicate. If the guard's measurement lands on a distance other
than 75 m, that divergence is a fact to record, not to average away.

It needs three new signals, and only one is a field: `Confidence.reason`, the collapse function, and
splitting `optionDetail` into `street` and `area`. Everything else is computable from what is stored.

**One owner decision it names:** when a user answers `None of these` on a candidate the model placed,
do we save the model's pin or nothing? Its recommendation, and mine: nothing.

## 6. Track 1 — the extraction miss was never the model

The corpus's single `extraction_miss` was `בראסרי 18`. I reproduced it by hand (same caption, three
runs, only a trailing space differing: `[]` once, the correct candidate twice) and concluded
non-determinism, then handed it to `ai-extraction` to find out how systemic that is.

**It found something better than a retry: the model was right every time and we were deleting its
answer.** In 6 of 6 probe runs the model produced `בראסרי 18` with the right street and house number.
`filterPlausible`'s `evidence_not_in_caption` gate dropped it, because the caption reads
`…עבר מרמת אביב␣␣ללב העיר…` and the model quoted it with **one** space — byte-diffed, that space is
the only difference across 93 characters. A second case was an elided quote: two real fragments the
model joined with an ellipsis it added.

Fixed in `6ead6c7`: whitespace collapses on both sides, and an elision splits into segments that must
each be ≥12 characters and appear in order and non-overlapping. Case, accents, punctuation and emoji
stay significant, deliberately short of `normalise()` — the point of the gate is that the model
*quoted* the caption, not that it wrote something similar. Verified by replaying every captured raw
response: 3 rescued, 0 still dropped, 0 previously-passing quotes changed. After it the measured empty
rate is **0/79**.

**It also refused my retry-on-empty, on evidence, and it was right.** The simulation says it works
(4/4 rescued over 260 ordered run-pairs), but it routes around a bug that has a deterministic fix at
zero cost; and per `CLAUDE.md` "no places found" is the *modal* outcome, so "only on the empty path"
is the expensive path — approaching **+73% call volume** against a hard 500/day cap, spent on the one
case where a false positive is worst. A cheap pre-check was refuted too: `emptyIsSuspicious` fires on
**13 of 13** captions, i.e. it is a constant.

### 6.1 The number worth carrying forward

Full measurement: [`docs/evidence/extraction/determinism-2026-08-28.md`](../evidence/extraction/determinism-2026-08-28.md).
79 samples, 90 Gemini calls, now replayable from disk at zero cost.

**The model's coordinate for the same venue from the same caption moves a median 327 m between calls**
— p90 647 m, max 1007 m, 1 of 16 at exactly zero. `resolve_place`'s merge radius is **75 m**. The
guess moves 4.4× the radius between two calls.

That is the measured cause of the phantom duplicates in the previous handoff's §5, and it settles the
question that handoff left open: **the duplicate class cannot be fixed by widening the radius**,
because covering the median would need ~400 m and would start merging distinct venues on one block.
The fix is a resolver returning a provider id at all — which is the direction the product is already
going, and which `place_provider_refs`'s UNIQUE constraint already enforces once a real provider
answers (§3).

Candidate sets are identical across 5 runs for 10 of 13 captions. `tags` is stable 18/18 and
`evidence` 17/18; `dishes` (8/18) and `modelConfidence` (11/18) are **not** identity and must never be
treated as such. Every `addressHint` instability is the same trailing `, תל אביב` — street and number
never moved.

### 6.2 What that measurement could not do, and it is the next thing to buy

**The false-positive side is unmeasured.** All 13 corpus captions name a real venue, so there is no
caption for which `[]` is the correct answer, and none of these numbers says anything about the model
inventing a place. A **negative-control corpus of 8–10 real captions that name no venue** is the
highest-value missing thing on this track, and it costs URLs to collect, not API calls.

Relatedly: `evidence_not_in_caption` has now fired four times in this corpus and was **wrong all
four**. Keeping the gate is defensible — it is the only thing between a fabricated venue and the
library — but there is no measured case of it catching a fabrication, and this corpus cannot produce
one.

### 6.3 One defect found and deliberately not fixed

`filterPlausible`'s `duplicate` rule keys on `rawName` alone and ignores `addressHint`. The רוסטיקו
caption names **two branches** (בזל 42 and רוטשילד 15), the model correctly emitted both in 3 of 13
runs, and the second was silently dropped. Recorded in the evidence file's §2.2; small,
self-contained, and a good first task next session.

## 7. Practicalities

```bash
npm run verify                 # lint + typecheck + layers + migrations + schema + agents + unit
gh pr checks <n>               # CI is the authority; verify covers 1 of 4 jobs
npm run merge:pr -- <n>        # the only way to merge
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

- **Google Places quota is exhausted for today** (HTTP 429, `RESOURCE_EXHAUSTED`, 100/day). Raising it
  is still an owner console/billing action and still the ship blocker. The disk cache (`7d96489`) means
  the next corpus run costs 16 requests and every run after that costs zero.
- **Migration `0023` is applied to the local container only.** It needs applying to staging and
  production — that is the lead's call, not an agent's. Note the local `supabase_migrations` ledger
  stops at `0020` while `0021`–`0023` are applied to the local schema, so `supabase migration up` is
  **not** a safe way to apply it.
- `npm run lint` reports 3 errors inside `.claude/worktrees/agent-a80e91ca52011df88/`, a leftover agent
  worktree. It is git-excluded so CI never sees it; delete the directory or add it to the eslint
  ignores.
- A **second session was committing to this branch** throughout. Check `git log` before assuming a
  commit is yours.
- Dev sign-in `demo@example.com` / `local-dev-preview-1234`. Another session's dev server was already
  holding port 3000, so `preview_start {name: "nextjs-dev"}` fails; open `http://localhost:3000`
  directly with `preview_start {url}` instead. `computer` clicks still time out on the map page
  (MapLibre never idles) — drive it with `javascript_tool` and read back with `read_page`.

## 8. Specialists used this session

Per `working-agreement.md` §1.3, and note the owner ruled mid-session to **use sub-agents proactively
wherever work genuinely parallelises**, which is why there are four.

- **`ux-interaction`** — `docs/ux-when-we-ask.md` (spec only, no code). It also found the card
  title/save mismatch that became `47b66d1`; I verified that independently before fixing it.
- **`supabase-database`** — the `place_lookups` cache (§3). Wrote code, verified against the local
  container including two failure-first policy checks. I agreed with its ruling against the alias
  index; the counts convinced me.
- **`maps-geospatial`** — the branch guard and the address floor (§4). Wrote code and measured both
  against the golden 44; the threshold argument for 0.12 over the cheaper 0.07 is its own, and it is
  the better argument. It also refused four alternatives on the data and wrote them down.
- **`ai-extraction`** — extraction determinism (§6). Wrote code and measured. **It refused the
  retry-on-empty I proposed and was right to**; and its actual finding — that the miss was our own
  gate rather than the model — is better than the thing it was asked to build.
- The previous session's `maps-geospatial` output (`dataset-confidence-weighting-2026-08-28.md`)
  landed on disk after that session ended. **Its TYO-10 finding is correct and I had missed it** — my
  own mechanical adjudication was blind to the branch case. It is committed with the evidence, and it
  is the reason §2.1 does not ship alone.

The weighting change, the area label, the title fix, the category editor, the selection fix, the
harness cache and every commit were written or integrated and verified by me. The owner ruled
mid-session that sub-agents should be used proactively wherever work genuinely parallelises; four ran
concurrently on non-overlapping paths, which is why this session covers three tracks instead of one.
