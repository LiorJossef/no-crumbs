-- 0037_model_prose_is_labelled_and_removable.sql — the last two columns `0019` left the user unable
-- to change, remove, or tell apart from their own words.
--
-- Task `r5-whygo`, finding 3 of `docs/archive/product-review-2026-09-01-r4.md` (§2.2, §3 row 3). The ruling
-- that governs this file is `docs/archive/db-ruling-model-prose-2026-09-01.md`; where the two differ, the
-- ruling wins. `0036` did this for `tags`; this finishes the class `0019` opened in one migration.
--
-- ═══ THE DEFECT, MEASURED ON THE RUNNING CONTAINER AT BASE COMMIT a468fb1 ═════════════════════
--
--   information_schema.column_privileges, public.saved_places, grantee `authenticated`:
--       why_go  → SELECT only        dishes  → SELECT only
--       (UPDATE is held on exactly category_override, display_name, note, visit_state, visited_at)
--   pg_proc: the ONLY functions whose body names either column are
--       apply_saved_place_extraction (service_role only), repoint_saved_place (service_role only),
--       normalize_saved_place_enrichment (a trigger). No browser role can reach any of them.
--   src/: `grep -rn 'why_go|whyGo|dishes' src/` finds READERS only — get-spots.ts:44-45,
--       ui/place/enrichment.ts. No action, no RPC, no form.
--   the library: 11 saves, 3 users, 8 rows carry a `why_go`, 6 carry `dishes`.
--
-- They are not dormant. `Café Florentin`'s desktop card renders `saved_places.why_go` — "A tiny
-- place, easy to walk straight past." — as a BARE, UNLABELLED paragraph between the address and
-- `DISHES MENTIONED`, in a card that labels the category "worked out from the video" and attributes
-- the quote "Saved from @tlv.eats". Other rows in this database carry "The best oat milk in the old
-- north." and "The sourdough is worth the queue.": superlatives, on a private map, about places the
-- user has never been, written by a language model out of a stranger's caption, and unremovable.
--
-- `docs/archive/product-edge-2026-08-31.md` §0 rules that this product's differentiator is refusing to
-- assert what the user did not confirm. `brand-and-product-foundation.md` §7 promises nothing
-- reaches the map without confirmation. Eight rows are currently such an assertion.
--
-- ═══ RULING 1 — IS PROSE THE SAME PROBLEM AS A TAG LIST? NO, AND THE DIFFERENCE IS AUTHORSHIP ══
--
-- `0036`'s shape is (X_extracted immutable, X the user's, X_confirmed_at the consent stamp). It is
-- right for a LIST OF TOKENS, where the column is CONTESTED between two authors: the model proposes
-- `hidden gem`, the user replaces it with `date night`, and without `tags_extracted` the first is
-- destroyed. Choosing from a set is selection.
--
-- A SENTENCE IS NOT A SET, AND EDITING ONE IS AUTHORSHIP. Three consequences, and they point away
-- from `0036`'s shape for `why_go`:
--
--   (a) THE PRODUCT ALREADY HAS A COLUMN FOR THE USER'S OWN PROSE, AND IT IS `note`. `note` has an
--       UPDATE grant, is first-writer-wins protected by `0034`, and renders as the user's words. A
--       second free-prose column that is SOMETIMES the model's and SOMETIMES the user's is exactly
--       the "two meanings in one column" defect `0036` §3 names. Granting authorship into `why_go`
--       would CREATE that defect, not close it.
--
--   (b) IT IS OUTSIDE THE STATED MVP BOUNDARY AND ON AN OPEN OWNER QUESTION. `CLAUDE.md` fixes
--       stored info at name · category · coordinates · source link · USER NOTE — one user-authored
--       prose field. Whether that boundary governs place facts only or every stored field is
--       **OD-1** (`docs/archive/product-ruling-after-the-save.md` §5), still unanswered, and the r4 review
--       names OD-1 itself as the thing that would change its mind. A migration is not the place to
--       pre-empt it. NOTHING HERE DEPENDS ON THE ANSWER: the review's own text says the labelling
--       half "is the fix for it either way", and removal is needed under both readings.
--
--   (c) `src/ui/place/enrichment.ts` WOULD MISREAD A USER-AUTHORED SENTENCE. `whyGoEarnsItsPlace`
--       hides `why_go` when it contributes fewer than 4 new content words, on the documented
--       ground that it is "the model's own prose" restating the quote. A user who typed a short
--       sentence into that column would have it HIDDEN FROM ITS OWN AUTHOR by a filter designed for
--       model paraphrase. That is a `src/` consequence of a schema shape, and this lane's answer is
--       not to create it.
--
-- SO `why_go` GETS A STRICTLY SMALLER SHAPE THAN `tags`: no `why_go_extracted` column at all. The
-- column is only ever the model's sentence or nothing, so there are not two authors to keep apart,
-- and retaining a copy of a sentence the user asked to remove would be undo dressed as provenance.
--
-- `dishes` IS the `0036` case. "cortado", "sourdough loaf" are tokens from an effectively closed
-- vocabulary — a menu — and choosing among them is selection, not authorship. It gets all three
-- columns and the full setter.
--
-- ═══ RULING 2 — EDIT, REMOVE, OR DISTINGUISH? THREE CAPABILITIES, AND THEY ARE NOT ONE ASK ════
--
--   |            | distinguish            | remove                  | edit                      |
--   | `why_go`   | YES — why_go_reviewed_at | YES — the whole point | NO — ruling 1             |
--   | `dishes`   | YES — dishes_confirmed_at | yes (empty array)    | YES — set_saved_place_dishes |
--
-- DISTINGUISH is required for both and is the cheapest. One nullable timestamp separates four
-- states that nothing in the schema can otherwise tell apart:
--
--   why_go NULL, reviewed NULL      the caption said nothing worth paraphrasing. Normal.
--   why_go SET,  reviewed NULL      AN UNREVIEWED MODEL PROPOSAL. Must be labelled as one.
--   why_go SET,  reviewed SET       the user read it and let it stand. Their assertion now.
--   why_go NULL, reviewed SET       the user REMOVED it. No import may put anything back.
--
-- `why_go is not null` cannot tell rows 2 and 3 apart, and on a product whose stated edge is
-- refusing to assert the unconfirmed, that distinction IS the feature.
--
-- THE NAMES DIFFER FROM `0036` ON PURPOSE AND THE DIFFERENCE IS THE RULING: `_confirmed_at` marks a
-- column the user AUTHORS (`tags`, `dishes`); `_reviewed_at` marks one they may only KEEP OR
-- REMOVE (`why_go`). The predicate is identical — NULL means no human has decided — so if the owner
-- answers OD-1 by granting authorship into `why_go`, the upgrade is a rename plus a parameter.
--
-- ═══ RULING 3 — THE REFILL TRAP EXISTS, AND IT IS WORSE HERE THAN IT WAS FOR TAGS ═════════════
--
-- REPRODUCED BY EXECUTION before any of this was designed, in a rolled-back transaction on the
-- local container, using the LIVE `apply_saved_place_extraction`:
--
--   after import 1   why_go = "The best oat milk in the old north."  dishes = {oat flat white,cortado}
--   user removes     why_go = NULL                                   dishes = NULL
--   after import 2   why_go = "The sourdough is worth the queue."    dishes = {sourdough loaf}
--
-- Both columns store "the user removed this" as NULL — `normalize_sentence('')` is NULL, and
-- `tag_list_within` requires cardinality >= 1, so an empty list is NULL too (both re-measured: t,
-- t, t). `coalesce(sp.why_go, ...)` reads that NULL as NEVER WRITTEN and refills from the next
-- caption. Two posts about one restaurant is a DESIGNED case here (`0007` acceptance I3/I4).
--
-- AND IT IS SHARPER THAN `0036`'s. For tags the model put the SAME words back; here it puts back a
-- DIFFERENT SENTENCE. A removal is silently converted into a vacancy for the next model claim, so
-- the user who objected to one sentence they never saw is given another one they never saw.
--
-- THERE IS A SECOND TRAP `0036` DID NOT HAVE, AND IT IS IN `repoint_saved_place`. Measured in the
-- same transaction: a re-point clears `why_go` and `dishes` UNCONDITIONALLY (`0033`). Add a review
-- stamp and forget to clear it, and the row would say "a human reviewed this" about a sentence that
-- no longer exists — AND, because ruling 3's gate keys on that stamp, the new venue's extraction
-- could never write a `why_go` again. Both stamps are therefore cleared with the columns they
-- govern. Asserted by R3.
--
-- ═══ RULING 4 — ONE MIGRATION, TWO TREATMENTS ════════════════════════════════════════════════
--
-- One migration. `why_go` and `dishes` were created by ONE `alter table` in `0019`, share one
-- writer, one normalising trigger and one re-point clear, and the r4 review's criticism of `0036`
-- is precisely that it fixed one of three columns and left the class open. Splitting again would
-- earn that criticism twice; and since an RLS/grants migration never runs concurrently with
-- anything (roster §9 V1), two migrations would serialise anyway, with the second rewritten against
-- the first's copy of the same two function bodies.
--
-- Two treatments, stated as such rather than blurred: `why_go` gets 1 column and a keep/remove
-- function; `dishes` gets 2 columns and a setter.
--
-- ═══ RULING 5 — RE-POINT: `dishes` GOES EVEN WHEN CONFIRMED, AND THAT DIFFERS FROM `tags` ═════
--
-- FLAGGED, NOT BURIED, so `security-privacy` reviews a decision rather than discovers one. `0036`
-- kept a CONFIRMED `tags` array across a re-point, because `date night` and `with maya` are facts
-- about the USER'S PLANS and survive a correction of which POI the row names.
--
-- A DISH LIST IS NOT THAT. `cortado`, `sourdough loaf` are facts about a VENUE'S MENU. If the row
-- now names a different venue, a confirmed dish list is not merely stale, it is FALSE about the
-- place it is attached to — the III.3(n) exposure `0033` closed, arriving through the user's own
-- confirmation instead of the model's. So `dishes`, `dishes_extracted` and `dishes_confirmed_at`
-- are all cleared unconditionally, which also re-opens the column so the new venue's extraction can
-- fill it. `why_go` and `why_go_reviewed_at` likewise. `tags` behaviour is UNTOUCHED.
--
-- The alternative — keep a confirmed dish list — is defensible on the ground that the user typed
-- it. It is rejected because the user typed it ABOUT A PLACE THIS ROW NO LONGER NAMES. Both halves
-- are asserted: R3 (unconfirmed) and R4 (confirmed).
--
-- ═══ WHAT THIS DOES NOT DO ════════════════════════════════════════════════════════════════════
--
-- THERE IS NO CALLER. This is the database half; the surfaces are a sibling lane and `src/` is
-- outside this write scope. Reported as BUILT, not as SHIPPED — the r3 review's judgement that "a
-- reviewed, security-signed-off, live database function with no caller is a worse state than an
-- unapplied migration" is accepted, and this file does not pretend otherwise.
--
-- Two `src/` follow-ups this migration MAKES NECESSARY and cannot perform:
--   1. `why_go` must never render unlabelled while `why_go_reviewed_at is null`.
--   2. the `DISHES MENTIONED` heading attributes the list to the post; once a user edits `dishes`
--      that attribution is false, and the heading must key on `dishes_confirmed_at`.
--
-- APPLIED LOCALLY ONLY. Staging (0018) and production (0026) are the orchestrator's and the
-- owner's. `security-privacy` holds the veto (`agent-guardrails.md` §5, §9).

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table public.saved_places
  add column why_go_reviewed_at  timestamptz,
  add column dishes_extracted    text[],
  add column dishes_confirmed_at timestamptz;

