-- 0017 — make `saved_places.extracted_reason` actually writable, and close the table-level grant
-- on `saved_place_sources`.
--
-- Why this exists. 0015 added `saved_places.extracted_reason` to carry the extractor's verbatim
-- caption fragment — the quote that answers "why do we believe this TikTok meant this place".
-- `src/app/map/_lib/get-spots.ts` reads it, `src/domain/places/spot.ts` types it, and
-- `src/components/sheet/place-sheet.tsx` renders a branch for it. It has never held a value on any
-- row, on any environment, because the column was unreachable in two independent ways:
--
--   1. `save_place` (0007, `security invoker`) inserts only
--      `(user_id, place_id, origin, note)` — there was no parameter to pass a reason through; and
--   2. `authenticated` was never granted INSERT on the column, so even a widened INSERT list in a
--      `security invoker` function would have been rejected. Verified on the local container:
--      `information_schema.column_privileges` lists `extracted_reason` for SELECT only.
--
-- Both are fixed here. The column stays out of the UPDATE grant on purpose: a reason is a fact
-- about the extraction that produced the save, not a user-editable overlay like `note` or
-- `display_name`. Re-saving the same place from a *different* TikTok coalesces (first reason wins)
-- for the same reason `note` does — the existing row's provenance is not silently rewritten by a
-- later, unrelated import.
--
-- Second, unrelated-but-adjacent change. `saved_place_sources` carried **table-level** `INSERT` for
-- `authenticated` (0006 line 120). Table-level privileges automatically cover columns added later,
-- so any future column on that table — and the richer creator-commentary fields this table is the
-- natural home for — would have been immediately writable directly through PostgREST, bypassing
-- `save_place` entirely. The grant is narrowed to the three columns `save_place` actually inserts
-- (`added_at` has a default and is deliberately not grantable). SELECT is likewise pinned to the
-- current four columns, and DELETE is left alone: DELETE cannot be column-scoped in Postgres, and
-- `sps_delete_own` plus the `sps_provenance_preserved` trigger are the controls there.
--
-- No new tables or views, so `scripts/check-migration-grants.sh` has nothing to assert here.

begin;

-- ── 1. the missing column grant ───────────────────────────────────────────────────────────────
grant insert (extracted_reason) on public.saved_places to authenticated;

-- ── 2. save_place gains a reason parameter ────────────────────────────────────────────────────
-- A new parameter means a new signature, so the 3-argument function is dropped rather than
-- replaced: leaving both in place would make every named-argument call from PostgREST ambiguous
-- (`p_place_id`/`p_source_id`/`p_note` matches the 4-arg form via its default too).
drop function if exists public.save_place(uuid, uuid, text);

create or replace function public.save_place(
  p_place_id         uuid,
  p_source_id        uuid default null,   -- null => manual addition (acceptance A1)
  p_note             text default null,
  -- The extractor's verbatim caption fragment for this candidate. Never model prose, never a
  -- paraphrase: `src/domain/extraction/schema.ts` requires `evidence` to be a substring of the
  -- caption, which is what makes a fabrication a substring check rather than a judgement call.
  p_extracted_reason text default null
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

  insert into saved_places (user_id, place_id, origin, note, extracted_reason)
  values (v_uid, p_place_id,
          case when p_source_id is null then 'manual' else 'import' end,
          p_note, p_extracted_reason)
  -- Only granted columns may appear here: `authenticated` holds UPDATE on the overlay columns
  -- only, and the touch trigger maintains updated_at. `extracted_reason` is INSERT-only by
  -- design, so it cannot appear in this DO UPDATE list at all — a second save of the same place
  -- keeps the reason recorded by the first one.
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

grant execute on function public.save_place(uuid, uuid, text, text) to authenticated;
revoke all on function public.save_place(uuid, uuid, text, text) from anon;

-- ── 3. narrow saved_place_sources from table-level to column-level ────────────────────────────
revoke insert, select on public.saved_place_sources from authenticated;
grant  insert (saved_place_id, source_id, user_id) on public.saved_place_sources to authenticated;
grant  select (saved_place_id, source_id, user_id, added_at) on public.saved_place_sources to authenticated;

commit;
