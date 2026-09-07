# University Final Project Requirements — Checklist & Traceability

Source: *Internet Technologies — Become a Full-Stack Engineer, RUNI CS 2026*, "תרגיל סיום: בניית מוצר ווב בעל ערך עסקי" (9pp, Hebrew).
**Final submission: 6 September 2026.**

Stated grading philosophy (translated): *"the project is judged not by quantity of features but by
quality of thinking. Better to build a small, clear, useful, secure, well-built product than a big,
messy, unstable one."* The rubric explicitly lists: product thinking · orderly technical planning ·
clean code · proper database usage · meaningful tests · basic security understanding · basic scale
understanding · **ability to explain the system in depth**.

This file is the contract with the course. It stays updated for the whole project.

---

## Mandatory

| ID | Requirement (source §) | Notes from the document |
|----|------------------------|-------------------------|
| M1 | A product implementable as a **web application** with real-world business meaning (§1) | Must answer a clear need: save time, enable sales, improve a business process, help users make better decisions, or make an organisation more efficient |
| M2 | **Product specification document** (§2) | Must state: what problem the product solves · who its users are · who the customer is · what the business goals are · what software capabilities are needed to achieve them · what the core processes are that the product lets users perform |
| M3 | **Software architecture plan** (§3) | Must explain: which components exist · whether a database is used · which central tables/entities · which pages · which API routes **or** server actions · how data flows between frontend, backend and database · which users and permissions exist · which external libraries or services are used **and why** |
| M4 | **Detailed technical design document, written before implementation** (§4) | Folder structure · core component structure · DB schema · central CREATE/READ/UPDATE/DELETE operations · API description · central business logic · state management · error handling · input validation · core UX planning. Stated goal: *know what you are building before you write code* |
| M5 | **Implementation** with Next.js · TypeScript · Supabase (database; authentication also permitted) · Vercel (deployment) (§5) | The product must be reachable via a **URL**, not only runnable locally |
| M6 | **Test specification document** (§6) | Tests for: core features · invalid inputs · central business processes · permissions (if multiple users exist) · the database · edge cases · basic UI. Stated goal: *show that you know how to define what "working" means* |
| M7 | **Implemented tests** (§7) | Vitest / Jest / React Testing Library / Playwright / documented manual tests. Not every line must be tested, **but the product's central processes must be** |
| M8 | **Basic scale document** (§8) | What happens at tens or hundreds of users · which queries could be heavy · whether indexes are needed · how excessive data fetching is avoided · whether pagination is used correctly · whether the client/server split is right · current limitations · what would be improved for larger scale |
| M9 | **Basic security document** (§9) | How authentication works · how authorisation works · which actions are restricted to the logged-in user · how access to another user's data is prevented · how input validation is performed · how API calls are protected · how secrets such as API keys are stored · which risks remain |
| M10 | **Deployment** to Vercel + Supabase (§10) | Submission must include: link to the live app · link to the GitHub repository · local run instructions · a short explanation of the required environment variables |
| M11 | **Presentation, 10–15 minutes** (§12) | Cover: what the product is · which problem it solves · who its users are · why it has business value · how the system is built · the architecture · what the database looks like · the core processes · which tests were written · scale thinking · security thinking · what would be improved with more time. Warning in the document: *it is not enough that the app works — you must know how and why it works; expect short interview-style questions* |
| M12 | **The ten submission artefacts** (§"מה צריך להגיש") | app link · GitHub link · product spec · technical design · test spec · test code · scale doc · security doc · local run instructions · short 10–15 min presentation deck |

## Recommended

| ID | Requirement | Notes |
|----|-------------|-------|
| R1 | Use of AI coding agents is permitted and encouraged (§11) — for architecture, components, tests, UI polish, bug finding, documentation | **"the responsibility for the code is yours"**; the student must be able to explain every library, every component, every method and every technical decision |
| R2 | Ask the coding agent to produce an internal site or document explaining the whole technical structure of the system (§11, explicitly recommended) | Satisfied by `docs/how-the-system-works.md` |
| R3 | Prefer a small, clear, secure, well-built product over a large unstable one (§"דגשים חשובים") | Directly reinforces Charter §4's scope discipline |

## Optional

