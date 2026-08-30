# The overnight run's visibility harness — what can be seen, how, and what cannot

**Written 2026-08-31. Every measurement below was taken against commit `55698ae`**, exported clean
with `git archive` into a scratch directory, so nothing here is a claim about the shared working
tree — five agents were writing to it while this was measured.

This document exists because `docs/overnight-run-plan.md` §8a's four quality gates all require
*using the running application*, and `docs/current-state.md` item 14 says the application cannot be
run in this checkout. That was true. It is now partly false, and this says exactly how far.

---

## 1. Findings

These are findings, not footnotes. Two of them correct documents; one is a block the run carries
rather than works around.

### F1 — no Playwright project could produce either gate viewport, and nobody had noticed

`docs/overnight-run-plan.md` §8a Q1 is written against **390×844 and 1440×900**, and five package
exit criteria repeat those numbers: **W1-1** (the zero state), **W2-1** (pins at rest), **W3-2**
(row↔pin coupling), **W6-7** (the confirm→flight gesture) and **W7-6** (the 60 fps pass).

Measured with `require('@playwright/test').devices` at commit `55698ae`:

| Project | Declared viewport | Gate viewport |
|---|---|---|
| `mobile-chrome` (`devices['Pixel 7']`) | **412 × 839** | 390 × 844 |
| `desktop-chrome` (`devices['Desktop Chrome']`) | **1280 × 720** | 1440 × 900 |

Neither matches. **Every criterion above was written against a number this repository could not
produce**, and it went unnoticed because nobody had run them — see F2. A screenshot taken at 412 px
and filed against a 390 px criterion is 22 px off, which is the width at which a layout decides how
many columns it has.

Fixed by **adding** `gate-mobile` (390×844, dsf 3) and `gate-desktop` (1440×900, dsf 2) to
`playwright.config.ts`, not by resizing the existing two: every current spec has always run at
412×839 and 1280×720, and silently changing that would change the meaning of tests this work has no
business touching. The new projects carry their own `testDir: './tests/e2e/gates'`; the old two
gained `testIgnore: '**/gates/**'`. `npx playwright test` goes from 50 tests to 54 and **not one
existing test changes viewport**. `tests/e2e/gates/gate-viewport.spec.ts` asserts the two sizes,
because a mislabelled screenshot is invisible in a report.

### F2 — `npm run test:e2e` cannot run in this checkout at all

`playwright-core` is 1.62.1 and wants Chromium revision **1234**;
`~/Library/Caches/ms-playwright` holds only **1223** and **1228**. Every `chromium.launch()` throws
`Executable doesn't exist`. This is not a harness problem: the **entire existing 50-test e2e suite
is unrunnable here** until someone runs `npx playwright install chromium`. It is also the reason F1
survived — a suite nobody can run is a suite whose viewports nobody checks.

The screenshot harness falls back to the system Google Chrome (`channel: 'chrome'`) and records in
its manifest which binary took each picture, because a Chrome build and a Chromium build do not
render identically and a pixel-level facelift review should not have to guess.

### F3 — four of eight surfaces 500 on absent configuration; one degrades on purpose

With no Supabase environment variables, `/` renders and `/map`, `/import`, `/collections` and
`/profile` return 500. The difference is a documented `try`/`catch`: `currentUserOrNull()` in
`src/app/page.tsx` carries a long comment explaining that a landing page is the one screen that must
render when everything else is broken, because it is the route to sign-in and sign-in is where a
misconfigured deployment gets diagnosed. Nothing else does that.

For a product that always has configuration, four routes hard-failing on its absence is arguably
correct — a 500 is honest where a blank screen is not. **It is recorded because it is the reason
this run needed a harness invented at 1 am.** Anyone deciding whether to add a "this deployment is
not configured" screen should decide it deliberately, not discover it the way this run did.

### F4 — a mislabelled screenshot, found by looking at the picture

The first version of the harness attached the session cookie to **every** browser context,
including the two screens it labelled `signed-out`. So `stub--signed-out--landing--390x844.png`
showed `Signed in as demo@example.com` under an `Open your map →` button. Every pixel was honest and
the filename was a lie.

Fixed: `auth` is now the list of states a screen is captured in, and the cookie is attached per
state rather than per run. `/` is now captured in **both** states, which it should have been anyway.

It is written down because of how it was caught: the manifest said `"auth": "out"`, the status was
200, nothing failed, and no assertion existed that could have noticed. **Only opening the PNG
found it.** That is the argument against treating a green harness run as evidence.

## 2. The finding that unblocks the run

