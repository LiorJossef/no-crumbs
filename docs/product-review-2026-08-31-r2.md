# Product review — round 2, 2026-08-31

> **Lane:** `product-reviewer`, task `review-r2`. **Base commit: `112cb77`** on
> `no-crumbs-implementation`. Written scope: this file. No `src/` file was modified; nothing was
> committed.
>
> **Method, stated so its weakness is visible.** Same instruction as round 1: review the code and
> the shipped surfaces, do not build the round around driving a browser. **Nothing here is
> photographed.** Additionally, and unlike round 1, I could not read a single database row: `npx
> supabase status` reports **every local service stopped** (`supabase_realtime_P-002`,
> `supabase_storage_P-002`, `supabase_pooler_P-002` and seven more), and there is still no `psql` on
> this machine. Starting it would take an exclusive resource that fifty-odd agents share, so I did
> not. Every SQL claim below is read off a migration file and labelled as such, and the one claim
> that depends on the applied migration number is attributed to the orchestrator rather than
> measured by me.
>
> **The instrument was made to fail on purpose.** Finding 4 is an absence claim, the shape that lies
> most often. Control: the same grep run for its sibling constructor `rateLimitedUpstream` returns a
> real production call site (`src/integrations/tiktok/oembed-source-adapter.ts:167`) alongside its
> definition, while `rateLimitedLocal` returns its definition, the error map, and two tests that
> construct it themselves. The pattern fires; the absence is real.
>
> **Amended mid-round.** The owner widened the brief to include craft (alignment and position) and
> delight (the mascot). Those two sections **are** photographed and measured in a browser, against
> the dev server on `112cb77` at `http://localhost:4311`: **390x844 and 1440x900 layout viewports**
> at `deviceScaleFactor: 2`, **both themes**, headless Chromium through the repo's own Playwright.
> The layout viewport is named because `ui-review-2026-08-31.md` §5 records an emulated phone's
> 417px *visual* viewport hiding 27 of 28 overflowing pixels; every number below is asserted
> against 390. **Only the signed-out surfaces could be photographed** — the local database is
> stopped, so `/import`, `/map`, `/profile` and `/collections` all answer `307` to `/sign-in`, and
> no signed-in surface was seen. The craft pass is therefore a complete sweep of the **seven
> message-and-chrome surfaces** and says nothing about the rest of the product.
>
> **That instrument was made to fail too.** The painted-pixel probe behind craft finding C8 returns
> the clip's own left edge — a wrong answer — at threshold 40, and a stable one at 80 and 120; its
> control is the `h1`, whose ink is known to reach its box, and which the probe reports at exactly
> its box edge. A probe that cannot be made to lie has not been checked.
>
> **The dev server serves the working tree, not `112cb77`, and the tree is moving** — other lanes
> hold ~50 modified files. So before trusting a pixel: `git status --porcelain` over
> `src/components/brand/`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/sign-in/`,
> `src/app/auth/`, `src/app/collections/join/`, `src/app/not-found.tsx`,
> `src/components/ui/button.tsx` and `src/components/map/import-confirmation.tsx` returns
> **nothing** — none of the files composing the seven measured surfaces is modified, so what was
> photographed is `112cb77`. (`src/app/import/page.tsx` *is* modified, and `/import` was not
> measured: it answers `307` without a database.) Two of the modified paths are
> `tests/unit/app/proxy-matcher.test.ts` and `tests/unit/import/signed-out-share.test.ts`, which are
> new and unattributed here — **finding 3 may already be in hand in another lane.**

---

## Part 1 — round 1's five, checked against what shipped

The order below is round 1's, not a re-ranking.

### 1. Getting a link out of TikTok and into this product — **(a) and (b) shipped; (c) rightly cut; one hole**

`12ebd0b` is a better change than the one I asked for. `sharedImportUrl` (`src/app/import/page.tsx`)
does the thing the finding cared about and one thing it did not think of: it **deliberately forwards
strings it can see are not TikTok links**, so an Instagram share lands on `UNSUPPORTED_HOST` — a
recognised redirect — instead of on a blank paste screen. Filtering at the seam would have produced
exactly the silent failure a share target is most likely to cause. `initialUrl` runs the import
rather than prefilling the field, so the eight actions round 1 counted really do collapse. The
manifest's `share_target` is ten lines under a header that says out loud that it does nothing on iOS
and nothing until installed.

**Cutting (c), the install affordance, was right.** (b) only pays off on Chromium-on-Android, there
is no evidence of an Android user, and an install prompt is a modal interruption bought for a
platform nobody here runs. The honest reading of today's state is that (b) is **documentation with a
manifest key attached** and (a) is the feature; that is what round 1 asked for and it is what landed.

**The hole is new and it is finding 3 below:** a share arriving without a live session is redirected
to `/sign-in` and **the link is discarded**. The page's own comment says so. That is not a defect in
this commit's judgement — the comment explains precisely why widening `safeReturnPath` was out of
scope — but it means the seam's most likely first use loses its payload.

### 2. Re-pointing a wrong pin — **the database half shipped; the user cannot do it; see finding 2**

`de7e4b9` + `112cb77` are careful work. `0033` exists because `0032` would have let a re-point leave
a caption quoting somewhere else attached to the save, which is the exact
convert-uncertainty-into-certainty failure the working agreement forbids — a second migration
appearing is evidence the care was warranted, not that the first was sloppy.

**But the value did not land, and the state it is resting in is the worst one available.** Two
migrations are committed and, per the orchestrator, **not applied** — local `schema_migrations` tops
out at `0031` (reported, not measured: the local database is stopped). No server action and no UI
reach the function. An unapplied migration is not an asset, it is an obligation: it ages against
`0034`, it is unexercised by the policy tests it ships with, and it delivers nothing to a user. The
half that carried the review cost went first, which was defensible; leaving the cheap half unbuilt
is what turns a defensible order into a stall. It is finding 2 below, re-sized: **the migration cost
round 1 called "the whole size of this" has already been paid**, so the remaining work is much
smaller than round 1 estimated and should be scheduled on that basis.

### 3. One door and no key — **shipped in full, and it is the best of the five**

`5fd987c` built the reset request, the exchange route, the set-password screen and the
`emailRedirectTo` that the inferred half turned on. Three things in it are above the standard the
finding asked for: the exchange happens **server-side** so a recovery code — a credential one call
from a live session — never becomes a React prop or a history entry; `sb_flow_id` is forwarded to
`exchangeCodeForSession`, which is a failure that only appears when two links are outstanding at
once and which nobody would have found from a bug report; and `RESET_SENT_COPY.subhead` is hedged in
the copy rather than in the code, because the code has nothing to branch on — an enumeration
defence written where the defence actually lives.

**One owed check, and it is the owner's, not an engineering task.** Supabase validates
`emailRedirectTo` against the project's own **Redirect URLs** allow-list before it goes in an email;
if `https://p-002-zeta.vercel.app/auth/callback` is not on that list, the link falls back to
`site_url` and this entire commit is inert in production. `sign-in-client.tsx:112` knows the
allow-list is the backstop; nobody in this repo can read it. **Confirming that one hosted setting is
what turns finding 3 from fixed-in-code into fixed.**

