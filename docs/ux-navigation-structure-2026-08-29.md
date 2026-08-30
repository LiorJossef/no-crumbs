# How users reach things — navigation structure

> ## ⚠ §1, §2 and §5 are SUPERSEDED — owner ruling, 2026-08-29 (same day)
>
> The owner used the third peek slot this document specifies, and ruled instead for **Plotline's
> structure: a bottom bar with paged destinations**. That reverses §1's "we do not build a tab bar"
> and everything in §2 that budgets the third slot. Shipped in `ddd684e`;
> `src/components/nav/bottom-nav.tsx` is the implementation and carries the reasoning.
>
> **Read the rest of this document anyway.** Three parts of it survive and are load-bearing:
>
> - **§1.2's collision is real**, and the implementation pays it rather than denying it. A bar and a
>   three-stop drag sheet both want the bottom of the screen. It is settled by moving `Add a TikTok`
>   out of the peek row into the bar's `＋`, which leaves the peek row one line of text and frees the
>   lower half of the 128 px band for the bar. `PEEK_PX` never moved, so the camera budget, the query
>   rect and the attribution padding never moved either.
> - **§4's refusal list still binds, less Profile** — the owner reversed that one on 2026-08-30 and
>   `/profile` exists, holding sign-out. No Trips, no References destination, no further slot held
>   open: the bar is Map · Collections · Profile and the create action, and it closes there.
> - **§3 is untouched and was built** — categories are the filter bar, not a destination
>   (`7f61251`), merged with `Not been yet` into one horizontal-scroll row.
>
> §6's delta table is now two reversals deep and should be read as history.
>
> What actually happened, recorded because it is the useful part: the audit assessed the Collections
> row at `half` and `full`; this document corrected it to the resting state and answered with a third
> peek slot; the owner used *that* and said the answer was not a better-packed sheet but pages. Both
> corrections were right about the problem and wrong about the size of it.


> Owner: UX / Interaction. Date: **2026-08-29**. Task **LIBRARY-IA-2-NAV**.
> Status: **ruling.** No shell, nothing verified at runtime. Every number below is read off the code
> at the line cited, or is arithmetic over values in the code, and I say which.
>
> **This supersedes `ux-library-audit-2026-08-29.md` §1.7 and part of §3 (A3).** That document is
> not edited; the delta is §6 here.
>
> Trigger: owner input, 2026-08-29 — *"right now you often have to scroll all the way down to reach
> Collections. That shouldn't be the default UX. Look at how Plotline distributes things across
> different views/sections instead of making everything one long scroll… whether we need a similar
> structural approach for things like Collections and categories — not visually, but in how users
> reach them."*

---

## 0. Where I was wrong

My audit §1.7 measured the Collections row's reachability at `half` and `full`, concluded that
moving it out of the scroll container fixed it, and reaffirmed the tab-bar refusal on the strength of
that.

**I never asked what the resting state offers.** The app opens at `peek` (`place-sheet.tsx:174-178`).
At `peek` the sheet renders exactly two things — a heading button and `Add a TikTok`
(`place-sheet.tsx:311-352`) — and *the entire scroll container, including the pinned Collections row,
is off screen*. So after the coordinator's change the cold-open cost of reaching Collections is still
**two gestures**: drag the sheet up, then find the row. The owner is right, and the fix that has been
built is necessary but not sufficient.

That is the whole delta. The rest of this document is what to do about it.

---

## 1. The ruling

**`/map` does not stop being the shell, and we do not build a tab bar. We widen the peek row from
two slots to three.**

```
        rest (peek, 128 px — unchanged height)
┌──────────────────────────────────────────────────────┐
│  ▤ Collections    13 in Tel Aviv-Yafo ⌃    ＋ Add    │
└──────────────────────────────────────────────────────┘
   navigate           expand the sheet         import
```

One tap, from the app's resting state, in the thumb zone, always on screen. The coordinator's pinned
row stays exactly as built and is the same destination's affordance at `half` and `full`, where the
peek row is not on screen. One affordance per state, one destination.

### 1.1 Do I agree the floating-pill form weakens the original refusal? Partly — and the part that survives is what decides the design

`collections-nav-row.tsx:3-12` refuses a bar on three costs. Taking them one at a time:

| Original cost | Verdict now |
|---|---|
| "56 px removed from the map on every screen" | **Dead.** Costed against an opaque full-width strip nobody proposed. `query-rect.ts:78-90` already establishes the precedent for floating chrome: the account chip *"occludes real map, but it is a floating pill over a band that is otherwise fully visible map"*, so it is charged to the camera and **not** to the query rect. A floating bar would be charged the same way. The coordinator is right about this one. |
| "a second navigation concept" | **Not weakened — inverted.** It was written when the map was the only place to be. `/collections`, `/collections/[id]` and `/collections/join/[token]` are now real routes with their own header and their own back-to-map control (`collections-index-client.tsx:58-70`). **We already have two shells and no door between them.** The second concept exists; what is missing is the connection. |
| "a collision with the peek stop" | **Survives entirely, and it is sharper than the original wording.** See below. |

So the refusal's conclusion stands on one leg out of three. That is why my answer is not "no" — it is
"yes to the reachability, no to the bar", and the third cost is the reason.

### 1.2 The collision, stated precisely — it is not about pixels

**A persistent bottom bar and a three-stop drag sheet are two answers to the same question: what
occupies the bottom of a phone screen.** A floating pill does not dissolve that. The sheet drags to
`full` (`place-sheet.tsx:88`) and covers the entire viewport, so a bar has exactly two options and
both are bad:

- **Covered at `full`** — then it is not "present on every screen"; it is present at rest, which is
  what the peek row already is. All the concept buys is a different shape for the same thing.
- **Floating over the sheet at `full`** — a navigation control painted over a scrolling list,
  permanently stealing the bottom ~76 px of the list at the exact stop the list exists for. Every
  scroll-distance finding in my audit §1.4 gets worse, and the user's thumb rests on a control while
  scrolling past it.

There is also a cost nobody has priced yet: **a tab bar forces a navigation-model change on
`/collections` too.** A persistent bar has to be persistent there, and then
`collections-index-client.tsx:59-68`'s back arrow and the bar's Map slot are two controls that go to
the same place, one of which is a stack and one of which is not. That is not a 56 px problem, it is a
second model to keep coherent across four routes.

### 1.3 Why three slots and not four or five

Count our real destinations honestly. `/map`. `/collections`. That is two, and one of them is where
you already are.

Everything else on Plotline's bar is a destination we do not have and, per §4, must not grow: Trips
is an itinerary planner (Charter §1), Profile is a settings screen for settings we do not have, and
`+` is an action rather than a destination — which is why they separated it into its own circle and
why ours stays a labelled button rather than becoming a tab.

**A bar sized for destinations we do not have is the template-SaaS shape Charter §6 bans**, and it
would sit there for months with a dead slot in it. Three slots is what we have things for.

### 1.4 Why this is better than what has already been built, in one sentence

The pinned row makes Collections reachable **once you have opened the list**; the peek slot makes it
reachable **from the state the app is in when you open it**, which is the state the owner was
describing.

---

## 2. What it costs — the concrete collision

### 2.1 Height: nothing. The peek stop does not change.

This is the load-bearing constraint and I designed to it deliberately.

`PEEK_PX = 128` is mirrored in **four** places, and one of them is licence compliance:

| Where | What it is |
|---|---|
| `place-sheet.tsx:80` | the sheet's own stop |
| `query-rect.ts:47` | `SHEET_PEEK_PX` — the query rect's bottom inset **and** `fitBounds`' bottom padding (`query-rect.ts:98-111`, `map-surface.mapcn.tsx:194-207`) |
| `globals.css:237-240` | MapLibre's attribution and controls padding — the CARTO/OSM credit is a **licence condition** (`globals.css:226-232`) |
| `collection-client.tsx:28` | `/collections/[id]`'s own duplicate |

Changing the peek height moves the camera budget, the query rect, and a compliance rule together, on
a code path that has already produced two measured camera bugs (`handoff-2026-08-29…` §2). **So the
third slot must fit inside 128 px, and it does.**

Current occupancy of the peek row (`place-sheet.tsx:310-352`): `pt-3.5` 14 + button `h-12` 48 +
`pb-[safe + 0.875rem]` 14 = 76 px of the 128. There is 52 px of vertical slack; a third 44 px control
in the same flex row uses none of it.

**Horizontal budget at 375 px**, which is the real constraint:

