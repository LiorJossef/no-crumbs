# Iteration 6 — plan

**Status: draft, three inputs outstanding.** Written 2026-08-31, immediately after iteration 5 landed.
Three questions are being answered in parallel and two of them can reorder this document, so the
ordering below is provisional by design and says where.

The owner asked for seven things. They are not seven independent tasks — two are blocked on rulings,
one is a foundation the other six sit on, and one of them is a question whose answer decides which of
the rest matter. Listing them in the order they were asked would produce the wrong plan.

---

## 0. The blocker that is not ours

**CI has been red since 2026-08-30 20:06.** Every run fails in 2–3 seconds with no runner assigned,
no steps executed and no log output; Vercel reports *"Deployment was blocked"*. Nothing in the repo
causes it and nothing in the repo can fix it — the shape is account-level, most likely Actions
minutes or a spending limit.

**Consequence for this iteration:** work proceeds, landing does not. `merge-pr.sh` refuses any check
that is failing or pending and it *is* the gate on this plan, since branch protection is unavailable.
Every commit below accumulates on the branch until CI can run.

This is the only item on the list that needs the owner rather than the team.

---

## 1. The three questions being answered now

| Lane | Question | What it can change | Status |
|---|---|---|---|
| `i6-edge` | **What is this product's edge?** | The order of everything below | **Answered — `9779925`** |
| `i6-competitors` | Is the category actually as assertion-heavy as the edge ruling assumes? | Whether the edge ruling holds at all | Running |
| `i6-embed` | May we embed TikTok playback, in what shape, at what privacy cost? | Whether item 6 exists as described | Running |
| `i6-rtl` | How does Hebrew actually render today? | The size of item 2 | Running |

### 1.1 The edge ruling, and what it does to this plan

`docs/product-edge-2026-08-31.md`: the edge is the product's **refusal to assert anything about a
place beyond what the user confirmed and what open data can store forever**, in a category that
differentiates by adding exactly what that refusal excludes. **It is half built** — the refusal ships
(review step, fixed info boundary, honest no-places screen); *retaining what failed instead of
discarding it* does not.

Three consequences, and they are not cosmetic:

1. **§4 stops being "finish a table" and becomes the item that completes the differentiator.** It
   moves ahead of L2 polish. It does not move ahead of `L1-F10`, which is a deadline rather than a
   scope call — see §8.1.
2. **Any feature that asserts something unverified is now refused categorically, not case by case.**
   Ratings, "open now", trending, a leaderboard. Shipping one would not merely add scope, it would
   contradict the ruling. This is a standing filter on every future request, including ones that
   sound harmless.
3. **Single-player is now a ruled position, not an unfinished state.** A discovery layer is where a
   refusal-to-assert principle is tested hardest, so it is the fastest way to lose the edge rather
   than a growth lever to add later.

**The ruling rests on an assumption it could not test** — that the category really does compete by
asserting. `i6-competitors` is testing it against primary sources, instructed to look hardest for the
competitor that *does* exercise restraint. If that audit finds one, this section is wrong and §8 is
re-derived. The dependency is stated rather than buried because a roadmap has already moved on it.

---

## 2. RTL, and it is a foundation rather than a feature

**This is first because everything else renders content through it.** Polishing a card and then
discovering the place name inside it strands its punctuation is two jobs.

Scope is narrower than it sounds and the narrowness is the point: **the interface stays English.**
This is not internationalisation. It is English chrome correctly displaying Hebrew *content* — the
page direction stays `ltr` while individual strings are `rtl`, which is a different and much smaller
problem than translating the product.

It is also not hypothetical. The seeded city is Tel Aviv; a live import today resolved `הכוסם`.
Every place name, caption and note in a real user's library is already a bidirectional string.

Some `<bdi>` usage exists across several files. The audit establishes whether that is **systematic or
incidental** — one developer wrapping one field is not a strategy, and the gaps will be exactly where
nobody happened to think about it.

The fix classes, cheapest first: a missing isolate (`<bdi>`); a physical property where a logical one
belongs (`ml-` for `ms-`, `left-` for `start-`); a neutral character (`·`, `→`, `↗`, brackets)
sitting outside its isolate and taking direction from the wrong neighbour; truncation putting the
ellipsis on the wrong side.

