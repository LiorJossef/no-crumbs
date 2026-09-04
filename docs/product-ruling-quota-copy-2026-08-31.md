# Product ruling — the screen that lies when the model budget is gone

> **Lane:** `product-lead`, task `r2-quota`. Ruling on finding 4 of
> [`product-review-2026-08-31-r2.md`](product-review-2026-08-31-r2.md).
>
> **Base.** Read against the working tree at this session's start, whose `HEAD` was `1b79e9c` on
> `no-crumbs-implementation`. Every line number below is from that read. **A verifier should
> re-locate by string, not by line** — several lanes are writing `src/` concurrently.
>
> **Written scope: this file.** No `src/` file was read for modification, none was modified, nothing
> was committed or staged. I have no shell: **nothing here is verified by me.** Every "measured"
> claim is a static read of source I quote, and the run-time behaviour of the fix is
> `qa-reliability`'s to establish against a named commit.
>
> **Tier: Advise.** This document is the specification a build lane is dispatched from. §7 is
> written so it can be checked without asking me a question.

---

## 1. The rulings, in one line each

| # | Ruling | Because |
|---|---|---|
| **R1** | **The news is "we can't find places right now, come back tomorrow" — three strings, fixed in §3.** | Every existing string for this state is false: one blames the user for someone else's usage, the other promises a quick retry. |
| **R2** | **No `Retry`. No `Try another TikTok link`. One action: `Back to the map`.** | Both re-runs hit the same empty budget. `retryable: false` in the taxonomy, so nothing can restore a retry downstream. |
| **R3** | **The user is never told the budget is shared, or that a budget exists.** | It leaks our machinery (`voice-and-vocabulary.md` §7.3) and invites *shared with whom?* — an answer that, on a graded demonstration, is *with the agents that built this*. |
| **R4** | **`RATE_LIMITED_LOCAL` is retired, not repurposed. A new code carries this news.** | Repointing it would make its name, its 429 and its own docblock lie, and would cost a rename the day a real per-user limiter is built. |
| **R5** | **C67 and C68 are retired in the C98 style — the row stays, marked retired, with the reason.** | The deck's own rule: *a deck row for an unreachable state is how it gets rebuilt.* |
| **R6** | **Build the producer check. Empty allow-list, and it ships with its own control.** | An error code with no producer is a capability claim the product cannot honour. A guard for that class, written without a control, has the exact defect it exists to catch. |
| **R7** | **Manual add is not offered from this screen in this change. Deferred, with two named conditions.** | The failure screen has no wired action that reaches it, and manual add spends a *second* pool that can also be empty. |
| **R8** | **The per-user limiter is out of scope and is not L1.** | Named and left — §8. |

---

## 2. What is actually true, so the copy can be checked against it

Five facts. Each is a static read; the file and the line at base are given so a verifier re-reads
rather than trusts me.

1. **One import spends one model call against a hard 500/day budget shared with every agent and the
   owner.** Not metered per user, no counter, no ceiling in code.
   `src/ui/import/seed-links.ts:16`, `src/app/import/_lib/use-import-run.ts:383`,
   `src/app/import/screens/paste-screen.tsx:12`.
2. **Exhaustion arrives as a non-OK HTTP status from the model provider and is collapsed into
   `EXTRACTOR_UNAVAILABLE`.** `src/integrations/llm/gemini.place-extractor.ts:208-210` —
   `if (!response.ok) throw extractorUnavailable(\`Gemini returned HTTP ${response.status}\`)`.
   The status is put in the diagnostic message and then discarded; nothing branches on it.
3. **So the screen the user gets is `EXTRACTOR_UNAVAILABLE`'s**: *"That one's on us, not on the
   video. We've already got it, so a retry is quick."* with **`Retry` as the mint primary**
   (`src/ui/import/import-error-copy.ts:210-216`). False for the rest of the day, and the button is
   an invitation to discover that repeatedly.