### 4. A note at the review screen — **shipped, landed the value, and created finding 1**

The control is right: a disclosure closed on arrival, so the least-responsive screen in the product
does not grow a textarea per candidate; `dir="auto"` on the field; a counter that appears only near
the limit; writing a note ticks the card on the empty→non-empty transition only, so annotating and
then deciding against it is not a fight. That is the `ux-interaction` constraint round 1 flagged,
honoured without being asked twice.

**And it made a latent data-loss path live.** While the review screen always sent `note: null`,
`save_place`'s `on conflict … do update set note = coalesce(excluded.note, saved_places.note)` could
never destroy anything. It can now. Finding 1.

### 5. The invite hands a stranger the wrong side of the door — **shipped, both halves, together**

`?mode=sign-up` is carried and parsed, the parse lives in a pure module so it is testable in a node
runner, and `ui-review` finding 8's *"never says what the product is"* was fixed on the same screen
in the same commit, which is what round 1 asked for. `mode.ts`'s header generalises the rule —
*the router passes the destination and the state* — rather than recording the instance. That is the
part that stops the next three.

**Nothing in round 1 shipped in a way that misses what it was pointing at.** Two shipped
incompletely; one of those (the re-point) is below as a resized finding, and the other (the install
affordance) was correctly cut.

---

## Part 2 — the new five, ranked by value

Excluded, per the dispatch and still agreed: `place_mentions`; the import screens' dead space; the
three components carrying their own `<h2>`; the desktop list guillotining its last row;
`ux-architecture.md`'s stale strings; the missing desktop entry point for manual add and new
collection. None of them displaces anything below.

**One delight finding won a slot on merit** — number 5 — and it displaced the finding that had been
fifth, which is recorded under it rather than deleted. Craft and alignment findings are **not** in
this list: they are in their own unranked section after it, because ten items each worth 4px would
otherwise crowd out a capability gap, and collectively they are the thing that decides whether this
product reads as made or assembled.

### 1. Saving a place from a second TikTok destroys the note you wrote about the first

| | |
|---|---|
| **What** | Importing a post about a place that is already on your map keeps what you already wrote about it. |
| **Why it matters** | The note is the only field in this product the user authors, it is the only free-text field the search reads, and it is now easy to write — round 1's finding 4 shipped a control that invites one on every card. Two posts about the same restaurant is not an edge case: it is a **designed** case, and `0007_functions.sql`'s own header calls it acceptance I3/I4/A2, *"second import of a known place adds a source, not a row."* Every saveable candidate arrives **ticked**, including a duplicate, by an owner ruling of 2026-08-29. So the whole path is: paste a second TikTok about a café you already saved, type "the pistachio one", press Save — and the sentence you wrote three weeks ago is gone, with no warning before, no notice after, and no undo. The screen tells you `already saved`, which reads as *nothing happened*. |
| **Evidence** | **Measured, in shipped SQL and shipped source.** The live definition is the last one — `supabase/migrations/0024_collections.sql:651-652`: `on conflict (user_id, place_id) do update set note = coalesce(excluded.note, saved_places.note)`. `excluded.note` is the incoming note, so a non-null new note **replaces** the stored one; identical text in `0007:231`, `0016:122`, `0017:72`. The client stopped sending null on 2026-08-31: `src/app/import/_lib/save-extracted-candidates.ts:119-128` forwards the typed `note` into the confirm request, and `src/app/api/imports/confirm/route.ts:235` passes it into `store.confirmPlace`. Nothing between them knows the row exists — `alreadySaved` is only computed **after** the write. No database test covers a second `save_place` call's note precedence: `supabase/tests/0008_policy_tests.sql:1528` calls it once, with a note, and never again. |
| **The rule is already written down in this repo, in a migration that has not shipped** | `supabase/migrations/0033_repoint_does_not_falsify_attribution.sql:221-227` refuses to merge two saves precisely because *"the two saves carry two different notes … and silently destroying one of them is precisely the 'delete-and-re-add loses the note' failure this migration exists to end. The user is told, and chooses."* That is the correct rule, argued correctly, one directory away from the write path that breaks it. **This is a missing rule, not an oversight** — the same write also treats `tags`/`why_go`/`dishes` as **first-writer-wins** (`confirm/route.ts:127-131`) and `source_url` as **first-source-only** (`0016:71-72`). One write path, three precedence rules, and the one that differs is the only column the human typed. |
| **Effort** | **An afternoon**, if the owner takes the obvious ruling: make the note first-writer-wins like everything else beside it — `note = coalesce(saved_places.note, excluded.note)`, one migration, no UI. That stops the loss and costs the second note, which is the lesser of the two harms and is recoverable by hand. Making the second note *reachable* (show the existing note on the card, or append) is a **few days** and is the better product answer; it should not gate the one-line stop-the-loss. |
| **What would change my mind** | A count showing re-import of an already-saved place effectively never happens — `select count(*) from saved_place_sources group by saved_place_id having count(*) > 1`. If that is zero across the owner's library and the seeded one, this is a trap rather than a live wound and drops to fourth. **I could not run it; the local database is stopped.** It does not drop out even then: the trap is armed and silent. |

---

### 2. The repair for a wrong pin exists in the database and no human can reach it

