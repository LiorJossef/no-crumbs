# Database ruling — re-pointing a saved place at the right venue

> **Task `r1-pin`.** Round 1 finding 2 of [`product-review-2026-08-31-r1.md`](product-review-2026-08-31-r1.md).
> **Base commit `2cf6b83`** on `no-crumbs-implementation`.
> **Artefacts:** [`supabase/migrations/0032_repoint_saved_place.sql`](../supabase/migrations/0032_repoint_saved_place.sql),
> [`supabase/tests/0032_repoint_saved_place_policy_tests.sql`](../supabase/tests/0032_repoint_saved_place_policy_tests.sql).
> **Status: written and proven locally, NOT APPLIED anywhere.** `repoint_saved_place` does not exist
> in the local container — every proof below ran inside a transaction that was rolled back, and the
> database is byte-for-byte the state this lane found it in. Applying it, and pushing it, are the
> orchestrator's.
>
> **This ruling has not been reviewed.** `agent-guardrails.md` §5 rule 20 puts the review with
> `security-privacy`, and §9 V1 says the migration is frozen while that happens. This lane has
> stopped.

---

## 1. What the finding actually is

A person opens a place, sees **"Approximate location"**, and there is nothing they can do about it.
`src/ui/place/location-certainty.ts:8-11` ships the measurement — median drift 327 m, range
65–470 m — and the label is the right call: the product knows the pin is a street or two off and
says so. What it does not have is the repair. The user's only recourse is delete-and-re-add, which
destroys the note, the tags, the been-mark and the link back to the TikTok.

The cause is one line, `0006:117`:

```sql
grant update (display_name, category_override, note, visit_state, visited_at)
  on public.saved_places to authenticated;
```

`place_id` is absent, so **no role reachable from the browser can move a save onto a different
`places` row**. `0006`'s own comment says this is deliberate: *"user_id, place_id and origin are not
grantable, so 'move my save onto someone else's place' or 'give my save away' are not expressible,
independently of RLS."*

That is a structural refusal, and it is now executed rather than read: assertion **R1** performs the
`UPDATE` as the row's own owner and it is refused with `42501` at the database.

**On the 68% figure.** The reviewer's proposed kill-check —
`select source_dataset, count(*) from places group by 1` — came back **inconclusive** and is not
cited here in either direction. The local database holds 8 places (6 with no `source_dataset`, 2
`google-places`), not the owner's 31-place library. Nothing local can confirm or refute 21/31.
**This work does not depend on the number.** Even at one wrong pin in ten, a product whose entire
output is a pin needs a way to fix one.

---

## 2. The three questions the dispatch asked, answered

### 2.1 What may a user re-point to?

**A `places` row the SERVER resolved. Never an id the client names.**

The dispatch's worry was that a raw `grant update (place_id)` lets a user point their save at any row
in a shared table, and asked what stops them probing ids. **The honest answer is that nothing does —
and that this migration neither opens nor closes that door, because it is already open.** MEASURED on
the local container at `2cf6b83`:

```
authenticated | INSERT | category_override, display_name, extracted_reason, note, origin,
                         place_id, user_id, visit_state, visited_at
```

`place_id` **is** insert-grantable (`0006:113`, narrowed to a column list that still names it by `0015:57`), and `places_select_if_saved`
(`0006:150`) opens a `places` row to anyone holding a save that names it. A browser can already
insert a save naming an arbitrary `places` uuid through PostgREST and then read that row. What makes
that survivable is not a grant: `places.id` is a random v4 uuid, so there is nothing to enumerate,
and a uuid you were told is a uuid somebody chose to tell you. An UPDATE grant would be the same
primitive by a second route, not a new one.

So the argument against the column grant is not the probing one. It is this:

> Every write of a `places` row in this schema goes through `resolve_place` — `SECURITY DEFINER`,
> `service_role` only, the single creator of a `places` row — precisely so that a name, a category
> and a coordinate that **many users share** can only come from a provider. A column grant would put
> the client back in the position of choosing which shared row its save denotes, with the server
> unable to say where that id came from.

