# The edge — a ruling, not a positioning line

> Owner: `product-lead`. Date: **2026-08-31, amended 2026-08-31**. Task `i6-edge`, dispatched by the
> orchestrator against the owner's question: *what is the edge of this product? What makes it
> unique?* **Amendment** dispatched against the competitor audit at
> [`evidence/competitors/01-assertion-audit-2026-08-31.md`](../evidence/competitors/01-assertion-audit-2026-08-31.md)
> (`social-integration`, `dd97234`), which tested this document's own §4 item 1 against itself.
>
> **Base:** read against `1b79e9c` on `no-crumbs-implementation`; amendment read against `dd97234`.
> Written scope: this file only.
>
> Bar set by the dispatch, and I am holding myself to it: an edge statement must be **falsifiable** —
> untrue for a competitor who shipped something different. A sentence that survives any competitor's
> shape is a description, not an edge. Everything below is graded VERIFIED / ASSUMED / UNAVAILABLE
> against competitors, per house rules. The original version of this document graded its competitor
> claims ASSUMED because I have no shell and ran no audit; one now exists, and §0 and §2 are rewritten
> against it rather than left standing on the assumption.

## The one sentence — revised against the audit

> **No Crumbs's edge is not the refusal to assert unverified facts by itself — that refusal is real,
> it holds strongly against the broad dining/trip slice of the category (Beli, Mapstr, mio, Plotline,
> all VERIFIED to ship ratings, feeds, or trending as marketed identity), and it is also, on the
> audit's own finding, the norm among the three competitors who do exactly our job with nothing
> bundled around it (GeoTok, TokSpot, Stasht show no marketing evidence of asserting anything
> unconfirmed, and two of the three are single-player by default). Against the competitors we would
> actually be chosen over or against, restraint is not the edge — it is table stakes we happen to
> also meet. The edge that would separate us from those three is `place_mentions`: keeping what a
> TikTok named and we could not place, instead of discarding it. It is designed, migrated, and
> unread by any code in `src/`. Until it ships and gets used, this product's sharpest available edge
> does not exist yet.**

This reverses the original document's framing, and says so rather than hiding it: that version called
the refusal "half" of a "half-built" edge, with the retain-what-failed piece as the completion of it.
The audit shows the built half is the **less** distinctive one against the competitors closest to us,
and the unbuilt half is doing more of the differentiating work — not completing the claim, carrying
it. §2 below is rewritten to state that plainly rather than in a footnote, per the dispatch.

## 1. What I rejected, and why

**Extraction.** Read the caption, name the place. This is the thing every demo shows, and it is the
thing I am most confident is *not* the edge: it runs on a third-party LLM, its accuracy is bounded by
what a model can read out of an arbitrary caption, and every competitor using a comparable model gets
better at exactly the rate we do. An edge that a model upgrade erases for everyone equally was never
ours. `mvp-plan.md` §2 already says this in different words — it prices the ~27% hit rate as an
**honest limitation**, not a capability claim, and I am not going to promote it to one here.

**Resolution.** Turning a candidate string into a real POI is engineered carefully — a ported scorer,
a 44-case golden file, confidence bands, 15/16 top-1 against Google Places. It is real work and it is
table stakes done unusually well, not an edge: it runs on the same public API a competitor can also
call, and "we integrated the resolver correctly" is not a sentence a user ever perceives, let alone
one that survives a competitor doing the same integration.

**The map.** MapLibre, CARTO tiles, a token system. Every one of the 34 named competitors
(`brand-and-product-foundation.md` §3) is a map. This is the least differentiated surface in the
product by construction — it is the retrieval *interface*, not the retrieval *edge*, and Charter §6
already treats it that way ("the map style is the brand" is about premium feel, not uniqueness).

**Completion state (been / not-been).** `product-ruling-after-the-save.md`'s finding — retrieval by
state closes a real gap — is correct and shipped, and I considered it seriously because `entity-
proposal.md` §E2 argues the *combination* of provenance (who recommended it) and completion (did you
go) is an asymmetry nobody else holds. I am not adopting that argument as written: **Beli** is named
as a competitor in this same document and is, publicly, a been/visited-tracking app for restaurants.
Claiming "nobody else holds completion state" is **ASSUMED, not VERIFIED**, and it reads false on the
first competitor I can name from our own docs. The narrower claim — *TikTok-sourced provenance*
specifically, permanently linked forward to a completion mark — may still be true, but I have not
audited it and will not spend the owner's trust asserting it. Filed under §4 as a thing that would
need checking, not adopted as the edge.

