# Product Specification

**Product:** a personal geographic recommendation library — "save the internet to your map"
**Course deliverable:** M2 (product specification), RUNI CS 2026 — *Internet Technologies*
**Version:** 1.0 · **Date:** 18 August 2026 · **Submission target:** 6 September 2026
**Scope contract:** [`00-project-charter.md`](00-project-charter.md) §4. This document restates that
contract in product language; where the two disagree, the charter wins.

### How to read the labels in this document

| Label | Meaning |
|---|---|
| **VERIFIED** | Tested against the real third party, evidence committed in `docs/evidence/` |
| **ASSUMED** | Researched, plausible, untested — design may not depend on it |
| **PENDING-D1** | Depends on the TikTok capability verdict being produced in [`04-tiktok-feasibility.md`](04-tiktok-feasibility.md). Stated here as a boundary to be filled in, deliberately not as a claim |
| **Estimate** | Our own reasoning or a single-user measurement, not market research |

Nothing in this specification is VERIFIED yet. That is a statement about the project's phase
(pre-implementation, by design), not a hedge.

---

## 1. The problem

People collect real-world recommendations inside TikTok. They save the post. What they actually
wanted was **the place**.

TikTok stores a save as a *video* in a reverse-chronological list. It does not store where the place
is, what kind of place it is, or what it was called. So the collection is complete and the retrieval
is broken — and retrieval is the only moment that matters:

- "I'm in this neighbourhood right now. What did I save near me?"
- "I land in Tokyo on Thursday. What do I already have there?"
- "I want dinner tonight and I don't want to scroll."

The user has already paid the cost of discovery and cannot get the value back out. **The problem is
retrieval, not storage.**

### 1.1 Why retrieval fails structurally

| Property the moment of intent needs | What a TikTok save actually offers |
|---|---|
| Geographic index ("near me", "in Tokyo") | Chronological order only |
| One entry per place | One entry per video; the same place may appear in several |
| Structured category ("coffee", "bar") | None |
| Text search over place names | Search over the platform's own signals, not over your saves as places |
| Durability independent of the platform | Data lives inside one app you do not control |

There is no filter, no map, and no way to ask a location question. The conversion from post to place
is work the platform never performs, so the user performs it in their head, from a grid of
thumbnails, at the worst possible moment.

### 1.2 The cost, quantified as honestly as we can

We will not cite market sizing we cannot support. What we can state is a bounded arithmetic
**estimate** of the retrieval cost, with its assumptions exposed:

