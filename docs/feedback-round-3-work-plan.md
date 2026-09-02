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

> **Correction, 2026-09-02 — this plan misread §1.3 and so did the lane's write scope.** The chips
> the owner photographed are **tags, not categories**. `ProductCategory` aliases `PrimaryCategory`
> — three values — so `CategoryFilterBar` can draw at most four controls, ever. `Bakery`, `Asian`,
> `Italian`, `Brunch`, `Mediterranean`, `Middle Eastern`, `Desserts`, `Japanese`,
> `SpecialtyCoffee` all come from `tagFacets`, capped at 12 with **no floor underneath**, and a
> length cap cannot tell a useful tag from a unique one. Round 5's own evidence says so: 15 chips,
> **12 of them singletons**.
>
> **Fixed directly, `8fd2e27`:** `MIN_TAG_FACET_COUNT = 2` in `src/ui/place/tag-filter.ts`, with the
> active tag still pinned. Six existing tests were built on singleton fixtures while asserting
> unrelated properties; they got real fixtures rather than weakened assertions. Not yet seen in a
> browser — `place-sheet.tsx` is mid-flight in Lane B, so the row will be measured at wave close.
>
> Lane C's remaining half is therefore the **visit filter**, plus a compact trigger for the (small)
> category row.

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

> **Rewritten 2026-09-02, after wave 1 ran.** The first version of this section is preserved in the
> history at `cbab6b5`. It described two waves and six lanes; what actually ran was six lanes, four
> unplanned follow-up lanes, and one wave-2 lane pulled forward. Recording that here rather than
> leaving the plan describing a sequence nobody followed — a plan that disagrees with the branch is
> worse than no plan, because it is the document the next session trusts.

### What changed against the first version

| Change | Why |
|---|---|
| **Lane 0 dropped** | Owner ruling: the product is verified on localhost, and CI is not being worked on |
| **F pulled forward into wave 1** | B2 measured `BottomNav` as `position: fixed` over y 776–844 while the sheet's column runs to 846 — the last ~70 px of the place card is *behind* the nav and unreachable. That is §7.1, and it is most of the remaining zero-scroll deficit, so it stopped being polish |
| **H added** (already-saved notice) | Lane E tested its own §6.1 hypothesis against the rows and **refuted it**. The cause is re-importing one link — one video holds 16 imports and 18 saved places — which is a different feature, not a fix inside E |
| **B2, H2 added** | Both close what their parent lane left open, and both found a second defect by looking at a screen: the true fold under the nav, and a collapsed layout that renders no checkbox under a sentence naming one |

### Wave 1 — done, except two lanes

| Lane | State | What is left |
|---|---|---|
| A geography | **complete** | A-T2 backfill held to wave 2 by design; A-T4 refuted and no fix built for a mechanism that would not reproduce |
| B place card | **complete** | the half-stop deficit passed to F, where it belongs |
| D map | **complete** | D-T3 (fly-to) awaits an owner decision |
| E import | **complete** | except the weight of `From the caption` / `From the map data` — escalated, because the shorter pair and the restyle each change something a test pins |
| **C filter row** | **incomplete** | the tag floor shipped (`8fd2e27`, the larger half). **The category chip trigger and the Been filter are both unbuilt** |
| **G sources** | **incomplete** | **all-sources on the place card**, and **multi-select in Places**. `deleteSavedPlaces` is written, tested and has zero callers |

**Both incomplete lanes failed the same way, and it is the way `agent-guardrails.md` §8 rule 31
predicts.** G's two gaps are not unfinished work — they are the render halves of features whose data
halves shipped, blocked because Lane B held `place-sheet.tsx` for the whole wave. Disjoint write
scopes bought concurrency and paid for it in completeness, exactly as that rule says. Both files are
unowned now, so wave 2 closes them first.

### Wave 2 — UI first, on the owner's instruction

> **Owner ruling, 2026-09-02: "change the planning to fix UI problems first, like the tags and
> stuff like that."** The previous ordering put the orphaned halves first because they were cheap,
> then the data backfill, then the mobile loading screen. That ordering was about *tidiness of the
> engineering* — closing what wave 1 split — and it buried the things the owner actually looks at.
> Every item below is reachable from the screen; the data and engine work moves behind it.

