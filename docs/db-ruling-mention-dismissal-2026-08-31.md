# DB ruling — mention dismissal: soft state, and no migration is needed

**Author:** `supabase-database` · **Task:** `i6-mentions-db` · **Date:** 2026-08-31
**Base commit:** `2fa19f3` on `no-crumbs-implementation` (the commit the dispatch named; `docs/`,
`supabase/tests/**` and this file are the only paths touched by this task — no `src/`, no migration).
**Question answered:** `docs/ux-unplaced-mentions-2026-08-31.md` §5/§8 — soft state or hard delete for
`Not this one`. **Answer: soft state, using the column `0031` already shipped. No `0032` is written.**

---

## 0. Verdict

**Soft state — `UPDATE place_mentions SET dismissed = true`. No migration.** `0031_place_mentions.sql`
already has the exact column, the exact grant and the exact policy this decision needs:
`dismissed boolean not null default false`, `grant update (dismissed) on public.place_mentions to
authenticated`, enforced by `place_mentions_update_own`. This was not added for this task — it shipped
on 2026-08-31 as part of `0031` itself, under a different name (`security-ruling-e1-caption-retention.md`
§4's "the dismissal/state column"), and the row-level test file for it (`place_mentions_policy_tests.sql`,
same commit) already asserts the two properties this ruling depends on. **I ran that file against the
local container rather than trust that it was ever executed** — see §3.

So this is a **schema-adequacy ruling, not a schema-design one**: the question the dispatch asked
("soft state or hard delete, and does the design keep or lose the metric") is answered by reading and
then *executing* `0031`, not by writing new DDL. `0032` is not taken.

---

## 1. The reasoning, weighed against both sides as asked

**Why soft state wins.** The dispatch's own framing is right: the failure metric — *is the open count
being worked down, or only piling up* — needs "dismissed" distinguishable from "never existed" after
the fact, and a hard `DELETE` erases exactly that distinction. `dismissed = true` on a surviving row is
the only representation where a later query can answer "how many did this user dismiss, and when"
without needing a second retained object (a counter, an event log) to carry the same fact. Given the
schema already carries this column with the right grant, hard delete would be *strictly worse
measurability for no compensating benefit* — there is no cost saved by deleting the row, because the
row's retention was already decided, and decided in soft state's favour, before this task started (§2).

**Taking the hard-delete side seriously, as asked.** The concern was: *this project has a demonstrated
pattern of writing retention intentions it does not enforce* (`imports.expires_at`), and *a
soft-deleted row is a row kept forever unless something reaps it*. Both are true statements about this
codebase in general. Neither applies here, for a reason that is specific to this table and is worth
stating precisely rather than waved past:

- `imports.expires_at` is a **TTL that nothing reads** — a column whose entire job is to *shorten*
  retention below what the FK graph already gives, enforced by a job that was never written. It is a
  broken promise because it promises something the account cascade does not already provide.
- `place_mentions.dismissed` promises nothing beyond what `0031`'s own retention bound already
  promises for **every row in this table, dismissed or not**: the row lives for the life of the
  account and dies when the account does, by the FK cascade in `place_mentions.user_id →
  profiles(id) on delete cascade` — condition D1, the line `security-ruling-e1-caption-retention.md`
  calls "the entire retention bound." Dismissal does not extend that bound, add a second one, or
  create a promise the schema does not already keep. It just flips a boolean on a row whose lifetime
  was decided by a different, already-executed ruling.

So the "kept forever unless something reaps it" framing, applied to this specific column, resolves to:
it is reaped by the exact same mechanism that reaps an open or a resolved mention — account deletion —
and nothing more is owed here than what `0031` already discharged for the whole table. Building a
*second*, shorter-lived retention mechanism for dismissed rows specifically (a TTL, a sweep job) would
be the actual repeat of the `imports.expires_at` mistake: a bound the design does not need, enforced by
something that would have to be built and would then have to keep working. I am not adding one.

**Does "the user chose what we keep" get contradicted?** The team-lead's tension is real in the
abstract but does not bind this row in particular, because the UX contract (§5 of the spec) promises
behavior, not disposal: *"once dismissed, a mention never appears in the open list again... no other
surface is affected."* Nothing in the spec promises the user that dismissing erases the underlying
record — the spec explicitly declined to make that promise, leaving the mechanism to this task. What
the user actually asked for by tapping "keep for later" in the first place was already ruled on by
`security-ruling-e1-caption-retention.md` §1/§5: a row that survives for the life of the account,
narrowed to `rawName` + extracted hints, never the caption. Dismissal is a change to that row's
*visibility in the open list*, not a withdrawal of the retention the user already triggered by keeping
it. The premise the team-lead names — "a design that keeps dismissed rows so we can compute a metric,
on a surface whose premise is the user chose what we keep, contradicts the spec it serves" — would be a
real problem if dismissal were adding *new* retention for a *lesser* reason. It is not: it is the same
retention, already justified, continuing to apply to a row whose visible state changed.

