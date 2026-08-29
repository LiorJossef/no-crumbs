# Plotline — feature inspiration, ruled

> Owner: `product-lead`. Task `PLOTLINE-FEATURES-1`, 2026-08-29. Status: **a Future list and four
> rulings.** Nothing in this document enters the current sprint — Charter §4 is the scope contract
> and this is the list it says new ideas go to.
>
> The interaction half of the Plotline review went to `ux-interaction` separately. This document
> rules on **features**: which of them we should want, at which level, and which are refused.
> I have not seen the screenshots; the descriptions I ruled against are the orchestrator's, and are
> treated as feature facts. **Nothing here is verified** — I have no shell and ran nothing.

---

## 0. The test I applied

Two questions per item, in order:

1. **What can our user not do today without this?** Not "is it good" — what is the missing job.
2. **Does the core loop get better, or merely bigger?** paste → analyse → resolve → review → save
   → explore. An item that adds a surface beside the loop is worth less than an item that makes one
   of those six steps land.

Ranked by value to the single user profile in `brand-and-product-foundation.md` §2 — one person,
two retrieval questions (*what did I save around here* / *what do I already have in this city*) —
not by how much of Plotline's screen it fills. Plotline is playing a partly different game: their
positioning is collect-and-tick-off-then-plan, ours is retrieval. Several of their best features are
excellent answers to a question we have deliberately declined to ask.

**One structural observation before the list.** Of the 23 items, **nine are already ours** — filed
in `docs/product-backlog-2026-08-29.md`, in `execution-plan.md` at L1/L2, or shipped. Plotline is
useful here mostly as *corroboration of priorities we already hold*, and only twice as a genuinely
new idea. That is the honest read, and it should lower rather than raise the temperature of this
whole exercise.

---

## 1. The Future list, ranked

Each row: what it is · level · what it depends on that we do not have · value/effort.
E-scale matches the backlog: XS ≈ minutes · S ≈ an hour or two · M ≈ half a day · L ≈ bigger.

### Take at L1

| # | Item | What it is, in one line | Depends on | V/E |
|---|---|---|---|---|
| 1 | **16 — the attributed caption quote** | Put the creator's handle on the verbatim caption quote we already store and already render | **The `extracted_reason` write-path fix** (§3, Ruling A). Handle is already stored *and* already reaches the UI | **V-high / E-S** |
| 2 | **15 — Open in Maps** | A directions escape hatch on every saved place | Nothing. `googleMapsSearchUrl` exists; backlog 6.9, and 2.9 is a live bug in it | **V-high / E-S** |
| 3 | **1 — clipboard-aware paste** | If a TikTok URL is already on the clipboard, the primary action is one tap | Nothing. Backlog 2.6 / `current-state` §9.4 | **V-high / E-M** |
| 4 | **11a — "Not visited" as a quick filter** | Filter the library to what you haven't been to | Already `L1-F12`, in flight | **V-high / E-S** |

Items 2–4 are **already ours**; Plotline's version is corroboration, not a new idea. Item 1 is the
one genuinely new thing on this list that is cheap, and it is ranked first for that reason —
see Ruling A.

Item 3 deserves its rank for a reason bigger than convenience: import friction is the top quality
attribute (Charter §2 corollary 1), we are a web app so we pay one app-switch that Plotline does
not, and `current-state` §5b.2 measured that the share sheet gives them **no content advantage** —
only that tap. The clipboard affordance is the cheapest recovery of the entire gap.

### Take at L2

| # | Item | What it is | Depends on | V/E |
|---|---|---|---|---|
| 5 | **10 — category filter chips over the map** | Narrow the map and list by category, at every zoom | Backlog 1.1 first (category parity: a gelateria must not change what it *is* by being saved) | **V-high / E-M** |
| 6 | **12a — every source on a place, not just the first** | The narrow half of "references" — see Ruling B | `earliestSource()` widens to a list; `saved_place_sources` is already many-to-many | **V-high / E-M** |
| 7 | **11c — list edit mode: select, add to…, delete** | Bulk actions over rows | Nothing new. Backlog 5.7, and it is the enabler for "copy 4 places as text" (backlog 10.2) | **V-med / E-M** |
| 8 | **21a — library stats (`11 places · 2 countries · 6 cities`)** | A plain count of what you have, derived from coordinates we hold | Nothing. Pairs with the world-zoom country summary already at L2 | **V-med / E-S** |
| 9 | **11b — Favourite** | One boolean overlay on a save | Field: `saved_places.is_favourite`. Backlog 7.1 | **V-med / E-S** |
| 10 | **4b — pan-the-map pin correction** | Their manual-add map picker, repurposed as *fix this pin* | Backlog 6.2. **Only as a correction, never as creation** — see §4 | **V-med / E-M** |
| 11 | **6b — view-only share link on a collection** | The one part of their collections we don't have | **`security-privacy` sign-off.** Backlog §10 S2b: the first unauthenticated read of personal location data | **V-med / E-L** |
| 12 | **12b — "everything from this post" as a filter** | The wide half of references, kept as a predicate rather than a surface | Backlog 5.12, one predicate over `source_id` | **V-low / E-S** |

