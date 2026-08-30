# Vercel env restore — re-derived 2026-08-29 (VERCEL-FIX-1)

`devops-vercel`, Probe tier. Investigation and a checklist only. **Nothing was written to Vercel,
no `vercel env add|rm|pull|link|deploy` was run, no database connection was opened, no Google
Places quota was spent.** Every command below that was actually executed is marked MEASURED; every
inference from source is marked REASONED.

Checkout: `main` @ `44f0737`. Vercel CLI 59.10.0, authenticated as `liorjossef-9797`, scope `lior19`.

---

## 0. The one-paragraph answer

Production is 500ing on every authenticated surface because the Vercel env store is empty and
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are inlined at build time. **Three
variables on the Production target plus a rebuild fixes the outage.** Two further variables
(`LLM_PROVIDER`, `GEMINI_API_KEY`) are needed before `/import` can actually run, and adding them is
the point where the owner's no-new-spend and abuse-exposure concerns bite. Two claims in
`docs/vercel-env-restore.md` are now wrong in a way that matters, and one is a live contradiction
with an owner ruling that is **not mine to resolve**.

---

## 1. MEASURED: the current state of production

```
curl -s -o /dev/null -w '%{http_code}' https://p-002-zeta.vercel.app<path>
```

| Path | Code | Why |
|---|---|---|
| `/` | 200 | `currentUserOrNull()` in `src/app/page.tsx` wraps `createClient()` in try/catch and degrades to signed-out |
| `/healthz` | 200 | reads only `BUILD_INFO`; no Supabase client |
| `/sign-in` | 200 | `'use client'` — the browser client is only constructed on submit, so the page renders |
| `/map` | **500** | |
| `/import` | **500** | |
| `/collections` | **500** | **not in the old doc** |
| `/collections/join/abc123` | **500** | **not in the old doc** |

`/healthz` body, MEASURED:

```json
{"ok":true,"stage":"production","commit":"44f0737"}
```

That single line proves three things at once: the deployment is current, the build succeeds, **and
build identity needs no env store at all** — `next.config.ts` falls back to `VERCEL_ENV` and
`VERCEL_GIT_COMMIT_SHA`, both of which Vercel injects automatically. See §3 discrepancy D4.

### 1.1 What actually throws first, on `/map`

The old doc says the *page* throws. REASONED from source: on `/map` the **middleware** throws
first. `src/proxy.ts` has `export const config = { matcher: ['/map/:path*'] }` (which matches
`/map` itself) and calls
`createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)` at line 14 before any React
renders. `supabase-js` throws `supabaseUrl is required` on `undefined`. On `/import`,
`/collections` and `/collections/join/*` the matcher does not apply, so the throw comes from
`src/app/_lib/supabase/server.ts:15` inside the page. Same 500, two different origins — worth
knowing because a middleware failure will not appear in a page-level runtime log.

The `!` non-null assertion in `proxy.ts`, `_lib/supabase/server.ts` and `lib/supabase/client.ts` is
what converts a config problem into an unhandled 500 rather than a diagnosable message. Flagged as
a follow-up for `nextjs-architect`, not fixed here.

---

## 2. The authoritative required-variable list, re-derived from this checkout

Source of truth: `grep -rn "process\.env\." src/ next.config.ts scripts/`, then reading each
consumer. Nothing below is taken from a doc.

### 2.1 Required — production is broken without these

| Variable | Read by | Unset behaviour (read from code) | Inlined? | Production value | Preview + Development value |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/proxy.ts:14`, `src/app/_lib/supabase/server.ts:15`, `src/lib/supabase/client.ts:71`, `src/integrations/supabase/service-role-client.ts:19` | `!`-asserted at three sites → `createServerClient(undefined,…)` **throws**; the service-role client throws its own explicit error | **yes**, `NEXT_PUBLIC_` | prod project URL — `https://vtboskegexinvhasghri.supabase.co` | staging — `https://jfuqjzubphfhfleqnkno.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `proxy.ts:15`, `_lib/supabase/server.ts:16`, `lib/supabase/client.ts:72` | same — throws | **yes** | prod publishable key | staging publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/integrations/supabase/service-role-client.ts:20` only | explicit `throw new Error('serviceRoleClient: … must both be set.')`. Fails **only** on `/api/imports/probe` and `/api/imports/confirm`, not on page render | no — server only | prod secret key | staging secret key |

