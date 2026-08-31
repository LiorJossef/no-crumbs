# Presentation outline — No Crumbs

> **Course requirement M11**: 10–15 minutes, followed by short interview-style questions.
> The document warns: *"it is not enough that the app works — you must know how and why it works."*
>
> This is the slide plan and the speaker's notes. The study guide for the questions afterwards is
> [`how-the-system-works.md`](how-the-system-works.md); read that the night before, not this.
>
> **Rule for the whole deck: every number said out loud is one we measured.** Where we did not
> measure, say so. The rubric rewards quality of thinking, and admitting a gap is thinking.

---

## Timing

14 slides, 13 minutes, leaving margin inside the 10–15 window.

| Block | Slides | Minutes |
|---|---|---|
| The problem and the product | 1–3 | 3 |
| The demo | 4 | 2 |
| How it is built | 5–9 | 5 |
| Tests, scale, security | 10–12 | 2.5 |
| Limits and what is next | 13–14 | 0.5 |

**Rehearse the demo twice on the real deployed URL, on a phone, on a network that is not yours.**
It is the only slide that can fail live.

---

## The slides

### 1 — The problem, in one sentence

> You save a TikTok about a restaurant. Two months later you are in that neighbourhood and you
> cannot find it again.

Say the number: a saved-videos list is chronological and unsearchable, so retrieval means scrolling.

**Do not open with the product name or the logo.** Open with the problem; the name lands better on
slide 3.

### 2 — Who it is for, and why it has business value

- **The user**: someone who saves places from social video and cannot retrieve them later.
- **The customer**: in V1, the same person. The course document permits that framing.
- **The value**: it converts an unstructured chronological list into a geographic library —
  retrieval collapses from minutes of scrolling to seconds on a map.

This is M1 and M2. One slide is enough; do not oversell it.

### 3 — What it is

The name, the mark, one screenshot of the map with pins.

> Paste a TikTok link. The places it names appear on your private map.

### 4 — Demo, two minutes, rehearsed

Do it in this order and do not improvise:

1. Paste a link that **works** — a post whose caption names a venue. Show the review screen, confirm, land on the map.
2. Show the saved list, a category filter, one place's detail.
3. Paste a link that finds **nothing**, and let the "no places" screen appear.

**Step 3 is not an accident and you must say so out loud**: it is the most common outcome, it has a
designed screen, and it offers adding the place by hand. A product that admits what it cannot do is
the point being demonstrated.

### 5 — The architecture, one diagram

Four layers, and the rule that keeps them apart:

```
src/ui/            presentation logic and view models          [import-checked]
src/domain/        pure TypeScript — no framework, no vendor   [import-checked]
src/integrations/  one adapter per port; vendor types die here [import-checked]
src/app/           Next.js — routes, server actions, auth
```

The sentence to say: **`domain/` cannot import React, Next, Supabase or any vendor SDK, and ESLint
fails the build if it tries.** `npm run check:layers` writes a deliberate violation, asserts the
rule rejects it, and deletes it — so the guard itself is tested.

Be ready for the follow-up: the guard covers three of the seven directories under `src/`;
`components/` and `lib/` are outside it and are maintained by review. Say that before they find it.

### 6 — The core process, end to end

The slide an examiner is most likely to ask about. One row per step, and **name the file**:

| Step | What happens | Where |
|---|---|---|
| 1 | The pasted link is canonicalised; the host allow-list runs **before** any network call | `domain/source/canonicalise-tiktok-url.ts` |
| 2 | A short link's redirects are followed, allow-list re-applied at every hop | `integrations/tiktok/resolve-short-link.ts` |
| 3 | oEmbed returns the caption, author and cover image; cached in `sources` | `integrations/tiktok/oembed-source-adapter.ts` |
| 4 | The caption becomes text for the model | `integrations/tiktok/caption-content-extractor.ts` |
| 5 | A schema-constrained model call returns candidate places | `integrations/llm/anthropic.place-extractor.ts` |
| 6 | Implausible candidates are dropped before any paid lookup | `domain/extraction/plausibility.ts` |
| 7 | Each candidate is matched against Google Places; confidence bands decide pre-tick vs shortlist vs no match | `integrations/google/place-resolver.ts` |
| 8 | The user reviews and confirms | `app/import/screens/review/` |
| 9 | `resolve_place` then `save_place` — two functions on opposite sides of a privilege line | `api/imports/confirm/route.ts` |

**The one sentence to memorise:** the browser sends a link in, and later sends back *an index* —
every fact that reaches the database is derived server-side from a row the server itself wrote.