4. **`RATE_LIMITED_LOCAL` has no producer.** `src/domain/errors.ts:177`. Its copy
   (`import-error-copy.ts:188-195`, deck C67/C68) describes a **per-user** limit — *"You've added a
   lot of TikTok links in the last few minutes"* — and its own docblock says so:
   *"Our own per-user limiter, checked in the route handler before `getOrCreateImport`."* That
   limiter does not exist. `security.md` R-1 records the same absence independently and calls it
   *"the residue of owed item 11 (Charter D11) and the largest one."*
5. **The read succeeds before this failure can happen.** The extractor is stage B; the source fetch
   is stage A. By the time a model 429 is thrown, oEmbed has already returned the caption. So *"we
   read it fine"* is a fact about this code path, not a reassurance we are inventing.

**This was already an open owner decision and has been for two days.**
`handoff-2026-08-29-collections-merge-and-country-band.md` §6, *Needs a decision*, item 2:

> **A global refusal has no honest copy.** `RATE_LIMITED_LOCAL` says "give it a few minutes"; a
> global block can be a 20-hour wait and the user did nothing wrong. **Needs its own code or
> conditional copy.**

**This ruling closes that item: its own code.** Recording it here rather than re-opening it, because
the same question ruled twice in two documents is how a third answer gets written.

---

## 3. R1 — the strings

Exactly three shipped strings. Typographic apostrophes (`’`), matching every neighbouring entry.

```
kicker:   Not right now
headline: We can’t find places right now.
body:     We read it fine. Try it again tomorrow.
icon:     waiting
actions:  ['back_to_map']
```

### Why each word, checked against `voice-and-vocabulary.md`

**`find places`, not `read`.** §3 assigns the two verbs to the two stages and the product already
ships both: `Reading the TikTok video…` (C09) is stage A, `Finding the places…` (C12) is stage B.
Stage B is what failed. Writing this screen with *read* would contradict the body one line below it
and would be the wrong fact besides.

**`right now`, not `today`.** The state sentence must be true at the moment it renders. A model 429
can be a per-minute ceiling as well as a per-day one, and nothing in this codebase currently reads
the provider's error body to tell them apart, so a headline asserting *today* can be flatly false.
`right now` is true under every reading.

**`tomorrow` in the body, and it is deliberately conservative.** It is advice, not a claim about the
world, and it is the only duration that **cannot over-promise**: if the ceiling was per-day,
tomorrow works; if it was per-minute, tomorrow also works. `within a day` and `in a few minutes` can
both be false. This product's defect on this screen has been over-promising twice over; the fix does
not get to introduce a third promise it has not verified. A user who returns early finds it working,
which is the harmless direction.

**`We read it fine.` is the load-bearing sentence.** Every other failure screen in this family is
about the link, so the user's trained response is to go and fetch a different one — which fails
identically and wastes their afternoon. This is the one screen where that instinct is wrong, and
four words turn it off. `it` is an anaphor for the link the user just pasted, which is §3.1's
permitted use. It is also *measured*: see fact 5 above.

**No apology, no cause, no brand name.** §1 (state a fact and stop), §4 (no *model*, *quota*, *API*,
*job*, *retry queue*, no *"something went wrong"*), §2 (the name appears on six surfaces and a
failure screen is not one of them), §5 (sentence case, no exclamation mark, one clause per
sentence), §7.4 (blameless, no apology, at least one action — `Back to the map`, plus *come back
tomorrow*, which is itself the next move).

### R3 — what "shared" buys, and what it costs

*Our shared budget is spent until tomorrow* is honest and I am ruling it out.

- It leaks our machinery (§7.3), which is a rule this product has held on harder cases than this.
- It invites exactly one follow-up — *shared with whom?* — and on 6 September the answer is *with
  the agents that built this*, in front of a grader.
- The user cannot act on it. Nothing about "shared" changes what they should do next, and §7.1 is
  *state a fact and stop*.

**What I traded.** A user who imports twice a week, hits this because the day's calls went
elsewhere, and is not told that someone else caused it. At today's population — the owner plus an
examiner — that costs nothing. **What would change my mind: a second real, non-owner account on
production.** At that point *shared* becomes a fairness statement a user is entitled to, and the
honest answer is not a longer sentence, it is the per-user limit in §8.

---

## 4. R2 — the actions, and the rule they follow

