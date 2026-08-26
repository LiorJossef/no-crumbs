-- 0018_transcription_jobs_source_index.sql — cover the source foreign key for cascade deletes.

create index transcription_jobs_source_idx
  on public.transcription_jobs (source_id);
