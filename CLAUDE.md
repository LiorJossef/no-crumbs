# P-002 — Personal geographic recommendation map

Under construction against an ordered plan, **re-planned by product level on 2026-08-20**.
[`docs/mvp-plan.md`](docs/mvp-plan.md) is the plan of record: four levels — **L0** walking skeleton,
**L1** the course MVP and the submission target, **L2** product-grade, **L3** post-course — every one
of them submittable, climbed one at a time. `docs/implementation-plan.md` keeps the decision ledger,
the M3 architecture answer, the migration order and the build orders; its milestone ladder and its
half-day budget are retired.

Done: repo, toolchain and deploy (was MS2), the technical design (MS3), the database (MS4), and the
POI index chain `0010`/`0014` plus the resolver vocabulary, the ported scorer, the 44-case golden
file and the Tel Aviv ingest (was MS5 tasks 1–5).

**Production is live** at `https://p-002-zeta.vercel.app`, auto-deployed from `main`.

**Migrations — re-measure, never copy forward.** `npm run db:status:staging` / `db:status:prod`.
Measured 2026-08-30: 29 on disk (`0001`–`0030`, no `0027`), **staging `0018`, production `0026`**.

**The core loop runs end to end**: auth, the map (MapLibre + CARTO), the saved-places list and
sheet, and a real TikTok import — oEmbed → caption → LLM extraction → review → `places`/
`saved_places`. Verified against real TikToks, not only tests.

**`PlaceResolver` exists; Google Places is canonical** (`place-resolver-factory.ts`), 15/16 top-1.
Production falls back to Overture behind a **ToS gate** — Google content may not pair with a
non-Google map (`06` §3.1, VERIFIED). The gate is code on purpose; a Google renderer deletes it.

**L1 is nearly complete and collections (L2) has shipped.** Not built: the streaming route
(`L0-F6`, `/api/imports/probe` is the stand-in) and `L1-F8-T1`, the account menu with
delete-my-data — the last unbuilt L1 product feature. D2b was **superseded, not completed**.
Per-task status is `docs/execution-plan.md`; read `docs/current-state.md` first.

The MVP boundary, and it is three decisions rather than a feature list: one link in one field;
**TikTok only** — the sole VERIFIED access mechanism, so an Instagram or YouTube link is a recognised
redirect to manual add, never a failure; and "info" fixed at name · category · coordinates · source
link · user note, which is exactly what open data lets us store forever. At LEVEL B's ~27% hit rate,
**"no places found" is the modal import outcome**, so its screen is a core surface, not an error path.

**How this project is built — [`docs/working-agreement.md`](docs/working-agreement.md), binding
from 2026-08-26.** The owner is the product owner, not your QA engineer, UX reviewer or task
dispatcher. The default loop is *inspect → identify → prioritise → implement → test → use →
critique → improve → continue*, not *await instruction → implement narrowly → report done → wait*.
Find a bug, fix it. Weak UX, improve it. Half-finished, finish it. **Implemented is not done**: run
the app, use the feature, inspect the persisted rows, check desktop and mobile, then say what you
verified and how. Never convert uncertainty into certainty — preserve source, provenance, evidence
and the extracted-vs-inferred distinction; an uncertain result beats a confidently wrong place. Ask
only for decisions that are genuinely the owner's (§7), and don't stop unrelated work while waiting.

**[`docs/current-state.md`](docs/current-state.md) is the cold-start document** — what is working,
what is verified and how, what is unresolved, and the next highest-impact step. Read it first.

**Read before doing anything in this repo:**
1. `docs/mvp-plan.md` — **the plan of record**: the MVP boundary, the four levels, the exit criteria
1b. `docs/execution-plan.md` — **the ladder and the running status**: Level → Feature → Task
1c. `docs/brand-and-product-foundation.md` — positioning, user, tone, visual direction, the eight
   surfaces, the main flow. **The product is named No Crumbs** (owner, 2026-08-30); §3 is closed and
   §3.1 rules the identity mascot-led, overriding §5's "no illustration style" for the mark only
