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

**Resolved, and then run.** The orchestrator installed the matching Chromium on 2026-08-31 and the
suite was run for the first time since `global-setup.ts` was wired — against commit `ddae298`,
stub-backed, no `E2E_PASSWORD`, via `tests/harness/run-e2e.mjs`:

> **10 passed, 44 skipped, exit code 0.**

Six of those ten are the pre-existing signed-out smoke tier (three tests × two projects); the other
four are the gate specs added tonight. So **before tonight this suite passed six tests, skipped
forty-four, and exited green.** That is not a defect in `global-setup.ts` — this configuration is
its environment 2, where skipping is the correct outcome against a deployment with no seeded demo
user — but it is the number anyone quoting "the e2e suite is green" needs in front of them. **81% of
this suite has still never been observed to run.**

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
| **Q1** — every reachable screen, both viewports, 0/3/30 places | **Measurable but for the import states** | Eight surfaces at both exact gate viewports, at 0/3/30/300 where the count matters. Signed-in ones are stub-backed. `/collections/[id]` and `/collections/join/[token]` were holes until 2026-08-31 and are now covered — see §8. The one hole left is every import state past the empty field (§6). |
| **Q2** — the 90-second demo, no restarts | **NOT measurable** | The demo is a real TikTok fetch → oEmbed → LLM extraction → review → confirm → a database write. The stub renders each screen; it cannot run the flow, and a sequence of stub screenshots presented as "the demo" would be a fabrication. Q2 needs a real deployment with real credentials, driven by a human. |
| **Q3** | not assessed here | |
| **Q4** — it feels alive | **Half measurable, and that half is now mechanical** | Press feedback within one frame and hover→pin coupling still need a person. "Pins land rather than blink on" is now measured by `tests/harness/measure-motion.mjs` — see §9, which includes the before-baseline W6-6 will be judged against. |

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

## 8. The collection screens, and how their fixtures stopped being a guess

`/collections/[id]` and `/collections/join/[token]` were an admitted hole in §5 on the grounds that
their fixtures were unverified and an unverified fixture makes a worse artefact than a gap. That was
the right call at the time and it is now unnecessary: the shapes are **established from the code**.

`src/app/collections/_lib/get-collections.ts` declares `SUMMARY_SELECT` and `DETAIL_SELECT` next to
hand-written `SummaryRow` and `DetailRow` interfaces — which exist precisely because
`supabase gen types` output is not in this repository, and whose own header says a drift between the
select and the interface fails loudly rather than silently. Mirroring those two interfaces is
therefore not guessing; it is copying the same declaration the application reads through. The join
screen's five-column `InvitePreview` comes from `preview_collection_invite` (migration `0024`), and
its shape is declared in the page.

Both render. The collection detail shows its name, `3 places · You and Second Member`, the search
field, the item rows with their shared notes and the `＋ Add places` action. The join screen's
**signed-out** state is the interesting one and is captured: it deliberately says less than
`ux-collections.md` §5.3 asks for, because `0024` refuses `anon` the invite preview rather than
create a token-guessable enumeration surface, and the page carries a long comment saying so. Both
states are captured.

### A limitation of the harness, not a footnote: the stub is blind to select drift

The stub does not implement `select=`. It returns a **superset** row and lets each caller take the
columns it asked for, so a caller that asks for a column the fixture does not have gets `undefined`
where PostgREST would have raised `42703`.

**Therefore this harness is structurally incapable of catching a select/interface drift** — a select
that gains a column its hand-written row interface does not have, or vice versa. Those interfaces
exist in `get-spots.ts` and `get-collections.ts` precisely because `supabase gen types` output is
not in this repository, and their own headers say the drift is meant to fail loudly. Against this
stub it fails silently, and the screenshot still looks green.

So: **a green collections screenshot from this harness says the components render. It says nothing
about whether the query behind them is still correct.** Only a real database says that. Keying
fixtures by query string would close the gap and would break the moment somebody reordered a select,
which is why the superset is still the right trade — but the blindness has to travel with the
evidence.

