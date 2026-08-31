# Database ruling — a first and last name at sign-up

> Task `r2-names-db`. Written 2026-08-31, revised and re-measured 2026-09-01 after the orchestrator
> pushed back on the first draft's derivation of `display_name`. The pushback was right and R1 below
> is the second answer, not the first.
> Author: the Supabase / Database lane. Base commit `f07d1b64fd212185d375e21af00ed3d172fe8bc4`;
> the branch HEAD had moved to `166da6e6f2fc74a4477313005909fb2b343af223` by the time this was
> re-measured.
> Implemented by [`supabase/migrations/0035_names_at_sign_up.sql`](../supabase/migrations/0035_names_at_sign_up.sql),
> proved by [`supabase/tests/0035_profile_names_policy_tests.sql`](../supabase/tests/0035_profile_names_policy_tests.sql).
>
> This ruling touches RLS, grants and policies, so guardrail 20 applies: it is not self-approved,
> and `security-privacy` reviews the migration as a frozen artefact before it lands on any hosted
> project. **See "Local drift" at the foot — the file has been applied to the shared local
> container by someone other than this lane, and `schema_migrations` does not record it.**

## The request

Collect a first and last name at sign-up, so the product can address people by name.

That is **personalisation** — the product addressing *you*. It is not a request for a name to show
to other people. Those are two different objects with two different audiences, and the schema is the
only place they can be held apart: once a name reaches a column a peer policy can see, no amount of
application care puts it back.

## The fact that shaped the answer

The obvious build is two columns on `public.profiles`. Measured on the local container, that is
wrong, and the reason has nothing to do with names:

```sql
grant select on public.profiles to authenticated;                       -- 0002:24, re-issued 0008:57
create policy profiles_select_collection_peers on public.profiles
  for select to authenticated using (public.shares_a_collection_with(profiles.id));   -- 0024:589
```

The grant is **table-level**, so it covers every column the table will ever have. The policy is
**row-level**, because RLS has no column dimension. Composed: *anyone who shares a collection with
you can read every column of your `profiles` row, including one added later.* A name column there is
disclosed to every collection peer **by inheritance, with no decision taken by anybody**.

Reproduced, not reasoned. `P7` adds a probe column to `profiles` inside the test transaction and has
the peer read it back:

```
PASS P7 control reproduced: a name column ON `profiles` IS readable by a collection peer
        (read back Levi) — which is why 0035 puts names on their own table
```

Postgres cannot express "the owner reads all columns of this row, a peer reads one of them" on one
table: privileges are per-column and row-blind, policies are per-row and column-blind. The only
representation of the actual access rule is a second relation.

## R1 — Two names, two audiences, and **neither derives from the other**

**Ruling.** `public.profile_names (profile_id pk/fk, first_name, last_name, created_at, updated_at)`
holds the private name. `public.profiles.display_name` is **untouched** — same column, same grant,
same policies, same single writer. **There is no trigger copying one into the other, in either
direction, and `0035` issues no DDL against `profiles` at all.**

| | holds | audience | written by |
|---|---|---|---|
| `profile_names.first_name` / `.last_name` | the **private name** — what the product calls you when it is talking to you | its owner, and nobody else | the user; `handle_new_user()` at sign-up on their behalf |
| `profiles.display_name` | the **public label** — what other people see beside your name in a shared collection | the user, collection peers, invite-link holders | the user, through the "what should people call you" prompt |

### Why the first draft was wrong

The first draft derived `display_name` from `first_name` with an AFTER trigger. The orchestrator
vetoed it, and the argument against it is already written in this repo — in a doc comment on a
function that solves the identical problem for a different field
(`src/domain/collections/collection.ts:159-168`):

> *"Prefill, never fallback. The suggestion is shown to the person it is about, in a field they have
> to confirm, which makes it consent; deriving a visible name from someone's address **without** that
> confirmation would put a fragment of their email in front of collaborators who were never given
> it. That is why `memberLabel` above falls back to `A collaborator` and not to this."*

Swap "address" for "given name" and the paragraph is about this migration. A name typed into a
sign-up form to personalise the product is not consent to show that name to strangers in a shared
collection, and a trigger copying one into the other launders the first into the second silently.
The removal is asserted from three sides so it stays removed: `P0a` (a first name at sign-up leaves
`display_name` null), `P4a` (the two move independently in **both** directions) and `P4b`
(`profiles` carries exactly one trigger, `profiles_touch`).

### Recommended `src/` follow-up

