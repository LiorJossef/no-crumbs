# Adversarial review of `0024_collections.sql` — L2-COLLECTIONS-T2

> `security-privacy`, 2026-08-29. Independent of the migration's author and of
> `supabase/tests/0024_collections_policy_tests.sql`, which I read only to find out what was
> *already* covered so I could attack elsewhere. Every result below is my own SQL against the local
> container at `127.0.0.1:54322`, migration `0024` and `0025` applied.
>
> **Method.** Four fresh adversary users (A owner, B editor, C viewer, D non-member) with ids
> distinct from the author's fixture, built inside a transaction that is rolled back. Nothing was
> committed; nothing was dropped or truncated; `npm run db:reset` was not run. Verified after the
> last run: `saved_places = 31`, `extractions = 22`, `places = 31`, zero rows left behind
> (`auth.users where email like '%example.test'` → 0, `places where name like 'Atk %'` → 0).
>
> **I am not exercising the data-exposure veto.** The privacy claim the feature rests on held under
> every attack I could construct. The two failures below are access-control failures, not
> disclosure failures.

---

## Verdict

| | |
|---|---|
| Data exposure (my veto) | **No finding.** `saved_places` is unreachable by a collaborator on 13 distinct routes, including `visit_state`. |
| Must fix before this ships to real collaborators | **F1**, **F2** — removal and demotion are not durable. One shared root cause, one small fix. |
| Fix the comment, not the code | **F3** — the migration's headline security argument for the `saved_places` conjunct is not the control it says it is. |
| Acceptable at university scale, documented | F4 (invite lifetime), F5 (token in the URL), F6 (function default privileges), F7 (`service_role` TRUNCATE on the older tables) |
| Owner ruling requested | §3, `collections.owner_id on delete cascade` vs GDPR Art. 17 |

---

## 1. FAILs

### F1 — Removing a member does not remove them. **MUST FIX before real collaborators.**

**What an attacker does.** They were invited once, they joined, the owner removed them. They click
the same link again.

**What they get.** Full membership back, at the link's role, with no further action by the owner —
and with it the `places` read on everything in the collection.

```sql
-- as A (owner)
delete from public.collection_members
 where collection_id = :coll and user_id = :c;                    -- OK, 1 row
-- as C, the person just removed
select count(*) from public.collections where id = :coll;         -- 0   (correctly gone)
select public.join_collection_via_token(:tok_viewer);             -- returns the collection id
select public.collection_role(:coll);                             -- 'viewer'   <-- FAIL
select name from public.places where id = :p_shared;              -- 'Atk Shared Bar'  <-- back in
```

**Why the author's tests do not catch it.** C6b asserts that redeeming a *second, lower* token does
not downgrade an existing member, and C6c that the owner cannot demote themselves. Both assume the
membership row still exists. `on conflict (collection_id, user_id) do nothing` is only a protection
while there is a row to conflict with; a removal deletes exactly that row.

**Why it is not merely theoretical.** `src/app/actions/collections.ts` keeps at most one live link
per collection (`createInvite` calls `revokeInvite` first), but `removeMember` does **not** revoke
it, and the UI gives the owner no signal that it should. So the default outcome of "remove this
person" is that they can rejoin, and `collection_members` records `invited_by` but not *which*
invite was used, so the owner cannot even tell which link to kill.

**Minimum fix** (owning agent: `nextjs-architect` for (a), `supabase-database` for (b)):
- (a) cheapest, closes it today: `removeMember` revokes the collection's live invite in the same
  action, and the confirm copy says so — "removing them also turns off the share link".
- (b) correct, if per-person removal must survive a live link: a tombstone
  (`collection_members.removed_at`, or a `collection_removals` table) that
  `join_collection_via_token` consults before inserting.

This is an authorisation failure, not a disclosure failure, so it is not a veto — but the data
behind it is *where a person goes*, and "I removed them" quietly not working is the wrong failure
mode for that.

### F2 — A demoted collaborator can restore their own editor rights. **MUST FIX, same root cause.**

**What an attacker does.** The owner demotes them from editor to viewer. They leave the collection
themselves — which `collection_members_delete_self_or_by_owner` explicitly permits — and re-click
the editor link they were originally sent.

