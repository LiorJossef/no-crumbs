# Handoff — the product has pages now, and two ruled specs were reversed doing it

**Session: 2026-08-29, afternoon/evening. Branch: `feat/country-band-map-layer`, unpushed.**
Started from `handoff-2026-08-29-country-band.md` §5, whose task 0 was "tap a country and an area
marker in a browser". Both taps are now verified. Everything after that was driven by the owner
using the running app and redirecting twice.

**Read §1 and §5 if you read nothing else.** §1 is what shipped; §5 is what is open and what I did
not verify.

---

## 1. What landed

| | |
|---|---|
| `84c2af6` | The third peek slot — **superseded four commits later, deliberately.** Kept in history because `AreaHeading.shortRest` and the peek chevron both survive it |
| `7f61251` | The category filter bar (`LIBRARY-IA-3`), merged with `Not been yet` into one scroll row |
| `078db3b` | The country and area markers become **pills**; the floating-text defect is gone |
| `ddd684e` | **`BottomNav`** — Map · Collections · `＋`. The product has pages |
| `037434e` | The navigation ruling marked superseded, with what survives it |
| `934bf52` | The tapped pin no longer vanishes under the sheet (backlog 4.5) |

### 1.1 The two reversals, and why they are not churn

Both came from the owner using the built thing, which is the loop working rather than failing.

**The peek slot → the bar.** `ux-navigation-structure-2026-08-29.md` refused a tab bar and answered
Collections' reachability with a third slot in the peek row. It shipped, the owner used it, and
ruled for Plotline's structure instead. The document now carries a banner saying §1, §2 and §5 are
superseded and — more usefully — that §1.2's collision, §4's refusal list and §3's filter bar are
**not**. Do not read it as wholly dead.

The collision §1.2 named is real and is paid, not denied: a bar and a three-stop sheet both want the
bottom of a phone. It is settled by moving `Add a TikTok` out of the peek row into the bar's `＋`,
which leaves the peek row one line of text and frees the lower half of the 128 px band. **`PEEK_PX`
never moved**, so the camera budget, the query rect and MapLibre's attribution padding never moved
either. The sheet's scroll container is padded by exactly `BOTTOM_NAV_HEIGHT_PX`.

**The disc → the pill.** The owner looked at the country band and said the text was floating on the
map, and it was: bare haloed text beside a disc, colliding with CARTO's own labels. Both bands are
now one stretchable-image pill with the label and count fitted inside as live text, so §2.2's "the
count is never baked into the image" survives and Hebrew still shapes.

### 1.2 Verified by using it, at 375×812 against the real 31-place library

- **The two taps from the last handoff's task 0.** Country marker → camera eases from z3 to **z8**,
  inside the 4.5–8.5 area band as §2.4 requires, and the active area **does not change**. Area
  marker → active area switches (`13 in Tel Aviv-Yafo` → `18 in London`) and the camera flies z8 →
  **z10.9** on the area. Driven by dispatching real mouse events at `map.project()`ed feature
  coordinates, because the browser pane's own click coordinates were not reliable here.
- **The bar.** All three targets 44 px; `aria-current="page"` follows the route across a tab hop;
  the peek line clears the bar by 14 px; the list scrolled fully to its end has **nothing** beneath
  the bar (lowest element bottom 748 == bar top 748); `＋` opens the import overlay with the sheet
  and the bar both unmounting for the takeover.
- **The filter bar.** `Not been yet | Restaurant 23 | Café 5 | Bakery 1 | Bar 1 | Dessert 1`.
  Pressing `Café 5` in London gives `No matches in London` with `Tel Aviv-Yafo · 5 matches ›`
  immediately below — the area model's own way out, working.
- **The reveal pan.** Low pin y=590 → y=341 against a sheet top of 365 (24 px clearance, zoom
  unchanged at 10.904). High pin y=157 → centre identical to six decimals. An exact no-op.
- **The pill.** `🇬🇧 United Kingdom 18` legible at z3.2 over a crowded Europe, clear of every
  basemap label, flag concentric in the cap.

1 557 unit tests pass, `tsc` clean, lint has only the two pre-existing `no-img-element` warnings.

---

## 2. Where a specialist corrected me, because that is the useful part

`maps-geospatial` was given six API assertions I had executed against the installed maplibre-gl
6.4.1. **One was inverted.** I said `content` shrinks the icon's collision box; it *expands* it — the
fitted box is the content rectangle, the caps sit outside it, and `collision_feature.ts:78-81` adds
them back. Measured `collisionPadding = [45, 0, 25, 0]`. The tap target is the whole pill, which is
what §6's 44 px floor now rests on.

