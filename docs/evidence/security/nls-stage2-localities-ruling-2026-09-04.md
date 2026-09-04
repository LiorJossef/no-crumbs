# Ruling — may the NLS request carry the user's own locality and country names?

**Task:** SEC-1 · **Lane:** `security-privacy` · **Date:** 2026-09-04
**Base commit:** `0977212cdaedf30eeca480e2aed1ef2d509b2294` on `no-crumbs-implementation`.
The tree at that commit holds several other lanes' uncommitted work (`src/app/api/imports/*`,
`src/components/sheet/*`, `src/app/globals.css`); none of those files is read as evidence here.
**Answers:** `docs/nls-plan.md` §5.5 and its §5.6 sign-off line.
**Written under:** `docs/agent-guardrails.md`. No `.env*` file was read, no secret value appears
below, no provider quota was spent, no file under `src/` or `tests/` was modified.

**Ruling: REFUSED for the shipped configuration, and unnecessary for the case it was asked for.**
Two independent grounds, either sufficient. Conditions for a future approval are §5.

---

## 1. What leaves the device today, exactly

Read at the base commit: `src/components/sheet/sentence-panel.tsx:480-497` (the only caller),
`src/app/api/search/interpret/route.ts`, `src/domain/search/intent.ts`,
`src/integrations/llm/query-intent.ts`.

**Browser → our server**, one POST per explicit submit:

| Field | Content | Cardinality |
|---|---|---|
| `query` | the sentence the user typed, ≤ 200 chars | free text |
| `vocabulary.categories` | subset of `PRIMARY_CATEGORIES` | 3 closed values |
| `vocabulary.tags` | subset of `SUB_TAG_KEYS` | 15 closed values |
| `vocabulary.visit` | subset of `been` / `not-been` | 2 closed values |
| `vocabulary.origins` | sent as `[]` by the only caller | 0 |

**Our server → Google** (`generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`):
the static system prompt, and the query fenced in a per-call delimiter. **The vocabulary is not
forwarded** — it never enters the prompt; it is a server-side clamp input only
(`route.ts:164` → `clampIntent`). Auth is `x-goog-api-key`, a **project-level** key shared by every
user. No user id, no session, no place row, no coordinate, no IP of the end user (the call is
server-to-server from Vercel).

So today Google receives an **unlinkable stream of typed sentences**. A sentence may itself contain
a city ("cafés in Tel Aviv"), but that is one city the user chose to type, on that request only,
and nothing in the payload ties two requests to one person.

## 2. What adding localities would disclose

The proposal puts the user's distinct `places.locality` values (and country names) into the prompt,
so the model can pick one. Measured shape from `nls-plan.md` §5.1: ~60 saved places over four
countries, with at least five stored spellings of Tel Aviv alone; call it 15–25 distinct
`(locality, country)` pairs.

**What an observer of the request learns that they do not learn now:**

1. **A standing location profile the user never typed.** Today: at most one city, and only if the
   user typed it. After: the complete set, on **every** search, including `pizza` and `שמרתי מטיקטוק`.
2. **Home, and travel.** The plurality locality of a saved-places library is where the person lives;
   the minority ones are where they travelled and roughly when relative to each other. At ~60 rows
   this is coarse, but it is real, and it is the inference `docs/security.md` R-11 already treats as
   a channel worth narrowing elsewhere in this product.
3. **Neighbourhood-level sensitivity in the launch area.** Israeli localities are not neutral labels;
   `בני ברק` or an East Jerusalem locality implies more about a person than a coffee habit. Under
   GDPR framing that is data from which a special category can be inferred, which is exactly the
   class the vendor's own terms tell us not to send (§3).
4. **The thing that changes the analysis most: it manufactures a pseudonymous user id.** A set of
   15–25 city names across four countries is a near-unique fingerprint. Two requests carrying the
   same set are the same person. Today the provider **cannot** link one user's searches to each
   other; after this change it can link them trivially, and can attach every typed sentence to that
   cluster. We would be creating an identifier at the provider that does not exist at the provider
   now — under a data-use regime (§3) that permits training on it and human reading of it.

Counts and coordinates are worse again (counts rank the localities and hand over the home-city
inference directly), but the *names alone* already carry 1–4. **Minimisation does not rescue this**:
see §4, the minimised variants buy nothing the code cannot already do locally.

## 3. Provider terms — VERIFIED, with one ASSUMED edge

The shipped intent model is `gemma-4-26b-a4b-it` (`query-intent.ts:DEFAULT_INTENT_MODEL`, the run-C
configuration accepted by `docs/evidence/extraction/nls-stage1-gate-2026-09-04.md`), served on the
Gemini API.

