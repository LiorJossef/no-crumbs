# Handoff — the create sheet, the list scope, and the collection map fix

Session of **2026-08-29**, on `feat/country-band-map-layer`. Ended early at the owner's request
(session budget), with work deliberately left unwired rather than half-wired.

## 1. What is DONE and verified

**`fix(map)` `028d77f` — the collection map no longer goes blank.** The P0 the owner reported.
`place-marker-layer.tsx` applied `minzoom: PIN_BAND_MIN` (8.5) to every `MapSurface`, while the
summary bands that replace those pins are mounted only by `/map`. `/collections/[id]` therefore
lost its pins below 8.5 and got nothing back. The floor is now `replacedBelowZoom`, **required and
undefaulted** — a surface may only hide its pins if it can name what the user sees instead.

**`fix(map)` `028d77f` also — the camera reports its band.** `ViewportChangeMeta` now carries
`zoom` and `band`, derived by a new `bandForZoom` in `zoom-bands.ts`. It rides the existing
coalesced `moveend` reporter; no new listener. `band` is independent of `userInitiated` on purpose.

**`refactor(collections)` `04950b2`** — `useCreateCollection` is now the one caller of the
`createCollection` action, because the `＋` menu gives that gesture a second entry point.

**`feat(sheet)` `3fdb8c2`** — `ElsewhereSection` takes `title` and `variant`, so the same grouped
country/city renderer can be the list's whole body and not only its "Elsewhere" footer.

Verified: `tsc` clean, `eslint` clean (2 pre-existing `<img>` warnings), layer guard passes,
**1584/1584 unit tests pass**. The collection map fix was NOT verified in a browser — see §4.

## 2. What is COMMITTED BUT UNWIRED — `0ce9512`

Real, complete-looking code that **nothing renders or calls**, with **no unit tests**. `npm run
verify` passes because it is unreachable, not because it works. Do not mistake green for done.

- `src/components/add/` — the unified create sheet: one vaul drawer, three panes
  (`menu` → `place` | `collection`). `universal-input.ts` classifies TikTok-URL vs free text and
  digs a link out of share-sheet junk. **No Instagram, no YouTube** — owner's instruction.
- `src/ui/place/list-scope.ts` — `global` | `country` | `area`, with `scopeAfterCameraSettled`
  keeping the `userInitiated` guard and switching on the discrete zoom band, never the rectangle.

## 3. Owner rulings from this session — record these before planning

1. **The `＋` is a global create trigger.** It opens the same two-option menu (Add a place /
   Create a collection) on every tab. This **honours** the 2026-08-29 ruling in `bottom-nav.tsx`
   that the `＋` must mean one thing everywhere; it does not reverse it.
2. **A country tap now moves the list.** This **REVERSES** camera mover 5 in
   `map-page-client.tsx`, whose comment currently argues that framing a country must change nothing
   else. Rewrite that comment when wiring; do not leave the repo arguing with itself.
3. **Manual add is in scope**, promoted out of backlog §3.2 / `L1-F7-T1`.
4. **No Instagram or YouTube links for now.** TikTok only, unchanged from the MVP boundary.
5. **No refilter on small pans** — reaffirms the existing `active-area.ts` model. The list may
   change when the *clusters* change or on an explicit cluster tap, and at no other time.
6. **No Profile tab was added.** The owner named one; it does not exist and `bottom-nav.tsx`
   refuses an empty tab. Flagged to the owner, not built. Still open if they want it.

## 4. What is OWED, in the order I would take it

1. **Unit tests for both unwired modules.** They were never written; the agents were stopped first.
2. **Verify the collection map fix in a browser.** Diagnosis and fix are sound and the unit test
   pins the rule, but nobody has actually zoomed out on `/collections/[id]` since. The handoff that
   diagnosed it also said: check `/collections/join/[token]` for the same shape.
3. **The manual-add server routes.** Not started. The data path is fully settled — see §5.
4. **Wire it all**: `map-page-client.tsx`, `bottom-nav.tsx`, `place-sheet.tsx`,
   `place-desktop-panel.tsx`.
5. **Use the product.** Nothing in §2 has been near a browser.

## 5. Manual add needs NO migration — proved, not reasoned

