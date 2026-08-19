# MS1–MS4 retrospective audit — handoff

> Written 2026-08-19. Status: **in progress, nothing committed.**
> Branch `audit/ms1-ms4-fixes`, based on `main` at `21c4d17`. `ms5-design` @ `34a88f0` is untouched
> and must stay that way. Tasks 1–10, 12 and 13 are done; **11 and 14 remain**. Staging now runs
> `0001`–`0013`, proven; production is still at `0001`–`0009`.

## Why this branch exists

MS1–MS4 were implemented directly by the main session, without routing through the owners in
`.claude/agents/`. Verified from session transcripts: only two sessions ever invoked a specialist —
the discovery phase (all eleven, one call each, which produced `04`–`09` and the MS0 evidence) and
one `supabase-database` call at 19:49 on 2026-08-18 for `0010`. MS1, MS2, MS3 and MS4 each show
**zero** specialist calls. A six-owner read-only audit followed; this branch fixes what it found.

Standing rule from the owner, in force since 2026-08-18 19:48: **all implementation goes through the
relevant `.claude/agents/` specialist.** Every change on this branch was written by its owning agent.

## Audit result: 62 findings across six owners

`supabase-database` 7 · `security-privacy` 5 · `devops-vercel` 10 · `nextjs-architect` 20 ·
`qa-reliability` 8 · `product-lead` 12.

The two that mattered most:

1. **`scripts/check-migration-grants.sh` missed `create view`.** Found independently by three owners.
   `ALTER DEFAULT PRIVILEGES ... ON TABLES` covers views; a view runs with owner rights and bypasses
   RLS, so one `create view public.v as select * from saved_places` would have shipped a full
   cross-user read to staging and production with CI green and a local reset clean.
2. **`merge_places` built tombstone chains `resolve_place` could not follow.** `merge(A,B)` then
   `merge(B,C)` left an alias on A resolving to B, a merged-away row; `save_place` would attach a live
   library row to a tombstone. No `merge_places` path was covered by any test, which is why MS4
   missed it.

Confirmed clean, for the record: no cross-user read or write path exists; RLS enabled **and** forced
on all 11 tables; `anon` holds nothing; all four DEFINER functions pin `search_path` and are
`service_role`-only; no secret committed; dedup identity and the 75 m guard match `08` §1.2 exactly;
all twelve `technical-design.md` §14 reconciliations were applied and none lapsed; a real failing
cross-user read does exist under FORCE RLS.

## Task ledger

| # | Task | Owner | State |
|---|---|---|---|
| 1 | Grant guard: broaden table discovery, hard-fail unparseable CREATEs, fail on `public` views/matviews without a revoke from both browser roles; correct the false "locally the defaults are absent" comments | `security-privacy` | **done** |
| 1b | Grant guard: an in-file blanket revoke only counts if it appears *after* the create | `security-privacy` | **done** |
| 2 | `merge_places` re-points tombstones + rejects already-merged winner and loser; resolution walks to the terminal survivor; live-row alias invariant triggers; `extractions` gains the `saved_place_sources` branch; step-1 refresh gains a staleness gate | `supabase-database` | **done** → `0011` |
| 3 | `pg_advisory_xact_lock` before `resolve_place` step 2's probe | `supabase-database` | **done** → into `0011` |
| 4 | `inventory.sql`: check 3 via `role_table_grants`; check 2 compares `qual`/`with_check`; checks 4/5 to cover views; check 7 gains the two new triggers | `qa-reliability` | **done** — executed in Docker |
| 5 | `0008_policy_tests.sql`: assertions for the five unasserted policies; fix the vacuous `extractions` assertion; perform P4's provenance-forgery attempt; settle one assertion count; add the eleven tests 0011 needs | `qa-reliability` | **done** — executed in Docker |
| 6 | ESLint `domain` zone: ban `fetch`/`XMLHttpRequest` globals and `node:*`/`fs`/`http(s)`/`undici`/`axios`; extend `check-layer-guard.sh` | `nextjs-architect` | **done** |
| 7 | `db:push:staging` / `db:push:prod` bound to explicit project refs, + `migration list --linked` and inventory post-check, + rollback posture | `devops-vercel` | **done** — `scripts/db-env.sh` + `db-push.sh` + `db-inventory-remote.sh`, `docs/db-migration-runbook.md`; every refusal path executed locally; **one read-only `migration list` call did reach staging** (no write) — it revealed staging is at `0001`–`0009` with `0011` still local-only |
| 8 | Tier 2 security: `service_role` grant matrix asserted; `places` grant narrowed or `security.md` item 8 answered | `security-privacy` | **done** → `0012` + `inventory.sql` checks 9/9b/9c + `security.md` §2.6 |
| 9 | Tier 2 architecture: `@/app/_lib/*` out of the `ui` zone + `server-only`; declare `ImportStore` and `Clock`; canonicalise `runImport`, segment names, candidate cap 7, confidence enum | `nextjs-architect` | **done** |
| 10 | Tier 2: commit `docs/evidence/db/01-bbox-vs-postgis.md` so no-PostGIS stops being ASSUMED | `supabase-database` | **done** → `b42b5d2` — measured in Docker at 50k/500k/5M: bbox wins every per-user query, the GiST index *is* chosen and loses (1.3 vs 158 ms p95 at 5M); D6 stands, A4 now VERIFIED |
| 11 | Tier 2: write the twelve ADRs into `docs/adr/` | `product-lead` | **DEFERRED past MS5** — not blocking; see below |
| 12 | Fix the three `0011` defects task 4+5 logged — needs its own migration, `0013` | `supabase-database` | **done** → `0013` + `0008_policy_tests.sql` P19c/P19d; executed in Docker |
| 13 | Push `0011`–`0013` to staging and prove them there | coordinator + `devops-vercel` | **done** — applied 2026-08-19; ledger local == remote, inventory 15/15 PASS |
| 14 | Tier 3 doc sync, `main`-resident files only (minus the `DATABASE_URL` entry, done by task 7) | `devops-vercel` + `qa-reliability` | **DEFERRED past MS5** — cosmetic; one line pulled forward, see below |

