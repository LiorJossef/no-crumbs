# Presentation deck — No Crumbs

> **The deliverable for M11 and M12 item 10.** 10–15 minutes, followed by short interview-style
> questions. Submission: **6 September 2026**.
>
> This file replaces [`presentation-outline.md`](presentation-outline.md) as the thing you build the
> slides from and speak. The outline stays as the record of how the story was first shaped; it is
> now a pointer to this file. The study guide for the questions afterwards is
> [`how-the-system-works.md`](how-the-system-works.md) — read that the night before, not this.
>
> **Written 2026-09-02 against commit `bb6feee` on `no-crumbs-implementation`.** Every number below
> carries where it was measured. Anything not measured is left as `NUMBER NEEDED:` or
> `STATUS NEEDED:` rather than rounded into a claim.

---

## The one rule for this deck

**Every number you say out loud is one that was measured, and you can say where.** The rubric rewards
quality of thinking, and the strongest thing this project has is that it knows its own ceiling and
designed around it. Do not hide the 27%. Lead with it, on purpose, on slide 5.

Second rule, from [`voice-and-vocabulary.md`](voice-and-vocabulary.md) §1: **the name is the only
joke.** Confident and plain everywhere else. No "no crumbs left", no puns. Say *place*, *your map*,
*a TikTok link*, *found*, *reading*, *matching* — not *POI*, *extraction*, *pipeline*, *LLM*,
*geocode*.

---

## Timing

**14 slides, 13 minutes.** Two minutes of margin inside the 10–15 window, which you will need,
because the demo is the only slide that can run long.

| Block | Slides | Minutes |
|---|---|---|
| The problem, the product, the user | 1–3 | 2.5 |
| The demo | 4 | 2.0 |
| The measured ceiling | 5 | 1.0 |
| How it is built | 6–8 | 3.5 |
| Database, security, tests, scale | 9–12 | 3.5 |
| What is not built, and what is next | 13–14 | 1.25 |
| | | **13.75 → rehearse to 13** |

**Rehearse the demo twice on the deployed URL, on a phone, on a network that is not yours.**

---

## Before you build the slides — two things to settle first

These are not slide content. They are decisions the deck depends on, and both are open today.

1. **Which build the demo runs against.** Production serves `main`. The branch
   `no-crumbs-implementation` is **417+ commits ahead of `main`** (`current-state.md`, measured
   2026-09-02) and PR #109 has not landed, so the live URL does **not** currently carry the product
   name, the mark, or the 2026-09-02 UI work. **DECISION NEEDED:** either land the branch before the
   6th and demo the deployed URL, or demo locally and say plainly that the deployed URL is one
   version behind. M5 and M10 require a working public URL either way, so `/healthz` and sign-in on
   the live URL must be shown regardless.
2. **`PLACE_RESOLVER` on production.** `current-state.md` open question 7 asks whether Google is
   switched on in production. Slide 7 says the ToS gate exists and what it does; it must **not**
   claim production is compliant until that variable has been read. **STATUS NEEDED.**

---

## Slide 1 — The problem

**On the slide**

> You save a TikTok because of a restaurant.
> Two months later you are on that street and you cannot find it again.

One line. No product name, no logo, no screenshot of the app.

`ASSET NEEDED:` a screenshot of a real TikTok saved-videos grid on a phone — a wall of thumbnails
with no names, no places, no search. Shoot it from your own account, crop out anything identifying.
This is the whole problem in one image and it is the only image on the slide.

**Speaker notes — 0:45**

I want to start with the thing that actually happens to me. I save TikToks because of places —
a restaurant, a bar, a coffee place. The save works. The retrieval is what fails. Two months later
I am standing on that street and what I have is a chronological grid of thumbnails with no names in
it. There is no search that helps, because the name of the place was never written down anywhere I
can search. So the save was real and the place is still lost.

That is the gap I built for. Not discovery — there is no shortage of recommendations. Getting back
to the one you already chose.

---

## Slide 2 — What it is

**On the slide**

The name and the mark, and one sentence:

> **No Crumbs** — paste a TikTok link, and the places it names land on your own private map.

Beneath it, six words that are the actual product:

> Organised by **where**, not by **when**.

`ASSET NEEDED:` the mark, rendered from `src/app/icon.svg` at presentation size. The rendered design
system with the mascot set is `docs/no-crumbs-design-system.html` if you want a second treatment.

`ASSET NEEDED:` one screenshot of `/map` on a phone viewport (390×844) with a real library of pins
across more than one city. Signed in, drawer at rest, no dev tools visible.

**Speaker notes — 0:45**

This is No Crumbs. You paste one TikTok link. It reads the post, works out which places the post is
recommending, matches each one to a real venue with real coordinates, shows you what it found, and
saves only what you confirm. Then it is on your map, with the link back to the post it came from.

The sentence I would keep if I could keep only one: a saves folder is organised by *when*; this is
organised by *where*. That is the whole conversion, and it is why retrieval goes from scrolling for
minutes to a glance at a map.

---

## Slide 3 — Who it is for, and why it has business value

**On the slide**

- **The user**: one person, two questions — *"what did I save around here?"* and *"what do I already
  have in this city?"*
- **The customer**: in V1, the same person. The course document permits that framing.
- **The value**: an unstructured chronological list becomes a geographic index. Retrieval collapses
  from minutes of scrolling to seconds on a map.
- **What it deliberately is not**: it recommends nothing, it has no social graph, and it is not an
  itinerary planner.

**Speaker notes — 1:00**

The user is one profile with two retrieval questions, and they come from the same person on
different days: the everyday one, *what did I save around here*, and the trip one, *what do I
already have in this city*. The product answers both from the same rows.

The customer, in this version, is the same person. The course document allows that, and I did not
want to invent a monetisation story I have not tested.

The business value is a conversion, and it is the reason this is worth building at all: the value is
already sitting in the user's saves, and it is unreachable because it is filed by time. Filing it by
place makes it reachable.

The last line matters as much as the others. I wrote down what this is not, early, and held it: no
recommendations, no social graph, no trip planner. That is not modesty, it is the scope contract —
Charter §4 — and it is the reason the thing that does exist works end to end.

---

## Slide 4 — Demo

**On the slide**

Nothing but a heading. Do not put a checklist on screen you then read from.

`ASSET NEEDED:` **two demo links, chosen and tested in advance** — one TikTok whose caption names a
venue and reliably resolves, one whose caption names nothing. Test both against the exact build you
will demo, on the day. Have screenshots of all three outcomes as a fallback deck slide in case the
network fails, and say you are falling back if you use them.

**Speaker notes — 2:00**

*Do these three in this order and do not improvise.*

1. **The link that works.** Paste it. The post itself is on screen in about a second — the thumbnail,
   the handle, the caption — while the reading happens underneath. Then the review screen: here is
   what it found, here is what it matched each one to. Nothing is saved yet. I confirm, and it lands
   on the map.
2. **Retrieval.** Open the list. Search. A category filter. Open one place — its name, its category,
   its coordinates, my note, and the link back to the post that recommended it. That is the whole of
   what we store, and I will come back to why.
3. **The link that finds nothing.** *Say this out loud before you paste it:* this next one is not an
   accident and it is not an error. It is the most common thing that happens. Paste it, let the
   "no places in this one" screen appear, and show the recovery — add the place by name, because I
   watched the video and I know where it was.

That third step is the slide I am proudest of and it is why the next slide exists.

---

## Slide 5 — The number I am not hiding

**On the slide**

> **A place is found in roughly a quarter of posts.**
> 3 of 11 hand-labelled recommendation posts named a venue in the caption — `04-tiktok-feasibility.md` §4.
> Over my own saved TikToks: **about 81 of 113 name no venue in the caption at all** — `spec-no-places-found.md`.

Then, in bigger type:

> So **"no places in this one" is the most common outcome of an import.**
> Which is why it is a designed screen with its own specification, not an error path — and why
> `NO_PLACES_FOUND` is deliberately not one of the 13 error codes.

