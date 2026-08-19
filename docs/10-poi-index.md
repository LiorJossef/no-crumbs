# 10 — The POI index: the table the resolver actually searches

> Status: **APPROVED and EXECUTED 2026-08-18.** All four §12 questions were ruled on as recommended
> (`poi_*` names, zero browser grants, single-candidate → `confirm`, `alt_names` now). Implemented in
> [`supabase/migrations/0010_poi_index.sql`](../supabase/migrations/0010_poi_index.sql), owned and
> corrected by **supabase-database**, which found seven defects by executing it.
>
> **What "executed" means here, precisely:** `0001`–`0010` applied in order against a throwaway
> `public.ecr.aws/supabase/postgres:17.6.1.064` container — the image the hosted projects are built
> from — where `postgres` is non-superuser and the `supabase_admin`-owned default privileges are
> present. `inventory.sql` returns `PASS 1`–`8`; the 19 MS4 policy assertions pass. Independently
> re-run from a clean container by the coordinating session, same result. It has **not** run via
> `supabase db reset`, in CI, or against either hosted project, and no real Overture data has ever
> been in the table. Owner: maps-geospatial with supabase-database. Created 2026-08-18, MS5.
>
> Changes made during implementation are marked **[implementation]** below.
>
> Why it exists: `technical-design.md` §130 named "our Postgres POI index" and §359 resolves
> "against our Overture index", but no table was ever designed and none exists. MS5 was scheduled as
> "port a scorer" and would have opened with an undesigned schema decision. This is that decision,
> written before the SQL, the same way `technical-design.md` was written before MS4's.

## 0. The decision in one block

| Question | Answer |
|---|---|
| One table or two? | **Two new tables** — `poi_regions` (what is loaded) and `poi_index` (the POIs) |
| Does it live in `public.places`? | **No.** `places` is user-facing identity; `poi_index` is a rebuildable search index. §1 |
| Extension | **`pg_trgm`**, one, for the name prefilter. §5 |
| Who may read it? | **`service_role` only.** No browser role holds any grant. §6 |
| Who may write it? | The ingest job, as `service_role`. Never a user, never `resolve_place()` |
| Identity | `(source_dataset, dataset_place_id)` — Overture's GERS id, natural and stable |
| Reload | Per region, transactional delete-and-load. The whole table is disposable by design |
| Rows at V1 | 165 685 across three cities (⟦M⟧ `06` §3.1) ≈ 45 MB with the trigram index |

## 1. Why this is not `public.places`

The temptation is to put 165 685 Overture rows into `places` and be done. That would break three
things `08` deliberately built, and it is worth being explicit about which:

1. **The alias invariant.** `places` carries a deferred constraint trigger (`places_alias_required`,
   [0005](../supabase/migrations/0005_places.sql)) requiring every row to have a `place_provider_refs`
   entry. Bulk-loading a city means 35 000 places plus 35 000 alias rows, per city, for POIs no user
   has ever saved.
2. **The merge chain.** `merged_into_place_id`, `merge_places()` and the tombstone rule exist so that
   *a user's saved row* never dangles. None of that means anything for an index row that will be
   deleted wholesale on the next reload.
3. **The writer rule.** `08` §3.6 makes `resolve_place()` the only way a `places` row is created, and
   that is load-bearing for the near-duplicate guard. An ingest that bypasses it weakens the
   invariant; an ingest that goes through it is 35 000 function calls doing dedup work that the
   source dataset already did.

So the boundary is: **`poi_index` is a candidate source, `places` is what a user chose to keep.**
There is deliberately **no foreign key** between them. When a user confirms a candidate, the existing
path is unchanged — `resolve_place(name, category, lat, lng, provider := 'overture',
provider_place_id := poi_index.dataset_place_id, ...)` — and identity continues to flow through
`place_provider_refs` exactly as `08` designed. Dropping and rebuilding the entire POI index cannot
affect a single saved place. That property is the point.

## 2. `poi_regions` — what is loaded, and what therefore cannot be found

