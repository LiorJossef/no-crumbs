# Handoff — collection UI, the destructive red, the platform mark (2026-09-03)

> Branch `no-crumbs-implementation`. Read `current-state.md` after this, **not before** — two of its
> measured numbers are stale and are corrected below.

## Corrections to `current-state.md`, measured today, twice, by the orchestrator

| It says | Actually |
|---|---|
| `tsc --noEmit` — **4 errors**, "pre-existing baseline, confirmed at three separate commits" | **0 errors.** Measured at `bd31bbb` and again at `f71dd05` |
| Tests — **219 files, 3,540 passing and 9 FAILING**, "inherited from `abc1771`" | **231 files, 3,724 passing, 0 failing** at `f71dd05` |

Both were briefed to specialists as the baseline and both were contradicted by the specialists' own
runs before being re-checked here. Fix the table in `current-state.md` when next editing it.

## Committed

| Commit | What |
|---|---|
| `bd31bbb` | **Collection rows are library rows.** Photo, tags, `Been`, `Saved N ago` |
| `f253e49` → `5adb372` | **`--destructive` retuned.** Landed on `oklch(0.505 0.18 27.325)` / `#B52523` light, `oklch(0.73 0.14 22.216)` / `#F3817F` dark |
| `f71dd05` | **The platform mark draws TikTok's note.** Owner override of evidence `09`, recorded in that document's new §11 |

### `bd31bbb` — the one thing to know
Both surfaces already used the same `PlaceRow`; the divergence was the input. `collections-scope.tsx`'s
`toMapPlace` builds a pin from a `places` row alone, so there was no `detail` for the row to read a
photo or tags out of. The fix folds **the viewer's own** saved row back on, client-side, from the
library array the screen already holds. No new query, no new read path.
**A place another member added keeps the reduced form** — name and `Category · Locality`, no photo or
tags. That is deliberate: migration `0024` opens one read path into a shared collection and it
returns `places` only. Do not "fix" it without a policy that would return the other member's data.

### `5adb372` — why the red got bolder AND more legible
The old `#E7000B` failed AA in two places (`--card-2` 4.22:1, the destructive button's own tint
3.99:1). The new value is *more* saturated than the intermediate `f253e49` step yet clears AA on all
eight surfaces across both themes, because it goes **deeper rather than paler**. The token is never a
solid background — 46 of its uses are `text-destructive` — so text contrast is its whole budget.

### `f71dd05` — the reversal is recorded, not hidden
Evidence `09` §11 states the analysis still stands, that the override is **on scale not on law**, and
the condition on which it expires. **Do not delete evidence `09`.** The two-weight rule is dead — a
note has no outline form — so `PlatformMark`'s `variant` prop selects nothing. It was left in place
because `place-sheet.tsx` was checked out by an agent; `platform-mark.test.ts` pins the equality so
the removal cannot be forgotten. **That cleanup is owed.**

## UNCOMMITTED in the working tree — the state a fresh session inherits

Two workstreams, both green at `tsc` but **neither verified in a browser by the orchestrator**:

1. **Collection actions redesign** — `Select` promoted to the heading row, the `⋯` menu rebuilt on the
   shared panel material, the added-by chip strip replaced by an `Added by ⌄` filter matching
   `Been`/`Category`/`Tags`, and that panel material extracted to `src/components/ui/inline-menu.tsx`
   so the two menus cannot drift. Spec: `docs/ux-collection-actions-2026-09-03.md`.
2. **Selection band weight fix** — the band now has exactly one bold element and it is the action.
   Spec: `docs/ux-select-control-2026-09-03.md`.

**As of this file being written the second was still mid-build** (`Done` moving into the heading slot
across both Places hosts). If the tree is red, that is where to look.

### Owner decisions taken during the work, so they are not re-litigated
- **`Add places` stays mint.** Spec §7.5 proposed demoting it to `secondary`; the owner rejected that.
- **`Leave collection` stays red at rest** — `LEAVE_IS_DESTRUCTIVE_AT_REST` in `collection-content.tsx`.
  Still formally open; the owner asked to see both and then moved on. One boolean either way.

### Three spec errors found by measurement — do not re-introduce
- `-me-2` on `Select all` was arithmetic against the wrong padding. That control is `px-3`, so it
  lands 4px inside the column edge while `Select` (`px-2`) lands flush. **`-me-3` is the value.**
- The spec ranked the bulk action as needing to be "darker". Literally wrong — `Done` at
  `text-foreground` has higher contrast than the red. The action wins on **weight, container and hue**.
- tailwind-merge treats `dark:hover:bg-*` and `hover:bg-*` as **different keys**, so the spec's
  light-only overrides left the delete button with a grey `--input` border and grey hover fill in
  dark. The dark arm is required and is pinned by a test.

## Known-unfixed, named by the owner, not yet worked

1. **`half` shows less than one row.** Measured at 375×812: the sheet column is 377px, the header
   costs 238px and the bottom-nav clearance 68px, leaving **~70px** against rows that are 86–112px
   tall. `bd31bbb` made this worse by adding photos. Options weighed: hide the narrowing controls at
   `half` (recovers 132px, still under two rows), raise `HALF_FRACTION` from `0.55`, or — the
   orchestrator's preference — **auto-promote to `full` on scroll intent**, which removes the question
   instead of tuning it. The owner has not chosen.
2. **`place-desktop-panel.tsx` is a second copy of the Places header**, with its own
   `useLibrarySelection`, heading row and toolbar. It blocked a build today. Worth collapsing.
3. **Collection search matches names only**, not tags or locality. Folding first would make search work
   for your places and silently not for a collaborator's. Product call, deliberately left.
4. **`PlatformMark.variant` removal** — see above.

## Local environment
`demo@example.com` / `local-dev-preview-1234`. Demo owns all three collections; a temporary role swap
on "tel aviv food" made during this session **was restored**. The added-by filter needs ≥2 distinct
adders to render, which needs seeding.
