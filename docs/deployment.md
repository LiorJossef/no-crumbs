# Deployment, environments and local setup

> **Course requirement M10** (`docs/03-university-requirements.md`). It asks for four things: a link
> to the live app, a link to the GitHub repository, local run instructions, and an explanation of
> the required environment variables. All four are below, in that order, followed by the deploy
> pipeline, the hosted-database procedure, and an honest account of what is currently broken.
>
> **Everything in this document was measured on 2026-08-31 against commit `2fae46b` of branch
> `no-crumbs-implementation`**, except where it is explicitly labelled otherwise. Facts that came
> from a document rather than from a command are labelled. Facts I could not check from a terminal —
> anything that lives only in a Vercel dashboard — are labelled **UNVERIFIED** rather than asserted.
>
> House rule for this file: **re-measure, never copy forward.** Migration numbers and deployed
> commits go stale within days. Every table here names the command that produced it, so the reader
> can re-run it instead of trusting the number.

---

## 1. The two links

| | |
|---|---|
| **Live application** | <https://p-002-zeta.vercel.app> |
| **GitHub repository** | <https://github.com/LiorJossef/P-002> |

The repository is **private**. An examiner needs to be added as a collaborator; the URL alone will
return a 404 to a signed-out visitor. (Measured with `gh repo view`: `"visibility":"PRIVATE"`.)

Production is live and healthy. Measured 2026-08-31:

```
$ curl -s https://p-002-zeta.vercel.app/healthz
{"ok":true,"stage":"production","commit":"7494091"}

$ for p in / /sign-in /map /import; do curl -s -o /dev/null -w "$p %{http_code}\n" https://p-002-zeta.vercel.app$p; done
/         200
/sign-in  200
/map      307      <- redirect to /sign-in; a signed-out visitor is not authorised
/import   307
```

`x-vercel-id: fra1::fra1::…` on the same response is the evidence that the functions run in
Frankfurt, co-located with the Supabase projects (`docs/ms2-cloud-setup.md` §1).

---

## 2. The platforms, and what runs where

| Layer | Service | What it holds |
|---|---|---|
| Application | **Vercel**, project `p-002` | the Next.js build: static assets, server components, four API route handlers, server actions |
| Database + auth | **Supabase**, two Postgres projects | every table, every RLS policy, `auth.users`, and the `SECURITY DEFINER` functions the import pipeline calls |
| Source + CI | **GitHub**, `LiorJossef/P-002` | the repository and `.github/workflows/ci.yml` |

There are **no containers, no custom infrastructure and no `vercel.json`**. The build is the Next.js
framework preset with its defaults; `next.config.ts` is the only build configuration, and it does
two things: it maps Vercel's system variables into `NEXT_PUBLIC_*` (§4.5) and it sets four response
headers. Preferring the platform default over a configuration file is deliberate — there is nothing
here for a reviewer to reverse-engineer.

### 2.1 Three environments

| | **Local** | **Preview** | **Production** |
|---|---|---|---|
| Runs on | your machine, `next dev` | Vercel, one URL per branch push | Vercel, `main` only |
| URL | `http://localhost:3000` | `https://p-002-<hash>-….vercel.app` | `https://p-002-zeta.vercel.app` |
| Database | a **local** Supabase container (`supabase start`) | `p-002-staging` (`jfuqjzubphfhfleqnkno`) | `p-002-prod` (`vtboskegexinvhasghri`) |
| `NEXT_PUBLIC_STAGE` | `local` | `preview` | `production` |
| Place resolver | Google Places, if a key is set | Google Places, if a key is set | **Overture**, behind a terms-of-service gate |
| Seeded demo data | yes, `supabase/seed.sql` | no | no |
| Real user data | no | no | **yes** |

**Rule 1, and it is the reason there are two Supabase projects: a preview deployment must never be
able to touch production data.** Preview and Development share the staging project; only Production
is scoped to `p-002-prod`. A production Supabase value scoped to Preview would silently make every
branch preview a live write path against real rows. Scope each variable deliberately in the Vercel
env store — the scope is not a label, it is the isolation.

Note that **local development does not use the staging project by default.** The local Supabase
container is the intended local database: it is free, resettable, and comes with a seeded demo user.
Pointing `.env.local` at staging is possible and occasionally useful, but it is a deliberate choice,
not the default.

The two project refs are **not secrets** — a project ref is the hostname of the public
`NEXT_PUBLIC_SUPABASE_URL`, so they are hardcoded as defaults in `scripts/db-env.sh` and in
`package.json`, and a clean clone works without them.

### 2.2 Why the production resolver differs

`src/integrations/places/place-resolver-factory.ts` chooses the place resolver from the stage, not
from a code fork. Google Places is canonical and measurably better (15/16 top-1), but
`docs/06-map-and-places-decision.md` §3.1 is VERIFIED: Google Places content may not be presented
alongside a non-Google map. The map is MapLibre. So the factory serves Google everywhere we develop
and measure, and falls back to the self-hosted Overture index in production.

