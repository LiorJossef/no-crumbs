# W6-1 — decomposing `import-page-client.tsx`

> **Analysis only.** Written by `nextjs-architect` on 2026-08-31, branch `no-crumbs-implementation`.
> Nothing in `src/` was touched to produce it.
>
> **Base: `d7a1040da887ee43719b4bb9d04525b162aa682d`** (`refactor(tokens): collapse the raw mint ramp
> onto semantic roles`). W0-3 landed on `import-page-client.tsx` while this was being written — it
> substituted token class names in place and changed no line count, and **every line number below was
> re-verified against `d7a1040` afterwards**. Re-verify before acting on any of them anyway: this file
> has other writers tonight. It is the plan the orchestrator dispatches W1-6 and W6-1 against, and it
> is written so that W6-2, W6-3, W6-4, W6-5 and W6-7 each land in one file afterwards.
>
> The exit criterion it serves (`overnight-run-plan.md` §8, W6-1): *no file over ~450 lines;
> behaviour identical; `npm run verify` green.*
>
> **Corrected on 2026-08-31 by its author, after contact with the code (`overnight-run-plan.md` §3
> rule 7).** Five things below were wrong or were overtaken; each is corrected in place and marked
> **[corrected 2026-08-31]**. Nothing else changed. In short: W1-6 landed **before** W1-4, not after
> (§7); it removed **160** net lines rather than ~178 (§2.6); and **every line number in §1.1, §1.2,
> §1.3 and §2 is now stale**, because they were measured on the pre-W1-6 file. They are kept as the
> map of what moved where, not as coordinates to edit at — re-measure before step 4.
>
> Two more, both found while executing §7 and both corrected in place below: the contracts had to
> come out **first**, not fourth (§7's step order); and the layer guard reaches `src/app/_lib`
> specifically rather than "non-recursively" (§3.1). The plan's conclusions on both were right; its
> stated reasons were not.
>
> **The measurement that frames everything below: 713 of the file's 2,482 lines are comment lines —
> 29%.** This is not a big component with some notes on it. It is the design record of the product's
> flagship flow, with a component embedded in it. Hard rule 7 (*never delete or rewrite a comment
> explaining why*) is therefore the binding constraint on this work, not an aside; §8 says how it is
> held mechanically rather than by care.

---

## 1. The current structure, mapped

Line ranges are inclusive and measured at the base commit. A range that starts on a docblock includes
that docblock, because the docblock is the thing that must travel with the code.

### 1.1 Module-level layout

| Lines | What | Notes |
|---|---|---|
| 1 | `'use client'` | |
| 3–29 | **File header docblock** | 27 lines. Contains one stale claim — see §2.5 |
| 30–99 | Imports | 5 React hooks, `next/link`, `next/navigation`, 17 `lucide-react` icons, 2 `components/ui`, `lib/utils`, **9 statements from `@/domain/**`, 5 from `@/ui/**`** |
| 101–146 | **The probe wire contract** — `ProbeSuccess` (107–137), `ProbeCandidate` (139–142), `ProbeErrorBody` (144–146) | The `/api/imports/probe` response shape, declared client-side. No React |
| 148–173 | **Rail state** — `StageStatus` (153), `RailState` (155–162), `RAIL_IDLE` (164–172) | No React |
| 175–215 | **The `Screen` union** | 41 lines, 7 variants — §1.2 |
| 217–243 | `SaveOutcomeDetail` | Exported; the only type `map-page-client.tsx` imports from here |
| 245–285 | `ImportPageClientProps` | `onClose`, `onSaved`, `initialUrl`, `onAddManually` |
| 287–1004 | **`ImportPageClient`** — the component | 718 lines. §1.3 |
| 1006–1021 | `ScreenKicker` | Shared by paste, rail and review |
| 1023–1168 | `PasteScreen` | Includes the `<form>`, the paste-narrowing handler and the seed chips |
| 1170–1250 | `STAGE_LABEL` (1174–1178) + `RailScreen` (1180–1250) | |
| 1252–1313 | `RailStep` | |
| 1315–1425 | **`NoPlacesScreen`** (header 1315–1332, body 1334–1425) | **Live.** §2.5 |
| 1427–1517 | `ResultsScreen` (1431–1472) + `CandidateRow` (1474–1517) | **Dead.** §2 |
| 1519–1546 | Review header docblock + `ItemStatus` (1533) + `CandidatePick` (1543–1546) | |
| 1548–1939 | **`CaptionPreviewScreen`** | 392 lines. The review beat |
| 1941–1956 | `STATUS_CHIP` | Post-save outcome chips, read only by the card |
| 1958–2270 | **`ExtractedCandidateRow`** | 313 lines. The candidate card |
| 2272–2318 | Failure header docblock + `IMPORT_ERROR_ICON` (2310–2318) | |
| 2320–2482 | **`ImportFailureScreen`** | 163 lines. Serves both `redirect` and `probe_error` |

### 1.2 The `Screen` union — every kind it carries

Declared at 175–215. Seven variants:

| Kind | Payload | Constructed at | Reachable? |
|---|---|---|---|
| `paste` | — | 403 (`reset`), initial state 294 | yes |
| `redirect` | `reason: PreSubmitErrorCode` | 434 | yes — `UNSUPPORTED_HOST` / `UNSUPPORTED_URL` |
| `rail` | `rail: RailState` | 468, 478, 495 | yes |
| `no_places` | `authorHandle`, `canonicalUrl`, `hadCaption` | 512 | **yes** |
| `results` | `authorHandle`, `candidates: readonly Candidate[]` | **nowhere** | **no** |
| `caption_preview` | `probe: ProbeSuccess` | 517 | yes |
| `probe_error` | `code: DomainErrorCode`, `rawCode: string`, `retryable: boolean` | 490, 526 | yes |

Every `setScreen` call site in the file is at 403, 434, 468, 478, 490, 495, 509, 512, 517, 526. None
constructs `kind: 'results'`, and no other module can — `setScreen` is a local `useState` setter.

### 1.3 State and effects inside `ImportPageClient`

| Line | Name | Kind | Shared across beats? |
|---|---|---|---|
| 294 | `screen` | `useState<Screen>` | **yes — it is the router** |
| 295 | `url` | `useState<string>` | **yes** — paste, failure (`Retry`, `Open the TikTok`), rail cancel |
| 296 | `touched` | `useState<boolean>` | paste only, but written by `submit` |
| 305 | `offline` | `useState<boolean>` | paste only, written by `submit` |
| 310–326 | `captionSave` | `useState<{saving, error, partialNotice, statusByIndex}>` | **yes** — deliberately outside `Screen` (its own docblock says why) |
| 329 | `lastSaveDetail` | `useRef<SaveOutcomeDetail \| null>` | **yes** — read on a later click |
| 331 | `validation` | `useMemo` | derived from `url` |
| 348, 349, 352 | `invalidCode`, `showInvalid`, `canSubmit` | derived | |
| 376 | `inFlightProbe` | `useRef<AbortController \| null>` | **yes — cancellation and the double-submit guard** |
| 562 | `seedSubmitted` | `useRef<boolean>` | **yes — the once-ever `initialUrl` guard** |

Functions: `abortInFlightProbe` (378–384), `reset` (386–407), `submit` (409–545), `submitSeed`
(534–551), the `initialUrl` effect (563–573), `saveConfirmedCandidates` (575–628, **dead**),
`saveExtractedCandidates` (630–727), `backToMapWithFreshData` (729–748), `backToMap` (750–755),
`leaveImport` (757–767), `finishCaptionPreview` (769–815), `continueAfterPartialSave` (816–821).
Render: 823–1004.

Effects in the file, all three: the `initialUrl` seed effect (563–573), `RailScreen`'s 1-second
elapsed interval (1208–1213), `ImportFailureScreen`'s focus move onto the headline (2369–2371).

Component-local state that already sits correctly and stays where it is: `RailScreen.elapsedMs`;
`CaptionPreviewScreen`'s `captionOpen`, `picks`, `selected`; `ExtractedCandidateRow.optionsOpen`;
every `useId()`.

---

## 2. The dead code — W1-6, traced

All four items in W1-6's list are **genuinely unreachable**, and one of them is only unreachable
because of a property of the *server*, which is worth stating before anyone relies on it.

### 2.1 `ResultsScreen` (1431–1472) — dead

Referenced exactly once, at 964–976, inside `{screen.kind === 'results' && (…)}`. `kind: 'results'`
is never constructed (§1.2). No other module names it — the only repo-wide hits for `ResultsScreen`
are inside this file. Dead.

### 2.2 `CandidateRow` (1474–1517) — dead

Referenced exactly once, at 1458, inside `ResultsScreen`. Dead with it.

> There is an unrelated `CandidateRow` type in `tests/manual/recognition-replay.ts:391`. Different
> file, different meaning, no relationship. Do not let a grep confuse the two.

### 2.3 `saveConfirmedCandidates` (575–628) — dead

Referenced exactly once, at 969, inside `ResultsScreen`'s `onSave`. Dead with it. Its own docblock
already says so twice ("currently unreachable", "predates the real streaming route").

### 2.4 `CaptionPreviewScreen`'s `n === 0` branches — dead, via the route

`CaptionPreviewScreen` is only ever constructed at 517, on the `else` arm of `n === 0` at 509–518. So
inside it, `n === 0` is unreachable. Three sites:

| Site | Lines | Verdict |
|---|---|---|
| The H1 ternary's `probe.caption === null` and `n === 0` arms | 1715–1721 | dead — both |
| The zero-candidate muted sentence | 1798–1806 | dead |
| The footer condition `n === 0 \|\| saveableIndices.length === 0` | 1878 | **only the `n === 0 \|\|` disjunct is dead** |

Two things the implementer must get right:

1. **`probe.caption === null` is unreachable for a second reason, and it is a server property.**
   `src/app/api/imports/probe/route.ts:576–592`: `candidates` is initialised to `[]` and only assigned
   inside `if (caption !== null)`. So a null caption always yields zero candidates, which always
   lands on `no_places`. That is a cross-module invariant, not a local one — record it in the comment
   that replaces the branch, because **W6-2 splits this request in two** and a future author needs to
   know why the arm was safe to remove.
2. **The footer must become `saveableIndices.length === 0` alone, not deleted.** That branch is live
   for the case where candidates exist and none of them can be saved — `spec-no-places-found.md` §3.5
   calls it case D and explicitly keeps it on this screen. Deleting the whole branch is a behaviour
   change and a regression. Since `n === 0` implies `saveableIndices.length === 0`, dropping the
   disjunct is provably behaviour-preserving.

`onRetry` stays a live prop of `CaptionPreviewScreen` — it is what case D's `Try another link →`
calls.

### 2.5 What is **not** dead, and the stale comment that says otherwise

**`NoPlacesScreen` is live.** It is constructed at 509–516 on every zero-candidate import, which at
LEVEL B's ~27% hit rate is the *modal* outcome. It is not on W1-6's list and must not be touched.

**The file header at line 15–17 is wrong about it.** It reads:

> *The `no_places`/`results` `Screen` kinds and their `NoPlacesScreen`/`ResultsScreen` components
> predate this real wiring and are currently unreachable from this file (no code path sets them);
> they are kept as the shape L0-F6-T1's real streaming route is expected to drive, rather than
> deleted ahead of that work.*

Half of that sentence became false when the zero-candidate branch was added at 509. `results` is
still unreachable; `no_places` has been live since. **This is a finding, and it changes W1-6's
scope by one paragraph:** hard rule 7 says a comment that becomes wrong is corrected in the same
commit, so W1-6 rewrites lines 15–17 to say that `results` alone was dead and has been removed, and
that `no_places` is the modal outcome. It does not delete the paragraph.

The header also refers to `saveConfirmedCandidates` at line 11 in a way that survives (it names
`saveExtractedCandidates`, which stays) — check it reads correctly after the deletion rather than
assuming.

### 2.6 Consequences of the deletion

- `Candidate` becomes an unused import (line 82). It is used only at 195, 590, 592–593, 1431–1437,
  1474 — all deleted. Drop it from `import type { Candidate, PlaceCandidate } from '@/domain/types'`
  or `npm run lint` fails.
- **No icon import becomes unused.** `SearchCheck` survives via `CaptionPreviewScreen:1691`; `MapPin`
  survives via `NoPlacesScreen:1341`. Verified by count.
- The `results` variant leaves the `Screen` union (line 195).
- Total: 91 (`ResultsScreen` + `CandidateRow`) + 54 (`saveConfirmedCandidates`) + 12 (the render
  block) + 1 (the union line) + ~20 (the `n === 0` arms) ≈ **178 lines**, matching the plan's ~180.

> **[corrected 2026-08-31]** Measured after the commit: **230 lines removed, 70 added, 160 net**,
> 2,482 → **2,322**. The estimate above counted only deletions and was right about them (~230
> against ~178 predicted — the docblocks were longer than the line map implied). The 70 additions
> are the comments that replace the deleted branches: the invariant behind the unreachable
> `n === 0` arms had to be written down where it was being relied on, not merely deleted with the
> code it justified. §8.2's comment count went **713 → 692**, so **692 is the number step 4 must
> hold at or above**, not 713.

---

## 3. The target file tree

### 3.1 Where it goes, and why

`src/app/import/screens/` and `src/app/import/_lib/`. Three reasons, in order of weight:

1. **The run plan already names these paths.** W6-2 cites `src/app/import/screens/rail-screen.tsx`,
   W6-4 cites `src/app/import/screens/review/candidate-card.tsx`, W6-5 cites
   `src/app/import/screens/no-places-screen.tsx`. Inventing a different tree would put three later
   packages' declared path scopes at odds with the code.
2. **`_lib` is this repo's existing convention** for colocated non-routable modules —
   `src/app/map/_lib/`, `src/app/collections/_lib/`, `src/app/profile/_lib/`,
   `src/app/api/imports/_lib/`.
3. **Neither folder becomes a route.** Confirmed against the installed Next 16.3.1 docs
   (`node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` §Colocation): *"a
   route is not publicly accessible until a `page.js` or `route.js` file is added to a route
   segment"*. No file below is named `page`, `route`, `layout`, `template`, `default`, `error`,
   `loading`, `not-found`, `icon`, or `opengraph-image`, so nothing is picked up by convention.
   `screens/` without the underscore is safe; keep it, for reason 1.

**The layer guard is satisfied by construction, and this was checked rather than assumed.**
`eslint.config.mjs` restricts three zones — `src/domain/**`, `src/ui/**`, `src/integrations/**`.
`src/app/**` is in none of them, so a new client component under `src/app/import/` may import from
`@/domain`, `@/ui`, `@/components` and `@/lib` exactly as the current file does.
`scripts/check-layer-guard.sh`'s half-4 `server-only` assertion runs `find src/app/_lib`, which does
**not** reach `src/app/import/_lib`, so these modules neither need nor should carry
`import 'server-only'`.

> **[corrected 2026-08-31]** The reason above said "a non-recursive path". `find` *is* recursive;
> what makes the assertion miss these files is that `LIB_FIXTURE_DIR` is the literal
> `src/app/_lib`, a different directory. The conclusion holds and was checked by running
> `npm run check:layers` against the split (green), but the stated mechanism was wrong — and it
> matters, because it means **no guard anywhere would catch a secret-touching module put into
> `src/app/import/_lib`**. That is a real, small hazard created by reusing the `_lib` name for a
> client directory. It is recorded here and in each of those files' headers rather than fixed:
> widening the guard is a change to the verification machinery and belongs to whoever owns it. **They are client modules and every one of them must say so in
its first line of header**, because `_lib` means *server-only* everywhere else in `src/app/`.

### 3.2 The tree

Estimates are post-W1-6 and ±15%. Every file is under ~450 lines.

```
src/app/import/
├── page.tsx                                     23   unchanged by W6-1
├── import-page-client.tsx        THE SHELL    ~330   props, the run, the save, the router
├── _lib/
│   ├── screen.ts                              ~100   Screen union · StageStatus · RailState · RAIL_IDLE
│   ├── probe-contract.ts                       ~95   ProbeSuccess · ProbeCandidate · ProbeErrorBody
│   ├── use-import-run.ts                      ~250   url/touched/offline/screen · submit · abort · reset
│   └── save-extracted-candidates.ts           ~185   SaveOutcomeDetail · ItemStatus · CandidatePick · the confirm POST
└── screens/
    ├── import-shell.tsx                       ~120   <main>, the wash, the card, the ✕, the live region
    ├── screen-kicker.tsx                       ~20
    ├── paste-screen.tsx                       ~150
    ├── rail-screen.tsx                        ~160   STAGE_LABEL · RailScreen · RailStep
    ├── no-places-screen.tsx                   ~115
    ├── failure-screen.tsx                     ~215   IMPORT_ERROR_ICON · ImportFailureScreen
    └── review/
        ├── review-screen.tsx                  ~375   CaptionPreviewScreen
        └── candidate-card.tsx                 ~340   STATUS_CHIP · ExtractedCandidateRow
```

### 3.3 Props, file by file

All of these are the props the code already passes. Nothing below is a new interface; where a prop
type changes shape it is called out and the reason is a hazard from §5.

**`import-shell.tsx`**
```ts
{
  /** Overlay over the live map, or the standalone /import route. Drives the whole lg: layout fork
   *  and which close affordance renders. */
  variant: 'overlay' | 'standalone';
  /** The ✕'s action in overlay mode. NEVER ImportPageClientProps.onClose directly — see §5, H3. */
  onLeave: () => void;
  /** The one polite live region, mounted unconditionally on every screen — see §5, H4. */
  announcement: string;
  children: ReactNode;
}
```
`variant` and `onLeave` are deliberately two props rather than the one `onClose?: () => void` the
shell has today. Today `onClose` means both "we are an overlay" and "this is what ✕ does", and the ✕
must call `leaveImport` (which aborts), not `onClose` (which does not). Splitting them makes H3
unrepresentable.

**`screen-kicker.tsx`** — `{ icon: ReactNode; label: string }`. Unchanged.

**`paste-screen.tsx`** — `{ url, setUrl, setTouched, showInvalid, showOffline, canSubmit, onSubmit, onSeed }`. Unchanged.

**`rail-screen.tsx`** — `{ rail: RailState; onCancel: () => void }`. Unchanged. `RailStep` stays private to the file.

**`no-places-screen.tsx`** — `{ authorHandle, url, hadCaption, onRetry, onAddManually: (() => void) | null }`. Unchanged; W6-5 replaces the first three with `probe: ProbeSuccess` (§6.4).

**`failure-screen.tsx`** — `{ code, rawCode, retryable, url, onRetrySameUrl, onTryAnother, onBackToMap, onSignIn }`. Unchanged.

**`review/review-screen.tsx`** — `{ probe, saving, error, partialNotice, statusByIndex, onSave, onContinue, onRetry }`. Unchanged. **`probe` is passed as one object and never destructured into props** — see §5, H6.

**`review/candidate-card.tsx`** — `{ candidate, caption, view, pick, selected, frozen, status, collapsed, onToggle, onPick }`. Unchanged.

**`_lib/use-import-run.ts`**
```ts
function useImportRun(initialUrl: string | undefined): {
  screen: Screen; setScreen: (s: Screen) => void;
  url: string; setUrl: (v: string) => void;
  touched: boolean; setTouched: (v: boolean) => void;
  offline: boolean;
  showInvalid: boolean; canSubmit: boolean;
  submit: (target?: string) => Promise<void>;
  submitSeed: (seedUrl: string) => void;
  abort: () => void;
  reset: (options?: { readonly clearUrl?: boolean }) => void;
}
```

**`_lib/save-extracted-candidates.ts`**
```ts
function saveExtractedCandidates(
  picks: readonly CandidatePick[],
  extractionId: string | null,
): Promise<SaveOutcomeDetail>
```

### 3.4 The exports that must not move

`src/app/map/map-page-client.tsx:133` does
`import { ImportPageClient, type SaveOutcomeDetail } from '@/app/import/import-page-client'`, and
`map-page-client.tsx` is **another package's file** (W1-1 and W6-7 hold it). W6-1 must not edit it.
Two tests also pin the module path: `tests/unit/nav/bottom-nav-import-boundary.test.ts:102` asserts
`bottom-nav.tsx` reaches `@/app/import/import-page-client` **dynamically** and never statically, and
`:131` asserts `map-page-client.tsx` reaches it statically.

So the shell keeps its path, its named export `ImportPageClient`, and re-exports the three public
types from where they now live:

```ts
export type { SaveOutcomeDetail, ItemStatus, CandidatePick } from './_lib/save-extracted-candidates';
```

`SaveOutcomeDetail` is the only one with an external importer today; `ItemStatus` and `CandidatePick`
are re-exported anyway, because they are the documented outcome vocabulary and dropping a public
export is a contract change W6-1 has no mandate for.

---

## 4. The state that cannot move

### 4.1 Stays in the shell (or in `use-import-run.ts`, which the shell owns)

| What | Why it cannot descend |
|---|---|
| `screen` | It *is* the router. Nothing below it may write it |
| `url`, `touched` | Read by three beats and written by two. `reset({ clearUrl })`'s whole semantics live here |
| `offline` | Written by `submit`, read by `PasteScreen` |
| `inFlightProbe` + `stillCurrent()` | §4.2 |
| `seedSubmitted` + the `initialUrl` effect | §4.3 |
| `captionSave` | §4.4 |
| `lastSaveDetail` | Read on a *later* click, after `partialNotice` has been read. A ref in the shell is the only place that survives the intervening renders |

### 4.2 `inFlightProbe` — the one that must not be split at all

Lines 354–375's docblock lists three separate bugs this single ref fixes: `Cancel` actually
cancelling, a lost-race response not taking the screen, and one paste costing at most one model call.
Two e2e specs exist because two of them shipped:
`tests/e2e/import-cancel-stale-response.spec.ts` and `tests/e2e/import-double-submit.spec.ts`.

**The rule: `inFlightProbe`, `abortInFlightProbe`, `stillCurrent`, `submit` and `reset` are one
module.** They move together into `use-import-run.ts` or they all stay in the shell. Any split that
puts the ref on one side of a module boundary and a `setScreen` on the other reintroduces the class,
because the guard is *"is this response still the owner of the screen?"* and it can only be answered
where both live.

Three specific ways a naive extraction breaks it:

- Turning `inFlightProbe` into `useState`. It is read synchronously before the first `await`
  (the comment at 366–371 says why); state is a render behind and the double-submit guard evaporates.
- Giving `RailScreen` its own cancel handling. `Cancel` must call the shell's `reset()`, which
  aborts **and** clears the ref. The docblock at 378–380 is explicit that both halves matter: the
  abort stops the work, clearing the ref is what makes the in-flight handlers fall through.
- Wiring the ✕ to `props.onClose` — see §5, H3.

### 4.3 `seedSubmitted` — the once-ever guard

The `initialUrl` effect spends a Gemini call against a hard 500/day ceiling on mount.
`seedSubmitted` is the ref that stops a re-mount spending a second one, and `initialUrl` is
deliberately the only dependency with an `eslint-disable` on the exhaustive-deps rule.

**It must stay in the shell or the run hook, never in `PasteScreen`.** `PasteScreen` unmounts on
every screen transition; a mount effect there would re-fire on every return to paste. There is no
test that would catch this — it costs money, not correctness — and
`tests/unit/import/seed-links.test.ts` asserts the *shape* ("exactly one effect calls `submit`, and
it is the seed one, guarded by `seedSubmitted.current`"), which is why §7's step 1 must make that
assertion path-independent before anything moves.

### 4.4 `captionSave` — kept out of `Screen` on purpose

Its docblock (306–309) states the reason: a save failure re-shows *the same* `caption_preview` screen
with an inline error, never a transition, so it is not a member of the layout union.

**It stays in the shell and is passed down as four props, exactly as today.** Moving it into
`review-screen.tsx` would work by accident right now and break the moment anything remounts that
component — and `partialNotice` is precisely the message that must survive, because it names saves
that really happened and cannot be recomputed.

The one thing a split must not lose: **`reset()` clears `captionSave` as well as the run state**
(line 406). If `reset` moves into `use-import-run.ts`, the hook can only clear what it owns, so the
shell must wrap it:

```ts
function reset(options?: { readonly clearUrl?: boolean }) {
  run.reset(options);
  setCaptionSave({ saving: false, error: null, partialNotice: null, statusByIndex: null });
}
```

…and **every** call site must go through the shell's wrapper, not `run.reset`. Forgetting this leaves
a stale `error` or `partialNotice` in state; it re-appears the next time the review screen renders,
attached to a different import. Nothing tests this.

### 4.5 Descends, and already does

`RailScreen.elapsedMs` (+ its interval, cleared on unmount), `CaptionPreviewScreen`'s `captionOpen` /
`picks` / `selected`, `ExtractedCandidateRow.optionsOpen`, and every `useId()`.

---

## 5. The hazards a naive split introduces

Six, ordered by how quietly they fail.

**H1 — the guard tests fail *open*.** `tests/unit/import/import-error-copy.test.ts:276` reads
`src/app/import/import-page-client.tsx` and asserts none of `IMPORT_ERROR_COPY`'s strings is
hard-coded back into it. After `ImportFailureScreen` moves to `screens/failure-screen.tsx`, that test
**still passes** — while reading a file that no longer contains the component it guards. It stops
being a guard and says nothing about it. Same shape in `one-result-collapse.test.ts` (`not.toContain
("'preselect'")` and the `NoPlacesScreen` slice) and `seed-links.test.ts` (the single-probe-fetch
count and the effect scan). §7 step 1 exists solely for this, and it goes **first**, on a still tree.

**H2 — a remount resets the user's selection.** `CaptionPreviewScreen` seeds `selected` and `picks`
from `useState` initialisers. Any change that alters the element's identity between renders unmounts
and remounts it, silently discarding every tick and every shortlist pick the user made. Two ways the
extraction can cause it, and both look harmless in a diff:
- defining a component inside the shell's function body (the classic "new component type every
  render");
- adding a `key` to the rendered screen — including a well-meaning `key={screen.kind}` on a router
  wrapper, which remounts on *every* transition and would also re-run the rail's interval.
The router stays **inline JSX in the shell**, seven sibling `&&` blocks, exactly as today.

**H3 — the ✕ stops aborting.** `leaveImport` (757–767) aborts before closing, "for the same reason
`Cancel` does — the ✕ is reachable during the rail". When the chrome moves to `import-shell.tsx`, the
obvious extraction passes `onClose` straight through, because `ImportPageClientProps.onClose` and
`leaveImport` have the identical type `() => void`. The result is an overlay that unmounts with a
live request. **No test covers this.** The `variant` / `onLeave` prop pair in §3.3 is the mitigation:
`import-shell.tsx` never receives `onClose`.

**H4 — the screen-reader announcement stops working.** The `role="status" aria-live="polite"` region
at 855–872 is rendered **once, unconditionally, always mounted**, and its own comment says why: *"a
live region created in the same commit as its first message is not reliably announced."* Its content
comes from `probe_error` / `redirect`, so the natural place to put it during a split is inside
`ImportFailureScreen` — which is exactly the bug. It must live in `import-shell.tsx`, above
`{children}`, always mounted, fed by the `announcement` prop the shell computes. **No test covers
this either**, and the failure is invisible to a sighted reviewer.

**H5 — `ExtractedCandidateRow` is a component, not a helper.** It calls `useId()` and `useState`. It
must stay a component rendered as `<ExtractedCandidateRow key={i} … />` from the map at 1834. Turning
it into `renderCard(…)` called from the same map violates the rules of hooks and will not always
throw immediately.

**H6 — `probe` must be passed whole.** `views` (1599–1602) memoises on `probe.candidates`, and
`saveableIndices` (1614) and `selected` (1634) are derived from it. If the split spreads `{...screen.probe}` into
props, `candidates` gets a new identity on every shell render, the memo never hits, and the initial
`selected` computation runs against a fresh array. Nothing visibly breaks, which is what makes it
worth a rule: `probe` is one prop, one object, passed by reference.

---

## 6. The seams Wave 6 needs — designed in, not built

### 6.1 W6-2 — the source fetch as its own sub-second request

**Route:** `src/app/api/imports/source-preview/route.ts`. `POST`, body `{ url }`, same auth and same
canonicalisation as `probe`. Response is `ProbeSuccess` **minus** `extractionId` and `candidates`:
`{ sourceId, authorHandle, authorName, canonicalUrl, thumbnailUrl, caption }`. Errors use the same
`{ error: { code, retryable } }` envelope and the same `DomainErrorCode` taxonomy — no new codes, so
`errors.ts` and `import-error-copy.ts` are untouched and no UI contract changes.

Declare it as a type in `_lib/probe-contract.ts` (`SourcePreview`) and make `ProbeSuccess` extend it,
so the two responses are provably the same fields.

**How the rail consumes two responses honestly.** Today, line 478 flips `source: 'done'` with the
fact `'Read the TikTok'` immediately after the fetch is *issued* — the comment at 449–460 admits it
is "the honest approximation" available with one round trip. With two, the approximation is no longer
needed and **must be deleted, not kept**: `facelift-plan.md` §5 and hard rule 3 forbid a stage claim
the server did not send, and decision 4 in §4 says in terms that *"the facelift may not ship a more
convincing fake"*.

The sequence in `use-import-run.ts`:

1. issue **both** requests with **one shared `AbortController`** — the same `inFlightProbe` ref, so
   Cancel and the ownership guard cover both. This is the reason the seam is inside the run module
   and not inside `rail-screen.tsx`;
2. `setScreen({ kind: 'rail', rail: { ...RAIL_IDLE, source: 'active' } })` and nothing else;
3. when the source-preview response lands (`stillCurrent()`-gated): `source: 'done'` with the real
   `sourceFact` from the real `authorHandle`, `extract: 'active'`, and the post itself carried in a
   new `RailState.post: SourcePreview | null` field so the rail can show the thumbnail, handle and
   caption while extraction runs;
4. when the probe response lands: `extract: 'done'` with the count, then the landing screen (via
   W6-3's hold).

If the source-preview request fails and the probe succeeds, the rail simply never gets its
`sourceFact` — a stage that stays `active` is honest; inventing one is not.

**One question the W6-2 dispatch must answer, not this plan:** whether `/api/imports/probe` reuses
the cached `sources` row that source-preview just wrote, or refetches oEmbed. If it refetches, this
change doubles the oEmbed cost per import. The probe route does cache sources; confirm it, do not
assume it.

`RailState` lives in `_lib/screen.ts`, so W6-2 widens one type in one file and edits one function in
another.

### 6.2 W6-3 — holding the payoff count

**The two statements are `import-page-client.tsx:495–508` and `:509–518`**, and the plan's citation
of `:502` / `:509` is exact: `:502` is the `extractFact` line inside the first `setScreen`, `:509` is
the `setScreen` that immediately replaces it. Both sit in the same `async` continuation after
`await res.json()`, so React batches them into one commit and the rail carrying `3 places found`
**never paints**.

**What the state shape needs.** Nothing structural — `RailState` already carries `extractFact`. What
is missing is that the run has no way to *dwell*. So `use-import-run.ts` gains one awaited,
cancellable hold between the two `setScreen` calls:

```
setScreen(rail with the count)          // the fact the server sent
await hold(PAYOFF_HOLD_MS)              // ~700ms, abort-aware
if (!stillCurrent()) return             // re-checked AFTER the hold, not only before
setScreen(landing)
```

Two requirements the implementer must not lose:

- **the `stillCurrent()` check must be repeated after the hold.** A Cancel during those 700ms must
  leave the screen where the user left it; without the re-check the landing screen arrives after the
  user has gone back to paste. This is `import-cancel-stale-response.spec.ts`'s exact bug class with a
  new 700ms window to fire in;
- **the timer is cleared by the abort**, or `hold` is written to reject on `signal.abort`. A dangling
  700ms timer that resolves into an unmounted component is the same defect one layer down.

`PAYOFF_HOLD_MS` sits beside `RAIL_IDLE` in `_lib/screen.ts`. This holds a fact the server *did*
send, so it does not increase what the product asserts.

The exit criterion — *"test asserts the state is not overwritten in the same batch"* — is only
writable because the run becomes a module with an observable `setScreen` sequence instead of a
closure inside a 2,482-line component. That testability is the main non-cosmetic payoff of the split
and is worth saying out loud.

### 6.3 W6-4 — provenance into the badge slot

**The module that owns the logic is `src/ui/import/candidate-resolution-view.ts`**, and it is
untouched by this decomposition. `resolutionView`, `resolutionChip`, `resolverPinLine`,
`resolutionHeadline`, `resolutionExplanation`, `effectivePick`, `willSave`, `usesModelCoordinate`,
`collapsesToOneResult`, `savedPlaceName`, `resolutionOptions`, `pickRequiredNotice` all stay there,
where `tests/unit/import/candidate-resolution-view.test.ts` and `one-result-collapse.test.ts` already
cover them.

**The decomposition does not fork it, and this is checkable.** After the split, `candidate-card.tsx`
must contain no band literal — no `'preselect'`, no `'confirm'`, no `'no_match'`, no
`'not_attempted'`. It calls the view functions and renders their output. The one apparent exception,
`view.kind === 'matched'` at line 2103, is a colour decision on an already-derived kind, not a second
derivation of the band; it stays as it is. `one-result-collapse.test.ts`'s
`expect(CLIENT_SOURCE).not.toContain("'preselect'")` is the assertion that enforces this, and §7 step
1 must re-point it at `candidate-card.tsx` + `review-screen.tsx`, which is where it now means
something.

`facelift-plan.md` §1's *"preserve unchanged"* list names this logic and requires `not_attempted` to
stay distinct from `no_match` — both are separate `CandidateResolutionView` kinds
(`candidate-resolution-view.ts:72`, `:83`) with separate copy. The split touches neither, and W6-4
changes only which slot renders which, in `candidate-card.tsx`.

### 6.4 W6-5 — the no-places screen, and finding 10

**Where `onAddManually` comes from.** It is `ImportPageClientProps.onAddManually` (line 285), threaded
at 954–961 as `onAddManually={onAddManually ?? null}`. `map-page-client.tsx:1066` passes a real
opener (close the overlay, open the `＋` sheet). **`src/app/import/page.tsx:22` renders
`<ImportPageClient />` with no props at all**, so the standalone route passes nothing and the screen —
correctly, by its own rule — withholds the primary recovery on the modal outcome of an import.

**The split neither fixes nor entrenches it, deliberately.** W6-1 is a pure restructure and finding 10
belongs to W6-5. What the split *does* is make W6-5 a one-file change: `no-places-screen.tsx` keeps
`onAddManually: (() => void) | null` as a prop and keeps its "render the button only where the
destination exists" rule, so nothing about the fix is blocked by the tree.

The entrenchment to avoid, explicitly: do **not** bake `null` into the component, and do **not** read
the opener from a React context that only `/map` provides — either would make the standalone route's
missing recovery a structural property instead of a prop that is currently absent.

For W6-5's own use: `spec-no-places-found.md` §10.1 changes the `no_places` variant to
`{ kind: 'no_places'; probe: ProbeSuccess }`, §10.2 changes one branch in `submit()`, and §5.4 says
build the with-search variant. After this split those are three edits in three files
(`_lib/screen.ts`, `_lib/use-import-run.ts`, `screens/no-places-screen.tsx`) rather than three edits
in one 2,482-line file. Its strings do not change.

### 6.5 W6-7 — the interface with `map-page-client.tsx`

**Today.** `finishCaptionPreview` → `backToMapWithFreshData(detail)` (729–748), which calls
`onSaved(detail)`, then `router.refresh()`, then `onClose()`. The overlay unmounts **immediately**.
The flight happens later: `map-page-client.tsx:1072` calls `camera.framePlaces(outcome.savedPlaceIds)`,
which sets `focusPlaceIds`, and `map-surface.mapcn.tsx:1045–1059` only flies once `places` actually
contains those ids — which needs the `router.refresh()` data to land. So there is a gap where the
overlay is gone, the map is at rest, and the flight starts a beat later, unattached to the gesture.

**What the interface has to become.** The import client must stop deciding *when* the overlay
unmounts on the save path. Two shapes:

1. `onSaved` returns a `Promise<void>` the host resolves when the flight has been handed to the
   camera; the client awaits it, then closes. **Rejected** — a host that never resolves strands the
   overlay, so it needs a timeout, and a timeout is a fake.
2. **`onSaved(detail)` becomes a pure notification and the host owns the unmount.** The client calls
   `onSaved`, enters a terminal state, and does not call `onClose`. `map-page-client.tsx` sets
   `showImport = false` when it is ready to reveal the map into the flight.

**Recommend (2).** No timeout, no promise, and the decision sits with the component that owns the
camera. It requires a change in `map-page-client.tsx` — W6-7's file, not W6-1's — and a change of a
few lines in `backToMapWithFreshData`.

Two consequences W6-1 must respect now:

- **keep `backToMapWithFreshData` as one named function in the shell.** Do not inline it into
  `finishCaptionPreview`; it is the seam;
- **the standalone route is a different case and must stay so.** With no `onClose`, the client does
  `router.push('/map')` and there is no host to hand the decision to. `backToMapWithFreshData`'s
  existing `if (onClose) … else …` fork is what keeps those two paths honest; W6-7 changes only the
  overlay arm.

---

## 7. Execution order

Seven commits. Each is independently typecheckable and each leaves `npm test` green. **W1-4 and W1-6
both write `import-page-client.tsx`, so they cannot be dispatched in the same wave as each other or as
any step below** — one writer at a time on this file, throughout.

| # | Package | Writes | Gate |
|---|---|---|---|
| 1 | **W1-4** | `src/ui/import/candidate-resolution-view.ts`, `src/app/import/import-page-client.tsx` | `lint` · `typecheck` · `vitest run tests/unit/import/` |
| 2 | **W1-6** | `src/app/import/import-page-client.tsx` | `lint` · `typecheck` · `vitest run` |
| 3 | **W6-1.1** — make the three source-scanning guards path-independent | `tests/unit/import/{import-error-copy,seed-links,one-result-collapse}.test.ts` | `vitest run` green **before and after**, on an otherwise unchanged tree |
| 4 | **W6-1.2** — leaf screens out | `screens/{screen-kicker,paste-screen,rail-screen,failure-screen,no-places-screen}.tsx` + the shell | `lint` · `typecheck` · `vitest run` |
| 5 | **W6-1.3** — the review beat out | `screens/review/{review-screen,candidate-card}.tsx`, `_lib/save-extracted-candidates.ts` + the shell | same |
| 6 | **W6-1.4** — contracts and chrome out | `_lib/{screen,probe-contract}.ts`, `screens/import-shell.tsx` + the shell | same |
| 7 | **W6-1.5** — the run out | `_lib/use-import-run.ts` + the shell | `lint` · `typecheck` · `vitest run` · `npm run verify` · the e2e pass in §9 |

> **[corrected 2026-08-31] The extraction ran in four commits, not five, and in a different order.**
> The contracts (`_lib/screen.ts`, `_lib/probe-contract.ts`) came **first**, not sixth. The plan had
> the leaf screens out at step 4 and the contracts at step 6, which cannot work: `rail-screen.tsx`
> needs `RailState` and `no-places-screen.tsx` needs nothing from the shell, so extracting a screen
> before its types exist means a type-only import cycle back into the component. Steps 6 and 7 were
> then merged, because the chrome and the run are both edits to the same shell body and splitting
> them bought no bisect resolution. What actually landed:
>
> | # | Commit | Writes |
> |---|---|---|
> | 1 | the guards re-pointed | `tests/unit/import/{import-client-source,import-error-copy,seed-links,one-result-collapse}` |
> | 2 | the contracts out | `_lib/{probe-contract,screen}.ts` + the shell |
> | 3 | the leaf screens out | `screens/{screen-kicker,paste-screen,rail-screen,no-places-screen,failure-screen}.tsx` + the shell |
> | 4 | the review beat out | `screens/review/{review-screen,candidate-card}.tsx`, `_lib/save-extracted-candidates.ts` + the shell |
> | 5 | the run and the chrome out | `_lib/use-import-run.ts`, `screens/import-shell.tsx` + the shell |
>
> One design change against §3.3: **`useImportRun` does not return `setScreen`.** Handing the setter
> out would let a caller take the screen without the `stillCurrent()` gate, which is §4.2's whole
> point; the shell reads `screen` and calls `submit`/`reset`, and sets no screens.

> **[corrected 2026-08-31] The dispatch reversed steps 1 and 2: W1-6 landed first, then W1-4.**
> §7.1's recommendation below was written to keep the behaviour change out of the restructure, and
> that is still what happened — both landed before any file moved, which is the property that
> mattered. Its three reasons survive the swap intact except reason 1's arithmetic: W1-4's
> client-side call sites are now at the post-W1-6 line numbers, and W1-6 shrank the file it edits
> rather than growing it. Reason 3 is unaffected — `candidate-resolution-view.ts`, where W1-4's
> test actually lives, is untouched by W1-6.

### 7.1 Why W1-4 goes first — the recommendation

**Land W1-4 before the split, not after.** Three reasons:

1. **Its footprint is almost entirely outside this file.** The defect is `willSave`
   (`candidate-resolution-view.ts:201–207`): it returns `effectivePick(view, pick) !== null ||
   modelHasCoordinates`, which is `true` for a `capped` view with model coordinates. The fix is in
   that function. The `import-page-client.tsx` half of its path scope covers three call sites —
   `saveableIndices` (1617), the initial `selected` (1638) and the card's `saveable` (1992) — plus
   possibly the pin line at 2174. All four move as part of whole functions, so rewriting W1-4 against
   the new tree is cheap; it is just pointless work.
2. **W1-4 is a behaviour change and W6-1 is not.** W6-1's exit criterion is *behaviour identical*.
   Running a deliberate behaviour change through the same file in the same window makes that claim
   unverifiable — you can no longer tell a restructure regression from W1-4's intended effect.
   Sequencing the behaviour change first leaves the split reviewable as a diff that should contain no
   semantic change at all.
3. **W1-4 needs its test written against a file that still exists.** Its exit criterion is *"test
   asserts both"*, and a test written against the pre-split tree is one more thing step 3 has to
   re-point if it lands after.

If W1-4 slips past step 2, it must be rewritten against the new tree — its client-side edits then land
in `screens/review/candidate-card.tsx` and `screens/review/review-screen.tsx`, and its dispatch's path
scope has to say so. That is the fallback, not the plan.

### 7.2 Why step 3 goes before any file moves

The three tests read a hard-coded path. Re-pointing them **first**, while the tree still has exactly
one file, makes the change provably assertion-preserving: the same assertions run over a glob that
currently resolves to the same single file. Every later step then keeps them green automatically, and
— crucially — keeps them *meaningful*, because the glob follows the code.

Concretely, step 3:

- replaces `readFileSync('src/app/import/import-page-client.tsx')` with a helper that reads every
  `.ts`/`.tsx` under `src/app/import/` and joins them (comment-stripping applied per file, as
  `import-error-copy.test.ts` already does, before joining);
- replaces `one-result-collapse.test.ts`'s `NO_PLACES_SOURCE` slice — currently *"from
  `function NoPlacesScreen(` to the next `\nfunction `"* — with *"the file that defines
  `function NoPlacesScreen(`"*, plus an assertion that **exactly one** file defines it. That is
  strictly stronger: today the slice would silently become empty if the function were renamed;
- leaves every assertion, every string and every count identical. `seed-links.test.ts`'s
  `fetch('/api/imports/probe'` count stays 1 over the joined tree, and its `useEffect` scan still sees
  all three effects;
- extends each test's existing *"the guard above actually catches a re-hardcoded string"* self-test to
  the new shape, because a guard that cannot fail is decoration and that is the exact failure mode
  step 3 exists to prevent.

**This is not weakening a test (guardrail 16) — it is the opposite.** Left alone, all three would pass
while guarding a file that no longer contains their subject. Step 3 must be reviewed as its own
commit for precisely that reason.

---

## 8. How the comments are guaranteed to survive

713 comment lines, 29% of the file, carrying the reasoning behind every defect this screen has already
been through. Three mechanical controls, none of which is "be careful".

**8.1 Every extraction step is a move, and nothing else.** A commit in steps 4–7 may contain no line
that is not one of: a moved line, an added `import`/`export`, or a new file's own header. If a
comment's subject moves, the comment moves with it — the extraction takes contiguous byte ranges
(§1.1's table is the map), so this is the default rather than an effort. Reviewable: across the pair
of files in each step, added and removed line counts should net to roughly zero plus the import
blocks.

**8.2 A count, not a judgement.** Before step 4, record

```
grep -cE '^[[:space:]]*(\*|//|/\*)' src/app/import/import-page-client.tsx
```

which is **713** at the base commit (and will be lower after W1-6 by whatever the deleted code's own
comments were — re-measure after step 2, do not carry 713 forward). After each of steps 4–7, the same
count over `src/app/import/**/*.{ts,tsx}` must be **greater than or equal to** the recorded number. It
can only grow, by each new file's header. A drop is a dropped comment, and it is a number rather than
an opinion. Report the pair at each step.

**8.2a — and the moves carry the class strings as they are.** W0-3 has already rewritten this file's
Tailwind classes onto semantic roles. A move is a move: do not re-tune a class, collapse an arbitrary
value or "fix" a variant while relocating a block. Hard rule 6a is Wave 3's and Wave 6's redesign
packages' job, and a styling change smuggled into a restructure is exactly what makes the *behaviour
identical* claim unreviewable.

**8.3 The header docblock is split by subject, and nothing in it is deleted.** The 27-line header
(3–29) describes six things: the flow, the probe wiring, the `Screen` kinds, `canonicaliseTikTokUrl`,
the seed links, and the review picker. Each paragraph goes to the file whose subject it describes; the
shell's header becomes a map of the tree, naming each file and the beat it owns. The one paragraph
that is *wrong* (lines 15–17, §2.5) is corrected in **W1-6**, in the commit that makes it wrong — not
during the split, where a correction would be indistinguishable from a move.

Each new file's header opens with two facts: which lines of `import-page-client.tsx` it came from, and
which Wave 6 package edits it next. That is what makes the tree navigable to the six agents who arrive
after this.

---

## 9. Risks

### 9.1 The three biggest

**R1 — the source-scanning guards fail open (§5, H1).** Three tests, all in `npm run verify`'s
critical path, all reading one hard-coded path, all of which keep passing after the split while
guarding nothing. `import-error-copy.test.ts` is the worst of the three: it is the only thing stopping
an error string being re-hardcoded into the component, which is a defect this repo has already had.
Mitigation is step 3, first, on a still tree, as its own reviewable commit.

**R2 — `npm run verify` does not check the thing W6-1 is graded on.** `verify` is
`lint && typecheck && check:layers && check:migrations && check:schema && check:agents && check:claude
&& test`, and `test` is `vitest run`. **Playwright is not in it.** So the exit criterion's *"behaviour
identical"* is asserted by nothing the wave gate runs — the six import e2e specs are the only
behavioural coverage of this screen, and they need a signed-in local stack. A green `verify` on this
package means "it compiles and the unit tier is happy", and saying more than that would be exactly the
over-claim `facelift-plan.md` §5 warns about. Mitigation: run
`npx playwright test tests/e2e/import-*.spec.ts` after step 7 and report the result; if the stack is
not available, say so and drive the manual pass in §9.3 instead.

**R3 — two behaviours with zero coverage sit exactly on the extraction seam.** The always-mounted
`sr-only` live region (§5, H4) and the ✕'s abort (§5, H3) are both properties of the chrome that
`import-shell.tsx` takes over, both are silently lost by the obvious extraction, and neither has a
unit test or an e2e assertion. The `variant`/`onLeave` prop pair and the `announcement` prop are the
structural mitigation; a reviewer checking step 6 should check these two by hand and say they did.

### 9.2 The rest

| Risk | Covered by |
|---|---|
| Selection/pick state reset by a remount (H2) | nothing — inspection only |
| `reset` no longer clearing `captionSave` (§4.4) | nothing — inspection only |
| `probe` spread into props, memo churn (H6) | nothing — inspection only |
| Cancellation split from the abort ref (§4.2) | `import-cancel-stale-response.spec.ts` (e2e, not in `verify`) |
| Double submit / a second model call | `import-double-submit.spec.ts` (e2e, not in `verify`) |
| Every error code still renders a screen | `import-error-copy-render.spec.ts` (e2e) |
| A failure screen becoming a dead end | `import-failure-screen-deadends.spec.ts` (e2e) |
| Paste → rail → review → confirm → saved | `import-happy-path.spec.ts` (e2e) |
| Hostile paste never reaching the network | `import-paste-gate.spec.ts` (e2e) — pure `submit()` logic, low risk |
| Wire status per code | `import-probe-status-map.spec.ts` (e2e) — route-level, unaffected |
| `NoPlacesScreen`'s manual-add wiring | `one-result-collapse.test.ts` — **only if step 3 lands first** |
| The dynamic-import boundary for `bottom-nav` | `tests/unit/nav/bottom-nav-import-boundary.test.ts` — pins the module path, which §3.4 preserves |

**Which e2e specs the decomposition puts at risk:** all six select by role and visible text rather
than by structure, so a pure restructure should leave every one of them passing. The two that would
catch a real regression are `import-cancel-stale-response` and `import-double-submit` (they drive
§4.2's invariant directly), and `import-happy-path` is the one that would catch H2's selection reset.
None of the three runs in `verify`.

### 9.3 The manual pass, if Playwright is unavailable

At 390×844 and 1440×900, signed in, through the overlay **and** the standalone `/import` route:
paste a cached TikTok → rail → review with ≥2 candidates → open a shortlist, pick a non-default option
→ Save → the map flies; cancel mid-rail and confirm the paste field keeps the link and no screen
arrives afterwards; paste an Instagram link and confirm the redirect screen; open a zero-candidate
TikTok and confirm `NoPlacesScreen` (with the manual-add primary on `/map`, without it on `/import`);
tab to the ✕ during the rail and confirm it closes with nothing landing behind it.

---

## 10. What is deliberately not being abstracted

- **The screen router.** Seven inline `&&` blocks in the shell. A `screensByKind` map or a
  `<ScreenRouter>` component would need ~25 drilled props and would buy nothing; the router *is* the
  shell's job (§5, H2).
- **`ScreenKicker`, `STATUS_CHIP`, `IMPORT_ERROR_ICON`.** Small, single-purpose, and they stay next
  to their one consumer rather than being collected into a `shared/` bucket.
- **Anything in `src/ui/import/**` or `src/domain/import/**`.** The presentation logic already lives
  there and is already tested there. The split moves React, not reasoning (§6.3).
- **A generic "async request with cancellation" hook.** `use-import-run.ts` is one concrete run with
  one concrete guard and three documented bugs behind it. Generalising it would put §4.2's invariant
  behind an abstraction whose whole point is that it is legible.
- **`page.tsx`.** Untouched by W6-1. Finding 10 is W6-5's (§6.4).
