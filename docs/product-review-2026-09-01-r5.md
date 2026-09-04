# Product review — round 5, 2026-09-01

> **The last of five.** Written 2026-09-01, 12:35–14:40 local, on `no-crumbs-implementation` at
> **`cbfd50c`**, against the **already-running** `next dev` on **4311** and the real local Supabase.
> No server was started or stopped.
>
> **The environment, measured rather than taken from the dispatch — and it matched it.** Four
> containers up ~18 h (`supabase_db_P-002` 54322, `supabase_kong_P-002` 54321, `_rest`, `_auth`).
> `psql` is not on this host; every database read went through
> `docker exec supabase_db_P-002 psql -U postgres`. `supabase_migrations.schema_migrations` tops at
> **`0037` — `model_prose_is_labelled_and_removable`**. Row counts at the start: 8 accounts, 11
> saves, 9 places, 1 collection, 4 `profile_names`, 0 `place_mentions`. All six were the dispatch's
> numbers.
>
> **Both traps were paid for in advance.** Every script waits 3 s after `domcontentloaded` and reads
> `#email` back before submitting (`ui-review-2026-08-31.md` §7.5). Every visibility claim below is
> `Element.checkVisibility()`, never a class assertion.
>
> **Two of my own instruments lied, and both are reported where they lied** — §4.1's string matcher
> under-reported the account menu, and §4.1's offline probe reported a clean result while clicking
> nothing. Neither was caught by inspection; both were caught by a control.
>
> Rounds 1–4 are [`r1`](product-review-2026-08-31-r1.md), [`r2`](product-review-2026-08-31-r2.md),
> [`r3`](product-review-2026-08-31-r3.md), [`r4`](product-review-2026-09-01-r4.md). None of their
> findings, `place_mentions`, §7.5's hydration bug, or the two `src/` follow-ups `0037` names are
> re-reported here.

---

## 1. Round 4's five, audited

Same framing the dispatch asked for: **did it land the value, or only the feature?**

### 1.1 The account menu — **the value, and I checked it rather than taking it**

The dispatch's claim holds and then some. At 1440×900 (`button[aria-label^="Your account"]`) and at
390×844 (`button[data-profile-trigger]`), one real click each:

| | desktop | mobile |
|---|---|---|
| `aria-haspopup` before press | `dialog` | `dialog` |
| `aria-expanded` after press | **`true`** | **`true`** |
| popup box | 320 × 457 at `x 1104, y 68` | 320 × 457 at `x 12, y 318` |
| `scrollHeight / clientHeight` | 455 / 455 | 455 / 455 |
| console errors, whole session | **0** | **0** |

All five controls render, are `checkVisibility() === true`, and every one sits inside the popup's own
box: `Your library`, `Account settings`, the `Light / Dark / System` radio group, `Sign out`,
`Delete my data`. Round 4 measured `aria-haspopup: null` and 12–17 React errors per press.
`scratchpad/r5shots/02-accountmenu-{d,m}.png`.

**I did not stop at "it opens."** I created a fresh account through the product's own sign-up, opened
the menu on it, and ran `Delete my data` to completion — §6.1. The menu is not just reachable, it is
load-bearing and the thing it gates works.

**A note the fix did not cause and does not need to.** The menu header prints the first name where a
`profile_names` row exists (`Ravi` on the new account) and the email where it does not
(`demo@example.com`). That is round 4 §3's documented deferral behaving as documented.

### 1.2 The popover cap — **most of the value, and the lane's counter-evidence was right**

The prescribed two-line fix was refused on measurement and something better shipped. Three changes
landed, not one:

| | round 4 | now |
|---|---|---|
| cap | `max-h-[min(70vh,26rem)]` → 416 px | **`max-h-[min(50vh,28rem)]` → 448 px** (`place-sheet.tsx:2012`) |
| `scrollHeight`, HaKosem / Old North / Florentin | 844 / 879 / 988 | **768 / 787 / 912** |
| hidden | 51 % / 53 % / 58 % | **42 % / 43 % / 51 %** |
| `Been here` | `y 448–492` against a card bottom of 461 — 13 px of a 44 px control | **`y 404–448`, bottom edge exactly on the card's** |
| scroll affordance | none | **`mask-image: linear-gradient(#000 0, #000 calc(100% − 24px), transparent 100%)`** |
| the docblock's own numbers | stale by 160–304 px (round 4 `E7`) | **`place-sheet.tsx:2410` now reads 448 px against 796–940 px. Correct.** |

**Verdict: the value largely landed.** The card no longer runs off the top of the viewport, the clip
no longer falls mid-glyph, `Been here` is on screen, and `E7`'s stale comment was repaired in the
same pass — that last one is the part that shows the lane read its own finding rather than its ticket.

**What did not, and I nearly mis-reported it.** I wrote "there is still no fade" from the screenshot
before measuring, and the measurement contradicted me: the fade is there. What is true is narrower
and more useful — **the fade is 24 px and it lands across the bottom edge of a 44 px light-on-light
button, so it is not perceptible.** Measured on `Café Florentin`: card bottom `461`, `Been here`
bottom `448`, gap `13 px`, `offsetWidth − clientWidth = 0` (no scrollbar). The photograph
(`scratchpad/r5shots/11-pop-CafFlorentin.png`) shows a card that reads as **finished**, and 464 px of
912 — `Add to a collection`, `Change`, `Add a note`, `Open on TikTok`, `Google Maps`, two nearby
places and `Remove from your places` — is below it. The failure mode changed from "looks broken" to
"looks complete", which is a smaller bug in a more expensive place. It stays at the top of the queue;
it is not in my five, because it is round 4's finding and the dispatch asked me to judge it, not
re-file it.

