# The list, audited before the country band goes in

> Owner: UX / Interaction. Date: **2026-08-29**. Task **LIBRARY-IA-2-UX-AUDIT**.
> Status: **investigation and rulings.** I have no shell. Nothing below is verified at runtime —
> every claim is read off the code at the line cited, or is arithmetic over values in the code, and
> I say which. `design-system-frontend` owns the build.
>
> Reads: `ux-library-at-scale.md` (the spec of record, mine) · `ux-stable-area-list.md` ·
> `ux-map-is-the-query.md` · `ux-architecture.md` §11–12 · `00-project-charter.md` §6 ·
> `handoff-2026-08-29-collections-merge-and-country-band.md` §3.
>
> Scope note: this is about **list behaviour** — scrolling, ends of lists, section boundaries, area
> transitions. It does not reopen the area model, the four-writer rule, or the row's content.

---

## 0. What is actually there today, in one paragraph

The mobile sheet has three stops — `128px` peek, `0.55`, `1.0` (`place-sheet.tsx:80-88`). At peek
you get one line and `Add a TikTok`. Above peek the sheet is a **fixed header block** (heading,
search field, `Not been yet` chip, tag pill, optional note — `place-sheet.tsx:353-391`) sitting
*outside* **one scroll container** (`place-sheet.tsx:392-408`) which holds, in order: an optional
`Clear search` escape, the active area's rows, `ElsewhereSection`, and `CollectionsNavRow`. Desktop
is the same three parts in a fixed-width left panel (`place-desktop-panel.tsx:93-144`). That is the
whole retrieval surface, and it is structurally sound. Everything below is what happens to it at
100 places rather than 25.

---

## 1. What is wrong today, ranked by what it costs the user

### 1.1 Switching area leaves the scroll position exactly where it was — **worst finding**

`selectArea` (`place-sheet.tsx:301-304`, and identically `place-desktop-panel.tsx:85-88`) calls
`onSelectArea` and then moves focus to the heading with `preventScroll: true`. **Nothing resets the
scroll container.** `rg 'scrollTop|scrollTo|scrollIntoView' src/` returns **zero matches** across
the whole tree.

What the user experiences: you scroll 2 000 px down past 30 London rows to reach `Elsewhere`, tap
`Tel Aviv-Yafo · 8 places ›`, and the heading crossfades to `8 places in Tel Aviv-Yafo` — while the
rows under it are still scrolled to an offset that no longer means anything. The browser clamps
`scrollTop` to the new content height, so with a shorter list you land **at the bottom of the new
area**, i.e. looking at `Elsewhere` again, or at `Collections`. You have navigated somewhere and
arrived at the footer.

Why it matters more at 100: the further you had to scroll to reach the tap target, the further the
clamp is wrong by. At 25 places across two areas the scroll is short and the clamp is often zero, so
this has been invisible. The country band's whole job is to make `Elsewhere` taps routine.

This is not a new requirement. `ux-stable-area-list.md:45` says *"Tap = set active area + fly +
scroll top + focus header"* and `ux-library-at-scale.md` §2.4 repeats it. **The spec has said "the
list scrolls to top" since the area model shipped, and it was never built.** I am correcting my own
document, which describes this as shipped behaviour.

**Ruling:** the scroll container gets a ref, and `selectArea` sets `scrollTop = 0` **before** moving
focus, in the same handler, on both surfaces. Not `scrollIntoView` on the heading — the heading is
outside the scroll container and always visible, so that would do nothing. Instant, not smooth: this
is a scope change, not a journey, and a 300 ms smooth scroll through 30 rows of someone else's city
is motion that communicates nothing (Charter §6).

### 1.2 The camera flies behind an opaque sheet, framed for the wrong sheet height

Two coupled defects, both live.

`selectArea` in `map-page-client.tsx:362-371` sets `focusPlaceIds`, which the map turns into a
`fitBounds`. The padding for that fit comes from `fitBoundsPadding`
(`map-surface.mapcn.tsx:187-194`), which calls `mapOcclusionInsets` — and that function's bottom
occlusion **defaults to `SHEET_PEEK_PX = 128`** (`query-rect.ts:47`, `98-100`). The sheet does not
change stop on an area tap; it stays wherever the user left it. So:

- At `full` the sheet covers the entire viewport. The camera flies to a city the user cannot see,
  framed as though 128 px of a 812 px screen were occluded. When they eventually drag down, the
  camera is wrong by ~530 px of vertical framing.
- At `half` it is wrong by ~319 px.

This is the same class of defect as the collections camera bug in
`handoff-2026-08-29-collections-merge-and-country-band.md` §2 — an occlusion constant that assumed
one resting stop — found and fixed there, still present here.

