# Product review — round 3, 2026-08-31

> **Written 2026-08-31 22:20 UTC / 2026-09-01 01:20 local**, on `no-crumbs-implementation`, using
> the **already-running** `next dev` on **port 4311** (PID 10489) and the real local Supabase.
> Signed in as the seeded dev user `demo@example.com` (`baf6dbc7-0642-4147-bced-09f5d3724c68`),
> credentials from `supabase/seed.sql`'s header.
>
> **Read this before citing a number.** The evidence below is taken against the **working tree**,
> not against a commit, and under concurrency that is a weaker claim — `working-agreement.md` says
> so and it is right. HEAD is `7b57390`, and the tree additionally carried seven other agents'
> uncommitted edits while I measured: `src/app/profile/page.tsx`,
> `src/app/profile/_lib/profile-stats.ts`, `src/app/sign-in/sign-in-client.tsx`,
> `src/components/brand/chrome-ground.tsx`, `src/components/brand/chrome-motion.ts`,
> `tests/unit/profile/profile-stats.test.ts`, plus untracked `src/app/sign-in/name-fields.ts`,
> `src/integrations/llm/note-extractor.ts` and `supabase/migrations/0035_names_at_sign_up.sql`.
>
> **Two items below touch those files and are therefore provisional**: craft item `D8` (the profile
> screen) and the `safeReturnPath` re-verification in §1.3 (the sign-in client). Re-run both against
> a commit before acting on them. **Nothing else does** — findings 1–5 and craft items D1–D7 and
> D9–D12 land on `components/shell/sheet-geometry.ts`, `components/sheet/place-sheet.tsx`,
> `components/shell/map-shell.tsx`, `app/import/**`, `package.json`, the database and the repo root,
> none of which any agent had modified.
>
> Round 1 is [`product-review-2026-08-31-r1.md`](product-review-2026-08-31-r1.md), round 2 is
> [`product-review-2026-08-31-r2.md`](product-review-2026-08-31-r2.md). Neither is re-reported here.
> The last UI sweep is [`ui-review-2026-08-31.md`](ui-review-2026-08-31.md).

## 0. The environment, measured rather than described

The orchestrator's description was right about the shape and wrong about two numbers, and one of
those numbers **changed while this review was running**. What I actually found:

| | |
|---|---|
| Docker | 4 containers up ~5 h: `supabase_db_P-002` (54322), `supabase_kong_P-002` (54321), `supabase_rest_P-002`, `supabase_auth_P-002` |
| Stopped | `inbucket`, `realtime`, `storage`, `imgproxy`, `pg_meta`, `studio`, `edge_runtime`, `analytics`, `vector`, `pooler` |
| Dev server | **Already running on `:4311`**, not stopped. `next dev -p 3210` refused with *"Another next dev server is already running"* |
| `/healthz` | `{"ok":true,"stage":"local","commit":"dev"}` in 12 ms |
| Auth | Real password sign-in works through Kong. Every finding below is from a **signed-in session**, not a code reading |
| `psql` | **Not installed.** `which psql` → not found; no libpq under `/opt/homebrew` or `/usr/local` |

**The migration numbers moved under me.** At 21:35 UTC `supabase_migrations.schema_migrations`
topped at `0031`, exactly as the orchestrator said. At 22:16 UTC it topped at `0034`, with 33 rows.
At the same time a **34th file appeared on disk** — `0035_names_at_sign_up.sql`, untracked, which
is the in-flight sign-up-names package. So:

- `0035` did **not** exist when the orchestrator described it as committed-and-unapplied. Three
  migrations were in that state, not four.
- All three are now applied — and **how** they were applied is finding 5.

## 1. Round 2's five, audited against the running product

### 1. Note precedence — **landed, verified in the live database**

`save_place`'s `obj_description` in the running Postgres carries 0034's rule verbatim: *"note, tags,
why_go, dishes, source_url and source_thumbnail_url are all FIRST NON-NULL WRITER WINS … 0034 brought
note into line — it was last-writer-wins and was the only column a human typed."* The function body
is live (2,038 chars, `coalesce` present). Verified against the database, not the file.

### 2. Re-point — **the database half is now live too; the product half is still absent**

