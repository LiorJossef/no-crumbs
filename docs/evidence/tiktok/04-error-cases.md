# E4 — oEmbed failure responses (VERIFIED)
Date: 2026-08-18
Command: `curl -sS -w "|http=%{http_code}" "https://www.tiktok.com/oembed?url=<URL>"`

Every failure returns the **identical opaque body**:
```
{"message":"Something went wrong","code":400}     HTTP 400
```

Inputs that produced it:
| Input | HTTP |
|---|---|
| `/@tiktok/video/7000000000000000000` (well-formed, nonexistent id) | 400 |
| `/@x/video/7245648559981350187` (real id ±1) | 400 |
| `/@x/video/7220925199297039663` (real id ±1) | 400 |
| `/@x/video/7346702347491446040` (real id ±1) | 400 |
| `/@x/video/6800000000000000000` (old-range id) | 400 |
| `/@tiktok/video/1234567890` (too-short id) | 400 |
| `/@tiktok/video/abc` (non-numeric id) | 400 |
| `/@definitelynotarealuser999xyz` (profile URL, no video) | 400 |
| `https://www.instagram.com/p/abc/` (foreign host) | 400 |
| `https://example.com/` (arbitrary host) | 400 |
| `https://tiktok.com/@nom_life/video/<real id>` (**valid video**, missing `www.`) | 400 |
| `/@nom_life/photo/<real video id>` | 400 |
| oEmbed with no `url` param | 400 |

## The critical limitation
**oEmbed cannot distinguish deleted vs private vs region-locked vs age-restricted vs never-existed
vs malformed.** All collapse to one 400. Therefore:
- Our failure taxonomy must be derived from **our own URL validation + short-link resolution**
  BEFORE the oEmbed call. Anything that fails at oEmbed after passing validation is a single
  domain error (`POST_UNAVAILABLE`), and the UI must not claim a specific cause it cannot know.
- No retry/backoff signal is available either: a 400 is indistinguishable from a throttle. (No 429
  was ever observed — see E5.)

Not tested (no specimen available): a genuinely private post, a genuinely deleted-after-publish
post, a region-locked post. Requested from the project owner — see the test-set spec.
