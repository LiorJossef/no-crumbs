# Q3 — nothing over-claims. Verdict.

**Judge:** `security-privacy` · **Date:** 2026-08-31 · **Gate:** `docs/overnight-run-plan.md` §8a Q3.

> *the rail makes no stage claim the server did not send; no screen presents inferred content in the
> same visual register as verbatim content; no invented confidence number appears anywhere; the
> capped candidate does not save silently.*

---

## 0. What this verdict is against, and why it is one artefact

Read and reasoned at **`8d9514b1d4a74f6b81651ea4b6040b6616f89343`**. Screenshots taken against the
same commit. The rendered-text probe ran twice, against **`2b9ed918a35c25264dc1bcc094e4853513e72c5a`**
and then **`0fe2ccc1892e7ac1ba0f2f6f58002f2242208c22`** — because `HEAD` moved six commits under me
mid-review (sign-in, sheet, map, harness). Same result both times.

That drift is disclosed rather than glossed, and then closed:

```
$ git diff --stat 8d9514b 2b9ed91 -- src/app/import src/ui/import src/domain/import \
                                      src/domain/extraction src/components/add
(no output)
$ git diff --stat 8d9514b 0fe2ccc -- <the same five paths>
(no output)
```

**The entire import surface is byte-identical across all three commits**, so every piece of evidence
below describes one artefact. Nothing here is a claim about the working tree, which held four other
agents' half-finished work throughout.

### Evidence produced

| | |
|---|---|
| 10 screenshots, both gate viewports | `node tests/harness/capture-screens.mjs --from-commit HEAD --dev` — rail, review, no-places, error, at 390×844 and 1440×900 |
| A rendered-text probe, run twice | `tests/manual/q3-review-card-text.manual.mjs`, written for this review. Exit 0; reproduces at any commit |

The probe exists because the screenshots could not answer the gate's fourth claim. The candidate
list is an internal scroll container, so the third card — the `capped` one that the whole claim is
about — is below the fold in every capture at both viewports, and `--full-page` does not reach it
either. **A gate judged only on what fits in the frame would have passed the one card it exists to
check without ever seeing it.** The probe reads `innerText` and `aria-checked` instead.

Dev mode is required and is not a weakening: `dev-screen.ts` guards its `?state=` seam on a literal
`process.env.NODE_ENV !== 'production'` that the bundler *folds*, so in a production build the
branch and its fixtures are eliminated rather than shipped-and-unreachable. I checked that guard
before trusting anything it produced (§5).

---

## 1. The rail claims no stage the server did not send — **PASS**

### 1.1 The old fake is deleted, not kept beside the real one

`git show b644385 -- src/app/import/_lib/use-import-run.ts` removes exactly this:

```js
const fetchPromise = fetch('/api/imports/probe', { … });
setScreen({ kind: 'rail',
  rail: { ...RAIL_IDLE, source: 'done', sourceFact: 'Read the TikTok', extract: 'active' } });
…
const res = await fetchPromise;
```

`source: 'done'` set on the statement after the fetch was *issued*, with the comment calling it "the
honest approximation". Deleted. `git grep "honest approximation" HEAD -- src/` returns three hits and
**all three are prose describing the deletion** — `source-preview/route.ts`, `use-import-run.ts`,
`rail-screen.tsx`. No live code.

### 1.2 Every stage assignment in `src/`, audited

`git grep "source: 'done'\|extract: 'active'\|…" HEAD -- src/` returns eleven lines. Three are the
`RAIL_IDLE` constant and two label maps. The live ones:

| Assignment | Set when | Server-sent? |
|---|---|---|
| `source: 'active'` | the client has committed to issuing the request | a claim about our own action, not the server's |
| `source: 'done'` + `sourceFact` + `extract: 'active'` | **after `await post('/api/imports/source-preview')` resolves and `previewRes.ok`** | yes — and `sourceFact` carries `previewBody.authorHandle`, the real handle off the real response |
| `source/extract: 'done'` + `extractFact` + `extractCount` | after the probe response | yes, all four fields off `body` |

I chased the one gap worth chasing. `extract: 'active'` is set *before* the probe request exists —
but there is no `await` between that `setScreen` and `await post('/api/imports/probe')`, and
`fetch()` initiates synchronously, so React cannot paint an `active` extract stage without the
request already being in flight. Not a window.