| ID | Item | Our position |
|----|------|--------------|
| O1 | Supabase **Authentication** (the document requires Supabase for the database; auth is "also possible") | We will use it — it removes a large amount of custom auth code and makes RLS the natural authorisation boundary |
| O2 | Choice of test tooling | Vitest + React Testing Library + Playwright; documented manual tests only where automation is not worth it |
| O3 | Monetisation | Not invented for the assignment. User and customer are the same person in V1 (§2 permits this framing) |
| O4 | Which external services beyond the required stack | Each must be justified in writing (M3) — this is why every provider decision in `docs/` ends with a plain-language justification paragraph |

---

## Traceability matrix

| University requirement | How our product satisfies it | Planned document / code evidence |
|---|---|---|
| M1 real business value | Converts TikTok saves — an unstructured, chronological graveyard — into a geographic personal recommendation library, collapsing retrieval from minutes of scrolling to seconds on a map | `docs/product-specification.md` §business value; `docs/00-project-charter.md` §2 |
| M2 product specification | Problem / users / customer / business goals / capabilities / core processes, with the TikTok→map conversion as the flagship process | `docs/product-specification.md` |
| M3 architecture plan | Layered Next.js app (`ui → app → domain → integrations`), Supabase Postgres, five named entities, server actions for mutations, explicit external-service list with per-service justification | `docs/implementation-plan.md` §7; `docs/technical-design.md` |
| M4 detailed technical design | Folder tree, component hierarchy, schema DDL, CRUD matrix, server-action/API inventory, the TikTok pipeline as the central business logic, state strategy, error taxonomy, Zod validation, UX flows | `docs/technical-design.md` |
| M5 required stack + public URL | Next.js + TypeScript + Supabase (DB, Auth, RLS) + Vercel; production URL delivered in Milestone 14 | `docs/implementation-plan.md` §19; live URL in README |
| M6 test specification | Test spec organised around the flagship pipeline: URL handling, TikTok processing, extraction, resolution, persistence, RLS, plus the end-to-end golden path | `docs/test-specification.md` |
| M7 implemented tests | Vitest units on canonicalisation / scoring / dedup; RTL on review UI; Playwright on the golden path; SQL policy tests asserting cross-user reads fail | `tests/`, `e2e/` |
| M8 basic scale | Index plan, bounded viewport queries, no over-fetching of place payloads, pagination on the list view, provider/AI cost ceilings and rate limits, client/server boundary rationale | `docs/scale.md` |
| M9 basic security | Authentication and session handling; row-level security as the authorisation model, with a policy shown; what requires a signed-in user, and the three collection roles; **nine cross-user attacks executed and refused**, with an evidence file naming each one; input validation, the pasted link, and the model's output; API protection and secrets; residual risks graded for this deployment | `docs/security.html` (graded document); evidence in `docs/evidence/security/cross-user-attacks-2026-09-06.md` |
| M10 deployment | Vercel project + Supabase project, documented env-var matrix, preview vs production separation, local setup in README | `docs/deployment.md`, `README.md` |
| M11 presentation | Deck built directly from these documents; `how-the-system-works.md` is the study guide for the interview questions | `docs/presentation-outline.md`, `docs/how-the-system-works.md` |
| M12 ten artefacts | Tracked as a submission checklist with owner and status | `docs/implementation-plan.md` §20 |
| R1 own the code | Every provider and library decision recorded as an ADR with the alternatives considered and why they lost | `docs/adr/` |
| R2 internal explanation doc | Written and maintained alongside implementation, not at the end | `docs/how-the-system-works.md` |
| R3 small and solid | Charter §4 scope contract; TikTok quality prioritised over platform count | `docs/00-project-charter.md` §4 |

## Course-requirement gaps to watch

1. **M3 asks for "which users and permissions exist."** A single-role consumer product is thin here.
   Our answer must be explicit: one role (authenticated owner), plus the anonymous visitor who can
   see only the marketing/auth surface — and RLS is what enforces it. Demonstrating a *failing*
   cross-user access attempt in a test is the strongest evidence we can show.
2. **M6 asks for permission tests "if multiple users exist."** They do (every user has a private
   map), so these tests are mandatory for us, not optional.
3. **M4 requires the design document before implementation.** `docs/technical-design.md` must be
   complete and dated before Milestone 1 code lands. Milestone 0 (the TikTok spike) is explicitly
   exempt: it is throwaway feasibility code, not product implementation.
4. **M8/M9 are documents, not just practices.** They are graded artefacts; they must exist as files
   even where the practice is already visible in code.
