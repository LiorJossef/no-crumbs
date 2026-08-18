-- 0004_extractions.sql — one LLM run per (source, model, prompt_version).
-- Design: docs/08-place-identity.md §3.4. Unchanged by §14.

-- Versioned: re-running an unchanged prompt reuses the cached result, and a new prompt version
-- produces a new row rather than overwriting history. Global, like the source it derives from.
create table public.extractions (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.sources (id) on delete cascade,
  model           text not null check (length(btrim(model)) > 0),
  prompt_version  text not null check (prompt_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  status          text not null check (status in ('ok', 'failed')),
  error_code      text,
  -- Schema-validated structured output (charter §5). Shape owned by 09-extraction-and-resolution.
  candidates      jsonb,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  input_hash      text,          -- sha256 of the exact content_text extracted from, for auditability
  latency_ms      integer check (latency_ms is null or latency_ms >= 0),
  created_at      timestamptz not null default now(),

  constraint extractions_version_unique unique (source_id, model, prompt_version),
  constraint extractions_ok_has_candidates  check (status <> 'ok'     or candidates is not null),
  constraint extractions_failed_has_code    check (status <> 'failed' or error_code is not null)
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
