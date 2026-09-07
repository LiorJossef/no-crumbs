# The map is the query — viewport-bound saved places

> **Status 2026-08-30: BUILT, then half-overruled.** **Dead:** §1 (the query rect as list membership)
> and §4 (the list follows the viewport) — the owner rejected continuous viewport scope;
> `ux-stable-area-list.md` replaces them. **Live and binding:** §2 header copy, §3 sheet stops, §5
> empty library (specced, the auto-opening overlay is still unbuilt), §6, §7, §8.
>
> **Task:** `L1-F5-T2b`. **Owner of this document:** `ux-interaction`. **Owner of the code:**
> `design-system-frontend`.
>
> **Binding inputs:** `docs/history-2026-08.md` §9.1 step 1 and §9.3 (acceptance criteria),
> `docs/ux-architecture.md` §1.3 / §1.4 / §6.6 / §9.3, `docs/brand-and-product-foundation.md` §4–§6.
>
> **Surfaces affected:** `src/app/map/map-page-client.tsx`, `src/components/sheet/place-sheet.tsx`,
> `src/components/sheet/place-desktop-panel.tsx`. Nothing else.
>
> **Deviations from a binding document are listed in §10.** There is exactly one.

---

## 0. The change in one paragraph

Today the sheet says `20 places saved` and lists the whole library no matter where the map is
pointed. The map is a scoping control wired to nothing, which is why it reads as decoration behind a
list. After this change **the list is exactly what is in the current viewport, always**, and the
header names the area rather than counting the collection — `12 places in London`. Search composes on
top as a second narrowing. Panning is the primary retrieval gesture in the product, and after this
change it is the only one that does not require typing.

**The one idea underneath every decision below:** this product's job is *retrieval* — find it again
when you are standing there — not collection. So the map screen stops reporting how many places you
own. That number is a collection metric. It is not deleted because it is hard; it is deleted because
it answers a question the product does not ask.

---

## 1. The query rect — what "in the viewport" means

Everything in this document depends on one rectangle. Define it once, in `map-page-client.tsx`, and
let both surfaces read the same list.

**The query rect is the map canvas's geographic bounds, inset by the chrome that permanently covers
the map at rest:**

| Breakpoint | Inset |
|---|---|
| Mobile (`< lg`) | bottom inset = `PEEK_PX` (128) + `env(safe-area-inset-bottom)`. No other inset. |
| Desktop (`lg+`) | left inset = the panel's rendered width (`clamp(320px, 26vw, 392px)`). No other inset. |

Three rules that make it behave:

1. **A place is in the viewport when its pin's *anchor point* is inside the rect.** Not its icon's
   bounding box, not its label. The anchor is the only thing that is stable across zoom levels and
   does not depend on icon size, so it is the only rule that gives the same answer twice.
2. **The inset never changes when the sheet moves.** It is computed from the *peek* height whatever
   stop the sheet is at. This is the answer to the question the brief asks about a half-clipped pin,
   and the reason is interaction, not geometry: if the inset tracked the sheet, dragging the sheet
   from peek to half would silently delete rows from the list you are dragging toward. The list must
   never change as a consequence of looking at the list.
3. **The same inset is the camera's `fitBounds` padding.** If "fit these places" and "these places
   are in view" disagree, every camera move produces a list that does not match what landed on
   screen. One constant, two consumers.

At `half`, some listed places sit behind the sheet. That is the forgiving direction of the error —
the list is a superset of what is visible, and every row is one tap from being framed. The opposite
error (a pin you can plainly see that is not in the list) is the one that destroys trust, and this
rule makes it impossible.

**Antimeridian:** use MapLibre's `LngLatBounds.contains()` on wrapped coordinates rather than
comparing raw longitudes. A viewport crossing 180° is not a supported *feature*, but it must not
produce an empty list.

---

## 2. Header copy — the complete matrix

### 2.1 The area label

Computed from the places **inside the query rect**, never from the camera and never from a geocoder.

- Group the in-rect places by `normalise(locality)` (the project's one text-equality function —
  `current-state.md` §7). Places with no locality join a `null` group.
- The label is **confident** when the largest non-null group covers **≥ 70%** of the in-rect places.
- Display the **most common raw spelling** inside that group — this is what stops `Tel Aviv-Yafo` /
  `Tel Aviv` / `Tel Aviv` shipping as three different area names for one place.
- Otherwise the area is **ambiguous** and the copy says `this area`.