**One task per session, from here on** — the owner's instruction as of 2026-08-19. Each row above is a
session's worth of work: read this file, do the one task, commit, update this ledger, stop.

## Commit history on this branch

Working tree is **clean**; everything below is committed, nothing is pushed.

```
8c90bd8  0013: give the second alias trigger the tombstone branch          (task 12)
b42b5d2  Measure D6: bbox beats PostGIS on every query this schema issues  (task 10)
f40cd85  Rest the ui boundary on server-only; declare the last two ports   (task 9)
1f98fc4  0012: narrow the places grant, own the service_role matrix        (task 8)
19ae905  Handoff: record tasks 4-7, correct two wrong premises
2abd2d3  Bind schema pushes to a named project, and prove what lands       (task 7)
85f3fd5  Enforce that domain/ does no I/O                                  (task 6)
9d7260a  Prove the schema: broaden inventory checks, assert the policies   (tasks 4+5)
c9466b0  0011: follow merge chains, scope the alias invariant to live rows (tasks 2+3)
bf81517  Grant guard: catch views, unparseable CREATEs, revoke ordering    (tasks 1+1b)
21c4d17  (main) Merge pull request #3 from LiorJossef/ms4-database
```

Task 1's `inventory.sql` comment fix rode along in `9d7260a` rather than being split out of the file.

`npm run verify` and `npm run check:migrations` are green. **Staging is at `0001`–`0013`** as of
2026-08-19; **production is still at `0001`–`0009`** and has seen none of the three. See "Staging push"
below.

## Staging push (task 13) — done, 2026-08-19

`0011`, `0012` and `0013` are applied to `p-002-staging` (`jfuqjzubphfhfleqnkno`) and proven there.
Owner approved the push and the verification; **production was explicitly out of scope and is
untouched at `0001`–`0009`** (confirmed by a read-only `migration list` after the push).

How it went, in the order `db-push.sh` enforces:

- **Dry run first.** `DB_PUSH_DRY_RUN=1 npm run db:push:staging`: static grant guard green (9 relations,
  all revoked from both browser roles, RLS enabled+forced), link state already equal to the staging ref,
  `db push --dry-run` naming exactly the three files. Nothing written.
- **Pre-push inventory failed, as designed.** The read-only proof against `0001`–`0009` raised
  `FAIL 2: policy drift` on `extractions_select_via_source_membership` — staging's policy lacked
  `0011`'s `saved_place_sources` branch. That FAIL was the *expected* shape of a database missing the
  push, and it is the evidence that check 2 compares `qual` for real rather than counting policies.
