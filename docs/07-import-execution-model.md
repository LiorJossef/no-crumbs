# 07 — Import Execution Model (D3)

> Owner: Next.js / TypeScript Architect. Date: **2026-08-18**. Status: **DECIDED**.
> Inputs: [`00-project-charter.md`](00-project-charter.md) §3/§5, [`02-risks-and-unknowns.md`](02-risks-and-unknowns.md) §A3,
> [`03-university-requirements.md`](03-university-requirements.md) M3/M4/M8/M11,
> [`04-tiktok-feasibility.md`](04-tiktok-feasibility.md) (measured, VERIFIED), [`ux-architecture.md`](ux-architecture.md) §3, §4.7, §5.
> Resolves: **D3**. Opens and resolves: **D12 — map shell and route topology** (§11).
> Labels: **VERIFIED** = we measured it · **DOCUMENTED** = vendor docs read on a stated date, not
> measured by us · **ASSUMED** = reasoned, untested.

## 0. Decision in one paragraph

The whole pipeline fits inside one HTTP request with two orders of magnitude of headroom, so there is
**no job queue, no worker, no background runner, no Realtime channel and no Edge function.** The
import is **one `POST /api/imports` Route Handler on the Node runtime that streams NDJSON stage
events back to the client**, writing its progress and its result into two Postgres tables as it goes.
Those tables are not a queue — nothing polls them for work — they are the *record* of the import, and
they buy us four things we need anyway: idempotency on the numeric TikTok video id, a cross-user
source cache, refresh-safe resumption of the review screen (UX §4.7), and free latency telemetry for
the scale document. Resumption after a dropped connection works by **re-executing the pipeline over
already-cached stage outputs**, not by a background worker finishing the job. UX gets its real
three-stage rail *and* the real `Matching locations… 2 of 3` counter; nothing is simulated.

---

## 1. The latency budget we are designing against

| Stage | Mechanism | Measured / estimated | Label |
|---|---|---|---|
| A1 short-link resolution (only for `vm.`/`vt.`/`/t/`) | 1–2 `redirect:'manual'` hops, headers only | ~1 extra hop, no HTML parsed | **VERIFIED** (04 §E3) |
| A2 source acquisition | TikTok public oEmbed, GET, no auth, no key | **p50 511 ms, p90 626 ms, max 938 ms, cold 1.08 s** | **VERIFIED** (04 §E5/E6) |
| B place extraction | one small structured-output LLM call | 1.5–5 s | ASSUMED |
| C place resolution | N provider lookups, N = 1–7, parallel, capped | 200–600 ms each, ~1 wave | ASSUMED |
| — | **end to end** | **~3–8 s typical; ~15 s bad day** | ASSUMED |

Two properties of the measured data matter more than the numbers:

1. **No rate limiting was observed** at 40 sequential + 30 concurrent from one IP, and there are no
   `429`/`retry-after`/`x-ratelimit-*` headers to react to. So concurrency control is *ours* to
   impose, and there is nothing upstream that a queue would be politely draining into.
2. **Every oEmbed failure is one opaque `{"message":"Something went wrong","code":400}`.** After our
   own pre-fetch validation there is exactly **one** honest error state. A retry mechanism cannot be
   smarter than "try again", which makes elaborate retry infrastructure worthless here.

## 2. Vercel execution limits

**Finding: the pipeline fits inside a single Vercel Function invocation with enormous headroom, on
the free Hobby plan.**

| | Default max duration | Max | Extended |
|---|---|---|---|
| Hobby | 300 s | 300 s | — |
| Pro | 300 s | 800 s | 1800 s (beta, per-function) |

- Fluid compute is **enabled by default for new projects**, and these are the fluid-compute numbers.
  The old 10 s Hobby / 60 s Pro figures that circulate in blog posts are the pre-fluid legacy limits
  and do not apply to a project created today. Label: **DOCUMENTED** — `vercel.com/docs/functions/limitations`
  and `/docs/functions/configuring-functions/duration`, both `last_updated: 2026-07-01`, read
  2026-08-18; plus the 2025-06-25 changelog "Higher defaults and limits for Vercel Functions running
  Fluid compute".
- **Max duration includes time spent streaming the response.** Streaming does not extend or shorten
  the limit; there is no separate streaming cap on the Node runtime.
- The **25 s first-byte rule applies only to the Edge runtime** (must begin responding within 25 s,
  then may stream up to 300 s). We are on `runtime = 'nodejs'`, so it does not apply to us. This is
  one more reason not to use Edge.
- Request/response body cap **4.5 MB** — irrelevant; our largest payload is a caption plus ≤7
  candidates, single-digit KB.
- Concurrency auto-scales to 30 000 on Hobby. Irrelevant at our scale, but it means a slow import
  never blocks another user's import.
- Vercel docs note that for long-lived HTTP/1.1 connections, intermediaries may close an **idle**
  response, and recommend streaming progress or heartbeat data. We do exactly that (§5), so this is
  designed for rather than discovered later.

**Plan we assume: Hobby.** 300 s against a ~8 s pipeline is a 37× margin. Pro is not required by this
decision and must not be silently assumed by any other document.

**Our declared limit: `export const maxDuration = 60`.** Not 300. We *choose* a ceiling an order of
magnitude below the platform's so a runaway import dies quickly and visibly, and so the number in the
code is a statement of intent rather than an inherited default. Our own server-side deadline is 25 s
(§7); 60 s is the outer fence that catches bugs, not a budget.

> **Residual risk, and its 20-minute retirement.** The limits above are DOCUMENTED, not VERIFIED. The
> TikTok Vercel-egress probe already scheduled in 04 §6 must, in the same deployment, also assert
> that (a) a Node route handler streams incrementally rather than buffering, and (b) a 30 s handler
> completes on Hobby. Commit as `docs/evidence/vercel/07a-stream-and-duration-probe.json`. Until then
> the *fallback* is not a redesign: it is lowering `maxDuration`, because the mechanism in §4 works
> identically at any limit above ~15 s.

---

## 3. Options considered

The 3–8 s wait is the axis everything turns on. "How does it handle the wait" is scored against
whether the mechanism can (i) survive the wait at all, (ii) report the **three real stages** UX §3
requires, (iii) survive the user navigating away, and (iv) be explained by a student in an exam.

