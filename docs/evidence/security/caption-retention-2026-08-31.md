# Evidence — where caption-derived text actually lives, and what bounds it

**Lane:** `i3retention` (`security-privacy`) · **Date:** 2026-08-31
**Base commit:** `9a95444ee5b4b61fd4e65fee25b3e25be21f46af` on `no-crumbs-implementation`.
Re-checked at `8f5f12afd92d6aef09a4144abc6b098e64257fa7`, which landed while this was being written: the
only file it changes is `docs/entity-proposal.md` (committing it), and E1's **Shape** list and §7's gate
are byte-identical to what was ruled on — the addition is a scheduling paragraph (L1-completeness vs L2-scope)
that touches no design decision here. Every migration, policy and `src/` line cited is unchanged between
the two commits.
**Supports:** `docs/security-ruling-e1-caption-retention.md` · answers `04` §8 Q4 in part and
`security.md` owed item 6.

Untracked when written; six other lanes hold this tree.

---

## 0. Evidence posture — the live probe is UNAVAILABLE, and this says why

The two-role cross-user probe **was not run**.

```
$ docker info   → Cannot connect to the Docker daemon (docker DOWN)
$ which psql    → not found
$ npx supabase --version → 2.115.0   (CLI present; no daemon to run a container on)
```

`db:reset` / `db:test` and a hand-written two-role probe were therefore all unavailable, and the
local database is an exclusive resource that was not leased to this lane. This is the same blocker
recorded in `docs/overnight-deletion-review.md` §0 on the same machine.

Everything below is read from **the DDL as committed at the base commit**, plus greps over `src/`,
`supabase/`, `scripts/` and `.github/`. For **grants, RLS policies and FK referential actions** that
is authoritative rather than indicative: they are declarative, and Postgres has no discretion about
them. For **the absence of a background job** it is authoritative too, because the search space is
closed — this repo has no Edge Functions directory and one CI workflow.

What is *not* proven here and must be proven on a leased container before `0031` ships: the
cross-user read attempt as two real roles (`supabase/tests/0024_collections_policy_tests.sql` is the
pattern). That is `qa-reliability`'s, and it is named as a condition in the ruling.

---

## 1. The `imports.expires_at` 24-hour bound does not exist

**Claim under test:** *"`imports.candidates` is jsonb with `expires_at default now() + interval '24
hours'`, so the model's finding is destroyed on a timer."* (`docs/entity-proposal.md` §E1, repeated in
the dispatch and in three other documents.)

**Result: FALSE. Nothing enforces it.** `expires_at` is a column default that no code reads.

| Candidate enforcer | Searched | Result |
|---|---|---|
| `pg_cron` / `cron.schedule` | all 29 migrations | **zero hits** |
| A Supabase Edge Function | `ls supabase/` | `migrations`, `tests`, `config.toml`, `seed.sql` — **no `functions/`** |
| A scheduled workflow | `.github/workflows/` | one file, `ci.yml` |
| `delete from ... imports` | `supabase/`, `src/`, `scripts/` | **zero hits** |
| A client delete | `0003` grant block | **no DELETE grant to `authenticated` and no delete policy**, stated deliberately: *"imports are the audit and observability record … expiry is the service role's job"* |
| Any read of `expires_at` on imports | `src/` | only `collections`' invite expiry and the in-process resolver caches. `imports.expires_at` is read by nothing |

The only index that mentions it, `imports_expiry_idx … where status = 'processing'`, is the index a
sweeper *would* use. The sweeper was never written.

**The counter-example that proves the shape of a real one.** `place_lookups` has an enforced TTL:
`place_lookup_cache_put()` (`supabase/migrations/0023_place_lookup_cache_rpcs.sql:83-133`) deletes a
bounded batch (`c_prune_batch := 200`) of expired rows inside a write the pipeline already makes, and
`supabase/tests/0008_policy_tests.sql:1868` asserts it (`PASS P26d a cache write prunes expired rows
rather than leaving them on disk`). Its TTL exists because Google SST §5.4 caps Places content at 30
days (`src/integrations/places/lookup-cache.ts:93`, set to 28 for slack). That is what enforceable
looks like in this codebase; `imports.expires_at` has none of it.

---

## 2. Caption-derived text: the complete retention inventory

Every place caption text or caption-derived text comes to rest, at the base commit.

