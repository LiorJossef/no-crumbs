# Google Places — the *persistence* question, not the serving question

> Task `TOS-GATE-1`, security-privacy, 2026-08-28. Blocks the owner's goal of curating ~100 real
> TikToks worldwide and persisting the resulting places — coordinates, canonical provider
> identities and all — **in production**.
>
> **This is the project's compliance position, recorded with its reasoning and its sources. It is
> not legal advice and its author is not a lawyer.** Where the answer turns on a judgement rather
> than on a text that can be quoted, §6 says so and frames the choice for the owner.
>
> **No Google Places API quota was spent.** Nothing in this task made a live provider call. Every
> quotation was fetched from the published terms with `curl` and is reproduced in
> [`raw/`](raw/); the runtime claims were proved against the local Supabase container inside a
> rolled-back transaction ([`google-persistence-probe.manual.sql`](google-persistence-probe.manual.sql)).

## 0. The two things to read first

1. **`06`'s citations are stale, and its substance is not.** Google renumbered the Service Specific
   Terms. Places API is now **§14**, not §5 — §5 is *Distance Matrix API* in the current document
   (last modified **June 10, 2026**). Everywhere the repo says "Service Specific Terms §5.3" it
   means **§14.2**, and "§5.4" means **§14.3**. Both clauses still say what `06` says they say, word
   for word. Affected: `06` §3.1, §3.3, §12, `place-resolver-factory.ts`, `google/place-resolver.ts`,
   migration `0023`'s header and its raised message. **Cosmetic — but a citation nobody can find is
   a citation nobody re-checks**, and this one was already three renumberings out of date.

2. **The 30-day rule is enforced on the cache and not on the record.** `place_lookup_put` refuses a
   Google row with an over-30-day TTL — verified by attack below, it works exactly as advertised.
   But `places` and `extractions.candidates` hold Google names, addresses and coordinates **with no
   TTL, no CHECK and no refresh job**, and `PLACE_RESOLVER` defaults to Google in local, preview
   **and staging**. We are accumulating Google content past 30 days today. See F2 and F3.

---

## 1. Q1 — What may we cache or store, and for how long?

### 1.1 The 30-day reading is still correct

