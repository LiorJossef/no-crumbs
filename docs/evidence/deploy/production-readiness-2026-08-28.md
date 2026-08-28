# Production readiness for the 100-TikTok batch — measured, 2026-08-28

> Task `PROD-READY-1`, `devops-vercel` (Probe tier). Every number below was measured on the date
> shown or read out of a named file; nothing here is an estimate. Third-party capability claims
> carry VERIFIED / ASSUMED / UNAVAILABLE per `CLAUDE.md`.
>
> **Two of the requested measurements were not taken, on purpose.** `docs/agent-guardrails.md` §2
> rule 5 forbids this agent from running `db:inventory:staging|prod`, and rule 7 forbids
> `vercel env`. The task asked for both. The guardrail wins — §4 rule 15 is explicit that a
> specialist who thinks a guard is wrong says so and stops rather than working around it. §1.1 and
> §3.3 below name the exact commands the orchestrator must run to close those two gaps, and every
> conclusion that depends on them is labelled.

---

## 0. The one-line verdict

**Production cannot serve an import today, and it would not produce trustworthy rows if it could.**
Three independent gates are shut, in this order:

| # | Gate | State | Who can open it |
|---|---|---|---|
| 1 | Vercel env store has no Supabase values | **shut — measured today, on a 4-minute-old build** | owner |
| 2 | Hosted schema is `0018`; the app reads `0019`–`0023` | shut (orchestrator-established) | orchestrator |
| 3 | Production `poi_index` is empty, and production is gated to the Overture resolver | shut | orchestrator |

Gate 3 is the one that matters for the owner's actual goal. Opening gates 1 and 2 alone gives a
production that **accepts** all 100 imports and writes every one of them as `llm_guess` — the
model's own coordinate, which the project has already measured at 65–470 m out and moving a median
**327 m between two identical calls**. That is 100 rows of confidently-wrong data, persisted
forever, in the one database that has no point-in-time recovery.

---

## 1. Can production serve an import at all today?

### 1.1 What I could not run, and the command that closes it

`npm run db:inventory:prod` and `npm run db:inventory:staging` are named in
`docs/agent-guardrails.md` §2 rule 5 as things this agent must never run; both open a connection
with `PROD_DATABASE_URL` / `STAGING_DATABASE_URL`, which the same rule forbids. **Not run.** So the
hosted row counts in this section are derived, not observed.

**Orchestrator, to settle it in one step:**

```bash
npm run db:inventory:prod        # structural proof + the check that reads poi_index
npm run db:inventory:staging
psql "$PROD_DATABASE_URL" -c "select id, is_loaded, row_count, norm_version from public.poi_regions;
                              select count(*) from public.poi_index;
                              select count(*) from public.places;
                              select count(*) from public.saved_places;
                              select count(*) from public.place_provider_refs;
                              select count(*) from public.sources;
                              select count(*) from public.extractions;
                              select count(*) from public.imports;
                              select count(*) from public.profiles;
                              select count(*) from auth.users;"
```

### 1.2 The answer anyway: production 500s before it reaches a database

Measured 2026-08-28 against `https://p-002-zeta.vercel.app`, unauthenticated HTTP GET:

| Path | Status |
|---|---|
| `/healthz` | **200** — `{"ok":true,"stage":"production","commit":"394fd43"}` |
| `/` | 200 |
| `/sign-in` | 200 |
| `/map` | **500** |
| `/import` | **500** |

**VERIFIED from production's own runtime logs** (`vercel logs https://p-002-zeta.vercel.app --json`,
read-only, no link created), deployment `dpl_7Hb3SJPXRGs7LsesEVNceejoedCA`, `environment:
production`, `branch: main`:

```
requestPath /import  responseStatusCode 500  source serverless
  Error: Your project's URL and Key are required to create a Supabase client!
requestPath /map     responseStatusCode 500  source serverless-middleware
  Error running the exported Web Handler: Error: Your project's URL and Key are required to create
  a Supabase client!
```

Note the source on `/map`: **middleware**. The failure is upstream of the page, so nothing that
passes through middleware works for a signed-in user.

