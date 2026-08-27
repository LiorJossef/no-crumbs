# Web Share Target — is `mvp-plan.md` §8's "Not anywhere" still right?

Investigated 2026-08-27. Raw: `raw/02-web-share-target.txt`.

## Verdict: **UNAVAILABLE on iOS. The placement is correct — keep it in "Not anywhere".**

`02-risks-and-unknowns.md` §D4 already said *"Web Share Target is Chrome/Android only"*, and
`product-specification.md` §8 cut it on that basis. **That call was right and it is still right in
August 2026.** Three independent machine-readable sources:

### 1. MDN browser-compat-data, `manifests/webapp/share_target.json`

Fetched from `main` at repo HEAD `b6e8a03804` (2026-08-27T13:07:30Z):

```
chrome           89          safari       false  (webkit.org/b/194593)
chrome_android   76          safari_ios   "mirror"  → false
opera_android    63          webview_ios  "mirror"  → false
firefox          false       webview_android false
```

### 2. WebKit's own source — the decisive one

`Source/WebCore/Modules/applicationmanifest/ApplicationManifestParser.cpp`, `main`, fetched today:

```
$ grep -ic share ApplicationManifestParser.cpp
0
```

The members WebKit parses are `categories, description, dir, display, icons, id, lang, name,
orientation, scope, short_name, shortcuts, start_url` — and nothing else. **WebKit's manifest parser
does not know the `share_target` member exists.** On iOS every browser is WebKit, so this is not
"Safari lags"; it is "iOS cannot do this at all."

### 3. WebKit standards-positions

Issue #11, "Web Share Target API": position **`neutral`**. Not opposed — but neutral since filing,
with no implementation. There is no signal of movement to design around.

## What this means for us

Our user is mobile-first and this project's owner is on iOS. Share-target would deliver the flow to
Android only, which makes it a *second* import path we would have to build, test and support at both
breakpoints, benefiting a fraction of users.

More importantly, **it solves the wrong problem.** Share-target saves the app-switch and the paste —
call it three seconds per link. The charter's cliff is *twenty links*. Removing three seconds twenty
times does not get a new user to a useful library; it makes an already-tolerable action slightly more
pleasant. It is a polish item wearing an adoption item's clothes.

## The iOS Shortcuts alternative — **ASSUMED, and I recommend against it**

iOS can put a user-installed Shortcut ("Receive URLs from Share Sheet" → "Open URL") into the share
sheet, which would open our `/import` with the link pre-filled. This is real, free, and needs no App
Store. Untested here — I have no iOS device in this environment, so **ASSUMED**.

Recommend against regardless: it requires the user to install and trust a third-party automation
before their first import, which is worse onboarding friction than the thing it removes, and it
would need its own support surface. If it is ever wanted, it is an L3 convenience, not an adoption
mechanism.

## Recommended change to `mvp-plan.md` §8

**None.** "PWA share-target" stays under **Not anywhere**, and this document is now the evidence
behind that line rather than an inherited assumption. If anything, add the reason: *not deferred for
schedule — unavailable on the platform our user is on.*
