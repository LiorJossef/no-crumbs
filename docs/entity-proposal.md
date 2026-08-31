# Entity proposal — four new nouns, one refusal

> Owner: `product-lead`. Date: **2026-08-31**. Status: **a ruling and a specification**, not a plan
> and not a schema. Task ID `ENTITY-1`.
>
> Written against owner intent, verbatim: *"Introduce more entities, trips? be creative i expect at
> least 3-5 new entities."*
>
> **Base:** read against `1b79e9c` on `no-crumbs-implementation`. Written scope: this file only.
>
> **Nothing here is verified.** I have no shell. Every cost below is sized by reading the migrations
> and the documents; the done/not-done call stays with the orchestrator on `qa-reliability`'s
> evidence, and two of these proposals need a `security-privacy` ruling I cannot pre-empt or
> override (§7).
>
> Inputs: `00-project-charter.md` §1/§3/§4 · `mvp-plan.md` §2/§6/§8 · `product-ruling-after-the-save.md`
> §2/§4 · `growth-plan.md` §1/§4/§5 · `voice-and-vocabulary.md` §3 · `brand-and-product-foundation.md`
> §2/§6 · migrations `0003`, `0005`, `0006`, `0019`, `0024`.

---

## 1. The nouns the product already has

Stated first, because "a new entity" only means something against this list.

| Noun | What it is | Whose |
|---|---|---|
| `profiles` | a person | theirs |
| `sources` | one TikTok post | **global**, read through membership |
| `imports` | one paste event, with a 24-hour `candidates` payload | one user's |
| `places` | one physical place, deduped, provider-resolved | **global**, read through membership |
| `saved_places` | the user's overlay on a place: name, category, note, been/not-been, origin | one user's |
| `saved_place_sources` | which TikToks recommended this save | one user's |
| `collections` + members/items/invites | a shared, named set of places | multi-writer |

**What is missing from that list is the shape of the gap.** Every user-facing row above either *is* a
place or *points at* one. The product can represent a thing with coordinates and it can represent a
grouping of things with coordinates. It cannot represent anything else — and roughly three quarters
of what happens in the product produces something else.

## 2. The test each proposal had to pass

1. **What can the user not do today without it?** Not "what would be nicer".
2. **Is it a noun, or a filter wearing a noun's clothes?** A view over `saved_places` is a filter.
   §6 lists the four ideas that failed this test, by name, so nobody proposes them as entities again.
3. **Does the core loop get better, or merely bigger?** (paste → analyse → resolve → review → save →
   explore.)
4. **What is it tempted to assert?** The hardest constraint in this product is that no change may
   increase what it claims to know. An entity that implies a rating we did not measure, an itinerary
   we cannot verify or an "open now" we may not source is worse than none.

## 3. The four, ranked by product impact

| # | Entity | Genuinely new noun? | Level | Verdict |
|---|---|---|---|---|
| **E1** | **The mention we could not place** | **Yes** — nothing today can hold a thing without coordinates | **L2** | **Build this first** |
| **E2** | **The account that posted it** | **Partly** — the screen is new, the table probably is not | L2 (facet) / L3 (table) | Build the screen, not the table |
| **E3** | **A start point** | **Yes** — a private coordinate that is not a recommendation | **L2** | Build after E1 |
| **E4** | **A note entry** | Yes, but it is a field becoming a log | L3 | Deferred behind evidence |
| **E5** | **A trip** | **No** — a collection with two dates | — | **Recommended against** (§5) |

---

### E1 — the mention we could not place

**In the user's language.** Something a TikTok named that we could not put on the map, kept anyway,
with the link back to the post that said it. On screen: **`Not on the map yet`**, and the row shows
the post's own words in quotes.

**The job nothing does today.** At a ~27% hit rate the modal import outcome is *no places in this
one*, and **that outcome currently produces nothing at all**. The candidate the model found —
"that ramen place in Shibuya" — lives in `imports.candidates`, which is jsonb with
`expires_at default now() + interval '24 hours'`. The user's intent to save something is destroyed
on a timer. The same is true of a pasted Instagram or YouTube link: recognised, named, redirected —
and then gone.

**What the user cannot do today:** come back to a post they pasted and finish the job. There is no
row anywhere that says they tried.

**Two readings of what this is, recorded side by side because they schedule differently.** Mine is
above: a new entity, L2, competing with everything else at L2. The orchestrator's, put to me on
2026-08-31 and I think it is the stronger one: **this is the L1 import path being incomplete on its
most common branch.** `mvp-plan.md` §2 rules that *"no places found" is the modal import outcome, so
its screen is a core surface, not an error path* — and a core surface that discards its own content
in twenty-four hours is not a finished surface. On that reading E1 is not new scope at all; it is
the cheapest remaining fix to the thing users hit most often.

