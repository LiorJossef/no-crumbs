# Voice and vocabulary — No Crumbs

> **Binding from 2026-08-30.** This document governs every user-facing string in the product. It does
> not replace [`ux-architecture.md`](ux-architecture.md) §12, which remains the copy deck — the list of
> strings that ship. This is the layer above it: the rules a new string has to pass before it earns a
> row in that table.
>
> Interactive version, with the before/after pairs rendered:
> [`no-crumbs-design-system.html`](no-crumbs-design-system.html) → The Voice.

## 1. The one rule

**The name is the only joke in the product. Every string after it states a fact and stops.**

This is not a style preference. Two existing rules already require it and it is worth naming both,
because a brand word is exactly the thing that erodes them:

- `brand-and-product-foundation.md` §4 rule 1 — *state, don't perform*. Substituting the brand word
  for the news **is** performing.
- `spec-no-places-found.md` §7.2 — no idioms, puns or wordplay in any string, for translation. The
  name is exempt because it is a proper noun. **Nothing else is.**

A funny name buys exactly one laugh, at install. Spend it there.

## 2. Where the name may appear

Six surfaces, and this is the complete list:

1. The shell header wordmark
2. The landing and sign-in mark
3. The browser tab title
4. The meta description
5. The app icon
6. The deck

**Banned everywhere else**, and specifically: every failure and error string; every toast (this is
where brands break first); empty and first-run states; place detail and the review screen, or anything
describing *a place*; collection default names and invite copy; nav labels, button labels, category
labels. **Never as a verb.**

The test that settles arguments: `No crumbs in this one.` was proposed for the no-places screen and
**rejected**. It substitutes the brand for the news on the screen users see most; the pun half-works
on a product full of restaurants, where it reads for a beat as *no food places*; and it breaks §7.2.
The screen ships unchanged as `No places in this one.` — the rename touching zero strings there is the
name passing its health check, not a gap.

## 3. Vocabulary — one word per thing

The left column is what we say everywhere: interface, docs, support, the deck. The right column is
what we never say, **including words the database happens to use**.

| We say | Never | Why |
|---|---|---|
| **place** | spot · location · venue · POI · entry · item | The product's noun. *Spot* is two competitors' brand names; *POI* and *entry* are database words |
| **your map** | the map · dashboard · home · feed | The possessive is the product. It is private, and saying so costs one word |
| **a TikTok link** · **a TikTok video** | a post · content · media · **and “a TikTok”, “TikToks”, “this TikTok” — the bare noun** | TikTok is the only supported source, and naming it is still the honest boundary — carried in the product rather than in a footnote. But the name is an adjective, never a noun: **`Add a TikTok link`**, not `Add a TikTok`. See §3.1 |
| **link** | URL · address · permalink | What a person copies is a link |
| **collection** | list · board · folder · album | Already shipped and already consistent. Do not introduce a second word |
| **Been** / **Not been yet** | visited · want to go · wishlist · bucket list | Ratified in `ui/place/visit-state.ts`. *Visited* is a system fact about a record; *been* is what a person says |
| **Been there** / **Not been yet** / **All places** | been (bare, as a filter option) · all (bare, as a control label) | The visit *filter's* three option labels, 2026-09-02. The axis is named `Been`, so an option also called `Been` made the group and its own answer the same word — the owner read it as unintuitive. `Been there` is the same ratified word with the subject a menu row needs. `All places` appears **only as a row**: the trigger shows the axis name until something is picked, because a filter button labelled `All` names the absence of itself |
| **add** | import · ingest · sync · scrape | You add a place. Everything else describes our machinery |
| **found** | extracted · detected · identified · parsed | Banned vocabulary, and *found* is shorter and truer |
| **reading** | fetching · processing · analysing | Already the shipped rail copy |
| **matching** | geocoding · resolving · disambiguating | Nobody outside the codebase has geocoded anything |
| **category** | type · kind · cuisine | There are exactly three, and they are what a venue *is* |
| **tag** | label · keyword · sub-tag | *Sub-tag* is `places/taxonomy.ts`'s internal word. Users see tags |
| **note** | comment · description · memo | A note is the user's own sentence about a place |
| **near you** | nearby · proximity · within radius | Second person, always |
| **shared with you** | collaborator · member · invited user | *Member* is a table name. Nobody is a member of a list of restaurants |

### 3.1 The TikTok row is an adjective — amended 2026-08-31

The original row ratified **“a TikTok”** as our noun, reasoning that TikTok is the only supported
source and naming it is the honest boundary. **That reasoning survives intact and is why the word
stays on our most-read screens.** What changed is the grammar, not the honesty: `Add a TikTok link`
names the boundary exactly as squarely as `Add a TikTok` did, in one more word.

The trigger is TikTok's Brand and Use Guidelines — *“Always use TikTok as an adjective, never as a
noun or verb”* — recorded in
[`docs/evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md`](evidence/tiktok/09-brand-mark-and-attribution-2026-08-31.md)
§10. Hold its status honestly: **VERIFIED that TikTok published it, NOT verified that it is
current.** It was retrieved from an archived revision; the live guidelines hub is behind a
request-access form. That is weaker evidence than the logo rule in the same document, which has live
corroboration, and the two are deliberately not averaged.

