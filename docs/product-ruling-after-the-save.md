# Product ruling — the loop after a save

> Owner: `product-lead`. Date: **2026-08-29**. Status: **a ruling**, not a spec and not a feature
> list. Task ID `LOOP-AFTER-SAVE-1`.
>
> Written against owner intent given mid-session: *"after I save places, it still feels like there
> isn't enough meaningful product activity — it risks becoming a nice map of pins rather than
> something I keep using… what are the smallest high-leverage capabilities that make the library
> useful, organizable, revisitable and worth returning to? … Keep it Lean."*
>
> Inputs: the orchestrator's observed session against 25 real saved places (13 Tel Aviv, 12 London);
> `mvp-plan.md` §2/§6/§8; `00-project-charter.md` §2/§4; `execution-plan.md`;
> `brand-and-product-foundation.md` §2/§6; and the schema as it exists in
> `supabase/migrations/0006_saved_places.sql` and `0019_saved_place_enrichment.sql`.
>
> **Nothing here is verified.** I have no shell. Every cost below is sized by reading code, and the
> done/not-done call stays with the orchestrator on `qa-reliability`'s evidence.

---

## 1. The loop, named

Charter §3's loop stops at "explore on map". That is the bug. The real loop is longer, and the
product's coverage ends two thirds of the way through it.

| # | Step | Served today? |
|---|---|---|
| 1 | Sees a TikTok about a place | outside the product |
| 2 | Copies the link | outside the product |
| 3 | Pastes it | **yes** — `L1-F2` |
| 4 | Product reads it, extracts, resolves | **yes** — Google: 15/16 correct top-1, 12/16 auto-resolved, 0 wrong auto-matches (2026-08-28). The 44% this line used to quote was Overture under superseded weights |
| 5 | Reviews and confirms | **yes** — `L1-F3`, never cut |
| 6 | The place lands on the map | **yes** — the post-confirm flight |
| 7 | **Time passes. Weeks.** | **no** — nothing changes, nothing is remembered, nothing decays |
| 8 | **A need arrives**: hungry, in a neighbourhood, a friend visiting, a trip booked | **no** — the product has no way to be present at this moment |
| 9 | **Narrows to a shortlist** | **partly** — search finds what you already have in mind; tag chips and the viewport narrow. Nothing narrows by *state* or by *where I am standing* |
| 10 | **Picks one** | **no** |
| 11 | Navigates there | **yes** — the Google Maps link |
| 12 | Goes | outside the product |
| 13 | **Comes back having been** | **no** — the library cannot record this, so it never resolves |
| 14 | Loop restarts, library one place bigger and no lighter | — |

**Where it breaks, in one line:** the product serves *capture* end to end and serves *retrieval only
when the user already knows what they are looking for*. Steps 7–10 and 13 are unserved, and 13 is
the structural one — an append-only library with no completion state can only grow, so every
retrieval gets harder exactly as the library gets more valuable. That is the graveyard mechanism.

**A second framing that makes the gap concrete.** The product has two retrieval modes:

- **by identity** — I know the name, I search for it. Built.
- **by geography** — I look at a map. Built.

It has neither of the two modes a person actually uses between saving and going:

- **by state** — what is still outstanding. *No mechanism exists at all.*
- **by proximity to me** — what is near me right now. Planned as `L1-F11`, not built.

Everything below follows from that sentence.

---

## 2. The ruling: three capabilities, ranked, and nothing else

Ranked by **product impact per unit of build**, which is not the same as by impact. Build in this
order. Do not build them in parallel; #1 makes #2 and #3 better and none of that works in reverse.

### #1 — The library resolves: *been* / *not been yet*

**What it is.** A saved place can be marked as somewhere you have been. The library can then be
narrowed to what is still outstanding. That is the whole feature.

**The user question it answers.** "Have I already done this one?" and — the one that matters more —
"what have I got that I *haven't* done yet?"

**What it costs against the schema we already have: almost nothing, and this is the finding that
decided the ranking.** `saved_places` has carried this since migration `0006`:

```sql
visit_state text not null default 'want_to_go' check (visit_state in ('want_to_go', 'visited')),
visited_at  timestamptz,
constraint saved_places_visited_at_consistent
  check (visit_state = 'visited' or visited_at is null)
...
grant update (display_name, category_override, note, visit_state, visited_at)
  on public.saved_places to authenticated;
```

