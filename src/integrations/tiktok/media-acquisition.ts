/**
 * The missing acquisition step: a TikTok post id + handle in, a `MediaRef` at that post's video
 * out, or `null`. L0-TRANSCRIPT-T4.
 *
 * **Read this before changing anything here.** oEmbed (`oembed-source-adapter.ts`) is the
 * product's only VERIFIED retrieval mechanism and the whole import path depends on it. It shares
 * our egress IP with this module. So every rule below exists to make it impossible for this file
 * to escalate against TikTok, and none of them is a performance trade-off to be tuned away:
 * one in-flight page fetch process-wide, a floor on the interval between fetches, a rolling
 * process budget, at most four attempts per call, retries **only** on the one failure shape that
 * is measurably load-shedding rather than refusal, and a process-wide circuit breaker that stops
 * everything the moment a response looks like a real block. If in doubt, this file does less.
 *
 * **What is measured, and what is not** (`docs/evidence/extraction/raw/mstoken-carry-2026-08-29.json`,
 * 40 fetches, five posts, residential egress, 2026-08-29):
 *  - A *failed* page fetch is **not** a block. It is HTTP 200 carrying `x-csr-fallback: 1`, a body
 *    of exactly 44,059 bytes, and TikTok's own `x-bytefaas-execution-duration` under ~150 ms
 *    against 335–2,316 ms on a served render. That is SSR load-shedding — the client-side shell a
 *    real browser would hydrate over XHR — and it is retryable by construction. In that run the
 *    header separated the two classes perfectly: present on 18/18 sheds, absent on 22/22 renders.
 *  - The payload rate is **time-varying, not a constant**: 55% over this run against 33% measured
 *    the same day. Retry-on-shed is therefore the right mechanism and a fixed success rate is not
 *    a number to design against.
 *  - **Carrying TikTok's own `msToken` cookie between attempts does nothing.** Cold 12/20 vs
 *    cookie-jar 10/20, paired discordance 6 vs 4 (p ≈ 0.75). So there is no cookie jar in this
 *    file: it bought nothing, and persisting an anti-bot token to raise a hit rate is the one
 *    move that would turn load-shedding into a reason to look at us.
 *  - TLS impersonation also buys nothing (prior measurement), so there is no impersonation
 *    dependency here either.
 *
 * **Standing position, unchanged by any of the above** (`docs/evidence/extraction/tiktok-media-acquisition-2026-08-29.md`
 * §2): reading this payload is contrary to TikTok's ToS ("extract any data or content… using any
 * automated system or software that is not provided by TikTok"). This module is the safest
 * possible construction of a mechanism the owner re-opened; it is not a finding that the
 * mechanism became permissible. It stays **off by default** — `mediaAcquisitionEnabled()` — and
 * the label for production use is ASSUMED, never VERIFIED, until it is measured from Vercel's own
 * egress.
 */