**I am not adjudicating between them, and neither is the orchestrator.** The two readings agree on
every design decision below and disagree only on whether this work sits inside L1 or competes at L2,
which is a schedule call six days from the deadline. That is the owner's (`working-agreement.md` §7)
and it goes to them with both framings. §9 is written under mine, which is the conservative one; if
the owner takes the completeness reading, E1 moves inside L1 and §9's precondition does not apply to
it.

**Why it is first.** It is the only proposal here that touches the loop's *modal* path rather than
its happy path, and it is the only one that helps the delayed-value problem I own: at 73% failure, a
first session today can end with a user having pasted six links and holding zero places and zero
records of having tried. With E1 it ends holding six mentions and a prefilled manual-add on-ramp for
each — which is the deterministic zero-failure path `growth-plan.md` §5 item 4b already names, given
something to start from.

**Shape** (enough to derive a schema from; the schema is `supabase-database`'s):

- Belongs to one user. Never global — unlike `sources` and `places`, this is not a shared fact.
- **The text the post used, verbatim and immutable.** Editing it would let a user rewrite provenance.
  The user's own words go in the `note` when it becomes a place.
- An optional city/country hint, **only if extracted**, never inferred. If the caption did not say,
  the field is null and the screen says nothing.
- Where it came from: a nullable FK to `sources` for the TikTok case, and a plain URL column for the
  case `sources` cannot hold at all — `sources.platform` is `check (platform in ('tiktok'))`, so an
  Instagram link has no `sources` row and never will. One entity, two producers.
- **Why it is not a place**, as a closed reason set — the same discipline as `imports.error_code`:
  no match · match too weak to offer · beyond the candidate cap · platform we do not read · skipped
  at review. Not free text.
- A terminal state, with a nullable pointer to the `saved_places` row it became. That pointer is
  what makes "you placed 4 of these" a fact rather than an estimate.
- **No relationship to `places`, ever.** This is the invariant that keeps the entity honest: a
  mention has no coordinates, is never a pin, is never counted in `N places`, and the moment it
  acquires coordinates it *is* a saved place and the mention closes.
- Independent of `imports.expires_at`. Surviving that expiry is the entire point.

**Day one.** The review screen gains a third action per candidate — save · skip · **keep for later**
— and the no-places screen gains a destination instead of three recoveries and a dead end. The
library gains one line: `3 not on the map yet`, and tapping one opens manual add with the name
already in the field.

**Before it earns a screen:** (a) `security-privacy` must rule on retention — see §7, this is a real
blocker and not a formality; (b) `ux-interaction` decides whether it lives inside the library sheet
or beside it, and owns the strings; (c) it needs its own resolution path from day one. An unbounded
pile of things you could not do is a second graveyard, and we already learned that lesson once
(`product-ruling-after-the-save.md` §1).

**What it is tempted to assert, and how it refuses:**

| Temptation | The refusal |
|---|---|
| That the named thing is a real place | Render the post's words in quotes. No category, no pin, no coordinates, no count in the library total |
| That we will match it later | No background retry, no "we'll keep trying", no queue. The user's action is the only thing that resolves it. This is also why there is no *job* here, in either sense |
| That an unreadable platform is "coming soon" | The copy states what is true today. `voice-and-vocabulary.md` §7 rule 1 |
| That the city hint is knowledge | Extracted or absent. Never inferred, never geocoded on the sly |

**Level: L2.** New table, new grants, RLS, a review-screen change, a library surface and a copy pass.
It is not small and I am not going to describe it as small.

---

### E2 — the account that posted it

**In the user's language.** Who posted the TikTok a place came from, and everything else you took
from them.

**The finding first, because it changes the size of this.** **The computation already exists and
already runs.** `creatorBreakdown` — places per creator — is computed at `profile-stats.ts:163` and
is rendered nowhere; the section that displayed it was deleted on 2026-08-30 and the computation
stayed (`growth-plan.md` §4). `sources.author_handle` is populated from the platform's authoritative
field and is granted to `authenticated`. **E2's screen is therefore not new work, it is connecting
work that already exists**, which makes it materially cheaper than its rank suggests — cheaper than
E3 and possibly the cheapest item on this page. It is ranked third on *impact*, not on cost.

**The job nothing does today.** The product has retrieval by identity (search) and by geography (the
map), and `product-ruling-after-the-save.md` §1 added retrieval by state and by proximity. There is a
fifth axis nobody in this category has, and we already hold the data: **retrieval by who
recommended it** — and no screen filters on it.

**The asymmetry, and it is the reason this is on the list.** We know which accounts a specific
person saved from *and which of those places they actually went to*. Nobody else holds both halves —
TikTok knows what you saved, and nothing knows what you did about it. `12 places · 5 been` beside a
handle is a sentence only this product can write.

**And here is the honest part.** I said I would say which proposals are groupings wearing a noun's
clothes. **This one nearly is.** Filtering by handle and counting per handle are both achievable
over rows the user can already read, with **zero new tables**. A `creators` table earns its existence
on exactly one thing: a durable key that survives a handle rename. We do not have one.

- **ASSUMED / UNAVAILABLE:** a stable numeric author id from oEmbed. `0003`'s own header records that
  `@gadderapp` in a pasted URL came back as `@gadderhq` from the platform, so the handle is already
  known to drift.
- **Evidence that would settle it:** ask `social-integration` for a VERIFIED/ASSUMED/UNAVAILABLE
  label on whether the oEmbed payload exposes an author identifier that survives a rename. If
  UNAVAILABLE, the entity has no durable key and the facet is the honest form — permanently.

**Ruling: build the screen at L2 as a facet over `sources`. The table is L3 and is blocked on that
evidence.** Do not create a table whose primary key we know is mutable.

**Shape, if the evidence ever arrives.** Global and shared like `sources`, `sources.creator_id`
pointing at it, and read through the *same* membership gate `sources` already uses — a creator row
must never become an enumerable directory of accounts. The one-argument `collection_role()` ruling in
`0024`'s header is the precedent: an exposed function's argument list is its attack surface.

**What it is tempted to assert:**

| Temptation | The refusal |
|---|---|
| A creator quality score, or "your most trusted account" | Counts of the user's own actions only. The words *trust*, *reliable* and *best* never ship |
| A ranking across users | Never aggregate across accounts. That is a discovery signal, and Charter §1 refuses creator discovery outright |
| A follow | There is no follow. There is a filter |
| That the handle is a person | It is the handle as of the post we read. A rename is not a new person and we will not claim it is |

---

### E3 — a start point

**In the user's language.** A point you keep, so the product can answer "what have I got near
*here*" for a *here* you are not standing in. Where you are staying. Where you live. The office.

**Working name only.** It may not be called a place, a spot or a location — `voice-and-vocabulary.md`
§3 fixes *place* as the product's noun for a saved recommendation, and reusing it here is how a
vocabulary breaks. `ux-interaction` owns the final word; `start point` is a placeholder that passes
§3 and §7, not a decision.

**The job nothing does today.** Near me answers "what did I save around here" and requires a location
permission and physical presence. The single primary user in `brand-and-product-foundation.md` §2 has
*two* retrieval questions, and the second one — "I land in Tokyo Thursday, what do I already have
there?" — is asked from the sofa in Tel Aviv. Today the answer is: pan the map to Tokyo yourself.

**What the user cannot do today:** sort their library by distance from anywhere except their own GPS
position.

**Why this and not a trip.** It is the half of the owner's trip idea that is a genuinely new noun.
See §5.

**Shape.** One user, a label the user types, a coordinate pair, created_at. Private and unshared —
never enters a collection, never appears to a collaborator. It is **not** a `places` row: `places` is
global, deduped and provider-resolved, and a start point is none of those things. It is a second
origin the existing nearest-first sort can take instead of the GPS fix, which is where most of its
value comes from for almost none of its cost.

**Where the coordinate comes from, and this decides the licensing question.** Two options, and I am
ruling for the first: **the user taps or drags on the map.** Zero provider calls, zero quota, zero
ToS surface, and the coordinate is the user's own assertion rather than ours. The second option —
resolving through the existing manual-add place search — inherits the Google ToS gate (`06` §3.1)
and adds paid lookups to a feature that does not need them. Tap-to-place also happens to be the
honest version: we are not claiming to know where your hotel is, you told us.

**Hard cap it, low.** A handful, not a second library. The number is `ux-interaction`'s; the
constraint is mine: the moment a user can accumulate start points, they have a parallel map with no
provenance and no been/not-been, and it will rot.

**What it is tempted to assert:**

| Temptation | The refusal |
|---|---|
| That it is somewhere you saved | Never counted in `N places`, distinct mark, never a category colour |
| Resolved-place vocabulary and confidence | It has none. It is a coordinate a person chose |
| That "home" is a thing we hold | The label is user-typed and we ship no default. See §7 — a home coordinate is sensitive personal data even when self-authored |

**Level: L2.** Small table, one control, one camera behaviour. But see §8: the camera file it touches
is owned by no agent.

---

### E4 — a note entry

**In the user's language.** What you wrote about a place, kept as entries rather than one field that
overwrites itself — so what you thought before you went is still there after you went.

**The job nothing does today.** `saved_places.note` is a single column. Writing a second thought
destroys the first. Since been/not-been shipped, the product can tell whether a note was written
before or after a visit — which makes a before/after reading **derivable rather than asserted**, and
that is the only reason this is interesting at all.

**Why it is fourth and not third.** I do not know that anyone writes notes, and I do not know that
anyone marks Been. `product-ruling-after-the-save.md` §2 explicitly cut visit history, a "how was it"
prompt and an editable visit date from the visited-state feature, and I am not quietly reopening my
own ruling six days later without evidence.

**Evidence that would promote it:** the Been control is being used on real rows, and notes are being
written on more than a handful of saves. Both are one query against the owner's own library, and
until someone runs it this is speculation with a schema attached.

**What it is tempted to assert:** that an after-visit note is a review or a rating. It is neither —
it is user-authored text, the same class as `note`, and it must never be rendered as a score, a star,
a verdict badge, or anything that could be aggregated. And it stays out of shared collections:
sharing deliberately does not open `saved_places` (`0024`'s header is explicit that this is the
security argument of the whole migration), and a note log must not be the thing that opens it.

**Level: L3.** Deferred, not cut.

---

## 4. Which of these are honestly new

Asked for, and worth stating plainly:

- **E1 is genuinely new.** There is no row in this schema that can represent a thing without
  coordinates, and no amount of filtering over `saved_places` produces one.
- **E3 is genuinely new.** It is a coordinate that is not a recommendation, which is a category the
  schema does not currently have.
- **E2 is a screen, not a table.** I am recommending it and simultaneously telling you it probably
  does not need an entity. Both are true.
- **E4 is a field becoming a log.** That is a real structural change, but it is the smallest kind of
  new noun and it is unevidenced.
- **E5 is not new at all.** §5.

## 5. Trips — interrogated, and recommended against

The owner named it, so it gets a real answer rather than a deferral.

**What does a trip know that a collection with dates does not?** Taken one part at a time:

| A trip has | Where it already lives |
|---|---|
| A name | `collections.name` |
| A set of places | `collection_items` |
| The people you are going with | shipped — named invitees, `collection_members` |
| A city or region | **derived from coordinates**, and the derived grouping is the authoritative one. A user-typed "Tokyo" disagrees with it the first time a place lands in one and not the other (`product-ruling-after-the-save.md` §4, unchanged) |
| **Dates** | **nowhere. This is the only genuinely new fact in the idea** |
| A day-by-day order | **refused.** Charter §1: not a travel itinerary planner |

So a trip is a collection plus two dates. And the two dates are worth less than they look, because
**the thing dates would buy is a message you cannot send.** "Your trip starts Thursday — here are the
9 places you have in Tokyo" requires a channel, and return triggers are refused outright and
permanently: no push, no email, no digest, no on-this-day (`mvp-plan.md` §8,
`product-ruling-after-the-save.md` §2). Without a channel, a date column sorts a list.

**Ruling: no `trips` table.** A trip is a collection with two dates, minus a notification we have
refused and an itinerary Charter §1 refuses. Building it would give the product a second container
that competes with `collections` on the day a user puts a place in one and not the other — the exact
failure mode the 2026-08-29 collections ruling was written to avoid, repeated one level up.

**The narrow version I would accept:** two nullable date columns on `collections`, **if and only if**
there is a surface that uses them for something other than sorting. Not before. A column that only
sorts is a sort control, and `growth-plan.md` §5 item 6 already wants one of those for the library
without needing a new fact to sort on.

**What to build for the trip user instead, all of which is cheaper:** **E3** answers "what do I have
near where I am staying" without dates, without a container and without a location permission; the
shipped area/country grouping answers "what do I already have in this city"; and Been answers "and
which of them have I not done". That triple is the trip question, answered from coordinates the
product already holds.

**Evidence that would change my mind.** Not usage counts — we have one user. It is a specific
behaviour: a collection is created whose name is a place plus a date, and the next thing reached for
is a **day-by-day ordering**. If that happens, what is being tested is Charter §1's itinerary
refusal, not the trip entity, and it goes to the owner as a boundary question rather than to me as a
scope one.

## 6. Considered, and they are filters — do not propose these as entities

| Idea | Why it is not an entity |
|---|---|
| Neighbourhoods / areas | Derived from coordinates we hold. `growth-plan.md` §3 wants a ~1.5 km band and is right — it is a grouping rule, not a table |
| A saved search | Literally a stored filter. If a saved search needs a home page it was a collection, and we have one |
| A tag facet with counts | An aggregate over `tags`. `growth-plan.md` §5 item 4c is right that it is missing and right that it is small |
| Import history | Refused by `brand-and-product-foundation.md` §6: *"a finished import has no artifact of its own — its output is pins."* E1 is not this. E1 retains the thing that did **not** become a pin, which is the case that refusal never covered |

## 7. What is not mine, and what I cannot override

**A `security-privacy` ruling gates E1, and it is a real gate.** The mention's text is derived from
the caption, and `0003` deliberately withholds `sources.content_text` from `authenticated` on the
stated ground that *no product surface displays it* (R8), with retention flagged as security-privacy
Q4 and still open. Today an extracted candidate name is shown to the pasting user through
`imports.candidates` — but only for 24 hours. **E1 makes that display permanent, which is a retention
change on third-party personal data.** That is exactly the class of decision I do not break ties on,
and a veto here stands. Ask for the ruling before `supabase-database` writes a line of SQL.

**`security-privacy` should also look at E2 and E3.** A `creators` table retains third-party personal
data indefinitely and makes it queryable; a start point can be a home coordinate, which is sensitive
personal data even when the user typed it themselves — it needs to be covered by delete-my-data
(`L1-F8-T1`, built at `642cab0`) and it must never be shareable.

**An owner ruling is *not* needed for any of these, with one caveat.** OD-1 — whether §2's "info"
boundary governs place facts only or every stored field — is still open and gates `user_tags`. E1,
E3 and E4 all store user-authored or user-solicited data rather than provider place facts, so on the
reading I set out in `product-ruling-after-the-save.md` §5 they sit where `note` sits. **I am again
not treating my own reading as the ruling:** if the owner answers OD-1 with *every stored field*,
E1, E3 and E4 go to the Future list together and E2's facet is unaffected.

**A vocabulary row is owed per entity before any string ships.** `voice-and-vocabulary.md` §3 is one
word per thing, and none of these four has a word yet. §6's ruling applies: the string changes in
code and the deck follows **in the same commit**, or it does not change.

## 8. Stale and absent ownership, which I own calling out

- **`src/app/map/map-page-client.tsx` is owned by no agent** (`current-state.md` item 12). **E3 lands
  directly in it** — a start point is an origin for the camera and the sort. Do not dispatch E3
  without first assigning that file, or the work lands in a hole between two map specialists.
- **`L0-F6`, the streaming import route, has read as staffed since 2026-08-20 and is paused.** E1's
  review-screen change sits in the same import surface, so it will look blocked behind `L0-F6`
  unless this is stated rather than inferred. Stating it: **E1 does not depend on the streaming
  route.** It consumes the import's *outcome*, not its stage events —
  a candidate that did not become a place, which `/api/imports/probe` produces today exactly as a
  streaming route would. **E1 is buildable against the request/response stand-in, unchanged, while
  `L0-F6` stays paused.** Whoever updates `execution-plan.md` should carry that sentence into it.
- **`L1-F10` — the four missing graded documents** (`test-specification.md`, `scale.md`,
  `deployment.md`, `how-the-system-works.md`) — is the largest submission gap with the deadline on
  **6 September**. See §9.

## 9. The recommendation

**Build E1 — the mention we could not place.** It is the only proposal that touches the product's
modal outcome, it converts the biggest liability we have into retained value, and it is the only one
that improves the first session, which is where the product is worth nothing.

**One precondition, and it is a prioritisation call rather than a caveat:** **nothing on this page
starts before `L1-F10` and item 0.** The graded artefacts do not exist, CI cannot start a runner so
nothing can land, and the deadline is six days out. Every entity here is L2 or L3 by my own ranking,
and L2 is explicitly not what the MVP is judged on (`mvp-plan.md` §4). If the schedule holds and
those two close, build E1. If it does not, E1 is the first thing cut and E3 goes with it — that is
the cut order, and it is why they are ranked rather than listed.

**The precondition is conditional on the owner, not on me.** Under the completeness reading recorded
in E1 — that this is the L1 import path unfinished on its modal branch rather than an L2 addition —
E1 sits *inside* `L1-F10`'s level rather than behind it, and the sentence above does not govern it.
I hold my own reading because it is the conservative one and because a missing graded document loses
marks the code has already earned. **What I will not do is present a schedule preference as a scope
ruling.** The owner decides which reading applies; everything else on this page is unaffected either
way, and E1's design does not change under either.

**One thing the ranking does not say, and should:** E2 is third on impact and roughly first on cost.
If the answer to "we have half a day" is needed, it is E2's screen, not E1 — the computation is
already written and rendered nowhere.

**Order after that:** E1 → E3 → E2 (facet only) → E4 (blocked on evidence) → E5 (no).

### 9.1 Acceptance criteria for E1, written so a verifier does not have to ask me

Checkable against a named commit, signed in, at 390×844 and 1440×900, against a library with at
least one no-places import and at least one skipped candidate.

1. **A mention survives its import.** Advance the clock past `imports.expires_at` (or delete the
   `imports` row) and the mention is still there. Verified by reading the row, not the screen.
2. **A mention has no coordinates and cannot acquire them.** No column in the diff holds a lat or a
   lng. If one does, the task was misunderstood.
3. **A mention is never counted as a place.** The library header count, the map pin count and the
   profile total are all unchanged by creating one. Assert before and after.
4. **A mention never draws on the map.** At any zoom, at any filter, in any collection.
5. **The text is the post's, and is immutable.** No UPDATE grant on the text column. Attempting one
   from the browser fails at the database, not in the UI.
6. **The Instagram case works with no `sources` row.** Paste a non-TikTok URL, keep it, and assert
   that no row was inserted into `sources` — `platform check in ('tiktok')` must not have been
   widened.
7. **A second browser profile cannot read or delete another user's mention.** Proven by attempt at
   the database: zero rows. Not by reading the policy.
8. **Resolving one closes it.** Keep a mention, add the place manually from it, and assert both the
   new `saved_places` row and the mention's pointer to it. Assert the mention no longer appears in
   the open list.
9. **The user can dismiss one, and dismissal is not deletion of the record it came from.** The
   `imports` row and any `sources` row are untouched.
10. **No string on any of these surfaces contains the product name** (`voice-and-vocabulary.md` §2),
    the words *candidate*, *extracted*, *unresolved*, *pending*, *queue* or *retry* (§4), or an
    exclamation mark (§5).
11. **The empty state is designed.** Zero mentions produces a written state, not a blank panel under
    a populated library.
12. **The migration is one migration and it is `0031`.** Nothing above `0030` is edited (`08` §9).

### 9.2 Out of scope for E1, so it is not absorbed

Background re-matching of any kind · a retry queue · notifications about a mention · a mention in a
shared collection · editing the post's words · a category on a mention · a mention on the map ·
importing Instagram or YouTube content · a count of mentions anywhere the count of places appears ·
and the scope creep to refuse by name: *"while we're in the review screen, let's also…"*.

## 10. Re-check against `security-ruling-e1-caption-retention.md` (2026-08-31)

The ruling approves E1, narrows it to the extraction rather than the caption, and adds ten
conditions. Re-checked against §9.1 as asked.

**Result: one criterion broke, and it broke on its mechanism rather than its property.** Eight hold
unchanged, three hold with a refinement the ruling supplies, and seven are added. The four
pre-committed properties all survive: point 3 never fired, so nothing was traded.

### 10.1 The break

**Criterion 1 is withdrawn and replaced.** It read *"advance the clock past `imports.expires_at` (or
delete the `imports` row)"*, and the ruling's central finding is that **`imports.expires_at` has no
enforcer** — no sweeper, no cron, no Edge Function, no `delete from imports` anywhere (F2). Advancing
a clock past a default nothing reads proves nothing. My own criterion was built on the same stale
premise the ruling was written to correct, which is worth saying plainly rather than quietly
rewriting: I quoted the 24-hour bound as a fact and it was a comment.

