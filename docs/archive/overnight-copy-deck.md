# Overnight copy deck — the strings the run writes tonight

> **Written 2026-08-31 by `product-lead` for the overnight run** (`overnight-run-plan.md`). Every
> string below was measured against the working tree at commit **`1b79e9c`** on
> `no-crumbs-implementation`. Where I quote the running code I give the file and line I read it at,
> so a verifier can check the quote rather than trust it.
>
> **Why this document exists.** Eight build waves write user-facing strings tonight across surfaces
> that have no final copy. Without this, a build agent invents copy at 3am and the product acquires
> its second voice. Nobody else writes to this file.
>
> **What it is not.** It is not a replacement for [`ux-architecture.md`](../ux-architecture.md) §12,
> which is still the copy deck of record. This is the **pre-written batch** for tonight's packages,
> plus the correction list §12 is owed. When the run lands, these rows are merged into §12 and this
> document is retired.
>
> **Precedence.** [`voice-and-vocabulary.md`](../voice-and-vocabulary.md) governs every string here and
> wins over anything below. [`spec-no-places-found.md`](../spec-no-places-found.md) is authoritative for
> its own screen and this document does not touch its strings. Where a string already ships and is
> right, I say so and change nothing — most of §7 and all of §8 are that.
>
> **I cannot verify anything.** I have no shell. Every acceptance line here is written so
> `qa-reliability` or the orchestrator can check it **against a named commit**, not against a running
> app I claim to have used.

---

## 0. How to use this

1. Find your package ID in the table of contents.
2. Take the string **exactly as written**, including the curly apostrophe (`’`) — the codebase uses
   `&rsquo;`/`’` throughout and a straight quote is a diff-visible inconsistency.
3. Put it at the file and key named. If the key does not exist yet, create it with that name.
4. If your package needs a string that is not here, **stop and report it upward**. Do not write one.

**Ids.** New strings get ids `C100`+ so they slot into §12 without renumbering anything. Ids are
mine to assign; they are how the deck and the code stay pinned to each other after tonight.

| § | Package | Surface |
|---|---|---|
| 1 | W4-1 | The name lands — title, description, wordmark |
| 2 | W1-5 | The non-TikTok link in the Add sheet |
| 3 | W1-4 · W6-4 | Provenance — the badge slot and the capped candidate |
| 4 | W5-1 · W5-2 · W5-5 | The library — elapsed time, sort, result count |
| 5 | W7-4 | Account, sign-out, delete-my-data |
| 6 | W7-5 | The edges — error, 404, global error |
| 7 | W6-5 | The no-places screen — confirmed unchanged |
| 8 | — | The §6 drift: corrections owed to `ux-architecture.md` §12 |
| 9 | W5-3 · W6-3 | Two scope rulings |
| 10 | — | What is genuinely the owner's decision |
| 12 | W5-6 follow-up | The collection description field — and whether *description* survives |

---

## 1. W4-1 — the name lands

**A correction to the run sheet before anything else.** §8's exit criterion says *"the three strings
from `voice-and-vocabulary.md` §3, exactly"*. **There are no three strings in that §3** — §3 is the
vocabulary table (*place* / *your map* / *a TikTok* …) and contains no title, no template and no
description. §2 is the six permitted surfaces, also not strings.
[`brand-and-product-foundation.md`](../brand-and-product-foundation.md) §3 is the name decision and
carries no metadata strings either. So the three strings did not exist and could not be quoted.
**They are written here, and this section is now what W4-1 builds against.**

### 1.1 The strings