import { mediaUnreadable, upstreamTimeout, type DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import type { MediaRef } from '@/domain/types';
import { isAllowedTikTokHost } from '@/domain/source/canonicalise-tiktok-url';

import { TikTokRehydrationSchema } from './rehydration-schema';

/** The script tag a rehydrated page carries its state in. Its absence *is* the shed signal. */
const REHYDRATION_MARKER = '__UNIVERSAL_DATA_FOR_REHYDRATION__';
const REHYDRATION_OPEN = /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>/;

/** Without a browser UA the page is refused outright — that would measure the header rather than
 *  reach the post. Deliberately a real, current string and nothing more: no TLS impersonation, no
 *  challenge solving, no cookie jar, no session. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const MAX_ATTEMPTS = 4;
const MAX_REDIRECT_HOPS = 3;
/** A shed answers in ~300 ms, so the backoff only has to outlive the shedding window, not a human's
 *  patience. Attempt n waits `BACKOFF_BASE_MS * 2^(n-1)` plus up to the same again in jitter. */
const BACKOFF_BASE_MS = 400;
/** Floor between any two page fetches, process-wide. Politeness, and the reason a retry storm
 *  cannot exist even if a caller loops. */
const MIN_INTERVAL_MS = 1_200;
/** Rolling process budget. Four attempts × a handful of concurrent imports, and no more — a caller
 *  bug must cost us a few refused acquisitions, never our egress. */
const BUDGET_WINDOW_MS = 10 * 60_000;
const BUDGET_MAX_FETCHES = 24;
/** How long a tripped breaker stays open. Long enough that a real block is not re-poked while it
 *  is still being enforced; a transcript is additive, so the cost of over-waiting is one caption-
 *  only import. */
const BREAKER_COOLDOWN_MS = 30 * 60_000;
/** Consecutive non-shed anomalies (transport failures, unexpected statuses, 200s that are neither
 *  a render nor a shed) that trip the breaker on their own. Three, not ten: err toward tripping. */
const ANOMALY_RUN_TO_TRIP = 3;
/** Bytes of body we are willing to hold. A served page is ~440 KB; anything far past that is not
 *  a page we understand and must not be buffered. */
const MAX_BODY_BYTES = 4_000_000;

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const VIDEO_ID = /^\d{17,20}$/;

/**
 * Where a media URL is allowed to point. A **suffix** allow-list, unlike `isAllowedTikTokHost`'s
 * exact five-host set, because the CDN is sharded across hostnames we cannot enumerate
 * (`v16-webapp-prime.*`, `v19-webapp.*`, …). The suffix test is anchored on a dot so
 * `tiktokcdn.com.evil.io` fails: this URL comes out of an untrusted document and is handed
 * downstream to be fetched.
 */
const MEDIA_HOST_SUFFIXES: readonly string[] = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokv.com',
  'tiktokv.us',
  'tiktok.com',
  'ttwstatic.com',
  'byteoversea.com',
  'muscdn.com',
];

function isAllowedMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return MEDIA_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

/** What one page fetch turned out to be. Only `csr-shed` is retried. */
type ResponseClass = 'payload' | 'csr-shed' | 'hard-block' | 'anomaly';

export interface MediaAcquisitionInput {
  readonly externalId: string;
  readonly authorHandle: string;
}

/** Injected only so tests can run without real waits or a real clock. Production passes nothing. */
export interface MediaAcquisitionDeps {
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  /**
   * Called with the `Cookie` header value the page fetch was issued a session under, when one is
   * issued. **The media CDN requires it.** Measured 2026-08-29 against
   * `v16-webapp-prime.tiktok.com`: the same signed `playAddr`, same UA, same referer, returns
   * **403** without these cookies and **200** with them.
   *
   * A callback rather than a field on the returned `MediaRef`, because `MediaRef` is a domain type
   * that travels into `RawSource` and gets logged and persisted; a session token has no business
   * riding along there. The caller that needs it opts in, holds it for the one download, and drops
   * it.
   */
  readonly onSession?: (cookie: string) => void;
}

// ---------------------------------------------------------------------------------------------
// Process-wide state. Module scope on purpose: the thing being protected is one shared egress IP,
// so a per-request or per-instance breaker would protect nothing.
// ---------------------------------------------------------------------------------------------

let breakerOpenedAt: number | null = null;
let breakerReason: string | null = null;
let anomalyRun = 0;
let lastFetchAt = 0;
let recentFetches: number[] = [];
/** The single-flight gate. Never rejects — only the resolver below settles it. */
let gate: Promise<void> = Promise.resolve();

/** Test-only. Never called from production code; the breaker has no reset in a running process
 *  other than its own cooldown, which is the point of it. */
export function __resetMediaAcquisitionStateForTests(): void {
  breakerOpenedAt = null;
  breakerReason = null;
  anomalyRun = 0;
  lastFetchAt = 0;
  recentFetches = [];
  gate = Promise.resolve();
}

export interface BreakerView {
  readonly open: boolean;
  readonly reason: string | null;
  readonly openedAt: number | null;
}

export function mediaAcquisitionBreaker(now: number = Date.now()): BreakerView {
  const open = breakerOpenedAt !== null && now - breakerOpenedAt < BREAKER_COOLDOWN_MS;
  return {
    open,
    reason: open ? breakerReason : null,
    openedAt: breakerOpenedAt,
  };
}

/**
 * Off unless explicitly switched on. Acquisition is a ToS-contrary mechanism the owner re-opened
 * under measurement; nothing should be able to start it by merely deploying this file.
 */
export function mediaAcquisitionEnabled(): boolean {
  return process.env.TIKTOK_MEDIA_ACQUISITION === 'on';
}

