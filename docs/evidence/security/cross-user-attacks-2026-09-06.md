# Nine cross-user attacks, executed — 2026-09-06

**Status: VERIFIED, with a named caveat about the database state (see §2).**
This is the artefact behind the Security document's headline claim ("9 cross-user attacks, all 9
failed"). Before today that claim carried no evidence file; every other capability claim in this
repo carries one.

- **Base commit:** `8a4445f` (`docs/product-requirements-html`)
- **Harness:** `tests/manual/cross-user-attacks.manual.sql` (probe harness, not part of `npm run db:test`)
- **Target:** the local Supabase container, `127.0.0.1:54322`
- **Run:** `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=0 -f tests/manual/cross-user-attacks.manual.sql`

---

## 1. What the harness does

One transaction, ending in `ROLLBACK`. It creates two fixture users in `auth.users`, has the
**victim** save a place (with a source and a private note) and create a collection, then switches to
the **attacker** with `set local role authenticated` and `request.jwt.claims` set to the attacker's
`sub` — exactly the way PostgREST runs a browser request. `FORCE ROW LEVEL SECURITY` is what makes
this a fair test: the table owner is subject to its own policies, and only `postgres` and
`service_role` (both `BYPASSRLS`) are exempt.

Every assertion is written so that a **successful** attack prints `FAIL`. An attack that raises is
caught and reported with its SQLSTATE, because "permission denied" (42501, decided by the grant,
before any policy is consulted) and "zero rows" (decided by the policy) are different defences and
the document distinguishes them.

One trap this harness hit and now documents: **do not `\i` a migration file into it.** Migrations
carry their own `begin;`/`commit;`, so an include commits the enclosing transaction and the
`rollback` at the foot stops protecting anything. The first draft did exactly that and wrote fixture
rows to disk; they were removed by hand (§2).

## 2. The database state this was measured against — read this before quoting the result

Measured at the moment of the run:

| | |
|---|---|
| Tables in `public` | **17** |
| RLS **enabled** | **17 of 17** |
| RLS **forced** | **17 of 17** |
| Policies in `public` | 35 |
| `supabase_migrations.schema_migrations` top entry | `0027` |

**Caveat, stated rather than hidden.** This container is not a clean `0037`. Its recorded migration
level is `0027`, and the harness's first draft (the `\i` mistake above) applied `0033`, `0034` and
`0035` out of order before it was corrected, so the physical schema is `0027` plus those three and
without `0028`–`0032`, `0036`, `0037`. The **17/17 enabled-and-forced** figure and the nine attack
results are therefore true of *this* schema. The document's "38 policies" comes from the
`0037` measurement made separately by the orchestrator, not from this run — the 35 here is the same
count minus the policies of the tables `0036`/`0037` add.

The tables the nine attacks actually exercise — `saved_places`, `saved_place_sources`, `sources`,
`collections`, `collection_members`, `collection_invites` — are **unchanged** between `0027` and
`0037`, so the result transfers. A clean re-run after `supabase db reset` would close the caveat and
is an orchestrator action, not mine.

**Container left dirty, and the orchestrator should know.** The out-of-order `0035` left
`public.profile_names` (and its policies and triggers), `public.repoint_saved_place`, and `0034`'s
`save_place` body on the container. Fixture rows are gone (verified: zero `@example.test` users,
zero `Victim%` places, `saved_places` back to its pre-run 60). The schema drift was **not** reverted:
the drop/restore script was refused by the permission system, correctly — reverting a schema is an
orchestrator action. A `supabase db reset` restores it. Nothing hosted was touched.

## 3. The nine attacks and what each returned

The attacker is signed in as an ordinary user throughout; `sp` is the victim's saved place, `coll`
the victim's collection.

