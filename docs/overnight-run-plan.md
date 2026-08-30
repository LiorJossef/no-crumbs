# Overnight run — implementation plan

> **Written 2026-08-30 for a fresh Claude Code session driving multiple agents.** Everything here was
> measured against the code on `docs/no-crumbs-brand-and-facelift-lock` (which has `origin/main`
> merged in), not copied from another document. Re-measure before you trust any number: §4 gives the
> commands.
>
> This is the *run sheet*. The reasoning behind it lives in the documents in §2 — read them, do not
> re-derive them.

---

## 1. What this run is

The product is **No Crumbs**: paste a TikTok link, the place it names lands on your own private map.
It works end to end and it feels like an empty demo. Two locked plans say why and what to do:
[`facelift-plan.md`](facelift-plan.md) (how it looks) and [`growth-plan.md`](growth-plan.md) (what the
client gets).

This run executes **the parts of both that can be built and verified without CI**, because CI cannot
currently start a runner (§9). It is organised into **nine waves and 49 work packages** — eight build waves and a stabilise wave that runs only once they are all closed. Every package has an exit criterion a
different agent can check — and §8a adds four judged gates, because none of the numeric targets
measures whether the result is any good.

**Definition of done: all 49 packages closed, the four quality gates in §8a passed, `npm run verify`
green, no regression in the 2,017-test baseline, and every KPI in §5 met.** Nothing is "done" because
an agent says so — see §7.

**The goal is not the checklist.** It is a product that works, completely, and is worth looking at.
The packages are how that gets built and the KPIs are how it gets checked; §8a is how you tell whether
it actually happened.

---

## 2. Read before doing anything

In this order. Do not skip: this repo's documents carry reasoning that is expensive to rediscover and
several of them record decisions that look like bugs until you read why.

| # | Document | What you need from it |
|---|---|---|
| 1 | [`../CLAUDE.md`](../CLAUDE.md) | The house rules. Wins where anything disagrees |
| 2 | [`working-agreement.md`](working-agreement.md) | How work is done here, and which decisions are the owner's (§7) |
| 3 | [`git-workflow.md`](git-workflow.md) | Branch → PR → CI → merge. **§9.3 is the destructive-action list** |
| 4 | [`agent-guardrails.md`](agent-guardrails.md) | What a specialist may never do |
| 5 | [`current-state.md`](current-state.md) | What is actually true today. Item **0a** is this run's first target |
| 6 | [`facelift-plan.md`](facelift-plan.md) | The five stages, the interaction spec (§3a), the locked decisions (§4) |
| 7 | [`growth-plan.md`](growth-plan.md) | The five defects, what bursts break, the Now list |
| 8 | [`voice-and-vocabulary.md`](voice-and-vocabulary.md) | **Binding on every user-facing string you write** |
| 9 | [`brand-and-product-foundation.md`](brand-and-product-foundation.md) | §3 the name, §3.1 the mascot ruling, §5 the visual direction |
| 10 | [`no-crumbs-design-system.html`](no-crumbs-design-system.html) | The same material rendered, with the state matrix and mockups. Open it in a browser |
| 11 | [`ux-map-is-the-query.md`](ux-map-is-the-query.md) §5 | The zero-state screen, specified and unbuilt — package **W1-1** |
| 12 | [`spec-no-places-found.md`](spec-no-places-found.md) | The modal outcome's screen. Its strings do not change |
| 13 | [`06-map-and-places-decision.md`](06-map-and-places-decision.md) §3.1 | The Google ToS gate. Read before touching anything map-adjacent |

---

## 3. Hard rules — these are not style preferences

1. **Never commit to `main`.** One kebab-case, prefixed branch per work package, cut from the branch
   named in §6. `.githooks/pre-push` refuses a direct push; do not work around it.
2. **`npm run typecheck` on every commit — that is the whole inner loop** (owner decision). Full
   `verify`, which includes the suite, runs at **every wave close** and again in Wave 8. A wave does
   not close on a red gate. `verify` is **not** CI — it covers one of CI's four jobs.
3. **No change may increase what the product asserts.** This is the load-bearing rule of the whole
   codebase. The rail claims no stage the server did not send; no screen presents inferred content in
   the same visual register as verbatim content; an uncertain result beats a confidently wrong one. A
   beautiful lie is a failed package.
