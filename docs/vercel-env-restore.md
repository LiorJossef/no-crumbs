# Restoring the Vercel environment variables

> Written **2026-08-26**, when production was found serving 500s because the Vercel project had **no
> environment variables at all**. This is the checklist for putting them back. It is the owner's
> job: it is credential entry into a third party, so it is not something an agent does.

## 1. What was found, and how to re-check it

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

| Variable | Secret | Production value | Preview + Development value | Read by |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | **prod** project URL (`vtboskegexinvhasghri`) | **staging** project URL (`jfuqjzubphfhfleqnkno`) | server + browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | prod publishable key | staging publishable key | server + browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | prod secret key | staging secret key | `integrations/supabase/service-role-client.ts` — the import pipeline |
| `LLM_PROVIDER` | no | `anthropic` or `gemini` | same | `place-extractor-factory.ts`; **defaults to `anthropic`** when unset |
| `ANTHROPIC_API_KEY` | **yes** | required if `LLM_PROVIDER=anthropic` (including when unset) | same | the Anthropic extractor |
| `GEMINI_API_KEY` | **yes** | required if `LLM_PROVIDER=gemini` | same | the Gemini extractor |
| `ANTHROPIC_MODEL` / `GEMINI_MODEL` | no | optional overrides | optional | the respective extractor |
| `NEXT_PUBLIC_PROTOMAPS_API_KEY` | no | prod key, domain-restricted | dev key | the map surface |
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

Then sign in and open `/map`. **Expect it to fail at that point, and that failure is the *other*
problem, not this one:** production is still on migration `0009`, so `get-spots.ts`'s select of
`extracted_reason`, `source_url`, `address_line`, `source_dataset` and `resolution_score` has no
columns to resolve. `current-state.md` §3.0 carries both halves. Fixing the env store makes the
signed-out product work and turns the signed-in failure into an honest, diagnosable one.

## 5. Worth fixing separately

Nothing in this repo notices that production is down. `/healthz` returns `ok:true` with no
environment variables set, because it deliberately reads no configuration — which was the right call
for a deploy smoke check and is useless as a health check. A check that fetched `/map` and asserted
`307` would have caught this the day it happened. That is a real gap, recorded here rather than
fixed in passing.
