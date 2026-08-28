# Hosted migration state, measured — production is at 0009, not 0018

Measured by the orchestrator on 2026-08-28 with `npm run db:status:staging` and
`npm run db:status:prod` (both orchestrator-only under `docs/agent-guardrails.md`).

## The correction

`docs/evidence/deploy/production-readiness-2026-08-28.md` §1 and
`docs/handoff-2026-08-28-session-close.md` §3.1 both state that **both hosted projects sit at
migration `0018`**. That is true of staging and **false of production**.

| Project | Remote head | Missing | Count |
|---|---|---|---|
| staging (`jfuqjzubphfhfleqnkno`) | `0018` | `0019`–`0023` | 5 |
| **production** (`vtboskegexinvhasghri`) | **`0009`** | **`0010`–`0023`** | **14** |
| local | `0023` | — | — |

Production is missing, in order: `0010_poi_index`, `0011_merge_chains_and_invariant_scope`,
`0012_places_column_grant_and_service_role_matrix`, `0013_alias_invariant_tombstone_branch`,
`0014_resolve_place_provenance`, `0015_places_provenance_grant_and_saved_place_reason`,
`0016_saved_place_denormalized_source_link`, `0017_saved_place_extracted_reason_writer`,
`0018_save_place_revoke_public_execute`, `0019_saved_place_enrichment`,
`0020_poi_region_tlv_launch_area`, `0021_poi_prefilter_trigram`,
`0022_poi_prefilter_address_arm`, `0023_place_lookup_cache_rpcs`.

## Why it matters

1. **The two environments are no longer one runbook.** Staging is a five-migration push;
   production is a fourteen-migration push across the whole provenance chain (`0014`–`0017`) and
   the POI index (`0010`–`0013`). "Push staging, verify, push production" assumes they start from
   the same place. They do not.

2. **`0018_save_place_revoke_public_execute` is unapplied on production.** By its name it is a
   privilege revocation on `save_place`. Whether production is exposed *today* — independently of
   the ~100-TikTok batch — is an open question and is being reviewed. It is not a
   batch-readiness item; if it is real it is live.

3. **Production has no point-in-time recovery.** The per-migration recovery answer now has to hold
   across fourteen migrations rather than five.

## One guard already read, so it is not re-derived downstream

`0020_poi_region_tlv_launch_area` opens with two `do $$` guards: it raises if `poi_regions` has no
`tlv` row, and raises again if `tlv` is already loaded (`is_loaded`, `row_count > 0`, or any
`poi_index` row for `tlv`). On production `0010` runs first in the same ordered push and seeds
`tlv`, and production's `poi_index` is empty — so both guards are expected to pass. Expected, not
verified: nothing has been pushed.

## State at the time of writing

Nothing has been pushed to any hosted project. Both remain as measured above.