Observed while looking, not filed as a defect: at 390×844 the collection detail's `＋ Add places`
button sits directly over the last visible list row, clipping it mid-row with no scrim or bottom
padding between the two. Worth a glance from whoever owns that sheet.

## 9. Q4, made mechanical — `tests/harness/measure-motion.mjs`

W6-6's exit criterion is *"pins arrive in sequence after the flight; frame budget unchanged"*. Two
claims, and until now neither was checkable by anyone but a person watching the screen. Both halves
are now measured, and pointable at a commit the way the screenshot harness is, so Wave 8 can put a
before against an after.

**How.** A CDP screencast of `/map` from navigation to rest — not a loop of `page.screenshot()`,
which costs tens of milliseconds on the same thread the animation runs on and would measure the
sampler as much as the subject. Each screencast frame **is** a compositor paint, so the gaps in the
series are data rather than sampling artefacts. Consecutive frames are diffed for the fraction of
pixels that changed; the series is anchored on the single **largest** change, which is the frame
where the map paints. `requestAnimationFrame` deltas are recorded across the same window.

**The before-baseline, commit `1bc3e82`, 30 places, stub-backed:**

| | 390×844 | 1440×900 |
|---|---|---|
| Map painted at | 1772 ms | 1551 ms |
| Pixels changed by that paint | 51.1% | 42.1% |
| Paints after it | **1** | **1** |
| Visible change events after it | **0** | **0** |
| Frame time max | 383.5 ms | 658.4 ms |
| Frames over 33.3 ms | 8 | 10 |

**Reading:** the map and its markers arrive together, in one fade, and nothing moves afterwards.
There is no per-marker entrance today — which is the correct "before" for a package whose job is to
add one. The filmstrip confirms the numbers rather than the other way round: frame 153 at 1769 ms
shows the whole map ghosted and half-opaque with the summary pill already in place, and frame 154 at
1772 ms shows it fully painted. It is a whole-surface fade, not an entrance.

**Two numbers not to misread, and this matters more than the numbers themselves.**

- **The median frame time is meaningless here.** Headless Chromium's `requestAnimationFrame` is not
  locked to a display refresh, so an idle page reports ~8.3 ms. That is not "120 fps"; it is
  "nothing was happening". The tool prints a `medianCaveat` beside it for that reason. Compare
  `maxMs` and the over-budget counts between two runs of this tool. Do **not** compare either
  against `facelift-plan.md` §2's *19.0 ms median / 60.5 ms p95*, which is a different measurement.
- **The 2,000-pin run does not reproduce §2's stress condition.** Measured at 2,000 places: max
  334 ms mobile, 317 ms desktop — *better* than the 30-place run. That is not a performance result,
  it is an artefact of the camera: the home view sits under `HOME_LANDING_ZOOM`'s country-band
  ceiling, so 2,000 pins collapse into **one** summary marker and 2,000 symbols are never drawn.
  §2's number was 2,000 pins actually rendered. Reproducing it needs a camera at pin-band zoom over
  a spread that does not cluster, and this tool does not do that yet. **Quoting the 2,000-pin number
  as "2,000 pins are free" would be exactly wrong.**

**What it cannot do**, and this is the boundary rather than a caveat: it can say pins appeared over
400 ms in eleven steps rather than in one, and it can say no frame exceeded 33 ms. It cannot say
whether the easing reads as a pin *landing* or as a pin *twitching*. Q4 keeps a person in it. This
only removes the part where the person also had to be a stopwatch.

## 10. Re-measured after W2-1: did removing the camera ceiling cost the frame budget?

§9 said the 2,000-pin number was not a performance result, because the home camera's country-band
ceiling collapsed the whole library into one summary marker and 2,000 symbols were never drawn.
**`5cd7ce8` removed that ceiling**, so the caveat expired and the question became real. Re-measured.

To answer it at all the harness had to learn to read the camera, which it now does — see
`readCamera` in `measure-motion.mjs`. `PIN_BAND_MIN` is 8.5, and a frame number taken without
knowing which side of that line the camera rested on is uninterpretable.

**Answer: the camera does settle in the pin band, 2,000 symbols really are drawn, and the cost is
modest. No regression. But the result is conditional, and the condition is about to change.**

