# Security ruling — the TikTok embed popover (`i6-embed`)

> Task `i6-embed-privacy`, dispatched by the orchestrator 2026-08-31. Rules on
> `docs/evidence/tiktok/10-embed-playback-2026-08-31.md` (base commit `2fae46b`, HEAD at ruling time
> `2f2ddb7`, evidence commit `476674d` confirmed an ancestor of HEAD) and the owner's trigger ruling
> already landed in `docs/iteration-6-plan.md` §6.2 (commit `04af0ee`, 2026-08-31): **a small glyph
> button on the thumbnail, clicked — not hover, not autoplay-on-scroll, not mount-with-the-card.**
> This document does not re-litigate either. It rules on what `10` §6 point 7 and `6.2`'s closing
> paragraph both explicitly routed here: the residual disclosure, and whether it needs to be said out
> loud.

---

## 0. The ruling in one line

**Conditional permit, not a veto and not a green light.** Build it on the Embed Player, click-gated
exactly as the owner ruled. **But a bare click is not sufficient by itself** — the first click in a
browser must be an *informed* choice with a genuine no-cost refusal, not merely a deliberate one, and
that requirement is load-bearing enough that shipping without it re-opens the veto. Sections 1–5
below answer the orchestrator's five questions in order; §6 is the acceptance criteria a Build agent
can be checked against; §7 is what must change elsewhere before this ships.

---

## 1. Is click-gated mounting sufficient?

**No — necessary, not sufficient.** This is not a disagreement with the owner's ruling; it's the
question the owner's own ruling explicitly deferred (`6.2`, last paragraph).

Click-gating solves exactly one problem: it converts an *ambient* disclosure (every list row leaks on
a mouse pass) into a *triggered* one (only a deliberate press leaks). That is real and correct — it is
the same reasoning already live at `place-sheet.tsx:999` for the thumbnail's `referrerPolicy`, applied
correctly one level up. **It does not touch the disclosure itself.** Per `10` §4.1–§4.2, the press
still, unconditionally: sets a persistent `SameSite=None` TikTok cookie (1yr blockquote / 180d Embed
Player) and loads the ~224KB fingerprint SDK, before the video plays and before the user has any
indication either happened. A user who presses a button captioned "Play" has consented to *seeing the
video*. Nothing in that press discloses that TikTok also receives a durable, cross-site identifier and
runs device fingerprinting the instant the button is pressed. **An uninformed click is a smaller
version of the same problem an accidental hover is — a disclosure the user did not knowingly make —
just gated behind one more piece of intent than hover required.** Click-gating is the right shape and
should ship; it is not, alone, the fix.

---

## 2. Does the user need to be told? — Yes, and it must be a real, refusable choice, not a notice

**This is an obligation, not a nicety, for three independent reasons:**

1. **Proportionality to the surface.** `docs/security.md` §10 states the product's own privacy thesis
   plainly: *"a compromised account discloses where a person intends to go, which is a materially
   worse outcome than a leaked list of bookmarks."* The embed popover sits on exactly that surface —
   the place sheet, the rail, the review screen — the same rows `security.md` §7.2 already treats
   thumbnail referrer leakage as worth a dedicated mitigation for. A device-fingerprint SDK is a
   larger disclosure than a `Referer` header by an order of magnitude, on the same surface that
   mitigation was built to protect.
2. **It is a materially new category, not a bigger version of an existing one.** Every other
   TikTok-facing request this product makes today (`security.md` §7.2, R-8) is a signed, anonymous CDN
   image fetch with no cookie and no script execution. This is the product's first line of code that
   hands TikTok a persistent, cross-site-linkable identifier and runs a third party's code in a page
   that also renders the user's saved places. That crosses a line `security.md` drew on purpose, not
   incidentally — see §4 below.
