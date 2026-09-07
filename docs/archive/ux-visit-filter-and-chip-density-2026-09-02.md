# The filter row — visit states and chip density

> **Spec, written 2026-09-02 against `no-crumbs-implementation` at `5e4ec45`.** Lane C of
> `feedback-round-3-work-plan.md`, covering owner feedback **§1.3** (the chip row eats the sidebar)
> and **§1.4** (Been / Not been yet is not intuitive). `ux-interaction` writes this;
> `design-system-frontend` builds it. Nothing here was run — I have no shell, so every number below
> is either read out of the source or marked **ESTIMATE** with the arithmetic that produced it.
>
> The words **Been** and **Not been yet** are ratified (`voice-and-vocabulary.md` §3, asserted by
> `tests/unit/ui/visit-state.test.ts`). Nothing in this spec renames them.

---

## 0. Read this before the rest: §1.3 is mostly not about the category row

The owner's list of offending chips is *Restaurant, Cafe, Bakery, Asian, Italian, Brunch,
Mediterranean, Middle Eastern, Desserts, Japanese, SpecialtyCoffee*. Only the first two are
categories.

`src/domain/places/product-category.ts:50` makes `ProductCategory` an alias of `PrimaryCategory`, and
`voice-and-vocabulary.md` §3 states the count out loud: **there are exactly three categories** —
restaurant, cafe, bar. `CategoryFilterBar` can therefore render **at most four controls**: three
category chips plus `Not been yet`. Bakery, Asian, Italian, Brunch, Mediterranean, Middle Eastern,
Desserts, Japanese and Specialty Coffee are **tags**, drawn by `TagFacetBar`
(`place-enrichment.tsx:264`) from `tagFacets()` (`src/ui/place/tag-filter.ts`), which is capped at
`MAX_TAG_FACETS = 12` and has **no floor** (`tag-filter.ts:114`).

`product-review-2026-09-01-r5.md:212` measured the whole band at 372 px — and its own breakdown says
15 chips of which **12 carry `, 1 place`**. Twelve singleton tag chips. That is the 372 px.

**Consequence for the lane.** Lane C's write scope is `category-filter-bar.tsx` and
`src/ui/place/visit-state.ts`. Neither file can shrink the tag row. As scoped, **Lane C cannot fix
the larger half of §1.3.** The cheap fix is r5's own: a minimum count beside `MAX_TAG_FACETS` in
`src/ui/place/tag-filter.ts`, which on the owner's library drops the tag row from 12 chips to ~2 and
is self-limiting at scale. That is one constant and a test. It is not in this spec's scope; it is
raised to the orchestrator in §8.

Everything below still stands on its own merits — collapsing the category row is right, and the
visit control is genuinely illegible — but nobody should expect the 372 px back from this lane
alone.

---

## 1. What is actually wrong, stated as defects

| # | Defect | Where |
|---|---|---|
| D1 | On a phone the filter row is a **horizontal scroll container**, so the visit control's state can be scrolled off-screen. A control whose whole job is to be legible at rest lives in the one container that can hide it | `category-filter-bar.tsx:197` |
| D2 | The visit control has **two visual states for three meanings**. Unpressed says nothing about whether been places are included; there is no state that says "been only" at all | `category-filter-bar.tsx:202-215` |
| D3 | The `x` that appears when pressed is `aria-hidden` decoration inside the same button. It carries a dismissal glyph's affordance with no dismissal control's label — a screen reader hears nothing, a sighted user reads "close" | `category-filter-bar.tsx:213` |
| D4 | On desktop the row **wraps**, so every chip costs vertical space in the panel. 3 categories + 1 visit chip ≈ 2 lines; the 12 tag chips beneath are the rest of the 372 px | `category-filter-bar.tsx:197` (`lg:flex-wrap`) |

D3 is the one the existing docblock argues *for*: *"a second target just to remove it would be two
controls for one boolean"* (`category-filter-bar.tsx:26-30`). That argument is correct about a
boolean and wrong about this control — see §7.

---

## 2. Measurement basis

390×844, sheet padding `px-4` → **358 px** of content width. Chip text is `text-xs` (12 px)
`font-bold`; `CHIP_PRESSABLE` adds `px-3` (24 px horizontal). At ~6.9 px per character
(**ESTIMATE**, from 12 px bold sans):

