CREATE OR REPLACE FUNCTION public.claim_transcription_job(p_job_id uuid)
 RETURNS TABLE(job_id uuid, storage_bucket text, storage_object_path text, job_attempt_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_transcription_job(p_job_id uuid, p_transcript_text text, p_detected_language text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fail_transcription_job(p_job_id uuid, p_error_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.requeue_transcription_job(p_job_id uuid, p_error_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated integer;
begin
  update transcription_jobs
     set status = 'queued', error_code = p_error_code, processing_started_at = null
   where id = p_job_id and status = 'processing' and attempt_count < 3;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_transcription_job(p_user_id uuid, p_source_id uuid, p_storage_bucket text, p_storage_object_path text)
 RETURNS TABLE(job_id uuid, job_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
