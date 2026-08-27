Raw third-party response samples land here (see docs/02-risks-and-unknowns.md).

## places/ — D2 place-resolution benchmark (2026-08-18)
44-case benchmark spec, raw Nominatim/Photon/Overture responses, Overpass coverage probes and the
hand adjudication behind every accuracy number in `docs/06-map-and-places-decision.md`.
See `places/README.md`. No numbers exist for Google/Mapbox/Foursquare APIs — no keys.

## licensing/ — verbatim third-party terms excerpts
`mapbox-product-terms-2026-07-excerpt.txt` — §1.4 attribution, §2.7 Geocoding/POI restrictions,
§2.8 Mapping API caching + Qualified Renderer.

## capture/ — OPP-CAPTURE, the 0→20 adoption cliff (2026-08-27)
Whether any VERIFIED mechanism shortens the path from zero saved places to ~20. TikTok's own data
export and its Data Portability API, Web Share Target on iOS, multi-link batch economics, and the
rejected alternatives. See `capture/README.md`. Investigation only — no production code written.

Also under `capture/raw/`: `08-instagram-oembed-tokenless-2026-08-27.txt`, a live re-probe that
**corrects the reason behind our Instagram UNAVAILABLE label**. Meta opened `instagram_oembed`
tokenless around 2026-06-15, so "needs an app token plus App Review" is stale. The label itself is
unchanged, for a better reason: the response carries no `title`, no `author_name` and no
`thumbnail_url`, and stripping the returned `html` leaves five visible words — "View this post on
Instagram". **The blocker is payload, not authentication**, and no amount of platform paperwork
fixes it. Re-verified independently on 2026-08-27: a bogus shortcode answers HTTP 400
`Media Not Found`, not an auth error, with no credentials sent.

## competitor research — deliberately NOT in this repository
Owner ruling, 2026-08-27. The raw crawl of a competitor's site, client bundle, store listings and
reviews is working material rather than a project artefact, and one of the sites' `robots.txt` asks
agents not to fetch it — some of it was fetched before that was read, which is recorded where the
material is kept. It therefore lives outside version control in `docs/evidence/.local/`
(gitignored), on the machine that gathered it. **The findings that survived review are in
`docs/current-state.md` §5** — this note exists so a reader who expects an evidence directory here
knows it was a decision and not an omission.
