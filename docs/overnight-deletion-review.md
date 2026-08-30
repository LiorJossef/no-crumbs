# W7-4 (`L1-F8-T1`) — account deletion: security and privacy review

**Author:** `security-privacy` · **Date:** 2026-08-31 · **Base commit:** `7d7ec6658750ec078ee267a4d0392c7d68e2ab55`
**Branch:** `no-crumbs-implementation` · **Status:** ruling, binding on the agent that builds W7-4.

Written **ahead** of the build so the builder is handed a design rather than inventing one. This
document is analysis only; it writes no `src/` and no `supabase/`.

## 0. Evidence posture, stated first

The live cross-user probe **could not be run**. The Docker daemon is not running on this machine
(`Cannot connect to the Docker daemon at unix:///Users/MrJossef/.docker/run/docker.sock`) and no
`psql` client is installed, so `db:reset` / `db:test` / a hand-written cascade probe were all
unavailable. Standing up the local stack is an exclusive resource that was not leased to this task
and seven other agents hold this tree.

Line references into `supabase/migrations/*` are exact and were re-verified against the base
commit; line references into `src/` are deliberately **omitted** — seven agents are editing that
tree and the numbers drifted while this document was being written. Files and symbols are named
instead.

Everything below is therefore read from the **DDL as committed**, which for foreign-key
`ON DELETE` semantics is authoritative rather than indicative: the referential action is declared
in the DDL and Postgres has no discretion about it. Two claims are marked ASSUMED because they
concern GoTrue's own `auth` schema, which this repo does not define; both are listed in §7 with the
one-line query that settles them.

---

## 1. The blast radius, from the DDL

### 1.1 The root

```
auth.users (id)
   ↑ on delete cascade      supabase/migrations/0002_profiles.sql:7
public.profiles (id)
```

`public.profiles.id` is the FK target of every per-user column in `public`. Deleting the
`auth.users` row deletes the profile, and the profile deletion is what drives everything below. FK
referential actions are executed by the system, **not** subject to RLS, `FORCE ROW LEVEL SECURITY`,
or column grants — so nothing in §3's grant posture constrains the cascade at all.

### 1.2 Every edge that references the user

Complete. Produced by grepping every `references public.profiles` in `supabase/migrations/*.sql`;
there are ten and they are all listed.

| # | Table.column | Action | File:line | What deletion does |
|---|---|---|---|---|
| 1 | `profiles.id → auth.users.id` | **cascade** | `0002:7` | profile row destroyed |
| 2 | `imports.user_id` | **cascade** | `0003:59` | every import row destroyed, **including `candidates` jsonb** |
| 3 | `saved_places.user_id` | **cascade** | `0006:7` | the entire library destroyed |
| 4 | `saved_place_sources.(saved_place_id,user_id)` | **cascade** (from `saved_places`) | `0006:45` | provenance links destroyed |
| 5 | **`collections.owner_id`** | **cascade** | `0024:92` | **every collection they own destroyed, for everyone in it** |
| 6 | `collection_members.user_id` | **cascade** | `0024:120` | their memberships (live and tombstoned) destroyed, everywhere |
| 7 | `collection_members.invited_by` | **set null** | `0024:124` | invitee's membership survives, de-identified |
| 8 | `collection_members.removed_by` | **set null** | `0026:107` | removal survives, remover de-identified |
| 9 | `collection_items.added_by` | **set null** | `0024:153` | **the item survives in other people's collections**, de-identified |
| 10 | `collection_invites.created_by` | **cascade** | `0024:185` | invites destroyed — harmless, invites are owner-only (`collection_invites_insert_owner`, `0024:437`) so they die with the collection anyway |

Second-order edges, driven by row 5:

```
collections (row 5, cascade)
  ├─ collection_members.collection_id   on delete cascade   0024:119
  ├─ collection_items.collection_id     on delete cascade   0024:146
  └─ collection_invites.collection_id   on delete cascade   0024:182
```

Nothing blocks the cascade. The three `on delete restrict` edges in the schema
(`saved_places.place_id → places`, `collection_items.place_id → places`,
`saved_place_sources.source_id → sources`, `imports.source_id → sources`) all restrict deletion of
the **parent** (`places`, `sources`), never of the child. `places` and `sources` are not deleted, so
no restrict fires and the whole cascade completes.

