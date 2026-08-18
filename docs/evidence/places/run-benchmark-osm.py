#!/usr/bin/env python3
"""Run the D2 place-resolution benchmark against the keyless OSM-backed search
engines (Nominatim and Photon). Writes raw JSON per case plus a flat CSV.

Usage: python3 run-benchmark-osm.py <out_dir>
Respects the Nominatim usage policy: <=1 req/s, identifying User-Agent.
Providers requiring API keys (Google Places, Mapbox Search Box, Foursquare)
are NOT covered here - add a sibling runner when keys exist.
"""
import json, os, sys, time, urllib.parse, urllib.request

UA = "P-002-university-project/0.1 (RUNI CS final project; liorj@arbitrip.com)"
SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "benchmark-spec.json")

def get(url):
    t0 = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        body = json.loads(r.read().decode())
    return body, int((time.time() - t0) * 1000)

def nominatim(case):
    q = case["query"] if not case["city_hint"] else f'{case["query"]}, {case["city_hint"]}'
    url = ("https://nominatim.openstreetmap.org/search?"
           + urllib.parse.urlencode({"q": q, "format": "jsonv2", "limit": 5,
                                     "addressdetails": 1, "extratags": 1}))
    body, ms = get(url)
    rows = [{"name": f.get("name") or f.get("display_name"),
             "display_name": f.get("display_name"),
             "lat": f.get("lat"), "lon": f.get("lon"),
             "category": f'{f.get("category")}:{f.get("type")}',
             "id": f'{f.get("osm_type")}/{f.get("osm_id")}',
             "importance": f.get("importance")} for f in body]
    return q, rows, ms

def photon(case):
    q = case["query"] if not case["city_hint"] else f'{case["query"]}, {case["city_hint"]}'
    url = "https://photon.komoot.io/api/?" + urllib.parse.urlencode({"q": q, "limit": 5})
    body, ms = get(url)
    rows = []
    for f in body.get("features", []):
        p = f["properties"]
        rows.append({"name": p.get("name"),
                     "display_name": ", ".join(x for x in [p.get("name"), p.get("street"),
                                    p.get("district"), p.get("city"), p.get("country")] if x),
                     "lat": f["geometry"]["coordinates"][1], "lon": f["geometry"]["coordinates"][0],
                     "category": f'{p.get("osm_key")}:{p.get("osm_value")}',
                     "id": f'{p.get("osm_type")}/{p.get("osm_id")}',
                     "importance": None})
    return q, rows, ms

PROVIDERS = {"nominatim": nominatim, "photon": photon}

def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    spec = json.load(open(SPEC))
    raw, csv = {}, ["provider,case_id,query_sent,n_results,latency_ms,top1_name,top1_category,top1_id,top1_lat,top1_lon,top2_name,top3_name"]
    for pname, fn in PROVIDERS.items():
        raw[pname] = {}
        for c in spec["cases"]:
            try:
                q, rows, ms = fn(c)
                err = None
            except Exception as e:
                q, rows, ms, err = c["query"], [], -1, repr(e)
            raw[pname][c["id"]] = {"query_sent": q, "error": err, "latency_ms": ms, "results": rows}
            g = lambda i, k: (rows[i].get(k) if len(rows) > i else "")
            def esc(v):
                s = "" if v is None else str(v)
                return '"' + s.replace('"', "'") + '"'
            csv.append(",".join([pname, c["id"], esc(q), str(len(rows)), str(ms),
                                 esc(g(0, "name")), esc(g(0, "category")), esc(g(0, "id")),
                                 esc(g(0, "lat")), esc(g(0, "lon")),
                                 esc(g(1, "name")), esc(g(2, "name"))]))
            print(f'{pname} {c["id"]:7} n={len(rows)} {ms:5}ms  {g(0,"name")}', flush=True)
            time.sleep(1.1)
    json.dump(raw, open(os.path.join(out, "raw-osm.json"), "w"), ensure_ascii=False, indent=1)
    open(os.path.join(out, "results-osm.csv"), "w").write("\n".join(csv) + "\n")

if __name__ == "__main__":
    main()
