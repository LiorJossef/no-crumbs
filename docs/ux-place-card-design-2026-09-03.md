# The saved-place card — what it should be

**Task UI-5 · `ux-interaction` · 2026-09-03 · base commit `3fb628b`**
**Advisory. No source was written. `design-system-frontend` owns the build.**

> The owner's ask, verbatim: *"I want this whole card to feel like it's one place, like one design.
> I feel like there are some things that are different designs, like it has patches and stuff like
> that. Okay, you cleared the buttons, but when you click the button, you see super weird design."*
> And: *"I don't like the design of like the binder, like button, like some things are just not
> feeling like the product."*

This is not a tuning pass. It is a ruling on **how many kinds of thing the card is allowed to be**,
what each kind is for, and what every existing element becomes. The resting card was already
improved on 2026-09-03 (`0cc0542`); what is still broken is almost entirely **what happens when you
press something**, plus one control the owner named by hand.

Every number below is either quoted from a source comment (marked *SOURCE*) or an **ESTIMATE**. I
have no shell and no browser: nothing here is measured by me. §9 lists what to verify.

---

## 1. Inventory — every state, and which vocabulary it speaks

Read from `place-sheet.tsx` (`PlaceDetail`, l. 2185–3119), `saved-place-edits.tsx`,
`add-to-collection.tsx`, `place-enrichment.tsx`, `visit-state.tsx`, `place-desktop-panel.tsx`.

The vocabularies, lettered so the table can point at them:

| | Vocabulary | Where it is declared |
|---|---|---|
| **a** | Bordered bold `rounded-full` 44 px pill, `text-sm font-bold` | `DETAIL_ACTION_PILL` |
| **b** | Borderless brand-ink text link, `font-medium`, leading mark, 44 px | `DETAIL_OUT_LINK` |
| **c** | Borderless flush 48 px list row, inline 11 px label + value + 12 px trailing glyph | `DETAIL_FIELD_ROW` + `SECTION_LABEL` + `DETAIL_FIELD_VALUE` |
| **d** | Grey filled `rounded-full` chips, `text-xs font-bold`, in a radiogroup | inline in `CategoryEditor` (l. 462–467) |
| **e** | 11 px **bold mint** text commit — `Done` | `DETAIL_FIELD_DONE` |
| **f** | 11 px muted record line; plain-text destructive action | inline; `RemoveSavedPlace` (l. 756) |
| **g** | Bordered `<textarea>` with a mint focus ring, `rounded-lg border-input` | inline in `NoteEditor` (l. 648) |
| **h** | `ui/button.tsx` `Button` pairs — `size="sm"` default + ghost | `NoteEditor`, `RemoveSavedPlace`, `CollectionPicker` |
| **i** | A **separate pane** that replaces the card's content | `CollectionPicker` |
| **j** | Bordered-bottom 44 px rows with a 20 px tick disc | `CollectionPicker`'s list (l. 320–347) |
| **k** | Hairline band rule, drawn as the band's own `border-t` | `PlaceDetail` bands 2 and 3 |

### 1.1 The states

