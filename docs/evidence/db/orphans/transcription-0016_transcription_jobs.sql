-- 0016_transcription_jobs.sql — asynchronous audio transcription jobs.
--
-- Audio lives in a private Supabase Storage bucket. The database stores its object path, the
-- Cloudflare Queue carries only a job id, and only service_role functions may mutate job state.

create table public.transcription_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  source_id           uuid not null references public.sources (id) on delete cascade,
  storage_bucket      text not null check (storage_bucket ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  storage_object_path text not null check (length(storage_object_path) between 3 and 512),
  status              text not null default 'queued'
                        check (status in ('queued', 'processing', 'completed', 'failed')),
  provider            text not null default 'cloudflare-workers-ai'
                        check (provider = 'cloudflare-workers-ai'),
  model               text not null default '@cf/openai/whisper-large-v3-turbo'
                        check (model = '@cf/openai/whisper-large-v3-turbo'),
  transcript_text     text,
  detected_language   text,
  error_code          text,
  attempt_count       integer not null default 0 check (attempt_count between 0 and 3),
  processing_started_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,

  constraint transcription_jobs_object_unique
    unique (user_id, source_id, storage_bucket, storage_object_path),
  constraint transcription_jobs_completed_has_text
    check (status <> 'completed' or (transcript_text is not null and completed_at is not null)),
  constraint transcription_jobs_failed_has_code
    check (status <> 'failed' or error_code is not null)
);

create index transcription_jobs_user_recent_idx
  on public.transcription_jobs (user_id, created_at desc);
create index transcription_jobs_claim_idx
  on public.transcription_jobs (status, created_at)
  where status in ('queued', 'processing');

create trigger transcription_jobs_touch before update on public.transcription_jobs
  for each row execute function public.touch_updated_at();

alter table public.transcription_jobs enable row level security;
alter table public.transcription_jobs force row level security;

revoke all on public.transcription_jobs from anon, authenticated;
grant all on public.transcription_jobs to service_role;
grant select (id, source_id, status, provider, model, transcript_text, detected_language,
              error_code, attempt_count, created_at, updated_at, completed_at)
  on public.transcription_jobs to authenticated;

create policy transcription_jobs_select_own on public.transcription_jobs
  for select to authenticated using (user_id = (select auth.uid()));

-- Called only after the Next.js route has authenticated the caller. Membership is re-checked in
-- SQL so a forged source id cannot grant access to another user's source.
create or replace function public.start_transcription_job(
  p_user_id uuid,
  p_source_id uuid,
  p_storage_bucket text,
  p_storage_object_path text
) returns table (job_id uuid, job_status text)
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_job public.transcription_jobs%rowtype;
begin
  if p_user_id is null then
    raise exception 'start_transcription_job requires a user id' using errcode = '22004';
  end if;

  if not exists (
    select 1 from imports i where i.user_id = p_user_id and i.source_id = p_source_id
  ) then
    raise exception 'source is not available to this user' using errcode = '42501';
  end if;

  insert into transcription_jobs (user_id, source_id, storage_bucket, storage_object_path)
  values (p_user_id, p_source_id, p_storage_bucket, p_storage_object_path)
  on conflict (user_id, source_id, storage_bucket, storage_object_path)
  do update set
    status = case when transcription_jobs.status = 'failed' then 'queued' else transcription_jobs.status end,
    attempt_count = case when transcription_jobs.status = 'failed' then 0 else transcription_jobs.attempt_count end,
    error_code = case when transcription_jobs.status = 'failed' then null else transcription_jobs.error_code end,
    processing_started_at = case when transcription_jobs.status = 'failed' then null else transcription_jobs.processing_started_at end,
    completed_at = case when transcription_jobs.status = 'failed' then null else transcription_jobs.completed_at end
  returning * into v_job;

  return query select v_job.id, v_job.status;
end;
$fn$;

-- Claims queued work atomically. A processing lease older than five minutes may be reclaimed after
-- a worker crash; a normal queue retry first requeues explicitly below.
create or replace function public.claim_transcription_job(p_job_id uuid)
returns table (
  job_id uuid,
  storage_bucket text,
  storage_object_path text,
  job_attempt_count integer
)
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
begin
  return query
    update transcription_jobs j
       set status = 'processing',
           attempt_count = j.attempt_count + 1,
           processing_started_at = now(),
           error_code = null
     where j.id = p_job_id
       and j.attempt_count < 3
       and (j.status = 'queued'
            or (j.status = 'processing' and j.processing_started_at < now() - interval '5 minutes'))
    returning j.id, j.storage_bucket, j.storage_object_path, j.attempt_count;
end;
$fn$;

create or replace function public.complete_transcription_job(
  p_job_id uuid,
  p_transcript_text text,
  p_detected_language text default null
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_updated integer;
begin
  update transcription_jobs
     set status = 'completed', transcript_text = p_transcript_text,
         detected_language = p_detected_language, error_code = null, completed_at = now()
   where id = p_job_id and status = 'processing';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

create or replace function public.requeue_transcription_job(p_job_id uuid, p_error_code text)
returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_updated integer;
begin
  update transcription_jobs
     set status = 'queued', error_code = p_error_code, processing_started_at = null
   where id = p_job_id and status = 'processing' and attempt_count < 3;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

create or replace function public.fail_transcription_job(p_job_id uuid, p_error_code text)
returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_updated integer;
begin
  update transcription_jobs
     set status = 'failed', error_code = p_error_code,
         processing_started_at = null, completed_at = now()
   where id = p_job_id and status in ('queued', 'processing');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$fn$;

revoke all on function public.start_transcription_job(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_transcription_job(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_transcription_job(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.requeue_transcription_job(uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_transcription_job(uuid, text)
  from public, anon, authenticated;

grant execute on function public.start_transcription_job(uuid, uuid, text, text) to service_role;
grant execute on function public.claim_transcription_job(uuid) to service_role;
grant execute on function public.complete_transcription_job(uuid, text, text) to service_role;
grant execute on function public.requeue_transcription_job(uuid, text) to service_role;
grant execute on function public.fail_transcription_job(uuid, text) to service_role;
