# The overnight run's visibility harness — what can be seen, how, and what cannot

**Written 2026-08-31. Every measurement below was taken against commit `55698ae`**, exported clean
with `git archive` into a scratch directory, so nothing here is a claim about the shared working
tree — five agents were writing to it while this was measured.

This document exists because `docs/overnight-run-plan.md` §8a's four quality gates all require
*using the running application*, and `docs/current-state.md` item 14 says the application cannot be
run in this checkout. That was true. It is now partly false, and this says exactly how far.

---

## 1. The finding that unblocks the run

**`npm run build` succeeds with no `.env.local`.** Exit 0, TypeScript clean, 11 static pages, all
12 routes emitted. Next.js reads the Supabase configuration at request time, not at build time, so
the absence of credentials never reaches the compiler.

`next start` then serves, with **zero** environment variables set:

| Route | Status | Why |
|---|---|---|
| `/` | **200, renders fully** | `currentUserOrNull()` in `src/app/page.tsx` swallows the failure on purpose |
| `/sign-in` | **200** | static |
| `/healthz` | **200** | no Supabase read |
| `/map` | **500** | `createServerClient(undefined!, undefined!)` throws |
| `/import` | **500** | same |
| `/collections` | **500** | same |
| `/profile` | **500** | same |

So two of the eight product surfaces are visible for free, and the map — the product — is not one
of them.

## 2. The seam that gets the other four back

`src/components/map/map-surface.tsx` already exports the `mapcn` implementation over CARTO's keyless
basemap, and its own header states it "needs no `NEXT_PUBLIC_*` env var at all". **The map renders
without a key.** The only obstacle is the data read, and that read is ordinary HTTP:

- `getSpots()` → `GET ${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/saved_places?select=…`
- `getUser()` → `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`

Point that variable at a loopback process that answers those two shapes, and the real Next server
renders the real components against fixture rows. That process is `tests/harness/stub-supabase.mjs`.
The variable is passed inline on the `next start` command; **no `.env` file is created, read or
touched**, which the run plan (§7b rule 8) and the harness deny list both forbid outright.

**Playwright's `page.route()` cannot do this job.** Those requests go server→Supabase and never
cross the browser, so there is no interception point in the page. The stub is the only seam. It is
worth stating because "just intercept the API calls" is the obvious first idea and it does not work.

### What a stub-backed screenshot proves, and what it does not

It proves **rendering**: layout at a viewport, the zero state, the camera at 30 pins, a radius, a
contrast, a truncation. It proves **nothing about the database** — not a query, not a join, not an
RLS policy, not the real shape of a row beyond the hand-written mirror in `tests/harness/fixtures.mjs`.
Every artefact the harness writes is stamped `"dataSource": "stub"` in its manifest, and any report
quoting one must carry that word. It is a way to *see* the product, not a way to verify it end to end.

## 3. Using it

```sh
# tonight's work, once it is committed — builds that commit in a scratch dir and drives it
node tests/harness/capture-screens.mjs --from-commit <sha> --out docs/evidence/qa/screens/after

# the pre-facelift "before", from live production — signed-out screens only
node tests/harness/capture-screens.mjs --base-url https://p-002-zeta.vercel.app --out docs/evidence/qa/screens/before

# the two cases where this product dies
node tests/harness/capture-screens.mjs --from-commit HEAD --counts 0,300 --routes /map
```

Twenty PNGs per full run: 6 screens × 2 gate viewports, with `/map` and `/profile` repeated at 0, 3
and 30 places. Each run writes a `manifest.json` recording the commit, the base URL, the data source,
the HTTP status of every navigation, the browser that took the picture, and — importantly — every
screen it **skipped** and why. A gap is recorded, never filled in.

`--from-commit` takes a commit rather than the working tree on purpose (`agent-guardrails.md` rule
31): under concurrency the tree is several agents' half-finished work blended together and a
screenshot of it is attributable to nobody. It uses `git archive | tar -x` plus `cp -Rc` (an APFS
clone — 797 MB in ~8 s), so it performs **no git mutation of any kind**: no worktree, no checkout,
no stash. Nothing another agent could notice. It also builds into its own directory, so it never
races anyone else's `.next/`.

Two macOS-specific dependencies, stated so they are not discovered in CI: `cp -Rc` is APFS clone,
and the fallback browser is `/Applications/Google Chrome.app`.

## 4. Two defects in the test machinery itself

