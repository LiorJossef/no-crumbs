# Technical Design — P-002

> Course deliverable **M4** (`03-university-requirements.md`): the detailed technical design written
> **before implementation**. Owner: Next.js Architect, assembling the rulings of the specialist
> documents into one design. Date: **2026-08-18**. Status: **complete for MS3; nothing in MS4–MS16
> may contradict it without amending this file.**
>
> **Scope of authority.** This document does not re-litigate settled decisions; it *assembles* them
> and rules on the seams between them. Where two upstream documents disagree, §14 records the
> reconciliation and this file wins. Where something is still open, §15 says so by name rather than
> papering over it.
>
> Depends on: [`00-project-charter.md`](00-project-charter.md) §4–§6 (scope contract, engineering
> principles) · [`04-tiktok-feasibility.md`](04-tiktok-feasibility.md) (the VERIFIED TikTok facts and
> the canonicalisation rules) · [`06-map-and-places-decision.md`](06-map-and-places-decision.md)
> (renderer, dataset, resolution scoring) · [`07-import-execution-model.md`](07-import-execution-model.md)
> (execution model, ports, error taxonomy, route topology) ·
> [`08-place-identity.md`](08-place-identity.md) (schema, RLS, CRUD matrix, index plan) ·
> [`09-extraction-and-resolution.md`](09-extraction-and-resolution.md) (LLM contract) ·
> [`ux-architecture.md`](ux-architecture.md) (surfaces, flows, copy) ·
> [`product-specification.md`](product-specification.md) §7 (acceptance criteria).

---

## 1. The system in one page

A signed-in user pastes a TikTok URL. One `POST` runs the whole conversion inside a single request
and streams its progress back line by line. The conversion is four stages behind four interfaces we
own: acquire the post, turn it into text, extract candidate place names with a schema-constrained
LLM, resolve each name against our own POI index. Nothing is written to the user's map until they
tap Save; that save is a Server Action. Retrieval afterwards is a map — one MapLibre instance that
is created once and never unmounts — reading the user's own rows through row-level security.

```
┌────────────────────────── BROWSER ──────────────────────────┐
│  React 19 / Next.js 16 App Router                           │
│  (map) layout ── owns ONE MapLibre instance + camera ctx    │
│    ├── /map          pins, clusters, sheet, list, search    │
│    ├── /place/[placeId]  sheet  ├── /import          paste  │
│    └── /add-place    POI search └── /import/[importId] rev. │
└───────┬──────────────────────────────────────┬──────────────┘
        │ POST /api/imports (NDJSON stream)     │ Server Actions
        │ GET  /api/imports/[importId] (resume) │ confirmImport · addPlace · edits
┌───────▼──────────────────────────────────────▼──────────────┐
│ app/   Next.js only: auth · rate limit · HTTP · streaming    │
├──────────────────────────────────────────────────────────────┤
│ domain/ pure TS: canonicaliser (SSRF gate) · runImport()     │
│         · plausibility · confidence · dedup · errors · ports │
├──────────────────────────────────────────────────────────────┤
│ integrations/ one adapter per port; vendor types die here    │
│   tiktok oEmbed · caption · Anthropic haiku-4-5 · Overture   │
│   resolver (+ Nominatim fallback) · Supabase stores          │
└───────┬──────────────────┬───────────────────┬───────────────┘
        │                  │                   │
   TikTok oEmbed      Anthropic API      Supabase Postgres
   (no auth, free)    (structured out)   (RLS forced; source of truth)
                                          + Protomaps tiles (browser)
```

**The one-sentence version for the examiner:** *the map is the retrieval interface, the import
pipeline is the product, and everything external sits behind an interface I own with its output
validated by Zod before my code trusts it.*

---

## 2. Layers and folder structure

Four layers, enforced in CI by ESLint `no-restricted-imports` zones (`eslint.config.mjs`, already
active since MS2 — `npm run check:layers` proves a `domain/ → next/server` import fails).

| Layer | May import | May **not** import | Rule in one line |
|---|---|---|---|
| `ui/` | `domain/` types, React, design tokens, Server Actions from `app/actions/*` | `integrations/**`, `app/_lib/**` | Components render domain types; adapters are injected in `app/`, and the server-only surface is unreachable from a client island |
| `app/` | everything | — | Next.js lives here and only here: auth, HTTP, streaming, redirects, wiring |
| `domain/` | nothing but itself | `next/*`, `react`, `@supabase/*`, `@anthropic-ai/*`, `maplibre-gl`, any outer layer | Pure TypeScript. No network, no framework, no vendor |
| `integrations/` | `domain/` ports + one vendor SDK each | `app/**`, `ui/**` | An adapter implements a port and knows nothing about the app |