`repoint_saved_place` **exists in the local database** (6,618 chars) and its body contains both
`extracted_reason` and `tags`, so it is 0033's attribution-clearing version, not 0032's. Two
corrections to the orchestrator's framing:

- It is not "committed and unapplied". It is **applied**, and the objects work.
- **My round-2 line that an unapplied migration is an obligation rather than an asset was right and
  is now moot for these three.** What replaced it is worse and is finding 5.

The product half is unchanged and I stand behind ranking it: `src/app/actions/saved-places.ts`
exports five server actions (`deleteSavedPlace`, `updateSavedPlaceNote`, `updateSavedPlaceName`,
`updateSavedPlaceCategory`, `setSavedPlaceVisited`) and none of them calls `repoint_saved_place`.
The place sheet, photographed at both breakpoints, offers *Been here · Add to a collection ·
CATEGORY Change · YOUR NOTE Edit · Open on TikTok · Google Maps · Remove from your places*. There is
no re-point control. **A reviewed, security-signed-off, live database function with no caller is a
worse state than an unapplied migration**, because the ledger now says the work is done.

### 3. `safeReturnPath` — **landed, and it is the cleanest of the five. Verified end to end.**

Signed in five times with hostile `next` values and twice with allow-listed ones:

| `next=` | landed on |
|---|---|
| `https://evil.example.com/x` | `/map` |
| `//evil.example.com/x` | `/map` |
| `/\evil.example.com` | `/map` |
| `/profile` | `/map` — **correct**, it is not on the allow-list |
| `/map?view=collections` | `/map` — correct, same reason |
| `/collections/join/11111111-2222-3333-4444-555555555555` | **carried, intact** |
| `/import?url=https%3A%2F%2Fwww.tiktok.com%2F%40x%2Fvideo%2F123` | **carried, `url` intact** |

`src/domain/auth/return-path.ts:81-90` is a two-shape allow-list with the sentinel-origin re-parse.
I went looking for a hole in it and did not find one.

### 4. `EXTRACTOR_QUOTA_EXHAUSTED` — **landed, photographed**

`/import?state=error-EXTRACTOR_QUOTA_EXHAUSTED` renders kicker *NOT RIGHT NOW*, headline *"We can't
find places right now."*, body *"We read it fine. Try it again tomorrow."* and **exactly one action,
`Back to the map`**. The retry the product could not honour is gone. `scratchpad/shots/import-quota.png`.

### 5. The mascot success beat — excluded by instruction (in flight).

### The reversal, and the question it opened

Round 2's thumbnail finding died on measurement because `cache-control: max-age=31536000` was read as
a signature deadline. That was a **method defect**: a field read as evidence of something it does not
attest. The orchestrator asked what else was measured that way. **Finding 5 is the answer**, and it is
the same defect in the migration ledger.

## 2. The new five, ranked by value

### 1. Marking a place *been* is impossible on a phone

