-- 0015_places_provenance_grant_and_saved_place_reason.sql — two client-surface decisions for the
-- Spot vertical slice, both scoped to what the product owner approved and nothing wider.
--
-- 1. GRANT THE PROVENANCE COLUMNS ON `places`.
-- 0010 added source_dataset / source_dataset_id / resolution_score / last_verified_at to `places`
-- but granted none of them (0012 predates 0010's application and enumerates only the nine
-- pre-existing columns). 0012's own rule — "a new column is withheld until someone names it here" —
-- is honoured by widening the SAME grant rather than replacing it: GRANT SELECT (col-list) is
-- additive, so this does not touch the nine columns 0012 already exposed and does not re-open
-- `provider_payload`, `name_key`, `provider_fetched_at`, `merged_into_place_id`, `created_at` or
-- `updated_at`, all of which stay withheld for the reasons 0012 gives.
--
-- `source_dataset_id` is deliberately NOT added: it is the provider's own identifier for the row
-- (06 §11 Q2's provenance mark is `source_dataset`; the *id* is an internal join key with no
-- product surface — same class as `name_key`). The other three are added because the product owner
-- approved surfacing attribution (`source_dataset`), a resolution-quality signal (`resolution_score`
-- — diagnostic per 0010's own column comment, but the Spot slice wants to render it, not act on it)
-- and a freshness hook (`last_verified_at`) on the place card. If a future surface needs
-- `source_dataset_id` too, grant it explicitly in a sibling migration, by name, the same way.
grant select (source_dataset, resolution_score, last_verified_at)
  on public.places to authenticated;

-- 2. PROMOTE THE EXTRACTION "EVIDENCE" TO A USER-FACING, PER-SAVE "REASON".
--
-- Why a new column on `saved_places` rather than a link to `extractions.candidates`:
-- `candidates` is unstructured jsonb (09 §5.2's z.string().max(240) `evidence` field lives inside an
-- array element, not a row), so there is no candidate *row* for `saved_places` to reference — only a
-- position inside a jsonb array inside one extraction among possibly several for the source. Adding
-- a foreign key would mean normalising candidates into their own table first, which is real schema
-- work this vertical slice does not need to do to make the Spot card render a reason. A denormalised
-- copy, taken once at save time, is the cleaner fit here: it is exactly the "the caption fragment"
-- 09 §5.2 already computes per candidate, just relocated from a debug-only field to a column the
-- product decided is worth showing, and it costs the client no join — the same request that reads
-- `note` reads this.
--
-- Same 240-char cap as 09 §5.2's `evidence` field, so a value that was valid there is valid here
-- without truncation. Nullable: a manually-added place (`origin = 'manual'`) has no candidate to
-- have derived a reason from, and 08 §3.6's provenance invariant only requires a *source*, not a
-- reason, for `origin = 'import'` either — a source whose extraction produced zero usable evidence
-- text still names a place worth saving.
alter table public.saved_places
  add column extracted_reason text
    check (extracted_reason is null or length(extracted_reason) <= 240);

comment on column public.saved_places.extracted_reason is
  'Caption-derived reason this place was saved, copied once from the confirmed extraction candidate''s evidence field (09 §5.2) at save-creation time. System-derived, never user-writable: no column-level INSERT or UPDATE grant exists or is ever added for it, matching origin/place_id (06/08). Decoupled from the user''s own `note` on purpose — a caption reason and a personal note answer different questions and neither should overwrite the other.';

-- `saved_places` carried a table-level `grant insert ... to authenticated` (0006) with no per-column
-- narrowing, which means adding this column would have made it client-writable at insert time too —
-- a user could forge their own "reason" on save. Close that off by replacing the table-wide INSERT
-- with the same closed-column-list shape 0006 already uses for UPDATE, naming every column a client
-- insert legitimately needs and leaving `extracted_reason` out, the same way `user_id`/`place_id` are
-- already left out of UPDATE. `extracted_reason` is populated only by whatever writes `saved_places`
-- under elevated privilege (service_role, or a future SECURITY DEFINER save path) — never by the
-- client's own INSERT.
revoke insert on public.saved_places from authenticated;
grant insert (user_id, place_id, display_name, category_override, note, visit_state,
              visited_at, origin)
  on public.saved_places to authenticated;
