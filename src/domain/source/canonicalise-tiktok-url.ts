/**
 * `canonicaliseTikTokUrl` — the pure, table-driven implementation of `04` §2, and the SSRF
 * boundary for the whole import pipeline (`07` §7's Q1, `07` §10's "Zod at every boundary" rule 1).
 * L0-F1-T2.
 *
 * Rules this file obeys:
 *  - **Pure. No network, no DOM, no `fetch`.** Enforced by `eslint.config.mjs`'s domain zone and
 *    restated here: this module only parses the *string* the user pasted. It never dereferences a
 *    URL. That is why the short-link case (`04` §2 step 4) is a distinct success kind
 *    (`'short_link'`) rather than a resolved id — actually following the redirect chain is a
 *    network operation that belongs to a later, network-touching adapter
 *    (`integrations/tiktok/resolve-short-link.ts`, not yet built), which must re-apply
 *    `isAllowedTikTokHost` to every `Location` header it follows (`04` §2 step 4, `07` §7). Only
 *    that adapter can ever construct `SHORT_LINK_UNRESOLVED` — a pure function cannot know whether
 *    a code resolves without asking the network.
 *  - **Default-deny, allow-list only.** `isAllowedTikTokHost` is a closed five-host `Set` equality
 *    check, never a substring or suffix test. `tiktok.com.evil.io` and `nottiktok.com` fail for the
 *    same reason an unrecognised host does: they are not `===` to one of the five strings. There is
 *    no code path that could accidentally treat "ends with tiktok.com" as sufficient.
 *  - **Two distinguishable non-TikTok outcomes, not one.** `04` §5's own example copy for
 *    `UNSUPPORTED_HOST` ("We support TikTok links. Instagram and YouTube aren't supported yet.") is
 *    the tell: a URL that *parses* but whose host is not TikTok's — Instagram, YouTube, a spoofed
 *    look-alike, anything — is `UNSUPPORTED_HOST`, "a recognised link, just not one we read".
 *    Input that does not even parse as an absolute `http(s)` URL is `MALFORMED_URL`, "not a link at
 *    all". These are already two different codes in the closed 14-code union
 *    (`domain/errors.ts`); this file's job is routing into the right one, not inventing a third.
 *    `brand-and-product-foundation.md` §1's manual-add redirect is exactly `UNSUPPORTED_HOST`'s UI
 *    state; `MALFORMED_URL`'s is inline validation copy (`07` §9).
 */

import {
  malformedUrl,
  photoPost,
  unsupportedHost,
  unsupportedUrl,
  type DomainError,
} from '../errors';

/** `04` §2 step 1: full-host equality, never a suffix or substring match. Exported so the future
 *  short-link adapter can re-apply exactly this gate to every redirect `Location` it follows —
 *  one allow-list, two call sites, never a re-typed copy that could drift. */
export const TIKTOK_HOSTS: ReadonlySet<string> = new Set([
  'www.tiktok.com',
  'tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
]);

/** `04` §2 step 1's SSRF gate, standalone and reusable. `hostname` must already be lower-cased —
 *  the WHATWG `URL` parser lower-cases `hostname` per spec, so callers passing `new URL(x).hostname`
 *  get this for free. Equality only: `'tiktok.com.evil.io'` and `'nottiktok.com'` are not members of
 *  `TIKTOK_HOSTS` and this returns `false` for both, by construction rather than by pattern-craft. */
export function isAllowedTikTokHost(hostname: string): boolean {
  return TIKTOK_HOSTS.has(hostname);
}

/** `^\d{17,20}$` — every observed real TikTok video id is 19 digits; `04` §2 step 3 widens the
 *  band slightly rather than hard-coding 19. */
const VIDEO_ID = /^\d{17,20}$/;

/** `04` §2 step 2: a leading locale segment, e.g. `en`, `en-US`, stripped during normalisation. */
const LOCALE_SEGMENT = /^[a-z]{2}(-[A-Za-z]{2})?$/;

