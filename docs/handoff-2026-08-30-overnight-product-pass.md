# Handoff — the overnight product pass

Session of **2026-08-29 → 2026-08-30**, run against a standing owner instruction to own the
session, fix what is broken, add small high-value features, and leave the product noticeably
better by morning. Lean was restated three times and is the governing constraint on everything
below.

Twelve branches, each its own PR, each merged through `npm run merge:pr` with CI green.

---

## 1. What landed on `main`

| PR | What |
|---|---|
| #84 | **Three of four map controls were unreachable on a phone.** At 375×812 the sheet rests at y=684; `Zoom out` opened at 699 and `Find my location` at 739, both wholly behind it, and locate also sat under the create FAB. The `globals.css` rule added for this could never have covered them — it selects `.maplibregl-ctrl-bottom-right`, MapLibre's own chrome, and mapcn's `<MapControls>` is a separate absolutely-positioned div. Buttons also went 32px → 40px. |
| #85 | Four import defects: the Google Maps link followed the caption instead of the branch you picked; the review thumbnail handed TikTok the page URL; four Hebrew names clipped from the *start*; an offline paste blamed our servers (`INTERNAL`) for a request that never left the device. |
| #86 | **The map canvas said "Map".** `mapAccessibleName` shipped written and unit-tested with zero call sites. It now says what is on it and that the list beside it is complete. |
| #87 | The `Not been yet` chip only appears when something is marked been (library-wide, because the chip filters the map too); `Marked as been in August` on both detail surfaces; and a **dashed ring on the row's pin disc** for the 21 of 31 places whose coordinate is the model's own guess. |
| #88 | **"No places found" got the screen it was written.** `NoPlacesScreen` existed, reviewed, and *nothing ever constructed it* — every zero-candidate import fell through to the review screen. At this pipeline's hit rate that is the screen most imports end on. |
| #89 | `#בראסרי18` ("Brasserie 18") was rejected. The filter was exonerated by test; the prompt's every worked example paired a category with another *word*, never a number. `PROMPT_VERSION` p13 → **p14**. |
| #90 | An empty library opened its sheet to `full` — the first thing a new user saw was one button above ~1100px of white. Opens to `half`. |
| #91 | **LIVE-4: separate cities stopped being one area.** See §2. |
| #92 | The import rail said "This usually takes a few seconds" through a measured 7–34s extraction. The line now changes with elapsed time and still never claims progress. |
| #93 | **A place tells you what else of yours is around it** — your other saved places within 1 km, on both detail surfaces. Measured: at 1 km, 30 of 32 places have a neighbour, median 2. |
| #94 | **`/profile`** — third bottom-nav tab, sign-out moved inside it, library stats. |
| #95 | **The `＋` creates, and a place can be added by name.** See §3. |

---

## 2. LIVE-4 — the area grouping, and what it cannot fix

Reported from production: `4 places in תל אביב-יפו` over a set holding Ra'anana and Rishon LeZion.

`clusterByProximity` was single-link at 50 km, and Israeli cities are 11–15 km apart — not a
chaining artefact, just too coarse. **Geometry alone cannot fix it**, and that was measured:

- 10 km separates the owner's four, with **0.2 km** of margin over London's own 10.99 km diameter.
  Two ordinary greater-London saves (Croydon, Enfield) then split London in two.
- Complete-link is worse: at 10 km it shatters the real London into 15 + 3.
- A locality **veto** shatters Tel Aviv into four — the library holds five spellings across two
  scripts.
- A veto gated to *resolved* rows still fails: an untrusted row 11 km from Rishon becomes a bridge
  and walks Rishon back into Tel Aviv transitively.

**The rule now:** two places link when within **2 km** (names ignored) **or** within 50 km **and**
both localities normalise to the same string. A name may only ever *join*, never *split*.

**What it cannot fix, and this is the more important half.** The owner also reported a place on
`ירושלים 121` — a Ra'anana address — whose row *and* card said `תל אביב-יפו`.
`src/domain/import/candidate-place.ts:254-255` builds an `llm_guess` place with
`locality: candidate.cityHint` and `lat/lng: candidate.coordinates`, both straight from the model.
A wrong city guess therefore produces a wrong label **and** a wrong pin, and every grouping rule
then behaves correctly on bad data. **This is the open defect behind that screenshot.** It is not a
clustering bug and no clustering rule should be contorted to catch it.

---

## 3. The create sheet was complete and unrendered

`AddSheet` — three panes, the whole owner-specified create menu — was committed deliberately
unwired in `0ce9512` when a session ran out of budget. `grep -rln AddSheet src/` returned only its
own file. `npm run verify` was green because it was unreachable.

