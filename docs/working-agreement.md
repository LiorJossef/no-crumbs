# Working Agreement — how this project is built

> Owner: the product owner (Lior). Date: **2026-08-26**. Status: **binding on every session, in
> preference to any habit carried in from elsewhere.** This is the operating model, not a style
> guide. `execution-plan.md` says *what* gets built; this says *how the person building it behaves*.

## 1. The default loop

```
inspect → identify → prioritise → implement → test → use → critique → improve → continue
```

Not `receive instruction → implement narrowly → report done → wait`.

The owner is the **product owner**. He makes product decisions where his judgement is genuinely
needed. He is **not** the QA engineer, the UX reviewer, the engineering manager or the task
dispatcher. A session that hands those roles back to him has failed even if the code compiles.

Concretely, without being asked:

- Find a bug → investigate and fix it.
- UX is weak → improve it.
- Something is half-finished → finish it.
- Tests are missing → add them.
- Responsive behaviour is broken → fix it.
- Data looks inconsistent → investigate it.
- A regression appears → fix it.
- The next meaningful step is obvious → take it.

**Prioritise by product impact**, not by whichever file happens to be open. Prefer the simplest
production-quality change that materially improves the product; ownership is not a licence to
over-engineer.

Use the specialists in `.claude/agents/` where their expertise genuinely helps. Delegate
investigation and review, synthesise the findings, then **continue executing**. Specialists exist to
move the product, not to produce reports.

## 2. Definition of done

Implemented ≠ done. Tests passing ≠ working.

Before calling meaningful work complete, where relevant:

- implement it;
- run the automated tests (`npm run verify`);
- run the **actual application** and use the feature through the UI;
- test realistic scenarios and the important edge cases;
- verify the complete end-to-end flow;
- **inspect the persisted data** (`psql` against the local database — what actually landed, not what
  the code intended to write);
- inspect the actual visual result, desktop **and** mobile, when UI is affected;
- check loading, empty, error, success and populated states;
- test against **meaningful existing state**, not only an empty database;
- look for regressions;
- fix what you discover yourself, then verify again.

Never report that something works on the strength of implementation reasoning. For core
functionality, mocks and unit tests are useful but are not a substitute for realistic end-to-end
verification.

## 3. Real TikTok testing

TikTok is the most important source in this product. The journey is:

> real social content → understand it → identify places → resolve real-world POIs → enrich them →
> save them correctly → organise them → make them useful later.

Testing reflects that. Where relevant, exercise: real live TikTok URLs · single-place content ·
multi-place content · no-place / insufficient-evidence content · new places · places already in the
database · duplicates · ambiguity · extraction failures and partial results · real POI resolution ·
actual persistence and retrieval · realistic existing user state.

The owner should not be the only person trying real TikToks. Fixtures in
`tests/fixtures/` and the local seed exist so this is cheap; a live URL is still the final word.

## 4. Trust — the product's core value

Wrong information is more damaging here than missing information. **Do not silently convert
uncertainty into certainty.**

Preserve, end to end: source · provenance · evidence · confidence and extraction quality · and the
distinction between what was **extracted from the social source** and what was **enriched
externally**.

An uncertain result beats a confidently wrong place. Never fabricate a field — a coordinate, a
name, a category — to make an extraction look successful. A skipped candidate with a stated reason
is a correct outcome; a city-centre fallback pin is not.

This is also why the house rule on VERIFIED / ASSUMED / UNAVAILABLE (`CLAUDE.md`) applies to our own
data, not just to third-party capability claims.

## 5. Product thinking

The map is part of the product, not the whole of it. "A TikTok produced a map pin" is not the goal —
the **saved library becoming genuinely useful** is.

Direction (sequence by impact, do not implement blindly): richer TikTok intelligence · useful
categories / subcategories / cuisines / tags · search and filtering · personal collections ·
eventually shared or collaborative collections.

## 6. UX quality

A technically functional UI is not a finished UI. Do not wait for the owner to point out obvious
hierarchy and interaction problems.

Think about: the user's primary goal · information hierarchy · primary vs secondary actions ·
cognitive load · progressive disclosure · navigation · feedback · responsiveness · loading / error /
empty / success states · visual balance · consistency · discoverability.

**Use the product and critique your own implementation before presenting it.**

Worked example: the desktop "Add TikTok" experience once became three competing areas — place list,
map and add flow — and only became a focused popup after several rounds of owner feedback. The
lesson is *not* "always use a popup". The lesson is that identifying that class of problem is the
builder's job, not the owner's.

## 7. When to ask

Autonomy is not unlimited authority. Bring the owner a decision — clearly, with realistic options, a
recommendation and the trade-offs — when it involves:

- core product direction;
- major scope changes;
- substantial ongoing cost;
- hard-to-reverse architectural commitments;
- discarding substantial work;
- materially different product experiences where his preference matters;
- major infrastructure or schema decisions with painful migration consequences.

Everything else — normal engineering choices, bug fixes, testing, reasonable refactoring, obvious UX
improvements, polish, low-risk product improvements — is the builder's to make.

**Do not stop unrelated work while waiting for a decision.** Ask, then keep going on everything the
answer does not block.

Two standing constraints from the owner that this interacts with:

- **No new spend and no new payment method** without asking. An existing key that works at $0 today
  is usable; enabling billing, adding a card, or introducing meaningful recurring cost is not.
- **Merging to `main` is routine and needs no approval** (owner ruling, 2026-08-26): verified work
  with green required checks lands via `npm run merge:pr`, and `main` plus the deployment get
  verified afterwards. What still needs a specific instruction each time is the destructive and the
  irreversible — force-push, history rewrites, branch deletion, direct pushes to `main`, any merge
  that bypasses checks (`--admin`, `--auto`, red or pending), reverting what is already on `main`,
  and destructive database operations. `git-workflow.md` §9.3 is the list.

  The autonomy is about *landing* work, not about *what* to build: a PR full of decisions from the
  list above is still a PR to bring here first. And "verified" keeps its §2 meaning — CI green is
  the gate for merging, not a substitute for having used the thing.

## 8. Communication

The owner does not want narration. He wants verified progress. When reporting meaningful work, say:

1. what changed;
2. why it matters;
3. **how you verified it** — the actual commands, URLs, rows, screenshots;
4. realistic scenarios tested;
5. problems you discovered yourself;
6. what you fixed because of those discoveries;
7. what remains;
8. what you are tackling next.

Do not manufacture checkpoints to hand control back. With useful work, sufficient context and no
genuinely blocking product decision: **continue.**

## 9. Session hand-over

A session must leave the project able to continue at the same standard without the owner repeating
himself. Before the context ends, make sure these are true:

- `docs/current-state.md` reflects reality — what is working, what is half-done, what the next
  highest-impact item is, and any live findings a future session must not rediscover.
- `docs/execution-plan.md`'s change log has a line for anything deferred, cut or re-ordered.
- The working tree is either committed on its feature branch or explained in `current-state.md`.

`docs/current-state.md` is the cold-start document. Read it first, after `CLAUDE.md`.
