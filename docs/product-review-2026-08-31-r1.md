# Product review — round 1, 2026-08-31

> **Lane:** `product-reviewer`, task `review-r1`. **Base commit: `f010b756`** on
> `no-crumbs-implementation`. The tree was moving throughout (three modified `src/` files and six
> untracked docs belonging to other lanes), so every claim below is pinned to a file and line at
> that commit and none of them depends on the tree.
>
> **Method, stated so its weakness is visible.** The owner's instruction this round was to review the
> code, the specs and the shipped surfaces as source rather than to drive a browser. So **nothing in
> this document is photographed.** Where a finding rests on a number, the number is either a literal
> in the source, a grant in a migration, or a count I ran here — each one labelled. Where a finding
> rests on behaviour I could not observe, it says **inferred** and is ranked with that discount
> applied. `working-agreement.md` §2's bar — *implemented is not done, and neither is reviewed* — is
> not met by this round for the two findings that would need a real device and a real production
> sign-up, and each says so in its own row.
>
> **The instrument was made to fail on purpose.** My main instrument is `grep` over `src/`. Finding 3
> is an absence claim, which is the shape that lies most often (`ui-review-2026-08-31.md` §5's
> catalogue: a guard asserting the absence of a string that was deleted long ago). Control run: the
> same alternation `resetPasswordForEmail|signInWithPassword|exchangeCodeForSession|updateUser(`
> matched **one** line in `src/` (`sign-in/page.tsx:109`) and matched `resetPasswordForEmail` in
> `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`, where it exists. The pattern fires. The
> absence is real, not a broken regex.

---

## What is deliberately not in the five

**`place_mentions`.** `product-edge-2026-08-31.md` §2 rules it the only remaining candidate that
could make this product's edge sentence true at all, and I agree with that ranking — on value it
would sit first or second below. It is excluded because it is already specced
(`ux-unplaced-mentions-2026-08-31.md`), migrated (`0031`, with policy tests at
`supabase/tests/0031_place_mentions_policy_tests.sql`) and known to the orchestrator. Spending a slot
restating it would cost the owner one of five and return nothing. **Read this list as "the five best
things after E1", not as a list that outranks it.**

Also excluded as known and already queued, per the dispatch: the import screens' dead space above a
pinned action; the three components carrying their own `<h2>`; the desktop list guillotining its last
row; `ux-architecture.md`'s stale strings; and the missing desktop entry point for manual add and new
collection (`ui-review-2026-08-31.md` §7.4). None of them displaces anything below.

---

## The five, ranked by value

### 1. Getting a link out of TikTok and into this product is the hardest part of using it

| | |
|---|---|
| **What** | A person who has just watched a TikTok can put it on their map from inside the share sheet, instead of copying a link, leaving the app, finding this one, and pasting. |
| **Why it matters** | This is the entire input to the product. Every place on every map arrives through it, and today it costs roughly **eight actions across two applications**: Share → Copy link → leave TikTok → open No Crumbs → tap `＋` → tap `Paste from clipboard` → tap `Add this TikTok link` → confirm. The product knows this: `COPY_LINK_INSTRUCTION` (`src/ui/import/import-error-copy.ts:40`) is *"Copy the link in TikTok — Share → Copy link."*, and `brand-and-product-foundation.md` §7 calls it **"the only instruction in the product."** An instruction exists because the app cannot receive a share. A person who saves eight places a week pays that tax eight times; the ones who stop paying it are the churn nobody will be able to attribute to anything. |
| **Evidence** | **Measured (static).** `src/app/manifest.ts` has no `share_target` key — the whole manifest is in that file and there are 8 keys, none of them it. `src/app/import/page.tsx:27` renders `<ImportPageClient />` **with no props**, and `initialUrl` (`import-page-client.tsx:125`) is a prop only — so `/import?url=…` is ignored and **the product's central action has no addressable entry point at all**. No `beforeinstallprompt` handling anywhere in `src/`, so nothing invites the install a share target requires. |
| **Effort** | **A feature.** Three parts, and only one is hard. (a) `/import` reads a `url` search param — an afternoon, because the SSRF boundary already exists and is good: `extractPastedUrl` picks the substring and `canonicaliseTikTokUrl`'s closed five-host equality allow-list (`src/domain/source/canonicalise-tiktok-url.ts:42-46`) rejects everything else, exactly as its own header insists. (b) `share_target` in the manifest — under ten lines. (c) An install affordance, which is the real work: a share target only exists once the PWA is installed. |
| **Honest ceiling — read this before scheduling it** | Web Share Target is **Chromium-on-Android and Chrome OS only**. Safari does not implement it on any platform, so an installed iOS user gets nothing from (b). **This is why (a) is worth doing on its own and first:** a plain `?url=` seam is universal, and on iOS a user can reach it through a one-time Shortcut in the system share sheet, which is the only route a web app has into that sheet. If the owner's own phone is an iPhone, do (a), skip (b) until there is an Android user, and say so rather than shipping (b) and calling the loop fixed. |
| **What would change my mind** | Evidence that the intended user does not save from inside the TikTok app — that they browse on a laptop, or batch their saves from a notes file. That would move the cost from every save to once a week and drop this to fourth or fifth. |