- **Push:** three migrations applied, no errors.
- **Post-check ledger:** local == remote for all twelve rows, `0001`–`0013`.
- **Post-check inventory: 15/15 PASS, 0 FAIL** against the live staging schema — including check 2's
  sixteen-policy exact `cmd`/`roles`/`qual`/`with_check` match (the pre-push failure now clean), 4b (no
  view bypasses RLS, none granted to a browser role), 7b (all five invariant triggers are constraint
  triggers deferred to COMMIT) and 9/9b/9c (the `service_role` matrix from `0012`).

Two things this closed that Docker could not:

1. **`inventory.sql` check 2's deparse text is version-sensitive by design** and was flagged as
   unproven against a hosted project. Staging runs **PostgreSQL 17.6** and the strings match, so the
   check is now known-good on the hosted major version, not just the container.
2. **`0011`–`0013` are no longer local-only code.** The handoff's standing caveat is retired for
   staging. It still stands for production.

`STAGING_DATABASE_URL` (session-mode pooler URI, password included) now lives in the untracked
`.env.local`. The push command, for the record — the confirmation step needs a TTY or this variable:

```
set -a; . ./.env.local; set +a; DB_PUSH_CONFIRM=jfuqjzubphfhfleqnkno npm run db:push:staging
```

Note for the next operator: in zsh, `. .env.local` searches `$PATH`, not the cwd — it must be
`. ./.env.local`.

**Production push is NOT approved and is not scheduled.** It should wait until MS5 has dealt with the
first deferred row below (`0010` re-creating `resolve_place` wholesale, which would revert tasks 2, 3
and 12), so that production takes one coherent schema rather than a state MS5 immediately rewrites.

## Owner rulings already taken — do not re-litigate

- **Alias invariant: tombstones are exempt.** Merge keeps moving all aliases to the winner (`08`
  §1.4); the `>=1 alias` invariant applies to live rows only. `08` §1.6 amended accordingly.
- **Branch base: off `main`**, with the ~12 MS5-resident findings split out (list below).
- **Already-merged winner *and* loser are rejected** by `merge_places`, not followed — it is an
  operator repair path, and a silent merge into an unnamed row is the defect class that caused this.
- **Staleness predicate: `provider_fetched_at is null or provider_fetched_at < now() - interval '30
  days'`**, plus non-overwriting `coalesce` enrichment when the copy is fresh (so `country_code` /
  `locality`, which the dedup guard reads, do not stay null for 30 days).
- **MS4's two "beyond the milestone" controls were justified, not scope creep** (`product-lead`).
  Flips only if either script grows checks for schema a later milestone owns.

## Next action

**Return to MS5.** The audit branch's blocking scope is closed: tasks 12 and 13 were the only rows that
had to land before MS5, and both are done. Start MS5 with the first row of the "Deferred to
`ms5-design`" table below — **`0010` re-creates `resolve_place` wholesale and will silently revert tasks
2, 3 and 12** — because every later MS5 change sits on top of it.

**Tasks 11 and 14 are deferred past MS5** (owner agreed, 2026-08-19). Neither blocks anything:

- **Task 11, the twelve ADRs.** A record of decisions already made and already documented in `06`–`09`.
  Graded R1, so it cannot be dropped, but nothing in MS5 depends on `docs/adr/` existing. Do it when the
  design work needs a decision log, or before the grading milestone — not now.
- **Task 14, Tier 3 doc sync.** Cosmetic throughout. The one item that looked like a live control gap —
  `ms3-branch-protection.md:8` omitting the `database` job from the required checks — **is not one.**
  Verified 2026-08-19: rulesets and classic protection are Pro/Team-only for this private repo (the 403
  is recorded in that doc), so there are no required checks on GitHub at all, `main` rests on the
  client-side `.githooks/pre-push`, and the doc already states that CI cannot be a merge gate. The
  sentence was simply stale — it said "three CI jobs" when the workflow has four. **Corrected in place**
  as the only piece of task 14 pulled forward, since it is a false claim about a control and the next
  session reads that file cold. Everything else in task 14 waits.
  Also folded into task 14: the `0011` header §2 sentence from task 12's deferral list.

