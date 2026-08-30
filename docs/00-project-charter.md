# Project Charter — "Save the internet to your map"

> Status: **v2 — planning phase.** This document is the shared context every expert agent loads
> before contributing. If a decision here is wrong, change *this file* — do not work around it.
>
> **v2 supersedes v1.** Changes: TikTok is the primary V1 platform (Instagram secondary, YouTube
> optional); **manual caption/text paste by the user is removed as a V1 capability**; manual *place*
> addition survives as a separate map feature; the university requirements in
> [`03-university-requirements.md`](03-university-requirements.md) are now a binding second contract.

---

## 1. The product, restated precisely

A **personal geographic recommendation library** delivered as a responsive web application.

The user pastes a **TikTok** post URL. The system retrieves usable information about that post
through permitted mechanisms, uses an LLM to extract candidate real-world places from that content,
resolves each candidate against a places provider to obtain a real POI with coordinates, lets the
user confirm or correct ambiguous matches, and persists the confirmed places to the user's private
map — permanently linked back to the post that recommended them.

The map is not a feature of the product. The map **is** the retrieval interface. Location replaces
search as the primary way the user finds their own saved recommendations.

What it is not:
- not a travel itinerary planner
- not a social network (no follows, no public profiles, no creator discovery in V1)
- not a place-discovery engine — it only ever shows the user places *they* saved
- not a video-understanding system in V1
- **not a manual map with an optional import feature** — the TikTok conversion is the product

## 2. The primary user problem

Recommendations arrive as TikToks and are saved inside TikTok, where they are stored in
reverse-chronological, unstructured, non-geographic, unsearchable lists.

The saved item is a *video*, but the thing the user actually wanted was a *place*. The platform
never performs that conversion, so retrieval fails at exactly the moment of intent:

- "I'm in this neighbourhood right now — what did I save near me?"
- "I land in Tokyo Thursday — what do I already have there?"
- "I want dinner tonight and I don't want to scroll."

The cost is not storage, it is **retrieval**. Users have already collected the value and cannot get
it back out. Our job is the conversion from post to place, and geographic retrieval after it.

Two corollaries that drive V1 priorities:
1. Import friction is the most important quality attribute — the product has **zero** value at zero
   saved places and strong value at ~20+.
2. Because the whole proposition is "the app does the conversion for you," **asking the user to
   copy any text out of TikTok defeats the product.** A failed import is an honest failure state; it
   is never a request for the caption.

## 3. The core product loop

```
Paste TikTok URL → acquire source content → extract candidates (LLM, schema-constrained)
                 → resolve candidates (places provider) → review / disambiguate
                 → save → explore on map → retrieve by location
```

The pipeline is separated into named stages so a future media analyser can replace one of them
without touching the others:

```
Source acquisition → Content extraction → Place extraction → Place resolution → Confirmation → Persistence
```

Invariants:

1. **Every stage can fail, and every failure has a designed recovery path.** The recoveries are
   *retry*, *open the original TikTok*, and *add a place you already know by name* — never "paste
   the caption."
2. **Nothing is written to the user's map without user confirmation.** High-confidence results may
   be pre-selected, never silently saved.
3. **The source URL survives forever** on the saved place. "Which TikTok made me save this?" is
   always answerable.
4. **The same physical place is one row**, referenced by many sources — never duplicated per import.
5. The pipeline is **observable**: a silent import failure is the worst outcome in this product.
   Whether it is also *asynchronous* is a measured decision, not an assumption — see
   [`07-import-execution-model.md`](07-import-execution-model.md).

## 4. V1 boundaries

**Platform priority is not negotiable:** TikTok is the flagship and is built first, alone.
Instagram is secondary and must not block V1. YouTube is optional and only justified if it is
nearly free via the same source abstraction. Quality of TikTok support outranks platform count.

**In scope (committed):**

