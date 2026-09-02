# Work plan — owner product feedback, round 3

> **Written 2026-09-02** against `no-crumbs-implementation` at **`4ca68e6`**, from
> `NO_CRUMBS_PRODUCT_FEEDBACK_3.md` (owner hands-on testing). Every file:line below came from a
> read-only triage pass by four specialists — `maps-geospatial`, `ai-extraction`, `ux-interaction`,
> `supabase-database` — dispatched concurrently at that same commit. Nothing was written and no
> provider quota was spent.
>
> **The feedback was gathered locally on `no-crumbs-implementation`** (owner, 2026-09-02), not
> against production. So every item is live code on this branch, none of it is already-fixed drift,
> and the file:line triage below is aimed at the code that was actually being used.
>
> This is a **triage plan, not a backlog**. The feedback holds ~45 distinct items and the course
> deadline is **6 September 2026** — four days. Items below are marked **NOW**, **IF TIME** or
> **DEFERRED**, and every deferral says why.

---

## 0. The two facts that shape everything

**a. Nothing here reaches a user until PR #109 lands.** `no-crumbs-implementation` is **417 commits
ahead of `main`**. Production serves `7494091`, one commit behind `main`. CI runners are working
again — contrary to `current-state.md` item 0, which is now stale — but **two of the four jobs
fail**, so `merge:pr` correctly refuses the PR:

| Job | Status | Cause, read from the run log |
|---|---|---|
| `lint · typecheck · layer guard · unit` | ✅ 2m21s | — |
| `next build` | ✅ 1m21s | — |
| `playwright` | ❌ | The job starts **no Supabase** and passes no env, so the dev server loops `Error: Your project's URL and Key are required to create a Supabase client!`. The now-wired `global-setup.ts` guard is doing exactly what it was written to do |
| `migrations · RLS policy tests` | ❌ | `supabase/tests/0035_profile_names_policy_tests.sql:169` raises `FAIL P1a: no pre-0035 profiles at all, so the name-backfill assertion below would be vacuous` — on a clean CI rebuild that precondition **can never hold**. A test-design defect, not a policy defect |

Neither is a product bug and both are small. **This is Lane 0. Owner ruling 2026-09-02: it runs
alongside the product work rather than ahead of it** — the feedback lanes are built and verified on
this branch, and landing is a separate clock.

**b. The local database is not the schema on disk.** 36 migration files (`0001`–`0037`, no `0027`);
the local container's applied head is `0027`, and `0021`–`0023` plus `0028`–`0037` are **not
applied** — with an orphan `0027` row that has no file. Any "verified locally" claim about saves,
collections or profiles today is measured against the wrong schema. Bringing local up to disk is
**world-stopping** (guardrails §8 rule 30) and must happen in Lane 0, before any wave. It is not a
`db:reset`.

Also unmeasured and stale: staging `0018` / production `0026` were measured 2026-08-30 against 29
files. Re-run `db:status:staging` / `db:status:prod` before planning any push.

---

## 1. The single biggest finding

**Three of the four clustering complaints (§3.1, §3.2, §3.3/§3.4) are not clustering bugs.** They are
one data-quality defect with three faces: `places.locality` and `places.country_code` arrive **NULL**
from the Google adapter, and every geography surface then degrades — differently, which is why it
reads as four unrelated bugs.

Measured on the local library:

- The Haifa row has `country_code` NULL → `areaCountry` returns `null` → it falls into the
  `NO_COUNTRY_KEY` bucket → `library-summary.ts:74` labels that bucket with the **area's** name, so
  `חיפה` renders as a peer of `Israel`. The profile then reads `4 Cities / 3 Countries` because
  `profile-stats.ts` counts areas as cities but filters nulls out of countries. Not an arithmetic
  bug — the null bucket is a group everywhere except the country stat.
- **All four Czech rows have `locality` NULL.** `clusters.ts:447` returns `null`, which prints
  `this area`. The grouping rule is behaving exactly as designed; Prague's Google address components
  are `Praha 1`-style sublocalities and the adapter never wrote a locality.
- The bare `13` is the same path: `summary-features.ts:106` does `label: area.label ?? ''`, and
  `summary-style.ts:139` concatenates label + count, so a null label prints as a lone number.

**Do not touch the area-grouping rule.** 2 km OR (50 km AND same normalised locality) is correct
here, and three fixes in that family are already measured-and-rejected. The fix is the adapter, a
reviewed backfill, and a decision about how a null-country bucket presents itself.

