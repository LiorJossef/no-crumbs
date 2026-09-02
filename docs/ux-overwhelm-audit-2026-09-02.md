# The overwhelm audit — a count of what is on screen, and what to delete

> **Read-only audit, written 2026-09-02 against `no-crumbs-implementation` at `1632b3a`.**
> `ux-interaction` wrote it; nothing was run and no source file was touched. Every count below is
> read out of the source at the file:line given, not measured in a browser — where a pixel number
> appears it is marked **ESTIMATE** or quoted from an existing measured doc.
>
> **The owner's instruction it answers, verbatim (2026-09-02):** *"top priority is that the ui will
> feel nice and friendly and not overwhelming by a lot of tags or buttons or texts."*
>
> **Where the sheet files actually live.** `place-sheet.tsx`, `place-desktop-panel.tsx`,
> `category-filter-bar.tsx`, `place-enrichment.tsx`, `saved-place-edits.tsx` and `visit-state.tsx`
> are all in **`src/components/sheet/`**. Every reference below is to the real path.
>
> **Correction, orchestrator, 2026-09-02.** An earlier draft of this note claimed the paths in
> `feedback-round-3-work-plan.md` and `ux-visit-filter-and-chip-density-2026-09-02.md` were stale.
> Checked: **they are not.** Those two documents cite the sheet files by *bare filename*
> (`place-sheet.tsx:2342`, `category-filter-bar.tsx:197`), which resolves fine, and every
> directory-qualified path they give — `src/ui/place/tag-filter.ts`, `src/ui/place/visit-state.ts`,
> `src/components/map/filter-places.ts`, `src/app/map/map-page-client.tsx` — exists. The only wrong
> qualified paths were in this file's own header, and they are fixed above. Note the one genuine
> trap the bare filenames leave: **`visit-state` is two different files** —
> `src/ui/place/visit-state.ts` (the logic) and `src/components/sheet/visit-state.tsx` (the
> component).

---

## 0. The finding in one paragraph

The product has **one shape** — a 44 px pressable pill — and it uses it for **six different
meanings** stacked in one column: visit state, category, sort order, tag, active-tag dismissal, and
(inside a place) tag-as-label. At rest on a phone, before the first place, the sheet header renders
**up to 19 pressable pills in four rows**, all the same size, all the same radius, two of them
filled mint at rest for two unrelated reasons. That is the overwhelm. It is not solved by spacing,
and it is only half-solved by collapsing the category row: the other half is that **a row of chips
is the product's only answer to every question**, and three of the four rows can be deleted or
demoted outright without losing a capability.

The second finding is cheaper and larger: **the product explains itself constantly**. There are
**23 distinct blocks of explanatory or provenance text** across the five surfaces below, and 11 of
them restate a fact the adjacent control or line already carries. Text removal is the whole of §7's
top five and costs under four hours in total.

---

## 1. The places sheet header

Hosts: `src/components/sheet/place-sheet.tsx` `PlaceList` (:330-650) at 390×844;
`src/components/sheet/place-desktop-panel.tsx` (:139-226) at 1440×900. They render the *same*
controls in the same order, so every count here is both breakpoints unless stated.

### 1a. The census, at rest, top to bottom

| # | What | file:line | Kind | 390×844 | 1440×900 |
|---|---|---|---|---|---|
| 1 | Area heading `18 places in Tel Aviv-Yafo` | `place-sheet.tsx:530-535` / `place-desktop-panel.tsx:156-161` | text | 1 | 1 |
| 2 | `Add a TikTok link` full-width mint button | — | control | — | 1 (`place-desktop-panel.tsx:163-172`) |
| 3 | Search field, placeholder `Search your places` | `place-sheet.tsx:541`, component `:1437-1502`, label `:1444` | control + placeholder text | 1 | 1 |
| 4 | Clear-field `×` inside the search box | `place-sheet.tsx:1479-1500` | control (conditional on text) | 0–1 | 0–1 |
| 5 | `12 of 32` result count | `place-sheet.tsx:542-551`, component `:1530-1548` | text (`aria-hidden`, `:1545`) | 0–1 | 0–1 |
| 6 | `Not been yet` chip, with an `×` glyph when pressed | `category-filter-bar.tsx:202-215`, glyph `:213` | control | 0–1 | 0–1 |
| 7 | Category chips — dot + label + count | `category-filter-bar.tsx:217-225`, anatomy `:289-300` | controls | 0–3 | 0–3 |
| 8 | Sort chips — `Recently saved` · `Nearest` · `A–Z` | `place-sheet.tsx:579-581`, component `:728-759`, labels `:1661-1665` | controls | 2–3 | 2–3 |
| 9 | Tag facet chips — label + count | `place-sheet.tsx:586`, component `place-enrichment.tsx:264-369`, cap `ui/place/tag-filter.ts:114` | controls | 0–12 | 0–12 |
| 10 | `TAGGED` kicker | `place-enrichment.tsx:403` | text | 0–1 | 0–1 |
| 11 | Active-tag pill + `×` | `place-enrichment.tsx:404-419` | control | 0–1 | 0–1 |
| 12 | `heading.note` line | `place-sheet.tsx:592-594` / `place-desktop-panel.tsx:223-225` | text | 0–1 | 0–1 |
| 13 | `Clear search` button (in scroll, empty-result state) | `place-sheet.tsx:620-622`, component `:1553-1565` | control | 0–1 | 0–1 |
| 14 | `Everywhere else` section heading | `place-sheet.tsx:1610-1615` | text | 0–1 | 0–1 |