Source for all six values: Supabase dashboard → the project → **API Keys** / **Connect**. Prod
project for Production only; staging project for Preview and Development. A prod value scoped to
Preview is how a preview deployment writes to real user data.

### 2.2 Required before `/import` can complete a run

| Variable | Read by | Unset behaviour | Inlined? | Scope |
|---|---|---|---|---|
| `LLM_PROVIDER` | `src/app/api/imports/probe/route.ts:595` → `createPlaceExtractor` | **defaults to `anthropic`** (`place-extractor-factory.ts:27`). Unknown value throws `Unknown LLM_PROVIDER` | no | all three, same value |
| `GEMINI_API_KEY` | the Gemini extractor | `throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini.')` | no | all three |
| `ANTHROPIC_API_KEY` | the Anthropic extractor | `throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic (the default).')` | no | all three |

**This is a live foot-gun.** `.env.local` in this checkout has `GEMINI_API_KEY` and **no**
`ANTHROPIC_API_KEY` (names read with `sed`; no value printed). The project's measured budget is the
Gemini 500/day one. So if only the Supabase variables are restored, `/map` and `/import` render but
the first real import throws at the `extract` stage on the default `anthropic` path with no key.
`LLM_PROVIDER` must be set **explicitly**; leaving it unset is not a safe default here.

`ANTHROPIC_MODEL` / `GEMINI_MODEL` are genuinely optional overrides — the adapters default in code.

### 2.3 Optional — behaviour switches, all safe to leave unset

| Variable | Read by | Unset behaviour |
|---|---|---|
| `PLACE_RESOLVER` | `place-resolver-factory.ts:113` | unset → the stage gate decides (§3, D3). An unrecognised non-empty value **throws** |
| `PLACE_LOOKUP_CACHE` | `:114` | only the literal `off` disables the `place_lookups` cache; anything else, including unset, leaves it on |
| `GOOGLE_PLACES_API_KEY` | `:117` | server-only key, and the one that should be used. On Production it is **never read** — see D3 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `:120` | browser-inlined fallback key. **Do not set on any deployed target** — anyone can read it out of the bundle and drain the 100/day quota |
| `NEXT_PUBLIC_STAGE` | `next.config.ts:14`, `build-info.ts:7`, `place-resolver-factory.ts:123` | falls back to `VERCEL_ENV`. **Do not set** — MEASURED working, and a wrong value silently flips the resolver gate |
| `NEXT_PUBLIC_COMMIT_SHA` | `next.config.ts:16`, `build-info.ts:8` | falls back to `VERCEL_GIT_COMMIT_SHA`. **Do not set** — MEASURED working |

### 2.4 Must NOT be in the Vercel env store

`STAGING_DATABASE_URL`, `PROD_DATABASE_URL`, `DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF_*`. Nothing in `src/` reads any of them; they are
operator variables for `db-migration-runbook.md`, and Vercel builds never run migrations. A
database password in the env store would be a real regression.

`NEXT_PUBLIC_PROTOMAPS_API_KEY` — read only by `src/components/map/map-surface.live.tsx:77`, which
is not wired in (`map-surface.tsx` exports the mapcn/CARTO surface). Not required. The 2026-08-28
correction on this is **still accurate**.

`OPENROUTER_API_KEY` / `OPENROUTER_MODEL` exist in `.env.local` and are read by **nothing** in
`src/` or `scripts/` (MEASURED: `grep -rn OPENROUTER src/ scripts/` → no matches). Dead locals; do
not carry them to Vercel.

---

## 3. Discrepancies against `docs/vercel-env-restore.md` §2

**D1 — the blast radius is bigger than the doc says.** The doc: *"the only two pages that build a
server-side Supabase client — `/map` and `/import`"*. MEASURED today: `/collections` and
`/collections/join/<token>` also 500. Collections shipped after the doc was written. The doc's own
verification section in §4 therefore under-tests the fix.