This also sits directly under the open, undiagnosed `1 in הרצליה` defect. Same family.

---

## 2. Lanes

Dispatched as **vertical slices**, per `agent-guardrails.md` §8 rule 31 — one lane owns the data, the
action, the control and the proof. Write scopes are pairwise disjoint **within a wave**; where two
lanes want the same file they are sequenced instead of split.

### Lane 0 — Land the work · `qa-reliability` + `devops-vercel` · **runs alongside, blocks nothing**

**Owner ruling, 2026-09-02: Lane 0 stays in the plan but does not gate the feedback lanes.** The
product work happens on `no-crumbs-implementation` and is verified there, against the running app and
the real local database. Landing is a separate concern with a separate clock; treating a red CI job
as a reason not to fix a place card would trade four days of product work for a workflow file.

What that costs, stated plainly so it is a choice and not an accident: the feedback fixes reach a
user only when #109 merges, so Lane 0 still has to finish before 6 September — it just finishes in
parallel, and it is the one lane that may be picked up and put down between the others.

| Task | Detail |
|---|---|
| 0-T1 | Give the `playwright` CI job a local Supabase, a seeded demo user and `E2E_PASSWORD`, matching what the migrations job already does. Scope: `.github/workflows/ci.yml` |
| 0-T2 | Fix `0035_profile_names_policy_tests.sql` P1a — seed a pre-0035 profile, or make the vacuity guard conditional on rows existing. Scope: `supabase/tests/**` |
| 0-T3 | Apply `0021`–`0023`, `0028`–`0037` to the local container. Orchestrator only, world-stopping, before any wave |
| 0-T4 | Re-measure staging and production migration state |
| 0-T5 | PR #109 green → `npm run merge:pr -- 109` → verify `main` and the deployment |

**Acceptance:** four green jobs on #109; `/healthz` reports a commit that contains `4ca68e6`.

### Lane A — Geography tells the truth · `maps-geospatial` + `supabase-database` · **NOW**

Covers feedback **§3.1, §3.2, §3.3, §3.4**, the profile counts, and the standing `1 in הרצליה` defect.

| Task | Detail |
|---|---|
| A-T1 | Google adapter writes `locality` and `country_code` reliably — including Prague-shaped addresses, where the locality lives in a sublocality component. `src/integrations/google/**` |
| A-T2 | Reviewed backfill of the affected rows. **Migration `0038` is allocated to this lane and to no other.** No blind backfill — read the rows first |
| A-T3 | Decide and implement how a still-null country presents. A place with no country must not appear as a peer of a country; the profile's city and country counts must come from one definition. `src/domain/places/**`, `src/ui/place/library-summary.ts`, `src/app/profile/_lib/**` |
| A-T4 | Confirm §3.3's bare `13` is the same null-label path. It is **SUSPECTED**, not confirmed — local Tel Aviv rows normalise to a clear winner with no tie, so this needs the owner's own rows |

**Acceptance:** the owner's own library, in a browser — Haifa under Israel, Prague named Prague, no
bubble showing a bare number, profile counts matching the groups listed beneath them.

### Lane B — The zero-scroll place card · spec `ux-interaction` / build `design-system-frontend` · **NOW**

Covers **§2.1–2.6, §1.5, §1.2, §11.2**. This is the product's most-visited surface and the one place
the owner's complaint is about the *shape* of the thing, not its spacing. It absorbs five smaller
items as sub-tasks, so it is one dispatch rather than five.

| Task | Detail |
|---|---|
| B-T1 | Compact action row under the source quote — TikTok · Maps · **Been** — replacing the full-width blocks. The ask is the *size and weight* of the control, not its wording. `saved-place-edits.tsx:168-198` |
| B-T2 | `Approximate location ~` as a small label beside the address; retire the process sentence. `src/ui/place/location-certainty.ts:48-51`, `place-sheet.tsx:2342-2355` |
| B-T3 | Empty note becomes `+ Add note`. `saved-place-edits.tsx:549-580` |
| B-T4 | Remove the rename pencil from the UI. Keep `saved_places.display_name` and its server action — this is a UI removal, not a data change. `saved-place-edits.tsx:396-529`. **The `<bdi>` at `place-sheet.tsx:2062` and its comment must survive** — the pencil is the fixed-chrome reference in the RTL audit |
| B-T5 | Breathing room between list content and the sidebar edge strip; compact `Been` badge in rows. `place-sheet.tsx:1004-1013`, `place-desktop-panel.tsx:230`, `visit-state.tsx:40-52` |