1d. `docs/voice-and-vocabulary.md` — **binding on every user-facing string**: the one rule (the name is
   the only joke), the six surfaces the name may appear on, the vocabulary table, the banned words
1e. `docs/facelift-plan.md` — the **five-stage visual rebuild**, its twelve audited findings, the
   locked decisions and the map capability matrix. Rendered, with live mockups and the mascot motion
   set, in `docs/no-crumbs-design-system.html`
2. `docs/00-project-charter.md` — product definition, V1 boundary, engineering principles, open decisions
3. `docs/implementation-plan.md` — the decision ledger, the M3 architecture answer, the change log
4. `docs/02-risks-and-unknowns.md` — unknowns, assumptions, risks
5. `docs/01-agent-roster.md` — the eleven expert roles and who owns what

Stack: Next.js + TypeScript + Supabase + Vercel. **MapLibre GL 6.4.1** (read the v6 API surface) on
**CARTO** tiles, and **Google Places** as the canonical resolver with the Overture index as
production's ToS-gated fallback (`docs/06-map-and-places-decision.md`, schema `docs/10-poi-index.md`).

**Nominatim was never built** — no adapter exists in `src/`. D2b's two-source design and its ODbL
sign-off were superseded by the Google Places ruling of 2026-08-28, not delivered. Protomaps is
likewise unused: `map-surface.live.tsx` is not wired in.

**You are the lead developer and orchestrator, not the only pair of hands.** Eleven specialists live
in `.claude/agents/`, invocable by `subagent_type`, in three tiers (`docs/01-agent-roster.md`):
**Build** writes production code and its unit tests (`nextjs-architect`, `supabase-database`,
`maps-geospatial`, `ai-extraction`, `design-system-frontend`); **Probe** produces experiments and
evidence (`social-integration`, `security-privacy`, `devops-vercel`, `qa-reliability`, which also
owns test harnesses); **Advise** rules and specifies, with no shell (`product-lead`,
`ux-interaction`). Delegate meaningful implementation and investigation — decompose the task,
delegate it with a task ID and a path scope, integrate, verify, commit.

You **own verification without personally executing every step**: decide what evidence is required,
ensure it is independent, inspect it, and make the done/not-done call. The hard constraint is that
**the agent that built a thing is never the sole source of evidence that it works.** No subagent
delegates; every handoff routes back through you, and you serialise agents whose paths overlap.
`docs/agent-guardrails.md` lists what a specialist must never do — commits, merges, deploys, hosted
migration pushes and destructive database operations stay with you.

**Check for a specialist before doing meaningful work yourself** (owner ruling, 2026-08-27,
`working-agreement.md` §1.1). Where a local agent genuinely matches the domain, use it rather than
defaulting to doing the work yourself. Not for trivia — a one-line fix, a rename, a file you are
reading anyway — and never performatively. **You keep orchestration, integration, judgement and
final verification**; delegating work never delegates accountability. When nothing fits and you do
it yourself, say you checked.

**Parallelise proactively — standing owner ruling, 2026-08-28, `working-agreement.md` §1.4.** In
**every** session, look for the work that can genuinely run in parallel and dispatch it to the
specialists while you continue the main thread: independent investigations, measurements against
real rows, adversarial verification of what is already built, extraction or platform research,
product/UX checks, test and harness work. No permission is needed per session, and the owner has
given standing permission to change whatever agent configuration this requires. **Parallelism, not
ceremony** — never spawn an agent to look busy, to duplicate what you are already doing, or to split
work that is faster in one pass. **You own the lifecycle of everything you spawn:** track what is
running, collect it, stop what no longer matters, and never end a session with background work
unaccounted for. **And do not ask the owner to choose between ordinary implementation tasks** —
pick by product impact and escalate only the decisions in `working-agreement.md` §7.

**When you use one, say so** (owner ruling, 2026-08-26, `working-agreement.md` §1.3): what you
delegated, which agent, whether it wrote code or only investigated, and how its output changed the
result — including where you disagreed with it. Transparency, not a quota: never delegate
performatively, and a session that used no specialists just says that.