### 1.3 `0037` — **the feature, and the repository said so itself within the hour**

`0037` is applied. `review_saved_place_why_go(p_saved_place_id uuid, p_keep boolean)` and
`set_saved_place_dishes` are live, `SECURITY DEFINER`, granted `execute` to `authenticated`.
`grep -rn "review_saved_place_why_go" src/` returns **zero**; the only two hits in the repository are
in the guard that exempts it. `information_schema.column_privileges` still shows `authenticated`
holding **SELECT only** on `why_go` and `dishes`.

The migration's own §Ruling 1 is the best-argued thing in this round: it declines `0036`'s shape for
prose, on the ground that *editing a sentence is authorship and the product already has a column for
the user's own prose*, and it declines to pre-empt **OD-1** in a migration. Both are right, and both
are more restrained than the round-4 finding that asked for them.

**But the user still cannot remove the sentence, because nothing calls the function.** Value: none
yet. The dispatch says the two `src/` follow-ups are known and queued, so I am not re-reporting them —
I am recording that the round-4 pattern held exactly: **the database half landed on the day, the
product half did not, and the guard built for that pattern caught this instance of it before a
reviewer could.** That is the system working. It is not the same as the user being able to do the
thing.

### 1.4 The orphan guard — **the value, and it is the best work in the round**

`npx vitest run tests/unit/orphans-have-consumers.test.ts` → **1 file, 30 tests, all passing, 295 ms**
at `cbfd50c`.

I did not have to construct a failure to trust it, because **it constructs its own, every run**: a
positive control per consumer kind (`collection_role` reached only from RLS policies;
`start_import` reached only as a string literal from a route; `place_lookup_get` reached through a
`const`), a negative control (`__not_a_function`), a DDL-versus-call control that proves
`grant`/`comment`/`drop`/`create` are not calls, a revoke-and-drop replay, and a SQL-comment control.
Seven numbered design details, each traced to a real file it would otherwise have been fooled by —
including `map-surface.tsx:20`, a commented-out import sitting above a docblock that says *"Do not
wire it in"*, which an unstripped parser would read as the wiring.

And the exemption mechanism expires itself: `exempts nothing that now has a caller` and
`exempts nothing that is no longer granted` mean the day someone wires `review_saved_place_why_go` up,
the guard fails until the entry is deleted. **A census that cannot become a permanent hole.** This is
the answer to the class round 4 named, and it is a better answer than the finding asked for.

One craft item on it, `G2` below.

### 1.5 The places↔collections swap — **the value, cleanly**

A per-frame `requestAnimationFrame` sampler at 1440×900 with
`matchMedia('(prefers-reduced-motion: reduce)').matches === false` **asserted, not assumed**, reading
`[data-view-swap]` and its `[data-view-layer]` children every frame:

```
places -> collections
   +11 ms  hosts=1  current 1.000
  +213 ms  hosts=2  LEAVING 1.000   current 0.000
  +478 ms  hosts=2  LEAVING 0.148   current 0.924
  +601 ms  hosts=2  LEAVING 0.000   current 0.995
  +736 ms  hosts=1  current 1.000                     collections view settled

collections -> places
    +5 ms  hosts=1  current 1.000
  +156 ms  hosts=2  LEAVING 1.000   current 0.000
  +253 ms  hosts=2  LEAVING 0.302   current 0.901
  +470 ms  hosts=1  current 1.000                     places list settled
```

**Every frame in both directions has a leaving layer at a legible opacity.** Round 4's hole — the
`+5 ms → +197 ms` window where the places list was gone and the collections view was at `opacity 0`,
photographed as a bare card — does not occur. The `collections-scope.tsx:217` scope boundary that
made the request undeliverable was resolved rather than argued with.

---

## 2. The five, ranked by value

### 1. A network blip while you are standing outside the place destroys the screen, and your note with it

