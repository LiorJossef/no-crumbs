# D2 place-resolution benchmark — evidence

Run date: 2026-08-18. Owner: maps-geospatial.

| File | What it is |
|---|---|
| `benchmark-spec.json` | The reusable 44-case benchmark (41 positive + 3 negative). Provider-agnostic. Run this against any new candidate. |
| `run-benchmark-osm.py` | Runner for the two keyless OSM search engines (Nominatim, Photon). `python3 run-benchmark-osm.py .` |
| `raw-osm.json` / `results-osm.csv` | Raw top-5 responses + flat CSV, both engines, all 44 cases. |
| `overpass-coverage.sh` / `.json`, `overpass-coverage-tlv.sh` / `.json` | Overpass name-regex probes that separate "absent from OSM" from "OSM search could not find it". |
| `ingest-overture-city-extract.py` | DuckDB + httpfs extract of the Overture `places` theme for a city bbox, straight from the public S3 release. Measured: Tel Aviv 21 s, London 7 s, Tokyo 24 s. **Superseded 2026-08-19 (MS5 task 5)** by [`scripts/ingest-overture-extract.py`](../../../scripts/ingest-overture-extract.py), which pins the release in `scripts/poi-ingest.config.json`, moves the food-and-drink filter into the extract and emits a manifest. Kept unchanged because it is what the 44-case numbers were measured with. |
| `resolve-overture-naive.py` / `raw-overture.json` | Baseline: jaro-winkler on the whole string. Shows why whole-string similarity is not enough. |
| `resolve-overture-scored.py` / `raw-overture-scored.json` | The proposed scoring function (whole-string + distinctive-token coverage + extra-token penalty + category agreement), with per-candidate score, name_score, token_cov and top1-top2 margin. |
| `probe-overture-coverage.py` | Direct dataset probes used to classify ABSENT vs MISS_RANK. |
| `measure-extract-size.py` | Row counts and food-and-drink share per city extract, for the storage cost model. |
| `measure-jaro-winkler.py` / `jaro-winkler-duckdb.json` | **Added 2026-08-19 (MS5 task 3).** DuckDB 1.5.5's `jaro_winkler_similarity` and `jaro_similarity` pinned at full precision for 2 153 pairs: every whole-string and token pair the 44 cases actually evaluated, 30 adversarial pairs (empty string, single char, no common prefix, >4-char prefix, transpositions, Hebrew, CJK), and 1 500 seeded fuzz pairs. This is the reference the TypeScript port (`src/domain/places/jaro-winkler.ts`) is tested against — `tests/unit/places/jaro-winkler.test.ts` replays the whole table with `===`, and it matches bit for bit. |
| `measure-dataset-confidence.py` / `dataset-confidence-tlv.json` | **Added 2026-08-19 (MS5 task 5).** The per-`overture_id` Overture `confidence` for the Tel Aviv bbox of the pinned release `2026-07-22.0`, i.e. the missing input to the prototype's `0.10 · (conf or 0.5)` term. `raw-overture-scored.json` never recorded it, which is why task 4 could replay `name_score`/`token_cov`/`cat_match` but not `score`. It also re-derives each benchmark row's `score` from the measured confidence: **71/71 rows in the Tel Aviv bbox agree** (max residual 0.0083 in confidence, inside the 0.0086 the 3-dp rounding of the recorded inputs allows), and 55/71 land on the recorded `score` exactly at 3 dp from the *rounded* `name_score` alone. `conf = 0.5` reproduces none of them. |
| `measure-normalise-name-sample.py` / `normalise-name-sample-tlv.json` | **Added 2026-08-19 (MS5 task 5).** The prototype's unmodified `norm()` pinned over a deterministic 1 000-name stride sample of the ingested Tel Aviv extract (613 non-ASCII, 590 Hebrew) — the second half of `10` §4.3's porting test, which needed a real ingest. Replayed with `===` by [`tests/unit/places/normalise-sample.test.ts`](../../../tests/unit/places/normalise-sample.test.ts): **1 000/1 000 byte-identical.** |
| `ingest-tlv-row-counts.json` | **Added 2026-08-19 (MS5 task 5).** The recorded row counts for MS5 exit criterion 4 (raw 35 430 → food-and-drink 4 997 → loaded 4 997), the extract and loader manifests verbatim, the guards exercised, and two measured findings: the category filter admits 377 non-food rows via its `%bar%`/`%pub%` patterns and drops real food categories (`sandwich_shop`, `delicatessen`, `lounge`, …), and `06` §7.4's "43% lawyers and estate agents" is **not reproducible** — those categories are 10.3% of the raw extract. |
| `adjudication.json` | Hand verdicts per provider per case, plus the verdict key and notes. Source of every accuracy number in `docs/06-map-and-places-decision.md`. |
| `tlv-resolve-benchmark.md` / `tlv-resolve-benchmark-run.json` | **Added 2026-08-27 (TLV-RESOLVE-T4, `qa-reliability`).** The 14 `TLV-*` cases plus `NEG-03` run through the **shipped** resolver (`overturePlaceResolver(supabasePoiIndexGateway(...))`) against the **loaded** local `poi_index` — 10 462 rows, region `tlv`, release `2026-07-22.0`, bbox 31.95–32.40 / 34.70–35.00. The first run of any benchmark case against a real index rather than a recorded candidate list. Measured: **7/14 top-1 correct, and zero false auto-accepts** — all five `preselect` results are the right venue. The `.md` is the human reading, including which failures are absence, which are recall and which are ranking; the `.json` is the machine record, rewritten on every run. Harness: [`tests/manual/tlv-resolve-benchmark.manual.ts`](../../../tests/manual/tlv-resolve-benchmark.manual.ts), not in CI, skips with a reason when the local index is absent. |

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
./venv/bin/python measure-jaro-winkler.py > jaro-winkler-duckdb.json   # ~2 s, needs no parquet
./venv/bin/python measure-dataset-confidence.py    # ~15 s, reads S3 directly, needs no parquet

# the ingest proper (MS5 task 5) lives in scripts/, and the name sample is taken from its output:
DATABASE_URL=... ../../../scripts/ingest-poi-region.sh tlv --work-dir /tmp/p002-poi
./venv/bin/python measure-normalise-name-sample.py /tmp/p002-poi/tlv-extract.csv
```

The one runner that is not Python, and the only one that exercises product code rather than a
prototype — needs the local container up and region `tlv` loaded, and skips with a printed reason
when it is not:

```
SUPABASE_SERVICE_ROLE_KEY=<local key from `npx supabase status`> \
  npx vitest run tests/manual/tlv-resolve-benchmark.manual.ts \
    --config tests/manual/vitest.manual.config.ts --disable-console-intercept
```

`measure-jaro-winkler.py` needs no city extract at all: it reads `raw-overture-scored.json` and
`benchmark-spec.json` for its pair list. Re-run it if DuckDB's version changes, and expect the
TypeScript test to tell you if the values moved. `measure-dataset-confidence.py` needs no local
parquet either — it reads the pinned release from S3 itself, and takes the release and the Tel Aviv
bbox from `scripts/poi-ingest.config.json` rather than repeating them.