| | |
|---|---|
| **What** | A person standing outside a café they saved can tap *Been here* and have it register, instead of being thrown to their profile. |
| **Why it matters** | *Been / not been yet* is one of the five things the MVP boundary says this product stores, and it is the only signal that separates a wishlist from a record. Today, on every phone width, the button is painted **underneath the floating navigation pill**, so a tap on it navigates to `/map` or `/profile` and closes the place. The user does not get an error — they get a different screen, and the place they were looking at is gone. The library reflects it: **`0 been · 7 not been yet`** on the profile, for a library that is five days old. |
| **Evidence** | **Measured and photographed, in a signed-in session at 390×844.** The visible `Been here, HaKosem` button occupies `y 790–834`, `x 20–370`. The nav container is `nav.pointer-events-none fixed inset-x-0 bottom-0 z-50` at `y 776–844`; the `Map` link is `x 19–161`, `Profile` `x 165–307`, the `Create` FAB `x 322–378`. Hit-testing five points across the button's width, **5 / 5 return an element the button does not contain**. I then tapped its visual centre `(195, 812)` with a real touch event: the URL went from `http://localhost:4311/map` to **`http://localhost:4311/profile`**. Screenshots `scratchpad/shots/m-place-hakosem.png` (the button's outline is visible behind the nav pill) and `m-been-mistap.png`. Breadth: 5/5 blocked at 390×844 and 430×932; 3/5 at 768, 1000 and 1023. |
| **The cause, and it is one line of geometry** | `src/components/shell/sheet-geometry.ts:96-100`. `STOP_TO_CONTENT_HEIGHT` subtracts `HANDLE_PX` (14) and `VIEW_SWITCH_PX` (56) — and **never subtracts the 68 px the `BottomNav` floats over**, at any stop. The file's own docblock at `:33-42` *names* that bar (*"a 68 px `BottomNav` floating over its lower half"*) while reasoning about `peek`, and then does not carry the number into `half` or `full`. The second half is worse: the place-detail column (`place-sheet.tsx:1811`, `min-h-0 flex-1 overflow-y-auto`) is **not** inside anything sized by `STOP_TO_CONTENT_HEIGHT` — measured, it resolves to `clientHeight 772` inside a `Drawer.Content` that is `h-full` and translated down, so `scrollHeight === clientHeight` and **nothing scrolls**. Of a 772 px card, 392 px is on screen. `Add to a collection` sits at `y 854`, `Open on TikTok` at `1071`, `Remove from your places` at `1184` — all below an 844 px viewport, reachable only by dragging the sheet to `full`. |
| **The rule underneath it** | This is the *sibling* shape, not the *systemic* one — `sheet-geometry.ts` gets the list column right and the docblock at `:76-86` describes this exact failure (*"laid out, painted, hit-testable and reported `visible` by a testing library — and completely unreachable"*) as something already fixed. It was fixed for one column and not the other. **The generalisation: a floating overlay is part of the layout budget of every surface it floats over, not of the surface that declares it.** Anything `fixed` and opaque needs its height in the geometry module beside the handle and the switch, once, so the next sheet inherits it. |
| **Effort** | **An afternoon.** Add a `BOTTOM_NAV_PX = 68` to `sheet-geometry.ts`, subtract it at `half` and `full`, and put the place-detail column inside the same sized box the list column already uses. No migration, no new endpoint, no copy. |
| **What would change my mind** | Evidence that real users reach *Been here* by dragging the sheet to `full` first — which would make this a one-stop framing issue rather than a broken control. I cannot get that evidence from a seeded library, but `select count(*) from saved_places where visit_state <> 'want_to_go'` against the owner's own library would settle it in one query. If it is non-zero and rising, this drops to third. |

### 2. Your library is filed under words a model chose and you cannot change one of them

| | |
|---|---|
| **What** | A person can add, edit and remove the tags on their own saved place, so the words they file their map under are theirs. |
| **Why it matters** | Tags are the product's **only** organising axis beyond category and area: they filter the list *and* the pins. The demo library is 7 places carrying **12 distinct tags**, every one of them written by the extractor from a stranger's caption, and **none of them ever shown to the user before they were stored**. The review screen — the one place the product promises *nothing reaches the map without confirmation* (`brand-and-product-foundation.md` §7) — displays name, category, locality, provenance and a note field, and **no tags at all** (photographed, `scratchpad/shots/import-review-m.png`). So the user confirms the place and silently accepts the vocabulary. A wrong tag is then permanent, and the words a person actually files by — *date night*, *with Maya*, *takeaway*, *worth the queue* — cannot enter the product at all. For a product whose whole edge is that the map is yours and nobody else ranks it, having the filing system written by the model is the one place that edge leaks. |
| **Evidence** | **Measured, in the database and in source.** Column grants on `public.saved_places`: `authenticated` holds `UPDATE` on exactly `display_name, category_override, note, visit_state, visited_at`. `tags` is `service_role` only — same shape as the `place_id` problem `0032` was written for. In `src/`, `grep` for `updateSavedPlaceTags|editTags|addTag|removeTag` returns **zero matches**; `src/app/actions/saved-places.ts` exports five actions and none touches tags. Tags are written server-side at confirm from the extraction (`src/integrations/supabase/place-store.ts:117`, `p_tags`). Visible consequence, photographed at 1440×900: the desktop panel renders 12 tag chips over five rows, **ten of which have a count of 1** — ten filters that each isolate one place — and on mobile the chip strip is `scrollWidth 1228` in a `clientWidth 358` window, so **870 px, 71 % of the filter vocabulary, is off-screen** on a 7-place library. |
| **Effort** | **A feature**, and it is the cheapest feature on this list because three of its four parts exist. The domain rules are written and tested (`src/domain/extraction/tags.ts` — lowercase, no punctuation, no accents, 2–28 chars, max five; `normalize_tag_list()` in the database is already a no-op on canonical input). The chip component, the counts and the filter are shipped. What is new is (a) a write path — a column grant or, following `0032`'s precedent, a `SECURITY INVOKER` function, which means the `security-privacy` review path the team has now walked once and will walk faster the second time; (b) an edit affordance on the place sheet beside *Change* and *Edit*, which already exist as siblings; (c) showing the extracted tags on the review card so they are confirmed rather than assumed. (c) is an afternoon on its own and is worth shipping first. |
| **What would change my mind** | A ruling that tags are *place facts* rather than *user annotation* — which is a defensible position and is roughly what `src/app/api/imports/confirm/route.ts:48` asserts (*"place facts by …"*). If the owner takes it, the finding does not disappear, it changes shape: the tags must then be **shown and confirmable at review**, because a place fact the user never saw is still an unconfirmed claim on their map. |