| Label | Text | + padding |
|---|---|---|
| `All` | 21 | 45 |
| `Been` | 28 | 52 |
| `Not been yet` | 83 | 107 |
| `Category` | 55 | 79 · +14 chevron +8 gap = **101** |
| `Café 4` (active trigger) | 45 | 69 · +8 dot +14 chevron +16 gaps = **107** |

A three-segment track: 45 + 52 + 107 + `p-1` (8) + two 4 px gaps = **212 px**. Height **44 px**
(`min-h-11`), unchanged from today's floor.

---

## 3. Common to both options — the category trigger (C-T1)

This part does not depend on which visit option is chosen. **Build it first and independently.**

### 3.1 Why not a native `<select>`, in one line

`facelift-plan.md:144` locks the pressed category chip filling with **that category's own colour**,
and `:81` makes category colour load-bearing across pins, chips and counts. A native `<select>`
cannot paint an option in a data-driven colour on iOS or Android, so choosing one would delete the
one visual thread tying a chip to its pin. The trigger below keeps it: **when a category is active
the trigger itself is the pressed chip** — same fill, same `--tag-selected` override, same dot.

### 3.2 The trigger

A single `<button>` in the filter row, `min-h-11`, built from `CHIP_PRESSABLE` + `BAR_CHIP` so it is
the same object family as the chips it replaces.

| State | Renders | Accessible name |
|---|---|---|
| **No category active, closed** | `Category` + chevron-down. Unpressed chip styling | `Category, showing all` |
| **Category active, closed** | dot + `Café` + `4` + chevron-down. `aria-pressed="true"`, filled with `var(--category-cafe)` via the existing `--tag-selected` override, ink `--on-category` | `Category, Café, 4 places` |
| **Open** | chevron-up; `aria-expanded="true"`, `aria-controls` the panel | as above |
| **Fewer than 2 categories present** | not rendered at all — today's `showCategories` rule, unchanged | — |

`aria-expanded` and `aria-pressed` on one button is legal and is the honest description: it is a
toggle that is also a disclosure. If `design-system-frontend` finds a screen reader that reads that
pair confusingly, drop `aria-pressed` and keep the state in the accessible name; do not drop
`aria-expanded`.

### 3.3 The panel — an inline disclosure, not a portal popover

**Decision: the chips expand in place, directly under the trigger, in normal flow.** Not a floating
popover, and this is a build-cost decision as much as a design one:

- `PlaceSheet` is already a vaul `Drawer.Root`, and `add-sheet.tsx:21` records that nesting drawers
  here "does not nest cleanly". A second gesture surface inside the sheet is the highest-risk thing
  we could build four days out.
- A portal popover needs positioning, outside-click, a focus trap and Escape. Round 5 found the
  profile popover shipped **without** a focus trap and without Escape returning focus
  (`product-review-2026-09-01-r5.md` G1). We would be committing the same defect on a second surface.
- Inline costs vertical space *only while open*, by the user's own action. That is honest. The
  resting state — the thing the owner is complaining about — is one 44 px control either way.

Panel spec:

- Container: `data-vaul-no-drag`, `role="group"`, `aria-label="Category"`, `id` matching the
  trigger's `aria-controls`.
- The **existing chips, unchanged** — same component, same colours, same counts, same
  `aria-pressed`, same press-the-pressed-one-clears behaviour. This spec moves them; it does not
  restyle them.
- Layout: wraps (`flex-wrap`), never scrolls horizontally. Three chips wrap to at most two lines at
  390 px.
- `max-h-[40vh] overflow-y-auto` as a guard. With three categories it will never engage; it exists
  so a future taxonomy cannot reintroduce the defect.
- Panel header row: the word `Category` (11 px tracked uppercase kicker — `FILTER_KICKER`, already
  exported) on the inline-start edge, and **when a category is active** a text button `Clear` on the
  inline-end edge, `min-h-11`, accessible name `Clear category filter`.

**`Clear` is a word, not an `x`.** That is D3's fix applied here pre-emptively so the two halves of
this lane agree with each other.

