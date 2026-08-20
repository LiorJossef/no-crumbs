# domain/ — pure TypeScript

No `next/*`, no `react`, no vendor SDK, no `fetch`. Enforced by `eslint.config.mjs`.
Populated per `docs/07-import-execution-model.md` §10 and `docs/11-resolver-vocabulary.md`:

- `types.ts` — the shared vocabulary. MS5 task 2 declared the resolution half; L0-F1-T1 added
  `Source`, `SourceView`, `PlaceCandidate`, `Candidate` and `CandidateResolution` — the slice
  `ImportEvent`'s terminal outcome needs. `Extraction` and `SavedRecommendation` are still to come.
- `ports.ts` — the ports. `PlaceResolver` + `OpCtx` today; the other five ports land with the
  tasks that call them (`SourceAdapter`/`ContentExtractor`/`PlaceExtractor`/`ImportStore`/`Clock`).
- `errors.ts` — the closed 14-code `DomainError` union (`07` §9, L0-F1-T1). Every code has a named
  constructor that fixes its `retryable` value; `NO_PLACES_FOUND` is deliberately not here — it is
  `import/events.ts`'s `ImportOutcome` kind `'no_places'`, a success, not a failure.
- `import/events.ts` — `ImportEvent`, the NDJSON stage sequence `runImport` (L0-F1-T3) will emit
  and the streaming route (L0-F6-T1) will serialise. Pure; no network, no timers, no framing.
- `places/` — plural (`11` §4). `normalise.ts` is the one normalisation, shared with the ingest
  loader in `scripts/`; it lives here and not in `integrations/` because the scorer cannot import
  an outer layer. `scoring-constants.ts` holds **every** weight and threshold (`06` §6.3 requires
  one object, because they will be re-fit); `jaro-winkler.ts` is a measured port of DuckDB's, which
  is what the benchmark was run with; `score.ts` is the scorer itself — `06` §6.1 steps 4–5 and
  §6.2's bands, pure, taking prefiltered rows and returning a `ResolveResult`.
- Still to come: `schemas.ts`, `import/pipeline.ts`, `source/`.