### 3. Below 1024 px the map is a keyboard trap, and the root cause was found and half-fixed six commits ago

| | |
|---|---|
| **What** | A person navigating by keyboard can tab past the places sheet instead of being held on it for the rest of the session. |
| **Why it matters** | This is WCAG 2.1.2 *No Keyboard Trap*, on the product's primary screen, and it is not a phones-only concern: **a browser window narrower than 1024 px on a laptop is the common case for a side-by-side window**, and that is exactly where a physical keyboard is in use. Once focus reaches the collapsed sheet handle — which is the **13th** Tab from page load, so it is reached in ordinary use — the map, the zoom controls, the nav, the profile link and the FAB become unreachable without a mouse for the rest of the page's life. |
| **Evidence** | **Measured, in a signed-in session, with a control.** From a clean load at 390×844, tabbing forward reaches `BUTTON "Show your places"` at press 13; presses 14–45 all report the same element. Focusing the handle directly and then pressing Tab 12 times and Shift+Tab 4 times: **16 / 16 presses left `document.activeElement` unchanged.** The instrument is not broken — the *same probe on the same page* at 1440×900 advances normally through `SPAN → profile link → CANVAS → attribution → CARTO → OpenStreetMap → Find my location → Zoom in → Zoom out → Places → Collections → Add a TikTok link`. Width sweep, 6 Tab presses each: **390, 430, 768, 1000 and 1023 all report 6/6 stuck; 1024 is clean.** |
| **The cause, and it is already written down in this repo** | `document.querySelectorAll('[data-radix-focus-guard]').length` → **2**. `src/components/shell/map-shell.tsx:462` passes `modal={false}`, and `src/components/sheet/use-non-modal-background.ts`'s header states the root cause exactly: *"`vaul@1.1.2` does not forward that prop … so Radix always runs the **modal** dialog"*. That hook neutralises **one** consequence of the dropped prop — `hideOthers()` marking `<main>` `aria-hidden` — with a `MutationObserver`. The **other** consequence, `FocusScope` trapping and looping, was not enumerated. At the `peek` stop the drawer has exactly one tabbable descendant (everything else in it has a zero-size box), so Radix's loop is a **one-element cycle with no exit**. |
| **The rule underneath it** | **When a dependency silently drops a prop, enumerate every behaviour that prop gates — not the one you noticed.** `modal` in Radix gates at least three things: background `aria-hidden`, focus trapping, and outside-pointer dismissal. One was found by symptom and fixed; the other two were never listed. The contrast is right there in the same product: the *Create* sheet is a genuine modal, and its focus loop has three members **including `Close`**, which is what makes a loop legitimate. |
| **Effort** | **An afternoon to a day.** The cheap, correct-shaped fix is to stop mounting `Drawer.Content` at `peek` at all, or to extend `use-non-modal-background.ts` to also neutralise the two guards. The clean fix is upstream and the hook's own header already says so — patching or upgrading `vaul` so `modal` reaches Radix would close all three consequences at once and delete the hook. That is a judgement for whoever owns the dependency, not for me. |
| **What would change my mind** | A decision that keyboard operation below `lg` is out of scope for the submission. That is a legitimate owner call, but it should be written down rather than left implicit, because the `e2e` accessibility spec (`tests/e2e/map-accessibility.spec.ts`) implies the opposite. |

