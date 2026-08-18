# 08 — Place Identity, Dedup, and the Geospatial Query Model (D5 + D6)

> Owner: Database / Supabase. Date: **2026-08-18**. Status: **decided**.
> Resolves charter §8 **D5** (place identity and dedup key) and **D6** (PostGIS vs plain lat/lng).
> Depends on: `04-tiktok-feasibility.md` (VERIFIED TikTok facts), `03-university-requirements.md`
> (M3/M4/M8/M9 are graded), `product-specification.md` §7.2–7.5 (acceptance criteria I3, I4, A1–A3,
> P1–P4).
>
> **`06-map-and-places-decision.md` did not exist when this was written.** D2 is therefore *not*
> assumed. Every provider-specific fact lives in `(provider, provider_place_id)` string pairs in one
> alias table; no provider name, id format, or field appears anywhere else in the schema. The
> benchmark evidence in `docs/evidence/places/` shows OSM/Nominatim and Overture under evaluation —
> OSM ids are `node/123`-style and are explicitly *unstable* across edits, which this design already
> survives (§1.4). Whatever D2 lands on, only §1.6's provider-slug list changes.

---

## 0. The two decisions, unambiguously

**D5 — place identity.** One physical place is one row in `places`, identified by **our own opaque
`uuid`**, which is the only value `saved_places` ever references. Provider identity is *not* the
identity: `(provider, provider_place_id)` pairs live in a separate `place_provider_refs` table as
**aliases** — many aliases per place, unique per provider pair. Resolution is by exact alias match
first; on miss, a secondary guard merges a candidate into an existing place when the normalised name
is equal **and** the coordinates are within **75 m** **and** the country agrees. Everything else is a
new place. Two branches of a chain are two rows (different provider ids, >75 m apart); the same venue
re-found under a second provider id is one row with two aliases. A retired or changed provider id
never destroys a place — the alias is marked retired and the place, with its coordinates, survives
forever, as charter §3 invariant 3 requires.

**Places are GLOBAL rows, with per-user visibility gated by membership, and a per-user overlay for
anything the user edits.** One `places` row is shared by every user who saved that venue (dedup +
zero repeat provider calls), but the RLS `SELECT` policy on `places` returns a row **only** to a user
who has a `saved_places` row pointing at it. So a user can read exactly the places they saved, never
the union of everyone's saves, and cannot enumerate the table to infer another user's library. The
consequence that makes this safe *and* correct: **users never write global rows.** Renaming,
re-categorising, noting and visit state are all columns on the user's own `saved_places` row, so one
user's edit can never mutate another user's map.

**D6 — no PostGIS.** Coordinates are stored as two `double precision` columns, `lat` and `lng`,
WGS84 / EPSG:4326 decimal degrees. The viewport query is a bounding-box `BETWEEN` filter; "within
N km" is a latitude-corrected bbox pre-filter refined by a 6-line immutable Haversine function. **No
extensions of any kind are required by this schema.** The decisive argument is not "PostGIS is
heavy" — it is that at our scale the selective predicate is `user_id`, not geometry: the index on
`saved_places(user_id)` reduces the candidate set to ≤ a few hundred rows before any coordinate is
compared, so a GiST index would be indexing a dimension that is never the one doing the work.
Revisit thresholds are in §6.4.

---

## 1. D5 in full

### 1.1 The candidates, and why the winner won

| Candidate identity key | Verdict | Why |
|---|---|---|
| `(provider, provider_place_id)` **as the primary key of `places`** | **Rejected as identity, adopted as the resolution key** | Correct 95% of the time and the only key with real-world authority — but it makes the provider the owner of our data model. A provider swap (D2 is still open), an OSM node→way promotion, or a retired Google `place_id` would orphan or duplicate every affected saved place. Provider ids are *facts about* a place, not the place. |
| Name + coordinate proximity | Rejected as primary | Fuzzy, order-dependent, and wrong for the exact case our benchmark set is full of: `TLV-05 Miznon`, `TYO-07 Afuri`, `LDN-07 Padella` — multi-branch venues where two genuine branches share a name and can be a few hundred metres apart. Retained as a *secondary* guard only, with a tight radius. |
| Name + address | Rejected | Addresses are the least reliable field in every provider response (missing, transliterated, formatted differently per provider, `TYO-*` Japanese addressing). Unusable as a key; useful as a disambiguation *display* field. |
| **Our own `uuid`, with provider pairs as aliases** | **ADOPTED** | Identity is ours, stable, and permanent. Provider churn becomes an insert into an alias table instead of a data migration. Costs one extra table and one join at resolution time. |

The one-sentence exam version: *provider ids are how we find a place; our uuid is what the place
is.*

### 1.2 Resolution algorithm (the only way a `places` row is ever created)

Implemented once, in `public.resolve_place(...)` (§3.6), callable only by the trusted server:

```
1. lookup  place_provider_refs by (provider, provider_place_id)
      HIT  -> follow places.merged_into_place_id to the surviving row
              refresh name/address/category/lat/lng/payload if our copy is older
              return that place id                                  [no new row: I3, I4, A2]
2. MISS -> near-duplicate guard:
      select the nearest place where
            name_key = place_name_key(candidate.name)
        AND country_code IS NOT DISTINCT FROM candidate.country_code
        AND lat/lng inside a 75 m latitude-corrected bbox
        AND km_between(...) <= 0.075
      HIT  -> insert the new (provider, provider_place_id) as an additional alias
              return the existing place id                          [same venue, second provider id]
3. MISS -> insert a new places row + its first alias. return the new id.
```

Collision behaviour, stated exactly:

- **Alias collision** (`unique (provider, provider_place_id)`): step 1 already found it. A concurrent
  insert loses to `ON CONFLICT DO NOTHING` and re-reads the winner. Two racing imports of the same
  TikTok therefore produce one place, not two.
- **Same-user duplicate save** (`unique (user_id, place_id)`): `ON CONFLICT DO UPDATE` on the save
  path; the user gets their existing entry back and the *new source* is appended to its provenance.
  This is acceptance criterion **I3** and **I4** verbatim.
- **Near-duplicate guard fires wrongly** (two genuine branches within 75 m — an airport with two
  outlets of the same chain): the user sees one pin instead of two. Accepted, documented, recoverable
  by the user saving the second branch's provider result *if* the provider gives it a distinct id —
  which it will, because the guard only fires on a *miss* of step 1. So the damage is bounded to
  cross-provider or coordinate-drift cases. The inverse error (splitting one venue into two pins) is
  the one users actually notice, and 75 m is calibrated against it: provider coordinate disagreement
  for the same venue (rooftop vs street-centroid vs entrance) is typically < 50 m.
- **Diacritics are not folded** in `place_name_key` (`Café` ≠ `Cafe`), because `unaccent()` is not
  `IMMUTABLE` and cannot back a generated column without pulling in an extension we otherwise do not
  need. Consequence: the guard misses some cross-provider matches. Acceptable — step 1 handles the
  normal case, and a duplicate pin is a cosmetic fault, not a correctness fault.

### 1.3 Branch identity

Two branches of one chain are **two places**, always, and are distinguished by the provider, not by
us: they carry different `provider_place_id`s, so step 1 separates them before any fuzzy logic runs.
The 75 m guard cannot merge them unless a provider places two branches within 75 m of each other.
Branch *disambiguation* — which of five `Miznon`s did the TikTok mean — is a resolution/UX problem
owned by D4 (`09-extraction-and-resolution.md`), not an identity problem. The schema's only
obligation is to make "the user picked branch #3" storable, which it is: the review step resolves to
one alias and saves one place id.

### 1.4 Provider id churn and provider migration