Sequencing rationale, for the record: schema work went first because MS5 rewrites `resolve_place`;
documentation went last because MS5 rewrites the documents. `08-place-identity.md`'s three known-wrong
§6 statements and the §1.2 serialisation note are held for the same reason and are listed below.

### Tasks 4 + 5 outcome (2026-08-19, second session)

**The handoff's premise was wrong: Docker *is* available locally.** `qa-reliability` stood up
throwaway `supabase/postgres:17.6.1.064` containers, applied `0001`–`0009` + `0011`, and **executed
everything**. Nothing touched staging or production. `0011` therefore is no longer unexecuted code.

- `inventory.sql` 264 → 501 lines: 11 PASS lines, 15 distinct FAIL raises. Check 3 now goes through
  `role_table_grants` *plus* `role_column_grants` and two `aclexplode` catalogue sweeps (the
  `information_schema.role_*` views only show currently-enabled roles and omit matviews entirely).
  Check 2 compares `cmd`/`roles`/`qual`/`with_check` for all sixteen policies. Checks 4/5 moved to
  `pg_class.relacl`/`pg_attribute.attacl` over `relkind in ('r','p','v','m','f')`; new 4b fails any
  non-`security_invoker` view and any view/matview granted to a browser role, new 4c fails anything
  granted to `PUBLIC`. Check 7 covers eleven triggers; new 7b asserts all five invariant triggers are
  deferrable+initially-deferred constraint triggers. Every check was verified in the failing direction.
- `0008_policy_tests.sql` 264 → 1163 lines: **51 PASS + 1 UNPROVEN**, 106 distinct FAIL raises.
  Seven (not five) unasserted policies now have behavioural tests. The vacuous `extractions`
  assertion is fixed by creating a real row, and new P0b asserts the positive half of all six
  membership gates — without it the whole P1–P3 suite was satisfiable by a deny-all schema. P4's
  forgery is performed three ways, including `save_place(place, A's source)` as B. 0011 coverage is
  P10–P23, 18 named assertions (superset of the eleven). Mutation-verified: reverting `resolve_place`,
  `merge_places`, or the `extractions` policy, or dropping either new trigger, each fails loudly.

**Resolved from the "least-provable" list:** `0011` parses and runs; no `::bigint` cast is needed;
`place_survivor_id` terminates on a 3-deep chain and on a hand-crafted cycle; both new triggers fire
deferred and `merge_places` still succeeds with `ppr_alias_retained_on_move` installed.

**Still unproven, deliberately:**
- **P23, two-session mutual exclusion, is recorded in the test file as DELIBERATELY UNPROVEN.** A psql
  script is one session and D6 forbids adding `dblink`/`pg_background`. The file names the exact
  two-connection harness that would prove it, incl. the `pg_locks where not granted` barrier and the
  0007 control. `08` §4 still claims the invariant prevented and **CI does not assert it.** It *was*
  proven out-of-band in the sandbox with two psql sessions over FIFOs — with `0011`: session 2 blocked,
  both got the same uuid, 1 place / 2 aliases; with 0007: no waiter, 2 places. That evidence lives in
  the session report only, not in the repo.
- Firing at a literal `COMMIT` (the script must never commit; `set constraints all immediate` stands in).
- The real hosted environments. Check 2's deparse text is version-sensitive by design and will fail
  loudly with both strings printed if staging runs a different major version.

**New defects found, not fixed:**
1. `0011:395`–`434` vs `0005:76`–`100`: the tombstone exemption reached only one of the two triggers.
   `places_alias_required`/`assert_place_has_alias` (0005) has no tombstone branch, so creating a place
   and merging it away *in the same transaction* aborts at COMMIT. Low severity (merge is an operator
   path, normally its own transaction) but it makes `0011`'s documented scope untrue. One-line fix in a
   later migration: the same `merged_into_place_id is not null → return null` branch.
2. `0011:317`–`318`: the `::bigint` uncertainty can be closed — the one-argument
   `pg_advisory_xact_lock` has only the `bigint` overload. Comment should be updated.
3. `0011:70`–`72`: comment is wrong. `assert_place_alias_retained` fires only on alias DELETE /
   UPDATE OF `place_id`, so nothing "complains" when a cyclic chain hands back a tombstone. The walk is
   bounded, but the loud half does not exist.
4. `merge_places` is unsafe under immediate constraints (design consequence): it empties the loser's
   aliases before tombstoning it. Now guarded by check 7b and stated in P16's comment.