### 4. On a laptop, the screen where you decide what enters your map shows less of the decision than a phone does

| | |
|---|---|
| **What** | The review screen uses the screen it is on, so a person importing from a laptop can see all three candidates and the shortlist at once. |
| **Why it matters** | The review screen is where the product's one irreversible act happens. Getting it wrong puts the wrong venue on the map permanently — and re-pointing, the repair, still has no UI (§1.2). It is also where the shortlist lives: *"Which one is it?"* with three near-identical `Cafe Cafe` rows is a comparison task, and a comparison you have to scroll through is a comparison you get wrong. |
| **Evidence** | **Measured at 1440×900 and 390×844, same fixture (`/import?state=review`, 3 candidates).** The desktop card is **480 px wide at `x 480–960`**, leaving **480 px of empty page on each side** — 67 % of the viewport width unused. Inside it, the candidate scroller (`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto…`) has `scrollHeight 781`, and its `clientHeight` is **371 on desktop against 409 on mobile**. The laptop shows **47 %** of the decision; the phone shows **52 %**. Photographed: on desktop the sticky `Save this place →` bar cuts the row *"Dizengoff 172, Tel Aviv-Yafo"* through the middle of its glyphs, with no fade, no shadow and no scrollbar — it reads as a rendering fault rather than as a scroll (`scratchpad/shots/import-review-d.png`). |
| **Known-adjacent, and I checked** | `ui-review-2026-08-31.md` finding 11 calls this screen *"the least responsive surface in the product"* — but it means **responsive to the pointer** (6/22 controls change on hover). That is a different axis and a different fix. Its line 291 (*"everything below the fold is reachable"*) is still true; I re-measured it and the scroller works. This finding is about what the layout does with the space it is given. |
| **Effort** | **A few days.** Not a width change — a 960 px column of the current layout would be worse. The desktop shape wants the source (video, caption) held beside the candidate list rather than stacked above it, which is a real layout, plus the sticky-bar seam. It is a `design-system-frontend` + `ux-interaction` pair, and `ux-interaction` should rule on the seam before anyone builds. |
| **What would change my mind** | Evidence that imports overwhelmingly happen on a phone — which is the product's own premise, since the link comes out of the TikTok app. If the owner's real usage is 95 % mobile, this drops out of the five and becomes a craft item. **That is a cheap thing to know and nobody has said it**, which is the reason it is fourth rather than second. |

### 5. Every database-side check in this repo is unrunnable on this machine, and the migration ledger now contains three rows nothing produced by running anything

| | |
|---|---|
| **What** | The database checks the repo already owns can actually be run, and the migration ledger records what ran rather than asserting that something did. |
| **Why it matters** | The RLS policy tests are the **only** artefact that proves the column grants and policies are right, and the grants are what stands between one user's places and another's. Since 2026-08-29 CI cannot start a runner (`current-state.md` item 0), so the policy tests are proved by nothing at all — and now they cannot be run by hand either. Meanwhile the ledger, which is what everyone (including the orchestrator, an hour ago) reads to decide what is applied, has three rows that were written rather than earned. |
| **Evidence** | **Measured, and reproduced.** `which psql` → not found; no libpq under `/opt/homebrew/opt` or `/usr/local/opt`; `node_modules/.bin` has `supabase` and no `psql`. `npm run db:test:0032` → `sh: psql: command not found`. That is `db:test:0008`, `:0024`, `:0031`, `:0032`, `:0034`, plus `db:inventory` and `db:verify` — every database-side check in `package.json` — dead on this machine. And the ledger: of 33 rows in `supabase_migrations.schema_migrations`, **`0001`–`0031` all carry a `name` and a `statements` array; `0032`, `0033` and `0034` carry `NULL` for both, and they are the only three that do.** The Supabase CLI writes both atomically. Those three rows were hand-inserted after the SQL was applied some other way — almost certainly `docker exec … psql`, because that is the only route left when `psql` is absent. |
| **Why the two halves are one finding** | The missing binary is the **cause** and the forged rows are the **symptom**. Somebody needed to apply three migrations, had no `psql`, went around the tooling, and then patched the ledger by hand so it would look applied. Fix the binary and the incentive disappears. This is also the direct answer to *"what else was measured that way?"* — `schema_migrations.version` is being read as evidence that a file ran, exactly as `max-age` was read as a signature deadline. For `0032`–`0034` it happens to be true; I checked the live function bodies against the files and they match. **Nothing checked that but me, and next time it will not hold.** |
| **Effort** | **An afternoon.** Route the five `db:test:*` scripts and `db:inventory` through `docker exec -i supabase_db_P-002 psql` when no `psql` is on `PATH` (or add libpq to the setup doc and have `check:claude`-style preflight fail loudly instead of `sh: command not found`). Then re-run `npm run db:test` and either confirm the three migrations or find out they do not pass. The three ledger rows are the orchestrator's call: re-recording them properly is a `supabase migration repair`-shaped decision, and it is not mine to make. |
| **What would change my mind** | `psql` being present on the machine that matters — CI's runner — and CI starting again. Then the local gap is developer friction rather than a missing guarantee, and this drops out. It cannot be checked today, which is precisely why it is in the five. |