| # | State | What it looks like today | Speaks |
|---|---|---|---|
| 1 | **Resting, saved** | still → name / category·locality / tags → address (+`~ Approximate`) → action band → hairline → quote + why-go + dishes + extra sources → hairline → three field rows flush → nearby → record line → `Remove from your places` | a, b, c, f, k |
| 2 | **Resting, not saved** (a place seen inside a collection) | `savedPlace === null`: **band 3 does not render at all** — no field rows, no record line, no remove. `primaryAction` slot carries `Added by …` / `Save to your places` at full width. `Google Maps` is unconditional; TikTok/quote/tags depend on the data a peer may read. | b, k, + the host's own |
| 3 | **`Been here` off** | `DETAIL_ACTION_PILL` + `border-input text-foreground`, `Check` glyph, label `Been here`. *SOURCE*: measured 124 px wide (`place-sheet.tsx` l. 2744). | a |
| 4 | **`Been here` on** | same pill, `border-transparent bg-accent text-brand`, label `Been`; plus a `visitedOn` 11 px muted line under the band; plus `BeenBadge` on the still and on the list row | a, f |
| 5 | **`Been here` pending** | `opacity-50`, `aria-busy`, re-entry guard (not `disabled` — *SOURCE*: `BeenToggle` l. 212–218) | a |
| 6 | **`Been here` failed** | `role="alert"` `text-xs text-destructive` under the pill | f-ish |
| 7 | **Category resting** | field row: `Category` (11 px muted) · `Café` (14 px) · pencil. `Not set` in muted when null. | c |
| 8 | **Category open** | row is **replaced in place** by: `Category` label left, **11 px bold mint `Done`** right, and beneath it a wrapping radiogroup of **grey filled chips** (active = `bg-accent text-brand`), plus `Automatic` as an underlined muted word when overridden | d, e |
| 9 | **Category pending / failed** | chips `disabled:opacity-50`; row **stays open**, error as an 11 px `role="alert"` line (*SOURCE*: l. 361–364) | d, e, f |
| 10 | **Note resting, empty** | field row, **no label**, muted `Add a note`, pencil | c |
| 11 | **Note resting, filled** | field row, inline `Your note` label returns, value `line-clamp-2 whitespace-pre-wrap`, pencil | c |
| 12 | **Note open** | row replaced by: `Your note` label, a **full-width bordered `<textarea>` `rows={4}`** with a mint focus ring and the placeholder `Why did you save this?`, then a line holding the (usually invisible) counter and **two `Button`s — ghost `Cancel` and default `Save note`** | g, h |
| 13 | **Note saving / failed** | `Saving…`, everything disabled, draft preserved on failure (`keepsDraft`) | g, h, f |
| 14 | **Collections resting** | field row, **no label**, `In tel aviv food` or muted offer, **`ChevronRight`** | c |
| 15 | **Collections open** | **leaves the card**: `CollectionPicker` replaces the whole detail pane — its own `ArrowLeft` + `Add to…` heading, a `New collection` row, a `<ul>` of bordered-bottom rows with 20 px tick discs, and a compose form with `Input` + `Create and add` + ghost `Cancel` | i, j, h |
| 16 | **Collections toggle failed** | optimistic tick reverts itself; a 12 px destructive line under the row | f |
| 17 | **Remove, resting** | `mt-5`, `text-sm font-medium text-muted-foreground`, no glyph, `hover:text-destructive hover:underline` | f |
| 18 | **Remove, confirming** | a 14 px sentence with the name in bold, then destructive `Button size="sm"` + ghost `Cancel` (`autoFocus` on Cancel) | h |
| 19 | **Remove failed** | `refused` collapses the confirm; `unreachable` keeps it. Error line either way. | f |
| 20 | **`lg+` panel / popover** | `w-80` (288 px), `max-h-[min(50vh,28rem)]`, full-bleed `compact` still at 112 px, `text-lg` name, `px-0 pt-0`, `scroll-fade-b`. The action band is **deliberately wrapped** to two lines here (*SOURCE*: l. 2743–2750). | same set |
| 21 | **`hosted`** (`/collections/[id]`) | `px-4 pb-8 pt-1`, no close control, host draws the back arrow, `fields`/`footer` slots filled | same set |

### 1.2 The finding

The card gives **three different answers to "what does editing look like here"**:

- *category* → commit with an **11 px mint word**, choices as **grey filled chips**, in place;
- *note* → commit with a **two-`Button` pair**, editor as a **bordered box**, in place;
- *collections* → **no commit at all**, and it **leaves the card**.

And it draws a box in exactly one place (the textarea) on a surface whose entire rest — rows,
links, labels, the removal — has no border, no fill and no radius at rest. That is the "patches"
the owner is seeing. It is not a colour problem and it is not a spacing problem.

Two further collisions worth naming:

1. **`Done` already means something else.** In the library header, `Done` is the word that leaves
   multi-select mode (`LeaveSelectionButton`, ruled in `ux-select-control-2026-09-03.md` §4). On
   this card it means "close this field". One word, two mechanisms, ~150 px apart on the same phone.
2. **Mint.** `DETAIL_FIELD_DONE` is `text-brand`. Mint means *create* on the `＋` and *this is
   narrowing your library* on a pressed filter chip. `DETAIL_ACTION_PILL`'s own docblock refuses
   mint for exactly this reason — and then the row 200 px below spends it anyway, on the smallest
   text on the card.

---

## 2. The ruling — the closed set

> **A place card is made of seven kinds of element and nothing else: three registers of type, three
> kinds of control, and one exit. Only one of them is allowed to draw a border.**

Anything added to this card later must be one of these seven. If it is not, it does not go on the
card.

### Type — never interactive

