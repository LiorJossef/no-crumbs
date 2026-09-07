# Hosted migration runbook — staging `0018→0023`, production `0009→0023`

> Task `PROD-READY-2`, `devops-vercel` (Probe tier), 2026-08-28. **This extends
> [`docs/db-migration-runbook.md`](../../db-migration-runbook.md); it does not replace it.** That
> file owns the commands, the refusal paths, the drift rules and the forward-fix-only posture. This
> file is the one-off sequence for *these two pushes*, in *this* state, with the per-migration risk
> review the state demands.
>
> **Every command below is the orchestrator's.** `docs/agent-guardrails.md` §2 rule 5 forbids the
> author from running any of them, and none of them was run in producing this file. What is written
> here is derived from the migration SQL, the application source and the push wrapper — all read
> today — plus the ledger measurements the orchestrator took and recorded at
> [`docs/evidence/deploy/hosted-migration-state-2026-08-28.md`](hosted-migration-state-2026-08-28.md)
> (branch `docs/hosted-migration-state`).

---

## 0. The state this runbook assumes

| Project | Ref | Remote head | Missing | Source |
|---|---|---|---|---|
| local container | — | `0023` | — | `supabase/migrations/` read 2026-08-28 |
| `p-002-staging` | `jfuqjzubphfhfleqnkno` | `0018` | `0019`–`0023` (5) | orchestrator, `db:status:staging` |
| `p-002-prod` | `vtboskegexinvhasghri` | **`0009`** | **`0010`–`0023` (14)** | orchestrator, `db:status:prod` |

**Re-confirm before starting.** State drifts; this runbook is only valid against the table above.

```bash
npm run db:status:staging
npm run db:status:prod
```

Stop if either shows a **REMOTE row with no LOCAL counterpart** (`db-migration-runbook.md` §3).

**One thing that changed since the ledger was read, and it is not a blocker:** production is now
serving commit `5e312fe` (`origin/main` head), not `394fd43`. Measured 2026-08-28 by
`curl https://p-002-zeta.vercel.app/healthz` → `{"ok":true,"stage":"production","commit":"5e312fe"}`.
`/map` and `/import` still return **500**; the Vercel env store is still empty.

---

## 1. Preconditions — check all of these before typing a push command

| # | Precondition | How to check | Why |
|---|---|---|---|
| P1 | Working tree is at a commit that contains `0023` | `git log --oneline -1 && ls supabase/migrations \| tail -1` | `origin/main` contains `0023` (`70421d0`); **local `main` was 29 commits behind `origin/main` when this was written** — pushing from a stale checkout applies a stale migration set |
| P2 | `STAGING_DATABASE_URL` set (session pooler URI, contains the staging ref) | `scripts/db-env.sh`'s `require_db_url` refuses otherwise | `db-push.sh` step 2b refuses to *start* a push it cannot prove |
| P3 | `PROD_DATABASE_URL` set (session pooler URI, contains the prod ref) | same | same. This was the reason the 2026-08-26 prod push was deferred |
| P4 | `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` available to the CLI | `npx supabase projects list` answers | the CLI's Management API calls |
| P5 | `npm run check:migrations` passes | `db-push.sh` step 1b runs it anyway | a table without an explicit `REVOKE` never leaves the machine |
| P6 | **The link points at the project you are about to write to** | `cat supabase/.temp/project-ref` | `db-push.sh` step 2 refuses a mis-target and **will not re-link for you** |

**One local oddity, re-confirmed today and deliberately not "fixed".** The local container's
`supabase_migrations.schema_migrations` lists `0001`–**`0020`** (20 rows), while the local *schema*
already has every `0021`/`0022`/`0023` object (`poi_prefilter(text[],text[],text,text,integer)`,
`place_lookup_get`, `save_place(uuid,uuid,text,text)` — all present, measured 2026-08-28 against
`127.0.0.1:54322`). **It does not affect either push**: `supabase migration list --project-ref` and
`db push` compare the migration *directory* against the *remote* ledger, never the local one. What it
does mean is that **nothing has yet proved `0021`–`0023` replay from `0001`** — only `npm run db:reset`
would, and that destroys local seeded data, so it is the orchestrator's call and not a precondition
of these pushes. Worth knowing before reading a hosted failure as a hosted problem.

`P6` is the one that will actually stop you: the CLI was last seen linked to **staging**. Do staging
first and it costs nothing; do production first and the script stops with both refs printed.

**No new spend.** Nothing in this runbook enables billing, adds a payment method or provisions a
resource. Both pushes are DDL on existing free-tier projects. The largest object either push creates
is `poi_index`, and it is created **empty** (`0010` inserts three `poi_regions` rows and zero
`poi_index` rows) — the 9 192 kB figure in the predecessor's report is the *loaded* size on the local
container, which is a separate ingest step and not part of this runbook.

---

## 2. Staging first — `0018 → 0023`

Staging is the rehearsal for production's last five files. It is **not** a rehearsal for
`0010`–`0018`, because staging already has them; nothing you can do on staging exercises those nine
against a project that lacks them. Say that out loud before treating a green staging run as
production assurance.

```bash
# 2.1  read the ledger (writes nothing)
npm run db:status:staging

# 2.2  read the live schema (writes nothing). Expect PASS 0..9c EXCEPT where 0019-0023 objects
#      are asserted -- see the note below.
npm run db:inventory:staging

# 2.3  link, only if 2.0's check showed a different ref
npx supabase link --project-ref jfuqjzubphfhfleqnkno

# 2.4  exercise the whole wrapper, write nothing
DB_PUSH_DRY_RUN=1 npm run db:push:staging

# 2.5  the push. Retype the ref when prompted.
npm run db:push:staging
```

**Expected at 2.2, and this is important so it is not mistaken for a fault:**
`supabase/tests/inventory.sql` is written against the **head** schema, not against `0018`. Check 1
counts **eleven** tables (`0010` adds two), check 6 expects `0019`'s four normalisers and
`apply_saved_place_extraction`, and check 6b asserts `resolve_place` takes **fifteen** arguments.
So a pre-push inventory against staging at `0018` is expected to **fail on check 6** (the four
normalisers and `apply_saved_place_extraction` are absent) and to pass the rest. Run it anyway —
it is the only thing that sees out-of-band drift, which is exactly how staging's 2026-08-26 mess was
found (`db-migration-runbook.md` §6).

**`db-push.sh` step 6 runs the inventory itself after the push and exits non-zero with
`PUSH APPLIED, PROOF FAILED` if it does not pass.** That is the primary proof. The queries below are
the *secondary* proof — they name the individual objects, so a failure tells you which file did not
take rather than only that something did not.

### 2.6 Proof that each of `0019`–`0023` landed

One statement, one row per migration, `t` in every `ok` column. Read-only.

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select '0019 columns'  as check, (select count(*) = 3 from information_schema.columns
        where table_schema='public' and table_name='saved_places'
          and column_name in ('tags','why_go','dishes')) as ok