comment on column public.saved_places.why_go_reviewed_at is
  'When the user last DECIDED about the model sentence in `why_go` — kept it, or removed it. NULL '
  'means NO HUMAN HAS LOOKED, so `why_go` is an UNREVIEWED MODEL PROPOSAL and must never be '
  'rendered as an unattributed fact. Non-NULL with `why_go` NULL means the user REMOVED the '
  'sentence, and `apply_saved_place_extraction` may then never write this column again. Set only '
  'by `review_saved_place_why_go`; never grantable, never back-filled — a timestamp invented by a '
  'migration would be the schema manufacturing a decision nobody made. Named `_reviewed_at` and '
  'not `_confirmed_at` because the user may only keep or remove this column, never author it; see '
  '0037''s rulings 1 and 2.';

comment on column public.saved_places.dishes_extracted is
  'What the extractor proposed for `dishes` when this place entered the map, kept verbatim so that '
  'a user editing `dishes` cannot falsify it (0033''s principle, 0036''s ruling 3 one column to the '
  'right). Written once by `apply_saved_place_extraction` as `service_role`; `authenticated` holds '
  'no privilege on it, so a browser UPDATE naming this column is refused with 42501 before any '
  'policy runs. Readable by its owner and by nobody else — 0036''s ruling 1 covers why that is a '
  'decision and not an inheritance, and `saved_places` is still not a fifth security.md §3.4 table.';

