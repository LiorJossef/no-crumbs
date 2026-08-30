# Expert Agent Roster

Eleven specialists, each defined as a real invocable subagent in
[`.claude/agents/`](../.claude/agents/), callable by `subagent_type`.

**Restructured 2026-08-27 into three tiers.** Until then every definition was written in an
advisory voice — 45 advisory verbs against 9 implementation verbs across the eleven files, and the
word "implement" appearing only as a noun or as a pointer to another agent. That made the roster a
review panel. It is now a delivery team with an orchestrator.

**Dispatch went concurrent on 2026-08-30**, by owner ruling: several specialists run at once, and
the orchestrator's job is to find the work that can. What makes that safe is not the tiers but
**disjoint write scopes** — see *Running several agents at once* below, and `agent-guardrails.md`
§8, which is the binding form of the same rule.

| Tier | What it produces | `Bash` | Runs concurrently |
|---|---|---|---|
| **Build** | Production code, plus the unit tests for it | yes | only against a checked disjointness argument |
| **Probe** | Experiments, evidence, findings; throwaway scripts only | yes | freely, subject to exclusive resources |
| **Advise** | Rulings, specs, review; `docs/**` only | no | freely |

| # | Agent | `subagent_type` | Tier | Owns (single-sentence mandate) |
|---|-------|-----------------|------|-------------------------------|
| 1 | Product Lead | `product-lead` | Advise | Scope, the V1 contract, acceptance criteria, and tie-breaking on priority |
| 2 | UX / Interaction Designer | `ux-interaction` | Advise | Information architecture, mobile interaction, motion concept, accessibility |
| 3 | Design System / Frontend | `design-system-frontend` | Build | Tokens, components, motion, responsive — **the single build owner of production UI** |
| 4 | Next.js / TypeScript Architect | `nextjs-architect` | Build | App structure, server/client boundaries, data flow, types, error handling |
| 5 | Supabase / Database Engineer | `supabase-database` | Build | Schema, migrations, indexes, RLS, query design, data integrity |
| 6 | Maps / Geospatial Engineer | `maps-geospatial` | Build | Map mechanics, clustering, camera, geolocation; the resolver *decision* |
| 7 | AI / Extraction Engineer | `ai-extraction` | Build | Extraction schema, prompts, provider abstraction, confidence, evals |
| 8 | Social Platform Integration | `social-integration` | Probe | What each platform *actually* permits, verified by experiment |
| 9 | Security / Privacy Engineer | `security-privacy` | Probe | Auth boundaries, RLS review, secrets, abuse, untrusted input, location privacy |
| 10 | QA / Reliability Engineer | `qa-reliability` | Probe | Independent verification, regression hunting, harnesses and test infrastructure |
| 11 | DevOps / Vercel Engineer | `devops-vercel` | Probe | Environments, deploy diagnosis, env vars, observability, production readiness |

Every agent loads [`current-state.md`](current-state.md),
[`working-agreement.md`](working-agreement.md) §2 and §7, and its own rows in
[`execution-plan.md`](execution-plan.md). Build and Probe agents are additionally bound by
[`agent-guardrails.md`](agent-guardrails.md). `00-project-charter.md` and
`02-risks-and-unknowns.md` are consult-as-needed rather than always-loaded — they are founding
documents, and `current-state.md` carries more decision-relevant signal per token today.

## The orchestrator

The main session is the **lead developer**, not a router. It owns the overall context, decomposes
work into tasks, delegates meaningful implementation and investigation to the specialists,
integrates what comes back, verifies it, and commits.

It **owns verification without personally executing every step.** It decides what evidence a task
requires, ensures that evidence is independent, inspects it, and makes the done / not-done call.
Producing the evidence is delegable — `qa-reliability` driving a harness is exactly that. The one
hard constraint is independence: **the agent that built a thing is never the sole source of evidence
that it works.** A self-report is input, not proof.

It also holds every action a specialist must not take: commits, PRs, merges, deploys, hosted
migration pushes, and destructive database operations. See
[`agent-guardrails.md`](agent-guardrails.md).

**No subagent delegates.** Every handoff routes back through the orchestrator, which serialises
agents whose file scopes overlap.

