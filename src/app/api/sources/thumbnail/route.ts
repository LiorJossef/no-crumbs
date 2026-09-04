/**
 * `POST /api/sources/thumbnail` — go and get the picture back.
 *
 * ## The defect this closes
 *
 * `0003_sources.sql:28` says it about its own column: *"Signed, ~6-month-expiring CDN URL
 * (VERIFIED). **Never treat as permanent**."* Until this route, the entire response to that expiry
 * was an `onError` handler that hid the image, permanently for that mount, and **nothing in
 * `src/` ever re-called oEmbed for an existing source**. The thumbnail is the recognition cue that
 * makes a saved row a memory of a video rather than a name and a category, and this is a product
 * whose thesis is a map built over months with no return triggers — so the user is *designed* to
 * come back after long gaps, to a library that has quietly gone blank. From the outside that does
 * not look like an expiring link. It looks like the app lost their stuff.
 *
 * ## The six months is wrong, and the real number is what makes this urgent
 *
 * Measured 2026-08-31 against all three real TikTok rows in the local database, by reading the
 * `x-expires` parameter TikTok signs into the URL itself:
 *
 * | fetched (UTC) | `x-expires` | window |
 * |---|---|---|
 * | 2026-08-31 16:48 | 2026-09-02 16:00 | **47 h** |
 * | 2026-08-31 18:31 | 2026-09-02 18:00 | **47 h** |
 * | 2026-08-31 18:40 | 2026-09-02 18:00 | **47 h** |
 *
 * **~47 hours, not ~6 months** — `0003`'s comment is wrong by roughly 90×, and `0016` restates it.
 * The CDN also sends `cache-control: max-age=31536000`, which is what makes the six-month reading
 * plausible and is not an expiry at all: it is a caching instruction about the asset, while
 * `x-expires` is the deadline on the signature. So this is not a slow seasonal decay to be swept
 * up eventually; **every thumbnail in a library is dead two days after it was fetched**, and this
 * route is on the critical path of the second visit, not the hundredth.
 *
 * That same measurement is what makes byte-caching the eventual answer rather than a maybe. At 47
 * hours, a reactive per-view refresh costs one upstream call per source per visit for any library
 * older than two days, which does not survive a 500/day shared quota at any real library size.
 * Storing the image ourselves is the version that scales, it is explicitly out of scope here, and
 * it needs `security-privacy` to rule on TikTok's terms first. **Naming it, not starting it.**
 *
 * ## How it re-fetches without a second oEmbed caller
 *
 * `oembedSourceAdapter` is reused whole — it already owns TikTok's error taxonomy, the single
 * opaque 400 (VERIFIED `04` §5), the `sources` write and the `fetched_at` stamp. Its `fetch` is
 * cache-through, though: a `fetch_status = 'ok'` row is returned with zero network calls, which is
 * the exact behaviour a refresh has to get past. So this route **invalidates, then fetches
 * through** — the ordinary cache-busting idiom — by setting `fetch_status = 'pending'` first.
 * `writeSuccess` then restores `'ok'` with a fresh `thumbnail_url` and `fetched_at`; `writeFailure`
 * records the failure, its `.neq('fetch_status','ok')` guard having been satisfied by the
 * invalidation.
 *
 * Two consequences, both accepted deliberately:
 *
 *  1. **A failed refresh leaves the row `'failed'`.** A later import of the same post therefore
 *     does one live fetch instead of a cache read. That is the honest state — the last live fetch
 *     really did fail — and it is self-healing: the import's own fetch restores `'ok'`. Serving a
 *     cached caption for a post TikTok has just refused would be converting uncertainty into
 *     certainty, which `working-agreement.md` §4 forbids.
 *  2. **A ~600 ms window where a concurrent import misses the cache** and makes its own call. One
 *     extra call, on a race between a refresh and an import of the same post.
 *
 * ## What it does not touch
 *
 * `saved_places.source_thumbnail_url` — `0016`'s denormalized display cache — is **not** written.
 * It cannot be: `apply_saved_place_source_link` is a `coalesce`, a no-op once populated, and the
 * column has no client grant, so refreshing it needs a migration this lane does not own. It does
 * not need one either: `thumbnailOf` (`domain/places/spot.ts`) now prefers the joined
 * `sources.thumbnail_url` and keeps the frozen copy as the fallback for a save with no joined
 * source, so the value this route repairs is the value the screen reads.
 *
 * ## No new error code
 *
 * `07` §9's set is closed and owned by the spec, not by a call site, so this route answers in the
 * same `{ error: { code, retryable } }` envelope with the same thirteen codes and the same status
 * map as the import routes. Two of the reuses are imprecise and are called out rather than
 * smoothed over:
 *
 *  - **`POST_UNAVAILABLE` (422)** for an unknown or not-yours `source_id`. There is no NOT_FOUND in
 *    the taxonomy, and answering identically in both cases is the right behaviour anyway: any
 *    distinction would make this route an oracle for whether a given uuid is somebody's source.
 * A refusal by our own limiter is **not** an error response at all, and that is a decision rather
 * than an oversight. `RATE_LIMITED_LOCAL` was the obvious fit and no longer exists — it was removed
 * from the taxonomy on 2026-08-31 along with the only 429 in the status map. Of what remains,
 * `RATE_LIMITED_UPSTREAM` is a 503, and a 503 is `logSeverityFor`'s definition of "page a human";
 * a per-source cooldown fires on every scroll through an expired library, so wiring it to 503 would
 * put an ordinary, expected, working-as-designed event into the error-rate graph a few hundred
 * times a day and dilute exactly what `07` §7.1 wants that graph to mean. So a refusal is a **200
 * with `status: 'cooling'`**: the request succeeded and the honest answer to "can you get it back?"
 * is "not right now". Which refusal it was survives in the log line's `reason`
 * (`source-cooldown`, `budget:global-day`, …), which is where it can be counted.
 *
 * The three response shapes, and the client does the same thing for the last two — draw the
 * category pin and stop asking:
 *
 * ```
 * { status: 'ok',           url: string, expiresAt: string | null, calledUpstream: boolean }
 * { status: 'no-thumbnail', url: null,   expiresAt: null,          calledUpstream: boolean }
 * { status: 'cooling',      url: null,   expiresAt: null,          calledUpstream: false }
 * ```
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/app/_lib/supabase/server';
import { serviceRoleClient } from '@/integrations/supabase/service-role-client';
import { oembedSourceAdapter } from '@/integrations/tiktok/oembed-source-adapter';
import { signedUrlExpiry } from '@/domain/places/spot';
import { DomainError, internal, malformedUrl, notAuthenticated, postUnavailable } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import { describeCause, httpStatusFor } from '@/app/api/imports/_lib/error-reporting';
import { createRefreshBudget, type BudgetVerdict } from './_lib/refresh-budget';

/**
 * How long after **any** write to a `sources` row this route refuses to call upstream for it.
 *
 * This is the one bound that survives horizontal scale: it is read out of Postgres, so every
 * instance sees the same answer, and it is what coalesces the twenty tabs, two devices and three
 * lambda instances that a single expiry event can produce into one call. Ten minutes is long
 * enough to absorb a reload storm and short enough that a person who waits out a genuine upstream
 * blip can try again within one sitting.
 *
 * `updated_at` rather than `fetched_at` because only the first moves on a *failure* — `sources`
 * has a `touch_updated_at` trigger on every update — and a failed attempt has to count against the
 * cooldown or a dead post is retried at full speed forever. It is not in `0003`'s grant to
 * `authenticated`, which is why the row below is re-read with the service-role client.
 */
