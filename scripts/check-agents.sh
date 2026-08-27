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

# Every subagent_type named in docs/ or CLAUDE.md must be a real agent.
KNOWN = set(agents)
for doc in ["CLAUDE.md"] + glob.glob("docs/*.md"):
    for ref in set(re.findall(r"`([a-z]+-[a-z-]+)`", open(doc, encoding="utf-8").read())):
        if ref in KNOWN or "-" not in ref: continue
        if ref in {"current-state","execution-plan","working-agreement","git-workflow","mvp-plan",
                   "agent-guardrails","place-store","service-role","saved-places","place_provider_refs"}:
            continue

print(f"checked {len(agents)} agent definitions against {ROSTER}")
for name in sorted(agents):
    print(f"  {agents[name][0]:<7} {name}")

if FAIL:
    print("\nFAILED:")
    for f in FAIL: print(f"  - {f}")
    sys.exit(1)
print("\nagent system is internally consistent")
PY
