# Security ruling — `0032_repoint_saved_place`

> **Task `r1-pin-veto`.** Review of the artefacts produced by task `r1-pin`.
> **Verdict: PERMIT UNDER CONDITIONS. No veto.** The change introduces no data exposure. Four
> conditions below are blocking; three are documentation debt that must land with the commit.
>
> **Base commit:** `9f7d8ce3637676caa1d1e5a9d105e539a2bed589` on `no-crumbs-implementation`.
> (The author's ruling names `2cf6b83` as *its* base; the migration text is byte-identical in both
> trees — the hash below is what I reviewed and it is what the orchestrator must re-check.)
>
> **Artefacts reviewed, by hash. Working-tree copy and immutable copy were verified identical:**
>
> | File | sha256 |
> |---|---|
> | `supabase/migrations/0032_repoint_saved_place.sql` | `293e8b9805d5a64b6a8585e7c590afd22ec1ac1eb565c979480059ce31aabd2a` |
> | `supabase/tests/0032_repoint_saved_place_policy_tests.sql` | `821bb85fabfc25e00353fb969d539f345b17d4090b50b4d280263f2ed8816835` |
> | `docs/db-ruling-repoint-place-2026-08-31.md` | `ff975965c8397a4acc02a2715fa27e03a9c960623e14e5b6accdd287ae595cf7` |
>
> **This verdict names those hashes and nothing else.** If any of the three changes, the verdict is
> void and the review must be redone — `agent-guardrails.md` §5 rule 20.
>
> **Nothing was applied to staging or production.** Everything below ran against the local container
> `supabase_db_P-002` (`public.ecr.aws/supabase/postgres:17.6.1.159`), through Kong on `:54321` and
> through `psql` inside it.

---

## 0. What I did to the local container, stated first because it matters

Two things were **committed** to the shared local database during this review and both were undone.
Recorded rather than glossed, because other agents share that database and `agent-guardrails.md` §8
says a shared resource is reported, not assumed.

1. **A probe insert through PostgREST** (§1): one `saved_places` row for user
   `9a6bf759…` naming a place it did not hold, then deleted through the same API.
2. **`0032` itself was applied and later dropped.** My first harness `\i`-ed the migration inside my
   own transaction; the migration's trailing `commit;` — house style, present in `0024`, `0030`,
   `0031` too — committed my wrapping transaction, so a probe that was meant to roll back did not.
   That committed a `grant execute … to authenticated` and moved one save. Both were reversed
   within the same minute; the harness was rewritten to apply the migration *outside* the
   transaction under test, which is how §2–§5 below were actually measured.

**State restored and verified:** `places=8 saves=8 sps=8 sources=9 imports=12`, user `9a6bf759…`
back on place `db3278b6…` (Kohi), `repoint_saved_place` absent from `pg_proc`. `auth.users` went
2 → 7 during the window; the five new rows are `r1auth-probe-*` / `r1auth-redirect-*` fixtures
created by a concurrent lane, not by me. **One residue I could not undo:** `updated_at` on save
`40a850c7…` moved. No row was created, destroyed or re-pointed on net.

**This is not a finding against `0032`.** The trailing `commit;` is the repo's migration style and
the CLI applies these files at top level. It is a finding against *my* first harness, and it is
written down because the author's own ruling says "every proof below ran inside a transaction that
was rolled back" — which cannot be literally true of a suite whose setup guard requires `0032` to
already exist. The author's numbers are nonetheless reproducible; I reproduced all 26 (§6).

---

## 1. The existing-primitive claim — **TRUE, and the brief's worry does not hold**

The dispatch asked me to attack this first and said it would rather be corrected than agreed with.
**The author is right and the brief is wrong**, and I established it by real HTTP against PostgREST
as a real `authenticated` user, not by reading DDL.

Harness: `repoint-veto.manual.mjs` (held in the handoff directory, §8). It mints an `authenticated`
JWT for a local user with the fixed public local dev signing secret and calls PostgREST with
`apikey` + `Authorization: Bearer`, which is exactly the shape a browser request takes.

