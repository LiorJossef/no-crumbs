-- 0036_tags_are_the_users_vocabulary.sql — the words a person files their map under become theirs,
-- and what the model proposed stops being overwritten by that.
--
-- Task `r3-tags-db`, finding 2 of `docs/product-review-2026-08-31-r3.md`. The ruling that governs
-- this file is `docs/db-ruling-tag-ownership-2026-09-01.md`; where the two differ, the ruling wins.
--
-- ═══ THE DEFECT, MEASURED ═════════════════════════════════════════════════════════════════════
--
-- Read from the local container at base commit `d28362f`, not from the migrations:
--
--   saved_places.tags   attacl = NULL          -- no column privilege for `authenticated`
--   save_place(uuid,uuid,text,text)            -- prosrc contains no reference to `tags` at all
--   apply_saved_place_extraction               -- prosecdef=t, EXECUTE to service_role only
--
-- So `tags` has exactly one writer in the entire system, that writer is the extractor running as
-- `service_role`, and no role reachable from a browser can change a single word of it. In `src/`,
-- `grep -E 'updateSavedPlaceTags|editTags|addTag|removeTag'` returns nothing. MEASURED CONSEQUENCE
-- on this database: 9 saves across 2 users, 8 of them tagged, **16 distinct tags of which 13 have a
-- count of 1** — a filing vocabulary written entirely by a model out of strangers' captions, never
-- shown to the user before it was stored, and impossible for them to prune.
--
-- `brand-and-product-foundation.md` §7 promises nothing reaches the map without confirmation. Tags
-- are the counter-example, and `docs/product-edge-2026-08-31.md` names refusing to assert what the
-- user did not confirm as the property this product is built on. Every tag in this database is
-- currently such an assertion.
--
-- ═══ RULING 1 — IS `saved_places` A FIFTH §3.4 TABLE? NO, AND CHECKING WAS NOT OPTIONAL ═══════
--
-- `docs/security.md` §3.4 names four tables where a TABLE-level grant composes with a policy that
-- returns another user's row, and warns that a column added to one of them is cross-user readable
-- the moment it exists. Asked of the running database rather than of the doc:
--
--   pg_class.relacl on public.saved_places = {postgres=arwdDxtm/postgres,
--                                             service_role=arwdDxtm/postgres,
--                                             authenticated=rd/postgres}
--
-- `authenticated=rd` IS a table-level SELECT (and DELETE) grant. `saved_places` therefore has the
-- dangerous HALF of the composition — it is the `extractions` shape, not the `profile_names` shape,
-- and "it is column-granted so a new column arrives closed" would have been wrong here. Every
-- column this table will ever have is SELECT-able by whoever its policies admit.
--
-- What makes it safe is the other half, and only the other half. All four policies, read from
-- `pg_policy` on the running database:
--
--   saved_places_select_own   r  using  (user_id = (select auth.uid()))
--   saved_places_insert_own   a  check  (user_id = (select auth.uid()))
--   saved_places_update_own   w  using/check both (user_id = (select auth.uid()))
--   saved_places_delete_own   d  using  (user_id = (select auth.uid()))
--
-- No membership indirection, no `shares_a_collection_with`, no `collection_role`. Collections share
-- the `places` row — the POI identity — and never a `saved_places` row; `collection_items.place_id`
-- references `places(id)`, not a save. And no `SECURITY DEFINER` function that reads `saved_places`
-- is granted to `authenticated` except `apply_saved_place_source_link`, which only writes.
--
-- SO: the two columns below are readable by their owner, by `service_role`, and by nobody else.
-- That disclosure is INTENDED and is stated here rather than arrived at by default, which is
-- §3.4's option (3): the owner must be able to read `tags_extracted`, because a proposal the user
-- cannot see is exactly the thing this migration exists to stop. Proof by execution rather than by
-- reading — `P5` in `supabase/tests/0036_tag_ownership_policy_tests.sql` puts two users in one
-- shared collection and has each read the other's save.
--
-- `saved_places` should be added to §3.4's list as a fifth table with the caveat "table-level
-- grant, same-user policies only" — the same footnote `extractions` already carries. That edit is
-- `security-privacy`'s to make; this header is the evidence for it.
--
-- ═══ RULING 2 — A TAG IS USER ANNOTATION, AND THE SCHEMA ALREADY SAID SO ══════════════════════
--
-- The question "is a tag a place fact or a user annotation" has a structural answer that predates
-- the argument: `tags` is a column on `saved_places`, the per-user row, and not on `places`, the
-- shared POI. Two users who save the same venue hold two independent arrays over one place. A place
-- fact — coordinates, name, category, provider identity — lives on `places` and is shared. Whoever
-- wrote `0019` put tags on the user's side of that line and the line is right: *date night*, *with
-- Maya*, *worth the queue* are facts about a person's plans, not about a restaurant.
--
-- What was missing was not the ruling. It was the write path. The vocabulary is the user's, and
-- until this file nothing in the system let them touch it.
--
-- `src/app/api/imports/confirm/route.ts:48` calls the enrichment "place facts by …", which is the
-- opposite reading. This file does not silence it — it makes it harmless, because after this
-- migration the model's proposal is kept AS a proposal in its own column, and the array the product
-- renders and filters is the one the user is allowed to own. If the owner later rules tags are
-- place facts, `tags_extracted` is already the right home for them and the change is a rename.
--
-- ═══ RULING 3 — EDITING MUST NOT FALSIFY WHAT THE EXTRACTOR SAID ══════════════════════════════
--
-- Today `tags` carries two meanings in one column: WHAT THE MODEL PROPOSED and WHAT THE PRODUCT
-- SHOWS. They are identical only because the second has no other writer. Make the column writable
-- and the first meaning is destroyed on the first edit, with nothing anywhere to recover it —
-- `saved_places` has no history table, no soft delete and no audit trail, which is `0034`'s finding
-- about `note` restated one column to the right.
--
-- `0033` ruled that a change must not falsify what a creator said. The extractor is a creator here,
-- and so is the caption's author behind it. So the two meanings get two columns:
--
--   tags_extracted   text[]        what the extractor proposed when this place entered the map.
--                                  Written once, by the server, and by nothing else ever. NOT
--                                  grantable to `authenticated` — an UPDATE naming it is refused
--                                  at the privilege layer with 42501, before any policy runs.
--   tags            text[]         the vocabulary the product renders and filters. The user's.
--   tags_confirmed_at timestamptz  when the user last asserted that vocabulary. NULL means the
--                                  array in `tags` is still an UNCONFIRMED MODEL PROPOSAL.
--
-- `tags_confirmed_at` is the column that makes this more than bookkeeping, and it does two jobs
-- that nothing else in the schema can do:
--
--   (a) It distinguishes "the user looked at these words and kept them" from "nobody ever looked",
--       which `tags is distinct from tags_extracted` cannot: a user who reviews the model's tags
--       and agrees with them is otherwise indistinguishable from a user who never saw them. On a
--       product whose stated edge is refusing to assert the unconfirmed, that distinction IS the
--       feature. All 8 tagged rows on this database get NULL — because nobody has confirmed
--       anything, and back-filling a timestamp would be the schema inventing the consent.
--
--   (b) It stops the extractor undoing a deliberate deletion. `tag_list_within` requires
--       cardinality >= 1, so "no tags" is NULL, and `apply_saved_place_extraction`'s
--       `coalesce(sp.tags, incoming)` would refill an emptied array from the next import of the
--       same venue. A user prunes ten junk tags; a second TikTok mentions the place; the model puts
--       them back. That is `0034`'s note-loss failure with a different column, and it would have
--       been ARMED BY THIS MIGRATION rather than found in it. Below, the extractor writes `tags`
--       only while `tags_confirmed_at is null`.
--
-- ═══ RULING 4 — NOT A COLUMN GRANT. A NARROW `SECURITY DEFINER` FUNCTION ══════════════════════
--
-- The obvious build is `grant update (tags) on public.saved_places to authenticated`, and it is
-- rejected for a reason that is NOT safety. A grant on `tags` alone is perfectly safe: RLS still
-- bounds it to the caller's own row, both CHECK constraints still normalise and bound the value,
-- and `0035`'s reason for preferring a satellite table — the cross-user disclosure — DOES NOT APPLY
-- here, per ruling 1. Two of the three house precedents genuinely do not fit:
--
--   0035's reason (a table-level grant meets a cross-user policy)  — does not apply: no cross-user
--                                                                    policy on this table.
--   0032's reason (the value must be server-resolved)              — does not apply TO `tags`: a
--                                                                    tag is a string the user
--                                                                    types, there is nothing to
--                                                                    resolve, and the two CHECKs
--                                                                    already refuse a malformed one
--                                                                    without trusting the caller.
--
-- `0032`'s reason applies to the OTHER column. `tags_confirmed_at` must be server-derived — it is a
-- record of consent, and a client that can write it can claim a confirmation it never obtained,
-- which is precisely the failure the column exists to prevent. And it must be INSEPARABLE from the
-- act it records: two grants, on `tags` and on `tags_confirmed_at`, are two statements a caller can
-- issue independently, so the product could change the words without recording who chose them.
--
-- A `SECURITY INVOKER` function cannot express this — invoker runs with the caller's privileges, so
-- a function writing an ungranted column fails 42501 in its own body. That is why `0032` could be
-- invoker (it writes `place_id`, and pairs an ungranted write with... nothing) and this cannot.
--
-- So: ONE `SECURITY DEFINER` function, `set_saved_place_tags(uuid, text[])`, granted to
-- `authenticated`, and NO column grant on `tags`, `tags_extracted` or `tags_confirmed_at`. Calling
-- it IS the user asserting the vocabulary, so it always stamps; and because there is no grant,
-- there is no way to write tags WITHOUT stamping. The property §3.4 buys is preserved: a write that
-- changes the words while lying about their provenance is not refused, it is inexpressible.
--
-- It is inside §3.5's invariant 1 as `security.md` restates it — *"never grant a definer function
-- whose result is not bounded by the caller's own identity"*. It returns `void`, it takes the
-- caller's own save id, its `WHERE` carries `sp.user_id = (select auth.uid())`, and it raises
-- `42501` for a row that is not the caller's — with the SAME message for "not yours" and "does not
-- exist", so it is not an existence oracle. Same shape as `apply_saved_place_source_link` (`0016`),
-- which §3.5 already grades safe for the same reasons.
--
-- ═══ WHAT THIS FILE DOES NOT DO ═══════════════════════════════════════════════════════════════
--
-- No `src/` change. There is still no caller: the sheet has no tag affordance and the review screen
-- still shows no tags. This is the database half of `r3-tags-db` and the product half is a sibling
-- lane. `repoint_saved_place` has been live and callerless since `0032`, and this file does not add
-- a second one on purpose — it is reported as such rather than counted as shipped.
--
-- It also does not touch the bounds. `tag_list_within(tags, 8, 32)` stays at 8 tags of 32 chars;
-- `src/domain/extraction/tags.ts` is stricter (5 tags, 2–28 chars) and that is the correct
-- relationship — the database is the outer bound a corrupt caller cannot cross, the domain is the
-- product's taste. Changing an applied CHECK to match would be a schema change with no defect
-- behind it.

