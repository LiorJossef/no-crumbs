# Current state — cold-start document

---
> ## ⚠ READ FIRST — [`handoff-2026-08-29-overnight-map-and-information.md`](handoff-2026-08-29-overnight-map-and-information.md) is the newest state
>
> It supersedes **both** banners below and every ordered step in them. Five PRs (#50–#53) landed the
> map and information work overnight; `main` was green at 1021 tests.
>
> ### Already shipped — do not re-plan these
>
> On 2026-08-28 two separate investigations in one session were dispatched to work on features that
> were **already on `main`**, because this document still described them as outstanding. The cost was
> real. Before planning anything from the prose below, check it against `git log main`.
>
> | Reads as open below | Actually shipped |
> |---|---|
> | "Tag chips are still inert labels" (§0.3) | `6004baf` — detail chips are pressable, filter the list *and* the pins, with a removable `ActiveTagFilter` pill |
> | Uniform map pins | `cb58e12` — every pin is a category-coloured teardrop with a drawn glyph |
> | Clusters that only count | `99bb691` — clusters colour by strict-majority category and open on tap |
> | Category shows the model's guess | `38325e8` — `ProductCategory` reads `places.provider_category` |
> | Hebrew basemap labels reversed | `59ba7dc` — RTL text plugin loaded |
>
> Two things inside the tag-chip item are **still genuinely open** and must not be swept up in the
> correction: **list-row chips are inert by design** (a 20px chip inside the row's own button is
> nested-interactive and under the 44px touch floor — deferred to a taller-row redesign), and a
> `TagChipList` rendered outside a `TagFilterContext` still falls back to inert spans.
>
> ### The real open items, as of 2026-08-28
>
> The owner's ruling on the **candidate picker** (the newest handoff §3), the **category term in the
> scorer** (TLV-14), whether a **lone candidate should auto-accept**, the **product name**, the
> **Vercel env restore** (§5.1, owner-only), **dark mode** (still an unsigned first pass), and
> **Playwright coverage for search and tag filtering** — was zero; now
> [PR #64](https://github.com/LiorJossef/P-002/pull/64) (`test/retrieval-e2e`), eight tests over both
> breakpoints, **open and deliberately not merged**. One design question first: the map is a canvas
> with `preserveDrawingBuffer: false`, so the harness reaches MapLibre by walking React's fiber tree
> — careful and loud-failing, but ~90 lines of internals archaeology where one inert
> `data-place-count` on the map surface would do. That is a `src/components/map/**` change, and
> `L1-F5-T5` reworks that file anyway, so the two are cheaper together. Two follow-ups either way:
> the suite **skips in CI** (no `E2E_PASSWORD`, so a green check does not mean it ran) and
> `seed.sql` writes no tags at all, so a `db:reset` leaves it nothing to discover.
>
> ### Why this keeps happening, and the fix
>
> This file is a **cold-start document** but it is written as a session handoff, and each new session
> adds a separate `handoff-*.md` instead of reconciling this one. The banner stack is now three deep.
> **Whoever closes a session updates the top banner to point at the newest handoff** — that is the
> whole fix, and it takes one line.


---
> ## ⚠ LATEST — read [`handoff-2026-08-28-categories-and-the-picker.md`](handoff-2026-08-28-categories-and-the-picker.md) FIRST
>
> Supersedes the §10 priority order of the Google-Places handoff below (which is still correct about
> the resolver, the ToS gate and the quota). Landed: the **RTL text plugin** — every Hebrew label on
> the basemap was rendering backwards — and a **`ProductCategory` vocabulary** that finally reads
> `places.provider_category`, so a gelateria stops being filed as "Shop".
>
> **The next piece of work is the owner's ruling on the candidate picker** (§3 there): we ask
> "Needs your pick" between two rows at the same address when name, category, address and a 0.31
> margin all agree — because `datasetConfidence` 0.295 vetoed the gate. Treat it as a general
> product + recognition problem, not a scoring tweak. A measurement of three weightings was in
> flight and did not return; re-run it, and check TLV-14 before shipping anything.

---
> ## ⚠ LATEST — read [`handoff-2026-08-28-google-places-primary.md`](handoff-2026-08-28-google-places-primary.md) FIRST
>
> It supersedes the ordered steps in every earlier handoff. Headline: **Google Places is now the
> primary place resolver** (owner ruling, 2026-08-28) with the Overture index preserved off the
> primary path and the MapLibre renderer unchanged. Measured on the same 13 real TikToks through the
> shipped flow: **Google 15/15 correct top-1 against Overture's 12/15**, auto-match 6/16 vs 7/16 —
> more accurate, slightly less decisive.
>
> **It is not shippable yet, and that is not a code problem.** The Cloud project caps Places Text
> Search at **100 requests/day** and one night of benchmarking exhausted it. Raising it is an owner
> console/billing action. Separately, `06` §3.1 forbids Google Places data on a non-Google map, so
> `place-resolver-factory.ts` keeps **production on Overture** until the renderer moves.
>
> Also landed: **TikTok photo/carousel posts are supported** (`04` §5 category L closed with a real
> specimen — oEmbed 400s `/photo/` and 200s the same id under `/video/`), and a provenance bug that
> wrote a correctly-resolved place to `places` as `llm-guess` while 1054 tests stayed green.
>
> **Refuted, do not repeat:** cover-frame OCR (recall 1/8, and it reads background shopfronts as
> venues); Google's `types` array as a fix for the category term.

---
> ## ⚠ 2026-08-29 — [`handoff-2026-08-29-overnight-map-and-information.md`](handoff-2026-08-29-overnight-map-and-information.md)
>
> Superseded by the entry above for *ordered steps*; its findings still stand and its map and
> extraction work is all on `main`. Headline at the time: the map answers all three of the
> owner's complaints (category pins, clusters that open and are coloured by their majority
> category, a basemap re-tinted into the product's palette); the "information feels generic"
> problem was **three separate problems** — presentation, a Hebrew `countryHint` storing
> `country_code` NULL, and four extraction rules — all fixed and measured; and recognition is
> **7/16 (44%) with zero false auto-accepts** under prompt `p11`, the same rate as `p8` with
> `extraction_miss` down 3 → 1.
>
> **The decisive-margin band change was tried and refuted** —
> [`evidence/places/band-policy.md`](evidence/places/band-policy.md). It points at the scorer's
> category term, not at the band gate. Nothing shipped there.
>
> Bilingual query expansion (the previous handoff's next step) **shipped** and is in `p11`. The
> 4/16 = 25% figure below is two prompt versions stale.

---
> ## ⚠ 2026-08-28 — [`handoff-2026-08-28-recognition-corpus.md`](handoff-2026-08-28-recognition-corpus.md)
>
> Superseded by the entry above; its §4–§7 facts are still good. Headline at the time:
> the auto-match rate was **4/16 (25%)**, the address signal shipped in both the scorer and
> the prefilter, and the next step was bilingual query expansion — every venue we could not find
> was in the index under its Latin name while the caption gave the Hebrew one.

---
> ## Session of 2026-08-27 (fifth)
>
> **The resolver work is committed and on `main`** ([PR #40](https://github.com/LiorJossef/P-002/pull/40),
> six checks green). The fourth session's whole change set was uncommitted; it is now five atomic
> commits. `poi_index` holds **10,462 Overture rows for Tel Aviv + Hasharon** (lat 31.95–32.40, lng
> 34.70–35.00), loaded locally. On a real caption the resolver lands **11 m** from truth where the
> model's own guesses were **555 m** and **483 m** out.
>
> **The headline number changed, and the old one was the instrument.** The owner supplied 13 real
> TikToks. Measured through the shipped flow (oEmbed → caption → extraction → resolve), the
> **auto-match rate is 4/16 (25%)**. The synthetic benchmark says 11/15. Every number this project
> quoted before today came from hand-written queries that are *script-matched to the index by
> construction* — a Latin query for a Latin-named row — which is exactly what a real caption is not.
> **Quote the corpus number, not the benchmark number.** Harness:
> `tests/manual/tiktok-recognition.manual.ts`; corpus: `tests/manual/tiktok-recognition-corpus.json`;
> record: `docs/evidence/places/tiktok-recognition-run.json`. Re-running costs zero LLM calls.
>
> **The dominant failure is that we throw away the street address.** The extractor already
> populates `addressHint` for 9 of 17 candidates; `poi_index.address_line` holds the same strings;
> `ResolveQuery` has no address field at all. Exact address matches sit in the index for four
> venues we currently get wrong (Kohi @ בן יהודה 155, Brasserie 18 @ לבונטין 19, Rustico @ בזל 42,
> wow london @ בית אשל 15). The address is also **script-neutral** — `קוהי` reaches
> `Kohi Coffee Shop` on the address where no name match can.
>
> **The handoff's priority #2 (OSM `alt_names`) is deprioritised on evidence — see §0.5.**
>
> Two silent-failure fixes landed: a city named only in the candidate text now scopes the query
> (TLV-12 went from `regionsSearched: []` to `['tlv']`), and Hebrew abbreviations (`ת״א`, `ר״ג`,
> `פ״ת`…) are recognised. `no_region_searched` on the real corpus is now **0**.
>
> Still true from the fourth session, and still worth reading its handoff for: the failure taxonomy,
> the measured facts about Overture and OSM coverage, and the environment traps in its §7.

---

> Updated **2026-08-27**. Read this after `CLAUDE.md` and `working-agreement.md`, before anything
> else. It is the running state, not a diary: when something here stops being true, change it.
>
> This session rewrote the file rather than appending to it. Everything still true was kept;
> narrative that had stopped earning its place was dropped. The previous version is in git history.
>
> **Session of 2026-08-27 (second half) added:** §2.1 (PR #35 landed, and the constraint-mode trap
> that nearly stopped it), §5.8 (a quarter of the library is phantom, measured), §5b (the mio travel
> competitive read, and one corrected platform label), and a rewritten §9 — a build order, and
> **§9.2, seven open questions the owner asked to be carried forward** rather than answered in
> passing. Start there.

---
> **Session of 2026-08-27 (third) — read this first.** `L1-F5-T2` "the map is the query" **shipped**
> ([PR #37](https://github.com/LiorJossef/P-002/pull/37), six checks green, `main` verified). The
> owner answered four of §9.2's seven questions. **The shipped interaction was then reviewed by the
> owner and is explicitly NOT the settled product direction — see §0.1b before building on it.** A
> related product direction is parked in §0.4.

---

## 0. What this session did

### 0.1 Shipped: the map is the query (`L1-F5-T2`)

The camera opens on **one cluster** instead of fitting all of them; the sheet and the desktop panel
list **exactly what is in the viewport**, sorted nearest the centre first, under a header that names
the area (`12 places in London`); and **tags and dishes are searchable** — `momos`, `natural wine`
and `hidden gem` matched nothing before.

`3 of 20` is retired everywhere and **the library total is displayed nowhere on `/map`**: with the
viewport and the search both narrowing, a denominator is ambiguous, so the noun carries the meaning
(`3 matches in London`).

**Two pre-existing bugs surfaced, and the first one rewrites §9.1's diagnosis.** MapLibre measures
its container once at construction, falls back to 400×300 when that measurement is empty, and never
measures again. Measured live at 1280×720: container 1280×720, canvas 400×300, **zero vector tiles
requested**, `loaded()` permanently false. The desktop `fitBounds` padding then exceeds the canvas
width, so the initial fit is impossible, silently does nothing, and leaves `hasFramedOnce` set — the
camera sits at zoom 0 over (0, 0) for the life of the page. **That is the world-map-with-two-bubbles
symptom this document blamed on fitting all places at once.** Both causes were real; only one was
recorded. Fixed with a `ResizeObserver` attached where the instance arrives (not at mount — mapcn
hands the map over asynchronously) plus a re-fit. Second bug: `whenReady` waited on `load`, which
never fires in that state; it now also listens for `styledata`.

**Verified by using the product** at 1280×720 and 375×812 against the live library: camera opens on
Tel Aviv with 6 individual pins and a cluster, `8 places in Tel Aviv-Yafo`; a real drag re-sorts the
list; a pan gives `6 places in this area`; `momos` finds The Laughing Yak and settles on
`1 match in London`; the mobile peek row reads correctly with pins clear of the sheet.

`6 places in this area` is **correct, not a defect**: those six are 4 `Tel Aviv-Yafo` and 2
`Tel Aviv` — 67%, under the 70% naming bar. `normalise()` cannot bridge those two spellings (they
differ by a real word, not by formatting), so the threshold is what protects the label, and
declining to name an area beats picking a spelling. Asserted in `tests/unit/ui/viewport.test.ts`.

Specified in full in **`docs/ux-map-is-the-query.md`**, which also rules that `ux-architecture`
§6.6.2's `Search this area` pill should **never be built** — its whole job was binding the list to
the viewport on demand, and that binding is now permanent.

### 0.1b Owner review of the shipped interaction — **it is not the settled direction**

Read this with §0.1, not after it. The owner used the finished interaction and **does not think the
current map behaviour works.** Recorded as given, before anyone treats §0.1 as a closed question:

1. **Typing should not move the map.** *Choosing* London and being taken to London is good; typing
   `London` **should not move the camera before anything has been selected.** That is the settled-
   search camera mover (movers 3 and 5 in `map-page-client.tsx`'s enumerated list — `useSearchFlight`,
   and the clear-search return to the nearest cluster). Both were inherited rather than invented by
   this work, and both are now suspect.
2. **The clustering experience is disliked.** Stated about the *experience*, not the 50 km domain
   grouping in `domain/places/clusters.ts` — the on-map cluster bubbles are `MapClusterLayer`
   (`clusterRadius={50}`, `clusterMaxZoom={13}` in `map-surface.mapcn.tsx`). **Stale twice over:**
   the shipped values became 46 / 13 in `cb58e12`, and as of the owner ruling on 2026-08-28 the
   on-map density bubbles are **being removed entirely** (`L1-F5-T5`). Note `clusters.ts` is a
   *different* thing and survives — it anchors the camera and names the active area, and never
   drew a bubble.
3. **The load-bearing objection: library scope must not continuously track the exact viewport.**
   Selecting a pin, zooming or panning should **not** turn `8 places in Tel Aviv` into 4 or 1 and
   make the rest vanish from the list. It may make sense for the list to change when the user
   **intentionally changes city or context** — it must not change continuously with the visible map
   bounds.

**So the interaction model needs a rethink, and the owner asked that it not be opened yet.** There
are useful pieces in what shipped — the coordinate clustering, the area label and its honesty about
two spellings, tags and dishes being searchable, the two real map bugs fixed, and the nearest-first
sort — and none of those depend on scope tracking the viewport.

**This and §0.4 are the same conversation.** "Intentionally changes city or context" is what a
city/collection scope *is*; §0.4's automatic geographic grouping is a candidate answer to exactly
this objection, with `clusters.ts` already the primitive. Whoever takes the rethink should read them
together, and should treat `ux-map-is-the-query.md` as a **superseded-in-part** spec rather than a
binding one: its §1 (the query rect) and §4 (panning settles the list) are the parts under review,
while its string matrix, empty states and accessibility rules are unaffected.

### 0.2b How this session should run — standing owner ruling, 2026-08-28

**Read this before planning any work.** Two rules, both permanent, both inherited by every cold
start. Full text in `working-agreement.md` §1.4; the short version:

1. **Parallelise proactively.** Every session, find the work that can genuinely run in parallel and
   dispatch it to the specialists in `.claude/agents/` while the main thread continues —
   investigations, measurements against real rows, independent verification of what was just built,
   extraction research, product/UX checks, harness work. No per-session permission needed; standing
   permission also covers changing any agent configuration required to make it work. **Parallelism,
   not ceremony** — an agent that duplicates what you are already doing is worse than no agent.
   **You own the lifecycle:** track what is running, collect it, stop what stopped mattering, and
   **never close a session with background work unaccounted for.** The owner does not chase agents.
2. **Continue autonomously.** Do not ask the owner to choose between ordinary implementation tasks.
   Prioritise by product impact and take the next step; escalate only the genuine owner-level
   decisions in `working-agreement.md` §7.


### 0.2 Owner rulings, 2026-08-27 (four of §9.2's seven)

1. **Manual add as *place search* is inside Charter §2** — same resolver, same provenance fields, not
   the caption entry §2 forbids. **Deliberately not started**: only worth building as a real
   place-search experience, not a name field and a Save button. `L1-F7-T1` is *in scope, not
   started* — a different state from *blocked*, and it should not decay back into one.
2. **Near-me promoted L2 → L1**, now `L1-F11` in `execution-plan.md`, depending on `L1-F5-T2`.
3. **The five duplicate pairs stay** as the messy-state fixture. No backfill, no merge path, and the
   75 m radius untouched.
4. **~27% is not a permanent product position, and media ingestion is not reopened either.** The
   priority is the caption pipeline being excellent and reliable end to end first. So `04` M9 stays
   closed **and** the no-places copy must not be rewritten to defend ~27% — that would adopt the
   position the owner declined.

Still open, carried in §9.2: the grounding line, export, the TikTok data export.

### 0.3 Left undone, deliberately

- ~~**Tag chips are still inert labels.**~~ **Done 2026-08-28** in `6004baf`, now on `main`: detail
  chips are pressable buttons with `aria-pressed`, tapping one filters the list *and* the pins, and
  an `ActiveTagFilter` pill makes the applied filter visible and removable. **This line was left
  stale for a day and misled a later session into re-planning finished work** — two things are still
  genuinely open and should not be confused with the whole item: **list-row chips remain inert by
  design** (a 20px chip inside the row's own button would be nested-interactive and under the 44px
  touch floor — deferred to a taller-row redesign, `place-enrichment.tsx:36-38`), and a
  `TagChipList` rendered outside a `TagFilterContext` provider still falls back to inert spans
  (`src/ui/place/tag-filter.ts:35-44`).
- **Search and tag filtering have no Playwright coverage at all.** Unit tests are good
  (`tests/unit/ui/tag-filter.test.ts`, `tests/unit/map/filter-places.test.ts`,
  `tests/unit/places/search.test.ts`), but `tests/e2e/` is seven import specs plus `smoke` and
  `map-accessibility`, none of which exercise the search field or a tag filter. This is the real
  remaining gap on the retrieval surface.
- **The empty-library screen exists but the import overlay does not auto-open over it**
  (`ux-map-is-the-query.md` §5 item 2). Untested at 0 and 1 saved places — §9.3 asks for those
  library shapes and this session only exercised 20.
- **A brief flash of `No matches in this area`** while a search flight is in the air, before the
  camera lands. Cosmetic, one debounce away.

### 0.4 A product direction to consider — not a decision, not a workstream

Owner, 2026-08-27, after seeing the viewport binding: **the map should not necessarily be the only
way to scope and retrieve places.** The direction worth thinking about is places also being
organised **automatically by geography** — saving a London place makes it part of a London
view/collection — alongside **the user's own collections** and eventually **shared collections**,
with search working *within* a city or collection as well as across the whole library.

Recorded as a direction, not scheduled. Two things already in the repo bear on it: the coordinate
clustering shipped this session is exactly the "automatic geography" primitive such a model needs
(and it deliberately avoids the `locality` string, which is where a naive city grouping would break
on `Tel Aviv` / `Tel Aviv-Yafo`).

**Owner correction, 2026-08-28 — shared collections are not a social-graph question.** The earlier
framing weighed them against Charter §1's no-social-graph stance; that conflated three different
things. Public creator profiles and a follower graph stay out. **A private collection that named,
invited people both contribute to is a multiplayer document, not a network** — no feed, no
discovery, no audience — and it is retrieval for two people rather than a second job. Both
competitors ship it, and Plotline's version hangs off the *collection*, not the trip, and is free
forever — which proves collaboration is separable from the itinerary planner we decline. Its real
cost is that it is our first multi-writer object: membership-based RLS on every `saved_places` path,
invite-link tokens as a new public surface, and an `added_by` column. **Filed at L2 as its own
feature**, boundary written down (named invitees only; no public profiles, no follower graph, no
discovery feed), and explicitly not ahead of the resolver. Full evaluation:
`evidence/product/competitor-pass-2026-08-28.md` §G.

---

## 1. What the product does today

The core loop runs end to end, against real TikToks, on real data:

**paste a TikTok link → oEmbed → caption → LLM extraction → review and confirm → saved place on a
map**, with a saved-places list, text search, place detail, delete, and note editing.

As of this session the extraction also captures **what a place actually is** — free-form tags, named
dishes, and a one-line reason — and the map surfaces them. See §3.2.

**What it still is not.** There is no `PlaceResolver`: every coordinate is the model's own guess.
The streaming route (`L0-F6`) does not exist and `/api/imports/probe` is still the request/response
stand-in. Manual add (`L1-F7-T1`, surface S8) does not exist, so three failure screens and the
no-places screen have a recovery they cannot offer.

**The MVP boundary** — three decisions, not a feature list: one link in one field; **TikTok only**,
so an Instagram or YouTube link is a recognised redirect, never a failure; and "info" fixed at
name · category · coordinates · source link · user note, plus (new) tags · why-go · dishes.

---

## 2. Where the work is

`main` carries everything below. Two PRs this session, both through `npm run merge:pr` with all six
checks green:

| PR | What | State |
|---|---|---|
| [#34](https://github.com/LiorJossef/P-002/pull/34) | Honest import failures — real codes, real statuses, a real audit row | **merged**, `main` verified |
| [#35](https://github.com/LiorJossef/P-002/pull/35) | Rich extraction and the surfaces that show it — see §3.2 | **merged**, `main` verified |

### 2.1 PR #35 landed, and the one thing that nearly stopped it

Merged 2026-08-27 through `npm run merge:pr -- 35`, all six checks green, `main` verified after
(`npm run verify` clean — 592 tests in 41 files — and `main`'s own CI run concluded `success`).
`main` is now `455749d`.

**Read this before you touch `supabase/tests/0008_policy_tests.sql`.** The branch went red on
`migrations · RLS policy tests` and the cause is a trap the file will set again:

- The suite runs as **one transaction**, and `set constraints` is **transaction-wide**. P24 ends
  with `all immediate`. P25 was added without declaring what it needed, inherited that mode, and
  its first fixture `resolve_place` aborted the whole run with
  `ERROR: place ... has no provider ref (identity invariant, 08 §1.6)`.
- Nothing was wrong with the policies or with `resolve_place`. Step 3 writes the `places` row and
  its `place_provider_refs` alias as **two consecutive statements**, which is legal only because
  `places_alias_required` is DEFERRABLE INITIALLY DEFERRED. Under IMMEDIATE the check fires between
  them, against a row that is one statement away from being valid.
- Fixed in `c794c4a`: P25 declares `all deferred` for its fixture and flips to `all immediate` once
  the fixture is built, so the fixture's own invariants are discharged before any grant assertion
  runs. Every block in that file must declare its mode — the P10 header says so, and P25 is the
  proof of what happens when one doesn't.

**Only CI could see it**, and that is the durable lesson: `npm run verify` does not run the policy
suite, and the suite needs an empty database, which a development one is not (§5.11). Verified
locally without a reset by replaying just the P25 section from exactly the state P24 leaves behind
— 16/16 PASS, rolled back, 20 places and the 6 cached `extractions` untouched.

## 3. What landed this session, and how it was verified

### 3.1 Honest import failures (PR #34)

Every `/api/imports/probe` failure used to answer **HTTP 502** whatever happened; a malformed body
was reported as `INTERNAL, retryable: true`; the real cause was built into a message that `toView()`
correctly strips and **nothing ever logged**; and the `imports` row was never stamped —
`imports_failed_implies_code` had required `status='failed'` + `error_code` since `0003` with **no
writer across all 22 imports**. On screen, one apologetic template served all fourteen codes.

Now each code carries its own status (a 500 is reachable **only** through `INTERNAL`, which is what
makes `07` §7.1's "page a human" mean anything), one structured redacted log line, a real audit row,
and a per-code copy map with recoveries that work.

**Two defects found while integrating, both bigger than the ticket:**

- **`RedirectScreen` was unreachable dead code.** `canSubmit` was gated on `validation.ok` and
  `submit()` was its only caller, so an Instagram link, a TikTok profile link and a photo post *all*
  rendered `MALFORMED_URL`'s inline "That doesn't look like a TikTok link." That contradicted the
  MVP boundary in `CLAUDE.md`. Fixed; the three now render as distinct, honest news with **zero**
  requests to the server.
- **A real M6/R9 coordinate leak into logs.** V8's `JSON.parse` `SyntaxError` **echoes its input** —
  short inputs whole, and a mid-payload window on a trailing comma, the most common LLM JSON defect.
  `JSON.parse('(32.0578, 34.7702)')` reports the pair verbatim. Live from
  `gemini.place-extractor.ts:184`. Closed by redacting between the first and last quote while
  keeping the parser's complaint, so failures stay diagnosable.

**A regression this branch introduced and then fixed:** `Cancel` cleared the URL without aborting
the fetch, so the doomed request returned and left `Retry` a **dead primary button**. There is now a
real `AbortController`, a race gate on every `setScreen`, and an in-flight guard (five scripted
clicks previously fired five model calls). A caller abort writes **no** `error_code` — three
measured aborts had each written `UPSTREAM_TIMEOUT`, filing a user's Cancel as a TikTok outage.

**Verified against the live database and a real browser:** a nonexistent video id returns 422
`POST_UNAVAILABLE` and lands `failed`/`source`/`POST_UNAVAILABLE` — the first `failed` row this
database has ever held; 18 hostile paste inputs reached the server **zero** times; 17 wire cases
carry the honest status.

### 3.2 Rich place extraction

**The measurement that motivated it**, taken on the live database before any code was written:

| | |
|---|---|
| saved places with no `extracted_reason` at all | **7 of 20** |
| reasons that were the place's own name echoed back | 2 of 20 |
| the rest | verbatim caption substrings, emoji included |
| distinct `category` values across the library | **4** (14 of 20 = `restaurant`) |

The captions already said "seasonal Italian", "Nepalese kitchen", "pan-Asian inside Tooting Market".
The extractor was paying for that intelligence and throwing it away.

**Schema v2** — same oEmbed, same single model call — adds `tags` (open vocabulary, ≤5), `whyGo`
(`{text, groundedIn}`), `dishes` (≤5, verbatim) and `areaHint`. Measured v1 → v2 on four real
cached captions:

| | v1 | v2 |
|---|---|---|
| candidates with usable tags | 0/9 | **9/9** |
| candidates with a real `whyGo` | 0/9 | **8/9** (ninth correctly null) |
| `whyGo` that is a verbatim caption slice | n/a | **0/8**, checked mechanically |
| location words welded into the venue name | 3/8 | **0/8** across three runs |

No candidate regression; the two zero-place captions still return zero.

**Storage: `saved_places`, not `places`** — the decisive reason is privacy. `places` is not
world-readable, but `places_select_if_saved` lets *any user who saved the same venue* read it, so
tags there would ship one user's caption-derived model output into another's browser. It is also the
reversible direction. All three columns are **SELECT-only for `authenticated`**; the writer's
EXECUTE is `service_role` only. Verified by attack from a real signed-in session — nine forged-write
shapes including the §5.5 POST shape, `on_conflict` upserts, `PUT` and the writer RPC: all `42501`.

**Verified by using the product**, independently of the agents that built it, at 390×844 and
1440×900: tags render title-cased from the normalised stored form; Hebrew tags render RTL beside
Latin ones with `dir="auto"`; the accessible name carries them ("Open Anat Bakery, tagged בורקס,
מאפייה, Hidden Gem"); a 5-tag row wraps in detail and shows 3 + "+2" in the list; a place with no
tags goes straight from category to the note with no gap or placeholder; and a `why_go` that the
gate rejects is genuinely absent from the DOM, not merely hidden.

---

## 4. The finding to carry forward: Hebrew ↔ English place identity

**This is a live defect, not a future concern.**

`places.name` stores whichever script the model happened to choose and there is **no alias anywhere**.
Two users saving the same Tel Aviv venue — one from a Hebrew caption, one from an English one — get
**two `places` rows that nothing will ever merge**. Charter invariant 4 (one physical place, many
people, many TikToks) is quietly broken today, and it worsens as Tel Aviv and Tokyo content lands.

**Verified, so nobody goes looking for a normalisation fix that cannot exist:**

```
normalise('הקוסם')            = 'הקוסם'             normalise('HaKosem') = 'hakosem'  → not equal
normalise('Café Levinsky 41') = 'cafe levinsky 41'  == normalise('Cafe Levinsky 41')  → equal
```

`normalise()` folds accents correctly and deliberately preserves Hebrew and Japanese (a documented
porting-trap comment explains why it must not strip them). It cannot bridge scripts. Carrying the
other name form is the only route. Related: `place_name_key` does not fold accents either, so
`Café Florentin` and `Cafe Florentin` are already two dedup keys today.

**Owner ruling, 2026-08-27: Hebrew ↔ English is the supported scope.** Other scripts stay
best-effort or unsupported. This must not become a generic internationalisation or entity-resolution
project — no language-tagged alias tables, no locale negotiation, no ICU dependency, no per-script
branching. The hard part is not script handling: Hebrew omits most vowels, so `HaKosem` / `Hakosem` /
`Ha Kosem` are one venue and the model is not consistent between runs. Stay conservative — **merging
two distinct venues is worse than failing to merge one**.

**The design is written up and ready to implement:**
`docs/evidence/places/place-alias-design.md`. It rules aliases onto `places` (the opposite answer
from tags, deliberately), withdraws its own first idea of a `place_names` table in favour of
`alt_names text[]` + a generated `match_keys text[]` + GIN, and rules that the dedup guard should
consult aliases **only on exact key equality — never a similarity threshold**. It names the two
traps in changing `resolve_place` and what to verify first, including a deliberately-constructed
false-positive case. `place-alias-extraction-notes.md` is the extraction half, and is honest that
**no model call was ever made with an alias field in the schema** — there is zero evidence yet about
how the model behaves.

---

## 5. Unresolved, in impact order

1. **Production is down, and it is the owner's to fix.** `/map` and `/import` both return **500**;
   `/`, `/sign-in` and `/healthz` are fine and `/healthz` reports `main`'s head commit, so Vercel is
   deploying the right code. **The Vercel project has no environment variables in any environment**
   (`npx vercel env ls production --project p-002` → none; independently confirmed by grepping the
   deployed bundle for a Supabase URL that is not there), so `createServerClient(undefined,
   undefined)` throws before any query runs. Restoring them means entering credentials into a third
   party — the owner's job; `docs/vercel-env-restore.md` is the checklist, and
   `.env.vercel.preview` on disk is **not** a usable recovery source. Production is also still on
   migration `0009` while the code selects `0015`/`0016` columns, so the env restore alone moves the
   failure rather than removing it; the migration push follows, once `PROD_DATABASE_URL` is set.
2. **Coordinates are the model's guess**, and the failure mode is worse and more specific than
   previously recorded — see §6.
3. **Model-assigned tags have no delete path.** ~5 model-chosen labels per save, system-derived, now
   **visible on screen**, none removable. Not an exposure (the row is the user's own) but it *is*
   inferred personal data with no rectification or erasure route — `why_go` especially, being a
   sentence in the model's voice about why *you* saved somewhere. Cheapest fix: a
   `clear_saved_place_extraction(saved_place_id, user_id)` `service_role` function setting all three
   to NULL — no grant change, and NULL is already the normal renderable state. Pairs with the
   `user_tags` column `0019`'s header reserves.
4. **Tags can carry world knowledge the caption does not support.** A food-free caption produced
   `falafel` and `middle eastern`. Tags cannot be substring-gated without killing the useful ones
   (`hotel restaurant` is a legitimate *reading* of "inside Middle Eighty Hotel"). Prompt tightening
   closed it at **n=1, with no gate behind it**. The most likely place for v2 to embarrass the
   product.
5. **`extracted_reason` is still forgeable.** An authenticated client can POST straight to
   `/saved_places` with any value and it lands verbatim; RLS confines it to the caller's own row and
   UPDATE is refused, so a user can lie to themselves and to nobody else. **Severity is unchanged by
   this session** — a review argued it had escalated, then withdrew that argument itself, because it
   was entirely contingent on a `groundedIn` mapping that was reversed (§7). The fix is now *cheaper*
   than `0019`'s header suggests: move `extracted_reason` out of `save_place`'s INSERT and write it
   from the `service_role` enrichment writer that now exists, then revoke the grant. No
   `SECURITY DEFINER` needed. Do it **before any share, export or public-list surface exists**.
6. **`areaHint` has nowhere to live after a save.** It is on the type and in `extractions.candidates`
   but `0019` added no column. `venueQueryString()` and the Maps link handle it at confirm time, but
   anything rebuilding a query *from a saved row* has less than it did. Deliberately not smuggled
   into `places.address_line`.
7. **`/api/imports/probe` has no rate limit.** `rateLimitedLocal` has **zero production call sites**
   (verified by grep), so the honest-status work advertises a 429 the route can never send — against
   a hard 500 Gemini calls/day. `L0-F6-T1` owns the real limiter. The client-side in-flight guard
   added this session stops accidental double-fires, not a determined loop.
8. **A quarter of the library is phantom, and the cause is not what this document used to say.**
   Measured 2026-08-27 on the live local database: **20 saved rows are 15 real places.** Five
   duplicate pairs, and `km_between` was used rather than arithmetic, so these are exact:

   | Pair | Same `name_key`? | Apart | Why the guard missed it |
   |---|---|---|---|
   | La Nonna Brixton ×2 | yes | **91 m** | merge radius is **75 m** |
   | Tokii ×2 | yes | **85 m** | merge radius is **75 m** |
   | HaKosem ×2 | yes | 568 m | that, **and** one row's `country_code` is NULL |
   | Kiaans / Kiaans Tooting | **no** | 18 m | model named one venue two ways |
   | Sycamore Vino Cucina / Sycamore Cucina &amp; Bar | **no** | 26 m | model named one venue two ways |

   `resolve_place`'s near-duplicate guard requires **name-key equality AND ≤75 m**. The model
   supplies neither reliably: re-importing the *same venue from the same caption* moves its guessed
   point 85–91 m, which is 10–16 m outside the radius, and it re-identifies names between runs
   (§7's first bullet, now with a measured consequence). **This supersedes the previous entry here**,
   which blamed NULL `country_code` alone — that explains one pair of five. §4's Hebrew↔English
   alias problem explains none of the four Latin-script ones.

   Two things follow. **The duplicates are visible on the main list** — the same restaurant twice,
   and because the enrichment writer is first-writer-wins per column, the twin is usually the bare
   one, so the product shows the user *less* about a place it is already showing twice. And
   **coordinate accuracy is an identity problem, not a polish problem**: a resolver's stable
   provider place id makes identity exact no matter what the model names a venue or where it guesses
   it. That is a materially better argument for §6 than "the pin is 150 m off", which is invisible at
   demo zoom. Widening the 75 m radius is **not** the fix — it merges genuinely different venues on
   the same street. Do not do it without measuring against a deliberately-constructed
   false-positive case.
9. **The demo library's duplicates are no longer only a fixture.** Item 8 explains them. Left in
   place because they are the most realistic messy-state fixture available — but delete them from the
   UI before any demo, which takes about a minute and is worth more than the fixture.
10. **Low severity, recorded not fixed.** A crafted caption can mint a **blank permanent chip**
    (`U+3164` HANGUL FILLER and friends are zero-width in a browser but pass the database's
    `[[:alnum:]]` guard) — layout survives it, verified. `/api/imports/probe` has no request-body
    bound. Four normaliser functions are now PostgREST-exposed RPCs with unbounded CPU (200k
    elements ≈ 4.5 s). `docs/ux-import-review-screen.md` §8 (motion) remains unimplemented.
11. **`npm run db:test` cannot run against a database with data in it.** Its `extractions` setup
    guard counts the whole table without RLS, so the policy suite is unrunnable locally without a
    reset — and a reset destroys cached `extractions` that cost real model calls. CI is currently the
    only place the whole file runs.
12. **`playwright.config.ts` defaults `baseURL` to `127.0.0.1`.** Against `next dev` on this Next
    version that origin **403s every `/_next/static/**` request**, the page never hydrates, and a form
    silently falls back to a native GET — it looks exactly like a failed login, and it has now cost
    two people time. Use `PLAYWRIGHT_BASE_URL=http://localhost:3000` locally. CI builds and runs
    `next start`, so CI is unaffected; retargeting the default is a CI-affecting change.

---

## 5b. The competitive read: mio travel, 2026-08-27

The owner asked for a close look at **mio travel** (App Store `6754081668`, iOS-first, also Android
and a view-only desktop web app; 4.9★, ~908 ratings worldwide, first released 2025-11-03). It is a
near-exact conceptual competitor: share a TikTok or Instagram post → extracted place → pin on your
own map. **The raw research is deliberately not in this repo** — see `docs/evidence/README.md`.
What follows is what survived review.

**Their positioning is a different job from ours.** *"checking off your bucketlist, one scroll at a
time"* — collect, tick off, then plan a trip. Ours is retrieval: find it again when you are standing
there. Their map home renders **flag-badged country clusters with counts** (UK 352, Germany 245) and
their library screen offers `Your collections (12)` · `Countries (8)` · `All saves (10333)` ·
`Favs (30)`. They ship dated trips with days, times, collaborators, route generation and an AI
planner. Charter §1's "not an itinerary planner" and the no-social-graph stance are the fork, and
they survive contact with the competitor — but they are a **choice about which job to do**, not a
claim to be better at theirs.

**Five findings that change how we should think, not just what we should build.**

1. **Our confirmation step is the category's open wound, and we already hold it.** mio launched
   saving **silently**; a picker arrived four months later, after users asked for it. Their most
   damaging reviews are silent partial loss — places reported saved that are not there. One reviewer:
   *"I'm afraid to remove the TikToks from my saved folder in case it didn't save on mio."* That
   sentence means **mio has not replaced the TikTok saves folder; it sits alongside it.** Charter §3
   invariant 2 is not overhead. It is the moat, and it is already built. The design target is a
   confirm step fast enough to read as a *receipt* — reassurance, not ceremony.
2. **The native share sheet is not an access advantage.** Their own privacy policy states the intake
   verbatim: *"Links to videos you share into the app (e.g., TikTok or Instagram)"* — the same string
   our paste field receives. Being a web app costs us **one app-switch, not one byte of content**.
   That is a materially different world from "we are locked out", and it means a clipboard-aware
   import screen recovers most of the gap for nearly nothing.
3. **They do hold a capability we declined on purpose.** Their founder describes transcribing the
   audio and OCR-ing on-screen text. Both require holding the media file, and no official route hands
   a third party another creator's media — it is the `04` M9 class we ruled out. So part of the
   distance between our ~27% and their (user-reported, ASSUMED) 50–80% is **the price of our
   compliance posture, not a tooling failure.** Their headline **99.3% is conditional** — *"videos
   containing identifiable locations"* — while ours is unconditional over everything pasted. **Those
   two numbers must never appear in the same sentence.**
4. **A large part of the rest is the resolver, not the extractor.** They cross-check pins against a
   commercial index; we use the model's guess. Combined with §5.8, that is two independent arguments
   pointing at `L0-F2b`/D2b. Their own weakest reviewed surface is branch disambiguation — *"it adds
   something with the same name somewhere else no matter how many times i press on the one i want"* —
   which is precisely the multi-branch failure §6 measured in ours.
5. **Near-me as a retrieval mode is an open goal for the category.** Two mio reviewers ask for it by
   name and do not get it. It is the everyday half of our own single primary user
   (`brand-and-product-foundation` §2), and it is `L1-F11` per §0.2. **Narrowed 2026-08-28:**
   "nobody has it" was too strong — Plotline shows distance from the user on every place card and
   sequences trips from a home base. What nobody has is a *what is around me right now* entry
   point, and that is the part still ours to take.

**Where we are clearly behind, stated without flinching:** capture friction; per-place richness
(they carry opening hours, real photos, a *tldr*, "local recs" and "pro tips" — repeatedly named in
5★ reviews); organisation (collections, auto country grouping, favourites); type filtering on the
map; manual add; platform breadth; and a backlog-import path. Several of ours are **gaps wearing a
principle's clothes** — inert tag chips are not restraint, and "TikTok only, Instagram is a designed
redirect" is not a boundary while the redirect's destination does not exist.

**Where they are weak, which is where the opportunity is:** silent partial import loss; a *report and
wait* correction path rather than a fix-it-yourself one; no near-me and no distance; no list export
(*"a way to transfer saves to google maps"* is an unmet request); English-only summarisation, which
our Hebrew↔English scope makes an actual differentiator; and stability — 15 of their 25 releases in
148 days are pure bug fixes.

**One label of ours is wrong in its reason.** Instagram oEmbed is reachable **with no token and no
App Review** (Meta opened it around 2026-06-15; re-verified independently 2026-08-27 — a bogus
shortcode answers HTTP 400 `Media Not Found`, not an auth error, with no credentials sent). The
label stays **UNAVAILABLE** for a better reason: the payload carries no `title`, no `author_name`
and no `thumbnail_url`, and the returned `html` reduces to five visible words. **The blocker is
payload, not authentication**, so no amount of platform paperwork fixes it and `05`'s re-entry
condition should be **closed rather than left open** — the spike has been run and the answer is no.
Evidence: `docs/evidence/capture/raw/08-instagram-oembed-tokenless-2026-08-27.txt`.

## 6. Coordinate accuracy — parked, with the evidence preserved

The owner **parked the `PlaceResolver` direction rather than rejecting it**, and declined to make a
provider decision. Full write-up: `docs/evidence/places/resolver-future-direction.md`. **Do not
re-run these measurements** — they cost real API calls and real time.

**The repo's "65–470 m" figure is not what was measured.** The real shape:

- On **single-location** venues the model is 35–200 m out.
- On **multi-branch** venues it emits a point that is **no branch at all** — 516 m and 1140 m from
  the nearest real one, at `modelConfidence` 0.90–0.99. Invisible to the user and not fixable by
  prompting; it is what averaging over recall produces.
- A gazetteer hit is **~10 m** against the model's ~150 m — one to two orders of magnitude, when it
  hits.

Findings that would otherwise be rediscovered: Nominatim's `importance` is **unusable** as a
confidence analogue (a country-level constant — `L0-F3-T3`'s exit criterion assumes otherwise and
would send someone down a dead end); **Tel Aviv is a data hole**, three target venues verified absent
from OSM entirely, which argues *for* D2b's two-source design rather than against it; and a
shortlist-shaped provider yields **zero `preselect` bands**, so re-banding would convert "unmeasured"
into "certain" — keep `preselect` for the Overture index and instead surface a disagreement when a
single result contradicts the caption's area.

The ODbL analysis is drafted in `docs/evidence/licensing/` and is **not adopted policy** — a draft
sign-off pending a provider decision that has not been made. Two useful facts from it: the OSMF's
board-endorsed Geocoding Guideline treats individual results as *insubstantial extracts* (so `places`
is neither a Derivative Database nor a Produced Work), and storing them permanently is explicitly
allowed, so the charter's "store forever" premise holds. Nominatim's usage policy **requires**
caching, and carries a clause aimed squarely at LLM-generated integrations requiring the
*application developer* to make a deliberate, informed decision and be directly responsible. That is
an owner decision and it has not been taken.

---

## 7. Decisions a new session must not rediscover

- **`rawName` decides identity; `identifiedName` decides display.** The model re-identifies the same
  caption differently between runs. Anything keyed on the inference mints duplicate rows.
- **Branch and area qualifiers are NOT a defect.** An earlier finding said the model inflating
  `La Nonna` → `La Nonna Brixton` broke geocoding; a larger run (n=20) **retracted it** — querying
  with the plain name was *worse* (4/9 vs 6/9), and a short area qualifier disambiguates while
  breaking nothing. What *is* a defect is location words in the **name field** when `areaHint` exists
  for them. Keep the information; fix the field.
- **`whyGo.groundedIn` is not persisted, deliberately.** Mapping it onto `extracted_reason` was
  proposed and **reversed**: that column is browser-forgeable, so a verbatim quote there could be
  forged and attributed to a named creator beside a real source link — and it would invert which
  column is protected, locking the model's soft synthesis behind `service_role` while leaving the
  evidence writable. Its value is as an extraction-time gate, which it already delivers.
- **`modelConfidence` is never rendered** — not as a number, a bar, or a band. It reports 95% on
  coordinates hundreds of metres out.
- **The browser may never send a place fact.** It sends `extractionId` + `candidateIndex` + its own
  note; everything else is derived server-side. Do not widen the confirm contract.
- **The enrichment writer's two arguments are the control, not its WHERE clause.** It bypasses RLS:
  `p_user_id` comes from the server-side session, `p_saved_place_id` from `save_place`'s own return
  value in the same request — never from a request body or a client-supplied id.
- **`normalise()` is the only answer to "are these the same text?"** — resolver, search and tags.
  Tags additionally append an **NFKC** pass: `normalise()` is NFK**D**-based while the database is
  NFK**C**, differing for **11,209 code points** (every Hangul syllable), so the app would hold six
  characters where the column holds two. The pass is appended in `tags.ts` rather than folded into
  `normalise()`, because changing that function moves `poi_index.name_norm` and forces a
  `NORM_VERSION` bump and a full reload.
- **Tags are stored normalised and title-cased at render.** The database's `normalize_tag()`
  lowercases but does **not** fold accents or punctuation, so storing a display label would make
  `Pan-Asian`/`pan asian` and `café`/`cafe` two chips each.
- **App-side bounds must measure the NFKC form**, because the database does and NFKC *expands* — a
  59-character dish normalises to 67 against a 64 bound and is refused.
- **Map identity is `saved_places.id`**, not `places.id`. Both are uuids, so mixing them fails
  silently.
- **`focusPlaceIds` is one piece of state with two writers**, keyed on array identity.
- **500 Gemini calls/day, and the ceiling is per *call*, not per token.** The extraction cache is the
  only lever that matters. Dollar figures anywhere in this repo are Anthropic-priced **projections**
  for the production adapter — the running provider is Gemini, whose price is `undefined` in code and
  logs `costModel: 'unmeasured'`. `09` §2.2's `$0.0032` estimate is stale on the same basis.
- **Six camera movers exist and `06` §9.2 lists four.** `L1-F5-T2` must adopt or replace the other
  two (a settled search; selecting a place from the list).

---

## 8. Environment

Local Supabase (`npx supabase status`) at migration **`0019`**; `.env.local` points at
`127.0.0.1:54321`; `LLM_PROVIDER=gemini`. A `next dev` server is usually already running on port
3000 — **reuse it**, and reach it on `localhost`, not `127.0.0.1` (§5.12). Sign in at `/sign-in` as
`demo@example.com` / `local-dev-preview-1234` (local only).

**Migration state:** local `0019`, **staging `0018`**, production `0009`. Staging was pushed and
proven on 2026-08-26 (15/15 inventory, 22 behavioural assertions, a signed-in run at both
breakpoints); the orphan-object recovery that preceded it is in `docs/evidence/db/orphans/`.
**`0019` exists only locally.** Note `0018`'s ledger row was missing locally and was re-applied
idempotently this session.

**Local database right now:** `places=20`, `saved_places=20` (**10 carrying enrichment**),
`extractions=6`, `sources=17`, `imports=42` (7 `failed`). Keep those `extractions` — they are the
cache standing between this project and its 500/day ceiling, and `npm run db:reset` throws them away.
Re-pasting a **cached** TikTok URL costs **zero** model calls (the cache is read before the model),
which is how the import flow can be exercised end to end for free — worth knowing before spending
against the ceiling to see a screen.

**Those 20 saved rows are 15 distinct venues** (§5.8). Any count you read off this database — "20
places saved" on the map, `places=20` here — is inflated by five duplicate pairs.

**The 10 enriched rows are a mix, and the difference matters.** Five are **genuine v2 model output**
from a real import: Jones Family Kitchen, La Nonna Brixton, MBER London, The Life Goddess, Tokii.
Five are **hand-written fixtures** seeded to exercise the UI: Kiaans Tooting (5 tags, the maximum),
The Laughing Yak, Sycamore Vino Cucina, Anat Bakery (Hebrew tags and dishes), Container (tags with a
NULL `why_go`). Do not read the fixtures as evidence of model quality. The writer is
first-writer-wins per column, so the fixtures were not overwritten by the later import.

---

## 9. The next highest-impact step

**Owner steer, 2026-08-27, and it superseded the previous one twice in a day.** First: bias toward
**visible product progress and completed MVP journeys**, not continued hardening. Then, after the
mio comparison: the priority for the next few days is a **strong, demo-ready MVP that feels
noticeably useful and complete — not continued extraction tuning by default.**

**First, and not a feature: restore the Vercel environment variables** (§5.1), then push the
migrations behind them. Production is on `0009` while the code selects `0015`/`0016` columns, so the
env restore *moves* the failure rather than removing it. Until both are done nothing anyone builds
can be seen by anyone, from a phone or otherwise. Owner-only: it means entering credentials into a
third party.

### 9.1 The build order

**Step 1 shipped on 2026-08-27 — see §0.1.** It is kept below because its acceptance criteria (§9.3)
are only *partly* discharged: the 0-place and 1-place library shapes were never exercised, and tag
chips are still inert. Steps 2 and 3 are re-ordered by the owner's rulings in §0.2 — near-me (step 3)
is now `L1-F11` in L1, and manual add (step 2) is in scope but deliberately not started until it can
be a real place-search experience.

**§0.1b changes what to do next.** Do not extend the viewport-scoped model, and do not start the
rethink either — the owner asked for it to be preserved, not opened. Work that is unaffected by
§0.1b: the caption pipeline's reliability, which §0.2.4 makes the standing priority; `L1-F11`
near-me, though note it was justified partly *by* the viewport binding, so its shape may move with
the rethink; and the pressable tag chip. Production is still down and still owner-only (§5.1).

1. ~~**The map is the query.**~~ **DONE.** The product's own shell is its weakest screen. The camera does
   `fitBounds` over *all* saved places, so London (12) + Tel Aviv (8) opens on a continental view of
   Europe and North Africa with **two cluster bubbles and no individual pins**; the collapsed sheet
   reads `20 places saved`. At zero places the fallback is `center: [0,20], zoom: 1` — a bare world
   map. Three parts, one idea:
   - **Anchor the camera on one cluster, never all of them.** Resolution order: a valid last camera
     (recent, and containing at least one saved place), else the cluster holding the most recently
     saved place, else the largest cluster. Fit to that cluster, capped around z13.
   - **Bind the sheet to the viewport.** The list is always exactly what is on the map and the header
     names the area — `12 places in London`, not `20 places saved`. Today the map is a scoping
     control wired to nothing, which is why it reads as decoration. This is also the correct
     substrate for near-me later: near-me becomes "set the viewport to where I am", not a second
     retrieval system.
   - **Make the chips do what they look like they do.** They are built and inert, and
     `filterPlaces` covers name, category, locality and note but **not tags and not dishes** — so
     "natural wine", "hidden gem", "late night" and "momos" are extracted, rendered, and
     unfindable. mio's reviewers volunteer type-filtering as *the* retrieval feature.

   **Cluster on coordinates (~50 km), not on the `locality` string.** The library already holds
   `London`, `Tel Aviv-Yafo`, `Tel Aviv` and `Tel Aviv` — three spellings for two cities — so a
   city-grouped UI built on the string ships that defect to the user as duplicate rows. Label the
   cluster with the most common spelling inside it; if ambiguous, say `12 places in this area`.

   Costs no model calls, no provider decision, no ODbL gate, no schema change. It is unclosed L1
   work (`L1-F5-T2`'s camera movers, `L1-F8-T1`'s empty state, `L1-F6-T1`'s snap states), not new
   scope. Acceptance criteria are in §9.3.

2. **`L1-F7-T1` — manual add, reclassified again: load-bearing, not CRUD.** It is the floor under
   three failure screens, under the no-places screen (the **modal** import outcome, whose copy
   promises *"add it yourself in a few seconds"* while its primary button calls `reset()`), and
   under the entire Instagram story. Our "designed failure" advantage over mio is real and is
   currently **a beautifully written cul-de-sac**. Note mio's manual add is **place search** — type a
   name, pick the resolved place, save — which is a different object from the caption entry Charter
   §2 forbids; see the open question in §9.2.

3. **Near-me.** The category-wide open goal, the everyday half of the single primary user, and
   cheap once step 1 exists because it is a control that sets the viewport. Currently L2; §9.2 asks
   whether it should be.

**Explicitly demoted, with reasons:** `whyGo` prompt tuning — it is extraction tuning by the owner's
own exclusion, and its output is hidden **6 of 6** on real model output, so tuning it changes what a
user sees in zero observed cases. Hebrew↔English aliases (§4) — real, designed, and invisible in a
demo. The tag/`why_go` clear path (§5.3) — deferred **unless** `security-privacy` rules it a
rectification obligation rather than a nicety, which would beat this ordering; that question has not
been put to them.

**Not started but no longer "polish":** the resolver (§6). Two new arguments arrived this session —
it is the actual cause of §5.8's phantom library, and it is a large share of the hit-rate gap
against mio. It remains parked by owner decision and is a workstream rather than a few days, but the
justification is now much stronger than "the pin is approximate".

### 9.2 Open questions for the owner — to be worked through at the start of the next session

The owner asked, 2026-08-27, that these be carried forward as explicit questions rather than
resolved in passing. **None of them is blocked on more investigation; each is a judgement call.**

1. **Do we accept a lower hit rate as the price of staying inside official APIs?** mio transcribes
   audio and OCRs on-screen text, which needs the media file and has no official route (§5b.3). If
   the answer is yes — and the recommendation is yes — then ~27% is a *stated product position*, not
   a defect, and the no-places screen should say so in the product's own voice rather than
   apologising. If the answer is no, that reopens `04` M9 and is a compliance decision, not an
   engineering one.
2. **Does manual-add-as-place-search fall inside or outside Charter §2?** `mvp-plan.md` §8 files
   manual entry under "Not anywhere" on the grounds that asking the user for caption text defeats the
   product. Place search is a different object with the same resolver and the same provenance
   fields. The current wording may forbid something wider than intended, and it is blocking the
   `L1-F7-T1` in §9.1 step 2.
3. **Do we hold the grounding line, or find a way to be rich *and* honest?** mio's place detail
   carries opening hours, real photos, a *tldr*, "local recs" and "pro tips", much of it plainly
   world knowledge rather than anything the caption said — and it is what their 5★ reviews name. Our
   rule is the opposite: `groundedIn` gates, "an uncertain result beats a confidently wrong place".
   Holding the line is defensible and is currently costing us the richest screen in the product.
   A middle path exists — clearly attributing model knowledge as model knowledge, separately from
   the caption quote — but it is a real change to the extracted-vs-inferred contract and needs a
   ruling, not a drift.
4. **Is near-me still L2?** `brand-and-product-foundation` §2 already promoted it once and called
   that a schedule decision. Nobody in the category has it. It may belong in L1.
5. **Should export exist?** mio has none and their users ask for it. "Your places are yours, take
   them to Google Maps whenever you like" costs little, differentiates on the same axis as our
   privacy posture, and gives the course submission a clean data-portability story. Charter §4 never
   considered it — so this is a scope addition, and Charter §4 says new ideas go to a Future list
   unless the owner rules otherwise.
6. **Backfill the phantom duplicates?** §5.8 measures 20 saved rows over 15 real places. Merging
   them is a data decision on real rows and needs a specific instruction; so does any change to the
   75 m radius, which must not be widened without a false-positive test.
7. **The TikTok data-export experiment** (`docs/evidence/capture/01-tiktok-data-export.md`). Their
   docs list *Favourite Videos* with a link per row — the user's whole back-catalogue in one action,
   captions still via oEmbed, so it stays inside Charter §2. **No real export file has been
   inspected**, and the unknown that could kill it is how long an export takes to arrive. It costs
   the owner one request against their own account, not a build.

### 9.3 Acceptance criteria for §9.1 step 1

Verifiable without asking anyone, at **390×844 and 1440×900**, signed in, across library shapes
**0 · 1 · 8-in-one-city · 20-across-two-cities (the current library) · 20-across-four-cities**:

- **No empty view, ever.** Every non-zero shape settles with at least one **individual** pin on
  screen. A view of nothing but cluster bubbles is a fail.
- **A name is readable with zero interaction.** At least one place *name* is on screen as text once
  the map settles — not a count, not a number in a bubble.
- **Panning changes the sheet.** Count and rows track the viewport; `Nothing saved in this area` is
  a designed state with a `Show all places` escape. No pan is ever a no-op.
- **One place** is shown with surrounding context, not zoomed to maximum on a blank tile.
- **Zero places** shows no bare world map: a plausible regional view, the paste field as the primary
  control, and one line saying what the product does. No permission prompt.
- **Camera movers reconciled.** §7 records six movers against four documented; the home default is a
  seventh. Enumerate them in one place and make the list match. This closes `L1-F5-T2`'s owed
  reconciliation.
- **No regression.** `/map` → detail → back → `/import` → back leaves `getCenter()`/`getZoom()`
  unchanged, and the post-confirm flight to new pins still overrides the home default — verified with
  a real TikTok, not a fixture.
- **Tags filter and are searchable**, including a Hebrew tag, at both breakpoints.

**Deliberately out of scope, so it is not absorbed:** near-me and geolocation, clustering
sophistication, pin restyling, the Protomaps fork, motion moments, any extraction or resolver work.
Scope creep to refuse now: colouring pins by tag, a cities list or city switcher UI, an onboarding
carousel, and "add near-me while we're in the camera code".

### 9.4 Cheaper things worth doing when a session has room

- **`canonicaliseTikTokUrl` rejects real TikTok links, with false copy.** Verified 2026-08-27:
  `www.tiktok.com/share/video/<id>/` → `UNSUPPORTED_URL` → *"That's a profile, not a post."* and
  `www.tiktokv.com/share/video/<id>/` → `UNSUPPORTED_HOST` → *"Instagram and YouTube aren't
  supported yet."* Both messages are false; both forms are what TikTok's own share sheet and its
  **data export** emit. oEmbed returns the **full caption** for the `tiktok.com/share/video/<id>/`
  form (HTTP 200, independently confirmed), and the id is already in the path, so the fix costs no
  extra network call. Same class as the Instagram-redirect boundary: a real TikTok link being told it
  is not one. This gets more important, not less, if the export path in §9.2.7 ever lands.
- A **clipboard-aware import screen** — if a TikTok URL is already on the clipboard, the primary
  action becomes one tap. This is the cheapest recovery of the share-sheet gap (§5b.2).
- A **real deploy health check**: `/healthz` returns `ok:true` with no environment variables set at
  all, which is why production has been down since PR #20 with nothing noticing.
- Scoping the policy suite's counts to its own fixtures (§5.11), and `Spot` owning the three
  enrichment fields, which deletes the one documented cast in `src/ui/place/enrichment.ts`.
