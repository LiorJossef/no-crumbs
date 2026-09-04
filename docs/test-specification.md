# Test specification — No Crumbs

**Course requirement M6** (`docs/03-university-requirements.md`). The companion artefact is M7, the
implemented tests themselves, which live in `tests/`, `supabase/tests/` and `scripts/`.

> **Provenance of every number in this document.** All counts were measured on **2026-08-31**
> against commit **`2fae46b`** on branch `no-crumbs-implementation`, by running the suites
> described in §11 and by counting files in the working tree. Nothing here is copied forward from
> an earlier document. Where a suite could not be executed in this checkout, §10 says so and says
> why, and no passing count is claimed for it.
>
> The counts name a **commit**, not a working tree, because several agents write to this tree at
> once and a tree holds everybody's half-finished work. At the moment of measurement `git status`
> reported no modification under `src/`; the repository has moved on since, so re-running these
> commands against a later tree may legitimately produce different numbers.

---

## 1. What this document is, and what it is not

It is an argument about failure, not an inventory of files. It states what this product would have
to do wrong for a user to be let down, decides where each of those failures can be caught most
cheaply and most honestly, and then shows the tests that catch them. It is equally explicit about
what is **not** tested, because a test suite that claims to cover everything is telling its first
lie.

Three claims are load-bearing and are stated up front so that the rest can be read against them:

1. The most likely failure of this product is not a crash. It is a **confident wrong answer** — a
   place saved under the wrong name, at the wrong coordinates, from a caption that never said so.
2. The most *serious* failure is a **permission failure**, because every user's map is private and
   there is more than one user. A wrong pin is a disappointment; another user's pin is a breach.
3. The **modal outcome of the core feature is "no places found"** — roughly 73% of real imports —
   so the empty result is a core surface with its own tests, not an error path.

---

## 2. What "working" means for this product

### 2.1 The central business process

One process carries the product's value. Everything else is navigation around it.

> A user pastes a TikTok link. The link becomes a canonical post identity, then a caption, then a
> structured extraction, then one or more matched real-world places, then rows the user owns on a
> private map they can find again.

Nine hops, each of which can fail in its own way:

| # | Hop | Implementation |
|---|-----|----------------|
| 1 | pasted text → a URL | `src/domain/source/extract-pasted-url.ts` |
| 2 | URL → canonical post identity, or a named refusal | `src/domain/source/canonicalise-tiktok-url.ts` |
| 3 | short link → full link | `src/integrations/tiktok/resolve-short-link.ts` |
| 4 | post → caption | `src/integrations/tiktok/` (oEmbed adapter, caption extractor) |
| 5 | caption → candidate places | `src/integrations/llm/`, `src/domain/extraction/` |
| 6 | candidates → grounded, plausible candidates | `src/domain/extraction/grounding.ts`, `plausibility.ts` |
| 7 | candidate → a real place | `src/integrations/google/`, the scorer in `src/domain/places/` |
| 8 | matched place → a row the user owns | `save_place()` in `supabase/migrations/0007_functions.sql` |
| 9 | saved rows → a map that shows them | `src/app/map/` |

### 2.2 The failure modes this chain actually has

These are the things the suite exists to detect. They are ordered by how badly they hurt, not by
how often they happen.

| | Failure | Why it matters | Where it is caught |
|---|---|---|---|
| F1 | **A user reads or writes another user's rows** | The only failure that is a breach rather than a disappointment | Database policy tests (§6) |
| F2 | **A confident wrong match** — the resolver auto-accepts the wrong venue | The user trusts the pin and drives to it. Silent; no error is ever shown | `tests/unit/places/benchmark-golden.test.ts`, `score.test.ts` |
| F3 | **An invented place** — the model names a venue the caption never mentioned | Converts uncertainty into certainty, which the working agreement forbids outright | `tests/unit/extraction/grounding.test.ts`, `plausibility.test.ts` |
| F4 | **A hostile or unexpected URL is followed** — a host that merely ends in `tiktok.com`, an IP literal, a `javascript:` scheme | Server-side request forgery from a field that accepts arbitrary text | `tests/unit/source/canonicalise-tiktok-url.test.ts` |
| F5 | **Rows save correctly but the map shows another continent** | Passes every mocked assertion and is still broken. This is the failure that motivated the manual drivers | `tests/e2e/`, `tests/manual/*.manual.mjs` |
| F6 | **A dead end** — a failure screen with nothing to press, or a "no places" screen that shows the user nothing they can check | The modal outcome. If it dead-ends, 73% of imports dead-end | `tests/unit/import/no-places-screen.test.ts`, `screen-honesty.test.ts`, `tests/e2e/import-failure-screen-deadends.spec.ts` |
| F7 | **A dishonest progress rail** — the UI claims a stage the server never reported | Same class as F3: a confident claim with no basis | `tests/unit/import/rail-wait-line.test.ts`, `screen-honesty.test.ts`, `tests/e2e/import-probe-status-map.spec.ts` |
| F8 | **A duplicate import or a stale response** — double submit, or an answer for a link the user has already replaced | Produces duplicate rows or shows results for the wrong post | `tests/e2e/import-double-submit.spec.ts`, `import-cancel-stale-response.spec.ts` |
| F9 | **A transport failure reported as the wrong thing** — a connect timeout shown as "this share link has expired" | Sends the user to fix something that is not broken | `tests/unit/import/import-error-copy.test.ts`, `provider-failure.test.ts`; **partially open, see §10.4** |
| F10 | **Model output that will not parse** — truncated mid-array, over-long fields, more candidates than the cap | The whole import is lost when most of it was usable | `tests/unit/extraction/partial-parse.test.ts`, `schema.test.ts`, `stop-reason.test.ts` |
| F11 | **An error message that leaks internals** — a Postgres error string, a schema word, a caption body in a log line | Security and privacy, and it is invisible until someone reads a log | `tests/unit/app/actions/saved-places.test.ts`, `describe-cause-hostile-input.test.ts`, `error-reporting.test.ts` |

