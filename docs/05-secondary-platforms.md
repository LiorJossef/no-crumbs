# 05 — Secondary Platforms (D1b)

> Owner: Social Platform Integration + Product Lead. Date: **2026-08-18**. Status: **DECIDED — both deferred.**
> Resolves charter §8 **D1b** (Instagram / YouTube status for V1).
> Labels: **VERIFIED** = tested with committed evidence · **ASSUMED** = researched, untested ·
> **UNAVAILABLE** = confirmed not possible · **NOT INVESTIGATED** = we deliberately spent no time on it.

## 0. The ruling in one paragraph

**Instagram and YouTube are both out of V1.** Neither is cut permanently — both re-enter through the
`SourceAdapter` seam that already exists in [`07-import-execution-model.md`](07-import-execution-model.md)
§10 — but neither is investigated, scoped, or scheduled before submission. This is a **schedule
decision first and a technical one second**: `02-risks-and-unknowns.md` §R0 leaves 19 days, and
`product-specification.md` §8.1 makes "any second source platform" cut line #1, the very first thing to
go under pressure. Deciding it now, in advance and in writing, converts an ongoing temptation into a
closed question — which is the entire point of recording it.

**This document is a record of a ruling, not an investigation.** Everything below labelled ASSUMED comes
from desk research and is explicitly *not* evidence in the sense charter §9 requires. If either platform
is ever picked up, the first task is a spike with the same rigour as
[`04-tiktok-feasibility.md`](04-tiktok-feasibility.md) — a committed harness, real URLs, and a verdict.

## 1. Why the platform count is subordinate

Charter §4 states it directly: *"Quality of TikTok support outranks platform count."* Three things make
that more than a slogan here:

1. **The measured ceiling is on extraction, not on platforms.** `04` §4 found that only ~27% of genuine
   recommendation TikToks name a resolvable venue in text. Adding Instagram would add a second source of
   the *same* problem — more posts we can read, the same share of them naming nothing. Platform breadth
   does not move the number that limits the product.
2. **Every platform multiplies the surface that must be tested.** A second adapter means a second URL
   canonicalisation table, a second set of hostile-host cases, a second error taxonomy mapping, a second
   set of golden URLs. QA cost scales with platforms, not with lines of code.
3. **A half-working second platform is worse than none.** The demo question "does it work with
   Instagram?" is answered better by "no, deliberately — TikTok is done properly" than by "sometimes."

## 2. Instagram — Deferred (post-V1)

**Status: DEFERRED. Not investigated.**

What we believe without having tested it, all **ASSUMED**:

- Instagram's public oEmbed endpoint was restricted years ago and now sits behind the Facebook Graph
  API with an app, an app review, and a business verification. Under `02` §R0's rule — anything
  requiring an application, an app review, or a business verification is *effectively unavailable* —
  that alone disqualifies it for a 19-day project regardless of what it would eventually permit.
- The `oEmbed Read` and Instagram Graph paths that do exist are scoped to content the authenticated
  business account owns, which is the same shape of failure that made TikTok's Display API
  UNAVAILABLE (`04` §M3): they read *your* posts, and the product needs to read *anyone's*.
- Reels captions, where they are reachable at all, would face the identical caption-gap problem
  measured for TikTok, plausibly worse — Reels culture pushes the venue name on-screen at least as hard.

**Re-entry condition** (from `product-specification.md` §8): TikTok passing the §7.1 bar with days to
spare, **plus** a VERIFIED Instagram mechanism produced by a real spike. Both, not either.

## 3. YouTube — Deferred (post-V1)

**Status: DEFERRED. Not investigated.**

YouTube is the more interesting of the two and still does not make V1:

- **ASSUMED:** YouTube has a public, key-free oEmbed endpoint returning title and author, and the
  official Data API v3 exposes `snippet.description` for arbitrary public videos with a simple API key —
  no OAuth, no app review. On paper this is the *easiest* integration of the three platforms, and its
  descriptions are typically far longer and more list-like than a TikTok caption, which would suit
  extraction well.
- The problem is not feasibility, it is **fit and cost-of-proof**. The product's premise
  (`00-project-charter.md` §2) is the recommendation graveyard inside TikTok's saved list. A YouTube
  video description is not that artefact. Adding it would broaden the demo without deepening the
  product, and it would still owe the full evidence pack — canonicalisation across `youtu.be`,
  `/shorts/`, `/watch?v=`, timestamps and playlist parameters; a quota model; a golden set; error
  mapping; and its own tests.
- Charter §4 already sets the bar: YouTube is justified **only if it is nearly free** behind the same
  seam. "Nearly free" has a number attached in `product-specification.md` §8: a measured **under half a
  day**, once the seam exists and TikTok is green.

**Re-entry condition:** the seam is in place, TikTok is green against §7.1, the schedule has genuine
slack, and a timed spike lands the whole integration — adapter, canonicalisation, tests, golden URLs —
in under half a day. Anything over that and it is post-V1 by definition.

## 4. What V1 must still do about them

Deferred is not the same as unplanned. Three obligations survive into V1, and all three are already
paid for:

| Obligation | Where it lives | Cost today |
|---|---|---|
| The `SourceAdapter` seam stays honest — one platform, but the interface is not TikTok-shaped | `07` §10 (`canHandle(url)`, `platform` field, `RawSource` with `texts[]` and `media[]`) | Zero. It is already written that way |
| The schema does not assume TikTok | `08` §1.5 — `sources.platform` is a column and the source key is `tiktok:video:<id>`, a namespaced form | Zero |
| The UI says what it supports, plainly | UX copy: a pasted Instagram or YouTube URL fails at the canonicaliser with `UNSUPPORTED_HOST` and the honest message "We support TikTok links" (`07` §9) | Already in the error taxonomy |

The last row matters more than it looks. The failure mode we are buying protection against is a user
pasting an Instagram link and getting a generic error — which reads as broken. Getting a specific,
truthful sentence reads as a product with a boundary.

## 5. What is not deferred — it is cut

For completeness, so nobody reopens these as "secondary platforms": screenshot import, share-sheet
capture, PWA share targets, and any browser extension are **cut**, not deferred
(`product-specification.md` §8, `00-project-charter.md` §4). They are not source platforms; they are
alternative capture mechanisms, and the charter's ruling on the mobile flow (`02` §D4) already covers
why. Video, audio and OCR analysis is separately **deferred with the seam kept open** — that is
`ContentExtractor`, not `SourceAdapter`, and its status lives in `security.md` §2, defaulted OFF.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-18 | Created. D1b closed: Instagram and YouTube both Deferred post-V1, with re-entry conditions. No investigation performed, by design |
