/**
 * `runImport` — the orchestrator (`07` §4, §5, §10; L0-F1-T3). Pure TypeScript: every external
 * effect is a call through one of the six `Ports`, and the only thing this file ever throws or
 * yields is what `domain/errors.ts` and `domain/import/events.ts` already define.
 *
 * **Precondition this file does not enforce for you: `input.importId` must already exist.**
 * `07` §5's own sequence diagram opens the import row (`getOrCreateImport`, the idempotency check)
 * *before* the streamed pipeline starts, so by the time `runImport` runs there is always a real
 * `ImportId` to attach to every event — including a `'failed'` outcome from a canonicaliser error
 * that happens before stage A ever calls the network. Allocating that id, and deciding
 * `ImportInput.idempotent`, is the caller's job (the future L0-F6 route handler); `runImport`
 * receives both as inputs rather than discovering them, because `ImportOutcome`'s `'failed'`
 * variant requires a non-null `ImportId` and there is no honest way to synthesise one here.
 *
 * **What this file deliberately does not do**, each a named future task rather than a gap:
 *  - No idempotency lookup, no resumption over cached stage output (`ImportStore.getOrCreateImport`
 *    / `loadCached` — see `ports.ts`'s note). That is L0-F4's adapter plus L0-F6's route handler.
 *  - No cooperative cancellation between stages (`07` §7's "checked between stages only"). The
 *    route handler owns `request.signal`; nothing in this task's checklist asks for it, and adding
 *    it without a real caller to observe it would be untested speculation.
 *  - No plausibility filter on extracted candidates (`09` §5.2 — hashtag/city/generic-word
 *    rejection). That is a pure function the AI Engineer owns against `04` §5's category tables;
 *    `runImport` trusts `PlaceExtractor.extract`'s output as already-plausible `PlaceCandidate[]`.
 *  - No retry policy (`07` §7's per-stage attempt counts and backoff). A fake `SourceAdapter` or
 *    `PlaceExtractor` that wants to model "succeeds on the second attempt" retries internally
 *    before resolving its own promise — `runImport` calls each port exactly once per stage, per
 *    candidate.
 */

import { DomainError, internal, noCaption } from '../errors';
import type { OpCtx, Ports, PlaceResolver } from '../ports';
import { normalise } from '../places/normalise';
import { canonicaliseTikTokUrl } from '../source/canonicalise-tiktok-url';
import type { ImportEvent, ImportOutcome } from './events';
import type {
  Candidate,
  CandidateResolution,
  ConfidenceBand,
  PlaceCandidate,
  RankedPlace,
  ResolveQuery,
  ResolveResult,
  Source,
  SourceView,
  UserId,
  ImportId,
} from '../types';

/**
 * `07` §7's ceiling: candidates beyond this are kept, visible, with `resolution.status = 'capped'`
 * — never silently dropped. The same number also bounds provider requests per import, since one
 * lookup is issued per resolved candidate (`07` §7's `MAX_PROVIDER_REQUESTS_PER_IMPORT`, the same
 * value for the same reason).
 */
export const MAX_CANDIDATES = 7;

export interface ImportInput {
  readonly userId: UserId;
  /** Already allocated by the caller — see this file's header. */
  readonly importId: ImportId;
  readonly rawInput: string;
  /** Whatever the caller's `getOrCreateImport` returned (07 §6): carried through verbatim rather
   *  than guessed, so the `accepted` event's `idempotent` field is never a fabricated value. */
  readonly idempotent: boolean;
}

function toDomainError(e: unknown): DomainError {
  if (e instanceof DomainError) {
    return e;
  }
  const message = e instanceof Error ? e.message : String(e);
  return internal(message, e);
}

function toSourceView(source: Source): SourceView {
  return {
    externalId: source.externalId,
    canonicalUrl: source.canonicalUrl,
    authorHandle: source.authorHandle,
    thumbnailUrl: source.thumbnailUrl,
  };
}

/**
 * Candidate + extraction-level city hint -> the one `ResolveQuery` shape every `PlaceResolver`
 * call in this pipeline builds. Exported so `/api/imports/probe` (the DB-first resolution check
 * ahead of the LLM-guess fallback, L0-F2b) can build the exact same query a real `runImport` would
 * — this is not a second construction to keep in sync, it is the one this file already had.
 */