4. **Every user-facing string obeys [`voice-and-vocabulary.md`](voice-and-vocabulary.md).** The name
   appears on six surfaces and nowhere else. Sentence case. No exclamation marks, ever.
5. **The agent that built a thing is never the sole source of evidence that it works.** Every package
   is verified by an agent that did not write it (§7).
6. **Every colour is a token.** A hard-coded colour is a review failure. MapLibre style expressions
   cannot read CSS variables — they take a named export from the palette module built in W0-2.
7. **Never delete or rewrite a comment explaining *why*.** This codebase's comments are its design
   record. If a comment becomes wrong, update it in the same commit.
8. **Do not touch:** `supabase/migrations/*` (no new migrations this run), `.claude/settings.json`,
   `CLAUDE.md`, or anything in [`git-workflow.md`](git-workflow.md) §9.3. If a package seems to need
   a migration, it is out of scope — record it and move on.
9. **Uncommitted changes in the tree at start-up are owner-owned.** Never reset, clean, stash or sweep
   them into a commit.

---

## 4. The baseline, measured 2026-08-30 22:29

Re-measure at the start of the run. If a number differs, trust your measurement and say so.

| Metric | Baseline | Command |
|---|---|---|
| Tests passing | **2017** in 114 files | `npx vitest run` |
| `@theme` keys | **36** | `sed -n '/@theme inline/,/^}/p' src/app/globals.css \| grep -c '^\s*--'` |
| Arbitrary-value classes | **166** | `grep -rohE '\b(bg\|text\|border\|shadow\|rounded\|ring\|duration\|ease)-\[[^]]+\]' src --include='*.tsx' \| wc -l` |
| Raw `var(--mint-N)` call sites | **75** | `grep -rohE 'var\(--mint-[0-9]+\)' src --include='*.tsx' \| wc -l` |
| `active:` uses | **3** | `grep -roh 'active:' src --include='*.tsx' \| wc -l` |
| `group-hover:` uses | **0** | `grep -roh 'group-hover:' src --include='*.tsx' \| wc -l` |
| `motion-safe:` uses | **0** | `grep -roh 'motion-safe:' src --include='*.tsx' \| wc -l` |
| `loading.tsx` files | **0** | `find src/app -name loading.tsx \| wc -l` |
| Brand asset files | **0** | `ls src/app/icon.* src/app/apple-icon.* src/app/opengraph-image.* src/app/manifest.* 2>/dev/null \| wc -l` |

---

## 5. Targets — the KPIs for this run

100% of these, or the run is not finished. Each is a command, not a judgement.

| # | Target | Measured by |
|---|---|---|
| K1 | **All 49 packages closed** and independently verified | §7's ledger |
| K0 | **The four quality gates in §8a passed** | judged, by an agent that built none of it |
| K2 | `npm run verify` **green** at the top of the stack, after Wave 8 | the command |
| K3 | Tests **≥ 2017 + one regression test per defect fixed** (≥ 2022) | `npx vitest run` |
| K4 | `@theme` keys **≥ 60** | §4 command |
| K5 | Arbitrary-value classes **≤ 60** (from 166) | §4 command |
| K6 | Raw `var(--mint-N)` call sites **≤ 10** (from 75) | §4 command |
| K7 | `active:` uses **≥ 3 shared class strings**, covering button, row and chip | grep + read |
| K8 | `group-hover:` uses **> 0**, and the row↔pin coupling works | grep + browser |
| K9 | `motion-safe:` uses **> 0**; no new bare motion without a reduced arm | grep |
| K10 | `loading.tsx` present for `/collections`, `/collections/[id]`, `/profile` | `find` |
| K11 | Four brand asset files exist and render | `ls` + browser |
| K12 | **Zero hard-coded colours added.** The count may only go down | `grep -rnE '#[0-9A-Fa-f]{6}' src --include='*.tsx'` |
| K13 | A new user's first screen shows the paste field and a framed map | browser, 390×844 |
| K14 | Home shows the user's own pins at rest | browser, with ≥3 places |

---

## 6. Branching, and the CI reality

**CI cannot start a runner.** All four jobs report `steps=0` — a job that never began. `merge:pr` will
correctly refuse every PR, so **nothing lands tonight and that is expected.** Do not try to merge. Do
not use `--admin`. Do not "fix CI"; `ci.yml` is correct and the cause is account-level.

