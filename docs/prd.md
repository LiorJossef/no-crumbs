# Product Requirements Document — No Crumbs

**Product:** No Crumbs — a personal geographic recommendation map
**Status:** built and live at <https://no-crumbss.vercel.app>, auto-deployed from `main`
**Document version:** 1.0 · **Date:** 5 September 2026
**Written against:** `main` at `601cebf`; measured facts carry their source

> **How this document relates to the others.** `docs/product-specification.md` is the frozen M2
> deliverable written on 18 August 2026, before the product existed. This PRD is written *after*
> the build and describes what actually shipped. Where the two disagree, this one is current and
> `docs/current-state.md` plus `docs/no-crumbs-submission.html` are the evidence.
>
> **Labels.** Third-party capability claims carry **VERIFIED** (tested against the real service,
> evidence in `docs/evidence/`) or **ASSUMED** (researched, untested). Our own measurements are
> labelled **Measured** with the artefact that produced them. Nothing here is asserted without one
> of those.

---

## 1. Executive summary and problem statement

### 1.1 One line

People save the video. What they wanted was the place.

No Crumbs turns the places you find on TikTok into pins on your own private map, so you can find
them again by **where they are** instead of **when you saved them**.

### 1.2 The problem

Recommendations for real-world places — restaurants, cafés, bars, viewpoints, shops — increasingly
arrive as social video. The natural response is to save the post. TikTok stores that save as a
*video*, in a reverse-chronological list. It does not store where the place is, what kind of place
it is, or what it is called.

So collecting works and retrieval is broken. And retrieval is the only moment that matters:

- "I'm in this neighbourhood right now — what did I save near me?"
- "I land in Tokyo on Thursday — what do I already have there?"
- "I want dinner tonight and I don't want to scroll."

A saved-list thumbnail rarely reveals the venue name or the city, so answering any of those means
opening posts one at a time and reading them. Checking fifteen candidates costs a few minutes of
active effort — and the realistic outcome is worse than slow. The person gives up and goes
somewhere they never saved. **The recommendation they deliberately kept had no effect on the
decision they made.** That is the loss: not storage, not time, but a decision made without
information the user already owned.

> **On the cost figure.** "A few minutes" is an *estimate*, from the owner's own account and
> informal peer checks, n small. A timed baseline was planned and never run, so it stays labelled
> an estimate rather than being quietly promoted to a result.

### 1.3 Why the platform will not fix it

| What the moment of intent needs | What a TikTok save offers |
|---|---|
| A geographic index — "near me", "in Tokyo" | Chronological order only |
| One entry per place | One entry per video; the same venue may appear in several |
| A structured category — coffee, bar, bakery | None |
| Text search over *place names* | Search over the platform's signals, not over your saves as places |
| Durability independent of the platform | Data inside one app you do not control |

The conversion from *post* to *place* is work the platform never performs. Today the user performs
it in their head, from a grid of thumbnails, at the worst possible moment.

### 1.4 What we built

A signed-in user pastes one TikTok link. The server reads the post, a language model extracts the
venues named in the caption, each candidate is resolved against a places provider to get real
coordinates and a real identity, the user confirms what they want, and the confirmed places land on
their private map — permanently linked back to the post that recommended them.

**The map is not a feature of the product. The map is the retrieval interface.** Location replaces
search as the primary way a person finds their own saved recommendations.

### 1.5 The limitation we lead with rather than bury

We read **captions**, not audio and not video frames. A great many TikToks name the venue only on
screen or only out loud, and those we cannot read.

The consequence is a product decision, not an error path: **"no places in this one" is a normal
outcome.** It is a first-class designed screen with three ways forward, it never blames the user,
and it never asks anyone to paste a caption — because the moment the product asks for typed text,
its reason to exist disappears.

> **We deliberately do not quote a hit-rate percentage.** The only figure ever measured (~27%) came
> from an eleven-post feasibility sample taken *before* the extraction and resolution work existed,
> and it was never re-measured against the finished product. A number that stale is worse than no
> number. The architectural fix — reading on-screen text or audio — has a port waiting for it
> (`ContentExtractor`) and was cut on cost and latency, not on design.

### 1.6 Why it matters

Two things make this worth building rather than tolerating.

**The value is already paid for.** Users have completed the expensive half — discovery, judgement,
the decision that this place is worth remembering. They cannot get it back out. We are not asking
anyone to build a new habit; we are unlocking a collection they already have.

**The output outlives the input.** A saved place here is a real name, real coordinates, a category,
a note and a source link — in the user's own database row, organised by location. That survives a
platform changing its saved-folder design, its terms, or its mind.

---

## 2. Target audience and customer

### 2.1 The primary user — one person, two retrieval questions

|  | Everyday | Trips |
|---|---|---|
| The question | "What did I save around here?" | "What do I already have in this city?" |
| Trigger | Standing in a neighbourhood, deciding where to eat | Planning, or landing somewhere |
| Served today | Yes — near-me on location permission, nearest first | Yes — global place resolution, no location permission needed |

It is one profile, not two segments. The same person saves places in the city they live in and
banks places for a trip they have not taken yet.

**Two facts shape every design decision:**

1. **This happens on a phone, standing up, mid-session.** The product is mobile-first in the real
   sense — bottom sheets with drag physics, thumb-reach action zones, safe-area handling — not a
   desktop page shrunk down. Desktop is supported and secondary.
2. **Importing is the cost; retrieval is the reward.** Every tap in the import flow is paid *before*
   any value is received. That is why the quality budget is spent there, and why the user's side of
   the exchange is held to exactly one paste.

### 2.2 Who it is not for

Stated so the boundary can be tested:

- People looking for **new** places to go. There is no feed, no ranking, no "places you might like".
  No Crumbs never suggests a place you did not save.
