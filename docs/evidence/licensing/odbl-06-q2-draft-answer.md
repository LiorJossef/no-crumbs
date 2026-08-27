<!-- DRAFT — replaces the whole of item 2 in `docs/06-map-and-places-decision.md` §11.
     Written by security-privacy, 2026-08-27, task L0-F3-T1. Not committed by its author. -->

2. **ODbL contamination boundary. — ANSWERED 2026-08-27. The Nominatim adapter is CLEARED TO
   MERGE, subject to the seven conditions in (e).**

   > This is the project's compliance position, recorded with its reasoning and its sources. It is
   > not legal advice and its author is not a lawyer. Where the answer rests on a judgement the
   > owner must make rather than on a text that can be quoted, (g) says so and frames the choice.

   ### (a) The question was a false dichotomy, and that is the answer

   §11 Q2 has asked since 2026-08-18 "whether a mixed table plus a public API constitutes
   distributing a derivative *database* or only Produced Works", and recorded "our position remains
   that it is the latter". **Our position was wrong in its framing, and the correct answer is a
   third category that is better for us than either.**

   VERIFIED — OSMF Licence/Community Guidelines, *Geocoding - Guideline*, endorsed by the OSMF
   board 2017-08-24 (fetched 2026-08-27, `evidence/licensing/odbl-nominatim-2026-08-27.md`):

   > "Individual Geocoding Results are insubstantial database extracts: Individual Geocoding
   > Results that are based on a Direct Hit contain an insubstantial amount of raw OSM data;
   > Individual Geocoding Results that are based on an Indirect Hit contain no raw OSM data at all"

   and, on the Produced Work reading specifically, the same guideline's FAQ rejects it by name:

   > "The alternative approach to attribution, which we previously considered, was declaring all
   > geocoding results or collections of geocoding results to be Produced Works. […] Declaring all
   > geocoding results or collections of geocoding results to be Produced Works sits uneasily with
   > the text of the ODbL, however."

   So `places` is **neither a Derivative Database nor a Produced Work**. It is a collection of
   insubstantial extracts, and ODbL §4.4's share-alike does not reach it. The *rendered map with a
   user's pins on it* is a Produced Work (ODbL §4.3 notice applies — see (c)); the *table* is not.
   Keeping those two apart is what makes the attribution answer in (c) clean instead of muddled.

   ### (b) It depends on three things, and we fall on the safe side of all three

   The guideline's protection is conditional. Name the conditions, because they are properties of
   our code and can be broken by a future commit:

   | # | Condition (VERIFIED, Geocoding Guideline) | Where we stand |
   |---|---|---|
   | X1 | "only names, addresses, and/or latitude/longitude information are included in the Geocoding Results" | **Inside, by construction of the port.** `ResolvedPlace` (`src/domain/types.ts`) carries name, altNames, addressLine, locality, lat, lng, provider id, plus our own derived fields. One wrinkle: `providerCategory`. See (d) |
   | X2 | "the collection is not a systematic attempt to aggregate all or substantially all Primary Features of a given type … within a geographic area city-sized or larger", and is not "used as a general purpose geodatabase" | **Decisively inside.** A row is created only when a human confirms one candidate extracted from one TikTok they personally pasted. `06` §5 models ~5 000 places *lifetime, worldwide*, of which only the out-of-Overture-region subset is ODbL-derived |
   | X3 | Geocoding is performed against the **unmodified** OSM database, not against a Derivative Database — "If Geocoding is performed using a Derivative Database … then Publicly Using the Geocoder will trigger share-alike obligations on the Derivative Database" | **Inside.** We call the public Nominatim. We hold no copy of OSM. `poi_index` is Overture (CDLA/Apache-2.0), constrained by migration `0010` to `source_dataset = 'overture-places'`, and is a different dataset in a different table. **This is the condition self-hosting would change — see (f)** |

   X2 has a second, independent source. VERIFIED — OSMF *Substantial - Guideline* (endorsed
   2014-06-06) treats as insubstantial:

   > "More that 100 Features only if the extraction is non-systematic and clearly based on your own
   > qualitative criteria for example **an extract of all the locations of restaurants you have
   > visited for a personal map to share with friends** …"

   That is a description of this product. We therefore sit inside two independent safe harbours,
   which is why (d)'s wrinkle is a recommendation rather than a blocker.

   ### (c) What it obliges us to do — attribution, and it is TWO obligations, not one

   VERIFIED — OSMF *Attribution Guidelines*, "Geocoding (search)":

   > "Geocoders that use OpenStreetMap data must credit OpenStreetMap. **Applications that
   > incorporate such a geocoder must credit OpenStreetMap.** A group of geocoding results need not
   > maintain attribution attached to the results, as long as it does not form a Derivative
   > Database."

   **The basemap obligation (§2) and the geocoder obligation are distinct obligations that today
   share one carrier, and the carrier is not ours.** VERIFIED 2026-08-27 by fetching
   `https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json`: it returns
   `attribution: "© CARTO, © OpenStreetMap contributors"`, which MapLibre's `AttributionControl`
   renders for us. That line disappears the moment CARTO changes its TileJSON **or** the renderer
   moves to Google as `06` §3.3 contemplates — and the Nominatim rows in `places` would outlive it.
   **Rule: the ODbL geocoder credit is owned by our own code and by `/attributions`. The map-corner
   line is CARTO's and must never be counted as the geocoder's discharge.**

   Concretely, enough for `design-system-frontend` to build without a follow-up question:

   | Surface | Required? | What must be there |
   |---|---|---|
   | **Map corner** | Yes (basemap, §2) | `© CARTO © OpenStreetMap contributors`, links live. Supplied today by CARTO's TileJSON through MapLibre `AttributionControl({compact:true})`. **Nothing to build.** VERIFIED against `maplibre-gl` v5's `_updateCompact`: with `compact:true` the control is added with `maplibregl-compact-show` (expanded on first paint) and only minimises on the map's `drag` event, leaving a persistent ⓘ — inside the Attribution Guidelines' collapse safe harbour ("automatically on map interaction such as panning, clicking, or zooming"; must stay findable afterwards). What is owed is a **test**, not a component: assert a rendered map contains the literal `OpenStreetMap`, so a CARTO change fails CI instead of silently dropping the credit |
   | **`/attributions`** | **Yes — this is the geocoder credit's home** | A "Place data" section, in addition to the existing Overture/Foursquare section: *"Place search and coordinates outside our loaded regions are provided by **Nominatim**, which uses **OpenStreetMap** data. Data © OpenStreetMap contributors, available under the **Open Database License (ODbL) 1.0**."* Links: `OpenStreetMap` → `https://www.openstreetmap.org/copyright`; `Open Database License` → `https://opendatacommons.org/licenses/odbl/1-0/`; `Nominatim` → `https://nominatim.openstreetmap.org/`. Reachable from a persistent link (footer / settings / about), at most one tap from the map, and **not only** from inside the collapsed map control |
   | **Place-detail sheet** | **Not required** for an ODbL row (third bullet above) — keep it as a product choice | For `source_dataset = 'osm-nominatim'`: one line of small secondary text, always visible in the sheet, never behind a disclosure: `Location from OpenStreetMap (ODbL)`, linking to `/attributions`. `source_dataset` is already client-readable (migration `0015`). This surface is *required anyway* for Overture rows by Apache-2.0, so it is one component with a `source_dataset` switch, not two |
   | **Import review screen** | Not strictly required; **do it** | The screen shows OSM-derived coordinates before they are places. One line at the foot of the candidate list: `Locations from OpenStreetMap (ODbL)` → `/attributions`. Cheap, and provenance is exactly what helps a user judge a candidate |
   | **Database rows** | **No** | Attribution need not be stored in or attached to the rows |

   Amends §3.2 item 2, which implied a per-row licence notice is mandatory for every dataset. For
   ODbL rows it is not; for Apache-2.0 Overture rows it is. Also amends §2.1's table row "Does the
   style JSON self-attribute? **VERIFIED, no**" — stale since 2026-08-26; the *style* has no
   `attribution` field but its TileJSON source does, which is why `map-surface.mapcn.tsx` correctly
   passes no `customAttribution`.

   ### (d) Where the "store forever" premise needs a correction

   `CLAUDE.md`'s MVP boundary says "info" is name · category · coordinates · source link · user
   note, "which is exactly what open data lets us store forever." Checked rather than assumed:

   - **Source link and user note** — ours. ODbL does not reach them.
   - **Name, coordinates, address, locality — yes, permanently, and this is stated outright.**
     VERIFIED, Geocoding Guideline: "Geocoding Results may be stored (either permanently or
     temporarily) together with the external data used for querying", and "they may be stored and
     used together with other proprietary or third party data without having a share-alike impact
     on such other data". Unlike Google (§3, 30-day delete) and Mapbox (§3, per-end-user request),
     there is **no refresh treadmill**. The premise holds, and it is the reason §1's conclusion
     survives contact with the ODbL half of the resolver.
   - **Category is the exception.** X1 enumerates "names, addresses, and/or latitude/longitude" and
     a feature-type tag is none of the three. This does **not** make us non-compliant — X2 carries
     us independently (see (b)) — but the charter sentence is true without qualification only for
     the Overture half.

     **Correction, and it costs nothing to take:** `places.category` is *our* normalised vocabulary
     (`11-resolver-vocabulary.md`), derived by us, and stays. For `osm-nominatim` rows, **do not
     persist OSM's `class`/`type` verbatim into `places.provider_category`** — pass `null`. The
     scorer may still read `ResolvedPlace.providerCategory` in memory to compute `categoryScore`;
     that is Using, which is unrestricted. Only persistence is at issue. With that one line, every
     stored OSM-derived field is literally inside X1 and the safe harbour holds on its own terms.
     Recommended, not merge-blocking.

   ### (e) Conditions on the merge

   **Merge-blocking for L0-F3** — these are properties of the adapter's code, checkable in the diff:

   1. **Server-side only.** No `NEXT_PUBLIC_` Nominatim variable, no call from the browser. A
      client-side call would put the end user's IP in front of a third party, make the ≤1 rps cap
      unenforceable, and violate the policy's client-side clause. *(security-privacy veto item.)*
   2. **`NOMINATIM_BASE_URL` and `NOMINATIM_CONTACT` come from the environment, read per request.**
      The policy requires that we can be switched off "without requiring a software update".
   3. **Non-stock `User-Agent` on every request**, built from those variables. Use a project role
      address, never a personal one and never an end user's — it reaches a third party on every
      call, and it must not be hard-coded into a public repo.
   4. **Query parameters limited to** `q`, `format=jsonv2`, `limit`, `addressdetails=1`, and
      optionally `countrycodes` / `accept-language`. **No `extratags`, no `namedetails`, no
      `polygon_*`.** VERIFIED 2026-08-27 by one live request: `extratags=1` returned opening hours,
      website, cuisine, payment methods and a `check_date` — data well outside X1 and outside the
      MVP boundary's five fields.
   5. **`resolve_place(p_provider_payload => null)` for `osm-nominatim` rows.** The raw response is
      never persisted. This also closes `security.md` §2.6's open thread ("it would become a launch
      blocker the moment a payload holds provider content we are not licensed to redistribute").
   6. **`providerPlaceId` = `osm_type` + `osm_id`** (e.g. `node/123456789`), never Nominatim's
      `place_id`, which is an instance-local row id that changes on reimport.
   7. **≤1 req/s global sequential queue and ≤200/day project-wide, enforced server-side, and no
      periodic re-resolution.** VERIFIED policy: "periodic requests from apps are considered bulk
      geocoding and as such are strongly discouraged." Nothing scheduled may sweep
      `places.last_verified_at` against Nominatim.

   **Launch-blocking, not merge-blocking** — before anyone but the owner uses the app:

   8. `/attributions` ships with the "Place data" section in (c), linked from a persistent surface.
   9. The map-attribution test in (c) exists.

   **Must be true before the manual-search surface (capability 13) ships** — flagged now because it
   is the single most likely accidental violation in the plan as written:

   10. **Manual search / autocomplete must never route to public Nominatim.** VERIFIED, Unacceptable
       Use: "Auto-complete search. This is not yet supported by Nominatim and you must not implement
       such a service on the client side using the API." §6.4 already specifies a 300 ms debounce
       and ≤20/min/user for manual search without naming a provider. Manual search may serve from
       `poi_index` only. Outside a loaded region it returns "no local index for this area" plus
       pin-drop, or a **single submit-triggered** query — never keystroke-debounced.

   **Recommended, cheap, not blocking:** (d)'s `provider_category = null`, and the per-place credit
   line in (c).

   **The owner's own act:** VERIFIED policy, added since this question was first deferred — "Code
   generated by LLMs must adhere to all terms laid out in this policy. The public Nominatim API
   must not be built into, offered through, suggested by, or automatically generated by no-code,
   low-code, or vibe-coding platforms … Use of the public API is only permitted where the
   application developer has made a **deliberate, informed decision** to use it and is **directly
   responsible** for complying with this policy." Given how this repo is built, that clause is
   pointed at us. It is satisfied by the owner reading and landing this sign-off — not by an
   agent's assent, and not delegable.

   ### (f) Self-hosting, and whether it changes any answer

   - **The usage policy stops applying entirely.** VERIFIED, first line: "This is an Acceptable Use
     Policy for the server running at nominatim.openstreetmap.org and **does not apply to nominatim
     services run by yourself or other organisations**." The 1 rps cap, the autocomplete ban, the
     bulk-geocoding rules, the User-Agent requirement and the switchability requirement all
     evaporate — conditions 1–4, 7 and 10 above become our own engineering choices.
   - **The ODbL answers for stored results do not change.** Individual results remain insubstantial
     extracts; attribution in (c) is unchanged.
   - **But X3 flips, and that is the cost.** Self-hosting means loading an OSM extract or planet
     into our own database. That copy *is* a substantial part of the OSM database. Publicly Using a
     geocoder over a *modified* copy triggers share-alike on that copy (guideline, quoted in (b));
     an unmodified copy avoids the Derivative Database label but still carries ODbL §4.2's notice
     conditions if it is ever Publicly Conveyed. Either way we acquire obligations over a dataset we
     do not have today, and a planet import is ~1 TB — disproportionate for this project.
   - **The realistic escape hatch stays the one §0 already names**: a hosted OSM geocoder with a
     real ToS (LocationIQ / Geoapify), reachable by changing `NOMINATIM_BASE_URL`. §0's claim that
     they offer "same data, same ODbL storage rights, a real ToS" is **ASSUMED, not verified** — no
     evidence file exists for either provider. Verify before switching, not after.

   ### (g) What is the owner's judgement, not mine

   The whole analysis above rests on the OSMF's *Geocoding Guideline*. That is the licensor's own
   foundation's board-endorsed published interpretation of its own licence — it is the strongest
   non-judicial authority available, and it is what the entire OSM ecosystem relies on. It is not a
   court ruling, and the OSMF reserves the right to revise its guidelines.

   - **Option A — rely on it.** Cost: nothing beyond (e). Our use sits inside the guideline's own
     worked examples ("Geocoding store locations", "Searching on a non-OSM map"), and inside the
     Substantial Guideline's worked example of a personal map of restaurants you have visited.
   - **Option B — do not use OSM data.** Cost: the product. §1 established that every credentialed
     places API forbids storing a name and coordinates indefinitely; outside a loaded Overture
     region there is no other openly-licensed global source. `06` §0's D2b would collapse back to
     region-locked coverage.
   - **Recommendation: Option A.** The residual risk is that OSMF later narrows its guidance; the
     remedy then is to re-examine, and nothing we store today becomes unlawful retroactively — the
     guideline's storage permission is explicit and our collection is small, non-systematic and
     user-driven.

   **Q3 (retention) is unaffected**: ODbL permits indefinite storage, so a shared `places` row
   surviving a user deletion raises no licensing question. It remains open as a privacy question.

   **Re-opens when:** we self-host or switch geocoder (X3 and (f)); manual search gains a global
   provider (condition 10); anything begins writing `provider_payload` or scheduled re-resolution
   for OSM rows (conditions 5 and 7); or a future feature starts aggregating places by category
   over an area rather than one user-confirmed venue at a time (X2).
