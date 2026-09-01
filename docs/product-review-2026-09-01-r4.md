# Product review — round 4, 2026-09-01

> **Written 2026-09-01, 08:00–09:10 UTC**, on `no-crumbs-implementation` at **`97da749`**, against the
> **already-running** `next dev` on **port 4311** and the real local Supabase. Signed in as the seeded
> dev user `demo@example.com` (`baf6dbc7-0642-4147-bced-09f5d3724c68`), credentials from
> `supabase/seed.sql`'s header.
>
> **This round's evidence is taken against a commit, not the working tree.** `git status` at the time
> of writing held two modified evidence JSONs and four untracked docs/probe files, none of them under
> `src/`. Every measurement below is therefore attributable to `97da749`.
>
> **The environment, measured rather than read from the dispatch.** Four containers up ~15 h:
> `supabase_db_P-002` (54322), `supabase_kong_P-002` (54321), `supabase_rest_P-002`,
> `supabase_auth_P-002`. `psql` is still **not on this host** (`which psql` → not found; no libpq under
> `/opt/homebrew/opt` or `/usr/local/opt`) — every measurement against the database went through
> `docker exec supabase_db_P-002 psql -U postgres`. `supabase_migrations.schema_migrations` tops at
> **`0036`**, as the dispatch said, and — unlike round 3 — **all 36 rows now carry a `name`**, so the
> three hand-inserted rows round 3 found have been repaired.
>
> **The hydration trap is real and I paid it once.** Every script below waits 3 s after
> `domcontentloaded` and reads the email field back before submitting; without that wait the field is
> empty and GoTrue answers 400. `ui-review-2026-08-31.md` §7.5.
>
> **One instrument caveat worth stating up front.** `next dev` renders a Next.js devtools indicator —
> a dark disc with an `N`, bottom-left, which showed *"3 Issues"* on `/map`. It is **dev chrome, not
> product UI**, and I nearly filed it as a stray account avatar before checking. It appears in several
> screenshots below; ignore it.
>
> Rounds 1–3 are [`r1`](product-review-2026-08-31-r1.md), [`r2`](product-review-2026-08-31-r2.md),
> [`r3`](product-review-2026-08-31-r3.md). None of their findings, `place_mentions`, §7.5's hydration
> bug, or round 2's craft items `C1`–`C10` are re-reported here.

---

## 1. Round 3's five, audited against the running product

### 1.1 *Been* on a phone — **landed, and it works end to end**

Measured at 390×844 in a signed-in session. Opening HaKosem's detail and scrolling the control into
view the way a person would: `Been here, HaKosem` at `y 593–637`, **0 / 5 hit points blocked** (all
five return the button itself). Tapping its centre with a real touch event relabels it to `Been` and
writes the row: `saved_places.6927785e-e370-492c-aaf7-f26815e5adaa` went `want_to_go` →
`visited @ 2026-09-01 08:28:40+00`. **I reverted it through the same control**; the row is
`want_to_go` with `visited_at` null again.

The underlying geometry defect is fixed too, and that is the part that generalises: round 3's `D1`
measured the detail column at `scrollHeight === clientHeight === 772`, an inert `overflow-y-auto`. It
now reads **`scrollHeight 921` against `clientHeight 394`** — the column is a real scroller, and at
maximum scroll `Remove from your places` hit-tests **0 / 5 blocked** at `y 748`, clear of the nav at
`776`. The 68 px budget reached this surface.

### 1.2 Tags — **the ownership landed; the editing did not**

`0036` is applied and its objects are live: `set_saved_place_tags(p_saved_place_id uuid, p_tags
text[])` exists, and `saved_places` now grants `authenticated` SELECT on `tags`, `tags_extracted` and
`tags_confirmed_at`. The confirm route calls it (`src/app/api/imports/confirm/route.ts:376`) and the
review card renders the proposed tags (`candidate-card.tsx:192`). Consent is stamped by the save, and
it cannot be forged — that half is done and done well.

**What did not land is part (b) of round 3's finding 2: an edit affordance.**
`src/app/actions/saved-places.ts` still exports exactly five actions —
`deleteSavedPlace`, `updateSavedPlaceNote`, `updateSavedPlaceName`, `updateSavedPlaceCategory`,
`setSavedPlaceVisited` — and none of them touches tags. `grep -rn "set_saved_place_tags" src/` returns
**one** call site, the import confirm route. So a wrong tag is still permanent: the user now *owns*
the vocabulary in the schema and still cannot change a word of it in the product. `UPDATE` on
`saved_places` for `authenticated` remains `category_override, display_name, note, visit_state,
visited_at` — the same five columns as before `0036`.

### 1.3 The keyboard trap below 1024 px — **gone, verified with the same probe that found it**

Twenty `Tab` presses from a clean signed-in load, at four widths:

| width | distinct elements in 20 presses | longest stuck run |
|---|---|---|
| 390 | 14 / 20 | **1** |
| 768 | 14 / 20 | **1** |
| 1023 | 14 / 20 | **1** |
| 1440 | 20 / 20 | **1** |

