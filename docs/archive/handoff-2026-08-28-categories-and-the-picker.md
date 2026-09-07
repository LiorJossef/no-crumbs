# Handoff — product categories, Hebrew map labels, and the picker problem

Cold-start document. Written to be read **after**
[`handoff-2026-08-28-google-places-primary.md`](handoff-2026-08-28-google-places-primary.md),
which is still correct about the resolver, the ToS gate and the Google quota. This one supersedes
its §10 priority order.

**If you read one section, read §3 — the owner's ruling on the candidate picker. It is the next
piece of work and it is a product problem, not a scoring tweak.**

---

## 1. State of the tree

Branch **`fix/hebrew-map-labels`**, two commits, both green on `npm run verify`
(1083 tests, 60 files) and verified in the running app. Pushed; see §7 for whether a PR exists.

`main` is untouched apart from the merge of PR #62 (docs only, the paused distance-assertion note).

Nothing is stashed by this session. The four owner-owned stashes are untouched —
**never run a bare `git stash push`/`pop` in this repo** (`handoff-2026-08-28-google-places-primary.md` §11.1).

---

## 2. What landed

### 2.1 Every Hebrew label on the basemap was rendering backwards

Found by opening the app and zooming in, not by a test. At street zoom over Tel Aviv, CARTO's
Hebrew labels came through character-reversed: פרישמן as `ומשירפ`, שדרות דוד בן גוריון as
`ויירוג'ב דוד תורדש`. **Every Hebrew label on the map was wrong**, on a product whose primary
market reads Hebrew.

Cause: MapLibre lays glyphs out in logical order and has no bidirectional algorithm of its own.
Unicode BiDi and Arabic shaping live in the RTL text plugin, which we had never loaded — there was
no reference to it anywhere in the repo.

Fixed in `src/components/map/rtl-text.ts`, called at **module scope** from
`map-surface.mapcn.tsx` (an effect runs after `MapcnMap` has already constructed a `Map`, which is
too late). `@mapbox/mapbox-gl-rtl-text@0.4.0` is vendored into `public/vendor/` rather than pulled
from the upstream unpkg example: the plugin executes inside our origin's worker, so a CDN we do not
control is a supply-chain surface, and a cross-origin fetch on map load tells a third party our
users opened a map. BSD-2-Clause, redistributed with its licence beside it. `public/vendor/**` is
now eslint-ignored (linting a minified third-party bundle produces only noise).

Verified before/after on the same tile at the same zoom.

### 2.2 The product now has its own category vocabulary

`src/domain/places/product-category.ts` — new, with `tests/unit/places/product-category.test.ts`.

Three taxonomies meet on a saved place and none of them was ours: the model's seven-value hint from
the caption (`places.category`), the resolver's raw snake_case (`places.provider_category` —
`ice_cream_shop`, `mediterranean_restaurant`), and the user's override. **We rendered the first and
no UI read the second at all.** So Gelalucci, a gelateria, sat in the library labelled **"Shop"** —
because the caption is about ice cream and `shop` was the closest word the model was offered —
while `ice_cream_shop` sat unread on the same row.

`productCategoryFor()` reconciles the three in an order that is an epistemic ranking, not a
preference: the user's word, then the venue's own registration, then an inference drawn from a
caption about a video. An unreadable provider string (`barber`, `notary_public` — `poi_index` is not
filtered to food on the way in) falls through to the model rather than to `other`, so we never lose
a category we do have.

`dessert` is the one added value, on evidence: `ice_cream_shop` (288 rows), `desserts` (109) and
`smoothie_juice_bar` (82) in the loaded Tel Aviv extract all land today on `shop` or `bar`.
`street food` was considered and left out — the source data does not draw that line.

Deliberately kept **separate from `ExtractedCategoryHint`**: that type is pinned to the prompt and
the extraction schema, so widening it costs a prompt version and a re-measurement. `ProductCategory`
is a strict superset (proved by a `satisfies` on the label table) so the display vocabulary can grow
at product speed. The mapping is a small exceptions table plus suffix rules, **not** a transcription
of either provider's enum — Overture's Tel Aviv extract alone carries 130+ distinct values.

