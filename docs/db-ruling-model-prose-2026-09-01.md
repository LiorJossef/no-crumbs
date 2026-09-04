# DB ruling — the model's prose is labelled and removable, and the dish list becomes the user's

> Owner: `supabase-database`. Date: **2026-09-01**. Task `r5-whygo`, finding 3 of
> [`product-review-2026-09-01-r4.md`](product-review-2026-09-01-r4.md) (§2.2, §3 row 3).
>
> **Base:** read, applied and executed against `a468fb1fb6b00f7f576eca21a89596b737e70c3e` on
> `no-crumbs-implementation`. Written scope: `supabase/migrations/0037_*.sql`, `supabase/tests/**`,
> this file. **Nothing in `src/`.**
>
> Governs
> [`supabase/migrations/0037_model_prose_is_labelled_and_removable.sql`](../supabase/migrations/0037_model_prose_is_labelled_and_removable.sql).
> Where the migration and this document differ, this document wins.
> Proof: [`supabase/tests/0037_model_prose_policy_tests.sql`](../supabase/tests/0037_model_prose_policy_tests.sql),
> **21 assertions and two failure-first controls, all executed**.
>
> **`security-privacy` holds the veto on this** (`agent-guardrails.md` §5, §9). Applied **locally
> only**; staging (`0018`) and production (`0026`) are untouched and are the orchestrator's and the
> owner's.

## 0. The defect, measured rather than described

Read from the running local container at base commit `a468fb1`:

| | |
|---|---|
| `authenticated` UPDATE on `saved_places` | exactly `category_override, display_name, note, visit_state, visited_at` — `why_go` and `dishes` appear only in the SELECT list |
| writers of either column, from `pg_proc.prosrc` | `apply_saved_place_extraction`, `repoint_saved_place`, `normalize_saved_place_enrichment`. **All three unreachable from a browser** |
| `src/` | `grep -rn 'why_go\|whyGo\|dishes' src/` finds **readers only** — `get-spots.ts:44-45`, `ui/place/enrichment.ts` |
| the library | 11 saves, 3 users, **8 rows carry a `why_go`**, 6 carry `dishes` |

They are not dormant. `Café Florentin`'s desktop card renders `why_go` — *"A tiny place, easy to walk
straight past."* — as a **bare, unlabelled paragraph** in a card that labels the category *"worked
out from the video"* and attributes the quote *"Saved from @tlv.eats"*. Other rows carry *"The best
oat milk in the old north."* and *"The sourdough is worth the queue."*: superlatives, on a private
map, about places the user has never been.

`docs/product-edge-2026-08-31.md` §0 rules that this product's differentiator is refusing to assert
what the user did not confirm. Eight rows are currently such an assertion.

## 1. Ruling — is prose the same problem as a tag list? **No, and the difference is authorship**

`0036`'s shape is (`X_extracted` immutable, `X` the user's, `X_confirmed_at` the stamp). It is right
for a **list of tokens**, where the column is **contested between two authors**: the model proposes
`hidden gem`, the user replaces it with `date night`, and without `tags_extracted` the first is
destroyed. Choosing from a set is **selection**.

**A sentence is not a set, and editing one is authorship.** Three consequences, and they point away
from `0036`'s shape for `why_go`:

**(a) The product already has a column for the user's own prose, and it is `note`.** `note` has an
UPDATE grant, is first-writer-wins protected by `0034`, and renders as the user's words. A second
free-prose column that is *sometimes* the model's and *sometimes* the user's is exactly the "two
meanings in one column" defect `0036` §3 names. Granting authorship into `why_go` would **create**
that defect, not close it.

**(b) It is outside the stated MVP boundary and sits on an open owner question.** `CLAUDE.md` fixes
stored info at name · category · coordinates · source link · **user note** — one user-authored prose
field. Whether that boundary governs place facts only or every stored field is **OD-1**
(`product-ruling-after-the-save.md` §5), unanswered, and the r4 review names OD-1 itself as the
thing that would change its mind. A migration is not the place to pre-empt it. **Nothing here
depends on the answer:** the review's own text says the labelling half *"is the fix for it either
way"*, and removal is needed under both readings.