**What they get.** `editor` again, and a working write.

```sql
-- as A: demote B
update public.collection_members set role='viewer' where collection_id=:coll and user_id=:b;  -- 1 row
-- as B
select public.collection_role(:coll);                       -- 'viewer'
select public.join_collection_via_token(:tok_editor);       -- re-click, still a member
select public.collection_role(:coll);                       -- 'viewer'   <- C6b holds, PASS
delete from public.collection_members
 where collection_id=:coll and user_id=:b;                  -- OK, 1 row  (leaving is allowed)
select public.join_collection_via_token(:tok_editor);       -- re-click after leaving
select public.collection_role(:coll);                       -- 'editor'   <-- FAIL
update public.collection_items set note='RE-ESCALATED EDITOR WROTE THIS'
 where collection_id=:coll;                                 -- OK, 1 row
```

The attacker uses nothing they were not already given. Precondition: the collection's live link
carries `editor`, which is the common case when an owner shared an edit link and then demoted one
person. Same fix as F1 — (b) closes both; (a) closes F1 and reduces F2 to "the owner must reissue
the link after a demotion", which is at least visible.

### F3 — The `saved_places` conjunct is not the bound the migration says it is. **Fix the comment.**

`collection_items_insert_editor`'s third conjunct is justified in the migration (lines 391–396) as
the thing that stops `collection_items` becoming "a read primitive over every place row in the
database". It does not do that, because the conjunct is satisfiable at will:

```sql
-- as D, a user with no collections and no places at all
select count(*) from public.places;                            -- 0
select public.save_place(:p_secret, null, 'stolen');           -- OK  <-- no readability check
select name, lat, lng from public.places where id = :p_secret; -- 'Atk Secret Clinic' @48.8566,2.3522
```

`save_place` is `SECURITY INVOKER` and `saved_places_insert_own` checks only `user_id = auth.uid()`;
neither checks that `p_place_id` is a row the caller may read. `places_select_if_saved` (0006) then
opens the row. So the primitive the header worries about already existed before 0024, does not need
collections, and is reachable from the browser today: `saveCollectionPlace(placeId)` in
`src/app/actions/collections.ts:476` passes an unvalidated client-supplied uuid straight into
`save_place`.

**Impact: low.** `places` holds global POI identity — name, category, lat/lng, address, all
Overture/Google-derived. Reading a `places` row you did not save discloses no user's data, and the
`places` grant is column-level (`provider_payload`, `name_key`, `merged_into_place_id` are not
readable at all). The real bound is uuid unguessability, and there is an existence oracle over that
space, but it is 122 bits:

```sql
insert into public.saved_places (user_id, place_id, origin)
values (:d, '00000000-0000-4000-8000-000000000000', 'manual');
-- ERR 23503 : violates foreign key constraint "saved_places_place_id_fkey"   (exists / does not)
```

**Why it still matters.** A comment that names a control which is not the control trains the next
reviewer to skip the check. The conjunct should stay — it is right for integrity — but the header
should say it bounds *attribution*, not *reachability*, and should point at
`places_select_if_saved` as the actual boundary. Owning agent: `supabase-database`, comment-only in
the next migration's header, or a correction note in `docs/security.md`.

### F4 — Invite links never expire, are unlimited-use, leave no audit row, and revocation is reversible. *Documented, not blocking.*

Measured on all four fixture invites: `expires_at` is null unless the caller sets it, and
`src/components/collections/share-panel.tsx` never sets it, so every link the product issues today
is permanent. Redemption does not consume the invite and writes no record of who redeemed what.
There is no rate limit anywhere in the database:

```
3000 failed redemptions in 00:00:00.028646   -- no lockout, no backoff, no audit row
```

Brute force is not the risk (122 bits). Forwarding is: one link, forever, any number of strangers,
each of whom then reads the collection's places and every member's `profiles` row. Combined with F1
this is why removal has to actually remove. **Recommend** a default `expires_at` (7 days) at
creation and a `redeemed_at`/use-count column; both are additive.