This is the table that lets the resolver answer `regionLoaded()` (`06` §7.3) instead of a
bare "not found", which is the difference between an honest failure and a broken one. (**Corrected
2026-08-19:** `resolveOne` was a method name that existed in no interface; the port is
`PlaceResolver.resolve`, and `region_loaded` is derived from `ResolveResult.regionsSearched` rather
than stored beside it — `11` §2.)

```sql
create table public.poi_regions (
  id              text primary key check (id ~ '^[a-z][a-z0-9_]{1,15}$'),  -- 'tlv', 'tyo', 'ldn'
  display_name    text        not null,
  country_code    char(2)     not null check (country_code ~ '^[A-Z]{2}$'),
  -- The ingest bbox, kept so a region's extent is a fact in the database and not
  -- a constant in a script nobody reads. WGS84, same convention as everything else (0001).
  min_lat         double precision not null check (min_lat between -90  and 90),
  max_lat         double precision not null check (max_lat between -90  and 90),
  min_lng         double precision not null check (min_lng between -180 and 180),
  max_lng         double precision not null check (max_lng between -180 and 180),
  dataset_release text        not null                       -- e.g. '2026-07-22.0' — pinned, §7
                  check (length(btrim(dataset_release)) between 1 and 40),   -- [implementation]
  norm_version    smallint check (norm_version is null or norm_version > 0),
                                                 -- §4 drift guard. **[implementation]** moved here
                                                 -- from poi_index: a region loads atomically, so the
                                                 -- normaliser version is a property of the load, and
                                                 -- the resolver checks three rows instead of joining
                                                 -- 165 k identical smallints
  row_count       integer     not null default 0,
  ingested_at     timestamptz,
  is_loaded       boolean     not null default false,
  constraint poi_regions_bbox_ordered check (min_lat < max_lat and min_lng < max_lng)
);
```

`is_loaded` is set true only at the end of a successful load, in the same transaction. A half-loaded
region is therefore indistinguishable from an absent one, which is the correct failure direction.

**Region assignment is by bbox containment at ingest**, not at query time: a POI gets exactly one
`region_id`, resolved when it is loaded. Overlapping bboxes are a configuration error and the loader
rejects them rather than silently double-counting.

## 3. `poi_index` — the POIs

```sql
create table public.poi_index (
  source_dataset      text not null check (source_dataset = 'overture-places'),
  dataset_place_id    text not null check (length(btrim(dataset_place_id)) between 1 and 128),
  region_id           text not null references public.poi_regions (id) on delete cascade,

  name                text not null check (length(btrim(name)) between 1 and 300),
  name_norm           text not null check (length(name_norm) between 1 and 1000),
                                            -- §4. Written by the loader, never derived in SQL.
                                            -- [implementation] 1000, not 300 like `name`: NFKD
                                            -- DECOMPOSES. Measured on PG17, a 300-character
                                            -- precomposed Hangul string is 900 characters after
                                            -- normalisation, and jamo are letters, not combining
                                            -- marks, so mark-stripping does not undo it. At 300 a
                                            -- legal Korean or Japanese name would be rejected — and
                                            -- since a region loads as one COPY in one transaction,
                                            -- one such row takes the whole 35 k-row load down.
  alt_names           text[] not null default '{}',   -- §11. Empty in MS5, by decision

  provider_category   text,                 -- Overture categories.primary, verbatim
  address_line        text,                 -- §3.1 — this is what disambiguates branches
  locality            text,

  lat                 double precision not null check (lat between -90  and 90),
  lng                 double precision not null check (lng between -180 and 180),
  dataset_confidence  real not null default 0.5 check (dataset_confidence between 0 and 1),

  ingested_at         timestamptz not null default now(),

  primary key (source_dataset, dataset_place_id)
);
```

Notes on three columns that are easy to get wrong:

**`source_dataset` is constrained to a single value on purpose.** It is the enforcement of `06` §11
Q2's narrowing: an ODbL-derived row cannot enter this table without a migration that changes this
`CHECK`, and that migration is the trigger to answer the share-alike question properly. A promise in
a document does not survive a busy afternoon; a `CHECK` does.

**`address_line` and `locality` are not decoration.** `06` §6.2's entire disambiguation model is
"certain of the business, uncertain which branch" — AFURI at margin 0.002, Monmouth at 0.012. A
review sheet that lists five rows all called "AFURI" with no address is not a disambiguation UI. The
scorer does not read these columns; the UI cannot work without them.

