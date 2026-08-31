# E2-T4 — reading the cover frame: measured, and not shipped

Date: **2026-08-31** · Task E2-T4 · **VERIFIED negative, n=16 posts** · Code written, measured, reverted

## The verdict

**The cover frame added zero wrong candidates and did not reliably add right ones. 10 candidates
before, 10 after.** `@yallabikestlv`'s `Pizza Lila` — the single clearest win available, a venue
printed on the frame and absent from the caption — recovered on **1 run in 3**.

The change is reverted. `EXTRACTION_SCHEMA_VERSION` and `PROMPT_VERSION` are back at `5` / `p15-s5`.

## Why it was worth building anyway

The hypothesis was good and the prior evidence was ambiguous rather than settled. `thumbnail_url`
delivers **1080×1920** and we already fetch it — no new access, no terms question, no key. The
2026-08-28 run measured naive OCR on that frame at **1/8 recall with false positives**, offering
`Rama Hair & Be` and `Ersimes Organic & Her` — two Brixton shopfronts — as restaurant
recommendations. That refuted *OCR reading an image alone for names*. It did not test **the frame
read in context with the caption, by the model that also does the extraction**, which is a
different experiment with a different failure mode.

So it was tested properly. It failed properly.

## The result that is worth keeping

**Reading the frame in context did fix the false-positive problem.** The same Brixton frame that
produced two shopfronts under naive OCR produced **no frame candidate at all**. The model, given
the caption as context, correctly declined to treat background signage as a recommendation.

**It just found nothing either.** And that is the finding: **a cover frame is a title card**, and a
title card is where the creator writes the hook — *"6 Must Try Spots in Tokyo"*, *"BEST COFFEE SHOPS
IN TEL AVIV"*. By construction it is the one frame that withholds the answer, because withholding it
is what makes you keep watching.

## The cost, measured — and this is the argument the first version of this file was missing

From Gemini's own `usageMetadata` across all 16 posts, not estimated:

| | input tokens per call |
|---|---|
| `p15`, text only | 7,434 |
| `p16` with a frame attached | **8,481** |

**≈ +2,250 tokens per import against `p15`, about +35%** — and it is charged on **every** import,
including the ~73% that find nothing and the ones with no frame worth reading.

**More than half of that increase is text, not image.** The frame itself is ≈ +1,000 tokens; the
prompt rules written to make it *safe* — the overlay-versus-scenery distinction, the provenance
field, the "a title card is not a recommendation" guidance — are ≈ +1,250, and the system prompt
grew 20% (23,098 → 27,646 characters) to carry them.

That is the shape of the whole result: **the safety instructions cost more than the signal was
worth.** A capability that needs a fifth of the prompt to keep it from inventing places, and then
finds nothing, is not a capability worth its tokens.

It cannot be converted to dollars here: `GEMINI_FLASH_LITE_PRICE_PER_1M` is undefined in this repo
and `cost.ts` logs `costModel: "unmeasured"` for this model. The token count is the honest unit.

## The one thing that did work, and it is worth keeping in mind

`@muchmorethanmatcha`'s `Cafe Fiori` moved from evidence source `caption` to **`both`** — the
caption named it and the frame **corroborated** it (`frameText: "CAFE FIORI"`). That is the best
possible outcome for a candidate and it changed no band. Corroboration, not discovery, is what a
cover frame is actually good for — and this corpus had exactly one opportunity for it.

## Why it was reverted rather than kept behind a flag

The change cost a `ContentPart` union, a `frameText` field, a schema version bump, a prompt version
bump, and **three extra rungs in the stored-candidate parse ladder** — the last of which surfaced a
real hazard while being built: with `frameText` required, every stored row from v1, v2, v3 and v5
failed every rung, ending `invalid`, and `/api/imports/confirm` answers a 500 on such a row because
it looks a row up by a client-held id rather than by the cache key.

That tail is the cost of a schema field, and it is worth paying for a feature that works. Reverting
removes the whole class rather than fixing each instance.

## What it says about where to look

Compare, same corpus, same day: **TikTok's own auto-caption track nearly doubled candidates with
zero false positives** (`transcript-lift-2026-08-31.md`). The venue names are in the **speech**, not
on the cover. A creator says the name out loud and writes a hook on the frame.

If any part of this is salvaged later, it is the *classification* use rather than the extraction
one — a title card is a strong statement of what kind of post this is, and `postIntent` already
answers that question from the caption alone for a fortieth of a cent.