**Speaker notes — 1:00**

Here is the number. In about a quarter of genuine recommendation posts, the caption names a place we
can find. I want to be precise about how well I know that: it is 3 of 11 posts I labelled by hand,
which is a small sample with a wide interval. The bigger check is my own account — of 113 TikToks I
had saved because of a place, about 81 have no venue anywhere in the caption.

The reason is a property of the content, not a bug in my code. Creators put the venue name *on
screen* and *in speech*, because that is what the feed rewards, and they put hashtags in the
caption, because that is what search rewards. I read the caption.

So the most common outcome of an import is that we find nothing. Once you know that, treating it as
an error is the wrong design — it would poison every log, every metric and every screen with a
failure that is actually the normal case. It gets a designed screen with its own spec, and it offers
the one recovery that works: you watched the video, so add the place by name. The code carries the
same decision: "no places found" is not a member of the error type at all.

---

## Slide 6 — The architecture, and the rule that holds it

**On the slide**

```
src/ui/, src/components/   presentation                    → may import domain/
src/app/                   Next.js routes, actions, auth   → may import anything
src/domain/                pure TypeScript                 → imports nothing but itself
src/integrations/          one adapter per port            → may import domain/ types only
```

> `domain/` may not import React, Next, Supabase or any vendor SDK — and **ESLint fails the build
> if it tries.** `npm run check:layers` writes a deliberate violation, asserts the rule rejects it,
> deletes it, then greps `domain/` for I/O independently of ESLint.

Small print on the slide, because they will find it: the guard covers three of the directories under
`src/`; `components/` and `lib/` are outside it and are held by review.

**Speaker notes — 1:00**

Four layers, and the only rule that really matters is that the domain layer depends on nothing. No
React, no Next, no Supabase, no vendor SDK. A "port" here is just a TypeScript interface — there is
no dependency-injection framework, a port is a function parameter.

What that buys is concrete rather than architectural taste. The scoring code is checked against a
44-case golden file in milliseconds with no network and no database. And when I swapped the places
provider for Google, it was one new file in `integrations/` and zero changes in `domain/`.

It is a checked property, not a convention. The layer guard writes deliberate violations into the
tree, proves the lint rule rejects each one, removes them, and then greps the domain tree for I/O
separately — so switching off the lint config alone does not open the door. And I will say the gap
before you find it: the guard covers three directories, not all seven. The other two are held by
review.

---

## Slide 7 — What actually happens when you paste a link

**On the slide** — one row per step, and **name the file**:

| # | What happens | Where |
|---|---|---|
| 1 | The link is classified in the browser | `domain/source/canonicalise-tiktok-url.ts` |
| 2 | **Round trip 1** — fetch the post so it is on screen in ~1s | `app/api/imports/source-preview/route.ts` |
| 3 | The URL is re-validated **server-side** — this is the SSRF gate; the browser's check does not count | same canonicaliser, called again in the route |
| 4 | The post is read through TikTok oEmbed, cached in `sources` | `integrations/tiktok/oembed-source-adapter.ts` |
| 5 | The caption becomes text for the model | `integrations/tiktok/caption-content-extractor.ts` |
| 6 | A schema-constrained model call returns candidate places | `integrations/llm/anthropic.place-extractor.ts` |
| 7 | Candidates the caption does not support are dropped **before any paid lookup** | `domain/extraction/plausibility.ts` |
| 8 | Each candidate is matched against Google Places and ranked into a confidence band | `domain/import/resolve-candidates.ts` → `domain/places/score.ts` |
| 9 | The user reviews. **Nothing is saved yet** | `app/import/screens/review/review-screen.tsx` |
| 10 | Confirm → `resolve_place()` then `save_place()` | `app/api/imports/confirm/route.ts` |

`ASSET NEEDED:` a simple left-to-right figure of the same ten steps, so the table is a fallback and
the figure is what is on screen. Boxes and arrows, no styling effort.

**Speaker notes — 1:15**

This is the process the whole product is, and I can name the file for every step.