Have `NamePrompt` **prefill** from `first_name`. Prefill, never fallback — the peer-visible label
still requires the user to confirm it, and nobody is asked to type their name twice. That is the
pattern the codebase already uses for the email local part, applied to a better source.

### "Do not assume `display_name` is load-bearing" — measured, and it is

The orchestrator's inference was that a column null in production-shaped data for the life of the
product is evidence for retiring or deriving it. The premise is true and the conclusion does not
follow, and the difference is measurable rather than a matter of taste:

- **It is null because nothing ever *wrote* it, not because nothing *reads* it.** The only writer is
  `setDisplayName` (`src/app/actions/collections.ts:536`), reached from `NamePrompt`
  (`join-client.tsx:141`) — the invite-join flow. None of the eight local accounts has ever joined a
  collection by invite link, which is exactly why all eight are null.
- **It has six render sites.** `memberLabel` is imported by `collections-index-list.tsx:377`,
  `join-client.tsx:86`, `collection-place-detail.tsx:229`, `share-panel.tsx:547` and
  `collection-content.tsx:527,980`. Retiring the column makes every peer permanently
  `A collaborator`; deriving it is the laundering above.

So the count is **two name objects, not three**: one private fact and one consented public label,
each with exactly one writer, and no path between them. `display_name` is not a third name — it is
the only *consented* one.

### Alternatives rejected