| | |
|---|---|
| **What** | Marking a place *been*, changing its category or saving a note when the request does not arrive tells you it did not arrive, and leaves you looking at your map with what you typed still in the box. |
| **Why it matters** | This is a map you use **outdoors, on a phone, on cellular** — the product's whole purpose is retrieval at the moment you are near the place. A dead zone, a lift, a tunnel, a handover is not an edge case there; it is Tuesday. Today, pressing *Been here* outside HaKosem with no signal does not fail: it **replaces the entire application** with a full-page error screen. The map is gone, all seven pins are gone, the place you were looking at is gone, and the screen says *"This screen didn't load. The fault is ours, not anything you did."* On the note path it is worse — the sentence you just typed, in your own words, about a place you are standing in front of, is destroyed with the screen. `0034` shipped a whole first-writer-wins migration to stop the *product* overwriting a user's note; a two-second signal drop deletes it before it is ever written. |
| **Evidence** | **Measured at both breakpoints with `context.setOffline(true)`, and the detector discriminates.** Three controls, each pressed while offline, each measured by whether the error-boundary copy is on screen and how many `button[aria-label^="Open "]` pins survive: <br>· `Been here, HaKosem` at **390×844** → boundary **true**, pins **7 → 0**<br>· `Been here, HaKosem` at **1440×900** → boundary **true**, pins **7 → 0**<br>· `Change` → `Bar` at 390×844 → boundary **true**, pins **7 → 0**, 3 POSTs issued, `category_override` still `NULL` in the database<br>· `Save note` (`Neve Tzedek Coffee House`, text *"offline note probe"*) → boundary **true**, pins **7 → 0**, 3 POSTs issued, `saved_places.note` unchanged in the database, text gone from the DOM<br>**Negative controls on the same probe, same session:** the first press of `Remove from your places` (which only reveals the confirm step) and `Add to a collection` → boundary **false**, pins **7**. So the probe distinguishes. Screenshots `scratchpad/r5shots/81-offline-after-been.png`, `83-offline-been-{m,d}.png`, `86-category-offline.png`. |
| **The cause, and it is one grep** | `grep -c "catch" src/components/sheet/saved-place-edits.tsx` → **0**. Five server-action call sites in that file — `:132` `setSavedPlaceVisited`, `:259` `updateSavedPlaceCategory`, `:410` `updateSavedPlaceName`, `:562` `updateSavedPlaceNote`, `:678` `deleteSavedPlace` — every one of them `await`ed bare inside `startTransition`. A Server Action is a `fetch`; when the transport fails the promise rejects, the rejection escapes the transition, and React escalates it to `src/app/error.tsx`, which is a production route file, not dev chrome. Three of the five are confirmed by experiment above; all five are the identical shape. |
| **The rule underneath it, and this is the part worth keeping** | `saved-places.ts` is *carefully* written: every action returns `Promise<SavedPlaceResult>`, every database error becomes `{ ok: false, message }`, `count === 0` becomes `GONE`, and every call site handles `result.ok === false` by setting a visible error. The team chose failures-as-values on purpose. **A `Result` type covers everything the server can say. It cannot cover the server not answering — and on a phone, not answering is the failure.** The product already knows this rule and applies it elsewhere: `add-by-name.tsx`'s header says *"Offline is checked before the request, not after it (§6.7), so an offline submit costs nothing and says the true thing immediately."* One screen has the posture; the five controls a person actually presses do not. That makes it **a missing rule, not an oversight** — no one of these five is twelve lines from a sibling that gets it right. |
| **Effort** | **An afternoon for the bleeding, a few days for the posture.** The afternoon: wrap the five `await`s in `try/catch`, route the rejection into the `setError` slot each site already has, and keep the note draft in state. One file. The few days: `navigator.onLine` checked before the request the way `add-by-name` does, a retry that does not lose the draft, and a Playwright spec with `setOffline` — which is the only kind of test in this repo that could have caught it, since `vitest.config.ts` sets `environment: 'node'`. |
| **What would change my mind** | Evidence that a production build catches the rejection where `next dev` does not. I did not run `next build` — it writes `.next/` in a tree other lanes are working in, and `agent-guardrails.md` §8 rule 30 puts world-stopping operations outside a reviewer's remit. I rate that unlikely: the boundary that fired is the product's own copy from `src/app/error.tsx`, not a dev overlay, and an unhandled rejection escalating to the nearest boundary is framework behaviour rather than instrumentation. **It is one command for the orchestrator and it should be run before the fix, not after.** |

### 2. When two TikToks name the same place, the product knows and never says so

| | |
|---|---|
| **What** | A saved place that more than one post named shows all of them, so *"three of the videos you saved named this place"* is a thing your map can tell you. |
| **Why it matters** | This is the strongest signal this product can produce and it is the one it already has the data for. If three creators you chose to follow, on three separate nights, all named Café Florentin, that is worth more than anything on the card today — and it is **entirely derived from saves the user themselves confirmed at the review screen**. It is not a rating, not popularity, not trending, not editorial, not a social signal, and not an assertion about the world: it is a count of the user's own imports, and `product-edge-2026-08-31.md` forbids none of it. The product's own edge document says the refusal-to-assert half is table stakes against the three competitors that do our job; corroboration across your own library is a second candidate for the edge that the schema already pays for and the read path throws away. |
| **Evidence** | **Source-level, and I am labelling it that way because this library cannot photograph it** — all 11 saves in this database have exactly one linked source, so the two-source card has never rendered. What is measured is that the path is deliberate at every layer except the last: <br>· `saved_place_sources` is many-to-many by design (`08 §3.6`), and `get-spots.ts:131` selects the whole array.<br>· `save_place`'s body inserts into it with **`on conflict do nothing — re-importing the same post twice: idempotent`** (read off `pg_get_functiondef` on the running container). A *different* post naming the same place is not a conflict, so it adds a row. The path is expected, not accidental.<br>· `0034` (note first-writer-wins) exists **because** saving a place you already hold is a real, frequent path, and `confirm/route.ts:321` reports `already_saved` separately from `saved` precisely because *"re-importing a place you already had came back as"* the wrong news.<br>· And then `get-spots.ts:151` `earliestSource()` sorts the array by `added_at`, takes **`linked[0]`** at `:156`, and returns `SpotSource \| undefined` — a single object. **The port cannot carry a second source.** The other rows are discarded silently, at the boundary, with a docblock that says so plainly: *"this slice renders one."* |
| **The rule underneath it** | The comment at `:147` is honest and is exactly where the value leaked: *"`saved_place_sources` is many-to-many; this slice renders one, so it takes the earliest-linked one rather than an arbitrary array order."* That is a correct fix to a correct problem — determinism — and it settled the question so well that nobody asked the next one. **When a port narrows a one-to-many to a one, write down what is being dropped and who would have wanted it**, because a docblock that explains the narrowing reads as a decision even when it was only a shape. |
| **Effort** | **A feature, and a small one for what it returns.** No migration: the rows exist. (a) Widen `SpotSource` to `sources: readonly SpotSource[]` with the earliest first, so nothing that reads `sources[0]` changes behaviour. (b) On the detail card, under the existing *Saved from @handle* line, list the others — `ux-interaction` rules the form; the honest one is a list of handles, not a number in a badge, because a number is the shape that reads as a score. (c) The list row is where it earns its keep: a place two posts named is the one you want to find again. **Do not turn this into a sort or a rank** — that is the line between "your library remembers" and the thing the edge document refuses. |
| **What would change my mind** | A measurement that two-source saves are rare in real use. Every save here has one, and this database is fixtures plus a handful of real imports. If the owner's own library — the only real corpus that exists — has no place named by two different posts, this is a feature for a case that does not occur, and it drops out. **That is one query against the owner's production rows and it should decide this before anyone builds it.** |