**The failure path under-claims, which is the right direction.** A preview failure is swallowed and
the rail stays `source: 'active'`, `extract: 'pending'` for the whole 7–34 s while extraction really
is running. The screen says less than it knows. That is the correct error for this gate to make.

### 1.3 Every timer in the flow, and there are exactly four

```
$ git grep -n "setTimeout\|setInterval\|requestAnimationFrame" HEAD -- src/app/import src/ui/import
hold.ts:34            setTimeout(finish, ms)          the payoff hold
count-tick.tsx:89     setInterval(…)                  animates 0 → the server's number
rail-screen.tsx:78    setInterval(…, 1000)            elapsed clock, drives railWaitLine
import-confirmation.tsx:62  setTimeout(onDismiss…)    toast dismissal
```

None advances a stage. `railWaitLine` changes copy on elapsed time — `This usually takes a few
seconds.` → `Still reading.` → `Still going. A long caption can take up to half a minute.` — with no
percentage, no estimate and no step marked done. `CountTick` clamps with `Math.min(next, value)`, so
it cannot overshoot the true count, and it is `aria-hidden` with the settled sentence in `sr-only`.

### 1.4 The 700 ms hold — delays a transition, never advances a stage

Read directly rather than taken from the test. After `await hold(PAYOFF_HOLD_MS, probe.signal)` the
remainder of `submit` is:

```ts
if (!stillCurrent()) return;
setScreen(n === 0 ? { kind: 'no_places', probe: body } : { kind: 'caption_preview', probe: body });
```

One ownership re-check and one screen swap. **No stage field is touched after the hold.** The hold
sits between two `setScreen` calls that were previously adjacent statements in one `async`
continuation, so React batched them and the settled rail rendered for zero frames. The `await` ends
the batch. It holds a fact the server already sent; it does not manufacture one.

`hold` resolves on abort rather than rejecting — a rejection would land in `submit`'s catch and show
a user who pressed Cancel an `INTERNAL` error about our servers. Timer cleared and listener removed
either way.

### 1.5 What the rail actually renders

`resolve` is removed from `stages` in `rail-screen.tsx`, with the honest reasoning: `/api/imports/probe`
is one request and one response, so there is no boundary inside it for anything to report crossing,
and a third step that could never run is a step that stays grey forever. `PipelineStage` keeps all
three values because the pipeline has three; the rail narrates the two it can.

`RailStep`'s `activeCopy` is `null` unless `progress` is set, and `progress` is never set today —
this is `7845314`, "stop the rail restating itself". Before it, step two read `Finding the places`
above `Finding the places…`: a slot filled rather than a fact reported.

The captured rail confirms all of it:

```
WORKING ON IT / Adding your TikTok / This usually takes a few seconds.
@demo's TikTok / <caption, verbatim>
✓ Reading the TikTok
    Read @demo's TikTok
◌ Finding the places
Cancel
```

Two stages. One fact, and it names *which* TikTok — something the label could not say. The running
step has a spinner and **no line at all**. No percentage, no ETA, no "step 2 of 3", no third greyed
stage.

**Verdict: PASS.**

*One nit, filed as a nit.* `Still reading. A longer caption takes longer.` shows at 10–25 s, by
which point the source stage has long settled and what is running is extraction, not reading. It is
ambient copy about the pipeline rather than a stage claim, and `railWaitLine`'s own docblock says so.
Not a Q3 failure; worth a word if anyone touches that file.

---

## 2. Inferred content is not in the same visual register as verbatim content — **PASS**

### 2.1 The visual weight moved

`provenanceBadge` occupies the badge slot; `settlednessLine` takes the line provenance vacated.
Three tones, and they are genuinely three treatments in `candidate-card.tsx`:

```
settled     → bg-accent text-brand           (mint)
caption     → bg-warning/10 text-warning     (amber)
needs_pick  → bg-card-2 text-foreground      (neutral)
```

`caption` is deliberately not the quiet one. A pin the model guessed is a different kind of claim,
not a lesser version of a matched one, and painting it grey is what made it the quietest thing on the
card in the first place.