```
375 − px-4 (32)                        = 343 available
  ▤ Collections   (icon 16 + gap 6 + label ~78 + px-2.5)  ≈ 120   shrink-0
  gap                                                        12
  ＋ Add          (icon 16 + gap 6 + "Add" ~30 + px-4)     ≈  78   shrink-0
  gap                                                        12
  heading                                          remainder ≈ 121   min-w-0, line-clamp-1
```

`13 in Tel Aviv-Yafo` at 14 px ≈ 125 px, so on the narrowest common phone the heading truncates by a
few characters. **That is the correct thing to truncate**, and the rule is explicit: the two controls
are `shrink-0`, the heading is `min-w-0 line-clamp-1`, and the full string is one drag away.

Two consequences of that budget, both named as trades rather than hidden:

1. **`Add a TikTok` becomes `＋ Add` at peek only.** It keeps its full label at `half`/`full` and on
   the empty-library screen (`place-sheet.tsx:695-709`), where it is full-width and carries the whole
   product proposition. Justification: at peek it sits beside a line that says `13 in Tel
   Aviv-Yafo`, so "Add" has an unambiguous object; on an empty screen it does not.
2. **The peek heading shortens to `{count} in {Area}`** — `13 in Tel Aviv-Yafo`, not `13 places in
   Tel Aviv-Yafo`. `AreaHeading` already carries `count` and `rest` pre-split precisely so a surface
   renders rather than parses (`active-area.ts:301-310`); this is a third derived string on the same
   object. The noun is carried by the full heading one drag up and by the fact that this is a map.
   **Do not build this by string-slicing `heading.text`.**

Below ~340 px of container width the Collections label drops to icon-only. **A CSS breakpoint, not a
JS media query** — `map-page-client.tsx:13-17` forbids the latter outright.

### 2.2 The map's visible area: unchanged. The account chip: untouched, and it should not stay untouched.

The bottom band is unchanged, so `mapOcclusionInsets`, the query rect, `fitBoundsPadding` and the
attribution padding all keep their current values. Nothing re-derives.

The **top** band is a different story and it is worth saying out loud even though it is not this
task. The account chip (`map/page.tsx:61-76`) is a floating pill that prints the signed-in user's
raw email address permanently on screen, and it costs `FLOATING_TOP_CHROME_MOBILE_PX = 100`
(`map-surface.mapcn.tsx:143`) of camera budget on every fit. `clampFitPadding`'s own comments
(`query-rect.ts:139-154`) are explicit that this budget is the scarce resource and that a phantom
100 px was the entire cause of the collections camera overflow.

**Ruling: the account control should move into the bottom band as a fourth slot, and this is the
single cheapest way to buy back camera budget on short viewports.** It returns 100 px to every fit at
375×812, 812×375, 640×360 and 568×320 — the four viewports `L2-COLL-CAM-2` established — and it takes
an email address off the screen. It is **`NAV-2`, after this**, because it touches auth UI and
because a four-slot row needs the horizontal budget in §2.1 re-cut. It does **not** become a Profile
destination (§4).

### 2.3 Gesture and mis-tap cost

- Collections sits at the **leading** edge and the primary at the **trailing** edge, with the heading
  between them. That maximises the distance between the only two consequential taps in the row: one
  navigates away from the map, one opens the import overlay. 12 px gaps, above §11.1's 8 px floor.
- All three are inside the sheet's drag surface. They need `data-vaul-no-drag`, which the peek row's
  children do not currently carry — the existing `data-vaul-no-drag` is on the **scroll container**
  (`place-sheet.tsx:393`), which is not rendered at peek. `Add a TikTok` works today because vaul
  allows drag from content only when it is scrolled to its own top, and a `<button>` press resolves
  first; a `<Link>` is less forgiving. **Put `data-vaul-no-drag` on the Collections slot explicitly.**
- The row is `Drawer.Handle`'s neighbour (`place-sheet.tsx:231`). A downward drag started on the row
  must still drag the sheet — do not swallow the gesture, only the tap.

### 2.4 States, all of them