Two smaller notes in the same family, neither a break:
- The owner can un-revoke a revoked invite (`update ... set revoked_at = null` succeeds). Owner-only,
  so it is a capability rather than a hole, but "revoked" is not a terminal state.
- `revokeInvite` returns `{ ok: true }` for a caller who owns nothing, because it does not check the
  affected-row count the way `removeMember` and `updateMemberRole` do. Not an oracle — it is true
  for every collection id, real or invented — but it is inconsistent with its siblings.

### F5 — The bearer token travels in the URL path, then in a query string. *Documented, cheap fix.*

`/collections/join/<token>` puts a credential in a path, and the signed-out branch of
`src/app/collections/join/[token]/page.tsx:75` forwards it into
`/sign-in?next=/collections/join/<token>` — a query string. `next.config.ts` sets **no security
headers at all**: no `Referrer-Policy`, no CSP.

The third-party `Referer` leak is mitigated by the browser default
(`strict-origin-when-cross-origin` sends origin only), so map tiles do not see it. What is not
mitigated: Vercel and CDN access logs record the full path and query, and so does browser history
and anything that autocompletes or previews a link. **Minimum fix:** `Referrer-Policy: no-referrer`
on `/collections/join/*` and `/sign-in`, and carry the pending token in a short-lived cookie
instead of `?next=`. Owning agent: `nextjs-architect`.

### F6 — A new function in `public` still arrives EXECUTE-able by `PUBLIC`. *Pre-existing; the guardrail stays load-bearing.*

Independently measured, twice, inside a rolled-back transaction:

```sql
create function public.zz_probe_fn2() returns int language sql as $$select 1$$;
select proacl,
       has_function_privilege('public','public.zz_probe_fn2()','EXECUTE') as pub,
       has_function_privilege('anon','public.zz_probe_fn2()','EXECUTE')   as anon
  from pg_proc where proname='zz_probe_fn2';
--  proacl | pub | anon
--  <null> |  t  |  t
```

This is despite a live `pg_default_acl` row `postgres | public | f | {postgres=X/postgres}` written
by `0008`. A table created in the *same transaction* did pick up its `postgres`-owned default
(`{postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}`), so the table entry applies and the
function entry does not. **I could not explain the asymmetry and am not going to guess**; the
security-relevant fact is measured and unambiguous, and it means `agent-guardrails.md` §18's
`revoke ... from public` rule is still the only thing standing between this repo and a third
`0009`/`0018`. `0024` does it on all seven functions. Current state of the whole schema is clean:

```sql
select p.proname from pg_proc p
 where p.pronamespace='public'::regnamespace
   and has_function_privilege('public', p.oid, 'EXECUTE');
-- (0 rows)
```

### F7 — The default-privilege surface, verified independently. *Author's claim confirmed; two leftovers.*

The author's `pg_default_acl` finding is **VERIFIED**, not taken on trust:

```sql
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl
  from pg_default_acl where defaclnamespace = 'public'::regnamespace;
--  postgres | public | r | {postgres=arwdDxtm/postgres,service_role=Dxtm/postgres}
--  postgres | public | S | {postgres=rwU/postgres,service_role=w/postgres}
--  postgres | public | f | {postgres=X/postgres}
```

