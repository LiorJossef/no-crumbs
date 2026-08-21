/**
 * The network-touching half of `04` §2 step 4 (`docs/evidence/tiktok/03-short-link-redirects.md`,
 * VERIFIED). `canonicaliseTikTokUrl` (L0-F1-T2) only *classifies* a `vm./vt./t/` short link; this
 * module actually follows it. L0-F4-T1.
 *
 * Evidence this file encodes:
 *  - `vm.`, `vt.` and `www.tiktok.com/t/` share ONE code namespace: same code, same video.
 *  - The video id is already in the FIRST hop's `Location` header
 *    (`https://m.tiktok.com/v/<id>.html?...`) — the redirect chain never needs to be fully
 *    followed, and no HTML is ever parsed.
 *  - **A dead/invalid code 302s to the TikTok homepage with HTTP 200 — it does not 404.** Status
 *    code is not a signal; only "did a `Location` header carry a video id" is.
 *  - Every `Location` header must be re-checked against `isAllowedTikTokHost` before it is
 *    trusted (`04` §2 step 4, `07` §7's SSRF requirement) — a compromised or malicious redirect
 *    target must not be dereferenced by a second, uncontrolled `fetch`.
 */
import { shortLinkUnresolved, upstreamTimeout, type DomainError } from '@/domain/errors';
import type { OpCtx } from '@/domain/ports';
import { isAllowedTikTokHost, type ClassifiedShortLink } from '@/domain/source/canonicalise-tiktok-url';

/** `04` §2 step 4's shared id-extraction surface: `m.tiktok.com/v/<id>.html` (hop 1) and
 *  `www.tiktok.com/@<handle-or-empty>/video/<id>` (a chain that resolves in one hop). Both are
 *  checked against every `Location` header seen, in order, so whichever hop the id appears in is
 *  found without assuming a fixed hop count. */
const VIDEO_ID_IN_PATH = /\/(?:v\/(\d{17,20})\.html|(?:@[^/]*\/)?video\/(\d{17,20}))/;

/** `04` §2 step 4's own hop budget: real chains observed were 2 hops; this leaves headroom
 *  without letting a redirect loop or an attacker-controlled chain run indefinitely (`07` §7). */
const MAX_HOPS = 5;

function extractVideoId(location: string): string | null {
  const match = VIDEO_ID_IN_PATH.exec(location);
  if (match === null) {
    return null;
  }
  return match[1] ?? match[2] ?? null;
}

/**
 * Follows a classified short link's redirect chain, `redirect: 'manual'`, re-applying the
 * allow-list to every `Location` header before it is dereferenced again. Resolves with the video
 * id the moment any hop's `Location` reveals one — never waits for the terminal 200.
 *
 * Throws only `DomainError`: `SHORT_LINK_UNRESOLVED` on exhaustion (hop budget, no `Location`, a
 * non-TikTok redirect target, or a chain that lands on 200 with no id in the last `Location`
 * seen — the dead-code case), `UPSTREAM_TIMEOUT` if `ctx.signal` aborts mid-chain.
 */
export async function resolveShortLink(
  link: ClassifiedShortLink,
  ctx: OpCtx,
): Promise<{ readonly externalId: string }> {
  let currentUrl = `https://${link.host}/${link.host === 'www.tiktok.com' ? `t/${link.code}` : link.code}`;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let response: Response;
    try {
      response = await fetch(currentUrl, { redirect: 'manual', signal: ctx.signal });
    } catch (e) {
      if (ctx.signal.aborted) {
        throw upstreamTimeout(undefined, e);
      }
      throw shortLinkUnresolvedFrom(e);
    }

    // A 200 with no further Location is either the terminal landing page (the dead-code homepage
    // trap, VERIFIED) or — in principle — a direct 200 on the short-link host itself. Neither
    // carries a video id we have not already checked, so this is exhaustion, not success.
    const location = response.headers.get('location');
    if (location === null) {
      throw shortLinkUnresolved();
    }

    const videoId = extractVideoId(location);
    if (videoId !== null) {
      return { externalId: videoId };
    }

    // No id yet — must be a same-namespace redirect we can keep following. Re-resolve the
    // Location against currentUrl (it may be relative) and re-apply the SSRF allow-list before
    // the next fetch call.
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch (e) {
      throw shortLinkUnresolvedFrom(e);
    }
    if (!isAllowedTikTokHost(nextUrl.hostname.toLowerCase())) {
      // A redirect target outside the TikTok allow-list is never dereferenced (SSRF gate). The
      // homepage-trap redirect (`https://www.tiktok.com/?_r=1`) is still an allowed host, so it
      // is not caught here — it falls through, gets fetched again, keeps producing no id, and is
      // caught by the hop budget below instead.
      throw shortLinkUnresolved();
    }
    currentUrl = nextUrl.toString();
  }

  throw shortLinkUnresolved();
}

function shortLinkUnresolvedFrom(cause: unknown): DomainError {
  return shortLinkUnresolved(undefined, cause);
}
