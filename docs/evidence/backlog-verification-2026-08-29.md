# Backlog verification — `product-backlog-2026-08-29.md`, 18 claims

> Task `BACKLOG-VERIFY-1`. Verification only — **nothing was fixed**, no `src/**` file was modified,
> nothing committed.
>
> **Measured against:** working tree at `864c1ab`, branch `feat/collections` (the branch changed
> under this task mid-run — the session opened on `feat/tiktok-media-acquisition`), and the running
> local database `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (31 saved places, 31
> places, 50 extracted candidates).
>
> **Runtime evidence** comes from a real signed-in session driven with Playwright against
> `next dev` on `localhost:3000`, as `demo@example.com`, at **both** breakpoints (Pixel 7 and
> Desktop Chrome). The dev server was stopped at the end of the run.
>
> **Zero live provider calls were made.** No Gemini call, no Google Places call — the standing hold
> holds. The consequence is stated per item where it limits what could be checked.
>
> **Concurrency caveat:** another agent was editing `src/app/map/_lib/get-spots.ts`,
> `src/components/sheet/place-sheet.tsx` and `src/domain/places/spot.ts` (collections work) while
> this ran. Line numbers below were re-read against the working tree at the end of the run and are
> current as of then; those three files may drift.

## Verdicts at a glance

| # | Backlog ref | Claim | Verdict |
|---|---|---|---|
| 1 | §0 P0 | `source_url` dead since `0017` | **CONFIRMED** |
| 2 | §2.1 | URL field not in a form, Enter does nothing | **CONFIRMED** |
| 3 | §2.3 | "Matching locations" never leaves `pending` | **CONFIRMED** |
| 4 | §2.5 | Cancel clears the pasted URL | **CONFIRMED** |
| 5 | §2.7 | Share-sheet junk paste is rejected | **CONFIRMED** |
| 6 | §3.1 | `NoPlacesScreen` unreachable | **CONFIRMED** (already documented in-file as deliberate) |
| 7 | §4.1 | `mapAccessibleName()` unused / canvas unnamed | **PARTIAL** — unused: yes. Canvas unnamed: **no** |
| 8 | §4.2 | Empty → `[0,0]` z0; one place → z15 | **PARTIAL** — `[0,0]` z0 confirmed; the one-place half is deliberate and its "blank tile" framing is wrong |
| 9 | §5.1 | No `created_at` in the select, no date on a row | **CONFIRMED** |
| 10 | §5.2 | Heading/search/filters not sticky in the scroll region | **REFUTED** — they are outside the scroller entirely, on both breakpoints |
| 11 | §5.6 | Names `truncate`d with no `dir="auto"` | **CONFIRMED**, and worse than stated: missing on **all** name surfaces, not three of four |
| 12 | §6.1 | Nothing writes `display_name` | **CONFIRMED** |
| 13 | §6.3 | `get-spots.ts` never selects `places.provider` | **REFUTED** — no such column; the real column *is* selected *and* rendered |
| 14 | §6.4 | Delete has no undo | **CONFIRMED** |
| 15 | §13.7 | `RemoveSavedPlace` autofocuses the destructive button | **CONFIRMED** (runtime) |
| 16 | §12.6/12.7 | No error/404 pages; `maximumScale: 1` app-wide | **CONFIRMED** (with one correction to §12.6's wording) |
| 17 | §8.3 | `filterPlausible` dedupes on `rawName` alone | **CONFIRMED** |
| 18 | §8.4 | `regionCode` gets a country name, so it is always null | **CONFIRMED** (measured on all 50 live candidates) |

---

## 1. §0 P0 — `saved_places.source_url` dead since `0017` — CONFIRMED

`pg_proc.prosrc` for the live `save_place` (4-arg) ends:

```
  if p_source_id is not null then
    insert into saved_place_sources (saved_place_id, user_id, source_id)
    values (v_id, v_uid, p_source_id)
    on conflict do nothing;
  end if;
  return v_id;
```

No `perform public.apply_saved_place_source_link(...)`. The call exists in
`supabase/migrations/0016_saved_place_denormalized_source_link.sql:132`; `0017` dropped the 3-arg
form and recreated the function without it
(`supabase/migrations/0017_saved_place_extracted_reason_writer.sql:42-83`). `0018` recreated only
the grants, so the omission survives.

The function itself is still present and callable:

```
select proname, pronargs from pg_proc
where proname in ('save_place','apply_saved_place_source_link');
 apply_saved_place_source_link | 2
 save_place                    | 4