Item 8 is small and I have ranked it above two bigger things on purpose: it is the only item on this
list that speaks to the **delayed-value problem**. A library that can say `11 places · 2 countries`
is a library that visibly accumulated; at three places it is also the honest way to say *keep going*
without a progress ring (§2, item 23).

### L3 or later

| # | Item | Ruling |
|---|---|---|
| 13 | **13 — photo carousel** | **L3, behind a licensing ruling.** Not merely out of scope: photos are provider content with storage restrictions, they give the product a media pipeline it does not have, and we already have a live privacy defect from the one image we do show (backlog 2.19 — the review screen hotlinks TikTok's CDN, handing them the user's IP on every import). Three problems, none of them the fun one |
| 14 | **3 — DM a reel to an account** | **Never at this level** — see §2 |
| 15 | **22 — a paid tier** | **Never in V1.** `product-specification.md` §3: the user and the customer are the same person, and no capability was added to make a business case work. But the *observation* underneath it is load-bearing and I am taking it — see §2 |

---

## 2. The rejects, by name

Split deliberately into **violates something we already decided** and **merely out of scope**. The
first group is not re-openable by anyone below the owner; the second is a judgement I would revisit
on evidence.

### Violates a decision we have already taken

**Item 7 — Trips (day-by-day itinerary, per-day tabs, drive times, numbered route pins).**
Refused. Charter §1: *"not a travel itinerary planner"*, stated in the definition of what the
product is not. `product-specification.md` §2.1 names travel-itinerary planners as an anti-user in
its own row. This is the single clearest reject on the list and it is not close. It is also the
largest thing on Plotline's screen, which is exactly why it needs saying out loud: **we are not
behind on trips, we declined trips.**

**Item 17 — `Saved by 4 plotters`.**
Refused, and I could not grant it if I wanted to. It requires reading other users' saved rows to
compute a count. Every `saved_places` path is `user_id = auth.uid()` and RLS is treated as the real
authorisation boundary (Charter §5), so this is a data-exposure question and therefore
`security-privacy`'s veto, not my tie-break. Separately it is a popularity signal in a product whose
Charter §1 says it *"only ever shows the user places they saved"*. Two independent refusals.

**Item 18 — `Trending` on the map.**
Refused. A discovery feed. Charter §4 lists creator discovery and recommendation ranking as
explicitly out of scope; `mvp-plan.md` §8 lists "trending/discovery feeds" under *Not anywhere*. It
also needs the same cross-user read as item 17.

**Item 20 — followers, following, follow-back feed, Share Profile.**
Refused. Charter §1: *"not a social network (no follows, no public profiles, no creator discovery in
V1)"*. `product-specification.md` §2.1 anti-user row 3. The 2026-08-28 shared-collections correction
does **not** open this door — that ruling drew the line precisely: a private, named-invitee
collection is a multiplayer document; a follower graph is a network. Pinned collections is the only
survivable crumb and it is UI over an object we already have; it does not need a Future entry.

**Item 21b — the derived persona (`The Culture Seeker … Based on your 11 plot points`).**
Refused, and this is the one I feel most strongly about. It is the model asserting a confident fact
about a *person* from eleven rows. We hold a rule that an uncertain result beats a confidently wrong
place; a confidently wrong claim about the user is worse, because the user cannot check it against
the world the way they can check a pin. It also lands in Charter §4's gamification exclusion. The
stats it sits on (item 21a) are fine — a count is a fact, a persona is an inference in the product's
voice.

