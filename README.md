# No Crumbs — a personal map of the places your feed recommended

**Live app:** <https://p-002-zeta.vercel.app> · **Repository:** <https://github.com/LiorJossef/P-002>

*(`P-002` is the repository codename; the product is No Crumbs.)*

Paste a TikTok link; the post's caption is read, place names are extracted, resolved against an
open places index, and — once you confirm them — pinned on a map that is yours and stays yours.

**Planning documents are the source of truth.** Start with
[`docs/00-project-charter.md`](docs/00-project-charter.md), then
[`docs/implementation-plan.md`](docs/implementation-plan.md) (the build order).
This README covers only what MS2 delivers: the toolchain, the layering, and how to run it.

---

## Stack

| Concern | Choice | Decided in |
|---|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript `strict` | charter |
| Data + auth | Supabase Postgres, RLS enabled **and forced** | `docs/08-place-identity.md` |
| Hosting | Vercel (preview per branch + production) | charter |
| Map | MapLibre GL JS **v6.4.1** + CARTO vector basemap (`voyager-gl-style`, keyless) | `docs/06-map-and-places-decision.md` (D2) |
| Places | **Google Places is canonical** (15/16 top-1); the self-hosted Overture index is production's ToS-gated fallback. **No Nominatim adapter exists** — D2b was superseded, not built | `docs/06` §3.1 |
| Extraction | Anthropic `claude-haiku-4-5`, structured output | `docs/09-extraction-and-resolution.md` (D7) |
| Tests | Vitest (unit) + Playwright (e2e, mobile-first) | `docs/implementation-plan.md` §13 |

## Local setup

**Prerequisites:** Node 22+, Docker (the local Supabase stack runs in it), and `psql` for the
database checks.

```bash
npm install                  # also installs the git hooks — see the note below
cp .env.example .env.local   # then fill in the values you need
npx supabase start           # local Postgres, Auth and Studio in Docker
npm run db:reset             # applies every migration, then seeds
npm run dev                  # http://localhost:3000
```

Sign in with the seeded demo account: **`demo@example.com` / `local-dev-preview-1234`**
(`supabase/seed.sql`).

The landing page and `/healthz` work with an empty `.env.local`, but `/map` needs the database —
skip `supabase start` and `db:reset` and you get a 500 there.

> **Run `npm install` before anything else, and not only for the packages.** The `prepare` script is
> what points `core.hooksPath` at `.githooks`. Until it has run, the pre-push hook that refuses a
> direct push to `main` does not exist, and a globally installed ESLint resolves ahead of the
> project's — which cannot read this repo's flat config. Both were observed on 2026-08-30.
> `npm run check:claude` fails loudly if the hooks are not armed.

Verify the way CI does:

```bash
npm run verify
```

That runs, in order: `lint` → `typecheck` → `check:layers` → `check:migrations` → `check:schema` →
`check:agents` → `check:claude` → `test` — **eight steps, not four**. Playwright is separate
(`npm run test:e2e`); it builds and starts the app itself, or targets a deployment when
`PLAYWRIGHT_BASE_URL` is set — which is how a preview URL is smoke-tested.

## Branching — main is protected by a hook

All work lands on a branch, through a pull request, with CI green. `npm install` points
`core.hooksPath` at `.githooks`, and `.githooks/pre-push` refuses any push to `main` (direct,
force, or delete).

GitHub-side branch protection is unavailable: rulesets are a Pro/Team feature on private
repositories, so the hook stands in for them. It is a speed bump, not a guarantee — the trade-off
and its limits are recorded in [`docs/ms3-branch-protection.md`](docs/ms3-branch-protection.md).

## Layering — a checked property, not a convention

```
src/domain/        pure TypeScript — types, errors, ports, orchestrator, canonicaliser, dedup   [checked]
src/integrations/  one adapter per port; vendor types and Zod schemas die here                  [checked]
src/ui/            presentation logic and view models; client islands are explicit              [checked]
src/app/           Next.js only — auth, rate limiting, HTTP, server actions                     [not a zone]
src/components/    React components, including the map surfaces                                 [not a zone]
src/lib/           small shared helpers, e.g. the browser Supabase client                       [not a zone]
src/proxy.ts       —                                                                            [not a zone]
```

**Read the annotations: the guard covers three of the seven entries, not all of them.**
`eslint.config.mjs` declares `no-restricted-imports` zones for `domain/`, `integrations/` and `ui/`
only. `app/` is constrained differently — every module under `app/_lib/` must declare `server-only`,
and `check:layers` asserts that too — but **`components/` and `lib/` sit outside the checked
boundary altogether**, and both hold live code. Nothing stops a module there importing an adapter
directly. That is a known gap, not a claim: the direction of dependency is maintained by review in
those two directories, and extending the zones to cover them is owed work.