The function keeps the seam where the rest of the schema already keeps it, and where
`addPlaceManually` and the add-by-name recovery already keep it: **the browser sends a string, the
server resolves it through `PlaceResolver` → `resolve_place`, and only then names an id.**

Second reason, smaller but real: a column grant cannot carry the four refusals in §3. A raw UPDATE
naming a merged-away place succeeds and points the save at a tombstone, silently, forever.

**A note for `security-privacy`, offered as a separate observation rather than as part of this
change:** `authenticated`'s INSERT grant on `saved_places.place_id` is a read primitive over
`places` for any uuid the caller can obtain. It is pre-existing, it is gated only by uuid
unguessability, and `0006`'s comment about `place_id` not being grantable is true of UPDATE and
false of INSERT. Worth a look on its own terms; nothing here depends on the outcome.

### 2.2 Does re-pointing orphan anything?

**Carried, structurally rather than by copying anything — proven by execution, R2b/R2c/R2c2/R2d:**

| | Why it survives |
|---|---|
| `saved_place_sources` | Keyed on `saved_place_id`, never on `place_id`. **The creator credit is a terms obligation and it survives by construction** — there is no statement in `0032` that could detach one. (R2c) |
| `source_url` / `source_thumbnail_url` (`0016`) | Facts about the SOURCE, on the save. Untouched. (R2c) |
| The source row itself | Still readable through `sources_select_via_membership`, executed as the user. (R2c2) |
| `note`, `display_name`, `category_override`, `visit_state`, `visited_at` | The user's overlay. The entire point. (R2b) |
| `tags`, `dishes`, `why_go` (`0019`) | The caption's claims about the venue the caption named. A re-point corrects which row that NAME resolved to; it does not make the caption say something else. (R2b) |
| `extracted_reason` (`0015`/`0017`) | Same reasoning, and `0017`'s insert-only posture means it could not be rewritten here even if that were wanted. (R2b) |
| `origin`, and the provenance invariant | `saved_places_provenance_required` fires `after insert or update OF origin`; a re-point touches neither. Executed with `SET CONSTRAINTS ALL IMMEDIATE` rather than reasoned about, because the failure mode is a COMMIT-time abort on the real path. (R2d) |
| `place_provider_refs` | Belongs to the `places` rows on both sides; a save does not address it. |

**Not carried — see §5.** `collection_items`.

### 2.3 What does `0031` do that should be copied?

`0031` is the wrong precedent, and `0019` is the right one. Both are named in `0032`'s header.

`0031`'s writers are `SECURITY DEFINER` because it **revoked `service_role`** from `place_mentions`,
so an invoker function would have been refused. `saved_places` is different, MEASURED at `2cf6b83`:
`service_role` holds table-level UPDATE (every column, `place_id` included, from a `postgres`-owned
`ALTER DEFAULT PRIVILEGES` entry) and carries `rolbypassrls`.

So the precedent is **`apply_saved_place_extraction` (`0019:376`)**: the other writer of
`saved_places` columns that carry no browser grant, and it is **`SECURITY INVOKER`, granted to
`service_role` alone, with the ownership predicate in its own `WHERE` clause.** `0032` copies all
three properties. What `0031` contributes is the *posture* — one named writer, service-role only,
ownership enforced by the function because `service_role` bypasses RLS — and that is copied exactly.

**Why INVOKER matters, and it is the one design claim in this change that is proven rather than
argued.** If a future migration mistakenly granted `EXECUTE` to `authenticated`:

- as **INVOKER**, the call is still refused with `42501` — `authenticated` holds no UPDATE on
  `place_id` and no EXECUTE on `place_survivor_id`. A leaked grant is a **broken feature**.
- as **DEFINER**, it succeeds, and `agent-guardrails.md` §5 rule 18 is tripped on two of its three
  counts at once: it writes a column the caller holds no grant on, and it derives the row it acts on
  from a caller-supplied id. A leaked grant is an **escalation**.

Assertion **R9** grants that EXECUTE inside the rolled-back transaction and watches the call fail
anyway. Sabotage run **S4b** flips the function to DEFINER and watches R9 fail. That pair is the
evidence; the paragraph above is only its summary.