The link is classified in the browser, then re-validated on the server — and that second check is the
one that counts, because it is the gate that stops a user-supplied URL sending our server somewhere
it should not go. A host that merely *ends* in tiktok.com fails closed, and every redirect hop is
re-checked.

We read the post through TikTok's public oEmbed endpoint. That is the only officially supported read
mechanism I could verify — 16 out of 16 real public posts from a server, no auth, no key, p90 626
milliseconds. The caption goes to the model with a versioned prompt and comes back as JSON against a
fixed schema. Anything that survives the schema still has to pass a plausibility check, which drops
candidates that name only a city or a country — that check is there before we spend money on a
lookup, not after.

Then each candidate is matched against Google Places and scored into one of three confidence bands.
Then the review screen, where nothing has been saved yet. And only on confirm do we write.

---

## Slide 8 — Three decisions worth defending

**On the slide**

**1. TikTok only — because it is the only VERIFIED access mechanism.**
16/16 posts, server-side, no auth, no key (`04-tiktok-feasibility.md`). Instagram and YouTube were
investigated to a Deferred verdict. A pasted Instagram link is a *recognised redirect to add by
name*, never a failure screen.
Every third-party claim in this project is labelled **VERIFIED / ASSUMED / UNAVAILABLE**, with the
evidence in `docs/evidence/`. Design may only depend on VERIFIED.

**2. Google Places, and a licence gate written as code.**
Google won the measurement: **15 of 16 top-1**. But its Service Specific Terms §5.3 forbid pairing
Google Places content with a non-Google map, and our map is MapLibre. So the gate is code
(`place-resolver-factory.ts`), not prose, and an unknown or unset stage counts as production — it
fails safe.

**3. Why a places provider at all, when the model will happily give coordinates.**
Because it did, and they were **65–470 m out, and 541 m apart between two runs of the same caption**.
That is a pin on the wrong street. When the resolver genuinely cannot match, the save is marked
`llm_guess` rather than dressed up as resolved.

`ASSET NEEDED:` a screenshot of the `docs/evidence/` tree — a file listing is enough. The point is
that the labels have files behind them.

**Speaker notes — 1:15**

Three decisions, and each one has a loser I can name.

TikTok only. That is not a narrowing of the idea, it is the only platform whose content access I
could actually verify — sixteen out of sixteen public posts, from a server, with no key and no
login. What lost was multi-platform breadth, which in practice would have meant scraping or four
half-working integrations. And because that boundary is a product fact rather than a bug, an
Instagram link is recognised by name and sent to add-by-name, not to a failure screen.

That connects to a rule I held all the way through: every claim about somebody else's service is
labelled verified, assumed or unavailable, with the evidence in the repo, and I am only allowed to
design against verified. A lot of this project's shape comes from that one rule.

Second, Google Places. It won the measurement — fifteen of sixteen first-place matches. But its
terms forbid showing Google Places content on a non-Google map, and my map is MapLibre. So there is
a gate. What I want to point at is that the gate is *code*, not a sentence in a document, because a
documented-only rule is one refactor away from gone — and if the environment does not say which
stage it is, it assumes production and withholds.

Third, why use a places provider at all. Because I tried the cheap version. The model's own
coordinates were between 65 and 470 metres out, and two runs of the same caption disagreed with each
other by 541 metres. For a product whose entire job is "the pin is where the place is", that is
useless. And when the resolver genuinely cannot find a match, we mark the save as a guess rather
than making it look resolved.

---

## Slide 9 — The database, and the one split that explains everything

**On the slide**

**Shared between users** — written only by the trusted server; a user holds `SELECT` and nothing
else: `sources`, `extractions`, `places`, `place_provider_refs`, `poi_index`.

**Per user** — `saved_places`, `place_mentions`, `collections` and their members, items and invites.

> A second user saving the same restaurant adds **no** new `places` row. Place identity is shared,
> because a venue is a fact about the world. Everything a person *thinks* about that venue — the
> note, the category override, been / not been yet — is theirs.