- **Itinerary planners** wanting day-by-day routing, bookings or opening hours.
- **Creators or businesses** wanting an audience. There is no social graph and no public profile.
- **Anyone with fewer than about ten saved places**, where a plain list still beats a map. The
  product is worth nothing at zero saved places, which is a real onboarding constraint (§4.1).

### 2.3 The customer

**The user and the customer are the same person.** There is no advertiser, no business account, and
no third party buying access to anyone's data or attention. The product's only obligation is to the
person whose map it is.

That is not a positioning flourish — it is why the security posture is what it is. A private map,
ownership enforced in the database rather than in application code (§5.7), and the user's live
location never stored on the server.

No pricing is proposed and nothing in this version was designed to make money. If it ever were, the
obvious model is a paid tier for the highest-volume savers, because they feel the retrieval pain
most acutely.

### 2.4 Competitive context

The category is saturated: research identified **at least thirty-four shipping products** that turn
a social link into a pin on a personal map (Mapstr, Beli, Rex, Postcard, Plotline and others). They
have collectively taken the naming roots `map*`, `spot*`, `pin*`, `geo*` and `*tok`.

The differentiators we chose to defend are not feature count:

- **Honesty about what the machine did.** Extracted facts, inferred facts and the user's own words
  stay distinguishable. An uncertain result is shown as uncertain; it is never dressed up as
  resolved.
- **The failure case is designed, not patched.** The most common import outcome has its own
  specification (`docs/spec-no-places-found.md`, 1,098 lines) and its own recovery paths.
- **Ownership is real.** Permission is enforced by Postgres row-level security and proved by an
  executed attack run, not described in a privacy policy.

---

## 3. Business goals and value proposition

### 3.1 Five goals

| # | Goal | How the product delivers it |
|---|---|---|
| 1 | **Retrieval drops from minutes to seconds** | "What's near me" becomes a glance at a map instead of a search through a folder |
| 2 | **Unstructured social saves become structured data the user owns** | A video becomes a row: real name, real coordinates, a category, tags, a note, and a permanent link back to the post |
| 3 | **Better real-world decisions** | The recommendation is available at the moment of choosing, not forgotten at it |
| 4 | **A library that survives the platform** | Organised by location, not by date, and not dependent on TikTok's saved folder continuing to exist |
| 5 | **The conversion costs the user nothing** | The app does the video-to-place work. The user supplies exactly one thing: a link |

**Goal 5 carries the other four.** If the product asked the user to paste caption text, it would be
a manual map with extra steps — and goals 1–4 are things a notes app already gives you. Every scope
decision in §5 exists to keep the user's side of the exchange down to one paste.

### 3.2 The value proposition, stated as an exchange

> **You give:** one paste, and a confirmation tap.
> **You get:** a permanent, private, location-indexed library of places you chose, retrievable in
> seconds, with the video that convinced you always one tap away.

### 3.3 Where the value shows up concretely

**Time.** The target is the "what did I save near here" question answered in under ten seconds by
looking at a map, with no scrolling and no recall required — against minutes of opening posts.

**Decision quality.** This is the goal that matters more than time. The measurable outcome is not
"the search was faster"; it is "the saved recommendation was actually used." A collection that
cannot be queried at the moment of intent has an effective value of zero regardless of its size.

**Workflow.** Import is a batch activity — a person clears a backlog in a sitting — and retrieval is
an in-the-moment activity. The product separates them cleanly: `/import` is a focused single-purpose
flow, `/map` is the durable home surface.

**Data ownership.** Everything stored is deliberately restricted to what open data permits us to
keep **forever**: name, category, coordinates, source link, user note. No hours, photos, ratings or
reviews — because those carry licence expiry and would make the library rentable rather than owned.

### 3.4 Non-goals, and why each is excluded

| Not built | Reason |
|---|---|
| Discovery, feeds, recommendations | You already have too many recommendations; what you cannot do is reach the ones you chose |
| Itinerary generation, routing, bookings | A different product with different data needs |
| Social graph, public profiles, creator discovery | The customer is the user; an audience product has a different obligation |
| Video/audio/OCR analysis | Cost and latency, not design. The port exists (§5.9) |
| Pasting caption text | Would destroy goal 5, which carries the rest |
| Native apps, offline mode, PWA share target | A web app cannot appear in the iOS share sheet; designing a flow that cannot exist is worse than not having it |

---

## 4. Core user flows

Seven flows. Each is described as the numbered steps a real person takes, with what the system does
underneath.

### 4.1 Authentication and first run

1. A signed-out visitor lands on `/`. It states what the product does in three numbered steps —
   *paste a link from TikTok → check what we found → it lands on your map* — and states the
   boundary on the landing page rather than in a footnote: **"Works with TikTok links today."**
2. On `/sign-in` they sign up or sign in with **email and password** (Supabase Auth). Sign-up asks
   for a first name (required, because collaborators need to see who added what), a last name
   (explicitly optional), email and a password. A `?next=` parameter carries their intended
   destination through the round trip, so a shared link survives sign-in.
3. Supabase issues a signed session token held in a cookie. Middleware refreshes that session on
   **every** page request, and `/map` refuses to render without one — the redirect happens before
   any React renders. Every other signed-in surface re-checks the session in its own page body
   rather than trusting the middleware.
4. Sign-up expects **email confirmation**: the screen says "Check your email to confirm your
   account, then sign in."
5. Password reset is a two-page pair — request a link, then set a new password. Setting a new
   password **signs out every other session**.
6. **First run lands on an empty map**, which is the product's weakest moment by construction — it
   is worth nothing at zero places. The empty state is designed rather than blank: *"Your map starts
   here."*, one primary action, and a map that guesses a sensible region from the browser's time
   zone rather than dropping the user on the null island. Three routes out exist: paste a link (with
   real seed TikToks offered on the paste screen for a cold start), add a place by name, or accept
   an invite to someone else's collection.