```

`grep -rn "apply_saved_place_source_link" src/` → **zero matches**. Nothing in the app calls it.

Row counts, exactly as the backlog claims:

```
select date(created_at) d, count(*) total, count(source_url) with_url,
       count(*)-count(source_url) null_url
from saved_places group by 1 order by 1;

     d      | total | with_url | null_url
------------+-------+----------+----------
 2026-08-24 |     6 |        6 |        0
 2026-08-26 |    14 |        1 |       13
 2026-08-27 |     2 |        0 |        2
 2026-08-28 |     9 |        0 |        9
```

24 of 31 rows carry a dead column. It degrades invisibly because the sheet falls back to the joined
`sources.canonical_url` — I confirmed at runtime that an "Open TikTok" link still renders on a place
whose `source_url` is null.

The backfill is clean: all 24 are recoverable.

```
select count(*) filter (where sp.source_url is null) as null_rows,
       count(*) filter (where sp.source_url is null and s.canonical_url is not null) as recoverable
from saved_places sp
left join saved_place_sources sps on sps.saved_place_id = sp.id
left join sources s on s.id = sps.source_id;

 null_rows | recoverable
-----------+-------------
        24 |          24
```

**Smallest correct fix:** a new migration `0025` that `create or replace`s `save_place` with the
`perform public.apply_saved_place_source_link(v_id, p_source_id);` line restored inside the existing
`if p_source_id is not null` block, plus a one-statement backfill for the 24 existing rows.

---

## 2. §2.1 — Enter/Go does nothing — CONFIRMED

Static: `src/app/import/import-page-client.tsx:942` is a bare `<Input>` inside a plain
`<div className="flex flex-col gap-2">`. `grep -n "<form"` over the whole 2163-line file returns
**nothing**; `grep -n "onKeyDown"` returns nothing. The only submit path is the button's
`onClick={() => onSubmit()}` at line 1003.

Runtime (Pixel 7, signed in, `/import`):

```
[2] import input: {"inForm":false,"formsOnPage":0,"enterKeyHint":null,"autocapitalize":null,
                   "autocorrect":null,"spellcheck":null,"inputmode":"url","type":null}
[2] heading before Enter: "Add a TikTok" after Enter: "Add a TikTok" — import requests fired: 0
```

Enter was pressed on a filled field; the screen did not change and no request was issued. (The same
measurement also confirms §2.2 in passing: `enterKeyHint`, `autoCapitalize`, `autoCorrect` and
`spellCheck` are all absent.)

**Smallest correct fix:** wrap the field and the Add button in a form with
`onSubmit={e => { e.preventDefault(); void submit(); }}` and give the button `type="submit"`. Adding
`onKeyDown` instead would work but would not give the phone keyboard a Go key.

---

## 3. §2.3 — "Matching locations" never leaves `pending` — CONFIRMED

`RailState.resolve` is set to a value in exactly one place in the file:

- `src/app/import/import-page-client.tsx:168` — `resolve: 'pending'` inside `RAIL_IDLE`.

`grep -n "resolve: '"` returns only that line and the `STAGE_LABEL` entry at line 1020. All three
`setScreen({ kind: 'rail', ... })` calls (lines 393, 405, 421-431) spread `...RAIL_IDLE`, so
`resolve` is `'pending'` in every rail frame the user can ever see. `candidateProgress` is likewise
only ever `null` (line 171), so the `Matching locations… i of n` progress branch is dead too.

Two things make it worse than "a step that never runs":

- The rail's third circle renders as a grey dot with grey text for the entire wait, so the user is
  shown a step the product has decided not to do.
- The `extract: 'done'` frame at line 421 is followed immediately by
  `setScreen({ kind: 'caption_preview', ... })` in the same tick (line 430). React batches them, so
  the "N places found" frame **never paints at all**.

Not verified at runtime: driving the rail requires a real probe request and therefore a Gemini call,
which the standing hold forbids. The static evidence is total (there is no other assignment), but I
have not watched it on screen.

**Smallest correct fix:** see the ranking — the obvious fix here is the wrong one.

---

## 4. §2.5 — Cancel clears the pasted URL — CONFIRMED

`src/app/import/import-page-client.tsx:336`:

```ts
function reset() {
  abortInFlightProbe();
  setScreen({ kind: 'paste' });
  setUrl('');            // <- the URL the user pasted
  setTouched(false);
  setCaptionSave({ saving: false, error: null, partialNotice: null, statusByIndex: null });
}
```

`reset` is bound to the rail's Cancel button (`<RailScreen rail={screen.rail} onCancel={reset} />`,
line 840) and to `NoPlacesScreen`'s Retry and `ResultsScreen`'s Cancel.

Not verified at runtime, same reason as item 3 — reaching the rail costs a Gemini call.

**Smallest correct fix:** drop `setUrl('')` from `reset()` and clear the URL only on the
save-succeeded path (`finishCaptionPreview`'s `'proceed'` branch already calls `reset()` after
`backToMapWithFreshData`) — i.e. split `reset()` into a cancel-to-paste and a reset-after-save.

---

## 5. §2.7 — share-sheet junk paste is rejected — CONFIRMED

`canonicaliseTikTokUrl` (`src/domain/source/canonicalise-tiktok-url.ts:120-131`) does
`rawInput.trim()` then `new URL(trimmed)` and returns `MALFORMED_URL` on throw. There is no scan for
a URL inside surrounding text.

```
node -e "new URL('Check out this spot ... https://vm.tiktok.com/ZNdxyz123/')"
-> THROWS: ERR_INVALID_URL
```

Runtime, typing a caption-plus-link string into the real field:

```
[5] after blur: {"inlineInvalidShown":true,"addDisabled":false}
```

The inline "That doesn't look like a TikTok link." message renders. **Note the second half:** the
Add button is *not* disabled, so tapping it takes the user to the full-screen `MALFORMED_URL`
failure — a dead end, not just an inline warning.

**Smallest correct fix:** in the client's validation `useMemo` (line 281), extract the first
`https?://\S+` substring from the pasted string before canonicalising it. Client-side only — the
route re-canonicalises the already-clean URL, so the server contract is unchanged.