It also found a seventh thing nobody had raised: a multi-section `['format', …]` text field takes a
bidi path that needs `processStyledBidirectionalText` and otherwise shapes with **no bidi at all**.
The old country layer had three sections. It never bit because country names are English — folding
the Hebrew area label into that field, which is exactly what this change did, would have walked
into it. Both bands now use a single-section `concat`.

---

## 3. Specialists used

| Agent | What it did | Wrote code? |
|---|---|---|
| `maps-geospatial` | The summary pill: geometry, stretchable-image metadata, seven assertions executed against the installed MapLibre source | Yes |
| `design-system-frontend` | `LIBRARY-IA-3` — `domain/places/category-filter.ts` and `components/sheet/category-filter-bar.tsx`, self-contained; I did the page wiring, desktop parity and browser verification | Yes |
| `design-system-frontend` | `NAV-3` — the bar on `/collections/[id]` and the join route. **See §5: collect this before planning** | Yes |

Neither of the first two had a browser and neither claimed anything rendered. Both said so
explicitly. The verification in §1.2 is mine.

I disagreed with the category-filter agent on nothing it decided, and it correctly refused to settle
one thing alone — see §4.

---

## 4. Needs the owner

1. **`ux-library-at-scale.md` §1.3 rule 5 asks for an `All` chip and the filter bar has none.** The
   agent's reasoning: the nav ruling gives slot 1 to `Not been yet` so `All` cannot be first anyway,
   and in this product a pressed chip means "this is narrowing your library" — `All` would sit
   pressed in the state where nothing is narrowed. Nothing pressed *is* everything. The residual
   cost is real and stated: with no `All`, clearing means finding the pressed chip, which can scroll
   out of view. **This should go back to `ux-interaction` rather than be closed by either of us.**
2. **The account chip still prints the raw email permanently over the map** and costs
   `FLOATING_TOP_CHROME_MOBILE_PX = 100` of camera budget on every fit. The superseded ruling's §2.2
   wanted it in the bottom band (`NAV-2`); the bar now exists and is the obvious home, but §4.3
   refuses a Profile *destination*, so it would be a menu and not a tab. Not built.
3. Everything in the previous handoff's §6 still stands: the Google Places quota, the product name,
   the model provider, and production still down on an empty env store.

---

## 5. Open, and what is NOT verified

**`NAV-3` is collected and partly reverted — start here.** The agent ruled that the bar belongs on
`/collections/[id]`, and its reasoning is sound and kept. I measured the result in a browser and
**backed the mount out**: at 375×812 the collection's own list ran **212 px under the bar, 144 px of
it below the viewport entirely.** The padding had gone on `Drawer.Content`, which is `h-full` and
translated by vaul, so it never brings the scroll container's own end into view.

`/map`'s sheet already solved exactly this, structurally, by binding the content column's height to
its stop in `dvh` (`place-sheet.tsx`'s `STOP_TO_CONTENT_HEIGHT`, documented there as a bug fix and
not a layout preference). **Do that on `/collections/[id]` first, then mount the bar.** Kept in the
tree and ready: `src/app/collections/[id]/sheet-geometry.ts` and its ten unit tests, and
`docs/ux-nav-collections-routes-2026-08-29.md` with the measurement and the full ruling.

One thing in that document worth not losing: §4.6 of the navigation ruling ("no tab bar on
`/collections`") died with §1 and must not be cited later as if it survived.

Also open, and now visible: the `＋` on `/collections` falls back to a link to `/import` rather than
opening anything in place, because that route has no overlay. It works; it is not the same gesture
as on `/map`.

Not verified by me, in priority order:

- **Anything below 375 px or in landscape.** The bar has a `max-[359px]` icon-only breakpoint that
  has never been on a screen. `L2-COLL-CAM-2` (640×360, 568×320) is untouched and still open.
- **Desktop.** The bar is `lg:hidden` and `PlaceDesktopPanel` keeps `CollectionsNavRow`, which is
  the intended split, but I did not open the app at `lg+` this session.
- **A country *group* on screen.** Still unseen — the real library is one area per country, so
  §2.6's group case has 17 unit tests and no rendering behind it. Carried unchanged from the last
  handoff.
- **The pill's fallback path**: the two-letter code for platforms with no flag glyph, and its
  `GB  United Kingdom  18` redundancy now that the name is in the pill. The agent flagged this as a
  design call and did not decide it.
- **The reveal pan at `lg+`**, where the occlusion is a left panel rather than a sheet. The code
  handles that branch through `mapOcclusionInsets`; I only exercised the mobile branch.
- The rotation defect (rotating without a reload leaves the camera framed for the old size)
  predates all of this and is still owned by nobody.
