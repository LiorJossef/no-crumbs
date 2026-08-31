# domain/ — pure TypeScript

No `next/*`, no `react`, no vendor SDK, no `fetch`. Enforced by `eslint.config.mjs`.
Populated per `docs/07-import-execution-model.md` §10 and `docs/11-resolver-vocabulary.md`:

- `types.ts` — the shared vocabulary. MS5 task 2 declared the resolution half; L0-F1-T1 added
  `Source`, `SourceView`, `PlaceCandidate`, `Candidate` and `CandidateResolution`; L0-F1-T3 added
  `RawText`, `MediaRef`, `RawSource`, `ContentPart`, `Extraction` and `StageOutput` — the raw
  material and stage-bookkeeping shapes `ports.ts`'s new ports and `import/pipeline.ts` need.
  `SavedRecommendation` is still to come.
- `ports.ts` — the ports. `PlaceResolver` + `OpCtx` from MS5 task 2; L0-F1-T3 added
  `SourceAdapter`, `ContentExtractor`, `PlaceExtractor`, `Clock`, a **narrowed** `ImportStore`
  (`recordStage`/`finish` only — see the file's own note on why `getOrCreateImport`/`loadCached`
  are not here yet), and the `Ports` bundle `runImport` takes. All six are shaped only as far as
  `import/pipeline.ts` calls them; real adapters are L0-F4, not this task.
- `errors.ts` — the closed 13-code `DomainError` union (`07` §9, L0-F1-T1). Every code has a named
  constructor that fixes its `retryable` value; `NO_PLACES_FOUND` is deliberately not here — it is
  `import/events.ts`'s `ImportOutcome` kind `'no_places'`, a success, not a failure.
- `import/events.ts` — `ImportEvent`, the NDJSON stage sequence `runImport` (L0-F1-T3) emits and
  the streaming route (L0-F6-T1) will serialise. Pure; no network, no timers, no framing.
- `import/pipeline.ts` — `runImport(ports, input, ctx)` (L0-F1-T3): the orchestrator. Canonicalises
  the raw input, drives stages A/B/C through `Ports`, enforces `MAX_CANDIDATES = 7`, derives
  `CandidateResolution` from each `ResolveResult`, and maps every reachable `DomainError` — from
  any port, any stage — into exactly one terminal `'failed'` outcome. Its own header names what it
  deliberately does not do yet (idempotency/resumption, cross-stage cancellation, the plausibility
  filter, retries) and which future task owns each.
- `places/` — plural (`11` §4). `normalise.ts` is the one normalisation, shared with the ingest
  loader in `scripts/`; it lives here and not in `integrations/` because the scorer cannot import
  an outer layer. `scoring-constants.ts` holds **every** weight and threshold (`06` §6.3 requires
  one object, because they will be re-fit); `jaro-winkler.ts` is a measured port of DuckDB's, which
  is what the benchmark was run with; `score.ts` is the scorer itself — `06` §6.1 steps 4–5 and
  §6.2's bands, pure, taking prefiltered rows and returning a `ResolveResult`. `fixtures.ts` is the
  pre-L1 vertical slice's mock `MockSavedPlace[]` — map-rendering scaffolding, not the vocabulary;
  it is not `SavedRecommendation` and is expected to be deleted once that type lands.
- Still to come: `schemas.ts`, `source/` (the short-link and other future source-side helpers).