| Event | Behaviour | Data loss |
|---|---|---|
| Provider retires an id | The place row survives untouched. On a failed refresh we set `place_provider_refs.retired_at = now()` and leave the row. Coordinates are ours forever (charter §3.3, and the storage-duration risk in R3 applies to *provider* fields, not to our identity). | none |
| Provider changes an id (OSM `node/123` → `way/456` after an edit) | Next resolution misses step 1, hits the 75 m guard on the same name, and **adds the new id as a second alias**. The place uuid never changes, so every `saved_places` row and every source link stays valid. | none |
| **We switch providers (D2 reversal, or a licensing forced move)** | Nothing in `saved_places` or `places` needs rewriting. Places keep their old aliases as history and gain new-provider aliases lazily, the first time each place is re-resolved (or in a one-off backfill job that walks `places` and calls `resolve_place` with the new provider). Until backfilled, a place with only a stale alias still renders on the map, because name, category and coordinates are our own columns. | none |
| The new provider maps two of our places onto one id | The `unique (provider, provider_place_id)` alias constraint refuses the second alias — a *loud* failure, which is the correct outcome. Repair is `public.merge_places(loser, winner)` (§3.6): re-point `saved_places` (handling the per-user unique), move source links and aliases, then set `places.merged_into_place_id` on the loser as a permanent tombstone so old references still resolve. Nothing is deleted. | none |

This is the whole reason identity is not the provider pair. It is also the answer to "does this
design survive D2 changing its mind", which — with D2 unwritten at the time of writing — it must.

### 1.5 Provider-field namespacing

`places` carries our own normalised columns (`name`, `category`, `lat`, `lng`, `address_line`,
`locality`, `region`, `country_code`) and **one** `provider_payload jsonb` holding the raw response,
namespaced by the alias row that produced it. Provider-specific vocabulary never leaks into a column
name. `provider_category` is kept verbatim next to our normalised `category` so a taxonomy change is
a re-derivation, not a re-fetch.

### 1.6 Provider slugs

`place_provider_refs.provider` is a lowercase slug constrained only by shape
(`^[a-z][a-z0-9_]{1,31}$`), never by an enumerated list, because D2 is open. Two slugs are reserved:
`internal` — a place we created without a provider (a future "drop a pin" feature), whose
`provider_place_id` is the place's own uuid, so the "every place has ≥ 1 alias" invariant is total.

---

## 2. Global vs per-user places — and the RLS consequence (graded, M9)

### 2.1 The decision

Global `places`, global `sources`, global `extractions`; per-user `profiles`, `imports`,
`saved_places`, `saved_place_sources`.

Why global wins:
- **Dedup is the product.** Charter §3 invariant 4 ("the same physical place is one row") is a
  *global* statement in a schema where sharing is possible and a per-user statement otherwise. Both
  satisfy the invariant, but only the global table stops a popular venue from existing 40 times.
- **Provider-call economy.** oEmbed is `cache-control: no-store` (VERIFIED, E5), so every import is
  an origin hit unless *we* cache. The same TikTok pasted by many users is an explicitly expected
  case. A per-user copy of `sources` means paying for, and re-fetching, content we already hold.
- **Provider licensing** (R3) is easier to honour with one refreshable copy of a place than with N
  divergent copies.
- Cost of the alternative: per-user places multiplies row count by the sharing factor, makes the
  "one place, three TikToks" charter statement harder to demonstrate, and gives each user their own
  stale copy of the same venue.

Why per-user was seriously considered: it is trivially RLS-safe (`user_id = auth.uid()` everywhere,
one policy shape, nothing to argue in an exam). That is a real advantage in a project graded on
explainability. It loses because the membership-gated policy below is still a *single* short SQL
predicate, and it buys dedup, caching and licensing hygiene.

### 2.2 The RLS consequence, made explicit

A shared table is only safe if reading it reveals nothing about *who else* is in it. Three rules do
that:

1. **Membership-gated `SELECT`.** `places` and `place_provider_refs` are visible to a user only
   through a `saved_places` row of their own; `sources` and `extractions` only through an `imports`
   or `saved_place_sources` row of their own. A user's readable slice of a global table is exactly
   the set they created. Table enumeration returns their own rows and nothing else — so the union of
   all users' saves is *not* observable, which is the specific leak the shared design risks.
2. **No user-writable global rows.** `authenticated` holds no `INSERT/UPDATE/DELETE` grant on
   `places`, `place_provider_refs`, `sources` or `extractions`, and no policy for those commands
   exists. All global writes are server-side, from provider/LLM output. Two consequences: a user
   cannot poison shared data that another user's map depends on, and a user cannot create a
   plausible-looking fake place for someone else to dedup onto.
3. **Per-user overlay for everything editable.** `saved_places.display_name`, `category_override`,
   `note`, `visit_state`, `visited_at` are the user's own columns. Acceptance criterion **A3**
   ("a saved place can be renamed, re-categorised and deleted by its owner") is satisfied *without*
   touching the shared row. If rename had been an `UPDATE places SET name`, the global table would
   have been indefensible; it is not, so it is defensible.

**Reconciling acceptance criterion P3.** P3 asks that a test authenticating as user B and requesting
"user A's place, library entry, or source row" **fails**. Under this design it does, literally:
B selecting A's `places.id` gets zero rows, because B has no `saved_places` row for it. The
membership gate is what turns a shared table into a per-user view, and it is why the shared design
does not weaken the graded permission story. If a user's *own* place happens to be physically the
same row another user also saved, neither can observe the other's existence: there is no
`saved_by_count`, no `created_by` column, and no aggregate exposed anywhere.

Residual, disclosed: `places.created_at` and a place uuid appearing in a user's own data tell that
user their save was not the first time the row was created — a weak, unattributed
"someone-somewhere" signal with no identity attached. If security-privacy judges even that
unacceptable, the fix is to drop `created_at` from the client-selectable column grant. Flagged in
§10 Q1.

---

## 3. The schema — ordered, checked-in SQL

Files live in `supabase/migrations/` and are applied only by the CLI (§8). Every table declares its
RLS and its grants in the same file that creates it; a table without RLS in the same migration is an
incident, not a TODO.

### 3.1 `0001_conventions.sql`

```sql
-- Coordinates: WGS84 / EPSG:4326, decimal degrees, double precision, lat then lng.
-- This is the ONLY coordinate representation in the system. No PostGIS, no geohash, no
-- string-packed pairs, no per-table variation. Documented here once (D6, docs/08-place-identity.md).
-- No extensions are created. gen_random_uuid() is built into Postgres 13+.

-- Distance in kilometres between two WGS84 points. Immutable so it can be used in indexes,
-- generated columns and CHECKs. Great-circle (Haversine), mean earth radius 6371.0088 km.
create or replace function public.km_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable parallel safe
as $fn$
  select 2 * 6371.0088 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$fn$;

-- Name key for the near-duplicate guard: lowercase, strip everything that is not alphanumeric.
-- Deliberately does NOT fold diacritics (unaccent() is not IMMUTABLE; see 08 §1.2).
create or replace function public.place_name_key(p text) returns text
language sql immutable parallel safe
as $fn$
  select nullif(regexp_replace(lower(coalesce(p, '')), '[^[:alnum:]]+', '', 'g'), '');
$fn$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;
```

### 3.2 `0002_profiles.sql`

```sql
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on public.profiles from anon;
grant select, insert on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid()))
                             with check (id = (select auth.uid()));
-- No DELETE policy and no DELETE grant: a profile dies only with its auth.users row (cascade).
```

`(select auth.uid())` rather than bare `auth.uid()` throughout: the scalar subquery is evaluated once
per statement (InitPlan) instead of once per row. Same semantics, materially faster, and it is the
form Supabase's own RLS performance guidance recommends.

### 3.3 `0003_sources.sql`

