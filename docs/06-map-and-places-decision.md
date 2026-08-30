# D2 — Map rendering + place resolution decision

> Owner: Maps / Geospatial. Status: **ACCEPTED. Security-Privacy sign-off taken 2026-08-18** by
> splitting §11 rather than answering it as a block — Q1 answered, Q2 narrowed and deferred to the
> first milestone that writes an ODbL-derived row, Q3–Q7 open but non-blocking. The schema this
> decision implies is designed in [`10-poi-index.md`](10-poi-index.md).
> **The basemap-tiles half of §2(A) was reopened 2026-08-21**: the product owner ruled out
> Protomaps outright; CARTO was evaluated as the replacement and adopted. See §2.1.
> **The place-resolution half of §3 was re-asked 2026-08-22** — owner wanted Google-sourced
> coordinates as "a real option." Resolved as an **incremental move**: MapLibre+CARTO (§2) and the
> Overture/Nominatim resolver (§3) are unchanged for now; the eventual switch to Google for both
> renderer and coordinates is a separate, explicitly-requested future task. See §3.3.
> Evidence: [`evidence/places/`](evidence/places/), [`evidence/licensing/`](evidence/licensing/).
> Every third-party claim below is labelled VERIFIED / ASSUMED / UNAVAILABLE per Charter §9.

## 0. The recommendation in one block

| Layer | Choice |
|---|---|
| Map rendering | **MapLibre GL JS** (BSD-3), via the `mapcn` shadcn-registry component (`src/components/ui/map.tsx`) |
| Basemap tiles | **CARTO's free vector basemap** (Positron/Dark Matter, `basemaps.cartocdn.com`), keyless. Superseded Protomaps on 2026-08-21 — see §2.1 |
| Place resolution | **Our own resolver over an openly-licensed POI dataset** — Overture Maps `places` theme (CDLA-Permissive-2.0 / Apache-2.0, Foursquare-sourced rows), loaded as per-city extracts into Postgres |
| Out-of-region fallback | **Nominatim**, hard-capped and cached, ODbL-attributed. **Promoted 2026-08-20 (D2b, [`mvp-plan.md`](mvp-plan.md) §11) from a late fallback to the MVP's global resolution path** — two sources behind one port, routed on the candidate's city hint; measured 85% top-1 inside a loaded region, 63% outside. Escape hatch if the ≤1 rps / ~200-per-day policy ceiling bites: a hosted OSM geocoder (LocationIQ / Geoapify — same data, same ODbL storage rights, a real ToS), reachable by changing one env var |
| Terminal recovery | Manual search over the same index, then manual pin-drop |
| Persisted per place | `name`, `lat`, `lon`, `category`, `source_dataset`, `source_dataset_id`, `resolution_score` |

Rejected as **legally unusable for this product**, not merely as second-best: Google Places API,
Mapbox Search Box / Geocoding, Foursquare Places API. See §3. This is not a preference; all three
forbid what Charter §1 requires us to do — persist a name and coordinates indefinitely.

---

## 1. What actually decided it

The product requires, per Charter §1 and invariant 4, that a confirmed place is **one row that
lives forever**, holding at minimum a name and coordinates, shared across many source posts.

VERIFIED: every credentialed places API we examined permits **indefinite storage of the provider's
opaque ID only**, and requires coordinates and names to be re-fetched live or deleted within 30
days. That single clause eliminates the three highest-accuracy candidates. The only way to hold a
name and coordinates forever is to derive them from an **openly-licensed dataset**. That reframes
D2 from "which API is most accurate" to "which openly-licensed dataset is accurate enough, and can
we make our own resolver good enough on top of it". §4 shows the answer is yes: 85% top-1, and
zero false auto-accepts across 44 benchmark cases.

---

## 2. (A) Map rendering evaluation

| Candidate | Visual control | Custom pins / clustering | Mobile-web + bundle | React / Next | Free tier | Attribution we must ship | Licensing / storage |
|---|---|---|---|---|---|---|---|
| **MapLibre GL JS v5 + Protomaps** | **Full** vector-style control; Protomaps styles are **CC0**, so we may fork and own them outright — the style becomes our tokens, not a vendor's | Native `cluster:true` on a GeoJSON source (supercluster); custom pins as sprite/SDF images in a symbol layer | WebGL canvas, ~200 KB gz for the GL JS core (ASSUMED, from npm/bundlephobia figures, not measured on device) | `@vis.gl/react-maplibre` v8, or 120 lines of `useEffect` against the raw API. Both understandable | Protomaps hosted API: **free ≤1M tile req/mo, non-commercial**; $14/mo sponsor tier for commercial (VERIFIED, protomaps.com/api) | "© OpenStreetMap" visible on the map, linking to osm.org/copyright (ODbL). Protomaps credit requested, **not required**. MapLibre itself requires none | BSD-3 library. Tiles are an ODbL Produced Work → attribution only. **No storage restriction on anything we render** |
| MapLibre GL JS + MapTiler | Full | Same | Same | Same | 100k tile req + 5k sessions/mo, **non-commercial only**, MapTiler logo mandatory (ASSUMED, from pricing page) | MapTiler logo + © OSM | Fine, but a smaller free cap than our projected 100–160k tiles/mo and a mandatory third-party logo |
| MapLibre GL JS + Stadia | Full | Same | Same | Same | Free tier non-commercial (ASSUMED) | Stadia + © OSM | Interchangeable with Protomaps behind our interface |
| MapLibre GL JS + **Mapbox tiles** | — | — | — | — | — | — | **Do not do this.** VERIFIED, Mapbox Product Terms §2.8.3: map-load pricing requires a "Qualified Renderer"; a non-Mapbox renderer against Mapbox tiles is billed per API request instead. A licensing trap, not a shortcut |
| Mapbox GL JS v3 | Best-in-class. But the v3 *Standard* style is configuration (light presets, label toggles), not free styling; deep customisation means dropping back to classic styles in Studio (ASSUMED, from docs) | Same clustering model; excellent | Heaviest of the three (ASSUMED) | `react-map-gl` v8 — the most mature wrapper | 50 k web map loads/mo, **credit card mandatory to activate** (ASSUMED, from pricing coverage) | VERIFIED, Product Terms §1.4.1–1.4.2: Mapbox logo **and** "© Mapbox" **and** "© OpenStreetMap" **and** "Improve this map" bottom-right | Proprietary. Renderer-only use is fine. §1.5 forbids derived works |
| Google Maps JS API | **Weakest.** Cloud-based styling is per-feature colour/visibility rules; no custom fonts, no label-placement control, no vector style authoring. Fails Charter §6 "the map style is the brand" | `AdvancedMarkerElement` is DOM-based; clustering needs `@googlemaps/markerclusterer` | DOM markers at scale are the known mobile-web perf hazard | Official `@vis.gl/react-google-maps` | Dynamic Maps is an Essentials SKU: 10 k loads/mo free (VERIFIED, March-2025 pricing change) | Mandatory Google branding, non-removable | Renderer is fine. But choosing it is only rational if we also choose Google Places (§3) |

**Decision (A): MapLibre GL JS + Protomaps.** Reasons in priority order: (1) the style is CC0, so
our visual identity is genuinely ours and is not a vendor's brand with our colours; (2) no credit
card anywhere in the stack, which removes the R7 bill-spike class of risk entirely for the map
layer; (3) one required attribution string instead of four; (4) `.pmtiles` self-hosting is a real,
cheap exit if Protomaps disappears; (5) it is trivially explainable — an open renderer plus open
tiles plus an OSM attribution.

**Runner-up: Mapbox GL JS v3.** It renders better out of the box and `react-map-gl` is more
battle-tested. We would switch if, and only if, the map style we author on MapLibre cannot reach
the quality bar within the schedule — the renderer swap is contained behind `MapSurface` (§8).

### 2.1 Reopened 2026-08-21: Protomaps ruled out, CARTO adopted