**`npm run build` succeeds with no `.env.local`.** Exit 0, TypeScript clean, 11 static pages, all
12 routes emitted. Next.js reads the Supabase configuration at request time, not at build time, so
the absence of credentials never reaches the compiler.

`next start` then serves, with **zero** environment variables set:

| Route | Status | |
|---|---|---|
| `/` | **200, renders fully** | see F3 |
| `/sign-in` | **200** | static |
| `/healthz` | **200** | no Supabase read |
| `/map`, `/import`, `/collections`, `/profile` | **500** | `createServerClient(undefined!, undefined!)` throws |

## 3. The seam that gets the other four back

`src/components/map/map-surface.tsx` already exports the `mapcn` implementation over CARTO's keyless
basemap, and its own header states it "needs no `NEXT_PUBLIC_*` env var at all". **The map renders
without a key.** The only obstacle is the data read, and that read is ordinary HTTP:

- `getSpots()` → `GET ${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/saved_places?select=…`
- `getUser()` → `GET ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`

Point that variable at a loopback process that answers those two shapes and the real Next server
renders the real components against fixture rows. That process is `tests/harness/stub-supabase.mjs`.
The variable is passed inline on the `next start` command; **no `.env` file is created, read or
touched**, which the run plan (§7b rule 8) and the harness deny list both forbid outright.

**Playwright's `page.route()` cannot do this job.** Those requests go server→Supabase and never
cross the browser, so there is no interception point in the page. The stub is the only seam. It is
worth stating because "just intercept the API calls" is the obvious first idea and it does not work.

### What a stub-backed screenshot proves, and what it does not

It proves **rendering**: layout at a viewport, the zero state, the camera at 300 pins, a radius, a
contrast, a truncation. It proves **nothing about the database** — not a query, not a join, not an
RLS policy, not the real shape of a row beyond the hand-written mirror in `tests/harness/fixtures.mjs`.

### Two rules that keep it from becoming a lie

Both are orchestrator rulings of 2026-08-31, and both are enforced in code rather than by
convention, because the run's load-bearing rule is that **no change may increase what the product
asserts — and a screenshot is an assertion.**

1. **The data source leads the filename**, not just the manifest:
   `stub--signed-in-30-places--map--390x844.png`, `live--signed-out--landing--1440x900.png`. A
   manifest alone is not enough, because a PNG is separated from its directory the moment somebody
   drags one into a document. The word has to travel *in the filename*, where it cannot be lost.
2. **Fixture names are invented and unmistakably so.** They were real Tel Aviv venues for about an
   hour, because real names give realistic string lengths and that is what a list layout is judged
   on. That was ruled out and rightly: a stub-backed picture of `Miznon · Tel Aviv-Yafo` asserts
   that somebody saved Miznon, and nobody did. Names are now `<venue kind> No. <n>` — 13 to 31
   characters, so the truncation behaviour is still exercised — and addresses say `Fixture St`. The
   *coordinates* stay real Tel Aviv points: a synthetic grid would hide the camera-fit behaviour a
   30-place screenshot exists to show, and a coordinate asserts nothing about a business.

## 4. Using it

```sh
# tonight's work, once it is committed — builds that commit in a scratch dir and drives it
node tests/harness/capture-screens.mjs --from-commit <sha> --out docs/evidence/qa/screens/after

# the pre-facelift "before", from live production — signed-out screens only
node tests/harness/capture-screens.mjs --base-url https://p-002-zeta.vercel.app --out docs/evidence/qa/screens/before

# the two ends of the range, on their own
node tests/harness/capture-screens.mjs --from-commit HEAD --counts 0,300 --routes /map
```

26 PNGs per full run. `/map` and `/profile` are captured at **0, 3, 30 and 300** places, in that
order: 0 first because `growth-plan.md` §6 calls shipping the zero state "the one thing" and W1-1 is
the run's highest-impact package, so the screen a new user gets is the screen we most need to see;
300 last because §8a says in terms that *the demo dies at zero, the product dies at scale*, and 300
is the only case that tests the second half. `/collections` and `/import` are captured once, because
neither reads the saved-place count and three identical PNGs would make the directory overstate how
much was checked.

Each run writes a `manifest.json` recording the commit, the base URL, the data source, the HTTP
status and final URL of every navigation, every console and page error, the browser that took the
picture, and every screen it **skipped** and why. A gap is recorded, never filled in.

