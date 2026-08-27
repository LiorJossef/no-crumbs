<!-- DRAFT additions for `docs/security.md`. Written by security-privacy 2026-08-27, task L0-F3-T1.
     NOT applied by its author: agent-guardrails.md §4 item 15 forbids this agent from editing
     `docs/security.md`. The orchestrator lands it. Two parts: a new §2.7, and edits to §3/§4. -->

## PART 1 — new section, insert after §2.6

## 2.7. Ruling: the Nominatim outbound path — **CLEARED, with seven conditions**

> Answers `06` §11 Q2 (owed item 5) and gates `L0-F3`. The licensing half of the analysis lives in
> `06` §11 item 2; this section is the security and privacy half. Evidence, with every quotation
> fetched rather than recalled: `evidence/licensing/odbl-nominatim-2026-08-27.md`.

### What changes when the adapter merges

A second outbound request path appears, distinct from the TikTok fetch that owed item 3 (SSRF)
covers. On every import, for each extracted candidate, our **server** sends a venue name and a city
hint to `nominatim.openstreetmap.org`, and writes the response into the global `places` table.
Three properties of that path are load-bearing.

**1. It is server-side, and that is a security property, not an implementation detail.** A
browser-side Nominatim call would (i) expose each end user's IP address and their search terms
directly to a third party, (ii) make the ≤1 req/s project-wide cap unenforceable, since the limit is
per application and not per user, and (iii) breach the usage policy's client-side clause. **No
`NEXT_PUBLIC_` Nominatim variable may exist.** Enforced by review of the diff and by the existing
layer-guard: the adapter lives in `src/integrations/`, which no client component may import.

**2. What we send is minimised by rule.** VERIFIED, Nominatim usage policy, *Privacy*: "Please do
not submit personal data or other confidential material to any of our services." The request may
carry **only** the normalised candidate name and the city / country hint. It must never carry the
caption text, the TikTok URL, a user id or email, or the user's live position as a `viewbox` /
`lat` / `lon` bias — `06` §9.3's "the live fix never leaves the device" would otherwise be broken by
a geocoder parameter. `ResolveQuery.near` exists for the local `poi_index` prefilter and **must not
be forwarded to Nominatim**.