| | |
|---|---|
| **What** | A person who opens a place labelled *"Approximate location"* can search for the real venue and correct the pin, keeping their note, tags, been-mark and source link. |
| **Why it matters** | Unchanged from round 1, and still the product's core deliverable: on 21 of 31 rows the product ships a pin it tells you is a street or two off and offers no repair. **What is new is that the answer now exists and is unreachable**, which is a worse state than not having built it — the reviewed, argued, tested half is sitting on a branch ageing against the next migration number, and the user's experience is byte-identical to a week ago. |
| **Evidence** | **Measured (static).** `repoint` matches nothing in `src/` — no server action, no component, no route. `supabase/migrations/0032_repoint_saved_place.sql` and `0033_…` are committed with a 947-line policy-test file beside them. Applied migration number is the orchestrator's report (`schema_migrations` tops out at `0031`), **not my measurement** — the local database is stopped. The user-facing number is unchanged and still cited in shipped code: `src/ui/place/location-certainty.ts:8-11`. |
| **Effort** | **A feature, but a much smaller one than round 1 priced.** Round 1 said *"the size is entirely the migration"* — that cost is paid. What remains: apply `0032`/`0033` locally and run their policy tests; one server action wrapping the function; and one screen, which is `POST /api/imports/place-search` and `manual-add.ts`'s existing type-a-name-pick-a-place flow pointed at an existing row instead of a new one. Call it **a few days**, not a feature-sized unknown, and say so when scheduling it. |
| **What would change my mind** | The re-measurement round 1 asked for and nobody has run: `select source_dataset, count(*) from places group by 1`. If `llm_guess` has collapsed since Google Places became canonical, 21/31 is a fossil and this becomes a one-off data question. That query is still the cheapest thing on this whole list and it is still unrun. |
| **Known?** | **Yes — this is round 1's finding 2, re-raised because half of it shipped and the value did not.** It ranks second on its own merits, not on novelty. |

---

### 3. Every new door the product opened this morning drops what the visitor was carrying

| | |
|---|---|
| **What** | A link handed to the product from outside it survives the sign-in the product may demand before showing it. |
| **Why it matters** | A share target, a Shortcut and a bookmarklet all exist so the user does not have to hold the link themselves. The moment the product asks them to sign in, it hands the link back — except it does not hand it back, it drops it, and the link is now only recoverable by returning to TikTok and re-copying. That is the eight-step tax round 1 measured, restored in full, at the exact moment the product is being tried for the first time. Worse for the invite path: a stranger following a collection link who signs up, confirms an email and comes back is the one visitor the product cannot afford to lose, and a share is far more likely than a normal visit to arrive at a cold session — a Shortcut fires the app from nothing, not from a tab the user was already in. |
| **Evidence** | **Measured, and admitted in the source.** `src/app/import/page.tsx` redirects a signed-out visitor with `redirect('/sign-in')` — no `next`, no `url` — under a comment that reads *"**A share arriving signed-out loses its link.** `?next=` would carry it, but `domain/auth/return-path.ts`'s `safeReturnPath` allow-lists exactly one destination shape today."* `ALLOWED` in `return-path.ts:28` is one regex, the collection invite. |
| | **Inferred, labelled, and it makes the above more frequent rather than being a second finding.** `src/proxy.ts`'s `config.matcher` is `['/map/:path*']`, so the session refresh runs on `/map` **only**. `src/app/_lib/supabase/server.ts` swallows the cookie-write failure under the comment *"The middleware below refreshes the session on every request, so this is safe to ignore here"* — which is false for the six Server Component pages outside the matcher: `/`, `/import`, `/profile`, `/collections/join/[token]`, `/auth/new-password`, `/collections`. On those, a refreshed token cannot be persisted, so the next request presents the same already-used refresh token; past Supabase's 10-second reuse interval that fails rather than returning the same session. I have **not observed this** and I could not: the local stack is stopped. |
| **Effort** | **An afternoon for the certain part and the mechanism**: widen `matcher` to everything but static assets, which is the pattern `@supabase/ssr`'s own docs specify and the fix the stale comment already assumes exists; and correct the comment, because a comment asserting a guarantee that is not there is how the next person builds on sand. **A few days for the payload**: `safeReturnPath` must decide whether `/import` with a query string is a returnable destination, and that is a real security question — it is the sign-in page's redirect allow-list, which is why the shipping commit correctly declined to widen it in passing. |
| **What would change my mind** | Evidence that sessions here are effectively permanent in practice — a measured sign-in interval long enough that a cold arrival at `/import` is rare. If the owner's own device stays signed in for months, the payload half drops to fifth and only the matcher fix remains. |

---

### 4. There is a screen for a rate limit the product does not have, and one shared quota that can stop it for everyone until tomorrow

| | |
|---|---|
| **What** | The product survives one enthusiastic afternoon, and when its model quota is gone it says so instead of inviting a retry that cannot work. |
| **Why it matters** | Every import spends one Gemini call against **a hard 500/day budget shared with every agent and the owner** — the codebase's own words, in two files. Nothing meters it per user. Round 1's finding 1 then made an import reachable in one tap from a share sheet, which is the change that turns an unlikely accident into an ordinary Sunday. When the quota goes, every user of the product — including a grader following a demo script on 6 September — is shown *"That one's on us, not on the video. We've already got it, so a retry is quick"* with a **Retry** button, because quota exhaustion maps to `EXTRACTOR_UNAVAILABLE`. That sentence is false for the rest of the day, and the button is an invitation to discover it repeatedly. The honest screen already exists, fully written to copy-deck strings C67/C68 — *"You've added a lot of TikTok links in the last few minutes"*, no retry button, a reasoned comment about why — and **nothing in the product can ever show it.** |
| **Evidence** | **Measured, with a control.** `rateLimitedLocal` (`src/domain/errors.ts:177`) is referenced in exactly four places: its own definition, the code map at `:221`, and `tests/unit/errors.test.ts:99` and `tests/unit/import/pipeline.test.ts:523`, both of which **throw it themselves**. There is no producer. Control run: `rateLimitedUpstream`, its immediate sibling, additionally matches a real call site at `src/integrations/tiktok/oembed-source-adapter.ts:167` — so the grep fires and the absence is not a pattern failure. `RATE_LIMITED_LOCAL: 429` is wired in `src/app/api/imports/_lib/error-reporting.ts:84` under the comment *"the one place 429 is honest: this caller really did send too many"*, for a status nothing can return. The budget: `src/ui/import/seed-links.ts:16` and `src/app/import/_lib/use-import-run.ts:383`. The copy: `src/ui/import/import-error-copy.ts:188-195` (unreachable) and `:210-216` (what is actually shown). |
| **The mentor point, because it generalises** | Two tests throw the error they are testing the handling of. That is the shape `ui-review-2026-08-31.md` §5 catalogues — **a probe that cannot fire looks exactly like a probe that found nothing.** The pipeline's rate-limit handling is genuinely covered; the fact that nothing produces the input is invisible from inside the suite, and a written screen plus a status-code mapping plus green tests reads, to anyone scanning, as a shipped limiter. The generalisable rule: **an error code with no producer is a capability claim, and it should fail a check the way an unused export does.** |
| **Effort** | **An afternoon** for the honest half: map a provider quota/429 to a distinct code with copy that says *come back tomorrow* and offers no retry — the copy discipline for this already exists in `import-error-copy.ts`. **A few days** for a real per-user limiter (a counted window keyed on `user_id`, which is a table and a check in the probe route), which is what makes the already-written C67/C68 screen true. |
| **What would change my mind** | A measurement showing daily usage is nowhere near 500 and the free tier is not the binding constraint — plausible on a single-player product with one user. It would drop the limiter to a few days from now, but **not** the copy half: the retry-invites-a-lie screen is wrong at any usage level, and it is wrong most visibly on demo day. |

