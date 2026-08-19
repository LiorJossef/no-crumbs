# 11 — The resolver vocabulary: one `PlaceResolver`, one set of names

> Status: **DECIDED and SHIPPED 2026-08-19.** MS5 ledger task 2, owner `nextjs-architect`.
> Code: [`src/domain/types.ts`](../src/domain/types.ts), [`src/domain/ports.ts`](../src/domain/ports.ts),
> [`src/domain/places/normalise.ts`](../src/domain/places/normalise.ts),
> [`src/domain/places/resolve-result.ts`](../src/domain/places/resolve-result.ts),
> [`src/domain/places/category-hint.ts`](../src/domain/places/category-hint.ts).
> Tests: [`tests/unit/places/`](../tests/unit/places/). `npm run lint`, `npm run typecheck`,
> `npm run test` (76 tests) and `npm run check:layers` green.
>
> Why it exists: `06` §8, `07` §10 and `technical-design.md` §6.3 each declared a `PlaceResolver`,
> and no two of them agreed on the method set, the argument types or the return type. `RankedPlace`
> and `ResolveResult` were used in three documents and defined in none. Tasks 3, 4 and 7 all write
> against these names this week and MS7's adapters implement the port, so the cost of deciding it
> after the scorer exists is rewriting the scorer.

## 1. The decision in one block

| Question | Answer |
|---|---|
| Where does the port live? | `src/domain/ports.ts`. One interface, `PlaceResolver` |
| Where do the types live? | `src/domain/types.ts`, one definition each. No barrel file |
| How many methods? | **One.** `resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult>` |
| What identifies a resolver? | `readonly provider: 'overture' \| 'nominatim'` |
| What does the scorer consume? | `ResolvedPlace` — the `poi_index` columns, field-for-field |
| What does it produce? | `RankedPlace` (a `ResolvedPlace` + its four score components) |
| Where does `normalise()` live? | **`src/domain/places/normalise.ts`** — not `integrations/`, which was an ESLint error |
| Does anything Zod land here? | **No.** Zod is not a dependency yet; parsing is the adapter's job in MS7 (`07` §"Validation") |

## 2. The conflicts, and the ruling on each

Ten. Each is a real disagreement between two shipped documents, not a stylistic preference.