union all select '0019 normalisers', (select count(*) = 4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in ('normalize_tag','normalize_tag_list','tag_list_within','normalize_sentence'))
union all select '0019 writer', to_regprocedure('public.apply_saved_place_extraction(uuid,uuid,text[],text,text[])') is not null
union all select '0019 trigger', exists (select 1 from pg_trigger where tgname='saved_places_normalize_enrichment' and not tgisinternal)
union all select '0019 gin index', to_regclass('public.saved_places_tags_gin') is not null
union all select '0020 tlv bbox', (select min_lat=31.95 and max_lat=32.40 and min_lng=34.70 and max_lng=35.00
        and display_name='Tel Aviv & Hasharon' from public.poi_regions where id='tlv')
union all select '0021+0022 prefilter', to_regprocedure('public.poi_prefilter(text[],text[],text,text,integer)') is not null
union all select '0021 old sig gone', to_regprocedure('public.poi_prefilter(text[],text[],text,integer)') is null
union all select '0022 addr index', to_regclass('public.poi_index_address_trgm_idx') is not null
union all select '0023 cache rpcs', to_regprocedure('public.place_lookup_get(text)') is not null
        and to_regprocedure('public.place_lookup_put(text,text,text,jsonb,integer)') is not null
union all select 'no browser grant leaked', not (
        has_function_privilege('anon','public.apply_saved_place_extraction(uuid,uuid,text[],text,text[])','EXECUTE')
     or has_function_privilege('authenticated','public.apply_saved_place_extraction(uuid,uuid,text[],text,text[])','EXECUTE')
     or has_function_privilege('anon','public.poi_prefilter(text[],text[],text,text,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.poi_prefilter(text[],text[],text,text,integer)','EXECUTE')
     or has_function_privilege('anon','public.place_lookup_get(text)','EXECUTE')
     or has_function_privilege('authenticated','public.place_lookup_get(text)','EXECUTE'));
SQL
```

Any `f` is a stop. Do not proceed to production.

### 2.7 Then use it, not just query it

`working-agreement.md` §2: implemented is not done. Point a preview deployment at staging, sign in,
open `/map`, and import one real TikTok. `/map`'s select names `tags`, `why_go` and `dishes`
directly and does `if (error) throw error` (`src/app/map/_lib/get-spots.ts`), so a signed-in `/map`
that renders **is** the proof that `0019` landed in the shape the app reads.

---

## 3. Production — `0009 → 0023`, fourteen files

**Read §5's per-migration table before running anything in this section.** Fourteen files is not
five, and four of them (`0012`, `0014`, `0017`, `0022`) change or remove an object that already
exists on production.

### 3.1 The go / no-go gate

Every line must be true. If one is not, stop; none of them is a judgement call.

| # | Gate | Command / evidence | Pass condition |
|---|---|---|---|
| G1 | Staging is at `0023` and proven | `npm run db:status:staging`, §2.6 | ledger local == remote, §2.6 all `t` |
| G2 | Production's ledger has **no remote-only row** | `npm run db:status:prod` | every REMOTE row has a LOCAL counterpart |
| G3 | Production holds **no user data**, so §5's destructive column is about *behaviour*, not rows | §3.2's census | `places`, `saved_places`, `sources`, `extractions`, `imports`, `profiles`, `auth.users` all **0** |
| G4 | Production's `poi_index` does not exist yet, so `0020`'s guard cannot trip | §3.2's census | `to_regclass('public.poi_index')` is **null** at `0009` |
| G5 | The link points at **prod** | `cat supabase/.temp/project-ref` | `vtboskegexinvhasghri` |
| G6 | You have read `db-migration-runbook.md` §4 **today** | — | forward-fix only; there is no PITR |
| G7 | A dump exists, if G3 failed | §3.4 | `pg_restore` proved into a scratch database *before* the push |

**If G3 comes back non-zero anywhere, this stops being a routine push.** Production having rows
changes `0012`, `0015` and `0017`'s grant narrowing from "no user could have read that" into "a user
may already have read that", and it makes `0014`'s `drop function` a change to a live write path.
Take the dump (§3.4) and re-read §5 with rows in mind.

### 3.2 The census — run this first, it is read-only and it decides G3/G4

```bash
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select 'schema head'      as what, max(version)                              as value from supabase_migrations.schema_migrations
union all select 'poi_index exists', coalesce(to_regclass('public.poi_index')::text,'<absent>')
union all select 'auth.users',       (select count(*)::text from auth.users)
union all select 'profiles',         (select count(*)::text from public.profiles)
union all select 'places',           (select count(*)::text from public.places)
union all select 'place_provider_refs',(select count(*)::text from public.place_provider_refs)
union all select 'saved_places',     (select count(*)::text from public.saved_places)
union all select 'saved_place_sources',(select count(*)::text from public.saved_place_sources)
union all select 'sources',          (select count(*)::text from public.sources)
union all select 'extractions',      (select count(*)::text from public.extractions)
union all select 'imports',          (select count(*)::text from public.imports)
union all select 'place_lookups',    (select count(*)::text from public.place_lookups)
union all select 'save_place sigs',  (select coalesce(string_agg(pg_get_function_identity_arguments(p.oid), ' | '), '<none>')
                                        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                       where n.nspname='public' and p.proname='save_place')
union all select 'resolve_place args',(select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                                       where n.nspname='public' and p.proname='resolve_place');
SQL
```

**What the last two rows are for.** They are the evidence for §6 of the report this runbook
accompanies: at `0009`, `save_place` should read `p_place_id uuid, p_source_id uuid DEFAULT NULL,
p_note text DEFAULT NULL` — **three arguments**, where the application sends four. Record the actual
output; it is the single most decision-relevant fact about production today.

Also worth one line, because `db:inventory:prod` cannot see it and it is the thing that bit staging:

```bash
psql "$PROD_DATABASE_URL" -c "select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','p') order by 1;"
```

At `0009` this should be exactly the nine designed tables. **Anything else is out-of-band drift**,
and it must be resolved before the push, not during it (`db-migration-runbook.md` §"Two things never
to do").

### 3.3 The sequence

```bash
# 3.3.1  ledger, read-only
npm run db:status:prod

# 3.3.2  live schema, read-only. WILL FAIL at 0009 -- see the note below. Read it anyway.
npm run db:inventory:prod

# 3.3.3  census (section 3.2) -- this is what decides G3/G4

# 3.3.4  re-link from staging to prod. db-push.sh will NOT do this for you.
npx supabase link --project-ref vtboskegexinvhasghri
cat supabase/.temp/project-ref          # must print vtboskegexinvhasghri

# 3.3.5  dry run: every check, --dry-run, writes nothing
DB_PUSH_DRY_RUN=1 npm run db:push:prod

