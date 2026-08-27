# TikTok's own data export as a bulk import source

Investigated 2026-08-27. This mechanism is **absent from `04-tiktok-feasibility.md`'s M1–M11
table** — it was never assessed, because that document asked "can we read an arbitrary public post?"
and this asks a different question: "can the user hand us the list of posts they already saved?"

Two distinct mechanisms sit behind the same archive. They get different labels.

---

## M12 — the user uploads their own export file · **ASSUMED (one cheap experiment from VERIFIED)**

### What the archive contains — VERIFIED from TikTok's own documentation

`https://developers.tiktok.com/doc/data-portability-data-types`, page footer "Last updated August 4,
2026", server-rendered, tag-stripped copy at `raw/03-tiktok-data-portability-data-types.txt`.

Under **Full Archive → Likes and Favourites**, verbatim from the page:

```
Likes and Favourites
  Favorite Hashtags   Date   Hashtag landing page link
  Favorite Effects    Date   Effect landing page link
  Like List           Date   Video landing page link
  Favorite Sounds     Date   Sounds landing page link
  Favourite Videos    Date   Video landing page link
```

**"Favourite Videos" is the bookmark/save list — exactly the corpus charter §2 says the user's
recommendations are trapped in — and every row carries a video landing page link.**

Two caveats that are also VERIFIED from the same page:

1. It is in **Full Archive** only. The narrower `activity` category lists ad interests, searches,
   login history and watch history; the page's Activity table does **not** contain Favourite Videos
   or Like List. Anything that wants favourites gets the whole archive, including DMs, IP addresses
   and TikTok Shop orders.
2. TikTok's own hedge: *"Not all features are available in all regions. If a feature isn't live for
   a user, or a user doesn't have data, then the relevant file may be empty or missing."*

### The file format — ASSUMED, corroborated but not first-party

No real export file was available to this investigation, so this is the one gap. Four unrelated
open-source tools that parse real exports agree (`raw/07-export-json-schema-corroboration.txt`;
GitHub code search returns 484 files containing `FavoriteVideoList`):

```jsonc
// user_data_tiktok.json  (older exports: user_data.json)
{
  "Your Activity": {                       // older: "Activity"; some builds: "Likes and Favorites"
    "Favorite Videos": { "FavoriteVideoList": [ { "Date": "...", "Link": "https://..." } ] },
    "Like List":       { "ItemFavoriteList":  [ { "date": "...", "link": "https://..." } ] }
  }
}
```

Note the **schema drift**: three root-node spellings and two key casings across export vintages. A
parser has to tolerate all of them. `abrignoni/RLEAPP` (a DFIR forensics tool, so its fallbacks are
evidence of real-world variation) handles `Your Activity` / `Activity`, and `link` / `Link`.

### The links are ingestable by our VERIFIED path — **VERIFIED, live, today**

Raw transcript: `raw/01-export-link-form.txt`. Video id `7245648559981350186`, a known-public post
from `docs/evidence/tiktok/urls-set1.txt`.

| Step | Result |
|---|---|
| `GET https://www.tiktokv.com/share/video/<id>/` | `301` → `https://www.tiktok.com/share/video/<id>/` → `301` → `https://www.tiktok.com/@/video/<id>/` → `200` |
| oEmbed with the `www.tiktokv.com` URL | **`400 {"message":"Something went wrong","code":400}`** — the host is rejected |
| oEmbed with `https://www.tiktok.com/share/video/<id>/` | **`200`, full caption in `title`**, 0.30 s |

And here is what our own canonicaliser does with those forms today — measured, not assumed, by
running `canonicaliseTikTokUrl` from a throwaway vitest probe (output appended to
`raw/01-export-link-form.txt`, probe file deleted):

| Input | Today's result | The sentence the user reads |
|---|---|---|
| `www.tiktokv.com/share/video/<id>/` | `UNSUPPORTED_HOST` | "We support TikTok links. Instagram and YouTube aren't supported yet." |
| `www.tiktok.com/share/video/<id>/` | `UNSUPPORTED_URL` | "That's a profile, not a post. Open the specific video and copy its link." |
| `www.tiktok.com/@/video/<id>/` | `ok`, id extracted | — |

**Both of the first two messages are false.** The first tells the user that a link TikTok itself
generated is not a TikTok link. The second tells them a post is a profile, when oEmbed returns its
full caption (row C above). This is a live defect on my own surface, and it exists **whether or not
the export feature is ever built** — anyone who shares a TikTok from certain surfaces gets these
links. It is the highest-value thing in this document that costs almost nothing.

Two further consequences:
1. The fix costs **zero extra network calls**. The numeric id is in the path; the canonicaliser
   already dedups on the id alone (`04` §2). We rewrite locally, we do not follow the redirect.