`eslint.config.mjs` declares `no-restricted-imports` zones: `domain/` may not import `next/*`,
`react`, `@supabase/*`, `@anthropic-ai/*`, `maplibre-gl`, or any outer layer; `ui/` may not import an
adapter; `integrations/` may not import `app/` or `ui/`. Adapters are injected as function arguments
— there is no DI container.

`npm run check:layers` writes a deliberate `domain/` → `next/server` import, asserts ESLint rejects
it, and deletes it. It fails the build if the guard is ever weakened, so the guard itself is tested.

## Env-var matrix (course requirement M10)

`NEXT_PUBLIC_*` is inlined into the browser bundle. Everything else is server-only. There is no
third category — a secret in a `NEXT_PUBLIC_` name is a published secret.

| Variable | Exposure | Local | Preview | Production | Used by |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | staging project | staging project | prod project | browser + server Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | staging | staging | prod | same; safe because authorisation is RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | staging | staging | prod | server only; bypasses RLS. The schema has **18** `SECURITY DEFINER` functions across 14 migrations |
| `ANTHROPIC_API_KEY` | **secret** | dev key | dev key | prod key | `integrations/llm/*` only, Node runtime |
| `LLM_PROVIDER` | public-safe | `anthropic` | `anthropic` | `anthropic` | picks the extraction adapter; `gemini` is the alternative. An unknown value throws at startup |
| `ANTHROPIC_MODEL` | public-safe | unset | unset | unset | optional override; defaults to `claude-haiku-4-5` in code |
| `GEMINI_API_KEY` | **secret** | optional | optional | optional | only read when `LLM_PROVIDER=gemini` |
| `GEMINI_MODEL` | public-safe | unset | unset | unset | optional override |
| `PLACE_RESOLVER` | public-safe | `google` | `google` | `overture` | which provider answers a lookup. `docs/06` §3.1 is why production differs |
| `GOOGLE_PLACES_API_KEY` | **secret** | dev key | dev key | see note | **server-only.** `place-resolver-factory.ts` throws without it when `PLACE_RESOLVER=google` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | publishable, billable | leave unset | leave unset | leave unset | A fallback read by `place-resolver-factory.ts` when the server key is absent. The prefix makes it **publishable, not published** — that module is `server-only`, so it cannot reach a client bundle as the code stands. The hazard is latent: the name invites a future client-side read. Prefer `GOOGLE_PLACES_API_KEY` |
| `PLACE_LOOKUP_CACHE` | public-safe | unset | unset | unset | any value but `off` leaves the lookup cache on; `off` costs a paid lookup per candidate |
| ~~`NEXT_PUBLIC_PROTOMAPS_API_KEY`~~ | — | — | — | — | **Dead.** Read only by `map-surface.live.tsx`, whose import is commented out in `map-surface.tsx`. Listed so nobody hunts for a key the product does not use |
| `NEXT_PUBLIC_STAGE` | public | `local` | `preview` | `production` | `domain/build-info.ts`, `/healthz` |
| `NEXT_PUBLIC_COMMIT_SHA` | public | `dev` | commit sha | commit sha | `/healthz`, so a deploy is identifiable |

The last two need **no entry in Vercel's env store**: `next.config.ts` derives them from the
`VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` system variables Vercel sets on every build, so preview and
production label themselves correctly without two hand-scoped values that can drift. Setting either
`NEXT_PUBLIC_*` explicitly still overrides the derived value.

### Operator-only variables (not application config)

Applying migrations needs a second, smaller set that **never** goes near Vercel — see the table in
[`docs/db-migration-runbook.md`](docs/db-migration-runbook.md) §2: `STAGING_DATABASE_URL`,
`PROD_DATABASE_URL`, `DATABASE_URL`, `SUPABASE_PROJECT_REF_STAGING`, `SUPABASE_PROJECT_REF_PROD`,
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`. Nothing in `src/` reads any of them, and Vercel builds
never run migrations. Names and sources are in `.env.example`.

Rules that hold across environments:

1. **Preview never points at production data.** Preview and local share one staging Supabase
   project; production has its own. A preview deploy therefore cannot damage a demo.
2. Secrets exist only in Vercel's encrypted env store and in an untracked `.env.local`.
   `.gitignore` permits exactly one env file in the repo: `.env.example`.
3. Rotating a key is an env-store edit plus a redeploy — no code change references a literal value.

## Deployment

**Migrations** are a separate, deliberate, human act: `npm run db:push:staging` /
`npm run db:push:prod`, each bound to its own project ref, each preceded by a `migration list`
drift check and followed by the read-only inventory proof. Rollback posture is **forward-fix only**.
The runbook, including the recovery path for a destructive migration, is
[`docs/db-migration-runbook.md`](docs/db-migration-runbook.md).

Preview: every branch push builds a preview URL. Production: `main`.
`/healthz` returns `{ ok, stage, commit }` and is the deploy smoke check.
The full documented flow is owed by MS16 (`docs/deployment.md`).