**(c) `src/` would misread a user-authored sentence.** `whyGoEarnsItsPlace`
(`src/ui/place/enrichment.ts:268`) hides `why_go` when it contributes fewer than `MIN_NEW_WORDS = 4`
new content words, on the documented ground that it is *"the model's own prose"* restating the
quote. A user who typed a short sentence into that column would have it **hidden from its own
author** by a filter designed for model paraphrase.

**So `why_go` gets a strictly smaller shape than `tags`: no `why_go_extracted` column at all.** The
column is only ever the model's sentence or nothing, so there are not two authors to keep apart, and
retaining a copy of a sentence the user asked to remove would be undo dressed as provenance.

**`dishes` *is* `0036`'s problem.** `cortado`, `sourdough loaf` are tokens from an effectively closed
vocabulary — a menu — and choosing among them is selection. It gets all three columns and a setter.

## 2. Ruling — edit, remove, or distinguish? Three capabilities, not one ask

| | distinguish | remove | edit |
|---|---|---|---|
| `why_go` | **yes** — `why_go_reviewed_at` | **yes** — the whole point | **no** — §1 |
| `dishes` | **yes** — `dishes_confirmed_at` | yes (empty array) | **yes** — `set_saved_place_dishes` |

**Distinguish is required for both and is the cheapest.** One nullable timestamp separates four
states nothing else in the schema can tell apart:

| `why_go` | `why_go_reviewed_at` | meaning |
|---|---|---|
| NULL | NULL | the caption said nothing worth paraphrasing. Normal, not a failure |
| SET | NULL | **an unreviewed model proposal.** Must be labelled as one |
| SET | SET | the user read it and let it stand. Their assertion now |
| NULL | SET | the user **removed** it. No import may put anything back |

`why_go is not null` cannot tell rows 2 and 3 apart. On a product whose stated edge is refusing to
assert the unconfirmed, that distinction *is* the feature. **All 8 rows get NULL** — nobody has
reviewed anything, and back-filling a timestamp would be the schema inventing the decision.

**The names differ from `0036` on purpose, and the difference is the ruling.** `_confirmed_at` marks
a column the user **authors** (`tags`, `dishes`); `_reviewed_at` marks one they may only **keep or
remove** (`why_go`). The predicate is identical — NULL means no human has decided — so if the owner
answers OD-1 by granting authorship into `why_go`, the upgrade is a rename plus a parameter.

**What the review asked for and did not get:** the r4 §3 row says *"editable and removable"*. Edit on
`why_go` is refused, for (a)/(b)/(c) above. No capability is lost — a user who wants their own
sentence on the card has `note`, which already exists, already has an UPDATE grant and already
renders. The UI lane's contract for `why_go` is therefore **keep / remove**, not a text field.

## 3. Ruling — the refill trap exists, and it is **worse** here than it was for tags

**Reproduced by execution before any of this was designed**, in a rolled-back transaction against the
live `apply_saved_place_extraction`:

```
after import 1   why_go = "The best oat milk in the old north."   dishes = {oat flat white,cortado}
user removes     why_go = NULL                                    dishes = NULL
after import 2   why_go = "The sourdough is worth the queue."     dishes = {sourdough loaf}
```

Both columns store "the user removed this" as NULL — `normalize_sentence('')` is NULL, and
`tag_list_within` requires cardinality ≥ 1 so an empty list is NULL too (all three re-measured: `t`,
`t`, `t`). `coalesce(sp.why_go, …)` reads that NULL as *never written* and refills from the next
caption. Two posts about one restaurant is a **designed** case here (`0007` acceptance I3/I4).

**And it is sharper than `0036`'s.** For tags the model put the *same words* back. Here it puts back
a **different sentence**: a removal is silently converted into a vacancy for the next model claim, so
the user who objected to one sentence they never saw is handed another one they never saw.

