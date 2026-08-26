# Orphan objects on `p-002-staging` — provenance, restore, and the proof they are recoverable

> Written **2026-08-26**, before any drop was performed. Everything here was measured against the
> live staging database and against a local replay; nothing in it is inferred.

## 1. What was found, and how

`npm run db:status:staging` on 2026-08-26 refused to push, because the staging ledger carried two
migration versions this checkout does not have:

```
{"local":"0016","remote":""} {"local":"0017","remote":""} {"local":"0018","remote":""}
{"local":"","remote":"0019"} {"local":"","remote":"0020"}
```

and `npm run db:inventory:staging` failed its very first check:

```
ERROR:  FAIL 1: expected 11 tables in public, found 12
```

Reading the live schema rather than the ledger gave the real picture. Staging carries **three**
things `main` does not:

| Object | Ledger row | Origin |
|---|---|---|
| `0016`'s content (`saved_places.source_url`, `source_thumbnail_url`, `apply_saved_place_source_link`) | recorded as **`0019`** | `feat/tel-aviv-db-first-resolve` renumbered `main`'s `0016` → `0019`. Same file, byte-identical (`git diff` empty). **Not an orphan** — the schema is correct, only the version number is wrong |
| `public.search_poi_index(text[], text, text[], integer)` | `0020` | `origin/feat/tel-aviv-db-first-resolve:supabase/migrations/0020_search_poi_index.sql` (PR #22's lineage) |
| `public.transcription_jobs` + 5 `*_transcription_job` functions + the `transcription-audio` storage bucket | **none at all** | The paused `codex/cloudflare-audio-transcription` experiment. Applied **out of band** — no ledger row was ever written, which is the `db-migration-runbook.md` §4 "SQL in the dashboard editor" failure mode |

**Neither orphan holds data.** `select count(*) from public.transcription_jobs` → `0`;
`select count(*) from storage.objects where bucket_id='transcription-audio'` → `0`.

## 2. Where the definitions live

This is the part that was fragile, and is the reason this directory exists.

`search_poi_index` was already safe: its migration is committed and **pushed to `origin`** on
`feat/tel-aviv-db-first-resolve`.

The transcription set was **not**. Its branch, `codex/cloudflare-audio-transcription`, exists only
as `refs/heads/` on one machine (`git ls-remote --heads origin 'codex/*'` returns nothing), and the
three migrations were never even committed to it — they were work-in-progress inside
`git stash@{3}`'s untracked component (`stash@{3}^3`). A stash is local, unpushed and prunable. One
`git stash drop`, one lost laptop, and the only definition of a table that is live on a hosted
database would have been the database itself.

So both are now copied into this directory, verbatim:

| File | What it is |
|---|---|
| `transcription-0016_transcription_jobs.sql` | the table, its indexes, RLS, grants, policy, touch trigger, and the five job functions — from `stash@{3}^3` |
| `transcription-0017_transcription_audio_bucket.sql` | the private `transcription-audio` bucket (idempotent upsert) — from `stash@{3}^3` |
| `transcription-0018_transcription_jobs_source_index.sql` | the index covering the `source_id` FK — from `stash@{3}^3` |
| `live-staging-transcription_jobs.sql` | `pg_dump --schema-only` of the table **as it actually is** on staging |
| `live-staging-transcription-functions.sql` | `pg_get_functiondef` of all five functions as they actually are on staging |
| `live-staging-search_poi_index.sql` | `pg_get_functiondef` of the function as it actually is on staging |

They are deliberately **not** under `supabase/migrations/`. Nothing here is part of the migration
set, `supabase db push` must never see them, and `scripts/check-migration-grants.sh` does not scan
this path.

## 3. The proof that they restore — replayed, not asserted

The owner's condition for approving the drop was that both be *demonstrably* recoverable. So the
preserved files were replayed against the local Supabase container (which already carries `0001`
–`0018`), the resulting objects were dumped, and the dumps were diffed against the live staging
dumps:

```bash
psql "$LOCAL" -f transcription-0016_transcription_jobs.sql
psql "$LOCAL" -f transcription-0018_transcription_jobs_source_index.sql
psql "$LOCAL" -f 0020_search_poi_index.sql          # from the tel-aviv branch

diff live-staging-transcription_jobs.sql       replay-transcription_jobs.sql        # IDENTICAL
diff live-staging-transcription-functions.sql  replay-transcription-functions.sql   # IDENTICAL
diff live-staging-search_poi_index.sql         replay-search_poi_index.sql          # IDENTICAL
```

All three are byte-identical. The preserved files reproduce the live objects exactly.

`0017_transcription_audio_bucket.sql` was **not** replayed — it writes to `storage.buckets`, and
dirtying local storage to prove a four-field row was not worth it. It was compared field by field
instead, which is the whole of its content:

| Field | Migration says | Staging has |
|---|---|---|
| `id` / `name` | `transcription-audio` | `transcription-audio` |
| `public` | `false` | `f` |
| `file_size_limit` | `10485760` | `10485760` |
| `allowed_mime_types` | `{audio/mpeg, audio/mp3}` | `{audio/mpeg,audio/mp3}` |

It is an `on conflict do update` upsert, so re-running it is safe whatever the bucket's state.

The local container was returned to `main`'s schema afterwards (`drop` of the six objects, then
`npm run check:schema` → **15 inventory checks passed**, 11 tables).

## 4. How to restore either feature

**`search_poi_index`** — do nothing special. Merge PR #22's lineage; its `0020` is
`create or replace`, so it re-installs cleanly whether or not the function is present.

**The transcription feature** — restore in this order:

1. `git stash apply stash@{3}` on a branch off `main` (the app code, the Cloudflare worker under
   `services/transcription-worker/`, the tests, and `docs/12-audio-transcription.md`). If the stash
   is gone, the three SQL files here are the schema half; the application half is only in that
   stash and on the local `codex/cloudflare-audio-transcription` branch.
2. Renumber the three SQL files in this directory to the next free migration versions — **their
   original `0016`/`0017`/`0018` numbers now belong to different migrations on `main`**, which is
   the collision that helped hide them. Copy them into `supabase/migrations/` under the new numbers.
3. `npm run db:verify` locally, then `npm run db:push:staging` through the runbook. Never re-apply
   them out of band; that is what produced this document.

## 5. The staging repair this unblocks

Written before execution, so the next session can tell plan from record. **Not yet performed at the
time of writing — the drop is the owner's call, and §3 exists to inform it.**

- `supabase migration repair --status applied 0016` — the content genuinely is applied, under the
  wrong version number
- `supabase migration repair --status reverted 0019 0020` — neither version exists in this repo, and
  `supabase db push` refuses to run at all while they sit in the ledger
  (`LegacyDbPushMissingLocalError`)
- `npm run db:push:staging` — applies `0017` and `0018`
- the orphan objects dropped, so `inventory.sql` proves staging against the designed surface again

The drop is reversible from this directory. The data loss is nil, and was nil before the drop: both
object sets were empty.