## Ownership in detail

**1. Product Lead** — Guards Charter §4 against expansion. Converts capabilities into acceptance
criteria a QA agent can verify. Decides what gets cut when the schedule slips. Owns the delayed-value
problem (R4) and the onboarding path to the first five saved places. Says no more than yes.

**2. UX / Interaction Designer** — Owns the three hardest screens: the paste/analysis moment, the
candidate review/disambiguation list, and the map + bottom-sheet composition. Specifies motion as
intent and timing, not CSS. Owns thumb reach, safe areas, keyboard behaviour on URL input, the
location-permission ask, loading and empty states, and reduced-motion equivalents. Also owns the
honest failure states — "we found nothing in this post" must feel designed, not broken.

**3. Design System / Frontend Specialist** — Locks typography, spacing, radius, elevation, surfaces,
iconography and motion tokens *before* components are written. Builds primitives on Radix behaviour
without inheriting shadcn's look. Implements motion with Motion for React and owns whether it holds
60fps on a mid-range phone. Owns bundle size and the map's mount cost.

**4. Next.js / TypeScript Architect** — Owns the layering (`ui → app → domain → integrations`) and
enforces that domain code never imports a vendor SDK. Decides the import execution model (D3):
server action vs route handler vs job row + polling, plus retries and idempotency. Owns the shared
type vocabulary for Source / Extraction / PlaceCandidate / ResolvedPlace / SavedRecommendation, the
error taxonomy, and the boundary between server and client components. Breaks ties on structure.

**5. Supabase / Database Engineer** — Owns the schema and the dedup identity that keeps one physical
place as one row across many sources (D5). Owns migrations as checked-in SQL, indexes including the
geographic one, RLS policies on every user-owned table (written as the real authorisation boundary),
and the decision between PostGIS and bounding-box filtering (D6). Owns constraints that make bad
states unrepresentable — a saved place with no source, or two identical saves for one user.

**6. Maps / Geospatial Engineer** — Runs the provider benchmark (A2) on real target cities and brings
accuracy, cost and licensing findings together. Owns the resolution scoring function that turns a
candidate string plus city hint into a ranked POI list, the ambiguity signal that triggers user
confirmation, clustering strategy, viewport/camera behaviour, geolocation accuracy handling, and map
performance on mobile web.

**7. AI / Extraction Engineer** — Owns the extraction contract: a strict schema (name, city/area hint,
category hint, evidence quote, confidence) enforced through structured output, never prose parsing.
Owns the provider abstraction — one narrow interface, one adapter, no vendor types crossing the seam.
Builds the 50-post golden set *before* tuning prompts and owns the eval score. Owns the position that
model-reported confidence is untrusted until measured, and that captions are data, never instructions.

**8. Social Platform Integration Engineer** — The most consequential agent in week one. Empirically
determines, per platform, what is retrievable server-side through official/permitted mechanisms, and
labels every finding VERIFIED / ASSUMED / UNAVAILABLE with committed response samples. Owns URL
canonicalisation and platform detection (short links, `vm.tiktok.com`, Shorts, Reels, tracking params),
the failure taxonomy (private, deleted, region-locked, rate-limited), and ToS/licensing compliance.
Has explicit authority to declare a platform unsupported for V1.

**9. Security / Privacy Engineer** — Reviews every RLS policy adversarially and attempts cross-user
reads. Owns secret placement (nothing server-side ever reaches the client bundle), the rule that
user-scoped reads never use the service role, validation of all untrusted input at the boundary,
prompt-injection containment, SSRF considerations on user-supplied URLs, rate limiting and abuse
paths, and the privacy posture on location data — including the rule that a user's live position is
never persisted unless they save a place. Holds a veto on data exposure.

**10. QA / Reliability Engineer** — Turns acceptance criteria into a test strategy sized for the
timeline: unit tests on canonicalisation/scoring/dedup, contract tests on the extraction schema,
policy tests on RLS, and a small end-to-end path over the core loop. Owns the edge-case catalogue
(zero candidates, ten candidates, duplicate paste, unresolvable place, provider timeout, revoked
location permission, offline mid-import) and verifies the mobile matrix on real iOS Safari and
Android Chrome, not just a desktop emulator.