**D2 — the doc says `/` needs no configuration. It now does, and only survives by accident of
design.** `src/app/page.tsx:56` calls `createClient()`. It stays 200 solely because
`currentUserOrNull()` catches. If that try/catch is ever removed, the landing page joins the
outage. Worth stating because the doc uses `/` returning 200 as part of its diagnosis.

**D3 — the `PLACE_RESOLVER` guidance contradicts a standing owner ruling. FLAGGED, NOT RESOLVED.**

- The doc's table says: Production → leave `PLACE_RESOLVER` unset, which means `overture`; and
  `GOOGLE_PLACES_API_KEY` is *"not needed while production resolves with Overture"*.
- `place-resolver-factory.ts:92-99` confirms the code: any stage not in
  `{local, preview, staging, test}` returns `overture`, citing `06` §3.1 (Google Places content may
  not be paired with a non-Google map). An unset/unknown stage counts as production, deliberately.
- `docs/current-state.md` line 114: **"Overture is not to be reintroduced."** Line 107: **"Google
  Places is the canonical resolver."** Owner ruling, 2026-08-28.

So the doc is an accurate description of the code and is in direct conflict with the ruling. This
is already written up in `docs/evidence/deploy/production-resolver-gate-2026-08-28.md`, which lists
three exits (the pairing is permitted / the renderer must move / run the honest degraded path
knowingly). **It is a compliance decision for the owner. I am not resolving it and the runbook in
§5 does not set `PLACE_RESOLVER`,** which keeps the ToS-safe default in place.

One measured consequence the owner should have in hand when deciding: production's `poi_index` is
**empty**. `0020_poi_region_tlv_launch_area.sql` seeds region *metadata* only — it contains no
`insert into poi_index` at all (MEASURED by grep), and its own guard raises if `tlv` is already
loaded. POI rows come from an ingest script that has never been run against production. So with the
env store fully restored, every production import resolves `no_match` and persists `llm_guess`
coordinates. Fixing the env store does **not** make production resolve places correctly.

**D4 — two variables the doc tells you to set are unnecessary, and one of them is risky.**
`/healthz` MEASURED reports `stage:"production", commit:"44f0737"` with an **empty env store**.
`next.config.ts` lines 14–16 already fall back to `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA`.
Therefore:

- `NEXT_PUBLIC_COMMIT_SHA` — the doc says set it to the literal `$VERCEL_GIT_COMMIT_SHA`. Not
  needed. And whether Vercel expands `$VAR` inside a custom env value is ASSUMED, not verified by
  me; if it does not, `/healthz` would start reporting the literal string `$VERCEL` — a visible
  regression traded for nothing. **Recommendation: do not set it.**
- `NEXT_PUBLIC_STAGE` — not needed, and actively risky. It is an input to the resolver gate
  (`place-resolver-factory.ts:92`). Setting it to `staging` on the Production target would flip
  production onto the Google path and straight through the ToS gate in D3. **Recommendation: do not
  set it.**

**D5 — the doc's §4 "expect it to fail after sign-in, production is on `0009`" is stale.** Per
`docs/product-backlog-2026-08-29.md` §17 and the untracked `scripts/rebuild-prod.sh`, production was
rebuilt from zero on 2026-08-29 and its ledger now reads `0001 → 0023`, none missing. **I did not
verify this** — opening `PROD_DATABASE_URL` is forbidden to me under `agent-guardrails.md` §2 — so
it is REASONED from the repo's own records and needs the orchestrator's confirmation. If it holds,
`get-spots.ts`'s column list resolves and the signed-in `/map` works. See §4 for what does *not*.

**D6 — `.env.example` is missing four variables the code reads.** `PLACE_RESOLVER`,
`PLACE_LOOKUP_CACHE`, `GOOGLE_PLACES_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` are all read by
`place-resolver-factory.ts` and none appear in `.env.example`, so a clean clone cannot reproduce the
resolver configuration from the repo. Proposed as a docs fix; not made here.

