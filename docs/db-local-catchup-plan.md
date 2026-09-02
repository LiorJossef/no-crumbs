# Bringing the local database up to `0037` without losing the owner's saved places

**Status:** rehearsed end to end, twice, on a throwaway clone. Not executed against the real local
database. Written by `supabase-database` for task `DB-CATCHUP-1`, base commit `bb6feee`.
**The orchestrator runs this, not a specialist** (`agent-guardrails.md`).

---

## 1. The measured starting state

Re-measured on 2026-09-02 against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

| | |
|---|---|
| Files on disk | 36, `0001`–`0037`, **no `0027`** |
| Ledger rows in `supabase_migrations.schema_migrations` | 24, head recorded as `0027` |
| Recorded but no file | `0027` (`import_rate_limit`) |
| Files not recorded | `0021`, `0022`, `0023`, `0028`–`0037` |
| Rows | 4 `auth.users`, 4 `profiles`, 62 `saved_places`, 67 `places`, 56 `sources`, 62 `saved_place_sources`, 56 `extractions`, 107 `imports`, 3 `collections`, 20 `collection_items`, 10 462 `poi_index` |

### Three things the ledger does not tell you, and they change the plan

**a. `0021`, `0022` and `0023` are already applied to the database.** The ledger says otherwise, but
the objects are there and they match those files exactly:

```
poi_prefilter(p_region_ids text[], p_tokens text[], p_query_norm text, p_address_hint text, p_limit integer)   -- 0022's 5-arg signature
place_lookup_get(p_lookup_hash text)                                                                            -- 0023
place_lookup_put(p_lookup_hash text, p_provider text, p_region_id text, p_response jsonb, p_ttl_seconds integer)-- 0023
poi_index_name_trgm_idx, poi_index_address_trgm_idx                                                             -- 0021, 0022
```

All three files are written idempotently (`create or replace function`, `create index if not
exists`, `drop function if exists`), and re-running them on the clone was clean. So they can simply
be replayed; no `repair --status applied` is needed for them.

**b. `0017` is recorded under the wrong name.** The ledger row is `0017 | search_poi_index`; the file
is `0017_saved_place_extracted_reason_writer.sql`. `git log` explains it — `0017_search_poi_index.sql`
was renumbered to `0020` in `042483c`, and `0017` was reused in `cbfd147`. The database has
`save_place(uuid, uuid, text, text)`, the 4-argument form, so **the file's content is applied** and
only the `name` column is stale. The Supabase CLI keys on `version`, not `name`, so this is cosmetic
and needs no action. Left alone deliberately.

**c. The phantom `0027` is real code from an unmerged branch.** `0027_import_rate_limit.sql` exists
only on `feat/import-rate-limit` (commit `0a37593`), which is not on `no-crumbs-implementation`. It
was applied locally and left behind `public.rate_limit_events` (2 rows), `import_rate_limit_check`,
`import_usage_record` and `rate_limit_rules`. **Nothing in `src/`, `scripts/` or `supabase/tests/`
references any of them** (verified by grep) — they are orphans. Consequence: after the catch-up,
`npm run db:inventory` fails with `FAIL 1: expected 17 tables in public, found 18`. See §7.

---

## 2. What each pending migration does to existing rows

Read from the SQL, not inferred.