### 2.3 The three properties, stated as testable rules

Everything above reduces to three rules, and every test in the suite is ultimately serving one of
them:

- **Isolation.** A user's saved places, notes, imports, captions and mentions are readable and
  writable by that user and by nobody else. Enforced in the database, not in the application, and
  therefore proved in the database.
- **Honesty.** The product never states more than it knows. An unresolved place is shown as
  approximate; an ungrounded model claim is discarded; a progress rail claims only stages the
  server sent; an empty result is presented as an outcome, not as a failure.
- **No dead ends.** Every terminal screen — success, empty, failure — offers a next action that the
  user already has the permission to take.

---

## 3. Test strategy: five layers, and why each thing sits where it does

The rule that decides placement is: **a test belongs at the cheapest layer that can still fail for
the real reason.** A test that passes for the wrong reason is worse than no test, and a test that
needs a browser to check a pure function is a test that will eventually be deleted for being slow.

| Layer | Tool | Runs against | Count | What only this layer can prove |
|---|---|---|---|---|
| Unit / domain | Vitest, `node` environment | Pure functions and mocked ports | 165 files, 2,746 tests | Exhaustive input space: every error code, every URL shape, every schema violation |
| Component (static render) | Vitest + `react-dom/server` | A component rendered to a static HTML string | 14 files | The markup and the accessible name a component produces for given props |
| Source-contract | Vitest + `readFileSync` | The source text of a module | 57 files | Absences and bans — that a screen contains no forbidden word, that a module imports nothing from a forbidden layer |
| End-to-end | Playwright | The built app in Chromium, real navigation | 13 spec files, 56 tests over 4 projects | Assembly: routing, focus, double-submit, stale responses, both breakpoints |
| Database policy | `psql` against a migrated Postgres | Real roles, real RLS, real grants | 3 files, 166 assertions | Authorisation, executed as two different users |
| Manual, documented | Node drivers + written evidence | The live app, real TikTok, real model | 21 files in `tests/manual/` | Anything requiring a real third party, a real model call, or human judgement |

### 3.1 Anticipated examiner question: "why is this a unit test and not an end-to-end test?"

Worked examples, because this is the question the strategy has to survive.

- **URL canonicalisation is a unit test.** It has around 60 meaningful inputs — six allowed hosts,
  seven path shapes, locale prefixes, userinfo, ports, IP literals, non-HTTP schemes, malformed
  ids. Driving 60 inputs through a browser would take minutes and would prove exactly the same
  thing as 60 direct calls that take milliseconds. It is also a **security boundary**, and a
  security boundary should be tested at the boundary, not through three layers that might
  accidentally sanitise the input first.
- **Double-submit is an end-to-end test.** The defect is "the button is still pressable while the
  first request is in flight." That property does not exist in any single function; it exists only
  once React, the route handler and the network are assembled. `tests/e2e/import-double-submit.spec.ts`.
- **Cross-user reads are database tests.** The isolation guarantee is implemented as RLS policies
  and column grants, not as application code. An application-level test would prove that the
  application asks the right question; it would not prove that a wrong question gets a safe answer.
  The policy tests execute the wrong question as a second real user and assert zero rows.
- **"The map opens somewhere useful" is a manual test.** There is no assertion that separates a
  correct camera from an incorrect one on an arbitrary library; a human looking at the screen can
  tell instantly. `tests/manual/drive-app-both-breakpoints.mjs` exists for exactly this and its
  header records three defects that no assertion caught.

### 3.2 Why there is no React Testing Library, and what stands in its place

`docs/03-university-requirements.md` O2 anticipated "Vitest + React Testing Library + Playwright".
**React Testing Library is not installed.** `vitest.config.ts` sets `environment: 'node'` with no
jsdom, and collects `*.test.ts` only. This is a deliberate deviation, and the reasoning is:

- Everything RTL would give us above a static render — clicking, typing, focus — is already covered
  by Playwright against the *real* built application rather than a simulated DOM. Two simulation
  layers for the same behaviour is duplication with two different sets of lies in it.
- What is left is "given these props, what markup and what accessible name does this component
  produce", and `react-dom/server`'s `renderToStaticMarkup` answers that in a `node` environment
  with no extra dependency and no jsdom's DOM approximations.

The honest cost is stated in §10.3: a static string has no layout and no CSS, so no component test
in this repo is evidence about size, contrast or visual outcome.

---

## 4. The suite as measured

Run at commit `2fae46b`, 2026-08-31.

```
$ npx vitest run
 Test Files  165 passed (165)
      Tests  2746 passed (2746)
   Duration  5.03s
```

```
$ npx playwright test --list
Total: 56 tests in 13 files
  mobile-chrome 26 · desktop-chrome 26 · gate-mobile 2 · gate-desktop 2
```

Database policy assertions, counted as `PASS` notices in the three files:
`0008_policy_tests.sql` **85**, `0024_collections_policy_tests.sql` **43**,
`0031_place_mentions_policy_tests.sql` **38** — **166** in total. What actually executed in this
checkout, and what did not, is in §6.4 and §10.1.

Unit tests by area (test-file count, and `it(`/`test(` call sites; the 2,746 total above is higher
because `it.each` expands at run time):