| # | Location | What exactly | Retention bound | Readable by a browser? | Survives account deletion? |
|---|---|---|---|---|---|
| 1 | `sources.content_text` | **the full caption, verbatim** | **none** | **No** — withheld from the column grant (R8, `0003`) | **YES.** No user column; `imports.source_id`/`saved_place_sources.source_id` are `on delete restrict` on the **parent**, so the child cascades and `sources` stays |
| 2 | `extractions.candidates` jsonb | every `PlaceCandidate`: `rawName` (caption-verbatim name), `cityHint`/`areaHint`/`addressHint`, and **`evidence` — "the caption fragment the name came from, for our own debugging only"** (`src/domain/types.ts`) | **none** | **YES** — `grant select on public.extractions to authenticated` is **table-level** (`0004`, restated `0008:70`), gated by `extractions_select_via_source_membership` | **YES.** Cascades from `sources`, which is not deleted |
| 3 | `imports.candidates` jsonb | the same stored candidate rows, **plus the resolver's coordinates** | `expires_at` default, **unenforced — see §1** | **YES** — `grant select on public.imports to authenticated`, table-level, `imports_select_own` | No — `imports.user_id → profiles on delete cascade` (`0003:59`) |
| 4 | `saved_places.extracted_reason` (`0015`), `tags` / `why_go` / `dishes` (`0019`) | model prose over the caption, **shipped and rendered on every library card** | **none** | **YES**, own rows only | No — `saved_places.user_id → profiles on delete cascade` (`0006:7`) |
| 5 | The browser, for the session | the **whole caption**, `probe-contract.ts:46 readonly caption: string \| null` | the tab | n/a | n/a — grep for `localStorage`/`sessionStorage`/`indexedDB` under `src/app/import/` and `src/ui/import/`: **zero hits**. Nothing is persisted client-side |

**Conclusion.** Permanent retention of caption-derived text is not a change E1 proposes. It has
existed since `0004` (rows 1–2), has been readable by a browser since `0004`/`0008` (row 2), and has
been rendered to users since `0019` (row 4). Rows 1 and 2 are the only ones that **outlive the
account**, and neither is E1.

---

## 3. R8's stated premise is false at this commit

`supabase/migrations/0003_sources.sql`:

```sql
comment on column public.sources.content_text is
  'Post caption. Never granted to `authenticated` (R8): no product surface displays it (ux §12, spec V5).';
```

Measured against the base commit — **two product surfaces display the full caption**:

| File:line | What |
|---|---|
| `src/app/import/screens/review/review-screen.tsx:281` | `{probe.caption !== null && (` — renders the disclosure control |
| `…:296` | `{captionOpen ? 'Hide the caption' : 'Show the caption'}` |
| `…:319` | `{probe.caption}` — the full caption, in a `max-h-38` scrollable panel |
| `…:387` | `caption={probe.caption}` — also passed down to the candidate list |
| `src/app/import/screens/no-places-screen.tsx:326 / 334 / 355 / 364` | the same disclosure, **expanded by default** (the file's header states the inversion is deliberate: with no candidates the caption is the only content) |

The screen's own comment at `review-screen.tsx:309` states the design intent plainly: *"The caption
is screen-level evidence for a rarer question ('what did this post actually say?') than the one each
card already answers with its own verbatim fragment."*

**The grant is still correct; only the comment is false.** The caption does not reach the browser
through PostgREST. It reaches it through `src/app/api/imports/probe/route.ts`, which holds a
`serviceRoleClient()` (line 523) and returns `caption` in its JSON body (line 747). R8 is what stops
a raw `select` on `sources` returning `content_text`, and it is defence in depth against a future
policy arm widening `sources` read access the way `0024` widened `places`.

---

## 4. Non-owner reachability of caption-derived text: closed, and stated in the DDL

`supabase/migrations/0024_collections.sql:579-581`, verbatim:

```
-- No matching policy is added to `place_provider_refs`, `sources`, `extractions`,
-- `saved_place_sources` or `saved_places`. In particular the source TikTok of a shared place is
-- NOT disclosed: which post someone saved a place from is part of their import history.
```

So the two read arms `0024` added — `places_select_if_in_shared_collection` and
`profiles_select_collection_peers` — reach `places` and a display name, and nothing else. An invite
token yields `collection_members`, which is the input to `place_is_in_my_collection()` and
`shares_a_collection_with()`; neither function names `sources`, `extractions`, `imports` or any
per-user overlay table.

`sources`' own gate, after `0006:162-170` extended it, is exactly two arms:

```sql
create policy sources_select_via_membership on public.sources
  for select to authenticated
  using (
        exists (select 1 from public.imports i
                 where i.source_id = sources.id and i.user_id = (select auth.uid()))
     or exists (select 1 from public.saved_place_sources sps
                 where sps.source_id = sources.id and sps.user_id = (select auth.uid()))
  );
```

Both arms are self-referential to the caller. `sps_insert_own` (`0006:135-142`) additionally requires
an owning `imports` row before a user may insert a `saved_place_sources` row — which is
`docs/security.md` §1's invariant 2, and the only thing preventing a self-granted read of cached
caption text. **A third arm on this policy is the single highest-value target in the schema.**

---

## 5. `inventory.sql` will notice a new table, and that is a condition not a courtesy

`supabase/tests/inventory.sql` asserts the *designed* surface, in both directions:

- check 1 — RLS flags per table: *"a table nobody designed is exactly the thing this check exists to notice"* (line 79)
- check 2 — *"the policy set is exactly the designed one, in both directions"* (line 89)
- check 9 — the `service_role` matrix over a `designed(t)` VALUES list (line 838), with no `WITH GRANT OPTION` and no column-level grant
- line 42 — *"every table a future migration creates"* must be designed around

A `0031` that adds a table without updating `inventory.sql` in the same commit leaves the new table's
grants asserted by nothing.
