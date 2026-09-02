# Handoff — the wave-1 close and wave-2 session, 2026-09-02 (evening)

> Written at `26eac74` on `no-crumbs-implementation`. **Read this before
> [`feedback-round-3-work-plan.md`](feedback-round-3-work-plan.md) §5** — that section's wave
> ordering is now partly history, and this file says which parts.

## The headline, because the next session was asked to start with it

**Wave 1 is CLOSED.** The owner's instruction for the next session was *"finish wave 1 and start
wave 2"*, written before the closing evidence landed. Both of wave 1's incomplete lanes are done:

- **Lane G (sources + multi-select)** — shipped at `4bc04d0` and **independently verified in a
  browser** by `qa-reliability`. Two-source cards render at both breakpoints and in Hebrew; real
  bulk deletes were run and the rows read back out of Postgres; the safety invariant holds (Places
  deletes, Collections unlinks, and no control does both). Evidence:
  [`evidence/w1-close-4bc04d0-verification.md`](evidence/w1-close-4bc04d0-verification.md).
- **Lane C (filter row)** — seven commits, and **all nine inherited test failures are green by
  construction, not by edit.**

**Wave 2 is already most of the way through**, not waiting to start. Geography, the map's area
band, and the filter surface all landed today.

## State

| | |
|---|---|
| Branch | `no-crumbs-implementation`, **16 commits** this session, from `bb6feee` to `26eac74` |
| Tests | **3572 passing, 0 failing, 221 files** — up from 3540 passing / 9 failing this morning |
| `tsc --noEmit` | **4 errors**, the pre-existing typed-route `Link` baseline. No fifth was added |
| Working tree | clean of source; `docs/` carries this file and the day's evidence |
| Background work | **none running.** Every agent was collected |

## The trap that cost this session the most, now removed

**The dev server on `:3000` was serving a different checkout.** It ran from
`/private/tmp/p002-no-crumbs`, a stale worktree pinned at `48b0dd8` (31 August) — **341 commits
behind**. Same repo, wrong tree, and identical from the browser.

Three independent agents hit it: `qa-reliability` produced a clean, plausible **false negative** on
a feature that was genuinely present; `product-reviewer` spent twenty minutes writing up a
voice-doc violation before checking `lsof`; and the owner's own product judgements — including *"the
filters are ok now, its just small fixes"* — were made against a build from before the filter
rework existed.

**The worktree has been removed**, along with five dead registrations. If a browser reading ever
disagrees with the source again, check what the port is actually serving **first**:

```
lsof -p $(lsof -nP -iTCP:3000 -sTCP:LISTEN -t) -a -d cwd
```

## What landed, and what it changes on screen

**The filter row** (`3c6cf6f`, `9b7db0c`, `a9cba41`, `cbfbb67`, `637c838`, `a4c3556`). Menus anchor
under their own triggers; the phone gets inline disclosure rather than a floating popup inside a
drawer; single-select menus close on choose while Tags stays open; `Clear` appears only when a
filter is on and never touches sort; 44 px targets verified with `document.elementFromPoint`; the
tag list holds still while you filter, rows going to `0` rather than vanishing; a check appears only
on a checked row. The dark-mode menu highlight was invisible — `--muted` and `--card` are the same
colour in dark — and is now `bg-card-2`.

**Geography stops lying** (`6c75b31`, `161b437`, `2e1630e`, `d785ddf`). The genuine find, which
nobody had: **`/profile` and the map grouped the library by two different rules** — the map applies
a locality veto that stops a 50 km join swallowing every town it reaches, and `profile-stats.ts` did
not. On the owner's 58 rows that is **4 clusters against 12**. Both now say 12. An area whose rows
all carry a null locality is named after its country, so the bare `4` over the Czech Republic reads
`Czechia 4`. And `58 places in 3 countries` was never true while one place is in none of them; the
header now says `58 places in your library` and returns to naming countries once the row is
backfilled.

**The map's area band** (`e4cffd9`, `5c7e6c0`). The owner's report was *"you can see Tel Aviv but
can't see Herzliya"*, and the measured truth was worse: **Herzliya lost at every zoom in the band.**
At z4.5–z8, seven of twelve areas were never drawn and **18 of 58 saved places were neither visible
nor counted anywhere on the map.** An area that cannot be placed is now **absorbed into the
neighbour that displaced it, with its count**, and the invariant — the drawn pills sum to the
library size — is asserted at every step. Five precomputed steps with `minzoom`/`maxzoom`, so
MapLibre still owns the swap and nothing listens for zoom.

**The empty filter result** (`211f86c`, `7dca30f`, `26eac74`). Owner rulings, and the third one was
emphatic: the message belongs **where the places are**, it is **generic across all three axes**, and
it is **not in the header**. It is now a composed empty state — mascot, line, hint, `Clear filters`
— and the heading went back to naming what you have (`Your places`).

**The Been mark** (`d9d2a52`) is drawn on the source frame, not only in the row.

## Facts this session corrected, so they are not re-inherited

- **`abc1771`'s resume list is stale.** Tags was already on the Combobox; the `Been` axis naming was
  already done; sort was already 44 px. The orphans it blamed on `library-filter-bar.tsx` were
  actually `ui/combobox.tsx` and `ui/input-group.tsx`, which nothing imported.
- **`place-desktop-panel.tsx` renders its own column.** The Been badge, the no-matches line and the
  empty state have each now been built in `place-sheet.tsx` alone first. **Three times.** A fix to
  one host is not a fix to the other — except where the component is exported and shared, which is
  what the empty state does and what the others should have done.