**Keep process proportional to risk** (owner ruling, 2026-08-27, `working-agreement.md` §1.2). The
workflow is a safety mechanism, not an objective: choose the lightest process that still gives
appropriate confidence and recoverability, and be able to say why it was sufficient. A docs-only or
no-runtime-effect change does not need the full §2 bar. Anything touching runtime behaviour, UI,
data, security, deployment, migrations **or the verification machinery itself** does — a weakened
gate is invisible until something else fails. This does not relax `git-workflow.md` §9.3: the
destructive and irreversible actions still need a specific instruction each time.

House rules: claims about third-party capabilities are labelled VERIFIED / ASSUMED / UNAVAILABLE,
with evidence in `docs/evidence/`; design may only depend on VERIFIED. Charter §4 is the scope
contract — new ideas go to a Future list, not into the current sprint.

**Git workflow — [`docs/git-workflow.md`](docs/git-workflow.md), binding on all work from
2026-08-20.** The history tells the build story: **Level → Feature → Subtask → atomic commit**. One
kebab-case, prefixed branch per feature (`feat/global-place-resolution`, `fix/resolver-ranking`);
decompose the feature into subtasks from the plan before writing code; commit each coherent subtask
once its tests and checks pass, staged intentionally and reviewed as a diff first; Conventional
Commit subjects (`feat(resolver): add Nominatim provider`) with the *why* in the body. Uncommitted
changes in the tree are user-owned — never reset, cleaned, or swept into a commit.

**Push, PR and merge are all automatic (owner ruling, 2026-08-26).** Landing goes branch → PR → **CI
green** → `npm run merge:pr -- <n>` → **verify `main` and the deployment** (§11). Merge only through
that script: GitHub branch protection is unavailable on this plan, so `scripts/merge-pr.sh` *is* the
gate — it refuses a draft, a non-`main` base, any check that is failing **or pending**, an empty
check list, a non-mergeable PR, or a branch that does not contain current `main`. **CI is the
authority, not `npm run verify`** — verify covers one of CI's four jobs, so read `gh pr checks`
before claiming anything is green. Still needing a specific instruction each time: force-push,
history rewrites, branch deletion, direct pushes to `main`, `--admin`/`--auto` merges, merging
anything not green, reverting what is already on `main`, and destructive database operations.

**The Claude Code setup is project-contained and committed — owner ruling, 2026-08-30,
[`docs/claude-code-setup.md`](docs/claude-code-setup.md).** `.claude/settings.json` (the permission
posture), `.claude/agents/` (the eleven specialists) and `.claude/hooks/` all live in the repo and
are reviewable in a diff; nothing this project depends on sits in `~/.claude/`. The settings turn
`git-workflow.md` §9.3 and `agent-guardrails.md` §1–§4 from prose into rules the harness enforces:
**`deny`** for what nobody may do here (force-push, `reset`/`clean`/`stash`/`restore`, rebase, branch
deletion, `revert`, `gh pr merge` by hand, mutating `gh api`, `vercel:*`, and **reading any `.env*`
file**), and **`allow`** for everything else. The `ask` list is **deliberately empty** — owner ruling
2026-08-30, *"soften the guards, let us work more freely"*: its 30 rules moved into `allow`, so
`db:push:*`, `db:reset`, `merge:pr` and edits to the §4.15 guarded files now run **without a
prompt**. §9.3's "a specific instruction each time" is carried by your judgement and the written
guardrails, not by the harness. A project `deny` outranks
every `allow`, including any in a user-level settings file — that is how the repo holds its own
posture. `.claude/settings.local.json` is gitignored and must never carry a rule the team relies on.

Run **`npm run check:claude`** (also inside `npm run verify`) to prove it is still wired. It failed
for real on 2026-08-30: `core.hooksPath` was unset and `.git/hooks/` did not exist, so
`.githooks/pre-push` — the only refusal of a direct push to `main` — was dead. Root cause:
`node_modules/` was absent, so `prepare` had never run. `.claude/hooks/ensure-git-hooks.sh` now
re-arms it at every session start rather than at install time.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