**The alternative the dispatch offered — a counter, an aggregate, or an event with no venue name and no
caption text.** Considered and rejected as strictly worse here, not as a bad idea in general: it would
be *new* schema (a counter table or an event log), *new* write paths (something has to increment it),
and *new* things to get wrong (the counter drifting from the rows it counts), replacing a column that
already exists, is already granted, is already policied, and is already tested. `0031`'s own header
rule — "adding something [a TTL] that is [read] would be a new decision, not this one" — applies with
equal force to adding new retention *machinery* where an existing column already answers the question.
The metric in §8 of the UX spec is computable today with zero new code (§3).

---

## 2. What the design keeps, for how long, and what removes it — stated plainly

- **What is kept:** the same set `0031` already approved for every mention regardless of dismissal —
  `raw_name`, the extracted hints, `source_id`/`external_url`, `reason`, `dismissed`, `saved_place_id`,
  timestamps. Nothing new. Dismissal does not add a column, a value, or a byte that was not already
  being retained the moment the user tapped "keep for later."
- **For how long:** the life of the account. Not "until reaped by a sweep," not "until a TTL fires" —
  there is no TTL and none is being added. This is condition D1, unchanged.
- **What removes it:** the `on delete cascade` edge from `place_mentions.user_id` to `profiles(id)`,
  which fires when the account is deleted (`deleteAccount()`, `L1-F8-T1`) and removes **every** mention
  belonging to that user — open, dismissed and placed alike, in one statement, with no distinction
  between them. There is no separate "reaper" for dismissed rows and none is warranted: they are not a
  distinct retention class from open or placed rows, they are the same row with one boolean flipped.
- **What does *not* remove it:** the user tapping "Not this one." That action changes visibility
  (`dismissed = true`, filtered out of the open list) and nothing else. If the product later wants an
  actual user-facing "permanently forget this," `DELETE` is already grantable and policied
  (`place_mentions_delete_own`) — but the UX spec does not ask for that as the behavior behind
  "Not this one," and I am not wiring the dismiss button to it.

---

## 3. Verified against the local container, by executing state transitions — not by reading the DDL

Per the standing instruction ("prove any cascade or reaping claim by running it") and per
`security-ruling-e1-caption-retention.md`'s own Condition Q standard ("I do not accept 'the policy says
so' as evidence... including from myself"), I ran the actual tests rather than took the migration
header's word for it.

