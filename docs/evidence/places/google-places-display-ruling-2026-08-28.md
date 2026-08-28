# Google Places on a MapLibre map — the display ruling

> Task `TOS-DISPLAY-1`, `security-privacy`, 2026-08-28. Answers the question left open by
> [`../deploy/production-resolver-gate-2026-08-28.md`](../deploy/production-resolver-gate-2026-08-28.md)
> and finishes the recommendation `TOS-GATE-1` was stopped before delivering
> ([`google-places-persistence-tos-2026-08-28.md`](google-places-persistence-tos-2026-08-28.md)).
>
> **This is the project's compliance position, recorded with its reasoning and its sources. It is
> not legal advice and its author is not a lawyer.** Where the answer is a judgement rather than a
> text, it is labelled AMBIGUOUS and the choice is framed for the owner rather than decided.
>
> **No Google Places API quota was spent.** Nothing here made a live provider call. Every quotation
> was re-fetched independently with `curl` and is reproduced in [`raw/`](raw/); every runtime claim
> was proved by attack against the local Supabase container inside a rolled-back transaction
> ([`../../../tests/manual/google-retention-probe.manual.sql`](../../../tests/manual/google-retention-probe.manual.sql)).

---

## 0. The answer in four lines

1. **No.** Google Places content may not be displayed to an end user anywhere in this application
   while the renderer is MapLibre. Not the coordinates, not the name, not the address, not the
   category. This is **not** an ambiguous question — confidence HIGH, and §1 says why.
2. **`place_id` is the only field that survives**, and it survives *storage*, not display.
3. **Option (a) is rejected** — the gate is not over-cautious, it is under-cautious.
   **Option (c) is the recommendation.** Option (b) is legitimate but is a purchase, not a fix.
4. The 30-day retention finding is **confirmed in mechanism and refuted in urgency**: it is a
   deadline of **2026-09-27**, not a live breach. §3 sizes it exactly.

---

## 1. Q1 — May Google Places data be displayed on a MapLibre + Protomaps map?

### 1.1 The three instruments, and the definition that closes the per-field escape

**VERIFIED.** Service Specific Terms §14.2 (<https://cloud.google.com/maps-platform/terms/maps-service-terms>,
last modified 2026-06-10; re-fetched independently, [`raw/google-sst-14-15-independent-verify-2026-08-28.txt`](raw/google-sst-14-15-independent-verify-2026-08-28.txt)):

> **14.2 No use with a non-Google map.** Customer must not use Google Maps Content from the Places
> API in conjunction with a non-Google map.

**VERIFIED.** Maps Platform Terms of Service §3.2.3(e) (<https://cloud.google.com/maps-platform/terms>,
last modified **2026-08-26** — two days old, and diffed against the predecessor's capture: §3.2.2–3.2.3
are character-identical, nothing moved):

> **(e) No Use With Non-Google Maps.** … Customer will not use the Google Maps Core Services **with
> or near** a non-Google Map in a Customer Application. For example, Customer will not (i) **display
> or use Places content on a non-Google Map** …

**VERIFIED.** Places API policies (<https://developers.google.com/maps/documentation/places/web-service/policies>):

> Places API results displayed on a map must be shown on a Google Map …

The per-field hope dies on the definition, which is the piece the earlier work did not quote.
**VERIFIED**, ToS Definitions:

> **"Google Maps Content"** means any content provided through the Services (whether created by
> Google or its third-party licensors), including map and terrain data, imagery, traffic data, and
> **places data (including business listings)**.

So `displayName`, `formattedAddress`, `location`, `primaryType` are each, individually, Google Maps
Content. There is no field of a Text Search response that is *not* Google Maps Content. The
prohibition in §14.2 attaches to the class, not to the coordinate.

### 1.2 Why §14.1 does not rescue any field

§14.1 says *"Customer may use Google Maps Content from the Places API in Customer Applications
without a corresponding Google Map"*, and the Places policies page says *"When displaying Places API
data without a Google Map, you must include the Google logo …"*. Read alone, that looks like a
per-surface split: Places data is fine on a screen with no map.

It is a per-surface split, and **it does not survive contact with this product**, for two reasons.

1. §3.2.3(e)'s trigger is *"with **or near** a non-Google Map **in a Customer Application**"*, and a
   "Customer Application" is defined as *"any web page or application (including all source code and
   features)"*. The unit is the application, not the viewport. Example (ii) — *"display Street View
   imagery and non-Google Maps on the same screen"* — shows Google drafting a same-screen test when
   it wants one; (e)'s own headline clause is broader than that on purpose.
