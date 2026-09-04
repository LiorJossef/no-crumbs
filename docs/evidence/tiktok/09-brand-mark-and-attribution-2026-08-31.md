# E9 — May No Crumbs display TikTok's logo, wordmark or glyphs?

> **Ruling requested by the orchestrator, 2026-08-31**, ahead of a design lane that wants to brand
> the TikTok path better. Retrieved 2026-08-31T16:52Z from a server-side Node/curl context (macOS,
> client IP is the owner's residential IL ISP).
> **Base commit `8f8df84`; all code citations re-verified at `1e12008`** — the design lane's
> `PlatformMark` landed mid-task and touched six of the files cited here, so every line number below
> was re-read rather than carried forward. Nothing it changed alters a finding; the shifted
> references in §5.2 have been corrected and §10.5's were taken after it landed.
> Raw artefacts: [`raw/09-developer-tos-2026-08-31.txt`](raw/09-developer-tos-2026-08-31.txt),
> [`raw/09-design-guidelines-2026-08-31.txt`](raw/09-design-guidelines-2026-08-31.txt),
> [`raw/09-embed-videos-2026-08-31.txt`](raw/09-embed-videos-2026-08-31.txt),
> [`raw/09-dev-logo-pack-manifest-2026-08-31.txt`](raw/09-dev-logo-pack-manifest-2026-08-31.txt).
>
> **This document rules on what is permitted, required and forbidden. It does not rule on design.**
>
> ### Read §10 first
>
> **Amended the same day.** The owner's ask arrived after §0–§9 were written — *"when we say add a
> TikTok link, we should brand it with TikTok"* — which puts the **primary CTA** at the top of the
> list, and it was §4's mildest-phrased row. Chasing it, **the Brand and Use Guidelines text that
> §2.3 records as UNAVAILABLE was recovered from the Internet Archive.** TikTok draws the line
> itself, in its own words, and it is **not** the line the brief expected. §10 carries it.
> Two rows of the table below are superseded there and marked.

---

## 0. The ruling in one block

| Question | Answer | Label |
|---|---|---|
| Does TikTok publish brand guidelines? | Yes — *TikTok Brand and Use Guidelines*, linked from the developer Design Guidelines page | **VERIFIED** |
| Can we read them? | ~~**No.**~~ **SUPERSEDED BY §10.** The *live* document is still unreadable — `tiktokbrandbook.com/d/HhXfjVK1Poj9/legal` 301s to `tiktokbrandhub.com`, a client-rendered SPA returning only *"Please enable javascript"*, whose config exposes `auth/requestAccess` and `auth/loginWithEmail`. But the **prior version was recovered from the Internet Archive** and is now quoted in §10 | live text **UNAVAILABLE**; archived prior version **VERIFIED** |
| May a third-party app display the TikTok logo/icon when linking to TikTok content? | **No, not by default.** TikTok's Design Guidelines say it in one sentence: *"You may not use TikTok logos, icons, symbols, or designs, without our prior written permission."* The Developer Terms grant a logo licence **only** where a TikTok product *requires* the mark | **VERIFIED** |
| Do we hold such a permission? | No. Nobody has requested one, and we use neither Login Kit nor Share Kit — the two products whose buttons are the documented "required" case | **VERIFIED** (by inspection of `src/`; no TikTok asset exists in the repo) |
| Is attribution required, or merely nice? | **Required in substance.** Developer Terms III.3(n) forbids deleting *"author attributions … or other labels of origins or source of material"* | **VERIFIED** |
| Are we honouring it today? | **Yes**, on both surfaces that show imported content — the place detail card and the import review screen | **VERIFIED** by code inspection |
| So what may the design lane use? | **The word "TikTok", a link to the post, the creator's `@handle`, and a neutral non-TikTok glyph of our own drawing.** All four are already in the product | **VERIFIED** |
| May the mark go on our own primary CTA (`Add a TikTok`)? | **No** — and §10 shows TikTok drawing that exact line itself. **Amended:** the permitted/forbidden boundary is **text vs. mark**, not our-action vs. their-content. A CTA carrying the *name in text* is TikTok's **own worked example** of permitted use | **VERIFIED** (archived guidelines) |
| Is our existing CTA copy clean? | **No, and this was not asked.** `Add a TikTok` uses the trademark **as a noun**, which the guidelines name and give a counter-example for. `Paste a TikTok link` is correct. §10.5 | **VERIFIED**, low enforcement risk |

**One-line answer for the design lane: build the mark component, but its first implementation is
type and a neutral glyph, not TikTok's note. Swapping in the real mark is a decision that costs an
email to TikTok, not a design change.**

---

## 1. Which terms bind us, and why the answer is the same either way

We call `GET https://www.tiktok.com/oembed` with no key and no auth (`oembed-source-adapter.ts`).
It is fair to ask whether a keyless public endpoint drags us into a developer agreement at all.

**VERIFIED:** TikTok documents that exact endpoint on the developer site as an API —
*"Programmatically, you may convert a TikTok's video URL into embedded video markup by using the
oEmbed API"*, under **API / `GET /oembed`** (`raw/09-embed-videos-2026-08-31.txt`). The Developer
Terms define *TikTok Developer Services* as *"the TikTok Developer Site, TikTok Developer
Documentation, and TikTok API"*, and open with *"BY CLICKING ACCEPT OR DOWNLOADING, INSTALLING,
**ACCESSING, USING OR OPERATING** THE TIKTOK DEVELOPER SERVICES, YOU AGREE TO BE BOUND BY THESE
DEVELOPER TERMS."* (Developer Terms, last modified Dec 26 2025.)

**ASSUMED** (this is a legal conclusion, not a measurement): using a documented developer API
therefore binds us. But the ruling below does not depend on it, because the argument runs both ways
and both ways land in the same place:

- **If the Developer Terms bind us**, §II.2 is our *only* possible logo licence, and it is
  conditional — see §2.
- **If they do not bind us**, we have **no logo licence at all**, only the flat prohibition on the
  public Design Guidelines page. That is the stricter position, not the looser one.

There is no reading in which we end up freely licensed. Recorded here so nobody re-derives the
"it's just a public endpoint" argument and reaches the opposite conclusion.

---

## 2. The brand assets: what TikTok publishes, and on what condition

### 2.1 The licence clause, verbatim (VERIFIED)

> **II.2. TikTok Logo.** *If the TikTok Developer Services **include or require** the use or display
> of the TikTok Logo, TikTok grants you a personal, non-exclusive, non-transferable,
> non-sublicensable, limited, revocable license to display the TikTok Logo in or through your
> Application in accordance with TikTok's Brand and Use Guidelines (as incorporated by the
> Commercial Terms) as amended from time to time.*