---

## 6. §3.1 — `NoPlacesScreen` is unreachable — CONFIRMED

- Kind declared: `src/app/import/import-page-client.tsx:186`
- Render branch: `src/app/import/import-page-client.tsx:843` (the backlog said 844)
- Component: `src/app/import/import-page-client.tsx:1151`
- `grep -n "kind: 'no_places'"` → **only the type declaration**. Nothing constructs it. The same is
  true of `results` / `ResultsScreen`.

This is **already documented as deliberate** in the file's own header, lines 15-18:

> The `no_places`/`results` `Screen` kinds and their `NoPlacesScreen`/`ResultsScreen` components
> predate this real wiring and are currently unreachable from this file (no code path sets them);
> they are kept as the shape `L0-F6-T1`'s real streaming route is expected to drive, rather than
> deleted ahead of that work.

The live zero-candidate path is `CaptionPreviewScreen`, which renders the kicker **"Review &
confirm"** above an H1 reading **"No places named"** (lines 1486-1494) — an instruction to review
nothing. The backlog's characterisation of the live screen is fair.

**Smallest correct fix is not small.** See the ranking.

---

## 7. §4.1 — `mapAccessibleName()` has zero production call sites — PARTIAL

**The unused-function half is CONFIRMED.** `grep -rn "mapAccessibleName" src/` returns exactly one
line — the definition at `src/ui/place/active-area.ts:431`. Its only other references are
`tests/unit/ui/active-area.test.ts:25,390,403`.

**The "the canvas has no accessible name" half is REFUTED.** Measured on the real `/map`:

```
[7] map canvas: {"canvasAria":"Map","canvasRole":"region","canvasLabelledby":null}
```

MapLibre sets this itself — `node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs:25859`:
`this._canvas.setAttribute("aria-label", this._getUIString("Map.Title"))`.

So the real defect is smaller and different from the one written down: the canvas has a **generic**
name ("Map") where we have a written, tested function that would produce "Map of your saved places
in London." — a name that changes with the active area.

**Smallest correct fix:** pass `mapAccessibleName(heading, area)` from `map-page-client.tsx` into
`MapSurfaceProps` and set it on `map.getCanvas()` in an effect keyed on it. Not a one-liner: the
string lives in the sheet's heading state and the canvas is two component layers down, so it needs
a new field on the port.

---

## 8. §4.2 — empty library `[0,0]` z0; one place at maxZoom 15 — PARTIAL