**Ruling, and it is an interaction ruling not just a padding fix:** an area-row tap (and, when the
band ships, an **area marker** tap) **drops the sheet to `half`**. Reason: `ux-library-at-scale.md`
§2.4 calls this moment *"you are going there"*. If the camera moves and the user sees nothing move,
the motion communicates nothing and should be deleted; since the motion is right, the occlusion is
what has to change. `half` is the stop that shows both the map and the top of the new list, and it
is already the stop a place selection uses (`place-sheet.tsx:189`), so it is not a new concept.
`fitBoundsPadding` is then called with the resting occlusion for `half`, exactly as
`/collections/[id]` already parameterises it.

A **country marker** tap does *not* change the stop — it does not change the active area either
(§2.4), so the list under the sheet is unchanged and there is nothing to reveal.

### 1.3 The camera fits the area's whole membership, ignoring the filter that produced the row

`map-page-client.tsx:368`: `setFocusPlaceIds(area.members.map((place) => place.id))`.

Search `momos`. The header reads `No matches in Tel Aviv-Yafo`, and `Elsewhere` offers
`London · 1 match ›`. Tap it. The list shows one row. **The camera frames all 18 London places.**
The two surfaces are answering the same question differently, which is the exact failure
`map-page-client.tsx:19-22` exists to prevent for the pins.

**Ruling:** frame the **matching** members, falling back to all members when the intersection is
empty (which cannot happen — `elsewhereRows` drops zero-count areas, `active-area.ts:279`). One
line: intersect `area.members` with the `matches` set already computed at
`map-page-client.tsx:269`.

### 1.4 Reaching `Elsewhere` at 40 rows costs four to eleven screenfuls, and §1.3's sticky block does not help

Arithmetic over the shipped values, not a measurement.

The header block is `handle 14 + pt-3.5 14 + h2 28 + gap 14 + search h-12 48 + gap 14 +
NotBeenFilterChip min-h-9 36 + gap 14` = **182 px** (`place-sheet.tsx:231`, `310`, `361-379`;
`visit-state.tsx:104`). On a 812 px viewport:

| Stop | Sheet height | Scroll viewport | Rows visible at `min-h-16` |
|---|---|---|---|
| `half` (0.55) | 447 | **265 px** | **~4** |
| `full` (1.0) | 812 | **630 px** | ~9 |

Forty rows at a realistic 64–96 px (a row with tags and a note is taller,
`place-sheet.tsx:496-499`) is **2 600–3 800 px of content**. So `Elsewhere` is 4–6 flicks away at
`full`, 10–14 at `half`.

**§1.3's sticky header block is already satisfied and it does not address this.** The heading,
search field and chips are *outside* the scroll container in a flex column
(`place-sheet.tsx:353-391` vs `392`), so they are permanently pinned by construction, not by
`position: sticky`. Rule 7 is met today. But rule 7 was about **getting out of a filter**, not about
**reaching the section below the rows** — and the filter bar, when it lands, will make the problem
worse by eating another ~58 px of an already 182 px header block (down to ~3 visible rows at
`half`).

**Rulings, in order:**

1. **The filter bar merges with the `Not been yet` chip into one horizontal-scroll bar**, rather
   than stacking a second 50 px row. `[All] [☕ Café 4] [🍽 Rest. 6] │ [Not been]`, one hairline
   divider marking the change of dimension. Net header cost of the filter bar becomes ~+8 px instead
   of ~+58 px, and it fixes an existing stated compromise: `NotBeenFilterChip` is `min-h-9` (36 px),
   under the touch floor, and `visit-state.tsx:78-81` names that as a trade rather than a rule met.
   Inside a 44 px bar it is no longer a trade. *(This belongs to the filter-bar task, not this one —
   §4.)*
2. **Do not virtualise.** `ux-library-at-scale.md` §1.4 stands. 40 rows is not the problem; the
   *distance* to a target below them is, and virtualisation does not shorten a scroll.
3. **The real fix is that `Elsewhere` stops being at the bottom of the scroll when it is what you
   want.** I considered and reject a floating "jump to areas" control (new persistent chrome over
   the map, banned) and a collapsed-by-default active-area list (hides the primary content to reveal
   the secondary). The ruling is cheaper: **when a search or a filter is active and the active area
   has fewer matches than the rest of the library combined, `Elsewhere` renders above the rows.**
   No — I withdraw that. It is a positional mode with an invisible rule, and a section that moves
   between renders is worse than a long scroll. **The accepted answer is:** the scroll stays as it
   is, and the country band earns its place by making `Elsewhere` *short* — six countries is six
   44 px rows (264 px, one screenful) where six areas across six countries is six rows today and
   twenty rows at 100 places. Grouping is the scroll fix. That is the whole argument for building
   §2.6 and it should be written down as such.