> **CORRECTION, same day, from the owner.** This paragraph originally read that extraction is a
> *different provider*, "whose production default is Anthropic (`place-extractor-factory.ts:36`)".
> That is the **code** default and it is not what production runs: asked directly, the owner said
> *"in prod we use the same gemini we use on local"*. So captions already go to the Gemini API in
> production, and the claim that "the caption precedent does not carry over" was wrong on its facts.
>
> **The ruling does not change, and the reason is worth stating rather than assuming.** It never
> rested on extraction using a different vendor; it rested on *what* would be sent. A caption is
> public content the user chose to import, one item at a time. A list of the user's own localities
> is a standing location profile attached to every request, and it is what turns an unlinkable
> stream of sentences into a near-unique fingerprint — the pseudonymous-user-id argument in §1,
> which is untouched by who else the project already talks to.
>
> What the correction *does* change is the free-tier terms finding: it now applies to the caption
> path too, which is a wider surface than this ruling was scoped to examine. That is not a
> conclusion, it is an open question, and it belongs to whoever next reviews the extraction path.

**VERIFIED (read 2026-09-04, no quota spent):**

- Gemma 4 is listed on the Gemini API pricing page as **free of charge, Free Tier; "Not available"
  on the Paid Tier**. <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini API Additional Terms (effective 2026-03-23, last updated 2026-04-28): for **Unpaid
  Services** — "*human reviewers may read, annotate, and process your API input and output*";
  submitted content is used "*to provide, improve, and develop Google products and services and
  machine learning technologies*"; and, verbatim, "*Do not submit sensitive, confidential, or
  personal information to the Unpaid Services*". Reviewed data is disconnected from the Google
  Account, API key and Cloud project before a reviewer sees it.
  <https://ai.google.dev/gemini-api/terms>
- For **Paid Services**, Google "*doesn't use your prompts … or responses to improve our products*";
  logging is billing-project-only, **default 55 days** (configurable 7/14/28/55), and sharing logs
  for model improvement is **opt-in**. <https://ai.google.dev/gemini-api/docs/logs-policy>
- Tier definition: "*unpaid quota in Gemini API are unpaid Services*", and Gemini API is a Paid
  Service "*only when accessing the API through a Cloud Project associated with an active billing
  account*". <https://ai.google.dev/gemini-api/terms>

**ASSUMED:** that a `gemma-4-*` call from a **billing-enabled** project is still an *Unpaid Service*.
The two clauses above conflict for exactly this case — Gemma has no paid tier to be billed on, so
the call is served from free-of-charge quota, while the tier definition keys on the project. Nobody
here has confirmed which reading Google applies, and the conservative reading is the one that binds.
Whether our project is billing-enabled is **UNAVAILABLE** to this lane by design (§1 of the
guardrails: no `.env*` read); it is a fact the orchestrator can state and I cannot.

**The three-year figure is NOT verified for this API.** "Human-reviewed chats retained up to three
years" is from the *Gemini Apps* privacy hub, a different product. The API terms state no retention
bound for unpaid human-reviewed data, which is worse than a long bound, not better.

**Finding.** Sending a user's city list to a free-tier endpoint is submitting personal information
to an Unpaid Service, contrary to the vendor's own written instruction, under terms that permit
training on it and human reading of it with no stated retention limit. That is ground one, and it is
compliance with a term we already operate under rather than a judgement call.

## 4. Ground two: the alias table already exists in this repo

This is the most useful finding here and it makes the ruling moot for the cases actually in scope.

`nls-plan.md` §5.1 asks for "*a small he↔en alias table*" and the shipped slice
(`src/domain/search/locality-match.ts`) says it is deliberately absent. **It is not absent from the
codebase — it is in `src/domain/places/region-hint.ts`, has been since the resolver was built, is
pure `domain/` code, and it already contains the exact failing case:**

```
London: at('ldn', 51.507, -0.128),
'Greater London': at('ldn', 51.507, -0.128),
לונדון: at('ldn', 51.507, -0.128),
```

`REGION_ALIASES` (exported, line 233) holds ~100 keys grouped by `regionId`: every Tel Aviv metro
town in Hebrew *and* English *and* the gershayim abbreviations (`ת״א`, `ר״ג`, `ראשל״צ`, each in both
the U+05F4 and the ASCII-quote spelling, because `normalise()` treats them as different strings),
Tokyo and its wards in kanji/Latin/Hebrew, and London plus fifteen neighbourhoods. Grouping those
keys by `regionId` yields precisely the *join* §5.1 specifies: query term → set of normalised keys,
never an edit to `places.locality`.

**So the provider round-trip is not needed for the language scope this product has**
(`p002-hebrew-english-is-the-language-scope`). Concretely:

| Case | Local answer available today |
|---|---|
| `לונדון` → stored `London` | **yes** — `region-hint.ts` line 209 |
| `טוקיו` → `Tokyo`, `ת״א`/`ר״ג` → the metro | **yes** — same table |
| `in Italy` / `באיטליה` → `IT` | **yes** — `toCountryCode()`, ICU over `['en','he']`, §5.1 step 1, covers 56 of 59 rows |
| same-script spelling variance | **yes** — already shipped (`locality-match.ts`, exact + token-prefix + cluster expansion) |
| `פראג` → `Prague`, `בודפשט` → `Budapest` | **no** — two rows of data away |

Two caveats a Build agent must respect if it reuses this. `RegionId` means "*an ingest region we
hold*" and is bound to `poi_regions`; adding `prg` to that table to serve search would be a lie in
the resolver's vocabulary. The right shape is a **join-only** table in `domain/search/`, deriving
its equivalence classes from `REGION_ALIASES` and adding its own entries, carrying **no coordinate**
(`region-hint.ts`'s header: those points may never reach a pin) and no `RegionId`. And it must keep
that file's measured Hebrew lessons — both quote characters, both spellings, ambiguous names such as
`Soho`/`Camden` deliberately absent.

**Cost comparison, stated so the trade is visible.** Local table: one pure file, deterministic,
covered by the unit suite, no prompt change, **no re-run of the §4.3 gate**, nothing leaves the
device. Provider: the disclosure in §2, a prompt change that invalidates the 97.1% / 88.6% run-C
measurement and requires all 35 golden queries to be re-run against live quota, and a **new class of
false filter** — the model picking the wrong one of the user's own cities is in-vocabulary, so the
clamp cannot catch it, and it hides rows with no way for the user to tell why. That is the failure
mode `nls-plan.md` §4.3 weights heaviest, on a model this repo has already measured as having a
genuine geographic-recall defect (`gemini.place-extractor.ts` header: longitudes wrong by 15–40°).

The provider round-trip buys one thing the table does not: **unbounded** city coverage, for a
library that today spans four countries and ~20 localities. That is convenience, not need.

## 5. If the owner still wants it later — the conditions

I would move to *approve with conditions* only when **all** of the following hold, and each is
checkable in a diff:

1. **Paid tier, confirmed.** `SEARCH_INTENT_MODEL` set to a model available on the paid tier
   (`gemini-3.5-flash-lite` is already wired), the project confirmed billing-enabled by the
   orchestrator, and logging set to the 7-day minimum with log-sharing off. Gemma is free-tier only
   and can therefore never satisfy this condition.
2. **Re-gate.** `nls-plan.md` §4.3's 90% no-false-filter bar re-measured on the new prompt **and**
   the new model — run B (flash-lite, `q1`) scored 80% and failed. The gate is not inherited.
3. **Local first, provider second.** The local join must run before the call and its answer must
   win. The provider may only be consulted for a term the local table cannot resolve, which by §4
   is a minority of queries — that alone cuts the disclosure from "every search" to "rare searches".
4. **Minimisation, though note it barely helps.** City names only: no counts, no coordinates, no
   country list (countries are already solved locally by `toCountryCode`, so sending them is pure
   disclosure for zero function). Cap the list, and derive it from distinct localities only.
5. **Consent, from the owner, in writing, in the plan.** Today the only data subject is the owner
   himself and production signup is closed. That is what makes an approval *possible* at all — and
   it is also why it must be **his** decision recorded in `nls-plan.md` §5.5 and not an agent's.
   It expires the moment a second account exists: this ruling must be re-taken before any real user
   signs up, and the code comment must say so.
6. **A visible statement.** If a user's saved cities are sent to a third party, the product says so
   where the feature is used. A privacy claim nobody can read is not a control.

## 6. Severity, and what the deadline does and does not change

- **Sending localities to the free-tier endpoint: must not ship.** Not "acceptable at university
  scale" — it is contrary to the provider's written terms, and the terms do not have a scale clause.
- **Not shipping Stage 2's remaining half: acceptable, documented.** With §4's table, the measured
  §5.6 exit criteria (all Tel Aviv spellings, `in Italy`/`באיטליה`, an unresolved city producing no
  filter) are reachable with **no provider change at all**.

The coursework framing changes one thing only: it makes an owner override *legitimate*, because he
is the sole data subject. It does not make the terms not apply, and it is not a reason to skip §5.2
— a search that silently hides the row you asked for is a worse demo than one that says it did not
understand the city.

## 7. What would change my mind

- Evidence that the project is billing-enabled **and** that Google treats a Gemma call from such a
  project as a Paid Service (an explicit statement in the terms or a documented Google answer). That
  removes ground one; ground two would still stand.
- A measurement showing the local join fails on a class of query the owner actually types — the
  fastest way to get it is to ship §4's table and count what it misses, which costs nothing.
- The owner's written consent under all six conditions in §5, at which point this becomes
  approve-with-conditions, not refuse.
