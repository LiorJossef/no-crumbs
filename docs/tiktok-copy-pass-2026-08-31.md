# TikTok noun → adjective copy pass — the rewrite table

> **Written 2026-08-31 by `product-lead`.** Table only. **No source file was edited.** A build lane
> lands this as one commit once the wording is signed off.
>
> **Rule:** [`voice-and-vocabulary.md`](voice-and-vocabulary.md) §3 and §3.1, read at HEAD from the
> working tree. The TikTok row now ratifies **"a TikTok link" / "a TikTok video"** and puts the bare
> noun — *a TikTok · TikToks · this TikTok · the TikTok* — in the *never* column.
>
> **The test, applied to every row below:** *does the word point at the platform, or has it become
> the name of the thing?* Pointing needs no change. Becoming the thing is the defect.
>
> **The word stays.** Every string here was compliant when it shipped; the spec moved under it. §3.1
> holds the evidence status honestly — **VERIFIED that TikTok published the guideline, NOT verified
> that it is current** — so a rewrite that damages the product is not justified by the rule alone.
> §5 lists the four places I think it does damage, for a ruling.

---

## 0. Rulings — read these before the table

**Signed off 2026-08-31 after two independent sweeps.** Where §2–§5 below and this section differ,
**this section is what ships**; the table is kept intact as the reasoning per string.

| # | Ruling |
|---|---|
| 1 | **`That link isn't from TikTok.`** — the repair is to the *claim*, not only the grammar. A link is never *a TikTok*; what is wrong with it is where it came from |
| 2 | **`collection-content.tsx:848`** ships the §2 rewrite as written |
| 3 | **`Open on TikTok` at three sites, not one.** `import-error-copy.ts:70`, `place-sheet.tsx:1809` (`Open TikTok`), and `import-error-copy.ts:149`'s body (`Open the post in TikTok` → `Open on TikTok`). §5.4's argument was accepted and extended — I had found two of the three |
| 4 | **§5.2 resolved by a rule, not an exception.** `voice-and-vocabulary.md` §3.1 was amended to say bare `video` is legal as an **anaphor** referring back to a TikTok video already named on that surface, never as a synonym. So `:246` ships `That one's on us, not on the video. It's worth a retry.` — the sibling construction at `:213`/`:224` rather than a third shape. **My instinct was right and now has a rule under it, which is the better outcome than an exception** |
| 5 | **The `post` ban stands, not narrowed.** A proposal to permit `post` as the artefact noun where TikTok is named in the same string was refused: our artefact noun is now `video`, and a vocabulary rule with an exception is how the table rots. Rulings 3 and 4 remove all three shipped instances between them |
| 6 | **`@handle's TikTok video`** at all five attribution sites, with `@handle on TikTok` as the **all-five-or-none** width fallback. Ratified as proposed (§4) |
| 7 | The straight→curly apostrophe fix (§6.2) and the eleven comment sweeps (§3) are in |

### Why two independent sweeps were worth the cost

This pass was swept twice, independently: **35 sites here, 17 strings across ~30 by `i5-tiktok-ui`
— and each caught sites the other missed. Neither list alone was complete.** That is the argument
for adversarial verification stated as a measurement rather than as a principle, and it is the same
rule as `CLAUDE.md`'s: *the agent that built a thing is never the sole source of evidence that it
works.* A copy sweep looks like the most mechanical work in the product and is exactly where a single
pass silently under-reports, because user-facing strings live in three syntactic shapes and a grep
tuned to one finds about half.

---

## 1. Method and scope

I re-ran the sweep rather than working from a list, in all three shapes: single-quoted constants,
template literals with interpolation, and bare JSX text on its own line. A single grep for `TikTok`
across `src/` returned **325 hits**; the great majority are identifiers (`onAddTikTok`,
`canonicaliseTikTokUrl`), prose comments, and strings that point correctly.

**Result: 35 user-facing string sites need a change, across 14 files** — more than the ~29 estimate,
because five sites are ternary arms that each need their own repair (`@handle’s TikTok` /
`This TikTok` is two strings, not one). Plus **11 comments** that quote a literal that moved.

