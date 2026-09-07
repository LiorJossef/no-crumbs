# Menus and dropdowns — the pattern

> **Spec, written 2026-09-02 by `ux-interaction` against `no-crumbs-implementation` at `bb6feee`.**
> `design-system-frontend` builds it. I have no shell: **nothing here was run, and no number below
> is a browser measurement I took.** Every value is either read out of the source at that commit
> (cited file:line), arithmetic on a token (shown), or marked **GUESS** with the reasoning that
> produced it.
>
> **Why this file exists.** On 2026-09-02 the library filter row burned a day, absorbed ten owner
> corrections and three build breaks, and shipped nothing. The diagnosis in
> [`archive/handoff-2026-09-02-ui-density.md`](archive/handoff-2026-09-02-ui-density.md) is not the builder: *this
> product has no menu or dropdown specification.* `facelift-plan.md` mentions a menu once, in a
> feature list; `no-crumbs-design-system.html` has no menu section. Every round invented a fresh
> answer with nothing to anchor it, and each was fairly rejected. **This is the anchor.**
>
> **Binding input:** [`archive/feedback-round-3-work-plan.md`](archive/feedback-round-3-work-plan.md) **§5.1** — ten
> owner rulings. Nothing in this document may re-litigate one of them. Where §5.1 rules, this file
> says **RULED** and cites it. Where I am choosing, it says **RECOMMENDED** in the sentence.
>
> **Dead:** `archive/ux-visit-filter-and-chip-density-2026-09-02.md` §5–§7 — Options A and B were both
> rejected in favour of a third shape. Its §2 measurements and its defect list D1–D4 survive and are
> quoted here; its recommendation does not.

---

## 0. What a menu is in this product, in one paragraph

A menu is **a short list you pick a value from**, floating on desktop and inline on a phone, opened
by a trigger that already states the value it holds. It is not a panel, not a dialog, not a second
control surface, and — the owner's own sentence, §5.1 — **not "another group of large buttons
inside it"**. A menu row has no fill, no border and no elevation at rest. The only things that ever
distinguish one row from another are an indicator, a weight, and — for a category — a coloured dot.

Everything below is one system. Four axes, one trigger family, one row, one popup, one hover.
`archive/ux-overwhelm-audit-2026-09-02.md` §6 is the reason: this product already draws **eight near-identical
pill vocabularies** for unrelated meanings, and *that* is the overwhelm. The answer is not a fifth
mechanism.

---

## 1. Inventory — what this spec covers

| Axis | Kind | Selection | Trigger word at rest | Closes on choose | Owner status |
|---|---|---|---|---|---|
| `Been` | radio menu | pick one of three | `Been ▾` | **yes** | RULED §5.1 |
| `Category` | radio menu | pick one, or `All categories` | `Category ▾` | **yes** | **internals UNDECIDED** — §5.1: *"for catagory im not sure yet"*. Ships as the zero-change option, built as a swappable sibling |
| `Tags` | searchable multi-select combobox | any number, composing as AND | `Tags ▾` | **no** | RULED §5.1 |
| `Sort` | radio menu | pick one of two or three | `Sort: Recently saved ▾` | **yes** | RULED §5.1 |
| `Clear` | plain button, not a menu | — | `Clear` | n/a | RULED §5.1 |