2. Even on the narrowest same-screen reading, **this product has no map-free surface that shows a
   place.** `/map` is the map. The place sheet and the desktop panel render over it
   (`src/components/sheet/place-sheet.tsx`, `place-desktop-panel.tsx`). The import review screen is
   the one arguable surface, and it is one navigation from the map inside the same application, and
   its whole purpose is to feed the map.

There is exactly one Google-authored carve-out, and it is not a way in. **VERIFIED**, SST §15.1:

> Customer may use **Places UI Kit** in Customer Applications with or without any map, including a
> non-Google Map. This clause will prevail over the No Use with Non-Google Maps clause of the
> Agreement.

Places UI Kit is Google-rendered, Google-branded widgets; §15.2 keeps the 30-day coordinate cap. It
is not a resolver and gives no permanence. Recorded so nobody rediscovers it as a loophole.

### 1.3 Which fields, displayed where, for how long

The useful shape of the answer — and the honest observation is that in **this** application the
"where" column collapses the table.

| Field | May we **store** it? | Display on any surface of *this* app | Display in a hypothetical map-free app |
|---|---|---|---|
| `id` / `place_id` | **Yes, indefinitely.** Gen. Service Terms §3; place-id docs, "exempt from the caching restrictions stated in Section 3.2.3(b)". Free 12-month refresh *recommended*, not required | Never rendered anyway. May be **held**; must not drive a pin, a marker, a Place Details call rendered beside the map, or an embed URL | Yes |
| `location.latitude` / `.longitude` | **No** — ≤30 consecutive calendar days, then "must delete" (§14.3) | **No** | A coordinate with no map is not a display; storage cap still applies |
| `displayName` | **No.** Narrow reading: no express permission at all. Broad reading: ≤30 days | **No** | Yes, with the Google logo (Places policies) |
| `formattedAddress` / `addressComponents` | **No.** Same split. Contrast §6.3.2, which grants exactly this indefinitely — for the *Geocoding* API, and only per-End-User-isolated | **No** | Yes, with the Google logo |
| `primaryType` / `types` | **No.** Same split | **No** | Yes, with the Google logo |
| Anything **derived** — our seven-value `category` mapped from `primaryType`, a `name_key`, a country from point-in-polygon | **No.** ToS §3.2.3(c), and (c)(iv) names point-in-polygon over Places lat/lng verbatim | **No** | No |

The narrow-vs-broad split on name/address/category (is it *never* cacheable under §3.2.3(a)(iii),
or cacheable for 30 days under §14.3 read as a whole-response window?) is genuinely **AMBIGUOUS** and
I am not resolving it, because **it changes no decision in this document**: both readings forbid
permanent storage, and §14.2 forbids the display regardless.

### 1.4 Confidence, stated honestly

- **Display on a MapLibre map: HIGH confidence, prohibited.** Three instruments agree and one of
  them is a worked example of our exact configuration. I would not defend the opposite reading.
- **Storage duration for name/address/category: AMBIGUOUS** (30 days vs never). Immaterial here.
- **Whether `local` is inside "Customer Application": AMBIGUOUS.** See §4, F-A.
- **Which terms document governs: ASSUMED** non-EEA, on the preamble's own words. If the Cloud
  billing address is in the EEA, the EEA variant governs and this must be re-run. Owner-checkable,
  not agent-checkable. Carried forward from `TOS-GATE-1` §1.5 unchanged.

### 1.5 One correction to the predecessor's reasoning

`TOS-GATE-1` §2.3 leaned on *"Google's own §3.2.4 (Benchmarking) contemplates customers testing the
Services and publishing the results"* to defend a local measurement run. **That read is wrong and
should not be relied on.** §3.2.4 is a *disclosure obligation*, not an exemption: it says that **if**
you publish comparative results, the disclosure "must include all information necessary for Google
or a third party to replicate the Test". It grants no permission to call the Services in a
configuration §3.2.3 forbids.

Two consequences, both small:

- The local-development defence has to stand on "localhost is arguably not a Customer Application",
  which is thinner than it looked. It is still the *most* defensible of the four stages, and it is
  the only one I would keep. It remains AMBIGUOUS.