At `n = 1` the single place's locality is the label if it has one, ambiguous if not. Two clusters in
one viewport (London and Tel Aviv both on screen at a continental zoom) fall out of the 70% rule
naturally as `this area`; no extra rule is needed, and none should be added.

### 2.2 The strings

`{n}` = places in the query rect. `{m}` = of those, how many match the search. `{Area}` = §2.1.

| State | Exact string |
|---|---|
| Places in view, area confident | `12 places in London` |
| …singular | `1 place in London` |
| Places in view, area ambiguous | `12 places in this area` |
| …singular | `1 place in this area` |
| Search active, matches in view, area confident | `3 matches in London` |
| …singular | `1 match in London` |
| Search active, matches in view, area ambiguous | `3 matches in this area` |
| Search active, no matches in view | `No matches in this area` |
| No search, nothing in view | `Nothing saved in this area` |
| Library is empty (0 saved, ever) | §5 — a different screen, not a different string |

**`3 of 20` is retired everywhere, and this is the direct answer to the brief's third case.** With two
narrowings live at once the denominator becomes ambiguous — is `20` the library, or what is in view?
`3 matches in London` has no denominator to misread, cannot be heard as "you have three places", and
names the thing the user is actually looking at. It also composes cleanly: the noun changes from
`places` to `matches` exactly when a second filter is applied, which is the whole difference in one
word.

**The word `saved` disappears from the map screen** except in `Nothing saved in this area`, where it
is load-bearing (it says the map is fine, your library just does not reach here).

**Nowhere on `/map` is the library total displayed.** See §0. `totalCount` stays as a prop only to
detect the empty library (§5); it is no longer rendered.

### 2.3 Escapes attached to the empty states

**`Nothing saved in this area`** carries one action directly beneath it, a 44px text-weight button:

> **`Show my places`**

**What it does to the camera:** it fits the **cluster nearest the current viewport centre** —
centroid distance, using the same ~50 km coordinate clustering as the home-anchor rule — with the §1
padding, capped at z13. Not the whole library.

Why not the whole library: fitting all clusters is precisely the continental two-bubbles-no-pins view
that step 1 of the build order exists to kill. A button that produced it would undo the feature it
ships beside. Nearest-cluster is also the better answer to what the user meant: they panned into
empty ocean, and they want to be back at the places they own, closest first.

**`No matches in this area`** carries two actions, in this order:

> **`Show all matches`** — re-fits the camera to all library-wide matches for the current query (the
> existing `useSearchFlight` behaviour, invoked on demand). Only rendered when there is at least one
> match somewhere in the library.
>
> **`Clear search`** — the existing control, unchanged. Clearing restores viewport binding and re-fits
> to the nearest cluster (same behaviour as `Show my places`).

Neither empty state uses an illustration, an icon, or a bordered card. A line of text and a text
button, in the flow of the list, exactly as `NoSearchMatches` does today.

---

## 3. The sheet's three stops

The peek row's `${totalCount} places saved` is replaced. The header string is **the same string at
every stop** — one function, one call site per surface.

| Stop | What the header line reads | Notes |
|---|---|---|
| `peek` | The §2.2 string, e.g. `12 places in London` | Stays the button it is today (`onExpand`), same styling: the count in `font-heading font-extrabold text-foreground`, the rest in `text-muted-foreground`. `12` and `3` are the emphasised span; `matches in London` is not. |
| `half` | The same string, as the `<h2>` | Replaces `${totalCount} places saved`. The separate right-aligned `{places.length} of {totalCount}` element is **deleted** — the h2 now carries the whole truth. |
| `full` | The same string, as the `<h2>` | **`Your places` is deleted.** At `full` the map is covered, so the header is the only thing on screen explaining why the list is 12 rows and not 20. Removing the explanation exactly when the evidence is hidden is the wrong trade. |

The empty-viewport state renders where `NoSearchMatches` / `NoPlacesYet` render today, at `half` and
`full`. At `peek` the header line itself reads `Nothing saved in this area` and **the `Show my places`
button replaces nothing** — the `Add a TikTok` button keeps the peek row's trailing slot, because
losing the product's primary action to an empty viewport would be absurd. Tapping the peek line
expands to `half`, where `Show my places` is visible. One extra tap in a state that is a dead end
otherwise; acceptable.

**Nothing about the sheet's stops, snap points, drag arbitration or `vaul` configuration changes.**
Do not touch `SNAP_POINTS`, `PEEK_PX`, the handle, or the `data-vaul-no-drag` placements.