| Area | Files | Call sites | Area | Files | Call sites |
|---|---|---|---|---|---|
| `map` | 29 | 456 | `collections` | 8 | 75 |
| `import` | 29 | 387 | `brand` | 5 | 56 |
| `places` | 19 | 401 | `shell` | 5 | 53 |
| `ui` | 20 | 321 | `source` | 2 | 48 |
| `integrations` | 16 | 209 | `design-system` | 3 | 43 |
| `extraction` | 5 | 148 | `profile` | 2 | 41 |
| `app` | 8 | 132 | `add` | 2 | 35 |
| `sheet` | 7 | 108 | `nav` | 2 | 17 |
| | | | `auth` | 1 | 4 |

The distribution is deliberate and is worth reading as a claim: `import`, `places`, `extraction`,
`integrations` and `source` — the central business process — hold 1,193 of the call sites. `map`
and `ui` are large because the product *is* a map, and because most of what is asserted there is
honesty of presentation rather than layout.

---

## 5. Coverage of the seven M6 categories

M6 names seven categories. Each is answered below with real file names.

### 5.1 Core features

| Feature | Tests |
|---|---|
| TikTok import, whole pipeline | `tests/unit/import/pipeline.test.ts` (26 tests over the golden path, the capped path, partial success, heartbeats and all 13 error codes) |
| The import route | `tests/unit/app/api/imports/probe.test.ts` (826 lines, extraction branch and honest-failure branch) |
| Confirm and save | `tests/unit/app/api/imports/confirm.test.ts` — enrichment, provenance, the resolved/guessed split, and that a failed enrichment never loses the save |
| Manual add by name | `tests/unit/app/actions/manual-add.test.ts`, `manual-add-choice.test.ts`, `tests/unit/import/add-by-name.test.ts` |
| Saved-place CRUD | `tests/unit/app/actions/saved-places.test.ts` — delete, note, category, been/not-been |
| Place resolution | `tests/unit/integrations/google/place-resolver.test.ts`, `place-resolver-failures.test.ts`, `tests/unit/integrations/places/place-resolver-factory.test.ts` |
| Search, filter, ordering | `tests/unit/places/search.test.ts`, `category-filter.test.ts`, `tests/unit/sheet/place-order.test.ts`, `tests/unit/ui/tag-filter.test.ts` |
| Map camera and pins | `tests/unit/map/` — `pins-land`, `camera-library-shapes`, `framing-stability`, `framing-replay`, `zoom-bands`, `query-rect`, `near-me` |
| Collections and sharing | `tests/unit/collections/` (8 files) and `supabase/tests/0024_collections_policy_tests.sql` |
| Account deletion | `tests/unit/profile/account-deletion.test.ts` |
| Auth return path | `tests/unit/auth/return-path.test.ts` |

### 5.2 Invalid inputs

Detailed in §7. In summary: `tests/unit/source/` — `canonicalise-tiktok-url.test.ts` and
`extract-pasted-url.test.ts`, 48 assertions between them — `tests/unit/extraction/schema.test.ts`
(638 lines of schema rejection), `partial-parse.test.ts`,
`tests/unit/app/api/imports/describe-cause-hostile-input.test.ts`, and the length and
closed-vocabulary constraints executed at the database in
`supabase/tests/0031_place_mentions_policy_tests.sql` (M4a–M4d).

### 5.3 Central business processes

`tests/unit/import/pipeline.test.ts` is the specification of the central process, expressed as
tests. Four properties are asserted there that are easy to state and easy to get wrong:

- **The full event sequence, in order**, ending on `kind: 'ready'`.
- **`NO_PLACES_FOUND` is a success, not an error** — zero candidates ends the sequence on
  `kind: 'no_places'`. This is the modal outcome, so treating it as an error would make the modal
  experience an error experience.
- **Partial success is first-class** — some candidates resolved and some not is still `ready`; a
  resolver that fails on every lookup sets `degraded` and is *still* `ready`, because eight
  unresolved names are more useful than a failure screen.
- **All 13 `DomainErrorCode`s are reachable**, each exercised through the real pipeline, and a
  final test asserts that all 13 were exercised — so adding a fourteenth code fails the suite until
  someone shows how it can happen.

Two further whole-process facts are asserted there: no raw error object ever crosses the generator
boundary, and a failure inside `finish()` does not prevent the true outcome from being reported.

The end-to-end half of the same process is `tests/e2e/import-happy-path.spec.ts`,
`import-probe-status-map.spec.ts`, `import-paste-gate.spec.ts`,
`import-failure-screen-deadends.spec.ts`, `import-double-submit.spec.ts` and
`import-cancel-stale-response.spec.ts`. The real-world half — a real link, a real caption, a real
model call — is `tests/manual/import-e2e.manual.mjs` and `tests/manual/tiktok-oembed-live.manual.ts`.

### 5.4 Permissions

Mandatory here, not optional, and answered in full in §6.

### 5.5 The database

Three layers, because "the database" means three different things:

1. **Authorisation** — `supabase/tests/*.sql`, §6.
2. **Schema invariants, executed rather than read.** `0031`'s M1 asserts *absences*: no coordinate
   column on `place_mentions`, no TTL-shaped column, no `import_id`, exactly three foreign keys.
   M14a/M14b execute a `profiles` delete and an `auth.users` delete and assert the cascade actually
   removed the rows — the retention bound is proved by deleting, not by reading the foreign key.
