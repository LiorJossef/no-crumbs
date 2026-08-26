# Current state — cold-start document

> Updated **2026-08-26**. Read this after `CLAUDE.md` and `working-agreement.md`, before anything
> else. It is the running state, not a diary: when something here stops being true, change it.

## 1. Where the work is

Branch **`fix/import-server-owned-confirm`**, 9 commits ahead of `main`, working tree clean, all
checks green (`npm run verify` — 348 unit tests, lint, typecheck, layer guard, migration guard).
**Not yet pushed and not yet PR'd** — merging to `main` needs the owner's explicit approval
(`git-workflow.md`).

The branch started as a security fix and grew into the whole import loop being made real. In order:

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
7. `docs/ux-import-review-screen.md` §8 (motion) and the debounced live-region announcement are
   specified but not implemented. Deliberate: ornament before correctness.

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

**Make the saved library worth coming back to: search and filtering over saved places.**

The import loop now works end to end and is honest about what it does not know. The library is
still a flat, recency-ordered list — the map already holds 20 places across two countries, the
search field on `/map` exists but was reported broken for accented text, and there is no way to
filter by category or city. That is where the product stops being "a TikTok made a pin" and starts
being useful, which is `working-agreement.md` §5's stated direction and `L1-F6` on the ladder.

Start by using the existing search field against the current 20 rows and finding out what it
actually does with "Café Florentin", then decide whether it needs fixing or replacing.

The two alternatives, deliberately not chosen: coordinate accuracy (issue 3.1) is blocked on an
owner decision about Google; richer tags/cuisines (the deferred L0-F4-T3 item) is a schema change
that should wait until the library surfaces make the need concrete.