`actions: ['back_to_map']`. Nothing else.

- **No `retry`.** Same budget, same second. The taxonomy must carry this as `retryable: false`, not
  only the copy table, so `importErrorActions`' server-`retryable`-wins path cannot put the button
  back (`import-error-copy.ts:288-299`).
- **No `another_tiktok`.** The next link spends the same empty budget. Offering it is the same lie
  in a smaller font — and it is the reasoning the retired `RATE_LIMITED_LOCAL` entry already gives
  for withholding it (`import-error-copy.ts:186-187`).
- **No `open_tiktok`, and this is a rule rather than a preference.** Across the shipped table,
  `open_tiktok` appears on exactly the codes where **the read failed** and is absent from all three
  where it succeeded (`EXTRACTOR_UNAVAILABLE`, `EXTRACTOR_INVALID_OUTPUT`, `INTERNAL`). Here it
  succeeded. Pointing at the video implies the video is the problem, one line under a sentence
  saying it is not. **Stated for the repo:** *`open_tiktok` is offered exactly when we could not
  read the video, never as a consolation when we could.*

`back_to_map` renders as the h-12 mint primary because it is `actions[0]`
(`failure-screen.tsx:217-226`). That is correct: leaving *is* the recovery here, and it is the only
screen in the family where that is true.

---

## 5. R4 — a new code, and why the slot is not reused

**Reusing `RATE_LIMITED_LOCAL` is wrong three times over:**

1. Its name says *local*. This is a provider-side ceiling. A name that lies is how the next person
   builds on sand.
2. Its status is **429** — *"the one place 429 is honest: this caller really did send too many"*
   (`error-reporting.ts:83-84`). For a shared budget the caller may have sent one request all week.
   429 would be the same false blame as C67, expressed in a number.
3. It costs a rename the day the per-user limiter in §8 is built, at which point the code is needed
   for what it says.

**Specification for the new code.** The taxonomy is a document decision, not a call-site one
(`domain/errors.ts:12-16`, `07` §9). I rule that **the news is distinct and must not share a slot**;
the mechanism belongs to `07` §9 and to `nextjs-architect`. If a different mechanism keeps the news
distinct and the strings in §3 exact, I have no objection.

The shape I am specifying against:

| | |
|---|---|
| **Code** | `EXTRACTOR_QUOTA_EXHAUSTED` |
| **`retryable`** | `false` |
| **HTTP status** | **503.** Not 429 (the caller did nothing), not 502 (nothing is broken upstream — the provider answered correctly and declined). This is `RATE_LIMITED_UPSTREAM`'s reasoning verbatim: *"**we** are the one being throttled and the caller did nothing wrong. 503 = we cannot serve this right now, try later"* (`error-reporting.ts:79-82`). |
| **Log severity** | `error` follows automatically from 5xx (`logSeverityFor`), which is right: a spent day's budget is an operational fact we want in the error-rate graph, unlike a mistyped link. |
| **Producer** | The **Gemini** adapter only, on HTTP 429 (`gemini.place-extractor.ts:208-210`). Everything else stays `extractorUnavailable`. |
| **Migration** | **None needed.** `imports.error_code` is plain `text` with no closed check constraint (`supabase/migrations/0003_sources.sql:71`); the only constraint is `imports_failed_implies_code` (`:89`). Adding or removing a member of this union is a code-only change. |

**The Anthropic adapter is deliberately untouched.** `anthropic.place-extractor.ts:114` has a
byte-similar `HTTP ${status}` branch, and copying this mapping into it would be wrong: Anthropic is
billed per call with no daily ceiling, its 429 is a short rate limit and its 529 is an overload —
both of which *are* worth a quick retry, which is what `EXTRACTOR_UNAVAILABLE` already says. Naming
this because it is precisely the line a build lane copies across without thinking.

**`RATE_LIMITED_LOCAL` is retired**, not deferred-with-its-code-kept. Keeping a written screen and a
status mapping for a limiter nobody is building is the capability claim this whole finding is about,
and it is what makes §6's allow-list have to start non-empty. When the limiter is built, the code
comes back **with its producer, in the same commit** — which is the only order that was ever
correct.