| # | The conflict | Ruling |
|---|---|---|
| 1 | **Resolver identity.** `06` §8: `readonly id: 'overture-local' \| 'nominatim'`. `07` §10: `readonly provider: string` | `readonly provider: PlaceProvider = 'overture' \| 'nominatim'`. `07`'s field name (it is what `resolve_place(p_provider)` receives) with `06`'s closed union. **`'overture-local'` was unusable**: `place_provider_refs.provider` is `check (provider ~ '^[a-z][a-z0-9_]{1,31}$')` (migration 0005) and the hyphen fails it. The documented value could never have been inserted |
| 2 | **What `resolve` takes.** `06`: a `ResolveInput` of strings. `07`: `(c: PlaceCandidate, hints: ResolveHints, ctx: OpCtx)` | One `ResolveQuery` + `OpCtx`. The resolver has no business seeing `evidence` or `modelConfidence` — that also keeps R10 (caption prompt injection) contained, since nothing from the LLM but a name and two hints crosses the seam — and manual place addition (capability 13) has no `PlaceCandidate` at all. `ResolveHints` is folded into `ResolveQuery`: two objects that are always passed together are one object |
| 3 | **`search()` vs `resolve()`.** Both `06` and `07` declared two methods; `technical-design` §6.3 called `PlaceResolver.search` from a Server Action | **One method.** With one input type and one output type the two signatures are *identical*, and MS7's adapter would implement both by delegating to the same query. A distinction with no type-level content is not a seam. The manual sheet builds a different `ResolveQuery` (`near` set, `categoryHint` null, its own `maxResults`); its rate limiter lives in `app/` either way. If MS11 measures that autocomplete needs different ranking, it adds a field to `ResolveQuery`, not a second method |
| 4 | **What `search` returns.** `technical-design` §6.3 and `06` §8: `RankedPlace[]`. `07` §10: `ResolvedPlace[]` | Moot after ruling 3 — everything returns `ResolveResult`. Note what the array forms both lost: `regionsSearched`. A manual search for a Lisbon café must be able to say *"we don't have Lisbon yet"*, and a bare array cannot |
| 5 | **What `resolve` returns.** `06` §6: `{ shortlist, confidence, margin, action, region_loaded }`. `07` §8: `CandidateResolution`, a three-way discriminated union | The port returns **`ResolveResult`** — `06`'s evidence-carrying shape. `CandidateResolution` is **derived** from it by the pipeline in MS6, per the 1:1 mapping `07` §10 already states (`preselect → resolved`, `confirm → ambiguous`, `no_match → unresolved`). That direction is the lossy one, so it happens as late as possible; and `unresolved`'s other three reasons (`lookup_failed`, `timed_out`, `capped`) are pipeline facts that a resolver cannot report, which is the proof that `CandidateResolution` is not the port's return type |
| 6 | **`action` vs `ConfidenceBand`, and `confidence: number` vs `Confidence`.** `06` §6 carried a bare `confidence: number`, a `margin`, and an `action`; `07` §10 declared `Confidence = { band, score, margin }` | `ResolveResult.confidence: Confidence`, with `band: ConfidenceBand`. `06`'s bare `confidence: number` duplicated `shortlist[0].score` and is dropped. The field is `band`, not `action` — nothing acts on it but the UI |
| 7 | **`margin: number` cannot express the defect `10` §8 found.** The prototype sets `margin = 1.0` when the prefilter returns one row, so a single-candidate query clears the `margin ≥ 0.05` gate on score alone | `Confidence.margin: number \| null`. `null` means *unmeasured*, not *perfect*. The port cannot reproduce the defect without deciding what `null` means, and `10` §12 Q3 already ruled the band for it: `confirm`. This is the one place where a type change fixes a measured behavioural bug rather than tidying a name |
| 8 | **`region_loaded` was listed in `06` §6's output type and was missing from every interface** (the MS5 review noted the omission and nothing closed it); `06` §7.3 and `10` §2 attribute it to a method called `resolveOne`, which exists in no interface in the repository | `ResolveResult.regionsSearched: readonly RegionId[]`, and `regionLoaded(result)` — a function in `domain/places/resolve-result.ts`, not a field. A boolean stored beside the array it summarises is a second writer for one fact. Also: snake_case does not cross into TypeScript, and `resolveOne` is corrected to `PlaceResolver.resolve` in both documents |
| 9 | **`categoryHint`'s domain is two different sets.** `09` §4.2's schema emits seven values (`restaurant`, `cafe`, `bar`, `bakery`, `attraction`, `shop`, `other`); `06` §6.1's `CAT_TOKENS` has three keys, and the prototype indexes it directly — `CAT_TOKENS['bakery']` is a `KeyError`. Nobody had reconciled them | `ResolveQuery.categoryHint: CategoryHint \| null` (`'cafe' \| 'bar' \| 'restaurant'`), plus a total conversion `categoryHintFor()` in `domain/places/category-hint.ts`. `bakery → cafe` (because `CAT_TOKENS.cafe` already contains the token `bakery`, so the relation is symmetric); `attraction`, `shop`, `other` → `null`, because the category term is 0.18 of the score and a hint we cannot score must contribute nothing rather than something arbitrary. **The scorer must never index a token table with a raw string** |
| 10 | **`areaHint`.** Declared in `06` §6's input type | **Dropped.** No producer — `09`'s `PlaceCandidate` has `cityHint`, `countryHint` and `categoryHint`, never an area — and no consumer: the scorer has no term for it. A field with neither is a future requirement pretending to be a contract |

Two smaller corrections taken in the same pass, because they are the same seam:

- **`OpCtx.importId` is `ImportId | null`** (`07` §10 had `ImportId`). Manual place addition resolves
  with no import, and a synthetic id would put a lie into the one log line `07` §7.1 groups by.
- **`ResolvedPlace` was a seven-field sketch** (`providerId`, `provider`, `name`, `lat`, `lng`,
  `address`, `category`). It is now the `poi_index` columns as they actually are: `providerPlaceId`,
  `sourceDataset`, `regionId`, `altNames`, `providerCategory`, `addressLine`, `locality`,
  `datasetConfidence` — with `datasetConfidence: number`, not `number | null`, because the column is
  `not null default 0.5`, which is why the prototype's `conf or 0.5` coalesce has no port. Two
  shapes for one row is how a nullability disagreement becomes a runtime crash.

## 3. `normalise()`: why `10` §4.1 was an error, not a preference

`10` §4.1 put the single normalisation in `integrations/places/normalise.ts`. The scorer is
`domain/places/` and `domain/` may not import `integrations/`. That is enforced, not aspirational,
and it was **measured** rather than assumed before this ruling was written:

```
$ npx eslint src/domain/places/__probe.ts        # import from '@/integrations/places/normalise'
  error  '@/integrations/places/normalise' import is restricted ... domain/ must not depend on an outer layer
$ npx eslint src/domain/places/__probe.ts        # import from '../../integrations/places/normalise'
  error  '../../integrations/places/normalise' import is restricted ... domain/ must not depend on an outer layer
```

Both forms fail, so there was no relative-path escape hatch. `normalise()` therefore lives in
`src/domain/places/normalise.ts`, which is also where it belongs on the merits: it is pure, it has no
vendor in it, and it *is* a domain definition — what it means for two place names to be the same
name. `10` §4.1's real requirement, **one implementation shared by the loader and the resolver**,
survives the move untouched: the ingest loader in `scripts/` has no lint zone and imports it from
`domain/`.

