# Database ruling — re-pointing a saved place at the right venue

> **Task `r1-pin`.** Round 1 finding 2 of [`product-review-2026-08-31-r1.md`](product-review-2026-08-31-r1.md).
> **Base commit `2cf6b83`** on `no-crumbs-implementation`.
> **Artefacts:** [`supabase/migrations/0032_repoint_saved_place.sql`](../supabase/migrations/0032_repoint_saved_place.sql),
> [`supabase/tests/0032_repoint_saved_place_policy_tests.sql`](../supabase/tests/0032_repoint_saved_place_policy_tests.sql).
> **Reviewed and committed.** `security-privacy` returned **permit under conditions, no veto**
> (`security-ruling-repoint-place-2026-08-31.md`); `0032` was committed at `de7e4b9` with the
> reviewed sha256 `293e8b98…` re-checked before staging.
>
> **Second pass, same day — `0033` discharges conditions C3 and C4**, and §7 below records C7.
> `supabase/migrations/0033_repoint_does_not_falsify_attribution.sql`. `0032` is **not edited**
> (rule 17, forward-fix only); `0033` replaces the function body under the identical signature.
>
> **Status: `0032` and `0033` are NOT APPLIED to the local database.** Verified rather than assumed:
> `supabase_migrations.schema_migrations` tops out at **`0031`** and `repoint_saved_place` does not
> exist in `supabase_db_P-002`. Every proof in this document ran inside a transaction that applied
> the migrations and rolled back, and the database is byte-for-byte the state this lane found it in.
> Applying, and pushing, are the orchestrator's.

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
| ~~`tags`, `dishes`, `why_go`~~ | **Overturned by `0033`. These are now CLEARED.** See §7.1 — the reasoning below was wrong about which claim they make. |
| ~~`extracted_reason`~~ | **Overturned by `0033`. Now CLEARED.** The insert-only posture was the accurate part; the conclusion drawn from it was not. |
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
  resolves the name itself. The note, name override, category override, been-mark, visit date,
  TikTok link and thumbnail all come with it. **Since `0033`, the caption-derived fields do not** —
  see §7.1.
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


---

# 7. Second pass — conditions C3, C4 and C7

> Added 2026-08-31 after `security-privacy`'s review. `0033` is the artefact for C3 and C4; C7 is
> recorded here because it is a `docs/security.md` amendment and that file is `security-privacy`'s
> to edit, not this lane's.

## 7.1 C3 — the quote must not outlive the place

**I was wrong in §2.2, and the error is worth naming precisely because the mechanism I described was
right.** `extracted_reason`, `tags`, `why_go` and `dishes` do survive a re-point structurally, and I
argued they *should*, on the grounds that "a re-point corrects which row that NAME resolved to; it
does not make the caption say something else." That sentence is true and it is not the question. The
question is what the row then **asserts**, and `security-privacy` answered it by looking at the
shipped component instead of the schema:

`src/components/sheet/place-sheet.tsx:1700-1710` renders `extracted_reason` as a `<blockquote>` with
the creator's `@handle` as its `<figcaption>` **directly beneath**. Measured on real rows (V4d, V4e):
a save re-pointed from `Ha Kosem` onto `Kohi בית קפה יפני` kept the quote `📍Ha Kosem` and the tag
`middle eastern`. The sheet would then show a venue header saying *Kohi*, a quote saying *"Ha
Kosem"*, and *@handle* credited under it. TikTok Developer Terms **III.3(n)** forbids **falsifying**
a label of origin, not only deleting one, and
`docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md` §5 records this product as
currently compliant with no gap. The feature would open one.

**Two claims were tangled in that overlay and only one is falsified:**

| Claim | After a re-point | Handling |
|---|---|---|
| *"You saved this from @handle's TikTok"* | **Still true.** The video really is where the save came from. | Kept, unconditionally — C3 requires it in either branch |
| *"@handle's video named THIS place"* | **False.** | Cleared |

**Ruled: clear, in the function, in the same statement as the move.** Clearing in the UI would leave
a false row that the next reader, export or surface renders anyway — the same instinct that chose a
resolver-mediated write over a column grant in §2.1. `0033` does the move and the clear in **one
`UPDATE`**, so there is no window, not one statement wide, in which the row names one venue and
quotes another.

**The four columns, and why each is caption-derived rather than user-authored** — every one carries a
`0019`/`0015` column comment that says so in the schema's own words: `extracted_reason` is *"a
VERBATIM caption substring"*; `tags` are *"derived by the extractor from the source post"*; `why_go`
is *"one model-written sentence saying why this post recommended this place"*; `dishes` are *"named
dishes or items the post called out"*. None carries a client write grant on any statement, so a
migration was always going to be required — which is exactly what C3 predicted.