At 390–1023 the sweep reaches `BUTTON "Show your places"` at press 13 and then **wraps to the top of
the document** rather than looping on itself. Round 3 measured 16/16 presses leaving
`document.activeElement` unchanged at those same widths. This is the cleanest of the four repairs.

### 1.4 The desktop review screen — **half landed, and the half that landed is the smaller one**

Same fixture (`/import?state=review`, 3 candidates), same two viewports:

| | round 3 | now |
|---|---|---|
| candidate scroller `clientHeight`, desktop | 371 | **415** |
| candidate scroller `clientHeight`, mobile | 409 | 409 |
| scroller `scrollHeight` | 781 | 781 |
| card width at 1440 | 480 px at `x 480` | **480 px at `x 480`** |

So the embarrassment is gone — the laptop no longer shows *less* than the phone — and the value is
not: a 1440×900 laptop shows **53 %** of a three-candidate comparison where a 390×844 phone shows
**52 %**. 960 px of page width, 67 % of the viewport, is still empty. And the seam round 3 photographed
is unchanged: the sticky bar sits at `y 767–823` and the third candidate row at `y 780–832`, so
*"Cafe Cafe · Ibn Gabirol 30"* is still cut through its glyphs by an opaque bar with no fade, no
shadow and no scrollbar.

### 1.5 Database checks and the migration ledger — **the ledger is repaired; the binary is not**

The forged half is fixed: all 36 rows in `schema_migrations` now carry a `name`, where round 3 found
`0032`, `0033` and `0034` carrying `NULL` for both `name` and `statements`.

The cause is untouched. `package.json`'s seven `db:test:*` scripts and `db:inventory` still shell out
to a bare `psql`, which does not exist on this machine, so `npm run db:test` still dies with
`sh: psql: command not found`. The incentive that produced the forged rows is therefore still in
place, and two more test files (`db:test:0035`, `db:test:0036`) have been added to a command nobody
here can run.

---

## 2. The two things the dispatch asked me to judge rather than accept

### 2.1 The re-point function still has no caller, and it is now **five** migrations old

`grep -rn "repoint" src/` returns **one** hit and it is `globals.css:18`, a comment about a font
variable. `repoint_saved_place(p_user_id uuid, p_saved_place_id uuid, p_place_id uuid)` is live in the
database. `0032` and `0033` shipped on 2026-08-31; `0034`, `0035` and `0036` have shipped since.

**I stand behind round 3's judgement and I will sharpen it rather than repeat it.** The problem is no
longer that the repair is unreachable — round 1 said that, round 2 said that, round 3 said that. The
problem is what three rounds of saying it has demonstrated: **this repository has no mechanism that
notices an artefact with no consumer.** `motion-scale.test.ts` catches an unused *motion constant*;
nothing catches an unused *migration*, an unused *component*, or an unused *prop*. Section 3 finding 4
is that finding, generalised, because re-point is now one of four instances in one week.

### 2.2 `why_go` and `dishes` — **the same class as tags, and nothing has moved**

Confirmed against the running database and photographed on screen. Column grants: `authenticated`
holds `SELECT` on `why_go` and `dishes` and `UPDATE` on neither. `grep` finds no server action, no RPC
and no form that writes either. They are written once, by the extractor, running as `service_role`.

They are not dormant data. On the desktop map popover for `Café Florentin`, the card reads:

```
Café Florentin · Café · Tel Aviv-Yafo · Coffee · Hidden Gem · 12 Vital St
A tiny place, easy to walk straight past.
DISHES MENTIONED
Cortado
```

The middle line is `saved_places.why_go` — a sentence a language model wrote about a stranger's
caption — and it is rendered **bare**, with no label, no attribution and no provenance marker, in a
card that labels the category *"worked out from the video"* and attributes the quote *"Saved from
@tlv.eats"*. Other rows in this library carry `"The best oat milk in the old north."` and `"The
sourdough is worth the queue."` — superlatives, on the user's own private map, which the user cannot
edit, cannot remove and never saw before they were stored.

This is finding 3 below. It is the sharpest live example of the thing
[`product-edge-2026-08-31.md`](product-edge-2026-08-31.md) says this product exists to refuse.

---

## 3. The owner's six requests — did each land the value, or the feature?

| # | request | verdict |
|---|---|---|
| 1 | The place card leak | **Value.** Fixed at both breakpoints |
| 2 | The map popover thumbnail | **Feature only, and it cost more than it gave.** §3.2 |
| 3 | Gated TikTok playback | **Feature only — nothing renders it.** §3.4 |
| 4 | First and last name at sign-up | **Value, with one honest gap** |
| 5 | The account menu over the map | **Neither. The control does nothing.** §3.1 |
| 6 | The places↔collections transition | **Feature only — not on the transition it is named for.** §3.5 |

**1 — the place card leak: landed.** Probed by injecting an 80-character name into the row's own name
node in the browser (a layout probe; nothing persisted). At 390 and at 1440 the name clamps to one
line with an ellipsis, the row's `scrollWidth === clientWidth`, and the thumbnail's box stays inside
the row's box on all four edges. Row height is unchanged at 130 px.
`scratchpad/r4shots/50-card-longname-{m,d}.png`.