The gate fails **safe**: an unset or unrecognised `NEXT_PUBLIC_STAGE` is treated as production.
Setting `PLACE_RESOLVER=google` on Production overrides a terms-of-service boundary; it should not
be set. Whether it is currently set on production is **UNVERIFIED** — it can only be read in the
Vercel dashboard, and it is `docs/current-state.md`'s open question 7.

---

## 3. Running it locally, from a clean clone

Written for someone who has just cloned the repository and has nothing installed.

### 3.1 Prerequisites

| Tool | Version | Why | If missing |
|---|---|---|---|
| **Node.js** | **22** | the version CI pins (`.github/workflows/ci.yml`) | there is no `.nvmrc` and no `engines` field, so nothing enforces this — install 22 |
| **npm** | ships with Node 22 | | |
| **Docker Desktop**, running | any current | the local Supabase stack is containers | `supabase start` fails; the app can still be built and linted, but not used |
| **`psql`** | any | `db:test`, `db:inventory` and `check:schema` shell out to it | `brew install libpq` and put it on `PATH`. It was **not** on `PATH` on the machine this document was written on — this is a real and common gap |
| **`gh`** (GitHub CLI) | any | only for landing work (`npm run merge:pr`) | not needed to run the app |

The Supabase CLI is **not** a global install — it is a pinned devDependency (`supabase@2.115.0`),
and `scripts/db-env.sh` refuses to fall back to a globally installed one, because this repository
knows nothing about that one's version.

### 3.2 The steps

```bash
git clone https://github.com/LiorJossef/P-002.git
cd P-002

npm install                  # 1. dependencies AND the git hooks — see the trap below
cp .env.example .env.local   # 2. then fill in the values you need (§4)

npx supabase start           # 3. local Postgres + auth + Studio, in Docker
npm run db:reset             # 4. migrations 0001.. from zero, then supabase/seed.sql

npm run dev                  # 5. http://localhost:3000
```

Step 3 prints the local URLs and keys. The ones that matter (`supabase/config.toml`):

| | |
|---|---|
| API / `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | `http://127.0.0.1:54323` |
| Mail catcher | `http://127.0.0.1:54324` |

The `anon` and `service_role` keys for the local stack are printed by `supabase start` and by
`npx supabase status`. They are the standard local development keys and are not secret.

### 3.3 The trap on a fresh checkout, and why it matters

**`npm install` is not optional, and skipping it fails in two ways that do not look like a missing
install.** Measured on 2026-08-30, on this repository:

1. **The git hooks are not armed.** `package.json`'s `prepare` script is
   `git config core.hooksPath .githooks`, and `prepare` runs on `npm install` — and on nothing else.
   Until it has run, `core.hooksPath` is unset and `.githooks/pre-push` does not execute.
   `.githooks/pre-push` is the **only** thing refusing a direct push to `main`: GitHub branch
   protection is a Pro/Team feature on a private repository and is unavailable here
   (`docs/ms3-branch-protection.md`). So a fresh clone starts with `main` unprotected, silently.
2. **The wrong ESLint is on `PATH`.** With `node_modules/` absent, the `eslint` a shell resolves was
   8.35.0, which cannot read the flat-config `eslint.config.mjs` this repository ships, so
   `npm run verify` dies on its first step with an error that reads like a config bug.

`npm run check:claude` exists partly because of the first of these: it fails the build if
`core.hooksPath` is not `.githooks` or `.githooks/pre-push` is not executable, and a `SessionStart`
hook re-arms it rather than relying on install time. Run it after a clone if anything looks odd.

### 3.4 Signing in locally

Authentication is **email and password** (`supabase.auth.signInWithPassword`). `supabase/seed.sql`
creates one demo user directly in `auth.users`:

```
demo@example.com / local-dev-preview-1234
```

That user arrives with a handful of saved places wired through the full provenance chain the schema
requires — a `sources` row, an `imports` row, a `places` row with its provider alias, a
`saved_places` row and a `saved_place_sources` link — because `0006`'s deferred trigger rejects an
`origin='import'` save that has no linked source. It is the only way to get a usable row in.

Local email confirmation is off (`config.toml`: `enable_confirmations = false`), so signing **up**
with a new address also works immediately and gives you an empty library, which is the more
interesting first-run state to look at.

The local `site_url` is `http://127.0.0.1:3000`, while `npm run dev` prints `localhost:3000`. For
password sign-in this makes no difference; it would for a magic link, which this product does not
use.

### 3.5 What runs without any credentials