2. `www.tiktok.com/@/video/<id>/` — the empty-handle form the redirect lands on — is already
   VERIFIED accepted by oEmbed (`04` §2 step 5).

### ToS — permitted, and the analysis is short

Verbatim ROW terms at `raw/05-tiktok-tos-row-prohibited-conduct.txt`. The only clause in the
prohibited-conduct list that could bite is:

> use automated scripts to collect information from or otherwise interact with the Services;

The user requesting their own export is a human using the TikTok app. We never touch the export
pipeline. What we do afterwards — one oEmbed call per link — is **the same M1 mechanism `04` §6
already cleared**, only at higher volume. There is no *new* ToS question here, only a *volume*
question, and `04` E5 VERIFIED no throttling at 40 sequential and 30 concurrent requests from one
IP with no `429` and no `retry-after`.

Independently, GDPR Art. 20 gives the user the right to receive their data in a machine-readable
format and transmit it to another controller. That is the right this feature exercises.

### It does not violate charter §2

Charter §2 forbids *"asking the user to copy any text out of TikTok"* — the caption. This asks for
none. The user exports a file; the captions still come from oEmbed, as they do today. The charter
constraint is about who does the reading, and we still do it.

### What it would buy the user

The whole reason this is worth writing down: **one action takes the user from 0 places to their
entire back-catalogue of saved TikToks.** Not 20 pastes — one file. This is the only mechanism found
in this investigation that changes the *shape* of the cold-start problem rather than shaving seconds
off it.

### What it would cost us, honestly

| Cost | Detail |
|---|---|
| **Latency before value** | The user requests the export inside TikTok and waits. Consumer-side preparation time is **not verified** — TikTok's support page is client-rendered and returned no text to a server-side fetch (12.9 KB JS shell). Reports range from minutes to days. The download link expires; the DP API doc says four days for its equivalent. This is the feature's real weakness: it is not an onboarding step, it is a "come back later" step. |
| **The archive is a PII bomb** | Full Archive includes DMs, IP addresses, login history, purchase history. **Mitigation, and it is a good one: parse the file in the browser and upload only the extracted link list.** The archive never reaches our server. Vercel's request body limit is **4.5 MB** (`vercel.com/docs/functions/limitations`, last updated 2026-08-24) and a full archive routinely exceeds it, so client-side parsing is forced anyway — the privacy win is free. This is a strong paragraph for the M9 security document rather than a liability in it. |
| **Parser tolerance** | Three root spellings, two key casings, ZIP-or-JSON, and TikTok can change it without notice. The failure mode is graceful (empty list → the honest no-places screen), but it needs real specimens to test against, and we have none. |
| **Volume against the Gemini ceiling** | See `03-batch-and-alternatives.md`. A 400-favourite back-catalogue is 400 uncached Gemini calls against a 500/day hard ceiling. The export makes the ceiling the binding constraint for the first time. |
| **Build** | Client-side ZIP/JSON parse + link extraction; the canonicaliser change above; a batch queue. The canonicaliser change is hours. The batch queue is the same machinery `L0-F6` already owes. |

### How to move it to VERIFIED — one experiment, ~zero engineering

The owner requests their own TikTok export (Profile → Settings → Account → Download your data →
**JSON**), and we inspect the file: does `Favorite Videos` exist, what is the root node called, what
is the `Link` host, how many entries, how big is the file, and how long did it take to arrive. That
single artefact converts every ASSUMED row above. **Nothing should be built until it exists.**

---

## M13 — TikTok's Data Portability API · **UNAVAILABLE for this project**

Raw: `raw/04-tiktok-data-portability-get-started.txt`.

TikTok publishes eight `portability.*` OAuth scopes. Favourites live in the full archive, so the
only scope that reaches them is **`portability.all.single`** / `.ongoing` — everything, DMs included.

Why it is UNAVAILABLE here, from TikTok's own page:

- Three separate approvals are required — **Data Portability API scopes, Login Kit, and Webhooks** —
  and *"the API is not usable until both are approved."*
- *"You can typically expect to hear back within 3-4 weeks."*
- The application requires *"Screenshots of detailed UX mockups showing the user flow for your app's
  use case."*
- Webhooks require a stable public callback URL.

For a graded student project on a fixed schedule, a 3–4 week review of a three-product application,
whose narrowest viable scope is *the user's entire TikTok archive including direct messages*, is not
a dependency any plan should take. It is also strictly worse than M12 for our purpose: M12 gets the
same data with no approval, no OAuth, and no DMs crossing our infrastructure.

Label it **UNAVAILABLE (approval-gated and disproportionate)**, not "not possible" — the distinction
matters if this project ever stops being a student project.