| # | What the attacker does | Result | Refused by |
|---|---|---|---|
| A1 | `select` the victim's saved places by their `user_id` | **0 rows** | policy |
| A2 | Read sideways: `saved_place_sources` joined to `sources`, keyed by the victim's saved place | **0 rows** | policy |
| A3 | `count(*)` the victim's row, in case an aggregate leaks what a select will not | **0** | policy |
| A4 | `update ... set note` on the victim's saved place | **0 rows affected** | policy |
| A5 | `delete` the victim's saved place | **0 rows affected** | policy |
| A6 | Reassign it: `set user_id = <attacker>` | **refused**, `permission denied for table saved_places` (42501) | **grant** — `user_id` carries no UPDATE grant, so this fails before any policy runs |
| A7 | Collection takeover: `insert into collection_members (coll, self, 'owner')` | **refused**, `permission denied for table collection_members` (42501) | grant |
| A8 | Mint an invite to the victim's collection (a chosen bearer token) | **refused**, `new row violates row-level security policy for table "collection_invites"` (42501) | policy |
| A9a | `apply_saved_place_extraction(sp, self, …)` — a `SECURITY DEFINER` writer aimed at the victim's row | **refused**, `permission denied for function` (42501) | grant on the function |
| A9b | `apply_saved_place_source_link(sp, src)` — a definer writer the attacker *may* execute | **returned void, wrote nothing** | the function's own `sp.user_id = auth.uid()` predicate |
| A9c | `collection_role(coll)` — ask the database what role we hold in the victim's collection | **null** | the function answers only about `auth.uid()` |

A9b is the one worth reading twice. `apply_saved_place_source_link` is `SECURITY DEFINER` and
`authenticated` **is** granted execute on it, so it does not raise — it returns void and no-ops,
because its `UPDATE` requires both `sp.user_id = auth.uid()` and a `saved_place_sources` row owned
by the caller. A definer function that silently no-ops and one that refuses look identical from the
caller's side, which is why the harness does not trust the absence of an exception: after the role
is dropped it re-reads the victim's row as `postgres` and asserts the owner and the note are
unchanged. They were.

**Signed out**, as `anon`, the same operations fail a step earlier and more bluntly — reading
`saved_places`, deleting from it, calling `save_place`, and reading `collections` all raise
`permission denied` (42501). The anonymous role holds nothing to be filtered.

## 4. Verbatim output

```
 rls_enabled | rls_forced | tables
          17 |         17 |     17
 policies
       35
PASS A1  direct read of the victim's saved places -> 0 rows
PASS A2  sideways read via saved_place_sources -> 0 rows
PASS A3  aggregate count of the victim's row -> 0
PASS A4  update of the victim's note -> 0 rows affected
PASS A5  delete of the victim's row -> 0 rows affected
PASS A6  ownership reassignment refused: permission denied for table saved_places (42501)
PASS A7  collection takeover refused: permission denied for table collection_members (42501)
PASS A8  invite forgery refused: new row violates row-level security policy for table "collection_invites" (42501)
PASS A9a apply_saved_place_extraction refused: permission denied for function apply_saved_place_extraction (42501)
NOTE A9b apply_saved_place_source_link returned without error — its effect is asserted after the role is dropped, below
PASS A9c collection_role() on the victim's collection -> null
PASS A9b the victim's row is byte-for-byte what it was: same owner, same note
PASS anon read of saved_places refused: permission denied for table saved_places (42501)
PASS anon delete of saved_places refused: permission denied for table saved_places (42501)
PASS anon save_place refused: permission denied for function save_place (42501)
PASS anon read of collections refused: permission denied for table collections (42501)
```

## 5. What this does not prove

- It proves nothing about the `0036`/`0037` tables and policies, which this container does not have.
- It is one schema at one moment. `scripts/check-migration-grants.sh` — which fails CI if a new
  table ships without RLS enabled *and* forced and without the revoke from both browser-reachable
  roles — is the thing that keeps the property true as migrations land; this file is the
  point-in-time proof that the property currently holds.
- Knowing a `places` id still lets any signed-in user read that `places` row. That is by design —
  `places` is shared open-data content — and it reveals a public name and location, never who saved
  it or their private note. Named in the Security document, §2.3.