### 3. The recovery on the modal import outcome puts its answer above the question, and its only words are one pixel wide

| | |
|---|---|
| **What** | Pressing *Search* on the no-places screen visibly answers, in the place a person is already looking — under the field they typed into. |
| **Why it matters** | `mvp-plan.md` prices the hit rate at ~27 %, which makes *"No places in this one"* **the modal outcome of an import**, and `add-by-name.tsx`'s own header calls its search field *"the half of that screen that makes it a destination rather than a dead end."* So this is the most-reached recovery in the product. Today the sequence reads backwards: you type into a field, press a button to its right, and the answer materialises **above the label that introduced the field**, while the only sentence describing what happened — *"1 place matches 'Miznon Tel Aviv'."* — is rendered in a **1 × 1 px** box. A person who does not happen to glance up sees a button press produce nothing, and the natural response is to press it again — against a documented 100/day provider ceiling. |
| **Evidence** | **Measured at both breakpoints against a real lookup** (one `POST /api/imports/place-search`, 200, ~1.3 s; nothing saved). At 1440×900: result row `y 480–534`; the offer line *"Know where this one is? Add it by name."* at `y 543`; the input at `y 571`. So the answer sits **63 px above its own label and 91 px above the field**. At 390×844 the same inversion: result at `y 526`, field below it. The count element measures `w 1, h 1` at both widths (`checkVisibility() === true`, so it is announced and not seen). Selecting the result promotes *"Add to my map →"* and *"Back to results"* — also above the field. Photographs `scratchpad/r5shots/51-abn-results.png`, `52-abn-{m,d}.png`, `53-abn-selected-{m,d}.png`. |
| **What is right about it, because most of it is** | The cost discipline on this screen is excellent and finding 3 must not cost it: one lookup per explicit submit, no type-ahead, no debounce, no search on blur or paste, a second submit refused rather than queued, no autofocus (correctly — three in four imports land here and raising the keyboard over the caption would be the worst thing it could do), and no auto-select at N = 1. Every one of those is argued in the file. The defect is purely where the answer is painted. |
| **Effort** | **An afternoon.** Move the results list below the input in `src/app/import/screens/add-by-name.tsx`, and promote the count line from `sr-only` to a visible caption above the list — the sentence already exists and is already written in the product's voice, so no new copy is needed and `voice-and-vocabulary.md` is not engaged. |
| **What would change my mind** | A deliberate ruling that the results belong above so the field stays adjacent to the software keyboard on a phone. That is a real argument. It does not survive the desktop measurement, where there is no keyboard and the answer is still above the question — and it does not explain the 1 × 1 px count either way. |

### 4. Outside thirteen metro areas, the first thing this product ever shows anyone is London