```sql
-- A source is one social post, GLOBAL and shared: identity is the platform's own post id.
-- For TikTok that is the numeric video id (VERIFIED: docs/04-tiktok-feasibility.md §2).
-- NEVER the handle: @gadderapp in the pasted URL returned @gadderhq from the platform (VERIFIED).
-- NEVER the URL: locale prefixes, tracking params and vm./vt./t/ short links all denote one post.
create table public.sources (
  id                  uuid primary key default gen_random_uuid(),
  platform            text not null check (platform in ('tiktok')),
  platform_source_id  text not null check (platform_source_id ~ '^[0-9]{17,20}$'),

  -- Rebuilt from the platform's authoritative author field after a successful fetch,
  -- never from user input. Display only; carries no identity.
  canonical_url       text not null check (canonical_url ~ '^https://'),
  author_handle       text,
  author_name         text,

  -- Caption / post text. Third-party personal data; retention pending security-privacy Q4.
  content_text        text,
  -- Signed, ~6-month-expiring CDN URL (VERIFIED). Never treat as permanent (security-privacy Q6).
  thumbnail_url       text,

  fetch_status        text not null default 'pending'
                        check (fetch_status in ('pending', 'ok', 'failed')),
  -- Taxonomy from 04-tiktok-feasibility.md §3: POST_UNAVAILABLE, UPSTREAM_TIMEOUT, NO_CAPTION, ...
  fetch_error_code    text,
  fetched_at          timestamptz,
  fetch_attempts      integer not null default 0 check (fetch_attempts >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint sources_platform_identity unique (platform, platform_source_id),
  constraint sources_ok_implies_fetched check (fetch_status <> 'ok' or fetched_at is not null),
  constraint sources_failed_implies_code check (fetch_status <> 'failed' or fetch_error_code is not null)
);

comment on column public.sources.platform_source_id is
  'TikTok numeric video id. The sole dedup key for a post. Handles drift; URLs vary; ids do not.';

create trigger sources_touch before update on public.sources
  for each row execute function public.touch_updated_at();

-- One paste event by one user. This is the per-user membership record that makes the shared
-- sources cache readable under RLS, and it is the row the import pipeline and rate limiter use.
create table public.imports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  source_id    uuid not null references public.sources (id) on delete restrict,
  status       text not null default 'processing'
                 check (status in ('processing', 'review', 'completed', 'failed', 'cancelled')),
  error_code   text,
  -- Transient review payload: resolved candidates awaiting confirmation. NOT domain data:
  -- nothing here is a place until the user confirms (charter §3 invariant 2), so it is not
  -- normalised into tables. Zod-validated on write and on read.
  candidates   jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  constraint imports_failed_implies_code check (status <> 'failed' or error_code is not null)
);
-- The status machine beyond these five values belongs to D3 (07-import-execution-model.md).

create trigger imports_touch before update on public.imports
  for each row execute function public.touch_updated_at();

create index imports_user_recent_idx on public.imports (user_id, created_at desc);
create index imports_source_idx      on public.imports (source_id, user_id);

alter table public.sources  enable row level security;
alter table public.sources  force  row level security;
alter table public.imports  enable row level security;
alter table public.imports  force  row level security;

revoke all on public.sources from anon, authenticated;
grant select (id, platform, platform_source_id, canonical_url, author_handle, author_name,
              content_text, thumbnail_url, fetch_status, fetch_error_code, fetched_at)
  on public.sources to authenticated;
-- No INSERT/UPDATE/DELETE grant for authenticated, and no such policy exists: the shared cache is
-- written only by the trusted server (§5). A user must not be able to forge a caption that another
-- user's import would then read.

-- Interim form: `saved_place_sources` does not exist yet, and CREATE POLICY resolves every table
-- it names at creation time, so the second membership branch is added in 0006 (see §9 ordering).
create policy sources_select_via_membership on public.sources
  for select to authenticated
  using (
    exists (select 1 from public.imports i
             where i.source_id = sources.id and i.user_id = (select auth.uid()))
  );

revoke all on public.imports from anon;
grant select, insert on public.imports to authenticated;
grant update (status, error_code, candidates, completed_at) on public.imports to authenticated;
grant delete on public.imports to authenticated;

create policy imports_select_own on public.imports
  for select to authenticated using (user_id = (select auth.uid()));
create policy imports_insert_own on public.imports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy imports_update_own on public.imports
  for update to authenticated using (user_id = (select auth.uid()))
                            with check (user_id = (select auth.uid()));
create policy imports_delete_own on public.imports
  for delete to authenticated using (user_id = (select auth.uid()));
```

### 3.4 `0004_extractions.sql`

```sql
-- One LLM extraction run over one source's content. Versioned: (source_id, model, prompt_version)
-- is unique, so re-running an unchanged prompt reuses the cached result and a new prompt version
-- produces a new row rather than overwriting history. Global, like the source it derives from.
create table public.extractions (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.sources (id) on delete cascade,
  model           text not null check (length(btrim(model)) > 0),
  prompt_version  text not null check (prompt_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  status          text not null check (status in ('ok', 'failed')),
  error_code      text,
  -- Schema-validated structured output (charter §5). Shape owned by D7/09-extraction-and-resolution.
  candidates      jsonb,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  input_hash      text,          -- sha256 of the exact content_text extracted from, for auditability
  latency_ms      integer check (latency_ms is null or latency_ms >= 0),
  created_at      timestamptz not null default now(),

  constraint extractions_version_unique unique (source_id, model, prompt_version),
  constraint extractions_ok_has_candidates
    check (status <> 'ok' or candidates is not null),
  constraint extractions_failed_has_code
    check (status <> 'failed' or error_code is not null)
);
-- ON DELETE CASCADE from sources is the "no orphaned extraction" guarantee: an extraction cannot
-- exist without the source it extracted from, and source_id is NOT NULL, so it cannot be detached.

create index extractions_source_recent_idx on public.extractions (source_id, created_at desc);

alter table public.extractions enable row level security;
alter table public.extractions force  row level security;

revoke all on public.extractions from anon, authenticated;
grant select on public.extractions to authenticated;   -- read-only, membership-gated below

create policy extractions_select_via_source_membership on public.extractions
  for select to authenticated
  using (exists (select 1 from public.imports i
                  where i.source_id = extractions.source_id
                    and i.user_id = (select auth.uid())));
```

### 3.5 `0005_places.sql`

```sql
-- A real-world POI. Identity is `id` (ours). Provider identity lives in place_provider_refs.
create table public.places (
  id                   uuid primary key default gen_random_uuid(),

  name                 text not null check (length(btrim(name)) between 1 and 200),
  name_key             text generated always as (public.place_name_key(name)) stored,
  category             text,          -- our normalised taxonomy
  provider_category    text,          -- provider's own value, kept verbatim

  address_line         text,
  locality             text,
  region               text,
  country_code         char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),

  -- WGS84 / EPSG:4326 decimal degrees. The single canonical representation (see 0001 header).
  lat                  double precision not null check (lat between -90  and 90),
  lng                  double precision not null check (lng between -180 and 180),

  provider_payload     jsonb,         -- raw provider response, namespaced under its provider slug
  provider_fetched_at  timestamptz,

  -- Tombstone: set when this row loses a merge. Reads follow the chain; nothing is deleted.
  merged_into_place_id uuid references public.places (id) on delete restrict,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint places_no_self_merge check (merged_into_place_id is null or merged_into_place_id <> id)
);

create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();

-- step 2 of resolution: the near-duplicate guard probe
create index places_name_key_idx on public.places (name_key, country_code);
-- whole-table geographic maintenance only; no per-user query needs it (see 08 §6.2)
create index places_lat_lng_idx  on public.places (lat, lng);

-- Provider identity as ALIASES. Many per place; unique per provider pair globally.
create table public.place_provider_refs (
  id                uuid primary key default gen_random_uuid(),
  place_id          uuid not null references public.places (id) on delete cascade,
  provider          text not null check (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_place_id text not null check (length(btrim(provider_place_id)) between 1 and 200),
  is_primary        boolean not null default false,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  retired_at        timestamptz,      -- provider no longer serves this id; row kept as history

  constraint ppr_provider_identity unique (provider, provider_place_id)
);
create index ppr_place_idx on public.place_provider_refs (place_id);
-- At most one primary alias per place.
create unique index ppr_one_primary_idx on public.place_provider_refs (place_id) where is_primary;

-- Every place has at least one alias (deferred: the alias is inserted after the place).
create or replace function public.assert_place_has_alias() returns trigger
language plpgsql as $fn$
declare v_place_id uuid := coalesce(new.id, old.id);
begin
  if not exists (select 1 from public.places where id = v_place_id) then
    return null;                                    -- place is gone; nothing to assert
  end if;
  if not exists (select 1 from public.place_provider_refs where place_id = v_place_id) then
    raise exception 'place % has no provider ref (identity invariant, 08 §1.6)', v_place_id
      using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create constraint trigger places_alias_required
  after insert on public.places
  deferrable initially deferred
  for each row execute function public.assert_place_has_alias();

alter table public.places              enable row level security;
alter table public.places              force  row level security;
alter table public.place_provider_refs enable row level security;
alter table public.place_provider_refs force  row level security;

revoke all on public.places              from anon, authenticated;
revoke all on public.place_provider_refs from anon, authenticated;
grant select on public.places              to authenticated;
grant select on public.place_provider_refs to authenticated;
-- Read-only for users. No INSERT/UPDATE/DELETE grant and no such policy: global rows are written
-- only by the trusted server, so no user can mutate a place another user's map depends on.

-- The membership gate ("a place is visible only to a user who saved it") must name
-- `saved_places`, which does not exist until 0006, and CREATE POLICY resolves table references at
-- creation time. It is therefore created at the end of 0006. RLS is already enabled and forced
-- here, so between the two migrations these tables are deny-all for every role: the intermediate
-- state errs closed, which is the only acceptable direction for an intermediate state.
```