| State | Peek row |
|---|---|
| Normal | `▤ Collections` · `{n} in {Area} ⌃` · `＋ Add` |
| Collections count 0 | Slot still renders, no count digit. `collections-nav-row.tsx:12-14`'s argument holds: hiding it makes the feature invisible to everyone who has never used it. |
| Collections count > 0 | Trailing digit, same as `collections-nav-row.tsx:35`. |
| **Library empty** (`libraryIsEmpty`) | **Two slots only**: `Your map starts here.` and the fully-labelled `Add a TikTok`. **Collections is not shown at peek.** A collection of places you do not have is not a destination yet, and the first-run screen must not look like a toolbar. It is still present in the sheet body at `half`/`full`. This is a different population from "0 collections" above — do not "fix" one into the other. |
| Filtering | Heading follows `areaHeading` as today (`3 in London`). No change to the two controls. |
| `heading.count === null` | The line is the sentence, unemphasised, exactly as `place-sheet.tsx:335-342` already does. |
| Import overlay open | The whole sheet is unmounted (`map-page-client.tsx:489`). Unchanged. |
| Desktop `lg+` | **No bar, no peek, no change.** `PlaceDesktopPanel` is a persistent panel whose Collections row is already pinned to its bottom and always visible without scrolling. Desktop is solved; do not add chrome to it. |

### 2.5 Accessibility

- Focus order at peek: `Collections` → heading button → `＋ Add`. DOM order, no reordering.
- Collections is a `<Link>` with an accessible name of `Collections` (plus the count when > 0),
  never an unlabelled glyph in the DOM even when the visible label drops out under 340 px — the
  label is visually hidden, not removed.
- All three ≥ 44 px. The heading button is already a full-height target (`place-sheet.tsx:324-343`).
- Nothing here is a dialog, nothing traps focus, and `<main>` stays in the accessibility tree — the
  `use-non-modal-background.ts` regression guard is unaffected.
- No new live-region traffic. Navigating to `/collections` is a page change and announces itself.

### 2.6 Motion

**None.** The row is state, not an event. No slide-in, no badge count roll, no hover lift. The one
motion in the neighbourhood is the sheet's own drag, which vaul owns.

---

## 3. Categories — the owner named them, and they already have a place to live

**Ruling: categories are not a destination and must not become one. They are the filter bar, which is
already specified in `ux-library-at-scale.md` §1.3 and is unbuilt.**

Plotline agrees with us here, and the coordinator's read is right: their category chips are a
horizontally scrolling row **on the map screen**, not a tab. That is exactly §1.3 — pinned under the
search field, above the rows, inside the sheet, horizontally scrollable, one category at a time, each
chip carrying its count.

I think the owner named categories because **the filter bar does not exist yet**, so today the only
way to narrow by kind is to open a place, find a tag chip, and tap it — which is a retrieval control
hidden inside a detail view. That is a real gap and it reads as "categories have nowhere to live". It
is fixed by building §1.3, not by adding a destination.

One amendment carried over from my audit §1.4: when the filter bar lands, it **merges with the `Not
been yet` chip into one horizontal-scroll bar** rather than stacking a second row, which also lifts
that chip from 36 px (`visit-state.tsx:104`, a stated compromise) to the 44 px floor.

---

## 4. The boundary — what must NOT be built

We are at L1. A navigation shell is cheap; destinations behind it are not. Each of these is refused
now so it is not proposed later as an obvious next step.

1. **Trips / Side Quests / anything itinerary-shaped.** Charter §1. Their third tab is their product;
   it is not ours. `ux-library-at-scale.md` §5.2 already rules that `🇯🇵 Tokyo · 6 places` **is** the
   trip view, and it needs no object.
2. **A `References` / source-posts destination.** The MVP boundary is `name · category · coordinates ·
   source link · user note`. The source link is a **field on a saved place**, not an entity with a
   screen. Giving TikTok posts their own destination makes them a first-class object, which is a
   product and schema widening dressed as navigation.
3. **A Profile screen.** The account control should move into the bottom band (§2.2), and there it is
   a menu — sign out, and nothing else we have. No settings page (we have no settings), no category
   breakdown, and specifically **no library-shape line** (`11 plot points · 2 countries · 6 cities`):
   the library total is deliberately displayed nowhere on `/map` (`place-desktop-panel.tsx:95-97`),
   audit §3 R5 stands, and once §2.6's country groups ship the shape *is* the section.
