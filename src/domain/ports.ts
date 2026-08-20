/**
 * The ports. An external service is reachable from `domain/` only through an interface declared
 * here, and exactly one adapter in `integrations/` implements each (charter §5, `07` §10).
 *
 * `07` §10 declares six: `SourceAdapter`, `ContentExtractor`, `PlaceExtractor`, `PlaceResolver`,
 * `ImportStore`, `Clock`. **MS5 task 2 declared one** — `PlaceResolver`, plus the `OpCtx`/`Logger`
 * that every port takes. **L0-F1-T3 adds the other five**, shaped only as far as `runImport`
 * (`import/pipeline.ts`) actually calls them — real adapters are L0-F4, a later task, and must not
 * be implemented here. No barrel file, no DI container: a port is a function parameter.
 *
 * **`ImportStore` is narrower here than `07` §10 sketches.** That document gives it four methods,
 * including `getOrCreateImport` (idempotency: the same-video-id row) and `loadCached` (resumption:
 * re-execution over cached stage outputs). `runImport` does not call either: it takes an
 * already-allocated `ImportId` as part of its input (`import/pipeline.ts`'s `ImportInput`),
 * because `07` §5's own sequence diagram opens an import row (and therefore knows the id) *before*
 * the streamed pipeline begins — the row-opening step is the caller's, not the orchestrator's.
 * Only `recordStage` and `finish` are declared here, because those are the two methods `runImport`
 * itself performs. **L0-F4/L0-F6 must extend this interface** (or add a sibling one) with
 * `getOrCreateImport` and `loadCached` once the route handler that owns idempotency and
 * resumption is built — this file does not invent that seam ahead of the code that needs it.
 */

import type { ClassifiedShortLink } from './source/canonicalise-tiktok-url';
import type {
  ContentPart,
  ImportId,
  PlaceCandidate,
  RawSource,
  ResolveQuery,
  ResolveResult,
  PlaceProvider,
  StageOutput,
} from './types';
import type { ImportOutcome } from './import/events';

/**
 * Structured logging only — event name plus scalar fields. **Never a caption, never a
 * coordinate** (charter R9, `04` §8 Q8): video ids, region ids and codes only.
 */
export interface Logger {
  event(name: string, fields: Record<string, string | number | boolean>): void;
}

/**
 * Per-operation context: the cancellation signal, what to correlate logs by, and where to log.
 * It is not a separate `signal` parameter, and it is not a request object.
 *
 * `importId` is **nullable**, which is a change to `07` §10's `importId: ImportId`. Manual place
 * addition (capability 13) resolves without an import; forcing a synthetic id there would put a
 * lie in the log line that `07` §7.1 groups by.
 */
export interface OpCtx {
  readonly signal: AbortSignal;
  readonly importId: ImportId | null;
  readonly log: Logger;
}

/**
 * Candidate string in, ranked shortlist out. The only seam between the domain and a places
 * provider, and the replacement for the three incompatible `PlaceResolver` declarations in
 * `06` §8, `07` §10 and `technical-design.md` §6.3.
 *
 * **One method, not two.** `06` and `07` both declared `resolve(...)` and `search(...)`; with one
 * input type and one output type those two signatures become identical, and MS7's adapter would
 * implement both by delegating to the same query. A distinction with no type-level content is
 * not a seam. The import path and the manual-search sheet differ in the `ResolveQuery` they
 * build (`categoryHint` vs `near`, `maxResults`) and in the rate limiter in front of them, which
 * lives in `app/` either way. If MS11 measures that autocomplete needs different ranking, it adds
 * a field to `ResolveQuery` — not a second method.
 *
 * **Never throws for "no match".** No match is `shortlist: []` with band `no_match`, and "that
 * city is not loaded" is `regionsSearched: []`. A transport or parse failure throws a
 * `DomainError` (`07` §9, `domain/errors.ts`, MS6) — no provider error object, message, status
 * code or stack ever leaves the adapter.
 */
export interface PlaceResolver {
  /**
   * Which alias namespace this resolver's `providerPlaceId`s belong to. `06` §8's
   * `readonly id: 'overture-local' | 'nominatim'` is renamed and re-valued: the field is
   * `provider` (it is what `resolve_place(p_provider)` receives) and `'overture-local'` violates
   * `place_provider_refs.provider`'s CHECK.
   */
  readonly provider: PlaceProvider;
  resolve(query: ResolveQuery, ctx: OpCtx): Promise<ResolveResult>;
}