With an entirely empty `.env.local`, the landing page and `/healthz` render, because
`src/domain/build-info.ts` falls back to the literals `local` and `dev`. **Nothing else does.** Both
`/map` and `/import` construct a server-side Supabase client, and `createServerClient(undefined,
undefined)` throws immediately — which is exactly the failure production suffered from 2026-08-26 to
2026-08-29 when the Vercel env store was empty (`docs/vercel-env-restore.md`). If those two pages
500 rather than redirecting to `/sign-in`, the Supabase variables are not reaching the build.

### 3.6 Running the checks

```bash
npm run verify        # the local gate, in order:
                      #   lint → typecheck → check:layers → check:migrations
                      #   → check:schema → check:agents → check:claude → test
npm run test          # vitest only
npm run test:e2e      # playwright; builds and starts the app itself
npm run db:verify     # db:reset → RLS policy tests → read-only schema inventory
```

Two notes on `verify`. It writes real fixture files into `src/` while `check:layers` runs and
deletes them again, so **two concurrent runs interfere with each other** — run it once at a time.
And `check:schema` **skips rather than fails** when there is no database to talk to, printing loudly
what it left unverified; a skip is not a pass.

For Playwright, the signed-in tier of the suite needs credentials:

```bash
E2E_PASSWORD=local-dev-preview-1234 npm run test:e2e
```

Without `E2E_PASSWORD` those specs skip. Locally that is correct behaviour. In CI it is not, and
`tests/e2e/global-setup.ts` throws rather than allowing a job to report green over a suite that
skipped most of itself.

To run the suite against a deployment instead of a local build:

```bash
PLAYWRIGHT_BASE_URL=https://<preview-url> npm run test:e2e
```

The signed-in tier legitimately skips there — `seed.sql` is local-only and the hosted projects have
no demo user — and the global setup announces that rather than failing.

---

## 4. Environment variables

**Every variable in §4.1 and §4.2 was verified by grepping the code, not by copying an older
document.** The command is:

```bash
grep -rhoE "process\.env\.[A-Z_0-9]+" src/ next.config.ts | sort -u
```

It returns eighteen names on commit `2fae46b`. Three of them (`NODE_ENV`, `VERCEL_ENV`,
`VERCEL_GIT_COMMIT_SHA`) are supplied by the platform and are never set by hand, which leaves the
fifteen below.

### 4.0 The one rule, and the two names that break it

**`NEXT_PUBLIC_*` is the only prefix Next.js will inline into browser JavaScript. Everything else is
server-only. There is no third category.** A secret under a `NEXT_PUBLIC_` name that is referenced
from client code is a published secret, and renaming it afterwards does not unpublish it — it is in
every deployed bundle and in whatever cached or archived one.

Be precise about the mechanism, because the imprecise version of this rule leads to the wrong fix.
Next inlines a `NEXT_PUBLIC_*` value wherever it is referenced, but the value only reaches a browser
if the referencing module ends up in a **client** bundle. So the prefix marks a variable as
*publishable*, not as *published*: what publishes it is a reference from client code.

Two names in this codebase are worth stating explicitly:

- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is a billable API key carrying a prefix that invites
  publication.** It is read as a *fallback* by `place-resolver-factory.ts` — the factory's own
  comment calls it "acceptable for local work, never for a deploy". **`GOOGLE_PLACES_API_KEY` — no
  prefix, server-only — is the one to use**, and `apiKeyFor()` prefers it, so setting the server-only
  name makes the browser-exposed one irrelevant.
  **The exposure today is latent rather than actual, and the distinction is measured, not assumed.**
  `place-resolver-factory.ts` is its only reader in `src/` (three references, all in that file) and
  that file's first line is `import 'server-only'`, so the reference is not reachable from any client
  bundle. The hazard is therefore that the *name* invites a future client-side read, and that
  Vercel's env UI treats the prefix as a promise of publicity — not that the current build leaks it.
  Setting it on a deployment is still wrong; it is a latent incident, not a live one.
  **Measured 2026-08-31**: the production client bundle does **not** contain it. I fetched
  `https://p-002-zeta.vercel.app/sign-in`, downloaded all 17 of its `/_next/static` chunks
  (1,065,387 bytes) and grepped for the Google key prefix `AIza`. Zero matches. The same grep found
  exactly one Supabase host, `https://vtboskegexinvhasghri.supabase.co` — the **production**
  project, which is also the proof that the Production scope is set correctly. Caveat: this covers
  the chunks reachable from `/sign-in`, which is every shared chunk but not every route's chunk.
- **`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security entirely.** It is the one key in this
  system that can read and write any user's rows. It must never acquire a `NEXT_PUBLIC_` prefix, and
  it must never be referenced from anything under `src/ui/`. It is read in exactly one file,
  `src/integrations/supabase/service-role-client.ts`.

By contrast, `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public **by design**. It identifies the project and
carries the `anon` role; it grants nothing, because authorisation is RLS, enforced in the database.
Publishing it is the intended use.

### 4.1 Application variables — the Vercel env store, and `.env.local`

