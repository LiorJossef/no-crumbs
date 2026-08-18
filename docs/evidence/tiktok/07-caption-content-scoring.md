# E7 — Does the caption actually contain extractable places? (VERIFIED, small sample)
Date: 2026-08-18 · Source: `oembed-set1-raw.json`

Retrieval is not the same as usefulness. All 16 captions were retrieved successfully; the question
is how many name a place an LLM + geocoder could resolve. Hand-labelled below.

| # | id | @handle | ch | Caption content | Named place in caption? |
|---|---|---|---|---|---|
| 1 | 7245648559981350186 | briancantstopeating | 203 | "6 Must try spots in Tokyo Japan!" | **NO** — city only, the 6 spots are in-video |
| 2 | 7220925199297039662 | nom_life | 488 | "our full list of #tokyorestaurant recs!" | **NO** — city only, list is in-video |
| 3 | 7290074173500706079 | petsmeowwoof | 53 | cats, control | NO (not a place post) |
| 4 | 7402198592712215841 | panosliceapp | 429 | app promo, control | NO (not a place post) |
| 5 | 7508758330035195158 | theyoushouldknowpodcast | 27 | 2 hashtags only, control | NO (not a place post) |
| 6 | 7448327861636943150 | marielleisrael | 92 | "Drop cafe recs below pls #telaviv #aroma" | WEAK — city + a chain hashtag |
| 7 | 7496222617053990175 | muchmorethanmatcha | 121 | "Cafe Fiori 📍 Yom Tov St 20, Tel Aviv-Yafo" | **YES** — name + street + city |
| 8 | 7494360070369709354 | yallabikestlv | 108 | "The best coffee in Tel Aviv is only 9 shekels?!" | **NO** — name (Simhovich) is in-video only |
| 9 | 7395598157620497696 | travel.by.ann | 543 | "Nomena Roasters, placed on Allenby Street in Tel Aviv" | **YES** — name + street + city |
| 10 | 7325134418991942945 | zachmargs | 198 | "POV: You try to order coffee in Tel Aviv" | NO — comedy, city only |
| 11 | 7323274629865295137 | joiceglobal | 82 | repost of #10 | NO |
| 12 | 7347722826654305578 | alexandramoulavi | 73 | "coffee in tlv >" + Hebrew hashtags | **NO** — name (Nomena) in-video only |
| 13 | 7081307157660241157 | ysabellahazan | 83 | "Tel Aviv🇮🇱 >" | NO — city only |
| 14 | 7205629856716000517 | gadderhq | 127 | "What's the best hidden gem restaurant in London?" | NO — question post |
| 15 | 7346702347491446049 | exploringlondon | 1229 | 8 restaurants w/ neighbourhoods: La Nonna/Brixton, MBER/Pudding Lane, The Life Goddess, The Laughing Yak/Peckham, Sycamore/Covent Garden, Tokii/Marylebone, Kiaans/Tooting, Jones Family Kitchen/Belgravia | **YES x8** — the ideal case |
| 16 | 7541775954906041622 | emshelx | 455 | "my Italian friend told me not to make a tiktok about **this london restaurant**" | **NO — deliberately withheld**, SEO keyword salad only |

## Score
- Retrieval success: **16/16 (100%)**
- Posts that are genuine place recommendations: 11 (#1,2,6,7,8,9,10,12,13,14,15,16 minus non-recs) -> 11
- Of those, caption names a resolvable place: **3/11 ≈ 27%** (#7, #9, #15)
- City-only, place unnamed in text: **6/11** (#1,2,8,12,13,16 — and #10 comedy)
- Named-place yield counted per *place*: 10 places from 3 posts vs 0 from 8 posts.

## The finding that matters
Two posts (#8 @yallabikestlv, #12 @alexandramoulavi) demonstrably recommend a *specific named venue*
(Simhovich Cafe; Nomena Café) that is spoken/on-screen in the video and **absent from the caption**.
Post #16 actively withholds the name to drive comments. Post #1 and #2 are "list" videos whose whole
value is in-video. This is a content-structure property of TikTok, not a retrieval gap: creators put
names on screen because that is what the algorithm rewards.

## Sample bias, stated honestly
These 16 URLs were found via web search, so they skew toward indexed/high-reach posts. The direction
of bias on caption-completeness is unknown. A 27% hit rate from n=11 has a wide confidence interval.
**This must be re-measured on the project owner's labelled set of real saved TikToks** — that is the
only sample whose distribution matches the actual product.
