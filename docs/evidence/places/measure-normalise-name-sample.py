#!/usr/bin/env python3
"""Pin the prototype's norm() over a 1 000-name sample of REAL ingested Overture names, so the
TypeScript normalise() can be proved byte-identical on ingested data and not only on the 44
benchmark queries.

This is the second half of docs/10-poi-index.md §4.3's porting test. The first half (all 44 queries
plus 18 adversarial cases) was closed by MS5 task 2; §4.3 says the 1 000-row name sample "needs an
ingest and belongs to tasks 4/5". This is that, run in task 5 against the Tel Aviv extract of the
pinned release.

`norm()` below is copied VERBATIM from resolve-overture-scored.py, the script that produced the
benchmark. It is deliberately not imported or improved: the point is to compare against the exact
function whose output the numbers in docs/06 §6.3 rest on.

Usage:
    ./venv/bin/python measure-normalise-name-sample.py <tlv-extract.csv>
where the CSV is the one scripts/ingest-overture-extract.py writes. Emits
normalise-name-sample-tlv.json next to this file; tests/unit/places/normalise-sample.test.ts
replays it through src/domain/places/normalise.ts with ===.
"""
import csv
import json
import pathlib
import re
import sys
import unicodedata

HERE = pathlib.Path(__file__).resolve().parent
SAMPLE_SIZE = 1000


def norm(s):  # verbatim from resolve-overture-scored.py
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^\w\s֐-׿　-鿿]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    src = pathlib.Path(sys.argv[1])
    with src.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    # A deterministic stride, not a random sample: the same extract must always produce the same
    # pinned file, or the test's failures are not reproducible. The extract is written `order by id`.
    stride = max(1, len(rows) // SAMPLE_SIZE)
    sample = [rows[i] for i in range(0, len(rows), stride)][:SAMPLE_SIZE]

    pairs = [{"name": r["name"], "norm": norm(r["name"])} for r in sample]
    non_ascii = sum(1 for p in pairs if any(ord(c) > 127 for c in p["name"]))
    hebrew = sum(1 for p in pairs if any("֐" <= c <= "׿" for c in p["name"]))
    changed = sum(1 for p in pairs if p["norm"] != p["name"].lower())

    out = {
        "measured_on": "2026-08-19",
        "python_version": sys.version.split()[0],
        "unicodedata_unidata_version": unicodedata.unidata_version,
        "source_csv": src.name,
        "source_rows": len(rows),
        "sample_size": len(pairs),
        "stride": stride,
        "names_with_non_ascii": non_ascii,
        "names_with_hebrew": hebrew,
        "names_norm_differs_from_lowercase": changed,
        "pairs": pairs,
    }
    (HERE / "normalise-name-sample-tlv.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(
        f"sampled {len(pairs)} of {len(rows)} names (stride {stride}); "
        f"non-ascii {non_ascii}, hebrew {hebrew}, normalisation changes the lowercase form on {changed}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