### 1.3 Verdict on the prose

> `docs/current-state.md:117`, `docs/growth-plan.md`, `docs/overnight-run-plan.md` W7-4:
> *"`collections.owner_id` is `on delete cascade` and ownership transfer was never built"*

**CONFIRMED, in the DDL, exactly as written.** `supabase/migrations/0024_collections.sql:92`:

```sql
owner_id    uuid not null references public.profiles (id) on delete cascade,
```

I went looking for the three documents to be wrong. They are not. The cascade is real, the
collection is destroyed for every member, and `0026`'s membership tombstones do not survive it
either — the collection row goes, so `collection_members.collection_id` cascades the tombstones with
it.

There is one thing the prose does **not** say, and it is the finding that changes the design (§2.2):
the schema was written to make ownership transfer *inexpressible*, deliberately, on three
independent controls. This is not an oversight to be patched in application code.

### 1.4 What the schema got right, and it is most of it

`0024`'s author thought about erasure and wrote the reasoning into the DDL. Row 9's comment
(`0024:148-153`) is explicit:

> *"A shared collection must survive a collaborator erasing their account (GDPR Art. 17): the item
> is de-identified ... Erasure of the departing user's data must not be a deletion of someone
> else's."*

Rows 7, 8 and 9 are all correct. A departing user who is a **member** of someone else's collection
is handled properly today: their membership row disappears, their contributed items stay and stop
carrying their name, and the collection is untouched. **The only catastrophic edge in the whole
graph is row 5**, and it is catastrophic precisely because the same reasoning was not applied to it.

### 1.5 Tables with no user column at all

`places`, `place_provider_refs`, `sources`, `extractions`, `poi_regions`, `poi_index`,
`place_lookups` (`0023`, has never held a row). None of them has a user-referencing column;
verified by grepping every `uuid` column that names a user across all 29 migrations. Their retention
is ruled on in §4.

**Supabase Storage: unused.** No bucket, no policy, no `.storage` call anywhere in `src/` or in any
migration. VERIFIED by grep. There are no storage objects to delete.

---

## 2. The ruling

> **RULING: refuse deletion while the user is the live owner of a collection that has at least one
> other live member. Delete unconditionally in every other case.**
>
> The refusal is not a dead end: it must list the blocking collections and offer, per collection,
> the two actions the user *already holds the grants for* — delete the collection, or remove the
> other members. Both are already-built server actions.

### 2.1 Why not "transfer ownership"

It is the correct design and it is **out of scope tonight**, and not for the reason I expected.

It is not that the transfer logic was never written. It is that **no role reachable from this
application can write `collections.owner_id` at all**, on three independent controls, each one
deliberate:

1. **Column grant.** `0024:314` grants `authenticated` only `update (name, description)`. The
   migration's own comment (`0024:310-313`): *"`owner_id` is not grantable, so 'give my collection
   away' / 'take someone's collection' is not expressible in SQL at all, independently of whether
   the RLS policy is right."*
2. **`service_role` has no grant on these tables whatsoever.** `0024:106` —
   `revoke all on public.collections from anon, authenticated, service_role` — and nothing grants
   any of it back. BYPASSRLS does not bypass a **column or table privilege**. The service-role
   client cannot SELECT, INSERT, UPDATE or DELETE `collections`, `collection_members`,
   `collection_items` or `collection_invites`. This is `0024`'s stated design ("NO service_role
   GRANTS, on purpose ... a leaked service key still cannot enumerate other people's collections").
3. **The membership row is immovable.** `collection_members_update_by_owner` (`0026:220`) has
   `role <> 'owner'` in USING and `role in ('editor','viewer')` in WITH CHECK, so no row can be
   promoted to owner; `end_collection_membership` (`0026:266`) refuses outright when
   `v_target_role = 'owner'`; and `collection_members_one_owner_idx` is a unique index. `0024`'s
   own comment: *"Ownership transfer is not a feature of this migration."*

Transfer therefore requires a new `SECURITY DEFINER` function, which requires a migration, which
**rule 8 forbids this run.** Sized in §6.

