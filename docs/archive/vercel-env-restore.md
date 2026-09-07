# Restoring the Vercel environment variables

> **RESOLVED 2026-08-29 — the env store was filled and production is live.** Verified 2026-08-30:
> `https://p-002-zeta.vercel.app/healthz` answers `{"ok":true,"stage":"production","commit":"99324dd"}`,
> which is current `main`.
>
> **What is still CURRENT in this file:** §2's variable matrix (the authoritative list of what the
> code reads and how each one must be scoped), §3's procedure, and §5's observation that `/healthz`
> cannot detect a broken deploy. Use it as the env reference, and as the checklist if the store is
> ever lost again.
>
> **What is DATED:** every present-tense sentence about production being down, and every migration
> number. §1 and §4 describe 2026-08-26 and are left standing as the incident record.
>
> Written **2026-08-26**, when production was found serving 500s because the Vercel project had **no
> environment variables at all**. Filling it in is the owner's job: it is credential entry into a
> third party, so it is not something an agent does.

## 1. What was found on 2026-08-26 — the incident record

> This section is DATED. It describes the outage, not today. The commands are still the right way to
> re-check the store; the finding below is what they returned that day.

```bash
npx vercel env ls production --project p-002
npx vercel env ls preview    --project p-002
npx vercel env ls development --project p-002
```

All three returned **`No Environment Variables found`**. Confirmed independently of the CLI, in case
the CLI was simply looking at the wrong place: the entire production JS bundle contains no Supabase
project URL and no anon key, only the bare `.supabase.co` string the client library ships. So
`NEXT_PUBLIC_SUPABASE_URL` really was undefined at build time, not merely hidden from `env ls`.

**The symptom this produces.** `NEXT_PUBLIC_*` values are inlined at build, so an unset one is
`undefined` at run time too. `createServerClient(undefined, undefined)` throws immediately, and the
only two pages that build a server-side Supabase client — `/map` and `/import` — therefore 500
before doing anything else. `/`, `/sign-in` (a client component) and `/healthz` need no
configuration and keep working, which is exactly the pattern observed. It also means `/map` never
reaches its own `redirect('/sign-in')`, so an unauthenticated visitor gets a 500 rather than the
sign-in page.

**Why it wasn't obvious.** `next build` does not fail on a missing `NEXT_PUBLIC_*`; it inlines
`undefined` and carries on. Vercel's own deployment check goes green. So every signal a PR shows —
CI, the Vercel check, the preview URL existing — was green while the deployed app was unusable.

## 2. The variables, as the code actually reads them

Derived from `grep -r "process\.env\." src`, not from an older doc. `docs/ms2-cloud-setup.md` §2's
table is now partly stale: it lists `ANTHROPIC_API_KEY` as the only model key, from before the
provider switch existed.

