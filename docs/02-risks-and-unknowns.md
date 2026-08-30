# Unknowns, Assumptions, Risks

> **v2 — supersedes v1.** The v1 "manual caption paste" contingency has been withdrawn by the
> project owner: the product must convert a TikTok URL without asking the user to copy any text.
> TikTok is the primary platform. See [`00-project-charter.md`](00-project-charter.md) §4.

Labels: **VERIFIED** (tested, evidence committed) · **ASSUMED** (researched, untested) ·
**UNAVAILABLE** (confirmed impossible). Design may only depend on VERIFIED.

---

## R0. The schedule is the dominant constraint

The course deadline is **6 September 2026** — 7 calendar days from 30 August 2026.

This is not a semester-long build; it is a sprint. Consequences, which every other decision in this
repo must respect:

- The 15-milestone roadmap must be compressed into a strictly **ordered** plan with explicit cut
  lines and rough effort sizes. Deliberately *not* a day-by-day calendar (owner's instruction): the
  plan names what is abandoned if the milestone before it runs long, not which date it happens on.
- **No provider or library may be chosen for its ceiling.** Choose for time-to-working: best free
  tier, fastest key acquisition, best docs. Anything requiring an application, an app review, or a
  business verification is effectively unavailable.
- Instagram is almost certainly POST-V1 on time grounds alone, independent of technical feasibility.
- The five course documents (spec, technical design, test spec, scale, security) are graded artefacts
  and must be treated as deliverables with reserved time, not written the night before.
- Milestone 0 (the TikTok spike) must complete within the first 1–2 days. If TikTok is BLOCKED, the
  pivot must happen immediately while there is still time to build something else.

## A. Technical unknowns (resolved by experiment, not reasoning)

### A1. TikTok content access — the single blocking dependency
**CLOSED (D1) — mechanism LEVEL A, product outcome LEVEL B.** Public oEmbed is VERIFIED from a server
context and returns the full caption with no auth, key or cost ([`04`](04-tiktok-feasibility.md)); the
Display API is scoped to the caller's own videos and never served this use case. The residual risk is
yield, not access: only ~27% of recommendation captions name a resolvable venue, so **"no places
found" is the modal outcome** and a designed surface. Audio transcription behind the
`ContentExtractor` seam stays designed, flagged off and post-V1.

### A2. Places / map provider pairing
**CLOSED (D2), then amended twice.** MapLibre GL 6 + the keyless CARTO basemap (Protomaps dropped
2026-08-21), and a `PlaceResolver` whose canonical source is **Google Places** (owner ruling
2026-08-28) with the Overture `poi_index` as the second adapter. Coverage of small independent venues
decided it, and is why the open-data-only answer did not survive. Two constraints carry forward from
[`06`](06-map-and-places-decision.md): Google content may not be rendered on a non-Google map (§3.1,
VERIFIED), which is why production still resolves via Overture; and only open data may be stored
forever, which is why a Google-resolved row keeps its provenance.

### A3. Import execution model on Vercel
**CLOSED (D3) — the pipeline fits in one request.** Measured latency sits well inside Vercel's limit,
so the answer is one Node Route Handler streaming NDJSON stage events: no queue, no worker, no
Realtime ([`07`](07-import-execution-model.md)). The route itself is still owed at L0-F6, with
`/api/imports/probe` as the request/response stand-in.

### A4. Geospatial querying in Supabase
**VERIFIED (2026-08-19) — no PostGIS.** Was: whether PostGIS earns its place at our scale
(realistically a few thousand rows total) or whether a plain lat/lng bounding-box query with a
composite index is sufficient and easier to explain. Measured head-to-head on identical data at 50k,
500k and 5M places: plain `lat`/`lng` + Haversine wins every per-user query at every scale, and the
GiST index is *chosen* by the planner and loses (1.3 ms vs 158 ms p95 at 5M). Flip-point, as a
number: 370k places, and only for a global KNN query, which charter §4 excludes. Evidence:
[`evidence/db/01-bbox-vs-postgis.md`](evidence/db/01-bbox-vs-postgis.md). Decided in
[`08-place-identity.md`](08-place-identity.md).

### A5. Extraction reliability
Unknowns: extraction accuracy on real TikTok captions (emoji, hashtag walls, multiple languages,
Hebrew/Japanese, transliterated names, creator commentary with no explicit place name); how often a
recommendation TikTok names zero resolvable places; whether model self-reported confidence correlates
with correctness at all. Current position: it does not, and the confidence that gates UX must be
*derived* from resolution evidence — name similarity, city agreement, category agreement, and the
margin between the top two candidates. That position must be measured, not asserted.

### A6. Map performance and mobile behaviour
Unknowns: frame rate with a few hundred markers on a mid-range Android device (density clustering is
out — removed by owner ruling at L1-F5-T5); the
interaction between a full-screen map, a bottom sheet, iOS dynamic viewport units and safe areas;
geolocation permission behaviour and indoor accuracy.

### A7. Vercel-vs-local behaviour of the TikTok mechanism
Unknown and non-negotiable to resolve: whether the chosen mechanism behaves identically from a
Vercel datacenter IP as from a laptop. A demo that works only locally fails the course requirement
for a publicly reachable URL and fails as a product. This must be tested on a real preview
deployment during Milestone 0, not at the end.

---

## B. Assumptions requiring verification

1. A meaningful share of real recommendation TikToks name their places in text reachable by our
   mechanism. If most name places only in speech or on-screen text, V1's honest capability shrinks to
   LEVEL B and the supported content classes must be stated plainly rather than disguised.
2. Users will accept the copy → app-switch → paste action.
3. Users save enough places for geographic retrieval to pay off (below ~20, a list beats a map).
4. Multiple places per TikTok is common (list-style posts), so the review UI must handle N candidates
   from the start.
5. Supabase RLS is sufficient for all user-scoped reads with no service-role fallbacks.
6. LLM cost per import is negligible. Verify against a real token count, not intuition.
7. Free tiers (Vercel, Supabase, map/places provider, LLM) carry a project of this size — and the
   keys can be obtained within days, not weeks.

---

## C. Biggest risks

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| R0 | 7 days to deadline | Everything ships or nothing does | Dated plan with cut lines; TikTok spike first; documents time-boxed and written as we go |
| R1 | TikTok content access proves insufficient (LEVEL C) | The product premise collapses; no user-effort fallback remains | Priority-Zero spike in the first 48h; commercial-provider and transcription paths pre-scoped; pivot decision made early enough to matter |
| R2 | The TikTok mechanism works locally but not from Vercel | Fails the "accessible via URL" requirement and the demo | Test from a preview deployment during Milestone 0, before any UI exists |
| R3 | Provider licensing conflict (places data rendered on an incompatible map, or storage forbidden) | Late rework of the visual core, or a compliance problem in a graded project | Settle D2 before map code; wrap both providers behind our own interfaces so a swap stays contained |
| R4 | Ambiguous resolution makes saving feel like data entry | The core loop stops feeling magical | Treat disambiguation as designed surface; pre-select confident matches; one-tap "not this one → search" |
| R5 | Empty-map cold start | Users bounce before value appears | Onboarding lands the first places immediately; never show a bare empty map |
| R6 | The premium bar eats the remaining days | Core loop ships half-finished | Five signature motion moments only; tokens locked before components; polish is a dated phase that can be cut |
| R7 | Scope creep toward Instagram/YouTube or social features | Nothing finishes well | Charter §4 is the contract; platform count is explicitly subordinate to TikTok quality |
| R8 | Cost/abuse via unbounded imports | Bill spike, quota exhaustion, dead demo | Auth-gated imports, per-user rate limit, hard cap on provider calls per import, cached source fetches |
| R9 | Location data is sensitive personal data | Privacy exposure in a graded security review | Live position never persisted server-side; RLS everywhere; no coordinates in URLs, logs or analytics |
| R10 | Prompt injection via TikTok captions | LLM emits junk or attempts abuse | Extraction has no tools and no side effects; output schema-validated; captions are data, never instructions |
| R11 | Duplicate places accumulate | The map degrades into noise | Dedup identity settled in D5 before any write path exists |
| R11b | **Security deferred by owner.** M9 is a graded document that does not yet exist; **8 items are owed** (`security.md` §3 is the count of record — items 2, 8 and 9 are closed, item 5 is split, and item 3's SSRF work is built bar response-size caps) | A graded deliverable missing at submission, or late rework of ingest/auth | `security.md` §3 tracks every owed item; the membership gate — the only schema-shaped risk — is ruled and holds |
| R12 | Student cannot explain a chosen component | Direct loss of marks under M11/R1 | ADR per decision; `how-the-system-works.md` maintained continuously; nothing adopted that cannot be justified in one sentence |

---

## D. Flagged as technically unrealistic or unnecessarily complex

Recorded honestly, including where the owner has overridden a prior recommendation.

1. **Removing every user-effort fallback concentrates all product risk in one third-party
   dependency.** This is the owner's explicit decision and is now the plan of record; the mitigation
   is that the dependency is tested first, before anything is built on top of it. Stated here so the
   risk is visible, not to relitigate it.
2. **"Acceptable to use one provider for the map and another for place resolution."** True in
   general, false for some pairs — notably Google Places data rendered on a non-Google map. Licensing
   must be verified, not assumed.
3. **Model self-reported confidence as the UX gate.** Keep the field; do not trust it. Derive the
   gating confidence from resolution evidence.
4. **"The mobile flow must be extremely fast."** A web app cannot register in the iOS share sheet;
   Web Share Target is Chrome/Android only; clipboard reads need a user gesture. Honest target: one
   screen, one field, sub-second first feedback.
5. **Animating every listed moment.** Reduced to five signature moments, TikTok import first.
6. **Fourteen V1 capabilities in 19 days.** Retained as the *plan*, but ranked with cut lines:
   capabilities 1–9 are the product; list search/filter (11) ships minimal; manual place addition (13)
   is kept because it doubles as course-required CRUD; secondary platforms are cut by default.
7. **Eleven agents is more parallelism than a project this size needs.** Retained as reviewing
   perspectives; UX and Design-System co-own one artefact; QA, DevOps and Security engage in bursts.
8. **PostGIS, a job queue, and a caching layer are all currently unjustified.** Each must be earned by
   a measurement or cut. In a project graded on explainability, unjustified infrastructure costs marks.
