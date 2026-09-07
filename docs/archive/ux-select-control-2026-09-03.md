# Selection mode, and the `Select` trigger — the band's weight order, the heading, the entry

> **Spec, 2026-09-03. `ux-interaction` writes it, `design-system-frontend` builds it.**
> Surfaces: `src/components/sheet/library-selection.tsx` (`EnterSelectionButton`,
> `SelectionToolbar`, `BulkDeleteControl`), `src/components/sheet/place-sheet.tsx` (heading row
> ~618, band ~643–656), `src/components/collections/collection-content.tsx` (heading row ~625–696,
> its inline copy of the toolbar ~820–851). Four contexts throughout: Places and collection, each in
> the 375×812 sheet and in the `lg+` ~292 px panel.
>
> Base commit for the reading below: `6901ed9`, plus the uncommitted work in `collection-content.tsx`
> and `library-filter-bar.tsx` as it stands on disk. Shapes quoted from the orchestrator's browser
> pass at 375×812 and from two owner screenshots of the library band.
>
> **No string changes anywhere in this spec.** Every label already exists in `bulk-delete.ts`. The
> `Select` trigger's type size, weight, colour and label are also unchanged — the owner likes how it
> looks, and that half of this document is spacing only.

---

## 1. Diagnosis

**The band's hierarchy is inverted, and that is the whole complaint.** In selection mode the library
draws three bare text items on one line — `Done`, `None selected`, `Select all` — with the two
buttons at `font-semibold` and near-black, and the one thing on the screen that cannot be undone,
`Delete from your places`, rendered beneath them as grey text with a grey glyph at
`disabled:opacity-50`. So the two lowest-stakes controls present (leave a mode, toggle a checkbox
set) are the loudest, the status text between them is styled more like a button than the destructive
action is, and the destructive action reads as a permanently dead control rather than as one waiting
for a pick. Confirming the orchestrator's reading in full, and adding the part that makes it a
*transition* defect rather than a styling one: **the same class of control changes weight across the
mode change.** Before, `Select` is 14 px medium muted grey against a 20 px extrabold heading, so it
reads as secondary. After one tap, its successors `Done` and `Select all` are semibold and dark.
Nothing about the task became more important; the controls simply changed their minds, and the
heading that was the loudest element before is still the loudest element after, now competing
directly with a band that states a *different* count 8 px below it. That is what "when you click to
get to the select mode, it's weird" is pointing at. Nothing in either band has a container,
separator or grouping, so there is also no cue as to which items are controls and which is status —
the same "naked word" problem as the `Select` trigger, tripled, which is why the owner's two
complaints are one family.

**Second, smaller defect — the `Select` trigger's missing edge.** `EnterSelectionButton` carries
`px-2` for hit area and cancels none of it at the trailing side, unlike every other trailing control
in the product (`⋯` runs `-me-2 -my-1.5` for exactly this reason). In the **Places list** the
header's right edge is set by the search field's border box at the column edge (x=355 at 375 with
`px-5`); `Select`'s text stops at 347, so an unboxed word floats 8 px inside the only vertical line
on the screen. In the **collection** the same 8 px is not a misalignment — `Select` is an interior
item there — it is simply spent on a gap: its trailing `px-2` (8) + `gap-2` (8) + the `⋯`'s internal
padding (14, being half of 44 − 16) puts **30 px between the word and the glyph** on a row whose
`flex-1` heading is already pushing them apart. That is the owner's "bit gap". So the orchestrator's
`-me-2` hypothesis is **adopted**, with one correction to its reasoning: it is not one alignment fix
that helps twice, it is one rule — *a trailing control cancels its trailing padding, so what you see
is where the layout ends* — with two different consequences in the two hosts. Also correcting an
earlier misread for the record: the `span` around `EnterSelectionButton` measuring **width 0 is
`display:contents` working as intended**, not a defect, and nothing here changes it.

---

## 2. The weight ladder — the rule to check the build against

> **In selection mode the band has exactly one loud element, and it is the action.**
>
> 1. **The bulk action** (`Delete from your places`, `Take out of this collection`) — the only
>    element with a container, the only `font-semibold`, the only colour that is not
>    foreground/muted.
> 2. **The count** (`3 selected`) — status. It gains weight from its *content*, never from chrome:
>    `text-foreground` once something is picked, `text-muted-foreground` at zero. Never bold, never
>    contained.
> 3. **The exit** (`Done` / `Cancel`) — `font-medium text-foreground`.
> 4. **The convenience** (`Select all` / `Clear`) — `font-medium text-muted-foreground`.
> 5. **The scope line** (the demoted heading, §4) — `text-caption text-muted-foreground`.