---

### 5. The one moment this product exists for is marked with a check mark from an icon set

*Promoted into the five on the owner's widened brief, and it displaced a real finding — see the
note under this table for what it pushed out and why I think that ranking is right.*

| | |
|---|---|
| **What** | When a place lands on your map, the character the product is named after is the thing that tells you. |
| **Why it matters** | Every other beat in this product is honest about being ordinary — the no-places screen is deliberately neutral, the failure copy deliberately refuses to apologise, the review screen deliberately refuses to celebrate. That restraint is correct, and it is exactly what makes the *one* success worth marking: a TikTok became a pin, which is the entire proposition. What marks it today is a **lucide `Check` glyph in a 24px disc**, the same check mark in every product ever made, on a strip that auto-dismisses. Meanwhile the mascot has a mood for this state, an animation for this state, and a spark pair drawn for this state, all three shipped and all three unused. This is not "add an animation": it is the product declining to use the identity it built, at the only moment it has earned one. |
| **Evidence** | **Measured (static), and photographed for the surrounding surfaces.** `src/components/map/import-confirmation.tsx:26,77` — `import { Check, X } from 'lucide-react'` and `<Check className="size-3.5" aria-hidden />`. That component is the whole post-import confirmation (`map-page-client.tsx:1391`). Against it: `CRUMB_MOODS.found` (`src/components/brand/crumb-path.ts`) is `{ eyes: 'happy', mouth: 'grin', spark: true, state: 'Places added to your map' }`; `CRUMB_SPARKS` is *"the one celebration the system has, and there is no second one"*; `.crumb-anim-land` in `globals.css` is the one-shot landing beat. **`mood="found"` appears nowhere in `src/`** — the only four moods any call site uses are `idle`, `reading`, `nothingFound` and `offline` (grep over `src/`, and the same grep returns all four of those with call sites, which is the control). Four of eight moods and five of seven animations are drawn, styled, tested and unreachable. |
| **Effort** | **An afternoon, and most of it is a component swap.** `<CrumbMascot mood="found" animation="land" className="size-6" />` in place of `<Check />`, plus the spark-loop defect in the delight section below (`.crumb-anim-land .crumb-spark-1/2` are `infinite` under a comment that forbids exactly that), plus a decision about `alreadySaved` — a re-import that added nothing should not get the celebration, and `ImportConfirmation` already receives the number it needs to tell. |
| **What would change my mind** | An `ux-interaction` ruling that the confirmation strip is deliberately quiet because it lands over a map that is simultaneously flying the camera to the new pins, and that two events at once is one too many. That is a real argument and it would move this to the `nearMe` or `beenThere` moment instead of killing it — the finding is *the moods are unreachable*, not *this specific strip*. |

**What this displaced, recorded rather than dropped: every thumbnail in the library expires at
roughly the same time and nothing re-fetches.** `supabase/migrations/0003_sources.sql:28` grades the
CDN URL *"Signed, ~6-month-expiring (VERIFIED). **Never treat as permanent**"*; `spot.ts:54-57`
carries an `expiresAt` it always sets to `null` because no timestamp is stored; and the entire
response is `place-sheet.tsx:1954-1968`, which hides the broken image. For a product whose thesis is
a map built over months, with no return triggers by ruling, a whole season of saves losing its
pictures at once does not read as an expiring link — it reads as the app losing your stuff. A few
days: on load failure, re-run oEmbed for that `source_id` and store `thumbnail_fetched_at`.
**I ranked it sixth rather than fifth deliberately**, and the reasoning is the honest part: its harm
is six months away on a product that has not launched, while the success beat is missing every
single time anyone completes the core loop, and its assets already exist and are already tested.
On value-per-hour it is not close. If the owner disagrees, this is the one to swap back in.

---

## The craft pass — alignment and position

Unranked, and every one of them measured or photographed. Screenshots and the three probe scripts
are in the session scratchpad; the numbers below are reproducible from the files and lines named.

**Read the shape before the list.** Six of the ten are on **two files** — `chrome-stage.tsx` and the
collection-join page — and they are two different kinds of problem. `ChromeStage`'s are *systemic*:
one wrong property on a shared component, wrong identically on all five screens that use it, and
each is a one-line fix that repairs five surfaces at once. The join page's are *local*: it does not
use the shared component, so every value on it was re-decided by hand and four of them came out
different from the family. **That is the generalisable point of this whole section** — the product
is not sloppy, it has one screen outside the system, and everything outside a system drifts.

### C1. Six screens scroll 28px sideways on every phone · **measured** · 390 layout viewport, both themes

`document.documentElement.scrollWidth` is **418** against a 390 layout viewport on `/`, `/sign-in`,
`/sign-in?mode=sign-up`, `/auth/reset`, `/auth/reset?state=expired` and `/auth/new-password`. It is
**0** on `/collections/join/<token>` and `/nope`, which is the control: the same probe on the same
run returns no overflow for the two screens that do not use `ChromeStage`.

