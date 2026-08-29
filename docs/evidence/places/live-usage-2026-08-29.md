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
| 1 | `@paz_farchi1` / `7572557155073592583` | 1 | yes | yes | `Kohi בית קפה יפני`, cafe, Tel Aviv. Matched on **google-places**, not a guess. Extract 2.0 s, resolve 0.5 s, 1 lookup. Owner flagged the post-import camera — see below. |

## Findings raised by the run

### LIVE-1 — the post-import camera arrives badly (owner, import 1)

Reported as: the map "renders from scratch", does not ease into the new pin, and there is a visible
gap between the save notification and the camera moving. Two independent causes, both read from
`map-surface.mapcn.tsx` and `import-page-client.tsx`:

**a. The whole-library framing is not animated.** `fitToBounds` calls `fitTo(map, target, false)`
(line 443) — `duration: 0`, an instant snap. Only the focus flight passes `true` (line 778,
`FOCUS_FLIGHT_MS = 1200`). So on any path where the map mounts fresh, the camera *snaps* to the
library and *then* eases to the new pin: two movements, the first of them a jump.

**b. Which path you are on decides whether the map remounts at all.** `BottomNav`'s `＋` opens the
import *overlay* only where a page passes `onAdd` — `/map` does (`map-page-client.tsx:797`).
Everywhere else the `＋` is a plain `<Link href="/import">` (`bottom-nav.tsx:185`), and confirming
there runs `router.push('/map')` (`import-page-client.tsx:646`), which mounts MapLibre from
scratch, refetches basemap tiles, and then does (a). That is the "from scratch" the owner saw.

**c. The lag is a server round trip, and it is inherent to the current design.** On the overlay
path `onSaved` sets `focusPlaceIds` immediately, but the saved place is not in `spots` until
`router.refresh()` re-runs the server component and its `getSpots()` query and the RSC payload
comes back. The camera cannot fly to a pin the client does not have yet, so the notification always
precedes the flight by one round trip.

Not fixed — the owner is mid-run and asked to gather feel before changes.

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

### LIVE-4 — every Israeli city collapses into one area (owner, import 5) — **the headline defect**

Reported as: the list says `4 places in תל אביב-יפו`, but one of them is in Rishon LeZion.

**The stored data is correct.** `קפה מרי` is `ראשון לציון`, `ירושלים 121`, `31.95994/34.82906` —
Google matched the right venue in the right city. `לאר דו פאן` is `Ra'anana`. Nothing is wrong with
the resolver, the extraction or the pin.

**The display is wrong, and it is one assumption.** `domain/places/clusters.ts` groups saved places
with a **single-link cluster at `DEFAULT_CLUSTER_RADIUS_KM = 50`**, and `ui/place/active-area.ts`
then gives the whole cluster **one label**, the plurality spelling of its members' localities. That
label becomes both the heading and every row's second line, which is why all four rows read
`תל אביב-יפו` even though two of them are stored otherwise.

`active-area.ts` states the reasoning outright: *"A 50 km single-link cluster cannot [hold two
cities]: its members are one metropolitan area by construction, so the only open question is which
spelling to print."* And `clusters.ts` justifies the 50 km against the library it was built on:
*"neighbourhoods across greater London stays one London, while Tel Aviv is 3,500 km away and can
never join."*

That is true of a London/Tel Aviv library. It is false in Israel. Measured on the four production
rows:

| | distance |
|---|---|
| Kohi (TLV) → Fugazi (TLV) | 2.2 km |
| Kohi (TLV) → קפה מרי (Rishon LeZion) | 15.2 km |
| Kohi (TLV) → לאר דו פאן (Ra'anana) | 15.9 km |
| לאר דו פאן (Ra'anana) → קפה מרי (Rishon LeZion) | 26.8 km |

Every pair is inside 50 km, so all four are one cluster and the two minority cities lose their
names. **Single-link makes it worse than the radius suggests, because it is transitive**: Ashkelon →
Ashdod → Tel Aviv → Netanya → Haifa are each under 50 km apart, so the entire coastal strip chains
into one "area" the moment there is a place in each. Jerusalem sits at ~54 km from Tel Aviv — just
outside a direct link, but one saved place in Modi'in or Beit Shemesh bridges it in.

**Why it never showed up before.** The test library was London + Tel Aviv, 3,500 km apart. That
library cannot produce this failure. It took real Israeli use, which is the whole point of the run.

**Not a spelling problem, so not fixable by a spelling rule.** The cluster genuinely holds three
different cities. Either the radius comes down a long way for dense countries, or the row stops
showing the cluster label and shows the place's own `locality` (the data is already correct and
already selected in `get-spots.ts`), or both. That is a design decision and it is the owner's.
