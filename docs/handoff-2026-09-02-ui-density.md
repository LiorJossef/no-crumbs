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

## New owner feedback, raised at the close of the session — not started

**Loading states are missing where data is fetched.** Owner, 2026-09-02: *"add loaders for when
loading data i think it should happen between switching from map to collections, and maybe other
places"* — then, immediately, *"not now"*. So this is **logged as feedback, deliberately not
built**, and it is new scope rather than a defect from any lane.

The named case is the **Places → Collections switch**, which fetches. The owner's "and maybe other
places" is the real work: nobody has surveyed which transitions in this product fetch and which of
those show nothing while they do. That survey is the first task, not the loaders — a skeleton added
to the one screen that was mentioned would leave the rest of the pattern undecided, and this product
has just paid a full day for building a control that had no written pattern behind it (see the
closing section).

Worth knowing before it is picked up: the session saw `/map` paint **blank with a loading indicator
while the peek row already read `58 in 3 countries`** — which is the same family of problem from the
other side, a surface that has its data and still shows nothing useful. Whoever takes this should
treat the two together.

There is no loading/skeleton pattern in `facelift-plan.md` or `no-crumbs-design-system.html`, so
this needs a written pattern first, exactly like `ux-menus-and-dropdowns.md`.

## Owner-reported, open, and first up next session

**The `Select` control is in a really weird position.** Owner, 2026-09-02, at the end of the
session: *"the select of the places is in really wierd position we will handle that next session."*
It arrived with `4bc04d0` — multi-select for bulk delete — and it currently sits at the head of the
filter row, ahead of `Been`, which puts a mode switch in a band that is otherwise all narrowing
controls. **Nobody has designed where it goes.** It was never specified: the brief asked for
multi-select and said the two removal semantics must stay distinct, and said nothing about placement.
Deferred by the owner to the next session, deliberately — this is a note, not a defect report, and
the control works.

Worth pairing with §5.1's ruling that the header is two rows on purpose — the first narrows the
library, the second reorders it. `Select` does neither: it changes what tapping a row *means*. That
is a third kind of thing and it probably wants a third home, not a slot beside `Tags`.

## The neutral source glyph — four candidates drawn, none chosen

Owner: *"Try changing the current neutral TikTok/source glyph. I don't like how it looks right now."*

`PlatformMark` draws a portrait video frame with a play triangle. Four alternatives were rendered
at 14px, 20px and on the mint CTA, in a scratch file (not committed): the current mark, a play in a
circle, a play in a rounded square, and a bare play triangle. **The owner has not picked one**, so
nothing changed in `src/`.

The constraints any replacement inherits, from `platform-mark.tsx`'s own docblock and E9: no TikTok
geometry and no redraw of it, `currentColor` only — both TikTok pigments are fenced by value across
`src/` and measured unusable anyway (cyan is 1.03:1 on the mint tile) — Lucide's construction for
the outline weight so it does not outweigh the glyphs beside it, and the solid weight reserved for
the three enumerated CTAs. `platform-mark.test.ts` enforces that the mark is drawn in exactly one
file, which is what makes swapping it a one-file change.

**The owner asked twice about using TikTok's real vector logo.** The answer is still no and it is not
a design question: E9 judges all four placements and refuses the mark on every one, on TikTok's own
published sentence. The downloadable developer logo pack is not a licence — it ships no terms, it is
black-and-white only, and it is staged for Login Kit / Share Kit integrations we do not have. The
route to the real mark is a written request to TikTok (E9 §7.1), which nobody may file without the
owner's decision.

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