**Stack the branches.** Base branch for the run:

```
docs/no-crumbs-brand-and-facelift-lock      (has origin/main merged in)
  └── feat/w0-token-foundation              W0 — serial, blocks everything
        └── feat/w1-correctness             W1 — parallel inside, one branch
              └── feat/w2-map-at-rest       W2
                    └── feat/w3-interaction W3
                          └── feat/w4-identity
                                └── feat/w5-library
                                      └── feat/w6-the-moment
                                            └── feat/w7-night-and-edges
                                                  └── chore/w8-stabilise
```

One PR per wave, based on the previous wave's branch. **If a wave would be the fourth unlanded branch,
stop and report rather than stacking deeper.**

---

## 7. Verification protocol

For every package:

1. The **building agent** writes the code and its unit tests, runs `npm run verify`, and commits.
2. A **different agent** (`qa-reliability`) is given the package ID and the exit criterion **only** —
   not the diff, not the implementation notes — and independently answers *is this true?*
3. The lead records the verdict in the ledger. A package is closed only on an independent pass.
4. Anything touching the map camera, the import flow or a user-facing string also gets a **real
   browser pass at 390×844 and 1440×900** before it closes. Screenshot or describe what you saw.

**The ledger.** Maintain `docs/overnight-run-ledger.md`, appended as you go, one row per package:
`ID | branch | commit | built by | verified by | verdict | evidence`.

---

## 7a. The loop — what to run, and when

**Measured 2026-08-30**, because the intuition here is wrong. `npm run verify` chains eight commands;
these are the four that dominate:

| Stage | Time |
|---|---|
| `check:layers` | **14.9s** |
| `lint` | **10.7s** |
| `typecheck` | 3.7s |
| **unit tests** | **3.9s** |

**Per commit — the fast loop, ~4 seconds:**

```
npm run typecheck
```

That is the whole inner loop. **Owner decision, 2026-08-30:** the suite does not run per commit.
Typecheck stays because it is the stage that catches the signature and token breakage that propagates
worst across a stack, and because at 3.7 s it is the cheapest insurance available.

**Per wave close — the full gate:**

```
npm run verify
```

`verify` includes `npm run test`, so **the suite still runs at every wave boundary** — eight times over
the run. That is what bounds the risk of the deferral: if a regression lands, the bisect point is a
wave rather than a commit, which is coarse but not blind. Lint and the layer guard ride along here for
the same reason, since together they cost 26 s and catch nothing that compounds silently.

**A wave does not close on a red gate.** If `verify` fails at a wave boundary, fix it there. Carrying a
failure into the next wave is what turns a coarse bisect point into no bisect point at all.

**If a test fails, it is not in the way.** It is either right, or its being wrong is the finding. Do
not delete it, skip it, or mark it `todo` to keep moving — record it and fix it.

**Write the tests as you go even though you are not running them per commit.** A package's regression
test is part of the package and is what its exit criterion is checked against at the wave gate. Wave 8
is where the whole thing is stabilised, not where testing begins — arriving there with 41 packages and
no tests written would make it unfinishable in one pass.

## 8. The work packages

Path scope is listed so agents do not collide. **Two agents must never hold the same file.**

### Wave 0 — foundation · SERIAL, one agent, blocks everything

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W0-1** | Register elevation, motion, type and surface scales in `@theme`. Define the missing `--radius-md`. Add state colours (success/warning/info) so success stops being the brand colour | `src/app/globals.css` | `@theme` keys ≥ 60; `shadow-sheet`, `duration-base`, `ease-emphasised` compile; the four button sizes render with a correct radius **verified in a browser** |
| **W0-2** | Move the category palette out of `category-display.ts` into tokens, plus one palette module the MapLibre style expressions import by name | `src/ui/place/category-display.ts`, new `src/ui/place/palette.ts`, `src/components/map/marker-style.ts`, `poi-style.ts`, `summary-style.ts` | No hex literal in `category-display.ts`; map layers read named exports; pin colours unchanged on screen unless the retune is applied deliberately |
| **W0-3** | Collapse raw `var(--mint-N)` call sites onto semantic roles | all `src/**/*.tsx` | Raw call sites ≤ 10; no visual change |