| Option | 3–8 s wait | Real staged progress | Navigate away / dropped connection | Retry & idempotency | Observability | Explain in an exam | Verdict |
|---|---|---|---|---|---|---|---|
| **1. Server Action, single return value** | Fine (300 s limit) | **No.** One value at one time. Forces UX's pre-authorised degrade to one honest stage | Result is lost; nothing persisted unless we add it | Server Actions are POSTs; a double-submit runs the pipeline twice unless we add a key | Whatever we log; no per-stage timing surface | **Easiest.** "It's a function on the server the form calls" | **Rejected** — costs the rail for nothing |
| **2. Server Action returning a stream** (async generator / `createStreamableValue`-style RSC streaming) | Fine | **Yes**, real events | Same as 1 — abandoning the render kills it | Same as 1 | Same as 1 | **Hardest.** Requires explaining the RSC wire protocol, promise-in-payload serialisation, and a library whose API has churned. A student asked "how does the progress get to the browser?" must answer with React internals | **Rejected** — the cleverest option, the worst under M11 |
| **3. Route Handler + client `fetch`, single JSON response** | Fine | **No.** Same degrade as 1 | Result lost unless persisted | Trivial to add an idempotency rule | Normal HTTP logs | Very easy | **Runner-up.** Strictly a subset of 4 |
| **4. Route Handler streaming NDJSON (chosen)** | Fine; the connection is *productive*, not idle | **Yes**, and per-candidate `2 of 3` as well | Stream dies; the persisted row is the recovery point (§6) | Video-id key + get-or-create row | Stage timings written to the row; one log line per stage | **Easy.** "One POST whose reply arrives in pieces; each piece is one JSON line saying which stage finished" | **CHOSEN** |
| 4b. Same but `text/event-stream` (SSE) | Same | Same | Same | Same | Same | Slightly harder: `EventSource` cannot POST, so we would use `fetch` anyway and gain only a wire format with framing rules to explain | Rejected as a needless dialect |
| **5. Job row in Postgres + client polling every 600 ms** | Fine | **Yes** | **Best.** Fully connection-independent | Same key; plus a natural resume | Same row | Easy, and *familiar* | **Rejected for V1 as the primary path** — it needs a runner (who executes the job after the POST returns? Vercel gives no post-response execution on Hobby without a cron or a self-invoking fetch, both of which are the queue we refused to earn), and it converts one request into ~12 extra requests per import for progress we already have in-band. **Its persistence half is adopted** (§6) |
| 6. Supabase Edge Function (Deno) | Fine | Yes, if we then add polling/Realtime | Same as 5 | Same | Split across two providers' logs | **Poor.** A second runtime, a second deploy target, a second secret store, no shared TypeScript domain types, CORS and JWT plumbing to explain — for zero capability we lack | **Rejected** |
| 7. Supabase Realtime for progress | Fine | Yes | Good | Same | Adds a websocket to debug | **Poor-to-medium.** Earns its place only when work happens *outside* the request. It does not. Adds a client subscription, RLS-on-realtime reasoning, and a reconnect path to replace one open response we already have | **Rejected for V1**; named as the upgrade path in §12 |

Two structural observations that decided it:

- **Options 5, 6 and 7 all exist to decouple the work from the request.** Nothing in the measured
  data asks for that decoupling. A 300 s limit against an 8 s pipeline means the request is a
  perfectly good place to do the work, and the request is the only place where the browser is
  *already listening*.
- The only thing options 5/7 genuinely add over 4 is survival of a dropped connection. §6 buys that
  for the price of two tables we need for UX §4.7 regardless — without a runner, a poller or a
  socket.

## 4. Decision D3a — mechanism

> **The import executes synchronously inside `POST /api/imports`, a Next.js App Router Route Handler
> on the Node runtime, which returns `application/x-ndjson` and writes one JSON line per real
> pipeline event. `maxDuration = 60`. No queue, no worker, no cron, no Realtime, no Edge.**

Why, in the order the reasons actually matter:

1. **It fits.** 8 s typical, 25 s self-imposed deadline, 300 s platform limit. Asynchrony would be
   solving a problem we measured and did not find.
2. **It is the only option that gives UX its rail without inventing infrastructure.** The stage
   events are a by-product of the pipeline already having named stages (charter §3).
3. **It has one moving part.** Under M11/R1 the student must defend every component. This mechanism
   is one file, one HTTP verb, one content type.
4. **The response body is a typed union**, so the client's state machine and the server's emitter are
   checked against the same `ImportEvent` type at compile time.
5. **Fluid compute bills active CPU, not wall-clock I/O wait.** A function parked on an LLM call is
   nearly free, which removes the cost argument for offloading.

### Answer to UX question 1 (staged progress) — **mechanism (a), fully, no degrade**

- The three-stage rail is **real**. Each stage emits `started` and `done` events from the server at
  the moment the stage actually starts and finishes.
