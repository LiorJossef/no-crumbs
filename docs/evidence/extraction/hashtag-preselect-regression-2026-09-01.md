# A hashtag-only name reached auto-preselect — measured and closed

**Commit**: `8ae1ef4` (the fix). Defect observed on the corpus re-run at `bd56a5a`.
**Status**: VERIFIED — measured against the stored caption, not a synthetic fixture.

## What happened

`RICH-EXT-1` §4 (2026-08-28) recorded `#tsukijifishmarket` becoming a place at 0.95. The hashtag
gate was built in response. On the 2026-09-01 corpus re-run **the same caption** produced
`tsukjimarket`, which resolved to `Tsukiji Market` at **1.000 and arrived pre-selected**.

The caption (`docs/evidence/tiktok/oembed-set1-raw.json`) is one sentence and 28 tags. Its prose
never says the creator went to Tsukiji.

## Why the gate did not stop it

Three mechanisms, each working as written, none of them connected to the tick:

1. `filterPlausible` caps a hashtag-only candidate's `modelConfidence` at 0.5. `SCORING.total`
   has carried `datasetConfidence: 0` since RESOLVE-CONF-1, so **the cap gates nothing** — it is
   multiplied by zero before it reaches the band.
2. `isHashtagOnly` had exactly one consumer, `candidate-card.tsx`, which draws a notice.
3. `arrivesTicked` never saw the fact, so the notice was drawn beside an already-ticked box.

## The measurement

`isHashtagOnlyEvidence` run against the real caption. It fires on the defect class in every
evidence shape the extractor can produce, including the *resolved* name the card shows:

| rawName | evidence | hashtag-only |
|---|---|---|
| `tsukjimarket` | `#tsukjimarket` | true |
| `tsukjimarket` | `tsukjimarket` | true |
| `tsukjimarket` | null | true |
| `Tsukiji Market` | `#tsukjimarket` | true |
| `Tsukiji Fish Market` | null | true |

And the check that mattered more — that it does **not** un-tick the legitimate class. Against a
prose caption carrying its own tag block ("6 Must try spots in Tokyo Japan! … #udon #pizza"):

| rawName | hashtag-only |
|---|---|
| `Tokyo` (prose) | false |
| `Kyoto` (prose) | false |
| `udon` (tag only) | true |
| `pizza` (tag only) | true |

The gate discriminates on the right axis. Prose-corroborated names keep their tick.

## The fix

`arrivesTicked` takes the fact as a third argument, defaulting `false` so no existing caller
changed behaviour silently. The candidate is still shown, still labelled, still one tap from saved
— it is no longer decided on the user's behalf.

## Note on the test that had to change

The pinned assertion was the literal `arrivesTicked(isSaveable(c), views[i]!)`. It failed the
moment the predicate grew an argument — a test describing today's spelling rather than the
property. Rewritten to match the call; the neighbouring test still pins that the seed is not
`willSave`, which is the regression that actually matters.