**A "reserved code" defence does not apply here.** The one code that reads as reserved,
`RATE_LIMITED_UPSTREAM`, has a real producer (`oembed-source-adapter.ts:167`). After this change
there are no producerless codes in the union, and there should be none.

---

## 6. R6 — the check, and what it asserts

**Worth building. It is roughly forty lines, the pattern already exists in this repo, and it is the
only thing that stops this class recurring.**

The generalisable rule, stated for the repo rather than for this screen:

> **An error code with no producer is a capability claim the product cannot honour.** A closed union
> whose members the product claims to handle must have, for every member, at least one producer **in
> shipped code**. A test that constructs the value it is testing the handling of proves the handler
> and says nothing about the producer — *a probe that cannot fire looks exactly like a probe that
> found nothing.* Where a suite must construct a value to exercise a handler, a separate guard must
> assert that shipped code constructs it too.

### What it asserts

For every `code` in `DOMAIN_ERROR_CODES`, the identifier of `DOMAIN_ERROR_CONSTRUCTORS[code]`
followed by `(` appears in at least one file under `src/`, **excluding `src/domain/errors.ts`**.

Five details, each of which is the difference between a guard and a decoration:

1. **The scan is `src/`, not the repo.** That is exactly what makes it fire today: the only two
   references to `rateLimitedLocal` outside its definition are in `tests/`, and both construct it
   themselves (`tests/unit/errors.test.ts:99`, `tests/unit/import/pipeline.test.ts:523`).
2. **`src/domain/errors.ts` is excluded** — it holds the definition and the
   `DOMAIN_ERROR_CONSTRUCTORS` map, so including it makes every code pass trivially.
3. **Match `name(`, not `name`.** A re-export, a type position or a mention in the constructors map
   is not a producer.
4. **Strip comments per file before matching.** This codebase documents in prose the copy and the
   codes it replaced; a guard that fires on its own explanation is worse than none.
   `tests/unit/import/import-client-source.ts:46-60` already does exactly this, per file before
   joining, and says why.
5. **Empty allow-list, and no mechanism for one.** After this change every code has a producer.
   Adding an exemption should cost an argument in a diff, and the absence of an `EXEMPT` array is
   what makes that cost real.

### It ships with its own control, and that is not optional

The guard is an absence check, which is the shape that lies most often — the same shape the review
made fire on purpose before trusting it. Two assertions in the same file:

- **Positive control.** The scan finds `rateLimitedUpstream(` in
  `src/integrations/tiktok/oembed-source-adapter.ts`. Proves the glob resolved to real files and the
  match works.
- **Negative control.** A fabricated identifier (`__notAProducer(`) is **not** found. Proves the
  matcher can return false.

Without both, this guard has the identical defect it exists to catch, and its going quiet would be
invisible in a green run — which is the argument `import-client-source.ts:17-19` already makes for
its own callers.

### Where it lives

