# W1-CLOSE-QA — independent browser verification of `4bc04d0`

**Task:** W1-CLOSE-QA. **Date:** 2026-09-02. **Verifier:** `qa-reliability` (did not build either feature).
**Commit under test:** `4bc04d0` — *feat(sheet): wave 1's two orphaned features get their UI*.
**Branch tip at the time of this run:** `bb6feee`, working tree clean.
**Screenshots and raw driver logs:** `docs/evidence/.local/w1-close/` (gitignored).

## Verdict

| # | Feature | Verdict |
|---|---|---|
| 1 | Every TikTok source on a place card (§5.1 / `L?-G-T1`) | **PASS** at 390×844 and 1440×900, LTR and Hebrew |
| 2 | Multi-select + bulk delete in Places (§8.2 / `G-T3`) | **PASS** at both breakpoints, verified against the persisted rows |
| 2a | *One control must never do both removals* | **PASS** — the two are disjoint in entry, verb, depth and effect |
| — | Was the pre-existing environment sound? | **NO — see Finding A. The stated environment could not have verified anything.** |

---

## Finding A (process, severity: high) — the dev server on `:3000` was serving a 334-commit-old tree

The task handed me a running dev server on `http://localhost:3000` and told me not to restart it.
That server (**pid 30132, `next-server` v16.3.1, started Mon**) has its cwd in a **different
checkout**:

```
lsof -p 30132 -d cwd  ->  /private/tmp/p002-no-crumbs
git -C /private/tmp/p002-no-crumbs log --oneline -1  ->  48b0dd8   (detached HEAD, Aug 31)
git log --oneline 48b0dd8..4bc04d0 | wc -l  ->  334
ls /private/tmp/p002-no-crumbs/src/components/sheet/
  # no place-sources.ts, no bulk-delete.ts, no library-selection.tsx
```

It is a `git worktree` of this repo (`.git` → `.git/worktrees/p002-no-crumbs`) pinned to a commit
that predates *both* features. My first pass against it produced a clean, plausible-looking
false negative: the multi-source block did not render, and the RSC payload for `/map` carried
`detail.source` with **no `sources` array and no `SpotSource.id`** — the shape `get-spots.ts` had
before `31c3390`/`5d58e40`.

**Anything measured on `:3000` this week is measuring `48b0dd8`, not the branch.** That includes any
"I checked it in the browser" claim from another agent, and it is the more important half of this
report.

**What I did instead:** `git archive 4bc04d0 | tar -x` into `/private/tmp/p002-qa-4bc04d0`,
hard-linked `node_modules`, copied `.env.local` in without reading it, and ran `next dev -p 3100`.
`:3000` and its worktree were never touched, restarted or written to. Every measurement below is
against **`4bc04d0` exactly**, served on `:3100`. The temporary checkout has since been removed and
its server stopped.

**Delta between `4bc04d0` and the branch tip `bb6feee`:** four commits, three docs-only, one
(`092bfd6`) re-drawing `PlatformMark` — the glyph on each extra-source row. So the tip renders a
different glyph in that list; everything else in this report holds for the tip unchanged.

---

## Feature 1 — every TikTok source on a place card: **PASS**

### Fixtures

The library already contained one real two-source place, which is also Hebrew:

| saved place | sources (`added_at` order) |
|---|---|
| `e4581ba9…` **רדיו גליל ים** | `@karin_ziri` → `/video/7479087881743633671`, `@paz_farchi1` → `/video/7412976828689829128` |

I added an LTR three-source fixture (`QA Keepme Delta`, `@qa_first`/`@qa_second`/`@qa_third`) to test
the plural arm and the ordering, and used `Nordoy Café` (one source) as the control.

### Measured — mobile 390×844 and desktop 1440×900, identical results

| case | line rendered | extra links | distinct hrefs | touch height |
|---|---|---|---|---|
| 3 sources, LTR | `Also saved from 2 more TikTok videos` | 2 | 2/2 | 44 px |
| 2 sources, Hebrew | `Also saved from 1 more TikTok video` | 1 | 1/1 | 44 px |
| 1 source | *(nothing)* | 0 | — | — |

