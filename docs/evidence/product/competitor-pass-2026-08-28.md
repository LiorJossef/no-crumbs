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
