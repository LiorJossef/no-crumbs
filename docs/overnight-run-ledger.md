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
| **W1-5** | `83aa37b` | lead | pending | built | G4. New `kind: 'unsupported-link'`. **The existing test caught a flaw in the fix**: the first draft returned `none` on Go, and *"never returns `none` while there is something in the field"* rejected it — a dead Enter key is the regression the module was written to close. Go now opens manual add **blank**, which misses both failures at once. A **schemeless** bare domain stays `text` deliberately: `canonicaliseTikTokUrl('kolamba.co.uk')` returns `MALFORMED_URL`, byte-identical to `Kolamba`, so separating them means guessing a dot makes a URL — and that guess costs a place called `St. John` its name. The product may decline to read a link; it may not decide a place name is one |
| **W2-3** | `1eb78f5` `66747c2` | maps-geospatial | pending | built | Labels tiered by how much room a pin has, not by one zoom. Follow-up keeps a pin's name out from under the zoom controls — found in a screenshot, not by a criterion |
| **W2-5** | `cb464f2` | maps-geospatial | pending | built | The zero-places map framed from the browser time zone. **This commit also swept three files it did not own** — see *The staging incident* below |
| **W3-1** (moved) | `9af9ab5` | design-system-frontend | pending | built | Press constants relocated to `src/lib/interaction.ts`, the spec's path — a chip importing `PRESS_CHIP` from `button.tsx` would have made the constants look button-specific |
| **W3-3** | `d3cafc4` `30145d2` `979ebcc` | design-system-frontend | pending | built | `motion-reduce:` 10 -> 0 inside the lane; `motion-safe:` 0 -> 11+. **The finding worth more than the package:** a bare `transition-all` on the button base was running the hover fade and press translate **only for users who had asked for reduced motion**, because `PRESS_BEAT`'s `motion-safe:transition` already superseded it for everyone else. The inversion failing in exactly the direction it exists to prevent. Deleted, not prefixed |
| **W3-4** | `9514757` + | design-system-frontend | pending | partial | The button's matrix columns. Three files granted mid-package (`input.tsx`, `saved-place-edits.tsx`, `bottom-nav.tsx`); `ui/map.tsx` ruled **out of scope tonight** — 2,000 vendored lines holding 12 of the 26 hard-coded colours |
| **W4-4** | `2f01d93` | design-system-frontend | pending | built | `icon.svg`, `apple-icon.png`, `opengraph-image.tsx`, `manifest.ts`. **K11 0 -> 4.** One shared crumb path across all three sizes, mechanically enforced by `tests/unit/brand/crumb-path.test.ts`; `icon.svg` is the one legitimate copy (a static asset cannot import) so the test asserts it character-for-character |
| **W5-1** | `a6d7cf9` `f9acc17` | design-system-frontend | pending | built | Thumbnail and elapsed time on the row. Follow-up: a thumbnail that fails **before hydration** still falls back to the category disc |
| **W5-3** | `c9068c8` `03bb9c9` | design-system-frontend | pending | built | Tag facet with counts, mobile and desktop. No tag rendered that no place carries; the facet row is **absent** rather than disabled when the library has no tags |
| **W5-4** | `08d8a0b` | design-system-frontend | pending | built | **K10 0 -> 3.** `loading.tsx` for `/collections`, `/collections/[id]`, `/profile` |
| **W5-5** | `db3a7bc` `5169413` | design-system-frontend | pending | built | `12 of 32` visible, mobile and desktop |
| **W5-6** | `9e5ca3b` | design-system-frontend | pending | built | The description renders. **But no code path can put one in that column** — `createCollection(name, '')`, and the rename form has no field. Copy owed before the ten-line fix; routed to `product-lead` |
| **W6-2** | `b644385` | nextjs-architect | pending | built | The post on screen in ~1s while extraction runs. **Two round trips, no stream, and no better fake in place of one.** The rail's `source: 'done'` now fires when the fetch **resolves**; the old flag flipped right after the fetch was *issued*, behind a comment calling it "the honest approximation" — **deleted, not kept beside the real one.** Sequential rather than parallel on a measured reason: the adapter is cache-through on `public.sources`, so parallel calls would both miss a cold cache and double upstream cost for no latency gain. One `AbortController` over both; an abort in the preview arm is rethrown, not swallowed. A preview failure is silent and the probe stays the sole authority on failure, so two responses can never disagree |
| **W7-5** | `71ded3d` | design-system-frontend | pending | built | `error.tsx`, `not-found.tsx`, `global-error.tsx` brought into the family |
| — | `f71b9d8` | lead | — | landed | **A verification guard had gone blind.** The assertion that `P-002` never reaches a user matched `title:\s*'([^']+)'`; W4-1 correctly made `metadata.title` a `{ default, template }` object, the regex stopped matching, and the guard could no longer see the string it guards. It failed loudly only because an `expect(title).toBeDefined()` written as an afterthought was there. Now reads every quoted string in the block |
| — | `7a63020` | lead | — | landed | K12 repair: two hex literals inside a comment took the count to 28 against a ceiling of 26. Reasoning kept, literals dropped — a hex pasted into a comment does not move when the ramp does, and W0-2 retuned one the same night. **Not fixed by teaching the guard to skip comments** |
| — | `362c7a5` | lead | — | landed | `--radius-xs`, `--secondary-hover`, `--tag-selected-hover`, plus the sign-in sweep (10 -> 2 brackets). Records why `rounded-md` is **not** the answer for the four clamped button radii — Spec 2 §2.0 proposes it, and it would restyle four sizes 10/12px -> 14px, on the four W0-1 had just repaired |

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