4. **Sections inside `/collections`.** Their Collections screen carries a grid plus `References` and
   `Cities` shelves. Reject all three. Horizontal shelves are refused on their own merits (audit §3
   R2 — two scroll axes, hidden magnitude, card soup) and `collections-index-client.tsx:189-231` is
   already the right shape. Note also that **their `Cities` shelf is our `Elsewhere` section, worse
   placed**: ours is attached to the map it scopes; theirs is divorced from it inside a collections
   screen. We have their best idea already and in a better location.
5. **A fifth slot, or a fourth held open "for later".** Three slots now, four when the account moves.
   An empty tab is a promise.
6. **A tab bar on `/collections`.** It has a back arrow to the map and that is the correct model for a
   route you enter from one place.
7. **Persisted navigation state, a URL-encoded active tab, or a router-driven shell.** Selection and
   scope stay client-only in this slice (`ux-architecture.md` §1.5).

---

## 5. Sequencing — plainly

**None of this lands inside `LIBRARY-IA-2`. All of it lands after. Do not widen
`feat/country-band-map-layer`.**

Three reasons, in order of how much they matter:

1. **It touches the same file the country band is being built in.** The peek branch is
   `place-sheet.tsx:311-352`; the band's work is the scroll container, `ElsewhereSection` and the
   area-switch handler in the same component. Two agents editing one file is precisely the failure
   `handoff-2026-08-29…` §7 records from the last session — *"four agents and the orchestrator were
   writing to one working tree"*, with one agent's in-progress work committed as if finished.
2. **Nothing here is a precondition for the band.** The band is map layers, two taps, and the grouped
   `Elsewhere` list. It does not read the peek row and the peek row does not read it.
3. **The band reduces the pressure this task is responding to.** A grouped `Elsewhere` is shorter
   than a flat one — six countries is six rows where 100 places across six countries is twenty. Land
   the band, then measure the scroll before deciding how hard §1's row has to work.

Order after the band:

| | Task | Why here |
|---|---|---|
| 1 | **`NAV-1`** — the third peek slot, §1–§2 | Discharges the owner's objection. Small, no constant churn, no camera change. |
| 2 | **`LIBRARY-IA-2b`** — the off-screen recovery row (audit §1.6a) | The band makes "camera far from your data" ordinary; this is the way back. |
| 3 | **`NAV-2`** — the account control into the bottom band, §2.2 | Returns 100 px of camera budget and takes an email off the screen. Re-cuts §2.1's horizontal budget for four slots. |
| 4 | **`LIBRARY-IA-3`** — the filter bar, §1.3 + the `Not been yet` merge | Answers the "categories" half of the owner's message. |

`NAV-1` is verified at 375×812, 812×375, 640×360 and 568×320 — the same four viewports
`L2-COLL-CAM-2` established — plus one Hebrew area label and one long English one, because the
heading is the element that truncates.

---

## 6. Delta against `ux-library-audit-2026-08-29.md`

Readable, so nobody has to diff two documents.

| Audit said | Now |
|---|---|
| §1.7: "keep the row, move it out of the scroll container" | **Still true, still keep it** — but re-framed as the `half`/`full` half of the answer, not the answer. |
| §1.7: reaffirmed the tab-bar refusal on all three of `collections-nav-row.tsx:3-9`'s costs | **Two of the three costs are dead or inverted.** The refusal survives on the peek collision alone (§1.1–§1.2), plus a fourth cost the original did not state: a bar forces a navigation-model change on `/collections`. |
| §1.7: reachability assessed at `half`/`full` | **Wrong question.** The app rests at `peek`, where the pinned row is off screen entirely (§0). |
| §3 A3: the previous-country expansion makes an area switch reversible in one tap | **Unchanged and still right.** It is about returning between *areas*, not about reaching *destinations*. The two are independent. |
| §3 R2 (no shelves), R3 (no select mode), R4 (no per-row distance), R5 (no library-shape line) | **All unchanged**, and R5 is reinforced: it is now also the reason there is no Profile screen (§4.3). |
| §4: `CollectionsNavRow` move listed as in-scope for `LIBRARY-IA-2` | **Already built. Nothing further goes into that branch** (§5). |

**New rulings this document adds:** the third peek slot and its exact budget (§1, §2.1); `＋ Add` and
`{count} in {Area}` as peek-only strings; the empty-library two-slot exception (§2.4); categories are
the filter bar and not a destination (§3); the account control moves to the bottom band as `NAV-2`
for a measured camera reason (§2.2); and the seven-item refusal list in §4.