> **Re-derived and corrected 2026-08-28** (`PROD-READY-2`, `devops-vercel`) from
> `grep -rn "process\.env\." src/ next.config.ts` on this checkout. Three corrections, all of them
> in the direction of "the old table would have led you to set the wrong things":
>
> 1. **`NEXT_PUBLIC_PROTOMAPS_API_KEY` is not required and should not be set.** It is read only by
>    `src/components/map/map-surface.live.tsx`, and that file is **not wired in**:
>    `src/components/map/map-surface.tsx` exports `MapSurfaceMapcn` (MapLibre + CARTO's keyless
>    basemap) and its own header says of the Protomaps surface *"Protomaps has been ruled out by the
>    product owner (2026-08-21) … Do not wire it in."* D2 was reopened on 2026-08-21. Setting the
>    variable is harmless; believing the map depends on it is not.
> 2. **Four variables were missing entirely** — `PLACE_RESOLVER`, `PLACE_LOOKUP_CACHE`,
>    `GOOGLE_PLACES_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. All four are read by
>    `src/integrations/places/place-resolver-factory.ts`, which is what decides *which place
>    resolver production uses*. Omitting them from a restore checklist is how the resolver gate ends
>    up configured by accident.
> 3. `LLM_PROVIDER`'s default is confirmed as `anthropic`
>    (`src/integrations/llm/place-extractor-factory.ts`: *"ANTHROPIC_API_KEY is required when
>    LLM_PROVIDER=anthropic (the default)"*). Given the project's measured budget is the **Gemini**
>    500/day one, leaving `LLM_PROVIDER` unset is a live foot-gun.

| Variable | Secret | Production value | Preview + Development value | Read by |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | **prod** project URL (`vtboskegexinvhasghri`) | **staging** project URL (`jfuqjzubphfhfleqnkno`) | server + browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | prod publishable key | staging publishable key | server + browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | prod secret key | staging secret key | `integrations/supabase/service-role-client.ts` — the import pipeline |
| `LLM_PROVIDER` | no | `anthropic` or `gemini` | same | `place-extractor-factory.ts`; **defaults to `anthropic`** when unset |
| `ANTHROPIC_API_KEY` | **yes** | required if `LLM_PROVIDER=anthropic` (including when unset) | same | the Anthropic extractor |
| `GEMINI_API_KEY` | **yes** | required if `LLM_PROVIDER=gemini` | same | the Gemini extractor |
| `ANTHROPIC_MODEL` / `GEMINI_MODEL` | no | optional overrides | optional | the respective extractor |
| ~~`NEXT_PUBLIC_PROTOMAPS_API_KEY`~~ | no | **not required — do not set** | not required | only `map-surface.live.tsx`, which is not wired in (see the 2026-08-28 note above) |
| `PLACE_RESOLVER` | no | leave **unset** | leave unset | `place-resolver-factory.ts`. Unset means: production → `overture`, preview/staging/local → `google` if a key exists. Setting it to `google` on Production overrides a **terms-of-service gate** (`06` §3.1) |
| `PLACE_LOOKUP_CACHE` | no | leave unset | leave unset | `place-resolver-factory.ts`. Only `off` disables the `place_lookups` cache; anything else, including unset, leaves it on. Unused on the Overture path |
| `GOOGLE_PLACES_API_KEY` | **yes** | not needed while production resolves with Overture | set here for measurement | `place-resolver-factory.ts`. Server-only, and **the one to use** |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **yes, and browser-exposed** | **do not set** | avoid; local only | `place-resolver-factory.ts` fallback. It is compiled into the browser bundle, so anyone can read it and spend the quota — the factory's own comment says "acceptable for local work, never for a deploy" |
| `NEXT_PUBLIC_STAGE` | no | `production` | `preview` | `/healthz`, `build-info.ts` |
| `NEXT_PUBLIC_COMMIT_SHA` | no | `$VERCEL_GIT_COMMIT_SHA` | `$VERCEL_GIT_COMMIT_SHA` | `/healthz`, `build-info.ts` |

**Scope each one deliberately.** Preview and Development share `p-002-staging`; only Production
touches `p-002-prod` (README env matrix rule 1). A production Supabase value scoped to Preview is
how a preview deployment ends up writing to real user data.

**Nothing here belongs to the migration runbook.** `STAGING_DATABASE_URL`, `PROD_DATABASE_URL`,
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are operator variables that live only in a local
`.env.local`. Vercel builds never run migrations, and putting a database password in the env store
would be a real regression. See `db-migration-runbook.md` §2.

## 3. Where the values come from

- **Supabase URL / publishable / secret keys** — dashboard → the project → **Connect** / **API
  Keys**. Take them per environment: the prod project for Production, the staging project for
  Preview and Development.
- **`NEXT_PUBLIC_COMMIT_SHA`** — set it to the literal string `$VERCEL_GIT_COMMIT_SHA`; Vercel
  expands system variables referenced this way.
- **The model key** — the existing key for whichever provider `LLM_PROVIDER` names. Note the default:
  leaving `LLM_PROVIDER` unset means `anthropic`, so an `ANTHROPIC_API_KEY` must exist unless the
  variable is set to `gemini`.

**`.env.vercel.preview` in the repo root is not a recovery source.** Its publishable key is live
(verified 2026-08-26 — PostgREST answered it with a real `42501` for `anon`, which is the designed
lockdown), but `SUPABASE_SERVICE_ROLE_KEY` in it is the literal placeholder `PASTE_STAGING_...`, and
no production value is in it at all. It is a partial `vercel env pull` from an older session.

## 4. Prove it, don't assume it

A redeploy is required after adding variables — `NEXT_PUBLIC_*` are baked in at build time, so
existing deployments keep the old (absent) values.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://p-002-zeta.vercel.app/healthz   # 200, and reports the stage + commit
curl -s -o /dev/null -w '%{http_code}\n' https://p-002-zeta.vercel.app/map       # expect 307 -> /sign-in, NOT 500
curl -s -o /dev/null -w '%{http_code}\n' https://p-002-zeta.vercel.app/import    # expect 307 -> /sign-in, NOT 500
```