**The generalisable point, and it is why (a) matters more than its size:** the product's one verb has
no URL. Everything else in this app is addressable — `/map?place=<id>` reveals a place
(`map-page-client.tsx:1250`), `/collections/join/<token>` opens an invite — and the action the whole
product exists for can only be reached by a human typing into a field. An addressable import is not
one feature; it is the precondition for a share target, a Shortcut, a bookmarklet, and every future
integration nobody has thought of yet.

One thing this finding does *not* need fixing first: the standalone `/import` route is already safe
to land a share on. `no-places-screen.tsx:92-99` records that the add-by-name recovery was moved onto
the screen itself precisely so it stops depending on a host prop. That was the right instinct and it
pays off here.

---

### 2. On two thirds of the library the pin is admitted to be wrong, and there is no way to fix it

| | |
|---|---|
| **What** | A person who opens a place and sees *"Approximate location"* can search for the real venue and correct the pin, keeping their note, tags, been-mark and source link. |
| **Why it matters** | The product's entire output is a pin on a map. On most rows it currently ships a pin it tells you is a street or two off, and then offers no repair — so the honest label, which is the right call, becomes a permanent shrug. The user's only recourse is delete-and-re-add, which destroys the note, the been-mark and the link back to the TikTok that made them save it: the four things the MVP boundary says the product stores. Getting the *place* right is not polish here; it is the deliverable. |
| **Evidence** | **Measured, in shipped source.** `src/ui/place/location-certainty.ts:8-11`: *"Measured drift on those is 65–470 m, median 327 m — a street or two, sometimes the wrong building. **Twenty-one of the thirty-one places in the current library are that.**"* — 68%, with a further five rows (`:38-40`) carrying no provenance at all. What the user can edit is exactly five things and location is not one of them: `deleteSavedPlace`, `updateSavedPlaceNote`, `updateSavedPlaceName`, `updateSavedPlaceCategory`, `setSavedPlaceVisited` (`src/app/actions/saved-places.ts:79,109,150,209,265`). The grant confirms it is structural, not an omission: `supabase/migrations/0006_saved_places.sql:117` — `grant update (display_name, category_override, note, visit_state, visited_at)`. **`place_id` is not in that list**, so no role reachable from this application can re-point a saved place at a different `places` row. |
| **Caveat on the number** | 21/31 was measured against the dev library at the time that file was written, not against production. It is the best figure that exists and it is cited in shipped code, but it is one library and it is not dated. |
| **Effort** | **A few days**, and the size is entirely the migration. The search half already exists twice over — `POST /api/imports/place-search` is the add-by-name recovery, and `src/app/actions/manual-add.ts` already runs exactly this "type a name, pick a resolved place, write the row" transaction. Re-pointing an existing row needs either a new column grant or a reviewed `SECURITY DEFINER` function, which under `agent-guardrails.md` §5 rule 20 and §9 V1 means `security-privacy` reviews an immutable artefact and no other migration runs beside it. That sequencing, not the UI, is the cost. |
| **Why this is not `current-state.md` item 9** | Item 9 is a **backfill** — an automated `llm_guess` → Google upgrader — and it is parked behind open question 5 (*"Backfill the phantom duplicate rows?"*) with the standing rule *no backfill without reviewing the rows*. This is the opposite shape: one row at a time, the user confirming, no batch write, nothing changing behind anyone's back. It is the version of item 9 that does not need the owner to rule on a mass mutation, and it satisfies `brand-and-product-foundation.md` §7's *nothing reaches the map without confirmation* rather than working around it. |
| **What would change my mind** | A re-measurement showing the `llm_guess` share has collapsed since Google Places became canonical (15/16 top-1). If new saves resolve properly and 21/31 is a fossil of the pre-Google library, this becomes a one-off data question and drops out entirely. **That re-measurement is cheap and should happen before this is scheduled** — one `select source_dataset, count(*) from places group by 1` against the local database. I could not run it: there is no `psql` on this machine. |