**Item 23 — the bucket-list progress ring (`0 of 11 places visited`).**
Refused **as presented**. `mvp-plan.md` §8 ruled out every return trigger — streaks, badges,
counts-as-achievement — on 2026-08-29, and a completion ring is that ruling's exact shape with a
different label. It also frames an un-completable library as a failure state, which is the opposite
of what `L1-F12` is for: the completion state exists so the library gets *lighter*, not so it gets
scored. The honest version of the same information is already in `L1-F12` — "4 not been yet" as a
filter label. No ring, no percentage.

**Item 3 — `DM a reel to @plotline.app` / `Connect Instagram to save from DMs`.**
Refused, and **I do not need a VERIFIED/ASSUMED/UNAVAILABLE label from `social-integration` to
refuse it**, because it fails on one of our own invariants before it reaches the feasibility
question. Charter §3 invariant 2: *nothing is written to the user's map without user confirmation*.
An inbox that ingests a DM and produces a saved place is an unconfirmed write by construction — and
`current-state` §5b.1 measured that silent partial save loss is the category's most damaging failure
and our confirm step is the moat. Had it passed that, it would then have needed a VERIFIED
Instagram mechanism we do not have: `05-secondary-platforms.md` keeps Instagram Deferred, and
`current-state` §5b corrected the label's *reason* to **payload, not authentication** — Instagram
oEmbed is reachable without a token and returns no title, no author and five visible words. Refused
twice over.

**Item 2 — the four-source add sheet (`Search` / `Instagram` / `TikTok` / `YouTube` tabs, plus a
"Save spots from" badge with four platform icons).**
Refused as designed. It advertises four capabilities where we have one, which converts our honest
recognised-redirect into a broken promise the first time someone taps `Instagram`. Our boundary is a
*product decision stated in the product* (`mvp-plan.md` §2), and a tab bar is the fastest way to
un-state it.

There is one real idea inside it and I am taking that separately: **one entry point that offers both
"paste a link" and "add a place by name"**. That is not new scope — `L1-F4` (no-places) already
*depends* on `L1-F7` (manual add), and the critical path in `execution-plan.md` already warns that
F7 is early, not late. Plotline putting both behind one `+` is corroboration that they belong on one
surface.

### Merely out of scope — deferred, and I would revisit on evidence

**Item 5 — the five-slot bottom bar (Map / Collections / Trips / Profile / `+`).**
Two of those five slots are things we refuse (Trips) or barely have (Profile — one signed-in person,
a private map, no audience). The scope ruling is narrow: **a tab bar with a Trips tab widens the MVP
by advertising a product we decline**, and a Profile tab in a single-user private product is a
container looking for contents. Whether the shell should have a tab bar *at all* is an IA question
and is `ux-interaction`'s to specify and `nextjs-architect`'s to break ties on, not mine — I am
ruling on what may go in it, not on whether it exists.

**Item 8 — Side Quests (swipe nearby saved places).**
**Cut, not deferred.** It does not violate anything — it swipes over your *own* saves, so Charter
§1's "recommends nothing" survives. It is refused because it is a **second answer to a question we
are already answering**: `L1-F11` (near me) plus `L1-F12` (been / not been yet) together produce
exactly *"three places near you that you haven't been to yet"*, which `mvp-plan.md` §8 already
named as the honest trigger. Building two retrieval systems for one job is how the core loop gets
worse while the product gets bigger.
**Evidence that changes my mind:** near-me plus not-been ships, is used, and users still do not act
on what it surfaces. Then the problem is presentation and a swipe deck is a candidate answer. Not
before.

**Item 9 — the `+` chooser (`What are we creating?` → Trip / Side Quest / Collection).**
Falls with 7 and 8. A creation chooser whose options are two things we refuse is a scope
advertisement. If the `+` ever needs a chooser, its options are *paste a link* and *add a place*.

**Item 19 — the four-icon action row (favourite / visited / edit / bookmark).**
Partly taken, partly refused. Visited is `L1-F12`; favourite is item 9 above; edit (rename) already
shipped on 2026-08-30. **`Bookmark` alongside `Favourite` is refused**: two words for one state, and
a user who has to work out the difference between bookmarking and favouriting a place they already
saved is being asked to do the product's thinking. **Binding constraint: at most two per-save
states, and each must be sayable in one word that is not a synonym of another.**

**Item 22 — the paid tier.**
No pricing, no tier, no trial: `product-specification.md` §3 forecloses it for V1 and nothing in a
course MVP should be designed to monetise. **But their free tier meters *daily saves*, and that is
the same economic constraint we have**: 500 Gemini calls/day, 100 Google Places calls/day, and
`rateLimitedLocal` with zero production call sites (backlog 11.12, 12.18). Plotline reached for
pricing; we reach for a limiter. The ruling I am taking from it is a **product** one, not a
commercial one:

