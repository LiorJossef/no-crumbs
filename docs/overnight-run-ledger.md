# Overnight run — ledger

> One row per work package, appended as the run proceeds. Protocol: `docs/overnight-run-plan.md` §7.
> A package closes only on an independent pass by an agent that did not build it.

**Branch:** `no-crumbs-implementation` · **Baseline tag:** `pre-facelift` (`1b79e9c`)

## Baseline re-measured 2026-08-31 00:39 (§4)

| Metric | Plan's baseline | Re-measured | Agrees? |
|---|---|---|---|
| Tests passing | 2017 in 114 files | **2017 in 114 files** | yes |
| `@theme` keys | 36 | **36** | yes |
| Arbitrary-value classes | 166 | **166** | yes |
| Raw `var(--mint-N)` call sites | 75 | **75** | yes |
| `active:` uses | 3 | **3** | yes |
| `group-hover:` uses | 0 | **0** | yes |
| `motion-safe:` uses | 0 | **0** | yes |
| `loading.tsx` files | 0 | **0** | yes |
| Brand asset files | 0 | **0** | yes |
| Hard-coded hex in `*.tsx` | (K12, uncounted) | **26** | new baseline |

Every published number reproduced. No correction owed to §4.

## Packages

| ID | Commit | Built by | Verified by | Verdict | Evidence |
|---|---|---|---|---|---|
| **W0-1** | `76fac7f` | design-system-frontend | pending | built | `@theme` 36 -> **80** (K4 >= 60 met). Utilities proven by compiling the real `globals.css` with Tailwind 4.3.3's own `compile()`, not by reading it. Found the `--radius-md` defect to be **worse than documented**: `min(var(--radius-md), 10px)` with the token undefined is invalid at computed-value time, so `border-radius` resolved to `0` and four button sizes were rendering **square**; `rounded-lg` did not rescue them because `twMerge` strips it when a size adds its own `rounded-*`. Also caught a silent trap: Tailwind's `duration` utility resolves against `--transition-duration`, so a `--duration-base` key registers cleanly and generates **no class at all** |
| **W0-2** | `9117d7d` | design-system-frontend | pending | built | No hex literal left in `category-display.ts`; map layers read named exports from the new `src/ui/place/palette.ts`; `--category-*` tokens are the DOM twin, with a drift test. Café **deliberately retuned** `#8A5A3B` -> `#6F4A2B`: CIEDE2000 restaurant/café was **14.8** against 36-38 everywhere else in the palette, and only 4 L* points apart. New value is ΔE 20.1 with a 12-point lightness gap, still brown (hue 26°), 7.0:1 on white. Rendered both palettes as 26px discs before committing |
| **W0-3** | `d7a1040` | design-system-frontend | pending | built | Raw `var(--mint-N)` call sites 75 -> **0** (K6 wanted <= 10). Arbitrary values 166 -> 96 en route to K5's <= 60 |
| **W1-2** | `6d5a994` | ai-extraction | qa-reliability (running) | built | G2. One number was doing two jobs; split into `CANDIDATE_CAP = 12` (the keep-cap, applied by truncation **after** the per-item parse so a malformed element cannot eat a slot) and `FLOOD_GUARD_CANDIDATES = 24` (the `09` §3.3 guard, now the envelope bound). New `PartialExtractionResult.truncated`, deliberately **not** folded into `dropped` — "we do not carry more than the cap" is a different fact about the model's reply from "the model sent us something malformed" |
| **W1-3** | `78f4ffa` | ai-extraction | qa-reliability (running) | built | G3. `MAX_CANDIDATES` 7 -> 8. **Plan correction:** `GEMINI_MAX_CANDIDATES` was already 8, so only one constant moved and the package's real content is that the two caps now *agree*. 8 is a ceiling, not a way-point — bisected live 2026-08-27, `maxItems` 9-12 all return a bare `400 INVALID_ARGUMENT`. Provider requests per import rise 7 -> 8, one more paid lookup, stated in the commit body |
| — | `7d7ec66` | lead | — | landed | W1-3 fallout. `probe.test.ts` hard-coded 7 and failed; now derived from `MAX_CANDIDATES`, because the digit it pinned is owned by another module |
| — | `f856ce7` | ai-extraction | — | landed | W1-2 follow-up. `truncated` was honest in the type and invisible in the logs. Its own event `extraction.candidates_truncated` rather than a second `reason` on `candidates_dropped`, so a healthy 14-venue listicle stays distinguishable from an unreadable reply in any query over these logs |
| — | `bc7d8cb` | qa-reliability | — | landed | The harness. See §Harness below |
| **W1-6** | `7119adc` | nextjs-architect | pending | built | Every item traced rather than assumed dead: `kind: 'results'` is never constructed, so `ResultsScreen`, `CandidateRow` and `saveConfirmedCandidates` fall with it. They carried a **second answer to "how does a candidate get confirmed?"** — one posting place facts rather than the positions `candidate-place.ts`'s authority boundary allows. The footer's live disjunct is kept. Two cross-module invariants that made branches unreachable are **written down at the branches** rather than deleted with them. 2,482 -> 2,322 lines |
| **W1-4** | `ddae298` | nextjs-architect | pending | built | G5. `arrivesTicked` splits *would* Save write this from *should* Save write it unasked. Withholds the tick from `capped` and `not_attempted` only — the two views the resolver never looked at. `unresolved` and `failed` **keep** their tick: we looked and got nothing, which is the degraded path the owner ruled in on 2026-08-28. The distinction the package exists to protect survives |
| **W1-1** | `04ba93b` | maps-geospatial | pending | partial | The zero-places sheet rests at `half`, so the subhead and `Add a TikTok` are on screen at 390×844. Snapshotted at mount rather than derived live — a live expression flips to `peek` the instant the first import lands, framing the just-saved places for a 128px strip behind a sheet covering 55% of the viewport |
| **W2-1** | `5cd7ce8` | maps-geospatial | pending | built | **Defect 0a.** Keeps the box, deletes the ceiling. *Removing a ceiling is not restoring a floor* — a floor discards the box, and for a Tel Aviv + Tokyo library that is `Math.max(2, 8.65)` over the centroid of both, i.e. open sea. **A finding the spec did not have:** the ~200px summary-pill allowance lowers the fit, which pushes the camera back into the band that draws the pills it is paying for — measured z8.78 bare vs z7.68 with allowance on the owner's own five-area library. Fit is two passes; cannot bounce, because padding only lowers zoom. Also surfaced a **pre-existing** degradation, recorded not repaired: a four-city library does not fit a 390px phone at any allowed zoom |
| **W2-2** | `0609efa` | maps-geospatial | pending | built | Scoped as test-only — *"the arm is believed correct and merely unproven"*. **It was not correct.** `handleDragEnd`'s docblock claimed MapLibre's keyboard handler pans through the same drag machinery; read against the installed 6.4.1 that is false — `handler/keyboard.ts` calls `easeTo` directly, sets no `panDelta`, so no `dragend` fires and **a keyboard pan retired no framing at all.** Fixed by the general rule the other three handlers are special cases of: a camera event carrying an `originalEvent` was caused by a person |
| **W2-4** | `ba94c49` | design-system-frontend | pending | built | Pressed chip fills with that category's own colour, from `palette.ts`, not house mint. Counts render. Taken as a knowing exception to rule 6a's "state comes from variants", because four category colours come from data and four hard-coded variants would be a palette by another name |
| **W3-1** | `67af561` | design-system-frontend | pending | built | `active:` 3 -> 9. Three shared constants at the matrix's three depths — `PRESS_BUTTON` 98%, `PRESS_ROW` 99%, `PRESS_CHIP` 95%. Press is a variant on a shared class string, never a ternary. `active:scale-98` was **measured to compile** as a bare value under the installed Tailwind 4.3.3 rather than assumed, so the package that retires brackets ships none |
| **W3-3** | `d3cafc4` | design-system-frontend | pending | partial | `motion-safe:` 0 -> 11. Sheet heading done; the rest of the repo's motion still to invert |
| **W4-1** | `8b470d6` | design-system-frontend | pending | built | The product was shipping its **repo codename `P-002`** to users — in the tab, in every bookmark, and beside the mark — behind a comment calling the name an open decision. Four strings, all from the copy deck, none invented. The description deliberately omits the name |
| **W4-2** | `0be1cf7` | design-system-frontend | pending | built | The crumb silhouette replaces the teardrop |
| **W4-3** | `66747c2` | design-system-frontend | pending | built | Pins take the crumb outline in the same bitmap box. **Deliberate deviation from `no-crumbs-design-system.html`, agreed with the lead:** the design draws a plain white aperture, but dropping the category glyph would leave **colour as the sole carrier of category** — an accessibility regression, and a bad one on a palette where two of four colours were measured at ΔE 14.8 until tonight. §3.1's *face on chrome, silhouette on data* holds either way: a fork is not a face |
| **W6-1** | `7d27903` `1aaa246` `f7de729` `795f909` | nextjs-architect | pending | built | The 2,482-line client split by beat. Largest file now **452 lines** (`review-screen.tsx`), `import-page-client.tsx` **2,482 -> 395**. Four commits rather than one, each independently typecheckable |