**Sized after the audit, not before.** If Hebrew renders essentially correctly, this collapses to a
regression test and the iteration gets cheaper.

---

## 3. Polish, edges and motion

The motion vocabulary already exists — `src/lib/interaction.ts`, with named beats from `PRESS_BEAT`
(90ms) through `ENTER_SCREEN` (440ms). **This item is not "add animations". It is applying the
vocabulary where it is still missing and fixing the edges that iteration 5 measured and did not
close.**

Carried forward with numbers, so none of this needs re-measuring first:

- **The import screens still have the dead-space defect the message screens just lost.** ~700px above
  a pinned action on the paste screen at 390×844, against `iteration-2-plan.md`'s `I2-5`. The rail
  screen's three-`flex-1`-joints pattern is the fix, and `error.tsx`/`not-found.tsx` at `06c1b6d` are
  the worked example.
- **`AddPlacesPanel`, `SharePanel`, `CollectionPlaceDetail`** each carry their own `<h2>` for a pushed
  pane. Same heading question the collections views answered at `a5a2d09`; deferred there because
  getting all three right without regressing focus management is its own task.
- **Edges**: the desktop list still guillotines its last row mid-glyph with no fade or scroll
  affordance (`ui-review-2026-08-31.md` §15).

---

## 4. Entities — the schema shipped, the product did not

`place_mentions` exists as of migration `0031`, applied and with its cascade proven by executing a
real `profiles` delete and an `auth.users` delete against a control row. **Nothing in `src/` reads
it.** That is the whole of item 4: a table with no product on top of it.

E1 stores *the mention we could not place* — a name a caption gave us that we could not resolve to a
coordinate, kept with its reason (`no_match`, `match_too_weak`, `beyond_candidate_cap`,
`platform_not_read`, `skipped_at_review`) instead of discarded.

**This is where the edge question lands hardest.** At LEVEL B's ~27% hit rate, "no places found" is
the modal import outcome. A product that keeps what it could not place is doing something a product
that discards it structurally cannot — or it is rationalising a weakness. `i6-edge` rules on that,
and the ruling decides whether this item is the iteration's centre or a small screen.