---

## 4. What else keeps production broken after the variables are set

### 4.1 A redeploy is mandatory, and a plain redeploy may not be enough

`NEXT_PUBLIC_*` values are substituted into the compiled output at build time, in **both** the
client and the server bundles. Adding a variable to the env store changes nothing about a
deployment that already exists — the existing artefacts still contain `undefined`. This part is
certain.

Less certain, and stated as such: Next.js's build cache is keyed on inputs that do not obviously
include a changed env value, so a cache-reusing rebuild can serve stale prerendered output.
`vercel redeploy` (CLI 59.10.0, MEASURED via `--help`) exposes only `--no-wait` and `--target` — it
has **no build-cache flag**. The dashboard's Redeploy dialog does have the *Use existing Build
Cache* checkbox. **Recommendation: redeploy from the dashboard with that box UNCHECKED**, or push
any trivial commit to `main`, which produces a fresh build unambiguously. This is the one step where
guessing costs a confusing second round of debugging.

### 4.2 Production is missing migrations `0024`–`0026` — collections will still 500

REASONED, from `git log` on the migration files against the `0001 → 0023` rebuild record. `0024`
creates `collections`, `collection_members`, `collection_items`, `collection_invites` and the
functions `join_collection_via_token`, `preview_collection_invite`, `collection_role`,
`can_edit_collection`, `place_is_in_my_collection`, `shares_a_collection_with`. `0026` adds
`end_collection_membership`, `collection_removed_members`, `restore_collection_membership` and the
`collection_members` tombstone column.

App code that will fail against a `0023` production, with call sites:

- `src/app/collections/page.tsx` and `src/app/collections/[id]/page.tsx` → `getCollections()` reads
  tables that do not exist.
- `src/app/map/page.tsx` calls `getCollectionMemberships()` in its `Promise.all` — **so `/map`
  itself is at risk**, not just `/collections`. This is the single most important item in this
  section: restoring the env store may move `/map` from a 500-before-render to a 500-after-render.
- `src/app/actions/collections.ts:400` `rpc('join_collection_via_token')`, `:473`
  `rpc('end_collection_membership')`; `src/app/collections/join/[token]/page.tsx:67`
  `rpc('preview_collection_invite')` → PGRST202.

`save_place` is **not** affected: `0024`'s recreation keeps the same 4-argument signature
(`p_place_id, p_source_id, p_note, p_extracted_reason`) and only restores the `source_url`
denormalisation that `0017` dropped. Import confirm will work at `0023`; `saved_places.source_url`
will stay null (the separate P0 in the backlog), and the sheet falls back to the joined
`sources.canonical_url`, so it degrades invisibly rather than loudly.

`0025` is a `service_role` TRUNCATE revocation on the two POI tables — a security hardening, not a
functional blocker, but it is missing on production too.

**Consequence for the runbook: `0024`–`0026` should be pushed to production before or alongside the
env restore.** That push is the orchestrator's/owner's, never mine.

### 4.3 Supabase Auth redirect / allowed URLs

Low risk, but check it once. Sign-in is email + password with `router.push`, and `grep` finds no
`emailRedirectTo` and no `redirectTo` anywhere in `src/` — so no OAuth or magic-link callback URL
has to be allow-listed. The only origin-dependent surface is the collection invite link, and
`src/components/collections/share-panel.tsx:112` builds it from `window.location.origin` at call
time, so it is correct on any host with no configuration. **Nothing to configure here.** If sign-in
still fails after the restore, the cause is the key or the project, not a redirect list.

### 4.4 The abuse exposure the owner already identified — and it is a spend question

`docs/product-backlog-2026-08-29.md` §17 records that the owner **declined** to restore the env
store on 2026-08-29, and why: a working production exposes the Gemini (500/day) and Google Places
(100/day) budgets, because `rateLimitedLocal` has zero production call sites, and Supabase
`config.toml` has `enable_signup = true` with `enable_confirmations = false`. One unconfirmed signup
plus a loop of distinct URLs drains the budget.