/** `04` §2 step 4: the shared code namespace for `vm.`, `vt.` and `www.tiktok.com/t/`. */
const SHORT_CODE = /^[A-Za-z0-9]{6,20}$/;

const UNSUPPORTED_TOP_LEVEL_PATHS: ReadonlySet<string> = new Set([
  'tag',
  'music',
  'discover',
  'live',
  'channel',
]);

/** A resolvable TikTok video or photo post. `kind` stays `'video'` for a photo-post *shape* only
 *  until it is rejected as `PHOTO_POST` — a genuine photo post never reaches this type, it becomes
 *  an error result instead (see `photoPost` below). */
export interface CanonicalVideo {
  readonly kind: 'video';
  readonly externalId: string;
}

/**
 * `04` §2 step 4's short-link case, classified but **not resolved** — see the file header. The
 * host is kept because the id-extraction regexes step 4 specifies differ only by which host they
 * came through in the adapter's own logging, never in this file's logic.
 */
export interface ClassifiedShortLink {
  readonly kind: 'short_link';
  readonly code: string;
  readonly host: 'vm.tiktok.com' | 'vt.tiktok.com' | 'www.tiktok.com';
}

export type CanonicaliseResult =
  | { readonly ok: true; readonly value: CanonicalVideo | ClassifiedShortLink }
  | { readonly ok: false; readonly error: DomainError };

function ok(value: CanonicalVideo | ClassifiedShortLink): CanonicaliseResult {
  return { ok: true, value };
}

function err(error: DomainError): CanonicaliseResult {
  return { ok: false, error };
}

/**
 * `04` §2's whole pipeline, steps 1–3 (step 4 is classified, not resolved — see the file header).
 * Never throws: every rejection is a `DomainError` carried in the `ok: false` branch, matching
 * `domain/ports.ts`'s "never throws for an expected outcome" convention.
 */
export function canonicaliseTikTokUrl(rawInput: string): CanonicaliseResult {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return err(malformedUrl());
  }

  // Step 1a — must parse as an absolute URL at all. Anything that does not is "not a link at
  // all" (MALFORMED_URL), never UNSUPPORTED_HOST: there is no host to recognise.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return err(malformedUrl());
  }

  // Step 1b — scheme. Only http/https are meaningful for a web link; anything else (a custom
  // scheme, `javascript:`, ...) is not a link we read either, and MALFORMED_URL is the honest
  // code: the string is not a supported kind of link, independent of any host.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return err(malformedUrl());
  }

  // Step 1c — no userinfo. `https://tiktok.com@evil.io/...` already resolves `evil.io` as the
  // host under WHATWG parsing (so the allow-list below would already reject it), but userinfo
  // handling is a known source of parser-to-parser disagreement, so it is rejected outright as a
  // defence-in-depth SSRF gate rather than trusted to fall through to the host check.
  if (url.username !== '' || url.password !== '') {
    return err(unsupportedHost());
  }

  // Step 1d — no explicit port.
  if (url.port !== '') {
    return err(unsupportedHost());
  }

  // Step 1e — no IP literals (IPv4 dotted-quad or bracketed IPv6).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.startsWith('[')) {
    return err(unsupportedHost());
  }

  // Step 1f — the allow-list itself. `URL#hostname` is already lower-cased per the WHATWG spec;
  // `toLowerCase()` here is belt-and-braces, not load-bearing.
  const hostname = url.hostname.toLowerCase();
  if (!isAllowedTikTokHost(hostname)) {
    return err(unsupportedHost());
  }

  // Step 2 — strip noise. The fragment and query string are simply never read below. Splitting
  // the pathname on '/' and dropping empty segments collapses duplicate slashes AND drops a
  // leading/trailing slash in one pass, so "//@a//video/1//" and "/@a/video/1" segment
  // identically.
  let segments = url.pathname.split('/').filter((s) => s.length > 0);

  // Only strip when a locale-shaped segment is *followed by* something else — every real
  // example (`/en/@user/video/<id>`) has a segment after it. A single bare two-letter segment
  // (e.g. an invalid, too-short short-link code that happens to look like a locale) is left
  // alone here and rejected on its own terms further down, rather than being swallowed into an
  // empty path and misreported as "no path at all".
  const first = segments[0];
  if (segments.length > 1 && first !== undefined && LOCALE_SEGMENT.test(first)) {
    segments = segments.slice(1);
  }

  return classifyPath(segments, hostname);
}