```
Wave 2-0  *** FIRST, AND IT IS A REGRESSION WE SHIPPED ***
         · THE FILTERS BREAK SCROLLING ON MOBILE. Owner, 2026-09-02:
           "its so bad on mobile those filters you cant even scroll!!!!!!!!!"
           Deferred to wave 2 on the owner's instruction, not fixed on the spot.
           Undiagnosed - reproduce at 390x844 on the real library first.
           Prime suspect is `cbfbb67`, the mobile inline disclosure: the panel is
           content rather than an overlay, so it may be sizing the scroll column
           out, or `data-vaul-no-drag` may be fighting the drawer's drag listener.
           Verify with TOUCH emulation - desktop was verified working, so a mouse
           check will not see it. Full note: handoff-2026-09-02-waves.md.

Wave 2a  THE FILTER AND TAG SURFACE — the sidebar the owner photographed
         · the category chip trigger (§1.3's remaining half)
         · the Been / Not been yet interaction (§1.4) — spec is written and costed
         · anything else on that row that reads badly once those two land

Wave 2b  THE SURFACES AROUND IT
         · the place card's text — HELD FROM 2a only because the filter lane holds those
           files. The DISHES MENTIONED / CATEGORY / YOUR NOTE kickers and the
           ` · from the TikTok video` clause.
           *** THE DATE LINES ARE NOT ON THIS LIST. Owner ruling 2026-09-02: "DO NOT remove
           the saved date/time information. I want to keep seeing when I saved a place."
           `Saved 3 days ago` (per row), `Saved on …` and `Been on …` (the card) all STAY.
           This withdrew the audit's own highest-ranked item; see ux-overwhelm-audit §7.1. ***
         · the peek row's spacing at the sheet's lowest stop  ← moved here 2026-09-02, owner
         · every TikTok source on the place card (§5.1's render half)
         · multi-select and bulk delete in Places (§8.2's render half)
         · [DONE 2026-09-02, cede7b9] the re-import notice's tint
         · [DONE 2026-09-02, edab786] §7.2 the import loading screen, 237px → 0

Wave 2c  DATA AND ENGINE, once the screen is right
         · A's backfill (migration 0038), after the local container is brought up to disk
         · wiring repoint_saved_place — it exists, is security-reviewed, has zero callers,
           and is the honest fix for the llm_guess → Google upgrade (H-T3)

Held     D-T3 fly-to · the Category control's shape — owner decisions, §4
         (C-T2's shape and E-T4's label weight are RESOLVED — see §5.1)
Post-submission   §1.6/§11.1 unification · §1.1 map glyphs · §6.5 · §9.1 · §10.1

NOT IN ANY LANE, AND THE HIGHEST-RISK OPEN ITEM ON THE BOARD
         · the 10–15 minute presentation deck (M11, M12 item 10). Submission is
           6 September. docs/presentation-outline.md is 207 lines of outline, not a deck.
           Every other graded artefact now exists. The UI-first ordering keeps burying
           this because it is not a UI problem; that is the ordering working as
           instructed, not the item losing importance.
         · the local container is 13 migrations behind the schema on disk. Any local
           verification of saves, collections or tags is measured against the wrong
           schema, and 2c's backfill cannot start until it is caught up. The clean
           repair destroys the owner's local saves — orchestrator only, on a specific
           instruction, never as a side effect.
```

### 5.1 Owner decisions taken on 2026-09-02, during the session

Recorded here because they close items §4 listed as open, and because two of them reverse
instructions this plan and its spec gave the builder.