3. **Static gates that run on every `npm run verify` and in CI.**
   - `scripts/check-migration-grants.sh` — every table created in `public` must enable *and force*
     RLS in the same migration, and every table and view must revoke all privileges from both
     browser-reachable roles. This exists because the hosted Supabase projects grant `ALL` on new
     tables to `anon` and `authenticated` by default and a local reset cannot show that.
   - `scripts/check-schema.sh` and `npm run db:inventory` — a read-only grant/policy inventory,
     run locally *and* in CI so that the check guarding production is not itself unguarded.
   - `scripts/check-layer-guard.sh` — writes deliberate architecture violations, asserts ESLint
     rejects each one, removes them, then greps the domain tree independently. A guard that cannot
     be seen to fail is not a guard.

### 5.6 Edge cases

Detailed in §7.

### 5.7 Basic UI

Three techniques, deliberately layered:

- **Static render** (14 files): `tests/unit/sheet/place-row.test.ts` asserts that an approximate
  pin is visually distinguishable from a matched one *and* that the accessible name survives — the
  half that is easiest to lose, because an `aria-label` replaces a button's content and a glyph
  inside it is then announced nowhere at all. Also `place-detail`, `category-filter-bar`,
  `tag-facet-bar`, `place-list-continuation`, `bottom-nav`, `drawer-view-switch`.
- **Copy and honesty contracts** (source-level): `tests/unit/import/no-places-screen.test.ts` pins
  the three honest cases of the modal screen verbatim against `docs/spec-no-places-found.md`, and
  enforces bans on words that would make the screen sound like an error.
  `tests/unit/import/screen-honesty.test.ts`, `import-error-copy.test.ts`,
  `tests/unit/ui/location-certainty.test.ts` and `caption-quote.test.ts` are the same shape.
- **Real browser**: `tests/e2e/map-accessibility.spec.ts`,
  `tests/e2e/collections-index-is-the-sheet.spec.ts`,
  `tests/e2e/create-menu-searches-your-library.spec.ts`, and the two viewport gate projects, which
  exist because the two device presets Playwright ships (412×839 and 1280×720) are neither of the
  two sizes the design work is specified against (390×844 and 1440×900) — a screenshot taken 22 px
  wide of its criterion is taken at exactly the width where a layout decides its column count.

Accessibility, theme and motion are covered by `tests/unit/ui/` — `announce`, `dark-theme`,
`no-js-dark`, `motion-scale`, `pointer-affordance`, `press-feedback`, `viewport`,
`palette-tokens` — plus `tests/harness/audit-a11y.mjs` and `contrast-render.mjs`.

---

## 6. Permissions, in detail

`docs/03-university-requirements.md` "gaps to watch" item 1 says a **failing** cross-user access
attempt is the strongest evidence available. That is the design principle of all three policy
files, and it is worth being precise about why.

### 6.1 The permission model

Two roles reach the database from a browser:

- **`anon`** — an unauthenticated visitor. Sees the marketing and auth surface only. Holds no
  privilege on any application table and cannot execute any application function.
- **`authenticated`** — a signed-in owner. Exactly one product role; there is no admin, no
  moderator, no tier. Within a shared collection there are three *memberships* — owner, editor,
  viewer — but these are rows, not database roles.

Privileged writes go through `SECURITY DEFINER` functions (`save_place`,
`join_collection_via_token`, `record_place_mention`, `close_place_mention`) rather than through
table grants, so the set of legal writes is a set of function calls rather than a set of columns
the client can choose.

### 6.2 Why "B sees zero rows" is not enough on its own, and what we do instead

An assertion that user B reads zero of user A's rows is satisfied identically by a correct policy
and by a database in which nobody can read anything. It is the single most common way a policy test
suite is vacuously green. Every one of the three files therefore asserts **the positive half first**:

- `0008` P0b — A reads *exactly one* of their own rows through each of six membership-gated tables,
  before any "B sees zero" assertion is reached.
- `0024` C0–C0f — four fixture users are created (owner, editor, viewer, non-member), and the owner
  is shown reading their collection, all three members, one item and all four invites.
- `0031` M0b — a mention is created and read by its owner; the adversary B has a mention of their
  own, so "B sees zero of A's" cannot be satisfied by a blanket deny.

All three files are also **failure-first**: their headers record that every assertion was checked in
both directions against a throwaway database — the control removed, the test *seen to fail* with
the message it prints, the control restored. `0024`'s header names the two that were easiest to
write as always-green and were therefore checked hardest.

### 6.3 What is actually asserted

**`0008_policy_tests.sql` — 85 assertions, the base model.**
The two milestone exit criteria are P1 (B's select of A's `saved_places` returns zero rows) and P2
(a place is invisible to a user who has not saved it). Beyond them: P3, the shared source cache is
membership-gated on both arms; P4, B's writes against A's library affect zero rows; **P4c-i/ii/iii,
provenance cannot be forged** — B cannot write a provenance row carrying A's `user_id`, cannot
attach provenance to a saved place they do not own, and cannot borrow A's source as provenance for
their own save; and P9a–, one behavioural assertion per policy that previously had none.

**`0024_collections_policy_tests.sql` — 43 assertions, sharing.**
Four users, because three is not enough to test sharing. The one that matters most is **C5**: a
collaborator reads the shared place *identity* and **nothing** of the owner's private overlay,
provenance or aliases. Sharing a collection shares a place, not a library. Also: C2 (a non-member
reads zero rows from all four tables), C4 (an editor cannot add a place that is not in their own
library, `42501`), C4b (`added_by` cannot be forged), C6b/C6c (redeeming a lower-privilege token
never downgrades an existing member or the owner), C6d (unknown, revoked and expired tokens fail
*identically*, so a token cannot be probed for existence), C7 (the owner's membership row cannot be
deleted, demoted or duplicated — and C7f asserts the one-owner index holds *even with RLS
bypassed*), C8 (anon holds no grant on any of the four tables and cannot execute any of the seven
functions), and C9a–C9f (the column grants: `owner_id` is not writable by anyone, and an invite
token cannot be chosen by the client because `INSERT` is column-level).

