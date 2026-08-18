# E5 — Rate limits, latency, bot protection (VERIFIED)
Date: 2026-08-18 · from IL residential ISP IP 62.0.96.200

## Burst test
`for i in $(seq 1 40); do curl -sS -o /dev/null -w "%{http_code} " "$OEMBED_URL"; done`
-> **40/40 HTTP 200.** No 429, no degradation.

`seq 1 30 | xargs -P 30 -I{} curl -sS -o /dev/null -w "%{http_code} " "$OEMBED_URL"`
-> **30/30 HTTP 200** concurrently from one IP.

No `x-ratelimit-*`, no `retry-after` header present in any response.

## Latency (25 sequential runs, same URL)
`n=25 min=0.447 p50=0.511 p90=0.626 max=0.938` (seconds)
Cold/first call in the 16-URL run: 1.076s.
=> Budget **~600ms p90, 1.1s worst** for the source-fetch stage. Comfortably inside a Vercel
serverless invocation; still belongs in the async job per charter §3 invariant 5 (LLM + N geocodes
dominate, not this).

## Bot protection / gating — none observed
User-Agent variants all returned 200: `<absent>`, `node`, `curl/8.7.1`,
`Mozilla/5.0 (compatible; MyBot/1.0; +https://example.com)`, a full Chrome UA.
HTTP/1.1 forced: 200. No cookie required. No Referer required. No CAPTCHA, no JS challenge.

## Infrastructure
Served via Akamai in front of TikTok's `TLB`: `x-cache: TCP_MISS from a62-0-96-143.deploy.akamaitechnologies.com`,
`cache-control: max-age=0, no-cache, no-store`, `access-control-allow-origin: *`.
=> Responses are **not** CDN-cached, so every import is an origin hit. We should cache oEmbed
responses ourselves (charter R7 "cached source fetches").
`access-control-allow-origin: *` means this is intended as a public embed endpoint.

## Caveat
This is one IP in one country over one session. It does not prove absence of per-IP daily quotas,
and Vercel egress IPs are shared and much busier. See E6.
