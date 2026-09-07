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
- List rows carrying the enrichment already stored per save (`tags`, `why_go`, `dishes`). **The detail
  view already renders all of it** (`place-sheet.tsx` :1203, :1273, :1277, :1161) — the row does not,
  and the detail's own problem is hierarchy rather than content
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

## 3a. Interaction, hover states and motion — and doing it in Tailwind

Measured in the codebase 2026-08-30: **97** uses of `focus-visible:`, **4** of `active:`, **0** of
`group-hover:`, **0** of `motion-safe:`, **163** arbitrary-value classes, and **36** registered
`@theme` keys — all of them colours, radii and fonts. So the product acknowledges a keyboard well and
a finger almost never, nothing on any screen responds to a hover somewhere else, and no utility exists
for a shadow, a duration or an easing.

### The state matrix

Every interactive element owes all six columns. A blank cell is a bug, not a style choice — and
**press** is the column this product is missing.

| Element | Hover | Focus-visible | Press | Selected / on | Disabled |
|---|---|---|---|---|---|
| Primary button | mint darkens a step | 2px ring, 3px offset | `scale-[.985]`, shadow drops a level | — | 45%, no pointer |
| Ghost / secondary | border → mint, tint wash | ring | `translate-y-px` | — | 45% |
| Icon button | surface → `card-2` | ring | `scale-95` | ink to full contrast | 30% |
| **List row** | row tints, **its pin lifts on the map** | inset ring | `scale-[.995]`, 90ms | left mint rule, tinted ground | — |
| Tag chip | border 15% → 45% | ring | `scale-95` | fills with the **tag's own** colour | — |
| Category chip | dot grows, label darkens | ring | `scale-95` | fills with **that category's** colour, not house mint | count 0 → 40% |
| Nav tab | label to full ink | ring | `scale-95` | mint icon + label, `aria-current` | — |
| Map pin | grows 1.1×, label appears | ring on the canvas focus proxy | — (no press on a canvas) | 1.28×, halo, sort-key to front | filtered out → 35% + shrink |
| Input | border warms | mint border + 3px ring | — | — | muted ground |
| Sheet handle | widens 34 → 44px | ring | tracks the drag | — | — |

### The micro-animation list, closed

| Name | What it does | Timing |
|---|---|---|
| `press` | Any pressable thing, within one frame | 90ms · standard |
| `row ↔ pin` | Hover or press a row → its pin lifts, neighbours dim to 45%. *These are the same object* | 160ms |
| `pin.select` | Scale to 1.28 with one expanding ring, then still | 220ms · emphasised |
| `filter.settle` | Filtered-out pins fade and shrink; entering rows stagger, keyed on id | 180ms + 40ms |
| `band.cross` | Pins cross-fade into their area pill instead of hard-swapping | 200ms |
| `pins.land` | Camera flight, then staggered drop. Paint-only | 900ms + 60ms |
| `sheet.stop` | Springs to the nearest stop. **Already correct — leave it** | spring |
| `count.tick` | A changed count counts up, only where the number is the news | 400ms |
| `enter` | Opacity + 4px rise. One rule, used everywhere, never elaborated | 140ms |

**Everything else stays still.** No continuous pin pulsing, no parallax, no animated gradients, no
spinner where the camera is already moving, no per-keystroke list animation. Under
`prefers-reduced-motion` all nine collapse to the opacity change alone — not to nothing, because the
pin just selected still has to be findable.

### Use Tailwind for it

1. **Register, and stop writing brackets.** Add shadows, easings, durations and the type scale to
   `@theme`. Tailwind v4 generates a utility per key, so `shadow-[var(--shadow-elevated)]` — written
   at eleven call sites — becomes `shadow-sheet`, and `duration-[220ms]` becomes `duration-base`. The
   163 arbitrary values collapse into names a reviewer can check.
2. **State in variants, not ternaries.** `aria-pressed:bg-tag-on`, `data-[state=open]:rotate-180`,
   `aria-[current=true]:text-mint`. The DOM already carries the attributes: 21 `data-[` uses, exactly
   one `aria-[`.
3. **`group` is how the row talks to the pin.** Zero `group-hover:` today, which is exactly why
   nothing responds to a hover elsewhere. Mark the row `group` and the disc, name and chevron move
   together — the same mechanism carries the row↔pin coupling.
4. **`motion-safe:`, not a global media query.** Eight `motion-reduce:`, zero `motion-safe:`.
   Inverting it makes the accessible path the default: the un-prefixed state *is* the reduced case,
   so an author cannot forget it.
5. **Press feedback is one utility.** `active:scale-[.985]` on the shared button, row and chip
   classes — roughly one line per component, and the most noticeable interaction fix available.
6. **Entry without a library.** Tailwind v4 ships a `starting` variant over `@starting-style`, so an
   enter animation is `starting:opacity-0 starting:translate-y-1` plus a transition. Confirm against
   the installed 4.3.3 before relying on it; keep `motion` for the sheet and the landing, where a
   spring is genuinely needed.

**Order:** registration first, in stage 1 — one file, and it unblocks everything else. Then press
feedback. Then `group` coupling, which is what makes the library and the map feel like one surface.
The choreographed moments come last, in the stages that own those screens, because they are the only
ones needing judgement rather than a utility.

## 4. Decisions, locked

| # | Decision | Ruling |
|---|---|---|
| 1 | The name | **No Crumbs.** Owner, 2026-08-30 |
| 2 | May the pin change colour? | **Yes, in stage 1.** Colour is the map's only encoded fact and it currently does not encode |
| 3 | Dark mode | **A signed pass in stage 5, or no toggle at all.** There is no third option: shipping a toggle onto what exists ships a rejected palette |
| 4 | The rail | **The facelift may not ship a more convincing fake.** The source-fetch split is the answer; `L0-F6` stays a real feature on the plan of record, not something the facelift funds to improve a demo |
| 5 | Collections index as a card grid | **Yes** — with generated covers, `archive/ux-collections.md` §1.6's argument dissolves. Recorded as reopening a ratified decision, not ignoring one |
| 6 | Typeface | **Manrope stays for UI.** ~~Archivo appears only in the wordmark~~ — **corrected 2026-08-31: Archivo was retired** by `brand-and-product-foundation.md` §3.1's second pass, dated the same day as this table. The display face is **Fraunces** (variable serif, `SOFT` 60, `WONK` on) and it carries the wordmark and the large editorial headings only; `h3`, `h4` and 15-17px card titles **stay Manrope**, because a serif at that size turns to mud. Archivo and Manrope are both grotesques, so pairing them was a near-miss — too similar to read as deliberate, too different to read as one family. Implemented in `8b470d6` / `fb2735f`; §3.1's single `SOFT` 60 is the **wordmark's** setting, not the whole face's, and shipping every call site at 60/800 gave a headline that read as a slab |
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
