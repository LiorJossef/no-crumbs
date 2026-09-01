# Round 4 — four lanes interrupted mid-edit, 2026-09-01 00:23 UTC

**All four lanes on the owner's 2026-09-01 requests died simultaneously on an account session limit**
(*"resets 2:50am Europe/Skopje"*). Not a failure of the work: each was mid-file when the process
ended, and three of the four reported their next step in the same breath.

**The tree is uncommitted and broken.** One typecheck error, three failing tests. That is expected of
work stopped mid-edit and is **not** a reason to discard it — `git status` at the time of writing is
the record, and the partial work is left in place deliberately. Do not stash it (`stash` is on the
deny list), do not reset it, do not sweep it into a commit to tidy the tree.

## What is broken right now, precisely

```
src/components/nav/bottom-nav.tsx(381,65): error TS2322
  Property 'initialOpen' does not exist on type 'ProfileMenuProps'
```

and three failures, all downstream of the same two lanes:

- `tests/unit/nav/bottom-nav.test.ts` ×2 — the nav's `aria-current` assertions, against a nav that is
  mid-conversion from a Profile **tab** to a menu **trigger**.
- `tests/unit/ui/motion-scale.test.ts` — *"imports every constant somewhere"*. A beat was added to
  `src/lib/interaction.ts` for the view swap and its consumer is the wiring that never landed. **This
  failure is the guard working**: it exists to catch a vocabulary entry nothing uses.

## Where each lane stopped, in its own words

| lane | left on disk | its last words |
|---|---|---|
| `r4-card` | `place-sheet.tsx` modified | *"Now the pin arm."* |
| `r4-embed` | `src/components/embed/` (5 files), `tests/unit/embed/` (5 files) | — |
| `r4-profile` | `src/app/account/` (4), `actions/profile.ts`, `nav/profile-menu.tsx`, `bottom-nav.tsx` | *"Now the two form islands."* |
| `r4-transition` | `ui/view-swap.tsx`, `drawer-view.ts`, `collections-scope.tsx`, `interaction.ts` | *"Now wire it into `collections-scope.tsx`."* |

## What each was told, so a resumed lane does not need the transcript

**`r4-card`** — the left-list place card leaks (measure it, do not describe it); add a thumbnail to the
map popover **reusing** `thumbnailOf()` and the sheet's refresh coordinator rather than fetching per
pin; keep `referrerPolicy="no-referrer"`; be correct when the thumbnail is gone, which is the common
case past 48 hours. Build the play **button and slot only** — not the player.

**`r4-embed`** — `docs/security-ruling-embed-playback-2026-08-31.md` §6 is the spec; items 1–4 and 10
are a hard gate. The first click is the disclosure: *play here* vs *open on TikTok instead*, neither
defaulted, persisted per browser, and the copy must not read *"just this once"* when the grant runs a
year. **Two live corrections it had already earned:** `next.config.ts` was granted for the `frame-src`
entry and **never landed** — the file is untouched; and the new risk entry is **R-18, not R-9**,
because R-9 is taken and the register runs to R-17. The ruling's own text is stale on that number.

**`r4-profile`** — profile becomes a menu over the current route; `/profile` keeps redirecting.
**`L1-F8-T1` is already built** (`642cab0`) — move the delete-my-data flow, do not rebuild it. The map
release is a **deliberate privacy rule** (`MAP_ROUTES` in `persistent-map.tsx`), not route damage, so
a menu opening over `/map` stays inside it rather than defeating it — and that belongs in a comment.
Open question it was asked to rule: whether `/account` staying a real route (and therefore releasing
the map) is coherent or should also be an overlay.

**`r4-transition`** — SmoothUI under two hard gates: no new dependencies (**GSAP is not installed**),
and every import must map to a state in the matrix, because the design system's list of nine
micro-animations ends *"everything else stays still."* Prove the map is **not** unmounted across the
switch.

## Resuming

The lanes are addressable by name and hold their own context. Prefer resuming them over re-dispatching
from this document — it is a safety net, not a substitute. The first thing any resumed lane should do
is re-read its files on disk, because they are its own half-finished work and four lanes' edits are
interleaved in one tree.
