# capture/ — evidence for OPP-CAPTURE (2026-08-27)

The question this directory answers: **is there any VERIFIED mechanism that shortens the path from
zero saved places to ~20?** (`00-project-charter.md` §2: "zero value at zero saved places and strong
value at ~20+"; today the only route is 20 sequential pastes at a ~27% hit rate.)

Investigated by `social-integration`, investigation only — no production code was written.

| File | What it holds |
|---|---|
| `01-tiktok-data-export.md` | The finding, its label, and the cost — the lead that matters |
| `02-web-share-target.md` | Whether the `mvp-plan.md` §8 "Not anywhere" placement is still right |
| `03-batch-and-alternatives.md` | Multi-link paste economics, and every other route considered |
| `raw/01-export-link-form.txt` | Live curl: export link host → redirect chain → oEmbed accept/reject |
| `raw/02-web-share-target.txt` | MDN BCD, WebKit's manifest parser source, WebKit standards position |
| `raw/03*, raw/04*` | TikTok's own Data Portability docs, tag-stripped, dated |
| `raw/05-tiktok-tos-row-prohibited-conduct.txt` | Verbatim ToS clauses, ROW terms |
| `raw/06-youtube-instagram-oembed.txt` | Live probe of both secondary platforms' oEmbed |
| `raw/07-export-json-schema-corroboration.txt` | 4 independent parsers agreeing on the export schema |

**Live third-party calls made: 7** (5 to `*.tiktok.com` / `tiktokv.com`, 1 YouTube, 1 Instagram),
plus documentation pages and GitHub raw files. Cap is 10.