### Desktop panel

- The `<h1>` becomes the §2.2 string. `Your places` is deleted from the panel.
- The right-aligned `{filtering ? '3 of 20' : '20 saved'}` span is **deleted**.
- Everything else — width, frosted material, hairline border, button order, search field, row
  component — is untouched.

The panel's `<h1>` is now the page's real subject, which is correct: the page is about an area, not
about a collection.

---

## 4. Panning feel

**The list settles; it does not track continuously.**

- Recompute **on MapLibre `moveend` only**, with a **120 ms trailing debounce** to coalesce the
  several `moveend` events a pinch or an inertial flick emits. No `move` handler. No `render`
  handler. No `requestAnimationFrame` loop.
- **During the gesture nothing on screen changes.** No dimming, no spinner, no skeleton, no
  "updating…", no ghosting of outgoing rows. A 120 ms stale list is imperceptible; a list that
  reflows under a thumb is the failure the brief names, and it is worse than any staleness.
- The count and the rows change as a **plain re-render**. No number roll, no crossfade, no stagger.
  Motion here would communicate nothing except that a computer did something.
- After `moveend` + 120 ms the list is correct within one frame. That is what satisfies §9.3's
  "no pan is ever a no-op": every pan that changes what is on screen changes the sheet, at rest,
  every time.

**Scroll position:** if the list was scrolled and the viewport changes, reset scroll to top. The list
is a new answer to a new question; preserving the offset would leave the user staring at rows 8–12 of
a set they have never seen.

**Interaction with the sheet:** dragging the sheet emits no camera events and therefore never
recomputes the list (§1 rule 2). Verify this explicitly — it is the single most likely regression.

---

## 5. The empty library

Zero saved places, ever. This is `L1-F8-T1`'s surface and §9.3 constrains it: no bare world map, a
plausible regional view, the paste field as the primary control, one line saying what the product
does, no permission prompt.

**Composition, mobile (390×844):**

1. **The map is real, styled and regional.** Camera at **z11** over a city derived from
   `Intl.DateTimeFormat().resolvedOptions().timeZone` against a small hard-coded table (about a dozen
   IANA zones → centre coordinates; `Europe/London`, `Asia/Jerusalem`, `Asia/Tokyo`,
   `America/New_York`, `Europe/Paris`, `Europe/Berlin`, `Europe/Madrid`, `America/Los_Angeles`,
   `Asia/Bangkok`, `Australia/Sydney`, `Europe/Rome`, `Europe/Lisbon`). Unknown zone → London, z11.
   **No IP geolocation, no permission prompt, no navigator.geolocation call.** The timezone is
   already in the browser and costs nothing.
2. **The import overlay opens automatically**, over that map. `showImport` initialises to
   `places.length === 0`. This is how "the paste field is the primary control" is satisfied without a
   single new component: the paste field is already the first thing in `ImportPageClient`, already
   autofocuses, and already floats over a mounted map.
3. **Behind it, once dismissed**, the sheet rests at `half` and shows:

   > **`Your map starts here.`** — `font-heading`, the sheet's `<h2>` slot
   >
   > `Paste a TikTok link and the places it talks about land on your map.` — one line,
   > `text-muted-foreground`

   and the existing `Add a TikTok` button, full width, in the thumb zone. `NoPlacesYet`'s current
   string is replaced by these two lines.
4. **At `peek`**, the header line reads `Your map starts here.` and the `Add a TikTok` button keeps
   its slot.

**Desktop (1440×900):** identical rules. `<h1>` = `Your map starts here.`, the line beneath it, the
existing `Add a TikTok` button, and the search field is **hidden** while the library is empty — there
is nothing to search and an inert field is a false affordance. The import overlay opens on load the
same way.

**What must not appear on this screen:** a carousel, a tour, a spotlight, a checklist, a progress
meter, "0 places", an empty-box illustration, a `Try an example` link (not built, not in scope), and
any permission prompt of any kind.

**One line about the sentence.** `Paste a TikTok link and the places it talks about land on your map.`
says what the product does in the product's own voice — it states, it does not perform
(`brand-and-product-foundation` §4.1), it uses no implementation vocabulary, and it names the artefact
(a map) rather than the mechanism.

---

## 6. Sort order

**Nearest to the viewport centre first. Ties broken by most recently saved.**

