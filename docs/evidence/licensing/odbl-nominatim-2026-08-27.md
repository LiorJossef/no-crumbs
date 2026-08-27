<!-- DRAFT — lands at `docs/evidence/licensing/odbl-nominatim-2026-08-27.md`.
     Written by security-privacy, 2026-08-27, task L0-F3-T1. Not committed by its author. -->

# ODbL and the Nominatim usage policy — evidence for `06` §11 Q2

Every source below was **fetched on 2026-08-27**, not recalled. Raw captures are in
`raw/` alongside this file. Labels are per Charter §9.

## Sources fetched

| # | Source | URL | Status |
|---|---|---|---|
| S1 | Open Database License (ODbL) v1.0, full text | `https://opendatacommons.org/licenses/odbl/1-0/` | HTTP 200 |
| S2 | OSMF *Geocoding - Guideline* (board-endorsed 2017-08-24) | `https://osmfoundation.org/wiki/Licence/Community_Guidelines/Geocoding_-_Guideline` | HTTP 200 |
| S3 | OSMF *Substantial - Guideline* (board-endorsed 2014-06-06) | `https://osmfoundation.org/wiki/Licence/Community_Guidelines/Substantial_-_Guideline` | HTTP 200 |
| S4 | OSMF *Attribution Guidelines* | `https://osmfoundation.org/wiki/Licence/Attribution_Guidelines` | HTTP 200 |
| S5 | Nominatim Usage Policy | `https://operations.osmfoundation.org/policies/nominatim/` | HTTP 200 |
| S6 | OSM copyright page | `https://www.openstreetmap.org/copyright` | HTTP 200 |
| S7 | CARTO Positron style JSON | `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json` | HTTP 200 |
| S8 | CARTO TileJSON (the style's `carto` source) | `https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json` | HTTP 200 |
| S9 | One live Nominatim search (`q=Prufrock Coffee London`, `extratags=1`) | `https://nominatim.openstreetmap.org/search` | HTTP 200 |

S9 was a single request, sent with a non-stock User-Agent identifying it as a one-off licence
evaluation, well inside the ≤1 req/s policy limit and inside `agent-guardrails.md` §6 item 22's
10-live-calls-per-task ceiling.

## Claims, labelled

| Claim | Label | Evidence |
|---|---|---|
| Individual geocoding results are **insubstantial database extracts** — not a Derivative Database, and the Produced Work framing was considered and rejected by the OSMF | **VERIFIED** | S2, "The Guideline" and the FAQ answer "Can you explain how the guideline handles attribution, and why?" |
| Geocoding results **may be stored permanently** alongside our own data without a share-alike impact | **VERIFIED** | S2: "Geocoding Results may be stored (either permanently or temporarily) together with the external data used for querying"; "they may be stored and used together with other proprietary or third party data without having a share-alike impact on such other data" |
| The safe harbour is conditional on the collection holding "only names, addresses, and/or latitude/longitude information" and not being a systematic aggregation of a feature type over a city-sized area | **VERIFIED** | S2, "A collection of Geocoding Results is not a substantial extract of the OSM database provided…" |
| Geocoding against a *modified* OSM database triggers share-alike on that database | **VERIFIED** | S2: "If Geocoding is performed using a Derivative Database … Publicly Using the Geocoder will trigger share-alike obligations on the Derivative Database" |
| A non-systematic personal collection is insubstantial; the guideline's own example is a personal map of restaurants you have visited | **VERIFIED** | S3: "More that 100 Features only if the extraction is non-systematic and clearly based on your own qualitative criteria for example an extract of all the locations of restaurants you have visited for a personal map to share with friends" |
| The application incorporating a geocoder must credit OpenStreetMap; the results themselves need not carry attribution | **VERIFIED** | S4, "Geocoding (search)" |
| Attribution may collapse on map interaction, but must be visible without interaction first and findable afterwards | **VERIFIED** | S4, "Interactive maps": collapse permitted "automatically on map interaction such as panning, clicking, or zooming"; "the user must still be able to find the licence information if they look for it" |
| Attribution must make clear the data is under ODbL, e.g. by linking `OpenStreetMap` to `openstreetmap.org/copyright` | **VERIFIED** | S4, "Attribution text" |
| "Convey" excludes interaction with a user over a network, so serving a web app is not distributing the database — **but** share-alike's trigger is *Publicly Use*, not Convey, and §4.4(c)/§4.6 reach Produced Works made from a Derivative Database | **VERIFIED** | S1 §1.0 ("Convey"), §4.2, §4.4(c), §4.6. Note: the "we only run a service" argument is weaker than commonly assumed; the insubstantial-extract argument is what does the work |
| Nominatim: absolute maximum 1 request per second; valid non-stock User-Agent required; attribution required | **VERIFIED** | S5, "Requirements" |
| Nominatim: results **must be cached** — caching is required, not restricted | **VERIFIED** | S5, "Bulk Geocoding": "Results must be cached on your side. Clients sending repeatedly the same query may be classified as faulty and blocked." Also "If at all possible, set up a proxy and also enable caching of requests" |
| Nominatim: user-triggered use by an app with a moderate user count is explicitly OK | **VERIFIED** | S5, "Websites and Apps" |
| Nominatim: **periodic** requests from apps count as bulk geocoding and are strongly discouraged | **VERIFIED** | S5, "Websites and Apps" |
| Nominatim: **autocomplete is forbidden** — "you must not implement such a service on the client side using the API" | **VERIFIED** | S5, "Unacceptable Use" |
| Nominatim: an app must be switchable to another service "without requiring a software update" | **VERIFIED** | S5, "Websites and Apps" |
| Nominatim: use is permitted only where "the application developer has made a deliberate, informed decision to use it and is directly responsible for complying with this policy"; LLM- and low-code-generated integrations are called out by name | **VERIFIED** | S5, "Usage in LLMs" |
| The usage policy applies **only** to `nominatim.openstreetmap.org`, not to a self-hosted instance | **VERIFIED** | S5, first line |
| A Nominatim response with `extratags=1` carries data far beyond names/addresses/coordinates | **VERIFIED, measured** | S9 returned `opening_hours`, `website`, `cuisine`, `takeaway`, `payment:*`, `check_date`. Top-level keys: `address, addresstype, boundingbox, category, display_name, extratags, importance, lat, licence, lon, name, osm_id, osm_type, place_id, place_rank, type` |
| Every Nominatim response carries its own licence string | **VERIFIED, measured** | S9: `licence: "Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright"` |
| CARTO's tiles supply `© CARTO, © OpenStreetMap contributors` to MapLibre automatically | **VERIFIED, measured** | S8 returns `attribution` containing both credits with links. S7's style itself has no `attribution` field — its single source is a TileJSON URL, which is why `06` §2.1's "style JSON self-attributes: VERIFIED, no" row reads as a gap when it is not |
| CARTO's OSM link points at `openstreetmap.org/about/`, not `/copyright` | **VERIFIED, measured** | S8. The licence is reachable in one further hop (S6 is linked from `/about`), but the inherited line does not itself name the ODbL — one reason the geocoder credit must live in our own `/attributions` rather than being treated as discharged by the basemap |
| MapLibre `AttributionControl({compact:true})` renders expanded on first paint and minimises only on `drag` | **VERIFIED, read from source** | `node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs`, `_updateCompact` adds `maplibregl-compact-show`; `onAdd` binds `_updateCompactMinimize` to the map's `drag` event only |
| `authenticated` cannot read `places.provider_payload`; the column grant is thirteen columns | **VERIFIED, measured on the local container** | `supabase_db_P-002`, 2026-08-27, read-only: `set local role authenticated; select provider_payload from public.places limit 1;` → `ERROR: permission denied for table places`. Grant list from `information_schema.column_privileges` |
| LocationIQ / Geoapify offer "same data, same ODbL storage rights, a real ToS" (`06` §0) | **ASSUMED — no evidence** | No ToS was fetched for either provider. Must be verified before any switch |
| Our product's primary function is not geocoding, so S5's "Applications and services whose primary function is related to geocoding must run their own service" does not bite | **ASSUMED, with reasoning** | A judgement about our product, not a fact about theirs. Geocoding is an internal step in a save-places-from-social-video flow; no geocoding result is exposed through a general-purpose endpoint. Depends on the resolve endpoint staying authenticated, per-user rate-limited and import-scoped |