The product owner has explicitly ruled out Protomaps as the basemap-tile provider (reason: owner
call, not a licensing failure — Protomaps' terms above still stand as accurate). This reopens only
the *basemap-tiles* row of §2(A); the renderer (MapLibre GL), the place-resolution decision (§3),
and everything below is unaffected.

CARTO was evaluated as the replacement, using the CARTO basemap styles that the `mapcn` shadcn
component (already installed at `src/components/ui/map.tsx`, see `map-surface.mapcn.tsx`) defaults
to out of the box. Full findings, each labelled VERIFIED/ASSUMED/UNAVAILABLE with sources:
[`evidence/licensing/carto-basemap-terms-2026-08-21.md`](evidence/licensing/carto-basemap-terms-2026-08-21.md).

Summary:

| Question | Finding |
|---|---|
| API key required? | **No** — VERIFIED. The vector styles (Positron/Dark Matter/Voyager) served from `basemaps.cartocdn.com` work keyless today; only CARTO's separate raster endpoints carry the "no key" watermark |
| Free-tier ceiling | **VERIFIED** — 5,000,000 tile requests/calendar month, no account required, no upfront commercial/non-commercial declaration |
| Behaviour past the ceiling | **VERIFIED** (FAQ) — CARTO says it reaches out rather than cutting service off; paid plan only becomes necessary at sustained volume far beyond a course MVP |
| Commercial use on the free tier | **ASSUMED** — CARTO's FAQ (fetched directly) does not gate commercial use behind a paid plan under the fair-use ceiling, contradicting a lower-confidence secondary summary that said commercial use needs Enterprise. Treated as acceptable at our scale; revisit if traffic approaches the ceiling |
| Attribution requirement | **VERIFIED** in substance ("CARTO and OpenStreetMap must be credited on every map"); **ASSUMED** for the exact string, since CARTO's attribution page doesn't spell out the literal basemap text. We render `© CARTO © OpenStreetMap contributors`, linking to `carto.com/attributions` and `osm.org/copyright` |
| Does the style JSON self-attribute? | **VERIFIED, no** — inspected the live `positron-gl-style/style.json`; its source carries no `attribution` field, so `customAttribution` must be set explicitly on MapLibre's `AttributionControl` (done in `map-surface.mapcn.tsx`) rather than relying on the style to supply it |

**Decision (A, revised): MapLibre GL JS + CARTO's free vector basemap**, via `mapcn`'s default
style URLs — no `NEXT_PUBLIC_*` key needed, unlike the Protomaps path this replaces. This is now
the **active** `MapSurface` implementation (`src/components/map/map-surface.tsx`), superseding the
mock. `map-surface.live.tsx` (hand-rolled MapLibre + Protomaps) is left in place for reference only
and should not be wired back in. The place-resolution pairing analysis in §3.1 is unaffected: CARTO
carries no place-data restrictions of its own, so the "any map + Overture/FSQ-OS dataset" row in
§3.1 still reads YES.


### 2.2 Revised 2026-08-30: Voyager, a Mapbox-Standard palette, and tiered POI labels

The owner asked whether a MapLibre basemap could get materially closer to Mapbox Standard, using
Mapbox screenshots of San Francisco and Tel Aviv as the reference, and explicitly ruled that the
current beige direction was **not** to be preserved. The renderer decision is untouched — this is
`exp/richer-basemap`, three dials inside the existing surface, no camera, marker, sheet or
architecture code changed.

| Dial | Was | Is |
|---|---|---|
| Style URL | `positron-gl-style` | `voyager-gl-style` — same source, same keyless free tier, same 93-layer structure |
| `BASEMAP_TINTS` | warm paper / mint water / sage parks, lightness capped at 0.93/0.84/0.89 | Mapbox Standard "Day": near-neutral land, vivid sky-blue water, fuller green, caps raised |
| POI labels | one layer, 16 classes, from z12, one grey | four layers tiered by zoom, ~60 classes, coloured by family |

**§2.1's "do not switch basemap" finding stands and was not overturned.** It said Positron and
Voyager are structurally identical — 93 layers, same ids, same source — so a switch adds *zero
geographic information*. That is correct and was re-verified. The switch here is made on `paint`
alone, which is exactly what that finding said the difference was; it buys colour, not data.

**What was measured rather than assumed.** One Tel Aviv z14 tile from `carto.streets/v1` carries
**2 545 POI features across ~90 `class` values** (restaurant 852, shop 838, cafe 429, bar 252,
hotel 235, art_gallery 162, museum 38). The tiles are not POI-poor and never were. The first
attempt drew every named POI and the owner's verdict was "sometimes you can see a lot of places and
it's really confusing" — correct, because it also drew `bicycle_parking` (469), `waste_basket`
(295) and `gate` (223), and because at city zoom the user's own saved places competed with a
hundred labels they did not choose.

**The repair is a zoom tier, not a filter**, and it copies `zoom-bands.ts` deliberately: landmarks
z13, culture z15, food z16, everyday retail z17, as four layers with their own `minzoom`. MapLibre
owns the swap, so nothing listens for zoom and nothing re-renders on a pinch. `["zoom"]` is not
legal inside `filter` — only as the input to a top-level `step`/`interpolate` in a paint or layout
property — so a per-class threshold *has* to be a layer boundary.

**The one thing CARTO cannot give us is POI icons.** Verified by fetching each sprite: `positron`,
`voyager` and `dark-matter` ship **exactly one image, `circle-11`**. The reference screenshots'
coloured glyphs, transit squares and highway shields cannot be drawn from CARTO at any setting.
This is **not** a hard ceiling, and §2.1's phrasing that it is should be read as superseded: the
codebase already rasterises canvas bitmaps and calls `addImage` for the pins and the country pills,
and the `poi` source-layer carries `class` and `subclass`, so a sprite keyed on class is reachable
with machinery that exists and is already tested. It is simply not a style swap. Not done, not
scheduled.

**Two tests were changed, both encoding rulings this work re-tests**, recorded here so neither is
re-derived from a comment later:

- *"land is visibly warm, not grey"* (`basemap-tint.test.ts`) asserted the beige direction itself.
  The mechanism it exists to prove — a lightness cap lets a near-white input take colour — now runs
  through `water`, and a land-is-near-neutral assertion replaces it.
- *"leaves residential street names where CARTO put them"* (`basemap-labels.test.ts`) asserted
  `roadname_minor`'s absence. It now pins the half that was load-bearing: they stay out of the
  zoom the camera rests at, so leaning in reveals them rather than the overview arriving cluttered.

**Verified by use, not only by tests** (local dev, mobile viewport, the owner's real library):
z8–z12.5 shows cities and uppercase district names with no POI labels and the saved pins clearly
the subject; z15 adds culture (Nahum Gutman Museum, Balfour Medical Centre); z16+ adds food
(Jazz Kissa, Saffe, Cofix). All four tiers behave.

---

## 3. (B) Place resolution evaluation — including the licensing column that decides it

Measured columns are marked ⟦M⟧ and come from `evidence/places/adjudication.json`. Everything else
is ASSUMED from documentation.

| Candidate | Top-1 on our 44-case benchmark | Ambiguity / misspelling / non-Latin | Stable ID | Category taxonomy | Cost at our scale | **May we store name + coords forever?** | Verdict |
|---|---|---|---|---|---|---|---|
| **Overture `places` + our resolver** (self-hosted extracts) | **⟦M⟧ 35/41 = 85%** (TYO 14/14, LDN 13/13, TLV 8/14) | ⟦M⟧ misspellings handled (5/5 correct); ⟦M⟧ multi-branch correctly forced to a user choice via the margin gate; ⟦M⟧ Hebrew-script queries fail — the extract has **zero** alternate/multilingual names (`names.common` empty on all 653 k rows) | Overture GERS ID; stable across releases by design (ASSUMED) | Foursquare-derived, ~1 000 leaf categories (`ice_cream_shop`, `israeli_restaurant`, `beer_bar`) — genuinely useful | **$0 per call.** Storage: ⟦M⟧ 3 cities food-and-drink = 165 685 rows / 21 MB CSV → ~45 MB in Postgres | **YES.** CDLA-Permissive-2.0 (no share-alike) + Apache-2.0 for FSQ-sourced rows (VERIFIED, docs.overturemaps.org/attribution). No map-pairing restriction of any kind | **CHOSEN** |
| Google Places API (New) Text Search | Not measured — no key. ASSUMED best available | ASSUMED best available | `place_id`, storable indefinitely | Good | Text Search is a **Pro** SKU: 5 000 free/mo, then ~$32 CPM. Our ~5 000 lifetime lookups fit in one month's free tier | **NO.** VERIFIED, Service Specific Terms §5.4: "Customer can temporarily cache latitude (lat) and longitude (lng) values from the Places API for **up to 30 consecutive calendar days, after which Customer must delete** the cached latitude and longitude values." Only `place_id` is exempt | **REJECTED** |
| ↳ …and even the compliant variant | | | | | +5 000 Place Details refresh calls **per month, forever**, just to keep 5 000 coordinates alive | VERIFIED, §5.3: "Customer must not use Google Maps Content from the Places API **in conjunction with a non-Google map**." VERIFIED, Places policies: "Places API results displayed on a map must be shown on a Google Map" | **REJECTED** — forces a Google basemap, which fails Charter §6 |
| Mapbox Search Box / Geocoding v6 | Not measured — no key. ASSUMED good on addresses, weaker on small indie POIs | ASSUMED | Mapbox Feature ID, but VERIFIED §2.7.6: "At any time **without notice**, Mapbox may modify or remove a Mapbox Feature ID" | Adequate | Permanent geocoding $5/1 k → ~$25 one-off. Cheapest paid option | **NO, in practice.** VERIFIED, Product Terms §2.7.3: Permanent Geocodes may be used in an application only if "(i) access to Permanent Geocodes cannot be a **primary or significant feature**… but only used to support an ancillary or incidental feature, (ii) a **separate API request … shall be made for each End User account** that accesses, uses, or relies on such Permanent Geocode". Also §2.7.1(i): may not be used "to develop a general database of points-of-interest"; §2.7.5: POI results only "in conjunction with a Mapbox Map" | **REJECTED** — (i) is the whole product; (ii) directly contradicts Charter invariant 4 (one row, many users) |
| Foursquare Places API (new, from 2026-06-01) | Not measured — no key. Same underlying data as our chosen dataset, so ASSUMED ≥ our 85% given a better matcher | ASSUMED good | `fsq_place_id`, cacheable indefinitely | Same taxonomy we already get | 500 free Pro calls/mo, then $15 CPM → ~$67 for 5 000 lookups (VERIFIED, docs.foursquare.com upcoming-changes) | **NO.** ASSUMED (secondary sources on the API License Agreement): PAYG accounts may cache `fsq_place_id`, photo IDs and address IDs indefinitely **and nothing else**. Requires "Powered by Foursquare" branding | **REJECTED as an API** — but its dataset, under Apache-2.0, is exactly what we are using |
| Nominatim (public) | ⟦M⟧ 26/41 = 63% (TYO 12/14, TLV 5/14, LDN 9/13) | ⟦M⟧ **brittle**: 8 cases returned *zero* results, including every single misspelling. ⟦M⟧ Perfect on the 3 negative cases (no false positives) | `osm_type/osm_id` — unstable; nodes are deleted and re-created on edit | OSM `amenity`/`shop` tags — coarse but honest | $0 | **Yes, with obligations.** ODbL: attribution required; share-alike bites only on distributing a derivative database | **FALLBACK ONLY** — VERIFIED usage policy: "absolute maximum of 1 request per second", results "must be cached", and "Applications and services whose primary function is related to geocoding must run their own service" |
| Photon (public komoot) | ⟦M⟧ 28/41 = 68% (TYO 12/14, TLV 6/14, LDN 10/13) | ⟦M⟧ Genuinely good fuzzy matching — recovered `Prufrock Cofee` and `Satans Wiskers` at rank 1 where Nominatim returned nothing. ⟦M⟧ But 1 **false positive** on a negative case, and ⟦M⟧ returned the right coordinates with a `null` name for Café Levinsky 41 | Same as Nominatim | Same as Nominatim | $0 | Same ODbL position | **NOT PRODUCTION** — public instance has no SLA or terms we can rely on |

### 3.1 Which pairings are legally viable

| Pairing | Viable? |
|---|---|
| MapLibre/Protomaps map + Overture/FSQ-OS resolver | **YES.** No cross-restriction exists in either licence. This is the recommendation |
| MapLibre/Protomaps map + Nominatim fallback | **YES**, with ODbL attribution (already required by the basemap) and the 1 req/s cap |
| Google map + Google Places | YES — the only legal Google configuration |
| **Mapbox/MapLibre map + Google Places** | **NO. Explicitly forbidden**, Service Specific Terms §5.3 + Places policies. This is the pairing the brief floated as acceptable; it is not |
| Google map + Mapbox Search results | NO — Mapbox §2.7.5 requires POI results to be used with a Mapbox Map |
| Mapbox map + Mapbox Search, with permanent storage | NO for *this* product — §2.7.3(i)/(ii) as quoted above |
| Any map + Foursquare Places **API**, storing name/coords | NO — cacheable IDs only |
| Any map + Foursquare **OS Places / Overture** dataset | YES — Apache-2.0 / CDLA-Permissive-2.0 |

### 3.2 Attribution we must implement

Small, always-visible, never inside a collapsed menu:

1. On the map surface: **"© OpenStreetMap"** linking to `https://www.openstreetmap.org/copyright`. Mandatory (ODbL, Protomaps tiles). We will also credit Protomaps voluntarily.
2. On the place-detail sheet and on `/attributions`: the dataset credit for that row, driven by `source_dataset`. For Foursquare-sourced Overture rows this must preserve the NOTICE: **"Copyright 2024 Foursquare Labs, Inc. All rights reserved."**, with a copy of Apache-2.0 and a statement that we modified the data (we filter and re-index it). VERIFIED, opensource.foursquare.com/places-notice-txt.
3. `/attributions` also carries the CDLA-Permissive-2.0 text (the licence only requires that the text be made available) and the ODbL text.
4. A ship-blocking requirement: a `NOTICE` file in the repo, and the Foursquare notice reproduced in our developer docs, as the Apache-2.0 NOTICE terms require for API-shaped redistribution.
5. Our HTTP client sends `User-Agent: p-002/<version> (<contact email>)` on every Nominatim call.

### 3.3 Re-asked 2026-08-22 — Google as a coordinate source (owner re-ask, resolved: incremental)

The owner asked this session whether coordinates could be sourced from Google Maps going forward.
A first pass evaluated this against the *current* architecture (renderer fixed at MapLibre+CARTO,
coordinates persisted forever) and found it legally blocked: Google's Service Specific Terms
§3.3 (Geocoding) / §5.3 (Places) forbid using Google Maps Content "in conjunction with a
non-Google map," independent of the 30-day cache limit in §3.4/§5.4 above.

The owner then corrected the premise: the map renderer itself may move to Google Maps eventually,
and permanent storage is not a hard requirement — periodic refresh against Google's terms is
acceptable. Under that premise the ToS blocker likely dissolves (Google content on a Google map,
refreshed on Google's schedule, is exactly what their terms permit) — **but the owner's decision,
2026-08-22, is to move incrementally, not switch now**:

- **§2's renderer stays MapLibre+CARTO for now.** No renderer swap in the current or next scheduled
  task; that is its own future task, started only when the owner explicitly asks for it.
- **§3's resolver work (L0-F2/L0-F3, Overture + Nominatim) proceeds unchanged.** No Google adapter
  is built or wired live yet — doing so now would re-trigger the exact §3.3/§5.3 non-Google-map
  prohibition above, since the renderer hasn't moved.
- **Forward-looking constraint on L0-F3's port design:** when `maps-geospatial` builds the
  `PlaceResolver` port (L0-F3-T2), it should not assume exactly two providers forever — the
  `provider` union and its DB check constraint (`11-resolver-vocabulary.md` §1, ruling 1) should be
  written so widening it to add a `'google'` provider later is a small migration, not a redesign
  (this is already `maps-geospatial`'s finding from this session's feasibility check: the port
  shape itself needs no rework, only the union and a migration). No Google-specific code is owed
  now — only not architecting the two current providers as if they were the only ones that will
  ever exist.
- **The eventual switch is a separate, explicitly-requested task.** When it happens, it is a D2
  reopen covering *both* §2 (renderer) and §3 (resolver) together, since the ToS analysis above
  only clears once both move together — a Google resolver adapter without the Google renderer, or
  vice versa, re-creates the forbidden pairing.

### 3.4 Re-opened 2026-08-22, same day — L0-F2/L0-F3 paused; AI-based resolution for now

Hours after §3.3 above was written, the owner reopened it further, this time concretely: **do not
build the Overture/pg_trgm local index resolver (L0-F2) or the Nominatim adapter (L0-F3) right now.**
Reasoning given: the product is planning to move to Google Maps as the map provider anyway, so
building and then discarding an Overture-based resolver is wasted effort. Instead, for the current
build increment, the LLM `PlaceExtractor` itself is asked to identify the most likely real-world
venue from the TikTok caption's full context (name + city/category hints + its own world knowledge),
and the app links out to a Google Maps search for that identification — a human (the tester, later
the end user) clicks through and judges the result, nothing is auto-accepted or stored.

**Why this does not trigger §3.3's non-Google-map prohibition, and why it still isn't nothing:**
§3.3/§5.3 forbid using Google Maps *Content* — Place data pulled via Google's API — "in conjunction
with a non-Google map." A hyperlink to `google.com/maps/search` that a human clicks is not
Google Maps Content reaching our own MapLibre+CARTO map at all; no Google Place data is fetched,
cached or rendered by us. That pairing is what was blocked, and it doesn't exist here. What *is*
real, and unresolved, is the accuracy risk already flagged in `docs/evidence` sessions this same
day: an LLM's identification of "the real venue" is unverified recall, not a database match — it
can be wrong (wrong branch, wrong city, a plausible venue that doesn't exist) with no way to check
it the way a real gazetteer/POI match can be checked. The mitigation for now is that a human is
always the one clicking and judging the link, matching the low-confidence, no-auto-accept posture
`domain/extraction/plausibility.ts` already applies to hashtag-only candidates.

**Consequence for the ladder:** `L0-F2` (local resolve seam) and `L0-F3` (global resolver, D2b) are
**paused, not cut** — `docs/execution-plan.md`'s L0-F2/L0-F3 rows are marked accordingly. They
resume, in whatever form, at the eventual Google renderer+resolver switch §3.3 already named as its
own future task — or sooner, if AI-based resolution proves too inaccurate to be useful and a real
resolver turns out to still be needed even after the Google Maps move. This is a live, admittedly
unresolved tension: whether "the LLM identifies the place, a human clicks a Maps link" is sufficient
all the way through the real product (not just this manual-test screen) is not decided here — only
that it's the approach for the current build increment.

---

## 4. The benchmark: spec and real results

Spec: [`evidence/places/benchmark-spec.json`](evidence/places/benchmark-spec.json) — 44 cases, 41
positive + 3 negative, across Tokyo (14), Tel Aviv (14), London (13). Composition is deliberate:
obscure independents (Bar Benfiddich, Satan's Whiskers, Café Levinsky 41), multi-branch businesses
with no branch hint (AFURI, Monmouth, Miznon, Anita), branch hints (Dishoom Shoreditch, BAO Soho),
misspellings (`Fuglin`, `Prufrock Cofee`, `Satans Wiskers`, `Port Sayid`, `Belboy`), native-script
queries (猿田彦珈琲, むぎとオリーブ, הקוסם, אורנה ואלה), transliterations, city-hint-absent cases, one
generic-name collision trap (`Bar 51`, `The Dove`, `Kiln`, `Brat`), and three captions that name no
venue at all. Each case carries a `label_confidence`; the four `low` ones must be re-checked by a
human before they are used to compare providers.

### 4.1 Results actually obtained

| Provider | Top-1 | Top-3 | Zero results | Verified absent from dataset | In-dataset but mis-ranked | False positives on the 3 negatives |
|---|---|---|---|---|---|---|
| Nominatim | **26/41 (63%)** | 27/41 | 8 | 3 | 3 | 0 |
| Photon | **28/41 (68%)** | 29/41 | 0 | 3 | 8 | 1 |
| Overture + our scorer | **35/41 (85%)** | 35/41 | 0 | 2 | 4 | 0 |

Per city: Nominatim TYO 12/14 · TLV 5/14 · LDN 9/13. Photon 12 · 6 · 10. Overture 14 · 8 · 13.

**Not measured, and therefore not quoted anywhere as a number:** Google Places, Mapbox Search Box,
Foursquare Places API. All three need credentials that did not exist at run time. Their rows in §3
are documentation-only. This is the single largest gap in this decision (§10).

### 4.2 What the raw data taught us that a table cannot

- **Tel Aviv is the hard city, and its failures are coverage, not ranking.** Overpass name-regex
  probes across *every* `name:*` key in a Tel Aviv bbox confirm that **Imperial Craft Cocktail Bar,
  Orna and Ella and Cafe Xoho are simply absent from OpenStreetMap**. Imperial Craft is a globally
  ranked cocktail bar. No amount of scoring recovers a row that is not there. Overture *has*
  Imperial Craft and `CafeXoho`, and *lacks* Café Levinsky 41 — which OSM has, tagged with
  `name:en` only and **no `name` tag at all**, which is why Photon returned it nameless. The two
  datasets have complementary gaps; neither alone is sufficient; the resolver must tolerate rows
  with a missing or single-script name.
- **Nominatim's failures are mostly search, not data.** `Dishoom Shoreditch, London` returned zero
  results, yet OSM holds `way/276329431 name=Dishoom addr:street=Boundary Street` in Shoreditch.
  Nominatim's exact-token matching cannot absorb a branch qualifier or a dropped apostrophe. Every
  one of our five misspellings returned zero.
- **Multi-branch businesses are the common case and are detectable.** AFURI returned five genuine
  branches with a top1–top2 score margin of 0.002; Monmouth four at 0.012; The Dove two at 0.000.
  The margin, not the score, is the ambiguity signal.
- **Whole-string similarity alone is not enough.** The naive Jaro-Winkler baseline
  (`raw-overture.json`) put "Jinga Cafe" above "Anita" for `Anita Gelato` and "Cafe Zelik" above
  everything for `Cafe Levinsky 41`. Distinctive-token coverage fixed most of that.
- **Non-Latin querying is a live, unsolved limitation.** Overture's `names.common` alternate-name
  map was empty for all 653 685 rows we pulled, and 21 788 of 35 430 Tel Aviv rows have a
  Hebrew-only primary name. A Latin query cannot reach a Hebrew-named row. Mitigation in §7.

---

## 5. Cost model at university-project scale

Assumptions: 100 users · 50 saved places each = **5 000 places** · 20 imports per user = 2 000
imports · 2.5 candidates per import = **~5 000 resolution lookups in total, not per month** · ~2 000
manual searches · 2 000 map sessions/month at ~50–80 vector tiles per session =
**~100 000–160 000 tile requests/month**.

| Line item | Recommended stack | Free-tier headroom |
|---|---|---|
| Renderer | MapLibre GL JS, BSD-3 | n/a — $0 forever |
| Tiles | Protomaps hosted, ~130 k req/mo | **~7.7× headroom** under the 1 M/mo non-commercial cap. $14/mo if the project is ever commercial |
| Resolution | Self-hosted index, 5 000 lookups | **Unmetered.** No per-call cost, no rate limit, no quota to exhaust |
| Fallback | Nominatim, capped at 200 req/day | Policy-bounded, not quota-bounded |
| POI storage | 3 cities food-and-drink: 165 685 rows ≈ 45 MB with a trigram index; ~12 cities ≈ 150–180 MB | Supabase free tier is 500 MB. Fits. A **global** food-and-drink extract would be ~20 M rows / 4–6 GB and does **not** fit — hence region scoping (§7.4) |
| Saved places | 5 000 rows, negligible | — |
| **Total marginal provider spend** | **$0** | — |

For contrast, the compliant Google configuration: 5 000 Text Search calls fit inside one month's
5 000 free Pro calls, but §5.4 then requires **5 000 Place Details refreshes every month forever**
to keep coordinates legal. At 100 users that is half of the 10 000/mo Essentials free cap; at 300
users it is a recurring bill for the privilege of not deleting our own users' data. And it forces a
Google basemap. The recommended stack has no such treadmill.

---

## 6. Resolution scoring — from candidate string to ranked shortlist

> **Superseded as a type declaration, 2026-08-19 (MS5 task 2).** The input and output below are
> the *scoring* contract and are still correct as such, but they are no longer where the names
> live: `ResolveQuery` / `RankedPlace` / `ResolveResult` are declared once in `src/domain/types.ts`
> and the port in `src/domain/ports.ts`, per [`11-resolver-vocabulary.md`](11-resolver-vocabulary.md).
> Four differences in that declaration, each ruled there: `areaHint` is **dropped** (no producer —
> `09`'s `PlaceCandidate` never emits it, and the scorer never reads it); `confidence: number` and
> `margin` collapse into `Confidence = { band, score, margin }`; `action` is named `band`; and
> `region_loaded` is not a field but `regionLoaded(result)`, the negation of `regionsSearched`
> being empty.

Input: `{ candidate: string, cityHint?: string, categoryHint?: 'cafe'|'bar'|'restaurant' }`.
Output: `{ shortlist: RankedPlace[], confidence: number, margin: number,
action: 'preselect' | 'confirm' | 'no_match', region_loaded: boolean }`. `margin` is carried
because §6.2 bands on it and the UI explains with it; `region_loaded` because §7.3 requires the
UI to distinguish "not found" from "that city is not loaded".

Implemented and measured in
[`evidence/places/resolve-overture-scored.py`](evidence/places/resolve-overture-scored.py).

### 6.1 Pipeline

1. **Normalise.** NFKD, strip combining marks, lowercase, strip punctuation, collapse whitespace.
   Do **not** strip non-Latin ranges.
2. **Scope.** City hint → region id → restrict candidates to that region. No city hint → search all
   loaded regions and rely on the score. Measured effect: with no city hint, Nominatim ranked four
   Italian hamlets called *Padella* above the London restaurant; scoping is what prevents that.
3. **Prefilter** (cheap, index-backed): whole-string similarity > 0.72 **OR** any distinctive query
   token present as a substring of the name. Measured breadth: 18–2 904 candidates per query.
4. **Score each candidate.**
   - `whole` = Jaro-Winkler(normalised query, normalised name).
   - `cov` = mean over the query's **distinctive** tokens (generic words like *cafe, coffee, bar,
     restaurant, the, tokyo, london* removed) of the best per-token similarity against the
     candidate's tokens, with substring containment credited at 0.97 so agglutinated names
     (`CafeXoho`) still match. **Corrected 2026-08-19 (MS5 task 3):** this line also claimed the
     credit for prefixed names such as `פלאפל הקוסם`, and it does not earn it there — that name
     tokenises on the space, so `הקוסם` is an *exact token* match at 1.0 and the 0.97 credit is
     never reached. (TLV-07's query is `הקוסם` alone, and the falafel row is in any case one of
     §6.3's three absent-from-dataset misses.) The rule stands on the agglutinated case only;
     pinned as a test in `src/domain/places/`.
   - `extra` penalty = 0.04 per surplus distinctive token in the candidate, capped at 0.15. This is
     what stops "The Fishmongers Kitchen" from claiming "this hidden gem in Shoreditch".
   - `name_score = 0.45·whole + 0.55·cov − extra`
   - `cat_score` = 1 if the candidate's category is in the hinted category's token set, else 0.
   - **`score = 0.72·name_score + 0.18·cat_score + 0.10·dataset_confidence`**
5. **Rank**, take top 5, compute **`margin = score(top1) − score(top2)`**.

### 6.2 The confidence bands, and the threshold at which we must ask

These three band names are the `ConfidenceBand` enum (`07` §10 owns the type, this section owns the
thresholds). `confident` and `shortlist` appear in UI prose elsewhere; they are not band names.

| Band | Rule | UI behaviour |
|---|---|---|
| **preselect** | `score ≥ 0.92` **AND** `margin ≥ 0.05` | Row is pre-ticked in the review sheet with the match shown. Still requires the user's Save tap — Charter invariant 2 is absolute |
| **confirm** | `score ≥ 0.80` but either gate fails | Ranked shortlist of up to 5, nothing pre-selected, one tap to pick, one tap to reject |
| **no_match** | `score < 0.80` | "We couldn't find this" + the manual search field pre-filled with the candidate string |

`margin` is doing the most important work here. A high score with a low margin does not mean
"uncertain which business" — it almost always means "certain of the business, uncertain **which
branch**", which is precisely the case a human must settle and a machine must not.

### 6.3 Measured behaviour of those thresholds (all 44 cases)

| Band | Cases | Correct | Incorrect |
|---|---|---|---|
| preselect | 29 | **29** | **0** |
| confirm | 12 | 9 | 3 |
| no_match | 3 | — | 3 misses (1 absent from the dataset, 2 mis-ranked) |

**Zero false auto-accepts in 44 cases.** All three no-name captions (`this hidden gem in
Shoreditch`, `best coffee ever`, `that little wine bar near the market`) scored 0.813–0.894 — high
enough to be dangerous under a naive 0.80 cut, low enough to be caught by the 0.92 gate. And every
multi-branch case landed in `confirm` exactly as intended: AFURI (margin 0.002), 猿田彦珈琲 (0.001),
Monmouth (0.012), The Dove (0.000), Kiln (0.048).

The 71% preselect rate is the number that matters for import friction: roughly seven in ten
candidates arrive already resolved and pre-ticked, and the three in ten that do not are exactly the
ones where a human tap adds real information.

These weights and thresholds are **calibrated on 44 cases and will be re-fit** once the AI
Engineer's 50-post golden set (A5) exists, and again if a credentialed provider is benchmarked.
They live in one exported constant object with the benchmark as their regression test.

### 6.4 Provider-call ceilings and caching

| Ceiling | Value | Why |
|---|---|---|
| Resolution lookups per import | **7** | `MAX_CANDIDATES = 7`, one search per candidate — the single cap, declared in `07` §7 and applied in `09` §5.3 (the 8 written here predates it; the LLM's *schema* cap is 12, `09` §4.2). Assumption B4 says 3–7 places per post is normal. Candidates past 7 are kept as `capped`, never dropped |
| Imports per user per day | **30** | R7 |
| Manual-search requests | debounce 300 ms, min 2 characters, one in flight, ≤20/min/user | Autocomplete is the easiest accidental cost amplifier |
| Nominatim fallback | ≤1 req/s globally (policy), ≤200/day project-wide, sequential queue | VERIFIED policy limit |
| Resolution cache | keyed on `sha256(normalised_candidate + region_id + category_hint)`. Open-data hits cached **permanently** (licence permits it); Nominatim hits cached 90 days | Repeat imports of the same venue cost nothing |
| Idempotency | Same URL re-pasted → the same `imports` row, no new lookups (there is no job row: `07` §0 has no queue) | A3 |

---

## 7. Known limitations of the chosen resolver, and the mitigations

1. **Non-Latin-script queries (measured failure).** Overture gave us no alternate names, so a Latin
   query cannot reach a Hebrew- or Japanese-named row and vice versa. TYO cases passed only because
   Overture happens to hold Latin names for those venues. Mitigations, in order: (a) at ingest,
   join OSM `name` / `name:en` / `name:he` / `name:ja` aliases onto Overture rows by proximity +
   name similarity, giving each row a multi-script alias list — this also repairs Café Levinsky 41;
   (b) ask the LLM extractor to emit both the caption's original string **and** a Latin
   transliteration, and score both; (c) the manual search field always remains.
2. **Tel Aviv coverage is materially worse than Tokyo or London** (8/14 vs 14/14 and 13/13). Since
   Tel Aviv is a primary target city, the OSM-alias join in (1a) is not optional polish; it is the
   fix for our weakest city.
3. **Region scoping.** V1 ships with pre-ingested extracts for Tokyo, Tel Aviv and London plus a
   handful of demo cities. A candidate whose city is outside every loaded region falls through to
   Nominatim, then to manual search. Ingest is a committed offline script, measured at 7–24 s per
   city bbox straight from the public Overture S3 release, so adding a city is a one-command change,
   not an engineering task. This is an honest, explainable limit — and it is the reason the
   resolver reports which regions it searched, so the UI can say *why* it failed. **Corrected
   2026-08-19:** there is no `resolveOne` — the method is `PlaceResolver.resolve`, and
   `region_loaded` is not a field but `regionLoaded(result)` (`11` §2, `domain/places/resolve-result.ts`).
4. **Dataset noise.** Overture places is business-registry-grade: **85.9% of the raw Tel Aviv
   extract is not food and drink** (30 433 of 35 430 rows). We filter to food-and-drink categories at
   ingest, which is also what keeps the extract at 14–35% of raw size — Tel Aviv lands at 14.1%
   (4 997 rows).
   **Corrected 2026-08-19 (MS5 task 5), by measuring the pinned release.** This said "the Tel Aviv
   extract is 43% lawyers, estate agents and 'professional services'", and that number is not
   reproducible: on `2026-07-22.0` those categories are `lawyer` 1 509 + `professional_services` 986
   + `real_estate` 927 + `real_estate_agent` 237 = **3 659 = 10.3%**, and a deliberately generous
   grouping (legal, real estate, insurance, finance, accounting, marketing, consulting, software,
   agencies) reaches only 16.8%. The 85.9% above is the honest form of the same point.
   Two flaws in the filter itself, measured on the same run and left in place rather than re-cut in
   an ingest task (`10` §7.1, [`evidence/places/ingest-tlv-row-counts.json`](evidence/places/ingest-tlv-row-counts.json)):
   its substring patterns **admit 377 non-food rows** (`%bar%` → `barber`, `%pub%` → `public_plaza`,
   `public_relations`, …) and **drop real food categories** (`delicatessen` 96, `butcher_shop` 86,
   `lounge` 36, `candy_store` 30, `sandwich_shop` 27, `chocolatier` 18, `gelato` 8) — including the
   row the benchmark ranked first for TLV-13. Re-cutting the list moves §3.1's storage model and the
   §6.3 numbers, so it needs a ruling of its own.
5. **Freshness.** Closed venues persist. Out of scope for V1; a `last_verified_at` column is added
   now so a future check costs a migration, not a rewrite.

---

## 8. Interfaces we own (R2 containment)

```ts
// integrations/maps — the renderer seam
interface MapSurface {
  mount(el: HTMLElement, opts: { center: LngLat; zoom: number }): MapHandle;
}
interface MapHandle {
  setPlaces(places: SavedPlace[]): void;         // one clustered source, replaced wholesale
  flyToPlace(id: PlaceId, opts?: CameraOpts): void;
  fitToPlaces(ids: PlaceId[], opts?: CameraOpts): void;
  onSelect(cb: (id: PlaceId) => void): Unsubscribe;
  onClusterSelect(cb: (bounds: LngLatBounds) => void): Unsubscribe;
  setUserLocation(fix: LocationFix | null): void;
  destroy(): void;
}

// domain/ports.ts — the resolution seam. SUPERSEDED 2026-08-19; see 11 §2.
// The live declaration is:
//   interface PlaceResolver {
//     readonly provider: 'overture' | 'nominatim';       // NOT 'overture-local': place_provider_refs
//     resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult>;   // .provider forbids the hyphen
//   }
// One method, not two: with one input type and one output type, `search` and `resolve` had
// identical signatures. Manual place addition builds a different ResolveQuery, not a second method.
```

`domain` sees only these. Zod-parse every provider response at the boundary (Charter §5). Nothing
outside `integrations/maps` may import `maplibre-gl`; nothing outside `integrations/places` may know
which dataset a place came from except through `SavedPlace.sourceDataset`, which exists solely to
drive attribution.

---

## 9. Map mechanics

### 9.1 Markers, clustering and expected volumes

Expected volumes: typical user 50 places; design ceiling **2 000**; realistic worst case in one
viewport after a "show everything" zoom-out, ~2 000 points.

- **Density clustering of saved places is REMOVED — owner ruling, 2026-08-28.** This supersedes the
  original design in this bullet (`clusterRadius: 50`, `clusterMaxZoom: 13`, `clusterMinPoints: 3`)
  and the behaviour that shipped in `cb58e12`. **The ruling, in the owner's terms:** collapsing
  nearby saved places into a numbered bubble — a pair especially — is wrong for this product. At
  city and local browsing zoom the user must see **the actual place pins**, not a density summary
  hiding them.

  **This overrules the code comment that made the pair-bubble intentional.** `marker-style.ts`'s
  "a cluster of two is a slightly bigger sibling of a pin, not a different species" was a considered
  choice, and it is now the wrong one. It is recorded here so nobody re-derives it from the comment
  and reinstates the behaviour; the comment goes with the code.

  **What survives, and it is a different idea.** At **very low / world zoom only**, summarise the
  library **geographically by country** — a marker per country carrying a **flag emoji and the
  saved-place count** (🇯🇵 24, 🇮🇹 13), in the spirit of the world-level summary observed on mio
  (`evidence/product/competitor-pass-2026-08-28.md` §F: at world zoom mio renders no pins at all,
  only flag bubbles with counts). Zooming into a country or a city then shows **individual pins** —
  never density clusters at any zoom. This is a *summary of the library*, not a *summary of density*,
  and the distinction is the whole ruling: country grouping is a fact about the user's library that
  survives zooming; a two-point bubble is an artefact of pixel proximity.

  **These are two separate pieces of work and are sized separately** — removing local clustering is
  the small, safe half, and the country summary is a new view that must not be smuggled in with it.
  See `execution-plan.md` for where each sits. Do not build a general clustering system for this.

  **Retained finding — `clusterMinPoints` is VERIFIED available**, and is now moot for a second
  reason (checked 2026-08-28, `D2-CLUSTER-MINPOINTS`; kept because it also corrected our MapLibre
  version). The repo depends on `maplibre-gl` **6.4.1**, not the v5 this section was written
  against. `clusterMinPoints` is in the shipped style spec
  (`@maplibre/maplibre-gl-style-spec` 26.2.1, `src/reference/v8.json`), on the public source type
  (`maplibre-gl/dist/maplibre-gl.d.ts`), and genuinely wired to supercluster at runtime —
  `maplibre-gl/src/source/geojson_source.ts:227`: `minPoints: Math.max(2, options.clusterMinPoints
  || 2)` — as far back as v1.15.2. The `clusterRadius: 40` fallback was never needed. **None of it
  is needed now either:** the answer is not a higher `minPoints`, it is no density clustering.
  `clusterRadius: 46` (`CLUSTER_RADIUS_PX`) never had a recorded reason and now never needs one.

  **The 2 000-place ceiling is answered — it is not the risk. Legibility is** (sized 2026-08-28,
  `D2-CLUSTER-REMOVAL-SIZING`).

  > **Confirmed by measurement when the removal was built** (`L1-F5-T5`, 2026-08-28). The sizing
  > below was reasoning from the style spec; these are numbers from our real modules
  > (`buildPinImages`, `pinLayerLayout`, `pinLayerPaint`, `toPlaceFeatures`) bundled with the
  > repo's own Vite against the real CARTO style, 2 000 synthetic saves clumped around six city
  > centres — harder for symbol placement than a uniform spread — over a scripted `easeTo` z12 → z4:
  >
  > | places | labels | median frame | p95 | ~fps |
  > |---|---|---|---|---|
  > | 31 (today) | gated | 17.0 ms | 42.5 | 59 |
  > | 1 000 | gated | 17.5 | 48.5 | 57 |
  > | **2 000 (ceiling)** | **gated** | **19.0** | **60.5** | **53** |
  > | **2 000** | **forced ON** | **34.0** | 55.1 | **29** |
  > | 5 000 | gated | 22.3 | 48.8 | 45 |
  >
  > Icons cost 2 ms of median frame time going from 31 to 2 000, and 3.1 ms/frame over the basemap
  > alone. Forcing the label gate open at the same 2 000 halves the frame rate. So the honest
  > ceiling is **at least 2 000 with headroom to 5 000, conditional entirely on
  > `LABEL_MIN_ZOOM = 14`** — now pinned by a test asserting the exact `text-field` step
  > expression, so the thing doing the work cannot be removed quietly. Two secondary results were
  > non-results, which is itself the finding: a pan at z15 and one-off symbol layout are both flat
  > across 31, 500 and 2 000 places, so that cost is tile fetch and the rasteriser, not our pins.

  - **Icons are fine.** The pin layer already sets `icon-allow-overlap` and `icon-ignore-placement`,
    and MapLibre's collision index short-circuits entirely under `'always'` overlap
    (`symbol/collision_index.ts`), so clustering was never protecting us from a collision blow-up —
    collision is already off. 2 000 icons is one batched quad pass.
  - **Labels cannot bite at world zoom, because they do not exist there.** `place-marker-layer.tsx`
    sets `'text-field': ['step', ['zoom'], '', LABEL_MIN_ZOOM, ['get','name']]` with
    `LABEL_MIN_ZOOM = 14`, and symbol layout runs per tile at the tile's zoom — so tiles below z14
    shape **zero glyphs**. The "show everything" zoom-out is an icons-only case. Forcing 2 000
    labels on did quadruple frame time in the harness, which is why the z14 gate matters, but no
    code path reaches it. *Benchmark caveat: run on a software rasteriser (SwiftShader), so the
    numbers are an upper bound and a relative ranking, not phone frame times. Not measured on a
    real device.*
  - **The real consequence is visual, and it is a sequencing fact rather than a reason to keep
    clustering.** With overlap allowed, zooming out to the world with a few hundred places renders a
    solid mat of overlapping teardrops carrying no information — **worse than the bubbles that ship
    today at that zoom.** So the removal and the country summary are not independent queue items:
    the country summary is what repairs world zoom, and it should land soon after the removal rather
    than whenever L2 comes round.

  **One trap for whoever does the removal.** `src/domain/places/clusters.ts` (`clusterByProximity`,
  ~50 km) is a *different thing* and survives: it anchors the camera and names the active area, and
  never drew a bubble. `tests/unit/places/clusters.test.ts`, `area-label.test.ts` and
  `active-area.test.ts` belong to it. A grep-and-delete on "cluster" would take out the areas
  feature.
- **Custom pins are sprite images in a `symbol` layer, not DOM markers.** This is the single most
  important mobile-performance decision: every `Marker` is an absolutely-positioned DOM node that
  the browser must re-transform on every frame of every pan. Hard rule: **at most two DOM markers
  ever exist** — the user's location and the currently selected place. Everything else is GPU-drawn.
- Three layers: `clusters` (circle, radius stepped 16/22/28 at 10/50 points), `cluster-count`
  (symbol), `places-unclustered` (symbol with our pin sprite, `icon-allow-overlap: true`).
- Selection is a feature-state / filter change, never a re-render of the source.
- **Data loading:** below ~2 000 places, fetch the user's entire place set once (50 places ≈ 5 KB of
  JSON) and keep it client-side. Bounds-based querying is deferred until it is needed — which
  supports the Database agent's D6 instinct that a bounding-box filter beats PostGIS at our scale.

### 9.2 Camera choreography

- Post-import, one new place: `flyTo` zoom 16, `duration: 1200`, `curve: 1.42`, `essential: false`.
- Post-import, N new places: `fitBounds` with `maxZoom: 15` and 48 px padding.
- ~~Cluster tap: `getClusterExpansionZoom` → `easeTo`, 400 ms.~~ **Retired with density clustering
  (§9.1, `L1-F5-T5`, built 2026-08-28).** There is no cluster to tap; a tap is always a tap on a
  place.
- **All camera calls carry `padding: { bottom: sheetHeight }`** so the target never lands under the
  bottom sheet. This is the detail that separates a polished map from an irritating one.
- `prefers-reduced-motion` → every `flyTo`/`easeTo` degrades to `jumpTo`. Charter §6.
- Camera state (`center`, `zoom`) is restored between sessions from `localStorage`; a returning user
  should never be dumped back at zoom 2.

### 9.3 Geolocation and "near me"

- **Never `watchPosition` in V1.** One-shot `getCurrentPosition` on an explicit "Near me" tap only —
  never on page load. Purpose-limited consent, per R8.
- `navigator.permissions.query({ name: 'geolocation' })` first, so we can render an accurate state
  ("Enable location" vs "Blocked in browser settings") instead of firing a cold prompt.
- Options: `{ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }`. Fixes older than
  5 minutes are discarded and re-requested.
- **Accuracy honesty.** Render the accuracy circle. If `coords.accuracy > 200` m — normal indoors,
  and the IP-fallback case can be kilometres — label the result "approximate area" and suppress
  precise distance labels; ordering by distance is still fine, claiming "120 m away" is not. Round
  displayed distances to the accuracy: <500 m → "5 min walk", not "412 m".
- Failure states are designed, not thrown: `PERMISSION_DENIED` → fall back to map-centre ordering;
  `POSITION_UNAVAILABLE` / `TIMEOUT` → "couldn't get your location" + retry, with the list still
  usable ordered by map centre.
- **"Near me" ranking is computed entirely client-side** (haversine over the already-loaded place
  set). Consequences: it works offline-ish, it is instant, and — the point — **the live position is
  never transmitted to our server and never persisted anywhere**. This costs us nothing because we
  already hold the user's places in memory. R8 is satisfied by architecture, not by policy.
- Secure context only; geolocation requires HTTPS, which Vercel gives us.

---

## 10. The top-2 tradeoff, recorded

**Chosen:** MapLibre + Protomaps + self-hosted Overture/FSQ-OS resolver.
**Runner-up:** Google Maps JS API + Google Places API (New), storing only `place_id` and refreshing
coordinates monthly.

The runner-up is almost certainly **more accurate** and needs no ingest pipeline, no region scoping
and no alias-joining work. We reject it because it buys accuracy with (a) a Google-branded basemap,
which forfeits Charter §6's premise that the map style is the brand, (b) a permanent monthly
refresh job whose failure silently makes us non-compliant with §5.4, and (c) a mandatory billing
account on a student's card.

**What would make us switch:**

- If the OSM-alias join fails to lift Tel Aviv above ~11/14, the coverage gap is a product defect in
  a target city and buying accuracy becomes correct. In that case we switch **both** layers together
  to all-Google — never Google Places on a MapLibre map, which is forbidden.
- If ingest + region scoping is still not working two weeks before the deadline, fall back to
  Nominatim-only (63% measured, ODbL-clean, $0, zero infrastructure) with the manual-search path
  carrying the difference. Lower quality, but shippable and legal.
- If the project ever becomes commercial, re-read Protomaps' non-commercial cap ($14/mo sponsor, or
  self-host `.pmtiles`) — a known, priced, ~1-day change.

**What would *not* make us switch:** Mapbox Search or Foursquare's API being more accurate. Neither
can be paired with permanent storage of a name and coordinates, so accuracy is moot.

---

## 11. Licensing and privacy questions for Security-Privacy

**Status — D2 sign-off, split 2026-08-18.** These seven were originally one undifferentiated gate on
all of D2, which is why they blocked MS5 as a block. They are now carried individually, because only
two of them ever touched the ingest design, and only one of those applies to what MS5 actually
ships:

| Q | Subject | Status | Gates MS5? |
|---|---|---|---|
| 1 | Apache-2.0 NOTICE sufficiency | **ANSWERED** — see below | was the only real gate; now closed |
| 2 | ODbL contamination boundary | **ANSWERED 2026-08-27 for the bulk OSM alias-ingest path** (see below); the Nominatim query path is drafted and awaits the owner's own act | **No.** No MS5 row is ODbL-derived |
| 3–7 | Retention, location privacy, consent copy, rate limits, tile keys | OPEN | No — none can change a schema holding only Overture rows |

**Ownership, resolved.** `security.md` §3 item 5 listed the owner as maps-geospatial while
`implementation-plan.md` §4 listed Security-Privacy, and the effect was that nobody answered them.
The split is: **Security-Privacy rules**, maps-geospatial supplies the evidence and implements the
consequence. Both documents now say so.

**These are the project's compliance position, recorded with its reasoning — not legal advice.**

1. **Attribution as a compliance surface. — ANSWERED 2026-08-18.** The question was whether
   reproducing the Foursquare NOTICE on `/attributions` plus a repo `NOTICE` file satisfies
   Apache-2.0 §4(d) for a hosted app that redistributes filtered rows through its own API. Answer:
   **yes, and it is answered by performing the acts rather than by opinion**, because §4 is a list of
   conditions to *do*, not a standard to argue. Concretely, we owe four things and the first is
   already delivered:
   - a repo `NOTICE` file carrying the Foursquare notice verbatim, the CDLA-Permissive-2.0 and
     Apache-2.0 positions, and an explicit statement that we modified the data (we filter to
     food-and-drink categories and re-index it) — **delivered 2026-08-18**, ship-blocker §3.2 item 4;
   - a verbatim copy of the Apache-2.0 licence text at `LICENSES/Apache-2.0.txt` — §4(a). Owed by
     MS5, and it must be copied from apache.org, never retyped;
   - the `/attributions` page reproducing all of the above — owed by the milestone that first
     renders a place (MS10); tracked there, not here;
   - `source_dataset` on every stored row so a place card can credit its own dataset — owed by
     migration 0010 in MS5.

   The reason this does not block the ingest: nothing about running the extract changes based on the
   answer. Attribution obligations attach to *display and redistribution*, and both come later.

2. **ODbL contamination boundary. — NARROWED 2026-08-18; ANSWERED 2026-08-27 for the alias-ingest path (see the ruling at the end of this item). Does not gate MS5.** The original question
   assumed the `places` table would hold ODbL-derived rows from day one. It will not. ODbL can enter
   this system by exactly two paths, and **neither is in MS5**:
   - the **OSM alias join** (§7.1a), explicitly out of MS5 scope (see `implementation-plan.md` MS5);
   - the **Nominatim fallback**, which is MS7 at the earliest.

   What MS5 ingests is the Overture `places` theme only: CDLA-Permissive-2.0 with Apache-2.0 for
   Foursquare-sourced rows, **no share-alike** (VERIFIED, docs.overturemaps.org/attribution, §3.1).
   The narrowing is therefore not a promise but an enforceable property, and MS5 enforces it: the
   POI index constrains `source_dataset` to the Overture value, so an ODbL row cannot be written into
   it without a migration that changes the constraint — which is the point at which this question has
   to be answered rather than deferred.

   **Re-opens when:** the first PR that adds an OSM-derived alias, a Nominatim write path, or a
   second `source_dataset` value. The substantive question is unchanged and still owed then: whether
   a mixed table plus a public API constitutes distributing a derivative *database* or only Produced
   Works. Our position remains that it is the latter; it is untested and must be ruled on before the
   code merges, not after.

   **RE-OPENED 2026-08-20, exactly as written above.** D2b ([`mvp-plan.md`](mvp-plan.md) §11) makes
   the Nominatim write path part of the MVP core rather than an MS7 fallback, so the second of the two
   named paths is now imminent: `mvp-plan.md` L0 **step 2b** is the PR this clause was waiting for. The
   sign-off is owed **before that step merges**, and it is owed as an answer to the substantive
   question, not as a restatement of the position. What has already been built in anticipation and
   should be read as evidence rather than argument: `places.source_dataset` / `source_dataset_id` carry
   per-row provenance and `resolve_place()` writes them (`0014`), so a mixed table is *auditable* row
   by row; `poi_index.source_dataset` still constrains to the Overture value, so ODbL cannot enter the
   *index* without a visible migration; and attribution is already mandatory and already shipped for
   the basemap. Owner: `security-privacy`.

   ---

   **ANSWERED 2026-08-27, for the path that was actually about to be built — task `OSM-ODBL-1`.**
   Full sign-off, with every quotation fetched rather than recalled and the raw captures alongside
   it: [`evidence/licensing/odbl-osm-alias-ingest-2026-08-27.md`](evidence/licensing/odbl-osm-alias-ingest-2026-08-27.md).
   The Nominatim *query* path is a separate question with a different answer, drafted in
   [`evidence/licensing/odbl-06-q2-draft-answer.md`](evidence/licensing/odbl-06-q2-draft-answer.md)
   and still owing the owner's own deliberate-decision act; that draft **must not** be cited as
   clearing the ingest path.

   **Verdict: permitted, but only if we publish the joined index — and not recommended at the
   benefit it currently buys.** Joining OSM `name:en` / `name:he` into `poi_index.alt_names` makes
   `poi_index` a **Derivative Database** under ODbL 1.0 §4.4. It is not a Collective Database and it
   is not a Produced Work.

   **The reasoning, in four lines, each from a board-endorsed OSMF guideline rather than a summary.**
   The extract is Substantial: the *Substantial - Guideline* names "the systematic extraction of all
   eating places within an area" as its own example of systematic, and the plan is 2,742 named
   food-and-drink POIs over a metro bbox. The *Collective Database Guideline*'s final worked example
   is our plan almost verbatim — "complement your list with the corresponding data from
   OpenStreetMap … would not be covered by this guideline" — and warns that *our* data in the
   combined database is what becomes exposed. The *Horizontal Map Layers - Guideline* lists "you add
   restaurants … based on comparison with OpenStreetMap data" under **do** need to share. And the
   *Trivial Transformations - Guideline*'s carve-out is conditioned on "no other source of data is
   involved" — Overture is involved by construction.

   **This retires §11's own long-held position, which was wrong in its framing.** The argument that
   a public API is not distribution is true and irrelevant: ODbL's "Convey" does exclude "interaction
   with a user through a computer network", but share-alike's trigger is **Publicly Use**, and
   §4.4(c) says in terms that "a Derivative Database is Publicly Used … if a Produced Work created
   from the Derivative Database is Publicly Used". Serving the map to one signed-up stranger is the
   trigger. §4.5(c) is what saves local and owner-only use: internal use is not public, so the join
   can be **built and measured** before anything is owed.

   **Scope, since the deferral asked exactly this.** Share-alike reaches **`poi_index`, every row of
   every joined region** — the Overture rows too, not only the alias column, because once the
   "eating places" Feature Type in a regional cut draws on both sources the Horizontal Layers rule
   applies to the whole Feature Type. It does **not** reach `places`, `saved_places`, `sources` or
   `imports`, but only because `confirm/route.ts` writes `altNames: []`; that line stops being an
   optimisation and becomes a licence boundary needing a test. Publishing the Overture half is
   possible — CDLA-Permissive-2.0 §2.1 permits sharing modified Data with the agreement text
   attached — so the obligation is ~10,462 rows of public data, a README and a stable URL.

   **The enforcement this section relied on does not work, and that is measured, not argued.**
   `0010`'s comment calls the `source_dataset` CHECK "the enforcement of `06` §11 Q2", on the
   reasoning that "an ODbL-derived row cannot enter without a migration that changes this
   constraint". Verified by attack on the local container, 2026-08-27, inside a rolled-back
   transaction: `update poi_index set alt_names = array[…] where source_dataset='overture-places'`
   returns **UPDATE 1** with no error. The alias join adds ODbL *content* without adding an ODbL
   *row*, so the tripwire never fires. `NOTICE` §2 rests on the same false assumption. Both need
   fixing in the same migration as any alias work — condition C3.

   **Seven merge-blocking conditions if it goes ahead**, stated in full in the sign-off §6: publish
   the joined index under ODbL free over the internet (C1); carry the CDLA/Apache/Foursquare texts
   with it (C2); per-row alias provenance plus an `inventory.sql` assertion (C3); containment — no
   OSM string outside `poi_index`, which also means dropping `altNames` from
   `StoredResolvedPlaceSchema` and the probe response, since today it is cached per user in
   `extractions.candidates` and returned to the browser (C4); attribution on our own surfaces, with
   literal strings in the sign-off §7 (C5); a whitelisted ingest that never uses Overpass `out meta`
   — measured, it returns contributor `uid`/`user`, which is third-party personal data we have no
   basis to hold (C6); and no change to `poi_index`'s authority, which stays `service_role`-only
   (C7).

   **Why "not recommended" is separate from "not permitted".** The headline "OSM is 81%
   Latin-reachable against Overture's 38%" is a fact about OSM's own 2,742 rows. The number that
   governs the decision is the one measured on the join itself: **43% join rate, 423 Hebrew-only rows
   gained**, against **6,699** Hebrew-named rows in the index. A permanent obligation over the whole
   index for 4% of the gap is the wrong trade while a licence-free option addresses the other 96%.
   Recommended order: **bilingual query expansion first** (the extractor emits both script forms;
   the measured 47% transliteration recall fails mostly on *translations*, which is what an LLM is
   good at, and it folds into the existing call so it costs nothing against the 500/day ceiling),
   then **lazy per-miss alias caching** from individual geocoding results — clean under the Geocoding
   Guideline's insubstantial-extract safe harbour so long as it stays user-driven and non-systematic
   — and the bulk join only if both are measured and found wanting.

   **What is the owner's, not `security-privacy`'s.** Condition C1 is a commitment, not a task:
   becoming an ODbL data publisher in the owner's name, for as long as the product is public.
   `working-agreement.md` §7 makes that an owner decision. It is ordinary and it is cheap; it is
   still not an agent's to make.

   **Nothing is in breach today.** `alt_names` is empty in every environment (verified: 0 of 10,462
   rows), no OSM string has ever entered `poi_index`, the committed Overpass captures are 5 and 11
   elements with no contributor metadata, and §4.5(c) means the private measurements already taken
   owed nothing when they were taken.

   **Re-opens when:** the join is re-proposed with a materially better join rate; any code writes an
   OSM-derived string outside `poi_index`; `poi_index` gains a policy, a browser-role grant or a
   `SECURITY DEFINER` reader; a bilingual autocomplete over `poi_index` is proposed; or a CC0 alias
   source (Wikidata) is measured.

3. **Data-retention for place rows.** *(OPEN — does not gate MS5.)* Charter invariant 3 says the source URL survives forever. Does
   "forever" survive a user deletion request — does deleting a user delete shared `places` rows that
   other users also reference? Our position: shared rows survive, the user's link to them does not.
   Confirm against the retention policy and RLS design with the Database agent (D5).
4. **Location privacy.** *(OPEN — does not gate MS5.)* Confirm the §9.3 position is sufficient: no `watchPosition`, no server
   transmission of the live fix, no persistence, no coordinates in analytics or logs, and no
   third-party script on the map page that could read them. We also want a ruling on whether the
   accuracy circle radius counts as personal data in a screenshot/support context.
5. **Consent copy.** *(OPEN — does not gate MS5.)* The browser permission prompt is not our consent surface. We need approved copy
   for the pre-prompt explaining purpose and scope ("to sort your saved places by distance; your
   location is never stored or sent to us").
6. **Rate limits (D11).** *(OPEN — does not gate MS5.)* We propose 7 lookups/import (`MAX_CANDIDATES = 7`), 30 imports/user/day, 20 searches/min/user,
   200 Nominatim/day project-wide. Confirm these are enforced server-side with the user id as the
   key, not client-side.
7. **Public token exposure.** *(OPEN — does not gate MS5.)* Protomaps/MapTiler-style tile keys are public by design. Confirm the
   referrer-restriction plan and that a leaked tile key is an acceptable, bounded risk given the
   free-tier cap halts rather than bills.

---

## 12. What to tell the examiner

We treated the provider choice as a licensing problem first and an accuracy problem second, because
the product's core promise — *your saved places stay on your map forever* — is exactly what the
major places APIs forbid. Google's Maps Platform terms let us keep a `place_id` indefinitely but
require cached coordinates to be deleted within 30 days (§5.4), and forbid showing Places results on
anything but a Google map (§5.3). Mapbox will sell us permanently storable geocodes, but only if
that storage is "an ancillary or incidental feature" and only with a separate paid request per end
user (§2.7.3) — which is the opposite of a shared place library. Foursquare's API lets us cache its
ID and nothing else. So the accurate-and-forbidden options were eliminated on legal grounds, and the
real question became: is openly-licensed POI data good enough, and can we write a good enough
matcher on top of it?

We measured that rather than guessing. We built a 44-case benchmark of real venues in Tokyo, Tel
Aviv and London — deliberately weighted toward small independents, chains with many branches,
misspellings, Hebrew and Japanese names, and three captions that name no venue at all — and ran it.
OpenStreetMap's own search engines scored 63% and 68% top-1 and returned nothing at all for every
misspelling. The Overture/Foursquare open dataset with our own scoring function scored 85%, and,
more importantly, made **zero** false automatic matches: every multi-branch venue and every
no-venue caption was routed to the user for confirmation instead of being silently saved. That
behaviour comes from one idea worth defending — we do not trust the top score, we trust the *gap*
between the top two scores, because a high score with a small gap means "right restaurant, wrong
branch", which only a human can settle.

For the map itself we chose MapLibre GL JS with Protomaps tiles: an open renderer, an open tile
source, and map styles released under CC0, which means the visual identity of the map is genuinely
ours rather than a vendor's brand with our colours applied. It also needs no credit card anywhere,
which removes an entire class of risk from a student project. Both the renderer and the resolver sit
behind interfaces we defined, so if our judgement about Tel Aviv coverage turns out to be wrong, we
can swap providers without touching the product. We know exactly what we gave up: Google would very
likely resolve places more accurately. We gave that up on purpose, for the ability to keep our
users' data and to own how our map looks.