| Decision | Ruling |
|---|---|
| **§1.3 / §1.4 — the filter row's shape** | **Neither Option A nor Option B of `ux-visit-filter-and-chip-density-2026-09-02.md`.** The owner chose the most aggressive of three costed options: **all three control rows collapse behind ONE `Filter` trigger** opening an inline panel. Measured cause: at 375×812 on the owner's own library the header drew **16 pills in three rows** and the first place row began at **y370 — 46% of the viewport**. Note the spec's §7 recommended Option B; it was not chosen |
| **The panel's internals** | Three sections, each a **deliberately different control type**, because the audit's core finding is that one 44px pill serves six unrelated meanings. **Been** → segmented control (pick one). **Tags** → a **searchable multi-select list**, owner's words: "tags from a multi select list with a serch". **Category** → **UNDECIDED**, owner: "for catagory im not sure yet"; left as today's coloured chips, which is the zero-change option and preserves the colour lock at `facelift-plan.md:144`, and built as a swappable sibling component |
| **`MAX_TAG_FACETS` 12 → 6** | **REVERSED before it shipped.** A capped chip row needed a cap; a searchable scrolling list does not, and a cap would hide tags the user can no longer reach by searching. `MIN_TAG_FACET_COUNT = 2` (shipped `8fd2e27`) is likewise pointless here and **cut zero chips on the owner's library** — all ten of its tags have a count ≥ 2. The length cap, not the count floor, was doing the work |
| **The sort control** | Owner, twice: *"the look of sorting doesnt look good, it doesnt even tells you its a sort by"*, then *"I want to change the UI itself — the current Filter + Sort controls feel too large, heavy, and visually awkward."* Two defects: it **names no axis** (`A–Z` reads as a filter for names starting A–Z), and it is **byte-identical to a category chip with one chip always pressed**, because sort always has a current value — against the written rule at `category-filter-bar.tsx:37-44` that a pressed chip means *this is narrowing your library*. Resolved as: `Sort: Recently saved ▾`, and **not chip-shaped** |
| **Visual weight of both triggers** | The resting control drops to **~32px painted inside a 44px hit area** — the touch floor argued at `category-filter-bar.tsx:16-23` is preserved by decoupling paint from target, **not** by shrinking `min-h-11`. `font-bold` → `font-medium`; the resting fill stops being mint. Active states stay clearly distinguishable. `document.elementFromPoint` verification is mandatory for this change |
| **§2.7 / E-T4 — label weight** | **Resolved, shipped `78a4584`.** Style only, no renames |
| **The sign-in page** | Owner, unprompted: *"dont change sign in page."* Out of scope for every lane |
| **Menus, three separate ones** | Owner reversed the single-`Filter` trigger: *"maybe we should have a dropdown for each of the filters instead of having it in one place / cause they are not related / and a clear button."* Three triggers — `Been` · `Category` · `Tags` — plus a `Clear` that renders only when something is active |
| **A dropdown is a list, not a button wall** | Owner: *"I don't like the interaction pattern of opening a dropdown and then showing another group of large buttons inside it."* Each menu is compact menu rows (Base UI `Menu.RadioGroup` / `RadioItem`), ~40px of paint inside a 44px target, no fills or borders at rest. The category colour survives as a **dot**, not as a filled pill |
| **The tag list shows a check only when checked** | Owner, 2026-09-02: *"the checkmark on tags should be added only when they are checked."* No empty checkbox on every row. An unchecked tag row is its name and its count and nothing else; a checked one gains the indicator. This falls out of `Combobox.ItemIndicator`, which renders only for a selected item — so it is the library's default rather than something to build, and it is one more reason the hand-rolled checkbox list should go. **The affordance it removes** — an empty box saying "these are multi-select" — is carried instead by `Combobox.Chips` above the list, which shows what is already chosen. If the chips are not there, the affordance is genuinely lost, so the two ship together |
| **Selecting closes the menu** | Owner, 2026-09-02: *"maybe we should do that for one option select it will close the menu."* **Single-select menus — `Been`, `Category`, `Sort` — close on choose** and return focus to their trigger, which has just changed to show what was picked. **`Tags` does NOT close**, because it is multi-select and closing after each tag would make choosing three tags cost three round trips; it closes on `Clear`, on Escape, on its trigger, or on an outside press |
| **Mobile does not get a floating popup** | Owner: *"i think that on mobile the pop up doesnt feel good."* A floating layer inside a vaul drawer is a popup inside a popup, competes with the sheet's drag listener, and leaves a narrow menu stranded mid-screen. **Mobile = inline disclosure beneath the trigger row, pushing the list down. Desktop = anchored popover.** A deliberate breakpoint split |
| **Sort sits below the filters, on its own row** | Owner, 2026-09-02: *"leave the sort below the filters."* The header is two rows, deliberately, and this is no longer the row-wrap fallback it started as — it is the chosen layout: `[ Been ▾ ] [ Category ▾ ] [ Tags ▾ ] [ Clear ]` on the first row, `Sort: …` alone on the second. It also states the separation the whole redesign is about: the first row narrows the library, the second reorders it. Neither row may scroll horizontally |
| **`Clear` clears filters only, never sort** | Owner, 2026-09-02: *"i think the clear should affect filters only."* `Clear` resets `Been`, `Category` and `Tags`, and does not touch the sort order. Sort has no cleared state — there is always an order, so "clearing" it would silently mean "go back to `Recently saved`", which is a change disguised as an undo. `Clear` renders only when at least one filter is active, and it lives on the filter row, not the sort row |
| **Sort is a menu, not a toggle** | The orchestrator specified a two-state toggle after measuring only two options in the running app. **Wrong** — `place-order.ts` defines three: `recent` \| `nearest` \| `alpha`, and `Nearest` is offered only when a location fix is held, absent otherwise. Owner: *"Sort is not binary — there is also a Nearest option"*, then *"its ok as a select list / just should feel less goofy thats it."* The lesson: **the screen was showing a degraded state and it was read instead of the code** |

### 5.1a Owner rulings taken on 2026-09-02, evening session