3. **Consent law, not just product ethics.** `10` §4.2 records, verbatim, that TikTok's own blockquote
   loader ships `data-dangerously-disable-cookie-banner="true"` — TikTok's own naming admits that
   showing consent UI for this exact cookie-plus-fingerprint activity is the thing being suppressed,
   not the exception. That flag exists because TikTok anticipated needing consent for this. Disabling
   it does not remove the requirement to obtain consent; it moves the obligation onto whoever embeds
   it — us. Under the EU ePrivacy framework (Art. 5(3) + GDPR where the cookie functions as an
   identifier), a non-essential, cross-site-trackable cookie set by a third party through our page
   generally needs **prior, freely-given, specific, informed, unambiguous consent**, with a refusal
   option that is not disguised or penalised. I am not a lawyer and label this **ASSUMED**, not
   VERIFIED — but it is the ordinary, well-known shape of that rule, not a novel reading, and
   `06`'s already-recorded note that this product's web surface is public despite the owner's own test
   IP being Israeli means EU visitors are a live population, not a hypothetical one.

**What satisfies all three, and what does not:**

- **Does not satisfy it:** a button captioned only "Play," a first-run toast the user can miss, a
  tooltip, or copy that discloses the cost *after* the mount has already happened. Consent obtained
  after the fact is not consent.