**TikTok-only, added on the audit's evidence.** Not considered in the original pass because nothing
in the repo positions it as a virtue beyond "the only VERIFIED access mechanism" (`mvp-plan.md` §2) —
correctly, on this finding. The audit shows **Stasht saves from Instagram, X, Pinterest, TikTok and
the general web while showing the same marketing-page restraint on assertions** — the broadest
platform coverage of any competitor checked, held with the same UNAVAILABLE caveat as everything else
on that page. If that holds up, our single-field, TikTok-only constraint is not a narrower, more
honest version of what Stasht does; it is simply narrower. **Ruling: "one link, one field" stays a
correct description of a scope decision forced by `04-tiktok-feasibility.md`'s VERIFIED/UNAVAILABLE
split, and must not be reframed as a virtue or a differentiator in the positioning.** It was never
proposed as one here; flagged so it is not proposed as one later on the strength of this document.

**Collections and sharing.** Real, shipped, and deliberately narrow — named invitees only, no
discovery, no public profile (`00-project-charter.md` §1, unchanged). It is retrieval for two people,
not a network. It does not compound with more users the way an edge usually does, and I am not
stretching it into one. See §3.

## 2. Is the 73% failure the edge?

Interrogated directly, because the dispatch asked me to and because it is the most interesting
candidate in the repo.

**The claim worth taking seriously:** a product that keeps the thing it could not place, rather than
discarding it, is doing something a growth-funded competitor structurally avoids, because a "we
couldn't find it" list looks like a bug list in a demo and a retained-failure list looks like nothing
a metrics dashboard rewards. Discarding is free and looks better; keeping it costs a table, a screen,
and the discipline not to fabricate a match just to fill it.

