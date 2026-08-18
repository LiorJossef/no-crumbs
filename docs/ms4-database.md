# MS4 — the schema, and what the review changed on the way in

**Date:** 2026-08-18 · **Milestone:** MS4 · **Status:** schema applied from zero and the
authorisation proof green in CI (run
[32164006925](https://github.com/LiorJossef/P-002/actions/runs/32164006925)); **not yet applied to
either hosted environment** — that is all that stands between here and the milestone's exit (§5)

MS4 was started with a review of the design rather than a transcription of it. `08` §3 carried the
DDL, `07` §3 carried a competing version of two of its tables, and `technical-design.md` §14 had
already ruled on seven differences between them. The review found five more differences and one
defect. The reconciliations are recorded as R8–R12 in §14 of the design. Executing the schema then found a
second defect, in the same class as the first and worse — §2. This file is the implementation record.

## 1. What exists now

| File | Contents |
|---|---|
| `supabase/migrations/0001_conventions.sql` | `km_between()` (immutable Haversine), `place_name_key()`, `touch_updated_at()`. No table, no extension |
| `supabase/migrations/0002_profiles.sql` | `profiles` + RLS + the `handle_new_user()` signup trigger (R9) |
| `supabase/migrations/0003_sources.sql` | `sources` (global) and `imports` (per user), with R1–R5, R7, R8 and R10 applied |
| `supabase/migrations/0004_extractions.sql` | `extractions`, membership-gated through the user's own imports |
| `supabase/migrations/0005_places.sql` | `places`, `place_provider_refs`, the alias invariant trigger; RLS forced with **no policy yet** — deliberately deny-all until 0006 |
| `supabase/migrations/0006_saved_places.sql` | `saved_places`, `saved_place_sources`, and the three cross-table membership policies that could not be written earlier |
| `supabase/migrations/0007_functions.sql` | `place_lookups` (R11), `start_import()` (R10), `resolve_place()`, `save_place()`, `merge_places()` |
| `supabase/tests/0008_policy_tests.sql` | The authorisation proof (acceptance P3), run in a rolled-back transaction (R12). Creates fixture users, so: local and staging only |
| `supabase/tests/inventory.sql` | **Read-only** structural assertions — RLS forced, the exact policy set, the grant matrix down to the column, function grants, invariant triggers, no extensions. Writes nothing, `set transaction read only`, rolls back. The only check in the repo that may be pointed at production |
| `scripts/check-migration-grants.sh` | Static guard over the migration set: RLS enabled+forced in the table's own file, and ALL revoked from both browser roles. The compensating control for §2.3 |
| `.github/workflows/ci.yml` → `database` job | `supabase db reset` from zero, then the policy tests, then the inventory. A policy regression fails the build — and running the inventory here too is what keeps *its* expected matrix from drifting away from the migrations, since otherwise the check that guards production would itself be unguarded |
| `package.json` | `supabase` CLI pinned to 2.115.0; `db:reset`, `db:test`, `db:verify` |

`supabase/config.toml` is the CLI default for Postgres 17, with one property worth knowing: new
entities in `public` are **not** auto-exposed to `anon`/`authenticated` any more (the legacy
auto-grant is deprecated and removed on 2026-10-30). Every privilege this schema has is one it
granted explicitly, which is the posture `08` §2.2 assumed but could not previously rely on.

## 2. The two defects

### 2.1 `resolve_place()`, found by reading (before any execution)

`resolve_place()` as designed in `08` §3.7 could abort the caller's transaction. Two callers
resolving the same new provider id concurrently both reach step 3; the loser has already inserted its
`places` row when its alias insert hits `on conflict … do update` and returns the *winner's*
`place_id`. Its own place row is then aliasless, and the deferred `places_alias_required` constraint
trigger fires at COMMIT and takes the whole transaction down — including the import that was only
trying to resolve a restaurant. The comment above the statement claimed this path was safe.

The fix keeps `DO UPDATE` (a `DO NOTHING` would return no row and the winner's row may still be
invisible under READ COMMITTED — the original choice was right for the reason it gave), and deletes
the orphan when the returned `place_id` is not the one just inserted:

```sql
  if v_place_id is distinct from v_new_place_id then
    delete from places where id = v_new_place_id;   -- our aliasless orphan; nothing references it
    select coalesce(pl.merged_into_place_id, pl.id) into v_place_id
      from places pl where pl.id = v_place_id;      -- follow a tombstone if the winner lost a merge
  end if;
```

The near-duplicate branch (step 2) was also split out to return early, so the alias insert is not
shared between "existing place" and "new place" paths that need different `is_primary` logic and
different failure handling.

### 2.2 Both constraint trigger functions, found by executing (CI run 32163531344)

`assert_saved_place_provenance()` chose its subject id with a `CASE` over both records:

```sql
  v_saved_place_id := case tg_table_name
    when 'saved_places'        then coalesce(new.id, old.id)
    when 'saved_place_sources' then coalesce(new.saved_place_id, old.saved_place_id)
  end;
```

plpgsql materialises **every** branch's record as a parameter before the `CASE` selects one, so the
record that does not exist for the trigger that fired raises `record "new" has no field
"saved_place_id"`. `COALESCE` does not help — the record has to exist to be passed at all. The
function now branches on `TG_TABLE_NAME` and touches only the record that exists (`saved_places`
fires on INSERT / UPDATE OF origin, so NEW; `saved_place_sources` fires on DELETE, so OLD).

`assert_place_has_alias()` had the identical shape — `coalesce(new.id, old.id)` on an `AFTER INSERT`
trigger, where OLD is unassigned — and this is the serious one: **it would have raised at COMMIT after
every single `places` insert, so `resolve_place()` could never have worked in production.** The
product's entire import path would have failed on its first real write.

Why neither the design review nor the first CI run caught the second one: the policy tests end in
`ROLLBACK`, and a `DEFERRABLE INITIALLY DEFERRED` trigger never fires in a transaction that never
commits. Both deferred invariants — the whole reason those triggers exist — were untested while the
suite reported green on everything around them. Hence **P7b**: after the fixtures and P7,
`set constraints all immediate` flushes every queued event, so the happy path actually runs the
triggers. Any deferred constraint added later must stay inside that checkpoint's reach or it inherits
the same blind spot.

### 2.3 Wide default privileges on three tables, found by the first inventory run

`inventory.sql` check 4, run against `p-002-staging`, found `authenticated` holding **UPDATE (every
column), DELETE, TRUNCATE, REFERENCES and TRIGGER** on `profiles`, `saved_places` and
`saved_place_sources` — the three tables where `08` §3 revoked only `from anon`. `sources` and
`imports` said `from anon, authenticated` and were clean, which is what made the cause obvious.

Both the hosted projects **and the local container** carry `ALTER DEFAULT PRIVILEGES` granting ALL on
new entities in `public` to `anon` and `authenticated` (proven by check 0 failing in CI as well as on
staging — an earlier draft of this file claimed the local database was clean, which was wrong). So the
wide grants existed everywhere. What was missing was any check that looked: the policy tests prove
behaviour under RLS and never inspect a grant, and `inventory.sql` did not exist until after the
green runs. The lesson is not "staging differs from local", it is **"RLS passing is not the same as
the privilege surface being right"**.

The severe part is `TRUNCATE`. RLS is never consulted for it, so that grant was a path for any
authenticated user to delete every user's `saved_places` — no policy, no row scoping, and no
point-in-time recovery on a free-tier project. The wide `UPDATE` is the other half: it defeats the
column-level grants that were supposed to make `user_id`, `place_id` and `origin` unexpressible
rather than merely policy-checked (`08` §2.2 rule 3).

`0008_revoke_hosted_defaults.sql` revokes everything from both browser roles on every table and
sequence and re-grants the designed matrix verbatim in one readable block.

**What could not be fixed:** those defaults are owned by **`supabase_admin`**, and the migration role
cannot alter them. `0008` attempts it for both `postgres` and `supabase_admin` and reports what it
could not do. So the condition is permanent: **every table a future migration creates in `public`
arrives with ALL granted to both browser roles**, and only an explicit REVOKE closes it.

Because a local `supabase db reset` looks correct either way, the guarantee cannot live in a test. It
lives in `scripts/check-migration-grants.sh`, run in CI: for every `create table public.x`, it
requires RLS enabled **and** forced in the same migration, and ALL revoked from **both** `anon` and
`authenticated` by that migration or a later one. Verified non-vacuous by removing `0008` and
confirming it names exactly the three tables that were actually open. `inventory.sql` check 0 now
records the environment fact instead of failing on it; checks 4 and 5 remain the proof that the
revokes took effect on a given database.

### 2.4 `anon` could call `save_place`, found by inventory check 6

Postgres grants EXECUTE on every newly created function to the pseudo-role `PUBLIC`. `0007` said
`revoke all on function public.save_place(...) from anon`, which does nothing about a privilege held
through `PUBLIC` — so `anon` retained EXECUTE. The three `SECURITY DEFINER` functions were fine
precisely because `0007` revoked them `from public, anon, authenticated`; the inconsistency between
those two lines is the whole bug.

Impact was limited by `save_place` being `SECURITY INVOKER` with an `auth.uid() is null` guard, so an
anon caller got an exception, not a write. It is still a callable entry point on the product's most
important write, and `08` §5.1 says `anon` holds nothing.

`0009_function_grants.sql` revokes EXECUTE on every function in `public` from `PUBLIC`, `anon` and
`authenticated`, then grants back exactly two things to `authenticated` (`save_place`, `km_between`)
and two to `service_role`. Inventory check 6 is now exhaustive in both directions, because with
EXECUTE defaulting to `PUBLIC` an omission from that list is a grant to everyone rather than to
nobody — the opposite of how table grants fail.

One assumption is load-bearing there: trigger functions need no EXECUTE grant, because
`CREATE TRIGGER` checks it at creation and firing does not re-check. Rather than leave that in a
comment, the policy tests gained **P4b** — the owner updates their own overlay, which fires
`touch_updated_at`. If the assumption is wrong, that test says so.

## 3. The five reconciliations, in one line each

Full text in `technical-design.md` §14.

- **R8** — the membership policy on `sources` stands, but `content_text` is not in the grant. No
  surface displays post text; its only consumer is server-side. Consequence for MS7: `select *` on
  `sources` fails with permission denied, so the data-access layer must name columns.
- **R9** — `imports.user_id → profiles`, and `handle_new_user()` creates the profile at signup;
  without it the first write after signup fails on a foreign key.
- **R10** — users hold no INSERT and no DELETE on `imports`; `start_import()` is the only creator.
- **R11** — `place_lookups` lives in `0007`, deny-all, `expires_at` nullable per `06` §6.4.
- **R12** — the policy tests live in `supabase/tests/`, not `migrations/`, so fixture users in
  `auth.users` can never be applied to production.

## 4. What the policy tests assert

Nine groups, all executed under `set role authenticated` with `request.jwt.claims` set, so they test
the policies and not the client:

| | Assertion |
|---|---|
| P0 | the signup trigger created a profile per `auth.users` row |
| **P1** | **user B's select of user A's `saved_places` returns zero rows** — MS4 exit, first half |
| **P2** | **`places` and `place_provider_refs` are invisible to a user who has not saved them** — MS4 exit, second half |
| P3 | `sources`, `imports`, `extractions`, `profiles` are owner/membership scoped |
| P4 | B's UPDATE and DELETE against A's library affect zero rows |
| P5 | `content_text` unreadable; no INSERT on `imports`; `saved_places.user_id` not updatable; no write to global tables; `resolve_place`/`start_import`/`merge_places` not executable — seven separate `insufficient_privilege` expectations |
| P6 | `anon` holds no grant on any of the nine tables |
| P7 | two provider ids for one physical place resolve to one place with two aliases (the 75 m guard) |
| P4b | the owner's granted-column UPDATE succeeds and fires `touch_updated_at` (the assumption 0009 rests on) |
| P7b | every deferred constraint trigger queued by the fixtures and P7 executes cleanly — the checkpoint that closes the ROLLBACK blind spot of §2.2 |
| P8 | the last provenance link of an `origin='import'` save cannot be detached |

P7b is what makes P8 observable at all: the provenance trigger is `DEFERRABLE INITIALLY DEFERRED`, so
its event is queued to the transaction rather than to the plpgsql subtransaction, and without forcing
the check the test would pass while asserting nothing. P7b must come **after** P7 — `resolve_place()`
inserts a place and its alias in two statements, which is exactly what the deferral exists to permit,
so flushing earlier would fail the happy path.

## 5. Verification status

**VERIFIED** (CI run [32164006925](https://github.com/LiorJossef/P-002/actions/runs/32164006925), a
fresh `supabase db reset` from `0001` on Postgres 17, then the policy tests):

- The migration set applies from zero, in order, with no manual step. That reproducibility is `08`
  §9's acceptance test for the migrations.
- All of P0, setup, P1–P4, P5a–P5g, P6, P7, P7b and P8 pass — 17 assertions, including both halves of
  MS4's exit gate: **user B's select of user A's `saved_places` returns zero rows**, and **`places`
  and `place_provider_refs` are invisible to a user who has not saved them**.
- The three risks §5 previously flagged as most likely to break are all closed by that run:
  `create trigger on_auth_user_created on auth.users` was accepted (P0 proves it fired), the
  two-column `insert into auth.users` fixture is sufficient, and the migrations apply cleanly with
  `FORCE ROW LEVEL SECURITY` set — so `08` §9's fallback of dropping `FORCE` is not needed.

**Still ASSUMED:**

- Everything above is Postgres 17 in the local Docker image. The hosted projects are a different
  build and a different set of Supabase-managed roles; the auth-schema trigger is the statement most
  likely to behave differently there. `0002` carries its own fallback.
- **Staging has the schema.** Applied 2026-08-18 to `p-002-staging` (`jfuqjzubphfhfleqnkno`,
  `eu-central-1`, Postgres 17.6.1.155) with `supabase db push`; `supabase migration list --linked`
  reports `0001`–`0007` local == remote, and `supabase inspect db index-stats` confirms all nine
  tables with every named index, including `imports_open_one_per_source` (R5) and the `place_lookups`
  pair (R11). What that does **not** prove is that RLS is forced, the grants survived, or the
  `auth.users` trigger exists on the hosted build — `inventory.sql` is what proves those, and it has
  not yet been run against staging.
- **Production (`vtboskegexinvhasghri`) has nothing.** MS4's exit is not met until it does.
- No performance claim has been tested. The index plan is reasoned (`08` §8, `technical-design.md`
  §4.5), not measured, and the row counts that would make it measurable arrive in MS5.