**4 — names: landed, with a gap the code already admits.** `profile_names` exists with per-user RLS,
`/account` holds both forms, four rows are populated by earlier probes (`Maya Levi`, `מאיה`). The gap
is that the desktop account chip still renders `demo@example.com` rather than the name —
`account-chip.tsx`'s own header records that as a deliberate deferral ("it costs a `profile_names`
read on the map's hot path"), which is an honest call, not a defect. It is moot at the moment for the
reason in §3.1.

**6 — the transition: measured, and it is not where the owner asked for it.** See §3.5. The half the
dispatch called unverified — the final both-layer frame — **is confirmed working**, and that answer is
in §3.5 too.

---

## 4. The new five, ranked by value

### 1. Signing out, deleting your data and setting your name are unreachable from the product

| | |
|---|---|
| **What** | Pressing the account control opens the account menu, so a person can sign out, change the theme, set their name or delete their data without knowing a URL. |
| **Why it matters** | The account control is the only chrome-level door to four things: **sign out**, **delete my data** (`L1-F8-T1`, the last unbuilt L1 product feature, built on 2026-08-31), the theme control, and `/account`. On 2026-08-31 the `Profile` tab was a `<Link href="/profile">`. It is now a `<button>` that opens a menu, and the menu never opens — so the tab navigates nowhere and reveals nothing. **The press does not fail visibly**: no error, no spinner, no state change. The user presses the only account-shaped thing on the screen, three times, and the product does not react. `/profile` still renders and still holds everything, so nothing is *lost* — it is *unreachable*, which for a delete-my-data flow is the difference between a privacy commitment and a page you have to guess the address of. |
| **Evidence** | **Measured, both breakpoints, six presses, with a control that fires.** At 1440×900 (`button[aria-label^="Your account"]`) and at 390×844 (`button[data-profile-trigger]`), three real clicks each, 2.5 s apart: `aria-expanded` is **`null` after every press**, `aria-haspopup` is **`null`**, and no element carrying the popup's own class (`max-h-[min(32rem,var(--available-height))]`) exists in the document. A string scan for `Sign out`, `Delete my data`, `Appearance`, `Account settings` finds **0** of 4 after the press. **The detector is not broken:** the same scan, on the same page, after pressing `Create`, finds `Add a place` — 1 of 1. Screenshots `scratchpad/r4shots/32-account-3presses-{m,d}.png`, `31-account-after-click.png`. |
| **The cause, and the diagnosis is narrower than the symptom** | `src/components/nav/profile-menu.tsx:193-196`. `if (open && !loadStarted) { setLoadStarted(true); load(); }` runs **during render**, and `load()` calls `startTransition` around a server action. Chromium's console, per press, carries 12–17 errors of three kinds: `Cannot call startTransition while rendering.`, `Cannot update a component (Router) while rendering a different component (ProfileMenu).`, and `Can't perform a React state update on a component that hasn't mounted yet.` The docblock immediately above those four lines argues the pattern is legal — *"`startTransition` outside an event handler is legal and is what React's own 'adjusting state during render' pattern permits"*. React permits `setState` on the **same** component during render. It permits neither a transition nor a Router update. **The decisive observation is `aria-haspopup: null`**: `Popover.Trigger render={trigger}` is documented to merge that attribute onto the trigger, and it is absent, so the lazily-loaded subtree **never commits** — the visible control is permanently the `Suspense` fallback. `ProfileMenu` itself unmistakably *renders* (its errors name it), so the chunk loaded and the module is fine. |
| **The rule underneath it** | **`vitest.config.ts:9` sets `environment: 'node'`. No unit test in this repository can mount a popover, click a trigger, or observe a commit.** The only gate that could have caught this is Playwright, and no runner has started since 2026-08-29 (`current-state.md` item 0). `tests/unit/nav/bottom-nav.test.ts` passed through this change. The generalisation is not "write a test" — it is that **any work whose failure mode is "the component does not commit" is currently ungated in this repo**, and four of the six owner requests were exactly that shape. |
| **Effort** | **An afternoon**, and the code change is small: move `load()` out of the render body into a mount effect (or keep the `loadStarted` latch in render and call `load()` from `useEffect`), then confirm `aria-expanded` flips. One file, `src/components/nav/profile-menu.tsx`. The larger half of the afternoon is a Playwright spec that presses the control and asserts `Sign out` is on screen, because nothing else in the repo can. |
| **What would change my mind** | Evidence that this is a `next dev` artefact and the production build commits the subtree. I did not run `next build` — it is a shared tree and a shared `node_modules/`, and `agent-guardrails.md` §8 rule 30 puts world-stopping operations outside a reviewer's remit. **That check is one command for the orchestrator and it should be the first thing done with this finding.** If production is fine, this drops to a craft item about a noisy console — but the render-phase transition is still invalid and still wants fixing. |

### 2. On a laptop, clicking a pin gives you a card with none of its controls and no sign that there are any

