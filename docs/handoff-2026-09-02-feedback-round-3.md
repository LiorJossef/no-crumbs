# Handoff — round-3 feedback, wave 1

> **Written 2026-09-02** at `de76538` on `no-crumbs-implementation`, closing the session that ran
> wave 1 of [`feedback-round-3-work-plan.md`](feedback-round-3-work-plan.md). **Read that plan
> first** — this file is what the plan cannot say: what is true about the environment, what the
> other documents get wrong, and what the next session will trip over.

## State, measured just now

| | |
|---|---|
| Branch | `no-crumbs-implementation`, **38 commits** ahead of where this session started (`4ca68e6`) |
| Working tree | **clean** |
| Tests | **216 files, 3493 passing** (`npx vitest run`) |
| `tsc --noEmit` | **4 errors**, all typed-route `Link` complaints — see the trap below |
| Local database | applied head `0027`; **`0021`–`0023` and `0028`–`0037` are not applied** |
| CI | **not being worked on**, owner ruling — the product is verified on localhost |

## The five traps, and every one of them cost somebody a run

1. **The dev server for this repo is `http://localhost:59420`, not `:3000`.** Port 3000 is served
   from a *different working copy* at `/private/tmp/p002-no-crumbs` and shows stale code. Three
   separate lanes screenshotted the wrong build before this was pinned down. Check what is listening
   before you drive a browser.
2. **The local database is thirteen migrations behind the schema on disk.** Missing: `0021`–`0023`
   (POI prefilter, the place-lookup cache RPCs) and `0028`–`0037` (taxonomy alignment,
   `place_mentions`, re-point, note precedence, names at sign-up, tag ownership, model prose). There
   is also a phantom `0027` row with no file. **Anything "verified locally" about saves,
   collections, profiles or tags is measured against the wrong schema.** The clean repair is
   `db:reset`, which destroys the owner's local saves — **do not run it without a specific
   instruction.**
3. **`document.elementFromPoint`, not CSS inspection.** Two defects this session were invisible to
   reading the styles and obvious to hit-testing: content painted *behind* a translucent bottom bar,
   and a pill whose centre returned the nav link. If a fix is about whether something is reachable,
   prove it by hitting it.
4. **The working tree holds live lanes' half-finished work.** The owner reported the marker
   regression "looks fixed" while the lane was still running and uncommitted. Attribute a change
   before acting on it; `git status` carries no author.
5. **Green tests are not a typecheck.** Vitest does not typecheck, so two fixtures missing a
   required field passed 3400 tests and failed `tsc`. `npm run verify` runs both.

## What the other documents get wrong

- **`current-state.md` open item 0** says GitHub Actions cannot start a runner. **Stale** — runners
  work; CI was red for two real, small reasons (both since fixed in `4607132` and `213a850`), and
  the owner has since taken CI out of scope entirely.
- **`current-state.md` open item 13** warns of a fifth, unmirrored `128px` copy of `PEEK_PX` in a
  Tailwind arbitrary value. **Stale** — there is no `[128px]` anywhere in `src/`. Four mirrors
  remain, all named, pinned by `tests/unit/shell/sheet-geometry.test.ts`.
- **`current-state.md` "Measured, not remembered"** says 29 migrations on disk. It is **36**
  (`0001`–`0037`, no `0027`).
- **`03-university-requirements.md`** still marks M9 security as OUTSTANDING. `docs/security.md`
  reports COMPLETE and closes its twelve owed items.
- **`09-extraction-and-resolution.md` §5.2** category H was revised on the record in `771d593` — a
  tagged business is not a creator handle. See its new §5.2.1.
- **`ux-import-flatten.md` §3** was narrowed in `eb3ff57`: a single result already saved from this
  link does not collapse.

## Four things that were believed and turned out to be false

Each was written down as a hypothesis, tested, and refuted. They are here so nobody re-derives them.

1. **"Three clustering bugs."** §3.1/§3.2/§3.3 are **one data defect**: `locality` and
   `country_code` arriving NULL from the Google adapter. The area-grouping rule was never at fault.
2. **"Two candidates fail to dedupe" (§6.1).** Refuted against the rows — every near-duplicate pair
   sharing a source is ≥374 s apart. The cause is **re-importing one link**: one video holds 16
   imports and 18 saved places.
