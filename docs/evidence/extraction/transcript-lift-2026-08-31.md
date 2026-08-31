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

**CORRECTED, later the same day. Mangling was *not* the dominant failure, and the first version of
this section was wrong.** Scoring the four failures against their true names:

| heard | true name | nameScore |
|---|---|---|
| `Tokyo ICCO` | Tokyo Icco | **1.000** |
| `Jinsei Yakitori` | Jinsei Yakitori | **1.000** |
| `Pita Lila` | Pita Lila | **1.000** |
| `John Balcom` | — | 0.441 |

Three of four are **perfect**. Only `John Balcom` is a genuine mangle. So the transcript did its job
and the failures are downstream.

**And one of them was my own guard.** `Pita Lila` retrieved Google's **`Pizza Lila`** at score
**0.915** — the same venue; the creator says both names in one breath and the cover frame reads the
second — and `nameIsEstablished`, added hours earlier at a 0.85 floor, demoted it to `no_match`.
I had claimed that guard cost **zero** correct matches. That was true of the corpus it was measured
on and false on the first new data it met.

**The signal does not separate the classes.** Measured across everything we hold, the lowest
*correct* match scores **0.827** and the highest *wrong* one **0.830**. There is no threshold that
keeps every right answer and refuses every wrong one — the number chooses which error to make. The
floor is now **0.81**: above the clearest wrong match on the live path (`Kaosarn Tooting`, 0.804),
below `Pita Lila`. At that setting, across the seven adjudicated pairs, **2 wrong matches blocked,
0 correct lost**, and one wrong match (`TLV-08`, golden set, 0.830) returns to the band it occupied
before the guard existed.

`Jinsei Yakitori` and `Tokyo ICCO` fail for a different reason again: Google returns `Junsei` at
0.631 for the first, below the floor. That is retrieval, not scoring, and it is unfixed.

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
