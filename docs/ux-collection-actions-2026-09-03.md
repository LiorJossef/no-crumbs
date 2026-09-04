# Collection actions — Select / Share / Edit / Delete, and the added-by filter

> **Spec, 2026-09-03. `ux-interaction` writes it, `design-system-frontend` builds it.**
> Surface: `src/components/collections/collection-content.tsx` (`CollectionList`, `CollectionMenu`,
> `MenuRow`, `AddedByFilter`, `AddedByChip`) at 375×812 in the sheet and at `lg+` in the desktop
> panel. Nothing in `/map`'s own list changes.
>
> Base commit for the reading below: `6901ed9`. Measured shapes quoted from the orchestrator's
> browser pass at 375×812 inside `London 2026`, 15 places.

---

## 1. What is actually wrong

The collection screen is speaking a control language the rest of the product retired. The Places
list says its object-level state on the heading row (`59 places in your library` · text `Select`),
then a search field, then **named dropdown triggers** whose value is readable at rest (`Been ⌄`
`Category ⌄` `Tags ⌄`), then `Sort: ⌄` — one trigger family, one panel material, inline disclosure
on the phone and an anchored popup at `lg+`. The collection answers the same jobs with two
materials that predate that system: an unlabelled 44 px `⋯` glyph hiding four unrelated things (a
mode switch, a navigation, a form and two destructions) behind a bespoke inline block
(`rounded-lg border bg-muted/40`, full-width 44 px rows) that exists nowhere else in the product;
and — when there are two contributors — a horizontally scrolling, edge-bleeding strip of 44 px
mint-filled radio chips, which is precisely the chip wall `library-filter-bar.tsx` deleted on
2026-09-02. So "doesn't match the rest of the UI" is literally true and is two defects, not one:
**the wrong container for the actions, and the retired container for the filter.** Underneath it,
the third mismatch is that the one action a user takes constantly on this screen — `Select` — is
buried at the same depth as `Delete collection`, while the Places list puts its identical control
one tap away in plain text.

**Verdict on `AddedByFilter`, plainly asked for and plainly answered:** the *logic* is right and
ships as is — `addersIn()` groups, orders and labels correctly, and `adderFilterIsUseful()` already
refuses to draw the control for a solo collection, which is the exact gate this spec would
otherwise have to invent. It is not mis-placed and it is not failing to show; it is showing in the
wrong material. Keep `added-by.ts` untouched, delete the two presentational components, re-render
the same data through the library's `MenuAxis` + `AxisRows`.

**One correction to the request, then I spec it anyway.** The column is
`collection_items.added_by` — who put the place *into this collection*, not who saved it. Those
differ the moment someone adds a place a collaborator originally saved, so the axis is named
`Added by`, never `Saved by`. Everything below assumes that reading.

---

## 2. The header and its actions

### 2.1 Phone — 375×812, in the sheet (`stop !== undefined`)

```
 ┌──────────────────────────────────────────────┐
 │ London 2026                    Select    ⋯   │  row 1 — h2, flex-1, line-clamp-2
 │ 15 places · 👥 You and Maya                  │  row 2 — meta line, unchanged
 │ ┌──────────────────────────────────────────┐ │
 │ │ 🔍 Search this collection                │ │  row 3 — PlaceSearchField, unchanged
 │ └──────────────────────────────────────────┘ │
 │ ( Added by ⌄ )                               │  row 4 — only when ≥2 adders (§3)
 ├──────────────────────────────────────────────┤
 │ place rows …                                 │
 ├──────────────────────────────────────────────┤
 │ [        ＋ Add places        ]              │  pinned footer — secondary, not mint (§4)
 └──────────────────────────────────────────────┘
```

**Row 1, trailing slot — two controls, in this order.**