- **New, conditional obligation.** `tiktok-recognition.google.md` and
  `google-places-and-transcription-probe-2026-08-28.md` are comparative evaluations of the Services
  (Google 15/15 vs Overture 12/15). The repo is **PRIVATE** today (`gh repo view` — verified), so
  §3.2.4 is not triggered. It triggers the moment the repo is made public or those numbers go into a
  publicly disclosed report, and the obligation is then to publish enough to let Google replicate the
  test. Cheap to satisfy — the harness and the corpus are already in the repo. **Severity: note now,
  acts only on a future publication decision.**

---

## 2. Q2 — Ruling on the three options

### (a) The pairing is permitted; the gate is over-cautious — **REJECTED**

*What it costs:* nothing to adopt, everything to be wrong about.
*What it risks:* §1 has three instruments against it and none for it. The failure mode is not a
warning letter; it is Google's §3.2.3 remedies against an account the owner also uses for a Gemini
key, plus a compliance defect written into an assessed university submission.
*What would have to be true:* that "in conjunction with" and "with or near … in a Customer
Application" mean "on the same canvas", **and** that example (e)(i) — "display or use Places content
on a non-Google Map" — does not describe pinning a Google coordinate on MapLibre. I cannot construct
that argument from the text.

**And the finding is the opposite of over-caution: the gate is under-cautious.** `resolverProviderFor`
trusts `preview` and `staging` on the premise, stated in its own header, that *"no end user is being
served a Google-content-on-MapLibre pairing"*. §3.2.3(e) is scoped to the **application**, not to who
was served. A preview deployment on a Vercel URL, containing a MapLibre map, that has made Places API
calls, is inside the prohibition. See §4 F-A.

### (b) Not permitted; move the renderer to Google Maps first — **LEGITIMATE, NOT RECOMMENDED NOW**

*What it costs:* a billing account; a Text Search quota raise above the measured 100/day; the
Charter §6 premise that the map style is the brand; a terms-of-service page and a privacy policy
that incorporate Google's (ToS §3.2.2(a)(i) — the app has neither); Google Maps logo attribution
(Places policies); and the country-flag world view, which is point-in-polygon over stored
coordinates and therefore ToS §3.2.3(c)(iv) verbatim over Google ones.
*What it risks:* it **still does not deliver permanence.** §14.3's 30-day cap is unconditional and
survives the renderer swap. All-Google buys a permanent `place_id` plus a monthly Place Details
refresh for every stored coordinate, forever — and that job's *silent failure is the breach*. A
compliance control whose broken state is indistinguishable from its working state is the worst shape
of control there is.
*What would have to be true:* the owner accepts every line above **as a package**, and accepts a
recurring operational obligation with no end date, on a university project.
*What it buys:* the best measured accuracy available — 15/15 against Overture's 12/15 on the
13-TikTok corpus. Three coverage misses on thirteen posts.

### (c) Production knowingly runs the honest `llm_guess` path — **RECOMMENDED**

*What it costs:* ~100 rows whose coordinates are the model's own, measured 65–470 m out and drifting
a median 327 m between two runs of the same caption. With production's `poi_index` empty (production
is at `0009`; `0010` creates the table), the Overture branch returns `no_match` on **100%** of the
batch, so this is not "mostly resolved with some fallback" — it is the fallback for all of it.
*What it risks:* **product risk, not legal risk.** The rows are honest — `provider: 'llm_guess'`,
`source_dataset: 'llm-guess'`, `resolutionScore: null`, `datasetConfidence: 0` — and §5 confirms no
Google value can reach them. The risk is that ~100 approximate pins are what the owner shows an
assessor, and that the upgrade path has to actually work later.
*What would have to be true:* three conditions, and all three are already true or nearly so.

1. The rows must be **upgradeable**, not merely honest. That is the work in flight on
   `src/domain/import/**`; §5 reviewed it and found no terms or privacy problem it creates.
2. The coordinates must be **marked approximate in the UI**, not shown as if resolved. Owner:
   `design-system-frontend` / `ux-interaction`, not me.
3. **The gate in `place-resolver-factory.ts` stays.** It is the only reason production holds zero
   Google content today (§3), and under this option it is load-bearing rather than provisional.

### Recommendation

**(c), now, and the gate stays.** (b) remains available and is the owner's to buy; it is not smaller
than it looks and it does not solve permanence.

