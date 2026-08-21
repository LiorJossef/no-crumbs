# CARTO basemap licensing — evidence note (2026-08-21)

Context: D2 (`docs/06-map-and-places-decision.md` §2) is being reopened. The owner has ruled out
Protomaps entirely and asked for CARTO's basemap tiles to be evaluated as the tile provider behind
MapLibre/mapcn, for this project's actual scale (a personal/course MVP, real users, low traffic —
not a demo, not high-volume commercial).

Sources fetched 2026-08-21:
- https://docs.carto.com/faqs/carto-basemaps (CARTO's own FAQ doc, fetched directly)
- https://carto.com/attribution/ (CARTO's attribution policy page, fetched directly)
- https://carto.com/basemaps (CARTO's basemaps product page, fetched directly)
- https://basemaps.cartocdn.com/gl/positron-gl-style/style.json (the live style JSON mapcn's
  default points at, fetched directly to inspect the `sources[].attribution` field)

## Findings

**VERIFIED** (docs.carto.com/faqs/carto-basemaps, fetched 2026-08-21): the vector basemap styles —
Positron, Dark Matter, Voyager, served from `basemaps.cartocdn.com` — currently work **without an
API key**; the "API key required" watermark only affects the *raster* basemap endpoints, not the
vector GL styles mapcn uses. An API key is recommended by CARTO "for future compatibility" but is
not required today for this endpoint/style pairing.

**VERIFIED** (same source): there is a free tier with a fair-use ceiling of **5,000,000 tile
requests per calendar month**, obtainable with no CARTO account and no upfront declaration of
commercial vs non-commercial status. CARTO's own framing: "there is a free tier, and it is
generous." Our projected mobile-web usage (a course MVP with a small number of real users) is
several orders of magnitude below this ceiling.

**VERIFIED** (same source): "above the fair use limit, we will normally get in touch rather than
cut anyone off" for non-commercial projects; commercial use that grows past the threshold may
require a paid commercial agreement. There is no evidence of a hard block, credit-card gate, or
immediate cutoff at our scale — this removes the R7-class "bill spike" risk that a metered API
(Mapbox tiles, Google Places) would carry.

**ASSUMED** (partially contradicted by a lower-confidence source): an initial AI-summarized web
search suggested "commercial purposes require an Enterprise license" for CARTO basemaps generally.
The directly-fetched FAQ page contradicts this for the *free tier specifically* — it explicitly
says commercial/non-commercial status need not be declared upfront and only exceeding the fair-use
threshold triggers a conversation about a paid plan. We treat the FAQ page (fetched directly) as
authoritative over the search-engine summary, but flag this as ASSUMED rather than VERIFIED because
we did not find CARTO's full Terms of Service text confirming it, and did not test with an actual
paid CARTO account.

**ASSUMED**: the exact attribution string. `carto.com/attribution/` (fetched directly) states only
that "proper attribution is required for every CARTO plan" without spelling out the literal string
for basemaps; the FAQ page states the requirement in substance as "CARTO and OpenStreetMap must be
credited on every map." The commonly published/standard CARTO basemap attribution string (used
across CARTO's own examples and widely mirrored in third-party basemap-style docs) is:

> © [CARTO](https://carto.com/attributions) © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

We adopt this as the ASSUMED-correct string to render, pending CARTO publishing a more specific
basemap-only attribution page.

**VERIFIED** (fetched style JSON directly): the `positron-gl-style/style.json` document mapcn's
default `light` style points at does **not** carry an `attribution` field on its `carto` source, and
the style JSON itself has no top-level attribution metadata either. This means MapLibre's built-in
`AttributionControl` will render **empty** unless we explicitly supply `customAttribution` — CARTO
does not auto-inject the credit into the tiles the way some other keyless raster providers do. The
attribution must be added by us in code, not assumed to appear "for free."

**UNAVAILABLE**: a machine-readable / contractual ToS document (as opposed to marketing FAQ pages)
enumerating exact rate-limit enforcement behaviour, and any SLA. CARTO does not appear to publish a
public ToS page equivalent to Mapbox's Product Terms; the FAQ is the most authoritative public
source found.

## Verdict

CARTO's free vector basemap (Positron/Dark Matter via `basemaps.cartocdn.com`, no key) is
**suitable for this project's scale**: keyless today, a 5M-tiles/month fair-use ceiling that is far
above a course MVP's expected traffic, no credit card, and a dischargeable attribution requirement
(one line, one link, rendered via MapLibre's `AttributionControl` with an explicit
`customAttribution` string since the style JSON carries none itself). This clears the same bar
Protomaps was chosen for in `06` §2 (no card-on-file risk, one attribution line) while removing the
Protomaps-specific blocker (owner veto) and the empty `NEXT_PUBLIC_PROTOMAPS_API_KEY` placeholder
that left both prior implementations unwired.

Residual risk to monitor: the "commercial use past fair-use may require a paid agreement" clause
(ASSUMED strength) — acceptable now, revisit if traffic approaches the 5M/month ceiling.