### 2.2 Why not "orphan / tombstone the collection"

Refused on the DDL. `collections.owner_id` is `uuid **not null**` (`0024:92`). There is no
ownerless collection to produce. Even if the column were nullable, `collections_select_member`
(`0024:326`) reads `owner_id = auth.uid() or collection_role(id) is not null` — the second disjunct
would keep members reading it, so the policy is survivable, but the *not null* is not. Migration.

### 2.3 Why not "delete the user's own data and leave the shared collection intact"

That is the same thing as §2.1 or §2.2: leaving the collection intact means the `collections` row
survives its owner's `profiles` row, which requires either a new `owner_id` or a null one. Both are
migrations. **There is no no-migration path to preserving a shared collection.**

### 2.4 What makes the refusal acceptable rather than a cop-out

The refusal is honest about a real limitation instead of destroying data to avoid an awkward screen,
and it leaves the user with a genuinely reachable exit. It also has a property the alternatives do
not: **it cannot silently do the wrong thing.** A transfer implemented in a hurry at 4am against a
schema built to forbid it would be forced through `service_role`, which would mean granting
`service_role` write access to the collections tables — and that grant would undo the single
strongest control `0024` established. I would veto that on the spot; better to write the refusal
now than to review that patch later.

The residual cost is real and should be stated plainly to the owner: **a user who owns a shared
collection cannot delete their account in one action tonight.** They can delete it in two or three
(remove members or delete the collection, then delete the account). That is a product-quality defect,
not a privacy defect, and it is the right trade at university scale.

---

## 3. The implementable design

No migration. Every statement below uses a grant that already exists.

### 3.1 The pre-check — runs as the user, with the anon key, under RLS

It **must not** use `serviceRoleClient()`: per §2.1 point 2, `service_role` holds no privilege on
the collections tables and the query would fail `42501`. Use `createClient()` from
`@/app/_lib/supabase/server`.

```
1. collections            .select('id, name').eq('owner_id', uid)
2. collection_members     .select('collection_id, user_id').in('collection_id', ownedIds)
```

`collection_members_select_member` (`0026:210`) already carries `removed_at is null`, so query 2
returns **live memberships only** — no `removed_at` filter is needed in application code, and adding
one would be redundant rather than wrong. A collection blocks deletion iff query 2 returns a row for
it with `user_id <> uid`.

The owner is guaranteed to be a member of their own collections (the `collections_owner_membership`
AFTER INSERT trigger, `0024:290`), so the owner's own row is always present and must be excluded.

### 3.2 The blocked branch

Render the blocking collections by name with their live co-member count, and for each one link to
the two existing actions in `src/app/actions/collections.ts`:

- `deleteCollection(collectionId)` — `src/app/actions/collections.ts`
- `removeMember(collectionId, userId)` — `src/app/actions/collections.ts`, which calls
  `end_collection_membership`

Do not build a new action for this. Do not attempt the deletion partially. Nothing is deleted on
this branch.

### 3.3 The proceeding branch, in order

```
1. getUser()                          → user; if null, refuse
2. re-run the §3.1 pre-check          → must be empty, or fall to §3.2
3. revoke every outstanding invite on every collection the user owns:
     supabase.from('collection_invites').update({ revoked_at: <now> }).in('collection_id', ownedIds)
   (grant update (revoked_at), 0024:429; policy collection_invites_update_owner, 0024:442 — the
   user already holds both)
4. RE-RUN the §3.1 pre-check          → must still be empty
5. serviceRoleClient().auth.admin.deleteUser(user.id)
6. supabase.auth.signOut({ scope: 'local' })   in a try/catch
7. redirect('/')
```

**Steps 3 and 4 exist to close a real race.** Between a single pre-check and the delete, a stranger
holding an outstanding invite token can call `join_collection_via_token` and become a live member of
a collection the check just cleared — turning a legitimate solo deletion into a destruction of
someone else's data, milliseconds after we verified it would not be. Revoking the invites first and
re-checking after closes the window with grants the user already holds. A database-level guarantee
(a `BEFORE DELETE` trigger on `profiles`) needs a migration; §6.