**VERIFIED.** Service Specific Terms, §14 *Places API (Legacy and New)*
(<https://cloud.google.com/maps-platform/terms/maps-service-terms>, last modified 2026-06-10):

> **14.3 Caching.** Customer may temporarily cache latitude and longitude values from the Places
> API for up to 30 consecutive calendar days, after which Customer must delete the cached latitude
> and longitude values.

Unchanged in substance from what `06` §3.1 recorded; only the number moved (§5.4 → §14.3). Migration
`0023`'s reading is therefore still correct.

**Verified by attack, local container, inside a rolled-back transaction:**

| Probe | Result |
|---|---|
| `place_lookup_put(..., 'google', ..., 31 days)` | `ERROR: google responses may be cached for at most 30 days ... got 2678400` |
| `place_lookup_put(..., 'google', ..., null)` | `ERROR: ... got null (forever)` |
| `place_lookup_put(..., 'google', ..., 30 days)` | accepted |
| `place_lookup_put(..., 'overture', ..., null)` | accepted (no cap for open data) |

The gate holds. It is the *only* thing in the system that holds.

### 1.2 What is exempt — `place_id`, and only `place_id`

**VERIFIED.** Service Specific Terms, **A. General Service Terms, §3 (Google ID Caching)**:

> Customer may cache the Google ID values from the Services that return such field and allow
> caching, in accordance with its Documentation. For example, Customer may cache (a) `place_id`
> from Places API, Directions API, Geolocation API and Routes API, (b) `pano_ID`, from Street View
> Static API, and (c) `video_ID` from Aerial View API.

**VERIFIED.** Places documentation, *Place IDs*
(<https://developers.google.com/maps/documentation/places/web-service/place-id>):

> Place IDs are exempt from the caching restrictions stated in Section 3.2.3(b) of the Google Maps
> Platform Terms of Service. You can therefore store place ID values for later use.
>
> Because Place IDs may change due to updates on the Google Maps database, Google recommends
> refreshing place IDs if they are more than 12 months old. You can refresh Place IDs at no charge
> by making a Place Details request, specifying only the `id` field in the `fields` parameter.

So a Google `place_id` **may be persisted indefinitely**, at no cost, with a *recommended* (not
required) 12-month refresh that is free.

### 1.3 `name`, `formatted_address`, `types`, `location` — the answer is NO for all four

This is the part of the question that has never been answered here, and the answer is worse than
"only lat/lng is capped".

**VERIFIED.** Google Maps Platform Terms of Service, §3.2.3
(<https://cloud.google.com/maps-platform/terms>):

> **(a) No Scraping.** Customer will not export, extract, or otherwise scrape Google Maps Content
> for use outside the Services. For example, Customer will not: (i) pre-fetch, index, store,
> reshare, or rehost Google Maps Content outside the services; (ii) bulk download Google Maps tiles,
> Street View images, geocodes, directions, distance matrix results, roads information, places
> information, elevation values, and time zone details; **(iii) copy and save business names,
> addresses, or user reviews**; or (iv) use Google Maps Content with text-to-speech services.
>
> **(b) No Caching.** Customer will not cache Google Maps Content except as expressly permitted
> under the Maps Service Specific Terms.

Read (b) against §14.3. The **only** express caching permission the Service Specific Terms give for
the Places API is latitude and longitude, for 30 days. There is no permission for `displayName`,
`addressComponents`, `formattedAddress`, `primaryType` or anything else. And §3.2.3(a)(iii) names
"copy and save business names, addresses" as an example of the prohibited behaviour.

**That Google knows how to write the carve-out we wanted is the strongest evidence it withheld it
here.** VERIFIED, §6.3.2 — the **Geocoding** API, in the same document:

> **6.3.2** Customer may indefinitely cache latitude (lat), longitude (lng), `formatted_address`,
> and the structured address values from the Geocoding API solely to support the direct, End User
> facing functionality of the Customer Application that initiated the request (e.g., displaying the
> address of a location in a weather application, associating location data with a photograph), only
> where the cache is not used as a replacement for making an additional call to the Services.
> **Cached data must be logically isolated to the specific End User it is associated with and must
> not be used across multiple End Users.**

Two things follow.

1. **Places API has no §6.3.2.** An indefinite-storage carve-out exists in this document, is
   enumerated field by field, and is attached to a different API. Its absence from §14 is
   deliberate drafting, not an oversight to be read around.
2. **Even if we switched to the Geocoding API to get that carve-out, it would not help us.** "Cached
   data must be logically isolated to the specific End User … and must not be used across multiple
   End Users" is a direct contradiction of Charter invariant 4 — one shared `places` row that many
   users' saved places point at. This is the identical shape to the clause that eliminated Mapbox in
   `06` §3 (Product Terms §2.7.3(ii), a separate request per End User). Two vendors, same trap.

### 1.4 The conservative reading, stated as such

**AMBIGUOUS, and I am naming the conservative reading rather than the convenient one.** §3.2.3(a) is
scoped to content "for use outside the Services", and a permissive reading holds that a response
held inside the application that made the request is not "outside" — under which §14.3's 30 days is
the cache window for the whole response, not just for two floats. That is how most of the industry
behaves and it is a defensible reading.

I am not relying on it, and neither should the project, because it is not needed: **every option in
§3 below either lives inside the narrow reading or is unaffected by which reading is right.**

| Field | May we hold it indefinitely? | Authority |
|---|---|---|
| `place_id` / `places.id` | **Yes** | General Service Terms §3; place-id docs, exempt from ToS §3.2.3(b) |
| `location.latitude` / `.longitude` | **No** — ≤30 consecutive calendar days, then delete | SST §14.3 |
| `displayName` (name) | **No.** Narrow reading: not cacheable at all. Broad reading: ≤30 days | ToS §3.2.3(a)(iii), (b); SST §14.3 by omission |
| `formattedAddress` / `addressComponents` | **No.** Same split | as above; contrast SST §6.3.2 |
| `primaryType` / `types` | **No.** Same split | ToS §3.2.3(b); no express permission in SST §14 |
| Anything derived from the above | **No** — see §2.3 on §3.2.3(c) | ToS §3.2.3(c) |

**So the `places` table may not hold a Google-derived coordinate permanently. It must be re-fetched,
or it must not be Google's.**

### 1.5 Which terms document applies

**ASSUMED**, on the face of the document: the non-EEA Service Specific Terms apply. Their own
preamble says "These Service Specific Terms apply to Customers who do not have a billing account
address in the European Economic Area." The Cloud project's billing address is not something I
checked and not something I will guess at; if it is ever set to an EEA country the EEA variant
(<https://cloud.google.com/terms/maps-platform/eea/maps-service-terms>) governs and this whole
document must be re-run against it. Owner-facing, listed in §6.

---

## 2. Q2 — Does storing Google coordinates and pinning them on MapLibre breach the non-Google-map rule?

**Verdict: yes, and the (a)/(b)/(c) split we hoped for does not survive the text. All three are
inside the prohibition, for two independent reasons. "Blocked at the display layer only" is not
available.**

### 2.1 (c) Displaying stored Google coordinates on a MapLibre map — forbidden, unambiguously

**VERIFIED.** SST §14.2:

> **14.2 No use with a non-Google map.** Customer must not use Google Maps Content from the Places
> API in conjunction with a non-Google map.

**VERIFIED.** ToS §3.2.3(e):

> **(e) No Use With Non-Google Maps.** To avoid quality issues and/or brand confusion, Customer will
> not use the Google Maps Core Services **with or near** a non-Google Map in a Customer Application.
> For example, Customer will not (i) **display or use** Places content on a non-Google Map, (ii)
> display Street View imagery and non-Google Maps on the same screen, or (iii) link a Google Map to
> non-Google Maps Content or a non-Google Map.

**VERIFIED.** Places API policies
(<https://developers.google.com/maps/documentation/places/web-service/policies>):

> Places API results displayed on a map must be shown on a Google Map, with proper attribution
> including the Google logo and third-party data providers, if applicable.

Nothing about age or provenance-laundering rescues this. A coordinate that came from Google is
Google Maps Content on the day it is rendered, whether it arrived a second ago or a year ago.

### 2.2 (b) Merely *storing* the result — forbidden independently of display

The interesting question was whether storage is clean while display is dirty. It is not, and the
reason has nothing to do with the map: **§14.3 caps the coordinate at 30 days regardless of whether
anything is ever rendered.** A `places` row holding a Google `lat`/`lng` on day 31 is in breach even
if no one has ever loaded the map. Add §3.2.3(a)(i) — "pre-fetch, index, **store**, reshare, or
rehost Google Maps Content outside the services" — and permanent storage is the thing the clause is
about.

So the shape "resolve and store now, display later" **does not clear**. It swaps a display breach
for a storage breach and adds a timer.

### 2.3 (a) Resolving in local / preview / staging — the ambiguous one, and the conservative call

§3.2.3(e)'s trigger is "use the Google Maps Core Services with or near a non-Google Map **in a
Customer Application**". It is scoped to the *application*, not to the *deployment stage*, and the
verbs are "with **or near**" and "display **or use**". A preview deployment of this product is a
Customer Application containing a MapLibre map that a signed-in user can reach.

**Conservative reading, which is the one I am recording: preview and staging resolution is inside
the prohibition.** Local development and a private benchmark harness are the arguable edge — a
harness that reads a corpus, writes a JSON file and renders no map is not obviously "a Customer
Application", and Google's own §3.2.4 (Benchmarking) contemplates customers testing the Services and
publishing the results. I would defend a *local, non-deployed measurement run*. I would not defend
`NEXT_PUBLIC_STAGE=preview` on a Vercel URL.

**This is a change to what `place-resolver-factory.ts` believes.** Its comment says the gate is
about not serving "a Google-content-on-MapLibre pairing" to a production end user, and treats
`local`/`preview`/`staging` as safe because no end user is served. That premise is narrower than the
clause. The gate is still the right mechanism and it still fails in the right direction; what needs
correcting is the set of stages it trusts and the reason it gives. **I am not touching the file** —
recommendation only, §5 F1.

### 2.4 One derived-content trap worth naming now

**VERIFIED.** ToS §3.2.3(c):

> **(c) No Creating Content From Google Maps Content.** Customer will not create content based on
> Google Maps Content. For example, Customer will not: … **(iv) use latitude/longitude values from
> the Places API as an input for point-in-polygon analysis**; … (vii) use Google Maps Content to
> improve machine learning and artificial intelligence models, including to train, test, validate or
> fine-tune the models.

The world-zoom **country-flag summary** ruled in on 2026-08-28 (`06` §9.1) is point-in-polygon over
stored coordinates. Over Google-derived coordinates it is (c)(iv) verbatim. And (c)(vii) forecloses
using Google answers as labels to tune the extractor prompt or the scorer weights — which is a
plausible next idea after a 15/15 result and would be a breach.

---

## 3. Q3 — Is there a compliant Lean path to the owner's goal?

The goal has three parts, and no option satisfies all three: **(i)** worldwide coverage today,
**(ii)** rows that persist permanently in production, **(iii)** Google-grade accuracy. Pick two.

Baselines, from `google-places-and-transcription-probe-2026-08-28.md` and `06` §4.1: Google 15/15
correct top-1 on the 13 real corpus TikToks, Overture 12/15 on the same, all three Overture misses
being index *coverage* rather than scoring; Overture 85% top-1 on the 44-case benchmark inside a
loaded region, Nominatim 63%; the model's own guess 65–470 m out.

**Measured on the local container just now: `poi_index` holds `tlv` and nothing else — 10,462 rows,
one region.** That single fact is what makes this decision urgent, because "~100 real TikToks
worldwide" is exactly the query Overture cannot answer today.

### Option 1 — Move the renderer to Google Maps and go all-Google

- **Legality: clears §14.2 / §3.2.3(e).** It is the only pairing Google permits.
- **It does not deliver (ii).** §14.3 still caps the coordinate at 30 days. All-Google buys
  permanent `place_id` plus a **permanent monthly refresh obligation** for every stored coordinate.
  `06` §5 costed this already: at 5,000 places that is 5,000 Place Details refreshes a month,
  forever, and a refresh job whose silent failure *is* the breach.
- **Costs beyond the treadmill:** the Charter §6 premise that the map style is the brand; a billing
  account; the Cloud project's Text Search quota is **100/day** and one night of benchmarking
  exhausted it (memory: `p002-google-places-daily-quota`), so this is blocked on an owner action in
  the console before it is blocked on anything else; and §2.4 kills the country-flag summary over
  Google coordinates.
- **Accuracy: best available.** 15/15.
- Footnote worth knowing: **Places UI Kit is the one Google surface explicitly cleared for a
  non-Google map.** VERIFIED, SST §15.1: "Customer may use Places UI Kit in Customer Applications
  with or without any map, including a non-Google Map. This clause will prevail over the No Use with
  Non-Google Maps clause of the Agreement." It is Google-rendered widgets with Google branding, and
  §15.2 keeps the 30-day cap, so it is not a resolver and not a route to permanence. Recorded so
  nobody rediscovers it and mistakes it for a loophole.

### Option 2 — Google identifies the venue, coordinates come from an open source

- **Legality: the conservative answer is no.** §3.2.3(c) "Customer will not create content based on
  Google Maps Content", and §3.2.3(a) "will not export, extract, or otherwise scrape Google Maps
  Content for use outside the Services". A systematic pipeline that uses Google's answer to select
  an open-data row is creating our content from Google's. **AMBIGUOUS** — the human-in-the-loop
  variant already blessed in `06` §3.4 (a hyperlink a person clicks) is genuinely different, because
  no Places API call is made at all. Automating it is not.
- **And it buys almost nothing.** All three Overture misses on the corpus were *coverage* — the row
  is absent from the index. A better identification cannot select a row that does not exist.
- **Reject.**

### Option 3 — Production stays Overture, accept the coverage limit

- **Legality: clean.** Permanent storage, $0, no treadmill (§4).
- **Fails (i) outright.** One region loaded. Outside Tel Aviv every candidate falls to the LLM guess
  (65–470 m out) or to `no_match`. For a curated worldwide batch this is the wrong shape of answer:
  it is not "slightly less accurate", it is "no answer at all".

### Option 4 — Land the drafted ODbL answer and add the global OSM path (the original D2b)

- **Legality: clean, and uniquely so on the point that matters.** VERIFIED, OSMF *Geocoding
  Guideline* (quoted in full in `evidence/licensing/odbl-06-q2-draft-answer.md` §d): "Geocoding
  Results may be stored (either permanently or temporarily) together with the external data used for
  querying". **No refresh treadmill, no per-end-user isolation, no non-OSM-map restriction** — the
  guideline's own worked examples include "Searching on a non-OSM map". This is the only credentialed
  global source that permits what Charter invariant 4 requires.
- **Costs:** 63% top-1 versus Overture's 85% in-region; ≤1 rps and ~200/day on the public instance;
  the seven merge conditions in the drafted answer; and an owner act that is not delegable (§4).
- Better than the LLM guess everywhere Overture is not loaded, which is currently everywhere but
  Tel Aviv.

### Option 5 — Ingest an Overture extract for each city the curated batch actually touches

- The batch is **curated**, so its cities are known before a single row is written. Ingest is a
  committed offline script measured at **7–24 s per city bbox** (`06` §7.3); three cities of food and
  drink are ~45 MB against a 500 MB free tier (`06` §5).
- **Legality: clean. Permanence: unconditional. Accuracy: 85% in-region, 12/15 on the corpus.**
- It is the cheapest thing that satisfies (i) *for this batch* and (ii) *forever*, and it is the only
  option that needs no ruling from anybody.

### Recommendation

**Option 5 now, Option 4 as the tail, Google demoted to local-only measurement.**

Concretely: ingest an Overture extract per city in the curated set before importing it; land the
already-drafted ODbL sign-off so anything outside a loaded region resolves against OSM rather than
against the model's imagination; keep `PLACE_RESOLVER=google` for local benchmarking only, and stop
persisting its output (§5 F2/F3).

Why this and not Option 1: Option 1 is the accurate one, and it still **cannot give the owner what
he actually asked for** — rows that persist. Every path to permanent coordinates runs through open
data. Google's 15/15 against Overture's 12/15 is three coverage misses on thirteen posts; three
missing rows are worth less than a permanent monthly refresh job whose failure mode is a silent
terms breach across the whole library.

If the owner wants Google's accuracy anyway, that is Option 1 and it must be bought as a package —
renderer, resolver, billing, quota raise, refresh job, and dropping the flag-country world view over
Google coordinates. It is a legitimate choice. It is not a smaller one than it looks.

---

## 4. Q4 — The ODbL question that is already owed

**No Nominatim adapter has been built.** Verified: `src/integrations/` contains `google/`, `llm/`,
`places/`, `supabase/`, `tiktok/` — there is no `nominatim` adapter, gateway or client anywhere. The
string appears in `src/` only in the closed type unions (`domain/types.ts` `PlaceProvider`,
`domain/import/resolution-record.ts`), in `integrations/places/lookup-cache.ts`'s per-provider TTL
policy table, and in comments.

**So `06` §11 Q2 is still open for the Nominatim query path, and I am not inventing a ruling.** A
full draft answer exists — `evidence/licensing/odbl-06-q2-draft-answer.md`, written 2026-08-27 —
which clears the adapter subject to seven merge conditions. It is a **draft**: Nominatim's own usage
policy requires that "the application developer has made a **deliberate, informed decision** to use
it and is **directly responsible** for complying with this policy", which is an owner act and not an
agent's assent. Until the owner lands it, the answer does not exist. It must not be cited as
clearing anything, and it must not be cited as clearing the *bulk alias-ingest* path, which is a
different question with a different answer (`odbl-osm-alias-ingest-2026-08-27.md`: permitted but not
recommended, seven conditions of its own).

### What production actually serves, and under what licence

Production serves **Overture `places`**. VERIFIED, <https://docs.overturemaps.org/attribution/>
(page last updated 2026-05-15), Places theme:

> Data from Meta. Available under CDLA Permissive 2.0. · Data from Microsoft … PinMeTo … Krick …
> RenderSEO … DAC … BrightQuery. Available under CDLA Permissive 2.0. · **Data from Foursquare.
> Copyright 2024 Foursquare Labs, Inc. All rights reserved. Available under Apache 2.0.** Foursquare
> data was transformed to the Overture schema. Changed: 2026-03-18. · Data from AllThePlaces.
> Available under CC0 1.0.

**No ODbL source is listed for the Places theme.** The theme that carries "License for theme: ODbL /
© OpenStreetMap contributors" is **Transportation**, not Places. `06` §11 Q2's narrowing — that ODbL
cannot enter through the Overture ingest — is confirmed against the current page.

Obligations, both VERIFIED:

- **CDLA-Permissive-2.0 §2.1** (<https://cdla.dev/permissive-2-0/>): "A Data Recipient may share
  Data, with or without modifications, so long as the Data Recipient makes available the text of
  this agreement with the shared Data." §3.1: "This agreement does not impose any restriction or
  obligations with respect to the use, modification, or sharing of Results."
- **Apache-2.0 §4(d)** for the Foursquare-sourced rows: the NOTICE must be reproduced, together with
  a statement of modification (§4(b)).

### Does the app satisfy them today? Partly.

| Obligation | State |
|---|---|
| Repo `NOTICE` with the Foursquare notice verbatim + modification statement | **Satisfied.** `/NOTICE` exists and is complete and accurate |
| Verbatim `LICENSES/Apache-2.0.txt` (§4(a); `06` §11 Q1 bullet 2) | **Missing.** No `LICENSES/` directory exists |
| `/attributions` page reproducing NOTICE + CDLA text + ODbL text | **Missing.** No route, no page, no persistent link. `06` §11 Q1 said it was owed by "the milestone that first renders a place" — the app renders places today, so this is **overdue** |
| Per-row dataset credit on the place sheet | **Present but thin.** `place-sheet.tsx` renders `Matched via {provenance.sourceDataset}` → the literal slug `overture-places`. No licence, no Foursquare notice, no link, and it is the raw internal identifier rather than a name a person would recognise |

---

## 5. Q5 — Attribution: what must be shown, where, and what we show today

### Basemap — required, and rendered

CARTO's own TileJSON supplies `© CARTO, © OpenStreetMap contributors`, which MapLibre's
`AttributionControl` renders. **Verified by reading the installed dependency** (`maplibre-gl` 6.4.1),
not by assuming:

- `dist/maplibre-gl.css`: `.maplibregl-ctrl-attrib.maplibregl-compact .maplibregl-ctrl-attrib-inner { display: none }`
- `src/ui/control/attribution_control.ts` `_updateCompact()`: the control is created with **both**
  `maplibregl-compact` and `maplibregl-compact-show`, i.e. **expanded on first paint**
- the same file binds `this._map.on('drag', this._updateCompactMinimize)` — it collapses to a
  persistent ⓘ the first time the user pans, and does not re-expand until tapped

`map-surface.mapcn.tsx` passes `attributionControl={{ compact: true }}`, so this is the live
behaviour on every viewport, not only on phones.

**Assessment: acceptable at university scale, documented — not a launch blocker.** The OSMF
Attribution Guidelines permit collapsing "automatically on map interaction such as panning, clicking,
or zooming" provided the credit stays findable, and the ⓘ stays. CARTO's requirement ("credited on
every map") is discharged by a control that is present on every map. What is genuinely missing is a
**test**: nothing asserts the literal string `OpenStreetMap` is in the rendered map, so the day CARTO
changes its TileJSON the credit vanishes silently and CI stays green. That is a small, cheap gap and
it belongs to `qa-reliability`.

### Dataset — required, and **not** rendered

Nothing user-facing carries the Foursquare NOTICE, the CDLA text or the Apache-2.0 text. `/attributions`
does not exist. `Matched via overture-places` is not a licence notice. **This is the launch-blocking
attribution finding.** The minimum fix is one static page and one persistent link to it, at most one
tap from the map: the Foursquare notice verbatim, the modification statement, the CDLA-Permissive-2.0
text (or a link to it, per §2.1's "makes available"), and — when the ODbL answer lands — the "Place
data" section the drafted answer already specifies word for word.

### If Google ever serves

**VERIFIED**, Places API policies: "When displaying Places API data without a Google Map, you must
include the Google logo, adhering to the provided style guidelines and attribution requirements" and
"You must retrieve and display attributions for place details, photos, and reviews obtained through
the Places API, including author information and links where available." Google Maps logo, minimum
height 16 dp, maximum 19 dp, unmodified, not obscured. And ToS §3.2.2(a)(i): the app's terms of
service must notify users that it includes Google Maps features and content and must link the Google
Maps End User Additional Terms and the Google Privacy Policy — **which we have no terms-of-service
page to put it in.** Add that to the cost of Option 1.

---

## 6. Findings, with severity

Severity is deliberately split. Not everything here is a launch blocker and saying so is the point.

### F1 — `place-resolver-factory.ts` trusts too many stages. **Must fix before any deploy that resolves with Google.**

*What an attacker does:* nothing. Google reads our own preview URL. *What they get:* a
Customer Application containing a MapLibre map that has made Places API calls, which §3.2.3(e)
prohibits without reference to who was served (§2.3). *Minimum fix:* drop `preview` and `staging`
from `NON_PRODUCTION_STAGES`, leaving `local` and `test`, and rewrite the comment's premise from
"no end user is being served" to "this application contains a non-Google map, so the prohibition is
on the application". Handed to `nextjs-architect` via the orchestrator; **I have not touched the
file.**

### F2 — `places` persists Google coordinates forever. **Must fix before the curated batch. This is the veto item.**

*Verified by attack*, local container, rolled-back transaction:

```
select public.resolve_place(..., p_provider => 'google',
                            p_source_dataset => 'google-places', ...);
-- id | name | lat | lng | source_dataset | source_dataset_id | last_verified_at
-- b7f27534-… | Probe Cafe TOS-GATE-1 | 32.0668 | 34.7749 | google-places | ChIJ_… | (null)
```

`places` has six CHECK constraints and **none of them mentions `source_dataset`**; `lat` and `lng`
are `not null`; there is no expiry column, no `expires_at`, no sweep, and no refresh job anywhere in
the repo. `last_verified_at` exists and is null. So a Google coordinate written today is still there
in a year. That is §14.3, breached by construction, and it is precisely the shape of the owner's
goal.

*Minimum fix, and it is a choice between two:* either (i) `places` never receives
`source_dataset = 'google-places'` — the Google adapter contributes a `place_provider_refs` alias
(the `place_id`, which is permitted forever) while the coordinate comes from an open source; or
(ii) a scheduled job deletes or refreshes any `google-places` row older than 30 days, and its failure
is alarmed. (i) is architecture, (ii) is a treadmill. Recommend (i). **`supabase-database` owns the
migration; I have written none.**

### F3 — `extractions.candidates` persists the whole Google shortlist forever, with no TTL at all. **Must fix, same batch.**

`extractions` has **no `expires_at` column** — verified against the live schema; the 24-hour expiry
lives on `imports`, not here. `StoredResolvedPlaceSchema` persists, per candidate, up to five ranked
places each carrying `name`, `addressLine`, `locality`, `lat`, `lng`, `providerCategory` and
`providerPlaceId`. On the Google path that is a permanent per-user copy of Places content — the
`place_lookups` cap is enforced beside a store that has no cap. *Minimum fix:* the same choice as F2;
if Google rows are ever persisted here, the row needs an expiry and a sweep.

### F4 — `/attributions` does not exist. **Launch blocker (not a batch blocker).**

Apache-2.0 §4(d), CDLA-Permissive-2.0 §2.1, and `06` §11 Q1's own third bullet, which said this was
owed by the milestone that first renders a place. Places render. *Minimum fix:* one static page plus
a persistent link; `LICENSES/Apache-2.0.txt` copied from apache.org, never retyped.
`design-system-frontend` owns the page.

### F5 — Stale ToS citations throughout. **Acceptable, fix opportunistically.**

§5.3 → §14.2, §5.4 → §14.3 in `06` §3.1/§3.3/§12, `place-resolver-factory.ts`,
`google/place-resolver.ts`, and migration `0023`'s comment and its `raise` message. No behaviour
changes. The migration's message is user-visible in a stack trace, so it is the one worth correcting
first.

### F6 — No test pins the map's OSM credit. **Acceptable at our scale, documented.**

If CARTO changes its TileJSON `attribution` field, the credit disappears and nothing fails. One
assertion on rendered output closes it. `qa-reliability`.

### F7 — The country-flag world view and Google coordinates are incompatible. **Note now, decide later.**

ToS §3.2.3(c)(iv) names point-in-polygon over Places lat/lng as prohibited derived content. Only
bites under Option 1. Recorded so the two rulings of 2026-08-28 are not discovered to conflict
halfway through building the view.

---

## 7. What is the owner's decision, not an engineer's

1. **Which of Options 1/4/5 the ~100-TikTok batch runs on.** This is a product-accuracy versus
   data-permanence trade with a real cost on both sides, and §3 recommends but cannot decide it.
2. **Whether to land the drafted ODbL sign-off** (`odbl-06-q2-draft-answer.md`). Nominatim's usage
   policy requires a "deliberate, informed decision" by the developer, "directly responsible" for
   compliance. Not delegable to an agent, by the text of the policy itself.
3. **Only if Option 1 is chosen:** raising the Text Search quota above 100/day in the Cloud console,
   accepting a billing account, accepting the permanent monthly refresh job, and accepting a
   Google-branded basemap against Charter §6.
4. **Confirm the Cloud billing account address is outside the EEA** (§1.5). If it is inside, the EEA
   Service Specific Terms govern and this document must be re-run.
5. **Not a decision, a heads-up:** F2 and F3 mean the local and staging databases hold Google content
   older than 30 days today. Small volume, non-public, and it stops the moment F1–F3 land — but it is
   real and it is written down rather than quietly cleaned up.
