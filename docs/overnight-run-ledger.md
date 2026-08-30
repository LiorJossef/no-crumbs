# Overnight run — ledger

> One row per work package, appended as the run proceeds. Protocol: `docs/overnight-run-plan.md` §7.
> A package closes only on an independent pass by an agent that did not build it.

**Branch:** `no-crumbs-implementation` · **Baseline tag:** `pre-facelift` (`1b79e9c`)

## Baseline re-measured 2026-08-31 00:39 (§4)

| Metric | Plan's baseline | Re-measured | Agrees? |
|---|---|---|---|
| Tests passing | 2017 in 114 files | **2017 in 114 files** | yes |
| `@theme` keys | 36 | **36** | yes |
| Arbitrary-value classes | 166 | **166** | yes |
| Raw `var(--mint-N)` call sites | 75 | **75** | yes |
| `active:` uses | 3 | **3** | yes |
| `group-hover:` uses | 0 | **0** | yes |
| `motion-safe:` uses | 0 | **0** | yes |
| `loading.tsx` files | 0 | **0** | yes |
| Brand asset files | 0 | **0** | yes |
| Hard-coded hex in `*.tsx` | (K12, uncounted) | **26** | new baseline |

Every published number reproduced. No correction owed to §4.

## Packages

| ID | Commit | Built by | Verified by | Verdict | Evidence |
|---|---|---|---|---|---|