**Totals at rest, nothing filtering, a library with 3 categories and ≥6 shared tags:** 1 heading +
1 field + 1 visit chip + 3 category chips + 3 sort chips + up to 12 tag chips = **19 pressable
pills and 2 text lines before the first place**, in **four separate horizontally-scrolling or
wrapping rows** (`category-filter-bar.tsx:197`, `place-sheet.tsx:744`, `place-enrichment.tsx:326`).
r5 measured this band at **372 px, 41 % of the viewport** — quoted in
`ux-visit-filter-and-chip-density-2026-09-02.md:29-30`; `8fd2e27`'s tag floor
(`ui/place/tag-filter.ts:138`) has since removed the singleton chips but not the row.

### 1b. What is redundant, decorative, or restates the UI

- **The sort row is the worst object in the header and no document has named it.** It is 2–3 pills
  in `CHIP_PRESSABLE` + `min-h-11` (`place-sheet.tsx:752`) — byte-identical to the category chips
  above it — and **one of them is always pressed**, because a sort control always has a current
  value (`place-enrichment.tsx:120-123` says so in writing). So at rest the header shows two filled
  mint-family pills that mean two unrelated things: a pressed category chip means *this is narrowing
  your library* (`category-filter-bar.tsx:37-44` states that rule as law), and a pressed sort chip
  means *this is the order you are in*. `ux-visit-filter-and-chip-density-2026-09-02.md:242` raises
  exactly this "two interaction models in one row" objection against the visit filter, and misses
  that the sort row already commits it.
- **`12 of 32` (`:1530-1548`) restates a count that is already on screen twice** — the heading above
  it carries `heading.count` (`:478-492`) and the list below it is the evidence. It is
  `aria-hidden`, so it exists for sighted users only, i.e. purely as visual noise in the one band
  the complaint is about.
- **Every chip carries a number.** Category (`category-filter-bar.tsx:300`), tag
  (`place-enrichment.tsx:364`). On a 3-category, 6-tag library that is 9 numerals in the band, and
  the unpressed ones answer a question nobody asked yet.
- **The `×` inside the pressed `Not been yet` chip** (`category-filter-bar.tsx:213`) is `aria-hidden`
  decoration with a dismissal glyph's affordance and no dismissal control — already filed as D3 in
  `ux-visit-filter-and-chip-density-2026-09-02.md:50`.
- **`Everywhere else` (`:1613-1615`)** is a heading over rows that behave identically to the rows
  above it; its own docblock (`:1580-1584`) concedes it is no longer a control.

### 1c. Proposals, per item

| Item | Proposal |
|---|---|
| 8 sort row | **Demote to one trigger, or gate it.** Cheapest honest version: render only when the list is long enough for order to matter — wrap `place-sheet.tsx:579` and `place-desktop-panel.tsx:216` in `places.length + otherPlaces.length >= 8`. A 5-place library gets its 44 px row and 3 pills back and loses nothing. Full version: one `Sort: Recently saved ▾` trigger in the same inline-disclosure shape §3 of `ux-visit-filter-and-chip-density-2026-09-02.md` specifies for categories. |
| 5 result count | **Delete.** `place-sheet.tsx:542-551` and `place-desktop-panel.tsx:181-190`. The live region (`map-shell.tsx`) already speaks it, which was the component's own stated justification for being `aria-hidden`; with the heading carrying a count and `Clear search` carrying the escape, the number is the third statement of one fact. |
| 9 tag row | **`MAX_TAG_FACETS` 12 → 6**, `ui/place/tag-filter.ts:114`. One constant. At 12 the row is a vocabulary browser; at 6 it is a shortlist, and the ordering is already most-used-first (`:204`). |
| 7 chip counts | **Drop the count from unpressed chips, keep it on the pressed one.** Flagged — see §8; this touches a rule. |
| 6 visit chip | Already specced. Ship `ux-visit-filter-and-chip-density-2026-09-02.md` **Option B**, and delete the `×` at `category-filter-bar.tsx:213` with it (§4.4 of that doc). |
| 14 `Everywhere else` | **Keep the rule, delete the words.** Replace the `<h3>` at `:1613-1615` with the section's existing `border-t` (`:1610`) alone, and move the string into the section's `aria-label`. Two tests reference it (`tests/unit/sheet/place-list-continuation.test.ts:140,177`) — flagged, not free. |
| 12 `heading.note` | Leave. It only renders for the achievement/empty headings, and it is the one line that explains a *state*, not a control. |

---

## 2. The place card / detail

