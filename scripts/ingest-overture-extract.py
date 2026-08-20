#!/usr/bin/env python3
"""Overture `places` extract for one region, straight from the public S3 release.

Promoted from docs/evidence/places/ingest-overture-city-extract.py per docs/10-poi-index.md §7,
with the three changes that section requires:

  1. the release is PINNED in scripts/poi-ingest.config.json (`overtureRelease`) rather than
     hardcoded here, and is written into poi_regions.dataset_release by the loader;
  2. the food-and-drink category filter has MOVED INTO THE EXTRACT (06 §7.4) — 85.9% of the raw Tel
     Aviv extract is not food and drink, and there is no reason to normalise or store it;
  3. it writes a CSV plus a manifest, and does no database work at all. Normalisation and the load
     are scripts/load-poi-region.ts, because name_norm must come from the SAME normalise() the
     resolver calls (10 §4) and that function is TypeScript.

This is not run in the request path and not in CI.

Usage (needs duckdb; see docs/evidence/places/README.md's Reproduce block for the venv):
    ./venv/bin/python scripts/ingest-overture-extract.py tlv --out-dir /tmp/poi
Outputs <out-dir>/<region>-extract.csv and <out-dir>/<region>-extract-manifest.json.
"""
import argparse
import json
import os
import pathlib
import sys
import time

import duckdb

HERE = pathlib.Path(__file__).resolve().parent
CONFIG = json.loads((HERE / "poi-ingest.config.json").read_text(encoding="utf-8"))

# The pinned release, as a named constant (10 §7 step 1). Read from the shared config so the
# extract, the loader and the transaction cannot disagree about which release is loaded.
OVERTURE_RELEASE: str = CONFIG["overtureRelease"]
SOURCE_TEMPLATE = (
    "s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*.parquet"
)

# CSV column order, and the loader's contract. Kept in one place because two orderings is a
# silent column swap: lat/lng in particular are both doubles in the same range for Tel Aviv.
COLUMNS = [
    "dataset_place_id",
    "name",
    "provider_category",
    "address_line",
    "locality",
    "lat",
    "lng",
    "dataset_confidence",
]


def food_and_drink_predicate() -> str:
    """The 06 §7.4 filter, verbatim from evidence/places/measure-extract-size.py.

    Kept as an exact-list OR pattern-list disjunction rather than 'improved': 06 §3.1's storage
    model and the 14-35% retained-size figure were measured with exactly this predicate. Its two
    measured flaws are recorded in 10 §7.1, not fixed here.
    """
    exact = ", ".join("'" + c.replace("'", "''") + "'" for c in CONFIG["foodAndDrinkCategories"])
    likes = " or ".join(
        "cat like '%" + p.replace("'", "''") + "%'" for p in CONFIG["foodAndDrinkPatterns"]
    )
    return f"(cat is not null and (cat in ({exact}) or {likes}))"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("region", help="region id, e.g. tlv (must exist in poi-ingest.config.json)")
    ap.add_argument("--out-dir", required=True, help="directory for the CSV and the manifest")
    args = ap.parse_args()

    region_id: str = args.region
    if region_id not in CONFIG["regions"]:
        known = ", ".join(sorted(CONFIG["regions"]))
        print(f"FAIL unknown region '{region_id}'. Known regions: {known}", file=sys.stderr)
        return 2
    region = CONFIG["regions"][region_id]
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / f"{region_id}-extract.csv"
    manifest_path = out_dir / f"{region_id}-extract-manifest.json"

    src = SOURCE_TEMPLATE.format(release=OVERTURE_RELEASE)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")

    started = time.time()
    # bbox.xmin / bbox.ymin, as the evidence script used: for a point place they equal the
    # geometry's lon/lat, and using the same expression keeps the loaded coordinates identical to
    # the ones the benchmark scored on.
    con.execute(
        f"""
        create table raw as
        select id,
               names.primary                       as name,
               categories.primary                  as cat,
               try(addresses[1].freeform)          as address_line,
               try(addresses[1].locality)          as locality,
               bbox.ymin                           as lat,
               bbox.xmin                           as lng,
               confidence
          from read_parquet('{src}')
         where bbox.xmin between {region["minLng"]} and {region["maxLng"]}
           and bbox.ymin between {region["minLat"]} and {region["maxLat"]}
        """
    )
    raw_rows = con.sql("select count(*) from raw").fetchone()[0]
    extract_seconds = round(time.time() - started, 1)

    predicate = food_and_drink_predicate()
    con.execute(f"create table fd as select * from raw where {predicate}")
    filtered_rows = con.sql("select count(*) from fd").fetchone()[0]

    # A row with no primary name cannot be normalised into a non-empty name_norm, and
    # poi_index.name_norm is `check (length(name_norm) between 1 and 1000)` — one such row would
    # abort the whole single-transaction load. Dropped here, and counted, not silently.
    nameless = con.sql(
        "select count(*) from fd where name is null or length(trim(name)) = 0"
    ).fetchone()[0]
    # `name` is `check (length(trim(name)) between 1 and 300)` (0010). Counted for the same reason.
    overlong = con.sql("select count(*) from fd where length(trim(name)) > 300").fetchone()[0]

    con.execute(
        f"""
        copy (
          select id as dataset_place_id, trim(name) as name, cat as provider_category,
                 address_line, locality, lat, lng, confidence as dataset_confidence
            from fd
           where name is not null and length(trim(name)) between 1 and 300
           order by id
        ) to '{csv_path}' (format csv, header true)
        """
    )
    loadable_rows = filtered_rows - nameless - overlong

    # What the filter keeps and what it throws away, by category, counted rather than assumed.
    # The filter is a hand-written list (06 §7.4) and a hand-written list of ~1 000 Overture leaf
    # categories is exactly the kind of thing that quietly omits a real food category — measured on
    # the Tel Aviv extract, it omits `sandwich_shop`. Recording both sides makes the next region's
    # omissions visible in the manifest instead of in a resolution miss six weeks later.
    included_top = con.sql(
        "select cat, count(*) c from fd group by 1 order by c desc, cat limit 30"
    ).fetchall()
    excluded_top = con.sql(
        f"select coalesce(cat, '(null)') cat, count(*) c from raw where not {predicate} "
        "group by 1 order by c desc, cat limit 50"
    ).fetchall()

    manifest = {
        "region_id": region_id,
        "display_name": region["displayName"],
        "overture_release": OVERTURE_RELEASE,
        "source": src,
        "bbox": {k: region[k] for k in ("minLat", "maxLat", "minLng", "maxLng")},
        "raw_rows": raw_rows,
        "food_and_drink_rows": filtered_rows,
        "food_and_drink_share": round(filtered_rows / raw_rows, 4) if raw_rows else None,
        "dropped_nameless": nameless,
        "dropped_name_over_300_chars": overlong,
        "csv_rows": loadable_rows,
        "extract_seconds": extract_seconds,
        "duckdb_version": duckdb.__version__,
        "csv_columns": COLUMNS,
        "csv_bytes": os.path.getsize(csv_path),
        "included_categories_top_30": [{"category": c, "rows": n} for c, n in included_top],
        "excluded_categories_top_50": [{"category": c, "rows": n} for c, n in excluded_top],
    }
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
