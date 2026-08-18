# Security & Privacy — INTERIM

> **Status: INTERIM, deliberately incomplete.** The owner has deferred the full security
> investigation. This file contains only the *minimum unblocking review* — the one question where a
> wrong answer would have forced a schema rewrite — the D8 auth ruling (§2.5), plus the list of what
> is owed.
>
> **Course requirement M9 is NOT satisfied by this file.** M9 is a graded deliverable and remains
> outstanding. See §3 for what must still be produced and §4 for what is already true by design.

---

## 1. Ruling: the membership gate on the shared tables — **HOLDS. No schema change required.**

The schema in [`08-place-identity.md`](08-place-identity.md) puts `places`, `place_provider_refs`,
`sources` and `extractions` in **global** tables shared across users, protected by membership-gated
SELECT policies. The whole shared-table design rests on those policies being unbypassable. Reviewed
against PostgREST's actual request shapes:

| Attack shape | Result | Why |
|---|---|---|
| `saved_places?select=*,places(*)` (embedded select) | **Safe** | PostgREST embeds compile to joins/subqueries in the same request under the same role. RLS applies to every relation named, and Postgres ANDs the policy predicate into each. An embed cannot widen visibility. |
| `places!inner(*)`, embedded filters, embedded ordering | **Safe** | Same mechanism. `!inner` changes join semantics, not row visibility. |
| `or=(...)`, `not.is`, arbitrary filter trees | **Safe** | User filters are ANDed with the policy predicate; a filter can only narrow a result set, never widen it. |
| `HEAD` + `Prefer: count=exact` on a global table | **Safe** | The count is computed over policy-visible rows, so it returns the caller's own slice, not the table cardinality. |
| RPC returning a global row | **Safe *as currently designed*, and this is the fragile one** | `resolve_place()` and `merge_places()` are `SECURITY DEFINER` — which *does* bypass RLS — but are granted to `service_role` only. PostgREST calling with an anon key + user JWT is refused at the privilege layer before the function body runs. |
| Guessing a `place_id` uuid to reach another user's row | **Not exploitable** | 128-bit random uuids, and a user can only ever learn a uuid through their own saves. |

**One real property found, and it is acceptable.** The gate is *self-granting*:
`places_select_if_saved` grants read access to any user holding a `saved_places` row pointing at that
place — so a user who somehow obtained a place uuid could grant themselves read access by saving it.
The impact is nil: `places` holds non-personal POI data (name, coordinates, category) derived from a
public open-licensed dataset, and it is exactly the data the product would hand them anyway if they
searched for that venue. Nothing user-attributable is reachable this way.

**Critically, that same path is closed for `sources`** — the table holding cached third-party caption
text. `sps_insert_own` requires the caller to already own an `imports` row for that `source_id`, so a
user cannot attach themselves to an arbitrary cached source. They would have to import that TikTok
themselves, which they could have done regardless.

### Two invariants this ruling depends on
Both must survive implementation, and both belong in code review:

1. **Never `GRANT EXECUTE` a `SECURITY DEFINER` function returning global rows to `authenticated`.**
   This is the only identified way to bypass the gate. Today `resolve_place`/`merge_places` are
   service-role only; that grant list is load-bearing, not incidental.
2. **Keep the import-ownership predicate in `sps_insert_own`.** It reads like a redundant integrity
   check and is in fact the only thing preventing self-granted access to cached caption text.

## 2. Ruling: transcription provider — **DEFERRED, and it blocks nothing**

The owner approved pursuing audio transcription and permitted third-party providers "if security
clears it." That clearance is deferred. The unblocking decision, which requires no security work:

**V1 designs the transcript stage as a `ContentExtractor` implementation behind a feature flag,
defaulted OFF, and ships with it off unless and until it is cleared.** Per
[`07-import-execution-model.md`](07-import-execution-model.md) the seam already exists and adding an
implementation changes no other signature, so this is a switch, not an architectural fork. No
third-party integration is built and no credential acquired before the ruling exists.

Consequence to state honestly in the spec and the presentation: with the flag off, V1 coverage is
caption + cover-image only, and the ~27% caption-naming finding stands as the measured limitation.

## 2.5. Ruling: D8 — authentication methods — **DECIDED: email + password only for V1**

> Numbered 2.5 deliberately: §3 and §4 are referenced by `03-university-requirements.md` and
> `implementation-plan.md`, so they keep their numbers.

Charter §8 D8, flagged ⚠ in §3 below as cheaper to answer before the code it governs exists. Judged
primarily on **live-demo reliability**, which is the criterion that actually differs between the options
at this scale — all three are secure enough for a single-role consumer product under Supabase Auth.