| | Effect on existing rows | Can it fail here? |
|---|---|---|
| `0021` poi trigram | none — replaces `poi_prefilter`, adds a name trigram index | no; already applied, idempotent |
| `0022` poi address arm | none — index + function replace | no; already applied, idempotent |
| `0023` lookup cache RPCs | none — two functions over the existing `place_lookups` table (created back in `0007`) | no |
| `0028` align tags | `update saved_places set tags = …` — maps aliases to a 15-term whitelist and **drops any tag not in it** (a row whose tags are all off-whitelist becomes `tags = NULL`) | not here; **0 rows match** |
| `0029` breakfast → brunch | `update saved_places set tags = …` | not here; **0 rows match** |
| `0030` align categories | `update places set category`, `update saved_places set category_override`; `dessert`/`bakery` → `cafe`, `shop`/`attraction`/`other` → `NULL` | not here; **0 rows match** |
| `0031` place_mentions | new empty table + RLS + FORCE + REVOKE + 3 policies + 2 RPCs | no |
| `0032` repoint_saved_place | new function only | no |
| `0033` repoint attribution | replaces that function | no |
| `0034` note first-writer-wins | replaces `save_place` | no |
| `0035` names at sign up | new empty `profile_names` table + RLS + policies; replaces `handle_new_user`. Existing users get **no** `profile_names` row — by design, not a bug | no |
| `0036` tags are the user's vocabulary | adds `tags_extracted`, `tags_confirmed_at`; **backfills `tags_extracted := tags`**; two new CHECKs on `tags_extracted`; revokes `tags` from browser roles | only if a row's `tags` violated `tag_list_within(tags,8,32)` — impossible, `tags` already carries the same CHECK |
| `0037` model prose labelled | adds `why_go_reviewed_at`, `dishes_extracted`, `dishes_confirmed_at`; **backfills `dishes_extracted := dishes`**; two new CHECKs; revokes `why_go`/`dishes` from browser roles | same shape, same reason: impossible |

**Nothing here can fail against the current rows.** There is no new `NOT NULL` without a default, no
new unique index over populated columns, and every new CHECK is a duplicate of one the source column
already satisfies. Confirmed by a read-only dry run on the real database on 2026-09-02:

```
0028 rows that would change                       | 0
0029 rows that would change                       | 0
0030 places that would change                     | 0
0030 saved_places that would change               | 0
0036 tags_extracted backfill would violate bound  | 0
0037 dishes_extracted backfill would violate bound| 0
```

Re-run that dry run (§4 step 0) immediately before the real catch-up — the local database is being
written to by live work, so the numbers can drift.

---

## 3. Recommendation: apply in place. Do **not** dump-reset-restore.

Four reasons, in order of weight:

1. **`auth.users`.** A reset recreates the `auth` schema empty. All four users go, including
   `orel@gmail.com` (created 2026-09-02) and `demo@example.com` (the documented local login). Every
   FK to a user id then dangles, and the data-only restore path has to reinsert `auth.users` before
   `public` — while `on_auth_user_created` is live and would fire `handle_new_user` on each insert.
   Solvable, but it is the single most fragile step in the whole exercise and the in-place route does
   not have it at all.
2. **10 462 `poi_index` rows.** That is the Tel Aviv Overture ingest. Re-ingesting it is real work.
3. **`supabase db reset` also re-runs `seed.sql`** and re-derives everything from files, so the
   orphaned `0027` objects vanish — which is tidy, but it means the local database silently stops
   matching what the owner had. The in-place route leaves the tree exactly as it is except for the
   13 migrations.
4. **The transforms.** A reset replays `0028`/`0029`/`0030` against an empty table, so they do
   nothing, and pre-taxonomy rows restored afterwards are never transformed.

**One correction to the framing, because it matters.** The transform argument is *directionally*
right but weaker than it looks, in two ways:

* There is **no taxonomy CHECK constraint** on `saved_places.tags` or `places.category`. The only
  constraints are `tag_list_within` and `= normalize_tag_list(…)`. So restoring a pre-taxonomy row
  into a post-`0030` schema would **not** raise an error — it would be *silently wrong*, which is
  the worse of the two failure modes but not the one the argument claimed.
* On today's actual rows the point is **moot**: every tag is already in the `0028` whitelist, there
  is no `breakfast`, and every category is already `restaurant`/`cafe`/`bar`/`NULL`. All three
  transforms change **zero rows**. Verified by an md5 checksum over `saved_places` and `places` taken
  before and after applying all 13 migrations on the clone — byte-identical.

So the taxonomy argument is not what carries the decision. `auth.users` and the POI index are.

---

## 4. The procedure

Run from the repo root. Nothing here touches staging or production.

### Step 0 — pre-flight (read-only)

```bash
cd /Users/lioryossef/Projects/P-002
export LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Stop the dev server and any e2e run first: 0036/0037 take ACCESS EXCLUSIVE on saved_places.
# Confirm who else is connected:
psql "$LOCAL_DB" -c "select application_name, state, count(*) from pg_stat_activity where datname='postgres' group by 1,2 order by 3 desc;"

# Confirm the transforms are still no-ops (all six must read 0):
psql "$LOCAL_DB" -At -F' | ' -f docs/evidence/db/catchup-dryrun.sql
```