**Scope note:** Lane B owns `place-sheet.tsx` and `saved-place-edits.tsx` exclusively for the whole
wave. Round 5 capped the popover and added a scroll mask — it *accepted* scrolling. This lane
reverses that, deliberately.

**Acceptance:** at 390×844 and 1440×900, on a real saved place with a note, a quote and an
approximate location, every primary action is above the fold without scrolling.

### Lane C — The filter row · `design-system-frontend` · **NOW**

Covers **§1.3, §1.4**. Recorded twice already by independent reviews — 372 px, 41% of the viewport,
73% of the desktop panel is controls before the first place.

| Task | Detail |
|---|---|
| C-T1 | Collapse the chip row behind one compact trigger that opens the existing chips in a popover/sheet. **Not a native `<select>`** — that would drop the pressed chip filling with its own category colour, which `facelift-plan.md:144` locks and which is load-bearing across pins, chips and counts |
| C-T2 | **Re-specify the Been / Not-been-yet interaction.** `ux-interaction` writes the spec before anything is built. The complaint is the interaction model, not the wording: at a glance the control does not say whether you are *including* been places, *excluding* them, or *showing everything*, and the `x` that appears when it is active reads as "close this" rather than "clear this filter". The three states must be distinguishable without pressing anything, and clearing must be obvious. **This reverses a written decision** — see §4. Keep the ratified words **Been** / **Not been yet**; they are not what is wrong |

**Scope:** `category-filter-bar.tsx`, `src/ui/place/visit-state.ts`. Nothing in `place-sheet.tsx`.

### Lane D — The map behaves like one surface · `maps-geospatial` · **NOW**

Covers **§1.7, §4.1, §4.2**.

| Task | Detail |
|---|---|
| D-T1 | **Dark → Light restores the light map.** CONFIRMED: `basemap-tint-layer.tsx:81` re-reads the *already-tinted* live paint and keeps each colour's lightness, clamping only with caps. The night table is nearly all caps so light→dark works; the light table has **no `minLightness` at all**, so dark→light cannot lift anything back up. The transform is not invertible. Fix: snapshot CARTO's original paint per layer at style load and always tint from that |
| D-T2 | Clear `hoveredPlaceId` on selection change. `onPlaceClick` (`map-page-client.tsx:1336`) never clears it, and a list row that keeps DOM focus keeps A lifted-and-named — `onBlur` never fires when the tap lands on the MapLibre canvas |
| D-T3 | Fly-to on pin tap — **only if the owner rules for it.** This is not a bug: `map-page-client.tsx:1330` states the rule, *"tapping a pin must not move the camera under the finger that tapped it."* See §4 |

**Acceptance:** theme toggled both directions three times, screenshots each way; A-then-B selection
across list and map with no residual highlight.

### Lane E — The import review stops offering nonsense · `ai-extraction` + `nextjs-architect` · **NOW**

Covers **§6.1, §6.2, §6.4, §2.7**. Two of these are clean engineering defects.

| Task | Cause | Detail |
|---|---|---|
| E-T1 (§6.4) | **CONFIRMED** | `pipeline.ts:170-171` passes the **entire** shortlist as options when the band is `confirm`. The band is decided on `top.score` alone (`score.ts:1213`); rows 2–5 have **no score floor whatsoever**. The five unrelated Jerusalem bakeries are literally `shortlist.slice(0,5)`. Fix: cut options to rows within a score band of the top — `branchGuard.rivalScoreBand` already exists as a notion. Re-run the 44-case golden file. **0 provider calls** |
| E-T2 (§6.1) | **SUSPECTED** | Nothing dedupes two candidates that resolve to *one venue*. `plausibility.ts:283-289` dedupes on normalised raw name only; the survivor resolves independently, one landing as Google and one as `llm_guess`, and `resolve_place`'s 75 m + `name_key` guard does not merge them. Two saveable cards from one video. Needs the stored extraction plus both resolution rows for that import before building |
| E-T3 (§6.2) | **CONFIRMED rule, wrong for this shape** | `@The Miners Coffee` is a tagged *business*, not a creator handle. Two independent barriers drop it: `prompt.ts:149` (*"handles (@username) … never a place, no exception"*) and the hard gate at `plausibility.ts:85-90`. A prompt-only fix is insufficient. This revises a real ruling — `09-extraction-and-resolution.md` §5.2, written before business tags were considered |
| E-T4 (§2.7) | — | Lighten `From the caption` / `From the map data` / `WHICH ONE IS IT?`. `candidate-card.tsx`, `src/ui/import/candidate-resolution-view.ts` |