| | |
|---|---|
| **What** | The desktop map popover uses the height the viewport actually has, so *Been here*, *Add to a collection*, *Change*, *Add a note* and *Remove* are on the card a person is looking at. |
| **Why it matters** | On the desktop map the popover **is** the place detail — there is no second surface. Every action the product offers on a saved place lives below its clipped edge. The clip lands mid-word, with no fade, no shadow and no scrollbar, so it reads as a rendering fault rather than as a scroll: the card's last visible line on `Café Florentin` is the word **`Cortado`** sliced horizontally through its glyphs. A person who does not think to scroll inside a floating card concludes the product cannot mark a place *been* on a laptop — which is exactly the capability round 3's finding 1 was about on a phone. |
| **Evidence** | **Measured at 1440×900, three different places, and photographed.** The popover column is `max-h-[min(70vh,26rem)]` — `26rem` = 416 px; `70vh` at 900 is 630 px, so **`70vh` never binds above a 594 px viewport**. Measured `clientHeight` is **416** at every place. Measured `scrollHeight`: **844** (HaKosem), **879** (Old North Espresso Bar), **988** (Café Florentin) — so **51 %, 53 % and 58 %** of the card is hidden, and the hidden part is all of it that can be pressed. `Been here, HaKosem` is at `y 448–492` against a card bottom edge of `y 461`: **13 px of a 44 px control**. Identical numbers in dark (`988 / 416`). Photographs: `scratchpad/r4shots/71-whygo-florentin.png` (the `Cortado` slice), `11-place-d.png` (`Been here` cut in half). |
| **This is the map-popover-thumbnail request, and it is why that request landed the feature and not the value** | The thumbnail is real — 288×160 CSS px, `naturalWidth 720`, rendering correctly on a live place. It also added ~176 px to a card that was already over its cap. Round 3's `D3` measured this cap when the content was ~700 px and reported the last visible line as *"Restaurant · worked out from the video"* — a line that sits **below** `Been here` in this card's order. **So `Been here` was visible before the thumbnail landed and is not visible now.** The feature was added on top of a known, filed, unfixed constraint, and the constraint decided what it cost. |
| **Known, and cited** | Round 3 craft item `D3`. I am promoting it into the five rather than re-filing it as craft, because the quantity changed in kind: `D3` was *"214 px of usable height declined"*; this is *every control on the surface*. `place-sheet.tsx:2352`'s own docblock still describes the cap as *"416 px against 684 px of content"* — that number is now stale by 160–304 px, which is a small sign of the same thing. |
| **Effort** | **Two lines.** `src/components/sheet/place-sheet.tsx:1957` — drop the `26rem` arm so `70vh` binds (630 px at 900, 486 px at 720), or replace both with Base UI's `--available-height` the way `profile-menu.tsx` already does. A scroll affordance at the clipped edge is a separate, smaller pass and belongs to `design-system-frontend`. |
| **What would change my mind** | A ruling that the desktop popover is a *preview* and the sheet is the detail surface at every width — in which case the popover should carry one control (*Open*) rather than ten it hides. That is a legitimate `ux-interaction` call. What is not defensible is the current state, which offers ten and shows none. |

### 3. The two sentences a model wrote about your place cannot be changed, removed, or even told apart from your own

| | |
|---|---|
| **What** | `why_go` and `dishes` become editable and removable by the person whose map they sit on, and until they are confirmed they are labelled as what they are. |
| **Why it matters** | [`product-edge-2026-08-31.md`](product-edge-2026-08-31.md) §0 rules that this product's differentiator is a refusal to assert what the user did not confirm, and `brand-and-product-foundation.md` §7 promises nothing reaches the map without confirmation. `why_go` is a **superlative-bearing sentence written by a language model out of a stranger's caption**, stored on a private saved place, rendered without a label, and unremovable. `"The best oat milk in the old north."` is a claim the product makes on the user's behalf, to the user, about a place the user has never been. `dishes` is the same shape with a heading — `DISHES MENTIONED` at least attributes to the post, which is why `why_go` is the sharper half. This was the exact argument that carried `0036` for tags six hours ago; the two remaining columns of the same 2026-08-19 enrichment were left behind. |
| **Evidence** | **Measured in the database and photographed on screen.** `information_schema.column_privileges` for `public.saved_places`: `authenticated` holds `UPDATE` on exactly `category_override, display_name, note, visit_state, visited_at` — `why_go` and `dishes` appear only in the `SELECT` list. `grep -rn "why_go\|whyGo\|dishes" src/` finds readers only: `app/map/_lib/get-spots.ts:44-45`, `ui/place/enrichment.ts`. No action, no RPC, no form. Six of the demo user's seven places carry a `why_go`; four carry `dishes`. On screen, `Café Florentin`'s card renders `"A tiny place, easy to walk straight past."` as an unlabelled paragraph between the address and `DISHES MENTIONED` (`scratchpad/r4shots/71-whygo-florentin.png`, and `70-whygo-d.png` for the `Old North` card where `whyGoEarnsItsPlace` correctly suppresses it). |
| **The rule underneath it, and it is the useful part** | The team fixed the *instance* rather than the *class*. `0036`'s own header states the class precisely — *"every tag in this database is currently such an assertion"* — and then applies the ruling to one of the three columns `0019` created in one migration. **When a defect's own diagnosis names a category, fix the category or write down why you did not.** Doing one of three leaves two live examples of a thing the repo has just declared unacceptable, and leaves the next reader unable to tell which state is intended. |
| **Effort** | **A feature, and the cheapest one available, because `0036` is a template rather than a precedent.** (a) A migration modelled directly on `0036` — a `SECURITY DEFINER` writer keyed on `auth.uid()`, `why_go_confirmed_at`/`dishes_confirmed_at`, `security-privacy` review via the §5 rule-20 handoff. (b) Show both at the review screen beside the tags, where the card already has the layout. (c) An edit affordance on the place card beside the `Change` and `Edit` that already exist. **(b) alone is an afternoon** and closes the confirmation gap even before (a) ships — a labelled, confirmed model sentence is a very different object from an unlabelled one. |
| **What would change my mind** | An owner ruling on open question **OD-1** (*does the "info" boundary govern place facts only, or every stored field?*) that puts `why_go` outside the boundary as *source metadata* rather than *user annotation*. That is defensible. It does not remove the label half: an unconfirmed model sentence shown as if it were fact is a problem in either reading, and (b) is the fix for it either way. |

