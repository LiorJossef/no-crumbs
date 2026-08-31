# map/ — measurements behind shipped map changes

Two findings from 2026-08-31, both taken against **named commits** and both behind a change that
landed. Text and small JSON only: the frames these were computed from are hundreds of PNGs and are
**not** kept here — every number below is reproducible from the probe named in its document, at the
SHA named in its document.

| File | Finding | Commit it justifies |
|---|---|---|
| `night-sea-colourfulness-2026-08-31.md` | the night sea was the frame's largest source of colour, and why the fix had to be lightness | `e0c773b` |
| `list-scope-default-2026-08-31.md` | `3 places in Israel` over a street map of Tel Aviv — a default scope that disagreed with the machinery | `9634759` |
| `list-scope-heading-83b7489.json` / `-9634759.json` | the raw before/after of the heading probe | — |