comment on column public.saved_places.dishes_confirmed_at is
  'When the user last asserted the list in `dishes`. NULL means that list is still an UNCONFIRMED '
  'MODEL PROPOSAL and must be rendered as a suggestion, not as the user''s choice — and, in '
  'particular, must not be attributed to the source post once it is non-NULL. Set only by '
  '`set_saved_place_dishes`, never grantable, never back-filled.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. THE SAME BOUNDS `0019` PUT ON `dishes`, RE-ASSERTED ON THE PROPOSAL COLUMN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The proposal column is written only by `service_role`, but a bound that exists on one column and
-- not on its twin is a bound that stops describing the table. Same pair, same numbers as `0019`.
alter table public.saved_places
  add constraint saved_places_dishes_extracted_bounded
    check (public.tag_list_within(dishes_extracted, 8, 64)),
  add constraint saved_places_dishes_extracted_normalised
    check (dishes_extracted is null or dishes_extracted = public.normalize_tag_list(dishes_extracted));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE NORMALISING TRIGGER LEARNS THE NEW COLUMN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Spliced from the live `pg_get_functiondef` at base commit a468fb1, plus one line. The trigger is
-- what makes the two CHECKs above satisfiable by construction rather than by every caller
-- remembering to normalise. Timestamps need no normalising.
CREATE OR REPLACE FUNCTION public.normalize_saved_place_enrichment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.tags           := public.normalize_tag_list(new.tags);
  new.dishes         := public.normalize_tag_list(new.dishes);
  new.why_go         := public.normalize_sentence(new.why_go);
  new.tags_extracted := public.normalize_tag_list(new.tags_extracted);   -- 0036
  new.dishes_extracted := public.normalize_tag_list(new.dishes_extracted); -- 0037
  return new;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. BACKFILL — THE PROPOSAL COLUMN ONLY. NEITHER TIMESTAMP IS BACK-FILLED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Every `dishes` value in this database was written by the extractor and by nothing else (the
-- measurement at the top of this file: no other writer exists, and none is reachable from a
-- browser). So the current array IS the model's proposal, and copying it forward records history
-- that is already true rather than inventing it.
--
-- The two timestamps stay NULL on every row, including the 8 rows that carry a `why_go` and the 6
-- that carry `dishes`. Nobody has reviewed anything; a stamp here would be the schema manufacturing
-- a decision, which is the exact failure this migration exists to end.
update public.saved_places
   set dishes_extracted = dishes
 where dishes is not null
   and dishes_extracted is null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. `review_saved_place_why_go` — KEEP OR REMOVE, AND THE STAMP IS INSEPARABLE FROM EITHER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- NOT A COLUMN GRANT, for `0036` ruling 4's reason and one more of its own.