**`dataset_confidence` defaults to 0.5** because the scorer's `0.10·dataset_confidence` term already
does `conf or 0.5` ([resolve-overture-scored.py:76](evidence/places/resolve-overture-scored.py)), and
a default in the column is one fewer null-coalesce in the port. **[implementation, 2026-08-19] The
default must never be what a loaded row actually holds** — `conf = 0.5` reproduces 0 of the 220
benchmark rows, so a region loaded at the default cannot prove MS5 exit criterion 3's `score`
column. The loader writes the measured Overture value for every row and counts any it had to default
(`confidence_defaulted_to_0_5` in its manifest; **0** for Tel Aviv, where Overture has no null
confidences at all). §7.1.

### 3.1 What is deliberately absent

No `category` in our own taxonomy (derived at save time by `resolve_place`, not stored twice), no
`updated_at`/`touch` trigger (rows are never updated in place — the region is reloaded), no
`last_verified_at` (that is freshness of a *saved* place and belongs on `places`, migration 0010),
and no RLS policy (see §6 — the table has no policy because no role may read it).

## 4. Normalisation: the one thing that can silently break

`name_norm` is written by the loader and compared against a query normalised by the resolver. If
those two normalisations ever differ, **matching degrades quietly** — no error, just a coverage drop
that looks like bad data.

Postgres cannot help here: the benchmark's `norm()` does NFKD plus combining-mark stripping, and
`unaccent()` is not `IMMUTABLE`, which is exactly why [0001](../supabase/migrations/0001_conventions.sql)
says `place_name_key` "deliberately does NOT fold diacritics". So a generated column is not available
and the normalisation must live in application code.

The design is therefore:

1. **One implementation**, exported from **`src/domain/places/normalise.ts`**, used by both the
   loader and the resolver. The loader is TypeScript for this reason alone.
   **Corrected 2026-08-19 (MS5 task 2): this said `integrations/places/normalise.ts`, which was
   not a preference but an ESLint error.** The scorer is `domain/places/` and `domain/` may not
   import `integrations/` — `no-restricted-imports` in `eslint.config.mjs`, measured against both
   the `@/integrations/...` and the `../../integrations/...` form. It is also the right layer on
   its own merits: the function is pure, has no vendor in it, and defines a domain concept. The
   ingest loader in `scripts/` imports it from `domain/`; `scripts/` has no lint zone, so the
   "one implementation" property survives the move intact. `11` §3.
2. **`norm_version` on `poi_regions`**, bumped whenever that function changes. The resolver asserts
   the version it compiles with matches the version of every loaded region, and **refuses to serve**
   on a mismatch rather than serving degraded results. A normalisation change means a reload; this
   makes forgetting loud. **[implementation]** It sits on `poi_regions`, not on each POI row: a
   region is loaded in one transaction, so the version describes the load.
3. **A porting test**, not just a unit test: the TS `normalise()` must produce byte-identical output
   to the Python `norm()` for all 44 benchmark queries plus a 1 000-row sample of ingested names.
   **Half done 2026-08-19:** all 44 queries plus 18 adversarial cases pass byte-for-byte against
   pinned output from the unmodified prototype
   ([`tests/unit/places/normalise.test.ts`](../tests/unit/places/normalise.test.ts)). **Closed
   2026-08-19 (MS5 task 5):** the 1 000-row sample of *ingested* names is pinned from the same
   unmodified prototype and passes 1 000/1 000
   ([`tests/unit/places/normalise-sample.test.ts`](../tests/unit/places/normalise-sample.test.ts),
   data in [`evidence/places/normalise-name-sample-tlv.json`](evidence/places/normalise-name-sample-tlv.json));
   613 of the 1 000 names are non-ASCII and 590 are Hebrew, which is where the `\w` porting trap
   below would have shown up. One bounded divergence is recorded in the
   function's header: `unicodedata.combining(ch)` has no JavaScript equivalent, so the strip is
   `\p{Mn}`, which differs from Python only on non-spacing marks of combining class 0 (Thai, Lao,
   Khmer, some Indic) — none of which occurs in a Tel Aviv, Tokyo or London extract.

