# Handoff — "a place is one object", 2026-08-30

Branch `feat/canonical-place-detail-in-collections`, [PR #102](https://github.com/LiorJossef/P-002/pull/102),
**open and unmerged**. Five commits. Rulings in
[`product-ruling-one-place-one-object.md`](product-ruling-one-place-one-object.md).

## What shipped on this branch

R1 only: a place you saved yourself now renders the canonical `PlaceDetail` inside a collection —
your note, been-here, category, tags, TikTok, certainty, saved-on, `In <collection>` — alongside the
collection's own shared note and `Remove from this collection`. No migration; the route already
loaded everything needed and simply stopped threading it through.

**Verified by driving the app**, not from tests: the note editor's target id resolves to a
`saved_places` row and matches nothing in `collection_items` or `places`; a note written from the
collection route landed in `saved_places.note` while `collection_items.note` stayed null.
Independent QA additionally constructed a second user by SQL and confirmed the not-mine branch leaks
nothing — eight private markers absent from the full RSC payload, not just the visible text.

**One bug was found by that QA pass and fixed here:** `name` and `category` still came from
`CollectionPlace` while `detail` came from the viewer's own `Spot`. A renamed or re-categorised place
showed the old value in a collection and the new one on the map, and — because `detail` supplies
`categoryIsOverridden` — the screen printed a derived category as though it were the user's own
choice and ticked the wrong chip.

## The three tasks left, in order

### 1. Remove per-user rename (`refactor/remove-per-user-rename`)

R3. Delete `RenameTrigger`/`NameEditor` (`saved-place-edits.tsx:356-473`), the `renaming` state and
its ternary (`place-sheet.tsx:1112`, `:1165-1189`), the single writer `updateSavedPlaceName`
(`saved-places.ts:150`), and `Spot.displayNameOverride`/`canonicalName`. `get-spots.ts:186` stops
falling back: `row.display_name ?? place?.name` becomes `place?.name`.

Then the migration that makes it real: revoke `display_name` from the update grant (`0006:117`,
re-granted `0008:76`) and the insert grant (`0015:57`). Keep the column — dropping is irreversible
and buys nothing. **`supabase/tests/inventory.sql:498,516` assert those grants and must move in the
same commit** or the inventory check fails.

Two traps: `validateDisplayName` and `DISPLAY_NAME_MAX_LENGTH` **cannot** be deleted — manual add
uses them (`manual-add-choice.ts:30`); only `isDisplayNameUnchanged` becomes dead. And there is no
unit test of the rename action and no e2e spec touching it, so the net is thinner than the file
count suggests.

Amend A3 in `product-specification.md:307` to drop "renamed"; the CRUD surface stands on category
override, note, visit state, delete and manual add.

Cost is zero: production held **0 renames across 7 saved places**, local 0 across 30, counted
2026-08-30.

**Fold in the two-removals fix here** — same file. `docs/ux-two-removals-one-screen.md` is the spec.
The `footer` slot moves above `RemoveSavedPlace` inside `PlaceDetail`; the unlink becomes the second
row of the shared-note card, loses its red-at-rest, and reads `Take out of this collection`;
≥32 px between hit areas. Two pre-existing bugs to fix while there: `RemoveSavedPlace` has no
`data-vaul-no-drag` (a press can be eaten as a sheet drag) and its trigger misses the 44 px floor.
**Owner has NOT approved** renaming `Remove from your places` → `Delete from your places`; that
changes copy on `/map` and reverses a written argument. Leave it.

### 2. Share the place's facts with every member (`feat/shared-place-facts-in-collections`)

R2. A `SECURITY DEFINER` function keyed on the collection, joined through `collection_items.added_by`,
returning a fixed column list: tags, why-go, dishes, caption quote, plus source URL, thumbnail,
canonical URL and author handle.

**Not an RLS policy on `saved_places`.** That table carries a table-wide `SELECT` grant
(`0006:113`), so a row-level policy exposes every column — the private note and visit state
included. Measured, not assumed: the columns came back. And the natural predicate (match on
`place_id`) leaks the overlay of users in no collection at all. Sketch, attack results and the
guardrail-18 review are in the security findings; re-run the attacks against the shipped function,
not the sketch.

Been-here, visited-at and the private note do not cross. `SharedOnlyPlaceFacts` must become a
**split** type — group (a) allowed, group (b) still `never` — not be deleted.

**Ship the share-panel copy in the same commit.** `share-panel.tsx:51` promises members won't see
"your tags, or the links you saved places from"; that becomes false. Narrow
`collection-place-detail.test.ts:121` and `share-panel.test.ts:128` in the same commit — never skip.

A from-zero `db:reset` is this migration's real acceptance test and would destroy local data. Use a
throwaway Postgres, or get an explicit go-ahead first.

### 3. Collections as a scope on the map shell (`refactor/collections-as-map-scope`)

R4, spec in [`ux-collections-as-scope.md`](../ux-collections-as-scope.md). Keep both URLs, delete both
layouts. Layer 0 is the shell with no back control; layer 1 is one pushed pane with one back arrow;
a pane may not push a pane. Scope stated in the sheet header, not a floating chip —
`FLOATING_TOP_CHROME_PX = 0` is load-bearing. R46: the shell unification is **not** deferred.

Close first: `map-surface.mapcn.tsx:1191` builds `savedPlace` from `MapPlace.id`, which is a
**collection item** id on the collection route. Harmless only because that route never passes
`selected` to the surface — merging the surfaces walks straight into it.

Already-known R4 violation to fix here: opening `Add to a collection` renders `Back to the place`
inside the detail while the host's `Back to the collection` is still in the header — two back arrows,
which R4 forbids. On `/map` the host affordance is an `×`, so the pair does not collide there.

`PEEK_PX` must not change value; it mirrors a CARTO/OSM attribution condition.

## Environment notes

**CI is not running — GitHub Actions minutes are exhausted.** The owner authorised merging without
it (2026-08-30). `scripts/merge-pr.sh` has no bypass by design, so this means
`gh pr merge <n> --squash --admin`. Run CI's jobs locally in its place:
`npm run verify && npm run build && npm run test:e2e`, with `E2E_PASSWORD=local-dev-preview-1234`
for the signed-in tier (without it 30 of 36 specs skip).

Two pre-existing local failures that are **not** yours:

- `check:schema` — the local database carries `rate_limit_events` from abandoned PR #72, so 16
  relations where the inventory expects 15 (`history-2026-08.md:303`).
- Six e2e import specs need TikTok oEmbed and the model; they fail identically on `main`.

Also found: Playwright's default `baseURL` of `127.0.0.1:3000` gets a 403 on the sign-in server
action (works on `localhost:3000`) — an origin check, no `serverActions.allowedOrigins` in
`next.config.ts`. Unrelated to this work, but it blocks the signed-in tier against a local dev server.