| Control | Component / variant | Size | Label | Condition |
|---|---|---|---|---|
| `Select` | `EnterSelectionButton` from `sheet/library-selection.tsx`, reused verbatim | `min-h-11`, `px-2`, `text-sm font-medium text-muted-foreground`, `PRESS_ROW` | `Select` (`ENTER_SELECTION_LABEL`) | `canEdit(role) && places.length > 0 && !selecting` |
| `⋯` | `Button variant="ghost" size="icon-lg"`, `className="-me-2 -my-1.5 size-11 shrink-0 rounded-full text-muted-foreground"` — **unchanged from today** | 44 px target, 32 px of layout | `aria-label="Collection options"` | `!selecting` |

`EnterSelectionButton` carries `ms-auto`; the heading keeps `min-w-0 flex-1`, so both trailing
controls are `shrink-0` and the name is what truncates. At 375 the trailing pair costs ~98 px of a
343 px content width, leaving ~245 px for a two-line clamp — a 26-character name still fits one
line. The `⋯` keeps its negative margins: that economy is what bought the 36 px the `Collections`
up-link cost, and **this spec re-adds nothing that deletion removed.** The up-link stays deleted;
the drawer's `Places / Collections` switch above this header is still the way up.

`Select` is promoted here for the same two reasons `library-selection.tsx` gives for its own: it
costs **zero vertical pixels** on a header the owner already measured as too tall, and it changes
what a *row* does, which is not an action *on the collection* and therefore does not belong in an
object menu.

**The `⋯` menu, after the promotion — three rows for a manager, one for everyone else.**

| Row | Label | Tone | Condition |
|---|---|---|---|
| 1 | `Share` | plain | `canManage(role)` |
| 2 | `Edit` | plain | `canManage(role)` |
| 3 | `Delete collection` | destructive-at-rest (§6) | `canManage(role)` |
| 1′ | `Leave collection` | **plain**, changed (§6) | `!canManage(role)` |

`Select places` is gone from the menu (§7.1). `Share` stays even though the meta line opens the
same view: the meta line is caption-weight text with no control affordance a first-time user reads,
and the menu exists anyway, so the duplicate costs nothing and buys the collaboration feature its
only labelled entry point.

**The menu's material — this is the fix the owner asked for.** Rebuild `CollectionMenu`'s
container and rows on the panel material `library-filter-bar.tsx` already ships, and take the same
two-surface split:

- **Container, phone:** the `INLINE_PANEL` treatment — `PANEL_SURFACE` (`rounded-lg
  border-border/60 bg-popover p-1 shadow-raised`), `mt-1.5 w-full`, in normal flow directly under
  row 1, pushing the meta line and everything below it down. No portal, no scrim, no modal claim.
  It renders **under the header block**, i.e. after the meta line and before the search field, so
  the collection's identity stays visible above an open menu.
- **Container, `lg+`:** `MENU_POPUP` — a `Menu.Portal` → `Positioner side="bottom" align="end"
  sideOffset={6}` anchored to the `⋯` itself, `w-max min-w-40`.
- **Rows:** `MENU_ROW` + `MENU_ROW_PAINT` geometry — 40 px of paint inside a 44 px target,
  `rounded-sm px-2`, no fill/border/elevation at rest, `bg-card-2` on highlight and hover, ring on
  `focus-visible`. **One deviation:** `text-sm`, not `text-xs`. The library's 12 px is calibrated
  for a twelve-row options list with a count column; this is a three-row command list where one row
  is irreversible, and 12 px destructive text is a legibility problem the density argument does not
  pay for. The size step is the only difference — same height, same radius, same offsets, same
  highlight.
- **Not** `MoreHorizontal` inside a filter pill and **not** `MenuAxis`: that component composes a
  filter's accessible name (`"…, showing all"`) and paints a value-bearing chevron pill. An action
  menu has no value.

The `⋯` already gets its open state free: `variant="ghost"` carries `aria-expanded:bg-card-2`, and
`aria-expanded={menuOpen}` is already on the element. Nothing to add.

