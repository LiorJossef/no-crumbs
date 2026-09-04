# The rung I specified as cheapest, built and reverted

Date: **2026-09-01** · **VERIFIED negative, 4 prompt iterations, ~24 model calls** · Code reverted

## What was tried

`docs/engine-2-architecture.html` names this the cheapest rung on the ladder: *"the only one with no
compliance question at all — the person watching is the only source of the venue's name on the modal
outcome."* It was specified, costed at zero, and never built. This is building it.

The design: the import field already accepts free-form text (`extract-pasted-url.ts` pulls the link
out of a pasted share blob and discards the rest). Carry that remainder as a `ContentPart` of a new
kind `user-note`, hand it to the model beside the caption, and let a name the person typed become a
candidate.

## It does not work, across four iterations

| iteration | change | result |
|---|---|---|
| 1 | `user-note` part, prompt rule, adapter wiring | **0 candidates** on all three test captions |
| 2 | amended the `evidence` rule, which forbade it outright — *"if you cannot point to a verbatim fragment [of the caption], do not emit the candidate"* | **0** |
| 3 | moved the note **inside** the delimiter fence; rewrote the closing instruction, which said *"list the places **this caption** names"* and which the model was obeying exactly | **0** |
| 4 | reframed the system prompt's opening line, which reads *"You read one social-media caption"* | **0** |

Three real captions, each with the note a person who watched would plausibly type
(`"the bakery is called Pita Lila"`). Not one produced a candidate.

## What was learned, because two of these are real findings

**Iteration 2 found a rule that forbade the feature outright.** The prompt says a candidate's
`evidence` must be a verbatim fragment **of the caption**, and *"if you cannot point to a verbatim
fragment, do not emit the candidate."* A note-sourced name has no caption fragment, so the older
rule correctly suppressed it. Any future attempt has to amend that rule first, and also
`filterPlausible`, whose `evidenceFoundInCaption` check would drop the candidate a second time.

**Iteration 3 found that the closing instruction was doing the work, and that a test can hide it.**
The line *"List the real, findable places this caption names"* scoped the task to the caption, and
the model obeyed it literally while the note sat in the prompt being ignored. Worse, the test written
for this asserted the note was inside the fence **by counting delimiters** — and passed while the
note sat *outside* it, in the region the model reads as instructions. The test was rewritten to
assert position against the closing marker. **A prompt-plumbing test that counts rather than
locates is not a test.**

## Why it is reverted rather than kept behind a flag

The same standard applied to the cover frame two hours earlier: a seam whose producer does not work
is worse than no seam, because it ships a field that silently does nothing. The plumbing was small
and correct — a `ContentPart` kind, an adapter split, an optional `filterPlausible` parameter — and
none of it earns its place while the model ignores the input it carries.

**The signal is real** — unlike the cover frame, where the measurement showed the information simply
was not in the image. A person who watched the video does know the name. What failed is getting a
21,000-character, caption-centric system prompt to treat a second source as equal, and four
iterations was the honest budget for that inside one session.

## What a fifth attempt should do differently

Not another rule in the same prompt. The system prompt says "caption" dozens of times and every one
of them competes with the new instruction. The shape that has a chance is a **separate, small call**
whose entire job is the note — the note is short, the task is one question, and it needs none of the
hashtag, category, dish or bilingual machinery that makes the main prompt what it is. That is a
different design, not another iteration of this one.