**The known porting trap, recorded so the port does not fall into it:** Python's `\w` is
Unicode-aware, JavaScript's is ASCII-only unless the `u` flag and `\p{L}\p{N}` are used. A literal
port of `re.sub(r"[^\w\s֐-׿　-鿿]+", " ", s)` strips **every Hebrew and Japanese character**, which
would break precisely the cases `06` §7.1 is about — and it would fail as silent coverage loss, not
as an exception.

## 5. The prefilter, `pg_trgm`, and the recall problem nobody has measured yet

`06` §6.1 step 3 is *"whole-string similarity > 0.72 OR any distinctive query token present as a
substring"*, measured at 18–2 904 candidates per query. It was implemented in DuckDB, which has
`jaro_winkler_similarity`. **Postgres does not** — `fuzzystrmatch` offers levenshtein, soundex,
metaphone and Daitch-Mokotoff, not Jaro-Winkler. The prefilter therefore **cannot be ported
literally**, and this is the single largest technical risk in MS5.

Proposed shape:

```sql
select dataset_place_id, name, name_norm, provider_category, address_line, locality,
       lat, lng, dataset_confidence
  from public.poi_index
 where region_id = any($1)                        -- scoping: 06 §6.1 step 2, non-negotiable
   and (name_norm operator(extensions.%) $2       -- trigram similarity, index-backed
        or name_norm like any($3))                 -- OR any distinctive token as a substring
 order by extensions.similarity(name_norm, $2) desc
 limit 500;
```

Two things about this are **changes in behaviour, not a port**, and both must be measured before the
scorer is believed:

1. **`%` is trigram similarity, not Jaro-Winkler.** Different metric, different recall set. The
   threshold (`pg_trgm.similarity_threshold`, default 0.3) is not comparable to 0.72 and must be
   tuned empirically, not converted.
2. **`limit 500` is new.** The Python prefilter had no cap and one query returned 2 904 rows. A cap
   is necessary — 8 candidates per import × unbounded rows is the difference between a fast route and
   a timeout — but a cap can silently exclude the true match.

**[implementation] What the plans actually show, including a result that contradicts a cleaner
story.** On 50 k synthetic rows, each arm of the prefilter is individually index-backed: the
`operator(extensions.%)` arm, the `like any(array[...])` arm, and an `OR` of the two all plan as
`Bitmap Index Scan` on `poi_index_name_trgm_idx`, combining under a `BitmapOr`. But the **combined
predicate's plan was not stable**: the same query, on the same data, planned as a `Seq Scan` in one
run and a `BitmapOr` minutes later. Index use here is a *cost decision* sensitive to statistics, not
a structural guarantee — so neither "it is index-backed" nor "it seq-scans" is a safe thing to write
down yet. Both runs used synthetic names, which tell you the plan shape and nothing about real
selectivity or real GIN index size. **The plan must be re-measured on the loaded 165 k-row extract
with real names, and that measurement belongs in the same gate as recall, below.**

Also measured: `region_id` is applied as a post-`Filter` above the `BitmapOr`, not as an index
condition. Scoping is correct but not index-narrowed. Making it one would need `btree_gin` — a second
extension, which check 8 now forbids — and at three regions that is not worth spending the extension
on. Recorded so it is a known trade, not a surprise at twelve cities.

**The gate on both:** for all 44 benchmark cases, the row that the scorer eventually ranks first must
be present in this prefilter's output, and its rank by trigram similarity must be recorded. If any
case's winner falls outside the top 500, the cap is wrong and moves; if any case's winner is missing
entirely, the threshold is wrong and drops. Recall is validated before the scorer is scored — a
scorer cannot rank a row the prefilter never returned, and that failure mode reads as "the scorer
regressed", which sends the debugging in the wrong direction.

