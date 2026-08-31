# Security ruling — a first and last name at sign-up

> Task `r2-names-veto`. Reviewer: the Security / Privacy lane. Written 2026-08-31, executed
> 2026-09-01 against the local container only. Nothing was run against staging or production.
>
> **Verdict: PERMIT UNDER CONDITIONS.** No veto. The conditions in §7 are acceptance criteria, not
> advice, and three of them are `src/` or docs work owned by other lanes.

## 0. What was reviewed, by hash

Guardrail 20 requires a named artefact, not a path in a moving tree. The artefact this ruling
governs is:

| file | sha256 | mtime |
|---|---|---|
| `supabase/migrations/0035_names_at_sign_up.sql` | `568715167bdcda56e1d8165e80b1da98a0849c1869e23eec7f87afa804d3074c` | 2026-09-01 00:07:24 |
| `supabase/tests/0035_profile_names_policy_tests.sql` | `2153e6a22135bf4ae333fbf0894eb63860f6da71159351d45f24271af9ec46aa` | 2026-09-01 00:09:38 |
| `docs/db-ruling-profile-names-2026-08-31.md` | `202782d5650afa3d98c27abf3178155edc476a1793bf8a4987bebe5cf6143d3f` | 2026-09-01 00:13:06 |

All three re-verified at 00:19:52 and unchanged since the mtimes above — the migration stable for
twelve minutes, the set reconciled to v2. These are the hashes the orchestrator must re-check before
staging.

Base commit: `bf5110ee8c8df56da5a143107a8e9027ce3eb8d6`. Local database at migration `0031`
(`0032`–`0034` are on disk and unapplied; `0035` does not depend on them — verified by applying it
against `0031` cleanly).

**The orchestrator's brief said the author had stopped. It was wrong, and the hash re-check caught
it.** The migration was rewritten mid-review:

- v1 — sha `f1a5308e55f161d81444…` (the version in the frozen scratchpad copy) — derived
  `profiles.display_name` from `first_name` with an AFTER trigger.
- v2 — sha `568715167bdcda56e1d8…`, above — removes that trigger entirely and issues no DDL against
  `profiles` at all.

Measured, both against the local container: v1 + the then-current test file passed 20/20. v2 against
that **same** test file failed on its first assertion (`FAIL P0a: display_name is <NULL>, expected
the derived given name Maya`). The author has since brought the test file to v2. **This ruling
covers v2 and only v2.** If the file at commit time is not `568715167b…`, this ruling does not apply
to it and the orchestrator must re-check the hash before staging.

## 1. Is the leak property real and general? — YES, and it is bigger than this feature

**What an attacker does.** Share a collection with the victim (or accept a share). Call PostgREST
with their own anon key and their own JWT: `GET /rest/v1/profiles?id=eq.<victim>&select=*`.

**What they get.** Every column of the victim's `profiles` row — including any column a future
migration adds, with no decision taken by anybody. Executed as a real `authenticated` collection
peer through Kong on `127.0.0.1:54321`:

```
[{"id":"…","display_name":null,"created_at":"2026-08-31T22:09:39…","updated_at":"…"}]
```

The author proved this with `P7`, which adds a probe column inside the test transaction and has the
peer read it back. I confirmed `P7` reproduces (it does, on both v1 and v2). I also proved the
property **as a privilege fact** rather than as one probe, which is the form that generalises:

```
authenticated has SELECT on brand-new profiles.probe_col_a:      true
authenticated has SELECT on brand-new profiles.probe_col_b:      true      (jsonb, same answer)
authenticated has SELECT on brand-new profile_names.probe_col_c: false     (control)
```

`grant select on public.profiles to authenticated` is table-level, so `has_column_privilege` is true
for a column that did not exist when the grant was written. The satellite's column-list grant is the
structural difference, and the control line is what proves it is doing work.

**The finding the brief did not ask for, and the more important one.** This is not a `profiles`
quirk. Four tables in `public` carry a table-level `SELECT` grant to `authenticated` **and** a SELECT
policy whose `USING` clause can return another user's row. Read back from the running database:

| table | policy | `USING` |
|---|---|---|
| `profiles` | `profiles_select_collection_peers` | `shares_a_collection_with(id)` |
| `collection_members` | `collection_members_select_member` | `removed_at is null and collection_role(collection_id) is not null` |
| `collection_items` | `collection_items_select_member` | `collection_role(collection_id) is not null` |
| `collection_invites` | `collection_invites_select_owner` | `collection_role(collection_id) = 'owner'` |