The culprit is one element, and it is decorative: `src/components/brand/chrome-stage.tsx:79`, the
card's glow, `-inset-x-12` (−48px each side) with no clipping ancestor. Its box measures `left=-28,
right=418`, which is the 418 exactly. The two `rounded-full` blooms reach further still (to x=607)
and cause no scroll, because `ChromeGround`'s wrapper is `overflow-hidden` — so the fix is already
demonstrated one component away.

**Known, and I am raising it because the shape changed.** `ui-review-2026-08-31.md` finding 5 filed
this on `/` and `/sign-in`; my 28 is the same 28. What is new is that **four of the six screens did
not exist this morning** — `5fd987c` built them on the shared component and they inherited the
defect, which is what a systemic defect does when the system is used correctly. Effort: one class.

### C2. The identity lockup's vertical position is a function of how many lines the subhead wraps to · **measured** · 1440x900

At 1440, the mark sits **57px** below the card's top edge on `/`, `/auth/reset` and
`/auth/new-password`, **79.5px** on `/sign-in?mode=sign-up`, and **132.5px** on `/sign-in`. In
absolute terms it is at `y=315.52` on `/` and `/sign-in` and at `y=326.52` on the other three — so
**toggling the sign-in screen between its two modes moves the product's mark down 11px**, and that
toggle is a control on the screen itself.

The cause is `chrome-stage.tsx:127`, `justify-center` on the editorial section. The mark is the
first item in a column that is vertically centred against a form column of a different height, so
whether the subhead wraps to one line or two moves the logo. (`sign-in`'s subhead is 44px tall,
`sign-up`'s is 22px; the difference is 22px and the mark moves by half of it.)

The `justify-center` is deliberate and its comment gives a good reason — it removed 80px of dead
space under the landing CTA. The defect is that it centres the column **containing the identity**
rather than only the column that needed it. `lg:justify-start` on the editorial half with the mark
pinned to the card's top padding keeps both properties.

### C3. The invite screen's headline uses the display size token and overrides its leading · **measured** · both viewports

Every 34px display headline in the product renders at **38.08px** leading (`text-display`).
`/collections/join/<token>` renders at **42.5px** — `1.25`, i.e. `leading-tight` — because the
element is `font-display text-display leading-tight` (`src/app/collections/join/[token]/page.tsx`,
the `h1` in the signed-out branch). Same font, same size, same weight, same role as `not-found`'s
headline, 4.4px more leading. Deleting one class fixes it. This landed **this morning**, in the same
commit that fixed the screen's typeface — the fix joined the family for face and size and then
opted out of its leading.

### C4. The invite screen's primary action is a different size from every other primary action · **measured** · both viewports

| surface | CTA height at 390 | at 1440 | label size |
|---|---|---|---|
| `/`, `/sign-in`, `/sign-in?mode=sign-up`, `/auth/reset`, `/auth/new-password` | 48 | 52 | 16 → 15.5px |
| `/nope` (not-found) | 48 | 52 | 16 → 15.5px |
| **`/collections/join/<token>`** | **56** | **56** | **16 → 16px** |

`h-14 w-full text-base` on the join page against `h-12 lg:h-13` everywhere else. Two divergences on
one control: 8px taller on a phone, and it does not take the desktop type step-down its six
siblings take. Everything else about the button family is exact — border-radius is `16px` on all
seven, the label is Manrope 700 on all seven — which is what makes this one stand out rather than
disappear.

### C5. The invite screen mixes text alignment inside one column · **measured** · both viewports

In a single 384px column (342px at 390), `computedStyle.textAlign` is `start` for the headline, the
subhead and the CTA, and **`center`** for the two lines under it — *"You'll come straight back
here."* and *"Already have an account? Sign in"*. Same column, same width, two alignments, no rule
distinguishing them. Photographed at 1440 light: the ragged left edge under a hard left rail is
visible without measuring.

### C6. The invite screen's mark does not take a desktop step, and is still faceless · **measured** · both viewports

`<PinMark className="h-[30px] w-[30px] shrink-0" />` — an arbitrary pixel value, 30px at both
breakpoints. `not-found.tsx:52` uses `size-7.5 lg:size-9`, so 30 → 36. The mark is also **faceless**:
no `face` prop, so it renders as a plain filled disc. That half is `ui-review-2026-08-31.md`
finding 7 and is **still live** — `error.tsx` was fixed (it now renders `CrumbMascot mood="offline"`),
`not-found.tsx` and the join screen were not.

### C7. On the product's only acquisition surface, the mark is stranded and the frame is mostly empty · **photographed** · 1440x900 and 390x844, both themes

The mark is pinned to the top-left of the *viewport* (`x=24`) while the content block is centred
(`x=528` at 1440) — **504px apart**, with nothing in between. At 390 the disc sits at `y≈56` and the
headline starts at `y=465.5`, so **roughly 400px of empty screen** separates the product's only
identity mark from the first word a stranger reads. Photographed in both themes at both viewports.

This is the composition half of `ui-review` findings 7 and 8, still live. It is in the craft pass
rather than the five because the *words* on this screen were fixed this morning and are now good;
what is left is where things sit. It is also the cheapest of the seven to fix well, because the
product already owns the answer: `ChromeStage` is a centred card with the lockup inside it, and this
screen is the one message surface that does not use it.

### C8. The mark's ink sits 5px right of the rail everything beside it aligns to · **measured, painted pixels** · 1440x900 light

Every element in `/sign-in`'s editorial column has its box at `x=253`: the mark, the kicker pill,
the headline, the subhead. Scanning painted pixels in a screenshot clip, the **headline's ink begins
at x=253** (its control — a Fraunces cap reaches its box edge) and the **mark's ink begins at
x=258**. Five pixels.

It is not a bug and it is not an accident: `CRUMB_ARTBOARD` is `-8 -8 116 116`, reserving room for
the keyline's straddle, and `CRUMB_BOUNDS.minX` is `5.2`, so the ink is inset `(5.2+8)/116 = 11.4%`
of the box, less about half the 4.5-unit keyline — **5.3px predicted at a 56px box, 5 measured.**
The arithmetic and the pixels agree, which is what makes this actionable rather than a hunch.

This is the classic optical-alignment case: a shape whose bounding box is not its silhouette,
box-aligned against type. Whether to nudge it is `design-system-frontend`'s call, and the *right*
fix is a negative inline start of `(CRUMB_ARTBOARD.minX + CRUMB_BOUNDS.minX)/116` of the box —
derived from the constants, so it cannot drift from the shape, exactly as `CRUMB_HEAD_CENTRE`
already is. At the 44px phone mark the same fraction is 4.1px.

### C9. Two secondary actions on one screen, two alignments · **measured** · both viewports

On `/sign-in`, *"Forgot your password? **Reset it**"* is `text-align: start` and begins at `x=45`,
on the rail every other element on the screen sits on. *"New here? **Create an account**"* is
`text-align: center` in the same 300px column. Both are secondary actions, one screen apart in the
eye's travel. One of the two is wrong and I have no evidence which; naming the pair is the finding.

### C10. The divider between the two halves is asymmetric at one breakpoint and symmetric at the other · **measured** · 390 vs 1440

`chrome-stage.tsx:127` and `:212`: at mobile the editorial half is `pb-8 pt-9` and the form half is
`pb-8 pt-7`, so the four vertical paddings of the card are **36 / 32 / 28 / 32**; at `lg` both
halves are `py-14`, so all four are **56**. Measured on `/sign-in` at 390, the gap across the
divider is 61px total (32 above + 1px rule + 28 below). A 4px asymmetry can be an optical decision
about text above a rule versus a label below one — but an optical decision that exists at one
breakpoint and vanishes at the other is a leftover, not a decision.

---

## Delight, and the mascot

The brief asks for three separate things. They are separated.

### 1. What it does today — read, not guessed

| | |
|---|---|
| **Moods defined** | **Eight** (`crumb-path.ts` `CRUMB_MOODS`), each bound to a named product state, out of six eye sets and seven mouths. `#moods`' rule is *"a face may only exist if there is a screen that needs it."* |
| **Moods used** | **Four.** `idle` — `/map`'s shell chip, the OG image, the apple icon, and `ChromeMark` on `/`, `/sign-in`, `/auth/reset`, `/auth/new-password`. `reading` — the trail on the import rail. `nothingFound` — the no-places screen. `offline` — `error.tsx` and `global-error.tsx`. |
| **Animations defined** | **Seven** in `globals.css` — bob, wobble, scan, land, stir, halo, plus the awareness transform. |
| **Animations used** | **Two.** `stir` (the map chip and `error.tsx`) and `wobble` (the import trail). `bob`, `scan`, `land` and `halo` are targeted by no call site. |
| **Awareness** | `CrumbAware` writes two custom properties from a `requestAnimationFrame`, the transform lands on `.crumb-eyes`, no React re-render and no layout. Mouse only — a tap would leave the eyes frozen off-centre, so touch gets nothing deliberately. Reduced motion detaches the listeners rather than hiding the result, and subscribes to changes rather than sampling once. |
| **Restraint** | `stir` is 17s and a measured 85.6% still. `land` is `1 both`, never `infinite`, *"if it loops it stops being an event and becomes wallpaper."* The map is excluded from bob and from any opacity pulse because both are already the map's own pin language. |