`--from-commit` takes a commit rather than the working tree on purpose (`agent-guardrails.md` rule
31): under concurrency the tree is several agents' half-finished work blended together and a
screenshot of it is attributable to nobody. It uses `git archive | tar -x` plus `cp -Rc` (an APFS
clone — 797 MB in ~8 s), so it performs **no git mutation of any kind**: no worktree, no checkout,
no stash, nothing another agent could notice. It builds into its own directory and binds
kernel-assigned ports, so it races nobody's `.next/` and shadows nobody's server.

Two macOS-specific dependencies, stated so they are not discovered in CI: `cp -Rc` is APFS clone,
and the fallback browser is `/Applications/Google Chrome.app`.

## 5. Where the gates stand

| Gate | Status | |
|---|---|---|
| **Q1** — every reachable screen, both viewports, 0/3/30 places | **Mostly measurable** | Six surfaces at both exact gate viewports, at 0/3/30/300. Signed-in ones are stub-backed. Not covered: `/collections/[id]` and `/collections/join/[token]`, which need collection fixtures whose shape nobody has verified — an unverified fixture is a worse artefact than an admitted gap. Also not covered: every import state past the empty field (§6). |
| **Q2** — the 90-second demo, no restarts | **NOT measurable** | The demo is a real TikTok fetch → oEmbed → LLM extraction → review → confirm → a database write. The stub renders each screen; it cannot run the flow, and a sequence of stub screenshots presented as "the demo" would be a fabrication. Q2 needs a real deployment with real credentials, driven by a human. |
| **Q3** | not assessed here | |
| **Q4** — it feels alive | **Partly measurable** | A still frame cannot show press feedback within one frame or hover→pin coupling. "Pins land rather than blink on" *is* measurable — a trace, or frames sampled during the settle — and the harness does not do it yet. Today Q4 is a person sitting in front of it. |

### The Docker block, stated rather than worked around

There is no local Supabase and no path to one. Docker is not running, and standing the stack up
would need `npm run db:reset`, which `docs/agent-guardrails.md` forbids agents outright and which
the orchestrator declined to lift. **No attempt was made to start Docker.**

So there is no genuinely signed-in rendering available tonight — only stub-backed rendering, plus
the live production deployment for signed-out "before" shots. This is a stated limitation of the
run, not a gap papered over: **nothing below the sign-in boundary has been verified against a real
database by this harness, and no screenshot it produces should be read as if it had.**

## 6. The one seam still missing, and it is under `src/`

**The import screens have no external seam.** `/import` renders `ImportPageClient`, which owns every
visual state in React state with no URL parameter and no dev stepper. So the harness photographs the
empty paste field and nothing else — not the review screen, not the fourteen failure screens, and
**not "no places found", which `mvp-plan.md` says is the modal import outcome and therefore a core
surface, not an error path**.

A dev-only URL-driven state seam (`?state=review|no-places|error-<code>`) would put roughly six more
screens inside Q1's reach, including the one the product most depends on getting right. It is a
change under `src/app/import/import-page-client.tsx`, which this work may not make.

## 7. What was seen

26 screenshots at commit `55698ae`, both gate viewports, 0/3/30/300 places, **zero navigation
errors, zero console errors and zero page errors**. Three observations, and none of them is filed as
a defect:

**The mobile zero state hides its own call to action.** At 390×844 with 0 places, `/map` shows the
bottom sheet collapsed to the single line `Your map starts here. ⌃`. The subhead and the
`＋ Add a TikTok` button are inside the sheet and not visible; the only visible way forward is the
mint `＋` in the tab bar. At 1440×900 the same state shows headline, subhead and button together.
That is the screen the demo begins on and the screen a "no places found" import returns the user to,
so which of the two is intended is worth ruling on deliberately (W1-1).

**The home camera opens on the region, not on the places — and that is deliberate.** At 3, 30 and
300 places, all in Tel Aviv, the map opens showing Amman, Beersheba and Kiryat Motzkin, with every
pin collapsed into one `Tel Aviv-Yafo N` pill. Before filing it as a bug: it is the owner's ruling
of 2026-08-30, recorded in `src/app/map/map-page-client.tsx` — *"open the map when you see the
countries, not last added place"* — implemented as `HOME_LANDING_ZOOM`'s country-band ceiling.
Working as specified.

**At scale the map does not break; it just says very little.** 300 places renders identically to 3,
with no clutter, no overlap and no slowdown — one pill reading `Tel Aviv-Yafo 300` and a sheet
reading `300 in Israel`. So the "product dies at scale" case does not die. The open question is the
opposite one: a user with 300 saved places opens the map and is shown a number, not their library.
`/profile` at 300 is the surface that actually answers "what have I built here", and it holds up.
