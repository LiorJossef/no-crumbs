# Competitor pass — Mio Travel & Plotline, 2026-08-28

> Product Lead. Lightweight scan, not a competitive analysis — stopped short of deep crawling per
> owner instruction mid-task. Built mostly on evidence already gathered 2026-08-27
> (`docs/evidence/.local/competitors/`, gitignored, findings reviewed into
> `docs/current-state.md` §5b) plus one search pass on Plotline (getplotline.app — not yet locally
> crawled; robots.txt not checked because no page was fetched, only search snippets read).
> Labels: **VERIFIED** (seen directly) / **ASSUMED** (marketing copy, reviews, search snippets) /
> **UNAVAILABLE**.

## A. Category taxonomy — what a good one looks like here

Neither competitor's exact value list was directly observed (no screenshot pulled this pass).
What is VERIFIED from mio's own shipped analytics taxonomy (`raw/03`) is that **category is a
first-class, user-editable, batch-editable field**: `finds_batch_category_updated` exists as an
event, meaning a user can select multiple saved places and reassign their category in one action.
ASSUMED from search snippets: mio's categories read as ordinary trip-brochure nouns — *restaurant*,
*attraction* — not a controlled vocabulary of raw provider types.

**The implication for us, stated as a ruling rather than a copy of theirs:** our problem is not "we
need more categories," it's that our 7-value LLM vocabulary collapses 14/20 real rows into
"Restaurant" while occasionally leaking Google's raw taxonomy (`ice_cream_shop`,
`mediterranean_restaurant`) straight into the UI. A good taxonomy for this exact product is:

1. **One coarse, user-facing category** (6-8 values max: Restaurant, Cafe, Bar, Bakery, Attraction,
   Shop, Other) — kept, this part is already right.
2. **A separate, optional cuisine/vibe descriptor** distinct from category — this is what "seasonal
   Italian" or "Nepalese kitchen" wants to be, and it's exactly what our `tags` field already
   captures (shipped 2026-08-27, §3.2 of `current-state.md`). We already built the right answer to
   this; it's inert (§B below), not missing.
3. **Never render the provider's raw type string.** That's a mapping bug, not a taxonomy gap — the
   raw Google term should map to one of the 7 coarse values, full stop.

So (A) is mostly a confirmation, not a new finding: the taxonomy design is sound, the leak is a
bug, and mio's evidence supports category being user-correctable, which we do not have at all.

## B. What they do with a saved place that we don't — concrete, VERIFIED from mio's event names

From `docs/evidence/.local/competitors/raw/03-mio-analytics-event-taxonomy.txt` (their own shipped
analytics taxonomy — the strongest evidence in this pass because it's their code telling us what
surfaces exist, not marketing copy):

- **`finds_batch_category_updated`** — category is user-editable, individually and in bulk. We have
  no edit path for category at all.
- **`find_location_changed`** — the user can drag/correct a wrong pin. This is the single most
  direct answer to our "wrong place" problem (item D) and we have nothing like it.
- **`v2_favourite_toggled`** — a favourite/star state per place.
- **`visit_created` / `visit_rated` / `visit_removed`** — a been-there state with its own rating,
  separate from the save itself.
- **`photo_gallery_opened`** — user's own photos attached to a place, not just source-video stills.
- **`emoji_customized`** — a custom emoji per pin (personalization, cheap, visible on the map).
- **`place_highlights_mode_toggled`**, **`original_video_opened`** — the latter matches our existing
  source-link-back.

## C. The list/map relationship (VERIFIED from mio's route table and event names)

Route table (`raw/02`) plus event names show a real drill-down hierarchy: **country → collection →
trip → search**, with city chips as shortcuts (`v2_country_drill_opened`, `v2_collection_drill_opened`,
`v2_trip_drill_opened`, `v2_city_chip_pressed`, `v2_city_anchor_pressed`), plus a library with
distinct sections including an **inbox tier for unprocessed videos** (`v2_library_inbox_pressed`,
`map_drawer_tier_changed`, `v2_library_videos_pressed`). This is the "automatic geography" +
"user collections" direction already recorded as a *parked* product direction in
`current-state.md` §0.4 — mio is one concrete existence proof that the shape works, not new
information.