**Step 6 uses `scope: 'local'`.** After step 5 the user no longer exists, so the network logout call
will fail; `scope: 'local'` clears the session cookies without one. Wrap it anyway — a failure here
must not leave the account deleted and the user staring at an error.

### 3.4 The one hard rule on the action's signature

> **The exported server action takes no user-identifying parameter.** The `id` handed to
> `auth.admin.deleteUser` must be `user.id`, read from `getUser()` in the same function scope.

`serviceRoleClient()` returns a cached module-level singleton and `auth.admin.deleteUser(id)` on it
will delete **any account in the project**. The `getUser()` call is the entire authorisation
boundary. An action shaped `deleteAccount(userId: string)` makes that boundary a caller's promise
instead of the function's own guarantee, and Next.js Server Actions are POST endpoints reachable by
anyone who can guess the action id.

**I will veto any implementation whose delete action accepts a user id.** Acceptable signature:
`export async function deleteAccount(confirmation: string): Promise<DeleteAccountResult>`, where
`confirmation` is a typed word compared server-side and carries no identity. Zero parameters is also
fine.

---

## 4. What "delete my data" must cover

This is a location-privacy product. A user's saved places are a map of where they physically go, and
`imports.candidates` holds resolved coordinates from posts they chose to import. The bar is that
nothing survives which is *about* them.

### 4.1 Destroyed — required, and all of it happens by cascade

| Data | Where | Why it must go |
|---|---|---|
| Display name, join date | `profiles` | identity |
| **The library** — every saved place, note, visit state, category override | `saved_places` | the movement map. The single most sensitive object this product holds. |
| Provenance links | `saved_place_sources` | links the user to specific posts |
| **Every import**, incl. `candidates` jsonb (resolved names + coordinates), timings, error codes | `imports` | second copy of the movement map, and a per-user activity log |
| Owned collections and everything in them | `collections` + 3 children | see §2 |
| Memberships in other people's collections, live and tombstoned | `collection_members` | removes them from other members' "who else is here" lists |
| Invites they minted | `collection_invites` | bearer credentials |
| Auth row, identities, sessions, refresh tokens | `auth.*` | GoTrue cascade, ASSUMED — §7 |

All of it falls out of `auth.admin.deleteUser`. No manual cleanup statement is needed and none should
be written; an application-level pre-delete sweep would be a second, drifting definition of "the
user's data" alongside the FK graph.

### 4.2 Retained and de-identified — ruled ACCEPTABLE

**Items the user added to *other people's* collections.** `collection_items.added_by → null`
(`0024:153`), the row survives. The place stays on the shared list, the attribution stops rendering.
This is the correct GDPR Art. 17 balance and `0024` says so in the DDL. **Ruled acceptable.**

**One thing inside that row is not de-identified and must be named: `collection_items.note`.** It is
free text the departing user wrote, and it survives verbatim in someone else's collection with the
"added by" removed. Under any ordinary reading it is content contributed to a shared object rather
than personal data, and deleting it damages the remaining members' collection. **Ruled acceptable —
but it is the one place where "we deleted everything you wrote" would be a false statement**, so the
copy must not make that claim (§5). Escalated to the owner in §8 as a genuine judgement call, with
the note that scrubbing it *is* achievable without a migration if the owner wants it (the user holds
`update (note)` on `collection_items` while they are still an editor).

**`collection_members.invited_by` and `removed_by` → null** on other people's rows. Correct.

### 4.3 Retained in full — ruled ACCEPTABLE, and deleting it would be wrong

**`places` / `place_provider_refs`.** Global POI facts: name, address, coordinates, provider payload.
No user column exists on either table. These rows are shared reference data — other users'
`saved_places` and `collection_items` point at them under `on delete restrict`, so deleting them
would be deleting other people's data. The only residual trace is that a `places` row created solely
by one user carries a `created_at` correlated with their import, and that row is unreadable to
anyone without a `saved_places` or shared-collection path to it (`places_select_if_saved`, `0006:150`;
`places_select_if_in_shared_collection`, `0024`). **Ruled acceptable at university scale, documented.
Do not delete.**

