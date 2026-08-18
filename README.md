# P-002 — a personal map of the places your feed recommended

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
| Map | MapLibre GL JS v5 + Protomaps tiles | `docs/06-map-and-places-decision.md` (D2) |
| Places | Self-hosted Overture index; Nominatim as a capped fallback | `docs/06` |
| Extraction | Anthropic `claude-haiku-4-5`, structured output | `docs/09-extraction-and-resolution.md` (D7) |
| Tests | Vitest (unit) + Playwright (e2e, mobile-first) | `docs/implementation-plan.md` §13 |

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values you need
npm run dev                  # http://localhost:3000
```

MS2 needs no credentials to run: the landing page and `/healthz` work with an empty `.env.local`.

Verify the way CI does:

```bash
npm run verify
```

That runs, in order: `lint` → `typecheck` → `check:layers` → `test`. Playwright is separate
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
src/ui/            React components; client islands are explicit
src/app/           Next.js only — auth, rate limiting, HTTP, NDJSON streaming, server actions
src/domain/        pure TypeScript — types, errors, ports, orchestrator, canonicaliser, dedup
src/integrations/  one adapter per port; vendor types and Zod schemas die here
```

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
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | staging | staging | prod | server only; bypasses RLS; the two `SECURITY DEFINER` functions |
| `ANTHROPIC_API_KEY` | **secret** | dev key | dev key | prod key | `integrations/llm/*` only, Node runtime |
| `NEXT_PUBLIC_PROTOMAPS_API_KEY` | public by design | dev key | dev key | prod key, domain-restricted | map tile requests |
| `NEXT_PUBLIC_STAGE` | public | `local` | `preview` | `production` | `domain/build-info.ts`, `/healthz` |
| `NEXT_PUBLIC_COMMIT_SHA` | public | `dev` | commit sha | commit sha | `/healthz`, so a deploy is identifiable |

The last two need **no entry in Vercel's env store**: `next.config.ts` derives them from the
`VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` system variables Vercel sets on every build, so preview and
production label themselves correctly without two hand-scoped values that can drift. Setting either
`NEXT_PUBLIC_*` explicitly still overrides the derived value.

Rules that hold across environments:

1. **Preview never points at production data.** Preview and local share one staging Supabase
   project; production has its own. A preview deploy therefore cannot damage a demo.
2. Secrets exist only in Vercel's encrypted env store and in an untracked `.env.local`.
   `.gitignore` permits exactly one env file in the repo: `.env.example`.
3. Rotating a key is an env-store edit plus a redeploy — no code change references a literal value.

## Deployment

Preview: every branch push builds a preview URL. Production: `main`.
`/healthz` returns `{ ok, stage, commit }` and is the deploy smoke check.
The full documented flow is owed by MS16 (`docs/deployment.md`).
