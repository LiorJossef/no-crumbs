# Current state — the cold-start document

> **CURRENT to 2026-09-02.** The UI-density session ran that day and added **21 commits** to
> `no-crumbs-implementation`; its record is
> [`archive/handoff-2026-09-02-ui-density.md`](archive/handoff-2026-09-02-ui-density.md) and the decisions behind it
> are [`archive/feedback-round-3-work-plan.md`](archive/feedback-round-3-work-plan.md) §5.1. **Read the handoff
> before acting on anything below** — it carries the nine inherited test failures, the two features
> committed but not verified in a browser, and what must not be restarted from scratch.
>
> The layer beneath was verified on **2026-08-31**, after the overnight facelift-and-growth run
> ([`archive/overnight-run-report.md`](archive/overnight-run-report.md), ledger
> [`archive/overnight-run-ledger.md`](archive/overnight-run-ledger.md)). The branch is `no-crumbs-implementation` and
> is **still not merged** — but no longer for the reason this file used to give: **item 0's "the
> runner cannot start" is STALE.** Runners work; CI was red for two small, real reasons, both since
> fixed, and the owner has since taken CI out of scope entirely (`archive/feedback-round-3-work-plan.md`
> Lane 0). What blocks the merge now is simply that PR #109 has not been landed.
>
> Earlier state was verified on **2026-08-30**. If it is wrong, that is a defect — fix it in the same branch as the change that
> made it wrong.
>
> This file used to be 1,241 lines of stacked session notes, and its first section warned about
> unpushed commits that had landed and a production outage that was over. That history is now
> [`archive/history-2026-08.md`](archive/history-2026-08.md); it is dated and is not maintained. Read
> [`README.md`](README.md) for what else in `docs/` can be trusted.
>
> **Other documents cite section numbers this file no longer has** (`§0.1b`, `§5.1`, `§9.1`, `§9.3`
> and so on). Those all resolve in `archive/history-2026-08.md`, which kept the old numbering.

## Where the product is

The core loop works end to end and is deployed. A TikTok link becomes a caption, an LLM extraction,
a resolved place and a saved row; the map shows it; the library finds it again.

**The product is named.** **No Crumbs**, owner decision 2026-08-30 — `brand-and-product-foundation.md`
§3 is closed, §3.1 records the mascot ruling, [`voice-and-vocabulary.md`](voice-and-vocabulary.md)
governs every string, and [`facelift-plan.md`](facelift-plan.md) is the plan of record for the visual
rebuild.

**Implemented on `no-crumbs-implementation`, 2026-08-31, and not on `main`.** The product had been
shipping its repo codename `P-002` to users — in the tab, in every bookmark and beside the mark. It
now carries the name, a mark, a favicon, an app icon, a manifest and a link preview. **One finding
for the owner:** the ratified crumb outline deviates from a true circle by 4.6% of its radius, which
is under one pixel at every size the mark ships at, so at chrome sizes **it is a circle** — measured,
with a rendering bug ruled out first. §3.1 rule 1 forbids changing the outline, so rule 2's *face on
chrome* carries the mark instead. See the run report, §4 decision 1.

**Live** at `https://no-crumbss.vercel.app`, auto-deployed from `main`.
`/healthz` → `{"ok":true,"stage":"production","commit":"601cebf"}` (re-measured 2026-09-05; the former `p-002-zeta.vercel.app` now returns `DEPLOYMENT_NOT_FOUND`).

**Built:** auth · the map, camera and pins (MapLibre + CARTO) · the saved list, search, category
filter and pressable tag chips · place detail · TikTok import with review and confirm · manual add
by name · been / not been yet · near me · collections including shared collections · a profile page.

**Not built:** the streaming import route (`L0-F6`) — `/api/imports/probe` is still the
request/response stand-in, and the overnight run deliberately did **not** fund a substitute:
`W6-2` split the source fetch into a second honest round trip instead, so the post is on screen in
about a second while extraction runs underneath, and the rail still claims no stage the server did
not send.

**`L1-F8-T1` is built** on `no-crumbs-implementation` (`642cab0`) — the account menu, sign-out and
delete-my-data. It was the last unbuilt L1 product feature.

**Superseded rather than delivered:** D2b's two-source global resolver. Google Places is the
canonical provider (15/16 top-1); Nominatim was never built and no adapter exists in `src/`.