**3. The candidate string is attacker-influenced text on an outbound URL.** It is LLM output derived
from a TikTok caption, which anyone can write. Minimum handling, all of which belong in the diff:
the host comes from `NOMINATIM_BASE_URL` and is never taken from the candidate; `q` is the only
interpolated parameter and is `encodeURIComponent`-ed; the string is length-capped at 200 characters
(matching `places.name`'s CHECK) and rejected rather than truncated above it; the response is parsed
through Zod before any field is read, and is treated as data, never as instruction. Timeout and
response-size caps as for any outbound call.

### The seven merge conditions

Repeated from `06` §11 item 2(e) so this file stands alone; that section is authoritative.

1. Server-side only; no `NEXT_PUBLIC_` Nominatim variable. *(veto item)*
2. `NOMINATIM_BASE_URL` and `NOMINATIM_CONTACT` from the environment, read per request — the policy
   requires that we can be switched to another service without a software update.
3. A non-stock `User-Agent` identifying the application, built from those variables. A project role
   address, never a personal one and never an end user's.
4. Query parameters limited to `q`, `format=jsonv2`, `limit`, `addressdetails=1`, optionally
   `countrycodes` / `accept-language`. **No `extratags`, no `namedetails`, no `polygon_*`** —
   `extratags=1` was measured returning opening hours, website, cuisine and payment methods.
5. `resolve_place(p_provider_payload => null)` for `osm-nominatim` rows.
6. `providerPlaceId` = `osm_type` + `osm_id`, never Nominatim's instance-local `place_id`.
7. ≤1 req/s sequential global queue, ≤200/day project-wide, enforced server-side; **no scheduled or
   periodic re-resolution** — the policy classifies periodic app requests as bulk geocoding.

Plus one that is not code: the **owner** must land the `06` §11 Q2 sign-off personally. The usage
policy now requires that "the application developer has made a deliberate, informed decision to use
it and is directly responsible for complying with this policy", and explicitly names LLM-generated
and low-code-generated integrations. In a repo built the way this one is, that clause is pointed at
us, and an agent's assent does not satisfy it.

### Condition 5 closes §2.6's open thread

§2.6 recorded that `provider_payload` is "not a launch blocker on its own — but … would become a
launch blocker the moment a payload holds provider content we are not licensed to redistribute (R3,
`06` §11 is still open)." `06` §11 is now closed and the answer is condition 5: for ODbL rows the
payload is never written. Two things were re-verified on the local container on 2026-08-27, against
`supabase_db_P-002`, read-only:

- `set local role authenticated; select provider_payload from public.places limit 1;` →
  `ERROR: permission denied for table places`. Unchanged since `0012`.
- The full `SELECT` grant held by `authenticated` on `places` is exactly thirteen columns:
  `address_line, category, country_code, id, last_verified_at, lat, lng, locality, name,
  provider_category, region, resolution_score, source_dataset`.

So even a future adapter that wrongly wrote a payload could not ship it to a browser. That is
defence in depth, not permission: condition 5 still stands, because the row is retained for ever and
the licence question is about what we *hold*, not only about what we serve.

### Accepted and documented, not fixed

The OSMF can observe the aggregate stream of venue names this project resolves, and the times it
does so. The calls originate from our server, so no end-user IP or identity is exposed and no single
query is user-attributable. At university-project scale this is an acceptable residual, recorded
rather than mitigated. It would need revisiting only if the product ever resolved on a schedule
(which condition 7 forbids anyway) or from the client (which condition 1 forbids).

`places` gains no personal data from this path: an ODbL row holds a venue name, coordinates, an
address and a provenance mark. §1's ruling that the self-granting `places_select_if_saved` gate
reaches nothing user-attributable is unaffected, and no RLS policy, grant or `SECURITY DEFINER`
surface changes. **This task produced no migration and no policy change to review.**

## PART 2 — edits to the existing §3 table

Replace row 5 with:

| 5 | ~~The 7 licensing/privacy questions in `06-map-and-places-decision.md` §11~~ — **SPLIT 2026-08-18.** Q1 (Apache-2.0 NOTICE) **ANSWERED**; `LICENSES/Apache-2.0.txt` + `/attributions` still owed. Q2 (ODbL share-alike) **ANSWERED 2026-08-27, see §2.7 and `06` §11 item 2** — cleared with seven conditions; the `places` table is a collection of insubstantial geocoding extracts, neither a Derivative Database nor a Produced Work, so share-alike does not attach. Q3 (retention) is unaffected by the ODbL answer and stays open as a privacy question. Q4–Q7 remain open | `06` §11 |

Add a row:

| 13 | Whether a hosted OSM geocoder (LocationIQ / Geoapify) actually offers the ODbL storage rights `06` §0 claims for it. Currently **ASSUMED**, with no evidence file. Owed **before** any switch of `NOMINATIM_BASE_URL`, not after | `06` §0 |

Amend row 3 (SSRF) to note that there are now **two** user-influenced outbound paths — the TikTok
URL fetch and the Nominatim query string — and that they need separate treatment: the first is a
host-validation problem, the second a parameter-injection and data-minimisation problem (§2.7).

## PART 3 — additions to §4 "Already true by design"

- The Nominatim geocoder is called **server-side only**; its base URL and contact are environment
  variables, never `NEXT_PUBLIC_`, so no end-user IP or search term reaches the OSMF directly.
- The user's live position is never forwarded to a geocoder as a bias parameter; `ResolveQuery.near`
  serves the local index only.
- Raw geocoder responses are not persisted for ODbL-sourced rows, and `provider_payload` is
  unreadable by `authenticated` regardless (re-verified 2026-08-27).
