/**
 * `POST /api/sources/thumbnail` — the route that goes and gets the picture back.
 *
 * Every seam that costs money or leaves this machine is mocked: auth, the service-role client and
 * the oEmbed adapter. What is asserted here is the part a live run cannot show cheaply — that the
 * **zero-call** paths really make zero calls. oEmbed is a hard 500/day shared with the import path,
 * every agent and the owner, so "did this spend a call?" is the property under test, and
 * `oembedFetch.mock.calls.length` is the instrument. The live half of the verification (a real
 * refresh against the real database updating a real row) is a separate manual pass; a mock cannot
 * prove a column moved.
 *
 * `server-only` is stubbed for the same reason `probe.test.ts` stubs it: the route reaches
 * `app/_lib/supabase/server`, and what that import protects is the bundler boundary, which
 * `npm run check:layers` is what actually enforces.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { postUnavailable } from '@/domain/errors';

vi.mock('server-only', () => ({}));

const SOURCE_ID = '5bec3f30-686c-4df9-b0da-577e846eadfe';
const VIDEO_ID = '7573466599361924382';

/** A real signed URL, and a second one with a later deadline — the shape a successful refresh
 *  produces. Both carry `x-expires`, so the route's `expiresAt` is parsed, never invented. */
const EXPIRED_URL =
  'https://p16-common-sign.tiktokcdn.com/tos-useast8-p-0068-tx2/oE3jBf1nCi9K~tplv-tiktokx-origin.image?x-expires=1788364800&x-signature=old';
const FRESH_URL =
  'https://p16-common-sign.tiktokcdn.com/tos-useast8-p-0068-tx2/oE3jBf1nCi9K~tplv-tiktokx-origin.image?x-expires=1791000000&x-signature=new';

/** The `sources` row under test. Mutated by the fake service-role client exactly the way the real
 *  adapter mutates the real row, so a test can assert on it afterwards. */
let row: {
  id: string;
  platform_source_id: string;
  thumbnail_url: string | null;
  fetch_status: 'pending' | 'ok' | 'failed';
  fetch_error_code: string | null;
  updated_at: string;
};

/** Whether the caller's RLS client can see the row at all — membership, in one boolean. */
let visibleToCaller = true;
let signedIn = true;

/** Every `update` payload the route or the adapter applied, in order. The invalidate-then-fetch
 *  sequence is a real behaviour of this route and is asserted rather than assumed. */
let updates: Record<string, unknown>[] = [];

const oembedFetch = vi.fn();

vi.mock('@/app/_lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'u1' } : null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: visibleToCaller ? { id: SOURCE_ID } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/integrations/supabase/service-role-client', () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        const applied = { eq: () => applied, then: undefined };
        // The route's invalidation is `.update(...).eq('id').eq('fetch_status','ok')`; the fake
        // applies it unconditionally, which is fine because every test that reaches it has an
        // `'ok'` row. `touch_updated_at` is a trigger in Postgres, so it is simulated here.
        Object.assign(row, payload, { updated_at: new Date().toISOString() });
        return applied as unknown as PromiseLike<unknown>;
      },
    }),
  }),
}));

vi.mock('@/integrations/tiktok/oembed-source-adapter', () => ({
  oembedSourceAdapter: () => ({ platform: 'tiktok', fetch: oembedFetch }),
}));

const { POST } = await import('@/app/api/sources/thumbnail/route');

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/sources/thumbnail', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Long enough ago that neither the 10-minute source cooldown nor the 24-hour unavailable
 *  cooldown is in play — the state a genuinely stale row is in. */
