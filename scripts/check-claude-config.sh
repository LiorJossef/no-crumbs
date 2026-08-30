#!/usr/bin/env bash
# Consistency gate for the project-contained Claude Code setup (docs/claude-code-setup.md).
#
# Owner ruling 2026-08-30: the configuration is project level and committed, not system global.
# A config change has nothing to execute, so this script *is* its test. It proves the five things
# that rot silently, and the first one is the one that actually bit us:
#
#   1. `main` is protected  — core.hooksPath points at .githooks and pre-push is executable.
#      Measured 2026-08-30: it was unset, .git/hooks/ did not exist, and `git push` to main would
#      have gone straight through. It is armed by `npm install` and by nothing else, so a fresh
#      clone or a wiped node_modules disarms it silently.
#   2. The SessionStart hook that re-arms (1) exists, is executable, and is actually referenced.
#   3. The permission posture still encodes git-workflow.md §9.3 and agent-guardrails.md §1-§4.
#   4. The shared settings are COMMITTED — the point of the ruling. Untracked settings are one
#      `git clean` away from nothing, and cannot be reviewed in a diff.
#   5. The per-machine override file is ignored and has never been committed. A settings.local.json
#      on main re-grants whatever it lists to everyone, silently.
#
# Owned by qa-reliability (test infrastructure). Specialists must not edit it — docs/agent-guardrails.md §4.
set -uo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import json, os, subprocess, sys

FAIL = []
def bad(msg): FAIL.append(msg)

SETTINGS = ".claude/settings.json"
LOCAL    = ".claude/settings.local.json"
HOOK     = ".claude/hooks/ensure-git-hooks.sh"
PREPUSH  = ".githooks/pre-push"
DOC      = "docs/claude-code-setup.md"

def git(*args):
    try:
        return subprocess.run(("git",) + args, capture_output=True, text=True).stdout.strip()
    except Exception:
        return ""

# --- 1. main is protected -----------------------------------------------------------------
hooks_path = git("config", "core.hooksPath")
if hooks_path != ".githooks":
    bad(f"core.hooksPath is '{hooks_path or 'unset'}', not '.githooks' — main is UNPROTECTED. "
        f"Fix: npm run prepare")
if not os.path.isfile(PREPUSH):
    bad(f"{PREPUSH} is missing — the only refusal of a direct push to main is gone")
elif not os.access(PREPUSH, os.X_OK):
    bad(f"{PREPUSH} is not executable, so git will not run it")

# --- 2. the re-arming hook ----------------------------------------------------------------
if not os.path.isfile(HOOK):
    bad(f"{HOOK} is missing — nothing re-arms core.hooksPath after a fresh clone")
elif not os.access(HOOK, os.X_OK):
    bad(f"{HOOK} is not executable")

# --- settings load ------------------------------------------------------------------------
if not os.path.isfile(SETTINGS):
    bad(f"{SETTINGS} is missing — the project has no permission posture of its own, so it "
        f"inherits ~/.claude/settings.json, which is what the 2026-08-30 ruling forbids")
    settings = {}
else:
    try:
        settings = json.load(open(SETTINGS, encoding="utf-8"))
    except Exception as e:
        bad(f"{SETTINGS} does not parse: {e}")
        settings = {}

perms = settings.get("permissions", {}) or {}
deny  = set(perms.get("deny", []) or [])
ask   = set(perms.get("ask", []) or [])
allow = set(perms.get("allow", []) or [])

if settings:
    hooks = settings.get("hooks", {}) or {}
    referenced = json.dumps(hooks)
    if "ensure-git-hooks.sh" not in referenced:
        bad(f"{SETTINGS} declares no SessionStart hook running ensure-git-hooks.sh, so finding (1) "
            f"can recur unnoticed")