begin;

-- ═══ 1. THE TWO COLUMNS ═══════════════════════════════════════════════════════════════════════
-- No grant follows either of these. The table-level `authenticated=r` covers reading them (ruling
-- 1, intended); nothing covers writing them, which is the point.

alter table public.saved_places
  add column tags_extracted    text[],
  add column tags_confirmed_at timestamptz;

comment on column public.saved_places.tags_extracted is
  'What the extractor proposed for this save, kept verbatim so that a user editing `tags` cannot '
  'falsify it (0033''s principle, 0036''s ruling 3). Written once by `apply_saved_place_extraction` '
  'as `service_role`; `authenticated` holds NO privilege on it, so a browser UPDATE naming this '
  'column is refused with 42501 before any policy runs. Readable by its owner and by nobody else — '
  'see 0036''s ruling 1 for why that is a decision and not an inheritance.';

comment on column public.saved_places.tags_confirmed_at is
  'When the user last asserted the vocabulary in `tags`. NULL means the array in `tags` is still an '
  'UNCONFIRMED MODEL PROPOSAL and must be rendered as a suggestion, not as the user''s words. Set '
  'only by `set_saved_place_tags`, never grantable, never back-filled — a timestamp invented by a '
  'migration would be the schema manufacturing a consent nobody gave.';