/**
 * A. Acquire raw source material for one post. One adapter per platform (07 §10) — V1 has one
 * implementation, TikTok's oEmbed adapter (L0-F4).
 *
 * `resolveShortLink` is **not** in `07` §10's sketch of this port; it is added here because
 * `canonicaliseTikTokUrl` (L0-F1-T2) is pure and only *classifies* a `vm./vt./t/` short link
 * (`ClassifiedShortLink`), it never follows the redirect — that is a network operation, and
 * `07` §10's own file header for the canonicaliser says the adapter that does it is
 * `integrations/tiktok/resolve-short-link.ts`, "not yet built". Rather than invent a seventh port
 * for one method, its natural home is here: it is the same platform adapter, and it is the only
 * thing standing between a `ClassifiedShortLink` and the `externalId` stage A needs. It throws
 * `SHORT_LINK_UNRESOLVED` on exhaustion (`07` §7) and must re-apply `isAllowedTikTokHost` to every
 * redirect `Location`, exactly as `04` §2 step 4 requires — that is L0-F4's job, not this file's.
 */
export interface SourceAdapter {
  readonly platform: 'tiktok';
  resolveShortLink(link: ClassifiedShortLink, ctx: OpCtx): Promise<{ readonly externalId: string }>;
  /** Throws only `DomainError`. Vendor shapes are Zod-parsed inside the adapter (07 §10). */
  fetch(externalId: string, ctx: OpCtx): Promise<RawSource>;
}

/**
 * B(pre). Turn raw source material into text the extractor can read (07 §10). **This is the seam
 * that must stay open**: an ASR or OCR analyser is a second implementation added to
 * `Ports.content`, and no other stage changes. V1's array length is 1 — one caption extractor.
 */
export interface ContentExtractor {
  readonly id: 'caption' | 'transcript' | 'onscreen-text';
  supports(raw: RawSource): boolean;
  extract(raw: RawSource, ctx: OpCtx): Promise<readonly ContentPart[]>;
}

/**
 * C. Text -> 0..N candidates. Schema-constrained; no tools; no side effects (charter R10, `09` §2).
 * One implementation, Anthropic's structured-output adapter (L0-F4) — a second model is a second
 * file, never a framework (`07` §10).
 */
export interface PlaceExtractor {
  readonly version: string;
  readonly promptVersion: string;
  extract(
    parts: readonly ContentPart[],
    ctx: OpCtx,
  ): Promise<{ readonly candidates: readonly PlaceCandidate[]; readonly cityHint: string | null }>;
}

/**
 * E (narrowed). The import's record, as far as `runImport` touches it — see the file header for
 * why `getOrCreateImport`/`loadCached` are not here yet. Nothing here claims work: `imports` is a
 * record, not a queue (`07` §6).
 */
export interface ImportStore {
  /** One stage's output, recorded before the next stage starts (07 §6). */
  recordStage(importId: ImportId, out: StageOutput, ctx: OpCtx): Promise<void>;
  /** The terminal write: status, `error_code`/`degraded_code`, final candidates, timings. */
  finish(importId: ImportId, outcome: ImportOutcome, ctx: OpCtx): Promise<void>;
}

/**
 * F. The only source of time in `domain/`. Exists so budgets and stage timings are testable
 * without a real clock (07 §10): `Date.now()`, `new Date()`, `setTimeout` and `Math.random` in
 * `domain/` are a bug, not a shortcut.
 */
export interface Clock {
  /** Wall clock: `fetchedAt`. */
  now(): Date;
  /** Stage timings; never wall-clock arithmetic. */
  monotonicMs(): number;
  /** Retry backoff and the heartbeat interval below, abortable. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  /** The +/- spread on a backoff. Unused by `runImport` itself (no retries are implemented at this
   *  layer yet — see `import/pipeline.ts`'s header) but declared now so an adapter that does retry
   *  (L0-F4) has one `Clock` to depend on, not two. */
  jitterMs(ms: number): number;
}

/**
 * The six ports plus one orchestration-only knob. `heartbeatIntervalMs` is not part of `07` §10's
 * vocabulary: it exists because `runImport` emits a `heartbeat` event (`import/events.ts`) while a
 * port call is in flight, and a hardcoded 2000 (07 §5's "every 2 s") would make every test that
 * exercises a slow fake port either wait two real seconds or fake `Clock.sleep` in a way that
 * defeats its own purpose. Real composition (L0-F6) must set this to `2000`; a fake `Ports` in a
 * test may set it to whatever keeps that test fast.
 */
export interface Ports {
  readonly source: SourceAdapter;
  readonly content: readonly ContentExtractor[];
  readonly extractor: PlaceExtractor;
  readonly resolver: PlaceResolver;
  readonly store: ImportStore;
  readonly clock: Clock;
  readonly heartbeatIntervalMs: number;
}