**11. DevOps / Vercel Engineer** — Owns local/preview/production environments and the env-var matrix
per environment, migration flow against Supabase, preview deploys that do not touch production data,
build health and CI, error/latency observability on the import pipeline, and cost ceilings and alerts.
Defines what "production ready" means for this project and confirms it before launch.

## Roles considered and deliberately folded in

- **Legal / data-licensing** → folded into Social Integration (platform ToS) and Security (data
  retention and privacy). A separate role would have no other work.
- **Eval / data-quality** → folded into AI Extraction, which owns the golden set directly.
- **Design Director** → folded into UX; splitting visual direction from interaction at this size
  produces disagreement, not quality.

## How the agents work together

Work moves through the orchestrator at every hop — no subagent calls another. The challenge path
below is a *sequence the orchestrator runs*, not a chain the agents walk themselves:

```
orchestrator plans the wave from execution-plan.md (task ID + write scope + evidence)
   → ux-interaction specs the surface                        [Advise]
   → design-system-frontend builds it, with its unit tests    [Build]
   → orchestrator integrates and decides what evidence is needed
   → qa-reliability verifies it independently                 [Probe]
   → security-privacy reviews any data path or migration diff [Probe, veto]
   → orchestrator rules done / not-done, then commits each scope separately
   → PR → CI green → npm run merge:pr → verify main and the deployment
```

The branch belongs to the **feature**, not the delegation: one feature branch, many delegated
subtasks committing onto it, exactly as `git-workflow.md` already describes. Delegation adds no new
git ceremony.

Agents run **concurrently**, in waves of provably disjoint write scopes. The rule that makes that
safe, the dispatch contract that carries it, and the resources that cannot be shared, are the next
section; `agent-guardrails.md` §8 is the binding form.

Rules: claims about third parties need evidence; disagreements end in a recorded decision, not a
compromise that keeps both designs; the Product Lead breaks scope ties, the Architect breaks
structural ties, and Security's veto on data exposure is not overridable by either.

## Running several agents at once — owner ruling, 2026-08-30

The paragraph this replaces said agents whose path scopes overlap are "serialised, not
parallelised", and dismissed worktree isolation as "a solution to a throughput problem this project
does not yet have". Both halves expired on 2026-08-30, when the owner ruled that dispatch runs
**concurrently** — as many specialists at once as can safely complete.

Serialisation was never the real rule. It was a cheap proxy for one, and the proxy forbade work the
real rule allows. The real rule is:

> **Two agents may run concurrently if, and only if, their write scopes are disjoint and they hold
> no exclusive resource in common.**

Serialising on directory overlap satisfies that condition. So does splitting the directory, and
splitting is usually available: `maps-geospatial` and `design-system-frontend` contend over
`src/components/map/**` as a directory, but almost never over the same *file*.

### Why disjointness, and not something cleverer

Disjoint write scopes buy two properties for the price of one, and the second is the one that is
easy to miss.

1. **No lost writes.** Two agents cannot edit one file, so neither silently overwrites the other.
2. **Attribution survives a shared tree.** Guardrail 1 tells every specialist to leave its changes
   uncommitted for the orchestrator to commit. With one agent that is unambiguous. With five it
   would be an unattributable pile — *except* that disjoint scopes make `git add <scope>` select
   exactly one agent's work. The commit granularity `git-workflow.md` demands (Level → Feature →
   Subtask → atomic commit) survives concurrency **because of** the disjointness rule, not
   alongside it.

Lose disjointness and you lose the ability to commit, review or revert one agent's work
independently. That is why it is a hard constraint rather than a preference, and why the answer to
"can these two run together?" is never "probably fine".

### The dispatch contract

Every dispatch carries five fields. The orchestrator writes them; they bind the agent.

| Field | Meaning |
|---|---|
| **Task ID** | The row in `execution-plan.md` this serves |
| **Write scope** | The explicit paths this agent may create, edit or delete. The rest of the repo is read-only to it |
| **Exclusive resources** | Named grants, normally `none` — see below |
| **Evidence required** | What will prove it worked, and **against which commit** |
| **Wave** | The concurrent group it belongs to |