**Designed details worth stating:**

- **Sign-up is open in code and closed in production by configuration**, with written copy for it:
  *"New accounts are closed right now. Sign in if you already have one."* The product does not show a
  raw provider error for a deliberate operational state.
- **Errors at the door never leak account existence.** "No such user" and "wrong password" collapse
  into one sentence. A failing reset request still reports "sent" — *"If that address has an account,
  the link is in your inbox."* Every auth error string is written by us; the provider's message never
  reaches the screen.
- **The return path is an allowlist, not a sanitiser.** Exactly two destinations survive a round trip
  through sign-in — a collection invite and an import URL. Everything else falls back to the map.
- Every server-side read runs as *that user*, never as an administrator, and always via a call that
  validates the token against the auth server rather than trusting the cookie payload.

### 4.2 The flagship flow — a TikTok link becomes pins on your map

**Step 1 — Paste.** The user copies a link in TikTok, switches to No Crumbs, and pastes it into the
one field. Pasting a blob of text — which is what TikTok's own share button often produces — is
silently narrowed to the URL inside it rather than rejected. The string is then classified in the
browser: is this a TikTok host, is it a video, a profile, a short link? Short links, tracking
parameters and locale variants all reduce to **one canonical post identity**, which is what makes
caching and de-duplication work.

Two outcomes are decided **before any request is sent**, so a wrong link costs nothing:

- **Not TikTok at all.** *"That link isn't from TikTok. We support TikTok links. Instagram and
  YouTube aren't supported yet."* — with named next moves, landing the user on manual add. *A
  redirect, not a failure.*
- **TikTok, but not a video** — a profile, hashtag, sound or live URL. *"That's a TikTok link, but
  not a video."*

Being offline is also caught here, without burning a request.

**Step 2 — Accept, and see the post (round trip 1).** `POST /api/imports/source-preview` fetches the
post from TikTok's public oEmbed endpoint and returns the thumbnail, the `@handle` and the caption,
typically within about a second. The user sees the post they just pasted while the slow work runs
underneath. The import requires a session; the cost ceiling is **at most eight provider lookups and
one model call** (§5.10 note 1 records that a per-user rate limit on this route is *not* built).

**Step 3 — Read and extract (round trip 2).** `POST /api/imports/probe` runs the rest of the
pipeline in one request:

- The URL is **re-validated server-side**. This is the SSRF gate; the browser's check does not count.
- An `imports` bookkeeping row opens, so the attempt is auditable whether it succeeds or fails.
- The post is fetched and cached in a shared `sources` table — the second person to paste the same
  link costs no network call.
- The caption text is pulled out. **The caption is treated as untrusted data, never as instructions.**
- The extraction cache is checked before spending a model call, keyed on a hash of the caption text.
- The caption plus a versioned prompt goes to the language model, which returns **schema-constrained
  JSON** naming zero or more venues. Zero is a legitimate answer, not an error.
- A plausibility gate drops candidates the caption does not support — a bare city or country name
  with no venue behind it. This grounding check is also the real defence against a hostile caption.
- Each surviving candidate is resolved against the places provider, the answers are ranked, and a
  confidence band is assigned.
- The extraction and its shortlists are persisted, and the `imports` row advances.

Model latency is **7 to 34 seconds** (Measured). The progress rail on screen claims **no stage the
server did not send**.

**Step 4 — Review. Nothing is saved yet.** The screen shows the post it read — thumbnail, handle,
and the caption behind a *Show the caption* toggle — then one card per candidate. If exactly one
candidate matched cleanly the whole screen **collapses to that place's own name** rather than making
a person read a list of one. A standing line under the save button reads **"Nothing is saved yet."**,
and a unit test guards that it is there.

Per card:

- **Confident matches are pre-selected**, not silently saved.
- **Unconfident matches are offered as a choice** — a shortlist the user picks from, with nothing
  ticked.
- Confidence comes from **resolution evidence** — name similarity, city agreement, category
  agreement, and how far ahead the winner is over the runner-up — **never from the model's opinion
  of itself.** The model's self-reported confidence *is* stored, and is deliberately never acted on;
  it exists so the claim that it is unreliable can be measured rather than repeated.
- Three bands drive behaviour: **`preselect`** (score ≥ 0.92 **and** margin ≥ 0.05 **and** no rival
  branch of the same chain), **`confirm`** (score ≥ 0.80 with either other gate failing → a
  shortlist), and **`no_match`** (below that → the raw candidate string, pre-filled into a search).
- No confidence number, band, bar or percentage appears anywhere on the screen.
- **Three learned rules override a good score**, each added after a real failure: a candidate
  resolved only from a hashtag never arrives ticked (`#tsukijifishmarket` scored 1.000 and
  pre-selected the wrong thing); an ambiguous candidate with options never arrives ticked (three of
  six failing links were 1.36–4.70 km apart); and a candidate that was capped or never attempted
  never ticks.
- The user can adjust the choice, add a note, and deselect anything they do not want. Every card
  carries a **"Check on Google Maps"** link, because a link the user can follow beats a confidence
  score they have to interpret.

**Step 5 — Confirm.** `POST /api/imports/confirm`. The browser sends **an extraction id, a candidate
index, an option index and the user's own note — and nothing else.** Every fact that reaches the
database is re-derived on the server from the row the server itself wrote.

The places land on the map, **de-duplicated**: one physical place is one row no matter how many
videos pointed at it, and each save keeps its source link.

**Partial success is a first-class result, not an exception.** The server returns a per-item outcome
and the interface says which is which: *"Saved 2 of 3 places — 1 couldn't be saved."* A candidate
with no usable coordinates is reported as skipped rather than silently dropped, and the import is
only recorded as completed when nothing failed.

