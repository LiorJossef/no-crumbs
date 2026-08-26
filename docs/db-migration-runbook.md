# Database migration runbook — staging and production

> Owner: `devops-vercel`. Written 2026-08-19 as MS1–MS4 audit task 7.
> **Scope:** how a migration reaches a hosted Supabase project, and what happens when one goes wrong.
> Nothing in this file has been executed against staging or production by its author — see §6 for
> exactly what is proven and what is not.

## 1. The commands

Migrations are applied **only** through these scripts, never through the Supabase dashboard SQL editor
and never with a bare `supabase db push` (charter engineering principles; `docs/ms4-database.md` §1).

| Command | Does |
|---|---|
| `npm run db:verify` | local only: `db reset` from `0001`, the policy tests, the inventory |
| `npm run db:status:staging` / `:prod` | read-only: local vs remote migration ledger for that project ref |
| `npm run db:inventory:staging` / `:prod` | read-only structural proof against that project (safe on production) |
| `npm run db:push:staging` | apply pending migrations to `p-002-staging` |
| `npm run db:push:prod` | apply pending migrations to `p-002-prod` |

`db:push:*` is `scripts/db-push.sh <env>`, and it refuses more than it does:

1. resolves `env → project ref` from the one table in `scripts/db-env.sh`; a ref that is not 20
   lowercase letters is rejected before anything connects;
2. runs `npm run check:migrations` — the static grant guard — so a table without an explicit
   `REVOKE` from `anon` and `authenticated` never leaves the machine (`ms4-database.md` §2.3);
3. **asserts the linked project equals the named target** and, if not, prints the `supabase link`
   command and stops. It never re-links for you: a command that silently repoints itself at
   production is the defect this script exists to prevent;
4. refuses to start at all if the post-push proof could not run (connection string unset, connection
   string naming a different project, or no `psql`) — an unprovable push is not allowed to begin;
5. `supabase migration list --project-ref <ref>` as the **pre-check**, so drift is seen before a write;
6. requires the operator to **retype the project ref** (or set `DB_PUSH_CONFIRM=<ref>`);
7. `supabase db push --project-ref <ref>` — the target is named at the call site, not inherited;
8. **post-check:** the ledger again, then `supabase/tests/inventory.sql` against that same project.
   A push that lands is proven, not assumed. A failing inventory exits non-zero with the
   `PUSH APPLIED, PROOF FAILED` banner.

Everything through step 5 writes nothing. To exercise the whole wrapper without writing:

```bash
DB_PUSH_DRY_RUN=1 npm run db:push:staging     # adds --dry-run, stops before the confirmation
```

The behavioural suite (`supabase/tests/0008_policy_tests.sql`) is deliberately **not** part of any
remote command: it creates fixture `auth.users` rows (R12). There is no `db:test:prod` script and there
must never be one. Production's proof is structural; the behavioural proof is CI's.

## 2. Values the operator must supply

Project refs are **not secrets** — the ref is the hostname of the public `NEXT_PUBLIC_SUPABASE_URL` —
so both are defaulted in `scripts/db-env.sh` from `docs/ms4-database.md` §5 and a clean clone works
without them. The connection strings **are** secrets and are defaulted to nothing.

| Variable | Secret | Source | Needed for |
|---|---|---|---|
| `STAGING_DATABASE_URL` | **yes** (contains the DB password) | staging project → Connect → **session pooler** URI | `db:inventory:staging`, `db:push:staging` |
| `PROD_DATABASE_URL` | **yes** | prod project → Connect → **session pooler** URI | `db:inventory:prod`, `db:push:prod` |
| `SUPABASE_PROJECT_REF_STAGING` | no | dashboard URL `/project/<ref>`; defaults to `jfuqjzubphfhfleqnkno` | override only if the project is recreated |
| `SUPABASE_PROJECT_REF_PROD` | no | as above; defaults to `vtboskegexinvhasghri` | as above |
| `SUPABASE_ACCESS_TOKEN` | **yes** | `supabase login`, or a personal access token | the CLI's Management API calls |
| `SUPABASE_DB_PASSWORD` | **yes** | project DB password | avoids the CLI's interactive password prompt |
| `DATABASE_URL` | **yes** when remote | unset locally | `db:test` / `db:inventory` default to the local container |

These live in an untracked `.env.local` or in the shell, never in the repo, and never in Vercel's env
store — Vercel builds do not run migrations. `.env.example` carries the names and no values.