**On every one of those four, a column added by any future migration is readable by another user the
moment it exists.** That is a standing property of this schema, it outlives `0035`, and it is
currently written down only in the header of a migration about names — which is exactly the place
nobody will look when adding a column to `collection_items` in three weeks.

**Where it must be written down: `docs/security.md` §3.4.** §3.4 already states the durable rule —
*"grants are column-scoped, so a column added by a later migration arrives ungranted"* — and already
names `extractions` as its counter-example. That counter-example is the **weaker** one:
`extractions` is table-level-granted but same-user, so its exposure stops at the importer. The four
tables above are table-level-granted **and cross-user**. §3.4 is incomplete in the direction that
matters, and closing it is condition C1.

## 2. Does the satellite table actually close it? — YES, executed through PostgREST

Not read, and not only as `service_role`. I checked the environment myself: Kong, GoTrue and
PostgREST were all up, and `enable_confirmations = false` in `supabase/config.toml`, so a real
sign-up returns a real session. Two accounts were created **through `/auth/v1/signup` with the anon
key**, wired as collection peers (`shares_a_collection_with` returns `t`), and every request below
carries a genuine GoTrue access token.

| # | attack | result |
|---|---|---|
| A1 | attacker reads their **own** names (control — must succeed) | `200` `[{"first_name":"Mallory","last_name":"Kane"}]` |
| A2 | peer reads victim's `profiles` row (control — peer policy is live) | `200`, `display_name: null` |
| B1 | `GET /profile_names?profile_id=eq.<victim>&select=*` | `200` `[]` |
| B2 | `GET /profile_names?select=*` (whole table) | `200`, **exactly one row — the attacker's own** |
| B3 | `GET /profiles?id=eq.<victim>&select=id,display_name,profile_names(first_name,last_name)` | `200`, `"profile_names": null` |
| B4 | reverse embed `profile_names?select=*,profiles(id)` | `200`, own row only |
| B5 | embed through `collection_members` | `PGRST201` (ambiguous FK); re-aimed, still own row only |
| B6/B7 | cardinality and `order=first_name.asc` side channels | own row only |
| C1 | peer `PATCH`es victim's `first_name` | `200 []` — zero rows matched, victim's row unchanged |
| C2 | peer `POST`s a row for the victim | `403` `42501` RLS violation |
| C3 | peer re-parents their own row onto the victim | `403` `42501` permission denied |
| C4 | peer `DELETE`s the victim's row | `403` `42501` permission denied |
| D1 | `anon`, no JWT | `401` `42501` |
| D2 | **`service_role` key** | `403` `42501` — a leaked service key gets nothing here |
| E1 | victim reads their own names (control — must succeed) | `200` `[{"first_name":"Dana","last_name":"Levi"}]` |

D2 is worth naming on its own. `docs/security.md` §1 says out loud that the product does not defend
against someone holding the service-role key. `profile_names` is the first table where that stops
being true, because `0035` revokes from `service_role` and never grants back. That is a genuine
improvement on the posture, not a restatement of it.

I also re-ran the author's own test file against the applied migration: **21/21 PASS**, including
`P7`. And I confirmed that **no `SECURITY DEFINER` function in `public` reads `profile_names`** —
`handle_new_user` is the only function in the schema that names it at all, and it only writes.

**Ruled: the satellite closes the leak.** No cross-user read of `first_name` or `last_name` was
reachable by any path I could construct.

## 3. What does the derived `display_name` now disclose? — v2 removed the derivation. Resolved.

This was the crux of the brief and it is the reason the ruling is a permit rather than a
permit-with-a-fix. **On v1 I would have made the trigger a blocking condition.** A first name typed
into a sign-up form to let the product address you is not consent to show that name to
collaborators, and a trigger that copies one into the other converts a private field into a
peer-visible one silently — the user is never asked. The brief called this "the mechanism protects
the surname and may quietly publish the forename", and that was exactly right.

v2 does not do it. Measured end to end, not read: a real GoTrue sign-up carrying
`{"first_name":"Dana","last_name":"Levi"}` produced

```
first_name = Dana | last_name = Levi | display_name = <null>
```

