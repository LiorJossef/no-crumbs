# Measurement — should `datasetConfidence` stay in the score blend?

**2026-08-28. Result: do NOT ship the full removal. The narrow proposal is safe but is a no-op for
the case that prompted it.**

This answers the measurement that
[`handoff-2026-08-28-categories-and-the-picker.md`](../../archive/handoff-2026-08-28-categories-and-the-picker.md)
§3.3 says to re-run. **It does not need re-running.** That instruction is stale — it was written
while this was still in flight.

Simulation scripts imported the real, unmodified scoring primitives (`nameScore`, `categoryScore`,
`addressScore`, `confidenceOf`) and applied alternate blends externally. `scoring-constants.ts` and
`score.ts` were not touched. Scripts were scratch-only and are gone with the session; the numbers
below are the record.

## The three weightings

1. **BASELINE** — today: name 0.80 / category 0.10 / datasetConfidence 0.10.
2. **DROP** — the term removed, remaining two renormalised `(0.8·n + 0.1·c) / 0.9`.
3. **DROP-UNPUBLISHED-ONLY** — renormalise only for a provider that publishes no confidence
   (Google); keep today's blend where the provider does publish (Overture).

## False auto-accepts — the number that decides it

| Weighting | Golden (44 cases) | Live Overture | Live Google |
|---|---|---|---|
| BASELINE | 0 | 0 | 0 |
| **DROP** | **1 — `TYO-10`** | 0 | 0 |
| DROP-UNPUBLISHED-ONLY | 0 | 0 | 0 |

**`TYO-10`**, query `むぎとオリーブ`. Under DROP a low-provenance duplicate Overture row — no branch
suffix, ~3 km from Ginza, recovered confidence 0.27 — beats the correct, well-attested Ginza branch
(confidence 0.993) at 1.000 vs 0.934, margin 0.061, and auto-accepts.

**The mechanism is identical to `TLV-14`**, which is how `band-policy.md`'s proposal died: a
wrong-but-plainer-named row escapes the extra-token penalty and wins once whatever was restraining
it is removed. This project already refused a change once at exactly this bar — one false accept on
the 44-case corpus. DROP does not get a looser bar.

## Band movement

**Golden file (44 cases):** BASELINE 29/11/4 → DROP 30/10/4 → DROP-UNPUBLISHED-ONLY **29/11/4,
zero cases move.** The narrow proposal is a mathematical no-op here, by its own rule: Overture
publishes confidence, so nothing changes.

**Live TLV, Overture:** DROP moves two cases into `preselect`, both adjudicated correct —
**`קוהי` → Kohi Coffee Shop** (0.9004 → 0.9520), the motivating case, and **Gelalucci**
(0.8668 → 0.9111). DROP-UNPUBLISHED-ONLY moves none.

**Live TLV, Google:** DROP and DROP-UNPUBLISHED-ONLY are identical (Google never publishes). Two
correct cases move `no_match` → `confirm`, i.e. out of the "no places found" screen. No wrong case
crosses into `preselect`.

Caveat on the live replay: the recorded run JSONs store the winner's raw inputs but **not the
runner-up's**, so top-1 scores are exactly replayable and new *margins* are not. Where a margin
mattered it was reported as a bound rather than invented.

## `TLV-14` — checked, and it is not the casualty this time

| Weighting | top-1 | score | margin | band |
|---|---|---|---|---|
| BASELINE | Bar 51 (correct) | 0.9000 | 0.0952 | confirm |
| DROP | Bar 51 | 0.8889 | 0.0800 | confirm |
| DROP-UNPUBLISHED-ONLY | Bar 51 | 0.9000 | 0.0952 | confirm |

It does not move under either proposal. Its top-1 was already correct under the shipped weights —
that was TLV-RANK-1's fix, not this one. The handoff flagged TLV-14 as the case to watch; the actual
casualty turned out to be `TYO-10`, by the same mechanism.

## Property 2 holds (a name alone must not reach 0.92)

Highest score achievable with **no** category match, across every row in the 44-case file:
BASELINE 0.9000, **DROP 0.8889**, DROP-UNPUBLISHED-ONLY 0.9000 — all below the 0.92 gate. DROP
actually tightens it slightly.

## Is `dataset_confidence` signal or noise?

Loaded `tlv` region, 10,462 rows: min 0.043, median 0.754, mean 0.709, max 0.9996; **18.8% below
0.5, 6.4% below 0.3.** The histogram rises roughly monotonically into the top decile — **a single
skewed distribution, not bimodal.** There is no separated junk cluster.

That is more consistent with "Overture's own attestation signal about the row" than with "a
junk-detector". And the one case-level data point we have runs against the "low means wrong"
reading: **Kohi Coffee Shop — a real venue, correctly matched, exact address — sits at 0.295, the
bottom ~6th percentile.**

**No measurement exists anywhere in this repo correlating `dataset_confidence` with a row being
*correct for a query*,** as opposed to being well-attested. Searched `docs/`, `scoring-constants.ts`,
`06`/`10`/`11` and the evidence files. That gap is the real reason the term's 10% weight is
unjustified — but "unjustified" is not the same as "safe to delete", which is what `TYO-10` shows.

## What this means for the picker work

- **Do not ship DROP** as specified.
- **DROP-UNPUBLISHED-ONLY is safe and nearly pointless**: zero false accepts anywhere, and zero
  effect on the Overture path, which is the path the motivating case is on and the path production
  is gated to. It only helps Google, which is gated off production by the ToS sequencing anyway.
- **Neither is the answer to the owner's ruling.** What `TLV-14` and `TYO-10` have in common is the
  real target: a low-information duplicate row name-matching a real venue's shorter or plainer
  sibling, and nothing in the scorer distinguishing "same venue, different branch" from "different
  venue, similar name". That is a scoring-mechanism gap and a shortlist-collapsing question, not a
  weight change — which is exactly what the owner's framing said it would be.