Read it precisely. The grant is **conditional on a TikTok product requiring the mark** — it is not a
general permission to decorate an app that happens to talk to TikTok. And it is **revocable** and
**subject to a document we cannot read** (§2.3).

### 2.2 The flat prohibition, verbatim (VERIFIED)

Developer *Design Guidelines*, last updated **August 4, 2026** — a public, ungated page:

> *Please carefully read our official TikTok Brand and Use Guidelines. You must adhere to these
> guidelines. **You may not use TikTok logos, icons, symbols, or designs, without our prior written
> permission.** Additionally, you may not use names, logos, icons, symbols or designs of anyone
> without their permission.*

This is the most recently-updated primary source on the question and it is unambiguous. "Icons,
symbols, or designs" reaches the note glyph, a monochrome square/circle icon, and a stylised
approximation drawn by us — all three.

### 2.3 The governing document is behind a gate (UNAVAILABLE)

> **Partly superseded by §10.1.** The *live* document is still unreadable and everything in this
> section stands as a record of that. But its **prior version was afterwards recovered from the
> Internet Archive**, so the "we cannot state TikTok's rules on colourways and modification"
> conclusion below is **no longer true** — see §10.2 and §10.4. Clear space and minimum size are
> still UNAVAILABLE (§10.7).

The *Brand and Use Guidelines* is the document the licence in §2.1 is conditioned on and the
Design Guidelines page orders us to read. We could not read it.

| Probe | Result |
|---|---|
| `GET https://tiktokbrandbook.com/d/HhXfjVK1Poj9/legal` (the link on the Design Guidelines page) | HTTP 301 → `https://tiktokbrandhub.com/`, i.e. the deep path is dropped |
| `GET https://www.tiktokbrandhub.com/d/HhXfjVK1Poj9/legal` | HTTP 200, 316 124 bytes. Stripped of scripts, the entire body is `"TikTok Brand Hub  Please enable javascript"` |
| `GET https://api.tiktokbrandhub.com/web-api/content?path=…` | HTTP 404. No further probing of an undocumented private API was attempted |
| Inline `window._CONFIG_` on that page | Exposes `AUTH_REQUEST_API … /auth/requestAccess`, `AUTH_EMAIL_API … /auth/loginWithEmail`, `AUTH_VALIDATE_EMAIL_LINK_API` |

**Consequence, and it is the load-bearing one:** we cannot state TikTok's rules on **minimum size,
clear space, permitted colourways, monochrome-only, modification, or attribution wording**. Anything
you read on those topics in a blog post is secondary. A web search returned confident figures —
"icon never smaller than 32 px wide, wordmark never smaller than 80 px" — from marketing blogs
(adparlor.com, megadigital.ai, nestscale.com and similar). **Those are ASSUMED at best and this
project may not design against them** (Charter §9). They are recorded here only so that when
somebody finds the same blog post, they find this note first.

### 2.4 What TikTok *does* hand developers, and what that reveals (VERIFIED)

`logo-pack.zip` (6 588 461 bytes, sha256 `b3f3172…f2085cd`, last-modified 2025-05-27) is linked from
the Design Guidelines page and downloads with **no authentication**. It was fetched to a scratch
directory and **not** committed; only the file manifest is in `raw/`. Contents:

| Group | Files | What it tells us |
|---|---|---|
| **TikTok Button Pack** | `Button_Black`, `Button_Outlined`, `Button_No outline` (.ai/.png/.svg) | Rendered, `Button_Black.png` (315×44) reads **"Continue with TikTok"**. This is the **Login Kit** button — the canonical "the product requires the mark" case from §II.2 |
| **Logo Pack** | Horizontal + Stacked, RGB + CMYK, **black and white only**, plus `-simplified` variants and a `Tag` lockup | TikTok's developer pack ships **no full-colour, no gradient, no cyan/magenta glitch variant**. The coloured mark a design lane would reach for first is not in the pack at all |
| **Icons** | `TikTok_Icon_Black.ai`, `TikTok_Icon_Black_Circle.png`, `TikTok_Icon_Black_Square.png` | Again **black only** |
| **Cobranding Template** | `TikTok-Co-Branding-Template-{RGB,CMYK}.ai` | Co-branding is contemplated — as a *template for partners*, alongside a clause forbidding us to claim a relationship (§3, X) |
| **Licence / readme inside the zip** | **None.** No `.txt`, `.pdf`, `.md` or `.rtf` anywhere in 36 files | The pack ships no terms of its own. Downloadability is not a licence |

The pack being open is **not** permission. It is assets staged for the developers who have a
required use. We have no required use: we call oEmbed, we do not use Login Kit, Share Kit, the Embed
Player, or the Content Posting API.

---

## 3. What is forbidden (VERIFIED — Developer Terms, verbatim)

Beyond the obvious, and each independently sufficient to block a branded surface:

| Clause | Text | Why it bites here |
|---|---|---|
| **III.3(o)** | *"imply any inaccurate affiliation, sponsorship, or endorsement of you or the Application by TikTok"* | The classic. A TikTok mark sitting inside our own chrome, in our brand colours, next to our mascot, is exactly the co-branded read this forbids |
| **III.3(a)** | *"…modify, reverse engineer, decompile, or otherwise alter, in whole or in part, the TikTok Developer Services, or TikTok Services or any derivative works thereof"* | Redrawing the note in No Crumbs' palette, or letting it inherit `currentColor`, is alteration |
| **III.3(s)** | *"act in a manner that is likely to weaken, damage, or be detrimental to the reputation or goodwill associated with TikTok"* | A catch-all TikTok gets to interpret. It is the clause behind "no modification" |
| **X. Publicity** | *"You may not make any public statement regarding your relationship with TikTok or access to the TikTok Developer Services without TikTok's prior written consent."* | **A "Powered by TikTok" or "TikTok Partner" badge is barred twice over** — by III.3(o) and by X. Do not write that string |
| **III.3(n)** | *"remove, obscure, or alter any legal, copyright, trademark or other proprietary notices … or falsify or delete any author attributions, legal notices, or other labels of origins or source of material"* | The attribution obligation. See §5 |
| **III.3(t)** | *"superimpose or otherwise include … a brand name, logo, watermark or other promotional branding on or in any Developer Content submitted by End Users which is displayed … on or through Display Sites"* | Directional only: this governs content pushed **to** TikTok, which we never do. Recorded so it is not mis-cited as governing our own screens |

