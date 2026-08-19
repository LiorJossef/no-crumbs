# domain/ — pure TypeScript

No `next/*`, no `react`, no vendor SDK, no `fetch`. Enforced by `eslint.config.mjs`.
Populated per `docs/07-import-execution-model.md` §10 and `docs/11-resolver-vocabulary.md`:

- `types.ts` — the shared vocabulary. MS5 task 2 declared the resolution half; `Source`,
  `Extraction`, `PlaceCandidate`, `Candidate`, `CandidateResolution` and `SavedRecommendation`
  land with the pipeline in MS6.
- `ports.ts` — the ports. `PlaceResolver` + `OpCtx` today; the other five ports in MS6.
- `places/` — plural (`11` §4). `normalise.ts` is the one normalisation, shared with the ingest
  loader in `scripts/`; it lives here and not in `integrations/` because the scorer cannot import
  an outer layer.
- Still to come: `errors.ts`, `schemas.ts`, `import/pipeline.ts`, `source/`, the scorer.