Host: `place-sheet.tsx` `PlaceDetail` (:1738-2472), plus `saved-place-edits.tsx` and
`components/collections/add-to-collection.tsx`. Rendered at 390×844 in the sheet, at 1440×900 in
the map popover (`w-80`, `place-sheet.tsx:2053`).

### 2a. The census, at rest, on a saved place with a note, tags, a quote and an approximate pin

| # | What | file:line | Kind |
|---|---|---|---|
| 1 | Source still, with a play glyph | `place-sheet.tsx:2060-2073` | media + 0–1 control |
| 2 | Place name `<h2>` | `place-sheet.tsx:2088-2102` | text |
| 3 | `Café · Tel Aviv-Yafo` line | `place-sheet.tsx:2104-2106` | text |
| 4 | Tag chips, pressable, `min-h-8` | `place-sheet.tsx:2116`, component `place-enrichment.tsx:180-225` | 0–8 controls |
| 5 | Close `×` / back `‹` | `place-sheet.tsx:2120-2135` | control |
| 6 | Address line with pin glyph | `place-sheet.tsx:2160-2166` | text |
| 7 | `~ Approximate location` mark | `place-sheet.tsx:1908-1917`, rendered `:2164` / `:2170` | text |
| 8 | `Saved from @handle` | `place-sheet.tsx:2219-2221` | text (only when the quote is suppressed) |
| 9 | TikTok pill (icon only) | `place-sheet.tsx:2223-2249` | control |
| 10 | `Google Maps` pill | `place-sheet.tsx:2250-2269` | control |
| 11 | `Been here` / `Been` pill | `place-sheet.tsx:2273-2280`, component `saved-place-edits.tsx:202-243` | control |
| 12 | `Been on 3 Aug` line | `place-sheet.tsx:2288-2290` | text |
| 13 | Caption quote + `@handle` figcaption | `place-sheet.tsx:2315-2326` | text ×2 |
| 14 | `why_go` sentence | `place-sheet.tsx:2342`, component `place-enrichment.tsx:519-525` | text |
| 15 | `DISHES MENTIONED` kicker + line | `place-enrichment.tsx:488-504`, kicker `:467-473` | text ×2 |
| 16 | `Add to a collection ›` row | `place-sheet.tsx:2353-2355`, component `add-to-collection.tsx:100-121` | control |
| 17 | `CATEGORY` kicker + `Change ✎` link | `saved-place-edits.tsx:338-353` | text + control |
| 18 | `Café · from the TikTok video` | `saved-place-edits.tsx:399-433` | text |
| 19 | `YOUR NOTE` kicker + `Edit ✎` link, or `+ Add a note` pill | `saved-place-edits.tsx:521-532` / `:495-517` | text + control, or control |
| 20 | The note itself | `saved-place-edits.tsx:543-545` | text |
| 21 | `3 more nearby` kicker + N rows | `place-sheet.tsx:2384-2428`, kicker `:2386-2388` | text + 0–5 controls |
| 22 | `Matched on Google Maps` | `place-sheet.tsx:2445-2447` | text |
| 23 | `Saved on 3 Aug` | `place-sheet.tsx:2448-2452` | text |
| 24 | `🗑 Remove from your places` | `place-sheet.tsx:2461-2463`, component `saved-place-edits.tsx:701-722` | control |

**Total on a full card: 9–22 controls and 15 distinct text blocks.** Six of those text blocks are
*about our machinery or our record-keeping* rather than about the place: #7, #12, #18, #22, #23 and
the figcaption in #13.

### 2b. What is redundant, decorative, or restates the UI

- **Three date lines on one card.** `Been on …` (`:2289`), `Saved on …` (`:2450`), and on the list
  row you came from, `Saved 3 days ago` (`:928`). Each is `text-micro text-muted-foreground`; none
  is actionable; the card's own comments concede they are "a quiet record of when, not something to
  act on" (`:2282-2287`).
- **`Matched on Google Maps` (`:2445-2447`)** is the only one of the three that must stay — it is
  Google's attribution condition (the card's own note at `:2439-2442`). Say so when cutting the
  other two, so nobody deletes the wrong one.
- **`Café · from the TikTok video` (`saved-place-edits.tsx:428-432`)** restates the category line at
  `place-sheet.tsx:2104-2106`, adding only a provenance clause. The card already says `Saved from
  @handle` or shows the caption quote; it is the *third* statement that this came from a video.
- **`CATEGORY` + `Change` + the value + the provenance clause is four elements to expose a control
  most users touch once** — the file itself makes that argument about position (`:2357-2359`) and
  then keeps the full section anyway.
- **`YOUR NOTE` + `Edit` over the note (`:521-532`)** is the same four-element pattern for a field
  whose content is directly beneath it. `NoteEditor` already deleted this shape for the *empty*
  state (`:488-494`, one `+ Add a note` pill) and kept it for the filled one.
- **The `Dishes mentioned` kicker (`place-enrichment.tsx:493`)** labels a `·`-separated list of
  nouns. `WhyGoLine` directly above it proved the point — it ships with no kicker at all and the
  file says why (`:506-516`).
