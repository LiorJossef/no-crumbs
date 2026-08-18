# E2 — Which URL forms oEmbed accepts (VERIFIED)
Date: 2026-08-18. Command pattern:
`curl -sS -w " [http=%{http_code}]" "https://www.tiktok.com/oembed?url=<FORM>"`

Test id `7290074173500706079` (true author @petsmeowwoof) and `7220925199297039662` (@nom_life).

| URL form given to oEmbed | HTTP | Returned author |
|---|---|---|
| `https://www.tiktok.com/@petsmeowwoof/video/<id>` | 200 | petsmeowwoof |
| `https://www.tiktok.com/@/video/<id>` (empty handle) | 200 | petsmeowwoof |
| `https://www.tiktok.com/@x/video/<id>` (**wrong** handle) | 200 | petsmeowwoof |
| `https://www.tiktok.com/video/<id>` (no handle segment) | 200 | petsmeowwoof |
| `https://m.tiktok.com/v/<id>.html` | 200 | petsmeowwoof |
| `https://m.tiktok.com/@nom_life/video/<id>` | 200 | nom_life |
| `http://` (not https) | 200 | nom_life |
| `https://www.tiktok.com/en/@nom_life/video/<id>` (locale prefix) | 200 | nom_life |
| `?is_from_webapp=1&sender_device=pc&web_id=123` | 200 | nom_life |
| `?lang=en` | 200 | nom_life |
| `https://vm.tiktok.com/ZMrRs9oPp/` (short link) | 200 | petsmeowwoof |
| **`https://tiktok.com/...` (no `www.`)** | **400** | — |
| **`https://vt.tiktok.com/ZMrRs9oPp/`** | **400** | — |
| **`https://www.tiktok.com/t/ZMrRs9oPp/`** | **400** | — |
| **`https://www.tiktok.com/@nom_life/photo/<video-id>`** | **400** | — |
| `https://www.tiktok.com/embed/v2/<id>` | 400 | — |
| `https://www.tiktok.com/embed/<id>` | 400 | — |

## Conclusions
1. **oEmbed keys off the numeric video id and ignores the handle entirely.** The handle in a
   user-pasted URL is decorative and can be stale — see E7 (`@gadderapp` -> `@gadderhq`).
2. `www.` is mandatory. `vt.` and `/t/` are NOT accepted. => do not rely on oEmbed's short-link
   resolution; resolve short links ourselves and always submit
   `https://www.tiktok.com/@<handle-or-placeholder>/video/<id>`.
3. Tracking params and locale prefixes are harmless but should still be stripped for our own
   canonical/dedup form.