**[implementation] `pg_trgm` is installed into the `extensions` schema, not `public`** — and this is
a security decision, not tidiness. **Verified by execution**, not argued: `inventory.sql` check 6
passes with the extension installed, and the unqualified `%` operator **errors outright**
(`operator does not exist: text % unknown`) under `search_path = public, pg_temp` — so
qualification is mandatory, not stylistic, and a query that forgets it fails loudly rather than
silently seq-scanning. The extension creates ~10 functions, and every new function is
`EXECUTE`-able by `PUBLIC` by default; that default is the exact defect
[0009](../supabase/migrations/0009_function_grants.sql) exists to repair. In `public`, each of those
functions becomes a grant to `anon` and `authenticated`, and `inventory.sql` check 6 — which is
exhaustive over `public`'s functions in both directions — would fail with a dozen entries. The cost
is that the operator class and the similarity operator must be schema-qualified, which is why the
query above reads `operator(extensions.%)` rather than `%`: only the operator form is index-backed
(`similarity(...) > x` is not), and the qualified form does not depend on the caller's `search_path`.

Indexes:

```sql
create index poi_index_name_trgm_idx on public.poi_index
  using gin (name_norm extensions.gin_trgm_ops);
create index poi_index_region_idx    on public.poi_index (region_id);
create index poi_index_lat_lng_idx   on public.poi_index (lat, lng);   -- manual "search near me"
```

`alt_names` gets **no index in MS5** — it is empty until the alias join exists, and an index on an
empty array column is pure cost.

## 6. Grants, RLS, and the writer

Consistent with everything MS4 established, and with `security.md`'s deny-by-default posture:

```sql
alter table public.poi_regions enable row level security;
alter table public.poi_regions force  row level security;
alter table public.poi_index   enable row level security;
alter table public.poi_index   force  row level security;

revoke all on public.poi_regions from anon, authenticated;
revoke all on public.poi_index   from anon, authenticated;
-- and no policy is created for either table, deliberately.

-- [implementation] service_role's privileges are granted EXPLICITLY, not inherited.
grant select, insert, update, delete on public.poi_regions to service_role;
grant select, insert, update, delete on public.poi_index   to service_role;
```

**[implementation] "`service_role` bypasses RLS" is not a substitute for a table privilege, and this
nearly bit.** Measured: without those grants, `service_role` reaches both tables *only* through the
`supabase_admin`-owned `ALTER DEFAULT PRIVILEGES` — the same legacy auto-grant `0008` exists to
neutralise for the browser roles, and which `ms4-database.md` records as deprecated and removed on
2026-10-30. BYPASSRLS skips the *policy* check, not the *privilege* check. Every other table would
merely lose a redundant privilege when that default disappears; these two have exactly one reader and
one writer and would lose all access — in the import path, on a hosted project, at run time.
`TRUNCATE` is deliberately not granted: a reload is a per-region `DELETE` inside the load
transaction.

**[implementation] The seed rows are inserted before those `ALTER` statements — defensively, not out
of necessity, and the original justification here was wrong.** The claim was that `FORCE ROW LEVEL
SECURITY` applies to the owner too, so a policy-less table could not be seeded afterwards. Measured:
the migration role is `postgres`, which carries `rolbypassrls`, and the insert succeeds on either
side of the `ALTER`. The ordering stays because it is the only one that is correct for *every* role
and it costs nothing — but it is belt-and-braces, not a constraint, and saying otherwise would have
taught the next reader something false.

**No policy, no grant, no browser access.** Resolution and manual search both run server-side —
they must, because `06` §11 Q6 requires the rate limits to be enforced server-side with the user id
as the key, and a client that can query `poi_index` directly with the anon key has no rate limit at
all. `service_role` bypasses RLS, which is how the ingest writes and how the route reads.

This also means MS4's proof must be extended, or it silently stops covering the schema. **Corrected
during implementation:** checks 3 and 4 need no new entries — both compare actual against expected
*exhaustively in both directions*, so a leaked grant on a new table surfaces as `UNEXPECTED` without
anyone remembering to list it. That is the better property, and it is why those checks were written
that way. What did need changing is narrower: **check 1**'s hardcoded table count (9 → 11, and the
count is asserted precisely so an undesigned table is noticed), **check 2**'s and **check 6**'s
explanatory messages, and **check 8**'s allow-list gaining `pg_trgm`.

## 7. Ingest

