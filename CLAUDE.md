# P-002 — Personal geographic recommendation map

Under construction against an ordered plan. Repo, toolchain and deploy (MS2), the technical design
(MS3) and the database (MS4, nine migrations applied and verified on both hosted projects) are
done. MS5 — the POI index and resolver — is next, and its schema design is under review.
`docs/implementation-plan.md` is the plan of record and its change log is the current state.

**Read before doing anything in this repo:**
1. `docs/00-project-charter.md` — product definition, V1 boundary, engineering principles, open decisions
2. `docs/implementation-plan.md` — the milestone ladder, the decision ledger, and the change log
3. `docs/02-risks-and-unknowns.md` — unknowns, assumptions, risks
4. `docs/01-agent-roster.md` — the eleven expert roles and who owns what

Stack: Next.js + TypeScript + Supabase + Vercel. **D2 is closed** — MapLibre GL v5 + Protomaps
tiles + our own resolver over Overture `places` extracts, Nominatim as a capped fallback
(`docs/06-map-and-places-decision.md`, schema in `docs/10-poi-index.md`).

Specialist subagents live in `.claude/agents/` and are invocable by `subagent_type`, e.g.
`social-integration`, `maps-geospatial`, `ai-extraction`.

House rules: claims about third-party capabilities are labelled VERIFIED / ASSUMED / UNAVAILABLE,
with evidence in `docs/evidence/`; design may only depend on VERIFIED. Charter §4 is the scope
contract — new ideas go to a Future list, not into the current sprint.