Verified against the local container this session by `supabase-database`, including a probe as a
user with **zero `imports` rows**, with `SET CONSTRAINTS ALL IMMEDIATE` to force the deferred
provenance trigger. Row landed `origin='manual'`, null source, nothing orphaned.

**The blocker everyone assumed exists does not.** `src/app/api/imports/probe/route.ts:534` claims
`save_place`'s own RLS boundary requires a matching `imports` row. That is wrong: `sps_insert_own`
(`0006:135`) is a policy on **`saved_place_sources`**, which `save_place` only touches inside
`if p_source_id is not null`. **Correct that comment** — it is the reason manual add looked blocked.

Call sequence: `resolve_place` (15 args, service-role only) → optional RLS-scoped duplicate check on
the *user's* client → `save_place(p_place_id, p_source_id: null, p_note, p_extracted_reason: null)`
on the user's session. Do **not** call `apply_saved_place_extraction`: there is no caption, and
inventing tags would be the "convert uncertainty into certainty" failure.

**Quota constraint that must shape the UI:** Google Places is 100 lookups/day. Manual-add search
must fire on **explicit submit only** — never per keystroke. Free-text typing searches the local
library, which is free.

## 5b. The collections session, later the same day

The owner used `/collections/[id]` and reported three things. Two were real, one was already fixed.

**Real, fixed — `b83d154`: tapping a place never moved the camera.** `/map` has always flown on this
gesture (`selectPlace`, camera mover 3, writing `focusPlaceIds`); `collection-client.tsx`'s
`selectItem` set only the selection. Since `initialBounds` fits *all* of a collection's places by
design, a collection spanning countries opens at macro zoom — so the tap appeared to do nothing.
`focusPlaceIds` now has two writers sharing one slot, `/map`'s design. **`571bb32`** fixes a
ref-during-render that this introduced and eslint caught.

**Already fixed — the "isolated pin at macro zoom".** Not a separate defect: it is §1's pin-band
floor, fixed in `028d77f` earlier the same day. The collection route passes no `summaries`, so it
takes the `null` branch and keeps every pin at every zoom. `places={pins}` has always passed the
whole collection; nothing was ever hiding all but the selection.

**Real, fixed — `118bf8f`: the place card was about its note.** Not blank, as reported, but an empty
bordered textarea sat under the address and above every action, making the note the visual centre.
Identity and actions now lead; the note is a muted card beneath them that collapses to
`Add a shared note` when empty.

**Refused, twice, and it is a privacy boundary rather than an omission.** The owner asked for a
"source reference" and "action toggles" on a collection place. A collection item points at a
`places` row and never at the adder's `saved_places` row — a collaborator gets the shared identity
and none of the adder's overlay. A source link there leaks it to everyone in the collection. An
honest version exists (show *your own* source link and visit state when you have saved the place
yourself) and needs new plumbing; it is the owner's call and is not built.

**In flight at session close:** reusing `PlaceDetail` itself on the collection route, with the
shared note injected as a footer slot (the owner's architecture ruling). **The hazard whoever picks
this up must not miss:** `PlaceDetail` passes `place.id` into six mutation paths as `savedPlaceId`
(place-sheet.tsx 904, 1017, 1027, 1034, 1043, 1111), and on this route `place.id` is the
**collection item id**. Naive reuse aims five write paths at a row that is not the caller's. The
privacy half is easier and better: `PlaceDetail` reads private fields off `place.detail` and every
block renders conditionally, so passing a `detail` built from shared fields only makes the boundary
a property of the data rather than of a flag.

**Nothing on this route has been verified in a browser.** Typecheck, lint and 1584 unit tests pass;
no one has watched the camera fly. I could not sign in — entering a password is something I do not
do, including for the local demo account — and the owner was asked to sign in on the open pane.

## 6. Agents used

`supabase-database` (investigation only — the §5 answer, no code). `maps-geospatial` (wrote the §1
map port work). `design-system-frontend` and `nextjs-architect` ×2 (wrote the §2 modules and started
the manual-add routes). All four were stopped mid-flight for budget; **none reported a verified
result**, so everything above was re-verified by me rather than taken on their word. Nothing is left
running.