## D. Import flow — reducing "no places found" / "wrong place" pain

Already covered fully in `current-state.md` §5b: silent save with no confirmation is mio's biggest
complaint source (their reviewers don't trust it saved); their resolver cross-checks against a
commercial index (a large source of our accuracy gap per §6); and `find_location_changed` (§B
above) is a cheap, high-value manual-correction affordance we don't have on a resolver we don't
have yet either.

Plotline (ASSUMED, search snippets only): "grabs location, photos, and details," gives "the
story — the original creator's recommendation, what to order, why it matters" — i.e. the same
grounded-quote-plus-reason idea as our `whyGo`, already shipped. Nothing here suggests a capability
we lack that isn't already covered by the mio findings.

## E. What NOT to copy — feature bloat for a lean personal map

- Dated multi-day trip planning with collaborators, route generation, an AI planner (mio), and
  drag-to-build itineraries / swipe-through day-trip routing (Plotline, ASSUMED). Charter §1's
  "not an itinerary planner" stands — both competitors are doing a different job.
- Public creator pages, shared collections with followers, referral/wander-match social features
  (mio) — Charter §1's no-social-graph stance.
- A "roll"/random-pick gamification feature (mio) — novelty, not retrieval.
- Country-level bucket-list framing ("tick off" a place) — different psychology from our retrieval
  positioning; do not adopt the copy even where the underlying data (country grouping) is useful.

---

## Ranked gaps — at most 6, sized, one-line why

1. **Manual pin-location correction on a saved place** (small–medium) — mio's
   `find_location_changed` is a direct, cheap answer to "wrong place," and once a resolver exists
   this is the single fastest way to make coordinate error self-healing instead of silently wrong
   forever.
2. **Category is not user-editable** (small) — `finds_batch_category_updated` shows mio treats a
   model's category guess as a starting point, not a verdict; we currently have no edit path at
   all, so a wrong or over-collapsed category ("Restaurant" for a bakery) can never be fixed by the
   user.
3. **Pressable/filterable tag chips still inert** (small) — already tracked in
   `current-state.md` §0.3/§9.1; this pass just adds outside confirmation that type/tag filtering
   is the retrieval feature reviewers ask for by name.
4. **No manual place-add / place-search path** (medium) — already the top-priority open item in
   `current-state.md` §9.1 step 2; this pass adds nothing new except confirming mio treats it as
   core at 4.9★.
5. **No confirmation-quality signal beyond the review sheet** (small) — favourite/visited-state
   toggles are cheap, well-understood UI and give the user a second reason to open a saved place
   again later, unlike ours which is currently write-once.
6. **No user photos on a saved place** (medium, likely a cut) — repeatedly named in mio's 5★
   reviews as differentiating richness; flagged for completeness but conflicts with Charter §4's
   "info" boundary (name/category/coordinates/source link/note) and should go to the Future list,
   not the current sprint, unless the owner wants to reopen that boundary.

**Deferred, not cut, evidence that would change my mind:** a direct screenshot-level look at either
app's actual category value list — this pass never got one, so (A) above is a design ruling built
on our own data plus indirect evidence, not a taxonomy comparison. If a future session captures
real screenshots, redo (A) properly.

---

# Part 2 — visual pass, and shared collections re-evaluated (same day)

> Owner correction, 2026-08-28: **§E conflated collaborative collections with social-network
> features.** Followers and creator profiles are out; a shared collection two named people both
> contribute to is a different object and was asked for on its own merits. §G below replaces the
> relevant §E bullet.
>
> Also this pass: a **quick visual review** of publicly published App Store screenshots and
> marketing/FAQ pages for both apps — deliberately shallow, to catch UX patterns a text-only scan
> cannot see. robots.txt checked first for all four hosts: `mio.travel` is now `Allow: /`
> (Cloudflare-managed, `Content-Signal: use=reference` — it was disallowed when `01` was written),
> `getplotline.app` allows everything except `/api/ /c/ /j/ /p/ /r/`, and both stores allow app
> detail pages. Read-only, no account, no app installed, no API called. Screenshots are gitignored
> in `.local/competitors/raw/screens-2026-08-28/`.

## F. What the screenshots settled that the text pass could not

**The deferred item in §A is now partly closed.** That section ended by saying it never got a look
at either app's real category list, and to redo it if a future session did. It did.

- **Plotline's vocabulary is VERIFIED and complete** (their FAQ, verbatim): nine categories — *eat,
  brew, sip, explore, vibe, stay, shop, go, party*. **They are verbs, not nouns.** And they filter
  on three separate axes — city, category, and **vibe** ("what other apps call mood") — plus source
  platform. That is exactly the coarse-category-plus-separate-descriptor split §A argued for from
  our own data, shipped by someone else. §A's ruling stands and now has outside confirmation.
- **mio's is VERIFIED but partial** (four values seen on their own review sheet and place card):
  *Attraction, Shopping, Nature, Restaurant*, each emoji-prefixed. Nouns, coarse, ordinary words —
  no provider type strings anywhere in their UI. Consistent with §A's third rule.

**mio's review-and-confirm sheet** — the surface most directly comparable to ours: a cat mascot,
*"mio found 5 spots!"*, then the **source card at the top** (caption text, platform icon, `@handle`,
video thumbnail), then one row per place — thumbnail, name, emoji category, and a **checkbox on the
right, with one row left unchecked**. So confirmation is opt-out per place, and the source stays
visible while you decide. Ours is the same shape; theirs shows the caption, which is worth stealing.

**mio's place detail**: photo, name, `hvar, croatia`, `Open • 11am–6pm, mon–fri`, then **one
category chip styled differently from the free tags beside it** (`Nature` outlined + emoji, then
`beach` `relaxing` `scenic` as plain chips) — the category/tag distinction made visible, which ours
does not do. Then `tldr;`, `local recs`, a photo strip, `pro tips`, and a bottom bar of
**[navigate] [source] [organise]**. Note the primary, filled action is **organise** — collection
assignment is the main verb on a saved place, ahead of favourite.

**mio's library**: `Your collections (12)` · `Countries (8)` · `All saves (10333)` · `Favs (30)`,
then a horizontal collection carousel of photo-mosaic covers with a `+ New Collection` tile, then
`Recently Added` as a photo grid with a heart overlay per card and a quick-action menu of
**Collection / Trip / Remove**. Two icons sit in the `Recently Added` header: an **inbox with an
unread dot**, and a videos icon — the processing queue, given permanent real estate rather than
being a transient toast.

**Two map findings, both directly relevant to us:**

1. **At world zoom mio renders no pins at all** — only flag-badged country bubbles with counts
   (UK 352, Germany 245). The zoomed-out map is a *summary*, not a thinned pin cloud. That is the
   §0.4 "automatic geography" idea rendered, and `clusters.ts` is already the primitive for it.
2. **Plotline's pins carry the category** — a coloured circle with a per-category glyph (fork,
   binoculars, wine glass, bed, sparkle), so category is legible on the map without opening
   anything. Ours are uniform. This is a small render change with a large retrieval payoff, and it
   is the map-side half of the same job as the inert tag chips (§0.3).

