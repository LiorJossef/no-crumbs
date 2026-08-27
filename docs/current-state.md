# Current state — cold-start document

> Updated **2026-08-27**. Read this after `CLAUDE.md` and `working-agreement.md`, before anything
> else. It is the running state, not a diary: when something here stops being true, change it.
>
> This session rewrote the file rather than appending to it. Everything still true was kept;
> narrative that had stopped earning its place was dropped. The previous version is in git history.

---

## 1. What the product does today

The core loop runs end to end, against real TikToks, on real data:

**paste a TikTok link → oEmbed → caption → LLM extraction → review and confirm → saved place on a
map**, with a saved-places list, text search, place detail, delete, and note editing.

As of this session the extraction also captures **what a place actually is** — free-form tags, named
dishes, and a one-line reason — and the map surfaces them. See §3.2.

**What it still is not.** There is no `PlaceResolver`: every coordinate is the model's own guess.
The streaming route (`L0-F6`) does not exist and `/api/imports/probe` is still the request/response
stand-in. Manual add (`L1-F7-T1`, surface S8) does not exist, so three failure screens and the
no-places screen have a recovery they cannot offer.

**The MVP boundary** — three decisions, not a feature list: one link in one field; **TikTok only**,
so an Instagram or YouTube link is a recognised redirect, never a failure; and "info" fixed at
name · category · coordinates · source link · user note, plus (new) tags · why-go · dishes.

---

## 2. Where the work is

`main` carries everything below. Two PRs this session, both through `npm run merge:pr` with all six
checks green:

| PR | What | State |
|---|---|---|
| [#34](https://github.com/LiorJossef/P-002/pull/34) | Honest import failures — real codes, real statuses, a real audit row | **merged**, `main` verified |
| [#35](https://github.com/LiorJossef/P-002/pull/35) | Rich extraction and the surfaces that show it — see §3.2 | **open, not merged** |

### 2.1 Exactly where PR #35 was left, 2026-08-27

**The first thing to do in a fresh session**, before any new work.

- Branch `feat/rich-place-extraction`, head **`84b7e97`**, pushed, **9 commits** ahead of `main`.
- Working tree **clean**. `npm run verify` green locally: **592 tests, 41 files**, plus lint,
  typecheck, layer guard, migration grants, schema inventory and the agent consistency check.
- PR #35 is `OPEN`, `mergeable=MERGEABLE`, and the branch contains current `main`.
- **CI was still running when the session ended and was deliberately not waited out.** At that
  moment: `Vercel` pass, `Vercel Preview Comments` pass; `lint · typecheck · layer guard · unit`,
  `migrations · RLS policy tests`, `next build` and `playwright` all **pending**. The final commit
  (`84b7e97`, the manual harness) restarted the run, so any earlier green result belongs to an
  older head and **must not be treated as this commit's**.

**So: `gh pr checks 35` first.** If all six are green, merge with `npm run merge:pr -- 35`, then
verify `main` and the deployment (`git-workflow.md` §11). If anything is red, fix it before
anything else — nothing in §9 should start on top of a red branch. The merge gate refuses a
pending or failing check, so it will not let a half-finished run through, but read the checks
yourself rather than trusting the script to be the only reader.

Nothing else was left mid-flight: no agents running, no uncommitted work, no local database
changes pending.

**The merge rule.** Routine merges need no approval, but **GitHub branch protection is unavailable
on this plan**, so CI is not a gate and a red PR can be merged with one command.
`scripts/merge-pr.sh` *is* the gate — merge only through it. **CI is the authority, not
`npm run verify`**: verify covers one of CI's four jobs, so read `gh pr checks` before claiming
anything is green. `git-workflow.md` §9.3 lists what still needs a specific instruction each time.

---

## 3. What landed this session, and how it was verified

### 3.1 Honest import failures (PR #34)

Every `/api/imports/probe` failure used to answer **HTTP 502** whatever happened; a malformed body
was reported as `INTERNAL, retryable: true`; the real cause was built into a message that `toView()`
correctly strips and **nothing ever logged**; and the `imports` row was never stamped —
`imports_failed_implies_code` had required `status='failed'` + `error_code` since `0003` with **no
writer across all 22 imports**. On screen, one apologetic template served all fourteen codes.

Now each code carries its own status (a 500 is reachable **only** through `INTERNAL`, which is what
makes `07` §7.1's "page a human" mean anything), one structured redacted log line, a real audit row,
and a per-code copy map with recoveries that work.

**Two defects found while integrating, both bigger than the ticket:**

- **`RedirectScreen` was unreachable dead code.** `canSubmit` was gated on `validation.ok` and
  `submit()` was its only caller, so an Instagram link, a TikTok profile link and a photo post *all*
  rendered `MALFORMED_URL`'s inline "That doesn't look like a TikTok link." That contradicted the
  MVP boundary in `CLAUDE.md`. Fixed; the three now render as distinct, honest news with **zero**
  requests to the server.
- **A real M6/R9 coordinate leak into logs.** V8's `JSON.parse` `SyntaxError` **echoes its input** —
  short inputs whole, and a mid-payload window on a trailing comma, the most common LLM JSON defect.
  `JSON.parse('(32.0578, 34.7702)')` reports the pair verbatim. Live from
  `gemini.place-extractor.ts:184`. Closed by redacting between the first and last quote while
  keeping the parser's complaint, so failures stay diagnosable.

**A regression this branch introduced and then fixed:** `Cancel` cleared the URL without aborting
the fetch, so the doomed request returned and left `Retry` a **dead primary button**. There is now a
real `AbortController`, a race gate on every `setScreen`, and an in-flight guard (five scripted
clicks previously fired five model calls). A caller abort writes **no** `error_code` — three
measured aborts had each written `UPSTREAM_TIMEOUT`, filing a user's Cancel as a TikTok outage.

**Verified against the live database and a real browser:** a nonexistent video id returns 422
`POST_UNAVAILABLE` and lands `failed`/`source`/`POST_UNAVAILABLE` — the first `failed` row this
database has ever held; 18 hostile paste inputs reached the server **zero** times; 17 wire cases
carry the honest status.

### 3.2 Rich place extraction

**The measurement that motivated it**, taken on the live database before any code was written:

| | |
|---|---|
| saved places with no `extracted_reason` at all | **7 of 20** |
| reasons that were the place's own name echoed back | 2 of 20 |
| the rest | verbatim caption substrings, emoji included |
| distinct `category` values across the library | **4** (14 of 20 = `restaurant`) |

The captions already said "seasonal Italian", "Nepalese kitchen", "pan-Asian inside Tooting Market".
The extractor was paying for that intelligence and throwing it away.

**Schema v2** — same oEmbed, same single model call — adds `tags` (open vocabulary, ≤5), `whyGo`
(`{text, groundedIn}`), `dishes` (≤5, verbatim) and `areaHint`. Measured v1 → v2 on four real
cached captions:

| | v1 | v2 |
|---|---|---|
| candidates with usable tags | 0/9 | **9/9** |
| candidates with a real `whyGo` | 0/9 | **8/9** (ninth correctly null) |
| `whyGo` that is a verbatim caption slice | n/a | **0/8**, checked mechanically |
| location words welded into the venue name | 3/8 | **0/8** across three runs |

No candidate regression; the two zero-place captions still return zero.

**Storage: `saved_places`, not `places`** — the decisive reason is privacy. `places` is not
world-readable, but `places_select_if_saved` lets *any user who saved the same venue* read it, so
tags there would ship one user's caption-derived model output into another's browser. It is also the
reversible direction. All three columns are **SELECT-only for `authenticated`**; the writer's
EXECUTE is `service_role` only. Verified by attack from a real signed-in session — nine forged-write
shapes including the §5.5 POST shape, `on_conflict` upserts, `PUT` and the writer RPC: all `42501`.

**Verified by using the product**, independently of the agents that built it, at 390×844 and
1440×900: tags render title-cased from the normalised stored form; Hebrew tags render RTL beside
Latin ones with `dir="auto"`; the accessible name carries them ("Open Anat Bakery, tagged בורקס,
מאפייה, Hidden Gem"); a 5-tag row wraps in detail and shows 3 + "+2" in the list; a place with no
tags goes straight from category to the note with no gap or placeholder; and a `why_go` that the
gate rejects is genuinely absent from the DOM, not merely hidden.

---

## 4. The finding to carry forward: Hebrew ↔ English place identity

**This is a live defect, not a future concern.**

`places.name` stores whichever script the model happened to choose and there is **no alias anywhere**.
Two users saving the same Tel Aviv venue — one from a Hebrew caption, one from an English one — get
**two `places` rows that nothing will ever merge**. Charter invariant 4 (one physical place, many
people, many TikToks) is quietly broken today, and it worsens as Tel Aviv and Tokyo content lands.

**Verified, so nobody goes looking for a normalisation fix that cannot exist:**

```
normalise('הקוסם')            = 'הקוסם'             normalise('HaKosem') = 'hakosem'  → not equal
normalise('Café Levinsky 41') = 'cafe levinsky 41'  == normalise('Cafe Levinsky 41')  → equal
```

`normalise()` folds accents correctly and deliberately preserves Hebrew and Japanese (a documented
porting-trap comment explains why it must not strip them). It cannot bridge scripts. Carrying the
other name form is the only route. Related: `place_name_key` does not fold accents either, so
`Café Florentin` and `Cafe Florentin` are already two dedup keys today.

**Owner ruling, 2026-08-27: Hebrew ↔ English is the supported scope.** Other scripts stay
best-effort or unsupported. This must not become a generic internationalisation or entity-resolution
project — no language-tagged alias tables, no locale negotiation, no ICU dependency, no per-script
branching. The hard part is not script handling: Hebrew omits most vowels, so `HaKosem` / `Hakosem` /
`Ha Kosem` are one venue and the model is not consistent between runs. Stay conservative — **merging
two distinct venues is worse than failing to merge one**.

**The design is written up and ready to implement:**
`docs/evidence/places/place-alias-design.md`. It rules aliases onto `places` (the opposite answer
from tags, deliberately), withdraws its own first idea of a `place_names` table in favour of
`alt_names text[]` + a generated `match_keys text[]` + GIN, and rules that the dedup guard should
consult aliases **only on exact key equality — never a similarity threshold**. It names the two
traps in changing `resolve_place` and what to verify first, including a deliberately-constructed
false-positive case. `place-alias-extraction-notes.md` is the extraction half, and is honest that
**no model call was ever made with an alias field in the schema** — there is zero evidence yet about
how the model behaves.

---

## 5. Unresolved, in impact order

1. **Production is down, and it is the owner's to fix.** `/map` and `/import` both return **500**;
   `/`, `/sign-in` and `/healthz` are fine and `/healthz` reports `main`'s head commit, so Vercel is
   deploying the right code. **The Vercel project has no environment variables in any environment**
   (`npx vercel env ls production --project p-002` → none; independently confirmed by grepping the
   deployed bundle for a Supabase URL that is not there), so `createServerClient(undefined,
   undefined)` throws before any query runs. Restoring them means entering credentials into a third
   party — the owner's job; `docs/vercel-env-restore.md` is the checklist, and
   `.env.vercel.preview` on disk is **not** a usable recovery source. Production is also still on
   migration `0009` while the code selects `0015`/`0016` columns, so the env restore alone moves the
   failure rather than removing it; the migration push follows, once `PROD_DATABASE_URL` is set.
2. **Coordinates are the model's guess**, and the failure mode is worse and more specific than
   previously recorded — see §6.
3. **Model-assigned tags have no delete path.** ~5 model-chosen labels per save, system-derived, now
   **visible on screen**, none removable. Not an exposure (the row is the user's own) but it *is*
   inferred personal data with no rectification or erasure route — `why_go` especially, being a
   sentence in the model's voice about why *you* saved somewhere. Cheapest fix: a
   `clear_saved_place_extraction(saved_place_id, user_id)` `service_role` function setting all three
   to NULL — no grant change, and NULL is already the normal renderable state. Pairs with the
   `user_tags` column `0019`'s header reserves.
4. **Tags can carry world knowledge the caption does not support.** A food-free caption produced
   `falafel` and `middle eastern`. Tags cannot be substring-gated without killing the useful ones
   (`hotel restaurant` is a legitimate *reading* of "inside Middle Eighty Hotel"). Prompt tightening
   closed it at **n=1, with no gate behind it**. The most likely place for v2 to embarrass the
   product.
5. **`extracted_reason` is still forgeable.** An authenticated client can POST straight to
   `/saved_places` with any value and it lands verbatim; RLS confines it to the caller's own row and
   UPDATE is refused, so a user can lie to themselves and to nobody else. **Severity is unchanged by
   this session** — a review argued it had escalated, then withdrew that argument itself, because it
   was entirely contingent on a `groundedIn` mapping that was reversed (§7). The fix is now *cheaper*
   than `0019`'s header suggests: move `extracted_reason` out of `save_place`'s INSERT and write it
   from the `service_role` enrichment writer that now exists, then revoke the grant. No
   `SECURITY DEFINER` needed. Do it **before any share, export or public-list surface exists**.
6. **`areaHint` has nowhere to live after a save.** It is on the type and in `extractions.candidates`
   but `0019` added no column. `venueQueryString()` and the Maps link handle it at confirm time, but
   anything rebuilding a query *from a saved row* has less than it did. Deliberately not smuggled
   into `places.address_line`.
7. **`/api/imports/probe` has no rate limit.** `rateLimitedLocal` has **zero production call sites**
   (verified by grep), so the honest-status work advertises a 429 the route can never send — against
   a hard 500 Gemini calls/day. `L0-F6-T1` owns the real limiter. The client-side in-flight guard
   added this session stops accidental double-fires, not a determined loop.
8. **Pre-existing NULL `country_code` rows defeat dedup** — same class as the alias problem.
   Importing Ha Kosem from a second TikTok created a *second* `places` row because `resolve_place`'s
   guard compares `country_code is not distinct from`. New rows are fine. A backfill is a data
   decision — ask.
9. **The demo library has duplicate places** from earlier testing, removable from the UI. Left
   deliberately: the most realistic messy-state fixture the library has.
10. **Low severity, recorded not fixed.** A crafted caption can mint a **blank permanent chip**
    (`U+3164` HANGUL FILLER and friends are zero-width in a browser but pass the database's
    `[[:alnum:]]` guard) — layout survives it, verified. `/api/imports/probe` has no request-body
    bound. Four normaliser functions are now PostgREST-exposed RPCs with unbounded CPU (200k
    elements ≈ 4.5 s). `docs/ux-import-review-screen.md` §8 (motion) remains unimplemented.
11. **`npm run db:test` cannot run against a database with data in it.** Its `extractions` setup
    guard counts the whole table without RLS, so the policy suite is unrunnable locally without a
    reset — and a reset destroys cached `extractions` that cost real model calls. CI is currently the
    only place the whole file runs.
12. **`playwright.config.ts` defaults `baseURL` to `127.0.0.1`.** Against `next dev` on this Next
    version that origin **403s every `/_next/static/**` request**, the page never hydrates, and a form
    silently falls back to a native GET — it looks exactly like a failed login, and it has now cost
    two people time. Use `PLAYWRIGHT_BASE_URL=http://localhost:3000` locally. CI builds and runs
    `next start`, so CI is unaffected; retargeting the default is a CI-affecting change.

---

## 6. Coordinate accuracy — parked, with the evidence preserved

The owner **parked the `PlaceResolver` direction rather than rejecting it**, and declined to make a
provider decision. Full write-up: `docs/evidence/places/resolver-future-direction.md`. **Do not
re-run these measurements** — they cost real API calls and real time.

**The repo's "65–470 m" figure is not what was measured.** The real shape:

- On **single-location** venues the model is 35–200 m out.
- On **multi-branch** venues it emits a point that is **no branch at all** — 516 m and 1140 m from
  the nearest real one, at `modelConfidence` 0.90–0.99. Invisible to the user and not fixable by
  prompting; it is what averaging over recall produces.
- A gazetteer hit is **~10 m** against the model's ~150 m — one to two orders of magnitude, when it
  hits.

Findings that would otherwise be rediscovered: Nominatim's `importance` is **unusable** as a
confidence analogue (a country-level constant — `L0-F3-T3`'s exit criterion assumes otherwise and
would send someone down a dead end); **Tel Aviv is a data hole**, three target venues verified absent
from OSM entirely, which argues *for* D2b's two-source design rather than against it; and a
shortlist-shaped provider yields **zero `preselect` bands**, so re-banding would convert "unmeasured"
into "certain" — keep `preselect` for the Overture index and instead surface a disagreement when a
single result contradicts the caption's area.

The ODbL analysis is drafted in `docs/evidence/licensing/` and is **not adopted policy** — a draft
sign-off pending a provider decision that has not been made. Two useful facts from it: the OSMF's
board-endorsed Geocoding Guideline treats individual results as *insubstantial extracts* (so `places`
is neither a Derivative Database nor a Produced Work), and storing them permanently is explicitly
allowed, so the charter's "store forever" premise holds. Nominatim's usage policy **requires**
caching, and carries a clause aimed squarely at LLM-generated integrations requiring the
*application developer* to make a deliberate, informed decision and be directly responsible. That is
an owner decision and it has not been taken.

---

## 7. Decisions a new session must not rediscover

- **`rawName` decides identity; `identifiedName` decides display.** The model re-identifies the same
  caption differently between runs. Anything keyed on the inference mints duplicate rows.
- **Branch and area qualifiers are NOT a defect.** An earlier finding said the model inflating
  `La Nonna` → `La Nonna Brixton` broke geocoding; a larger run (n=20) **retracted it** — querying
  with the plain name was *worse* (4/9 vs 6/9), and a short area qualifier disambiguates while
  breaking nothing. What *is* a defect is location words in the **name field** when `areaHint` exists
  for them. Keep the information; fix the field.
- **`whyGo.groundedIn` is not persisted, deliberately.** Mapping it onto `extracted_reason` was
  proposed and **reversed**: that column is browser-forgeable, so a verbatim quote there could be
  forged and attributed to a named creator beside a real source link — and it would invert which
  column is protected, locking the model's soft synthesis behind `service_role` while leaving the
  evidence writable. Its value is as an extraction-time gate, which it already delivers.
- **`modelConfidence` is never rendered** — not as a number, a bar, or a band. It reports 95% on
  coordinates hundreds of metres out.
- **The browser may never send a place fact.** It sends `extractionId` + `candidateIndex` + its own
  note; everything else is derived server-side. Do not widen the confirm contract.
- **The enrichment writer's two arguments are the control, not its WHERE clause.** It bypasses RLS:
  `p_user_id` comes from the server-side session, `p_saved_place_id` from `save_place`'s own return
  value in the same request — never from a request body or a client-supplied id.
- **`normalise()` is the only answer to "are these the same text?"** — resolver, search and tags.
  Tags additionally append an **NFKC** pass: `normalise()` is NFK**D**-based while the database is
  NFK**C**, differing for **11,209 code points** (every Hangul syllable), so the app would hold six
  characters where the column holds two. The pass is appended in `tags.ts` rather than folded into
  `normalise()`, because changing that function moves `poi_index.name_norm` and forces a
  `NORM_VERSION` bump and a full reload.
- **Tags are stored normalised and title-cased at render.** The database's `normalize_tag()`
  lowercases but does **not** fold accents or punctuation, so storing a display label would make
  `Pan-Asian`/`pan asian` and `café`/`cafe` two chips each.
- **App-side bounds must measure the NFKC form**, because the database does and NFKC *expands* — a
  59-character dish normalises to 67 against a 64 bound and is refused.
- **Map identity is `saved_places.id`**, not `places.id`. Both are uuids, so mixing them fails
  silently.
- **`focusPlaceIds` is one piece of state with two writers**, keyed on array identity.
- **500 Gemini calls/day, and the ceiling is per *call*, not per token.** The extraction cache is the
  only lever that matters. Dollar figures anywhere in this repo are Anthropic-priced **projections**
  for the production adapter — the running provider is Gemini, whose price is `undefined` in code and
  logs `costModel: 'unmeasured'`. `09` §2.2's `$0.0032` estimate is stale on the same basis.
- **Six camera movers exist and `06` §9.2 lists four.** `L1-F5-T2` must adopt or replace the other
  two (a settled search; selecting a place from the list).

---

## 8. Environment

Local Supabase (`npx supabase status`) at migration **`0019`**; `.env.local` points at
`127.0.0.1:54321`; `LLM_PROVIDER=gemini`. A `next dev` server is usually already running on port
3000 — **reuse it**, and reach it on `localhost`, not `127.0.0.1` (§5.12). Sign in at `/sign-in` as
`demo@example.com` / `local-dev-preview-1234` (local only).

**Migration state:** local `0019`, **staging `0018`**, production `0009`. Staging was pushed and
proven on 2026-08-26 (15/15 inventory, 22 behavioural assertions, a signed-in run at both
breakpoints); the orphan-object recovery that preceded it is in `docs/evidence/db/orphans/`.
**`0019` exists only locally.** Note `0018`'s ledger row was missing locally and was re-applied
idempotently this session.

**Local database right now:** `places=20`, `saved_places=20` (**10 carrying enrichment**),
`extractions=6`, `sources=17`, `imports=42` (7 `failed`). Keep those `extractions` — they are the
cache standing between this project and its 500/day ceiling, and `npm run db:reset` throws them away.

**The 10 enriched rows are a mix, and the difference matters.** Five are **genuine v2 model output**
from a real import: Jones Family Kitchen, La Nonna Brixton, MBER London, The Life Goddess, Tokii.
Five are **hand-written fixtures** seeded to exercise the UI: Kiaans Tooting (5 tags, the maximum),
The Laughing Yak, Sycamore Vino Cucina, Anat Bakery (Hebrew tags and dishes), Container (tags with a
NULL `why_go`). Do not read the fixtures as evidence of model quality. The writer is
first-writer-wins per column, so the fixtures were not overwritten by the later import.

---

## 9. The next highest-impact step

**Owner steer, 2026-08-27:** bias toward **visible product progress and completed MVP journeys** —
capability, useful intelligence, reduced user effort. Fix reliability when it materially blocks the
core experience, but hardening must not become the default workstream.

**First, and not a feature: restore the Vercel environment variables** (§5.1). No amount of product
work substitutes for it — until it is done, nothing anyone builds can be seen by anyone.

**Then, in recommended order:**

1. **Make `whyGo` worth showing, or cut it.** The sharpest finding from shipping it. The render gate
   hides any sentence adding nothing over the tags, the quote and the name — and on genuine model
   output it hides **six of six**. "Experience beautiful Greek dishes." next to a `Greek` tag is
   filler; "Go on a weeknight — the counter is six seats" is not. Every sentence that passes carries a
   **specific**: a time, a price, what to order, why now. So the prompt should target specifics and
   return null otherwise. The measurement method is already in the constant's doc comment. Cheap,
   pure product value, and the field currently costs a model call for output the user rarely sees.
2. **A tag / `why_go` clear path** (§5.3) — small, and it closes the only place the product tells a
   user something about themselves that they cannot unsay.
3. **Tag filtering** — the "organized" half this branch deliberately left out. The chips are built
   and inert, the query shapes are recorded in `0019`'s header, and `TagChipList`/`TagChipRow` are
   the only components needing interactivity.
4. **`L1-F7-T1` — manual add.** The recovery for the **modal** import outcome and the missing
   destination for three failure screens; `NoPlacesScreen`'s `Add manually →` currently calls
   `reset()`. Its exit criterion names an un-ingested city, which is the parked resolver — so it
   ships against what exists with the boundary stated, rather than being deferred again.
5. **Hebrew ↔ English aliases** (§4) — designed, scoped, ready to implement.

**Cheaper things worth doing when a session has room:** a real deploy health check (`/healthz`
returns `ok:true` with no environment variables set at all, which is why production has been down
since PR #20 with nothing noticing); scoping the policy suite's counts to its own fixtures (§5.11);
and `Spot` owning the three enrichment fields, which deletes the one documented cast in
`src/ui/place/enrichment.ts`.

**Not chosen, deliberately:** coordinate accuracy (§6) is still the biggest single quality problem,
parked by owner decision with its evidence preserved so it can resume cold.
