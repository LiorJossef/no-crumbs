# Handoff — the wave-2 evening session, 2026-09-02

> Written at `dedcf04` on `no-crumbs-implementation`. Supersedes
> [`handoff-2026-09-02-waves.md`](handoff-2026-09-02-waves.md) for anything the two disagree on.

## State

| | |
|---|---|
| Branch | `no-crumbs-implementation`, **19 commits this session**, `a6e93f1` → `dedcf04`, all **pushed** |
| Tests | **3609 passing, 0 failing** |
| `tsc` | 4 errors, the pre-existing typed-route `Link` baseline. No fifth |
| Working tree | one lane may still be mid-edit in `src/components/map/` — see "In flight" |
| Owner instruction | **branch pushes only. No PR, no merge to `main`.** |

## What landed

- **The mobile scroll regression** (`ba3b4b5`, `a0f371e`) — the filter panel capped itself at `45dvh`
  inside a column that is `55dvh - 70px`, so the list measured **0 px** at the half stop. Touch was
  never broken; there was nothing to scroll. The column now publishes `--sheet-content-height`.
- **The map opened on a globe** (`fa96c1a`, `c78c787`, `ed6960c`) — the fit reserved 103 px a side
  for the widest pill, 53 % of a phone's width, putting arrival **1.75 zoom levels** too far out.
- **Pin tap flies to the place** (`5985d89`, `616ec93`) — owner ruling, reversing a written rule.
  Underneath it: MapLibre's `closeOnClick` meant one tap fired select-then-deselect, so **a pin tap
  was closing the open place**. Dismissal is explicit now.
- **Zoom out past the pin band closes the card** (`cf4e5a8`) — it was floating over open water
  anchored to a pin that is no longer drawn.
- **The peek row** (`700ca22`) — the button hit-tested as the bottom nav. Caught a **fifth** mirror
  of `PEEK_PX` that was clipping the CARTO/OSM attribution (licence-adjacent).
- **The card** (`00a7dba`, `872a20f`, `102410c`) — one quiet label, one field-row shape for nine
  actions, three bands with hairlines.
- **Overlapping country pills** (`dedcf04`) — flag, name and count are now **one bitmap**, so pills
  stack as opaque cards. MapLibre draws icons and glyphs in separate passes, which is why opacity
  was never the lever. No collision pass, no absorption, no camera floor — all three were
  considered and rejected.

## Reverted, on the owner's instruction

**`73a6f50` — the card's RTL change (H-5) is OUT.** The bands and spacing (H-3) stay. Owner: *"the
RTL CHANGE IS BAD CAN YOU REVERT ONLY THAT?"* Do not rebuild it from
`ux-place-card-unification-2026-09-02.md` §6 without a new ruling — that section is now history.

## In flight when the session ended

**Area-band pills, Hebrew alignment.** Owner: the count is misaligned on a Hebrew city pill. First
attempt — a bidi isolate — **made it worse**: it reversed the order from `תל אביב 22` to `22 תל אביב`.
The ORDER was always right; only alignment was wrong. The agent was redirected to bake the area pill
into a bitmap, reusing `dedcf04`'s country renderer.

**That second attempt is MID-EDIT AND RED in the working tree, uncommitted on purpose.** Measured at
`93f9446`: `src/components/map/country-flag-image.ts`, `summary-style.ts` and
`tests/unit/map/summary-style.test.ts` are modified, with **one failing test** (`measures a capped
pill wider than a capless one carrying the same label`) and **one type error**
(`summary-features.ts:90` — `label` is not on `CountryDiscSpec`, so the shape it is mid-way through
changing is not applied everywhere yet). Finish it or discard it; do not assume it works. The last
green commit is `93f9446`.

## Two things the owner is owed

1. **Country names are dropped on a phone** (`c78c787`) — flag + count only, because a 206 px pill
   clipped at the edge. The owner's own reference screenshot shows a phone **with** names, and now
   that pills stack cleanly the clipping matters less. **Offered, not yet answered:** put the names
   back and accept some edge clipping. Removing the afford check is the whole change.
2. **The flag circle.** Owner asked to remove the ring around the country flags; deferred so the
   overlap could land first. Not built. Note it changes the bitmap width that the afford check reads.

## Corrections to the record

- **`§1.1` in `feedback-round-3-work-plan.md` is misdiagnosed.** It defers Hebrew-on-the-map as
  structural and cosmetic, on the grounds that *"the RTL audit already confirms mixed-run ordering is
  correct"*. That is false for the summary pills: the count sitting on the wrong side of a Hebrew
  name **is** an ordering defect, and it is a bidi fix rather than a glyph-stack project. The
  baseline half of §1.1 is still real and still deferred.
- **`place-desktop-panel.tsx` does NOT render the place card.** It is the `lg+` list column and
  contains zero references to `PlaceDetail`. The card is one component with four hosts.
  `handoff-2026-09-02-waves.md` says otherwise and is wrong; I repeated it in a brief and a
  specialist corrected me.
- **D-T2 was already fixed** at `636ddfa`. The plan lists it as open.
- **`Other` did not fix the pill overlap.** I said it would. The anchors are ~7 px apart, so
  narrowing could never separate them; `dedcf04` is what actually fixed it.

## The TikTok player — deferred by the owner, do not touch

No wiring, no removal, **no CSP changes**, external-TikTok behaviour unchanged. A partial wiring was
reverted; the patch is at `scratchpad/deferred-tiktok-player-wiring.patch` (session-scoped, will not
survive). Note `next.config.ts:60` still serves `frame-src https://www.tiktok.com` for a frame
nothing reaches — decide that **with** the player, not separately.

## Why this session was slow, and it is not the agents

`place-sheet.tsx` is **3,115 lines, 1,253 of them comments (40 %)**. It is the biggest file in the
repo, and `library-filter-bar.tsx` and `map-surface.mapcn.tsx` are second and third — every task
today landed in one of the three. An agent spends its time orienting, not editing, and the file's own
culture pressures it to write matching prose. Splitting it, or thinning the commentary to what is
load-bearing, would pay for itself. Not before the 6th.

## Still not in any lane, and it is the highest risk on the board

**The 10–15 minute presentation deck.** Submission is **6 September**.
`docs/presentation-outline.md` is 207 lines of outline, not a deck. Every other graded artefact
exists. The UI-first ordering keeps burying it because it is not a UI problem — that is the ordering
working as instructed, not the item losing importance.

## Not verified this session

`npm run verify`, a production `next build` and the e2e suite were **never run**. Several changes were
committed on the building agent's own evidence. The local database is **13 migrations behind** the
schema on disk, so any local check of saves, collections or tags is measured against the wrong
schema — and the geography backfill (`0038`) is blocked behind that catch-up, which must be applied
in place, never reset.