- **`Saved from @handle` (`:2219-2221`) and the figcaption `@handle` (`:2320-2324`)** are the same
  string in two positions; the code already guards against both rendering (`shownQuote === null`),
  which is the tell that they are one fact.

### 2c. Proposals, per item

| Item | Proposal |
|---|---|
| #12 `Been on 3 Aug` | **Delete** `place-sheet.tsx:2288-2290`. The pressed `Been` pill is 6 px above it and states the fact. |
| #23 `Saved on 3 Aug` | **Delete** `place-sheet.tsx:2448-2452`. Keep the conditional wrapper for #22 only. |
| #18 provenance clause | **Delete** `saved-place-edits.tsx:428-432` (the ` · from the TikTok video` / ` · from the map listing` span). The value stays. |
| #17 category section | **Collapse to the value + a hairline-free `Change` only when the value is wrong to change.** Cheapest: delete the `CATEGORY` kicker at `saved-place-edits.tsx:340` and put the value where it was, keeping the `Change` link. Two elements instead of four. |
| #19 note section | **Same shape.** Delete the `YOUR NOTE` kicker at `saved-place-edits.tsx:523` and keep the `Edit ✎` link floated with the note's first line. |
| #15 dishes kicker | **Delete** `place-enrichment.tsx:493`. The line reads `Sabich · Malabi` — it is self-describing among a name, an address and a quotation. |
| #21 nearby kicker | Keep. It is the only label for a block of *other places' names*, which without it read as part of this place. |
| #4 detail tag chips | Keep as chips. They are the retrieval control (`place-enrichment.tsx:12-18`) and cutting them would remove a capability, not noise. |
| #24 remove | Keep, unchanged. It is already last, quiet and two-step (`saved-place-edits.tsx:701-770`). |

**Net at 390×844 if all of the above land: 4 text blocks and 2 elements removed from a card whose
stated target is zero-scroll** (`feedback-round-3-work-plan.md:136-137`). No control is lost.

---

## 3. The import review screen

Hosts: `src/app/import/screens/review/review-screen.tsx` (:341-681) and
`src/app/import/screens/review/candidate-card.tsx` (:246-698).

### 3a. Screen chrome, at rest, N ≥ 2 candidates

| # | What | file:line | Kind |
|---|---|---|---|
| 1 | `Review & confirm` kicker | `review-screen.tsx:344-350` | text |
| 2 | `3 places found` H1 | `review-screen.tsx:351-370` | text |
| 3 | Thumbnail / platform-mark square | `review-screen.tsx:380-403` | media |
| 4 | `@handle’s TikTok video ↗` link | `review-screen.tsx:405-413` | control |
| 5 | `Show the caption ▾` | `review-screen.tsx:414-444` | control |
| 6 | Prior-save notice (2 paragraphs, warning-tinted) | `review-screen.tsx:468-491` | text ×2 |
| 7 | `1 of 3 selected` | `review-screen.tsx:529-531` | text |
| 8 | `Select all` | `review-screen.tsx:532-539` | control |
| 9 | `Some places had no location…` skipped notice | `review-screen.tsx:585-589` | text |
| 10 | `Save 2 places` primary | `review-screen.tsx:637-659` | control |
| 11 | `Nothing is saved until you tap Save.` | `review-screen.tsx:673-675` | text |

**Screen chrome alone: 4 controls and 6 text blocks**, before a single candidate.

### 3b. Per candidate card, at rest

| # | What | file:line | Kind |
|---|---|---|---|
| 12 | Tickbox | `candidate-card.tsx:652-670` | control |
| 13 | Name | `candidate-card.tsx:256-258` | text |
| 14 | Provenance badge — `From the map data` / `From the caption` / `Needs your pick` | `candidate-card.tsx:281-292` | text |
| 15 | `Café · 26 Ibn Gabirol` meta line | `candidate-card.tsx:300-302` | text |
| 16 | `Already on your map` warning line | `candidate-card.tsx:308-310` | text |
| 17 | Proposed tag chips | `candidate-card.tsx:216-230` | 0–6 text pills |
| 18 | `Only mentioned in a hashtag.` | `candidate-card.tsx:312-314` | text |
| 19 | `Not this place? ▾` | `candidate-card.tsx:339-349` | control |
| 20 | Pin line + crosshair/tick glyph | `candidate-card.tsx:583-595` | text |
| 21 | `Check on Google Maps ↗` | `candidate-card.tsx:596-609` | control |
| 22 | `✎ Add a note ▾` | `candidate-card.tsx:464-478` | control |

**Per card: 4 controls and up to 5 text blocks plus 6 tag pills.** At the modal N = 3, the screen at
rest is **16 controls and 21 text blocks**, inside a modal the owner's own feedback (§2.7) already
calls dense.

### 3c. What is redundant, decorative, or restates the UI

- **#11 `Nothing is saved until you tap Save.`** sits directly under a 56 px button reading
  `Save 2 places`. It explains the button by naming the button.
- **#1 `Review & confirm` kicker over #2 `3 places found`** — the kicker names the process, the H1
  names the result. The file already deleted the kicker's count for the N = 1 case for this exact
  reason (`review-screen.tsx:346-348`) and kept it for N ≥ 2.