## Measured, not remembered

Re-measure these rather than copying them forward. Every one of them was wrong in at least one
document before 2026-08-30.

| | |
|---|---|
| Tests | **219 files, 3,540 passing and 9 FAILING** on `no-crumbs-implementation`, measured 2026-09-02. The 9 are inherited from `abc1771` and are named in the handoff — **build them green, do not edit them green** |
| `tsc --noEmit` | **4 errors**, all typed-route `Link` complaints. Pre-existing baseline, confirmed at three separate commits. `npm run verify` runs bare `tsc` and will fail on them |
| Migrations on disk | **36** — `0001`–`0037`, `0027` does not exist. (This file previously said 29; that was measured against `0030`) |
| Local database | applied head `0027`; **`0021`–`0023` and `0028`–`0037` are NOT applied**, plus a phantom `0027` row with no file. **13 behind disk.** Anything "verified locally" about saves, collections, profiles or tags is measured against the wrong schema. The clean repair destroys the owner's local saves — orchestrator only, on a specific instruction |
| Staging database | `0018` — **last measured 2026-08-30 against 29 files. Re-measure before planning any push** |
| Production database | `0026` — same caveat |
| Git | `no-crumbs-implementation` is **417+ commits ahead of `main`**; `main` serves production. Tree clean at `3a948da` |
| Open PRs | #72, #64, #22 — green from runs before 2026-08-29 21:52, all 153–424 commits behind `main`; plus #101 (project-contained Claude config), whose checks could not start |
| Git hooks | `core.hooksPath` must be `.githooks`. It was **unset** on 2026-08-30 — `main` was unprotected. `npm run check:claude` now fails if that recurs |

**Production is eight migrations ahead of staging.** Staging is the stale environment, so it is no
longer a rehearsal for a production push.

## CI exists and is correct; the runner stopped starting on 2026-08-29

**Corrected 2026-08-30.** This section previously said "there is no active GitHub workflow" and
listed *restore CI* as owed work. **That was wrong, and it was expensive to be wrong about** — it
would have sent someone to rewrite a workflow that is already right.

`.github/workflows/ci.yml` is tracked, is on `main`, and `gh workflow list` reports it **active**. It
defines exactly the four jobs this file described as the ones it "used to": `lint · typecheck ·
layer guard · unit`, `next build`, `playwright`, and `migrations · RLS policy tests`.

What is actually true is narrower and more actionable. Measured 2026-08-30 over the last 100 runs:

| | |
|---|---|
| Successful runs | 72 — most recently **2026-08-29 21:36** |
| Consecutive failures since | **22**, from 2026-08-29 21:52 to now |
| Shape of every failure | **0 steps executed, ~2 seconds, no logs, no annotations** |

A job that fails in two seconds having run no steps never started. That is not a code failure and no
change to `ci.yml` will fix it — it is an **account-level GitHub Actions problem**, most plausibly an
exhausted minutes allowance or spending limit on a private repo. The billing endpoint needs a `user`
scope the CLI does not currently hold, so this is diagnosed, not confirmed.

**Owner action, and it is the cheapest unblock available:** check
<https://github.com/settings/billing>. Until Actions can start, **`npm run merge:pr` correctly
refuses every PR** — an empty or failing check list is not a pass — so *nothing can land*, including
the three PRs below and anything built this week. That single fact gates the remaining seven days.

The `e2e` job's older weakness stands and is unrelated: it sets no `E2E_PASSWORD` and starts no
Supabase, so seven of nine spec files skipped and the check reported green over four signed-out
tests. `tests/e2e/global-setup.ts` was written to make that impossible and was itself dead code —
`playwright.config.ts` had no `globalSetup` key. **It is wired now** (verified against all four
environments it distinguishes), so the next green run is the one that proves it: the job must stand
up a local Supabase, seed the demo user and pass `E2E_PASSWORD`, or the guard will fail it. That is
the intended behaviour, not a bug to work around.

**Local `npm run verify` is the only gate that runs today**, and on a fresh checkout it does not run
at all until `npm install` has: measured 2026-08-30, `node_modules/` was absent, so the `eslint` on
`PATH` was 8.35.0, which cannot read the flat `eslint.config.mjs` this repo ships, and `verify` died
on its first step. The same absence left `core.hooksPath` unset — see
[`claude-code-setup.md`](claude-code-setup.md).