| # | What the attacker does | Result |
|---|---|---|
| P1a | User A reads `places?id=eq.<a place only B holds>` | **0 rows** — `places_select_if_saved` denies it |
| P2a | A `POST /saved_places` naming that same place uuid, `origin=manual` | **201 Created** |
| P3a | A re-reads the same `places` row | **1 row** — `name`, `lat`, `lng`, `category`, `source_dataset` |
| P3b | A reads `place_provider_refs?place_id=eq.<it>` | **1 row** — `provider=google`, and the Google `provider_place_id` |
| P4a | A reads `saved_places?place_id=eq.<it>` | **1 row, its own.** B's note, name override and overlay stay invisible |
| P5a | A `PATCH`es `place_id` on its own save | **403 / `42501` permission denied for table `saved_places`** |

So: **an `authenticated` browser can today insert a `saved_places` row naming an arbitrary
`places` uuid and read that row back.** `0006:113` grants table-level INSERT; `0015:57` narrows it
to a column list that still names `place_id`; `places_select_if_saved` (`0006:150`) does the rest.
The author's reading of the grants is exact.

**But the brief's framing — "a pre-existing property that nobody has written down" — is wrong.**
It is written down, and it is *ruled*. `docs/security.md` §3.3 calls the gate *self-granting* in
those words; §5.3 probe **A22** executes it (*"insert a `saved_places` row pointing at the victim's
place uuid, then read `places` — **1 row***"); and **A§1** rules it acceptable, on the grounds that
`places` holds non-personal open-data POI content, the uuids are 128-bit random, and §3.4's column
grant means the gate reaches nothing else. §11's residual-risk register carries it at line 1170.

**Consequence for the design rationale: it survives, and it is better than the brief's.** Rejecting
`grant update (place_id)` on probing grounds would have been rejecting it for a reason that is
already conceded elsewhere in this schema. The author's actual reason — *a re-point must land on a
row the server resolved, never an id the client names, because `resolve_place` is the sole creator
of the shared row* — is the correct one, and it is the one that generalises: it is the same seam
`addPlaceManually` and the add-by-name recovery already hold.

### 1.1 One thing the author's account does **not** cover, and it is a real gap in `security.md`

**P3b.** The self-grant reaches `place_provider_refs`, not only `places`. A§1's *"the gate reaches
nothing else"* is a statement about `places`' column grant; `ppr_select_if_place_saved` (`0006:155`)
is a second policy with the same membership predicate, and it hands over the venue's **Google
`provider_place_id`**. §5.3's row A5–A14 records `place_provider_refs` as **0** — true, but measured
*without* the self-grant, so the table understates what A22 actually reaches.

Severity: **low, and acceptable at university scale — but it must be written down.** The disclosed
value is a Google place id for a venue whose uuid you were already given; it is not
user-attributable and it is the same identifier a Google Places lookup for that venue returns to
anyone. It is nonetheless a Google-content identifier reachable by a route the register does not
name, and `06` §3.1 makes anything on that surface worth being explicit about.

**This is pre-existing at HEAD and `0032` neither opens nor widens it.** It does not bear on the
verdict. It is condition **C7**.

---

## 2. Does `SECURITY INVOKER` + `service_role`-only fail safe? — **YES, and INVOKER is load-bearing**

The author's central design claim, tested by granting the mistake and watching it be refused, then
by building the counterfactual and watching it succeed.

All of the following ran with `0032` applied outside the transaction under test, `set local role
authenticated`, and `request.jwt.claims` set so `auth.uid()` returns the attacker — i.e. as
PostgREST runs a real request. Confirmed live: `current_user=authenticated  auth.uid()=9a6bf759…`.

| # | What was done | Result |
|---|---|---|
| **V3** | `grant execute … to authenticated`, then A calls it on **its own** save | **Refused, `42501`.** Row did not move |
| **V3a** | A calls `place_survivor_id` directly | **`42501` permission denied for function `place_survivor_id`** |
| **V3a2** | A `UPDATE`s `place_id` directly | **`42501` permission denied for table `saved_places`** |
| **V3d** | Same leaked grant, A calls it on **B's** save | **Refused, `42501`** |
| **V6** | `anon` calls it | **Refused, `42501`** |
| **W1/W2** | Through PostgREST as `authenticated`, own save / B's save | **403, `42501` permission denied for function** |
| **W3** | Through PostgREST as `anon` | **401, `42501`** |
| **W4** | Is it in the OpenAPI document served to `authenticated`? | **No.** Not advertised |

**The counterfactual, which is what makes the above mean something.** A `SECURITY DEFINER` clone
with an otherwise identical body, same leaked `EXECUTE`:

| # | What was done | Result |
|---|---|---|
| **V3b** | A calls the DEFINER clone on its own save | **SUCCEEDS.** The save moved |
| **V3c** | A calls the DEFINER clone naming **B** in `p_user_id` and B's save id literally | **SUCCEEDS. User A moved user B's save onto a place of A's choosing.** Aftercheck: *"B Nordoy save now points at Kohi בית קפה יפני"* |

So the INVOKER choice is not decoration. Under a leaked `EXECUTE` grant, the DEFINER shape is a
**cross-user write**; the shipped shape is a broken feature. `0031` is correctly identified as the
wrong precedent and `0019` as the right one. **This claim is verified.**

> **Method note on V3c, kept because it nearly produced a false PASS.** My first attempt passed B's
> save id as a *subquery*. That subquery is evaluated in the **caller's** context under RLS, so it
> returned `NULL` and the function refused for the wrong reason — an apparent PASS that proved
> nothing. It only became a real attack once the id was a literal. An assertion about a DEFINER
> function must not source its target id through the caller's own RLS.

### 2.1 The migration header misstates *where* the refusal happens — condition C4

`0032`'s header claims: *"as INVOKER, if a future migration ever granted EXECUTE on this function to
`authenticated`, the call would fail with 42501 **at the inner UPDATE**."*

**Measured: it fails earlier**, at `place_survivor_id` (V3, V3a) — which is itself `SECURITY
INVOKER` and `service_role`-only. The author's *ruling* §2.3 states this correctly ("no EXECUTE on
`place_survivor_id`"); the migration header does not, and the header is the artefact that survives.

This is not a safety defect — it is a **strengthening the header fails to claim.** There are **two
independent refusals**, either of which alone suffices (V3a and V3a2 measured separately). Say so:
a future migration that granted `authenticated` EXECUTE on `place_survivor_id` would move the
refusal to the site the header already names, and the property would still hold.

---

## 3. Does the attribution survive a re-point? — **the link survives; its truthfulness does not**

**The structural claim is confirmed by execution.** Real re-point of B's HaKosem save onto Kohi,
through `repoint_saved_place` as `service_role`, in a rolled-back transaction:

| # | Assertion | Result |
|---|---|---|
| **V4a** | `saved_place_sources` unchanged across the move | **PASS** — 1 link, identical `source_id` |
| **V4b** | `source_url`, `source_thumbnail_url` intact | **PASS** — `https://www.tiktok.com/@_/video/7259010845558983978`, thumbnail present |
| **V4c** | `note`, `display_name`, `category_override`, `visit_state`, `visited_at`, `origin`, `tags` intact | **PASS** |
| **V4f** | Owner still reads `saved_place_sources` as `authenticated` after the move | **PASS** — 1 |
| **V4g** | Owner still reads the `sources` row (the TikTok) through `sources_select_via_membership` | **PASS** — 1 |

The author's reasoning is right: these are keyed on `saved_place_id`, never on `place_id`, and there
is no statement in `0032` that could detach one. **Confirmed.**

### 3.1 But this is a finding, and it is condition C3

**V4d, measured:** after the re-point, `extracted_reason` reads **`📍Ha Kosem`** and the save now
points at **`Kohi בית קפה יפני`**. **V4e:** `tags = {"middle eastern"}` landed on a Japanese coffee
shop.

That is not cosmetic, because of what the shipped UI does with those two fields together.
`src/components/sheet/place-sheet.tsx:1705-1707` renders `authorLabel` — the creator's `@handle` —
as the `<figcaption>` **directly under the caption quote**, and the caption quote is
`extracted_reason` run through `formatCaptionQuote` (`src/ui/place/caption-quote.ts`), which by
design strips only the leading marker and changes nothing else. So after a re-point the sheet shows:

> a venue header saying **Kohi**, a verbatim quote saying **"Ha Kosem"**, and **@handle** credited
> underneath it.

`docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md` §158 quotes Developer Terms
**III.3(n)**, VERIFIED, and the operative verb is not only "delete":

> *"…or **falsify** or delete any author attributions, legal notices, or other **labels of origins
> or source of material**."*

A creator credited for naming a venue they did not name is a falsified label of origin. `09` §5 also
records that the product is *currently* compliant with **no gap to close** — this change opens one.

**Severity: must fix before the feature is user-reachable.** Not before the *migration* lands —
`0032` alone is inert, and the falsification only exists once a UI can trigger it. But the migration
and the UI must not be treated as separable for this purpose.

**This is not a veto.** It is a terms-and-honesty defect, not data exposure, so it is outside the
scope roster §9 V1–V4 gives me an unoverridable veto over. It is a blocking condition and the owner
may rule otherwise; I record the disagreement if they do.

The author's header states `extracted_reason` is *"untouched, and `0017`'s insert-only posture is
why it could not be rewritten here even if that were wanted"* — accurate about the mechanism, and it
correctly frames the carry-over as deliberate. What it does not do is connect it to III.3(n). The
project rule *"never convert uncertainty into certainty — preserve source, provenance, evidence and
the extracted-vs-inferred distinction"* points the same way.

---

## 4. What can a user now do to another user's rows? — **nothing they could not do before**

Concretely, and each line is a statement I executed.

**Refused, measured, with the row re-read afterwards rather than the exception trusted:**

| # | Attack | Result |
|---|---|---|
| **V2** | A calls `repoint_saved_place` naming itself, on **B's** save id | `42501`. Aftercheck: *"B save still on Nordoy = true"* |
| **V2b** | B, symmetrically, on **A's** save | `42501` |
| **V2c** | Membership oracle: an existing-but-not-yours id vs. a nonexistent id | **Indistinguishable** — same `SQLSTATE`, same message template once the interpolated uuid is masked. Not an existence oracle over other people's libraries |
| **V3d** | A on B's save, **with `EXECUTE` leaked to `authenticated`** | `42501` |
| **V6** | `anon` | `42501` |
| **W1–W3** | All of the above through PostgREST | 403 / 401 |

**Read-access delta after a legitimate re-point, measured as the user under RLS:**

| # | Question | Result |
|---|---|---|
| **V5a** | Does B still read the **vacated** place? | **0** — access is lost with the save. No retained leak |
| **V5b** | Does B now read the **target** place (previously only A's)? | **1** |
| **V5c** | Does B read **A's overlay** on it? | **0** |
| **V5d** | Does B read its provider refs? | **1** |
| **V5e** | Does B read A's `saved_place_sources`? | **0** |

**V5b/V5d are the A22 self-grant reached by a second route, and they are strictly narrower than the
route that already exists**, because the target id comes from the server's own `resolve_place` and
never from the client. The `0032` path cannot name a uuid the caller supplies; the INSERT path
already can. **No new exposure. This is the finding that would have produced a veto and it is not
present.**

### 4.1 The parameter that is the actual risk, and it is not in the database — conditions C1/C2

`repoint_saved_place(p_user_id, p_saved_place_id, p_place_id)` **trusts `p_user_id`.** The function
says so in its own comment and is right to: ownership is enforced against the *argument*, because
`service_role` bypasses RLS and no policy is consulted. The database cannot do better.

**V3c is what that looks like when the trust is misplaced** — a caller naming another user rewrote
that user's save. In `0032`'s shape the only caller is `service_role`, so the trust boundary is the
server action, which **does not exist yet** (author's §5.3). That makes it a dependency edge, not a
defect, and it is why C1 and C2 are written as acceptance criteria rather than as review comments.

---

## 5. Does anything in `docs/security.md` become false? — **yes: three amendments, one of which is already false at HEAD**

The embed ruling earlier today made this binding: a ruling that permits a change and silently
falsifies an existing claim is worse than a veto.

**(a) §3.4(a), lines 223–231 — becomes misleading.** It quotes `0006:117` and concludes:

> *"`user_id`, `place_id` and `origin` are absent. **"Move my save onto someone else's place"** and
> "give my save away" are **not expressible**, independently of whether the RLS policy is right."*

The grant-level claim stays true — P5a and R1 both return `42501`. What stops being true is the
scope of the English sentence: after `0032` the product *can* move a save onto a different place.
**Required wording:** not expressible **from the browser**; the only writer is
`repoint_saved_place`, `service_role` only, `SECURITY INVOKER`, and it moves a save only onto a row
the server resolved. Note also that *"move my save onto someone else's place"* was never the right
gloss — `places` rows are **shared**, not owned, and the sentence reads as though they were.

**(b) §3.5's function table (line 288) and §4's surface table (lines 483–495) — become incomplete.**
`repoint_saved_place` must be added: **invoker / `service_role` only / `authenticated` holds no
UPDATE on `place_id`, so the server is the only writer.** And a row for "re-point a saved place at
the right venue", naming the server action once it exists.

**(c) §3.7, lines 428–437 — already false at HEAD, independent of `0032`.** It says:

> *"**The read primitive that had to be closed**, and the conjunct that closes it. Without care,
> this pair of policies would be a read oracle over the entire `places` table: create a collection
> you own, insert an arbitrary place uuid into it, then select it out of `places`."*

`collection_items_insert_editor`'s third conjunct requires the place to already be in **your own
library** — and §1 above shows you can put any uuid you like into your own library. So the conjunct
closes the *collections* route while the `saved_places` route stays open, which the same document
concedes 200 lines later at A22 and A§1. The section as written reads as a closure; it is a
narrowing. **Required:** say that the conjunct routes the request through `saved_places`, and that
what actually bounds the primitive is A§1 (uuid unguessability plus the `places` column grant), not
the conjunct. Cross-reference A22 by name.

None of these is a reason to refuse `0032`. **(c) is pre-existing and is the most important of the
three**, because it is the one a future reviewer would rely on.

---

## 6. What I reproduced of the author's own evidence

I ran `supabase/tests/0032_repoint_saved_place_policy_tests.sql` myself against the local container
with `0032` applied, `ON_ERROR_STOP=1`. **26 assertions, 26 PASS, 0 FAIL, ending in `ROLLBACK`** —
R0, R0b, R0c, R1, R1b, R1c, R1c2, R2, R2b, R2c, R2c2, R2d, R2e, R2e2, R3, R3b, R3c, R4, R5, R6, R7,
R7b, R8, R9, R9b, plus the setup guard. Independently reproduced, not taken from the author's
report. The suite is genuinely adversarial: R2e2 (B still reads the old place) and R4's
both-saves-intact check are the two that stop their neighbours from being vacuous, and §6's `ctid`
correction — an assertion about "nothing was written" needs an instrument the transaction cannot
freeze — is a real methodological catch that I would not have made.

**Grant posture, read from the catalogue with `0032` applied:**
`proacl = {postgres=X/postgres, service_role=X/postgres}`, `prosecdef = f`. No `anon`, no
`authenticated`, no `PUBLIC`. Matches the file. Consistent with `inventory.sql` check 6 being
exhaustive about browser-reachable functions, and confirmed behaviourally by W1–W4.

---

## 7. Verdict and conditions

**PERMIT UNDER CONDITIONS. No veto.** `0032` introduces no data exposure. It is a narrower write
path than the one the schema already offers, it fails safe under the mistake it is most likely to
suffer, and its authorisation properties are proven by execution rather than asserted.

### Blocking — the feature is not user-reachable until these hold

**C1 — `p_user_id` is derived from the session, never from the request.**
The server action must obtain the user id from `getUser()` server-side. If it reaches the function
from a request body, path param, header or client-supplied form field, V3c is reproduced through
the front door.
*Acceptance:* a test that posts a re-point request with another user's id in the body and asserts
the call either 403s or acts on the **session** user's save; plus `grep` showing no route from
request input to `p_user_id`.

**C2 — `p_place_id` comes from `resolve_place` in the same request, never from the client.**
This is the entire stated rationale for choosing a function over a column grant. If the route
accepts a `place_id` from the browser, the function is a column grant with extra steps.
*Acceptance:* the route's input schema has **no** `place_id`-shaped field; a test posting one
asserts it is rejected or ignored; the resolved id is traceable to a `PlaceResolver` call.

**C3 — the attribution must not be falsified by a re-point (§3.1).**
On re-point, either clear the caption-derived fields that assert something about the *venue*
(`extracted_reason`, `tags`, `dishes`, `why_go`), or suppress the caption-quote + creator-credit
pairing on a re-pointed save. **Which of the two is an owner ruling**, because clearing destroys
evidence and suppressing hides a credit — `working-agreement.md` §7. Note that clearing
`extracted_reason` needs a migration: `0017` made it insert-only, so `0032` as written could not do
it even if that were the ruling. The `source_url`, `source_thumbnail_url` and `saved_place_sources`
link must be preserved in **either** branch — that part of the credit is owed unconditionally.
*Acceptance:* a test that re-points a save carrying a caption quote and asserts the rendered sheet
does not show a creator credit attached to a quote naming a different venue than the header.

**C4 — fix the migration header's refusal-site claim (§2.1).**
State two independent refusals — `place_survivor_id` EXECUTE (which is what actually fires, V3) and
the `place_id` UPDATE grant (V3a2) — instead of one. Header text only; **the function body must not
change**, or this verdict's hash is void.

### Must land in the same commit — documentation debt

**C5 — the three `docs/security.md` amendments in §5**, (a), (b) and (c). (c) is a correction of a
claim that is already false at HEAD and is the one that matters most.

**C6 — `npm run db:test` must chain `db:test:0032`.**
Measured: `package.json:19` chains `0008 && 0024 && 0031` only. The author flagged this and could
not fix it (`package.json` was outside their scope). **A policy suite nothing runs is a policy suite
that silently stops being true**, and R9 — the proof that INVOKER is load-bearing — is exactly the
assertion a future DEFINER-ising edit would need to trip.

**C7 — record the `place_provider_refs` reach of the A22 self-grant (§1.1)** in `docs/security.md`
§3.3 / A§1 and in §11's residual-risk register. **Acceptable at university scale, documented** — it
discloses a Google place id for a venue whose uuid the caller was already given, and nothing
user-attributable. Pre-existing; not caused by `0032`; not a reason to hold it.

### Accepted as disclosed — no action required before launch

- **`collection_items` stranding** (author's §5.1). Not a data exposure: no row becomes readable to
  anyone new. It is a correctness gap, disclosed in the artefact with its reasons and a detection
  query, and the author is right that fixing it would force `SECURITY DEFINER` and re-open `0024`'s
  revoke. **Acceptable at university scale, documented**, and the follow-up needs its own review.
- **The same gap in `merge_places`** (author's §5.2). Pre-existing, correctly reported not fixed.
- **No audit row** (author's §5.3). Acceptable; the function returns the vacated `place_id` so the
  caller can log it, and C1's server action should.
- **The INVOKER dependency on `service_role`'s inherited UPDATE**, asserted by name in R0c. The
  right handling: a future revoke fails in CI rather than in production — **provided C6 lands**,
  without which R0c is a file nobody executes.

---

## 8. Evidence

Held in the task handoff directory
`…/fe536eb0-58de-414e-9afb-9fe2f3c7e69d/scratchpad/r1-pin-handoff/`, alongside the three reviewed
artefacts. **Not placed under `docs/evidence/security/` because this task's write scope was narrowed
to this file alone**; the orchestrator owns where they land.

| File | What it establishes |
|---|---|
| `repoint-veto.manual.mjs` | §1 (P1–P5) and §2's W1–W4 — the PostgREST attacks, as a real browser request |
| `veto-battery2.sql` | §2 — V3, V3a, V3a2 (the INVOKER fail-safe and both refusal sites) |
| `vb4.sql` | §2 — V3d (INVOKER refuses the cross-user attack with EXECUTE leaked) |
| `vb5.sql` | §2 V3c (the DEFINER counterfactual), §3 V4a–V4g, §4 V5a–V5e, V6 |

Every SQL battery ends in `ROLLBACK`. The PostgREST harness commits one row and deletes it; §0
records the net effect on the shared local database and its reversal.

**Not proven here.** This is one container with 8 places, 8 saves and 0 collection items. It says
nothing about production volumes, nothing about concurrency, and nothing about the server action
that does not yet exist — which is where C1, C2 and C3 all live. The author's own note applies
unchanged: a local `0 rows` from a database this size is not evidence that a gap is empty.