### 3.4 Open/close behaviour

| Event | Result |
|---|---|
| Tap trigger (closed) | Panel opens. Focus **stays on the trigger** — no auto-focus into the panel; the first chip is one Tab away and stealing focus on a phone is how a virtual keyboard or a screen reader loses its place |
| Tap trigger (open) | Panel closes |
| Tap a chip | Applies or clears that category, **panel closes**, focus returns to the trigger. The trigger has just changed to show what you chose, so the state you asked about is under your finger |
| Tap `Clear` | Clears, panel closes, focus to the trigger |
| `Escape` while focus is inside the panel or on the trigger | Panel closes, focus to the trigger |
| Tab past the last chip | Focus leaves the panel normally and the panel **stays open**. It is inline content, not a modal, and it makes no modal claim |
| Category filter changes | The existing `useResultAnnouncement` live region already speaks the new count. Nothing new to announce |

### 3.5 Motion

Opening: `duration-enter` (140 ms) fade + `motion-safe:` 4 px rise — the same treatment the area
heading already uses (`place-sheet.tsx:531-533`). **No height animation**: animating height on a
container inside a scrolling sheet is a layout-thrash cost for no information.
`prefers-reduced-motion`: fade only, per `facelift-plan.md` §3a's rule that the nine animations
collapse to the opacity change rather than to nothing.

### 3.6 What this buys

| Breakpoint | Before | After (**ESTIMATE**) |
|---|---|---|
| 390×844 | Row scrolls; 3 category chips + visit control compete for 358 px, and at 4 controls the trailing one clips | 1 trigger, 101–107 px. Nothing in the row scrolls |
| 1440×900 panel | Category chips wrap to ~2 lines ≈ 96 px | 1 line ≈ 44 px. Net **−52 px**; the remaining ~276 px of r5's band is the tag row, which this lane does not own |

---

## 4. The visit filter — the model, common to both options

**Three states, named, mutually exclusive.**

| State | Label | Means | Predicate |
|---|---|---|---|
| `all` | `All` | everything, been and not | identity |
| `not-been` | `Not been yet` | been places **excluded** | today's `notBeenOnly === true` |
| `been` | `Been` | been places **only** | new |

Today's model is a boolean, so `been` does not exist. Adding it is what makes the three meanings
namable at all: with two states, "include" and "everything" are the same pixel, which is precisely
the owner's complaint. `visit-state.ts` gains one type and one string constant; the labels are the
ratified words plus `All`, which is not in the banned list, is sentence case, states a fact and
stops.

**Gating, unchanged in spirit from `showNotBeen`:** render the control when
`anyVisited || visitFilter !== 'all'`. Nothing marked been ⇒ two of the three states return the same
rows ⇒ the control is a target that does nothing. When it is hidden the state is `all`.

**Empty result.** `Been` with a filtered result of 0 is now reachable. It uses the existing
all-filtered state with one string: **`No places you have been to yet.`** and the existing means of
undoing the filter (the control is above the empty state, as `place-sheet.tsx:556-559` already
requires). One clause, no apology, the next move is on screen.

### 4.1 Semantics — native radios, not `aria-pressed`

`aria-pressed` on three buttons announces three independent toggles; the states are mutually
exclusive, so that is a lie. Use **three visually-hidden `<input type="radio">` in one `<fieldset>`
with styled `<label>`s**:

- Arrow-key navigation, group membership and "2 of 3, selected" come from the platform. **No roving
  tabindex to build** — the cheapest correct option, and the reason not to hand-roll
  `role="radiogroup"`.
- The whole label is the hit area: `min-h-11`, full segment width.
- Focus ring on the label via `peer-focus-visible:` — `focus-visible:ring-3 focus-visible:ring-ring/50`,
  matching every other control here.
- Group name: `<legend class="sr-only">Been</legend>`, or `aria-label="Been"` on the fieldset. The
  group is named with the ratified word; the segments are its three answers.

### 4.2 Not by colour alone

The selected segment differs on **four** channels: fill (`bg-card` on a `bg-muted/60` track),
elevation (`shadow-raised`), ink (`text-foreground` vs `text-muted-foreground`) and weight
(`font-bold` vs `font-medium`). This is the treatment already shipped for the Places/Collections
switch (`map-shell.tsx:151-183`), so it is a pattern the product speaks, not a new one.

