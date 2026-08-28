# Handoff — Google Places is the primary resolver (cold-start document)

**Status: everything below is merged to `main` and verified there.** `main` is green:
**1068 tests, 59 files**, `npm run verify` clean, working tree clean.

Written so a completely fresh session can continue without reading any chat transcript. If you read
only one section, read **§7 (blocked / owner input)** and **§10 (next tasks)**.

---

## 1. The ruling this session executed

Owner ruling, **2026-08-28** (overnight session):

1. **Google Places is the active direction for place resolution/data.** Move the database/index
   resolver **out of the primary path but preserve it** — do not delete.
2. **Do NOT switch the map renderer yet.** Google Maps is the *next thing to prototype*, so the
   owner can experience both and then choose. Avoid investment that makes that comparison harder.
3. Keep it lean, verify on real TikToks, desktop and mobile.
4. Then keep exploring: multi-place extraction, TikTok photo/carousel links, free OCR, free
   transcription, other product/UX improvements.

The evidence the owner ruled on is
[`evidence/places/google-places-and-transcription-probe-2026-08-28.md`](evidence/places/google-places-and-transcription-probe-2026-08-28.md).

---

## 2. What was completed and merged

All merged through `npm run merge:pr` with CI green; `main` verified after each.

| PR | What |
|---|---|
| [#55](https://github.com/LiorJossef/P-002/pull/55) | Google Places provider behind the existing `PlaceResolver` port; language follows the caption's script; `SoleCandidateMeaning` band policy; the provenance bug fix (§5) |
| [#56](https://github.com/LiorJossef/P-002/pull/56) | 5 s per-lookup timeout; the 100/day quota recorded in the adapter header |
| [#57](https://github.com/LiorJossef/P-002/pull/57) | TikTok photo/carousel posts supported; `PHOTO_POST` retired (14 error codes → 13) |
| [#58](https://github.com/LiorJossef/P-002/pull/58) | Cover-frame OCR measured and rejected as framed; exploration findings |
| [#59](https://github.com/LiorJossef/P-002/pull/59) | The location caveat is shown only when it is true |
| [#60](https://github.com/LiorJossef/P-002/pull/60) | This handoff |

`main` HEAD at the end of the session: `c4758cb` (merge of #60).

---

## 3. The measurement that matters

Same 13 real owner-supplied TikToks, same oEmbed → caption → extraction → resolve path, same
scorer, one run per provider. Records:
[`evidence/places/tiktok-recognition.md`](evidence/places/tiktok-recognition.md) (Overture) and
[`evidence/places/tiktok-recognition.google.md`](evidence/places/tiktok-recognition.google.md).

|                    | Overture `poi_index` | **Google Places** |
|--------------------|----------------------|-------------------|
| Correct top-1      | 12 / 15              | **15 / 15**       |
| Wrong              | 3                    | **0**             |
| Auto-match         | **7 / 16 (44%)**     | 6 / 16 (38%)      |
| False auto-accepts | 0                    | 0                 |

**Google is more accurate and slightly less decisive.** Its three wins are exactly the coverage
failures Overture cannot fix by scoring: `Oscar's` resolves to the previous tenant at that address,
`בל עמי` is absent from the index, `דיזנגוף 99` is wrong. Its nine non-auto-accepted answers are all
*correct* — the user confirms a picker with one right option in it. Worse feel than 44%, never a
wrong pin.

**Honest limits, because this number will be quoted:** n = 15 adjudicated candidates, one city,
13 URLs against the owner's brief of 20–30, and `bars_and_wine_bars` has no URL at all. **A pilot,
not a result.**

### How to re-run it

```bash
set -a; source .env.local; set +a
PLACE_RESOLVER=google npx vitest run tests/manual/tiktok-recognition.manual.ts --config tests/manual/vitest.manual.config.ts
```

`PLACE_RESOLVER=overture` re-measures the baseline. Output is **provider-scoped** so neither run
overwrites the other: `tiktok-recognition-run.json` / `.md` for Overture (unsuffixed — every
existing doc cites those names), `tiktok-recognition-run.google.json` / `tiktok-recognition.google.md`
for Google. Requires local Supabase up (`npx supabase status`) with the `tlv` region loaded — the
per-miss `poi_index` probe is what tells "Google found it and we never had it" apart from "we had it
and could not reach it".

**Each full run costs ~16 Google Text Search calls. The daily quota is 100 (§7).**

---

## 4. Architectural decisions, and why

### 4.1 The Google adapter does not rank

`src/integrations/google/place-resolver.ts` maps Text Search results to `ResolvedPlace` and hands
them to `scoreCandidates` — the **same** scorer `src/integrations/supabase/place-resolver.ts` uses.

Why: one ranker in the system, so a scoring change cannot mean two different things depending on who
answered; and the two providers' numbers stay **directly comparable**, which keeps the provider
choice re-decidable instead of a one-way door. Google's own relevance order is deliberately *not*
carried through as a score — it is not on our 0..1 scale and `places.resolution_score`'s CHECK is.

### 4.2 `datasetConfidence` is a fixed 0.5 for Google

Google publishes no per-result confidence. `scorePlace` weights the term at 0.10, so a fabricated
number would move real answers. 0.5 is the schema's neutral default. Being constant within a
response it cannot change *ranking*, only where the absolute score sits against the band gates.

**Known consequence, measured:** a perfect name (`nameScore` 1.000) tops out at
`0.8·1 + 0.1·categoryScore + 0.05`. With a category disagreement that is **0.850**, which cannot
reach the 0.92 preselect gate. See §10.2 — this is the clearest remaining scoring gap.

### 4.3 No migration was needed for a `'google'` provider

`place_provider_refs.provider` carries a **pattern** CHECK (`^[a-z][a-z0-9_]{1,31}$`, migrations
`0005`/`0007`), not an enum. `06` §3.3 predicted "a small migration"; it cost less than that.
Widening `PlaceProvider` / `SourceDataset` in `src/domain/types.ts` was a TypeScript-only change.

### 4.4 Region semantics differ on purpose

`regionsSearched: []` means *"we have not loaded that city"* (`regionLoaded()`, `06` §7.3). Google is
global — a miss is a genuine not-found. So the Google adapter reports `GLOBAL_REGION` (`'global'`)
and **never** an empty array, and `ResolvedPlace.regionId` is `null`. Returning `[]` would make every
Google miss render as "we don't have that city yet", which would be a lie.

### 4.5 Language follows the caption's script

`languageCodeFor()` asks Google for `he` when the candidate name or city hint contains Hebrew, and
omits the field otherwise. Not cosmetic: unset, Google answered `האחים` with
`Haachim @ Shlomo Ibn Gabirol Street 26` — the right venue, transliterated. Our users are Hebrew
speakers, **and** `addressScore` returns `null` across writing systems by design, so a Latin address
silently discarded the corroboration the address hint exists to provide. **Correct answers went
9 → 13 on this change alone.**

### 4.6 `SoleCandidateMeaning` — and why it does NOT contradict `band-policy.md`

`domain/places/score.ts` now takes `SoleCandidateMeaning`, `'narrow-filter'` (default) or
`'exhaustive-search'` (Google only).

Google returns exactly one result for 14 of 16 corpus candidates, so `margin` is null, so every
answer capped at `confirm` and auto-accept was **structurally 0%** while 15/15 were right. `10` §12
Q3's rule ("unmeasured margin is not perfect margin") is right for a token/trigram *prefilter*,
where one row means our cheap filter matched one thing. It is wrong for a global text search, where
one result means the index holds one place under that name near that city.

**Read this before touching bands again.**
[`evidence/places/band-policy.md`](evidence/places/band-policy.md) records a band change that was
**tried and refuted** — a second path into `preselect` at `score ≥ 0.85 && margin ≥ 0.05`, which
produced a false auto-accept on golden case `TLV-14` (`Bar 51` → `Hostel 51`, score 0.9000, margin
0.0952).

**That is a different change from this one and they do not collide.** `SoleCandidateMeaning` waives
**only** the unmeasurable-margin block and leaves `preselectScore` at 0.92, so TLV-14 (0.9000, with
a *measured* margin) still fails the score gate and is still rejected. A margin that exists must
always clear its own gate; the provider's answer decides only what an *absent* margin means.

### 4.7 The production gate lives in code, not prose

`src/integrations/places/place-resolver-factory.ts`. See §8.

---

## 5. Bugs found, root causes, fixes

### 5.1 A resolved place was saved as `llm-guess` (the important one)

**All 1054 tests were green while this was broken.** Found only by importing a real TikTok in the
browser and reading the row back in psql.

Symptom: `Oscar's` resolved correctly, the review screen showed `Oscar's @ נחלת בנימין 68`, and
`places` got `source_dataset='llm-guess'`, `resolution_score=NULL`, at the model's own coordinate.
No error anywhere.

Two independent, silent causes:

1. `src/domain/import/resolution-record.ts` — `StoredResolvedPlaceSchema` listed three providers and
   `'google'` was not among them. The stored resolution failed to parse on confirm,
   `chooseResolvedPlace` saw `null`, and the save fell through to the model-guess path. **An
   unparseable resolution is indistinguishable from no resolution.**
2. `src/domain/import/candidate-place.ts` — `derivePlaceSave` hardcoded `provider: 'overture'` for
   *any* resolved place. Correct while Overture was the only resolver; a provenance lie the moment a
   second one existed. It would have filed a Google coordinate under Overture's licence, which is
   exactly what `source_dataset` exists to prevent (`06` §11 Q2).

Fixed, and pinned by `tests/unit/import/candidate-place-provenance.test.ts`.
**If you add a fourth provider, that schema union is the thing that will silently bite you.**

### 5.2 A 47-second spinner on provider failure

With the Google quota exhausted, a 5-candidate import sat on a spinner for 47 s before degrading.
`resolveCandidates` is sequential and `MAX_CANDIDATES` is 7, so a provider with no ceiling bounds the
whole import at "however long seven hung requests take". Fixed with `GOOGLE_TIMEOUT_MS = 5_000`,
composed with the caller's signal via `AbortSignal.any` so an aborted import still aborts at once.

### 5.3 Photo-post share links died as `SHORT_LINK_UNRESOLVED`

`src/integrations/tiktok/resolve-short-link.ts`'s id pattern matched only `video`, so a redirect to
`/@handle/photo/<id>` was followed correctly and the id simply went unrecognised. Only surfaced by
running the owner's real link in the app.

### 5.4 The location caveat was unconditional

`LOCATION_CAVEAT` ("pins can be a street or two off") rendered on every review screen, on the stated
grounds that "our honest position is identical on every candidate". Untrue once resolution shipped:
a resolved pin is the venue's own coordinate (11 m for HaKosem) against 65–470 m for the model's
guess. `usesModelCoordinate()` in `src/ui/import/candidate-resolution-view.ts` now gates it.

### 5.5 Open defect, NOT fixed — the corpus never checks distance

`Gelalucci`'s `poi_index` row carries address `שדרות מסריק 1` and coordinates
`(32.02421, 34.74155)` — **6.9 km from Masaryk Square**, where that address is. The harness scores
it **correct**, because adjudication matches name and address *strings* and never distance. A milder
case: `האחים` at אבן גבירול 26 is 232 m from the same address geocoded independently.

A task chip was raised for this. On a map product, name-correct/coordinate-wrong must not pass.

---

## 6. Real-world findings

### 6.1 TikTok photo / carousel posts are supported (VERIFIED, closes `04` §5 category L)

Specimen supplied by the owner: `https://vt.tiktok.com/ZSVsx7UeX/`.

| Request | Result |
|---|---|
| `vt.tiktok.com/ZSVsx7UeX/` | 301 → `https://www.tiktok.com/@evesela/photo/7665396684981095688` |
| oEmbed on `…/@evesela/photo/<id>` | **HTTP 400** — the URL form is rejected |
| oEmbed on `…/video/<id>` (same id) | **HTTP 200**, `"type":"video"`, full caption, author, thumbnail |

Caption returned: `new cafe in Tel Aviv 📍Dopo Cafe, Tel Aviv …` — a named venue. **The URL form was
the only obstacle.** Photo posts are now canonicalised to the numeric id and re-issued as
`/video/<id>`, the same rewrite `/embed/` forms already get. Dedup key unchanged (the id alone).
`PHOTO_POST` retired. Verified end to end in the app: **"1 place found — Dopo Cafe"**.

### 6.2 Multi-place extraction already worked

One caption → **"5 places found"** in the running app, with honest per-candidate degradation
("2 of these have no location — they won't be saved"). No work was needed.

### 6.3 `thumbnail_url` expires

Every signed thumbnail URL cached in `evidence/tiktok/oembed-set1-raw.json` on 2026-08-18 now
**403s**. A cover frame must be read *during* the import; it cannot be stored and processed later.

---

## 7. Blocked — exactly what needs the owner

### 7.1 The Google Places quota is 100 requests/day — THIS IS THE SHIP BLOCKER

The Cloud project behind the current key carries `SearchTextRequestPerDayPerProject = 100`. One
night of measurement exhausted it (HTTP 429, `RESOURCE_EXHAUSTED`, `project_number:1058188956109`).

At 1–7 lookups per import that is roughly **15–100 imports per day across all users combined**. The
published free tier is 5 000 Text Search (Pro) calls/month, so this is a *project-level* quota, not
the product's real ceiling — but it is the ceiling that is live today.

**Raising it is an owner action** in the Cloud console, and probably a billing change. Until then the
Google provider is **measurable but not shippable**. Do not attempt to change quota or billing.

### 7.2 Media access for transcription

Licensed third-party providers (Apify / ScrapeCreators / Supadata, ~$0.004/item) are the only path
that supplies video or subtitles without us scraping. That is a **spend** decision and a
`security-privacy` decision, both the owner's.

### 7.3 A server-only Google key

The factory prefers `GOOGLE_PLACES_API_KEY` and falls back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
which is **compiled into the browser bundle** and therefore readable and spendable by anyone. Fine
for local work; **must be replaced with a restricted server-only key before any deploy.**

---

## 8. Risks, caveats, ToS, and the production gate

### 8.1 The gate

`06-map-and-places-decision.md` §3.1 is **VERIFIED**: Google Places content **may not be used in
conjunction with a non-Google map** (Service Specific Terms §5.3), and §5.4 caps lat/lng caching at
**30 days**. Our renderer is still MapLibre + Protomaps.

The owner's ruling makes Google primary *and* keeps the renderer, so it is reconciled as
**sequencing**, in `src/integrations/places/place-resolver-factory.ts`:

- Google is the default in `local`, `preview`, `staging`, `test`.
- **Production falls back to Overture.** An unset or unrecognised `NEXT_PUBLIC_STAGE` **counts as
  production** — failing safe costs a measurement, failing open costs a terms breach.
- `PLACE_RESOLVER=google|overture` overrides explicitly, for the day the renderer moves and for
  pinning a measurement run.

**When the Google Maps renderer prototype ships, that gate is what to delete. It has no other job.**

### 8.2 Coordinate storage

Only Google's `place_id` is exempt from §5.4 and safe to store indefinitely. **Coordinates from this
provider are cache, not record.** Nothing yet refreshes or expires them in `places`. Needed before
production; production is gated anyway.

### 8.3 Do not re-derive Google coordinates into committed evidence

The 30-day cache rule applies. Record names, addresses and verdicts; keep raw coordinates out of git.

---

## 9. Negative experiments — do not repeat

### 9.1 Cover-frame OCR does not carry the product

Full write-up: `evidence/places/google-places-and-transcription-probe-2026-08-28.md` §B2. Machine
record: `evidence/tiktok/cover-frame-ocr-run-2026-08-28.json`.

- **Recall 1 of 8.** Of the eight place-recommendation posts whose caption names no venue, the cover
  frame yielded one (`Pizza Lila`). The rest carry a hook line and no name — the cover exists to
  make you watch, so naming the place defeats it.
- **Precision is the real problem.** On `@exploringlondon` the model returned four venues —
  Sea Garden, Hacf Agaver Market, Rama Hair, Ersimes Organic. The OCR was **accurate, not
  hallucinated** (the frame was opened and read; those are real Brixton Village shopfronts). None of
  them is what the post is about. **A naive cover reader invents places the creator never
  recommended.**
- If revisited: the ask is "read the text the creator **added**" (overlay stickers), not "read the
  image". Any such candidate must arrive low-confidence and be droppable by `plausibility.ts`.

### 9.2 Google's `types` array does not fix the category term

Checked directly: `קפה אירופה` returns `['restaurant','food','point_of_interest','establishment']`
with **no `cafe`**. Reading `types` instead of `primaryType` would not help — it is a genuine
taxonomy disagreement, not a field we fail to read.

### 9.3 The extra-token penalty is NOT why answers do not auto-accept

A plausible-sounding hypothesis that the measurement killed: Google appends branch suffixes
(`רוסטיקו רוטשילד`), so the extra-token penalty looked like the culprit. Actual `nameScore`s:
`קפה אירופה` → `קפה אירופה` scores a **perfect 1.000** and still lands at 0.850. The cause is
§4.2 + the category term, not the penalty.

### 9.4 `score ≥ 0.85 && margin ≥ 0.05` as a second preselect path

Refuted before this session — `evidence/places/band-policy.md`, false auto-accept on `TLV-14`.
See §4.6 for why `SoleCandidateMeaning` is not the same change.

### 9.5 Scraping TikTok for media

`tiktok.com/robots.txt` has `Disallow: /` for `ClaudeBot`, `Claude-User`, `anthropic-ai`,
`Claude-SearchBot`, `GPTBot`, `CCBot` and every other named AI agent, and `/@user/video/…` is not in
the `Allow` list for `*`. `yt-dlp` **is installed on this machine** and was deliberately not run.
Do not run it. See §7.2 for the compliant path.

---

## 10. Next tasks, in priority order

### 10.1 Distance assertion in the corpus — **STARTED, PAUSED, on a branch. Read this first.**

**Branch `fix/corpus-distance-assertion` (pushed, no PR, DO NOT merge as-is).** Work was stopped
mid-task by the owner, deliberately, with a framing question attached:

> **Decide whether this is worth continuing as a general product/system improvement across the
> corpus, rather than as optimisation for individual places.** That decision comes first. Do not
> resume by drilling further into `Gelalucci` or any single venue.

That is the right question to answer before touching it again, and it is genuinely open. What the
branch proves is that **one** venue in a 16-expectation corpus has a source row whose address and
coordinates disagree. Whether that is a systemic data-quality problem worth building adjudication
machinery for, or a single bad Overture row worth a one-line note, is **not** established by n=1.
A cheap way to settle it before investing further: query `poi_index` directly for rows whose
`address_line` street disagrees with their coordinates at scale — that is a data audit, needs no
harness change, and would say whether this is one row or thousands.

#### What is on the branch and works

Measured on the Overture run (Google could not be re-run — quota, §7.1):

|                       | before | after |
|---|---|---|
| Auto-match            | 7/16   | 7/16  |
| Correct, not auto     | 5      | 4     |
| Wrong                 | 3      | 4     |

**Exactly one case reclassifies**, and it is the intended one:
`Gelalucci` — *"top-1 is the right venue by name and address but sits 6894 m from it (tolerance
500 m)"*. Nothing else moved, which is the point: the assertion is not a blunt instrument that
re-scores the corpus.

- `tests/manual/tiktok-recognition.manual.ts` — `expectedPoints` / `maxDistanceM` on the expectation
  schema, `distanceM` + `distanceToExpected` helpers, `DEFAULT_MAX_DISTANCE_M = 500`, and a new
  `coordinate_mismatch` failure bucket. Identity and location are now separate questions:
  `identityMatch && locationOk`. **A missing point is *unmeasured*, not a pass.**
- `tests/manual/tiktok-recognition-corpus.json` — 12 of 16 expectations carry ground-truth points.
- `docs/evidence/places/geocode-corpus-addresses.py` + `corpus-address-geocode.json` — how the
  ground truth was produced and its raw output.

#### Provenance rule that must not be broken

Ground truth is **OSM/Nominatim geocoding of the street address**, never the venue, and **never
Google** — `06` §3.1/§5.4 forbid committing Google coordinates. The four expectations without points
are the ones whose `area` is only a city name or whose address OSM does not hold; every geocode was
reviewed by hand and one that resolved to **Herzliya** plus three that landed on the Tel Aviv
centroid were dropped rather than kept with a loose tolerance. Corroboration worth knowing:
Nominatim and Google independently place מסריק 1 at (32.078032, 34.777851) to five decimals.

#### Known gaps on the branch

1. The markdown failure-bucket table iterates a fixed list that `coordinate_mismatch` was never
   added to, so the new bucket is **missing from `tiktok-recognition.md`** while present and correct
   in `tiktok-recognition-run.json`. Cosmetic, but it makes the human-readable record under-report.
2. The Google provider has **not** been re-run against the assertion (quota).
3. The `Gelalucci` row has **not** been traced to either bad Overture source data or our ingest
   (`docs/evidence/places/ingest-overture-city-extract.py`).

#### If the answer is "not worth it"

Close the branch rather than leaving it to rot, and keep §5.5 in this document as the recorded
defect. The geocode script and its output are useful independently and can be kept.

### 10.2 Renormalise the blend when a provider publishes no confidence

§4.2. A perfect name tops out at 0.850 on the Google path because `datasetConfidence` is a
fabricated 0.5 and the category term often disagrees. The principled fix is to **renormalise**
rather than feed a made-up number: `(0.8·name + 0.1·category) / 0.9` for a provider with no
confidence signal. Honest arithmetic, not tuning. **Deliberately not done in this session** — it
would have been a third scoring change in one night, on n=15, affecting auto-accept.

Measure before shipping: re-run both providers **and** the 44-case golden benchmark
(`tests/unit/places/benchmark-golden.test.ts`), and confirm no new false auto-accept — that is
exactly how `band-policy.md`'s idea died.

### 10.3 A disambiguation surface for multi-branch venues

`רוסטיקו`: the caption says בזל 42, Google returns the רוטשילד 15 branch, `addressScore` correctly
reads a different street as contradicting evidence, the row drops to `no_match`, and the product
falls back to the model's guess showing "Pin is approximate". The scoring is *right*; the outcome is
wrong. Overture auto-matched this venue and Google does not, so the primary path got worse on this
one case. The fix is showing both branches, not a weight.

### 10.4 Grow the corpus

13 URLs against the owner's brief of 20–30, and `bars_and_wine_bars` has none. Every number in §3 is
a pilot until this is done. Adding a URL only means appending to
`tests/manual/tiktok-recognition-corpus.json` — read its `_readme` first.

### 10.5 The Google Maps renderer prototype

The owner's stated next direction (§1.2). It is also what unlocks §8.1's gate. Not started.
**This is a large piece and a product decision about how far to take it — confirm scope first.**

---

## 11. Repo state that must not be disturbed

### 11.1 Stashes — four, all owner-owned

```
stash@{0}  gemini grounding attempt — blocked on 429 quota, deferred
stash@{1}  WIP: import/extraction work before remember-me branch
stash@{2}  google-maps-demo: vis.gl/react-google-maps demo surface (D2 stays MapLibre+CARTO)
stash@{3}  wip: cloudflare audio transcription (paused)
```

**Never run a bare `git stash push`/`pop` in this repo.** A `stash push <paths>` that fails on an
untracked path stashes nothing, and the follow-up `pop` then restores **stash@{0}, the owner's**.
That happened this session and was recovered only because it conflicted loudly. To move uncommitted
work between branches use `git checkout -b <new> <base>` (the working tree carries across).

`stash@{2}` is directly relevant to §10.5, and `stash@{3}` to §7.2 — **read them before starting
either from scratch.**

### 11.2 Branches and PRs

- **`fix/corpus-distance-assertion`** — this session's paused work-in-progress, **pushed with no
  PR, do not merge as-is**. §10.1 has the full state and the question to answer first.

- **PR #22** (`docs/tel-aviv-scope-narrowing`, open since 2026-08-24) is **pre-existing and not
  this session's**. Leave it alone unless the owner asks.
- Several unmerged remote branches predate this session (`feat/remember-me`,
  `feat/address-capture-maps-link`, `feat/tiktok-done-saves-to-map`, …). Not touched, not assessed.
- This session's six branches are all merged.

### 11.3 Uncommitted work is user-owned

Never reset, clean, or sweep it into a commit (`git-workflow.md`).

---

## 12. Working commands

```bash
npm run verify          # lint + typecheck + layer guard + migrations + schema + agents + unit
npm run test            # unit only — NOT the CI gate
npm run merge:pr -- <n> # the ONLY way to merge; GitHub branch protection is unavailable
gh pr checks <n>        # CI is the authority, not `npm run verify` (verify covers 1 of 4 jobs)
npx supabase status     # local DB must be up for the manual harness
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select name, source_dataset, lat, lng from places order by created_at desc limit 5;"
```

Local dev sign-in: `demo@example.com` / `local-dev-preview-1234` at `localhost:3000/sign-in`
(local Supabase only). Start the app through the Browser pane's `preview_start` with
`{name: "nextjs-dev"}`, never `npm run dev` in Bash.

**Landing anything:** branch → PR → **CI green** → `npm run merge:pr -- <n>` → verify `main`.
The script refuses a draft, a non-`main` base, any failing *or pending* check, an empty check list,
a non-mergeable PR, or a branch behind `main` (merge `main` in — never rebase/force-push).

---

## 13. Key file map

| Path | What |
|---|---|
| `src/integrations/google/place-resolver.ts` | The Google adapter. Header carries the quota + ToS notes |
| `src/integrations/places/place-resolver-factory.ts` | **The production gate.** Delete when the renderer moves |
| `src/integrations/supabase/place-resolver.ts` | The Overture adapter — preserved, still tested |
| `src/domain/places/score.ts` | The one ranker, shared. `SoleCandidateMeaning` lives here |
| `src/domain/places/scoring-constants.ts` | Weights and band thresholds |
| `src/domain/import/candidate-place.ts` | `derivePlaceSave` — provenance (§5.1) |
| `src/domain/import/resolution-record.ts` | `StoredResolvedPlaceSchema` — the silent-failure trap (§5.1) |
| `src/domain/source/canonicalise-tiktok-url.ts` | URL forms incl. `/photo/` |
| `src/integrations/tiktok/resolve-short-link.ts` | Redirect id extraction incl. `/photo/` |
| `src/ui/import/candidate-resolution-view.ts` | `willSave`, `usesModelCoordinate` |
| `tests/manual/tiktok-recognition.manual.ts` | **The harness of record for product accuracy** |
| `docs/06-map-and-places-decision.md` | D2/D2b, the ToS analysis (§3.1 is the gate) |
| `docs/evidence/places/band-policy.md` | The refuted band change — read before touching bands |
