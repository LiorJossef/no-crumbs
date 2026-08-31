# The cheapest rung, working — on the second design

Date: **2026-09-01** · **VERIFIED, n=5** · `tests/manual/note-lift.manual.ts` · ~10 model calls

## Result

| post | caption | + note | the note typed |
|---|---|---|---|
| `@yallabikestlv` | 0 | **1 — `Pita Lila`** | *"the bakery is called Pita Lila"* |
| `@emshelx` | 0 | **1 — `Bocca di Lupo`** | *"he never says it but the sign said Bocca di Lupo"* |
| `@sivanskitchen` *(the owner's link)* | 1 — `שוק הכרמל` | **1 — `Roladin`** | *"the donut stall in the shuk, Roladin"* |
| control — a note with no name | 0 | **0** | *"it was really nice, we sat outside"* |
| control — a bare city | 0 | **0** | *"somewhere in tel aviv"* |

**Posts yielding a candidate: 1 of 5 → 3 of 5. Candidates 1 → 4. Zero invented on either control.**

`@emshelx` is the significant one. E7 filed it **`futile`** — *"the name deliberately withheld to
drive comments"* — and every other rung on the ladder agrees it is unreachable: the caption does not
name it, the cover frame does not, and the transcript does not either, because the creator withholds
it in the audio too. **A person who watched it knows.** This is the only mechanism in the whole
design that reaches that class, and it costs one small model call.

## Why it took two designs, and the finding is the shape not the wording

The first attempt put a rule in the main prompt. Four iterations, **zero** candidates every time
(`user-note-attempt-2026-09-01.md`). `SYSTEM_PROMPT` is ~21,000 characters that say "caption"
dozens of times, opens *"You read one social-media caption"*, and requires `evidence` to be a
verbatim fragment **of the caption** or the candidate must not be emitted. A note rule inside that
competes with all of it and loses.

The same model, given a fifteen-line prompt whose only job is the note, reads it perfectly. **The fix
was the shape of the call, not the wording of a rule** — a long prompt is not a place to add a
second task.

## The bug that cost an afternoon, recorded because it is invisible

The module returned nothing while the identical prompt worked by hand. The prompt asks for
`{"places":[...]}`; **the model returns a bare array.** The wrapper read `.places` off it, got
`undefined`, and returned `[]` — silently, with a 200 and a well-formed reply.

**Asking for a shape is not the same as getting it.** The parser now accepts both and a test pins the
bare-array case.

## What it is not

Not a general extractor: no hashtag rules, no taxonomy, no bilingual variants, no dishes, no
`whyGo`. A note is a sentence a person typed and none of that applies. It answers one question.

The note is untrusted input like any other — fenced with a per-call delimiter, and the model is told
it is data. It is our own user rather than the creator, which makes it more reliable about *intent*
and no safer as input. Every name it returns must quote the note verbatim, checked in code rather
than requested in the prompt.

## Not yet wired to a user

This is the domain and integration half. **The import field does not collect a note yet** — the UI
belongs to a lane another session is working in, and `extract-pasted-url.ts` currently discards
everything around the link. The measurement above passes the note directly.

Wiring is one text field and one request property. Given what it reaches, it is the highest-value
UI change on the board.
