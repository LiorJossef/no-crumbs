# Handoff — 2026-08-28, area list finished; map visual work NOT started

## What shipped

[PR #49](https://github.com/LiorJossef/P-002/pull/49) — `feat/stable-area-list`, three atomic commits.

The unfinished branch did not compile: `viewport.ts` had been stripped and `active-area.ts`
written, but **no call site was migrated**. It is finished and the direction was right.

1. `feat(map): report whether a settled camera was the user's own pan` — `onViewportChange` now
   carries `userInitiated`, set from `dragend`. MapLibre fires `dragend` only from its own drag
   handlers, never from a programmatic camera command, so a camera the user did not move
   *structurally cannot* rewrite the list. That is the `21 → 9` fix.
2. `feat(map): model the active area as a place cluster, not a rectangle` — pure module, 33 tests.
3. `feat(map): bind the saved-places list to an area, not the viewport` — the wiring, plus the
   `Elsewhere` section and the deletion of `EmptyViewport`.

Camera movers went 7 → 4. `Show my places` / `Show all matches` are gone; so is the settled-search
flight (narrowing never navigates).

## Verified

`npm run verify` green — 978 tests, 54 files. Run in the app at 1280×800 against the live local
library: `9 places in Tel Aviv-Yafo`, all nine rows in library order, `Elsewhere → London ·
12 places ›` beneath them.

**Not verified by hand:** the pan-across-boundary switch, and mobile at 375×812. The browser pane
went unresponsive before I reached them. The rules are unit-tested; the *gesture* is not.

## What did NOT happen — the map visual overhaul

This was the larger half of the request and I did not start it. The session window ran out
finishing the branch. What I learned while reading the code, so the next session starts warm:

- **Pins carry no category signal at all.** Every saved place is an identical mint circle
  (`src/components/map/pin-paint.ts`). `MapPlace.category` is already `ExtractedCategoryHint`
  (`restaurant | cafe | bar | bakery | attraction | shop | other`) and is already carried to the
  surface and written into the GeoJSON feature properties — **the data is there and simply is not
  rendered.** Café vs. bar vs. bakery is unreadable on the map today.
- **The blocker is mapcn's `MapClusterLayer`.** It exposes only `clusterColors` /
  `clusterThresholds` / `pointColor`; it takes no icon, no marker slot, no radius prop. The
  existing `applyPinPaint` already reaches past it with `setPaintProperty` after mount. The honest
  next step is to **stop using `MapClusterLayer` and add our own MapLibre source + layers**
  (`addSource` with `cluster: true`, a `symbol` layer with `icon-image: ['get','category']`). That
  is not a fork and not a migration — it is ~150 lines against the MapLibre API we already depend
  on, and it unlocks per-category icons, real cluster design and label collision.
- **Icons: draw them, don't font them.** MapLibre glyph fonts do not carry colour emoji, so
  `text-field: '☕'` will not work. Render each category's marker once into a `<canvas>` and
  `map.addImage()` it — ~7 categories × 2 states (normal, selected) = 14 images, cheap and fully
  controllable (teardrop, white ring, category tint, emoji or glyph inside).
- **I did not evaluate Google Maps.** On what I read, the current foundation is *not* what is
  holding the product back — the limitation is one wrapper component, not MapLibre. I would spend
  the next session on custom layers before considering a provider change. That is a read, not a
  measurement.

## Needs your decision

1. **Category vocabulary on the map.** Seven `ExtractedCategoryHint` values exist, but the scorer
   collapses `bakery → cafe` and maps `attraction`/`shop`/`other` to `null`. The map can show all
   seven distinctly. Do you want seven pin types, or fewer, louder ones?
2. **Emoji or drawn glyphs.** Emoji is faster to ship and reads as fun; a drawn icon set is more
   "premium and quiet", which is what `brand-and-product-foundation.md` §5 currently says. These
   pull in opposite directions and the brand doc is the older input.

## Repo state

- `main` clean and green; PR #49 open and awaiting CI.
- The stale `wt-arealist` worktree is removed. Its uncommitted work is now in the three commits
  above, and a raw backup is in this session's scratchpad.
- `UX-LIST-SPEC.md` moved from the repo root to `docs/ux-stable-area-list.md`.
- No specialist agents were used: this session ran under an explicit instruction not to invoke
  them. Everything above is my own work.

## Also noted

You asked mid-session for **lean comments and Clean Code**. I applied it to everything I wrote
(the new sheet/panel pieces, the page-client callbacks) and thinned the files I touched. **The
rest of the repo is still heavily over-commented** — `map-surface.mapcn.tsx`, `pin-paint.ts`,
`clusters.ts` and `score.ts` are the worst. A dedicated thinning pass is worth its own branch;
saved to memory as a standing rule so it does not need re-stating.