function longAgo(): string {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  visibleToCaller = true;
  signedIn = true;
  updates = [];
  oembedFetch.mockReset();
  row = {
    id: SOURCE_ID,
    platform_source_id: VIDEO_ID,
    thumbnail_url: EXPIRED_URL,
    fetch_status: 'ok',
    fetch_error_code: null,
    updated_at: longAgo(),
  };
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('refreshing a thumbnail', () => {
  it('re-runs oEmbed and returns the new URL with the deadline read out of it', async () => {
    oembedFetch.mockResolvedValue({
      id: SOURCE_ID,
      externalId: VIDEO_ID,
      authorHandle: 'a',
      authorName: 'A',
      canonicalUrl: `https://www.tiktok.com/@_/video/${VIDEO_ID}`,
      thumbnailUrl: FRESH_URL,
      texts: [],
      media: [],
    });

    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      url: FRESH_URL,
      // 1791000000 -> the value is parsed from `x-expires`, not derived from a six-month window.
      expiresAt: '2026-10-03T04:00:00.000Z',
      calledUpstream: true,
    });
    expect(oembedFetch).toHaveBeenCalledTimes(1);
    expect(oembedFetch.mock.calls[0]?.[0]).toBe(VIDEO_ID);
  });

  it('invalidates the cache-through adapter first, or the refresh is a database read', async () => {
    // `oembedSourceAdapter.fetch` returns any `fetch_status = 'ok'` row with zero network calls.
    // Without this write the whole feature silently does nothing, and it would still pass a test
    // that only checked the response shape.
    oembedFetch.mockResolvedValue({ id: SOURCE_ID, thumbnailUrl: FRESH_URL, texts: [], media: [] });
    await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(updates[0]).toEqual({ fetch_status: 'pending' });
  });

  it('reports a post that exists but has no picture, rather than calling it a failure', async () => {
    oembedFetch.mockResolvedValue({ id: SOURCE_ID, thumbnailUrl: null, texts: [], media: [] });
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'no-thumbnail', url: null });
  });
});

describe('the zero-call paths', () => {
  it('hands back a stored URL that has already moved on, without asking TikTok', async () => {
    // The path that carries twenty rows sharing one source, several tabs, and several instances.
    row.thumbnail_url = FRESH_URL;
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ url: FRESH_URL, calledUpstream: false });
    expect(oembedFetch).not.toHaveBeenCalled();
  });

  it('refuses a second attempt inside the ten-minute per-source cooldown', async () => {
    // A 200 `cooling`, not a 5xx: this fires on every scroll through an expired library, and an
    // error status here would put an expected, working-as-designed event in the error-rate graph
    // a few hundred times a day. `url: null` is what makes the client fall back and stop asking.
    row.updated_at = new Date(Date.now() - 60_000).toISOString();
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'cooling',
      url: null,
      calledUpstream: false,
    });
    expect(oembedFetch).not.toHaveBeenCalled();
  });

  it('does not retry a post TikTok refused today', async () => {
    // "A dead source must stay dead honestly": the row itself is the durable record, so this holds
    // across instances and restarts, not only within one warm process.
    row.fetch_status = 'failed';
    row.fetch_error_code = 'POST_UNAVAILABLE';
    row.updated_at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'POST_UNAVAILABLE', retryable: true },
    });
    expect(oembedFetch).not.toHaveBeenCalled();
  });

  it('tries again once the day is up, because a 400 does not mean deleted', async () => {
    // oEmbed collapses deleted / private / region-locked into one opaque 400 (VERIFIED 04 §5), and
    // two of those three are reversible. Never retrying would convert uncertainty into certainty.
    row.fetch_status = 'failed';
    row.fetch_error_code = 'POST_UNAVAILABLE';
    row.updated_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    oembedFetch.mockResolvedValue({ id: SOURCE_ID, thumbnailUrl: FRESH_URL, texts: [], media: [] });
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(200);
    expect(oembedFetch).toHaveBeenCalledTimes(1);
  });
});

describe('who may ask', () => {
  it('refuses without a session', async () => {
    signedIn = false;
    const response = await POST(request({ sourceId: SOURCE_ID }));
    expect(response.status).toBe(401);
    expect(oembedFetch).not.toHaveBeenCalled();
  });

  it('answers a source it cannot see exactly as it answers one that does not exist', async () => {
    // Any distinction here makes the route an oracle for whether a given uuid is somebody's source.
    visibleToCaller = false;
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'POST_UNAVAILABLE', retryable: true },
    });
    expect(oembedFetch).not.toHaveBeenCalled();
  });

  it('rejects a body with no usable source id before touching the database', async () => {
    for (const body of [{}, { sourceId: '' }, { sourceId: 'not-a-uuid' }, { sourceId: 42 }]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(oembedFetch).not.toHaveBeenCalled();
  });
});

describe('when TikTok refuses', () => {
  it('passes the domain error through and lets the adapter record it on the row', async () => {
    oembedFetch.mockRejectedValue(postUnavailable());
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'POST_UNAVAILABLE', retryable: true },
    });
  });

  it('never leaks a provider message or a URL into the response', async () => {
    oembedFetch.mockRejectedValue(new Error(`upstream said no about ${EXPIRED_URL}`));
    const response = await POST(request({ sourceId: SOURCE_ID, failedUrl: EXPIRED_URL }));
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('x-signature');
    expect(body).not.toContain('upstream said no');
    expect(JSON.parse(body)).toEqual({ error: { code: 'INTERNAL', retryable: true } });
  });
});
