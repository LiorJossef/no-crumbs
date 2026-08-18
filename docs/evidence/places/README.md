# D2 place-resolution benchmark — evidence

Run date: 2026-08-18. Owner: maps-geospatial.

| File | What it is |
|---|---|
| `benchmark-spec.json` | The reusable 44-case benchmark (41 positive + 3 negative). Provider-agnostic. Run this against any new candidate. |
| `run-benchmark-osm.py` | Runner for the two keyless OSM search engines (Nominatim, Photon). `python3 run-benchmark-osm.py .` |
| `raw-osm.json` / `results-osm.csv` | Raw top-5 responses + flat CSV, both engines, all 44 cases. |
| `overpass-coverage.sh` / `.json`, `overpass-coverage-tlv.sh` / `.json` | Overpass name-regex probes that separate "absent from OSM" from "OSM search could not find it". |
| `ingest-overture-city-extract.py` | DuckDB + httpfs extract of the Overture `places` theme for a city bbox, straight from the public S3 release. Measured: Tel Aviv 21 s, London 7 s, Tokyo 24 s. |
| `resolve-overture-naive.py` / `raw-overture.json` | Baseline: jaro-winkler on the whole string. Shows why whole-string similarity is not enough. |
| `resolve-overture-scored.py` / `raw-overture-scored.json` | The proposed scoring function (whole-string + distinctive-token coverage + extra-token penalty + category agreement), with per-candidate score, name_score, token_cov and top1-top2 margin. |
| `probe-overture-coverage.py` | Direct dataset probes used to classify ABSENT vs MISS_RANK. |
| `measure-extract-size.py` | Row counts and food-and-drink share per city extract, for the storage cost model. |
| `adjudication.json` | Hand verdicts per provider per case, plus the verdict key and notes. Source of every accuracy number in `docs/06-map-and-places-decision.md`. |

## Not covered here, and why

Google Places API (New) Text Search, Mapbox Search Box / Geocoding v6 and the Foursquare
Places API all require a credentialed account. No keys existed at run time, so **no numbers were
produced for them and none are quoted anywhere as measured**. Their rows in the decision doc are
labelled ASSUMED, from documentation only. To complete the comparison, add a sibling runner
(`run-benchmark-<provider>.py`) that emits the same `raw-*.json` shape and re-run `adjudication`.

## Reproduce

```
python3 -m venv venv && ./venv/bin/pip install duckdb
python3 run-benchmark-osm.py .                    # ~90 s, respects Nominatim 1 req/s
./venv/bin/python ingest-overture-city-extract.py  # ~1 min, ~50 MB of parquet
./venv/bin/python resolve-overture-scored.py
```