**The dispatch is the lease; the roster is only the default.** The "You own — Paths" line in each
`.claude/agents/*.md` is the scope an agent gets when nothing narrower is said. A dispatch may
narrow it, and often should: two agents may both work inside `src/components/map/**` in one wave if
one is leased `place-marker-layer.tsx` and the other `map-surface.mapcn.tsx`.

**An agent never widens its own scope.** Needing a path it was not granted is a stop-and-report, not
a judgement call. The orchestrator either extends the lease — having checked it against every other
live lease — or moves the work to the next wave. An agent that edits outside its lease has not made
a small process error; it has invalidated the commit boundary for every other agent in the wave.

### Waves

A **wave** is a set of agents dispatched together whose scopes are pairwise disjoint. The
orchestrator runs one loop per wave:

```
plan the wave    — pick tasks, cut scopes until they are disjoint, check exclusive resources
dispatch         — all of them, in one message, so they actually run concurrently
collect          — read every result; a wave is not over while one is unread
integrate        — commit each agent's scope as its own atomic commit
verify           — dispatch verification of wave N against frozen SHAs, usually inside wave N+1
```

Verification lands in the *next* wave on purpose. It is also why concurrency pays here: a verifier
usually writes nothing to the repo, so it is disjoint from every builder by construction and can
always run alongside the next batch of building.

### Verification needs a commit, not a tree

This is the rule concurrency actually breaks, and it is worth stating on its own.

`working-agreement.md` §2 says the builder is never the sole source of evidence that its work
works. Under serial dispatch the verifier inspected the working tree, and the tree was the change.
Under concurrent dispatch **the tree is a moving target** — it holds four agents' half-finished
work, and evidence gathered from it proves nothing about any single change.

So: **verification names a commit.** The orchestrator commits the builder's scope first, then
dispatches the verifier against that SHA, and the returned evidence cites it. Evidence that cannot
name the ref it was taken against is not evidence, and this applies with full force to
`security-privacy` reviewing a migration diff — see `agent-guardrails.md` §8.

### When scopes genuinely cannot be split

In order of preference, because concurrency is a means and not the goal:

1. **Re-cut the tasks** so the scopes are disjoint. Usually possible, and it usually improves the
   task decomposition anyway.
2. **Put them in different waves.** Sequencing is the cheapest correct answer and needs no
   machinery. Two tasks that are genuinely coupled are faster in one pass by one agent than split
   across two.
3. **Isolate in a worktree** (`isolation: "worktree"`), and merge on collection. This is the option
   the old paragraph dismissed; it is now available, with the limits recorded in
   `agent-guardrails.md` §8 — an isolated worktree is a different checkout, so anything depending
   on this checkout's untracked state does not exist inside it.

### Concurrency by tier

| Tier | Concurrency property | Practical limit |
|---|---|---|
| **Advise** | No `Bash`, writes only `docs/**`. Disjoint from all code work by construction | Any number, if their doc paths differ |
| **Probe** | Has `Bash`, but normally writes nothing to the repo — evidence goes to the scratchpad | Any number, subject to exclusive resources |
| **Build** | Writes production code. The scarce tier: every pair needs a checked disjointness argument | Small; bounded by how cleanly the work splits |

The realistic shape of a wave is therefore a few Build agents on genuinely separate surfaces, plus
as many Probe and Advise agents as the work supports. **Probe and Advise capacity is nearly free
and is the parallelism most often left on the table** — an independent verification, a measurement,
a UX ruling on the surface being built. Under-using it is the common failure, not over-using it.

### Parallelism is still not ceremony

`working-agreement.md` §1.4 is unchanged by this ruling and still governs: do not spawn an agent to
look busy, to duplicate what the orchestrator is already doing, or to split work that is faster in
one pass. Concurrency raises the ceiling on how much can run; it does not lower the bar for whether
something should.

**The orchestrator owns the lifecycle of every agent in every wave** — dispatched, tracked,
collected, and either acted on or written down. A wave with an uncollected result is an unfinished
wave, and a session that ends with one has failed its hand-over (§1.4, §9).

### Exclusive resources — the things that do not partition

Paths partition. These do not: there is exactly one of each, and a second concurrent holder
corrupts the first. **Each is leased to at most one agent per wave, by name, in the dispatch.**
Every row was measured against this repo on 2026-08-30.

