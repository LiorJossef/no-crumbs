# Handoff — the overnight session, 2026-08-28

> Supersedes the *ordered next steps* of `handoff-2026-08-28-recognition-corpus.md`. That file's
> facts and its §7 environment traps are still good. Its §2 ("the single highest-value next step")
> **is done and measured**, and this file says what it bought and what it cost.

---

## 1. The number the owner asked to move

**Real-TikTok auto-match: 4/16 (25%) → ~43%. Zero false auto-accepts, throughout, on both harnesses.**

Measured twice on the real oEmbed → caption → extraction → resolve path:

| run | rate | false auto-accepts |
|---|---|---|
| cached extractions, model default sampling | **7/16 (44%)** | 0 |
| fresh extractions, `temperature: 0` | **6/14 (43%)** | 0 |

The denominator moves because extraction itself improved: `p7` emitted `מסעדת רוסטיקו` **and**
`רוסטיקו` as two candidates for one venue; `p8` emits one clean `רוסטיקו`. The **rate** is the
comparable figure and it is stable at ~43% across both runs.

| bucket | before | after |
|---|---|---|
| `unreachable_in_index` | 4 | **1** |
| `ranking` | 2 | **0** |
| `absent_from_index` | 2 | 1 |
| `extraction_miss` | 1 | 1 |
| `not_auto_accepted` | 3 | 5 |

The bilingual class is **closed**. The only `unreachable` case left is `Oscar's`, which is
genuinely not in the index (a new opening; the index holds `פונדק השובבים` at that address).

### Honest limits on that number

Every corpus case is a **single sample**, so at 14–16 cases the rate carries roughly ±1 case of
noise in either direction. The *variant quality* is stable across every sample taken; the rate is
softer than one decimal place suggests. The corpus is also still **13 URLs against the owner's
brief of 20–30**, and `bars_and_wine_bars` still has none. The harness prints that caveat on
every run and it should keep doing so.

## 2. What shipped

The caption says `קוהי`; the index holds `Kohi Coffee Shop`. We were only ever asking in one
script. The extractor now emits the same venue's name in the other script (`nameVariants`, capped
at 3, provenance class `world_knowledge`) and the resolver retrieves and scores across all forms,
taking the best. Ties go to the original text, so the no-variant path is byte-identical and the
synthetic benchmark stays 11/15 to the digit.

Half the cases are **translation**, not transliteration — `מתחת לעץ` → `Under the Tree` is what
that venue actually trades under. That is why it is the model's job; the deterministic
transliterator measured on 2026-08-27 got 47% recall and failed on exactly that class.

**The POI index remains the source of truth.** A variant is a search hint only: it never becomes a
place's name, coordinates, address, provenance or dedup identity — those all come from the matched
`poi_index` row. A wrong variant costs a failed lookup, not a bad save. It is deliberately **not**
the `nameAliases` field the owner cut from v2, which was an *identity* claim.

**No migration was needed.** `poi_prefilter`'s name arms are per-token disjunctions, so one call
with the union of the forms' tokens returns exactly the union of what each form would return
alone — equal, not approximate. Round trips per candidate stay at 1.

## 3. Three bugs found on the way, all of which would have reached production

1. **`stored-candidates.ts` — a 500 on the confirm screen.** Adding a required `nameVariants`
   made every row already in `extractions` unparseable. The probe path was safe (`PROMPT_VERSION`
   moved, so it misses cache and re-extracts); **confirm** looks a row up by an id the client is
   already holding, so a user mid-import would have got a 500 on the one screen where their work
   was about to be saved. Version ladder extended to v3 → v2 → v1, two regression tests.
2. **`probe/route.ts` — a 500 on the cache-*hit* path.** The gate read `schemaVersion !== 2`
   against a hard-coded literal, so every cached row failed it once v3 landed. Now compared
   against `EXTRACTION_SCHEMA_VERSION` so it cannot rot again on the next bump.
3. **No `temperature` was set anywhere in `src/`.** Every extraction was one sample from the
   model's default distribution. See §4 — this one cost a false diagnosis.

## 4. A regression I reported that turned out not to exist

Three captions returned **zero candidates** under `p8-s3` that had returned a candidate under
`p7-s2`. That reads exactly like a prompt regression and it was recorded as one, including in a
PR description.

It was not. Re-running the **unchanged** `p8` prompt on those captions returned the candidate
every time, with correct variants. The empty draws were dice. Sampling was confirmed live rather
than assumed: identical input produced different output token counts and different
`modelConfidence` across runs.