# 3.3.6  the push. Retype vtboskegexinvhasghri when prompted.
npm run db:push:prod
```

**3.3.2 is expected to fail loudly at `0009`, and that is not a reason to stop.** `inventory.sql`
check 1 requires eleven tables; production has nine, because `poi_regions` and `poi_index` arrive
with `0010`. It will raise on check 1 and stop there. Its value at this point is the *target* line it
prints and the fact that it connected to the project you think it did. The inventory that matters is
`db-push.sh`'s own post-check at step 6, **after** the push.

**Expect the push to take longer than staging's.** Fourteen files, two of which run `do $$` blocks
with post-condition assertions (`0020`, `0021`, `0022`) and one of which creates two GIN trigram
indexes (`0010`'s `poi_index_name_trgm_idx`, `0022`'s `poi_index_address_trgm_idx`). Both indexes are
built on an **empty** table, so they are effectively instant and their `ACCESS EXCLUSIVE` lock is
uncontended — but only because the table is empty, which is why §5 flags `CREATE INDEX` at all.

### 3.4 Only if G3 failed — the dump, before the push

`db-migration-runbook.md` §4 makes this a rule rather than a tool. Prove the restore *before* the
push, not after:

```bash
mkdir -p ~/p-002-backups
pg_dump "$PROD_DATABASE_URL" -Fc -f ~/p-002-backups/prod-$(date -u +%Y%m%dT%H%M%SZ).dump
# then, into a throwaway local Postgres:
createdb p002_restore_check
pg_restore -d p002_restore_check ~/p-002-backups/prod-<stamp>.dump
DATABASE_URL=postgresql://…/p002_restore_check npm run db:inventory
```

This path **has never been rehearsed in this project.** Rehearsing it is itself a
"production ready" checklist item.

### 3.5 Proof that production landed

Run §2.6's block against `"$PROD_DATABASE_URL"`, **plus** this block for the nine files staging
already had:

```bash
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
select '0010 poi tables'    as check, to_regclass('public.poi_index') is not null
                                  and to_regclass('public.poi_regions') is not null as ok
union all select '0010 pg_trgm in extensions', to_regprocedure('extensions.similarity(text,text)') is not null
union all select '0010 regions seeded', (select count(*) = 3 from public.poi_regions)
union all select '0010 poi_index empty', (select count(*) = 0 from public.poi_index)
union all select '0010 places columns', (select count(*) = 4 from information_schema.columns
        where table_schema='public' and table_name='places'
          and column_name in ('source_dataset','source_dataset_id','resolution_score','last_verified_at'))
union all select '0010 poi zero browser grant', not exists (
        select 1 from information_schema.role_table_grants
         where table_schema='public' and table_name in ('poi_index','poi_regions')
           and grantee in ('anon','authenticated'))
union all select '0011 merge chain fns', to_regprocedure('public.place_survivor_id(uuid)') is not null
                                     and to_regprocedure('public.merge_places(uuid,uuid)') is not null
union all select '0012 places col grant', (select count(*) = 10 from information_schema.column_privileges
        where table_schema='public' and table_name='places' and grantee='authenticated' and privilege_type='SELECT')
union all select '0012 provider_payload withheld', not exists (select 1 from information_schema.column_privileges
        where table_schema='public' and table_name='places' and grantee='authenticated' and column_name='provider_payload')
union all select '0013 alias trigger', exists (select 1 from pg_trigger where tgname='places_alias_required')
union all select '0014 resolve_place 15 args', to_regprocedure(
        'public.resolve_place(text,text,text,double precision,double precision,text,text,text,text,text,char,jsonb,text,text,real)') is not null
union all select '0014 old resolve_place gone', to_regprocedure(
        'public.resolve_place(text,text,text,double precision,double precision,text,text,text,text,text,char,jsonb)') is null
union all select '0015 extracted_reason col', exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='saved_places' and column_name='extracted_reason')
union all select '0015 no table-wide insert', not exists (select 1 from information_schema.role_table_grants
        where table_schema='public' and table_name='saved_places' and grantee='authenticated' and privilege_type='INSERT')
union all select '0016 source_url cols', (select count(*) = 2 from information_schema.columns
        where table_schema='public' and table_name='saved_places'
          and column_name in ('source_url','source_thumbnail_url'))