## The staging incident — 2026-08-31 01:40

`cb464f2` ("feat(map): frame the zero-places map from the browser time zone") **carried three files
its author did not own and its message does not mention**: `tests/harness/measure-motion.mjs`,
`tests/harness/app-server.mjs`, `docs/overnight-harness-notes.md`. Their author had staged exactly
those three by name and was about to commit; the other agent's commit landed in between and took them.

This is the hazard §7b sets in its only block quote — *never `-a`, never `add .`, never `add -A`*.

**Ruling: no history fix.** Nothing is lost (content byte-identical at HEAD, tree clean for those
paths), and `revert`, `reset` and `rebase` are all forbidden by `git-workflow.md` §9.3 and would be
actively dangerous with four agents mid-write. The commit stands, misattributed, and is recorded here
instead. The agent whose work was taken **did not attempt a fix** and reported it immediately, which
was the correct call.

**The general lesson, which is sharper than the incident:** *staging by explicit path does not protect
you if a concurrent agent stages by wildcard.* Rule 2 only works if **every** agent follows it — one
agent's shortcut silently costs another agent their authorship, and the cost is invisible until
someone reads the history.

## Two harness self-catches, both worth more than the artefacts they corrected

**1. Ten screenshots labelled `signed-out` showed `Signed in as demo@example.com`.** The session
cookie was attached to every browser context. Every pixel honest, the filename a lie. Status 200, no
errors, manifest clean — **nothing could have caught it but opening the file.**

**2. Ten dev-mode screenshots of five different `?state=` screens were all the same idle paste
screen.** Next 16's dev server returns **403 on its own `_next/static/chunks/*`** when driven
cross-origin at `127.0.0.1`, so React never hydrated and the seam's effect never ran; the
server-rendered HTML painted perfectly and photographed beautifully. Diagnosed by grepping the served
chunk for the compiled guard and finding it correctly folded to *enabled* — the code was fine and was
never running.

Both are now mechanically guarded: every capture asserts a React root exists (`hydrated`) and that the
screen it reached is not the screen it came from (`notExpect`), and **the harness exits non-zero**.
Its author's own conclusion is the one to carry: *a harness that cannot fail cannot be evidence — and
mine could not, twice.* That is also §7's rule arriving from the other direction: a builder's own
green result is the least reliable evidence available, demonstrated on itself.