### 1.5 The end of the active area's rows is not marked, and the section boundary does not read as a boundary

`ElsewhereSection` opens with `mt-2 border-t border-border/70 pt-3` and a 12 px uppercase muted `h3`
(`place-sheet.tsx:640-643`). The last place row is `last:border-b-0` (`place-sheet.tsx:506`, `513`).

So the transition from "your places here" to "your other cities" is: **an 8 px gap, and a hairline
drawn in the same `border-border/70` token as every row divider above it.** The `Elsewhere` heading
is `text-xs ... text-muted-foreground` — the *same size and the same colour* as the category line
inside every place row (`place-sheet.tsx:487`). The loudest thing at the boundary is quieter than
the body text above it.

Worse, the two kinds of row look related but behave categorically differently:

| | Place row | Area row |
|---|---|---|
| Height | `min-h-16` (64) | `min-h-11` (44) |
| Leading edge | 32 px colour glyph + 12 px gap → text starts ~44 px | no glyph → text starts at 4 px (`px-1`) |
| Trailing | count-free, optional `BeenBadge` | count + chevron |
| What a tap does | opens a detail | **changes the list's scope and moves the camera** |

The left edges disagree by 40 px, which reads as a layout accident rather than a hierarchy. At 25
places you scroll past this once a session. At 100 you cross it constantly, and the country band
adds a third row kind on top of it.

**Rulings:**

1. **One text column for the whole scroll container.** Every row — place, country group, area —
   reserves the same 32 px leading slot the category glyph already occupies
   (`place-sheet.tsx:462-466`), so all text starts at the same x. A place row puts its category
   glyph there; a country group puts its **flag disc** there; an area row inside a group leaves it
   **empty**. The hierarchy is then carried by *what is in the column*, not by ragged indentation.
   A top-level single-area row (§2.6 rule 1) puts its country's flag in the slot.
2. **The section boundary gets the only real separation in the list:** `mt-5` (not `mt-2`), a
   full-bleed hairline (the row dividers are inset by the text column; this one is not), and the
   heading in `text-foreground` at the row's own weight rather than muted 12 px. It is the one place
   in the scroll where the *kind* of thing changes, and it should be the only place that looks like
   it.
3. **No "that's all of London" terminator row.** I considered one and reject it: the `Elsewhere`
   heading *is* the terminator once it looks like one, and an end-of-list sentence is a row that
   says nothing and is read on every scroll.

### 1.6 The empty / off-screen case — honest comparison with Plotline

**We do not have their bug and we do have a different one.**

Their state (`Your plot points are just off-screen` + `Show nearest plot points`) exists because
their list is bound to the viewport. Ours is not: `areaHeading` (`active-area.ts:353-419`) has no
`Nothing saved in this area` branch at all, and the file's own header (`active-area.ts:336-339`)
records why — *"an area is defined by the places in it, so an unfiltered area always has at least
one. That deletes the state `Show my places` existed to escape."* That is right and it should not be
undone. Panning into the Atlantic today changes nothing: the header still says
`13 places in Tel Aviv-Yafo`, the rows are all still there.

**But two things are genuinely wrong, and they are different from theirs.**

**(a) There is no visible route back to your own data when the camera is far from it, and the
country band makes that state ordinary.** Today you can only get lost by panning. After the band you
can be at z2 over the Atlantic *on purpose*, because that is where the country markers live. The
rows are all still listed — so the recovery exists — but the only way to use it is to tap a row,
which **selects a place and opens its detail**. There is no "put the camera back on this area"
control anywhere in the product.

**Verdict: a real defect, worth fixing, but not in this task.** File it as `LIBRARY-IA-2b`, and rank
it **above the filter bar**. The shape, so it does not get redesigned later: a single row pinned at
the *top* of the scroll container, rendered only when the active area has zero member pins inside
the current query rect (`queryRectFrom`, `query-rect.ts` — the rect is already computed for every
settled camera). Copy: `Your places in {Area} are off screen` with a `Show {Area}` button. It
re-frames the active area's bounds through the existing `focusPlaceIds` writer. **No new writer, no
area change, no geolocation** — "nearest to me" is `L1-F11`'s job and needs a permission we do not
ask for on load.

