# MS2 — cloud project setup

> Status: **COMPLETE 2026-08-18.** Both Supabase projects exist in `eu-central-1`, the Vercel project
> is live at **https://p-002-zeta.vercel.app** serving from `fra1`, and MS2's exit criterion
> "a public URL renders" is verified below. This file folds into `deployment.md` (MS16); the steps are
> kept because they are the reproduction instructions that document owes.

## 1. Supabase — two projects · **DONE 2026-08-18**

Create **two** projects, not one (README env matrix, rule 1: preview must never touch prod data):

| Project | Used by |
|---|---|
| `p-002-staging` | local development and every preview deploy |
| `p-002-prod` | production only |

**Region: `eu-central-1` (Frankfurt) for both projects**, matched by Vercel's function region (`fra1`
below). The latency that costs us is Vercel function ↔ Postgres, not browser ↔ Postgres: every DB
access is server-side, and one import does several *sequential* writes inside the `07` §1 budget. So
the database is co-located with the functions, and the function region is the closest one to our users
— Vercel has no Middle East region, and Frankfurt is nearest Tel Aviv (ASSUMED ~50–60 ms RTT vs
~180–220 ms to Singapore; published-figure order of magnitude, not measured). Secondary: the MS5
Overture ingest pushes ~150–180 MB from a local machine, and an EU region is the simpler answer to
"where does location data live". Both projects share one region so preview timings predict production.

No schema yet — migrations `0001`–`0009` landed in MS4 (`docs/ms4-database.md`); MS5 adds `0010`
(`docs/10-poi-index.md` §10).

From each project's API settings, record: project URL, `anon` key, `service_role` key.

## 2. Vercel — one project, two environments · **DONE 2026-08-18**

1. Import `github.com/LiorJossef/P-002` as a Vercel project. Framework preset: Next.js. Root: repo root.
2. Production branch: `main`. Every other branch gets a preview URL automatically.
   Set the **function region to Frankfurt (`fra1`)** to match Supabase — the default is US East.
3. Set env vars per the README matrix, scoping each one:

| Variable | Production scope | Preview + Development scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service key (**secret**) | staging service key (**secret**) |
| `ANTHROPIC_API_KEY` | prod key (**secret**) | dev key (**secret**) |
| `NEXT_PUBLIC_PROTOMAPS_API_KEY` | prod key, domain-restricted | dev key |
| `NEXT_PUBLIC_STAGE` | `production` | `preview` |
| `NEXT_PUBLIC_COMMIT_SHA` | `$VERCEL_GIT_COMMIT_SHA` | `$VERCEL_GIT_COMMIT_SHA` |

**None of these are needed for the MS2 deploy.** The landing page and `/healthz` read only
`NEXT_PUBLIC_STAGE` and `NEXT_PUBLIC_COMMIT_SHA`, and both fall back to a literal when unset
(`src/domain/build-info.ts`). So deploy first, prove the URL renders, then add the Supabase values
before MS5 and the Anthropic/Protomaps keys before MS7 — each one when the code that reads it exists,
which keeps an unused secret from sitting in the env store.

## 3. Prove the deploy · **DONE 2026-08-18**

Recorded result, production, commit `0962d64`:

```
$ curl -s https://p-002-zeta.vercel.app/healthz
{"ok":true,"stage":"production","commit":"0962d64"}
```

`x-vercel-id: fra1::fra1::…` on that response is the evidence the function region is Frankfurt and
therefore co-located with Postgres, which is the §1 decision actually holding. The smoke suite passes
against the deployment (4/4, mobile + desktop) with no local server started.

The reproduction commands:

```bash
curl -s https://<preview-url>/healthz   # -> {"ok":true,"stage":"preview","commit":"<sha>"}
curl -s https://<prod-url>/healthz      # -> {"ok":true,"stage":"production","commit":"<sha>"}
```

Then run the e2e smoke suite against the deployment rather than a local server:

```bash
PLAYWRIGHT_BASE_URL=https://<preview-url> npm run test:e2e
```

## 4. GitHub

Push to a GitHub repo so `.github/workflows/ci.yml` runs. No repository secrets are required — CI
lints, typechecks, proves the layer guard, unit-tests and builds without touching either cloud
project.