- A regular TikTok food/travel saver accumulates on the order of 100–400 saved posts over a year
  (**Estimate**, from the project owner's own account and informal peer checks; n is small).
- A saved-list thumbnail does not reliably reveal the place name or the city, so answering "what did
  I save near me" requires *opening* candidate posts. At 10–20 seconds per post to open, read and
  judge (**Estimate**), checking even 15 candidates costs 2.5–5 minutes of active effort.
- The realistic outcome is worse than slow: the user abandons the search and picks somewhere they
  did not save. The saved recommendation had zero effect on the decision. **That is the real loss —
  not time, but a decision made without information the user already owned.**

Target state: the same question answered in **under 10 seconds**, by looking at a map, with no
scrolling and no recall required.

A measured baseline (the owner times themselves answering "what have I saved within 1km" from
TikTok's saved folder, n=1, recorded in `docs/evidence/`) is a cheap, honest task and is scheduled;
until it exists, the figures above stay labelled Estimate.

### 1.3 What is deliberately not the problem

Not discovery. The product never recommends a place the user did not save. There is no feed, no
ranking, no "places you might like". The scarce resource is not new recommendations — the user has
too many already — it is **access to the ones they chose**.

---

## 2. Users

**Primary user:** a person who regularly discovers restaurants, cafés, bars and attractions through
TikTok, saves them, and later fails to find them again.

Three profiles. These are usage patterns with distinct retrieval needs, not invented biographies.

| | **The home-city collector** | **The trip planner** | **The high-volume saver** |
|---|---|---|---|
| Behaviour | Saves places in the city they live in, a few per week | Saves in bursts before a trip to a city they do not know | Saves reflexively, dozens per month, across many cities |
| Retrieval question | "What did I save near where I am right now?" | "What do I have in this city, and what is walkable from my hotel?" | "Do I already have something here?" — and "did I already save this?" |
| Failure they hit today | Forgets a place exists while standing 200m from it | Rebuilds the whole list manually into notes or a map before travelling | Their saved list is unusable; volume destroyed it |
| Capability that serves them | 10 (near me), 9 (map) | 9 (map), 11 (search/filter), 5 (coordinates) | 8 (dedup), 11 (search), 4–6 (fast confident import) |
| Value of the product | Highest per-use | Highest per-trip | Highest in absolute terms; also our hardest quality test |

Cross-cutting truths for all three:

- **Mobile-first, and specifically mid-session.** The retrieval moment happens standing on a street,
  on a phone, possibly on a poor connection.
- **Import is the tax and retrieval is the reward.** Every second and every tap in the import flow is
  paid before any value is received. This is why import friction is the top quality attribute
  (Charter §2, corollary 1).
- **Their map starts empty and is therefore worthless.** See §7.6.

### 2.1 The anti-users

Stated so the boundary is testable, not to be dismissive:

| Not for | Why |
|---|---|
| People looking for new places to go | This is a retrieval tool over your own saves; it recommends nothing |
| Travel-itinerary planners (day-by-day, routing, bookings) | Out of scope in Charter §4; a different product |
| Creators, businesses, or anyone wanting an audience | No social graph, no public profiles, no sharing in V1 |
| Teams / couples building a shared list | Collaboration is post-V1; V1 maps are strictly private |
| Users who save on Instagram or YouTube instead of TikTok | V1 supports TikTok only, by decision, not by oversight (§8) |
| Users who save fewer than ~10 places | Below roughly 20 places a plain list beats a map (**ASSUMED**, risk A/B3) |

---

## 3. The customer

**In V1 the user and the customer are the same person.** There is no advertiser, no business
account, no third party buying access to the user's data or attention. The product's only obligation
is to the person whose map it is, which is also why the security posture is strict: private map,
row-level ownership enforced in the database, live location never persisted server-side.

**Future revenue path, in two sentences and then dropped.** The natural model is a paid tier gated on
volume and convenience — unlimited imports, more source platforms, export, and shared collections —
because the users who feel the pain most are the highest-volume savers. Nothing in V1 is designed to
monetise, no pricing is proposed, and no capability was added to this specification in order to make
a business case work.

---

## 4. Business value

The course requires business meaning (M1: save time, improve decisions, make a process efficient).
Each claim below is tied to the capability that delivers it and to how we would know it worked.

| # | Value claim | Delivered by capability | How it is evidenced |
|---|---|---|---|
| V1 | **Retrieval collapses from minutes of scrolling to seconds of looking.** The "what's near me" question becomes a glance | 9 (map), 10 (near me), 5 (coordinates) | Timed task: answer "what have I saved within 1km" in <10s with a populated map, vs the measured TikTok baseline (§1.2) |
| V2 | **Unstructured social saves become structured geographic data the user owns.** A video becomes a row: name, coordinates, category, provider id, source post | 3, 4, 5, 8 | For every saved place, all of: coordinates, category, and ≥1 source TikTok URL are present |
| V3 | **Better real-world decisions.** The recommendation the user deliberately saved is available at the moment of choosing, instead of being forgotten | 9, 10, 12 | Saved places are reachable at the decision moment on a phone; place detail answers "why did I save this" via the original post |
| V4 | **A persistent personal recommendation database, independent of chronology and independent of the platform.** Order stops being the organising principle; location becomes it | 8 (persistence + dedup), 1 (accounts), 13 (manual add) | The library survives independently of TikTok's saved list; the same physical place is one row regardless of how many posts referenced it |
| V5 | **The conversion cost drops to near zero.** The app does the post→place work the user would otherwise do by hand, and never asks the user to do it | 2, 3, 4, 6 | The user supplies exactly one input — a URL. No caption, no description, no transcript, ever (§5.1) |

V5 is the load-bearing one. If the user has to do the conversion, the product is a manual map with
extra steps, and V1–V4 are things they could already get from any note-taking app.

**Value dependency, stated plainly:** V5 and therefore V2/V3/V4 depend on the app being able to read
a public TikTok post server-side. That capability is **PENDING-D1**. This specification defines the
product around a capability boundary that [`04-tiktok-feasibility.md`](04-tiktok-feasibility.md)
fills in; it does not assume a level.

---

## 5. Software capabilities

The committed V1 list from Charter §4, restated as product capabilities, with why each exists and how
it is ranked. **Rank** drives the cut order in §8.

| # | Capability | Why this exists | Rank |
|---|---|---|---|
| 1 | **Accounts** — sign up / sign in (Supabase Auth) | The map is personal and private; ownership is the authorisation boundary. Also the course's multi-user permission requirement (M3/M6) | Core |
| 2 | **Paste a TikTok link** — validate and canonicalise short links, tracking parameters, locale variants | The single user input in the product. Whatever the user actually pastes must resolve to one canonical post identity, or dedup and caching break | Core |
| 3 | **Read the post** — acquire usable post content server-side through permitted mechanisms, with no user text entry | This *is* the product's magic. Removing user text entry is a deliberate concentration of risk (Charter §7.1). Boundary **PENDING-D1** | Core |
| 4 | **Find the recommendations** — LLM extraction of 0..N place candidates as schema-validated structured output | Captions are prose, emoji and hashtag walls; a place list is structure. 0 is a legitimate answer and must be handled as one | Core |
| 5 | **Identify the real places** — resolve each candidate against a places provider to a real POI with coordinates, provider id and category | A name is not a location. Coordinates are what make the map, "near me", and dedup possible | Core |
| 6 | **Review before saving** — confirm, disambiguate or reject each candidate | Ambiguity is the normal case, not the edge case (risk R4): chains have branches, names repeat across cities. Nothing is ever written without confirmation | Core |
| 7 | **Designed failure** — when a post cannot be read or contains no place: an honest state offering retry, open the original TikTok, or add a place you already know | Every stage can fail. A silent failure is the worst outcome in this product. The recovery is never "paste the caption" | Core |
| 8 | **Save to the library** — persist confirmed places, deduplicated, permanently linked to the source post(s) | One physical place is one row, referenced by many posts. Without dedup the high-volume saver's map degrades into noise (risk R11) | Core |
| 9 | **The map** — interactive map of saved places with clustering and a custom style | The map is not a feature, it is the retrieval interface. Location replaces search as the primary way the user finds their own saves | Core |
| 10 | **"What have I saved around here?"** — user location on permission, and proximity retrieval | This is the promise in §1 made literal. Without it the product is a nicer archive, not a better decision | Core |
| 11 | **List, search and filter** — text search and category filter over saved places | The map answers "where"; the list answers "which". Needed below ~20 places, when a map is thin, and by the high-volume saver above ~100 | Secondary |
| 12 | **Place detail** — useful place information and a link back to the originating TikTok(s) | "Which TikTok made me save this?" must always be answerable. The original post is the reason the user trusted the place | Core |
| 13 | **Add a place I already know** — search a POI by name, select, save | Deliberately secondary. It earns its place three ways: an independent recovery path for capability 7, meaningful CRUD for the course, and it exercises the same place infrastructure the pipeline needs. The product is never presented or built as a manual map first | Secondary |
| 14 | **Genuinely touch-designed UI** — bottom sheets, thumb reach, safe areas, 60fps on a mid-range phone | Both key moments happen on a phone, one-handed, standing up. A desktop layout shrunk down would fail the actual use case | Core (quality bar) |

### 5.1 Non-goals for V1

Explicit, so that "we ran out of time" and "we decided not to" are never confused.

| Not in V1 | Reason |
|---|---|
| **Asking the user to paste a caption, description or transcript** | Not a cut — a prohibition. The conversion is the product; asking the user to do it defeats it (Charter §2, corollary 2) |
| Instagram, YouTube, any second source platform | Platform count is subordinate to TikTok quality (Charter §4). Cut by default on time grounds alone |
| Video, audio or on-screen-text analysis; screenshot import | V1 is not a video-understanding system. The seam is left open (`ContentExtractor`), the capability is not built |
| Social graph, public profiles, creator discovery, sharing, collaborative collections | Not a social network. Would multiply the security and product surface for no gain in the core loop |
| Itinerary generation, routing, bookings | A different product |
| Place discovery / recommendation ranking | It only ever shows places the user saved |
| Gamification, offline mode, native apps, PWA install and share-target | None of these improves the core loop; some are technically unavailable on the web (iOS share sheet) |

---

## 6. Core processes

### 6.1 Flagship process — TikTok to map

The one process the product is judged on. Every step names the user's intent and what the system
does. Steps 3 and 4 are the pipeline; the user experiences them as one wait.

| Step | User intent | User action | What the system does | User-visible language |
|---|---|---|---|---|
| 1 | "I want to keep this place, not this video" | Copies the link in TikTok, switches to the app, pastes it into the single field | Validates and canonicalises the URL: resolves short links, strips tracking parameters, normalises locale, extracts a canonical post identity. Rejects non-TikTok and malformed input immediately | "TikTok link added" |
| 2 | "Do something with it" | Submits (or the app submits automatically on a valid paste) | Confirms acceptance in under a second, then starts the pipeline. Import is authenticated and rate-limited, with a hard ceiling on provider calls | "Reading the TikTok…" |
| 3 | (waiting) | — | **Source acquisition:** retrieves usable post content server-side through permitted mechanisms — no user text entry. Supported content boundary **PENDING-D1**. **Content extraction** normalises it into text for the next stage | "Reading the TikTok…" |
| 4 | (waiting) | — | **Place extraction:** an LLM returns 0..N candidate places as schema-validated structured output. Captions are treated as untrusted data, never as instructions. **Place resolution:** each candidate is resolved against the places provider to a real POI with coordinates, provider id and category; a confidence is derived from resolution evidence (name similarity, city agreement, category agreement, margin over the runner-up) — not from the model's self-report | "Finding the places… → Matching locations… → 3 places found" |
| 5 | "Is this actually the place they meant?" | Reviews the candidate list; confirms, corrects or rejects each | Presents each candidate with its match on a mini-map. High-confidence matches are pre-selected; low-confidence ones are presented as a choice with a one-tap "not this one → search". **Nothing has been written yet** | "We found these. Which do you want?" |
| 6 | "Save them" | Confirms the selection | Persists the confirmed places to the user's private library, deduplicated against places already saved, each permanently linked to the source post. Pins animate onto the map | "Saved to your map" |
| 7 | "Get it back when it matters" | Later, opens the app in some neighbourhood | Renders the library on the map, clustered; on location permission, centres on the user and surfaces what is saved nearby | "3 places saved near you" |

**Failure path (a first-class branch of this process, not an error dialog).** If step 3 cannot read
the post, or step 4 finds no place, or step 5 resolves nothing usable, the user is told plainly what
happened and is offered exactly three routes: **retry**, **open the original TikTok**, or **add a
place you already know by name**. The app never asks for the caption and never fails silently.

### 6.2 Secondary processes

| Process | Trigger | Steps | Ends when |
|---|---|---|---|
| **Retrieve by location** — "what have I saved near me?" | Opens the map, grants location permission | Map centres on the user's position → saved places within view are shown, clustered → tapping a cluster expands, tapping a pin opens the place | User has an answer without scrolling or typing |
| **Browse / search / filter** | Wants "which", not "where" | Opens the list → types part of a name, or filters by category → taps a result | Result opens as a place detail, and can be shown on the map |
| **Open a place and jump back to its TikTok** | "Why did I save this?" | Opens a place from map or list → sees name, category, location and the source post(s) → taps through to TikTok | The original post opens in TikTok |
| **Add a place I already know** (secondary) | Has a place from outside TikTok, or is recovering from a failed import | Opens add-a-place → types a name → picks from provider results → confirms → saved | Place appears on the map, deduplicated, with no source post |
| **Sign up / sign in** | First run, or a new device | Creates or enters an account → lands on their map (see onboarding, §7.6) | The map is theirs and is private to them |

**Not a process:** manual entry of caption, description or transcript text. It does not exist in the
product and no user flow leads to it.

---

## 7. Success criteria

Written to be verified by QA without asking the author a question. Each criterion is a pass/fail
observation. Numeric thresholds marked **PENDING-D1** are gated on the feasibility verdict; the
thresholds themselves are not — they are committed now so that the verdict cannot be graded against
a moving target.

### 7.1 Claiming "TikTok support" — the honest bar

We may only describe the product as supporting TikTok if the criteria below pass against a
**labelled test set** built before implementation.

**The test set.** 40 real public TikTok URLs, frozen and committed as `docs/evidence/tiktok-testset.json`,
hand-labelled by a human with: the places a human can identify from the post, where in the post each
place name appears (caption / on-screen text / speech only / nowhere), the city, and whether the post
is a single-place or multi-place (list-style) recommendation. Composition: 30 posts whose place names
appear in the content classes the capability boundary in `04-tiktok-feasibility.md` declares
supported ("in-boundary"), and 10 known-hard posts (place named only in speech or on-screen text, or
no place at all) as the honesty set.

| ID | Criterion | Threshold | Verification |
|---|---|---|---|
| T1 | **End-to-end success.** An in-boundary post yields ≥1 correctly resolved place, presented as a candidate in review | ≥ **75%** of the 30 in-boundary posts | Run each URL through the deployed pipeline; compare against the human label |
| T2 | **Top-1 resolution accuracy.** For each correctly extracted place name, the pre-selected/first-ranked POI is the one the human labelled | ≥ **70%** of extracted place names | Compare resolved provider id / coordinates against the label; within 150m and matching name counts as correct |
| T3 | **Multi-place recall.** On list-style posts, the share of human-labelled places recovered | ≥ **60%** of labelled places on those posts | Per-post recall, averaged |
| T4 | **Hallucination rate.** Candidates presented that do not correspond to any place referenced in the post | ≤ **5%** of all presented candidates | Every presented candidate is judged against the post content |
| T5 | **Failure is designed, never silent.** Every post that cannot be read, or yields zero places, terminates in the designed failure state with all three recovery routes, and never requests caption text | **100%** of the 10 honesty-set posts, and of any in-boundary failure | Observe the terminal screen for each failing URL; assert the three actions exist and no text-entry field for post content appears anywhere in the product |
| T6 | **No unconfirmed writes.** No place is persisted without an explicit user confirmation | **0** exceptions across the whole set | Run all 40 imports, abandoning review each time; assert the library is unchanged |
| T7 | **Works from the deployed URL, not just locally** | 100% parity of T1 outcomes between local and the Vercel deployment | Re-run the set against the production URL (risk R2) |
| T8 | **Latency.** First feedback after paste; total import completion | First feedback P95 < **1s**; total import P95 < **20s** (revise once D3 measures the real pipeline) | Timed over the 40-URL set on the deployment |

**If T1 lands between 50% and 75%:** we do not claim "TikTok support" in general terms. We state the
supported content classes explicitly in the product and in the presentation ("works when the post
names the place in text"), and the honest capability level from `04-tiktok-feasibility.md` becomes
part of the specification rather than a footnote. **If T1 is below 50%,** the premise has failed for
V1 and the contingency in `02-risks-and-unknowns.md` §A1 is triggered — not a marketing softening.

### 7.2 Import and review process

| ID | Criterion |
|---|---|
| I1 | Every URL form in the test set — short link (`vm.tiktok.com`), `/t/` link, full `@user/video/id`, links with tracking query parameters, and locale-prefixed links — canonicalises to the same post identity for the same post |
| I2 | Non-TikTok URLs, plain text, and malformed URLs are rejected at submit with a plain-language message, and never reach the pipeline |
| I3 | Importing the same post twice adds no duplicate place rows and no duplicate library entries; the existing place gains the second source link only if the source differs |
| I4 | Two different posts about the same physical place produce one place with two source links |
| I5 | The review screen handles 0, 1, and ≥5 candidates without layout failure or scroll traps on a 375×667 viewport |
| I6 | Low-confidence candidates are not pre-selected; high-confidence candidates are pre-selected but still cancellable |
| I7 | A user cannot trigger more than the configured import rate limit; exceeding it produces a clear message, not a failure |
| I8 | No import performs more provider calls than the configured hard per-import ceiling |

### 7.3 Retrieval and map

| ID | Criterion |
|---|---|
| M1 | With location permission granted, the map centres on the user and lists saved places within the current viewport, ordered by distance |
| M2 | With location permission denied, the map still renders the full library and states plainly that proximity retrieval needs permission; nothing crashes and nothing nags repeatedly |
| M3 | A library of 300 places renders clustered and pans/zooms at ≥50fps on a mid-range Android device (charter's 60fps target measured, with 50 as the fail line) |
| M4 | Tapping any pin opens the place detail within one interaction; the source TikTok link is present and opens the correct post |
| M5 | Text search returns a place by any substring of its saved name, case-insensitively; category filter returns exactly the places of that category; the two combine |
| M6 | No coordinate ever appears in a URL, log line or analytics payload; the live user position is never persisted server-side (risk R9) |

### 7.4 Manual place addition (secondary)

| ID | Criterion |
|---|---|
| A1 | Searching a known place name returns provider results; selecting one and confirming saves it with coordinates, category and provider id, and no source post |
| A2 | A manually added place is deduplicated against the same place arriving later from a TikTok import — one row, source link added |
| A3 | A saved place can be renamed, re-categorised and deleted by its owner (the course's CRUD surface, M3/M4) |

### 7.5 Accounts and permissions

| ID | Criterion |
|---|---|
| P1 | An anonymous visitor can reach only the marketing and auth surface; every library route redirects to sign-in |
| P2 | A signed-in user's library requests return only their own rows, enforced by row-level security in the database rather than by application filtering |
| P3 | A test that authenticates as user B and requests user A's place, library entry, or source row **fails**, and this failing attempt is committed as a test (M6, and the strongest permission evidence we can show) |
| P4 | No user-scoped read anywhere in the product uses a service-role key |

### 7.6 Onboarding — the delayed-value criterion

The product is worth nothing at zero saved places and strong at ~20 (Charter §7.4, risk R5).
Onboarding is therefore an acceptance criterion, not a polish item.

| ID | Criterion |
|---|---|
| O1 | A new user is never shown a bare empty map. First run leads directly into the first import |
| O2 | A new user completes **3 or more** saved places within their first session, without leaving the guided flow, in an unassisted test with 3 people who have not seen the product |
| O3 | Time from account creation to the first place appearing on the map is under **2 minutes** in that same test |
| O4 | If the first import fails, the flow offers the three recovery routes (§6.1) and still reaches a non-empty map via manual add |

---

## 8. Scope rulings

One-line rulings, with the reason and what would change our mind. **Cut** means it is not in V1 and
not planned. **Deferred** means it is out of V1 with a known re-entry path.

| Item | Ruling | Reason | Evidence that would change it |
|---|---|---|---|
| Manual caption / description / transcript entry by the user | **Cut, permanently** | It is the product's inverse: the app exists to perform that conversion | None. This is a definitional boundary, not a scope call |
| Instagram support | **Deferred (post-V1)** | Platform count is subordinate to TikTok quality; and on time grounds alone it cannot land in 19 days | TikTok passing §7.1 with days to spare, plus a VERIFIED Instagram mechanism from Social Integration |
| YouTube support | **Deferred** | Only justified if it is nearly free behind the same `SourceAdapter` seam | A measured "under half a day" integration once the seam exists and TikTok is green |
| Video / audio / OCR analysis of posts | **Deferred (seam kept open)** | V1 is not a video-understanding system; the `ContentExtractor` seam costs nothing today | The feasibility verdict landing low enough that transcription is the smallest legitimate path to a viable product (`02` §A1 contingency b) |
| Sharing, collections, collaboration | **Cut for V1** | Multiplies product and security surface; improves nothing in the core loop | Post-V1 only |
| Social graph, public profiles, creator discovery | **Cut** | Not a social network | None planned |
| Itinerary generation, routing | **Cut** | A different product | None planned |
| Place discovery / recommendations | **Cut** | It only ever shows places the user saved | None planned |
| PWA install, share target, native app | **Cut for V1** | iOS cannot deliver the share-sheet flow that would justify it; the honest target is one screen, one field, paste | An Android-only share-target being genuinely free late in the schedule |
| Gamification, offline mode | **Cut** | Neither improves retrieval | None planned |
| PostGIS, a job queue, a caching layer | **Not adopted until earned** | Each must be justified by a measurement; unjustified infrastructure costs marks under M11/R1 | Measured latency or query cost that the simple option cannot meet (D3, D6) |

### 8.1 Cut order if the schedule slips

Applied strictly top-down. Everything above the cut line ships before anything below it is
attempted. **The core loop's quality is never traded for breadth** — that is the whole rule.

| Order | First to go | What survives instead |
|---|---|---|
| 1 | Any second source platform (already Deferred; re-confirmed under pressure) | TikTok only, done well |
| 2 | Motion moments 3, 4 and 5 (results appearing, pins entering, save interaction) | Moments 1 and 2 only — paste accepted and processing — because those carry the magic |
| 3 | Category filter on the list view (capability 11 shrinks to text search only) | Text search |
| 4 | The list view's remaining polish — plain list, no sorting options | Map plus a plain searchable list |
| 5 | Manual place editing (rename / re-categorise), keeping add + delete | Minimum viable CRUD for M3/M4 |
| 6 | Map clustering sophistication (simple pins if a measured frame rate allows) | A map that still performs on a phone |
| 7 | Visual polish phase in full | Tokens already locked; components look plain but consistent |
| **Never cut** | Capabilities 2–10 and 12, the designed failure state, RLS and the permission tests, onboarding's first-3-places outcome, and the deployed public URL | — |

Rationale for the ordering: items 1–4 remove *breadth*; items 5–7 remove *finish*; the never-cut list
is the product plus the two things the course grades hardest (permissions and explainability) plus
the one thing that makes a new user's map non-empty.

---

## 9. What the examiner should take away

People save places on TikTok and then cannot find them again, because TikTok saved a video when what
the person wanted was a place. This product does the one conversion the platform never does: you
paste a TikTok link, the app reads the post itself — you are never asked to copy any text out of it —
it works out which real places were recommended, you confirm the matches, and they land on your own
private map, still linked to the post that convinced you. From then on the question "what did I save
near me?" is answered by looking, in seconds, instead of scrolling for minutes. The scope is
deliberately narrow: one source platform, no social features, no discovery, no itineraries — because
the whole value depends on that single conversion working well, and a second platform would only make
the product bigger, not better. The one dependency the product genuinely rests on — how much of a
public TikTok post we may read from a server — is being tested before anything is built on top of it,
and this specification names the exact percentage of a labelled test set we must pass before we are
willing to claim the product supports TikTok at all.

---

## 10. Traceability

| Course requirement (M2) | Section |
|---|---|
| What problem the product solves | §1 |
| Who the users are | §2 |
| Who the customer is | §3 |
| What the business goals are | §4 |
| Which software capabilities are needed | §5 |
| Which core processes users can perform | §6 |
| *(beyond M2, for the engineer and for QA)* success criteria; scope rulings | §7, §8 |

| Open decision this document depends on | Owner | Resolved in |
|---|---|---|
| D1 — TikTok capability level and supported-content boundary | Social Integration | `04-tiktok-feasibility.md` |
| D1b — Instagram / YouTube status | Social Integration + Product | `05-secondary-platforms.md` |
| D2 — map + places provider pair and licensing | Geospatial + Security | `06-map-and-places-decision.md` |
| D3 — import execution model and real latency (fixes §7.1/T8) | Architect + DevOps | `07-import-execution-model.md` |
| D4 — confidence model gating pre-selection in §6.1 step 5 | AI + Geospatial + Product | `09-extraction-and-resolution.md` |
| D5 — place identity and dedup key (fixes §7.2/I3, I4) | Database + Geospatial | `08-place-identity.md` |
| D8 — auth methods offered | Security + Product | `security.md` |