I am obliged to flag this before the spend, so: **restoring `GEMINI_API_KEY` on the Production
target is the moment the exposure becomes real.** Two mitigations, in the order I would take them:

1. Restore only the **three Supabase variables** first. That fixes the outage — `/map`, `/import`
   and `/collections` render, sign-in works — and adds **zero** model spend, because `/import`'s
   probe route cannot call a model without a key. It fails at the `extract` stage with a 500 that is
   honest rather than expensive. **This is a genuine, safe, reversible first step and the runbook
   below is ordered around it.**
2. Only then, and only with signup closed (Supabase dashboard → production project →
   Authentication → Sign In / Providers → Email → *Allow new users to sign up* **off**; production
   holds zero users, so this costs nothing), add `LLM_PROVIDER` and `GEMINI_API_KEY`.

There is also a **standing hold** recorded on 2026-08-29: *no further changes to production, Vercel,
Supabase auth, Google Places or Gemini until the owner lifts it.* Everything in §5 is on the far
side of that hold.

---

## 5. MEASURED: the current env store, and the ordered restore runbook

### 5.1 Current state — all three targets empty

The project is **not linked** in this checkout (no `.vercel/` directory, and I must not link it), so
every command needs `--project p-002`. This is the exact form that worked:

```bash
npx vercel env ls production  --project p-002
npx vercel env ls preview     --project p-002
npx vercel env ls development --project p-002
```

All three, MEASURED 2026-08-29:

```
> No Environment Variables found for lior19/p-002
```

`npx vercel project ls` (MEASURED) shows one project, `p-002`, production URL
`https://p-002-zeta.vercel.app`, Node 24.x.

### 5.2 The runbook — for the OWNER to run

Each `vercel env add` prompts for the value on stdin; **no secret is typed on a command line and
none appears in shell history.** Do not add `--value`.

`--sensitive` is offered by the CLI but may be a paid-plan feature; if any command rejects it, drop
the flag and re-run. The variable is still encrypted at rest either way.