### Step 1 — the backup (this is the whole rollback story)

```bash
mkdir -p ~/p002-backups
STAMP=$(date +%Y%m%d-%H%M%S)
docker exec supabase_db_P-002 pg_dump -U postgres -d postgres \
  --format=custom --compress=0 --file=/tmp/p002_$STAMP.dump
docker cp supabase_db_P-002:/tmp/p002_$STAMP.dump ~/p002-backups/p002_$STAMP.dump
docker exec supabase_db_P-002 rm -f /tmp/p002_$STAMP.dump
ls -la ~/p002-backups/p002_$STAMP.dump          # ~4.5 MB
pg_restore -l ~/p002-backups/p002_$STAMP.dump | grep -c 'TABLE DATA auth'   # must be 23
```

Use the **container's** `pg_dump` (17.6), which matches the server exactly. This dump covers every
schema: `public`, `auth` (including `auth.users`), `storage`, `supabase_migrations`, the lot.

### Step 2 — repair the phantom, then apply

```bash
npx supabase migration repair --status reverted 0027 --db-url "$LOCAL_DB"
npx supabase migration up --include-all --db-url "$LOCAL_DB"
```

`--include-all` is **required**, not optional. Plain `migration up` refuses with
`LegacyMigrationMissingRemoteError` because `0021`/`0022`/`0023` sit *behind* the recorded head. The
suggestion the CLI prints for the first failure (`supabase db pull`) is **wrong for this situation** —
do not run it; it would write a new baseline migration file.

Expected output: 13 `Applying migration …` lines, `0021 0022 0023 0028 0029 0030 0031 0032 0033
0034 0035 0036 0037`, and no error. That is exactly what the rehearsal produced.

### Step 3 — verify (§5)

---

## 5. Verification

Three files, all rehearsed and all read-only except where noted:

* `docs/evidence/db/catchup-dryrun.sql` — pre-flight, §4 step 0
* `docs/evidence/db/catchup-verify.sql` — the before/after capture
* `docs/evidence/db/catchup-verify-after.sql` — the post-catch-up assertions

**5a. The capture, before and after.** Run it immediately before step 1 and again after step 2, then
diff. Every count and all three checksums must be identical.

```bash
psql "$LOCAL_DB" -f docs/evidence/db/catchup-verify.sql > /tmp/db-before.txt
# ... steps 1 and 2 ...
psql "$LOCAL_DB" -f docs/evidence/db/catchup-verify.sql > /tmp/db-after.txt
diff /tmp/db-before.txt /tmp/db-after.txt && echo "nothing lost, nothing changed"
```

It runs inside one `repeatable read` transaction, and that is not decoration. The first draft did not,
and gave an inconsistent answer on its first real run against the live container — `saved_places` read
60 in one statement and 58 in the next, because another lane was deleting rows between them. A capture
that smears across several instants cannot prove anything about one.

Two counts in it are deliberately **not** "must equal the row count":

* `saved_place_sources` is many-to-one — one local save already carries two source posts — so a join
  count over-counts. The capture asks how many *saves* reach a source, not how many join rows exist.
* an `origin = 'manual'` save is entitled to have no source row at all. The assertion is
  `sp_import_without_source = 0`, i.e. no **imported** save lost its provenance.

**5b. The post-catch-up assertions.** Raises on the first violation, changes nothing:

```bash
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f docs/evidence/db/catchup-verify-after.sql
```

It checks: no tag outside the `0028` taxonomy, no `breakfast`, no retired `places.category` or
`saved_places.category_override`, `tags_extracted = tags` on **every** row, `dishes_extracted = dishes`
on every row, zero rows carrying a `tags_confirmed_at` / `why_go_reviewed_at` / `dishes_confirmed_at`
that no user set, every save still reaching a `places` row, and every imported save still reaching a
`saved_place_sources` row. On the rehearsal clone it printed:

```
PASS  62 saves: taxonomy clean, both backfills complete, no invented consent,
      every save still reaches its place and every import still reaches its source
```

**5c. The migration list is clean.** Every `local` must equal its `remote`, the head must be `0037`,
and no row may have an empty `local` — that is what a phantom looks like.