`NORM_VERSION = 1` is exported beside it and is what the loader writes into
`poi_regions.norm_version` (`smallint check (norm_version > 0)`, migration 0010). `10` §4.2 requires the resolver to
compare it against every loaded region and **refuse to serve** on a mismatch; that check belongs to
the adapter that reads `poi_regions` (task 7 / MS7) and is not implemented by this task. The
constant it will compare against exists now, which is the part that had to be decided once.

**The port is byte-identical on the inputs that matter, verified not asserted.** All 44 benchmark
queries plus 18 adversarial cases (Hebrew, Hangul, dakuten kana, fullwidth, Cyrillic, Greek
breathing marks, emoji, `Ⅳ ½`, an en dash, `tel_aviv`) were run through the *unmodified* prototype
`norm()` on 2026-08-19 and pinned as expectations in `tests/unit/places/normalise.test.ts`. The
JavaScript trap `10` §4 warned about is avoided explicitly: `\p{L}\p{N}_` with the `u` flag, never
`\w`. Two findings worth recording:

1. **The prototype's kept CJK range is load-bearing after all.** `10` §4 implies the ranges are
   mostly redundant against a Unicode-aware `\w`; `中華・そば` proves otherwise — U+30FB KATAKANA
   MIDDLE DOT is neither a letter nor a number and survives only because of the explicit range.
2. **NFKD lengthens Hangul.** `라면` decomposes to five conjoining jamo, which are letters, not
   combining marks, so they are kept. That is the behaviour migration 0010's `name_norm` CHECK of
   1 000 characters was sized for, and there is now a test that would notice if it changed.

One bounded divergence is documented in the function's header rather than hidden: Python tests
`unicodedata.combining(ch)` (non-zero canonical combining class) and JavaScript exposes no
combining-class data, so the strip is `\p{Mn}`. The two sets differ only on non-spacing marks of
class 0 — Thai, Lao, Khmer, some Indic vowel signs — none of which occurs in a Tel Aviv, Tokyo or
London extract. It cannot cause the silent drift `10` §4 exists to prevent, because after MS5 the
Python is gone and both the loader and the resolver call this one function.

## 4. `domain/places/`, plural

`07` §10 and `technical-design.md` §2 both wrote `domain/place/`; the MS5 ledger's task 3 row says
`src/domain/places/`. Ruled **plural**, and both trees corrected. The ledger row is the instruction
the session that creates the directory actually reads, `places` matches `poi_index`/`places`
everywhere else in the schema, and one directory name in two prose trees is cheaper to correct now
than a mismatch discovered halfway through a port.

## 5. What is deliberately *not* here

- **No Zod.** `zod` is not in `package.json`, and this task is not where a dependency lands.
  Parsing untrusted input stays exactly where charter §5 and `07` §"Validation" put it: inside the
  MS7 adapter, at the boundary, before a `ResolvedPlace` exists. The domain types are the *result*
  of parsing, not the parser.
- **No scorer.** Weights, thresholds, `GENERIC`, `CAT_TOKENS` and Jaro-Winkler are task 3's single
  exported constants object. `RankedPlace`'s field names track the per-result keys of
  `raw-overture-scored.json` (`score`, `name_score`, `token_cov`, `cat_match`) so task 4's golden
  file compares like with like.
- **No `Source`, `Extraction`, `PlaceCandidate`, `Candidate`, `CandidateResolution`,
  `SavedRecommendation`.** They are declared in `07` §10 and land in `domain/types.ts` in MS6 with
  the pipeline that uses them. Writing them a week early, against no caller, is how a vocabulary
  acquires fields nothing needs. The one exception is `ExtractedCategoryHint`, which exists only
  because ruling 9 needed a total function today.
- **No `errors.ts`.** The port's contract says a transport or parse failure throws a `DomainError`
  and no-match does not; the closed union itself is MS6's, and inventing one code now would fork it.
- **No `ImportStore`, `Clock`, `SourceAdapter`, `ContentExtractor`, `PlaceExtractor`.** Five of
  `07` §10's six ports are still MS6's. Only the one that tasks 3/4/7 and MS7 need is declared.
- **No branded `RegionId`.** A brand pays for itself where a constructor validates; the only
  producer of a region id is a read of `poi_regions` and the only consumer is the next query. It
  would buy a cast, not a check.
- **No cache, no provider registry, no resolver chain.** `06` §6.4's cache lives *behind* the port
  in MS7 and the domain must not learn whether it exists; Nominatim fallback is a second adapter
  chosen in the composition root, not a strategy object here.
- **No distance term.** `ResolveQuery.near` is carried because MS11's "search near me" and
  `poi_index_lat_lng_idx` are both already shipped decisions, but the scorer has no distance term
  and a resolver that ignores `near` is not wrong. That is documented on the field so task 3 does
  not invent one.