## What changed on 2026-09-02, and the one finding worth carrying

**The session's purpose was the owner's instruction:** *"top priority is that the ui will feel nice
and friendly and not overwhelming by a lot of tags or buttons or texts."* Eleven surfaces got
quieter. The import loading screen lost **237 px of empty slack on an 844 px viewport** (28.1%, and
it is the first thing you see after pasting a link); the collection header lost a row that was a
duplicate of a control directly above it, taking fully visible list rows from **1 to 2**; the
account menu went 469 → 437 px and 16 → 13 lines of text.

**The finding that generalises: `cn()` was silently deleting every custom type size in the product**
(`e4ad42b`). `tailwind-merge` classifies a `text-*` utility by its value, and anything it does not
recognise as a size is filed as a **colour** — so `text-micro` shared a conflict group with
`text-brand`, the merge kept the last one, and the size vanished. This had been true for as long as
those seven tokens existed, across 65 call sites. It looked local because a plain `className` string
never passes through the merge: 224 elements on `/map` rendered correctly and only the composed ones
broke. It surfaced because the owner said the `Been` badge "looks weird" — it was rendering at 16 px
against the 11 px its component asks for.

**The rule to take from it: a class present in the source is not a class present on the element.**
When something looks wrong and the source looks right, read the computed style. `utils.ts` now names
the seven sizes and a test reads them out of `globals.css`, so adding a `--text-*` token without
registering it fails a test rather than quietly resizing something months later.

**Two lanes were stopped mid-task by the owner and committed in that state rather than discarded:**

- **`abc1771` — the filter row.** Real work landed: three rows of controls became one, 16 pills
  became 3 triggers, and the first place row moved **y370 → y265** at 375×812, so the header band
  fell from 46% of the viewport to about 33%. **Unfinished:** the menus do not anchor to their
  triggers, mobile should not use a floating popup at all, tags is not on the shadcn Combobox
  (`2386f46`), the active trigger has no hover, sort hit-tests 32 px against a 44 px floor, and
  close-on-select was never built. **Ten owner rulings now exist for it** in
  `archive/feedback-round-3-work-plan.md` §5.1 — the lane churned because this product has **no menu or
  dropdown specification**, so give the next attempt those rulings and write
  `docs/ux-menus-and-dropdowns.md` before restarting.
- **`4bc04d0` — wave 1's two orphaned features**, every TikTok source on a place card and
  multi-select + bulk delete in Places. Both had shipped a working data layer during wave 1 and were
  never rendered. **It compiles, `/map` renders and ~45 new tests pass, but NOBODY HAS USED IT.** No
  two-source card was opened and no real delete was run. Unit tests and a compile are not the §2 bar.

## Open, in impact order

0z. **The three items with no slack, and none of them is a UI problem.** Submission is **6 September
   2026**. (a) The **10–15 minute presentation deck** does not exist —
   `archive/presentation-outline.md` is 207 lines of outline, it is graded, it competes with no other lane
   for files, and it cannot be rescued in an hour on the day. (b) **PR #109 has not landed**, so 21
   commits of 2026-09-02's work and everything before it reach no user. (c) The **local database is
   13 migrations behind disk**, which blocks the geography backfill and invalidates local
   verification of saves, collections and tags.

0y. **Verify `4bc04d0` in a browser.** See above — it is committed and unproven.



0a. ~~**The home screen draws no pins at all.**~~ **FIXED on `no-crumbs-implementation`, 2026-08-31**
   (`5cd7ce8`, package W2-1). It was worse than this entry said: at 0 places and at 300 the product
   showed *the same screen*, differing only by a number in a capsule. The repair keeps the box and
   deletes the ceiling — the 2026-08-30 reversal made two changes and only one answered the owner's
   complaint, since widening the camera box from the anchor cluster to the whole library is
   order-independent and fixes "it opened on the Jerusalem Hotel" on its own. `settleZoom` replaces
   the ceiling with a 0.15 guard window resolved **outward**, because zooming out never crops.
   **This partly reverses an owner ruling and is flagged for the owner** — report §4 decision 2.
   Note that removing a ceiling is not restoring a floor: a floor would discard the box and put a
   Tel Aviv + Tokyo library over open sea.
