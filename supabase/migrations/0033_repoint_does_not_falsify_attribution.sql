-- 0033_repoint_does_not_falsify_attribution.sql — the quote does not outlive the place.
--
-- Condition **C3** of `docs/security-ruling-repoint-place-2026-08-31.md` §3.1, the one blocking
-- condition on `0032`'s permit-under-conditions verdict. Condition **C4** is also discharged here,
-- in the header, because it is a correction to `0032`'s header and `0032` is frozen.
--
-- ═══ THE DEFECT, AND IT IS IN THE FEATURE RATHER THAN IN THE MIGRATION ════════════════════════
--
-- `0032` lets a user move a save onto the right venue and carries the whole overlay across. The
-- provenance survives structurally — `saved_place_sources`, `source_url` and `source_thumbnail_url`
-- are keyed on `saved_place_id`, never on `place_id` — and that is right. What survives with it, and
-- must not, is the *caption-derived* half of the overlay, which stops being TRUE the moment the
-- place changes.
--
-- MEASURED by `security-privacy` against real rows (V4d, V4e): after re-pointing a save from
-- `Ha Kosem` onto `Kohi בית קפה יפני`, `extracted_reason` still read **`📍Ha Kosem`** and
-- `tags` still read **`{"middle eastern"}`** — on a Japanese coffee shop.
--
-- That is not cosmetic, because of what the shipped sheet does with those fields.
-- `src/components/sheet/place-sheet.tsx:1700-1710` renders `extracted_reason` as a `<blockquote>`
-- and the creator's `@handle` as the `<figcaption>` **directly beneath it**. So a re-pointed save
-- would show a venue header saying *Kohi*, a verbatim quote saying *"Ha Kosem"*, and *@handle*
-- credited underneath. TikTok Developer Terms **III.3(n)** (VERIFIED,
-- `docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md` §158) forbids not only deleting
-- but **falsifying** *"author attributions … or other labels of origins or source of material"*, and
-- `09` §5 records this product as currently compliant **with no gap**. The feature would open one.
--
-- ═══ THE RULING: CLEAR, NOT SUPPRESS — AND CLEAR IN THE FUNCTION ══════════════════════════════
--
-- C3 offered two branches and named the choice between them an owner call
-- (`working-agreement.md` §7): clear the caption-derived fields, or suppress the quote-plus-credit
-- pairing in the UI. **Ruled: clear, inside the same transaction as the re-point.** The reasoning,
-- recorded so it can be argued with rather than merely obeyed — two different claims are tangled in
-- that overlay, and only one of them is falsified:
--
--   * *"You saved this from @handle's TikTok video"* — **still true after a re-point.** The video is
--     genuinely where this save came from. The link, the handle and the thumbnail stay, and C3 makes
--     that unconditional in either branch: **that part of the credit is owed whatever else happens.**
--   * *"@handle's video named THIS place"* — **false the moment the place changes.** That is the
--     extracted overlay, and it is the claim III.3(n) reaches.
--
-- IN THE FUNCTION, NOT IN THE UI, and that is the load-bearing half of the ruling. A UI suppression
-- leaves a false row in the database that the next reader — a second surface, an export, a support
-- query, a future `/collections` card — renders anyway. Structural beats presentational; it is the
-- same reason `0032` chose a resolver-mediated write over a column grant.
--
-- AND THE SHEET ALREADY DOES THE RIGHT THING WITH A CLEARED QUOTE, which is why this needs no UI
-- change to be correct: `place-sheet.tsx:1804-1805` renders **`Saved from {authorLabel}`** as a
-- standalone line when `shownQuote === null` and a handle exists. So clearing does not delete the
-- credit from the screen — it demotes it from "@handle said this about this venue" to "you saved
-- this from @handle", which is exactly the surviving true claim. Verified by reading the shipped
-- component; the acceptance test for it belongs with the UI and is not this file's to write.
--
-- ═══ THE FOUR COLUMNS, AND WHY EACH ═══════════════════════════════════════════════════════════
--
--   extracted_reason  A VERBATIM caption substring naming the venue (`0015`/`0017`). The one field
--                     III.3(n) reaches directly, because it is the one rendered as a quotation with
--                     a creator credit attached.
--   tags              "derived by the extractor from the source post" (`0019`'s column comment).
--                     `middle eastern` on a Japanese coffee shop, measured.
--   why_go            "one model-written sentence saying why this post recommended this place"
--                     (`0019`). A sentence about a venue that is no longer the venue.
--   dishes            "named dishes or items the post called out" (`0019`). The post called them
--                     out about somewhere else.
--
-- All four are system-derived and none carries a client write grant on any statement, so a browser
-- could not have cleared them and the UI could not have been asked to. `0017` additionally made
-- `extracted_reason` INSERT-only, which is why C3 records that `0032` as written could not do this
-- even if it had wanted to — a migration was always going to be required.
--
-- NULL IS THE CORRECT EMPTY, not `'{}'` and not `''`. `0019`'s column comment is explicit: *"NULL
-- means 'no labels' and is the only empty representation"*, and `extracted_reason`/`source_url` have
-- the same posture. A cleared save is therefore indistinguishable from the majority of rows that
-- were never enriched — which is the honest state, not a lossy one: the product already renders
-- "no quote" every day and has a designed screen for it.
--
-- ═══ WHAT IS NOT CLEARED ══════════════════════════════════════════════════════════════════════
--
--   saved_place_sources, source_url, source_thumbnail_url  the credit that is owed unconditionally.
--   note, display_name, category_override, visit_state, visited_at   the user's own words and acts.
--   origin                                                 unchanged; the provenance invariant holds.
--
-- ═══ WHAT THIS DESTROYS, SAID PLAINLY ═════════════════════════════════════════════════════════
--
-- The four values are gone. There is no audit table in this schema, this function does not return
-- them, and a user who re-points and then re-points back does not get the quote again. That is the
-- cost of the branch that was chosen, and C3 named it in advance ("clearing destroys evidence and
-- suppressing hides a credit"). **The mitigation belongs to the server action (C1): read the four
-- columns immediately before calling and log them, if the owner wants a record.** The signature is
-- deliberately unchanged rather than widened to return them — a return-type change needs
-- `drop function`, which drops the ACL that `0032`'s whole verdict rests on, for a logging
-- convenience the caller can satisfy with one `select`.
--
-- ═══ C4 — CORRECTING `0032`'s HEADER, WHICH IS FROZEN ═════════════════════════════════════════
--
-- `0032`'s header claims that with `EXECUTE` leaked to `authenticated` the call "would fail with
-- 42501 **at the inner UPDATE**". **That names the wrong site, and it understates the property.**
-- MEASURED by `security-privacy` (V3, V3a, V3a2): the call fails EARLIER, at
-- `public.place_survivor_id` — itself `SECURITY INVOKER` and `service_role`-only.
--
-- C4 asks for that to be restated as **two** independent refusals. **There are three**, and the
-- third was found here rather than taken on trust — the only reason it is known is that making the
-- assertion falsifiable exposed it. Granting `authenticated` EXECUTE on `place_survivor_id` did NOT
-- make the refusal go away, because `place_survivor_id` is `SECURITY INVOKER` and reads
-- `places.merged_into_place_id`, a column `0012` deliberately withholds from `authenticated`:
--
--   1. no `EXECUTE` on `place_survivor_id`           → `permission denied for function place_survivor_id`
--   2. no `SELECT` on `places.merged_into_place_id`  → `permission denied for table places`
--   3. no `UPDATE` on `saved_places.place_id`        → `permission denied for table saved_places`
--
-- They fire in that order and each is independently sufficient. So a future migration that granted
-- `authenticated` EXECUTE on `place_survivor_id` — a plausible mistake, it looks like a harmless read
-- helper — moves the refusal to (2), and one that also restored `0012`'s withheld column moves it to
-- the site `0032`'s header already names. The property degrades gracefully; it does not rest on any
-- single grant. All three are now asserted separately, with the DENIED OBJECT checked rather than
-- just the SQLSTATE — `0032_repoint_saved_place_policy_tests.sql` R9c, R9c2, R9d — plus R9e, which
-- leaks two of the three at once and watches the call still be refused.
--
-- **Checking the SQLSTATE alone is not enough, and that is not a hypothetical.** The first version of
-- R9c asserted `insufficient_privilege` and PASSED with the EXECUTE grant it names actually added,
-- because refusal 2 produced the same SQLSTATE. That is `0008_policy_tests.sql` P17's bug class
-- ("two of them passed at first with the trigger they were supposed to be testing dropped") and
-- P25a-vi/vii's, reproduced exactly. An assertion that survives the removal of its own control is
-- not an assertion.
--
-- `0032`'s file is NOT edited: it is committed at `de7e4b9` and `agent-guardrails.md` §5 rule 17 is
-- forward-fix-only. This header supersedes that paragraph.
--
-- ═══ SHAPE ════════════════════════════════════════════════════════════════════════════════════
--
-- `create or replace` on the IDENTICAL signature, which is this repo's forward-fix idiom for a
-- function body (`0011` on `resolve_place`; `0016`, `0017` and `0024` on `save_place`). No new
-- signature, so no overload — `inventory.sql` check 6b bans those outright and every by-name check
-- in that file assumes one name, one function.
--
-- Unlike a `drop`+`create` (`0014`'s header), `create or replace` PRESERVES the ACL, so `0032`'s
-- revoke/grant pair survives untouched and the verdict's grant posture is not disturbed. The pair is
-- restated at the foot of this file anyway: it is idempotent, it costs nothing, and it makes this
-- file self-contained for anyone reading the current state of the function without also reading
-- `0032`. `EXECUTE` still defaults to `PUBLIC` on function creation and a privilege held through
-- `PUBLIC` survives `revoke ... from anon` — `0009`'s bug and then `0018`'s, regressed twice.
--
-- SCOPE. One function body. No table, column, view, policy, trigger, index or grant change, and
-- nothing to `anon` or `authenticated` anywhere — so `check-migration-grants.sh` has no new relation
-- to assert and `inventory.sql` checks 5, 6 and 6b are unaffected. Forward-only: nothing at or below
-- `0032` is edited.

begin;

create or replace function public.repoint_saved_place(
  p_user_id        uuid,
  p_saved_place_id uuid,
  -- A `places` id the CALLER resolved. The contract of this function is that its caller obtained
  -- this id from `resolve_place` (i.e. from a provider lookup it performed itself) and never from
  -- the browser. That contract cannot be checked from inside the database — there is no column
  -- recording who asked for a row — which is exactly why EXECUTE is `service_role` only and why the
  -- server action is the trust boundary. See `0032`'s header, and condition C1 of the review.
  p_place_id       uuid
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_old    uuid;
  v_target uuid;
begin
  if p_user_id is null or p_saved_place_id is null or p_place_id is null then
    raise exception 'repoint_saved_place requires a user id, a saved place id and a place id'
      using errcode = '22004';
  end if;

  -- Follow any merge chain to the row that is still alive, exactly as `resolve_place` does at both
  -- of its return points (`0014`, `0011` defect 1). A caller working from a stale picture can name
  -- a tombstone; a save pointing at a tombstone is the failure `place_survivor_id` exists to
  -- prevent, and it is silent — the row reads fine and shows the wrong venue forever.
  --
  -- THIS CALL IS ALSO THE FIRST OF THE TWO REFUSALS C4 IS ABOUT. `place_survivor_id` is
  -- `service_role`-only, so a caller that reached this function through a leaked EXECUTE grant is
  -- stopped HERE, before anything is read or written — twice over, in fact: first by the missing
  -- EXECUTE grant on this function, and then, if that were ever granted, by `0012`'s withholding of
  -- `places.merged_into_place_id`, which this function reads as an INVOKER. The third refusal — no
  -- UPDATE grant on `place_id` — sits behind both and is independently sufficient. See the header.
  v_target := public.place_survivor_id(p_place_id);
  if v_target is null then
    raise exception 'repoint_saved_place: place % does not exist', p_place_id using errcode = '23503';
  end if;

  -- Ownership in the WHERE clause, not in a policy. `service_role` carries BYPASSRLS, so FORCE ROW
  -- LEVEL SECURITY does not protect this row from this function and no policy is consulted; the
  -- function must refuse another user's save itself. Same discipline as `start_import` (`0007`),
  -- `apply_saved_place_source_link` (`0016`) and `apply_saved_place_extraction` (`0019`).
  --
  -- "Not found" and "not yours" are one message on purpose: distinguishing them would answer
  -- "does this saved-place id exist?" for any id, which is a membership oracle over other people's
  -- libraries. Same resolution `close_place_mention` (`0031`) makes. Confirmed indistinguishable by
  -- execution, review V2c.
  select sp.place_id into v_old
    from public.saved_places sp
   where sp.id = p_saved_place_id and sp.user_id = p_user_id;
  if not found then
    raise exception 'repoint_saved_place: saved place % does not belong to user %',
      p_saved_place_id, p_user_id using errcode = '42501';
  end if;

  -- Already there. Idempotent rather than an error: the "confirm this is the right venue" tap must
  -- be safe to double-fire, and re-pointing a save at the row it already names is not a mistake the
  -- user needs told about. Same resolution `save_place`'s ON CONFLICT makes for a repeated save.
  --
  -- AND THIS RETURN IS NOW LOAD-BEARING FOR C3, not only for `updated_at`. The place did not change,
  -- so nothing the caption said about it became false, so THE QUOTE MUST SURVIVE. A "clear the
  -- overlay on every call" version of this function would destroy a true attribution every time a
  -- user confirmed a pin that was already right — which is the failure III.3(n) names in its other
  -- half ("falsify **or delete**"). Asserted by R5b.
  if v_old = v_target then
    return v_old;
  end if;

  -- The user already holds a save on the target. `saved_places_user_place_unique` would raise 23505
  -- from the constraint two statements later; this is the readable refusal in front of it, so the
  -- caller gets a sentence it can put on screen rather than a constraint name.
  --
  -- MERGING THE TWO SAVES IS DELIBERATELY NOT DONE. `merge_places` (`0011`) does merge in this
  -- situation — it moves the loser's provenance links and then deletes the loser save — and that is
  -- right for an operator repairing a duplicate `places` row, where the two saves are known to be
  -- one physical place. It is wrong here: this is one user pressing a button, the two saves carry
  -- two different notes, two different been-marks and two different sets of tags, and silently
  -- destroying one of them is precisely the "delete-and-re-add loses the note" failure this
  -- migration exists to end. The user is told, and chooses.
  if exists (select 1 from public.saved_places sp
              where sp.user_id = p_user_id
                and sp.place_id = v_target
                and sp.id <> p_saved_place_id) then
    raise exception 'repoint_saved_place: user % already has a saved place for %',
      p_user_id, v_target using errcode = '23505';
  end if;

  begin
    -- ONE STATEMENT. The move and the clear are the same UPDATE, so there is no window — not one
    -- statement wide, not one transaction wide — in which the row names the new venue and still
    -- carries the old venue's quote. That window is the whole of the III.3(n) exposure, and a
    -- two-statement version would leave it open to any error between them. It is also why C3 says
    -- "inside the same transaction as the re-point" and why this is not a second function the
    -- server action has to remember to call.
    --
    -- The four columns are set to NULL, which is `0019`'s designated empty for all three enrichment
    -- columns and `0015`'s for `extracted_reason`. `saved_places_normalize_enrichment` (`0019`) fires
    -- BEFORE this update and normalises all three; every normaliser returns NULL for NULL, and
    -- `tag_list_within(null, ...)` is true, so the six CHECK constraints are satisfied by
    -- construction. Verified by execution rather than by reading them.
    update public.saved_places sp
       set place_id         = v_target,
           extracted_reason = null,
           tags             = null,
           why_go           = null,
           dishes           = null
     where sp.id = p_saved_place_id
       and sp.user_id = p_user_id;
  exception when unique_violation then
    -- A concurrent save of the target place won the race between the check above and this UPDATE.
    -- Re-raised with the same readable message rather than the constraint's, so the caller has one
    -- error to handle and not two.
    raise exception 'repoint_saved_place: user % already has a saved place for %',
      p_user_id, v_target using errcode = '23505';
  end;

  -- The place the save pointed at BEFORE the call. Returned rather than a boolean because it is the
  -- only record anywhere that the move happened: there is no audit table in this schema, and the
  -- caller is the last thing that can log which row was vacated — and, per this file's header, the
  -- four caption-derived values it read immediately before calling.
  return v_old;
end;
$fn$;

comment on function public.repoint_saved_place(uuid, uuid, uuid) is
  'The ONLY writer of saved_places.place_id on the user-facing path. service_role only: place_id '
  'carries no UPDATE grant for anon or authenticated, so "move my save onto another place" is not '
  'expressible from a browser at all — the browser sends a name, the server resolves it through '
  'resolve_place, and only then names an id. SECURITY INVOKER, so it creates no elevation; it '
  'enforces ownership in its own WHERE clause because service_role bypasses RLS. Follows merge '
  'chains to the survivor, refuses a duplicate rather than merging two saves, and is idempotent on '
  'a re-point to the row the save already names. 0033: a re-point that MOVES the save also clears '
  'extracted_reason, tags, why_go and dishes in the same statement — those assert something about '
  'the venue and stop being true when the venue changes, and the sheet renders the quote with the '
  'creator''s handle beneath it (TikTok Developer Terms III.3(n): do not falsify a label of origin). '
  'The source link, thumbnail and saved_place_sources row are preserved unconditionally: "you saved '
  'this from @handle" stays true. An idempotent no-op clears nothing. Returns the place_id the save '
  'pointed at before the call. Does NOT move collection_items — see 0032''s header and the ruling §5.';

-- Restated rather than relied upon. `create or replace` preserves the ACL, so `0032`'s pair is
-- already in force; this is idempotent, makes the file self-contained, and re-asserts the property
-- `inventory.sql` check 6 is exhaustive about. PUBLIC is named first because EXECUTE defaults to it
-- and a privilege held through PUBLIC survives `revoke ... from anon` — `0009`, then `0018`.
revoke all on function public.repoint_saved_place(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.repoint_saved_place(uuid, uuid, uuid) to service_role;

commit;
