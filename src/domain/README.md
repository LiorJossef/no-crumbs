# domain/ — pure TypeScript

No `next/*`, no `react`, no vendor SDK, no `fetch`. Enforced by `eslint.config.mjs`.
Populated per `docs/07-import-execution-model.md` §10 and `docs/11-resolver-vocabulary.md`:

- `types.ts` — the shared vocabulary. MS5 task 2 declared the resolution half; `Source`,
  `Extraction`, `PlaceCandidate`, `Candidate`, `CandidateResolution` and `SavedRecommendation`
  land with the pipeline in MS6.
- `ports.ts` — the ports. `PlaceResolver` + `OpCtx` today; the other five ports in MS6.
- `places/` — plural (`11` §4). `normalise.ts` is the one normalisation, shared with the ingest
  loader in `scripts/`; it lives here and not in `integrations/` because the scorer cannot import
  an outer layer. `scoring-constants.ts` holds **every** weight and threshold (`06` §6.3 requires
  one object, because they will be re-fit); `jaro-winkler.ts` is a measured port of DuckDB's, which
  is what the benchmark was run with; `score.ts` is the scorer itself — `06` §6.1 steps 4–5 and
  §6.2's bands, pure, taking prefiltered rows and returning a `ResolveResult`.
- Still to come: `errors.ts`, `schemas.ts`, `import/pipeline.ts`, `source/`.