| | 390×844 | | 1440×900 | |
|---|---|---|---|---|
| | **30** | **2,000** | **30** | **2,000** |
| Resting zoom | 12.265 | 11.584 | 13.141 | 12.501 |
| Band | pin | pin | pin | pin |
| **Pin symbols drawn** | **30** | **2,000** | **30** | **2,000** |
| Pin labels drawn | 0 | 0 | 0 | 0 |
| Frame time max | 425.0 ms | 543.1 ms | 642.2 ms | 516.6 ms |
| Frames over 16.7 ms | 11 | 14 | 11 | 17 |
| Frames over 33.3 ms | 8 | 11 | 10 | 17 |

*Commit `2f01d93` (contains `5cd7ce8`), stub-backed, one run each.*

**The three questions, answered directly.**

1. **Does the camera settle in the pin band?** Yes — 11.58 to 13.14 against a `PIN_BAND_MIN` of 8.5,
   on both viewports and at both counts. Not marginal. The question is real.
2. **Does it draw 2,000 symbols, and what does that cost?** It draws exactly 2,000. Against the
   30-place run **on the same tool and the same commit**: mobile max 425 → 543 ms and three more
   frames over 33.3 ms; desktop max 642 → 517 ms — *lower* — and seven more frames over 33.3 ms.
   The cost is real, small, and concentrated in the load, not in the resting state. **There is no
   frame-rate collapse at 2,000 pins.** Comparing against the pre-`5cd7ce8` run at 2,000 places
   (max 334 / 317 ms) is the honest before/after, and it says the same thing: the ceiling's removal
   bought a modest load cost.
3. **Are labels on?** **No — zero of 2,000 pins are labelled**, and the mechanism matters. The built
   commit gates labels with one flat `LABEL_MIN_ZOOM = 14` (`['step', ['zoom'], '', 14,
   ['get','name']]`), and the camera rests at 11.6–13.1. So every number above is on the **cheap**
   side of `facelift-plan.md` §2's 19.0 ms-vs-34.0 ms axis, and it is cheap because of the flat gate
   and the resting zoom, not because tiering thinned anything.

**The finding that follows from question 3, and it is the important one.** The five-tier label
system — `LABEL_TIER_ZOOMS = [8.5, 10, 11.5, 13, 14]` and the per-feature `labelZoom` stamp — was
**uncommitted work in the tree at the time of writing**, not in any commit measured here. When it
lands, pins become eligible for labels from z8.5 upward, which is **exactly the range the camera now
rests in** after `5cd7ce8`. Two changes that are individually correct combine to move this
measurement from §2's cheap axis to its expensive one:

> **`5cd7ce8` put the camera where the pins draw; the label tiering will put labels where the camera
> now rests. Neither change can see the other. This must be re-measured at 2,000 places once the
> tiering commits** — it is the one case where §2's 34.0 ms / ~29 fps figure could become real, and
> nothing else in the run would notice.

(Whether it actually bites is genuinely open: `labelTierFor` pushes a pin with no clearance up to
`LABEL_ALL_ZOOM`, and 2,000 pins in one metro have very little clearance, so the tiering may thin
them to almost nothing on its own. That is a prediction, which is why it needs measuring rather than
asserting.)

**Caveats on the numbers themselves.** One run per cell, and `maxMs` is a load-time spike with real
run-to-run variance — the 30-place mobile max moved 383 → 425 ms across two runs of the *same* build
earlier tonight, so treat differences under ~100 ms as noise and read the over-budget counts
alongside. As in §9, the median is meaningless in headless and none of these should be quoted next
to §2's number.

## 11. The import screens, and the hour they cost

`30ac86b` added a development-only `?state=` seam to `/import`, and its own header says why the
harness could not use it as built: `devScreen` is guarded on a literal
`process.env.NODE_ENV !== 'production'` that the bundler folds, so a production build **eliminates**
the branch. `next build` pins `NODE_ENV=production`. The harness runs `next build` then `next start`.
The seam is correctly impossible on exactly the path the harness uses.