| | why not |
|---|---|
| Two columns on `profiles`, grants unchanged | Discloses a user's given and family name to every collection peer by inheritance. Reproduced as `P7`. |
| Two columns on `profiles`, table-level `SELECT` replaced by a named column list excluding them | Correct on peers, and follows the `places`/`place_mentions` discipline — but a column list is row-blind too, so it withholds the names from **their own owner**. Write-only names no account screen can prefill, and it changes grants on a live table four PostgREST embedded joins depend on. |
| Derive `display_name` from `first_name` (the first draft) | Routes a name given for personalisation into a peer-visible label without the confirmation the product's own design requires. Vetoed, and now asserted against. |
| `display_name` as `GENERATED ALWAYS` | Needs drop-and-recreate (losing the column's ACL), and generated columns are not updatable — which breaks `setDisplayName` at runtime. |
| Retire `display_name` | Six render sites and a dedicated consent prompt. Every peer becomes `A collaborator` forever. |

## R2 — Nullable, permanently; "required" is the sign-up form's job

**Ruling.** Both columns nullable, and a user who supplied no name has **no row at all** — so
"absent" is one state, not two ("no row" and "a row full of nulls").

1. **Measured: 8 profiles, every one with `display_name` null, none back-fillable.** There is no name
   for them anywhere in the database — `auth.users` holds an email address, not a person's name. A
   `not null` column with no default is unwritable for those rows without inventing data, which
   guardrail 25 forbids.
2. **A hard constraint fires inside the `auth.users` INSERT.** `handle_new_user()` runs from
   `on_auth_user_created`. A violation there is not "please enter your name" — it is a **failed
   account creation**, surfaced through GoTrue, on a path where the product can render nothing
   useful, for every caller that sends no metadata: a future OAuth provider returning only an email,
   an admin-created user, and today's own sign-up form.

**The consequence, so it is not discovered in the UI.** Absence is permanent and every rendering site
must handle it forever. That is *not* new — both fallbacks already exist and are deliberate
(`memberLabel` → `A collaborator`; `accountIdentity` → the email). **What is new is that
required-ness belongs to the `src/` lane:** the sign-up form must validate the two fields and refuse
to submit without them. The database will not catch that omission, and if it is skipped, names will
be as absent tomorrow as they are today.

## R3 — Who may write: the posture `display_name` already has, tightened

```sql
revoke all on public.profile_names from anon, authenticated, service_role;
grant select (profile_id, first_name, last_name, created_at, updated_at) ... to authenticated;
grant insert (profile_id, first_name, last_name)                          ... to authenticated;
grant update (first_name, last_name)                                      ... to authenticated;
```

- **Column lists, never table-level** — following `place_mentions` (`0031:394`) and `places`
  (`0012`) rather than `profiles`' own table-level grant, because a column-list grant means *a
  column added later arrives ungranted and the next author has to decide*. That is precisely the
  discipline whose absence made this ruling necessary.
- `profile_id` insertable, not updatable: a row cannot be re-parented onto another user.
- `created_at`/`updated_at` readable, not writable: a client that could write them could backdate.
- **No `service_role` grant** (`0031`'s posture): nothing on the trusted server path has any business
  reading a person's name, so a leaked service key gets nothing here.
- **No DELETE grant and no DELETE policy.** Clearing a name is `set first_name = null`; the row dies
  with the profile by cascade. The pair is deliberate — `0031`'s header explains that a policy
  without a grant is the dangerous half: inert, reads as a control, becomes permission the moment
  somebody adds the grant.

Three policies, all `= (select auth.uid())`. **There is no peer policy and there must never be one**;
a fourth policy here, or any qual that is not `auth.uid()`, means somebody's legal name has been
opened up. `inventory.sql` check 2 asserts the set in both directions.

## R4 — Does sign-up reach this table? The mechanism exists and is not fed

**Finding.** The trigger exists; the client never sends it anything.

Measured: `on_auth_user_created AFTER INSERT ON auth.users` exists, is enabled (`tgenabled = 'O'`),
and calls `public.handle_new_user()` — `SECURITY DEFINER`, owned by `postgres`, no `EXECUTE` grant to
any role. `0002`'s fallback note about the trigger possibly being rejected does not apply here.

What does not happen is a name arriving. `src/app/sign-in/sign-in-client.tsx:156-180` calls

```ts
supabase.auth.signUp({ email, password, options: { emailRedirectTo: confirmationRedirect() } })
```

with **no `data`**, so `raw_user_meta_data` is `{}` on every account this product has ever created.

`0035` reads three tiers, most specific first: `first_name`/`last_name` (our own form);
`given_name`/`family_name` (the OIDC claims a future social provider sends); then a single
`display_name`/`full_name` split on the first space. Tier 3 is a guess and is treated as one
(guardrail 25): last resort, never overrides an explicit `first_name`, never invents a family name
that was not in the string.

**`handle_new_user`'s `profiles` insert is byte-identical to `0002`'s**, including which metadata
keys can reach `display_name`. `0035` adds no new route into the peer-visible column. (`P0c` asserts
that behaviour so a future change to it is visible rather than silent. Whether a social provider's
`full_name` belongs on a peer-visible label without a confirmation is a **pre-existing** question —
flagged below, not opened by this file.)

**The client change is still required and is not this lane's.** Without
`options: { data: { first_name, last_name } }`, this migration stores nothing new — correctly and
silently.

## Finding 1, closed: the "demo" email on the profile screen

The owner reported weeks ago that the profile screen showed a **"demo" email address**. The
orchestrator's hypothesis — that this is a null name falling back to the email rather than a
hardcoded fixture — is **confirmed by the code**. `accountIdentity`
(`src/app/profile/_lib/profile-stats.ts:250-266`):

```ts
if (displayName !== '') return { title: displayName, subtitle: email === '' ? null : email };
if (email !== '') return { title: email, subtitle: null };
```

When `display_name` is empty **the email is the heading**. Its own doc comment says so in as many
words: *"When it is absent the email is shown **as** the identity rather than being split,
initial-capped or otherwise dressed up into a name the user never gave us."* Since `signUp` has never
sent `options.data`, `display_name` has been null for every account, so the profile screen has shown
the raw email address as the person's name for the life of the product. There is no fixture and no
hardcoded string: **it is this fallback, working exactly as designed, on data that was never
populated.** One root cause, two symptoms.

Two riders worth recording:

- The same comment claims *"the local database has one of three"* accounts with a display name.
  **Measured 2026-08-31: 0 of 8.** The comment is stale in the direction that made the bug look
  smaller than it is.
- **`0035` alone does not fix it.** `accountIdentity` reads `display_name`, and this ruling
  deliberately does not write `display_name` from `first_name`. The profile screen is *your own*
  screen, so the private name is exactly the right source for it — but that is a one-line `src/`
  change (`accountIdentity` taking `firstName` ahead of `displayName`) and it belongs to the
  `src/` lane, not here. Fixing the storage without that change leaves the email heading in place.

## Who can see a user's name, after this file

| | visible to | proof |
|---|---|---|
| `first_name`, `last_name` | **the owner, and nobody else.** No peer policy, no `anon` grant, no `service_role` grant, no `SECURITY DEFINER` function in `public` reads the table. | `P2a` (owner reads own), `P3a` (peer by id → 0 rows), `P3b` (peer asks for the **whole table** → exactly one row, their own), `P3c`/`P3d` (cross-user write refused), `P3f` (`anon` → 42501) |
| `display_name` | **unchanged from today**: the user; any collection peer; **anyone holding an invite link**, via `preview_collection_invite`, which is `SECURITY DEFINER` and so not bounded by that policy; and any former member listed by `collection_removed_members`. | — |

**The delta `0035` introduces to what one user can see of another is zero.** That is the change from
the first draft: nothing this migration does can make any existing surface render a name it does not
render today.

### What a collection peer sees instead

Withholding the name is only half an answer — the sharing surface still has to identify a person.
The answer already ships and is deliberate. `memberLabel`
(`src/domain/collections/collection.ts:129-136`) returns `'You'` for yourself, the display name when
there is one, and **`'A collaborator'`** when there is not. Not the email local part, which
`emailLocalPart`'s doc comment refuses by name. `FORMER_MEMBER_LABEL` (`'A former collaborator'`)
covers the deleted-account case.

That fallback is not a new hole this ruling opens: it is what every peer sees **today**, because
`display_name` is null for all eight accounts. `P3e` asserts the input that surface actually
receives, rather than asserting it in prose:

```
PASS P3e the peer gets a null label (-> "A collaborator") and cannot reach the email either
```

— and the second half of that assertion is deliberate too: `auth.users` is unreadable by any browser
role, so the email cannot become a rival fallback that nobody chose.

### Still for `security-privacy` and the owner

1. **`preview_collection_invite` renders the inviter's `display_name` to an unauthenticated bearer of
   an invite token**, before they join and before they are a peer. Pre-existing, and `0035` does not
   change it — but the `src/` follow-up that prefills `NamePrompt` from `first_name` will make real
   given names common in that column for the first time, which changes what that surface leaks in
   practice. Flagged, not decided.
2. **`last_name` is collected and read by nothing.** No surface renders it and no function returns
   it. Data minimisation says do not collect what you do not use; the owner asked for it; the ruling
   builds it and records the tension.
3. **`security.md` §1's invariant list has no entry for identifying data.** If this lands it wants
   one, and that file is `security-privacy`'s, not this lane's.

## What was executed

Against the **applied** schema on the local container (see "Local drift"), not a rolled-back
simulation:

- `supabase/tests/0035_profile_names_policy_tests.sql` — **21 assertions, all PASS**, including `P7`,
  the failure-first control that reproduces the disclosure the design avoids.
- `supabase/tests/inventory.sql` — **all 16 checks PASS** (check 0 reports a NOTE by design, not a
  verdict). Extended for `0035`: check 1 (17 tables),
  check 2 (39 policies), check 5 (ten new column-grant rows, and `profile_names` added to the
  named-relation filter so its SELECT and INSERT lists are asserted, not just UPDATE), check 7
  (two new triggers, and a comment recording that the **absence** of a third is the design).
- `scripts/check-migration-grants.sh` — passes: *"17 relations in public, all revoked from both
  browser roles; every table also RLS enabled+forced"*.

Not run, and named rather than implied: `npm run verify` (an exclusive resource, not leased to this
lane), `npm run db:test` (`package.json` is outside this lane's write scope, so `db:test:0035` is not
chained in — the orchestrator adds it), and anything against staging or production.

## Local drift — read before trusting `db:status`

Between this lane's last clean measurement and the revision above, **`0035` was applied to the shared
local container by someone other than this lane**, and it was applied *outside* the migration runner:
`supabase_migrations.schema_migrations` still tops out at **`0031`** while `public.profile_names`,
its policies, its grants and both functions are live. Verified as the **post-revision** version —
there is no `apply_profile_display_name` function and `profiles` carries only `profiles_touch` — so
what is applied matches the current file rather than the withdrawn draft.

`public.profiles` also went from **8 rows to 12** over the same window, and `public.profile_names`
now holds **4 rows** — none of them this lane's fixtures, which are created and rolled back inside
one transaction and leave nothing behind (verified: 0 `names-%@example.test` users remain). Somebody
has exercised the real sign-up path against the applied schema. That is encouraging but it is not
this lane's measurement and is not offered as evidence of anything. (`P1b`'s notice reads
"15 profiles" because it counts inside the transaction, with three fixtures added.)

Neither is a defect and this lane changed nothing to cause either, but both matter downstream:
a schema that is present without being recorded will not be re-applied by `supabase migration up`,
and will disagree with `db:status` and with a `db:reset`. This lane does not run `db:reset` or issue
DDL outside a rolled-back transaction (guardrails 6, 8 and 30), so reconciling it is the
orchestrator's call.