and the collection peer's read of that `profiles` row returned `display_name: null`. `handle_new_user`'s
`profiles` insert in v2 is byte-identical to `0002`'s — I diffed it against
`pg_get_functiondef` taken from the running database before applying anything, and the expression
`left(nullif(btrim(coalesce(… ->> 'display_name', … ->> 'full_name', '')), ''), 80)` matches
character for character. **`0035` v2 adds no new route into the column another user can read.**

(v1 did widen it, incidentally: v1's label expression read a third key, `name`, that `0002` does not.
v2 dropped that too.)

**Re-confirmed against the applied schema** after another lane applied `0035` locally, because a
verdict taken on a rolled-back transaction is not a verdict on what is running. One real GoTrue
sign-up carrying `{"first_name":"Dana","last_name":"Levi"}`:

```
first_name = Dana | last_name = Levi | display_name = <null>   label_is_null = t
triggers on public.profiles: profiles_touch        (that is the whole list)
```

Probe account removed afterwards. **Item 3 is closed: the forename is published nowhere.** A peer
sees what they see today — `memberLabel`'s `'A collaborator'` — and that is the status quo for all
eight pre-`0035` accounts, not a state this migration creates.

**One correction to a claim made in review, because it points at the two lines that actually needed
reading.** It was reported that `0035` mentions `profiles` exactly once and that the mention is a
comment. It mentions it twenty-four times, sixteen of them in comments and eight outside, and two of
those eight are live SQL against the table:

- `line 167` — `profile_id uuid primary key references public.profiles (id) on delete cascade`. The
  foreign key. This is the satellite's whole retention bound and it is correct.
- `line 297` — `insert into public.profiles (id, display_name)` inside `handle_new_user`. **This is
  the one line in the file that can write the peer-visible column**, and it is the line the review
  turns on. It is byte-identical to `0002`'s, verified against `pg_get_functiondef` read from the
  running database before anything was applied.

The conclusion drawn from the miscount — no DDL, no trigger, no grant or policy change against
`profiles` — is correct, and I confirmed it independently. The reasoning is not: a file that writes
`profiles` is not a file that leaves `profiles` alone, and "one mention, in a comment" would have
meant nobody looked at line 297.

The author's reasoning here is better than the brief's framing and better than my prior, and it
should be said plainly: they found the answer already written in this repo, in the doc comment on
`emailLocalPart` (`src/domain/collections/collection.ts:159-168`) — *"prefill, never fallback… the
suggestion is shown to the person it is about, in a field they have to confirm, which makes it
consent"*. Applying that existing, shipped decision to names instead of inventing a new rule is the
right move, and `memberLabel`'s `'A collaborator'` fallback means withholding the private name costs
the sharing surface nothing it is not already handling.

**Condition C2 follows from this**: the absence of the derivation is now a security control, so it
needs a regression guard. It has one — `P0a` asserts the label stays null after a named sign-up and
`P4b` asserts `public.profiles` carries exactly one trigger. Those two assertions must not be
weakened, and the test file must be chained into `npm run db:test`, or the control is a comment.

## 4. Hostile `raw_user_meta_data` into a `SECURITY DEFINER` trigger

Fifteen hostile sign-ups pushed through real GoTrue, then the stored bytes read back with
`encode(convert_to(…),'escape')`.

**SQL injection is structurally impossible, not merely absent.** `handle_new_user` contains no
`EXECUTE` and no `format()`; every value reaches the database as a plpgsql variable in a
parameterised `INSERT`. `{"first_name":"Robert'); drop table public.profile_names; --"}` stored as
45 literal characters and the table survived.

| case | outcome |
|---|---|
| 500-char first/last name | `200`, clamped to 80 by `left(…, 80)` |
| 128 KB first name | `200`, clamped to 80 |
| BEL + LF + TAB | `200`, stored verbatim (14 chars) |
| U+202E right-to-left override | `200`, stored verbatim |
| `<script>alert(1)</script>` | `200`, stored verbatim |
| type confusion — object / array / number | `200`, `->>` renders them as text (`{"a": 1}`, `12345`) |
| emoji ZWJ sequences | `200`, clamped at 80 chars — may split a grapheme cluster; still valid UTF-8 |
| `{"first_name":"Real","display_name":"PeerVisible"}` | `200`, private name `Real`, peer label `PeerVisible` — correct: the label came from the label key |
| **raw NUL byte in metadata** | **`500` "Database error saving new user" — account creation fails** |