0. **GitHub Actions cannot start a runner** (above). It is item zero because it blocks *landing*,
   not building: `merge:pr` refuses a PR whose checks are absent or failing, so every finished
   feature queues behind it. Owner action, not an engineering task — check
   <https://github.com/settings/billing>. **Do not "restore CI"**; `ci.yml` is present, active and
   correct. **Re-measured 2026-08-30 evening: unchanged** — the four jobs still report `steps=0`, a job
   that never began. `#101` and `#102` merged regardless, which means the `merge:pr` gate was
   **bypassed rather than passed**; do not assume anything on `main` is verified by CI.
1. ~~**`L1-F8-T1`**~~ — **BUILT on `no-crumbs-implementation`, 2026-08-31** (`642cab0`), to a ruling
   written before the code existed ([`archive/overnight-deletion-review.md`](archive/overnight-deletion-review.md)).
   The trap was real and is worse than recorded: **no role reachable from this application can write
   `collections.owner_id` at all** — `0024` grants `authenticated` update on `(name, description)`
   only, revokes everything on those tables from `service_role` and never grants it back, and adds a
   one-owner index plus a policy refusing promotion. So transfer is not *missing*, it is
   **unexpressible** without a migration. Deletion therefore **refuses** while the user owns a
   collection somebody else is in, listing the blocking collections and offering actions the user
   already holds grants for. The zero-places first run shipped separately (`04ba93b`).
2. **`L1-F10` graded artefacts** — `test-specification.md`, `scale.md`, `deployment.md`,
   `how-the-system-works.md` do not exist; `security.md` is interim with 8 items owed. Largest
   submission gap.
3. Once a runner starts again, the first green `playwright` job is what proves the now-wired e2e
   guard: it must stand up a local Supabase, seed the demo user and pass `E2E_PASSWORD`, or the
   guard will fail it by design.
4. **Unverified code on `main` and in production**: the `{ kind: 'user' }` arm of `Framing`
   (`map-surface.mapcn.tsx`) was written as a minimal fix and never exercised in a browser. Confirmed
   2026-08-30 to be **load-bearing** — it is the only thing that retires a replayed framing, so it sits
   directly under defect 0a and item 5. Produced in one place, consumed in one place, covered by no
   test. Fix and cover it together.
5. **Defect 1 — mechanism confirmed 2026-08-30, and it is broader than a country tap.** `refitFramed`
   replays `framing.current` on every `ResizeObserver` hit, and `framing.current` is only retired by
   `noteUserGesture`. Since the 2026-08-30 home reversal, the first-load framing *itself* records
   `maxZoom: 8.0` — so a plain load followed by any resize (mobile Safari collapsing its URL bar on the
   first scroll) replays a framing that lands in the area band with no pins, with no country tap
   involved. Owned by [`facelift-plan.md`](facelift-plan.md) stage 2, and `qa-reliability` verifies the
   fix independently.
6. **Migration pushes** — staging `0019`–`0030`, production `0028`–`0030`.
7. ~~Pin labels are gated at `LABEL_MIN_ZOOM = 14` while home settles at z12–13.~~ **Stale** — this
   predates the 2026-08-30 home reversal. Superseded by 0a: home rests at z8.0, below the pin band, so
   there is nothing to label. The question is what the overview should be, not where the label gate
   sits.
8. `EMPTY_LIBRARY_BOUNDS` is a guessed region and needs an owner ruling. Its docblock is also now
   factually wrong: it cites `HOME_LANDING_MIN_ZOOM`, a constant that no longer exists, and claims a
   pin-band rest that cannot happen. Owned by [`facelift-plan.md`](facelift-plan.md) stage 2 as a
   designed zero-state.
9. Four `llm_guess` duplicate pairs no distance guard reaches (327 m median drift against a 75 m
   radius). The `llm_guess` → Google upgrader does not exist. **No backfill without reviewing the
   rows.**
10. A TikTok connect timeout is still reported to the user as "this share link has expired".
11. Dark mode is an unsigned first pass. **The product name is still open** (`L1-F1-T1`).
12. **The camera movers are now eight.** `map-page-client.tsx:229` says so in its own docblock;
   §3.9 of this file says six and `06` §9.2 says four. Three documents, three numbers, on the surface
   the user touches every session. Found 2026-08-30 by `maps-geospatial` while ruling on path
   ownership. And **`src/app/map/map-page-client.tsx` is owned by no agent** — it decides when the
   camera moves and sits outside both map specialists' scopes, which is a hole in the middle of
   `L1-F5`.