function classifyPath(segments: readonly string[], hostname: string): CanonicaliseResult {
  const [head, ...rest] = segments;

  if (head === undefined) {
    // A bare host with no path at all is not a post.
    return err(unsupportedUrl());
  }

  // `/@<handle>/video/<id>` and `/@<handle>/photo/<id>`.
  if (head.startsWith('@')) {
    if (rest.length === 0) {
      return err(unsupportedUrl()); // a profile is not a post
    }
    if (rest.length === 2 && rest[0] === 'video') {
      return videoOrMalformed(rest[1] as string);
    }
    if (rest.length === 2 && rest[0] === 'photo') {
      return err(photoPost());
    }
    return err(unsupportedUrl());
  }

  // `/video/<id>`.
  if (head === 'video' && rest.length === 1) {
    return videoOrMalformed(rest[0] as string);
  }

  // `/v/<id>.html` (the `m.tiktok.com` short-video form; matched regardless of which allowed
  // host it arrives on, since the allow-list has already run).
  if (head === 'v' && rest.length === 1 && (rest[0] as string).endsWith('.html')) {
    const id = (rest[0] as string).slice(0, -'.html'.length);
    return videoOrMalformed(id);
  }

  // `/embed/v2/<id>` and `/embed/<id>` — oEmbed rejects these forms verbatim, so they are
  // rewritten to `kind: 'video'` here and re-issued as a proper `/video/<id>` URL downstream.
  if (head === 'embed') {
    if (rest.length === 2 && rest[0] === 'v2') {
      return videoOrMalformed(rest[1] as string);
    }
    if (rest.length === 1) {
      return videoOrMalformed(rest[0] as string);
    }
    return err(unsupportedUrl());
  }

  // Short links: `vm.`/`vt.` + `/<code>`, or `www.tiktok.com/t/<code>`. Classified, not
  // resolved — see the file header. Each branch passes a literal host string rather than the
  // generic `hostname` parameter, so `ClassifiedShortLink.host`'s closed union needs no cast.
  if (hostname === 'vm.tiktok.com' && rest.length === 0) {
    return codeOrMalformed(head, 'vm.tiktok.com');
  }
  if (hostname === 'vt.tiktok.com' && rest.length === 0) {
    return codeOrMalformed(head, 'vt.tiktok.com');
  }
  if (hostname === 'www.tiktok.com' && head === 't' && rest.length === 1) {
    return codeOrMalformed(rest[0] as string, 'www.tiktok.com');
  }

  // `/tag/…`, `/music/…`, `/discover/…`, `/live`, `/channel/…`.
  if (UNSUPPORTED_TOP_LEVEL_PATHS.has(head)) {
    return err(unsupportedUrl());
  }

  // Anything else recognised-host-but-unrecognised-path (04 §2 step 3's "anything else" row).
  return err(unsupportedUrl());
}

function videoOrMalformed(id: string): CanonicaliseResult {
  return VIDEO_ID.test(id) ? ok({ kind: 'video', externalId: id }) : err(malformedUrl());
}

function codeOrMalformed(
  code: string,
  host: 'vm.tiktok.com' | 'vt.tiktok.com' | 'www.tiktok.com',
): CanonicaliseResult {
  return SHORT_CODE.test(code) ? ok({ kind: 'short_link', code, host }) : err(malformedUrl());
}