| Resource | Why it is exclusive | Lease |
|---|---|---|
| **`npm run verify` / `check:layers` / `typecheck`** | `check-layer-guard.sh` writes four real fixture files **into `src/`** (`src/domain/__layer_guard_violation__.ts` and three siblings) and deletes them on exit, so `verify` mutates the source tree for ~20–30 s. Two overlapping runs corrupt each other — see the false-pass below | One agent at a time, repo-wide |
| **The local database** | One Postgres, `127.0.0.1:54322`, hardcoded as the default in `db:test:*` and `db:inventory`. No per-agent database exists | One holder; everyone else uses fixtures |
| **The next migration number** | A filename namespace with no collision detector anywhere in the guards, and a hole at `0027` that makes a gap look normal | Allocated per task by the orchestrator |
| **The git index** | Process-global. Concurrent staging drops files — measured, see below | The orchestrator, with every writer paused |
| **`node_modules/` + `package-lock.json`** | `npm ci` **deletes `node_modules` first**; anything else running fails with module-resolution errors that look like real defects | Orchestrator only, in a wave of its own |
| **Port 3000, `.next/`, Playwright artefacts** | One dev server, one build output, fixed-path test artefacts | One holder |
| **Provider quota** | Gemini's 500 calls/day is shared across every agent, the orchestrator and the owner, and **nothing counts it** | A number granted per dispatch; no grant means zero |

**Two of these were measured as live defects, not theory.**

*The layer guard can pass without testing anything.* `expect_file_rejected` treats any non-zero
`eslint` exit as "the guard rejected it", and `eslint` on a **missing** file exits 2. So if one
agent's cleanup deletes the fixture while another is between writing it and linting it, the second
prints `OK: ESLint rejects …` having linted nothing. The gate reports green while enforcing nothing —
the "weakened gate is invisible until something else fails" case `CLAUDE.md` names, reachable by
accident rather than by anyone making a mistake. A third variant is worse-tempered than it looks:
one fixture body imports `axios`, which is **not installed**, so a concurrent `typecheck` fails on a
file the agent never wrote.

*Concurrent staging silently loses files.* With two processes staging at once, **126 of 300
`git add` calls failed on `.git/index.lock` and only 174 of 300 files reached the index**, with the
failures going to stderr — which nobody reads when the command as a whole succeeds. A commit that
claims to be atomic and is missing 42% of its content is not a review artefact.

### Who owns which paths

The dispatch is still the lease (above); this is the default it is cut from, and the **partition
must be total** — under concurrency a path that nobody owns is a path everybody may write, which is
the worst case rather than a neutral one. Measured 2026-08-30, the eleven definitions between them
named paths for only about **half** the tree: five component directories, two integration
directories, `src/lib/**`, `src/proxy.ts`, all of `src/app/_lib/**` and four `src/domain/` subtrees
were claimed by nobody. So:

> **Default rule: a path no agent owns belongs to the orchestrator.** An agent may not write an
> unowned path without an explicit lease. Discovering that the work needs one is a finding worth
> reporting — it means this table has a hole.