**House mint stays off it.** `category-filter-bar.tsx:207-209` argues that the visit filter has no
category colour it could honestly borrow; a segmented control needs no accent at all, and adding one
would make it compete with the coloured category trigger beside it.

### 4.3 Motion

Selected fill cross-fades over `duration-press` (90 ms). **No sliding indicator** — a pill that
travels between segments is a layout animation whose only content is "you pressed the thing you just
pressed". Reduced motion: the cross-fade is already an opacity change, so it stands as-is.

### 4.4 Clearing

There is nothing to clear. `All` is a state you select, not a dismissal you discover. **The `x` is
deleted** and no glyph replaces it.

---

## 5. Option A — the visit control stays in the filter row

The row becomes: `[ All | Not been yet | Been ]` then `[ Category ▾ ]`, in the same
horizontally-scrolling container.

**States at rest, 390×844:** track 212 px + gap 8 + trigger 101 = **321 px** with no category
active; with one active, 212 + 8 + 107 = **327 px** against 358 available. It fits — *today*.

| | |
|---|---|
| **Costs** | It fits with **31 px to spare** (**ESTIMATE**), and that margin is eaten by: a longer category name in Hebrew, a 3-digit count, a 320 px viewport, or any future fourth control. When it stops fitting, the thing that scrolls off-screen is a segment of the control this lane exists to make legible — D1 reintroduced. The control also remains inside `overflow-x-auto`, so a stray horizontal fling can hide it *at any width*. And a segmented control (pick exactly one) sits 8 px from a toggle chip (press to narrow, press again to clear) in identical 44 px pill shapes — two interaction models in one row, which is the confusion D2 describes, re-drawn |
| **Gains** | **Zero extra vertical rows.** One component, one container, the smallest possible diff — realistically half a day. Keeps `category-filter-bar.tsx` as the single owner of "the filter row", which is what the nav ruling §3 asked for |
| **Touch** | Every target 44 px tall; segments 45/52/107 wide; trigger 101. All clear the floor |

## 6. Option B — the visit control moves out of the row

Two rows in the sheet header, in this order:

```
[ search field ]
[ 3 shown of 7 ]
[  All  |  Not been yet  |  Been  ]        ← full width, 44 px, own row
[ Category ▾ ]  [ Sort: Recently saved | A–Z ]
```

The visit control becomes a **full-width segmented control** on its own line, directly under the
result count and above the collapsed category trigger.

Widths at 390: track `w-full` = 358; segments `flex-auto` (`flex: 1 1 auto`) so each takes its
content width plus a share of the slack — `Not been yet` keeps its 107 px and the short segments grow
into the rest. This holds down to ~250 px of track, so a 320 px device is safe without truncation.
RTL: logical properties only; document order is unchanged.

| | |
|---|---|
| **Costs** | **One extra row on the phone: 44 px + 8 px gap = 52 px, 6 % of an 844 px viewport** (**ESTIMATE**), and it is spent at the top of the sheet where the sheet's `half` snap is tightest. It is a second component to build and a second thing to keep in step across `PlaceSheet` and `PlaceDesktopPanel`. It also splits "the filter row" into two rows, which the merge ruling deliberately unified |
| **Gains** | The control is out of the scroll container **permanently** — its three states cannot be hidden by a gesture, a long name or a wide count, which is the literal requirement ("distinguishable without pressing anything"). Full width means the three labels sit side by side at a glance and the shape reads as *pick one*, distinct from the chips below which read as *narrow by attribute*. On desktop the row costs 44 px and, once the category row collapses, the header is **shorter than today** despite the extra line |
| **Touch** | Segments ≈ 119/113/126 px wide × 44 tall at 390 (**ESTIMATE**). Comfortably the largest targets in the header |

### 6.1 Net vertical, both options, both breakpoints (**ESTIMATE**)

| | Today | Option A | Option B |
|---|---|---|---|
| 390×844 header, category rows | 44 (scrolls) | 44 | 96 |
| 1440×900 panel, category + visit | ~96 (wraps) | ~44 | ~96 |
| Tag row, both | ~276 | ~276 | ~276 |

