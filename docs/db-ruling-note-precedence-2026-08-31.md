# Database ruling — the note the user wrote is not the import's to overwrite

> **Task `r2-note-loss`.** A live data-loss defect, armed the same afternoon by this project's own
> commit `80c5bc1`.
> **Base commit `112cb77`** on `no-crumbs-implementation` — every measurement below was taken
> against that tree. `HEAD` had moved to `31f4d14` by the time this was written (sibling lanes
> landing); neither artefact touches a path those commits changed.
> **Artefacts:** [`supabase/migrations/0034_note_first_writer_wins.sql`](../supabase/migrations/0034_note_first_writer_wins.sql),
> [`supabase/tests/0034_note_precedence_tests.sql`](../supabase/tests/0034_note_precedence_tests.sql).
> **Status: NOT REVIEWED, NOT COMMITTED, NOT APPLIED anywhere.** Verified rather than assumed —
> `supabase_migrations.schema_migrations` tops out at **`0031`**, and `pg_proc` in
> `supabase_db_P-002` still holds the destructive body as of this writing. Every proof below ran
> inside a transaction that installed `0034` and rolled back; the local database is byte-for-byte
> the state this lane found it in (§4.3). Applying, committing and pushing are the orchestrator's.
> `security-privacy` has not seen this yet.

---

## 1. The defect

`save_place`'s ON CONFLICT clause, read out of `pg_proc.prosrc` on the local container rather than
out of a file, and identical in `0024:651-652`, `0017:72`, `0016:122` and `0007:231`:

```sql
on conflict (user_id, place_id)
  do update set note = coalesce(excluded.note, saved_places.note)
```

`excluded.note` is the **incoming** note. A non-null incoming note therefore **replaces** the stored
one: last writer wins. The `coalesce` looks protective and is — but only in the direction that was
never under threat. It protects the stored note from being *nulled*. It does nothing to protect it
from being *overwritten*.

### 1.1 Why it was harmless for the product's whole history, and is not now

`ConfirmImportRequestSchema` has always carried a per-item note and the review screen has always
sent `null`. So `excluded.note` was null on every import ever performed and the coalesce could not
destroy anything.

`80c5bc1` — *"feat(review): capture why you are saving, at the moment you still know"*, 2026-08-31
22:28 +0200 — wired the textarea to that field. From that commit forward the failure is:

1. The user saves *Ha Kosem* from a TikTok in July, and a week later writes *"the pickle bar, ask
   for extra amba"* in the place sheet.
2. In August a second TikTok mentions Ha Kosem. The candidate arrives in review **already ticked** —
   the 2026-08-29 owner ruling on duplicates — so the user does not have to choose it.
3. A note goes into the box for the new video.
4. `save_place` runs, the ON CONFLICT fires, and the July sentence is **gone**. Not archived, not
   versioned: `saved_places` has no history table, no soft delete and no audit trail on `note`.
   There is nothing anywhere to restore it from.
5. The result banner reads **`already saved`** — the product telling the user that nothing happened,
   at the exact moment something irreversible did.

Two posts about one restaurant is not an edge case here. It is a **designed** case: `0007`'s header
names it acceptance I3/I4/A2, and `0019`'s header calls *"a later, unrelated import of the same
venue"* the reason its own columns are first-writer-wins.

## 2. The ruling

```sql
on conflict (user_id, place_id)
  do update set note = coalesce(saved_places.note, excluded.note)
```

The arguments swap. **First non-null writer wins.** Everything else in `0024`'s body is carried
across byte for byte — verified by diff, §4.1.

## 3. The three questions the dispatch asked

### 3.1 Is the "one write path, three precedence rules" inconsistency wider than `note`?

**No, and that is a finding rather than a deferral.** Read as three rules the change looks like a
fourth. It is not. Measured against the shipped definitions rather than recalled, here is
everything `save_place` does on a **second** call for the same `(user_id, place_id)`:

| what | rule | where |
|---|---|---|
| `tags`, `why_go`, `dishes` | `coalesce(sp.x, incoming)` — first non-null writer wins | `0019:395-397`, via `apply_saved_place_extraction` |
| `source_url`, `source_thumbnail_url` | `coalesce(sp.x, src.x)` — first non-null writer wins | `0016:70-72`, via `apply_saved_place_source_link` |
| `extracted_reason` | absent from the DO UPDATE list entirely — first INSERT wins | `0024:648-650`, in as many words |
| `saved_place_sources` | **accumulates** (`on conflict do nothing`) | `0024:663-665` |
| `display_name`, `category_override`, `visit_state`, `visited_at` | never written by this function at all | — |
| `note` | `coalesce(excluded.note, sp.note)` — **last** writer wins | `0024:651-652` — **the outlier** |

So it is **one rule, one accumulator, four columns this function never touches, and one exception**.

`source_url`'s header calls its rule *"first-source-only"*, which is the same rule under a name that
describes its effect on that particular column; `extracted_reason` is the same rule made
*structural*, which is stronger, because there is no grant path that could express the update at
all. And `saved_place_sources` is not a competing precedence rule — it is a different table on a
different key `(saved_place, source)`, and it is the **designed** home for multi-source information.
`0019`'s header is explicit: *"Union-across-sources would need per-source attribution, and that
lives on `saved_place_sources`, not in a wider column here."*

The exception is `note`. It is **the only column a human typed**. Every column holding machine
output is protected from being overwritten by a later import; the one holding the user's own
sentence is the single one that is not. That is the inconsistency, and it is *inverted* — it
protects the cheap thing (a model can re-derive tags from the same caption tomorrow for the price of
a cached extraction) and exposes the irreplaceable one (nothing can re-derive a sentence the user
wrote in July).

**Nothing beyond `note` needs reconciling.** The other columns already agree with each other;
changing any of them would *create* the inconsistency this migration removes. Fixing `note`
collapses the write path to one sentence: *on a second save, the first non-null value of every
column stands, and anything that genuinely varies per source accumulates on `saved_place_sources`.*

### 3.2 Is first-writer-wins right, or merely safe?

**Right — and the reasoning is not "it is the conservative option".** The objection is real and is
recorded here so it is argued with rather than skipped: first-writer-wins makes the *second* note
unreachable through the import path. The user types a sentence and it silently does nothing. That
is a second kind of silent write-loss, not the absence of one, and *"we swapped a destructive
failure for a quiet one"* would be a weak defence on its own.

It is not the defence. Three properties make the two failures asymmetric, and the first is the one
that settles it:

1. **`note` stays fully editable, so this is not write-once.** Measured on the container:

   ```
   authenticated | UPDATE | category_override, display_name, note, visit_state, visited_at
   ```

   and `src/app/actions/saved-places.ts:124` uses that grant — a direct `.update({ note })` under
   RLS — for the sheet's note editor. `save_place` is not the editing surface and never was. This
   migration makes the **import path** non-destructive and leaves editing exactly where the product
   already put it. A user whose second note did not land can still write it, in the place they
   already write notes. A user whose first note was destroyed cannot get it back, because it is not
   anywhere. Asserted by **N5**.
2. **Recoverability, and this is the decisive asymmetry.** The unreachable note is **on screen** at
   the instant it fails to land — the user just typed it, in a textarea they are looking at. The
   destroyed note was written weeks ago, is not on screen, and its loss is not observable at the
   moment it happens.
3. **Consent and frequency.** The destructive path fires on a candidate that arrives **already
   ticked**, so a user can lose the note by confirming an import they were not reading closely. The
   unreachable path requires a deliberate act of typing. The failure being prevented is both
   commoner and unchosen; the one being introduced is rarer and follows an intent.