| Variable | Exposure | Required? | What it is for | What breaks without it | Where to get it |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **browser** | **yes** | the Supabase project every client points at | `/map` and `/import` **500** at once; nothing signs in | Supabase dashboard → project → Connect / API keys |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **browser** | **yes** | the `anon` JWT the browser and server clients authenticate with | same as above | same place. Public by design — RLS is the authorisation |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only — SECRET** | yes, for import | the privileged server-side client the import pipeline writes through | an import cannot write; the rest of the app works | same place, under the secret/`service_role` key |
| `LLM_PROVIDER` | server only | no — **defaults to `anthropic`** | selects the extraction model adapter | nothing, but see below | you choose: `anthropic` or `gemini` |
| `ANTHROPIC_API_KEY` | **server only — SECRET** | yes **when `LLM_PROVIDER` is `anthropic` or unset** | the Claude extraction call | `place-extractor-factory.ts` throws *"ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic (the default)"*; every import fails at extraction | console.anthropic.com |
| `GEMINI_API_KEY` | **server only — SECRET** | yes **when `LLM_PROVIDER=gemini`** | the Gemini extraction call | *"GEMINI_API_KEY is required when LLM_PROVIDER=gemini"* | aistudio.google.com |
| `ANTHROPIC_MODEL` | server only | no | pins a model id instead of the code default | nothing — the code default applies | the provider's model list |
| `GEMINI_MODEL` | server only | no | as above | nothing | as above |
| `GOOGLE_PLACES_API_KEY` | **server only — SECRET** | no | the Google Places resolver's key, and **the correct name to use** | the resolver falls back to Overture, or throws if `PLACE_RESOLVER=google` was forced | Google Cloud console, Places API |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **publishable prefix, billable key** — today read only from a `server-only` module, so not in any client bundle (§4.0) | **no. Do not set it on any deployment** | a local-only fallback for the above | nothing, provided the server-only name is set | see §4.0. Prefer `GOOGLE_PLACES_API_KEY` |
| `PLACE_RESOLVER` | server only | no — **leave unset** | forces `google` or `overture`, overriding the stage rule | nothing. Setting `google` on Production overrides a **terms-of-service gate** (§2.2) | n/a — a deliberate operator choice |
| `PLACE_LOOKUP_CACHE` | server only | no — leave unset | only the literal `off` disables the `place_lookups` provider-response cache | nothing; anything other than `off`, including unset, leaves it on | n/a |
| `NEXT_PUBLIC_PROTOMAPS_API_KEY` | publishable prefix, but its only reader is not bundled | **no — do not set** | read only by `src/components/map/map-surface.live.tsx`, a `'use client'` file whose one import site (`map-surface.tsx:20`) is commented out, so it is **not wired in** | nothing. Protomaps was ruled out on 2026-08-21; the shipped map is MapLibre on CARTO's keyless basemap | n/a. Setting it is harmless; *believing the map needs it* is not |
| `NEXT_PUBLIC_STAGE` | browser | no — **derived** | `/healthz`'s `stage`, and the input to the resolver's ToS gate | falls back to `VERCEL_ENV`, then to `local` | leave unset on Vercel; see §4.5 |
| `NEXT_PUBLIC_COMMIT_SHA` | browser | no — **derived** | `/healthz`'s `commit`, so a deployment is identifiable | falls back to `VERCEL_GIT_COMMIT_SHA`, then to `dev` | leave unset on Vercel; see §4.5 |

The scoping, restated as a table, because getting it wrong is the failure that matters:

| Variable | Production scope | Preview + Development scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `p-002-prod` URL | `p-002-staging` URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod secret key | staging secret key |
| the model key | prod key | dev key |
| `GOOGLE_PLACES_API_KEY` | not needed while production resolves with Overture | set here, for measurement |

**One live foot-gun.** `LLM_PROVIDER` defaults to `anthropic` when unset, while this project's
measured provider budget is the Gemini 500-calls-a-day one. Leaving the variable unset therefore
sends traffic to the provider whose budget was not the one planned for. Set it explicitly.

### 4.2 Operator variables — never in Vercel, never in the browser

Applying migrations needs a second, smaller set. **None of these is read by anything in `src/`**
(verified by the same grep), and **Vercel builds never run migrations**, so putting a database
password into the env store would be a real regression. They live in an untracked `.env.local`, or
in the operator's shell, and nowhere else. Full detail in `docs/db-migration-runbook.md` §2.