The column exists, is NOT NULL with a safe default (so **no backfill** — all 25 existing rows are
already `want_to_go`), is protected by a CHECK, and **is already inside the user's own UPDATE column
grant**. `src/app/map/_lib/get-spots.ts` already selects both columns; `src/domain/places/spot.ts`
already declares `VisitState` and carries `visitState`/`visitedAt` on `Spot`. Nothing in `src/`
reads or writes them — grep for `visitState` returns exactly those two files.

So the build is: **one server action** (a line-for-line sibling of `updateSavedPlaceCategory` in
`src/app/actions/saved-places.ts`), one control in the detail sheet, one visual state on pin and
row, and one filter reusing the chip-filter machinery that already narrows list *and* pins. **No
migration. No new grant. No new stored field. No boundary question.** The plumbing for this feature
was built eleven migrations ago and then never wired up.

**What I am explicitly cutting from it, so it does not grow:** ratings and stars; a "how was it"
prompt; visit counts; a visit history or timeline; dates you can edit; check-ins; auto-detected
arrival; photos of the visit; anything that sorts the library by visit state. Every one of those
needs a new stored field and none of them is needed for the library to get lighter. The capability
is a boolean and a filter.

### #2 — Near me

**What it is.** `L1-F11`, already ruled into L1 by the owner on 2026-08-27, still unbuilt. A control
that requests location once on an explicit tap and moves the viewport to it, with distance shown
only against a real user location.

**The user question.** "I'm in this neighbourhood right now — what did I save near here?" This is
the everyday half of the single primary user in `brand-and-product-foundation.md` §2, and it is the
half L1 otherwise does not serve at all.

**What it costs.** Medium and already specified, with two exit criteria written. Cheaper than it
looks because it is a control that *sets the viewport*, not a second retrieval system. One caveat
the plan does not carry: it depends on `L1-F5-T2`, whose interaction model the owner reviewed and
explicitly did not settle (`current-state.md` §0.1b). Near-me does not depend on the *disputed* part
— continuous viewport tracking — only on the nearest-first sort and the camera anchor, both of which
survive the rethink. Say so in the task rather than letting the dependency block it.

**Why it is #2 and not #1.** It is the bigger capability but the larger build, and on its own it
answers "what did I save near here" with a list that includes four places you already went to last
month. #1 is what makes #2's answer correct. Together they produce the sentence this product is
missing: *"three places near you that you haven't been to yet."*

**Explicitly cut from it, and already named as out of scope in `L1-F11`:** stored location,
background location, a location-derived default camera on load, geofencing, arrival notifications.

### #3 — Labels the user writes themselves

**What it is.** The user can attach their own short labels to a saved place — `date night`,
`tokyo trip`, `coffee to try` — and filter by them exactly as the extracted tag chips already
filter. Not collections. A label on a save.

**The user question.** "What did I save for the Tokyo trip?" and "where do I take people for dinner?"
— the grouping the user controls, which the product currently has no answer for at all.

**What it costs.** One migration adding `user_tags text[]` to `saved_places`, widening the UPDATE
column grant by one name, a server action, an add/remove control, and **reuse of the existing chip
filter**. Migration `0019`'s own header already reserves this exact column and this exact shape:

> *"USER-AUTHORED TAGS ARE A DIFFERENT COLUMN, DELIBERATELY NOT ADDED HERE… The day the product lets
> a user add or remove their own tag, it gets `user_tags` beside `note` in the overlay grant."*

`normalize_tag_list()`, `tag_list_within()` and the BEFORE trigger already exist, are IMMUTABLE, are
granted to `authenticated`, and are tested. The extraction/authored provenance distinction is
preserved by construction because it is a second column.

**This one needs an owner ruling before it is built — see §5.** It is a new stored field, and the
MVP boundary sentence has to be argued, not slipped past.

**Explicitly cut from it:** collection cover images, an ordering or reordering UI, a collection
detail route, sharing, nesting, smart/auto collections, a label manager screen. A label is created
by typing it on a place and removed by removing it. If a label needs a home page, it was a
collection and we did not build one on purpose.

### And a fourth thing, ruled *out* rather than ranked: a return trigger

The observation "nothing ever brings the user back" is correct and I am ruling that **we do not
build a mechanism for it**, now or at L1.

We have no channel. Charter §4 excludes PWA install and share-target;
`brand-and-product-foundation.md` §6 already names notifications as out. A web app with no install
and no push cannot interrupt anyone, and building engagement mechanics *inside* a product nobody has
opened is a loop that starts nowhere.

