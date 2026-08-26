# Current state — cold-start document

> Updated **2026-08-26**. Read this after `CLAUDE.md` and `working-agreement.md`, before anything
> else. It is the running state, not a diary: when something here stops being true, change it.

## 1. Where the work is

**`main` now carries everything below.** PRs [#23](https://github.com/LiorJossef/P-002/pull/23) (the
import loop made real, and the confirm-endpoint exploit closed) and
[#24](https://github.com/LiorJossef/P-002/pull/24) (`L1-F6-T2`, search over saved places) both
landed on 2026-08-26, through `npm run merge:pr` with all six checks green.

Also landed 2026-08-26, later the same day: [#27](https://github.com/LiorJossef/P-002/pull/27)
(preserving the staging orphan objects), [#28](https://github.com/LiorJossef/P-002/pull/28) (staging
migrated to `0018`, and the corrected production diagnosis) and
[#29](https://github.com/LiorJossef/P-002/pull/29) (`L1-F7-T2`/`T3` — delete a saved place and edit
your own note). All three through `npm run merge:pr` with six green checks.

**What #29 changed, beyond the obvious.** The feature itself is small; making it *reachable* was
not. The only route into a place's detail was clicking its pin, and MapLibre paints pins into a
`<canvas>` — so delete and note-editing would have been mouse-only, unreachable by keyboard, and
impossible to drive from Playwright without pixel coordinates that any camera move invalidates
(`L1-F9-T4` needs exactly that). The list is now a selection entry point; `PlaceRow` takes an
optional `onSelect` and renders as before without it.

| Commit | What |
|---|---|
| `feat(places)` | `domain/places/note.ts` — one tested rule the action and the UI both use |
| `feat(places)` | The two Server Actions. No migration: the grants were already right |
| `feat(map)` | The list becomes an entry point to place detail |
| `feat(map)` | Delete + note editing inside `PlaceDetail`, which serves both surfaces |
| `test(db)` | `place_id`/`origin` unwritable, and `note` writable — the direction nobody asserts |

Open branch: **`chore/merge-autonomy-and-the-ci-gap`** — the workflow review described in §6b, in a
PR of its own.

**The merge rule changed on 2026-08-26 and this is the one thing not to get wrong.** Routine merges
no longer need the owner's approval: verified work with green required checks lands without asking.
But **GitHub branch protection is unavailable on this plan** (private repo, free tier — `403`,
re-confirmed today), so CI is *not* a merge gate and a red PR can be merged with one command.
`scripts/merge-pr.sh` is what replaces the human who used to read the check status. Merge only
through it. `git-workflow.md` §9 is the full rule, including the list of things that still need a
specific instruction each time (force-push, history rewrites, branch deletion, `--admin`/`--auto`,
merging anything red or pending, reverting what is on `main`, destructive database operations).

**What landed in #24 — `L1-F6-T2`.** The search field on `/map` had been decorative since the day it
was built: a bare `<Input>` with no state behind it. It now filters, and it filters the **pins** as
well as the list.

| Commit | What |
|---|---|
| `feat(search)` | The matching rule — `domain/places/search.ts`, plus 23 tests |
| `feat(search)` | The wiring: `query` lifted to `map-page-client.tsx`, both surfaces, the empty states |
| `feat(search)` | The camera flies to the results once the typing settles |

**What landed in #23 — the import loop made real.** In order:

| Commit | What |
|---|---|
| `feat(places)` | Country **names** → ISO-3166-1 alpha-2. `places.country_code` was NULL on every imported row |
| `fix(import)` | The probe route persists the `extractions` row and advances the `imports` row. Both tables had no writer |
| `fix(security)` | **The exploit.** Confirm derives every place fact server-side from the stored extraction |
| `feat(map)` | A finished import now moves the camera to what it saved and says what landed |
| `fix(import)` | Place identity keys on the caption name, not the model's re-identification |
| `perf(import)` | The extraction cache is **read**, not only written |
| `fix(a11y)` | The map sheet was hiding the entire page from screen readers |
| `feat(import)` | The review screen: places first, per-candidate selection, no fake confidence |
| `fix(db)` ×2 | The inventory realigned with `0017`, and migration `0018` — `anon` could call `save_place` again |

## 2. What is actually verified, and how

Everything below was checked by running the product and reading the database, not by reasoning
about the code. The driver is `tests/manual/import-e2e.manual.mjs` (a real browser against the
local dev server, local Supabase, live TikTok oEmbed, real model on a cache miss).

**Real TikToks exercised** — all four are cached in `sources` on the local database:

| Post | Outcome |
|---|---|
| `@exploringlondon/video/7346702347491446049` | 8 London restaurants. Multi-place, the main test case |
| `@joelleuzyel/video/7259010845558983978` | 1 place (Ha Kosem). Single-place |
| `@wheretofindme/video/7466857830218239264` | **No places** — genuinely names none in the caption |
| `@telaviv_city/video/7441621690783730945` | **No places** — same |

Scenarios covered: first import · re-import of the same post (duplicates) · saving a **subset**
(the confirm request carried exactly the two selected indices) · a post naming no place · a place
already in the library · desktop 1440×900 and mobile 390×844 · loading, empty, populated and
success states.

**Confirmed by `psql`, not by the response body:** all eight London rows carry the right name,
`category='restaurant'`, `locality='London'`, `country_code='GB'` and a verbatim
`saved_places.extracted_reason`; the `imports` row advances `processing → review → completed`; the
`extractions` row upserts on `(source_id, model, prompt_version)` and is **reused** on a re-paste
(no model call, `latency_ms` untouched); `saved_place_sources` links provenance.

**The exploit is closed, re-tested by me from an authenticated browser session:** the old body
shape (`provider`/`name`/`lat`/`lng`) is rejected 400; a forged `extractionId` is 403; an
out-of-range `candidateIndex` fails that item only. The Tel Aviv café the original attack renamed
and moved to the Eiffel Tower is unchanged.

**Search (`L1-F6-T2`), exercised by hand against the real 20-place library at 1440×900 and
390×844** — not by tests alone:

| Typed | What happened |
|---|---|
| `cafe` | 4 of 20, including **`Café Florentin`** and `Nordoy Café`. Accents fold, and the category matches too |
| `café` | The same four. It folds in both directions, which is the half people forget |
| `london` | 12 of 20; the camera flew to London |
| `tel aviv` | 8 of 20, matching **both** `Tel Aviv` and `Tel Aviv-Yafo`; the camera flew to Tel Aviv |
| `kiaans` | 2 of 20, and exactly one two-pin cluster left on the map — every other pin gone |
| `sushi` | 0 of 20, `Nothing matches "sushi".` + `Clear search`, and the camera **did not move** |
| `...` | Same empty state. A query the normaliser reduces to nothing matches nothing, rather than silently showing the whole library back |
| (cleared) | 20 saved, full list, camera framed on both cities again |

Also checked by use: the mobile sheet at all three stops (`peek` says `4 of 20 places` and expands
the sheet when tapped; the field is present at `half` and `full`); a place open in the detail
popover **closes** when a search excludes it; and `Escape` clears the field without closing the
sheet.

## 3. Unresolved — in impact order

0. **Production is down, and the recorded cause was wrong.** `https://p-002-zeta.vercel.app/map`
   and `/import` both return **500**; `/`, `/sign-in` and `/healthz` are fine, and `/healthz`
   reports `main`'s head commit, so Vercel is deploying the right code.

   This file used to blame the missing migrations. **It is not the missing migrations** — measured
   2026-08-26. `/import` also 500s, and `/import` never queries `saved_places`; it only builds a
   server-side Supabase client and calls `getUser()`. The two 500ing pages are precisely the two
   that construct a server-side Supabase client.

   **The actual cause: the Vercel project has no environment variables at all.**

   ```bash
   npx vercel env ls production --project p-002   # → No Environment Variables found
   ```

   The same for `preview` and `development`. Confirmed independently of the CLI: the whole ~1 MB
   production JS bundle contains no Supabase project URL and no anon key, only the bare
   `.supabase.co` string the library ships — so `NEXT_PUBLIC_SUPABASE_URL` was undefined at build
   time. `createServerClient(undefined, undefined)` throws before any query runs, which is why the
   response is a bare `Internal Server Error` rather than a rendered Next error page, and why
   `/map` never even reaches its `redirect('/sign-in')`.

   **Both problems are real; the env store is the first one.** Restoring the variables alone would
   move `/map` from throwing at client construction to throwing at query time, because production
   genuinely is still on `0009` while `get-spots.ts` selects `extracted_reason`, `source_url`,
   `address_line`, `source_dataset` and `resolution_score` from `0015`/`0016`. That second half is
   **inference from the ledger**, not measurement — prod's schema cannot be read without
   `PROD_DATABASE_URL`.

   **Restoring the variables is the owner's job** (entering credentials into a third party), and
   `docs/vercel-env-restore.md` is the checklist. `.env.vercel.preview` on disk is *not* a usable
   recovery source: its publishable key is live, but `SUPABASE_SERVICE_ROLE_KEY` in it is the
   literal string `PASTE_STAGING_...` and every production value is absent entirely.

   **Staging is done.** It was migrated to `0018` on 2026-08-26 and verified — see §3a. Production
   was deferred by the owner in the same session, pending `PROD_DATABASE_URL`.

3a. **Staging: `0018`, proven, 2026-08-26.** Recorded here because the next session should not
   re-derive it. Getting there was not a plain push: staging carried `0016`'s content under version
   `0019`, a remote-only `0020`, and an out-of-band transcription feature (a table, five functions
   and a storage bucket) with no ledger row at all — from the paused
   `codex/cloudflare-audio-transcription` experiment, whose migrations existed only inside
   `git stash@{3}`. All of it is preserved and replay-proved in `docs/evidence/db/orphans/`
   (PR #27) before anything was dropped; that directory's §5 is the full record.

   What was verified against staging, by running things rather than reasoning about them:

   | Check | Result |
   |---|---|
   | ledger | `0001`–`0018`, local == remote, **no remote-only row** |
   | `inventory.sql` | **15/15 PASS** |
   | `0008_policy_tests.sql` (rolled back) | **22 assertions PASS** under real `request.jwt.claims` |
   | the `/map` read query, as `authenticated` | real rows, every `0015`/`0016` column populated, RLS scoping 7 of 13 |
   | `save_place/4` (`0017`) | reason persists · provenance row written · `UPDATE` of `extracted_reason` refused `42501` · `0016` denormalised `source_url` applied · deferred constraint triggers fire clean |
   | `0018` | `EXECUTE` on `save_place` held by `authenticated`/`postgres`/`service_role`, **not `PUBLIC`** |
   | the real app, signed in | `/map` **307** when unauthenticated, and renders empty *and* populated at 390×844 and 1440×900 |

   **Not verified against staging, and why:** the TikTok import pipeline. It runs as `service_role`,
   and the only staging service-role key on disk is that `PASTE_STAGING_...` placeholder, so
   `/api/imports/probe` returns **502**. Nothing about staging's schema is implicated — the same
   flow is verified locally. It needs a real key, which only the owner can supply.

   One thing that fell out of that 502: the masked-error problem (§3.5) cost real diagnosis time.
   The screen said `COULDN'T READ THAT TIKTOK / Something went wrong / INTERNAL`, which pointed at
   TikTok, at the model, and at the network — none of which was the cause.

   Residual drift, stated rather than hidden: the empty `transcription-audio` bucket is still in
   `storage.buckets` on staging. Supabase refuses a direct `delete` on storage tables, so removing
   it needs the Storage API. It is outside `public` and no check in this repo looks at it.

1. **Coordinates are still the model's guess, and they are wrong by 65–470 m.** Measured across
   re-runs of the same caption. The screen is now honest about it ("Pin is approximate", a
   verify-on-Google-Maps link per card), but the underlying accuracy is unchanged. The owner has an
   existing Google key that made successful Places calls and **does not want to start paying or add
   a payment method now**; verify the real billing/quota/licensing position before proposing
   anything, keep resolution replaceable, and do not enable billing or add cost without asking.
   `06` §3.3/§3.4 is the standing decision this would reopen.
2. **Pre-existing NULL `country_code` rows still defeat dedup.** Confirmed live: importing Ha Kosem
   from a second TikTok created a *second* `places` row, because `resolve_place`'s near-duplicate
   guard compares `country_code is not distinct from p_country_code` and the older row's is NULL.
   New rows are fine. A backfill is a real data decision, not a code fix — ask.
3. **`/api/imports/probe` has no rate limit.** It is authenticated but spends a model call per
   request, against a hard ceiling of **500 Gemini 3.5 Flash calls/day**. The cache removes the
   repeat-paste cost; it does not stop a loop. `L0-F6-T1` owns the real limiter.
4. **`saved_places.extracted_reason` can be forged at row-creation time.** Measured, not reasoned
   about: an authenticated client POSTs straight to `/saved_places` with any `extracted_reason` it
   likes and it lands verbatim, bypassing `save_place`. `0015` deliberately excluded the column from
   the INSERT grant to keep it system-derived; `0017` grants it back because `save_place` is
   `security invoker` and the function's own INSERT is otherwise refused. **Bounded:** RLS
   (`saved_places_insert_own`) confines it to the caller's own row, and UPDATE is still refused
   (42501, verified), so a reason cannot be rewritten after the fact — a user can lie to themselves
   about their own provenance and to nobody else. It still contradicts this branch's own rule that
   the browser may never send a place fact. **The fix:** make `save_place` `security definer` with a
   pinned `search_path` and revoke the column grant. That is a security change owed its own review —
   a mis-scoped definer function is a classic escalation — so it is written down here rather than
   slipped in beside an unrelated migration. Recorded in `inventory.sql` check 5 with the same
   measurement.
5. **Every API error is masked as `INTERNAL, retryable: true`,** including a 400 for a malformed
   body. Honest about not leaking internals, dishonest about retryability, and hard to diagnose.
6. **The demo library has four duplicate places** ("Kiaans"/"Kiaans Tooting", two "Tokii", two
   "Sycamore …", two "HaKosem") created by my own testing before the identity fix landed. **They can
   now be removed from the UI** (`L1-F7-T2`, #29) — open one from the list and use "Remove from your
   places". Deliberately not done for you: they are your rows, and they are also the most realistic
   messy-state fixture the library has.
7. Two `imports` rows are stuck at `status='processing'` from before the probe route wrote terminal
   states. Historical only — the current code cannot produce them.
8. `docs/ux-import-review-screen.md` §8 (motion) is specified but not implemented. Deliberate:
   ornament before correctness. (The debounced live-region announcement it also lists now exists on
   `/map`'s search — `useResultAnnouncement` in `map-page-client.tsx` — but not on the review
   screen.)
9. **There are now six camera movers, and `06` §9.2 lists four.** The fifth is a settled search
   (flies to its results; clearing frames the whole library) — there because searching `tel aviv`
   from a London view otherwise showed eight places in the list and zero pins on the map. The sixth
   is **selecting a place from the list** (#29): on desktop the detail opens in the map's
   pin-anchored popover, so selecting a place outside the viewport produced a popover clamped to the
   edge of the map pointing at nothing — measured at 1440×900 with the camera over Europe and the
   place in Tel Aviv. Both reuse `focusPlaceIds`, so the existing guards (array-identity keying,
   `FIT_BOUNDS_MAX_ZOOM`, resize re-fitting what was framed) apply unchanged. `L1-F5-T2` has to adopt
   or replace both — a real loose end, not a finished decision.
10. **Search is client-side, over the places `/map` already loaded.** That is what makes the list
   and the pins narrow in the same frame with no request and no flicker, and it is right for the
   hundreds of places this product realistically reaches. A library past that needs a server-side
   query *and* a different interaction (debounce, pending state) — a real change, not a tuning knob.
11. **No category-filter chips.** `ux-architecture.md` §1.4 draws `[All][Food]`; one text field that
   also searches category and city covers most of that need, and chips are an L2 call.

## 4. Decisions and constraints a new session must not rediscover

- **`rawName` decides identity; `identifiedName` decides display.** The model re-identifies the
  same caption differently between runs ("Kiaans" → "Kiaans Tooting" → …). Anything keyed on the
  inference mints duplicate rows. See `domain/import/llm-guess-place-id.ts`.
- **`modelConfidence` is never rendered** — not as a number, a bar, or a derived band. It reports
  95% on coordinates that are hundreds of metres out.
- **The browser may never send a place fact.** It sends `extractionId` + `candidateIndex` + its own
  note. Everything else is derived server-side. This is the shape of the security fix; do not widen
  the confirm contract.
- **vaul 1.1.2 does not forward `modal={false}` to Radix.** `useNonModalBackground` exists for that;
  a vaul upgrade may make it unnecessary — the Playwright spec will say.
- **Map identity is `saved_places.id`** (`Spot.id` → `MapPlace.id`), not `places.id`. Both are
  uuids, so mixing them fails silently.
- 500 Gemini 3.5 Flash calls/day. Prefer cached extractions and the four TikToks above when testing.
- **`normalise()` is the only answer to "are these the same text?"** The resolver uses it, and so
  does search (`domain/places/search.ts`). A second, quietly different normalisation is how `café`
  stops finding `Café Florentin`.
- **Searchable is exactly what a row shows** — name, category, locality, note. The model's `reason`
  and the address would both find real matches and neither is on screen, so both produce rows that
  look like bugs. Widening the search means widening the row first.
- **`focusPlaceIds` is one piece of state with two writers** (a finished import, a settled search),
  most recent wins, never cleared. The map keys the flight on the array's *identity*, so deriving
  the prop from `lastImport` meant dismissing the confirmation banner read as a brand-new request
  and threw the camera across the world.

## 5. Environment

Local Supabase container (`npx supabase status`) with all 17 migrations applied; `.env.local`
points at `127.0.0.1:54321`; `LLM_PROVIDER=gemini`. A `next dev` server is usually already running
on port 3000 — reuse it rather than starting a second. Sign in at `/sign-in` as
`demo@example.com` / `local-dev-preview-1234` (local only).

Local database at the time of writing: 20 `places`, 20 `saved_places`, 4 `extractions`, 22
`imports`, 10 `sources`. One `places` row has a NULL `country_code` (issue 3.2). Keep those four
`extractions` — they are the cache that stands between this project and its 500/day model ceiling,
and `npm run db:reset` throws them away.

**Migration state, 2026-08-26:** local `0018`, **staging `0018`** (pushed and proven — §3a),
production still `0009`. Production's push is deferred pending `PROD_DATABASE_URL`; and note that
migrating production will not by itself bring it back, because the Vercel env store is empty (§3.0).

**`npm run verify` now runs the schema inventory** (`check:schema`) against whatever local database
is up, and **skips with a printed notice** when there is none — a skip is a gap, not a pass. It was
added because `migrations · RLS policy tests` sat red on PR #23 for several commits while every
local check was green.

It narrows the gap; it does not close it. `verify` still covers **one of CI's four jobs** —
`next build`, `playwright` and the from-scratch migration rebuild happen only in CI. So: never
report a branch finished, and never merge, on a local run. `gh pr checks <pr>` is the authority.

## 6b. The workflow review of 2026-08-26

Prompted by the owner's ruling on merges, and by the red-CI incident the same day. What changed:

- **`npm run verify` gained `check:schema`** — the read-only inventory, the specific check that was
  missing when a red build was reported as green. Skips loudly without a database.
- **`scripts/merge-pr.sh` / `npm run merge:pr`** — the six-condition gate that replaces owner
  approval, because GitHub cannot enforce any of it on this plan.
- **`git-workflow.md` §9 rewritten** into §9.1 (procedure), §9.2 (CI is the gate, local verify is a
  filter), §9.3 (what still needs a specific instruction), §9.4 (reporting); **§11 added** — a merge
  is not the end of the task, `main` and the deployment get verified after it.
- **Two stale things found by reading rather than being told:** §10 still described session
  discipline as "one ledger task per session … routed through the specialist agents", superseded by
  `working-agreement.md` in August; and `ms3-branch-protection.md` concluded with a convention that
  silently depended on a human approving every merge.
- `CLAUDE.md` and `working-agreement.md` §7 carry the same rule in their own voice.

**Kept deliberately, not revisited:** the branch naming and prefix scheme, the decompose-first rule,
atomic commits, Conventional Commits, the never-squash sync rule (§1, from the August incident), the
working-tree safety rule, and the `.githooks/pre-push` protection of `main`. All still correct; the
review was not an excuse to redesign them.

**Known residual risk, stated plainly:** `merge-pr.sh` is a client-side speed bump, not a gate. It
is bypassable by typing `gh pr merge`, and invisible to anyone inspecting GitHub settings. The real
fix is to make the repo public or upgrade the account, apply the ruleset in
`ms3-branch-protection.md`, and delete both the hook and this script's reason for existing.

## 6. The next highest-impact step

**First, and it is not a feature: restore the Vercel environment variables** (§3.0,
`docs/vercel-env-restore.md`). It is the owner's five-minute job and it is worth more than any
amount of product work, because until it is done every deployed surface that needs a signed-in user
is a 500 and no shipped change can be seen by anyone. Production's migration push follows it, once
`PROD_DATABASE_URL` is set.

**Then the product work.** `L1-F7-T2` is **done** (#29): delete and note-editing are in the UI at
both breakpoints, and `L1-F7-T3`'s ownership assertions are in `0008_policy_tests.sql`. What is left
of F7 is **`L1-F7-T1` — manual add**: POI search over the resolver, select, save. It is the other
half of the same feature and it is also `L1-F4`'s recovery path, because at LEVEL B's ~27% hit rate
"no places found" is the *modal* import outcome and manual add is the only thing a user can do next.

It is not a free run, and the next session should know why before starting: **T1 wants "a place in
an un-ingested city can be found and saved by name", which is the `PlaceResolver` that does not
exist yet** (`L0-F2b`/D2b — the Overture index where a region is loaded, Nominatim everywhere else).
So F7-T1 either waits behind the resolver or ships against one source and is honest about the
boundary. That is a scope call for the owner, not something to decide silently.

The cheaper things that are now unblocked and genuinely worth doing:

- **A real deploy health check** (§3.0's closing note). `/healthz` returns `ok:true` with no
  environment variables set at all, because it deliberately reads no configuration. Production has
  been down since PR #20 and nothing noticed. A check that fetched `/map` and asserted `307` would
  have caught it the day it happened.
- **Scoping the policy suite's counts to its own fixtures.** `npm run db:test` currently cannot run
  against any database with data in it — it fails on the `extractions` setup guard with a message
  that says the fixture was not created when it was. That makes the suite unrunnable locally without
  a reset, and a reset discards cached `extractions` that cost real model calls.
- **Un-masking API errors** (§3.5). This one cost real time twice today.

**Not chosen, and why.** Coordinate accuracy (issue 3.1) is still the biggest single quality problem
and is still blocked on an owner decision about Google spend. The fifth camera mover (issue 3.8) is a
loose end but `L1-F5-T2` owns it and nothing is broken meanwhile. Error masking (issue 3.4) is real
but costs the user nothing today.