5. **Audit finding #1 downgraded in severity.** After `0008` step 1, a relation created by `postgres`
   (how migrations and the dashboard SQL editor run) arrives `service_role`-only — measured: a
   `create view public.v as select * from saved_places` got **no** browser-role grant. The `create view`
   hole needs an explicit grant or a `supabase_admin`-created object; it is not automatic. This is why
   4b asserts non-`security_invoker` views regardless of grants — a grant-only check would have passed
   on a live cross-user view.

**Also learned:** `npm run db:verify` is runnable locally today via Docker. Only friction is that the
bare `supabase/postgres` image's `auth.uid()` reads `request.jwt.claim.sub`; the hosted
`coalesce(...)` form must be installed as `supabase_auth_admin`. The CLI's own local stack seeds the
hosted form, so `supabase db reset` should need no shim — **unverified.**

## Open items needing an owner decision

- **Task 1's residuals:** `inventory.sql` checks 4/5 filter `relkind = 'r'` so views are invisible to
  the *runtime* proof (folded into task 4); sequence default privileges are uncovered (theoretical —
  every PK is a uuid, no migration creates a sequence); a `create table` inside a dollar-quoted
  function body would produce a loud false failure (safe direction, left alone).
- **`save_place` still accepts a tombstone** if a caller passes `p_place_id` directly rather than via
  `resolve_place`. Candidate for a later migration; flagged, not done.
- **`08` §1.2's pseudocode and §4's row do not mention serialisation** — §4 claims the invariant is
  prevented by the unique constraint plus the guard, which was only true single-threaded. A one-line
  addition to each would make the docs match `0011`. Held back deliberately to keep
  `08-place-identity.md` from becoming an `ms5-design` merge conflict.
- **Two read-only audit queries for staging**, from the schema owner — whether either 0005-era defect
  has already occurred. `0011` fixes resolution *over* existing chains but does not retro-fit them.
  Needs explicit owner approval before anything touches staging:
  - `select id, merged_into_place_id from places p where merged_into_place_id in (select id from places where merged_into_place_id is not null)`
  - `select p.id from places p where p.merged_into_place_id is null and not exists (select 1 from place_provider_refs r where r.place_id = p.id)`

## Tier 2 — on this branch, not blocking

**Tasks 8, 9 and 10 are done** (see the ledger and the session logs below). One remains:

- **Task 10 is done** (`b42b5d2`). See "Task 10 outcome" below.
- **Task 11 — the twelve ADRs into `docs/adr/`.** Graded R1, referenced by charter §10, `03`, and
  `07` §663. The directory does not exist.

### Task 10 outcome (2026-08-19, bbox vs PostGIS)

`docs/evidence/db/01-bbox-vs-postgis.md`, with `bench/` (11 scripts) and `raw/` (4 logs) beside it.
Throwaway `supabase/postgres:17.6.1.064` container, migrations `0001`–`0009` + `0011` + `0012`
applied, PostGIS 3.3.7 installed alongside; 500 places per user at 100 / 1,000 / 10,000 users
(50k / 500k / 5M rows); 200 randomised warm executions per query shape. Staging and production
untouched.

- **D6 stands.** Q-VIEWPORT / Q-NEAR p95 at 10× design scale: **2.31 / 2.90 ms** against `08` §6.4's
  25 ms fail line. PostGIS is 1.5× slower at 50k, 3–5× at 500k, **100× at 5M**.
- **`08` §6.2's "the GiST index is never chosen" is false.** It is chosen, and it loses: at 5M the
  PostGIS plan scans 38,247 places and probes `saved_places` 38,247 times (159 ms) where the shipped
  plan drives from `saved_places(user_id)` and probes `places` by PK 500 times (1.56 ms). Drop the
  GiST index and `ST_DWithin` is competitive again — the library is fine, the index is the liability.
- **Flip-point: 370,000 places, global KNN only** (`08` §6.4 trigger 4), where the haversine sort
  first crosses 25 ms p95 and GiST `<->` is 486× faster at 5M. Trigger 2 (viewport with no `user_id`)
  **did not reproduce** — PostGIS wins it at 50k/500k and loses it at 5M.
