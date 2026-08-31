# Where the engine stands, measured

Date: **2026-09-01** · Final end-to-end run · 10 provider lookups · `p16-s5`

## The numbers

| | |
|---|---|
| `postIntent` accuracy | **15/16 (94%)**, zero nulls |
| Candidates extracted from 16 captions | **10** |
| Pre-selected | **5** |
| Shortlisted | **4 — every one correct** |
| Refused as `no_match` | **1 — `Kiaans Tooting` → `Kaosarn Tooting`, a different restaurant** |
| **Wrong options offered to a user** | **0** |
| Posts yielding a matched place | **3 of 16** (3 of 11 recommendation posts = **27%**) |

## The two numbers, and why only one of them moved today

**Engine recall: 100%.** Ten venues are nameable from these sixteen captions and the engine extracts
all ten (`engine-recall-2026-09-01.md`). The four things it does not extract are correct refusals —
a city six times, three hashtag spellings of one market, a chain hashtag — and two of those refusals
are fixed defects rather than misses.

**Product recall: 27%, unchanged.** Because it is not a property of the engine. Thirteen of sixteen
captions name no venue at all, and no amount of work on extraction reaches a name that was never
written down.

Every improvement today moved precision, honesty or reach-per-input. **None of them could move 27%,
because the ceiling is the input.**

## What was tried against that ceiling, and what each returned

| lever | result | shipped? |
|---|---|---|
| **The cover frame** | **No signal.** 10 candidates before, 10 after. +35% input tokens, more than half of it the safety rules rather than the image | **no — reverted** |
| **The transcript** | **40% → 80%** on posts that have one. `@gadderhq` alone: 0 → 4 matched London venues | **blocked** — TikTok refuses after ~35 requests |
| **The importer's note** | **1 of 5 → 3 of 5**, zero invented on two controls. Reaches `@emshelx`, which nothing else can | **yes** |

## What changed in the engine itself today

- **`nameIsEstablished`** — a wrong venue carried over the gate by an averaged token (`tooting`
  covering for `kiaans`) is now refused. Validated on a held-out Hebrew corpus it was not fitted to.
- **`compareAddress`** — an address that settles nothing may no longer subtract. A caption giving
  name, street and city was being demoted *for giving the address*.
- **`postIntent`** — the escalation gate goes from 0.38 to 0.83 precision at full recall, and a
  trailing question about a different city no longer reads as a question post.
- **The measurement itself** — a corpus, a grader and free offline replay, so none of the above has
  to be taken on trust again.

## The honest bound on all of it

**n = 16, and the sample is not the owner's.** These URLs were found by web search and the source
document says so about itself. Pooled with the 16-row adjudicated corpus, precision is **≥87% at 95%
confidence** — the first claim here that is not in-sample. Everything else waits on fifty of the
owner's own links, which `tests/manual/owner-corpus-links.txt` exists to receive.