and reproduced end to end — a table created by `postgres` in `public` arrives with
`service_role=Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN), which is not subject to RLS. Note
that `anon`/`authenticated` get **nothing** on a table created by `postgres` locally; the wide
`supabase_admin` default only applies to objects `supabase_admin` creates. `0024`'s revoke of the
browser roles is therefore belt-and-braces here and load-bearing on the hosted projects — which I
cannot check (standing owner hold), so hosted behaviour is **ASSUMED** from `0008`'s header.

The four new tables are clean. Measured privilege matrix:

| table | sr TRUNCATE | sr REFERENCES | sr TRIGGER | sr MAINTAIN | sr SELECT | auth TRUNCATE | anon SELECT |
|---|---|---|---|---|---|---|---|
| `collections`, `collection_members`, `collection_items`, `collection_invites` | f | f | f | f | f | f | f |
| `poi_index`, `poi_regions` | f *(0025)* | **t** | **t** | **t** | t | f | f |
| `place_lookups`, `places`, `sources`, `extractions`, `imports`, `profiles`, `saved_places`, `saved_place_sources`, `place_provider_refs` | **t** | t | t | t | t | f | f |

Two things the author's check does not cover:
- `service_role` holds **TRUNCATE on `saved_places` and `profiles`** — the two tables with real
  personal data. That is *not* leaked default privilege: `0012` lines 71–81 grant `all privileges`
  explicitly. It is a deliberate, documented choice and I am not overturning it, but it means a
  leaked service key empties the user's library in one statement, and it deserves the same sentence
  `0025` wrote about the POI tables. `0025`'s new `inventory.sql` check 9d allow-lists exactly these
  nine, so the check passes by construction rather than by argument.
- `0025` took TRUNCATE off `poi_index`/`poi_regions` and deliberately left REFERENCES/TRIGGER/MAINTAIN.
  Confirmed still present. Its own header says why; I agree, and record it here so the next reviewer
  does not re-flag it.

`service_role` genuinely cannot reach the four new tables even though it carries `BYPASSRLS`:

```
service_role: select collections       -> ERR 42501 permission denied for table collections
service_role: truncate collections     -> ERR 42501 permission denied for table collections
```

and no code path uses it — `grep -rln SERVICE_ROLE src/` returns only
`src/integrations/supabase/service-role-client.ts`, which the collections feature never imports.

---

## 2. PASSes — what held, and what I actually ran

### Attack 1 — the privacy claim, empirically. **13 routes, all PASS.**

Setup: A saves the shared place with `note='ALICE-PRIVATE-NOTE'`, `visit_state='want_to_go'`,
`tags={alice-tag}`, `why_go`, `dishes`, `extracted_reason`, `display_name`, `category_override`, and
a real `source_url` from a real `sources` row; A adds that place to the collection; B joins as
editor and separately has a library of their own so no assertion passes by deny-all.

| # | as B, what I ran | result |
|---|---|---|
| 1.0 | `select name, lat, lng from places where id = :p_shared` | `Atk Shared Bar @31.7,35.2` — **baseline holds**, the feature works |
| 1.0b | `select note, visit_state from saved_places` | `BOB-PRIVATE-NOTE/want_to_go` — B's own only |
| 1a | `select count(*) from saved_places` | `1` (B's own). Rows belonging to A: `0` |
| 1b | `saved_places where place_id = :p_shared`, selecting `user_id, note, visit_state, visited_at, tags, why_go, dishes, extracted_reason, source_url, source_thumbnail_url, display_name, category_override` | `<no rows>` — **`visit_state` is unreachable** |
| 1c | `count(*) where place_id=:p_shared and visit_state='want_to_go'` | `0` — no aggregate leak where rows are hidden |
| 1c-ii | `count(*), max(note), bool_or(visit_state='want_to_go'), max(created_at)` over A's rows | `0` and nulls |
| 1d | `select exists (select 1 from saved_places where user_id=:a and place_id=:p_shared)` | `false` |
| 1e | error oracle, **non-foldable** so the planner cannot pre-evaluate it: `1/(length(note)-length(note))` over A's rows | `<no rows, no error>`; the same expression over B's own rows raises `22012` — so the control is the RLS filter, not constant folding |
| 1e-C | same probe filtered by `place_id`, `case when note like 'ALICE%' then 0 else 1 end` | `<no rows, no error>` — no substring oracle |
| 1f | PostgREST embed shape: `places p left join saved_places sp on sp.place_id = p.id` | `Atk Shared Bar\|<null>\|<null>\|<null>` |
| 1g | the real screen's shape: `collection_items → places → saved_places` | `Atk Shared Bar\|SHARED-ITEM-NOTE\|<null>\|<null>` |
| 1h | `sources` / `extractions` / `imports` / `place_provider_refs` / `saved_place_sources` | `0 / 0 / 0 / 0 / 0` |
| 1i | A's *unshared* place, and a place nobody saved | `<no rows>`, `<no rows>`; total `places` visible to B = `2` of 31 |

My first attempt at 1e was wrong and I am recording it because it would have been a false PASS:
`select 1/0 from saved_places where user_id = :a` raises `22012` whether or not any row is visible,
because the expression is constant-folded at plan time. Only the column-referencing form is a test.

**What B *does* get, stated so it is on the record and reviewable as a product decision:**
`collection_items.place_id`, `.added_by` (so B learns A put this place here — inherent in sharing),
`.note`, `.position`; the `places` identity; and the `profiles` row (`display_name`, `created_at`,
`updated_at`) of every peer — A, B, C, but not D. Nothing of A's other collection
(`collections`/`collection_members` for it: `0/0`). No email anywhere; `profiles` has four columns
and none of them is one.

Leaving the collection revokes it immediately and completely: after B deletes their own membership,
`places where id = :p_shared` → `<no rows>` and A's `profiles` row → `<no rows>`.

**Two side channels that exist but are not browser-reachable**, recorded for completeness:
`explain (analyze) select count(*) from saved_places` as `authenticated` prints
`Rows Removed by Filter: 33`, and `pg_class.reltuples` for `saved_places` reads `31`. Neither is
reachable through PostgREST (`db-plan-enabled` defaults off; `pg_catalog` is not an exposed schema),
so both require a direct database connection, which is already game over. **Do not turn on
PostgREST's plan media type.**

### Attack 2 — the four SECURITY DEFINER helpers as an oracle. **All PASS.**

As D, who is in no collection and owns nothing:

```
collection_role(real shared collection)   -> <null>
collection_role(real private collection)  -> <null>
collection_role(nonexistent uuid)         -> <null>     <- indistinguishable, no existence oracle
collection_role(null)                     -> <null>
can_edit_collection(real/nonexistent/null)              -> f , f , f
place_is_in_my_collection(shared/secret/never/none/null)-> f , f , f , f , f
shares_a_collection_with(A/B/C/self/nonexistent/null)   -> f , f , f , f , f , f
D reads profiles                          -> 'Dave Outside'   (own row only)
```

No argument I could pass makes any of the four answer a question about somebody else. The
single-argument construction the header calls the control **is** the control: there is no user
parameter to abuse, and every one of them resolves the subject from `auth.uid()` itself. As B (a
member) `shares_a_collection_with` returns `t` for A, C and self and `f` for D — exactly the peer
set B can already enumerate from `collection_members`, so it is not wider than the read it gates.

All four are `STABLE`, not `IMMUTABLE`, so the planner cannot fold a result computed under one
user's `auth.uid()` and reuse it under another's. All four are owned by `postgres` and pin
`search_path = public, pg_temp`.

**`search_path` hijack, attempted rather than assumed.** `authenticated` holds TEMP on the database
(`has_database_privilege('authenticated','postgres','TEMP')` → `t`), so this is a real attack, not a
hypothetical:

```sql
-- as D
create temp table collection_members (collection_id uuid, user_id uuid, role text);
insert into pg_temp.collection_members values (:coll, :d, 'owner');
create temp table collection_items (id uuid, collection_id uuid, place_id uuid);
insert into pg_temp.collection_items values (gen_random_uuid(), :coll, :p_secret);