Derived once, in `getSpots`, so no renderer re-derives it differently. That collapsed **three**
separate category-label tables into one and let `map/page.tsx` delete its own narrowing.
`Spot.category` is now a closed, non-nullable `ProductCategory`.

Verified in the app: Gelalucci reads "Dessert · תל אביב-יפו" with a cone pin, Kohi Coffee Shop
reads Café, האחים reads Restaurant.

---

## 3. THE NEXT PIECE OF WORK — the candidate picker asks questions it should answer itself

**Owner ruling, 2026-08-28, verbatim in substance:**

> We say "Needs your pick" and then ask the user to choose between candidates that are effectively
> the same place/location. This should not be happening. The user should not be doing the resolver's
> job when the system has enough evidence to make a reliable decision. Revisit the logic behind this
> entire candidate-picking state, especially now that Google Places is the primary resolver.
> Determine when we genuinely need human disambiguation versus when the system should resolve
> automatically, and remove unnecessary choice/uncertainty from the flow. Treat this as a general
> product + recognition problem, not a patch for this example. The review screen should only ask the
> user a question when there is a meaningful decision they actually need to make.

### 3.1 The specimen, with its real numbers

Caption: `📍קוהי, בן יהודה 155 תל אביב`. Read out of `extractions.candidates` in the local DB, so
these are the actual stored values, not a reconstruction:

| | Kohi Coffee Shop | NIKO by Sharon Cohen |
|---|---|---|
| addressLine | בן יהודה 155 | בן יהודה 155 |
| nameScore | **0.9325** | 0.4833 |
| categoryScore | **1.0** | 0 |
| addressScore | 1.0 (exact) | 1.0 (exact) |
| datasetConfidence | **0.295437** | 0.9802 |
| **score** | **0.90043** | 0.58775 |

`band: confirm`, `margin: 0.3127`.

The screen then rendered **"WHICH ONE IS IT? The caption doesn't say which."** — which is
also factually untrue here: the caption names קוהי and one option is Kohi Coffee Shop.

### 3.2 Why it happened, and why it is a class

Everything we actually measured about the match says "this is it": near-perfect name, exact
category, exact address, and a **0.31 margin** over the runner-up. It failed the 0.92 gate on one
term — `datasetConfidence` 0.295, Overture's crawler confidence that this POI exists at all.

`scoring-constants.ts` already argues, at length, that dataset confidence "is a data-quality number
about a row, not evidence about *this* query" — and then gives it **10% of the evidence budget**,
where a low value can veto a match that every piece of real evidence agrees on. On the Google path
the same term is a fabricated constant `0.5`, which caps a perfect name at 0.850 and made
auto-accept structurally impossible for 14 of 16 corpus candidates
(`handoff-2026-08-28-google-places-primary.md` §4.2).

So the term is doing harm on both providers, for two different reasons.

### 3.3 What I had in flight when the session was stopped

A `maps-geospatial` agent (task **TRACK2-CONF**) was measuring three weightings against the 44-case
golden file and any replayable recorded run:

1. **BASELINE** — today: name 0.80 / category 0.10 / datasetConfidence 0.10.
2. **DROP** — the term removed entirely, remaining two renormalised `(0.8·n + 0.1·c)/0.9`.
3. **DROP-UNPUBLISHED-ONLY** — §10.2's narrower proposal: renormalise only for a provider that
   publishes no confidence (Google), keep today's blend for Overture.