- **Both sources are shown and they are distinct.** `sources[0]` stays the headline (`Saved from
  @qa_first` / `Saved from @karin_ziri`); the tail is what is new, and no href repeats the head's.
- **Earliest-first ordering holds** — `@qa_second` then `@qa_third`, matching `added_at`.
- **Singular/plural is right** (`1 more TikTok video` / `2 more TikTok videos`), and `TikTok` is an
  adjective as `voice-and-vocabulary.md` §10.5 requires.
- **Tappable, and they really navigate.** `target="_blank" rel="noreferrer"`; clicking the first
  extra link opened a new tab at `https://www.tiktok.com/@qa_second/video/7900000000000000002`.
- **Accessible names name the destination**: `Open @qa_second on TikTok`, not three identical
  `Open on TikTok`.
- **RTL is clean.** On the Hebrew card the handle sits in a `<bdi>` and the `ArrowUpRight` is
  `ms-auto`, so it lands on the trailing edge; no clipped start-of-string, no mirrored arrow.
- **One source draws nothing.** The single-source control card is byte-identical to before — the
  claim in `place-sources.ts`' header is true in the browser, not only in the unit tier.

Screenshots: `mobile-02b-card-ltr-sources.png`, `mobile-03b-card-rtl-sources.png`,
`mobile-04-card-single-source.png`, and the `desktop-*` equivalents.

---

## Feature 2 — multi-select and bulk delete in Places: **PASS**

Run on throwaway rows I created and then destroyed. **No row belonging to the owner was deleted at
any point**; the count of non-fixture `saved_places` read 58 before, between and after every delete.

### Mobile 390×844 — clean delete

Preconditions: 62 `saved_places` (58 owner + 4 mine). Filter `QA Throwaway` → 3 rows.
Steps: `Select` → tick Alpha and Bravo (leave Charlie) → `Delete from your places` → `Delete`.

Rows read back out of Postgres immediately after:

```
saved_places total        62 -> 60
QA rows remaining         Charlie, Delta          (Alpha, Bravo gone)
owner's rows              58 -> 58                (untouched)
saved_place_sources for the two deleted ids       0   (cascaded)
saved_place_sources for Delta                     3   (untouched)
public.places rows for all four                   still present  (correct — places is shared)
```

**The delete is exactly the selection and nothing else**, and it takes the `saved_place_sources`
links with it while leaving the shared `places` rows alone.

### Desktop 1440×900 — the partial-success path

Same gesture on Echo and Foxtrot, but with the confirm open I deleted Echo out of band via psql —
the "another tab got there first" case `bulkDeleteOutcomeMessage` exists for.

- On screen: **`Deleted 1 place. The other one was already gone.`** (`role="status"`).
- In the database: 62 → 60; only Echo and Foxtrot gone; owner's 58 intact.

The count is reported rather than smoothed, which is what the module header promises.

### The confirm's depth (`ux-two-removals-one-screen.md` §2.4)

Identical at both breakpoints:

```
"Delete 2 places?"
"Your notes, your tags and your Been marks go with them, and this can't be undone."
[ Cancel ]  [ Delete ]        Cancel is first, and document.activeElement is Cancel
```

Count, enumerated losses, irreversibility, Cancel-first, Cancel-autofocused: four for four.

### `Select all` is scoped to the filter — the 58-row hazard is closed

With `QA` typed in the search field (2 of 60 matching), `Select all` picked **2**, not 60; the
label flipped to `Clear`; two checkboxes were checked. A `Select all` that reached past the visible
filter would be the single most dangerous defect this feature could carry. It does not.

### Other checks

- The delete trigger is **disabled at zero selected** and enables on the first pick.
- Search field, filter bar and (on desktop) `Add a TikTok link` are all **replaced**, not left
  beside the toolbar.
- Rows become `role="checkbox"` with `aria-checked`; tap-to-open is gone while picking, so no row
  is both "open me" and "pick me".
- Keyboard-reachable: three `Tab`s from entering selection lands on the first row checkbox.
- No console or page errors on any run.

---

## Feature 2a — the two removals stay two: **PASS**

Driven end to end on `/map?view=collections&collection=…` with two places in it.