The extraction half is already proven and is not rewritten:
[`ingest-overture-city-extract.py`](evidence/places/ingest-overture-city-extract.py) pulls a city
bbox straight from the public Overture S3 release via DuckDB + httpfs, measured at 7–24 s per city.
It is promoted from evidence to `scripts/`, with three changes:

1. **The release is pinned and recorded**, not implicit. `2026-07-22.0` is already hardcoded; it
   moves to a named constant, is written into `poi_regions.dataset_release`, and the ingest refuses
   to load a region whose release differs from the constant without an explicit `--allow-release-change`.
   Without this the "reproduces the benchmark" exit criterion is not reproducible.
2. **The food-and-drink category filter moves into the extract** (`06` §7.4 — the Tel Aviv extract is
   85.9% not food and drink — the "43% lawyers and estate agents" in that section is corrected in
   §7.1; the filter is what keeps the extract at 14–35% of raw size).
3. **The load half is TypeScript**, because it must call the same `normalise()` the resolver uses
   (§4). Split: Python/DuckDB writes parquet or CSV, a TS loader normalises and `COPY`s into
   Postgres. Both halves are committed; neither runs in the request path or in CI.

Reload semantics, per region, one transaction:

```
begin;
  delete from poi_index where region_id = $r;      -- ~35 k rows; no cascade reaches places
  copy   poi_index (...) from stdin;
  update poi_regions set row_count = ..., ingested_at = now(), is_loaded = true where id = $r;
commit;
```

Adding a city stays a one-command change (`06` §7.3), which is the claim the honest-limit argument
rests on.

### 7.1 [implementation] Executed for Tel Aviv, 2026-08-19 (MS5 task 5)

Three files, one config: [`scripts/poi-ingest.config.json`](../scripts/poi-ingest.config.json) holds
the release pin, the region bboxes and the food-and-drink lists;
[`scripts/ingest-overture-extract.py`](../scripts/ingest-overture-extract.py) extracts and filters;
[`scripts/load-poi-region.ts`](../scripts/load-poi-region.ts) normalises with `normalise()` and
writes a COPY body; [`scripts/ingest-poi-region.sh`](../scripts/ingest-poi-region.sh) runs the one
transaction. `norm_version` comes from `NORM_VERSION` in `src/domain/places/normalise.ts` — read by
the loader, never re-typed, so the loader and the resolver cannot disagree about it.

**Row counts, for exit criterion 4** (release `2026-07-22.0`, recorded in full in
[`evidence/places/ingest-tlv-row-counts.json`](evidence/places/ingest-tlv-row-counts.json)):

| | Rows |
|---|---|
| Raw Tel Aviv bbox extract | **35 430** (16–18 s, 840 KB CSV after filtering) |
| After the food-and-drink filter | **4 997** (14.1% of raw) |
| Rejected by the loader (no name, name > 300 chars) | **0** |
| Loaded into `poi_index` for `tlv` | **4 997**, `norm_version = 1`, `is_loaded = true` |

Reloading is idempotent (`DELETE 4997` / `COPY 4997`), and both guards were exercised in both
directions: a `dataset_release` of `2026-08-19.0` is refused unless `--allow-release-change` is
passed, and a bbox that disagrees with `poi_regions` is refused outright.

**`dataset_confidence` is loaded from the dataset, and the `default 0.5` is now dead weight for
`tlv`:** 0 of 4 997 rows sit at 0.5, the values span 0.043–0.9996 across 4 757 distinct values, and
the measured confidences reproduce the benchmark's `score` column for **71/71** result rows in the
Tel Aviv bbox (`evidence/places/measure-dataset-confidence.py`). One precision note: the column is
`real` and Overture's `confidence` is a double, so the stored value differs from the measured one by
up to 2.98 × 10⁻⁸ — 3 × 10⁻⁹ of `score`, which cannot move a 3-dp comparison or a band.

**§4.3's owed half is closed.** `normalise()` is byte-identical to the prototype's `norm()` on a
1 000-name sample of the *ingested* extract (613 non-ASCII, 590 Hebrew) —
`tests/unit/places/normalise-sample.test.ts`, 1 000/1 000.