**(a) `npm run test:e2e` cannot run in this checkout.** `playwright-core` is 1.62.1 and wants
Chromium revision **1234**; `~/Library/Caches/ms-playwright` holds only **1223** and **1228**. Every
`chromium.launch()` throws `Executable doesn't exist`. This is not a harness problem — the entire
existing e2e suite is unrunnable here until someone runs `npx playwright install chromium`. The
screenshot harness falls back to the system Google Chrome (`channel: 'chrome'`) and records in its
manifest which binary took each picture, because a Chrome build and a Chromium build do not render
identically and a pixel-level facelift review should not have to guess.

**(b) Neither Playwright project could produce either gate viewport.** Measured:
`devices['Pixel 7']` is **412×839**; `devices['Desktop Chrome']` is **1280×720**. The gates
(§8a Q1, and W1-1, W2-1, W3-2, W6-7, W7-6) are written against **390×844 and 1440×900**. A
screenshot taken at 412 px and filed against a 390 px criterion is 22 px off — which is exactly the
width at which a layout decides how many columns it has.

Fixed by **adding** `gate-mobile` (390×844, dsf 3) and `gate-desktop` (1440×900, dsf 2) to
`playwright.config.ts`, not by resizing the existing two: every current spec has always run at
412×839 and 1280×720, and silently changing that would change the meaning of tests this work has no
business touching. The new projects carry their own `testDir: './tests/e2e/gates'` and the old two
gained `testIgnore: '**/gates/**'`, so `npx playwright test` goes from 50 tests to 54 and not one
existing test changes viewport. `tests/e2e/gates/gate-viewport.spec.ts` asserts the sizes, because a
mislabelled screenshot is invisible in a report.

## 5. Where the gates stand

| Gate | Status | |
|---|---|---|
| **Q1** — every reachable screen, both viewports, 0/3/30 places | **Mostly measurable** | All eight surfaces at both exact gate viewports. Signed-in ones are stub-backed. `/collections/[id]` and `/collections/join/[token]` are not covered: both need collection fixtures whose shape nobody has verified, and an unverified fixture is a worse artefact than an admitted gap. |
| **Q2** — the 90-second demo, no restarts | **NOT measurable** | The demo is paste a real TikTok → oEmbed → LLM extraction → review → confirm → the pin lands. That needs a TikTok fetch, an LLM key and a database write. The stub can render each screen; it cannot run the flow, and a sequence of stub screenshots presented as "the demo" would be a fabrication. Q2 needs a real deployment with real credentials, run by someone who has them. |
| **Q3** | not assessed here | |
| **Q4** — it feels alive | **Partly measurable** | A still frame cannot show press feedback within one frame, hover→pin coupling, or pins landing rather than blinking on. Playwright can measure the last of these (a trace, or sampled screenshots during the settle) and the harness does not do it yet. Today Q4 is a human sitting in front of it. |

Also unmeasurable and worth naming: **the import screens have no external seam**. `/import` renders
`ImportPageClient`, which owns every visual state in React state with no URL parameter and no dev
stepper. So the harness photographs the empty paste field and nothing else — not the review screen,
not the failure screens, and **not "no places found", which `mvp-plan.md` says is the modal import
outcome and therefore a core surface**. Giving that component a URL-driven state seam (`?state=`,
dev-only) would put roughly six more screens inside Q1's reach. It is a change under `src/`, which
this work may not make; it is the single highest-value seam still missing.

## 6. What was seen, and one thing worth a ruling

Twenty screenshots at commit `55698ae`, both viewports, 0/3/30 places, zero navigation errors and
zero page errors. Two observations from looking at them:

**The mobile zero state hides its own call to action.** At 390×844 with 0 places, `/map` shows the
bottom sheet collapsed to the single line `Your map starts here. ⌃`. The subhead and the
`＋ Add a TikTok` button are inside the sheet and not visible; the only visible way forward is the
mint `＋` in the tab bar. At 1440×900 the same state shows headline, subhead and the button
together. The zero state is where the demo begins and where the modal import outcome returns the
user, so which of the two is intended is a UX question worth answering deliberately (W1-1).

**The home camera opens on the region, not on the places — and this is deliberate.** At 3 and at 30
places, all in Tel Aviv, the map opens showing Amman, Beersheba and Kiryat Motzkin, and every pin is
collapsed into one `Tel Aviv-Yafo 3` pill. Before filing that as a bug: it is the owner's own ruling
of 2026-08-30, recorded in `src/app/map/map-page-client.tsx` — *"open the map when you see the
countries, not last added place"* — implemented as `HOME_LANDING_ZOOM`'s country-band ceiling. So it
is working as specified. The observation is only that a user with three saved places sees **none of
them** as pins on opening, which is a product question about the small-library case, not a defect.

Neither is being reported as a defect. Both are things that were not visible to anyone before
tonight and now are.