**There is a second trap `0036` did not have, and it is in `repoint_saved_place`.** Measured in the
same transaction: a re-point clears `why_go` and `dishes` **unconditionally** (`0033`). Add a stamp
and forget to clear it, and the row says *"a human reviewed this"* about a sentence that no longer
exists — and because §3's gate keys on that stamp, **the new venue's extraction could never write a
`why_go` again**. That is a defect this migration would have *armed*. Both stamps are cleared with
the columns they govern. `R13` restores the pre-`0037` re-point body and watches exactly that happen.

**There is a third trap, closed before it was built.** Reviewing a save that has *never* had a
sentence would stamp `why_go_reviewed_at` and permanently deny that save a sentence — a save silently
closed because a UI once rendered a control over an empty column. `review_saved_place_why_go` refuses
that call with `22004`. The condition is `why_go is null AND why_go_reviewed_at is null`, not
`why_go is null` alone, so **remove stays idempotent** (`R3b`, `R11a`, `R11b`).

## 4. Ruling — one migration, two treatments

**One migration.** `why_go` and `dishes` were created by one `alter table` in `0019`, share one
writer, one normalising trigger and one re-point clear; and the r4 review's criticism of `0036` is
precisely that it fixed one of three columns and left the class open. Splitting again earns that
criticism twice. Since an RLS/grants migration never runs concurrently with anything (roster §9 V1),
two migrations would serialise anyway, with the second rewritten against the first's copy of the same
two function bodies.

**Two treatments, stated rather than blurred:** `why_go` gets 1 column and a keep/remove function;
`dishes` gets 2 columns and a setter.

## 5. Ruling — **not column grants.** Two narrow `SECURITY DEFINER` functions

`0036` ruling 4's reason carries: the stamp is a record of a decision, a client that can write it can
claim a review it never obtained, and it must be **inseparable** from the act it records. Two grants
are two statements a caller can issue independently. A `SECURITY INVOKER` function cannot express
this — invoker runs with the caller's privileges and fails `42501` in its own body.

**`review_saved_place_why_go(uuid, boolean)` has a second reason of its own: the only legal write to
`why_go` is `null`.** A column grant would permit any string, which is the authorship §1 refuses. A
boolean parameter cannot carry prose, so the capability the owner has not yet ruled on is
**inexpressible rather than merely unimplemented** (`R1b`).

Both sit inside `security.md` §3.5 invariant 1 — *"never grant a definer function whose result is not
bounded by the caller's own identity"* — the same way `apply_saved_place_source_link` (`0016`) does:
`void` return, `auth.uid()` in the `WHERE`, and **one message for "not yours" and "no such row"**, so
neither is an existence oracle over other people's libraries (`R5`).

## 6. Ruling — re-point: `dishes` goes **even when confirmed**, and that differs from `0036`

**Flagged, not buried,** so `security-privacy` reviews a decision rather than discovers one.

`0036` kept a **confirmed** `tags` array across a re-point, because `date night` and `with maya` are
facts about the **user's plans** and survive a correction of which POI the row names.

**A dish list is not that.** `cortado`, `sourdough loaf` are facts about a **venue's menu**. Attached
to a row that now names a different place, a confirmed dish list is not merely stale — it is
**false**: the III.3(n) exposure `0033` closed, arriving through the user's own confirmation instead
of the model's. So `dishes`, `dishes_extracted` and `dishes_confirmed_at` are cleared
unconditionally, which also re-opens the column so the new venue's extraction can fill it. `why_go`
and `why_go_reviewed_at` likewise. **`tags` behaviour is untouched**, and `R8b` asserts that too — if
it ever fails, `0037` widened past its own ruling.

The alternative — keep a confirmed dish list, on the ground that the user typed it — is defensible
and is rejected because the user typed it **about a place this row no longer names**. Both branches
are asserted: `R8a` (undecided) and `R8b` (decided).

## 7. What a user can and cannot now do

**Can**, on **their own save only**:

- **remove** the model's sentence, and have that removal treated as an assertion no later import may
  undo — including a second post about the same venue with a *different* sentence;
- **keep** it, which is a distinct, recorded state from nobody having looked;
- remove it twice without an error;
- **set, edit and empty** the dish list, normalised the way the model's is (lowercased, whitespace
  collapsed, deduped in first-seen order, information-free labels dropped);