```
src/
  app/
    layout.tsx                          # root html/body, fonts, tokens
    page.tsx                            # S1 marketing; redirects to /map when authed
    signin/page.tsx                     # S2 Supabase Auth (email + password, D8)
    account/page.tsx                    # S9
    healthz/route.ts                    # already shipped (MS2): deploy identity probe
    (map)/
      layout.tsx                        # THE persistent shell: <MapCanvas/> + camera ctx + {children}
      map/page.tsx                      # S3/S4 map home; server-reads the user's places
      place/[placeId]/page.tsx          # S5 detail sheet, deep-linkable
      import/page.tsx                   # S6 paste + stage rail
      import/[importId]/page.tsx        # S7 review & confirm, refresh-safe
      add-place/page.tsx                # S8 manual place addition
    api/
      imports/route.ts                  # POST → NDJSON stream. runtime='nodejs', maxDuration=60
      imports/[importId]/route.ts       # GET  → ImportOutcome (resume / reconnect)
    actions/
      confirm-import.ts                 # Server Action: the transactional save
      add-place.ts                      # Server Action: manual add (capability 13)
      saved-place.ts                    # Server Actions: rename · recategorise · note · visit · delete
      search-places.ts                  # Server Action: POI search for review-correction and S8
    _lib/
      supabase-server.ts                # RSC/action client bound to the user's JWT (anon key)
      supabase-service.ts               # service-role client. Server-only. Never user-scoped reads
      require-user.ts                   # auth guard used by every protected surface
      rate-limit.ts                     # per-user import limiter (D11 values)
      ports.ts                          # composition root: builds the adapter set for runImport
  domain/
    types.ts                            # the shared vocabulary (07 §10)
    errors.ts                           # DomainError — closed union of 14 codes (§10)
    ports.ts                            # the six ports, declared in 07 §10 and 11 §2: SourceAdapter ·
                                        #  ContentExtractor · PlaceExtractor · PlaceResolver ·
                                        #  ImportStore (4 methods) · Clock (the only time source)
    schemas.ts                          # Zod objects shared by adapter, API and jsonb reads
    import/
      pipeline.ts                       # runImport(ports, input, ctx) — the orchestrator
      events.ts                         # ImportEvent union (the NDJSON wire format)
      budgets.ts                        # timeouts, caps, MAX_* constants — one exported object
    source/
      canonicalise-tiktok-url.ts        # pure; the SSRF allow-list; heaviest unit-test target
    places/                             # plural, ruled 2026-08-19 (11 §4); was `place/` here and in 07 §10
      normalise.ts                      # the ONE normalisation, loader + resolver (10 §4). MS5 task 2
      resolve-result.ts                 # regionLoaded() / topMatch() over a ResolveResult. MS5 task 2
      plausibility.ts                   # the one gate extraction owns (09 §5.2)
      confidence.ts                     # the ConfidenceBand enum: preselect / confirm / no_match (06 §6.2)
      scoring.ts                        # name_score, margin — ported from the 44-case benchmark
      dedup.ts                          # the client-side view of place identity (08 §1)
    build-info.ts                       # already shipped (MS2)
  integrations/
    tiktok/oembed.source-adapter.ts     # + Zod schema for the oEmbed payload (NOT .strict())
    tiktok/short-link.ts                # manual redirect following, host allow-list per hop
    tiktok/caption.content-extractor.ts
    llm/anthropic.place-extractor.ts    # the ONLY file importing @anthropic-ai/sdk
    places/overture.place-resolver.ts   # our Postgres POI index + the scorer
    places/nominatim.place-resolver.ts  # capped, queued, cached out-of-region fallback
    supabase/import.store.ts            # ImportStore implementation (service role)
    supabase/place.store.ts             # resolve_place / save_place callers
  ui/
    map/MapCanvas.tsx                   # 'use client' — the single map instance, created in a useRef
    map/useMapCamera.ts                 # the four authorised camera movers
    map/markers.ts                      # sprite/symbol layer config; clustering options
    sheet/BottomSheet.tsx               # three snap points (peek/half/full)
    import/UrlField.tsx                 # client-side parse for instant F1/F2 feedback
    import/StageRail.tsx                # consumes ImportEvent[]; never advances on a timer
    import/useImportStream.ts           # fetch + NDJSON reader + minimum-dwell pacing
    review/CandidateList.tsx            # selection reducer lives here
    review/CandidateRow.tsx             # confident / ambiguous / unresolved — three shapes
    place/PlaceDetail.tsx               # S5 body, incl. "which TikTok made me save this"
    search/PlaceSearchSheet.tsx         # shared by review-correction and S8
    system/ErrorState.tsx               # renders a DomainErrorCode via the one copy map
    tokens/                             # type · space · radius · elevation · motion · surfaces
supabase/migrations/                    # 0001…0008, the only mechanism by which schema changes ship
tests/unit · tests/rls · tests/e2e      # Vitest · SQL policy tests · Playwright
docs/                                   # this design and its sources
```

**Why `_lib` and not `lib`:** the underscore keeps it out of App Router routing while sitting beside
the routes that use it. **Every module in `_lib` imports `server-only`**, and the `ui/` ESLint zone
forbids importing `app/_lib/**` at all — so a service-role client or an API key reaching a client
bundle is a failed *build*, not a review comment. `npm run check:layers` asserts both halves. **Why a composition root (`app/_lib/ports.ts`):** `runImport` takes its
dependencies as a function argument. That is the entire dependency-injection story — no container,
no decorators, nothing to explain to an examiner beyond "the function is given what it needs".

---

## 3. Component structure and the client/server boundary

Default is a **Server Component**. A component becomes a client island only for one of four reasons:
it holds the map, it reads a stream, it owns transient selection state, or it needs a gesture.

| Component | Kind | Why |
|---|---|---|
| `(map)/layout.tsx` | Server | Renders the shell and the client `MapCanvas` once |
| `MapCanvas` | **Client** | Owns the MapLibre instance in a `useRef`; created once, destroyed never |
| `MapCameraProvider` | **Client** | Context exposing `useMapCamera()`; the four authorised movers |
| `map/page.tsx` | Server | Reads the user's saved places under RLS and passes them as props |
| `BottomSheet` | **Client** | Drag, snap points, `visualViewport` binding |
| `SavedPlacesList` | Server (rendered into the sheet) | Pure render of rows; filtering by text/category is client-side over ≤1 000 rows |
| `import/page.tsx` | Server | Shell only |
| `UrlField` + `useImportStream` + `StageRail` | **Client** | The paste, the `fetch`, the NDJSON reader, the rail |
| `import/[importId]/page.tsx` | Server | Reads the `imports` row, Zod-parses `candidates`, renders review |
| `CandidateList` | **Client** | Selection is transient state; `useReducer`, never a global store |
| `PlaceDetail` | Server | Its data is a database read; the only client bit is the sheet it sits in |
| `PlaceSearchSheet` | **Client** | Debounced query (300 ms, ≥2 chars, one in flight) against a Server Action |