| Decision | Ruling |
|---|---|
| **§4.1 / D-T3 — fly-to on pin tap** | **RULED FOR, and §4 item 1 is closed.** Owner: *"yes i think i want a fly to once you click on a pin"*, then the clarification that decides its shape: *"the fly to should work even if theres another place open and we click on another pin"*. So the trigger is a **change of selected place**, not selection from nothing. Built as camera mover 9, a recentre at the zoom already on screen rather than a re-frame (`5985d89`), with the dismissal path made explicit in `616ec93`. This uncovered the real blocker: MapLibre's `closeOnClick` meant one pin tap fired select-then-deselect, so **a pin tap was closing the open place instead of opening it** |
| **The country band's unnameable pill** | `Another area` → **`Other`**, and **temporary on the owner's own framing**: *"this item is actually a city in Israel, so it should eventually resolve to the correct city/area name instead of falling back to a generic Other label."* The copy change is only what makes the pill fit a phone (105 px against a 112 px budget); the fix is the geography backfill. Recorded at the constant so it is not mistaken for an answer (`ed6960c`) |
| **The TikTok player** | **Deferred to the end of the queue.** Owner: do not wire it up, do not remove it, no CSP changes, keep the external-TikTok behaviour unchanged. A partial wiring was reverted; the patch is kept rather than discarded. Note the CSP `frame-src` stays open in production for a frame nothing reaches — decide it *with* the player, not separately |
| **The place card** | Spec approved unread — owner: *"I'd rather react to the live screen than read the spec."* Standing watch-item for the build: **the 44 px pill band must not read bulky beside the quieter rows.** Paint is separable from target; do not shrink `min-h-11`. `docs/ux-place-card-unification-2026-09-02.md` §10 OQ-2 is closed — `--muted-foreground` at 11 px measures 5.37:1 light / 6.51:1 dark, so no ink is forked |
| **Process** | Owner, twice: deliver the lean implementation first, then fix. Evidence gathering was costing more than the fixes — land it, verify after |

---

### 5.2 Two claims in this plan that measurement refuted

- **"The re-import notice is ~230px."** It measured **120px** before any change, at both breakpoints. The tint was the loud part, not the size. Retinted to `bg-card-2`, 120 → 106px (`cede7b9`)
- **"Shorten the re-import notice's text."** Instructed by the orchestrator, **correctly refused by the builder**: `ux-overwhelm-audit-2026-09-02.md` §3d #6 records that making this notice quiet was already measured and failed, and the strings live in `domain/import/prior-saves.ts`, outside that lane. The sentences stand

**The peek row, moved rather than dropped.** At the sheet's lowest stop the visible strip is
`PEEK_PX` 128 minus the bar's 68 = **60 px holding 58 px of content** — handle 14 + a 44 px button —
so there are 2 px of slack and all of it sits at the bottom edge. There is no rebalancing available
inside 128: the button is already at the 44 px touch floor. `PEEK_PX` has to grow, and it is
mirrored in **four** places that cannot import one another — `sheet-geometry.ts:31` (the drag stop),
`query-rect.ts:47` (**the camera's bottom occlusion budget**, so it decides which pins the list
counts as visible), `globals.css:1649` (attribution clearance, a **licence condition**), and the row
itself. One lane must own all four, with `tests/unit/shell/sheet-geometry.test.ts` as its guard.

The peek padding also carries **no `env(safe-area-inset-bottom)`** while the bar's height is
`calc(68px + env(...))`, so on a notched phone the line sits under the bar by the whole inset. Fix
both in one change.

**Corrected while measuring this:** `current-state.md` open item 13 warns of a fifth, unmirrored
`128px` hard-coded in a Tailwind arbitrary value. **It is gone** — no `[128px]` anywhere in `src/`.
That item is stale, and it makes this change safer than the item implies: four mirrors, all named,
already pinned by a test.

**Why 2a is the filter row and not the orphaned halves.** The orphaned halves are still real and
still cheap — `deleteSavedPlaces` is written, tested and has zero callers — but they are features
the owner has not seen and therefore cannot be annoyed by. The chip row is 41% of the sidebar and is
the thing three separate reviews and the owner's own feedback all landed on. `8fd2e27` took the
larger half of it (the singleton tag floor); the category trigger and the visit filter are what is
left, and the visit filter needs `filter-places.ts` and `map-page-client.tsx`, both free now.

**Exclusive resources, unchanged:** migration `0038` → the backfill and nothing else; the local
database catch-up → orchestrator only, between waves; provider quota → unspent without a ruling
on §6.5.

## 6. The bar for calling any of this done

`working-agreement.md` §2, unchanged. A lane is done when **a person did the thing in a browser** at
both breakpoints — not when a suite is green, and not on the report of the agent that built it.
Every claim names the **commit** it was measured at, never "the working tree": three other sessions
are live on this machine right now and the tree proves nothing about any one lane.

`qa-reliability` verifies Lanes A, B and D independently. The agent that built a thing is never the
sole source of evidence that it works.