**The connection string must contain its own project ref**, and the scripts check that it does. This is
not decoration: `npm run db:inventory` falls back to `postgresql://…:54322/postgres` when
`DATABASE_URL` is empty, so an unset `PROD_DATABASE_URL` would otherwise "prove production" by passing
against the local container. That silent-pass path is closed in `scripts/db-env.sh` (`require_db_url`).

## 3. Reading the ledger, and drift

`db:status:<env>` prints one row per migration with a LOCAL and a REMOTE column:

- **LOCAL set, REMOTE empty** — pending. This is what a push applies.
- **REMOTE set, LOCAL empty** — the database is *ahead* of this checkout. **Stop.** Pull, rebase, and
  work out who applied it. Do not push; do not "fix" it by deleting the remote row.
- Both set — applied.

If the ledger and reality disagree (a file was renamed, or SQL was applied out of band), the only
sanctioned repair is `supabase migration repair --status applied|reverted <version> --project-ref <ref>`.
It edits the **history table only** and changes no schema, so it is a bookkeeping correction, never a
rollback. Hand-editing `supabase_migrations.schema_migrations` is forbidden.

## 4. Rollback posture — forward-fix only

**There are no down migrations in this repo and none will be written.** A down migration is code that
is never exercised until an incident, in the one situation where untested code is least affordable, and
`supabase db push` has no revert to run it from. The posture is therefore explicit:

> **A migration that lands badly is corrected by a new, higher-numbered migration, written in the repo,
> pushed through `npm run db:push:<env>`, and proven by the inventory post-check.** The schema only ever
> moves forward. `0011` fixing `0005`'s merge chains is this posture working as intended.

That covers every *non-destructive* mistake, which is nearly all of them: a wrong grant, a missing
revoke, a wrong policy predicate, a broken trigger, a function with a bug. Forward-fix is not a
compromise for those — it is strictly better than a revert, because the corrected state is in the
migration set and reproducible from zero.

It does **not** cover data loss. Be precise about which is which:

| Class | Recovery |
|---|---|
| Wrong grant / policy / trigger / function body | forward migration. Minutes. Fully reproducible |
| Additive DDL that should not have shipped (unused column, table) | forward migration that drops it, once no deployed app version reads it |
| `DROP`, `TRUNCATE`, `DELETE`, or a narrowing `ALTER … TYPE` on live data | **the data is gone.** No forward migration recovers it. See below |

### The named recovery path for the destructive class

The projects are free-tier: there is **no point-in-time recovery** (`ms4-database.md` §2.3 relies on
that fact for its severity assessment). So the recovery path has to be created *before* the push, by
the operator, and it is a rule rather than a tool:

1. **Any migration containing `drop`, `truncate`, `delete from`, or an `alter … type` that narrows a
   column is a destructive migration.** Before pushing one to production, take a dump and keep it
   outside the repo:
   ```bash
   pg_dump "$PROD_DATABASE_URL" -Fc -f ~/p-002-backups/prod-$(date -u +%Y%m%dT%H%M%SZ).dump
   ```
   (`supabase db dump --project-ref <ref> -f …` is the CLI equivalent and dumps schema by default;
   `--data-only` for rows.)
2. **Prove the dump restores** into a throwaway local Postgres before the push, not after:
   `pg_restore` into a scratch database, then `DATABASE_URL=<scratch> npm run db:inventory`.