> W0 touches files every later wave edits. **It must complete and be verified before Wave 1 starts.**

### Wave 1 — correctness · parallel, disjoint files

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W1-1** | **Ship the zero-state** (growth G1). `ux-map-is-the-query.md` §5 specifies it: regional map framed from the browser timezone, import overlay auto-opened, **no new components, no permission prompt**. `showImport` is `useState(false)` | `src/app/map/map-page-client.tsx`, `src/ui/place/viewport.ts` | A new user with zero places sees a framed regional map and the paste field, at 390×844. Test covers the zero-places branch |
| **W1-2** | **The envelope cliff** (G2). `ExtractionEnvelopeSchema` caps candidates at 12 and `safeParse` fails the whole envelope, so a post naming 13 places yields **zero**. Raise the envelope bound and truncate to the candidate cap — keep the flood guard, remove the cliff | `src/domain/extraction/schema.ts` | A 13-candidate payload yields `MAX_CANDIDATES` places, not an error. Regression test asserts exactly that |
| **W1-3** | **The off-by-one** (G3). Raise `MAX_CANDIDATES` and `GEMINI_MAX_CANDIDATES` to **8**, so the two caps agree and an 8-venue listicle survives whole | `src/domain/import/pipeline.ts`, `src/integrations/llm/gemini.place-extractor.ts` | Both constants are 8; test asserts an 8-candidate post resolves all eight |
| **W1-4** | **The capped candidate** (G5). A `capped` candidate is correctly excluded from the resolver chip and the pin line, but `willSave` returns `effectivePick(…) !== null \|\| modelHasCoordinates`, so with model coordinates it arrives **pre-ticked** and saves an unverified pin | `src/ui/import/candidate-resolution-view.ts`, `src/app/import/import-page-client.tsx` | A capped candidate is **not** pre-ticked, and if it can be saved it carries a visible provenance line saying the pin came from the caption. Test asserts both |
| **W1-5** | **The Instagram link** (G4). `universal-input.ts` files any non-TikTok URL as `kind: 'text'`, so the Add sheet offers to add the URL string as a place name. `/import` handles the same URL correctly | `src/components/add/universal-input.ts`, `src/components/add/add-sheet.tsx` | A non-TikTok URL produces the recognised-redirect path on **both** surfaces, never a place name. Test covers Instagram, YouTube and a bare domain |
| **W1-6** | Delete the ~180 lines of unreachable code in the import client — `ResultsScreen`, `CandidateRow`, `saveConfirmedCandidates`, and `CaptionPreviewScreen`'s `n === 0` branches. They carry a second, competing candidate design | `src/app/import/import-page-client.tsx` | Nothing references them; `npm run verify` green; no behaviour change |

### Wave 2 — the map at rest

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W2-1** | **Defect 0a.** Home rests at `HOME_LANDING_ZOOM.max = 8.0`; pins draw at `PIN_BAND_MIN = 8.5`, so the home screen draws **no pins**. Decide what the overview is and fix it | `src/components/map/zoom-bands.ts`, `map-surface.mapcn.tsx`, `src/ui/place/viewport.ts` | With ≥3 saved places, home shows the user's pins at rest, verified in a browser |
| **W2-2** | **The framing replay.** `refitFramed` replays `framing.current` on every `ResizeObserver` hit; only `noteUserGesture` retires it, and that arm is untested. A plain load plus a mobile URL-bar collapse replays a pin-less framing | `src/components/map/map-surface.mapcn.tsx` | The `{ kind: 'user' }` arm has test coverage; a resize after a settled gesture does not re-frame |
| **W2-3** | Zoom-tiered pin labels, replacing the flat `LABEL_MIN_ZOOM = 14` gate | `src/components/map/marker-style.ts` | A settled home map shows readable names for the nearest pins; the 2,000-pin frame budget does not regress |
| **W2-4** | Category colour doing work: filter chips carry counts and the category's own colour when pressed, not house mint | `src/components/sheet/category-filter-bar.tsx` | Pressing Café turns the chip café-coloured; counts render |
| **W2-5** | A designed zero-places first run replacing the guessed `EMPTY_LIBRARY_BOUNDS` region | `src/ui/place/viewport.ts` | The docblock's stale `HOME_LANDING_MIN_ZOOM` reference is gone and the claim it makes is true |

