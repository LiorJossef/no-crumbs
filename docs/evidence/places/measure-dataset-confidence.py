#!/usr/bin/env python3
"""Measure the per-row Overture `confidence` the 44-case benchmark scored with, and prove it
reproduces the `score` column that `raw-overture-scored.json` cannot replay on its own.

WHY THIS EXISTS (MS5 exit criterion 3, the half task 4 could not prove). The prototype's total is

    score = 0.72 * name_score + 0.18 * cat_match + 0.10 * (confidence or 0.5)
            -- resolve-overture-scored.py:73

and `raw-overture-scored.json` recorded `score`, `name_score`, `token_cov` and `cat_match` but
NEVER `confidence`. Task 4 replayed the first three at 220/220 rows and could not replay `score` at
all: assuming `conf = 0.5` reproduces 0 of 220 rows, and the confidence implied by the recorded
numbers spans 0.27-1.00. The values are not lost — they are a column of the pinned release
(`scripts/poi-ingest.config.json` -> `overtureRelease`, 2026-07-22.0), which is the release this
script re-reads. It therefore does two things:

  1. emits the per-`overture_id` confidence, so `poi_index.dataset_confidence` can be LOADED with
     the measured value instead of the column's `default 0.5` (docs/10-poi-index.md §3);
  2. checks each benchmark row's recorded `score` against the measured confidence, and reports the
     residual. A residual larger than the rounding of the recorded inputs would mean the benchmark
     was not scored on this release, which is a finding, not a nuisance.

Scope: the Tel Aviv bbox only, because MS5 task 5 loads Tel Aviv only. Benchmark rows outside that
bbox (Tokyo, London, and whichever city the unscoped NEG cases matched in) are reported as
`not_in_region`, not guessed at.

Usage (see the Reproduce block in README.md for the venv):
    ./venv/bin/python measure-dataset-confidence.py            # ~20 s, needs no local parquet
Writes dataset-confidence-tlv.json next to this file.
"""
import json
import pathlib
import sys
import time

import duckdb

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]
# The same pin the ingest uses. Read, not copied: a second literal is how a pin comes undone.
CONFIG = json.loads((REPO / "scripts" / "poi-ingest.config.json").read_text(encoding="utf-8"))
RELEASE = CONFIG["overtureRelease"]
REGION_ID = "tlv"
BBOX = CONFIG["regions"][REGION_ID]
SRC = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*.parquet"

# The scorer's weights, verbatim from resolve-overture-scored.py:73.
W_NAME, W_CAT, W_CONF = 0.72, 0.18, 0.10
# The recorded columns are rounded to 3 dp, so an exact equality check is not available. The worst
# case is 0.0005 on `score` plus 0.72 * 0.0005 on `name_score`, i.e. 0.00086 of score; expressed in
# confidence (the term is 0.10 * conf) that is 0.0086. 0.01 is that bound, rounded up once.
CONF_TOLERANCE = 0.01


def main() -> int:
    scored = json.loads((HERE / "raw-overture-scored.json").read_text(encoding="utf-8"))

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    started = time.time()
    con.execute(
        f"""
        create table tlv as
        select id, names.primary as name, categories.primary as cat, confidence
          from read_parquet('{SRC}')
         where bbox.xmin between {BBOX["minLng"]} and {BBOX["maxLng"]}
           and bbox.ymin between {BBOX["minLat"]} and {BBOX["maxLat"]}
        """
    )
    elapsed = round(time.time() - started, 1)
    rows = con.sql("select id, confidence from tlv").fetchall()
    conf_by_id = {r[0]: r[1] for r in rows}
    stats = con.sql(
        """select count(*), min(confidence), max(confidence), avg(confidence),
                  quantile_cont(confidence, 0.5), count(*) filter (where confidence is null)
             from tlv"""
    ).fetchone()

    checks, measured, missing = [], {}, []
    for case_id, case in scored.items():
        for rank, result in enumerate(case["results"], start=1):
            pid = result["overture_id"]
            conf = conf_by_id.get(pid)
            if conf is None:
                if pid not in conf_by_id:
                    missing.append({"case": case_id, "rank": rank, "overture_id": pid})
                continue
            measured[pid] = conf
            implied = (result["score"] - W_NAME * result["name_score"]
                       - W_CAT * result["cat_match"]) / W_CONF
            checks.append({
                "case": case_id,
                "rank": rank,
                "overture_id": pid,
                "name": result["name"],
                "recorded_score": result["score"],
                "recorded_name_score": result["name_score"],
                "recorded_cat_match": result["cat_match"],
                "measured_confidence": conf,
                "implied_confidence": round(implied, 6),
                "abs_residual_confidence": round(abs(implied - conf), 6),
                "recomputed_score": round(
                    W_NAME * result["name_score"] + W_CAT * result["cat_match"] + W_CONF * conf, 3
                ),
            })

    matched = [c for c in checks if c["abs_residual_confidence"] <= CONF_TOLERANCE]
    failed = [c for c in checks if c["abs_residual_confidence"] > CONF_TOLERANCE]
    score_exact = [c for c in checks if c["recomputed_score"] == c["recorded_score"]]

    out = {
        "measured_on": "2026-08-19",
        "overture_release": RELEASE,
        "region_id": REGION_ID,
        "bbox": BBOX,
        "source": SRC,
        "duckdb_version": duckdb.__version__,
        "extract_seconds": elapsed,
        "extract_rows": stats[0],
        "confidence_distribution": {
            "min": stats[1], "max": stats[2], "mean": round(stats[3], 6),
            "median": stats[4], "nulls": stats[5],
        },
        "benchmark_rows_total": sum(len(c["results"]) for c in scored.values()),
        "benchmark_rows_in_region": len(checks),
        "benchmark_rows_not_in_region": len(missing),
        "score_replay": {
            "tolerance_on_confidence": CONF_TOLERANCE,
            "within_tolerance": len(matched),
            "outside_tolerance": len(failed),
            "recomputed_score_equals_recorded_at_3dp": len(score_exact),
        },
        "confidence_by_overture_id": dict(sorted(measured.items())),
        "checks": checks,
        "not_in_region": missing,
    }
    (HERE / "dataset-confidence-tlv.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )

    print(f"release {RELEASE}  region {REGION_ID}  extract_rows {stats[0]}  ({elapsed}s)")
    print(f"confidence: min {stats[1]} max {stats[2]} mean {round(stats[3], 4)} nulls {stats[5]}")
    print(f"benchmark rows in region {len(checks)} / {out['benchmark_rows_total']}"
          f"  (not in region {len(missing)})")
    print(f"score replay: recomputed == recorded at 3dp for {len(score_exact)}/{len(checks)}; "
          f"confidence residual <= {CONF_TOLERANCE} for {len(matched)}/{len(checks)}")
    for c in failed[:20]:
        print(f"  MISMATCH {c['case']}#{c['rank']} {c['name'][:30]!r} "
              f"measured {c['measured_confidence']} implied {c['implied_confidence']} "
              f"residual {c['abs_residual_confidence']}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
