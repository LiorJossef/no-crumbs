# Claude Code setup — project-contained by owner ruling (2026-08-30)

> Owner ruling, 2026-08-30: **"I want all to be locally project level contained, nothing should be
> system global."** This document records what that means in practice, what is now in the repo, what
> genuinely cannot be moved into it, and how to check the whole thing is still true.
>
> This matters more here than in most repos. `docs/agent-guardrails.md` is a list of things a
> delegated specialist "must never do" — and until this ruling it was **prose only**. Nothing
> mechanical stopped an agent from running `git reset`, `cat .env.local`, or `gh pr merge --admin`.
> The permission layer that *could* have stopped them lived in `~/.claude/settings.json`, outside the
> repo, unversioned, unreviewable in a diff, and shared with four unrelated projects.

## 1. What was wrong

Measured on 2026-08-30, before this change:

| Finding | Consequence |
|---|---|
| `core.hooksPath` was **unset**, and `.git/hooks/` did not exist | `.githooks/pre-push` — the only thing refusing a direct push to `main`, because GitHub rulesets are Pro/Team-only for this private repo (`ms3-branch-protection.md`) — **was dead**. A `git push` to `main` would have succeeded. |
| No project `.claude/settings.json` | Every permission decision came from `~/.claude/settings.json`, which allowed `Bash(rm:*)`, `Bash(git:*)`, `Bash(gh:*)`, `Bash(aws:*)`, `Bash(mongosh:*)` with `defaultMode: auto` and `skipDangerousModePermissionPrompt: true`. |
| `agent-guardrails.md` had no enforcement | Eleven specialists with `Bash`, bound by a document they were merely asked to read. |
| `~/.claude/settings.json` referenced two directories that do not exist | `~/.claude/skills/commit-alpha`, `~/Documents/Zendesk Arbitrip Helper/.claude/skills` — injected into every session's working-directory list regardless. |
| Four allowlisted skills had no definition | `Skill(deploy:*)`, `Skill(commit:*)`, `Skill(update-config:*)`, `Skill(schedule:*)` — only `brief` and `sessions` exist, and neither is about this project. |

The `pre-push` finding is the one that mattered. It is armed by `package.json`'s `prepare` script,
which runs on `npm install` **and at no other time** — so a fresh clone, a wiped `node_modules`, or a
stray `git config --unset` disarms `main`'s only protection and reports nothing.

## 2. What is now in the repo

```
.claude/
  agents/           11 specialists — already tracked, unchanged (docs/01-agent-roster.md)
  hooks/
    ensure-git-hooks.sh   SessionStart: re-arms core.hooksPath every session, not just at install
  settings.json     the project's permission posture — allow / ask / deny
  launch.json       npm run dev on :3000
.githooks/pre-push  refuses direct pushes to main (unchanged; now reliably armed)
scripts/check-claude-config.sh   the gate that proves all of the above is still wired
```

`.claude/settings.local.json` is gitignored — it is the per-machine escape hatch and must never
carry a rule the team relies on.

### 2.1 The three permission buckets

The buckets are a direct translation of `git-workflow.md` §9.3 and `agent-guardrails.md` §1–§4 from
prose into something the harness enforces.

**`deny`** — never, by anyone, in this repo. Force-push in any form; `git reset` / `clean` / `stash`
/ `restore` / `rm`; rebase and `filter-branch`; branch deletion; `git revert`; `git push origin main`
and the `ALLOW_MAIN_PUSH=1` escape hatch; `gh pr merge` by hand and every mutating `gh api` verb;
`supabase secrets|projects`, `stop --no-backup`, `vercel:*`; `db:inventory:staging|prod`; `rm -rf`;
and **reading or editing any `.env*` file**, which is `agent-guardrails.md` §3 item 9 made real.
`deny` outranks every `allow`, including the ones in `~/.claude/settings.json` — this is the
mechanism by which the repo takes its posture back from the machine.