**A 307 on `/map` is the pass**, and it is the specific thing to look for: it means the page got far
enough to build a Supabase client, ask who the user is, and redirect. A 500 means the variables are
still not reaching the build.

Then sign in and open `/map`.

**The 2026-08-26 expectation below no longer applies.** Production's database has since been pushed
to `0026`, measured 2026-08-30 with `npm run db:status:prod`, so the missing-column failure this
paragraph predicts does not happen any more. The remaining production gap is `0028`–`0030`, the
taxonomy alignment. The original text follows as the incident record:

> **Expect it to fail at that point, and that failure is the *other*
problem, not this one:** production is still on migration `0009`, so `get-spots.ts`'s select of
`extracted_reason`, `source_url`, `address_line`, `source_dataset` and `resolution_score` has no
columns to resolve. `current-state.md` §3.0 carries both halves. Fixing the env store makes the
signed-out product work and turns the signed-in failure into an honest, diagnosable one.

**Confirmed 2026-08-28, and the list is longer than the sentence above.** The orchestrator re-read
both hosted ledgers that day: staging is at `0018`, **production is still at `0009`** — so this
paragraph was right and the `0018`-for-both claim in
`docs/evidence/deploy/production-readiness-2026-08-28.md` was wrong. At `0009`, `get-spots.ts`'s
`SAVED_PLACES_SELECT` names **seven** columns production does not have —
`saved_places.extracted_reason` (`0015`), `source_url` and `source_thumbnail_url` (`0016`), `tags`,
`why_go` and `dishes` (`0019`), plus `places.source_dataset` and `resolution_score` (`0010`) on the
nested select — and the read ends `if (error) throw error`, so signed-in `/map` **500s**.

**And the env gate and the migration gate are not independent.** Production's `save_place` has
`0007`'s **three-argument** signature; the app calls the **four-argument** form `0017` introduced
(`p_extracted_reason`). Restoring the env store alone therefore yields a production that accepts an
import and then fails at the write. The full trace, the failure mode (loud, `PGRST202` → HTTP 500 —
not a silent wrong write) and the ordered fix are in
`docs/evidence/deploy/hosted-migration-runbook-2026-08-28.md`.

## 5. Worth fixing separately

**Was true on 2026-08-28**, measured then: `/healthz` → `200 {"ok":true,"stage":"production","commit":"5e312fe"}`,
`/` → 200, `/sign-in` → 200, `/map` → **500**, `/import` → **500**. That outage ran from 2026-08-26
until the env store was filled on 2026-08-29. It is over.

**The gap it exposed is not**, and it is the reason this section survives the fix: nothing in this
repo would notice the same outage again. `/healthz` returns `ok:true` with no
environment variables set, because it deliberately reads no configuration — which was the right call
for a deploy smoke check and is useless as a health check. A check that fetched `/map` and asserted
`307` would have caught this the day it happened. That is a real gap, recorded here rather than
fixed in passing.
