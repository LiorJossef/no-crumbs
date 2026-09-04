# DB ruling — tags are the user's vocabulary, and the model's proposal stays on the record

> Owner: `supabase-database`. Date: **2026-09-01**. Task `r3-tags-db`, finding 2 of
> [`product-review-2026-08-31-r3.md`](product-review-2026-08-31-r3.md).
>
> **Base:** read and executed against `d28362f6cbe229798b207f92df1112b3033bbbb8` on
> `no-crumbs-implementation`. Written scope: `supabase/migrations/0036_*.sql`, `supabase/tests/**`,
> this file. **Nothing in `src/`.**
>
> Governs [`supabase/migrations/0036_tags_are_the_users_vocabulary.sql`](../supabase/migrations/0036_tags_are_the_users_vocabulary.sql).
> Where the migration and this document differ, this document wins.
> Proof: [`supabase/tests/0036_tag_ownership_policy_tests.sql`](../supabase/tests/0036_tag_ownership_policy_tests.sql),
> 18 assertions, all executed.
>
> **`security-privacy` holds the veto on this** (`agent-guardrails.md` §5, §9). It is applied
> **locally only**; staging and production are untouched and are the orchestrator's and the owner's.

## 0. The defect, measured rather than described

Read from the running local container, not from the migrations:

| | |
|---|---|
| `saved_places.tags` `attacl` | **NULL** — `authenticated` holds no column privilege |
| `save_place(uuid,uuid,text,text)` | its `prosrc` **does not mention `tags`** at all |
| `apply_saved_place_extraction` | the **sole** writer of `tags`; EXECUTE is `service_role` only |
| `src/` | `grep -E 'updateSavedPlaceTags\|editTags\|addTag\|removeTag'` → **0 matches** |
| the library | **9 saves across 2 users**, 8 tagged, **16 distinct tags, 13 with a count of 1** |

So every tag in this database was written by a model out of a stranger's caption, was never shown to
the user before it was stored, and could not be changed by any role a browser can reach. The review
screen — the one surface that promises nothing reaches the map without confirmation
(`brand-and-product-foundation.md` §7) — shows no tags at all.

`docs/product-edge-2026-08-31.md` rules that this product's differentiator is refusing to assert what
the user did not confirm. Eight rows currently carry exactly such an assertion.

The r3 review said 7 places and 12 tags on one user. The larger numbers above are the same finding on
a database that has since grown a second user; nothing in the argument changes.

## 1. Ruling — is `saved_places` a fifth §3.4 table? **No, and checking was not optional**

`security.md` §3.4 names four tables where a **table-level** grant composes with a policy that
returns **another user's row**, and warns that a column added to one of them is cross-user readable
the moment it exists, with no review step that would say so.

Asked of `pg_class.relacl` rather than of the doc:

```
public.saved_places → {postgres=arwdDxtm/postgres,
                       service_role=arwdDxtm/postgres,
                       authenticated=rd/postgres}
```

**`authenticated=rd` is a table-level SELECT and DELETE grant.** `saved_places` therefore has the
dangerous *half* of the composition. It is the `extractions` shape, not the `profile_names` shape,
and the reflex "it is column-granted, so a new column arrives closed" would have been **wrong here**.
Every column this table will ever have is SELECT-able by whoever its policies admit.

What makes it safe is the other half, and only the other half. All four policies, from `pg_policy`:

| policy | cmd | predicate |
|---|---|---|
| `saved_places_select_own` | `r` | `user_id = (select auth.uid())` |
| `saved_places_insert_own` | `a` | `user_id = (select auth.uid())` (WITH CHECK) |
| `saved_places_update_own` | `w` | `user_id = (select auth.uid())` (USING **and** WITH CHECK) |
| `saved_places_delete_own` | `d` | `user_id = (select auth.uid())` |

No membership indirection, no `shares_a_collection_with`, no `collection_role`. Collections share the
`places` row — the POI identity — and never a save: `collection_items.place_id` references
`places(id)`. And no `SECURITY DEFINER` function that reads `saved_places` is granted to
`authenticated`; the only one granted at all is `apply_saved_place_source_link`, which writes.