> When the per-user daily import cap ships (`L0-F6-T1`), it is a **product-visible, honestly-worded
> limit**, not a silent 429. The user is told how many imports they have left before they hit it,
> and what happens tomorrow. A user who cannot tell the difference between "you have imported a lot
> today" and "the app is broken" will conclude the app is broken.

That is an acceptance criterion `qa-reliability` can check without asking me anything.

---

## 3. The three rulings

### Ruling A — item 16, `THE INSIDE SCOOP`. **Adopt at L1. Highest-value item on this list.**

**Verdict: yes, and it stays inside the "info" boundary. It costs zero new stored fields.**

The boundary argument, because it is the part that needed deciding. `mvp-plan.md` §2 fixes stored
info at *name · category · coordinates · source link · user note*, and gives its reason in the same
sentence: *"which is exactly what open data lets us store forever"*. **That reason is a licensing
constraint on place facts obtained from a provider.** A sentence the creator wrote in their own
caption is not a place fact from a provider — it is content of the source post, which the boundary
already admits under *source link*, and which we already store: `sources.content_text` and
`saved_places.extracted_reason` shipped in `0019`. The handle is already stored too
(`sources.author_handle` / `author_name`), and it already reaches the UI — `get-spots.ts` selects
both and `SpotSource` carries them. So this is a **render change over data we hold**, which is why
it ranks first.

**What we adopt:** the attribution. The handle goes on the quote.

**What we do not adopt, and this is the load-bearing half.** Their line reads
`kelseyinlondon recommends Restaurace Mincovna for trying Svíčková … and Czech Pilsner` — a
*synthesised* sentence, in the product's voice, attributed to a named real person. That is our
"never convert uncertainty into certainty" rule broken at the worst available place: a claim about
what a named third party said. `place-enrichment.tsx` already encodes the correct answer and it
should not be softened —

- `extracted_reason` is the verbatim caption slice, renders as a **quotation between quote marks**,
  and is the **only** thing the handle may attach to;
- `why_go` is the model's reading, renders as quiet unquoted prose with no label and **no
  attribution, ever**;
- `whyGo.groundedIn` stays unpersisted (`current-state` §7 — that reversal was correct and this
  ruling does not reopen it).

**The blocker, and it is real rather than procedural.** `extracted_reason` is browser-forgeable
today: an authenticated client can POST any value to `/saved_places` and it lands verbatim
(`current-state` §5.5). Without attribution that is "a user can lie to themselves and to nobody
else". **With attribution it becomes: our product prints fabricated words beside a named creator's
handle and a real link to their post.** `candidate-place.ts` and `domain/extraction/schema.ts`
both already anticipate exactly this scenario in their comments. So:

> **Acceptance criterion, binding.** The creator handle may not be rendered beside the caption quote
> until `extracted_reason` is written by the `service_role` enrichment writer and the client's
> INSERT grant on that column is revoked. Verifiable by `qa-reliability` as: a signed-in browser
> session POSTing an `extracted_reason` to `/saved_places` receives `42501`, and a saved row's quote
> can be produced only by an import. No `SECURITY DEFINER` is needed — `current-state` §5.5 says the
> fix is now cheap because the writer already exists.

**Two smaller criteria in the same ruling.**

1. **The handle is text, not a link.** A tappable handle that opens that creator's profile or their
   other posts is creator discovery, which Charter §1 excludes. The link on this screen goes to *the
   post that made you save this place*, which is Charter §3 invariant 3, and there is exactly one of
   it.
2. **No handle, no quote-attribution** — a place with a quote but no `author_handle` renders the
   quote unattributed rather than inventing an attribution or hiding the quote.

I agree with the orchestrator's read that this is the highest-value item here and nearly free. The
attribution question was real, and the answer is that attribution is safe on the verbatim column and
unsafe on the synthesised one — which is a distinction the codebase already draws, so the rule
already exists and this feature only has to respect it.

### Ruling B — item 12, references-as-objects. **L2, and only the narrow half.**

**Verdict: split it. One half is a fix I want; the other half is a second library.**

