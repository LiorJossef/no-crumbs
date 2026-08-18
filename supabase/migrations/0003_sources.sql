-- 0003_sources.sql — the global post cache and the per-user paste event.
-- Design: docs/08-place-identity.md §3.3, with the rulings of technical-design.md §14 applied:
--   R1 platform_source_id (not external_id)     R2 six import statuses incl. no_places
--   R3 the observability columns on imports     R4 source_id NOT NULL, pending row inserted first
--   R5 the partial unique idempotency index     R7 candidates/error_code not user-writable
--   R8 content_text is not granted to authenticated (see the grant block)
--   B7 imports are created only by start_import() (0007): no INSERT grant, no INSERT policy

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
  -- Server-side only: not in any grant to `authenticated` (R8). Its sole consumer is
  -- ContentExtractor, which runs under the service role.
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
comment on column public.sources.content_text is
  'Post caption. Never granted to `authenticated` (R8): no product surface displays it (ux §12, spec V5).';

create trigger sources_touch before update on public.sources
  for each row execute function public.touch_updated_at();

-- One paste event by one user. This is the per-user membership record that makes the shared
-- sources cache readable under RLS, and it is the row the import pipeline and rate limiter use.
-- R4: the sources row is inserted first, at canonicalisation time, with fetch_status='pending' —
-- the video id is known before any network call — so source_id can be NOT NULL from the start.
create table public.imports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  source_id         uuid not null references public.sources (id) on delete restrict,

  -- R2. Six values. `no_places` is terminal and distinct from `completed`: the resume query and the
  -- F10 screen both need "read it, found nothing" to be different from "found candidates", and it
  -- is the product's most important metric — a status that hid it would hide the metric.
  status            text not null default 'processing'
                      check (status in ('processing', 'review', 'no_places',
                                        'completed', 'failed', 'cancelled')),
  -- R3, the observability story (technical-design.md §7.5) and the audit record.
  stage             text not null default 'source'
                      check (stage in ('source', 'extract', 'resolve', 'done')),
  error_code        text,
  degraded_code     text,
  ms_source         integer check (ms_source   is null or ms_source   >= 0),
  ms_extract        integer check (ms_extract  is null or ms_extract  >= 0),
  ms_resolve        integer check (ms_resolve  is null or ms_resolve  >= 0),
  extractor_version text,
  prompt_version    text,
  attempt_count     integer not null default 0 check (attempt_count >= 0),

  -- Transient review payload: resolved candidates awaiting confirmation. NOT domain data:
  -- nothing here is a place until the user confirms (charter §3 invariant 2), so it is not
  -- normalised into tables. Zod-validated on write and on read.
  candidates        jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '24 hours',
  completed_at      timestamptz,

  constraint imports_failed_implies_code check (status <> 'failed' or error_code is not null)
);

create trigger imports_touch before update on public.imports
  for each row execute function public.touch_updated_at();

create index imports_user_recent_idx on public.imports (user_id, created_at desc);
create index imports_source_idx      on public.imports (source_id, user_id);
create index imports_expiry_idx      on public.imports (expires_at) where status = 'processing';

-- R5. One open import per (user, post). Restated from 07's (user_id, external_id) onto source_id,
-- which R4 makes available at insert time. `completed` and `cancelled` are excluded so a user may
-- re-import a post they have already finished with.
create unique index imports_open_one_per_source
  on public.imports (user_id, source_id)
  where status in ('processing', 'review', 'no_places', 'failed');

alter table public.sources  enable row level security;
alter table public.sources  force  row level security;
alter table public.imports  enable row level security;
alter table public.imports  force  row level security;

revoke all on public.sources from anon, authenticated;
-- R8: content_text, created_at and updated_at are deliberately absent. Consequence the data-access
-- layer must respect: `select *` on sources fails with permission denied — always name columns.
grant select (id, platform, platform_source_id, canonical_url, author_handle, author_name,
              thumbnail_url, fetch_status, fetch_error_code, fetched_at)
  on public.sources to authenticated;
-- No INSERT/UPDATE/DELETE grant for authenticated, and no such policy exists: the shared cache is
-- written only by the trusted server (08 §5). A user must not be able to forge a caption that
-- another user's import would then read.

-- Interim form: `saved_place_sources` does not exist yet, and CREATE POLICY resolves every table
-- it names at creation time, so the second membership branch is added in 0006 (see 08 §9 ordering).
create policy sources_select_via_membership on public.sources
  for select to authenticated
  using (
    exists (select 1 from public.imports i
             where i.source_id = sources.id and i.user_id = (select auth.uid()))
  );

revoke all on public.imports from anon, authenticated;
grant select on public.imports to authenticated;
-- R7: the user's only legitimate import writes are `status` (cancel) and `completed_at`.
-- `candidates` and every observability column are written by the server that produced them; a
-- user-writable review payload is a needless forgery surface.
grant update (status, completed_at) on public.imports to authenticated;
-- B7: no INSERT grant and no INSERT policy. An import is created only by public.start_import()
-- (0007), which is service-role-only and inserts the sources row and the imports row together.
-- This closes the membership-forgery vector by construction: with no INSERT path, a user cannot
-- name an arbitrary source_id in an imports row to gain read access to that source.
-- No DELETE grant either: imports are the audit and observability record (§7.5), `cancelled` is a
-- status, and expiry is the service role's job. Deletion is not one of the user's operations.

create policy imports_select_own on public.imports
  for select to authenticated using (user_id = (select auth.uid()));
create policy imports_update_own on public.imports
  for update to authenticated using (user_id = (select auth.uid()))
                            with check (user_id = (select auth.uid()));