The rig is better than the product's use of it. That is the whole shape of this section.

### 2. What it should notice and does not

1. **A place landing on your map.** `found` + `land` + the spark pair, all drawn, all unused; the
   moment is a lucide check mark. This is finding 5 above.
2. **Locating.** `nearMe` is `{ eyes: 'wide', mouth: 'o', halo: true, state: 'Locating, near-me on' }`
   and `.crumb-anim-halo` is *"a slow pulse behind the body — a signal, not progress"*, which is
   precisely what a GPS fix is. `components/map/near-me.ts` is a full state machine with named
   `GeolocationPositionError` cases and no mascot anywhere near it.
3. **A place marked Been.** `beenThere` is closed eyes and a content mouth — the quietest face in
   the set, drawn for the quietest act in the product. `setSavedPlaceVisited` ships; the face does
   not appear.
4. **A place added to a collection.** `saved` (the wink) is bound to exactly that state in the
   table. Collections shipped; the wink never runs.
5. **A failure the mascot has no mood for.** `IMPORT_ERROR_COPY` carries roughly fifteen error
   states, each with its own `icon` from a separate icon vocabulary (`waiting`, `our-side`,
   `link-off`, `no-caption`). The mascot's only failure mood is `offline`, and it is spent on the
   React error boundary. The most common failure surfaces in the product run an icon system that
   has nothing to do with the character.

**The comment that is quietly apologising**, and it is the one to fix first because it is what stops
anyone looking: `globals.css`'s mascot block is headed *"The seven animations … **and the two of
them this product has a screen for**."* That sentence reads as a scoping decision and it is not one
— the product has a screen for `land` (the save confirmation), a screen for `halo` (near-me), and
two more moods with shipped states. The header records an absence as a fact about the product. Two
of eight is a backlog, written as a boundary.

### 3. What it does that it should not — the one nobody looks for

1. **The celebration loops forever, four lines under the rule forbidding it.**
   `globals.css`: `.crumb-anim-land .crumb-all { animation: crumb-land 0.78s … 1 both; }` — one
   shot, correct — immediately followed by
   `.crumb-anim-land .crumb-spark-1 { animation: crumb-spark 1.6s ease-in-out infinite; }` and the
   same for `-2`. The body lands once and the sparks twinkle **indefinitely**, on a comment block
   whose own words are *"**one-shot**, `1 both`, never `infinite`. `#motion`: 'If it loops it stops
   being an event and becomes wallpaper.'"* It is invisible today because nothing uses `land` — and
   it fires the instant anyone implements finding 5, which is exactly the wrong moment to discover
   it. Two words.
2. **The stylesheet documents the eye travel that was measured and rejected.** The `.crumb-aware`
   block says the lengths are *"`2.4` and `1.8`"* and that they *"keep the pupils inside the face at
   full deflection."* The shipped values are `TRAVEL_X = 5` and `TRAVEL_Y = 3.2`
   (`crumb-aware.tsx`), raised **because 2.4 units is 0.91 CSS px at a 44px mark — sub-pixel, and
   photographed as indistinguishable at the two extremes.** The stylesheet now records the abandoned
   numbers as current, beside the rule that justifies them. The next person to tune this reads the
   comment and reverts the fix.
3. **`offline` is bound to a state that is not the state it is used on.** The mood table says the
   `state` field *"is not documentation. It is the screen the mood is allowed on"*, and binds
   `offline` to *"Connection lost, retryable error."* `error.tsx` is the React error boundary — a
   component that threw, which is neither. Small, but it is the table's own rule, and the table is
   the thing keeping eight faces from becoming twelve.

**And the reverse, checked for and not found.** There is no surface where the mascot performs during
a moment that should be quiet. The strongest evidence is the hardest case: the no-places screen is
the modal outcome of an import at LEVEL B's hit rate, the user sees it three times in four, and it
renders `nothingFound` with **no animation prop at all** — flat eyes, flat mouth, dead still, on the
screen where a sad or busy mascot would turn the product's most common outcome into a small failure
eight times a week. That restraint is the best decision in the whole mascot system and nothing
proposed above should touch it.

---

## What I checked and found healthy

Named specifically, and none of them repeats round 1's five.

**1. `sharedImportUrl` refuses to become a second security boundary, and says why.**
`src/app/import/page.tsx`. The obvious way to write this function is to filter — accept TikTok links,
drop the rest — and it would have been wrong twice: it would duplicate `canonicaliseTikTokUrl`'s
closed host allow-list in a place with no test protecting it, and it would land an Instagram share on
a blank paste screen with nothing said. Instead it forwards what arrived and lets the one real
boundary judge, so an unsupported host becomes the recognised redirect the brand doc already rules
it is. The array handling exists because Chromium sends `url` **and** `text`, and the rule is stated
as *"a choice between values the browser supplied, never a judgement about hosts."* Knowing which of
two adjacent functions is the security-critical one, and writing it down in the one that is not, is
the discipline round 1 praised in `extract-pasted-url.ts` — this is a second instance, which is what
turns an instinct into a house rule.

**2. The manifest states its own ceiling instead of implying a capability.**
`src/app/manifest.ts`'s header says, in bold, that Web Share Target is Chromium-only, that Safari
implements it on no platform, that the key does nothing until the app is installed, and that nothing
in the product invites that install. A team is far more often tempted to ship the key quietly and let
the roadmap read as if sharing works. The same header explains why both share fields are aimed at one
parameter and why `title` is not requested — *"there is nothing this product would do with it."*
This is what "no unverified assertion" looks like when it is applied to the team's own documentation
rather than to user-facing copy.