- **Correctness:** the guard's effective radius is 74.59–75.42 m (sphere vs ellipsoid); disagreement
  with `ST_DWithin` is confined to a ±0.42 m shell. The polar clamp narrows the longitude window
  above **|lat| 89.4266°** and the antimeridian is a demonstrated miss — both dedup-guard false
  negatives, i.e. a duplicate pin, and neither reachable in this product's domain. In the other
  direction, `geog && envelope::geography` over-selects the viewport by **17.6%**.

**Not done, deliberately, and needing an owner:** three `08` §6 statements are now measurably wrong
or mis-aimed (§6.2's GiST row, §6.2's correctness row, §6.4's trigger 2). The task's scope allowed
only the label and pointer in `02-risks-and-unknowns.md`, so `08-place-identity.md` is untouched —
and it is `ms5-design`-adjacent, the same reason §1.2's serialisation note was held back. Both edits
should go together.

## Task 12 outcome (2026-08-19) — `8c90bd8`

All three `0011` defects are fixed. `supabase/migrations/0013_alias_invariant_tombstone_branch.sql`,
plus comment-only edits inside `0011` and two new tests.

1. **The tombstone exemption now reaches both alias triggers.** `0013` does
   `create or replace function public.assert_place_has_alias()` with the same three branches its
   `0011` twin has — place gone → `return null`; `merged_into_place_id is not null` → `return null`;
   otherwise live and must hold ≥1 provider ref, keeping `0005`'s message and `errcode 23514`
   verbatim so P17/P18's `'no provider ref'` match still discriminates between the two triggers. One
   `select … into` + `if not found`, so "gone" and "tombstone" come from one snapshot. `create or
   replace` keeps the oid, so `places_alias_required` stays the DEFERRABLE INITIALLY DEFERRED
   constraint trigger inventory check 7b asserts. No table, column, policy, grant or trigger was
   created or altered. `0011`'s documented scope is now true.
2. **`0011:317`–`318`'s `::bigint` note corrected** — one-argument `pg_advisory_xact_lock` has exactly
   one overload, `bigint` (the `(int,int)` form takes two), so `hashtext`'s integer widens
   unambiguously and no cast is needed. Cross-referenced to P22, which reads the key back out of
   `pg_locks`.
3. **`0011:70`–`72`'s comment corrected** — a cyclic chain is now described as **bounded but silent**.
   Verified rather than taken on trust: `resolve_place` step 1 returns `place_survivor_id(...)`
   straight to the caller and neither deletes an alias nor updates `place_id`, so a pre-existing cycle
   would be saved as a tombstone with no error. What prevents *new* cycles is `merge_places` rejecting
   an already-merged winner or loser. This is what the two staging audit queries below are for.

**Ruling: defects 2 and 3 were edited in `0011` in place, not restated in `0013`.** `0011` had never
been applied anywhere, so the forward-only rule (`08` §9) had no applied artefact to protect, and the
`::bigint` comment sits *inside* `resolve_place`'s body where a later file could not correct it without
recreating the function. `0013` carries a block recording both edits and that no behaviour changed.

**Verification.** Throwaway `supabase/postgres:17.6.1.064` container, `0001`–`0009` + `0011` + `0012`
+ `0013`, `auth.uid()` shim installed as `supabase_auth_admin`. Staging and production untouched.

- `0008_policy_tests.sql`: **53 PASS + 1 UNPROVEN (P23), 0 errors** (was 51 + 1). New P19d: a
  transaction that creates a place and merges it away in the *same* transaction now COMMITs cleanly.
  New P19c: a live place with no provider ref is still rejected at the checkpoint.
- `inventory.sql`: **15 PASS, 0 errors**. Correction to an earlier entry in this file: it emits 15 PASS
  lines, not 11 — 0, 1, 2, 3, 4, 4b, 4c, 5, 6, 7, 7b, 8, 9, 9b, 9c.
- Failing direction, both mutations: restoring `0005`'s body reproduces
  `place <uuid> has no provider ref (identity invariant, 08 §1.6)` at P19d while P19c still passes;
  gutting the check to `begin return null; end` fails P19c. P19c exists because the way to make P19d
  pass by accident is to weaken the loud half.
- `npm run verify` and `npm run check:migrations` green.

**Deferred out of task 12, needing an owner:**

1. **`0011`'s header §2 is still overstated** — "the invariant … is now enforced as one" was only half
   true until `0013`. Left alone: the task authorised comment edits for defects 2 and 3 only, and
   `0013`'s own header states the correction. One sentence in `0011` closes it. **Cosmetic; deferred
   to task 14.**
2. **`inventory.sql` check 1 says "nine tables"** while the audit prose and check 8's conditional say
   eleven. It passes; the count may simply describe a nine-table local shape. Almost certainly the
   same finding as the already-deferred "check 1's 11-table count needs the conditional check 8 has"
   row — **folded into that `ms5-design` row, one fix, not two.**
3. **`0008` cannot alter `supabase_admin`'s default privileges in the bare image** (three NOTICEs on
   apply, by design). Confirms the container does not carry the hosted defaults, so
   `check-migration-grants.sh` remains the only control that proves the revokes. No action.