- Each stage settles into a **fact**, supplied by the server, not a status string: `Read @handle's
  TikTok` (from `author_unique_id`, which is the authoritative handle — never the URL's),
  `3 places found`, `Ready to check`.
- **`Matching locations… 2 of 3` (UX C18) is also real.** Resolution emits one `candidate` event per
  candidate as it settles, with `index` and `total`. The denominator is known the instant extraction
  returns, so the counter never guesses.
- **The 450 ms minimum dwell and the 900 ms presentation cap are client-side pacing of real events**,
  not fabricated progress. The client buffers received events and releases them to the rail on a
  minimum-dwell schedule. If the server is faster than the rail, the rail plays a true history
  slightly late. If the server is slower, the rail waits on truth. It never advances without an
  event. This satisfies UX §3.1 rule 4 without violating rule 3.
- **The 20 s client hard stop is inside the platform limit**, so UX §3.4 stands as written: it is a
  *presentation* timeout, `Keep waiting` re-attaches to the live import via §6, and the server's own
  25 s deadline is the real one. UX does not need to lower 20 s.
- Cost of this answer: zero degrade. UX's fallback §3.2(b) is **not** used. Delete the
  `[NEEDS D3]` blocker on that section.

### Not chosen, deliberately

We do **not** stream partial *review UI* via RSC. Candidates arrive as data in the stream and the
review surface renders once, on completion. Streaming a progressively-materialising review list would
fight UX §4's "arrives as a result, not a loading list" and adds a second streaming concept.

---

## 5. The chosen flow

```
BROWSER                          ROUTE HANDLER (app layer)                DOMAIN                        INTEGRATIONS
  |                                       |                                  |                              |
  | paste; client-side URL parse (<16ms)  |                                  |                              |
  | F2 paints from client state NOW ------|                                  |                              |
  |--POST /api/imports {rawInput}-------->|                                  |                              |
  |                                       | auth (Supabase session)          |                              |
  |                                       | rate limit (per user)            |                              |
  |                                       |--canonicaliseTikTokUrl(raw)----->| pure; no network             |
  |                                       |<--{ videoId } | DomainError------|                              |
  |                                       | getOrCreateImport(user, videoId) |                              |
  |<--200 application/x-ndjson------------|  (idempotency, §6)               |                              |
  |<--{"t":"accepted","importId":...}-----|                                  |                              |
  |                                       |--runImport(ports, input, ctx)--->|                              |
  |<--{"t":"stage","stage":"source",...}--|<---------emit--------------------| A. SourceAdapter.fetch ----->| cache? -> oEmbed
  |   rail: Reading the TikTok…           |                                  | ContentExtractor.extract     |
  |<--{"t":"stage",...,"status":"done",   |                                  |                              |
  |     "fact":{"authorHandle":"x"}}------|                                  |                              |
  |<--{"t":"heartbeat"} every 2s----------|                                  |                              |
  |<--stage extract started---------------|                                  | B. PlaceExtractor.extract -->| LLM (structured)
  |   rail: Finding the places…           |                                  |    Zod-parse output          |
  |<--stage extract done {candidates:3}---|                                  |                              |
  |<--stage resolve started---------------|                                  | C. PlaceResolver.resolve --->| places provider
  |<--{"t":"candidate","index":1,"total":3}                                  |    (parallel, capped 7,      |   xN
  |<--{"t":"candidate","index":2,...}-----|                                  |     conc. 4, per-call 3s)    |
  |<--{"t":"candidate","index":3,...}-----|                                  |                              |
  |                                       |  persist outcome + stage timings |                              |
  |<--{"t":"done","outcome":{...}}--------|                                  |                              |
  | F6 handoff -> review (client route change; map never remounts, §11)      |                              |
  |                                                                          |                              |
  | user confirms selection                                                  |                              |
  |--server action confirmImport(importId, selection)---------------------->  D. dedup + insert (fast, <300ms)
```

Notes on the diagram:

- **F2 never waits on the network.** The client paints the accepted state on submit; the first server
  line typically lands in <100 ms and the first stage fact in ~600 ms.
- **Confirmation is a Server Action, not part of the stream.** It is a short, transactional mutation
  with a redirect — precisely what Server Actions are good at, and it gives the course's M3
  requirement both a route handler *and* a server action with a principled reason for each: *streamed
  long-running read-and-compute → route handler; short authenticated mutation → server action.*
- **Heartbeats every 2 s** keep the response non-idle (Vercel's HTTP/1.1 note) and give the client a
  liveness signal distinct from "stage still running".

---

## 6. Decision D3b — persistence, idempotency, caching, resumption

Two tables. Neither is a queue: **no process ever selects rows to work on.**

> **Naming note (added by the MS1–MS4 audit).** The sketch below is the original D3 proposal. The
> shipped schema reconciles it: the post id is `platform_source_id` in SQL / `Source.externalId` in
> TypeScript (technical-design §14 R1), the six statuses are
> `processing · review · no_places · completed · failed · cancelled` (R2), `source_id` is `NOT NULL`
> with a pending row written at canonicalisation time (R4), and the idempotency index is on
> `(user_id, source_id)` (R5). Where this section and `0003_sources.sql` differ, **the migration is
> authoritative**; the rules in this section are unaffected by the rename.

```sql
-- global, cross-user, one row per TikTok post
sources (
  id uuid pk,
  platform text not null default 'tiktok',
  external_id text not null,            -- the numeric video id; identity (04 §6)
  canonical_url text not null,          -- rebuilt from author_unique_id, never from user input
  author_handle text, author_name text,
  caption text,                         -- see privacy note below
  thumbnail_url text,                   -- signed, ~6mo expiry: never treated as permanent
  fetched_at timestamptz not null,
  unique (platform, external_id)
);

-- per user, per import attempt
imports (
  id uuid pk,
  user_id uuid not null references auth.users,
  source_id uuid references sources,     -- null while A has not completed
  external_id text not null,             -- known before A; the idempotency key with user_id
  status text not null,                  -- 'running' | 'ready' | 'no_places' | 'failed' | 'confirmed' | 'abandoned'
  stage text not null,                   -- 'source' | 'extract' | 'resolve' | 'done'
  error_code text,                       -- closed set, §9
  degraded_code text,                    -- e.g. PLACE_PROVIDER_UNAVAILABLE, §8
  candidates jsonb,                      -- Candidate[] incl. unresolved ones; Zod-validated on read
  extractor_version text, prompt_version text,
  ms_source int, ms_extract int, ms_resolve int,
  created_at timestamptz, updated_at timestamptz, expires_at timestamptz  -- created_at + 24h
);
create unique index imports_open_one_per_source
  on imports (user_id, external_id) where status in ('running','ready','no_places','failed');
```

RLS: `imports` is user-owned and selectable only by its owner. **`sources` has no user-facing select
policy at all** — it is read exclusively by server-side domain code through the service path, and the
caption never reaches a browser except as extracted place names on the user's own import. That keeps
the cross-user cache from becoming a cross-user read.

### Idempotency rules (the video id is the key — there is no client-supplied idempotency token)

| Situation | Rule |
|---|---|
| Same user, same video, an open import exists (`running`/`ready`/`no_places`/`failed`, <24 h) | **Return that import.** `accepted` event carries `idempotent:true`. If `ready`, the handler replays the terminal state as events and closes — the rail plays instantly and the user lands in review. If `running` (a second tab, or a reconnect), the handler **re-drives from the last completed stage over cached outputs** (below) rather than starting a duplicate pipeline |
| Same user, same video, already `confirmed` | No new import. Terminal event `{t:'done', outcome:{kind:'already_saved', placeIds}}` → UI navigates to the saved place(s). Charter §3 invariant 4 (one row per physical place) is satisfied at the *place* layer regardless, but not re-running the pipeline is the cheap correct behaviour |
| Same user, double-submit / double-click | Same as row 1. The unique partial index makes the race safe: the loser of `insert … on conflict do nothing` re-selects the winner's row |
| **Different user, same video** | A **new `imports` row** (the library entry is per user), but stage A is a **cache hit on `sources`** and stage B is a cache hit on the stored extraction if `extractor_version` and `prompt_version` match. Cost of the second user's import: ~0 upstream calls, ~0 LLM tokens, and resolution may also hit the lookup cache. Latency drops from ~5 s to well under 1 s |
| Retry after `failed` | Reuses the same import row (status back to `running`), increments an attempt counter, and counts against the per-user rate limit. Matches UX §5.1's retry-demotion behaviour |

**Yes, V1 caches and reuses source content across users.** It is the single largest cost and latency
lever available, it is three lines of code (`select … where external_id = $1`), it makes the demo's
second run instant, and it is the honest answer to "every oEmbed response is `cache-control:
no-store`, so we must cache ourselves" (04 §6). Freshness: a `sources` row older than **30 days** is
refetched on next use; captions do not change meaningfully and a stale author handle is corrected on
refetch. **Dependency flagged:** 04 §8 Q4 asks security-privacy whether we may store the caption at
all. If the ruling is no, the cache degrades to storing only `author_handle`, `external_id` and the
*extracted candidate names* — the seam and every rule above are unchanged, only the TTL and the
column set move. Nothing in this decision depends on the answer.

Provider-lookup caching (`place_lookups`, keyed on a hash of normalised query + city hint) is
**deferred to D2**, because some providers' terms forbid caching place payloads while permitting
storage of an opaque place id. The `PlaceResolver` port is where that cache goes if permitted; the
domain does not know whether it exists.

### Resumption without a worker (answers UX §4.7)

Each stage writes its output before the next begins: A writes `sources` + `source_id`, B writes
`candidates` + `stage='resolve'`, C writes the final `candidates` + `status`. Therefore:

- **Client navigates away, refreshes, or the connection drops.** On return to `/import/[importId]`
  (or on `Keep waiting`), the client re-`POST`s / `GET`s and the handler resumes: cached stage
  outputs are reused, only the unfinished stage re-runs. Worst case we repeat one LLM call.
- **We do not claim the function survives the disconnect.** Vercel may terminate a handler whose
  client is gone. Resumption is by *re-execution over cached outputs*, which is a property of the
  data model, not a promise about the runtime. This is the one sentence that makes the whole design
  honest, and it is why the tables exist.
- **The resume row UX asked for is therefore real**, not sessionStorage: `3 places waiting from
  @handle · Review` is `select … from imports where user_id = $1 and status in ('ready','no_places')
  and expires_at > now()`. Cleanup is a `delete … where expires_at < now()` executed opportunistically
  on the map page's data load — **not a cron job**. If it ever needs to be a cron, Vercel Cron is one
  line, but it does not need to be at our scale.

---

## 7. Timeouts, cancellation, and ceilings

One `AbortSignal` per import — a **global deadline of 25 s** — plus a per-attempt timeout per call.
The global deadline always wins, so worst-case budgets cannot compound into a hung request.

| Stage | Per-attempt timeout | Retries | Stage budget | On exhaustion |
|---|---|---|---|---|
| A1 short link | 4 s, ≤5 hops, host allow-list re-applied to **every** `Location` | 0 | 4 s | `SHORT_LINK_UNRESOLVED` |
| A2 oEmbed | 4 s | 2, backoff 300 ms + jitter | 8 s | `UPSTREAM_TIMEOUT` → **import fails** |
| B extraction | 10 s | 1, transport errors only, only if ≥8 s of global budget remains | 12 s | `EXTRACTOR_UNAVAILABLE` → **import fails** |
| C resolution | 3 s per candidate | 1 per candidate | 6 s total, all candidates in parallel | candidate becomes `unresolved` → **partial success, import succeeds** |
| global | — | — | **25 s** | whatever stage is running maps to its own error; if the deadline hits during C the import still returns partial |

**The asymmetry is the design.** Only stage A can fail the import outright — without source content
there is nothing to show. Stage B failure is an error state. **Stage C failure is never an error**;
it degrades to unresolved rows, which the review UI already renders (UX §4.6). That is what makes
partial success structural rather than exceptional.

**Ceilings per import** (charter §5, feeds D11):

- `MAX_CANDIDATES = 7`. Extraction may return more; candidates beyond 7 are kept with
  `resolution.status = 'capped'` and rendered as "we didn't check this one" rather than silently
  dropped. Lying by omission is worse than a visible cap.
- `MAX_PROVIDER_REQUESTS_PER_IMPORT = 7` — one search per candidate, concurrency 4. **Place *detail*
  lookups happen at confirmation time, for selected candidates only**, which halves provider spend on
  the common path where the user saves 2 of 3.
- `MAX_LLM_CALLS_PER_IMPORT = 2` (one attempt plus one transport retry).
- Per-user rate limit: values owned by D11; the architectural hook is that the limit is checked in the
  route handler *before* `getOrCreateImport`, and a rejection is the domain error `RATE_LIMITED_LOCAL`,
  never a raw limiter message (UX §5.1).

**Cancellation** is cooperative and checkpointed. The client's `Cancel` aborts the `fetch`; the
handler observes `request.signal`, and the orchestrator checks the signal **between** stages only —
never mid-call, because a half-cancelled LLM call is billed anyway and abandoning a completed oEmbed
fetch throws away a cache write. On cancel the import row is marked `abandoned` and its stage outputs
are kept, so a re-paste 10 s later is a cache hit. In-flight provider calls are allowed to finish and
populate the cache.

---

### 7.1 Observability (charter §3 invariant 5: a silent import failure is the worst outcome)

No new infrastructure. Three surfaces, all of which we needed anyway:

1. **The `imports` row is the audit record.** `status`, `stage`, `error_code`, `degraded_code`,
   `ms_source`, `ms_extract`, `ms_resolve`, `created_at`. Every import that ever ran is inspectable
   after the fact, including the ones nobody watched. p50/p95 per stage is one `percentile_cont` query
   — which is exactly the evidence the scale document (M8) needs and exactly the trigger data in §12.
2. **One structured log line per stage transition**, emitted through `OpCtx.log`:
   `{ event:'import.stage', importId, videoId, stage, ms, outcome }`. Vercel's log drain groups by
   `importId`. **Never log the caption, never log coordinates** (charter R9, 04 §8 Q8) — video ids and
   codes only. An `error_code = 'INTERNAL'` is the one line that should page a human.
3. **The stream itself is the live view.** During development and the demo, `curl -N` against
   `/api/imports` shows the pipeline narrating itself in real time. This is a real operational benefit
   of the chosen mechanism that none of the async options have: the debugging tool and the product
   feature are the same bytes.

What we are **not** building: an events table, a tracing vendor, dashboards, or alerting. At tens of
users, a SQL query over `imports` answers every question we can currently formulate.

## 8. Partial success — representation

Partial success is a **shape in the success payload**, not a separate outcome kind. There is exactly
one place in the type system where "some worked, some didn't" is expressed: `Candidate.resolution`.

```ts
// Derived from the resolver's `ResolveResult`, not returned by the port: `preselect -> resolved`,
// `confirm -> ambiguous`, `no_match -> unresolved` (§10's 1:1 mapping). `lookup_failed`,
// `timed_out` and `capped` come from the pipeline, which is why the mapping is the pipeline's
// (MS6) and not the adapter's. `11-resolver-vocabulary.md` §2 ruling 5.
export type CandidateResolution =
  | { status: 'resolved';   place: ResolvedPlace; alternates: ResolvedPlace[]; confidence: Confidence }
  | { status: 'ambiguous';  options: ResolvedPlace[] }                    // 2..3, none confident enough
  | { status: 'unresolved'; reason: 'no_match' | 'lookup_failed' | 'timed_out' | 'capped' };

export type ImportOutcome =
  | { kind: 'ready';        importId: ImportId; source: SourceView; candidates: Candidate[];
                            degraded?: 'PLACE_PROVIDER_UNAVAILABLE' }
  | { kind: 'no_places';    importId: ImportId; source: SourceView }      // extraction returned 0 — the modal case
  | { kind: 'already_saved'; importId: ImportId; placeIds: PlaceId[] }
  | { kind: 'failed';       importId: ImportId; error: DomainErrorView };
```

Rules:

1. `kind: 'ready'` is returned **if stage B produced ≥1 candidate**, regardless of how resolution
   went. A "3 names found, 0 matched" import is a success with three actionable rows, not a failure.
   This is exactly UX §5.2's "a success with an asterisk".
2. `unresolved.reason` is diagnostic, **not** user-facing copy. UX §5.2 requires that a
   `no_match` row and a `lookup_failed` row read identically (`We couldn't match this one.`) — because
   the user's next action is the same in both cases. The distinction exists for our logs and for
   deciding whether `Retry matching` is offered.
3. `degraded: 'PLACE_PROVIDER_UNAVAILABLE'` is set only when **every** attempted lookup failed with a
   transport error (as opposed to returning no match). It unlocks one extra affordance —
   *retry resolution only*, cheap because extraction is cached — and is the "provider down" UX state.
   It never blocks saving, because there is nothing resolved to save.
4. `capped` candidates are visible and unselectable.
5. **Never** invent a resolved place to avoid an empty row, and never drop a candidate to make the
   list look clean.

---

## 9. Error taxonomy — closed set

`DomainError` is a discriminated union in `domain/errors.ts`. Nothing else may cross into the app
layer. Integration adapters catch every vendor exception and map it; **no provider error object,
message, status code or stack ever reaches the client.** The client receives
`DomainErrorView = { code: DomainErrorCode; retryable: boolean; importId?: ImportId }` — a code and
two booleans. Copy lives in one client-side map (UX §12), so the wire format carries no prose.

| Code | Raised by | Stage | Retryable | UX state (ux-architecture) |
|---|---|---|---|---|
| `UNSUPPORTED_HOST` | canonicaliser, before any network call (also the SSRF gate) | pre-A | no | F1 inline / "We support TikTok links" |
| `MALFORMED_URL` | canonicaliser | pre-A | no | F1 inline |
| `UNSUPPORTED_URL` | canonicaliser (profile / tag / music / live) | pre-A | no | "That's a profile, not a post" |
| `SHORT_LINK_UNRESOLVED` | short-link resolver (incl. the 302→homepage→200 trap) | A1 | no | "This share link has expired" |
| `PHOTO_POST` | canonicaliser, `kind=photo` | pre-A | no | treated as `POST_UNAVAILABLE` copy until 04 §5 category L has a specimen |
| `POST_UNAVAILABLE` | oEmbed 400 after our validation passed | A2 | **once** | **F9** — the single honest state. Private / deleted / region-locked are indistinguishable (VERIFIED) and we do not guess |
| `UPSTREAM_TIMEOUT` | our `AbortSignal` | A1/A2 | yes | F9 with `Retry` primary |
| `RATE_LIMITED_UPSTREAM` | reserved — **no 429 ever observed** from TikTok | A2 | yes | same copy as timeout; kept so a future TikTok change surfaces as a distinct log code |
| `RATE_LIMITED_LOCAL` | our own per-user limiter, in the route handler | pre-A | later | "You've tried this a few times. Give it a few minutes." |
| `NO_CAPTION` | content extractor: oEmbed 200 but no usable text | A/B seam | no | F10 variant: "This post has no caption to read" → manual place search |
| `EXTRACTOR_UNAVAILABLE` | LLM adapter: transport, 5xx, quota, timeout | B | yes | F9 with `Retry` (cheap — source is cached) |
| `EXTRACTOR_INVALID_OUTPUT` | Zod parse of LLM structured output fails after 1 reprompt | B | yes | F9 |
| `NOT_AUTHENTICATED` | route handler | pre-A | n/a | redirect to sign-in, pasted URL preserved |
| `INTERNAL` | anything unmapped; the union's floor | any | yes | F9 generic. **An `INTERNAL` in the logs is a bug report, always** |

Not errors, deliberately:

- **`NO_PLACES_FOUND` is an outcome (`kind:'no_places'`), not an error.** At LEVEL B it is the modal
  result (~73%, 04 §4). Modelling the most common result as an error would poison every log, every
  metric and every screen. UX F10 is a designed screen; the rail settles stage 2 to `No places named`
  and does not claim success.
- **Partial resolution is not an error** (§8).
- `PLACE_PROVIDER_UNAVAILABLE` is a `degraded` marker on a successful outcome, not a `DomainError`.

---

## 10. Layering and seams

```
src/
  app/                                  # APP LAYER — Next.js only. Auth, rate limit, HTTP, streaming, redirects.
    (map)/layout.tsx                    #   owns the map instance (§11)
    (map)/map/page.tsx
    (map)/place/[placeId]/page.tsx
    (map)/import/page.tsx
    (map)/import/[importId]/page.tsx    #   refresh-safe review (reads the imports row)
    api/imports/route.ts                #   POST → NDJSON stream. maxDuration=60, runtime='nodejs'
    api/imports/[importId]/route.ts      #   GET  → ImportOutcome (resume / reconnect)
    actions/confirm-import.ts           #   Server Action: the transactional save
    actions/add-place.ts                #   Server Action: manual place addition (capability 13)
  domain/                               # DOMAIN — pure TypeScript. No next/*, no vendor SDK, no fetch.
    types.ts                            #   the shared vocabulary (below)
    errors.ts                           #   the closed union (§9)
    ports.ts                            #   SourceAdapter · ContentExtractor · PlaceExtractor · PlaceResolver · ImportStore · Clock
                                        #   (PlaceResolver + OpCtx shipped MS5 task 2; the other five land with MS6)
    import/pipeline.ts                  #   runImport(): the orchestrator. Emits events, enforces budgets.
    import/events.ts                    #   ImportEvent union
    source/canonicalise-tiktok-url.ts   #   pure; the SSRF allow-list; heavily unit-tested
    places/normalise.ts                 #   the ONE normalisation (10 §4). Shipped MS5 task 2.
    places/resolve-result.ts            #   regionLoaded() / topMatch() over a ResolveResult
    places/confidence.ts                #   derived confidence (D4)
    places/dedup.ts                     #   place identity (D5)
  integrations/                         # INTEGRATIONS — one adapter per port. Vendor types die here.
    tiktok/oembed.source-adapter.ts     #   + Zod schema for the oEmbed payload
    tiktok/caption.content-extractor.ts
    llm/<provider>.place-extractor.ts   #   + Zod schema for the structured output
    places/<provider>.place-resolver.ts #   + Zod schema for the provider response
    supabase/import.store.ts
  ui/                                   # UI — components. Client islands are explicit.
    map/MapCanvas.tsx                   #   the single map instance
    import/StageRail.tsx                #   consumes ImportEvent[]
    import/useImportStream.ts           #   fetch + NDJSON reader + minimum-dwell pacing
    review/CandidateRow.tsx
```

This is the seam-relevant subset; **`technical-design.md` §2 holds the complete tree** (it adds
`signin/`, `account/`, `add-place/`, `_lib/`, `schemas.ts`, `budgets.ts`, the scorer and the rest).
The dynamic segment names are canonical here and there: **`[placeId]` and `[importId]`**, never
`[id]` — the segment name is the `params` key, so a shorthand in prose becomes a wrong property
access in code.

**Enforcement, not aspiration.** ESLint `no-restricted-imports` zones (`eslint.config.mjs`), each
proved against a deliberate violating fixture by `npm run check:layers`:

| Zone | May not import | Also enforced by |
|---|---|---|
| `domain/**` | `next/*`, `react`, `@supabase/*`, `@anthropic-ai/*`, `maplibre-gl`, `node:*`/`fs`/`http(s)`/`undici`/`axios`, the `fetch`/`XMLHttpRequest`/`navigator` globals, and any outer layer | a second, ESLint-independent grep over `src/domain` in `check-layer-guard.sh` |
| `ui/**` | `integrations/**` — and `app/_lib/**`, which is the server-only surface (service-role client, secrets, rate limiter, composition root). The one legal `ui/ → app/` edge is importing a Server Action from `app/actions/*` | **`server-only`**: every module in `app/_lib/` imports it, so pulling one into a client bundle fails the *build*, not just the lint. `check-layers` asserts both the dependency and the per-file import |
| `integrations/**` | `app/**`, `ui/**` | — |

Each zone names four forms per forbidden layer — the `@/x` alias, the `@/x/**` subtree, the relative
escape and its subtree at any depth — because an enumerated `'../x/*'`, `'../../x/*'` list lets a bare
`@/x` and a `../../../x/*` from a deeper folder through.

**Adapters are injected.** The canonical signature, declared once here and restated in
`technical-design.md` §7:

```ts
runImport(ports: Ports, input: { userId: UserId; rawInput: string }, ctx: OpCtx): AsyncGenerator<ImportEvent>
```

`ctx` carries the `AbortSignal` (§7's 25 s deadline), the `importId` and the `Logger` — it is not a
separate `signal` parameter. **No DI container** — a function parameter is a dependency injection
framework that needs no explanation.

### Shared type vocabulary (one definition each, owned by `domain/types.ts`)

```ts
export type UserId = string & { readonly __brand: 'UserId' };
export type ImportId = string & { readonly __brand: 'ImportId' };
export type PlaceId  = string & { readonly __brand: 'PlaceId' };

/** The post. Global, one row per platform post, shared across users. */
export interface Source {
  id: string; platform: 'tiktok'; externalId: string;   // the numeric video id — the identity
  canonicalUrl: string; authorHandle: string | null; authorName: string | null;
  thumbnailUrl: string | null;                          // signed + expiring: never a permanent reference
  fetchedAt: Date;
}

/** What stage B produced from the source's text, for one (extractorVersion, promptVersion). */
export interface Extraction {
  sourceId: string; extractorVersion: string; promptVersion: string;
  candidates: PlaceCandidate[]; cityHint: string | null; producedAt: Date;
}

/** A name the LLM thinks is a place. Not yet a place. */
export interface PlaceCandidate {
  rawName: string;                 // exactly as the caption wrote it — shown in the search sheet
  cityHint: string | null; countryHint: string | null;
  categoryHint: string | null; evidence: string | null;   // the caption fragment, for our own debugging
  modelConfidence: number | null;  // kept, never trusted (02 §D3)
}

/** A real POI from the places provider. Field-for-field the `poi_index` columns that leave the
 *  integration layer (0010), because a second shape for the same row is how a nullability
 *  disagreement becomes a runtime crash. Shipped 2026-08-19 in `domain/types.ts`; the block below
 *  is the pre-MS5 sketch, kept only to show what changed. `providerId` is `providerPlaceId`,
 *  `provider` is closed, `address`/`category` are `addressLine`/`providerCategory`, and
 *  `sourceDataset`, `regionId`, `altNames`, `locality`, `datasetConfidence` were missing. */
export interface ResolvedPlace {
  providerId: string; provider: string; name: string;
  lat: number; lng: number; address: string | null; category: string | null;
}

/** A candidate plus what resolution made of it. This is what the review UI renders. */
export interface Candidate { candidate: PlaceCandidate; resolution: CandidateResolution }

/** The user's library entry: a place they confirmed, and the post(s) that recommended it. */
export interface SavedRecommendation {
  id: string; userId: UserId; placeId: PlaceId;
  sourceIds: string[];             // charter §3 invariants 3 & 4: many sources, one place, forever
  note: string | null; savedAt: Date;
}
```

### The six ports

Four vendor-facing ports (A–D) plus the two the orchestrator needs to be pure: a store and a
clock. `domain/ports.ts` has always listed six; E and F are declared here so MS6 does not invent
them.

```ts
/** A. Acquire raw source material for one post. One adapter per platform. */
export interface SourceAdapter {
  readonly platform: 'tiktok';
  canHandle(url: URL): boolean;
  /** Throws only DomainError. Vendor shapes are Zod-parsed inside. */
  fetch(externalId: string, ctx: OpCtx): Promise<RawSource>;
}
export interface RawSource {
  externalId: string; authorHandle: string | null; authorName: string | null;
  canonicalUrl: string; thumbnailUrl: string | null;
  texts: RawText[];                 // V1: exactly one, kind 'caption'
  media: MediaRef[];               // V1: always [] — the seam for a future analyser, and it costs nothing
}

/** B(pre). Turn raw source material into text the extractor can read.
 *  THIS is the seam that must stay open: an ASR or OCR analyser is a second implementation
 *  added to the list, and no other stage changes. */
export interface ContentExtractor {
  readonly id: 'caption' | 'transcript' | 'onscreen-text';
  supports(raw: RawSource): boolean;
  extract(raw: RawSource, ctx: OpCtx): Promise<ContentPart[]>;
}
export interface ContentPart {
  kind: 'caption' | 'transcript' | 'onscreen-text';
  text: string; origin: string;    // provenance, so extraction quality is attributable per source kind
}
// The orchestrator holds ContentExtractor[] and concatenates the parts. V1 array length: 1.
// Adding ASR later = push one implementation + one feature flag. No signature changes anywhere.

/** C. Text -> 0..N candidates. Schema-constrained; no tools; no side effects (charter R10). */
export interface PlaceExtractor {
  readonly version: string; readonly promptVersion: string;
  extract(parts: ContentPart[], ctx: OpCtx): Promise<{ candidates: PlaceCandidate[]; cityHint: string | null }>;
}

/** D. A candidate string -> a ranked shortlist. Never throws for "no match"; that is a return value.
 *  SUPERSEDED 2026-08-19 by the shipped declaration in `src/domain/ports.ts`; rulings in
 *  `11-resolver-vocabulary.md` §2. Four changes from what this block said:
 *    - `provider: string` -> `provider: 'overture' | 'nominatim'`. Closed, and NOT `06` §8's
 *      'overture-local', which `place_provider_refs.provider`'s CHECK (0005) forbids.
 *    - `resolve` takes a `ResolveQuery`, not a `PlaceCandidate`. The resolver has no business
 *      seeing `evidence` or `modelConfidence`, and manual search has no PlaceCandidate at all.
 *    - it returns `ResolveResult` (shortlist + Confidence + regionsSearched), not
 *      `CandidateResolution`. The latter is DERIVED from it in the pipeline (§8 below), which is
 *      the lossy direction and therefore the late one.
 *    - `search()` is gone. With one input and one output type its signature was identical to
 *      `resolve`'s; the manual sheet builds a different ResolveQuery, not a second method. */
export interface PlaceResolver {
  readonly provider: PlaceProvider;
  resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult>;
}

/** E. The import's record. Four methods — this is the whole persistence story (§6), and it is
 *  deliberately NOT a repository base class or a Supabase client wrapper. Nothing here claims
 *  work: `imports` is a record, not a queue. Every read Zod-parses the `candidates` jsonb.
 *  The confirmation-time save (`resolve_place`/`save_place`) is NOT on this port — it belongs to
 *  the Server Action's own store, because a place only exists after the user taps Save. */
export interface ImportStore {
  /** Idempotency (§6): returns the open import for (userId, externalId) or creates one. The
   *  pending `sources` row is created in the same transaction (technical-design §14 R4). */
  getOrCreateImport(userId: UserId, externalId: string, ctx: OpCtx): Promise<ImportRecord>;
  /** Everything already computed for this import, so resumption is re-execution over cached
   *  stage outputs: the `sources` row if fetched and fresh (30 days, §6), and the stored
   *  extraction only when both versions match. Cache reads, never a work claim. */
  loadCached(r: ImportRecord, v: ExtractorVersions, ctx: OpCtx): Promise<CachedStages>;
  /** One stage's output plus its elapsed ms, written BEFORE the next stage starts (§6). */
  recordStage(importId: ImportId, stage: ImportStage, out: StageOutput, ctx: OpCtx): Promise<void>;
  /** The terminal write: status, `error_code`/`degraded_code`, final candidates, timings. */
  finish(importId: ImportId, outcome: ImportOutcome, ctx: OpCtx): Promise<void>;
}

/** F. The only source of time in `domain/`. It exists so budgets and stage timings are
 *  testable without a real clock: the 25 s global deadline, the per-attempt timeouts and the
 *  jittered oEmbed backoff (§7) all go through it. `Date.now()`, `new Date()`, `setTimeout`
 *  and `Math.random` in `domain/` are a bug, not a shortcut. */
export interface Clock {
  now(): Date;                                        // wall clock: `fetchedAt`, `expiresAt`
  monotonicMs(): number;                              // stage timings; never wall-clock arithmetic
  sleep(ms: number, signal: AbortSignal): Promise<void>;   // retry backoff, abortable
  jitterMs(ms: number): number;                       // the ± spread on that backoff
}

// `importId` is `ImportId | null` as shipped (2026-08-19): manual place addition (capability 13)
// resolves with no import, and a synthetic id would put a lie in the log line §7.1 groups by.
export interface OpCtx { signal: AbortSignal; importId: ImportId | null; log: Logger }
export interface Ports {
  source: SourceAdapter; content: ContentExtractor[]; extractor: PlaceExtractor;
  resolver: PlaceResolver; store: ImportStore; clock: Clock;
}

// Supporting shapes declared alongside, deliberately thin:
// RawText   = { kind: 'caption'; text: string }
// MediaRef  = { kind: 'video' | 'image'; url: string; expiresAt: Date | null }   // V1 emits none
// ResolveHints = { cityHint: string | null; countryHint: string | null; near?: { lat: number; lng: number } }
// SourceView   = Pick<Source,'externalId'|'canonicalUrl'|'authorHandle'|'thumbnailUrl'>  // what the UI may see
// ConfidenceBand = 'preselect' | 'confirm' | 'no_match'
//                 — THE confidence enum. One vocabulary, thresholds owned by 06 §6.2:
//                   preselect = score >= 0.92 AND margin >= 0.05 · confirm = score >= 0.80
//                   · no_match = below. It maps 1:1 onto CandidateResolution's three statuses
//                   (preselect -> resolved, confirm -> ambiguous, no_match -> unresolved), so
//                   'confident'/'shortlist' are UI prose for a band, never type names.
// Confidence   = { band: ConfidenceBand; score: number; margin: number | null }  // DERIVED from
//                 resolution evidence (D4); the model's own confidence never gates anything.
//                 `margin: number | null` as shipped: null = fewer than two candidates, i.e.
//                 UNMEASURED margin, which is `10` §8's inherited defect made impossible to
//                 reproduce by accident. A null margin can only reach `confirm` (`10` §12 Q3).
// ImportStage  = 'source' | 'extract' | 'resolve' | 'done'      // the `imports.stage` column
// ImportStatus = 'processing' | 'review' | 'no_places' | 'completed' | 'failed' | 'cancelled'
//                 — canonical six, per technical-design §14 R2 and the shipped 0003 CHECK.
//                   §6's SQL sketch above predates that ruling; the migration wins.
// ImportRecord = { importId: ImportId; userId: UserId; externalId: string; sourceId: string;
//                  status: ImportStatus; stage: ImportStage; attemptCount: number;
//                  isIdempotent: boolean }   // sourceId is NOT NULL (R4: the pending row exists
//                 before stage A); isIdempotent is what `start_import` (0007) returns and what the
//                 `accepted` event's `idempotent` field carries
// ExtractorVersions = { extractorVersion: string; promptVersion: string }
// CachedStages = { source: Source | null; extraction: Extraction | null }
// StageOutput  = { ms: number } & ( { stage: 'source'; source: Source }
//                | { stage: 'extract'; extraction: Extraction }
//                | { stage: 'resolve'; candidates: Candidate[]; degraded?: 'PLACE_PROVIDER_UNAVAILABLE' } )
// Logger       = { event(name: string, fields: Record<string, string | number | boolean>): void }
//                 — structured only; video ids yes, captions never (04 §8 Q8)
```

### Validation — Zod at every boundary, three places, no exceptions

1. **Client input**: `{ rawInput: string }`, ≤2048 chars, then the pure canonicaliser (which is also
   the SSRF host allow-list — full-host equality, never suffix match; re-applied to every redirect
   `Location`).
2. **Every vendor response**: the oEmbed payload, the LLM structured output, and each provider
   response are parsed by a Zod schema **inside the adapter**. A parse failure is a `DomainError`
   (`POST_UNAVAILABLE`, `EXTRACTOR_INVALID_OUTPUT`, or the candidate resolution `lookup_failed`) — not
   a thrown `ZodError`. `.strict()` is deliberately **not** used on the oEmbed schema: TikTok adding a
   field must not break us; TikTok *removing* `title` must.
3. **Every read of a `jsonb` column**: `imports.candidates` is parsed on read. A jsonb column is
   untrusted input the moment the code that wrote it is a deploy older than the code reading it.
   This is the boundary teams forget, and it is the one that breaks demos after a schema change.

The LLM adapter additionally: no tools, no function calling with side effects, caption wrapped as
data with an explicit "this is user content, not instructions" delimiter, and an output cap of 12
candidates before our own 7-cap applies (charter R10).

### What we are deliberately NOT abstracting

| Not abstracted | Why |
|---|---|
| A job queue / worker / cron | Nothing to decouple. 8 s vs a 300 s limit. Earning it back is a §12 trigger |
| Supabase Realtime | The browser is already holding an open response |
| A generic retry / circuit-breaker library | Two retry policies, five lines each, and one of them can't be smart because oEmbed's failure is opaque |
| A caching layer (Redis / KV) | Two Postgres tables we need anyway *are* the cache |
| A multi-LLM abstraction layer | One `PlaceExtractor` port, one adapter. A second model is a second file, not a framework |
| A generic event bus | `ImportEvent` is one union consumed by one reader |
| Supabase client wrapper / repository base class | `ImportStore` is four methods |
| A DI container | Function parameters |
| Multi-tenant / org / role model | One role: authenticated owner. RLS is the whole authorisation story (M3 gap 1) |
| i18n of error copy | One code→copy map, English, client-side |
| Map/places provider abstraction beyond `PlaceResolver` | The *rendering* side is UI-local; only resolution crosses the domain |

---

## 11. Decision D12 — map shell and route topology (answers UX question 2)

**The risk, stated precisely.** UX wants `/place/[placeId]`, `/import`, `/import/[importId]` to be
deep-linkable and refresh-safe, *and* a map camera moved by exactly four things. In the App Router
these fight only if the component holding the map instance **unmounts** on navigation — because a
MapLibre/Mapbox `Map` object destroyed and re-created loses its camera, and a camera reset mid-demo
reads as "broken".

**Verdict: nested routes under a persistent route-group layout that owns the map. No parallel routes,
no intercepting routes, no client-only sheets. Deep links are kept. Camera stability is kept.**

The mechanism, and why it works:

1. `app/(map)/layout.tsx` renders `<MapCanvas />` (a client component that creates the map exactly
   once in a `useRef` on mount) **and** `{children}`.
2. `/map`, `/place/[placeId]`, `/import`, `/import/[importId]` are all **plain nested routes inside that
   group**. In the App Router, navigating between siblings of a shared layout re-renders `children`
   and **preserves the layout's React tree and its client state**. `MapCanvas` therefore does not
   remount, and the map object survives every sheet open, sheet close, and back navigation.
3. The sheet is a sibling of the map in the layout, not a wrapper around it. On mobile a "full
   screen" sheet is **CSS covering the map, never unmounting it** — this is the rule that must be
   written down, because `{isOpen && <Map/>}` is the natural mistake and it is unrecoverable.
4. The camera is written by exactly the four authorised movers, dispatched through a tiny
   `useMapCamera()` API on a context provided by the layout. **The route is not one of the movers.**
   A leaf route may *request* a camera move on first mount (deep-linking to `/place/[placeId]` cold should
   frame that place — that is mover #1, "user selected a place"), but a re-render must not.
   Implementation: the request is keyed by `placeId` and guarded so it fires once per key.
5. Belt and braces, ~10 lines: the map instance and its last camera live in a **module-scope
   singleton** keyed by container, and the camera is mirrored into `sessionStorage`. So even an
   unexpected remount (a hard refresh, a Fast Refresh in dev, a future layout change) restores the
   camera instead of resetting it. This makes the property robust to someone else's later edit, which
   at 19 days matters more than elegance.

**Cost:** essentially zero. One route group, one context, one `useRef`, one guarded effect. No
`@slot` folders, no `default.tsx` puzzles, no intercepting-route matcher rules.

**Why not parallel + intercepting routes** (`(.)place/[placeId]` into an `@sheet` slot), which is the
canonical Next.js answer to "modal with a URL": they are the most bug-prone corner of the App Router,
their `default.tsx` and hard-refresh-vs-soft-navigation semantics are genuinely hard to explain, and
they solve a problem we do not have — we are not overlaying a modal on a *different page's* content,
we are swapping a sibling next to a persistent map. Under M11 ("expect interview-style questions"),
choosing the mechanism whose explanation is one sentence beats choosing the one with a documentation
page. If UX later wants a true "modal over the previous page" (e.g. open a place from the list view
without losing the list's scroll), intercepting routes become the right tool for **that** case only,
and can be added for that route alone.

**We do not need UX's pre-authorised cut.** Deep links survive. Record this as an ADR
(`docs/adr/`) and as an acceptance test: *navigate `/map` → `/place/[placeId]` → back → `/import` → back;
assert the map's `getCenter()`/`getZoom()` are unchanged and the map object identity is stable.* That
Playwright assertion is the guard rail; without it this decision degrades silently the first time
someone restructures a layout.

---

## 12. When to revisit

This decision is correct **because of measured numbers**, so it is invalidated by measured numbers.
Named triggers, each with the mechanism that replaces it:

| Trigger | Measured how | Then |
|---|---|---|
| **End-to-end p95 > 20 s** on the 40-URL set from the deployment | `imports.ms_*` columns; one SQL query | Move to option 5 (persisted job row + polling) with a self-invoked runner — the persistence layer already exists, so the change is a new `/api/imports/run` and a poller, not a redesign |
| **Any 429 or throttle signature from TikTok on Vercel egress** | the 04 §6 probe, then production logs | Add a global concurrency limiter + queue at the `SourceAdapter` seam only |
| **Stage B moves to media-level analysis (ASR)** — download + transcribe is minutes, not seconds | by definition | This is where a queue is *earned*. Vercel Workflows or a Supabase-side runner, behind the existing `ContentExtractor` seam. The rest of the pipeline does not change; that is the whole point of the seam |
| **N regularly > 7** on real list-posts | candidate-count distribution in `imports` | Raise the cap with an explicit cost calculation, or resolve lazily in the review UI on scroll |
| **Vercel lowers the Hobby limit below ~30 s, or fluid compute stops being the default** | the §2 probe, re-run before submission | Lower `maxDuration`; the mechanism is unaffected above ~15 s. Below that, option 5 |
| **Streaming is buffered by an intermediary in production** (first line does not arrive early) | the §2 probe | Fall back to UX §3.2(b): one honest stage, single JSON response. Everything else — tables, idempotency, partial success, taxonomy — is unchanged. **This is the only trigger that costs UX anything, and it costs only the rail** |

## 13. How to explain this to the examiner in 60 seconds

"Importing a TikTok means three network stages: read the post, ask a language model which places it
names, then look each place up. I measured them: reading the post is about half a second, the model
one to five seconds, the lookups run in parallel — so about three to eight seconds end to end.
Vercel's function limit on the free plan is five minutes. So the work comfortably fits in one request
and I deliberately did **not** build a job queue — it would have been infrastructure I couldn't
justify. It's one POST to a route handler that streams back one line of JSON each time a stage really
finishes, which is where the progress you see comes from; the UI never advances a step on a timer. As
it runs it writes to two tables: one row per TikTok post, shared by all users and keyed on the
numeric video id, so pasting the same link twice — even by a different person — costs no upstream
calls at all; and one row per import, so if you refresh or lose signal, the review screen comes back
and only the unfinished stage re-runs. Everything external is behind an interface I own and every
response — including the model's — is validated with Zod before my code trusts it, and every failure
is one of a fixed list of error codes the UI knows how to render. If a place lookup fails, that
candidate just shows as 'couldn't match this one' and you can still save the others: a partial result
is a success, not an error. And if the pipeline ever gets slow — if I add audio transcription, say —
the tables I already have are exactly what a queue would need, so that change is additive."

---

## 14. What other agents must now do

- **UX:** §3.2 blocker cleared — mechanism (a), full three-stage rail, real `{i} of {n}` counter, 20 s
  client stop is safe, §4.7 server-side resume row is real. §11 clears the map-remount risk with no
  loss of deep links.
- **Database (D5/D6):** `sources` and `imports` DDL above is the starting point; `imports.candidates`
  as `jsonb` is deliberate (pre-confirmation data with no query requirements). Owns `expires_at`
  cleanup and the RLS policies, including **no user-facing select on `sources`**.
- **Security:** three asks — (1) the ruling on storing captions in a cross-user `sources` cache (04
  §8 Q4) and its effect on the 30-day TTL; (2) confirm the canonicaliser is the SSRF boundary as
  described; (3) confirm no `DomainError` payload may carry vendor text, which is why the wire format
  is a code.
- **Geospatial (D2):** whether provider results may be cached, and for how long — that decides
  whether `place_lookups` exists behind `PlaceResolver`.
- **AI (D7):** implement `PlaceExtractor` with `version`/`promptVersion` as first-class fields — the
  extraction cache is keyed on them.
- **DevOps (D11):** rate-limit values; the §2 stream-and-duration probe; assert `runtime = 'nodejs'`
  and `maxDuration = 60` are in the code, not the dashboard.
- **QA (D10):** three tests are load-bearing for this decision — the canonicaliser table from 04 §2,
  the double-paste idempotency test, and the map-camera-stability Playwright assertion in §11.