**3. `already_saved` is reported as its own outcome, and the reasoning survived a design change.**
`src/app/api/imports/confirm/route.ts:98-100`: *"re-importing a place you already had came back as a
plain 'saved' and the review screen claimed a fresh save every time."* Most products round that off.
Keeping it distinct is also what makes finding 1 a two-line fix rather than an investigation — the
server already knows the row existed; it just knows it a moment too late. Alongside it, the four-state
`EnrichmentOutcome` refuses to report *we looked and found nothing* for *we could not look*, which is
the same rule applied to a field nobody sees.

**4. The G5 carve-out on `arrivesTicked` is a correction that does not reverse a ruling.**
`src/app/import/screens/review/review-screen.tsx:145-168`. The owner ruled on 2026-08-29 that
duplicates arrive ticked; a real defect was then found where the cards with the *least* provenance
(`capped`, `not_attempted` — nothing was ever looked up) also arrived ticked. The fix withholds the
tick from exactly those two views, keeps their checkbox and keeps them in `Select all`, and the
comment distinguishes the two cases in one sentence: *"the 2026-08-29 ruling is about a place we
found and the user already has; this is about a place nobody checked."* Narrowing a ruling by naming
the distinction, rather than re-arguing it, is how a codebase keeps decisions that are three days old.

**5. `earliestSource` sorts rather than trusts.**
`src/app/map/_lib/get-spots.ts:141-149` takes the earliest-linked source by `added_at` *"rather than
an arbitrary array order the join happens to return."* It is four lines and it is the difference
between a place whose source link is stable and one that changes when PostgREST feels like it. It is
also, incidentally, the line that made finding 1's sibling behaviour legible — the many-to-many is
real, the render is one, and the file says so instead of pretending the relationship is 1:1.

**6. The chrome family's spacing scale is exact, and I went looking for a break in it and failed.**
Measured across `/`, `/sign-in`, `/sign-in?mode=sign-up`, `/auth/reset` and `/auth/new-password` at
both viewports: the card's inner inset is **25px** at 390 and **45px** at 1440 on *every* screen and
*every* element — mark, kicker, headline, subhead, field, button — and both numbers are the token
plus the card's 1px border, not a stray value. The primary action's distance to the card's bottom
edge is **33px on all five**. The editorial rhythm is `gap-5` between the lockup and the block and
`gap-3` inside it, measured at 20 and 12 at 390 and 24 and 16 at 1440, on all five. Border-radius on
the primary action is `16px` on all **seven** message surfaces including the two that do not share
the component. C2 and C10 are the only two breaks I found in that family, and they are properties of
one shared component rather than drift — which is the difference between a system with two bugs and
no system.

**7. `CrumbAware` is the best-argued piece of interaction code in the repository.**
`src/components/brand/crumb-aware.tsx`. Not a `useState` per `pointermove` (sixty renders a second of
an inlined SVG subtree), not a `window` listener (it would fight MapLibre for the main thread on a
drag), coalesced to one write per frame, asymmetric ease so the eyes *snap* to you and drift back.
Touch is refused outright with a stated reason — a tap fires `pointerenter` and then nothing, so a
phone would get one glance and then a character staring fixedly off to one side. Reduced motion
**detaches the listeners** rather than hiding the result, and subscribes to the media query rather
than sampling it once. And the teardown comment records a real bug found in a browser that no unit
test in this repository could have seen. Every one of those is a decision someone could have skipped
and nobody would have noticed.

**8. The mascot's numbers are derived, not typed.**
`CRUMB_HEAD_CENTRE` is computed from `CRUMB_BOUNDS` *"so it cannot drift from the shape it sits in"*;
`CRUMB_BOUNDS` itself was read off the alpha channel at 10x rather than eyeballed; `CRUMB_ARTBOARD`
is `-8 -8 116 116` because a 4.5-unit keyline straddles its path and the docblock states the
consequence — the faced mark is ~14% smaller than the silhouette at a fixed box. That discipline is
why craft finding C8's predicted 5.3px and measured 5px agree: the shape is described well enough
that a reviewer can compute what a screenshot will show before taking it.

---

## What this round did not check

- **Any signed-in pixel, which is most of the product.** The local Supabase stack is stopped, so
  `/import`, `/map`, `/profile` and `/collections` all answer `307` to `/sign-in`. The craft pass
  covers the seven signed-out message-and-chrome surfaces completely and says **nothing** about the
  map, the sheet, the review screen, the rail, the collections list or the profile — which is where
  the owner's question about cross-screen rhythm has the most surface to be wrong on. **A second
  craft pass against a running database would be worth more than this one was.**
- **The mascot in motion.** Every animation claim above is read from `globals.css` and its call
  sites. Nothing was recorded, so the spark-loop defect (delight §3.1) is proven from the CSS
  declaration rather than from watching it, and it cannot be watched today because no call site
  uses `land`.
- **Any database row.** No `psql`, and the stack is down. Three findings name a query that would
  sharpen or kill them and all three are unrun: the multi-source count (finding 1),
  `source_dataset` distribution (finding 2, still owed from round 1), and a `curl -I` against a
  stored thumbnail (the displaced sixth).
- **Anything hosted**, per `agent-guardrails.md` §2 — including the one owner action this round
  identified, the Supabase Redirect URLs allow-list that decides whether `5fd987c` works in
  production at all.

Nothing was written outside this file. No database row, temporary file or running process was left
behind. No `src/` file was modified and nothing was committed or staged.


---

# Addendum — the queries, run against the local database

> Added after the round, when the orchestrator pointed out that the Postgres container is up even
> though the Supabase services report stopped: `docker exec supabase_db_P-002 psql -U postgres`.
> All statements below are `select` only. No row was written, no DDL was issued, and one outbound
> `HEAD` was made to a TikTok CDN URL that TikTok itself issued — reported as a status code, never
> as a URL.
>
> **Note on the two sections above.** The craft pass (§ *The craft pass*, ten findings) and the
> mascot audit (§ *Delight, and the mascot*, three parts) were appended when the widened brief
> arrived and are already in this file. Nothing in this addendum replaces them.

## What the sample actually is, before any number is read off it

**The local database was reset at 16:33 UTC today.** Six of its eight `places` rows share the
timestamp `2026-08-31 16:33:58.290799+00` — one transaction, which is `supabase/seed.sql`, whose own
header calls its contents *"fabricated"*. The other two were written by the real pipeline this
evening (18:32 and 18:40).

So the population is **six fabricated rows and two real ones**, two hours old. That governs every
number below and it is the reason three of the four queries settle nothing. Reporting them anyway,
including where they look like they support me and do not.