The honest answer is that **the return trigger is usefulness at the moment of need**, which is
precisely #1 + #2: the product earns the tap when "I'm out and hungry" reliably produces "these
three, and you haven't been to any of them." That is a real reason to open it on a Tuesday and it
does not need a notification.

**Cut, permanently, from this level:** push or email notifications, weekly digests, "on this day",
streaks, badges, saved-place counts as achievement, home-screen widgets, re-engagement copy of any
kind. If the owner ever wants this, it starts with a channel decision (PWA), not with a feature.

---

## 3. The cut list, in the order things get sacrificed

If the schedule slips, take from the top. This is the mechanism, not a wish list.

| Order | Cut | Comes out of |
|---|---|---|
| 1 | Visited state on the **map pin** (keep it on the list row and the detail sheet) | #1 |
| 2 | The `not been yet` **filter** — the state still shows, it just cannot narrow | #1 |
| 3 | Distance figures in near-me (the camera move alone still answers the question) | #2 |
| 4 | #3 entirely — labels are deferred, not cut, and geography covers the trip case | #3 |
| **Never** | The visited **write path**: if a user can mark a place and it does not survive a reload, that is worse than not shipping it | #1 |

---

## 4. Collections: the verdict

**No — personal collections are not the right next capability, and something smaller is genuinely
ahead of them.** Three reasons, and the first is the one that would have cost us most. The trip
question — the case people always cite for collections — is already being answered *geographically*
and for free: the "ELSEWHERE — London, 12 places" affordance shipped, and the world/country library
summary is the intended zoomed-out direction at L2. A user-made "Tokyo" collection would duplicate a
grouping the product derives from coordinates it already holds, and then the two would disagree the
first time a place was saved into one and not the other. Second, the part of collections that
geography *cannot* derive — "date night", "coffee to try" — is not a container, it is a **label on a
save**, and migration `0019` already reserves `user_tags` with the normalisers written, granted and
tested; that is roughly 80% of the felt value of collections for one column and zero new surfaces,
against a new table, membership RLS on the hot read, a new route, an ordering, a name, a cover and
a manager screen. Third and most important: the library's disease is that it never resolves, not
that it is unsorted — adding a second organising axis to an append-only pile produces a tidier pile,
and a person with 300 saves and no completion state will feel worse about them, not better.
**Collections stay at L2 as the *shared, named-invitee* object they were filed as on 2026-08-28** —
that decision is unaffected and I am not reopening it; collaboration remains the thing collections
are genuinely *for*, and it can hang off `user_tags` or off a real collection object when it is
built. **Personal collections are deferred, not cut. The evidence that would change my mind:** ship
#3, and if users create three or more labels and then reach for an ordering, a cover, a description,
or "send this list to someone", the label has outgrown its shape and the container is justified.
Until that happens, building it is inventing a need.

---

## 5. What needs an OWNER decision

Two things. Neither is mine and neither is the orchestrator's.