select public.collection_role(:coll);                    -- <null>   PASS
select public.place_is_in_my_collection(:p_secret);      -- false    PASS
select name from public.places where id = :p_secret;     -- <no rows> PASS
select count(*) from public.collections where id=:coll;  -- 0        PASS
```

`pg_temp` is pinned *last* and every table reference in every body is schema-qualified. Both halves
matter; either alone would be enough here, which is the right amount of redundancy for a definer.

### Attack 3 — the invite token. **All PASS except the lifetime issues in F4.**

| # | as | attempt | result |
|---|---|---|---|
| 3a | B (editor) | `select token from collection_invites` | `<no rows>` |
| 3b | B | token via `join collections` | `<no rows>` |
| 3c | B | token via `join collection_members` (embed shape) | `<no rows>` |
| 3d | B | `update ... returning token` | `0 rows`, silently — no error, no leak |
| 3e | B | `delete ... returning token` | `0 rows` |
| 3f | B | mint a new invite | `42501` RLS |
| 3g | B | mint an invite **with a chosen token** | `42501` permission denied — the column grant, not the policy |
| 3i / 3j | C (viewer) / D (non-member) | `select * from collection_invites` | `0` / `0` |
| 3o | A (owner) | mint an invite with `role='owner'` | `23514` check constraint |
| 3p | A | upgrade a live viewer link to editor after sending it | `42501` — `role` is not UPDATE-grantable |
| 3q | A | extend a live link's expiry | `42501` — `expires_at` is not UPDATE-grantable |
| 3t–3v | `anon` | table, `preview_collection_invite`, `join_collection_via_token` | `42501` on all three |

`preview_collection_invite` returns exactly five fields and no token
(`31015c2f-…\|Atk Weekend\|Alice Owner\|editor\|t`), and returns `<no rows>` — indistinguishably —
for revoked, expired and random tokens. The three redemption failures are byte-identical, and I
compared the pairs to each other rather than to a constant so the assertion cannot pass by all three
being wrong the same way:

```
unknown = [22023] this invite link is not usable
revoked = [22023] this invite link is not usable
expired = [22023] this invite link is not usable
```

### Attack 4 — escalation. **34 attempts, all PASS.**

Viewer C: add an item `42501`; edit someone's note `0 rows`; delete an item `0 rows`; promote self
to editor `0 rows`; promote self to owner `0 rows`; rename `0 rows`; delete the collection `0 rows`;
mint an invite `42501`; insert a membership row **`42501 permission denied for table
collection_members`** (refused by the missing grant before RLS is consulted — the table's
belt-and-braces design does what its comment claims); remove the owner `0 rows`.

Editor B: demote the owner `0 rows`; remove the owner `0 rows`; remove the viewer `0 rows`; promote
self to owner `0 rows`; rename `0 rows`; delete the collection `0 rows`. Editing and deleting the
owner's *item* both succeed with 1 row — that is the design, and it is worth the product owner
knowing that "editor" means an editor can delete other people's contributions.

Non-member D: `0/0/0/0` across all four tables; every write `42501`.

`anon`: `42501` on all four tables and on **all seven** functions, including
`add_collection_owner_membership`, which is granted to nobody at all and is invoked only by the
executor.

**Constraint-violation oracles, which the author's file does not test.** RLS `WITH CHECK` is
evaluated before both the unique index and the foreign key, so neither leaks:

```sql
-- as D, non-member, using a (collection_id, place_id) pair that DOES exist
insert into collection_items (collection_id, place_id, added_by) values (:coll, :p_shared, :d);
-- ERR 42501 new row violates row-level security policy   (not 23505)
-- as D, with a place_id that does NOT exist
insert into collection_items (collection_id, place_id, added_by) values (:coll, :zeros, :d);
-- ERR 42501 new row violates row-level security policy   (not 23503)
```

### Attack 5 — `added_by`, the saved_places gate, the column grants. **All PASS.**

Every one of these is refused, and I checked *which* control refused it rather than accepting a
generic denial:

| attempt | refused by | code |
|---|---|---|
| `added_by = A` (forge attribution) | policy | `42501` RLS |
| `added_by = null` | policy | `42501` RLS |
| omit `added_by` (default null) | policy | `42501` RLS |
| add a place B has not saved | policy | `42501` RLS |
| choose the item `id` | **column grant** | `42501` permission denied |
| backdate `created_at` | **column grant** | `42501` permission denied |
| `update collection_items set collection_id = ...` | **column grant** | `42501` permission denied |
| `update collection_items set place_id = ...` | **column grant** | `42501` permission denied |
| `update collection_items set added_by = ...` | **column grant** | `42501` permission denied |
| `update collection_members set user_id = ...` | **column grant** | `42501` permission denied |
| `update collections set owner_id = ...` | **column grant** | `42501` permission denied |
| `insert into collections (id, ...)` | **column grant** | `42501` permission denied |
| legitimate add by B (control) | — | 1 row |

The migration's claim that moving an item, repointing it, re-attributing it and taking a collection
are *inexpressible in SQL* rather than merely refused by policy is **VERIFIED at the grant level**,
not accepted from the comment.

### Attack 7 — structural leftovers. **All PASS.**

- **No recursion.** A six-way join across `collections × collection_members × collection_items ×
  places × profiles × collection_invites` as B returns three rows and terminates. This is the
  failure mode the whole definer design exists to prevent, and it does not occur.
- **No policy targets `public`**, and no policy is `RESTRICTIVE` where it should not be. The query
  `select ... from pg_policies where roles::text like '%public%' or permissive <> 'PERMISSIVE'`
  returns 0 rows. 15 policies across the four new tables, all `PERMISSIVE`, all `{authenticated}`.
  The two `PERMISSIVE` SELECT policies now on `places` (and on `profiles`) OR together, which is the
  intent.
- **No `WITH CHECK` weaker than its `USING`.** Read pairwise from `pg_policies`:
  `collections_update_owner`, `collection_items_update_editor` and `collection_invites_update_owner`
  are identical on both sides; `collection_members_update_by_owner` is `owner and role <> 'owner'`
  on the old row and `owner and role in ('editor','viewer')` on the new — strictly narrower, and
  backed by `collection_members_one_owner_idx` regardless.
- **All four tables** carry `relrowsecurity` *and* `relforcerowsecurity`. `authenticated` holds
  `rd` and column grants only — no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN anywhere.
- **Every function in `public` is owned by `postgres`**, and none is executable by `PUBLIC`.
- `authenticated` and `anon` hold **no CREATE on schema `public`** (`has_schema_privilege` → `f`),
  which closes the classic "define your own leakproof-looking qual" RLS bypass.

### One abuse case that is not an RLS question

`collections.name` (80 chars), `collection_items.note` (500) and `profiles.display_name` (80) are
the first strings in this product written by one user and rendered to another. React escapes them
and there is no `dangerouslySetInnerHTML` anywhere in `src/`, so this is not XSS. It is a harassment
surface: joining is unlimited and permanent (F4), any editor can write into a collection you are in,
and there is no block, report or mute. **Acceptable at university scale, documented.** It stops
being acceptable the moment collections are shareable outside a known group.

---

## 3. Ruling: `owner_id on delete cascade` vs GDPR Art. 17

**Measured, both directions, in a rolled-back transaction.**

```
before                                        collections=1  members=2  items=1  invites=4
delete from auth.users where id = A (OWNER)
after                                         collections=0  members=0  items=0  invites=0

