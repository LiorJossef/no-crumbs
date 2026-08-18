import duckdb, json, sys, time
SPEC="/Users/lioryossef/Projects/P-002/docs/evidence/places/benchmark-spec.json"
c=duckdb.connect()
for t in ("tlv","tyo","ldn"):
    c.execute(f"CREATE TABLE {t} AS SELECT * FROM read_parquet('ov_{t}.parquet')")
# flatten alt names
c.execute("""CREATE TABLE allp AS
 SELECT city, id, name, cat, lon, lat, confidence,
   list_distinct(list_prepend(lower(name), [lower(v) for v in coalesce(map_values(alt), [])])) AS names
 FROM (SELECT 'tlv' city,* FROM tlv UNION ALL SELECT 'tyo',* FROM tyo UNION ALL SELECT 'ldn',* FROM ldn)""")
print(c.sql("select city,count(*) from allp group by 1").fetchall())
CITY={"Tokyo":"tyo","Tel Aviv":"tlv","תל אביב":"tlv","Givatayim":"tlv","London":"ldn"}
CATMAP={"cafe":["cafe","coffee"],"bar":["bar","pub","cocktail"],"restaurant":["restaurant","food"]}
spec=json.load(open(SPEC)); out={}
for case in spec["cases"]:
    q=case["query"].lower(); city=CITY.get(case["city_hint"] or "", None)
    where = f"city='{city}'" if city else "1=1"
    kws=CATMAP[case["category_hint"]]
    catexpr="+".join([f"(CASE WHEN cat ILIKE '%{k}%' THEN 1 ELSE 0 END)" for k in kws])
    t0=time.time()
    rows=c.execute(f"""
      SELECT name, cat, lat, lon, id, city, sim, catmatch,
             0.80*sim + 0.15*least(catmatch,1) + 0.05*coalesce(confidence,0) AS score
      FROM (SELECT name,cat,lat,lon,id,city,confidence,
                   (SELECT max(jaro_winkler_similarity(?, n)) FROM unnest(names) AS u(n)) AS sim,
                   {catexpr} AS catmatch
            FROM allp WHERE {where})
      WHERE sim > 0.55 ORDER BY score DESC LIMIT 5""",[q]).fetchall()
    out[case["id"]]={"query_sent":q,"city_scope":city or "ALL","latency_ms":int((time.time()-t0)*1000),
        "results":[{"name":r[0],"category":r[1],"lat":r[2],"lon":r[3],"id":r[4],"city_extract":r[5],
                    "name_sim":round(r[6],3),"cat_match":r[7],"score":round(r[8],3)} for r in rows]}
    top=rows[0] if rows else None
    print(f'{case["id"]:7} {case["query"][:28]:30} -> {(top[0] if top else "-")[:38]:40} sim={round(top[6],2) if top else "-"} score={round(top[8],3) if top else "-"} n={len(rows)}')
json.dump(out,open("/Users/lioryossef/Projects/P-002/docs/evidence/places/raw-overture.json","w"),ensure_ascii=False,indent=1)
