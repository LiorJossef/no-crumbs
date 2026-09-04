# Feedback round 4 — the overnight run plan

**Source of truth: `NO_CRUMBS_PRODUCT_FEEDBACK_NEW.md` (owner, 2026-09-03) and nothing else.**
Base commit `3fb628b` on `no-crumbs-implementation`. Submission 6 September.
**Written for an unattended overnight session starting ~22:30 on 2026-09-03, handing back at ~07:00.**

Round 3's work plan is **retired**. `docs/current-state.md` is background only; its task list is
stale ("near me" is built, CI is out of scope, the graded artefacts are not this plan's business).

---

## 0. What "overnight" changes

The owner is asleep. That is the single biggest constraint in this document, and it changes three
things:

1. **Nothing may block on a question.** Every decision that could stop a lane has a written default
   in §1.3. A lane that meets a decision with no default **stops that lane and moves on** — it does
   not guess, and it does not wake anybody. The unanswered question goes on the morning list.
2. **Recoverability beats coverage.** A night that lands four solid lanes and parks three is a good
   night. A night that lands seven half-finished lanes and a dirty tree is a bad one, because the
   owner's next three days are spent untangling it rather than building.
3. **The morning artefact is part of the work, not a write-up of it.** The run is judged on what
   the owner can see at 07:00: a clean tree, atomic commits, screenshots at both breakpoints, and a
   short honest list of what is done, what is parked and why.

### 0.1 Hard stops — the run ends here regardless of progress

- **06:00** — no new lane starts, no new agent is dispatched. Finish, verify, commit.
- **06:30** — everything in flight is either committed or reverted out of the tree. Nothing
  half-written is left behind.
- **07:00** — the handoff exists and the branch is pushed.

### 0.2 Absolute prohibitions for this run

- **No merge, no PR landing, no touching `main`.** All work stays on `no-crumbs-implementation`.
- **No migrations.** The local database is 13 behind disk; a lane that needs a schema change is
  parked with a written reason. `db:reset` is never run.
- **No `git stash`, no `reset`, no `clean`, no `restore`.** The repo carries owner-owned stashes and
  an owner-owned dirty tree.
- **Do not touch the uncommitted import-timeout work** — `src/app/api/imports/probe/route.ts`,
  `src/app/api/imports/source-preview/route.ts`, `src/app/api/imports/_lib/source-budgets.ts`. It
  stays exactly as dirty as it is now, and it must be that way at 07:00 too.
- **No unrequested extras.** Every defect the owner caught in the last round was something nobody
  asked for that an agent was confident about. If it is not written in the feedback file, it goes on
  the morning list instead of into a commit.

---

## 1. Standing constraints, binding on every lane

1. **Out of scope entirely:** CI, GitHub Actions, submission artefacts, the presentation deck, the
   migration ladder, anything not written in the feedback file.
2. **The dev server is this checkout's own, and tonight it is `:3477`** (PID 46504, cwd
   `/Users/lioryossef/Projects/P-002`, verified). The `:3411` server from earlier tonight is dead,
   and `next dev` refuses to start a second instance for the same project, so there is exactly one.
   **Port 3000 is a different working copy serving stale code** — a measurement taken there is void.
3. **Owner ruling on the place card, closed:** TikTok and Google Maps stay **explicit and
   labelled**. Not dissolved into the address line, not reduced to a clickable creator name. Change
   the weight, keep the words. The advisory spec is superseded wherever it disagrees.
4. **§8 of the feedback is a preserve list and a regression checklist:** place sorting · the compact
   profile popover · selected-place emphasis/deemphasis on the map · dark mode · the
   `Places`/`Collections` tabs · the login page · the crumb mascot. Breaking one of these fails the
   lane even if the lane's own item passed.
5. **Both breakpoints, every lane** — 390×844 and 1280×900, light and dark. The orchestrator opens
   the app and looks before anything is committed. An agent's self-report is not evidence.
6. **Write scopes are pairwise disjoint inside a wave.** One lane, one file set, one commit per
   coherent change.