The map then frames the new pins and holds the import overlay open until the rows actually appear —
so there is never an empty map between saving and seeing.

**Step 6 — Retrieve, later.** The user opens the app somewhere and the map answers the question.
This is the step the other five exist for.

### 4.3 The most common outcome — "no places in this one"

Not an error path. A designed screen with its own specification, which distinguishes four honest
cases from the server's own evidence:

| Case | Condition | What the user is told |
|---|---|---|
| **A** | The post has no caption at all | "There is no caption on this one" — the post's boundary, not ours |
| **B** | The caption named nothing | "No places in this one" — the modal case |
| **C** | The caption named an area, not a venue | Same headline, but the city hint **scopes the search** offered below |
| **D** | Candidates survived but none is saveable | A different screen entirely |

The B/C distinction is surfaced **as behaviour, not as a label** — deliberately. Individual drop
reasons were measured as unreliable (one filter fired four times and was wrong four times out of
four), so the product does not report a filter's opinion as a fact about the user's post. Only the
one checkable sub-case — a city hint that genuinely scopes a search — changes what is offered.

**Two ways forward, ordered by strength of outcome:**

1. **Add by name** (primary). The person watched the video and knows the place. They type the name,
   `POST /api/place-search` queries the provider, they pick the right one, it saves. No model in the
   path, one step fewer, exact provider result.
2. **Tell us what you remember** (revealed, not always on screen). A free sentence — *"the donut
   stall in the shuk, Roladin"* — read by a call of its own and merged into the candidates. It
   carries disambiguation a bare name loses, and lets a person offer a name they are not sure is a
   name. Measured on a five-post sample: posts yielding a candidate went **1 of 5 to 3 of 5, with
   nothing invented** on two controls. It is a disclosure rather than a second always-open text box,
   because two stacked fields in the thumb zone is a form — which is what this screen must never be.

A third route is always present: open the original TikTok.

**What never appears:** a request to paste the caption. No flow in the product leads there.

### 4.4 Retrieval — the map

1. The user opens `/map`. A Server Component reads their **entire library** in one query, under
   their own token, and the page renders with pins already on it.
2. The camera frames a box around all their places on first paint, so the map opens somewhere useful
   rather than at a default coordinate.
3. **What is drawn depends on how far out you are**, in three bands: country discs, then area pills
   carrying a name and a count, then individual pins. Area pills lay out with collision detection, so
   overlapping labels drop out rather than pile up. Pins carry **category colour** — colour on this
   map means *what a place is*, which is why the pin never carries a face.
4. Tapping a pin opens **place detail** in a bottom sheet: name, category, coordinates, the user's
   note, tags, been / not-been, and the TikTok(s) that recommended it. "Why did I save this?" is
   always answerable, and the source link is permanent.
5. Beside the map, a **saved-places drawer** lists the same places. Search, category filter, tag
   chips and been/not-been all run **in the browser over the array the page already sent** — so the
   pins and the list can never disagree, because they are the same array.
6. **Near me** — the offer appears a couple of seconds after load, and only if the user has not
   already settled the question; a declined offer is remembered and not re-asked. On a fix, the map
   scopes to the nearest area and flies in. **Distances only render when the fix is accurate to
   within 500 m** — a rougher fix still moves the camera but hides the numbers and says why, because
   a confidently wrong distance is worse than none. Every failure mode has its own written line,
   including *"Nothing saved near you yet."* The live location is never sent to or stored on the
   server.
7. **Natural-language search** turns a typed sentence into structured filter *values* — area,
   category, tags, visit state — which the same client-side passes then apply, and moves the camera
   to match. **The model never returns places.** It proposes filters; only the user changes the
   result set. The intent is clamped against **the user's own vocabulary**, so it cannot invent a tag
   they do not have, and applying a sentence offers a one-tap **Undo**. It is rate-limited to 20
   requests per user per 10 minutes.
8. The map, the collections index and an individual collection are all **one route segment**
   (`/map?view=collections&collection=<id>`), so the drawer is never unmounted and back, forward and
   deep links all work.

### 4.5 Manual add by name

There are **two manual-add paths, and the asymmetry between them is deliberate.**

**A. The ＋ create menu** (present on every tab) opens **one universal field**, where what the user
types decides what the button means:

1. A valid TikTok link → hands off to the import flow.
2. A link we recognise but do not support → falls through to manual add.
3. Free text that matches something already in their library → **selects that place and reveals it on
   the map**, because "I already saved this" is a more likely intent than "make a duplicate".
4. Free text with no match → the button reads `Add "…" manually`, and the top provider result is
   saved directly, with **no confirmation step**. This is the one-shot path for a name you are sure
   of.

**B. From the no-places screen**, the same capability **does** confirm: the search returns up to five
results, the user picks one, and the save re-verifies that the pick is still the same row — a
mismatch drops back to a fresh list rather than saving the wrong venue. The save is linked to the
TikTok that prompted it.

The difference is the user's certainty. Path A is someone typing a name they know; path B is someone
recovering an import, where showing what was found is worth the extra tap.

In both cases the place lands on the map exactly like an imported one — same tables, same
de-duplication, same detail sheet — with its origin recorded as manual rather than import. Both are
bounded by explicit time budgets (12 seconds to look up, 10 to save) so a slow provider fails with a
written sentence rather than a spinner.

This capability exists for three reasons: it is the recovery path for §4.3, it gives the map an
independent way to be populated, and it exercises the same place infrastructure the import pipeline
needs.

### 4.6 Collections and sharing

1. The user creates a collection and gives it a name and description.
2. They add places to it from their library. A collection is **a map with a different set of pins** —
   which is why it did not widen the product's scope.
3. They generate a **share link**, choosing whether the recipient joins as an **editor** or a
   **viewer**. Creating a link revokes any previous one — there is only ever one live invite per
   collection — and switching role says so plainly: *"Switching makes a new link. The one you shared
   before stops working."*