function tripBreaker(reason: string, now: number, ctx: OpCtx): void {
  if (breakerOpenedAt !== null && now - breakerOpenedAt < BREAKER_COOLDOWN_MS) {
    return;
  }
  breakerOpenedAt = now;
  breakerReason = reason;
  anomalyRun = 0;
  // Codes and counts only — never a URL, a body, a header value or a cookie (charter R9).
  ctx.log.event('tiktok.media_acquisition.breaker_tripped', {
    reason,
    cooldownMs: BREAKER_COOLDOWN_MS,
  });
}

// ---------------------------------------------------------------------------------------------
// Politeness
// ---------------------------------------------------------------------------------------------

/**
 * Serialises every page fetch in the process and enforces the minimum interval *inside* the lock,
 * so the interval is between fetches rather than between callers. Returns `null` without running
 * `fn` when the rolling budget is spent — a refusal, never a queue that grows.
 */
async function politely<T>(
  fn: () => Promise<T>,
  deps: Required<MediaAcquisitionDeps>,
): Promise<T | 'budget-exhausted'> {
  const prior = gate;
  let release!: () => void;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prior;

  try {
    const now = deps.now();
    recentFetches = recentFetches.filter((t) => now - t < BUDGET_WINDOW_MS);
    if (recentFetches.length >= BUDGET_MAX_FETCHES) {
      return 'budget-exhausted';
    }

    const wait = MIN_INTERVAL_MS - (now - lastFetchAt);
    if (wait > 0) {
      await deps.sleep(wait);
    }

    const at = deps.now();
    lastFetchAt = at;
    recentFetches.push(at);
    return await fn();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------------------------
// One fetch
// ---------------------------------------------------------------------------------------------

interface FetchOutcome {
  readonly cls: ResponseClass;
  readonly body: string | null;
  readonly status: number | null;
}

/**
 * The wall shapes. A 403/429 or an interstitial is a refusal; everything else is not, and
 * mistaking a shed for a refusal (or the reverse) is the only classification error that matters
 * here — one costs a transcript, the other costs oEmbed.
 *
 * **A page that carries the rehydration payload is never a block, whatever words are in it.**
 * That guard is the whole fix for a bug this shipped with: the marker list used to include bare
 * `captcha`, and TikTok's own script bundle references a captcha module on *every* page — so a
 * perfectly good render tripped the breaker on the first request and put acquisition into a
 * 30-minute cooldown. Measured against a live local import on 2026-08-29:
 * `breaker_tripped reason=hard_block status=200` on a 200 that had served us the payload.
 *
 * So markers are consulted only when there is no payload, and the vaguest of them are gone.
 * `captcha` and `access denied` were both dropped: they appear in ordinary bundles and ordinary
 * copy, and a marker that fires on a healthy page is not evidence of a wall.
 */
function isHardBlock(status: number, body: string): boolean {
  if (status === 403 || status === 429) {
    return true;
  }
  if (body.includes(REHYDRATION_MARKER)) {
    return false;
  }
  const low = body.slice(0, 200_000).toLowerCase();
  return (
    low.includes('tiktok-verify') ||
    low.includes('verify to continue') ||
    low.includes('slide to verify') ||
    low.includes('unusual traffic')
  );
}

/** The page's `Set-Cookie` values flattened into a `Cookie` request header. Name and value only —
 *  attributes (`Path`, `HttpOnly`, `Expires`) are response-side and must not be echoed back. */
function sessionCookieFrom(response: Response): string | null {
  const raw = response.headers.getSetCookie?.() ?? [];
  const pairs: string[] = [];
  for (const line of raw) {
    const pair = line.split(';', 1)[0]?.trim();
    if (pair !== undefined && pair.includes('=') && !pair.endsWith('=')) pairs.push(pair);
  }
  return pairs.length === 0 ? null : pairs.join('; ');
}

async function readBody(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return null;
  }
  const text = await response.text();
  return text.length > MAX_BODY_BYTES ? null : text;
}

/**
 * One page fetch with its redirect chain followed by hand: `redirect: 'manual'`, re-applying
 * `isAllowedTikTokHost` to every `Location` before it is dereferenced (`07` §7's SSRF rule — the
 * same rule `resolve-short-link.ts` obeys). A redirect off the allow-list is an anomaly, not a
 * hop to follow.
 */
async function fetchPageOnce(
  url: string,
  ctx: OpCtx,
  d: Required<MediaAcquisitionDeps>,
): Promise<FetchOutcome> {
  let current = url;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: ctx.signal,
        headers: {
          'user-agent': BROWSER_UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
    } catch (e) {
      if (ctx.signal.aborted) {
        throw upstreamTimeout(undefined, e);
      }
      return { cls: 'anomaly', body: null, status: null };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) {
        return { cls: 'anomaly', body: null, status: response.status };
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { cls: 'anomaly', body: null, status: response.status };
      }
      if (next.protocol !== 'https:' || !isAllowedTikTokHost(next.hostname)) {
        return { cls: 'anomaly', body: null, status: response.status };
      }
      current = next.toString();
      continue;
    }

    const body = await readBody(response);
    if (body === null) {
      return { cls: 'anomaly', body: null, status: response.status };
    }
    if (isHardBlock(response.status, body)) {
      return { cls: 'hard-block', body: null, status: response.status };
    }
    if (!response.ok) {
      return { cls: 'anomaly', body: null, status: response.status };
    }
    if (body.includes(REHYDRATION_MARKER)) {
      const session = sessionCookieFrom(response);
      ctx.log.event('tiktok.media_acquisition.session', {
        captured: session !== null,
        pairs: session === null ? 0 : session.split(';').length,
      });
      if (session !== null) d.onSession?.(session);
      return { cls: 'payload', body, status: response.status };
    }
    // The measured shed: 200, the marker absent, `x-csr-fallback: 1`. Requiring *both* keeps a
    // page that merely changed shape out of the retry loop, where it would burn four fetches for
    // nothing.
    if (response.headers.get('x-csr-fallback') === '1') {
      return { cls: 'csr-shed', body: null, status: response.status };
    }
    return { cls: 'anomaly', body: null, status: response.status };
  }

  return { cls: 'anomaly', body: null, status: null };
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