The captured review screen shows a mint `From the map data` beside `HaKosem`, a neutral
`Needs your pick` beside `Cafe Cafe`, and `Matched` demoted to a small line beneath with a check
glyph. A matched pin reads as matched; a caption-derived pin reads as caption-derived. At a glance,
at 390 px.

### 2.2 The logic did not move — verified from the diff, not the message

```
$ git show 16c32a4 --stat
 src/ui/import/candidate-resolution-view.ts | 108 ++++++++++
```

**108 insertions, zero deletions in that file.** `resolutionView`, `effectivePick`, `resolutionChip`
and `resolverPinLine` are untouched. `provenanceBadge` and `settlednessLine` are pure derivations
from those same primitives, and C121 reads its words off `resolutionChip` rather than restating them.
The commit's "none of the logic moved" is literally true.

### 2.3 `not_attempted` is not `no_match`

The branch order in `provenanceBadge` is the control, and it is load-bearing:

```ts
if (view.kind === 'capped' || view.kind === 'not_attempted')  return { label: 'Not checked',  … };  // C123
if (view.kind === 'unresolved')                                return { label: 'No match',     … };  // C124
```

C123 is tested before C124 and C124 only matches `unresolved`, so **neither view can ever produce
the other's label** — not by ordering accident, by construction. `resolverPinLine` draws the same
line with a second sentence: `capped`/`not_attempted` get `Pin from the caption. We didn't check
this one.`, where `failed`/`unresolved` get the bare `Pin from the caption`. "We never looked" is not
"we looked and found nothing", and the screen says both.

The rendered proof, from the probe: `Miznon` carries **`Not checked`**. `No match` appears nowhere,
correctly — the fixture has no `unresolved` candidate.

A gap the author recorded rather than filled: a `failed` lookup with **no** model coordinate gets
`null`, because none of the five ruled labels fits and `No match` would claim a search that returned
an answer. `lookupFailureNotice` covers it at screen level. Recorded rather than papered over, which
is the behaviour this gate wants.

**Verdict: PASS.**

---

## 3. No invented confidence number — **PASS**

I grepped for it four ways: `confidence|certainty|probability|accuracy|% sure|toFixed`, then for
`{…score…}` in any rendered slot, then for `%` in `src/ui` and the import screens, then for
`<meter`, `role="progressbar"`, `Star`, `out of 5`.

- **Nothing.** No percentage string, no meter, no bar, no star, no `/10`.
- `resolutionScore` is written to `places.resolution_score` and read back by `get-spots.ts` into the
  `Spot` object. **No component reads it for display.** It is a diagnostic column, which is what
  `0010` calls it.
- The internal band names (`preselect`, `confirm`, `no_match`) appear in `src/` only inside comments.
  `candidate-card.tsx` states the rule at the top of the file — *"No band literal lives here"* — and
  the file honours it.
- `location-certainty.ts` is the one surface that answers "how sure are you". It used to print
  `Matched via llm-guess · 87% confidence`. That is gone, and the module's own header gives the right
  reason: `resolution_score` is not a probability of being right, so printing one lent false
  precision to the least certain rows and contradicted the review screen's own rule two taps later.
  What replaced it is words — `Approximate location` / `Matched on Google Maps` — and `null` where
  there is no provenance, because inventing a third label would be inventing a claim.

The rendered review screen carries no number except `3 places found` and `1 of 3 selected`, both of
which are counts of rows.

**Verdict: PASS.**

---

## 4. The capped candidate does not save silently — **PASS, both halves**

### 4.1 The function

```ts
export function arrivesTicked(modelHasCoordinates: boolean, view: CandidateResolutionView): boolean {
  if (view.kind === 'capped' || view.kind === 'not_attempted') return false;
  return willSave(modelHasCoordinates, view, null);
}
```

- **Withheld where we never looked.** `capped` / `not_attempted` → `false`, unconditionally, model
  coordinate or not.
- **Kept where we looked and failed.** `unresolved` / `failed` fall through to
  `willSave(mHC, view, null)`. `effectivePick` returns non-null only for `matched` or an explicit
  pick, so for those two views this reduces to `modelHasCoordinates` — **still ticked**. The
  2026-08-28 degraded-path ruling is not quietly repealed.

Getting that backwards would have been its own over-claim in the other direction. It is not
backwards.

### 4.2 It is actually wired