**(b) Panning into emptiness can silently hand the list to a different area, and nothing announces
it.** `dominantArea` (`active-area.ts:196-204`) falls back, when no pin is in the rect, to *the area
whose bounding box is nearest the rect centre*. Pan west from Tel Aviv far enough and London's box
becomes the nearer one, so the list swaps to London with **zero London pins on screen**. That is
legal under the four-writer rule (it is a settled user gesture) and I am not reopening the fallback
— it is what makes "a quiet corner of London still says London" work.

What is wrong is that it is **silent**. The live region at `map-page-client.tsx:468-470` is fed only
by `useResultAnnouncement` (`map-page-client.tsx:350-352`, `558-587`), which speaks on **filter**
changes. `ux-library-at-scale.md` §6 and `ux-stable-area-list.md:80` both say the opposite — *one
live region, announcing only on area change*. **The shipped behaviour is the exact inverse of the
spec.**

**Ruling, and it is in scope for this task** because the country band adds two more ways to change
area: an area change announces `areaHeadingSentence(heading)` through the existing `Announcer`
(`ui/place/announce.ts` already serialises two writers by ticket, so this needs no second region).
Filter announcements stay — the spec's "only on area change" was written before the filter
announcement existed, and removing a working announcement to satisfy a sentence in my own document
would be a regression. I am correcting §6: **two writers, one region, ordered by ticket.**

### 1.7 `CollectionsNavRow` is at the bottom of a 3 000 px scroll and it is the only door

`place-sheet.tsx:407` and `place-desktop-panel.tsx:143` render it after `ElsewhereSection`, inside
the scroll container. Its own header (`collections-nav-row.tsx:3-12`) argues the placement well: no
tab bar, no permanent chrome, *"a collection is a subset of your places, so it belongs under your
places"*.

**The argument is right and the position is now wrong at scale.** At 25 places it is ~1 200 px down.
At 100 places in one area with four country groups it is ~3 200 px down, behind every row and every
group, and it is the **only** route to `/collections` in the entire product. A feature reachable
only by exhausting a scroll is a feature most users will never find. The file even anticipates this:
*"It renders at a count of zero as well. Hiding it there would make the feature invisible to
everyone who has never used it, which is everyone."*

**Ruling:** keep the row, keep the reasoning, **move it out of the scroll container** — it becomes
the last element of the sheet's flex column, below the scroll area, above the safe-area padding, on
a full-bleed hairline. It is then permanently visible at `half` and `full` at a cost of 44 px, it
still reads as "under your places", and it stops competing with `Elsewhere` for the bottom of a
scroll. On desktop it does the same, pinned to the bottom of the panel
(`place-desktop-panel.tsx:92`, which is already a flex column).

Rejected alternative: a tab bar. `collections-nav-row.tsx:3-9` already refuses it and the refusal
still holds — 56 px removed from the map on every screen, a second navigation concept, and a
collision with the peek stop.

### 1.8 `show on map` is the wrong accessible name for an area row

`areaRowAccessibleName` (`active-area.ts:295-297`) produces `Tel Aviv-Yafo, 8 places, show on map`.
The tap changes the list's scope, replaces every row, and moves focus. On mobile at `full` it also
shows nothing on the map, because the map is covered.

**Ruling:** `{Area}, {n} places, open this area`. One string, both surfaces, and it is the string the
country group's own name has to agree with (§2 below).

### 1.9 Area rows have no token'd focus ring

`place-sheet.tsx:651` carries `hover:bg-muted/60` and no `focus-visible:` classes, where `PlaceRow`
(`place-sheet.tsx:530`) and `CollectionsNavRow` (`collections-nav-row.tsx:31`) both carry
`focus-visible:ring-3 focus-visible:ring-ring/50`. They fall back to the UA outline, which is a
square ring on a `rounded-lg` button and does not meet `ux-architecture.md` §11.6's 2 px / ≥3:1
requirement in any guaranteed way.

**Ruling:** the same ring as every other row, and the country group buttons inherit it. Fixed in
this task, because the band adds a second focusable row kind next to it and inconsistent focus
across two adjacent row kinds is worse than inconsistent focus across one.

### 1.10 The 140 ms header crossfade is not built

`ux-library-at-scale.md` §7 lists it as *"(shipped)"* and `ux-stable-area-list.md:74` requires it.
`rg 'transition-opacity|duration-|crossfade' src/components/sheet/` returns **nothing**, and the
headings at `place-sheet.tsx:361-367` and `place-desktop-panel.tsx:98-104` carry no transition. The
area change is currently an instant text swap.

**Ruling: build it in this task.** It is the only motion that marks the one legitimate change of
scope, and the country band creates two new ways to trigger it. 140 ms opacity, keyed on the area
id; instant under `prefers-reduced-motion` (opacity crossfades under 150 ms are permitted by
`ux-architecture.md` §11.8, but this one is *paired with a scroll reset and a focus move*, and doing
all three at once with reduced motion on should be one instant frame).