4. **Before sharing, the sharer is shown what sharing discloses**, in both directions: what a joiner
   will see (name, category, address, shared notes, who added what) and what they will not (your own
   notes, been marks, tags, or the links you saved from). Privacy is stated at the moment of the
   decision, not in a settings page.
5. The recipient opens the invite link. Signed out, they get a real explanation of what a collection
   is before being asked to create an account. Signed in, they see who invited them and what their
   role will allow.
6. **A joiner without a display name is asked for one first**, because joining makes them visible to
   other people as "who added what". The prompt is seeded from their email so it is one tap.
7. Both people now see the collection's places on their own map, scoped by the collection. A viewer
   can copy a shared place into their own library.

**What a collaborator sees, measured rather than assumed.** Joining a collection opens exactly
**two** new read paths: the shared **place identities** in that collection (name, category, address,
locality, coordinates) and the **display names** of collection peers, so "added by …" can render.

Explicitly **not** shared: the owner's note, their name for the place, their category override,
their tags, the model's prose, the caption quote, and **which TikTok they saved it from** — a
person's import history is their own. `visit_state` is withheld by name, and the reasoning is worth
keeping: *want to go* is a statement about where a person intends to be in the future, which is a
different disclosure from sharing a restaurant.

One structural rule keeps that boundary closed: adding a place to a collection requires the place to
**already be in your own library**. Without that condition, the collection tables and the new place
read path would compose into a read primitive over every place row in the database.

**Designed details worth stating:** an unknown, a revoked and an expired invite token all fail
**identically**, so a token cannot be probed for existence. The invite preview deliberately returns
no place count and no member count — those are the aggregates that would make a leaked token worth
something on its own. Removal is a **tombstone, not a delete**, so an old invite link cannot
resurrect a removed member. A collection owner cannot have their own membership deleted or demoted.
An editor cannot add a place from someone else's library, and `added_by` cannot be faked.

### 4.7 Profile, account and deletion

1. `/profile` shows the user's library back to them: places, cities and countries, split by been and
   not-been-yet, plus where and what they save. **Cities and countries are counted from proximity
   clusters, not from raw text**, because four spellings of one city is four rows and one city.
   Sections with nothing in them are omitted rather than shown empty, and there is no avatar —
   because no upload path exists and an empty avatar slot is a promise the product does not keep.
2. `/account` holds the name fields, the peer-visible display name, the light/dark theme choice, and
   the two exits. Sign-out is a plain form, so it works with JavaScript off — deliberately the one
   door that always opens.
3. **Delete my data** removes the account and everything in it. Deletion is by **foreign-key cascade
   from `auth.users`**, deliberately — an application-level sweep would be a second, drifting
   definition of "the user's data" alongside the graph Postgres actually obeys.
4. **The delete endpoint takes no user id as a parameter.** A delete endpoint that accepts one is a
   delete endpoint that can delete somebody else.
5. Deletion **refuses, with an explanation**, while the user owns a collection that other people are
   in. The disclosure opens on the *blocked* view rather than on a confirm button: *"N of your
   collections are shared. Deleting your account would take them away from the people you shared
   them with."* — with the offending collections listed and a way to go fix them. The check runs
   three times: on page load, in the server action, and **again after revoking outstanding invites**,
   because a stranger redeeming a token mid-flight would turn a solo deletion into someone else's
   loss.
6. **One thing survives, and the copy must not claim otherwise:** a note the user wrote on an item
   inside *someone else's* shared collection. The item stays with its attribution stripped rather
   than being destroyed — a deliberate balance between the deleting user's erasure right and the
   collection owner's data. No string in the flow says "everything you wrote is gone."
7. **Per-item deletion** is separate and always available: delete a saved place, clear tags or
   dishes. A user may *not* delete an import record — imports are the audit trail, and "cancelled"
   is a status rather than an absence.

**Export does not exist.** There is no data-export or download surface anywhere in the product. For
a version with real users this is the most obvious portability gap, and it is listed as unbuilt
rather than described as planned.

---

## 5. Functional capabilities

### 5.1 The capability set

Sixteen capabilities. Fifteen were in the original plan; collections and sharing were added later at
the owner's instruction.

| # | Capability | Why it is needed | Status |
|---|---|---|---|
| 1 | Accounts | The map is private; ownership is the security boundary | Built |
| 2 | Take a TikTok link | Short links, tracking parameters and locale variants reduce to one canonical identity, so caching and de-duplication work | Built |
| 3 | Read the post server-side | No typing, no pasting, no screenshots. This is goal 5 | Built |
| 4 | Find the places in it | Zero or more candidates in a fixed, schema-checked shape. Zero is legitimate | Built |
| 5 | Turn each candidate into a real place | Real coordinates, a provider id, a category. A name is not a location | Built |
| 6 | Review before anything is saved | Nothing is ever written without confirmation | Built |
| 7 | A designed no-places screen | Three routes forward: try again, open the original, or add by name | Built |
| 8 | Save, de-duplicated | One physical place is one row, however many videos pointed at it | Built |
| 9 | The map | Not a feature — the way you retrieve things | Built |
| 10 | "What have I saved around here?" | Location on permission, nearest first | Built |
| 11 | List with search and category filter | The map answers *where*; the list answers *which* | Built |
| 12 | Place detail, linking back to the video | "Why did I save this?" must always be answerable | Built |
| 13 | Add a place by name | Recovery path for #7, and the full create/read/update/delete surface | Built |
| 14 | Collections, including sharing | A collection is a map with different pins | Built |
| 15 | Been / not been yet | So the library can shrink and not only grow | Built |
| 16 | Delete my data | The account menu removes the account and everything in it | Built |

Beyond the original sixteen, natural-language search over the library also shipped.

### 5.2 Source acquisition

