# Security ruling — E1, "the mention we could not place": caption retention, display, RLS, deletion

**Author:** `security-privacy` · **Lane:** `i3retention` · **Date:** 2026-08-31
**Base commit:** `9a95444ee5b4b61fd4e65fee25b3e25be21f46af` on `no-crumbs-implementation`.
Re-checked at `8f5f12afd92d6aef09a4144abc6b098e64257fa7`, which landed while this was being written: the
only file it changes is `docs/entity-proposal.md` (committing it), and E1's **Shape** list and §7's gate
are byte-identical to what was ruled on — the addition is a scheduling paragraph (L1-completeness vs L2-scope)
that touches no design decision here. Every migration, policy and `src/` line cited is unchanged between
the two commits.
**Status:** a ruling. Binding on the agent that writes `0031` and on the agents that build E1's screens.
**Evidence:** `docs/evidence/security/caption-retention-2026-08-31.md` (read §0 for what could not be run).
**Answers:** `docs/04-tiktok-feasibility.md` §8 Q4 (in part) · `docs/security.md` owed item 6 (in part)
· `docs/entity-proposal.md` §7's gate on E1.

Untracked when written; six lanes hold `src/`. This document writes no SQL and no `src/`.

---

## 0. Verdict

**E1 is APPROVED, narrowed on one point, with six binding conditions. No veto is exercised.**

The narrowing: **E1 may store the model's extraction, not the caption.** The proposal's phrase *"the
text the post used, verbatim and immutable"* is ambiguous across three different values in
`src/domain/types.ts`, and the difference between them is the difference between an approval and a
veto. §3 draws the line.

The finding that reshapes the question, before any of the five answers: **the 24-hour bound this
ruling was asked to extend does not exist.** `imports.expires_at` is a column default that nothing
reads — no `pg_cron`, no Edge Function (there is no `supabase/functions/`), no scheduled workflow, no
`delete from imports` anywhere, and deliberately no client DELETE grant. Meanwhile caption-derived
text is *already* retained without any bound in four places, is already readable by a browser from
two of them, and already outlives account deletion in two of them. Evidence §1 and §2.

So E1 is not a retention change. It is a **relocation**, and the location it proposes — a user-owned
row that cascades from `profiles` — is the best of the five homes this text has, because it is the
only class that dies with the account.

---

## 1. May caption-derived text be retained beyond 24 hours?

**YES. Retained for the life of the account, with no TTL. That is the bound, and it is enforceable
because it is a foreign-key cascade rather than a job.**

I am ruling **against** a TTL on E1, explicitly:

- A timer that destroys the row is precisely the failure the entity exists to remove. Building E1
  with an expiry rebuilds `imports.candidates` under a new name.