### 1.11 Minor, adjacent, not this task

- **The collections picker has no "nothing matches" state.** `collection-content.tsx:542-589`
  branches on `library.length === 0` and otherwise renders `matches.map(...)`. Type a query that
  matches nothing and you get a blank area with no message — while the collection *list* two hundred
  lines above (`collection-content.tsx:194-197`) does have one. One-line fix, backlog.
- **The name is `line-clamp-1`.** `place-sheet.tsx:473` and its comment at `469-472` describe
  replacing `truncate` with `line-clamp-1` for the RTL-clipping reason. §3.3 asks for
  `line-clamp-2`. Half the fix landed. Belongs to the row task, not here.
- **Adjacent stacked rows have zero gap** where §6 asks for ≥8 px between 44 px targets. **I am
  ruling on my own rule:** the 8 px spacing requirement applies to **horizontally adjacent** small
  controls (chips, the disambiguation `Not this ›`), where a mis-tap picks a different answer. Two
  full-width stacked rows at ≥44 px do not need it — the target is unambiguous and every list in the
  product would grow 20% taller. §6 should say "horizontally adjacent".

---

## 2. The country group, specified precisely enough to build

Everything here assumes `bucketAreasByCountry` (`country-bucket.ts:117-151`) and
`buildCountryDiscImages` (`country-flag-image.ts:485-512`) as they stand on `main`. **No new stored
field, no migration.**

### 2.1 One integration detail that will bite on the first build

`bucketAreasByCountry` takes `readonly GeoCluster<T>[]`. The list holds `Area<T>`
(`active-area.ts:84-96`). `Area` carries `members` and `bounds` but **not `count`**, which
`GeoCluster` requires (`clusters.ts:73-77`). They are not structurally assignable.

**Ruling:** do not widen `Area`, and do not change `bucketAreasByCountry`. The new list module maps
`{ members, bounds, count: members.length }` at the call site. One line, and it keeps the domain
module free of the UI's area type.

### 2.2 The shape the list renders

