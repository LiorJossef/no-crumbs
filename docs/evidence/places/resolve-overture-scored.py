"""Prototype of the P-002 resolution scoring function, measured against the Overture
places extracts for Tokyo / Tel Aviv / London.  Deliberately simple and explainable."""
import duckdb, json, re, unicodedata, time, sys

GENERIC = {"cafe","café","coffee","bar","restaurant","kitchen","the","and","a","of","de","co",
           "company","roasters","roastery","house","shop","tokyo","london","tel","aviv","hidden",
           "gem","best","ever","this","that","little","near","in","at"}
CAT_TOKENS = {
 "cafe":{"cafe","coffee","coffee_shop","cafeteria","bakery","tea","dessert","ice_cream","juice"},
 "bar":{"bar","pub","cocktail","wine","beer","brewery","nightlife","lounge","speakeasy"},
 "restaurant":{"restaurant","food","dining","diner","ramen","sushi","noodle","pizza","bistro",
               "steak","izakaya","fast_food","buffet","deli","eatery"}}

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^\w\s֐-׿　-鿿]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def toks(s): return [t for t in norm(s).split() if t]
def strong(ts): return [t for t in ts if t not in GENERIC and len(t) > 1]

def jw(a,b): return _c.execute("select jaro_winkler_similarity(?,?)",[a,b]).fetchone()[0]

def name_score(q, cand):
    """0..1. Blend of whole-string similarity, coverage of the query's distinctive
    tokens by the candidate, and a mild penalty for extra candidate tokens."""
    nq, nc = norm(q), norm(cand)
    if not nq or not nc: return 0.0, 0.0
    whole = jw(nq, nc)
    qt, ct = toks(q), toks(cand)
    sq = strong(qt) or qt
    covs = []
    for t in sq:
        best = max((jw(t,u) for u in ct), default=0.0)
        # substring credit handles agglutinated names ("CafeXoho", "פלאפל הקוסם")
        if t in nc: best = max(best, 0.97)
        covs.append(best)
    cov = sum(covs)/len(covs)
    extra = max(0, len(strong(ct)) - len(sq))
    penalty = min(0.15, 0.04*extra)
    return max(0.0, 0.45*whole + 0.55*cov - penalty), cov

def cat_score(hint, cat):
    if not cat or not hint: return 0.0
    c = set(re.split(r"[_\s]+", cat.lower())) | {cat.lower()}
    return 1.0 if c & CAT_TOKENS[hint] else 0.0

_c = duckdb.connect()
for t in ("tlv","tyo","ldn"):
    _c.execute(f"CREATE TABLE {t} AS SELECT * FROM read_parquet('ov_{t}.parquet')")
_c.execute("""CREATE TABLE allp AS SELECT * FROM (
  SELECT 'tlv' city,* FROM tlv UNION ALL SELECT 'tyo',* FROM tyo UNION ALL SELECT 'ldn',* FROM ldn)""")

CITY={"Tokyo":"tyo","Tel Aviv":"tlv","תל אביב":"tlv","Givatayim":"tlv","London":"ldn"}
spec=json.load(open("/Users/lioryossef/Projects/P-002/docs/evidence/places/benchmark-spec.json"))
out={}
for case in spec["cases"]:
    q, hint = case["query"], case["category_hint"]
    city = CITY.get(case["city_hint"] or "")
    where = f"city='{city}'" if city else "1=1"
    sq = strong(toks(q)) or toks(q)
    # cheap prefilter: whole-string similarity OR any distinctive token as substring
    likes = " OR ".join(["name ILIKE ?"]*len(sq))
    t0=time.time()
    rows=_c.execute(f"""SELECT name,cat,lat,lon,id,city,confidence FROM allp
        WHERE {where} AND (jaro_winkler_similarity(lower(?), lower(name)) > 0.72 OR {likes})""",
        [norm(q)]+[f"%{t}%" for t in sq]).fetchall()
    scored=[]
    for name,cat,lat,lon,pid,ccity,conf in rows:
        ns,cov = name_score(q,name)
        cs = cat_score(hint,cat)
        total = 0.72*ns + 0.18*cs + 0.10*(conf or 0.5)
        scored.append((total,ns,cov,cs,name,cat,lat,lon,pid,ccity))
    scored.sort(reverse=True)
    top=scored[:5]
    margin = round(top[0][0]-top[1][0],3) if len(top)>1 else (1.0 if top else 0.0)
    out[case["id"]]={"query":q,"city_scope":city or "ALL","candidates_prefiltered":len(rows),
      "latency_ms":int((time.time()-t0)*1000),"margin_top1_top2":margin,
      "results":[{"name":r[4],"category":r[5],"lat":r[6],"lon":r[7],"overture_id":r[8],
                  "score":round(r[0],3),"name_score":round(r[1],3),"token_cov":round(r[2],3),
                  "cat_match":r[3]} for r in top]}
    t=top[0] if top else None
    print(f'{case["id"]:7} {q[:26]:28} -> {(t[4] if t else "-")[:34]:36} score={round(t[0],3) if t else "-":<6} ns={round(t[1],2) if t else "-":<5} margin={margin:<6} n={len(rows)}')
json.dump(out,open("/Users/lioryossef/Projects/P-002/docs/evidence/places/raw-overture-scored.json","w"),ensure_ascii=False,indent=1)