**And this repo already ruled this way, one migration ago, on this column, for this class of harm.**
`0033:221-227` refuses to merge two saves during a re-point because *"the two saves carry two
different notes … and silently destroying one of them is precisely the 'delete-and-re-add loses the
note' failure this migration exists to end. The user is told, and chooses."* `0032`'s header lists
the note **first** among *"four of the five things the MVP boundary says this product stores"*. A
feature that refuses to destroy a note when the user presses a button, sitting beside a function
that destroys one **without being asked**, is not two positions. It is one position with a hole in
it, and this closes the hole.

**Alternatives considered and rejected**, named so they are not re-proposed:

* **Append the two notes.** Silently mutates prose the user wrote, grows without bound over repeated
  imports, and has to invent a separator the user did not choose. It also stops the column being *a
  thing the user typed*, which is the property that earns it this protection in the first place.
* **Raise on a conflicting note.** `save_place`'s contract is an idempotent re-save — `0033:205`
  leans on it directly — and `confirm/route.ts` saves several candidates per request, so an
  exception would turn one collision into a partial batch failure. A save is not a failure.

### 3.3 Agreement with the reviewer's judgement

**Agreed, explicitly and without reservation.** Stopping the loss must not wait for the better
product answer. An unreachable note is a worse review screen; a destroyed note is gone forever.

But this is the **floor, not the finished answer**, and the finished answer should be built:

> **Follow-up, not this lane's and not in `supabase/`:** when the review screen is about to save a
> place the user has **already saved**, show the existing note in the box instead of an empty one,
> so the second note is an **edit of the first** rather than a write that vanishes. That turns
> first-writer-wins from a silent floor into a visible, correct interaction — and it is the only
> version in which the user can *see* the precedence rule they are subject to. It is a `src/`
> change (the review screen plus a read of `saved_places.note` at review time) and belongs with
> whoever owns the import review UI.

## 4. Evidence

Everything below is **executed**, at base commit `112cb77`, against `supabase_db_P-002`. No claim in
this document rests on reading a definition.

### 4.1 The change is one line, and nothing else moved

`diff` of the `create or replace function public.save_place … $fn$;` span of `0024` against `0034`:

```
27a28,34   (a seven-line comment explaining the argument order)
29c36
<     do update set note = coalesce(excluded.note, saved_places.note)
---
>     do update set note = coalesce(saved_places.note, excluded.note)
```

One statement. The `apply_saved_place_source_link` call `0024` restored is carried across, the
signature is unchanged, and `create or replace` preserves the ACL — the revoke/grant pair is
re-issued anyway for the reason `0024`'s own header gives.

### 4.2 The test is red against the shipped definition and green against `0034`

**Against the live, unfixed body** (`supabase/tests/0034_note_precedence_tests.sql` run alone):

```
NOTICE:  PASS N0a fixture user has a profile
NOTICE:  PASS N0b a first save lands its note
ERROR:  FAIL N1: a second import DESTROYED the first note. note is now
        'the lunch queue is shorter at 2pm' — this is the r2-note-loss defect
```

That is the defect reproduced against real rows, not described.

**With `0034` installed in the same transaction**, 17 assertions, 0 failures:

```
PASS N0a fixture user has a profile
PASS N0b a first save lands its note
PASS N1  a second import with a different note leaves the first note standing
PASS N1b the second save upserted the same saved_places row
PASS N2  a second save with a null note leaves the note standing
PASS N3a a save with no note leaves the column null
PASS N3b a later import still lands the FIRST real note
PASS N4a extracted_reason is unchanged by later saves
PASS N4b tags, why_go and dishes are unchanged by later saves
PASS N4c source_url is still the first source's
PASS N4d saved_place_sources accumulated one row per source (3)
PASS N4e display_name, category_override, visit_state and visited_at are untouched
PASS N4f origin is unchanged
PASS N4g the note survived a third import too
PASS N5  the note is still fully editable by its owner — first-writer-wins is not write-once
PASS N6  a manual add over an existing save leaves the note and the origin alone
PASS N7  CONTROL: with 0024's body reinstalled the second import DOES destroy the first note
         — the assertions above are load-bearing
```

Mapping to the four proofs the dispatch asked for: **(1)** N1, **(2)** N2, **(3)** N3a/N3b,
**(4)** N4a–N4g. N5, N6 and N7 are additional.

