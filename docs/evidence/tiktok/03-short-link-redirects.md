# E3 — Short-link redirect behaviour (VERIFIED)
Date: 2026-08-18
Command: `curl -sS -o /dev/null -D - -L --max-redirs 5 -w "[http=%{http_code} redirects=%{num_redirects} final=%{url_effective}]" "<URL>"`

## Live code `ZMrRs9oPp` — identical on all three short forms
`https://vm.tiktok.com/ZMrRs9oPp/`, `https://vt.tiktok.com/ZMrRs9oPp/`, `https://www.tiktok.com/t/ZMrRs9oPp/`
all produce the same 2-hop chain:

```
301 -> https://m.tiktok.com/v/7290074173500706079.html?_d=...&share_item_id=7290074173500706079&...
301 -> https://www.tiktok.com/@/video/7290074173500706079?_r=1&_d=...
200
```

Findings:
- **vm. / vt. / /t/ share ONE code namespace.** Same code = same video on all three hosts.
- The **video id appears in hop 1** (`m.tiktok.com/v/<id>.html`) and in the `share_item_id` param.
  We never need to fetch the final HTML page — resolve with `redirect: 'manual'` and read the
  `Location` header. (No HTML is parsed anywhere in this design.)
- **The final URL carries an EMPTY handle: `/@/video/<id>`.** Short links do not reveal the creator.
  The handle must come from oEmbed's `author_unique_id`.
- Latency of the redirect chain: 1.0–2.5s (slower than oEmbed itself).

## Dead / invalid codes — the dangerous case
`https://vm.tiktok.com/ZMdYXsQLW`  -> `302 Location: https://www.tiktok.com/?_r=1` -> 200
`https://vt.tiktok.com/ZSBkhkwrt/` -> `302 Location: https://www.tiktok.com/?_r=1` -> 200

**An unresolvable short link 302s to the TikTok homepage with HTTP 200 — it does NOT 404.**
=> Resolution logic must treat "no `/video/<id>` or `/v/<id>.html` in any Location header" as
failure, never trust the status code.
