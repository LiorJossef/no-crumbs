# E2-T5 — reading what the creator *said*

Date: **2026-08-31** · Harness: `tests/manual/transcript-lift.manual.ts` · Fixtures:
`tests/manual/fixtures/transcripts/` · **VERIFIED, n=6 posts**

> `RICH-EXT-1` (2026-08-28) concluded the transcript was **UNAVAILABLE**, and
> `08-engine2-access-surface` re-confirmed it for every *sanctioned* surface: the field exists
> (`voice_to_text`) and sits behind the Research API, which excludes commercial users. Both remain
> correct about the sanctioned routes. What follows is an **unsanctioned** route, opened on the
> owner's 2026-08-31 ruling that this is a university project without commercial or legal exposure.
> It must be disclosed as such in the submission; it is not a route a shipping product may take.

## The finding

**TikTok's own auto-generated caption track is retrievable as WebVTT**, via `yt-dlp` with the
mobile-API extractor arg. No ASR, no audio download, no model call — TikTok has already transcribed
the speech, with timestamps.

```
yt-dlp --write-subs --write-auto-subs --sub-langs all --skip-download \
       --extractor-args "tiktok:api_hostname=api22-normal-c-useast2a.tiktokv.com" <url>
```

The default extractor path **fails** (`Unable to extract universal data for rehydration`) on both the
released build and the nightly; only the mobile-API arg works.

## What it buys — the real extractor, caption vs caption+transcript

`ContentPart` has declared a `transcript` member since L0-F1 and nothing ever produced one. These
runs produce it.

| post | E7 class | caption only | + transcript |
|---|---|---|---|
| `@yallabikestlv` | recoverable | 0 | **1** — `Pita Lila` |
| `@gadderhq` | **futile** | 0 | **6–8** — Ishbela, Tokyo ICCO, Jinsei Yakitori, John Balcom, hoppers, Bodega Negra |
| `@exploringlondon` | sufficient | 8 | 8 — unchanged |
| `@muchmorethanmatcha` | sufficient | 1 | 1 — unchanged |
| `@zachmargs` | control (comedy) | 0 | **0** |
| `@emshelx` | futile (name withheld) | 0 | **0** |

**Candidates 9 → 16–18. Zero false positives**: both controls stayed at zero, and neither
sufficient post gained noise.

### The class boundary was wrong, and that is the headline

`@gadderhq` is *"What's the best hidden gem restaurant in London?"* — filed by E7 as **`futile`**,
the answer nowhere. **The creator answers their own question out loud.** Three of those names
resolve to real London restaurants. A whole class this project had written off as unreachable is
partly reachable, and no amount of caption work would have found it.

## But only three of seven new candidates became places

| new candidate | resolved to |
|---|---|
| `Ishbela` | **Ishbilia Restaurant** (shortlist) |
| `hoppers` | **Hoppers Soho** (shortlist) |
| `Bodega Negra` | **LA BODEGA NEGRA** (shortlist) |
| `Pita Lila` | *unresolved* |
| `Tokyo ICCO` | *unresolved* |
| `Jinsei Yakitori` | *unresolved* |
| `John Balcom` | *unresolved* |

**The dominant failure is the auto-caption mangling a proper noun.** `Ishbela` for *Ishbilia*
survived because the scorer is fuzzy; `John Balcom` did not. This is the risk named in
`engine2-cost-model-2026-08-31.md` §9 before any transcript existed — *"a 20% error rate that turns
Simhovich into Simchovic is a total loss on the one token that mattered"* — now measured, in
English, on a real corpus.

`Pita Lila` is a real Tel Aviv venue and its failure is a resolver question, not a transcript one.
Worth one investigation.

## Limits, and they are not small

- **The route is throttled hard.** Roughly 35 requests over a few minutes and TikTok stopped
  answering — the error changed from an extraction failure to `Unexpected response from webpage
  request`. Viable for building a corpus once and caching it; **not viable as a live import path.**
- **6 of 16 posts** yielded a track in the requests that succeeded before throttling. That is a
  floor, not a coverage measurement — several "none" results were the throttle, not an absent track.
- **Non-deterministic.** `@gadderhq` produced 8 candidates on one run and 6 on the next.
- **English only here.** Every transcript retrieved was `eng-US`. The Hebrew case — the product's
  primary corpus — is unmeasured, and it is where proper-noun mangling will hurt most.
- One provider's ASR, one model, n=6.

## What this means for the engine

The ceiling this project has quoted all month — *the caption names a venue in 27% of posts* — is a
ceiling on **the caption**, not on the post. The speech contains venues the caption omits, in at
least two classes E7 counted as lost. Whether that is reachable in a shipping product is a separate
question with a different answer.