| | |
|---|---|
| **What** | A new account's first screen opens over somewhere the person has a relationship with, or over nothing at all — not over a specific foreign city presented as if it were theirs. |
| **Why it matters** | The empty map behind the paste field is, in `viewport.ts`'s own words, *"the first thing the product ever says about itself."* A person in Toronto, Amsterdam, Delhi, São Paulo, Warsaw, Chicago, Mexico City or Lagos signs up and lands on **central London** — river, Westminster, City of London, street labels and all. It is not a neutral backdrop; it is a specific, legible, wrong place, and it says the product was built for somewhere else. The mechanism that would get it right **exists, is well designed and works** (below); it simply covers thirteen zones out of the several hundred IANA publishes, and nothing anywhere measures what fraction of arrivals fall through. |
| **Evidence** | **Measured across six emulated time zones on a real new account, six cold sign-ins, photographed.** `ZERO_STATE_REGIONS` (`src/ui/place/viewport.ts:47`) holds exactly 13 entries; `EMPTY_LIBRARY_BOUNDS` at `:105` is `boxAround(ZERO_STATE_REGIONS['Europe/London'])`; `zeroStateBounds()` at `:118` returns it for any unlisted zone.<br>· `Asia/Jerusalem` → **Tel Aviv**, correct (`64-zero-Asia_Jerusalem.png`)<br>· `America/Toronto` → **London** (`64-zero-America_Toronto.png`)<br>· `Europe/Skopje`, `Asia/Kolkata`, `America/Sao_Paulo`, `Europe/Amsterdam` → **London**<br>The table has `America/New_York` and `America/Los_Angeles` and not `America/Chicago`; it has `Europe/London`, `Paris`, `Berlin`, `Madrid`, `Rome`, `Lisbon` and not `Amsterdam`, `Warsaw`, `Athens`, `Istanbul`, `Dublin`; it has `Asia/Tokyo` and `Asia/Bangkok` and neither `Asia/Kolkata` nor `Asia/Shanghai` nor `Asia/Dubai`; it has no row anywhere in Africa or South America. |
| **My own hypothesis died here, and the correction is the useful half** | I filed this as *"the zero-state is hard-coded to London"* after seeing it on this machine, and it was wrong. The mechanism is right and is better than most products manage: the region comes from `Intl.DateTimeFormat().resolvedOptions().timeZone` — **no permission prompt, no IP geolocation, no `navigator.geolocation` on page load**, and the docblock explicitly forbids ever rendering the value as markup because that would be a hydration bug and a privacy question in the same commit. This host reports `Europe/Skopje`, which is not in the table, so I was looking at the fallback working exactly as designed. The finding is not a defect in the mechanism. It is that **a coverage table shipped with no coverage measurement.** |
| **Effort** | **An afternoon**, and the file says so itself: *"Adding a row is a one-line change with no other consequence."* Extend to the ~60 zones that cover the large majority of populated ones, and add the guard that is actually missing — a test asserting that a named list of high-population zones each resolve to a metro rather than to the fallback, so the next person who ships a lookup table as a UX default has to say what it misses. |
| **What would change my mind** | An owner ruling that the fallback should not be a real city at all — that an unrecognised zone deserves a deliberately abstract ground rather than someone else's capital. I would agree with that ruling and it makes the finding smaller, not larger: it becomes one constant instead of sixty rows. What is not defensible is the current state, which shows most of the world a specific city and has no way to know it is doing it. |

### 5. Fifteen filter chips for seven places, twelve of which select exactly one

| | |
|---|---|
| **What** | The facet row offers narrowings that actually narrow, so the controls above your library are proportionate to the library under them. |
| **Why it matters** | A facet earns its space by **partitioning** a list. A facet that isolates a single item is a link, and the list two rows below is already a list of links. Right now, on a seven-place library, the panel offers fifteen chips — `Café 5`, `Restaurant 1`, `Bar 1`, `Coffee 4`, `בית קפה 2`, then `Bakery 1`, `Brunch 1`, `Espresso Bar 1`, `Hidden Gem 1`, `Late Night 1`, `Middle Eastern 1`, `Morning 1`, `Oat Milk 1`, `Port View 1`, `Quiet 1` — and **twelve of them select one place**. Nothing is lost by hiding them: search already matches tags (`filter-places.ts` projects them through the same `toSearchablePlace`), and every tag stays visible on its own place's card. What is gained is the panel back. |
| **Evidence** | **Measured at 1440×900 on the demo library.** 15 chips, 12 carrying `, 1 place` in their accessible name. The chip band runs `y 268 → 640` — **372 px, 41 % of a 900 px viewport**. The first place row (`HaKosem`) starts at **`y 656`**, so **73 % of the panel's height is controls before the first place**, and exactly one full row fits above the fold. `scratchpad/r5shots/40-thumbs-d.png`. |
| **This is not the panel-emptiness ruling, and I want that on the record** | The standing ruling is that the desktop panel's *size* at a short list is correct, because its size is a promise about where content appears. I am not touching the panel's size: this finding is about what is **inside** it. The fix leaves the panel exactly as wide and as tall as it is and puts places where twelve singleton chips are. |
| **Effort** | **An afternoon.** `src/ui/place/tag-filter.ts:150` `tagFacets()` already takes a `limit`; it has a **cap and no floor**. Add a minimum count — the natural value is 2 — beside the existing `MAX_TAG_FACETS = 12`. On this library the tag row goes from 12 chips to 2 (`Coffee 4`, `בית קפה 2`), the band drops from 372 px to roughly one row, and four places clear the fold instead of one. The floor is self-limiting: at 300 places there are plenty of multi-count tags, so the cap goes back to being the binding constraint and nothing changes. The category row shows the same shape (`Restaurant 1`, `Bar 1`) but is a fixed taxonomy that grows with the library, so leave it. |
| **What would change my mind** | Evidence that people tap singleton chips. A singleton chip is a fast route to a place whose name you have forgotten but whose quality you remember — *"the one with the port view"* — and if that gesture is real then the chips are earning the space. That is an analytics question this product deliberately does not have the means to answer, so the honest tiebreak is the owner's own use of their own library. |

---

## 3. The craft pass

Unranked. Numbered `G1`–`G7` so they do not collide with `C1`–`C10` (r2), `D1`–`D12` (r3) or
`E1`–`E11` (r4). Every item has a file, a number or a marked screenshot.