> **One human role.** No admin, no moderator, no support login. That is a decision: an admin who can
> read every user's map is the single biggest privacy liability a product like this can have.

`NUMBER NEEDED:` migration count and table count on the day. Measured 2026-09-02: **36 migration
files on disk** (`0001`–`0037`, `0027` does not exist). `security.md` counted **17 tables in
`public`** at migration `0035`. Re-read both before saying either.

**Speaker notes — 1:00**

The schema is organised around one split, and it is the split that explains the security model too.

Some tables grow with the number of users. Some grow with the number of real things in the world. A
restaurant is a fact about the world, so `places` is shared — if you and I both save the same
restaurant, there is one row, not two. Anything that is your opinion about that restaurant — your
note, your category, whether you have been — lives on your own row and never leaves it.

The shared tables are written only by the trusted server. A signed-in user can read a place, and
only a place they have actually saved, and only certain columns of it.

And there is exactly one human role. No admin. That is deliberate, not an omission: an admin account
that can read everybody's saved places is the worst thing this product could contain, and no feature
needs one.

---

## Slide 10 — Security: the boundary is in the database

**On the slide**

- **RLS enabled *and forced* on every table.** `FORCE` is not decoration — without it the table
  owner is exempt from its own policies.
- **Authorisation is policies, not `if` statements.** A caller-supplied filter can only narrow a
  result set, so `?user_id=eq.<someone else>` returns zero rows, not theirs.
- **Column-level grants make some attacks inexpressible.** `saved_places` grants `UPDATE` on five
  overlay columns only, so "move my save onto someone else's place" fails at the privilege layer
  with `42501` before any policy is consulted. A collection's `owner_id` is not grantable to
  *anything the application can reach*.
- **The trust boundary at confirm** — the one to volunteer if they do not ask: **the browser sends an
  index, not a fact.** It sends an extraction id, a candidate index, an option index and a note. The
  server re-reads its own stored row and derives every place fact from it. `authenticated` holds no
  write grant on `extractions.candidates` at all, so a shortlist in that column can only have come
  from our own route.
- **An SSRF gate** on a user-supplied URL: host allow-list before the first request, re-applied at
  every redirect hop, with a hop budget.
- **Untrusted content**: the caption is attacker-controlled text going to a model. The model has no
  tools and no side effects, and its output is schema-checked and substring-checked against the
  caption.
