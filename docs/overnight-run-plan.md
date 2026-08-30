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
currently start a runner (§9). It is organised into **six waves and 24 work packages**. Every package
has an exit criterion a different agent can check.

**Definition of done for the run: all 24 packages closed, `npm run verify` green, no regression in the
2,017-test baseline, and every KPI in §5 met.** Nothing is "done" because an agent says so — see §7.

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
2. **`npm run verify` must pass before every commit.** It is lint + typecheck + layer guard + unit.
   It is **not** CI — it covers one of CI's four jobs.
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
| K1 | **All 24 packages closed** and independently verified | §7's ledger |
| K2 | `npm run verify` **green** | the command |
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
1. The ledger, all 24 rows
2. Every KPI from §5 with its measured value
3. What was **not** completed and precisely why
4. Every decision recorded for the owner
5. Every document corrected, and what was wrong with it
6. The next three things you would do