The harness now has a `--dev` arm that runs `next dev` against the exported commit instead. **The
guard was not weakened**, which was never on the table: a seam reachable in a production build is a
second way into a screen a real user can reach.

Dev captures carry `stub-dev--` in the filename rather than `stub--`, and the manifest records
`buildMode`. They are **not the same artefact** as a production capture — no minification, React in
development mode, different bundling and different timing — so they are good for layout and copy,
which is what Q1 asks of these screens, and **the motion measurements in §9 and §10 stay on the
production path.** Dev captures also carry Next's own dev-indicator badge in the corner; it is not
product UI.

### The failure that nearly shipped, and the guard that now stops it

The first `--dev` run produced ten screenshots across five `?state=` values. All ten were the same
idle paste screen. Status 200, no page errors, nothing failed.

**Next 16's dev server refuses cross-origin requests for its own client chunks.** Driving `next dev`
at `http://127.0.0.1:<port>` returns **403 on every `_next/static/chunks/*` file**, so React never
hydrates — no effects, no handlers, no client state — and `useDevScreen`'s effect never runs. The
server-rendered HTML still paints perfectly, and a screenshot of it looks completely fine. Serving
on and requesting `localhost` fixes it; `next start` is unaffected, which is why every earlier
measurement was sound.

This is the second time tonight a capture was honest in its pixels and wrong in its filename, so it
is now checked rather than watched for:

- **`hydrated`** — every capture asserts a React root exists on the page. An unhydrated capture is
  server HTML, not the product, and must never be filed as evidence of one.
- **`notExpect`** — a screen reached through a seam must prove it left the screen it was reached
  *from*. The import screens assert the idle screen's `OR TRY ONE OF THESE` is gone.

Both land in the manifest per shot, the run prints `UNUSABLE` lines naming which check failed, and
it now **exits non-zero** when any capture fails one. A harness that cannot fail cannot be evidence.

### What the seam does and does not reach

Captured at `5169413`, both gate viewports, all ten hydrated and all ten seam-verified: `no-places`,
`review`, `rail`, `error-POST_UNAVAILABLE`, `redirect-UNSUPPORTED_HOST`.

**One gap, and it matters for W6.** `spec-no-places-found.md` gives three distinct cases — A no
caption, B nothing named, C area only. The seam hardcodes `hadCaption: true` and reaches **case B
only**; A and C have no `?state=` spelling. Whoever rebuilds that screen in Wave 6 should extend the
seam to all three, or the before/after will silently compare one case out of three.

### Observed on the review screen, not filed

At 390×844 the header reads **`3 places found`** while the counter below it reads **`1 of 2
selected`**, with two candidate cards visible. Whether the third candidate is deliberately outside
the selectable set (it is the past-the-cap card nobody looked up) or simply below the fold, the two
numbers contradict each other on the same screen. W6-4 is about to rework this screen's provenance
hierarchy, so it is worth deciding deliberately rather than inheriting.

## 12. Re-measured after the label tiering landed (`1eb78f5`)

§10 predicted that `1eb78f5` would move the 2,000-pin measurement onto `facelift-plan.md` §2's
expensive axis, because `5cd7ce8` put the camera where the pins draw and the tiering puts labels
where the camera now rests. It landed. Re-measured at `31699a9`.

**It does not. The tiering thins 2,000 clustered pins to zero labels by its own mechanism, and the
probe can now prove that is what happened rather than inferring it.**

| | 390×844 30 | 1440×900 30 | 390×844 **2,000** | 1440×900 **2,000** |
|---|---|---|---|---|
| Resting zoom | 11.605 | 13.005 | 10.923 | 12.366 |
| Pin symbols drawn | 30 | 30 | 2,000 | 2,000 |
| **`labelZoom` tiers present** | **[13, 14]** | **[13, 14]** | **[14]** | **[14]** |
| **Pin labels drawn** | 0 | **5** | **0** | **0** |
| Frame time max | 850.0 ms | 792.9 ms | 766.3 ms | 518.2 ms |
| Frames over 33.3 ms | 9 | 11 | 12 | 15 |