- **#7 `1 of 3 selected` beside #8 `Select all`** — three tickboxes are on screen; the count is the
  screen counting its own checkboxes for the user.
- **#20 the pin line duplicates #14 the badge.** `pinLine` is `settlednessLine(...) ?? …`
  (`candidate-card.tsx:567`) and the badge is `provenanceBadge(...)` (`:170`) — both derived from
  the same `view`, both about *how confident we are*, 60 px apart, one in an 11 px pill and one in a
  12 px line with a glyph.
- **#17 the proposed tag chips** are `<span>`s (`:224`) — inert pills styled exactly like the
  pressable chips in the library. Up to 6 per card, ×3 cards = 18 pills on the densest screen in the
  product, none of them pressable.
- **#3 the thumbnail square** never collapses by design (`:378-379`), so a post with no still draws
  an empty 48 px box with a platform mark in it.

### 3d. Proposals, per item

| Item | Proposal |
|---|---|
| #11 | **Delete** `review-screen.tsx:673-675`. **Flagged:** pinned by `tests/unit/import/one-result-collapse.test.ts:185`, which asserts the literal string is in the client source. Deleting it means editing that assertion, and that assertion is a Charter §3 invariant-2 guard — it must be replaced with an assertion about the explicit Save press, not just removed. ~1 h with the test. |
| #1 | **Delete the kicker for N ≥ 2** (`review-screen.tsx:344-350`) and let the H1 `3 places found` carry it, which is what it already does at N = 1. 0.25 h. |
| #7 | **Delete** `review-screen.tsx:529-531`; keep `Select all` / `Deselect all`, which already reports the state by its own label. 0.25 h. |
| #20/#14 | **Keep the badge, delete the pin row's line on the full card** — set `pinLine` to `null` for `collapsed === false` (`candidate-card.tsx:567`) and let the badge carry provenance, which is what W6-4 promoted it to do (`:163-170`). The `Check on Google Maps` link keeps its row. **Flagged:** this reverses W6-4's own "settledness demotes to the line provenance vacated" — see §8. ~1.5 h. |
| #17 | **Cap the proposed tag chips at 3 with no `+N`**, or drop them on unticked cards. The consent argument at `:172-206` requires them to be *shown*, not to be shown in full; 3 is what the library row already shows (`splitRowTags`). ~0.5 h. |
| #6 | Keep both paragraphs. It is genuinely news and H2-T1 measured the failure of making it quiet. |
| #22 | Keep. It is one 44 px text button at rest and its own docblock (`:429-431`) already refused the open-textarea version. |

---

## 4. The collections surfaces

Hosts: `src/app/map/collections-index-list.tsx` and
`src/components/collections/collection-content.tsx`.

### 4a. Index, at rest

| # | What | file:line | Kind |
|---|---|---|---|
| 1 | `Collections` heading | `collections-index-list.tsx:154-161` | text |
| 2 | `YOURS` section kicker | `collections-index-list.tsx:315-317` | text |
| 3 | `SHARED WITH YOU` section kicker | `collections-index-list.tsx:179`, same component | text |
| 4 | Per row: name | `collections-index-list.tsx:349-351` | text |
| 5 | Per row: `3 places · From Maya` | `collections-index-list.tsx:353-361` | text |
| 6 | Per row: description | `collections-index-list.tsx:372-376` | text |
| 7 | Per row: `CollectionCover` colour strip | `collections-index-list.tsx:377` | decoration |
| 8 | Per row: chevron | `collections-index-list.tsx:379` | decoration |
| 9 | `＋ New collection` dashed row | `collections-index-list.tsx:263-283` | control |

**Per row: 3 text lines + 2 decorations.** At four collections that is 12 lines of text and 8 glyphs
under two kickers.

### 4b. Inside a collection, at rest

| # | What | file:line | Kind |
|---|---|---|---|
| 10 | `‹ Collection` up-link (kicker-styled) | `collection-content.tsx:422-456` | control |
| 11 | `⋯` options button | `collection-content.tsx:457-468` | control |
| 12 | Collection name heading | `collection-content.tsx:488-494` | text |
| 13 | `3 places · 👥 You and Maya` — a *button* | `collection-content.tsx:495-514` | control |
| 14 | Description, 3-line clamp | `collection-content.tsx:528-532` | text |
| 15 | Search field | `collection-content.tsx:564-568` | control |
| 16 | `Everyone` + per-person chips with counts | `collection-content.tsx:573-575`, component `:773-844` | 1–N controls |
| 17 | Rows | `collection-content.tsx:669-678` | controls |
| 18 | `＋ Add places` pinned footer | `collection-content.tsx:744-753` | control |

**At rest with two collaborators: 7+ controls and 3 text blocks above the first row**, on a screen
whose sheet at `half` gives roughly one and a half rows (`collection-content.tsx:440-443` measures
0 fully-visible rows with the up-link present).

### 4c. What is redundant, decorative, or restates the UI