```bash
npx supabase migration list --db-url "$LOCAL_DB"
```

**5d. The schema is the designed one.** After dropping the orphans (§7):

```bash
npm run db:inventory        # 17 checks, all PASS
```

**5e. The policy suites.** Seven of the eight pass on a populated database (192 assertions); see §7
for why `0008` does not.

```bash
for t in 0024 0031 0032 0034 0035 0036 0037; do npm run db:test:$t || echo "FAILED $t"; done
```

## 6. Rollback

Use this if step 2 errors halfway, or if verification fails. It restores `public` and
`supabase_migrations` from the backup and leaves `auth`, `storage` and `realtime` untouched — which
is correct, because none of the 13 migrations writes outside those two schemas.

```bash
export LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
BACKUP=~/p002-backups/p002_<STAMP>.dump          # the file from step 1

# 1. drop and recreate the two schemas the migrations touched
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 <<'SQL'
drop schema if exists public cascade;
drop schema if exists supabase_migrations cascade;
create schema public authorization postgres;
create schema supabase_migrations authorization postgres;
SQL

# 2. restore them
pg_restore -d "$LOCAL_DB" --schema=public --schema=supabase_migrations "$BACKUP"

# 3. REQUIRED. `drop schema public cascade` also drops `on_auth_user_created` on auth.users
#    (it calls public.handle_new_user), and a --schema=public restore does not bring it back.
#    Without this, sign-up silently stops creating profile rows.
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 \
  -c "create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_user();"

# 4. REQUIRED. pg_restore runs with search_path = '' so it cannot resolve
#    pg_trgm.strict_word_similarity_threshold, and CREATE FUNCTION public.poi_prefilter fails with
#    `permission denied to set parameter`. Both files are idempotent; this recreates it.
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0021_poi_prefilter_trigram.sql \
  -f supabase/migrations/0022_poi_prefilter_address_arm.sql

# 5. confirm
npx supabase migration list --db-url "$LOCAL_DB"     # back to head 0027 with the phantom
psql "$LOCAL_DB" -f docs/evidence/db/catchup-verify.sql   # must match /tmp/db-before.txt
```

Steps 3 and 4 are not defensive padding: both were **observed to fail** on the rehearsal clone, and
without them the rollback is one object and one trigger short of where it started. With them, the
object-level comparison (relations, functions, policies, triggers, indexes, constraints, table
grants, column grants, ledger rows) came back **1826 of 1826 identical**.

### If step 2 of the catch-up dies halfway

Each migration file is wrapped in its own `begin;`/`commit;`, and the CLI applies them one at a time,
so a failure leaves you at a **file boundary**, never inside one. Read
`select max(version) from supabase_migrations.schema_migrations;` to see where it stopped. You can
either fix the cause and re-run `migration up --include-all` (it resumes), or roll back with §6.

---

## 7. Two things that will look like failures afterwards, and are not

**`npm run db:inventory` fails: `expected 17 tables in public, found 18`.** The eighteenth is
`rate_limit_events`, the orphan from the unmerged `0027`. It has RLS enabled and forced, so it passes
every safety check — it simply is not in the design. Three options, and this is the orchestrator's
call, not mine:

* **drop the orphans** and get a green inventory:
  ```sql
  begin;
  drop function if exists public.import_rate_limit_check(uuid, text);
  drop function if exists public.rate_limit_rules();
  drop function if exists public.import_usage_record(uuid, integer, integer);
  drop table if exists public.rate_limit_events;
  commit;
  ```
  Rehearsed: after this, `npm run db:inventory` exits 0 with all 17 checks passing. Nothing in `src/`
  references any of them. **This is a destructive statement against the real local database and needs
  the owner's specific instruction.**
* leave them and accept a failing inventory locally until `feat/import-rate-limit` lands;
* land that branch first, which renumbers `0027` into the sequence properly.

**`npm run db:test` fails at `0008`.** Not caused by the catch-up. `0008_policy_tests.sql` asserts
whole-table counts on its own fixtures — `if (select count(*) from public.extractions) <> 1`, and
twice more on `saved_places` — so it can only pass on a freshly reset database. With 56 real
extractions present it fails at line 158 before asserting anything about policies. It ends in
`rollback;` and `ON_ERROR_STOP` aborts its transaction, so **running it leaves no residue** (verified:
`auth.users` still 4 afterwards). The other seven suites — `0024`, `0031`, `0032`, `0034`, `0035`,
`0036`, `0037` — all pass on the populated, caught-up clone: 192 assertions, 0 failures, and the
before/after data capture was unchanged by running them.