Independent confirmation, not relying on the CLI or the log: I fetched the production `/sign-in`
HTML and every one of its ten `_next/static/immutable/chunks/*.js` files and grepped them for a
`<20-letter-ref>.supabase.co` host. **Zero matches.** One chunk (`2-p_1flt_xmkt.js`) contains the
bare `.supabase.co` / `.supabase.in` strings that `supabase-js` ships, so the client library *is*
in the bundle — the project URL simply was not defined at build time. Same signature as
`docs/vercel-env-restore.md` §1, two months on.

**The deployment is four minutes old.** `vercel inspect`: target `production`, status `Ready`,
created *2026-08-28 14:18 IDT*, region `fra1`, aliased to `p-002-zeta.vercel.app`. So this is not a
stale build carrying an old (empty) env snapshot — a build made today still has no Supabase values.
**The Vercel env restore in `current-state.md` §5.1 is still outstanding.**

**One correction to an inference that looks tempting and is wrong.** `/healthz` reporting
`stage: "production"` and a real 7-char commit does **not** prove `NEXT_PUBLIC_STAGE` or
`NEXT_PUBLIC_COMMIT_SHA` are set in Vercel. `next.config.ts` maps them:

```ts
NEXT_PUBLIC_STAGE: process.env.NEXT_PUBLIC_STAGE ?? process.env.VERCEL_ENV ?? 'local',
NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
```

`VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` are Vercel system variables, present with or without an
env store. `/healthz` therefore tells us nothing about the env store at all — which is
`vercel-env-restore.md` §5's point about it being useless as a health check, restated with a second
example.

### 1.3 Does production's `poi_index` have any rows? — the critical question

**Almost certainly zero. Stated as ASSUMED, with the evidence, because §1.1 blocked the direct
count.** The evidence is strong enough to plan on and cheap enough to confirm:

1. **Nothing but an operator can put rows there.** `poi_index` is populated only by
   `scripts/ingest-poi-region.sh`, a `psql` transaction driven by `DATABASE_URL`. No migration
   inserts a `poi_index` row. `0010` seeds `poi_regions` with three rows at `is_loaded = false,
   row_count = 0`; `0020` only `UPDATE`s the `tlv` bbox.
2. **The repo says it, in a file that would abort if it were false.** `0020`'s header: *"`poi_index`
   holds ZERO rows and all three regions are `is_loaded = false, row_count = 0` — on the local
   container (verified 2026-08-27) and on both hosted projects… The POI index has never been loaded
   in any environment."* `0020` carries a `do $$ … $$` guard that raises if `tlv` is loaded, so if
   it is ever applied to a project where the index exists, it stops rather than lying.
3. **MS5 task 8 (staging/production) is recorded as not done.** `implementation-plan.md`'s
   2026-08-19 ledger entry closes task 5 with *"Deliberately not done: … staging/production (task
   8)"*. `git log --all --grep=ingest` shows one ingest commit, and its evidence file
   (`docs/evidence/places/ingest-tlv-row-counts.json`) records a **throwaway local container**, not
   a hosted project.

**So, plainly: yes, that is the case.** Production is gated to Overture (§1.4), Overture reads
`poi_index` scoped by a *loaded* region, and there are no loaded regions. Every candidate in every
one of the 100 imports would come back `no_match / reason: no_region` and be persisted as
`llm_guess` — `provider: 'llm_guess'`, `source_dataset: 'llm-guess'`, the model's own coordinate,
`resolution_score: null` (`src/domain/import/candidate-place.ts:248`).

And it is worse than a wrong pin. `docs/evidence/extraction/determinism-2026-08-28.md`: the model's
coordinate for one venue moves a **median 327 m across identical calls** (spread per group: 1007,
647, 587, 547, 526, 421, 327, 327, 323, 297, 288, 257, 198, 198, 38, 0), against
`resolve_place`'s **75 m** near-duplicate radius. `current-state.md` §5.8 already measures the
consequence on the local library: **20 saved rows are 15 real places.** Scaled to 100 imports on a
`llm_guess`-only production, expect a materially duplicated library with no route back — the free
tier has no point-in-time recovery (`db-migration-runbook.md` §4).

### 1.4 Why production is gated to Overture, confirmed

`src/integrations/places/place-resolver-factory.ts`, `resolverProviderFor`: `PLACE_RESOLVER` unset →
read `NEXT_PUBLIC_STAGE` → `NON_PRODUCTION_STAGES = {local, preview, staging, test}` → `production`
is not in it → `provider: 'overture'`. And per §1.2 the production stage resolves to `production`
from `VERCEL_ENV` **even with an empty env store**, so the gate holds by default. That is the
correct behaviour (`06` §3.1 VERIFIED: Google Places content may not be paired with a non-Google
map) and it is exactly what makes the empty `poi_index` decisive.