### 1.2 Exclusive resources — only one holder at a time

| Resource | Rule |
|---|---|
| The dev server on `:3411` | Started once in wave 0. Agents drive it; no agent restarts it without saying so. |
| The local Supabase | **One writer at a time.** Lane E and lane D read; only the orchestrator's own verification mutates rows, and every mutation is named in the handoff. Last round's QA pass silently rotated a live share invite — that must not repeat unannounced. |
| Google Places quota | 100/day. Lane E's six links are the authorised spend. Nothing else. |
| LLM extraction spend | Lane E only, six links, one pass each unless a fix needs a re-run. |

### 1.3 Pre-authorised defaults — so no lane waits for the owner

| Situation | The default, decided now |
|---|---|
| `Been here` under-reads as the card's one act at trigger paint | Step the size up (`h-8` → `h-9` → `h-10`), never restore the bespoke border. Stop at the first step that reads, and say which. |
| The share message copy needs a decision | Pick one line, in `voice-and-vocabulary.md`'s voice, and ship it. One version, not three. Note it for review. |
| A geography fix would require changing the join rule | **Stop.** Write the finding, ship nothing. Three fixes in that family are measured-and-rejected. |
| An extraction fix would raise confidence on an uncertain match | Don't. Feedback 6.4 asks for uncertainty to be shown honestly. A confident wrong place is the worse outcome. |
| A lane needs a migration | Park it, with the migration written out but not applied. |
| A feedback item turns out to be already fixed | Record it with evidence. Do not invent adjacent work to fill the lane. |
| A lane finds a real bug outside its own item | Morning list. Only fix it inside the run if it blocks the lane. |
| A lane is churning — two attempts, no coherent result | Stop at attempt two, revert to the last good state, park it with what was learned. The filter-row lane burned a session this way. |
| Tests fail that were already failing at `3fb628b` | Inherited, not yours. Record the count, do not "fix" them. |

---

## 2. The lanes

### Lane A — the place card (owner priority 1) · the night's biggest lane
**Feedback 2.1, 2.2.** `design-system-frontend` builds, `qa-reliability` verifies.

The advisory spec `docs/ux-place-card-design-2026-09-03.md` is **unapproved**, and it is used as a
diagnosis, not a licence. What it gets right: the card speaks eleven visual vocabularies and gives
three different answers to "what does editing look like here" — commit with a mint word, commit with
a button pair, or leave the card entirely. That is the "patches" the owner is seeing. What it must
not do is touch the TikTok and Google Maps labels (constraint 3).

- **A0 — structural, blocks A1–A3.** `PlaceDetail` publishes `--sheet-content-height` from
  `STOP_TO_CONTENT_HEIGHT[stop]`, and gains an optional `onPanelOpen`. Scope: `place-sheet.tsx`.
  Lands first, own commit, separable hand.
- **A1 — category row.** The grey chip radiogroup and the 11 px mint `Done` both go; the row becomes
  a value trigger that opens the house inline panel and commits on choose.
- **A2 — collections in place.** `CollectionPicker` stops replacing the whole detail pane.
- **A3 — the note.** Same panel; the bordered textarea loses its border. It is the only box on a
  card that otherwise draws none.
- **A4 — `Been here`.** Onto the house trigger paint. The control the owner named by hand.
- **A5 — one system across surfaces (2.1).** The map's floating card and the Collections side panel
  may stay different shells; their contents, vocabulary and interactions must be one system.

**Ordering hazard:** never ship A1 without A3. Half the card committing on choose and half with a
mint word is worse than today.
**Concurrency:** A1–A4 are almost all `saved-place-edits.tsx` — one hand, four commits. A0 and A5
run beside it.
**Night rule:** A1→A2→A3→A4 in that order, and each one leaves the card coherent if the next never
lands. At 06:00 the card must be in one of those five states, never between two.

