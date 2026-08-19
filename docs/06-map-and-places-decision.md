# D2 — Map rendering + place resolution decision

> Owner: Maps / Geospatial. Status: **ACCEPTED. Security-Privacy sign-off taken 2026-08-18** by
> splitting §11 rather than answering it as a block — Q1 answered, Q2 narrowed and deferred to the
> first milestone that writes an ODbL-derived row, Q3–Q7 open but non-blocking. The schema this
> decision implies is designed in [`10-poi-index.md`](10-poi-index.md).
> Evidence: [`evidence/places/`](evidence/places/), [`evidence/licensing/`](evidence/licensing/).
> Every third-party claim below is labelled VERIFIED / ASSUMED / UNAVAILABLE per Charter §9.

## 0. The recommendation in one block

| Layer | Choice |
|---|---|
| Map rendering | **MapLibre GL JS v5** (BSD-3), wrapped by `@vis.gl/react-maplibre` |
| Basemap tiles | **Protomaps hosted tile API**, style forked from the CC0 Protomaps basemap styles; escape hatch = self-hosted `.pmtiles` on object storage |
| Place resolution | **Our own resolver over an openly-licensed POI dataset** — Overture Maps `places` theme (CDLA-Permissive-2.0 / Apache-2.0, Foursquare-sourced rows), loaded as per-city extracts into Postgres |
| Out-of-region fallback | **Nominatim**, hard-capped and cached, ODbL-attributed |
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
| no_match | 3 | — | 3 misses (2 absent from the dataset, 1 mis-ranked) |

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
4. **Dataset noise.** Overture places is business-registry-grade: the Tel Aviv extract is 43%
   lawyers, estate agents and "professional services". We filter to food-and-drink categories at
   ingest, which is also what keeps the extract at 14–35% of raw size.
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

- **One GeoJSON source with `cluster: true`.** `clusterRadius: 50`, `clusterMaxZoom: 13` (so at
  neighbourhood zoom every place is individual), `clusterMinPoints: 3` (a lone pair of places should
  not become a bubble). `clusterMinPoints` is ASSUMED available in MapLibre v5 from the style spec;
  verify on first spike, and if absent, accept `clusterRadius: 40` instead.
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
- Cluster tap: `getClusterExpansionZoom` → `easeTo`, 400 ms.
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
| 2 | ODbL contamination boundary | **NARROWED and DEFERRED** — see below | **No.** No MS5 row is ODbL-derived |
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

2. **ODbL contamination boundary. — NARROWED 2026-08-18; does not gate MS5.** The original question
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
