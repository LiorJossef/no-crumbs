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

import { categoryHintFor } from '../places/category-hint';
import { DomainError, internal, noCaption } from '../errors';
import type { OpCtx, Ports } from '../ports';
import { canonicaliseTikTokUrl } from '../source/canonicalise-tiktok-url';
import type { ImportEvent, ImportOutcome } from './events';
import type {
  Candidate,
  CandidateResolution,
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
 * Exported since TLV-RESOLVE-T3 so `/api/imports/probe` builds the *same* `ResolveQuery` this
 * pipeline does. A second copy of this mapping at the route would be the classic way for the
 * streamed pipeline and the request/response probe to start resolving the same caption
 * differently — same candidate, two answers, and no way to tell which one a saved row came from.
 */
export function buildResolveQuery(candidate: PlaceCandidate, extractionCityHint: string | null): ResolveQuery {
  return {
    text: candidate.rawName,
    cityHint: candidate.cityHint ?? extractionCityHint,
    countryHint: candidate.countryHint,
    // `ResolveQuery` speaks the scorer's three-value vocabulary; a candidate carries all seven
    // (`domain/types.ts`). This is the one seam that narrows, and the only caller of
    // `categoryHintFor` on the import path.
    categoryHint: categoryHintFor(candidate.categoryHint),
    // The street address the caption gave, verbatim (TLV-ADDR-1). Passed through untouched:
    // `places/score.ts` owns every decision about how an address is parsed and compared, and a
    // second opinion here is exactly what this function's header exists to prevent.
    addressHint: candidate.addressHint,
    near: null,
    maxResults: null,
  };
}

/**
 * Derives `CandidateResolution` from `ResolveResult` (`07` §8, `11` §2 ruling 5): the 1:1 mapping
 * `preselect -> resolved`, `confirm -> ambiguous`, `no_match -> unresolved`. An empty shortlist
 * under a `preselect` band cannot occur from a real resolver (there is nothing to preselect), but
 * a fake test port is not obliged to respect that invariant, so it is handled here rather than
 * asserted away.
 */
export function deriveResolution(result: ResolveResult): CandidateResolution {
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