before                                        collections=1  items=1   added_by = A
delete from auth.users where id = B (COLLABORATOR, who had contributed an item)
after                                         collections=1  items=2   added_by = A, NULL   members=2
```

The asymmetry is exactly as described: a collaborator's erasure de-identifies their contribution and
leaves everyone else's data intact; an owner's erasure destroys the collection, the member list,
**other people's contributed items**, and every invite.

**My call: it is not defensible as an Art. 17 implementation, but it does not block this task.**

The argument. Art. 17 is a right to erasure of *the requester's* personal data. It neither requires
nor authorises deleting a third party's data, and `collection_items` rows added by B, plus C's
membership, are not A's personal data. The migration already articulates the correct principle in
its own comment on `added_by` — "erasure of the departing user's data must not be a deletion of
someone else's" — and then does the opposite one column away. The two rules cannot both be right,
and `added_by`'s is the right one.

The counter-argument I considered and rejected: the collection's `name` and `description` are A's
own text, so keeping the collection keeps A's content alive after erasure. That is real, and it is
an argument for *nulling or replacing the name on transfer*, not for destroying the item list.

Two aggravating facts that make this a design dead-end rather than only a compliance question:
`collection_members_delete_self_or_by_owner` excludes `role = 'owner'`, so an owner cannot leave
their own collection; and `owner_id` is not UPDATE-grantable, so ownership cannot be transferred by
any statement a client can express. **An owner's only exit from a shared collection today is to
delete it, taking everyone else's contributions with it.** That is true whether or not GDPR is in
the frame.

**Why it does not block now, precisely.** The failure needs a collection with ≥2 members *and* an
owner deleting their account, and account deletion **is not built** — it is
`docs/product-backlog-2026-08-29.md` item 11.8. So the exposure today is zero and the fix has a
natural home.

**What I am asking for, in order.**
1. Backlog item 11.8's own description is now wrong and should be corrected in the same pass: it
   says "exactly three tables carry `user_id` and all cascade from `profiles`". Post-0024 there are
   four more references — `collections.owner_id` (cascade), `collection_members.user_id` (cascade),
   `collection_items.added_by` (set null), `collection_invites.created_by` (cascade). A delete-account
   handler written against the old sentence will silently destroy other people's collections.
2. **Ownership transfer must land before account deletion does**, not before this migration merges:
   a `transfer_collection_ownership(p_collection, p_to_user)` restricted to the current owner and to
   an existing member, plus permission for an owner to leave once they have transferred. That is the
   fix for the dead-end and for Art. 17 at the same time.
3. Until then, the delete-account flow must refuse — or explicitly warn and require confirmation —
   when the user owns a collection with other members in it. Silent cascade is the one outcome that
   is not acceptable, because the people who lose data never find out why.

This is an owner decision on sequencing, not a security veto. Routing to the orchestrator for
`product-lead` and `supabase-database`.

---

## 4. What I could not test, and why

- **Staging, production and both hosted Supabase projects.** Standing owner hold. Everything above
  is the local container only. The one claim that is genuinely host-dependent is F7's: `0008`'s
  header says the hosted projects carry `supabase_admin`-owned default privileges granting
  `anon`/`authenticated` ALL on new tables in `public`, which the local container does **not** apply
  to `postgres`-created tables. `0024` revokes both roles explicitly, so it is correct either way —
  but hosted behaviour is **ASSUMED** from `0008`, not **VERIFIED** by me.
- **PostgREST as a real HTTP surface.** I attacked through SQL as `authenticated`, which is the same
  role and the same policies, and I reproduced the embed shapes (`left join`) that `?select=…(…)`
  compiles to. What that does *not* cover: PostgREST's own resource-embedding rules and its
  `Accept: application/vnd.pgrst.plan` media type. **Someone should confirm `db-plan-enabled` is
  off** on the deployed instance — with it on, the `Rows Removed by Filter` channel in Attack 1
  becomes a browser-reachable count of other users' rows.
- **Timing side channels under realistic conditions.** 3000 in-process redemptions took 28.6 ms; I
  did not attempt a statistical timing attack distinguishing unknown from revoked. Over the network,
  through PostgREST and Vercel, the signal would be far below the noise, and the exception path is
  identical for all three cases. Assessed as not worth the effort; recorded so it is a decision, not
  an omission.
- **`auth.users` / GoTrue.** Out of scope for this migration and not reachable by any browser role.
- **The F6 anomaly.** I measured that a new function in `public` gets `PUBLIC` EXECUTE despite a
  `pg_default_acl` row that says otherwise, and that a table created in the same transaction *does*
  honour its default entry. I could not explain why the function entry is not applied and did not
  want to convert a guess into a finding. The operative conclusion holds either way.

---

## 5. Reproducing this

The fixture and the six attack files are self-contained and every run is wrapped
`begin; \i fixture.sql; \i aN.sql; rollback;`. To rebuild the fixture: create four users in
`auth.users` (profiles arrive via `handle_new_user`), one `sources` row via `start_import`, four
`places` via `resolve_place` in four different cities so `0011`'s 75 m near-duplicate guard cannot
merge them, then — as each user in turn, via
`set_config('request.jwt.claims','{"sub":"…","role":"authenticated"}', true)` followed by
`set local role authenticated` — have A save two places with a full private overlay, B save one of
their own, A create the collection and four invites (live editor, live viewer, revoked, expired),
and B and C redeem the first two. `tags`, `why_go` and `dishes` must be written as `postgres`:
`authenticated` holds no column grant on them.

Two harness notes that cost me time and would cost the next person the same:
- `revoked_at` and `token` are not INSERT-grantable, so a fixture must create an invite and then
  revoke it in a second statement. The `42501` you get otherwise is the control working.
- an error-based oracle must reference a column. `1/0` is folded at plan time and raises whether or
  not RLS admitted a single row, which makes it a test that always passes.