- A TTL nobody writes a sweeper for is not a control, it is a comment. This project has one of those
  already and it has been quoted as fact in four documents (`entity-proposal.md` §E1,
  `current-state.md`, the dispatch, `0003`'s own header). The second one would be worse than the
  first, because the first at least has an index waiting for it.

**What makes "the life of the account" enforceable rather than aspirational.** FK referential actions
are executed by the system and are not subject to RLS, `FORCE ROW LEVEL SECURITY` or column grants —
the same mechanism `docs/overnight-deletion-review.md` §1.1 rests on. Condition **D1** (§5) is the
whole of it: one `on delete cascade` edge to `profiles`. There is no job to schedule, nothing to
monitor, and no way for it to silently stop working.

**Severity classification of the alternative, so the trade is on the record.** Retaining an extracted
place name and a URL on a private row for the life of an account is *acceptable at university scale
and documented*, not a must-fix. The comparable contractual bound the project does honour — Google
SST §5.4's 30-day cap on Places content, implemented at 28 days in
`src/integrations/places/lookup-cache.ts:93` — exists because a contract says so. **No equivalent
clause is known for the TikTok oEmbed endpoint** (§6, labelled UNAVAILABLE). I will not invent a
30-day rule by analogy and then have it enforced by nothing.

---

## 2. May it be displayed to the user who imported it?

**YES, to that user and to nobody else. R8 is re-decided, not re-quoted — and its premise was already
false before E1 was proposed.**

R8's stated ground, in `0003`:

```sql
comment on column public.sources.content_text is
  'Post caption. Never granted to `authenticated` (R8): no product surface displays it (ux §12, spec V5).';
```

Measured at the base commit, **two product surfaces display the full caption**:
`src/app/import/screens/review/review-screen.tsx:281/296/319/387` (a disclosure, collapsed, capped at
`max-h-38`) and `src/app/import/screens/no-places-screen.tsx:326/334/355/364` (**expanded by
default** — that file's header argues the inversion deliberately). Each candidate card additionally
renders "its own verbatim fragment". Evidence §3.

**The re-decision, in two parts, because they have different answers:**

**(a) The grant stays. R8 is re-affirmed as a privilege.** The comment is wrong about *why*, not about
*what*. The caption does not reach the browser through PostgREST; it reaches it through
`src/app/api/imports/probe/route.ts`, which holds a `serviceRoleClient()` (line 523) and puts
`caption` in its response body (line 747). The column grant is what stops a raw `select` on `sources`
returning `content_text`, and it is defence in depth against a future policy arm widening `sources`
read access the way `0024` widened `places`. Removing it because "the caption is on screen anyway"
would be the wrong lesson from a stale comment.

**(b) The display ruling is new and it is broader than R8's premise assumed.** Caption-derived text
may be shown **to the user who imported that post**. The justification is not "captions are public" —
it is that the **incremental exposure is nil**: that user pasted the link, was shown the entire
caption on the review or no-places screen in the same session, and can open the post. E1 shows them a
short extraction from something they were already handed in full.

The justification does not survive one step further, and that is the boundary: it does **not** license
showing caption-derived text to a collection peer, an invite-token holder, or any aggregate across
users. §4 makes that a policy constraint, and **that** part is inside my veto.

**Consequence — F1, and it must be fixed.** `0003`'s comment is false, and a false comment in a
security migration is how the next review reaches the wrong conclusion. Minimum fix: re-issue
`comment on column public.sources.content_text` in a follow-up migration with the true reason (the
caption is server-mediated only; no client role may `select` it), and correct the matching bullet in
`docs/security.md` §4. Owner: `supabase-database` for the comment, me for `security.md`. Severity:
**documentation integrity, not exposure — not a launch blocker.** This is the sixth stale-premise
case caught today and it is the one that was closest to being re-quoted into a new migration.

---

## 3. What may be stored — the caption, or the extraction? **The extraction.**

This is the narrowing, and it is the only place I am reducing E1's scope.

Against `src/domain/types.ts`'s `PlaceCandidate`, the proposal's *"the text the post used, verbatim"*
could mean any of four things. They are not equivalent:

| Value | What it is | Ruling |
|---|---|---|
| `rawName` | *"Exactly as the caption wrote it"* — a venue name | **PERMITTED.** Bounded, it is what the entity is *about*, and it is the same class of value `saved_places.name` already holds for the resolved case |
| `cityHint`, `countryHint`, `areaHint`, `addressHint`, `categoryHint` | extracted, nullable, bounded | **PERMITTED**, and the proposal's own rule — *extracted only, never inferred, null if the caption did not say* — is adopted as **binding**, not as a preference |
| `evidence` | typed in the domain as *"the caption fragment the name came from, **for our own debugging only**"* | **NOT PERMITTED** on an E1 row and not on an E1 surface |
| `sources.content_text` | the full caption | **NOT PERMITTED** on an E1 row |

**Why the line sits there, and it is not squeamishness.**

1. A caption is unbounded, attacker-controlled, third-party text. It carries promo codes, phone
   numbers, third parties' names, slurs and political statements — none of which is *about the place*
   and all of which we would then hold per-user, forever, and render. This is `0019`'s §1 argument
   verbatim, and `0019` resolved it by scoping the text to one user. E1 inherits that scoping, but
   `0019`'s text was **model prose about a venue**; a raw caption is a different object.
2. `evidence` is declared a debugging field. Putting it on a screen silently promotes it to a product
   string with no length cap, no truncation rule, no language handling and no copy review. If UX later
   wants a quoted fragment, that is a separate request with a character cap attached, and I will hear
   it — but it does not ride in on E1.
3. E1 needs the **name** to do its job (a prefilled manual-add on-ramp), not the paragraph. The
   paragraph is already retained on `sources.content_text` and shown for the session.

**Does the distinction change the answer? Yes, in one direction.** The extraction is materially safer
than the caption, and the extraction is what I am approving. **An E1 that copies the caption verbatim
onto a permanent per-user row is a version I would veto.**

**One correction to E1's own framing, and it is an accuracy constraint rather than a style note.**
The proposal says the row *"shows the post's own words in quotes."* `rawName` is caption-verbatim, so
quotation is honest for that value **and only that value**. Any derived or normalised value must not
be rendered inside quotation marks — that would assert a quotation we did not take. This is the
project's own extracted-vs-inferred rule applied to punctuation, and `voice-and-vocabulary` owns the
resulting strings.

---

## 4. RLS — the policy shape the migration must have

Specification, not SQL. `supabase-database` writes it; I will review the artefact under guardrail 20
(full file text outside the tree, its SHA-256, the base commit, and confirmation the author has
stopped).

**Table shape**
- `id uuid primary key default gen_random_uuid()`.
- `user_id uuid not null references public.profiles (id) on delete cascade` — matching `saved_places`
  (`0006:7`). Not nullable, never `set null`.
- `source_id uuid null references public.sources (id) on delete restrict` — matching
  `imports.source_id` and `saved_place_sources.source_id`. Nullable for the non-TikTok arm.
- The text column(s) per §3, on **this** row — not read through a join to `sources` or `extractions`.
  See D1/D2.

**Privileges**
- `revoke all on public.<mentions> from anon, authenticated;` **first**. Never rely on the hosted
  default privileges — that is `0008`'s entire purpose.
- **Column-scoped grants, never table-level.** `0019:417`'s reason is the one that matters: because
  both grants are column-scoped rather than table-level, **a column added by a later migration arrives
  ungranted by default**. `extractions` is the counter-example (§ F3).
  - `grant select (<every column, named>)`.
  - **`grant update (<the dismissal/state column only>)`.** Never the text column, never `user_id`,
    never `source_id`, never the pointer to `saved_places`. E1 acceptance criterion 5 is correct and
    is hereby binding: an attempted UPDATE of the text from a browser must fail at the database with
    `42501`, not in the UI.
  - `grant delete` — **permitted.** Unlike `imports`, a mention is not an audit record; the user must
    be able to remove one.
  - **`grant insert` — my ruling is: do not grant it.** Create the mention on the server path that
    already creates the import, exactly as `imports` is created only by `start_import()` (`0003` B7:
    no INSERT grant, no INSERT policy). The reason is in the next paragraph and it is the one hard
    rule in this section. If the product genuinely needs a browser-side insert (a "keep for later"
    tap that must not round-trip through the server), it may be granted **on condition** that the
    `with check` predicate requires an owning `imports` row for the named `source_id` — the shape
    `sps_insert_own` (`0006:135-142`) already uses — and that the rule below still holds.

**The hard rule, and it is inside my veto**

> **A mentions table must never become a third arm of `sources_select_via_membership`, and no policy
> on `sources` or `extractions` may name it.**

`sources_select_via_membership` (`0006:162-170`) has exactly two arms today, both self-referential to
the caller, and `sps_insert_own` requires an owning `imports` row before the second arm can be
created. `docs/security.md` §1 invariant 2 states that this predicate *"reads like a redundant
integrity check and is in fact the only thing preventing self-granted access to cached caption
text."* A user-insertable mentions table wired into that policy would hand a user read access to any
cached caption by naming its `source_id`. That is the single highest-value target in this schema.

**Policies** — four, all `to authenticated`, all keyed `user_id = (select auth.uid())` (the `(select
…)` wrapper is this schema's convention and a planner optimisation, `0003:158`), with `with check` on
insert and update and not only `using`. `enable row level security` **and** `force row level
security`.

**No `SECURITY DEFINER` function returning a mention row may be granted to `authenticated`.**
`security.md` §1 invariant 1. If a helper is needed it returns a **boolean about the caller's own
membership**, as `0024`'s four helpers do; and it takes the fewest arguments that answer the question
— `0024`'s one-argument `collection_role()` ruling, *an exposed function's argument list is its
attack surface*.

### Is anything reachable by a non-owner? No — and here is the closure

- **Shared collections: no.** `0024:579-581` states in the DDL that no policy is added to
  `place_provider_refs`, `sources`, `extractions`, `saved_place_sources` or `saved_places`, *"In
  particular the source TikTok of a shared place is NOT disclosed: which post someone saved a place
  from is part of their import history."* **A mention is import history in its purest form** — a
  record that you pasted a post and what we thought was in it. E1 §9.2 already lists "a mention in a
  shared collection" as out of scope; **I am upgrading that from a scope line to a security
  constraint, and it is inside my veto.**
- **Invite tokens: no.** A token yields `collection_members`, which feeds
  `place_is_in_my_collection()` and `shares_a_collection_with()`. Neither names `imports`, `sources`,
  `extractions` or any per-user overlay table. **Condition: `0031` adds no policy referencing any
  `collection_*` table, and adds no arm to any existing collections policy.**
- **Enumeration: no.** uuid PK, `user_id`-scoped policy, no `count` path that crosses users.
- **Aggregates: forbidden.** No cross-user count, no "N people also could not place this", no
  most-mentioned list. That is a discovery signal over third-party text and Charter §1 refuses
  creator discovery outright.

### What is NOT proven, stated plainly

**The live cross-user probe is UNAVAILABLE at this commit.** Docker's daemon is not running on this
machine and no `psql` client is installed, so `db:reset` / `db:test` and a hand-written two-role probe
could not be executed; the local database is also an exclusive resource not leased to this lane
(evidence §0). Everything above is read from the DDL, which for grants, policies and FK actions is
authoritative rather than indicative.

**Condition Q (a gate on shipping, not on writing the SQL): E1 acceptance criterion 7 must be executed
as two real roles against a leased container before `0031` lands** —
`supabase/tests/0024_collections_policy_tests.sql` is the pattern, and a policy test file for the new
table belongs in the same commit. `qa-reliability` owns it. **I do not accept "the policy says so" as
evidence for criterion 7, including from myself.**

---

## 5. Deletion — three conditions, and one of them is the whole answer

`L1-F8-T1` shipped at `642cab0`. `src/app/actions/account.ts` deliberately writes **no cleanup
statements**: everything goes by FK cascade from `auth.users`, because *"an application-level
pre-delete sweep would be a second, drifting definition of 'the user's data' alongside the FK graph,
and the FK graph is the one Postgres actually obeys."* E1 must stay inside that design rather than
force an exception to it.

- **D1 — `user_id uuid not null references public.profiles (id) on delete cascade`.** This is the
  entire deletion story. With it, E1 joins the cascade automatically and `deleteAccount()` needs not
  one line of change — and must not receive one. Not `set null` (which would leave the text
  orphaned-but-present, the exact failure mode named in the dispatch), not `restrict` (which would
  make a mention *block* account deletion, which is worse).
- **D2 — the text lives on the mention row, not behind a join.** If E1 rendered its text by joining to
  `sources.content_text` or `extractions.candidates` at read time, the text would survive the account,
  as it does today. `overnight-deletion-review.md` §4.3 ruled that survival acceptable **on a specific
  ground**: *once the user's `imports` and `saved_place_sources` rows cascade away, nothing links a
  `sources` row to the departed user.* A mentions table carrying a `source_id` and **not** cascading
  from `profiles` would break that ground and re-link the row to a departed person. D1 preserves it:
  the mention dies, and the link dies with it. §4.3's ruling is unchanged by E1.
- **D3 — `supabase/tests/inventory.sql` is updated in the same commit.** Check 1 asserts RLS flags per
  table (*"a table nobody designed is exactly the thing this check exists to notice"*), check 2
  asserts the policy set *exactly, in both directions*, and check 9 asserts the `service_role` matrix
  over an explicit `designed(t)` list. A new table absent from those lists is a table whose
  authorisation surface is asserted by nothing. This is a condition, not a courtesy.

**Nothing else changes about delete-my-data.** The one named exception in `overnight-deletion-review.md`
§4.2 — a note on an item in somebody else's shared collection — is untouched, because a mention never
enters a collection (§4). The copy in that flow needs no revision on account of E1.

---

## 6. Third-party capability labels

| Claim | Label | Evidence |
|---|---|---|
| TikTok oEmbed returns the caption unauthenticated; it is the only usable read mechanism | **VERIFIED** | `docs/04-tiktok-feasibility.md` §2, E5 |
| **TikTok's terms impose a retention or caching limit on caption text obtained via oEmbed** | **UNAVAILABLE** | I did not fetch or read TikTok's Terms of Service in this session and will not assert a contractual position I have not read. What is on the record: the oEmbed endpoint is **undocumented** in TikTok's developer docs, so no developer-terms clause attaches to it (`04` §8 row M1); the one mechanism carrying a written *"must delete data not present on 30-day refresh"* obligation is the **Research API (M6), which is UNAVAILABLE on two independent grounds and is not used**; HTML scraping (M9) is out of bounds and no design may assume it |
| Google SST §5.4 caps Places content at 30 days | **VERIFIED**, and honoured at 28 | `src/integrations/places/lookup-cache.ts:93`, enforced by `place_lookup_cache_put()` (`0023`) |
| Instagram / YouTube have any VERIFIED read mechanism | **UNAVAILABLE** | `docs/05-secondary-platforms.md`; TikTok is the sole VERIFIED platform. **This is why E1's second arm stores a URL the user pasted and nothing else** — there is no caption to extract, so the non-TikTok half of E1 raises no caption-retention question at all |

**The residual risk in this ruling, named rather than buried.** If someone later reads TikTok's ToS
and finds a caching limit, it lands on `sources.content_text` and `extractions.candidates` **first** —
both predate E1 by twenty-seven migrations and hold strictly more text than E1 will. E1 is not the
exposure and blocking it on that unknown would be the wrong control. Re-entry: the day a retention
clause is read and quoted, it goes to `sources.content_text` and `extractions.candidates`, and E1
follows whatever they get.

**GDPR lawful basis** — not a third-party capability claim, and not mine to invent. My position for
the record, so `04` §8 Q4 is at least half-answered: the minimum field set is **the extracted place
name plus the source URL**, held on a private per-user row for the life of the account, which is
exactly the narrower of the two options Q4 offers (*"only the extracted place names + the URL"*). **E1
as narrowed in §3 stores precisely that set.** The wider question — whether `sources.content_text`
may be retained at all — is about a table that already exists and stays open as `security.md` owed
item 6. **E1 does not need it answered**, and that is deliberate: E1 must not become the vehicle for
settling a question about a different table.

---

## 7. The non-TikTok arm — three conditions it does not obviously have

E1's second producer is a plain URL column for links `sources` cannot hold. That is user-supplied text
we will store and render, and it is a different risk class from the caption question.

- **U1 — no server-side `fetch` of that URL, ever.** Not for a title, not for an oEmbed, not for a
  preview image, not "just the `og:` tags". `security.md` owed item 3 records the SSRF control as a
  **closed six-host allow-list, default-deny**, with every redirect hop re-validated. An
  arbitrary-URL column with any fetcher behind it is a new SSRF surface with **no allow-list at
  all**. E1 §9.2 excludes "importing Instagram or YouTube content"; this is the security restatement
  of it, and it is inside my veto.
- **U2 — `check (<url> ~ '^https://')` at minimum**, matching `sources.canonical_url` (`0003`). A
  stored `javascript:` or `data:` URL rendered into an `href` is stored XSS. The check is the control;
  client-side validation is not.
- **U3 — do not widen `sources.platform`'s `check (platform in ('tiktok'))`.** E1 acceptance criterion
  6 is correct and is binding: `sources` is a **global** table, and widening it would mint global rows
  for platforms with no VERIFIED read mechanism, whose `platform_source_id` regex
  (`^[0-9]{17,20}$`) encodes TikTok's identity model and nobody else's.

Rendering: `rel="noopener noreferrer"`, matching whatever the existing source link already does.

---

## 8. Findings outside E1, reported upward

Not fixes. I write none of `src/` and none of `supabase/`; each of these goes to a Build agent through
the orchestrator.

| # | Severity | Finding | Minimum fix | Owner |
|---|---|---|---|---|
| **F1** | **Must fix, documentation integrity — not exposure** | `0003`'s comment on `sources.content_text` states *"no product surface displays it"*. False at this commit: two screens display the full caption (evidence §3). The grant is still correct; the stated reason is not | Re-issue `comment on column` with the true reason (server-mediated only; no client role may `select` it); correct the matching bullet in `security.md` §4 | `supabase-database` (comment) · me (`security.md`) |
| **F2** | **Acceptable at university scale, documented** | `imports.expires_at` has no enforcer. `imports.candidates` — resolved place names **and coordinates** — is retained per user for the life of the account and is readable by that user through the table-level `grant select on public.imports`. Not a cross-user exposure; it dies with the account. But it is stated as a 24-hour hold in four documents, and one of them is a migration header | **Either** write the opportunistic prune (`place_lookup_cache_put()`, `0023:83-133`, is the working pattern in this codebase) **or** drop the `expires_at` default and state the truth. **I recommend the second**: after `0031` the row is genuinely wanted, and the TTL is the thing E1 exists to remove | `supabase-database`, after `0031` |
| **F3** | **Acceptable, documented, no action — but do not make it worse** | `grant select on public.extractions to authenticated` is **table-level** (`0004`, restated `0008:70`), so `extractions.candidates` — including each candidate's `evidence`, a verbatim caption fragment — is browser-readable. The gate is sound (same-source membership), so the reader always pasted that link themselves and was already shown the whole caption: **incremental exposure nil.** Recorded because it is the counter-example to R8 — the project withholds `content_text` by column and then ships fragments of it by table grant | None today. **If `extractions` ever gains a second read arm the way `places` did in `0024`, this becomes a real exposure.** Do not add one | noted for review |
| **F4** | **Informational — and it is the strongest argument for E1** | `saved_places.extracted_reason` (`0015`) and `tags`/`why_go`/`dishes` (`0019`) are caption-derived model output, retained for the life of the account, rendered on every library card, with no client write grant. **E1 is the same class of object.** `0019`'s header is the privacy decision record for it and is more thorough than anything I would write fresh | A `0031` that follows `0019`'s pattern — per-user, system-derived, column-scoped grants, no client write on the derived columns — needs no further privacy argument from me | — |

---

## 9. The conditions, collected — a checklist for the reviewer of `0031`

1. **§3** — the stored text is `rawName` and the extracted hints. **Not** `evidence`, **not** the caption.
2. **D1** — `user_id not null references public.profiles (id) on delete cascade`.
3. **D2** — the text is on the mention row, not joined from `sources`/`extractions` at read time.
4. **D3** — `supabase/tests/inventory.sql` updated in the same commit.
5. **§4** — column-scoped grants only; no UPDATE on the text; no INSERT grant (or, if granted, a
   `with check` requiring an owning `imports` row).
6. **§4** — no arm added to `sources_select_via_membership` or to any `extractions` policy; no policy
   naming any `collection_*` table; no `SECURITY DEFINER` function returning a mention row granted to
   `authenticated`.
7. **§7** — no server-side fetch of the pasted URL; `^https://` check; `sources.platform` not widened.
8. **Condition Q** — acceptance criterion 7 executed as two real roles on a leased container, in a
   policy-test file landing with the migration. Not satisfied by reading the policy.

Conditions 1, 6 and 7 are the ones inside my veto. The rest are must-fix but not vetoable.

## Change log

| Date | Change |
|---|---|
| 2026-08-31 | §11 added, answering the orchestrator's question of whether `sources`/`extractions` surviving account deletion is a defect: **correct by design, not a defect, `L1-F8-T1` does what it says.** Verified rather than reasoned — only three tables reference `sources` and all three sever on deletion; a persisted candidate is `PlaceCandidate` + `schemaVersion` + `StoredResolution` with no user-varying field, and `route.ts:667` does spread `evidence` into it. Deleting an extraction on A's departure would delete **B's** cache entry, the `0024:148-153` argument again. Two residues documented as acceptable at university scale: the shared cache is theoretical at one user, and `extractions.created_at` is the third carrier of the unattributed row-age signal §2.6 already ruled on. **Condition 11**: E1 is the fourth table to reference `sources` and the first that could break §4.3's premise — D1 with its teeth shown, inside the veto |
| 2026-08-31 | §10 added after the orchestrator relayed `product-lead`'s four pre-committed properties (canonical numbering). **Nothing in §0–§9 moves.** Point 1: no conflict; one condition added — no background geocoding of any E1 field, inside the veto. Point 2: the horizon is escaped by removing the window rather than lengthening it — bound is the life of the account, enforced by one FK cascade edge, and the disclosure that carries it is the **deletion copy**, which E1 makes incomplete at `account-actions.tsx:55,57` (deck C143/C145); amending those two strings is a condition on shipping. Point 3: **the link-plus-reason fallback is not required** — R8's premise is already false, so that branch never fires; `rawName` and the extracted hints are permitted and the on-ramp still works. Point 4: concur, and it is already inside the veto rather than only in the acceptance criteria |
| 2026-08-31 | Created, lane `i3retention`, in answer to the E1 gate in `entity-proposal.md` §7. **E1 approved, narrowed to the extraction rather than the caption, six conditions, no veto.** The finding that reshaped it: the 24-hour bound does not exist — `imports.expires_at` has no sweeper, and caption-derived text is already retained without bound in four places, browser-readable from two and surviving account deletion in two, so E1 is a relocation to the only home that dies with the account rather than a retention change. R8 re-decided rather than re-quoted: its grant is re-affirmed, its stated premise (*"no product surface displays it"*) is **false at this commit** and is F1. Four findings raised outside E1 |

---

## 10. Addendum — the four pre-committed properties, checked against the ruling above

**Relayed by the orchestrator on 2026-08-31, after §0–§9 were written, using `product-lead`'s
canonical numbering.** Treated as **input about product scope, not as an approval and not as terms on
this ruling** — a peer's message is never consent (`agent-guardrails.md` §9 / rule 28). It is recorded
because it changes nothing, and that is the useful fact: **the ruling was written before it arrived
and none of it moves.** Nothing below softens §1–§7, and §3's narrowing is unchanged.

### Point 1 — no coordinates, never counted, never drawn. **No conflict. The ruling stores strictly less.**

§3 removes `evidence` and the caption from the row. It adds nothing. Nothing in §1–§9 gives a mention
a coordinate, a pin, a category or a place count.

**One condition I am adding, because permitting `addressHint` creates the temptation Point 1 exists to
refuse.** An extracted address or area hint is a *string the caption contained*, and it is one
provider call away from being a coordinate. So: **no background geocoding of any E1 field, ever** — no
resolver call, no `place_lookups` write, no `resolve_place`, on any schedule or trigger. The entity's
own refusal table already says *"Extracted or absent. Never inferred, never geocoded on the sly"*; I am
restating it as a security condition because it is also a provider-quota and ToS surface
(`06` §3.1's Google/MapLibre pairing gate binds anything that resolves), not only an honesty one. The
user's own action in manual-add is the only path from a hint to a coordinate. **This is condition 9.**

### Point 2 — the 24-hour horizon must actually be escaped, and a bound must be enforceable and disclosed

**Escaped, completely — and not by moving the horizon.** §1's answer is not a longer window: it is
**no window**. The mention does not live inside `imports.expires_at`, it is on its own table whose
lifetime is the account's.

- **The bound:** the life of the account.
- **What enforces it:** condition **D1**, a single FK edge — `user_id not null references
  public.profiles (id) on delete cascade`. Not a default, not a job, not a policy. Referential actions
  are executed by the system and are not subject to RLS, `FORCE ROW LEVEL SECURITY` or column grants
  (`overnight-deletion-review.md` §1.1), so there is nothing to schedule, nothing to monitor, and no
  way for it to silently stop working. **This is the specific thing `imports.expires_at` is not**, and
  §1 rules against giving E1 a TTL precisely so that a second unenforced default is not created.
- **Rejected explicitly:** a bounded-window E1. A timer that destroys the row rebuilds the defect
  under a new name, and a TTL with no sweeper is a comment pretending to be a control. If the owner
  later wants a window anyway, the only acceptable enforcer in this codebase is the opportunistic
  prune inside a write the pipeline already makes (`place_lookup_cache_put()`, `0023:83-133`,
  asserted by `0008_policy_tests.sql:1868`) — a `pg_cron` job is not available and an Edge Function
  directory does not exist. It would then also need its own copy string, which the ruling below does
  not cover.

**What the user must be told — and Point 2 is right that this is a requirement, not a courtesy.**
Because the bound *is* the account, the disclosure that carries it is the deletion copy, and **E1
makes two shipped strings incomplete**:

| Where | Ships today (`src/app/profile/account-actions.tsx:55,57`; deck C143/C145) | The problem |
|---|---|---|
| `entryLine` | `This removes your places, your collections and your account.` | a mention is **not** a place and **not** a collection. After `0031` this sentence enumerates a set that no longer covers the user's data |
| `confirmBody` | `Your places, your collections and your account are removed. This can't be undone.` | same |

**Condition 10: `0031` does not ship until those two strings account for mentions.** Not a new screen
and not a privacy policy — an amended clause in the two strings that already exist, owned by
`product-lead`/`ux-interaction` under `voice-and-vocabulary.md`, landing with the feature. I am not
writing the copy; I am ruling that the deletion promise must stay true, which is the same standard
`overnight-deletion-review.md` §4.2/§5 applied to the collection-note exception. The enumerating form
of those sentences is what makes this necessary — a scope sentence that lists nouns has to list the
new one.

**No separate retention notice is required.** The user is told the bound by being told what deletion
removes, and they hold the control that enforces it. A banner saying *we keep this until you delete
your account* on a screen where the only alternative is the same account is noise, and
`voice-and-vocabulary.md` would refuse it.

### Point 3 — the caption text is negotiable, with link-plus-reason as the fallback. **The fallback is not required.**

Stated plainly, because the pre-commitment was written against a worse outcome than the one I reached:
**R8's premise does not hold — it is already false (§2, evidence §3) — so the branch that produces the
link-plus-reason fallback never fires.** `product-lead`'s *"that loses most of the value"* assessment
is correct, and they do not have to accept it.

What is permitted is materially more than the fallback and slightly less than the proposal:

| | proposal | **this ruling** | pre-committed fallback |
|---|---|---|---|
| `rawName` (caption-verbatim name) | yes | **yes** | no |
| extracted city/country/area/address/category hints | yes | **yes**, extracted-only binding | no |
| `evidence` (caption fragment, a debug field) | implied by *"the post's own words"* | **no** | no |
| the full caption | implied | **no** | no |
| source link + closed reason | yes | **yes** | yes |

So `Not on the map yet` still shows the thing the post named, `3 not on the map yet` still means
something, and the prefilled manual-add on-ramp — the mechanism the whole entity exists for — still
works, because it needs `rawName` and the hints, which is exactly the set §3 permits. **What is lost
against the proposal is the quoted caption fragment, not the mention's content.** The one string
change that follows is §3's last paragraph: quotation marks are honest around `rawName` and around
nothing else.

### Point 4 — E1 must not be reached by widening `sources.platform`. **Concur, and it is already stronger here.**

§7 U3, and it sits **inside my veto** rather than only inside the acceptance criteria. The
data-integrity argument relayed is correct and I would add the security half of it: `sources` is a
**global** table read through `sources_select_via_membership`, and its `platform_source_id` check
(`^[0-9]{17,20}$`) encodes TikTok's identity model and nobody else's. A widened check mints
cross-user-visible rows for platforms with no VERIFIED read mechanism, whose identity column has no
meaning — which is a dedup failure and a shared-cache pollution at the same time. The Instagram arm is
a nullable plain-URL column on the **user's own** mention row, subject to U1 (never fetched), U2
(`^https://` check at the database) and U3.

### Consolidated additions to §9's checklist

9. **No background geocoding of any E1 field** — no resolver call, no `place_lookups` write, no
   `resolve_place`, on any schedule or trigger. Inside my veto (Point 1 / `06` §3.1).
10. **The two deletion strings account for mentions before `0031` ships**
    (`account-actions.tsx:55,57` / deck C143, C145). Must-fix, not vetoable — it is a copy
    correctness condition, and the copy is not mine.

Conditions inside the veto are now **1, 6, 7 and 9**.

---

## 11. Ruling — does `L1-F8-T1` do what it says, given `sources`/`extractions` survive?

**Asked by the orchestrator, 2026-08-31, as a question bigger than E1. Verdict: CORRECT BY DESIGN,
not a defect. `L1-F8-T1` does what it says. No veto.** Two residues are recorded as *acceptable at
university scale, documented*, and one new condition falls out that is E1-specific and sharp.

The question as put contains the error, and naming it is most of the answer: *"leaves verbatim caption
fragments **of their imports**."* After the cascade they are not their imports. They are cached
extractions of a public post, reachable only by someone who imported that same post themselves.

### 11.1 What is *about* the user is the linkage, and the linkage is exactly what cascades

Exhaustive, by grep over all 29 migrations — **only three tables reference `public.sources`**:

| Table.column | Action on `sources` | What account deletion does to it |
|---|---|---|
| `extractions.source_id` (`0004:8`) | `on delete cascade` | **no user column at all**; nothing to cascade |
| `imports.source_id` (`0003:60`) | `on delete restrict` | the row dies via `imports.user_id → profiles on delete cascade` |
| `saved_place_sources.source_id` (`0006:37`) | `on delete restrict` | the row dies via `saved_places → profiles` |

Plus `saved_places.source_url` / `source_thumbnail_url` (`0016`) — denormalised **strings** on a row
that cascades. That is the complete set.

**After the cascade, no row anywhere in the schema joins any `sources` or `extractions` row to the
departed user.** The `on delete restrict` edges restrict deletion of the **parent** only, never of the
child, so nothing blocks and nothing is retained by them. `overnight-deletion-review.md` §4.3 asserted
this severance; it is now verified against the full FK set rather than reasoned from two examples.

### 11.2 What is retained is not the departing user's personal data — read, not inferred

A persisted candidate is `PlaceCandidate` + `schemaVersion` + `StoredResolution | null`
(`src/domain/import/stored-candidates.ts:60-74`), and `route.ts:667` spreads the whole candidate
(`{ ...candidate, resolution }`), so **`evidence` — the verbatim caption fragment — is indeed
persisted**. That half of the orchestrator's premise is correct and I checked it rather than assuming
it.

What is *not* in it: no user id, no `created_by`, no timestamp of the user's action, no device, no
location of the user, no field of any kind that varies by who imported. Every value is derived from
**the creator's caption** or from **the resolver's answer about a public venue**.

The caption is the TikTok creator's published speech. It is third-party personal data — about the
creator, and that is a real retention question (`security.md` owed item 6, still open) — but it is
**not the departing user's** personal data, and Art. 17 erasure is not the instrument that reaches it.

### 11.3 What another user can actually read: nothing they could not read without the departed user

`extractions_select_via_source_membership` requires the reader to hold **their own `imports` row for
that `source_id`**. So user B can only read the extraction of a post B pasted themselves — and B would
have obtained that extraction from their own import whether or not user A ever existed, because the
row is keyed `(source_id, model, prompt_version)`: a cache of a function of **the post**, not of A.

Which inverts the deletion argument. **Deleting it on A's departure would be deleting B's data**, not
A's: it destroys a cache entry B is actively using and forces a re-fetch and a re-billed model call
against a post B imported. That is the same reasoning `0024:148-153` wrote into the DDL for
`collection_items` — *erasure of the departing user's data must not be a deletion of someone else's* —
and it applies here for the same reason. The orchestrator's proposed answer, that a shared row cannot
cascade on one user's deletion, is right; it is right for `extractions` as well as for `sources`.

### 11.4 Two residues I am not giving a clean bill to

**R1 — "shared" is theoretical at this scale, and the honest statement is worth more than the clean
one.** With one real user, a `sources` row has exactly one importer in practice. So the operative
effect today is that a departed user's cached captions sit in the database readable by **nobody**.
That is not an erasure failure — the data is not about them, and §11.2 is why — but it *is* a
**data-minimisation residue**, and the justification for retention (cache hits for other importers) is
a design property that is currently not exercised. **Acceptable at university scale, documented. Not a
launch blocker, not a defect.** It only ever improves: a real multi-user population makes the
justification operative rather than theoretical.

**R2 — the unattributed row-age signal, now in its third location.** `extractions` holds a table-level
`grant select`, so `extractions.created_at` is browser-readable and tells a reader *someone imported
this post before you*. `places.created_at` was narrowed out of the grant in `0012`;
`place_provider_refs.first_seen_at` was knowingly left carrying the identical signal
(`security.md` §2.6 says so in terms); this is the third. Unattributed, non-personal, and §2.6 already
ruled the class **acceptable**. Recorded so the count is right, not to propose a fix.

### 11.5 So does `L1-F8-T1` do what it says?

**Yes, with exactly one exception, and it is the one already on the record** — a note the user wrote
on an item in **somebody else's** shared collection (`collection_items.note`, `added_by → null`,
`overnight-deletion-review.md` §4.2). That remains the only thing the user *authored* which survives.
**The caption fragments are not a second exception**, because the user did not author them and they
are not about them.

The boundary of that yes is the shipped strings themselves, and it is why they were written as an
enumeration: `Your places, your collections and your account are removed.` They do not claim
*everything about you*, and §5 of the deletion review told `product-lead` not to make the broader
claim for precisely this reason. **Condition 10 is the live consequence**: an enumerating sentence has
to keep enumerating completely, so mentions must be named in it before `0031` ships.

### 11.6 The condition this produces, and it is E1-specific

> **Condition 11. E1 will be the fourth table in this schema to reference `public.sources`, and it is
> the first one that could break `overnight-deletion-review.md` §4.3's premise.**

All three existing referencing tables sever on account deletion (§11.1). A mentions table that carries
`source_id` **without** `user_id ... references profiles on delete cascade` would become **the first
row in the schema that links a `sources` row to a departed user** — converting §4.3's
correct-by-design into an actual erasure defect, and turning R1's dormant-cache residue into retained
data that is once again *about* somebody.

This is condition **D1** with its teeth shown. D1 was already mandatory; §11 is why it is the single
most important line in `0031`. **Inside my veto.**

**What this does not license.** §11 is not a general finding that caption data may be retained
because it is "the creator's, not the user's". It rules on **erasure** — whether `L1-F8-T1` keeps its
promise — and the answer is yes. Whether we should hold `sources.content_text` at all remains
`security.md` owed item 6, open, and unaffected in either direction.
