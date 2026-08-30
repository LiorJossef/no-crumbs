# The facelift — plan of record

> **Locked 2026-08-30 on the owner's instruction.** Audited by six specialists in parallel against the
> code, not the documents. Nothing in it is implemented yet.
>
> Interactive version, with live mockups and the running animations:
> [`no-crumbs-design-system.html`](no-crumbs-design-system.html).
>
> Companion documents: [`voice-and-vocabulary.md`](voice-and-vocabulary.md) governs strings;
> `brand-and-product-foundation.md` §3 carries the name and the mascot ruling.

## 1. What the audit found

The product is disciplined, not sloppy. Almost nothing has to be undone — touch targets are measured
at 375px, bidi isolation is handled on untrusted tag text, the map's licence attribution is lifted
clear of the sheet because a credit nobody can see is a compliance defect. What is missing is ambition,
and it shows up as absences. Twelve, in impact order:

| # | Finding | Evidence |
|---|---|---|
| **1** | **The home screen draws no pins at all.** Pins render at `PIN_BAND_MIN = 8.5`; the home camera rests at `HOME_LANDING_ZOOM.max = 8.0`. The first five seconds of a map product contain zero of the user's places | `zoom-bands.ts`, `place-marker-layer.tsx` — verified independently after two specialists reported it |
| **2** | The payoff fact renders for **zero frames**. `3 places found` is computed at `import-page-client.tsx:502` and overwritten at `:509`; React batches both | `import-page-client.tsx` |
| **3** | The flagship flow imports **no animation library at all**. `motion@13` ships and is used in two files, neither of them the import client | `import-page-client.tsx` imports |
| **4** | Category colours are hard-coded outside the token system, and two of the four do not separate at pin size (`#C2452F` brick vs `#8A5A3B` brown) | `ui/place/category-display.ts` |
| **5** | `--radius-md` is referenced four times and **never defined**, so four button sizes likely render with an invalid radius. Static finding; needs a browser check | `components/ui/button.tsx` |
| **6** | The token drift is abstraction, not hex: **~64 call sites** reach into `var(--mint-*)` rather than a semantic role. No elevation scale, no motion tokens, no type scale, and `--muted` is byte-identical to `--background` | `globals.css` + call sites |
| **7** | Dark mode is **unreachable**, not merely stale — nothing in `src/` ever applies `.dark`, and three modules read `prefers-color-scheme` independently | `globals.css`, `ui/map.tsx`, `use-disc-theme.ts`, `country-flag-image.ts` |
| **8** | **No loading states anywhere** — zero `loading.tsx`, zero `<Suspense>` in the app directory | `src/app/**` |
| **9** | No favicon, app icon, manifest or link preview. Every collection invite previews as a bare URL | `src/app/`, `public/` |
| **10** | The no-places screen shows the user nothing — not the post, not the caption, no thumbnail — and the standalone `/import` route silently withholds its primary recovery by passing no `onAddManually` | `import-page-client.tsx` |
| **11** | A collection cover is six pixels of stripe | `components/collections/collection-cover.tsx` |
| **12** | Six `backdrop-blur` surfaces sit over a live WebGL canvas — the standing 60fps risk a heavier treatment would multiply | six call sites |

**Preserve unchanged:** the sheet's three-stop model and its gesture arbitration, and the review card's
provenance logic (*pin from the map data* / *waiting on your pick* / *pin from the caption*, with
`not_attempted` kept distinct from `no_match`). That reasoning is the best work in the repo; only its
visual weight is wrong.

## 2. Capability — what the map can actually do

Labelled per the house rule. Checked against MapLibre GL **6.4.1** as installed and the CARTO tile
schema fetched 2026-08-30.

| Capability | Status | Note |
|---|---|---|
| Camera choreography (`flyTo` curve/speed, chained `easeTo`) | **VERIFIED** | `06` §9.2 already specifies `curve: 1.42`; never built that way |
| Staggered pin landing | **VERIFIED** | No per-feature primitive; achievable paint-only over a per-feature `order` — no relayout, no re-collision |
| Pulsing selected pin | **VERIFIED** | `StyleImageInterface.render()` with WebGL-backed image data |
| Feature-state selection | **VERIFIED** | Strictly better than today's layout-property bitmap swap; needs `promoteId` |
| **3D extruded buildings** | **VERIFIED** | `render_height`, `render_min_height`, `hide_3d` are present in `carto.streets/v1` tiles.json. **An earlier draft of this plan said the opposite** — it read the style JSON, not the tile schema. Gate at z15.5, cap pitch, measure on a device |
| Globe projection | **VERIFIED** | In 6.4.1, and animatable via a `[from, to, t]` triple. Verify against `renderWorldCopies: false` |
| A night basemap | **Real work** | 93 layers over one vector source; a per-layer recolour, not a token swap |
| Terrain / hillshade / fog | **UNAVAILABLE** | Needs a `raster-dem` source CARTO does not ship; `fog-*` requires terrain |
| Video inside a pin | **UNAVAILABLE** | A still inside a pin is verified — it is how the flag discs already work |

**Measured budget:** 2,000 pins with labels gated → 19.0 ms median / 60.5 ms p95; the same 2,000 with
labels forced on → 34.0 ms, ~29 fps. SwiftShader, so an upper bound and a ranking. It is why labels are
tiered by zoom rather than switched on.

## 3. The five stages

Foundation first, so stages 2–5 are token edits rather than rewrites, and so parallel branches do not
fight over the same files. Estimates are working days for one developer with specialists in parallel.