- **TikTok only**, and this is a capability boundary rather than a preference: oEmbed is the only
  officially supported, terms-compliant way we verified to read an arbitrary public post from a
  server. **VERIFIED: 16 of 16 real public posts read server-side, no key and no account, p90 about
  0.6 s** (`docs/04-tiktok-feasibility.md`).
- Instagram and YouTube were investigated to a **Deferred** verdict and are a recognised redirect to
  manual add.
- The canonicaliser is a **pure function that doubles as the SSRF gate**: exact matching against six
  TikTok hosts — never a suffix, so `tiktok.com.evil.io` fails closed — no IP literals, no explicit
  ports, and the same check re-applied to every redirect hop. It runs in the browser for fast
  feedback and **again on the server, because only the server check counts.**
- Posts are cached in a shared `sources` table keyed on canonical identity.

### 5.3 Place extraction

- The caption plus a **versioned prompt** goes to a hosted language model, which must return JSON
  matching a fixed schema (tool / JSON-schema mode). We never regex prose.
- Two adapters exist behind one port — Anthropic and Gemini — selected by an environment variable at
  the composition root, never by a code fork. Production currently runs **Gemini**; the default when
  unset is the adapter verified against the golden set.
- The output is parsed with **Zod**. A parse failure becomes `EXTRACTOR_INVALID_OUTPUT`, which is
  retryable and cheap to retry because the source is already cached.
- Anything surviving the parse still passes a **plausibility gate**, which drops a candidate naming
  only a city or a country.
- **Extractions are cached**, keyed on the source, the model and the prompt version. Two reasons:
  "no places found" is a common outcome and re-pasting is the natural retry, so every retry was
  paying the model again; and the model is not deterministic, so without the cache the same TikTok
  showed *different* places on the second run. A changed caption or a changed prompt misses the
  cache and re-extracts.
- At most **12 candidates** are carried out of one response and at most **8** are resolved; anything
  past the cap is kept and shown as *not looked up*, never silently dropped.

**Extracted versus inferred is enforced in the schema, not just documented.** Every field the model
returns carries an epistemic class, and the product treats the classes differently:

| Class | Fields | Treatment |
|---|---|---|
| **Caption-verbatim** | the raw name, the city / country / area hints, the address hint, the evidence quote, dishes | Must be findable in the caption. A quote that is not is dropped; an over-long quote is *clipped rather than rejected*, because one 400-character quote used to kill an otherwise good extraction |
| **Caption inference** | the category hint, tags | Proposals. Tags come from a closed whitelist, and a measured leak is recorded honestly: the model has emitted a food tag from a caption that said nothing about food |
| **World knowledge** | the model's own venue identification, name variants, coordinates | Never stored as *the* name and never used for de-duplication. Name variants are confined to querying the provider |
| **Model self-report** | its confidence | Stored, never acted on |

Two consequences a user can see. The caption-verbatim quote and the model's prose live in
**separate columns** because they answer different questions — one is what the post said, the other
is what a machine thinks about it. And model proposals carry a **consent timestamp** that is null
until a human has looked, so the interface can render an unreviewed suggestion as a suggestion. Those
timestamps were deliberately **not back-filled** when the columns were added: a timestamp invented by
a migration would be the schema manufacturing a consent nobody gave. The review action for the
model's prose takes a **boolean — keep or discard** — so authorship into that column is not merely
unimplemented, it is inexpressible.

### 5.4 Place resolution

- **Google Places is the canonical resolver.** Chosen on measurement: **15 of 16 correct top-1 on
  the resolver benchmark, with zero wrong auto-matches** (Measured).
- The alternative — trusting the model's own coordinates — was measured and rejected: **65 to 470 m
  out, and 541 m apart between two runs of the same caption.** That is a pin on the wrong street.
- An **Overture Maps** gazetteer loaded into our own Postgres is the compliant fallback, behind a
  code-level terms gate: Google Places content may not be paired with a non-Google map, and our map
  is MapLibre. The gate is code rather than prose because a documented-only gate is one refactor
  from gone, and an unset stage counts as production so it **fails safe**.
- Ranking uses a scorer checked against a **44-case golden file** (220 result rows) in milliseconds,
  because it is pure and depends on nothing. On that benchmark the shipped weighting yields **31
  pre-select, 10 confirm, 3 no-match, and zero false auto-accepts** — the last number is the one the
  test asserts, because a confidently wrong save is the failure this product most fears.
- A provider call is capped at **5 seconds**, added after a real five-candidate import sat on a
  spinner for 47 seconds against an exhausted quota. One **narrowed retry** is allowed, gated
  strictly on a first no-match: retrying with a narrowed query unconditionally was measured and
  rejected, because "Cafe Fiori" → "Fiori" silently changes *which venue is saved*, both scoring
  1.000.
- **Resolution never fails an import.** An unresolved name degrades to an honest row the user can
  fix, marked as a pin taken from the caption rather than a place database — eight unresolved names
  beat a failure screen. The asymmetry is deliberate: reading the post is the *only* stage that can
  hard-stop an import, because with no text there is nothing to show.
- **No coordinate is ever invented.** A candidate that neither the model nor the resolver could place
  is skipped, not dropped onto a city centre.
- **The quota is honest in the interface.** When the daily provider allowance runs out, the review
  screen says so in the user's terms — *"We've used up today's place lookups, so N of these pins come
  from the captions rather than a place database"* — rather than silently degrading every pin for a
  reason unrelated to quality.

### 5.5 Place identity and de-duplication

- Venue facts live in a **shared `places` table**; everything a person writes lives on their own
  `saved_places` row — their name for it, note, tags, dishes, category override, visit state.
- That split is what makes a shared table safe, and it is what makes **one physical place one row**
  regardless of how many videos pointed at it.