## 3. The craft pass — the surfaces round 2 could not reach

Unranked. Every item has a file, a number or a marked screenshot. **`C1`–`C10` from round 2 are
excluded by instruction (in flight).** These are numbered `D1`–`D12` so the two sets do not collide.

### D1. The place-detail card is 772 px tall inside a 392 px window and does not scroll · **measured** · 390×844
Ancestor chain from `Remove from your places`: `BUTTON h=20 top=1184` → … → `DIV.flex min-h-0 flex-1
flex-col gap-5 overflow-y-auto px-5 … h=772 scrollH=772 clientH=772` → `DIV.fixed inset-x-0 bottom-0
z-40 flex h-full max-h-[100dvh] h=844 top=380`. `scrollHeight === clientHeight`, so the
`overflow-y-auto` at `place-sheet.tsx:1811` is inert; the column sizes itself from `Drawer.Content`'s
`h-full` rather than from `STOP_TO_CONTENT_HEIGHT`. Only a drag to `full` reveals the lower 380 px.
This is the same defect as finding 1 and the same fix.

### D2. The map's zoom and locate controls are painted over whenever a place is open · **measured** · 390×844
`Find my location` `y 535–579`, `Zoom in` `587–627`, `Zoom out` `627–667`; the sheet's top at the
place-detail stop is `y 380`. Hit-test: 5/5 blocked by the sheet. They are only usable at `peek`.
Their position is a constant and is not a function of the sheet stop, unlike the camera, which is
(`restingSheetFractionFor`). One number, two readers — the same pattern `sheet-geometry.ts` already
uses for the camera.

### D3. The desktop popover's height cap is a constant dressed as a viewport rule · **measured** · 1440×900
`place-sheet.tsx:1812` — `isPopover && 'max-h-[min(70vh,26rem)]'`. `26rem` is 416 px; `70vh` at 900 is
630 px, so **`70vh` never binds above a 594 px viewport** and the popover is capped at 416 px of ~700 px
of content on a screen with 630 px available — 214 px of usable height declined. Photographed: the clip
lands mid-section, so the card's last visible line is *"Restaurant · worked out from the video"* flush
against the bottom edge with no fade and no scroll affordance (`scratchpad/shots/d-place-light.png`).

### D4. The review screen's candidate scroller has no scroll affordance at either end · **photographed** · 390 and 1440
`scrollHeight 781` in a `clientHeight 409` (mobile) / `371` (desktop) window, with no mask, gradient or
shadow at either edge. At rest the second candidate is cut mid-row by the opaque `Save this place →`
bar; scrolled, the first is cut mid-row at the top. Both read as clipping rather than as scrolling.
`scratchpad/shots/import-review-{m,d}.png` and `import-review-m-scrolled.png`.