**Base state, measured, not assumed.**
```
$ docker exec supabase_db_P-002 psql -U postgres -d postgres \
    -c "select version from supabase_migrations.schema_migrations order by version desc limit 5;"
 version
---------
 0031
 0030
 0029
 0028
 0026
```
`0031` is applied on the local container (contradicting nothing — it just means the environment
condition the migration's own header recorded on 2026-08-31 morning, "not one statement in it had been
executed anywhere," no longer holds; Docker is up now).

**Ran the full existing policy-test file** (`supabase/tests/0031_place_mentions_policy_tests.sql`,
992 lines, three fixture users, one transaction, rolled back at the end — I did not touch this file,
did not add fixtures of my own to it, and did not commit anything) via
`docker exec -i supabase_db_P-002 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < supabase/tests/0031_place_mentions_policy_tests.sql`.
**Every one of its ~35 assertions passed; zero FAILs.** The two that matter to this ruling specifically,
both executed against real rows under real roles, not read from `pg_policies`:

- **M5e / M11 — dismissal survives as a distinguishable row.** `UPDATE place_mentions SET dismissed =
  true` as the owner, then re-read: `PASS M11 a dismissed mention is still a row, and the import and
  the source it came from are untouched.` This is the property the metric depends on, proven by
  executing the update and the re-read, not by reading the grant.
- **M14a — the cascade actually reaps every mention on account deletion, dismissed rows included.**
  `delete from public.profiles where id = ...` for the fixture owner (who by that point in the file
  holds an open, a dismissed and a placed mention) then: `PASS M14a deleting the profiles row removes
  every one of that user's mentions, and nobody else's (D1, executed)`. This is the answer to "what
  reaps it, and does that reaper actually exist" — it exists, it is the same FK cascade that reaps
  every other row in this table, and I ran it rather than cited it.
- **M7b/c/d — a second user cannot dismiss or delete another user's mention** (`B cannot update or
  delete A's mentions, and can delete their own`), confirming the soft-state column is exactly as
  protected as the hard-delete grant would be — neither exposes a cross-user write.

Full transcript is in the tool output of this task; the closing line was:
`--- 0031 place_mentions policy tests: if you see this line and no FAIL above, every assertion passed and the transaction was rolled back ---`
and it was seen, with no FAIL line above it.

**Ran the metric query itself**, separately, in its own rolled-back transaction against the two real
profiles already in this database (not the test file's synthetic fixtures — a second, independent
check), inserting one open and one dismissed mention and reading:

```sql
select
  count(*) filter (where not dismissed and saved_place_id is null) as open_count,
  count(*) filter (where dismissed)                                as dismissed_count,
  count(*) filter (where saved_place_id is not null)                as resolved_count
from public.place_mentions m join _u on _u.id = m.user_id;
```
```
 open_count | dismissed_count | resolved_count
------------+-----------------+----------------
          1 |               1 |              0
```
— confirming the three-way split `ux-unplaced-mentions-2026-08-31.md` §8 needs (open / dismissed /
resolved) is computable **today, with zero new columns**, straight from `dismissed` and
`saved_place_id`, both already granted `select` to `authenticated` in `0031`. Rolled back; nothing
persisted to the shared local database.

---

## 4. What I rejected

- **A `dismissed_at` timestamp**, considered and dropped. It would let a future metric bucket
  dismissals by week, which is a real want, but `0031`'s header already rules against adding any
  timestamp that "could be read as a soft-delete or a retention clock" for exactly this table, and the
  spec's own metric (§8) only asks whether the open count is being worked down over time — answerable
  from `created_at` (already present) cross-referenced with a point-in-time snapshot of `dismissed`,
  without a second clock. If a periodic measurement genuinely needs dismissal timing later, that is a
  new, small, separately-reasoned column — not bundled into this ruling by default.
- **A hard `DELETE` behind "Not this one."** Rejected per §1 — it is already grantable
  (`place_mentions_delete_own`) for a user who wants to actually forget a row, but is not what the
  dismiss button should call, because it destroys the exact distinction the product's own success
  metric depends on.
- **A new counter/aggregate table.** Rejected per §1 — strictly more machinery than the existing column
  for the same answer, and it is exactly the kind of thing `0031`'s header calls "a new decision, not
  this one."
- **Migration `0032`.** Not written. `0031` already carries everything this decision needs; writing a
  no-op migration to re-state an existing grant would violate `08` §9's forward-only discipline for no
  reason and would burn a migration number the orchestrator would otherwise allocate to real work.

---

## 5. What I did not touch, and why

**No `src/` change.** The dispatch's write scope excludes it, a second session is mid-refactor across
`src/domain/**` and `src/integrations/llm/**`, and this ruling is answerable entirely from the schema
that already exists — there is no `src/` wiring implied by "no migration is needed." Whoever wires the
"Not this one" button should call `UPDATE place_mentions SET dismissed = true WHERE id = $1` (through
RLS, as `authenticated`, matching the grant proven in §3) — not a new RPC, since none is needed: the
column-scoped `UPDATE (dismissed)` grant plus `place_mentions_update_own` is already sufficient and
already exercised end-to-end by the test.

**No change to `supabase/tests/0031_place_mentions_policy_tests.sql`.** It already asserts everything
this ruling needed proven (M5e, M11, M7b-d, M14a) — I ran it, I did not need to extend it. I considered
adding a dedicated "metric query returns the right split" assertion to that file but did not, on the
grounds that the metric is a `src/` query over already-proven columns and grants, not a new
authorization surface; if `qa-reliability` or the eventual `src/` author wants a regression test for the
exact aggregate query shape, that belongs with the code that runs it, not with the RLS proof file.

**`docs/db-migration-runbook.md`, `supabase/tests/0008_policy_tests.sql`** — untouched; no migration
means no new numbering, no new inventory row, no new grant-guard surface to update.

---

## 6. Summary for the orchestrator

- **Ruling:** soft state, via `place_mentions.dismissed` (already in `0031`). No `0032`.
- **Migration number `0032` was NOT taken** — available for the next agent that needs it.
- **Verified locally, by execution, against real rows:** `0031_place_mentions_policy_tests.sql` run in
  full, zero failures, including the dismissal-survives (M11) and cascade-reaps-everything (M14a)
  assertions; a separate scratch transaction proving the open/dismissed/resolved metric query against
  the two real local profiles. Both transactions rolled back; local database left exactly as found.
- **Nothing applied to staging or production.** No `db:push:*` was run.
- **`src/` untouched**, per write scope and per the concurrent-refactor warning.