Why this and not recency: the map is the query, so the centre of the map is the query point. The top
of the list is then the pins your eye is already on, which makes the list and the map obviously the
same object rather than two views that happen to share data. It also degrades correctly into near-me
later — near-me becomes "put the viewport on me", and the sort needs no special case at all, which is
the whole argument in §9.1 for building the viewport binding first.

Two consequences to accept deliberately:

- The order changes on every pan. That is fine, because §4 guarantees it only ever changes at rest.
- Distances are **not displayed**. Distance from a map centre is not a fact about the world and
  showing it would invite the user to read it as distance from themselves. Distance labels arrive
  with near-me or not at all.

Use a cheap equirectangular approximation for the sort, not haversine. At n ≤ ~50 in view it is
indistinguishable and it is one line.

---

## 7. Accessibility

### 7.1 What is announced, and what is not

The existing `role="status" aria-live="polite"` region in `map-page-client.tsx` stays **one region**
and stays **search-driven**. A viewport-driven count in a live region would speak on every pan, every
pinch and every camera flight, which is not an accessibility feature — it is a way to make the page
unusable with a screen reader on.

| Event | Announced? | Text |
|---|---|---|
| Search settles (500 ms, as today) | **Yes** | `{m} places match “{q}”.` / `No places match “{q}”.` — **library-wide match count**, not the viewport count, because that is the fact the typing produced and it does not churn as the camera flies. Singular: `1 place matches “{q}”.` |
| Pan / pinch / drag by pointer or touch | **No** | — |
| Camera moved by keyboard (MapLibre arrow keys) | **Conditionally** | Only after **1200 ms** with no further camera movement, and only if the **area label changed** or the list crossed **into or out of empty**. Then: the §2.2 header string, as a sentence with a full stop. A count changing from 12 to 11 is never announced. |
| `Show my places`, `Show all matches`, `Clear search` | **Yes** | The §2.2 header string as a sentence, once the camera settles. |
| Selecting a place from the list (existing camera mover) | **No** | The detail view opening is the announcement. |

Distinguish keyboard from pointer with `moveend`'s `originalEvent` (a `KeyboardEvent`, or absent for
programmatic moves). Search announcements take precedence: if a search announcement is pending, drop
the viewport one.

### 7.2 Structure and focus

- The header string is a real heading — `<h2>` in the sheet at `half`/`full`, `<h1>` in the desktop
  panel — so it appears in the heading list and a screen-reader user can find "what am I looking at"
  without reading the list.
- At `peek` the header line stays a `<button>` (it is the only affordance that opens the list) and
  keeps an `aria-label` of `Show your places`, unchanged.
- `Show my places` and `Show all matches` are real `<button>`s, min 44×44 hit area, inside the
  list region so they follow the header in reading order.
- After `Show my places` / `Show all matches` completes, **move focus to the header heading**
  (`tabIndex={-1}`, focus, no scroll). The list beneath it has changed completely; leaving focus on a
  button that is now gone strands the user.
- **The list is the accessible representation of the map.** Pins are canvas-painted and have no
  nodes. This is already true and already the reason `PlaceRow` is a button; viewport binding makes
  it *more* true, because the list is now a faithful description of what is drawn. Say so in the map
  container's `aria-label`: `Map of your saved places. The list beside it names everything shown here.`
  (mobile: `…names everything shown here` with "beside" → "below").
- Contrast, hit areas and focus rings are unchanged — no new colours, no new sizes.

### 7.3 `prefers-reduced-motion`

**Nothing in this feature animates**, so there is no reduced-motion variant to write. The list
swap is a re-render; the empty states appear and disappear without transition; the camera moves in
this feature (`Show my places`, `Show all matches`, `Clear search`) inherit whatever the existing
camera movers already do about reduced motion and must not add anything new. If a builder finds
themselves writing a transition here, that is the signal that they are building something this spec
did not ask for.

---

## 8. What must NOT change

Restating §9.3's out-of-scope list, plus the things I was tempted to add and am ruling out. Each of
these would be a defensible idea in a different week.

**Out of scope, from §9.3:** near-me and geolocation of any kind; clustering sophistication beyond the
~50 km coordinate grouping already specified for the label and the anchor; pin restyling; the
Protomaps fork; the five motion moments; any extraction or resolver work.

**Scope creep to refuse, from §9.3:** colouring pins by tag; a cities list or a city switcher UI; an
onboarding carousel; "add near-me while we're in the camera code".