**Its result did not arrive before the session ended. Re-run it.** The brief asked specifically for:
the band table per weighting, every case that changes band with old/new score and adjudicated
correctness, **the count and names of any false auto-accepts**, what happens to golden case
**TLV-14** (`Bar 51` → `Hostel 51`, which is how `band-policy.md`'s last band change died), the
highest score reachable **without** a category match (must stay under 0.92 —
`scoring-constants.ts` property 2), and the distribution of `poi_index.dataset_confidence` in `tlv`.

Useful arithmetic done by hand, to be checked not trusted: under DROP the ceiling without a category
match is `0.8/0.9 = 0.889`, still below the 0.92 gate, so property 2 survives. With a category match
it is `1.000`. **That is exactly what makes TLV-14 the case to check** — if `Hostel 51` scores a
perfect name and a matching `bar` category, DROP hands it an auto-accept, which is the failure
`band-policy.md` records. Do not ship any of this without that number.

### 3.4 The scoring change is necessary but is NOT the whole ruling

Read §3's ruling again: the owner is asking a wider question than "raise the gate's pass rate".
Concretely, at least these, and they are separable:

1. **A shortlist whose entries are the same place should never be a question.** Both rows above are
   `בן יהודה 155`. Two candidates a few metres apart, one of which matches the name and one of which
   does not, is not a disambiguation — it is a prefilter artefact. Consider collapsing a shortlist
   by distance + name dominance *before* the band is decided.
2. **A dominant margin should be able to decide on its own.** 0.31 is not "unsure". The band policy
   today is a score gate AND a margin gate; there is no path where overwhelming *separation* carries
   a slightly-low absolute score. `band-policy.md` refuted `score ≥ 0.85 && margin ≥ 0.05` — note
   that this is a **different** proposal (0.05 is not a dominant margin) and the refutation does not
   automatically transfer. It still has to be measured the same way.
3. **The genuine disambiguation case is branches**, and we currently handle it worst.
   `handoff-2026-08-28-google-places-primary.md` §10.3: `רוסטיקו` at בזל 42, Google returns the
   רוטשילד 15 branch, the address correctly contradicts, the row drops to `no_match`, and the product
   falls back to the model's guess. Two branches of one venue **is** a meaningful question. Two rows
   at one address, one of which is obviously the named one, is not. The picker should be reserved for
   the first.
4. **The copy lies when the caption did say.** "The caption doesn't say which" was rendered for a
   caption that names the venue and its street number. Whatever the band logic ends up doing, the
   explanation has to be derived from the actual reason, not a fixed string.

### 3.5 Do not repeat

- `score ≥ 0.85 && margin ≥ 0.05` as a second preselect path — refuted, false auto-accept on TLV-14
  (`docs/evidence/places/band-policy.md`). Read that file before touching bands.
- Raising `datasetConfidence`'s weight, or moving freed weight *to* it — argued against at length in
  `scoring-constants.ts`.
- Widening the 75 m dedup radius (see §5).

---

## 4. Competitor scan (Mio Travel, Plotline) — done, deliberately shallow

`docs/evidence/product/competitor-pass-2026-08-28.md`. The owner cut this short mid-session as a
lightweight scan, so treat it as leads, not analysis. Neither competitor's actual category list was
directly observed — flagged in the doc.

Ranked gaps it produced (sizes are its own):

1. **Manual pin-location correction** (small–medium) — makes coordinate error self-healing instead
   of permanently wrong.
2. **Category is not user-editable** (small) — `saved_places.category_override` exists in the schema
   and **nothing writes it**. `productCategoryFor` already reads it, so the UI is the only missing
   half.
3. **Tag chips are inert / not filterable** (small) — already tracked; this adds outside confirmation
   that it is the retrieval feature users ask for.
4. **No manual place-add / place-search path** (medium) — confirmed as core elsewhere. Note the
   `/import` screen's own eyebrow already says **"ADD A PLACE"** while the only way in is a TikTok
   link.
5. **No favourite/visited state surfaced** (small) — `saved_places.visit_state` exists and the UI
   never sets it.
6. **User photos on a saved place** (medium) — conflicts with Charter §4's "info" boundary. Future
   list, owner call, not this sprint.

Item 2's finding is the useful one and it is cheap: the reconciliation already ranks the override
first, so shipping an edit control is additive.

---

## 5. Duplicate places — investigated, and mostly NOT the bug it looks like

A `supabase-database` investigation (task TRACK2-DEDUP) traced the confirm path and queried the live
table. Summary, because the shape of the answer matters more than the counts:

- **Dedup does run**, server-authoritative, on every save: `resolve_place` (SECURITY DEFINER) is the
  only thing that creates a `places` row, and `save_place` upserts on `(user_id, place_id)`.
  Enforced constraints: `place_provider_refs (provider, provider_place_id)` unique, and
  `saved_places (user_id, place_id)` unique. `places.name_key` is **not** unique — it is a lookup
  index for a 75 m/name-key guard inside `resolve_place`, i.e. a heuristic, not identity.
- The live duplicates (HaKosem ×3, Tokii ×2, La Nonna ×2, Kiaans/Kiaans Tooting,
  Sycamore Vino Cucina/Sycamore Cucina & Bar) came from **re-probing the same two source TikToks**
  during development, not from two different posts. The model is non-deterministic, so each re-run
  changed the name and the coordinate, which broke both the identity key and the `name_key` gate.
- The one class worth fixing: **different spellings never reach the distance check at all**, because
  the guard's `WHERE name_key = …` runs before distance. Kiaans/Kiaans Tooting are **18 m** apart and
  Sycamore's two rows **26 m** — both comfortably inside the 75 m radius, both blocked purely on a
  spelling difference. The lean fix is to relax that `WHERE` to a loose prefilter (name-key prefix or
  trigram) and let the 75 m distance check remain the actual decision boundary it already is. One
  forward-only migration inside `resolve_place`; no new table, no new constraint.
- **Do not** widen 75 m to catch the HaKosem class (477–568 m apart). That is llm-guess coordinate
  error, not provider disagreement, and ~500 m would start merging distinct venues on one block. The
  real fix for that class is a resolver returning a provider id at all — which is the direction the
  product is already going.
- Worth knowing: when identity *does* converge, "recommended by two different TikToks" is already
  queryable — `saved_place_sources` has no per-place uniqueness, so a second source attaches to the
  same saved place. The mechanism is built; the identity failure is what stops it firing.

Existing duplicate rows still need cleanup before any demo.

---

## 6. Smaller things seen and not fixed

- **Locality is rendered five different ways** in one list: `תל אביב-יפו`, `תל אביב - יפו`,
  `Tel Aviv`, `Tel Aviv-Yafo`, `ת״א`. Same class as the category bug — raw upstream strings shipped
  straight to the user. Not started. Note the sheet header already computes a canonical area name
  ("13 places in Tel Aviv-Yafo"), so there may be something to reuse.
- The `/import` eyebrow reads **"ADD A PLACE"** but the screen only accepts a TikTok link (§4 item 4).
- On the sign-in screen at mobile width there is a large dead vertical gap between the headline and
  the form.
- `computer` clicks against the map page time out in the Browser pane (MapLibre never goes idle).
  `javascript_tool` clicks work fine — use those, and `read_page` to verify.

---

## 7. Practicalities

```bash
npm run verify                 # lint + typecheck + layers + migrations + schema + agents + unit
gh pr checks <n>               # CI is the authority; verify covers 1 of 4 jobs
npm run merge:pr -- <n>        # the only way to merge
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Dev sign-in `demo@example.com` / `local-dev-preview-1234`; start the app through the Browser pane's
`preview_start` with `{name: "nextjs-dev"}`, never `npm run dev` in Bash.

Google Places quota is still **100 requests/day** and still the ship blocker
(`handoff-2026-08-28-google-places-primary.md` §7.1) — an owner console/billing action. Production is
still gated to Overture by `place-resolver-factory.ts` for the ToS reason in §8.1 of that document.
Some quota was consumed today by one import.

**Specialists used this session** (`working-agreement.md` §1.3): `product-lead` for the competitor
scan (research only, no code — its main useful output was that `category_override` is unwritten);
`supabase-database` for the duplicate-places trace (investigation only, no code — I disagreed with
its framing that duplicates are a live product bug, since the evidence shows they are development
artefacts, and recorded that in §5); `maps-geospatial` for the scoring measurement (did not return
before the session ended). Everything committed was written and verified by me.
