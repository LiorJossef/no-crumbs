# E2-TRIP-1 — trips, area matching, and what "details for trip planning" may mean

> **Product ruling.** Author: `product-lead`. Date: **2026-08-31**. Status: **decided at product
> level; three items routed to the owner in §7.**
>
> **Base.** Read against the working tree at `8f8df84` on branch `no-crumbs-implementation` (the SHA
> named in this session's opening git status). Nothing here was executed: this tier has no shell.
> Every claim below about the code is a claim about files at that commit, and every acceptance
> criterion in §8 is written so `qa-reliability` can check it against a named commit rather than
> against a running app.
>
> **Scope.** Specification only. No code, no other document edited.

---

## 0. The ruling in one screen

| # | Question | Ruling |
|---|---|---|
| 1 | Is a trip a first-class object? | **No.** A trip is a **collection with a date range**. Two nullable columns on `collections`, no new table, no new route, no second noun in the UI |
| 2 | How do we auto-match an import to one? | **Reuse `clusterByProximity`'s edge predicate verbatim** — 2 km, or 50 km with the same normalised locality — against the collection's **existing member places**, single-link. Dates re-rank; they never gate |
| 3 | Where does the user confirm? | **On the review screen, before the save.** One control for the import, not one per candidate. **Pre-ticked only for a private collection with exactly one match; never pre-ticked for a shared one** |
| 4 | The multi-city post? | **Split the import by area and offer at most one collection per area.** Never one collection holding both cities. **Never create a collection** |
| 5 | Which extra fields? | **Two, and one is free.** Persist `areaHint` (already extracted, already thrown away). Add `booking` as a substring-gated verbatim quote. **Cut opening hours and best-time-to-go outright.** Price is a quote or nothing, and it is Future. The dish to order **already ships** |
| 6 | Where does it land? | **All of it is L2.** None of it is L1. Right now, all of it is a distraction — see §6 |

---

## 1. A trip is a collection with a date range

### What was argued

A trip plausibly needs four things a collection does not have: a date range, a destination, a
day-by-day ordering, and a different reading of *been / not been yet* while you are actually there.
Taken one at a time, three of the four are already answered and the fourth is out of scope.

**A date range.** Genuinely absent. `collections` is `(id, owner_id, name, description, created_at,
updated_at)` and holds nothing temporal (`supabase/migrations/0024_collections.sql`). This is the
only real gap, and it is two nullable `date` columns.

**A destination.** **Do not store one.** The collection's items already carry coordinates, and the
repo already derives an area from a set of places with a measured rule
(`src/domain/places/clusters.ts`, `src/ui/place/active-area.ts`). A stored destination is a second
source of truth that disagrees with the items the first time someone adds a place outside it — which
is the exact argument `mvp-plan.md` §8 made against a user-made "Tokyo" collection duplicating a
grouping we derive for free, and that argument was never overturned. Derive it; never persist it.

**Day-by-day ordering.** **Declined, not deferred.** Charter §4 lists *itinerary generation* as
explicitly out of scope for V1, and `mvp-plan.md` §8 repeats it under "Not anywhere". A day column
on `collection_items` is the first half of an itinerary planner, and `evidence/product/competitor-pass-2026-08-28.md`
§G is already on the record that we decline that product. A trip having dates does not oblige us to
schedule inside them. `collection_items.position` continues to be the only ordering.

**Been / not been yet while you are there.** Nothing changes. `visit_state` is a per-user overlay on
`saved_places`, it ships, and near-me + `Not been yet` already answers *"places near you that you
haven't been to"*. A trip does not need a second completion model; it needs the one we have, pointed
at a smaller set of places, which a collection already is.

### The ruling

> **A trip is a collection that has a start date and an end date.** `collections` gains
> `starts_on date` and `ends_on date`, both nullable, with `check (ends_on is null or starts_on is
> null or ends_on >= starts_on)`. No `trips` table, no `/trips` route, no trip-shaped duplicate of
> the collection screens.

**The cheapest true answer wins, and this is it.** A collection is already a map
(`/collections/[id]` is `/map` with a different set of pins), already shareable, already ordered,
already has membership RLS that `security-privacy` reviewed adversarially before it landed. A
`trips` table buys a date range and re-buys all of that at full price.

**Implementation note that will otherwise be missed.** `0024`'s posture is **column-level** INSERT
and UPDATE grants, deliberately (`grant insert (owner_id, name, description)`, `grant update (name,
description)`). Two new columns are therefore **not** writable until the new migration extends both
grants. A developer who adds the columns and stops has shipped a feature that silently cannot be
written from the browser and will fail at runtime, not at deploy. The existing row-level policies
(`collections_insert_own`, `collections_update_owner`) need no change.

### The word "trip"

`voice-and-vocabulary.md` §3 is binding and says: **collection**, and *"do not introduce a second
word"*. Under this ruling a trip is not a different object, so shipping a second noun for it would
break that row directly.

> **Ruling: the user-facing noun stays `collection`.** The dates render on the collection header as
> a fact (`3–9 Sep`, per §5's date format) and nowhere else. No nav item, screen title, or empty
> state says *trip*. No string says *your trip*.

Making *trip* a first-class user-facing noun is a change to the vocabulary table, which is the
owner's — routed in §7.

---

## 2. The auto-match rule

Written as a decision procedure. A developer implements it from this section; `qa-reliability`
checks it from §8.

### 2.1 Inputs, all of which exist today

| Signal | Where it lives at `8f8df84` |
|---|---|
| A resolved candidate's coordinates | `places.lat` / `places.lng` |
| Its normalised locality | `places.locality`, through `normalise()` (`src/domain/places/normalise.ts`) |
| A collection's member places | `collection_items` → `places`, readable under `collection_items_select_member` + `places_select_if_in_shared_collection` |
| Whether the user may write to it | `public.can_edit_collection(collection_id)` |
| The date range | `collections.starts_on` / `ends_on` — **does not exist yet** (§1) |

### 2.2 The edge predicate — reused, not reinvented

A candidate place **P** is *in the area of* collection **C** when P is linked to **at least one**
member place of C, where `linked` is `clusters.ts`'s predicate **unchanged**:

```
linked(a, b)  ⟺  haversineKm(a, b) ≤ 2 km
              ∨  ( haversineKm(a, b) ≤ 50 km ∧ normalise(a.locality) = normalise(b.locality) ≠ '' )
```

Constants: `DEFAULT_NEAR_RADIUS_KM = 2`, `DEFAULT_CLUSTER_RADIUS_KM = 50`
(`src/domain/places/clusters.ts`).

**Where they came from, so nobody re-derives them.** Both are measured against the real library and
recorded in that file's header: 0.3 km already bridges every spelling variant of Tel Aviv in the
32-row library, so 2 km carries a 6× margin; and 2 km must stay under the 3.4 km between Ra'anana
and Herzliya or it merges two genuine cities. 50 km is the reach of a *matching* city name only —
central Tel Aviv to Rishon LeZion is 11.2 km and the user's own London pins span 11.0 km, which is
why proximity alone at 50 km was measured and rejected. **Three variations on this rule have already
been measured and rejected** (that same header, plus `current-state.md`'s "decisions not to
reopen"). Any new threshold in this feature is a fourth attempt and needs the same standard of
evidence.

**Single-link against any member, never against a centroid.** A collection spanning greater London
has members 11 km apart; a centroid-plus-radius test is wrong at the edges. Matching against any
member is exactly what the shipped area grouping does.

**A collection with no items has no area and matches nothing.** Correct, and stated so nobody
"fixes" it: an empty `Japan` collection created in advance will not be suggested. The manual picker
in §3 is the recovery. Evidence that would reopen it: users create empty dated collections ahead of
a trip and then report that imports do not find them — at which point the answer is a stored anchor
on the collection, which §1 currently cuts.

### 2.3 Ranking, when more than one collection matches

1. **Eligibility.** Only collections where `can_edit_collection(id)` is true. A viewer may not add;
   this falls out of `collection_items_insert_editor` and must not be worked around in the UI.
2. **Match strength.** `matched(C)` = the number of C's member places linked to at least one
   candidate in this import. Collections with `matched(C) = 0` are not candidates at all.
3. **Tier**, and this is the only thing the date range is used for:

   | Tier | Collection |
   |---|---|
   | A | Dated **and live** |
   | B | Undated |
   | C | Dated and **not** live |

   *Live* = `today ∈ [starts_on − 14 days, ends_on + 3 days]`.
4. **Within a tier:** higher `matched(C)` wins → then `collections.updated_at desc` → then the
   lexicographically smaller `id`. Deterministic at every step, for the same reason
   `pickAnchorCluster` is: the same library must produce the same suggestion twice.
5. **Offer exactly one**, plus an escape to the full picker. Not a ranked list of three — a ranked
   list makes the user adjudicate our uncertainty, where one suggestion plus an escape is one
   decision.

**The 14 / 3 day window is asserted, not measured, and I am saying so rather than dressing it up.**
It is deliberately a **re-ranking input and not a gate**: a wrong window can only reorder
suggestions, never hide a collection. That containment is why an unmeasured number is acceptable
here and would not be acceptable in the edge predicate. Evidence that would change it: the first ten
real dated collections, with the interval between creation and the first import that matched them.

**The matcher must degrade cleanly when the date columns do not exist.** Tier A is empty until the
§1 migration lands, and the feature must be correct and shippable in that state. Write the date
signal as optional from the first line.

---

## 3. Ambiguity, and being wrong

This is the section that decides whether the feature is loved or hated, so the rulings are tight.

### 3.1 It belongs on the review screen, before the save

The review screen is where this product already asks *"is this right before anything is saved"* —
Charter §3 invariant 2, capability 6, on the never-cut list. Putting the collection assignment after
the save creates a second confirmation surface for one import and a wrong assignment that has
already happened. It goes **on review**, under the candidate list, above the save action.

### 3.2 One control per area, not one per candidate

A per-candidate collection picker turns a three-candidate review into six decisions. The import's
candidates are clustered (§4) and each cluster gets at most one suggestion row.

### 3.3 Pre-ticked, or offered

> **Private collection** (the user is its only member): **pre-ticked**, when there is exactly one
> tier-A or tier-B match. Undo is cheap and nobody else sees it.
>
> **Shared collection** (more than one member): **offered, never pre-ticked.** The user taps it on.

The reason is not squeamishness about defaults. Adding a place to a shared collection is a write
other people see, attributed to this user by name through `collection_items.added_by`. Pre-ticking
it is the product taking an outward-facing action on the user's behalf. I do not hold
`security-privacy`'s veto and am not claiming it; I expect this to be the line they would draw
anyway, and the ruling stands on product grounds regardless.

**Two or more matches in one tier: nothing is pre-ticked**, whether shared or private. The
suggestion still shows the best one; the user taps.

### 3.4 The suggestion states its reason

The control shows the collection's name and **why it was suggested**, as a count of facts:

- `Add these 3 places to Tokyo, October?` · `4 of its places are in this area.`

Vocabulary checks that must pass before any of this ships (`voice-and-vocabulary.md` §7): no brand
word, no exclamation mark, sentence case, digits, one clause per string, and none of *matched ·
smart · automatically · we think · detected*. **`matching` is the shipped word for what the resolver
does to a candidate** (§3's table) and reusing it here for collections would put one word on two
jobs — prefer naming the fact (`in this area`) over naming the mechanism.

### 3.5 Undo

- On the post-save screen, the assignment is one line with an undo affordance for the life of that
  screen.
- Permanently, removal is the existing `removePlaceFromCollection` / `removeCollectionItem`
  (`src/app/actions/collections.ts`).
- **Undo removes only the collection items this import created. It never deletes a saved place.**
  Getting this backwards turns a mis-assignment into data loss.

### 3.6 The assignment can fail on its own

Saving places and assigning them to a collection are separable writes. **A failed collection write
must never roll back the import**; the places are saved, and the screen says which part did not
land. The inverse — losing eight resolved places because one `addPlacesToCollection` call failed —
is not a trade this product makes.

---

## 4. The multi-place, multi-city post

> **Ruling: split the import by area; at most one suggestion per area; never one collection holding
> both cities; never create a collection.**

Mechanically: cluster **this import's** resolved candidates with `clusterByProximity` — same
function, same constants, same `toLocality` projection as the library uses — then run §2 once per
cluster. An eight-venue, two-city post produces up to two suggestion rows. A cluster with no match
offers nothing, and its places still save.

**Never auto-create.** A post naming eight venues across two cities, for a user with no matching
collections, produces **zero** collection suggestions and eight saved places. That is the right
outcome, not a gap: the library's area grouping already tells the user those are two groups of
places, derived from coordinates, for free, with no container and nothing to name. Inventing a
collection called `Tokyo` and putting five places in it is the confidently-wrong failure at
container scale — the standing product line moved from a coordinate to a container.

---

## 5. "Relevant details for trip planning"

### 5.1 First, the correction that changes the size of the ask

The task frames this as new. Most of it shipped in `0019_saved_place_enrichment.sql`.
`saved_places` already stores, **per user, per save**: `tags`, `dishes`, `why_go`,
`extracted_reason`, `source_url`. The stored info is already wider than `mvp-plan.md` §2's five
fields, and has been since before this ruling was asked for.

So the real question is narrower and better: **which fields are still missing, and which of the
missing ones survive our own honesty rules.** Ruthlessly:

| Field | Extractable with provenance? | Stable enough to store forever? | Survives "never convert uncertainty into certainty"? | Ruling |
|---|---|---|---|---|
| **Neighbourhood / area** | **Yes — already extracted.** `areaHint`, class `caption_verbatim` (`src/domain/extraction/schema.ts`) | Yes | Yes | **KEEP. It is free.** Extracted on every import today and **discarded at save**. Measured useful: composing it into the query beat the plain name 6/9 vs 4/9 and narrowed 5 of 10 ambiguous cases while breaking none of 5 clean hits |
| **Booking needed / book ahead** | Yes, when the caption says it — and creators do say it | Yes: it is a claim about the recommendation, not a live venue fact | Yes, **if substring-gated exactly like `dishes`** | **KEEP — the one field I would fund.** Highest trip-planning value per unit of risk: it is the fact that changes what you do today |
| **The dish to order** | — | — | — | **ALREADY SHIPS** as `dishes`, verbatim-gated. The gap is that it is stored and under-surfaced, not that it is missing. Surfacing it costs a component, not a schema version |
| **Price band** | Rarely, and only verbatim (`₪45 lunch`) | Prices drift; a `$$` band is a judgement we would be inventing | Only as a quote | **DEFER, as `priceMention` — a verbatim fragment, never a band.** Future list, not L2 |
| **Opening hours** | **No.** A caption almost never states them, so the model would supply them from world knowledge | **No** — they change weekly and we hold a row forever | **No** | **CUT.** Not deferred. It can only come honestly from a provider, and every credentialed provider forbids storing it past 30 days (`06` §3, `mvp-plan.md` §11). A field we may not keep is not a field |
| **Best time to go** | No — pure inference | No | No | **CUT** |

**Why "the model could just tell us" is not an argument, with the measurement.** `schema.ts` records
a real leak: on a caption reading `Resturants in Tel Aviv 📍Ha Kosem #foodie` — which says nothing
about food — two consecutive runs returned the tags `falafel` and `middle eastern`. Both true of
that venue; neither in the caption. That is world knowledge arriving in a field labelled *what the
caption says*, in the one v2 field with no code gate behind it. Opening hours and best-time-to-go are
that failure mode with a plausible number attached, on a screen where a user would act on it.

### 5.2 The ruling

> **Two fields.** Persist `areaHint` per save (free — extracted today, discarded today). Add
> `booking`: a nullable verbatim caption fragment, class `caption_verbatim`, dropped by
> `grounding.ts` when it is not a caption substring, exactly as `dishes` is.
>
> **Cut:** opening hours, best time to go. **Future:** `priceMention`, as a quote only.

Both new fields are per-save overlay columns on `saved_places`, and both need
`EXTRACTION_SCHEMA_VERSION` and `PROMPT_VERSION` moved together — `extractions` is cached on
`(source_id, model, prompt_version)`, so a shape change that does not move the version lets an old
row be read back as a new one (`schema.ts`, and its test asserts the two do not drift).

### 5.3 The boundary question, stated rather than slipped past

`mvp-plan.md` §2 fixes stored info at *name · category · coordinates · source link · user note*, and
**OD-4** asks whether that boundary governs place facts only or every stored field.

My position: the boundary's stated **reason** is a licensing constraint on **place facts obtained
from a provider** — "which is exactly what open data lets us store forever". `areaHint` and
`booking` are neither: they are statements about one creator's recommendation, stored per user,
sitting in the same class as `tags`, `dishes` and `why_go`.

**And it is worth being blunt about the precedent:** `0019` already landed three columns of exactly
this class, so in practice the boundary was settled by a migration and never on the record. That is
not an argument for doing it again quietly. The question is the owner's and is routed in §7.

---

## 6. Scope placement, and the honest answer about now

| Piece | Level |
|---|---|
| Persist `areaHint`; surface the enrichment already stored | **L2** |
| Trip = collection + `starts_on` / `ends_on`, dates on the header | **L2** |
| Area auto-match suggestion on the review screen (§2–§4) | **L2** — this is the piece with the product value |
| `booking` field (schema v5) | **L2 tail**, only after the three above |
| `priceMention` | **Future** |
| Day-by-day itinerary; a stored trip destination | **Future / declined** (Charter §4) |
| Opening hours; best time to go | **Cut** |

**None of it is L1, and right now all of it is a distraction from shipping.** The deadline is
**6 September**. `current-state.md`'s item 0 is that GitHub Actions cannot start a runner, so
**nothing can land at all**; its item 2 is that four graded artefacts — `test-specification.md`,
`scale.md`, `deployment.md`, `how-the-system-works.md` — **do not exist**, against a submission that
is graded on them. A trip feature does not move either number.

The lightest honest thing to do with this ruling today is **file it and build none of it**. If
something from here is built before L1 closes, it should be the one item that costs a line and no
new surface: **persist `areaHint`**.

---

## 7. For the owner

Three decisions, briefly, because they are not mine.

1. **OD-4 / OD-1 — does `mvp-plan.md` §2's "info" boundary govern place facts only, or every stored
   field?** Gates `areaHint`, `booking` and `user_tags` alike. My reading is *place facts only*, and
   `0019` already shipped three fields on that reading without the ruling being made. One line
   either way.
2. **Does the word *trip* become a first-class user-facing noun?** My ruling keeps `collection` and
   renders dates as a fact, because `voice-and-vocabulary.md` §3 forbids a second word for one
   object. Overriding that is a change to the vocabulary table, which is yours.
3. **Is anything here built before L1 closes?** My recommendation is no, with `areaHint` as the sole
   exception. §6 is the argument.

---

## 8. Acceptance criteria

Checkable against a named commit, without asking `product-lead` anything. `qa-reliability` or the
orchestrator executes; this tier verifies nothing.

**AC-1 — the shape of a trip.** The migration adds exactly `starts_on date` and `ends_on date` to
`public.collections`, with a CHECK that `ends_on >= starts_on` when both are non-null. No table
named `trips` exists. `rg -n "create table public.trips" supabase/migrations/` returns nothing.

**AC-2 — the columns are writable.** The same migration extends **both** `grant insert (...)` and
`grant update (...)` on `public.collections` to include the two new columns. A policy test signed in
as the owner sets and clears both; a test signed in as an `editor` (not owner) is refused by
`collections_update_owner`.

**AC-3 — the edge predicate is reused, not copied.** The matcher imports `clusterByProximity` /
`haversineKm` and the two exported constants from `src/domain/places/clusters.ts`. No new distance
constant is introduced: `rg -n "50|2\b" <matcher file>` shows no locally-defined kilometre
threshold, and the matcher file declares no `RADIUS`/`_KM` constant of its own.

**AC-4 — matching is correct on fixtures, unit-tested, no database.** Given a collection whose
members are at Tel Aviv coordinates with five different spellings of the locality, and candidates
at: (a) 1.5 km away with locality `''`; (b) 12 km away with locality `Tel Aviv`; (c) 12 km away
with locality `ראשון לציון`; (d) 300 km away with locality `Tel Aviv` — the matcher matches (a) and
(b) and **not** (c) or (d).

**AC-5 — eligibility.** A collection in which the user is a `viewer` is never returned as a
suggestion. Asserted in a policy test as well as a unit test, because the UI must not be the only
thing enforcing it.

**AC-6 — determinism.** Running the matcher twice over the same inputs returns the identical
suggestion, including the tie-break, for two collections with equal `matched` counts and equal
`updated_at`.

**AC-7 — the date signal is optional.** The matcher's unit tests pass with the date fields absent
from every collection fixture (tier A empty), and the suggestion is still produced from tiers B/C.

**AC-8 — pre-ticking.** With exactly one match and a collection whose `collection_members` count is
1, the control renders checked. With the same match and a member count ≥ 2, it renders **unchecked**.
With two matches in the same tier, it renders unchecked in both cases.

**AC-9 — placement.** The control renders on the review screen, above the save action, and no
collection assignment UI exists on any post-save screen other than the undo line of AC-11.

**AC-10 — multi-area.** An import whose resolved candidates form two clusters under
`clusterByProximity` produces at most one suggestion per cluster, and no single suggestion contains
places from both clusters. An import with no matching collection produces **zero** suggestions and
creates no collection: after the save, `select count(*) from collections` is unchanged.

**AC-11 — undo.** Undo removes only the `collection_items` rows created by that import.
`saved_places` row count is unchanged before and after undo, asserted in the test.

**AC-12 — independent failure.** With `addPlacesToCollection` forced to fail, the import still
saves every confirmed place, and the screen reports the collection part as not done. No test asserts
a rollback of the saved places.

**AC-13 — strings.** Every new user-facing string passes `voice-and-vocabulary.md` §7: sentence
case, no exclamation mark, digits not words, one clause, no brand name, and none of *matched ·
smart · automatically · we think · detected*. Dates render as `3 Sep` / `3 Sep 2025` per §5 of that
document.

**AC-14 — the two extraction fields (if built).** `areaHint` is persisted per save and is readable
back on the place detail. `booking` is dropped by `grounding.ts` when it is not a caption substring,
with a unit test that feeds a non-substring value and asserts `null`.
`EXTRACTION_SCHEMA_VERSION` and `PROMPT_VERSION` both moved in the same commit, and
`tests/unit/extraction/schema.test.ts` still passes — including its assertion that
`CANDIDATE_FIELD_PROVENANCE` covers every key, which forces a provenance class to be chosen for each
new field.

**AC-15 — nothing was cut back in.** No field named for opening hours, best time to go, or a price
band exists in `RawPlaceCandidateSchema` or on `saved_places`.
