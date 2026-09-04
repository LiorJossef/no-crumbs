# `3 places in Israel` over a street map of Tel Aviv — the measurement behind `9634759`

**Taken 2026-08-31 against `83b7489` (before) and `9634759` (after)**, 1440×900 dark, signed in with
the three Tel Aviv fixtures. Probe: `i2sea-heading.mjs` (session scratchpad, not committed); raw
output in `list-scope-heading-83b7489.json` and `list-scope-heading-9634759.json` beside this file.

---

## 1. The gesture that settled it

The probe reads the desktop panel's own `<h1>` out of the DOM, at rest and after each kind of camera
move. **The middle column is the finding**: a 40 px drag changes no data and barely moves the
camera.

### Before — `83b7489`

| places | at rest, no gesture | after a **40 px drag** | zoomed into the area band | into the country band |
|---|---|---|---|---|
| 0 | `Your map starts here.` | — | — | — |
| 3 | `3 places in Israel` | **`3 places in Tel Aviv-Yafo`** | in Tel Aviv-Yafo | in Israel |
| 30 | `30 places in Israel` | **in Tel Aviv-Yafo** | in Tel Aviv-Yafo | in Israel |
| 300 | `300 places in Israel` | **in Tel Aviv-Yafo** | in Tel Aviv-Yafo | in Israel |

### After — `9634759`

| places | at rest, no gesture | after a 40 px drag | area band | country band |
|---|---|---|---|---|
| 0 | `Your map starts here.` | — | — | — |
| 3 | **`3 places in Tel Aviv-Yafo`** | in Tel Aviv-Yafo | in Tel Aviv-Yafo | `in Israel` |
| 30 | **`30 places in Tel Aviv-Yafo`** | in Tel Aviv-Yafo | in Tel Aviv-Yafo | `in Israel` |
| 300 | **`300 places in Tel Aviv-Yafo`** | in Tel Aviv-Yafo | in Tel Aviv-Yafo | `in Israel` |

At 390×844, `9634759`, 3 places: the sheet heading reads `3 places in Tel Aviv-Yafo`, the peek row's
short form `3 in Tel Aviv-Yafo`, and the map's accessible name
`Map of your saved places in ⁨Tel Aviv-Yafo⁩. The list below names all 3.` — the three surfaces
cannot disagree about what the list is.

---

## 2. What the drag ruled out

Three hypotheses, settled by one gesture and in the direction that ruled out the two convenient
answers:

- **Not a fixture artefact.** `Tel Aviv-Yafo` is derivable from those rows — the product derives it
  itself, one gesture later, from the same data. Real rows behave identically; nothing depends on
  the stub.
- **Not the area path declining** (an agreement-rule miss, or a `Tel Aviv-Yafo` / `תל אביב-יפו`
  normalisation mismatch). It is never asked.
- **Not `library-summary.ts` winning.** Its country label is correct for the scope it was handed.
  The scope was `global`, and `scopeLabel`'s single-country shortcut then correctly says `Israel`.

**Every component in the chain is behaving correctly. The composition was wrong.** The default scope
was the flat constant `GLOBAL_SCOPE`, while every other scope decision in the system is a function of
the band the camera settles in — and the initial fit is programmatic, so it reports
`userInitiated: false` (correctly: that guard is what stops a re-fit or a post-import flight
rewriting the list), and the one transition that would have corrected it structurally cannot run at
rest. The drag is what makes it run: pin band under a global scope → `restoredScope` → the area under
the camera.

Not inside `BAND_EDGE_GUARD`: the resting zoom is **z14.69** at 1440×900 with these three places
(measured off the pins' own screen positions — see `night-sea-colourfulness-2026-08-31.md` §5), and
both band edges behave correctly before and after.

## 3. The stale premise

The constant's recorded rationale was the 2026-08-30 home-view reversal: *the camera opens on the
whole library, and naming one city over a view of countries is the broken control the owner rejected
when a country tap left the list behind.* **That is still true**, and it is still why two or more
areas keep the global default.

What went stale is its **premise** — that the opening view is a view of countries. It is not for the
normal library: the camera fits the library's own box, and one city fits deep in the pin band. It is
`list-scope.ts`'s own opening complaint in the mirror — the list describing something the map is not
showing.

## 4. Why the fix is safe

With exactly one area, the global scope and that area's scope hold **identically the same places**,
so the member ids, the count, the filtered list and the (empty) `Elsewhere` section are unchanged by
construction and only the label moves — to the more specific of two true names. That set equality is
asserted in `tests/unit/ui/list-scope.test.ts` rather than argued in prose.

Six assertions added, verified against the constant they replace: the old flat `GLOBAL_SCOPE` does
**not** equal what `scopeAfterCameraSettled` returns for a one-area library at pin-band zoom.

## 5. Known gap

`tests/harness/stub-supabase.mjs`'s fixtures are all Tel Aviv, so this probe exercises a **one-area
library at every place count** — including 300, where the ±0.02° jitter stays well inside the 50 km
cluster. The multi-area and multi-country arms, and the `2+ areas of one country → country scope`
promotion, are covered by unit tests only. A two-city stub would close it.