- **T1 · Identity.** The still, the name (`font-heading text-2xl font-extrabold`), the
  category·locality line, the tags, the address with its `~ Approximate` mark. Carried by type and
  space. *(unchanged)*
- **T2 · Someone else's words.** The caption quote inside its `border-l-2 border-brand-tint` rule,
  the attribution, the why-go sentence, the dish line. The left rule is the one permitted graphic —
  it is what carries the extracted-vs-inferred distinction by shape. *(unchanged)*
- **T3 · The record.** 11 px muted lines that state a quiet fact and stop: `Matched on Google Maps ·
  Saved on 2 September`, `visitedOn`, and the micro section labels (`Also nearby`, `2 more posts`).
  `SECTION_LABEL` is this register. **Errors are also T3, one weight up in destructive ink.**
  *(unchanged)*

### Controls

- **C1 · The act.** **Exactly one per card**, and it is the only control on the card that has a
  border. It is the thing the product wants a returning user to come back and do: `Been here`.
  A host with no saved row spends this slot instead (`primaryAction`). *(re-skinned — §4.3)*
- **C2 · The ways out.** Borderless brand-ink text links, `font-medium`, a mark or a word, 44 px of
  target: `TikTok`, `Google Maps`, and each extra-source row. They leave the product; they may
  never look like C1. `DETAIL_OUT_LINK` is exactly right and does not change. *(unchanged)*
- **C3 · The field row.** A flush run of 48 px borderless rows, one per editable field of **your**
  record of this place: `Collections`, `Category`, `Your note`, plus the host's own (`Shared note`).
  Shape: `[11 px label, only when the value needs naming] · [14 px value] · [one trailing glyph]`.
  **Every one of them opens the same way** — §3. `DETAIL_FIELD_ROW` is right and does not change.

### The exit

- **E · The exit.** One plain-text destructive action at the very foot, `text-sm font-medium
  text-muted-foreground`, no glyph, no rule above it, `hover:text-destructive`. Confirming replaces
  it with a sentence and the house button pair. *(near-unchanged — §4.4)*

### And one separator

- **The hairline.** Used exactly twice, as each band's own `border-t`, so an empty band takes its
  rule with it. Nothing else on the card draws a line, a box or a fill. *(unchanged)*

### 2.1 Where every element from §1 lands

| Today | Becomes | Why |
|---|---|---|
| **a** `DETAIL_ACTION_PILL` | **C1**, re-skinned onto `TRIGGER_TARGET`/`TRIGGER_PAINT` | §4.3. It is a bespoke eighth pill on a card that has a house pill |
| **b** `DETAIL_OUT_LINK` | **C2**, unchanged | It is already the answer |
| **c** `DETAIL_FIELD_ROW` | **C3**, unchanged at rest | It is already the answer |
| **d** grey filled chips | **deleted** | Grey fill exists nowhere else on the card. Replaced by menu rows (§3.2) |
| **e** `DETAIL_FIELD_DONE` | **deleted, not restyled** | A choice commits itself; there is nothing left for it to close. Also frees the word `Done` and stops mint from gaining a third meaning |
| **f** record + destructive text | **T3** and **E**, unchanged | |
| **g** bordered textarea | **deleted as a box**; the field survives inside the panel, borderless | §3.3. The panel *is* the box; a box inside a box is the patch |
| **h** `Button` pairs | **kept, and made the card's only commit shape** | §3.4. It is already the product's idiom in three other places |
| **i** the replacing pane | **deleted** | §3.1. Nothing on this card may navigate away to edit one field |
| **j** the picker's bespoke rows | **deleted**, replaced by `MENU_ROW` + `MENU_ROW_PAINT` | §3.1. One menu material, already shared |
| **k** the hairline | unchanged | |

Vocabulary count on the card: **eleven → seven**, and the four that go are the four the owner is
pointing at.

---

## 3. The one open-row pattern

> **A field row never changes shape when it opens. It stays exactly where it is, its glyph rotates,
> and what it needs appears in a panel directly underneath it — the same panel material every other
> disclosure in this product already uses.**

The material exists: `src/components/ui/inline-menu.tsx` (`INLINE_PANEL`, `MENU_ROW`,
`MENU_ROW_PAINT`, `InlinePanel`), extracted on 2026-09-03 (`b2d7f98`) for precisely this reason —
*"Two importers of one file cannot drift; two hand-written copies always do."* The library filter
bar uses it on the phone, and the share panel adopted it for a value trigger on the same day. **The
card is the third surface, and it invents nothing.**