| Variable | Secret | Needed for | Source |
|---|---|---|---|
| `STAGING_DATABASE_URL` | **yes** — contains the DB password | `db:push:staging`, `db:inventory:staging` | staging project → Connect → **session pooler** URI |
| `PROD_DATABASE_URL` | **yes** | `db:push:prod`, `db:inventory:prod` | prod project → Connect → session pooler URI |
| `DATABASE_URL` | **yes** when it names a hosted project | `db:test` / `db:inventory`; defaults to the local container when unset | leave unset for local work |
| `SUPABASE_ACCESS_TOKEN` | **yes** | the CLI's Management API calls | `supabase login`, or a personal access token |
| `SUPABASE_DB_PASSWORD` | **yes** | avoids the CLI's interactive password prompt | the project's database password |
| `SUPABASE_PROJECT_REF_STAGING` | no | overrides the default ref | defaults to `jfuqjzubphfhfleqnkno` |
| `SUPABASE_PROJECT_REF_PROD` | no | overrides the default ref | defaults to `vtboskegexinvhasghri` |

**A connection string must name its own project, and the scripts check that it does.** This is not
decoration: `npm run db:inventory` falls back to the local container when `DATABASE_URL` is empty,
so an unset `PROD_DATABASE_URL` would otherwise "prove production" by passing against a database on
your laptop. `require_db_url` in `scripts/db-env.sh` closes that silent-pass path.

### 4.3 Test, harness and workflow variables

Not application configuration. Nothing here belongs in Vercel.

| Variable | Read by | Purpose |
|---|---|---|
| `E2E_PASSWORD` | `tests/e2e/*`, `tests/manual/*` | the demo user's password. Unset → the signed-in tier skips locally, and **fails the job in CI** |
| `E2E_EMAIL` | the same | defaults to `demo@example.com` |
| `PLAYWRIGHT_BASE_URL` | `playwright.config.ts` | drive a deployment instead of starting a local server |
| `E2E_BASE_URL`, `E2E_HEADED`, `E2E_TARGET` | `tests/manual/*.manual.mjs` | the manual browser harnesses |
| `CI` | Playwright, `global-setup.ts` | set by the runner; switches on retries, `forbidOnly`, and the skip guard |
| `DB_PUSH_DRY_RUN`, `DB_PUSH_CONFIRM` | `scripts/db-push.sh` | dry-run the whole wrapper; supply the typed confirmation non-interactively |
| `ALLOW_MAIN_PUSH` | `.githooks/pre-push` | the documented, deliberate escape hatch for a direct push to `main` |
| `LIVE`, `RECOGNITION_REFRESH`, `KEEP_LOOKUP_ROW`, `EXTRACTION_DETERMINISM`, `DETERMINISM_*` | `tests/manual/*.manual.ts` | knobs on the manual provider harnesses, which call real APIs and cost money |

### 4.4 Where the values come from

- **Supabase URL, anon key, service-role key** — dashboard → the project → **Connect** / **API
  Keys**. Take them per environment: the prod project for Production, the staging project for
  Preview and Development, and `npx supabase status` for local.
- **The model key** — the console of whichever provider `LLM_PROVIDER` names.
- **`GOOGLE_PLACES_API_KEY`** — Google Cloud console, with the Places API enabled. Not required for
  production as currently configured, because production resolves with Overture.
- **Connection strings** — the project's **Connect** dialog, session-mode pooler URI. Secret.

### 4.5 The two variables you should not set on Vercel

`NEXT_PUBLIC_STAGE` and `NEXT_PUBLIC_COMMIT_SHA` need **no entry in the env store**. `next.config.ts`
derives them at build time:

```ts
NEXT_PUBLIC_STAGE:      process.env.NEXT_PUBLIC_STAGE      ?? process.env.VERCEL_ENV            ?? 'local',
NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
```

Vercel sets `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` on every build. Neither carries the
`NEXT_PUBLIC_` prefix, so neither is inlined on its own — mapping them here is what makes them
readable from a client component. Preview and production therefore label themselves correctly with
no hand-scoped values that can drift apart, an explicit value still wins if you want one, and a
non-Vercel host still works.

`docs/ms2-cloud-setup.md` §2 shows `NEXT_PUBLIC_COMMIT_SHA` being set to the literal string
`$VERCEL_GIT_COMMIT_SHA` in the dashboard. That also works — Vercel expands system variables
referenced that way — but it is redundant given the config above.

### 4.6 Rotation, and what never contains a literal

No code in this repository references a key's literal value. Rotating one is therefore an env-store
edit plus a redeploy, with no code change and no release. `.gitignore` blocks `.env.*`; the single
committed exception is `.env.example`, which carries the names and no values.

> **Disclosure.** I did not read `.env.example` while writing this document. Reading any `.env*`
> file is denied to this role by `docs/agent-guardrails.md` §2, which is the correct posture and one
> I did not work around. The list in §4.1 and §4.2 is therefore derived from the code and from
> `docs/db-migration-runbook.md`, not from the template. If `.env.example` is missing a name listed
> above, the template is the thing that is wrong.

---

## 5. The deploy pipeline

```
  branch  ─push→  GitHub  ─→  CI (4 jobs)  ─→  PR  ─→  npm run merge:pr -- <n>  ─→  main
                     │                                                                │
                     └──→ Vercel builds a PREVIEW deployment (automatic)              │
                                                                                      ↓
                                                             Vercel builds PRODUCTION (automatic)
```