### D5. *Select all* selects two of three and says nothing about the third · **measured** · 390×844
`/import?state=review`: `"1 of 3 selected"` → tap `Select all` → `"2 of 3 selected"`, and the control
relabels itself `Deselect all`. The excluded candidate is the `Needs your pick` one — the only card on
the screen that requires the user's attention — and the sole signal that it was skipped is a counter
two rows above it. The CTA itself is **correct** and pluralises properly (`Save this place →` →
`Save 2 places →`), which makes the mismatch sharper: the button counts honestly and the control that
set the count does not.

### D6. 73 % of the desktop panel's height is spent before the first place appears · **measured** · 1440×900
Panel width 374 px, viewport height 900. First list row top = **656 px**. Above it: title, `Add a
TikTok link`, search, three category chips, two sort chips and **twelve tag chips over five rows**.
For a 7-place library that is 7 rows of controls above 7 rows of content. This is **not** the standing
"desktop panel emptiness at a short list" ruling — that is about the space *below* the last row and it
is correct. This is about filter chrome crowding the content out of the fold, and it grows with the
tag vocabulary, not with the library.

### D7. 71 % of the tag filter is off-screen on a phone with no edge affordance · **measured** · 390×844
The chip strip (`-m-1 flex gap-2 overflow-x-auto overscroll-x-contain p-1`) has `scrollWidth 1228`
against `clientWidth 358` — **870 px hidden**, on a 7-place library. It does scroll (verified:
`Quiet` moves from `x 1167–1240` to `x 297–370` at `scrollLeft` max), so this is discoverability, not
reachability. A horizontal chip strip is a fair pattern; a strip whose last chip is three screens away
on a seven-item library is a signal that the vocabulary itself is the problem — see finding 2.

### D8. On the profile, the destructive action is under the nav until you scroll · **measured** · 390×844
At `scrollTop 0`, `Delete my data` is at `y 762–810` and hit-tests **5/5 blocked** by the nav pill and
the FAB. There is only 94 px of scroll on the whole page (`scrollHeight 938`, `clientHeight 844`), and
after scrolling it clears at `y 667–715`. So it is recoverable, unlike finding 1 — but it is the same
missing 68 px budget on a different surface, which is what makes it a *rule* rather than two bugs.

### D9. The list row's note is truncated to one line at a hard character boundary · **photographed** · 1440×900
`pistachio croissant, before 10 — R1NOT…`. The note is the only field the user authors and is the
thing that makes search work (see §4); one clamped line is a defensible choice, but the clamp lands
mid-token with no word boundary. Worth a `line-clamp` on the block rather than a width-based ellipsis.

### D10. Round 1's probe marker is still in the demo library and is on screen right now · **photographed**
`saved_places.6927785e-e370-492c-aaf7-f26815e5adaa`'s note reads
`pistachio croissant, before 10 — R1NOTE-VERIFY-2026-08-31`. It is rendered on the desktop list, on
the mobile list and in the place sheet. Six probe accounts from the same round are also still in
`auth.users`: `e4db77c4-…`, `a4656c65-…`, `8c467351-…`, `d5299742-…`, `99af3ccf-…`, `c67f260c-…`
(all `r1auth-*@example.com`). A review that leaves rows behind has failed regardless of what it found;
these are named so they can be removed by whoever owns destructive database operations.

### D11. Two untracked artefacts and ten empty directories sit in the repository root · **measured**
`reduced-motion-probe.mjs` is untracked at the repo root (`git ls-files --error-unmatch` fails).
Alongside it, ten empty directories: `and`, `copy`, `env`, `file`, `folder,`, `project`, `the`,
`then`, `this`, `use` — the signature of an unquoted `mkdir` over a sentence. Git tracks no empty
directory, so `git status` is clean and nothing will ever flag them. Harmless, and exactly the kind of
thing that stops being harmless when someone greps the root.

### D12. The whole saved list and every filter chip is rendered twice at every breakpoint · **measured**
`button[aria-label^="Open HaKosem"]` resolves to **two** elements at 390 and at 1440; one has a
zero-size box. The same holds for every list row, every tag chip, `Add a TikTok link` and the
`Places`/`Collections` tabs. The hidden copy is CSS-hidden rather than unmounted, so it is inert to a
pointer and to `Tab` (verified — the 45-press tab sweep never lands on one). It is not a bug today.
It is a trap for the next person writing a test or an accessibility query, because
`getByRole('button', { name: /HaKosem/ })` matches two nodes and the *first* is the invisible one —
which is what made three of my own probes fail before I noticed.