**`0031_place_mentions_policy_tests.sql` — 38 assertions, caption retention.**
Written to a security ruling that states the standard in terms: *"I do not accept 'the policy says
so' as evidence, including from myself."* So every authorisation claim is executed as two real
roles rather than read from `pg_policies`. M7a–M7e are the adversary set; M8a–M8c are the anon set;
M14a/M14b execute the deletion cascade that account deletion relies on; M14c asserts the shared
`sources` row survives with nothing linking it to the departed user.

### 6.4 Application-level permission tests

Authorisation is enforced in the database, but the application must also refuse gracefully rather
than relying on a zero-row result it does not check. `tests/unit/app/actions/saved-places.test.ts`
asserts, for each of the four saved-place mutations, that it refuses without a session and **never
reaches the database**; that it filters on the row id alone and adds no `user_id` filter of its own
— *because RLS turns "not yours" into zero rows rather than an error*, which is a deliberate design
statement written as a test; that it therefore requests an exact count and reports a non-matching
row as gone; and that no Postgres error text ever reaches the browser.

`tests/unit/profile/account-deletion.test.ts` covers the deletion rule, including that the action
takes no user-identifying parameter — a deletion endpoint that accepts a user id is a deletion
endpoint that can delete somebody else.

### 6.5 What was executed, and what was not — see §10.1

`0024` and `0031` were executed in this checkout on 2026-08-31 and passed **43 of 43** and
**38 of 38**. `0031` failed on its first execution, for a reason that turned out to be in the
harness rather than in the product; that investigation and its repair are in §10.1. `0008` could
not be executed here at all, which is the real remaining gap.

---

## 7. Edge cases and invalid inputs

### 7.1 The URL boundary — one text field, therefore an attack surface

`canonicaliseTikTokUrl` is the product's only untrusted-input entry point of consequence: a free
text field whose contents become an outbound HTTP request. It is tested as a security boundary,
default-deny, against a **closed allow-list of six hosts**.

Rejections asserted:

- a host that merely **ends in** `tiktok.com` (`tiktok.com.evil.io`) — the classic suffix trick;
- a host that **contains** `tiktok.com` as a substring;
- **userinfo** in the authority (`https://www.tiktok.com@evil.io/`), which a naive host check reads
  as an allowed host;
- an explicit **port** on an otherwise allowed host;
- **IPv4 and bracketed IPv6 literals** outright;
- any **non-HTTP(S) scheme**;
- and a test asserting the allow-list is *exactly* the six-host closed set, shared with the
  short-link adapter, so the adapter cannot widen it independently.

Acceptances and classifications asserted: eight path shapes (`/@handle/video/`, `/video/`,
`/@handle/photo/`, `/photo/`, `/share/video/`, `m.tiktok.com/v/*.html`, `/embed/`, `/embed/v2/`),
two-letter and language-region locale prefixes, the `tiktokv.com` host that TikTok's own data export
emits, and the rule that **the handle is never inspected** — the post id alone is the identity, so
the same post pasted as a video link and as a photo link deduplicates.

Three edge cases are worth naming individually because each one was a real surprise:

- **A short link that 302s to the homepage and then returns 200.** A dead post that looks alive.
  The canonicaliser deliberately does *not* resolve it; the classification is a `ClassifiedShortLink`
  and the resolution and its failure mode are `resolveShortLink`'s job, tested separately.
- **Photo and carousel posts.** They resolve exactly like a video, verified against a real specimen.
- **A recognised platform is not a malformed link.** An Instagram or YouTube URL yields
  `UNSUPPORTED_HOST`; text that does not parse as a URL yields `MALFORMED_URL`. The test asserts
  these carry **different** codes and are never collapsed, because the product owes the first one a
  redirect to manual add and the second one a different sentence entirely.

`extractPastedUrl` handles what a phone actually puts on the clipboard: TikTok's multi-line share
text, a Hebrew caption around the link, sentence punctuation stuck to the end (dropped) versus a
trailing slash (kept), and the first link rather than the most TikTok-looking one. Its last test
asserts it **cannot widen the host allow-list** — every extraction still passes through the
boundary above.

### 7.2 The model output boundary

The model is the second untrusted input, and it is untrusted in a different way: it is
well-intentioned and wrong. `tests/unit/extraction/schema.test.ts` (638 lines) asserts:

- the **zero-candidate response is accepted** — explicitly annotated as "the modal case";
- a candidate list **beyond the 12-cap is rejected**, and `MAX_CANDIDATES = 8` is enforced by the
  pipeline separately, with the surplus shown as capped rather than silently dropped;
- an **open-vocabulary category hint is rejected** — the model may not invent a category;
- **`null` coordinates are accepted** and required to be *present*: "no basis for a guess" is a
  value, not a missing field. There are no optional properties in this schema, because an absent
  field and an explicit null are different claims;
- an **out-of-range latitude** is rejected;
- **NFKC-aware length bounds** — a value that fits raw but not once normalised is refused, on names,
  tags, dishes, `whyGo` and addresses. This closes the trick of padding a field with 18× code points
  or vulgar fractions;
- a `whyGo` **with no citation** is rejected, and a v1-shaped candidate is rejected outright rather
  than having the new fields defaulted;