- **#10 `‹ Collection` costs 44 px and goes where the drawer's own `Collections` switch segment
  already goes.** The file says so at `:430-435` and keeps it under an orchestrator ruling, and
  measures the cost at `:440-443`: **0 rows fully visible against 1**. This is the single most
  expensive redundant control in the product, measured, with its own escape route written down —
  *"the height only comes back if that button moves onto the heading's row."*
- **#2/#3 the `YOURS` / `SHARED WITH YOU` kickers** each label a group that #5's own `From Maya`
  already distinguishes on every row.
- **#14 the description in the header duplicates #6 the description on the index row** you tapped to
  get here — the same string, 3 lines here and 1 line there.
- **#16 the `Everyone` chip** is a fifth chip vocabulary (`:828-834` — its own border/fill treatment,
  not `CHIP_PRESSABLE`), on a surface that already has a search field doing the narrowing.
- **`EmptyCollection` (`:907-938`)** is a heading, a sentence and a button — three elements to say a
  collection is empty, with the button duplicating the pinned `Add places` footer, which the code
  correctly suppresses (`:684-686`).

### 4d. Proposals, per item

| Item | Proposal |
|---|---|
| #10 | **Move the `⋯` onto the heading row and delete the up-link's row.** `collection-content.tsx:421-469` collapses to the `⋯` positioned `ms-auto` beside `HeadingTag` at `:488`. Recovers a measured 44 px and one full row. Requires amending `ux-collections-as-scope.md` §5 item 3 **before** the code — that sequence is explicitly binding here (`:435-437`). |
| #14 | **Delete the header description** (`collection-content.tsx:528-532`) or clamp to 1 line. It is already on the row that got you here. |
| #2/#3 | **Delete the `Yours` kicker when there are no shared collections and vice versa** — i.e. render `Section`'s `<h2>` (`collections-index-list.tsx:315-317`) only when both groups are non-empty. A single-group index loses a heading that labels the whole list. |
| #6 | **Delete the description from the index row** (`:372-376`) *or* from the header (#14), never both. One place per string. |
| #16 | Gate harder: `adderFilterIsUseful` already exists (`:311`); raise its floor so the chips only appear at 3+ adders. |
| #7 cover strip | Keep. `facelift-plan.md:204` locks generated covers as the reason the card grid was reopened — see §8. |

---

## 5. The profile popover and page

Hosts: `src/components/nav/profile-menu.tsx` (:222-373) and `src/app/profile/page.tsx` (:112-323).

### 5a. Popover, at rest

| # | What | file:line | Kind |
|---|---|---|---|
| 1 | Avatar glyph | `profile-menu.tsx:402-407` | decoration |
| 2 | Name | `profile-menu.tsx:418-422` | text |
| 3 | Email | `profile-menu.tsx:423-434` | text |
| 4 | `Joined 3 Aug` | `profile-menu.tsx:435-437` | text |
| 5 | `Your library` + hint `32 places · 2 cities · 3 countries` + chevron | `profile-menu.tsx:316-320`, hint builder `:381-387`, row `:452-480` | control + 2 text |
| 6 | `Account settings` + hint `Your name` + gear + chevron | `profile-menu.tsx:321` | control + 2 text + 2 glyphs |
| 7 | `APPEARANCE` kicker | `profile-menu.tsx:329-331`, heading `:483-489` | text |
| 8 | Theme segments (3) | `app/profile/theme-choice.tsx` | 3 controls |
| 9 | `Sign out` | `profile-menu.tsx:338-343` | control |
| 10 | `Delete my data` entry | `profile-menu.tsx:354-358` | control |

**Total: 6–7 controls, 6 text blocks, in a card that is `calc(100vw − 1.5rem)` wide on a phone
(`:308`).**

### 5b. Page, at rest

Same identity block (`page.tsx:143-185`), then `YOUR LIBRARY` kicker + a 3-figure card
(`:190-218`), a `been · not been yet` line (`:205-210`), `WHERE YOU SAVE` list (`:222-243`),
`WHAT YOU SAVE` list (`:245-277`), `APPEARANCE` (`:283-286`), `YOUR ACCOUNT` kicker + three
full-width buttons (`:292-319`). **5 uppercase kickers, 3 full-width buttons, 2 lists, 1 figure
card.**

### 5c. What is redundant, decorative, or restates the UI

- **#6's hint `Your name` (`profile-menu.tsx:91`)** describes the *contents of another screen*. It
  is a subtitle whose only job is to justify a row that already reads `Account settings`.
- **#4 `Joined 3 Aug`** is on both surfaces and is acted on nowhere.
- **The popover and the page state the same three figures in two formats** — `32 places · 2 cities ·
  3 countries` as a hint (`:381-387`) and as a three-column `<dl>` (`page.tsx:193-200`).
- **`YOUR ACCOUNT` kicker over three identical full-width outline buttons (`page.tsx:292-319`)** —
  a heading over a stack whose members name themselves.
- **The page's `been · not been yet` line (`:205-210`)** restates `stats.saved` split in two, under
  a card that already prints `stats.saved`.

### 5d. Proposals

