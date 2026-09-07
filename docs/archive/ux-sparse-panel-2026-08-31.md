# The sparse desktop panel — ruling

> Task `i5-sparse-panel`, escalated by a lane that correctly declined to settle it unilaterally.
> Scope of this document only: `docs/ux-sparse-panel-2026-08-31.md`. No source was read to modify —
> `collections-index-list.tsx`, `place-desktop-panel.tsx`, `place-sheet.tsx` and `map-shell.tsx` were
> read for reference only, at the working tree's current state.

## The question

**Should `MapShell`'s desktop side panel look different when it holds one or two rows than when it
holds thirty?**

## The ruling

**No. The panel is furniture, and furniture does not resize itself because today's list is short.**
Do not shrink-wrap it, centre it, cap its height, or otherwise give it a second layout personality
for a small collection count. 63.3% empty at 0 collections and 66.0% at 1 are not the defect they
look like — see reasoning below.

**But the *zero-collection* state has a real, narrow bug, unrelated to how much of the panel it
fills: the one action available in it is styled as if it were a minor row among many, when at zero
collections it is the only thing on the screen below the heading.** That is fixable today without
touching the panel's frame, its height logic, or anything about the 1-vs-30 question. Acceptance
criteria are in §3.

Nothing else changes. No decorative content, no repositioning of the list, no new copy beyond what
§3 specifies.

## 1. Why the panel is right as a persistent, size-invariant container

**The furniture argument, stated precisely.** `MapShell`'s left column is not a message screen; it
is navigation chrome that is present on every `/map` scope — places, the collections index, one open
collection — drawn identically by the same component for all three (`place-desktop-panel.tsx`'s own
header: *"the frame ... belongs to `MapShell`, which draws the identical column for every scope"*).
A sidebar's job is to be *where things are*, reliably, independent of how many things there
currently are. Mail with one message in the inbox, Photos with three photos in an album — the list
pane does not shrink to hug three thumbnails, because a user who adds a fourth expects it to appear
where the first three were, not to watch the whole container change shape under it. A panel that
shrink-wraps at 1 row and expands at 30 has two personalities, and the frame that resizes when
content crosses some threshold is a worse product than one that holds its promise still.

**This is not the same defect finding 12 already fixed.** The 87% → 63.3%/66.0% improvement came
from deleting a standalone header and a redundant back-link row — dead chrome, removed because it
said nothing. That is a different claim from "the panel should be shorter when the list is short."
Emptiness in a container whose size is a *promise about where content will appear* (the panel) is
not the same defect as emptiness in a message screen that has finished saying what it has to say
(`error.tsx`, `not-found.tsx`, the no-places screen) — the latter is dead space because there is
nothing left to arrive; the former is dead space because not much has arrived *yet*, into a space
that is sized for what usually does. Re-filing the same number against both is what keeps this
un-fixed report circulating.

