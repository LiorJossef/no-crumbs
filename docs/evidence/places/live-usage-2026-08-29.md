# Live usage log — real imports in production, from 2026-08-29

The owner is using production for real, building a list of places in Israel, to get an honest feel
for quality **before** we change anything else. This file is the human half of that record.

## How the record is split, and why

The database already knows most of it. `scripts/usage-review.sh prod` reads back, per import: the
status and the stage it reached, any `error_code` / `degraded_code`, the extract and resolve
timings, the post's author and link, how many places it produced, and per place the name,
category, locality, country, coordinates, tags, and — the headline — whether the pin came from
**`google-places`** (matched to a real listing) or **`llm-guess`** (the model's own estimate,
measured 65–470 m out).

So none of that needs writing down. What the database cannot know is whether the answer was
**right**. That is the only thing worth the owner's typing, and it is three questions per post:

1. **How many places were actually in the post?** The system's count is recorded; the true count
   is not. This is the only way to see what it *missed*.
2. **Is the pin in the right place?** Tap through to the map. Right building / right street /
   wrong.
3. **Is the name and category right?** Especially for Hebrew names, and especially where the pin
   says `google-places` — a confident match to the *wrong* listing is the worst failure mode we
   have, and it is invisible from the database.

## The log

One row per post. Leave anything unknown blank rather than guessing.

| # | link (or author) | places really in post | pin right? | name/category right? | note |
|---|---|---|---|---|---|
|   |   |   |   |   |   |

## Quota, stated once

The Google Cloud project caps Text Search at **100 requests/day**, and the laptop and production
share the same key. An import spends one call per candidate it looks up, capped at 7, so a normal
post costs 1–3. Repeats are free — `place_lookups` caches by candidate, and re-importing the same
post spends nothing.

Section 5 of `usage-review.sh` reports the calls production has spent today.

**The product says so when the quota runs out** — the import review screen reads "We've used up
today's place lookups, so N of these pins come from the captions rather than a place database."
If that sentence appears, the run has hit the cap, and every pin after it is an `llm-guess` for a
reason that is nothing to do with quality. Stop for the day rather than reading those as results.

## Starting state, MEASURED 2026-08-29

Production held **zero** saved places, zero imports and zero cached lookups when this began, so
every row in the review output is from this run. Prod DB is at `0026`; `main` carries `0028`, a
one-off tag cleanup over pre-existing rows, which production has none of — the gap is inert here
and should be pushed before it acquires any.
