#!/usr/bin/env bash
# Consistency gate for the specialist agent system (docs/01-agent-roster.md).
#
# A docs-and-config change has nothing to execute, so this script *is* its test. It proves the
# four things that silently rot: an agent's declared tier matching the roster, a tier's tool set
# matching its declaration, every referenced doc path existing, and the set of agents being the
# same in the definitions, the roster table and the prose.
#
# Owned by qa-reliability (test infrastructure). Specialists must not edit it — docs/agent-guardrails.md §4.
set -uo pipefail
cd "$(dirname "$0")/.."

python3 - "$@" <<'PY'
import os, re, sys, glob

FAIL = []
def bad(msg): FAIL.append(msg)

AGENT_DIR = ".claude/agents"
ROSTER = "docs/01-agent-roster.md"

# The tier fixes the Bash boundary and the file-editing core. Web access is a per-agent need
# (maps and extraction read provider docs; qa does not), so it is optional at every tier.
TIER_TOOLS = {
    "Advise": {"Read","Grep","Glob","Write","Edit"},
    "Build":  {"Read","Grep","Glob","Write","Edit","Bash"},
    "Probe":  {"Read","Grep","Glob","Write","Edit","Bash"},
}
OPTIONAL_WEB = {"WebSearch","WebFetch"}

files = sorted(glob.glob(f"{AGENT_DIR}/*.md"))
if not files:
    bad(f"no agent definitions found in {AGENT_DIR}")

agents = {}
for path in files:
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        bad(f"{path}: frontmatter does not parse"); continue
    fm, body = m.group(1), m.group(2)

    name = re.search(r"^name:\s*(\S+)\s*$", fm, re.M)
    tools = re.search(r"^tools:\s*(.+)$", fm, re.M)
    desc  = re.search(r"^description:\s*(.+)$", fm, re.M)
    if not name: bad(f"{path}: no name in frontmatter"); continue
    if not tools: bad(f"{path}: no tools in frontmatter"); continue
    if not desc:  bad(f"{path}: no description in frontmatter")

    name = name.group(1)
    stem = os.path.basename(path)[:-3]
    if name != stem:
        bad(f"{path}: name '{name}' does not match filename '{stem}'")

    tier = re.search(r"\*\*Tier:\s*(Build|Probe|Advise)", body)
    if not tier:
        bad(f"{path}: body declares no '**Tier: ...**'"); continue
    tier = tier.group(1)

    declared = {t.strip() for t in tools.group(1).split(",") if t.strip()}
    required = TIER_TOOLS[tier]
    missing = required - declared
    extra   = declared - required - OPTIONAL_WEB
    if missing: bad(f"{name}: tier {tier} requires {sorted(missing)} but they are not declared")
    if extra:   bad(f"{name}: tier {tier} must not declare {sorted(extra)}")
    if tier == "Advise" and "Bash" in declared:
        bad(f"{name}: Advise tier must not have Bash")
    if tier in ("Build","Probe") and "Bash" not in declared:
        bad(f"{name}: {tier} tier requires Bash")

    # Build and Probe agents must be bound by the guardrails.
    if tier in ("Build","Probe") and "agent-guardrails.md" not in body:
        bad(f"{name}: {tier} tier does not reference docs/agent-guardrails.md")

    agents[name] = (tier, body, path)

# Every docs/ path referenced by any agent body must exist.
for name, (tier, body, path) in agents.items():
    for ref in sorted(set(re.findall(r"`(docs/[A-Za-z0-9._/-]+\.md)`", body))):
        if not os.path.isfile(ref):
            bad(f"{name}: references {ref}, which does not exist")

# Roster table must list every agent with the same tier.
roster = open(ROSTER, encoding="utf-8").read()
rows = dict(re.findall(r"\|\s*`([a-z-]+)`\s*\|\s*(Build|Probe|Advise)\s*\|", roster))
for name, (tier, _, _) in agents.items():
    if name not in rows:
        bad(f"{name}: missing from the roster table in {ROSTER}")
    elif rows[name] != tier:
        bad(f"{name}: definition says {tier}, roster says {rows[name]}")
for name in rows:
    if name not in agents:
        bad(f"roster lists '{name}' but {AGENT_DIR}/{name}.md does not exist")