- **Risks that remain, said out loud**: no rate limit on the paste endpoint; a six-character minimum
  password (the provider's default); stored captions have a retention question that is open.

**Speaker notes — 1:00**

The one thing I would want remembered about this system is that authorisation is in the database,
not in the application. An application check protects the queries you remembered to guard. A policy
protects the table. There is no way to test for the `where user_id = ?` clause you forgot to write.

Row-level security is enabled and forced on every table. Forced matters — without it the owner of
the table is exempt from its own policies, and then every assertion depends on which role happened
to run the query.

On top of the policies there are column grants, and that is the part I would defend hardest, because
it makes certain attacks not merely refused but impossible to express. You cannot give your save
away or move it onto someone else's place, because those columns are not grantable — you get a
privilege error before any policy is even consulted. Two independent controls, so a bug in one does
not open the other.

And the piece I am proudest of: there was a real exploit here and it changed the contract. Because
`places` rows are shared, any place fact the browser can send is a place fact the browser can forge.
So the browser does not send facts. It sends an index into a list the server itself wrote, and the
server derives everything from its own row. The database grants are what make that the only possible
path, rather than a rule somebody has to remember.

Then the things that are still open: no rate limiting on the paste endpoint, a weak password minimum
that comes from the auth provider's defaults, and an unresolved question about how long we should
keep cached captions at all.

---

## Slide 11 — Tests

**On the slide**

| Layer | What it proves |
|---|---|
| Unit / domain (Vitest) | Every error code, every URL shape, every schema violation |
| Source-contract | Absences — that a screen contains no banned word, that a module imports nothing from a forbidden layer |
| End-to-end (Playwright, 4 browser projects) | Routing, focus, double-submit, stale responses, both breakpoints |
| Database policy (`psql`, real roles, real RLS) | A cross-user read returns **zero rows** — executed as a second real user |

> **The strongest artefact in the project**: `0035`'s `P7` adds a name column to `profiles` *inside
> the test transaction* and has a collection peer read it back — proving the design we rejected
> really would have leaked. **A policy test that cannot fail is worse than no policy test.**

`NUMBER NEEDED:` re-run and re-count on 5 September, and say the real number including failures.
Measured 2026-09-02 on `no-crumbs-implementation`: **219 test files, 3,540 passing, 9 failing** —
the 9 are inherited from commit `abc1771` and are named in the handoff. Playwright, from
`test-specification.md`: **56 tests over 13 spec files, 4 projects**. SQL policy suites, executed
2026-09-01 against the live local database at `0035`: `0024` (43), `0031` (38), `0032` (34), `0034`
(17), `0035` (21) — **153 assertions passing**; the sixth suite, `0008` (85 assertions), passes only
against a freshly reset database, which is a defect in that test, not in the policies.

`STATUS NEEDED:` **what to say about CI.** Do not repeat the outline's "the runner has not started
since 29 August" — `current-state.md` records that as **stale**: runners work, CI was red for two
small real reasons that were fixed, and the owner then took CI out of scope. `.github/workflows/ci.yml`
is present and active with four jobs. Confirm the true state on the day and say that; the honest
fallback sentence is "the gate that runs today is `npm run verify` locally, which is lint,
typecheck, layer guard, migration grants, schema check and the unit suite."

**Speaker notes — 1:00**

I did not test for coverage, I tested for the failures that would actually hurt. There are eleven of
them written down, and the top three are: one user reading another's rows, a confidently wrong match
that the user drives to, and an invented place the caption never mentioned.

The unit tests are exhaustive where the input space is small and the cost of being wrong is high —
every error code, every URL shape, every schema violation. There is a category I would point at
specifically: tests that assert an *absence*, like a screen containing no banned word, or a module
importing nothing from a forbidden layer.

The permission tests are SQL, running as two real users against real policies, and they assert that
the second user reads zero rows. And the property that makes them worth anything is that they can
fail. One of them adds a column inside the test transaction to prove the leak we designed away from
was a real leak. I have also caught tests in this project that were passing with the thing they were
testing switched off — that is recorded in the file where it happened, because a policy test that
cannot fail is worse than not having one.

*Then give the real numbers, including the failures. Do not round the nine away.*

---

## Slide 12 — Scale: what breaks first is not the database

**On the slide**

In the order it will actually happen:

1. **The Google Places daily quota — 100 lookups a day, which is roughly 12–50 imports a day across
   the whole product.** Today. It is a billing change, not a code change.
2. **The import request's wall-clock time** on an import with several candidates — a per-request
   failure, and it arrives at one user, not at a hundred.
3. **The map payload, at roughly 500–1,000 places in one library.** Derived from a measured 1,306
   bytes per saved place: ~1.8 MB of payload at 1,000 places. **The database is still answering in
   under a millisecond. It is the browser that degrades.**

> **Nothing on that list is "the database at hundreds of users."**
> Measured on 30,008 `saved_places` rows across 200 users: the map read returns the reader's 150 rows
> in **1,052 buffers, 0.570 ms**. RLS is an index condition, not a post-filter.
> The same query with `limit 50` costs **402 buffers, 0.251 ms** — 2.6× less work, using an index
> that already exists and that today's unbounded query cannot use.

**The dangerous query, named:** `getSpots()` has no `LIMIT`, no `WHERE` and no viewport bound.

**Speaker notes — 0:45**

I measured this rather than reasoned about it, and the finding surprised me: the first thing to break
is not the database, and it is not close.

It is a provider quota. Google gives us a hundred lookups a day, which is somewhere between twelve
and fifty imports a day for the entire product. That is the real ceiling right now, and it is fixed
with a billing change rather than with code.

The database is nowhere on the list. At thirty thousand saved rows across two hundred users, the map
read returns one reader's hundred and fifty rows in half a millisecond, because the row-level
security predicate is being used as an index condition rather than as a filter after the fact. What
does degrade is the browser, at around five hundred to a thousand places in one library, because we
fetch the whole library on every render.

So I will name the query rather than leave you to find it: the map read has no limit and no viewport
bound. And the interesting part is that the index a paginated version would use is already in the
schema — it just cannot be used by a query that has to read everything anyway.

---

## Slide 13 — What is not built, plainly

**On the slide**

1. **The streaming import route does not exist.** The design calls for one stream with per-stage
   events. What ships is two honest request/response round trips, so the post is on screen in about a
   second while the reading happens underneath. **The progress rail claims no stage the server did
   not send.**
2. **`runImport` in `domain/import/pipeline.ts` is written and unit-tested but has no production
   caller.** The live path is the probe route's own `await` chain.
3. **No pagination and no viewport bound** on the library read (slide 12).
4. **The `llm_guess` → resolver upgrader does not exist** — a place saved from a model guess is never
   re-resolved later.
5. **The hosted databases are behind on migrations.** `NUMBER NEEDED:` re-measure before the 6th —
   last measured 2026-08-30, production `0026` and staging `0018`, against 36 files on disk.

**Speaker notes — 0:45**

Five things I would rather say than have found.

The streaming route is designed and not built. What ships instead is two round trips, and the reason
I am comfortable with it is that the progress rail never claims a stage the server did not actually
report — it is slower than the design, but it is not dishonest.

There is a pipeline module that is fully written and fully unit-tested and has no caller in
production; the live route does the same work in a straight line. I would wire those together first.

The map read is unbounded, the guessed saves are never upgraded when the provider could later answer,
and the hosted databases are behind the migrations on disk.

None of that is hidden anywhere. It is all in the state document in the repo, which is the file I
open at the start of every session.

---

## Slide 14 — What I would do next, in order

**On the slide**

1. **Measure the hit rate properly.** The 27% rests on eleven posts. Fifty of my own saved links,
   hand-labelled, *before* changing anything.
2. **Read more of the post.** The venue is on screen and in the audio. `ContentExtractor` is an array
   of adapters and V1's array has one entry — this is a cost and latency decision, not a design one.
3. **Ship the streaming route and wire `runImport`.**
4. **Bound the map read**, and add the missing index on `collection_invites`.
5. **Decide the retention question on stored captions.**

Closing line on the slide:

> The product is worth nothing at zero saved places. Everything else follows from that.

**Speaker notes — 0:30**

In order, and the order is the argument.

First, measure the thing I have been quoting — eleven posts is not enough to change anything against.
Fifty of my own, labelled by hand, before I touch the code.

Second, read more of the post. The venue is on screen and it is in the speech. The seam for that
already exists: the content reader is an array of adapters and today it has exactly one. That is the
single change that moves the number.

Then the streaming route, then bounding the map read, then the caption retention question.

And the sentence I would close on: this product is worth nothing at zero saved places. That is why
the first session has to end with places on the map, and it is why so much of the design effort went
into the outcome where we find nothing — because that is the one most people will hit first.

---

## The questions to prepare, in likelihood order

Full answers are in [`how-the-system-works.md`](how-the-system-works.md). Rehearse these out loud.

1. **"Walk me through what happens when you paste a link."** → slide 7, and name the files.
2. **"Why does it only work on a quarter of posts?"** → slide 5. Answer as a measurement, never as an
   apology.
3. **"What stops one user reading another's data?"** → RLS, forced, plus the test that asserts zero
   rows as a second real user.
4. **"`places` rows are shared — what stops me editing someone else's?"** → the browser sends an
   index, not a fact. There was a real exploit here and the contract was changed to close it.
   **Volunteer this one if they do not ask it.**
5. **"Why a places provider — couldn't the model give you coordinates?"** → it did: 65–470 m out, and
   541 m apart between two runs of the same caption.
6. **"Why is there a review screen instead of saving automatically?"** → the model is not always
   right and a wrong place in your library is worse than no place; a caption often names several
   venues and only some are the recommendation; and confirm is where the user takes ownership.
7. **"Why one route segment for the map and the collections?"** → the App Router unmounts the
   outgoing subtree on a segment change, which took the drawer and all its state with it.
8. **"What would you do differently?"** → slide 14, with the order justified.

## Before you present

- [ ] The deployed URL works on a phone, on a network that is not yours
- [ ] The two demo links are chosen and tested **against the build you will demo**
- [ ] Fallback screenshots exist for all three demo outcomes
- [ ] The repository opens for someone who is not you
- [ ] You can name the file for every step on slide 7 without the slide
- [ ] The numbers on slides 11 and 13 have been re-measured this week

---

## `ASSET NEEDED:` — the shooting list

| Slide | Asset | Notes |
|---|---|---|
| 1 | Screenshot of a TikTok saved-videos grid on a phone | Your own account, crop identifying detail |
| 2 | The mark at presentation size | Render from `src/app/icon.svg`; `docs/no-crumbs-design-system.html` for alternatives |
| 2 | Screenshot of `/map` at 390×844, multi-city library of pins | Signed in, drawer at rest, no dev tools |
| 4 | Two tested demo links — one that resolves, one that finds nothing | Test against the demo build, on the day |
| 4 | Fallback screenshots: review screen, place detail, no-places screen | Insurance against the network |
| 7 | Ten-step left-to-right pipeline figure | Boxes and arrows; the table is the fallback |
| 8 | Screenshot of the `docs/evidence/` tree | A file listing is enough |

## `NUMBER NEEDED:` / `STATUS NEEDED:` — open before the 6th

| Slide | What | Last known |
|---|---|---|
| — | Which build the demo runs on: has PR #109 landed? | Branch is 417+ commits ahead of `main`; production serves `main` (2026-09-02) |
| 8 | `PLACE_RESOLVER` on production — is Google live behind the ToS gate or not? | Open question 7 in `current-state.md`; **do not claim compliance until read** |
| 9 | Migration count and table count | 36 files on disk (`0001`–`0037`, no `0027`); 17 tables in `public` at `0035` |
| 11 | Unit test counts including failures | 219 files, 3,540 passing, 9 failing (2026-09-02) |
| 11 | SQL policy assertion total across six suites | 153 executed and passing across five; `0008`'s 85 pass only after a reset |
| 11 | What is true about CI on the day | The outline's "no runner since 29 August" is **stale** |
| 13 | Hosted migration state | Production `0026`, staging `0018`, measured 2026-08-30 |

---

## What changed from `presentation-outline.md`, and why

The outline's shape was good and most of it survives. Five substantive changes:

1. **The 27% moved from slide 13 to slide 5**, immediately after the demo. In the outline the
   honest ceiling was the second-to-last thing said, which reads as a confession at the end. Placed
   right after the demo — where the examiner has just watched a "no places" screen — it reads as the
   design premise it actually is, and it sets up slides 7 and 8.
2. **A slide was added for the trust boundary at confirm** (folded into slide 10). It was buried as
   prepared-question 4 in the outline. It is the strongest single piece of engineering in the
   project and it should not depend on being asked.
3. **The three provider decisions were merged into one slide (8)** rather than a list of external
   services. M3 asks for justification, not an inventory, and three decisions with named losers is a
   better answer than eight one-liners.
4. **The CI claim was removed.** The outline says "CI has not been able to start a runner since 29
   August". `current-state.md` records that as stale, and repeating a stale failure in a viva is
   worse than the failure. It is now a `STATUS NEEDED:` to settle on the day.
5. **Every stale number was replaced or flagged.** The outline's "165 files, 2,746 unit tests, all
   passing", "31 migrations" and "166 assertions across three files" are all superseded — the suite
   is larger, some of it is failing, there are 36 migrations, and there are six policy suites now,
   not three. Nothing that could not be re-derived from a document was kept.

Two things in the outline were deliberately **not** changed: the instruction not to open with the
logo, and the instruction to run the failing demo link on purpose and say so out loud. Both are
right.
