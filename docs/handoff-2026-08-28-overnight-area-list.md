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

## OUTSTANDING — the map experience. This is the live task, not a footnote.

**Not started.** The session window ran out finishing the branch above. The brief below is the
owner's, recorded so it survives the handoff intact and does not get quietly re-scoped.

### The brief, as given (2026-08-28)

> "I want you to improve the map experience significantly. Right now I don't like how it looks or
> feels: the basemap/pins feel generic, the clusters aren't working for me, and it's hard to
> understand at a glance whether a place is a café, restaurant, bakery, bar, etc. I want the map to
> feel polished, visual, intuitive and fun — like a product people in their 20s would actually want
> to use."

Three named complaints, all still true of `main`:

1. **The basemap and pins feel generic.**
2. **The clusters aren't working.**
3. **You cannot tell a café from a restaurant from a bakery from a bar at a glance.**

The instruction on how to approach it, also verbatim:

> "First see how much better you can make the current MapLibre/mapcn experience. Don't assume
> today's implementation is the limit. You have freedom to rethink markers, clusters, categories,
> icons/emoji, labels, interactions, styling, etc. I'm intentionally not prescribing the solution."

> "Keep Google Maps in mind if you discover the current foundation is materially holding the
> product back. Don't build both or migrate just because Google is familiar — but don't let sunk
> cost stop you either. Optimize for the best product."

**Google Maps remains a live option.** D2 (MapLibre + CARTO) is not to be treated as settled if the
foundation turns out to be the thing limiting the product. There is a `vis.gl/react-google-maps`
demo surface already sitting in `git stash@{2}` from an earlier session.

### What I learned reading the code, so the next session starts warm

- **Pins carry no category signal at all.** Every saved place is an identical mint circle
  (`src/components/map/pin-paint.ts`). `MapPlace.category` is already `ExtractedCategoryHint`
  (`restaurant | cafe | bar | bakery | attraction | shop | other`), already carried to the surface,
  and already written into the GeoJSON feature properties — **the data is there and simply is not
  rendered.** Complaint 3 is a rendering gap, not a data gap.
- **The blocker is mapcn's `MapClusterLayer`, not MapLibre.** It exposes only `clusterColors` /
  `clusterThresholds` / `pointColor`; no icon, no marker slot, no radius prop. `applyPinPaint`
  already reaches past it with `setPaintProperty` after mount, which is a workaround, not a fix.
  The honest next step is to **stop using `MapClusterLayer` and add our own MapLibre source and
  layers** (`addSource` with `cluster: true`, a `symbol` layer with `icon-image: ['get','category']`).
  That is not a fork and not a migration — roughly 150 lines against an API we already depend on —
  and it unlocks per-category icons, real cluster design and label collision in one move.
- **Icons: draw them, don't font them.** MapLibre glyph fonts carry no colour emoji, so
  `text-field: '☕'` will not work. Render each category's marker once into a `<canvas>` and
  `map.addImage()` it — ~7 categories × 2 states (normal, selected) = 14 images, cheap and fully
  controllable (teardrop shape, white ring, category tint, emoji or drawn glyph inside).
- **On Google Maps, I have a read and not a measurement.** From the code alone, the limitation
  looks like one wrapper component rather than MapLibre itself, so I would spend the next session
  on custom layers first and re-ask the question with something real to compare. That is explicitly
  a provisional read — it should not be quoted back as a decision, and it does not close the option.
- **Untouched by this session:** the basemap itself (complaint 1). CARTO Positron was chosen to
  keep the map quiet so the mint pins are the only colour; the owner now calls the result generic.
  Positron vs. Voyager vs. a custom style vs. Google is an open question, and the previous rejection
  of Voyager ("cartoon POI glyphs, reads as a generic consumer maps app") was made under a brand
  brief that predates "fun, for people in their 20s".

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