**OD-1 — Does `user_tags` widen the MVP boundary, and is that authorised?** (Blocks #3 only.)

`CLAUDE.md` fixes stored info at *name · category · coordinates · source link · user note*, "which
is exactly what open data lets us store forever". The argument for `user_tags` being inside it: that
sentence's stated *reason* is a licensing constraint on **place facts we obtain from a provider** —
it is about what we may keep about a venue forever. A user-authored label is not a place fact; it is
the user's own words about their own save, which is the same class as `note`, and `note` is already
inside the boundary. On that reading `user_tags` is a clarification, not a widening. The argument
against: it is still a new stored column and Charter §4 says new ideas go to a Future list unless
the owner rules otherwise, and the boundary sentence enumerates fields rather than classes. **I am
not treating my own reading as the ruling.** The question to answer is one line: *does the "info"
boundary govern place facts only, or every stored field?* If place facts only, #3 proceeds. If every
field, #3 goes to the Future list and #1 and #2 are unaffected.

**OD-2 — Nothing.** For completeness and so nobody goes looking: **#1 needs no owner decision.**
`visit_state` and `visited_at` were designed into `0006` against `08-place-identity.md`, are already
inside the user's own UPDATE grant, and are a per-user overlay in exactly the sense the boundary
sentence does not speak to. Shipping them widens nothing. **#2 needs no owner decision** — near-me
was already promoted into L1 by owner ruling on 2026-08-27 and stores no location anywhere.

---

## 6. Acceptance criteria — #1, the visited state

Written so `qa-reliability` can verify without asking me. Verified **signed in, at 390×844 and
1440×900**, against a library of at least 20 real saved places across two cities.

**Copy note:** the strings below are the default and ship if nobody objects. `ux-interaction` owns
copy and may replace them without changing a single criterion — but the *schema* words
(`visit_state`, `want_to_go`, `visited`) may never appear on screen
(`brand-and-product-foundation.md` §4 rule 2).

### 6.1 The write path — never cut

1. **A saved place can be marked as somewhere you have been, from the place detail sheet**, with a
   control sitting alongside the note. Default label: **`Been here`**; once set, the state reads
   **`Been`**.
2. **The mark survives a full page reload and a sign-out/sign-in.** Verified by reading the row, not
   only the screen: `visit_state = 'visited'` and `visited_at` is a real timestamp.
3. **Unmarking works and does not violate the CHECK.** This is the one real trap in the feature:
   `saved_places_visited_at_consistent` is `check (visit_state = 'visited' or visited_at is null)`,
   so an update that sets `visit_state = 'want_to_go'` while leaving `visited_at` populated **fails
   with 23514**. Both columns must move in a single UPDATE, both ways. Assert the round trip
   mark → unmark → mark, and assert that the failing shape is genuinely tested rather than avoided.
4. **The action is a sibling of `updateSavedPlaceCategory`** in `src/app/actions/saved-places.ts` —
   the caller's own client, no `user_id` filter in the code (`saved_places_update_own` is the
   control), `count: 'exact'`, and zero rows reported as the existing `GONE` string. The reasoning
   in that file's header applies unchanged and should not be re-derived.
5. **A second browser profile cannot mark another user's save.** Proven by attempt, at the database:
   the update matches **zero rows**. Not by reading the policy.
6. **No new migration exists in the diff.** If the branch contains one, the task was misunderstood.
7. **No new grant exists in the diff.** `0006`'s UPDATE column list already covers both columns.

### 6.2 The state is legible

8. **The list row shows the state without being opened**, and does so without adding a nested
   interactive element inside the row's own button — the row remains one tap target. This is the
   same constraint that keeps list-row tag chips inert (`src/ui/place/enrichment.tsx`, the 44px
   floor); a row-level *toggle* is out of scope and the write path stays in the detail sheet.
9. **A place you have been to is visually distinct on the map and still a normal pin**: it keeps its
   category glyph, stays tappable, and does not introduce a new colour that competes with the seven
   category colours. Reduced emphasis (opacity/desaturation) over a new hue.
10. **A place you have been to never disappears from an unfiltered map or list.** Marking is not
    archiving.

### 6.3 The state narrows the library

11. **One filter, default label `Not been yet`**, sitting with the existing tag chips, using the
    existing pressable-chip pattern with `aria-pressed` and the removable `ActiveTagFilter` pill.
12. **It filters the list and the pins in the same frame.** Two surfaces answering the same question
    differently is a fail — this is the rule `L1-F6-T2` already established and it is not
    renegotiated here.
13. **It composes with search and with a tag filter.** `Not been yet` + `dessert` + a pan gives one
    coherent result set, and clearing any one of the three restores the others.
14. **The header count says what it is counting when the filter is on.** The existing honest-noun
    rule holds: a bare number with an ambiguous denominator is a fail.
15. **The all-filtered state is designed, not empty.** Marking every visible place as been must
    produce a written state with a way back — never a blank list under a populated map.

### 6.4 Accessibility and behaviour

16. **The control is ≥44px, reachable by keyboard, carries `aria-pressed`, and its accessible name
    includes the place and the state** (e.g. *"Been here, Anat Bakery"*).
17. **The change is announced** through the existing debounced `role="status"` line, and announcing
    twice quickly does not announce a stale result.
18. **The camera does not move** when a place is marked. This is a state change, not a navigation.

### 6.5 Explicitly out of scope, so it is not absorbed

Ratings, stars, a "how was it" prompt, visit counts, visit history or timeline, an editable visit
date, check-ins, auto-detected arrival, photos, sorting the library by visit state, any new column,
any change to `places`, any change to the import or resolver path, and any onboarding or
notification surface. Scope creep to refuse now: *"while we're in the detail sheet, let's also…"*.

---