| Item | Proposal |
|---|---|
| #6 hint | **Delete** the `settingsHint` string and the `hint` for that row — `profile-menu.tsx:91` and `:321`. `MenuLink` already supports a hintless shape by making `hint` optional; that is a 2-line signature change at `:452-462`. |
| #4 joined | **Delete** from the popover (`profile-menu.tsx:435-437`); keep on the page (`page.tsx:183`), where there is room for a record. |
| #7 kicker | **Delete** `APPEARANCE` in the popover (`:330`) — three theme segments under `Sign out` need no section name in a 10-row menu. Keep it on the page, where it separates two real sections. |
| page kickers | **Delete `YOUR ACCOUNT`** (`page.tsx:293`). The three buttons below it are self-naming. |

---

## 6. Cross-surface: the shape collision

Stated once because it drives half of §7's ranking. **`CHIP_PRESSABLE`** (`place-enrichment.tsx:158-166`)
is used for:

1. the visit filter — `category-filter-bar.tsx:210`
2. category filters — `category-filter-bar.tsx:282`
3. **sort order** — `place-sheet.tsx:752`
4. tag facets — `place-enrichment.tsx:344`
5. tags-as-controls inside a place — `place-enrichment.tsx:208`

and a *sixth* near-identical pill exists at `collection-content.tsx:828-834` (`AddedByChip`), a
*seventh* at `saved-place-edits.tsx:372-377` (the category radio), and an *eighth* inert one at
`candidate-card.tsx:224` (proposed tags on the review screen). **Eight pill vocabularies.** The
cheapest structural win in the product is not restyling any of them — it is deleting rows 3, 6 and
8 as *rows*, which §7 does.

---

## 7. Ranked cut list — top 15, by noise removed ÷ build cost

Ranked on visible elements removed per hour, weighted toward the phone. Hours are **ESTIMATE**s for
`design-system-frontend` including its own unit test updates, not including verification.

| # | Change | file:line | Removes | Hours | Rule conflict |
|---|---|---|---|---|---|
| 1 | `MAX_TAG_FACETS` 12 → 6 | `src/ui/place/tag-filter.ts:114` | up to 6 pills from **both** hosts, in the band r5 measured at 372 px | **0.5** | none |
| 2 | Gate the sort row on list length (`>= 8`) | `place-sheet.tsx:579`, `place-desktop-panel.tsx:216` | a 44 px row + 2–3 pills, and the header's second always-filled pill, on every small library | **0.5** | none |
| 3 | Delete `Nothing is saved until you tap Save.` | `review-screen.tsx:673-675` | 1 text block on the densest screen | **1.0** | pinned by `tests/unit/import/one-result-collapse.test.ts:185` — see §8.1 |
| 4 | Delete `Been on …` and `Saved on …` | `place-sheet.tsx:2288-2290`, `:2448-2452` | 2 text blocks from the card that must reach zero-scroll | **0.5** | none — but keep `:2445-2447` |
| 5 | Delete the `12 of 32` result count | `place-sheet.tsx:542-551`, `place-desktop-panel.tsx:181-190` | 1 text block × 2 hosts | **0.5** | none (`aria-hidden`, live region unaffected) |
| 6 | Delete `Saved 3 days ago` from the list row | `place-sheet.tsx:927-929` | 1 text line **per row** — the largest single text deletion in the product | **0.5** | soft: `savedElapsedLine` stays used by nothing; its 20 tests (`tests/unit/ui/location-certainty.test.ts:121-177`) become dead |
| 7 | Delete the `DISHES MENTIONED`, `CATEGORY` and `YOUR NOTE` kickers | `place-enrichment.tsx:493`, `saved-place-edits.tsx:340`, `:523` | 3 uppercase labels from one card | **0.75** | none — `WhyGoLine` set the precedent (`place-enrichment.tsx:506-516`) |
| 8 | Delete the ` · from the TikTok video` provenance clause | `saved-place-edits.tsx:428-432` | 1 text block; also deletes the `fromAPost` prop's only consumer (`:310-316`) | **0.75** | none |
| 9 | Delete `1 of 3 selected` | `review-screen.tsx:529-531` | 1 text block; `Select all` keeps the state | **0.25** | none |
| 10 | Delete the `Review & confirm` kicker at N ≥ 2 | `review-screen.tsx:344-350` | 1 text block above the H1 | **0.25** | none |
| 11 | Popover: delete `Your name` hint, `Joined …`, `APPEARANCE` kicker | `profile-menu.tsx:91` + `:321`, `:435-437`, `:329-331` | 3 text blocks from a viewport-wide card | **0.75** | none |
| 12 | Move the `⋯` onto the heading row; delete the `‹ Collection` row | `collection-content.tsx:421-469`, heading `:488-494` | **a measured 44 px and one whole list row** | **1.5** | `ux-collections-as-scope.md` §5 item 3 — amend the spec first (`collection-content.tsx:435-437`) |
| 13 | Cap the review card's proposed tag chips at 3 | `candidate-card.tsx:216-230` | up to 3 inert pills × N cards | **0.5** | soft: the consent argument at `:172-206` requires *shown*, not *all shown* |
| 14 | Delete the collection description from the sheet header | `collection-content.tsx:528-532` | up to 3 text lines above the first row | **0.25** | none |
| 15 | Delete `YOUR ACCOUNT` kicker and the header description duplicate on the index | `profile/page.tsx:292-293`, `collections-index-list.tsx:372-376` | 2 text blocks | **0.5** | none |