| Area | Owner |
|---|---|
| `src/domain/import/**` (except `llm-guess-place-id.ts`), `src/domain/{types,ports,errors,build-info}.ts`, `src/domain/{auth,collections}/**`, `src/app/{actions,api}/**`, `src/app/_lib/**`, `src/app/*/_lib/**`, `src/app/healthz`, `src/proxy.ts`, `tsconfig.json`, `next.config.ts` | `nextjs-architect` |
| `src/domain/extraction/**`, `src/domain/import/llm-guess-place-id.ts`, `src/integrations/llm/**` | `ai-extraction` |
| `src/domain/places/**`, `src/integrations/{google,places}/**`, the POI ingest chain in `scripts/` | `maps-geospatial` |
| `src/ui/**`, `src/components/**` except `map/**`, `src/app/globals.css`, `src/lib/utils.ts`, page composition under `src/app/` | `design-system-frontend` |
| `supabase/migrations/**`, `supabase/tests/*.sql`, `supabase/seed.sql`, `src/integrations/supabase/**`, `src/lib/supabase/client.ts` | `supabase-database` |
| `src/integrations/tiktok/**`, `src/domain/source/**`, `tests/manual/tiktok-*` | `social-integration` |
| `tests/e2e/**`, `vitest.config.ts`, `playwright.config.ts`, test harnesses | `qa-reliability` |
| `docs/security.md` (orchestrator reviews), `docs/evidence/{security,licensing}/**` | `security-privacy` |
| `docs/evidence/{deploy,vercel}/**` | `devops-vercel` |
| `docs/evidence/**` — **by subdirectory**, one per agent | the matching agent |
| `docs/ux-*.md`, `docs/spec-*.md`, the facelift plan and design-system HTML once they land | `ux-interaction` |
| `docs/product-*.md`, `docs/mvp-plan.md`, `docs/00-project-charter.md` | `product-lead` |
| `CLAUDE.md`, `docs/{current-state,execution-plan,working-agreement,git-workflow,01-agent-roster}.md`, `scripts/**` guards, `.claude/**`, `.github/**`, `.githooks/**`, `eslint.config.mjs`, `package.json`, everything unlisted | **the orchestrator** |

A **unit test is owned by whoever owns the module under test**, and the lease is the individual test
file — not the directory. `tests/unit/import/` alone contains files belonging to four different
agents, so a directory-level rule there would be wrong in both directions.

### The contested set

`src/components/map/**` was described in the paragraph this section replaces as "the whole collision
story". It is not, and that sentence was wrong in two ways: there is a second contested directory,
and the map itself contends at *file* level rather than directory level.