union all select '0016 source-link writer', to_regprocedure('public.apply_saved_place_source_link(uuid,uuid)') is not null
union all select '0017 save_place 4 args', to_regprocedure('public.save_place(uuid,uuid,text,text)') is not null
union all select '0017 save_place 3-arg gone', to_regprocedure('public.save_place(uuid,uuid,text)') is null
union all select '0017 exactly one save_place', (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='save_place')
union all select '0018 no PUBLIC execute', not has_function_privilege('anon','public.save_place(uuid,uuid,text,text)','EXECUTE')
union all select '0018 authenticated keeps it', has_function_privilege('authenticated','public.save_place(uuid,uuid,text,text)','EXECUTE');
SQL
```

`'0018 no PUBLIC execute'` is checked through **`anon`** deliberately: `anon` inherits `PUBLIC`, so
`has_function_privilege('anon', …)` returning false is the assertion that PUBLIC does not hold it
either. That is the exact bug shape that regressed in `0009` and again in `0017`.

Then the two ledger/inventory proofs `db-push.sh` already ran, re-read by eye:

```bash
npm run db:status:prod        # local == remote, no remote-only row
npm run db:inventory:prod     # now expected: PASS 0 .. PASS 9c, no FAIL
```

### 3.6 What is still shut after this push

A green push to production does **not** make production able to serve the batch. Two gates remain
and neither is a migration:

1. **The Vercel env store is still empty** (measured today: `/map` and `/import` 500). Owner-only.
2. **`poi_index` is still empty**, so with production gated to the Overture resolver every candidate
   returns `no_match / no_region` and persists as `llm_guess`. Loading it is
   `scripts/ingest-poi-region.sh tlv`, it opens with `delete from poi_index where region_id='tlv'`,
   and it is therefore orchestrator-only. It **must** come after `0020`, because the script asserts
   the `poi_regions` bbox equals `scripts/poi-ingest.config.json`'s and at `0010`'s seed it does not.

---

## 4. Abort procedure

### 4.1 Before the confirmation prompt

Nothing has been written. `Ctrl-C`, or type anything other than the ref. `db-push.sh` prints
`Nothing has been pushed.` and exits non-zero. There is no cleanup.

### 4.2 The push failed part-way

**Change nothing.** In this order:

```bash
npm run db:status:prod        # which files the ledger recorded
npm run db:inventory:prod     # what the schema actually is
psql "$PROD_DATABASE_URL" -c "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1;"
```

Then §3.5's proof block, to find the **last file that fully landed**. Whether each file ran in its
own transaction is recorded as ASSUMED in `db-migration-runbook.md` §4 and this runbook does not
upgrade that — but there is now one piece of positive evidence worth writing down: `0017`, `0018`,
`0019` and `0023` contain their own `begin;` / `commit;`, and `0017` and `0018` applied cleanly to
staging on 2026-08-26. A CLI that wrapped each file in its own outer transaction would have hit
`there is already a transaction in progress` on the inner `begin`, and the inner `commit` would have
ended the outer one. So the CLI is evidently **not** adding an outer transaction of its own.

**Consequence you must plan for:** the ten files without `begin;`/`commit;` — `0010`–`0016`,
`0020`, `0021`, `0022` — are only atomic to the extent psql's own statement handling makes them.
`0010` in particular creates two tables, three indexes, a seed insert and an `alter table` on
`places` as separate statements. A failure inside `0010` can leave `poi_regions` present and
`poi_index` absent.

### 4.3 Recovery, by class

Straight from `db-migration-runbook.md` §4, applied to this push:

| What went wrong | Recovery | Cost |
|---|---|---|
| A grant, policy, trigger or function body is wrong | **forward migration `0024`.** The schema only moves forward | minutes; fully reproducible |
| A file partially applied and left objects behind | forward migration, made idempotent for the objects *that file* created (`if not exists`, `drop … if exists`), then push again | minutes |
| The ledger and the live schema disagree | `supabase migration repair --status applied\|reverted <version> --project-ref vtboskegexinvhasghri`. **Bookkeeping only — it changes no schema** | minutes |
| Rows were lost | **there is no recovery.** Free tier, no PITR. Restore §3.4's dump into a *new* project, re-point Vercel, redeploy | hours, and the data-loss window is the age of the dump |

**Which of the fourteen can put you in that last row: none, at G3 = all-zero.** See §5.

### 4.4 Rolling the app back is a separate, always-available lever

Vercel rollback is instant and the database does not follow it. Every one of these fourteen is
additive with respect to the currently deployed app (`5e312fe`), which reads the head schema — so a
rollback after the push leaves an app reading *fewer* objects than exist, which is safe. The reverse
is what is broken today: an app at head against a database at `0009`. See §6 of the accompanying
report.

### 4.5 Two things this runbook never authorises

- `supabase db reset` against a hosted project.
- SQL in the dashboard editor. It leaves the ledger lying and the next push reasons from a false
  history. That is precisely what happened to staging.

---

## 5. Per-migration hosted-push safety review

Read as: **D** = does it do anything destructive or irreversible · **Data** = does it assume rows a
hosted project does not have · **Grants** = does it widen anything a browser role can reach ·
**Recovery** = if this goes wrong on production, which has no PITR.

### 5.1 The five staging also needs (`0019`–`0023`)

| File | D | Data | Grants | Recovery if it goes wrong on production |
|---|---|---|---|---|
| `0019_saved_place_enrichment` | **No.** Three `add column`, all **nullable, no default, no backfill**; six `check` constraints on columns that are NULL in every existing row; one `before` trigger; one GIN index on `saved_places`. No `drop`, no `delete`, no `update`, no `alter type`. Own `begin;`/`commit;` | No. Explicitly backfills nothing | **Narrows.** No client `INSERT`/`UPDATE` grant is added for the three new columns; `EXECUTE` on the four normalisers goes to `authenticated`+`service_role` after `revoke … from public, anon, authenticated`; the writer `apply_saved_place_extraction` is `service_role` only, `SECURITY INVOKER`, and enforces ownership in its own `WHERE` | Forward-fix. Worst case is a `check` that rejects a legitimate write — a `0024` relaxing the bound. No data at risk: nothing is rewritten |
| `0020_poi_region_tlv_launch_area` | **No.** One `update` of one seeded config row + a `comment on table`. No user data | **Yes — and it is guarded, both ways.** Guard 1 raises if `poi_regions` has no `tlv`; guard 2 raises if `tlv` `is_loaded`, `row_count > 0` **or** any `poi_index` row exists for it. On production `0010` runs first in the same sequence and seeds `tlv` at the narrow bbox with `is_loaded=false, row_count=0`, and `poi_index` is created empty — so **both guards pass. The orchestrator's reading is correct.** Its own post-conditions then re-assert the bbox, that eight named launch-area towns fall inside it, and that no two regions overlap | None | Forward-fix; it is one `update` of one row. Note the header's claim that the hosted projects "are at `0009` and have never had these tables" is now **half stale** — true of prod, false of staging — but nothing in the *executable* part of the file depends on it |
| `0021_poi_prefilter_trigram` | **No.** `create or replace function` + `revoke`/`grant`. No DDL on a table | **No — and the data-dependent part is explicitly conditional.** Its behavioural check opens `if not exists (select 1 from public.poi_index where region_id='tlv' and name_norm='bellboy') then raise notice 'skipping' ; return; end if`. On an empty index it skips and the migration succeeds | **Narrows.** `revoke … from public, anon, authenticated` then `grant execute … to service_role`, then a post-condition that *asserts* `anon` and `authenticated` cannot execute it | Forward-fix. `create or replace` on a function has no data consequence |
| `0022_poi_prefilter_address_arm` | **Yes, technically — and it is the safe kind.** `drop function if exists public.poi_prefilter(text[],text[],text,integer)` removes **the 4-arg function `0021` created three minutes earlier in the same push**. It is not a table, holds no data, and is not reachable from any deployed app version (the app calls the 5-arg form). Also `create index if not exists … using gin (address_line …)` — an `ACCESS EXCLUSIVE` lock, taken on an **empty** table, non-concurrent because the file may run inside a transaction | **No.** Behavioural checks open `if not exists (select 1 from public.poi_index where region_id='tlv' limit 1) then raise notice 'skipping'; return; end if` | **Narrows.** Grants do not survive the drop, so the `revoke … from public` / `grant … to service_role` pair is re-issued, in that order, and re-asserted | Forward-fix. The `drop` is of an object created in the same sequence; nothing references it. **The one thing to watch is the index lock** — harmless on an empty `poi_index`, and the reason §3.6 insists the ingest comes *after* the schema |
| `0023_place_lookup_cache_rpcs` | **No.** Two `create or replace function`, `revoke`/`grant`, one `revoke all on public.place_lookups from anon, authenticated`. The `delete from public.place_lookups` is **inside `place_lookup_put`'s body** — it is not executed at push time, and when it does run it is bounded (`limit 200`) and filtered to already-expired rows. Own `begin;`/`commit;` | No. `place_lookups` was created by `0007`; both projects have it | **Narrows.** `service_role` only, plus an explicit table-level revoke from the browser roles | Forward-fix. `place_lookups` is a cache: even total loss of its contents costs provider calls, not user data |

### 5.2 The nine production also needs (`0010`–`0018`)

| File | D | Data | Grants | Recovery if it goes wrong on production |
|---|---|---|---|---|
| `0010_poi_index` | **No, but it is the widest file in the set.** Creates `extensions` schema if absent, `create extension if not exists pg_trgm`, two tables, three indexes (one GIN trigram), a three-row seed `insert`, and `alter table public.places add column source_dataset, source_dataset_id, resolution_score, last_verified_at` — **all four nullable, no default, no `NOT NULL`, no backfill.** No `drop`, no `delete`, no `alter type` | No. Both tables are created empty; the only `insert` is its own `poi_regions` seed | **Narrows, and it is the model.** `enable`+`force` RLS on both new tables, `revoke all … from anon, authenticated`, `grant select/insert/update/delete … to service_role`, and **no policy at all** — deliberate: browser roles hold nothing on the POI tables (`10` §6, `06` §11 Q6) | Forward-fix for everything except the extension. `create extension` needs elevated rights; if it fails, the migration stops and nothing downstream applies. **This is the file most likely to fail part-way on production** (ten statements, no `begin;`/`commit;`) — see §4.2. It also touches `places`, which at G3 = 0 rows holds nothing to lose |
| `0011_merge_chains_and_invariant_scope` | **No at push time.** The `update`/`delete` statements are inside `merge_places`'s body, not executed. Two constraint triggers created; one `drop policy if exists extractions_select_via_source_membership` immediately followed by `create policy` of the same name — a replace, not a removal | No | **Replaces one `SELECT` policy on `extractions`.** That is the one line in this file `security-privacy` should read as a diff rather than as a description — the file's intent is to *narrow* the scope of the invariant, and the new policy is what the head-schema `inventory.sql` check 2 asserts | Forward-fix. The window where the policy does not exist is inside the file; if the file fails between the `drop` and the `create`, `extractions` has **no SELECT policy** for `authenticated` — which fails closed (RLS is `force`d), not open. Re-push or `0024` restores it |
| `0012_places_column_grant_and_service_role_matrix` | **No.** Pure `revoke`/`grant` | No | **Narrows, and this is the one with a real security delta on production today.** `0008` granted `authenticated` **table-wide `SELECT` on `places`**; `0012` revokes that and re-grants a closed ten-column list. The columns it takes away are `name_key`, `provider_payload`, `provider_fetched_at`, `merged_into_place_id`, `created_at`, `updated_at` — **`provider_payload` is the raw provider response** and `security.md` §2.6 says it must not reach a browser. Production is running the pre-`0012` grant **today**. See §5.3 | Forward-fix; grants are instantly reversible in either direction, and no data moves |
| `0013_alias_invariant_tombstone_branch` | **No.** One `create or replace function` (a trigger function) + `revoke` | No | Narrows (`revoke … from public, anon, authenticated`) | Forward-fix |
| `0014_resolve_place_provenance` | **Yes, in the same safe sense as `0022`.** `drop function public.resolve_place(text,text,…,jsonb)` — **unqualified `drop`, not `drop if exists`** — then `create function` with three more parameters. No table, no rows. The `delete from places where id = v_new_place_id` inside the body is the existing aliasless-orphan cleanup, not a push-time statement | No | Same shape as before: `revoke … from public, anon, authenticated`, `grant execute … to service_role` | Forward-fix. **But note the unqualified `drop`:** if production's 12-arg `resolve_place` is not exactly the signature the file names, the `drop` errors and the file stops. That is the good failure — it means production's `resolve_place` is not what the repo thinks. §3.2's census answers it in advance |
| `0015_places_provenance_grant_and_saved_place_reason` | **No.** One nullable `add column` (`saved_places.extracted_reason`), plus grants | No | **Mixed, and both halves matter.** *Widens by design:* `grant select (source_dataset, resolution_score, last_verified_at) on public.places to authenticated` — three of the four columns `0010` added, deliberately readable so the UI can show provenance. *Narrows:* `revoke insert on public.saved_places from authenticated` (which `0008` had granted **table-wide**) replaced by a closed column list | Forward-fix |
| `0016_saved_place_denormalized_source_link` | **No.** Two nullable `add column`, two `create or replace function` | No | **Widens, once, and it is the reviewed exception.** `grant execute on function public.apply_saved_place_source_link(uuid,uuid) to authenticated` on a `SECURITY DEFINER` function. `agent-guardrails.md` §5 rule 18 names this as **the one blessed exception**: it reads `auth.uid()` itself rather than taking a user id, writes a fixed two-column list, and requires the caller to already own the link. `inventory.sql` check 6 asserts it. Also `revoke all on function public.save_place(uuid,uuid,text) from anon` | Forward-fix |
| `0017_saved_place_extracted_reason_writer` | **Yes, same safe class.** `drop function if exists public.save_place(uuid,uuid,text)` then `create or replace` the 4-arg form. **This is the signature change the application depends on** — see §6 of the report | No | **Mixed.** *Widens:* `grant insert (extracted_reason) on public.saved_places to authenticated` — the deliberate, documented scar (`current-state.md` §3.4): `save_place` is `SECURITY INVOKER`, so an invoker-mode `INSERT` is bound by the caller's column grants, and the column had to be granted back. RLS still bounds it to the caller's own row. *Narrows:* `revoke insert, select on public.saved_place_sources from authenticated` replaced by closed column lists | Forward-fix. The `drop`/`create` pair leaves a window with **no** `save_place`; the app fails loudly there (`PGRST202` → `internal` → HTTP 500), it does not silently write something else |
| `0018_save_place_revoke_public_execute` | **No.** One `revoke all … from public, anon, authenticated`, one `grant execute … to authenticated` | No | **Narrows.** It closes the `PUBLIC EXECUTE` that `0017` reopened by creating a new function (Postgres grants `EXECUTE` to `PUBLIC` on every newly created function, and `revoke … from anon` does not remove a privilege held through `PUBLIC`) | Forward-fix. **Production is not exposed by its absence today** — production never received `0017`, so it never received the bug; it still holds the 3-arg `save_place` under `0009`'s `revoke all on all functions in schema public from public, anon, authenticated`. The two files must nonetheless land **in the same push**, because `0017` re-opens the hole and only `0018` closes it |

### 5.3 The one item to hand to `security-privacy`

Production, at `0009`, is running with **`grant select on public.places to authenticated`** —
table-wide (`0008_revoke_hosted_defaults.sql`). The head schema replaced that with a closed
ten-column list in `0012`. The delta is six columns, of which the material one is
**`places.provider_payload`** — the raw provider response, which `docs/security.md` §2.6 requires to
be withheld from browser roles, and which `inventory.sql` check 5 asserts by name.

**Is production exposed today? Almost certainly not, for two reasons, and both should be confirmed
rather than assumed:**

1. **Row scope still holds.** `places_select_if_saved` (`0006`) is unchanged on production, RLS is
   `force`d, and it restricts `authenticated` to places the caller has saved. The `0012` gap is a
   *column*-scope gap inside an already row-scoped set, not an open table.
2. **There is nothing to read.** The census (§3.2) is expected to return `places = 0` and
   `auth.users = 0`. No row has ever existed, so no `provider_payload` has ever been served.

**Confirming command, and the exact output that would refute the above** — orchestrator, not me:

```bash
psql "$PROD_DATABASE_URL" -c "
  select grantee, privilege_type from information_schema.role_table_grants
   where table_schema='public' and table_name='places' and grantee in ('anon','authenticated');
  select count(*) as places_rows from public.places;
  select count(*) as users from auth.users;
  select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
    from pg_policy where polrelid = 'public.places'::regclass;"
