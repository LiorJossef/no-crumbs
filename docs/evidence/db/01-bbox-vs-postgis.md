# DB1 — bbox + Haversine vs PostGIS geography (D6) — **VERIFIED**

> Owner: Database / Supabase. Measured 2026-08-19. Closes the "evidence status: ASSUMED, with a
> committed benchmark to run" line in `docs/08-place-identity.md` §6.3 and unknown **A4** in
> `docs/02-risks-and-unknowns.md`.
> Verdict: **the delivered design survives.** No PostGIS in V1. Two revisit triggers are now numbers
> rather than opinions, and one claim in `08` §6.2 is measured to be **wrong in PostGIS's favour and
> against it at the same time** — see §6.

Nothing in this file touched staging or production. Everything ran in a throwaway Docker container.

---

## 1. What was measured

The four query shapes the delivered schema actually issues, plus two shapes that are out of scope
today and exist only to locate the flip-point:

| Shape | Where it comes from |
|---|---|
| **Q-VIEWPORT** — the user's saved places inside a map rectangle | `08` §6.3, verbatim |
| **Q-NEAR** — the user's saved places within 2 km, ordered by distance | `08` §6.3, verbatim |
| **Q-DEDUP** — the 75 m near-duplicate guard | `08` §1.2 step 2 = `0007_functions.sql:145–157`, verbatim |
| **Q-DEDUP-CHAIN** — the same guard when many rows share one `name_key` | the guard's worst case (`Starbucks`) |
| **Q-GLOBAL-VIEWPORT** — a viewport with **no** `user_id` predicate | `08` §6.4 revisit trigger 2 (out of scope) |
| **KNN-20** — true nearest-neighbour over all places | `08` §6.4 revisit trigger 4 (out of scope) |

Each was run twice against **identical data in the same database**:

- **bbox** — exactly what ships: `lat`/`lng` `double precision`, `places_lat_lng_idx` on
  `(lat, lng)`, `public.km_between()` for the exact distance and the ordering.
- **postgis** — `create extension postgis` (3.3.7), then the migration `08` §6.4 names as the escape
  hatch, applied literally:
  ```sql
  alter table public.places add column geog geography(Point,4326)
    generated always as (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) stored;
  create index places_geog_gix on public.places using gist (geog);
  ```
  `ST_MakeEnvelope(...)::geography` for the viewport, `ST_DWithin`/`ST_Distance` for radius and
  ordering, `<->` for KNN. Both indexes existed simultaneously; the planner chose freely.

## 2. Scale, and why

`per_user = 500` throughout. The product cap is "well under 10k rows per user" and a realistic
library after months of use is a few hundred; 500 is the top of the plausible range, not the middle.
The variable is the number of users, which is what actually grows `places`:

| Scale | users | `places` | `saved_places` | Rationale |
|---|---|---|---|---|
| **A — design scale** | 100 | 50,000 | 50,000 | the exact figure `08` §6.3's committed benchmark spec names |
| **B — 10×** | 1,000 | 500,000 | 500,000 | `08` §6.4 trigger 1 is stated at 10× design scale |
| **C — 100×** | 10,000 | 5,000,000 | 5,000,000 | one further order of magnitude, well past anything this product will see |