-- The same two CHECKs `tags` carries (`0019`), so the proposal cannot be a shape the vocabulary
-- could never legally take. `tag_list_within(null, ...)` is true, so an untagged save satisfies
-- both by construction.
alter table public.saved_places
  add constraint saved_places_tags_extracted_bounded
    check (public.tag_list_within(tags_extracted, 8, 32)),
  add constraint saved_places_tags_extracted_normalised
    check (tags_extracted is null or tags_extracted = public.normalize_tag_list(tags_extracted));

-- ═══ 2. THE BACK-FILL, AND WHY IT IS SOUND RATHER THAN OPTIMISTIC ═════════════════════════════
--
-- Copying today's `tags` into `tags_extracted` claims that every tag now stored was written by the
-- extractor. That is not an assumption; it is the only reachable history. MEASURED at base commit
-- `d28362f`: `apply_saved_place_extraction` is the sole statement in the system that assigns
-- `tags` (`save_place`'s body does not mention the column, and `repoint_saved_place` only NULLs
-- it), `authenticated` holds no UPDATE privilege on it, and the function's EXECUTE is
-- `service_role` only. There has never been a path by which a human could put a word there.
--
-- `tags_confirmed_at` is deliberately NOT back-filled. Every one of these arrays is a proposal
-- nobody has seen, and the product should say so.
update public.saved_places
   set tags_extracted = tags
 where tags is not null
   and tags_extracted is null;