### 3.6 `0006_saved_places.sql`

```sql
-- The user's library entry: user <-> place, plus everything the user may edit.
create table public.saved_places (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  place_id          uuid not null references public.places (id)   on delete restrict,

  -- Per-user overlay. Editing these never touches the shared places row (08 §2.2 rule 3).
  display_name      text check (display_name is null or length(btrim(display_name)) between 1 and 200),
  category_override text,
  note              text check (note is null or length(note) <= 2000),
  visit_state       text not null default 'want_to_go'
                      check (visit_state in ('want_to_go', 'visited')),
  visited_at        timestamptz,

  origin            text not null check (origin in ('import', 'manual')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- No duplicate save of one place by one user (acceptance I3).
  constraint saved_places_user_place_unique unique (user_id, place_id),
  -- Target for the composite FK below, which makes user_id drift on the join table impossible.
  constraint saved_places_id_user_unique unique (id, user_id),
  constraint saved_places_visited_at_consistent
    check (visit_state = 'visited' or visited_at is null)
);

create trigger saved_places_touch before update on public.saved_places
  for each row execute function public.touch_updated_at();

-- Provenance: which source(s) recommended this saved place. Many sources per saved place
-- (charter §3: one physical place recommended by three TikToks is one place with three sources).
create table public.saved_place_sources (
  saved_place_id uuid not null,
  source_id      uuid not null references public.sources (id) on delete restrict,
  user_id        uuid not null,
  added_at       timestamptz not null default now(),

  primary key (saved_place_id, source_id),
  -- Composite FK: the row's user_id must equal the owning saved place's user_id, enforced by the
  -- database rather than by convention. This is what lets the RLS policy below be a single
  -- column comparison with no subquery.
  constraint sps_owner_fk foreign key (saved_place_id, user_id)
    references public.saved_places (id, user_id) on delete cascade
);
create index sps_source_idx on public.saved_place_sources (source_id, user_id);
create index sps_user_idx   on public.saved_place_sources (user_id);

-- Provenance invariant, deferred to COMMIT because the child row is inserted after the parent:
-- origin='import' implies at least one source, forever.
create or replace function public.assert_saved_place_provenance() returns trigger
language plpgsql as $fn$
declare
  v_saved_place_id uuid;
  v_origin text;
begin
  v_saved_place_id := case tg_table_name
    when 'saved_places'        then coalesce(new.id, old.id)
    when 'saved_place_sources' then coalesce(new.saved_place_id, old.saved_place_id)
  end;

  select origin into v_origin from public.saved_places where id = v_saved_place_id;
  if v_origin is null or v_origin = 'manual' then
    return null;                                    -- deleted, or manual: nothing to assert
  end if;

  if not exists (select 1 from public.saved_place_sources
                  where saved_place_id = v_saved_place_id) then
    raise exception 'saved_place % has origin=import but no source; provenance is permanent (charter 3.3)',
      v_saved_place_id using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create constraint trigger saved_places_provenance_required
  after insert or update of origin on public.saved_places
  deferrable initially deferred
  for each row execute function public.assert_saved_place_provenance();

create constraint trigger sps_provenance_preserved
  after delete on public.saved_place_sources
  deferrable initially deferred
  for each row execute function public.assert_saved_place_provenance();
-- Consequence, intended: a user may detach one of three sources, but not the last one. To remove
-- the final source you delete the saved place. "Which TikTok made me save this?" never becomes
-- unanswerable for a place that came from a TikTok.

create index saved_places_user_recent_idx on public.saved_places (user_id, created_at desc);
create index saved_places_place_user_idx  on public.saved_places (place_id, user_id);
--                                          ^ serves the places/ppr RLS membership EXISTS lookups,
--                                            which lead on place_id and are not served by the
--                                            (user_id, place_id) unique index.

alter table public.saved_places        enable row level security;
alter table public.saved_places        force  row level security;
alter table public.saved_place_sources enable row level security;
alter table public.saved_place_sources force  row level security;

revoke all on public.saved_places        from anon;
revoke all on public.saved_place_sources from anon;

grant select, insert, delete on public.saved_places to authenticated;
-- Column-level UPDATE grant: the user may edit their overlay and nothing else. user_id, place_id
-- and origin are not grantable, so "move my save onto someone else's place" or "give my save away"
-- are not expressible, independently of RLS.
grant update (display_name, category_override, note, visit_state, visited_at)
  on public.saved_places to authenticated;

grant select, insert, delete on public.saved_place_sources to authenticated;
-- No UPDATE grant: a provenance link is created or removed, never edited.

create policy saved_places_select_own on public.saved_places
  for select to authenticated using (user_id = (select auth.uid()));
create policy saved_places_insert_own on public.saved_places
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy saved_places_update_own on public.saved_places
  for update to authenticated using (user_id = (select auth.uid()))
                                with check (user_id = (select auth.uid()));
create policy saved_places_delete_own on public.saved_places
  for delete to authenticated using (user_id = (select auth.uid()));

create policy sps_select_own on public.saved_place_sources
  for select to authenticated using (user_id = (select auth.uid()));
create policy sps_insert_own on public.saved_place_sources
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- the source must be one this user actually imported: no borrowing provenance
    and exists (select 1 from public.imports i
                 where i.source_id = saved_place_sources.source_id
                   and i.user_id = (select auth.uid()))
  );
create policy sps_delete_own on public.saved_place_sources
  for delete to authenticated using (user_id = (select auth.uid()));

-- Cross-table membership gates, created here because they name `saved_places` and CREATE POLICY
-- resolves table references at creation time. Until this point `places` and `place_provider_refs`
-- were deny-all (0005).
create policy places_select_if_saved on public.places
  for select to authenticated
  using (exists (select 1 from public.saved_places sp
                  where sp.place_id = places.id and sp.user_id = (select auth.uid())));

create policy ppr_select_if_place_saved on public.place_provider_refs
  for select to authenticated
  using (exists (select 1 from public.saved_places sp
                  where sp.place_id = place_provider_refs.place_id
                    and sp.user_id = (select auth.uid())));

-- Extend the sources gate now that saved_place_sources exists (see 0003 note).
drop policy if exists sources_select_via_membership on public.sources;
create policy sources_select_via_membership on public.sources
  for select to authenticated
  using (
    exists (select 1 from public.imports i
             where i.source_id = sources.id and i.user_id = (select auth.uid()))
    or exists (select 1 from public.saved_place_sources sps
                where sps.source_id = sources.id and sps.user_id = (select auth.uid()))
  );
```

### 3.7 `0007_functions.sql`