- **Identity is decided in three tiers**, inside one database function that is the sole creator of a
  `places` row:
  1. **Exact provider alias match** on `(provider, provider_place_id)`, then walk any merge chain to
     the surviving row. This is the real rule whenever Google resolved the candidate.
  2. **A 75-metre near-duplicate guard**, requiring *all three* of an identical normalised name key,
     the same country code, and a distance within 75 m. A bounding box narrows first; an advisory
     lock is taken **before** the probe read, which is what makes the guard hold under concurrency
     rather than being merely advisory.
  3. Otherwise a genuinely new place, with the alias inserted so a concurrent loser adopts the
     winner's row rather than minting an orphan.
- Merging is **repair-only and never destructive**: the loser keeps a permanent tombstone pointing
  at the survivor.
- **The known gap, stated rather than hidden.** A candidate no provider could resolve has no
  provider id, so its identity is synthesised from the caption-verbatim name plus city and country —
  deliberately from the *raw* name rather than the model's inferred one, because the inference is
  unstable across runs (the same caption produced "Kiaans" and then "Kiaans Tooting", minting two
  rows). Even so, model coordinates drift a **median 327 m** between two runs of the same caption —
  noise four times the merge radius — which leaves a small number of duplicate pairs no distance
  guard can reach. Widening the radius was measured and rejected, because two genuinely different
  venues collapsing into one is a worse failure than a visible duplicate. **The real fix is a
  canonical provider id, and it is deferred, not cancelled.**
- **Provenance is enforced by a deferred database trigger**, not by application discipline: a save
  whose origin is `import` and which carries no source link is rejected by Postgres, forever. You
  may detach one of three sources; you cannot detach the last one.
- **Re-pointing a save to a different venue clears what stopped being true** — the caption quote,
  the tags, the model's prose, the dishes — in the same statement, while the source link survives
  unconditionally, so "you saved this from @handle" stays true.

### 5.6 Retrieval and organisation

- Interactive vector map (MapLibre GL 6.4 on keyless CARTO tiles), one map instance created once and
  never destroyed as the user moves between the map, the collections index and a collection.
- Category-coloured pins, area and country grouping, camera framing over the whole library.
- A saved-places drawer with **text search, category filter, pressable tag chips, and a been /
  not-been filter** — all client-side over the array already sent, so pins and list cannot diverge.
- **Natural-language search**: a typed sentence becomes structured filter values, clamped twice —
  once on the server against the closed taxonomy, once on the client against its live facets.
- Place detail with the source video, and a link out to the original post.
- Collections as an alternative scope over the same map.
- Light and dark themes.

### 5.7 Security and permission capabilities

This is the part of the product we would most want examined.

- **Authorisation is row-level security in Postgres, not `if` statements in TypeScript.** RLS is
  enabled and **forced on all 17 tables**. An application check protects the queries you remembered
  to guard; a policy protects the table.
- The **anonymous role holds no grant on anything** and is named by no policy.
- Per-user tables filter on `auth.uid()`. Shared tables are membership-gated: you can read a `places`
  row only if you have a save pointing at it, or it sits in a collection you belong to.
- **Users hold no insert, update or delete grant on any shared table.** Those writes go through
  database functions. `saved_places` uses **column-level** grants, so "give my save to someone else"
  is not expressible before any policy is even consulted.
- **The trust boundary at confirm**, and it came from a real bug: an earlier version took the name
  and coordinates from the request, and because `places` rows are shared, that let one request
  rename and relocate a venue other people had saved. The browser now sends indices only.
- **Proved, not asserted.** Eight SQL policy-test files carrying **293 assertions** run a second real
  user against the first user's rows. Each file asserts the *positive* half first — that A reads
  exactly their own rows — because "B sees zero" is equally satisfied by a database where nobody can
  read anything. They test **forgery** as well as reading.
- **An executed attack run**, as a second real signed-in account against a 60-save victim and as an
  anonymous visitor: **seventeen attempts, every one returned zero rows or was denied.**
- **Secrets are server-only and build-enforced.** Any module holding a secret imports `server-only`,
  so a key that would reach the browser bundle **fails the build** rather than shipping quietly.

### 5.8 Engineering capabilities that carry product guarantees

| Capability | What it buys the product |
|---|---|
| **Four layers, linter-enforced** — `domain/` depends on nothing | The parts a wrong answer actually damages (scoring, plausibility, URL classification) are testable in milliseconds against fixed inputs. Swapping the resolver was one new adapter file and zero domain changes |
| **A closed taxonomy of 13 error codes**, each with one constructor and one HTTP status | The wire carries a code and two booleans — never a provider message, status or stack. Adding a fourteenth fails a test unless you show how it can happen |
| **Zod at four boundaries** — the pasted URL, the oEmbed response, the model output, the confirm body — plus `jsonb` re-parsed on read | Every untrusted input is parsed, including our own stored JSON |
| **No client state library** | Persisted data is read in Server Components; which drawer is open lives in the URL; after a mutation the server re-renders. There is no client cache to keep in sync |
| **`Clock` as a port** | `Date.now()`, `setTimeout` and `Math.random` inside `domain/` are a bug rather than a shortcut |
| **Logging carries no caption and no coordinate** | Event name and scalar fields only |

**Test posture (Measured):** 4,087 unit tests green across 250 unit files, 29 static component files
and 105 source-contract files; 58 Playwright end-to-end tests at a phone size and a desktop size; 293
database policy assertions. **No coverage percentage target, on purpose** — a percentage pushes
effort toward whatever is cheapest to cover, which is never the seam that breaks.

**And what the tests cannot tell you**, stated rather than buried: 105 of 250 unit files assert
against *source text*, which proves the code says something rather than that the running app does it;
no component test is evidence about layout, size or contrast, because a static HTML string has no
CSS; and no automated test here can tell you the map opens somewhere useful. That is why the working
agreement requires running the real app and reading the saved rows before anything is called done.