A new pure module beside `active-area.ts` (name is the builder's), exporting one function that
returns an ordered array of a discriminated union:

```
type ElsewhereNode =
  | { kind: 'area';  id; label; count; countryCode: string | null }
  | { kind: 'group'; countryCode: string; name; count; areas: readonly AreaRow[] }
```

Built from the same three inputs `elsewhereRows` takes today (`active-area.ts:269-273`): the areas,
the active area's id, and the set of matching place ids. `elsewhereRows`' filtering and sorting are
reused, not reimplemented.

### 2.3 §2.6 rules 1–7, as behaviour

**R1 — a country with exactly one surviving area is one top-level row**, labelled with the *area*
name and carrying the country's flag in the leading slot. Never a group of one.

**Ruling on an ambiguity §2.6 does not cover:** "surviving" means **after filtering**. A country
with three areas of which one has matches renders as **one row**, not a group with one child. The
grouping decision is made on the filtered set, every render. This follows from rule 5 but is not
stated there.

**R2 — two or more surviving areas is a group**, showing the country name and a total.

**R3 — what is expanded on load.** §2.6 says "the active area's own country". That is not enough,
and here is the second ruling:

> **Expanded by default: the country of the active area, *and* the country of the area you came
> from.**

Reason, and it is Plotline's point 4 answered without their screen: our area switch is currently
**one-way**. Tap `Tokyo` from London and the route back is to find United Kingdom in the new
`Elsewhere`, expand it, then tap London — three taps, two of them below the fold. Expanding the
country you just left makes the return **one tap**, costs one 44 px row, and needs no back chevron,
no navigation stack and no second screen.

Mechanically: `MapPageClient` holds `previousAreaId` beside `activeAreaAnchor`
(`map-page-client.tsx:199`). It is written **only by writer 2** — an explicit area-row or
area-marker tap. A pan-driven switch (writer 4) does **not** write it, because a pan is not a
navigation the user is trying to undo. Writers 1 and 3 do not write it either.

**Corollary, and it corrects §2.7's copy table:** a country group's count is the count of **the
areas it actually lists**. When London is active, the United Kingdom group says `United Kingdom · 2
places` (Bristol), not `14`. Otherwise the header says `12 places in London` and the row below
claims 14 for a country whose 12 are already on screen — the 12 would be counted twice on one
screen. `elsewhereRows` already excludes the active area (`active-area.ts:277`); the group count
must be derived from the same filtered children, never from `CountryBucket.count`.

**R4 — where the expansion state lives.** In `MapPageClient`, not in the sheet: both surfaces render
unconditionally (`map-page-client.tsx:13-17` — no JS media query, ever) and both must show the same
state.

```
overrides: ReadonlyMap<string, boolean>          // explicit user toggles only
isExpanded(code) = overrides.get(code) ?? defaultFor(code)
```

`defaultFor` differs per surface and is passed as a prop, **not** derived from a breakpoint in JS:
`PlaceSheet` passes `'active-and-previous'`; `PlaceDesktopPanel` passes `'all'` (§9 — there is room,
and collapsing is a mobile economy).

**R5 — what happens to an expanded group when the active area changes.** **Ruling: clear
`overrides` entirely.** The default has just changed (both the active and the previous country moved),
so a surviving override means the country you left stays open while the one you arrived in is closed
— stale state below the fold that the user cannot see and did not ask for. Clearing also means the
list's shape after an area switch is a pure function of the new area, which is the same property the
scroll reset in §1.1 is buying.

**R6 — under an active search or filter.**

- Counts become match counts. Reuse `areaRowCountText(count, filtering)` verbatim
  (`active-area.ts:289-292`) for group rows so one screen never calls the same rows two things.
- A country with zero matching areas is **absent entirely** — not rendered as `0`, exactly as
  `elsewhereRows` already drops empty areas (`active-area.ts:279`).
- **Every group is force-expanded while any filter is active**, and the expander still works.
  Ruling and reason: a collapsed group under a search hides the answer to the question just asked —
  `Japan · 3 matches ⌄` makes the user tap to discover the 3 are in Kyoto, and the *point* of the
  filtered `Elsewhere` rows is that they name where the matches are without a tap
  (`active-area.ts:260-263`). The forced state does **not** write to `overrides`; when the filter
  clears, expansion returns to the R3/R4 default.

**R7 — sorting.** One comparator, applied twice: count descending, then label, then id — the exact
rule at `active-area.ts:282-284`. Applied over groups and top-level area rows together at the top
level, and over each group's children. The `null`-country bucket already sorts last regardless of
count (`country-bucket.ts:153-158`); **the list must not re-sort and undo that**. And per §2.6 rule
6 the null bucket is **flattened** — its areas are always top-level unflagged rows, never a group
called "no country".

**R8 — country names. Ruling: do not build the static table §2.6 rule 7 asks for.**

`Intl.DisplayNames(['en'], { type: 'region' }).of('GB')` returns `United Kingdom`, ships with Node
and every target browser, stays current, and its **default `fallback: 'code'` returns the two-letter
code for an unknown region** — which is precisely rule 7's requirement, for free. This is already
this repository's answer to the same problem in the other direction: `country-code.ts:14-16` and
`163-165` argue at length that *"a table we maintain ourselves is a table that goes stale"*.

Two cares, both mine to state: pass `['en']` explicitly so the label does not follow the device
locale while the rest of the interface is English; and the flag disc's own two-letter fallback
(`country-flag-image.ts:414-446`) is a *marker* fallback and is unrelated — the list row always
carries the full name.

**This supersedes owner decision 4 in `ux-library-at-scale.md` §8.** There is no new data asset and
no future localisation surface, so it is no longer an owner decision.

### 2.4 Keyboard, focus and semantics

DOM order **is** focus order. No `tabindex > 0`, no visual reordering.

```
heading → search field → clear-search → [filter chips, later] →
place rows 1..n → "Elsewhere" h3 (not focusable) →
node 1 → [its children, if expanded] → node 2 → … →
Collections row (now outside the scroll container, §1.7)
```

- A group is one `<button aria-expanded aria-controls={id}>` inside its `<li>`; the children live in
  a sibling `<ul id={id}>` **inside the same `<li>`**.
- **Collapsed means not rendered**, not `hidden` and not `inert`. Nothing to remove from the tab
  order, nothing to get wrong.
- **Expanding does not move focus** (§6). The first revealed child becomes the next tab stop, which
  is the right affordance; `aria-expanded` already announces the change and a second announcement
  would be noise.
- Collapsing a group whose child holds focus cannot occur — the only collapse control is the group
  button, and reaching it means focus has already left the children. No focus-restoration logic.
- Accessible names, as pure functions beside `areaRowAccessibleName`:
  - group: `{Country}, {n} places in {m} areas, expand` / `collapse`, built from the **listed**
    children per R3's corollary.
  - area row: `{Area}, {n} places, open this area` (§1.8's correction), the same string inside a
    group and at top level.
- Group rows and area rows carry the same `focus-visible` ring as `PlaceRow` (§1.9).
- **The hard requirement stands:** every country and every area in the library is reachable from
  `Elsewhere` by keyboard with the map untouched (§6, acceptance check 4). Verified by tabbing, not
  by reading the code.

### 2.5 Motion

One thing moves that did not before.

| Moment | Timing | Reduced motion |
|---|---|---|
| Group expand / collapse | 180 ms, `spatial` | instant |
| Chevron rotation | 180 ms, same curve | instant |

**Ruling on the mechanism:** animate `grid-template-rows: 0fr → 1fr` on a wrapper, not
`height: auto`. No measurement pass, one composited property, no `ResizeObserver`, and it degrades
to an instant swap by dropping one class. Rows inside the group **do not stagger in** — they are a
list, not an event (§7).

Nothing else in the section animates. Filtering does not animate. Markers do not animate in.

### 2.6 Copy, corrected

| Where | String |
|---|---|
| Section heading | `Elsewhere` |
| Country group | `{Country} · {n} places` / `{n} place` — **counting only the areas it lists** |
| Country group, filtering | `{Country} · {n} matches` / `{n} match` |
| Area row | `{Area} · {n} places` / `{n} matches` (unchanged) |
| Country group, screen reader | `{Country}, {n} places in {m} areas, expand` / `collapse` |
| Area row, screen reader | `{Area}, {n} places, open this area` — **changed from `show on map`** |
| Unnamed area | `Another area` (`active-area.ts:79`) |
| Unknown country code | the code itself, from ICU's `fallback: 'code'` |

---

## 3. Plotline — what to take, what to refuse

Interaction rulings only. None of these touches our visual language, and none of them is a reason to
look at their UI.

### Adopt

**A1. Country markers at world zoom (their point 1).** Independent corroboration of §2.1/§2.2. No
change to our spec. **One deliberate difference: we do not put the country name on the marker.**
Theirs is a labelled pill; ours is flag + count. A name label at world zoom collides with every
other country's label at exactly the zoom where markers are densest, and the list beside it carries
the name already — which is also what makes the band accessible at all.

**A2. A one-tap way back to your own data (their point 2).** Adopt the *idea*, reject the *trigger*.
Their trigger is "the viewport has none of your places", which only exists because their list is
viewport-bound. Ours is "**the active area** has no pins in the viewport" — a narrower, honest state.
See §1.6(a). `LIBRARY-IA-2b`, ranked above the filter bar.

**A3. The affordance behind their city-scoped screen (their point 4), without the screen.** We
refuse the screen: it duplicates the entire list's chrome and adds a navigation stack to a product
whose IA is "the map is the shell" — the same argument `collections-nav-row.tsx:3-9` already makes
against a tab bar. What they solve and we do not is **getting back**. Our answer is R3's
previous-country expansion: one tap, no chrome, no stack. Cheaper than theirs and it does not
fragment the list into two surfaces.

### Reject

**R1. Geography above the name, repeated on every row (their point 8) — reject, and our §3.2 is
right.** Not merely because it repeats the header. The sharper reason: **that line is identical on
every row of the scope you are in, so it is the one part of the row that cannot help you choose
between two rows** — and it occupies the position, first line, that scanning hits first. Their
design is coherent for a product whose default screen is `All saves (10333)` across eight countries;
ours defaults to one area, always.

Where they have a real point and we should be honest: **a result set that spans areas needs to say
where each row is, and our row does not.** Our answer is structurally different and better — we do
not put cross-area rows in the list at all. `momos` searched from Tel Aviv gives
`No matches in Tel Aviv-Yafo` and `London · 1 match ›` below it. The redundancy they solve with a
repeated line, we solve with a section. Ruling stands unchanged; the case that would break it does
not exist in our IA.

**R2. Horizontal shelves with `See all (n)` for collections (their point 5) — firm reject.** Three
reasons. It converts one scroll into two scrolls on two axes, which is the worst thing available to
do to a one-handed reader. It *hides* magnitude: a shelf shows 2.5 cards and gives no sense of how
many there are, whereas a row list's length is its own count. And a row of bordered cards is card
soup, explicitly banned (Charter §6). `collections-index-client.tsx:189-231` is already the right
shape — hairline rows, sectioned `Yours` / `Shared with you` — and
`collections-index-client.tsx:3-11` makes the same argument. Do not touch it.

**R3. Selection / edit mode with checkboxes and a bulk action bar (their point 6) — reject on
`/map`.** We already have exactly one multi-select surface and its own header states the rule:
*"This is the product's only multi-select surface, deliberately: selecting several is the task here,
so no mode has to be entered or left"* (`collection-content.tsx:475-482`). A select mode on the
library list puts a mode with an invisible off-state on the product's primary screen, and it puts
`Delete` behind a gesture on the one list the user trusts. If bulk delete is ever wanted, its home
is the picker's always-on shape, not a mode on `/map`.

**R4. A persistent distance on every row (their point 7) — reject as a default.** Distance from
what? Their answer is a home base, which is a trip-planner concept Charter §1 declines. Ours is
`L1-F11` near-me: a *mode*, with its own header, its own ordering, and a permission asked on an
explicit tap and never on load. Putting distance on the default list would require geolocation at
page load — which `ux-when-we-ask` forbids outright — and would print a number on every row that is
meaningless when you are 3 000 km away. It stays inside near-me, where it is a fact about the world.

**R5. The library-shape line, `11 plot points · 2 countries · 6 cities` (their point 9) — reject.**
The library total is deliberately displayed **nowhere** on `/map` (`place-desktop-panel.tsx:95-97`:
*"it answers a question about owning things, and this screen is for finding one"*). A count of
countries is the same kind of fact. And once §2.6 ships, the shape **is** the section: six countries
is six visible rows in one screenful. A summary above a list that is already a summary is a count of
counts.

---

## 4. Out of scope for the country band — do not let these in

**In scope for `LIBRARY-IA-2` (this task):**

- The three zoom bands, the two taps, the markers (`handoff-2026-08-29…` §3's missing third piece).
- `Elsewhere` grouped by country, per §2 above.
- §1.1 scroll reset on area change. §1.2 sheet-to-`half` + correct occlusion. §1.3 filter-aware
  camera fit. §1.5 one text column + a real section boundary. §1.8 the accessible-name correction.
- §1.9 the missing focus ring. §1.10 the 140 ms header crossfade. §1.6(b) the area-change
  announcement.
- §1.7 moving `CollectionsNavRow` out of the scroll container.

Every one of those is either a precondition for the band being usable or a defect the band makes
worse. None of them needs a migration or a new stored field.

**Out of scope, with a home:**

| Item | Where it goes |
|---|---|
| The off-screen recovery row (§1.6a) | **`LIBRARY-IA-2b`** — next, above the filter bar |
| The filter bar, §1.3, including the merge-with-`Not been` ruling in §1.4 | `LIBRARY-IA-3` |
| The row redesign, §3.3 — the date, `{Category} · {street}`, `line-clamp-2` | `LIBRARY-IA-4` |
| Nearby places on detail, §5.1 | own task; needs no new field |
| Near-me, distance ordering | `L1-F11`, unchanged |
| Removing density clustering | `L1-F5-T5`; a sequencing call for `product-lead` — §8.3 recommends they land together |
| The collections picker's missing no-match state (§1.11) | backlog, one line |
| Rotate-without-reload camera framing | pre-existing (`handoff-2026-08-29…` §2); the band makes a wrong world-zoom fit more visible than a wrong city fit, but it is not this task's |
| Virtualisation | not built, and not until one area is measured above ~200 rows |
| Dark-mode values for the disc, the date and the flag backing | §10, noted not designed |

**Scope creep to refuse by name:** a sort control, time headers, a country picker dialog, a
filter sheet stacked over the places sheet, a FAB over the map, a tab bar, marker entrance
animation, cluster bubbles at any zoom, a "jump to Elsewhere" floating control, and a second screen
for a scoped area.

---

## 5. Corrections I am making to my own spec

Recorded here rather than edited into `ux-library-at-scale.md` silently, so the delta is reviewable.

1. **§7 says the header crossfade is "(shipped)". It is not built** (§1.10).
2. **§2.4's "the list scrolls to top" was never built** for the existing flat `Elsewhere` rows
   either (§1.1).
3. **§6's "one live region, announcing only on area change" is inverted in the shipped code**, and
   the rule itself is wrong — it should be two writers, one region, ordered by ticket (§1.6b).
4. **§2.6 rule 7's static country-name table should not be built.** ICU already does it, and its
   default fallback is exactly the specified fallback (§2.3 R8). This retires owner decision §8.4.
5. **§2.7's country-group count must exclude the active area**, or one screen counts the same places
   twice (§2.3 R3 corollary).
6. **§2.6 rule 3 is extended**: the *previous* area's country is expanded too, which is what makes
   an area switch reversible in one tap (§2.3 R3).
7. **§6's ≥8 px target spacing applies to horizontally adjacent controls only**, not to stacked
   full-width rows (§1.11).
8. **`areaRowAccessibleName`'s `show on map` becomes `open this area`** (§1.8).