**Three things the measurement contradicts, none of them papered over:**

1. **`06` §7.4's "the Tel Aviv extract is 43% lawyers, estate agents and professional services" is
   not reproducible**, and this document repeats it above. On the pinned release those categories are
   `lawyer` 1 509 + `professional_services` 986 + `real_estate` 927 + `real_estate_agent` 237 =
   **3 659 of 35 430 = 10.3%**; a deliberately generous professional-services grouping reaches 16.8%.
   The defensible number is that **85.9% of the raw extract is not food and drink** (30 433 of
   35 430), which is the point the 43% was making. `06` §7.4 corrected in the same commit.
2. **The filter is wrong at both margins.** Its substring patterns admit **377 non-food rows** (7.5%
   of the load) — `%bar%` catches `barber` (168) and `%pub%` catches `public_and_government_association`,
   `public_relations`, `public_plaza`, `public_toilet` — while dropping real food-and-drink
   categories: `delicatessen` 96, `butcher_shop` 86, `lounge` 36, `candy_store` 30, `sandwich_shop`
   27, `chocolatier` 18, `gelato` 8. Two of those are named in the scorer's own `CAT_TOKENS`
   (`deli`, `lounge`), so those tokens can never fire on loaded data. **Left exactly as measured in
   `evidence/places/measure-extract-size.py`**, deliberately: `06` §3.1's 165 685-row storage model
   was measured with this predicate, and re-cutting the list is a calibration change that should be
   ruled on, not smuggled into an ingest task.
3. **Consequence for task 7, stated up front:** the benchmark scored the *unfiltered* extract, so 13
   of the 66 Tel Aviv `overture_id`s in `raw-overture-scored.json` are not in the loaded index (14 of
   its 71 result rows). Twelve are correctly-dropped non-food rows; the thirteenth is **TLV-13's
   rank-1 row, `I Love Sandwich` (`sandwich_shop`)**. TLV-01/03/05/06/11/13/14 therefore cannot have
   their full top-5 replayed verbatim, and TLV-13's top-1 will change. The `score` column is
   replayable for the 57 rows that survive.

## 8. What resolution looks like end to end

1. Normalise the candidate (`normalise()`, §4 — `src/domain/places/normalise.ts`).
2. Map `cityHint` → `region_id` via `poi_regions`. No hint → all `is_loaded` regions.
   **`region_loaded` in the result is false when the hint mapped to nothing** — this is what lets the
   UI say *"we don't have Lisbon yet"* rather than *"not found"*.
3. Prefilter (§5).
4. Score in TypeScript — the constants object, ported per `06` §6.1 step 4.
5. Rank, top 5, `margin = score₁ − score₂`, band per `06` §6.2.

**One inherited defect to fix in the port, not to reproduce:** the Python sets `margin = 1.0` when
the prefilter returns exactly one row
([resolve-overture-scored.py:78](evidence/places/resolve-overture-scored.py)). A single-candidate
query therefore sails through the `margin ≥ 0.05` gate on score alone — the margin gate, the idea
`06` §12 tells the examiner is worth defending, is inert in exactly that case. The port should treat
a single candidate as **unmeasured margin**, not perfect margin, and the decision on what that means
for the band is §12 Q3 below. **Made structural 2026-08-19:** `Confidence.margin` is typed
`number | null`, so the port cannot reproduce the defect without deciding what `null` means, and
§12 Q3's ruling (`confirm`) is the only band a null margin can reach. `11` §2.

## 9. Size

| | Rows | Storage |
|---|---|---|
| 3 cities, food-and-drink only (⟦M⟧ `06` §3.1) | 165 685 | ~45 MB incl. trigram index |
| ~12 cities, extrapolated | ~660 k | 150–180 MB |
| Supabase free tier | | 500 MB |

A global food-and-drink extract would be ~20 M rows / 4–6 GB and does not fit. That is the arithmetic
behind region scoping being a design property rather than a limitation we apologise for.

## 10. Migration 0010, in full