| # | Capability |
|---|---|
| 1 | Authentication (Supabase Auth) |
| 2 | Paste a TikTok URL; validate and canonicalise it (short links, tracking params, locales) |
| 3 | Acquire usable post content through permitted mechanisms — no user text entry |
| 4 | LLM extraction of 0..N place candidates with schema-validated structured output |
| 5 | Resolve candidates to real POIs with coordinates, provider id and category |
| 6 | Review: confirm / disambiguate / reject each candidate before anything is saved |
| 7 | Designed failure state when a TikTok cannot be read — retry, open original, or add a known place |
| 8 | Persist confirmed places, deduplicated, linked to the source TikTok(s) |
| 9 | Interactive map of saved places with a premium custom style (density clustering removed by owner ruling, L1-F5-T5) |
| 10 | User location on permission, and "what have I saved around here?" retrieval |
| 11 | List view with text search and category filter over saved places |
| 12 | Place detail view with useful info and a link back to the original TikTok |
| 13 | Manual place addition (search a POI by name → select → save) as a secondary map capability |
| 14 | Genuinely touch-designed responsive UI (bottom sheets, thumb reach, safe areas) |

Capability 13 is deliberately secondary. It earns its place because it provides meaningful CRUD for
the course requirements, gives the map an independent recovery path, and exercises the same place
infrastructure the TikTok pipeline needs — but the product is never presented or built as a manual
map first.

**Explicitly out of scope for V1:** manual caption/description/transcript entry by the user; social
graph; public profiles; creator discovery; itinerary generation; video/audio/OCR analysis;
screenshot import; recommendation ranking; gamification; offline mode; native apps; PWA install and
share-target.

**Scope change, 2026-08-30 (owner-instructed):** shared collections moved into V1 and shipped
(`0024`–`0026`, `src/app/collections/**`); public profiles and the social graph stay out.

**Architecture must stay open to** (without building): additional source platforms behind a
`SourceAdapter` seam, and a future media analyser behind a `ContentExtractor` seam so audio
transcription or OCR can supplement text metadata — but only where the openness costs nothing today.

## 5. Non-negotiable engineering principles

- Strongly typed end to end; no `any` at module boundaries.
- Layered: `ui` → `app` (server actions / route handlers) → `domain` → `integrations`. Domain logic
  never imports a vendor SDK; every external service sits behind an interface we own.
- All external content — TikTok metadata, LLM output, provider responses — is **untrusted input**
  and is parsed through a Zod schema before it reaches the domain.
- LLM output is schema-constrained (tool/JSON-schema mode). We never regex prose.
- Secrets are server-only. The browser sees only the Supabase anon key and a URL-restricted map
  token that is public by design.
- Postgres is the source of truth; RLS is enabled on every user-owned table and is treated as the
  real authorisation boundary, not a backstop. Service-role keys never serve user-scoped reads.
- Cost and abuse are design inputs: imports are authenticated and rate-limited, with a hard ceiling
  on provider calls per import.
- Tests target the seams that break: URL canonicalisation, extraction schema, resolution scoring,
  dedup, RLS policies, and the end-to-end golden path.
- **Explainability is a first-class constraint** (course requirement M11/R1): prefer the
  understandable architecture over the clever one, and introduce no infrastructure that cannot be
  justified in one plain sentence to an examiner.

## 6. Product quality bar

The intended impression is **premium consumer software**, and the map style is the brand. Design
authority rests with our own tokens (type, space, radius, elevation, motion, surfaces); Radix /
shadcn supply behaviour and accessibility only, never visual identity.

The user is never shown implementation vocabulary. No "metadata", "LLM", "geocoder", "extraction
pipeline". The product speaks human: *Reading the TikTok… · Finding the places… · Matching
locations… · 3 places found*.

Motion is scoped to **five signature moments**, done exceptionally:

1. TikTok URL accepted
2. Processing / place discovery
3. Candidate results appearing
4. Pins entering the map
5. Place detail and save interaction

The TikTok import is the product's magic moment; animation effort goes there first.
`prefers-reduced-motion` is honoured throughout. 60fps on a mid-range phone is an acceptance
criterion, not an aspiration.

## 7. Where the product premise is genuinely at risk

Ranked. Detail and verification tasks in [`02-risks-and-unknowns.md`](02-risks-and-unknowns.md).

1. **TikTok content access is the single blocking dependency.** With manual caption entry removed,
   the product exists only if a pasted TikTok URL can be turned into usable text server-side, from
   Vercel's IPs, through permitted mechanisms. This is investigated before anything else and its
   verdict is recorded in [`04-tiktok-feasibility.md`](04-tiktok-feasibility.md).
2. **Map provider and places provider may not be legally mixable**, and providers constrain how long
   we may store place data — while we must store coordinates forever. Settled in
   [`06-map-and-places-decision.md`](06-map-and-places-decision.md).