**On the brief's three specific sub-questions:**

1. *"the mark on a surface that also carries the product's own brand"* — **not separately named in
   any source we can read**, and this is precisely the kind of rule that lives in the gated Brand
   and Use Guidelines. Under III.3(o) it is the highest-risk placement of the four in §4, because
   two marks side by side at equal weight is the visual grammar of a partnership. **ASSUMED** —
   flagged, not proven.
2. *"the mark next to content TikTok did not publish"* — same status. Our review screen shows a
   model's extraction sitting beside the creator's caption; a TikTok mark on that screen would be
   the platform's logo attached to our inference. **ASSUMED**, and the reason use (b) in §4 is the
   worst of the four even before §2.2 rules it out.
3. *"the mark in a colour it does not ship in"* — **VERIFIED forbidden in effect**: §2.4 shows the
   developer pack ships black and white only, and III.3(a) forbids alteration. A brand-tinted
   TikTok glyph is out on both counts.

---

## 4. The four uses, judged separately

> **Superseded by §10.6**, which re-ranks these with the primary CTA first and replaces the
> reasoning using TikTok's own recovered text. **Every MARK verdict below is unchanged** — all four
> are still no, for the same one sentence. What changed is *why*, and the colour question is now
> answered rather than open.

Each is judged twice: the **mark** (TikTok's logo / note glyph / icon, or any redraw of it) and the
**word** ("TikTok" as ordinary text). They land differently, which is the point of asking separately.

| # | Use | The mark | The word "TikTok" |
|---|---|---|---|
| **a** | **Glyph on the paste field** — saying what to paste | **NOT PERMITTED.** No written permission; no TikTok product requires a mark here. §2.2 | **PERMITTED.** Ordinary descriptive reference to where the link comes from. Already shipped |
| **b** | **Glyph on the import flow's screens** — saying what is being read | **NOT PERMITTED, and the worst of the four.** Beyond §2.2, these screens carry our brand *and* the model's inferences beside the creator's caption; a platform mark there reads as endorsement of our output (III.3(o)) | **PERMITTED.** Already shipped — the review screen renders `@handle's TikTok` |
| **c** | **Source link on a saved place** — attribution, pointing at TikTok's own content | **NOT PERMITTED as a mark**, on the same sentence. This is the use with the strongest *argument* for permission — it is pure nominative reference to the platform's own content — but an argument is not the written permission §2.2 requires | **PERMITTED, and required in substance.** See §5. Already shipped as `Open TikTok` → the canonical post URL |
| **d** | **Glyph in a list row** beside a place that came from TikTok | **NOT PERMITTED.** Same sentence. Note also that at list-row size the mark would be rendered far smaller than any plausible minimum-size rule — and we cannot read that rule (§2.3), so we cannot even check | **PERMITTED**, though the row is not where attribution is owed (§5.3) |

**Why (c) does not get a pass despite being attribution.** There is a real doctrine — nominative
fair use — under which referring to a product by its mark, including sometimes its logo, is lawful
without permission. It is the argument a lawyer would make. It is **not** a basis this project may
design on: it is jurisdiction-dependent, fact-dependent, decided after the fact by a court, and
flatly contradicted by the platform's own published sentence. Charter §9 says design may only depend
on VERIFIED. A doctrine is not VERIFIED; a sentence on TikTok's own site is. **If the owner wants
the real mark on the source link, the route is to ask TikTok for written permission** — §7.

---

## 5. Attribution: obligation, not decoration

### 5.1 What is required (VERIFIED)

Two sources, and they agree:

- **Developer Terms III.3(n)** forbids us to *"falsify or delete any author attributions, legal
  notices, or other labels of origins or source of material."* We take the creator's caption out of
  a TikTok response and display a derivative of it. Stripping the creator off it would be deleting
  an author attribution.
- **The Embed Videos page** states what TikTok considers proper attribution to be: the embedded
  player *"provides proper attribution by showing the video creator, video description and
  background sound … It also links back to the corresponding content on TikTok."*

So TikTok's own definition of proper attribution has three named parts — **creator, description,
link back** — plus background sound, which is specific to reproducing the video.

### 5.2 What we do today (VERIFIED by code inspection at `8f8df84`)

We do **not** render the oEmbed `html` blockquote or the embed player. We render the caption as
text, a thumbnail, and links. Against the three parts:

| Part | Where | Status |
|---|---|---|
| **Creator** | `place-sheet.tsx:1514` builds `authorLabel` from `@author_unique_id`, falling back to `author_name`. Rendered either as the `<figcaption>` under the caption quote (`:1684`) **or**, when no quote is shown, as `Saved from @handle` (`:1783`) — the two branches are exclusive and exhaustive, so the credit does not disappear when the editorial quote gate closes | **Honoured** |
| | `review/review-screen.tsx:283` renders `@{authorHandle}'s TikTok` on the import review screen | **Honoured** |
| **Description** | The caption is what we display, quoted verbatim with `dir="auto"`, visually distinguished from the model's generated prose | **Honoured** |
| **Link back** | `Open TikTok` → the canonical post URL, `target="_blank" rel="noopener noreferrer"` (`:1803`) | **Honoured** |

**The product is already compliant on attribution. There is no gap to close and no ship-blocker
here.** Recorded explicitly, because "we should add attribution" is the kind of task that gets
invented after a document like this exists.

### 5.3 Three honest caveats

1. **The credit degrades silently when the handle is null.** `authorLabel` is `null` when both
   `author_unique_id` and `author_name` are absent, and both are `.nullable().default(null)` in
   `oembed-schema.ts`. In practice oEmbed returned both on 16/16 posts (`01-oembed-field-inventory.md`),
   so this is a theoretical path, not an observed one. It is not worth code today; it is worth
   knowing that the fallback is *no credit* rather than *a generic credit*.
2. **The list row carries no credit, and does not need one.** Attribution attaches to the surface
   that displays the content — the detail card and the review screen, both of which have it. A pin
   on a map or a name in a list is our own record of a place, not a reproduction of a TikTok.
   **ASSUMED**, from the shape of III.3(n) ("labels of origins … of material"); no source states it.
3. **Background sound is not credited, and is out of scope.** TikTok's list includes it because the
   embed player plays the audio. We reproduce no audio. The sound name is available — it sits inside
   the oEmbed `html` string as `♬ <name>` — and we deliberately do not parse `html`. No change owed.

### 5.4 One thing worth noticing about the thumbnail

`SourceMediaThumbnail` is a plain `<img>` against a signed `tiktokcdn.com` URL, and the code comment
at `place-sheet.tsx:1000` already notes the referrer consideration. That is a privacy matter, already
handled and already documented, not a brand matter. Named here only so it is not rediscovered as a
finding of this document.

---

## 6. oEmbed's own terms

**The oEmbed specification imposes nothing.** `oembed.com` is a response-format spec — field names
and types. It carries no licence, no attribution clause and no display requirement, and TikTok's
Embed Videos page defers to it only for *format*: *"The response format follows the specification of
https://oembed.com/."*

**Everything binding comes from TikTok's own documents**, and this is the whole answer to the brief's
question 5: the obligation is **III.3(n)** plus TikTok's stated definition of proper attribution on
the Embed Videos page. It is honoured (§5.2).

One structural point worth recording. TikTok's *preferred* attribution mechanism is the **embed
player** — creator, description, sound and a link back, all rendered by TikTok, inside an iframe.
Choosing to render the caption as our own text instead is what makes III.3(n) our responsibility
rather than TikTok's. That was the right choice for this product (the whole point is turning a
caption into map pins, not re-showing a video), and it comes with the duty attached. Not a finding
against us; a reason the credit lines in §5.2 must not be quietly refactored away.