**One thing I will not re-recommend.** `TOS-GATE-1` §3's answer was "Option 5 — ingest an Overture
extract per city in the curated batch", and on the evidence that is still the cheapest thing that
gives both worldwide-enough coverage *and* permanent rows. But the owner's 2026-08-28 ruling
**dropped Overture entirely**. A superseded recommendation restated as if it were live is exactly the
kind of stale advice that gets acted on by mistake, so: Overture-per-city is the accuracy upgrade
that (c) has available **if and only if the owner un-drops Overture**. That is his ruling to revisit,
not mine to route around, and it is the one place where re-opening a closed decision would materially
improve the ~100-TikTok batch.

### Veto

**I veto removing or weakening the production gate in `src/integrations/places/place-resolver-factory.ts`
on the strength of a re-reading of the terms.** It may be removed when the renderer is a Google map,
or on a written owner decision to accept the exposure — not on an engineering argument that §14.2 does
not mean what it says. Per my brief, this veto is not overridable by `product-lead` or
`nextjs-architect`.

---

## 3. Q3 — The 30-day retention finding, re-measured

**Confirmed in mechanism. Refuted in urgency.** Both halves matter.

### 3.1 The mechanism — CONFIRMED by attack

`tests/manual/google-retention-probe.manual.sql`, local container, everything inside a transaction
that was rolled back:

| Probe | Result |
|---|---|
| `resolve_place(p_provider => 'google', p_source_dataset => 'google-places', …)` | **accepted** — row written with name, address, lat, lng |
| back-date that row's `provider_fetched_at` and `created_at` by 400 days | **accepted**, no CHECK, no trigger, no rule objected |
| CHECK constraints on `places` mentioning `source_dataset` | **0** |
| expiry-shaped columns on `places` or `extractions` | **0** |
| `pg_cron` installed | **no** (extensions: `plpgsql`, `uuid-ossp`, `pgcrypto`, `pg_stat_statements`, `supabase_vault`, `pg_trgm`) |

So a Google coordinate written today is still there in a year, and nothing in the database or the
repo would notice. That is §14.3 breached by construction.

### 3.2 The urgency — REFUTED, and this changes the severity

Measured on the local database, 2026-08-28:

| Where | Google content held | Oldest |
|---|---|---|
| `places` | **1 row** (`source_dataset = 'google-places'`; name, address, locality, `IL`, lat/lng, `provider_category`; `provider_payload` is null) | **8 hours** |
| `extractions.candidates` | **4 shortlist entries** across 3 extraction rows, each carrying name/address/locality/lat/lng/`providerPlaceId`/`providerCategory` | **same day** |
| `place_provider_refs` | 1 `google` alias — a `place_id`, permitted indefinitely, **not** a finding | same day |
| `place_lookups` | **0 rows** | — |

`TOS-GATE-1` §0 said *"We are accumulating Google content past 30 days today."* We are accumulating
Google content with no expiry — true and important — but **nothing has passed 30 days, because
Google resolution started on 2026-08-28.** The breach date is **2026-09-27**.

That is not a downgrade of the finding, it is a correction to its shape: this is a **dated deadline
with a month of runway**, not a live incident, so the fix can be done properly rather than urgently,
and it is explicitly **not a blocker on the ~100-TikTok batch** (under option (c) production writes
no Google content at all).

### 3.3 Which environments — and the sentence that matters most here

- **local: VERIFIED**, numbers above.
- **preview / staging: UNAVAILABLE.** `agent-guardrails.md` §5 forbids me opening a connection to
  either, and I did not. Reasoned, not measured: they run the same migrations and the same
  `resolverProviderFor`, which returns `google` for `NEXT_PUBLIC_STAGE=preview|staging` whenever a
  key is present, so any import run against them since 2026-08-28 wrote the same shape. Volume
  unknown; almost certainly single digits.
- **production: zero, and structurally incapable of acquiring any.** `resolverProviderFor` returns
  `overture` for production before it ever reads the key. **The gate that §2 option (a) proposes to
  delete is the only reason production is clean.** That is the strongest single argument against (a),
  and it is a measurement rather than an interpretation.

### 3.4 A correction in the predecessor's favour, on the cache

`TOS-GATE-1` said the 30-day rule *"is enforced on the cache and not on the record"* and that
`place_lookup_put` merely refuses an over-long TTL. It does more than that: it also **deletes**
expired rows, up to 200 per call, on every write. Verified —

| Probe | Result |
|---|---|
| insert an expired `google` row, then `place_lookup_get` it | returns `null`; **the row is still present** |
| then any subsequent `place_lookup_put` | **expired rows: 0** |

