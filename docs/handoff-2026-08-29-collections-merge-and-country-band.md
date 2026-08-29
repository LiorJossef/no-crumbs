# Handoff — landing collections, the country band's foundations, and a limiter

**Session: 2026-08-29, daytime. Branch: `main` (everything below is merged unless said otherwise).**
Started from `handoff-2026-08-30-collections.md`, whose §7 was already stale — the branch had been
pushed and PR #67 opened after it was written.

**Read `§1` and `§6` if you read nothing else.** §1 is what landed; §6 is what is open and risky.

---

## 1. What landed

| PR | What |
|---|---|
| #67 | Collections and shared collections, plus the overnight backlog sweep |
| #68 | `current-state.md` reconciled with reality |
| #69 | Country bucketing — the geography under the world-zoom country band |
| #70 | The no-places spec, and the live `Try another` bug it found |
| #71 | The country flag marker image |
| #72 | **OPEN** — the import rate limiter. Awaiting independent security review |
| #73 | **OPEN** — the collection camera fix for short viewports |

`main` is green: **1,465 unit tests**, build clean.

---

## 2. The collections camera defect, in two acts, because the second act is the lesson

`/collections/[id]` opened with **2 of its 3 pins framed underneath its own sheet**.
`mapOcclusionInsets` assumed every sub-`lg` surface rests at the 128 px peek stop; this one rests at
`0.55`. Fixed by making the resting occlusion a parameter (`8f9a1c4`, `60e915c`, both in #67).

**That fix was incomplete, and the way it was declared complete is the thing to carry forward.** It
was verified at 375×812, which passes, and shipped. An independent browser review then measured the
lowest pin **clipped at 640×360** and **~11 px under the sheet at 568×320** — real landscape phones.
The portrait margin that looked like a working design was 0.44 px, and it was a coincidence: the
clamp scales the sheet's own allowance down with everything else, so **no floor value fixes it.**

The real cause is upstream and is now #73: `fitBoundsPadding` charges every sub-`lg` surface 100 px
for floating top chrome, which is `/map`'s account chip. `/collections/[id]` has none — verified by
enumerating every visible element intersecting the top 160 px of its map container. That phantom
allowance was the entire overflow. With it declared away, clearance is **48 px at 375×812, 812×375,
640×360 and 568×320 alike**, where it had been +0.4, −3, −1 and −10.

**A live `/map` defect fell out of the same work.** The floor was lowered 96 → 48 to stop the clamp
eating the sheet; measured afterwards, the 96 px floor had been putting `/map`'s *own* lowest pin
6.3 px under its peek strip at 320 px of height. Nobody had measured it.

### Still open, pre-existing, and owned by nobody

**Rotating the viewport without a reload leaves the camera framed for the old size**, which puts
collection pins back under the sheet through a second door. It affects `/map` equally and predates
all of this: the `window.resize` handler fits against a transform MapLibre has not resized yet, then
our `ResizeObserver` early-returns because MapLibre's internal observer already matched the canvas to
the container. A 1 px nudge fixes the framing, which is the tell. Comments that claimed the
`ResizeObserver` handles orientation have been corrected to point at this instead.

---

## 3. The country band (your 2026-08-28 ruling) now has its foundations

Two of the three pieces of `ux-library-at-scale.md` §2 are on `main`. **Nothing imports either of
them, so there is no visible change anywhere in the product** — zoom out today and you get the same
mat of overlapping pins you got yesterday. `grep` for `bucketAreasByCountry` or
`buildCountryDiscImages` outside their own files returns nothing. Do not read "the country band
landed" into the two PRs below; what landed is its geography and its raster.

**The missing third piece, which is the whole visible feature:**

- the three zoom bands as declarative `minzoom`/`maxzoom` layers (§2.1) — MapLibre owns the swap, no
  zoom listener and no React state;
- `map.addImage()` for the flag discs, plus the count as a separate symbol layer (never baked into
  the image), and the area band's circle+label layers;
- the two taps (§2.4): a country eases to fit *its areas* at a zoom clamped inside the area band —
  you can never jump from a country to pins — and an area flies to its bounds and becomes the active
  area, through the existing writer rather than a new one;
- the `Elsewhere` list section grouped by country (§2.6), which is what makes the whole thing
  reachable by a screen reader, since the canvas is not.

**Geography (#69).** Areas bucket into countries by the *area's* country, not the place's.
Positions average as 3-D unit vectors, because averaging degrees puts two places either side of the
antimeridian in the Gulf of Guinea. A tie returns `null` rather than a winner.

Measured on the real library, and it is the evidence that §2.5's rule works:

```
places: 31   areas: 2   countries: 2
  GB   18 places   centroid 51.485,-0.124   (London)
  IL   13 places   centroid 32.070,34.772   (Tel Aviv-Yafo)
```

The database holds `IL 11` and `2 NULL`. The buckets read `IL 13` because the two country-less rows
sit inside the Tel Aviv area and inherit it. 18 + 13 = 31: no place disappears, none is guessed at
individually.

**The marker image (#71).** A canvas-drawn flag disc, with the two-letter code as the fallback. The
two reasons a flag cannot be map text were checked against the installed MapLibre 6.4.1 rather than
taken on trust — single-channel alpha atlas, and no ligature pass for a regional-indicator pair — and
a third turned up: the glyph manager would request range 497, which no glyph endpoint serves. The
fallback decision is made once per document by drawing one flag and checking both ligation and
self-colour; every way it can fail lands on the code, never on tofu.

Known and unfixed, both pre-existing: the mint ring is the same value on dark as on light (the dark
ramp is still an unsigned first pass), and the fallback reads `GB` where §2.6's table would say
"United Kingdom".

---

## 4. Import: one live bug fixed, one screen still missing

**`Try another TikTok` handed back the link that had just failed** (#70). On the zero-candidate
screen that is the flow's worst loop: the caption was read, there was nothing in it, and the most
prominent action reloaded the same link to produce the same screen. `import-error-copy.ts:54`
already stated the contract — "returns to F0 with an empty, focused field" — and the code did not
honour it, which is what makes this a bug rather than a design change. `Cancel` still deliberately
keeps the link; that distinction is now written down rather than implied.

**`NoPlacesScreen` is dead code.** `kind: 'no_places'` is declared and rendered but never set
anywhere, so the modal import outcome falls through to the generic failure screen. The spec is
`docs/spec-no-places-found.md`; building it is the highest-value thing left that costs no quota.

Two things the spec found that make it cheaper than expected: `filterPlausible` already computes
"the caption named nothing" versus "we filtered everything out" and the route throws half of it
away, so an honest two-case screen needs no new extraction work; and `NO_CAPTION`'s copy-map entry
appears to be dead.

---

## 5. The limiter (#72, open)

`/api/imports/probe` and `/api/imports/confirm` have never had a rate limit, and `rateLimitedLocal`
has claimed since it was written that the route checks one. Postgres-backed sliding-window log, four
scopes, fail-closed, zero policies and zero privileges on the table for every role including
`service_role`. 14 assertions, 7 sabotage-tested.

**The routes are not wired.** That is the next step and it needs whoever does it to work out the
real per-run `llmCalls` / `placeCalls`; passing a guess corrupts the ceiling.

---

## 6. Open, and what needs the owner

### Needs a decision

1. **Google Places is 100/day for the whole product, so the limiter admits ~11 fresh uncached
   imports per day, globally, for everybody.** A per-user limit cannot fix this: at 30/day one user
   exhausts everyone's quota on their fourth import, which is why the ceilings are global. Either
   raise the quota or accept the number. Changing it afterwards is a three-line migration. **This
   bites the moment production is usable and anyone else touches it.**
2. **A global refusal has no honest copy.** `RATE_LIMITED_LOCAL` says "give it a few minutes"; a
   global block can be a 20-hour wait and the user did nothing wrong. Needs its own code or
   conditional copy.
3. **The product name.** Still `Your saved places, on one map` as a placeholder in `<title>`, and
   the codename is still a visible label in `src/app/page.tsx`.
4. **Anthropic or Gemini for production imports.** Unset bills Anthropic at ~$0.0075 per import;
   `LLM_PROVIDER=gemini` uses the quota'd free path. It changes who receives caption text, so it is
   not a default to drift into.

### Production, still down, deliberately deferred to 2026-08-30

Production serves `main` and **500s for every signed-in user** — and it is worse than that phrasing
suggests: `createClient` throws inside the sign-in submit handler, so **nobody can sign in at all**.
The cause is an empty env store, not any code on `main`.

Four variables restore it: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both
build-time, so a fresh build is required — promoting an existing deployment will not pick them up),
`SUPABASE_SERVICE_ROLE_KEY`, and one model key. Do **not** set `NEXT_PUBLIC_STAGE` or
`NEXT_PUBLIC_COMMIT_SHA` — they are derived correctly from `VERCEL_*` and setting the first wrong
flips the resolver gate.

**Order matters: env vars → push migrations → redeploy.** Production's database is at `0023` and
`main` now needs `0024`–`0026`, plus `0027` when #72 lands. Migrations last gives a fresh 500 for a
new reason. `/healthz` returns `ok: true` throughout all of this and always has; it reads no
configuration at all.

### Left alone

The 24 null `source_url` rows (their own migration), ownership transfer before account deletion, the
`0021`/`0022`/`0023` local ledger gap, and everything that spends quota.

---

## 7. How this session was run, and one thing to do differently

Seven specialists. Most of the findings above came from them disagreeing with the plan: the
adversarial reviewer refuted a fix that had already been declared done, the database specialist
found its own test passing vacuously because an `exception when others` handler was catching its own
failure raise, and the frontend specialist measured its first flag-fitting approach as visibly wrong
and replaced it.

**The mistake worth not repeating: four agents and the orchestrator were writing to one working
tree, and branches were switched underneath a running agent.** Nothing was lost, because their file
scopes were nearly disjoint and staging was explicit — but `npm run verify` was unreadable for a
stretch, one agent's in-progress work was committed as if finished (`8f9a1c4`, the 96 px floor it
then measured as wrong), and two agents correctly refused to create branches at all. Serialise
anything sharing a path, or give each agent its own worktree.

**A local artefact to expect:** the dev container has `0027` applied while `main` stops at `0026`, so
`npm run check:schema` fails locally with `expected 15 tables, found 16` until #72 lands. CI resets
from migrations and passes.