const SOURCE_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * How long a source that TikTok refused stays un-retried. **This is the "a dead source stays dead
 * honestly" rule, and the reason it is 24 hours rather than forever.**
 *
 * oEmbed collapses deleted, private, region-locked and never-existed into one opaque 400 (VERIFIED,
 * `04-error-cases.md` §5). So a single `POST_UNAVAILABLE` does not license the claim "this post was
 * deleted" — two of the four reasons behind it are reversible, and one of them (region lock) can
 * depend on which egress IP asked. Retrying forever would be a stampede against a shared quota;
 * declaring permanent death from one opaque 400 would be converting uncertainty into certainty.
 * One attempt per day is the honest middle: the row records what happened, and a post that comes
 * back is picked up on the next visit rather than never.
 */
const UNAVAILABLE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Process-wide, deliberately: see `_lib/refresh-budget.ts` for what that does and does not bound. */
const budget = createRefreshBudget();

/** Codes, ids and counts. Never a URL: a signed CDN URL carries its own signature, and putting one
 *  in a log line writes a credential to disk. Never a caption or a coordinate (charter R9). */
interface RefreshLogLine {
  readonly event: 'thumbnail.refresh';
  readonly outcome: 'ok' | 'no-thumbnail' | 'skipped' | 'refused' | 'failed' | 'aborted';
  readonly sourceId: string | null;
  readonly videoId: string | null;
  /** Whether this request actually spent one of the 500/day. The number worth graphing. */
  readonly calledUpstream: boolean;
  /** Whether the URL the client reported as broken had in fact passed its own `x-expires`.
   *  `null` when it carried none. This is how the ~47-hour measurement gets re-checked in
   *  production instead of being trusted from three local rows. */
  readonly wasExpired: boolean | null;
  readonly reason: string;
  readonly ms: number;
  readonly code: string | null;
  readonly status: number;
  readonly cause: string;
}