So the cache does discharge §14.3's "must delete", and the earlier document undersold it. The
residual is that the prune is **write-triggered only**: if Google resolution stops — quota gone,
provider switched, batch finished — the last ≤200 expired rows sit there with nothing to trigger the
sweep. `place_lookups` is empty today, so there is no live exposure. **Acceptable at university
scale, documented.** If it is ever worth closing, the minimum is one `delete` in `place_lookup_get`.

### 3.5 The smallest correct fix

Four items, smallest first. **I have written no migration and changed no `src/**` file.**

**F-A — drop `preview` and `staging` from `NON_PRODUCTION_STAGES`. One line, no migration.**
*Must fix before any preview or staging deploy that resolves with Google.*
This is the predecessor's F1, and it is *also* the retention fix for two of the three environments:
a resolver that is never Google writes no Google rows, so there is nothing to expire. Leaves `local`
and `test`. The header comment's premise must change with it, from *"no end user is being served"* to
*"this application contains a non-Google map, so the prohibition attaches to the application"*.
Owner: `nextjs-architect`, via the orchestrator.

**F-B — one CHECK constraint on `places`. Migration, specified here, not written.**
*Must fix before 2026-09-27; not a blocker on the batch.*

```sql
alter table public.places
  add constraint places_no_google_content
  check (source_dataset is null or source_dataset <> 'google-places');
```

Why this and not a TTL sweep: it makes the record table **structurally incapable** of holding Google
content, so there is no job, no schedule, and no silent-failure mode. It touches no RLS, no grant and
no policy, so it is a plain constraint review rather than a cross-user-read review. It will **fail to
apply** while the one existing local `google-places` row is present — that is correct and intended:
applying it forces the §14.3 deletion to actually happen. It is a one-line forward migration to drop
if the owner later chooses option (b). Owner: `supabase-database`, via the orchestrator.

**F-C — delete the Google content that exists. Local only. I did not run it.**
Guardrail 8 forbids me running destructive SQL, so this is a specification for the orchestrator:
the 1 `places` row with `source_dataset = 'google-places'`, and the 4 Google shortlist entries in the
3 `extractions` rows. The matching `place_provider_refs` alias may stay — a `place_id` is exempt and
permitted indefinitely, and keeping it is what makes those rows upgradeable later. Deadline
2026-09-27; there is no breach before that date.

**F-D — `place_lookups` prune is write-triggered only. Acceptable, documented.** §3.4.

`extractions.candidates` needs no separate fix if F-A lands, because with `google` off in every
deployed stage nothing writes a Google shortlist there. Note the trap in the alternative: narrowing
`StoredResolvedPlaceSchema`'s enum to exclude `'google'` would *not* be a fix — the file's own header
records that exactly that omission once produced a review screen showing a Google-resolved place while
the row written was `llm-guess` at the model's coordinate, silently. Resolve with Google and discard
is a "confidently wrong" design. **Do not call Google in a stage that persists; do not call it and
throw the answer away.**

---

## 4. Q4 — Review of the in-flight `llm_guess` fallback (read-only; nothing edited)

Reviewed as instructed for terms and privacy problems **of its own**. The owner's ruling that
resolution must never dead-end is not reopened here.

### 4.1 Can a Google-derived value reach a row labelled `llm_guess`? **No.**

`derivePlaceSave` (`src/domain/import/candidate-place.ts`) enters the `llm_guess` branch only when
`resolved === null`, and every field on that branch comes from the `PlaceCandidate` — i.e. from the
extraction, not from any resolver: `identifiedName ?? rawName`, `categoryHint`, `addressHint`,
`cityHint`, `countryHint`, `coordinates`. `providerCategory` is hard-`null`, `regionId` `null`,
`datasetConfidence` `0`, `resolutionScore` `null`. `llmGuessProviderPlaceId` keys on
`rawName | cityHint | countryHint` only. `resolveCandidates` never mutates a candidate — it pushes a
separate `StoredResolution` per index and leaves the candidate untouched. **Clean.**