Also still open, from task 8: `place_provider_refs` is granted table-wide (`0005:98`) and
`first_seen_at` carries the same row-age signal that `0012` removed from `places` — ruled acceptable,
a disclosed residual. And `extractions` is granted table-wide (`0004:33`) and may need no grant at
all; not touched because it would invalidate three `0008_policy_tests.sql` assertions that currently
prove the membership gate works.

## Tier 3 — mechanical doc sync, `main`-resident files only

`03`'s Milestone-1 and Milestone-14 mismatches · `02`'s "dated plan" and 15-milestone count ·
`README` `verify` list missing `check:migrations` · `DATABASE_URL` absent from `.env.example` and the
env matrix · `ms2-cloud-setup.md:45` telling you to store a `NEXT_PUBLIC_COMMIT_SHA` value Vercel will
not expand · `ms3-branch-protection.md:8` omitting the `database` job from required checks · MS2's
preview deploy recorded DONE but only production ever evidenced · `security.md` owed item 9 already
moot in the delivered schema.

## Deferred to `ms5-design` — apply when MS5 resumes

| Finding | Where | Owner |
|---|---|---|
| **`0010` re-creates `resolve_place` wholesale, so it will silently revert tasks 2 and 3** — do this first | `0010:288,298` | `supabase-database` |
| Check 1's 11-table count needs the conditional check 8 already has | `inventory.sql` | `qa-reliability` |
| `pg_trgm`-in-`extensions` rationale is factually wrong (extension functions get EXECUTE to PUBLIC wherever they live; both roles hold USAGE on `extensions`). No exposure — check 6 simply does not *see* them — but its PASS overstates its scope | `0010:22`, `inventory.sql:214` | `security-privacy` |
| `normalise()` has no legal home: `10` puts it in `integrations/`, the scorer that needs it is in `domain/`, and that import is an ESLint error | `10-poi-index.md:155` | `nextjs-architect` |
| `PlaceResolver` is three incompatible interfaces; `RankedPlace` / `ResolveResult` exist in no type vocabulary | `06`/`07`/`technical-design` | `nextjs-architect` |
| `06` §8's `MapSurface` seam vanished with no reconciliation, and its "nothing outside `integrations/maps` may import `maplibre-gl`" rule is unenforced | `06:292`, `technical-design:135` | `nextjs-architect` |
| Plan arithmetic: §6 says 42 hd / 4 hd deficit, §15 says 44; and the reserve double-counts MS5's re-size. Corrected: 44 − 7 cuttable = **37 against 38**, i.e. it fits with 1 hd margin rather than being ~1 hd over | `implementation-plan.md:131,492` | `product-lead` |
| "The ledger has no open row" contradicted by D9 PARTIALLY CLOSED and D11 HALF-CLOSED in the same table | `implementation-plan.md:65` | `product-lead` |
| `0001–0008` migration lists; "policy fixtures from 0008 seeded" into both environments, which R12 forbids for production | `implementation-plan.md:117,198` | `product-lead` |
| Six-vs-nine tables in the M3-graded §7 (`saved_place_sources` and `place_lookups` missing; `03` says five) | `implementation-plan.md:145` | `product-lead` |
| `10-` number collision: `10-poi-index.md` vs `10-pipeline-evaluation.md` reserved for MS15 | `implementation-plan.md:433` | `product-lead` |
| `technical-design` §16 lists trigram under "deliberately not built" while §4.4 records `0010` creating `pg_trgm` | `technical-design.md:647` | `nextjs-architect` |
| Streaming/duration probe that `maxDuration = 60` rests on is tracked nowhere | `07:85`, `technical-design.md:620` | `devops-vercel` |