- **Does satisfy it:** the disclosure and the trigger are the same interaction. The first time a given
  browser presses the glyph, present two co-equal actions — approximately *"Play here"* (proceeds,
  discloses in adjacent copy that this loads TikTok's player and shares a TikTok cookie/device signal)
  and *"Open on TikTok instead"* (the zero-disclosure path that already ships, §5) — with **neither
  styled as the default and neither behind extra clicks relative to the other**. Record the user's
  choice **client-side only** (e.g. `localStorage`, our own domain — never a TikTok-set value) so it
  is asked once per browser, not once per press. A user who chooses "Open on TikTok" that first time
  must trigger nothing beyond what already exists today (a new-tab link) — no cookie, no SDK, no
  network request to a TikTok document.
- **Persistence granularity:** client-side per-browser is the minimum bar and needs no migration or
  schema change. A server-side, per-account preference (so the choice follows a user across devices)
  is a nicety a Build agent may add later; it is not a condition of this ruling.
- **Wording is out of my lane.** `voice-and-vocabulary.md` binds this copy and `product-lead`/the
  owner write it. I am specifying the **obligation** — informed, prior, two co-equal options, no
  default bias, persisted client-side — not the sentence.

---

## 3. Sandboxing and containment — honest about what is theatre and what is not

Available `<iframe>` attributes, and what each actually buys against the measured disclosure in `10`
§4:

| Attribute | What it does | Reaches the measured disclosure? |
|---|---|---|
| `referrerpolicy="no-referrer"` | Suppresses the `Referer` header on the iframe's own top-level navigation | **No new leak stopped beyond one header.** `10` §4.5 already established this generalises the thumbnail mitigation's exact limit — the cookie is set by the *response*, not carried by the referrer, and the SDK loads from *inside* TikTok's own document afterward. Free, real, and worth setting regardless — but do not present it as a mitigation of the cookie or the SDK. |
| `sandbox` with **no** `allow-same-origin` | Forces the framed document into a unique, opaque origin with no access to `tiktok.com`'s real cookie jar or storage | **Would genuinely stop the cookie and most of the fingerprint SDK's storage use.** But TikTok's player needs its own origin's cookies/storage to authenticate the signed CDN request and run at all — this is very likely to **break playback outright**, not degrade gracefully. Untested by this document (§8 of `10` — no browser available); treat as **UNAVAILABLE**, not as a viable mitigation, until someone confirms in a real browser whether the player still functions. |
| `sandbox="allow-scripts allow-same-origin …"` (the combination a functioning player requires) | Lets the framed document run script **as its real origin** | **Reaches nothing.** Granting `allow-same-origin` is precisely what lets the document read/write `tiktok.com`'s actual cookie jar — it is the mechanism the disclosure depends on, not a boundary against it. Restrict everything else freely (below), but do not count this combination as containment. |
| Omit `allow-popups`, `allow-top-navigation`, `allow-forms`, `allow-modals` from the sandbox list | Blocks the iframe from opening windows, navigating our page away, submitting forms, or raising native dialogs | **Does not reach the cookie/SDK disclosure**, but is real, free, correct hardening against a different risk class (clickjacking / forced navigation from a third-party document we chose to embed) and costs nothing functionally. **Do this regardless of the rest of this ruling.** |
| `credentialless` | Loads the iframe in an ephemeral, storage-partitioned context — no cookies in or out, no shared storage | **The one attribute that could genuinely reach the cookie half of the disclosure.** Per the current spec and MDN/caniuse, this is a Chromium feature, **limited availability, not Baseline** — Safari and Firefox support is not established as of this ruling. Even where supported, it stops the *cookie and storage* channel only; the fingerprint SDK still loads, still executes, and non-cookie signals (screen/canvas/timing fingerprinting) are untouched. **Label: mechanism VERIFIED to exist; cross-browser reliability and functional impact on the player UNAVAILABLE without testing.** Worth adding as defence-in-depth where supported, never as the basis for calling the disclosure closed. |
| A `frame-src` CSP directive naming `https://www.tiktok.com` explicitly | Makes the embed an audited, explicit allow-list entry rather than an implicit permission | Reaches nothing in `10` §4 either, but is the same discipline this product already applies to outbound TikTok hosts (`canonicalise-tiktok-url.ts`'s six-host `Set`) and costs nothing. **Do this regardless.** The current CSP (`next.config.ts:40`) is `frame-ancestors 'none'` only — it says nothing about what *we* may embed, so this is a pure addition, not a loosening. |

**Bottom line for §3: sandbox and referrer hardening are worth doing unconditionally — they close a
different, real risk (clickjacking, forced navigation, header leakage) at zero cost — but none of them
is a substitute for §2's consent gate.** The cookie and the fingerprint SDK are not incidental
behaviour a stricter attribute suppresses; they are what TikTok's player is contractually built to do
the moment it is allowed to run at all. The only attribute that reaches part of it (`credentialless`)
is experimental and only closes the storage half, not the SDK-execution half. Say this plainly rather
than let a sandbox line item read as "mitigated."

---

## 4. Does this change the product's own privacy story? — Yes, and the record needs to say so before this ships

`docs/security.md` currently makes a **specific, narrower** claim than the one this feature would
leave standing:

- §7.2: *"Third-party images are hot-linked with `referrerPolicy="no-referrer"` … the residue —
  TikTok's CDN sees the user's IP address — is risk R-8."*
- §11, R-8: *"TikTok's CDN sees our users' IP addresses. … a request is still made from the user's
  browser to TikTok"* — framed as the **entire** TikTok exposure surface, IP-only, no cookie, no
  script execution, no third-party identifier.
- §10 (Location privacy) states the product's own thesis: the association between a person and the
  venues they chose is *"the personal fact,"* and a compromised account discloses *"where a person
  intends to go."*

**This feature makes R-8's framing incomplete, not wrong as of when it was written.** Shipping the
embed without touching `security.md` leaves a security document that is internally consistent at the
commit it names and silently false at the commit that ships this feature — exactly the failure mode
`working-agreement.md` warns about ("a ruling that permits the feature and silently falsifies an
existing promise is worse than a veto"). **Condition of this ruling, not optional:** before this
ships, `security.md` needs a new risk entry (the natural slot is a new **R-9**, distinct from R-8 —
different mechanism, different magnitude, different mitigation) recording the cookie, the SDK, the
consent gate from §2, and the fact that it is user-triggered rather than ambient. That is a doc edit
inside `security.md`'s own ownership, not this file's write scope, and it is not mine to make here —
naming it as a condition is.

No user-facing privacy-policy page exists yet in this repo (confirmed by grep — the only "privacy
policy" hits in `docs/` are third-party ToS quotes and evidence captures, not our own copy), so there
is no external promise to falsify today. That will not stay true once one is written, and whoever
writes it should treat this feature as already scoped in, not discover it later.

---

## 5. Is the added value worth the added exposure? — My judgement, on the record

**Only under the §2 consent gate. Not as a bare click.**

The zero-disclosure alternative (`Open on TikTok`, a plain new-tab link) already ships and fully
serves the underlying need — the user watches the video, on TikTok's own surface, at zero cost to this
product's privacy posture. What in-place playback buys over that is convenience: no context switch,
no losing your place in the list. That is a real product value, not a nothing — but it is a
convenience value, weighed against handing a third party a durable cross-device-linkable identifier
plus device fingerprinting, on a surface this product's own threat model (`security.md` §10) names as
the one that matters most.

**My ruling:** that trade is worth making *when the person paying the cost is the one who chose to,
knowingly, with a real no-cost alternative in the same interaction.* It is not worth making by default,
silently, behind a button that only says "play." The owner asked for in-place playback and is entitled
to have it — gated the way §2 specifies, it ships. Ungated, it does not, and the veto in §0 stands
against that shape specifically.

---

## 6. Acceptance criteria — testable, for whoever builds and whoever reviews

Ship only if all of the following hold. Each is independently checkable without executing TikTok's JS
— static inspection of the shipped component and a `curl`/devtools check of the mount request is
enough for most of these:

1. Mount is triggered **only** by a click/tap on the dedicated glyph affordance. No `onMouseEnter`,
   no intersection-observer autoplay, no mount tied to the card or row rendering. (Owner-ruled
   already, `04af0ee`; restated here as a hard acceptance line.)
2. **First press in a given browser** shows two co-equal actions before any TikTok request fires:
   proceed-and-play (which discloses, in copy the click sits next to, that this loads TikTok's player
   and shares a cookie/device signal with TikTok) and open-on-TikTok-instead (which fires zero TikTok
   requests beyond what already ships). Neither is visually or functionally the default; neither costs
   an extra click relative to the other.
3. Choosing "open on TikTok instead" on that first press results in **zero** additional network
   requests to any `tiktok.com`/`tiktokcdn.com` host beyond the existing thumbnail fetch — verified by
   a network panel, not inferred from code.
4. The choice is persisted client-side (this origin's storage, not a TikTok-set value) so it is asked
   at most once per browser, not on every subsequent press.
5. Built on the Embed Player (`/player/v1/{id}`), not the oEmbed blockquote — per `10` §1.2 and
   `04af0ee`.
6. `referrerpolicy="no-referrer"` set on the iframe.
7. `sandbox` set with `allow-scripts allow-same-origin` (required for the player to function) plus
   whatever `allow` values fullscreen needs, and **explicitly omitting** `allow-popups`,
   `allow-top-navigation`, `allow-forms`, `allow-modals`.
8. A `frame-src` (or `child-src` if that's what the eventual CSP nonce work lands on) entry naming the
   TikTok embed host explicitly, rather than relying on the absence of a directive.
9. This product's own creator handle / caption / `Open on TikTok` link continues to render alongside
   the player rather than depending on the Embed Player's `description=1&music_info=1` defaults (per
   `10` §5 — the III.3(n) attribution point, not this document's primary concern but a condition of
   the same shipment).
10. `docs/security.md` carries the new risk entry from §4 above **in the same PR**, not as a follow-up.

If 1–4 and 10 are not all true, the veto in §0 applies to that shipment regardless of what §5–9 look
like. 5–9 are hardening; 1–4 and 10 are the gate.

---

## 7. What would change this ruling

- A real-browser confirmation that `credentialless` works across Chrome/Safari/Firefox for this
  specific player without breaking playback would let it replace part of §2's manual consent copy with
  a technical control — worth re-opening this document if someone runs that test.
- Written permission from TikTok (mooting `09`'s trademark gate entirely) does not change anything in
  this document — this ruling is about disclosure to TikTok, not about the mark.
- A published, user-facing privacy policy changes §4 from "nothing to falsify yet" to "an explicit
  promise to keep consistent" — whoever writes that page should read this document first.

**Author:** `security-privacy`. Base evidence commit `476674d`, ruling written against HEAD `2f2ddb7`
on `no-crumbs-implementation`. No source files touched; no commit made by this agent.