The property is unchanged — a mention's lifetime is not its import's — and it is now provable by
structure rather than by a timer, because the ruling's table shape has **no FK to `imports` at all**:

> **1a.** The mention table has **no `import_id`**, and **no TTL-shaped column** — no `expires_at`,
> no `deleted_at`, no retention timestamp of any kind. Read from the DDL. A TTL here would rebuild
> the defect under a new name (ruling §1), so its *absence* is the assertion.
> **1b.** Deleting the `imports` row (as `postgres`, in the harness — `authenticated` holds no DELETE
> grant on `imports` by design) leaves the mention present and readable by its owner.
> **1c. D1 proven, not read.** Delete the `profiles` row and assert the mention is **gone**. This is
> the only edge that removes it, and it is the whole of the retention bound, so it is verified by
> execution or it is not verified.

### 10.2 The eleven that stand

| # | Status |
|---|---|
| 2 — no coordinates, cannot acquire them | **holds**, and gains the ruling's condition 9: assert **no resolver call and no `place_lookups` write** anywhere in the E1 path, on any schedule or trigger. A permitted `addressHint` is one provider call from being a coordinate, which is why this is now inside the veto rather than inside my design |
| 3 — never counted as a place | **holds unchanged** |
| 4 — never draws on the map | **holds unchanged** |
| 5 — text immutable | **holds, refined.** The failure code is **`42501`**, and the UPDATE grant covers the dismissal/state column *only* — assert that `user_id`, `source_id`, the text and the `saved_places` pointer are all ungranted, not merely unused |
| 6 — Instagram case, `sources.platform` not widened | **holds**, upgraded from an acceptance criterion to a veto condition (U3) |
| 8 — resolving one closes it | **holds unchanged.** Note the pointer is server-written; there is no client grant on it |
| 9 — dismissal is not deletion of what it came from | **holds unchanged**, and is structurally protected: `source_id` is `on delete restrict`, so removing a mention cannot reach `sources` |
| 10 — banned vocabulary | **holds**, and gains the ruling's accuracy constraint: **quotation marks are honest around `rawName` and around nothing else.** A derived or normalised value rendered in quotes asserts a quotation we did not take |
| 11 — empty state designed | **holds unchanged** |
| 12 — one migration, `0031` | **holds, extended.** `supabase/tests/inventory.sql` is updated in the **same commit** (D3), and a policy-test file for the new table lands in it too |
| 7 — cross-user read/delete | **holds**, and is now **condition Q**: executed as two real roles against a leased container, in a policy-test file landing with the migration. The ruling does not accept "the policy says so" as evidence, including from its own author. Neither do I |