**And a no-op clears nothing.** III.3(n) forbids falsifying *or deleting* an attribution, and a user
tapping "yes, this pin is right" must not cost them the creator's words. `0033`'s idempotent early
return is now load-bearing for that, not only for `updated_at`. Asserted by **R5b**, which is
deliberately ordered **before** R5 so a clear-on-every-call regression reports the attribution
consequence rather than a `ctid` change (measured: with R5 first, the run never reached R5b).

**This needs no UI change to be correct**, which is worth stating because it makes the database fix
complete on its own: `place-sheet.tsx:1804-1805` already renders a standalone **`Saved from
{authorLabel}`** line when the quote is null and a handle exists. Clearing does not remove the credit
from the screen — it demotes it from "@handle said this about this venue" to "you saved this from
@handle", which is precisely the surviving true claim. **R2g** asserts that exact row state (quote
null, `source_url`, `source_thumbnail_url` and `author_handle` all present) and refuses to pass if
the fixture has no handle to see.

**What this destroys, said plainly.** The four values are gone; there is no audit table, the function
does not return them, and re-pointing back does not restore the quote. C3 named that cost in advance
("clearing destroys evidence and suppressing hides a credit") and the owner chose this branch. The
mitigation belongs to the server action (C1): **read the four columns immediately before calling and
log them.** The signature was deliberately not widened to return them — a return-type change needs
`drop function`, which drops the ACL the whole verdict rests on, for a convenience one `select`
already provides.

## 7.2 C4 — and there are three refusals, not two

C4 is right that `0032`'s header names the wrong site: the leaked-grant call fails at
`place_survivor_id`, not "at the inner UPDATE". C4 asks for **two** independent refusals to be
stated. **Measured while making the assertion falsifiable: there are three.**

| # | Control | Denial |
|---|---|---|
| 1 | no `EXECUTE` on `place_survivor_id` | `permission denied for function place_survivor_id` |
| 2 | no `SELECT` on `places.merged_into_place_id` (`0012`) | `permission denied for table places` |
| 3 | no `UPDATE` on `saved_places.place_id` | `permission denied for table saved_places` |

They fire in that order and each is independently sufficient. (2) exists because `place_survivor_id`
is itself `SECURITY INVOKER` and reads a column `0012` withholds — so granting `authenticated`
EXECUTE on it, which looks like a harmless read helper, does **not** open the feature. **R9e** leaks
(1) and the `repoint_saved_place` EXECUTE grant simultaneously and watches the call still be refused
with the row unmoved.

**How the third one was found, because the method matters more than the fact.** My first R9c asserted
`insufficient_privilege` and **passed with the control it names actually removed** — refusal 2
produced the same SQLSTATE. Every C4 assertion now checks *which object was denied*, not just the
condition. This is `0008_policy_tests.sql` P17's bug class and P25a-vi/vii's, reproduced exactly, and
it is the second vacuous assertion this task has produced (§6 is the first). Both were caught by
sabotage and neither by review.

## 7.3 C7 — the self-grant reaches `place_provider_refs`, recorded

`security-privacy` §1.1: the `saved_places` INSERT self-grant (§2.1 above) reaches
**`place_provider_refs`**, not only `places`. `ppr_select_if_place_saved` (`0006:155`) carries the
same membership predicate as `places_select_if_saved`, so inserting a save that names a place uuid
also hands over that venue's Google **`provider_place_id`**. `security.md` A§1's *"the gate reaches
nothing else"* is a statement about `places`' column grant and does not cover this; §5.3's table
records `place_provider_refs` as **0**, measured without the self-grant, so it understates the reach.

**Severity: low, and acceptable at university scale — but it must be written down.** The disclosed
value is a Google place id for a venue whose uuid the caller was already given. It is not
user-attributable and it is the same identifier a Google Places lookup returns to anyone. It is
nonetheless a Google-content identifier on a route the residual-risk register does not name, and
`06` §3.1 makes anything on that surface worth being explicit about.

**Pre-existing at HEAD. Neither `0032` nor `0033` opens or widens it**, and it did not bear on the
verdict. Recorded here because this is where the next person reading about the self-grant will look.
**The `docs/security.md` §3.3 / A§1 and §11 amendments C7 actually asks for are `security-privacy`'s
to write** — `agent-guardrails.md` §4 rule 15a names that file's editor, and it is not this lane.

## 7.4 Still outstanding from the review, and not this lane's

- **C1** — the server action, which is where the "the caller resolved this id" contract is actually
  held. `src/` is outside this scope. It should also carry C3's logging mitigation (§7.1).
- **C6** — `package.json` must chain `db:test:0032`. Still not done at the time of writing; the
  suite is now **34 assertions** and includes every proof that C3 and C4 were discharged. A policy
  suite nothing runs is a policy suite that silently stops being true.
- **C5** — the three `docs/security.md` amendments, `security-privacy`'s file.
- The `collection_items` stranding (§5.1) and the same gap in `merge_places` (§5.2), both accepted as
  disclosed.
