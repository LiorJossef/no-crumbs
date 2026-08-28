#!/usr/bin/env python3
"""Geocode the recognition corpus's expected street addresses, so the harness can assert
*distance* and not only name/address strings.

    python3 docs/evidence/places/geocode-corpus-addresses.py [out.json]

## Why this exists

`tests/manual/tiktok-recognition.manual.ts` adjudicates a result by matching `namePattern` and
`addressPattern` against the returned strings. It never looks at the coordinates. Measured
2026-08-28: `Gelalucci`'s `poi_index` row carries address `שדרות מסריק 1` and coordinates
(32.02421, 34.74155) — **6.9 km from Masaryk Square, where that address is** — and the harness
scores it CORRECT. On a map product, a row that is right by name and 6.9 km wrong on the map is a
failure.

## Why the ground truth is the STREET, not the venue

Two reasons, and both were measured rather than assumed.

1. **Licensing.** Google Places is the product's primary resolver now, but `06` §3.1/§5.4 forbid
   pairing its content with a non-Google map and cap coordinate caching at 30 days. Committing
   Google coordinates into a test fixture would breach that. OSM/Nominatim is ODbL, the OSMF
   Geocoding Guideline treats individual results as insubstantial extracts, and the usage policy
   *requires* caching — so this is the compliant source. Attribution already ships (`06` §3.2).
2. **Coverage.** The project has already measured that "Tel Aviv is a data hole" for OSM *POIs* —
   three target venues verified absent. Street data is a different matter and is good there. So
   asking OSM "where is רוטשילד 15" succeeds where "where is Rustico" would not.

The consequence is that the ground truth is address-accurate, not venue-accurate: a long street's
centroid can sit a few hundred metres from the door. That is why the harness's default tolerance is
deliberately loose (`DEFAULT_MAX_DISTANCE_M`). This assertion exists to catch a row that is in the
wrong *place*, not to grade a pin to the metre.

## Output

A JSON array, one entry per (case, expectation), with the query sent, the top Nominatim result, its
class/type, and its coordinates. **Nothing here is written into the corpus automatically** — read
the file, drop anything that geocoded to the wrong thing, and paste the survivors in by hand. An
unreviewed coordinate would be exactly the fabricated ground truth this is meant to prevent.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
CORPUS = os.path.join(ROOT, "tests", "manual", "tiktok-recognition-corpus.json")
UA = "P-002-university-project/0.1 (RUNI CS final project; liorj@arbitrip.com)"

# Nominatim usage policy: absolute maximum 1 request per second.
RATE_LIMIT_S = 1.1


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())


def search(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "limit": 3, "addressdetails": 1, "countrycodes": "il"}
    )
    return get(url)


def street_queries(area):
    """`area` is corpus prose — `'בזל 42 / רוטשילד 15, תל אביב'`, `'שלמה המלך 1, Tel Aviv'`.

    Split on `/` because a multi-branch venue lists several, and take each alternative as its own
    query. The city is appended only when the fragment does not already carry one.
    """
    out = []
    for part in area.split("/"):
        part = part.strip().strip(",")
        if not part:
            continue
        # Drop parenthetical and neighbourhood asides that Nominatim reads as extra constraints.
        part = re.sub(r"\(.*?\)", "", part).strip()
        if not re.search(r"תל אביב|Tel Aviv|יפו|Jaffa", part):
            part = f"{part}, תל אביב"
        out.append(part)
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "corpus-address-geocode.json"
    )
    corpus = json.load(open(CORPUS, encoding="utf-8"))
    results = []
    for case in corpus["cases"]:
        for exp in case.get("expected", []):
            for q in street_queries(exp["area"]):
                try:
                    rows = search(q)
                except Exception as e:  # noqa: BLE001 — a failed lookup is data, not a crash
                    rows, err = [], str(e)
                else:
                    err = None
                top = rows[0] if rows else None
                results.append(
                    {
                        "url": case["url"],
                        "venue": exp["name"],
                        "area": exp["area"],
                        "query": q,
                        "error": err,
                        "n": len(rows),
                        "top_display_name": top.get("display_name") if top else None,
                        "top_class": f"{top.get('class')}/{top.get('type')}" if top else None,
                        "lat": float(top["lat"]) if top else None,
                        "lng": float(top["lon"]) if top else None,
                    }
                )
                print(
                    f"{'OK ' if top else 'MISS'} {q:<44} "
                    f"{(top.get('display_name')[:60] if top else '—')}"
                )
                time.sleep(RATE_LIMIT_S)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"\nwrote {out_path} ({len(results)} lookups)")
    print("REVIEW BY HAND before pasting anything into the corpus.")


if __name__ == "__main__":
    main()
