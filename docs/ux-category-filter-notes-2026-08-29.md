# The category filter bar — build notes

> **Status 2026-08-30: INTEGRATED.** The bar renders on both surfaces (`place-sheet.tsx:540`,
> `place-desktop-panel.tsx:135`), so §4 items 6 and 7 are discharged. **Still unverified, unchanged:**
> §4 items 1–5, 8 and 9 — nobody has seen this bar on a device, and item 3 (horizontal scroll versus
> vaul's drag) remains the highest risk. §2's four open questions are ruled in §5.
>
> Owner: Design System / Frontend. Date: **2026-08-29**. Task **LIBRARY-IA-3**.
>
> Specs implemented: `ux-library-at-scale.md` §1.3 (the bar) and
> `ux-navigation-structure-2026-08-29.md` §3 (categories are the bar, not a destination; the
> `Not been yet` merge).
>
> **I have no browser. Nothing below is a claim that anything renders correctly.** §4 says exactly
> what is unverified.

## 1. What was written

| File | What it is |
|---|---|
| `src/domain/places/category-filter.ts` | The facets (present categories + counts, ordered), the predicate, the toggle rule. Pure, no React, generic over the caller's place type the way `filterBySearch` is. |
| `src/components/sheet/category-filter-bar.tsx` | The presentational bar. No state, no data, no map. |
| `tests/unit/places/category-filter.test.ts` | 18 cases. |
| `tests/unit/sheet/category-filter-bar.test.ts` | 18 cases, rendered through `react-dom/server`. |

Nothing else was touched. `place-sheet.tsx`, `map-page-client.tsx` and `active-area.ts` are
untouched by me — they carry `NAV-1`'s edits only.

## 2. Decisions the spec did not settle

**2.1 There is no `All` chip, and §1.3 rule 5 asks for one.** This is the one place I did not do
what a spec said, so it is first.

Rule 5 says "`All` is a chip, first, selected by default". The nav ruling §3 then gives the first
slot to `Not been yet`, so `All` cannot be first anyway. Beyond the slot: in this product a pressed
chip means *this is narrowing your library* — `ActiveTagFilter`, `NotBeenFilterChip` and the detail
tag chips all say so — and an `All` chip would sit pressed in the one state where nothing is
narrowed, inverting that meaning at the head of a row that otherwise obeys it. Nothing pressed *is*
everything, and pressing the pressed chip clears, which is the model `toggleCategory` shares with
`TagFilter.onToggleTag`.

**The cost is real:** with no `All`, clearing a category means finding the pressed chip, which can
be scrolled out of view once a library has six or seven categories. If that proves wrong in use the
fix is scrolling the pressed chip into view, not an `All` chip. **This is a deviation from a binding
spec and should go back to `ux-interaction`, not be treated as settled by me.**

**2.2 Tie-break is `PRODUCT_CATEGORY_ORDER`, not alphabetical.** The brief said "count desc, then
name". Count desc is implemented; the tie-break is the product's declared render order instead,
because alphabetical on labels is a collation question — `Café` versus `Bakery` sorts differently
depending on the runtime's locale data, so the "chips never reorder" requirement would be broken by
the very rule meant to guarantee it. `PRODUCT_CATEGORY_ORDER` is a total order the domain already
declares, and declares for this exact purpose ("a filter row, a legend"). Same library, same bar,
every runtime.

**2.3 Facets are counted, never enumerated — and that is the whole answer to the parity gap.** The
brief's constraint was "do not let the 7-vs-8 gap produce a chip for a category nothing can ever
have". The bar is built by counting the places in front of it, so a category with no places has no
facet and therefore no chip, whatever the two vocabularies do to each other later. The gap itself
(`product-backlog-2026-08-29.md` §1.1) is untouched.

**2.4 An unreadable category counts as `other` / "Place".** `productCategoryFor` already resolves an
unparseable override to `other`, and `categoryDisplay` already prints "Place" for an unknown value.
A row that reads "Place" has to be counted under the chip that says "Place", or the bar contradicts
the list it summarises. `matchesCategory('coffee_shop', 'cafe')` is `false` and
`matchesCategory('coffee_shop', 'other')` is `true` — asserted.

**2.5 What the facets should be counted over.** Recommended, and written into the module header:
count over the library narrowed by the **other** filters (tag, visit, search) but **not** by the
category itself, and pass the active category as `keepCategory`. That makes every count a true
statement of what pressing the chip produces (§1.3 rule 2), and the pin keeps the pressed chip on
screen at a count of 0 when a search empties it — a pressed chip that vanishes is a filter with no
way out. Consequence, stated rather than hidden: **counts and chip order move as you type**, because
they are live. I judged a moving-but-true count better than a stable lie.

Scoping the counts to the *active area* (a literal reading of §1.3 rule 2) was rejected: the map is
not area-scoped, so an area-scoped count would disagree with the pins the same tap produces.

**2.6 One category present ⇒ no category chips, but the row still renders.** A `Restaurant 12` chip
in a library of twelve restaurants is a control whose pressed and unpressed states show the same
twelve rows. The row itself stays, because `Not been yet` is in it and that filter has nothing to do
with how many categories the library happens to hold — hiding the row would delete a shipped control
for anyone whose library is all one kind of place. Zero facets ⇒ nothing at all.

**2.7 A colour dot, no glyph.** The brief said "colours/glyphs from `category-display.ts`"; there are
no glyphs in that file. They live in `components/map/marker-style.ts`, which states that the label
and colour are shared and *"only the glyph is the map's own"*, and which is `maps-geospatial`'s
directory. So the chip carries the pin's colour as a 8 px dot — the same thing `collection-cover.tsx`
does — and no glyph. On a pressed chip the dot switches to `bg-current` rather than the category
colour, because `other` is house mint and the pressed fill is mint, so its dot would otherwise
disappear into the fill. Same box in both states, so pressing a chip never shifts its neighbours.

**2.8 The `Not been yet` chip is rebuilt, not composed.** `NotBeenFilterChip` brings its own
`Showing` kicker and its own `min-h-9`, neither of which survives the move into a scroll row. The bar
rebuilds it from the same tokens and the **same string** (`NOT_BEEN_FILTER_LABEL`), keeping the state
model verbatim. The `Showing` kicker is gone; the group's accessible name carries the job now.
**Corrected 2026-08-30:** the desktop panel now renders this bar too, so `visit-state.tsx`'s 36 px
`NotBeenFilterChip` has no caller left and *is* dead code — a clean delete, not a thing to preserve.

**2.9 Only `Not been yet` grows an `×` when pressed.** The detail tag chips have no `×`; the two
standalone pills do. In a row of many chips the tag-chip precedent applies, so category chips rely on
`aria-pressed` and the fill alone, and the visit chip keeps the `×` it already had. The cost is that
pressing the visit chip shifts every chip to its right by ~18 px. That is existing behaviour moved to
a place where it now has neighbours; it is a small inconsistency inside one row and
`ux-interaction` may want it resolved either way.

**2.10 The bar's accessible name is `Filter your places`.** New string. `role="group"` is §1.3 rule 4;
the name is not specified anywhere. It names no mechanism (`ux-architecture.md` §12).

## 3. What I ran

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx eslint` on the four new files | exit 0, no output |
| `bash scripts/check-layer-guard.sh` | exit 0, every assertion `OK` |
| `npx vitest run tests/unit/places/category-filter.test.ts` | 18 passed |
| `npx vitest run tests/unit/sheet/category-filter-bar.test.ts` | 18 passed |
| `npx vitest run` (whole suite) | **84 files, 1527 tests, all passed** |

The component tests render through `react-dom/server` and assert on static markup: vitest runs in a
`node` environment here, there is no jsdom and no testing library, and `vitest.config.ts` collects
only `*.test.ts`, so the component is driven through `createElement` rather than JSX and the config
is unchanged. That is enough to check the accessibility contract, which chips exist for which facets,
and the pressed states. It is not a rendering.

## 4. What I did **not** verify — read this before believing anything above

1. **Nothing was seen on a screen.** No browser, no dev server, no screenshot. Neither 390×844 nor
   1440×900. I do not know that it looks right.
2. **The 44 px floor is asserted as a class name (`min-h-11`), not as a measured box.** `text-xs` on a
   `min-h-11` chip is a taller pill than anything else in the sheet's header block; whether that
   reads as right beside a 36 px search field is a visual judgement nobody has made yet.
3. **The horizontal scroll versus the sheet's vertical drag is unproven.** `data-vaul-no-drag`,
   `overflow-x-auto` and `overscroll-x-contain` are present and asserted in the markup. Whether vaul
   actually lets a horizontal swipe through without moving the sheet, on a real touch device, is
   exactly the kind of thing that only shows up in use. **This is the highest-risk unverified item.**
4. **Whether the focus ring is clipped.** The container carries `-m-1 p-1` so the 3 px ring sits
   inside the scroll box. Untested against a real overflow container.
5. **Whether the pressed chip can end up scrolled out of view**, which is §2.1's residual cost. No
   measurement of how many chips fit at 390 px.
6. **Integration** — *discharged 2026-08-30.* Wired on both surfaces; the heading counts it.
7. **The phone/desktop split** — *discharged 2026-08-30.* Both render the same bar (§5 rule 4).
8. **RTL.** A Hebrew library still has English category labels, so the chip text is Latin either way,
   but I have not looked at what the row does under `dir="rtl"`.
9. **60 fps.** No measurement. `CHIP_PRESSABLE`'s only animation is `transition-colors`, which does
   not trigger layout, and the bar re-renders on every keystroke if the counts are live (§2.5) — at
   the handful of chips this produces that should be free, but "should be" is not a measurement.

## 5. `ux-interaction`'s rulings on §2 — 2026-08-30

1. **No `All` chip. §1.3 rule 5 is withdrawn.** §2.1's argument is correct: nothing pressed *is*
   everything, and a pressed `All` would invert the one meaning every chip in this product shares.
   The residual cost is real and the fix is scrolling the pressed chip into view, never a new chip.
2. **Tie-break stays `PRODUCT_CATEGORY_ORDER` (§2.2), and counts stay live (§2.5).** A count that
   moves as you type is true; a stable one is a lie about what pressing the chip produces.
3. **Only `Not been yet` keeps its `×` (§2.9).** The ~18 px shift is accepted. Uniform `×`es would
   put four dismiss glyphs in a scroll row; removing it would break a shipped control's clear path.
4. **Phone and desktop render the same bar.** Same facets, same order, same strings. A filter that
   exists on one breakpoint and not the other is two products.