Three falsifiable checks a reviewer can run on a screenshot:

- **C1.** Exactly one element in the band is `font-semibold`, and it is the bulk action. `Done` and
  `Select all` are `font-medium`. (Today both are `font-semibold` and the action is not.)
- **C2.** No element ranked 2–5 is darker or heavier than the bulk action when the count is > 0.
- **C3.** `Select` (before) and `Done` (after) differ by **one step**, not three: muted → foreground
  at the same size and the same weight. The mode change must not change the register of its own
  controls.

---

## 3. Selection mode, rebuilt

### 3.1 Layout — Places, all four contexts identical

```
 ┌──────────────────────────────────────────────┐
 │ 59 places in your library              Done  │  row 1 — scope caption + the exit, in the
 │                                              │          slot `Select` just vacated
 │ 3 selected                      Select all   │  row 2 — status + convenience
 │ [ 🗑  Delete from your places ]              │  row 3 — the action, contained, auto width
 ├──────────────────────────────────────────────┤
 │ ☑ place rows …                               │
 └──────────────────────────────────────────────┘
```

Same three rows as today, so **no vertical cost** — and row 1 gets shorter, so the band is a few
pixels cheaper on a header the owner has already measured as too tall.

**`Done` moves into the heading row's trailing slot.** This is the change that answers "the
transition is weird". The control that leaves the mode appears in the exact place, at the exact
size, in the same colour family as the control that entered it: press `Select`, that slot becomes
`Done`. Nothing jumps to the other end of the screen and the user's finger is already there.

### 3.2 Exact classes

**`EnterSelectionButton` — `library-selection.tsx:210`.** One token: `ms-auto` → `-me-2`.

```
- 'ms-auto flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
+ '-me-2 flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
```

**New sibling `LeaveSelectionButton`, same file, deliberately the same shape one step darker:**

```tsx
export function LeaveSelectionButton({ onLeave, ref }: …) {
  return (
    <button
      type="button" ref={ref} onClick={onLeave} data-vaul-no-drag
      className={cn(
        '-me-2 flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        PRESS_ROW,
      )}
    >
      {LEAVE_SELECTION_LABEL}
    </button>
  );
}
```

Identical to `EnterSelectionButton` but for `text-foreground` and the label — that identity is the
point (C3), and it is why this is a second small component rather than a `variant` prop: the two are
rendered in the same slot by the same conditional and must be trivially diffable.

**`SelectionToolbar` — `library-selection.tsx:227`.** `Done` leaves the row; the two remaining items
lose `font-semibold`.

```tsx
<div className="flex items-center gap-2">
  <p aria-live="polite"
     className={cn('min-w-0 flex-1 text-sm font-medium',
       selection.count === 0 ? 'text-muted-foreground' : 'text-foreground')}>
    {selectionCountLabel(selection.count)}
  </p>
  <Button type="button" variant="ghost"
          className="-me-2 h-11 px-3 text-sm font-medium text-muted-foreground"
          onClick={selection.toggleAll} data-vaul-no-drag>
    {selectAllLabel(selection.allPicked)}
  </Button>
</div>
```

`flex-1` on the count is now doing real work — status leading, the one control trailing — rather than
padding a gap between two buttons. `-me-2` on `Select all` for the same reason as everywhere else:
its label lands on the column edge, under `Done`, over the search field's edge.

**`BulkDeleteControl`'s resting trigger — `library-selection.tsx:268`.** Give it a container and its
own ink.

```tsx
<Button
  type="button" variant="outline" size="lg"
  onClick={selection.openConfirm} disabled={selection.count === 0} data-vaul-no-drag
  className={cn(
    'h-11 gap-1.5 self-start px-3 text-sm font-semibold',
    'border-destructive/30 text-destructive',
    'hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive',
    PRESS_ROW,
  )}
>
  <Trash2 className="size-4" aria-hidden />
  {BULK_DELETE_LABEL}
</Button>
```

Four decisions in that block, each of which reverses something written down, so each is argued:

- **Red at rest.** `library-selection.tsx`'s current comment reads §2.3 as "red appears on this
  screen only inside an open confirm". `ux-collection-actions-2026-09-03.md` §6 generalised the same
  ruling as *"red at rest is reserved for the irreversible; every other removal is neutral at rest"*
  — and this is the product's one irreversible removal. Under the generalisation it qualifies, and
  the collection's `Take out` stays neutral for the same rule. Update the comment; do not leave two
  readings in the tree.