### 3.1 Collections — stops leaving the card

`CollectionPicker` stops replacing the pane. It opens as an `InlinePanel` under its own row, with
`axis` omitted (an action list has no axis — the constant's own docblock says so) and `axisClear`
`null`. Inside:

- one `MENU_ROW` + `MENU_ROW_PAINT` per collection, with the tick in the indicator column exactly as
  `AxisRows`' inline arm and the share panel's role rows do it, `role="switch" aria-checked` kept,
  the count in the end column `MENU_ROW_PAINT` already provides;
- `New collection` as the **last** row of the same list, a `MENU_ROW` with a leading `Plus`;
- pressing it swaps that row for the compose `Input` + `Create and add` + ghost `Cancel` **inside
  the panel** — which is where that pair already lives, so it does not change;
- the bespoke `border-b border-border/70` rows, the 20 px tick disc, the `ArrowLeft`, the `Add to…`
  heading and `HostedPaneBackContext` all **go**. The back-control-collision problem that context
  exists to solve stops existing when nothing navigates.
- the panel stays open on toggle (multi-select), and closes on outside press or Escape, which
  `InlinePanel` already implements.

This is the single largest "one piece" win available: it deletes a whole navigation step, a whole
row vocabulary, and a whole focus-restoration mechanism.

### 3.2 Category — a value trigger, and it commits on choose

The row becomes what the share panel's role control already is: a trigger showing the current value,
opening a panel of radio rows. The mechanism is `MenuAxis` (`tone`/`surface="inline"`) with
`AxisRows`, or the same two constants used directly if `MenuAxis`'s filter-bar coupling is awkward
inside a card — `design-system-frontend`'s call, but it must be the same *paint*.

- `Restaurant` / `Café` / `Bar` become rows, tick in the indicator column, **no fill anywhere**;
- `Automatic` becomes a fourth row with an empty indicator when `isOverridden` — not an underlined
  word floating after the chips;
- **choosing commits and closes**, and focus returns to the row, which now shows the new value.
  This is already ruled: *"Single-select closes on choose and hands focus back to the trigger —
  RULED, owner 2026-09-02"* (`library-filter-bar.tsx` l. 665);
- `DETAIL_FIELD_DONE` is deleted. There is no draft, so there is nothing to commit and nothing to
  close;
- failure keeps the panel open with the error as a T3 destructive line inside the panel, preserving
  today's rule that an unreachable write settles nothing.

### 3.3 Note — the same panel, and the box goes

The note is free text, so it is the one row that cannot be a list. It gets **the same container
anyway**:

- the `InlinePanel` opens under the row and holds a **bare `<textarea>`: no border, no fill, no
  radius, no focus ring on the field itself.** The panel is the surface; a bordered field inside a
  bordered panel is the patch. Focus is shown by the panel, or — if that reads as nothing —
  by `focus-visible:ring-3 ring-ring/50` on the panel, never a second border;
- `rows={4}` → **`rows={3}`** on the phone (§3.5);
- `dir="auto"`, `text-base` (the iOS zoom floor) and the Escape-cancels / Enter-does-not-submit
  rules are untouched — all three are correct and load-bearing;
- the counter line and the commit pair stay on one line, as they already are.

### 3.4 The one commit shape

> **A row that holds a *draft* commits with the house `Button` pair. A row that holds a *choice*
> commits on choose. Nothing on this card commits with a word.**

The pair is not a foreign object: `share-panel.tsx` uses it for four different confirmations,
`add-to-collection.tsx` for compose, and `RemoveSavedPlace` for the removal. It is the product's
committed-form idiom, and it is the 11 px mint `Done` that is the outlier — on register (smallest
text on the card as the commit control), on colour (a third meaning for mint), and on wording
(`Done` is the library's exit-from-selection word).

**Alignment:** the note's pair and the removal's pair both move from `size="sm"` to the share
panel's `h-11 px-4`, so the card's two commit moments and the rest of the product's are one object.
44 px targets, and it is the same numbers already written three times in `share-panel.tsx`.

### 3.5 The height budget

The note editor currently pushes the record line and `Remove from your places` below the fixed
bottom nav at `half`. Three things fix it, and **only the first is a real lever**:

1. **Opening a panel raises the sheet to `full` first.** This is an existing, ruled mechanism, from
   the surface next door: *"Opening a panel at `half` would be dividing 83 px between a menu and the
   list it narrows. The sheet goes to `full` first, and only from a stop that is not already there"*
   (*SOURCE*: `place-sheet.tsx` l. 773–775, `LibraryFilterBar`'s `onPanelOpen`). The card should do
   exactly the same thing, through exactly the same prop shape. It costs one optional prop on
   `PlaceDetail`, threaded from the sheet's `selected` branch; the popover and `hosted` hosts pass
   nothing and nothing happens, the same way `floatingBarPx` already works.
2. **The panel is capped, and it caps itself.** `INLINE_PANEL` is
   `max-h-[min(--sheet-content-height*0.4, --sheet-content-height - 21rem)]` with its own
   `overflow-y-auto overscroll-contain`. **But `PlaceDetail` never publishes
   `--sheet-content-height`.** `PlaceList` sets it (l. 553); the `selected` branch of `PlaceSheet`
   (l. 317–320) sets only `height`. So an inline panel inside the card would fall back to `100dvh`
   — which the constant's own comment calls a lie in this context. **This is a required build note,
   not a nicety.**
3. `rows` 4 → 3 buys roughly one line of `text-base leading-relaxed` — **ESTIMATE ~26 px**. Take it,
   but it is not what fixes the problem.

**Scroll-into-view on open**: after the panel mounts, the *row* (not the panel's foot) is scrolled
into view. The card's column already ends above the bar by margin rather than padding
(*SOURCE*: l. 2446–2475), so there is no under-the-bar edge left to park against.

### 3.6 Motion

Nothing new. The disclosure is `enter` — *"Opacity + 4px rise. One rule, used everywhere, never
elaborated · 140ms"* (`facelift-plan.md` §3a) — which `INLINE_PANEL` already carries as
`animate-in fade-in-0 motion-safe:slide-in-from-top-1 duration-enter`. **No height animation ever**
(the constant forbids it: *"layout thrash inside a scrolling sheet for no information"*). Under
`prefers-reduced-motion` it collapses to the opacity alone, never to nothing — §3a's rule for all
nine animations. The glyph rotation is `motion-safe:transition-transform motion-safe:duration-cross`
and **still ends rotated under reduced motion** — copied from the share panel's chevron, l. 491–497.

`facelift-plan.md` §3a's state matrix has **no row for a field row or an editable disclosure**. The
system is silent here; I am not inventing one. The nearest row is `List row`, whose press is
`scale-[.995]`, 90 ms — which is exactly what `PRESS_ROW` already gives `DETAIL_FIELD_ROW`, so the
open row inherits a ruled press rather than a new one.

---

## 4. The resting card

### 4.1 What it leads with, and the bands

Unchanged, and deliberately so — this is the half that already works:

- **Band 0 (no rule):** the source still, then name / category·locality / tags, then the address
  with its `~ Approximate` mark, then the action band (C1 + C2), then `visitedOn`.
- **Band 1 — from the post** (hairline): quote → why-go → dishes → other posts.
- **Band 2 — yours** (hairline): the flush C3 run → nearby → the T3 record line → E.

Two hairlines, both drawn as a band's own `border-t` so an empty band takes its rule with it. **No
third rule anywhere**, including above the removal. Group-to-group step inside a band is 12 px;
band-to-band is 20 px. Nothing in this document changes any of it.

The action band stays **above** the quote. That was a measured decision (*SOURCE*: l. 2688–2696 —
the band's bottom edge moved 933 → 846 at 390×844) and re-litigating it would be churn.

### 4.2 One trailing glyph, not two

All three C3 rows now disclose a panel in place, so the pencil/chevron split stops being true. **One
glyph for all three: `ChevronDown`, `size-3`, `text-muted-foreground`, rotating 180° when open.**
The pencil goes. It promised "type here" on two rows that offer no typing, and the `ChevronRight`
promised "this replaces the pane", which after §3.1 nothing does.

### 4.3 `Been here` — the owner's "binder button"

**Verdict: it stays the card's single act, it keeps its border, and it stops being a bespoke pill.**

The complaint is right and the mechanism is identifiable. `DETAIL_ACTION_PILL` is `min-h-11
rounded-full border px-4 text-sm font-bold` — **44 px of paint, bold, at body size.** The product's
own pill is `TRIGGER_TARGET` + `TRIGGER_PAINT`: **32 px of paint inside a 44 px target, hairline
`border-border/70`, `bg-card`, `text-xs font-medium`, `rounded-full`** — worn by every filter
trigger and by the share panel's value trigger. Those are two different objects wearing the same
silhouette, and the card's is the one that exists nowhere else in the product. A bordered bold slab
on a card where nothing else is bordered *is* a generic outline button, which is the Charter §6
register the whole facelift is trying to leave.

So:

- **off** → `TRIGGER_TARGET` + `TRIGGER_PAINT` + `PRESS_CHIP`, with the `Check` glyph and the word
  `Been here`. Both strings are ratified (`voice-and-vocabulary.md` §3) and neither changes.
- **on** → the same target with `border-transparent bg-accent text-brand` — which is **exactly what
  `BeenBadge` already wears** (*SOURCE*: `visit-state.tsx` l. 45–58, adopted for this precise
  reason: *"the row and the control that sets it now read as one fact stated twice"*). The control
  that sets the state and the badge that reports it become one object at two sizes. That is
  "one piece", literally.
- `DETAIL_ACTION_PILL` is deleted. Nothing else imports it.
- **Not mint, not filled.** Its own docblock's argument survives intact and this change strengthens
  it: the promotion is by subtraction.

**Where it can go wrong, stated rather than hidden.** At `text-xs`/32 px the act may under-read
against two `text-sm` links beside it, or read as a filter chip. It should not — it is the only
bordered thing in the band, it carries a glyph none of the filter triggers carry, and it sits in a
card, not a filter bar — but I cannot see it. **The graded retreat is one class, not a redesign:**
`h-8` → `h-9` on the paint, then `text-xs` → `text-sm`. Do not go back to `font-bold`, and do not
add a fill. §9 asks for this to be looked at.

### 4.4 Where the exit lives

Unchanged: last, `mt-5`, quiet, plain text, no glyph, no rule above it. `RemoveSavedPlace`'s
own comment already argues this and the argument is right. The only change is §3.4's button
alignment on the confirming state.

The confirming state's other rules — focus lands on `Cancel`, the name stays on screen, `refused`
collapses the step and `unreachable` keeps it — are correct and untouched.

### 4.5 Not-saved, pending, empty, error

- **Not saved** (state 2): band 2 does not render. That is right and stays. The `primaryAction`
  slot keeps its full width — it is that card's single C1 and there is no contest for the row.
- **Pending**: `opacity-50` + `aria-busy` + re-entry guard, never `disabled`. Ruled, measured, and
  it applies to every control in the closed set.
- **Empty field**: the *same row* with a muted value (`Not set`, `Add a note`), never a different
  component. Already true; do not regress it.
- **Errors** are T3 in destructive ink, `role="alert"`, under the thing that failed — inside the
  panel when the panel is open. No toasts, no banners.

---

## 5. Against what was designed

Quoted where the card contradicts the system; **named as silence where the system says nothing.**

| Source | What it says | The card |
|---|---|---|
| `brand-and-product-foundation.md` §5 | *"No default card shadow; elevation is reserved for surfaces that actually float"* | The `INLINE_PANEL` I am adopting carries `shadow-raised`. Inside a resting card that is elevation on something that is not floating. **I am adopting it as-is anyway** — the phone filter bar already draws exactly this inside the sheet and the owner has seen it — rather than forking a shadowless variant and inventing an eighth surface. §9 asks for a look. |
| `brand-and-product-foundation.md` §5 | *"Labels are 11px bold uppercase with wide tracking"* | **Superseded, correctly**, by `SECTION_LABEL`'s 2026-09-02 ruling (11 px / 500 / sentence case / muted) with a contrast measurement behind it. No change. |
| `facelift-plan.md` §3a, state matrix | Nine element rows | **Silent on the field row and on any editable disclosure.** I inherit `List row`'s press via `PRESS_ROW` rather than writing a tenth row. |
| `facelift-plan.md` §3a, closed animation list | Nine animations; *"Everything else stays still"* | The disclosure is `enter` and nothing more. No height animation. No new entry required. |
| `facelift-plan.md` §3a | *"Under `prefers-reduced-motion` all nine collapse to the opacity change alone — not to nothing"* | Satisfied by `INLINE_PANEL` as written; the chevron still ends rotated. |
| `facelift-plan.md` §4 rule 5 | *"Press feedback is one utility"* | Every control in the closed set takes `PRESS_ROW` / `PRESS_CHIP` / `PRESS_BUTTON`. The grey chips took `PRESS_CHIP` and are going anyway. |
| `voice-and-vocabulary.md` §3 | `Been here` / `Been` ratified; `collection`, never list/board/folder | No string in this document changes. `Done` is freed for the library's own use. |
| Charter §6 | banned: generic dashboards, card soup, glassmorphism, glow, template SaaS | The current open category row (a labelled grey chip group) and the bordered textarea are the card reading as a **settings form**, which is the same register. Both go. Nothing here adds a gradient, a glow or a blur; `PANEL_SURFACE`'s own docblock notes it deliberately carries neither. |
| Google Places terms | `Matched on Google Maps` is required | **Untouched.** It stays in the T3 record line, and `Google Maps` stays named in full on its C2 link. |

`no-crumbs-design-system.html` is my own artefact and is 4 000 lines of mockup, not a rule source;
where it and the running code disagree, `facelift-plan.md` §6 row 7 already rules that **the running
code wins**. I am not proposing a change to that file in this task.

---

## 6. Against the card's neighbours

| Neighbour | Its answer | What the card takes |
|---|---|---|
| `share-panel.tsx` (freshest) | A **sentence with an inline value trigger** — `TRIGGER_TARGET`/`TRIGGER_PAINT` + `InlinePanel` + `MENU_ROW` rows — chosen explicitly over a segmented control because it *"was an eighth pill vocabulary in a product the overwhelm audit already caught running seven"* | The whole open-row pattern (§3), the chevron rotation, `h-11 px-4` on commit pairs, and the demotion-by-weight-not-colour rule on `Replace link` / `Turn the link off` which E already matches |
| `library-filter-bar.tsx` | Inline panel on the phone, popup on desktop, one trigger paint, **single-select closes on choose**, panel raises the sheet to `full` first | §3.2's commit rule and §3.5's height lever, both verbatim |
| `inline-menu.tsx` | One menu material, `axis` optional so an action list prints no kicker | §3.1 and §3.2's container |
| `collection-content.tsx` / `collections-index-list.tsx` | Actions behind a `⋯` opening the same menu material; bulk mode swaps the header rather than stacking a second control | Nothing new needed; the card has no `⋯` and should not grow one — its actions are named and few |
| `visit-state.tsx` (`BeenBadge`) | `bg-accent text-brand`, tick + word, `text-micro font-semibold` — adopted *specifically* to match the toggle | §4.3's ON state, closing the loop the badge opened |

**Every mechanism in this document already exists in `src/`.** Nothing here is a new component, a
new colour, a new radius, a new duration or a new type step.

---

## 7. Build order

Ranked by how much "one piece" each change buys per unit of work.

### Reuses something that exists

| # | Change | Buys | Files |
|---|---|---|---|
| **B1** | **Category row → value trigger + `InlinePanel` rows.** Delete the grey chip group and `DETAIL_FIELD_DONE`. | Kills **two** vocabularies (d, e), the mint collision and the `Done` collision, on the row the owner opened first | `saved-place-edits.tsx` |
| **B2** | **Collections opens in place.** `CollectionPicker` → `InlinePanel` + `MENU_ROW`/`MENU_ROW_PAINT`; delete the pane, the bespoke rows, the tick disc, the `ArrowLeft`/heading and `HostedPaneBackContext` | Kills vocabularies i and j and a whole navigation step; makes all three rows answer alike | `add-to-collection.tsx`, `place-sheet.tsx` (context removal), `collection-content.tsx` (drops the borrowed back control) |
| **B3** | **Note editor into the same panel; textarea loses its border; `rows` 4→3** | Kills vocabulary g — the only box on the card | `saved-place-edits.tsx` |
| **B4** | **`Been here` → `TRIGGER_TARGET`/`TRIGGER_PAINT`, ON = `bg-accent text-brand`.** Delete `DETAIL_ACTION_PILL` | The control the owner named by hand; closes the badge↔toggle loop | `saved-place-edits.tsx` |
| **B5** | **One trailing glyph** — `ChevronDown` on all three C3 rows, rotating on open | Small, cheap, and it is what makes the three rows read as one list | `saved-place-edits.tsx`, `add-to-collection.tsx` |
| **B6** | **Commit pairs align to `h-11 px-4`** (note + removal) | Trivial; makes the card's two commit moments and the share panel's four one object | `saved-place-edits.tsx` |

### Needs something new (small, structural)

| # | Change | Why it is new |
|---|---|---|
| **B7** | **`PlaceDetail` publishes `--sheet-content-height`** on its scroll column, from `STOP_TO_CONTENT_HEIGHT[stop]`, the way `PlaceList` already does | Without it every panel in B1–B3 falls back to `100dvh` and is uncapped. **Blocking for B1–B3.** |
| **B8** | **`PlaceDetail` gains an optional `onPanelOpen`**, threaded from `PlaceSheet`'s `selected` branch, called before a field row's panel opens when `stop !== 'full'` | The height fix. One prop, same shape as `floatingBarPx`; hosts that pass nothing are unaffected |

### Concurrency note

B1–B6 are almost entirely **one file** (`saved-place-edits.tsx`), so they are one build, not six
parallel ones. **B7 and B8 are the separable piece** — they touch `place-sheet.tsx` only and can be
built and landed first by a different hand, which is also the right order since B7 blocks the rest.
Suggested split: **B7+B8 as one commit, then B1, B2, B3, B4 as four commits in that order**, each of
which leaves the card coherent if the next one does not land.

Ordering hazard worth naming: **do not ship B1 without B3.** Half the card committing on choose and
half committing with a mint word is a worse state than today's, because today at least the two
differences are visible as two different rows rather than as one rule with an exception.

---

## 8. What is deliberately not changed

So a future reader does not think it was missed:

- The three-stop sheet model, `PEEK_PX`, `HALF_FRACTION`, `STOP_TO_CONTENT_HEIGHT` and vaul's
  gesture arbitration. `facelift-plan.md` §1 lists the sheet's stop model under **preserve
  unchanged**, and every `data-vaul-no-drag` in these files stays.
- The `mb-[calc(env(safe-area-inset-bottom)+var(--floating-bar,0px))]` margin rather than padding.
  Measured, correct, and §3.5 depends on it.
- The popover's `max-h-[min(50vh,28rem)]` and the 112 px `compact` still. Measured against the pin
  anchor, not the viewport; nothing here touches height on that host.
- The `<bdi>` on the name, `dir="auto"` on the note and the quote, the mirrored `&ldquo;`/`&rdquo;`,
  and the separate name/role elements in any row that has both. All four are RTL-audit findings.
- The action band's position above the quote, and its deliberate wrap at 288 px.
- Every string. `Matched on Google Maps`, `Been here`/`Been`, `Remove from your places`,
  `Add a note`, `Why did you save this?`, `Not set`, `Automatic` — unchanged.
- The write model: nothing optimistic except the collection toggle, `attemptWrite` around every
  action, `refused` vs `unreachable` handled differently per control.

**I respect `place-sheet.tsx`'s measured comments about the fold and the snap states rather than
superseding them.** §3.5 explicitly adopts the mechanism l. 773–775 already uses, and l. 2698–2711's
honest statement that the action band *cannot* reach zero-scroll at `half` — *"What is left deletes
something — the still, the tags, or the `half` stop itself — and each of those is a product decision
rather than a layout one"* — stands. This document does not spend that decision. It only stops the
**note editor** from making the situation worse, which is a different and smaller claim.

---

## 9. What to verify in the app for me

I have no shell and no browser. Nothing above is measured by me. At **390×844** and at the **`lg+`
288 px panel**, on a place with a long note and one with none:

1. **`Been here` at `TRIGGER_PAINT` (B4).** Does the card still have an obvious single act, or does
   it read as a filter chip that wandered in? This is the one judgement in the document I cannot
   make from source. If it under-reads, apply the graded retreat in §4.3 — `h-8` → `h-9` first — and
   tell me which step you stopped at.
2. **`shadow-raised` on a panel inside a resting card (§5).** Does it read as a menu, or as an
   unwanted elevation on a card that is not floating?
3. **The height budget at `half` (B7/B8).** With each of the three panels open in turn: is the T3
   record line and `Remove from your places` still reachable, and does the panel cap actually bind?
   Confirm `--sheet-content-height` resolves to a number and not to `100dvh`.
4. **The raise-to-`full` transition.** Does raising the sheet *and* opening a panel in the same
   gesture read as one motion or as two? If two, the panel should mount after the sheet settles.
5. **The chevron on three rows.** Do the three C3 rows now read as one list, or does the collections
   row still feel like a different kind of thing?
6. **Focus.** After choosing a category, does focus land back on the row showing the new value?
   After `Save note`, does it land on the row and not on `<body>`?
7. **Reduced motion.** With `prefers-reduced-motion` on, does the panel still fade in and the
   chevron still end rotated?
8. **RTL.** A Hebrew note and a Hebrew collection name, both with a panel open.