-- ═══ 3. NORMALISATION — the new column joins the existing BEFORE trigger ══════════════════════
-- `0019`'s function, plus one line. Idempotent on canonical input, which is why the back-fill above
-- does not need to run through it.
create or replace function public.normalize_saved_place_enrichment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.tags           := public.normalize_tag_list(new.tags);
  new.dishes         := public.normalize_tag_list(new.dishes);
  new.why_go         := public.normalize_sentence(new.why_go);
  new.tags_extracted := public.normalize_tag_list(new.tags_extracted);   -- 0036
  return new;
end;
$$;

-- ═══ 4. THE WRITE PATH ════════════════════════════════════════════════════════════════════════

create or replace function public.set_saved_place_tags(
  p_saved_place_id uuid,
  p_tags           text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
begin
  -- SECURITY DEFINER, so this function runs with BYPASSRLS and the four policies on
  -- `saved_places` protect nothing inside it. The two guards below are the entire boundary and
  -- they are written in the body on purpose — same discipline as `start_import` (0007),
  -- `apply_saved_place_source_link` (0016) and `apply_saved_place_extraction` (0019).
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- A readable refusal in front of `saved_places_tags_bounded`, which would otherwise raise 23514
  -- naming a constraint the client cannot interpret. Over-count is REFUSED, never truncated: a
  -- silently dropped tag is the product deciding which of the user's words matter.
  if p_tags is not null and cardinality(p_tags) > 8 then
    raise exception 'set_saved_place_tags: % tags supplied, the maximum is 8', cardinality(p_tags)
      using errcode = '23514';
  end if;

  -- ONE STATEMENT. The words and the confirmation are written together, so there is no window in
  -- which the row carries a new vocabulary that nothing records the user as having chosen. That
  -- inseparability is ruling 4's whole reason for this function existing instead of a grant.
  --
  -- `normalize_tag_list` returns NULL for an empty or all-junk array, so `set_saved_place_tags(id,
  -- '{}')` is how a user DELETES every tag — and it still stamps, which is what stops the next
  -- import putting them back (ruling 3b). Clearing tags is an assertion, not an absence of one.
  --
  -- `tags_extracted` is not in the SET list and never will be.
  update public.saved_places sp
     set tags              = public.normalize_tag_list(p_tags),
         tags_confirmed_at = now()
   where sp.id = p_saved_place_id
     and sp.user_id = v_uid;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    -- ONE MESSAGE FOR TWO CASES, deliberately. "That save is not yours" and "there is no such save"
    -- are indistinguishable to the caller, so this is not an existence oracle over other people's
    -- libraries. The id is not echoed back for the same reason.
    raise exception 'set_saved_place_tags: no such saved place for this user'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.set_saved_place_tags(uuid, text[]) is
  'The only write path to `saved_places.tags`. Sets the caller''s own vocabulary and stamps '
  '`tags_confirmed_at` in the same statement, so the words and the record of who chose them cannot '
  'be written apart. `security definer` because `authenticated` holds no UPDATE privilege on either '
  'column and an invoker function would fail 42501 in its own body; bounded by `auth.uid()` in the '
  'WHERE, returns void, and refuses another user''s save with 42501 and no existence oracle. '
  'Passing an empty array clears every tag and still stamps — a deliberate emptying is an '
  'assertion, and the extractor may not undo it. See 0036''s ruling 4.';

-- `0018`'s house shape, and it is not decoration: Postgres grants EXECUTE on every new function to
-- PUBLIC, and `revoke ... from anon` alone does not remove a privilege held through PUBLIC. That
-- exact mistake shipped once already, on `save_place`, and `0018` is the fix this copies.
revoke all on function public.set_saved_place_tags(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.set_saved_place_tags(uuid, text[]) to authenticated;

-- ═══ 5. THE EXTRACTOR STOPS OVERWRITING A HUMAN, AND STARTS RECORDING ITSELF ══════════════════
--
-- `0019`'s function with two changes and nothing else, and again spliced verbatim from
-- `pg_get_functiondef()` on the running container rather than retyped — this one carries three
-- parameter DEFAULTS that a hand-written `create or replace` silently drops, which Postgres then
-- refuses outright ("cannot remove parameter defaults from existing function"). It caught a second
-- error too: this function is **`SECURITY INVOKER`**, not definer. (An earlier draft of this
-- comment claimed `security.md` §3.5 documents it as definer. It does not — §3.5 lists
-- `apply_saved_place_source_link`, a different function, which genuinely is one. The mode
-- statement below stands; the accusation against the document was a misread and is withdrawn.)
-- It needs no definer because its only caller is
-- `service_role`, which holds table-level ALL on `saved_places` and BYPASSRLS in its own right. The
-- `sp.user_id = p_user_id` guard in the WHERE is therefore load-bearing exactly as `0019` says: no
-- policy filters this row for that caller.
--
-- EXECUTE stays `service_role`-only, so nothing a browser can call reaches either change below.
CREATE OR REPLACE FUNCTION public.apply_saved_place_extraction(p_saved_place_id uuid, p_user_id uuid, p_tags text[] DEFAULT NULL::text[], p_why_go text DEFAULT NULL::text, p_dishes text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_user_id is null then
    raise exception 'apply_saved_place_extraction requires a user id' using errcode = '22004';
  end if;

  -- The ownership predicate is in the WHERE clause on purpose. `service_role` has BYPASSRLS, so no
  -- policy protects this row: the function must refuse to write another user's save itself. Same
  -- discipline as `start_import` (0007) and `apply_saved_place_source_link` (0016). A mismatched
  -- user id updates zero rows and returns quietly — the caller already knows which save it created.
  update saved_places sp
     set
         -- 0036, CHANGE 1. First non-null writer wins, matching the three columns below and every
         -- other column `0019` and `0034` govern. So this records what the model proposed WHEN THE
         -- PLACE ENTERED THE MAP, and a second, unrelated import of the same venue does not rewrite
         -- that history. It is written even when `tags` is not — the proposal is worth keeping
         -- precisely when the user has already chosen something else.
         tags_extracted = coalesce(sp.tags_extracted, public.normalize_tag_list(p_tags)),

         -- 0036, CHANGE 2. A HUMAN'S ASSERTION OUTRANKS A LATER MODEL WRITE, INCLUDING AN
         -- ASSERTION OF ABSENCE. `0034` established this for `note`; the same failure exists here
         -- and is sharper, because `tag_list_within` requires cardinality >= 1, so "the user
         -- deleted every tag" is stored as NULL and the plain coalesce would read that NULL as
         -- "never written" and refill it from the next caption. Once `tags_confirmed_at` is set,
         -- this function may not touch `tags` again, in either direction.
         tags   = case when sp.tags_confirmed_at is not null then sp.tags
                       else coalesce(sp.tags, public.normalize_tag_list(p_tags)) end,

         why_go = coalesce(sp.why_go, public.normalize_sentence(p_why_go)),
         dishes = coalesce(sp.dishes, public.normalize_tag_list(p_dishes))
   where sp.id = p_saved_place_id
     and sp.user_id = p_user_id;
end;
$function$;

revoke all on function public.apply_saved_place_extraction(uuid, uuid, text[], text, text[])
  from public, anon, authenticated;
grant execute on function public.apply_saved_place_extraction(uuid, uuid, text[], text, text[])
  to service_role;

-- ═══ 6. RE-POINT CLEARS THE MODEL'S WORDS AND KEEPS THE USER'S ════════════════════════════════
--
-- `repoint_saved_place` (`0032`, attribution-clearing since `0033`) NULLs `extracted_reason`,
-- `tags`, `why_go` and `dishes` in the same UPDATE that moves `place_id`, so the row never names
-- the new venue while carrying the old venue's quote. Two new columns mean two new ways to leave
-- that window open, and leaving them unhandled would reopen the III.3(n) exposure `0033` closed:
--
--   tags_extracted     CLEARED UNCONDITIONALLY. It is verbatim model output about a candidate that
--                      turned out to be the wrong venue. This is exactly `0033`'s case.
--   tags               CLEARED ONLY WHILE UNCONFIRMED. If `tags_confirmed_at` is null the array is
--                      still the model's proposal about the wrong place and goes with it. If it is
--                      NOT null the words are the USER'S — *date night*, *with Maya* — and they
--                      survive a correction of which POI the row names, for the same reason `note`
--                      survives it and has since `0032`. `0033`'s principle is that a change must
--                      not falsify what a creator said; the user is a creator, and deleting their
--                      vocabulary because the model got the venue wrong falsifies them to fix the
--                      model.
--   tags_confirmed_at  follows `tags` — cleared exactly when the words it describes are cleared,
--                      so the pair can never say "confirmed" about an array nobody chose.
--
-- FLAGGED FOR REVIEW: this is the one place in the file where a rule is chosen rather than derived,
-- and the alternative (clear everything, as `0033` does today) is defensible. It is called out
-- here so `security-privacy` reviews a decision rather than discovering one.
--
-- Everything else in this function is `0033`'s, unchanged, and it is verbatim rather than retyped:
-- the text below is `pg_get_functiondef()` read off the running container at base commit `d28362f`
-- with the SET list of the single UPDATE patched and one comment extended. That is why it is in
-- Postgres's own uppercase emission style and not this file's — a hand-rewritten body is how a
-- guard goes missing, and an earlier draft of this section did lose three of them (`place_survivor_id`
-- became a helper that does not exist, the merge-chain hop and the `v_old = v_target` short-circuit
-- vanished, and the return type changed from `uuid` to `void`). Diff it against the database, not
-- against this comment.
CREATE OR REPLACE FUNCTION public.repoint_saved_place(p_user_id uuid, p_saved_place_id uuid, p_place_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- 0036: SIX columns now, not four. `tags_extracted` joins the unconditional clear and `tags`
    -- becomes conditional; the two CHECKs 0036 adds are `tag_list_within(null, ...)` and a
    -- normaliser that returns NULL for NULL, so they are satisfied by construction like the rest.
    -- The four columns are set to NULL, which is `0019`'s designated empty for all three enrichment
    -- columns and `0015`'s for `extracted_reason`. `saved_places_normalize_enrichment` (`0019`) fires
    -- BEFORE this update and normalises all three; every normaliser returns NULL for NULL, and
    -- `tag_list_within(null, ...)` is true, so the six CHECK constraints are satisfied by
    -- construction. Verified by execution rather than by reading them.
    update public.saved_places sp
       set place_id          = v_target,
           extracted_reason  = null,
           why_go            = null,
           dishes            = null,
           -- 0036. `tags_extracted` is verbatim model output about a candidate that turned out to
           -- be the wrong venue — exactly `0033`'s case, so it goes unconditionally. `tags` goes
           -- ONLY WHILE UNCONFIRMED: an unconfirmed array is still the model's proposal about the
           -- wrong place, but a CONFIRMED one is the user's own words about their own plans and
           -- survives a correction of which POI this row names, for the same reason `note` has
           -- survived it since `0032`. `tags_confirmed_at` needs no arm — it is already null in
           -- the branch that clears, and must not move in the branch that does not.
           tags_extracted    = null,
           tags              = case when sp.tags_confirmed_at is null then null else sp.tags end
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
$function$;

-- `create or replace` preserves the existing ACL, so these two lines change nothing today. They
-- are re-issued because `0017` proved that a re-created function is where this project loses a
-- revoke, and a reader should be able to see the reachability of this function without leaving the
-- file. Signature order is (p_user_id, p_saved_place_id, p_place_id), read from
-- `pg_get_function_identity_arguments`.
revoke all on function public.repoint_saved_place(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.repoint_saved_place(uuid, uuid, uuid) to service_role;

-- ═══ 7. THE CLOSING REVOKE, AND AN HONEST ACCOUNT OF WHAT IT CANNOT DO ════════════════════════
--
-- `saved_places` already exists, so no ALTER DEFAULT PRIVILEGES entry fired for the two new
-- columns and the hosted default-grant hazard `0008` covers is not in play here. No TABLE-level
-- revoke appears below, and that is a decision rather than an omission: `revoke all on
-- public.saved_places from authenticated` would strip the SELECT and DELETE the product depends on.
--
-- THE COLUMN-LEVEL REVOKE BELOW IS A NO-OP TODAY, AND SAYING SO IS THE POINT OF THIS COMMENT.
-- MEASURED in a rolled-back transaction on the local container before this file was written:
-- `revoke all (tags) on public.saved_places from authenticated` leaves
-- `has_column_privilege(...,'tags','SELECT')` = **t**, because a privilege held at TABLE level
-- cannot be removed one column at a time. Postgres accepts the statement, reports `REVOKE`, and
-- changes nothing. It is kept for the one thing it does do — remove a COLUMN-level grant, so a
-- later migration that adds `grant update (tags)` and is then reverted leaves nothing behind — and
-- it must not be read as the control on write access. THE CONTROL IS THE ABSENCE OF ANY UPDATE
-- GRANT, and it is asserted by execution in `supabase/tests/0036_tag_ownership_policy_tests.sql`
-- (P1, P2), not by this line.
revoke all (tags, tags_extracted, tags_confirmed_at)
  on public.saved_places from public, anon, authenticated;

commit;
