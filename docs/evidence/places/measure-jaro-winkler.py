"""Pin DuckDB's `jaro_winkler_similarity` for the pairs the TypeScript port must reproduce.

MS5 task 3. The prototype's `jw()` was DuckDB's built-in, and Jaro-Winkler implementations
disagree on prefix scale, prefix cap, the boost threshold and the empty string. Rather than argue
from the algorithm, we measure: every whole-string pair and every token pair the 44-case benchmark
actually evaluated, plus adversarial pairs, dumped with 17 significant digits so a TypeScript
port can be compared exactly.

Run:  pip install duckdb && python3 measure-jaro-winkler.py > jaro-winkler-duckdb.json
`norm()` is copied verbatim from resolve-overture-scored.py so the pairs are the normalised
strings the scorer really compares.
"""
import duckdb, json, re, unicodedata, sys, os

GENERIC = {"cafe","café","coffee","bar","restaurant","kitchen","the","and","a","of","de","co",
           "company","roasters","roastery","house","shop","tokyo","london","tel","aviv","hidden",
           "gem","best","ever","this","that","little","near","in","at"}

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^\w\s֐-׿　-鿿]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def toks(s): return [t for t in norm(s).split() if t]
def strong(ts): return [t for t in ts if t not in GENERIC and len(t) > 1]

HERE = os.path.dirname(os.path.abspath(__file__))
scored = json.load(open(os.path.join(HERE, "raw-overture-scored.json")))

pairs = []
for cid, case in scored.items():
    q = case["query"]
    for r in case["results"]:
        pairs.append((norm(q), norm(r["name"])))
        qt = toks(q); sq = strong(qt) or qt
        for t in sq:
            for u in toks(r["name"]):
                pairs.append((t, u))

ADVERSARIAL = [
    ("", ""), ("", "cafe"), ("cafe", ""),
    ("a", "a"), ("a", "b"), ("a", "ab"), ("ab", "a"),
    ("abc", "xyz"),                      # no common character at all
    ("dwayne", "duane"), ("dixon", "dicksonx"), ("martha", "marhta"),   # Winkler's own cases
    ("crate", "trace"),                  # pure permutation, no common prefix
    ("ab", "ba"), ("abcd", "abdc"),       # transpositions
    ("kiln", "kiln bar"),                # >4-char common prefix cases
    ("monmouth", "monmouth coffee company"),
    ("abcdefgh", "abcdefzz"), ("abcdefgh", "abcdxxxx"),
    ("aaaaaaaaaa", "aaaaaaaaab"),        # long, one differing char (prefix cap probe)
    ("caffe", "cafe"),                   # length-1 difference
    ("cafe", "cafe"),
    ("קפה לוינסקי", "קפה לוינסקי 41"),   # Hebrew
    ("פלאפל", "פלאפל הקוסם"),
    ("猿田彦珈琲", "猿田彦珈琲 渋谷"),      # CJK
    ("ラーメン", "らーめん"),
    ("東京", "京東"),                     # CJK transposition
    ("x" * 40, "x" * 39 + "y"),          # long strings
    (" ", " "), ("a b", "ab"),
]
pairs.extend(ADVERSARIAL)

# Deterministic fuzz. The hand-picked pairs above probe the behaviours we reasoned about; these
# 1 500 probe the ones we did not think of, across the three scripts the index actually contains.
# Seeded, so the committed table is reproducible.
import random
random.seed(20260819)
ALPHABETS = ["abcdefgxyz ", "אבגדהוזחטי ", "東京猿田彦珈琲ラーメンー ", "abאב東 "]
for _ in range(1500):
    al = random.choice(ALPHABETS)
    n1, n2 = random.randint(0, 12), random.randint(0, 12)
    a = "".join(random.choice(al) for _ in range(n1))
    b = "".join(random.choice(al) for _ in range(n2))
    if random.random() < 0.4 and a:                 # force a shared prefix half the time
        b = a[: random.randint(1, len(a))] + b
    pairs.append((a, b))


seen, uniq = set(), []
for a, b in pairs:
    if (a, b) not in seen:
        seen.add((a, b)); uniq.append((a, b))

c = duckdb.connect()
out = []
for a, b in uniq:
    v = c.execute("select jaro_winkler_similarity(?, ?), jaro_similarity(?, ?)",
                  [a, b, a, b]).fetchone()
    out.append({"a": a, "b": b,
                "jw": None if v[0] is None else repr(v[0]),
                "jaro": None if v[1] is None else repr(v[1])})

json.dump({"duckdb_version": duckdb.__version__,
           "note": "jw/jaro are Python repr() of the float DuckDB returned (17 sig digits, exact).",
           "pair_count": len(out), "pairs": out},
          sys.stdout, ensure_ascii=False, indent=1)