**Verdict.** `saved_places` is the same-user case, like `extractions`. The two columns added by
`0036` are readable by their owner, by `service_role`, and by nobody else. **That disclosure is
intended and is stated in the migration header rather than arrived at by default** — §3.4's
option (3) — because the owner *must* be able to read `tags_extracted`: a proposal the user cannot
see is the thing this work exists to stop.

**Proved by execution, not by reading policies.** `T5` puts two users in one shared collection and
has the peer read the owner's save. It returns **zero rows**, both by id and as a bare
`select * from saved_places`. Its control fires first: the same peer reads the shared `places` row
and the `collection_items` row, so a zero from a broken fixture cannot pass as a zero from a policy.

> **Recommended edit to `security.md` §3.4, which is `security-privacy`'s to make, not mine:** add
> `saved_places` beside `extractions` as a table-level-granted relation with same-user policies only.
> The list of four cross-user tables is unchanged. The evidence is the header of `0036` and `T5`.

## 2. Ruling — a tag is **user annotation**, and the schema said so before the argument did

The question has a structural answer that predates it: `tags` is a column on `saved_places`, the
per-user row, and **not** on `places`, the shared POI. Two users who save the same venue hold two
independent arrays over one place. Place facts — coordinates, name, category, provider identity —
live on `places` and are shared by design. Whoever wrote `0019` put tags on the user's side of that
line, and the line is right: *date night*, *with Maya*, *worth the queue* are facts about a person's
plans, not about a restaurant.

**So the vocabulary is the user's, and always was. What was missing was not the ruling — it was the
write path.**

`src/app/api/imports/confirm/route.ts:48` calls the enrichment "place facts by …", which is the
opposite reading. `0036` does not silence it; it makes it harmless. After this migration the model's
proposal is kept **as a proposal**, in its own column, and the array the product renders and filters
is the one the user is allowed to own. If the owner later rules that tags are place facts,
`tags_extracted` is already the right home for them and the change is a rename.

**A model-written tag the user never saw remains an unconfirmed assertion even under that ruling**,
which is the r3 review's own "what would change my mind" and is correct. `0036` gives the product the
predicate it needs to say so — see §3 — but the surface that *shows* tags at review is `src/` work
and is not in this lane.

## 3. Ruling — editing must not falsify what the extractor said

Today `tags` carries two meanings in one column: **what the model proposed** and **what the product
shows**. They are identical only because the second has no other writer. Make the column writable and
the first is destroyed on the first edit, with nothing anywhere to recover it — `saved_places` has no
history table, no soft delete and no audit trail. That is `0034`'s finding about `note`, restated one
column to the right.

`0033` ruled that a change must not falsify what a creator said. The extractor is a creator here, and
so is the caption's author behind it. So two meanings get two columns, and a third records consent:

| column | meaning | writer |
|---|---|---|
| `tags_extracted text[]` | what the extractor proposed when this place entered the map | the server, once. **No grant to `authenticated`** — an UPDATE naming it is refused with `42501` |
| `tags text[]` | the vocabulary the product renders and filters — **the user's** | `set_saved_place_tags` only |
| `tags_confirmed_at timestamptz` | when the user last asserted that vocabulary. **NULL = still an unconfirmed model proposal** | `set_saved_place_tags` only, from `now()` |

`tags_confirmed_at` does two jobs nothing else in the schema can:

**(a) It distinguishes "the user looked and kept these words" from "nobody ever looked."**
`tags is distinct from tags_extracted` cannot: a user who reviews the model's tags and agrees is
otherwise indistinguishable from one who never saw them. On a product whose stated edge is refusing
to assert the unconfirmed, that distinction *is* the feature. **All 8 tagged rows get NULL.** Nobody
has confirmed anything, and back-filling a timestamp would be the schema inventing the consent.