```sql
-- ---------------------------------------------------------------------------------------------
-- resolve_place: the ONLY way a places row is created. Trusted-server only.
-- SECURITY DEFINER + granted exclusively to service_role: the data it writes is provider output,
-- not user input, and must not be user-forgeable (08 §2.2 rule 2).
-- ---------------------------------------------------------------------------------------------
create or replace function public.resolve_place(
  p_provider          text,
  p_provider_place_id text,
  p_name              text,
  p_lat               double precision,
  p_lng               double precision,
  p_category          text default null,
  p_provider_category text default null,
  p_address_line      text default null,
  p_locality          text default null,
  p_region            text default null,
  p_country_code      char(2) default null,
  p_provider_payload  jsonb default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  c_merge_radius_km constant double precision := 0.075;   -- 08 §1.2
  v_place_id uuid;
  v_dlat double precision;
  v_dlng double precision;
begin
  -- 1. exact alias match, following any merge tombstone
  select coalesce(pl.merged_into_place_id, pl.id)
    into v_place_id
    from place_provider_refs r
    join places pl on pl.id = r.place_id
   where r.provider = p_provider and r.provider_place_id = p_provider_place_id;

  if v_place_id is not null then
    update place_provider_refs
       set last_seen_at = now(), retired_at = null
     where provider = p_provider and provider_place_id = p_provider_place_id;
    update places
       set name = p_name, lat = p_lat, lng = p_lng,
           category          = coalesce(p_category, category),
           provider_category = coalesce(p_provider_category, provider_category),
           address_line      = coalesce(p_address_line, address_line),
           locality          = coalesce(p_locality, locality),
           region            = coalesce(p_region, region),
           country_code      = coalesce(p_country_code, country_code),
           provider_payload  = coalesce(p_provider_payload, provider_payload),
           provider_fetched_at = now()
     where id = v_place_id;
    return v_place_id;
  end if;

  -- 2. near-duplicate guard: same normalised name, same country, within c_merge_radius_km
  v_dlat := c_merge_radius_km / 111.045;
  v_dlng := c_merge_radius_km / (111.045 * greatest(cos(radians(p_lat)), 0.01));

  select pl.id into v_place_id
    from places pl
   where pl.merged_into_place_id is null
     and pl.name_key = public.place_name_key(p_name)
     and pl.country_code is not distinct from p_country_code
     and pl.lat between p_lat - v_dlat and p_lat + v_dlat
     and pl.lng between p_lng - v_dlng and p_lng + v_dlng
     and public.km_between(pl.lat, pl.lng, p_lat, p_lng) <= c_merge_radius_km
   order by public.km_between(pl.lat, pl.lng, p_lat, p_lng)
   limit 1;

  -- 3. otherwise a genuinely new place
  if v_place_id is null then
    insert into places (name, category, provider_category, address_line, locality, region,
                        country_code, lat, lng, provider_payload, provider_fetched_at)
    values (p_name, p_category, p_provider_category, p_address_line, p_locality, p_region,
            p_country_code, p_lat, p_lng, p_provider_payload, now())
    returning id into v_place_id;
  end if;

  insert into place_provider_refs (place_id, provider, provider_place_id, is_primary)
  values (v_place_id, p_provider, p_provider_place_id,
          not exists (select 1 from place_provider_refs where place_id = v_place_id))
  on conflict (provider, provider_place_id) do update set last_seen_at = now()
  returning place_id into v_place_id;      -- concurrent-insert loser re-reads the winner

  return v_place_id;
end;
$fn$;

revoke all on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_place(text, text, text, double precision, double precision,
  text, text, text, text, text, char, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------
-- save_place: the user-facing write. SECURITY INVOKER on purpose — RLS still applies, so this
-- gives atomicity WITHOUT elevation. It cannot write anyone else's rows.
-- Implements acceptance I3 / I4 / A2: second import of a known place adds a source, not a row.
-- ---------------------------------------------------------------------------------------------
create or replace function public.save_place(
  p_place_id  uuid,
  p_source_id uuid default null,          -- null => manual addition (acceptance A1)
  p_note      text default null
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into saved_places (user_id, place_id, origin, note)
  values (v_uid, p_place_id,
          case when p_source_id is null then 'manual' else 'import' end,
          p_note)
  -- Only granted columns may appear here: `authenticated` holds UPDATE on the overlay columns
  -- only, and the touch trigger maintains updated_at.
  on conflict (user_id, place_id)
    do update set note = coalesce(excluded.note, saved_places.note)
  returning id into v_id;

  if p_source_id is not null then
    insert into saved_place_sources (saved_place_id, user_id, source_id)
    values (v_id, v_uid, p_source_id)
    on conflict do nothing;               -- re-importing the same post twice: idempotent
  end if;

  return v_id;
end;
$fn$;

grant execute on function public.save_place(uuid, uuid, text) to authenticated;
revoke all on function public.save_place(uuid, uuid, text) from anon;

-- ---------------------------------------------------------------------------------------------
-- merge_places: repair path for provider migration collisions (08 §1.4). Trusted-server only.
-- Nothing is deleted; the loser becomes a permanent tombstone so old references still resolve.
-- ---------------------------------------------------------------------------------------------
create or replace function public.merge_places(p_loser uuid, p_winner uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if p_loser = p_winner then
    raise exception 'cannot merge a place into itself';
  end if;

  -- users who saved both keep one entry; their provenance links are moved first
  update saved_place_sources sps
     set saved_place_id = w.id
    from saved_places l
    join saved_places w on w.user_id = l.user_id and w.place_id = p_winner
   where l.place_id = p_loser and sps.saved_place_id = l.id
     and not exists (select 1 from saved_place_sources x
                      where x.saved_place_id = w.id and x.source_id = sps.source_id);
  delete from saved_places l
   where l.place_id = p_loser
     and exists (select 1 from saved_places w
                  where w.user_id = l.user_id and w.place_id = p_winner);

  update saved_places set place_id = p_winner where place_id = p_loser;
  update place_provider_refs set place_id = p_winner, is_primary = false where place_id = p_loser;
  update places set merged_into_place_id = p_winner, updated_at = now() where id = p_loser;
end;
$fn$;

revoke all on function public.merge_places(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_places(uuid, uuid) to service_role;
```

`merge_places` deletes the loser's `saved_places` row only for users who already hold the winner; the
deferred provenance trigger stays satisfied because the links are moved before the delete, and the
delete cascades any that remain. Every merge is therefore lossless for the user's map.

### 3.8 `0008_policy_tests.sql` (fixtures for M6/M7)

Two real users, one shared place, one shared source; asserts that every cross-user read returns zero
rows and every cross-user write is rejected. Runs as SQL with `set local role authenticated` and
`set local request.jwt.claims`, so it tests the policies themselves rather than the client code.
Acceptance criterion **P3** is exactly this file.

---

## 4. Constraint inventory — the bad states that are now unrepresentable

| Bad state | Prevented by |
|---|---|
| A saved place from an import with no source | deferred constraint trigger `saved_places_provenance_required` + `sps_provenance_preserved`; `origin` is not user-updatable (no column grant) |
| Detaching the last source of an imported place | same pair of triggers — the delete raises at COMMIT |
| The same user saving the same place twice | `unique (user_id, place_id)` |
| Two rows for one physical place | `unique (provider, provider_place_id)` on aliases + the 75 m/name guard, both inside `resolve_place`, which is the only writer |
| An extraction with no source | `source_id not null` + `on delete cascade` |
| A place with no provider identity | deferred trigger `places_alias_required` (+ the `internal` provider slug so the invariant is total) |
| A provenance link pointing at another user's saved place | composite FK `(saved_place_id, user_id) -> saved_places(id, user_id)` |
| A provenance link to a source the user never imported | `sps_insert_own` policy's `EXISTS` on `imports` |
| A user re-pointing their save at another place, or reassigning `user_id` | column-level `GRANT UPDATE` excludes `user_id`, `place_id`, `origin` |
| A user rewriting a shared place's name or a shared source's caption | no `INSERT/UPDATE/DELETE` grant and no policy for `authenticated` on global tables |
| Coordinates outside the valid range, or a `visited_at` on a `want_to_go` row | `CHECK` constraints |
| `fetch_status='ok'` with no `fetched_at`; `'failed'` with no error code | `CHECK` constraints |
| A source id that is a handle or a URL | `platform_source_id ~ '^[0-9]{17,20}$'` |
| Deleting a place that someone still has saved | `on delete restrict` on `saved_places.place_id` |