**Automatic**

- Every push to any branch gets a Vercel **preview** deployment, with its own URL.
- Every commit on `main` deploys to **production**. Nothing else deploys to production.
- Every push and every pull request triggers `.github/workflows/ci.yml`.

**Not automatic — a deliberate human act each time**

- Opening the PR.
- The merge, and it must go through `npm run merge:pr -- <n>` (§5.2).
- **Every hosted database migration** (§6). No CI workflow holds credentials for either Supabase
  project, and that is what makes a preview deployment structurally unable to reach production data.
- Any change to the Vercel env store.

### 5.1 What CI checks

Four jobs, all on `ubuntu-latest`, Node 22:

| Job | Runs |
|---|---|
| `lint · typecheck · layer guard · unit` | `lint`, `typecheck`, `check:layers`, `check:migrations`, `check:schema`, `check:agents`, `check:claude`, `test` |
| `next build` | `npm run build` |
| `playwright` | `npm run test:e2e`, inside `mcr.microsoft.com/playwright:v1.62.1-noble`, with a step asserting the image tag matches the installed `@playwright/test` |
| `migrations · RLS policy tests` | starts a local Supabase (db + auth only), rebuilds the schema from `0001` with `--no-seed`, runs the RLS policy tests, then the read-only schema inventory |

The database job's value is that **the whole schema is rebuilt from zero on every run**: that
reproducibility *is* the acceptance test for the migration set. It runs unseeded because the policy
tests assert exact row counts.

**CI is the authority, not `npm run verify`.** `verify` covers one of the four jobs. Read
`gh pr checks` before claiming anything is green.

### 5.2 Why merging goes through a script

GitHub branch protection and rulesets are Pro/Team features on a private repository, so **CI is not
a merge gate on GitHub's side** — a red PR can be merged with one command and GitHub will not
object. `scripts/merge-pr.sh` *is* the gate. It refuses:

1. a PR that is not open, or is a draft;
2. a PR not targeting `main`;
3. any check that is failing **or still pending** — a pending check is not a green one;
4. **zero checks reported** — "no news" reads as green in a terminal and is not;
5. a PR GitHub does not consider cleanly mergeable;
6. a head branch whose CI ran against a stale base, i.e. one that does not contain current `main`.

It never passes `--admin` and never enables auto-merge, because both mean "land it without the
checks". It uses `--merge` rather than `--squash`, so the atomic commits arrive on `main` intact.

`.githooks/pre-push` is the second half of the same gate: it refuses a direct push to `main`, a
force-push to `main`, and a deletion of `main`. Both halves depend on `npm install` having run
(§3.3).

---

## 6. Migrations against the hosted databases

Full procedure: `docs/db-migration-runbook.md`. The short version.

Migrations are applied **only** through these scripts — never through the Supabase dashboard SQL
editor, and never with a bare `supabase db push`:

```bash
npm run db:status:staging      # read-only: local vs remote ledger
npm run db:status:prod
npm run db:inventory:staging   # read-only structural proof; safe on production
npm run db:inventory:prod
npm run db:push:staging        # applies pending migrations
npm run db:push:prod
```

`db:push:*` refuses more than it does. It resolves the environment name to a project ref from one
table, rejects a ref that is not 20 lowercase letters, runs the static grant guard, **asserts the
linked project equals the named target and stops if it does not** (it never re-links for you),
refuses to start if the post-push proof could not run, prints the remote ledger as a pre-check,
requires the operator to retype the project ref, pushes, and then re-runs the ledger and the schema
inventory as proof. `DB_PUSH_DRY_RUN=1` exercises everything up to the confirmation and writes
nothing.

**Rollback posture: forward-fix only.** There are no down migrations in this repository and none
will be written. A migration that lands badly is corrected by a new, higher-numbered migration. That
is acceptable only because every migration must stay backward-compatible with the currently deployed
app version — add columns nullable, add tables before the code that reads them, drop a column only
after the last deployment that referenced it. That rule is what keeps the Vercel rollback lever
available, since rolling the app back does not roll the database back.

It does **not** cover data loss. The projects are free-tier, so there is **no point-in-time
recovery**: a destructive migration needs a `pg_dump` taken and proven to restore *before* the push.
That path **has never been rehearsed**, which is a statement of posture, not of readiness.

### 6.1 The drift, measured

This is a real operational fact and belongs in a deployment document rather than in a private note.

| | Measured |
|---|---|
| Migrations on disk, `origin/main` | **29** — `0001`–`0030`, and `0027` does not exist |
| Migrations on disk, `no-crumbs-implementation` | **30** — `0031_place_mentions.sql` was added on the branch and has not landed |
| `p-002-staging` applied through | **`0018`** — missing `0019`–`0030` |
| `p-002-prod` applied through | **`0026`** — missing `0028`, `0029`, `0030` |