- **`current-state.md` item 14 is stale** — `.env.local` exists in this checkout.
- **`current-state.md` item 0** (GitHub Actions cannot start a runner) is stale; runners work.
- The real cause of *"menus don't close on select"* was Base UI defaulting `closeOnClick` to
  `false`. The owner's report was exact.

## Blocked on an owner decision — nothing else can move these

1. **The country band still overlaps.** `Another area 1` prints on top of `Israel 35` at both
   breakpoints, photographed three separate times today. The area band's answer does **not**
   transfer: absorbing a countryless place into `Israel` would invent a fact, and offsetting at
   world zoom moves a label ~670 km. Proven in MapLibre's own source: `allow-overlap: true` skips
   the hit test entirely, so two allow-overlap symbols can only be separated **geometrically**.
   Options to rule on — draw the losers count-only; floor the home camera so the capsules cannot
   collide; or accept the overlap and fix only the tap.
2. **The local database catch-up.** Rehearsed **twice** on a throwaway clone,
   [`db-local-catchup-plan.md`](db-local-catchup-plan.md). **Apply in place, do not reset.** The
   owner's constraint was *"i just doesnt want the places to be removed... and the users"*, and both
   survive. Needs a quiet minute with no lane writing — two migrations take `ACCESS EXCLUSIVE`.
   Blocks the geography backfill (`0038`).
3. **§4.1 fly-to when a pin is tapped** — reverses a written rule and adds a ninth camera mover.

## Wave 2, first task — a REGRESSION this session shipped

**The filters break scrolling on mobile.** Owner, 2026-09-02, at the close of the session: *"its so
bad on mobile those filters you cant even scroll!!!!!!!!!"* Deferred to wave 2 on the owner's own
instruction rather than fixed on the spot — but it is **first**, because it is a regression, it is
on the phone, and the phone is the product's primary form factor.

**Not diagnosed.** It was reported as the session ended and the reproduction was interrupted; do
not inherit a guess. Reproduce at **390×844 on the real library** before changing anything.

Where to look first, in order of suspicion — all from `cbfbb67`, the inline-disclosure commit:

- **The inline panel is content, not an overlay.** On mobile the menus render *in flow* beneath
  their row and push the list down (owner ruling: a floating layer inside a vaul drawer is a popup
  inside a popup). That is a large block inserted into a column whose height is managed — so the
  scroll container may be sized as though the panel were not there, or the panel may be growing the
  header band past the list's box.
- **`data-vaul-no-drag`.** The sheet is a vaul drawer and the filter controls carry this attribute
  so a press inside them is not read as a drag. If it now covers a region that should still scroll —
  or if the panel's scroll and the drawer's drag are fighting — touch scrolling dies while the
  desktop mouse wheel keeps working, which is exactly the shape of "you can't even scroll".
- **The list's own box.** `place-sheet.tsx`'s scroll column uses
  `mb-[calc(env(safe-area-inset-bottom)+var(--floating-bar,0px))]` with `min-h-0 flex-1
  overflow-y-auto`. A `min-h-0` lost anywhere up the flex chain collapses scrolling entirely.
- The spec's own deferral, which may be the same bug or a neighbour: **an outside press does not
  close the inline panel** (trigger, Escape, choosing, or another axis do). Written down at the end
  of the filter lane, phone-only, never fixed.

**Verify with touch, not the wheel** — emulate a mobile device so pointer events are touch, and
check both the list scrolling and the sheet's own drag detents. Desktop at 1440×900 was verified
working, so a desktop-only check will not see this.

## Ready to run, no blockers

- The place card's remaining text — the `DISHES MENTIONED` / `CATEGORY` / `YOUR NOTE` kickers and
  the `· from the TikTok video` clause. **The date lines stay** (owner, explicitly).
- The peek row's spacing at the sheet's lowest stop, and its missing `env(safe-area-inset-bottom)`.
  Four mirrors, all named, pinned by `tests/unit/shell/sheet-geometry.test.ts`.
- §7.3 the profile popover's mobile spacing, focus trap and Escape.
- Co-located pins stacking at z8.5–z12. Designed by the map lane, **not built** — the fix needs
  `marker-style.ts`, and the same `ignore-placement` asymmetry it proved applies to the pin layer.

## From the wow audit, ranked, and not yet scheduled

Full detail in [`wow-audit-2026-09-02.md`](wow-audit-2026-09-02.md). The top three:

1. **The map opens on a picture of the Earth with none of your 58 pins drawn** — 85 % of a phone
   screen, and the built five-beat arrival choreography fires against nothing, because at the zoom
   that fits a UK-to-Israel library the pin layer does not draw. Collections proves pins *can* draw
   at that zoom. This is the first thing anyone sees.
2. **995 lines of finished, security-approved in-app TikTok playback that no file imports.**
   `src/components/embed/` — the player, the three consent branches, the copy deck, and a
   conditional permit with a ten-item gate. The play glyph is already on the card, wired to
   `Open on TikTok` instead. Highest value per remaining line in the repo.
3. **On a phone, a place card's actions sit under the bottom nav** — `Been here` hit-tests as
   `Profile`. Desktop is correct, which is the tell.

Also: **no loading affordance exists anywhere.** Every transition was surveyed — max skeleton count
0, max spinner count 0. The owner asked for loaders and then said *"not now"*.

## Working notes for the next session

- **Mobile:** owner, 2026-09-02 — *"im not saying stop working on mobile — it should work good on
  mobile too, but dont spend time on that for now."* So: no mobile regressions, quick sanity pass,
  no mobile-only polish.
- **Do not over-brief a small task.** One agent was handed five documents to read for a small
  design change and had written nothing after ten minutes. Match the brief to the size of the job.
- Three other interactive sessions were live on this machine. The tree is shared; `git status` is
  not evidence about any one lane, and every claim should name the **commit** it was measured at.