### G1. The account menu is a `role="dialog"` you can Tab out of, and Escape puts you in the map controls · **measured** · 1440×900
Focus the trigger, press `Enter` (identical for `Space`): `aria-expanded` → `true`, `aria-haspopup`
→ `dialog`, and focus is correctly placed on the first item (`Your library`). Then four Tabs walk the
menu — `Account settings`, the theme radio group, `Sign out`, `Delete my data` — and **the fifth
leaves the open dialog**: `Map of your saved places`, `Toggle attribution`, `CARTO`, `OpenStreetMap`.
`aria-modal` is `null`. `Escape` closes it (`aria-expanded` → `false`) but focus lands on an `<a>`,
not on `button[aria-label^="Your account"]`. The scrim decision at
`src/components/nav/profile-menu.tsx:228` is argued and is right — a full-viewport wash at desktop
widths *would* be "a modal claim the menu does not make" — but *non-modal scrim* and *no focus
containment* are separate choices, and only the first was made deliberately. **My first probe reported
this much worse than it is** (`document.activeElement` on `<body>`, three items reachable); that was a
timing artefact of pressing Enter at the end of a Tab walk, and focusing the trigger directly is what
corrected it.

### G2. The orphan guard's title says five and its assertion says seven · **measured** · `tests/unit/orphans-have-consumers.test.ts`
The docblock above `EXEMPT_FUNCTIONS` opens *"Five functions granted `execute` to a role that nothing
calls"*; the test is named `carries exactly the five exemptions that were argued for`; the array holds
**seven** and the assertion is `toHaveLength(7)`. `0037`'s two entries were added correctly, with the
best-written exemption comment in the file, and the two places that count them were not. `:453` also
carries four extra spaces of indentation its siblings do not. Trivial to fix and worth fixing on this
file specifically: it is the repository's newest guard and its credibility is the whole product.

### G3. Deleting your account ends on a marketing page with no acknowledgement · **measured** · 1440×900
Timed from the press of `Delete my account`: **+309 ms** still on `/map`, **+1203 ms** on `/` showing
*"A PERSONAL MAP — Your saved places, on one map"* and the three-step landing pitch. No confirmation,
no receipt, no line saying what was removed. The account is genuinely gone (§6.1), so a person's only
evidence that the most consequential action in the product succeeded is that they got logged out onto
an advertisement for it. Compare `RemoveSavedPlace` (`saved-place-edits.tsx:650`), which for the far
smaller act of removing one bookmark keeps the name on screen, focuses `Cancel` rather than the
destructive button, and says *"Your note goes with it."* One sentence on the landing page, gated on
arriving from a deletion, closes it.

### G4. The saved list downloads full-resolution originals to paint 44 px squares · **measured** · 390×844, cold cache
Five `<img>` in the list, five responses, **6,364,264 bytes** total — the largest is `Café Florentin`
at **3,636,933 bytes, 5312 × 2988**, painted into a `size-11` box (44 CSS px, 88 device px). That is
roughly 4,100 × the pixels required. The rows were still blank grey boxes at the 5 s mark and filled
between 5 s and 7 s. **The honest caveat, stated because it changes the size of this item:** four of
the five are Wikimedia seed fixtures, not production shapes. The one real production URL —
HaKosem's TikTok CDN thumbnail — is **157,994 bytes at 720 × 1280**, still about 130 × the painted
area, and that is what every real row looks like. The `next/image` refusal at
`place-sheet.tsx:1331` is argued and I am not challenging it (expiring signed third-party URLs are a
real reason). What is missing is smaller: no `width`/`height` attributes, no `sizes`, and
`loading="lazy"` on rows that are in the initial viewport, which is what makes the list look broken
for several seconds on a cold open.

### G5. The no-places screen mixes alignment inside one column · **measured** · 390×844
Same 350 px column at `x 20` throughout. `No places in this one.` and `Know where this one is? Add it
by name.` compute `text-align: start`; `Try another TikTok link` and `Back to the map` compute
`center`. This is round 2's `C5` on a third surface, which is what makes it worth writing down again
in a different way: **three instances make it a missing rule, not three bugs.** A column has one
alignment, and a footer action that centres itself is asserting it belongs to a different block than
the one it sits in.

### G6. The fixture for the modal outcome argues against the screen it exists to show · **measured** · `src/app/import/_lib/dev-screen.ts:138`
`/import?state=no-places` renders *"We read the caption, and it doesn't name a place we can put on a
map"* directly above the caption it read, which is *"Three places worth the queue in Tel Aviv:
HaKosem, Cafe Cafe, and Miznon."* Three names, comma-separated, in the language the extractor is
built for. Anyone reviewing this screen — the one `mvp-plan.md` calls the modal import outcome —
is reviewing it against evidence that the screen is wrong. Round 4's `E3` is the same class (a fixture
that hid a new feature); this is the sharper instance, because the fixture does not merely fail to
exercise the screen, it contradicts it. One line: a caption with no place in it.

### G7. `/account`'s two `Save` buttons and round 4's `E1`–`E11` were not re-measured · **not measured**
Recorded so the reader is not misled about coverage: I did not re-check round 4's craft items and am
making no claim about them. `E9`'s untracked `reduced-motion-probe.mjs` is still at the repository
root at `cbfd50c` — I saw it in `git status` on arrival, it is not mine, and I left it alone.