| Option | Demo-day failure mode | Ruling |
|---|---|---|
| **Email + password** | None that depends on anything outside the app. Sign-up and sign-in are one screen and one round trip | **ADOPTED** |
| Magic link / OTP email | Requires an inbox round trip on venue wifi, with deliverability, spam-folder and latency risk in front of an examiner — and a second device or a webmail login on screen | Rejected for V1 |
| OAuth (Google / GitHub) | Reliable in practice, but adds a third-party console, a client secret, redirect-URI configuration per environment (preview URLs are not stable), and a consent screen mid-demo | Deferred |

**What V1 ships:** Supabase Auth email + password, with the provider's own password rules, plus a
pre-seeded demo account holding a populated map so the map and list can be shown without importing
first. Email confirmation is left **off** in development and **on** in production; the demo account is
confirmed at seed time so no inbox is ever needed on stage.

**Consequences that are now fixed:** one role — the authenticated owner — exactly as
`03-university-requirements.md` gap 1 requires us to state; the anonymous surface stays marketing +
auth only; nothing in the schema or RLS design changes, because RLS keys on `auth.uid()` regardless of
how the session was obtained.

**Re-entry for OAuth:** post-V1, or earlier if password sign-up measurably blocks onboarding — it is
additive under Supabase Auth and touches no policy.

## 3. Owed — the deferred work

Nothing below has been done. Re-engage the security agent before submission; the natural slot is the
testing/security milestone, but items marked ⚠ are cheaper to answer *before* the code they govern
exists.

| # | Owed item | Source |
|---|---|---|
| 1 | The full M9 document: authentication, authorisation, logged-in-only actions, cross-user prevention, input validation, API protection, secret storage, remaining risks | course M9 |
| 2 | ~~⚠ D8: which Supabase Auth methods to offer~~ — **CLOSED 2026-08-18, see §2.5** | Charter §8 |
| 3 | ⚠ SSRF design for user-supplied URLs: host allow-list, redirect hop limit and re-validation, private-range blocking, timeouts, response size caps | `04` §8 |
| 4 | The remaining 7 questions in `04-tiktok-feasibility.md` §8 | social-integration |
| 5 | ~~The 7 licensing/privacy questions in `06-map-and-places-decision.md` §11~~ — **SPLIT 2026-08-18, no longer one item.** Q1 (Apache-2.0 NOTICE sufficiency) **ANSWERED**, repo `NOTICE` shipped, `LICENSES/Apache-2.0.txt` + `/attributions` owed by MS5/MS10. Q2 (ODbL share-alike) **NARROWED** — no MS5 row is ODbL-derived, so it re-opens on the first PR adding an OSM alias or a Nominatim write path, not before MS5. Q3–Q7 remain open and are items 6a–10 in spirit; none can change an Overture-only schema. **Security-Privacy rules, maps-geospatial evidences and implements** — the earlier ownership split between this table and `implementation-plan.md` §4 is why none of them was answered | `06` §11 |
| 6 | Caption-retention posture: TTL, copyright and personal-data stance on storing creator captions and handles | `07` |
| 7 | Whether cached `sources` rows must be GC'd after user deletion | `08` §10 |
| 8 | Whether `places.created_at` predating a save is an acceptable inference channel | `08` §10 |
| 9 | Whether the user-writable `imports.candidates` grant should be revoked | `08` §10 |
| 10 | Public tile-key posture: URL restriction, and what happens if it is scraped | `06` §11 |
| 11 | Concrete per-user rate limits and the monthly cost ceiling | Charter §8 D11 |
| 12 | The pre-submission security checklist for QA to execute | course M9 |

## 4. Already true by design (not deferred — just not yet written up)

Settled in other documents; the M9 document later only has to *collect* these:

- RLS enabled and **forced** on every table; a missing policy is a deny. `anon` holds no grant on any
  table and is named by no policy — the anonymous surface is marketing + auth only.
- `save_place()` is `SECURITY INVOKER`, so the product's most important write stays governed by RLS.
- Column-level `GRANT UPDATE` on `saved_places` excludes `user_id`, `place_id` and `origin`.
- Users hold no INSERT/UPDATE/DELETE grant on any global table; all global writes are server-side.
- The mechanical test for a misplaced service-role query: **a service-role query never filters by
  `user_id`.** Grep-able in review.
- Zod validation at three boundaries, including LLM output and `jsonb` reads.
- Extraction runs with no tools and no side effects, so a hostile caption can at worst produce output
  that fails schema validation.
- The user's live position is never persisted server-side.
- Secrets are server-only; the browser sees only the Supabase anon key and the public tile key.