### 10.3 Seven criteria the ruling adds

13. **`evidence` and `content_text` appear nowhere in the diff** — not in the migration, not in a
    query, not in a type that reaches a component. This is the narrowing, asserted rather than
    trusted.
14. **No arm is added to `sources_select_via_membership`**, no policy on `sources` or `extractions`
    names the mention table, and no policy in `0031` names any `collection_*` table. Inside the veto.
15. **No `SECURITY DEFINER` function returning a mention row is granted to `authenticated`.**
16. **No INSERT grant** — or, if one is granted, its `with check` requires an owning `imports` row
    for the named `source_id`, the `sps_insert_own` shape.
17. **No server-side `fetch` of the pasted URL, ever** (U1). Assert by grep across the E1 path: no
    fetcher, no oEmbed call, no `og:` read. This is an arbitrary-URL column with no allow-list behind
    it.
18. **`check (<url> ~ '^https://')` exists at the database** (U2). Client-side validation does not
    satisfy this; a stored `javascript:` URL rendered into an `href` is stored XSS.
19. **The two deletion strings account for mentions, in the same commit** (condition 10). §10.4.

### 10.4 Condition 10 discharged — the deletion copy

Mine to write, so here it is rather than a note that someone should.

**First, a scope ruling the copy depends on, and it is load-bearing beyond the copy: a mention is
created by the user's action, never automatically.** The review screen's third action — *keep for
later* — and the equivalent on the no-places screen are the only things that make one. This is
compatible with the ruling's condition 5 (the tap calls a server action; the server inserts; no
INSERT grant is needed), and it is what stops E1 becoming the second graveyard I flagged when I
proposed it. An automatic mention on every failed import would accumulate at roughly three quarters
of all imports, unasked for, and *"anything you kept"* would be a false description of it.