3. Push. If it goes wrong, recovery is: restore that dump into a **new** Supabase project, re-point
   `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in Vercel, redeploy. Order of hours, with
   a data-loss window equal to the age of the dump. **This path has never been rehearsed** — that is
   an honest statement of posture, not a claim of readiness, and rehearsing it is a "production ready"
   checklist item.
4. Prefer to make step 3 unnecessary: split a destructive change into **expand → migrate → contract**
   across three deploys, so no single migration is the one holding the data.

### Rolling back the *application* is a different lever

Vercel rollback to a previous deployment is instant and independent of the database, and the database
does not follow it. Therefore **every migration must be backward-compatible with the currently
deployed app version**: add columns nullable or defaulted, add tables before the code that reads them,
and only remove a column in a migration pushed after the last deployment that referenced it. If that
rule holds, the app rollback is always available, which is what makes forward-fix-only acceptable.

### Two things never to do

- `supabase db reset` against a hosted project. It is a local command; there is no confirmation that
  will make it a recovery tool.
- SQL in the dashboard editor. It leaves the migration ledger lying, and the next `db push` reasons
  from a false history. If it has already happened: write the equivalent migration, then
  `migration repair --status applied` for that version, then run `db:inventory:<env>` to confirm the
  live schema matches the repo.

### If a push fails part-way

1. Change nothing. Run `npm run db:status:<env>` and `npm run db:inventory:<env>` first — the ledger
   says which files were recorded, the inventory says what the schema actually is.
2. Whether each migration file is applied in its own transaction (so a failed file leaves no partial
   objects) is **ASSUMED**, not verified here. Do not rely on it: read the inventory output.
3. Fix forward. If the failed file was partially applied, make the corrective migration idempotent
   (`if not exists`, `drop … if exists` on objects *it* created in the same failed run) and push again.

## 5. Preview deployments and production data

Preview and local share `p-002-staging`; only production uses `p-002-prod` (README env matrix, rule 1;
`ms2-cloud-setup.md` §1). `db:push:prod` is a deliberate, interactive, human act — no CI workflow has
credentials for either project, and CI proves the migration set against a throwaway local container
instead. That is the reason a preview deploy cannot touch production data, and it is why the mis-target
guard in §1 step 3 matters: the *only* thing standing between staging and production is which command
the operator types.

## 6. What is proven, and what is not

**VERIFIED locally, 2026-08-19, no hosted project written to:**

- every refusal path of `scripts/db-push.sh`: missing/unknown environment argument, malformed ref,
  `prod` requested while linked to staging (the exact audit defect — it stops with both refs printed
  and nothing pushed), and `STAGING_DATABASE_URL` unset;
- every refusal path of `scripts/db-inventory-remote.sh`: missing argument, unset connection string,
  connection string that does not name the requested project;
- the post-check plumbing end to end against a throwaway `supabase/postgres:17.6.1.064` container with
  `0001`–`0011` applied: `NOTE 0` + `PASS 1`–`PASS 8` and exit 0 on a good schema, and the
  `inventory FAILED` banner with exit 1 against an empty database. Both directions.

**Superseded in part on 2026-08-19 by audit task 13** ([`ms1-ms4-audit-handoff.md`](ms1-ms4-audit-handoff.md)
§"Staging push"): `0011`–`0013` were pushed to `p-002-staging` and proven there, ledger local ==
remote, `inventory.sql` 15/15 PASS. The paragraph below therefore describes the state *before* that
push, and the container range `0001`–`0011` above is simply the range that existed when it was run.

**Authoritative applied state, as of 2026-08-26 — supersedes the 2026-08-19 table below:**

| Project | Applied through | Proven by |
|---|---|---|
| `p-002-staging` (`jfuqjzubphfhfleqnkno`) | **`0018`** | 2026-08-26 push, ledger local == remote with no remote-only row, `inventory.sql` **15/15 PASS**, plus 22 behavioural assertions from `0008_policy_tests.sql` and a signed-in run of `/map` at both breakpoints |
| `p-002-prod` (`vtboskegexinvhasghri`) | `0009` | MS4. **Still `0009`** — the push was deferred by the owner on 2026-08-26 because `PROD_DATABASE_URL` is unset, and `db-push.sh` will not start a push it cannot prove |

**Staging had drifted, and the drift is worth reading before the next push.** On 2026-08-26 the
ledger carried `0016` under version **`0019`** (the tel-aviv branch renumbered the same file, so the
schema was right and the version number was wrong), a remote-only `0020`, and — with no ledger row at
all — an entire out-of-band transcription feature. `supabase db push` refuses to run in that state
(`LegacyDbPushMissingLocalError`) and `inventory.sql` failed its first check on the table count. The
repair was `migration repair --status applied 0016` + `--status reverted 0019 0020`, then the orphan
objects dropped once they were preserved and replay-proved
(`docs/evidence/db/orphans/README.md`), then the normal push.

**The lesson, and it is the reason §"Two things never to do" exists:** the out-of-band objects were
invisible to the ledger, so `db:status` alone would never have found them. `db:inventory:<env>` did,
on its first check. Run the inventory, not just the status.

**The 2026-08-19 table, kept for the history it explains:** staging `0013`, prod `0009`. `0010` and
`0014` were applied **nowhere**, which is what made MS5 task 1's in-place edit of `0010` legal under
`08` §9.

**NOT verified as of the entry below, i.e. before task 13:** no `db push`, no `link`, and no write of
any kind against `p-002-staging` or `p-002-prod`. The pre-check (`migration list --project-ref`) was observed once
against staging read-only and reported `0011` local-only, which is expected; that call also printed
`Initialising login role…`, i.e. the CLI provisions its own login role when given `--project-ref`.
The push path itself, the confirmation prompt against a real target, and the whole of §4's recovery
path have never been executed.