- **an over-long quote is clipped, not fatal** — the candidate survives, the quote is clipped to a
  prefix so it is still verbatim, and grounding still passes;
- the **schema version is welded into the extraction cache key**, so a schema change cannot serve
  stale extractions of the previous shape.

`partial-parse.test.ts` handles truncation: real recorded model output — the largest response in the
corpus — cut mid-array, salvaged down to the candidates that did parse. `stop-reason.test.ts` covers
the adapter's handling of a max-tokens stop. `grounding.test.ts` and `plausibility.test.ts` are the
F3 guard: a candidate the caption does not support is discarded rather than saved with a shrug.

### 7.3 The failure-handler boundary

`describe-cause-hostile-input.test.ts` is an unusual test and earns its place. `describeCause` runs
*inside* the failure handler, reading `.message`, `.code`, `.name`, `.cause` and `issue.path` off an
object it did not construct. A throw there replaces an honest 4xx with an unhandled 500. The test
feeds it adversarial shapes that nothing on the real paths produces — among them a `Proxy` whose
`get` and `has` traps both throw — precisely because the handler must be total, and keeps the
already-handled shapes (a self-referential `cause` chain) beside them so a hardening fix cannot
regress them.

### 7.4 Resolution and matching edge cases

`tests/unit/places/benchmark-golden.test.ts` (998 lines) replays a 44-case, 220-row golden file and
asserts band-for-band agreement with the recorded measurement — 24 preselect / 17 confirm /
3 no-match under the current weights — plus, and this is the assertion that matters, **zero false
auto-accepts**: nothing is auto-accepted that the human adjudication did not call correct, and all
three captions that name no venue are routed away from auto-accept. It also asserts that the
benchmark **never exercises the single-candidate margin**, so it does not silently claim coverage it
does not have.

Supporting: `jaro-winkler.test.ts`, `normalise.test.ts` and `normalise-sample.test.ts` (Hebrew and
Latin), `country-code.test.ts`, `taxonomy.test.ts`, `taxonomy-migration.test.ts`,
`clusters.test.ts`, `display-name.test.ts`.

### 7.5 State and timing edge cases

Zero places (`tests/unit/map/zero-state-first-screen.test.ts`, `zero-state-region.test.ts`), a
library spanning two continents (`camera-library-shapes.test.ts`,
`tests/unit/map/library-shapes.ts`), a replayed camera framing surviving a resize
(`framing-replay.test.ts`, `framing-stability.test.ts`), one result collapsing the review screen
(`one-result-collapse.test.ts`), a capped candidate list arriving (`capped-candidate-arrival.test.ts`),
a resolver timing out versus failing (`pipeline.test.ts`, `degraded-resolution.test.ts`), a stale
response arriving after the user changed the link (`tests/e2e/import-cancel-stale-response.spec.ts`),
and reduced-motion (`tests/unit/import/reduced-motion.test.ts`,
`tests/harness/reduced-motion-rail.mjs`).

---

## 8. What is deliberately not tested, and why

Each of these is a decision with a reason, not an omission.

1. **The model's output quality is not asserted, only its shape and its grounding.** A test that
   pinned "this caption yields this venue name" would be pinning a third party's non-deterministic
   behaviour, and would fail on a model update that was an improvement. What *is* pinned is the
   contract: valid shape, grounded in the caption, within the caps. Quality is measured instead —
   `tests/manual/tiktok-recognition.manual.ts` scores a corpus and produces a number, and
   `docs/evidence/extraction/` holds the results.

2. **Live third-party calls are not in the automated suite.** TikTok's oEmbed endpoint, Google
   Places and the LLM are exercised only by `tests/manual/*.manual.ts`. Three reasons, in order:
   money (every CI run would spend real provider budget against a daily ceiling), flakiness (a
   third-party outage would turn a green suite red for a reason unrelated to any change), and
   correctness of signal (a test that fails when a vendor is down does not tell you anything about
   your code). Every one of those seams is mocked in the unit tier and driven for real, by hand,
   with the evidence written down.

3. **Visual appearance is not asserted.** No screenshot comparison, no visual regression baseline.
   A static markup string has no layout, and a pixel baseline on a product mid-facelift would be
   re-approved on nearly every commit, which is the same as having no baseline while paying for
   one. Instead: the two gate viewport projects assert the *measurement conditions* are right, and
   `tests/harness/capture-screens.mjs`, `contrast-render.mjs` and `measure-clipping.mjs` produce
   artefacts a human judges. `tests/manual/drive-app-both-breakpoints.mjs` additionally dumps what
   a screen reader would announce, because a screenshot cannot prove an *absence* and the text dump
   can.

4. **Performance is not asserted as a pass/fail gate.** `measure-sheet-fps.mjs`,
   `measure-arrival.mjs` and `measure-motion.mjs` measure; nothing fails a build on a frame budget.
   A frame-rate assertion on shared CI hardware is a flake generator, and this product's
   performance risk is a slow provider call, which is a timeout question and *is* tested.

5. **Load and concurrency are not tested.** The product's realistic near-term scale is tens of
   users. Building a load harness for that would be effort spent proving something the architecture
   already makes obvious. `docs/scale.md` is where that reasoning belongs; it is a scale document,
   not a scale test.

6. **The unbuilt streaming route is not tested.** `L0-F6` does not exist;
   `/api/imports/probe` is a request/response stand-in. Writing tests against an unbuilt design
   would produce a suite that describes a product we do not have.

7. **Supabase Auth's own correctness is not re-tested.** We test that *our* code refuses without a
   session and that RLS scopes rows by `auth.uid()`. We do not test that Supabase issues correct
   JWTs; that is the vendor's suite, and duplicating it would be the least valuable test in the
   repository.