| Query | Result | What it settles |
|---|---|---|
| `select version from supabase_migrations.schema_migrations order by version desc` | tops out at **`0031`** | **Settled.** `0032`/`0033` are committed and unapplied. Finding 2's evidence is now measured here rather than attributed to the orchestrator. |
| `select source_dataset, count(*) from places group by 1` | **6 null, 2 `google-places`**, zero `llm-guess` | **Does not settle finding 2.** The 31-row library `location-certainty.ts:8-11` measured 21/31 against no longer exists on this machine. |
| `select saved_place_id, count(*) from saved_place_sources group by 1 having count(*) > 1` | **0 rows**; 8 links over 8 distinct saves | **Does not settle finding 1.** A two-hour-old database with two real imports cannot show a repeat save. |
| `select count(*) filter (where note is not null …) from saved_places` | **1 of 8** | Nothing. Seeded. |

**The one real signal, and it is too small to act on.** Both places imported through the *current*
pipeline this evening resolved to `google-places`, at `resolution_score` **1.0** and **0.907**. That
is the direction finding 2's *what would change my mind* pointed at — new saves resolving properly
rather than guessing — and **n = 2**. It is not evidence, it is a hint that the re-measurement is
worth doing on a real library. Finding 2's ranking stands, and the query it needs is still owed
against a library that has one.

**A second, unlooked-for observation from the same query, offered as a question rather than a
finding.** Six of the eight rows carry `place_provider_refs.provider = 'overture'` and
`places.source_dataset = null`. `locationCertainty()` returns **`null`** for a null dataset — no
label at all — while `'overture-places'` has a perfectly good label written for it (*"Matched in
Overture Maps"*). On this database that is a seed that does not set the column, and it proves
nothing about the write path. **It is worth one grep by whoever owns the resolver**: if the
application's Overture path also leaves `source_dataset` null, then the honest-provenance label the
product is proudest of is silently absent on every Overture save, and the seed is telling us so by
accident.

---

## The finding that reversed on measurement, and it is the important part of this addendum

**I ranked the thumbnail expiry sixth and said its harm was "six months away on a product that has
not launched." That was wrong by roughly ninety times, and the number that makes it wrong is stored
in the product's own database.**

The stored TikTok thumbnail URLs carry an `x-expires` parameter. Decoded from the three real rows,
against their own `fetched_at`:

| fetched | `x-expires` | window |
|---|---|---|
| 2026-08-31 16:48:51Z | 2026-09-02 16:00:00Z | **47.19 h** |
| 2026-08-31 18:31:54Z | 2026-09-02 18:00:00Z | **47.47 h** |
| 2026-08-31 18:40:24Z | 2026-09-02 18:00:00Z | **47.33 h** |

**Under 48 hours, not ~6 months.** Recomputed independently in Python from the raw epoch integers
rather than trusting the SQL arithmetic: the observed values are `1788364800` and `1788372000`,
where a 180-day window from the same fetch would be `1803746931`. The three cluster on a round
UTC hour, which is the signature of a short bucketed signing window.

**Control, so the reading is not a broken probe.** A `HEAD` against the oldest of the three returns
`status=200 content_type=image/jpeg` — the URL is real, the host is reachable, and the image serves,
because it has not expired yet. What could **not** be tested is the other side: there is no expired
specimen on this machine, so whether an expired URL returns 403 or something else is unobserved.
`docs/evidence/tiktok/08-engine2-access-surface-2026-08-31.md:912` records the same gap.

### What this overturns

1. **A VERIFIED grading is wrong.** `supabase/migrations/0003_sources.sql:28` reads *"Signed,
   ~6-month-expiring CDN URL (**VERIFIED**). Never treat as permanent."* House rules say design may
   only depend on VERIFIED, and this one is off by about 90×. Its origin is
   `docs/evidence/tiktok/01-oembed-field-inventory.md:21` — *"`x-expires` observed ≈ 6 months out"* —
   so it was measured once and either TikTok changed the window or the original reading was wrong.
   **I cannot tell which**, and the difference matters: one is a re-grade, the other is a method
   defect. The evidence file should be re-run rather than edited.
2. **A domain docblock is wrong in both halves.** `src/domain/places/spot.ts:54-57` says the column
   is *"a signed URL with a known expiry window (~6 months) but **no expiry timestamp is stored**, so
   there is nothing truthful to put there yet."* The timestamp **is** stored — it is inside the URL,
   as `x-expires`, and a regex on a string the product already holds yields it. `MediaRef.expiresAt`
   can be populated today, with no fetch and no migration.
3. **A decision was taken on the wrong input.** `technical-design.md:635` decision 6 —
   *"hot-link a signed 6-month URL or copy the bytes"* — and `04-tiktok-feasibility.md:64,341`.
   At six months, hot-linking is obviously right. At 48 hours it is obviously wrong, and the choice
   is now between copying the bytes (a ToS question for `security-privacy`, and the reason that
   decision was deferred) and not showing a thumbnail on a place older than two days. **That is an
   owner-and-security decision, not an implementation one, and it should be re-taken rather than
   inherited.**
4. **A live lane is designing on the wrong number right now.**
   `docs/evidence/tiktok/08-engine2-access-surface-2026-08-31.md` (untracked, written today) repeats
   *"`x-expires` ≈ 6 months"* at lines 477, 803 and 849, including in a recommendation. Whoever owns
   that document should see this before it is acted on.

### What it means for the product, and for my own ranking

**Every saved place loses its picture about two days after it is saved.** Not in six months — this
week, last week, and every week since the feature shipped. `place-sheet.tsx:1954-1968` hides a failed
image permanently for that mount, so it fails silently and looks like the app losing your things
rather than like a link going stale. The library the owner has been building is very likely already
blank except for whatever was imported in the last 48 hours; I could not check, because the database
that would show it was reset this afternoon.

**So the five as filed are stale on this point, and the honest revision is:**

> This belongs at **#2**, above the re-point and below the note overwrite. It is silent, total,
> ongoing loss of a field the product renders, it is already happening, and unlike the re-point it
> has no reviewed artefact waiting. **It displaces the mascot success beat out of the five** — which
> is the same call I made in the other direction three hours ago, on a number that turns out to have
> been wrong. The mascot finding is still worth an afternoon and still stands as written; it is no
> longer top-five.

The first move is not the fix. It is one grep and one re-measurement: confirm `x-expires` on a
freshly fetched oEmbed response from a second post, and re-grade `0003`'s comment and
`01-oembed-field-inventory.md` from that. **A VERIFIED claim that is 90× out is worse than the
thumbnails**, because it is the input to decisions nobody will re-derive.
