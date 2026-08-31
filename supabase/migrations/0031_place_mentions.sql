-- 0031_place_mentions.sql — E1, "the mention we could not place".
--
-- WHAT THIS IS. At LEVEL B's ~27% hit rate the modal import outcome is "no places in this one", and
-- today that outcome produces no row anywhere: the model's candidate sits in `imports.candidates`
-- and the user's intent to keep it is lost. A mention is the row that says "this post named
-- something, we could not put it on the map, and the user asked us to keep it anyway". It is a
-- per-user record with a link back to the post, and it is never a place.
--
-- Design: docs/entity-proposal.md §E1 and §9.1/§10 (the acceptance criteria), narrowed and
-- conditioned by docs/security-ruling-e1-caption-retention.md — which is the governing document
-- wherever the two differ. The ruling's §9 checklist (conditions 1–11, with 1, 6, 7, 9 inside
-- `security-privacy`'s veto) is what this file implements. Forward-only (`08` §9): nothing at or
-- below 0030 is edited.
--
-- ═══ THE ONE LINE THAT MATTERS MOST ═══════════════════════════════════════════════════════════
--
--   user_id uuid not null references public.profiles (id) on delete cascade
--
-- Condition D1, and it is the WHOLE of the retention bound. There is no TTL here, no sweeper and no
-- job, deliberately (see the next section). The mention lives for the life of the account and dies
-- with it, and the mechanism is a foreign-key referential action — executed by the system, not
-- subject to RLS, FORCE ROW LEVEL SECURITY or column grants, exactly as
-- `docs/overnight-deletion-review.md` §1.1 rests on. There is nothing to schedule and no way for it
-- to silently stop working.
--
-- It is also the line that keeps an existing ruling true. `place_mentions` is the FOURTH table in
-- this schema to reference `public.sources`, and the first that could carry a `sources` link past an
-- account deletion. The other three all sever (ruling §11.1): `extractions.source_id` has no user
-- column at all, `imports.source_id` dies via `imports.user_id → profiles`, and
-- `saved_place_sources.source_id` dies via `saved_places → profiles`. `overnight-deletion-review.md`
-- §4.3 rules caption text surviving account deletion CORRECT BY DESIGN precisely because, after the
-- cascade, no row joins a `sources` row to a departed user. A mentions table with `source_id` and
-- without D1 would be the first row that does — turning a correct design into a real erasure defect,
-- silently. `set null` would leave the text orphaned-but-present; `restrict` would make a mention
-- BLOCK account deletion, which is worse. Cascade, not nullable, not restrict.
--
-- `src/app/actions/account.ts` needs no change and must not receive one: `deleteAccount()`
-- deliberately writes no cleanup statements, because the FK graph is the one definition of "the
-- user's data" that Postgres actually obeys. This table joins that graph automatically.
--
-- ═══ WHAT IS DELIBERATELY ABSENT, AND THE ABSENCE IS THE ASSERTION ════════════════════════════
--
-- 1. NO TTL-SHAPED COLUMN OF ANY KIND. No `expires_at`, no `deleted_at`, no retention timestamp.
--    `imports.expires_at` (0003:86) is a column default that NOTHING READS — no pg_cron, no Edge
--    Function (there is no supabase/functions/), no scheduled workflow, no `delete from imports`
--    anywhere in the repo — and it has been quoted as a 24-hour hold in four documents including a
--    migration header. A TTL here would rebuild that defect under a new name, on the one entity that
--    exists to remove it. `created_at` / `updated_at` are the schema-wide convention (every table
--    since 0002 has them, `updated_at` maintained by the touch trigger); neither is read by anything
--    for expiry, and adding something that is would be a new decision, not this one.
--
-- 2. NO COORDINATES. No lat, no lng, no geometry, no place_id, no FK to `places` — ever. A mention
--    has no pin, is not counted in "N places", and the moment it acquires coordinates it IS a saved
--    place and the mention closes (`saved_place_id` below). `address_hint` and `area_hint` are
--    strings the caption contained and are ONE PROVIDER CALL from being a coordinate, which is why
--    ruling condition 9 is inside the veto: NO BACKGROUND GEOCODING OF ANY COLUMN HERE. No resolver
--    call, no `place_lookups` write, no `resolve_place`, on any schedule or trigger. The user's own
--    action in manual-add is the only path from a hint to a coordinate. Nothing in this file calls
--    anything, and no trigger on this table does anything but maintain `updated_at`.
--
-- 3. NO CAPTION, AND NO `evidence`. Ruling §3 is the narrowing and it is the difference between an
--    approval and a veto. What may be stored is the MODEL'S EXTRACTION: `raw_name`
--    (`PlaceCandidate.rawName`, caption-verbatim, a venue name) and the extracted hints. What may
--    NOT: `sources.content_text` (the full caption — unbounded, attacker-controlled third-party text
--    carrying promo codes, phone numbers, third parties' names and political statements, none of it
--    about the place) and `PlaceCandidate.evidence`, which `src/domain/types.ts` types as "for our
--    own debugging only" — putting it on a permanent row promotes a debug field to a product string
--    with no cap, no truncation rule and no copy review.
--
--    NOTE FOR A GREP, because acceptance criterion 13 is written as one. Both names DO occur in this
--    file — seven times, all of them in prose or in a `comment on`, every one of them saying the
--    value is NOT stored. There is no column, no parameter, no default and no query here that reads
--    or writes either. `git grep -n 'content_text\|evidence' supabase/migrations/0031_place_mentions.sql`
--    returns comments only, and that is the intended state: a migration that refuses something
--    should say what it refuses, the way 0012's header names `provider_payload`.
--
--    The length caps below are part of that control, not cosmetics: with `raw_name` capped at 200
--    and each hint capped, a caller CANNOT smuggle a caption into this table through a permitted
--    column. The cap is what makes "the extraction, not the caption" enforceable at the database
--    rather than trusted to the writer.
--
--    Accuracy constraint that travels with the data (ruling §3, last paragraph): quotation marks are
--    honest around `raw_name` and around NOTHING ELSE here. A derived or normalised value rendered
--    in quotes asserts a quotation we did not take. `voice-and-vocabulary.md` owns those strings.
--
-- 4. NO WIDENING OF `sources.platform`. Its `check (platform in ('tiktok'))` is untouched — ruling
--    U3, inside the veto. `sources` is a GLOBAL table read through `sources_select_via_membership`,
--    and its `platform_source_id` check (`^[0-9]{17,20}$`) encodes TikTok's identity model and
--    nobody else's. Widening it would mint cross-user-visible rows for platforms with no VERIFIED
--    read mechanism. The Instagram / YouTube case is therefore the SECOND ARM below: a nullable
--    plain-URL column on the user's own row, with no `sources` row at all.
--
-- 5. NO SERVER-SIDE FETCH OF `external_url`, EVER (ruling U1, inside the veto). Not for a title, not
--    for an oEmbed, not for a preview image, not "just the og: tags". `security.md` owed item 3
--    records the SSRF control as a closed six-host allow-list, default-deny, with every redirect hop
--    re-validated; an arbitrary-URL column with a fetcher behind it is a new SSRF surface with no
--    allow-list at all. This file gives that column no reader; the constraint on the `src/` side is
--    asserted by grep, not by SQL, and it is a condition on the feature rather than on this file.
--    `check (external_url ~ '^https://')` (U2) IS in SQL, because a stored `javascript:` or `data:`
--    URL rendered into an href is stored XSS and client-side validation is not a control.
--
-- 6. NO NEW ARM ON ANY EXISTING POLICY. `sources_select_via_membership` (0006:162-170) keeps exactly
--    its two self-referential arms; no policy on `sources` or `extractions` names this table; no
--    policy here names any `collection_*` table; no existing collections policy gains an arm. Ruling
--    condition 6, inside the veto, and the reason is the sharpest attack in this schema: `security.md`
--    §1 invariant 2 records that `sps_insert_own`'s import-ownership predicate is "the only thing
--    preventing self-granted access to cached caption text". A user-writable table wired into that
--    predicate would hand a user read access to any cached caption by naming its `source_id`.
--    A mention is import history in its purest form — a record that you pasted a post and what we
--    thought was in it — so it never travels into a shared collection and never reaches an invite
--    token holder. 0024:579-581 already refuses to disclose "which post someone saved a place from";
--    this is the same refusal, and `security-privacy` upgraded it from a scope line to a security
--    constraint.
--
-- 7. NO AGGREGATES. No cross-user count, no "N people also could not place this", no
--    most-mentioned list. That is a discovery signal over third-party text and Charter §1 refuses
--    creator discovery outright. Nothing here computes across users and no policy admits a row the
--    caller does not own.
--
-- ═══ WHO MAY WRITE ONE, AND WHY `authenticated` HOLDS NO INSERT ═══════════════════════════════
--
-- A mention is created by the USER'S ACTION and never automatically (entity-proposal §10.4): the
-- review screen's third action — keep for later — and its equivalent on the no-places screen are the
-- only things that make one. An automatic mention on every failed import would accumulate at roughly
-- three quarters of all imports, unasked for, and would be the second graveyard this entity exists
-- to avoid.
--
-- That tap calls a server action, and the server inserts. `authenticated` gets NO INSERT GRANT and
-- there is NO INSERT POLICY — the shape `imports` has carried since 0003 B7 and `collection_members`
-- since 0024, and both are cited by the ruling as the pattern. Two independent controls: with no
-- INSERT privilege the statement is refused (42501) before RLS is ever consulted.
--
--   THREE POLICIES, NOT FOUR, AND THE THIRD-PARTY RULING ON IT. Ruling §4 says "Policies — four";
--   this file creates THREE (select, update, delete) and `security-privacy` has confirmed three,
--   superseding its own sentence: the four "was a boilerplate count rather than a reasoned position
--   — it contradicted the precedent my own §4 cites in the sentence above it." Both of those
--   precedents — `imports` (0003 B7: "no INSERT grant, no INSERT policy") and `collection_members`
--   (0024, asserted by inventory.sql check 2's own comment) — have neither grant nor policy.
--
--   AND THE REASON IS BETTER THAN THE PRECEDENT, because it is about which mistake is survivable:
--
--     A missing policy is a DENY, and it fails LOUDLY, in development. RLS is enabled *and forced*
--     on every table here, so if a later migration grants INSERT with no INSERT policy, the very
--     first insert anyone tries returns zero rows / 42501, locally, immediately.
--
--     A policy without a grant does the OPPOSITE. It sits inert, reads as a control while being
--     none, and then activates SILENTLY — as PERMISSION — the moment an unrelated change adds the
--     grant, with nobody re-reading the predicate.
--
--   So three is not the conventional choice or a shortfall against the spec; it is the arrangement
--   whose failure mode is the safe one. And the absence of the fourth is an ASSERTED FACT rather
--   than an omission a future auditor might "fix": `inventory.sql` check 2 compares the policy set
--   in both directions and additionally asserts this count by itself (condition 12), so a fourth
--   policy appearing on this table FAILS.
--
-- The two writers are `record_place_mention()` and `close_place_mention()` at the end of this file.
-- Both are SECURITY DEFINER, both are revoked from public/anon/authenticated and granted to
-- `service_role` alone, exactly as `start_import` (0007) and `resolve_place` (0007) are. Neither is
-- reachable from a browser: `security.md` §1 invariant 1 and guardrail 18 forbid granting EXECUTE on
-- a definer that writes columns the caller holds no grant on, and that is what these two do. Ruling
-- condition 15 — "no SECURITY DEFINER function returning a mention row is granted to
-- `authenticated`" — is satisfied twice over: neither returns a row of this table, and neither is
-- granted to a browser role at all.
--
-- NO service_role TABLE GRANTS, and the revoke names it (0024's posture, and 0024's measured
-- reason). A `postgres`-owned ALTER DEFAULT PRIVILEGES entry hands `service_role`
-- `Dxtm` — TRUNCATE, REFERENCES, TRIGGER, MAINTAIN — on every new table in `public`, and TRUNCATE is
-- not subject to RLS. Revoked here; inventory.sql checks 9 and 9d are the runtime proof that it
-- stayed revoked. The consequence is deliberate: a leaked service key can call the two functions but
-- CANNOT read or enumerate anyone's mentions through this table, because the definer functions run
-- as `postgres` and the role itself holds nothing. Every user-scoped read of this table is anon key
-- + RLS, as it should be.
--
-- ═══ THE STATE MODEL, AND WHY THERE IS NO `status` COLUMN ═════════════════════════════════════
--
-- Three states, all derived, none of them a writable string:
--   open      dismissed = false and saved_place_id is null
--   dismissed dismissed = true                                  <- the ONE client-writable column
--   placed    saved_place_id is not null                        <- server-written, no client grant
--
-- A `status text` column would be a lie waiting to happen: `authenticated` needs to be able to
-- dismiss, so it would need UPDATE on that column, and it could then write 'placed' without ever
-- having placed anything. Deriving the state from a boolean the user owns and a pointer only the
-- server writes makes the false state UNEXPRESSIBLE rather than merely refused. It also keeps the
-- table free of any timestamp that could be read as a soft-delete or a retention clock (absence 1).
--
-- `saved_place_id` is a COMPOSITE foreign key to `saved_places (id, user_id)` — the `sps_owner_fk`
-- pattern from 0006:45 — so a mention cannot point at another user's library row at all, whatever
-- the writer does. `on delete set null (saved_place_id)` (Postgres 15+; local and both hosted
-- projects are 17) nulls ONLY the pointer when the user later deletes that saved place, reopening
-- the mention: a plain `set null` would try to null `user_id` too and fail the NOT NULL, `cascade`
-- would silently destroy the mention, and `restrict` would make a mention block the deletion of a
-- place. The mention outliving the place it became is the honest outcome.
--
-- ═══ WHAT ELSE THIS FILE IS NOT ═══════════════════════════════════════════════════════════════
-- `imports.expires_at`'s decorative default (ruling F2) and `0003`'s false comment on
-- `sources.content_text` (ruling F1, "no product surface displays it" — two screens do) are both
-- owed and are both SEPARATE migrations. Neither rides in on an RLS migration.
--
-- ═══ VERIFICATION STATUS — READ THIS BEFORE ASSUMING THE TESTS EVER PASSED ════════════════════
--
-- **AT THE TIME THIS FILE WAS WRITTEN, NOT ONE STATEMENT IN IT HAD BEEN EXECUTED ANYWHERE.**
-- Measured on the authoring machine at base commit `020d1d6`: the Docker daemon was not running,
-- `psql` was not installed at all (so `npm run db:test`, which shells out to a host `psql`, could
-- not have run even with the container up), `127.0.0.1:54322` refused the connection, and there was
-- no Postgres client in `node_modules`. Independently re-measured by the orchestrator, who found the
-- same and additionally that `psql` is absent from the machine entirely.
--
-- This is a STANDING PROPERTY OF THIS ENVIRONMENT, NOT ONE DAY'S ACCIDENT.
-- `security-ruling-e1-caption-retention.md` §4, "What is NOT proven", records the identical
-- unavailability when the ruling that governs this file was written, and nothing on the machine
-- changed between the two. So the next person to read this must not infer from a green CI run, a
-- merged PR or the existence of `supabase/tests/0031_place_mentions_policy_tests.sql` that the two
-- assertions the design actually rests on were ever executed:
--
--   * **criterion 1c / D1** — the `profiles` delete. The FK above is the whole retention bound, and
--     reading a foreign key is not proving one (test M14a/M14b).
--   * **condition Q** — a second user cannot read or delete another's mention, proven by attempt at
--     the database and zero rows, not by reading the policy (test M7a–M7e).
--
-- Everything asserted in this header about grants, policies, referential actions and constraints is
-- read from the DDL, which for those four classes is authoritative rather than indicative — and is
-- exactly what the ruling said it would not accept on its own for condition Q. The policy-test file
-- is written to run the moment a container exists; until it has, it is a hypothesis with good
-- syntax. If you are looking at this line and the test file has since been run, say so in the
-- migration that follows rather than editing this one.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE TABLE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table public.place_mentions (
  id             uuid primary key default gen_random_uuid(),

  -- D1. The whole retention bound. See the header; this is the most important line in the file.
  user_id        uuid not null references public.profiles (id) on delete cascade,

  -- ── the two producers, exactly one of them per row ──────────────────────────────────────────
  -- TikTok: the post has a `sources` row, created by start_import() before any network call (R4).
  -- `on delete restrict` matches `imports.source_id` (0003:60) and `saved_place_sources.source_id`
  -- (0006:37): removing a mention can never reach the shared cache, which is acceptance criterion 9.
  source_id      uuid references public.sources (id) on delete restrict,

  -- Everything else: `sources.platform` is checked to 'tiktok' and is NOT widened (U3), so an
  -- Instagram or YouTube link has no `sources` row and never will. It lives here, on the user's own
  -- private row, as the URL they pasted and nothing else. U2: the `^https://` check is the control
  -- that stops a stored `javascript:`/`data:` URL becoming stored XSS in an href. U1: nothing
  -- server-side ever fetches this value.
  external_url   text check (external_url is null
                             or (external_url ~ '^https://' and length(external_url) <= 2048)),

  -- ── what the post named: the EXTRACTION, not the caption (ruling §3) ────────────────────────
  -- PlaceCandidate.rawName — "exactly as the caption wrote it" — a venue name, the same class of
  -- value `saved_places.name` already holds for the resolved case. The 200-character cap matches
  -- `saved_places.display_name` (0006:11) and is load-bearing: it is what makes "a name, not a
  -- caption" a database constraint instead of a promise.
  raw_name       text not null check (length(btrim(raw_name)) between 1 and 200),

  -- The extracted hints. BINDING RULE, adopted from the proposal by the ruling: extracted only,
  -- NEVER inferred, and null if the caption did not say. A null here means the post was silent and
  -- the screen says nothing; it must never be filled by a lookup, a default or a guess.
  -- `category_hint` is what the caption said, NOT a category on the mention: entity-proposal §9.2
  -- puts "a category on a mention" out of scope and the ruling permits the extracted hint, so this
  -- column is deliberately NOT constrained to the 0028/0030 taxonomy and must not be rendered as a
  -- category chip. It exists to prefill manual-add.
  city_hint      text check (city_hint     is null or length(btrim(city_hint))     between 1 and 120),
  country_hint   text check (country_hint  is null or length(btrim(country_hint))  between 1 and 120),
  area_hint      text check (area_hint     is null or length(btrim(area_hint))     between 1 and 120),
  address_hint   text check (address_hint  is null or length(btrim(address_hint))  between 1 and 300),
  category_hint  text check (category_hint is null or length(btrim(category_hint)) between 1 and 60),

  -- ── why it is not a place: a CLOSED set, the same discipline as imports.error_code ──────────
  -- Free text here would become a second, drifting vocabulary that the copy has to render. The five
  -- values are entity-proposal §E1's own list. Deliberately NOT tied to which arm produced the row:
  -- a TikTok short link that fails to expand has no `sources` row either, and forcing
  -- 'platform_not_read' onto every URL-arm mention would make the reason wrong for that case.
  reason         text not null check (reason in ('no_match',              -- nothing matched
                                                 'match_too_weak',        -- matched below the bar
                                                 'beyond_candidate_cap',  -- past the per-import cap
                                                 'platform_not_read',     -- a platform we cannot read
                                                 'skipped_at_review')),   -- the user skipped it

  -- ── state: one client-writable boolean, one server-written pointer ──────────────────────────
  -- The ONLY column in this table `authenticated` may UPDATE. Dismissing is not deleting: the
  -- mention stays, and the `imports` row and any `sources` row are untouched either way.
  dismissed      boolean not null default false,

  -- The mention became a saved place. Server-written only — no client grant on any statement, so
  -- "I placed this" cannot be asserted from a browser. The composite FK below is what makes it
  -- impossible for this to point at somebody else's library row.
  saved_place_id uuid,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One entity, two producers, exactly one per row. A TikTok mention carries `source_id` (the URL is
  -- already on `sources.canonical_url`); everything else carries `external_url`. Neither-nor would be
  -- a mention from nowhere; both-and would be a second, drifting copy of the post's URL.
  constraint place_mentions_one_origin check (num_nonnulls(source_id, external_url) = 1),

  -- 0006:45's `sps_owner_fk` pattern. The referenced key is `saved_places_id_user_unique (id,
  -- user_id)`, so the database — not the writer, not a policy — is what guarantees a mention only
  -- ever points at ITS OWN user's saved place. See the header for why the action names one column.
  constraint place_mentions_saved_place_fk foreign key (saved_place_id, user_id)
    references public.saved_places (id, user_id) on delete set null (saved_place_id)
);

create trigger place_mentions_touch before update on public.place_mentions
  for each row execute function public.touch_updated_at();

comment on table public.place_mentions is
  'E1: something a post named that we could not put on the map, kept because the user asked. Never a '
  'place: no coordinates, no pin, not counted in the library total. Holds the model''s EXTRACTION '
  '(rawName + the extracted hints), never the caption and never PlaceCandidate.evidence. Retention '
  'bound is the life of the account, enforced by user_id''s cascade from profiles and by nothing '
  'else — there is deliberately no TTL column here.';
comment on column public.place_mentions.user_id is
  'The whole retention bound (condition D1). ON DELETE CASCADE from profiles is what makes '
  'account deletion remove this row, and it is why this table can reference sources without '
  'breaking overnight-deletion-review.md §4.3. Never nullable, never SET NULL, never RESTRICT.';
comment on column public.place_mentions.raw_name is
  'PlaceCandidate.rawName: the venue name as the caption wrote it. Caption-VERBATIM, which is why '
  'quotation marks are honest around this value and around no other value on this row. Capped at '
  '200 so a caption cannot be smuggled in through it.';
comment on column public.place_mentions.external_url is
  'The link the user pasted for a platform sources cannot hold (platform is checked to tiktok and '
  'is not widened). NEVER FETCHED SERVER-SIDE — no oEmbed, no title, no og: tags: there is no SSRF '
  'allow-list behind this column. The ^https:// check is the control against stored javascript: URLs.';
comment on column public.place_mentions.saved_place_id is
  'Set only by close_place_mention() on the server. No client grant on any statement, so a mention '
  'cannot claim to have become a place. Composite FK to (id, user_id): it can only ever point at '
  'this user''s own saved place.';
comment on column public.place_mentions.dismissed is
  'The one column authenticated may UPDATE. Dismissal is not deletion of the import or the source.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- The list read: this user's mentions, newest first. Same shape as saved_places_user_recent_idx
-- (0006:99) and imports_user_recent_idx (0003:95). Not measured under load and not claimed to be —
-- at tens of rows per user the planner may well prefer a scan; it is the conventional shape, it is
-- nearly free, and it also serves the user_id half of the cascade on account deletion.
create index place_mentions_user_recent_idx on public.place_mentions (user_id, created_at desc);

-- Leads on saved_place_id, which no other index here can serve. This is the lookup Postgres runs on
-- every `delete from saved_places` to apply the composite FK's SET NULL action, and deleting a saved
-- place is an ordinary user action — without it that is a sequential scan of this table per delete.
-- NOT partial, deliberately, even though the column is mostly null: a referential-action lookup is
-- planned from a parameterised query, and an index whose usability depends on the planner proving a
-- partial predicate from a parameter is not the thing to make a delete path depend on. The index is
-- tiny either way.
create index place_mentions_saved_place_idx on public.place_mentions (saved_place_id, user_id);

-- Idempotency, one index per arm, and together they cover every row because exactly one of
-- (source_id, external_url) is non-null. A second "keep for later" tap on the same candidate is a
-- no-op rather than a duplicate row — the same property imports_open_one_per_source (0003:102),
-- saved_places_user_place_unique (0006:23) and collection_items_unique (0024:161) give their tables.
-- Normalised on lower(btrim(...)) so trailing whitespace and case do not mint a second copy; these
-- are also the indexes record_place_mention()'s lookup runs on.
create unique index place_mentions_source_arm_uniq
  on public.place_mentions (user_id, source_id, lower(btrim(raw_name)))
  where source_id is not null;
create unique index place_mentions_link_arm_uniq
  on public.place_mentions (user_id, external_url, lower(btrim(raw_name)))
  where external_url is not null;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. RLS, THE REVOKE, AND THE COLUMN GRANTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

alter table public.place_mentions enable row level security;
alter table public.place_mentions force  row level security;

-- FIRST, and naming all three roles. A new table in `public` arrives with ALL granted to `anon` and
-- `authenticated` from an ALTER DEFAULT PRIVILEGES entry owned by `supabase_admin` that the
-- migration role cannot remove (0008's header; inventory.sql check 0 still reports it live), plus
-- `Dxtm` to `service_role` from a second, `postgres`-owned entry (0024's header, measured). Only an
-- explicit revoke closes either. `scripts/check-migration-grants.sh` greps for exactly this shape.
revoke all on public.place_mentions from anon, authenticated, service_role;

-- COLUMN-SCOPED, never table-level — 0019:417's reason, which is the one that matters here:
-- BECAUSE THE GRANTS ARE COLUMN-SCOPED, A COLUMN ADDED BY A LATER MIGRATION ARRIVES UNGRANTED BY
-- DEFAULT. `extractions` is the counter-example: its table-level `grant select` (0004:33) is why
-- `extractions.candidates` — including each candidate's `evidence`, a verbatim caption fragment — is
-- browser-readable today. This table will not repeat that.
--
-- Every column is named, so the read is complete and PostgREST's `select=*` works; nothing is hidden
-- from the row's own owner, because everything on the row is theirs. `created_at`/`updated_at` are
-- granted here where `sources` withholds them (R8) — the difference is that `sources` is a GLOBAL
-- row whose age discloses another user's activity, and this row is the reader's own.
grant select (id, user_id, source_id, external_url, raw_name,
              city_hint, country_hint, area_hint, address_hint, category_hint,
              reason, dismissed, saved_place_id, created_at, updated_at)
  on public.place_mentions to authenticated;

-- ONE column, and this is acceptance criterion 5 / ruling condition 5. `raw_name` and every hint are
-- NOT grantable, so "rewrite what the post said" is not expressible in SQL at all, independently of
-- whether the policy is right: an UPDATE of the text from a browser fails at the DATABASE with
-- 42501, not in the UI. `user_id` and `source_id` are not grantable, so a mention cannot be given
-- away or re-attributed to a post the user never pasted. `saved_place_id` is not grantable, so
-- "I placed this" cannot be forged. `id`, `created_at` and `updated_at` are withheld for the reasons
-- 0024 states: a client-chosen primary key and a backdated row.
grant update (dismissed) on public.place_mentions to authenticated;

-- DELETE is granted, and the ruling says why: unlike `imports`, a mention is not an audit record.
-- The user must be able to remove one. There is no column-level DELETE in Postgres, so this is
-- table-level by construction and is bounded by the policy below.
grant delete on public.place_mentions to authenticated;

-- NO INSERT GRANT AND NO INSERT POLICY. See the header: a mention is created by a server action
-- through record_place_mention(), the shape `imports` has had since 0003 B7 and `collection_members`
-- since 0024. With no INSERT privilege the statement is refused before RLS is consulted, so the
-- two controls are independent.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. POLICIES — three, all `to authenticated`, all "your row and only your row"
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `(select auth.uid())` rather than a bare `auth.uid()`: this schema's convention since 0003:158 and
-- a planner optimisation (the subquery is evaluated once per statement, not once per row).
--
-- No policy here names `sources`, `extractions`, `imports` or any `collection_*` table. A mention is
-- reachable by exactly one person and there is no second arm, no membership predicate and no helper
-- function to widen later. Enumeration is closed by construction: uuid primary key, user-scoped
-- policy, no count path that crosses users.

create policy place_mentions_select_own on public.place_mentions
  for select to authenticated using (user_id = (select auth.uid()));

-- WITH CHECK as well as USING, and not only USING: the qual decides which rows may be updated, the
-- check decides what they may become. Without the check a user could not re-parent their own row
-- today (user_id carries no UPDATE grant) but would be able to the moment anyone widened the grant.
create policy place_mentions_update_own on public.place_mentions
  for update to authenticated using       (user_id = (select auth.uid()))
                                with check (user_id = (select auth.uid()));

create policy place_mentions_delete_own on public.place_mentions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. THE TWO WRITERS — service_role only, never reachable from a browser
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Both are SECURITY DEFINER for one reason: `authenticated` holds no INSERT on this table and
-- `service_role` holds no grant on it either (section 3), so an invoker-mode function would be
-- refused. They run as `postgres`, which carries BYPASSRLS, so FORCE ROW LEVEL SECURITY does not
-- apply to them — the same mechanism `start_import()` uses to write `imports`, a table with no
-- INSERT policy at all.
--
-- Because the caller is `service_role`, which bypasses RLS, NO POLICY PROTECTS THESE ROWS FROM THE
-- FUNCTION. Each therefore enforces ownership in its OWN predicate, `p_user_id` supplied by a server
-- that has already authenticated the session. Same discipline as `start_import` (0007),
-- `apply_saved_place_source_link` (0016) and `apply_saved_place_extraction` (0019).

-- Create a mention, or return the one that is already there. Idempotent by design: the "keep for
-- later" tap must be safe to double-fire, and the two partial unique indexes above are what make the
-- second call a no-op rather than a duplicate.
create or replace function public.record_place_mention(
  p_user_id       uuid,
  p_reason        text,
  p_raw_name      text,
  p_source_id     uuid default null,
  p_external_url  text default null,
  p_city_hint     text default null,
  p_country_hint  text default null,
  p_area_hint     text default null,
  p_address_hint  text default null,
  p_category_hint text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_id   uuid;
  v_name text := btrim(p_raw_name);
begin
  if p_user_id is null then
    raise exception 'record_place_mention requires a user id' using errcode = '22004';
  end if;

  -- The no-borrowed-provenance rule, server-side. `sps_insert_own` (0006:135-142) enforces the same
  -- thing in a policy; a policy cannot help here because service_role bypasses RLS, so the function
  -- refuses it itself. A mention that names a `source_id` the user never pasted would be a claim
  -- about somebody else's import history — and it is the shape that, wired into a membership
  -- predicate, would become a read primitive over the cached captions. It is refused at the source.
  if p_source_id is not null and not exists (
       select 1 from public.imports i
        where i.source_id = p_source_id and i.user_id = p_user_id) then
    raise exception 'record_place_mention: user % has no import for source %', p_user_id, p_source_id
      using errcode = '42501';
  end if;

  -- Already kept? Return it. Matches the two unique indexes exactly, including the normalisation.
  select m.id into v_id
    from public.place_mentions m
   where m.user_id      = p_user_id
     and m.source_id    is not distinct from p_source_id
     and m.external_url is not distinct from p_external_url
     and lower(btrim(m.raw_name)) = lower(v_name);
  if found then
    return v_id;
  end if;

  begin
    insert into public.place_mentions
      (user_id, source_id, external_url, raw_name, reason,
       city_hint, country_hint, area_hint, address_hint, category_hint)
    values (p_user_id, p_source_id, p_external_url, v_name, p_reason,
            -- '' is not a hint. The binding rule is "extracted, or absent"; an empty string would be
            -- a third state that renders as a blank line and reads as knowledge we do not have.
            nullif(btrim(p_city_hint),     ''),
            nullif(btrim(p_country_hint),  ''),
            nullif(btrim(p_area_hint),     ''),
            nullif(btrim(p_address_hint),  ''),
            nullif(btrim(p_category_hint), ''))
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent second tap won the race. Adopt its row rather than failing the request — the
    -- same resolution start_import() (0007) makes for a second tab pasting the same link.
    select m.id into v_id
      from public.place_mentions m
     where m.user_id      = p_user_id
       and m.source_id    is not distinct from p_source_id
       and m.external_url is not distinct from p_external_url
       and lower(btrim(m.raw_name)) = lower(v_name);
    -- Re-raise rather than return null. A unique violation this lookup cannot explain means some
    -- OTHER unique index was hit, and a writer that answers "here is your mention: null" is worse
    -- than one that fails: the caller stores the null and the mention is lost with no error.
    if not found then
      raise;
    end if;
  end;

  return v_id;
end;
$fn$;

comment on function public.record_place_mention(uuid, text, text, uuid, text, text, text, text, text, text) is
  'The ONLY writer of a place_mentions row. service_role only: authenticated holds no INSERT grant '
  'and no INSERT policy exists, so a mention is created by the server action behind the user''s '
  '"keep for later" tap and by nothing else. Enforces the import-ownership rule itself, because '
  'service_role bypasses RLS. Idempotent per (user, origin, normalised name). Stores the extraction '
  'only — it has no parameter for the caption and none for PlaceCandidate.evidence, by design.';

revoke all on function public.record_place_mention(uuid, text, text, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_place_mention(uuid, text, text, uuid, text, text, text, text, text, text)
  to service_role;

-- The mention became a place. Called after the user completes manual-add from a mention, on the
-- server, because `saved_place_id` carries no client grant on any statement.
create or replace function public.close_place_mention(
  p_user_id        uuid,
  p_mention_id     uuid,
  p_saved_place_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  if p_user_id is null then
    raise exception 'close_place_mention requires a user id' using errcode = '22004';
  end if;

  -- The composite FK already makes a cross-user pointer impossible; this is the readable refusal in
  -- front of it, so a caller gets 42501 and a sentence rather than a foreign-key violation.
  if not exists (select 1 from public.saved_places sp
                  where sp.id = p_saved_place_id and sp.user_id = p_user_id) then
    raise exception 'close_place_mention: saved place % does not belong to user %',
      p_saved_place_id, p_user_id using errcode = '42501';
  end if;

  -- Ownership in the WHERE clause: service_role bypasses RLS, so this is the only thing that stops
  -- the function writing another user's mention. `saved_place_id is null` makes it first-write-wins
  -- — a mention records the place it became once, and a later call does not repoint it.
  update public.place_mentions m
     set saved_place_id = p_saved_place_id
   where m.id      = p_mention_id
     and m.user_id = p_user_id
     and m.saved_place_id is null;

  return found;
end;
$fn$;

comment on function public.close_place_mention(uuid, uuid, uuid) is
  'The ONLY writer of place_mentions.saved_place_id. service_role only: the column carries no client '
  'grant, so "this became a place" cannot be asserted from a browser. First write wins; the '
  'ownership predicate is in the WHERE clause because service_role bypasses RLS.';

revoke all on function public.close_place_mention(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.close_place_mention(uuid, uuid, uuid) to service_role;

commit;
