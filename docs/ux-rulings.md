# UX rulings — the index

> Owner: UX / Interaction. Created **2026-08-30**. One line per ruling, plus where it is argued.
> This file **decides nothing**. It is a lookup so a ruling is not re-litigated by someone who could
> not find it. Where this index and the source document disagree, the source document wins.

## Standing rulings

| # | Ruling | Argued in |
|---|---|---|
| R1 | The map is the application shell, not a page inside a dashboard | `brand-and-product-foundation.md` §6 |
| R2 | A bottom bar with paged destinations — Map · Collections · Profile · create. Reverses "no tab bar" | `ux-navigation-structure-2026-08-29.md` banner |
| R3 | No bar that floats *over* the sheet: dead scroll zone at `half`, gesture conflict in the flick band | `ux-navigation-supplement-2026-08-29.md` §1 |
| R4 | The `＋` is one global create menu, present on every tab | `ux-import-flatten.md` §7 |
| R5 | The unit of list scope is a place **cluster**, never a rectangle | `ux-stable-area-list.md` |
| R6 | The list settles, it never tracks: recompute at `moveend` + 120 ms, nothing moves mid-gesture | `ux-stable-area-list.md` (the rule survived; `ux-map-is-the-query.md` §4's viewport-following did not) |
| R7 | `3 of 20` is retired; the library total appears nowhere on `/map` | `ux-map-is-the-query.md` §2.2 |
| R8 | Area label needs ≥70% of one normalised locality, else `this area` — decline to name rather than pick a spelling | `ux-map-is-the-query.md` §2.1 |
| R9 | Never build the `Search this area` pill | `ux-map-is-the-query.md` §8 |
| R10 | Ask only when the answer changes what we save | `ux-when-we-ask.md` §1 |
| R11 | The sentence explaining a question is derived from the real reason, never a fixed string | `ux-when-we-ask.md` §1 |
| R12 | Two shortlist entries within 75 m whose names contain one another are one row — collapse before asking | `ux-when-we-ask.md` §4 |
| R13 | The answer *is* the selection: one tap picks and opts in | `ux-when-we-ask.md` §7.1 |
| R14 | A card carrying a question starts unselected; no default is ever a silent auto-accept | `ux-when-we-ask.md` §6.3 |
| R15 | The card title is the name that will be saved | `ux-when-we-ask.md` §6.1 |
| R16 | One confident result collapses: no tickbox, no card chrome, the name as H1 | `ux-import-flatten.md` §3 |
| R17 | The confirm step itself is never removed (Charter §3 invariant 2) | `ux-import-flatten.md` §7 |
| R18 | "No places found" is a designed destination, not an error path — no "error", no retry | `spec-no-places-found.md` §1 |
| R19 | Never explain or defend the ~27% hit rate on that screen (owner ruling) | `spec-no-places-found.md` §1 |
| R20 | The caption is expanded by default there — it is the only content and the evidence for our claim | `spec-no-places-found.md` §4.2 |
| R21 | Place search costs one lookup per submit: no type-ahead, no keystroke search, no prefetch | `spec-no-places-found.md` §6.4 |
| R22 | A recovery only ever points somewhere that works — no greyed control, no "coming soon" | `spec-no-places-found.md` §5.4 |
| R23 | A place added from an import screen links the source TikTok and claims no caption-derived provenance | `spec-no-places-found.md` §6.8 |
| R24 | Location permission is asked on an explicit tap only, never on load; denial is a designed state | `ux-stable-area-list.md` near-me |
| R25 | Distance is displayed only against a real fix — never distance from a map centre | `ux-map-is-the-query.md` §6 |
| R26 | The list is the accessible representation of the map; pins are canvas and have no nodes | `ux-map-is-the-query.md` §7.2 |
| R27 | Live regions are search-driven; panning announces nothing | `ux-map-is-the-query.md` §7.1 |
| R28 | Every animation communicates progress, origin or spatial relationship, or it is deleted | `00-project-charter.md` §6 |
| R29 | Every animation ships a full `prefers-reduced-motion` **equivalent**, not a suppression | `spec-no-places-found.md` §8.4 |
| R30 | 44×44 minimum hit area everywhere, including glyph-sized controls | `spec-no-places-found.md` §8.3 |
| R31 | No nested interactive control inside a row's own button | `ux-library-at-scale.md` §3.1 |
| R32 | No second overlay: every view swaps the content of the surface it is already in | `ux-navigation-supplement-2026-08-29.md` §3 |
| R33 | Interpolated Hebrew content is `<bdi>` + `dir="auto"`; `line-clamp`, never `truncate` | `ux-when-we-ask.md` §12 |
| R34 | Logical properties only (`ps-`/`pe-`/`ms-`/`me-`/`text-start`) | `spec-no-places-found.md` §7.1 |
| R35 | Categories are a filter bar, not a destination | `ux-navigation-structure-2026-08-29.md` §3 |
| R36 | No `All` chip — nothing pressed *is* everything | `ux-category-filter-notes-2026-08-29.md` §5 |
| R37 | Facet counts are live and scoped to the other filters, not to the active area | `ux-category-filter-notes-2026-08-29.md` §2.5, §5 |
| R38 | Phone and desktop render the same filter bar | `ux-category-filter-notes-2026-08-29.md` §5 |
| R39 | An empty **collection** offers your recent places; an empty **library** offers nothing — suggesting places is recommendation | `ux-navigation-supplement-2026-08-29.md` §2 |
| R40 | The empty library opens on a regional map from the browser timezone: no IP lookup, no permission prompt | `ux-map-is-the-query.md` §5 |
| R41 | No illustration, mascot, carousel, checklist, gradient or `0 places` on any empty state | `ux-map-is-the-query.md` §5, `spec-no-places-found.md` §4.4 |
| R42 | Never convert uncertainty into certainty: an approximate pin says so, in the same place the user reads the name | `ux-import-flatten.md` §4 |
| R43 | One shell. A collection is a **scope** on the map, and the collections index is the sheet's list — never a page | `ux-collections-as-scope.md` §1 |
| R44 | Two layers maximum (shell → one pushed pane), and **exactly one back-shaped control on screen at any moment**; a route-level up control names its destination, it never says "back" | `ux-collections-as-scope.md` §2 |
| R45 | A context may only **add** to the canonical `PlaceDetail`, through its two slots — never reorder, rename or hide what it draws | `ux-collections-as-scope.md` §4 |
| R46 | The shell unification is **not** deferred behind the chrome work: the duplicate drawer and second map surface are what make the route feel like a separate app, which is the complaint itself (owner, 2026-08-30, closing `O13`) | `product-ruling-one-place-one-object.md` R4 |

## Open — with the owner unless stated

| # | Question | Argued in |
|---|---|---|
| O1 | **The product name.** Still open, still owed at `L1-F1-T1` | `brand-and-product-foundation.md` §3 |
| O2 | `NAV-ALT` — the only honest bar: resting chrome, peek stop deleted, `PEEK_PX` moved in four places. Multi-day, owner's call | `ux-navigation-supplement-2026-08-29.md` §1.5 |
| O3 | On `None of these` for a model-placed candidate: save the model's pin, or nothing? Recommendation: nothing, and say so | `ux-when-we-ask.md` §16 |
| O4 | Does `Add a place` deserve its own tap, or does `＋` open the field directly? | `ux-import-flatten.md` §8.1 |
| O5 | Widen the `preselect` band? 3 of 16 ask a question with 0 genuine ambiguities. Needs a measurement pass first | `ux-import-flatten.md` §8.2 |
| O6 | The word **"caption"** on screen, against `execution-plan` `L1-F4-T1`'s exit criterion. Flagged for overrule | `spec-no-places-found.md` §12 |
| O7 | `Show my places` vs the literal `Show all places`. Behaviour is settled either way | `ux-map-is-the-query.md` §10 |
| O8 | `EMPTY_LIBRARY_BOUNDS` is a guessed metro region for the zero-place camera and needs a ruling | `current-state.md` carry-forward |
| O9 | Dark-mode tokens are an unsigned first pass; light is final | `brand-and-product-foundation.md` change log |
| O10 | Manrope has no Hebrew subset — a second family is owed, product-wide | `spec-no-places-found.md` §7.3 |
| O11 | The uppercase tracked kicker has no Hebrew equivalent; an RTL chrome must carry it by weight and colour | `spec-no-places-found.md` §7.2 |
| O12 | Should the Elsewhere country→city grouping return somewhere (probably collections)? Deleted in `d9cbdf2`, one revert away | `current-state.md`, `ux-stable-area-list.md` header |