- **`outline`, not `destructive`.** `variant="destructive"` is the *confirm* button. Trigger and
  confirm rendering identically would flatten the escalation the confirm exists to provide, so the
  trigger is an outlined box with destructive ink and the confirm is the tinted fill.
- **The `outline` variant's mint hover is overridden.** `hover:border-brand hover:bg-primary/5
  hover:text-foreground` is house mint on a delete button. `cn` is tailwind-merge, so the three
  later `hover:` utilities win on the same properties — verify in the browser rather than assuming.
- **The matrix's `disabled:opacity-45` is left alone.** It is tempting to override it so the zero-
  picked state stops reading as dead, but `button.tsx`'s comments fix that step deliberately and one
  call site is not the place to fork it. The fix for "looks broken" is the **border**: a shape at 45 %
  still reads as a control that is waiting, where naked grey text at 45 % reads as nothing at all.
  If the built result still reads as dead, the next move is `border-border` at full opacity with
  muted ink, not a new opacity number — flag it back, do not invent it.
- **`self-start`, auto width, `h-11` — not full width.** `bulk-delete.ts`'s divergence table requires
  the library's bulk delete and the collection's bulk unlink not to look alike, and names *where the
  button is* as the first thing a thumb learns. Position already differs (band-top vs pinned-footer);
  keeping the library's compact and the collection's a full-width `h-12` slab keeps three axes of
  difference instead of one. See §6.

### 3.3 The three contexts that differ, and how

| Context | Difference |
|---|---|
| Places, 375 sheet | the reference layout above |
| Places, `lg+` ~292 px | identical. `Delete from your places` at `text-sm` in a `px-3` box is ~205 px — fits, `self-start`, does not wrap. No `BottomNav`, no bar to clear |
| Collection, 375 sheet | rows 1–2 as above with `Cancel` in place of `Done`; **no row 3** — its action is the pinned footer `Take out of this collection`, unchanged. The `⋯` stays hidden while selecting (§7.7) |
| Collection, `lg+` | as the collection sheet; heading is `<h1>`; footer has no bar to clear |

The collection's inline toolbar copy (`collection-content.tsx:821`) takes the same two edits — drop
`font-semibold` → `font-medium`, count goes `text-foreground` when > 0, `Cancel` moves up to the
heading row's trailing slot. **Preferred: import `SelectionToolbar` and stop maintaining the copy**,
since after this change the two rows are identical but for nothing at all. Acceptable minimum if that
is judged too wide: make the same edits in place and add a pointer to this section in both files.

---

## 4. Ruling: does `59 places in your library` stay while selecting?

**It stays, demoted.** Not deleted, not unchanged.

While `selecting`, the `<h2>` renders at `text-caption font-medium text-muted-foreground` and keeps
its text, its `key`, its `min-w-0 flex-1` and its `tabIndex={-1}`. Everything else about it is
untouched.

Why not delete it: the line is the only thing on screen naming **what set `Select all` acts on**. In
Places it is area-scoped (`18 in London`, plus `+3 more`), and `useLibrarySelection`'s own comment
makes the argument — *"a control that says `Select all` and picks places the user cannot see is a
count they cannot check."* Removing the scope statement at the exact moment a bulk control appears
is the wrong trade.

Why not leave it: at `text-xl font-extrabold text-foreground` it is the heaviest element on the whole
surface and it stays that way while selecting, sitting 8 px above a band that states a **different**
count. Two counts, and the loud one is the irrelevant one. That is precisely what the owner noticed.

Demoting fixes both and pays twice: the register change *is* the mode change, visible without
motion, and it gives back ~10 px of header. Accept the one-off height snap — no height transition
(layout thrash inside a scrolling sheet, for no information; same rule as
`ux-collection-actions-2026-09-03.md` §8).

**The collection heading does not demote.** It is an identity, not a status; there is no second count
competing with it (its action is pinned at the far end of the screen); and its `line-clamp-2` name
already sits at a modest `text-base font-bold`. State the divergence rather than hiding it.

---

## 5. The entry and exit, in order

**Entering (press `Select`):**

1. The trailing slot swaps `Select` → `Done` **in place, with no motion**. Same position, same box,
   same size; only the ink changes. Motion here would animate a thing that did not move.
2. The heading demotes (§4). Instant, no transition.
3. The search field and the filter bar are replaced by rows 2 and 3. These are new elements, so they
   get the product's `enter` beat and nothing else: `animate-in fade-in-0 duration-enter
   motion-safe:slide-in-from-top-1`. Under `prefers-reduced-motion` this collapses to **the opacity
   change alone, not to nothing** (`facelift-plan.md` §3a).
4. The list swaps to `SelectablePlaceRow`. No motion — a list that animates every row on a mode
   change is the animation §7 forbids.
5. **Focus moves to `Done`.** Today the pressed `Select` node is unmounted and focus falls to
   `<body>`. `Done` is the same slot, so this is continuity rather than a jump. Use `.focus()`; a
   pointer-initiated programmatic focus should not raise the `focus-visible` ring — verify at 375
   rather than assuming.

**Leaving (press `Done`, or a completed delete):** the exact inverse, and **focus returns to
`Select`** in the same slot. The collection already does this via `selectSlotRef` (`:397`); the
library must gain the same, and it is the same mechanism.

**Tab order while selecting:** heading (`tabIndex={-1}`, programmatic only) → `Done` → count
(`aria-live`, not focusable) → `Select all` → `Delete from your places` → the checkbox rows.

`aria-live="polite"` stays on the count exactly as it is. `data-vaul-no-drag` on every control in the
band, including the new `Done` and the new delete button — a press that begins on a control inside
the sheet is otherwise read as the start of a drag.

---

## 6. `Done` vs `Cancel`, and the two-removals rule — honest check

`bulk-delete.ts` rules the divergence: the library says `Done` (nothing is pending, so there is
nothing to cancel), the collection says `Cancel`. **The divergence survives this spec — and it is
weaker than it was, so say so now rather than discover it later.** After this change the two exits
occupy the same slot, at the same size, in the same paint, and differ by one word. One word is thin
ice for a safety mechanism, and a reader may well file it as an inconsistency bug.

**Recommendation: keep `Done`/`Cancel` for now, and do not treat this as the owner's decision to
make yet.** The safety the rule is actually protecting is the distinction between the two
*removals*, and that is carried by four things this spec strengthens rather than weakens:

| | library bulk delete | collection bulk unlink |
|---|---|---|
| where | band at the top of the list | pinned footer at the bottom |
| shape | compact `h-11`, auto width, `self-start` | full-width `h-12` slab |
| ink at rest | destructive (irreversible) | neutral outline (reversible) |
| confirm | body, `Cancel` first, autofocused | one line, confirm first, no autofocus |

If the owner ever reads `Done`/`Cancel` as a bug, the correct resolution is to unify on `Done` and
let the table above carry the whole divergence — not to re-diverge the removals.

---

## 7. The `Select` trigger's placement — the smaller half

Already given as a class change in §3.2. The rest of the reasoning:

- **`ms-auto` goes.** The single rule that decides the position is **`min-w-0 flex-1` on the
  heading**, which is already true at both call sites and is the written principle in
  `ux-collection-actions-2026-09-03.md` §2.1. `ms-auto` is a no-op today and a hazard tomorrow: it
  silently becomes the positioning rule for any host that forgets `flex-1`. `shrink-0` stays — it is
  what makes the heading the thing that truncates.
- **`-me-2`, logical, not `-mr-2`.** Half the library is Hebrew.
- **`px-2` stays** — it is the horizontal half of the 44 px target. The box stays ~50×44 and only
  moves. The leading `px-2` is deliberately *not* cancelled: that side faces a truncating heading and
  the 8 px is breathing room from an ellipsis.
- **Call sites untouched.** Both keep `flex items-center gap-2` and `min-w-0 flex-1`. Do **not** drop
  the collection's gap to `gap-1`: two heading rows with two gaps for one component is how this
  drifts back.

Measured predictions:

| Context | Today | After |
|---|---|---|
| Places, 375 | text ends 8 px inside the search field's edge | flush |
| Places, `lg+` ~292 px | same 8 px | flush; heading gains 8 px of truncation room |
| Collection, 375 | 30 px optical between `Select` and the `⋯` glyph | 22 px; heading gains 8 px |
| Collection, `lg+` | same 30 px | same 22 px |

**22 px is the intended answer to "one cluster or two?" — two.** `Select` changes what a *row* does;
`⋯` acts on the *collection*. They share a slot, not a job. 30 px reads as two things that lost each
other; ≤12 px would read as one segmented control; 22 px reads as two neighbours. No new token, no
per-host override.

**Baselines: do not fix.** `items-center` puts a 44 px box against a 28 px heading line, so the text
baselines differ by ~3 px. At 14 px muted against 20 px extrabold (Places) or 16 px bold
(collection) these are different registers and the eye resolves the small word against the heading's
optical centre, which is what `items-center` already gives. Both candidate fixes are worse: a
`translate-y` nudge is a magic number that would need **two** values because the two headings are
different sizes, and shifting the box up moves a 44 px hit area off the row's centre. One consequence
to name so it is not filed later: with a wrapped `line-clamp-2` collection name, both trailing
controls centre against the two-line block. That is intended — trailing controls belong to the
header, not to the first line of a title.

**Build check, not a claim I can make:** the button's box now ends 8 px past the content edge (x=363
of 375) in a column whose `overflow-y-auto` computes `overflow-x` to `auto`. The `⋯` has done exactly
this for weeks with no horizontal scrollbar, so this is expected to be a non-event — verify no
horizontal scroll at 375 and in the `lg+` panel, and that the 3 px `focus-visible` ring renders whole
(it lands in the 20 px gutter, well inside the sheet).

---

## 8. Strings

**Nothing is new, nothing is deleted, nothing is reworded.** Checked against
`voice-and-vocabulary.md` §3–§5.

| String | Where | Status |
|---|---|---|
| `Select` | heading row, before | existing `ENTER_SELECTION_LABEL` |
| `Done` | heading row, while selecting (library) | existing `LEAVE_SELECTION_LABEL`, **moved, not changed** |
| `Cancel` | heading row, while selecting (collection) | existing, moved |
| `None selected` / `3 selected` | count | existing `selectionCountLabel`; digits always |
| `Select all` / `Clear` | convenience | existing `selectAllLabel` |
| `Delete from your places` | the action | existing `BULK_DELETE_LABEL`, ratified verbatim by `ux-two-removals-one-screen.md` §3 |
| `Delete 3 places?` + body + `Delete` / `Deleting…` / `Cancel` | confirm | existing, unchanged |
| `Take out of this collection` | collection footer | existing, unchanged |
| `59 places in your library` / `18 in London` | scope line | existing, unchanged text — only its type changes |

None of these six surfaces is on §2's list, so the product name appears nowhere here. Correct.

---

## 9. Build order

Four pieces, **independently buildable and independently reviewable**:

- **A — the ladder.** Drop `font-semibold` → `font-medium` on both toolbar buttons in both files;
  count goes `text-foreground` at count > 0. Two files, six tokens. Ship this first: it alone fixes
  C1 and C3 and is the cheapest thing in the document.
- **B — the delete trigger's container and ink**, plus the comment correction about red at rest.
  `library-selection.tsx` only.
- **C — `Done`/`Cancel` into the heading slot**, the new `LeaveSelectionButton`, and the two focus
  moves. Touches both hosts; land it alone.
- **D — the `Select` trigger's `-me-2`.** One token, one file, all four contexts.

A and D are disjoint from each other and from B. C overlaps both hosts and should not run concurrently
with A.

---

## Not asked for

Nothing below is part of the fix. Listed so it can be rejected on sight rather than arriving inside a
diff.

1. **Deleting the `59 places in your library` line during selection.** Ruled against in §4, but it is
   the owner's own suggestion, so it is on the table: if they want it gone rather than demoted, the
   cost is that `Select all` acts on an unnamed set. Do not do it without them saying so.
2. **`aria-label="Select places"` on `EnterSelectionButton`.** Its accessible name is the bare word
   `Select`, which out of context does not say what is selected, where the `⋯` beside it names its
   object. This would be a **new screen-reader string** and would re-introduce the wording §7.1
   deleted. Recommendation: not in this task.
3. **Unifying `Done`/`Cancel`.** Argued in §6. Flagged, not proposed.
4. **A separator or a card around the band.** Rejected: containers are how this surface would become
   card soup, and after §3 the band already has exactly one contained element, which is the one that
   should be contained.
5. **Merging the count into the heading (`3 of 59 selected in London`).** Rejected: new string, and
   `ux-overwhelm-audit-2026-09-02.md` §7 just deleted the `12 of 32` counter for being the same idea.
6. **Cancelling trailing padding on `BulkDeleteControl`'s error `<p>` and the confirm block.** Not
   part of this; they are leading-aligned and already correct.
7. **Making `Delete from your places` full width.** Rejected in §3.2 — it would erode the two-removals
   divergence to a single axis. Noted because it is the obvious next suggestion.