**`ask`** — the deliberate, announced steps. §9.3 says these need "a specific instruction each
time", and a permission prompt *is* that instruction: `db:push:staging|prod`, `db:reset`,
`db:verify`, `merge:pr`, `supabase db push|reset|link`, `psql`, `gh pr create|edit|close`, and edits
to the files `agent-guardrails.md` §4 protects — `CLAUDE.md`, `docs/security.md`, `.claude/agents/`,
`.claude/settings.json`, `.github/workflows/`, `scripts/merge-pr.sh`, `scripts/check-*.sh`,
`scripts/db-push.sh`, `scripts/db-env.sh`, `supabase/tests/`, `.githooks/`, `.gitignore`.

`ask` rather than `deny` on that last group is deliberate: the orchestrator legitimately needs to
edit `.github/workflows/` — restoring CI is open item 3 in `current-state.md` — and an agent that can
edit the check that grades it is exactly what §4 forbids. A prompt distinguishes the two without
blocking the work.

**`allow`** — the actual toolchain: the `npm run` scripts, `vitest`, `playwright`, `tsc`, `eslint`,
read-only `git`, read-only `gh`, `supabase migration list|status|start`, and the ordinary shell verbs
used for reading files.

### 2.2 The SessionStart hook

`.claude/hooks/ensure-git-hooks.sh` checks `core.hooksPath` at the start of every session and
re-points it at `.githooks` if it has drifted. Silent when already correct; prints one line to stderr
when it has to fix something, so the fix is visible without being noise. Verified in both directions
on 2026-08-30.

## 3. What cannot be moved into the repo, and why

Being honest about the boundary is the point of writing this down. Claude Code **merges** user-level
and project-level settings; a project file overrides scalars and adds rules, but it cannot *delete*
what the user file declares. Three things therefore remain global:

1. **User-level hooks still run.** `~/.claude/settings.json` registers a `PostToolUse:Write` hook
   (`close-vscode-tab-after-write.sh`) and a `UserPromptSubmit` + `SessionStart` hook
   (`dispatch/route-guard.mjs`). Both fire in this repo. The route guard can *block a prompt* it
   judges to belong to another live session's lane — worth knowing before a prompt is refused for a
   reason that is not in this repository. Override prefix: `!!`.
2. **`permissions.additionalDirectories` from the user file is merged in**, which is why this session
   lists x-lab and Klairr paths as working directories.
3. **User-level skills stay visible** (`brief`, `sessions`). Neither is about P-002.

Removing those means editing `~/.claude/settings.json`, which is shared with the owner's other
projects — the route guard in particular is cross-session traffic control that trader-2.0 and x-lab
depend on. That is an owner decision, not a repo one, and it is deliberately left outside this
change.

**What the repo *can* do, and now does, is make the global permission allowlist irrelevant here**:
every risky entry in it is countered by a project-level `deny`, and `deny` wins.

## 4. How to check it is still true

```bash
npm run check:claude        # or: npm run verify, which now includes it
```

`scripts/check-claude-config.sh` fails if any of these rot:

- `.claude/settings.json` is missing or does not parse;
- `core.hooksPath` is not `.githooks`, or `.githooks/pre-push` is not executable — i.e. `main` is
  unprotected again;
- the SessionStart hook is missing, not executable, or not referenced by `settings.json`;
- a rule that `git-workflow.md` §9.3 requires has fallen out of the `deny` or `ask` list;
- `.claude/settings.local.json` is not gitignored, or has been committed.

The last one matters: a personal override file that reaches `main` silently re-grants whatever it
lists to everyone.

## 5. Change log

- **2026-08-30** — created. Owner ruling that the setup be project-contained. Found `core.hooksPath`
  unset and `main` consequently unprotected; added `.claude/settings.json`,
  `.claude/hooks/ensure-git-hooks.sh` and `scripts/check-claude-config.sh`; wired `check:claude` into
  `npm run verify`; gitignored `.claude/settings.local.json`.
