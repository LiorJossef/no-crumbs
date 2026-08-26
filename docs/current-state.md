# Current state — cold-start document

> Updated **2026-08-26**. Read this after `CLAUDE.md` and `working-agreement.md`, before anything
> else. It is the running state, not a diary: when something here stops being true, change it.

## 1. Where the work is

Branch **`feat/saved-places-search`**, branched off `fix/import-server-owned-confirm` (which is now
pushed and open as **PR #23**). Working tree clean, all checks green (`npm run verify` — 371 unit
tests, lint, typecheck, layer guard, migration guard). Both branches need the owner's explicit
approval to merge (`git-workflow.md` §9); push and PR are automatic, merging is not.

**`feat/saved-places-search` — `L1-F6-T2`, three commits.** The search field on `/map` had been
decorative since the day it was built: a bare `<Input>` with no state behind it. It now filters, and
it filters the **pins** as well as the list.

| Commit | What |
|---|---|
| `feat(search)` | The matching rule — `domain/places/search.ts`, plus 23 tests |
| `feat(search)` | The wiring: `query` lifted to `map-page-client.tsx`, both surfaces, the empty states |
| `feat(search)` | The camera flies to the results once the typing settles |

**PR #23 (`fix/import-server-owned-confirm`) — the import loop made real.** In order:

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
4. **Every API error is masked as `INTERNAL, retryable: true`,** including a 400 for a malformed
   body. Honest about not leaking internals, dishonest about retryability, and hard to diagnose.
5. **The demo library has four duplicate places** ("Kiaans"/"Kiaans Tooting", two "Tokii", two
   "Sycamore …", two "HaKosem") created by my own testing before the identity fix landed. Harmless
   as messy existing state; say the word and they go.
6. Two `imports` rows are stuck at `status='processing'` from before the probe route wrote terminal
   states. Historical only — the current code cannot produce them.
7. `docs/ux-import-review-screen.md` §8 (motion) is specified but not implemented. Deliberate:
   ornament before correctness. (The debounced live-region announcement it also lists now exists on
   `/map`'s search — `useResultAnnouncement` in `map-page-client.tsx` — but not on the review
   screen.)
8. **Search added a fifth camera mover, and `06` §9.2 lists four.** A settled search flies to its
   results; clearing frames the whole library. It is there because searching `tel aviv` from a
   London view otherwise showed eight places in the list and zero pins on the map. `L1-F5-T2` has to
   adopt it or replace it — this is a real loose end, recorded in `execution-plan.md`, not a
   finished decision.
9. **Search is client-side, over the places `/map` already loaded.** That is what makes the list and
   the pins narrow in the same frame with no request and no flicker, and it is right for the
   hundreds of places this product realistically reaches. A library past that needs a server-side
   query *and* a different interaction (debounce, pending state) — a real change, not a tuning knob.
10. **No category-filter chips.** `ux-architecture.md` §1.4 draws `[All][Food]`; one text field that
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
`imports`, 10 `sources`. One `places` row has a NULL `country_code` (issue 3.2).

Nothing has been applied to staging or production on this branch. **No migrations were added** —
`0017` was already on the branch when this session started.

## 6. The next highest-impact step

**Delete, and editing your own note — `L1-F7-T2`.**

The app can create and read. It cannot update or delete **anything**: `src/app/actions/` holds one
file (`sign-out.ts`) and `src/app/api/` holds only `imports`. A place you save is a place you are
stuck with. That is the gap now, for three reasons at once:

1. It is the honest end of the loop. Import is good enough that the library fills up; search now
   makes a full library navigable; neither helps if a wrong place — and the model's coordinates are
   65–470 m out — can never be removed.
2. The demo library has **four duplicates** (issue 3.5) sitting there because there is no way to
   remove them. That is not a data problem to be fixed with `psql`; it is a missing feature the user
   can see.
3. It is mandatory graded evidence. `L1-F9-T1`'s test specification needs create / read / update /
   delete each demonstrable in the UI, and `execution-plan.md`'s critical path says F7 is early, not
   late — `L1-F4`'s recovery from the modal "no places found" outcome **is** manual add, F7's other
   half.

Start with delete, because it is the one the current library actively needs, and it is where the
ownership question lives: `L1-F7-T3` wants a cross-user write to fail **at the database**, not in
the UI, so write the RLS test alongside rather than after. `saved_places` is the row to remove;
`places` is shared and must not be touched by a user deleting their own save. Then the note, which
is the only user-writable field on a saved place (`0015` — `extracted_reason` is system-derived and
must stay that way).

**Not chosen, and why.** Coordinate accuracy (issue 3.1) is still the biggest single quality problem
and is still blocked on an owner decision about Google spend. The fifth camera mover (issue 3.8) is a
loose end but `L1-F5-T2` owns it and nothing is broken meanwhile. Error masking (issue 3.4) is real
but costs the user nothing today.