**Things this document was tempted by and rules out:**

| Tempting | Ruled out because |
|---|---|
| A `Search this area` pill (`ux-architecture` §6.6.2) | It is a button for something that now happens automatically. Its entire job was to bind the list to the viewport on demand; that binding is now permanent. **Do not build it.** This is the one place where viewport binding *deletes* planned scope, and it should be recorded as such. |
| An animated count transition | Motion that communicates nothing. §4. |
| Showing "20 saved" somewhere, "just so the user knows" | §0. The map screen is not a collection surface. If the number ever needs a home it is the account popover, and that is not this task. |
| A distance label on each row | §6. It reads as distance from you and it is not. |
| A "you have places outside this view" hint | It is a nag about a state the user created deliberately by panning, and its recovery (`Show my places`) already exists in the state where it matters. |
| Persisting the last camera to `localStorage` | That is step 1a's anchor rule, not step 1b. Do not implement it here. |
| Making the query rect track the sheet stop | §1 rule 2. It is the most natural-looking wrong answer in this document. |
| Sorting by `savedAt` because it is cheaper | §6. |
| A count badge on the map itself | Card soup by another name; and it would duplicate the header. |

---

## 9. Acceptance — how to see that this works

At **390×844** and **1440×900**, signed in, at library shapes 0 · 1 · 8-in-one-city ·
20-across-two-cities (the current local library) · 20-across-four-cities:

1. Pan from London to Tel Aviv with the sheet at `peek`. The header goes
   `12 places in London` → (over the sea) `Nothing saved in this area` → `8 places in Tel Aviv`.
   Rows follow. Nothing changes mid-drag.
2. Drag the sheet peek → half → full → peek with the camera stationary. The count never changes and
   no row appears or disappears.
3. Zoom out until London and Tel Aviv are both on screen: `20 places in this area`. Zoom back in:
   the confident label returns.
4. Search `kiaans` while framed on London: header reads `2 matches in London`. Pan away from them:
   `No matches in this area`, with `Show all matches` and `Clear search`. `Show all matches` brings
   them back and the header returns to `2 matches in London`.
5. Pan into the Atlantic: `Nothing saved in this area` + `Show my places` → lands on the nearest
   cluster with individual pins visible and a place *name* readable as text.
6. With a screen reader on, pan by touch for ten seconds: the live region says nothing. Type a
   search: it says one sentence, once.
7. Delete every saved place (or use a fresh account): the import overlay is open over a regional map
   at z11, no permission prompt appears, and dismissing it reveals `Your map starts here.`
8. `/map` → place detail → back → `/import` → back: `getCenter()`/`getZoom()` unchanged, and the
   header is unchanged with it.

**Verification is `qa-reliability`'s, not the builder's** — the agent that built it is never the sole
evidence that it works.

---

## 10. Deviations from binding documents

**One.** `history-2026-08.md` §9.3 names the empty-viewport escape as `Show all places`. This document
labels it **`Show my places`** and defines it as a nearest-cluster fit rather than a whole-library
fit.

The reason is that the whole-library fit *is* the continental, two-bubbles-and-no-pins view that the
same acceptance criteria forbid three bullets earlier ("No empty view, ever"). A button labelled
`Show all places` that deliberately does not show all places would be the product lying in a two-word
string, in a section of this repo whose entire premise is not doing that.

If the owner prefers the literal string, keep `Show all places` and keep the nearest-cluster
behaviour — the behaviour is the part that matters, and I would not spend a round trip on the label.
Recommendation stands at `Show my places`.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-27 | Created for `L1-F5-T2b`. Decided: the query rect and its fixed peek-height inset (§1); the area-label rule at a 70% threshold over normalised localities (§2.1); the full header matrix, with **`3 of 20` retired** in favour of `3 matches in London` and the library total removed from `/map` entirely (§2.2); `Show my places` as a nearest-cluster fit (§2.3, §10); the header string used unchanged at all three sheet stops, deleting `Your places` from both surfaces (§3); **settle-don't-track** panning at `moveend` + 120 ms with no in-gesture feedback (§4); the empty-library screen as a regional z11 map from the browser timezone with the import overlay auto-opened, no new components and no permission prompt (§5); **sort by distance from viewport centre**, with no distance labels (§6); a live region that stays search-only, with a narrow keyboard-camera exception (§7); and the deletion of the planned `Search this area` pill as scope this feature makes redundant (§8) |