---

## 7. What is permitted instead — the design lane's actual palette

The brief asked for a refusal *with* an alternative. All four items below are already in the
product, which means the design lane's work is styling them, not inventing them:

1. **The word "TikTok", as ordinary text.** `voice-and-vocabulary.md` already rules it in
   (*"TikTok is the only supported source. Naming it is the honest boundary"*). `Add a TikTok`,
   `Paste a TikTok link`, `Open TikTok`, `@handle's TikTok` all ship today. Referring to a product
   by its name is not trademark use in the sense §2.2 prohibits — that sentence governs *logos,
   icons, symbols, and designs*.
2. **The creator's `@handle`.** A person's handle is not TikTok's mark. Already rendered.
3. **A link to the post.** Already rendered.
4. **A neutral glyph of our own drawing** — a link icon, a play triangle, a paste/clipboard mark, a
   generic video card, or something from the No Crumbs mascot set. Not derived from TikTok's note,
   not a redraw of it, not "the note but rounder". The existing `ExternalLink` beside `Open TikTok`
   is already an instance of this and is unobjectionable.

**Build the swappable component the orchestrator described.** Its contract should be: *the thing
that says "this came from TikTok"*. Its current implementation is (1) + (4). If written permission
ever arrives, one file changes.

**Three strings to avoid outright**, because they cross from naming into claiming: "Powered by
TikTok", "TikTok Partner", "Official TikTok integration", and anything using TikTok's mark as a
verb-shaped affordance ("TikTok it"). §3, clauses III.3(o) and X.

### 7.1 If the owner wants the real mark

It is a request, not an engineering task. `developers.tiktok.com` → support, or the
`auth/requestAccess` flow on `tiktokbrandhub.com` (which would, as a side effect, also get us the
Brand and Use Guidelines text this document could not read). **Nobody should file that request
without the owner's decision** — it is an outward-facing statement about the product, and X.
Publicity constrains what may be said about the relationship afterwards.

Until then, **no TikTok logo, icon, glyph or redraw enters `src/` or `public/`.** Today none does —
verified: `find src public -iname "*tiktok*"` returns only `src/integrations/tiktok/` and
`src/domain/source/canonicalise-tiktok-url.ts`, both code.

---

## 8. Three findings outside the brand question — flagged, not acted on

Read while retrieving the Developer Terms for §1. None is mine to rule on; all three are recorded so
they are not lost.

1. **III.3(h) deserves a look from `security-privacy`.** *"collect or attempt to collect any personal
   data from TikTok users for any unauthorized or unlawful purpose or **build, help build, or
   supplement any profiles, databases, or similar records on any individual, device, content, or
   browser**"*. Our `public.sources` table holds one row per TikTok video carrying `author_handle`,
   `author_name`, `content_text` and `thumbnail_url`. Whether a per-video cache is a "record on
   content" in the sense meant, or whether the clause is aimed at profiling, is a reading I am not
   qualified to make. It is not a brand question and I am not ruling on it.
2. **III.3(c) is a commercialisation trip-wire.** *"use the TikTok Developer Services or TikTok
   Services, without TikTok's express written consent, for any commercial or unauthorized purpose"*.
   A university project is not commercial. If No Crumbs ever charges, advertises or is acquired,
   this clause is live. Same shape as the ToS gate in `06` §3.1 — worth knowing before, not after.
3. **III.1 reserves an app-review right.** *"TikTok may require you to submit the Application for
   review and approval by TikTok prior to distribution to End Users."* "May require", not "requires";
   nothing is owed today. It becomes real the moment we ask TikTok for anything, including the brand
   permission in §7.1.

---

## 9. Method, and what would overturn this

**How it was gathered.** Server-side `curl` from Node/macOS with a desktop UA, followed by
script-and-style stripping to plain text; no browser, no JS execution, no scraping of protected
surfaces and no bot-protection bypass. Eight requests to TikTok-controlled hosts. Every quotation
above is verbatim from a file in `raw/`. sha256 of the fetched originals:

| Source | sha256 |
|---|---|
| Developer Terms of Service (HTML) | `65c54f3d9fbf1c651210663a9e91b506828177f10e97e15de882d2b4087f94d5` |
| Design Guidelines (HTML) | `327a45a1fd87570090bcc46670c6b2ce586128e367ba71964fca0b89709fea7d` |
| Embed Videos (HTML) | `8763f31fc4281b19ce8462cc71a3bf20a30d7a9b2c38142408a23ef6f7c1fde5` |
| `logo-pack.zip` (not committed) | `b3f31728ceb6ce6fc1a0ae8c635a0223e35ac2f7d203b2743e713541bf2085cd` |
| Brand Hub `/legal` (HTML, contentless) | `21522fe50aba83219d3a0d583b381406d5a6e3b92a004407e7527a40c8efe44a` |

**The known weakness of this ruling**, stated plainly: the document that actually governs — the
*Brand and Use Guidelines* — is UNAVAILABLE (§2.3). This ruling is therefore built on the two
sources we *can* read (the Developer Terms and the public Design Guidelines page), both of which
point **the same way**: no logo without prior written permission. A gated document is more likely to
add conditions than to remove that sentence, so the conclusion is conservative in the right
direction. It is still a gap, and it is the first thing to close if the answer is ever challenged.

**What would change this ruling:**

- **Written permission from TikTok** (§7.1) — flips uses (a)–(d) to permitted-with-conditions, and
  makes §2.3's minimum-size and colourway rules suddenly load-bearing.