/** Slices the rehydration JSON out of its script tag without a DOM. Bounded and non-greedy: the
 *  first `</script>` after the tag opens, or nothing. */
function sliceRehydrationJson(html: string): string | null {
  const open = REHYDRATION_OPEN.exec(html);
  if (open === null || open.index === undefined) {
    return null;
  }
  const start = open.index + open[0].length;
  const end = html.indexOf('</script>', start);
  return end === -1 ? null : html.slice(start, end);
}

/** `x-expires` (and the older `expire`) are unix seconds on the signed CDN URL. A ref with no
 *  readable expiry gets `null` rather than an invented deadline — the caller must treat both as
 *  "consume immediately" anyway, and a wrong `expiresAt` is worse than none. */
function expiryOf(url: URL): Date | null {
  const raw = url.searchParams.get('x-expires') ?? url.searchParams.get('expire');
  if (raw === null) {
    return null;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return new Date(seconds * 1000);
}

/**
 * Payload → `MediaRef`, or `null`. Every field is untrusted: the schema is shallow, the post id
 * is checked against the one we asked for, and the URL must be https on a known CDN suffix. Any
 * mismatch is an ordinary "no media" — TikTok will move this payload, and the day it does must
 * cost us transcripts, not a crash and never a wrong URL.
 */
export function parseMediaRefFromPayload(html: string, externalId: string): MediaRef | null {
  const json = sliceRehydrationJson(html);
  if (json === null) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }

  const parsed = TikTokRehydrationSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const detail = parsed.data.__DEFAULT_SCOPE__['webapp.video-detail'];
  if (detail.statusCode !== undefined && detail.statusCode !== 0) {
    return null;
  }

  const item = detail.itemInfo?.itemStruct;
  if (item === undefined || item.id !== externalId) {
    return null;
  }

  const candidate = item.video?.playAddr ?? item.video?.downloadAddr ?? null;
  if (candidate === null || candidate === '') {
    return null;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isAllowedMediaHost(url.hostname)) {
    return null;
  }

  return { kind: 'video', url: url.toString(), expiresAt: expiryOf(url) };
}

// ---------------------------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------------------------