That is the **second** such component found tonight (`NoPlacesScreen` was the first). Both were
reviewed, both looked finished, and both were dead. Worth a habit: after a session that ends early,
grep the new components for call sites before trusting a green suite.

Wiring it produced manual add, and **three defects no unit test could have seen**:

1. **The create menu's two actions were both dead.** `AnimatePresence mode="wait"` never ran its
   exit, so `state.pane` moved to `place` while the rendered child stayed the menu, settled at
   `opacity: 1`, indefinitely. Diagnosed by reading `data-pane` in a browser against the DOM.
2. **The pasted link was dropped** on handoff to the import overlay.
3. **A manually added place said its category was "worked out from the post."** There is no post.

Manual add's call sequence is the one proved against the container last session and was not
re-implemented. **One provider lookup, on explicit submit only** — the host has no `useEffect` at
all, so there is nowhere for a query-watching one to be added later.

---

## 4. Owed, in the order I would take it

1. **The `＋`'s accessible name still says "Add a TikTok"** (`bottom-nav.tsx`, `ADD_LABEL`). It opens
   a create menu now. One string, blocked tonight only because that file was on an open PR.
2. **Desktop has no `＋` at all** — `BottomNav` is `lg:hidden`, so a desktop user cannot reach manual
   add or new-collection. The panel's `Add a TikTok` button is the obvious place to route it, and
   that is a product call rather than an oversight.
3. **The `llm_guess` locality defect** in §2. The honest fix is a decision about whether we store a
   city we cannot corroborate at all.
4. **p14's obedience is unverified.** Every test asserts the text of the request, not the answer.
   Needs ~3 live calls: the reported caption, the five-reject caption, and a `#tokyo2025` control.
5. **`FLOATING_TOP_CHROME_MOBILE_PX` now over-reserves** — it exists to reserve space for the
   account chip, which is `hidden` below `lg` since #94. That phantom allowance is exactly what
   `L2-COLL-CAM-2` blames for pins clipping on short viewports.

## 5. Owner's Future list, captured tonight and not started

Stated as wanted, explicitly not now: **natural-language search** ("italian restaurant in tel
aviv", "coffee place near me"), and a **travel-planning feature** in Plotline's shape. Manual add
was the third of that set and is done (#95).

The owner also asked whether moving the renderer to Google Maps discards the map work. Measured:
**11 of 164 source files** touch MapLibre and all 11 are inside `src/components/map/` (one already
dead). `MapSurface` is a port with three implementations behind it. The real trade is
**compliance** — `06` §3.1 lists MapLibre-map + Google-Places as explicitly forbidden, which is
today's configuration — against **the look**, since `06` §2 rates Google's visual control as
failing Charter §6, "the map style is the brand".

## 6. Verification, and where it stopped

Everything claimed above was exercised in a browser against the real 32-row local library at
375×812 (and 1280×720 where desktop mattered), except where a PR says otherwise. Two honest gaps:

- **The import review card** was never seen. Reaching it costs a fresh extraction plus Google
  Places lookups, and no cached extraction matches `p13-s4`/`p14-s4`.
- **Production is unreadable to me.** `PROD_DATABASE_URL` is populated, but both `psql` and
  `scripts/usage-review.sh prod` are blocked by this session's permission classifier. Several
  production questions in §2 need one read the owner must authorise.

Quota spent: **two Gemini extractions** (both zero-candidate posts, so no Places lookups) and
**one Google Places lookup** for the manual-add round trip. One row was written to the local
database and removed through the product's own Remove; the library is back at 32.

## 7. Agents used

`qa-reliability` (backlog triage against the code — its status table is what set tonight's order),
`nextjs-architect` twice (the import defects; the create sheet and manual add),
`design-system-frontend` (the list work), `maps-geospatial` (LIVE-4 — it measured four options and
correctly **refused** the gated-veto variant I proposed to it, with numbers), `ai-extraction` (the
hashtag rule).

Every agent claim marked "verified" here was re-checked by me. Corrections I made to their work:
the approximate-pin marker was moved from a glyph trailing the category line onto the row's own pin
disc (a lone dashed circle after `Restaurant · ת״א` attaches to nothing); the `anyVisited`
predicate was rescoped from the area's rows to the whole library; the `no_places` screen was given
the canonical URL rather than the raw paste state; and `ResolutionOption.address` was split from
`.detail` so the Maps query could not search the sentence "No address in the map data". Nothing is
left running.