13. **A fifth, unmirrored copy of `PEEK_PX`.** `map-surface.mapcn.tsx:1139` hard-codes `128px` inside
   a Tailwind arbitrary value. `sheet-geometry.ts:24` documents four mirrors and
   `tests/unit/shell/sheet-geometry.test.ts` pins them; this one imports nothing and no test sees it.
   Move the peek and the zoom controls drift off the sheet silently.
14. **There is no `.env.local` in this checkout** — only `.env.example`. `next dev`, the manual
   harnesses and `db:push:*` all expect one, so "run the actual application" (`working-agreement.md`
   §2) cannot currently be done here at all. Verified by filename only, never by reading contents.

## Decisions not to reopen

Google Places is canonical and Overture is out (2026-08-28) · production resolves with Overture
behind a ToS gate, because Google content may not pair with a non-Google map (`06` §3.1) · density
clustering of saved places is removed · no Elsewhere country-to-city tree (`d9cbdf2`) · area
grouping is 2 km OR (50 km AND same normalised locality), and three fixes in that family are
measured-and-rejected · TikTok only; Instagram and YouTube are a recognised redirect to manual add ·
no return triggers of any kind · caption pipeline first, before new inputs.

## Owner rulings, 2026-09-04

Taken at the morning handoff of the overnight run, and recorded here rather than lost in a
transcript.

1. **The geography backfill is applied on local only.** 8 rows, 0 skipped — four Prague localities
   and four missing Israeli country codes. Production is deferred until the four adapter fixes are
   on `main`, because until they are the next import recreates the defect. Product-level proof: the
   map now reads `60 in 4 countries` with Prague as one pill of 5, and no countryless row.
2. **The duplicate-places migration is deferred past the deadline.** ~14 saves that should be 6
   venues — 14% of the library, all `llm-guess`, none Google-resolved. It needs a `SECURITY DEFINER`
   change plus a backfill, and the failure mode if done wrong is two genuinely different places
   collapsing into one. Owner: *"not before the deadline."* The multi-source place card already
   works when two TikToks land on one row, so what is left is a visible but survivable duplication.
   **This is a deferral, not a cancellation** — it is the largest known data defect in the library.
3. **The share panel keeps its `What people can see` disclosure**, against
   `archive/ux-card-and-share-2026-09-03.md` §S4, which wanted all three privacy sentences unconditional.
   3.1 took the panel from 551 to 436 px and 66 to 29 words and that was the point. §S4 is amended
   by this ruling, not violated. The sentence governing whether you share at all still renders
   unconditionally.
4. **The `half` stop**: owner was unsure, so `ux-interaction` ruled. It rejects raising the stop,
   dropping the tags row, and accepting the clip, and takes a fourth option — the source still
   becomes `h-28` (112 px) on every host, deleting the `compact` prop. The lever was rejected once
   before as "48 px against a 53–92 px deficit"; that deficit was measured while the Places/
   Collections view switch was still taking 56 px from the card's column, and `8a74801` gave those
   back. The residual is 6 px at 844 and 23 px at 812. **Not yet applied** — it is folded into the
   place-card compaction pass.

## Open questions for the owner

1. Do we accept a lower hit rate as the price of staying inside official APIs? (Recommendation: yes,
   and say so in the product's voice.)
2. Do we hold the grounding line, or attribute model knowledge as model knowledge?
3. Should export exist?
4. OD-1: does the "info" boundary govern place facts only, or every stored field? Gates `user_tags`.
5. Backfill the phantom duplicate rows?
6. The TikTok data-export experiment — costs one request against the owner's own account.
7. ~~Is `PLACE_RESOLVER=google` set on production?~~ **ANSWERED 2026-09-04: yes.** The owner,
   asked directly: *"yes we are using google."* So production does serve Google-resolved
   coordinates on a MapLibre/CARTO map, which is the row `06` §3.1 marks *"NO. Explicitly
   forbidden, Service Specific Terms §5.3 + Places policies."* The question is closed; the
   condition it was asking about is real and live. The Overture fallback is still in
   `place-resolver-factory.ts`, so closing the gate is one variable. Recorded in `README.md`'s env
   matrix so a reader is not misled, and left as the owner's decision for a submission with one
   account and no third-party users.
