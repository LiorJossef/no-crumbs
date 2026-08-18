# E1 — TikTok oEmbed field inventory (VERIFIED)
Date: 2026-08-18 · Node v22.22.3, global `fetch`, server-side (no browser) · client IP 62.0.96.200 (IL, residential ISP)

Command: `node harness.mjs urls-set1.txt > oembed-set1-raw.json` (harness.mjs in this dir)
Raw: `oembed-set1-raw.json` (16/16 HTTP 200)

Endpoint: `GET https://www.tiktok.com/oembed?url=<url-encoded post URL>` — no auth, no API key, no headers required.

## Field set (identical across all 16 responses)
| Field | Type | Notes |
|---|---|---|
| `version` | "1.0" | constant |
| `type` | "video" | constant across the 16 (all were /video/ posts) |
| `title` | string | **THE CAPTION**, plain text, complete, hashtags + emoji preserved. Trailing space common. |
| `author_name` | string | display name |
| `author_unique_id` | string | **@handle, authoritative & current** — differs from the URL's handle when the creator renamed |
| `author_url` | string | `https://www.tiktok.com/@<handle>` |
| `embed_product_id` | string | **numeric video id** — echoes back the canonical id |
| `embed_type` | "video" | |
| `width`,`height` | "100%" | |
| `thumbnail_url` | string | signed tiktokcdn URL; `x-expires` observed ≈ 6 months out |
| `thumbnail_width/height` | number | e.g. 720x1280 |
| `html` | string | `<blockquote class="tiktok-embed">` + `<script src=".../embed.js">`; caption repeated with hashtags as `<a>` links; also carries the sound name (`♬ sunflower - owlh`) |
| `provider_name`/`provider_url` | "TikTok" | |

Absent: no post timestamp, no like/view counts, no location tag, no music id as a field (only inside `html`), no duration, no image count.

## Truncation test
Longest caption returned: **1229 chars / 1265 bytes** (`7346702347491446049`, @exploringlondon),
ending naturally on `#londonguide` with all 8 restaurant names intact. No `…` / `...` suffix on any
of the 16. Caption lengths observed: 27, 53, 73, 82, 83, 92, 108, 121, 127, 198, 203, 429, 455, 488, 543, 1229.
=> **No truncation up to 1229 chars (VERIFIED).** TikTok's current caption cap is ~2200 chars;
behaviour between 1229 and 2200 is ASSUMED-fine, untested.

## Method / param tolerance
| Variant | Result |
|---|---|
| `GET` | 200 |
| `HEAD` | **404** — must use GET |
| `?format=json` | 200 |
| `?format=xml` | 200 but **still JSON** (param ignored) |
| `?maxwidth=400` | 200 |
| no `url` param | 400 |
