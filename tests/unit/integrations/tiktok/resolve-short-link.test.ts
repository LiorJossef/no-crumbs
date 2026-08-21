import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpCtx } from '@/domain/ports';
import type { ClassifiedShortLink } from '@/domain/source/canonicalise-tiktok-url';
import { resolveShortLink } from '@/integrations/tiktok/resolve-short-link';

function ctx(signal: AbortSignal = new AbortController().signal): OpCtx {
  return { signal, importId: null, log: { event: () => {} } };
}

function redirectResponse(location: string | null, status = 301): Response {
  const headers = new Headers();
  if (location !== null) headers.set('location', location);
  return new Response(null, { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveShortLink', () => {
  const link: ClassifiedShortLink = { kind: 'short_link', code: 'ZMrRs9oPp', host: 'vm.tiktok.com' };

  it('resolves the video id from the first hop (04 §2 step 4, VERIFIED chain shape)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        redirectResponse(
          'https://m.tiktok.com/v/7290074173500706079.html?_d=1&share_item_id=7290074173500706079',
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveShortLink(link, ctx());
    expect(result.externalId).toBe('7290074173500706079');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a second hop when the id is not present until the @/video form', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://www.tiktok.com/somewhere-without-an-id'))
      .mockResolvedValueOnce(redirectResponse('https://www.tiktok.com/@/video/7290074173500706079?_r=1'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveShortLink(link, ctx());
    expect(result.externalId).toBe('7290074173500706079');
  });

  it('throws SHORT_LINK_UNRESOLVED for the homepage-trap dead code (VERIFIED: 302 to homepage, HTTP 200 body never reached)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(redirectResponse('https://www.tiktok.com/?_r=1', 302));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveShortLink(link, ctx())).rejects.toMatchObject({ code: 'SHORT_LINK_UNRESOLVED' });
  });

  it('throws SHORT_LINK_UNRESOLVED when a Location redirects off the TikTok allow-list (SSRF gate)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirectResponse('https://evil.example.com/steal')));

    await expect(resolveShortLink(link, ctx())).rejects.toMatchObject({ code: 'SHORT_LINK_UNRESOLVED' });
  });

  it('throws SHORT_LINK_UNRESOLVED when there is no Location header at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirectResponse(null, 200)));

    await expect(resolveShortLink(link, ctx())).rejects.toMatchObject({ code: 'SHORT_LINK_UNRESOLVED' });
  });

  it('maps an aborted signal to UPSTREAM_TIMEOUT', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      }),
    );

    await expect(resolveShortLink(link, ctx(controller.signal))).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
  });
});
