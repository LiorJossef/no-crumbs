# E10 — May No Crumbs embed a playable TikTok preview, and what does it cost?

> **Task `i6-embed`, requested by the orchestrator 2026-08-31**, ahead of a design lane wanting a
> popover card on TikTok thumbnails that plays the embedded video in place.
> Retrieved 2026-08-31T18:47–20:53Z from a server-side Node/curl context (macOS, client IP the
> owner's residential IL ISP). No browser, no JS execution — same method as
> [`09-brand-mark-and-attribution-2026-08-31.md`](09-brand-mark-and-attribution-2026-08-31.md)
> (**§9** there), which this document assumes as read and does not re-litigate.
> Base commit `2fae46b`. Nine requests to TikTok-controlled hosts; raw artefacts and sha256s in
> [`raw/`](raw/), indexed in §9 below.

**Read `09` first if you have not.** It already ruled: no TikTok logo/icon/glyph without written
permission, on any surface we draw or redraw ourselves. This document does not reopen that. It asks
a narrower, different question — what happens when TikTok's *own* code renders TikTok's *own* player,
inside an iframe we did not draw — and the answer to that question is not the same shape as `09`'s.

---

## 0. The ruling in one block

| Question | Answer | Label |
|---|---|---|
| May we embed a TikTok video at all? | **Yes.** Two separate, documented, keyless TikTok Developer Services exist for exactly this: the **oEmbed → blockquote → `embed.js`** path (already quoted in `09` §6, unused today) and the **Embed Player** (`www.tiktok.com/player/v1/{id}`), a purpose-built iframe API | **VERIFIED** |
| Does the embed carry TikTok's mark, and does that resolve or create a trademark problem? | **Resolves it.** Both mechanisms render TikTok's own logo *inside TikTok's own hosted iframe*, which we never touch, redraw, or possess as an asset. `09` §2.1's licence clause (`II.2`) is conditioned on exactly this — "the Developer Services **include or require** the use or display of the TikTok Logo" — and an embed is TikTok's second such product after the Login Kit button `09` already identified. This is the one place their mark may legitimately appear on our surface | **VERIFIED as to the mechanism, ASSUMED as to the legal conclusion** (same status `09` §1 gives its own reasoning) |
| Can it autoplay? | **Only muted, and not guaranteed.** `autoplay=1` and `muted=1` are documented Embed Player query params. TikTok's own error taxonomy has a dedicated code, `AUTOPLAY_ERROR` (3002) — *"Video/audio fails to autoplay due to browser security policies"* — i.e. TikTok itself expects unmuted autoplay to be blocked by the browser and designed a failure path for it | **VERIFIED** (documented params + error code); **ASSUMED** that muted autoplay succeeds in practice (standard browser policy, not independently browser-tested by us — see §8) |
| Can it play on hover? | **Yes, but only through the postMessage control API (`play`/`pause`), not a URL flag** — and mounting the iframe to be hover-ready is itself the disclosure event, whether or not hover ever fires. See §3 and the tension in §4 | **VERIFIED** mechanism; **the privacy consequence is the finding, not a detail** |
| Does it work at popover size? | **The legacy blockquote path enforces `min-width:325px` (≈578 px tall at 9:16) — too tall for a compact card.** The Embed Player has **no documented minimum**, and TikTok's own published code sample embeds at **400×300** — smaller and a different aspect ratio than the video itself, which TikTok's own example tolerates | **VERIFIED** (both figures are primary-source, one from our own 16 real oEmbed captures, one from TikTok's docs); exact minimum before UI chrome breaks is **UNAVAILABLE** without a real browser (§8) |
| What does it cost — network, cookies, page weight? | **More than the owner's mental model of "an iframe and a video file."** Merely mounting *either* embed mechanism — before any click, before any play — sets a persistent, cross-site-trackable cookie, loads a ~220 KB ByteDance device-fingerprint SDK, and (blockquote path only) explicitly **disables TikTok's own cookie-consent banner**. See §4 — this is measured, not inferred | **VERIFIED** |
| Does it discharge the `09` §5 attribution obligation? | **Yes for the blockquote path** (creator, caption+tags, music, link-back are baked into the HTML TikTok returns). **No by default for the Embed Player** — `description` and `music_info` both default to `0`; you must explicitly turn them on | **VERIFIED** |
| Does this match what the owner described? | **Only in a narrower shape.** "A popover that can play the video" is buildable. "Hover to preview, silently" is not free — hovering must trigger the same disclosure a click would. See §6 for the recommended shape | — |

**One-line answer:** build it on the **Embed Player**, gate mounting behind an explicit click (not
hover), default to `muted=1&autoplay=1&controls=1`, and tell the owner plainly that this adds a new
category of TikTok tracking to the product the moment the card is opened — a decision this document
routes to the owner and `security-privacy`, not one it makes.

---

## 1. Two embed mechanisms, and which one is the popover

### 1.1 The oEmbed blockquote path (already in hand, unused)

`09` §6 already quoted the mechanism: the `html` field in our own oEmbed responses is a
`<blockquote class="tiktok-embed" ...>` plus `<script async src="https://www.tiktok.com/embed.js">`.
We call oEmbed today (`src/integrations/tiktok/oembed-source-adapter.ts`) but the schema explicitly
does not model `html` — `oembed-schema.ts:7`: *"(`html`, `provider_name`, `width`/`height`, ...) is
not modelled at all, since nothing here [renders it]"* — **VERIFIED by code inspection**.

**Confirmed against our own 16 real captures**, not just the docs page: every one of the 16 posts in
`oembed-set1-raw.json` returns the identical inline style and script tag —
`max-width:605px; min-width:325px;` and `<script async src="https://www.tiktok.com/embed.js">`,
zero variance across 16 distinct creators. **VERIFIED.**

### 1.2 The Embed Player (a separate product, not previously evaluated by this project)

`developers.tiktok.com/docs/en/embed-player`, last updated **August 4, 2026** (same date as `09`'s
Design Guidelines and Embed Videos pages — actively maintained). Verbatim, in full, in
[`raw/10-embed-player-doc-verbatim-2026-08-31.txt`](raw/10-embed-player-doc-verbatim-2026-08-31.txt).
The opening line is the whole shape of it:

> *"This embedded player consists of a TikTok post hosted inside of an inline frame (iframe)
> element. This player allows you to: Customize the player by appending query parameters in the
> iframe URL … Control the player by messaging the HTML host to enable functionality like playing,
> pausing, muting, and more."*

URL form: `www.tiktok.com/player/v1/{tiktok_post_id}` — the numeric ID already sitting in every
resolved TikTok URL this product handles today
(`src/integrations/tiktok/resolve-short-link.ts:29`'s `VIDEO_ID_IN_PATH` capture group). **No new
resolution work is needed to get the ID this API wants.**

**This is the mechanism that matches "a popover card that can play the video."** The blockquote path
is a static, TikTok-styled card with a "view more" affordance, not a controllable player. The rest of
this document evaluates the Embed Player unless stated otherwise.

---

## 2. The permission question, and the trademark case it resolves

`09` ruled, categorically: no TikTok logo/icon/glyph on any surface we draw or redraw, absent written
permission, because `II.2`'s licence is conditional on *"the Developer Services **include or require**
the use or display of the TikTok Logo"* and we use neither Login Kit nor Share Kit — the two products
`09` §2.4 identified as the canonical case that condition is written for.

**An embed is a second instance of that exact condition, not an exception to `09`'s rule.** The Embed
Player and Embed Videos are both listed on `developers.tiktok.com` under **Content Display / Embed**
— they are TikTok Developer Services in the same sense Login Kit is, and both *require* the TikTok
logo to render: it is baked into the iframe document TikTok serves, the same way "Continue with
TikTok" is baked into the Login Kit button asset. We do not draw it, redraw it, recolour it, resize
it, or possess a file of it — we set an `iframe src` and TikTok's own servers render TikTok's own
mark inside TikTok's own document, on TikTok's own domain. **This is precisely the shape `09` §2.1
describes as licensed, and it is the only shape on this product's four surfaces (`09` §4) that
qualifies.**

This confirms the orchestrator's instinct stated in the task brief. It is not a new legal reading —
it is `09`'s own conditional grant applied to the second product that satisfies its condition, not a
new argument invented for this document. **Still ASSUMED as a legal conclusion**, exactly as `09` §1
flags its own reasoning; nothing here raises or lowers that confidence, it only extends the same
reasoning to a second case.

**What this does not license:** using the Embed Player does not retroactively permit a TikTok mark
anywhere else. `09`'s four-surface table (CTA, paste field, source link, row glyph) is untouched —
none of those are TikTok's own rendered document, so none of them qualify under `II.2`. A "preview"
affordance that triggers the Embed Player is fine; a hand-drawn TikTok note glyph on the affordance
that opens it is still not, per `09`.

---

## 3. Playback semantics: autoplay, muted, hover

Verbatim from the Embed Player doc's parameter table (`raw/10-embed-player-doc-verbatim-2026-08-31.txt`):

| Param | Meaning | Default |
|---|---|---|
| `autoplay` | *"1: Automatically play the video when the player loads. 0: Do not start playing automatically"* | **0** |
| `muted` | *"1: Set the default volume to 0 and prevent the user from changing the volume. 0: Enable volume controls"* | **0** |
| `controls`, `progress_bar`, `play_button`, `volume_control`, `fullscreen_button`, `timestamp`, `native_context_menu`, `closed_caption` | display toggles for player chrome | all default **1** |
| `loop` | repeat playback | default **0** |

**Autoplay is real but conditional, and TikTok says so itself.** The doc's own error table includes:

> *"3002 AUTOPLAY_ERROR — Video/audio fails to autoplay due to browser security policies"*

That is TikTok naming, in its own error taxonomy, the exact failure mode every browser vendor
documents: unmuted autoplay is blocked without a user gesture; **muted** autoplay is generally
permitted. So `autoplay=1&muted=1` is the combination TikTok's own docs and the web platform's
general autoplay policy both point to as the one likely to work — **ASSUMED**, because confirming it
in a real browser is outside this method (§8), but it is the standard, well-documented autoplay
policy shared by Chromium, WebKit and Firefox, not a TikTok-specific guess.

**Hover-to-play is achievable, but not as a URL flag.** The mechanism is the documented
`postMessage` control channel — `play`, `pause`, `seekTo`, `mute`, `unMute`, `navigateTo` sent host→
player after the player emits `onPlayerReady` (full interface, verbatim, in the raw file). A hover
handler that posts `play`/`pause` on enter/leave is a legitimate, documented use of that API — TikTok
built it for exactly this kind of host-driven control. **This is not a workaround; it is the
supported mechanism the docs name for "control the player… like playing, pausing, muting."**

**The tension the orchestrator flagged is real and it lands here.** To be hover-ready, the iframe
must already be **mounted** — `src` set, document loaded, TikTok's own JS running — before the mouse
ever enters. §4 shows that mounting is the disclosure event, not playing. So "hover to preview" and
"click to preview" cost TikTok exactly the same disclosure; the only difference hover buys is that it
fires on accidental mouse movement across a list, not on deliberate intent. That is the finding
against building it on hover, not a detail against building it at all.

---

## 4. What mounting the embed loads and reports — measured, not inferred

This is the section the orchestrator asked to be quantified rather than softened. Both paths were
fetched directly (headers and bodies in `raw/`) and inspected statically — no JS was executed, so
this is what a **document load** discloses; anything triggered by client-side script *after* it runs
(XHR/fetch calls made once the React bundle executes) is invisible to this method and is named as a
gap in §8, not glossed over.

### 4.1 Cookies — set on document load, before any click

| Path | Cookie | Attributes | What it is |
|---|---|---|---|
| `GET https://www.tiktok.com/embed/v2/{id}` (the blockquote's target) | `ttwid=…` | `Domain=.tiktok.com; Expires=+1 year; HttpOnly; SameSite=None; Secure` | A **persistent, cross-site-readable** first-party TikTok cookie. `SameSite=None` is the explicit marker for "usable in a third-party/embedded context" |
| `GET https://www.tiktok.com/player/v1/{id}` (Embed Player, no query params) | `tt_chain_token=…` | `Domain=.tiktok.com; Max-Age=15552000` (180 days) `; HttpOnly; Secure; SameSite=None` | TikTok's own "chain token" — used for cross-surface attribution. Also long-lived, also `SameSite=None` |

**Both cookies are set on a bare `GET` of the document — no video played, no button clicked.** Full
response headers in
[`raw/10-embedv2-response-headers-2026-08-31.txt`](raw/10-embedv2-response-headers-2026-08-31.txt) and
[`raw/10-player-v1-response-headers-2026-08-31.txt`](raw/10-player-v1-response-headers-2026-08-31.txt).

### 4.2 Scripts loaded on mount

Both documents pull in, before rendering anything: TikTok's *tiktok_privacy_protection_framework*
loader, a **`webmssdk.js`** build (ByteDance's device-fingerprint / risk-signal SDK — 224,360 bytes,
measured), and telemetry (Slardar performance/crash reporting on both; the Embed Player additionally
loads `tea.pre.js`, TikTok's own analytics SDK, and a `log-sdk/collect` analytics collector — visible
because that shell is smaller and less minified). Full script lists:
[`raw/10-embedv2-video-and-script-tags-2026-08-31.txt`](raw/10-embedv2-video-and-script-tags-2026-08-31.txt),
[`raw/10-player-v1-script-tags-2026-08-31.txt`](raw/10-player-v1-script-tags-2026-08-31.txt).

**On the blockquote path specifically, the fingerprint/analytics loader is served with:**

```
data-dangerously-disable-cookie-banner="true"
```

verbatim, in the `<script>` tag's own attributes — **VERIFIED by direct inspection of the HTML
TikTok returned.** TikTok's naming of that flag (`dangerously-disable`) is itself an admission that
suppressing consent UI is not the default, safe path. The user embedding it in a third-party page
never sees any TikTok consent surface for the cookie/fingerprint activity in §4.1.

### 4.3 Page weight

Measured, not estimated (all figures in
[`raw/10-script-payload-sizes-2026-08-31.txt`](raw/10-script-payload-sizes-2026-08-31.txt)):

- Blockquote path: 328 KB of server-rendered HTML, plus a **2.39 MB** main embed application bundle
  (`tiktok-embed.module.*.js`), plus the 224 KB fingerprint SDK, before the video itself.
- Embed Player: a 39.9 KB HTML shell, but it declares 22 further `<script>` tags — a full React
  application (`lib-react.js` alone is 143 KB), the fingerprint SDK, and three telemetry SDKs.

**Neither mechanism is "an iframe and a video file."** Both are TikTok's full web client, loaded
inside our page, as the precondition for showing anything.

### 4.4 The blockquote path also starts fetching video bytes on mount, unconditionally

`GET /embed/v2/{id}` server-renders two `<video>` elements directly into the HTML — a blurred
background loop (`muted` attribute) and the primary player (`preload="auto"`), both with a live,
signed `v16m.tiktokcdn.com` MP4 URL already resolved server-side (full tag text in
[`raw/10-embedv2-video-and-script-tags-2026-08-31.txt`](raw/10-embedv2-video-and-script-tags-2026-08-31.txt)).
`preload="auto"` instructs the browser to begin buffering the moment the document parses — **there is
no `autoplay` query param on this legacy path at all; the browser starts requesting bytes from
TikTok's CDN on mount regardless.** The Embed Player, being a client-rendered app, does not expose an
equivalent server-baked `<video>` tag in its static shell — but whether its client JS defers the same
request until `onPlayerReady`/an explicit `play` is **UNAVAILABLE** without executing it (§8). This is
one more reason to prefer the Embed Player over the blockquote path if this ships at all: it is not
provably better, but it is not provably worse, and the blockquote path is provably bad on this point.

### 4.5 Why the existing `referrerPolicy="no-referrer"` mitigation does not reach any of this

`place-sheet.tsx:999`, `:1931`, `rail-screen.tsx:185`, `review-screen.tsx:255` all set
`referrerPolicy="no-referrer"` on TikTok thumbnail `<img>` tags specifically so the browser does not
hand TikTok's CDN the URL of the page a user is viewing. That mechanism suppresses exactly one thing:
the `Referer` header on that one image request. An `<iframe>` has the same attribute
(`referrerPolicy` / the HTML `referrerpolicy` attribute), and setting it would suppress the `Referer`
header on the iframe's own top-level navigation — worth doing regardless. **But it reaches nothing
else in §4.1–§4.4**: the cookie is set by the response to that navigation request itself (headers,
not something a referrer policy touches), the fingerprint SDK is loaded by TikTok's own document
after it loads (a resource our attribute has no jurisdiction over), and any request the iframe's own
JS makes afterwards is governed by *TikTok's* referrer policy, not ours. The mitigation that keeps the
thumbnail privacy-neutral has no equivalent-strength counterpart for an embed. Recorded so it is not
proposed as "we'll just do what we did for thumbnails" — that pattern does not transfer.

---

## 5. Attribution — does the embed discharge the `09` §5 obligation

`09` §5.1 established the obligation (Developer Terms `III.3(n)`) and TikTok's own definition of
proper attribution — *"creator, video description and background sound … links back to the
corresponding content on TikTok"* (Embed Videos page, quoted in `09`).

- **Blockquote path: yes, unconditionally.** The `html` TikTok returns already contains the
  creator's `@handle` link, the caption with hashtag links, and the music/sound link, all rendered by
  TikTok — this is literally the mechanism `09` §6 called TikTok's *"preferred attribution
  mechanism."*
- **Embed Player: no, by default.** `description` (video description) and `music_info` both default
  to `0` per §3's table — a bare `<iframe src="…/player/v1/{id}">` with no query string shows neither.
  Whether the creator's handle appears regardless (as part of fixed chrome, independent of these two
  toggles) could not be confirmed statically — the player's actual UI is assembled by the lazy-loaded
  React bundle in §4.3, not present in the static shell. **UNAVAILABLE without a browser (§8).**

**Consequence for the design lane, stated plainly:** if the Embed Player is used, either pass
`description=1&music_info=1` explicitly, or keep this product's own existing caption / `@handle` /
`Open TikTok` link rendered alongside the player rather than depending on undocumented default chrome
to discharge `III.3(n)`.

---

## 6. Recommendation

**Permitted:** yes, with the Embed Player, gated behind an explicit action.
**Not free:** every mount is a real disclosure event, quantified in §4, that this product currently
does not make anywhere else.

1. **Use the Embed Player (`/player/v1/{id}`), not the oEmbed blockquote.** Full param and postMessage
   control, no forced 325 px minimum, and no server-baked `preload="auto"` video fetch on mount.
2. **Mount on an explicit click, never on hover.** Hovering a list of rows is ordinary browsing
   behaviour; mounting on hover means TikTok learns "this device looked at post X" on every accidental
   pass of the cursor, for the same cost as a deliberate click. This is the direct descendant of the
   reasoning already in `place-sheet.tsx:999` — just applied to a much larger disclosure than a
   thumbnail `<img>` ever was.
3. **Default params: `autoplay=1&muted=1&controls=1`.** This is the documented, browser-policy-aligned
   combination for "plays without a click, does not need sound permission." Full unmuted playback
   still needs the user's own tap on the player's volume control — normal, expected behaviour for any
   embedded video, not a regression.
4. **Size close to TikTok's own 400×300 sample**, adjusted toward the video's actual 9:16 aspect
   (something in the 300×420–325×480 range is a reasonable starting point) — **but confirm the exact
   floor in a real browser before committing to a number**; this document could not (§8).
5. **Keep this product's own creator/caption/link-back rendering** next to or beneath the player
   rather than relying on `description=1&music_info=1` alone, per §5.
6. **Set `referrerpolicy="no-referrer"` on the iframe regardless** — it is free, it stops one real
   leak (our page URL in the `Referer` header on the iframe's own navigation), and it does not
   conflict with anything TikTok requires.
7. **This is a decision for the owner and `security-privacy`, not a green light from this document.**
   Every popover open adds a persistent cross-site TikTok cookie and a device-fingerprint SDK load to
   a session that currently sends TikTok nothing but signed, anonymous CDN image requests. That is a
   materially different privacy posture, on a product whose only other TikTok-facing surfaces were
   deliberately built to avoid exactly this kind of disclosure. `security-privacy` should rule on
   whether that trade needs a setting, a first-open notice, or nothing beyond an honest changelog line
   — not this document, whose job was to make the trade legible with numbers.

**If the owner wants zero added disclosure instead:** the nearest compliant shape already exists and
ships today — `Open TikTok`, a plain link to the canonical post URL, opened in a new tab. That is the
option with no new cookie, no fingerprint SDK, and no page-weight cost, at the price of leaving the
product without in-place playback.

---

## 7. What this document does not answer

- Whether `security-privacy` judges the disclosure in §4 acceptable, and under what conditions
  (consent copy, a setting, GDPR/ePrivacy exposure for EU visitors given `06`'s note that this
  product's residential test IP is Israeli but the web surface is public) — **explicitly out of scope
  for this document**, same posture `09` §8 took on its own out-of-lane findings.
- Whether the Embed Player's client JS, once it actually executes, makes additional network calls
  beyond what its static shell declares (§8).
- The real minimum popover size before TikTok's own control-row UI visually breaks (§8).

---

## 8. What could not be established, and why

**Method constraint, same as `09`: no browser, no JS execution.** Everything above is what a
document *load* discloses — response headers, `<script src>` tags, and server-rendered markup. Once
TikTok's own JavaScript actually runs in a browser, it can make further `fetch`/`XHR` calls, mutate
the DOM, and resize the iframe via `postMessage` — none of that is visible to a static curl fetch, and
none of it was executed here, on the same principle `09` §9 states: *"no browser, no JS execution, no
scraping of protected surfaces and no bot-protection bypass."*

Consequences, named rather than glossed:

- **Whether muted autoplay actually plays in Chrome/Safari/Firefox inside a cross-origin iframe** is
  ASSUMED from general, well-documented browser autoplay policy, not independently confirmed against
  this specific player.
- **The real minimum popover width/height** before the player's own control row visually breaks is
  UNAVAILABLE. TikTok's 400×300 sample is evidence the iframe has no hard technical floor, not
  evidence of a visual one.
- **The Embed Player's full runtime network footprint** (calls made after its React bundle executes)
  is UNAVAILABLE; only its declared `<script>` tags and two set cookies were measured.
- **Whether the creator's handle renders by default** in the Embed Player absent `description=1` is
  UNAVAILABLE (§5).

**What would close these gaps:** a real-browser spot check — load the Embed Player at a candidate
popover size, in each of Chrome/Safari/Firefox, with `autoplay=1&muted=1`, and record the network
panel. That is qualitatively different work from this document's method and belongs to whoever builds
the component, verified the way `working-agreement.md` requires — run it, inspect it, say what was
verified.

---

## 9. Method and raw artefacts

Nine requests to TikTok-controlled hosts, server-side curl, desktop UA, no auth, no cookies sent on
any request (a clean-slate client each time). No JS execution, no scraping of protected/gated
surfaces, no bot-protection bypass — consistent with `09` §9's method and within this task's 10-call
cap.

| # | Request | Purpose |
|---|---|---|
| 1 | `GET https://www.tiktok.com/embed.js` | Confirm the loader script and its redirect target |
| 2 | `GET` the redirected `embed_v1.0.13.js` | Inspect the blockquote-mount loader logic |
| 3 | `GET https://www.tiktok.com/embed/v2/{id}` | The document `embed.js` mounts — headers, cookies, `<video>`/`<script>` tags |
| 4 | `GET https://www.tiktok.com/player/v1/{id}` (no params) | Embed Player default document — headers, cookies, `<script>` tags |
| 5 | `GET` `webmssdk.js` | Measure the fingerprint SDK's byte size |
| 6 | `GET` `tiktok-embed.module.*.js` | Measure the blockquote path's main bundle size |
| 7 | `GET` `lib-react.*.js` | Measure one Embed Player bundle chunk |
| 8 | `GET https://developers.tiktok.com/doc/embed-player` | 302 → confirmed canonical doc path |
| 9 | `GET https://developers.tiktok.com/docs/en/embed-player` | Verbatim Embed Player documentation |

**Raw artefacts** (all in [`raw/`](raw/), all new to this task):
[`10-embedjs-redirect-headers-2026-08-31.txt`](raw/10-embedjs-redirect-headers-2026-08-31.txt) ·
[`10-embedv2-response-headers-2026-08-31.txt`](raw/10-embedv2-response-headers-2026-08-31.txt) ·
[`10-embedv2-video-and-script-tags-2026-08-31.txt`](raw/10-embedv2-video-and-script-tags-2026-08-31.txt) ·
[`10-player-v1-response-headers-2026-08-31.txt`](raw/10-player-v1-response-headers-2026-08-31.txt) ·
[`10-player-v1-script-tags-2026-08-31.txt`](raw/10-player-v1-script-tags-2026-08-31.txt) ·
[`10-embed-player-doc-verbatim-2026-08-31.txt`](raw/10-embed-player-doc-verbatim-2026-08-31.txt) ·
[`10-script-payload-sizes-2026-08-31.txt`](raw/10-script-payload-sizes-2026-08-31.txt) — sha256 of
every fetched body is recorded inline in that last file and in the headers files' accompanying
commands.

**What would overturn or extend this ruling:** a real-browser confirmation of §8's open items; TikTok
changing either endpoint's cookie/SDK behaviour (both docs pages are dated 2026-08-04, recent);
written permission from TikTok that would make `09`'s refused surfaces moot as well, at which point
this document's §2 becomes redundant rather than load-bearing.