```

- **Expected:** one row `authenticated | SELECT`, `anon` absent; `places_rows = 0`; `users = 0`; one
  policy `places_select_if_saved`, `polcmd = r`, with a `USING` clause referencing `saved_places` and
  `auth.uid()`.
- **Refuted if:** `places_rows > 0` **with** `users > 0` — then a real user could have read
  `provider_payload` for their own saved places, and `0012` becomes urgent independently of the
  batch. Still not a cross-user read; the row scope is a separate control and it is intact.
- **Stop-the-line if:** `anon` appears in the grant list at all, or `pg_policy` returns no row for
  `public.places` while `relforcerowsecurity` is true (fail-closed) or false (fail-open — that would
  be a genuine open table).

Same shape, lower severity, for the two other pre-narrowing grants production holds: **table-wide
`INSERT` on `saved_places`** (closed by `0015`) and **table-wide `INSERT`/`SELECT` on
`saved_place_sources`** (closed by `0017`). Both are bounded by RLS to the caller's own rows, so the
exposure is "a user can write columns of their own row that the product does not intend them to
write" — the same class as the documented `extracted_reason` scar, not a cross-user read.

---

## 6. What this runbook could not verify, and who can

| Question | Why not here | Command that settles it |
|---|---|---|
| Production's actual ledger head, table list and row counts | `agent-guardrails.md` §2 rule 5 forbids `db:inventory:prod`, `db:status:prod` and any connection using `PROD_DATABASE_URL` | §3.2's census, `npm run db:status:prod` |
| Production's actual `save_place` and `resolve_place` signatures | same | the last two rows of §3.2's census |
| Whether `supabase db push` wraps each file in a transaction | not observable without a hosted push | read the CLI output on the staging push; §4.2 records the positive evidence that it does **not** add an outer transaction |
| Whether the Vercel env store now has values | rule 7 forbids `vercel env` | `npx vercel env ls production --project p-002` (and `preview`, `development`) |
| How long the fourteen-file push takes | never run | it will be in the staging and prod push output; record it here afterwards |

---

## 7. The RPC signature gap — why the env gate and the migration gate are not independent

**This outranks everything above it.** It decides whether the ~100-TikTok batch can be attempted at
all, and it is invisible to `db:status`, to CI, and to any check that only compares column lists.

Two of the functions the import path calls **changed signature inside the `0010`–`0023` gap**. The
application on `main` is written against the head signatures. Production has the `0009` ones.

### 7.1 The four RPCs the import path calls, and where each stands

Call sites read from `origin/main` (`git show origin/main:<path>`), not from the working tree —
several `src/` files are mid-edit by another stream today.

| RPC | Call site | Args the app sends | Production has (`0009`) | Local/staging head | Verdict |
|---|---|---|---|---|---|
| `start_import` | `src/app/api/imports/probe/route.ts:542` | `p_user_id, p_platform, p_platform_source_id, p_canonical_url` | `0007`: **identical** | unchanged since `0007` | **OK.** Unchanged by any migration in the gap |
| `resolve_place` | `src/integrations/supabase/place-store.ts:152` | **15** named: the 12 from `0007` **plus `p_source_dataset`, `p_source_dataset_id`, `p_resolution_score`** | `0007`: **12 args**, no provenance trio | `0014`: 15 args | **BROKEN on production.** `0014` is the fix |
| `save_place` | `src/integrations/supabase/place-store.ts:191` | **4** named: `p_place_id, p_source_id, p_note, p_extracted_reason` | `0007`: **3 args** (`p_place_id, p_source_id, p_note`) | `0017`: 4 args | **BROKEN on production.** `0017` is the fix |
| `apply_saved_place_extraction` | `src/integrations/supabase/place-store.ts:110` | `p_saved_place_id, p_user_id, p_tags, p_why_go, p_dishes` | **does not exist** | `0019` | Absent on **both** hosted projects. **Degrades silently by design** — see 7.3 |

Two more exist but are unreachable on production today:

| RPC | Call site | Note |
|---|---|---|
| `poi_prefilter` | `src/integrations/supabase/place-resolver.ts:317` — 5 named args | `0021` creates a 4-arg form, `0022` replaces it with the 5-arg form the app sends. **Unreachable on production**: the Overture adapter's `loadedRegions()` filters `.eq('is_loaded', true)`, and with `poi_index` absent/empty it short-circuits to `no_match / reason: 'no_region'` before the RPC is called. It becomes reachable the moment the index is loaded — which is why the ingest must come after `0022`, not before |
| `place_lookup_get` / `place_lookup_put` | `src/integrations/supabase/place-lookup-store.ts` | `0023`. Only used on the Google path, which production is gated away from. **Degrades silently by design** — see 7.3 |

### 7.2 What a production save does today — loud, not silent. VERIFIED.

The failure mode is the whole question, so it was measured rather than reasoned about. Against the
**local** PostgREST (`http://127.0.0.1:54321`, schema at head), an RPC call carrying an argument
name no overload declares:

```
POST /rest/v1/rpc/save_place
{"p_place_id":"…","p_source_id":null,"p_note":null,"p_nonexistent_arg":null}
→ {"code":"PGRST202",
   "message":"Could not find the function public.save_place(p_nonexistent_arg, p_note, p_place_id, p_source_id) in the schema cache",
   "details":"Searched for … or with a single unnamed json/jsonb parameter, but no matches were found …",
   "hint":"Perhaps you meant to call the function public.save_place(p_extracted_reason, p_note, p_place_id, p_source_id)"}
```

and the same for `resolve_place` with an unknown name among fifteen. A control call with the correct
four names returned `42501 permission denied` — i.e. the function **was** found. So:

> **PostgREST does not fall back to a narrower overload when the caller sends an argument name it
> does not have. It matches nothing and returns `PGRST202`.** There is no silent path here.

Production is the mirror image of that experiment — the app sends the *new* names to a database that
only has the *old* function — and PostgREST cannot distinguish the two cases, so `PGRST202` is what
it returns. Traced forward through `origin/main`:

1. `confirmPlace` calls `resolve_place` **first**. `resolveError` is non-null →
   `throw internal('resolve_place failed', resolveError)` (`place-store.ts:171`).
2. `internal` is `DomainErrorCode 'INTERNAL'`, `retryable: true` (`src/domain/errors.ts:201`).
3. `HTTP_STATUS_BY_ERROR_CODE.INTERNAL = 500`, and `INTERNAL` is the **only** code mapped to 500
   (`src/app/api/imports/_lib/error-reporting.ts`) — by design, so that a 500 in the logs means
   "page a human".
4. The route's outer `catch` stamps the audit row: `imports.status='failed'`,
   `error_code='INTERNAL'`, and emits one `console.error` line.
5. The user sees the client-side copy for `INTERNAL` with a retry offered. **The retry cannot
   succeed** — the signature will not change between attempts.

**So a production import today, with the env store restored, would: fetch the TikTok, extract
candidates, resolve every one to `no_region`/`llm_guess`, render a review screen — and then fail
with a generic 500 the instant the user presses confirm.** `save_place` is never even reached;
`resolve_place` fails first.

`resolve_place` is `SECURITY DEFINER` and `service_role`-only, `save_place` is `SECURITY INVOKER` and
`authenticated`-only, so neither failure is a permissions ambiguity — at `0009` the functions simply
have different shapes.

### 7.3 The two that fail *silently*, and why that is deliberate

Not every gap is loud, and the two quiet ones are quiet on purpose. Both matter for the batch:

- **`apply_saved_place_extraction` (`0019`)** — absent on staging *and* production. `applyEnrichment`
  turns any error into `ctx.log.event('saved_place.enrichment_failed', { code })` and returns
  `false`. The save succeeds; `tags`, `why_go` and `dishes` are **never written**, all three
  together. Consequence for a 100-link batch run before `0019` lands: 100 saved places with no
  enrichment, and nothing on the screen says so. `imports` carries no field for it — the only
  evidence is the log line, and see §8 for how long that survives.
- **`place_lookup_get` / `place_lookup_put` (`0023`)** — the module's own header says *"a read
  failure is a miss and a write failure is a shrug."* Irrelevant to production (Overture path takes
  no lookup store) and expensive on staging/preview, where every repeat query spends a live request
  from the **100/day** Google Places quota instead of hitting cache.

### 7.4 The `/map` read, for completeness

`src/app/map/_lib/get-spots.ts`'s `SAVED_PLACES_SELECT` names seven columns production does not have
at `0009` — `extracted_reason` (`0015`), `source_url`, `source_thumbnail_url` (`0016`), `tags`,
`why_go`, `dishes` (`0019`), and on the nested `place:places(...)` select `source_dataset` and
`resolution_score` (`0010`). PostgREST answers a missing column with `42703`, and the read ends
`if (error) throw error`. **Signed-in `/map` 500s on production even after the env store is
restored, until `0019` lands.** Also loud.

### 7.5 The one-line conclusion for the batch

**The env gate and the migration gate are not two independent gates; they are in series.** Opening
the env store alone buys a production that renders a sign-in page and a review screen and then 500s
at the first write. The order is: env store → redeploy → `0010`–`0023` → ingest `poi_index` → one
end-to-end import verified by reading the row → then the batch.

---

## 8. Graceful failure and observability — what production would let you see

Traced from `origin/main`, not the working tree.

### 8.1 If `GOOGLE_PLACES_API_KEY` is absent in production: **nothing happens.**

`resolverProviderFor` (`src/integrations/places/place-resolver-factory.ts`) reads
`NEXT_PUBLIC_STAGE`; `NON_PRODUCTION_STAGES` is `{local, preview, staging, test}`; `production` is
not in it, so the provider is `overture` **before the key is ever looked at**. And the stage resolves
to `production` from `VERCEL_ENV` even with an empty env store (`next.config.ts`'s
`process.env.NEXT_PUBLIC_STAGE ?? process.env.VERCEL_ENV ?? 'local'`). The key is unreachable on the
production path. That is the terms-of-service gate working, and it is why setting
`GOOGLE_PLACES_API_KEY` on Production would be pointless — and why setting `PLACE_RESOLVER=google`
there would be a deliberate override of a compliance control, not a config tweak.

The only way a missing key bites production is `PLACE_RESOLVER=google` **with no key**:
`createPlaceResolver` throws `'A Google Places API key is required when PLACE_RESOLVER=google.'`
**at composition time**, outside `resolveCandidates`' per-candidate `try`. The route's outer catch
converts it to `internal(...)` → `INTERNAL` → **HTTP 500**, and the import row is stamped
`failed / INTERNAL`. Loud, and every import fails identically.

### 8.2 If the Google quota is exhausted (the staging/preview case today)

The gateway raises on `!response.ok` → `throw internal('Google Places searchText failed (429)')`
(`src/integrations/google/place-resolver.ts:207–213`). That is caught **per candidate** inside
`resolveCandidates`, which records `{ kind: 'failed', reason: 'lookup_failed' }` and carries on. The
import does **not** fail — `07` §7's asymmetry, and it is correct.

**What the user actually sees, and this is the gap.** Walking the copy functions in
`src/ui/import/candidate-resolution-view.ts`: `resolutionHeadline`, `resolutionExplanation`,
`resolutionChip` and `resolverPinLine` all return **`null`** for `kind: 'failed'`. The card falls
back to `candidate-presentation.ts`'s `locationLine` — *"Pin is approximate"* — under the
screen-level `LOCATION_CAVEAT`, *"We work out pins from what the caption said, so they can be a
street or two off."*

So a quota-exhausted lookup is **visually identical** to "we searched and found nothing" and to "we
never looked". The candidate saves as `llm_guess`. `resolutionHeadline`'s own comment already names
this as known and deferred: *"Giving each of the four its own honest sentence is worth doing; doing
it here, untested against the screens they share, is how 'no match' and 'not checked' end up saying
the same thing."*

**`PLACE_PROVIDER_UNAVAILABLE` is computed, persisted and never shown.** When *every* attempted
lookup fails in transport, `resolveCandidates` returns
`degraded: 'PLACE_PROVIDER_UNAVAILABLE'`, `advanceImport` writes it to `imports.degraded_code`, and
the probe route returns it in the JSON. Grepping `origin/main`'s `src/components` and `src/app` for
`degraded`: the only two matches are the API route itself and one **code comment** in
`src/app/import/import-page-client.tsx` about visual contrast. **No component renders it.** The
signal exists end to end in the data and stops one layer short of the user.

### 8.3 Is there any server-side log sink on Vercel today? — **No, and this is the one to fix.**

Measured on this checkout:

- **No `vercel.json`** in the repo root.
- **No observability dependency** in `package.json` — no Sentry, no OpenTelemetry, no Axiom, no
  Logtail, no Logflare. Runtime deps are Supabase, MapLibre, React/Next and UI libraries.
- The `Logger` port is implemented inline in the route:
  `log: { event: (name, fields) => console.info(JSON.stringify({ event: name, ...fields })) }`
  (`src/app/api/imports/probe/route.ts`, `routeCtx`).

So **the only sink is Vercel's own runtime log stream.** On this plan that is ephemeral and
pull-only: no drain, no search over a batch, no alert, and nothing that survives long enough to
answer "why did import #63 fail for a real user two hours ago". *(That plan-level retention figure
is **ASSUMED** — the author cannot run `vercel env`/account commands. Orchestrator, the check is
`npx vercel logs <deployment-url>` some hours after a request and see whether the line is still
there.)*

**The good news, and it is better than the logs.** There *is* a durable, queryable, per-import audit
trail, and it is in Postgres: `public.imports` carries `status`, `stage`, `error_code`,
`degraded_code`, `attempt_count`, `ms_source`, `ms_extract`, `ms_resolve`, `candidate_count` and
`candidates jsonb` (`0003_sources.sql`). `expires_at` defaults to `now() + 24 hours` and there is an
index on it — **but nothing in this repo deletes those rows.** There is no cron, no sweeper and no
job; the column is advisory. So the audit trail is durable in practice today.

**The batch triage query the owner will actually want** — orchestrator, after the batch:

```bash
psql "$PROD_DATABASE_URL" -c "
  select status, stage, error_code, degraded_code, count(*)
    from public.imports
   where created_at > now() - interval '1 day'
   group by 1,2,3,4 order by 5 desc;
  select round(avg(ms_source)) ms_source, round(avg(ms_extract)) ms_extract, round(avg(ms_resolve)) ms_resolve,
         max(ms_source+coalesce(ms_extract,0)+coalesce(ms_resolve,0)) worst_total_ms
    from public.imports where created_at > now() - interval '1 day';
  select p.source_dataset, count(*), round(avg(p.resolution_score)::numeric,3) avg_score
    from public.places p group by 1 order by 2 desc;"
```