The migration counts were measured 2026-08-31 with `git ls-tree origin/main supabase/migrations/`.
The two hosted numbers were measured 2026-08-30 with `npm run db:status:staging` and
`db:status:prod`, by the orchestrator; connecting to a hosted database is outside this role's
permitted actions, so I did not re-measure them and they are carried forward with their date.

Two consequences, and both are counter-intuitive enough to be worth stating:

- **Production is eight migrations ahead of staging.** Staging is the stale environment. It is
  therefore *not* a rehearsal for a production push — pushing `0019`–`0030` to staging exercises
  eleven migrations of which production has already taken eight. Staging needs a catch-up of its
  own before it can be trusted as a rehearsal again.
- **`0027` does not exist anywhere** — not on disk, not in either database. The sequence goes `0026`
  → `0028` and the gap is unexplained. It is harmless (the CLI orders by version string, and a
  missing number is not a missing migration) but it should not be silently "fixed" by renumbering.

Do not maintain that table by memory. Run the two status scripts and paste what they say. A previous
version of it was copied forward by hand and had both projects wrong, in opposite directions.

---

## 7. Verifying a deployment

`/healthz` is the smoke check. It returns `{ ok, stage, commit }`, reads no configuration and
deliberately reveals no values:

```bash
curl -s https://p-002-zeta.vercel.app/healthz
# {"ok":true,"stage":"production","commit":"7494091"}
```

Read all three fields:

- **`ok`** — the build serves traffic.
- **`stage`** — which environment answered. `production` from the production URL and `preview` from
  a preview URL means the scoping is right. `local` from a deployment means `VERCEL_ENV` did not
  reach the build.
- **`commit`** — the seven-character SHA that is actually deployed. This is how you tell "my change
  is live" from "my change merged"; they are different questions.

**`/healthz` alone is not enough, and this is the single most important line in this section.**
During the 2026-08-26 outage it returned `ok:true` throughout, because it reads no configuration —
by design, as a build smoke check. Meanwhile `/map` and `/import` were returning 500. So always
check the two authenticated surfaces as well:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://p-002-zeta.vercel.app/map      # expect 307
curl -s -o /dev/null -w '%{http_code}\n' https://p-002-zeta.vercel.app/import   # expect 307
```

**A 307 is the pass.** It means the page got far enough to build a Supabase client, ask who the user
is, and redirect an anonymous visitor to `/sign-in`. A **500 means the Supabase variables are not
reaching the build** — the exact signature of an empty or mis-scoped env store. A redeploy is
required after adding variables: `NEXT_PUBLIC_*` values are baked in at build time, so existing
deployments keep the old (absent) ones.

`next build` does **not** fail on a missing `NEXT_PUBLIC_*`; it inlines `undefined` and carries on.
Vercel's own deployment check goes green. Every signal a PR shows can be green while the deployed
app is unusable. That is why the 307 check exists.

**A known gap, recorded rather than quietly fixed:** nothing in this repository would notice the
same outage automatically. A post-deploy check that fetched `/map` and asserted 307 would have
caught it the day it happened. It does not exist yet.

Finally, sign in and open `/map`. That is the only check that exercises the database.

---

## 8. Current state, stated honestly

Three things are wrong right now. An examiner who finds a broken pipeline that this document did not
mention should score it worse than one it disclosed.

### 8.1 GitHub Actions has not been able to start a runner since 2026-08-29

**Measured 2026-08-31 with `gh run list --limit 100`:**

| | |
|---|---|
| Last successful run | **2026-08-29 21:36 UTC** |
| Consecutive failures since | **70** |
| Shape of every failure | all four jobs, `steps: 0`, 3–5 seconds wall clock, no logs, no annotations |

`gh run view 33422335289 --json jobs` on the most recent run returns four jobs, each with a
zero-length `steps` array, started and completed within four seconds of each other.

**A job that fails in four seconds having executed no steps never started.** This is not a code
failure and no change to `ci.yml` will fix it. `.github/workflows/ci.yml` is tracked, is on `main`,
is reported active by `gh workflow list`, and defines exactly the four correct jobs. The diagnosis
is an **account-level GitHub Actions problem** — most plausibly an exhausted minutes allowance or a
spending limit on a private repository. It is diagnosed, not confirmed: the billing endpoint needs a
`user` OAuth scope the local CLI does not hold.

**What it costs.** `npm run merge:pr` correctly refuses a PR whose checks are absent or failing
(§5.2 rules 3 and 4), so **nothing can land through the intended gate while this holds**. Two PRs
(`#101`, `#102`) were merged anyway, which means for those two the gate was *bypassed rather than
passed* — do not assume everything on `main` has been verified by CI. **The local
`npm run verify` is the only gate that actually runs today.**

