/**
 * TEMPORARY measurement route — delete before this branch merges.
 *
 * It answers one question that cannot be answered from this laptop: **does TikTok serve the
 * video page payload to a datacentre IP?** Locally (residential) the page fetch succeeds on
 * roughly a third to a half of attempts, nondeterministically — the same URL fails and then
 * succeeds on retry. Published reports claim datacentre egress does far worse, and Vercel's
 * egress is AWS, so the local number tells us nothing about production. This measures it from
 * where the code would actually run.
 *
 * It fetches the public post page and looks for the rehydration payload — the same mechanism a
 * downloader uses to find a media URL. **It downloads no media and parses no payload**: the only
 * thing recorded is whether the marker is present, the status, the byte count and the timing.
 *
 * Preview only — every other environment 404s, and that gate is the whole of it. Nothing here is
 * a step toward shipping this mechanism; it exists to put a measured number against an
 * acquisition route the owner asked to have tested rather than assumed.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** The marker a downloader keys on. Presence is the whole measurement — we never read it. */
const REHYDRATION_MARKER = '__UNIVERSAL_DATA_FOR_REHYDRATION__';

const ATTEMPTS = 6;

/** A real browser UA. Without one the page is refused outright, which would measure the header
 *  rather than the IP — and the IP is the question. */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

interface AttemptResult {
  readonly attempt: number;
  readonly status: number | null;
  readonly ms: number;
  readonly bytes: number;
  readonly hasPayload: boolean;
  /** TikTok served the client-side-rendered shell instead of server-rendering. Throttle. */
  readonly csrFallback: boolean;
  /** 403 / 429 / a verification interstitial. A wall, not a throttle — the distinction decides
   *  whether retrying could rescue this route. */
  readonly hardBlock: boolean;
  /** TikTok's own renderer duration, in ms. ~190 on a shed request, ~1200 on a real render. */
  readonly renderMs: string | null;
  readonly error: string | null;
}

/**
 * Measured residentially 2026-08-29: a *failed* fetch is not a 403 and not a captcha. It is
 * HTTP 200 with `x-csr-fallback: 1`, ~44 KB, no `charset` on the content type, and TikTok's own
 * renderer reporting ~190 ms of execution instead of ~1200 ms — the CSR shell a real browser
 * would go on to hydrate over XHR. That is SSR load-shedding, and it is retryable. A hard block
 * would look completely different, so classify them apart rather than counting both as "failed".
 */
function classify(status: number, headers: Headers, body: string): { csrFallback: boolean; hardBlock: boolean } {
  const low = body.toLowerCase();
  return {
    csrFallback: headers.get('x-csr-fallback') === '1',
    hardBlock:
      status === 403 ||
      status === 429 ||
      low.includes('tiktok-verify') ||
      low.includes('verify to continue') ||
      low.includes('slide to verify') ||
      low.includes('access denied') ||
      low.includes('unusual traffic'),
  };
}

async function probeOnce(url: string, attempt: number): Promise<AttemptResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    const body = await res.text();
    const { csrFallback, hardBlock } = classify(res.status, res.headers, body);
    return {
      attempt,
      status: res.status,
      ms: Date.now() - started,
      bytes: body.length,
      hasPayload: body.includes(REHYDRATION_MARKER),
      csrFallback,
      hardBlock,
      renderMs: res.headers.get('x-bytefaas-execution-duration'),
      error: null,
    };
  } catch (e) {
    return {
      attempt,
      status: null,
      ms: Date.now() - started,
      bytes: 0,
      hasPayload: false,
      csrFallback: false,
      hardBlock: false,
      renderMs: null,
      // Class only — never a vendor error body.
      error: e instanceof Error ? e.name : 'unknown',
    };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Preview only. Not production, and not a local `next dev` either — a laptop is the residential
  // measurement this route exists to contradict, and answering there would invite the confusion.
  // No env-var gate on purpose: the Vercel env store is currently empty, and a probe that needs a
  // variable somebody has to add by hand is a probe that never runs.
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  const videoId = req.nextUrl.searchParams.get('videoId');
  const handle = req.nextUrl.searchParams.get('handle');
  if (videoId === null || !/^\d{10,25}$/.test(videoId) || handle === null || !/^[\w.]{1,30}$/.test(handle)) {
    return NextResponse.json({ error: 'videoId and handle required' }, { status: 400 });
  }

  const url = `https://www.tiktok.com/@${handle}/video/${videoId}`;
  const attempts: AttemptResult[] = [];
  for (let i = 1; i <= ATTEMPTS; i += 1) {
    attempts.push(await probeOnce(url, i));
  }

  const ok = attempts.filter((a) => a.hasPayload).length;
  return NextResponse.json(
    {
      egress: 'vercel',
      region: process.env.VERCEL_REGION ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      videoId,
      attempts,
      summary: {
        withPayload: ok,
        of: ATTEMPTS,
        csrFallback: attempts.filter((a) => a.csrFallback).length,
        hardBlock: attempts.filter((a) => a.hardBlock).length,
        meanMs: Math.round(attempts.reduce((s, a) => s + a.ms, 0) / ATTEMPTS),
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