Note the curly apostrophe `’` in most literals. **One exception found:** `use-import-run.ts:279`
and `:313` use a **straight** `'s` where every sibling string uses `’s`. That is a pre-existing
inconsistency in a user-facing string and the build lane should fix it while it is in there — §6.

---

## 2. The rewrite table, grouped by file

`▲` marks a row where I think the compliant version reads worse. All four are argued in §5.

### `src/ui/import/import-error-copy.ts` — 10 sites, the densest

| Line | Current | Proposed | Why |
|---|---|---|---|
| 70 | `open_tiktok: 'Open the TikTok'` | `Open on TikTok` | Points at the platform and is **shorter** than what it replaces — the rewrite that improves the string rather than patching it |
| 74 | `another_tiktok: 'Try another TikTok'` | `Try another TikTok link` | What the user does next is paste another link; the noun names the thing accurately |
| 111 | `headline: 'That link isn’t a TikTok.'` | `That link isn’t from TikTok.` | Same length, and truer — a link is never *a TikTok*; what is wrong with it is where it came from |
| 158 | `headline: 'We couldn’t read this TikTok yet.'` ▲ | `We couldn’t read this TikTok video yet.` | The bare noun in a 34px extrabold headline. See §5.1 |
| 159 | `body: 'Some TikToks don’t share enough…'` | `Some TikTok videos don’t share enough for us to work with. It’s worth a retry.` | §3.1: a plural settles it — you can only pluralise a count noun |
| 191 | `body: 'You’ve added a lot of TikToks in the last few minutes…'` | `You’ve added a lot of TikTok links in the last few minutes. Try again shortly.` | Plural. And *links* is what they added |
| 203 | `body: '…Some TikToks only show the place on screen.'` | `…Some TikTok videos only show the place on screen.` | Plural. Tail is C70's disclosure — see §7 |
| 213 | `body: 'That one’s on us, not on the TikTok. We’ve already got the post…'` | `That one’s on us, not on the TikTok video. We’ve already got it, so a retry is quick.` | Bare noun **and** a second §3 breach on the same line: *post* is in the never column. See §6 |
| 224 | identical string, `EXTRACTOR_INVALID_OUTPUT` | identical fix | The two entries deliberately share one message; they must change together |
| 246 | `body: 'The fault is ours, not your TikTok’s. It’s worth a retry.'` ▲ | `The fault is ours, not the video’s. It’s worth a retry.` | A possessive of a bare noun admits no adjective repair. See §5.2 |

### `src/app/import/screens/no-places-screen.tsx` — 6 sites

| Line | Current | Proposed | Why |
|---|---|---|---|
| 139 | `…Some TikToks only show the place on screen.` (case A) | `…Some TikTok videos only show the place on screen.` | Plural |
| 159 | `…Some TikToks only show the place on screen.` (case B) | `…Some TikTok videos only show the place on screen.` | Plural. **`spec-no-places-found.md` §5.1 must move in the same commit** — §7 |
| 213 | `` `@${probe.authorHandle}’s TikTok` `` | `` `@${probe.authorHandle}’s TikTok video` `` | Attribution — see §4 |
| 215 | `` `${probe.authorName}’s TikTok` `` | `` `${probe.authorName}’s TikTok video` `` | Same, name fallback |
| 216 | `'This TikTok'` | `'This TikTok video'` | Same, final fallback |
| 369 | `aria-label="The TikTok’s caption"` | `aria-label="The TikTok video’s caption"` | Read aloud, and judged by ear: *"the TikTok's caption"* spoken is already awkward; the repair is the more natural utterance, not the more compliant one |

### `src/app/import/screens/rail-screen.tsx` — 4 sites