- **Adopting Login Kit, Share Kit or the Embed Player** — each brings its own required mark under
  §II.2, licensed for that button or that player only, and not transferable to a paste field.
- **TikTok republishing the guidelines ungated**, which would upgrade §2.3 from UNAVAILABLE and let
  us answer the size/clear-space/colour questions properly.
- **Any of these documents changing.** The Developer Terms were last modified 2025-12-26 and the
  Design Guidelines 2026-08-04 — recent enough that re-checking before any branded surface ships is
  cheap and worth doing.

---

# 10. Addendum — the primary CTA, and the guidelines text recovered from archive

> Written after §0–§9, on the owner's clarification: *"When we say add a TikTok link, we should brand
> it with TikTok."* The surface is **`Add a TikTok`** — the mint button on `/map`
> (`place-sheet.tsx:1391`, `place-desktop-panel.tsx:171`) and the paste screen's heading
> (`paste-screen.tsx:74`). Same base commit `8f8df84`; retrieved 2026-08-31T17:00Z.
> New raw artefacts:
> [`raw/10-brand-guidelines-legal-archived.txt`](raw/10-brand-guidelines-legal-archived.txt),
> [`raw/10-brand-guidelines-logo-page-archived.txt`](raw/10-brand-guidelines-logo-page-archived.txt),
> [`raw/10-brand-guidelines-cobranding-page-archived.txt`](raw/10-brand-guidelines-cobranding-page-archived.txt),
> [`raw/10-login-kit-button-colourways-2026-08-31.txt`](raw/10-login-kit-button-colourways-2026-08-31.txt).

## 10.1 How the gate was got round, and how much that is worth

§2.3 recorded the Brand and Use Guidelines as UNAVAILABLE because `tiktokbrandhub.com` renders
client-side. That is still true of the **live** document. But the hub's predecessor,
`tiktokbrandbook.com`, was a Frontify-style app that served its page bodies as JSON from
`/api/document/page/<section>/<page>` — and **the Internet Archive holds six of those responses**.
They were retrieved from `web.archive.org` (not from TikTok), gunzipped, and are reproduced in
`raw/`. No login was bypassed and no protected surface was touched: these are public archive
snapshots of a page TikTok itself published.

**How far this may be trusted.** The recovered page footer reads **"Last modified on Fri, 19. Mar
2021 15:12"**; the archive snapshots are 2022-09 to 2025-04. So this is a **prior version**, not
today's governing text, and it is labelled that way everywhere below.

**What raises confidence a long way above "an old document":** its operative sentence is reproduced
**word for word** on the live, ungated developer Design Guidelines page dated **2026-08-04** —
*"You may not use TikTok logos, icons, symbols, or designs, without our prior written permission."*
Five years and a platform migration apart, the rule is the same sentence. The archived text is
therefore treated as **VERIFIED as to the rule**, and as **indicative only** as to details TikTok
could have quietly revised. Nothing below rests on a detail that the live sources contradict.

## 10.2 The line, in TikTok's own words

This is the paragraph the orchestrator asked for. Verbatim, from the archived legal page:

> *The TikTok brand consists of trademarks, trade and product names, logos, icons, symbols and
> designs owned or used by TikTok. In most cases, any use of the TikTok name requires our explicit
> permission. **Without our explicit permission, you may only use our TikTok name in text where it
> is used to identify or refer to our platform or services e.g., "uploaded on TikTok" or "follow us
> on TikTok."** Such use must be fair and in accordance with the terms of these Guidelines.*
>
> *…you may not use our "TikTok" trademark … in a manner that is false or misleading, or in a manner
> likely to confuse consumers or the public about the source or origin of any products or services
> you may provide. Confusing uses include … uses that may cause people to think your activities
> emanate from TikTok, or vice versa, or that there is some sort of sponsorship, affiliation,
> relationship, or endorsement between you, your goods/services, and TikTok where none exists.*
>
> *…**You may not use TikTok logos, icons, symbols, or designs, without our prior written
> permission.***

And, on the logo page:

> *If you have received our prior written permission to use the TikTok logo, the following rules
> apply. **If you have not received our permission, you may not use the TikTok logo.***

### **The answer to the question as posed**

**The brief expected the line to fall between attribution-beside-their-content and
decoration-on-our-chrome. It does not. TikTok draws it between _the name in text_ and _the mark_.**

That distinction cuts across all four of our surfaces rather than between them, and it is worth
being precise about why, because it is the opposite of the intuition:

- **The permitted side is defined by *medium*, not by placement or purpose.** *"in text where it is
  used to identify or refer to our platform or services"*. Nothing in it asks where the text sits or
  whose action it performs.
- **TikTok's own worked example of a permitted use is a call to action on a third party's own
  chrome.** *"follow us on TikTok"* is not attribution beside TikTok's content. It is a third
  party's own button, in the third party's own colours, performing the third party's own marketing
  action, and TikTok prints it as the model of acceptable use. **So the CTA position is not the
  problem, and never was.** `Add a TikTok link` is the same shape as `follow us on TikTok`.
- **The forbidden side is defined by asset**, and by a confusion test that runs on top of it.

So the correct reading is not *"a CTA is riskier than a source link."* It is: **on all four
surfaces the word is fine and the mark needs written permission** — and the CTA is additionally
exposed to two specific prohibitions the other three surfaces are not. Those are §10.3.

## 10.3 What is specific to the CTA, and it is two clauses

Both are in the forbidden list quoted above, and neither reaches the source link or the row glyph:

1. > *Do not use the TikTok Trademarks **as the distinctive or prominent feature** in any
   > promotional/advertising materials*

   The primary CTA is, by construction, the most prominent element of the product's chrome. A
   TikTok mark on it is the mark being the distinctive feature of the surface that sells the
   product. The source link at the bottom of a place card is not.

2. > *Do not use the TikTok Trademarks **in connection with your brand identity**, including in your
   > brand name, trading name, company name, service name, product name, event name, domain name,
   > social media account name or app name*

   The list is of *names*, so this does not literally reach a button. But the CTA is where a product
   states what it is, and the mint button is a brand-identity surface in everything but the
   enumerated sense. Cited as the direction of travel, not as a clause that squarely lands —
   **ASSUMED**, and flagged as such.