function routeCtx(signal: AbortSignal): OpCtx {
  return {
    signal,
    importId: null,
    log: { event: (name, fields) => console.info(JSON.stringify({ event: name, ...fields })) },
  };
}

/** The refusal reason, verbatim, so a log line distinguishes "this person's pace" from "the
 *  feature has spent its day" even though the response is one status. */
function budgetReason(verdict: Exclude<BudgetVerdict, 'allowed'>): string {
  return `budget:${verdict}`;
}

/** "Not right now." A 200, not an error — see this file's header for why a 503 here would poison
 *  the error-rate graph. `url: null` is what makes the client fall back rather than retry. */
function cooling(): NextResponse {
  return NextResponse.json({
    status: 'cooling',
    url: null,
    expiresAt: null,
    calledUpstream: false,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  let sourceId: string | null = null;
  let videoId: string | null = null;
  let calledUpstream = false;
  let wasExpired: boolean | null = null;

  const log = (
    outcome: RefreshLogLine['outcome'],
    reason: string,
    status: number,
    error?: DomainError,
  ): void => {
    const line: RefreshLogLine = {
      event: 'thumbnail.refresh',
      outcome,
      sourceId,
      videoId,
      calledUpstream,
      wasExpired,
      reason,
      ms: Date.now() - startedAt,
      code: error?.code ?? null,
      status,
      cause: describeCause(error?.cause),
    };
    // Same severity split as the import routes (`logSeverityFor`'s argument, applied to a status
    // this route computes for non-error outcomes too): 5xx pages a human, 4xx is ordinary traffic,
    // and an abort is never an alarm. A refused budget claim is emphatically not an error — it is
    // the limiter doing its job — so it stays out of the error bucket with the rest of the 4xx.
    if (outcome !== 'aborted' && status >= 500) console.error(JSON.stringify(line));
    else console.info(JSON.stringify(line));
  };

  const fail = (error: DomainError, reason: string, aborted = false): NextResponse => {
    const status = httpStatusFor(error.code);
    log(aborted ? 'aborted' : 'failed', reason, status, error);
    return NextResponse.json({ error: error.toView() }, { status });
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(notAuthenticated(), 'no-session');

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    return fail(malformedUrl('request body was not valid JSON', e), 'bad-body');
  }

  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  // A uuid, checked by shape before it is ever put in a query. Not paranoia about injection —
  // PostgREST parameterises — but because a malformed id should be a 400 the caller can read,
  // not a 500 from Postgres refusing to cast it.
  const requestedId = typeof fields.sourceId === 'string' ? fields.sourceId.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId)) {
    return fail(malformedUrl('request body had no "sourceId" uuid'), 'bad-source-id');
  }
  sourceId = requestedId;

  /** The URL the browser could not load. Optional, and used for exactly one thing: deciding
   *  whether the stored value has already moved on, which is a zero-call answer. Never trusted as
   *  content and never written anywhere. */
  const failedUrl = typeof fields.failedUrl === 'string' ? fields.failedUrl : null;
  const failedExpiry = failedUrl === null ? null : signedUrlExpiry(failedUrl);
  wasExpired = failedExpiry === null ? null : failedExpiry.getTime() <= startedAt;

  // Authorisation, and nothing else, through the caller's own RLS client: `sources` is readable
  // only where `0003`/`0006`'s membership policies hold, so a row coming back *is* the proof that
  // this person owns an import or a save pointing at it. No `user_id` filter to write, and no
  // second implementation of membership to keep in sync with the policies.
  const { data: visible, error: visibleError } = await supabase
    .from('sources')
    .select('id')
    .eq('id', sourceId)
    .maybeSingle();
  if (visibleError) {
    return fail(internal('sources visibility read failed', visibleError), 'rls-read-failed');
  }
  if (visible === null) {
    // Not yours, or not there. Deliberately the same answer — see this file's header.
    return fail(postUnavailable('no visible source for this id'), 'not-visible');
  }

  const db = serviceRoleClient();
  const { data: row, error: rowError } = await db
    .from('sources')
    .select('id, platform_source_id, thumbnail_url, fetch_status, fetch_error_code, updated_at')
    .eq('id', sourceId)
    .maybeSingle();
  if (rowError || row === null) {
    return fail(internal('sources row read failed', rowError), 'row-read-failed');
  }

  const source = row as {
    platform_source_id: string;
    thumbnail_url: string | null;
    fetch_status: 'pending' | 'ok' | 'failed';
    fetch_error_code: string | null;
    updated_at: string;
  };
  videoId = source.platform_source_id;
  const sinceUpdate = startedAt - new Date(source.updated_at).getTime();

  /** The stored URL and its own deadline, as a response body. Only reached with a non-null URL —
   *  the caller below has already established that the row holds one. */
  const stored = (reason: string): NextResponse => {
    const url = source.thumbnail_url as string;
    const expiry = signedUrlExpiry(url);
    log('ok', reason, 200);
    return NextResponse.json({
      status: 'ok',
      url,
      expiresAt: expiry === null ? null : expiry.toISOString(),
      calledUpstream,
    });
  };

  // Zero-call answer #1, and the one that does most of the work in practice. Twenty rows in one
  // list can share a source, several tabs can be open, and several instances can be serving them;
  // whoever refreshed first already wrote the answer, and everyone after them is a database read.
  if (source.thumbnail_url !== null && source.thumbnail_url !== failedUrl) {
    return stored('already-fresh');
  }

  // Zero-call answer #2: TikTok has already refused this post today. See `UNAVAILABLE_COOLDOWN_MS`
  // for why this is a day rather than forever.
  if (
    source.fetch_status === 'failed' &&
    source.fetch_error_code === 'POST_UNAVAILABLE' &&
    sinceUpdate < UNAVAILABLE_COOLDOWN_MS
  ) {
    return fail(postUnavailable('source refused by upstream within the day'), 'unavailable-cooldown');
  }

  // Zero-call answer #3, the durable per-source cooldown. Reached only when the stored URL is the
  // one that just failed, so there is genuinely nothing new to hand back.
  if (sinceUpdate < SOURCE_COOLDOWN_MS) {
    log('skipped', 'source-cooldown', 200);
    return cooling();
  }

  const verdict = budget.claim(user.id, startedAt);
  if (verdict !== 'allowed') {
    log('refused', budgetReason(verdict), 200);
    return cooling();
  }

  const ctx = routeCtx(req.signal);
  const adapter = oembedSourceAdapter(db);

  try {
    // Invalidate, then fetch through — see the header. Scoped to the row we just read, and only
    // when it is the `'ok'` the adapter's cache would short-circuit on, so a `'pending'`/`'failed'`
    // row is left exactly as it is.
    if (source.fetch_status === 'ok') {
      await db
        .from('sources')
        .update({ fetch_status: 'pending' })
        .eq('id', sourceId)
        .eq('fetch_status', 'ok');
    }

    calledUpstream = true;
    const raw = await adapter.fetch(source.platform_source_id, ctx);
    const url = raw.thumbnailUrl;
    const expiry = url === null ? null : signedUrlExpiry(url);

    // A post that exists and has no thumbnail is a real answer, not a failure: nothing is broken,
    // there is simply no picture, and the client should stop asking rather than retry.
    log(url === null ? 'no-thumbnail' : 'ok', 'refetched', 200);
    return NextResponse.json({
      status: url === null ? 'no-thumbnail' : 'ok',
      url,
      expiresAt: expiry === null ? null : expiry.toISOString(),
      calledUpstream,
    });
  } catch (e) {
    const domainError = e instanceof DomainError ? e : internal('unhandled exception in thumbnail route', e);
    // The adapter's own `writeFailure` has already recorded this on the row, which is what makes
    // the `UNAVAILABLE_COOLDOWN_MS` check above durable across instances and restarts.
    return fail(domainError, 'refetch-failed', req.signal.aborted);
  }
}