--
--   `0036`'s reason: `why_go_reviewed_at` is a record of a decision. A client that can write it can
--   claim a review it never obtained — precisely the failure the column exists to prevent — and it
--   must be INSEPARABLE from the act it records. Two grants are two statements a caller can issue
--   independently, so the product could remove the sentence without recording who chose to, or
--   record a choice nobody made. A `security invoker` function cannot express this: invoker runs
--   with the caller's privileges and would fail 42501 in its own body.
--
--   0037's own reason: THE ONLY LEGAL WRITE TO `why_go` IS `null`. A grant would permit any string,
--   which is the authorship ruling 1 refuses. A boolean parameter cannot express a sentence, so the
--   capability the owner has not yet ruled on is INEXPRESSIBLE rather than merely unimplemented.
--
-- `security.md` §3.5 invariant 1 — "never grant a definer function whose result is not bounded by
-- the caller's own identity" — is satisfied the same way `apply_saved_place_source_link` (`0016`)
-- satisfies it: returns void, `auth.uid()` in the WHERE, one message for "not yours" and "no such
-- row" so it is not an existence oracle over other people's libraries.
create or replace function public.review_saved_place_why_go(
  p_saved_place_id uuid,
  p_keep           boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_why text;
  v_rev timestamptz;
begin
  -- SECURITY DEFINER, so this function runs with BYPASSRLS and the four policies on `saved_places`
  -- protect nothing inside it. The guards below are the entire boundary and they are written in the
  -- body on purpose — same discipline as `start_import` (0007), `apply_saved_place_source_link`
  -- (0016) and `set_saved_place_tags` (0036).
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- A NULL boolean is neither decision. Refused rather than coerced, because coercing it would
  -- stamp a review the caller did not express.
  if p_keep is null then
    raise exception 'review_saved_place_why_go: p_keep must be true (keep) or false (remove)'
      using errcode = '22004';
  end if;

  select sp.why_go, sp.why_go_reviewed_at into v_why, v_rev
    from public.saved_places sp
   where sp.id = p_saved_place_id
     and sp.user_id = v_uid;

  if not found then
    -- ONE MESSAGE FOR TWO CASES, deliberately. "That save is not yours" and "there is no such save"
    -- are indistinguishable to the caller, so this is not an existence oracle. The id is not echoed
    -- back for the same reason. Same resolution as `set_saved_place_tags` (0036) and
    -- `close_place_mention` (0031).
    raise exception 'review_saved_place_why_go: no such saved place for this user'
      using errcode = '42501';
  end if;

  -- A THIRD TRAP, CLOSED BEFORE IT WAS BUILT. Reviewing a row that has never had a sentence would
  -- stamp `why_go_reviewed_at`, and ruling 3's gate would then stop the extractor writing `why_go`
  -- on that save FOREVER — a save silently denied a sentence because a UI once rendered a control
  -- over an empty column. There is nothing to decide about, so the call is refused. The condition
  -- is `and v_rev is null`, not `v_why is null` alone, so REMOVE STAYS IDEMPOTENT: a double-tap on
  -- an already-removed sentence must be safe, exactly as `repoint_saved_place` (`0032`) is
  -- idempotent for a confirm of a pin that is already right.
  if v_why is null and v_rev is null then
    raise exception 'review_saved_place_why_go: this save carries no model sentence to review'
      using errcode = '22004';
  end if;

  -- ONE STATEMENT. The decision and the record of it are written together, so there is no window in
  -- which the sentence is gone and nothing says a human chose that.
  update public.saved_places sp
     set why_go             = case when p_keep then sp.why_go else null end,
         why_go_reviewed_at = now()
   where sp.id = p_saved_place_id
     and sp.user_id = v_uid;
end;
$$;

comment on function public.review_saved_place_why_go(uuid, boolean) is
  'The only write path to `saved_places.why_go` and `why_go_reviewed_at` from a browser. The caller '
  'either KEEPS the model''s sentence or REMOVES it, and the stamp is written in the same statement '
  'either way, so a sentence cannot change without a record of who decided and a decision cannot be '
  'recorded that nobody made. It cannot SET a sentence: a boolean carries no prose, so authorship '
  'into this column is inexpressible rather than merely unimplemented — 0037''s ruling 1, and OD-1 '
  'is the owner question that would change it. `security definer` because `authenticated` holds no '
  'UPDATE privilege on either column; bounded by `auth.uid()` in the WHERE, returns void, and '
  'refuses another user''s save with 42501 and no existence oracle. Once it has been called, '
  '`apply_saved_place_extraction` may never write `why_go` on that row again.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. `set_saved_place_dishes` — `0036`'s shape, because `dishes` IS `0036`'s problem
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.set_saved_place_dishes(
  p_saved_place_id uuid,
  p_dishes         text[]
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
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- A readable refusal in front of `saved_places_dishes_bounded`, which would otherwise raise 23514
  -- naming a constraint the client cannot interpret. Over-count is REFUSED, never truncated: a
  -- silently dropped item is the product deciding which of the user's words matter. Eight and 64,
  -- from `0019`; `normalize_tag_list` handles the per-item length through the CHECK.
  if p_dishes is not null and cardinality(p_dishes) > 8 then
    raise exception 'set_saved_place_dishes: % items supplied, the maximum is 8', cardinality(p_dishes)
      using errcode = '23514';
  end if;

  -- ONE STATEMENT, for `0036` ruling 4's reason. `normalize_tag_list` returns NULL for an empty or
  -- all-junk array, so `set_saved_place_dishes(id, '{}')` is how a user REMOVES every item — and it
  -- still stamps, which is what stops the next import refilling them. `dishes_extracted` is not in
  -- the SET list and never will be.
  update public.saved_places sp
     set dishes              = public.normalize_tag_list(p_dishes),
         dishes_confirmed_at = now()
   where sp.id = p_saved_place_id
     and sp.user_id = v_uid;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'set_saved_place_dishes: no such saved place for this user'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.set_saved_place_dishes(uuid, text[]) is
  'The only write path to `saved_places.dishes`. Sets the caller''s own list and stamps '
  '`dishes_confirmed_at` in the same statement, so the items and the record of who chose them '
  'cannot be written apart. Passing an empty array removes every item and still stamps — a '
  'deliberate emptying is an assertion, and the extractor may not undo it. Once stamped, the list '
  'is the USER''S and must no longer be attributed to the source post; `dishes_extracted` keeps '
  'what the post named. Same shape and same reasoning as `set_saved_place_tags` (0036 ruling 4), '
  'because a dish name is a token from a closed vocabulary and choosing among them is selection, '
  'not authorship — which is exactly why `why_go` did NOT get this shape.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. EXECUTE — `authenticated` ONLY, AND NOTHING FOR anon OR PUBLIC
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `revoke` first, because PostgreSQL grants EXECUTE to PUBLIC on a new function by default and
-- `create or replace` does not reset it. That default is the `0017` defect `0018` had to clean up;
-- it is not repeated here.
revoke all on function public.review_saved_place_why_go(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.review_saved_place_why_go(uuid, boolean) to authenticated;

revoke all on function public.set_saved_place_dishes(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.set_saved_place_dishes(uuid, text[]) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 8. THE EXTRACTION WRITER — three changes, still service_role only
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Spliced verbatim from `pg_get_functiondef()` on the running container at base commit a468fb1 and
-- then patched, NOT retyped. `0036`'s header records why: a hand-written draft of the re-point body
-- lost three guards at once. Postgres also refuses a `create or replace` that drops this function's
-- three parameter defaults. Diff both bodies against the database.
--
-- Still `SECURITY INVOKER` (`prosecdef = f`) and still `service_role`-only EXECUTE, so nothing a
-- browser can call reaches any of the three changes. Its `sp.user_id = p_user_id` guard remains
-- load-bearing exactly as `0019` says, because `service_role` carries BYPASSRLS.
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

         -- 0037, CHANGE 1. A REMOVAL IS AN ASSERTION, AND SO IS LETTING A SENTENCE STAND.
         -- MEASURED, not reasoned: with the pre-0037 body, a user who removed
         -- "The best oat milk in the old north." had it replaced on the next import by
         -- "The sourdough is worth the queue." — `coalesce` reads the NULL that stores a removal
         -- as "never written". So once `why_go_reviewed_at` is set, in EITHER direction, this
         -- function may not touch `why_go` again. A human's decision outranks a later model write.
         why_go = case when sp.why_go_reviewed_at is not null then sp.why_go
                       else coalesce(sp.why_go, public.normalize_sentence(p_why_go)) end,

         -- 0037, CHANGE 2. What the model proposed WHEN THE PLACE ENTERED THE MAP. First non-null
         -- writer wins, like every other column `0019`, `0034` and `0036` govern, so a second
         -- unrelated post about the same venue does not rewrite that history. Written even when
         -- `dishes` is not — the proposal is worth keeping precisely when the user chose otherwise.
         dishes_extracted = coalesce(sp.dishes_extracted, public.normalize_tag_list(p_dishes)),

         -- 0037, CHANGE 3. The same gate as `tags` (0036) and for the same measured reason:
         -- `tag_list_within` requires cardinality >= 1, so "the user deleted every dish" is stored
         -- as NULL and a plain coalesce refills it from the next caption.
         dishes = case when sp.dishes_confirmed_at is not null then sp.dishes
                       else coalesce(sp.dishes, public.normalize_tag_list(p_dishes)) end
   where sp.id = p_saved_place_id
     and sp.user_id = p_user_id;
end;
$function$;

revoke all on function public.apply_saved_place_extraction(uuid, uuid, text[], text, text[])
  from public, anon, authenticated;
grant execute on function public.apply_saved_place_extraction(uuid, uuid, text[], text, text[])
  to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 9. RE-POINT — ruling 5. Spliced from the live body the same way, and for the same reason
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
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
           -- 0037. NINE columns now, not six, and the three new ones are all UNCONDITIONAL.
           -- Both stamps go with the columns they govern: leaving `why_go_reviewed_at` set would
           -- say a human reviewed a sentence that no longer exists AND — because 0037's gate keys
           -- on that stamp — would permanently stop the NEW venue's extraction from ever writing a
           -- `why_go`. That is a defect this migration would have armed; asserted by R3.
           why_go             = null,
           why_go_reviewed_at = null,

           -- `dishes` GOES EVEN WHEN CONFIRMED, and this is the one place 0037 deliberately
           -- differs from 0036's treatment of `tags`. A tag is a fact about the USER'S PLANS
           -- (`date night`, `with maya`) and survives a correction of which POI the row names. A
           -- dish is a fact about a VENUE'S MENU: attached to a row that now names a different
           -- place it is not stale, it is FALSE — the III.3(n) exposure, arriving through the
           -- user's own confirmation rather than the model's. Clearing the stamp with it re-opens
           -- the column so the new venue's extraction can fill it. See 0037's ruling 5, which
           -- flags this as a judgement call rather than burying it. `tags` below is UNCHANGED.
           dishes              = null,
           dishes_extracted    = null,
           dishes_confirmed_at = null,
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

revoke all on function public.repoint_saved_place(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.repoint_saved_place(uuid, uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 10. NO COLUMN GRANT ON ANY OF THE FIVE. STATED, NOT ASSUMED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A column-level REVOKE does not remove the table-level `authenticated=rd` grant `0004` gave this
-- table, so SELECT survives this statement — verified after `0036` ran the identical statement for
-- `tags` and `tags` still reports SELECT in `information_schema.column_privileges`. That read is
-- INTENDED and is `security.md` §3.4's option (3): the owner MUST be able to see what the model
-- proposed, and `0036`'s T5 established by execution that no policy on `saved_places` returns
-- another user's row, not even to a collection peer. R5 re-runs that adversary against these five
-- columns rather than trusting the earlier result.
--
-- What this statement does buy is that no future `grant update on public.saved_places` — the shape
-- that would hand a browser every column at once — can arrive silently on these five.
revoke all (why_go, why_go_reviewed_at, dishes, dishes_extracted, dishes_confirmed_at)
  on public.saved_places from public, anon, authenticated;

commit;