# --- 3. the posture still encodes the written rules ----------------------------------------
# Each entry is (rule, why) so a failure says which document it broke, not just which string.
REQUIRED_DENY = [
    ("Bash(git push --force:*)",   "git-workflow.md §9.3 — force-push, in any form"),
    ("Bash(git push -f:*)",        "git-workflow.md §9.3 — force-push, in any form"),
    ("Bash(git rebase:*)",         "git-workflow.md §9.3 — rewriting shared history"),
    ("Bash(git reset:*)",          "agent-guardrails.md §1.2 — uncommitted changes are user-owned"),
    ("Bash(git clean:*)",          "agent-guardrails.md §1.2 — uncommitted changes are user-owned"),
    ("Bash(git branch -D:*)",      "git-workflow.md §9.3 — deleting branches"),
    ("Bash(git push origin main:*)", "git-workflow.md §9.3 — pushing directly to main"),
    ("Bash(ALLOW_MAIN_PUSH=1:*)",  "git-workflow.md §9.3 — the escape hatch is not a shortcut"),
    ("Bash(git revert:*)",         "git-workflow.md §9.3 — reverting what is already on main"),
    ("Bash(gh pr merge:*)",        "git-workflow.md §9.1 — merge only through npm run merge:pr"),
    ("Bash(gh api -X POST:*)",     "agent-guardrails.md §1.4 — no mutating gh"),
    ("Bash(gh api -X DELETE:*)",   "agent-guardrails.md §1.4 — no mutating gh"),
    ("Bash(vercel:*)",             "agent-guardrails.md §2.7 — never deploy or configure hosting"),
    ("Bash(supabase secrets:*)",   "agent-guardrails.md §2.5 — never touch staging or production"),
    ("Read(./.env.local)",         "agent-guardrails.md §3.9 — .env.local holds real secrets"),
    ("Read(./.env)",               "agent-guardrails.md §3.9 — .env.local holds real secrets"),
    # Denying Read() alone is not enough and the first version of this file got that wrong.
    # §3.9 names `cat` and `grep` specifically, and an allowed shell reads a denied file happily.
    ("Bash(cat .env:*)",           "agent-guardrails.md §3.9 — names cat explicitly; Read() deny does not cover the shell"),
    ("Bash(grep .env:*)",          "agent-guardrails.md §3.9 — names grep explicitly"),
    ("Bash(source .env:*)",        "agent-guardrails.md §3.9 — never source .env.local"),
    # --no-verify walks straight past .githooks/pre-push, which is the ONLY protection on main.
    ("Bash(git push --no-verify:*)",   "agent-guardrails.md §1.3 — never pass --no-verify"),
    ("Bash(git commit --no-verify:*)", "agent-guardrails.md §1.3 — never pass --no-verify"),
    ("Bash(git config:*)",             "agent-guardrails.md §1.3 — never change git config or core.hooksPath"),
    ("Bash(git push -u origin main:*)", "git-workflow.md §9.3 — pushing directly to main, via the -u form"),
]
REQUIRED_ASK = [
    ("Bash(npm run db:push:staging:*)", "git-workflow.md §9.3 — db:push is deliberate and announced"),
    ("Bash(npm run db:push:prod:*)",    "git-workflow.md §9.3 — db:push is deliberate and announced"),
    ("Bash(npm run db:reset:*)",        "agent-guardrails.md §2.6 — destroys local data"),
    ("Bash(npm run merge:pr:*)",        "git-workflow.md §9.1 — landing is announced"),
    ("Edit(.claude/agents/**)",         "agent-guardrails.md §4.15 — an agent must not edit its own definition"),
    ("Edit(CLAUDE.md)",                 "agent-guardrails.md §4.15 — guarded file"),
    ("Edit(scripts/merge-pr.sh)",       "agent-guardrails.md §4.15 — the gate must not edit itself"),
    ("Edit(.github/workflows/**)",      "agent-guardrails.md §4.15 — guarded file"),
    ("Edit(supabase/tests/**)",         "agent-guardrails.md §4.15 — guarded file"),
    ("Edit(.githooks/**)",              "the pre-push guard must not be edited unprompted"),
]
if settings:
    for rule, why in REQUIRED_DENY:
        if rule not in deny:
            bad(f"deny list is missing `{rule}` — {why}")
    for rule, why in REQUIRED_ASK:
        if rule not in ask:
            bad(f"ask list is missing `{rule}` — {why}")
    overlap = deny & (ask | allow)
    if overlap:
        bad(f"rules appear in deny and also in ask/allow, which is ambiguous: {sorted(overlap)}")
    if not allow:
        bad("allow list is empty — every ordinary command would prompt, and the posture "
            "gets turned off wholesale the first time that happens")

# --- 4. the shared settings are committed --------------------------------------------------
tracked = set(git("ls-files", ".claude", "scripts/check-claude-config.sh", DOC).splitlines())
for path in (SETTINGS, HOOK, DOC, "scripts/check-claude-config.sh"):
    if path not in tracked:
        bad(f"{path} is not tracked by git — the 2026-08-30 ruling is that this configuration is "
            f"committed, reviewable in a diff, and shared. Fix: git add {path}")

# --- 5. the per-machine override is ignored and uncommitted --------------------------------
ignored = subprocess.run(("git", "check-ignore", "-q", LOCAL), capture_output=True).returncode == 0
if not ignored:
    bad(f"{LOCAL} is not gitignored — a personal override that reaches main re-grants whatever it "
        f"lists to everyone")
if git("ls-files", LOCAL):
    bad(f"{LOCAL} is COMMITTED. It must not be. Fix: git rm --cached {LOCAL}")

# --- report ---------------------------------------------------------------------------------
print(f"checked the project-contained Claude Code setup against {DOC}")
print(f"  core.hooksPath   {hooks_path or 'unset'}")
print(f"  permissions      {len(allow)} allow, {len(ask)} ask, {len(deny)} deny")
print(f"  tracked          {len([p for p in (SETTINGS, HOOK, DOC) if p in tracked])}/3 shared files committed")

if FAIL:
    print("\nFAILED:")
    for f in FAIL:
        print(f"  - {f}")
    sys.exit(1)
print("\nclaude config is project-contained, committed, and main is protected")
PY