### 1.5 Local, for contrast — measured today, `postgresql://…@127.0.0.1:54322`

| Table | Rows |
|---|---|
| `poi_index` | **10 462** |
| `poi_regions` | 3 (`tlv` loaded, 10 462 rows, `norm_version 1`; `ldn` and `tyo` not loaded) |
| `places` | 25 |
| `saved_places` | 25 |
| `place_provider_refs` | 26 |
| `place_lookups` | **0** |
| `sources` | 26 |
| `extractions` | 17 |
| `imports` | 58 |
| `profiles` | 1 |
| `auth.users` | **1** |
| `saved_place_sources` | 25 |

Provenance of the 25 local `places`: `llm-guess` **15**, `overture` 4 (avg score 0.956),
`google-places` 1 (0.880), NULL 5. `place_provider_refs` by provider: `llm_guess` 16, `overture` 9,
`google` 1. Enrichment: 14 of 25 rows carry tags, 12 carry `why_go`.

Sizes: `poi_index` **9 192 kB** total including indexes; whole local database 38 MB.

**One local finding worth flagging.** `supabase_migrations.schema_migrations` on the local container
lists `0001`–**`0020`** (20 rows), but the local *schema* already has every `0021`/`0022`/`0023`
object — `poi_prefilter(text[], text[], text, text, integer)`, `place_lookup_get`,
`place_lookup_put`, `poi_index_address_trgm_idx`. So the local ledger has drifted from the local
schema by three files. It does not affect a hosted push (`supabase migration list --project-ref`
compares the migration *directory* against the remote ledger, not the local one), but it means a
`db:reset` is the only way local proves those three files replay from `0001`. Recorded, not fixed.

---

## 2. What breaks without `0019`–`0023`?

Two PostgREST behaviours, measured today against the local API rather than assumed:

| Situation | PostgREST answer |
|---|---|
| `select` names a column that does not exist | `{"code":"42703","message":"column saved_places.nope_missing_col does not exist"}` |
| `rpc` names a function that does not exist | `{"code":"PGRST202","message":"Could not find the function … in the schema cache"}` |

Both arrive on `supabase-js`'s `error` channel, never as a throw. What each call site does with that
is the whole answer:

| Migration | Object | Call site | Against an `0018` database |
|---|---|---|---|
| `0019` | `saved_places.tags` / `why_go` / `dishes` | `src/app/map/_lib/get-spots.ts` — `SAVED_PLACES_SELECT` lists all three, then `if (error) throw error` | **HARD FAIL. `/map` 500s for every signed-in user.** This is the "other problem" `vercel-env-restore.md` §4 predicted, and it is now three columns wider than it was |
| `0019` | `apply_saved_place_extraction(uuid,uuid,text[],text,text[])` | `src/integrations/supabase/place-store.ts` `applyEnrichment` | **Silent degrade.** `PGRST202` → `ctx.log.event('saved_place.enrichment_failed', …)` → returns `false`. The import succeeds; tags, `why_go` and dishes are silently never written. All three are lost together, by design |
| `0023` | `place_lookup_get` / `place_lookup_put` | `src/integrations/supabase/place-lookup-store.ts` | **Silent degrade, by contract.** The module's header says so: *"a read failure is a miss and a write failure is a shrug."* → `places.lookup_cache_error`. Consequence: the provider-response cache **never hits**, so on any stage that uses the Google resolver every repeat query spends a live request out of the 100/day quota. Irrelevant on production (Overture, no cache), expensive on staging/preview |
| `0021` + `0022` | `poi_prefilter(...)` | `src/integrations/supabase/place-resolver.ts` — `supabasePoiIndexGateway.prefilter`, `if (error) throw internal('poi_index prefilter failed', error)` | **Would be a hard fail — but it is unreachable.** `loadedRegions()` filters `.eq('is_loaded', true)`; on an `0018` production no region is loaded, so `regions.length === 0` short-circuits to `no_match / reason: 'no_region'` before the RPC is ever called |
| `0020` | widened `tlv` bbox | `scripts/ingest-poi-region.sh` guard 3 | **Refuses to write.** `scripts/poi-ingest.config.json` carries `tlv` at 31.95/32.40/34.70/35.00, which is `0020`'s box; at `0018` the row still holds `0010`'s 32.03/32.12/34.74/34.86. The script asserts equality *before* it writes, so an ingest into an `0018` production stops with a bbox mismatch and loads nothing |

