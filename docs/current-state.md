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

## 2b. Honest import failures — `fix/honest-import-errors`, 2026-08-27

The fix for §3.5, and it turned out to be two defects, not one. Verified by running the product and
reading rows, not by reasoning about the code.

**What was wrong.** Every `/api/imports/probe` failure answered **HTTP 502** whatever happened, a
malformed body was reported as `INTERNAL, retryable: true` (our bug, and a promise that an identical
retry might work), the real cause was built into a `DomainError` message that `toView()` correctly
strips and **nothing ever logged**, and the `imports` row was never stamped — `status='failed'` +
`error_code` had been required by `imports_failed_implies_code` since `0003` with **no writer, across
all 22 imports**. On screen, one apologetic template served all fourteen codes.

**The second defect, found while integrating.** `RedirectScreen` was **unreachable dead code**:
`canSubmit` was gated on `validation.ok`, and `submit()` — the only caller — could only be reached
through that button. So an Instagram link, a TikTok profile link and a photo post all rendered
`MALFORMED_URL`'s inline "That doesn't look like a TikTok link.", which is false for all three. That
contradicted the MVP boundary in `CLAUDE.md`: *an Instagram or YouTube link is a recognised redirect
to manual add, never a failure.* Confirmed against `main` before changing anything.

**Proven by use, signed in, at 390×844 and 1440×900:**

| Check | Result |
|---|---|
| nonexistent video id | **422** `POST_UNAVAILABLE` (was 502), screen reads C60/C61/C62 |
| the `imports` row for it | `status='failed'`, `stage='source'`, `error_code='POST_UNAVAILABLE'` — the **first `failed` row this database has ever held**, against the live constraints |
| the server log line | `07` §7.1's shape verbatim, one parseable record, `cause` redacted, no caption, no coordinates |
| a real Instagram reel | "That link isn't a TikTok" + `Open the original link`, and **zero** requests to the route |
| a TikTok profile URL | "That's a TikTok link, but not a post" — distinct news, which `main` collapsed |
| 18 hostile paste inputs | **zero** reached the server; `MALFORMED_URL` is the only one that still shows the inline sentence |
| 17 wire cases | every status and code honest; payload still exactly `{code, retryable}` |
| the extraction cache | still **4 rows**, `latency_ms` untouched — roughly a dozen imports, **zero** Gemini calls |
| re-paste after a failure | adopts the same row (`c_open` counts `failed` as open) and clears `error_code` to NULL |

**A real data leak was found and closed.** `describeCause` reduces a cause to something loggable.
The first version passed an `Error`'s `.message` through — and V8's `JSON.parse` `SyntaxError`
**echoes its input**: short inputs whole (`"(32.0578, 34.7702)"`), and on a trailing comma — the most
common LLM JSON defect — a ~20-char window from the middle of the payload carrying a full longitude.
Both reach that branch from `gemini.place-extractor.ts:184`. That is a straight **M6/R9 violation**
(no coordinate in any log line), not a wording problem, and the first severity call on it was wrong.
Closed by redacting everything between the first and last quote, keeping the parser's complaint so
failures stay diagnosable. `describeCause` is also now total — it cannot throw, because it runs
inside the route's own catch and a throw there turns an honest 4xx into Next's 500.

**Two things this deliberately does not do.** It never widens the payload — honesty is choosing the
right *code* and writing the detail to the *server log*. And it adds no fifteenth error code: the set
is closed and owned by `07` §9. A malformed request envelope is reported as `MALFORMED_URL`, which is
true about the user-visible effect but not literally what happened; see §3.12.

**Also fixed, from the QA pass:** `Cancel` on the rail cleared the URL without aborting the fetch, so
the doomed request came back and took the screen — leaving `Retry` as a dead primary button, and
letting a stale response overwrite a correct screen. There is a real `AbortController` now, plus an
in-flight guard (five scripted clicks previously fired five model calls). A caller abort is recorded
as `outcome: 'aborted'` and **no** `error_code`: three measured aborts had each written
`UPSTREAM_TIMEOUT`, filing a user's `Cancel` as a TikTok outage. The row stays `processing` for
`expires_at` to sweep — tidier would be to write *a* code; none of them would be true.

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
5. ~~**Every API error is masked as `INTERNAL, retryable: true`.**~~ **Fixed 2026-08-27** on
   `fix/honest-import-errors`. A malformed body is `MALFORMED_URL` (not retryable, and not our bug);
   each of the 14 codes carries its own HTTP status, so a 500 is now reachable only through
   `INTERNAL` and `07` §7.1's "page a human" means something again; the real cause is written to one
   structured server log line instead of being discarded; and the `imports` row is stamped
   `status='failed'` with its `error_code`, which `imports_failed_implies_code` (`0003`) had required
   since the schema was written with nothing ever writing it. The user-facing half is a per-code copy
   map — see §2b.
