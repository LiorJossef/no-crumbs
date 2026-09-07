-- 0034_note_first_writer_wins.sql — the sentence the user wrote survives the second import.
--
-- Task `r2-note-loss`. A live data-loss defect, armed this afternoon by `80c5bc1`. The ruling that
-- governs this file is `docs/archive/db-ruling-note-precedence-2026-08-31.md`; where the two differ, the
-- ruling wins.
--
-- ═══ THE DEFECT, IN ONE LINE ══════════════════════════════════════════════════════════════════
--
-- `save_place`'s live body, MEASURED from `pg_proc.prosrc` on the local container at base commit
-- `112cb77` and identical to `0024:651-652`, `0017:72`, `0016:122` and `0007:231`:
--
--     on conflict (user_id, place_id)
--       do update set note = coalesce(excluded.note, saved_places.note)
--
-- `excluded.note` is the INCOMING note. So a non-null incoming note REPLACES the stored one: last
-- writer wins. The `coalesce` reads as protective and is — but only in the direction that was
-- never under threat. It protects the stored note from being nulled; it does nothing to protect it
-- from being overwritten.
--
-- ═══ WHY IT WAS HARMLESS UNTIL 2026-08-31 22:28 UTC+2, AND IS NOT NOW ═════════════════════════
--
-- The review screen always sent `note: null`. `ConfirmImportRequestSchema` has carried a per-item
-- note since the import route was written, and the client never filled it — so `excluded.note` was
-- null on every import in the product's history and the coalesce could not destroy anything.
--
-- `80c5bc1` ("feat(review): capture why you are saving, at the moment you still know") wired the
-- textarea to that field. From that commit forward, confirming an import sends real prose into
-- `p_note`. The failure it opens:
--
--   1. The user saves *Ha Kosem* from a TikTok in July and writes "the pickle bar, ask for extra
--      amba" in the sheet a week later.
--   2. In August a second TikTok mentions Ha Kosem. The candidate arrives in review **already
--      ticked** — the 2026-08-29 owner ruling on duplicates — so the user does not choose it.
--   3. The user types a note about the new video, or the extractor's reason lands in the box.
--   4. `save_place` runs, the ON CONFLICT fires, and the July sentence is gone. Not archived: gone.
--      `saved_places` has no history table, no soft delete and no audit trail on `note`, so there
--      is nothing anywhere to restore it from.
--   5. The result banner reads `already saved`, which is the product telling the user that nothing
--      happened at the exact moment something irreversible did.
--
-- Two posts about one restaurant is not an edge case in this product; it is a DESIGNED case.
-- `0007`'s header names it acceptance I3/I4/A2, and `0019`'s header calls "an unrelated import of
-- the same venue" the reason its own columns are first-writer-wins.
--
-- ═══ THE FIX ══════════════════════════════════════════════════════════════════════════════════
--
--     do update set note = coalesce(saved_places.note, excluded.note)
--
-- The arguments swap. First non-null writer wins. Everything else in the body is `0024`'s, byte
-- for byte, including the restored `apply_saved_place_source_link` call.
--
-- ═══ THIS REMOVES AN EXCEPTION RATHER THAN ADDING A RULE ══════════════════════════════════════
--
-- Read as "one write path with three precedence rules" the change looks like a fourth. It is not.
-- The full inventory of what `save_place` does on a second call, measured against the shipped
-- definitions rather than recalled:
--
--   tags, why_go, dishes    `coalesce(sp.x, incoming)` — first non-null writer wins.
--                           `0019:395-397`, via apply_saved_place_extraction. Header: "a later,
--                           unrelated import of the same venue does not silently rewrite what the
--                           first one recorded."
--   source_url,             `coalesce(sp.x, src.x)` — first non-null writer wins. `0016:70-72`.
--   source_thumbnail_url    The header calls it "first-source-only", which is the same rule under
--                           a name that describes its effect on this particular column.
--   extracted_reason        Absent from the DO UPDATE list entirely — first INSERT wins, which is
--                           the same rule made structural. `0024:648-650` says so in as many words.
--   saved_place_sources     ACCUMULATES: `on conflict do nothing` on `(saved_place_id, source_id)`.
--                           Not a competing precedence rule — a different table with a different
--                           key, and the designed home for multi-source information. `0019`'s
--                           header is explicit: "Union-across-sources would need per-source
--                           attribution, and that lives on `saved_place_sources`, not in a wider
--                           column here."
--   display_name,           Not written by `save_place` at all. A second save cannot touch them.
--   category_override,
--   visit_state, visited_at
--   note                    `coalesce(excluded.note, sp.note)` — LAST writer wins. THE OUTLIER.
--
-- So there is one rule, one accumulator on its own table, four columns this function never writes,
-- and one exception. The exception is the only column a human typed. Every column holding machine
-- output is protected from being overwritten by a later import; the column holding the user's own
-- sentence is the single one that is not. That is the inconsistency, and it is inverted — it
-- protects the cheap thing (a model can re-derive tags from the same caption tomorrow) and exposes
-- the irreplaceable one (nothing can re-derive a sentence the user wrote in July).
--
-- RULING: nothing beyond `note` needs reconciling, and that is a finding rather than a deferral.
-- The other columns already agree with each other. Changing any of them would create the
-- inconsistency this migration removes.
--
-- ═══ FIRST-WRITER-WINS IS RIGHT HERE, NOT MERELY SAFE — AND THE WHY MATTERS ═══════════════════
--
-- The objection is real and is recorded so it is argued with rather than skipped: first-writer-wins
-- makes the SECOND note unreachable through this path. The user types a sentence and it silently
-- does nothing. That is a second kind of silent write-loss, not the absence of one, and "we
-- swapped a destructive failure for a quiet one" would be a weak defence on its own.
--
-- It is not the defence, because of a fact about the schema that makes the two failures
-- asymmetric in three independent ways:
--
--   1. `note` STAYS FULLY EDITABLE. `authenticated` holds UPDATE on `note` — measured:
--        authenticated | UPDATE | category_override, display_name, note, visit_state, visited_at
--      and `src/app/actions/saved-places.ts:124` uses it (`.update({ note })` under RLS) for the
--      sheet's note editor. This migration does NOT make the field write-once. It makes the
--      IMPORT path non-destructive and leaves the editing surface exactly where the product
--      already put it. A user whose second note did not land can still write it; a user whose
--      first note was destroyed cannot get it back, because it is not anywhere.
--   2. RECOVERABILITY, and this is the decisive one. The unreachable note is ON SCREEN at the
--      instant it fails to land — the user just typed it, in a textarea they are looking at. The
--      destroyed note was written weeks ago, is not on screen, and its loss is not observable at
--      the moment it happens. One failure the user can see and repair; the other nobody can.
--   3. CONSENT AND FREQUENCY. The destructive path fires on a candidate that arrives ALREADY
--      TICKED (2026-08-29 owner ruling), so it does not need a deliberate act — the user can lose
--      the note by confirming an import they were not paying close attention to. The unreachable
--      path requires the user to have deliberately typed something. The failure being prevented is
--      both commoner and unchosen; the one being introduced is rarer and follows an intent.
--
-- AND THE SAME RULING IS ALREADY IN THIS DIRECTORY, one migration ago, on this column, for this
-- class of harm. `0033:221-227` refuses to merge two saves during a re-point because "the two
-- saves carry two different notes ... and silently destroying one of them is precisely the
-- 'delete-and-re-add loses the note' failure this migration exists to end. The user is told, and
-- chooses." `0032`'s header lists the note first among "four of the five things the MVP boundary
-- says this product stores". A feature that refuses to destroy a note when the user presses a
-- button, sitting beside a function that destroys one without being asked, is not two positions —
-- it is one position with a hole in it.
--
-- ALTERNATIVES CONSIDERED AND REJECTED, named so they are not re-proposed:
--   * APPEND the two notes. Silently mutates prose the user wrote, grows without bound over
--     repeated imports, and has to invent a separator the user did not choose. It also makes the
--     column no longer a thing the user typed, which is the property that earns it this protection.
--   * RAISE on a conflicting note. `save_place`'s contract is an idempotent re-save — `0033:205`
--     leans on it ("Same resolution save_place's ON CONFLICT makes for a repeated save") — and
--     `confirm/route.ts` saves several candidates per request, so an exception would turn one
--     collision into a partial batch failure. A save is not a failure.
--
-- WHAT THIS IS NOT: the finished product answer. That is to SHOW the existing note on the review
-- screen when the place is already saved, so the second note is an edit of the first rather than a
-- write that vanishes. That is a `src/` change and is not this file's to make. Stopping the loss
-- must not wait for it — an unreachable note is a worse review screen, a destroyed note is gone
-- forever — so this is the floor, deliberately, and the ruling says so where the follow-up is
-- tracked. Agreed with the reviewer's judgement, explicitly and without reservation.
--
-- ═══ NO BACKFILL, AND NOTHING TO BACK FILL FROM ═══════════════════════════════════════════════
--
-- Notes already overwritten are unrecoverable: there is no history table, no audit row and no
-- previous value stored anywhere. MEASURED locally at base commit `112cb77` — 8 saved_places rows,
-- exactly one with a non-null note, whose `updated_at > created_at` is a sheet edit from task
-- `r1-note` rather than an import overwrite. No local loss is detectable. The hosted projects are
-- not measured here: hosted access is the orchestrator's and the owner's, not this agent's. The
-- exposure window on hosted data is small (`80c5bc1` is from 2026-08-31 22:28 +0200 and is not
-- deployed as of this writing) and that is a reason to land this fast, not a reason to assume it
-- is empty.
--
-- ═══ SAFETY ══════════════════════════════════════════════════════════════════════════════════
--
-- No table, no policy, no RLS change, no grant widening. `create or replace` on one existing
-- function with an unchanged signature, so the ACL is preserved; the revoke/grant pair is
-- re-issued anyway for the reason `0024`'s header gives — a future signature change will DROP and
-- CREATE and would otherwise inherit PUBLIC EXECUTE again, which is the `0009`/`0018` bug twice.
-- The browser-reachable function set is unchanged, so `inventory.sql` check 6 still holds.