8. **Trivial code is not covered.** There is no coverage threshold in `vitest.config.ts`, and that
   is deliberate: a percentage target moves effort towards whatever is cheapest to cover, which is
   never the seam that breaks. The distribution in §4 is the intended shape — depth where the
   product's value and its risk are, and nothing at all on a re-exported constant.

---

## 9. How every layer is run

| | Command | Where it runs |
|---|---|---|
| Unit | `npm run test` (`vitest run`) | Locally and in the CI `verify` job |
| Full local gate | `npm run verify` — lint, typecheck, layer guard, migration grants, schema inventory, agent config, Claude config, unit | Locally; the CI `verify` job runs the same eight steps |
| End-to-end | `npm run test:e2e` (`playwright test`) | The CI `playwright` job; locally with a dev server and `E2E_PASSWORD` |
| Database policy | `npm run db:test` → `db:test:0008 && db:test:0024 && db:test:0031` | The CI `database` job, after `supabase start` and a `--no-seed` reset from migration `0001` |
| Schema inventory | `npm run db:inventory`, `db:inventory:staging`, `db:inventory:prod` | CI, and by hand against hosted environments |
| Manual | `node tests/manual/<driver>` | By hand, evidence written to `docs/evidence/` |

`.github/workflows/ci.yml` defines four jobs — `lint · typecheck · layer guard · unit`,
`next build`, `playwright`, and `migrations · RLS policy tests`. The `database` job rebuilds the
whole schema from migration `0001` on every run, with `--no-seed`, because that reproducibility is
itself the acceptance test for the migration set, and because `0008`'s assertions count all rows in
a table and would be wrong against seeded fixtures.

Two guards deserve naming as tests in their own right, since they are the tests of things that have
nothing else to execute: `scripts/check-agents.sh` and `scripts/check-claude-config.sh`. The second
one caught a real failure on 2026-08-30 — `core.hooksPath` was unset and `.git/hooks/` did not
exist, so the only mechanism refusing a direct push to `main` was dead code.

---

## 10. Known gaps, stated honestly

An examiner who finds one of these unaided should not be finding it for the first time.

### 10.1 One third of the database policy suite still cannot be run in this checkout

Executed on 2026-08-31 against the local Supabase container, and re-run after the repair below:

- **`0024_collections_policy_tests.sql` — passes.** Exit 0, **43 of 43**, transaction rolled back.
- **`0031_place_mentions_policy_tests.sql` — passes.** Exit 0, **38 of 38**. It did **not** on its
  first execution, and the defect and its repair are worth recording because they are a good
  example of a test failing for a reason that is not the product's:

  > The file aborted at section M9 with `permission denied for table places`, having passed 26 of
  > 38. `places_alias_required` is a **deferred constraint trigger**, and
  > `assert_place_has_alias()` is not `SECURITY DEFINER`, so it runs at `COMMIT` — or at the first
  > `set constraints all immediate` later in the transaction — **with the privileges of whatever
  > role is in effect at that moment**. The fixture places are created by the privileged role at
  > the top of the file, and the first discharge in the file was issued while impersonating
  > `authenticated`, which cannot read `places.merged_into_place_id` (migration `0012` withholds
  > that column under a column-level grant). The repair discharges the fixture's own deferred
  > events immediately after the fixtures are created, as the privileged role, and leaves the
  > later discharges where they were. **37 lines added, none removed, no assertion changed.**

  It was checked against the product before it was treated as a harness bug, by execution rather
  than by reading the catalogue: `resolve_place` is the only function in `public` whose body
  inserts into `places`; `authenticated` holds no `EXECUTE` on it (the call is refused with
  `permission denied for function resolve_place`) and no `INSERT` on the table; the real path
  inserts and commits as `service_role`, which holds the grant, and discharges the trigger
  cleanly; and no application code switches roles inside a transaction. So no transaction
  `authenticated` can start ever inserts a `places` row, and the failing state is unreachable from
  the product.

  **One standing hazard came out of that investigation and is recorded here because nothing else
  records it.** `SECURITY DEFINER` does *not* protect a deferred trigger: the queued event runs
  under the role in effect at discharge, not the role that queued it. Demonstrated directly — an
  insert performed inside `resolve_place` still failed when the discharge happened under
  `authenticated`. The only thing separating that from a live production defect is that
  `authenticated` cannot execute `resolve_place`. A migration that granted it would turn every
  place-creating save into a failure at `COMMIT`, which is the worst place to discover one. The
  reasoning is written at the fix site in the test file so that it is found by whoever next edits
  it.

- **`0008_policy_tests.sql` — still not executed.** It requires an **empty** database (several of
  its older assertions count all rows in a table) and aborts at its own setup guard on the shared
  local database, which holds real data. Emptying it means `npm run db:reset`, which
  `docs/agent-guardrails.md` §6 forbids: one local database is shared across the whole team and a
  reset destroys evidence other people have not yet reported. CI is the only place this file runs
  — and see §10.2.

**Net position: 81 of the 166 permission assertions were executed here and passed, across two of
the three files. The remaining 85 — the whole of `0008`, which carries the two milestone exit
criteria P1 and P2 — could not be executed in this checkout at all.**

### 10.2 No suite has run in CI since 2026-08-29

Measured 2026-08-31 with `gh run list` / `gh run view`:

- Last successful workflow run: **2026-08-29 21:36 UTC**.
- **70 consecutive failures** since.
- Shape of every one: all four jobs report `steps: 0`, start and finish 2–3 seconds apart, no logs
  and no annotations.