1. `pg_trgm` — **[implementation]** not a bare `create extension`. `create schema if not exists` is
   *not* a safe no-op: Postgres checks `CREATE` on the **database** before it checks whether the
   schema exists, so a project whose migration role lacks that privilege fails on the migration's
   very first statement even though `extensions` is already there (measured). It is now a guarded
   create, plus two assertions that fail with named errors: that `pg_trgm` really landed in
   `extensions` (`IF NOT EXISTS` ignores `WITH SCHEMA`, so a prior dashboard install into `public`
   makes the create a silent no-op and `extensions.gin_trgm_ops` fail cryptically three statements
   later), and that `service_role` holds `USAGE` on the schema (without it the prefilter fails at
   query time, in the import path).
2. `poi_regions`, `poi_index`, the three indexes, RLS forced, grants revoked, no policies.
3. Seed the three region rows with `is_loaded = false`.
4. **The four columns `06` promised and MS4 did not ship** — `places.source_dataset`,
   `places.source_dataset_id`, `places.resolution_score`, `places.last_verified_at`. `06` §0 lists
   them as persisted-per-place and §7.5 says `last_verified_at` "is added now"; none is in
   [0005](../supabase/migrations/0005_places.sql). Until they exist, `06` §11 Q2's statement that
   ODbL rows are "marked via `source_dataset`" is not true of the running schema.
5. `resolve_place()` gains the corresponding parameters — a signature change, so the grant list is
   re-stated and `scripts/check-migration-grants.sh` re-run. `08` §3.6's revoke/grant pattern is
   copied exactly, including revoking from `public` first.
6. `inventory.sql` checks 3/4 extended to the new tables.

## 11. Deliberately not solved here

- **The OSM alias join** (`06` §7.1a). Out of MS5 (`implementation-plan.md` MS5). `alt_names` and
  `norm_version` are the two hooks it will need, and they cost one column each now versus a migration
  and a full reload later. **Tel Aviv ships at its measured 8/14 until then, knowingly.**
- **Freshness.** Closed venues persist (`06` §7.5). `last_verified_at` lands on `places` in 0010 so a
  future check is a query, not a rewrite.
- **The resolution cache** — **correction:** the table already exists. `place_lookups`
  ([0007](../supabase/migrations/0007_functions.sql)) is keyed on exactly the
  `sha256(normalised_candidate + region_id + category_hint)` that `06` §6.4 specifies, with
  `expires_at null` meaning cache-permanently for open data. An earlier draft of this document, and
  the MS5 review that preceded it, both said no migration existed for it; that was wrong. Only the
  *caching code* is outstanding, and that is MS7 with the rest of the provider path. 0010 adds
  nothing here.
- **Nominatim.** MS7. Its rows go to `places` via `resolve_place`, never into `poi_index`, which is
  why the `source_dataset` CHECK can be a single literal.
  **[implementation] One licensing-relevant behaviour, verified and now commented in 0007's
  successor:** `resolve_place`'s near-duplicate branch writes no column of `places`, so a Nominatim
  candidate that lands on an existing Overture place adds an alias and leaves
  `source_dataset = 'overture-places'`. That is *correct* for `06` §11 Q2 — the mark records where
  the row's data came from, and on that path none of it came from the second provider — but it was
  silent, and silent correctness is indistinguishable from an oversight on review.

## 12. Ruled on 2026-08-18 — all four as recommended

1. **Table names — `poi_*`.** Versus `place_index` / `place_regions`. Chosen because I prefer
   `poi_` — it reads as clearly *not* `places`, and confusing the two is the mistake this whole
   document exists to prevent.
2. **Zero browser grants — confirmed (§6).** This commits manual search to a server route with a rate limit,
   rather than a direct `supabase-js` query from the client. It is the right call for `06` §11 Q6,
   but it is a real constraint on MS11's search UI and is easier to agree now than to discover then.
3. **Single-candidate margin — forced to `confirm`.** When the prefilter returns exactly one row, is that
   `preselect` on score alone, or forced to `confirm`? I lean **`confirm`** — "only one thing in the
   index looked like this" is not evidence of correctness, and MS5 can measure how often it happens
   across the 44 cases before committing.
4. **`alt_names` — now.** One unused column and one unused array default, in exchange for the
   alias join not needing a migration plus a 165 k-row reload. I lean now.