**`sources` — and this is the one worth reading twice.** Holds `content_text` (the full TikTok
caption), `author_handle`, `author_name`, `canonical_url`, `thumbnail_url`. It survives the deletion
because it has no user column and is a global cache.

The important property: **once the user's `imports` and `saved_place_sources` rows cascade away,
nothing links any `sources` row to the departed user.** `sources_select_via_membership` (`0006:163`)
grants read access only through an `imports` or `saved_place_sources` row, so after the cascade the
departed user's sources are readable by other users who imported the same post, and by no one else.
The retained data is about the **TikTok creator**, not about our user, and it was already public.
`content_text` is additionally granted to no browser role at all (R8, `0003`). **Ruled acceptable;
do not prune.** A retention policy for third-party caption data is a separate, real question and it
is `docs/security.md`'s owed item, not W7-4's.

**`extractions`.** Keyed by `source_id`; no user column; cascades only from `sources`, which is not
deleted. Contains LLM output derived from the caption. Same reasoning as `sources`. **Acceptable.**

**`poi_index`, `poi_regions`, `place_lookups`.** Reference data / an empty table. Nothing.

### 4.4 The bottom line for §4

**Nothing survives in a form that identifies the departing user**, with the single named exception of
a note they wrote on an item in someone else's shared collection, which survives with attribution
stripped. That is the honest statement, and it is the statement the copy must be consistent with.

---

## 5. Message to `product-lead` re: `docs/overnight-copy-deck.md`

Both branches they are writing for are correct and both must exist. Three additions:

1. **The refusal branch is not terminal.** It needs the collection names, the co-member counts, and
   two offered actions per collection (delete it / remove the members). Copy for a refusal with no
   way forward would be describing a dead end the design does not have.
2. **A branch they may not be writing for, and it must exist: the ordinary confirm must enumerate
   what goes.** A user with *solo* collections has them destroyed, correctly and silently, by the
   same cascade. "N places, N imports, N collections" in the confirm is the difference between
   informed consent and a surprise.
3. **One sentence the copy must not contain, in any branch: a claim that everything the user wrote
   is deleted.** §4.2 — notes on items in other people's shared collections survive with the name
   removed. If the deck wants a reassuring line, the true one is the *other* half: *collections
   other people shared with you are not affected — you just leave them.*

No branch they are writing for should be removed.

---

## 6. Out of scope tonight, recorded (rule 8)

**M1 — `transfer_collection_ownership(p_collection uuid, p_to uuid)`.** One `SECURITY DEFINER`
function, revoked from `public, anon` and granted to `authenticated`: assert the caller is the live
owner and `p_to` is a live non-owner member, demote the caller to `editor`, promote `p_to` to
`owner`, update `collections.owner_id`. Two statements for the role swap rather than one — the
one-owner unique index is not deferrable, so a single `UPDATE ... CASE` touching both rows can trip
it on row order. **`0026` already did the hard part**: it made
`collection_members_one_owner_idx` partial on `role = 'owner' and removed_at is null` explicitly so
*"a future ownership transfer that ends the old owner's row"* would not be refused (`0026:124-128`).
Size: one migration, one function, its policy tests, plus a UI to pick the new owner. **Half a day,
not one night**, and forbidden tonight regardless.

**M2 — a `BEFORE DELETE` trigger on `profiles`** that raises when the row owns a collection with a
live co-member. This is what would make §3's refusal a database guarantee rather than an application
convention, and it closes the §3.3 race properly instead of narrowing it. Small — one trigger
function, ~20 lines. Worth doing with M1.

**Do not attempt either tonight. Do not grant `service_role` anything on the collections tables to
work around them** — see §2.4.

---

## 7. Two claims marked ASSUMED, and how to settle them

Both concern GoTrue's `auth` schema, which this repo does not define. Neither blocks W7-4.

**A1 (ASSUMED).** `auth.identities`, `auth.sessions` and `auth.refresh_tokens` cascade from
`auth.users`, so `deleteUser` removes the provider identity (which carries the email) and every live
session. This is GoTrue's documented behaviour and the reason `deleteUser` exists.
Settle with, on a container: `select conrelid::regclass, confdeltype from pg_constraint where confrelid = 'auth.users'::regclass;`