---

### 3. There is one door into an account and no key — and the same missing route may be breaking production sign-up

| | |
|---|---|
| **What** | A person who forgets their password gets back into their map, and a person who signs up on production actually lands signed in. |
| **Why it matters** | A forgotten password today is **permanent, total loss of the map** — the one artefact this product asks people to build over months. There is no reset, no OAuth to fall back to, and `security.md` §2 notes the minimum password is six characters with no composition rule, which is exactly the password people forget. The second half is worse if it is true: it would mean nobody except the seeded demo account can create an account on the live product at all, which gates the submission demo and every real user. |
| **Evidence** | **Measured** for the reset half: `resetPasswordForEmail` appears **nowhere** in `src/` (control run in this document's header proves the pattern fires), there is no route under `src/app` matching `auth`/`callback`/`confirm`, and `src/app/actions/account.ts` offers deletion but no credential change. The only two auth calls in the codebase are `signUp` and `signInWithPassword` at `src/app/sign-in/page.tsx:108-109`, which `security.md` §2 states outright: *"Nothing else in the codebase authenticates."* |
| | **Inferred**, and labelled as such, for the sign-up half: `security.md` A§2.5 states email confirmation is *"off in development and **on** in production."* `@supabase/ssr`'s `createBrowserClient` defaults to the PKCE flow, whose confirmation link returns the user to `site_url` carrying a `?code=` that something must exchange. **`exchangeCodeForSession` appears nowhere in `src/`**, and `/` (`src/app/page.tsx`) is a server component that instantiates no browser client, so a code arriving there has nothing to hand it to. I have not observed this, and I must not: `agent-guardrails.md` §2 rule 5 forbids touching production, and the hosted auth settings are not readable from here. |
| **Effort** | **About a day** for the reset (a request screen, `resetPasswordForEmail`, a callback route calling `exchangeCodeForSession`, a set-password screen using `updateUser`). The confirmation half is the *same callback route*, which is what makes these one finding rather than two. |
| **Do this first, before scheduling anything else on this list** | Verifying the inferred half is a ten-minute owner action: sign up on `https://p-002-zeta.vercel.app` with a fresh address and click the email link. If it lands signed in, half of this finding dies and it drops to fourth. If it does not, this is item zero and it outranks everything above it. **I am ranking it third rather than first precisely because half of it is inferred** — but the check is cheap enough that leaving it inferred is the expensive choice. |
| **What would change my mind** | That sign-up works on production (drops it to fourth), plus a decision that pre-launch a lockout is acceptable because the only accounts are the owner's and the examiner's. That second one is a legitimate owner call, and if it is taken it should be written down, because it stops being true the day someone else signs up. |

---

### 4. The review screen is the one moment the user knows why they are saving, and it has nowhere to write it down

| | |
|---|---|
| **What** | A person confirming a place can type the reason they are saving it, on the screen where they still have the video and the caption in front of them. |
| **Why it matters** | The note is the only field in this product the user authors — `src/domain/import/confirm.ts:18` says so in those words — and it is the single highest-value thing they can add, because `domain/places/search.ts` makes it **searchable**. The creator said "get the pistachio croissant, go before 10." Five seconds of typing turns that into a place you can find three weeks later by searching `croissant`. Today the field appears only in the place sheet, days later, when the reason is gone and re-watching the TikTok is the only way to recover it. **The library fills with places whose "why" was thrown away at the exact moment it was free.** |
| **Evidence** | **Measured.** The server contract already carries it: `ConfirmImportRequestSchema` takes `items: [{ candidateIndex, note }]` and `confirm.ts:59` documents `note` as *"The user's own note. The only field in this request the user authors."* The client hardcodes it away — `src/app/import/_lib/save-extracted-candidates.ts:114`: `note: null,`. `review-screen.tsx` contains no `textarea`, no `Textarea` and no note-shaped control; the only occurrence of the word is line 88's comment describing the contract field it does not fill. So the plumbing is built end to end and the last two inches are missing. |
| **Effort** | **An afternoon.** One collapsed field per candidate card, carried into `CandidatePick`, and `note: null` becomes the string. No migration, no new endpoint, no new grant. |
| **The design constraint, so it is not discovered late** | `ui-review-2026-08-31.md` finding 11 already calls `/import?state=review` the least responsive surface in the product. A field per candidate must not be an always-open textarea on a screen that may hold several — it should be an "add a note" affordance that expands, so the default height is unchanged. That is an `ux-interaction` call, not mine. |
| **What would change my mind** | Evidence from real use that people do not write notes at all — if the place-sheet note field has near-zero usage against the owner's own library, then moving it earlier just puts an ignored control on the most-loaded screen in the product. Countable directly: `select count(*) from saved_places where note is not null`. |

---

### 5. The invite hands a stranger a screen written for someone who already has an account

| | |
|---|---|
| **What** | A person following a collection invite for the first time lands on the create-an-account side of the door, not the sign-in side. |
| **Why it matters** | An invite is this product's **only** acquisition path — Charter §1 refuses discovery, there is no public profile and no feed, so a shared collection link is the sole way a second person ever arrives. That person is by definition new. What they are shown is headlined **"Your places are waiting."** with the subhead *"Sign in to pick up your saved map right where you left it."* Both sentences are false for them, and they arrived from a button reading *"Sign in to join →"*, which tells them they were supposed to have an account. The toggle out is there and is a real 44px target, but the product has just told a first-time visitor, twice, that they are in the wrong place — at the one moment it is trying to gain a user. |
| **Evidence** | **Measured (static).** `src/app/collections/join/[token]/page.tsx:55` → `href={/sign-in?next=/collections/join/${token}}`, carrying the destination and nothing else. `src/app/sign-in/page.tsx:90` → `useState<Mode>('sign-in')`, unconditional; the headline and subhead branch off `isSignUp` at `:143-147`. No search param, no cookie, nothing else feeds `mode`. **Not photographed** — this is a code reading, and the ranking reflects that. |
| **Effort** | **An afternoon**, and probably less. `/sign-in` reads a mode hint from its own URL; the join page passes it. Two files. |
| **The rule underneath it, which is worth more than the fix** | **The entry point knew something the destination does not, and threw it away at the handoff.** The join page has just established that this visitor is a stranger. It passes `next` — where to go afterwards — and drops *who arrived*. That is the general shape of every seam bug in a product: the handoff carries the destination and not the state. Anywhere one screen routes into a screen that serves two audiences, the router should pass what it knows. Fixing the one instance is an afternoon; writing that sentence down is what stops the next three. |
| **Adjacent, already known** | `ui-review-2026-08-31.md` finding 8 covers this same screen from a different angle — it never says what the product is, and its `h1` is set as an in-app screen rather than a full-screen message. **Fix them together.** They are the same surface, the same audience and the same fifteen seconds, and doing one without the other means a stranger who now knows what the product is still gets told their places are waiting. |
| **What would change my mind** | A decision that invites are only ever sent to people who already have accounts — which would be a real product position, not a dodge, and would make this a non-issue. It is not the current position: nothing in `ux-collections.md` or the invite copy assumes an existing account. |

---

## What I checked and found healthy

Named specifically, because the team needs to know what not to break.

**1. The search over saved places is better than the product gets credit for.**
`src/domain/places/search.ts` matches name, category, locality, the user's own note, tags **and
dishes**, and the reasoning at `:38-45` is the best product argument in the repo: `dishes` are
excluded by the original "anything the row shows you" rule, are included anyway, and the file says
why — *"`natural wine`, `hidden gem`, `late night` and `momos` are exactly the words someone reaches
for when they are trying to find a place again and cannot remember its name. That is this product's
whole job."* Then it draws the line at **labels versus prose** and excludes `reason` and `why_go`,
because a sentence matches on incidental words and widens results without making them findable. It
runs client-side so the list and the pins narrow in the same frame with no request and no map
flicker. That is a rule, correctly derived, correctly bounded, and it is what makes finding 4 worth
doing at all.

**2. The post-save seam is the one most products get wrong, and this one is right.**
`map-page-client.tsx:1509-1527`: the saved ids are handed up **before** the overlay unmounts, the
camera frames the new pins, every filter is cleared so a filter set earlier cannot hide the thing you
just saved, and the overlay is *held open* until the refreshed rows arrive so the reveal cannot land
on a place that is not there yet. The comment records the failure it fixes — *"eight London places
saved into a Tel Aviv library left the camera untouched and nothing on screen to say the save had
happened."* And `import-page-client.tsx:275-283` refuses to navigate on `partial_failure` on the
grounds that some of the save is real and the failed count would be lost the instant the screen
unmounts. That is a seam that has been thought about at the level of what the user loses.

**3. `locationCertainty` is the product's honesty rule executed, not asserted.**
`src/ui/place/location-certainty.ts` replaced `Matched via llm-guess · 87% confidence` with two
plain labels and **deleted the number**, on the grounds that `resolution_score` is a diagnostic and
not a probability, and that printing one two taps after the review screen bans confidence numbers
contradicts our own rule. It also returns `null` rather than inventing a third label for rows with no
provenance. This is the discipline `product-edge-2026-08-31.md` says is table stakes among our
closest competitors — but doing it *this* cleanly is not, and it is the only reason finding 2 is
visible at all. A product that hid the uncertainty would have no bug to report here, and would be
worse.

**4. The SSRF boundary, and the file that refuses to become part of it.**
`canonicalise-tiktok-url.ts` is a closed five-host allow-list using **equality**, with `:17-19`
spelling out that there is no code path that could treat "ends with tiktok.com" as sufficient.
`extract-pasted-url.ts:13-27` then states in its own header that it is **not** part of that boundary
and must never become one, that the first match wins rather than the "most TikTok-looking" one
because ranking hosts is the allow-list's job, and that a bare `tiktok.com/@a/video/1` is not
promoted to a URL because guessing a scheme turns a typo into a request. Two files, one boundary, and
the non-boundary one says so. This is what makes finding 1(a) an afternoon instead of a security
review.

**5. The no-places screen treats the modal outcome as a destination.**
`no-places-screen.tsx` puts the post and the caption on screen, expanded by default, so the claim
*"it doesn't name a place"* is checkable by the person it is made to — and `:24-30` refuses to
surface the individual drop reasons because `evidence_not_in_caption` was measured firing four times
and being wrong four times out of four. Then `:92-99` moves the primary recovery **onto the screen**
so it stops depending on a prop a host might forget to thread. A screen that carries its own recovery
by construction is a different quality of thing from one that carries it by convention.

---

## What this round did not check

- **Any pixel.** No browser was driven, by instruction. Findings 5 and 4's design constraint would be
  stronger photographed, and finding 3's inferred half can only be settled by a real production
  sign-up, which is the owner's to run.
- **Real rows.** There is no `psql` on this machine, so the two counts this document asks for
  (`source_dataset` distribution, notes-per-saved-place) are requests, not measurements.
- **Both themes and both breakpoints**, for the same reason.
- **Anything hosted.** No staging or production access, per `agent-guardrails.md` §2.

Nothing was written outside this file. No database row, temporary file or running process was left
behind; no `src/` file was read-modified and none was touched.