`review-screen.tsx` seeds its `useState` initialiser from `arrivesTicked` and computes
`saveableIndices` from `willSave`. Two questions, two functions, and the right one at each site. The
capped card keeps its checkbox, is counted in `saveableIndices` and is included by `Select all` — a
default, not a veto.

### 4.3 The rendered proof, and it is unambiguous

The `?state=review` fixture is three candidates: `matched`, `ambiguous` (`coordinates: null`), and
`capped` — and the capped one inherits the default `coordinates: { lat: 32.0755, lng: 34.7746 }`, so
`modelHasCoordinates` is **true** for it. Under the old `willSave` seeding it would arrive ticked.

Probe output at `2b9ed91`:

```json
"body": "… 1 of 3 selected … HaKosem / From the map data … Cafe Cafe / Needs your pick …
         Miznon / Not checked …",
"ticks": [
  { "label": "HaKosem From the map data Restaurant · Tel Aviv", "checked": "true"  },
  { "label": "Miznon Not checked Restaurant · Tel Aviv",        "checked": "false" }
]
```

**`1 of 3 selected`, and the capped card is `aria-checked="false"` while carrying a model
coordinate.** That single line is the G5 fix, observed rather than asserted. Reproduced identically
at `0fe2ccc` on a second run. And the card states its
provenance — `Not checked` in the badge, `Pin from the caption. We didn't check this one.` on its
line — while the user decides.

**Verdict: PASS.**

*One observation, not a failure.* `arrivesTicked` returns `true` for `ambiguous` **when the model has
a coordinate** — options exist, none is picked, and the save falls back to the caption pin. The
screen is honest about it: `provenanceBadge` returns `From the caption` for exactly that case, and
`resolverPinLine` says so too. The shipped fixture does not exercise it (`coordinates: null`), so it
is unphotographed. It is stated in the code, deliberately, and the reasoning is written down. If the
owner wants that card unticked too, that is a product decision and a one-line change — but it is not
what W1-4 was scoped to and it is not an over-claim.

---

## 5. The seam that made this judgeable, checked before it was trusted

`dev-screen.ts` fabricates rail and review states. A fabrication seam reachable in production would
be a Q3 failure in itself, so I checked it before believing anything it rendered:

- `devScreensEnabled()` is a **literal** `process.env.NODE_ENV !== 'production'` comparison, exported
  so a test can assert it. A literal is what the bundler folds; an indirection would leave the branch
  correct-but-shipped. The module says exactly that, and it is right.
- It is a **render-time override** (`devScreen ?? runScreen`), not a state seed. `useImportRun`'s
  `screen`, `submit`, `reset` and the in-flight guard never see it.
- It reads `window.location` directly and returns early unless `pathname === '/import'`, so
  `/map?state=review` cannot force the overlay `ImportPageClient` that `/map` mounts. `useSearchParams`
  would have handed it `/map`'s query string and opened a second route into a screen a real user
  reaches.
- The harness labels dev captures `stub-dev--…` **in the filename** and records `buildMode: "next dev"`
  in the manifest, so a picture cannot be separated from the fact that it came from a fixture.

The fixture's own `canonicalUrl` is `https://www.tiktok.com/dev-screen-fixture` — deliberately not a
real post URL — for the same reason the harness renamed its place fixtures: a picture of a real venue
asserts that somebody saved it, and nobody did.

No objection.

---

## 6. The two extras

### W1-2 — `truncated` held distinct from `dropped`: nothing conflates them

Two different facts about one reply, and the split is real:

- `CANDIDATE_CAP = 12` (keep) and `FLOOD_GUARD_CANDIDATES = CANDIDATE_CAP * 2` (refuse). These were
  one number, and the envelope was parsed *before* the item-by-item salvage — so a post naming 13
  places produced **zero**, with the salvage that exists for exactly that case never running.
- `PartialExtractionResult` carries `dropped`, `truncated` and `total` as three fields.

Checked downstream, since that was the question. Both adapters
(`gemini.place-extractor.ts`, `anthropic.place-extractor.ts`) emit **two separate events** under
independent guards:

```ts
if (parsed.value.dropped   > 0) ctx.log.event('extraction.candidates_dropped',   { dropped: … });
if (parsed.value.truncated > 0) ctx.log.event('extraction.candidates_truncated', { truncated: … });
```