**The rule that must not be broken, written down because the mistake is natural:** the sheet is a
*sibling* of the map inside `(map)/layout.tsx`, and a "full screen" sheet is **CSS covering the map**.
`{isOpen && <MapCanvas/>}` destroys the map object, resets the camera, and is unrecoverable
mid-demo. A Playwright assertion guards it (§13).

**Data flow into components:** Server Components read Supabase under the user's JWT and pass plain
serialisable domain objects down. No component fetches its own data on mount, with exactly one
exception: `useImportStream`, which is a stream, not a fetch.

---

## 4. Data model

Full DDL, policy text and rationale: [`08-place-identity.md`](08-place-identity.md) §3. This section
is the design-level summary plus the deltas this document rules on (§14).

### 4.1 Entities

| Table | Scope | Holds | Written by |
|---|---|---|---|
| `profiles` | per user | display name; 1:1 with `auth.users` | the user |
| `sources` | **global** | one row per TikTok post: `platform_source_id` (the numeric video id — the identity), canonical URL, author handle/name, caption, thumbnail URL, fetch status | **service role only** |
| `imports` | per user | one paste event: status, stage, timings, error/degraded code, pre-confirmation `candidates` jsonb | the user (own rows) |
| `extractions` | **global** | one LLM run per `(source_id, model, prompt_version)`: candidates jsonb, counts, latency | **service role only** |
| `places` | **global** | one physical POI: our uuid, name, category, `lat`/`lng` (WGS84 doubles), address parts, provider payload, merge tombstone | **service role only** via `resolve_place()` |
| `place_provider_refs` | **global** | `(provider, provider_place_id)` aliases — many per place, unique per pair | **service role only** |
| `saved_places` | per user | the library entry + the per-user overlay: `display_name`, `category_override`, `note`, `visit_state`, `visited_at`, `origin` | the user |
| `saved_place_sources` | per user | provenance: which post(s) recommended this saved place | the user |

Three invariants the schema makes unrepresentable rather than merely discouraged:

1. **One physical place is one row.** `unique (provider, provider_place_id)` on the alias table plus
   the 75 m / same-name-key near-duplicate guard inside `resolve_place()`.
2. **The source survives forever.** `saved_place_sources` has `on delete restrict` to `sources`, and
   a deferred constraint trigger refuses to remove the *last* source of an `origin='import'` save.
3. **Nothing is saved without a tap.** Pre-confirmation candidates live in `imports.candidates`
   (jsonb), not in `places`/`saved_places`. A place row exists only after `confirmImport`.

### 4.2 Identity and dedup, restated

*Provider ids are how we find a place; our uuid is what the place is.* `resolve_place()` is the only
code path that creates a `places` row: alias hit → follow any merge tombstone and refresh; miss →
near-duplicate guard (same `name_key`, same country, ≤75 m by immutable Haversine) → add an alias to
the existing place; miss again → insert place + first alias. Concurrency is safe by
`ON CONFLICT DO NOTHING` + re-select.

### 4.3 Authorisation is RLS, not application code

RLS is `ENABLE`d **and** `FORCE`d on every table in the migration that creates it. `anon` holds no
grant on any table and is named by no policy.

- **Per-user tables:** `user_id = (select auth.uid())`.
- **Global tables:** membership-gated SELECT — a user reads a `places` row only if they hold a
  `saved_places` row pointing at it; a `sources`/`extractions` row only through their own `imports`
  or `saved_place_sources` row. **Users hold no INSERT/UPDATE/DELETE grant on any global table.**
- **Column-level `GRANT UPDATE`** on `saved_places` excludes `user_id`, `place_id`, `origin`, so
  "give my save away" is not expressible even before a policy is consulted.