**The two strings** (`src/app/profile/account-actions.tsx:55,57`; deck C143 / C145). The change is
one clause in each, and the order matters — the new item goes second so the four-item list does not
put the longest phrase next to *and your account*, where it reads as a garden path:

| | now | after `0031` |
|---|---|---|
| `entryLine` | `This removes your places, your collections and your account.` | `This removes your places, anything you kept for later, your collections and your account.` |
| `confirmBody` | `Your places, your collections and your account are removed. This can't be undone.` | `Your places, anything you kept for later, your collections and your account are removed. This can't be undone.` |

Checked against `voice-and-vocabulary.md`: sentence case, no exclamation, no banned word, no brand
name, one clause plus the existing second sentence, and it keeps the two strings parallel — they are
deliberately parallel today and that should not be lost to a four-item list. No Oxford comma, matching
the shipped strings.

**One phrasing I rejected and why, so it is not re-proposed:** *"everything on your map"* is shorter
and is **false** — criterion 4 says a mention never draws on the map, so a sentence that sweeps it up
as map content contradicts the invariant the entity exists to hold. The enumerating form is longer and
true, and the ruling is right that a sentence which lists nouns has to list the new one.

**I concur that no separate retention notice is required.** A banner saying *we keep this until you
delete your account*, on the one screen whose only control is that same deletion, is noise, and §7
rule 1 would refuse it.