The last row is the point of §0: **whichever option is chosen, the desktop panel is still mostly tag
chips afterwards.**

---

## 7. Recommendation

**Option B.** Not because the row is too full — Option A does fit — but because the requirement is
that three states be legible *without pressing anything*, and Option A leaves that control inside an
`overflow-x-auto` container with a 31 px margin. A requirement about always-visible state and a container
whose job is to hide overflow are in direct contradiction; the 52 px is the price of removing the
contradiction rather than managing it. The second reason is shape: a segmented control and a toggle
chip mean different things and today they look identical, so separating them onto two lines is the
cheapest way to say "this one is a view you are in, those are narrowings you applied." The 52 px is
real and I am not going to pretend otherwise — but it is spent once on the phone, it is repaid on
desktop the moment the category trigger lands, and Lane B is separately buying rows back on the card
this header sits above. If the owner prefers Option A, the spec above is complete enough to build it
and the honest downside is that we will be back here the first time a Hebrew category name or a
three-digit count pushes a segment off the edge.

---

## 8. For the orchestrator, not for the builder

1. **Scope collision, blocking.** A tri-state visit filter cannot be built inside Lane C's stated
   scope. `filterByVisit` lives in `src/components/map/filter-places.ts` and the state, the
   `narrowing` prop and `filterSentence` live in `src/app/map/map-page-client.tsx:406, 690, 818,
   1631-1690` — **both are Lane D's exclusive scope this wave.** Either extend Lane C to those two
   files and sequence it after Lane D, or ship the two-state variant (`All` / `Not been yet`) now
   and add `Been` in wave 2. The two-state variant still fixes D1, D3 and D4 and half of D2, and it
   needs no file outside Lane C except the prop rename.
2. **§0 is the bigger half of §1.3 and it is unowned.** The 372 px is twelve singleton tag chips.
   The fix is a minimum count beside `MAX_TAG_FACETS` in `src/ui/place/tag-filter.ts:114`, which is
   in no lane's scope this wave. It is an hour of work and it is worth more than everything else in
   this document.
3. **Buildable independently, deliberately.** §3 (the category trigger) touches only
   `category-filter-bar.tsx`. §4-§6 (the visit control) touch `visit-state.ts` and a new component.
   They share no state and can be built and reviewed in either order, or by two passes.
4. **Not verified.** I have no shell and did not run the app. Every width in §2 is arithmetic on the
   source, not a measurement in a browser. `design-system-frontend` should re-measure the trigger
   and the track at 390 and at 1440 before treating any number here as fact.

---

## 9. Existing rulings this spec overturns, and why

**`category-filter-bar.tsx:26-30` — "one control that is also its own dismissal … a second target
just to remove it would be two controls for one boolean."** Sound about a boolean; wrong about this
control. A boolean toggle whose off state is invisible is not one control, it is one control and a
guess. And the file did not actually hold the line — it added an `x` glyph (`:213`), which is a
dismissal affordance with no dismissal control behind it. It paid the visual cost of the second
target and got none of its clarity. Three named states in one radio group is *still* one control.

**`category-filter-bar.tsx:37-49` — "No `All` chip … a pressed chip means *this is narrowing your
library*, and an `All` chip would sit pressed in the state where nothing is narrowed."** Correct,
and it is why §3 keeps the chips exactly as they are. It does not transfer to a segmented control:
there, the selected segment means *this is the view you are in*, and "everything" is a legitimate
view. The ruling generalised a chip-row semantic into a law about the whole filter.

**`category-filter-bar.tsx:16-23` — the 44 px argument for the merge.** Still true and this spec
keeps every target at 44 px. But it justified merging into *a row of chips*; what shipped is a
*horizontally scrolling* row of chips, and no touch-target argument covers a control that can be
scrolled out of sight. The merge bought the height and quietly sold the visibility.

**`voice-and-vocabulary.md` §3, "category — there are exactly three".** Not overturned — **upheld**,
and it is the fact that reframes the whole complaint in §0. If anything on screen suggests otherwise,
the defect is that tags and categories are drawn in the same chip, which `place-enrichment.tsx:260-262`
already worries about in writing.