**A2 (ASSUMED, and the one I would actually check).** `auth.audit_log_entries` is **not**
FK-referenced to `auth.users` and is therefore **not** cascaded. If so, GoTrue's audit log retains
rows whose `payload` jsonb carries the deleted user's id, `actor_username` (**the email address**)
and, depending on configuration, the request IP — after the account is gone.
Settle with: `select payload from auth.audit_log_entries limit 5;` and the `pg_constraint` query above.

**Severity if A2 holds: acceptable at university scale, documented — not a launch blocker.** The
table is not exposed through PostgREST, `service_role` reaches it only via the Supabase dashboard,
and its retention is Supabase's default rather than something this application chose. But it means
*"nothing identifying you remains"* is not literally true at the platform layer, and the person who
writes `docs/security.md`'s deletion section needs to know that before writing it. Add the two
queries to the next session that has a container up.

---

## 8. Genuinely the owner's decision, not mine

1. **The retained note (§4.2).** Should a note the departing user wrote on an item in *someone
   else's* shared collection be deleted, or retained with attribution stripped? I rule **retain**,
   because it is content contributed to a shared object and deleting it damages the remaining
   members. But this is a product and legal judgement rather than a security one. If the owner wants
   it scrubbed, it is achievable tonight without a migration — the user still holds
   `update (note)` on `collection_items` while they are an editor, so the delete action can null
   their own notes before step 5. Say the word and it is one extra statement in §3.3.
2. **The two-or-three-step deletion (§2.4).** The owner of a shared collection cannot delete their
   account in one action tonight. That is the cost of the ruling and it is a product-quality
   regression the owner should see, not a defect the build should hide.
3. **Whether M1 lands before submission.** It is the correct design and it is a migration.

---

## 9. Findings outside W7-4, reported to the orchestrator

**F1 — `deleteCollection` destroys a shared collection with no warning and no member check.**
`deleteCollection` in `src/app/actions/collections.ts` issues `.from('collections').delete().eq('id', collectionId)`
and reports success. `collections_delete_owner` permits it, and the three child cascades take every
member's copy with it. This is live on `main` today, is the *same defect class* as the W7-4 trap, and
is not part of W7-4.
**Severity: acceptable at university scale, must be documented — not a launch blocker**, because it
is owner-initiated and destructive-by-request rather than a side effect of an unrelated action. The
minimum fix is a confirm that names the live co-member count, reusing §3.1's query. Hand to the agent
holding `src/app/actions/collections.ts`; **do not let W7-4's builder fix it in passing** — it is
someone else's file this run.

**F2 — a stale comment naming a control that does not exist.**
`src/app/_lib/supabase/server.ts`, in the `setAll` catch block, says *"The middleware below refreshes the session on every
request, so this is safe to ignore here."* There is no `middleware.ts`, at the repo root or under
`src/`. `0026`'s own header makes the point better than I can: *"a comment naming a control that is
not the control trains the next reviewer to skip the check."* No runtime impact found — every page
and action calls `getUser()` directly (verified: 12 call sites, `getSession()` appears only in
`src/app/sign-in/page.tsx`, client-side, which is correct). **Severity: cosmetic. Fix the comment
or add the middleware; do not do it in W7-4's commit.**

**F3 — staging is at `0018` and does not have the collections schema at all** (`CLAUDE.md`:
staging `0018`, production `0026`). Any W7-4 test that exercises the shared-collection branch will
not run against staging. Test locally or against production data shapes; do not read a staging pass
as evidence for this feature.

---

## 10. Verdict

**No veto on the design in §3.** It does not expose data, it does not destroy other people's data,
and it deletes the user's own data completely.

**Two standing vetoes on the implementation:**

- **V1.** A delete action that accepts a user id as a parameter (§3.4).
- **V2.** Any grant of `insert`, `update` or `delete` to `service_role` on `collections`,
  `collection_members`, `collection_items` or `collection_invites` in order to make transfer or
  orphaning work tonight (§2.4). That grant undoes `0024`'s strongest control and it is not
  available as a shortcut.

Both are on data exposure and destruction and are not overridable by `product-lead` or
`nextjs-architect`.