### Wave 3 — interaction

Specified in [`facelift-plan.md`](facelift-plan.md) §3a. **Build from the state matrix; do not invent states.**

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W3-1** | Press feedback on the shared button, row and chip class strings | `src/components/ui/button.tsx`, `src/components/sheet/place-sheet.tsx`, `src/components/sheet/place-enrichment.tsx` | `active:` on all three; every pressable thing acknowledges within one frame |
| **W3-2** | `group` coupling: hovering or pressing a row lifts its pin and dims its neighbours | `src/components/sheet/place-sheet.tsx`, `src/components/map/place-marker-layer.tsx`, `src/app/map/map-page-client.tsx` | `group-hover:` > 0; the coupling works in a browser at 1440×900 |
| **W3-3** | Invert `motion-reduce:` to `motion-safe:` so the accessible path is the default | all `src/**/*.tsx` with motion | `motion-safe:` > 0; every animation has a reduced arm |
| **W3-4** | The remaining state-matrix gaps: hover, focus-visible and disabled on every element in the table | per the matrix | Each row of the matrix is satisfiable by inspection |

### Wave 4 — identity

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W4-1** | The name lands: `title.default`, `title.template`, `metadataBase`, the description, and the label beside the mark | `src/app/layout.tsx`, `src/app/page.tsx` | The three strings from `voice-and-vocabulary.md` §3, exactly. Tab reads **No Crumbs** |
| **W4-2** | The crumb silhouette replaces Lucide's filled `MapPin` | `src/components/brand/pin-mark.tsx` | The mark is the crumb outline; it renders at 16px |
| **W4-3** | Map pins take the crumb outline per category, plus the selected variant | `src/components/map/marker-images.ts` | Pins are crumb-shaped, category-coloured, legible at 15px, budget unchanged |
| **W4-4** | `icon.svg`, `apple-icon.png`, `opengraph-image.tsx`, `manifest.ts` | `src/app/` | All four exist; a shared link previews as the product |

### Wave 5 — the library

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W5-1** | Thumbnail and elapsed time on the list row. `MapPlace.detail` already carries the whole record — this is a render, not a rewire | `src/components/sheet/place-sheet.tsx` | Rows show the post still and *Saved 3 days ago*; falls back to the category disc on image error |
| **W5-2** | Sort control: recently saved · nearest · A–Z. Batch writes break recency | `src/components/sheet/place-sheet.tsx`, `src/app/map/map-page-client.tsx` | Three orders work; the choice survives a reload |
| **W5-3** | A tag facet with counts. Tags are the only field that actually separates places | `src/ui/place/tag-filter.ts`, `src/components/sheet/category-filter-bar.tsx` | Tag counts render; tapping filters; no tag invented that no place carries |
| **W5-4** | `loading.tsx` for `/collections`, `/collections/[id]`, `/profile`, matching the real row geometry | `src/app/collections/`, `src/app/profile/` | Three files; tab changes paint instantly |
| **W5-5** | Visible result count beside the search field (it exists only as `sr-only`) | `src/components/sheet/place-sheet.tsx` | Sighted users see `12 of 32` |
| **W5-6** | Collection description rendered — queried twice, mapped twice, shown nowhere | `src/app/collections/collections-index-client.tsx`, `src/components/collections/collection-content.tsx` | Description renders on the index and the header |

---

### Wave 6 — the moment · the demo, and the reason anyone cares