A job that fails in two seconds having executed no steps never started. This is an account-level
GitHub Actions problem — most plausibly an exhausted minutes allowance on a private repository —
not a code failure, and no change to `ci.yml` addresses it. The consequence for this document is
blunt and must not be glossed: **every automated result reported here for the unit tier was
produced locally, and the end-to-end and database jobs have not run anywhere for two days.**

### 10.3 The e2e job's history, and why it is not yet proven

Until 2026-08-30 the `playwright` job set no `E2E_PASSWORD` and started no Supabase, so every
signed-in spec hit its `test.skip` guard: **28 of 34 tests skipped and the check reported green**
over four signed-out tests. The map, the place sheet, the import happy path, the failure screens,
double-submit, stale-response cancellation and the accessibility guard had never run in CI, and a
green tick had been claiming they did.

`tests/e2e/global-setup.ts` was written to make that impossible — it distinguishes a local run
(skipping is fine), CI against a deployment (skipping is correct, since the seeded demo user does
not exist on a hosted project), and CI driving our own build (skipping is a misconfigured job and
the only honest outcome is a failure). It was itself dead code, because `playwright.config.ts` had
no `globalSetup` key. **The key is present now**, at `playwright.config.ts:9`.

Two things follow, and both are unproven:

- Of the 56 tests Playwright lists, **46 are behind the signed-in guard** (23 of the 26 tests in
  each browser project). Only 10 — three smoke tests per project, plus the four viewport-gate tests
  — run without credentials.
- **The `e2e` job in `.github/workflows/ci.yml` still does not stand up a Supabase and still does
  not set `E2E_PASSWORD`.** Its steps are checkout, setup-node, `npm ci`, the image-version check,
  `npm run test:e2e`, and an artefact upload. Since GitHub Actions sets `CI` and no
  `PLAYWRIGHT_BASE_URL` is provided, `globalSetup` will **throw**, and the job will fail. That is
  the guard behaving exactly as designed — a red job instead of a green lie — but it means the
  workflow needs the three missing steps before the e2e tier can be green again. Amending
  `ci.yml` is the orchestrator's to land, not this document's.

Until a runner starts and that job is fixed, **the honest statement about the end-to-end tier is
that it has never been demonstrated green with credentials in CI.** It runs locally.

### 10.4 Methodological weaknesses inside the suite itself

- **57 of the 165 unit files assert against source text** read with `readFileSync`. This is a
  legitimate way to prove an *absence* — that a screen contains no forbidden word, that a module
  imports nothing from a layer it must not touch — and several of them exist because there is no
  other way to check a ban. But a source-text assertion proves the code *says* something, not that
  the running application *does* it. A refactor that moves a string into a constants file breaks
  such a test without breaking the product, and, more importantly, a change that keeps the string
  and breaks the behaviour passes it.
- **No component test is evidence about layout, size or contrast**, for the reason in §3.2.
- **The known-defective error copy is not yet pinned by a failing test.** A TikTok connect timeout
  is still reported to the user as "this share link has expired" (`docs/current-state.md` item 10).
  That is failure mode F9, it is known, and the correct next step is a failing test at the copy
  boundary before the fix.
- **One `Framing` code path is on `main`, is in production, is load-bearing and is covered by no
  test** — the `{ kind: 'user' }` arm in `src/components/map/map-surface.mapcn.tsx`, declared in the
  union at line 307 and assigned at line 964. It is the only thing that retires a replayed framing,
  it is produced in one place and consumed in one place, and it sits directly under an open camera
  defect.
- **A fifth, unmirrored copy of `PEEK_PX`** is hard-coded as a Tailwind arbitrary value in
  `src/components/map/map-surface.mapcn.tsx` — `bottom-[calc(128px+…)]` on the zoom-control column.
  `src/components/shell/sheet-geometry.ts` declares `PEEK_PX = 128` and documents four mirrors, and
  `tests/unit/shell/sheet-geometry.test.ts` pins those four; this one imports nothing and no test
  sees it. Move the peek and the zoom controls drift off the sheet silently.

### 10.5 What no automated test in this repository can tell you

That the map opens somewhere useful. That a Hebrew and a Latin tag chip sit together correctly.
That a 14 px dashed circle reads as "not exact" to a person. That an import which saved eight
correct rows while the camera sat on another continent is broken. These are why
`docs/working-agreement.md` §2 requires running the actual application and inspecting the persisted
rows before anything is called done, and why `tests/manual/` exists with its findings written into
its own file headers rather than discarded.

---

## 11. Traceability to the course requirements

| M6 category | Where it is answered | Executed? |
|---|---|---|
| Core features | §5.1 | Yes — 2,746 unit tests pass locally |
| Invalid inputs | §5.2, §7.1–§7.3 | Yes |
| Central business processes | §5.3 | Unit tier yes; e2e tier locally only (§10.3) |
| Permissions | §6 | Partly — 81 of 166 assertions executed and passing; 85 (all of `0008`) not executable in this checkout (§10.1) |
| The database | §5.5 | Static gates yes; policy suite partly (§10.1) |
| Edge cases | §5.6, §7 | Yes |
| Basic UI | §5.7 | Static and source tiers yes; browser tier locally only |
| *"Define what working means"* | §2 | — |

**M7, implemented tests:** `tests/unit/` (165 files), `tests/e2e/` (13 specs),
`supabase/tests/` (3 policy files), `tests/manual/` (21 documented drivers), `scripts/check-*.sh`
(5 gates), wired into `.github/workflows/ci.yml` as four jobs.