**The product's own places panel already treats this exact case as correct, on this exact page.**
At zero saved places, `PlaceDesktopPanel` renders the heading, one line of copy
(`EmptyLibraryLine`), and the `Add a TikTok` button — then stops. No search field (an inert one is
"a false affordance" by the component's own comment), no filter bar, no attempt to fill the column.
That is the *identical* shape as the collections index at zero collections, and nobody has proposed
resizing the places panel for a one-place library. The two scopes are drawn by the same component
family on purpose (`ux-collections-as-scope.md`'s whole argument); treating one of them differently
by row count would reintroduce the second layout strategy this project spent 2026-08-31 removing
from `error.tsx`/`not-found.tsx`.

**What I rejected, and why:**

- *Shrink-wrap or cap the collections column's height.* Ruled out already, correctly, before this
  escalation — it makes the column behave differently for collections than for places for no reason
  specific to collections (per the dispatch). I have nothing to add against that reasoning; it holds.
- *Put something decorative in the space* (an illustration, a bigger icon, a quote, generic
  "get started" filler). Fails the stated bar directly — filling space is not the goal, and Charter
  §6's banned aesthetic is exactly this move dressed as a fix. Nothing here earns a place by being
  present; it would earn a place by being useful, and nothing on offer clears that bar (see the next
  point).
- *Move the list to a different vertical position in the column* (e.g., centre it, or float it lower
  against the bottom). No content-based argument supports this — the list's top position is not
  itself the problem, and moving it would put the collections panel out of step with the sheet's own
  top-anchored list and with the places panel beside it, at zero cost benefit. Rejected.
- *Surface something else useful — recently viewed places, suggestions, library stats.* This is the
  candidate genuinely worth building, and I am not proposing it. It is a new feature with its own
  data requirements and its own honesty obligations (a "recently viewed" rail needs a real signal
  behind it, not an invented one — the same rule that keeps the review screen from inventing a
  confidence number). It does not belong in a task scoped to a layout question, and nothing in
  `execution-plan.md` currently owns it. Naming it here so it is not silently lost: **a candidate for
  a Future item, not for this fix.**

## 2. What's actually wrong, and it isn't the emptiness

Compare the two zero-content states this panel can be in, side by side, both currently shipped:

| | Zero saved places (`PlaceDesktopPanel` → `NoPlacesYet`) | Zero collections (`CollectionsIndexList` → `EmptyIndex`) |
|---|---|---|
| Heading | `Your map starts here.` | `Collections` (unchanged — the index's own title, not a per-state heading) |
| Body line | `Paste a TikTok link and the places it talks about land on your map.` | `Nothing collected yet.` / `A collection is a set of places you can share with one other person.` |
| The one action | Solid `Button`, `h-12 w-full`, bold, `PlatformMark` icon, primary CTA styling — `bg-primary text-primary-foreground`, the same class the `＋` menu's own submit buttons use | A **dashed-border, muted-foreground row** — `border-dashed border-border`, `text-muted-foreground`, a `Plus` icon in a grey circle badge, `hover:bg-muted/50` |

The right column's control is not styled as a call to action anywhere in the product's system —
`brand-and-product-foundation.md` §5's CTA row is explicit: *"Primary buttons are solid mint-400
with `ink-on-mint` text, bold... Secondary/toggle actions are plain text, muted by default."* The
dashed muted row matches neither description; visually it reads as an inert placeholder — the kind
of "existing item that doesn't quite count yet" affordance appropriate for "add one more" *inside an
existing list*. That reading is correct at 3 collections, where the row sits under two real rows and
genuinely is "add one more." **It stops being correct at 0 collections, where it is the only
interactive thing in the entire panel below the static `Collections` heading** and is currently
presented with less visual weight than a filter chip.

This is not a new judgement invented for this task — it is the same parity rule the codebase already
applies to every other paired control on this page (`PlaceRow`, `CategoryFilterBar`, `SortControl`
are explicitly shared between the sheet and the panel "because a control on one and not the other is
a half-finished surface," per `place-desktop-panel.tsx`'s own comments). Applying that rule across
the places/collections seam rather than only within it: the primary action on a *first-run, nothing
here yet* screen gets the solid CTA treatment on one side of this column and does not on the other,
for no reason specific to collections.

There is already a working precedent for exactly this button, one step later in the same flow: the
`＋` menu's `NewCollectionPane` (`add-sheet.tsx`) submits with a plain default-variant `Button`,
`h-12 w-full rounded-lg text-base font-bold`, label `Create` — the composer *inside*
`CollectionsIndexList` already matches it (`collections-index-list.tsx`'s own `composing` branch
uses the same default `Button`). **The gap is only the entry point before that** — the dashed row
that opens the composer — and only in its zero-collections state.

## 3. Acceptance criteria

Scoped to `CollectionsIndexList` (`src/app/map/collections-index-list.tsx`), the entry-point control
that opens the create-collection composer (currently the `<button>` at the bottom of the `!composing`
branch, the one wrapping the `Plus`-in-circle badge and the `New collection` label).

1. **When `collections.length === 0`** (the `EmptyIndex` branch renders): the entry-point control
   renders with the product's primary CTA treatment — the same `Button` component and `default`
   variant used by `NoPlacesYet`'s `Add a TikTok` button and by this same file's own `composing`
   form's `Create` button. Concretely: solid fill (`bg-primary`/`ink-on-mint` text), bold label,
   `h-12`, full width, the shared radius token, no dashed border, no `muted-foreground` text or icon
   tint.
2. **When `collections.length > 0`** (one or more real rows above it, in `Section`): the control's
   current styling — the dashed-border, muted, in-list row — is unchanged. This is the "add one
   more" reading and it is correct once there is something to add one more *to*.
3. **Label unchanged: `New collection`.** No trailing arrow — the arrow in
   `brand-and-product-foundation.md` §5 marks a full-screen form's single submit action
   (`Sign in →`); this is a list-entry control, and `Add a TikTok` and `Create` are the closer
   precedents, neither of which carries one. An icon may stay (a leading `Plus`, matching the visual
   family of the other primary-CTA icons in this product — `PlatformMark` on `Add a TikTok`) or may
   be dropped to match `Create`'s icon-free precedent exactly; either is acceptable, and whichever is
   chosen should match the icon-or-not pattern of the `Create` button one screen later, not invent a
   third.
4. **No change to `EmptyIndex`'s two lines of copy.** They already state what a collection is and
   why there is nothing here — `voice-and-vocabulary.md`-clean, matter-of-fact, no apology. Not in
   scope.
5. **No change to panel height, panel width, scroll container height, or any `STOP_TO_CONTENT_HEIGHT`
   value.** This fix changes one control's visual weight; it does not change how much of the panel is
   empty, and should not be expected to move the 63.3%/66.0% figures. That is by design — see §1.
6. **No change to the mobile sheet's equivalent state**, unless the same asymmetry is confirmed
   there against `PlaceSheet`'s own zero-places treatment — out of scope for this ruling, flagged for
   whoever picks this up: check `CollectionsIndexList`'s `stop !== undefined` render path against
   `PlaceSheet`'s `NoPlacesYet` for the same parity question before assuming it already matches.

## 4. The one-line answer for the product owner

The 63%/66% number is not a bug and will not go to zero by design — a persistent navigation panel is
sized for what it usually holds, not for what it holds today, and that is correct product behaviour,
not an unfinished fix. What *is* fixable, cheaply, and worth fixing is that the zero-collection
screen's one action currently looks like a minor row instead of the primary thing to do — a real,
narrow defect, orthogonal to how much of the panel is empty.