3. **Ambiguity is the normal case, not the edge case.** Chains have many branches; many TikToks name
   no place at all. Disambiguation UX is core product surface, not error handling.
4. **Delayed value.** A new user's map is empty and therefore worthless. Onboarding must land the
   first few places in the first session.
5. **A demo that only works on the developer's laptop is a project failure.** Any TikTok mechanism
   must be proven from Vercel before implementation is considered finished.
6. **The mobile paste flow cannot be as frictionless as it sounds.** A web app cannot appear in the
   iOS share sheet. The honest target is: switch app, one screen, one field, paste, instant feedback.

## 8. Decisions that must be made before implementation planning

Owners are agent roles from [`01-agent-roster.md`](01-agent-roster.md).

| ID | Decision | Owner | Recorded in |
|----|----------|-------|-------------|
| D1 | TikTok capability level (A/B/C) and the exact supported-content boundary | Social Integration | `04-tiktok-feasibility.md` |
| D1b | Instagram / YouTube status for V1 | Social Integration + Product | `05-secondary-platforms.md` |
| D2 | Map provider + places provider pair, including licensing compatibility | Geospatial + Security | `06-map-and-places-decision.md` |
| D3 | Import execution model — simplest mechanism that fits measured latency | Architect + DevOps | `07-import-execution-model.md` |
| D4 | Confidence model: how auto-accept vs ask-user is decided | AI + Geospatial + Product | `09-extraction-and-resolution.md` |
| D5 | Place identity and dedup key | Database + Geospatial | `08-place-identity.md` |
| D6 | PostGIS vs plain lat/lng queries at our scale | Database | `08-place-identity.md` |
| D7 | LLM provider, model, and the abstraction's shape | AI Engineer | `09-extraction-and-resolution.md` |
| D8 | Auth methods offered | Security + Product | `docs/security.md` |
| D9 | Visual direction and map style; tokens locked before components | UX + Design System | `docs/technical-design.md` |
| D10 | Test strategy depth appropriate to the timeline | QA | `docs/test-specification.md` |
| D11 | Rate limits and per-user cost ceilings | DevOps + Security | `docs/scale.md` |

## 9. Working agreement between agents

- Agents challenge each other by default. A proposal is not accepted until the roles it affects have
  responded.
- Every claim about a third-party capability is labelled **VERIFIED** (tested, with evidence),
  **ASSUMED** (plausible, untested), or **UNAVAILABLE**. Design may only depend on VERIFIED.
- Disagreements are resolved, not preserved: record the tradeoff and the decision, then move on.
  Complexity is never retained just to satisfy every agent.
- The Product Lead breaks ties on scope. The Architect breaks ties on structure. Neither overrides a
  Security veto on data exposure.
- MVP discipline outranks completeness. When the schedule is threatened, we cut scope, never the
  quality of the core loop.

## 10. Document map

| Document | Contents |
|---|---|
| `00-project-charter.md` | this file — shared context and the scope contract |
| `01-agent-roster.md` | the eleven expert roles and their mandates |
| `02-risks-and-unknowns.md` | unknowns, assumptions, risks, and flagged over-complexity |
| `03-university-requirements.md` | course requirements checklist and traceability matrix |
| `04-tiktok-feasibility.md` | Priority Zero investigation; TikTok GO/BLOCKED verdict |
| `05-secondary-platforms.md` | Instagram / YouTube status |
| `06-map-and-places-decision.md` | map rendering + place resolution provider decision |
| `07-import-execution-model.md` | how the import pipeline executes on Vercel |
| `08-place-identity.md` | what one physical place is; dedup; PostGIS decision |
| `09-extraction-and-resolution.md` | AI extraction contract and resolution scoring |
| `10-poi-index.md` · `11-resolver-vocabulary.md` | the POI index schema, ingest and resolver vocabulary |
| `mvp-plan.md` · `execution-plan.md` · `current-state.md` | the plan of record, the running status, the cold-start document (with `working-agreement.md`, `git-workflow.md`, `agent-guardrails.md` for how the work is done) |
| `product-specification.md` · `technical-design.md` | course deliverables — product spec, technical design |
| `security.md` | course deliverable (M9) — interim; its §3 lists what is still owed |
| `implementation-plan.md` | the decision ledger and the M3 architecture answer |
| `test-specification.md` · `scale.md` · `deployment.md` · `how-the-system-works.md` | course deliverables — **NOT YET WRITTEN** |