| | **Places (library)** | **Collections** |
|---|---|---|
| how you enter | bare `Select` on the heading line | `Select places`, inside the `···` overflow menu |
| how you leave | `Done` | `Cancel` |
| trigger | `Delete from your places`, in the band under the toolbar | `Take out of this collection`, pinned footer, full-width 48 px |
| prompt | `Delete 2 places?` | `Take 2 places out of this collection?` |
| consequence | "…and this can't be undone." | "Nobody here will see them any more. **They stay in your places.**" |
| button order | Cancel first, autofocused | `Take out` first, `Cancel` second, nothing autofocused |

Counted on the live collection screen in selection mode: **0 buttons named `Delete from your
places`, 0 named `Delete`.** And the effect, read out of Postgres after running the collection's
bulk action on both items:

```
collection_items in 'tel aviv food'   2 -> 0
saved_places                          60 -> 60      (both places still saved)
```

**The reversible action stayed reversible.** No path from the collection's bulk control reaches
`deleteSavedPlaces`.

---

## Observations in passing (not defects in `4bc04d0`)

**O1 — the `Select` control's placement, measured.** At `4bc04d0` it is at the **trailing end of the
heading line**, not the filter row.

```
mobile 390:  row .flex.items-center.gap-2   x20 y86  w350 h44
             h2 "60 places in 3 countries"  x20 y94  w284 h28   20px/800  near-black
             Select                         x312 y86 w58  h44   14px/500  rgb(110,106,100)
             -> the row is 44px because of min-h-11 on the button; the h2 alone is 28px,
                so Select costs this row 16px, not the "zero vertical pixels" the code comment
                in library-selection.tsx and place-sheet.tsx both claim.
             -> 0px from Select's right edge to the container's right edge (flush with the
                search field below); 8px flex gap from the heading.
desktop 1440: the h1 wraps to two lines (64px), so there Select genuinely costs 0px.
```

So the "zero vertical pixels" argument is true on desktop and **false by 16 px on the phone**, which
is the viewport the argument was written about. Visually it is a small grey 14 px word floating at
the far right of a 20 px extra-bold heading, sharing no alignment with it, and it is the only thing
on that line. That is a plausible source of the owner's "really weird position". I am reporting the
measurement, not proposing a redesign.

**O2 — asymmetric entry into the two selection modes.** The library's is a visible word on the
heading; the collection's is buried one tap deeper in a `···` menu. Deliberate divergence is the
point of the pair, but *discoverability* is not one of the axes §2.4 asks to differ on, and the
riskier of the two is the easier to reach.

**O3 — heading arithmetic, pre-existing.** With a search active the heading read `3 matches in 3
countries` and later `1 match in 3 countries` for matches that were all in Israel. The country count
is over the whole library, not the matches. Not touched by `4bc04d0`; visible on this surface.

**O4 — a stale comment.** `collection-content.tsx` still says "This is the product's only
multi-select surface, deliberately". `4bc04d0` made that false.

---

## What I could not verify

- **Production and staging.** Local only. The local container's applied migration head is `0027`;
  `0028`–`0037` are not applied. Neither feature depends on them — `saved_place_sources` is `0003`/
  `0006`-era and `deleteSavedPlaces` needs only `saved_places_delete_own` (`0006`) — but `0034`,
  which `place-sources.ts`' header credits for keeping the second link on a re-save, **is not applied
  locally**, so I proved the *render* half against rows I placed, not the *write* half end to end.
  A real second TikTok import onto an already-saved place is untested here.
- **A real signed-out / offline bulk delete.** `attemptWrite`'s `refused` and `silent` arms were not
  exercised in the browser; only the partial-success arm was.
- **Touch, on hardware.** Playwright's emulated touch, not a phone.
- **A place with many sources** against the desktop popover's height cap. Three was the most I drove.
- **`npm run verify`** — not leased to me, not run.

## Reproduction

`/private/tmp/claude-501/…/scratchpad/drive{,2,3,4}.mjs` drove this; they are throwaway and point at
`http://localhost:3100`. All fixture rows (`saved_places 22222222-…`, `places 11111111-…`,
`sources 33333333-…`, their `place_provider_refs` and `collection_items`) were created and then
deleted; the local database ended at 58 saved places and collections at 5/15/0, matching its
pre-test state.