export function buildResolveQuery(candidate: PlaceCandidate, extractionCityHint: string | null): ResolveQuery {
  return {
    text: candidate.rawName,
    cityHint: candidate.cityHint ?? extractionCityHint,
    countryHint: candidate.countryHint,
    categoryHint: candidate.categoryHint,
    near: null,
    maxResults: null,
  };
}

/** `preselect` > `confirm` > `no_match` — used only to compare two `ResolveResult`s against each
 *  other, never to make a save/no-save decision on its own (that stays `deriveResolution`'s job). */
function bandRank(band: ConfidenceBand): number {
  return band === 'preselect' ? 2 : band === 'confirm' ? 1 : 0;
}

/**
 * Between two `ResolveResult`s for the *same candidate* (one query text against another — see
 * `resolveCandidateBestEffort` below), which one to trust. Found live, 2026-08-24: a Hebrew query
 * text ("קפה נואר") landed in `confirm` band at a near-zero margin (~0.0004) between its top pick
 * and four other, unrelated, generically-named real places — `confirmScore`'s threshold does not
 * itself require separation the way `preselectMargin` does, so a `confirm`-band pick can be a
 * coin-flip and still call itself a match.
 *
 * A higher band wins outright; within the same band, the larger margin wins — a `null` margin
 * (only one candidate at all) is treated as the strongest possible signal of no ambiguity, not as
 * "unknown", since there is nothing else it could be confused with.
 */
export function preferResolveResult(a: ResolveResult, b: ResolveResult): ResolveResult {
  const rankA = bandRank(a.confidence.band);
  const rankB = bandRank(b.confidence.band);
  if (rankA !== rankB) return rankA > rankB ? a : b;
  const marginA = a.confidence.margin ?? Infinity;
  const marginB = b.confidence.margin ?? Infinity;
  return marginA >= marginB ? a : b;
}

/**
 * Resolves a candidate against the database using its raw caption text, and — when the model's
 * own "identifiedName" (`06` §3.4's real-world guess, e.g. the Latin "Cafe Noir" for a raw Hebrew
 * "קפה נואר") differs from the raw text — a second attempt using that name too, keeping whichever
 * result is actually unambiguous rather than whichever ran first. This does not let the model's
 * guess *invent* a match: both attempts still go through the same real `PlaceResolver` against the
 * same real database, so the saved result is always a real, found row, never the model's guess
 * standing in for one — only *which query text* to trust is decided by the model here.
 *
 * Skips the second attempt entirely when there is no `identifiedName`, or it normalises the same
 * as `rawName` (asking the same question twice would only double the provider call for nothing).
 */
export async function resolveCandidateBestEffort(
  resolver: PlaceResolver,
  candidate: PlaceCandidate,
  extractionCityHint: string | null,
  ctx: OpCtx,
): Promise<ResolveResult> {
  const primaryQuery = buildResolveQuery(candidate, extractionCityHint);
  const primary = await resolver.resolve(primaryQuery, ctx);

  const identifiedName = candidate.identifiedName;
  if (identifiedName === null || normalise(identifiedName) === normalise(candidate.rawName)) {
    return primary;
  }

  const alt = await resolver.resolve({ ...primaryQuery, text: identifiedName }, ctx);
  return preferResolveResult(primary, alt);
}

/**
 * Derives `CandidateResolution` from `ResolveResult` (`07` §8, `11` §2 ruling 5): the 1:1 mapping
 * `preselect -> resolved`, `confirm -> ambiguous`, `no_match -> unresolved`. An empty shortlist
 * under a `preselect` band cannot occur from a real resolver (there is nothing to preselect), but
 * a fake test port is not obliged to respect that invariant, so it is handled here rather than
 * asserted away.
 */
function deriveResolution(result: ResolveResult): CandidateResolution {
  const top: RankedPlace | undefined = result.shortlist[0];
  if (result.confidence.band === 'preselect' && top !== undefined) {
    return {
      status: 'resolved',
      place: top.place,
      alternates: result.shortlist.slice(1).map((r) => r.place),
      confidence: result.confidence,
    };
  }
  if (result.confidence.band === 'confirm' && result.shortlist.length > 0) {
    return { status: 'ambiguous', options: result.shortlist.map((r) => r.place) };
  }
  return { status: 'unresolved', reason: 'no_match' };
}

