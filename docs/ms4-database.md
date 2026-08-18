# MS4 — the schema, and what the review changed on the way in

**Date:** 2026-08-18 · **Milestone:** MS4 · **Status:** written and parse-checked; **not yet applied
to any environment** (see §5 — this is what stands between here and the milestone's exit)

MS4 was started with a review of the design rather than a transcription of it. `08` §3 carried the
DDL, `07` §3 carried a competing version of two of its tables, and `technical-design.md` §14 had
already ruled on seven differences between them. The review found five more differences and one
defect. All are recorded as R8–R12 in §14 of the design; this file is the implementation record.

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
| `supabase/tests/0008_policy_tests.sql` | The authorisation proof (acceptance P3), run in a rolled-back transaction (R12) |
| `.github/workflows/ci.yml` → `database` job | `supabase db reset` from zero, then the policy tests. A policy regression fails the build |
| `package.json` | `supabase` CLI pinned to 2.115.0; `db:reset`, `db:test`, `db:verify` |

`supabase/config.toml` is the CLI default for Postgres 17, with one property worth knowing: new
entities in `public` are **not** auto-exposed to `anon`/`authenticated` any more (the legacy
auto-grant is deprecated and removed on 2026-10-30). Every privilege this schema has is one it
granted explicitly, which is the posture `08` §2.2 assumed but could not previously rely on.

## 2. The defect the review found

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
| P8 | the last provenance link of an `origin='import'` save cannot be detached |

P8 needs `set constraints all immediate` to be observable: the trigger is `DEFERRABLE INITIALLY
DEFERRED`, so its event is queued to the transaction rather than to the plpgsql subtransaction, and
without forcing the check the test would pass while asserting nothing.

## 5. What is NOT verified, and why

Every statement in `supabase/migrations/` parses — SQL and plpgsql bodies both, via `libpg_query`
(the parser Postgres itself uses), which catches syntax and plpgsql structure but **not** a single
semantic or authorisation claim. **Nothing here has been executed**, because this machine has
neither Docker nor a local Postgres, so `supabase db reset` cannot run.

Under the house rules that makes the whole of §4 **ASSUMED**, not VERIFIED. Three specific claims are
the ones most likely to be wrong on first execution:

1. **`create trigger on_auth_user_created on auth.users`** may be rejected for want of rights on the
   `auth` schema. `0002` says what to do if it is: delete the trigger and create the profile from the
   server on first authenticated request. Do not weaken the `profiles` policies instead.
2. **`insert into auth.users (id, email)`** in the test fixtures may need more columns than the two
   supplied, depending on the GoTrue schema version in the local image.
3. **`FORCE ROW LEVEL SECURITY`** is `08` §9's own flagged risk: if the migration role turns out to
   lack `BYPASSRLS`, drop `FORCE` and keep `ENABLE` rather than adding owner-shaped policies.

The first execution is therefore the `database` job on this branch's pull request, which is also the
first evidence that the CI job itself is correct. **MS4's exit is not met until that job is green and
both environments have the migrations applied**; applying them to the hosted projects needs
credentials this session does not have.
