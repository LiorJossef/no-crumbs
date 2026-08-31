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
| `thumbnail_url` | string | signed tiktokcdn URL; **`x-expires` is ≈ 48 h out — see the correction below.** This row read *"≈ 6 months"* from 2026-08-18 until 2026-08-31 and was **wrong when written** |
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


---

## CORRECTION, 2026-08-31 — the `x-expires` window is ~48 hours, and this file was wrong when written

**Re-derived twice, independently, from two different sources.**

Live, today, two posts fetched fresh:

```
x-expires=1788382800  ->  2026-09-02T21:00:00Z   window = 47.22 h
x-expires=1788382800  ->  2026-09-02T21:00:00Z   window = 47.22 h
```

Both carry the **same** value, landing on a round UTC hour — the signature of a globally bucketed
signing window, not a per-URL lifetime.

**And it was always this.** `oembed-set1-raw.json`, the committed capture this file was written
from on 2026-08-18, carries a single distinct value across all sixteen posts:

```
x-expires=1787212800  ->  2026-08-20T08:00:00Z
```

Two days after the capture date. **So TikTok did not change the window: the original reading of
this file's own raw data was wrong**, by a factor of about ninety. That distinction was worth
establishing rather than assuming, because a re-grade and a method defect have different
consequences — and this is the second kind. Any other number in this evidence set derived the same
way deserves the same re-derivation.

### What was built on it

- `supabase/migrations/0003_sources.sql:28` states *"Signed, ~6-month-expiring CDN URL (VERIFIED)"*
  and cites this file. The claim is false. **Flagged for `supabase-database` rather than edited
  here** — an applied migration is a historical record, and whether its comment may be corrected in
  place is that owner's ruling, not mine.
- `technical-design.md` decision 6 and `04-tiktok-feasibility.md` weigh *"hot-link a signed 6-month
  URL or copy the bytes."* At six months hot-linking is obviously right; **at 48 hours it is
  obviously wrong**, so that decision rests on a false premise and must be re-taken rather than
  inherited. Copying the bytes is a terms question for `security-privacy`.
- `docs/evidence/tiktok/08-engine2-access-surface-2026-08-31.md` repeated the six-month figure in
  three places, including inside a recommendation. Corrected there today.

### The live consequence, which is not theoretical

Every saved place stops having a picture roughly **two days** after it is saved, and has done since
the feature shipped. The place sheet hides a failed image for the life of that mount, so it fails
**silently** — it does not read as a broken image, it reads as the app having lost the thing. The
owner's own library is very likely already blank apart from the last 48 hours.

Found by the session working on thumbnail refresh, which re-derived the window from `x-expires`
against `fetched_at` on real rows and refused to build on the documented figure.