| id | Key | File | String |
|---|---|---|---|
| **C100** | `metadata.title.default` | `src/app/layout.tsx` | `No Crumbs — your saved places, on one map` |
| **C101** | `metadata.title.template` | `src/app/layout.tsx` | `%s · No Crumbs` |
| **C102** | `metadata.description` | `src/app/layout.tsx` | `Paste a TikTok link and the place lands on your map. Organised by where, not by when.` |
| **C103** | the label beside the mark | `src/app/page.tsx` (`const KICKER`'s sibling, the `<span>` currently reading `P-002`) | `No Crumbs` |

`metadataBase` is not copy. It is `new URL('https://p-002-zeta.vercel.app')` — production, per
`CLAUDE.md`. **The domain is unverified** (`brand-and-product-foundation.md` §3: *"Still unverified…
trademark and domain"*), so this is the Vercel URL tonight and a one-line change when a domain
lands. Do not invent `nocrumbs.app` or anything like it; a `metadataBase` pointing at a host we do
not own makes every link preview in the product fetch an image from a stranger.

### 1.2 Which of the six surfaces each one is

`voice-and-vocabulary.md` §2's list is a **permission list, not a checklist** — a surface with no
package tonight is not a gap.

| § 2 surface | Covered by | Note |
|---|---|---|
| 1. The shell header wordmark | **nothing in this run** | There is no wordmark in `map-shell.tsx` today. Do not add one; W4-1's scope is `layout.tsx` and `page.tsx` |
| 2. The landing and sign-in mark | **C103** (W4-1) | `/` today. `/sign-in` carries the same `PinMark` and no label — out of W4-1's stated paths, so leave it and record it |
| 3. The browser tab title | **C100 · C101** (W4-1) | |
| 4. The meta description | **C102** (W4-1) | See the ruling below |
| 5. The app icon | W4-4 | `icon.svg`, `apple-icon.png`, `opengraph-image.tsx`, `manifest.ts` |
| 6. The deck | this document, and `ux-architecture.md` §12 after the merge | |

### 1.3 The rulings behind those four strings, so they are not re-litigated at 3am

**C100 — why the tagline rides along with the name.** The exit criterion is *"tab reads **No
Crumbs**"*, and a browser tab truncates at roughly 20 characters, so `No Crumbs — your s…` satisfies
it. The tagline is there for the two surfaces that show the full title and are not tabs: a bookmark
and a shared link. `brand-and-product-foundation.md` §3 prices this name's one real cost —
*"category legibility… a first-time hearer guesses a recipe app or a cleaning product before a
map"* — and rules that **the subhead must stay literal and must never be traded for a cleverer
line**. A bare `No Crumbs` title is the name paying that cost with nothing next to it. The em dash
joins a proper noun to a phrase; it is not a second clause, so §5's one-clause rule holds.

**C101 — the separator is `·`, not `|`.** The product already uses `·` as its separator in five
places (`Added by you · {date}`, the profile's `been · not been yet`, the peek row's `· +20 more`).
A pipe would be a sixth separator style for the same job.

**C102 — the name is deliberately absent, and this is the one string worth arguing about.** §2
permits the name here; it does not require it. I am ruling it out for one reason: **C100 sits
directly above C102 in every preview a human ever sees**, and repeating the name one line under
itself is the substitution §1 bans — the brand word taking a slot the news should have. The
description's whole job is the answer to *"what is this?"* that the name cannot give, and the
shipped landing subhead (`page.tsx:34`) is already the best sentence in the product for that. Taking
it verbatim also means the landing page and the link preview cannot drift.

> **What would change my mind:** evidence that a preview surface the product actually uses renders
> the description **without** the title. If someone finds one, the description becomes
> `No Crumbs is a personal map of the places you save from TikTok. Organised by where, not by when.`
> and nothing else changes.

**C103 — the treatment changes, not just the text.** The current span is
`text-[13px] font-extrabold tracking-[0.2em] uppercase`, which is `voice-and-vocabulary.md` §5's
**kicker** device. A wordmark is not a kicker. Per `brand-and-product-foundation.md` §3.1 the
wordmark is **Fraunces** (`SOFT` 60, `WONK` on), set as `No Crumbs` — **not** `NO CRUMBS`, **not**
`no crumbs`, and with no `font-stretch` axis (§3.1 names that as a shipped bug). §5's "sentence case
everywhere" explicitly exempts the wordmark, so the two capitals are correct and are the only two in
the product.

### 1.4 Two comments that become lies in this commit

`overnight-run-plan.md` §3 rule 7: *never delete or rewrite a comment explaining why; if a comment
becomes wrong, update it in the same commit.* W4-1 makes two comments wrong, and both are exactly
the kind that survives a rename and misleads for months:

- `src/app/layout.tsx:13–17` — *"PROVISIONAL, and a one-line change when the name lands… The name is
  an open owner decision"*. **The name is decided** (owner, 2026-08-30). Replace with why C100/C101
  are shaped as they are and why the description does not carry the name.
- `src/app/page.tsx:95–100` — *"OPEN OWNER DECISION — the product name is not decided and is not
  ours to invent… The repo codename is set as a small tracked-uppercase label"*. Replace with §1.3's
  wordmark ruling.

`page.tsx:35–39`'s `BOUNDARY` comment also says the manual-add recovery *"does not exist yet: S8
(`/add-place`) does not exist"*. **It shipped on 2026-08-30** as `components/add/add-sheet.tsx`. The
string `Works with TikTok links today.` stays — it is still true and still the honest boundary — but
the comment's reason is stale. Out of W4-1's paths only if the builder does not touch that region;
if it does, fix it.

### 1.5 Acceptance, checkable against the commit

1. `grep -n "No Crumbs" src/app/layout.tsx src/app/page.tsx` returns exactly three hits: `default`,
   `template`, and the label span.
2. `grep -rn "P-002" src/` returns no hit in a user-facing string.
3. `metadata.title` is an object with `default` and `template`, not a string.
4. `metadata.description` is C102 character-for-character, including the final full stop.
5. `grep -cE '#[0-9A-Fa-f]{6}' src/app/layout.tsx` is **1**, not 2 — the pre-existing `themeColor:
   '#FAF9F6'`. K12 says the hard-coded-colour count may only go down; W4-1 must not add the second.
6. Neither of §1.4's two comments still claims the name is undecided.

---

## 2. W1-5 — the non-TikTok link in the Add sheet

### 2.1 What is wrong today

`universal-input.ts:47` files every non-TikTok string as `kind: 'text'`, and `manualAddLabel` then
offers `Add “https://www.instagram.com/reel/…” manually` — an offer to **name a place after a URL**.
`/import` gets the same URL right (`import-error-copy.ts:109–118`).

### 2.2 The ruling that has to be recorded before the strings

`universal-input.ts:9–15` carries an **owner ruling of 2026-08-29** that says the opposite of W1-5:

> *"Instagram and YouTube are **not** recognised here. There is deliberately no `unsupported-host`
> arm: a link we do not read is not special, it is text, and the honest offer against text is 'add it
> manually'."*

W1-5 overrides it. The override is legitimate and I am not escalating it: `overnight-run-plan.md` §6
is an owner decision of **2026-08-31**, it is later, and its exit criterion names the behaviour
explicitly. It also restores what `brand-and-product-foundation.md` §1 has said since 2026-08-20 —
*"a pasted Instagram or YouTube link is **recognised by name** and answered with the manual-add path,
never with a failure"*. **The docblock must be rewritten in the same commit** (§3 rule 7), recording
that the 2026-08-29 ruling was superseded on 2026-08-31 and why. Leaving it in place would leave the
file arguing against its own code.

### 2.3 The strings

Voice source: `IMPORT_ERROR_COPY.UNSUPPORTED_HOST` (`src/ui/import/import-error-copy.ts:109`). I am
matching it, not inventing a second wording.

| id | Element | File / key | String |
|---|---|---|---|
| **C110** | Notice headline | `src/components/add/add-sheet.tsx`, new `UNSUPPORTED_LINK_COPY.headline` | `That link isn’t from TikTok.` |
| **C111** | Notice body | `UNSUPPORTED_LINK_COPY.body` | `We support TikTok links. Instagram and YouTube aren’t supported yet.` |
| **C112** | Manual-add row | `manualAddLabel` in `src/components/add/universal-input.ts` | `Add a place manually` |
| **C113** | Escape action | read from `IMPORT_ERROR_ACTION_LABEL.open_link` — **do not add a second literal** | `Open the original link` |

C110 and C111 are `UNSUPPORTED_HOST`'s `headline` and `body` **verbatim**. That is the point: one
piece of news, one wording, on both surfaces. `Not TikTok` (its `kicker`) does **not** come across —
the sheet has no kicker slot and adding one for this is a new component for a two-line notice.

> **C110 amended 2026-08-31** by the noun→adjective pass
> ([`tiktok-copy-pass-2026-08-31.md`](tiktok-copy-pass-2026-08-31.md)). It was
> `That link isn’t a TikTok.` The repair is to the *claim*, not only the grammar: a link is never
> *a TikTok*, and what is actually wrong with it is where it came from. **The byte-equality test in
> §2.5 is unchanged in form** — the constant moved, the assertion that both surfaces read it still
> holds, and that is precisely what made this a one-line change instead of two.
> `Not TikTok` did not move: it uses the proper noun as itself, not as a count noun.

C112 needs no new code. `manualAddLabel` already returns `'Add a place manually'` for every kind
that is not `text` (`universal-input.ts:97`), so a new non-`text` kind gets the generic label for
free, and the URL stops being quoted back as a place name. **Check that this is still true after the
new arm lands** — it is the whole exit criterion, and it is one line.

### 2.4 What renders, and what must not

| Element | With an unsupported link in the field |
|---|---|
| `Add this TikTok` primary button | **Absent.** `isLink` today means `kind === 'tiktok'`; it must not widen to cover the new kind |
| Results list | **Empty**, for the reason already in the file (`add-sheet.tsx:477`): *"a link is not a search term"* |
| `Nothing you’ve saved matches that.` | **Absent.** It is gated on `input.kind === 'text'` and must stay gated |
| C110 + C111 | Present, in the existing single hint/error slot (`add-sheet.tsx:628–639`), `role="status"`, `text-muted-foreground` — **not** `text-destructive`. Nothing failed |
| C112 manual-add row | Present, generic wording, as always |
| C113 | Present **only if** the URL can be vetted — see below |

**C113 has a condition, and it is a real one.** `/import` renders `Open the original link` behind
whatever its redirect screen uses to vet a user-pasted URL. The Add sheet has no such vetting today.
Rendering an `href` straight from a text field is `security-privacy`'s call, not mine. So: **if the
existing vetting is reusable inside this scope, ship C113. If it is not, drop C113 and ship
C110 + C111 + C112 — the package's exit criterion is met without it.** Do not write a new URL
sanitiser inside W1-5 to make an optional link work.

### 2.5 Acceptance, checkable against the commit

1. `universalInput('https://www.instagram.com/reel/abc')` does not return `kind: 'text'`.
2. Same for a YouTube URL and for a bare domain (`kolamba.co.uk`) — the three cases W1-5 names.
3. `manualAddLabel` for all three returns `Add a place manually`, with no URL substring.
4. C110 and C111 are byte-identical to `IMPORT_ERROR_COPY.UNSUPPORTED_HOST.headline` / `.body` — a
   unit test should assert this equality rather than duplicating the literals.
5. The notice element does not carry `text-destructive`, `role="alert"` or `aria-live="assertive"`.
6. `universal-input.ts`'s docblock no longer states the 2026-08-29 ruling as current.

---

## 3. W1-4 · W6-4 — provenance

### 3.1 The hard constraints, restated so they cannot be traded away

- **No invented confidence number, band, bar or percentage. Ever.** Not on screen, not in the DOM,
  not in an `aria-label`. `candidate-resolution-view.ts:262` and `spec-no-places-found.md` §3.2 both
  already ban it; W6-4 changes the *weight* of provenance, never its precision.
- **A caption-derived pin reads as caption-derived at a glance.** That is the package's exit
  criterion and it is judged by a human reading five cards cold.
- **`not_attempted` and `capped` are not `no_match`.** `candidate-resolution-view.ts:26–30`: *"Saying
  'we found nothing' for 'we never looked' is the uncertainty-into-certainty move the working
  agreement forbids."* They get their own word.

### 3.2 The badge slot — five labels, three of them provenance

Today the badge slot carries `resolutionChip`'s **settledness** (`Matched` / `Your pick` /
`Needs your pick`) and provenance sits at the bottom of the card in 12px grey. W6-4 swaps the
hierarchy. The badge now answers **"where did this pin come from?"**.

| id | View state | Badge | Tone |
|---|---|---|---|
| **C120** | picked, or `matched` auto-accept | `From the map data` | settled |
| **C121** | options exist, none picked, no model coordinate | `Needs your pick` | needs-pick |
| **C122** | `failed` / `unresolved` / `ambiguous`, saving the model's coordinate | `From the caption` | **caption** — its own tone, not the quiet one |
| **C123** | `capped` / `not_attempted` | `Not checked` | caption |
| **C124** | `unresolved` with no coordinate at all | `No match` | needs-pick |

**C120 and C122 are a matched pair and must stay parallel.** `From the map data` / `From the
caption` are two answers to one question, which is what makes the difference legible at a glance.
Shortening one and not the other destroys that.

**The width problem, pre-answered so nobody has to ask.** `From the map data` is 17 characters in an
11px pill. This codebase has already shipped this exact bug once —
`candidate-resolution-view.ts:336–342` records a provenance string measuring *"208 px into a 180 px
box on a Pixel 7"*, clipped to `Approximate pin from the ca…`, losing the half of the sentence that
carried the meaning. So:

> **The badge must wrap or the card must give it the width. It may never truncate.** If the pair
> cannot fit at a 320px viewport, fall back to `Map data` / `Caption` — **both together, never one of
> each.** That is the builder's call to make with this rule, not a question to escalate.

**C121 keeps its existing words** (`resolutionChip`, line 362). It is not provenance — it is the
absence of one — and it already ships, already tests, and is already right.

**Settledness does not vanish; it demotes.** `Your pick` and `Matched` move to the line the
provenance vacated. A user who picked an option must still see that their pick took.

### 3.3 W1-4 — the capped candidate

Two things W1-4 changes, and only one needs a string.

**Not pre-ticked** needs no copy. `willSave` returns true for a capped candidate with model
coordinates, so it arrives ticked and saves an unverified pin. Fixing that is arithmetic on the Save
button's count; no string moves.

**The visible provenance line** does. And there is a trap in it that the run sheet does not name:
`candidate-resolution-view.ts:319–321` deliberately excludes `capped`/`not_attempted` from
`Pin from the caption`, because *"contrasting them with a place database would claim a search that
never happened."* On a card set where the sibling badge reads `From the map data`, the bare line
`Pin from the caption` does imply we tried the map data and it lost. So the capped line has to carry
**both** facts:

| id | Element | File / key | String |
|---|---|---|---|
| **C125** | Capped provenance line | `src/ui/import/candidate-resolution-view.ts`, `resolverPinLine` | `Pin from the caption. We didn’t check this one.` |

Two sentences, one clause each — §5's rule is about semicolons, and two short sentences is what that
rule asks for rather than what it forbids.

**It does not say why we did not check it.** *"Only the first 8 candidates are looked up"* is
machinery (§7 test 3) and the cap is ours, not the post's. `We didn’t check this one.` is the entire
user-relevant fact and it stops.

`not_attempted` takes **the same line**. The two kinds differ in the code — past the cap, versus a
row written before the resolver existed — and are identical to a user: nobody looked.

### 3.4 Acceptance, checkable against the commit

1. No string reachable from the review screen contains `%`, `confidence`, `score`, or a bare number
   that is not a count of candidates.
2. `resolverPinLine` returns C125 for `capped` and for `not_attempted` when the model gave a
   coordinate, and `null` when it did not.
3. A capped candidate is not in `saveableIndices`' ticked set on arrival; the Save button's count
   excludes it. Asserted in a unit test, not read off a screen.
4. C120 and C122 are either both the long form or both the short form. A test can assert they have
   the same word count.
5. `grep` finds no second literal of `From the caption` outside the view module.

---

## 4. W5-1 · W5-2 · W5-5 — the library

### 4.1 W5-1 — elapsed time on the row

**There is a shipped comment arguing against this and it has to be dealt with, not ignored.**
`src/ui/place/location-certainty.ts:73–78` says `savedOnLine` is on the detail and not on the row
*"on purpose: twenty rows saved in one afternoon would carry twenty identical dates, which is noise
sold as information."*

**Ruling: the row line ships, and the comment is updated rather than deleted.** Two things changed
since it was written. W5-1 pairs the line with a thumbnail, so the row gains a metadata band that
has a reason to exist. And W5-2 adds a **sort control whose default is recency** — at which point
the elapsed time is what makes the sort order legible and verifiable, which is the exact
justification `savedOnLine`'s own docblock gives for existing at all (*"the library is ordered
most-recently-saved-first and said so nowhere, which made the order both invisible and
unverifiable"*). Elapsed time answers that; a repeated date does not.

**C130 — the full ladder.** Every rung, so nothing is invented at the boundary.

| Condition | String |
|---|---|
| in the future (clock skew, a row written ahead) | `Saved just now` |
| < 60 seconds | `Saved just now` |
| < 60 minutes, exactly 1 | `Saved 1 minute ago` |
| < 60 minutes | `Saved 12 minutes ago` |
| < 24 hours, exactly 1 | `Saved 1 hour ago` |
| < 24 hours | `Saved 5 hours ago` |
| < 7 days, exactly 1 | `Saved 1 day ago` |
| < 7 days | `Saved 3 days ago` |
| < 35 days, exactly 1 week | `Saved 1 week ago` |
| < 35 days | `Saved 4 weeks ago` |
| ≥ 35 days, same calendar year | `Saved 3 Aug` |
| otherwise | `Saved 3 Aug 2025` |

Four rulings inside that table:

- **The ladder stops at weeks.** `Saved 5 months ago` is vaguer than `Saved 3 Aug`, no shorter, and
  `voice-and-vocabulary.md` §5 already fixes the date format. Handing off to the date is the honest
  move, not a gap.
- **35 days, not 30**, so `4 weeks ago` is reachable and there is no rung with no string.
- **Digits throughout, no `yesterday` and no `last week`.** §5: *"Digits, always."* Mixing one word
  form into a numeric ladder is a special case a verifier has to remember and a translator has to
  restructure.
- **A future timestamp clamps to `Saved just now`.** It never reads `in 2 hours`. Clock skew between
  a browser and Postgres is real and the product must not narrate it.

Goes in `src/ui/place/location-certainty.ts` beside `savedOnLine`, as a pure function of
`(savedAt, now)` — the same shape, so it is testable without a DOM, which is this repo's constraint.

### 4.2 W5-2 — the sort control

| id | Element | String |
|---|---|---|
| **C131** | Control label / `aria-label` | `Sort` |
| **C132** | Option 1 (default) | `Recently saved` |
| **C133** | Option 2 (conditional — see below) | `Nearest` |
| **C134** | Option 3 | `A–Z` |

Vocabulary check: none of the four is in §3's right-hand column. `Sort` is not machinery vocabulary
— it is what the control does. `A–Z` takes an en dash, matching the product's typography elsewhere.

**C133 is gated, and this changes the package.** `Nearest` without a stated reference point is a
claim the screen cannot back — nearest to you, or to the middle of the map? The product already has
an answer and W5-2 must not contradict it: `near-me.ts:158–160` **hides distances entirely** when
`distanceOrigin(state) === null`, because a distance from a rough fix is a number we cannot stand
behind.

> **Ruling: `Nearest` is offered only when there is a usable location fix, and is absent from the
> control otherwise** — not disabled, not greyed, absent. Same rule as
> `import-error-copy.ts`'s *"a recovery only ever points somewhere that works"*, and the same rule
> the profile page follows (`profile/page.tsx:159`: *"a heading over nothing is a promise the data
> cannot keep"*).

That means W5-2's exit criterion *"three orders work"* must be read as: **two orders always work,
three work when located.** A verifier checking with location off and finding two options has found
correct behaviour, not a missing feature. If the owner would rather have an always-present
`Nearest to the middle of the map`, that is their call and it is in §10.

The choice survives a reload (the package says so). Persisting it needs no string.

### 4.3 W5-5 — the visible result count

| id | Element | File | String |
|---|---|---|---|
| **C135** | Result count beside the search field | `src/components/sheet/place-sheet.tsx` | `12 of 32` |

**The plan's example is right and I am confirming it, with three conditions.**

The pattern already ships: `import-page-client.tsx:1810` renders `{selectedCount} of
{saveableIndices.length} selected`. So `N of M` is this product's existing way of saying how much of
a set is in play, and W5-5 is not introducing a form.

**Condition 1 — it renders only while something is narrowing.** With no search, no tag and no visit
filter, `32 of 32` says nothing and competes with the heading, which already carries a count
(`areaHeading`: `12 places in London`). It appears when a query, a tag or the visit filter is on,
and it disappears when they clear. That is also what makes it self-explanatory: it shows up at the
moment the number means something.

**Condition 2 — the denominator is the post-clear count of the same list.** Not "the library", not
"the viewport" — **what this list would show with the search and filters cleared.** That is the only
denominator a number beside a search field can honestly mean, and it gives a verifier a one-step
check: clear the field, read the heading's count, it equals the 32 you just saw.

**Condition 3 — it is `aria-hidden`.** The sheet already has exactly one live region
(`map-shell.tsx:201`) fed by `filterSentence` (`map-page-client.tsx:1139`), which says the same fact
as a sentence. Two announcements of one change is the defect `share-panel.tsx:210` is already
flagged for. The visible count is for sighted users; the live region stays the single announcement.

`0 of 32` is fine and needs no special string — the heading beside it already reads
`Nothing matches "momos"` and offers `Clear search`.

---

## 5. W7-4 — account, sign-out, delete-my-data

**This is the string most likely to be written badly at 3am, and the reason is that the true thing is
uncomfortable.** `collections.owner_id` is `on delete cascade` and ownership transfer was never
built, so deleting an account silently destroys shared collections for everyone in them.
`security-privacy` must review this package (run sheet §7c). I hold the copy; I do not hold the
decision about what the code does — see §10.

### 5.1 The account block

| id | Element | String |
|---|---|---|
| **C140** | Section heading | `Your account` |
| **C141** | Sign-out button | `Sign out` — **already ships**, unchanged. Moved to `account/page.tsx` on 2026-09-03 when `/profile` became read-only |
| **C142** | Delete entry point | `Delete my data` |
| ~~**C143**~~ | ~~Line under it~~ | **Withdrawn 2026-09-03.** Was `This removes your places, anything you kept for later, your collections and your account.` |

`Delete my data` is `brand-and-product-foundation.md` §6's own phrase for this control and it is the
right one: it describes what leaves, not what happens to a row.

**C143 is withdrawn — owner, 2026-09-03**, on the whole account page being *"too much text"*. It was
written for a shape that no longer exists: a permanent caption under a full-width button, where it
was the only statement of scope a person got before opening the dialog. The entry is a disclosure
now (`account-actions.tsx`), so C143 rendered one line above C145 inside the same panel and said the
same list twice in one viewport.

**The principle it was protecting survives in C145 and is not negotiable**: a destructive control
whose blast radius is only revealed after you commit is one people press to find out what it does.
Opening a disclosure is not that commitment — it reveals and destroys nothing — so scope is still
stated before the destructive press, one press earlier than the press that acts.

**Not `destructive`-styled at the entry point.** `profile/page.tsx:210` already rules that the
palette's destructive role is for things that destroy; the entry point opens a dialog and destroys
nothing. The **confirm button inside the dialog** is destructive.

### 5.2 Branch A — deletion proceeds

The user owns no collection that anyone else is in.

| id | Element | String |
|---|---|---|
| **C144** | Dialog heading | `Delete your account?` |
| **C145** | Dialog body | `Your places, collections and account are removed. This can’t be undone.` |
| **C146** | Confirm | `Delete my account` |
| **C147** | Cancel | `Cancel` |
| **C148** | In progress | `Deleting…` |
| **C149** | Failure, inline | `Couldn’t delete your account. Try again in a moment.` |

C145 is two clauses in two sentences, which is what §5 asks for. `This can’t be undone.` is the one
sentence that has to be there and it is not a warning label — it is the fact that decides the
question.

**Shortened 2026-09-03 (owner).** It read `Your places, anything you kept for later, your collections
and your account are removed.` Nothing else moved — the string still names what is removed *and*
says it cannot be undone, which is the bar the shortening was held to.

> **The removed clause is owed back, and this is the note that owes it.**
> *"anything you kept for later"* names `place_mentions`. It was written into C143 and C145 by
> [`entity-proposal.md`](entity-proposal.md) §10.4 as **condition 10** of the E1 security ruling,
> deliberately ahead of the feature so the deletion copy could never be caught understating what it
> removes.
>
> It is being cut because **E1 has not shipped**: `0031` creates the table, no application code
> writes or reads it, there is no *keep for later* control on any screen, and `0031` is not applied
> to production (measured `0026`, 2026-08-30). A user cannot create a mention, so today the clause
> names a data class that does not exist for them.
>
> **Condition 10 is deferred, not discharged.** Whoever builds *keep for later* restores the clause
> to C145 in the same commit that ships the control, and C143 does not come back with it — the
> disclosure already states the scope one press before the destructive one.

**No "are you sure", no "permanently", no typing the word DELETE.** *Are you sure* is the dialog
asking the question the dialog already is. *Permanently* is doing the job `can’t be undone` does, in
a longer word. And a type-to-confirm field is a pattern for shared production infrastructure, not
for a personal map; it reads as the product distrusting the user on the one screen where they are
exercising a right.

### 5.3 Branch B — the user owns a shared collection

The honest position: **we will not destroy other people's data to satisfy this request, and there are
two things the user can do about it right now.**

| id | Element | String |
|---|---|---|
| **C150** | Dialog heading | `2 of your collections are shared.` (`1 of your collections is shared.`) |
| **C151** | Body, sentence 1 | `Deleting your account would take them away from the people you shared them with.` |
| **C152** | Body, sentence 2 | `Delete those collections, or remove the other people from them, and then come back here.` |
| **C153** | Primary action | `Open my collections` |
| **C154** | Secondary | `Cancel` |
| **C155** | The list heading above the named collections | `Shared by you` |

Five rulings inside that:

- **It names a number and it lists the collections.** *"You own shared collections"* sends the user
  to hunt through a list. `2 of your collections are shared.` plus the two names is the difference
  between a refusal and an instruction. Names render inside `<bdi>` with `line-clamp`, never
  `truncate` — a Hebrew collection name truncated LTR clips its identifying start
  (`spec-no-places-found.md` §7.1, already fixed elsewhere and easy to reintroduce).
- **Both next moves are real, and I checked.** `deleteCollection` (`app/actions/collections.ts:116`)
  and `removeMember` (`:466`) both exist and are both reachable from the collection screen
  (`collection-content.tsx:571`, `share-panel.tsx:553`). C152 points at shipped capability, not at
  an intention. **If W7-4's build finds either unreachable from `/collections`, C152 loses that half
  and the package reports it** — a recovery only ever points somewhere that works.
- **It never says "you can't".** C151 says what the deletion would do to other people. That is a
  fact about consequences, and it is the only framing that does not read as the product refusing the
  user their own data.
- **It does not apologise and it does not blame.** No "sorry", no "unfortunately", no "you'll need
  to". §7 test 4: blameless, no apology, at least one action.
- **It does not mention ownership transfer.** That feature does not exist. Naming it as the thing we
  have not built yet is a roadmap promise on a deletion dialog.

### 5.4 The one thing this copy must not paper over

If the build's answer is *"delete the account and cascade the collections anyway"*, **no string in
§5.2 is honest** — C145 would be describing the user's own data while other people's disappears. In
that case W7-4 has not met its exit criterion (*"a shared collection's other members do not lose
it"*) and the copy is not the fix. Branch B exists because refusing is the correct behaviour until
transfer is built. Escalated in §10.

---

## 6. W7-5 — the edges

**These are already written, already in the voice, and I am changing nothing.** W7-5 is a *visual*
package, not a copy package, and the fastest way for it to go wrong is a builder deciding the strings
need refreshing along with the styling.

| Surface | Key | Status |
|---|---|---|
| `src/app/error.tsx` | `SHELL_ERROR_COPY` | **Correct as shipped.** Kicker `On our side`, headline `This screen didn’t load.`, body `The fault is ours, not anything you did. Trying again usually clears it.`, actions `Try again` + `Back to the map`, `Reference {digest}` |
| `src/app/not-found.tsx` | `NOT_FOUND_COPY` | **Correct as shipped.** Kicker `Nothing to open`, headline `We can’t open this link.`, body names both possibilities without letting the reader tell which they hit, action `Back to the map` |
| `src/app/global-error.tsx` | `GLOBAL_ERROR_COPY` | **Correct as shipped.** Headline `This didn’t load.`, same body, same two actions |

Checked against the ban list: no "oops", no "something went wrong", no "error" in any headline, no
exclamation mark, no apology, sentence case throughout, and each screen carries **two** actions where
one would satisfy the rule. `Back to the map` is the same eight-character label the import failure
screens use, deliberately — `error.tsx:23` cites the backlog's *"four labels for one action"* defect
and refuses to be the fifth.

**One difference that is correct and must not be "fixed" into consistency.** `global-error.tsx` has
no kicker and its headline is `This didn’t load.` rather than `This screen didn’t load.`. Both are
deliberate: that file replaces the whole document, so there is no *screen* left to name, and it
cannot see the stylesheet that gives a kicker its treatment (`global-error.tsx:8–21`). Adding a
kicker there would render as unstyled 11px text.

**What W7-5 may change:** the wash, the mark, the type, the button geometry, the inline SVG in
`global-error.tsx`. **What it may not:** any string in the three exported copy objects. A unit test
already pins them; if a test starts failing, the string changed and that is the finding.

---

## 7. W6-5 — the no-places screen

**Confirmed: `spec-no-places-found.md` is authoritative and its strings do not change.** Quoted here
so a build agent cannot drift, but the spec is the source — if this table and §5 of that document
ever disagree, **the spec wins** and this table is wrong.

### 7.1 The screen, by case (`spec-no-places-found.md` §5.1)

| Case | Kicker | H1 | Body |
|---|---|---|---|
| **A** no caption | `NO CAPTION` | `This one has no caption.` | `We opened it fine — there’s just no caption to read. Some TikTok videos only show the place on screen.` |
| **B** nothing named | `WE READ IT` | `No places in this one.` | `We read the caption, and it doesn’t name a place we can put on a map. Some TikTok videos only show the place on screen.` |
| **C** area only | `WE READ IT` | `No places in this one.` | `We read the caption. It points at {cityHint}, but doesn’t name the place itself.` |

> **Amended 2026-08-31**, and the amendment is itself the rule working. `Some TikToks…` became
> `Some TikTok videos…` **in the spec first**, and this table follows it — not the other way round.
> §7's whole point is that the spec is the source; if this table had moved alone it would have become
> the fourth wording of a string that already had four.

### 7.2 The add-by-name block (`spec-no-places-found.md` §5.2), unchanged

`Know where this one is? Add it by name.` · `Search for a place` · `Search →` · `Searching…` ·
`Near {cityHint}` · `Search everywhere instead` · `No places match "{query}."` + `Try a different
name.` · `Search isn’t working right now. Try again in a moment.` · `You’re offline. Check your
connection and try again.` · `Add to my map →` · `We’ll link it to this TikTok video.` ·
`Back to results` · `Adding…` · `Couldn’t add that one. Try again.`

Secondary: `Try another TikTok link` and `Back to the map`, both read from
`IMPORT_ERROR_ACTION_LABEL`.

The source row's label chain is `@{authorHandle}’s TikTok video` → `{authorName}’s TikTok video` →
`This TikTok video`, with `@handle on TikTok` as the **all-three-or-none** fallback if the long form
truncates in the 48px row (`spec-no-places-found.md` §4.3).

### 7.3 Where the spec and the running code disagree — three places, flagged as asked

**1. The body sentence.** Four wordings of one string exist right now:

| Source | Wording |
|---|---|
| `ux-architecture.md` §12 **C70** | `We read it, but it doesn’t name a place we can put on a map. Some TikToks only show the place on screen.` |
| `import-page-client.tsx:1367–1370` (live) | `We read @{handle}’s TikTok, but it doesn’t name a place we can put on a map. Some TikToks only show the place on screen.` |
| `import-page-client.tsx:1803` (dead `n === 0` branch) | `This TikTok didn’t call out a specific spot by name. That happens a lot.` |
| `spec-no-places-found.md` §5.1 case B | `We read the caption, and it doesn’t name a place we can put on a map. Some TikTok videos only show the place on screen.` |

The first three rows are quoted **as they stood on 2026-08-31 before the noun→adjective pass** — they
are the historical record of the drift and are not rewritten. Only the spec row, which is the wording
that ships, carries the amendment.

**Ruling: W6-5 ships the spec's wording.** This is a deliberate exception to
`voice-and-vocabulary.md` §6's *"the running code wins"*, and the reason is narrow: §6's ruling was
written for strings that **nobody specified** and that the code had quietly improved. This string
*is* specified, by a ratified document with an owner and a task ID, and W6-5's whole job is to build
that document. The code here is what the spec is replacing, not evidence against it.

**2. `import-page-client.tsx:1803` uses a banned word.** `didn’t call out a specific **spot** by
name` — *spot* is `voice-and-vocabulary.md` §3's first banned word (*"two competitors' brand
names"*), and `That happens a lot.` is deleted by `spec-no-places-found.md` §5.1 as the sentence that
edges toward defending the hit rate. Both live in the dead `n === 0` branch that **W1-6 deletes**.
Recorded so the deletion is understood as a voice fix as well as a dead-code fix — and so that if
W1-6 slips, W6-5 knows this line must not survive.

**3. `NO_CAPTION`'s copy-map entry may be dead.** `import-error-copy.ts:200` holds a whole
no-caption screen (`No caption in this one.`) while `spec-no-places-found.md` §10.7 records that the
route returns `caption: null` with zero candidates rather than throwing `noCaption()`. If case A is
the only no-caption screen, this entry is a second one nobody can reach. **Verify before deleting** —
the spec says the constructor may still be reachable from `runImport`. Not tonight's work; recorded.

---

## 8. Closing the §6 drift — the corrections `ux-architecture.md` §12 is owed

`voice-and-vocabulary.md` §6 found the deck and the code disagreeing on two screens and ruled that
**the running code wins and the deck is updated to match**. I did the deck side. **It is worse than
two rows** — I found eight, and one of them is a row for a state that no longer exists.

**I have not edited `ux-architecture.md`.** Another agent may hold it. The orchestrator lands this
list.

| # | Row | Currently says | Must say | Because |
|---|---|---|---|---|
| 1 | **C94** first run body | `Paste a TikTok you saved and we’ll put its places on the map.` | `Paste a TikTok link and the places it talks about land on your map.` | The shipped string (`place-sheet.tsx:823`, `EmptyLibraryLine`). §6's ruling, and *land on your map* is the product's own best verb |
| 2 | **C70** F10 body | `We read it, but it doesn’t name a place we can put on a map. Some TikToks only show the place on screen.` | `We read the caption, and it doesn’t name a place we can put on a map. Some TikTok videos only show the place on screen.` | `spec-no-places-found.md` §5.1 case B. **The one place a spec beats the code** — §7.3 gives the reasoning. Add rows for cases A and C, which the deck has no ids for at all |
| 3 | **C71** F10 actions | `Try another TikTok` · `Add a place you know` · `Open the TikTok` | `Try another TikTok link` (secondary) · the embedded name search (primary) · `@{handle}’s TikTok video ↗` in the source row | `spec-no-places-found.md` §4.3, §5.3 and §12. Opening the original appears **once**, at the top, not as a footer link |
| 4 | **C98** empty area | `Nothing saved in this area.` + `Show all places` | **Retire the row entirely** | `active-area.ts:352`: the state *"is **gone**, and cannot recur: an area is defined by the places in it, so an unfiltered area always has at least one. That deletes the state `Show my places` existed to escape, and the button with it."* A deck row for an unreachable state is how it gets rebuilt |
| 5 | **C80** sheet peek count | `{n} places saved` / `1 place saved` | `12 in London` · `12 in London · +20 more` — the short form from `areaHeading`, split into `heading.count` + `heading.shortRest` | `place-sheet.tsx:346–363`. The comment there names `20 places saved` as what it replaced. The deck is a generation behind |
| 6 | **C84 · C85** sheet headings | `Near you` / `In this area` | Replace both with `areaHeading`'s family: `12 places in London` · `1 place in London` · `12 places in this area` · `3 matches in London` · `No matches in London` · `Nothing matches "momos"` · `Nothing tagged "Momos"` · `7 to go in London` · `You’ve been to all of them.` | `active-area.ts:343–368`. Two deck rows do not describe a nine-string family, and the visit filter's own nouns are load-bearing (the generic version produced `Nothing tagged ""`) |
| 7 | **C74 · C75** location | `Location is off, so we’re showing this area instead.` + `How to turn it on`; `Couldn’t find your location.` | The four shipped notices: `Location is off for this site. Pick an area from your list instead.` · `This browser can’t share your location. Pick an area from your list instead.` · `Couldn’t find your location. Try again, or pick an area from your list.` · `Your location is only rough here, so distances are hidden.` | `near-me.ts:145–162`. **`How to turn it on` does not exist and must leave the deck** — a deck row naming an action nobody built is how it gets built by accident |
| 8 | **C06** invalid link | `That doesn’t look like a TikTok link.` — note: *"On blur/submit only."* | Same string. Note becomes: *"`MALFORMED_URL` only. `UNSUPPORTED_HOST` and `UNSUPPORTED_URL` get their own screens — this sentence is false for all three of an Instagram link, a profile link and a photo post."* | `import-page-client.tsx:332–349` documents that exact bug and its fix. The deck's note still invites it |

**Two more edits to §12 that are not rows:**

9. **The preamble's banned list** (`ux-architecture.md:1103–1104`) predates
   `voice-and-vocabulary.md` §4's additions. It must either gain *breadcrumb · crumb · to crumb ·
   crumby/crummy · "no crumbs left!" · hidden gem · bussin · slaps · ate*, or — better — be replaced
   by a pointer to `voice-and-vocabulary.md` §4, so there is one list rather than two that drift.

10. **C62** (F9 actions) lists `Add a place you know`, and `import-error-copy.ts:161` ships
    `['retry','open_tiktok','another_tiktok']` with the comment *"minus the manual add that has no
    destination"*. **Manual add shipped on 2026-08-30.** This is a behaviour question, not a copy
    correction: either the failure screens regain the action or the deck records the gate. **Not
    tonight** — no package owns it. Recorded so it is not lost.

**11. Added 2026-08-31 — the noun→adjective pass adds a third stack to the same §12 edit.**
[`tiktok-copy-pass-2026-08-31.md`](tiktok-copy-pass-2026-08-31.md) moves **17 more ids** (C01, C09,
C10, C22, C31, C60, C61, C62, C66, C67, C70, C71, C81, C89, C91, C96, C99). Three of them — C62, C70,
C71 — are already rows above, which is exactly why this must be **one §12 edit, not three**. C31 is
also a drift row in its own right: the deck says `From @{handle}'s TikTok`, and the shipped subline
(`review-screen.tsx:283`) has **no `From ` prefix** at all.

**And the rule that stops this recurring**, from `voice-and-vocabulary.md` §6: *a string changes in
code and the deck follows in the same commit, or it does not change.* Eight rows of drift, plus
seventeen more found by a vocabulary amendment a day later, is what happens without it. Every string
this run writes must land in §12 in the same commit as its code — including every id in this document.

---

## 9. Two scope rulings

### 9.1 W5-3 — may the tag facet show a tag no place carries?

**No. Confirmed, and it is not close.**

The facet is built from counts over the user's own rows. Every chip carries a count of at least 1 and
tapping any chip yields at least one place. A tag with no places is a control that does nothing,
which is worse than an absent control — and the deeper objection is `tag-filter.ts:22`'s own:
*"a control that means something slightly different from what it is is worse than no control."*

**The empty case: nothing renders.** When the library carries no tags at all, the facet row is
**absent** — not a disabled row, not a "no tags yet" line, not a placeholder. That is the rule this
codebase already applies twice: `profile/page.tsx:159` (*"a heading over nothing is a promise the
data cannot keep, which is the same rule the category filter bar follows"*). No string is needed
because nothing is shown, which is the point.

**The second empty case, which the package does not name.** When another filter is on and a tag's
count falls to 0, that chip is hidden — **except the active tag**, which stays visible at 0 so its
own pill remains the way to undo it. A control that removes itself when you use it strands the user.
The exact recompute is `ux-interaction`'s to design; the boundary I am ruling is the one above, and
this is my recommendation inside it.

**Acceptance:** for every rendered chip, tapping it yields ≥ 1 place; with a library that has no
tags, `grep` finds no facet element in the rendered output. Both checkable without a browser.

### 9.2 W6-3 — can the held payoff count be honest when the modal outcome is zero?

**Yes, by not running at zero. Ruling: the count beat does not execute when N = 0.**

`3 places found` held ~700ms with a 0→N tick is right for N ≥ 1 and wrong for N = 0 in three separate
ways. A Number Flow tick from 0 to 0 is 700ms of the product animating nothing. `No places found`
held as a payoff beat stages a non-event as an event. And the run's own §8a Q3 forbids presenting one
kind of content in the register of another — a beat whose whole grammar says *here is your result*,
playing on the outcome that has no result, is that.

**What happens instead at N = 0:** the rail's existing settled fact — `No places named`, C15,
shipped, and `spec-no-places-found.md` §6.1 explicitly says to leave it alone because *"it is the
sentence that makes the transition read as a result rather than a jump"* — takes **the same ~700ms
hold**. Same duration, same rhythm, no counter, no tick.

That is what keeps the no-places screen a **destination rather than a failure**: it is arrived at on
the same beat as a success, at the same pace, and the only thing that differs is the true sentence.
Rushing to it — or worse, animating a zero on the way — is how the product's most common outcome
starts reading as its failure mode. §8a Q2's *"honest beat"* is precisely this, and it is a graded
gate.

**N = 1:** `1 place found` (C14), tick 0→1. A one-step tick is fine and the plural must be right.

**Acceptance:** a unit test asserts the payoff state is not overwritten in the same batch (the
package's own criterion) **and** that with `candidates.length === 0` no count component mounts. Both
are assertions about state, not about pixels.

---

## 10. Genuinely the owner's decision, not mine

Four, in the order I would want them answered. None blocks tonight — I have given each a default the
run can build against, and the default is the conservative one in every case.

1. **W7-4: refuse, or cascade?** If a user owns a shared collection, do we refuse the deletion
   (§5.3) or delete anyway and take other people's collections with it? I have written **refuse**
   because it is the only branch that meets the package's own exit criterion, and because
   `security-privacy` holds a veto here that I cannot override. But *"a user cannot delete their
   account until they tidy up"* is a real product cost on a right people are entitled to, and
   whether we accept it is the owner's call. **The third option — build ownership transfer — is out
   of scope tonight** (it needs a migration, and §3 rule 8 forbids one).

2. **W4-1: does the meta description carry the name?** §1.3 rules **no**, because the title carries
   it one line above. The counter-argument is that a shared link in a chat is where a stranger meets
   the product. Cheap to reverse; the alternative string is written and sitting in §1.3.

3. **W5-2: is `Nearest` gated on a location fix?** §4.2 rules **yes** — absent without a fix, which
   makes W5-2 a two-or-three-option control rather than a three-option one. The alternative is an
   always-present sort by distance from the map centre, which needs a longer and worse label. This
   one changes what a verifier sees, so it should be answered before W5 closes rather than after.

4. **C62 / the failure screens' missing manual add** (§8 row 10). Manual add shipped; the failure
   screens still withhold it under a rule that no longer applies. No package owns this. It is a
   small, real improvement to the product's worst screens and I would schedule it — but it is a
   behaviour change with no owner tonight, so it goes on the Future list rather than into a wave.

---

## 11. How a verifier checks this document

Every acceptance line above is a `grep`, a unit-test assertion or a comparison of two literals. None
of them requires running the app, and none requires asking me. That is deliberate: under concurrency
the working tree holds several agents' half-finished work and proves nothing, so each check names the
file it reads and is true or false of a **commit**.

Where a check does need a browser — the badge's width at 320px (§3.2), the five-cards-cold read
(W6-4's own criterion) — I have said so, and those belong to §8a's judged gates and to
`qa-reliability`, not to a string.

**Base for everything here: `1b79e9c`.** If a file has moved under a package's hand since, the quote
may be stale — re-read it, trust your reading, and tell the orchestrator which quote was wrong.

---

## 12. W5-6 follow-up — the collection description field

**Added 2026-08-31, after W5-6 shipped.** The description now renders on the index and on the
collection header, and **no code path can put anything in the column**: `useCreateCollection` passes
`''`, and the rename form passes `collection.description ?? ''` straight back
(`collection-content.tsx:491`). The field is permanently empty. `updateCollection` already takes and
validates a description and `0024` already grants the update, so the gap is a form field and the
strings below.

### 12.1 Does *description* survive as the word?

**Yes, and the vocabulary table needs a row saying so.**

`voice-and-vocabulary.md` §3 bans *description* in the **note** row, and reading that row's own *Why*
settles it: *"a note is the user's own sentence about **a place**."* The ban is scoped to a place's
note. A collection's description is a different object at a different level, and the table simply has
no row for it — an absence, not a prohibition.

Three things make keeping the word the right call rather than the lazy one:

- **It already ships as a user-facing string.** `validateCollectionDescription`
  (`domain/collections/collection.ts:91`) returns `That description is 12 characters too long. The
  limit is 500.` Choosing a second word for the label would put the label and its own error message
  in disagreement on first use, and fixing that means editing `domain/` — outside a ten-line commit.
- **`note` is the one word that must not be reused here.** A place inside a collection already has a
  shared note (`COLLECTION_ITEM_NOTE_MAX_LENGTH`, *"the shared note on one place"*). Calling the
  collection's line a note too would put one word on two objects **on the same screen**, which is
  exactly what §3's "one word per thing" exists to prevent — in the other direction.
- **`About` was the alternative and it loses on the same ground.** It is a fine label and a fourth
  name for a thing the column, the validator, the error message and two shipped docblocks already
  call a description.

### 12.2 The strings

| id | Element | File / key | String |
|---|---|---|---|
| **C160** | Field label | `src/components/collections/collection-content.tsx`, the rename form's second `<label>` | `Description` |
| **C161** | Field placeholder | same field | `Places from the Lisbon trip` |

**No `(optional)` qualifier.** The name field carries no `(required)`, so qualifying one and not the
other only reads correctly to someone who already knows the convention. The field saves blank and the
user learns that for free — which is also why the label must not imply an incomplete collection, and
`Description` does not.

**C161 is an example, not an instruction.** The label already says what the field is; a placeholder
repeating that (`What’s in this collection`) is the field saying its own name twice. An example shows
the register — short, concrete, the owner's own sentence — which is the thing a label cannot teach.
Checked against §3 and §4: no banned word. Note that `ate` is on §4's banned list, so the obvious
first draft (`Places we ate on the Lisbon trip`) does not ship — a banned-word grep would flag it and
the grep is right.

### 12.3 One recommended extra word, and it is the lead's call

The menu row that opens this form says **`Rename`** (`collection-content.tsx:588`), and so does the
form's only label (`:504`). With a second field, both become wrong: a control named `Rename` that
opens a form editing two things is mislabelled.

**Recommended, three words total:**

| id | Element | Currently | Becomes |
|---|---|---|---|
| **C162** | Menu row | `Rename` | `Edit` |
| **C163** | First field label | `Rename` | `Name` |

`Edit` bare rather than `Edit collection`: its siblings carry the noun (`Delete collection`, `Leave
collection`) because they are destructive and need the object named; `Share` next to them is already
bare. `Save` and `Cancel` are unchanged.

**This is optional and the run can ship without it** — C160 and C161 alone meet the gap. But a form
whose two sibling labels are a verb and a noun is a defect a reviewer will file later, and it is one
word each.

### 12.4 Three build notes that are not copy but prevent a real defect

1. **It is a `<textarea>`, not an `<Input>`.** `validateCollectionDescription`'s docblock says
   *"Newlines survive; it is prose, not a label."* A single-line input silently forbids the newlines
   the domain deliberately preserves.
2. **Import the limit, do not retype it.** `COLLECTION_DESCRIPTION_MAX_LENGTH` is exported and is
   500. The name field beside it currently hard-codes `maxLength={80}` where
   `COLLECTION_NAME_MAX_LENGTH` exists (`add-sheet.tsx` imports it correctly) — do not add a second
   instance of that.
3. **`<bdi>` and `dir="auto"` on the field**, matching the name input above it and the two render
   sites W5-6 shipped. A Hebrew description typed into an LTR field is the ordinary case here.

### 12.5 The rows `voice-and-vocabulary.md` §3 is owed

**I have not edited that file** — it is not in tonight's write scope and another agent may hold it.
Same pattern as §8: the orchestrator lands these.

| # | Row | Currently says | Must say | Because |
|---|---|---|---|---|
| 1 | **note** | Why: `A note is the user's own sentence about a place` | `A note is the user's own sentence about a place. *description* is banned **as a word for a place's note** — a collection's own line is a different object and keeps the word; see the row below` | The ban reads as absolute and is not. Without this, the question gets re-asked every time someone meets `collections.description` |
| 2 | **new row** | — | `**description** (a collection's) \| about · summary · bio · caption \| The collection's own line, written by its owner. Distinct from **note**, which belongs to a place. It is the column name, the validator's word, and already in a shipped error string` | One word per thing, and this thing had no row |

### 12.6 Acceptance

1. `updateCollection` receives the field's own value, not `collection.description ?? ''`.
2. A description typed, saved and reloaded renders on both the index and the collection header.
3. An empty description saves and renders nothing — no empty `<p>`, no placeholder text persisted.
4. A 501-character description is refused with the validator's existing message; no second message
   is written.
5. `grep -n "maxLength={500}"` finds nothing — the constant is imported.
6. The field element is a `textarea`.

## 13. The screen for a spent model allowance (`r2-quota`)

> Ruled in [`product-ruling-quota-copy-2026-08-31.md`](product-ruling-quota-copy-2026-08-31.md) §3
> and built in the same change. **The three strings are fixed by that ruling and are not this deck's
> to improve** — each word was chosen against a measured fact, and paraphrasing any of them puts
> back a promise the product cannot keep.

### 13.1 Why this screen exists

Every existing string for this state was false. When the model provider's daily allowance is spent,
the failure collapses into `EXTRACTOR_UNAVAILABLE`, whose screen says *"That one's on us, not on the
video. We've already got it, so a retry is quick."* with **`Retry` as the mint primary** — an
invitation to discover, repeatedly, that it is not quick and will not work again today. The other
candidate, the retired per-user rate-limit screen, blamed the user for someone else's usage.

The state now has its own error code, `EXTRACTOR_QUOTA_EXHAUSTED`, so the news can be distinct.

### 13.2 The strings

| ID | Surface / state | String |
|---|---|---|
| **C170** | Can't find places today, headline | `We can’t find places right now.` |
| **C171** | Can't find places today, body | `We read it fine. Try it again tomorrow.` |
| **C172** | Can't find places today, actions | `Back to the map` — no retry, no second link |

The kicker is `Not right now` and the mark is `waiting`, both from the ruling. Typographic
apostrophes, matching every neighbouring entry.

**Ids checked, not assumed.** `C170`–`C172` were re-grepped across `docs/` immediately before this
edit, per the ruling's criterion 19: the highest allocated id elsewhere is `C163` (§12.3), and the
three are free. No substitution was needed, so §9 of the ruling records none.

### 13.3 Why each word

**`find places`, not `read`.** §3 of `voice-and-vocabulary.md` assigns the two verbs to the two
stages and the product ships both: `Reading the TikTok video…` (C09) is stage A, `Finding the
places…` (C12) is stage B. Stage B is what failed, and *read* here would contradict the body one
line below it.

**`right now`, not `today`.** A provider ceiling can be per-minute as well as per-day, and nothing
in the codebase reads the provider's error body to tell them apart. `right now` is true under either
reading; `today` can be flatly false.

**`tomorrow`, and it is deliberately conservative.** It is advice, not a claim about the world, and
it is the only duration that cannot over-promise: it holds whether the ceiling was a day or a
minute. A user who returns early finds it working, which is the harmless direction.

**`We read it fine.` is the load-bearing sentence.** Every other screen in this family is about the
link, so the user's trained response is to fetch a different one — which fails identically and
wastes their afternoon. This is the one screen where that instinct is wrong, and four words turn it
off. It is also *measured*: the extractor is stage B and the source fetch is stage A, so by the time
this failure can be raised, oEmbed has already returned the caption.

**What is deliberately not said.** Not that the allowance is *shared*, and not that an allowance
exists: it leaks our machinery (§7.3), the user cannot act on it, and it invites exactly one
follow-up — *shared with whom?* — whose honest answer, in front of a grader, is *with the agents
that built this*. No apology, no cause, no brand name; a failure screen is not one of the six
surfaces the name may appear on.

### 13.4 One action, and the rule behind the two that are missing

`Back to the map` alone. It renders as the mint primary because it is `actions[0]`, and that is
correct — leaving *is* the recovery here, which is true on no other screen in this family.

- **No `Retry`.** Same allowance, same second. Carried as `retryable: false` in the taxonomy and not
  only in the copy table, so a server response cannot put the button back.
- **No `Try another TikTok link`.** The next link spends the same empty allowance. The same lie in a
  smaller font.
- **No `Open on TikTok`, and this one is a repo rule rather than a preference.** Across the shipped
  table, `open_tiktok` appears on exactly the codes where **the read failed**, and on none of the
  three where it succeeded. Stated for the repo: *`open_tiktok` is offered exactly when we could not
  read the video, never as a consolation when we could.*
- **Manual add is deferred, not cut.** Two conditions, both from the ruling §8: the action must
  actually be wired from the failure screen, and the second pool must be checked — `addPlaceManually`
  spends Google Places' own 100/day, which can also be empty, and sending a user from one exhausted
  pool to another is the same defect relocated.

### 13.5 The documents that move with the strings, landed in the same change

`voice-and-vocabulary.md` §6: *a string changes in code and the deck follows in the same commit, or
it does not change.* Three edits, all inside §12.4 and nowhere else in that file:

| # | Row | Change |
|---|---|---|
| 1 | **C67** — `You've added a lot of TikTok links in the last few minutes. Try again shortly.` | **Retired** in the C85/C98 style: the row stays, the string is struck, and the note records that it described a **per-user limit the product does not have** and, shown for the state that does occur, blamed the user for someone else's usage |
| 2 | **C68** — `You've tried this a few times. Give it a few minutes.` | Retired, same style — and it promised a wait of minutes for a ceiling that can be a day |
| 3 | **C170**, **C171**, **C172** | Added to the same table, verbatim from §13.2, each with the reason for its wording |

Three more documents carried the retired code and were corrected in the same change, each only in
the section that named it: `07-import-execution-model.md` §9's table row and its per-user-limit
paragraph, `technical-design.md`'s copy of that table, and `security.md` R-1.

**`security.md` R-1 stands and must not be read as closed by any of this.** No per-user limiter has
been built, and nothing in this change — code, comment or document — claims one has. What changed
there is one sentence of R-1's *evidence*, not its verdict: the code it cited as unreachable has
been removed rather than left standing as a false signal that a limit is in place.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-31 | Created for the overnight run. Wrote final copy for seven surfaces (W4-1 identity, W1-5 the non-TikTok link, W1-4/W6-4 provenance, W5-1/W5-2/W5-5 the library, W7-4 deletion, W7-5 the edges confirmed unchanged, W6-5 confirmed frozen against its spec) with ids `C100`–`C155`. Corrected the run sheet's W4-1 criterion, which cited three strings in a section that has none. Recorded that W1-5 overrides a shipped owner ruling of 2026-08-29 and that the docblock stating it must be rewritten in the same commit. Found the `ux-architecture.md` §12 drift to be **eight rows, not two** — including `C98`, a row for a state `active-area.ts` records as gone and unreachable, and `C74`'s `How to turn it on`, an action nobody built. Two scope rulings: the tag facet may never show a tag no place carries and renders nothing when there are none; the held payoff count does not execute at N = 0, where the rail's existing `No places named` takes the same hold instead. Four decisions escalated to the owner, each with a conservative default the run can build against |
| 2026-08-31 | **TikTok noun→adjective pass**, per [`tiktok-copy-pass-2026-08-31.md`](tiktok-copy-pass-2026-08-31.md) and `voice-and-vocabulary.md` §3.1. **C110** becomes `That link isn’t from TikTok.` — the repair is to the claim, not only the grammar. §7's frozen quotes of `spec-no-places-found.md` follow **the spec, which moved first**; §7.3's four-wordings table keeps its first three rows as the historical record and amends only the row that ships. §8 gains row 11: the pass moves **17 further §12 ids**, three of which are already rows above, so §12 takes **one** edit and not three. Also recorded there: **C31 is a drift row on its own** — the deck says `From @{handle}'s TikTok` and the shipped subline has no `From ` prefix |
| 2026-08-31 | §12 added after W5-6 shipped a field no code path can fill. Ruled that **description survives** as the word for a collection's own line — §3's ban is scoped to a place's note, the word already ships in `validateCollectionDescription`'s error string, and `note` is the one alternative that must not be reused because a place inside a collection already has one. `C160` label, `C161` placeholder (an example, not an instruction; the obvious first draft used `ate`, which §4 bans). `C162`/`C163` recommended: a menu row saying `Rename` that opens a two-field form is mislabelled. Two rows owed to `voice-and-vocabulary.md` §3, not edited here |
| 2026-08-31 | §13 added for `r2-quota`: the screen shown when the model provider's daily allowance is spent, which until now rendered `EXTRACTOR_UNAVAILABLE`'s *"a retry is quick"* with a `Retry` primary — false for the rest of the day. Three strings, `C170`–`C172`, **fixed by [`product-ruling-quota-copy-2026-08-31.md`](product-ruling-quota-copy-2026-08-31.md) §3 and not paraphrasable**; ids re-grepped across `docs/` immediately before writing, per that ruling's criterion 19, and free (highest allocated elsewhere: `C163`). Records the repo rule the ruling derived from the shipped table — *`open_tiktok` is offered exactly when we could not read the video* — and, in §13.5, the C67/C68 retirement rows owed to `ux-architecture.md` §12.4, which this lane does not hold |