**The trap in that table.** `0021`/`0022` look harmless today only because the index is empty. The
moment production's `poi_index` is loaded without `0021` and `0022` applied, `regions` becomes
non-empty, the prefilter RPC is called, `PGRST202` comes back, and `internal(...)` is thrown — every
import 500s. So the ordering is not a preference: **schema first, ingest second.**

No extension surprise: `0021`/`0022` both `perform extensions.strict_word_similarity('a','a')` to
force `pg_trgm`'s library to load, and `pg_trgm` is already installed at `0010`
(`poi_index_name_trgm_idx` uses `gin_trgm_ops`), which both hosted projects have.

---

## 3. Vercel state

### 3.1 What I could observe

- **CLI is authenticated** (`vercel whoami` → `liorjossef-9797`), team scope `lior19`. The repo has
  **no `.vercel/` link** and I created none.
- **One project:** `lior19/p-002`, `prj_4dB7KIifu70UVLi57wwaPmSkpRA5`.
- **Production deployment is healthy as infrastructure and broken as an application.**
  `dpl_7Hb3SJPXRGs7LsesEVNceejoedCA`, target `production`, status `● Ready`, built in 38 s, created
  2026-08-28 14:18 IDT, serving `main` @ `394fd43` — which is `main`'s head. So Vercel is deploying
  the right code; the code cannot construct a Supabase client (§1.2).
- **Preview deployments exist and are frequent** — ten in the last three hours, all `● Ready`.
- **`NEXT_PUBLIC_STAGE` on production resolves to `production`** — but from `VERCEL_ENV`, not
  necessarily from the env store (§1.2). Enough to confirm the resolver gate; not evidence about
  the env store.

### 3.2 Which Supabase project does production point at?

**None.** `NEXT_PUBLIC_SUPABASE_URL` is not inlined in the production bundle at all (§1.2), so there
is no host to compare against `SUPABASE_PROJECT_REF_PROD`. The comparison the task asks for cannot
return a mismatch; it returns *absent*. Once the env store is restored, the comparison to run is
`grep -oE '[a-z]{20}\.supabase\.co'` over the production bundle and check it equals
`SUPABASE_PROJECT_REF_PROD` (`vtboskegexinvhasghri`, `scripts/db-env.sh`) — and, separately, that
the **preview** bundle shows the *staging* ref, because a production Supabase value scoped to
Preview is how a preview deploy writes to real user data (`vercel-env-restore.md` §2).

### 3.3 What I could not observe — UNAVAILABLE to this agent

`vercel env ls` is forbidden by `docs/agent-guardrails.md` §2 rule 7. So the per-environment
presence of `GOOGLE_PLACES_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `PLACE_RESOLVER`,
`PLACE_LOOKUP_CACHE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` is **not reported here**. The one thing I can say with evidence is that
`NEXT_PUBLIC_SUPABASE_URL` was absent from the Production build made today.

Preview app health is also UNAVAILABLE: both recent preview URLs return **302** to Vercel SSO
(deployment protection), so I cannot probe `/map` or `/healthz` on a preview without authenticating.

**Orchestrator:**

```bash
npx vercel env ls production  --project p-002
npx vercel env ls preview     --project p-002
npx vercel env ls development --project p-002
```

---

## 4. The promotion question — could we import elsewhere and copy the rows into production?

### 4.1 The constraint list a copy has to respect

Measured today from `pg_constraint` and `pg_trigger` on the local database.

**Dependency order for an insert:**

```
auth.users  →  profiles  →  places  ⇄  place_provider_refs   (mutually required, see below)
                    ↓          ↓
                 sources    saved_places  ⇄  saved_place_sources   (mutually required)
                    ↓
              extractions ,  imports