**The NUL byte is pre-existing and is not `0035`'s.** I isolated it: a sign-up whose metadata carries
a NUL under a key `0035` never reads (`unrelated_key`) fails identically on the `0002` path. It is
`jsonb` refusing a U+0000 inside the `auth.users` INSERT, before any trigger runs. It would be unfair
to charge this migration with it and wrong to let it be discovered later as a names bug, so it is
recorded here. It is **acceptable at university scale, documented** — a client cannot reach it
through the product's own form.

**Residual, and it is low.** `btrim()` in Postgres strips only `U+0020`, so the `CHECK` accepts a
name made entirely of non-breaking spaces or tabs: `{"first_name": "<90 x U+00A0>X"}` stored 80
non-breaking spaces as a first name. The product's own form closes this — `tidy()` in
`src/app/sign-in/name-fields.ts` uses JS `trim()` and `/\s+/`, both of which *do* treat U+00A0 and
TAB as whitespace, so the field is refused with *"Enter your first name."* The gap is reachable only
by a caller who bypasses the form, and what it stores is private to that caller. Not a blocker; not
worth a `CHECK` change.

**Nothing renders any of this unescaped.** The six `dangerouslySetInnerHTML` sites in `src/` are all
static: a theme-init script, two inline `<style>` blocks and three inline SVGs. No user string
reaches any of them, and no non-React sink (`opengraph-image.tsx`, `apple-icon.tsx`) reads a name.

One thing outside `0035`'s reach, stated so it is not a surprise: **the untruncated hostile value
survives in `auth.users.raw_user_meta_data`.** The 128 KB name is 80 characters in `profile_names`
and 128 KB in `auth.users`. It cascades away with the account, so the retention story holds, but
"we clamp names to 80" is true of `public` and not of `auth`.

## 5. Does `docs/security.md` become false? — one sentence yes, three incomplete

Under **v2**, no load-bearing claim in `security.md` becomes false. Under v1 the substance of §3.1's
line would have rotted while its letter stayed true, which is the worse failure. Specifically:

- **§1, and this one does go false.** *"Everything else in the system is either public (a TikTok
  post, an open-data POI record) or operational (a cache, an audit row)."* `profile_names` is
  neither. It is the first table in this schema holding a fact about a person that is not derived
  from their own map activity. The asset sentence above it — *"future location data about a named
  person"* — survives and arguably gets sharper, but the sentence that partitions everything else
  does not.
- **§1's adversary table is incomplete.** It has no row for identity data. After this lands, the
  honest row is: a signed-in peer gets a *chosen label or nothing*, and the real name is reachable
  by no adversary in the table including the service-role holder.
- **§3.1 line 121 stays true**, and that is the point: *"Two extra read arms and nothing else: the
  shared place identity, and a peer's display name."* `0035` adds no third arm. `P3a`/`P3b` are the
  proof.
- **§3.4 is incomplete** in the way §1 of this ruling describes. This is the important one.
- **§3.7's disclosure list is incomplete.** It enumerates by name what does *not* travel with a
  share (`note`, `visit_state`, `tags`, …). `first_name`/`last_name` now belong on that list; a list
  that is not extended when the schema grows is how it stops being read as exhaustive.
- **§3.5's `SECURITY DEFINER` inventory** must record that `handle_new_user` now also writes
  `profile_names`. It remains the only definer that touches the table, and it only writes.
- **§5.1 ("the tests, named")** must name `0035_profile_names_policy_tests.sql`.

## 6. What I ran, and what I left behind

Everything was local. To test through PostgREST as a real `authenticated` user I had to apply the
migration for real, so I applied it, attacked it, and then **restored the database to its exact
pre-probe state**:

- 18 probe accounts deleted (`sec-victim-*`, `sec-attacker-*`, `hostile-*`, `nulctl-*`) and the
  fixture collection removed.
- `profile_names`, `normalise_profile_names()` dropped; `handle_new_user()` restored from the
  `pg_get_functiondef` snapshot taken before I started.
- PostgREST schema cache reloaded.
- Verified after: `profile_names: ABSENT`, `profiles: 8` (the pre-probe count),
  `handle_new_user mentions profile_names: false`.

**So `0035` is not applied locally, and the orchestrator still owns applying it.** Nothing in the
working tree was written by me except this file.