**Step 0 — decide the two things that are not ours** (D3 in §3; and §4.4's signup question).
Nothing below sets `PLACE_RESOLVER`, so the ToS-safe Overture default stays in place regardless.

**Step 1 — push the three missing migrations to production** (§4.2). Orchestrator/owner, per
`db-migration-runbook.md`. Skipping it leaves `/map` 500ing for a different reason.

**Step 2 — the three variables that fix the outage. Production target.**

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL      production --project p-002
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --project p-002
npx vercel env add SUPABASE_SERVICE_ROLE_KEY     production --project p-002 --sensitive
```

Values: **prod** project `vtboskegexinvhasghri` — dashboard → API Keys. URL is
`https://vtboskegexinvhasghri.supabase.co`.

**Step 3 — the same three for Preview and Development, from STAGING.** One command each; the CLI
accepts a comma-separated target list.

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL      preview,development --project p-002
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview,development --project p-002
npx vercel env add SUPABASE_SERVICE_ROLE_KEY     preview,development --project p-002 --sensitive
```

Values: **staging** project `jfuqjzubphfhfleqnkno`. URL is
`https://jfuqjzubphfhfleqnkno.supabase.co`. **Never the prod values here** — a preview deployment
writes to whatever it is pointed at.

**Step 4 — confirm the names landed, before rebuilding.**

```bash
npx vercel env ls production --project p-002   # expect the 3 names, no values
npx vercel env ls preview    --project p-002
```

**Step 5 — rebuild. Not optional, and not a plain instant redeploy** (§4.1).

Dashboard → p-002 → Deployments → the latest Production deployment → ⋯ → **Redeploy**, with **"Use
existing Build Cache" UNCHECKED**. (Equivalent CLI: `npx vercel redeploy <deployment-url>
--target production` — but it has no cache flag, so the dashboard route is the reliable one.)

**Step 6 — verify. This is the pass/fail gate.**

```bash
curl -s https://p-002-zeta.vercel.app/healthz            # {"ok":true,"stage":"production","commit":"<sha>"}
for p in / /sign-in /map /import /collections; do
  printf '%-14s %s\n' "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' https://p-002-zeta.vercel.app$p)"
done
```

Expected: `/` 200, `/sign-in` 200, and **`/map` `/import` `/collections` all `307`** — a redirect to
`/sign-in`, not a 500. A 307 is the pass: it means the page built a Supabase client, asked who the
user is, and redirected. A 500 means the values did not reach the build — re-check Step 5 before
re-checking Step 2.

Then sign in and open `/map` and `/collections` in a browser at 390×844 and 1440×900. Confirm the
list renders and a collection opens. `/import` will render; **do not run an import yet.**

**Step 7 — close signup BEFORE enabling the model key** (§4.4). Supabase dashboard → production
project → Authentication → Sign In / Providers → Email → *Allow new users to sign up* **off**.
Production has zero users. Verify with:

```bash
curl -s https://vtboskegexinvhasghri.supabase.co/auth/v1/settings \
  -H "apikey: <prod publishable key>" | grep -o '"disable_signup":[a-z]*'
```

Expect `"disable_signup":true`.

**Step 8 — only now, the model key.** This is the step that exposes the Gemini 500/day budget.

```bash
npx vercel env add LLM_PROVIDER   production,preview,development --project p-002   # value: gemini
npx vercel env add GEMINI_API_KEY production,preview,development --project p-002 --sensitive
```

`LLM_PROVIDER` **must** be set explicitly: unset means `anthropic`, and there is no Anthropic key.

Rebuild again (Step 5) — strictly, neither of these is `NEXT_PUBLIC_`, so a runtime-only pickup
would do, but a rebuild is the one path that is certainly correct and costs a few minutes.

**Step 9 — one real import, watched.** Sign in, paste one TikTok link, and expect: extraction
succeeds, resolution returns `no_match`, and the place saves with `llm_guess` provenance
(§3, D3 — production's `poi_index` is empty). That outcome is *correct behaviour for the current
configuration*, not a new bug. If it is not acceptable, the answer is the D3 decision, not another
environment variable.

**Not in this runbook, deliberately:** `PLACE_RESOLVER`, `GOOGLE_PLACES_API_KEY`,
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_STAGE`, `NEXT_PUBLIC_COMMIT_SHA`,
`NEXT_PUBLIC_PROTOMAPS_API_KEY`, and every `*_DATABASE_URL` / `SUPABASE_ACCESS_TOKEN` /
`SUPABASE_DB_PASSWORD`. Reasons in §2.3, §2.4 and §3 D4.

---

## 6. Cost

No recurring spend is introduced by anything in §5. Vercel usage is unchanged — same project, same
plan, no new functions, no cron, no storage. The only variable cost is model calls, which are the
existing Gemini free-tier 500/day, and they become reachable only at Step 8. Google Places spend
stays at zero on production for as long as the resolver gate stands (§3, D3), because
`GOOGLE_PLACES_API_KEY` is never read on a `production` stage. Nothing here needs billing enabled or
a payment method.

---

## 7. What I could not verify

- **Production's actual migration head.** `agent-guardrails.md` §2 forbids me opening
  `PROD_DATABASE_URL`. `0001 → 0023` is read from `docs/product-backlog-2026-08-29.md` §17;
  `0024`–`0026` missing is inferred from `git log` dates. Confirm with `npm run db:status:prod`
  passing `--project-ref` explicitly — the backlog records that omitting it silently measured
  staging twice.
- **Whether production Supabase has signup open.** Inferred from `config.toml`, never measured; no
  production anon key is available locally.
- **Whether Vercel expands `$VERCEL_GIT_COMMIT_SHA` inside a custom env value.** ASSUMED from
  Vercel's docs, not tested. Moot under the §2.3 recommendation not to set it.
- **Whether Vercel's build cache would serve stale inlined values.** Reasoned, not tested. §4.1
  routes around it rather than relying on the answer.
- **Anything requiring a write to Vercel.** No `env add|rm`, no `deploy`, no `link`, no `pull` was
  run. Read-only `whoami`, `project ls`, `env ls`, and two `--help` invocations only.