A vitest test — `tests/unit/errors.test.ts` (which already owns this taxonomy's invariants) or a
sibling `tests/unit/errors-have-producers.test.ts`. The build lane picks; both are equally
acceptable to me. **Not a `scripts/check-*.sh` and not a new `verify` line**: as a test it runs in
`npm test` and therefore in CI with no new script, no new npm entry, and — the reason I care — no
new claim on `npm run verify`, which is a leased exclusive resource under concurrency.

### Named, not scoped in

Three other closed unions in this repo have the same exposure and are the obvious next candidates:
`ProviderFailureReason` (`domain/import/provider-failure.ts:62`), the resolution failure reasons
(`domain/import/resolution-record.ts:183`), and `ImportOutcome`'s kinds. **Do not generalise the
guard to all four in this change.** One union, one guard, debuggable; a guard written for four at
once is a guard nobody reads the failure of.

---

## 7. Acceptance criteria

Checkable against a named commit, without running the app and without asking me a question. Each is
pass/fail on a static read or on `npm test`.

**Copy**

1. `src/ui/import/import-error-copy.ts` contains an `IMPORT_ERROR_COPY` entry for the new code whose
   `kicker`, `headline` and `body` are **byte-identical** to §3, typographic apostrophes included.
2. That entry's `icon` is `'waiting'` and its `actions` is exactly `['back_to_map']`.
3. The strings `Retry`, `Try another TikTok link`, `Open on TikTok` and `Open the original link` do
   **not** appear in that entry, and `importErrorActions(<newCode>, true)` returns exactly
   `['back_to_map']` — i.e. a server sending `retryable: true` cannot restore a button.
4. `IMPORT_ERROR_COPY.EXTRACTOR_UNAVAILABLE` and `.EXTRACTOR_INVALID_OUTPUT` are **unchanged** from
   base. The transient case keeps its retry; only the quota branch splits off.
5. The existing suite still passes unmodified in spirit: every code has a non-empty kicker, headline
   and body; no screen is a dead end; no banned word appears
   (`tests/unit/import/import-error-copy.test.ts`).
6. No string from §3 is hard-coded anywhere under `src/app/import/` — the existing guard covers
   this and must still pass (`import-error-copy.test.ts` + `import-client-source.ts`).

**Taxonomy and transport**

7. The new code exists in `DomainErrorCode`, in `DOMAIN_ERROR_CODES`, and in
   `DOMAIN_ERROR_CONSTRUCTORS`, with `retryable: false` baked into its constructor (not a
   parameter).
8. `httpStatusFor(<newCode>) === 503`.
9. `RATE_LIMITED_LOCAL` no longer appears anywhere in `src/`. Grep returns zero hits under `src/`.
10. `Object.keys(IMPORT_ERROR_COPY)` has length **13** — one added, one removed. The existing
    `covers all 13 codes` assertion should still read 13, and if a lane finds itself changing that
    number, one of the two halves was not done.
11. `gemini.place-extractor.ts` produces the new code on HTTP 429 and `extractorUnavailable` on every
    other non-OK status. `anthropic.place-extractor.ts` is **unchanged** from base.
12. No `supabase/migrations/` file is added or modified by this change.

**The guard**

13. A test exists asserting §6's rule over `DOMAIN_ERROR_CODES`, scanning `src/` with
    `src/domain/errors.ts` excluded, matching `identifier(`, comments stripped per file.
14. It contains both controls from §6 and both pass.
15. **The falsification run, and this is the one criterion that proves the rest.** With the new
    code's producer line in `gemini.place-extractor.ts` temporarily commented out, `npm test`
    **fails**, and the failure message names the code. Restore, re-run, passes. Report the failure
    output, not a description of it.
16. No new entry in `package.json` `scripts`, and no change to the `verify` chain.

**Documents, in the same commit as the code** (`voice-and-vocabulary.md` §6: *a string changes in
code and the deck follows in the same commit, or it does not change*)

17. `docs/ux-architecture.md` §12.4: **C67 and C68 are marked `**Retired**`** in the C85/C98 style —
    the row stays, the string is struck, and the note gives the reason: *described a per-user limit
    the product does not have; shown for the shared exhaustion it blamed the user for someone else's
    usage.*
18. Three new rows added to §12.4 with the strings from §3 verbatim:

    | ID | Surface / state | String |
    |---|---|---|
    | C170 | Can't find places today, headline | `We can’t find places right now.` |
    | C171 | Can't find places today, body | `We read it fine. Try it again tomorrow.` |
    | C172 | Can't find places today, actions | `Back to the map` — no retry, no second link |

19. **Id collision check, before writing.** `C170`–`C172` were free at base: the highest allocated id
    across `docs/` was `C163` (`overnight-copy-deck.md:850`). Several copy lanes are running
    concurrently. **Re-grep `\bC1[6-9][0-9]\b` across `docs/` immediately before the edit**; if
    `C170`–`C172` are taken, take the next free contiguous three and record the substitution in this
    file's §9.
20. `docs/07-import-execution-model.md` §9's table (row for `RATE_LIMITED_LOCAL` at `:430`, and the
    limiter paragraph at `:338`) and `docs/technical-design.md`'s copy of the same table (`:460`)
    both reflect the retirement and the new code.