**Total: ~9 hours for 15 changes**, removing on the order of **9 pills and 17 distinct text blocks**
from the five surfaces, with **no capability lost**. Items 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15
touch pairwise-different regions and are **buildable in any order**, which matters because
`design-system-frontend` is the only build owner — see §9.

**Deliberately not in the table** (higher value, higher cost, already owned): the category trigger
and the tri-state visit control, both fully specified in
`ux-visit-filter-and-chip-density-2026-09-02.md` §3 and §6 and costed there; and the pin-line/badge
duplication on the review card (§3d #20), which is ~1.5 h and reverses W6-4.

---

## 8. Where a cut touches a ratified rule

Nothing in §7 breaks `voice-and-vocabulary.md`. Every proposal above is a **deletion** of a string,
never a rewrite, so §3's vocabulary table, §3.1's TikTok adjective rule and §4's banned list are
untouched by construction. Two clarifications, because they are the ones a builder will trip on:

1. **`Nothing is saved until you tap Save.` is not merely copy** (§7 item 3). It is the visible half
   of Charter §3 invariant 2 (*nothing is written without an explicit press*) and it is asserted as
   a literal in `tests/unit/import/one-result-collapse.test.ts:185`. Deleting it must be paired with
   an assertion that the Save press is still the only write path — otherwise the change deletes a
   guard, not a sentence. That is why it is costed at 1 h rather than 0.1 h.
2. **`Matched on Google Maps` (`place-sheet.tsx:2445-2447`) may not be deleted.** It is Google's
   attribution condition, recorded at `:2439-2442`. §7 item 4 deletes the two *dates* in that block
   and keeps the attribution; the conditional wrapper at `:2443` must be narrowed rather than
   removed.

Conflicts with `facelift-plan.md`, stated so they are decisions and not accidents:

| Proposal | Rule | Verdict |
|---|---|---|
| Dropping counts from unpressed category chips (§1c) | `facelift-plan.md:144` makes the count part of the category chip's ratified anatomy (*"count 0 → 40 %"* is a named disabled state) | **Do not ship without a ruling.** Not in §7 for that reason |
| Collapsing the category row behind a trigger | `facelift-plan.md:144` locks the pressed chip filling with *that category's own colour*, and `:81`/§2 make category colour load-bearing across pins, chips and counts | **Compatible** — `ux-visit-filter-and-chip-density-2026-09-02.md` §3.1 already solves it by making the trigger *be* the pressed chip. A native `<select>` would break it |
| Deleting the sort row (§7 item 2) | Not in the locked table; `facelift-plan.md:150-167`'s closed animation list has nothing to say about it | **Clear** |
| Deleting the collection cover strip | `facelift-plan.md:204` decision 5 locks generated covers as the reason the card grid reopened a ratified decision | **Not proposed.** Listed here so nobody cuts it as decoration |
| Any of the text deletions | `facelift-plan.md:206` decision 7 — *the running code wins; the deck follows in the same commit* | **Binding on all of them.** Every string deleted in §7 must be struck from `ux-architecture.md` §12 in the same commit |

Also binding and easy to miss: **`voice-and-vocabulary.md` §6's rule going forward** — a string
changes in code and the deck follows *in the same commit*, or it does not change. Fifteen commits
that each delete a string are fifteen commits that each edit the copy deck.

---

## 9. Notes for the orchestrator, not the builder

1. **This audit found no new *capability* to add and one to question.** The sort control
   (`place-sheet.tsx:728-759`) is the only header control with no owner document behind it — the
   filter row spec covers categories and visit state, `growth-plan.md` §4 covers tags. It was
   shipped by W5-2 and nothing has since asked whether a three-chip always-on row is worth 44 px on
   a phone. §7 item 2 gates it rather than deleting it, which is the reversible half.
2. **Twelve of the fifteen items are independent single-file edits.** Under concurrent dispatch that
   matters more than their individual value: they can be cut into two or three disjoint scopes
   (`place-sheet.tsx` + `saved-place-edits.tsx` as one lane; `review-screen.tsx` +
   `candidate-card.tsx` as another; `profile-menu.tsx` + `collections-index-list.tsx` +
   `collection-content.tsx` as a third) with no ordering between them. `ui/place/tag-filter.ts`
   (item 1) is a fourth, and is one line.
3. **Item 12 needs a spec amendment before any code**, and the file itself records that this exact
   control was deleted for one commit and restored for exactly that reason
   (`collection-content.tsx:430-437`). Route it as: amend `ux-collections-as-scope.md` §5 item 3,
   then build.
4. **Nothing here is verified.** I have no shell. Every element count is read from JSX at the
   file:line given; every pixel figure is quoted from an existing measured document and attributed.
   Before treating the 372 px or the 44 px in item 12 as fact, re-measure at 390×844 and 1440×900.
