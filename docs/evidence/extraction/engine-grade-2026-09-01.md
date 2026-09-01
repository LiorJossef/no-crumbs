# The engine, graded — 2026-09-01

**Commit**: `7fade45`. **Run**: `docs/evidence/extraction/owner-corpus/run-record.json`,
25-lookup live budget, 11 lookups spent, $0 marginal (first 5,000/month free).

## The grade: B+. Not A+, and the reason is the sample, not the engine.

Everything the corpus can currently measure, the engine passes. The corpus cannot yet
measure enough to award an A+, and the harness says so itself in its own output:
*"NOT YET A MEASUREMENT: 10 adjudicated case(s) in this sample."*

## What is measured, and passing

| Metric | Result | Reading |
|---|---|---|
| `sufficient` yield | **3/3 (100%)** | When the caption names a place, the engine finds it |
| **Wrong pre-selected** | **0** | The must-be-0 metric. No confidently wrong place reaches a user |
| Wrong shortlisted | 1 | `Fiori`, ranked *below* the correct `Cafe fiori`. A ranking annoyance |
| `futile` / `not-a-place` | 0 places offered | The classes require silence, and it is silent |
| `recoverable` yield | 0/3 | Correct by definition — the caption cannot name these |
| `postIntent` accuracy | 9/10 | 1/1 on hand labels, 8/9 on class-derived defaults |

The pre-select column is the one that matters. This project ranks a confidently wrong place
above every other failure, and two defects in that column were closed this session:

- A hashtag-only name reaching auto-preselect (`#tsukijifishmarket` → `Tsukiji Market` at
  1.000). Fixed in `8ae1ef4`; evidence in `hashtag-preselect-regression-2026-09-01.md`.
- `Nomena Roasters` scored as a wrong pre-select when it was the right venue under Google's
  own name. That one was the **grader** being wrong, not the engine — corrected in `6b7f3af`.

## Why this is not an A+

Three gaps, in order of how much they cost the grade:

1. **n=10, borrowed.** Every yield number above is a property of the e7 web-search sample,
   which `07-caption-content-scoring.md` documents as skewed to indexed, high-reach posts.
   The owner sample is **n=1**. A 100% on three cases is not a recall figure.
2. **Transcripts are unmeasured end to end.** The lift is real where it was measured
   (9 → 16–18 candidates, zero false positives; `@gadderhq` 0 → 4 London venues), but
   acquisition is blocked: TikTok refuses this machine's IP after ~35 requests, verified four
   times, and still refuses with 456 valid cookies — so it is address/fingerprint-level, not
   auth. `scripts/fetch-transcripts.sh` exists so the owner runs it under their own session.
3. **`recoverable` is 0/3 by design and stays there** until 2 lands. That is the class the
   whole Engine 2.0 ladder exists to rescue, and it is currently the class we cannot score.

## What would move it

Nothing in `src/`. Both remaining steps need the owner:

- `./scripts/fetch-transcripts.sh chrome` — one command, the owner's own browser session.
- ~50 links in `tests/manual/owner-corpus-links.txt` (13 there now). This is the single
  highest-value action available to the project: it converts every number above from a
  property of a borrowed sample into a property of the product.

## Reproducibility

The grade replays offline **on a machine that has run it live once** — provider rows cache to
`docs/evidence/.local/` and that path is gitignored on purpose, because Google's terms restrict
storing Places content. From a clean checkout the extraction and intent halves grade with no
credentials at all; the resolver half needs a key. That split is deliberate, not an omission.