This is worth fixing separately: `0008` should scope its counts to its own fixture users rather than
to the whole table, so that it is usable as evidence on a data-bearing database. Out of scope here.

---

## 8. What was actually rehearsed

Against a throwaway database `p002_rehearsal`, created on the same container from the full dump, and
dropped afterwards. The real local database received only `SELECT`s and one `pg_dump`.

1. Full dump taken (4 487 227 bytes, 1000 TOC entries, 23 `auth` data entries).
2. Clone created, dump restored. 147 pg_restore errors, **all** in `storage`/`realtime`/`vault`/
   `extensions` ownership (`must be able to SET ROLE supabase_admin`) — none in `public`, `auth.users`
   or `supabase_migrations`. Verified faithful: 4 users, 62 saved places, 67 places, 10 462 POI rows,
   24 ledger rows, `auth.uid()` present.
3. `migration up` → refused (`LegacyMigrationMissingLocalError`, phantom `0027`).
4. `repair --status reverted 0027` → `migration up` → refused again
   (`LegacyMigrationMissingRemoteError`, naming `0021`/`0022`/`0023`).
5. `migration up --include-all` → **all 13 applied, zero errors**.
6. Data capture before vs after → **identical**, including both md5 content checksums.
7. `migration list` → 36 rows, every `local` == `remote`, head `0037`, no phantom.
8. New objects confirmed: `place_mentions`, `profile_names`, five new `saved_places` columns, and
   `set_saved_place_tags`, `set_saved_place_dishes`, `review_saved_place_why_go`,
   `repoint_saved_place`, `record_place_mention`, `close_place_mention`, `normalise_profile_names`.
9. Backfills confirmed: `tags_extracted` on all 42 tagged rows, `dishes_extracted` on all 17,
   `tags_extracted is not distinct from tags` on all 62; all three `_confirmed_at`/`_reviewed_at`
   columns 0 non-null.
10. Taxonomy checks → clean. Transform dry-run → 0 rows affected.
11. Policy suites → 7 of 8 green (192 assertions); `0008` fails as described in §7; no residue.
12. `db:inventory` → failed on the 18-table count; after dropping the `0027` orphans, **all 17 checks
    PASS**.
13. Rollback rehearsed. First attempt lost `poi_prefilter` and the `on_auth_user_created` trigger and
    silently skipped `supabase_migrations`; corrected recipe rehearsed and verified object-identical
    (1826/1826) and data-identical.
14. Second full pass — catch-up, then rollback, as scripted blocks — both exact.
15. `p002_rehearsal` dropped. The container's `/tmp` dump removed.

**One caveat.** While the rehearsal ran, the real local database changed underneath it: `places` went
67 → 69 at 14:05:37Z and two fixture rows (`22222222-0000-4000-8000-000000000001` and `…0002`) were
deleted from `saved_places`, taking it 62 → 60. That was other live work on the shared container, not
this rehearsal — the diff was confirmed against the dump's own row ids. It is the reason step 1's
backup must be taken **immediately** before step 2, and the reason the §5a capture must be taken from
the same quiet moment. Between 14:04 and 14:20Z on 2026-09-02 the live table went 62 -> 60 -> 58
saved places and 69 -> 63 places, all from other lanes.

16. The three verification files in `docs/evidence/db/` were each executed. `catchup-dryrun.sql` and
    `catchup-verify.sql` ran read-only against the real local database; `catchup-verify-after.sql`
    ran against a second clone taken to `0037`, where it printed PASS over 62 saves. The
    `saved_places` and `places` md5 checksums on that caught-up clone
    (`ff49e0aa…`, `eee37c6e…`) are **identical to the ones taken before any migration was applied** —
    the third independent confirmation that the catch-up does not touch a single byte of user data.
17. `p002_rehearsal` dropped again; `pg_database` back to `_supabase, postgres, storage_vectors,
    template0, template1`.