# Every agent named in docs/ or CLAUDE.md must be a real agent.
#
# This check was dead from the day it was written until 2026-08-30: the loop filtered candidates
# and then fell off the end without ever calling bad(), so the script's header claimed four checks
# and delivered three. The reason it was neutered is visible the moment you re-enable it naively —
# `([a-z]+-[a-z-]+)` inside backticks matches 95 tokens across these documents, nearly all of them
# `aria-label`, `bg-card` and friends. An allow-list of exceptions loses that race permanently.
#
# So match the *context* instead of the shape: a kebab-case token is only read as an agent
# reference where the surrounding prose says it dispatches, owns, or staffs work. Measured
# 2026-08-30 across CLAUDE.md and all of docs/: 8 distinct agents matched, zero false positives.
# A pattern that stops matching is a silent regression, so the count is asserted below.
# Each entry is either a pattern (applies to every document) or a (pattern, only_in_file) pair.
AGENT_REF_PATTERNS = [
    r"subagent_type[:=]?\s*`([a-z][a-z-]+)`",          # dispatch, the literal API
    r"`([a-z][a-z-]+)`\s+(?:sub)?agent\b",             # "`qa-reliability` agent"
    r"\b(?:sub)?agent\s+`([a-z][a-z-]+)`",             # "agent `qa-reliability`"
    r"[Oo]wners?:\s*`([a-z][a-z-]+)`",                 # "Owner: `security-privacy`"
    # NOTE: the `·`-separated form is scoped to execution-plan.md, where it was written for the
    # feature rows. Applied repo-wide it reads any `·`-separated list of code identifiers as agent
    # names: measured 2026-08-30, `plan-nav2-map-shell.md` lists React state variables that way and
    # the check failed on `query`, `clusters`, `countries` and `facets`. That failure was live on
    # main and took `npm run verify` red with it. That file is in docs/archive/ now, so it is no
    # longer scanned — the scoping stays because the hazard is the pattern's, not one file's.
    (r"·\s*`([a-z][a-z-]+)`\s*(?:·|$)", "docs/execution-plan.md"),
    r"\b(?:spec|build|review|owned by|delegated to)\s+`([a-z][a-z-]+)`",
    r"^\|\s*`([a-z][a-z-]+)`\s*\|\s*(?:Build|Probe|Advise)\s*\|",   # the roster table
]
# **SQL roles are not agents, and this is a category distinction rather than an allow-list.**
# `owned by `postgres`` is how every migration ruling states object ownership, and the `owned by`
# pattern above cannot tell that from `owned by `qa-reliability``. The four names below are the
# complete set of roles this schema grants to — they are fixed by Postgres and Supabase, not by us,
# so this cannot rot the way an exceptions list does: it does not grow as the repo grows, and a new
# agent can never be called one of them because `check-agents` would reject the filename anyway.
SQL_ROLES = {"postgres", "authenticated", "anon", "service_role"}

KNOWN = set(agents)


def scan(docs, validate=True):
    """Distinct agent names the patterns find across `docs`.

    `validate` off means: count them, but do not require each to be a real agent. Used for the
    frozen archive, where a name that no longer exists is a record rather than a defect.
    """
    found = set()
    for doc in docs:
        text = open(doc, encoding="utf-8").read()
        for entry in AGENT_REF_PATTERNS:
            pattern, only_in = entry if isinstance(entry, tuple) else (entry, None)
            if only_in is not None and doc != only_in:
                continue
            for ref in re.findall(pattern, text, re.M):
                if ref in SQL_ROLES:
                    continue
                found.add(ref)
                if validate and ref not in KNOWN:
                    bad(f"{doc} names `{ref}` as an agent, "
                        f"but {AGENT_DIR}/{ref}.md does not exist")
    return found


# **The floor is asserted on the live documents only, and docs/archive/ is deliberately excluded.**
#
# The count below is a canary for pattern rot, not a target: if a doc rewrite changes how agents are
# named, the regexes stop matching and this check quietly becomes the dead code it replaced. That
# only works if the corpus it counts is the corpus people still edit. docs/archive/ is frozen, so
# folding it in would let 89 files that nobody will ever touch hold the count up forever — the
# canary would be alive and blind. Counting it separately is the point.
#
# Archived documents are not name-validated either, and that is the same reasoning from the other
# side: they are a frozen record. Renaming an agent must not turn every handoff that mentioned the
# old name into a failure nobody can honestly fix.
LIVE_FLOOR = 7  # measured 2026-09-07 across CLAUDE.md + docs/*.md, zero false positives.
matched = scan(["CLAUDE.md"] + sorted(glob.glob("docs/*.md")))
archived = scan(sorted(glob.glob("docs/archive/*.md")), validate=False)

if agents and len(matched) < LIVE_FLOOR:
    bad(f"the agent-reference patterns matched only {len(matched)} agents across the live "
        f"documents ({LIVE_FLOOR} on 2026-09-07). A doc rewrite has probably changed how agents "
        f"are named, and this check is drifting back towards the dead code it replaced — widen "
        f"AGENT_REF_PATTERNS")

print(f"checked {len(agents)} agent definitions against {ROSTER}")
print(f"  agent references: {len(matched)} distinct in the live documents "
      f"(floor {LIVE_FLOOR}), {len(archived)} in docs/archive/ — archived is reported, not asserted")
for name in sorted(agents):
    print(f"  {agents[name][0]:<7} {name}")

if FAIL:
    print("\nFAILED:")
    for f in FAIL: print(f"  - {f}")
    sys.exit(1)
print("\nagent system is internally consistent")
PY