/**
 * Awaits `work`, yielding a `heartbeat` event (`07` §5) every `ports.heartbeatIntervalMs` while it
 * is still in flight. `yield*` this from `runImport` to get both the interleaved heartbeats and
 * `work`'s resolved value via the generator's return channel.
 *
 * Never throws through the `Promise.race` path with an unhandled rejection: `work`'s own
 * `.then` records the outcome into `settled`/`failure` (with a no-op rejection handler so the
 * attachment itself never produces one), and the raced copy is `.catch`-guarded so a rejection
 * ends the race instead of surfacing there. The real rejection is re-thrown once, after the loop,
 * from `failure`.
 */
async function* withHeartbeats<T>(work: Promise<T>, ports: Ports, ctx: OpCtx): AsyncGenerator<ImportEvent, T> {
  let settled = false;
  let result: T | undefined;
  let failure: unknown;
  let hasFailure = false;
  work.then(
    (r) => {
      result = r;
      settled = true;
    },
    (e: unknown) => {
      failure = e;
      hasFailure = true;
      settled = true;
    },
  );

  while (!settled) {
    await Promise.race([
      work.catch(() => undefined),
      ports.clock.sleep(ports.heartbeatIntervalMs, ctx.signal),
    ]);
    if (!settled) {
      yield { t: 'heartbeat' };
    }
  }

  if (hasFailure) {
    throw failure;
  }
  return result as T;
}

/**
 * The orchestrator. Emits the full `07` §5 event sequence and enforces `MAX_CANDIDATES`. Never
 * throws out of the generator itself — every reachable failure, from any stage or any port,
 * becomes exactly one terminal `{ t: 'done', outcome: { kind: 'failed', ... } }` event, because a
 * generator that throws instead of yielding its failure would force every caller (the future
 * NDJSON route handler included) to wrap it in its own try/catch to recover the one thing this
 * function already knows how to say.
 */