### 5.9 Deliberately not built

Each is something a reviewer might expect to find, left out for a reason.

| Not built | Reason |
|---|---|
| A job queue | The two tables we need anyway — `imports` and `extractions` — already are the persistence a queue would have required |
| Redis | `sources` and `extractions` are the cache, inside the source of truth. A second store is a second thing that can disagree |
| A REST API over our own database | RLS is already the authorisation layer; an endpoint in front of it is a second place to get permissions wrong |
| PostGIS | The selective filter is always `user_id`, never geometry. A personal library is small enough that distance is computed after the rows are narrowed |
| The streaming import route | Designed as one NDJSON stream; what ships is **two honest request/response round trips**, so the post is on screen in about a second while extraction runs underneath. The rail claims no stage the server did not send |
| Audio or on-screen-text reading | Cost and latency, not design. `ContentExtractor` is already an array of adapters, so an ASR or OCR analyser is a second implementation and no other stage changes. V1's array length is one |
| Data export | No export or download surface exists. The most obvious portability gap for a version with real users |
| **Keeping unplaced mentions** | The table, its permissions and its policy tests ship; **no screen reads or writes it.** A post can name something we cannot map, and the design for keeping that honestly exists — the feature does not. Stated because a reviewer will find the table |

### 5.10 Known limits and the roadmap they imply

Stated in the order we would fix them.

1. **The ceiling is a provider quota, not the database — and there is no rate limit on the import
   route.** Google Places is capped at 100 lookups per day for the whole project, and one import can
   spend up to eight: **12 to 50 imports a day for everyone combined.** The model allowance is 500
   calls a day and is shared between extraction and natural-language search, so search competes with
   importing for the same budget, and **nothing in the code counts what has been spent.** Two routes
   are rate-limited — natural-language search, and thumbnail refresh, which also holds a durable
   per-source cooldown in Postgres — but **the import route is not one of them.** *Raise the quota,
   then add a per-user daily import cap: the table and index a limiter needs already exist and
   nothing uses them.*
2. **Cost per import is known and is dominated by our own prompt.** Measured at roughly **4,880
   input tokens per import**, of which about 83% is the system prompt — paid on every import,
   including the majority that find nothing. That is **$0.0059 per import** on the Anthropic model
   and **$0.0020** on the Gemini one. Shortening the prompt is the cheapest available saving.
3. **The import is one long request** with no maximum duration set or measured. Ship the streaming
   route so a long import shows progress instead of timing out with nothing saved.
4. **Read on-screen text.** The single change that moves the caption-only limitation, with the port
   already in place.
5. **Re-resolve model-guessed places**, so a place saved from a caption pin is upgraded to a real
   provider identity when the provider can later answer — which is also what closes the duplicate
   pairs in §5.5.
6. **No pagination on the map read.** Deliberate: the camera must frame the whole library on first
   paint, the list must agree with the pins, and search must find an off-screen place. Measured at
   about **1.3 KB per saved place** — 100 places is ~180 KB, 1,000 approaches a megabyte. Pagination
   was measured to do about 2.5× less work; the fix is ready and not yet needed.
7. **The rate limiters that do exist are in memory** — they reset on deploy and do not span
   instances, so the true ceiling is multiplied by the number of warm instances. Honest about what
   they are: a brake on a stuck client, not a security control. The one instance-independent bound
   is the per-source cooldown that lives in Postgres.

**Accepted risks, each graded and reasoned in `docs/security.md`:** no rate limit on the import
route (accepted while sign-up is closed and the population is the owner plus an examiner); no
content-security policy and a non-`HttpOnly` session cookie (an attacker would need an XSS first,
and no injection path exists — React escapes by default and no third-party HTML is rendered);
captions retained indefinitely with no deletion path (a legal gap, not a technical one); in-app
TikTok playback handing TikTok a long-lived identifier (user-triggered, reversible, and refusing it
is a measured zero-request path); the identity provider's default six-character password policy.

**No exploitable cross-user vulnerability was found.**

---

## Appendix — the technology, and why each piece is there

| Thing | Version | Why this one |
|---|---|---|
| Next.js App Router | 16.3.1 | Server Components read Postgres directly under the user's token, removing a whole API layer |
| React | 19.2 | The component model |
| TypeScript strict | 6.0.3 | `exactOptionalPropertyTypes` is on, so "absent" and "null" cannot be confused; strict mode is what makes the error union closed |
| Supabase Postgres + Auth | js 2.112 | Authorisation lives next to the data; `auth.uid()` inside every policy is what lets RLS *be* the authorisation layer |
| Vercel | — | Deploy from `main`, a preview per branch, an encrypted env store |
| MapLibre GL | 6.4.1 | Vector, fast on a phone, controllable frame by frame, **no per-view billing** |
| CARTO basemaps | — | Keyless vector style: no secret, no quota, no key to rotate, tiles never touch our server |
| Zod | 4.4.3 | Parses everything we do not control |
| Gemini / Anthropic | REST | Caption → schema-constrained JSON, behind one port |
| Google Places | REST | Name → real coordinates, provider id and category |
| Tailwind CSS | 4.3.3 | Styling without a parallel stylesheet per component |
| motion / vaul | 13.1.1 / 1.1.2 | Transitions with reduced-motion support; the bottom sheet with real drag physics |
| Vitest / Playwright | 4.1.10 / 1.62.1 | Unit and browser tiers |

There is **no Anthropic SDK and no Google client library** in `package.json` — both integrations are
a single `fetch` against the documented REST endpoint, deliberately, so retry, timeout, abort and
error-mapping behaviour is ours and is visible.

**Deployed:** <https://no-crumbss.vercel.app>, rebuilt from `main`. `/healthz` reports the stage and
the exact commit running, and reveals no configuration.