**The price of INVOKER, stated so it is not a surprise later.** It depends on a privilege this repo
never granted explicitly — `service_role`'s UPDATE on `saved_places`, which arrives from a hosted
default entry. `0031` revoked exactly that kind of entry for its own table. If a future migration
does the same to `saved_places`, `repoint_saved_place` breaks, and it breaks silently on the hosted
projects. Assertion **R0c** names that dependency so the break is a red CI job instead.

---

## 3. What a user can and cannot do, after this migration

**Can:**

- Move **their own** save onto a different `places` row, by name, through a server action that
  resolves the name itself. The note, name override, category override, been-mark, visit date, tags,
  dishes, why-go, extracted reason, TikTok link and thumbnail all come with it.
- Do it twice. Re-pointing onto the row the save already names returns that id and **does not write
  the row at all** (R5 — measured by `ctid`, see §6).
- Name a place that has since been merged away and still land on the survivor (R6).

**Cannot:**

- Write `place_id` from a browser by any route: not directly (R1), not by calling the function
  (R1b, R1c), and not even if someone grants them EXECUTE (R9).
- Re-point **someone else's** save. Refused with `42501`, in both directions, and the row is checked
  afterwards rather than the exception being trusted (R3, R3b).
- Learn whether a saved-place id exists. A stranger's id and a nobody's id are refused with the same
  condition (R3c).
- Re-point onto a place they already have saved. Refused with `23505`, **and both saves are left
  intact** (R4). `merge_places` (`0011`) resolves this situation by deleting the loser save; that is
  right for an operator repairing a duplicate `places` row and wrong here — two saves carry two
  notes, and silently destroying one is exactly the delete-and-re-add failure this change exists to
  end. The user is told, and chooses.
- Pass a null, or an unknown place id, and have it quietly become a no-op (R7, R7b).

**Nobody, including the server:**

- Points a save at a tombstone (R6).
- Changes `origin`, or breaks the at-least-one-source invariant (R2d).
- Mutates a shared row. B still reads the place A moved away from (R2e2).

---

## 4. Evidence

Every proof ran against the local container `supabase_db_P-002`
(`public.ecr.aws/supabase/postgres:17.6.1.159`), inside one transaction that applied `0032` and
ended in `ROLLBACK`. The database was 2 users / 8 places / 8 saves / 9 sources / 12 imports /
3 extractions before and after, and `repoint_saved_place` does not exist in it now.

**Clean run: 26 assertions, 26 PASS, 0 FAIL.** Plus `inventory.sql` run with `0032` applied —
**check 5** (column grants), **check 6** (the exhaustive browser-reachable function set) and
**check 6b** (no overloads) all pass, and the whole file reports zero failures. And
`scripts/check-migration-grants.sh`: *"16 relations in public, all revoked from both browser roles;
every table also RLS enabled+forced"*.

**Failure-first.** Every control was removed and the assertion watched to fail:

| Sabotage | Assertion that fired |
|---|---|
| **S1** — the column-grant route taken instead (`grant update (place_id) … to authenticated`) | `FAIL R1: place_id is in the UPDATE grant — a browser can move a save onto any places row directly through PostgREST` |
| **S2** — ownership predicate dropped | `FAIL R3: B re-pointed A's saved place` |
| **S3** — `place_survivor_id` replaced by the caller's id | `FAIL R6: the save landed on … — a merge chain was not followed to the survivor` |
| **S4** — `SECURITY DEFINER` instead of `INVOKER` | `FAIL R8: repoint_saved_place is SECURITY DEFINER …` |
| **S4b** — same, with R8's catalogue guard neutralised so execution reaches R9 | `FAIL R9: WITH EXECUTE GRANTED, authenticated re-pointed its own save …` |
| **S5** — the idempotent early return removed | `FAIL R5: a no-op re-point wrote the row anyway (ctid (0,28) -> (0,34))` |
| **S6** — `merge_places`' resolution imported (delete the conflicting save) | `FAIL R4: re-pointing onto a place the user already holds was accepted` |
| **S7** — provenance severed on re-point | `FAIL R2c: the provenance link did not survive the re-point …` |

---

