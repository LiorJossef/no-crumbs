# The edge — a ruling, not a positioning line

> Owner: `product-lead`. Date: **2026-08-31**. Task `i6-edge`, dispatched by the orchestrator against
> the owner's question: *what is the edge of this product? What makes it unique?*
>
> **Base:** read against `1b79e9c` on `no-crumbs-implementation`. Written scope: this file only.
>
> Bar set by the dispatch, and I am holding myself to it: an edge statement must be **falsifiable** —
> untrue for a competitor who shipped something different. A sentence that survives any competitor's
> shape is a description, not an edge. Everything below is graded VERIFIED / ASSUMED / UNAVAILABLE
> against competitors, per house rules, because I have not run a competitor audit — I have read this
> repo, not their apps.

## The one sentence

> **No Crumbs's edge is not the extraction, not the map, and not a feature — it is that it refuses to
> assert anything about a place beyond what the user confirmed and what open data can store forever,
> in a category where the other 34 named competitors compete by adding exactly the things that
> refusal excludes: fabricated confidence, ratings, "open now," engagement mechanics, and a social
> layer.**

That sentence is contradicted the moment any one of three things is shown true (§4). It is currently
**half built**: the refusal is real and shipped; the other half of it — treating a failed match as
retained value instead of silently discarding it — is designed and not live. Stated honestly rather
than rounded up, because rounding it up is exactly the mistake this ruling exists to catch.

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

**Ruling: it is not currently the edge. It is the single highest-leverage thing that would complete
it, conditional on one thing I cannot verify from here** — that users actually return to a kept
mention and resolve it, rather than the list becoming a second graveyard
(`product-ruling-after-the-save.md` §1's own prior failure mode, which `entity-proposal.md` §E1
already names and designs against with a hard *no background retry, no queue* rule). Built and
unused, it is a rationalisation. Built and used, it is the other half of the sentence in §0. I am not
adjudicating which it will be — nobody can, before it ships — but I am refusing to credit it in
advance.

**One correction to my own prior document while I'm here.** `entity-proposal.md` §9 ranked E1 behind
`L1-F10` (the four missing graded documents) on a schedule argument. That ranking is about the
*submission deadline*, which is not mine to override and I am not touching it. But it should not be
read as ranking E1 low on *product* impact — on the reading in this document, E1 is not a nice-to-
have at L2, it is the thing that makes the edge statement true rather than half-true. Both things are
correct at once: ship the graded documents first because the deadline is not negotiable, and then
build E1 first among the discretionary work, not third or fourth.

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

1. **The category is not as dishonest as I have assumed.** I have not audited Beli, Mapstr, Plotline,
   or the other 31 named competitors for fabricated confidence, invented ratings, or engagement
   mechanics — I inferred it from the fact that a pure conversion-and-retrieval product is a thin
   value proposition on its own, which is a reasonable prior and not evidence. **What would falsify
   it:** a `social-integration` pass over 4–5 named competitors' actual screens, labelled VERIFIED /
   ASSUMED / UNAVAILABLE per house rules, checking specifically for (a) invented confidence or
   ratings not sourced from the platform, (b) return-trigger mechanics (streaks, notifications,
   digests), (c) any cross-user ranking or "trending" surface. If most of them already refuse these
   too, the edge shrinks to "we also refuse them," which is parity, not an edge.

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

2. **After that, `E1` (`place_mentions` UI) moves up.** Not because it is cheap — it isn't, per its
   own L2 sizing — but because it is the only piece of unbuilt work in the repo that turns the edge
   sentence in §0 from half-true to true. Its own acceptance criteria (`entity-proposal.md` §9.1,
   revised §10) already hold; nothing here changes them. One addition I am placing on it: whoever
   ships it should also instrument the fraction that gets resolved vs. dismissed vs. ignored, because
   that number is what §4 item 2 needs and nobody else has reason to collect it.

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

6. **A competitor audit is owed before this document is treated as settled**, per §4 item 1. It is
   not mine to run — I have no shell — and it is not a blocker to acting on §5's ordering, but it is a
   blocker to claiming §0's sentence with any more confidence than "ASSUMED." Routed to the
   orchestrator to assign, most naturally to `social-integration`.

## 6. Where I disagree with `brand-and-product-foundation.md`

Not a contradiction — a gap, flagged rather than silently patched, per the dispatch's instruction.

§1's positioning line — *"turns a pasted link into a pin on their own private map… organised by
where, not when"* — describes the **mechanism** (geography replaces a chronological feed). It is
correct and it is not what makes the product worth trusting; a competitor can copy "organise by
location" in a sprint. This document's edge is about **what the product refuses to claim**, which is
a different axis entirely and does not appear anywhere in §1's positioning or its long form. I am not
proposing a rewrite of the positioning copy — that is a voice-and-vocabulary decision I do not own —
but the deck and the spec should not describe this product as differentiated *because* it is
geographic. It should describe it as differentiated because it does not lie to the user about a place,
and geography is how that honesty gets retrieved. If the owner wants the positioning line itself
changed to carry that, it is a naming/voice decision for `ux-interaction` and the owner, not a scope
call I am making here.

## Change log

| Date | Change |
|---|---|
| 2026-08-31 | Created, `i6-edge`, in answer to the owner's question "what is the edge of this product?" Ruled: the edge is not the extraction, the resolution, the map, or completion state — all rejected on falsifiability grounds, with the Beli comparison specifically breaking the "nobody holds both halves" claim in `entity-proposal.md` §E2. The edge is a refusal to assert anything unverified, currently **half built**: the refusal itself ships today (review step, the fixed "info" boundary, the no-places screen); the "retain what failed instead of discarding it" half does not — `place_mentions` (migration `0031`) exists on disk and is read by nothing in `src/`, confirmed by grep. Ruled single-player is deliberate and load-bearing to the edge, not a gap. Three falsifiers named, each with the evidence that would settle it. Roadmap implication: `L1-F10` stays first on schedule grounds; `E1` moves up on product-edge grounds once it closes, ahead of L2 map polish; any feature asserting something unverified (ratings, "open now," trending) is refused categorically rather than case by case; a competitor audit is owed and routed to `social-integration` via the orchestrator. Flagged, not silently patched: `brand-and-product-foundation.md` §1 positions the product on mechanism (geography vs. chronology), not on the refusal-to-assert axis this document rules is the actual edge. |