**Scope:** `src/domain/extraction/**`, `src/domain/import/**`, `src/integrations/llm/prompt.ts`,
`src/app/import/screens/review/**`, `src/ui/import/**`.

### Lane G — Sources and collections · `nextjs-architect` · **NOW**

Covers **§5.1, §8.1, §8.2, §8.3**. **None of these needs a migration.**

| Task | Detail |
|---|---|
| G-T1 (§5.1) | **No data is lost.** `saved_place_sources` is a proper many-to-many and `save_place` inserts the second link with `on conflict do nothing` — both rows persist. The collapse is `get-spots.ts:151 earliestSource()`, which takes `linked[0]`. So the card shows the *earliest* source, not the latest; "keeps only the latest" is a symptom description, not the mechanism. `Spot.source` becomes `sources[]`. **Own library only** — showing the source list to a collection peer is a new RLS policy that `0024` explicitly refused, and that is a separate, security-vetoed migration |
| G-T2 (§8.1) | Already in the schema and already read: `collection_items.added_by`, pinned to `auth.uid()` by the insert policy, joined to `profiles.display_name` in `get-collections.ts:206-208`. Client-side filter only |
| G-T3 (§8.2) | `.in('id', ids)` under existing RLS gives partial-success counts for free; rows that are not yours match zero at the database. **Keep the two removal semantics distinct** — bulk in Places is the irreversible delete, bulk in Collections is the reversible unlink. One control must never do both |
| G-T4 (§8.3) | Purely client-side: add `text` alongside `url` in the share payload. Must not embed anything the recipient is not yet entitled to beyond what `preview_collection_invite` already discloses |

### Lane F — Mobile fit · `design-system-frontend` · **IF TIME, after Lane B**

Covers **§7.1, §7.2, §7.3**. Sequenced after B because both touch the `--floating-bar` padding
contract in `place-sheet.tsx:1949-1956`.

- **§7.1** is most likely `--floating-bar` being unset on one host rather than a redesign — the
  padding contract exists; the popover arm at `:2016` is the suspect.
- **§7.2** shrinking the import loading screen **reverses a measurement**: `rail-screen.tsx:136-157`
  records that the pre-fix layout had a 174 px hole and today's three ~71 px gaps are the repair.
  Shrink and re-measure at 390×844; do not delete the spacers.
- **§7.3** the compact profile popover concept is liked and stays; it needs mobile spacing and, from
  round 5's open finding, a focus trap and Escape.

---

## 3. Deferred, with reasons

| Item | Why |
|---|---|
| **§1.1** mixed he/en baseline **on the map** | The rows half is a small line-height fix and rides in Lane B. The map half is **structural**: Hebrew glyphs come from CARTO's Positron PBFs in a Latin-metric font stack, so mixed runs get different baselines. Fixing it means a glyph source or an explicit stack — M–L, and it is cosmetic. The RTL audit already confirms mixed-run *ordering* is correct |
| **§1.6 / §11.1** unify Places and Collections place detail | Correct and real — it is the difference between one product and two screens that both show places. But it is **L**, and it must come *after* Lane B or it unifies onto a card that is about to change. Schedule immediately post-submission |
| **§6.3** TikTok recognises nothing | Cannot be diagnosed without reading that caption. Three different causes share this screen, and the most likely is the modal one: the caption names no place. Engine recall is already measured at 10/10 on what captions *contain*. The lever is transcripts (40%→80%, measured) or the unplaced-mentions surface — **a product decision, not a code fix** |
| **§6.5** address resolves, venue does not | **CONFIRMED mechanism:** `place-resolver.ts:425-428` sends text + city only; `addressHint` is never sent to Google and is used only to score what comes back. We never ask "what business is at this address". The fix needs a second provider call shape at **2 Google calls per candidate against a 100/day cap** — a cost decision, and not one to take four days out |
| **§9.1** location prompt after login | Small, but it is a permission prompt on first run and it changes the onboarding shape. Post-submission |
| **§9.2** Google sign-in / email verification | The owner already marks this as a consideration, not a requirement. A new auth provider four days from submission trades a working login page for risk. **Recommend: keep email/password, say so in the deck** |
| **§10.1** natural-language search | Explicitly optional in the feedback. It is a feature, not a fix, and it competes with the deck |
| **§12.x** everything liked | Sorting, the compact profile, active-place emphasis, dark mode, the Places/Collections tabs, the login page, the crumb mascot: **preserved**. Each lane's acceptance names the ones it could plausibly break |