| Line | Current | Proposed | Why |
|---|---|---|---|
| 46 | `source: 'Reading the TikTok'` | `Reading the TikTok video` | The stage label. §3 protects the verb *reading* — only the noun moves |
| 102 | `Adding your TikTok` (JSX) | `Adding your TikTok video` | The rail's H1 |
| 208 | `` `@${rail.post.authorHandle}’s TikTok` `` | `` `@${rail.post.authorHandle}’s TikTok video` `` | Attribution, matching no-places and review |
| 208 | `'This TikTok'` (the ternary's other arm) | `'This TikTok video'` | Same |

### `src/app/import/_lib/use-import-run.ts` — 4 sites

| Line | Current | Proposed | Why |
|---|---|---|---|
| 279 | `` `Read @${previewBody.authorHandle}'s TikTok` `` | `` `Read @${previewBody.authorHandle}’s TikTok video` `` | Rail fact. **Also fixes the straight apostrophe** — §6 |
| 280 | `'Read the TikTok'` | `'Read the TikTok video'` | Handle-less fallback |
| 313 | `` `Read @${body.authorHandle}'s TikTok` `` | `` `Read @${body.authorHandle}’s TikTok video` `` | Same fact on the non-preview path; straight apostrophe again |
| 313 | `'Read the TikTok'` | `'Read the TikTok video'` | Same |

These four are **C10** in the copy deck (`Read @{handle}'s TikTok`) — §7.

### `src/app/import/screens/paste-screen.tsx` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 74 | `Add a TikTok` (JSX, the screen's H1) | `Add a TikTok link` | §3.1's own worked example, verbatim |

### `src/app/import/screens/add-by-name.tsx` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 81 | `ADD_PROVENANCE = 'We’ll link it to this TikTok.'` | `We’ll link it to this TikTok video.` | `spec-no-places-found.md` §5.2 string — the spec moves with it (§7) |

### `src/app/import/screens/review/review-screen.tsx` — 2 sites

| Line | Current | Proposed | Why |
|---|---|---|---|
| 283 | `` `@${probe.authorHandle}’s TikTok` `` | `` `@${probe.authorHandle}’s TikTok video` `` | Attribution. This is **C31** in the deck |
| 283 | `'This TikTok'` (other arm) | `'This TikTok video'` | Same |

### `src/app/import/_lib/dev-screen.ts` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 205 | `sourceFact: 'Read @demo’s TikTok'` | `Read @demo’s TikTok video` | The dev harness renders the real rail; leaving it stale makes the harness disagree with production |

### `src/components/add/add-sheet.tsx` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 704 | `{busy ? 'Adding…' : 'Add this TikTok'}` | `Add this TikTok link` | The button only renders with a valid link in the field, so the noun is exact |

### `src/components/sheet/place-sheet.tsx` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 1391 | `Add a TikTok` (JSX, `NoPlacesYet`'s primary) | `Add a TikTok link` | The first-run screen's only button |

`1803` (`Open TikTok`) and `1365` (`Paste a TikTok link…`) **point and are correct** — but see §5.4,
which is about `Open TikTok` and `Open on TikTok` becoming two labels for one action.

### `src/components/sheet/place-desktop-panel.tsx` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 171 | `Add a TikTok` (JSX) | `Add a TikTok link` | The desktop twin of `place-sheet.tsx:1391`; the two must not diverge |

### `src/ui/place/active-area.ts` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 71 | `'Nothing left on your list. Paste a TikTok and it starts filling up again.'` | `Nothing left on your list. Paste a TikTok link and it starts filling up again.` | Bare noun in the visit-filter empty state |

### `src/components/collections/collection-content.tsx` — 1 site, rewritten not patched

| Line | Current | Proposed | Why |
|---|---|---|---|
| 848 | `You have no saved places yet. Import a TikTok first.` | `Nothing saved yet. Paste a TikTok link and your places show up here.` | **Two breaches on one line.** The bare noun, and **`Import`**, which §3 bans outright in favour of *add* (*"Everything else describes our machinery"*). Patching the noun would leave the worse of the two standing |

The rewrite does three further things the patch could not. `You have no saved places yet` is a
system reporting on the user; `Nothing saved yet` is the same fact without the accusation, and it is
the exact opening `profile/page.tsx:180` already ships for the same condition. It names the next
move, which the original never did — §7 test 4 requires one. And the closing clause is specific to
**this** screen (a collection's place picker): it says where the places will appear, which is the
one thing a user standing here needs to know.

### `src/components/brand/crumb-path.ts` — 1 site

| Line | Current | Proposed | Why |
|---|---|---|---|
| 220 | `state: 'Import running — “Reading the TikTok”'` | `state: 'Import running — “Reading the TikTok video”'` | The mascot mood table quotes `rail-screen.tsx:46`, which moves. Only the **quoted literal** changes — `Import running` is a description of our own machinery in a non-user-facing field, and is correct there |

---

## 3. The comment sweep

Comments that **quote a literal that moves**. Ordinary prose comments discussing TikTok are left
alone, per the brief.

| File | Line | Quotes | Action |
|---|---|---|---|
| `import-error-copy.ts` | 65 | `` `Open the TikTok` are C62; `Try another TikTok` is C71 `` | Both move |
| `import-error-copy.ts` | 132, 142, 144 | `` `Open the TikTok` `` ×3 | Moves |
| `import-error-copy.ts` | 231 | `` `Open the TikTok` is offered instead `` | Moves |
| `no-places-screen.tsx` | 126 | `` alongside `Some TikToks only show the place on screen.` `` | Moves |
| `rail-screen.tsx` | 116 | `` *"Import running — Reading the TikTok"* `` | Moves; keep it identical to `crumb-path.ts:220` |
| `rail-screen.tsx` | 274–275 | `` `Reading the TikTok` above `Read @demo's TikTok` `` | Both move |
| `use-import-run.ts` | 120 | `` "That link isn't a TikTok." `` | Moves |
| `use-import-run.ts` | 175 | `` `Open the TikTok` `` | Moves |
| `use-import-run.ts` | 216 | `` `'Read the TikTok'` `` | Moves |
| `use-import-run.ts` | 277, 392 | `` `Add this TikTok` `` | Moves |
| `import-page-client.tsx` | 332 | `` `Try another TikTok` clears it `` | Moves |
| `add-sheet.tsx` | 7, 509 | `` `Add a TikTok` `` / `` `Add this TikTok` `` | Both move |
| `place-sheet.tsx` | 402, 431, 1372 | `` `Add a TikTok` `` ×3 | Moves |
| `bottom-nav.tsx` | 42, 157, 192 | `` `Add a TikTok` `` ×2, `` `Add this TikTok` `` | All move |
| `map-page-client.tsx` | 90, 292, 1491 | `"Add a TikTok"` ×2, `` `Add this TikTok` `` | All move |
| `platform-mark.tsx` | 52–53 | `` `Open TikTok`, `@handle's TikTok`, `Add a TikTok` `` | The last two move; `Open TikTok` depends on §5.4 |
| `failure-screen.tsx` | 51–53, 69, 100, 118, 180, 322 | `"That link isn't a TikTok"`, `` `Open the TikTok` `` ×4, `` `Try another TikTok` `` | All move |

**Left alone, deliberately:** `paste-screen.tsx:151` (*"TikToks (`seed-links.ts`)"*),
`seed-links.ts:5–43`, `place-resolver.ts:9`, `score.ts:690`, `scoring-constants.ts:244` and every
other comment that discusses TikTok as prose without quoting a shipped string. Rewriting those is
churn, and §3 governs user-facing strings, not engineering prose.

**One judgement call:** `add-sheet.tsx:443` quotes `("Not TikTok")`, and `import-error-copy.ts:110`'s
`kicker: 'Not TikTok'` **does not move** — it uses the proper noun as itself, not as a count noun.
Leave both.

---

## 4. Attribution — checked, and it does not pull against the rule

`@handle’s TikTok` is an attribution string. The three requirements — creator handle, video
description, link back — are shipped and are non-negotiable
(`voice-and-vocabulary.md` §3.1: *"a copy pass must not cost any of the three"*).

**`@handle’s TikTok video` costs none of them.** It carries the handle, names the platform, and is
still the link's label. Nothing is weakened; one word is added.

I considered **`@handle on TikTok`**, which is shorter and is TikTok's own attribution register. I
rejected it as the primary proposal because it changes the referent: `@handle’s TikTok video` means
*this specific video*, which is what the link opens; `@handle on TikTok` names the creator's presence
and reads as a profile link. On the no-places screen the label sits beside a `↗` that opens one post.

> **Fallback if width bites.** `no-places-screen.tsx`'s source row is 48px with a thumbnail and an
> arrow, and this codebase has clipped a provenance string into that class of row before. If
> `@handle’s TikTok video` truncates at 320px, take **`@handle on TikTok`** — for **all five sites
> together**, never a mix. Two labels for one attribution is worse than either label.

---

## 5. Where the compliant version reads worse — four rulings wanted

### 5.1 `We couldn’t read this TikTok video yet.` ▲

`import-error-copy.ts:158`, C60. This is the F9 headline in `font-heading text-[34px]
font-extrabold` — the largest type in the failure family. One extra word in a headline that already
wraps to two lines on a 390px screen may push it to three.

**My recommendation: take it anyway.** The alternative repairs are worse. `We couldn’t read this
video yet.` drops the platform on a screen whose entire subject is the platform's post.
`We couldn’t read that link yet.` is false — we read the link fine; the post is what we could not
read. If it wraps to three lines, that is a type-size decision for `design-system-frontend`, not a
reason to keep an ungrammatical headline.

### 5.2 `The fault is ours, not the video’s.` ▲ — the word is dropped, and I could not avoid it

`import-error-copy.ts:246`. **This is the one row where I am breaking the "do not solve this by
deleting the word" instruction, and I want it ruled on rather than assumed.**

The original is `not your TikTok’s` — a **possessive of the bare noun**, which admits no adjective
repair. The mechanical fix is `not your TikTok video’s`, a stacked double possessive that no one
would say aloud. The other candidate, `The fault is ours, not TikTok’s.`, is grammatical and points
cleanly — but it changes the claim: it names TikTok the company as a possible-but-excluded culprit,
where the original meant *your particular post is not at fault*. That is a different sentence, and
on a failure screen it edges toward blaming a third party.

So I propose dropping to `the video’s`. The platform is named twice elsewhere on the same screen
(the kicker and the action labels), so the word is not lost from the surface — only from this clause.

**If you would rather keep the word here, `not your TikTok video’s` is the only compliant option and
I would ship it under protest.**

### 5.3 `Adding your TikTok video` / `Reading the TikTok video` ▲

`rail-screen.tsx:102` and `:46`. These two are on screen together for 7–34 seconds, one directly
above the other, and the rail is the product's most-watched surface. `TikTok video` twice in one
viewport is repetitive in a way neither string is alone.

**My recommendation: take both anyway, and do not split the difference.** Fixing one and leaving the
other is how a surface acquires two grammars. If the repetition reads badly in a browser, the repair
is to the *H1* — `Adding your video` under a `Reading the TikTok video` stage label still names the
platform once on the screen. That is a judgement for whoever sees it rendered; I have not.

### 5.4 `Open TikTok` vs `Open on TikTok` — a new inconsistency this pass creates

Row 70 changes `Open the TikTok` → `Open on TikTok`. But `place-sheet.tsx:1803` ships
**`Open TikTok`**, which is already compliant and which this pass does not touch. The result is
**two labels for one action** — precisely the defect this codebase already tracks (`error.tsx:23`
cites *"four labels for one action"* and refuses to be the fifth).

**Recommendation: change `place-sheet.tsx:1803` to `Open on TikTok` in the same commit.** It is one
extra site, it is not required by the rule, and it is the only way this pass does not leave the
product worse on a dimension it already cares about. `collection-place-detail.tsx:36` references
`Open TikTok` in a comment and would follow.

**Flagged rather than done** because it is outside the rule's remit and is your call.

---

## 6. Two things the sweep found that are not this pass

Recorded because they are §3 breaches on lines the build lane will have open anyway. **Neither is
mine to fold in without a ruling.**

1. **`post` is in §3's never column, and ships twice.** `import-error-copy.ts:213` and `:224`:
   *"We've already got the post, so a retry is quick."* My row 213/224 proposal already replaces it
   with *"We've already got it"* because I was rewriting the sentence anyway. If you would rather
   keep this pass to the noun only, revert that half and log `post` separately — but it will read
   oddly to fix one banned word and leave its neighbour.

2. **A straight apostrophe in two user-facing strings.** `use-import-run.ts:279` and `:313` use
   `'s` where every sibling literal uses `’s`. Both lines are in the table already; fixing the
   apostrophe is free while they are open, and leaving it means the rail says `@demo's TikTok video`
   on one path and `@demo’s TikTok video` on another.

---

## 7. Documents that must move in the same commit

`voice-and-vocabulary.md` §6's standing rule: *a string changes in code and the deck follows in the
same commit, or it does not change.* This pass touches strings owned by three documents.

**Done 2026-08-31 by `product-lead`, all three, while `i5-tiktok-ui` held the code** — disjoint
scopes, so neither could land in the other's commit. What actually moved is recorded in each
document's own change log; §7.1 below records the one thing that did **not**.

| Document | What moves |
|---|---|
| [`spec-no-places-found.md`](spec-no-places-found.md) §5.1, §5.2 | Case A and case B bodies (`Some TikToks…` → `Some TikTok videos…`), `We’ll link it to this TikTok.` → `…this TikTok video.`, and the source-row label chain `@{handle}’s TikTok → {authorName}’s TikTok → This TikTok` → all three gain `video`. **The spec is authoritative for that screen**, so if it does not move, the screen's strings and its spec disagree from the first commit |
| [`overnight-copy-deck.md`](overnight-copy-deck.md) | **C110** (`That link isn’t a TikTok.` → `That link isn’t from TikTok.`) and its §2.5 acceptance test, which asserts byte-equality with `IMPORT_ERROR_COPY.UNSUPPORTED_HOST` — the assertion still holds, the literal changes. §7's quoted no-places table takes the `TikTok videos` wording |
| [`ux-architecture.md`](ux-architecture.md) §12 | **C10** `Read @{handle}'s TikTok` · **C31** `From @{handle}'s TikTok` · **C61** `Some TikToks don't share enough…` · **C62/C71** `Open the TikTok` / `Try another TikTok` · **C67** `You've added a lot of TikToks…` · **C70** `Some TikToks only show…` · **C81** `Add a TikTok` · **C99** `Add a TikTok`. Eight ids. These stack with the eight drift rows already listed in `overnight-copy-deck.md` §8 — **land them as one §12 edit, not two** |

### 7.1 What the document pass found and did not fix

**`ux-architecture.md` §12 is now correct. §1–§11 of the same document are not.** The sweep found
roughly **35 further sites** in §1–§11 — and they are not all engineering prose. Several are literal
copy blocks that specify a string (`**Copy:** Title \`Add a TikTok\`` in §2's F1; `Reading the
TikTok…` in §F3; §5.1's and §5.3's mockups and action lists; §7's `Saved from 2 TikToks`; §9's
first-run panel), plus a dozen ASCII mockups drawing the old wording inside a box.

Left deliberately, and recorded in a new `ux-architecture.md` §12.6 rather than only here. Folding it
in would have buried a checkable 17-id correction inside an unreviewable diff, and §12 was the named
scope. **The consequence is written into that document: until §1–§11 is reconciled, §12 is the only
part of it whose strings may be copied into code.**

Two smaller residuals, both recorded, neither acted on:

- **`spec-no-places-found.md` prose** in §1, §2, §4.3, §6.8 and §13 discusses TikTok without quoting
  a shipped string (`~81 of the owner's 113 saved TikToks`). Sweeping it is churn; the drift this
  pass exists to prevent is between a **quoted string** and the code.
- **`import-error-copy.ts:136–137`** carries three further uses of `post`
  (`That's a TikTok link, but not a post.` / `Profiles, hashtags and sounds don't have a post for us
  to read. Open one post and copy the link from there.`). Ruling 5 keeps the ban unnarrowed, so these
  are breaches — but they are **outside this pass's three counted instances** and outside the code
  lane's brief. They need their own small pass.

---

## 8. Confirmed already correct — do not churn

Checked by reading, not assumed. Every one of these **points** and needs no change.

| File | Line | String |
|---|---|---|
| `src/app/layout.tsx` | 78 | `Paste a TikTok link and the place lands on your map. Organised by where, not by when.` |
| `src/app/manifest.ts` | 40 | identical string |
| `src/app/opengraph-image.tsx` | 195 | identical string |
| `src/app/page.tsx` | 43 | identical string |
| `src/app/page.tsx` | 50 | `Works with TikTok links today.` |
| `src/app/page.tsx` | 56 | `Paste a link from TikTok` |
| `src/app/profile/page.tsx` | 180 | `Nothing saved yet. Paste a TikTok link and your map starts here.` |
| `src/components/sheet/place-sheet.tsx` | 1365 | `Paste a TikTok link and the places it talks about land on your map.` |
| `src/components/sheet/place-sheet.tsx` | 1803 | `Open TikTok` — correct today; §5.4 asks whether it should still change |
| `src/components/add/add-sheet.tsx` | 391 | `From a TikTok link, or by name` |
| `src/components/add/add-sheet.tsx` | 449 | `Paste a TikTok link or search your places` |
| `src/app/import/screens/paste-screen.tsx` | 110 | `Paste a TikTok link` |
| `src/app/import/screens/paste-screen.tsx` | 135 | `That doesn’t look like a TikTok link.` |
| `src/ui/import/import-error-copy.ts` | 40 | `Copy the link in TikTok — Share → Copy link.` |
| `src/ui/import/import-error-copy.ts` | 110 | `Not TikTok` (kicker) |
| `src/ui/import/import-error-copy.ts` | 112 | `We support TikTok links. Instagram and YouTube aren’t supported yet.` |
| `src/ui/import/import-error-copy.ts` | 124 | `That doesn’t look like a TikTok link.` |
| `src/ui/import/import-error-copy.ts` | 136 | `That’s a TikTok link, but not a post.` — points, but carries the `post` question from §6 |
| `src/ui/import/import-error-copy.ts` | 149 | `Short TikTok links stop working after a while. Open the post in TikTok and copy the link from there.` |
| `src/ui/import/import-error-copy.ts` | 167, 177 | `TikTok didn’t answer` (kicker) |
| `src/ui/import/import-error-copy.ts` | 168, 178 | `TikTok took too long to answer.` |
| `src/domain/errors.ts` | 115, 127, 154, 163 | Four domain messages, all pointing |

---

## 9. Acceptance for the build lane

1. `grep -nE "a TikTok[^ ]|a TikTok$|TikToks|this TikTok|the TikTok[^’s]|’s TikTok[^ ]" src --include='*.ts' --include='*.tsx'` returns **no hit inside a string literal or JSX text**. Comment hits are expected only where §3 lists them as left alone.
2. `grep -rn "Import a TikTok" src` returns nothing.
3. `grep -rn "'s TikTok" src` returns nothing — the straight apostrophe is gone (§6.2).
4. `IMPORT_ERROR_COPY.UNSUPPORTED_HOST.headline` and the Add sheet's notice are still byte-identical to each other (the copy deck's §2.5 test, unchanged in form).
5. Every comment in §3's table quotes the **new** literal.
6. `spec-no-places-found.md` §5 and `ux-architecture.md` §12 changed in the same commit.
7. No string on any screen lost the word TikTok except `import-error-copy.ts:246`, and only if §5.2 was ruled that way.

---

## Change log

| Date | Change |
|---|---|
| 2026-08-31 | **Rulings landed (§0), and the three document moves executed.** `spec-no-places-found.md` §4.3/§5.1/§5.2/§5.3 plus every downstream reference in §4, §6, §7, §8, §11 and §12; `overnight-copy-deck.md` C110, §7's frozen quotes and §8's new row 11; and `ux-architecture.md` §12 in **one** edit carrying all three stacks — the eight drift rows, this pass's **17** ids, and the preamble's duplicated banned list, which now points at `voice-and-vocabulary.md` §4 instead of holding a stale copy. Two historical records were deliberately **not** rewritten (the spec's 2026-08-30 change-log row, and §7.3's four-wordings table): a change log records what was decided, not what a string later became. New §7.1 records what the document pass found and did not fix — ~35 sites in `ux-architecture.md` §1–§11, several of them literal copy blocks rather than prose, with the consequence written into that document as a new §12.6 |
| 2026-08-31 | Created. Swept `src/` in all three string shapes: 325 raw hits, **35 user-facing sites across 14 files** and **11 comments quoting a moved literal**. Rewrote rather than patched at `collection-content.tsx:848`, which carried two breaches — the bare noun and `Import`. Confirmed 22 already-correct sites rather than assuming them. Four rows flagged as reading worse (§5), including one — `import-error-copy.ts:246` — where a possessive of the bare noun admits **no** adjective repair and my proposal drops the word, against the brief, for a ruling. Found two adjacent §3 breaches not in this pass's remit (`post`, and a straight apostrophe in two rail strings) and one inconsistency this pass **creates** (`Open on TikTok` vs the shipped `Open TikTok`). Named the three documents that must move in the same commit |