### 4. This week the product shipped four halves, and nothing in the repository can notice

| | |
|---|---|
| **What** | An artefact that reaches `main` has a consumer, or the fact that it does not is visible to somebody before the next feature is started. |
| **Why it matters** | Four separate pieces of work landed between 2026-08-31 and 2026-09-01 complete except for the line that joins them, and **one of them has already bought a production security relaxation for a feature no user can reach**. The cost is not tidiness. It is that `current-state.md`, `execution-plan.md` and the run ledger all now say *built* about things a person cannot use, so the next planning decision is made against a false picture of what exists — which is round 3's finding 5 in a different medium, and it is the reason that finding was ranked where it was. |
| **Evidence** | **Four, each grepped at `97da749`.** ① **The TikTok playback panel.** `src/components/embed/` holds five files and `tests/unit/embed/` five test files. `grep -rn "@/components/embed" src/` outside that directory returns **zero**. Nothing renders `TiktokPlaybackPanel`. ② **The play affordance.** `place-sheet.tsx:1637` exports `PLAY_SOURCE_LABEL`; `:1799` and `:1805` declare `onPlaySource` and `sourcePlayer`; `:2439` renders the glyph only when a handler exists. `grep -rn "onPlaySource\|sourcePlayer" src/` outside `place-sheet.tsx` returns **zero**, so the glyph never draws. Two lanes built the two halves of one control and nobody joined them. ③ **`next.config.ts:60` now serves `Content-Security-Policy: frame-ancestors 'none'; frame-src https://www.tiktok.com`** — verified live with `curl -sI http://localhost:4311/map`. The `frame-src` grant is paid for and the frame it permits cannot be reached. ④ **`repoint_saved_place`**, live in the database since `0032`, five migrations and one week old, `grep -rn "repoint" src/` → one CSS comment. |
| **The rule underneath it** | `tests/unit/ui/motion-scale.test.ts` exists precisely to catch this class — `interaction.ts`'s header says *"an unused constant is not a spare part, it is a claim the codebase does not support"* — and it caught it once during the interrupted round-4 run, which is recorded in `handoff-r4-interrupted-2026-09-01.md` as *"this failure is the guard working"*. **The team already believes the rule and has automated it for exactly one kind of artefact.** Extending it is a smaller job than arguing for it. |
| **Effort** | **A few days, and it is two things.** The lasting one: a guard, owned by `qa-reliability`, that fails when an exported component, a `SECURITY DEFINER` function granted to `authenticated`, or a CSP `frame-src`/`connect-src` entry has no consumer under `src/` — with an explicit allow-list so a deliberate exception is a line in a file rather than a silent pass. The immediate one, and it is the honest way to prove the guard is worth having: **wire the playback panel into `PlaceSheet`'s existing `onPlaySource`/`sourcePlayer` slot**, which is the smallest of the four and is the one currently costing a CSP grant. |
| **What would change my mind** | A deliberate ruling that these four are staged work with a named next task and a date. That would make this a scheduling note rather than a finding — but it has to be written down, because right now `current-state.md` does not distinguish *staged* from *shipped* and nothing else does either. Re-point is the counter-evidence: it has been "next" for three review rounds. |

### 5. The one view switch a person uses every session is the one the new transition does not cover

| | |
|---|---|
| **What** | Moving between *Places* and *Collections* hands off the way moving between two collections now does, instead of blanking the panel for a fifth of a second. |
| **Why it matters** | The drawer's view switch is the product's most-pressed control after the map itself. The `9f2a1f5` commit is titled *"places and collections hand off instead of cutting"*, and on that exact transition **it still cuts**: the outgoing list is unmounted in the same commit the incoming view mounts at `opacity: 0`, so the panel is an empty card for the length of the entrance. `view-swap.tsx`'s own header names this as the defect it was written to remove. What it removed it for is `index ↔ collection`, a transition that in this library involves one collection. |
| **Evidence** | **A per-frame `requestAnimationFrame` sampler at 1440×900, `reducedMotion: 'no-preference'` (asserted, not assumed: `matchMedia('(prefers-reduced-motion: reduce)').matches === false`), with both routes warmed first so compile time did not dominate.** Reading `[data-view-swap]` and its `[data-view-layer]` children each frame: |