Facelift stage 4. **`import-page-client.tsx` is 2,482 lines; W1-6 already removed the dead code.
Decompose before redesigning** — three of the five signature moments cross screen boundaries, so they
need a shared transition wrapper, and adding that inside one file on top of a competing design is how
this acquires its first regression.

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W6-1** | Split the import client by beat: `paste`, `rail`, `review`, `no-places`, `failure`, plus `review/candidate-card` | `src/app/import/` | No file over ~450 lines; behaviour identical; `npm run verify` green |
| **W6-2** | **Split the source fetch into its own sub-second request.** oEmbed returns in under a second; extraction takes 7–34s. Two round trips, still request/response, **no streaming route** | `src/app/api/` (new source-preview route), `src/app/import/screens/rail-screen.tsx` | The post — thumbnail, `@handle`, caption — is on screen within ~1s while extraction runs underneath |
| **W6-3** | **Hold the payoff.** `3 places found` is computed then overwritten on the next statement, so it renders for **zero frames**. Hold it ~700ms, count 0→N | `src/app/import/` | The count is visible and animates; test asserts the state is not overwritten in the same batch |
| **W6-4** | **Provenance takes the badge slot.** Today the confident signal is an 11px mint pill and the uncertainty is 12px grey at the bottom of the card — the hierarchy inverts the epistemics. Same three states, opposite visual weight. **No invented confidence number** | `src/app/import/screens/review/candidate-card.tsx`, `src/ui/import/candidate-resolution-view.ts` | A caption-derived pin reads as caption-derived at a glance; a matched pin reads as matched. Verified by someone reading five cards cold |
| **W6-5** | **Rebuild the no-places screen** — the modal outcome, ~73% of imports. It currently shows the user nothing: not the post, not the caption we just read. Strings do not change (`spec-no-places-found.md`) | `src/app/import/screens/no-places-screen.tsx` | The post and its caption are on screen; both recovery actions present on **every** entry point |
| **W6-6** | **Pins land.** Camera flight then staggered drop, paint-only over a per-feature order — no relayout, no re-collision | `src/components/map/place-marker-layer.tsx`, `map-surface.mapcn.tsx` | Pins arrive in sequence after the flight; frame budget unchanged |
| **W6-7** | The overlay stays mounted until `focusPlaceIds` resolves, so the map is revealed *into* the flight rather than after it | `src/app/map/map-page-client.tsx` | Confirm → map → flight is one continuous gesture, verified in a browser |

### Wave 7 — the night map and the edges

Facelift stage 5. **`L1-F8-T1` is the last unbuilt L1 product feature.**

| ID | Package | Paths | Exit criterion |
|---|---|---|---|
| **W7-1** | Rebuild `.dark` against the mint ramp. It currently holds an abandoned light-blue exploration **and nothing in `src/` ever applies the class** | `src/app/globals.css`, new theme provider | `.dark` is reachable, mint-derived, and every token has a dark value |
| **W7-2** | One theme source of truth. Three modules read `prefers-color-scheme` independently and would disagree with a class strategy | `src/components/ui/map.tsx`, `use-disc-theme.ts`, `country-flag-image.ts` | One reader; the other three consume it |
| **W7-3** | A night basemap palette across the style's 93 layers. **Chrome is brand, basemap is geography** — the map stays cool at night | `src/components/map/basemap-tint.ts`, `poi-style.ts` | The night map is legible and the category colours still separate on it |
| **W7-4** | **Account menu, sign-out, delete-my-data** (`L1-F8-T1`). **Trap:** `collections.owner_id` is `on delete cascade` and ownership transfer was never built, so deleting an account destroys shared collections for everyone in them. Handle it or refuse deletion for owners of shared collections — do not silently destroy other people's data | `src/app/profile/`, new server action | Deletion works, and a shared collection's other members do not lose it. Test asserts the cascade case |
| **W7-5** | Error, 404 and the global error boundary brought into the family. `global-error.tsx` uses inline styles and a system font because it cannot see the stylesheet — inline the wash and an inline SVG mark | `src/app/error.tsx`, `global-error.tsx`, `not-found.tsx` | All three look like the product |
| **W7-6** | Contrast, focus and 44px pass, plus a **60fps pass on a real device**. Six `backdrop-blur` surfaces sit over a live WebGL canvas — the standing perf risk | all touched surfaces | No contrast failure at AA; no touch target under 44px; the map holds frame rate while the sheet is open |

### Wave 8 — stabilise · after all 41 packages, not before

**Nothing here starts until Waves 0–7 are closed.** This is the pass that turns a stack of correct
packages into a product that holds together.