3. **"The chips are the category filter" (§1.3).** There are only three categories. The chips the
   owner photographed are **tags**, capped at 12 with no floor; round 5 measured 15 chips, 12 of
   them singletons.
4. **"The marker regression came from the theme fix."** It came from `63cffa5`, months earlier. The
   theme fix merely made the second half of a round trip reachable, so somebody finally looked.

## Where the next session should start

[`feedback-round-3-work-plan.md`](feedback-round-3-work-plan.md) §5, **wave 2a** — the owner's
instruction of 2026-09-02 is *UI problems first, "like the tags and stuff like that."*

1. **The category chip trigger** — §1.3's remaining half. The singleton tag floor already shipped
   (`8fd2e27`) and was the larger half. A native `<select>` is not available: `facelift-plan.md:144`
   locks the pressed chip filling with its own category colour.
2. **The Been / Not been yet interaction** — §1.4. The complaint is the interaction, **not the
   words**; the owner has confirmed that in as many words, and *Been* / *Not been yet* are ratified.
   The spec with both options costed is
   [`ux-visit-filter-and-chip-density-2026-09-02.md`](ux-visit-filter-and-chip-density-2026-09-02.md).
   **It needs an owner decision on shape before it is built** — see §4 of the plan.

Then wave 2b, which includes **the peek row's spacing** (diagnosed in the plan; four mirrors must
move together, one of them the camera's occlusion budget and one a licence condition).

## Owner decisions still open

They are listed in the plan's §4 and none of them blocks its lane:

1. **Fly-to on pin tap** (§4.1) — reverses a written rule about the camera moving under your thumb.
2. **The Been filter's shape** — a bigger control inside a row we want smaller, or move it out.
3. **The category dropdown** — a compact trigger over the existing chips, keeping the colour system.
4. **§6.5** — spend 2 Google calls per candidate to turn an address into a business, against a
   100/day cap. Recommendation was no, not before submission.
5. **§9.2 auth method** — recommendation was no change.

## Known-open, nobody is on them

- **§3.3's bare cluster number does not reproduce** on the local library — four clusters, no ties.
  It needs the owner's own rows.
- **The `1 in הרצליה` defect** is probably *not* the countryless family: Google returns a proper
  locality for Jerusalem. One production read settles it, and those rows are the owner's.
- **`repoint_saved_place`** exists, is `security-privacy`-reviewed, and has **zero callers in
  `src/`**. It is the honest fix for the `llm_guess` → Google upgrade.
- **The re-import notice is warning-tinted** for news that is not a caution, and at ~230 px is the
  loudest thing above the fold.
- **`memberLabel`'s `A collaborator`** violates `voice-and-vocabulary.md` §3, which bans the word.
  It appears in four files, one of which quotes the string back to the user, so it is a small
  coordinated rename rather than a one-liner.
- **`Delete my data`** and its paragraph are centre-aligned while everything above them is left.
- **Four `tsc` typed-route errors.** Present before this session's work and independently confirmed
  at two different commits. They look like stale generated route types in `.next/types` rather than
  real defects — **confirm with a build before trusting or chasing them**, because `npm run verify`
  runs bare `tsc` and will fail on them either way.
- **§7.2, the import loading screen**: measured at **237 px of empty flex slack on an 844 px
  viewport — 28.1%**, worst case being the first thing you see. The lever is that the column
  stretches to `100dvh` over ~490 px of content; deleting the spacers re-creates the 174 px hole
  their own docblock records fixing.

## How wave 1 was run, and what it cost

Six lanes concurrently, write scopes pairwise disjoint, then four follow-up lanes as defects
surfaced. It worked — but **two features shipped as halves**, which is exactly what
`agent-guardrails.md` §8 rule 31 predicts: `deleteSavedPlaces` is written, tested and has **zero
callers**, and every-source-on-the-place-card reaches the client with nothing rendering it. Both
were blocked because one lane held `place-sheet.tsx` for the whole wave.

If you dispatch concurrently again: a lane that needs another lane's file is not a lane, it is half
of one. Either sequence them or give one lane the whole slice.