- `save_place()` is `SECURITY INVOKER` (the product's most important write stays under RLS);
  `resolve_place()` / `merge_places()` are `SECURITY DEFINER` and `GRANT EXECUTE`d to
  **`service_role` only**. That grant list is load-bearing (`security.md` §1) and is a code-review
  checklist item.
- **Mechanical review test:** a service-role query never filters by `user_id`. Grep-able.

### 4.4 Geospatial model (D6 — no PostGIS)

Two `double precision` columns, WGS84 decimal degrees. Viewport = bounding-box `BETWEEN`; "near me"
= latitude-corrected bbox pre-filter refined by the immutable `km_between()` Haversine. The selective
predicate is `user_id`, not geometry: `saved_places_user_recent_idx` reduces the candidate set to a
few hundred rows before any coordinate is compared, so a GiST index would index the dimension that
is never doing the work. No extensions are created by this schema — D6 is a ruling about geometry
types. MS5's migration 0010 adds `pg_trgm` for the POI index name prefilter, which is a different
question and is decided in [`10-poi-index.md`](10-poi-index.md) §5.

### 4.5 Index plan (summary)

The full table is `08` §8. The four that matter: `sources_platform_identity` (the dedup lookup on
every paste), `ppr_provider_identity` (step 1 of resolution — the single most important index),
`saved_places_user_recent_idx` (the entry point for *every* user-scoped read, and the reason PostGIS
is unnecessary), `saved_places_place_user_idx` (serves the membership `EXISTS` on `places`).
Deliberately absent: trigram/full-text (search is `ILIKE` over ≤1 000 already-isolated rows), any
geographic index, any index on `visit_state`.

---

## 5. Central CRUD operations

The full 27-row matrix with actor, policy and cross-user outcome is `08` §7. The graded core:

| Op | Verb | What happens | Enforced by |
|---|---|---|---|
| **Create** a saved place from an import | INSERT | `confirmImport` → `save_place()` per selected candidate → `saved_places` + `saved_place_sources` | `saved_places_insert_own`, `sps_insert_own` (which also requires the caller to own an `imports` row for that source) |
| **Create** a saved place manually | INSERT | `addPlace` → `resolve_place()` (service) then `save_place()` with `origin='manual'`, no source | same |
| **Read** the map / list / near-me | SELECT | `saved_places ⋈ places`, bbox or `ILIKE` filter, ordered by recency or distance | `saved_places_select_own` + `places_select_if_saved` |
| **Read** a place detail + its TikToks | SELECT | four tables compose, each under its own policy | membership gates |
| **Update** name / category / note / visit state | UPDATE | writes land on the user's `saved_places` row — never on the shared `places` row | `saved_places_update_own` + column grant |
| **Delete** a saved place | DELETE | cascades its provenance links; the global `places` row survives for other users | `saved_places_delete_own` |

Every user-authored edit lands on the user's own row. That is the single property that makes a shared
`places` table defensible, and it is the answer to the course's "which users and permissions exist".

---

## 6. API surface

Two HTTP endpoints, five Server Actions, and everything else a Server Component read. The split is
principled, not incidental: **a long-running read-and-compute that must report progress is a Route
Handler; a short authenticated mutation is a Server Action.**

### 6.1 `POST /api/imports`

`runtime = 'nodejs'`, `maxDuration = 60`, **declared in code, never in the dashboard**.

| | |
|---|---|
| Request | `{ rawInput: string }` — Zod: non-empty, ≤2 048 chars |
| Response | `200 application/x-ndjson`, one JSON object per line |
| Auth | Supabase session required; `NOT_AUTHENTICATED` → the client redirects to sign-in preserving the pasted URL |
| Order of operations | auth → rate limit → `canonicaliseTikTokUrl` (pure; also the SSRF gate) → `getOrCreateImport` → stream → `runImport` |

Wire format (`ImportEvent`, `domain/import/events.ts`):

```ts
type ImportEvent =
  | { t: 'accepted';  importId: ImportId; idempotent: boolean }
  | { t: 'stage';     stage: 'source'|'extract'|'resolve'; status: 'started'|'done';
                      ms?: number; fact?: Record<string, string|number> }
  | { t: 'candidate'; index: number; total: number }
  | { t: 'heartbeat' }                                   // every 2s; keeps the response non-idle
  | { t: 'done';      outcome: ImportOutcome }
  | { t: 'error';     error: DomainErrorView };           // { code, retryable, importId? }
```

The client paints the accepted state from **client state on submit** — it never waits on the network
for the first frame. The rail advances only on real `stage` events; it is never driven by a timer.

### 6.2 `GET /api/imports/[importId]`

Returns the `ImportOutcome` for a resume, a reconnect, or a refresh of `/import/[importId]`. Reads
the user's own `imports` row under RLS and Zod-parses `candidates` out of jsonb before returning.

### 6.3 Server Actions

| Action | Input (Zod) | Effect | Returns |
|---|---|---|---|
| `confirmImport` | `{ importId, selections: Array<{ candidateIndex, placeRef }> }` | For each selection: `resolve_place()` (service role, if a detail fetch is needed) then `save_place()` (invoker). Sets `imports.status='completed'`. `revalidatePath('/map')` | `{ placeIds }` → client navigates to `/map` and fires the pins-landing moment |
| `addPlace` | `{ providerRef or manualPin, note? }` | Manual addition (capability 13); `origin='manual'`, no source link | `{ placeId }` |
| `updateSavedPlace` | `{ savedPlaceId, patch }` — only overlay fields | Rename / recategorise / note / visit state | `{ ok }` |
| `deleteSavedPlace` | `{ savedPlaceId }` | Deletes the library entry; the shared place survives | `{ ok }` |
| `searchPlaces` | `{ q, near?, cityHint? }` | `PlaceResolver.resolve` over a manually-built `ResolveQuery`, for the review-correction sheet and S8. **Corrected 2026-08-19:** there is no `PlaceResolver.search` — one method, `11` §2 ruling 3 | `ResolveResult` (the action returns the whole result, not a bare array: the sheet needs `regionLoaded()` to say *"we don't have Lisbon yet"*) |

Every action begins with `requireUser()` and a Zod parse of its input, and every action that mutates
ends with the narrowest `revalidatePath` that is correct.

### 6.4 Reads that are not an API

`/map`, `/place/[placeId]`, `/account` read Supabase directly in the Server Component under the user's
JWT. There is no REST layer over our own database, because RLS already is the authorisation layer
and a hand-written CRUD API would only be a second place for the same rules to drift.

---

## 7. Central business logic — the import pipeline

`domain/import/pipeline.ts`, one exported function. **The canonical signature and the six port
declarations live in `07` §10**; this is a restatement, not a second definition:

```ts
runImport(ports: Ports, input: { userId: UserId; rawInput: string }, ctx: OpCtx): AsyncGenerator<ImportEvent>
```

Pure orchestration: no `fetch`, no SQL, no React. Everything it touches is a port
(`SourceAdapter`, `ContentExtractor[]`, `PlaceExtractor`, `PlaceResolver`, `ImportStore`, `Clock` —
all six declared in `07` §10, incl. `ImportStore`'s four methods and `Clock`'s four), which is why it
is fully testable against fakes before a single adapter exists (MS6). `ctx` carries the `AbortSignal`,
the `importId` and the `Logger`; there is no separate `signal` parameter.

### 7.1 The stages

| # | Stage | Does | Failure meaning |
|---|---|---|---|
| pre | **Canonicalise** | Host allow-list (full-host equality, never suffix), strip query/fragment/locale, classify path, resolve `vm.`/`vt.`/`/t/` short links manually (≤5 hops, allow-list re-applied to **every** `Location`), extract the 17–20 digit video id | Fails closed. Also the SSRF boundary |
| A | **Source** | `sources` cache hit, else TikTok oEmbed. Rebuild the canonical URL from `author_unique_id`, never from user input | **Only stage that can fail the import outright** — with no content there is nothing to show |
| B(pre) | **Content** | `ContentExtractor[]` → `ContentPart[]`. V1: exactly one, `kind:'caption'`. The seam a future ASR implementation plugs into with no other signature change | Empty text → `NO_CAPTION` |
| B | **Extract** | Anthropic `claude-haiku-4-5`, structured output constrained by `ExtractionResultSchema`; then the pure plausibility gate drops hashtags, bare city names, all-generic strings, fabricated `evidence`, and normalised duplicates | Failure is an error state; a *zero-candidate* result is **not** a failure |
| C | **Resolve** | ≤7 candidates, concurrency 4, 3 s each, against our Overture index (Nominatim only out of region). Score `0.72·name + 0.18·category + 0.10·dataset_confidence`; band by `score ≥ 0.92 ∧ margin ≥ 0.05` → `preselect`, `≥ 0.80` → `confirm`, else `no_match` (the `ConfidenceBand` enum, `07` §10) | **Never fails the import.** It degrades to unresolved rows |

The asymmetry is the design. It is what makes partial success structural rather than exceptional.

### 7.2 Budgets (`domain/import/budgets.ts`, one exported constant object)

Global deadline **25 s** on one `AbortSignal`; per-attempt: short link 4 s ×0, oEmbed 4 s ×2 with
jittered backoff, extraction 10 s ×1 (transport only), resolution 3 s ×1 per candidate.
`MAX_CANDIDATES = 7` (extras are kept and rendered as `capped`, never silently dropped),
`MAX_PROVIDER_REQUESTS_PER_IMPORT = 7`, `MAX_LLM_CALLS_PER_IMPORT = 2`, imports/user/day per D11.
Cancellation is checked **between** stages only — a half-cancelled LLM call is billed anyway and an
abandoned oEmbed fetch throws away a cache write.

### 7.3 Outcomes

```ts
type ImportOutcome =
  | { kind: 'ready';         importId; source: SourceView; candidates: Candidate[];
                             degraded?: 'PLACE_PROVIDER_UNAVAILABLE' }
  | { kind: 'no_places';     importId; source: SourceView }
  | { kind: 'already_saved'; importId; placeIds: PlaceId[] }
  | { kind: 'failed';        importId; error: DomainErrorView };
```

`kind:'ready'` is returned if stage B produced ≥1 candidate, however resolution went. **`no_places`
is an outcome, not an error** — at the measured LEVEL B it is the modal result (~73%, `04` §4), and
modelling the most common result as an error would poison every log, metric and screen.

### 7.4 Idempotency, caching and resumption

The **numeric video id is the key**; there is no client-supplied idempotency token.

| Situation | Behaviour |
|---|---|
| Same user, same video, open import <24 h | Return that import; `accepted` carries `idempotent:true`. A `review` row replays its terminal state instantly |
| Same user, already completed | `already_saved` → navigate to the saved place(s). No pipeline run |
| Double submit | The partial unique index makes the race safe: the loser re-selects the winner |
| **Different user, same video** | New `imports` row, but stage A is a `sources` cache hit and stage B an `extractions` cache hit when `(model, prompt_version)` match. Cost ≈ 0 upstream calls, ≈ 0 tokens |
| Retry after failure | Same row, status back to `processing`, attempt counter incremented, counts against the rate limit |

Each stage writes its output before the next begins, so **resumption is re-execution over cached
outputs** — a property of the data model, not a promise about the runtime. We do not claim the
function survives a disconnect; we claim only the unfinished stage re-runs. Cleanup of expired
pre-confirmation rows is an opportunistic `delete … where expires_at < now()` on the map page's data
load, not a cron job.

### 7.5 Observability

No new infrastructure. The `imports` row is the audit record (`status`, `stage`, `error_code`,
`degraded_code`, `ms_source`, `ms_extract`, `ms_resolve`) — p50/p95 per stage is one
`percentile_cont` query, which is exactly the evidence the scale document needs. One structured log
line per stage transition: `{ event:'import.stage', importId, videoId, stage, ms, outcome }`.
**Never log the caption; never log coordinates.** An `error_code = 'INTERNAL'` in the logs is always
a bug report.

---

## 8. State management

There is no client state library. Five kinds of state, each with exactly one home:

| State | Home | Why not elsewhere |
|---|---|---|
| Persisted data (places, imports, profile) | The database, read in Server Components | A client cache would be a second source of truth for data that changes on the server |
| Route / surface (which sheet is open, which place) | **The URL** — S5/S6/S7/S8 are real routes | Refresh, back and shared links must work; this is also why the map must not remount |
| The map instance + camera | `MapCameraProvider` context in `(map)/layout.tsx`, plus a module-scope singleton mirrored to `sessionStorage` | The camera must survive navigation *and* an unexpected remount by a future edit |
| Import progress | `useImportStream` reducer, fed only by `ImportEvent`s | Progress that can be faked will be faked; the rail must be event-driven |
| Review selection, sheet stop, search query | `useReducer`/`useState` in the owning client island | Transient, never in the URL (a sheet stop must not create history entries) |

**The four authorised camera movers** (`useMapCamera()`): the user selected a place; an import
landed; "near me"; a cluster was expanded. **The route is not one of them** — a leaf route may
*request* a move on first mount, guarded so it fires once per `placeId`, but a re-render must not
move the camera. Mutations are followed by `revalidatePath`, so the server stays authoritative and
no client store has to be invalidated by hand.

---

## 9. Error handling

`DomainError` is a closed discriminated union in `domain/errors.ts`. Integration adapters catch every
vendor exception and map it: **no provider error object, message, status code or stack ever reaches
the client.** The wire carries `DomainErrorView = { code, retryable, importId? }` — a code and two
booleans. Copy lives in one client-side map (`ui/system/ErrorState.tsx`), so the wire format carries
no prose and error copy is not a deploy of the backend.

| Code | Stage | Retryable | Surface |
|---|---|---|---|
| `UNSUPPORTED_HOST` · `MALFORMED_URL` · `UNSUPPORTED_URL` · `PHOTO_POST` | pre-A | no | Inline on the URL field, before any network call |
| `SHORT_LINK_UNRESOLVED` | A1 | no | "This share link has expired…" |
| `POST_UNAVAILABLE` | A2 | once | **F9 — the single honest state.** Private / deleted / region-locked are VERIFIED indistinguishable, and we do not guess |
| `UPSTREAM_TIMEOUT` · `RATE_LIMITED_UPSTREAM` | A | yes | F9 with Retry primary |
| ~~`RATE_LIMITED_LOCAL`~~ | — | — | **Retired 2026-08-31.** Named a per-user limiter that was never built, so it had a screen and a 429 and no producer. Returns with its producer, in one commit, when the limiter is (`07` §9). |
| `NO_CAPTION` | A/B seam | no | F10 variant → manual place search |
| `EXTRACTOR_UNAVAILABLE` · `EXTRACTOR_INVALID_OUTPUT` | B | yes | F9 with Retry (cheap — the source is cached) |
| `EXTRACTOR_QUOTA_EXHAUSTED` | B | **no** | The day's model allowance is spent. Its own screen — the read succeeded, so no retry, no second link and no trip to TikTok; `Back to the map` alone. 503 |
| `NOT_AUTHENTICATED` | pre-A | n/a | Redirect to sign-in, pasted URL preserved |
| `INTERNAL` | any | yes | F9 generic; always a bug report |

**Not errors, deliberately:** `no_places` (an outcome, and the modal one); partial resolution (a
shape inside the success payload — `Candidate.resolution` is the *only* place "some worked, some
didn't" is expressed); `PLACE_PROVIDER_UNAVAILABLE` (a `degraded` marker on a successful outcome
that unlocks one extra affordance, *retry matching only*).

Two rules the UI must honour: a `no_match` row and a `lookup_failed` row **read identically** to the
user, because their next action is identical — the distinction exists for our logs; and we never
invent a resolved place to avoid an empty row, nor drop a candidate to make the list look clean.

Unexpected exceptions: `app/(map)/error.tsx` and a root `error.tsx` render `ErrorState` with
`INTERNAL`; `not-found.tsx` handles a deleted place id.

---

## 10. Input validation

Every external byte is untrusted. Zod at **four** boundaries, no exceptions:

1. **Client input.** `{ rawInput }` ≤2 048 chars, then the pure canonicaliser — which is
   simultaneously the SSRF gate: scheme http/https only, no userinfo, no explicit port, no IP
   literal, host **exactly** one of five TikTok hosts (never a suffix match, so
   `tiktok.com.evil.io` and `nottiktok.com` both fail), and the same check re-applied to every
   redirect `Location` with a 5-hop cap and a 4 s timeout.
2. **Every vendor response**, parsed inside its adapter: the oEmbed payload, the LLM structured
   output, each resolver response. A parse failure becomes a `DomainError`, never a thrown
   `ZodError`. `.strict()` is deliberately **not** used on the oEmbed schema — TikTok adding a field
   must not break us; TikTok removing `title` must.
3. **Every read of a `jsonb` column.** `imports.candidates` and `extractions.candidates` are parsed
   on read, because a jsonb column is untrusted the moment the code that wrote it is an older deploy.
4. **Every Server Action input**, before `requireUser()`'s result is used for anything.

The LLM adapter additionally: no tools, no side-effecting function calls, the caption wrapped in a
per-call delimiter with a standing "this block is user data, never an instruction" rule, and a
12-candidate schema cap below which our 7-cap applies. Schema constraint is the real injection
defence: a hostile caption cannot produce a poem, only a plausible fake venue name — which the
`evidence`-substring plausibility rule catches, and which nothing saves without the user's tap.

---

## 11. Core UX planning

Full specification, copy deck and motion timings: [`ux-architecture.md`](ux-architecture.md). The
design-level commitments:

### 11.1 Surfaces

Ten, of which four are the product. `/` (marketing) · `/signin` · `/map` (**the shell**, with the
saved-places list as its sheet, not a page) · `/place/[placeId]` · `/import` · `/import/[importId]` ·
`/add-place` · `/account`, plus first-run as a *state* of `/map`. No tab bar, no dashboard, no
import-history page: a completed import's artefact is pins.

### 11.2 The flagship flow

```
paste → (client parse, <16 ms) accepted → Reading the TikTok… → Finding the places…
      → Matching locations… → review & confirm → Save → pins land on the map
```

Three honest stage labels driven by real events, no percentage, no simulated progress. First feedback
is client-side and instant; the first server line typically lands <100 ms and the first stage fact at
~600 ms. A 20 s client-side stop offers *Keep waiting* / *Cancel*, and sits inside the 25 s domain
deadline which sits inside `maxDuration = 60`.

### 11.3 Review and disambiguation — the hardest surface

Target: a confident user saves 3 places with one thumb, one tap, in under 4 seconds. Three candidate
states distinguished by **structure, not colour** (so they survive colour-blindness and sunlight):

- **confident** (`preselect`) — compact, pre-ticked, with `Not this ›` revealing up to 2 alternates;
- **ambiguous** (`confirm`) — taller, not ticked, stacked branch options; choosing a branch *is* the
  selection;
- **unresolved** (`no_match`, `lookup_failed`, `capped`) — contains an action: `Search for it`,
  opening the shared search sheet **prefilled with the name exactly as the caption wrote it**.

The Save button carries a live count and is always the truth. `Nothing is saved until you tap Save.`
is on screen. Ambiguous and unresolved rows are never swept in by a bulk action.

### 11.4 Failure and empty states

`NO_PLACES_FOUND` is the **modal outcome** and gets a first-class screen — never a red toast — with
two routes out: manual POI search with the TikTok link attached, and *open the video*. The recoveries
across the whole product are exactly three: **retry**, **open the original TikTok**, **add a place
you already know**. Asking the user to paste the caption is not a recovery route and does not exist
anywhere in the product (charter §2). A new user is never shown a bare empty map.

### 11.5 Map

One GeoJSON source. **Density clustering is removed — owner ruling 2026-08-28** (`L1-F5-T5`); the
superseded design was `cluster:true` with `clusterRadius:50`, `clusterMaxZoom:13`,
`clusterMinPoints:3`. Saved places render as individual pins at every zoom; the only summarisation
kept is a **world-zoom country summary** at L2. See `06-map-and-places-decision.md` §9.1. pins are **sprite images in a symbol layer, not DOM markers** — at most two
DOM markers ever exist (the user's location and the selected place), because every `Marker` is a DOM
node the browser re-transforms on every frame of every pan. Selection is a feature-state change,
never a source re-render. Below ~2 000 places the user's whole set is fetched once (~5 KB for 50) and
kept client-side. Attribution: "© OpenStreetMap" visible on the map. The user's live position is
never persisted server-side and never appears in a URL or a log line.

---

## 12. Configuration, environments and secrets

| Variable | Where | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | yes, by design (RLS is the boundary) |
| `NEXT_PUBLIC_TILE_URL` / tile key | browser | public by design; URL-restricted |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only**, never in a `NEXT_PUBLIC_*` name | no |
| `ANTHROPIC_API_KEY` | **server only**, read in exactly one adapter | no |
| `IMPORT_RATE_LIMIT_*` | server | no |

Preview and production are separate Supabase projects in `eu-central-1`, co-located with the Vercel
function region (`fra1`) — set up and verified in MS2 (`ms2-cloud-setup.md`). Migrations reach an
environment only through `supabase/migrations/`; no change is ever made in the dashboard.
`/healthz` returns `{ ok, stage, commit }` so a deploy is identifiable without hand-set env vars.

---

## 13. What this design commits QA to

Detail lands in `test-specification.md` (MS13). The tests that are *load-bearing for this design*,
i.e. the ones whose absence would let the design degrade silently:

1. **The canonicaliser table** from `04` §2 — every URL form, plus `tiktok.com.evil.io` and
   `nottiktok.com` failing closed. This test is the SSRF boundary's regression test.
2. **The 44-case resolution benchmark** — the TypeScript scorer must reproduce 29/29 correct
   preselects and **zero false auto-accepts**.
3. **Double-paste idempotency** — one place, one library entry, a second source link only if the
   source differs.
4. **Cross-user RLS denial** as SQL: user B selecting user A's `saved_places`, `places` and `sources`
   returns **zero rows**. The failing attempt is committed as a test — the strongest permission
   evidence we can show.
5. **Map camera stability** in Playwright: `/map` → `/place/[placeId]` → back → `/import` → back, assert
   `getCenter()`/`getZoom()` unchanged and the map object identity stable.
6. **The golden path** end-to-end against a deployment, not a laptop.

---

## 14. Reconciliations this document rules on

Where upstream documents disagreed, these are the rulings. Each is a small delta to `08` §3, to be
applied when MS4 writes the migrations.

| # | Conflict | Ruling |
|---|---|---|
| R1 | `07` calls the post id `external_id`; `08` calls it `platform_source_id` | **`platform_source_id`** everywhere in SQL; `Source.externalId` in TypeScript. One rename at the adapter boundary, which is where names are translated anyway |
| R2 | `07` wants six import statuses (`running/ready/no_places/failed/confirmed/abandoned`); `08` declares five (`processing/review/completed/failed/cancelled`) | Canonical set is **six**: `processing · review · no_places · completed · failed · cancelled`. `no_places` is a distinct terminal status because the resume query and the F10 screen both need to distinguish "read it, found nothing" from "found candidates" — and because a status that hides the modal outcome would hide our most important metric |
| R3 | `07` needs `stage`, `error_code`, `degraded_code`, `ms_source/ms_extract/ms_resolve`, `extractor_version`, `prompt_version`, `expires_at`, `attempt_count` on `imports`; `08` omits them | **Added to `0003_sources.sql`'s `imports` table.** They are the observability story (§7.5) and the audit record, and they cost one migration now versus a rewrite later. `expires_at` defaults to `created_at + 24h` |
| R4 | `08` has `imports.source_id NOT NULL`, but `07` needs an import row before stage A completes | The `sources` row is inserted **first**, at canonicalisation time, with `fetch_status='pending'` — the video id is known before any network call. `NOT NULL` stands, and the pending row is also what makes the concurrent-paste race resolvable |
| R5 | `07`'s idempotency index is on `(user_id, external_id)` | Restated as a partial unique index on `imports (user_id, source_id) where status in ('processing','review','no_places','failed')` |
| R6 | `07` defers a `place_lookups` cache to D2; `06` §6.4 rules that open-data hits may be cached permanently and Nominatim hits for 90 days | The cache **exists**, behind `PlaceResolver`, keyed on `sha256(normalised_candidate + region_id + category_hint)`. The domain does not know whether it exists |
| R7 | `08` grants the user `UPDATE (candidates)` on `imports`; `security.md` §3 item 9 asks whether that should be revoked | **Revoked in this design.** `candidates` is written only by the server that produced it; the user's only legitimate import writes are `status` (cancel) and `completed_at`. Nothing in the UI needs more, and a user-writable review payload is a needless forgery surface |
| R8 | `07` says `sources` has **no** user-facing select policy at all; `08`/§4.3 give it a membership-gated SELECT including `content_text` | The **policy stands** — place detail and the rail's stage fact need `canonical_url`, `author_handle`, `author_name`, `thumbnail_url` — but **`content_text` is not in the grant to `authenticated`**. `07`'s objection was about the caption specifically, and no surface in the product displays post text (`ux-architecture` §12, `product-specification` V5/T5); its only consumer is `ContentExtractor` under the service role. RLS is row-level, so a column-level `GRANT` is the only mechanism that can withhold it — the same pattern `saved_places` already uses for UPDATE |
| R9 | `07` has `imports.user_id → auth.users`; `08` has `→ profiles` | **`profiles`.** Which makes a profile row a hard precondition of the first import, and nothing in `08` created one: `handle_new_user()` on `auth.users` is added to `0002`. The user's own INSERT grant on `profiles` stays as the fallback if that trigger cannot be created on a hosted project |
| R10 | `08` grants the user `INSERT` and `DELETE` on `imports`, and `imports_insert_own` checks only `user_id` — so a user could insert an import naming any `source_id` and thereby gain read access to that source row | **Both grants revoked; the INSERT policy is gone.** An import is created only by `start_import()` (`0007`), `SECURITY DEFINER`, `service_role` only, which inserts the pending `sources` row (R4) and the `imports` row in one transaction and returns the existing open import instead of a duplicate (R5). The forgery vector stops being a policy question. DELETE goes with it: `imports` is the audit and observability record of §7.5, `cancelled` is a status, and expiry belongs to the service role |
| R11 | R6 rules that `place_lookups` exists, but `08` §3 gives it no DDL and MS4 is scoped to eight migrations | Created in **`0007`**, beside the resolver it serves. RLS enabled and forced, no grant and no policy to any browser-reachable role — it is a server-side cache. `expires_at` is nullable: null means cache permanently (open data), set means a TTL (`06` §6.4's 90 days for Nominatim). The caller decides, so the schema assumes no provider mix |
| R12 | `08` §3.8 puts the policy tests in `supabase/migrations/0008_policy_tests.sql` | Moved to **`supabase/tests/0008_policy_tests.sql`**. A migration is applied to every environment and this file creates two fixture users in `auth.users`; those must never reach production. CI runs it against a fresh `supabase db reset`, inside a transaction that is rolled back, so acceptance **P3** is still a build gate |

---

## 15. Open items carried into implementation

Named here so they cannot be forgotten, with who owns them and what they block.

| # | Open | Owner | Blocks |
|---|---|---|---|
| 1 | The **Vercel-egress oEmbed probe** (`04` §6) — the one untested mechanism risk | DevOps + Social | MS7's exit gate. A laptop-only demo is a project failure |
| 2 | ~~D2's **security/licensing sign-off** (`06` §11)~~ — **CLOSED 2026-08-18** by splitting §11: Q1 answered, Q2 (OSM alias share-alike) narrowed and deferred to the first milestone that writes an ODbL-derived row, which MS5 is not | Security + Geospatial | Nothing. MS5's ingest design is settled in `10` |
| 3 | The **caption-retention ruling** (`04` §8 Q4) | Security | Only the `sources` column set and TTL. The seams and every rule in §7.4 are unchanged either way |
| 4 | **D11 rate-limit values and the monthly cost ceiling** | DevOps + Security | The constants in `budgets.ts`, not their shape |
| 5 | The full **M9 security document** (`security.md` is INTERIM) | Security | MS14; the largest known deliverable gap |
| 6 | **Thumbnail posture** — hot-link a signed 6-month URL or copy the bytes (`04` §8 Q6) | Security | Place detail imagery only; both options are one adapter change |
| 7 | The **50-post golden set** and the threshold re-fit (`09` §8) | AI + QA | MS15, and the honesty bar in `product-specification.md` §7.1 |

None of these blocks MS4. That is deliberate: the schema, the ports and the pipeline shape are
decided, and every open item above moves a constant, a column set, or a document — not a seam.

---

## 16. What is deliberately not built

Naming these is part of the design, because the course grades justification and every one of them is
a thing a reviewer might expect to see.

| Not built | Because |
|---|---|
| A job queue, worker, or cron | ~8 s of measured work against a 300 s platform limit. The two tables we need anyway *are* the persistence a queue would require, so adding one later is additive |
| Redis / KV cache | `sources` and `extractions` are the cache, in the source of truth |
| A REST/CRUD API over our own database | RLS is the authorisation layer; a hand-written API would be a second place for the same rules to drift |
| A client state library | Five kinds of state, five homes (§8) |
| A DI container | Function parameters |
| A multi-LLM abstraction | One port, one adapter. A second model is a second file |
| Parallel / intercepting routes for the sheets | They solve overlaying a modal on a *different page*; we swap a sibling next to a persistent map. One sentence of explanation beats a documentation page (M11) |
| PostGIS, trigram, geographic indexes | The selective predicate is `user_id` (§4.4) |
| Instagram / YouTube adapters | `05` — deferred by ruling, re-enter through `SourceAdapter` |
| ASR / OCR / vision | Charter §4. The `ContentExtractor` seam exists and stays empty |
| i18n of error copy | One code→copy map, English, client-side |

---

## 17. Course requirement M4 — traceability

| M4 asks for | Section |
|---|---|
| Folder structure | §2 |
| Core component structure | §3 |
| DB schema | §4 (+ `08` §3 for the DDL) |
| Central CREATE / READ / UPDATE / DELETE operations | §5 (+ `08` §7 for all 27) |
| API description | §6 |
| Central business logic | §7 |
| State management | §8 |
| Error handling | §9 |
| Input validation | §10 |
| Core UX planning | §11 (+ `ux-architecture.md`) |

---

## Change log

- **2026-08-18** — MS4 pre-flight review. Five further reconciliations (R8–R12) recorded above:
  the caption is withheld by column grant, `profiles` wins the `user_id` reference and gains a
  signup trigger, `imports` becomes server-created only, `place_lookups` gets a home, and the policy
  tests move out of `migrations/`. Two defects in `08` §3's SQL fixed: `resolve_place`'s
  concurrent-insert path left an aliasless `places` row that the deferred `places_alias_required`
  trigger would have aborted the transaction over at COMMIT, and both constraint trigger functions
  referenced a record that does not exist for the trigger that fires — which would have made *every*
  `places` insert fail at COMMIT. Record: [`ms4-database.md`](ms4-database.md).
- **2026-08-18** — First version. Assembles `04`, `06`, `07`, `08`, `09`, `ux-architecture` and
  `product-specification` into one design; rules on the seven reconciliations in §14; records the
  seven open items in §15. Written before MS4 writes any application code, per `03` gap 3.
