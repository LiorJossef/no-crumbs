-- 0010_poi_index.sql — the POI index the resolver searches, and the four columns 06 promised.
-- Design: docs/10-poi-index.md (written and reviewed before this file, as technical-design.md was
-- before MS4's schema). Four decisions were ruled on in review and are implemented here as ruled:
--   Q1  table names are poi_* — they must not read like `places`, which is the mistake this
--       whole separation exists to prevent
--   Q2  zero grants to browser roles: manual search goes through a server route, because a
--       client that queries this table directly has no rate limit (06 s11 Q6)
--   Q3  a single prefiltered candidate is NOT a perfect margin — enforced in the scorer (MS5),
--       recorded here because the schema is what makes the candidate set observable
--   Q4  alt_names ships now, empty, so the OSM alias join is not a 165k-row reload later
--
-- Forward-only (08 s9): nothing above 0009 is edited. resolve_place is NOT changed by this file --
-- see section 7 below for what was removed from it, why, and why removing it in place was the
-- correct move rather than a further migration. The provenance parameters live in 0014.
--
-- EXECUTED 2026-08-18 against public.ecr.aws/supabase/postgres:17.6.1.064 — the image the hosted
-- projects are built from, with the same roles, the same supabase_admin-owned default privileges
-- and the same pre-existing `extensions` schema — by applying 0001..0010 in order and then running
-- supabase/tests/inventory.sql. What that run proved, and the four things it disproved, are
-- recorded in the comments below at the point each one applies. It is NOT a substitute for a
-- `supabase db reset` in CI or for the policy tests, both of which must still run.

-- ---------------------------------------------------------------------------------------------
-- 1. pg_trgm, and why it is NOT installed into `public`.
--
-- D6 ruled on geometry types (no PostGIS); it did not ban the extension mechanism, and 06 s5 sized
-- POI storage "with a trigram index" from the start. This is the one extension we create, and
-- inventory.sql check 8 is now an allow-list that FAILs on a second one.
--
-- The schema choice is load-bearing, not taste: pg_trgm creates ~10 functions, and every new
-- function is EXECUTE-able by PUBLIC by default (the defect 0009 exists to fix). In `public` they
-- would each become a grant to anon and authenticated, and inventory.sql check 6 — which is
-- exhaustive over public's functions in both directions — would fail with a dozen entries. In
-- `extensions` they are outside the surface check 6 governs, which is where they belong.
-- ---------------------------------------------------------------------------------------------
-- CREATE SCHEMA IF NOT EXISTS is NOT a safe no-op: Postgres checks CREATE on the *database*
-- before it checks whether the schema exists, so on a project where the migration role lacks that
-- privilege the statement fails even though `extensions` is already there (measured: a role
-- without CREATE on the database gets `permission denied for database postgres` from
-- `create schema if not exists extensions` when the schema exists). Every Supabase project ships
-- the schema already, so the create is only ever needed on a bare Postgres; guarding it removes a
-- hosted-only failure mode for nothing. The grants are inside the guard on purpose: on Supabase the
-- schema exists with USAGE already granted to postgres/anon/authenticated/service_role and is owned
-- by `postgres`, and re-granting on a schema this migration does not own would itself fail.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'create schema extensions';
    execute 'grant usage on schema extensions to postgres, anon, authenticated, service_role';
  end if;
end $$;

create extension if not exists pg_trgm with schema extensions;

-- Two preconditions the rest of this file silently depends on, asserted here so a mismatch is a
-- named error in the migration rather than a cryptic one three statements later or, worse, a
-- permission error in the import path at run time.
--   1. IF NOT EXISTS ignores WITH SCHEMA. On a database where pg_trgm was already installed
--      somewhere else (a dashboard click into `public`), the statement above is a silent no-op and
--      `extensions.gin_trgm_ops` below would fail with "operator class does not exist".
--   2. The prefilter (10 s5) calls extensions.similarity() and operator(extensions.%) as
--      service_role. Without USAGE on the schema that fails at query time, not here.
do $$
begin
  if to_regprocedure('extensions.similarity(text,text)') is null then
    raise exception '0010: pg_trgm is not installed in schema `extensions` (found in %). '
      'The trigram index and the prefilter are both schema-qualified; move it or this schema is wrong.',
      coalesce((select n.nspname::text from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                 where e.extname = 'pg_trgm'), 'nowhere');
  end if;
  if not has_schema_privilege('service_role', 'extensions', 'usage') then
    raise exception '0010: service_role lacks USAGE on schema extensions; the POI prefilter would '
      'fail at run time, in the import path, with permission denied.';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. poi_regions — what is loaded, and therefore what CAN be found.
-- This is what lets resolveOne return `region_loaded` (06 s7.3): the difference between
-- "we couldn't find it" and "we don't have that city yet", which is the difference between an
-- honest failure and a broken one.
-- ---------------------------------------------------------------------------------------------
create table public.poi_regions (
  id              text primary key check (id ~ '^[a-z][a-z0-9_]{1,15}$'),
  display_name    text not null check (length(btrim(display_name)) between 1 and 80),
  country_code    char(2) not null check (country_code ~ '^[A-Z]{2}$'),

  -- The ingest bbox, so a region's extent is a fact in the database rather than a constant in a
  -- script nobody reads. WGS84 decimal degrees, lat then lng, per 0001.
  min_lat         double precision not null check (min_lat between -90  and 90),
  max_lat         double precision not null check (max_lat between -90  and 90),
  min_lng         double precision not null check (min_lng between -180 and 180),
  max_lng         double precision not null check (max_lng between -180 and 180),

  dataset_release text not null check (length(btrim(dataset_release)) between 1 and 40),
                                        -- pinned Overture release, e.g. '2026-07-22.0' (10 s7)
  -- The normalisation contract (10 s4). A region is loaded atomically, so the normaliser version
  -- is a property of the load, not of each row: the resolver checks 3 rows here rather than
  -- joining 165k. It refuses to serve on a mismatch instead of quietly matching worse.
  norm_version    smallint check (norm_version is null or norm_version > 0),
  row_count       integer not null default 0 check (row_count >= 0),
  ingested_at     timestamptz,
  is_loaded       boolean not null default false,

  constraint poi_regions_bbox_ordered check (min_lat < max_lat and min_lng < max_lng),
  -- is_loaded is set true only at the end of a successful load, in the same transaction as the
  -- COPY. A half-loaded region is therefore indistinguishable from an absent one.
  constraint poi_regions_loaded_is_complete check (
    not is_loaded or (ingested_at is not null and norm_version is not null and row_count > 0))
);

comment on table public.poi_regions is
  'Which POI regions are loaded, at which dataset release and normaliser version. 3 rows at V1.';

-- ---------------------------------------------------------------------------------------------
-- 3. poi_index — the POIs themselves. A rebuildable search index, NOT user data.
--
-- Deliberately NOT public.places, and deliberately with no foreign key to it (10 s1): places
-- carries the alias-required trigger, the merge-tombstone chain and the resolve_place()-only
-- writer rule, all of which exist for rows a user chose to keep. Dropping and rebuilding this
-- entire table cannot affect a single saved place. That property is the point of the separation.
-- ---------------------------------------------------------------------------------------------
create table public.poi_index (
  -- Overture GERS id. Natural, stable across releases by design, and idempotent on reload.
  source_dataset      text not null check (source_dataset = 'overture-places'),
  dataset_place_id    text not null check (length(btrim(dataset_place_id)) between 1 and 128),
  region_id           text not null references public.poi_regions (id) on delete cascade,

  name                text not null check (length(btrim(name)) between 1 and 300),
  -- Written by the loader, never derived in SQL: the benchmark's normalisation does NFKD plus
  -- combining-mark stripping, and unaccent() is not IMMUTABLE — which is the same reason
  -- 0001's place_name_key deliberately does not fold diacritics. One implementation, in
  -- TypeScript, shared by the loader and the resolver (10 s4).
  -- Upper bound is 3x `name`, not equal to it: normalisation runs NFKD, which DECOMPOSES rather
  -- than shortens. Measured on Postgres 17: a 300-character string of precomposed Hangul
  -- syllables is 900 characters after normalize(..., NFKD), and jamo are letters, not combining
  -- marks, so the normaliser's mark-stripping step does not put them back. A 300-limit here would
  -- reject a legal Korean or Japanese name and, because a region loads as one COPY in one
  -- transaction, one such row would take the whole 35k-row load down with it.
  name_norm           text not null check (length(name_norm) between 1 and 1000),
  alt_names           text[] not null default '{}',   -- empty until the OSM alias join (10 s11)

  provider_category   text,             -- Overture categories.primary, verbatim
  -- Not decoration: 06 s6.2's whole disambiguation model is "certain of the business, uncertain
  -- which branch" (AFURI at margin 0.002, Monmouth at 0.012). A review sheet listing five rows all
  -- called AFURI with no address is not a disambiguation UI. The scorer never reads these columns;
  -- the UI cannot work without them.
  address_line        text,
  locality            text,

  lat                 double precision not null check (lat between -90  and 90),
  lng                 double precision not null check (lng between -180 and 180),
  -- 0.10 * dataset_confidence is a term in the score (06 s6.1). Defaulted here so the port does
  -- not need the `conf or 0.5` coalesce the prototype carries.
  dataset_confidence  real not null default 0.5 check (dataset_confidence between 0 and 1),

  ingested_at         timestamptz not null default now(),

  primary key (source_dataset, dataset_place_id)
);

comment on table public.poi_index is
  'Rebuildable POI search index (Overture extracts). Candidate source for resolution; not user data. Reloaded wholesale per region.';
comment on column public.poi_index.source_dataset is
  'Single permitted value by CHECK, on purpose: this is the enforcement of 06 s11 Q2. An ODbL-derived row cannot enter without a migration that changes this constraint, and that migration is the trigger to answer the share-alike question rather than defer it again.';

-- Indexes. The trigram GIN is what makes the s6.1 step-3 prefilter index-backed; note that the
-- operator class is schema-qualified because pg_trgm lives in `extensions` (s1 above).
create index poi_index_name_trgm_idx on public.poi_index
  using gin (name_norm extensions.gin_trgm_ops);
create index poi_index_region_idx    on public.poi_index (region_id);
create index poi_index_lat_lng_idx   on public.poi_index (lat, lng);   -- manual "search near me"
-- alt_names gets no index until it is populated: an index on an empty array column is pure cost.

-- ---------------------------------------------------------------------------------------------
-- 4. Seed the three benchmark regions, unloaded.
--
-- ORDER MATTERS, but not for the reason it first appears to. FORCE ROW LEVEL SECURITY applies to
-- the table owner too, and these tables deliberately have no policy, so after the ALTER below a
-- role that neither bypasses RLS nor is exempted cannot insert here even as owner. MEASURED
-- (supabase/postgres 17.6.1, the image the hosted projects are built from): the migration role
-- `postgres` has rolbypassrls = t, so it can in fact insert after the ALTER — the ordering is
-- defensive, not load-bearing, and the sharp edge is real only for a migration run by a role
-- without BYPASSRLS. It costs nothing to keep and it is the only ordering that is correct for
-- every role, so it stays; what does not stay is the claim that it was required.
-- The ingest loader runs as service_role (rolbypassrls = t) and is unaffected either way.
--
-- lat before lng, per 0001. The bboxes are exactly those measured in
-- evidence/places/ingest-overture-city-extract.py (tlv xmin/xmax 34.74/34.86, ymin/ymax
-- 32.03/32.12; tyo 139.60/139.90, 35.58/35.80; ldn -0.30/0.05, 51.42/51.60) — read that file's
-- x=lng, y=lat carefully against the column order below before changing anything here.
-- ---------------------------------------------------------------------------------------------
insert into public.poi_regions
  (id,    display_name, country_code, min_lat, max_lat, min_lng, max_lng, dataset_release) values
  ('tlv', 'Tel Aviv',   'IL',          32.03,   32.12,   34.74,   34.86,  '2026-07-22.0'),
  ('tyo', 'Tokyo',      'JP',          35.58,   35.80,  139.60,  139.90,  '2026-07-22.0'),
  ('ldn', 'London',     'GB',          51.42,   51.60,   -0.30,    0.05,  '2026-07-22.0');

-- ---------------------------------------------------------------------------------------------
-- 5. RLS and grants: deny-all for every browser-reachable role, and no policy at all.
--
-- No policy is not an omission. Resolution and manual search both run server-side as service_role,
-- because 06 s11 Q6 requires the rate limits to be keyed on the user id and enforced by us — and a
-- client holding SELECT here would have no limiter in front of it. Ruled on in 10 s12 Q2.
-- The revokes are mandatory rather than belt-and-braces: hosted default privileges grant ALL on
-- every new table in `public` to both roles (0008, ms4-database.md s2.3).
-- ---------------------------------------------------------------------------------------------
alter table public.poi_regions enable row level security;
alter table public.poi_regions force  row level security;
alter table public.poi_index   enable row level security;
alter table public.poi_index   force  row level security;

revoke all on public.poi_regions from anon, authenticated;
revoke all on public.poi_index   from anon, authenticated;

-- service_role's grants, stated explicitly rather than inherited. On both the hosted projects and
-- the local image these two tables arrive with ALL granted to service_role by the same
-- supabase_admin-owned ALTER DEFAULT PRIVILEGES that hands anon and authenticated their wide grant
-- (0008, ms4-database.md s2.3) — measured, not assumed. Relying on that default is wrong for these
-- two tables specifically: service_role is their ONLY reader and writer, the legacy auto-grant is
-- deprecated and scheduled for removal, and every other table in this schema would merely lose a
-- redundant privilege if it disappeared while these would lose all access. BYPASSRLS is not a
-- substitute: it skips the policy check, not the table privilege check.
grant select, insert, update, delete on public.poi_regions to service_role;
grant select, insert, update, delete on public.poi_index   to service_role;
-- No TRUNCATE: a region reload is `delete from poi_index where region_id = $r` inside the load
-- transaction (10 s7), which is per-region and rollback-able. TRUNCATE is neither.

-- ---------------------------------------------------------------------------------------------
-- 6. The four columns 06 promised and MS4 did not ship.
--
-- 06 s0 lists source_dataset / source_dataset_id / resolution_score as persisted per place, and
-- s7.5 says last_verified_at "is added now". None of them is in 0005. Until this migration, 06
-- s11 Q2's claim that ODbL-derived rows are "marked via source_dataset" was not true of the
-- running schema — the mark did not exist.
-- ---------------------------------------------------------------------------------------------
alter table public.places
  add column source_dataset     text,
  add column source_dataset_id  text,
  add column resolution_score   real check (resolution_score between 0 and 1),
  add column last_verified_at   timestamptz;

comment on column public.places.source_dataset is
  'Which dataset this row came from, e.g. overture-places or osm-nominatim. Drives per-row attribution on the place card and /attributions (06 s3.2), and marks ODbL provenance (06 s11 Q2).';
comment on column public.places.last_verified_at is
  'Freshness hook (06 s7.5). Closed venues persist in V1; this exists so a future check is a query, not a rewrite.';
comment on column public.places.resolution_score is
  'Score of the most recent resolution that wrote this row. DIAGNOSTIC ONLY, and knowingly imperfect: the score is a property of one user''s candidate string, not of the place, so two users resolving the same venue overwrite each other. It is here because 06 s0 specifies it; the per-user score belongs on saved_places and is revisited in MS9 when the review flow makes it meaningful.';

-- ---------------------------------------------------------------------------------------------
-- 7. resolve_place is NOT touched here. It moved to 0014.
--
-- This file originally dropped the twelve-argument resolve_place and recreated it with the three
-- provenance parameters. That was written before the MS1-MS4 audit branch existed, and it collided
-- with it in both directions:
--   * in numeric order, 0011 (create or replace, twelve arguments) runs AFTER this file's drop and
--     puts the old signature back, so BOTH overloads exist and every twelve-argument call fails
--     with `function public.resolve_place(...) is not unique` at run time, in the import path --
--     exactly the failure the old section 7's own comment said it existed to prevent. MEASURED on
--     supabase/postgres:17.6.1.064 with 0001..0013 applied in order: two rows in pg_proc, and
--     `select public.resolve_place('overture','x1','Cafe Levinsky',32.06,34.77)` raised 42725.
--   * OUT-OF-ORDER ARRIVAL. If 0011-0013 are ever applied to an environment before this file --
--     which is the order the MS5 ledger row believes staging is already in, while
--     db-migration-runbook.md s6 and 0013's header both record staging at 0001-0009; the
--     contradiction is flagged for task 8 and is not resolved here -- then applying this file next
--     would drop the AUDITED function and install a body that never received the audit's fixes.
--     That is a hazard in the file regardless of which reading of staging is true. MEASURED, same
--     image, applying 0001-0009 + 0011 + 0012 + 0013 + this file's original: one resolve_place,
--     zero occurrences of place_survivor_id and zero of pg_advisory_xact_lock in its body -- i.e.
--     merge chains back to one hop (defect 1 of 0011) and the step-2 guard unserialised (defect 5).
-- The two bodies genuinely differ and 0011's is the correct one, so the provenance parameters are
-- added by carrying 0011's body forward in 0014_resolve_place_provenance.sql. Nothing else in this
-- file changed: the extension, the two POI tables, the four `places` columns, the seed rows and the
-- grant/RLS surface are byte-for-byte what the 2026-08-18 run above proved.
--
-- Why this is an edit to 0010 rather than a further migration: `08` s9's forward-only rule protects
-- files that have been APPLIED, and this one has not -- staging and production are at 0001-0009, and
-- this file reached the MS5 branch only on 2026-08-19 (merge e57a898). There is no applied artefact
-- for the rule to protect, and a resolve_place that a later file must un-drop cannot be corrected
-- from a later file at all without recreating the function -- which is 0014. Same reasoning, and
-- the same ruling, as 0013's in-place comment edits to 0011.
-- ---------------------------------------------------------------------------------------------
