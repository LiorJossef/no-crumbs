# MS2 — cloud project setup (owner action required)

> Status: **owed.** The local half of MS2 is complete and verified; the two cloud projects and the
> first deploy need account access this repo does not have. These are the exact steps, in order.
> Once done, MS2's exit criterion "a public URL renders" is met and this file folds into
> `deployment.md` (MS16).

## 1. Supabase — two projects

Create **two** projects, not one (README env matrix, rule 1: preview must never touch prod data):

| Project | Used by |
|---|---|
| `p-002-staging` | local development and every preview deploy |
| `p-002-prod` | production only |

Region: closest to the Vercel function region, to keep the import pipeline's DB round-trips cheap.
No schema yet — migrations `0001`–`0008` land in MS5 (`docs/08-place-identity.md` §3).

From each project's API settings, record: project URL, `anon` key, `service_role` key.

## 2. Vercel — one project, two environments

1. Import this repository as a Vercel project. Framework preset: Next.js. Root: repo root.
2. Production branch: `main`. Every other branch gets a preview URL automatically.
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

`ANTHROPIC_API_KEY` and `NEXT_PUBLIC_PROTOMAPS_API_KEY` are not needed for the MS2 deploy — the
landing page and `/healthz` do not read them. Add them when MS5/MS7 need them.

## 3. Prove the deploy

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