6. **The demo library has four duplicate places** ("Kiaans"/"Kiaans Tooting", two "Tokii", two
   "Sycamore …", two "HaKosem") created by my own testing before the identity fix landed. **They can
   now be removed from the UI** (`L1-F7-T2`, #29) — open one from the list and use "Remove from your
   places". Deliberately not done for you: they are your rows, and they are also the most realistic
   messy-state fixture the library has.
7. ~~Two `imports` rows are stuck at `status='processing'`.~~ **Not true any more** — measured
   2026-08-27, every one of the 22 rows is terminal. The note was stale.
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

12. **The error taxonomy has no client-protocol fault.** `07` §9's 14 codes were designed for
   *link* failures; there is no member for "your request envelope was wrong" — a body that is not
   JSON, a body with no `url` key. `fix/honest-import-errors` reports those as `MALFORMED_URL`,
   which is honest about the user-visible effect (no usable link arrived) and carries the correct
   `retryable: false`, but is not literally what happened. Today the only caller is our own UI, so
   the distinction is invisible in the product and a 15th code would be dead weight. If `L0-F6`'s
   real route ever has a second caller, **`07` §9 decides** whether a `BAD_REQUEST` member is
   warranted — not a call site.
13. **Low-severity leftovers from the 2026-08-27 adversarial pass**, none reachable by an ordinary
   user, all recorded rather than fixed (owner steer: hardening is not the default next branch).
   - `/api/imports/probe` has no request-body bound: a 5 MB `url` string returns 200 in ~111 ms
     locally. Vercel's 4.5 MB platform limit bounds it in production; `next dev` does not.
   - `redactEchoedSource` keeps the single offending character by design, and that character can be
     a bidi control — a crafted body logs a line that visually reverses in a terminal viewer.
   - **`playwright.config.ts` defaults `baseURL` to `127.0.0.1`.** Against `next dev` on this Next
     version that origin 403s on every `/_next/static/chunks/*`, the page never hydrates, and forms
     submit natively. Every e2e spec needs `PLAYWRIGHT_BASE_URL=http://localhost:3000` locally. CI
     builds and runs `next start`, so CI is unaffected — retargeting the default is a CI-affecting
     change and was not made blind.
   - `NoPlacesScreen`'s `Add manually →` calls `reset()` — it returns you to an empty paste field
     while naming a surface (S8) that does not exist. Unreachable today; **becomes reachable at
     `L0-F6`**, and is one of the dead ends `L1-F7-T1` closes.
   - Seven copy strings in `ui/import/import-error-copy.ts` are marked `NEW`: compositions in the
     existing vocabulary that `ux-architecture` §12.4 has no `C##` id for. §12 says strings not in
     the deck do not ship, so `ux-interaction` owes ids or rewrites.

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

**Owner steer, 2026-08-27: bias the next workstream toward visible product progress and a completed
MVP journey.** Reliability, security and correctness work still happens when it genuinely blocks or
compromises the core experience — but incremental hardening and out-of-scope edge cases must not be
the default next branch. The product itself should become noticeably more capable, not only the
engineering underneath it.

**Still first, and still not a feature: restore the Vercel environment variables** (§3.0,
`docs/vercel-env-restore.md`). It is the owner's five-minute job and no amount of product work
substitutes for it, because until it is done every deployed surface that needs a signed-in user is a
500 and nothing anyone builds can be seen. Production's migration push follows it, once
`PROD_DATABASE_URL` is set.

**Then: `L1-F7-T1` — manual add.** This is the chosen next branch, and the "blocked in spirit" note
that has sat on it since 2026-08-26 is hereby resolved rather than escalated again. The block was
that its exit criterion names "a place in an un-ingested city", which is the `PlaceResolver` of
`L0-F2b`/D2b — and that resolver was **paused indefinitely** on 2026-08-22 (`06` §3.4) in favour of
LLM identification plus a Google Maps link-out. Waiting for it means waiting forever, so manual add
ships against what exists, with the boundary stated on screen rather than hidden.

Why it is the highest-leverage product work available, in order:

1. **It is the recovery for the modal outcome.** At LEVEL B's ~27% hit rate, "no places found" is
   what most imports do, and `NoPlacesScreen`'s `Add manually →` currently calls `reset()` — it
   returns you to an empty paste field. The most common path through the product ends in a button
   that pretends to do something.
2. **Three failure screens now have a missing recovery.** `ux-architecture` §5.1 and §5.3 both list
   `Add a place you know`; it was deliberately omitted from all of them on
   `fix/honest-import-errors` because S8 does not exist and linking to a 404 is worse than the
   failure being reported. `ui/import/import-error-copy.ts`'s `actions` arrays are the single place
   it gets added.
3. **It closes `L1-F7`** — the course's CRUD evidence — and unblocks **`L1-F4`**, which depends on
   F7 precisely because manual add is its recovery.
4. **It reuses machinery already proven**: the extraction schema and its plausibility gate, the
   server-owned confirm pattern (the browser sends no place fact), and `save_place`.

**Not chosen, and why.** Coordinate accuracy (§3.1) is still the biggest single quality problem and
is still blocked on an owner decision about Google spend. The remaining findings from
`fix/honest-import-errors`' QA pass (§2b) are all low severity, none of them reachable by an ordinary
user, and per the steer above they go on this list rather than into the next branch. The fifth and
sixth camera movers (§3.9) stay a loose end that `L1-F5-T2` owns; nothing is broken meanwhile.

**Cheaper things now unblocked, if a session has room after the feature:**

- **A real deploy health check.** `/healthz` returns `ok:true` with no environment variables set at
  all, because it deliberately reads no configuration. Production has been down since PR #20 and
  nothing noticed. A check that fetched `/map` and asserted `307` would have caught it that day.
- **Scoping the policy suite's counts to its own fixtures.** `npm run db:test` cannot run against a
  database with data in it — the `extractions` setup guard counts the whole table without RLS, so it
  fails claiming the fixture was not created. That makes the suite unrunnable locally without a
  reset, and a reset discards cached `extractions` that cost real model calls.
- **An in-flight guard already exists on the client after `fix/honest-import-errors`; a real
  server-side rate limit still does not.** `rateLimitedLocal` has **zero production call sites**
  (verified by grep, 2026-08-27), so the honest-status work now advertises a 429 the route can never
  send. `L0-F6-T1` owns the real limiter.