## 5. What this migration does NOT fix, and it is a real gap

### 5.1 `collection_items` is stranded by a re-point

`collection_items.place_id` references `places`, not `saved_places` (`0024:147`). So after a
re-point, any collection the user put this place into **still lists the old row** — and because the
per-user overlay is joined through `saved_places`, that item also loses the user's note and name.

It is **not fixed in `0032`**, on purpose, and the reasons are cumulative rather than any one being
decisive:

1. `collection_items` is a **shared** row that other members read. One user's private correction
   should not silently change what a collaborator sees.
2. `service_role` was deliberately revoked from `collection_items` (`0024:177`), so touching it
   would force `0032` to `SECURITY DEFINER` — surrendering the property §2.3 and R9 exist to
   establish, for a table that is L2 while the finding is L1.
3. The collision case — the collection already contains the target place — has **no non-destructive
   answer** that one user's button press should get to choose.

Detection query, for whoever picks this up:

```sql
select ci.collection_id, ci.place_id, ci.added_by
  from public.collection_items ci
 where not exists (select 1 from public.saved_places sp
                    where sp.user_id = ci.added_by and sp.place_id = ci.place_id);
```

Run locally at `2cf6b83`: **0 rows, out of 0 `collection_items` rows total.** That is a statement
about a database with 8 places in it and **not** about production — the same limitation that made
the reviewer's kill-check inconclusive. Do not read it as "the gap is empty".

**Recommendation:** a separate migration, after an owner ruling on whether a member's re-point may
move a shared collection item at all. If the answer is yes, the shape is a membership-gated
`SECURITY DEFINER` writer scoped to `added_by = p_user_id` plus a live `collection_members` row, and
it needs its own `security-privacy` review because it re-opens `0024`'s revoke.

### 5.2 The same gap already exists in `merge_places`, and nobody has noticed

`merge_places` (`0011`) moves `saved_places`, `saved_place_sources`, `place_provider_refs` and
tombstones. It **predates `collection_items` entirely** (`0024`) and does not move it. So an operator
merging two duplicate places today leaves every collection item pointing at the **tombstone**.

Locally: 0 tombstones and 0 collection items, so nothing to see and nothing proven. On the hosted
projects this is worth one query before the next merge:

```sql
select count(*) from public.collection_items ci join public.places p on p.id = ci.place_id
 where p.merged_into_place_id is not null;
```

This is a pre-existing defect found while scoping `0032`, not something `0032` introduces. It is
reported rather than fixed: editing `merge_places` is a separate migration with its own review, and
`agent-guardrails.md` §8 rule 26 says a fix in passing is not this lane's to make.

### 5.3 Also not done

- **No audit row.** There is no audit table in this schema and adding one is a table, an RLS policy
  set and a retention decision. `repoint_saved_place` returns the `place_id` it vacated so the
  caller is *able* to log it; nothing in the database records that a re-point happened beyond
  `updated_at`.
- **The vacated `places` row is left alone.** It is shared, other users may hold saves on it, and
  deleting rows nobody asked to delete is not a repair.
- **No UI, no server action.** `src/` is outside this lane's write scope. The database half is done;
  the server action that calls `repoint_saved_place` after resolving a name — the shape
  `addPlaceManually` already has — does not exist.
- **Nothing hosted.** `0032` is not on staging or production. Pushing is the orchestrator's.

---

## 6. One thing worth keeping, because it nearly shipped as a vacuous test

R5's first version asserted that a no-op re-point does not move `updated_at`. **It passed with the
control removed** (sabotage S5). `touch_updated_at()` sets `now()`, `now()` is the *transaction*
timestamp, and a policy test file is one transaction — so a row written twice inside it carries the
same `updated_at` both times, and the assertion could not see the write it existed to detect.

`ctid` can see it: an `UPDATE` writes a new heap tuple and the row's physical location moves,
same transaction or not. The assertion now reads `ctid`, with `updated_at` kept beside it as the
check a reader expects and its weakness written down.

The general shape, and it is `0024`'s failure-first rule earning its keep: **an assertion about
"nothing was written" needs an instrument that is not frozen by the transaction the test runs in.**