---

## 4. What I checked and found healthy

**`Delete my data` works end to end, and it is the last unbuilt L1 product feature.** Signed up a new
account through the product, opened the account menu, pressed `Delete my data`, read the two-step
confirm (*"Your places, anything you kept for later, your collections and your account are removed.
This can't be undone."*), pressed `Delete my account`. Verified in the database:
`auth.users` 9 → 8, `profiles` 9 → 8, `profile_names` 5 → 4, and
`select id,email from auth.users where email like 'r5-%'` returns **0 rows**. Zero console errors
through the whole flow. Nothing about that account survived, including the `profile_names` row the
sign-up form wrote. `L1-F8-T1` is done, not "built".

**The zero-state camera is better engineering than the finding against it suggests.** It frames a
brand-new account's map from the browser's own time zone — no permission prompt, no IP lookup, no
`navigator.geolocation` on page load — and the docblock forbids ever rendering the value as markup on
the grounds that it would be a hydration bug and a privacy question in the same commit. I set out to
prove it was hard-coded and a known-answer test proved the opposite: `Asia/Jerusalem` opens on Tel
Aviv, measured. Finding 4 is about the size of the table, not the mechanism, and it would be a
mistake to let it cost this design.

**`add-by-name`'s cost discipline is the kind of restraint that does not show up in a diff.** One
lookup per explicit submit — verified, one `POST /api/imports/place-search` for one press. No
type-ahead, no debounce, no search on blur or paste, a second submit refused rather than queued, no
autofocus on a screen three in four imports land on, no auto-select at N = 1, and offline checked
*before* the request rather than after. Six separate opportunities to be cheaply wrong, six decisions,
each argued in the file. Finding 1 is partly an argument that the rest of the product should adopt the
last of them.

**Removing a place is the best-designed destructive action in the product.** Two steps where the first
only reveals the second; the place's name stays on screen because the confirm is inline rather than a
modal that would cover the thing being removed; focus lands on `Cancel`, with a comment explaining
that autofocusing the destructive button would undo the entire reason the confirm exists; and the copy
says *"Remove from your places"* rather than *"Delete place"* because `places` is shared and is never
touched. Every one of those is a small decision that most products get wrong.

**Search's zero result is designed rather than defaulted.** `zzzqqq` → *"Nothing matches 'zzzqqq'"*
with a `Clear search` control, the query kept in the field, and the sort chips still present.
`coffee` → *"4 matches in Tel Aviv-Yafo"* with the facet row correctly re-derived from the four
matches. Both verified at 390×844.

**Dark mode on the list, the account menu and the no-places screen is coherent, not inverted.**
Captured at both breakpoints (`scratchpad/r5shots/70-dark-list-{m,d}.png`, `71-dark-account-*`,
`72-dark-noplaces-*`). The mint accent stays the accent, the chips keep their weight hierarchy, and
the thumbnails do not blow out. I am not re-opening round 4's `E5`, which was about the *sign-in*
ground specifically and which I did not re-measure.

---

## 5. Outside the five — no challenge to any standing ruling

I found nothing this round requiring one to be overturned. Single-player is not in question anywhere
above. Nothing in the five asserts a fact the user did not confirm — **finding 2 is the case I most
expected to be read that way and it is the opposite**: a count of the user's own confirmed imports,
never a count of anyone else's, and I have written the "do not make it a rank" line into the finding
itself rather than leaving it to be inferred. Finding 5 explicitly does not touch the desktop panel's
size, only its contents.

---

## 6. What I touched

- **Wrote:** this file only. No source file, no test, no migration, no configuration.
- **Accounts:** one created and one destroyed, both through the product's own controls.
  `r5-firstrun-1788260490@example.com`, id **`b0f86af4-f4ad-4dd4-82d1-e109d0bcbaf4`**, created
  11:01:38+00, deleted via `Delete my data` at ~11:47. **It is gone** — `auth.users` holds no row
  matching `r5-%`. Identified rather than counted, per the concurrency rule.
- **Product rows:** none created, none modified, none deleted. Two writes were *attempted* offline
  (a category change on `Neve Tzedek Coffee House`, a note on the same row) and **neither reached the
  database** — `category_override` is `NULL` on every row and the only non-null `note` in the table is
  still round 1's marker on `saved_places.6927785e-…`. Verified by query after the fact.
- **Final row counts, re-measured at the end:** 8 accounts, 8 profiles, 4 `profile_names`, 11 saves,
  9 places, 1 collection, 0 `place_mentions`, 11 sources, `visit_state` 1 `visited` / 10 `want_to_go`.
  Identical to the dispatch's baseline.
- **Provider budget:** exactly **one** Google Places lookup, `POST /api/imports/place-search` for
  `"Miznon Tel Aviv"` (200, one result, not added). No import was run and no LLM call was made.
- **Sessions:** signed in as `demo@example.com` (`baf6dbc7-0642-4147-bced-09f5d3724c68`) roughly
  twenty-five times and as the probe account four times, which leaves `auth.sessions` and
  `auth.refresh_tokens` rows for the demo user; the probe account's went with it.
- **The database:** read only, through `docker exec supabase_db_P-002 psql -U postgres`. No DDL, no
  `DELETE`, no `UPDATE`, no reset, no reseed.
- **Processes:** the `next dev` on 4311 was already running and still is. Every Playwright browser was
  closed by its script **except one** — a run I killed on a two-minute timeout left an orphaned
  `chrome-headless-shell` (**PID 36575**, started 13:26:46). I found it in the end-of-round sweep and
  killed it; `ps -p 36575` is empty. **A leftover process from someone else is still running and is
  not mine:** PID **54251**, `node coll3.mjs 1440 900 light after-coll1440`, `ppid=1`, started
  **02:06:29**, holding a browser tree (`54253`, `54254`, `54256`, `19748`). Named rather than
  counted so whoever owns it can decide.
- **Tests run:** `npx vitest run tests/unit/orphans-have-consumers.test.ts` only. `npm run verify` was
  not run — no source file was touched, and `agent-guardrails.md` §7 rule 26's corollary says a
  partial gate manufactures a green feeling, so I ran none rather than a subset.
- **Harnesses and screenshots** under
  `/private/tmp/claude-501/-Users-MrJossef-SourceTree-LiorJossef-P-002/fe536eb0-58de-414e-9afb-9fe2f3c7e69d/scratchpad/`
  (`r5-*.mjs`, `r5shots/`). Nothing was written inside the repository except this file.

### 6.1 Two instruments that lied, and what caught them

Recorded in full because the brief is right that they recur, and because both were caught by a control
rather than by reading the code.

**The account-menu string matcher under-reported.** My first probe scanned for leaf elements whose
`textContent` equalled a target exactly, and reported `Sign out: 0` while reporting `Delete my data: 1`
on the same open menu. Had the menu been genuinely broken I would have called the fix half-landed. The
control that caught it was internal inconsistency — a menu that has `Delete my data` and not `Sign
out` is not a shape any implementation produces — and the fix was to enumerate the popup's own
`button, a, [role=radio]` children and read their boxes instead of matching strings.

**The offline probe reported a clean result while clicking nothing.** Testing the note path, my
selector was `/^Save$/` and the button is labelled **`Save note`**. The probe returned
`boundary: false`, the typed text still in the textarea, and the row unchanged — a result I very
nearly wrote up as *"the note path fails gracefully"*. **A probe that cannot fire looks exactly like a
probe that found nothing.** What caught it was counting `POST` requests: `POSTs while offline: 0` on a
run that was supposed to issue one. With the selector corrected the same probe returned
`POSTs: 3, boundary: true, pins 0`, and the note was destroyed — the opposite conclusion, and
finding 1's sharpest evidence.

---

## 7. What this round did not check, and why

- **`next build`.** Finding 1's dev-versus-production question, as round 4's finding 1 was. Same
  reason: it writes `.next/` in a shared tree. Flagged for the orchestrator, and it should be run
  before the fix rather than after it.
- **A real import.** Provider budget and rows in a shared database. Every import screen was reached
  through the `?state=` seam, which is also how `G6` was found.
- **Collections beyond the zero state and a real second person.** Reaching them means creating a
  collection and an invitee. The dispatch had just finished removing a probe collection that was
  visible in the product, so I declined to create another. **This means the two-person path — the only
  multi-user surface in the product — has now gone five review rounds without ever being used by a
  reviewer.** That is worth someone's time and it is not a finding I can make.
- **The library at scale.** Seven places. Finding 5's argument turns on what happens at 300, and
  nothing here can produce 300 without writing rows.
- **Round 4's craft items `E1`–`E11`,** except `E7` and `E9`, which came up in the course of other
  measurements.
- **Production.** Every measurement is local, at `cbfd50c`, against the dev server on 4311.

---

## 8. The thing five rounds have circled and never named

Every round has produced at least one finding of the same shape, and none of us has named the cause.
Round 2's re-point, round 3's tags, round 4's `why_go` and its four-halves finding, and my own §1.3
today are the same sentence written five times: **the migration lands, the guard goes green, and no
human can do the thing.** The orphan guard is an excellent treatment of the symptom — it now names
seven live capabilities no user can reach, and names them accurately. But the cause is not
carelessness and it is not a missing test. It is the unit of work. This project dispatches specialists
in waves *whose write scopes are pairwise disjoint*, because disjointness is what makes concurrency
safe and each scope committable on its own — and **a feature is not disjoint.** A feature is a
migration plus a server action plus a component plus a string, and the rule that lets four lanes run
at once is the same rule that guarantees each of them ships a slice of one. The repository has
therefore been optimising, correctly and consistently, for a quantity that is not the product.

So: the most valuable work available is not on the five above. It is to **change the unit of dispatch
from a write scope to a vertical slice whose acceptance criterion is a person doing the thing in a
browser** — one lane owning `0038` *and* the action *and* the control *and* the Playwright spec that
presses it, with concurrency bought by running several such slices rather than by splitting one into
layers. That costs some parallelism, and it would have prevented every finding in this paragraph's
first sentence. It is also the only change that makes `current-state.md` mean what it says: *built*
would stop being a claim about a schema and start being a claim about a user. This is the last review,
and if only one thing from it is acted on, this is the one — because the other five are things a
future round would have found anyway, and this is the reason there had to be five rounds.