**The half I want (item 6 in §1, L2): every source on a place, not just the first.** Their
`YOUR REFERENCES (1)` block on a place's detail is precisely backlog **6.6** — `earliestSource()`
takes the first source and drops the rest, so **Charter invariant 4 ("the same physical place is one
row, referenced by many sources") is invisible in the product today.** We built the many-to-many
(`saved_place_sources`, `08 §3.6`), we wrote the invariant into the Charter, and then the UI shows
one. That is not a Plotline idea; it is us finishing something. Inside the boundary: *source link*
is already one of the five fields, this only makes it plural. **Field: none new.** `SpotSource`
widens to an array.

**The half I refuse as a surface: a browsable `/references` index of posts.** Our one claim is that
**location replaces chronology as the organising principle** (Charter §1). A browsable list of posts
is a reverse-chronological saves folder — the thing we exist to replace — rebuilt inside our own
app. Backlog 5.11 ("import history has no surface") and 5.12 ("group by `source_id`") are the same
temptation with different names. It is not a *distraction from the map* in the weak sense of
competing for attention; it is a second organising principle competing with the one the whole
product is an argument for.

**The middle, which is where I land:** "everything from this post" exists as a **filter reachable
from a place's detail** (item 12 in §1 — backlog 5.12, one predicate over an existing column), not
as a tab, an index, or a nav slot. Zero new surfaces, the map stays the shell, and the job ("what
else did this creator send me") is served.

**Evidence that would promote the browsable index:** a user asks, twice, "what did I get from that
one video" *while not looking at any of the places it produced* — i.e. reaches for the post before
reaching for a place. Until then the post is a provenance fact about a place, not an object with its
own life.

### Ruling C — item 14, hours and `Open now`. **Out. Cut, not deferred, for V1 and V2.**

**Verdict: hours are out. Four independent reasons, any one of which is sufficient.**

1. **Boundary.** `mvp-plan.md` §2 names opening hours **first** in its list of what is "not in the
   MVP and not in V1". This is not a gap someone forgot to schedule.
2. **Licensing.** Hours are provider content. The reason the five fields are the five fields is that
   we may store them *forever*; a credentialed provider's terms do not permit that for their place
   content (`06` §3 is the standing analysis, and Google Places is now the canonical resolver). Hours
   are the exact class of data the boundary exists to keep out. "Display without storing" is not a
   loophole — it converts every place view into a provider call.
3. **Quota.** 100 Google Places calls/day. A live details call per opened place makes *browsing your
   own library* spend the same budget as importing. And an `Open now` **filter** is worse by an order
   of magnitude: filtering a 100-place library is 100 lookups — one tap, one day's quota. This is
   not a "when the quota is raised" problem; the shape is wrong at any quota.
4. **Honesty.** Stale hours are the highest-consequence wrong answer this product can give. A pin
   150 m off costs a minute of walking; a wrong `Open now` sends someone across a city to a locked
   door. *"An uncertain result beats a confidently wrong place"* binds harder on a fact with a
   timestamp than on a coordinate.

**Is there an honest version of `Open now`? No — and I want that recorded rather than left as an
open gap someone re-proposes each quarter.** There is no version that is simultaneously cheap,
current and true. What ships instead is not a consolation prize:

> **`Open in Maps` on every place** (item 2 in §1, L1). One tap to the live, authoritative, free
> answer, from the party whose data it is. That *is* our honest `Open now`: we do not answer the
> question, we hand it to whoever can, immediately, and we spend nothing doing it.

**Evidence that changes my mind — all three, not any one:** the Google Places quota is raised to a
level where per-view lookups are affordable; `security-privacy` rules that a display-time-only,
never-stored hours read is compliant with the provider terms; and a design exists that can filter a
library by open-now **without** a lookup per place. If hours are ever wanted for real, the trigger is
a **provider decision with storage rights**, not a feature request.

---

## 4. What must not move

Items that would quietly widen the MVP if someone picked them up "because Plotline has it". Each
with the specific door it opens.

1. **Trips, in any partial form.** Not just the Trips tab — *any* per-day tab, drive time, leg, or
   numbered route pin is this feature wearing a different name. **The door is already ajar and
   should be named:** `L2-F1-T5` cut the collection-ordering UI **but kept the `position` column**,
   written on append. Ordering a collection by hand is one design decision away from being a day
   plan. **Rule: `position` may carry a user's manual sort. It may never carry a date, a time, or a
   leg between two places.**

2. **A `Search` tab that writes a place from a typed name plus a map pan.** Plotline's
   `Create manually` is name + category + *pan the map to set location* + notes. Manual add is
   **place search through the same resolver** — the owner's 2026-08-27 ruling admitted it to Charter
   §2 on exactly that basis, same resolver, same provenance fields. A name field plus a dragged pin
   writes a place with **no provider identity**, which is the thing `current-state` §5.8 identifies
   as the root of the phantom-duplicate library. Taking the map-pan gesture as a **correction** for
   an existing bad pin (item 10) is good; taking it as a **creation** path is how the boundary
   erodes without anyone deciding to erode it.

3. **Photos.** The first photo brings a media pipeline, a licensing question, and a hotlink privacy
   defect we *already have* in a smaller form (backlog 2.19). Three problems arrive together and
   only one of them looks like the feature.

4. **Hours, and `Open now` in any form** — including the seemingly-free version where we show hours
   only on a place the user has already opened. Ruling C, reason 3: that is the version that spends
   the quota.

5. **Any cross-user count or signal** — `Saved by N`, `Trending`, "popular near you". Not mine to
   grant: it needs a read across `saved_places` rows the RLS boundary exists to prevent, so it is a
   `security-privacy` question and their veto stands over my tie-break.

6. **The creator handle becoming a link.** Ruling A ships a handle to the screen. The distance from
   "text beside a quote" to "tap to see their other posts" is one `<a>` tag, and the far side of it
   is creator discovery, which Charter §1 excludes by name. Written here because it will look like a
   two-minute improvement to whoever ships Ruling A.

7. **A four-platform add sheet, or platform icons anywhere.** Our TikTok-only boundary is honest
   only while the product does not claim otherwise. One badge with four icons un-claims it.

8. **Persona, progress rings, streaks, badges, counts-as-achievement.** `mvp-plan.md` §8 already
   ruled out every return trigger; a completion ring is that ruling with a different label, and a
   persona is worse because it is an inference about the user rather than a count.

---

## 5. Two things for the orchestrator, outside the ask

**Nothing here needs a `social-integration` label.** The only item that would have needed one —
item 3, DM ingestion — fails on Charter §3 invariant 2 before feasibility is reached, so no probe
should be spent on it.

**Stale ownership in `execution-plan.md`, per my standing mandate.** Two features read as staffed
and are not:

- **`L0-F3` — Global resolver (D2b)** is headed `maps-geospatial + security-privacy · cut: never ·
  T1 CLOSED, rest still parked`. "Parked" with two named owners reads as staffed at a glance, and
  the feature's *content* is stale as well: Google Places is now the canonical resolver
  (owner ruling 2026-08-28), so the Nominatim adapter that feature describes may not be the work
  anyone would do. The heading should say what is true.
- **`L1-F7` — Manual add and delete** is `nextjs-architect` + `supabase-database`, `cut: never`, and
  has been *in scope, not started* since 2026-08-27. This is the one that costs something:
  `execution-plan.md`'s own critical path says **F4 waits on F7**, and `L1-F4` is the no-places
  screen — the **modal** import outcome. An unstaffed never-cut feature sitting under the most
  common thing that happens to a user is worth flagging louder than it currently is.

`L1-F13` is correctly marked `PROPOSED, NOT STAFFED` and needs nothing.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-29 | Created (`PLOTLINE-FEATURES-1`). 23 competitor features ruled: 4 taken at L1, 8 at L2, 1 at L3 behind a licensing ruling, 10 refused. Nine of the 23 were already ours, filed in the backlog or at L1/L2 — Plotline is corroboration of existing priorities more often than it is a new idea. Three rulings requested by the orchestrator: **the attributed caption quote is adopted at L1** and stays inside the info boundary because that boundary constrains *provider place facts*, not the source post's own content — gated on one acceptance criterion, that `extracted_reason` stop being browser-forgeable before a creator's handle is printed beside it; **references-as-objects is split**, taking the place-detail "many sources per place" fix that Charter invariant 4 already promised and refusing the browsable post index as a second organising principle competing with location; and **hours are out, cut rather than deferred**, on four independent grounds, with `Open in Maps` named as the honest `Open now` and the three-part evidence that would reopen it. Trips, cross-user counts, `Trending`, followers, the derived persona and the completion ring are refused against decisions already taken rather than merely against scope. Eight quiet-widening risks named, including the `position` column kept by `L2-F1-T5` as the open door to itinerary planning. Two stale ownership entries flagged in `execution-plan.md` |