**The honest check: is it built?** No. `supabase/migrations/0031_place_mentions.sql` exists on disk.
Nothing under `src/` references `place_mentions` — grepped directly, zero hits. There is no server
action, no route, no component. `entity-proposal.md` §E1 designed it and priced it; it has not
shipped. **A table with no reader is not a product fact, and I will not count it as one.** The edge
sentence above is written to reflect this precisely: the *refusal to assert* half is live (the review
step, the fixed "info" boundary, the no-places screen's honest three recoveries); the *retain-what-
failed* half is not, and saying otherwise would be exactly the "convert uncertainty into certainty"
mistake `CLAUDE.md`'s working agreement exists to prevent.

**Ruling, revised against the audit: it is not currently the edge, and it is now the primary
candidate for the edge rather than a completion of one already established.** The original version of
this ruling treated the refusal-to-assert half as the edge and the retain-what-failed half as filling
it out. The audit inverts that: against Beli/Mapstr/mio/Plotline the refusal half does the work, but
those four are not who a user picks between when deciding whether to use *this specific kind of
product* — GeoTok, TokSpot and Stasht are, and against them the refusal half is unremarkable. So the
retain-what-failed half is not optional polish on an edge that already exists; on the narrow, correct
comparison set, **it is the only candidate left that could make the edge sentence true at all.**

This is still conditional on one thing I cannot verify from here — that users actually return to a
kept mention and resolve it, rather than the list becoming a second graveyard
(`product-ruling-after-the-save.md` §1's own prior failure mode, which `entity-proposal.md` §E1
already names and designs against with a hard *no background retry, no queue* rule). Built and
unused, it is a rationalisation with nothing behind it. Built and used, it is the whole of the edge,
not half of one. I am not adjudicating which it will be — nobody can, before it ships — but I am
refusing to credit it in advance, and the audit does not let me credit it as *already differentiating*
either: the audit is explicit that **no competitor's no-match failure path could be established from
a primary source** — GeoTok's swipe-deck is a recovery UI for an *ambiguous* match, not a *zero-
result* one, and every other competitor is UNAVAILABLE on this question outright. That is the honest
state of the strongest form of this claim: **untested, not refuted.** Nobody publishes what happens
when their product fails, which is exactly the axis this half of the edge turns on, so the absence of
counter-evidence is not evidence for us either. It becomes checkable only once `place_mentions` ships
and someone runs the same kind of audit against us that `social-integration` just ran against them.

**One correction to my own prior document while I'm here, sharpened after the audit.** `entity-
proposal.md` §9 ranked E1 behind `L1-F10` (the four missing graded documents) on a schedule argument.
That ranking is about the *submission deadline*, which is not mine to override and I am not touching
it. But it should not be read as ranking E1 low on *product* impact — and after the audit, "low" is
too weak a word. On the reading in this document, E1 is not the thing that completes an edge that
already exists at L2 priority; against the competitors we would actually be judged against, **it is
the only thing that would create one.** Both schedule facts are correct at once: ship the graded
documents first because the deadline is not negotiable, and then build E1 first among the
discretionary work — not third or fourth, and not because it is cheap, but because nothing else left
on the page is a candidate for differentiation against GeoTok, TokSpot or Stasht at all.

## 3. Who is the second user

**Deliberately single-player, and I am ruling that explicitly rather than leaving it implied.**
Everything that stores a fact — `saved_places`, `imports`, notes, visit state — is one user's row,
gated by RLS, read by nobody else. Collections are the one multi-writer object, and they are scoped
to named invitees with no discovery, no follower graph, no public profile, no ranking across users
(Charter §1, unchanged by the 2026-08-30 collections ship). `entity-proposal.md` §E2 is explicit that
a creator-quality score or a cross-user ranking is refused outright — "that is a discovery signal, and
Charter §1 refuses creator discovery outright."

**This is not a gap next to the edge, it is load-bearing to it.** The edge in §0 is a refusal to
assert unverified things. A social or discovery layer is precisely where that refusal gets tested
hardest — "trending near you," "3 people saved this," a creator leaderboard — because those features
are cheap growth levers and every one of them is an aggregate claim about people we do not have
consent to characterise. **Ruling: the product does not need a second user for the edge to hold, and
adding one is the single fastest way to lose it.** If the owner wants a second-user growth lever
later, it has to be evaluated against this document specifically, not slipped in as "just a feature."

## 4. The three things most likely to make this false

1. **FIRED, partially — audited 2026-08-31 by `social-integration`,
   [`evidence/competitors/01-assertion-audit-2026-08-31.md`](../evidence/competitors/01-assertion-audit-2026-08-31.md).**
   Originally: "the category is not as dishonest as I have assumed." Result, precisely: **VERIFIED
   false for the broad slice, and the closest evidence available to true for the narrow one.** Beli,
   Mapstr, mio and Plotline are all VERIFIED to assert unconfirmed facts (Beli's Match Score and
   friend rating, mio's invented opening hours, Plotline's Trending) and ship social/discovery
   mechanics as marketed identity, not a bolt-on — the refusal genuinely separates us from that group.
   But **GeoTok, TokSpot and Stasht — the three competitors doing exactly our job, nothing else
   bundled around it — show no marketing evidence of asserting anything unconfirmed, and two of the
   three are explicitly single-player by default** (TokSpot's own copy: *"Your saved spots are
   private to you"*). Held at **UNAVAILABLE-leaning-true rather than VERIFIED**, correctly — a
   marketing page silent on a feature is not proof the shipped app lacks it — but it is enough to
   withdraw "the category" as the comparison set this claim can lean on. **The correct reading, and
   this is why §0 and §2 above are rewritten rather than footnoted:** against the three products a
   user actually chooses between when picking *this specific kind of app*, restraint reads as category
   norm, and the differentiation has to come from somewhere else — which is §0's revised sentence.

2. **`place_mentions` never gets a reader, or gets one nobody uses.** Covered in full in §2. If E1
   ships and the kept-mention list behaves like the graveyard `product-ruling-after-the-save.md` §1
   already diagnosed once — accumulates, never resolves, gets ignored — then the "we keep what we
   could not place" half of the sentence is false in practice even though it is true in the schema.
   **What would hold it up:** a real measurement, after E1 ships, of what fraction of kept mentions
   get resolved (become a place) versus dismissed versus simply pile up unopened.

3. **Restraint doesn't move retention, volume does.** The alternative explanation for why this product
   might lose users is not "it wasn't honest enough," it's "a map with 20 places beats a map with 3,
   full stop, regardless of how honest the 17 missing ones were about failing." If that is the real
   dynamic, the 73% failure is simply a weakness and no amount of honesty about it changes the outcome
   — which is the "rationalisation of a weakness" reading the dispatch asked me to take seriously, and
   I cannot rule it out from a document. **What would falsify the edge on this axis:** the owner's own
   usage, or the first real users', showing churn tracks total saved-place count and is indifferent to
   whether failures were shown honestly or hidden. **What would hold it up:** the opposite — someone
   coming back specifically *because* a kept mention reminded them of something, which is a behaviour
   no discard-on-failure competitor can produce by construction.

## 5. What this implies for what gets built next

Concrete enough to reorder a plan, as asked, and ranked by what serves the edge rather than by
schedule convenience — with the one hard exception that the deadline is not a scope decision.

1. **Nothing changes about `L1-F10` (the four graded documents) or the deadline order.** The
   submission is 6 September; that ranking is fixed and is not a product-edge question.

2. **After that, `E1` (`place_mentions` UI) moves up, harder than the original pass had it.** Not
   because it is cheap — it isn't, per its own L2 sizing — but because, against the competitors we
   are actually compared to, it is now the only candidate left in the repo that could make the edge
   sentence in §0 true rather than merely restate a category norm. Its own acceptance criteria
   (`entity-proposal.md` §9.1, revised §10) already hold; nothing here changes them. One addition I am
   placing on it: whoever ships it should also instrument the fraction that gets resolved vs.
   dismissed vs. ignored, because that number is what §4 item 2 needs and nobody else has reason to
   collect it.

3. **`E2`'s screen (retrieval by creator) is worth building on the same logic, ranked below E1.** It
   strengthens the provenance axis the edge depends on — "which account told you this, and did you
   go" is a trust-and-audit feature, not a discovery one, as long as `entity-proposal.md` §E2's
   refusals hold (no score, no cross-user ranking, no "trusted account" language). It is also, per
   that document's own finding, largely already computed and unrendered — cheap enough that it should
   not wait long behind E1.

4. **Any feature that adds an assertion the product cannot verify is refused categorically, not
   case by case.** This was already true by Charter §4 and `voice-and-vocabulary.md`'s banned list;
   this document makes it load-bearing rather than a style rule. Concretely: no "open now," no star
   rating, no AI-generated place description, no "hidden gem," no trending, no leaderboard, no
   notification nudging a return. Each of these is not merely off-brand — each one is the specific
   thing the edge sentence says the product does not do, so shipping one does not just add scope, it
   contradicts the ruling.

5. **L2 map polish (the Protomaps fork, clustering, the five motion moments) is real but secondary to
   E1.** It moves the "feels like paid software" bar Charter §6 cares about, which is legitimate, but
   it does not move the edge — a beautiful map full of the same 3 confirmed places is not a different
   product from a plain one. If the schedule forces a choice between polish and E1 once `L1-F10`
   closes, E1 wins on this document's own logic.

6. **The competitor audit landed** (`social-integration`, `dd97234`) and is the reason §0 and §2 read
   as they do now rather than as originally written. **What is still owed, and it is the same request
   narrowed:** the audit could not establish any competitor's actual no-match failure behaviour from a
   primary source, and it could not get past a marketing page into GeoTok's, TokSpot's or Stasht's
   shipped app to check for assertions that just aren't marketed. Closing either gap needs an account
   and a bad link, which is out of the marketing-page method's bounds — still routed to
   `social-integration` if the owner wants it deepened, but it is no longer a blocker to §0's sentence
   at its current, narrowed scope, only to a broader one.

## 6. Where I disagree with `brand-and-product-foundation.md`

Not a contradiction — a gap, flagged rather than silently patched, per the dispatch's instruction.

§1's positioning line — *"turns a pasted link into a pin on their own private map… organised by
where, not when"* — describes the **mechanism** (geography replaces a chronological feed). It is
correct and it is not what makes the product worth trusting; a competitor can copy "organise by
location" in a sprint. This document's edge, before the audit, was about **what the product refuses to
claim**. **After the audit, the disagreement is sharper, not softer:** the refusal-to-claim axis does
not appear in §1's positioning either, and now I know it would not carry the weight §1 needs on its
own — against GeoTok, TokSpot and Stasht it is not a claim a competitor *could* copy in a sprint, it
is one they already meet. The thing that could actually ground a differentiated positioning line is
`place_mentions`, once it exists and gets used — "we keep the ones we couldn't find, not just the ones
we could" is a sentence none of the three closest competitors' marketing pages make. I am not
proposing that line either — it isn't true yet, and shipping copy ahead of the feature it describes is
exactly the "convert uncertainty into certainty" mistake this whole document exists to avoid. I am
flagging that **§1's positioning has no candidate edge to lean on today that survives the narrow
competitor set**, and won't until E1 ships. If the owner wants the positioning line revisited once it
does, that is a naming/voice decision for `ux-interaction` and the owner, not a scope call I am making
here.

## Change log

| Date | Change |
|---|---|
| 2026-08-31 | Created, `i6-edge`, in answer to the owner's question "what is the edge of this product?" Ruled: the edge is not the extraction, the resolution, the map, or completion state — all rejected on falsifiability grounds, with the Beli comparison specifically breaking the "nobody holds both halves" claim in `entity-proposal.md` §E2. The edge is a refusal to assert anything unverified, currently **half built**: the refusal itself ships today (review step, the fixed "info" boundary, the no-places screen); the "retain what failed instead of discarding it" half does not — `place_mentions` (migration `0031`) exists on disk and is read by nothing in `src/`, confirmed by grep. Ruled single-player is deliberate and load-bearing to the edge, not a gap. Three falsifiers named, each with the evidence that would settle it. Roadmap implication: `L1-F10` stays first on schedule grounds; `E1` moves up on product-edge grounds once it closes, ahead of L2 map polish; any feature asserting something unverified (ratings, "open now," trending) is refused categorically rather than case by case; a competitor audit is owed and routed to `social-integration` via the orchestrator. Flagged, not silently patched: `brand-and-product-foundation.md` §1 positions the product on mechanism (geography vs. chronology), not on the refusal-to-assert axis this document rules is the actual edge. |
| 2026-08-31 | **Amended against `evidence/competitors/01-assertion-audit-2026-08-31.md`** (`social-integration`, `dd97234`), which tested §4 item 1 against itself. **§4 item 1 fired, partially.** Against the broad dining/trip slice (Beli, Mapstr, mio, Plotline) the refusal-to-assert claim is VERIFIED and holds strongly — all four ship ratings, feeds or trending as marketed identity, not a bolt-on. Against the narrow slice of competitors doing exactly our job (GeoTok, TokSpot, Stasht), the audit found no marketing evidence of asserting unconfirmed facts and two of the three explicitly single-player by default — restraint reads as **category norm**, not differentiation, on that comparison (held at UNAVAILABLE-leaning-true, not VERIFIED, per the audit's own discipline). **§0's sentence rewritten rather than merely narrowed**, per the dispatch's instruction to state the sharper consequence rather than bury it: the built half (refusal-to-assert) is now the *less* distinctive half against our real competitors, and the unbuilt half (`place_mentions`) is the only remaining candidate that could make the edge true — not completing an edge that already exists, but the sole thing that would create one. Held as untested rather than refuted: the audit could not establish any competitor's actual no-match failure behaviour from a primary source, so the strongest form of this claim stays open until E1 ships and gets audited the same way. Two new facts folded in: **Stasht saves from more platforms than we do while showing the same restraint**, so TikTok-only cannot be positioned as a virtue either, only as a scope decision forced by `04`'s VERIFIED/UNAVAILABLE split; and §6's disagreement with `brand-and-product-foundation.md` is sharpened to note the positioning has no candidate edge to lean on today, pending E1. `L1-F10`-first ordering and the single-player ruling are unaffected and were not revisited. |