```

| Constraint | Kind | What it costs a copy |
|---|---|---|
| `profiles.id → auth.users.id` | FK CASCADE | A `profiles` row cannot exist without an `auth.users` row **in that project** |
| `saved_places.user_id → profiles.id` | FK CASCADE | Every saved row is owned by a project-local user id |
| `imports.user_id → profiles.id` | FK CASCADE | Same |
| `saved_place_sources.(saved_place_id, user_id) → saved_places(id, user_id)` | composite FK | The user id is denormalised into the link table too — a remap has to touch both, consistently |
| `saved_places` UNIQUE `(user_id, place_id)` | unique | One user cannot save one place twice; a partial re-run must upsert, not insert |
| `place_provider_refs` UNIQUE `(provider, provider_place_id)` | unique | **The global identity key.** Collides across projects if the same provider place already exists in prod under a different `places.id` |
| `sources` UNIQUE `(platform, platform_source_id)` | unique | Same, for TikTok post ids |
| `extractions` UNIQUE `(source_id, model, prompt_version)` | unique | Re-running the same prompt version cannot double-insert |
| `saved_places.place_id → places.id` | FK **RESTRICT** | `places` must land first |
| `imports.source_id → sources.id` | FK RESTRICT | `sources` first |
| `saved_place_sources.source_id → sources.id` | FK RESTRICT | `sources` first |
| `places.merged_into_place_id → places.id` | FK RESTRICT | Self-referencing; merge chains must be copied whole |
| `places_alias_required` | CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED, AFTER INSERT | **Every `places` row must have a `place_provider_refs` alias by COMMIT.** So `places` and `place_provider_refs` must be inserted **in one transaction** |
| `saved_places_provenance_required` | CONSTRAINT TRIGGER, DEFERRABLE, AFTER INSERT OR UPDATE OF `origin` | An `origin='import'` saved place must have its `saved_place_sources` link by COMMIT — **same transaction** |
| `sps_provenance_preserved`, `ppr_alias_retained_on_delete`, `ppr_alias_retained_on_move` | CONSTRAINT TRIGGERs | A partial rollback / cleanup is itself constrained; there is no easy "delete half of it and retry" |
| `saved_places_normalize_enrichment` | BEFORE INSERT OR UPDATE trigger | Re-normalises `tags` / `why_go` / `dishes` on the way in. Deterministic, so harmless — but it means the copied values are *re-derived*, not byte-preserved |

All 25 local `saved_places` are `origin = 'import'` and all 25 have a `saved_place_sources` link, so
the deferred-trigger pairs bite on every single row.

### 4.2 Is there a clean path? — straight verdict

**A row copy is possible but it is the messier option, and the user-id boundary is not the worst
part of it.**

The user-id boundary is, in isolation, tractable: local has exactly **one** `auth.users` row, so a
promotion is a single substitution of `user_id` across `saved_places`, `saved_place_sources` and
`imports`. What makes it messy is everything around it:

1. **It is an out-of-band write to production.** `db-migration-runbook.md` §"Two things never to do"
   is about SQL that bypasses the sanctioned path, and its stated reason — the ledger and the live
   state stop agreeing — applies to data as much as schema. There is no `db:promote.sh`, no
   dry-run, no post-check, and no rehearsal. `db-push.sh` exists precisely because "an unprovable
   push is not allowed to begin"; a hand-written promotion script would have none of that machinery
   on its first run, against the one database with no PITR.
2. **The rows are not worth promoting.** This is the decisive argument and it has nothing to do with
   SQL. Rows imported *locally* today are resolved against a loaded `poi_index`; rows imported
   against *staging* would be resolved by **Google** (`NEXT_PUBLIC_STAGE=preview|staging` is in
   `NON_PRODUCTION_STAGES`), and `06` §3.1 is VERIFIED that Google Places content may not be served
   alongside a MapLibre map. Copying Google-resolved coordinates into the production database and
   rendering them on the production MapLibre map **breaches the terms the factory's gate exists to
   enforce** — it would route around a control that was deliberately written in code rather than
   prose. So of the two "import elsewhere" options, staging is the one that is actually blocked, and
   it is blocked on terms, not on plumbing.
3. **Two identity keys are portable and one is not, which shapes any partial retry.**
   `place_provider_refs.provider_place_id` for `llm_guess` is
   `llm:<normalise(rawName)>|<city>|<country>` (`src/domain/import/llm-guess-place-id.ts`) and
   `sources.platform_source_id` is the TikTok post id — both deterministic from the post, so they
   are stable across projects and a re-run converges rather than duplicating. But `places.id`,
   `saved_places.id`, `sources.id` and `extractions.id` are project-local UUIDs, so a copy must
   either preserve them wholesale (fine on an empty production) or maintain a full id map.

**Verdict: promotion is not the clean path.** It requires a bespoke, never-rehearsed, transactional,
id-remapping script written against production, to move data that was either produced by the wrong
resolver (staging/Google, a terms problem) or produced against an index production does not have
(local/Overture, so the rows would be *better* than anything production can currently produce —
which is an argument for fixing production, not for smuggling rows into it).

The one legitimate variant, if it is ever needed, is **replay rather than copy**: keep the 100 links
and re-drive them through production's own `/api/imports/*` once production is prepared. That is not
promotion; it is just importing, later. It costs 100 LLM extraction calls, which is inside the
500/day Gemini budget.

---

## 5. Recommendation — prepare production and import directly into it

**Lean, in the real sense: one path, no second copy of the data, no bespoke tooling, and every step
is one the project already has a proven script for.** The alternative buys nothing and adds an
un-rehearsed write to the only database without recovery.

The load-bearing precondition, and it is not optional: **production must have a loaded
`poi_index` before the batch runs**, otherwise the whole exercise persists 100 `llm_guess` rows at
327 m median jitter and a partially-duplicated library. Everything else on this list is cheap; that
step is the one that decides whether the data is worth keeping.

### 5.1 Ordered checklist

Marked **[OWNER]**, **[ORCH]** (orchestrator only per `docs/agent-guardrails.md`), or **[ANY]**.

| # | Step | Who | Why / proof |
|---|---|---|---|
| 1 | Restore the Vercel env store for **Production**, per `docs/vercel-env-restore.md` §2's table, scoping the **prod** Supabase project to Production only | **[OWNER]** | Credential entry into a third party. Nothing else can start until this is done |
| 1b | Also restore **Preview** + **Development** against the *staging* project — same doc, same table | **[OWNER]** | Otherwise preview deploys stay broken and `L0-F6` cannot be proven from a preview |
| 2 | **Redeploy**, then prove: `/healthz` 200, `/map` **307 → /sign-in** (not 500), `/import` **307** | **[ANY]** | `NEXT_PUBLIC_*` are inlined at build; existing deployments keep the absent values. A 307 on `/map` is the pass |
| 2b | Confirm the production bundle now inlines the **prod** ref and the preview bundle the **staging** ref: `grep -oE '[a-z]{20}\.supabase\.co'` over each | **[ANY]** | Catches a mis-scoped variable before it writes to the wrong project |
| 3 | Set `PROD_DATABASE_URL` (session pooler) in `.env.local`; verify `supabase link` targets **prod**, not staging | **[ORCH]** | The CLI is currently linked to `p-002-staging` (`supabase status` today). `db-push.sh` step 3 refuses a mis-target rather than re-linking — which is correct, and means it will simply stop |
| 4 | `npm run db:status:prod` — read the ledger before writing | **[ORCH]** | `db-migration-runbook.md` §3. A REMOTE-only row means stop |
| 5 | `npm run db:inventory:prod` **and** `:staging` — structural truth, including whether `poi_index` really is empty | **[ORCH]** | §1.1. The runbook's own lesson: staging's out-of-band drift was invisible to `db:status` and was found by the inventory on its first check |
| 6 | `DB_PUSH_DRY_RUN=1 npm run db:push:prod` | **[ORCH]** | Exercises the whole wrapper and writes nothing |
| 7 | `npm run db:push:prod` — applies `0019`–`0023` | **[ORCH]** | Hosted migration push. **Never a specialist.** None of the five is destructive (no `drop`/`truncate`/`delete from`/narrowing `alter type` on live data), so §4's dump-first rule does not trigger — but production holds no user rows yet either way |
| 8 | Confirm the push's own post-check passed: ledger local == remote, `inventory.sql` all PASS | **[ORCH]** | `db-push.sh` step 8 does this and exits non-zero with `PUSH APPLIED, PROOF FAILED` if not |
| 9 | **Load `poi_index` for `tlv` into production**: `PROD_DATABASE_URL=… scripts/ingest-poi-region.sh tlv` (extract first; the work dir is currently empty, and `venv/` exists) | **[ORCH]** | The step that decides whether the batch is worth keeping. Must come **after** step 7: the script asserts `poi_regions` bbox == config bbox, and at `0018` the row still holds `0010`'s narrow box, so it would refuse. It also opens with `delete from poi_index where region_id='tlv'` — a destructive statement, therefore orchestrator-only |
| 10 | Verify: `select id, is_loaded, row_count, norm_version from poi_regions where id='tlv'` → expect **`t, 10462, 1`** and `count(*) from poi_index` → **10 462** | **[ORCH]** | Matches the local figure exactly; a different number means a different release or bbox |
| 11 | Sign in on production and import **one** real TikTok end to end. Then read the row: `places.source_dataset` must be `overture-places` with a non-null `resolution_score`, **not** `llm-guess` | **[ANY]**, but the read is **[ORCH]** | This is the whole readiness question in one import. If it comes back `llm-guess`, stop — steps 9/10 did not take |
| 12 | Only then run the ~100-link batch, in small groups, checking the `llm-guess` share as you go | **[ANY]** | A rising `llm-guess` share means the venue is outside the `tlv` extent, which is a coverage answer, not a bug |
| 13 | Add the deploy check `vercel-env-restore.md` §5 asks for: something that fetches `/map` and asserts 307 | **[ORCH]** applies; I can **propose** the diff | Nothing in this repo noticed production had been down since 2026-08-26 |

### 5.2 Boundaries and honest limits on this recommendation

- **Steps 3–10 are the orchestrator's.** Hosted migration pushes, any connection using
  `PROD_DATABASE_URL`, and the ingest's `delete from poi_index` are all named in
  `docs/agent-guardrails.md` §2. Step 1 / 1b are the **owner's** — credential entry.
- **Cost: no new spend.** The `tlv` extract is **9 192 kB** including indexes (measured locally at
  10 462 rows); the whole local database with 25 places is 38 MB. Loading it into a free-tier
  project is not close to any plan boundary. The 100-link batch costs ~100 Gemini extraction calls
  against a 500/day budget, and — because production resolves with Overture, not Google — **zero**
  Google Places quota. Nothing here needs billing enabled.
- **What this recommendation is NOT confident about.** The `tlv` extent is Tel Aviv + the Hasharon.
  The owner's goal says *"places around the world."* Every link outside that box resolves to
  `no_region` and lands as `llm_guess` — the exact outcome step 9 exists to prevent, just narrowed
  to the out-of-region subset. That is a **product/coverage decision the orchestrator or owner
  owns**, not a deploy question, and it is the single biggest gap between this checklist and the
  stated goal. `docs/evidence/.local/corpus-100/candidates-raw.txt` (67 lines as of 14:22 today) is
  where the real geographic spread can be checked before any of this is worth doing. The honest
  options are: restrict the batch to the loaded region; ingest `ldn` and `tyo` too (`0010` already
  seeds both regions; the ingest is the same three commands per region); or accept `llm_guess` rows
  for out-of-region links **with their provenance visible**, which the schema already records
  faithfully — `source_dataset = 'llm-guess'`, `resolution_score = null` — and which the product
  should not present as a confirmed location.
- **Not verified by me, and it should be before step 12:** the real serverless execution ceiling on
  this plan (`02` §A3). The production builds observed today complete in 25–47 s, which says nothing
  about request duration. `L0-F6`'s streaming route is the surface that depends on it.

---

## Appendix — what I ran

Read-only throughout. No deploy, no `vercel env|link|pull|deploy`, no hosted database connection, no
write of any kind to any database, no Google Places call, no LLM call, no commit.

```
curl https://p-002-zeta.vercel.app{/healthz,/,/sign-in,/map,/import}     # status codes
curl … /sign-in + its 10 static chunks                                   # bundle grep for a supabase ref
npx vercel whoami | logs <url> [--json] | inspect <url> | ls p-002       # read-only
psql postgresql://…@127.0.0.1:54322/postgres   # local only: counts, pg_constraint, pg_trigger, sizes
curl http://127.0.0.1:54321/rest/v1/…          # local PostgREST: 42703 and PGRST202 error shapes
npx supabase status
git log / grep over supabase/migrations, src/, scripts/, docs/
```

Deliberately **not** run, per `docs/agent-guardrails.md` §2: `npm run db:inventory:prod`,
`npm run db:inventory:staging`, `npm run db:status:prod|staging`, `vercel env ls`.