| Contested | Between | Resolution |
|---|---|---|
| `src/components/map/**` (30 files) | `maps-geospatial` × `design-system-frontend` | A file-level partition, **adopted with corrections and three files serialised** — see below |
| `src/components/shell/**` | the same two, and claimed by **neither** definition | Split by file: `map-shell.tsx` and `sheet-geometry.ts` to `design-system-frontend`, `use-map-shell.ts` to `maps-geospatial` — see below |
| `src/app/map/map-page-client.tsx` | claimed by **neither**, and it holds the camera movers | **`maps-geospatial`**, ruled 2026-08-30. It is page composition, which is normally `design-system-frontend`'s, but it is also where the eight authorised camera movers live — and camera logic follows the camera owner, as it does for `use-map-shell.ts`. `design-system-frontend` proposes diffs for the composition |
| The facelift plan and the rendered design-system HTML (arriving with PR #105) | `ux-interaction` × `design-system-frontend` | `ux-interaction` owns both; the builder reports status through the orchestrator. **Never concurrent** — a 4,000-line HTML file has no useful merge |
| `.github/workflows/` | `qa-reliability`'s definition × guardrails §4 15a | The guardrail wins: orchestrator only, both agents propose diffs |

#### The map partition, as ruled

A naive mechanics-vs-tokens split was put to both owners on 2026-08-30 and **both refuted it as
drawn**, from opposite sides and independently. It is adopted with their corrections, because the
alternative — the blanket serialisation it replaces — was costing more.

**The measurement that settles it:** of the 53 commits that have ever touched
`src/components/map/**` or `src/components/shell/**`, **13 — about a quarter — wrote to files on
both sides of the proposed line.** One of them, `c7b06e5`, is a pure camera fix that had to write a
file the naive split assigns to the *other* agent. A partition that loses one commit in four is not
a partition; that is the number the corrections below have to bring down.

*Four files move, and one is not owned at all:*

| File | Ruling |
|---|---|
| `near-me-control.tsx` | → `design-system-frontend`. Both owners said so unprompted. It was swept up by a filename glob; it renders JSX and touches no map object |
| `map-surface.mock.tsx` | → `design-system-frontend`. A styled component, not a map |
| `use-near-me.ts` | → `maps-geospatial`. **The glob `near-me*.ts(x)` never matched it** — 29 of 30 files were covered and nobody noticed |
| `map-surface.live.tsx` | → **frozen, owned by neither.** Dead code: its import is commented out with "do not wire it in", it is Protomaps-based, and it carries the cluster behaviour the owner deleted. Leaving it writable is a trap — a token sweep would tidy its hex colours and make dead code look maintained |

*Three files mix the two concerns irreducibly and stay serialised until they are split:*

`marker-style.ts` is named as a palette file and is also the source of truth for pin **geometry**,
collision flags and `LABEL_MIN_ZOOM` — a zoom band living outside `zoom-bands.ts`.
`country-flag-image.ts` draws flags and also holds `summaryPillFitAllowance()`, camera padding math.
`summary-style.ts` holds paint and also the layer ids that click handlers key on plus band zooms
derived from `zoom-bands.ts`.

*And one file cannot be partitioned at all:* `map-surface.mapcn.tsx`, 1,209 lines, with ~600 lines
of camera logic interleaved between the styling regions and two hard crossings in the middle of
function bodies. **It is serialised, full stop.**

**The unblock is a bounded refactor, not a better rule.** Extracting pin geometry out of
`marker-style.ts`, the fit allowance out of `country-flag-image.ts`, the band constants into
`zoom-bands.ts`, and the chrome constants and control column out of `map-surface.mapcn.tsx` is
roughly 150 lines against existing test coverage on both sides. It converts the four worst coupling
pairs into read-only dependencies and buys concurrency for the whole directory. Until it lands, the
partition covers 23 of 30 files and says so rather than pretending the line is clean.

**A standing rule survives the refactor:** a change to pin geometry, `SUMMARY_PILL` dimensions,
`PEEK_PX`, or the desktop panel width is a **camera-affecting change** even when it is made for
visual reasons, and it is announced through the orchestrator rather than committed quietly. The
measured case is a summary pill whose insets changed for looks and left the camera under-padding, so
`United Kingdom 18` was cut in half at the frame edge.

**`src/components/shell/` splits by file, and the owners disagreed on one.** `map-shell.tsx`
(layout) and `sheet-geometry.ts` (sheet chrome, and frozen — `PEEK_PX` "may not move") go to
`design-system-frontend`. **`use-map-shell.ts` goes to `maps-geospatial`**, against
`design-system-frontend`'s proposal to keep the directory whole: it declares the `CameraFocus` union
and `focusProps()`, and the failure it exists to prevent is a race between two focus effects. A
camera race is exactly the bug that gets fixed under time pressure, and a propose-a-diff channel is
the wrong latency for it. `design-system-frontend` proposes diffs for the sheet-stop state it also
holds.

**The partition must cover `tests/` too**, on the same file-level rule — `tests/unit/map/` splits
along exactly the same seam, and a partition on `src/` with no rule for tests just relocates the
lost write.

### Hot files

Files many features touch. They are not contested — each has one owner — but they are where two
agents' *tasks* collide even when their scopes do not.

| File | Importers | Protocol |
|---|---|---|
| `src/domain/types.ts` | 51 | The shared vocabulary. The architect writes it; other agents send the exact type block to add |
| `src/domain/ports.ts` | 34 | Ports are added by the architect on request, never by the adapter author |
| `src/domain/errors.ts` | 29 | A closed union; adding a code is a UI-visible contract change and must be announced |
| `src/app/globals.css` | the whole token layer | `design-system-frontend` exclusively. Never a second UI agent |
| `src/components/map/types.ts` | 28 (21 source, 7 test) | `maps-geospatial` exclusively, even under the map partition |
| `supabase/tests/inventory.sql` | asserted by `check:schema` **and** CI | `supabase-database` writes, `security-privacy` reviews, one task at a time |
| `docs/current-state.md`, `docs/execution-plan.md` | every agent reads them | **Orchestrator writes.** Agents return status as prose. This is the likeliest concurrent-write conflict in the repo |

### One thing concurrency makes worse that no rule here fixes

The layer guard's ESLint zones cover `src/domain/**`, `src/ui/**` and `src/integrations/**` — and
**`src/components/**` is in none of them**, while `src/ui/**` contains no React at all. So a UI file
importing an adapter directly passes `check:layers`. That was survivable when one agent worked at a
time and the orchestrator read every diff. With several agents in the most contested tree in the
repo it is a hole in the only automated architectural check, and the mitigation until it is fixed is
the orchestrator reading the diff — which is exactly the thing concurrency puts under pressure.