```
A. places -> collections
     +5 ms   hosts=0            places heading present, collections heading absent
   +197 ms   hosts=2 key=index  LEAVING = absent   CURRENT opacity 0.000
   +262 ms   hosts=2 key=index  LEAVING = absent   CURRENT opacity 0.807
   +533 ms   hosts=2 key=index  LEAVING = absent   CURRENT opacity 1.000

D. collections -> places
     +3 ms   hosts=2 key=index  LEAVING = absent   CURRENT opacity 1.000
   +373 ms   hosts=0            places heading present
```

> No frame in either direction has a leaving layer. Between +5 ms and +197 ms the places list is gone
> and the collections view is at `opacity 0` — **photographed** by polling for `opacity < 0.2`,
> pausing every animation and capturing: `scratchpad/r4shots/22-swap-empty-frame.png` shows the panel
> as a bare card with the switch above it and nothing under it.

| | |
|---|---|
| **The cause, and it is honest about itself in the source** | `src/app/map/collections-scope.tsx:217` — `if (!active \|\| pins === null) return null;`. The hook that owns `ViewSwap` returns `null` on the places view, so the host is not in the document when the places list leaves, and cannot hold it. The file says so at `:120`: *"the places list itself is rendered by `map-page-client.tsx` and is not ours to animate out."* That sentence is a correct description of a scope boundary and an accurate account of why the request was not delivered. |
| **The half that IS confirmed, because the dispatch asked** | **`fill-mode-forwards` works. The final both-layer frame is not a flash.** On `index → collection` the sampler caught +274 ms `LEAVING opacity 1.000, translateX 0`; +278 ms `0.963 / −0.60 px`; +382 ms `0.225 / −12.40 px`; **+483 ms `0.000 / −16.00 px`** — the exit's final state, still held, hundreds of milliseconds after a 140 ms animation ended. Without `fill-mode-forwards` that frame would read `opacity 1`. `collection → index` mirrors it (+220 → +390 ms, `1.000 → 0.000`, `+16 px`) and the layer is gone by +476 ms. This is a known-answer test and it answers. |
| **Effort** | **A few days.** Not a class change: `ViewSwap` has to sit above the places/collections boundary, which means the places list becomes a *view* the same way the index and a collection are, and `map-page-client.tsx` — a file `current-state.md` item 12 already flags as owned by no agent — has to hand its list into the same slot. `ux-interaction` should rule on whether places↔collections is `forward`/`back` or a peer swap at one depth before anyone builds; `view-swap.tsx`'s own type comment records that a `lateral` arm was drafted and cut. |
| **What would change my mind** | A measurement that the empty window is shorter than it looks. My sampler ran at 10–70 fps depending on map activity, so `+197 ms` is when I *observed* `opacity 0`, not necessarily when it began; a compiled production build will be faster than `next dev`. If the gap is under ~80 ms in production it is a flicker rather than a hole, and this drops below the review screen. **That is a cheap thing to measure and I could not measure it here** (see §4 finding 1's caveat) — which is why this is fifth and not third. |

---

## 5. The craft pass — the seven surfaces that just changed

Unranked. Every item has a file, a number, or a marked screenshot. Numbered `E1`–`E11` so they do not
collide with `C1`–`C10` (round 2) or `D1`–`D12` (round 3).

### E1. `/account` and `/profile` put the page title 384 px from the page · **measured** · 1440×900
Both routes: `h1` at `x 56, y 16`; the content column at `x 440, w 560`. The back arrow sits further
left still. On a phone the two agree, because the column is the viewport. On a laptop the title and
the back control are a top-left orphan with 384 px of nothing between them and the thing they title,
and the eye has to travel the width of the review card to get from *"Account settings"* to *"Your
name"*. This is the same shape as round 2's `C7` (a stranded mark on the invite screen) on two new
surfaces — which makes it a rule rather than three bugs: **a header that is correct on a phone
because the column is the viewport needs an explicit desktop alignment, or it defaults to the corner.**
`scratchpad/r4shots/40-account-d-light.png`, `40-profile-d-light.png`.

### E2. Two `Save` buttons on one page, identical in every dimension and different in weight · **measured** · `/account`, 1440×900
`x 456, w 54, h 44` for both. First: `background rgb(168, 236, 226)`, no border. Second:
`background rgb(250, 249, 246)`, `border 1px rgb(231, 227, 220)`. Same word, same size, same left
edge, two priorities — so the page asserts that saving your first name matters more than saving the
name your collaborators see, which is not a claim anybody made. Either both are primary, or the
second is `Save` on a form that has no other action and should be primary too.

### E3. The review screen's newest feature cannot be seen in the only seam that exists for it · **measured** · `src/app/import/_lib/dev-screen.ts:96`
`f457aa2` added proposed tags to the review card. The dev fixture's `candidate()` factory hard-codes
`tags: []`, and no `?state=` variant overrides it, so `/import?state=review` renders **0** tag chips —
verified at 390 and 1440. The unit tests cover the logic (`tests/unit/import/review-tags.test.ts`);
nothing lets a human look at it. **One line**: give one fixture candidate two or three tags. The
general form is worth more than the line: *when you add a field to a screen, add it to the fixture
that screen is reviewed through, or the review is of the old screen.*

### E4. The desktop review card declines 67 % of the width it is given · **measured** · 1440×900
480 px card at `x 480`, so 480 px of empty page on each side. Unchanged from round 3 finding 4, and
recorded here because §1.4 shows the *height* was addressed and the width was not, which is worth
knowing before someone marks that finding closed.

### E5. The sign-in ground is a night city in dark and a smudge in light · **photographed** · 1440×900, both themes
Same component, two readings. In dark (`40-signin-d-dark.png`) the ground reads exactly as
`1d6eb8e`'s commit title promises — a gentle city drifting behind the form, mint accents picking up
the CTA, street lines legible as streets. In light (`40-signin-d-light.png`) the same geometry over a
lavender→apricot→grey wash reads as neither a city nor the brand: the palette contains none of the
product's own colours (`body` is `rgb(250, 249, 246)`, the CTA is mint, the ground is neither), and
the mark carries a warm radial glow that appears on no other surface. **The dark one is the design;
the light one is the dark one with the lights on.** Worth `design-system-frontend`'s eye before the
facelift closes.

### E6. The password field hides its own rule the moment you need it · **measured** · `/sign-in`, all viewports
`#password`'s `placeholder` is `"At least 6 characters"`. A placeholder is not a requirement: it is
present exactly while the field is empty and gone from the first keystroke, so the one moment the
constraint is legible is the one moment it does not apply. A persistent hint under the field costs one
line and survives typing.

### E7. `place-sheet.tsx:2352`'s docblock cites a content height that is 160–304 px stale · **measured**
It reads *"`max-h-[min(70vh,26rem)]` = 416 px against 684 px of content"*. Measured at `97da749`, the
same column's `scrollHeight` is 844, 879 and 988 on three different places. The cap is right; the
comparison it is justified against has moved. This is the recorded-reasoning-goes-stale shape, and it
matters here because the number in the comment is the one that makes the cap look reasonable.

### E8. Sixteen probe accounts and one probe collection are live in the demo library · **measured**
`auth.users` holds 19 rows, 16 of which are not the owner's or the demo user's:
`r1auth-probe-…`, five `r1auth-redirect-…`, six `r2names-{a,b,c,ui}-…`, `r3-tags-ui-…`,
`zerostate-…`. Round 3's `D10` named six of these; **ten have been added since.** In addition,
`collections` holds `8c536f06-8d5c-4dc5-bfd9-49d7d0a13f8e` — *"Probe swap 2026-09-01"*, owned by
`demo@example.com`, created at `06:14:46+00`, zero items — and it is **on screen in the collections
index**, which is how I found it (`scratchpad/r4shots/81-collections-dark.png`). And round 1's marker
is still in the note of `saved_places.6927785e-…`: `pistachio croissant, before 10 — R1NOTE-VERIFY-2026-08-31`,
rendered in the list at both breakpoints. None of these is mine; they are named rather than counted so
whoever owns destructive database operations can remove exactly them.

### E9. Round 3's `D11` is entirely unactioned, and I checked rather than assumed · **measured**
`git ls-files --error-unmatch reduced-motion-probe.mjs` still fails — untracked, at the repository
root. And all ten empty directories are still there: `ls -d */` at `97da749` returns `and`, `copy`,
`env`, `file`, `folder,`, `project`, `the`, `then`, `this`, `use` alongside `docs`, `src`, `tests`,
`supabase`, `scripts`, `public` and `node_modules`. **I had written this item up as half-fixed before
running the check**, on the reasonable-sounding ground that a one-line `rmdir` is the kind of thing
that gets swept up; it had not been. Git tracks no empty directory, so `git status` is clean and
nothing will ever flag them.

### E10. Seven `db:test:*` scripts now depend on a binary this machine does not have · **measured** · `package.json`
Round 3 counted five. `db:test:0035` and `db:test:0036` were added on 2026-09-01, both invoking bare
`psql`. `npm run db:test` chains all seven and dies on the first. Everything in this review that
touched the database went through `docker exec supabase_db_P-002 psql -U postgres`, which works — so
the fix is a two-line fallback in those scripts, not a new tool.

### E11. The map popover's height cap is identical in dark, so the clip is not a theme artefact · **measured** · 1440×900 dark
`scrollHeight 988 / clientHeight 416` on `Café Florentin`, byte-for-byte the light-mode numbers.
Recorded because finding 2 was found in light and a theme-specific clip would have been a different
bug; it is not one. `scratchpad/r4shots/80-popover-dark.png`.

---

## 6. What I checked and found healthy

**The repairs from round 3 are real repairs.** *Been* on a phone and the keyboard trap both measured
clean with the same probes that found them, including the write path end to end. On the collections
side I checked one of the four surfaces `d93e666` touched — the index at 390×844 — and **no control in
the sheet is occluded**: the only blocked elements are the map's own zoom, locate and attribution
controls behind the sheet, which is round 3's `D2` and a different defect. I did not reach the
collection detail, the place detail inside a collection or the share panel, so three quarters of that
fix is unverified by me. That is a good hit rate, and the part worth saying plainly is that the lane
which fixed the sheet geometry found and fixed the *scroll* defect underneath the *occlusion* defect —
a class of thoroughness that does not show up in a diff.

**The place card's media band is genuinely robust now.** An 80-character name clamps to one line with
an ellipsis at 390 and at 1440, `scrollWidth === clientWidth`, and the thumbnail stays inside the row
on all four edges with the row height unchanged at 130 px. I went looking for the leak in three
directions and did not find it.

**`view-swap.tsx` is the best-argued new file in the repository.** It states what it took from
SmoothUI, states what it rejected and why in four numbered points, names the two prior incidents its
rejections are grounded in (`motion-scale.test.ts`'s bundle guard, `chrome-motion.ts`'s hydration
mismatch), and exports its own state function so a DOM-less test suite can drive it. It also carries
an 800 ms leak-stop with a paragraph explaining that the number can never be what ends a transition.
Its `fill-mode-forwards` behaviour measured correct on the first try. **Finding 5 is about where it is
mounted, not about what it is** — do not let that finding cost this file's approach.

**`whyGoEarnsItsPlace` is doing real work and doing it quietly.** On `Old North Espresso Bar` the
stored `why_go` is *"The best oat milk in the old north."* and the card carries the tags `Oat Milk`
and `Coffee` — the sentence is **suppressed**, correctly, because it says nothing the screen does not.
On `Café Florentin` it renders. A restraint mechanism that fires on real data rather than on a
threshold somebody guessed is rare, and it is why finding 3 is about labelling and editing rather than
about removing the field.

**Search, the theme control and the desktop camera compensation were re-checked at `97da749` and are
unchanged.** Round 3's health section stands; I did not re-measure it in detail and I am not claiming
new evidence for it.

---

## 7. Outside the five — no challenge to any standing ruling

I found nothing this round that requires overturning one. The desktop panel's emptiness at a short
list is correct and I did not re-file it — finding 2 is about a *popover* whose content exceeds its
box, which is the opposite quantity. Single-player is not in question anywhere above. Nothing in the
five asserts a fact the user did not confirm; **finding 3 is the reverse of that** — it asks the
product to stop asserting two it did not.

---

## 8. What this round did not check, and why

- **`next build`.** Finding 1's dev-versus-production question is the single most valuable
  outstanding check in this document and it is not a reviewer's to run: it writes `.next/` in a shared
  tree while other lanes may be working. Flagged for the orchestrator, first.
- **A live import.** It spends provider budget and writes rows to a shared database. The `?state=`
  seam gave me every screen without a write — which is also how `E3` was found.
- **The share panel and a real second user.** Reaching them means creating a collection and an
  invitee. I declined to write product rows for that; §E8 shows what happens when reviewers do not.
- **Production.** Every measurement is local, at `97da749`, against the running dev server on 4311.
- **`npm run verify`.** Not run. `agent-guardrails.md` §7 rule 26's corollary applies — a partial gate
  manufactures a green feeling — so rather than run a subset I ran none and say so. No source file
  was touched by this review, so nothing here needs it.

---

## 9. What I touched

- **Wrote:** this file only. No source file, no test, no migration, no configuration.
- **Product rows created: none.** One row **modified and reverted through the product's own control**:
  `saved_places.6927785e-e370-492c-aaf7-f26815e5adaa` (`want_to_go` → `visited` → `want_to_go`,
  `visited_at` null again, confirmed by query). Row counts before and after: `saved_places` 11,
  `places` 9, `collections` 2, `place_mentions` 0, `profile_names` 4, `auth.users` 19.
- **Sessions:** signed in as `demo@example.com` (`baf6dbc7-0642-4147-bced-09f5d3724c68`) roughly
  twenty times, which leaves rows in `auth.sessions` and `auth.refresh_tokens` for that user. I did
  not record the count beforehand, so the user id is the identifier rather than a delta. No other
  account was created or signed into.
- **The database:** read only, through `docker exec supabase_db_P-002 psql -U postgres`. No DDL, no
  `DELETE`, no `UPDATE`, no reset, no reseed.
- **Processes:** no server was started or stopped; the `next dev` on 4311 was already running and
  still is. Every Playwright browser was closed by its script.
- **Harnesses and screenshots** under
  `/private/tmp/claude-501/-Users-MrJossef-SourceTree-LiorJossef-P-002/fe536eb0-58de-414e-9afb-9fe2f3c7e69d/scratchpad/`
  (`r4-*.mjs`, `r4shots/`). Nothing was written inside the repository except this file.