**Three separate triggers, not one `Filter`** — RULED (§5.1, owner: *"maybe we should have a dropdown
for each of the filters instead of having it in one place / cause they are not related"*). The single
collapsed `Filter` was measurably calmer than the sixteen pills it replaced and it also hid which
axes existed at all, and reaching the tags cost two taps.

**Not in scope, deliberately:** the account menu (shipped, `L1-F8-T1`), the profile popover, the
create menu (`＋`), and the two selection toolbars. They are dialogs and action menus, not value
pickers. When one of them is next touched, it should adopt §3's trigger and §4's row; nothing here
requires it to today.

---

## 2. The header is two rows, and they mean two different things

**RULED, §5.1** (owner: *"leave the sort below the filters"*). This is no longer a row-wrap
fallback; it is the chosen layout, and it states the separation the whole redesign is about.

```
row 1   [ Been ▾ ]  [ Category ▾ ]  [ Tags ▾ ]  [ Clear ]      ← narrows the library
row 2   [ Sort: Recently saved ▾ ]                             ← reorders it
```

| Rule | Value | Source |
|---|---|---|
| Row 1 wraps, never scrolls | `flex flex-wrap items-center gap-x-1.5` | RULED §5.1 (*"neither row may scroll horizontally"*); defect **D1** |
| Row 2 wraps, never scrolls | same | as above |
| No `gap-y` between wrapped lines | the 44 px targets each carry 6 px of transparent band, so a `gap-y` double-spaces the second line against a first that looks single-spaced | shipped `library-filter-bar.tsx:270` |
| Gap between row 1 and row 2 | the sheet column's existing gap; **no divider, no rule, no extra spacer** | RECOMMENDED — a border between two rows of a four-control header is card soup |
| `Clear` lives on **row 1** | it clears filters; it is never on the sort row | RULED §5.1 |

**Why not one row.** A container whose job is to hide overflow cannot hold controls whose whole job
is to be legible at rest. Three triggers + `Clear` + the sort control is ~310 px against ~358 px of
content width at 375 (`library-filter-bar.tsx:262-269`, arithmetic not measurement), so an active
value, a Hebrew category name or a three-digit count exceeds it. A second line is the honest cost of
not reintroducing D1.

**Delta against `bb6feee`:** the sort control is currently passed into `LibraryFilterBar`'s
`trailing` slot and rides **inside row 1** — `place-sheet.tsx:629-638`, `place-desktop-panel.tsx:234-243`,
and `place-desktop-panel.tsx:219-221` says so in a comment. That is the thing §5.1 reverses. `trailing`
should become a second `<div>` sibling rendered under the bar by both hosts, or a `belowRow` prop; the
bar's "render nothing when there is nothing to offer" gate (`:254`) has to keep accounting for it.

---

## 3. Trigger anatomy

### 3.1 The one rule this section exists for

**~32 px of PAINT inside a 44 px HIT AREA.** RULED, §5.1. The touch floor argued at
`category-filter-bar.tsx:16-23` is preserved by **decoupling paint from target**, not by shrinking
`min-h-11`. §5.1 also makes `document.elementFromPoint` verification **mandatory** for this change:
a class name says nothing about hit testing, and a static-markup test provably cannot
(`tests/unit/sheet/library-filter-bar.test.ts:1-15` states its own limits).

    44 px target  =  py-1.5 (6px)  +  h-8 paint (32px)  +  py-1.5 (6px)

### 3.2 Measurements

| Property | Value | Token / class | Note |
|---|---|---|---|
| Target height | 44 px | `min-h-11` on the `<button>` | the floor, unchanged |
| Target padding, block | 6 px each side | `py-1.5` | transparent hit area, not ink |
| Paint height | 32 px | `h-8` | |
| Paint radius | full pill | `rounded-full` | |
| Paint padding, inline | 10 px | `px-2.5` | |
| Internal gap | 6 px | `gap-1.5` | between dot, label, count, chevron |
| Label size | 12 px | `text-xs` | Tailwind's own, not a `--text-*` token |
| Label weight | **500** | `font-medium` | RULED §5.1: `font-bold` → `font-medium` |
| Active label weight | 600 | `font-semibold` | one step, not two |
| Count | 12 px, weight 400, `tabular-nums` | `shrink-0 tabular-nums font-normal` | end column, cannot jitter |
| Category dot | 8 px | `size-2 rounded-full` | |
| Chevron | 12 px, 70 % | `size-3 opacity-70`, Lucide `ChevronDown` | **not** `size-3.5`: at 12 px text a 14 px chevron is the largest object in the pill |
| Chevron open state | rotated 180° | `group-data-popup-open/trigger:rotate-180` | |
| Press | `scale-95` @ 90 ms | `PRESS_CHIP` (`src/lib/interaction.ts:160`) | the small-target tier |

**On the seven custom type sizes.** `--text-micro` (11 px), `--text-caption` (13 px),
`--text-reading`, `--text-display`, `--text-display-lg`, `--text-hero` and `--text-title` are **real
font-size tokens** (`globals.css:1033-1044`) and are registered with `tailwind-merge` in
`src/lib/utils.ts:32-48`. **Adding a `--text-*` token without adding its name to `PRODUCT_TEXT_SIZES`
makes the class silently vanish through `cn()`** — that defect shipped for as long as those tokens
existed and reached the owner as "the Been badge looks weird" at 16 px against the 11 px it asked
for. This spec uses only `text-xs`, which is Tailwind's own and unaffected.

*RECOMMENDED, not blocking:* menu **rows** could read at `text-caption` (13 px) while triggers stay
at 12 px — a row is read, a chip is scanned. I am not specifying it, because one size across trigger
and row is the "four controls, one system" argument and the smaller diff. If the rows read cramped in
a browser, 13 px is the sanctioned move and it needs no new token.

### 3.3 Fill, border and colour, per state

| State | Border | Fill | Ink | Weight |
|---|---|---|---|---|
| **Resting (filter)** | `border-border/70` hairline | `bg-card` | `text-foreground` | `font-medium` |
| **Active (filter)** | `border-transparent` | `bg-tag-selected` | `text-tag-selected-foreground` | `font-semibold` |
| **Resting (sort)** | `border-transparent` | none — ghost | `text-foreground` | `font-medium` |
| **Sort has no active state** | — | — | — | there is always an order; see §8 |
| **Disabled** | never used here | — | — | an axis that cannot change the result is **absent**, not disabled — §9.3 |

**The resting fill is not mint.** RULED, §5.1. A header control used to be four heavy signals at
once — 44 px tall, `px-3`, `font-bold`, filled with house mint. The accent is spent **only** on the
active state.

**The active category trigger carries that category's own colour**, through the token, never a hex:

```
style={{ '--tag-selected': categoryColorVar(category),
         '--tag-selected-foreground': 'var(--on-category)' }}
```

`facelift-plan.md:81` and `:144` make category colour load-bearing across pins, chips and counts,
and `:144` specifically locks *"fills with **that category's** colour, not house mint"*. An inline
hex themes nothing — that is how a rebuilt dark palette left every disc and dot light. Pinned by
`library-filter-bar.test.ts:145-160`.

**This is why a native `<select>` is forbidden**, and it is not a style preference: a native select
cannot paint an option in a data-driven colour on iOS or Android, so choosing one deletes the one
visual thread tying a chip to its pin. A native select was already tried and produced three further
defects the owner caught immediately — `appearance-none` does not stop the platform's own focus
chrome, it opens the **operating system's** menu rather than the app's, and `h-8` on the select made
it the smallest touch target in the product at a flat 32 px (`place-sheet.tsx:808-820`).

### 3.4 How a trigger displays its current value

**Every trigger states its own value without being pressed.** This is defect **D2**'s fix — the old
visit chip had two visual states for three meanings.

| Axis | Nothing chosen | One thing chosen | Several chosen |
|---|---|---|---|
| `Been` | `Been ▾` | `Not been yet ▾` (active) | n/a |
| `Category` | `Category ▾` | ● `Café` `4` ▾ (active, filled that colour) | n/a |
| `Tags` | `Tags ▾` | `Wine ▾` (active) | `Tags 3 ▾` (active) |
| `Sort` | n/a — always has a value | `Sort: Recently saved ▾` | n/a |

Rules that fall out of that table:

- **The axis word is replaced by the value**, not appended. `Been: Not been yet` is two words of
  chrome for one fact, in the band we are emptying.
- **Except `Sort`**, which prints its axis permanently — `Sort: ` in `text-muted-foreground`,
  `aria-hidden` (the button's own name carries it). See §8 for why.
- **One tag names itself; several are counted.** Three tag names is the whole row back again.
- **The count** appears on `Category` (the facet count) and on `Tags` (how many are chosen). It never
  appears on an inactive trigger: `archive/ux-overwhelm-audit-2026-09-02.md` §1b — *"the unpressed ones answer
  a question nobody asked yet."*
- **`All places` never appears on a trigger.** `voice-and-vocabulary.md:60`: a filter button labelled
  `All` names the absence of itself. It is a row inside the menu and nowhere else.

### 3.5 Accessible names — exact strings

Ratified by `voice-and-vocabulary.md` §3 and pinned by `library-filter-bar.test.ts`. Do not
paraphrase.

| Situation | `aria-label` |
|---|---|
| Filter axis, nothing chosen | `Been, showing all` · `Category, showing all` · `Tags, showing all` |
| Filter axis, chosen | `Been, Not been yet` · `Category, Café` · `Tags, Wine` · `Tags, Wine, Late Night` |
| Sort | `Sort by, Recently saved` — the *visible* word is `Sort`, the spoken one is `Sort by`, and the visible is contained in the spoken, which is what label-in-name asks for. `Sort` alone before a value announces as a command |
| `Clear` | `Clear all filters` |
| Tag chip remove | `Remove the Wine tag filter` |
| Tag axis's own clear | `Clear the tag filter` |

`aria-pressed` on the three **filter** triggers (they are a state as well as a disclosure);
**never** on `Sort`, which has no "off" — a pressed bit there announces something it does not have.
`aria-expanded` and `aria-controls` on all four. `aria-expanded` + `aria-pressed` on one button is
legal and is the honest description. If a screen reader reads that pair confusingly, drop
`aria-pressed` and keep the state in the accessible name; **never** drop `aria-expanded`.

### 3.6 Two things every trigger and every menu surface must carry

- **`data-vaul-no-drag`** on the trigger, the popup, the inline panel, every row and the search
  field. Inside the mobile sheet a press that begins on one of these is otherwise read as the start
  of a sheet drag and the tap is swallowed.
- **`useId()`-derived ids** for `aria-controls`. Both hosts (§7) are mounted in the DOM
  simultaneously — one is CSS-hidden — so a hard-coded id is a duplicate-id bug in every render.

---

## 4. Row anatomy

**RULED, §5.1:** *"I don't like the interaction pattern of opening a dropdown and then showing
another group of large buttons inside it."* Collapsing three rows of 44 px pills behind a trigger and
then revealing 44 px pills moves the wall rather than removing it.

### 4.1 The row

**~40 px of paint inside a 44 px target** — the same technique the triggers use.

| Property | Value | Class |
|---|---|---|
| Target height | 44 px | `min-h-11` on the `Menu.RadioItem` / `Combobox.Item` |
| Paint height | 40 px | `h-10` on the inner `<span>` |
| Paint width | full | `w-full` — the highlight is a full-width ground, never a pill |
| Paint radius | **12 px** | `rounded-sm` — see §4.4 |
| Paint padding, inline | 8 px | `px-2` |
| Internal gap | 8 px | `gap-2` |
| Label | 12 px, `font-medium`, `truncate`, `text-start`, `dir="auto"` | |
| Selected label | `font-bold` | one channel; the indicator is the other |
| Count | `text-muted-foreground`, `tabular-nums`, `font-normal`, `ps-3`, end-aligned | |
| Fill / border / shadow at rest | **none, on every row, in every state except the highlight** | |

### 4.2 The indicator column

| | |
|---|---|
| Glyph | Lucide `Check`, `size-3.5` (14 px), `text-brand` |
| Column | always present — `keepMounted` with `data-[unchecked]:invisible` |
| Why keep it mounted | so the label sits at the **same inline offset in every row of every menu**. A column that appears and disappears makes the list twitch as you arrow through it |

**The Tags ruling, and exactly how it is satisfied.** §5.1: *"the checkmark on tags should be added
only when they are checked."* **No empty checkbox on any row.** An unchecked tag row is its name and
its count and nothing else.

`keepMounted` + `invisible` **satisfies that ruling** — this is my reading and I am flagging it as
mine. `visibility: hidden` paints nothing at all; what the owner rejected is a *drawn* empty box on
every row, which is a different thing from 14 px of reserved space. Reserving the space is what stops
the whole list shifting sideways the moment you check something. If the owner reads reserved space as
the same defect, the fallback is `keepMounted` off and the label indented by the same 14 px + 8 px
via `ps-`, which costs nothing and looks identical; do not simply drop the column and let the rows
move.

**The affordance the check removes is carried by `Combobox.Chips` above the list, and the two ship
together** — RULED, §5.1. An empty box says "these are multi-select"; the chips say "and here is
what you have already taken". If the chips are not there, the affordance is genuinely lost. **Do not
ship the Tags list without the chip row.**

### 4.3 The category dot

**RULED, §5.1:** *"The category colour survives as a **dot**, not as a filled pill."* 8 px,
`rounded-full`, painted from `categoryColorVar(category)` — a token reference, never a hex.

- In a **row**, the dot is that category's own colour on a neutral ground.
- On the **active trigger**, the dot is `bg-current`: a dot in the fill's own colour is an invisible
  dot.

### 4.4 The popup surface

| Property | Value | Note |
|---|---|---|
| Ground | `bg-popover` | RECOMMENDED change: shipped is `bg-card`. Both resolve to `#FFFFFF` / `#201F1C` today, but `--popover` is the role that exists for exactly this and it is what lets a future menu ground move without moving every card |
| Border | `border border-border/60` hairline | over a live map canvas the border does more work than the shadow |
| Shadow | `shadow-raised` = `0 1px 2px -1px rgba(0,0,0,.10), 0 2px 6px -4px rgba(0,0,0,.12)` (`globals.css:927`) | **no glow, no glassmorphism, no `backdrop-blur`** — `backdrop-blur` is banned over the live canvas (`facelift-plan.md`) and Charter §6 bans the rest |
| Radius | **16 px**, `rounded-lg` | RECOMMENDED change: shipped is `rounded-xl` = 24 px (`--radius-xl: 1.5rem`, `globals.css:968`), which around 40 px rows reads as a bubble rather than a list |
| Padding | 4 px, `p-1` | a chunk of vertical padding around three rows is half of what "goofy" meant |
| Width | `w-max min-w-40` (160 px), `max-w-[calc(100vw-2rem)]` | **the width is the content's**, not the row's and not the panel's. A two-row menu stretched to a 500 px panel reads as a dialog that lost its content |
| Tags popup width | `w-64` (256 px) | it holds a search field and chips; content width would jump on every keystroke |
| Max height | `max-h-[min(20rem,var(--available-height))]` = 320 px or what the viewport leaves | |
| Scroll | exactly one scroll container, on the popup itself, `overscroll-contain` | nothing inside a popup carries its own `overflow-y`: two stacked tracks on a phone means the user cannot tell which one their thumb will grab |

**The radius arithmetic, since it is the only reason to change it.** Concentric radii: an inner
corner should be the outer radius minus the padding between them. `16 − 4 = 12`, and `--radius-sm` is
`0.75rem` = 12 px (`globals.css:965`). So popup `rounded-lg` (16) + `p-1` (4) + row `rounded-sm` (12)
nest exactly. Shipped is 24 and 16, which do not (`24 − 4 = 20 ≠ 16`) and read as a rounder box
around squarer rows. **GUESS** on whether anyone will notice the difference; the arithmetic is not a
guess and it is free.

---

## 5. Hover, with measured values

**The rule: hover paints a SURFACE. It never changes the text colour.** RULED in effect by §5.1's
sort finding — `hover:text-brand`, a *link* hover on something that is not a link, is what the owner
read as *"not noticeable"*: the label flicked to mint and nothing else moved.

### 5.1 The table

| Element | Hover | Evidence |
|---|---|---|
| **Resting filter trigger** (bordered pill) | `border-brand` + `bg-primary/5` | **MEASURED elsewhere and reused.** `button.tsx`'s outline variant records it and `tests/unit/ui/press-feedback.test.ts:69-80` pins it: `--primary` is `--mint-400` `#A8ECE2`, and a 1 px band of it on a `#FAF9F6` surface is invisible at panel width, so the border warms to `--brand` (`--mint-700` `#2E7A70`) while the wash stays at 5 %. A grey surface shift at this size is the thing the owner could not see |
| **Sort trigger** (ghost) | `border-brand` + `bg-primary/15` | The wash at 15 % rather than 5 % because the bordered pill spends half its signal on the edge and this one has only the ground |
| **Active filter trigger** | `ring-2 ring-tag-selected/45`, border stays transparent, fill unchanged | **The active trigger had no hover at all**, which is the case the brief calls out. Owner, 2026-09-02: *"hover problem after you select catagory and wants to change it"* — the resting hover warms a border and washes a ground, and neither is visible on a pill already filled with a category colour, so going back to change your choice got no feedback. A ring in the pill's **own** colour, offset outward, is the one signal that works on any fill — four category colours, both themes — without inventing a colour per category. `library-filter-bar.tsx:122-131` records a live-page reading of `rgb(108, 67, 11)` at rest gaining a 2 px halo of the same brown at 45 % |
| **`Clear`** | `text-foreground` + `underline` | The one deliberate exception, and it is not a hover-tint: `Clear` is a text button with no ground to paint, so an underline is the affordance. It is styled as a link because it behaves like one |
| **Menu row (hover AND keyboard-highlighted)** | **`bg-card-2`** | See §5.2 — this is a change, and it fixes a defect |
| **Tag chip's remove `×`** | `opacity-70 → 100` | small glyph inside a filled chip; a ground change inside a ground is noise |

Everything above rides `motion-safe:transition-colors motion-safe:duration-press` (90 ms,
`ease-standard`) — the `TINT_BEAT` / press tier in `src/lib/interaction.ts:28-29`.

**Nothing in the hover column is reachable below `lg`.** Tailwind wraps every `hover:` in
`@media (hover: hover)`, so a phone screenshot proves nothing about any of it, either way. Verify
hover at 1440×900 only.

### 5.2 The row highlight is currently invisible, and here is the arithmetic

Shipped `library-filter-bar.tsx:180-182` uses `group-data-highlighted/row:bg-muted/60` on a popup
painted `bg-card`. Compute the composite:

| Theme | `--muted` | popup ground | 60 % composite | Δ from ground |
|---|---|---|---|---|
| Light | `#FAF9F6` (`globals.css:222`) | `--card` `#FFFFFF` | `#FCFBFA` | **≈1 % — effectively invisible** |
| Dark | `#201F1C` (`globals.css:1113`) | `--card` `#201F1C` | `#201F1C` | **0 — identical. There is no highlight at all in dark mode** |

Base UI's `data-highlighted` is both the pointer hover *and* the keyboard-active row, so in dark mode
a keyboard user currently arrows through a menu with **no visible position**. That is an
accessibility defect, not a polish item.

**The fix is the product's own documented answer:** `facelift-plan.md` §3a's state matrix, row "Icon
button", says a neutral hover is *"surface → `card-2`"*. `--card-2` is `#F3F1EB` light
(`globals.css:322`) and `#2A2825` dark (`:1138`) — a real step on both, against `--card` `#FFFFFF` /
`#201F1C`.

**And it keeps the count legible**, which is the reason not to reach for a darker grey. `globals.css:235-240`
carries a measured contrast table: `--muted-foreground` `#6E6A64` scores **4.76** on `--card-2`
`#F3F1EB` (passes AA), and `:256-257` records dark's `#A8A29A` at **5.81** on `--card-2`. So the row's
count survives the hover on both themes, measured, without a second ink.

**Do not use `bg-accent`** for this. `--accent` is `--mint-100` `#F1FBF9` in light — about a 2 % step
on white — and `#222A28` in dark, about a 1 % step on `#201F1C`. It is the same defect wearing mint.
(shadcn's stock `combobox.tsx:143` ships `data-highlighted:bg-accent`; that is upstream's token, not
ours, and it is why the primitive's own default must be overridden here.)

**No hover on a row's ink, ever.** The selected row already carries `font-bold` and a check; adding a
colour change on hover gives the list two competing "this one" signals.

---

## 6. Open, close, focus and the keyboard

### 6.1 Open and close

| Axis | Opens on | Closes on |
|---|---|---|
| `Been` · `Category` · `Sort` | trigger press, `Enter`, `Space`, `↓` | **choosing a row**, pressing the trigger again, `Escape`, an outside press |
| `Tags` | same | **not** on choosing a row — `Clear`, `Escape`, the trigger, or an outside press |

**Single-select menus close on choose and return focus to their trigger, which has just changed to
show the pick** — RULED, §5.1 (*"maybe we should do that for one option select it will close the
menu"*). **`Tags` does not close**, because closing after each tag makes choosing three tags cost
three round trips.

Note from the handoff: *"Menus not closing on select. The owner checked and said they do not close.
That behaviour was never built."* It is not a regression to hunt — it is unbuilt work, and this is
its spec.

**Only one menu may be open at a time.** On desktop this falls out of outside-press, including a
press on another axis's trigger. On mobile (§7) the host holds `openAxis: Axis | null` and rendering
a second panel closes the first; two inline panels open at once would push the list off the screen.

### 6.2 Focus

| Event | Where focus lands |
|---|---|
| Open by pointer, desktop | The library's default for the control — the radio menus put focus into the popup on the checked row; the Tags combobox puts it in the search field |
| Open by pointer, **mobile inline** | **Stays on the trigger.** RECOMMENDED, and it is the mobile keyboard rule in §7.4 — auto-focusing the Tags field raises the virtual keyboard over the list the panel just pushed down |
| Choose, single-select | Menu closes, focus **returns to the trigger** |
| Choose, Tags | Panel stays open, focus stays where it was (the field, or the row) |
| `Escape`, anywhere inside or on the trigger | Closes, focus **returns to the trigger** |
| Outside press | Closes, focus returns to the trigger |
| `Tab` past the last row, desktop popover | The library's default (the popup is dismissed and focus continues in the document) |
| `Tab` past the last row, **mobile inline** | Focus leaves the panel normally and **the panel stays open.** It is inline content, not a modal, and it makes no modal claim |

**Focus trap: desktop popover yes (the library's own), mobile inline no.** Explicitly:

- The desktop popup is portalled and focus-managed by Base UI. Do not hand-roll a trap; do not
  disable the library's.
- The mobile inline panel is **not** a modal, has **no** scrim, and traps nothing. Escape still
  closes it, and the trigger is still the way back.
- `archive/product-review-2026-09-01-r5.md` G1 found the profile popover shipped **without** a focus trap and
  without Escape returning focus. Do not commit that defect on a second surface: **Escape and focus
  return are not optional on either host.**

### 6.3 What a keyboard user actually does

Single-select: `Tab` to trigger → `Enter` / `Space` / `↓` opens → `↑` `↓` move the highlight,
`Home` / `End` jump, typeahead matches a row by its first letters → `Enter` selects, the menu closes,
focus is back on the trigger, and **the trigger now reads the value that was chosen** → `Tab` moves on.

Tags: `Tab` to trigger → `Enter` opens → focus is in the field (desktop) → type to narrow → `↓` into
the list → `Enter` toggles a tag, the panel stays open, a chip appears above the list, the query
clears → repeat, or `Escape` to close and return to the trigger. The chips are reachable by `Tab`
and each remove has its own name.

**All of that is the primitive's, not ours.** Base UI's `Menu.RadioGroup` / `RadioItem` and
`Combobox` provide arrow keys, typeahead, `Home`/`End`, group membership, "2 of 3, selected",
Escape, outside press, focus return and anchoring. The standing ruling is to reuse what is installed
(`p002-lean-mvp-no-custom-infrastructure`). **Nothing in this document authorises a roving tabindex,
a hand-rolled `role="menu"`, or a bespoke outside-click listener.**

### 6.4 Focus ring

`group-focus-visible/trigger:ring-3 group-focus-visible/trigger:ring-ring/50` on the paint, driven
from the target. `--ring` is `--mint-700` in light and `--mint-400` in dark. Same ring on every
control in the header, on the chips and on the chip removes. The ring must be visible on the **active
trigger too** — it sits on a filled pill, so verify it against all four category colours at 1440×900.

---

## 7. The mobile / desktop split

**RULED, §5.1** (owner: *"i think that on mobile the pop up doesnt feel good"*):

> **Mobile = inline disclosure beneath the trigger row, pushing the list down. Desktop = anchored
> popover.** A deliberate breakpoint split.

The reasoning, recorded so nobody re-argues it: a floating layer inside a vaul drawer is a popup
inside a popup, it competes with the sheet's drag listener, and it strands a narrow menu mid-screen.

### 7.1 The breakpoint, and why it needs no media query

**`lg` = 1024 px** (Tailwind's default `64rem`). Below it the sheet; at and above it the panel.

**Do not branch on `matchMedia` at render time.** The two hosts are already separate components
behind CSS gates:

| Host | File | Gate |
|---|---|---|
| Mobile sheet | `place-sheet.tsx` `PlaceList`, inside vaul `Drawer.Content` | `lg:hidden` — `map-shell.tsx:481` |
| Desktop panel | `place-desktop-panel.tsx` | `hidden lg:block` — `map-shell.tsx:549` |

So the split is **a prop the host passes**, e.g. `surface: 'inline' | 'popover'`, constant per host,
identical on server and client. `add-sheet.tsx:276-281` records what the alternative costs: a
render-time read of `matchMedia` returns `false` on the server, so the two renders emit different
markup and React logs a hydration mismatch — that exact defect shipped on `/sign-in`. **This split
must not reintroduce it.**

### 7.2 What happens to the list underneath, on mobile

**It is pushed down. Nothing floats over it, and nothing scrolls on its own behalf.**

| Rule | Value |
|---|---|
| Where the panel is inserted | Immediately after **the row that holds the pressed trigger** — under row 1 for `Been`/`Category`/`Tags`, under row 2 for `Sort`. Not after the whole header |
| Width | Full content width of the header column |
| Position | Normal flow, inside the sheet's own column. **No portal, no scrim, no fixed positioning** |
| Height cap | `max-h-[45vh] overflow-y-auto overscroll-contain` — **GUESS**, chosen so the panel can never take more than the sheet's upper half and there is always list visible beneath it. Re-measure at 390×844; if the first list row is not visible with the tag panel open, lower it |
| The list | Moves down by exactly the panel's height. It does **not** get its own scroll position changed by the open |
| Scrolling into view | If the panel's bottom edge falls below the sheet's viewport, `scrollIntoView({ block: 'nearest' })` on the panel **after** the enter transition — the minimum correction, never a scroll to top |
| Height animation | **None.** The panel appears at its final height and fades in. Animating height inside a scrolling sheet is layout thrash for no information, and `facelift-plan.md` §3a bans it by implication with the paint-only rule |
| Drag | `data-vaul-no-drag` on the panel and everything in it |

**The failure this shape has already produced once, and how to avoid repeating it.** An earlier
inline version rendered the panel after the *whole row*: pressing `Category` at x97 made options
appear at x30, 90 px lower, under two unrelated controls — the owner's *"something just off about
it"*, recorded at `library-filter-bar.tsx:40-44`. Inline is still right on mobile (it is RULED), so
the panel must say where it came from by other means:

1. **The panel is inserted under its own row**, not under the header.
2. **The open trigger stays visibly open** — chevron rotated, and (RECOMMENDED) `bg-card-2` on the
   resting pill while its panel is open, so the origin is painted, not inferred.
3. **The panel's first line is the axis kicker** — the axis word at 11 px, uppercase, tracked
   (`FILTER_KICKER`, already exported), on the inline-start edge, with the axis's own `Clear` on the
   inline-end edge when that axis is active.
4. **The panel wears the popup's surface** — same border, same radius, same padding as §4.4 — so it
   reads as the same object the desktop floats.

### 7.3 Desktop

Anchored popover: `Portal` → `Positioner` with `side="bottom"`, `align="start"`, `sideOffset={6}`,
anchored to **its own trigger**. Flip near the bottom edge and shift near the inline-end edge come
from the positioner; none of it is hand-rolled. Nothing below the row moves when a menu opens.

The portal is what makes correct anchoring possible and it was the open risk. `add-sheet.tsx:21`
records that vaul drawers do not nest cleanly — but **a menu is not a drawer**, and a portalled popup
lives outside the drawer's DOM entirely, so the drawer cannot read a press inside it as a drag. That
is why the desktop half is safe and why the mobile half is still inline anyway: the ruling is about
how it *feels* on a phone, not only about the gesture conflict.

### 7.4 Mobile keyboard behaviour, for `Tags`

- **Do not autofocus the search field when the panel opens on mobile.** RECOMMENDED. The virtual
  keyboard would cover the list the panel just pushed down, and on iOS it also shrinks the visual
  viewport under a sheet whose height is already `100dvh`-derived. The field is one tap away and the
  first tag rows are readable without typing.
- Desktop keeps the library's input-inside-popup default and focuses the field.
- `inputMode="search"`, `enterKeyHint="done"`, `autoCapitalize="none"`, `autoCorrect="off"`,
  `spellCheck={false}` on the field — RECOMMENDED; tags are lowercase normalised strings and half
  this library is Hebrew, so autocorrect is actively wrong here.
- The panel's `max-h` is in `vh`. **Use `dvh`** for anything that must survive the iOS URL bar —
  RECOMMENDED, and the sheet already reasons in `100dvh` (`map-shell.tsx:481`).
- Safe areas: the panel is inside the sheet's column and inherits the sheet's bottom padding
  contract. It must not add its own `env(safe-area-inset-bottom)` — the sheet already carries it,
  and the peek row's missing inset (`archive/feedback-round-3-work-plan.md` §5.2) is what double-counting
  looks like from the other side.

---

## 8. Sort — the case that looked binary and was not

**Read this section before writing any control that offers a set of options read off a running
screen.**

### 8.1 What happened

The orchestrator specified sort as a **two-state toggle**, having looked at the running app and seen
two options. `place-order.ts:31` defines **three** — `recent | nearest | alpha` — and
`availableOrders(hasFix)` (`:63-65`) removes `nearest` when no location fix is held. The app was
showing a **degraded state**, and the screen was read instead of the code.

Owner, §5.1: *"Sort is not binary — there is also a Nearest option"*, then *"its ok as a select list
/ just should feel less goofy thats it."*

**The lesson, stated so it generalises: a running screen shows one state of a control. The set of
states lives in the code.** `place-order.ts:60-62` even says it out loud — *"two orders always work,
three work when located. Finding two options with location off is correct behaviour, not a missing
feature."* Anyone specifying a control here reads the module that defines its domain first.

### 8.2 What sort is

| Property | Value | Why |
|---|---|---|
| Shape | a menu — the **same** `MenuAxis` component, `tone="sort"` | RULED §5.1 |
| **Not** chip-shaped | ghost: no border, no fill at rest | RULED §5.1. It was byte-identical to a category chip with one chip always pressed, against the written rule at `category-filter-bar.tsx:37-44` that a pressed chip means *this is narrowing your library*. Sort always has a current value, so a chip-shaped sort permanently claims a narrowing that is not happening |
| Names its axis, visibly | `Sort: Recently saved ▾` | RULED §5.1. It **named no axis** — `A–Z` reads as a filter for names starting with A as easily as it reads as an ordering |
| Row 2, alone | see §2 | RULED §5.1 |
| Never touched by `Clear` | see §9.1 | RULED §5.1 |
| `Nearest` when there is no fix | **absent, not disabled, not greyed** | `place-order.ts:52-62`. A greyed-out `Nearest` is a promise the screen cannot keep and invites the question the product has no answer to: nearest to what? |
| Below 8 places | the whole control is absent | `SORT_MIN_PLACES = 8`, `place-sheet.tsx:874-877`. Sorting five rows you can see at once costs a permanent 44 px to answer a question nobody has |
| Below 2 orders | absent | one option is not a choice |
| Option strings | `archive/overnight-copy-deck.md` §4.2 via `SORT_OPTION_LABEL`. Do not write them inline | |

### 8.3 The state that has no name

Sort has **no cleared state and no "off"**. There is always an order. Consequences, all of them
RULED or falling directly out of §5.1:

- No `aria-pressed`.
- No active fill — the ghost is its only resting appearance.
- `Clear` does not reset it: *"clearing"* an order would silently mean "go back to `Recently saved`",
  which is a change disguised as an undo.
- The **effective** order with nothing chosen and a fix held is `nearest`, not `recent`
  (`place-order.ts:78-82`). The trigger must show the **effective** order, not the stored choice, or
  a located user reads `Sort: Recently saved` over a list sorted by distance. This is the exact
  degraded-state trap again, from the other direction.

---

## 9. `Clear`, and the gates

### 9.1 `Clear`

**RULED, §5.1** (*"i think the clear should affect filters only"*).

| Rule | |
|---|---|
| Renders | **only when at least one filter is active.** A permanently visible `Clear` is a dead control eating the width this row exists to save |
| Lives | on row 1, after `Tags` |
| Resets | `Been` → `all`, `Category` → none, `Tags` → empty |
| Does not touch | the sort order. Ever |
| Shape | a text button at the 44 px floor with a 32 px paint band — `text-muted-foreground`, no border, no fill. Hover: `text-foreground` + `underline` |
| Word | **`Clear`**, never an `x` | 
| Accessible name | `Clear all filters` |

**`Clear` is a word, not an `x` — this is defect D3's fix.** The `x` on the old pressed visit chip
was `aria-hidden` decoration carrying a dismissal glyph's affordance with **no dismissal control
behind it**: a screen reader heard nothing, and a sighted user read "close this" where the meaning
was "clear this filter". `category-filter-bar.tsx:26-30` argued *against* a second target — *"two
controls for one boolean"* — and then shipped the `x` anyway, paying the second target's visual cost
and getting none of its clarity.

Each axis also has **its own** clear where the axis needs one: `All categories` is a row inside
`Category`; `Combobox.Clear` inside `Tags` **is** that axis's clear and there is no second clear
button beside it; `Been` clears by choosing `All places`.

### 9.2 Where a filtered-to-nothing state is undone

The filter row is **above the list and above the empty state**, so the control that undoes a filter
is on screen in the state where the filter has left nothing to look at. `place-sheet.tsx:615-616`
already holds this rule; it is load-bearing for every empty state in §10.

### 9.3 Absent, never disabled

An axis that cannot change the result is **not rendered**. Uniform across the header:

| Axis | Gate |
|---|---|
| `Been` | `anyVisited || visitFilter !== 'all'`. Nothing marked been ⇒ two of the three states return the same rows. The second clause matters: marking your last outstanding place as been would otherwise delete the control that undoes the filter now hiding your library |
| `Category` | `facets.length > 1`. Every place a restaurant ⇒ `Restaurant 12` selected and unselected show the same twelve places |
| `Tags` | `tagFacets.length > 0 \|\| activeTags.length > 0` |
| `Sort` | `orders.length >= 2 && listLength >= 8` |
| The whole bar | nothing to offer on any axis and no sort ⇒ **render `null`**, not an empty row. An empty flex row is invisible but not free: it is a `gap` child in the sheet's column, so it opens a hole under the search field |

This is the same rule `Nearest` follows and the same one `import-error-copy.ts` states as *"a
recovery only ever points somewhere that works."* **There is no disabled state anywhere in this
spec.**

---

## 10. Every state, named

### 10.1 Loading

**No menu in this spec can open before its options are known.** All four axes are derived
client-side from the library already in memory — `categoryFacets`, `tagFacets`, `VISIT_FILTERS`,
`availableOrders`. There is no fetch behind any of them, and the header itself is not rendered while
the library is empty.

**So do not build a menu skeleton for this surface.** If one is ever needed:

| Situation | What it shows |
|---|---|
| Options not yet known | **The trigger is not rendered** — §9.3's rule, unchanged. This is the answer in almost every case |
| Options genuinely arriving while the menu is open | Three inert rows at the row's own height, no text, `aria-busy="true"` on the list, `bg-card-2` at rest. **Never a spinner in a menu** — a spinner inside a 160 px popup is a loading screen in a control |

**This is deliberately not the product-wide loading pattern.** The owner asked for loaders on
2026-09-02 and immediately said *"not now"*; the handoff records that the first task is a survey of
which transitions fetch, not a skeleton on one screen. That is a **separate document**. Nothing here
should be read as having decided it.

### 10.2 Empty

| Where | String | Source |
|---|---|---|
| Tag search matches nothing | `No tags match.` | `library-filter-bar.tsx:197`. One clause, no apology |
| `Been there` selected, no been places | `No places you have been to yet.` | `NO_BEEN_PLACES_LINE`, `visit-state.ts:106` |
| Any filter empties the list | the existing all-filtered state, with the filter row above it | `place-sheet.tsx:654-661` |
| An axis with nothing to offer | the axis is absent | §9.3 |

No menu ever renders an empty list body. If an axis has no options it is not on screen.

### 10.3 Partial success

The only partial state here: **a tag is active but has dropped out of the facets** because another
filter narrowed it away. `tagFacets` pins active tags in regardless of rank (`tag-filter.ts:190-194`)
and never at a count of 0. The trigger keeps naming it, the chip keeps showing it, and `Clear` keeps
removing it. **A control that disappears when you use it is the defect this whole file refuses.**

### 10.4 Failure

There is no network call behind any menu here, so there is no failure state to design. If a menu is
ever wired to something that can fail, the recovery is `voice-and-vocabulary.md` §4's rule — no
"oops", no "something went wrong" — and it belongs in the same separate document as §10.1.

### 10.5 Recovery, in one line per axis

`Been` → choose `All places`. `Category` → choose `All categories`. `Tags` → a chip's `×`, the
axis's own `Clear`, or the row again. Everything → `Clear` on row 1. **Every one of those is a single
tap from a control that is on screen while the filter is applied.**

---

## 11. Motion

Five durations exist for this surface and none of them is new. Read `src/lib/interaction.ts:26-34`
for the closed table.

| Moment | Duration | Easing | What it communicates |
|---|---|---|---|
| Press on a trigger or a row | `duration-press` 90 ms, `scale-95` (`PRESS_CHIP`) | `ease-standard` | the finger landed |
| Popup / inline panel **enter** | `duration-cross` 200 ms (`ENTER_POPOVER` / `ENTER_REVEAL`) | `ease-standard` | opacity 0→1, plus a 4 px rise from the trigger's edge — **origin**: this came from the thing you pressed |
| Popup / inline panel **exit** | `duration-cross` 200 ms | `ease-exit` | **opacity only, no transform** |
| Chevron rotation | `duration-cross` 200 ms | `ease-standard` | open / closed |
| Hover and active-state tint | `duration-press` 90 ms | `ease-standard` | a colour changing under a pointer |

**Banned on this surface, and each has a reason:**

- **No scale / zoom on the popup.** An overshoot on a menu is the single most "goofy"-reading thing
  available, and "goofy" is the owner's word for what is being fixed. (The stock
  `combobox.tsx:113` ships `zoom-in-95`; override it.)
- **No height animation, anywhere, ever.** Layout thrash inside a scrolling sheet for no information.
- **No sliding indicator** between rows. A travelling pill whose only content is "you pressed the
  thing you just pressed".
- **No glow, no blur, no gradient.** Charter §6, and `backdrop-blur` is banned over the live canvas.

### 11.1 `prefers-reduced-motion` — the complete equivalent

`facelift-plan.md` §3a's rule governs: under reduced motion the animations collapse **to the opacity
change alone, not to nothing**, because the thing that just changed still has to be findable.

| Animation | Reduced-motion form |
|---|---|
| Popup / panel enter | fade at 200 ms. **The 4 px rise is dropped** (`motion-safe:` only) |
| Popup / panel exit | fade — unchanged, it was already opacity only |
| Chevron rotation | **the chevron still ends rotated**; only the transition is dropped. State must survive; it is the open indicator |
| Press `scale-95` | dropped — `PRESS_CHIP` is already `motion-safe:` |
| Hover tint | **kept.** A colour change is not motion, and it is the only thing telling a pointer user where they are |
| Row highlight | **kept**, same reason, and in dark mode it is the keyboard user's only position indicator |

Practically: every transform in this spec is `motion-safe:`-prefixed; no opacity change is. There is
**no state in this spec that is communicated by motion alone.**

---

## 12. RTL, and the strings

Half this library is Hebrew, and it is the scope
(`p002-hebrew-english-is-the-language-scope`).

- **Logical properties only** — `ps-` / `pe-` / `ms-` / `me-` / `start-` / `end-`. No `left`, no
  `right`, no `pl-`, no `pr-`. The indicator column, the count column, the kicker and the axis clear
  all swap edges.
- **`dir="auto"` wraps the untrusted string and nothing else** — the tag label, the category label,
  a place name. Never the control's own box: `dir` on the chip would flip the remove button relative
  to its own label.
- Positioner `align="start"` and `side="bottom"` are already logical in Base UI; the anchoring flips
  with the document direction for free.
- Every string on screen comes from a named constant, not from JSX. `voice-and-vocabulary.md` is
  binding: **`Been there` / `Not been yet` / `All places`** are the visit options (`visit-state.ts:36,
  39, 88`) and **the axis is `Been`** — the axis and one of its answers may not be the same word.
  `Clear`, `Search tags`, `No tags match.`, `All categories`, `Sort` and `Sort by` are the only other
  strings this surface introduces, and all six are already constants in
  `library-filter-bar.tsx:186-200` and `place-sheet.tsx`.

---

## 13. The `Select` control — a recommendation, not a ruling

**Status: open, and the ground moved under it.** The owner, at the close of 2026-09-02: *"the select
of the places is in really wierd position we will handle that next session."* They were describing
`Select` sitting at the **head of the filter row**, ahead of `Been`, which puts a mode switch in a
band that is otherwise all narrowing controls.

**Read the code before designing anything here:** at `bb6feee` it is **no longer in the filter row**.
`EnterSelectionButton` renders on the **area-heading line**, trailing the `<h2>` —
`place-sheet.tsx:568-578` and `place-desktop-panel.tsx:180-187` — and `library-selection.tsx:199-201`
argues exactly the case below. So the complaint may already be answered by a commit the owner has not
seen. **Confirm what they are looking at before moving it again.**

**My recommendation: leave it on the heading line, and say why in one sentence.**

The header now holds three kinds of thing, and `Select` is the third:

| Band | What it does |
|---|---|
| Heading line | says **what you are looking at** — `18 places in Tel Aviv-Yafo` — and now, what you can *do to* the whole set |
| Row 1 | **narrows** the library |
| Row 2 | **reorders** it |

`Select` does neither of the last two: it changes what **tapping a row means**. Putting a mode switch
beside `Been` invites a user to read it as a fourth filter, which is precisely how it read in the
filter row. The heading line already spans full width with slack at its trailing edge, so the control
costs **zero vertical pixels** on a header the owner measured at 46 % of a 375×812 viewport — and it
sits with the thing it acts on (the set) rather than with the things that define the set.

Shape: the same 32-in-44 target as everything else, ghost, `text-xs font-medium`, word `Select`
(`bulk-delete.ts:42` — not `Delete places`; what it starts is a selection, and deleting is one of the
selection's outcomes). While selecting, `SelectionToolbar` replaces the search field **and** the
filter bar, which is already how it works and is right: two ways of narrowing a list you are counting
is a way to lose track of what is counted.

**Alternatives I considered and would not take:** a `⋯` overflow menu on the heading (hides a
destructive path behind an unlabelled glyph); long-press on a row to enter selection (undiscoverable,
and it collides with the sheet's drag); a persistent edit mode (a fourth band).

---

## 14. Deltas against `bb6feee`, so the builder can plan

The stopped attempt, `src/components/sheet/library-filter-bar.tsx` (689 lines), is **much closer to
this spec than its history suggests** — it is the shape to critique, not to restart. Concretely:

| # | Change | Where | Kind |
|---|---|---|---|
| 1 | Sort moves out of `trailing` onto **its own second row** | `place-sheet.tsx:629-638`, `place-desktop-panel.tsx:234-243`, `library-filter-bar.tsx:223-225` | **RULED** §5.1 |
| 2 | Row highlight `bg-muted/60` → **`bg-card-2`** | `library-filter-bar.tsx:180-182` | **defect** — invisible in light, *zero contrast in dark*; §5.2 |
| 3 | Add the **mobile inline** surface; keep the desktop popover | new `surface` prop, both hosts | **RULED** §5.1 |
| 4 | Popup radius 24 → 16, row radius 16 → 12 | `MENU_POPUP`, `MENU_ROW_PAINT` | RECOMMENDED, §4.4 |
| 5 | `bg-card` → `bg-popover` on the popup | `MENU_POPUP` | RECOMMENDED, §4.4 |
| 6 | No autofocus into the Tags field on mobile | `TagsAxis` | RECOMMENDED, §7.4 |
| 7 | Ids from `useId()` for `aria-controls` | `MenuAxis` | **defect risk** — both hosts are mounted at once |
| 8 | Suppress the stock `zoom-in-95` if any popup inherits it | `combobox.tsx:113` is the primitive; `MENU_POPUP` already avoids it | §11 |
| 9 | One name for the component | `place-sheet.tsx:816` calls it `Dropdown`; the export is `MenuAxis` | pick `MenuAxis`; a comment naming a component that does not exist is how the next agent loses an hour |

**Item 10, and it is a judgement call I am flagging rather than deciding.** `ActiveTagFilter`
(`place-sheet.tsx:641-643`, `place-desktop-panel.tsx:246-248`) still renders a row of removable tag
pills **below** the filter bar. With §5.1's `Combobox.Chips` inside the Tags popup, plus a trigger
that names or counts the active tags, plus `Clear` on row 1, that row is a **third** statement of one
fact in the exact band we are emptying. *Recommendation: delete it.* **The cost, stated honestly:** it
is today the only way to drop one tag of three without opening a menu. The trigger is one tap from
that, which I think settles it — but this is a row of pills the owner may have been looking at when
they approved something, and it has test references. **Ask before deleting.**

---

## 15. How to build this in independent pieces

`design-system-frontend` is the single build owner of production UI and the roster's throughput
bottleneck, so a spec that can be built out of order is worth more than one that cannot. These four
share no state and can land as four commits in any order:

| Piece | Touches | Depends on |
|---|---|---|
| **A. The row highlight fix** (§5.2) | two class strings in `library-filter-bar.tsx` | nothing. **Do this first** — it is minutes, it fixes a real dark-mode accessibility defect, and it is independently verifiable |
| **B. Sort onto row 2** (§2) | both hosts + the bar's `trailing` slot | nothing |
| **C. The mobile inline surface** (§7) | `MenuAxis` + `TagsAxis` + a `surface` prop from both hosts | nothing, but it is the largest piece and the one that needs a device |
| **D. Radii, `bg-popover`, ids, naming** (§14 items 4, 5, 7, 9) | `library-filter-bar.tsx` only | nothing |

**Nine inherited test failures** are named in the handoff and must not be edited green: three real
regressions from `abc1771` in `token-call-sites.test.ts`, one `orphans-have-consumers` (the bar has
no reachable consumer yet), and five written ahead of the code describing behaviour that was never
built. **Make them pass by building what they describe.** `tests/unit/sheet/library-filter-bar.test.ts`
is the contract for §3.4 and §3.5 and its own docblock is honest about what static markup cannot
prove.

---

## 16. What is measured, what is arithmetic, and what is a guess

**Read out of the source at `bb6feee`** (cited inline): every class name and token value; the
44/32/40 px geometry; the contrast figures at `globals.css:235-269`; the shadow, radius, duration and
easing values; the three `PlaceOrder` values and `availableOrders`' rule; `SORT_MIN_PLACES = 8`; every
string constant; both hosts' `lg` gates.

**Arithmetic, shown, not measured:** the `bg-muted/60` composite in §5.2 (channel-wise blend, and I
have not seen it on a screen); the concentric-radius sums in §4.4; the ~310 px row-width figure in
§2, which is `library-filter-bar.tsx`'s own arithmetic and not mine.

**Reused from someone else's measurement:** the `border-brand` + `bg-primary/5` hover
(`press-feedback.test.ts:69-80` and `button.tsx`'s own note); the `rgb(108, 67, 11)` active-ring
reading (`library-filter-bar.tsx:124-131`); r5's 372 px / 41 % band and the 375×812 y370 census.

**GUESS, labelled in place:** the `45vh` inline panel cap (§7.2); whether the 16/12 radii read better
than 24/16 (§4.4); that reserved-but-invisible indicator space satisfies the check-only-when-checked
ruling (§4.2 — the fallback is written out).

**Not verified, and I cannot verify it:** I have no shell. I did not run the app, open a menu, or
measure a hit area. **Nothing in this document is evidence that anything works.** The two things that
need a browser before this is called done are `document.elementFromPoint` at the top edge, the middle
and the bottom edge of every trigger (§3.1, mandatory per §5.1), and the row highlight at 1440×900 in
**both** themes (§5.2).

---

## 17. Questions for the owner — none of them blocking

1. **`Category`'s internals stay as they are** (§5.1: *"for catagory im not sure yet"*). This spec
   gives it the same trigger, the same rows and the same dot as the others and builds it as a
   swappable sibling. When it is decided, only that one component changes.
2. **The `Select` control** (§13) — is the heading-line placement at `bb6feee` acceptable, or is that
   still the position that reads as weird?
3. **The `ActiveTagFilter` pill row** (§14 item 10) — delete it, or keep it as the one-tap way to
   drop a single tag?

Everything else in this document is either RULED by §5.1 or is the builder's call and is not waiting
on an answer.
