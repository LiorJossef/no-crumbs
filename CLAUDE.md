# P-002 — Personal geographic recommendation map

Pre-implementation. No application code exists yet, by design.

**Read before doing anything in this repo:**
1. `docs/00-project-charter.md` — product definition, V1 boundary, engineering principles, open decisions
2. `docs/02-risks-and-unknowns.md` — unknowns, assumptions, risks (nothing is VERIFIED yet)
3. `docs/01-agent-roster.md` — the eleven expert roles and who owns what

Stack direction: Next.js + TypeScript + Supabase + Vercel. Map/places providers undecided (D2).

Specialist subagents live in `.claude/agents/` and are invocable by `subagent_type`, e.g.
`social-integration`, `maps-geospatial`, `ai-extraction`.

House rules: claims about third-party capabilities are labelled VERIFIED / ASSUMED / UNAVAILABLE,
with evidence in `docs/evidence/`; design may only depend on VERIFIED. Charter §4 is the scope
contract — new ideas go to a Future list, not into the current sprint.