Add III.3(o) of the live Developer Terms (*"imply any inaccurate affiliation, sponsorship, or
endorsement"*) and the archived confusion test (*"uses that may cause people to think your
activities emanate from TikTok"*), and the CTA is the placement where a mark most plausibly reads as
partnership — which was the brief's instinct, and it survives, just not as the primary reason.

**Ruling on the owner's ask: the mark may not go on `Add a TikTok`. The word may, and already
does.** §10.6 says what the design lane can do with the surface instead.

## 10.4 Colour — settled by the terms before design gets a say

The brief asked whether the mint ground is a terms question. **It is, and the answer is available
even though the numeric rules are not.** Three independent sources, all pointing the same way:

**(a) The archived logo page states the colourway rule as a function of the ground** — VERIFIED as
archived text:

> *Use black version on white backgrounds.* · *Use white version on darker color backgrounds or
> imagery.* · *Use black version on lighter color backgrounds or imagery.*

Mint is a light colour. So even **with** written permission, the mark on our mint CTA would be
**black** — never mint, never brand-tinted, never inheriting `currentColor`. There is no
coloured-mark-on-coloured-ground option anywhere in the document.

**(b) The co-branding page forbids recolouring outright** — *"**Don't change the colors of logos.**"*

**(c) Measured, not read: the only third-party button TikTok actually licenses ships in exactly two
grounds, and neither is coloured.** The three SVGs in the developer Button Pack
(`raw/10-login-kit-button-colourways-2026-08-31.txt`), all 315×44, all reading **"Continue with
TikTok"**:

| Variant | Ground | Mark + wordmark | Border |
|---|---|---|---|
| `Button_Black` | `#121212` near-black | `white` | `#161823` |
| `Button_Outlined` | `white` | `#161823` | `#161823` |
| `Button_No outline` | `white` | `#161823` | `white` (none) |

`#161823` is TikTok's own brand near-black. **There is no coloured-ground variant of any kind — not
mint, and not even TikTok's own cyan `#25F4EE` or red `#FE2C55`.** TikTok does not put its own
button on its own brand colours.

This independently confirms the conclusion `platform-mark.tsx` reached by measuring contrast: the
two TikTok pigments cannot enter this product's colour system. That component got there from ΔE00
and CVD simulation; the terms get there from *"don't change the colors"*. **Two different
instruments, same answer** — which is the strongest form this evidence could have taken.

**Consequence for the design lane, stated plainly:** if permission ever arrives, the mark on the
mint CTA is a **black** note, at TikTok's geometry, with clear space we still cannot quantify
(§10.7). A mint or `currentColor` TikTok note is forbidden under every reading. That is the terms
constraining the design, exactly as the brief anticipated.

## 10.5 An unasked-for finding that lands on the very string in question

> **Widened 2026-08-31 at orchestrator request**, from the strings this finding was *derived* from
> to the full set it is being *applied* to — a ruling that governs live copy changes should
> tabulate what it governs. Sites re-read at commit `1e12008`.

The guidelines carry a usage rule that our copy breaks. It is **item 4 of a 6-item list** on the
archived `/legal` page, under the heading *"The TikTok Brand and Use Guidelines"*, introduced by
*"Here are a few examples of what not to do."*:

> *Do not use any of the TikTok Trademarks **as nouns or verbs** (e.g., instead of "I made a TikTok"
> say "I made a video on the TikTok App")*

### 10.5.1 The test, which outlives the clause

The permitted use is *"in text where it is used **to identify or refer to our platform or
services**"* (§10.2). *"A TikTok"* meaning **a short video** does not refer to the platform — it
uses the trademark to name a **content type**. That is the genericide path (*a xerox*, *a
kleenex*), which is what trademark owners actually defend, and it is why the rule is not arbitrary
house style.

> **The test: does the word point at the platform, or has it become the name of the thing?**

Recorded as a test rather than as a list because a list of forbidden strings goes stale the moment
somebody writes the nineteenth. The test survives — and it survives even if the 2021 clause turns
out to have been revised, because the reason underneath it is trademark law rather than TikTok's
preference.

### 10.5.2 All eighteen shipped strings, judged

`✗` = the trademark is the **noun**, contrary to the guideline. `✓` = **adjectival** (modifying a
real noun) or **nominative** (pointing at the platform) — permitted, and the shape of TikTok's own
examples *"uploaded on TikTok"* / *"follow us on TikTok"*.

| | String | Sites at `1e12008` | Why |
|---|---|---|---|
| ✗ | **`Add a TikTok`** | `paste-screen.tsx:74` · `place-sheet.tsx:1391` · `place-desktop-panel.tsx:171` | Structurally identical to their counter-example *"I made a TikTok"*. **The string the owner asked to brand** |
| ✗ | `Add this TikTok` | `add-sheet.tsx:704` | Demonstrative + noun |
| ✗ | `Open the TikTok` | `import-error-copy.ts:70` | Definite article + noun |
| ✗ | `Read the TikTok` | `use-import-run.ts:280`, `:313` | `:313`'s sibling `Read @handle's TikTok` is the same noun, possessed |
| ✗ | `Reading the TikTok` | `rail-screen.tsx:46` | Mirrored as an annotation in `crumb-path.ts:220` (`state:`), which is not user-facing but must follow the string it names |
| ✗ | `Some TikToks don't share enough for us to work with. It's worth a retry.` | `import-error-copy.ts:159`, `:203` · `no-places-screen.tsx:139`, `:159` | **Four sites, not one.** The clearest case of the seven — see §10.5.3 |
| ✗ | `Nothing left on your list. Paste a TikTok and it starts filling up again.` | `active-area.ts:71` | Article + noun |
| ✓ | `Paste a TikTok link and the place lands on your map…` | `page.tsx:43` · `layout.tsx:78` · `manifest.ts:40` · `opengraph-image.tsx:195` · `place-sheet.tsx:1365` · `profile/page.tsx:180` (variant) | Adjectival — `TikTok` modifies `link` |
| ✓ | `Paste a TikTok link` (field placeholder) | `paste-screen.tsx:92` | Adjectival |
| ✓ | `Paste a TikTok link or search your places` | `add-sheet.tsx:449` | Adjectival |
| ✓ | `Paste a link from TikTok` | `page.tsx:56` | Points at the platform. Closest of the eighteen to *"uploaded on TikTok"* |
| ✓ | `Copy the link in TikTok — Share → Copy link.` | `import-error-copy.ts:40` | *"in TikTok"* is the app |
| ✓ | `Not TikTok` | `import-error-copy.ts:110` | Judged separately, being a bare kicker rather than a sentence: it still names the platform predicatively, which is the permitted use |
| ✓ | `Short TikTok links stop working after a while. Open the post in TikTok and copy the link from there.` | `import-error-copy.ts:149` | **The model — see §10.5.4** |

**Not in the eighteen but caught by the same rule**, recorded so a rewrite does not stop one string
short: `@handle's TikTok` (`rail-screen.tsx:208`, `review-screen.tsx:283`,
`no-places-screen.tsx:213`/`:215`), `This TikTok` (same three files, the else-branch), and
`Read @demo's TikTok` (`dev-screen.ts:205`, a dev fixture).