The third statement is the batch's pass/fail in one line: **any row with
`source_dataset = 'llm-guess'` is a place we did not actually find.**

### 8.4 What the degraded-fallback stream (`feat/resolution-never-dead-ends`) will need from the platform

Not code — this section deliberately touches none. Four operational things, in the order they bite:

1. **A distinguishable user-visible state for "the provider was unavailable" versus "we searched and
   found nothing" versus "we never looked."** Today all three render identically (§8.2). A fallback
   path that cannot be told apart from a successful no-match is not trustworthy no matter how well
   it is written.
2. **`imports.degraded_code` rendered somewhere.** The column already exists and is already written.
   Nothing reads it. That is the cheapest trustworthiness win available.
3. **A durable log sink, or an explicit decision that `imports` *is* the log.** The second is
   defensible and free, and it is what the schema already supports — but then the per-candidate
   `places.resolve` / `poi.resolve` lines that only go to `console.info` need to land somewhere
   queryable too, or the reason a *particular candidate* degraded is unrecoverable. **A log drain is
   a paid Vercel feature and therefore an owner decision, flagged here before anything is
   incurred.** The free alternative is to widen what `imports.candidates` jsonb already stores.
4. **A deploy check that fetches `/map` and asserts `307`.** `vercel-env-restore.md` §5 asked for
   this on 2026-08-26 and it still does not exist; production has now been down for two days and
   nothing in the repo noticed. `/healthz` cannot do it — it deliberately reads no configuration,
   and it returned `ok:true` throughout the outage. **This agent may not edit `.github/workflows/`
   or `scripts/check-*.sh` (`agent-guardrails.md` §4 rule 15); it is offered as a proposal for the
   orchestrator to apply.**

---

## 9. The environment-variable matrix, derived from code

Source: `grep -rn "process\.env\." src/ next.config.ts` on this checkout, cross-read against
`src/integrations/places/place-resolver-factory.ts`, `src/integrations/llm/place-extractor-factory.ts`,
`src/integrations/supabase/service-role-client.ts`, `src/app/_lib/supabase/server.ts`,
`src/lib/supabase/client.ts`, `src/proxy.ts`, `src/domain/build-info.ts` and
`src/components/map/map-surface.tsx`. **No value is printed anywhere in this file**, and `.env.local`
was not read (`agent-guardrails.md` §3 rule 9). `docs/archive/vercel-env-restore.md` §2 has been corrected to
match; this table adds the failure mode, which that one does not carry.

| Variable | Needed to serve an import in **production**? | If missing | Loud or silent | Who sets it |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes, hard** | `createServerClient(undefined, …)` throws; `/map` and `/import` 500 — including from **middleware**, so nothing behind auth works. Also fails `serviceRoleClient()` | **Loud** (500) | **owner** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes, hard** | same throw | **Loud** | **owner** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes, hard** | `serviceRoleClient()` throws *"NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set."* → `INTERNAL` → 500. The import pipeline cannot run | **Loud** | **owner** (secret) |
| `LLM_PROVIDER` | Effectively | Defaults to **`anthropic`**, so an unset value silently selects the provider whose key may not exist. The project's measured budget is the **Gemini** 500/day one | **Silent choice, loud consequence** | anyone |
| `ANTHROPIC_API_KEY` | Yes, when `LLM_PROVIDER` is `anthropic` **or unset** | `createPlaceExtractor` throws *"ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic (the default)."* → 500 at extract | **Loud** | **owner** (secret) |
| `GEMINI_API_KEY` | Yes, when `LLM_PROVIDER=gemini` | *"GEMINI_API_KEY is required when LLM_PROVIDER=gemini."* → 500 | **Loud** | **owner** (secret) |
| `ANTHROPIC_MODEL` / `GEMINI_MODEL` | No | adapter default | n/a | anyone |
| `NEXT_PUBLIC_STAGE` | No — but read it before you set it | Falls back to `VERCEL_ENV` (`next.config.ts`), so production resolves to `production` **with an empty env store**. That is what keeps the Overture gate shut. Setting it to `preview` or `staging` on Production would silently switch the resolver to Google and breach `06` §3.1 | **Silent, and consequential** | anyone — but treat as a control |
| `NEXT_PUBLIC_COMMIT_SHA` | No | falls back to `VERCEL_GIT_COMMIT_SHA`, then `'dev'` | silent, harmless | anyone |
| `PLACE_RESOLVER` | No — leave **unset** | Unset ⇒ stage decides. `google` on Production overrides a terms-of-service gate. Any value other than `google`/`overture` **throws** | **Loud on a typo, silent on `google`** | orchestrator/owner decision |
| `PLACE_LOOKUP_CACHE` | No | Only `off` disables the cache. Unused on the Overture path | silent | anyone |
| `GOOGLE_PLACES_API_KEY` | **No, on production** — the Overture gate means it is never read there. Yes on preview/staging | Missing *with* `PLACE_RESOLVER=google` ⇒ `createPlaceResolver` throws → 500 on every import. Missing *without* it ⇒ falls back to Overture with `reason: 'no Google Places API key configured'` | **Loud** in the first case, **silent** in the second | **owner** (secret) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | **No — do not set on any deploy** | Read only as a fallback to the above. It is **compiled into the browser bundle**; the factory's own comment: "acceptable for local work, never for a deploy" | silent | **owner**; the recommendation is *not to set it* |
| ~~`NEXT_PUBLIC_PROTOMAPS_API_KEY`~~ | **No — obsolete** | Read only by `map-surface.live.tsx`, which `map-surface.tsx` does not export ("Do not wire it in"). The live surface is `MapSurfaceMapcn` over CARTO's **keyless** basemap | n/a | nobody |
| `STAGING_DATABASE_URL`, `PROD_DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | **No — these must never be in Vercel** | Operator-only, `.env.local` or the shell. Vercel builds never run migrations | n/a | orchestrator, locally |

**Reproducible from a clean clone?** Almost. `.env.example` carries the names; `scripts/db-env.sh`
defaults both project refs (a ref is not a secret — it is the hostname of the public
`NEXT_PUBLIC_SUPABASE_URL`). The four secrets above and the three Supabase keys are the only things a
clean clone cannot derive, and every one of them is owner-held by design.

**Scope, restated because it is the expensive mistake:** Preview and Development point at
`p-002-staging`; only Production points at `p-002-prod`. A production Supabase value scoped to
Preview is how a preview deploy writes to real user data. After the restore, confirm it from the
built artefacts rather than from the dashboard:

```bash
# production bundle must inline the PROD ref; the preview bundle must inline the STAGING ref
curl -s https://p-002-zeta.vercel.app/sign-in | grep -oE '/_next/static/[^"]+\.js' | sort -u \
  | while read -r u; do curl -s "https://p-002-zeta.vercel.app$u"; done \
  | grep -oE '[a-z]{20}\.supabase\.co' | sort -u
```