export async function* runImport(ports: Ports, input: ImportInput, ctx: OpCtx): AsyncGenerator<ImportEvent> {
  const { importId } = input;

  try {
    // Pre-A — pure, no network (07 §5's diagram; L0-F1-T2).
    const canon = canonicaliseTikTokUrl(input.rawInput);
    if (!canon.ok) {
      throw canon.error;
    }
    const canonical = canon.value;

    yield { t: 'accepted', importId, idempotent: input.idempotent };

    // Stage A — source.
    yield { t: 'stage', stage: 'source', status: 'started' };
    const sourceStartMs = ports.clock.monotonicMs();

    const externalId =
      canonical.kind === 'short_link'
        ? (yield* withHeartbeats(ports.source.resolveShortLink(canonical, ctx), ports, ctx)).externalId
        : canonical.externalId;

    const raw = yield* withHeartbeats(ports.source.fetch(externalId, ctx), ports, ctx);
    const source: Source = {
      id: raw.externalId,
      platform: 'tiktok',
      externalId: raw.externalId,
      canonicalUrl: raw.canonicalUrl,
      authorHandle: raw.authorHandle,
      authorName: raw.authorName,
      thumbnailUrl: raw.thumbnailUrl,
      fetchedAt: ports.clock.now(),
    };
    await ports.store.recordStage(
      importId,
      { stage: 'source', ms: ports.clock.monotonicMs() - sourceStartMs, source },
      ctx,
    );
    yield { t: 'stage', stage: 'source', status: 'done', fact: { authorHandle: source.authorHandle } };

    // Stage B — extract.
    yield { t: 'stage', stage: 'extract', status: 'started' };
    const extractStartMs = ports.clock.monotonicMs();

    const parts = [];
    for (const extractor of ports.content) {
      if (extractor.supports(raw)) {
        const extracted = yield* withHeartbeats(extractor.extract(raw, ctx), ports, ctx);
        parts.push(...extracted);
      }
    }
    if (parts.length === 0) {
      throw noCaption();
    }

    const extraction = yield* withHeartbeats(ports.extractor.extract(parts, ctx), ports, ctx);
    const cityHint = extraction.cityHint;
    const inBudget = extraction.candidates.slice(0, MAX_CANDIDATES);
    const overCap = extraction.candidates.slice(MAX_CANDIDATES);

    await ports.store.recordStage(
      importId,
      {
        stage: 'extract',
        ms: ports.clock.monotonicMs() - extractStartMs,
        extraction: {
          sourceId: source.id,
          extractorVersion: ports.extractor.version,
          promptVersion: ports.extractor.promptVersion,
          candidates: extraction.candidates,
          cityHint,
          producedAt: ports.clock.now(),
        },
      },
      ctx,
    );
    yield {
      t: 'stage',
      stage: 'extract',
      status: 'done',
      fact: { candidateCount: extraction.candidates.length },
    };

    if (extraction.candidates.length === 0) {
      // NO_PLACES_FOUND (07 §9's "not errors, deliberately"): the modal outcome, a success.
      const outcome: ImportOutcome = { kind: 'no_places', importId, source: toSourceView(source) };
      await ports.store.finish(importId, outcome, ctx);
      yield { t: 'done', outcome };
      return;
    }

    // Stage C — resolve. Never fails the import (07 §7's asymmetry): a lookup failure degrades
    // one candidate to `unresolved`, it does not throw out of this stage.
    yield { t: 'stage', stage: 'resolve', status: 'started' };
    const resolveStartMs = ports.clock.monotonicMs();
    const total = inBudget.length;
    const resolved: Candidate[] = [];
    let attempted = 0;
    let allTransportFailed = true;

    for (let i = 0; i < inBudget.length; i++) {
      const candidate = inBudget[i] as PlaceCandidate;
      attempted += 1;
      let resolution: CandidateResolution;
      try {
        const query = buildResolveQuery(candidate, cityHint);
        const result = yield* withHeartbeats(ports.resolver.resolve(query, ctx), ports, ctx);
        resolution = deriveResolution(result);
        allTransportFailed = false;
      } catch (e) {
        const de = toDomainError(e);
        resolution = { status: 'unresolved', reason: de.code === 'UPSTREAM_TIMEOUT' ? 'timed_out' : 'lookup_failed' };
      }
      resolved.push({ candidate, resolution });
      yield { t: 'candidate', index: i + 1, total };
    }
    for (const candidate of overCap) {
      resolved.push({ candidate, resolution: { status: 'unresolved', reason: 'capped' } });
    }

    // "Every attempted lookup failed with a transport error" (07 §8 rule 3) — vacuously false if
    // nothing was attempted (an all-capped, zero-in-budget import cannot happen since inBudget is
    // non-empty here, but the `attempted > 0` guard keeps the rule's own wording exact).
    const degraded: 'PLACE_PROVIDER_UNAVAILABLE' | null = attempted > 0 && allTransportFailed ? 'PLACE_PROVIDER_UNAVAILABLE' : null;

    await ports.store.recordStage(
      importId,
      { stage: 'resolve', ms: ports.clock.monotonicMs() - resolveStartMs, candidates: resolved, degraded },
      ctx,
    );

    // kind: 'ready' whenever stage B produced >= 1 candidate, regardless of how resolution went
    // (07 §8 rule 1) — a partial result is a success with an asterisk, never a failure.
    const outcome: ImportOutcome = {
      kind: 'ready',
      importId,
      source: toSourceView(source),
      candidates: resolved,
      degraded,
    };
    await ports.store.finish(importId, outcome, ctx);
    yield { t: 'done', outcome };
  } catch (e) {
    const error = toDomainError(e);
    const outcome: ImportOutcome = { kind: 'failed', importId, error: error.toView(importId) };
    try {
      await ports.store.finish(importId, outcome, ctx);
    } catch {
      // The record write failed too. The stream still tells the truth to whoever is listening;
      // a lost audit row is a log-worthy bug (07 §7.1), not a reason to hide the real outcome
      // from the caller by throwing a second, different error out of this generator.
    }
    yield { t: 'done', outcome };
  }
}
