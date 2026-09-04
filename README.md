# No Crumbs — a personal map of the places your feed recommended

**Live app:** <https://no-crumbss.vercel.app> ·
**Repository:** <https://github.com/LiorJossef/no-crumbs>

*(`P-002` is the repository codename and the working directory name; the product is No Crumbs.)*

Paste a TikTok link. The post's caption is read, place names are extracted, resolved against a
places provider, and — once you confirm them — pinned on a map that is yours and stays yours.

## What it does today

- **Import a TikTok** — paste a link, the caption is read and place names extracted, each candidate
  is shown for confirmation before anything is saved. **Nothing is written without a confirmation**,
  and an uncertain result is presented as uncertain rather than guessed at.
- **The map is the library** — saved places as pins, grouped into your own areas and countries as
  you zoom out. Tapping an area or a country opens it; the list beside the map always answers the
  same question the map does.
- **Find a place again** — a live search across names, cities and your own notes; filters for
  category, tags and whether you have been; and **natural-language search**: type
  `cafes I've been to in Israel` and it resolves to the filters the library already has, previews
  what it would show, and only narrows when you press.
- **Collections** — group places, share a collection by link, and see who added what.
- **It refuses to lie.** A place we could not resolve says so. A count on the map is the count the
  list will show. The extracted and the inferred are kept apart, everywhere.

**Not built, on purpose:** Instagram and YouTube (TikTok is the only access mechanism verified
against its terms — those links are a recognised redirect to manual add, never a failure), and any
kind of social feed. The scope boundary is [`docs/mvp-plan.md`](docs/mvp-plan.md).

**Planning documents are the source of truth**, and there are a lot of them. For a cold start read
[`docs/current-state.md`](docs/current-state.md) — what works, what is verified and how, and what is
still open. Then [`docs/mvp-plan.md`](docs/mvp-plan.md) (the plan of record) and
[`docs/00-project-charter.md`](docs/00-project-charter.md) (scope and principles).

---

## Stack

| Concern | Choice | Decided in |
|---|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript `strict` | charter |
| Data + auth | Supabase Postgres, RLS enabled **and forced** | `docs/08-place-identity.md` |
| Hosting | Vercel (preview per branch + production) | charter |
| Map | MapLibre GL JS **v6.4.1** + CARTO vector basemap (`voyager-gl-style`, keyless) | `docs/06-map-and-places-decision.md` (D2) |
| Places | **Google Places is canonical** (15/16 top-1); the self-hosted Overture index is production's ToS-gated fallback. **No Nominatim adapter exists** — D2b was superseded, not built | `docs/06` §3.1 |
| Extraction | Gemini in production, Anthropic `claude-haiku-4-5` as the code default — see the env matrix | `docs/09-extraction-and-resolution.md` (D7) |
| Sentence search | Gemini `gemma-4-26b-a4b-it`; the user's own place names never leave the device | `docs/nls-plan.md` §5.5 |
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
| `LLM_PROVIDER` | public-safe | `gemini` | `gemini` | **`gemini`** | picks the extraction adapter. The **code default is `anthropic`** — an unset value falls back to the adapter verified against the golden set, so production must set this explicitly. An unknown value throws at startup |
| `ANTHROPIC_MODEL` | public-safe | unset | unset | unset | optional override; defaults to `claude-haiku-4-5` in code |
| `GEMINI_API_KEY` | **secret** | **required** | **required** | **required** | read when `LLM_PROVIDER=gemini`, and **always** by the sentence-search route, which uses Gemini regardless of the provider setting |
| `GEMINI_MODEL` | public-safe | unset | unset | unset | optional override |
| `PLACE_RESOLVER` | public-safe | `google` | `google` | **`google`** | which provider answers a lookup. **This is the ToS-gated one** — see the note directly below the table |
| `GOOGLE_PLACES_API_KEY` | **secret** | dev key | dev key | see note | **server-only.** `place-resolver-factory.ts` throws without it when `PLACE_RESOLVER=google` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | publishable, billable | leave unset | leave unset | leave unset | A fallback read by `place-resolver-factory.ts` when the server key is absent. The prefix makes it **publishable, not published** — that module is `server-only`, so it cannot reach a client bundle as the code stands. The hazard is latent: the name invites a future client-side read. Prefer `GOOGLE_PLACES_API_KEY` |
| `PLACE_LOOKUP_CACHE` | public-safe | unset | unset | unset | any value but `off` leaves the lookup cache on; `off` costs a paid lookup per candidate |
| ~~`NEXT_PUBLIC_PROTOMAPS_API_KEY`~~ | — | — | — | — | **Dead.** Read only by `map-surface.live.tsx`, whose import is commented out in `map-surface.tsx`. Listed so nobody hunts for a key the product does not use |
| `NEXT_PUBLIC_STAGE` | public | `local` | `preview` | `production` | `domain/build-info.ts`, `/healthz` |
| `NEXT_PUBLIC_COMMIT_SHA` | public | `dev` | commit sha | commit sha | `/healthz`, so a deploy is identifiable |

> ### `PLACE_RESOLVER=google` in production, and what `docs/06` §3.1 says about it
>
> Confirmed by the owner, 2026-09-04, answering what `current-state.md` carried as an open
> question. It is recorded here rather than left in a table cell because the project's own research
> rules on it.
>
> `docs/06` §3.1 is a table of which map/resolver pairings are legally viable, labelled VERIFIED.
> The row for **MapLibre map + Google Places** reads: *"NO. Explicitly forbidden, Service Specific
> Terms §5.3 + Places policies."* Production renders MapLibre over CARTO tiles and resolves with
> Google, which is that row. The Overture fallback exists in `place-resolver-factory.ts` precisely
> so the gate can be closed by changing one variable — the gate is code on purpose.
>
> Nothing here is ambiguous or unmeasured; the finding is the project's own and it stands. Whether
> to run this way for a coursework submission with a single account and no third-party users is the
> owner's call, and it has been made. Stated plainly so that a reader of this README is not misled
> about it, and so that shipping it more widely is a decision someone takes deliberately rather than
> inherits.

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