`temperature: 0` is now pinned in `gemini.place-extractor.ts`. **This is a measurement-integrity
fix before it is a quality setting** — without it we could not distinguish a prompt change from a
sampling artefact, and prompt evaluation is how recognition improves. It damps variance rather
than removing it; two runs pinned at 0 still differed. `PROMPT_VERSION` deliberately does not move.

**Do this before any future prompt evaluation:** re-measure at `temperature: 0`, and treat any
single-sample corpus delta smaller than ~2 cases as noise until proven otherwise.

## 5. The corpus can no longer adjudicate by name string alone

Two cases were being scored as **false auto-accepts** while returning the **correct venue**. Both
were defects in the measuring instrument; each was verified against `poi_index` directly before
the expectation was touched:

- `מתחת לעץ` → `Under the Tree` @ בן יהודה 202 — the right venue (the caption itself lists that
  branch), but `namePattern` was Hebrew-only. The case's own `indexProbe` already contained
  `under the tree`, so the corpus knew the Latin name existed; only the pattern had not been told.
- `טרטוריה אונה` → `Trattoria Una` @ אינשטיין 69 — the right venue; `addressPattern` was
  `איינשטיין` (double yod) against the index's `אינשטיין`. One street, two spellings.

**The general point is the more important half: a corpus that adjudicates by name string cannot
adjudicate a cross-script match.** That was harmless while cross-script matches never happened. It
is now the main thing this corpus measures, so every expectation must accept every script the
venue is genuinely known by — or the harness reports our successes as failures, in the one bucket
treated as a merge blocker. **Anyone adding corpus cases from here must write both scripts.**

## 6. Open items the owner needs to decide

1. **GitHub Actions billing.** ~8 billable minutes per run, ~800 minutes per 10 days, which
   annualises to ~2,400 min/month against a 2,000-minute free allowance on a private repo. This
   could not be verified — the timing endpoint returns zeroes and the user billing endpoint needs
   an OAuth scope no agent should grant itself. **Check the Actions billing page.**
2. **`agent-guardrails.md` §3 rule 9 forbids a specialist from `source`-ing `.env.local`**, but
   every manual harness in this repo requires it. Either the rule needs a
   source-into-a-child-process exception, or the harnesses need a different key path. Right now
   the rule is routinely broken by instruction.
3. **The product name is still open** (owed at L1-F1-T1). The landing page keeps `P-002` as a
   deliberate placeholder rather than inventing one.
4. **`docs/execution-plan.md` has four stale ownership rows** — `L1-F5-T2` marked IN PROGRESS
   though it shipped in PR #37; `L1-F7-T1` with two named owners, no work, and an exit criterion
   requiring the parked `L0-F2b`; `L1-F11` depending on a model under owner review; and L0/L1
   running in parallel against `mvp-plan.md` §1's "never in parallel". Not fixed here.

## 7. Traps worth re-reading before touching this area

Everything in `handoff-2026-08-28-recognition-corpus.md` §7 still applies (`db:reset` destroys the
10,462 ingested rows; use `localhost:3000` not `127.0.0.1`; vitest v4 needs
`--reporter=verbose --disable-console-intercept`). Two to add:

- **The extraction cache is post-filter, not pre-filter.** The corpus harness's comment claimed
  otherwise; the Gemini adapter runs `postProcessCandidates` *inside* `extract()`. "Did the model
  decline, or did our own filter drop it?" is therefore **unanswerable from a cache entry** and
  costs live calls to settle. Comment corrected.
- **Running two agents concurrently where one moves `PROMPT_VERSION` silently invalidates the
  other's cache.** That is what caused a 13-call run against a 10-call guardrail cap. The
  guardrail was fine; the sequencing was mine.

## 8. Specialists used

`devops-vercel` (the CI timing probe — its headline finding was that CI is *not* slow and the cost
is run count, which redirected the whole workstream) · `product-lead` (the Plotline review and
ruling) · `ai-extraction` (the schema, prompt and provenance work; then independently disproved my
regression diagnosis and found the sampling bug) · `maps-geospatial` (the scorer and prefilter;
also established that no migration was needed and corrected two points of my framing) ·
`ux-interaction` (the map-list stability ruling in §9 of `current-state.md`) ·
`design-system-frontend` ×3 (landing page and pins, tag-chip filtering, import cold start).

Done by the lead: the type seam and the `buildResolveQuery` composition, both 500-bugs, the
`temperature` fix, the corpus adjudication correction, all measurement and adjudication, the
product review in the running app, and every commit and merge.