begin;

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
  --
  -- 0034: the arguments to this coalesce are `(stored, incoming)` and the order is the whole
  -- point. FIRST NON-NULL WRITER WINS, matching every other column this function can reach. A
  -- second import of a place the user already saved cannot overwrite the sentence they wrote about
  -- it; a first save that carried no note still accepts one from a later import, so the column is
  -- not write-once-nothing. Editing remains where the product put it — a direct UPDATE on `note`
  -- from the sheet, which `authenticated` is granted and which this function does not touch.
  on conflict (user_id, place_id)
    do update set note = coalesce(saved_places.note, excluded.note)
  returning id into v_id;

  if p_source_id is not null then
    insert into saved_place_sources (saved_place_id, user_id, source_id)
    values (v_id, v_uid, p_source_id)
    on conflict do nothing;               -- re-importing the same post twice: idempotent

    -- RESTORED (0016, dropped by 0017). First-source-only cache fill; a no-op past the first call
    -- for this saved place, because the helper coalesces on both columns. This is the only writer
    -- of saved_places.source_url / source_thumbnail_url in the system.
    perform public.apply_saved_place_source_link(v_id, p_source_id);
  end if;

  return v_id;
end;
$fn$;

comment on function public.save_place(uuid, uuid, text, text) is
  'The user-facing write. SECURITY INVOKER, so RLS and the column grants still apply and the '
  'function creates no elevation. Upserts on (user_id, place_id): a repeated save of the same '
  'place by the same user is idempotent rather than an error, which is acceptance I3/I4/A2. '
  'p_source_id null means a manual addition and skips the provenance link entirely. '
  'PRECEDENCE ON A SECOND SAVE, and it is one rule: note, tags, why_go, dishes, source_url and '
  'source_thumbnail_url are all FIRST NON-NULL WRITER WINS, and extracted_reason is INSERT-only, '
  'which is the same rule made structural. 0034 brought note into line — it was last-writer-wins '
  'and was the only column a human typed, so a second import of the same venue destroyed the '
  'sentence the user wrote about it. Multi-source information accumulates on saved_place_sources, '
  'which is keyed (saved_place, source) and is its designed home. This function never writes '
  'display_name, category_override, visit_state or visited_at; note stays editable through the '
  'sheet''s direct UPDATE under the authenticated column grant.';

-- CREATE OR REPLACE preserves the existing privileges, so this pair is strictly a no-op today and
-- is re-issued anyway — see the header. PUBLIC is named first because EXECUTE defaults to it and a
-- privilege held through PUBLIC survives `revoke ... from anon` (0009, then 0018).
revoke all on function public.save_place(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.save_place(uuid, uuid, text, text) to authenticated;

commit;