## Wave 0 close gate

`npm run verify` **green** at `d7a1040` — **117 test files, 2048 tests passing**, against a 2017/114
baseline. Lint, typecheck, layer guard, migration grants, schema, agents and claude-config all pass.

## The harness, and what it proved

`npm run build` **succeeds with no `.env.local`** — Next.js reads Supabase config at request time, not
build time. `/` and `/sign-in` render; `/map`, `/import`, `/collections` and `/profile` 500 because
they call `createClient()` unguarded. The map itself **needs no key at all**.

So the seam is the *data* read, which is plain HTTP to PostgREST/GoTrue. `tests/harness/` stands up a
stub at that address and `next start` renders the **real components** against fixture rows at
0/3/30/300 places, both gate viewports. No `.env` file is touched, read or created. Everything it
produces is labelled **stub-backed**: it evidences rendering, layout, camera and colour, and evidences
**nothing** about a query, a join or an RLS policy.

**Two defects in the test machinery, both pre-existing:**
1. `playwright-core` 1.62.1 wants Chromium **1234**; the cache held **1223** and **1228**, so
   `chromium.launch()` threw and **the whole 50-test e2e suite was unrunnable in this checkout.**
   Fixed by the lead: `npx playwright install chromium`.
2. **Neither Playwright project could produce either gate viewport.** `Pixel 7` is 412x839 and
   `Desktop Chrome` is 1280x720; the gates are written against 390x844 and 1440x900. So Q1, W1-1,
   W3-2, W6-7 and W7-6 were all specified against numbers this repo could not produce, and nobody had
   noticed because nobody had run them. New `gate-mobile` / `gate-desktop` projects added; the
   existing two are untouched.

## What the baseline actually looks like — the run's diagnosis, in two screenshots

Photographed at `55698ae`, 390x844, stub-backed.

**Zero places:** a stock CARTO basemap of Israel with no user content of any kind. The sheet is
collapsed to `Your map starts here. ⌃`, so the subhead **and the `＋ Add a TikTok` button are inside
it and invisible** — on a phone the only visible way forward is the mint `＋` in the tab bar. This is
the screen the demo opens on and the screen a failed import returns to.

**300 places:** the same screen. Three hundred saved places — the entire value of the product —
render as **one white pill reading `Tel Aviv-Yafo  300`**, over the same stock basemap, with
`300 in Israel` in the collapsed sheet.

**That is the whole diagnosis in one line: at zero places and at three hundred, the product shows the
same screen, and the only difference is a number.** Defect 0a is not "the home screen draws no pins";
it is that the map never shows the user anything they saved, at any library size. The bones
underneath are good — clean CARTO tiles, correct attribution lifted clear of the sheet, a confident
mint `＋`. What is missing is the user's own content, which is exactly what `facelift-plan.md` §1
means by "the product is disciplined, not sloppy; what is missing is ambition".