The remaining proposals from `docs/entity-proposal.md`, unchanged and awaiting the same ruling: **E2**
the account that posted it (*"a screen, not a table"*), **E3** a start point (*"genuinely new — a
coordinate that is not a recommendation"*), **E4** a note entry. **E5 trips was interrogated and
recommended against** — *"a trip is a collection plus two dates"* — and that verdict stands unless the
owner overrides it.

---

## 5. The two named surfaces

### 5.1 Profile page → profile menu

The owner's framing is a UI request; the **architectural** argument is stronger and points the same
way. `/profile` is a sibling route segment, so reaching it unmounts the map — the exact defect that
made places↔collections tear down a WebGL context and refetch tiles until `6378580` moved all three
views onto `/map` behind search params. Profile is the last surface still paying that cost.

So this is not a restyle, it is the same move applied to the last route that needs it.

**The decision it forces:** `/profile` currently holds identity, library total, countries visited,
categories, the theme control and the account actions. A menu holds the account-shaped half —
identity, theme, sign out, delete-my-data. It does not hold *countries visited*, which is a small
piece of personal cartography and arguably the nicest thing on the page.

Proposed split, for `ux-interaction` to confirm or overturn: the **menu** takes identity, appearance
and account; the **stats become a view in the same drawer slot** the places and collections lists
already use, reachable from the menu. Nothing is deleted.

`/profile` keeps working as a URL and redirects, the way `/collections` does — it is in history and
in bookmarks, and the one thing a URL may not do is stop working.

**`L1-F8-T1`, the account menu with delete-my-data, is the last unbuilt L1 product feature.** It is
the same surface. Building it here closes L1.

### 5.2 The sign-in background

A gentle, drifting map grid behind the sign-in card. The recommendation, with the reasoning, since
the owner has previously said to make these choices ourselves:

**A synthetic canvas grid, not a real basemap.** A real MapLibre canvas drifting over Tel Aviv is the
more romantic idea and I am rejecting it: it puts a tile fetch, a WebGL context and a style request in
front of the one screen that must be instant, and it drags CARTO's attribution onto an unauthenticated
page. The effect is achievable without any of that.

What it should be: **two parallax layers of city blocks** — not a uniform lattice, which reads as
graph paper rather than cartography — drifting slowly on a diagonal, at very low contrast against the
sign-in ground. A few longer runs act as arterial roads. One or two mint points sit on the grid and
breathe, at the brand accent, because the product's whole subject is *places on a map*.

Hard constraints: **it must not be the AI-default animated mesh gradient**; it respects
`prefers-reduced-motion` by rendering a static frame, not by disappearing; it never delays or
obscures the form; and it stays behind the card at a contrast that leaves every WCAG ratio on the
form untouched. Canvas, not a long hand-authored SVG path set.

---

## 6. TikTok video preview — gated

A popover card on a video thumbnail that plays the embedded video.

**Blocked on `i6-embed` and not designable before it lands.** Three things have to come back before
this is specified, let alone built:

1. **Whether we may.** Iteration 5 established a VERIFIED refusal on TikTok's logo, icons, symbols and
   designs absent written permission. Embedding is a *different* mechanism with a sanctioned path —
   oEmbed exists to let third parties display content, and this product already consumes it — so the
   refusal does not automatically extend. It also does not automatically not extend.
2. **Whether it can play the way the owner described.** If the embed requires a click and cannot
   autoplay or play on hover, "a popover that plays the video" is a different design.
3. **What it costs the user.** This product deliberately sets `referrerPolicy` on TikTok thumbnails so
   the browser does not hand TikTok's CDN the URL of the page being viewed. **An embedded player is a
   much larger disclosure than a thumbnail request.** If a preview costs the user a disclosure they do
   not currently make, that is the owner's decision and `security-privacy` holds a veto on the data
   path.

One possibility worth holding open: the official embed carries TikTok's own branding, and a
first-party player may be the one place their mark can legitimately appear on our surface. That would
resolve the trademark tension rather than create it. It is an instinct, and `i6-embed` was told to
test it rather than ratify it.

---

## 7. The carried defect that is not on the owner's list

**No desktop entry point exists for manual add or for creating a collection.** `AddSheetHost` mounts
unconditionally on `/map` but its only opener is the `＋` in `BottomNav`, which is `lg:hidden`. Above
`lg` the sheet is unreachable and so are both actions inside it; the desktop panel's CTA goes straight
to `/import`, so a link is the entire desktop add path.

Found twice in one session from opposite directions, by two lanes neither of which was looking for it
(`ui-review-2026-08-31.md` §7.4).

It belongs in this iteration because §5.1 rebuilds the surrounding navigation anyway, and answering
*where a desktop `＋` lives* while that work is open is much cheaper than patching a route onto it
later.

---

## 8. Ordering

Revised against the edge ruling. Still provisional where §1 says so.

1. **RTL (§2)** — foundation, and it sizes itself from the audit.
2. **Entities (§4)** — promoted. On the edge ruling this is the item that completes the
   differentiator, not a leftover schema task.
3. **Profile menu + desktop `＋` (§5.1, §7)** — one navigation change, not two, and it closes the last
   unbuilt L1 product feature.
4. **Sign-in background (§5.2)** — self-contained, no dependencies, slots anywhere.
5. **Polish and motion (§3)** — continuous, and partly a cleanup of what iteration 5 measured.
6. **TikTok preview (§6)** — only after `i6-embed`, and only in whatever shape is permitted.

**Concurrency:** §2, §5.2 and §4 have disjoint write scopes and can run as one wave. §5.1 and §7 are
the same files and must be one lane. §3 overlaps everything and goes last or in the gaps.

### 8.1 Two things above this plan that the owner owns

**`L1-F10` — graded artefacts and submission.** The edge ruling puts it first, and it is not in this
plan because the owner asked for a UI/UX iteration and this is a course deadline, not a product
feature. **Not silently reordered around.** If it has a date, it outranks everything here and the
owner is the only one who knows.

**A gap between the ruling and the positioning.** `brand-and-product-foundation.md` §1 positions the
product on **mechanism** — geography replaces chronology. That is true, and it is copyable in a
sprint; it is a different axis from the refusal-to-assert claim the edge ruling identifies as the
actual moat. `i6-edge` flagged this as a gap rather than a contradiction and did not touch the
positioning copy, correctly: §3 of that document is closed, and positioning is owner and
`voice-and-vocabulary` territory. **Recorded as an open decision, not a proposed edit.**