21. `docs/security.md` R-1 (`:1046-1056`) is corrected. Its current sentence — *"`RATE_LIMITED_LOCAL`
    exists as an error code with shipped UI copy … and nothing in `src/` ever constructs it"* —
    becomes false on this commit. R-1 itself **stands**: the absence of a limiter is unchanged by
    this ruling and must not be read as closed by it.
22. Nothing in this change claims a per-user limiter exists, in code, comment or document.

---

## 8. Not mine — named and left

**The per-user limiter.** Whether to build a counted window keyed on `user_id` is a larger question
than this screen and I am not ruling it. What I am ruling is its **scope**: it is **not L1**, and it
must not be attached to this fix. Three things a scheduler should know before pricing it:

- It is `security.md` R-1's minimum fix and *"the residue of owed item 11 (Charter D11) and the
  largest one"* — the table, the index `imports_user_recent_idx` and (before this change) the error
  code all already exist.
- **A per-user limit cannot fix the ceiling that actually binds.** `handoff-2026-08-29` §6, item 1:
  Google Places is 100/day *for the whole product*, so a global ceiling admits ~11 fresh uncached
  imports per day for everybody, and at 30/day one user exhausts everyone's on their fourth import.
  Whoever builds this has to answer *global or per-user, and against which pool* first.
- **A previous attempt already died.** `0027` is missing from the on-disk migration sequence and
  `handoff-2026-08-29` records PR #72 stalling in review with five unresolved questions. That is a
  cost signal, not a warning off, and it is worth reading before restarting from scratch.

**Distinguishing a per-minute 429 from a per-day one.** Would let the per-minute case keep
`RATE_LIMITED_UPSTREAM`'s existing *"that usually clears up on its own"* copy and its retry, and
narrow this screen to the day case — at which point `today` becomes sayable in the headline.
**It depends on an unverified third-party capability** (the shape and stability of Gemini's error
body's quota-violation identifiers) and I will not accept it until `social-integration` returns a
**VERIFIED / ASSUMED / UNAVAILABLE** label on it, with evidence in `docs/evidence/`. Route that
request through the orchestrator. **Nothing in §7 depends on it.**

**R7 — manual add from this screen.** Deferred, not cut, and the two conditions are specific:

1. An `add_by_hand` action must be **wired** from the failure screen. It is not today, and this
   screen renders from two hosts — the `/import` route and the bottom-nav overlay — so the callback
   crosses `import-page-client.tsx`, `map-page-client.tsx` and `bottom-nav.tsx`. That is a wiring
   change, and widening a copy fix into one on the eve of a demonstration is how the copy fix
   misses. `import-error-copy.ts`'s standing rule stands: *recovery actions only ever point
   somewhere that works.*
2. **The second pool must be checked.** `addPlaceManually` is the only provider call on the manual
   path and it spends Google Places' **100/day**, a different budget that can also be empty
   (`src/app/actions/manual-add.ts:30-37`). Sending a user from one exhausted pool to another is
   this same defect in a new place. Before the sentence *You can still add a place by name* ships,
   someone must establish that the manual-add sheet fails honestly when Places is out of quota.

When both hold, the action and the sentence land **in one commit** — never the sentence first.

---

## 9. What would change my mind

- **On R3 (never say "shared"):** a second real, non-owner account on production. Fairness becomes
  the user's business the moment someone else's usage is spending their capability.
- **On `tomorrow`:** a VERIFIED label on Gemini's per-minute-vs-per-day distinction (§8). Then the
  day case says `today` in the headline and the minute case is not this screen at all.
- **On R6 (build the guard):** nothing I can think of. It is forty lines, it runs in CI for free, and
  the alternative is a written screen, a status mapping and a green suite that together read as a
  shipped limiter to anyone scanning.
- **On the priority of the whole item:** a measurement showing daily usage is nowhere near 500 would
  move the **limiter** (§8) out, and it is already out. It does not move **any** of §7. The screen is
  wrong at zero usage, and it is wrong most visibly on 6 September.

**Amendments** (id substitutions per criterion 19, or anything a build lane changes): record them
here, in this section, with the date.