Different names, different fields, never summed, never folded into one `reason`. And the honest
structural reason nothing else can conflate them: `ports.ts`'s `PlaceExtractor` returns candidates
and a `cityHint` and has **no channel to say "there were more"** — so neither count is visible
downstream at all. The log line is the only place either fact exists, and the file says so rather
than implying the screen knows.

**Not conflated.** The limitation is disclosed in the type's own docblock, which is where it belongs.

### W1-5 — the schemeless bare domain: **honest restraint**, with the argument understated

The behaviour: `canonicaliseTikTokUrl('kolamba.co.uk')` returns `MALFORMED_URL`, byte-identical to
what it returns for `Kolamba`, so `universal-input.ts` files it as `kind: 'text'`.

The commit justifies this as *"separating them means guessing that a dot makes a string a URL"*, with
`St. John` as the counter-example. Taken alone that is a slightly convenient framing — a TLD-suffix
check would separate `kolamba.co.uk` from `St. John` without the failure it names, and the commit
does not mention that option.

But the code has a **better argument than the commit makes**, and it is the one that decides it:

```ts
const RECOGNISED_LINK_CODES: ReadonlySet<string> = new Set(['UNSUPPORTED_HOST', 'UNSUPPORTED_URL']);
```

The Add sheet classifies by **the canonicaliser's own verdict**, not by a local heuristic. That is
precisely what closes G4 — two surfaces disagreeing about one string. A TLD heuristic added *here*
would reintroduce the disagreement, because `/import` would still treat `kolamba.co.uk` as
`MALFORMED_URL` and show inline C06. The two surfaces currently agree that a schemeless domain is not
a recognised link, and that agreement is the property the package was built to establish.

**And the failure direction is the safe one for this gate.** Treating a link as text is
under-recognition; it offers the user an action and asserts nothing false. Nothing is saved silently:
manual add resolves the string and reports not-found. Over-claiming would be the reverse — deciding a
place name is a URL — and the commit's line on that is the right one: *the product may decline to
read a link; it may not decide a place name is one.*

**Judgement: honest restraint, correctly recorded rather than hidden.** If it is ever closed, it
belongs in `canonicaliseTikTokUrl` so both surfaces move together — never in `universal-input.ts`.

---

## 7. Verdict

| Claim | Verdict |
|---|---|
| 1. The rail claims no stage the server did not send | **PASS** |
| 2. Inferred content is not in verbatim content's visual register | **PASS** |
| 3. No invented confidence number | **PASS** |
| 4. The capped candidate does not save silently | **PASS** |

**Q3 passes.** The product does not fake streamed stages: it deleted the fake it had, shipped a
second real round trip in its place, removed a stage it could not honestly narrate, and left the
running step's fact line **empty** rather than filling it with its own label. The one timer in the
flow holds a true sentence for 700 ms and touches nothing. The card carrying the least provenance on
the screen arrives unticked and says twice where its pin came from.

Two things beyond the four, offered rather than filed as defects:

1. `railWaitLine`'s 10–25 s string says "Still reading" while extraction is what is running (§1).
2. `arrivesTicked` returns `true` for `ambiguous` with a model coordinate; the badge says `From the
   caption` on that card, so it is stated, but it is unphotographed and is an owner call if anyone
   wants it changed (§4.3).

## 8. One process note, and it is not about Q3

`HEAD` moved five commits between my first read and my last probe. The import surface was untouched
by all five and I proved that with a diff before writing a verdict — but the reason I could is that I
was reading exported commits rather than the tree. **A gate judged against "the working tree" tonight
would have been judged against something that no longer exists.** Guardrail 31 is doing real work
here, not ceremony.

---

### Artefacts

- `tests/manual/q3-review-card-text.manual.mjs` — the rendered-text probe written for this review.
  Reads the three cards' `innerText` and `aria-checked` at a named commit, because the card the
  fourth claim is about does not fit in the frame.
- 10 screenshots at `8d9514b`, both gate viewports, in this session's scratch directory. Not
  committed: they are dev-mode, fixture-backed captures of a state no user has reached, and
  `docs/evidence/` should not accumulate pictures of fixtures without a reason to keep them. The
  probe reproduces the load-bearing half as text, deterministically, from any commit.