**Build note, and it is the one dependency in this spec.** `PANEL_SURFACE`, `INLINE_PANEL`,
`MENU_POPUP`, `MENU_ROW`, `MENU_ROW_PAINT` and the `InlinePanel` component are private to
`library-filter-bar.tsx`. Preferred: lift the five class constants and `InlinePanel` into
`src/components/ui/inline-menu.tsx` and have both files import them, so the two menus cannot drift.
**Acceptable minimum if that extraction is judged too wide for this task:** export the five
constants from `library-filter-bar.tsx` and import them; do not re-declare the strings in
`collection-content.tsx`. A third copy of this material is how we get back here.

**Every consequence renders in the header band, never inside the menu.** Pressing `Edit`, `Delete
collection` or `Leave collection` closes the menu and renders the edit form / `InlineConfirm`
in the header block, below the meta line, exactly where they render today. This is a rule, not an
implementation detail: it keeps one confirm surface across both breakpoints, and it avoids a
confirm inside an `lg+` popup that an outside press would silently dismiss mid-decision. The
existing error placement is preserved unchanged — a **refused** delete or leave collapses its
confirm and prints the reason in the band; an **unreachable** one keeps the confirm up with the
message inside it.

### 2.2 Desktop — `lg+` panel (`stop === undefined`)

Identical composition, three differences and no fourth:

1. The heading is `<h1>` (existing `HeadingTag` logic, untouched).
2. Menus are anchored popups (`surface="popover"`) instead of inline panels — for the `⋯` menu and
   for `Added by` alike.
3. `floatingBarClearancePx(undefined) === 0`, so the pinned footer has no bar to clear and
   `BottomNav` does not render, so there is no `＋` on screen at all.

The footer button keeps the **same variant at both breakpoints** (§4). A control that changes
colour at 1024 px is a bug report, not a responsive design.

---

## 3. The added-by filter

**Where:** row 4, directly under the search field, full width, `mt-2`. Below rather than beside:
they narrow the same list, and stacking keeps each control full width at 375. This is where it sits
today and the position was right.

**What:** one `MenuAxis` from `library-filter-bar.tsx`, `tone="filter"`, `surface="inline"` in the
sheet and `"popover"` at `lg+`, with `AxisRows` as its children. That is the same 32-px-painted /
44-px-target pill, the same chevron, the same active fill, the same inline-panel-with-kicker on the
phone as `Been`, `Category` and `Tags`.

```
props: axis="Added by"
       value = selected adder's label, or null
       count = that adder's count, or null
       active = addedBy !== null
       axisClear = addedBy === null ? null : () => setAddedBy(null)
rows (AxisRows, groupLabel="Added by", value = addedBy ?? 'everyone'):
       Everyone                                   (no count)
       You                       11
       Maya                       3
       Added before we tracked this   1           (only when that bucket is non-empty)
```

Rows come straight from `addersIn(collection, currentUserId)`; `NO_ADDER_LABEL` is unchanged.
`AxisRows` gives single-select-closes-on-choose and focus return to the trigger for free, both of
which the chip strip lacks today.