**Plotline's place sheet** shows **distance from the user on the card** (`Philadelphia · 2393 mi`),
three actions — **visited ✓ / not-interested ⊘ / save 🔖** — and `THE INSIDE SCOOP`: the creator's
recommendation **quoted with the `@handle` inline** (*"@safiyany visited this Insomnia Cookies
location … a secret backroom called the 'cookie speakeasy'"*). That is our `whyGo`, plus attribution
we already store and do not surface. **A "not interested" action is new** — it is the third state
between saved and deleted, and it is how a 5-result import stops being all-or-nothing.

## G. Shared collections, evaluated on their own — this replaces §E's second bullet

**§E was wrong to bundle these.** Three distinct things were filed as one:

1. **Public creator profiles and a follower graph** — a social network. Still out, unchanged.
2. **Publishing a list publicly** — a distribution surface. A separate question, not this one.
3. **A private collection two or more named, invited people both contribute to** — a multiplayer
   document. No graph, no feed, no discovery, no audience, no strangers.

Only (1) is what Charter §1 excludes. (3) is a different product object and deserved its own ruling.

**VERIFIED — both competitors ship it, and Plotline's pricing is the interesting part:**

- **Plotline: shared Collections are in the free tier, explicitly and permanently.** Their pricing
  page states it twice, and once in the negative: *"Collaboration is not part of [Premiere]"* — they
  monetise **planning**, not sharing. The model: **editor and viewer roles, each with its own invite
  link**, no cap on joiners, live updates, **every stop shows who added it**, and a **shared note
  anyone can edit**. Their screenshot shows a `👥 3` members chip, a `Share` button, overlapping
  member avatars on the map, and **a contributor avatar on every row of the list**.
- **mio**: collaborators appear on **Trips** (`Austin, Kevin, Sari +3`), and their web app serves
  share and invite routes.

**The structural finding: collaboration is separable from itinerary planning.** mio hangs it off the
*trip* — the dated itinerary object our charter declines — which is what made it look like planner
bloat in §E. Plotline hangs it off the **collection** as well, and keeps that half free. So adopting
shared collections does not drag us toward being a planner. That was the actual worry, and it is
unfounded.

**Why it fits *retrieval*, which is our job and not theirs:**

- Our primary user's failure mode is not only *"find it again"*; it is *"we are both going and only
  one of us has the list."* A shared collection is retrieval for two people. It extends the job we
  already claim rather than adding a second one.
- It is **the only growth loop available to a product with no feed and no creator pages**. An invite
  link is distribution that costs the sender nothing and requires no audience.
- Plotline pricing it free says they read it as retention and acquisition, not revenue. We should
  read it the same way and not plan to charge for it either.

**What it actually costs — stated plainly, because this is not a small feature:**

- It is **the first multi-writer object in our schema.** Every RLS policy touching `saved_places`
  goes from `owner = auth.uid()` to membership-based. That is a `security-privacy` review with a
  veto attached, not a UI task.
- **Invite links are unguessable-token public URLs** — a new externally-reachable surface, with
  revocation, expiry and abuse cases to specify. Note Plotline disallows exactly these paths
  (`/c/ /j/ /p/`) in robots.txt, which is the correct instinct.
- **Attribution needs a per-row actor column** (`added_by`), and it should be added at the same time
  as membership, not retrofitted.
- Shared notes raise a concurrency question we have never had to answer.

**Recommended filing — a change to the plan, not a decision taken:** move private shared collections
out of "excluded on no-social-graph grounds" and into **L2 as its own feature**, with the boundary
written down: **named invitees only; no public profiles, no follower graph, no discovery feed.**
It should **not** jump ahead of the resolver — §D's ranked list is unchanged by this.

**One thing to keep excluded that sits right next to it:** Plotline ships **Trending** — *"see what
other travelers are saving near you."* That is the discovery feed, it is a different product, and
being adjacent to shared collections is not a reason to let it in.

## H. Corrections to earlier claims in our own docs

- **§E bullet 2 ("shared collections with followers")** — withdrawn and replaced by §G.
- **`current-state.md` §5b, "Near-me is an open goal for the whole category. Nobody has it."** —
  too strong. True of mio. **Plotline shows distance from the user on every place card** and
  sequences trips from a home base with travel times. The narrower claim survives: nobody has
  *near-me as a retrieval mode* — a "what's around me right now" entry point — and that is still
  the open goal. The wider one does not.
- **§A's deferred item** — discharged for Plotline (complete, VERIFIED), partly for mio (four
  values). No further screenshot pass is owed.