## Change log

| Date | Change |
|---|---|
| 2026-08-31 | Created, `ENTITY-1`, in answer to the owner's request for 3–5 new entities. Four proposed and one refused. **E1, the mention we could not place** — ranked first because it is the only proposal that touches the ~73% modal import outcome, which today produces nothing at all: `imports.candidates` expires in 24 hours, so the user's intent is destroyed on a timer, and a non-TikTok link has no row anywhere because `sources.platform` is checked to `'tiktok'`. One entity, two producers, no relationship to `places` ever. **E2, the account that posted it** — recommended as a screen and *not* as a table, on the finding that a `creators` table earns its existence only on a durable key that survives a handle rename, which `0003`'s own header records as already drifting; the oEmbed author-id question is put to `social-integration` for a VERIFIED/ASSUMED/UNAVAILABLE label. **E3, a start point** — a private coordinate that is not a recommendation, ruled tap-to-place rather than provider-resolved so it carries no quota and no ToS surface, and it is the half of the trip idea that is genuinely a new noun. **E4, a note entry** — deferred to L3 behind evidence that Been and notes are used at all, rather than quietly reopening the visit-history cut made six days earlier. **E5, trips — recommended against**: a trip is a collection plus two dates, and the dates buy a message we have permanently refused to send and an itinerary Charter §1 refuses to build; the narrow acceptable version is two nullable columns on `collections` gated on a surface that does more than sort. Four ideas named as filters rather than entities so they stop being re-proposed. A `security-privacy` gate flagged on E1 that I cannot override — E1 turns a 24-hour display of caption-derived text into permanent retention, against `0003` R8 and the still-open Q4. One absent owner named: `map-page-client.tsx` is owned by no agent and E3 lands in it. Recommendation: **E1, after `L1-F10` and item 0, not before** |
| 2026-08-31 | **§10 added: E1 re-checked against `security-ruling-e1-caption-retention.md`, which approves it, narrows it to the extraction rather than the caption, and adds ten conditions.** All four pre-committed properties survive; point 3 never fired, so nothing was traded. **One criterion broke — criterion 1, on its mechanism rather than its property.** It tested the horizon by advancing the clock past `imports.expires_at`, and the ruling's central finding is that that bound has no enforcer at all: my own criterion rested on the same stale premise the ruling was written to correct, and I had quoted the 24-hour hold as a fact when it was a comment. Replaced by three that prove the property structurally — no `import_id` and **no TTL-shaped column** on the table (its absence is the assertion, because a TTL would rebuild the defect under a new name), the mention outliving a deleted `imports` row, and **D1 proven by executing a profiles delete** rather than by reading the cascade. Eleven criteria stand, three with refinements the ruling supplies (`42501` named, the ungranted column list enumerated, criterion 7 upgraded to condition Q — executed as two real roles, not read from the policy). Seven added, covering the narrowing (`evidence` and `content_text` absent from the diff), the membership-policy prohibitions, the missing INSERT grant, and the non-TikTok arm's U1/U2. **Condition 10 discharged rather than noted:** the two deletion strings are amended in §10.4, and the copy depends on a scope ruling made here — **a mention is created by the user's action, never automatically**, which is what keeps *"anything you kept for later"* true and stops E1 accumulating at the ~73% failure rate into the second graveyard I flagged when I proposed it. *"Everything on your map"* rejected as shorter and false: criterion 4 says a mention never draws on the map |
| 2026-08-31 | **Amended the same day on the orchestrator's reading, which is recorded beside mine rather than merged into it.** E1 may not be new scope at all: a core surface that discards its own content in twenty-four hours is the L1 import path unfinished on its modal branch, not an L2 addition — `mvp-plan.md` §2 already rules the no-places screen a core surface rather than an error path. The two readings agree on every design decision and disagree only on whether E1 sits inside L1 or competes at L2, which is a schedule call six days from the deadline and therefore the owner's; §9's precondition is explicitly marked as conditional on that answer, so a schedule preference is not presented as a scope ruling. **E2's finding is promoted to the front of its section:** `creatorBreakdown` is already computed at `profile-stats.ts:163` and rendered nowhere — the section that displayed it was deleted on 2026-08-30 and the computation stayed — so E2's screen is connecting work rather than new work, ranked third on impact and roughly **first on cost**, which §9 now says outright. **`L0-F6`'s non-dependency is stated rather than left to be inferred:** E1 consumes the import's outcome, not its stage events, so it is buildable against `/api/imports/probe` unchanged while the streaming route stays paused, and that sentence is owed to `execution-plan.md` |
