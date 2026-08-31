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

### 5. Every picture in the library expires at once, and nothing goes and gets it back

| | |
|---|---|
| **What** | The thumbnail that tells you which TikTok a place came from is still there in six months. |
| **Why it matters** | This is a product whose thesis is a map built up **over months**, and which deliberately ships no return triggers — so the user comes back after long gaps by design. The thumbnail is the recognition cue: it is what makes a row in a list a memory of a video rather than a name and a category. It is a signed CDN URL with a roughly six-month life, so the failure is not gradual and not per-row; a library built through the autumn goes visually blank across a whole season of saves at roughly the same time. What the product does about it is hide the evidence: `onError` sets `failed` and returns `null`, permanently for that mount. Nothing re-fetches, nothing records that the picture was ever there, and nothing tells the user. From the outside it does not look like an expiring link. It looks like the app lost their stuff. |
| **Evidence** | **Measured (static), and the expiry is VERIFIED by the repo's own grading.** `supabase/migrations/0003_sources.sql:28`: *"Signed, ~6-month-expiring CDN URL (VERIFIED). **Never treat as permanent** (security-privacy Q6)."* The column is plain `text` with no expiry timestamp beside it, and `src/domain/places/spot.ts:54-57` carries a typed `expiresAt` field it always sets to `null` because *"no expiry timestamp is stored, so there is nothing truthful to put there yet."* `src/app/map/_lib/get-spots.ts:159` sets it. `src/components/sheet/place-sheet.tsx:1954-1968` is the whole response: hide it. Nothing in `src/` re-calls oEmbed for an existing source — the only oEmbed caller is the import path. |
| **Known?** | **Partly, and I am raising it anyway.** The expiry is documented in three files; what is nowhere is the consequence or a plan. "Never treat as permanent" was honoured to the extent of not showing a broken-image icon, which is the smallest possible reading of that instruction. |
| **Effort** | **A few days.** The cheap version needs no storage and no ToS question: when a thumbnail fails to load, ask the server to re-run oEmbed for that `source_id` and update `sources.thumbnail_url` — the oEmbed adapter, the source row and the write path all exist, and oEmbed is the VERIFIED access mechanism this product is already built on. Store `thumbnail_fetched_at` while you are there so the `expiresAt` the type already has stops being a lie. Caching the image bytes ourselves is the expensive version and needs `security-privacy` on TikTok's terms first; do not start there. |
| **What would change my mind** | A measurement that the URLs do not in fact expire, or expire far longer than six months — one `curl -I` against a stored `thumbnail_url` older than the window would settle it, and I could not run it because there is no database to read a URL out of. If they last years, this drops out entirely and the six-month figure in `0003` should be corrected rather than carried. |

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

---

## What this round did not check

- **Any pixel.** No browser was driven, by instruction. Both breakpoints and both themes are unchecked.
- **Any database row.** The local Supabase stack is stopped and there is no `psql`. Three of the five
  findings name a query that would sharpen or kill them, and all three are unrun: the multi-source
  count (finding 1), `source_dataset` distribution (finding 2, still owed from round 1), and a
  `curl -I` against a stored thumbnail (finding 5).
- **Anything hosted**, per `agent-guardrails.md` §2 — including the one owner action this round
  identified, the Supabase Redirect URLs allow-list that decides whether `5fd987c` works in
  production at all.

Nothing was written outside this file. No database row, temporary file or running process was left
behind. No `src/` file was modified and nothing was committed or staged.