**Why the zero is trustworthy this time.** §10's zero was produced by a commit that stamped no
`labelZoom` at all — the count was zero because the property was *absent*, and calling that "the
tiering thinned them" would have been confidently wrong. The probe now reports the distinct tier
values and counts pins carrying no tier, so the two stories are distinguishable. At 30 places the
tiers are `[13, 14]` and **five labels actually render at z13.005** — the mechanism is live and
demonstrably produces labels. At 2,000 places in one metro every pin is pushed to `[14]`, because
`labelTierFor` sends a pin with no `LABEL_CLEARANCE_PX` of room to `LABEL_ALL_ZOOM`, and the camera
rests at 10.9–12.4. **The package defends itself by its own mechanism**, which is worth more than an
argument that it would.

**The frame budget did not regress, and the reason to trust that is not `maxMs`.** Against the
pre-tiering 2,000-place run: frames over 33.3 ms went 11 → 12 on mobile and **17 → 15** on desktop.
`maxMs` went 543 → 766 on mobile, which looks alarming until you notice that **the 30-place run on
the same commit measured 850 ms — higher than the 2,000-place run.** A 30-pin map cannot cost more
than a 2,000-pin one; that is the instrument's noise, not the product's. So `maxMs` is
noise-dominated at this sample size and the over-budget counts are the number to read. They are
flat. **No regression attributable to `1eb78f5`.**

This also tempers §10's own before/after: the mobile 425 → 543 ms difference recorded there is
inside the same noise band and should not be read as a cost of `5cd7ce8` either. The over-budget
counts remain the honest signal in both comparisons.

**The boundary of this result, stated because it is where it would break.** These 2,000 pins are one
metro, so none of them has clearance and all of them tier to 14. **A 2,000-place library spread
across many cities would have clearance, would tier lower, and would draw labels at these zooms** —
which is §2's 34.0 ms case. That library shape has not been measured. It is also not a shape this
product produces today at that size, but it is the one to measure if anyone asks the question again.

## 13. Q1 — the walkthrough gate

**Commit `9e6231802fae132d7b9b7a17b5f41f3310615274`.** 32 screens on the production path (`next build` + `next start`) at 0, 3, 30
and 300 places, plus 10 import states in dev mode, at **390×844 and 1440×900**. Every signed-in
screen is stub-backed. Judged against `facelift-plan.md` §3a, `voice-and-vocabulary.md` and
`no-crumbs-design-system.html` — not against memory of the old screens.

The question was not "does it work" but **"does this look like a screen someone designed?"**

### What I would fix before showing this to anyone

**S1, S2, S4 and S6, in that order.** S1 alone would end a demo.

### Findings, ranked

**S1 — CRITICAL. 300 places on a phone is an unreadable heap.**
At 390×844 with 300 saved places the map draws ~300 overlapping teardrop pins in a single mass
covering the middle third of the screen. No place is identifiable, and none is individually
tappable. There is no density handling *inside* the pin band — the band system swaps pins for area
pills only below z8.5, and clustering was deliberately removed (`ac43eaa`). Desktop at 1440×900 is
heavy but survivable because the canvas is four times the area. `overnight-run-plan.md` §8a says
the product dies at scale; at 300 in one metro, on the primary target device, it does.

**S2 — HIGH. The mark renders as a plain teal disc at every size it ships at.**
Verified independently at three call sites: landing 390×844 (~36 px), landing 1440×900 (~44 px),
sign-in 390×844 (~36 px). It is a solid filled circle — no pin silhouette, no outline, no mascot.
**This is a third read and it agrees with the reporter, not with the builder's "irregular at 30px and
up".** On the landing page it sits beside the wordmark, so the mark carries no meaning the words
do not already carry; on sign-in it appears alone, where it reads as a bullet.

**S3 — HIGH. A systemic dead-space pattern on mobile, across six screens.**
Landing, sign-in, profile (0 places), collections (0 places), the import failure screen and the
import no-places screen all put content in the top ~30% at 390×844 and leave **45–60% of the
viewport empty**, with the action pinned to the bottom. Each is defensible alone as thumb-zone
composition. Together they are the product's dominant visual impression on a phone, and it is of a
screen nobody finished. The **desktop** no-places screen — a centred card, sized to its content —
is the better answer and already exists in the codebase.