### Stage 1 — Foundation, and the name · ~3 days · `design-system-frontend`
- Elevation, motion, type and surface scales, registered in `@theme`
- State colours — success stops being the brand colour
- Category ramps tokenised out of `category-display.ts`; one palette module for MapLibre expressions
- ~64 raw `var(--mint-*)` call sites collapsed onto semantic roles
- **`--radius-md` defined**, and the button sizes verified in a browser (finding 5)
- One theme source of truth; `backdrop-blur` banned over the live canvas
- The name, the mark, favicon, app icon, manifest, OG image

**Demoable:** a link that previews as a product, a tab you can find, and a name to say out loud.

### Stage 2 — The map at rest · ~4 days · `maps-geospatial` + `ux-interaction`
- **Finding 1 first.** Decide what the overview is, and fix the framing replay that a `ResizeObserver`
  hit re-applies until a user gesture retires it
- Cover the untested `{ kind: 'user' }` arm that retires it
- Pins present and named at rest; labels tiered by zoom, not gated at 14
- Category colour doing work — pins, chips, counts, the pressed filter
- The sheet's 128px peek showing real rows instead of one grey sentence
- One chrome vocabulary; press, hover and focus feedback on every control
- A designed zero-places first run, replacing the guessed `EMPTY_LIBRARY_BOUNDS` region

**Demoable:** opening the app onto a map you can read from across the room.
**Verification:** `qa-reliability` confirms the framing fix independently — the agent that built it is
never the sole source of evidence that it works.

### Stage 3 — The library · ~4 days · spec `ux-interaction` / build `design-system-frontend`
- List rows carrying the enrichment already stored per save (`tags`, `why_go`, `dishes`)
- Place detail sectioned, with the post as its hero
- Skeletons and `loading.tsx` for every awaiting route (finding 8)
- Real empty, all-filtered and no-match states
- Generated collection covers from the collection's own bounding box; the index as a card grid
- A shared page frame, header and split layout for the flat signed-in surfaces

**Demoable:** retrieval — *near me*, *not been yet*, map and list narrowing in the same frame.

### Stage 4 — The moment · ~5 days · `nextjs-architect` then `design-system-frontend`
- **Decompose first.** Split `import-page-client.tsx` by beat; delete ~180 lines of unreachable code
  carrying a second, competing candidate design
- Source fetch split into its own sub-second request — the post on screen while extraction runs
- The post shown on the rail **and** on the no-places screen
- Two honest steps; the payoff fact held ~700 ms instead of discarded (finding 2)
- Provenance promoted into the badge slot; **no invented confidence number**
- The standalone route stops losing manual add (finding 10)
- Camera flight, then staggered pin landing, paint-only

**Demoable:** paste to pins in one gesture, and the honest beat — a post that names nothing, handled as
a destination.

### Stage 5 — The night map, and the edges · ~4 days
- `.dark` rebuilt against the mint ramp, and actually reachable
- A night basemap palette across the style's 93 layers
- Account menu, delete-my-data, sign-out (`L1-F8-T1`)
- Error, 404 and the global error boundary brought into the family
- Contrast, focus and 44px pass; 60fps pass on a real device

**Demoable:** a new user's first session end to end, then the toggle.

## 4. Decisions, locked

| # | Decision | Ruling |
|---|---|---|
| 1 | The name | **No Crumbs.** Owner, 2026-08-30 |
| 2 | May the pin change colour? | **Yes, in stage 1.** Colour is the map's only encoded fact and it currently does not encode |
| 3 | Dark mode | **A signed pass in stage 5, or no toggle at all.** There is no third option: shipping a toggle onto what exists ships a rejected palette |
| 4 | The rail | **The facelift may not ship a more convincing fake.** The source-fetch split is the answer; `L0-F6` stays a real feature on the plan of record, not something the facelift funds to improve a demo |
| 5 | Collections index as a card grid | **Yes** — with generated covers, `ux-collections.md` §1.6's argument dissolves. Recorded as reopening a ratified decision, not ignoring one |
| 6 | Typeface | **Manrope stays for UI.** Archivo appears only in the wordmark, which is a drawn asset, not a typeface in the product |
| 7 | Copy drift | **The running code wins**; the deck follows in the same commit. See `voice-and-vocabulary.md` §6 |

## 5. The risk, and the one rule that contains it

**The most likely way this makes the product worse is that it teaches the product to over-claim.**
Every instinct a facelift brings — richer motion, confident copy, a smoother rail, a celebratory
confirm — pushes against the rule this product is built on, that an uncertain result beats a
confidently wrong one. The failure mode is not an ugly product; it is a beautiful one that fakes
streamed stages and makes the most common outcome feel like a bug.

**Ruling: no change in this plan may increase what the product asserts.** Checkable, by someone who did
not build it: the rail makes no stage claim the server did not send, and no screen presents inferred
content in the same visual register as verbatim content.

## 6. Landing strategy while CI is down

**Measured 2026-08-30 21:0x:** GitHub Actions still cannot start a runner — the four jobs report
`steps=0`, which is a job that never began. `#101` and `#102` merged anyway, which means the
`merge:pr` gate was bypassed rather than passed. That is worth knowing before anyone assumes `main` is
verified.

Because stage 1 touches the token files every later stage edits, five branches all cut from `main`
would converge into one enormous conflicted diff the day the runner returns. So:

- Land the stages as a **stacked chain** — each branch based on the previous, not on `main`
- **Hold the stack at two deep.** If stage 3 would be the third unlanded branch, stop building and fix
  the runner
- Local `npm run verify` plus a real-device pass per stage is the evidence in the meantime, and it is
  **not** green: verify covers one of CI's four jobs

Owner action, unchanged and still the cheapest unblock available: <https://github.com/settings/billing>.