/**
 * The post's video, or `null`. **Never throws except `UPSTREAM_TIMEOUT`** on the caller's own
 * abort: a transcript is additive, so every other failure — shed exhaustion, an open breaker, a
 * spent budget, a moved payload — is `null` plus a structured log line, and the import continues
 * on the caption alone. `MEDIA_UNREADABLE` is constructed here only to name a failure in that
 * log; it is not thrown, because throwing it would turn an additive miss into an import failure.
 *
 * The caller decides *whether* to call: never call it when the caption already resolves the post.
 * This function's job is to make the call bounded when it is made.
 */
export async function acquireTikTokMedia(
  input: MediaAcquisitionInput,
  ctx: OpCtx,
  deps: MediaAcquisitionDeps = {},
): Promise<MediaRef | null> {
  const d: Required<MediaAcquisitionDeps> = {
    now: deps.now ?? (() => Date.now()),
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    random: deps.random ?? Math.random,
    onSession: deps.onSession ?? (() => {}),
  };

  if (!HANDLE.test(input.authorHandle) || !VIDEO_ID.test(input.externalId)) {
    ctx.log.event('tiktok.media_acquisition.skipped', {
      reason: 'malformed_input',
    });
    return null;
  }

  const breaker = mediaAcquisitionBreaker(d.now());
  if (breaker.open) {
    ctx.log.event('tiktok.media_acquisition.suppressed', {
      reason: breaker.reason ?? 'unknown',
    });
    return null;
  }

  // Rebuilt from validated parts, never taken from user input — the same rule `canonicalUrlFor`
  // obeys in `oembed-source-adapter.ts`.
  const url = `https://www.tiktok.com/@${input.authorHandle}/video/${input.externalId}`;

  let shed = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (ctx.signal.aborted) {
      throw upstreamTimeout();
    }

    const outcome = await politely(() => fetchPageOnce(url, ctx, d), d);

    if (outcome === 'budget-exhausted') {
      ctx.log.event('tiktok.media_acquisition.suppressed', {
        reason: 'budget_exhausted',
        attempt,
      });
      return null;
    }

    if (outcome.cls === 'hard-block') {
      // Stop dead. No retry, no next attempt, and every later call is suppressed for the cooldown.
      // Escalating against a block is how we would lose oEmbed, which shares this egress.
      tripBreaker('hard_block', d.now(), ctx);
      ctx.log.event('tiktok.media_acquisition.failed', {
        reason: 'hard_block',
        status: outcome.status ?? 0,
        attempt,
      });
      return null;
    }

    if (outcome.cls === 'anomaly') {
      anomalyRun += 1;
      if (anomalyRun >= ANOMALY_RUN_TO_TRIP) {
        tripBreaker('anomaly_run', d.now(), ctx);
        ctx.log.event('tiktok.media_acquisition.failed', {
          reason: 'anomaly_run',
          attempt,
        });
        return null;
      }
      ctx.log.event('tiktok.media_acquisition.failed', {
        reason: 'anomaly',
        status: outcome.status ?? 0,
        attempt,
        run: anomalyRun,
      });
      return null;
    }

    // A shed and a render both prove TikTok is answering us normally, so either one clears the
    // anomaly run — the run is a *block* detector, not a general failure counter.
    anomalyRun = 0;

    if (outcome.cls === 'payload' && outcome.body !== null) {
      const ref = parseMediaRefFromPayload(outcome.body, input.externalId);
      if (ref === null) {
        const named: DomainError = mediaUnreadable();
        ctx.log.event('tiktok.media_acquisition.failed', {
          reason: 'payload_unreadable',
          code: named.code,
          attempts: attempt,
          shed,
        });
        return null;
      }
      ctx.log.event('tiktok.media_acquisition.acquired', {
        attempts: attempt,
        shed,
        hasExpiry: ref.expiresAt !== null,
      });
      return ref;
    }

    shed += 1;
    if (attempt < MAX_ATTEMPTS) {
      const backoff = BACKOFF_BASE_MS * 2 ** (attempt - 1);
      await d.sleep(backoff + Math.floor(d.random() * backoff));
    }
  }

  ctx.log.event('tiktok.media_acquisition.failed', {
    reason: 'csr_shed_exhausted',
    attempts: MAX_ATTEMPTS,
    shed,
  });
  return null;
}