**S4 — MEDIUM. `3 places found` sits directly above `1 of 2 selected`.**
Confirmed, both viewports, and it **survived W6-4**. Two contradictory counts, one screen. Already
routed; this is the independent verification.

**S5 — MEDIUM. Filter chips clip at 1440×900 once the counts get wide.**
At 300 places the chip row overflows the 500 px list panel: `Restaurant 10…` and `Outdoor Seating`
are cut by the right edge with no wrap and no scroll affordance. At 3 places the same row wraps
correctly, so this is count-dependent and invisible in a small fixture.

**S6 — MEDIUM. A raw error enum is user-visible.**
The failure screen prints `Reference: POST_UNAVAILABLE`. `voice-and-vocabulary.md` §4 bans
machinery vocabulary outright, and a SCREAMING_SNAKE enum is machinery vocabulary in its purest
form. Either a human-readable reference or nothing.

**S7 — MEDIUM. The rail's second step repeats its own label.**
`Finding the places` / `Finding the places…` — the title and the fact line beneath it are the same
string. Step one does it correctly: `Reading the TikTok` / `Read @demo's TikTok`. The fact line is
meant to carry what happened, and for step two it carries nothing.

**S8 — LOW, needs a ruling rather than a fix. Relative dates.**
List rows read `Saved 12 hours ago`. §5 specifies `3 Aug` within the year and `3 Aug 2025`
otherwise; relative time is not in the vocabulary. Possibly a deliberate exception, but it is
undocumented.

**S9 — LOW. Two-clause strings, against §5's "one clause per string".**
Profile zero state: *"Nothing saved yet. Paste a TikTok link and your map starts here."* Failure
subhead: *"Some TikToks don't share enough for us to work with. It's worth a retry."* The no-places
subhead runs to three.

**S10 — LOW. `/profile` has no top safe-area inset at 390×844.**
The `Profile` title sits flush against the viewport top edge. `/map` uses
`env(safe-area-inset-top)` for its chrome; this route does not, so on a notched device the title
would sit under the status bar.

**S11 — LOW. Sign-in shows the mark without the wordmark; landing shows both.**
Permitted by §2 — both are the same surface. But the two screens are adjacent on the demo path and
`app/page.tsx`'s own docblock says that if they do not read as one product it is the first thing
anyone notices.

**S12 — INFORMATIONAL, not a defect.** The basemap's label script changes with zoom: Tel Aviv
street labels render in Hebrew at z13 and in Latin at z11. CARTO behaviour, not ours.

### Two corrections to the brief I was given

**There is no auto-opened import overlay at 0 places.** `map-page-client.tsx:249` reads
`restingStop = places.length === 0 ? 'half' : 'peek'`. The sheet rests at half with the headline,
the subhead and `＋ Add a TikTok` all visible — which is the fix for the earlier zero-state finding
and it works. Nothing opens over the map. The render and the code agree; the briefing did not.

**No seventh surface for the name.** Across all 42 captures the name appears only as the landing
wordmark. Sign-in carries the mark alone. §2 is not violated anywhere in this sweep.

### What this sweep could not judge, stated so nobody reads it as coverage

- **`/collections` shows `No places yet` for a collection my fixture fills.** The index reads
  `collection_items`, which the stub returns empty. **A fixture artefact, not a finding** — the
  count on that screen proves nothing either way.
- **The zero-state map frames on London** because the harness sets no time zone and
  `zeroStateBounds` falls back. A real user in Israel gets Tel Aviv. Not a defect.
- **`no-places` is spec case B only** (`hadCaption: true` is hardcoded in the seam). Cases A and C
  were not seen, and nothing here should be read as covering them.
- **The import screens are dev-mode captures** and carry Next's own dev-indicator badge in the
  corner. Not product UI.
- **Every signed-in screen is stub-backed.** Layout and copy are trustworthy; nothing about a query,
  a join or a policy is.
- **Q2 remains unmeasurable in this environment**, unchanged from §5.