### Lane B — the share page (owner priority 2)
**Feedback 3.1, 3.2.** `design-system-frontend`, copy ruled by `product-lead`.
Scope: `src/components/collections/share-panel.tsx` and its strings.

- **B1** — cut it down. The privacy paragraph, `Replace link`, `Turn the link off`, the contributor
  list and the role control all arrive at one weight. Keep every fact, spend far less text. `3fb628b`
  started this; B1 is the second pass on the same surface, not a restart.
- **B2** — copying the link copies a **friendly message with it**. The owner's example, not to be
  pasted verbatim: *"Join my collection on No Crumbs"*.

**Night rule:** B mutates invites if it is driven end to end. Use a **scratch collection created for
the run**, not `tel aviv food`, and delete it before the handoff.

### Lane C — profile and account settings (owner priority 3)
**Feedback 7.1** (names Settings and Profile explicitly), **8.2** (the compact popover is liked, its
mobile presentation is not). `ux-interaction` rules, `design-system-frontend` builds.
Scope: `src/app/profile/*`, `src/app/account/*`, `nav/profile-menu.tsx`, `nav/account-chip.tsx`.

Preserve the compact overlay. Fix the mobile presentation. Bring both surfaces onto the same
materials the card and the share panel use after A and B — same rows, triggers, labels, commit pair.
**Boundary with Lane D:** C owns presentation and never touches the counting.

### Lane D — geography grouping
**Feedback 1.1, 1.2, 1.3.** `maps-geospatial`, verified by `qa-reliability`.
Scope: `domain/places/clusters.ts`, `ui/place/active-area.ts`, `ui/place/library-summary.ts`,
`app/profile/_lib/profile-stats.ts`.

Two concrete failures: `חיפה` appears as a **fourth top-level "where you save" row** beside Israel,
United Kingdom and Czechia; and four places all in Prague surface as "4 places in this area" rather
than as Prague. Both look like **labelling and country attribution**, not the join rule.

**Do not re-propose the join rule** (2 km OR 50 km + same normalised locality). Start from why a
cluster fails to acquire a country, and why a Prague cluster fails to acquire its name. Diagnose
against real rows and name them. If the answer is in the data rather than the code — a missing
`country_code` on the Haifa row — say so and park the backfill; **no backfill without reviewing the
rows**, and no migration tonight.

### Lane E — extraction and sources
**Feedback 4.1, 6.1–6.6.** `ai-extraction`, `social-integration`, `supabase-database` for E1.
Scope: the extraction prompt and pipeline plus the resolver's candidate handling — **never** the
three probe/timeout files.

- **E1 — 4.1**, two TikToks for one place keeps only the latest. A multi-source data layer shipped in
  wave 1 (`4bc04d0`) and was never used in anger. Verify what actually persists before assuming this
  is unbuilt.
- **E2 — the six links.** `ZSVKwUj9y` (a strong Google address result competes with a caption
  result), `ZSVKTFV6L` (4 named, 3 detected; the fourth is a `@tag`), `ZSVKwLgQY` (nothing
  recognised), `ZSVEETdaB` (unconfident candidate list), `ZSVKoKjty` (address resolves, venue does
  not), `ZSqeRdPbK` (name only, no address).

**Measure all six first, in one pass, and report what the pipeline actually saw** — caption text,
extraction output, candidate list — before proposing any change. Two of the six may share one cause;
that is worth knowing before six separate fixes get written.
**Night rule:** at most **one** prompt/pipeline change tonight, chosen for how many of the six it
moves, with the golden file re-run. Extraction changes are the easiest way to regress 44 passing
cases while asleep.

### Lane F — verify-first, and it runs first
**Feedback 4.2, 5.1, 5.2**, all three marked `verify` by the tester. `qa-reliability` on `:3477` at
390×844.

- **F1 — 4.2** stale map selection: choose from the list, then choose a different pin. Does the first
  stay selected?
- **F2 — 5.1** mobile spacing between map, place content and the bottom nav.
- **F3 — 5.2** the import loading screen and the "No places in this one." recovery screen on a narrow
  viewport. The loading screen lost 237 px on 2026-09-02, so measure before treating it as open.