**Cascade on user deletion.** `auth.users` → `profiles` (cascade) → `imports`, `saved_places`
(cascade) → `saved_place_sources` (cascade). The user's library disappears completely. Global
`places`, `sources` and `extractions` **survive**, because they hold no data about *our* user — only
provider facts and public post content. Two deliberate consequences: (1) another user who saved the
same venue is unaffected, which is the whole point of the shared table; (2) cached `sources` rows may
outlive every user who referenced them, which is a *third-party* data-retention question (the
creator's handle and caption), not a first-party one — see §10 Q2, including whether a
zero-reference-source garbage collector is required.

---

## 5. Where the service role is legitimately needed

Exactly one class of operation: **writing the global cache from trusted, server-derived data** —
`sources` (fetched caption/author/thumbnail/status), `extractions` (LLM output), `places` and
`place_provider_refs` (via `resolve_place`).

Justification: the contents are provider and model output, not user input. If a user could write
them, one user could forge a caption or a place that another user's map then consumes — a cross-user
data-poisoning path that RLS cannot mitigate, because the rows are legitimately shared. Making these
tables read-only for `authenticated` removes the vector entirely, and the price is that some
server-side code must be privileged.

The rules around it, which are checkable in review:
1. Service-role writes happen only in `integrations`/`app` server code, never in a client bundle;
   the key is a server-only environment variable.
2. **A service-role query never filters by `user_id`.** That single rule is the mechanical test for
   "is this a user-scoped read?" — if a query needs to know who is asking, it must use the user's
   JWT and go through RLS. Grep-able in code review and stated as such in `docs/security.md`.
3. Every user-owned table (`profiles`, `imports`, `saved_places`, `saved_place_sources`) is written
   and read exclusively through the anon key + the user's JWT. `save_place` is `SECURITY INVOKER`
   specifically so that the save path — the most important write in the product — is still governed
   by RLS. Acceptance criterion **P4** holds.
4. `resolve_place` and `merge_places` are `SECURITY DEFINER` but are granted to `service_role` only,
   with `search_path` pinned; the definer marking is defence in depth, not the access mechanism.

## 5.1 What the `anon` role can see

Nothing user-owned. `anon` holds no `GRANT` on any table in this schema (`revoke all ... from anon`
in every migration, because Supabase's default privileges would otherwise grant it), and not one
policy names `anon`. With RLS enabled and forced, a missing policy is a deny, so even a privilege
regression would return zero rows. The anonymous surface of the product is marketing + auth only,
which is acceptance criterion **P1**.

## 5.2 What a cross-user read attempt returns, per table

| Table | User B reads user A's row | User B writes user A's row |
|---|---|---|
| `profiles` | 0 rows (`404`/`PGRST116` on `.single()`) | `UPDATE` matches 0 rows → no-op; `INSERT` with A's id violates `profiles_insert_own` → `42501` |
| `imports` | 0 rows | 0 rows affected / policy violation |
| `saved_places` | 0 rows | `UPDATE`/`DELETE` affect 0 rows; `INSERT` with A's `user_id` → `42501` |
| `saved_place_sources` | 0 rows | as above; the composite FK also blocks pointing at A's saved place |
| `places` | 0 rows **unless B also saved that place**, in which case it is B's own row too and reveals nothing about A | no grant → `42501` |
| `place_provider_refs` | same as `places` | no grant → `42501` |
| `sources` | 0 rows unless B also imported that post — in which case the content is public TikTok data B already had the URL for | no grant → `42501` |
| `extractions` | 0 rows unless B imported the same post | no grant → `42501` |

Zero rows, never an error, is the intended shape: RLS filters rather than rejects on read, so no
policy leaks existence information through error differentiation.

---

## 6. D6 — PostGIS vs plain lat/lng

### 6.1 The realistic workload

~100 users × ~50 saved places = ~5,000 `saved_places` rows and at most ~5,000 `places` rows. The
acceptance criteria stretch to 300 places for one user (M3) and the product spec's high-volume
persona to ~100+. Design target: **≤ 1,000 places per user, ≤ 50,000 rows total** — an order of
magnitude above the plan.

Queries:
- **Q-VIEWPORT** — my saved places inside the current map bounds.
- **Q-NEAR** — my saved places within N km of my current position, nearest first.
- **Q-LIST** — my saved places, newest first, paginated.
- **Q-SEARCH** — my saved places whose name contains a substring, optionally filtered by category.

Note what every single one has in common: `user_id = auth.uid()`. **The user filter is the selective
predicate and the geometry is not.** That is the whole of D6.

### 6.2 Head-to-head

| Criterion | `geography(Point,4326)` + GiST | plain `lat`/`lng` + `BETWEEN` | Winner |
|---|---|---|---|
| Query simplicity | `ST_DWithin(geog, ST_MakePoint(lng,lat)::geography, 2000)` — one call, metres, correct | 4 comparisons + a Haversine refinement | PostGIS, slightly |
| Index behaviour at our scale | GiST on `places(geog)`, but the plan starts from `saved_places(user_id)` (≤1k rows) and probes `places` by primary key. The GiST index is **never chosen**. | identical plan; the coordinate test is a filter on rows already fetched | Draw — neither index does the geo work |
| Correctness for "within N km" | exact geodesic; handles poles and the antimeridian | bbox is a *superset*; `km_between` gives the exact answer; the longitude degree must be divided by `cos(lat)` or the box is wrong at high latitude. Antimeridian and polar boxes are broken. | PostGIS |
| Correctness that matters for *this* product | — | Tel Aviv, Tokyo, London, and everywhere else a food recommendation exists, is between 60°S and 70°N and nowhere near ±180° longitude. Documented limitation with a named revisit trigger. | Draw in practice |
| Availability on Supabase | `create extension postgis;` is available and supported; not a blocker | zero extensions; `supabase db reset` reproduces the schema on any Postgres | plain, marginally |
| Migration cost either way | — | adding PostGIS later is one migration: `create extension`, add a generated `geog` column from the existing `lat`/`lng`, add the GiST index. **No data migration, no application rewrite, because `lat`/`lng` are already the canonical representation.** | plain — the decision is reversible |
| **Explainability under exam questioning** (weighted heaviest, M11/R1) | The student must explain SRIDs, the geography-vs-geometry distinction, why GiST and not B-tree, what a bounding-box index actually stores, and — hardest — why an index that is never used was created. | "The user filter cuts it to 50 rows, then we compare four numbers. Here is the `EXPLAIN`." | plain, decisively |
| Charter alignment | `02-risks-and-unknowns.md` §D8 lists PostGIS as currently unjustified infrastructure that must be earned. | — | plain |

### 6.3 Verdict

**No PostGIS in V1.** Two `double precision` columns, a bbox filter, and an immutable Haversine
function for exact distance and ordering. PostGIS would add an extension, two concepts, and an index
to the schema in exchange for a query plan that is already index-driven by `user_id`, and it would
cost marks under the explainability requirement to defend infrastructure that does no work.

Canonical queries:

```sql
-- Q-VIEWPORT
select sp.id, coalesce(sp.display_name, p.name) as name,
       coalesce(sp.category_override, p.category) as category,
       p.lat, p.lng, sp.visit_state
  from saved_places sp
  join places p on p.id = sp.place_id
 where sp.user_id = (select auth.uid())
   and p.lat between :south and :north
   and p.lng between :west  and :east;

-- Q-NEAR: latitude-corrected bbox pre-filter, exact Haversine refinement and ordering
with box as (
  select :radius_km / 111.045                                        as dlat,
         :radius_km / (111.045 * greatest(cos(radians(:lat)), 0.01))  as dlng
)
select sp.id, coalesce(sp.display_name, p.name) as name, p.lat, p.lng,
       public.km_between(p.lat, p.lng, :lat, :lng) as km
  from saved_places sp
  join places p on p.id = sp.place_id
 cross join box b
 where sp.user_id = (select auth.uid())
   and p.lat between :lat - b.dlat and :lat + b.dlat
   and p.lng between :lng - b.dlng and :lng + b.dlng
   and public.km_between(p.lat, p.lng, :lat, :lng) <= :radius_km
 order by km
 limit 50;
```

Two rules that go with the verdict:
1. **The viewport is always bounded and always paginated** (`limit`), so an over-zoomed-out map
   cannot fetch the whole library. Feeds `docs/scale.md` (M8).
2. **The user's live position is a query parameter only** — never stored, never logged, never in a
   URL (charter R9, acceptance M6). `km_between` computes it in the database and returns a distance,
   not a re-statement of the input.

**Evidence status: ASSUMED, with a committed benchmark to run.** There is no data yet, so the
performance claim is reasoned from the query plan, not measured. The measurement is cheap and must be
committed as `docs/evidence/db/01-bbox-vs-postgis.md` during the schema milestone:

```sql
-- seed 100 users x 500 places = 50k saved_places, 50k places, coordinates spread over 3 cities
-- then, for both candidate designs:
explain (analyze, buffers)
select ... ;   -- Q-VIEWPORT and Q-NEAR above, per-user, warm cache, 20 runs
-- record: chosen plan, index used, rows removed by filter, total ms p50/p95
-- fail line: if the plain design exceeds 25 ms p95 at 50k rows, revisit this decision.
```

### 6.4 When to revisit

Any one of these flips the decision, and each is a measurable trigger rather than an opinion:
1. Q-VIEWPORT or Q-NEAR p95 > 25 ms at 10× the design scale.
2. A query must scan places **across all users** (a discovery, trending or public-map feature) — the
   `user_id` predicate disappears and geometry becomes the only selective one. This is the most
   likely trigger, and it is currently out of scope by charter §4.
3. Any polygon requirement: "places in this neighbourhood", isochrones, drawing a region on the map.
   Bounding boxes cannot express containment in a real boundary.
4. True nearest-neighbour paging over a large set (KNN with `ORDER BY <->`).
5. Anyone actually saves a place within ~500 km of a pole or on the antimeridian.

Migration when triggered: `create extension postgis;` then
`alter table places add column geog geography(Point,4326) generated always as (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) stored;`
plus a GiST index. `lat`/`lng` stay canonical; nothing else changes.

---

## 7. The CRUD matrix (M3 / M4)

Every operation the product performs. "Actor" is the Postgres role the statement runs as; there is
exactly one product role — the authenticated owner — plus the trusted server. `anon` appears nowhere.

| # | Operation | Verb | Table(s) | Actor | Client | Governing policy / grant | Cross-user attempt |
|---|---|---|---|---|---|---|---|
| C1 | Sign up / sign in | — | `auth.users` | Supabase Auth | anon key | Supabase Auth | n/a |
| C2 | Create own profile on first sign-in | CREATE | `profiles` | authenticated | anon key + JWT | `profiles_insert_own` (`id = auth.uid()`) | inserting another id → `42501` |
| C3 | Read own profile | READ | `profiles` | authenticated | anon key + JWT | `profiles_select_own` | 0 rows |
| C4 | Update own display name | UPDATE | `profiles` | authenticated | anon key + JWT | `profiles_update_own` + `GRANT UPDATE (display_name)` | 0 rows affected |
| C5 | Paste a TikTok URL → cache/refresh the post | CREATE/UPDATE | `sources` | **service_role** | server only | no user grant exists; §5 rule 2 (no `user_id` filter) | not user-reachable |
| C6 | Record that I imported this post | CREATE | `imports` | authenticated | anon key + JWT | `imports_insert_own` | inserting another `user_id` → `42501` |
| C7 | Run / cache LLM extraction | CREATE | `extractions` | **service_role** | server only | no user grant; unique on (source, model, prompt_version) | not user-reachable |
| C8 | Resolve a candidate to a real POI | CREATE/UPDATE | `places`, `place_provider_refs` | **service_role** | server only | `resolve_place()`, `EXECUTE` granted to `service_role` only | not user-reachable |
| C9 | Store resolved candidates for review | UPDATE | `imports` | authenticated | anon key + JWT | `imports_update_own` + `GRANT UPDATE (status, error_code, candidates, completed_at)` | 0 rows affected |
| C10 | Read my import status / review payload | READ | `imports` | authenticated | anon key + JWT | `imports_select_own` | 0 rows |
| C11 | Read the source content behind my import | READ | `sources` | authenticated | anon key + JWT | `sources_select_via_membership` | 0 rows unless I imported that post |
| C12 | **Confirm and save a place** (import path) | CREATE | `saved_places` + `saved_place_sources` | authenticated | anon key + JWT | `save_place()` — `SECURITY INVOKER`, so `saved_places_insert_own` + `sps_insert_own` both apply | `42501`; the composite FK also blocks pointing at another user's saved place |
| C13 | Save a place found by manual search | CREATE | `saved_places` (`origin='manual'`) | authenticated | anon key + JWT | same, with `p_source_id => null` (acceptance A1) | as C12 |
| C14 | Re-import a post I already saved | CREATE | `saved_place_sources` only | authenticated | anon key + JWT | `ON CONFLICT` in `save_place` → no duplicate place, no duplicate entry (acceptance I3/I4) | as C12 |
| C15 | Read my map viewport | READ | `saved_places` ⋈ `places` | authenticated | anon key + JWT | `saved_places_select_own` + `places_select_if_saved` | 0 rows |
| C16 | Read my places near me | READ | `saved_places` ⋈ `places` | authenticated | anon key + JWT | as C15; radius is a bound parameter, position never stored | 0 rows |
| C17 | Read my list / search / filter | READ | `saved_places` ⋈ `places` | authenticated | anon key + JWT | as C15 | 0 rows |
| C18 | Read one place's detail + its source TikTok(s) | READ | `saved_places`, `places`, `saved_place_sources`, `sources` | authenticated | anon key + JWT | all four own/membership policies compose | 0 rows |
| C19 | **Rename a saved place** | UPDATE | `saved_places.display_name` | authenticated | anon key + JWT | `saved_places_update_own` + column grant | 0 rows affected |
| C20 | **Re-categorise a saved place** | UPDATE | `saved_places.category_override` | authenticated | anon key + JWT | as C19 | 0 rows affected |
| C21 | **Write / edit a personal note** | UPDATE | `saved_places.note` | authenticated | anon key + JWT | as C19 | 0 rows affected |
| C22 | **Toggle `want_to_go` ⇄ `visited`** | UPDATE | `saved_places.visit_state`, `visited_at` | authenticated | anon key + JWT | as C19 + `CHECK` keeps `visited_at` consistent | 0 rows affected |
| C23 | Detach one source from a saved place (≥1 must remain) | DELETE | `saved_place_sources` | authenticated | anon key + JWT | `sps_delete_own`; deferred provenance trigger blocks removing the last one | 0 rows affected |
| C24 | **Delete a saved place** | DELETE | `saved_places` (cascades its source links) | authenticated | anon key + JWT | `saved_places_delete_own`; `places` row survives for other users | 0 rows affected |
| C25 | Delete an import from history | DELETE | `imports` | authenticated | anon key + JWT | `imports_delete_own`; `sources` retained (`on delete restrict`) | 0 rows affected |
| C26 | Delete my account | DELETE | `auth.users` → cascade | authenticated (Auth) | server action | cascade chain in §4; global rows survive | n/a |
| C27 | Repair a provider-migration collision | UPDATE | `places`, `place_provider_refs`, `saved_places` | **service_role** | maintenance script | `merge_places()`, `EXECUTE` granted to `service_role` only | not user-reachable |

Rows C19–C24 are the UPDATE/DELETE surface the course requires (M4: *central*
CREATE/READ/UPDATE/DELETE). Note what they have in common: every user-authored edit lands on the
user's own row, never on a shared one.

---

## 8. Index plan

| Index | Table | Serves |
|---|---|---|
| `profiles_pkey` | `profiles` | own-profile read; the RLS predicate itself |
| `sources_platform_identity` (unique `platform, platform_source_id`) | `sources` | the dedup lookup on every paste — "have we fetched this video id?"; enforces one row per post |
| `imports_user_recent_idx` (`user_id, created_at desc`) | `imports` | import history; per-user rate-limit counting (D11) |
| `imports_source_idx` (`source_id, user_id`) | `imports` | the `sources` and `extractions` RLS membership `EXISTS` |
| `extractions_version_unique` (`source_id, model, prompt_version`) | `extractions` | extraction cache hit; prevents duplicate runs of one prompt version |
| `extractions_source_recent_idx` (`source_id, created_at desc`) | `extractions` | "latest extraction for this source" |
| `ppr_provider_identity` (unique `provider, provider_place_id`) | `place_provider_refs` | **step 1 of resolution** — the dedup key lookup; the single most important index in the schema |
| `ppr_place_idx` (`place_id`) | `place_provider_refs` | all aliases of a place; provider backfill after a swap |
| `ppr_one_primary_idx` (unique, partial) | `place_provider_refs` | one primary alias per place |
| `places_name_key_idx` (`name_key, country_code`) | `places` | step 2, the near-duplicate guard |
| `places_lat_lng_idx` (`lat, lng`) | `places` | **low value, honestly labelled**: no per-user query needs it (§6.2). Kept only for whole-table geographic maintenance/backfill queries. First candidate to drop if the schema is trimmed. |
| `saved_places_user_place_unique` (`user_id, place_id`) | `saved_places` | "do I already have this place?"; enforces I3 |
| `saved_places_user_recent_idx` (`user_id, created_at desc`) | `saved_places` | Q-LIST, Q-VIEWPORT, Q-NEAR, Q-SEARCH — the entry point for **every** user-scoped read, and the index that makes PostGIS unnecessary |
| `saved_places_place_user_idx` (`place_id, user_id`) | `saved_places` | the `places` / `place_provider_refs` RLS membership `EXISTS`, which leads on `place_id` |
| `saved_places_id_user_unique` (`id, user_id`) | `saved_places` | target of the composite FK from `saved_place_sources` |
| `saved_place_sources_pkey` (`saved_place_id, source_id`) | `saved_place_sources` | provenance of one saved place; idempotent re-import |
| `sps_source_idx` (`source_id, user_id`) | `saved_place_sources` | "which of my places came from this TikTok?"; the `sources` RLS `EXISTS` |
| `sps_user_idx` (`user_id`) | `saved_place_sources` | user-scoped sweep on account deletion |

Deliberately absent, with the reason:
- **No trigram / full-text index.** Q-SEARCH runs `ILIKE '%term%'` over the ≤1,000 rows the
  `user_id` index already isolated. Add `pg_trgm` only if per-user libraries pass ~5,000 rows.
- **No GiST/geography index** (§6).
- **No index on `visit_state`.** A boolean-ish filter over ≤1,000 rows is free; the composite would
  serve nothing the `user_id` index does not.
- Index count is deliberately conservative: at a few thousand rows, extra indexes cost write latency
  and explanation time, and buy nothing measurable.

---

## 9. Migration approach

- Location `supabase/migrations/`, filenames `<timestamp>_<slug>.sql`, ordered, checked into git, and
  the only mechanism by which schema changes reach any environment. **No change is ever made through
  the Supabase dashboard** — a dashboard change is invisible to git, unreproducible locally, and
  would break `supabase db reset`.
- Applied with `supabase db push` (or `supabase migration up` locally); `supabase db reset` recreates
  the entire schema from zero plus `supabase/seed.sql`, and that reproducibility is the acceptance
  test for the migration set. Reviewed as code in the same PR as the feature that needs it.
- RLS and grants are written in the same file as the table (charter §5 and this document's §3).
  A migration that creates a table without enabling RLS fails review.
- **`FORCE ROW LEVEL SECURITY`** is set on every table so the table owner is subject to its own
  policies too, closing the "it worked because I was the owner" class of bug. Roles with the
  `BYPASSRLS` attribute (`service_role`, and `postgres` on Supabase) still bypass, which is what
  makes the trusted-server writes in §5 possible. **Verify on the real project** that seeds and
  migrations still run under `FORCE`; if the migration role turns out to lack `BYPASSRLS`, drop
  `FORCE` (keep `ENABLE`) rather than adding owner-shaped policies.
- **Forward-only.** Rollback is a new migration, not an edit to a shipped one. Files already applied
  to production are immutable.
- Destructive changes use **expand → migrate → contract**: add the new column, backfill, switch the
  code, drop the old column in a later migration, never in the same one.
- Free-tier Supabase has no point-in-time recovery, so any migration that drops or rewrites data is
  preceded by a manual `pg_dump` committed outside the repo. Stated plainly in `docs/deployment.md`.
- **Ordering note (a real constraint, not a style choice).** `CREATE POLICY` resolves every table
  its expression names at creation time, so a policy cannot forward-reference a table created in a
  later migration. Three membership policies are affected: `sources` (needs `saved_place_sources`),
  `places` and `place_provider_refs` (need `saved_places`). The rule "RLS ships with its table" is
  kept by enabling and forcing RLS in the table's own migration — which makes the table deny-all —
  and completing the policy at the end of `0006`, immediately after the referenced table exists.
  The intermediate state denies everything to everyone, so the window is safe by construction. The
  alternative (all policies in a trailing `0009_policies.sql`) reads worse in review and gives a
  larger window in which a table has no policy at all.
- Policy tests (`0008`) run in CI against a fresh `supabase db reset`, so a policy regression fails
  the build rather than the exam.

---

## 10. For security-privacy — adversarial review requested

1. **The membership gate is the whole shared-table argument.** Attack it: `places_select_if_saved`
   and `sources_select_via_membership` are `EXISTS` subqueries over user-owned tables. Confirm there
   is no path by which a crafted PostgREST query (embedded resource selects, `!inner` joins,
   `or=` filters, RPC returning a global row) returns a `places`, `sources` or `extractions` row the
   caller has no membership for. Specifically: does a PostgREST embedded select
   `saved_places?select=*,places(*)` apply the `places` policy? (It must, and the test must prove it.)
   Also rule on the disclosed residual in §2.2: does `places.created_at` predating a user's save leak
   too much, and should it be removed from the column grant?
2. **User deletion and third-party data.** A deleted user's library cascades away, but cached
   `sources` rows — creator handle, display name, caption, thumbnail URL — survive with no remaining
   reference. Is a zero-reference-source garbage collector required, or is retention of public post
   metadata defensible? This is the same question as `04-tiktok-feasibility.md` Q4, now with a
   concrete table to point at.
3. **`resolve_place` is `SECURITY DEFINER`.** Granted to `service_role` only, `search_path` pinned to
   `public, pg_temp`. Confirm that is sufficient, and confirm the reasoning in §5 that global cache
   tables must be user-read-only to close cross-user data poisoning.
4. **A user can rewrite their own `imports.candidates` jsonb** (column-level `UPDATE` grant). My
   position: bounded to their own review screen and unable to fabricate a place, because
   `saved_places.place_id` is an FK into a server-written table. Confirm, or take the grant away and
   route import status updates through a trusted server write.
5. **`save_place` is `SECURITY INVOKER`** so RLS governs the product's most important write. Confirm
   that a user passing an arbitrary `p_place_id` (a uuid they guessed) is harmless: they would save a
   place they cannot otherwise see and would learn only that some uuid exists.
6. **Coordinates.** They are stored forever on `places` (charter requires it) and never on a user row.
   The live position is a query parameter only. Confirm that `km_between` returning a distance is not
   itself a leak, and that no coordinate reaches a log line via a failed query being logged with
   parameters bound.

---

## 11. Explaining the data model to an examiner in 90 seconds

"There are seven tables in two groups. **User-owned:** `profiles`, `imports` (one paste of one
TikTok), `saved_places` (my library entry) and `saved_place_sources` (which TikToks recommended it).
**Shared:** `sources` (one row per TikTok video id — the numeric id, never the handle, because the
handle in a pasted URL is demonstrably wrong), `extractions` (one LLM run per source, versioned by
model and prompt version) and `places` with `place_provider_refs`. A place is identified by *our*
uuid; the provider's id is stored beside it as an alias, so when we change places provider or the
provider changes an id, nothing in anyone's map moves. Deduplication happens in one function: match
the provider id, else match an identical name within 75 metres, else create the place. Two branches
of a chain are two places because they have two provider ids; the same venue found twice is one place
with two aliases. The shared tables save storage and provider calls, and they are still private:
row-level security only returns a place to a user who has a saved-place row pointing at it, so a
cross-user read returns zero rows, and users have no write permission on shared tables at all —
renaming a place writes to *your* library row, not the shared one. Coordinates are two
`double precision` columns in WGS84, and the map query is `user_id = me` plus a bounding box: the
user filter already cuts it to fifty rows, so a spatial index would have nothing to do — that is why
there is no PostGIS. And the invariants are in the database, not in the code: you cannot save the
same place twice, you cannot have an imported place with no TikTok behind it, and you cannot delete
the last source of one."