We follow it anyway, and the reason is not legal caution. **It is a genuinely better sentence.**
`Add a TikTok` asks the reader to parse a proper noun as a count noun and silently supply the missing
word; `Add a TikTok link` says what the person is actually about to paste. The rewrite costs one
word on eleven strings and buys clarity on every one of them — we would take it with no guideline at
all.

**The test, which outlives the guideline:** *does the word point at the platform, or has it become
the name of the thing?* Pointing is fine — `saved from TikTok`, `Open on TikTok`, `Paste a TikTok
link`. Becoming the thing is not — `a TikTok`, `TikToks`, `this TikTok`. A plural settles itself:
you can only pluralise a count noun, so **`Some TikToks…` is always wrong** and becomes
`Some TikTok videos…`.

**First reference carries the adjective; a later one on the same surface need not.** `a TikTok
video` establishes what we are talking about — a second mention two lines down may say `the video`,
because that is how English refers back, and repeating the full form twice in one viewport reads as
a legal notice rather than a sentence. This is the one place bare *video* is allowed, and it is
allowed as an **anaphor**, never as a synonym: it may only refer back to a TikTok video already named
on that screen. A surface that says `video` without ever having said `TikTok video` has broken the
row above, not used this clause. (The original never column banned *a video* outright; that ban was
about using it as a **substitute** for naming the source, which this does not do.)

**Where the possessive is the problem, rewrite the sentence.** `not your TikTok’s` admits no
adjective repair — `not your TikTok video’s` is a stacked possessive nobody says aloud, and
`not TikTok’s` changes the claim from *your post is fine* to *the company is not at fault*. When the
compliant options are all worse, the sentence itself is the thing to change. §3's rule is one word
per thing, not one shape per sentence.

The verb half of the clause needs no work: we have never shipped *“TikTok it”* or *“TikToking”*,
and §4 already bans that register.

**Attribution is untouched by this row.** Creator handle, video description and a link back to the
original are required beside embedded content and are already shipped — a copy pass must not cost
any of the three.

## 4. Banned outright

The ratified list from `ux-architecture.md` §12, unchanged:

> metadata · LLM · AI · model · geocode · extraction · pipeline · parse · API · endpoint · payload ·
> token · confidence score · retry queue · job · worker · "oops" · "something went wrong"

**Added 2026-08-30 by this document:**

> breadcrumb · crumb (as a noun for a place) · to crumb (as a verb) · crumby / crummy ·
> "no crumbs left!" · hidden gem · bussin · slaps · ate

- **breadcrumb** earns its place on the original list independently: it is navigation-component
  vocabulary.
- **hidden gem** is banned because the discovery is the user's and it is not ours to editorialise
  (§4 rule 4). `ui/place/category-display.ts` already refuses to invent a category for the same reason.
- The slang row is banned because the name already spent that budget.

## 5. Mechanics

- **Sentence case everywhere.** The only exceptions are the wordmark and the 11px tracked uppercase
  kickers, which are a typographic device rather than writing.
- **No exclamation marks. Ever.** Not in success, not in onboarding, not in an empty state. Confidence
  reads as brevity.
- **Digits, always.** `3 places`, never *three places*. Pluralisation is written per string; never
  `place(s)`.
- **One clause per string.** If a line needs a semicolon it needs to be two lines, or shorter.
- **Dates:** `3 Aug` within the year, `3 Aug 2025` otherwise.
- **Distances:** `320 m` under a kilometre, `1.4 km` above, `12 km` above ten.
- **In-progress takes a real ellipsis** (`…`) and only while something is genuinely running.
  Settled states drop it.

## 6. The drift, and the ruling that closes it

Found while writing this document: **the copy deck and the shipped strings disagree**, on the two
screens that matter most.

| Screen | `ux-architecture.md` §12 | The running code |
|---|---|---|
| First run (`C94`) | `Paste a TikTok you saved and we'll put its places on the map.` | `Paste a TikTok link and the places it talks about land on your map.` (`place-sheet.tsx`, `EmptyLibraryLine`) |
| No places (`C70`) | `We read it, but it doesn't name a place we can put on a map. Some TikToks only show the place on screen.` | A third variant again in `spec-no-places-found.md` §5.1, opening *"We read the caption…"* |

**Ruling: the running code wins, and the deck is updated to match it.** Both shipped strings are
better than their specified versions — *land on your map* is the product's own best verb, and the
caption wording is more specific about what we actually read.

**The rule going forward:** a string changes in code and the deck follows **in the same commit**, or it
does not change. Two sources of truth is how a third one gets written.

## 7. Before any new string ships

1. **Does it state a fact and stop?** If there is an adjective about how good something is, cut it. If
   there is an exclamation mark, cut it.
2. **Would the user say this word?** Check §3. If it is in the right-hand column, it does not ship.
3. **Does it name our machinery?** Anything about models, pipelines, parsing or jobs is a leak.
4. **If it is a failure, does it offer the next move?** Blameless, no apology, at least one action.
   This is roughly three quarters of what people read.
5. **Does it editorialise about a place?** We never call somewhere a gem, a must-visit or a find. The
   user made that judgement; we kept the record.
6. **Does it contain the brand name?** Then it is almost certainly wrong. Six surfaces may carry it.