Output is a verdict per item — real / already fixed / partial — with a measurement. Real findings
fold into lane A or a follow-up commit; **this lane fixes nothing itself.**

### Lane G — copy and small consistency
**Feedback 7.2, 7.5.** `design-system-frontend`, copy ruled by `product-lead`.

- **G1** — `at least 6 char` and its neighbours become normal product copy. The validation rule is
  unchanged; only the wording.
- **G2** — shorten overlong UI text and swap recognisable actions for icons where that is genuinely
  lighter. Bounded to a named list of strings agreed up front — **not** an icon system, and not a
  sweep of the whole product at 03:00.

### Lane H — deferred, by owner ruling 2026-09-03
**Feedback 7.3** (ask for location permission shortly after login) and **7.4** (natural-language
search). **Deferred until every other lane is finished.** If A–G are genuinely closed and verified
before the 06:00 hard stop, 7.3 may be started; **7.4 is not started tonight** — it is new capability
three days from submission and it cannot be verified in the time left.

---

## 3. The night's shape

| | Window | What runs |
|---|---|---|
| **Wave 0** | 22:30–23:00 | Preflight: dev server confirmed on `:3477`, tree state recorded, baseline test count and `tsc` count taken at `3fb628b`, baseline screenshots of the card, the share panel and the profile at both breakpoints. **Without the baseline, nothing later can be shown to be an improvement.** |
| **Wave 1** | 23:00–01:00 | **F** (verdicts) · **D** (diagnosis, read-only) · **E2** (six measurements) · **A0** (`place-sheet.tsx`) · **B** (`share-panel.tsx`) · **C** (ruling, read-only). Two builds, four investigations, disjoint. |
| **Checkpoint 1** | 01:00–01:30 | I read every result, look at A0 and B in the browser at both breakpoints, commit what stands, and **re-cut wave 2 against what wave 1 actually found**. Lanes that came back empty do not get filled with invented work. |
| **Wave 2** | 01:30–04:30 | **A1–A4** (one hand) · **A5** · **C** (build) · **D** (fix) · **E** (one change) · **G**. |
| **Checkpoint 2** | 04:30–05:15 | Integrate, review each scope in the browser, commit each as its own commit. |
| **Wave 3** | 05:15–06:00 | `qa-reliability` verifies every wave-2 commit **against its commit**, at both breakpoints in both themes, plus the §8 preserve checklist end to end. |
| **Close** | 06:00–07:00 | Hard stop on new work. Fix or revert anything wave 3 broke, clean the scratch collection, confirm the three import files are still untouched and dirty, push, write the handoff. |

**If a wave runs long, the wave that gets cut is wave 2's tail — G first, then E, then A5.** Lanes
A, B and C are the owner's three stated priorities and are the last things to be cut.

---

## 4. What the owner finds at 07:00

1. **A clean tree** — except the three import files, still dirty, still untouched.
2. **One commit per coherent change**, each with the *why* in the body, on
   `no-crumbs-implementation`, pushed. Nothing merged, `main` untouched.
3. **A handoff** naming, per lane: shipped / parked / already-fixed, what was verified and **how**,
   and what it cost. Parked lanes say what was learned so the next attempt does not restart from
   zero.
4. **Before/after screenshots** at 390×844 and 1280×900, light and dark, for the card, the share
   panel and the profile.
5. **Every database mutation the run made**, named — including anything created for testing and
   whether it was cleaned up.
6. **The morning list**: decisions with no default, bugs found outside the lanes, and anything an
   agent wanted to build that nobody asked for.

## 5. The done bar

Implemented is not done. Run the app on `:3477`, use the feature, read the persisted rows where a
write is involved, check both breakpoints in both themes, and say what was verified and how.
**The agent that built a thing is never the sole evidence that it works**, and evidence names the
**commit** it was taken against — under concurrency the working tree holds several hands' work and
proves nothing about any one of them.