**When it appears — the rule, unchanged and now stated:** `adderFilterIsUseful(adders)`, i.e. **two
or more distinct adders**, and additionally never while `selecting`. One adder means every row
returns the same list, so a solo collection grows no chrome at all — which is most collections. The
one addition to today's gate: if a filter is *set* and the collection drops to one adder underneath
the user (a collaborator's places are taken out in another tab), the trigger stays drawn while
`addedBy !== null`, so the control that undoes the narrowing cannot vanish while the narrowing is
still on. This is the same clause `showVisit` and `showCategories` already carry, and it is the
defect the library header exists to refuse.

**Coexistence with search:** they compose as AND, exactly as today (`matches` filters `searched`).
`Clear` appears on the inline panel's kicker line via `axisClear` — not as a separate control in the
row, because at one axis a row-level `Clear` beside a single pill is two controls for one action.
The two empty-result strings stay verbatim and stay split on the same condition:

- `addedBy !== null && query.trim() === ''` → `Nothing in this collection from them.`
- otherwise → `Nothing in this collection matches that.`

**No `Been` / `Category` / `Tags` / `Sort` row in a collection.** Out of scope here; a collection is
tens of items and a second filter language on a shared list is a separate decision. Noted as a
future, not deferred work.

---

## 4. `Add places` and the two mint affordances

The collision is real and it is only visual: the `＋` FAB opens the global create menu (`Add a place`
/ paste a TikTok link / `New collection`); the footer's `Add places` opens the picker over the
viewer's **existing library**. They are different actions, so deleting either one deletes a path.
The pinned footer stays — it is thumb-reachable, it is this screen's principal act, and it is
already correctly sized against the bar.

**Ruling: both `Add places` buttons change from `variant="default"` (mint) to
`variant="secondary"`.** Size, geometry, icon and label are untouched:
`<Button size="lg" variant="secondary" className="h-12 w-full text-base">` with `<Plus
className="size-4" />` + `Add places`. Two call sites — the pinned footer and `EmptyCollection` —
and they must change together, because on an empty collection the footer is absent but the `＋` is
still on screen.

Why `secondary` and not `outline`: `outline` is already the resting material of `Take out of this
collection` in the same pinned slot. The two are never on screen simultaneously, but the slot would
then mean "add" in one mode and "take out" in the other with the same paint, and a pinned slab is
learned by position before it is read. `secondary` is a filled button — it still reads as this
screen's principal action — in a neutral the `＋` cannot be confused with.

House mint on this screen is then spent on exactly one thing: the `＋`, which means one thing
everywhere in the product.

---

## 5. Selection mode

Structurally this is already right and the diff is small — say so, and change only the entry point.

- **Enter:** the `Select` control on the heading row (§2.1), not a menu row. On press, keep every
  line of today's behaviour: clear the search, clear the added-by filter, drop any take-out notice,
  then `setSelecting(true)`. The reason stands verbatim — a list still narrowed by controls that are
  no longer on screen is a list whose `Select all` picks a number the user cannot see.
- **While selecting:** row 1 is the heading alone; **both** `Select` and `⋯` are hidden. Hiding the
  `⋯` is a change (§7.7): none of its four actions is available or sensible mid-selection, and an
  open options menu over a live selection is a trap with no defined behaviour.
- **The toolbar** replaces the search field and the `Added by` row, unchanged:
  `Cancel` · `N selected` (`aria-live="polite"`) · `Select all` / `Clear`, all `Button
  variant="ghost"` at `h-11 px-3 text-sm font-semibold`.
- **`Cancel`, not `Done` — deliberately, and this is not an oversight.** `bulk-delete.ts` rules the
  divergence: the library says `Done`, the collection says `Cancel`, so two multi-select surfaces
  with two different removals do not present one identical escape. Parity with the Places list stops
  at the entry point; the exit words stay apart on purpose.
- **The footer swaps** to `Take out of this collection` — `Button variant="outline" size="lg"
  className="h-12 w-full text-base"`, disabled at zero selected. Unchanged, including its refusal
  to be red (§6).
- **Leave:** `Cancel`, or a completed take-out. Focus returns to the `Select` control on the heading
  row when selection is left by `Cancel` — it is the control that opened the mode and it is back on
  screen. (Today focus lands on `<body>`; this is the same defect `MenuAxis.close` fixes for the
  inline panel.)

---

## 6. Destructive actions

**The existing ruling, found and honoured.** `bulk-removal.ts` and the comment above the `Take out`
button state it: unlinking destroys nothing of the viewer's, so it is **not** red at rest, and
"red appears on this screen only inside the confirm, on its confirm button." `ux-two-removals-one-
screen.md` §2.3–§2.4 is the source.

**Generalised into one rule this screen can be checked against:**

> Red at rest is reserved for the **irreversible**. Every other removal is neutral at rest and gets
> its red only on the confirm button of an open confirm.

Applied:

| Action | Reversible? | Row at rest | Confirm | Confirm button |
|---|---|---|---|---|
| `Delete collection` | No — everyone loses it | `text-destructive` | `InlineConfirm`, prompt `Delete “X”? Everyone loses it.` | `variant="destructive"`, label `Delete` |
| `Leave collection` | **Yes** — its own prompt says `You can rejoin with the link.` | **plain `text-foreground`** — changed (§7.6) | `InlineConfirm`, prompt `Leave “X”? You can rejoin with the link.` | `variant="destructive"`, label `Leave` |
| `Take out of this collection` | Yes | outline button, no red | `InlineConfirm` with `body` | `variant="destructive"`, label `Take out` |

Both menu confirms keep the **shallower** pattern they have: one prompt line, no body, two buttons,
**no autofocus**, confirm first and `Cancel` second. The deeper pattern — a body enumerating what is
lost, `Cancel` first and autofocused — belongs to the library's `saved_places` delete and must not be
borrowed here; that inequality is the safety mechanism. Both confirms render in the header band
(§2.1) with the menu closed.

`InlineConfirm` needs no prop changes.

---

## 7. What is removed or moved — the review list

| # | Change | Cost, honestly |
|---|---|---|
| 7.1 | **`Select places` moves out of the `⋯` menu** onto the heading row as `Select` | The label shortens; `Select places` disappears as a string. An editor who learned the menu path loses it. Bought: parity with the Places list, one fewer tap, zero vertical pixels |
| 7.2 | **`AddedByFilter` and `AddedByChip` are deleted**, replaced by `MenuAxis` + `AxisRows` | ~40 lines of JSX plus the `-mx-4` scroll strip go. The counts move from always-visible on each chip to visible inside the panel, and the current person's name shows on the closed trigger. Bought: ~52 px of header, the retired chip vocabulary gone, Escape/outside-press/focus-return for free |
| 7.3 | **The string `Show places added by` is deleted**; the group's accessible name becomes `Added by` | None. The axis name is the group name in every other filter on the product |
| 7.4 | **The bespoke menu container (`rounded-lg border bg-muted/40`, `MenuRow`) is deleted** in favour of the shared panel material | Requires either an extraction to `ui/inline-menu.tsx` or five exports from `library-filter-bar.tsx` (§2.1 build note). This is the largest piece of work in the spec and the reason the owner filed the request |
| 7.5 | **`Add places` demoted mint → `secondary`**, both call sites | The screen's principal action gets quieter. Bought: one mint create affordance on screen instead of two stacked |
| 7.6 | **`Leave collection` loses its red at rest** | A viewer's strongest action gets less alarming at rest. It still costs two steps and its confirm button is still red. Justified by the product's own reversibility rule; if the owner rejects it, revert this row alone — it is one boolean |
| 7.7 | **`⋯` is hidden while selecting** | Reaching `Share` mid-selection now costs a `Cancel` first. Bought: no undefined state |
| **Not changed** | The `Collections` up-link stays deleted; the `⋯`'s negative margins stay; the pinned footer stays; the meta line stays pressable; `added-by.ts` and `bulk-removal.ts` are untouched; no sort or extra filter axes are added to a collection | — |

**Independently buildable, in any order or in parallel:** (A) heading row + menu content trim
[7.1, 7.7], (B) added-by trigger swap [7.2, 7.3], (C) `Add places` variant [7.5], (D) leave/delete
tone [7.6]. Only (E) the menu material [7.4] touches shared files and should land alone.

---

## 8. Motion, focus and accessibility

- **Menu open / panel open:** the `enter` beat only — opacity + 4 px rise, 140 ms
  (`animate-in fade-in-0 motion-safe:slide-in-from-top-1 duration-enter`). No scale, no height
  animation. Under `prefers-reduced-motion` it collapses to the **opacity change alone**, not to
  nothing.
- **The `Added by` chevron** rotates 180° over `duration-cross`, driven by the open state, not by a
  `data-` attribute the inline surface does not carry. Under reduced motion it still *ends* rotated:
  the transition is dropped, never the state.
- **Press:** `PRESS_CHIP` on the pill triggers and the `⋯`, `PRESS_ROW` on the menu rows — the
  existing 90 ms beat, unchanged.
- **Nothing else animates.** No transition on the header's height when a panel opens or the footer
  swaps: layout thrash inside a scrolling sheet, for no information.
- **Focus:** Escape closes either menu and returns focus to its trigger (both surfaces — the inline
  panel needs the explicit `triggerRef.current?.focus()`, as `MenuAxis.close` already does).
  Choosing a row in `Added by` closes the panel and returns focus to the trigger, which now shows
  the pick. An outside press closes without moving focus. Tab order is heading → `Select` → `⋯` →
  (open panel, if any) → search → `Added by` → list.
- **Hit areas:** every control here is ≥44 px in its pressable box, painted smaller where the design
  calls for it (`⋯` 44 in 32 of layout; `Added by` 32 of paint in a 44 target).
- **`data-vaul-no-drag` on every control and every panel** inside the sheet, including the panel
  container — a press that begins on a menu is read as the start of a sheet drag otherwise.
- **Screen reader:** `⋯` is `aria-label="Collection options"` + `aria-expanded`; the menu is a real
  menu at `lg+` and a plain list of buttons in flow on the phone (no modal claim, no focus trap);
  `Added by` announces as `Added by, showing all` / `Added by, Maya` via `MenuAxis`'s existing
  composition, with `aria-pressed` reflecting `active`. Accept that composition rather than
  overriding it — one sentence shape across four axes beats one nicer sentence.

---

## 9. Every user-facing string

Checked against `voice-and-vocabulary.md` §3–§5. **Exactly one string is new.**

| String | Where | Status | Check |
|---|---|---|---|
| `Select` | heading row | existing (`ENTER_SELECTION_LABEL`) | Sentence case; states the act, not the outcome |
| `Collection options` | `⋯` accessible name | existing | `collection` is the ratified noun; no banned word |
| `Share` | menu row | existing | One word, one fact |
| `Edit` | menu row | existing | Bare, because only the destructive siblings carry the noun |
| `Delete collection` | menu row | existing | Carries the noun because it is destructive |
| `Leave collection` | menu row | existing | Same rule |
| `Delete “X”? Everyone loses it.` | confirm prompt | existing, verbatim | One clause + consequence; no apology, no brand |
| `Leave “X”? You can rejoin with the link.` | confirm prompt | existing, verbatim | `link`, never *URL* |
| `Delete` / `Leave` / `Cancel` | confirm buttons | existing | Verbs diverge from `Take out` at the first character |
| **`Added by`** | filter trigger + its group label | **NEW** | Sentence case; not *Saved by* (§1); not *contributor* or *member* — §3 bans *member* as a table word. Names the fact the column holds |
| `Everyone` | first row of `Added by` | existing | The "no narrowing" row, matching `All categories` / `All places` in shape |
| `You` / display name | `Added by` rows | existing (`memberLabel`) | Second person, always |
| `Added before we tracked this` | `Added by` row | existing (`NO_ADDER_LABEL`) | Describes the places, not an absent person; no machinery named |
| `Clear` | inline panel kicker | existing (`CLEAR_LABEL`) | The word, never an `×` |
| `Search this collection` | search field label | existing | Unchanged |
| `Add places` | footer + empty state | existing | `add`, never *import*; `places`, never *spots* |
| `Take out of this collection` / `Take out` | selection footer + confirm | existing, verbatim | Ruled in `ux-two-removals-one-screen.md` §3 |
| `Cancel` / `N selected` / `None selected` / `Select all` / `Clear` | selection toolbar | existing | Digits always; `Cancel` here and `Done` in the library, deliberately (§5) |
| `Nothing in this collection from them.` | empty result, filter-only | existing, verbatim | One clause, blameless, no apology |
| `Nothing in this collection matches that.` | empty result, search | existing, verbatim | Same |
| `15 places · Only you` / `You and Maya` | meta line | existing | Digits; `Only you` is a fact, not a nudge |

**Deleted strings:** `Select places` (7.1), `Show places added by` (7.3). No string on this screen
carries the product name — correct: none of these six surfaces is on §2's list.