**The real leak on this path runs the other way, and it has already happened once.**
`StoredResolvedPlaceSchema` is the parse boundary for `extractions.candidates`, and while `'google'`
was missing from its enums, a Google-resolved place was **shown on the review screen** while the row
written was `llm-guess` at the model's coordinate, with no error anywhere (recorded in that file's
own header, verified 2026-08-28 against a real TikTok). Two things follow: it is a "confidently
wrong" failure of the kind `working-agreement.md` §4 forbids, and — relevant to §1 — it means Google
Places content was **displayed to a user in a MapLibre application**, which is the display breach
itself, in local. Both stop when F-A lands. A regression test pinning "what the review screen showed
is what the row records" belongs to `qa-reliability`.

### 4.2 Does the failure classification leak vendor detail to a client? **No.**

- `ProviderLookupFailure` composes its message from three closed values — provider slug,
  classification, `HTTP <status>` or `no response`. No vendor prose, no body, no URL, no key. The
  vendor's own error stays as its `cause`.
- `DomainError.toView` (`src/domain/errors.ts:97–101`) serialises `{ code, retryable, importId? }`
  and nothing else. No message, no cause. **Confirmed by reading it, as the brief said.**
- The **stored** record is `{ kind: 'failed', reason: '<kind>' }` — no provider, no status, no
  message. `provider` exists on the exception and deliberately does not travel into the row.

Two things to be deliberate about rather than fix:

1. The probe route's response type is `resolutions: readonly (StoredResolution | null)[]`, so
   `reason: 'quota_exhausted'` **does** reach the browser. It names no vendor and carries no status.
   **Acceptable, documented.** It tells a user our quota is exhausted — an operational fact, not a
   secret — and it is a weak oracle letting a client distinguish "out of quota" from "key revoked"
   from "provider down". Negligible at university scale, and zero while the resolver is gated off
   production. If it is ever worth closing, the minimum is to collapse `auth` and `bad_request` — the
   two that describe *our* misconfiguration — into one client-facing value and keep all six
   server-side.
2. The same route returns the **full resolved shortlist** to the browser. Where the resolver is
   Google, that is Google name/address/coordinates/`place_id`/category delivered to a page rendering
   a MapLibre map — the §1 display breach, in the request/response path, in every stage where Google
   is the default. **Not caused by the fallback work**; the fallback work runs through it. Routed to
   F-A, which closes it.

### 4.3 Two smaller notes

- **`place-sheet.tsx:726`** builds the outbound Google Maps deep link from `place.name`,
  `place.detail.addressLine`, `place.locality` — which, on a Google-resolved row, are Google Places
  content. A plain hyperlink out is the human-in-the-loop pattern `06` §3.4 already blessed and makes
  no API call, but building it *from Places content* in an app containing a non-Google map is
  §3.2.3(e)(iii)-adjacent. **AMBIGUOUS, LOW**, and it disappears entirely under option (c), because
  no `places` row is Google-derived. `googleMapsSearchUrl` on the import path is clean — it is built
  from the extraction's own hints, never from a resolver result.
- **`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is not in the browser bundle today** — grepped: it is
  referenced only in `place-resolver-factory.ts` (which is `server-only`), its unit test, and a
  manual harness. Next inlines a `NEXT_PUBLIC_` value only where client code references it, so there
  is no client reference to inline. **Acceptable, documented** — but it is one client component away
  from being compiled into the bundle, and the variable's own prefix invites exactly that. The
  factory's header already says so. The cheap tripwire, if wanted, is a CI grep asserting the name
  appears in no client-reachable module; owner `qa-reliability`. **No value of any variable appears
  anywhere in this document, and I did not read `.env.local`.**

---

## 5. What is the owner's decision, not an engineer's

1. **(b) or (c) for the ~100-TikTok batch.** §2 recommends (c) and the veto stands only against (a).
2. **Whether to un-drop Overture** for a per-city extract of the curated batch's cities — the one
   available upgrade from "~100 approximate rows" to "~100 permanent, licence-clean rows", and it
   reverses a ruling made the same day.
3. **Confirm the Cloud billing address is outside the EEA** (§1.4). Unchanged from `TOS-GATE-1`.
4. **Only if (b):** billing, the quota raise above 100/day, the permanent monthly refresh job, a
   terms-of-service and privacy page carrying ToS §3.2.2(a)(i)'s notices, Google Maps logo
   attribution, a Google basemap against Charter §6, and dropping the country-flag world view.
5. **Not a decision, a heads-up:** the repo is private, so ToS §3.2.4 is not triggered by the
   Google-vs-Overture comparison already in `docs/evidence/places/`. Making the repo public, or
   publishing those numbers, triggers a duty to disclose enough for Google to replicate the test.