**Empty half: CONFIRMED.** `boundsFor` returns `null` for an empty `places` array with no hint
(`src/components/map/map-surface.mapcn.tsx:89`), the initial-fit effect returns early on
`if (!instance || !bounds) return;` (line 471), and `MapcnMap` is rendered with **no `center` and no
`zoom`** — only `ref`, `className`, `styles`, `attributionControl`. MapLibre's own defaults then
apply: `center: [0, 0], zoom: 0` (`node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs:22904,22906`).
That is the Gulf of Guinea at world zoom, behind the empty-library sheet. Note
`src/components/map/map-surface.live.tsx:82` has a sensible `center: [0, 20], zoom: 1` fallback —
but that file is explicitly not wired in (`map-surface.tsx` exports the mapcn one).

I could **not** verify this at runtime: the local library has 31 places and emptying it would mean
destructive SQL, which the guardrails forbid.

**One-place half: mechanically accurate, but the framing is wrong.** `boundsFor` does return a
zero-area box, and `FIT_BOUNDS_MAX_ZOOM = 15` (line 122) does clamp it. But that ceiling is
deliberate and documented in the line above it ("A ceiling stops a single-place import (a zero-area
bounding box) from zooming in absurdly tight"), and z15 on CARTO Positron is a fully tiled
neighbourhood view, not "a blank tile". This half is a taste question about how much context a lone
pin deserves, not a defect.

**Smallest correct fix (empty half only):** give `MapcnMap` an explicit `center`/`zoom` fallback —
a country-level view, or simply the `[0, 20] / zoom 1` the dead `live` file already uses.

---

## 9. §5.1 — `created_at` absent from the select, no date on a row — CONFIRMED

`grep -n "created_at" src/app/map/_lib/get-spots.ts`:

```
212:/** The current user's saved places, per `saved_places.created_at desc` ...
219:    .order('created_at', { ascending: false });
```

Two hits, both in the ordering — none inside `SAVED_PLACES_SELECT` (which begins at line 31). The
column is therefore never read into `SavedPlaceRow`, never reaches `EnrichedSpot`, and cannot be
rendered. `grep -rn "toLocaleDateString|Intl.DateTimeFormat|formatDate"` across
`src/components/sheet/`, `src/components/place/` and `src/ui/place/` returns **nothing**. Confirmed
at runtime: a real row's DOM is name + `Category · Locality` + tags, with no date.

**Smallest correct fix:** add `created_at` to `SAVED_PLACES_SELECT` and to `SavedPlaceRow`, map it
onto `Spot`, and render a relative date on the row. Two lines of plumbing; the rendering is a design
decision.

---

## 10. §5.2 — heading/search/filters not sticky in the scroll region — REFUTED

They are not *sticky* — they are **outside the scroll region entirely**, which is strictly better.

Structure: `src/components/sheet/place-sheet.tsx:298` opens
`<div className="flex min-h-0 flex-1 flex-col gap-3.5 px-5 pt-3.5">`. The heading (line 351),
`PlaceSearchField` (360), `NotBeenFilterChip` (367) and `ActiveTagFilter` (369) are **siblings** of
the scroller, which is the `min-h-0 flex-1 overflow-y-auto` div at line 383 wrapping only the
`<ul>`. `src/components/sheet/place-desktop-panel.tsx` has the identical arrangement (controls in a
header block; scroller at line 129).

Measured at both breakpoints against 19 real rows:

```
[10 desktop] before: scroller="mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-6"
             searchInsideScroller=false  headingInsideScroller=false
             scrollHeight=1680  clientHeight=464  searchTop=140  headingTop=28
[10 desktop] after scrolling to the bottom (scrollTop=1216):
             searchTop=140 (unchanged)  searchVisible=true  headingVisible=true
             notBeenChipVisible=true

[10 mobile]  before: scroller="min-h-0 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]"
             scrollHeight=1672  clientHeight=655  searchTop=72  headingTop=30
[10 mobile]  after scrolling to the bottom (scrollTop=1017):
             searchTop=72 (unchanged)  searchVisible=true  headingVisible=true
             notBeenChipVisible=true
```

The claim "at 40 rows the way out of a filter is 40 rows up" is false. **Do not spend a night on
this.**

The *neighbouring* claim §5.3 — that at the `peek` stop the search field and both filters are off
screen — is a different thing and I did not test it; it is about the sheet's collapsed stop, not
about scrolling.

---

## 11. §5.6 — names `truncate`d with no `dir="auto"` — CONFIRMED, and broader than stated

The backlog says "three of four surfaces" (§13 inconsistency 7). It is **all** of them. `dir="auto"`
appears 15 times in `src/` and **not once on a place name**:

| Surface | `file:line` | `truncate` | `dir="auto"` |
|---|---|---|---|
| List row name | `src/components/sheet/place-sheet.tsx:452` | yes | **missing** |
| Detail / popover heading (`<h2>`) | `src/components/sheet/place-sheet.tsx:~767` | no (wraps) | **missing** |
| Review card `rawName` | `src/app/import/import-page-client.tsx:1283` | yes | **missing** |
| Review card title | `src/app/import/import-page-client.tsx:1769` | yes | **missing** |
| Ambiguity-picker option name | `src/app/import/import-page-client.tsx:1907` | yes | **missing** |
| Post-import confirmation | `src/components/map/import-confirmation.tsx:79` | yes | **missing** |

Where `dir="auto"` **is** present, it is always on something other than the name: the row's second
line (`place-sheet.tsx:463`), the detail's second line (`:775`), the `why_go` paragraph (`:811`),
the `extracted_reason` blockquote (`:827`), and every tag/dish chip
(`src/components/sheet/place-enrichment.tsx:149, 154, 199, 228, 282, 305`).

Runtime confirmation on a real row and a real detail view:

```
[11] firstRowName: {"text":"Kiaans","dirAttr":null,"computedDir":"ltr",
                    "cls":"truncate font-heading text-sm font-bold text-foreground"}
[11 desktop] detail heading: [{"t":"Kiaans","dir":null,...},{"t":"Kiaans","dir":null,...}]
```

The mechanism the backlog describes is right: with `direction: ltr` inherited, an RTL string's
logical end is the visual left, so `text-overflow: ellipsis` clips the **start** of a Hebrew name.
The library currently holds one Hebrew place name (5 characters) so nothing clips today — this is a
latent defect against the he/en scope, not a visible one.

**Smallest correct fix:** add `dir="auto"` to the six elements above. Genuinely a six-line change.

---

## 12. §6.1 — nothing writes `saved_places.display_name` — CONFIRMED

- Granted: `select privilege_type, column_name from information_schema.column_privileges where
  table_name='saved_places' and grantee='authenticated' and privilege_type='UPDATE'` →
  `category_override, display_name, note, visit_state, visited_at`. `display_name` is writable.
- Selected: `src/app/map/_lib/get-spots.ts:37` (inside `SAVED_PLACES_SELECT`).
- Rendered: `src/app/map/_lib/get-spots.ts:178` — `name: row.display_name ?? place?.name ?? row.id`.
- Written: **nothing**. `src/app/actions/saved-places.ts` exports four mutations —
  `deleteSavedPlace` (:77), `updateSavedPlaceNote` (:107, writes `note`),
  `updateSavedPlaceCategory` (:165, writes `category_override`), `setSavedPlaceVisited` (:221,
  writes `visit_state`/`visited_at`). No `display_name` writer exists anywhere in `src/`.
- Data: `select count(*), count(display_name) from saved_places` → `31 | 0`.

**Smallest correct fix:** a fifth server action modelled byte-for-byte on `updateSavedPlaceNote`,
plus an inline edit affordance on the detail heading. Zero migrations, as claimed.

---

## 13. §6.3 — `get-spots.ts` never selects `places.provider` — REFUTED

**There is no `provider` column on `places`.** Full column list from `\d places`: `id, name,
name_key, category, provider_category, address_line, locality, region, country_code, lat, lng,
provider_payload, provider_fetched_at, merged_into_place_id, created_at, updated_at,
source_dataset, source_dataset_id, resolution_score, last_verified_at`. `provider` exists on
`place_provider_refs`, a different table.

**The real column is `source_dataset`, and `get-spots.ts` does select it** — line 52 inside
`SAVED_PLACES_SELECT`, read at line 155 (`provenanceFor`) and attached to every spot as
`provenance.sourceDataset`.

**And the UI does say it.** `src/components/sheet/place-sheet.tsx:930` renders
`Matched via {provenance.sourceDataset}`. Measured on the real detail view of a saved place:

```
[13] provenance text on the open detail: ["Matched via llm-guess","Matched via llm-guess"]
```

Distribution of the 31 places (every place row is saved, so the two queries agree):

```
select source_dataset, count(*) from places group by 1 order by 2 desc;
 llm-guess       | 21
 (null)          |  5
 overture-places |  4
 google-places   |  1
```

**21 of 31 saved places are `llm-guess`** — the underlying product problem is real and large. What
is wrong is the diagnosis. The honest restatement:

- The **map pin** carries no provenance — `grep -rn "sourceDataset" src/components/map/` is empty,
  so a guess and a Google identity paint the same teardrop.
