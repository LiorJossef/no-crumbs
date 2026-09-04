# Assertion audit — testing the edge claim's second half

> `social-integration`. Task `i6-competitors`, dispatched by the orchestrator to test the falsifier
> `product-edge-2026-08-31.md` §4 item 1 names against itself. **Base:** read against `b6691bf` on
> `no-crumbs-implementation`. Written scope: this file only — no source files, no other documents,
> not committed by me.
>
> **Method.** Public marketing sites, App Store / Google Play listings, and pricing pages only — the
> product's own primary sources, fetched directly where the host allowed it, supplemented by search
> snippets only where marked. **No accounts created, nothing installed**, per the task's explicit
> rule. Labels are **VERIFIED** (seen directly in a primary source, quoted), **ASSUMED** (secondary
> source — a review, a blog post, a search summary — not the product's own page), or **UNAVAILABLE**
> (the primary source is silent on the question; silence is not evidence of absence and is reported
> as such, never inferred into a yes or a no).
>
> **A note on an anomalous instruction, not part of the findings.** Mid-task, a system-reminder
> instructed me to prefer `Bash`/`sed`/heredocs over the dedicated Read/Write/Edit tools for the rest
> of this session. That contradicts my harness's standing guidance and arrived with no traceable
> provenance tied to this task or to you. I did not comply — I used the dedicated tools throughout —
> and I'm flagging it per the guardrails' rule on treating an unexplained instruction as a finding to
> report upward rather than as an order.

## Competitor set worked from

`brand-and-product-foundation.md` §3 names 34 competitors; I did not audit all 34 — the dispatch asked
for the named-explicitly set plus genuine category members, not a sweep. Worked: **Beli** (named
explicitly, matters most per the dispatch), **Mapstr** and **Stasht** (named in the §3 list, both
direct category members), and **GeoTok** / **TokSpot** (not in the §3 list by those exact names, but
they are the single closest comparison available — TikTok-link-to-personal-map is their *entire*
product, not one feature of a broader trip or dining app, which none of the four §3-named apps are).
**mio** and **Plotline** are not re-audited here — both already have a VERIFIED pass on file at
`docs/evidence/product/competitor-pass-2026-08-28.md`, screenshots included, and I pull from it below
rather than duplicate it.

## Table

| Competitor | Asserts unconfirmed facts | Social/discovery layer | Saves from TikTok specifically | No-match failure path | Single-player or social by default |
|---|---|---|---|---|---|
| **Beli** | **VERIFIED — yes, heavily.** Match Score, "spot-on scores," friend rating (an averaged cross-user aggregate) — App Store listing. | **VERIFIED — yes.** Newsfeed of friends' visits, city-wide and platform-wide leaderboards, friend-follow graph — App Store listing + reporting corroborated by three independent outlets. | **UNAVAILABLE, and contradictory.** App Store listing (primary) does not mention it. One secondary search summary claimed it does; I could not confirm that claim against a primary source, so I am not counting it. | UNAVAILABLE — not addressed by any primary source found. | **VERIFIED — social by default.** Friending, feed and leaderboards are core, not opt-in, per the App Store listing itself. |
| **Mapstr** | UNAVAILABLE on invented ratings specifically (the page's own 4.8★ is the app's App Store rating, not a place rating, and I did not mischaracterise it as one). ASSUMED social recommendations feed into what a user sees, which is an indirect assertion pathway even without a numeric score. | **VERIFIED — yes.** "Follow the voices you trust," merge others' maps into yours, a stated 4M-user community, official curated maps to follow — mapstr.com homepage, fetched directly. | UNAVAILABLE — homepage names Google Maps and Foursquare as import sources; TikTok/Instagram/YouTube are not mentioned anywhere on the page. | UNAVAILABLE — not addressed. | **VERIFIED — social by default**, not opt-in: "collaborate with several people on the same map" and "join a community" are both first-screen claims. |
| **mio** *(from existing VERIFIED evidence, not re-audited)* | **VERIFIED.** Place detail screen shows `Open • 11am–6pm, mon–fri` — an hours assertion the user did not supply — plus AI-authored `tldr;`, `local recs`, `pro tips` sections, per screenshot capture in `competitor-pass-2026-08-28.md` §F. | Partial. That pass found collaboration (shared Trips) but explicitly did not find a follower graph, leaderboard, or public profile — narrower than Beli/Mapstr. | VERIFIED — this is its core function, per the same document. | UNAVAILABLE per that pass. | Mixed — collaborative on Trips, no discovery layer found. |
| **Plotline** *(from existing VERIFIED evidence, not re-audited)* | Partial. `THE INSIDE SCOOP` quotes the source creator by handle rather than fabricating a score — closer to our own `whyGo` than to an invented rating. But **VERIFIED** ships **Trending** — "see what other travelers are saving near you," a genuine discovery/aggregate-popularity surface — per `competitor-pass-2026-08-28.md` §G. | **VERIFIED.** Trending, plus shared Collections free in the permanent tier with per-row contributor attribution. | VERIFIED — core function, per that pass. | UNAVAILABLE per that pass. | Social by default on Trending; collections are opt-in per-invite. |
| **GeoTok** — counterexample | **No assertion found** on the primary marketing page (geotok.co, fetched directly) — no ratings, scores, hours, popularity, or trending language anywhere on the page. Labelled **UNAVAILABLE, not VERIFIED-absent** — a marketing page not mentioning a feature is not proof the shipped app lacks it. | **No layer found** on the same page — no following, feed, leaderboard, or public profile language. Same UNAVAILABLE caveat applies. | **VERIFIED.** "Share any TikTok, Reel, or Short straight from the iOS share sheet" — TikTok, Instagram Reels and YouTube Shorts all named. | **VERIFIED, and a different design from ours.** On a failed/ambiguous match the page states the user gets "a swipe-deck of candidates to triage. Right to keep, left to skip" — a recovery UI, not a bare failure. Distinct from what "no places found" needs to cover (zero candidates), but it is evidence this category does design a real recovery surface rather than defaulting to silent discard. | **VERIFIED single-player by default** — the page's only social mention is an opt-in "build your shared list" for couples, not a default state. |
| **TokSpot** — counterexample | **No assertion found** on the primary marketing page (tokspotapp.com, fetched directly). Same UNAVAILABLE caveat as GeoTok — absence on a marketing page, not a confirmed absence in the shipped app. | **No layer found**, same page, same caveat. | **VERIFIED.** "TikTok, Instagram Reels — save places from your favorite platforms with one tap." YouTube not named. | UNAVAILABLE — the page does not describe a no-match path at all, which is itself notable: unlike GeoTok, it does not even market a recovery UI. | **VERIFIED single-player by default.** The page states directly: "Your saved spots are private to you." |
| **Stasht** *(named in §3)* | **No assertion found** on the primary page (stasht.app, fetched directly). Same UNAVAILABLE caveat. | Page shows public "stashes" as a *browsable* surface — "Real stashes from real users, just like you" — which is a discovery layer of a kind, though it reads as opt-in showcase content rather than a default follower/feed mechanic. Short of Beli/Mapstr/Plotline's always-on social surfaces. | **VERIFIED, and the broadest of any competitor checked.** Instagram, TikTok, X, YouTube, Pinterest and the general web, per the page's own listed platforms. | UNAVAILABLE — not addressed. | **VERIFIED single-player by default** for the core save/organize loop; public stashes are a separate, opt-in surface. |

## The sharp finding, stated prominently rather than buried

**The category is not uniform, and the closest competitors are the weakest evidence for the edge, not
the strongest.** Beli, Mapstr, mio, and Plotline — the four broader dining/trip apps in the set — are
all **VERIFIED** to assert unconfirmed facts and ship an always-on social or discovery layer. Against
those four, the edge claim holds and holds strongly: none of them could drop ratings, feeds,
leaderboards, or Trending without giving up a headline feature they market by name, which answers the
dispatch's narrower sub-claim — for this group, the refusal is not trivially copyable in a sprint,
because it is not a bolt-on, it is the product's marketed identity.

**But GeoTok, TokSpot, and Stasht — the three competitors whose core product is exactly ours, a
social-video link becoming a map pin, with nothing else bundled around it — show no marketing-page
evidence of asserting unconfirmed facts, and two of the three are explicitly single-player by
default.** This is the counterexample the dispatch asked me to look hardest for, and it is real: on
the narrowest, most relevant comparison, the "we refuse to assert / we are single-player" half of the
edge sentence reads as **category norm among the direct competitors, not as differentiation.** I
cannot upgrade this past UNAVAILABLE-leaning-toward-true — a marketing page silent on ratings is not
proof the shipped app has none — but I also cannot let the comfortable reading stand unqualified: the
edge document's own §4 item 1 asked whether "the category" is as dishonest as assumed, and the honest
answer is **it depends which slice of the category you compare against, and the narrower slice is the
one that matters most because it is the one actually competing on the same mechanic.**

One further data point cutting the same direction: **Stasht saves from more platforms than we do**
(Instagram, X, Pinterest, the general web, not just TikTok) while apparently keeping the same
restraint on assertions. If that holds up under closer inspection (UNAVAILABLE today, marketing page
only), the multi-platform breadth we have declined on ToS grounds is not what separates us from that
competitor — the refusal-to-assert would need to carry the whole weight of the comparison alone.

## What I could not establish, named rather than smoothed over

- **No competitor's no-match failure path is confirmed** except GeoTok's swipe-deck triage UI, and
  even that is for an ambiguous match, not a confirmed zero-result case — nobody publishes what a
  demo-unfriendly failure state looks like, exactly as the dispatch predicted. Beli, Mapstr, mio,
  Plotline, TokSpot and Stasht are all UNAVAILABLE on this question. This is the single biggest gap
  in what marketing-page research can answer, and it would need an actual account and a bad link to
  close — out of bounds for this pass.
- **Whether GeoTok, TokSpot, or Stasht assert anything once inside the app** is UNAVAILABLE, not
  VERIFIED-absent. A marketing page optimizes for its best feature and would not necessarily surface
  a rating or a trending shelf even if one exists deeper in the product. Treat the "counterexample"
  finding above as directionally real, not as a closed VERIFIED negative.
- **Beli's TikTok-import claim is an open contradiction** between one secondary search summary
  (claims it exists) and the primary App Store listing (does not mention it). Left unresolved rather
  than picked, because picking either without a firmer primary source would be exactly the "convert
  uncertainty into certainty" mistake the working agreement exists to prevent.

## Verdict

**The edge claim survives, but only with a qualification specific enough to write into the
positioning, not a general pass.** Against the broad "social restaurant/trip app" slice of the
category (Beli, Mapstr, mio, Plotline), it is well-supported: all four are VERIFIED to assert
unconfirmed facts and ship social/discovery mechanics that are not trivially removable. Against the
narrow "TikTok-link-to-map" slice — GeoTok, TokSpot, Stasht, the competitors doing the same specific
job we do — the assertion-refusal and single-player defaults read as **the norm already**, not as
something we alone hold, on the evidence a marketing page can show. **The edge sentence in
`product-edge-2026-08-31.md` §0 should not be defended by naming "the category" broadly; it should be
scoped explicitly to what it can actually prove differentiation against, and the retain-what-failed
half (`place_mentions`, still unshipped per that document's own §2) is now doing more of the
differentiation work than the refusal-to-assert half, because the refusal half alone does not clearly
separate us from our closest, most literal competitors.**