**No verb use exists anywhere in the product.** Nobody wrote *"TikTok it"*.

### 10.5.3 `Some TikToks` — why the plural is proof of the noun, not a second charge

A second clause looks like it also reaches this string. It does not need to, and **it should not be
cited** — the reasoning here is the finding.

The candidate is the section immediately after the six-item list, *TikTok Name and Logo Style
Guidelines*:

> *All uses of the name "TikTok" must be in the following form. There is no space between "Tik" and
> "Tok". Both letters "T" are upper case and all other letters lower case. Do not modify, abbreviate
> or translate the word "TikTok" into a different language or by using a non-Latin alphabet. **Do
> not modify or abbreviate the brand name or use any variations or phonetic equivalents of the brand
> name (such as "Tiktok", "tiktok", "Tik Tok").***

**Does a plural count as a "variation"? ASSUMED, and on the text it is a weak inference.** Every
enumerated example is a corruption of the **wordmark's own letterform** — `Tiktok` (casing),
`tiktok` (casing), `Tik Tok` (spacing) — and the governing verbs are *modify*, *abbreviate*,
*translate*. The sibling rule on the logo page runs the same way: *"Do not use 'Tik' or 'Tok' by
itself or in combination with another word ('xyzTok' or 'Tikxyz')… because of the dilutive effect."*
Both archived pages were searched for any plural or possessive rule; **there is none.** `TikToks`
preserves T-i-k-T-o-k exactly and adds an inflection — it does not modify, abbreviate, translate,
fragment or re-space the mark. So this clause is not aimed at plurals and is not relied on here.

**And it is not needed, because the plural proves the VERIFIED clause instead of supplementing it.**
You can only pluralise a **count noun**. `TikToks` is grammatically impossible unless "TikTok" has
already stopped naming a platform and started naming a thing you can have several of. Run §10.5.1's
test on it and it answers itself with nothing left ambiguous. **This is the clearest of the seven,
not the hardest.**

**The general rule this is an instance of, kept because it outlives this string: citing an ASSUMED
clause beside a VERIFIED one weakens the VERIFIED one.** A reader who finds one weak link in a chain
of two discounts both. The instinct to pile on supporting reasons is what produces that. Same
discipline as §10.1's refusal to average the logo rule's confidence with this clause's.

### 10.5.4 What the repair looks like

`Short TikTok links stop working after a while. **Open the post in TikTok** and copy the link from
there.` is already the model, and it is almost exactly TikTok's own prescribed fix (*"say 'I made a
video on the TikTok App'"*): adjectival for the link, a real noun for the artefact, and a
platform-reference for the app — twice in one string.

**Every ✗ above becomes compliant by giving the sentence a real noun** — *the post*, *the link*,
*the video* — and letting `TikTok` modify it or name the platform beside it. **The owner's own
phrasing, *"add a TikTok link"*, is already that construction**, which is worth saying plainly: the
compliant form is the one they reached for unprompted.

**The irony is the actual finding.** The owner asked to brand the CTA *more* strongly with TikTok.
On the evidence, that CTA is **already** using the trademark more strongly than the guidelines
permit — as a noun — while the thing the owner wants added, the mark, is the thing that needs
written permission. The two moves point in opposite directions.

**Calibration, honestly.** This is the lowest-stakes finding in the document and it should not be
treated as a ship-blocker. It is brand hygiene of the kind every platform publishes and almost none
enforces; it fights ordinary English; and unlike the logo sentence it has **no live corroboration**
— it exists only in the 2021-03-19 revision (§10.1). Verified that TikTok published it; **not**
verified that it is current. But it is a real sentence in a real document, the fix is three words,
and it happens to sit on precisely the string under discussion — so not reporting it would have been
the wrong call.

**It also conflicts with a ruling this project has already made.** `voice-and-vocabulary.md`'s
vocabulary table ratifies **"a TikTok"** as the product's noun, reasoning *"TikTok is the only
supported source. Naming it is the honest boundary."* That reasoning is good and the guideline does
not touch it — *"Add a TikTok link"* names the boundary just as honestly. **This is a copy decision,
not mine.** It belongs to whoever owns `voice-and-vocabulary.md`; I am recording the conflict, not
resolving it.

## 10.6 The four surfaces, re-ranked, with the CTA first

Superseding §4's table. `MARK` = TikTok's logo, note, icon or any redraw. `WORD` = "TikTok" as text.

| Rank | Surface | MARK | WORD | What is specific to it |
|---|---|---|---|---|
| **1** | **`Add a TikTok` — our action, our chrome, our mint** | **NOT PERMITTED.** Needs prior written permission (§10.2). Also the one surface reached by *"distinctive or prominent feature"* and closest to the brand-identity prohibition (§10.3). If permission arrived, the mark would have to be **black on mint** (§10.4) | **PERMITTED** — *"follow us on TikTok"* is TikTok's own example of a permitted third-party CTA. Recast as adjectival (§10.5) | The highest-exposure placement, but for prominence and confusion, **not** because it is our action |
| **2** | **Paste field glyph — instructional** | **NOT PERMITTED.** Same sentence. No extra clause reaches it | **PERMITTED.** `Paste a TikTok link` is already correct and needs no change | Instruction is the closest thing to *"identify or refer to our platform"*. It is the strongest case for permission — and still needs it |
| **3** | **Source link on a saved place — attribution** | **NOT PERMITTED.** The strongest *argument* (§4), still not the written permission required | **PERMITTED, and required in substance** (§5) | This is the surface that discharges the III.3(n) obligation. It must keep the creator credit and the link back whatever happens to the glyph |
| **4** | **Row glyph — provenance** | **NOT PERMITTED.** Additionally would render below any plausible minimum size, which we cannot check (§10.7) | **PERMITTED**, though attribution is not owed here (§5.3) | Lowest exposure; the mark is smallest and the claim weakest |

**Nothing in §10 changes the MARK column. All four are still no, for the same one sentence.** What
§10 changes is the *reasoning* — the CTA is not forbidden for being a CTA — and it firmly answers
the colour question that was previously open.

## 10.7 What is still UNAVAILABLE

Not everything was recovered, and the gaps are worth naming so nobody assumes §10 closed them:

- **Numeric clear space and minimum size.** The archived pages have the headings — *"Clear Space:
  To maximize visibility and impact, ensure our logo has clear space for it to breathe"*,
  *"Minimum size: Our minimum size ensures our logo is always legible"* — but the **values live in
  page images, not in text**, and the images were not archived. The 32 px / 80 px figures circulating
  on marketing blogs remain **ASSUMED** and unusable (§2.3). Moot while the answer is no; load-bearing
  the moment permission arrives.
- **The current text.** Everything in §10 is the 2021-03-19 revision. The rule is confirmed current
  by the 2026-08-04 Design Guidelines page; the details are not.
- **Whether TikTok would grant permission**, and on what conditions. Unknowable without asking (§7.1).

## 10.8 What the design lane may build on this CTA today

Unchanged in substance from §7, now with the CTA specifically in view and with TikTok's own example
behind it:

1. **Keep the word on the button.** *"follow us on TikTok"* is TikTok's published example of an
   acceptable third-party CTA carrying its name. Ours is the same construction. **The button may say
   TikTok and that is not a concession — it is the permitted use.**
2. **Prefer the adjectival form: `Add a TikTok link`.** Three words, fixes §10.5, and reads more
   precisely — the user is adding a *link*, which is literally what the field takes.
3. **A neutral glyph beside it.** `platform-mark.tsx` already ships one and its reasoning holds. On
   the mint CTA it takes the button's own foreground, which is exactly what a non-trademark glyph is
   free to do and a TikTok note would not be.
4. **Weight, size and placement are entirely ours** — no clear-space or minimum-size rule applies to
   a glyph that is not TikTok's.

**Do not**, on this surface above all: draw TikTok's note in mint or `currentColor`; place a
TikTok-derived shape inside the button; write *"Powered by TikTok"* or *"Official TikTok
integration"* (§3, III.3(o) and X); or use `Tok`/`Tik` as a fragment or coin an `xyzTok` name — the
archived guidelines forbid that explicitly and at length, including the community-coinage form.

## 10.9 Method for this addendum

Six requests to `developers.tiktok.com` / `www.tiktok.com` (Login Kit web docs, Content Sharing
Guidelines, Share Kit product page, and the §9 set), two CDX queries and six object fetches to
`web.archive.org`, plus local inspection of the already-downloaded `logo-pack.zip`. Server-side
curl, no JS execution, no login, no bypass of any gate. Archived JSON was gzip-encoded; each raw
file in `raw/` records its Wayback URL and the sha256 of the archived response body.

Two negative results worth recording so they are not re-run: **the Login Kit web documentation
carries no button design rules at all** — its integration example is literally
`<a href='{SERVER_ENDPOINT_OAUTH}'>Continue with TikTok</a>`, **text with no logo**, which is a
small piece of support for §10.8's recommendation coming from TikTok's own sample code. And
`developers.tiktok.com/docs/en/share-kit-web` is a 404; Share Kit's web equivalent is the Content
Posting API, whose Content Sharing Guidelines govern content posted **to** TikTok and so do not
reach our screens (confirming §3's note that III.3(t) is directional).

One meta-observation that carries weight. The Content Sharing Guidelines show that **when TikTok
wants to dictate a third party's UX it does so publicly and in exhaustive detail** — mandated string
literals (*"By posting, you agree to TikTok's Music Usage Confirmation"*), required default states,
conditions under which a publish button must be disabled. TikTok is not reticent about specifying
third-party interfaces. Its silence on branded-button design in the public developer docs, next to
the one sentence it does publish there, is therefore not an omission. **The rule is "ask us", and
that is the rule.**

---

# 11. Overridden by the owner on 2026-09-03 — the note ships

**The analysis above is not withdrawn and not amended. It is overridden, on scale rather than on
law, and this section records that so the repository does not hold a document its own code
contradicts.**

`src/components/brand/platform-mark.tsx` now draws TikTok's note. Everything §3 and §10.2 establish
remains true: the licence in Developer Terms II.2 reaches only the cases a TikTok product *requires*
the mark, we use neither Login Kit nor Share Kit, and the published sentence — *"You may not use
TikTok logos, icons, symbols, or designs, without our prior written permission"* — reaches a
stylised approximation as squarely as it reaches the mark itself. **We hold no permission. The mark
ships without one.**

## 11.1 Why the owner overrode it

This is a university project with no users, deployed for coursework and due to be taken down within
days of this date. Against that, every permitted alternative this document sanctioned under §7 item
4 — a play triangle, a video card, a portrait frame, a bare triangle — carries only the fact *"this
is a short-form video"*, beside text that already reads `Open on TikTok`. Three of those were drawn,
shipped and rejected in turn (the frame on 2026-09-02, the disc on 2026-09-03, the remaining
candidates on sight). The glyph was never carrying the platform; the words were. The owner judged
that a mark carrying nothing is not worth its place, and that the exposure at this scale does not
justify the alternative.

That is a decision the owner is entitled to make. It is recorded, not re-argued.

## 11.2 What did NOT change, and is now more load-bearing rather than less

- **Neither brand pigment ships.** The note takes `currentColor`. §10.4's measurements stand on
  their own — TikTok cyan is **1.03:1** on the house mint and **1.31:1** on the light ground, and
  the red sits ΔE00 13.4 from the restaurant category — so the two-colour offset treatment is out on
  contrast independently of the terms. `platform-mark.test.ts` still fences both hexes by value
  across `src/`, and that fence must not be removed.
- **§3's prohibitions on meaning are untouched.** The mark still may not imply endorsement,
  verification, or a relationship with TikTok. *"Powered by TikTok"* and *"TikTok Partner"* remain
  barred by III.3(o) and X. The mark is still only ever drawn beside a fact stated in words.
- **III.3(n)'s creator credit remains an obligation.** The `@handle` and the link back ship and must
  not be refactored away. Using the mark makes the attribution more necessary, not less.
- **The mark still lives in exactly one file.** That seam is why this change was one file, and it is
  why the reversal below would be one file.

## 11.3 The condition on which this must be revisited

**If this product acquires users, ships commercially, or outlives the coursework, this section
expires and §3 governs again.** The two honest routes at that point are (a) request written
permission — §10.2 and §11.2 are the analysis such a request would be built on — or (b) return to a
neutral mark. The neutral disc's geometry and its full construction rationale are preserved in the
git history of `platform-mark.tsx` at commit `5adb372` and earlier.

The one thing that must not happen is this section being read as evidence the terms permit the mark.
They do not. They permit asking.
