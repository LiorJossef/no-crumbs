# Handoff — the UI density session, 2026-09-02

> Written at `4bc04d0` on `no-crumbs-implementation`. **Read
> [`feedback-round-3-work-plan.md`](feedback-round-3-work-plan.md) §5.1 first** — it holds the ten
> owner rulings this session produced, and they are the reason the filter row must not be restarted
> from a blank slate.

## State

| | |
|---|---|
| Branch | `no-crumbs-implementation`, **17 commits** added this session |
| Working tree | **clean** |
| Tests | **3540 passing, 9 failing** (219 files) |
| `tsc --noEmit` | **4 errors**, the pre-existing typed-route `Link` baseline |
| Background work | **none running.** Two agents were stopped deliberately; both commits say so |

**The 9 failures are inherited, named, and must not be edited green.** They come from `abc1771`,
the stopped filter lane: three are real regressions it introduced (`token-call-sites.test.ts`),
one is `orphans-have-consumers` (`library-filter-bar.tsx` has no reachable consumer yet), and five
were written ahead of the code and describe behaviour that was never built. Make them pass by
building what they describe.

## The one finding worth carrying forward

**`cn()` was silently deleting every custom type size in the product** (`e4ad42b`). `tailwind-merge`
classifies a `text-*` utility by its value; anything it does not recognise as a size is filed as a
*colour*. So `text-micro` shared a conflict group with `text-brand`, the merge kept the last one,
and the size vanished:

    twMerge('text-micro font-semibold leading-4 text-brand')  →  text-micro DROPPED
    twMerge('text-caption text-muted-foreground')             →  text-caption DROPPED

This had been true for as long as those seven tokens existed, across 65 call sites. It looked local
because a plain `className` string never passes through the merge — 224 elements on `/map` rendered
correctly and only the composed ones broke. It surfaced only because the owner said the `Been` badge
"looks weird"; it was rendering at 16px against the 11px its component asked for.

`utils.ts` now names the seven sizes, and a test reads them out of `globals.css`, so adding a
`--text-*` token without registering it fails a test rather than quietly resizing something later.

**The lesson, because it generalises:** a class present in the source is not a class present on the
element. When something looks wrong and the source looks right, read the computed style.

## What landed

Import screens (loading screen 237px of slack → 0; three text blocks cut; the re-import notice
retinted; label weights). The collection header (up-link row gone, **1 → 2 visible place rows**).
The account menu (469 → 437px, 16 → 13 text lines). The Combobox primitive. The `cn()` fix. Wave 1's
two orphans, `4bc04d0`.

## What is unfinished, in the order I would take it

1. **The presentation deck.** Submission is **6 September**. `presentation-outline.md` is 207 lines
   of outline, not a deck. It is graded, it competes with no other lane for files, and it is the
   only item here that cannot be done in an hour on the day. **This is the highest risk on the
   board** and the UI-first ordering kept burying it, correctly, all session.
2. **Verify `4bc04d0` in a browser.** It has unit tests and a compile, not evidence. Open a card
   with two linked sources; actually delete places and read the rows back; both breakpoints; RTL.
3. **PR #109.** Seventeen commits from today are on the branch and none is on `main`.
4. **The filter row.** Start a FRESH agent — the last one accumulated ten corrections' worth of
   context and stopped converging. Give it §5.1's ten rulings and `abc1771`'s resume list, and
   nothing else.

## Two things the owner reported that are NOT diagnosed

- **Places seeming to disappear from the map under the category filter.** They then said it seemed
  to work on a retry. Looking at it, the map painted blank with a loading indicator while the peek
  row correctly read `58 in 3 countries` — which points at the basemap or the pin layer failing to
  paint, not the filter dropping rows. `matches` legitimately feeds both list and map, so *some*
  pins vanishing is by design. Needs the owner's own rows and a repro.
- **Menus not closing on select.** The owner checked and said they do not close. That behaviour was
  never built, so if anything closes it is incidental. §5.1 records the rule.

## What cost this session, so it is not repeated

**One lane took the whole day and produced nothing shippable.** The filter row absorbed ten
corrections and three build breaks. The cause was not the agent: **this product has no menu or
dropdown specification** — `facelift-plan.md` mentions a menu once, in a feature list, and
`no-crumbs-design-system.html` has no menu section. So every round invented a fresh answer with
nothing to anchor it, and each one was fairly rejected.

`docs/ux-menus-and-dropdowns.md` does not exist and should be written before the filter row is
resumed: trigger anatomy, row anatomy, the hover treatment with measured values, open/close and
focus rules, the mobile/desktop split, and sort as the case that looked binary and was not.

**And the owner was watching the same dev server the agents were editing.** `/map` served an error
page three times. Give each lane its own git worktree and port, or expect it again.