**(b) It stops the extractor undoing a deliberate deletion — a defect this migration would otherwise
have armed.** `tag_list_within` requires cardinality ≥ 1, so "no tags" is stored as `NULL`, and
`apply_saved_place_extraction`'s `coalesce(sp.tags, incoming)` reads `NULL` as *never written*. A
user prunes ten junk tags; a second TikTok mentions the venue; the model puts them back. Two posts
about one restaurant is a **designed** case in this product (`0007` acceptance I3/I4, `0034`'s
header). So: **once `tags_confirmed_at` is set, the extractor may not touch `tags` again, in either
direction.** A human's assertion outranks a later model write, including an assertion of absence.

`T11` proves this assertion is load-bearing rather than merely green: it restores `0019`'s body
inside the test transaction and repeats the second import against a save whose owner deleted every
tag. The tags come back. That is the defect `T7` catches.

## 4. Ruling — **not a column grant.** One narrow `SECURITY DEFINER` function

The obvious build is `grant update (tags) on public.saved_places to authenticated`, and it is
rejected for a reason that is **not** safety. On its own it is perfectly safe: RLS still bounds it to
the caller's row, and both CHECK constraints still normalise and bound the value without trusting the
caller. Two of the three house precedents genuinely do not apply:

| precedent | its reason | applies here? |
|---|---|---|
| `0035` — satellite table | a table-level grant meets a **cross-user** policy | **No.** §1: no cross-user policy on this table |
| `0032` — `SECURITY INVOKER` fn | the value must be **server-resolved** | **Not to `tags`.** A tag is a string the user types; there is nothing to resolve, and the two CHECKs already refuse a malformed one |

**`0032`'s reason applies to the other column.** `tags_confirmed_at` is a record of consent. A client
that can write it can claim a confirmation it never obtained — precisely the failure the column
exists to prevent. And it must be **inseparable** from the act it records: two grants, on `tags` and
on `tags_confirmed_at`, are two statements a caller can issue independently, so the product could
change the words without recording who chose them, or record a choice nobody made.

A `SECURITY INVOKER` function cannot express this — invoker runs with the **caller's** privileges, so
a function writing an ungranted column fails `42501` in its own body.

**So: one `SECURITY DEFINER` function, `set_saved_place_tags(uuid, text[])`, granted to
`authenticated`, and NO column grant on any of the three columns.** Calling it *is* the user
asserting the vocabulary, so it always stamps; and because there is no grant, **there is no way to
write tags without stamping.** The §3.4 property is preserved: a write that changes the words while
lying about their provenance is not refused, it is *inexpressible* (`T1b`, `T1c`, `T1d`).

It sits inside §3.5's invariant 1 as `security.md` itself restates it — *"never grant a definer
function whose result is not bounded by the caller's own identity"*. It returns `void`, its `WHERE`
carries `sp.user_id = (select auth.uid())`, and it raises `42501` for a row that is not the caller's
with **the same message** for "not yours" and "does not exist", so it is not an existence oracle
(`T4`). Same shape as `apply_saved_place_source_link` (`0016`), which §3.5 already grades safe.

## 5. The two changes to existing functions, and the one judgement call in them

**`apply_saved_place_extraction`** — records `tags_extracted` (first non-null writer wins) and
refuses to write `tags` once `tags_confirmed_at` is set. §3(b). Still `service_role`-only EXECUTE, so
nothing a browser can call reaches either change.

> `apply_saved_place_extraction` is **`SECURITY INVOKER`** — `pg_proc.prosecdef` is `f`. It needs
> no definer, because its only caller is `service_role`, which holds table-level ALL on
> `saved_places` and `BYPASSRLS` in its own right. Its `sp.user_id = p_user_id` guard is therefore
> load-bearing exactly as `0019` says.
>
> **Withdrawn:** an earlier draft of this block raised that as a *correction* to `security.md` §3.5,
> claiming the table lists this function on the definer surface. **It does not.** §3.5 lists
> `apply_saved_place_source_link` — a different function, one letter apart in a skim, which genuinely
> *is* definer (`prosecdef = t`). The document is right as written and no edit is owed to it here.
> The mode statement above stands on its own evidence; only the accusation was wrong.

**`repoint_saved_place`** — this is the judgement call, and it is flagged rather than buried.
`0033` clears `extracted_reason`, `tags`, `why_go` and `dishes` in the same UPDATE that moves
`place_id`, so the row never names the new venue while carrying the old venue's quote (the III.3(n)
exposure). Two new columns are two new ways to leave that window open. The rule chosen:

- **`tags_extracted` — cleared unconditionally.** Verbatim model output about a candidate that turned
  out to be the wrong venue. Exactly `0033`'s case.
- **`tags` — cleared only while unconfirmed.** An unconfirmed array is still the model's proposal
  about the wrong place and goes with it. A **confirmed** array is the user's own words about their
  own plans, and survives a correction of which POI the row names — for the same reason `note` has
  survived a re-point since `0032`. `0033`'s principle is that a change must not falsify what a
  creator said; the user is a creator, and deleting their vocabulary because the model got the venue
  wrong falsifies them to fix the model.
- **`tags_confirmed_at`** follows `tags`, so the pair can never say "confirmed" about an array
  nobody chose.

**The alternative — clear all three unconditionally, as `0033` does today — is defensible**, and the
argument for it is that a user who tagged *worth the queue* may have meant the queue at the venue
they thought they had saved. It is called out here so `security-privacy` reviews a decision rather
than discovers one. Both branches are asserted: `T8a` (unconfirmed) and `T8b` (confirmed).

Both function bodies were **spliced verbatim from `pg_get_functiondef()` on the running container**
and then patched, not retyped. That was not fastidiousness: an earlier hand-written draft of the
re-point body lost three guards at once — it invented a helper `canonical_place_id` that does not
exist, dropped the `place_survivor_id` merge-chain hop and the `v_old = v_target` short-circuit, and
changed the return type from `uuid` to `void`. Postgres also refuses a `create or replace` that drops
the three parameter defaults on `apply_saved_place_extraction`. Diff both against the database.

## 6. What a user can and cannot now do

**Can**, through `set_saved_place_tags` on **their own save only**:

- add, replace and remove tags, in one call — the array they pass becomes their vocabulary;
- **delete every tag** by passing `'{}'`, which stores `NULL` and, crucially, still stamps, so the
  extractor may never put them back;
- have their words normalised the same way the model's are — lowercased, whitespace collapsed,
  deduped in first-seen order, information-free labels like `...` dropped — so one word typed once
  cannot become two chips;
- read `tags_extracted` and see what the model proposed, before and after they change anything.

**Cannot**, and each is refused by the database rather than by the UI:

| attempt | refusal |
|---|---|
| `update saved_places set tags = …` on their **own** row | `42501` — no column grant |
| `update … set tags_extracted = …` (falsify the extraction) | `42501` |
| `update … set tags_confirmed_at = now()` (claim a consent) | `42501` |
| `set_saved_place_tags` on **another user's** save | `42501`, victim's row byte-identical |
| the same call against a save id that does not exist | `42501`, **identical message** — no oracle |
| supply nine tags | `23514`, refused whole; nothing truncated |
| read another user's tags as a **collection peer** | **0 rows** |
| anything at all as `anon` | no EXECUTE, no column read |

**And what nobody can do:** a later import cannot overwrite a vocabulary the user confirmed, and
`tags_extracted` has no writer reachable from a browser at all.

## 7. What this does not do

**There is no caller.** The sheet has no tag affordance and the review screen still shows no tags.
This is the database half; the product half is a sibling lane. `repoint_saved_place` has been live
and callerless since `0032`, and the r3 review is right that *"a reviewed, security-signed-off, live
database function with no caller is a worse state than an unapplied migration"* — so this is reported
as built, **not** as shipped, and `0036` deliberately does not pretend otherwise.

The bounds are untouched: `tag_list_within(tags, 8, 32)` stays at 8 tags of 32 characters, and
`src/domain/extraction/tags.ts` stays stricter at 5 tags of 2–28. That is the correct relationship —
the database is the outer bound a corrupt caller cannot cross, the domain is the product's taste.

The **five** ungranted enrichment columns are now two classes rather than one: `tags` has a user
write path, `why_go` and `dishes` still do not, and the r3 review is right that they are the same
class of model-written text. Whether they get the same treatment is a product question, not a schema
one, and it is not answered here.