Evidence scripts, kept out of the repo, under this session's scratchpad `sec0035/`: `attack.sh` (the
PostgREST attack), `hostile.py` (the fifteen hostile sign-ups), `rollback.sql`,
`handle_new_user.before.sql`, and the frozen v1/v2 migration copies.

## 7. Conditions — testable, and each one owned

**C1 — `docs/security.md` §3.4 gains the cross-user table-level-grant property** (§1 of this ruling):
the four tables named, and the rule that a column added to any of them is readable by another user
on arrival. Owner: this lane, on the orchestrator's word. *Test: §3.4 names `profiles`,
`collection_members`, `collection_items` and `collection_invites`.* **Blocking — this is the finding
that outlives the feature, and burying it in a migration header is how it gets re-learned.**

**C2 — the no-derivation control gets a regression guard that runs.** `P0a` and `P4b` already assert
it; `db:test:0035` must be chained into `npm run db:test` in the same commit as the migration.
Owner: the orchestrator (`package.json` is outside both lanes' scope). *Test: `npm run db:test`
exercises the file and fails if a trigger is added to `public.profiles`.* **Blocking.**

**C3 — `security.md` §1, §3.5, §3.7 and §5.1 updated** as §5 above sets out, in or immediately after
the commit that lands the migration. Owner: this lane. *Test: §3.7's withheld-column list contains
`first_name`/`last_name`; §1 no longer claims everything but saved places is public or operational.*
**Blocking on the same commit; the project's own standing rule is that a change which silently
falsifies an existing claim is worse than a refusal.**

**C4 — the sign-up form must enforce required-ness and must not send a name it has not tidied.**
Already satisfied by `src/app/sign-in/name-fields.ts` as it stands (`tidy()` + *"Enter your first
name."*), which I read but do not own. *Test: a sign-up submitting only whitespace is refused
client-side and creates no `profile_names` row.* **Non-blocking — verify, do not rebuild.**

**C4a — if the public label's prompt is ever prefilled from `first_name`, the prefill stays a
confirm-before-save.** Measured, because the consent story rests on it: `display_name`'s only writer
in `src/` is `updateDisplayName` (`app/actions/collections.ts:526`), and its only caller is
`NamePrompt` (`components/collections/name-prompt.tsx:54`), which is mounted at exactly **one** site
— `app/collections/join/[token]/join-client.tsx:141`, the invite-join screen. So today a user who
never joins by invite has no way to set a label at all, and peers see `'A collaborator'`. That is
why `display_name` is null on all eight accounts: not because nothing reads it (six render sites do)
but because almost nothing can write it.

The security consequence is benign in the current shape — the failure mode is *less* disclosure, not
more — and it is not a condition on this commit. It becomes one the moment the prompt is mounted on
a second surface: the follow-up the author recommends is prefilling it from `first_name`, and a
prefill that saves without a confirmation is v1's trigger wearing a different hat. *Test: any new
mount of `NamePrompt` still requires an explicit submit before `updateDisplayName` is called.*

**C5 — no future migration may add a policy to `profile_names` whose qual is anything other than
`profile_id = (select auth.uid())`, and none may add a peer-visible derivation of a name.** The
migration says this in a comment; it needs to be a gate. *Test: `inventory.sql` asserts exactly three
policies on `profile_names` and that each qual is own-row.* **Non-blocking for this commit, blocking
for the next one that touches the table.** Any such change comes back to this lane.

**Not conditions, recorded as accepted:** `last_name` is collected and read by nothing — that is data
minimisation tension, the owner asked for it, and it is a decision rather than an oversight now that
it is written in three places. The NUL-byte `500` is pre-existing. The whitespace-lookalike names are
low and client-closed.

## 8. Verdict

**PERMIT, subject to C1–C3 landing with or immediately after the migration.**

The design is right, and it is right for a reason that generalises past this feature: the disclosure
rule *"the owner reads this, a peer does not"* is not expressible on one table in Postgres, and the
author reached for a second relation rather than for application care. The `service_role` revoke is
a real tightening. The failure-first `P7` control is the thing that makes the rest of the test file
worth reading, and it caught nothing because there was nothing to catch — which is what a control
looks like when it works.

Two process notes, both for the orchestrator rather than the author. The artefact moved under review
and the hash check is the only reason that is a paragraph in this document instead of a defect in
`main`. And the author's v2 reached the right answer on the disclosure question before I ruled on it;
the brief framed that as the crux and it was, but the correction had already been made.