## 7. Where the roadmap lands (nothing deleted)

| Item | Placement after this ruling |
|---|---|
| Visited / not-been-yet | **L1, new `L1-F12`, next.** No migration, no boundary question |
| Near me | **L1-F11, unchanged**, and it is the item after `L1-F12` |
| User-authored labels (`user_tags`) | **Proposed `L1-F13`, blocked on OD-1.** Not staffed until the owner rules |
| **Personal** collections | **L2, deferred behind `user_tags`.** Evidence that would promote it is in §4 |
| **Shared** collections (named invitees) | **L2, unchanged** — the 2026-08-28 ruling stands and is not reopened |
| World/country library summary | **L2, unchanged.** It is the answer to the trip question, which is why §4 rules as it does |
| Audio transcription | **L3, unchanged**, behind the `ContentExtractor` seam |
| Cover-frame OCR | **Refuted, not deferred** — recall 1/8 and it reads background shopfronts as venues. It should stop appearing on roadmaps as a pending idea |
| Natural-language search | **L3.** It is a re-skin of retrieval, and it needs something to search over: it is worth strictly more after `user_tags` and the visited state exist than before them |

---

## 8. Stale ownership in `execution-plan.md`

I own calling this out. Five entries currently read as staffed while no work is happening, which
makes the ladder look healthier than it is:

1. **`L0-F3` (global resolver)** — owners `maps-geospatial` + `security-privacy`, feature **parked**
   by owner decision since 2026-08-27. Reads staffed; is not.
2. **`L0-F6` (streaming route)** — owners `nextjs-architect` + `devops-vercel`, **paused since
   2026-08-20**; `/api/imports/probe` is still the stand-in. Reads staffed; is not.
3. **`L1-F7-T1` (manual add)** — **shipped 2026-08-30** (`src/components/add/add-sheet.tsx`,
   `src/app/actions/manual-add.ts`), against a stale exit criterion naming an un-ingested city and
   the parked `PlaceResolver`. Close it against what Google Places actually does.
4. **`L1-F5-T2`** — marked **`IN PROGRESS 2026-08-27`**. It shipped, and the owner then reviewed the
   shipped interaction and explicitly did not settle it (`current-state.md` §0.1b). "In progress" is
   the one label that is wrong in both directions.
5. **`L1-F11` (near me)** — depends on `L1-F5-T2`, whose interaction model is under review. The
   dependency should be narrowed in the plan to the parts that survive (nearest-first sort, camera
   anchor) or near-me will look blocked when it is not.

None of these is a scope change and I am not making one. They are labels that should match reality.

## Change log

| Date | Change |
|---|---|
| 2026-08-29 | Created, `LOOP-AFTER-SAVE-1`. Named the fourteen-step loop and located the break at steps 7–10 and 13; ruled that the product has retrieval by identity and by geography and neither of the two modes people actually use — **by state** and **by proximity**. Ranked three capabilities by impact-per-build and refused a fourth. **#1 the visited state**, ranked first on a schema finding: `visit_state`, `visited_at`, their CHECK and the user's own UPDATE column grant have existed since migration `0006`, `get-spots.ts` already selects them and `Spot` already carries them, and nothing in `src/` reads or writes them — so the capability that fixes the append-only library needs **no migration, no new grant and no boundary widening**. **#2 near-me** (`L1-F11`, already owner-promoted, unbuilt), with the note that it depends only on the parts of `L1-F5-T2` that survived the owner's review. **#3 user-authored labels**, using the `user_tags` column `0019`'s header already reserves — **blocked on one owner ruling (OD-1)**: whether the "info" boundary governs place facts only, or every stored field. **A return trigger is ruled out entirely**, not deferred: there is no channel (no PWA, no push), and the honest trigger is usefulness at the moment of need, which is #1 + #2. **Collections: no.** The trip case is answered geographically and for free by the L2 country summary; the non-geographic case is a label, not a container, at a tenth of the cost; and a second organising axis over an append-only pile makes a tidier pile. Personal collections deferred to L2 behind `user_tags` with the promoting evidence written down; the 2026-08-28 shared-collections ruling is untouched. Cover-frame OCR reclassified from deferred to **refuted**. Acceptance criteria written for #1, including the one real trap — `saved_places_visited_at_consistent` makes an unmark that leaves `visited_at` populated fail 23514, so both columns must move in one UPDATE. Five stale ownership entries in `execution-plan.md` named |