### 7 — The database

Show the entities, and organise the slide around the split that explains the security model:

- **Shared between users**: `sources`, `extractions`, `places`, `place_provider_refs`, `poi_index`.
  Written only by the trusted server. Users hold `SELECT` and nothing else.
- **Per user**: `saved_places`, `place_mentions`, `collections` and their members and items.

31 migrations, RLS **enabled and forced** on every user-facing table.

### 8 — Users and permissions

One role — the authenticated owner — plus an anonymous visitor who sees only the marketing and
sign-in surface. **Authorisation is RLS, not `if` statements in application code.**

The strongest artefact we have: SQL policy tests that assert a second user's read returns **zero
rows**. Show one.

### 9 — External services, and why each one

M3 requires the justification, not just the list. One line each: Next.js, TypeScript, Supabase,
Vercel, MapLibre + CARTO, Zod, the extraction model, Google Places.

For each, be ready to answer *"what would you have built without it?"*

### 10 — Tests

- **165 files, 2,746 unit tests**, all passing.
- **56 Playwright tests** across 13 files, four browser projects.
- **166 SQL policy assertions** across three files.

Say what is honest: only 10 of the 56 end-to-end tests run without credentials, and **CI has not been
able to start a runner since 29 August** — an account-level Actions problem, not a broken workflow.
Volunteer it. An examiner who discovers a dead pipeline you did not mention scores you worse.

### 11 — Scale

The finding that makes this slide good: **the first thing to break is not the database.** It is a
provider quota of 100 text searches per day, which is roughly **12–50 imports per day across the
whole product**. Request wall-clock is second. Postgres is third, at around 500–1,000 places in a
single library — and it is the browser that degrades, not the database.

Name the dangerous query: the map read has no `LIMIT` and no viewport bound. Say what you would do
about it.

### 12 — Security

Four things, briefly:

- **RLS enabled and forced**, authorisation in the database rather than the application.
- **Column-level grants** — a collection's owner cannot be reassigned by anything the app can reach.
- **An SSRF gate** on a user-supplied URL: host allow-list before the first request, re-applied to
  every redirect hop, with a hop budget.
- **Untrusted content** — the caption is attacker-controlled text going to a model. It is wrapped in
  a per-call delimiter, the model has no tools and no side effects, and its output is schema-checked.

Then: **which risks remain.** No rate limiting on the paste endpoint; stored captions have no
deletion path at all, not even on account deletion.

### 13 — What it cannot do, and why that is a decision

**A place is found in about a quarter of posts** — measured, on a small hand-labelled sample.

The reason is a property of the content, not a bug in the code: creators put the venue name *on
screen* and *in speech*, because that is what the feed rewards, and put hashtags in the caption
because that is what search rewards. We read the caption.

So "no places found" is the **modal** outcome, which is why it is a designed screen with its own
specification rather than an error path, and why `NO_PLACES_FOUND` is deliberately not an error code.

### 14 — What I would do with more time

Four, in order, and be able to justify the order:

1. **Measure it properly.** The 27% rests on eleven posts found by web search. Fifty of my own saved
   links, hand-labelled, before changing anything.
2. **Read more of the post.** The venue is on screen and in the audio; the content-reader seam was
   designed for exactly that and has one implementation.
3. **Bound the map read** and add the missing index on `collection_invites`.
4. **Give stored captions a way to be deleted.**

---

## The questions to prepare, in likelihood order

Rehearse these out loud. Full answers are in [`how-the-system-works.md`](how-the-system-works.md).

1. **"Walk me through what happens when you paste a link."** → slide 6, and name files.
2. **"Why does it only work on a quarter of posts?"** → slide 13. Answer as measurement, never as apology.
3. **"What stops one user reading another's data?"** → RLS, forced, plus the test that asserts zero rows.
4. **"`places` rows are shared — what stops me editing someone else's?"** → the browser sends an index, not a fact. There was a real exploit here and the contract was changed to close it. **Volunteer this one if they do not ask it.**
5. **"Why a places API — couldn't the model give you coordinates?"** → it did: 65–470 m out, and 541 m apart between two runs of the same caption.
6. **"Why is there a review screen instead of saving automatically?"** → the clearest illustration of product judgement over feature count, which is the stated grading philosophy.
7. **"What would you do differently?"** → slide 14. Have the order justified.

## Before you present

- [ ] The deployed URL works on a phone, on a network that is not yours
- [ ] The demo links are chosen and tested — one that works, one that finds nothing
- [ ] The repository opens for someone who is not you
- [ ] You can name the file for every step on slide 6 without the slide