- The **list row** carries none either.
- The **detail sheet** does, but as `Matched via llm-guess` in 11px `text-muted-foreground/70` — an
  internal dataset slug at the contrast §13.9 already flags as below the bar. It never says
  "approximate".
- The 5 rows with `source_dataset IS NULL` get `provenanceFor` returning `undefined`, so they say
  nothing at all.

**Smallest correct fix:** map `sourceDataset` to human copy once (`llm-guess` → "Approximate — from
the caption") and render it in the same slot; separately pass a boolean down to the marker layer for
a hollow/dashed pin. Two changes, not one, and the second touches the map port.

---

## 14. §6.4 — delete has no undo — CONFIRMED

`src/app/actions/saved-places.ts:85-86`:

```ts
    .from('saved_places')
    .delete({ count: 'exact' })
```

A hard `DELETE`. `\d saved_places` has **no `deleted_at` column** — full list: `id, user_id,
place_id, display_name, category_override, note, visit_state, visited_at, origin, created_at,
updated_at, extracted_reason, source_url, source_thumbnail_url, tags, why_go, dishes`.
`grep -rni "undo" src/` returns only prose in comments — no Undo control anywhere.

Confirmed at runtime that the flow is two taps from an open detail: "Remove from your places" →
"Remove", with no toast and no recovery.

**Smallest correct fix is a migration**, not a UI change — see the ranking. A UI-only stopgap (hold
the deleted row in client state and re-insert on Undo) will not work: `save_place` recomputes
`origin` and treats `extracted_reason` as INSERT-only, so an "undo" would silently drop the
extracted reason and re-derive the source link.

---

## 15. §13.7 — `RemoveSavedPlace` autofocuses the destructive button — CONFIRMED

`src/components/sheet/saved-place-edits.tsx:533` — `autoFocus` on the `variant="destructive"`
Remove button, with Cancel as an unfocused sibling.

Runtime, after opening the confirm on a real saved place:

```
[15] activeElement after opening the confirm:
     {"tag":"BUTTON","text":"Remove","cls":"group/button inline-flex shrink-0 ..."}
```

A keyboard or switch user who presses Space/Enter on arrival deletes the place.

**Smallest correct fix:** move `autoFocus` to the Cancel button. One line, and it is the single
highest safety-per-character change on this list.

---

## 16. §12.6 / §12.7 — no error pages; `maximumScale: 1` — CONFIRMED (one wording correction)

```
find src -name "error.tsx" -o -name "global-error.tsx" -o -name "not-found.tsx" -o -name "loading.tsx"
-> (no output)
```

None of the four exist anywhere in `src/`.

`src/app/layout.tsx:17-22`:

```ts
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FAF9F6',
};
```

Served on every page — measured on the real HTML of both `/sign-in` and the 404:

```
[16] viewport meta: width=device-width, initial-scale=1, maximum-scale=1
```

That is WCAG 1.4.4 (Resize Text) and it is one line.

**Correction to §12.6's wording.** It claims "bare `text/plain`". An unknown route measured today
returns Next's own built-in 404 page:

```
[16] /definitely-not-a-route status: 404  content-type: text/html; charset=utf-8
```

So the missing-file fact is confirmed; the "bare text/plain" consequence was measured against the
broken production deployment, not against a working app, and should not be quoted as current
behaviour. `error.tsx`'s absence is still real and still means an uncaught render error shows the
unstyled Next error overlay in dev and a blank page in production.

**Smallest correct fix:** delete `maximumScale: 1` (one line), then add `not-found.tsx`,
`error.tsx` and `global-error.tsx` as three small files.

---

## 17. §8.3 — `filterPlausible` dedupes on `rawName` alone — CONFIRMED

`src/domain/extraction/plausibility.ts:285`:

```ts
    const key = normaliseForComparison(candidate.rawName);
    if (seen.has(key)) {
      dropped.duplicate += 1;
      continue;
    }
    seen.add(key);
```

`addressHint`, `cityHint` and `countryHint` are all in scope on `candidate` (they are used twelve
lines above, at :273) and none is in the key. A caption naming two branches of one chain yields one
candidate; the second is counted as `duplicate` and silently dropped.

The live corpus does not currently contain a two-branch caption, and the `dropped` counters are not
persisted, so I could not demonstrate the drop against real data. Confirmed by reading, not by
reproduction.

**Smallest correct fix:** include `addressHint` (and probably `cityHint`) in the key. Genuinely one
line — but see the ranking for why it is not a one-line *task*.

---

## 18. §8.4 — `regionCode` is always null — CONFIRMED

Three facts, all measured.

**The code requires a 2-letter code.** `src/integrations/google/place-resolver.ts:449-452`:

```ts
      const country = query.countryHint?.trim().toUpperCase();
      const params: GoogleTextSearchParams = {
        textQuery: buildTextQuery(query),
        regionCode: country !== undefined && country.length === 2 ? country : null,
```

**Nothing normalises it on the way in.** `src/domain/import/pipeline.ts:93` —
`countryHint: candidate.countryHint,` — passes the extractor's raw string straight through. The two
existing `toCountryCode` call sites (`src/domain/import/candidate-place.ts:200`,
`src/domain/places/region-hint.ts:259`) are both on the *scoring/save* path, not the retrieval path.

**Every live candidate carries a name.** Across all 50 extracted candidates in the local database:

```
select coalesce(c->>'countryHint','(null)') h, count(*),
       sum(case when length(c->>'countryHint')=2 then 1 else 0 end) two_char
from extractions, lateral jsonb_array_elements(candidates) c group by 1 order by 2 desc;

 United Kingdom |24|0
 (Hebrew name)  |13|0
 Czech Republic | 9|0
 Israel         | 4|0
```

**0 of 50** are two characters. `regionCode` has been null on every import this database has ever
seen.

And the fix would work. Running the four live values through the existing `toCountryCode` gives
`CZ`, `IL`, `GB`, `IL` — 100% coverage on live data, Hebrew included. (Measured with a throwaway
vitest file, since removed; the tree is clean.)

**Smallest correct fix:** normalise inside the Google adapter at `place-resolver.ts:452` with
`toCountryCode(query.countryHint)`, so the change cannot alter what the scorer sees.

---

## Ranking — what to actually do tonight

### Tier A — genuinely one or two lines, do them all

| Order | Item | The change | Why first |
|---|---|---|---|
| 1 | **15** (§13.7) | Move `autoFocus` from Remove to Cancel — `saved-place-edits.tsx:533` | One word moved. Removes the only way to destroy data by pressing Space on arrival. |
| 2 | **16b** (§12.7) | Delete `maximumScale: 1` — `layout.tsx:20` | One line. A WCAG failure on every page. |
| 3 | **18** (§8.4) | `toCountryCode` on the resolver's country hint | One line, the helper exists, measured to work on 100% of live values, and it improves every Google lookup at zero quota cost. |
| 4 | **11** (§5.6) | Six `dir="auto"` attributes | Six lines, no logic, no test churn. |

### Tier B — small, but bigger than the backlog says

| Item | Backlog E | Real size | Why |
|---|---|---|---|
| **1** (§0 P0) | implied trivial | **S–M** | The code change is one line, but it restores a call to a `SECURITY DEFINER` function inside `save_place`, so it goes through `security-privacy` under guardrails §5.20, and `supabase/tests/inventory.sql` check 6 has caught regressions in this exact function twice. It then needs pushing to staging and production, both under a standing hold. Budget the review, not the line. The backfill itself is clean — all 24 rows are recoverable. |
| **2** (§2.1) | E-S | **S, correctly** | Wrapping in a `<form>` is real work: `submit`'s defaulted first parameter is a documented footgun (line 353) and `onSubmit={submit}` would pass a `SubmitEvent` as the URL with no type error. Do it as an arrow with `preventDefault`, and add `enterKeyHint`/`autoCapitalize`/`autoCorrect`/`spellCheck` in the same commit — §2.2 is free once you are in the file. |
| **17** (§8.3) | "One line" | **S–M** | The line is one line. But it changes what the extractor emits, so the golden fixtures, the plausibility unit tests and every recorded corpus number move with it — and §8.26 (F1 auto-accept) is explicitly gated on this landing correctly. It also needs a decision the backlog does not state: **when both candidates have a null `addressHint`, do they still collapse?** If yes you have not fixed the branch case; if no you have re-admitted every duplicate the rule exists to drop. Decide that before writing the line. |
| **5** (§2.7) | E-S | **S** | Extracting the first URL from pasted text is a regex, but write the failure cases first: `"see https://tiktok.com and https://instagram.com/x"` must not silently pick the wrong one, and `"https://evil.io?u=https://tiktok.com/@a/video/1"` must not be laundered into an accepted link. Safe *if* it is a plain first-match, not a "find the TikTok one" search — the canonicaliser's SSRF gates (userinfo, port, IP literal, host allow-list) still run afterwards. |
| **9** (§5.1) | E-S | **S** | Two lines of plumbing plus an unmade design decision — the product states no ordering anywhere (§13 inconsistency 3). A date on a row without an ordering story is just a number. |
| **16a** (§12.6) | E-S | **S** | Three small files. Correct as estimated — just fix the "bare text/plain" wording. |

### Tier C — secretly much larger than the E-estimate

| Item | Backlog E | Real size | Why |
|---|---|---|---|
| **3** (§2.3) | **E-S** | **M, and the obvious fix is wrong** | You cannot honestly mark `resolve` done from the client: `/api/imports/probe` is one request/response with no boundary between extraction and resolution (the route's own header says so). Faking a third stage on a timer is exactly the "convert uncertainty into certainty" the working agreement forbids. The correct fix is `L0-F6`'s streaming route, which does emit per-candidate progress — the rail was built for it. The honest *small* fix is the opposite of what §2.3 proposes: **delete the third stage** until the route can drive it. |
| **6** (§3.1) | E-M | **M–L** | Not a wiring bug — the file header holds these screens deliberately for the streaming route. Making `no_places` reachable is ~5 lines; making it *worth reaching* is §3.2 (manual add), a new feature blocked on the Google quota. Wiring the screen without a forward path ships a prettier dead end. Ship it only together with §14.1's "what's it called?" field, which the owner has already ruled in. |
| **14** (§6.4) | E-S (in §15) / E-M (in §6.4) | **M, migration-gated** | §7.3 already names the trap and §15's E-S contradicts it. Soft delete needs `deleted_at`, the UPDATE grant, **and** replacing the `(user_id, place_id)` unique with a partial index `where deleted_at is null` — otherwise a soft-deleted row permanently blocks re-saving that place. Plus a predicate on every read path, plus an RLS review. Not an evening. |
| **12** (§6.1) | E-M | **M — estimate is right** | Everything except the writer exists. The action is a copy of `updateSavedPlaceNote`; the real work is inline-edit UX on a heading that is also the 288px desktop popover heading (§6.14). |
| **7** (§4.1) | E-S, **V-high** | **S–M, V-medium** | Not "call the function": it needs a new field on `MapSurfaceProps` and an effect on the canvas. And since MapLibre already supplies "Map", the user-visible gain is a better name rather than a missing one. Downgrade the value, not just the size. |
| **8** (§4.2) | E-S | **S for the half that is real** | Only the empty-library `[0,0]` half is a defect, and it is a `center`/`zoom` prop. The one-place half is deliberate and documented. Halve the scope. |
| **13** (§6.3) | E-S | **M, and the ticket needs rewriting first** | The premise is wrong — no `provider` column, and `source_dataset` is already selected *and* already rendered. The real work is human copy plus a marker-style change across two surfaces, one of which is the map port. Rewrite before estimating. |

### Do not spend time on

- **10** (§5.2) — **refuted at both breakpoints.** The controls sit outside the scroll region and do
  not move through a 1216px scroll. Delete the item.
- **13** (§6.3) **as written** — the column it names does not exist and the fact it says is hidden is
  on screen. Rewrite, do not implement.
- **8**'s one-place half — deliberate, documented, and z15 is not a blank tile.
- **7**'s "the canvas has no accessible name" — it has one.

---

## What I could not verify

- **Items 3 and 4 have no runtime evidence.** Reaching the rail requires a real probe request and
  therefore a Gemini call, which the standing hold forbids. Both are confirmed by exhaustive reading
  (there is no other assignment to `RailState.resolve`; `reset()` unconditionally calls
  `setUrl('')`), but I did not watch either on screen.
- **Item 8's empty-library case** could not be reproduced: emptying the 31-row library needs
  destructive SQL. The verdict rests on `boundsFor` returning `null`, the early return in the fit
  effect, the absent `center`/`zoom` props, and MapLibre's documented defaults.
- **Item 17's dropped-branch case** has no live example — the corpus contains no two-branch caption
  and the `dropped` counters are not persisted. Confirmed by reading only.
- **Item 11's clipping** is latent, not demonstrated: the only Hebrew place name in the library is
  5 characters and does not overflow.
- **Item 10 on the mobile sheet at the `peek` stop** was not tested — only the `half`/`full` scroll
  behaviour was.
- Nothing was checked against **staging or production**, per the guardrails.