The unblock is an owner action, not an engineering task: check
<https://github.com/settings/billing>. Do **not** rewrite the workflow.

### 8.2 Production is 29 commits behind `main`

Measured 2026-08-31:

```
$ curl -s https://p-002-zeta.vercel.app/healthz
{"ok":true,"stage":"production","commit":"7494091"}

$ git rev-list --count 7494091..origin/main
29
```

`7494091` is `fix(collections): a way back to the map from the desktop index (#107)`, dated
2026-08-30 22:40; `origin/main` is at `5571a1e`, dated 2026-08-31 00:34. The 29 intervening commits
are documentation and configuration, so the user-visible product is not affected — but production
auto-deploys from `main`, and it has not picked them up. Whether the later deployment failed, is
queued, or was skipped is **UNVERIFIED**: it is only visible in the Vercel dashboard, and reading it
requires `vercel` CLI commands this role does not run.

### 8.3 The serverless execution ceiling is an assumption, not a measurement

**No route in `src/app/` declares `maxDuration`** (verified by grep), so the platform default
governs every function, including the import pipeline. What that default actually is on this plan
has never been measured against this project. `docs/02-risks-and-unknowns.md` §A3 records it as an
unknown, and `docs/evidence/deploy/production-readiness-2026-08-28.md` says so explicitly: the
observed 25–47 s **build** times say nothing about **request** duration.

A throwaway probe that would answer it exists, unrun, at `docs/evidence/vercel/probe/` — it tests
whether a Node route handler streams NDJSON incrementally and whether a 30-second handler completes.
It is blocked on a Vercel login. Until it runs, the ceiling is **UNVERIFIED**, and `L0-F6`, the
streaming import route, is the feature that depends on the answer. The current stand-in,
`/api/imports/probe`, is request/response rather than streaming, which is why the question has not
bitten yet.

### 8.4 A note on `.env.local` in a working checkout

`docs/current-state.md` item 14 states that this checkout has no `.env.local`, which was true when
it was written. **As of 2026-08-31 a `.env.local` is present** (confirmed by directory listing only;
its contents were not read, per §4.6). Anyone reading that item should re-check rather than assume.

---

## 9. Reproducing the cloud setup from nothing

If both cloud projects had to be recreated, this is the order. It is the procedure that was actually
followed on 2026-08-18 (`docs/ms2-cloud-setup.md`), not a plan.

1. **Two Supabase projects**, not one: `p-002-staging` and `p-002-prod`, both in **`eu-central-1`
   (Frankfurt)**. Two projects because preview must never reach production data; one region because
   the latency that costs us is Vercel function ↔ Postgres — every database access is server-side —
   and one import does several sequential writes. Sharing a region also means preview timings
   predict production.
2. **Import the GitHub repository into Vercel.** Framework preset Next.js, root the repository root,
   production branch `main`. **Set the function region to Frankfurt (`fra1`)** to match Supabase; the
   default is US East. Verify it from `x-vercel-id` on any response, not from the dashboard.
3. **Set the env vars per §4.1**, scoping each one. Deploy first and prove the URL renders before
   adding anything — the landing page and `/healthz` need no configuration — then add each value
   when the code that reads it exists, so no unused secret sits in the store.
4. **Apply the migrations** through §6's scripts, staging first, then production.
5. **Prove it** with §7: `/healthz` for the stage and commit, then the 307 on `/map` and `/import`,
   then a real sign-in.

---

## 10. What this document could not verify

Stated as limits rather than left implicit.

| Claim | Status | Why |
|---|---|---|
| Which variables are actually set in the Vercel env store, and their scopes | **UNVERIFIED** | requires `vercel env ls`, which this role does not run. The one inference available was made instead: the production **client bundle** carries the prod Supabase host and no Google key (§4.0). Note what that does not settle — the Google key's only reader is `server-only`, so its absence from the bundle is expected whether or not the variable is set |
| Whether `PLACE_RESOLVER` is set on Production | **UNVERIFIED** | as above. It is `docs/current-state.md`'s open question 7, and it matters: if set to `google`, production is serving Google-resolved coordinates on a MapLibre map, which `06` §3.1 forbids |
| The Vercel function region setting | **VERIFIED indirectly** | `x-vercel-id: fra1::fra1::…` on a live response |
| The hosted migration numbers in §6.1 | **carried forward, dated 2026-08-30** | opening a connection with `STAGING_DATABASE_URL` or `PROD_DATABASE_URL` is outside this role's permitted actions |
| The contents of `.env.example` | **not read** | denied by `docs/agent-guardrails.md` §2; see §4.6 |
| The serverless execution ceiling | **UNVERIFIED** | §8.3 |
| The cause of the CI runner failure | **diagnosed, not confirmed** | §8.1 — the billing API needs a scope the CLI does not hold |
| Whether the destructive-migration recovery path works | **never rehearsed** | §6, and stated there as posture rather than readiness |