- **read `dishes_extracted`** and see exactly what the post named, before and after they change
  anything.

**Cannot**, and each is refused by the database rather than by the UI:

| attempt | refusal |
|---|---|
| `update saved_places set why_go = 'my own sentence'` on their **own** row | `42501` — no column grant. **Authorship is inexpressible** |
| `update … set why_go_reviewed_at = now()` (claim a review) | `42501` |
| `update … set dishes = …` / `dishes_extracted = …` / `dishes_confirmed_at = …` | `42501` |
| either function on **another user's** save | `42501`, victim's row byte-identical |
| the same call against a save id that does not exist | `42501`, **identical message** — no oracle |
| supply nine dishes | `23514`, refused whole; nothing truncated |
| review a save that carries no sentence | `22004`, and the column stays open |
| pass a NULL decision | `22004` — not coerced into one |
| read another user's prose as a **collection peer** | **0 rows** |
| anything at all as `anon` | no EXECUTE, no column read |

**And what nobody can do:** a later import cannot write over a sentence the user removed or kept, nor
a dish list they confirmed; and `dishes_extracted` has no writer reachable from a browser at all.

## 8. Executed proofs

Applied to the local container and recorded as `0037` in `supabase_migrations.schema_migrations`
(with a `name`, `statements` NULL — the hand-applied shape the last five rows use). `psql` is not on
this host; everything went through `docker exec supabase_db_P-002 psql -U postgres`.

- **`0037_model_prose_policy_tests.sql` — 21 assertions PASS, both failure-first controls reproduce.**
  `R12`: without `0037`'s gates the removed sentence is replaced by *"The sourdough is worth the
  queue."* and the emptied list by `{sourdough loaf}`. `R13`: without `0037`'s clears the re-pointed
  save keeps a review stamp for a sentence that no longer exists and the new venue can never be given
  one.
- **Regression, same container:** `0032` 34 PASS, `0034` 17 PASS, `0036` 18 PASS — the two functions
  `0037` patches are the ones those files assert on.
- **`inventory.sql` — all 16 checks green**, after adding the two new functions to its expected
  grant set (check 6). Checks 3, 4c, 5 and 9d confirm `anon` gained nothing and no column grant
  appeared.
- **The applied rows:** 11 saves, 8 with a `why_go` and **0 reviewed**; 6 with `dishes`, all 6
  back-filled into `dishes_extracted`, and **0 confirmed**. No stamp was invented.
- **Grants after the fact:** all five columns SELECT-only for `authenticated`, nothing for `anon`;
  both functions `prosecdef = t` with `proacl = {postgres=X/postgres,authenticated=X/postgres}`.

**One pre-existing, unrelated failure:** `0035_profile_names_policy_tests.sql` fails at `P1a`
(*"expected at least the 8 measured pre-0035 profiles, found 2"*). It is a whole-table count over
`profile_names` — the `0008` anti-pattern — and `0037` touches no `profile_names` object. Not fixed
here; `supabase/tests/0035_*.sql` is another lane's artefact and repairing it is not this task.

## 9. What this does not do

**There is no caller.** The sheet has no review affordance and the review screen shows neither field.
This is the database half; `src/` is outside this write scope. Reported as **built, not shipped** —
the r3 review's judgement that *"a reviewed, security-signed-off, live database function with no
caller is a worse state than an unapplied migration"* is accepted, and `0037` does not pretend
otherwise.

**Two `src/` follow-ups this migration makes necessary and cannot perform:**

1. `why_go` must never render **unlabelled** while `why_go_reviewed_at is null`. That is the half of
   the finding that closes without any of this, and it is the cheapest fix available.
2. the `DISHES MENTIONED` heading attributes the list **to the post**. Once a user edits `dishes`
   that attribution is false; the heading must key on `dishes_confirmed_at`, with `dishes_extracted`
   available if the post's own list should still be shown.

**Bounds are untouched.** `tag_list_within(dishes, 8, 64)` and `length(why_go) between 1 and 280`
stay exactly as `0019` set them, and the same pair is re-asserted on `dishes_extracted` — a bound
that exists on one column and not on its twin is a bound that has stopped describing the table.