| ID | Package | Exit criterion |
|---|---|---|
| **W8-1** | Full `npm run verify` on the top of the stack, and on each wave branch | Green everywhere, or every failure recorded with its cause |
| **W8-2** | Fix everything lint and the layer guard surface — they have been deferred since Wave 0 and will have accumulated | Zero violations; no rule disabled to achieve it |
| **W8-3** | Run the whole suite and fix every regression. Add the missing regression test for any defect fixed without one | Tests ≥ 2017 + one per defect; no skipped or `todo` tests added during the run |
| **W8-4** | **The four quality gates in §8a**, judged by an agent that built none of it | Q1–Q4 pass, each with its evidence |
| **W8-5** | Polish pass: the findings Q1's walkthrough produced, in severity order | Every finding fixed or recorded with a reason |
| **W8-6** | Real-device pass — 60fps with the sheet open over the live map, and the contrast/44px sweep | No frame-rate regression; no AA failure; no target under 44px |
| **W8-7** | Documents reconciled. Any document this run proved wrong is corrected **in the same branch** | `current-state.md` reflects the end state; no document contradicts the code |
| **W8-8** | The report (§11) | Written, with every KPI measured rather than asserted |

## 8a. The quality bar — because none of §5 measures beauty

Every KPI in §5 is a grep. You can hit all fourteen and still ship something nobody would screenshot.
**These four gates are the other half, and the run is not complete without them.** They are judged, not
counted — which is exactly why a different agent judges them.

**Q1 — the walkthrough.** One agent walks every reachable screen at **390×844 and 1440×900**, signed
out and signed in, at **0, 3 and 30 places**. For each screen: does it match the design system, or is
it a screen nobody designed? Every mismatch is a finding with a screenshot or a precise description.
**The 0-place and 300-place cases are where this product dies** — the demo dies at zero, the product
dies at scale.

**Q2 — the demo runs clean.** The 90-second sequence, start to finish, no restarts, no dev tools:
open the app → paste a link → watch the post appear → the count land → review with provenance legible
→ confirm → the camera flies and the pins drop → open a place → near me → not been yet → **and then
the honest beat: a second link that names nothing, landing on a screen that reads as a destination
rather than a failure.** If any beat needs an excuse, it is not done.

**Q3 — nothing over-claims.** Independently checkable, and it outranks every other gate: the rail
makes no stage claim the server did not send; no screen presents inferred content in the same visual
register as verbatim content; no invented confidence number appears anywhere; the capped candidate
does not save silently. **A beautiful product that fakes streamed stages is a failed run, not a
partial one.**

**Q4 — it feels alive.** Every pressable thing acknowledges within one frame. Hovering a row moves its
pin. Filtering fades rather than deletes. Pins land rather than blink on. Under
`prefers-reduced-motion` all of it degrades to opacity and stays usable. Judged by using it, not by
reading the diff.

**If Q1–Q4 pass and a KPI does not, report the KPI and ship. If a KPI passes and Q1–Q4 do not, the run
is not finished.** The counts exist to make the work checkable; they were never the point.

## 9. Out of scope tonight — do not spend the night on these

- **Merging anything.** CI cannot start a runner. This is owner action: <https://github.com/settings/billing>
- **"Open now"** — blocked by the Google ToS gate in `06` §3.1. Not a design question until it is a licensing answer
- **A price filter** — the source is the resolver field mask, not the prompt, and it is a paid SKU tier
- **Instagram or YouTube ingestion** — unavailable and unproven respectively
- **Any new migration.** Production is at `0026`, staging at `0018`. Not tonight
- **The streaming route (`L0-F6`)** — a real feature, sequenced separately, not funded by this run
- **Itineraries, ratings, social graph, streaks, gamification, AI chat** — refused, permanently

---

## 10. When you are stuck

- **A package's exit criterion cannot be met.** Say so, record why in the ledger, move to the next
  package. Do not weaken the criterion.
- **Two packages want the same file.** Serialise them. Never let two agents hold one file.
- **A decision looks like the owner's.** [`working-agreement.md`](working-agreement.md) §7 lists them.
  Record the question in the ledger and proceed on the rest.
- **Something in a document contradicts the code.** The code is the truth; fix the document in the
  same commit and note it in the ledger.
- **A test is in the way.** Do not delete or skip it. It is either right, or its being wrong is the
  finding.

## 11. Report at the end

A single `docs/overnight-run-report.md`:
1. The ledger, all 49 rows
1b. The four quality gates, each with its evidence
2. Every KPI from §5 with its measured value
3. What was **not** completed and precisely why
4. Every decision recorded for the owner
5. Every document corrected, and what was wrong with it
6. The next three things you would do