Places are **not** shared between users in the seed (each user's 500 are their own rows), which is
the worst case for `places` size and for every index on it. Coordinates are scattered over three
real city extents (Tel Aviv, Tokyo, London) at ±0.12° lat / ±0.16° lng, so density inside a viewport
grows with the table — again the pessimistic choice. 1 in 40 places carries a chain name shared
globally.

Timing harness: 200 randomised parameter sets per shape, each parameter set drawn from a real
`saved_places ⋈ places` row, one warm-up pass over all 200 before the measured pass, `p50`/`p95`
over the 200 measured executions (server-side, planning included). See `bench/harness.sql`.

## 3. Results — warm p50 / p95, milliseconds

Lower is better. **Bold** marks the winner where the gap is larger than the run-to-run noise.

### Scale A — 50k places (design scale)

| Shape | bbox p50 | bbox p95 | postgis p50 | postgis p95 |
|---|---|---|---|---|
| Q-VIEWPORT | **0.231** | **0.304** | 0.347 | 0.620 |
| Q-NEAR (2 km) | 0.458 | 0.547 | 0.512 | 0.655 |
| Q-DEDUP (75 m) | 0.063 | 0.076 | **0.032** | **0.039** |
| Q-DEDUP-CHAIN | 0.064 | 0.075 | **0.038** | **0.044** |
| Q-GLOBAL-VIEWPORT | 0.146 | 0.167 | **0.114** | **0.146** |

### Scale B — 500k places (10× design scale, `08` §6.4 trigger 1)

| Shape | bbox p50 | bbox p95 | postgis p50 | postgis p95 |
|---|---|---|---|---|
| Q-VIEWPORT | **1.944** | **2.307** | 6.022 | 8.304 |
| Q-NEAR (2 km) | **0.652** | **2.901** | 8.170 | 13.772 |
| Q-DEDUP (75 m) | 0.067 | 0.082 | 0.059 | 0.079 |
| Q-DEDUP-CHAIN | 0.093 | 0.111 | **0.061** | **0.073** |
| Q-GLOBAL-VIEWPORT | 0.936 | 1.157 | **0.637** | **0.836** |

**The `08` §6.4 fail line — "Q-VIEWPORT or Q-NEAR p95 > 25 ms at 10× the design scale" — is not
crossed. Measured p95 is 2.31 ms and 2.90 ms, 8–10× under budget.** PostGIS at the same scale is
already 3–5× slower on both.

### Scale C — 5M places (100× design scale)

| Shape | bbox p50 | bbox p95 | postgis p50 | postgis p95 |
|---|---|---|---|---|
| Q-VIEWPORT | **1.109** | **1.311** | 133.180 | 158.446 |
| Q-NEAR (2 km) | **1.155** | **1.379** | 80.825 | 113.950 |
| Q-DEDUP (75 m) | 0.073 | 0.173 | 0.120 | 0.183 |
| Q-DEDUP-CHAIN | 0.355 | 0.417 | **0.162** | **0.253** |
| Q-GLOBAL-VIEWPORT | **0.948** | **1.179** | 5.492 | 6.708 |

Raw log for all three scales, including every `EXPLAIN (ANALYZE, BUFFERS)`:
[`raw/all-scales.txt`](raw/all-scales.txt).

## 4. Why PostGIS loses, in one pair of plans

This is the whole finding, and it is a *planner* result, not a *geometry* result. At 5M places,
warm, same row, same user:

```
=== Q-VIEWPORT bbox                                          Execution Time: 1.555 ms
 Nested Loop (actual rows=9 loops=1)
   ->  Index Scan using saved_places_user_recent_idx on saved_places sp (actual rows=500 loops=1)
         Index Cond: (user_id = '4d2513a8-…'::uuid)
   ->  Index Scan using places_pkey on places p (actual rows=0 loops=500)
         Index Cond: (id = sp.place_id)
         Rows Removed by Filter: 1
```

```
=== Q-VIEWPORT postgis                                       Execution Time: 159.375 ms
 Nested Loop (actual rows=11 loops=1)
   ->  Bitmap Heap Scan on places p (actual rows=38247 loops=1)
         Recheck Cond: (geog && '0103…'::geography)
         Heap Blocks: exact=32191
         ->  Bitmap Index Scan on places_geog_gix (actual rows=38247 loops=1)
   ->  Index Scan using saved_places_place_user_idx on saved_places sp (actual rows=0 loops=38247)
```

Without a GiST index the planner has no geometric access path, so it does the only sensible thing:
start from `saved_places(user_id)`, 500 rows, probe `places` by primary key, apply four float
comparisons. **With** a GiST index it starts from geometry, materialises 38,247 places from a
32,191-block heap scan, and probes `saved_places` 38,247 times to discard almost all of them. The
index does not merely fail to help — it is *chosen*, and choosing it costs two orders of magnitude.

`08` §6.2 predicted "the GiST index is never chosen — draw, neither index does the geo work". Half of
that is wrong: **the GiST index is chosen, and it loses.** The conclusion (no PostGIS) survives; the
argument behind it was too generous to PostGIS.

Confirmation that this is the index and not the library: with the GiST index dropped, the same
PostGIS predicates run as a filter over the user's 500 rows and are competitive again
(`bench/nogist.sql`, scale C): Q-VIEWPORT 1.189/1.710 ms, Q-NEAR 1.345/1.425 ms against bbox's
1.033/1.165 and 1.114/1.192 in the same run. So the honest summary is: *`ST_DWithin` costs about
what `km_between` costs; the GiST index is the liability.* Adding PostGIS without adding a GiST
index would be strictly pointless, and adding both is measurably worse than neither.

Sizes at scale C, for the record: `places` heap 793 MB, `places_lat_lng_idx` 190 MB,
`places_geog_gix` 348 MB. The GiST index is 1.8× the B-tree it would not replace, since
`places_lat_lng_idx` still serves whole-table geographic maintenance.

## 5. Correctness

Raw output: [`raw/correctness.txt`](raw/correctness.txt) · script `bench/correctness.sql`.

### 5.1 Sphere vs ellipsoid

`km_between` is Haversine on a sphere of mean radius 6371.0088 km; `ST_Distance(geography)` is the
WGS84 ellipsoid. Over 17,902 random pairs 1–200 m apart, spread over all latitudes:

```
min_ratio 0.99564   max_ratio 1.00561   max_abs_diff 1.105 m
```

So the guard's effective radius is not 75.000 m but **74.59–75.42 m**, latitude-dependent. Probing
50,000 pairs placed deliberately inside that band, `km_between(...) <= 0.075` and
`ST_DWithin(..., 75)` disagree on 3,949 of them — and the disagreements lie **entirely within
74.589–75.319 m**. Outside a ±0.42 m shell around the threshold the two are identical.

Does that matter here? No. §1.2 calibrates 75 m against "provider coordinate disagreement for the
same venue is typically < 50 m", and the inverse error is a cosmetic duplicate pin. A guard whose
radius is 74.6 m in Tokyo and 75.4 m near the pole is indistinguishable from one that is exactly
75 m for that purpose. Recorded so the number is known, not so it is fixed.

### 5.2 The bbox pre-filter never excludes what the refinement would accept

The window is `dlat = 0.075/111.045°` and `dlng = dlat / max(cos φ, 0.01)`. Measured:

```
dlat_deg 0.00067540 = 74.68 m at the equator (WGS84)
                    = 75.44 m at the pole    (WGS84)
                    = 75.10 m on km_between's own sphere   <-- the one that matters
```

Because the pre-filter's degree constant (111.045) is smaller than the sphere degree `km_between`
itself uses (111.195), the box is always a strict superset of its own refinement. There is no
latitude at which the bbox drops a row that `km_between` would have kept — **except** the polar
clamp below.

### 5.3 The three named failure modes, quantified

| Mode | Real? | Threshold, measured |
|---|---|---|
| **Latitude-dependent longitude degree** | Handled | The `cos φ` correction is present and the E-W window measures a constant 75.2 m from the equator to 89.43°. An uncorrected box would be 13 m wide in London. |
| **Poles** | Real, bounded | The `greatest(cos φ, 0.01)` clamp caps `dlng` at 0.0675°. Above **\|φ\| = 89.4266°** the E-W window starts shrinking: 65.6 m at 89.5°, 13.1 m at 89.9°. A genuine cross-provider duplicate 74 m apart E-W is **missed** above that latitude. The nearest permanent settlement to either pole is Alert, Canada at 82.5°N — 770 km short of the threshold. |
| **Antimeridian** | Real, bounded | Demonstrated on real rows: two places 21.21 m apart (PostGIS: 21.24 m) at 179.9999°E and 179.9999°W. The guard finds **0**; `ST_DWithin` finds **1**. Note `km_between` itself is correct across the seam — only the `BETWEEN` pre-filter breaks. Land within 75 m of the 180° meridian: eastern Fiji (Taveuni), Wallis and Futuna's east edge, a few Chukotka and Antarctic points. No food recommendation in the product's genre. |

Both failures are *false negatives on the dedup guard* — the outcome is a duplicate pin, which §1.2
already accepts as a cosmetic fault, and which the user can neither corrupt nor lose data through.
Neither can break Q-VIEWPORT or Q-NEAR, which never straddle the seam for a user whose library sits
in one hemisphere. **In this product's domain no disagreement between the two designs can occur**,
with the failure envelope now stated numerically rather than by hand-wave.

### 5.4 A correctness result that goes *against* PostGIS

A map viewport is a lat/lng rectangle: its north and south edges are lines of constant latitude.
A `geography` polygon's edges are great circles, and the `&&` operator compares conservative
3-D bounding boxes. At scale C, on one Tel Aviv rectangle:

| Predicate | Rows |
|---|---|
| `lat between … and lng between …` (ships) | 42,341 |
| `ST_Intersects(geog, ST_MakeEnvelope(…))` | 42,342 |
| `geog::geometry && ST_MakeEnvelope(…)` | 42,360 |
| `geog && ST_MakeEnvelope(…)::geography` | **49,778** |

The index-only geography spelling over-selects by **17.6%** — 7,437 rows outside the requested
rectangle, up to 650 m west and 553 m east of its edges. Those are pins the map did not ask for and
would draw off-screen. The exact spellings agree with the plain `BETWEEN` to 1 row in 42,341
(0.002%, a boundary point). So for the viewport the bbox is not an approximation of the right
answer — **it is the right answer**, and the natural PostGIS form is the one that needs a correction
the plain design does not.

## 6. The flip-point, as numbers

1. **Q-VIEWPORT / Q-NEAR (per-user shapes): there is no flip-point below 5,000,000 places.** PostGIS
   loses by 1.5× at 50k, 3–5× at 500k and 100× at 5M; the gap widens with scale, because the GiST
   index becomes *more* attractive to the planner exactly as it becomes *less* correct to use.
   The `08` §6.4 25 ms p95 budget is **not reached at any tested scale and no honest extrapolation
   exists**: bbox p95 is 0.30 ms at 50k, 2.31 ms at 500k and *back down* to 1.31 ms at 5M, because
   once the plan settles on `saved_places(user_id)` → PK probe it stops depending on the size of
   `places` at all. It depends on the user's own library size, which the product caps well under
   10k. That is the real reason there is no flip-point here.
2. **Q-DEDUP: PostGIS is faster from the first tested scale, by 0.02–0.2 ms, and this never matters.**
   With 10,008 rows sharing one `name_key` + country the bbox guard is 0.294 ms p95; at 510,008 such
   rows it is 0.665 ms p95 against PostGIS's 0.287 ms ([`raw/chain-sweep.txt`](raw/chain-sweep.txt)).
   `resolve_place` runs once per candidate place per import, tens of times a day. The measured slope
   over that 50× range is ~0.75 µs per additional 1,000 same-name rows, which puts a 25 ms p95
   somewhere on the order of **10⁷ rows sharing a single `name_key` in one country**. That is not a
   scale; it is a fantasy.
3. **The real flip-point is a query *shape*, and it is `08` §6.4 trigger 4 — true KNN.** `ORDER BY
   km_between(...) LIMIT 20` with no `user_id` predicate has no usable index and is a full scan plus
   top-N sort, linear in rows. Measured p95 ([`raw/knn.txt`](raw/knn.txt)):

   | places | haversine sort p95 | GiST `<->` p95 |
   |---|---|---|
   | 50,000 | 8.5 ms | — |
   | **370,000** | **25.2 ms** | — |
   | 500,000 | 32.3 ms | — |
   | 1,000,000 | 62.2 ms | — |
   | 5,000,000 | 344.2 ms | **0.708 ms** |

   **Flip-point: 370,000 places, for a global KNN query, against the project's own 25 ms p95 line.**
   At 5M PostGIS is 486× faster on this shape. If a discovery / "nearest place to me anywhere"
   feature is ever added — charter §4 currently forbids it — PostGIS becomes correct, and this is
   the number that says so.
4. **Trigger 2 (a viewport with no `user_id`) did *not* flip**, contrary to `08` §6.4's expectation
   that it is "the most likely trigger". PostGIS wins it at 50k (0.146 vs 0.167 p95) and 500k (0.836
   vs 1.157) and then *loses* it at 5M (6.708 vs 1.179), because the query is `LIMIT`-bounded and a
   bitmap scan on `(lat, lng)` reaches 500 matching rows in fewer blocks than the GiST does. Trigger
   2 should be re-worded to name the *unbounded* or KNN form, which is trigger 4 — the two overlap
   and only trigger 4 is real. Recorded here; the `08` edit is deliberately not made in this commit.
5. **Trigger 3 (polygon containment) is unmeasurable and unchanged**: a bbox cannot express it at
   all. It remains a genuine trigger and needs no number.

## 7. Verdict

**D6 stands, and is now VERIFIED rather than ASSUMED.** No PostGIS in V1. `lat`/`lng`
`double precision`, `places_lat_lng_idx`, `km_between`, no extensions.

Three corrections to the reasoning in `08` §6, none of which changes the decision:

- §6.2's "the GiST index is never chosen — draw" is **wrong**. It is chosen, and it turns a 1.5 ms
  query into a 159 ms one at 5M rows. The correct claim is stronger than the one made: adding
  PostGIS is not free, it is *harmful*, and the harm grows with scale.
- §6.2's "correctness for within N km — winner: PostGIS" needs a companion row: for the
  *viewport* rectangle, the natural geography spelling is 17.6% wrong and the plain `BETWEEN` is
  exact. Winner there is plain.
- §6.4's trigger 2 is not the most likely trigger; trigger 4 is the only one with a measured number
  behind it (370k places), and trigger 2 as written did not reproduce.

Also confirmed reversible, as §6.4 claims: the escape-hatch migration in this benchmark is exactly
the one that file names, it applied to the delivered schema unmodified, and `lat`/`lng` stayed
canonical throughout. Nothing in this measurement makes adding PostGIS later any harder.

## 8. Reproduction

Docker only; no hosted environment is touched.

```bash
# 1. throwaway Postgres 17.6 with PostGIS 3.3.7 available
docker run -d --name p002bench -e POSTGRES_PASSWORD=postgres -p 55439:5432 \
  public.ecr.aws/supabase/postgres:17.6.1.064
until docker exec p002bench pg_isready -U postgres; do sleep 2; done

# 2. the delivered schema, in order
docker cp supabase/migrations p002bench:/mig
for f in 0001_conventions 0002_profiles 0003_sources 0004_extractions 0005_places \
         0006_saved_places 0007_functions 0008_revoke_hosted_defaults 0009_function_grants \
         0011_merge_chains_and_invariant_scope 0012_places_column_grant_and_service_role_matrix; do
  docker exec p002bench psql -U postgres -v ON_ERROR_STOP=1 -q -f /mig/$f.sql
done
# 0008 emits three NOTICEs about supabase_admin default privileges: expected off-platform, harmless.

# 3. the geography column + GiST index (08 §6.4's escape-hatch migration, verbatim)
docker cp docs/evidence/db/bench/. p002bench:/
docker exec p002bench psql -U postgres -q -f /postgis.sql   # see note below
docker exec p002bench psql -U postgres -q -f /harness.sql

# 4. all three scales, timings + EXPLAINs  (~12 min; writes the equivalent of raw/all-scales.txt)
docker exec p002bench chmod +x /all.sh
docker exec p002bench bash -c /all.sh > all-scales.txt 2>&1

# 5. correctness, the chain sweep, and the KNN flip-point (run at the 5M state left by step 4)
docker exec p002bench psql -U postgres -q -f /correctness.sql
for a in 0 10000 90000 400000; do docker exec p002bench psql -U postgres -q -v add=$a -f /chain.sql; done
docker exec p002bench psql -U postgres -q -f /knn.sql
docker exec p002bench psql -U postgres -q -f /knn2.sql

docker rm -f p002bench
```

`setup-postgis.sql` in `bench/` creates the GiST index and vacuums; the `create extension postgis` +
`alter table … add column geog` half is quoted in §1 above and is run once before `all.sh`
(`all.sh` assumes the generated column already exists, because `TRUNCATE` preserves it).

Scripts: [`bench/`](bench/) — `seed.sql` (the data generator; disables the constraint triggers for
bulk load and re-enables them, inserting valid aliases and provenance rows regardless),
`harness.sql` (the p50/p95 timer), `run.sql` (the ten benchmarks), `explain.sql`,
`nogist.sql`, `correctness.sql`, `chain.sql`, `knn.sql`, `knn2.sql`, `reset.sql`, `all.sh`.

## 9. Caveats, stated plainly

- **One machine, one container.** Apple M4-class arm64, 14 cores visible, 8 GB to the VM, container
  defaults: `shared_buffers` 128 MB, `effective_cache_size` 128 MB, `work_mem` 4 MB, `jit on`. At
  scale C the 793 MB `places` heap does not fit in cache, so both designs pay real I/O — equally.
  Supabase's smallest paid instance is better provisioned than this; the scale A and B numbers,
  which are the ones the decision rests on, are fully cached and unaffected.
- **Measured through the `postgres` superuser with an explicit `user_id = <uuid>` predicate**, not
  through `authenticated` + RLS. `saved_places_select_own` is `user_id = (select auth.uid())`, an
  InitPlan evaluated once per statement, which produces the same predicate on the same index; but
  this benchmark does not *prove* the RLS-resident form plans identically. `0008_policy_tests.sql`
  proves the policy's semantics; plan equivalence under RLS is asserted here, not measured.
- **The first PostGIS-typed statement in a fresh session plans in ~11 ms** (repeatedly: 10.6–14.3 ms
  across runs) versus 0.02–0.15 ms for the plain form, from extension catalogue lookups. It is a
  per-session one-off, it is excluded from the p50/p95 tables above, and on Supabase's pooled
  connections it would be amortised — but it is another cost the plain design does not have.
- **Seeded coordinates are uniform-random inside three city rectangles.** Real POI density is
  clustered along streets, which would make every viewport either denser or emptier than measured.
  The direction of that error is the same for both designs.
- The `saved_place_sources`, `sources` and `place_provider_refs` rows exist and are valid, but no
  benchmark joins them; the numbers say nothing about provenance queries.