**N7 is the one to read twice.** Inside the same transaction it reinstalls `0024`'s body verbatim
and asserts that the second import *does* destroy the note. Without it, every PASS above is only
known to be green and not known to be load-bearing — this project has already caught three
instruments that were confidently wrong about exactly that distinction.

### 4.3 The local database is unchanged, and `0032`/`0033` were not needed

`0034` touches only `save_place`'s body; `0032` and `0033` add `repoint_saved_place` and do not
appear in it. **No migration was applied.** The proof ran as one stream on stdin: `begin;`, then
`0034`'s SQL with its own `begin;`/`commit;` stripped, then the test file, whose own `rollback;`
unwinds the function install along with everything else. Measured immediately afterwards:

```
saved_places=8  places=8  auth.users=8  sources=9      (identical to before the run)
sources where platform_source_id like '7934%'      -> 0
auth.users where email like '%note-precedence%'    -> 0
places where name like 'Note Fixture%'             -> 0
prosrc like '%coalesce(excluded.note, ...)%'       -> t   (still the DESTRUCTIVE body)
```

That last line is deliberate and is flagged in §5: the shared local database still runs the body
that loses notes.

### 4.4 One harness trap, recorded because it cost a run

`set constraints all immediate` is **not** a one-shot flush — it changes the mode for the remainder
of the transaction. Left immediate after discharging the fixtures' `places_alias_required` backlog,
`saved_places_provenance_required` fires on the INSERT *inside* `save_place`, before the
`saved_place_sources` row two statements later exists, and every import save aborts with
*"origin=import but no source"*. The first run of the test file failed exactly this way. The fix is
the pair `set constraints all immediate; set constraints all deferred;`, which discharges the
backlog and restores the mode PostgREST actually runs in.

`supabase/tests/0031_place_mentions_policy_tests.sql` has the same shape — it discharges at line 183
before its role switch and never restores deferred — but the trap does **not** bite it, and the
reason is worth writing down rather than leaving as luck: both of its `save_place` calls (lines 735
and 747) pass a **null source id**, so `origin` is `'manual'` and `assert_saved_place_provenance`
returns early. The hazard there is **latent**, not live: the first `save_place(..., src, ...)` added
to that file will hit it. Passed on rather than fixed — `0031`'s test file is not this lane's.

## 5. What is NOT done, and who it belongs to

1. **Nothing is applied.** The local database still holds the destructive body (§4.3), so any agent
   importing the same place twice against `supabase_db_P-002` right now can still lose a note.
   Applying `0034` locally would be **out of order** — `0032` and `0033` are committed and
   unapplied — and applying anything to a database four other lanes are sharing is the
   orchestrator's call, not this lane's. Flagged rather than done.
2. **`db:test:0034` is not chained into `npm run db:test`.** `package.json` is outside this lane's
   write scope. One line, and until it exists this file is a gate only when invoked by hand.
3. **No backfill, and there is nothing to back fill from.** Notes already overwritten are
   unrecoverable — no history table, no audit row, no previous value stored anywhere. Locally, one
   of eight `saved_places` rows carries a note and its `updated_at > created_at` is a sheet edit
   from task `r1-note`, not an import overwrite; no local loss is detectable. **The hosted projects
   are not measured here** — hosted access is the orchestrator's and the owner's. The exposure
   window is small (`80c5bc1` is from this afternoon and is not deployed as of this writing), and
   that is a reason to land this fast, not a reason to assume it is empty.
4. **The review-screen fix (§3.3) is not built** and is not in `supabase/`.
5. **`security-privacy` has not reviewed this.** It changes no table, no policy, no RLS setting and
   no grant — one `create or replace` on an existing function under an unchanged signature, with
   the revoke/grant pair restated — so the browser-reachable function set is unchanged and
   `inventory.sql` check 6 still holds. That is an argument for a light review, not a reason to
   skip one; the call is the orchestrator's.