**Still owed for submission and not in any lane above:** the **10–15 minute presentation deck**
(M11, M12 item 10). `docs/presentation-outline.md` is 207 lines of outline, not a deck. Every other
graded artefact now exists — including `security.md`, which reports COMPLETE and closes its twelve
owed items, so `03-university-requirements.md`'s "M9 OUTSTANDING" row is stale and should be
corrected.

---

## 4. Decisions only the owner can make

Per `working-agreement.md` §7. Everything else in this plan is the builder's call and is not waiting
on an answer.

1. **§4.1 — fly-to when a pin is tapped.** This reverses a written rule (*"tapping a pin must not
   move the camera under the finger that tapped it"*) and adds a ninth camera mover. Real
   trade-off: consistency with the list versus the map jumping under your thumb on mobile.
   *Recommendation: a gentle ease that keeps the tapped pin under the finger, not a full re-frame.*
2. **§1.4 — the Been / Not-been-yet control.** Today's single-control model — one control, press the
   pressed one to clear — was chosen deliberately to reach the 44 px touch floor, and it is what
   makes the three states hard to tell apart. Replacing it means either giving the filter more room
   in a row that is already the density complaint of §1.3, or moving it out of that row entirely.
   Both are legitimate; they are different products. *Recommendation: `ux-interaction` specs both,
   the owner picks.* The words **Been** / **Not been yet** stay — they are ratified and they are not
   what the feedback is about.
3. **§1.3 — a dropdown would cost the category colour system.** *Recommendation: compact trigger
   opening the existing chips, keeping the colours.* Confirm that is acceptable.
4. **§6.5 — spend 2 Google calls per candidate to turn an address into a business?** Against a
   100/day cap. *Recommendation: not before submission.*
5. **§9.2 — auth method.** *Recommendation: no change before 6 September.*

---

## 5. Sequencing

```
        ┌──────────────────────────────────────────────────────────────┐
Wave 1  │  B place card · C filter row · D map · E import · G sources   │  ← starts now
        │  A geography (adapter + presentation; backfill held)          │
        └───────────────────────────────┬──────────────────────────────┘
                                        │  orchestrator commits each scope as it lands
Wave 2  ────────────────────────────────►  F mobile fit · A's backfill · the deck
Lane 0  ────────────── alongside, whenever a lane is between waves ──────►  #109 green and merged
Post-submission ────────────────────────►  §1.6/§11.1 unification · §1.1 map glyphs · §6.5 · §9.1 · §10.1
```

**Wave 1 write scopes, pairwise disjoint:**

| Lane | Owns, exclusively |
|---|---|
| A | `src/integrations/google/**`, `src/domain/places/**`, `src/ui/place/library-summary.ts`, `src/app/profile/_lib/**` |
| B | `src/components/sheet/place-sheet.tsx`, `saved-place-edits.tsx`, `visit-state.tsx`, `place-desktop-panel.tsx`, `src/ui/place/location-certainty.ts` |
| C | `src/components/sheet/category-filter-bar.tsx`, `src/ui/place/visit-state.ts` |
| D | `src/components/map/**`, `src/app/map/map-page-client.tsx` |
| E | `src/domain/extraction/**`, `src/domain/import/**`, `src/integrations/llm/prompt.ts`, `src/app/import/**`, `src/ui/import/**` |
| G | `src/app/map/_lib/get-spots.ts`, `src/app/actions/**`, `src/components/collections/**` |

Exclusive resources: **migration `0038` → Lane A, and A's backfill waits for wave 2** because the
local container is behind the schema on disk and a backfill cannot be verified against the wrong
schema; **the local database catch-up → orchestrator only, between waves** (world-stopping, and no
lane may run `db:reset`, `supabase start|stop` or `npm install` while a peer is live); **provider
quota → no lane spends it without a ruling on §6.5**.

**Held pending an owner decision, and the lane proceeds without them:** D-T3 (fly-to on pin tap) and
C-T2's chosen shape. Neither blocks the rest of its lane.

## 6. The bar for calling any of this done

`working-agreement.md` §2, unchanged. A lane is done when **a person did the thing in a browser** at
both breakpoints — not when a suite is green, and not on the report of the agent that built it.
Every claim names the **commit** it was measured at, never "the working tree": three other sessions
are live on this machine right now and the tree proves nothing about any one lane.

`qa-reliability` verifies Lanes A, B and D independently. The agent that built a thing is never the
sole source of evidence that it works.