## 4. What I checked and found healthy

**Search is the best thing in this product and it is not close.** Signed in, at 1440×900:
`croissant` → **HaKosem**, found through the *note*, with the heading `1 match in Tel Aviv-Yafo`.
`בית קפה` → **Neve Tzedek Coffee House, Nordoy Café**, found through Hebrew tags, heading
`2 matches`. `nordoy` → `Nordoy Café`. `zzzz` → `Nothing matches "zzzz"`. Singular and plural are
both right, the empty state names the query back, and the Hebrew query works with no
transliteration. This is round 1's finding 4 paying off end to end: the note is searchable, and a
sentence someone typed at the review screen is now the thing that finds the place. **Do not
regress the note→search path.**

**The theme control is correct and complete.** Light → `background: rgb(19,19,18)` under Dark,
survives a full reload, and `System` returns to `rgb(250,249,246)`. No flash on reload. Dark
screenshots at both breakpoints hold their contrast — the panel, the chips, the mint CTA and the
CARTO dark tiles read as one palette rather than an inverted light one.

**The camera compensates for the desktop panel, correctly and invisibly.** The MapLibre canvas is
the **full 1440 px** (`left: 0`) with the 374 px panel laid over it, so a naive fit would centre the
library at `x 720` — half of it behind the panel. Measured pin centre is `x ≈ 905` against a visible-
area centre of `907`. Somebody thought about this and it works. The residual sea on the left is
geography, not a framing bug: the library's bbox is ~3.85 km N–S by ~2.53 km E–W (aspect 0.66) inside
a landscape canvas, and the westmost pin (Container, `34.7498`) is on the shoreline. I went looking
for a defect here and did not find one.

**The `Create` sheet is a textbook non-trap modal.** Focus loops across exactly three controls —
`Add a place`, `Create a collection`, `Close` — and the loop contains its own exit. It covers the
nav deliberately. It is the direct counter-example to finding 3, in the same codebase, which is how
I know the trap is an oversight rather than a house style.

**`safeReturnPath` survived a deliberate attempt to break it** — five hostile shapes, two
allow-listed ones, all correct (§1.3). And the quota screen offers no retry it cannot honour (§1.4).

## 5. Outside the five — a challenge, and it is not smuggled in as an improvement

None. I found nothing this round that requires overturning a standing ruling. The desktop panel's
emptiness at a short list is still correct and I did not re-file it; D6 is about the *controls above*
the first row, which is a different quantity. Single-player is not in question anywhere above.

## 6. What this round did not check, and why

- **A live import.** It costs provider budget, writes rows to a database three other agents are
  using, and round 2 already exercised it. The `?state=` seam gave me every screen of the flow
  without a write.
- **The collection detail view and the share panel.** `collections` holds one row and it is not the
  demo user's, so reaching that view means creating a collection. I chose not to write a product row
  to a shared database mid-run. Round 2 covered the invite side (C3–C10).
- **`npm run db:test`.** It cannot run here (finding 5). I did not work around it with `docker exec`,
  because the policy tests create and drop objects and `agent-guardrails.md` §6 and §8 are not mine
  to route around — that is the orchestrator's call, and it is the first thing to do after the fix.
- **Production.** Every measurement above is local, at `7b57390`, against the running dev server.

## 7. What I touched

- **Wrote:** this file only.
- **Product rows created or modified: none.** `saved_places` = 8, `places` = 8, `collections` = 1
  before and after.
- **Sessions:** I signed in as `demo@example.com` (`baf6dbc7-0642-4147-bced-09f5d3724c68`)
  approximately twelve times, which leaves rows in `auth.sessions` and `auth.refresh_tokens` for
  that user. I did not record the count before I started, so I cannot attribute a delta — the
  user id is the identifier. No other account was created or signed into.
- **Processes:** one `next dev -p 3210` attempt, which **refused to start** and exited; the server
  on `:4311` was already running and is still running. Every Playwright browser was closed.
- Harnesses under
  `/private/tmp/claude-501/-Users-MrJossef-SourceTree-LiorJossef-P-002/fe536eb0-.../scratchpad/`.
